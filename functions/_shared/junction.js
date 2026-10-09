/* Junction reaches Garmin for Planet Creator, since Garmin's own developer program takes no new apps. Junction keeps what
 * Garmin sends, and Planet Creator reads one week from it when asked and stores nothing itself. Each connection is its own
 * Junction user, named only in an encrypted HttpOnly cookie. That user is deleted on Disconnect, on a Garmin connection
 * error (api/garmin/webhook.js), and by the hourly sweep (workers/junction-sweep) once it is RETENTION_DAYS old. */
import { ConfigurationError } from './strava-auth.js';

export const RETENTION_DAYS = 30;
export const DAY_S = 24 * 60 * 60;
const UNCONNECTED_S = 60 * 60; // a user made for a Garmin consent page nobody finished
const COOKIE_PATH = '/api/garmin';
const CONNECTION_COOKIE = 'pc_garmin';
const STATE_COOKIE = 'pc_garmin_state';
const STATE_MAX_AGE = 30 * 60; // Garmin's sign-in can stop to email a code, so the consent page gets half an hour
const WEBHOOK_TOLERANCE_S = 5 * 60;
const LIST_BYTES = 2 * 1024 * 1024;
const STREAM_BYTES = 8 * 1024 * 1024;
// a team key's prefix names its environment and region (docs.junction.com/api-details/junction-api)
const BASES = {
  pk_us: 'https://api.us.junction.com',
  pk_eu: 'https://api.eu.junction.com',
  sk_us: 'https://api.sandbox.us.junction.com',
  sk_eu: 'https://api.sandbox.eu.junction.com',
};
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const encoder = new TextEncoder();

export class JunctionError extends Error {
  constructor(status = 0) {
    super('Junction request failed');
    this.status = status;
  }
}
export class InvalidGarminCookieError extends Error {}
export class BodyLimitError extends Error {}

function secret(env, name) {
  const value = String(env?.[name] ?? '').trim();
  if (!value) throw new ConfigurationError(`${name} is not configured`);
  return value;
}

function apiKey(env) {
  const key = secret(env, 'JUNCTION_API_KEY');
  if (!/^(pk|sk)_(us|eu)_[\x21-\x7e]+$/.test(key)) throw new ConfigurationError('JUNCTION_API_KEY is not a Junction team key');
  return key;
}

// JUNCTION_API_BASE points the Functions at a local stand-in; it is never set in production
function apiBase(env) {
  const base = String(env?.JUNCTION_API_BASE ?? '').trim() || BASES[apiKey(env).slice(0, 5)];
  let url;
  try {
    url = new URL(base);
  } catch {
    throw new ConfigurationError('JUNCTION_API_BASE is not a URL');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new ConfigurationError('JUNCTION_API_BASE must use HTTP');
  return url.origin;
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64ToBytes(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) return null;
  const plain = value.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  if (plain.length % 4 === 1) return null;
  try {
    return Uint8Array.from(atob(plain.padEnd(Math.ceil(plain.length / 4) * 4, '=')), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function cookieKeyBytes(env) {
  const encoded = secret(env, 'JUNCTION_COOKIE_KEY');
  const bytes = /^[0-9a-f]{64}$/i.test(encoded)
    ? Uint8Array.from(encoded.match(/../g), (pair) => Number.parseInt(pair, 16))
    : base64ToBytes(encoded);
  if (bytes?.length !== 32) throw new ConfigurationError('JUNCTION_COOKIE_KEY must encode 32 bytes');
  return bytes;
}

function webhookKeyBytes(env) {
  const value = secret(env, 'JUNCTION_WEBHOOK_SECRET');
  const bytes = value.startsWith('whsec_') ? base64ToBytes(value.slice(6)) : null;
  if (!bytes?.length) throw new ConfigurationError('JUNCTION_WEBHOOK_SECRET must be the whsec_ signing secret');
  return bytes;
}

/** Whether the three private values a Garmin connection needs are present: until they are, make/ offers no Garmin. */
export function junctionConfigured(env) {
  try {
    apiBase(env);
    cookieKeyBytes(env);
    webhookKeyBytes(env);
    return true;
  } catch (error) {
    if (error instanceof ConfigurationError) return false;
    throw error;
  }
}

/* ---------------------------------------------------------------- cookies */

async function cookieKey(env) {
  return crypto.subtle.importKey('raw', cookieKeyBytes(env), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

// AES-GCM with the cookie's name and format version as associated data, so one cookie can't stand in for the other
async function seal(env, label, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(label) }, await cookieKey(env),
    encoder.encode(JSON.stringify(value)));
  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(sealed))}`;
}

async function unseal(env, label, value) {
  const [version, ivPart, dataPart, extra] = String(value).split('.');
  const iv = base64ToBytes(ivPart);
  const data = base64ToBytes(dataPart);
  if (version !== 'v1' || extra != null || iv?.length !== 12 || !(data?.length > 16)) throw new InvalidGarminCookieError();
  const key = await cookieKey(env); // a ConfigurationError is not a bad cookie
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(label) }, key, data);
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    throw new InvalidGarminCookieError();
  }
}

function cookieValue(request, name) {
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const equals = part.indexOf('=');
    if (equals >= 0 && part.slice(0, equals).trim() === name) return part.slice(equals + 1).trim();
  }
  return null;
}

const cookie = (name, value, maxAge) => `${name}=${value}; Max-Age=${maxAge}; Path=${COOKIE_PATH}; HttpOnly; Secure; SameSite=Lax`;
const clearCookie = (name) => `${name}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=${COOKIE_PATH}; HttpOnly; Secure; SameSite=Lax`;
const nowSeconds = () => Math.floor(Date.now() / 1000);

/** The connection: the Junction user's ID and when it was made. It lives no longer than the user does. */
export async function connectionCookie(env, userId, createdAt) {
  const maxAge = Math.max(0, createdAt + RETENTION_DAYS * DAY_S - nowSeconds());
  return cookie(CONNECTION_COOKIE, await seal(env, `${CONNECTION_COOKIE}:v1`, { userId, createdAt }), maxAge);
}

export async function connectionFromRequest(request, env) {
  const value = cookieValue(request, CONNECTION_COOKIE);
  if (value == null) return null;
  const connection = await unseal(env, `${CONNECTION_COOKIE}:v1`, value);
  if (!UUID.test(connection?.userId ?? '') || !Number.isSafeInteger(connection?.createdAt)
      || connection.createdAt + RETENTION_DAYS * DAY_S <= nowSeconds()) {
    throw new InvalidGarminCookieError();
  }
  return { userId: connection.userId, createdAt: connection.createdAt };
}

export const clearConnectionCookie = () => clearCookie(CONNECTION_COOKIE);

/** The check that the visitor coming back from Garmin is the one who left, and the Junction user made for them. */
export async function stateCookie(env, state, userId, createdAt) {
  return cookie(STATE_COOKIE, await seal(env, `${STATE_COOKIE}:v1`, { state, userId, createdAt }), STATE_MAX_AGE);
}

export async function stateFromRequest(request, env) {
  const value = cookieValue(request, STATE_COOKIE);
  if (value == null) return null;
  try {
    const pending = await unseal(env, `${STATE_COOKIE}:v1`, value);
    return UUID.test(pending?.userId ?? '') && typeof pending.state === 'string' && Number.isSafeInteger(pending.createdAt) ? pending : null;
  } catch (error) {
    if (error instanceof InvalidGarminCookieError) return null;
    throw error;
  }
}

export const clearStateCookie = () => clearCookie(STATE_COOKIE);

/* -------------------------------------------------------------- bodies */

/** A body read to text, refused past maxBytes (and past a shared budget's limit, when one is passed). */
export async function boundedText(body, headers, maxBytes, budget = null) {
  if (Number(headers.get('Content-Length')) > maxBytes) {
    await body?.cancel().catch(() => {});
    throw new BodyLimitError();
  }
  if (!body) return '';
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (budget) budget.bytes += value.byteLength;
    if (bytes > maxBytes || (budget && budget.bytes > budget.limit)) {
      await reader.cancel().catch(() => {});
      throw new BodyLimitError();
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/* ------------------------------------------------------------- the API */

async function call(env, method, path, { query, body, linkToken, maxBytes = LIST_BYTES, budget = null } = {}) {
  const url = new URL(path, apiBase(env));
  for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, String(value));
  const headers = { Accept: 'application/json' };
  // the OAuth link endpoint takes the one-time link token in place of the team key
  if (linkToken) headers['x-vital-link-token'] = linkToken;
  else headers['x-vital-api-key'] = apiKey(env);
  if (body) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new JunctionError();
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new JunctionError(response.status);
  }
  try {
    const text = await boundedText(response.body, response.headers, maxBytes, budget);
    return text ? JSON.parse(text) : null;
  } catch {
    throw new JunctionError(502);
  }
}

/** A Junction user for one connection. Its ingestion_end has Junction stop collecting at the retention date on its own,
 * and pause the connection a week later, even if a sweep were missed (docs: wearables/providers/data-ingestion-bounds). */
export async function createUser(env, now = Date.now()) {
  const ingestionEnd = new Date(now + RETENTION_DAYS * DAY_S * 1000).toISOString().slice(0, 10);
  const user = await call(env, 'POST', '/v2/user', { body: { client_user_id: crypto.randomUUID(), ingestion_end: ingestionEnd } });
  if (!UUID.test(user?.user_id ?? '')) throw new JunctionError(502);
  return user.user_id;
}

/** Garmin's own consent page for this user: a link token made for Garmin, then that token's OAuth link. Junction sends
 * the visitor back to redirectUrl with state=success or state=error&error_type=… added to it. */
export async function garminConsentUrl(env, userId, redirectUrl) {
  const token = await call(env, 'POST', '/v2/link/token', { body: { user_id: userId, provider: 'garmin', redirect_url: redirectUrl } });
  if (typeof token?.link_token !== 'string' || !token.link_token) throw new JunctionError(502);
  const source = await call(env, 'GET', '/v2/link/provider/oauth/garmin', { linkToken: token.link_token });
  let url;
  try {
    url = new URL(source?.oauth_url);
  } catch {
    throw new JunctionError(502);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new JunctionError(502);
  return url.href;
}

/** Delete the user: Junction deregisters its Garmin connection at once and erases its data after a 7-day grace period
 * (docs: api-reference/user/delete-user). An already-deleted user counts as deleted. */
export async function deleteUser(env, userId) {
  if (!UUID.test(userId ?? '')) return;
  try {
    await call(env, 'DELETE', `/v2/user/${userId}`);
  } catch (error) {
    if (!(error instanceof JunctionError && error.status === 404)) throw error;
  }
}

/** The Garmin workouts that started inside [after, before), epoch seconds. Junction reads its dates loosely, so this asks
 * for a day either side and keeps the exact local week here. */
export async function weekWorkouts(env, userId, after, before) {
  const day = (seconds) => new Date(seconds * 1000).toISOString().slice(0, 10);
  const body = await call(env, 'GET', `/v2/summary/workouts/${userId}`, {
    query: { provider: 'garmin', start_date: day(after - DAY_S), end_date: day(before + DAY_S) },
  });
  if (!Array.isArray(body?.workouts)) throw new JunctionError(502);
  return body.workouts.filter((workout) => {
    const start = Date.parse(workout?.time_start) / 1000;
    return workout?.source?.provider === 'garmin' && start >= after && start < before;
  });
}

/** One workout's samples (time, lat, lng, altitude, heartrate, cadence, temperature…), or null when it has none. */
export async function workoutStream(env, workoutId, budget) {
  try {
    return await call(env, 'GET', `/v2/timeseries/workouts/${workoutId}/stream`, { maxBytes: STREAM_BYTES, budget });
  } catch (error) {
    if (error instanceof JunctionError && error.status === 404) return null;
    throw error;
  }
}

/** The model of the device that recorded a workout, for the "Garmin [device model]" line; null when Junction can't say. */
export async function deviceModel(env, userId, deviceId) {
  try {
    const device = await call(env, 'GET', `/v2/user/${userId}/device/${deviceId}`);
    return typeof device?.device_model === 'string' ? device.device_model : null;
  } catch (error) {
    if (error instanceof JunctionError) return null;
    throw error;
  }
}

/** Delete every user of the team that is RETENTION_DAYS old, or an hour old with no connection. The team is Planet
 * Creator's alone, so every user in it is one of these. */
export async function sweep(env, now = Date.now()) {
  const users = [];
  for (let offset = 0; ; offset += 500) {
    const page = await call(env, 'GET', '/v2/user', { query: { offset, limit: 500 } });
    if (!Array.isArray(page?.users)) throw new JunctionError(502);
    users.push(...page.users);
    if (!page.users.length || users.length >= Number(page.total)) break;
  }
  let deleted = 0;
  for (const user of users) {
    const age = (now - Date.parse(user?.created_on)) / 1000;
    const connected = Array.isArray(user?.connected_sources) && user.connected_sources.length > 0;
    if (age >= RETENTION_DAYS * DAY_S || (!connected && age >= UNCONNECTED_S)) {
      await deleteUser(env, user.user_id);
      deleted++;
    }
  }
  return { users: users.length, deleted };
}

/** Whether the user's Garmin connection still stands: 'connected', 'broken' (an error state, or no Garmin connection at
 * all, as after a disconnect in Garmin Connect) or 'gone' (no such user any more). */
export async function garminConnection(env, userId) {
  let body;
  try {
    body = await call(env, 'GET', `/v2/user/providers/${userId}`);
  } catch (error) {
    if (error instanceof JunctionError && error.status === 404) return 'gone';
    throw error;
  }
  const garmin = (Array.isArray(body?.providers) ? body.providers : []).find((provider) => provider?.slug === 'garmin');
  return garmin?.status === 'connected' ? 'connected' : 'broken';
}

/* ------------------------------------------------------------ webhooks */

/** Junction signs its webhooks with Svix: an HMAC-SHA256 of "id.timestamp.body" under the whsec_ secret, sent as
 * space-separated "v1,<base64>" signatures (docs.svix.com/receiving/verifying-payloads/how-manual). */
export async function verifyWebhook(env, headers, body, now = Date.now()) {
  const id = headers.get('svix-id');
  const timestamp = headers.get('svix-timestamp');
  const signatures = headers.get('svix-signature');
  if (!id || !signatures || !/^\d{1,12}$/.test(timestamp ?? '')) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > WEBHOOK_TOLERANCE_S) return false;
  const key = await crypto.subtle.importKey('raw', webhookKeyBytes(env), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const signed = encoder.encode(`${id}.${timestamp}.${body}`);
  for (const entry of signatures.split(' ')) {
    const [version, signature] = entry.split(',');
    const bytes = version === 'v1' ? base64ToBytes(signature) : null;
    if (bytes?.length === 32 && await crypto.subtle.verify('HMAC', key, bytes, signed)) return true;
  }
  return false;
}

if (import.meta.main) {
  // Svix's own example signature (docs.svix.com/receiving/verifying-payloads/how-manual), then a changed body, a
  // timestamp outside the five minutes, and a wrong secret: a webhook check that let any of them through would let anyone
  // delete connections. The secrets are split so secret scanners don't take these two public fixtures for live keys.
  const env = { JUNCTION_WEBHOOK_SECRET: 'whsec_' + 'plJ3nmyCDGBKInavdOK15jsl' };
  const body = '{"event_type":"ping","data":{"success":true}}';
  const headers = new Headers({ 'svix-id': 'msg_loFOjxBNrRLzqYUf', 'svix-timestamp': '1731705121', 'svix-signature': 'v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=' });
  const at = 1731705121 * 1000;
  const results = [
    await verifyWebhook(env, headers, body, at),
    !(await verifyWebhook(env, headers, body.replace('true', 'false'), at)),
    !(await verifyWebhook(env, headers, body, at + 301 * 1000)),
    !(await verifyWebhook({ JUNCTION_WEBHOOK_SECRET: 'whsec_' + 'MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw' }, headers, body, at)),
  ];
  if (results.some((ok) => !ok)) throw new Error(`webhook signature check failed: ${results}`);
  console.log('junction webhook signatures ok');
}

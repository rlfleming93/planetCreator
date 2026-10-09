const TOKEN_COOKIE = 'pc_strava';
const STATE_COOKIE = 'pc_strava_state';
const COOKIE_PATH = '/api/strava';
const TOKEN_MAX_AGE = 30 * 24 * 60 * 60;
const PRODUCTION_ORIGIN = 'https://planet.fleming.run';
const DEFAULT_OAUTH_BASE = 'https://www.strava.com/oauth';
const DEFAULT_API_BASE = 'https://www.strava.com/api/v3';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const REQUIRED_SCOPES = Object.freeze(['read', 'activity:read_all']);

export class ConfigurationError extends Error {}
export class InvalidStravaCookieError extends Error {}
export class StravaUpstreamError extends Error {
  constructor(status = 0) {
    super('Strava request failed');
    this.status = status;
  }
}

function envString(env, name) {
  const value = env?.[name];
  if (value == null || String(value).trim() === '') throw new ConfigurationError(`${name} is not configured`);
  return String(value).trim();
}

function clientId(env) {
  const value = envString(env, 'STRAVA_CLIENT_ID');
  if (!/^[1-9]\d{0,18}$/.test(value)) throw new ConfigurationError('STRAVA_CLIENT_ID must be a positive integer');
  return value;
}

function configuredBase(env, name, fallback) {
  const raw = String(env?.[name] || fallback).trim().replace(/\/+$/, '');
  let url;
  try {
    url = new URL(`${raw}/`);
  } catch {
    throw new ConfigurationError(`${name} is not a URL`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new ConfigurationError(`${name} must use HTTP`);
  return url.toString();
}

function endpoint(base, path) {
  if (!/^[a-z0-9_/-]+$/i.test(path) || path.startsWith('/')) throw new Error('Invalid Strava endpoint path');
  return new URL(path, base).toString();
}

export function stravaOAuthUrl(env, path) {
  return endpoint(configuredBase(env, 'STRAVA_OAUTH_BASE', DEFAULT_OAUTH_BASE), path);
}

export function stravaApiUrl(env, path) {
  return endpoint(configuredBase(env, 'STRAVA_API_BASE', DEFAULT_API_BASE), path);
}

export function siteOrigin(env) {
  const raw = String(env?.SITE_ORIGIN || PRODUCTION_ORIGIN).trim();
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigurationError('SITE_ORIGIN is not a URL');
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password
      || (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) {
    throw new ConfigurationError('SITE_ORIGIN must be an HTTP origin');
  }
  return url.origin;
}

export function hasExpectedOrigin(request, env) {
  return request.headers.get('Origin') === siteOrigin(env);
}

export function privateResponse(body = null, { status = 200, headers } = {}) {
  const outputHeaders = new Headers(headers);
  outputHeaders.set('Cache-Control', 'private, no-store');
  return new Response(body, { status, headers: outputHeaders });
}

export function jsonResponse(value, { status = 200, headers } = {}) {
  const outputHeaders = new Headers(headers);
  outputHeaders.set('Content-Type', 'application/json; charset=utf-8');
  return privateResponse(JSON.stringify(value), { status, headers: outputHeaders });
}

export function methodNotAllowed(allowed) {
  return jsonResponse({ error: `Use ${allowed}.` }, { status: 405, headers: { Allow: allowed } });
}

function bytesToBase64Url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value) {
  if (typeof value !== 'string' || !value || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) throw new Error('Invalid base64');
  const unpadded = value.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  if (unpadded.length % 4 === 1) throw new Error('Invalid base64');
  let binary;
  try {
    binary = atob(unpadded.padEnd(Math.ceil(unpadded.length / 4) * 4, '='));
  } catch {
    throw new Error('Invalid base64');
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function cookieKeyBytes(env) {
  const encoded = envString(env, 'STRAVA_COOKIE_KEY');
  let bytes;
  if (/^[0-9a-f]{64}$/i.test(encoded)) {
    bytes = Uint8Array.from({ length: 32 }, (_, index) => Number.parseInt(encoded.slice(index * 2, index * 2 + 2), 16));
  } else {
    try {
      bytes = base64UrlToBytes(encoded);
    } catch {
      throw new ConfigurationError('STRAVA_COOKIE_KEY must encode 32 bytes');
    }
  }
  if (bytes.length !== 32) throw new ConfigurationError('STRAVA_COOKIE_KEY must encode 32 bytes');
  return bytes;
}

/** Whether all three private values needed to offer a Strava connection are present and usable. */
export function stravaConfigured(env) {
  try {
    clientId(env);
    envString(env, 'STRAVA_CLIENT_SECRET');
    cookieKeyBytes(env);
    return true;
  } catch (error) {
    if (error instanceof ConfigurationError) return false;
    throw error;
  }
}

async function cookieKey(env) {
  return crypto.subtle.importKey('raw', cookieKeyBytes(env), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function cookie(name, value, maxAge) {
  return `${name}=${value}; Max-Age=${maxAge}; Path=${COOKIE_PATH}; HttpOnly; Secure; SameSite=Lax`;
}

function clearCookie(name) {
  return `${name}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=${COOKIE_PATH}; HttpOnly; Secure; SameSite=Lax`;
}

export function stateCookie(value) {
  return cookie(STATE_COOKIE, value, 10 * 60);
}

export function clearStateCookie() {
  return clearCookie(STATE_COOKIE);
}

export function clearTokenCookie() {
  return clearCookie(TOKEN_COOKIE);
}

function cookieValue(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const equals = part.indexOf('=');
    if (equals < 0 || part.slice(0, equals).trim() !== name) continue;
    return part.slice(equals + 1).trim();
  }
  return null;
}

export function stateFromRequest(request) {
  return cookieValue(request, STATE_COOKIE);
}

export function randomState() {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16)));
}

export function statesMatch(expected, supplied) {
  if (typeof expected !== 'string' || typeof supplied !== 'string' || expected.length !== 22 || supplied.length !== 22) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index++) mismatch |= expected.charCodeAt(index) ^ supplied.charCodeAt(index);
  return mismatch === 0;
}

export function parseScopes(value) {
  return [...new Set(String(value || '').split(/[,\s]+/).map((scope) => scope.trim()).filter(Boolean))];
}

export function hasRequiredScopes(scopes) {
  const granted = new Set(scopes);
  return REQUIRED_SCOPES.every((scope) => granted.has(scope));
}

export function authorizationUrl(env, state) {
  const url = new URL(stravaOAuthUrl(env, 'authorize'));
  url.searchParams.set('client_id', clientId(env));
  url.searchParams.set('redirect_uri', `${siteOrigin(env)}/api/strava/callback`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', REQUIRED_SCOPES.join(','));
  url.searchParams.set('state', state);
  return url.toString();
}

function normalizeSession(value, ErrorType = Error) {
  const athleteId = value?.athleteId;
  const scopes = Array.isArray(value?.scopes) ? [...new Set(value.scopes.filter((scope) => typeof scope === 'string'))] : [];
  const accessToken = value?.accessToken;
  const refreshToken = value?.refreshToken;
  const expiresAt = value?.expiresAt;
  if (!Number.isSafeInteger(athleteId) || athleteId <= 0 || !hasRequiredScopes(scopes)
      || typeof accessToken !== 'string' || !accessToken || accessToken.length > 4096
      || typeof refreshToken !== 'string' || !refreshToken || refreshToken.length > 4096
      || !Number.isSafeInteger(expiresAt) || expiresAt <= 0) {
    throw new ErrorType('Invalid Strava session');
  }
  return { athleteId, scopes, accessToken, refreshToken, expiresAt };
}

async function encryptedCookieValue(session, env) {
  // The version is authenticated too, so a future cookie format cannot be confused with this one.
  const version = 'v1';
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(normalizeSession(session)));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({
    name: 'AES-GCM',
    iv,
    additionalData: encoder.encode(`pc_strava:${version}`),
  }, await cookieKey(env), plaintext));
  return `${version}.${bytesToBase64Url(iv)}.${bytesToBase64Url(ciphertext)}`;
}

export async function tokenCookie(session, env) {
  return cookie(TOKEN_COOKIE, await encryptedCookieValue(session, env), TOKEN_MAX_AGE);
}

async function decryptCookieValue(value, env) {
  const parts = String(value || '').split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') throw new InvalidStravaCookieError('Invalid Strava cookie');
  let iv;
  let ciphertext;
  try {
    iv = base64UrlToBytes(parts[1]);
    ciphertext = base64UrlToBytes(parts[2]);
  } catch {
    throw new InvalidStravaCookieError('Invalid Strava cookie');
  }
  if (iv.length !== 12 || ciphertext.length < 17) throw new InvalidStravaCookieError('Invalid Strava cookie');
  let plaintext;
  try {
    plaintext = await crypto.subtle.decrypt({
      name: 'AES-GCM',
      iv,
      additionalData: encoder.encode('pc_strava:v1'),
    }, await cookieKey(env), ciphertext);
  } catch (error) {
    if (error instanceof ConfigurationError) throw error;
    throw new InvalidStravaCookieError('Invalid Strava cookie');
  }
  try {
    return normalizeSession(JSON.parse(decoder.decode(plaintext)), InvalidStravaCookieError);
  } catch (error) {
    if (error instanceof InvalidStravaCookieError) throw error;
    throw new InvalidStravaCookieError('Invalid Strava cookie');
  }
}

export async function sessionFromRequest(request, env) {
  const value = cookieValue(request, TOKEN_COOKIE);
  return value == null ? null : decryptCookieValue(value, env);
}

async function tokenRequest(env, fields) {
  const body = new URLSearchParams({
    client_id: clientId(env),
    client_secret: envString(env, 'STRAVA_CLIENT_SECRET'),
    ...fields,
  });
  let response;
  try {
    response = await fetch(stravaOAuthUrl(env, 'token'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body,
    });
  } catch {
    throw new StravaUpstreamError();
  }
  if (!response.ok) {
    response.body?.cancel();
    throw new StravaUpstreamError(response.status);
  }
  try {
    return await response.json();
  } catch {
    throw new StravaUpstreamError(response.status);
  }
}

function tokenFields(payload) {
  const accessToken = payload?.access_token;
  const refreshToken = payload?.refresh_token;
  const expiresAt = payload?.expires_at;
  if (typeof accessToken !== 'string' || !accessToken || accessToken.length > 4096
      || typeof refreshToken !== 'string' || !refreshToken || refreshToken.length > 4096
      || !Number.isSafeInteger(expiresAt) || expiresAt <= 0) {
    throw new StravaUpstreamError(502);
  }
  return { accessToken, refreshToken, expiresAt };
}

export async function exchangeCode(env, code, scopes) {
  if (typeof code !== 'string' || !code || code.length > 2048 || !hasRequiredScopes(scopes)) throw new StravaUpstreamError(400);
  const payload = await tokenRequest(env, { code, grant_type: 'authorization_code' });
  const athleteId = payload?.athlete?.id;
  const responseScopes = payload?.scope == null ? null : parseScopes(payload.scope);
  if (!Number.isSafeInteger(athleteId) || athleteId <= 0
      || (responseScopes != null && !hasRequiredScopes(responseScopes))) {
    throw new StravaUpstreamError(502);
  }
  return normalizeSession({ athleteId, scopes: responseScopes ?? scopes, ...tokenFields(payload) });
}

async function refreshSession(env, session) {
  const current = normalizeSession(session);
  const payload = await tokenRequest(env, { refresh_token: current.refreshToken, grant_type: 'refresh_token' });
  if (payload?.athlete?.id != null && payload.athlete.id !== current.athleteId) throw new StravaUpstreamError(502);
  return normalizeSession({ athleteId: current.athleteId, scopes: current.scopes, ...tokenFields(payload) });
}

export async function refreshSessionIfNeeded(env, session, now = Date.now()) {
  const current = normalizeSession(session);
  if (current.expiresAt > Math.floor(now / 1000) + 5 * 60) return { session: current, cookie: null };
  const refreshed = await refreshSession(env, current);
  return { session: refreshed, cookie: await tokenCookie(refreshed, env) };
}

// oauth/revoke takes the app's own credentials in a Basic header and a token in the body: revoking the refresh token
// revokes its access tokens too, so no refresh comes first. oauth/deauthorize stops working on June 1, 2027
// (developers.strava.com/docs/authentication).
export async function revoke(env, refreshToken) {
  const url = stravaOAuthUrl(env, 'revoke');
  const authorization = `Basic ${btoa(`${clientId(env)}:${envString(env, 'STRAVA_CLIENT_SECRET')}`)}`;
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: authorization, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: refreshToken, token_type_hint: 'refresh_token' }),
    });
  } catch {
    throw new StravaUpstreamError();
  }
  response.body?.cancel();
  if (!response.ok) throw new StravaUpstreamError(response.status);
}

export function retryAfterQuarterHour(now = Date.now()) {
  const seconds = Math.floor(now / 1000);
  return 15 * 60 - (seconds % (15 * 60));
}

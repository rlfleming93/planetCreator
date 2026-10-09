import { garminLines } from '../planet/strava-mark.js';
import { recentMondays, weekBounds } from './strava-import.js';

/* Ask Planet Creator's Cloudflare Function for one week from Garmin, read through Junction (the service that reaches
 * Garmin for this site). This tab sends only the Monday and the visitor's own local start and end. The Function holds
 * the connection, reads the week from Junction and returns activities already in the planet's shape, routes as shapes. */
export const GARMIN_WEEKS = 13; // Junction fetches about the last 90 days from Garmin when you connect
export const garminMondays = (now = new Date()) => recentMondays(GARMIN_WEEKS, now);

async function readJson(response) {
  try { return await response.json(); } catch { return {}; }
}

function fail(response, body, fallback) {
  const said = typeof body?.error === 'string' && body.error.length <= 180 ? body.error : '';
  const error = new Error(said || fallback);
  error.status = response.status;
  const retry = Number(response.headers.get('Retry-After'));
  error.retryAfter = Number.isFinite(retry) && retry > 0 ? retry : null;
  return error;
}

// the Function never sends a coordinate; this keeps one out of the page even if it ever did
const DROP = /lat|lng|lon|polyline|token|coord|athlete|city|country|state|^map$/i;
function scrub(value) {
  if (Array.isArray(value)) return value.map(scrub);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !DROP.test(key)).map(([key, child]) => [key, scrub(child)]));
}

/** Whether Garmin is switched on for this site and this browser holds a connection. Makes no Junction call. */
export async function status() {
  const response = await fetch('/api/garmin/status', { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) return { configured: false, connected: false };
  const body = await readJson(response);
  return { configured: body.configured === true, connected: body.configured === true && body.connected === true };
}

/** One local week: activities weeksOf can group, its "Garmin [device model]" lines and an optional warning. */
export async function fetchWeek(week) {
  const bounds = weekBounds(typeof week === 'string' ? week : week?.week);
  const response = await fetch('/api/garmin/week', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(bounds),
  });
  const body = await readJson(response);
  if (!response.ok) throw fail(response, body, 'Could not fetch that week from Garmin.');
  if (!Array.isArray(body.activities)) throw new Error('The week came back in a shape this page cannot read.');
  return {
    week: bounds.week,
    activities: body.activities.map(scrub),
    garmin: garminLines(body.garmin),
    warning: typeof body.warning === 'string' && body.warning.length <= 240 ? body.warning : '',
  };
}

/** This week once it has a session in it, else last week. */
export async function fetchLatestWeek(now = new Date()) {
  const [thisWeek, lastWeek] = recentMondays(2, now);
  const result = await fetchWeek(thisWeek.week);
  return result.activities.length ? result : fetchWeek(lastWeek.week);
}

/** Delete this browser's connection at Junction. deleted false with a message: the browser had none to delete. */
export async function disconnect() {
  const response = await fetch('/api/garmin/disconnect', { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
  const body = await readJson(response);
  if (!response.ok) throw fail(response, body, 'Could not disconnect Garmin.');
  return { deleted: body.deleted === true, message: typeof body.message === 'string' && body.message.length <= 200 ? body.message : '' };
}

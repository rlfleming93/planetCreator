import { garminLines, poweredSvg } from '../planet/strava-mark.js';

/* Ask Planet Creator's Cloudflare Function for one week from Strava, or a run of weeks as summaries. This tab sends
 * only the Mondays and the visitor's own local start and end; the Function holds the token, fetches them, and returns
 * activities already in the planet shape. The connect button below and the shared Powered by mark are
 * Strava's own artwork, kept local so the page never loads either from anywhere else. */
const CONNECT_SVG = `<svg width="237" height="48" viewBox="0 0 237 48" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="236.867" height="48" rx="6" fill="#FC5200"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M180.749 31.8195L180.748 31.8188H185.357L188.188 26.1268L191.019 31.8188H196.618L188.187 15.5403L180.184 30.9945L177.111 26.5078C179.008 25.5928 180.191 24.0081 180.191 21.7318V21.687C180.191 20.0803 179.7 18.9197 178.763 17.9822C177.669 16.8887 175.906 16.1968 173.139 16.1968H165.506V31.8195H170.728V27.3558H171.844L174.79 31.8195H180.749ZM212.954 15.5403L204.524 31.8188H210.124L212.955 26.1268L215.786 31.8188H221.385L212.954 15.5403ZM200.576 32.4593L209.006 16.1808H203.406L200.575 21.8729L197.744 16.1808H192.144L200.576 32.4593ZM172.982 23.6287C174.232 23.6287 174.991 23.0708 174.991 22.1112V22.0663C174.991 21.0621 174.21 20.5711 173.005 20.5711H170.728V23.6287H172.982ZM154.337 20.6158H149.74V16.1968H164.157V20.6158H159.56V31.8195H154.337V20.6158ZM137.015 26.1507L134.225 29.4761C136.211 31.2172 139.068 32.1097 142.237 32.1097C146.433 32.1097 149.133 30.101 149.133 26.82V26.7756C149.133 23.6287 146.455 22.468 142.46 21.7318C140.808 21.419 140.384 21.1515 140.384 20.7273V20.6827C140.384 20.3033 140.742 20.0355 141.523 20.0355C142.973 20.0355 144.737 20.5042 146.209 21.5754L148.754 18.0493C146.946 16.6209 144.714 15.9065 141.701 15.9065C137.394 15.9065 135.073 18.2055 135.073 21.1737V21.2185C135.073 24.5214 138.153 25.526 141.656 26.2398C143.33 26.5747 143.821 26.82 143.821 27.2665V27.3113C143.821 27.7352 143.42 27.9805 142.482 27.9805C140.652 27.9805 138.711 27.4452 137.015 26.1507Z" fill="white"/>
<path d="M117.92 31.6812V21.9622H119.919V25.7533H124.137V21.9622H126.136V31.6812H124.137V27.5179H119.919V31.6812H117.92Z" fill="white"/>
<path d="M110.959 31.6812V23.713H107.844V21.9622H116.088V23.713H112.958V31.6812H110.959Z" fill="white"/>
<path d="M104.02 31.6812V21.9622H106.018V31.6812H104.02Z" fill="white"/>
<path d="M92.1013 31.6812L89.5371 21.9622H91.6464L92.7492 27.2008C92.8871 27.9039 93.0112 28.4691 93.1352 29.3376H93.1904C93.3282 28.607 93.4109 28.152 93.6315 27.187L94.8723 21.9622H96.9677L98.2084 27.187C98.429 28.152 98.5117 28.607 98.6496 29.3376H98.7047C98.8288 28.4691 98.9529 27.9039 99.0907 27.2008L100.207 21.9622H102.303L99.7387 31.6812H97.657L96.4301 26.4977C96.2646 25.7671 96.1543 25.2846 95.9476 24.2782H95.8924C95.6856 25.2846 95.5753 25.7671 95.4099 26.4977L94.183 31.6812H92.1013Z" fill="white"/>
<path d="M79.9965 31.6812V23.713H76.8809V21.9622H85.1248V23.713H81.9954V31.6812H79.9965Z" fill="white"/>
<path d="M71.524 31.888C68.7806 31.888 66.9746 29.8753 66.9746 26.8148C66.9746 23.7681 68.7806 21.7554 71.524 21.7554C73.6883 21.7554 75.3151 23.0237 75.577 24.8434L73.5781 25.3121C73.3575 24.1955 72.5855 23.5338 71.4964 23.5338C69.9799 23.5338 69.0287 24.7883 69.0287 26.8148C69.0287 28.8413 69.9799 30.1096 71.4964 30.1096C72.5855 30.1096 73.3575 29.4479 73.5781 28.345L75.577 28.8138C75.3151 30.6335 73.6883 31.888 71.524 31.888Z" fill="white"/>
<path d="M58.459 31.6812V21.9622H65.2003V23.6578H60.4579V25.8636H64.8556V27.5041H60.4579V29.9856H65.2003V31.6812H58.459Z" fill="white"/>
<path d="M47.7656 31.6812V21.9622H49.9576L52.9216 26.9113C53.3765 27.6557 53.6798 28.2899 54.0106 28.993H54.0796L54.0382 26.5115V21.9622H55.9407V31.6812H53.7487L50.771 26.7321C50.3298 25.9876 50.0265 25.3673 49.6819 24.6504H49.6267L49.6681 27.1319V31.6812H47.7656Z" fill="white"/>
<path d="M37.0742 31.6812V21.9622H39.2662L42.2301 26.9113C42.6851 27.6557 42.9884 28.2899 43.3192 28.993H43.3882L43.3468 26.5115V21.9622H45.2493V31.6812H43.0573L40.0795 26.7321C39.6384 25.9876 39.3351 25.3673 38.9905 24.6504H38.9353L38.9767 27.1319V31.6812H37.0742Z" fill="white"/>
<path d="M30.2903 31.888C27.4642 31.888 25.6582 29.8201 25.6582 26.8148C25.6582 23.8233 27.4642 21.7554 30.2903 21.7554C33.1164 21.7554 34.9223 23.8233 34.9223 26.8148C34.9223 29.8201 33.1164 31.888 30.2903 31.888ZM30.2903 30.1096C31.8481 30.1096 32.8682 28.9378 32.8682 26.8148C32.8682 24.6918 31.8481 23.5338 30.2903 23.5338C28.7325 23.5338 27.7123 24.6918 27.7123 26.8148C27.7123 28.9378 28.7325 30.1096 30.2903 30.1096Z" fill="white"/>
<path d="M19.9868 31.888C17.2435 31.888 15.4375 29.8753 15.4375 26.8148C15.4375 23.7681 17.2435 21.7554 19.9868 21.7554C22.1512 21.7554 23.778 23.0237 24.0399 24.8434L22.0409 25.3121C21.8204 24.1955 21.0484 23.5338 19.9593 23.5338C18.4428 23.5338 17.4916 24.7883 17.4916 26.8148C17.4916 28.8413 18.4428 30.1096 19.9593 30.1096C21.0484 30.1096 21.8204 29.4479 22.0409 28.345L24.0399 28.8138C23.778 30.6335 22.1512 31.888 19.9868 31.888Z" fill="white"/>
</svg>`;

export const connectSvg = CONNECT_SVG;
export { poweredSvg };

const WEEK = /^\d{4}-\d{2}-\d{2}$/;
const HOUR = 3600;

function shiftLabel(label, days) {
  const [y, m, d] = label.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// Same Monday weeksOf uses: shift the instant by this browser's offset, then take the UTC Monday.
function mondayLabel(date) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  const day = (shifted.getUTCDay() + 6) % 7;
  shifted.setUTCDate(shifted.getUTCDate() - day);
  return shifted.toISOString().slice(0, 10);
}

function localMidnight(label) {
  const [y, m, d] = label.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/** Monday label plus the visitor's local midnight and next Monday midnight, as exact epoch seconds. */
export function weekBounds(week) {
  if (!WEEK.test(week)) throw new Error('Week must be a Monday written YYYY-MM-DD.');
  const [y, m, d] = week.split('-').map(Number);
  if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() !== 1) throw new Error('That date is not a Monday.');
  const after = Math.round(localMidnight(week).getTime() / 1000);
  const before = Math.round(localMidnight(shiftLabel(week, 7)).getTime() / 1000);
  if (!Number.isSafeInteger(after) || !Number.isSafeInteger(before) || before <= after || before - after > 8 * 24 * HOUR) {
    throw new Error('That week does not span one local calendar week.');
  }
  return { week, after, before };
}

/** This week, then earlier Mondays, newest first. count includes this week. */
export function recentMondays(count = 16, now = new Date()) {
  const n = Math.max(1, Math.floor(Number(count)) || 1);
  const first = mondayLabel(now);
  const out = [];
  for (let i = 0; i < n; i++) out.push(weekBounds(shiftLabel(first, -7 * i)));
  return out;
}

async function readJson(response) {
  try { return await response.json(); } catch { return {}; }
}

function fail(response, body, fallback) {
  const retryHeader = response.headers.get('Retry-After');
  let retryAfter = null;
  if (retryHeader) {
    const seconds = Number(retryHeader);
    if (Number.isFinite(seconds)) retryAfter = seconds;
    else {
      const at = Date.parse(retryHeader);
      if (Number.isFinite(at)) retryAfter = Math.max(0, Math.round((at - Date.now()) / 1000));
    }
  }
  if (retryAfter == null && Number.isFinite(Number(body?.retryAfter))) retryAfter = Number(body.retryAfter);
  const said = typeof body?.error === 'string' ? body.error : typeof body?.message === 'string' ? body.message : '';
  const message = said && said.length <= 180 ? said : fallback;
  const error = new Error(message);
  error.status = response.status;
  error.retryAfter = retryAfter;
  error.budget = budgetOf(body?.budget);
  return error;
}

// what's left of the site's Strava read budget, as the Function read it off Strava's headers: { left, limit }, each
// [this 15 minutes, today]
function budgetOf(value) {
  const pair = (v) => Array.isArray(v) && v.length === 2 && v.every((n) => Number.isSafeInteger(n) && n >= 0);
  return pair(value?.left) && pair(value?.limit) ? { left: value.left, limit: value.limit } : null;
}

const DROP = /lat|lng|lon|polyline|token|coord|athlete|city|country|state|^map$/i;

function scrub(value) {
  if (Array.isArray(value)) return value.map(scrub);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (DROP.test(key)) continue;
    out[key] = scrub(child);
  }
  return out;
}

function startedAt(value) {
  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) return new Date(Date.parse(value)).toISOString();
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value < 1e12 ? value * 1000 : value).toISOString();
  return value;
}

/** Whether Strava is configured and this browser still has a connection. Makes no Strava call of its own. */
export async function status() {
  const response = await fetch('/api/strava/status', { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) return { configured: false, connected: false };
  const body = await readJson(response);
  return { configured: body.configured === true, connected: body.configured === true && body.connected === true };
}

/** Fetch one local week. Returns activities weeksOf can group, plus detail and an optional warning. */
export async function fetchWeek(week) {
  const bounds = weekBounds(typeof week === 'string' ? week : week?.week);
  const response = await fetch('/api/strava/week', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(bounds),
  });
  const body = await readJson(response);
  if (response.status === 429) throw fail(response, body, 'Strava is limiting requests. Try this week again in a little while.');
  if (!response.ok) throw fail(response, body, 'Could not fetch that week from Strava.');
  const activities = Array.isArray(body.activities) ? body.activities.map((activity) => ({ ...scrub(activity), startedAt: startedAt(activity?.startedAt) })) : null;
  if (!activities) throw new Error('The week came back in a shape this page cannot read.');
  return {
    week: bounds.week,
    after: bounds.after,
    before: bounds.before,
    activities,
    detail: body.detail === 'streams' || body.detail === 'summary' ? body.detail : undefined,
    warning: typeof body.warning === 'string' && body.warning ? body.warning : undefined,
    garmin: garminLines(body.garmin), // the "Garmin [device model]" lines its views and images have to carry
  };
}

/** Several weeks back to back (bounds as weekBounds makes them, up to 13), summaries only: the week picker's and a
 * batch's. Every activity carries its own "Garmin [device model]" lines; budget is what's left of Strava's reads. */
export async function fetchRange(bounds) {
  const list = [...bounds].sort((a, b) => a.after - b.after);
  const response = await fetch('/api/strava/week', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ week: list[0].week, after: list[0].after, before: list.at(-1).before, weeks: list.length }),
  });
  const body = await readJson(response);
  if (response.status === 429) throw fail(response, body, 'Strava is limiting requests. Try again in a little while.');
  if (!response.ok) throw fail(response, body, 'Could not fetch those weeks from Strava.');
  if (!Array.isArray(body.activities)) throw new Error('The weeks came back in a shape this page cannot read.');
  return {
    activities: body.activities.map((activity) => ({ ...scrub(activity), startedAt: startedAt(activity?.startedAt), garmin: garminLines(activity?.garmin) })),
    budget: budgetOf(body.budget),
  };
}

/** Revoke the token if this browser still has one. revoked false means the visitor must use Strava's settings. */
export async function disconnect() {
  const response = await fetch('/api/strava/disconnect', { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
  const body = await readJson(response);
  if (!response.ok && response.status !== 401 && response.status !== 404) throw fail(response, body, 'Could not disconnect Strava.');
  const message = typeof body.message === 'string' && body.message.length <= 180 ? body.message : '';
  return { revoked: body.revoked === true, message };
}

if (import.meta.main) {
  const now = new Date('2026-03-10T15:00:00');
  const weeks = recentMondays(8, now);
  const first = mondayLabel(now);
  if (weeks[0].week !== first) throw new Error('this week mismatch');
  for (let i = 0; i < weeks.length; i++) {
    if (weeks[i].week !== shiftLabel(first, -7 * i)) throw new Error('Monday step mismatch');
    if (!Number.isInteger(weeks[i].after) || !Number.isInteger(weeks[i].before)) throw new Error('epoch');
  }
  console.log('strava-import ok', weeks[0].week, weeks.map((w) => (w.before - w.after) / 3600).join(','));
}

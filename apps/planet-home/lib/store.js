/* The shelf: the planets a visitor keeps, in this browser only (IndexedDB `planet-home`, no account), and a
 * file that carries them to another browser. One planet per week: saving a week again replaces it.
 *
 * A planet: { id, link, week, title, stats, savedAt, source?, detail?, garmin?, body?, why? }
 *   id      the week (its Monday, YYYY-MM-DD)
 *   link    '#p=CODE', the planet's share link (any link ending in p=CODE is accepted, and kept in this form)
 *   stats   the week's numbers, as week.js summarises them
 *   savedAt ms since 1970
 *   source  'strava', when the week came from Strava; 'garmin', when it came from Garmin through Junction
 *   detail  'streams' or 'summary', the detail Strava supplied
 *   garmin  a Strava or Garmin week's "Garmin [device model]" lines, when Garmin devices recorded it
 *   body    what the app makes of the week (bodies/index.js `auto`), and why: its own reason in the week's numbers,
 *   why     as shelf/ryan.json keeps them for Ryan's weeks */
import { garminLines } from '../planet/strava-mark.js';

const FORMAT = 'planet-creator-shelf';
const WEEK = /^\d{4}-\d{2}-\d{2}$/;
const CODE = /^[\w-]{8,20000}$/;

let opening;
const db = () => (opening ??= new Promise((resolve, reject) => {
  const req = indexedDB.open('planet-home', 1);
  req.onupgradeneeded = () => {
    req.result.createObjectStore('planets', { keyPath: 'id' });
    req.result.createObjectStore('thumbs'); // planet code → its painted still (an image Blob); a cache
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
}));

// runs `work` in one transaction; resolves with its request's result once the transaction has committed
async function tx(store, mode, work) {
  const t = (await db()).transaction(store, mode);
  const req = work(t.objectStore(store));
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve(req?.result);
    t.onerror = t.onabort = () => reject(t.error);
  });
}

export const codeOf = (link) => String(link ?? '').replace(/^.*[#?&]p=/, '');

// a planet as it's kept, or null when it isn't one (the file side of importShelf is a trust boundary)
function kept(p) {
  const code = codeOf(p?.link);
  if (!CODE.test(code) || !WEEK.test(p?.week)) return null;
  const savedAt = p.savedAt == null ? NaN : +new Date(p.savedAt);
  return {
    id: p.week,
    link: `#p=${code}`,
    week: p.week,
    title: String(p.title ?? '').slice(0, 200),
    stats: p.stats && typeof p.stats === 'object' && !Array.isArray(p.stats) ? p.stats : {},
    savedAt: Number.isFinite(savedAt) ? savedAt : Date.now(),
    ...(p.source === 'strava' || p.source === 'garmin' ? {
      source: p.source,
      ...(p.source === 'strava' && (p.detail === 'streams' || p.detail === 'summary') ? { detail: p.detail } : {}),
      ...(garminLines(p.garmin).length ? { garmin: garminLines(p.garmin) } : {}),
    } : {}),
    ...(BODIES.includes(p.body) ? { body: p.body, ...(typeof p.why === 'string' && p.why ? { why: p.why.slice(0, 400) } : {}) } : {}),
  };
}
const BODIES = ['rock', 'marble', 'giant', 'ice', 'lava', 'star'];

export async function savePlanet(planet) {
  const p = kept(planet);
  if (!p) throw new Error('A planet needs its link (#p=…) and its week (YYYY-MM-DD).');
  await tx('planets', 'readwrite', (s) => s.put(p));
  return p.id;
}

export const listPlanets = async () => (await tx('planets', 'readonly', (s) => s.getAll())).sort((a, b) => a.week.localeCompare(b.week));
export const getPlanet = (id) => tx('planets', 'readonly', (s) => s.get(String(id)));
export const removePlanet = (id) => tx('planets', 'readwrite', (s) => s.delete(String(id)));

// The file carries each planet's painted still too, so a browser that opens it needn't paint them again.
export async function exportShelf() {
  const planets = await Promise.all((await listPlanets()).map(async (p) => {
    const blob = await getThumb(p.link).catch(() => null);
    return blob ? { ...p, still: await dataURL(blob) } : p;
  }));
  const shelf = { format: FORMAT, version: 1, exportedAt: new Date().toISOString(), planets };
  return new Blob([JSON.stringify(shelf, null, 1)], { type: 'application/json' });
}
const dataURL = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});
const STILL = /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/]+=*$/;

// Adds a file's planets to the shelf. Where both have the same week, the one saved later stays.
// Resolves with how many planets it added or replaced.
export async function importShelf(file) {
  let shelf;
  try { shelf = JSON.parse(await file.text()); } catch { shelf = null; }
  if (shelf?.format !== FORMAT || !Array.isArray(shelf.planets)) throw new Error("That file isn't a shelf of planets.");
  const planets = shelf.planets.map(kept).filter(Boolean);
  let written = 0;
  await tx('planets', 'readwrite', (s) => {
    for (const p of planets) {
      s.get(p.id).onsuccess = (e) => {
        if (e.target.result?.savedAt > p.savedAt) return;
        s.put(p);
        written++;
      };
    }
  });
  for (const p of shelf.planets) {
    if (kept(p) && typeof p.still === 'string' && p.still.length < 600000 && STILL.test(p.still)) await putThumb(p.link, await (await fetch(p.still)).blob());
  }
  return written;
}

// painted stills, keyed by the planet's code: the same week always paints the same world
export const getThumb = (link) => tx('thumbs', 'readonly', (s) => s.get(codeOf(link)));
export const putThumb = (link, blob) => tx('thumbs', 'readwrite', (s) => s.put(blob, codeOf(link)));
// and its globe for the galaxy (lib/paint.js paintGlobe): { blob, r }, r its radius as a share of a still's side
export const getGlobe = (link) => tx('thumbs', 'readonly', (s) => s.get(`globe:${codeOf(link)}`));
export const putGlobe = (link, blob, r) => tx('thumbs', 'readwrite', (s) => s.put({ blob, r }, `globe:${codeOf(link)}`));

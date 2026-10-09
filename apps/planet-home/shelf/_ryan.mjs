// "See Ryan's weeks": the demo shelf. Every week VARÐA has a planet link for (its data/history.json, which this repo
// reads published — see _history.mjs — so nothing here reaches into VARÐA's source tree), kept the way the shelf
// keeps anyone's (ryan.json), and a still of each painted by the real app, with the same painter the shelf uses for
// yours (lib/paint.js), so a visitor's browser never has to paint all of them; beside each still its globe
// (ryan/globe/<week>.webp: the planet alone on a transparent square, lib/paint.js paintGlobe), which the galaxy
// lays on its week's planet.
// A new week, a missing still, a changed planet link or a changed look repaints that week's still and globe; a
// missing globe paints alone; --force repaints them all.
// ryan.json keeps the link to detect an in-progress week's new sessions, a short hash of the painted bytes (still and
// globe) to give every repaint a new browser URL, the body the app makes of the week (bodies/index.js `auto`: rock,
// marble, giant, ice, lava or star) for the shelf's filters and the galaxy's card, `why`, that body's own reason in
// the week's numbers (null on a rocky planet), and `globe`, the globe's radius as
// a share of a still cut from its classic poster, for the size the galaxy stands it at. This script starts and stops
// its own local server, so it is safe to run unattended:
//   bun apps/planet-home/shelf/_ryan.mjs [--force]
// scripts/planet-sync.mjs calls syncShelf here with `home` set to its clean checkout of HEAD, so an unattended run
// paints the committed app; the shelf data (ryan.json, ryan/<week>.webp and ryan/globe/<week>.webp) always lands in
// this working tree, which stays the source of truth. The painting is lib/paint.js in headless Chrome, started as
// scripts/chrome.mjs starts it (paintWeeks).
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { decodePlanet } from '../planet/share.js';
import { weekStats } from '../planet/worlds/index.js';
import { bodyFor } from '../planet/bodies/index.js';
import { history } from '../_history.mjs';
import { nameOf, statsOf } from '../lib/week.js';
import { openChrome } from '../../../scripts/chrome.mjs';

const HERE = import.meta.dir, HOME = new URL('../', import.meta.url).pathname;
const ROOT = new URL('../../../', import.meta.url).pathname.replace(/\/$/, ''); // this repository
const LOOK_FILE = `${ROOT}/var/sync/shelf-look.json`;
const codeOf = (link) => String(link ?? '').replace(/^.*[#?&]p=/, '');
const bytes = (url) => Buffer.from(url.split(',')[1], 'base64'); // a data URL's

/** The look a still was painted with: the app's drawing code as HEAD has it. A commit that changes apps/planet or
 * apps/planet-home/lib makes every still out of date even when its week's link and its painted bytes are unchanged,
 * which is why this stamp lives beside the shelf's private state and not in the public ryan.json. */
export function lookOf(root = ROOT) {
  const out = spawnSync('git', ['rev-parse', 'HEAD:apps/planet', 'HEAD:apps/planet-home/lib'], { cwd: root, encoding: 'utf8' });
  const trees = out.status === 0 ? out.stdout.trim().split('\n').filter(Boolean) : [];
  return trees.length === 2 ? `${trees[0].slice(0, 10)}-${trees[1].slice(0, 10)}` : null;
}

/** Each job's globe, and its still when it's marked for one, painted by the app served at `origin` (lib/paint.js) in a
 *  1200×800 page: { [week]: { globe, r, still } }, the pictures as webp data URLs. jobs: [week, link, still][]. */
export async function paintWeeks(origin, jobs) {
  const paintAll = `(async () => {
    const { paint, paintGlobe } = await import('/lib/paint.js');
    const out = {};
    for (const [week, link, still] of ${JSON.stringify(jobs)}) {
      const globe = await paintGlobe(link);
      out[week] = { globe: globe.canvas.toDataURL('image/webp', 0.85), r: globe.still, still: still ? (await paint(link)).toDataURL('image/webp', 0.85) : null };
    }
    return out;
  })()`;
  const seconds = 60 + jobs.length * 10;
  const { page, close } = await openChrome({ width: 1200, height: 800 });
  let timer;
  try {
    await page.goto(`${origin}/lib/`);
    const late = new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error(`the painter took over ${seconds} s`)), seconds * 1000); });
    return await Promise.race([page.evaluate(paintAll), late]);
  } finally {
    clearTimeout(timer);
    await close();
  }
}

/** Paint what the shelf is missing and keep ryan.json. `home` is the directory to serve (this working tree by
 * default, or the release checkout of HEAD that planet-sync paints from); the shelf data is always read and written
 * here. `look` is the stamp every still is left holding; a week without it repaints. With dryRun nothing is painted,
 * written or stamped, and `jobs` is the list of weeks a real run would paint. */
export async function syncShelf({ force = false, home = HOME, weeks, source, look, dryRun = false, log = console.log } = {}) {
  if (!weeks || !source) {
    const found = await history();
    weeks ??= found.weeks;
    source ??= found.source;
  }
  log(`weeks from ${source}`);
  const rows = weeks.map((w) => {
    const week = w.week ?? w.start, link = w.link ?? w.planetLink;
    const seed = decodePlanet(codeOf(link)), stats = weekStats(seed), body = bodyFor('auto', stats);
    return { week, link, rev: null, title: nameOf(seed), body: body?.id || 'rock', why: body?.reason?.(stats) || null, globe: null, stats: statsOf(seed) };
  });
  const jsonFile = `${HERE}/ryan.json`, stillFile = (week) => `${HERE}/ryan/${week}.webp`, globeFile = (week) => `${HERE}/ryan/globe/${week}.webp`;
  const oldJSON = existsSync(jsonFile) ? readFileSync(jsonFile, 'utf8') : '';
  const previous = new Map((oldJSON ? JSON.parse(oldJSON) : []).map((w) => [w.week, w]));
  const oldLook = existsSync(LOOK_FILE) ? readFileSync(LOOK_FILE, 'utf8') : '';
  const stamped = oldLook ? JSON.parse(oldLook) : {};
  const now = look ?? lookOf();
  // [week, link, still]: a stale still repaints with its globe, a missing globe paints on its own
  const jobs = rows.map((w) => [w.week, w.link, force || previous.get(w.week)?.link !== w.link || !existsSync(stillFile(w.week))
    || (now !== null && stamped[w.week] !== now)])
    .filter(([week, , still]) => still || !existsSync(globeFile(week)) || previous.get(week)?.globe == null);
  const globes = {};
  if (jobs.length && !dryRun) {
    mkdirSync(`${HERE}/ryan/globe`, { recursive: true });
    const port = 8962;
    const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', home], { stdio: 'ignore' });
    try {
      let ready = false;
      for (let i = 0; i < 50 && server.exitCode == null; i++) {
        ready = await fetch(`http://127.0.0.1:${port}/lib/`).then((r) => r.ok).catch(() => false);
        if (ready) break;
        await Bun.sleep(100);
      }
      if (!ready) throw new Error(`the painter's local server did not start on ${port}`);
      for (const [week, { globe, r, still }] of Object.entries(await paintWeeks(`http://127.0.0.1:${port}`, jobs))) {
        writeFileSync(globeFile(week), bytes(globe));
        globes[week] = Math.round(r * 1e4) / 1e4;
        if (still) writeFileSync(stillFile(week), bytes(still));
      }
    } finally {
      server.kill();
    }
    const missing = jobs.filter(([week, , still]) => (still && !existsSync(stillFile(week))) || !existsSync(globeFile(week)) || !(week in globes));
    if (missing.length) throw new Error(`the painter returned no still or globe for ${missing.map(([week]) => week).join(', ')}`);
  }
  for (const w of rows) {
    w.globe = globes[w.week] ?? previous.get(w.week)?.globe ?? null;
    const painted = [stillFile(w.week), globeFile(w.week)].filter(existsSync);
    w.rev = painted.length ? painted.reduce((h, f) => h.update(readFileSync(f)), createHash('sha256')).digest('hex').slice(0, 10) : (previous.get(w.week)?.rev ?? null);
  }
  const json = JSON.stringify(rows);
  const changed = jobs.length > 0 || json !== oldJSON;
  if (!dryRun && json !== oldJSON) writeFileSync(jsonFile, json);
  // Stamped only once the stills are on disk: a failed paint leaves the look unrecorded, so the next run tries again.
  // A week dropped from history keeps its still and loses its stamp, so a week that comes back repaints.
  if (!dryRun && now !== null) {
    const lookJSON = JSON.stringify(Object.fromEntries(rows.map((w) => [w.week, now])));
    if (lookJSON !== oldLook) {
      mkdirSync(dirname(LOOK_FILE), { recursive: true });
      writeFileSync(LOOK_FILE, lookJSON);
    }
  }
  log(`ryan.json: ${rows.length} weeks`);
  log(`ryan/: painted ${dryRun ? 0 : jobs.filter(([, , still]) => still).length} stills and ${dryRun ? 0 : jobs.length} globes`);
  log(`ryan-sync: ${changed ? 'changed' : 'unchanged'}`);
  return { changed, painted: dryRun ? 0 : jobs.length, jobs: jobs.map(([week]) => week), weeks: rows };
}

if (import.meta.main) await syncShelf({ force: process.argv.includes('--force') });

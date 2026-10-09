// One command for a scheduler to run after Garmin data lands — personalBranding/scripts/garmin-auto.sh today, Saga's
// daemon later — so nothing else has to know how the shelf is kept:
//   bun scripts/planet-sync.mjs [--publish] [--dry-run] [--force] [--json]
// It reads the weeks from VARÐA's history.json (PLANET_HISTORY, else the published copy and VARÐA's checkout beside
// this repo), writes the private seeds the app's ?seed=<week> reads (var/private/planet/seeds/<week>.js, one per week
// with a planet link, plus latest.js) and links them into apps/planet/seeds/ as scripts/dev.sh does, repaints the
// demo shelf's stills and globes for the weeks whose planet link, still or look changed, and paints any missing globe
// (shelf/_ryan.mjs's syncShelf), paints the phone kit's clips when the running week or the last finished one changed
// (scripts/story-render.mjs), and with --publish puts the home online when the shelf or the clips changed or an
// earlier run left a deploy pending.
// Painting and deploying happen in a detached worktree of HEAD at var/sync/release (created, or force-checked-out and
// cleaned, on every run), so an unattended run never paints or publishes work in progress; the shelf data that goes
// out (apps/planet-home/shelf/ryan.json, ryan/<week>.webp and ryan/globe/<week>.webp) and the kit's clips
// (apps/planet-home/kit/kit.json and media/) are read and written in this working tree, the source of truth. A week
// deleted from history keeps its still. One run at a time, by var/sync/lock
// (a lock older than 30 minutes is a crashed run's), because painting is one browser at a time.
// The last line reads `planet-sync: <unchanged|changed|published|held: reason|failed: reason>`; --json prints that as
// one JSON object instead. A held run exits 0: it is asking for a later one.
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { decodePlanet } from '../apps/planet/share.js';
import { history } from '../apps/planet-home/_history.mjs';
import { lookOf, syncShelf } from '../apps/planet-home/shelf/_ryan.mjs';
import { dueKinds, kitWeeks, readKit, renderKit } from './story-render.mjs';

const ROOT = join(import.meta.dir, '..');
const RELEASE = join(ROOT, 'var/sync/release'), LOCK = join(ROOT, 'var/sync/lock');
const SEEDS = join(ROOT, 'var/private/planet/seeds'), SEED_LINKS = join(ROOT, 'apps/planet/seeds');
const STATE = process.env.PLANET_DEPLOY_STATE || join(ROOT, '../personalBranding/var/private/garmin');
const GATE = process.env.PLANET_DEPLOY_GATE || join(ROOT, 'var/private/garmin/deploy.env');
const CLOCK = 45 * 60, STALE = 30 * 60, ALLOWANCE = 400, KNOWN = ['--publish', '--dry-run', '--force', '--json'];
const ARGS = process.argv.slice(2), unknown = ARGS.filter((f) => !KNOWN.includes(f));
const PUBLISH = ARGS.includes('--publish'), DRY = ARGS.includes('--dry-run'), FORCE = ARGS.includes('--force'), JSON_OUT = ARGS.includes('--json');
const codeOf = (link) => String(link ?? '').replace(/^.*[#?&]p=/, '');
const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;
const say = (line) => console.log(line);

const failed = (why) => ({ status: `failed: ${oneLine(why)}`, weeks: 0, painted: 0, paintedWeeks: [], seedsWritten: 0, look: null, publish: { state: 'skipped', reason: 'nothing was published' } });
const oneLine = (why) => String(why?.message ?? why).replace(/\s+/g, ' ').trim();
const held = (why) => ({ status: `held: ${oneLine(why)}`, weeks: 0, painted: 0, paintedWeeks: [], seedsWritten: 0, look: null, publish: { state: 'skipped', reason: 'nothing was published' } });

function git(args, cwd = ROOT) {
  const out = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (out.status !== 0) throw new Error(`git ${args[0]}: ${(out.stderr || out.stdout || '').trim().split('\n').pop()}`);
  return out.stdout.trim();
}

// ---------------------------------------------------------------- the release tree: HEAD, and nothing else
// The tree the app is served from and the deploy is run in. Missing, stale or not a worktree at all, it is created
// again from HEAD; otherwise it is force-checked-out to HEAD and cleaned, which throws away the shelf data and the
// var/private link an earlier run left in it. Anything in it is this script's, so cleaning is always safe.
function releaseTree(head) {
  let inside = null;
  if (existsSync(RELEASE)) {
    const out = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: RELEASE, encoding: 'utf8' });
    if (out.status === 0) inside = out.stdout.trim();
  }
  if (!inside || realpathSync(inside) !== realpathSync(RELEASE)) {
    git(['worktree', 'prune']); // a registration whose directory is gone would block the add
    rmSync(RELEASE, { recursive: true, force: true });
    mkdirSync(dirname(RELEASE), { recursive: true });
    git(['worktree', 'add', '--detach', RELEASE, head]);
  }
  git(['checkout', '--detach', '--force', head], RELEASE);
  git(['clean', '-fdxq'], RELEASE);
  // The app's default week and the deploy's private files live outside git, and both the served app and the deploy
  // script read them from this working tree: the same links scripts/dev.sh makes for the dev server.
  mkdirSync(join(RELEASE, 'var'), { recursive: true });
  const priv = join(ROOT, 'var/private');
  if (existsSync(priv) && !existsSync(join(RELEASE, 'var/private'))) symlinkSync(priv, join(RELEASE, 'var/private'));
  const week = join(ROOT, 'var/private/planet/seed-week.js');
  if (existsSync(week) && !existsSync(join(RELEASE, 'apps/planet/seed-week.js'))) symlinkSync(week, join(RELEASE, 'apps/planet/seed-week.js'));
  return join(RELEASE, 'apps/planet-home');
}

// ---------------------------------------------------------------- the private seeds
// One file per week with a planet link, holding the week the link decodes to, plus seeds/latest.js for the newest week
// that has a session in it (what the app's ?seed= names read). A file without this script's header is Ryan's own and
// names the places his runs started in, so it is never touched; a generated one is rewritten only when the week it
// carries changed. The seeds are private either way: nothing here prints their contents.
function writeSeeds(weeks, source) {
  // The header names where the week came from but not when that file was generated: VARÐA regenerates its history
  // every run, and a timestamp here would rewrite every seed each time instead of only the weeks that changed.
  const header = `// planet-sync: generated from ${source}`;
  const decoded = weeks.map((w) => ({ week: w.week, seed: decodePlanet(codeOf(w.link)) }));
  const seedText = (seed) => `${header}\nwindow.SEED = ${JSON.stringify(seed)};\n`;
  const files = decoded.map((w) => [w.week, seedText(w.seed)]);
  const newest = decoded.filter((w) => (w.seed.activities?.length ?? w.seed.totals?.activities ?? 0) > 0).sort((a, b) => (a.week < b.week ? 1 : -1))[0];
  if (newest) files.push(['latest', seedText(newest.seed)]);
  const counts = { written: 0, refreshed: 0, current: 0, kept: 0 };
  mkdirSync(SEEDS, { recursive: true, mode: 0o700 }); // the real weeks live here and nowhere else but this Mac
  for (const [name, text] of files) {
    const file = join(SEEDS, `${name}.js`);
    const existing = existsSync(file) ? readFileSync(file, 'utf8') : null;
    if (existing === null) { writeFileSync(file, text); counts.written++; }
    else if (!existing.startsWith('// planet-sync: generated from ')) counts.kept++;
    else if (existing !== text) { writeFileSync(file, text); counts.refreshed++; }
    else counts.current++;
  }
  // apps/planet/seeds/* is ignored except the synthetic weeks and scripts/dev.sh links the private ones in the same
  // way: a seed has to be reachable there for ?seed=<week> to work in the dev server and the bench.
  mkdirSync(SEED_LINKS, { recursive: true });
  for (const name of readdirSync(SEEDS)) {
    if (!name.endsWith('.js')) continue;
    const link = join(SEED_LINKS, name), target = join(SEEDS, name), was = lstatSync(link, { throwIfNoEntry: false });
    if (was) {
      if (!was.isSymbolicLink()) continue; // a tracked synthetic week, or a file of Ryan's: leave it
      if (readlinkSync(link) === target) continue;
      rmSync(link, { force: true });
    }
    symlinkSync(target, link);
  }
  return counts;
}

// ---------------------------------------------------------------- the deploy, and everything that can hold it
// Nothing is published unless the shelf or the clips changed this run or an earlier one left a marker, and then only
// within this project's 45-minute clock, the monthly allowance it shares with VARÐA, and while the gate file exists
// (PLANET_DEPLOY_GATE is garmin-auto.sh's own deploy.env, which is what pauses the planet when VARÐA is paused). The
// clock is stamped before deploying, so a failed deploy waits as long as a good one.
function publish({ changed, asked, dryRun }) {
  if (!asked) return { state: 'skipped', reason: 'no --publish', line: 'skipped (no --publish)' };
  const pending = join(STATE, 'planet-deploy.pending');
  if (!changed && !existsSync(pending)) return { state: 'unchanged', reason: 'neither the shelf nor the clips changed', line: 'unchanged' };
  if (changed && !dryRun) {
    mkdirSync(STATE, { recursive: true });
    writeFileSync(pending, ''); // remembered even if the deploy has to wait for a clock or an allowance
  }
  const wait = (reason) => ({ state: 'held', reason, line: `held, ${reason}` });
  if (!existsSync(GATE)) return wait('deploys paused');
  const clock = holdClock();
  if (clock) return wait(clock);
  const allowance = holdAllowance();
  if (allowance) return wait(allowance);
  if (dryRun) return { state: 'would-publish', reason: 'dry run', line: 'would deploy (dry run)' };
  writeFileSync(join(STATE, 'planet-last-deploy.at'), String(Math.floor(Date.now() / 1000)));
  if (!deployRelease()) return { state: 'failed', reason: 'the deploy failed', line: 'failed' };
  rmSync(pending, { force: true });
  const n = bumpCount();
  return { state: 'published', reason: `${n} deployed this month`, line: `deployed (${n} this month)` };
}

const holdClock = () => {
  const file = join(STATE, 'planet-last-deploy.at');
  const since = Math.floor(Date.now() / 1000) - Number(existsSync(file) ? readFileSync(file, 'utf8').trim() : 0);
  return since < CLOCK ? `${Math.floor(since / 60)} min since the last (45 apart)` : null;
};

// The two sites' counters together stay within the month's share of 400 so far: 400 × day ÷ days in the month.
const holdAllowance = () => {
  const now = new Date(), month = monthOf(now);
  const total = counter(join(STATE, 'planet-deploys'), month) + counter(join(STATE, 'deploys'), month);
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const share = Math.floor((ALLOWANCE * now.getDate()) / days);
  return total >= share ? `${total} total this month (${share} allowed by today, 400 by the month's end)` : null;
};

const monthOf = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const counter = (file, month) => {
  const [m, n] = existsSync(file) ? readFileSync(file, 'utf8').trim().split(/\s+/) : [];
  return m === month ? Number(n) || 0 : 0;
};

function bumpCount() {
  const month = monthOf(new Date()), n = counter(join(STATE, 'planet-deploys'), month) + 1;
  writeFileSync(join(STATE, 'planet-deploys'), `${month} ${n}\n`);
  return n;
}

// The release tree as it goes out: HEAD (and the real var/private releaseTree links in, where the build and the deploy
// script find the denylist and the gate file this machine has), with the shelf data, the kit's clips this run keeps and
// the demo film's encodes, all in this working tree, the source of truth, copied in.
function stageRelease() {
  const shelf = join(RELEASE, 'apps/planet-home/shelf'), kit = join(ROOT, 'apps/planet-home/kit'), kitOut = join(RELEASE, 'apps/planet-home/kit');
  copyFileSync(join(ROOT, 'apps/planet-home/shelf/ryan.json'), join(shelf, 'ryan.json'));
  rmSync(join(shelf, 'ryan'), { recursive: true, force: true });
  cpSync(join(ROOT, 'apps/planet-home/shelf/ryan'), join(shelf, 'ryan'), { recursive: true });
  rmSync(join(kitOut, 'media'), { recursive: true, force: true }); // a clip gone from here is gone from there
  for (const f of ['kit.json', 'media']) if (existsSync(join(kit, f))) cpSync(join(kit, f), join(kitOut, f), { recursive: true });
  const demo = join(ROOT, 'apps/planet-home/demo/media'), demoOut = join(RELEASE, 'apps/planet-home/demo/media');
  rmSync(demoOut, { recursive: true, force: true });
  if (existsSync(demo)) cpSync(demo, demoOut, { recursive: true });
}

function deployRelease() {
  stageRelease();
  return spawnSync('bash', [join(RELEASE, 'scripts/planet-home-deploy.sh')], { cwd: RELEASE, stdio: 'inherit' }).status === 0;
}

// ---------------------------------------------------------------- the phone kit's clips
// A kind is due when its week, or that week's planet, changed since its clips were made (story-render.mjs dueKinds):
// the day's at each new session, the week's at the first run after a week ends. They're painted from a build of the
// release tree with this run's shelf in it, and the deploy's own build then carries them out. A failed render holds
// nothing else back: what it did make still goes out.
async function paintClips({ rows, dryRun }) {
  const due = dueKinds(rows), weeks = kitWeeks(rows), before = JSON.stringify(readKit());
  const named = due.map((kind) => `${kind === 'day' ? 'the week so far' : 'the week'} of ${weeks[kind].week}`).join(' and ');
  if (!due.length) return { state: 'current', changed: false, line: 'current' };
  if (dryRun) return { state: 'would-paint', changed: true, line: `would paint ${named}` };
  let failure = null;
  try {
    if (!existsSync(join(RELEASE, 'apps/planet-home/story/index.html'))) throw new Error('HEAD has no story/ page to paint them with');
    stageRelease();
    const build = spawnSync('bun', ['scripts/planet-home-build.mjs'], { cwd: RELEASE, encoding: 'utf8' });
    if (build.status !== 0) throw new Error(`the build failed: ${(build.stderr || build.stdout || '').trim().split('\n').pop()}`);
    await renderKit({ dist: join(RELEASE, 'var/planet-home-dist'), kinds: due, log: () => {} });
  } catch (e) {
    failure = oneLine(e);
  }
  const changed = JSON.stringify(readKit()) !== before;
  return failure ? { state: 'failed', reason: failure, changed, line: `failed, ${failure}` } : { state: 'painted', changed, line: `painted ${named}` };
}

// ---------------------------------------------------------------- one run
// One run at a time (var/sync/lock; a lock older than 30 minutes is a crashed run's): two runs would fight over the
// stills, and painting is one browser at a time.
const lock = () => {
  mkdirSync(dirname(LOCK), { recursive: true });
  for (let tries = 0; tries < 2; tries++) {
    try {
      mkdirSync(LOCK);
      writeFileSync(join(LOCK, 'pid'), `${process.pid}\n`);
      return null;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let age = STALE;
      try { age = Date.now() - statSync(LOCK).mtimeMs; } catch { continue; }
      if (age < STALE * 1000) return `another run holds var/sync/lock (${Math.max(1, Math.round(age / 60000))} min old)`;
      rmSync(LOCK, { recursive: true, force: true }); // a crashed run's
    }
  }
  return 'another run holds var/sync/lock';
};

async function run() {
  if (unknown.length) return failed(`unknown flag ${unknown[0]}`);
  const publishAsked = PUBLISH, dryRun = DRY, force = FORCE;
  const busy = lock();
  if (busy) return held(busy);
  try {
    const { weeks: linked, source, generatedAt } = await history(); // honours PLANET_HISTORY
    const weeks = linked.map((w) => ({ week: w.start, link: w.planetLink }));
    say(`planet-sync: ${plural(weeks.length, 'week')} from ${source}${generatedAt ? ` (${generatedAt})` : ''}${dryRun ? ' — dry run' : ''}`);
    const seeds = writeSeeds(weeks, source);
    say(`seeds: ${seeds.written} written, ${seeds.refreshed} refreshed, ${seeds.current} current${seeds.kept ? `, ${seeds.kept} hand-written kept` : ''}`);
    const head = git(['rev-parse', 'HEAD']);
    const look = lookOf(ROOT);
    const home = dryRun ? join(ROOT, 'apps/planet-home') : releaseTree(head);
    say(`release: var/sync/release at ${head.slice(0, 7)}${dryRun ? ' (not touched)' : ''}`);
    const shelf = await syncShelf({ force, home, weeks, source, look, dryRun, log: () => {} });
    const worked = shelf.jobs.length;
    say(`shelf: ${dryRun && worked ? `would paint ${plural(worked, 'week')} (${shelf.jobs.join(', ')})`
      : worked ? `painted ${plural(worked, 'week')} (${shelf.jobs.join(', ')})`
        : shelf.changed ? 'ryan.json changed, nothing to paint' : 'unchanged'} · ${plural(shelf.weeks.length, 'week')} in ryan.json`);
    const clips = await paintClips({ rows: shelf.weeks, dryRun });
    say(`clips: ${clips.line}`);
    const pub = publish({ changed: shelf.changed || clips.changed, asked: publishAsked, dryRun });
    say(`publish: ${pub.line}`);
    return {
      status: pub.state === 'failed' ? `failed: ${pub.reason}` : clips.state === 'failed' ? `failed: clips: ${clips.reason}` : pub.state === 'held' ? `held: ${pub.reason}`
        : pub.state === 'published' ? 'published' : shelf.changed || clips.changed ? 'changed' : 'unchanged',
      weeks: shelf.weeks.length, painted: shelf.painted, paintedWeeks: shelf.jobs,
      seedsWritten: seeds.written + seeds.refreshed, look, clips: { state: clips.state, ...(clips.reason && { reason: clips.reason }) },
      publish: { state: pub.state, reason: pub.reason },
    };
  } finally {
    rmSync(LOCK, { recursive: true, force: true });
  }
}

const result = await run().catch((e) => failed(e));
console.log(JSON_OUT ? JSON.stringify(result) : `planet-sync: ${result.status}`);
process.exitCode = result.status.startsWith('failed') ? 1 : 0;

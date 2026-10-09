// Race-week anchor pin: the sky, the orbit and the monument's ground.
//
// Re-baselined 2026-09-24 (mirror fix). The survey textures (tLand, tCoast, tSun)
// had been read mirrored in latitude since round 2, so the orbit sea painted
// mirrored land as shelf and coast mottle, and the ground's form light and
// cast shadows followed the mirrored terrain. With the survey read the right
// way up, round 5's orbit is no longer the right answer: the orbit is compared
// against the corrected capture in shots/anchor/ (its limit drops from 6.0 to
// the sky's 2.5, as it no longer carries round 5's drift), and a check of the
// monument's ground (its terrain rows) against a corrected capture is added so
// the race surface cannot drift silently again.
//
// Re-baselined 2026-10-09 (public repo). Those anchors were painted from the
// private race week (seed-week.js), whose monument label names the race and its
// town. Every capture now paints the made-up race week
// (seeds/synthetic-cold-hard.js), and the sky is compared against its monument
// anchor, as the ground is. The sky still matched round 5's capture exactly
// (MAD 0.000) when it moved, so its painting had not drifted from round 5.
//   bun apps/planet/_sky-pin.mjs [--write]   --write re-pins: both captures go into shots/anchor/
//
// The race ring (companions.race, on by default) is not part of this pin: it
// arches across the monument's sky and pulls the poster back, and it is judged
// on walls instead. Every capture here turns it off, so the pin keeps guarding
// the painting itself against its anchors.
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const WIDTH = 1440;
const HEIGHT = 900;
const SKY_LIMIT = 2.5;
const ORBIT_LIMIT = 2.5;
const SURFACE_LIMIT = 2.5;
const root = new URL('.', import.meta.url);
const port = process.env.INK_PIN_PORT || '8951';
const capture = join(homedir(), '.omp/agent/skills/browser-lab/capture.ts');
const work = mkdtempSync(join(tmpdir(), 'ink-sky-pin-'));
const SEED = 'synthetic-cold-hard';
const WRITE = process.argv.includes('--write');
const anchor = (view) => new URL(`shots/anchor/${SEED}-${view}.png`, root).pathname;

// The shots are tracked, so public: --write takes a synthetic week only, never seed-week.js (what a capture with no
// ?seed= paints), a private week or a share code.
function synthetic(query) {
  const seed = new URLSearchParams(query).get('seed');
  if (!query.includes('#') && /^synthetic-[\w-]+$/.test(seed ?? '')) return;
  const week = query.includes('#') ? 'a share code' : seed ? `seed ${seed}` : 'seed-week.js';
  throw new Error(`sky-pin --write: refusing ${week}; apps/planet/shots/ takes synthetic seeds only`);
}

async function captureFrame(name, query) {
  const out = join(work, `${name}.png`);
  const proc = Bun.spawn([
    'bun', capture, `http://127.0.0.1:${port}/ink.html?${query}`,
    '--viewport', `${WIDTH}x${HEIGHT}`,
    '--wait-for', '[data-pc-ready]', '--wait-ms', '1500', '--out', out,
  ], { stdout: 'pipe', stderr: 'pipe' });
  const [status, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  if (status !== 0) throw new Error(`capture ${name} failed\n${stdout}\n${stderr}`);
  return out;
}

function rgb(path) {
  const proc = Bun.spawnSync([
    'ffmpeg', '-v', 'error', '-i', path,
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1',
  ]);
  if (proc.exitCode !== 0) throw new Error(`decode ${path} failed\n${proc.stderr.toString()}`);
  if (proc.stdout.length !== WIDTH * HEIGHT * 3) throw new Error(`unexpected image size for ${path}`);
  return proc.stdout;
}

function mad(actual, expected, include) {
  let error = 0;
  let pixels = 0;
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const i = (y * WIDTH + x) * 3;
      if (!include(x, y, expected, i)) continue;
      error += Math.abs(actual[i] - expected[i]);
      error += Math.abs(actual[i + 1] - expected[i + 1]);
      error += Math.abs(actual[i + 2] - expected[i + 2]);
      pixels++;
    }
  }
  return { value: error / (pixels * 3), pixels };
}

// The pin guards the painting itself, so it turns off what round 5 laid round it by default: the race ring, the world
// (auto: the world the week fits) and the body (the race week would be a star), deep space, the week's sun and
// phenomena, the poster shot, the print, the clock and
// the atmosphere's limb, the orbit's weather, the week's life and the drawn runner; and round 13's beauty dials (the air
// across the lit face, the sea's glint, the giants' own light and eddies, the clouds' shadows underfoot, the star as a
// light, the comet's form, the space's ridge, the ring's mass, the gas giant's storms, the lava's fractures, the globe's
// turn of light, the orbit clouds' depth and the distance underfoot; the sea's mineral, the ground's season and soil).
const PAINTING = [
  'companions.race=0', 'world.archetype=classic', 'world.body=rock', 'sky.space=0', 'system.sun=0', 'system.phenomena=0',
  'poster.shot=classic', 'look.print=ink', 'motion.living=0', 'light.atmosphere=0', 'sky.orbitClouds=0',
  'life.amount=0', 'runner.look=0', 'light.scatter=0', 'sea.glint=0', 'body.form=0', 'giant.eddies=0',
  'sky.cloudShade=0', 'system.light=0', 'system.comet=0', 'sky.ridge=0', 'companions.ringMass=0',
  'giant.storms=0', 'lava.fractures=0', 'light.form=0', 'sky.cloudDepth=0', 'light.aerial=0',
  'sea.mineral=0', 'ground.season=0', 'ground.soil=0',
  // the space's month, the star's hours and the bodies' own colour
  'sky.month=0', 'system.hourSun=0', 'body.tint=0',
].map((kv) => `p.${kv}`).join('&');

const MONUMENT = `seed=${SEED}&view=surface&t=4&at=monument&${PAINTING}`;
const ORBIT = `seed=${SEED}&view=orbit&t=4&${PAINTING}`;

try {
  if (WRITE) [MONUMENT, ORBIT].forEach(synthetic);
  const [monumentPath, orbitPath] = await Promise.all([
    captureFrame('monument', MONUMENT),
    captureFrame('orbit', ORBIT),
  ]);
  if (WRITE) {
    copyFileSync(monumentPath, anchor('monument'));
    copyFileSync(orbitPath, anchor('orbit'));
    console.log(`sky-pin wrote shots/anchor/${SEED}-monument.png and ${SEED}-orbit.png`);
  }
  const monument = rgb(monumentPath);
  const monumentRef = rgb(anchor('monument'));
  const orbit = rgb(orbitPath);
  const orbitRef = rgb(anchor('orbit'));

  // The centre exclusion removes the monument, which rises through otherwise clear sky. The top band left of the
  // monument is the page's own site nav (round 11, ink.html), which stands over the canvas and is not the painting.
  const sky = mad(monument, monumentRef, (x, y) => y < 300 && (x < 610 || x > 830) && !(y < 124 && x < 860));
  // Compare painted globe interior, away from the limb, excluding the near-paper ice.
  const orbitInterior = mad(orbit, orbitRef, (x, y, ref, i) => {
    const dx = x - 720;
    const dy = y - 450;
    const light = 0.2126 * ref[i] + 0.7152 * ref[i + 1] + 0.0722 * ref[i + 2];
    return dx * dx + dy * dy < 260 * 260 && light < 205;
  });
  // The monument's ground: the terrain rows below the peaks, with the race line
  // on them, less the runner (his own rig) and the HUD along the bottom.
  const surface = mad(monument, monumentRef, (x, y) => y >= 480 && y < 840 && !(x >= 665 && x < 775 && y < 625));

  const failures = [];
  if (sky.value > SKY_LIMIT) failures.push(`sky MAD ${sky.value.toFixed(3)} > ${SKY_LIMIT.toFixed(1)}`);
  if (orbitInterior.value > ORBIT_LIMIT) failures.push(`orbit MAD ${orbitInterior.value.toFixed(3)} > ${ORBIT_LIMIT.toFixed(1)}`);
  if (surface.value > SURFACE_LIMIT) failures.push(`surface MAD ${surface.value.toFixed(3)} > ${SURFACE_LIMIT.toFixed(1)}`);
  console.log(`sky-pin ${failures.length ? 'FAIL' : 'PASS'}`);
  console.log(`sky MAD ${sky.value.toFixed(3)} RGB levels across ${sky.pixels} px (limit ${SKY_LIMIT.toFixed(1)})`);
  console.log(`orbit interior MAD ${orbitInterior.value.toFixed(3)} RGB levels across ${orbitInterior.pixels} px (limit ${ORBIT_LIMIT.toFixed(1)})`);
  console.log(`surface MAD ${surface.value.toFixed(3)} RGB levels across ${surface.pixels} px (limit ${SURFACE_LIMIT.toFixed(1)})`);
  for (const failure of failures) console.error(`- ${failure}`);
  if (failures.length) process.exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}

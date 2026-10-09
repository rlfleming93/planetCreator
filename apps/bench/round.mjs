// A tuning round is evidence, not a convenient screenshot dump. This command therefore drives the real planet app
// through the bench's same-origin server, pins every sampled instant, captures the renderer's own canvas, and refuses
// to publish a round until every final still has measurable image variation. Work is staged under private var/bench so
// an interrupted capture cannot masquerade as a complete round; the only committed directory is one with its manifest
// written last. Playwright keeps one WebGL context alive for each 180-frame take: world-motion clips call __app.frame(t),
// while the camera transition adds an explicit deterministic delta to that hook. ffmpeg only composes and encodes.
// The browser stage — Chrome, the page, the stills — lives in capture.mjs, shared with wall.mjs's contact sheets.
import { mkdir, mkdtemp, readdir, readFile, realpath, rename, rmdir, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  benchRoot, captureCanvas, callFrame, isWithin, launchBench, locateChrome, makeUrl, maybeStat, openPlanet,
  playwrightPath, posix, repoRoot, requireExecutable, VIEWPORT,
} from './capture.mjs';

const roundsRoot = join(benchRoot, 'rounds');
const snapshotsRoot = join(benchRoot, 'snapshots');
const PERF_BUDGET = Object.freeze({ reportedFrameMsMax: 20.5, frameCallP95MsMax: 33.34, maxAdaptiveDprSteps: 0, requiredDpr: 1 });
const CLIP_FRAMES = 180;
const CLIP_FPS = 30;
const CLOSEUP_KINDS = Object.freeze({
  wheel: 'wheel',
  calm: 'grove',
  lagoon: 'lagoon',
  spires: 'spires',
  constructed: 'treadmill',
  cairn: 'cairn',
  pitch: 'pitch',
  monument: 'monument',
});
const ROLES = Object.freeze({
  orbit: 'orbit',
  yaw: 'yaw8',
  time: 'time8',
  surface: 'surface-monument',
  clip: 'motion',
  held: 'orbit-held',
  transition: 'orbit-surface-transition',
});

const usage = `Usage: bun apps/bench/round.mjs --set <snapshot|default> [--panel <core|extended|all>] [--clips <id,id>] [--closeups <id,id>] [--transition <id>] [--out var/bench/rounds/<n>]`;
const plainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const round3 = (value) => Math.round(value * 1000) / 1000;

function parseArgs(argv) {
  const parsed = { panel: 'core', clips: [], closeups: [], transition: null };
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--help' || key === '-h') return { help: true };
    if (!['--set', '--panel', '--clips', '--closeups', '--transition', '--out'].includes(key)) throw new Error(`Unknown argument ${key}.\n${usage}`);
    if (seen.has(key)) throw new Error(`${key} may be supplied only once.`);
    seen.add(key);
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`${key} needs a value.\n${usage}`);
    if (key === '--set') parsed.set = value;
    else if (key === '--panel') parsed.panel = value;
    else if (key === '--out') parsed.out = value;
    else if (key === '--transition') parsed.transition = value;
    else {
      const ids = value.split(',').map((id) => id.trim());
      if (ids.some((id) => !id)) throw new Error(`${key} must be a comma-separated list of nonempty panel ids.`);
      if (new Set(ids).size !== ids.length) throw new Error(`${key} contains the same id more than once.`);
      if (key === '--clips') parsed.clips = ids;
      else parsed.closeups = ids;
    }
  }
  if (!parsed.set) throw new Error(`--set is required.\n${usage}`);
  if (!['core', 'extended', 'all'].includes(parsed.panel)) throw new Error(`--panel must be core, extended, or all; received ${parsed.panel}.`);
  return parsed;
}

async function locateFfmpeg() {
  const candidates = [process.env.FFMPEG, typeof Bun.which === 'function' ? Bun.which('ffmpeg') : null,
    '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'];
  for (const candidate of candidates) {
    const found = await requireExecutable(candidate);
    if (found) return found;
  }
  throw new Error('ffmpeg was not found. Set FFMPEG or install it in PATH, /opt/homebrew/bin, or /usr/local/bin.');
}

async function run(command, args, label) {
  const proc = Bun.spawn([command, ...args], { stdout: 'pipe', stderr: 'pipe' });
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).arrayBuffer(),
    new Response(proc.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(`${label} failed (${exitCode})${stderr.trim() ? `: ${stderr.trim()}` : ''}`);
  return { stdout: Buffer.from(stdout), stderr };
}

function variance(rgb) {
  const count = rgb.length / 3;
  let sum = 0;
  let sumSquares = 0;
  let low = Infinity;
  let high = -Infinity;
  for (let i = 0; i < rgb.length; i += 3) {
    const y = 0.2126 * rgb[i] + 0.7152 * rgb[i + 1] + 0.0722 * rgb[i + 2];
    sum += y;
    sumSquares += y * y;
    low = Math.min(low, y);
    high = Math.max(high, y);
  }
  const mean = sum / count;
  return { lumaStdDev: Math.sqrt(Math.max(0, sumSquares / count - mean * mean)), lumaRange: high - low };
}

async function assertNonblank(ffmpeg, path, label) {
  const { stdout } = await run(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-i', path, '-vf', 'scale=32:32:flags=area',
    '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1',
  ], `nonblank check for ${label}`);
  if (stdout.length !== 32 * 32 * 3) throw new Error(`${label} decoded to ${stdout.length} RGB bytes; expected ${32 * 32 * 3}.`);
  const result = variance(stdout);
  if (result.lumaStdDev < 3 || result.lumaRange < 18) {
    throw new Error(`${label} is blank or nearly blank (luma σ ${result.lumaStdDev.toFixed(2)}, range ${result.lumaRange.toFixed(2)}).`);
  }
  return { lumaStdDev: round3(result.lumaStdDev), lumaRange: round3(result.lumaRange) };
}

async function assertVideoNonblank(ffmpeg, path, label) {
  const { stdout } = await run(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-i', path, '-vf', 'fps=1,scale=32:32:flags=area',
    '-frames:v', '6', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1',
  ], `video check for ${label}`);
  const frameBytes = 32 * 32 * 3;
  if (stdout.length !== frameBytes * 6) throw new Error(`${label} did not decode to six one-second samples.`);
  let weakest = { lumaStdDev: Infinity, lumaRange: Infinity };
  for (let i = 0; i < 6; i++) {
    const result = variance(stdout.subarray(i * frameBytes, (i + 1) * frameBytes));
    if (result.lumaStdDev < 3 || result.lumaRange < 18) throw new Error(`${label} contains a blank sample at second ${i}.`);
    weakest = { lumaStdDev: Math.min(weakest.lumaStdDev, result.lumaStdDev), lumaRange: Math.min(weakest.lumaRange, result.lumaRange) };
  }
  return { sampledFrames: 6, weakestLumaStdDev: round3(weakest.lumaStdDev), weakestLumaRange: round3(weakest.lumaRange) };
}

async function composeStrip(ffmpeg, inputs, output, label) {
  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  for (const input of inputs) args.push('-i', input);
  args.push('-filter_complex', `hstack=inputs=${inputs.length}`, '-frames:v', '1', output);
  await run(ffmpeg, args, `compose ${label}`);
}

function cleanStem(item) {
  const raw = String(item.week || item.id || '');
  const stem = raw.normalize('NFKD').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!stem) throw new Error(`Panel item ${String(item.id)} has no usable filename id.`);
  return stem;
}

function frameStats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (p) => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
  return {
    count: samples.length,
    minMs: round3(sorted[0]),
    medianMs: round3(percentile(0.5)),
    p95Ms: round3(percentile(0.95)),
    maxMs: round3(sorted.at(-1)),
    meanMs: round3(samples.reduce((sum, value) => sum + value, 0) / samples.length),
  };
}

async function runtimeDetails(page) {
  return page.evaluate(() => {
    const app = window.__app;
    if (typeof app?.debug?.perf !== 'function') throw new Error('window.__app.debug.perf() is unavailable');
    if (typeof app?.params !== 'function') throw new Error('window.__app.params() is unavailable');
    const renderer = app.renderer;
    const gl = renderer.getContext();
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    const safe = (token) => { try { return gl.getParameter(token); } catch { return null; } };
    return {
      params: app.params(),
      perf: app.debug.perf(),
      renderer: {
        webgl: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext ? 2 : 1,
        vendor: safe(gl.VENDOR),
        renderer: safe(gl.RENDERER),
        unmaskedVendor: extension ? safe(extension.UNMASKED_VENDOR_WEBGL) : null,
        unmaskedRenderer: extension ? safe(extension.UNMASKED_RENDERER_WEBGL) : null,
        version: safe(gl.VERSION),
        shadingLanguageVersion: safe(gl.SHADING_LANGUAGE_VERSION),
        maxTextureSize: safe(gl.MAX_TEXTURE_SIZE),
        antialias: gl.getContextAttributes()?.antialias ?? null,
        drawingBuffer: { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight },
        render: { ...renderer.info.render },
        memory: { ...renderer.info.memory },
      },
    };
  });
}

function verifyEffectiveParams(expected, actual) {
  if (!plainObject(actual)) throw new Error('window.__app.params() did not return an object.');
  const wrong = Object.entries(expected).filter(([key, value]) => actual[key] !== value).map(([key]) => key);
  if (wrong.length) throw new Error(`The app did not apply ${wrong.length} requested parameter(s): ${wrong.slice(0, 8).join(', ')}${wrong.length > 8 ? ', …' : ''}`);
}

function perfFor(reported, observed) {
  const failures = [];
  if (!Number.isFinite(reported?.frameMs) || reported.frameMs > PERF_BUDGET.reportedFrameMsMax) {
    failures.push(`reported frame ${String(reported?.frameMs)} ms > ${PERF_BUDGET.reportedFrameMsMax} ms`);
  }
  if (observed.p95Ms > PERF_BUDGET.frameCallP95MsMax) failures.push(`frame() p95 ${observed.p95Ms} ms > ${PERF_BUDGET.frameCallP95MsMax} ms`);
  if (!Number.isFinite(reported?.steps) || reported.steps > PERF_BUDGET.maxAdaptiveDprSteps) failures.push(`adaptive DPR steps ${String(reported?.steps)} > ${PERF_BUDGET.maxAdaptiveDprSteps}`);
  if (reported?.dpr !== PERF_BUDGET.requiredDpr) failures.push(`DPR ${String(reported?.dpr)} != ${PERF_BUDGET.requiredDpr}`);
  return { pass: failures.length === 0, failures };
}

async function composeSheet(page, entries, output, title) {
  const tiles = await Promise.all(entries.map(async (entry) => ({
    label: entry.label,
    note: entry.note || '',
    data: entry.path ? `data:image/png;base64,${(await readFile(entry.path)).toString('base64')}` : null,
  })));
  await page.setContent('<!doctype html><meta charset="utf-8"><canvas id="sheet"></canvas>');
  const png = await page.evaluate(async ({ tiles, title }) => {
    const columns = Math.min(3, Math.max(1, tiles.length));
    const tileWidth = 320;
    const imageHeight = 288;
    const labelHeight = 58;
    const gap = 12;
    const top = 54;
    const rows = Math.max(1, Math.ceil(tiles.length / columns));
    const canvas = document.querySelector('#sheet');
    canvas.width = columns * tileWidth + (columns + 1) * gap;
    canvas.height = top + rows * (imageHeight + labelHeight + gap) + gap;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#e8e1d3';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1f2930';
    ctx.font = '600 24px system-ui, sans-serif';
    ctx.fillText(title, gap, 34);
    const load = (src) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('sheet image failed to load'));
      image.src = src;
    });
    for (let index = 0; index < Math.max(tiles.length, 1); index++) {
      const tile = tiles[index] || { label: 'No panel weeks', note: 'Nothing was selected.', data: null };
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = gap + column * (tileWidth + gap);
      const y = top + row * (imageHeight + labelHeight + gap);
      ctx.fillStyle = '#f8f4eb';
      ctx.fillRect(x, y, tileWidth, imageHeight + labelHeight);
      if (tile.data) {
        const image = await load(tile.data);
        const scale = Math.min(tileWidth / image.width, imageHeight / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        ctx.drawImage(image, x + (tileWidth - width) / 2, y + (imageHeight - height) / 2, width, height);
      } else {
        ctx.strokeStyle = '#9b6a55';
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 18, y + 18, tileWidth - 36, imageHeight - 36);
        ctx.beginPath();
        ctx.moveTo(x + 32, y + 32);
        ctx.lineTo(x + tileWidth - 32, y + imageHeight - 32);
        ctx.moveTo(x + tileWidth - 32, y + 32);
        ctx.lineTo(x + 32, y + imageHeight - 32);
        ctx.stroke();
        ctx.fillStyle = '#513f37';
        ctx.font = '600 19px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(tile.note || 'No capture', x + tileWidth / 2, y + imageHeight / 2 + 7, tileWidth - 48);
        ctx.textAlign = 'left';
      }
      ctx.strokeStyle = '#b8aa98';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, tileWidth - 1, imageHeight + labelHeight - 1);
      ctx.fillStyle = '#20262a';
      ctx.font = '600 15px system-ui, sans-serif';
      ctx.fillText(tile.label, x + 10, y + imageHeight + 23, tileWidth - 20);
      if (tile.note && tile.data) {
        ctx.fillStyle = '#655b52';
        ctx.font = '13px system-ui, sans-serif';
        ctx.fillText(tile.note, x + 10, y + imageHeight + 45, tileWidth - 20);
      }
    }
    return canvas.toDataURL('image/png').split(',')[1];
  }, { tiles, title });
  await Bun.write(output, Buffer.from(png, 'base64'));
}

async function loadParams(setName, SPEC, DEFAULTS) {
  const values = { ...DEFAULTS };
  if (setName !== 'default') {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(setName)) throw new Error('--set must be "default" or a snapshot name containing only letters, digits, dots, _ and -.');
    const path = join(snapshotsRoot, `${setName}.json`);
    const stat = await maybeStat(path);
    if (!stat?.isFile()) throw new Error(`Snapshot ${setName} is missing at ${path}.`);
    let saved;
    try { saved = JSON.parse(await readFile(path, 'utf8')); }
    catch (error) { throw new Error(`Snapshot ${setName} is not valid JSON: ${error.message}`); }
    const overrides = plainObject(saved?.params) ? saved.params : saved;
    if (!plainObject(overrides)) throw new Error(`Snapshot ${setName} must contain a parameter object or a { "params": { ... } } object.`);
    const byKey = new Map(SPEC.map((entry) => [entry.key, entry]));
    const unknown = Object.keys(overrides).filter((key) => !byKey.has(key));
    if (unknown.length) throw new Error(`Snapshot ${setName} has unknown parameter(s): ${unknown.join(', ')}.`);
    for (const [key, value] of Object.entries(overrides)) {
      const spec = byKey.get(key);
      if (Array.isArray(spec.options)) {
        if (typeof value !== 'string' || !spec.options.includes(value.toLowerCase())) throw new Error(`Snapshot parameter ${key} must be one of ${spec.options.join(', ')}.`);
      } else if (typeof spec.default === 'number') {
        if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Snapshot parameter ${key} must be a finite number.`);
        if (value < spec.min || value > spec.max) throw new Error(`Snapshot parameter ${key}=${value} is outside ${spec.min}..${spec.max}.`);
      } else if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) {
        throw new Error(`Snapshot parameter ${key} must be a #rrggbb colour.`);
      }
      values[key] = typeof spec.default === 'number' ? value : value.toLowerCase();
    }
  }
  const ordered = {};
  for (const spec of SPEC) ordered[spec.key] = values[spec.key];
  return ordered;
}

async function nextRoundPath() {
  await mkdir(roundsRoot, { recursive: true });
  const entries = await readdir(roundsRoot).catch((error) => error?.code === 'ENOENT' ? [] : Promise.reject(error));
  let highest = 0;
  for (const name of entries) {
    const match = /^r(\d+)$/.exec(name);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return join(roundsRoot, `r${highest + 1}`);
}

async function prepareTarget(raw) {
  const target = raw ? (isAbsolute(raw) ? resolve(raw) : resolve(repoRoot, raw)) : await nextRoundPath();
  if (!isWithin(benchRoot, target) || target === benchRoot) throw new Error(`--out must stay under ${benchRoot}.`);
  await mkdir(dirname(target), { recursive: true });
  const [realBench, realParent] = await Promise.all([realpath(benchRoot), realpath(dirname(target))]);
  if (!isWithin(realBench, realParent)) throw new Error(`--out resolves outside private ${benchRoot}.`);
  const stat = await maybeStat(target);
  if (stat && !stat.isDirectory()) throw new Error(`Refusing to overwrite non-directory ${target}.`);
  if (stat && (await readdir(target)).length) throw new Error(`Refusing to overwrite nonempty output directory ${target}.`);
  return target;
}

async function commitStage(stage, target) {
  const stat = await maybeStat(target);
  if (stat) {
    if (!stat.isDirectory() || (await readdir(target)).length) throw new Error(`Output directory became nonempty during capture: ${target}.`);
    await rmdir(target);
  }
  await rename(stage, target);
}

async function encodeClipFrames(ffmpeg, frameDir, output, label) {
  const entries = (await readdir(frameDir)).filter((name) => name.endsWith('.png'));
  if (entries.length !== CLIP_FRAMES) throw new Error(`${label} produced ${entries.length} clip frames; expected exactly ${CLIP_FRAMES}.`);
  const { stdout } = await run(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(CLIP_FPS), '-start_number', '0',
    '-i', join(frameDir, '%06d.png'), '-frames:v', String(CLIP_FRAMES), '-an', '-c:v', 'libx264',
    '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-x264-params', 'keyint=60:min-keyint=60:scenecut=0', '-progress', 'pipe:1', '-nostats', output,
  ], `encode ${label}`);
  if (!/(?:^|\n)frame=180(?:\n|$)/.test(stdout.toString())) throw new Error(`${label} encoder did not report exactly 180 output frames.`);
  return assertVideoNonblank(ffmpeg, output, label);
}

async function captureClip({
  page, pageErrors, ffmpeg, origin, item, encodedParams, tempRoot, output, label,
  view = 'orbit', yaw = 0, at = null, progress = 'clip', timeOffset = 0,
}) {
  const frameDir = await mkdtemp(join(tempRoot, `${cleanStem(item)}-${progress}-`));
  const durations = [];
  try {
    await openPlanet(page, makeUrl(origin, item, encodedParams, { t: timeOffset, view, yaw, at }), `${label} ${progress}`, pageErrors);
    for (let i = 0; i < CLIP_FRAMES; i++) {
      durations.push(await callFrame(page, timeOffset + i / CLIP_FPS));
      const frame = join(frameDir, `${String(i).padStart(6, '0')}.png`);
      await captureCanvas(page, frame, `${label} ${progress} frame ${i + 1}`);
      if (i === 0 || i === 90 || i === CLIP_FRAMES - 1) await assertNonblank(ffmpeg, frame, `${label} ${progress} frame ${i + 1}`);
      if ((i + 1) % 60 === 0) console.log(`round: ${item.id} ${progress} ${i + 1}/${CLIP_FRAMES}`);
    }
    return {
      frameCalls: frameStats(durations),
      check: await encodeClipFrames(ffmpeg, frameDir, output, `${label} ${progress}`),
    };
  } finally {
    await rm(frameDir, { recursive: true, force: true });
  }
}

function representativeFeatures(features) {
  return Object.entries(CLOSEUP_KINDS).flatMap(([featureKind, kind]) => {
    const feature = features.find((candidate) => candidate.kind === featureKind);
    return feature ? [{ kind, featureKind, featureId: feature.id }] : [];
  });
}

async function captureFeatureCloseups({
  page, pageErrors, ffmpeg, origin, item, encodedParams, tempRoot, stage, checks, label, representatives,
}) {
  const stem = cleanStem(item);
  const closeups = [];
  for (const representative of representatives) {
    const file = `clips/${stem}-${representative.kind}-close.mp4`;
    const captured = await captureClip({
      page, pageErrors, ffmpeg, origin, item, encodedParams, tempRoot,
      output: join(stage, file), label, view: 'surface', at: representative.featureId,
      progress: `${representative.kind} close-up`,
    });
    checks.videos[file] = captured.check;
    closeups.push({ ...representative, file, frameCalls: captured.frameCalls });
  }
  return closeups;
}

async function captureTransitionClip({
  page, pageErrors, ffmpeg, origin, item, encodedParams, tempRoot, output, label, at,
}) {
  const frameDir = await mkdtemp(join(tempRoot, `${cleanStem(item)}-transition-`));
  try {
    await openPlanet(page, makeUrl(origin, item, encodedParams, { view: 'orbit', yaw: 0, at }), `${label} transition`, pageErrors);
    // Pin both simulation time and orbit pose before the flight. setMode and the first stepped frame share one browser
    // task so no ordinary RAF can see an unstepped transition and apply the app's legacy instant fixed-clock landing.
    await callFrame(page, 0);
    const step = 1 / CLIP_FPS;
    for (let i = 0; i < CLIP_FRAMES; i++) {
      const time = (i + 1) * step;
      if (i === 0) {
        await page.evaluate(async ({ time: at, delta }) => {
          window.__app.setMode('surface');
          await window.__app.frame(at, delta);
        }, { time, delta: step });
      } else {
        await callFrame(page, time, step);
      }
      const frame = join(frameDir, `${String(i).padStart(6, '0')}.png`);
      await captureCanvas(page, frame, `${label} transition frame ${i + 1}`);
      if (i === 0 || i === 59 || i === 90 || i === CLIP_FRAMES - 1) {
        await assertNonblank(ffmpeg, frame, `${label} transition frame ${i + 1}`);
      }
      if ((i + 1) % 60 === 0) console.log(`round: ${item.id} transition ${i + 1}/${CLIP_FRAMES}`);
    }
    const mode = await page.evaluate(() => window.__app?.mode);
    if (mode !== 'surface') throw new Error(`${label} transition did not finish in surface mode; received ${String(mode)}.`);
    return {
      clock: {
        source: 'camera easing uses an explicit __app.frame(time, delta) render delta, not uTime',
        deterministicCapture: 'absolute uTime plus 1/30-second frame deltas; native performance.now retained for work budgets',
        stepMs: round3(step * 1000),
        frames: CLIP_FRAMES,
        fps: CLIP_FPS,
        durationSeconds: CLIP_FRAMES / CLIP_FPS,
        transitionSeconds: 2,
      },
      check: await encodeClipFrames(ffmpeg, frameDir, output, `${label} orbit-to-surface transition`),
    };
  } finally {
    await rm(frameDir, { recursive: true, force: true });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(usage); return; }
  await mkdir(benchRoot, { recursive: true });

  const [{ buildPanel }, { startBenchServer }, paramsModule, playwright] = await Promise.all([
    import('./panel.mjs'),
    import('./serve.mjs'),
    import('../planet/params.js'),
    import(pathToFileURL(playwrightPath).href),
  ]);
  const { SPEC, DEFAULTS, encodeParams } = paramsModule;
  if (!Array.isArray(SPEC) || !plainObject(DEFAULTS) || typeof encodeParams !== 'function') throw new Error('apps/planet/params.js does not expose SPEC, DEFAULTS, and encodeParams().');
  if (typeof buildPanel !== 'function') throw new Error('apps/bench/panel.mjs does not expose buildPanel().');
  if (typeof startBenchServer !== 'function') throw new Error('apps/bench/serve.mjs does not expose startBenchServer().');
  if (!playwright?.chromium) throw new Error(`Playwright Chromium is unavailable from ${playwrightPath}.`);

  const params = await loadParams(args.set, SPEC, DEFAULTS);
  const orbitRate = SPEC.find((entry) => entry.key === 'motion.orbitRate');
  if (!orbitRate || typeof orbitRate.default !== 'number' || orbitRate.min > 0 || orbitRate.max < 0) {
    throw new Error('apps/planet/params.js must expose motion.orbitRate with 0 in its valid range for held-camera evidence.');
  }
  const encodedParams = encodeParams(params);
  const heldParams = { ...params, 'motion.orbitRate': 0 };
  const encodedHeldParams = encodeParams(heldParams);
  const panel = await buildPanel();
  const items = panel[args.panel];
  if (!Array.isArray(items) || !items.length) throw new Error(`Panel ${args.panel} is empty or unavailable.`);
  if (!Array.isArray(panel.all) || !panel.all.length) throw new Error('Panel all is empty or unavailable.');
  const ids = new Set(items.map((item) => item.id));
  const allById = new Map(panel.all.map((item) => [item.id, item]));
  const missingClips = args.clips.filter((id) => !ids.has(id));
  if (missingClips.length) throw new Error(`--clips id(s) are not in panel ${args.panel}: ${missingClips.join(', ')}.`);
  const missingCloseups = args.closeups.filter((id) => !allById.has(id));
  if (missingCloseups.length) throw new Error(`--closeups id(s) are not in the reference panel: ${missingCloseups.join(', ')}.`);
  const supplementalItems = args.closeups.filter((id) => !ids.has(id)).map((id) => allById.get(id));
  if (args.transition && !ids.has(args.transition)) {
    throw new Error(`--transition id is not in panel ${args.panel}: ${args.transition}.`);
  }
  if (ids.size !== items.length) throw new Error(`Panel ${args.panel} contains duplicate ids.`);
  const stems = items.map(cleanStem);
  const allStems = [...stems, ...supplementalItems.map(cleanStem)];
  if (new Set(allStems).size !== allStems.length) throw new Error('Selected panel and supplemental close-ups contain colliding filename ids.');

  const output = await prepareTarget(args.out);
  const ffmpeg = await locateFfmpeg();
  const chrome = await locateChrome(playwright.chromium);
  const stage = await mkdtemp(join(benchRoot, '.round-stage-'));
  let tempRoot;
  try { tempRoot = await mkdtemp(join(benchRoot, '.round-work-')); }
  catch (error) { await rm(stage, { recursive: true, force: true }); throw error; }
  let server;
  let browser;
  let context;
  let page;
  let committed = false;
  console.log(`round: capturing ${items.length} ${args.panel} week${items.length === 1 ? '' : 's'} with set ${args.set}`);
  try {
    for (const dir of ['stills', 'strips', 'clips']) await mkdir(join(stage, dir), { recursive: true });
    server = await startBenchServer({ port: 0, quiet: true });
    if (!Number.isInteger(server?.port) || server.port <= 0) throw new Error('The ephemeral bench server did not report a valid port.');
    const origin = `http://127.0.0.1:${server.port}`;
    const bench = await launchBench({ chromium: playwright.chromium, executablePath: chrome });
    browser = bench.browser;
    context = bench.context;
    page = bench.page;
    const pageErrors = bench.pageErrors;

    const clipIds = new Set(args.clips);
    const closeupIds = new Set(args.closeups);
    const weeks = [];
    const checks = { images: {}, videos: {} };
    let effectiveParamsChecked = false;
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const stem = stems[index];
      const label = `${item.week} — ${item.label}`;
      console.log(`round: [${index + 1}/${items.length}] ${label}`);
      const files = {
        orbit: `stills/${stem}-${ROLES.orbit}.png`,
        yaw: `strips/${stem}-${ROLES.yaw}.png`,
        time: `strips/${stem}-${ROLES.time}.png`,
        surface: null,
        clip: null,
        held: null,
        transition: null,
      };

      const orbitPath = join(stage, files.orbit);
      const initial = await openPlanet(page, makeUrl(origin, item, encodedParams, { t: 1, view: 'orbit' }), `${label} orbit`, pageErrors);
      await captureCanvas(page, orbitPath, `${label} orbit`);
      checks.images[files.orbit] = await assertNonblank(ffmpeg, orbitPath, `${label} orbit`);

      const representatives = representativeFeatures(initial.features);

      const yawDir = await mkdtemp(join(tempRoot, `${stem}-yaw-`));
      try {
        const yawFrames = [];
        for (let i = 0; i < 8; i++) {
          const yaw = i * 45;
          await openPlanet(page, makeUrl(origin, item, encodedParams, { t: 1, view: 'orbit', yaw }), `${label} yaw ${yaw}°`, pageErrors);
          const path = join(yawDir, `${String(i).padStart(2, '0')}.png`);
          await captureCanvas(page, path, `${label} yaw ${yaw}°`);
          await assertNonblank(ffmpeg, path, `${label} yaw ${yaw}°`);
          yawFrames.push(path);
        }
        const yawStrip = join(stage, files.yaw);
        await composeStrip(ffmpeg, yawFrames, yawStrip, `${label} yaw strip`);
        checks.images[files.yaw] = await assertNonblank(ffmpeg, yawStrip, `${label} yaw strip`);
      } finally {
        await rm(yawDir, { recursive: true, force: true });
      }

      const timeDir = await mkdtemp(join(tempRoot, `${stem}-time-`));
      const frameDurations = [];
      let details;
      try {
        await openPlanet(page, makeUrl(origin, item, encodedParams, { t: 0, view: 'orbit' }), `${label} time strip`, pageErrors);
        const timeFrames = [];
        for (let i = 0; i < 8; i++) {
          const t = (i * 2) / 7;
          frameDurations.push(await callFrame(page, t));
          const path = join(timeDir, `${String(i).padStart(2, '0')}.png`);
          await captureCanvas(page, path, `${label} t=${t.toFixed(3)}`);
          await assertNonblank(ffmpeg, path, `${label} t=${t.toFixed(3)}`);
          timeFrames.push(path);
        }
        details = await runtimeDetails(page);
        if (!effectiveParamsChecked) {
          verifyEffectiveParams(params, details.params);
          effectiveParamsChecked = true;
        }
        const timeStrip = join(stage, files.time);
        await composeStrip(ffmpeg, timeFrames, timeStrip, `${label} time strip`);
        checks.images[files.time] = await assertNonblank(ffmpeg, timeStrip, `${label} time strip`);
      } finally {
        await rm(timeDir, { recursive: true, force: true });
      }

      const hasMonument = Boolean(item.hasMonument || initial.monument);
      if (hasMonument) {
        files.surface = `stills/${stem}-${ROLES.surface}.png`;
        const surface = join(stage, files.surface);
        await openPlanet(page, makeUrl(origin, item, encodedParams, { t: 1, view: 'surface', at: 'monument' }), `${label} monument surface`, pageErrors);
        await callFrame(page, 1);
        await captureCanvas(page, surface, `${label} monument surface`);
        checks.images[files.surface] = await assertNonblank(ffmpeg, surface, `${label} monument surface`);
      }

      let clip = null;
      let held = null;
      if (clipIds.has(item.id)) {
        files.clip = `clips/${stem}-${ROLES.clip}.mp4`;
        clip = await captureClip({
          page, pageErrors, ffmpeg, origin, item, encodedParams, tempRoot,
          output: join(stage, files.clip), label, progress: 'turning orbit',
        });
        checks.videos[files.clip] = clip.check;

        files.held = `clips/${stem}-${ROLES.held}.mp4`;
        held = await captureClip({
          page, pageErrors, ffmpeg, origin, item, encodedParams: encodedHeldParams, tempRoot,
          output: join(stage, files.held), label, progress: 'held orbit', timeOffset: 1, yaw: 0,
        });
        checks.videos[files.held] = held.check;
      }

      const closeups = closeupIds.has(item.id)
        ? await captureFeatureCloseups({
          page, pageErrors, ffmpeg, origin, item, encodedParams: encodedHeldParams, tempRoot,
          stage, checks, label, representatives,
        })
        : [];

      let transition = null;
      if (args.transition === item.id) {
        const target = representatives.find((feature) => feature.featureKind === 'constructed')
          || representatives.find((feature) => feature.featureKind === 'monument')
          || representatives[0]
          || null;
        files.transition = `clips/${stem}-${ROLES.transition}.mp4`;
        const captured = await captureTransitionClip({
          page, pageErrors, ffmpeg, origin, item, encodedParams: encodedHeldParams, tempRoot,
          output: join(stage, files.transition), label, at: target?.featureId || null,
        });
        checks.videos[files.transition] = captured.check;
        transition = { target: target || { kind: 'nearest-land', featureKind: null, featureId: null }, ...captured.clock };
      }

      const observed = frameStats(frameDurations);
      const result = perfFor(details.perf, observed);
      weeks.push({
        id: item.id,
        week: item.week,
        label: item.label,
        source: item.source,
        summary: item.summary,
        hasMonument,
        totals: item.totals,
        files,
        closeups,
        heldOrbit: held ? {
          camera: 'fixed at the yaw strip’s 0° / t=1 orbit pose',
          stripReference: { t: 1, yawDegrees: 0 },
          capture: { timeOffset: 1, yawDegrees: 0 },
          overrideParams: { 'motion.orbitRate': 0 },
        } : null,
        transition,
        perf: {
          pass: result.pass,
          failures: result.failures,
          reported: details.perf,
          frameCalls: { ...observed, samplesMs: frameDurations.map(round3) },
          clipFrameCalls: clip?.frameCalls || null,
          heldFrameCalls: held?.frameCalls || null,
          renderer: details.renderer,
        },
      });
    }

    const supplementalCloseups = [];
    for (let index = 0; index < supplementalItems.length; index++) {
      const item = supplementalItems[index];
      const label = `${item.week} — ${item.label}`;
      console.log(`round: [close-up ${index + 1}/${supplementalItems.length}] ${label}`);
      const initial = await openPlanet(page, makeUrl(origin, item, encodedParams, { t: 1, view: 'orbit' }), `${label} close-up discovery`, pageErrors);
      const closeups = await captureFeatureCloseups({
        page, pageErrors, ffmpeg, origin, item, encodedParams: encodedHeldParams, tempRoot,
        stage, checks, label, representatives: representativeFeatures(initial.features),
      });
      supplementalCloseups.push({
        id: item.id,
        week: item.week,
        label: item.label,
        source: item.source,
        summary: item.summary,
        totals: item.totals,
        closeups,
      });
    }

    const orbitSheet = 'sheet-orbit.png';
    const surfaceSheet = 'sheet-surface.png';
    await composeSheet(page, weeks.map((week) => ({
      label: `${week.week} · ${week.label}`,
      note: week.summary,
      path: join(stage, week.files.orbit),
    })), join(stage, orbitSheet), `Planet Creator — ${args.set} / ${args.panel} orbit`);
    checks.images[orbitSheet] = await assertNonblank(ffmpeg, join(stage, orbitSheet), 'orbit contact sheet');
    await composeSheet(page, weeks.map((week) => ({
      label: `${week.week} · ${week.label}`,
      note: week.files.surface ? 'Monument surface' : 'No monument in this week',
      path: week.files.surface ? join(stage, week.files.surface) : null,
    })), join(stage, surfaceSheet), `Planet Creator — ${args.set} / ${args.panel} monument surface`);
    checks.images[surfaceSheet] = await assertNonblank(ffmpeg, join(stage, surfaceSheet), 'surface contact sheet');

    const artifactFiles = [orbitSheet, surfaceSheet];
    for (const week of weeks) {
      for (const path of Object.values(week.files)) if (path) artifactFiles.push(path);
      for (const closeup of week.closeups) artifactFiles.push(closeup.file);
    }
    for (const item of supplementalCloseups) for (const closeup of item.closeups) artifactFiles.push(closeup.file);
    artifactFiles.sort((a, b) => a.localeCompare(b));
    const failedWeeks = weeks.filter((week) => !week.perf.pass).map((week) => week.id);
    const manifest = {
      version: 1,
      generatedAt: new Date().toISOString(),
      set: args.set,
      params,
      panel: args.panel,
      viewport: VIEWPORT,
      sheets: { orbit: orbitSheet, surface: surfaceSheet },
      files: artifactFiles,
      weeks,
      supplementalCloseups,
      perf: { budget: PERF_BUDGET, pass: failedWeeks.length === 0, failedWeeks },
      checks,
    };
    await Bun.write(join(stage, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    await commitStage(stage, output);
    committed = true;
    console.log(`round: wrote ${posix(relative(repoRoot, output))} (${manifest.perf.pass ? 'performance PASS' : 'performance FAIL'})`);
  } finally {
    if (page) await page.close().catch((error) => console.error(`round: page cleanup warning: ${error.message}`));
    if (context) await context.close().catch((error) => console.error(`round: context cleanup warning: ${error.message}`));
    if (browser) await browser.close().catch((error) => console.error(`round: browser cleanup warning: ${error.message}`));
    if (server) await Promise.resolve(server.stop(true)).catch((error) => console.error(`round: server cleanup warning: ${error.message}`));
    await rm(tempRoot, { recursive: true, force: true });
    if (!committed) await rm(stage, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`round: ${error?.message || String(error)}`);
    process.exitCode = 1;
  });
}

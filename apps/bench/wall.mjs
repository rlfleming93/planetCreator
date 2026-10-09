/* A wall is how two planet-creation strategies are compared side by side: rows are weeks, columns are world
 * archetypes or saved parameter snapshots, and every cell is painted by the real app at the same pinned instant
 * (?t=1) through the bench's own server and Chrome stage (capture.mjs) — never a second renderer with its own idea
 * of what a still is. Cells are cropped to the square the home shelf uses, so a cell and a shelf still show the same
 * frame of the same week. The grid PNG is the evidence a person reads; the sibling manifest says which file each
 * cell is, what it cost, and what failed. Everything stays under ignored var/bench/walls/.
 *   bun apps/bench/wall.mjs --weeks 2025-04-28,2026-09-28 --worlds classic,auto --out var/bench/walls/races.png
 */
import { mkdir, readFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  benchRoot, captureSquare, callFrame, isWithin, launchBench, locateChrome, makeUrl, maybeStat, openPlanet,
  playwrightPath, posix, repoRoot,
} from './capture.mjs';

const wallsRoot = join(benchRoot, 'walls');
const shelfPath = resolve(import.meta.dir, '../planet-home/shelf/ryan.json');
// The app's own palette (apps/planet/ink.html), so a wall is lettered on the same paper as a round's sheets.
const PALETTE = Object.freeze({
  paper: '#efe6d2', felt: '#f3ecdc', ink: '#242a3c', faint: 'rgba(36, 42, 60, 0.14)',
  note: 'rgba(36, 42, 60, 0.62)', quiet: 'rgba(36, 42, 60, 0.72)', accent: '#b8442a', sorry: '#513f37',
  serif: '"Iowan Old Style", Palatino, "Book Antiqua", Georgia, serif',
});

const usage = `Usage: bun apps/bench/wall.mjs --out var/bench/walls/<name>.png [--weeks <week,week>] [--shelf <n>] [--worlds <id,id>] [--params <file,file>] [--size 360] [--view orbit|surface]`;
const FLAGS = ['--out', '--weeks', '--shelf', '--worlds', '--params', '--size', '--view'];
const plainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function parseArgs(argv) {
  const parsed = { worlds: [], params: [], view: 'orbit', size: 360 };
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--help' || key === '-h') return { help: true };
    if (!FLAGS.includes(key)) throw new Error(`Unknown argument ${key}.\n${usage}`);
    if (seen.has(key)) throw new Error(`${key} may be supplied only once.`);
    seen.add(key);
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`${key} needs a value.\n${usage}`);
    if (key === '--out') parsed.out = value;
    else if (key === '--weeks') parsed.weeks = list(value, key);
    else if (key === '--worlds') parsed.worlds = list(value, key);
    else if (key === '--params') parsed.params = list(value, key);
    else if (key === '--shelf') parsed.shelf = Number(value);
    else if (key === '--size') parsed.size = Number(value);
    else parsed.view = value;
  }
  if (!parsed.out) throw new Error(`--out is required.\n${usage}`);
  if (!parsed.weeks && parsed.shelf === undefined) throw new Error(`There are no weeks to paint: pass --weeks <week,week> and/or --shelf <n>.\n${usage}`);
  if (parsed.shelf !== undefined && (!Number.isInteger(parsed.shelf) || parsed.shelf < 1)) throw new Error('--shelf must be a whole number of weeks, 1 or more.');
  if (!Number.isInteger(parsed.size) || parsed.size < 120 || parsed.size > 1024) throw new Error('--size must be a whole number of pixels between 120 and 1024.');
  if (!['orbit', 'surface'].includes(parsed.view)) throw new Error(`--view must be orbit or surface; received ${parsed.view}.`);
  if (!parsed.worlds.length && !parsed.params.length) throw new Error(`A wall needs columns to compare: pass --worlds <id,id> and/or --params <file,file>.\n${usage}`);
  for (const id of parsed.worlds) if (!/^[a-z0-9][a-z0-9._-]*$/i.test(id)) throw new Error(`World id ${id} is not a plain module name.`);
  return parsed;
}

function list(value, flag) {
  const items = value.split(',').map((item) => item.trim());
  if (items.some((item) => !item)) throw new Error(`${flag} must be a comma-separated list of nonempty values.`);
  if (new Set(items).size !== items.length) throw new Error(`${flag} names the same value twice.`);
  return items;
}

/** A filename-safe stem for a week or a column label, the way round.mjs names its artifacts. */
function stem(text) {
  const clean = String(text).normalize('NFKD').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return clean || 'item';
}

/** A week's numbers as one line under its label, phrased the way the bench panel phrases a week. */
function summaryOf(stats) {
  if (!plainObject(stats)) return '';
  const parts = [`${stats.sessions || 0} session${stats.sessions === 1 ? '' : 's'}`];
  const counted = (count, one, many) => { if (count) parts.push(`${count} ${count === 1 ? one : many}`); };
  counted(stats.runs, 'run', 'runs');
  if (stats.runs && Number.isFinite(stats.mi)) parts.push(`${stats.mi.toFixed(1)} mi`);
  counted(stats.swim, 'swim', 'swims');
  counted(stats.ride, 'ride', 'rides');
  counted(stats.lift, 'lift', 'lifts');
  counted(stats.yoga, 'yoga', 'yoga');
  counted(stats.football, 'football', 'football');
  if (stats.climbM) parts.push(`${Math.round(stats.climbM)} m climb`);
  if (stats.min) parts.push(`${Math.round(stats.min)} min`);
  if (stats.race) parts.push(`${String(stats.race).toLowerCase()} week`);
  return parts.join(' · ');
}

/**
 * A week named on the command line is a seed the served app can load by name: the private store first, then the
 * checked-in synthetic fixtures, the same order serve.mjs looks in. The seed's contents are never read here — the
 * app loads it — so this only has to know the file is there.
 */
async function seedRow(name) {
  if (!/^[A-Za-z0-9_-]+$/.test(name)) throw new Error(`Week ${name} is not a seed name (letters, digits, _ and - only, as the app requires).`);
  const candidates = [join(repoRoot, 'var/private/planet/seeds', `${name}.js`), join(repoRoot, 'apps/planet/seeds', `${name}.js`)];
  let found = null;
  for (const path of candidates) if (await maybeStat(path)) { found = path; break; }
  if (!found) throw new Error(`No seed for week ${name}: looked for ${posix(relative(repoRoot, candidates[0]))} and ${posix(relative(repoRoot, candidates[1]))}.`);
  return { id: name, week: name, seed: name, source: 'seed', summary: '' };
}

/** Every `count`-th of the shelf's weeks, ends included, so a sample spans the history instead of its newest weeks. */
function sampleEvenly(weeks, count) {
  if (count > weeks.length) throw new Error(`--shelf ${count} asks for more weeks than the shelf holds (${weeks.length}).`);
  if (count === 1) return [weeks[Math.floor((weeks.length - 1) / 2)]];
  if (count === weeks.length) return [...weeks];
  const step = (weeks.length - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => weeks[Math.round(i * step)]);
}

/**
 * Weeks from the demo shelf's own file: public #p= share links, so a wall can sample real history without touching a
 * private seed at all. The stats beside each link are the shelf's own statsOf output, which is the row label.
 */
async function shelfRows(count) {
  const file = Bun.file(shelfPath);
  if (!await file.exists()) throw new Error(`The shelf is missing at ${posix(relative(repoRoot, shelfPath))}; it is what --shelf samples.`);
  let saved;
  try { saved = JSON.parse(await file.text()); }
  catch (error) { throw new Error(`${posix(relative(repoRoot, shelfPath))} is not valid JSON: ${error.message}`); }
  if (!Array.isArray(saved) || !saved.length) throw new Error(`${posix(relative(repoRoot, shelfPath))} holds no weeks.`);
  const weeks = saved.filter((entry) => typeof entry?.week === 'string' && typeof entry?.link === 'string');
  return sampleEvenly(weeks, count).map((entry) => {
    const match = /(?:^|[?#&])p=([^&#]+)/.exec(entry.link);
    if (!match) throw new Error(`Shelf week ${entry.week} has no #p= share link to paint.`);
    return { id: entry.week, week: entry.week, code: decodeURIComponent(match[1]), source: 'shelf', summary: summaryOf(entry.stats) };
  });
}

/**
 * The values apps/planet/params.js allows, checked here as well: a wall that quietly painted a clamped, ignored or
 * misspelled dial would be comparing two things it does not name. A choice dial (a world archetype, a print) takes a
 * plain word, lowercased the way the app lowercases it; the app warns and keeps the default for a word its option list
 * lacks, and the applied value is checked per cell, so a wall never shows a dial that was ignored.
 */
function coerce(spec, raw, key, source) {
  if (Array.isArray(spec.options) || (spec.min == null && typeof spec.default === 'string' && !/^#[0-9a-f]{6}$/i.test(spec.default))) {
    const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(value)) throw new Error(`${source}: ${key} must name one of its choices.`);
    return value;
  }
  if (typeof spec.default === 'number') {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) throw new Error(`${source}: ${key} must be a finite number.`);
    if (raw < spec.min || raw > spec.max) throw new Error(`${source}: ${key}=${raw} is outside ${spec.min}..${spec.max}.`);
    return raw;
  }
  if (typeof raw !== 'string' || !/^#[0-9a-f]{6}$/i.test(raw)) throw new Error(`${source}: ${key} must be a #rrggbb colour.`);
  return raw.toLowerCase();
}

/** One saved parameter set as a column: the packed ?params= object the bench's own snapshot format encodes. */
async function paramsColumn(file, { byKey, ordered, encodeParams, defaults }) {
  const path = isAbsolute(file) ? file : resolve(repoRoot, file);
  const shown = posix(relative(repoRoot, path));
  if (!(await maybeStat(path))?.isFile()) throw new Error(`--params ${file} is not a file (looked at ${shown}).`);
  let saved;
  try { saved = JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { throw new Error(`--params ${file} is not valid JSON: ${error.message}`); }
  const overrides = plainObject(saved?.params) ? saved.params : saved;
  if (!plainObject(overrides)) throw new Error(`--params ${file} must hold a parameter object or a { "params": { ... } } object.`);
  const values = { ...defaults };
  const expect = {};
  const unknown = [];
  for (const [key, raw] of Object.entries(overrides)) {
    const spec = byKey.get(key);
    if (!spec) { unknown.push(key); continue; }
    const value = coerce(spec, raw, key, `--params ${file}`);
    values[key] = value;
    expect[key] = value;
  }
  if (unknown.length) throw new Error(`--params ${file} names parameter(s) this build does not know: ${unknown.join(', ')}.`);
  const named = typeof saved?.name === 'string' ? saved.name.trim() : '';
  return { label: named || basename(path, extname(path)), note: shown, params: encodeParams(ordered(values)), extra: [], expect };
}

/**
 * The columns of the wall. A world column names one archetype through the URL dial the app already reads
 * (?p.world.archetype=), over the built-in defaults; a params column carries a whole saved set. Both are checked
 * against the app's own parameter list, so a wall can never paint a strategy it cannot name.
 */
async function loadColumns(args, SPEC, DEFAULTS, encodeParams) {
  const byKey = new Map(SPEC.map((entry) => [entry.key, entry]));
  if (args.worlds.length && !byKey.has('world.archetype')) {
    throw new Error('This build has no world.archetype dial in apps/planet/params.js, so --worlds columns could not differ; compare --params snapshots instead.');
  }
  const ordered = (values) => Object.fromEntries(SPEC.map((entry) => [entry.key, values[entry.key]]));
  const defaults = ordered(DEFAULTS);
  // The app lowercases a choice value as it reads it, so the column must ask for the value it will get back.
  const columns = args.worlds.map((id) => id.trim().toLowerCase()).map((id) => ({
    label: id,
    note: 'world archetype',
    params: encodeParams(defaults),
    extra: [['p.world.archetype', id]],
    expect: { 'world.archetype': id },
  }));
  for (const file of args.params) columns.push(await paramsColumn(file, { byKey, ordered, encodeParams, defaults }));
  const labels = columns.map((column) => column.label);
  const duplicate = labels.find((label, index) => labels.indexOf(label) !== index);
  if (duplicate) throw new Error(`Two columns are both labelled ${duplicate}; rename one snapshot or drop a world.`);
  return columns;
}

/** What the app reports it applied, held against what the column asked for. */
function verifyApplied(label, expected, actual) {
  if (!plainObject(actual)) throw new Error(`${label}: the app did not report its parameters.`);
  const wrong = Object.entries(expected || {}).filter(([key, value]) => actual[key] !== value).map(([key]) => `${key}=${String(actual[key])}`);
  if (wrong.length) throw new Error(`${label}: the app applied ${wrong.join(', ')} instead of the column's values.`);
}

/** Refuse to write over anything: a wall is a named experiment, and an older grid may still be open somewhere. */
async function prepareOutput(raw) {
  const target = isAbsolute(raw) ? resolve(raw) : resolve(repoRoot, raw);
  if (extname(target).toLowerCase() !== '.png') throw new Error('--out must be a .png path; the manifest and cell directory are written beside it.');
  if (!isWithin(wallsRoot, target)) throw new Error(`--out must stay under ${posix(relative(repoRoot, wallsRoot))}.`);
  const root = target.slice(0, target.length - extname(target).length);
  const manifest = `${root}.json`;
  for (const path of [target, root, manifest]) {
    if (await maybeStat(path)) throw new Error(`Refusing to overwrite ${posix(relative(repoRoot, path))}; choose another --out name.`);
  }
  await mkdir(root, { recursive: true });
  return { target, root, manifest };
}

/**
 * The grid itself, drawn on the app's paper: a labelled column per strategy, a labelled row per week, and a crossed
 * cell wherever a capture could not be taken (the same sorry tile a round's sheets use).
 */
async function composeWall(page, { rows, columns, cells, size, view }) {
  const byKey = new Map(cells.map((cell) => [`${cell.week}\u0000${cell.column}`, cell]));
  const tiles = [];
  for (const row of rows) {
    for (const column of columns) {
      const cell = byKey.get(`${row.week}\u0000${column.label}`);
      const data = cell?.file ? `data:image/png;base64,${(await readFile(join(wallsRoot, cell.file))).toString('base64')}` : null;
      tiles.push({ data, reason: cell?.reason || cell?.error || 'no capture' });
    }
  }
  const labels = {
    rows: rows.map((row) => ({ week: row.week, summary: row.summary || '' })),
    columns: columns.map((column) => ({ label: column.label, note: column.note })),
  };
  const title = `Planet Creator — ${rows.length} week${rows.length === 1 ? '' : 's'} × ${columns.length} column${columns.length === 1 ? '' : 's'} · ${view} at t=1`;
  await page.setContent('<!doctype html><meta charset="utf-8"><canvas id="wall"></canvas>');
  return page.evaluate(async ({ labels, tiles, size, title, palette }) => {
    const PAD = 26, GAP = 16, ROW_LABEL = 210, TOP = 34, HEAD = 48;
    const width = PAD * 2 + ROW_LABEL + labels.columns.length * size + (labels.columns.length - 1) * GAP;
    const height = PAD * 2 + TOP + HEAD + labels.rows.length * size + (labels.rows.length - 1) * GAP;
    if (width > 12000 || height > 12000) throw new Error(`that wall would be ${width}×${height} px; use fewer weeks or columns, or a smaller --size`);
    const canvas = document.querySelector('#wall');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = palette.paper;
    ctx.fillRect(0, 0, width, height);
    const serif = palette.serif;
    const fits = (text, max) => {
      let out = String(text);
      while (out.length > 4 && ctx.measureText(out).width > max) out = `${out.slice(0, -2)}…`;
      return out;
    };
    ctx.fillStyle = palette.ink;
    ctx.font = `600 20px ${serif}`;
    ctx.fillText(title, PAD, PAD + 16);
    const x0 = PAD + ROW_LABEL;
    const y0 = PAD + TOP + HEAD;
    labels.columns.forEach((column, index) => {
      const x = x0 + index * (size + GAP);
      ctx.fillStyle = palette.ink;
      ctx.font = `600 16px ${serif}`;
      ctx.fillText(fits(column.label, size), x, y0 - HEAD + 22);
      ctx.fillStyle = palette.note;
      ctx.font = `12px ${serif}`;
      ctx.fillText(fits(column.note, size), x, y0 - HEAD + 40);
    });
    labels.rows.forEach((row, index) => {
      const y = y0 + index * (size + GAP);
      ctx.fillStyle = palette.ink;
      ctx.font = `600 15px ${serif}`;
      ctx.fillText(fits(row.week, ROW_LABEL - GAP), PAD, y + 18);
      ctx.fillStyle = palette.quiet;
      ctx.font = `12.5px ${serif}`;
      let line = '';
      let lines = 0;
      for (const word of String(row.summary).split(' ')) {
        const next = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(next).width > ROW_LABEL - GAP) {
          if (lines === 2) { line = `${line} …`; break; }
          ctx.fillText(line, PAD, y + 38 + lines * 15);
          lines += 1;
          line = word;
        } else line = next;
      }
      if (line) ctx.fillText(line, PAD, y + 38 + lines * 15);
    });
    const load = (src) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('wall cell failed to load'));
      image.src = src;
    });
    for (let r = 0; r < labels.rows.length; r++) {
      for (let c = 0; c < labels.columns.length; c++) {
        const x = x0 + c * (size + GAP);
        const y = y0 + r * (size + GAP);
        const tile = tiles[r * labels.columns.length + c];
        ctx.fillStyle = palette.felt;
        ctx.fillRect(x, y, size, size);
        if (tile.data) {
          ctx.drawImage(await load(tile.data), x, y, size, size);
        } else {
          ctx.strokeStyle = palette.accent;
          ctx.lineWidth = 3;
          ctx.strokeRect(x + 18, y + 18, size - 36, size - 36);
          ctx.beginPath();
          ctx.moveTo(x + 32, y + 32);
          ctx.lineTo(x + size - 32, y + size - 32);
          ctx.moveTo(x + size - 32, y + 32);
          ctx.lineTo(x + 32, y + size - 32);
          ctx.stroke();
          ctx.fillStyle = palette.sorry;
          ctx.font = `600 14px ${serif}`;
          ctx.textAlign = 'center';
          ctx.fillText(fits(tile.reason, size - 48), x + size / 2, y + size / 2 + 5);
          ctx.textAlign = 'left';
        }
        ctx.strokeStyle = palette.faint;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
      }
    }
    return canvas.toDataURL('image/png').split(',')[1];
  }, { labels, tiles, size, title, palette: PALETTE });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(usage); return; }
  await mkdir(wallsRoot, { recursive: true });

  const [{ startBenchServer }, paramsModule, { statsOf }, playwright] = await Promise.all([
    import('./serve.mjs'),
    import('../planet/params.js'),
    import('../planet-home/lib/week.js'),
    import(pathToFileURL(playwrightPath).href),
  ]);
  const { SPEC, DEFAULTS, encodeParams } = paramsModule;
  if (!Array.isArray(SPEC) || !plainObject(DEFAULTS) || typeof encodeParams !== 'function') throw new Error('apps/planet/params.js does not expose SPEC, DEFAULTS, and encodeParams().');
  if (typeof startBenchServer !== 'function') throw new Error('apps/bench/serve.mjs does not expose startBenchServer().');
  if (typeof statsOf !== 'function') throw new Error('apps/planet-home/lib/week.js does not expose statsOf().');
  if (!playwright?.chromium) throw new Error(`Playwright Chromium is unavailable from ${playwrightPath}.`);

  const rows = [];
  const named = new Set();
  for (const name of args.weeks || []) { rows.push(await seedRow(name)); named.add(name); }
  if (args.shelf !== undefined) {
    for (const row of await shelfRows(args.shelf)) {
      if (named.has(row.week)) { console.log(`wall: shelf week ${row.week} is named by --weeks already; keeping the named row`); continue; }
      rows.push(row);
      named.add(row.week);
    }
  }
  const columns = await loadColumns(args, SPEC, DEFAULTS, encodeParams);
  const output = await prepareOutput(args.out);
  const chrome = await locateChrome(playwright.chromium);

  const cells = [];
  const failures = [];
  let server = null;
  let bench = null;
  try {
    server = await startBenchServer({ port: 0, quiet: true });
    if (!Number.isInteger(server?.port) || server.port <= 0) throw new Error('The ephemeral bench server did not report a valid port.');
    bench = await launchBench({ chromium: playwright.chromium, executablePath: chrome });
    const origin = `http://127.0.0.1:${server.port}`;
    const cellsRoot = join(output.root, 'cells');
    await mkdir(cellsRoot, { recursive: true });
    for (const row of rows) {
      for (const column of columns) {
        const label = `${row.week} × ${column.label}`;
        const path = join(cellsRoot, `${stem(row.week)}--${stem(column.label)}.png`);
        const cell = { week: row.week, column: column.label };
        const started = performance.now();
        try {
          const url = makeUrl(origin, row, column.params, {
            t: 1, view: args.view, at: args.view === 'surface' ? 'monument' : null, extra: column.extra,
          });
          const state = await openPlanet(bench.page, url, label, bench.pageErrors);
          verifyApplied(label, column.expect, await bench.page.evaluate(() => window.__app.params?.()));
          // The stat line under a week's label is the shelf's own statsOf, read off the seed the app just loaded, so
          // a private seed's contents stay in the browser and only the week's own counts come back.
          if (!row.summary && row.source === 'seed') {
            const seed = await bench.page.evaluate(() => window.SEED);
            if (seed?.activities) row.summary = summaryOf(statsOf(seed));
          }
          if (args.view === 'surface' && !state.monument) {
            cell.skipped = true;
            cell.reason = 'no monument in this week';
          } else {
            if (args.view === 'surface') await callFrame(bench.page, 1);
            await captureSquare(bench.page, path, args.size, label);
            cell.file = posix(relative(wallsRoot, path));
            cell.ok = true;
          }
        } catch (error) {
          cell.ok = false;
          cell.error = error?.message || String(error);
          failures.push(cell);
          console.error(`wall: ${label} — ${cell.error}`);
        }
        cell.ms = Math.round(performance.now() - started);
        cells.push(cell);
        console.log(`wall: ${label} ${cell.ms} ms${cell.skipped ? ` (${cell.reason})` : cell.ok ? '' : ' (failed)'}`);
      }
    }

    const png = await composeWall(bench.page, { rows, columns, cells, size: args.size, view: args.view });
    await Bun.write(output.target, Buffer.from(png, 'base64'));
    await Bun.write(output.manifest, `${JSON.stringify({
      version: 1,
      generatedAt: new Date().toISOString(),
      view: args.view,
      size: args.size,
      weeks: rows.map((row) => row.week),
      columns: columns.map((column) => column.label),
      cells: cells.map((cell) => ({
        week: cell.week,
        column: cell.column,
        file: cell.file || null,
        ms: cell.ms,
        ...(cell.skipped ? { skipped: true, reason: cell.reason } : cell.ok ? {} : { error: cell.error }),
      })),
      failed: failures.length,
    }, null, 2)}\n`);
    const skipped = cells.filter((cell) => cell.skipped).length;
    const slowest = Math.max(...cells.map((cell) => cell.ms));
    console.log(`wall: wrote ${posix(relative(repoRoot, output.target))} — ${rows.length}×${columns.length} cells, slowest ${slowest} ms`
      + `${skipped ? `, ${skipped} skipped` : ''}${failures.length ? `, ${failures.length} FAILED` : ''}`);
    if (failures.length) console.error(`wall: see ${posix(relative(repoRoot, output.manifest))} for which cells failed and why`);
  } finally {
    if (bench) {
      await bench.page.close().catch((error) => console.error(`wall: page cleanup warning: ${error.message}`));
      await bench.context.close().catch((error) => console.error(`wall: context cleanup warning: ${error.message}`));
      await bench.browser.close().catch((error) => console.error(`wall: browser cleanup warning: ${error.message}`));
    }
    if (server) await Promise.resolve(server.stop(true)).catch((error) => console.error(`wall: server cleanup warning: ${error.message}`));
  }
  if (failures.length) process.exitCode = 1;
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`wall: ${error?.message || String(error)}`);
    process.exitCode = 1;
  });
}

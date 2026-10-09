// A review package must be useful without quietly undoing the bench's privacy and blinding guarantees. This command
// consequently trusts only a round manifest, the checked-in rubric, and regular artifact files inside var/bench. In
// ordinary mode it writes a fully identified local inventory. Blind mode exposes only the three roles every week
// shares (orbit, yaw, and time), gives them opaque names, hides both week identity and candidate/baseline identity,
// and puts the sole mapping in blind-key.json. Conditional clips and monument views stay in the identified package:
// their mere presence would reveal a Tile before the reviewer had looked at its pixels. Generated review files are
// staged and then replace only review.md, blind/, and blind-key.json, so reruns cannot damage a round.
import { createHash } from 'node:crypto';
import { copyFile, link, lstat, mkdir, mkdtemp, open, readFile, realpath, rename, rm } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const repoRoot = resolve(import.meta.dir, '../..');
const benchRoot = join(repoRoot, 'var/bench');
const rubricPath = join(import.meta.dir, 'rubric.md');
const usage = 'Usage: bun apps/bench/review.mjs <round-dir> [--baseline <round-dir>] [--blind]';
const ROLE_LABELS = Object.freeze({
  orbit: 'Orbit poster',
  yaw: 'Eight-yaw strip',
  time: 'Deterministic time strip',
  surface: 'Monument surface',
  clip: 'Turning-orbit motion clip',
  held: 'Held-camera orbit motion clip',
  transition: 'Orbit-to-surface transition clip',
});
const BLIND_ROLES = Object.freeze(['orbit', 'yaw', 'time']);
const GENERATED = Object.freeze(['review.md', 'blind', 'blind-key.json']);
const plainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function parseArgs(argv) {
  const parsed = { blind: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--blind') {
      if (parsed.blind) throw new Error('--blind may be supplied only once.');
      parsed.blind = true;
    } else if (arg === '--baseline') {
      if (parsed.baseline) throw new Error('--baseline may be supplied only once.');
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`--baseline needs a round directory.\n${usage}`);
      parsed.baseline = value;
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown argument ${arg}.\n${usage}`);
    } else {
      positional.push(arg);
    }
  }
  if (positional.length !== 1) throw new Error(`Exactly one round directory is required.\n${usage}`);
  parsed.round = positional[0];
  return parsed;
}

function isWithin(parent, child) {
  const rel = relative(parent, child);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}

async function resolveRound(raw, label) {
  const path = isAbsolute(raw) ? resolve(raw) : resolve(repoRoot, raw);
  if (!isWithin(benchRoot, path) || path === benchRoot) throw new Error(`${label} must stay under ${benchRoot}.`);
  const stat = await lstat(path).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
  if (!stat?.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label} is not a regular round directory: ${path}.`);
  const [realBench, realRound] = await Promise.all([realpath(benchRoot), realpath(path)]);
  if (!isWithin(realBench, realRound)) throw new Error(`${label} resolves outside private ${benchRoot}.`);
  return realRound;
}

function requiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Manifest field ${field} must be a nonempty string.`);
  return value;
}

function artifactPath(roundDir, value, field) {
  const rel = requiredString(value, field);
  if (isAbsolute(rel) || rel.includes('\\') || rel.split('/').includes('..') || rel.split('/').includes('.')) {
    throw new Error(`Manifest artifact ${field} must be a normalized relative path; received ${rel}.`);
  }
  const absolute = resolve(roundDir, rel);
  if (!isWithin(roundDir, absolute) || absolute === roundDir) throw new Error(`Manifest artifact ${field} escapes its round: ${rel}.`);
  return { rel, absolute };
}

async function fileHeader(path, bytes = 16) {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function validateArtifact(path, rel) {
  const stat = await lstat(path).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
  if (!stat?.isFile() || stat.isSymbolicLink()) throw new Error(`Artifact is missing or is not a regular file: ${rel}.`);
  if (stat.size < 64) throw new Error(`Artifact is implausibly small (${stat.size} bytes): ${rel}.`);
  const header = await fileHeader(path);
  const ext = extname(rel).toLowerCase();
  if (ext === '.png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (!signature.every((byte, index) => header[index] === byte)) throw new Error(`Artifact is not a PNG despite its name: ${rel}.`);
  } else if (ext === '.mp4') {
    if (header.subarray(4, 8).toString('ascii') !== 'ftyp') throw new Error(`Artifact is not an MP4 despite its name: ${rel}.`);
  } else {
    throw new Error(`Unsupported artifact type for ${rel}; only PNG and MP4 belong in a round manifest.`);
  }
}

async function readManifest(roundDir, label) {
  const path = join(roundDir, 'manifest.json');
  let manifest;
  try { manifest = JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { throw new Error(`${label} has no valid manifest.json: ${error.message}`); }
  if (!plainObject(manifest)) throw new Error(`${label} manifest must be an object.`);
  if (manifest.version !== 1) throw new Error(`${label} manifest version must be 1.`);
  requiredString(manifest.set, 'set');
  requiredString(manifest.panel, 'panel');
  if (!plainObject(manifest.params)) throw new Error('Manifest field params must be an object.');
  if (!plainObject(manifest.viewport) || manifest.viewport.width < 768 || manifest.viewport.height < 768) {
    throw new Error('Manifest viewport must be at least 768×768.');
  }
  if (!plainObject(manifest.sheets)) throw new Error('Manifest field sheets must be an object.');
  if (!Array.isArray(manifest.weeks) || !manifest.weeks.length) throw new Error('Manifest field weeks must be a nonempty array.');
  if (!plainObject(manifest.perf) || typeof manifest.perf.pass !== 'boolean' || !plainObject(manifest.perf.budget)) {
    throw new Error('Manifest perf must contain a budget object and a boolean pass value.');
  }

  const sheets = {
    orbit: artifactPath(roundDir, manifest.sheets.orbit, 'sheets.orbit'),
    surface: artifactPath(roundDir, manifest.sheets.surface, 'sheets.surface'),
  };
  const seenIds = new Set();
  const weeks = manifest.weeks.map((week, index) => {
    if (!plainObject(week)) throw new Error(`Manifest weeks[${index}] must be an object.`);
    const id = requiredString(week.id, `weeks[${index}].id`);
    if (seenIds.has(id)) throw new Error(`Manifest has duplicate week id ${id}.`);
    seenIds.add(id);
    const normalized = {
      raw: week,
      id,
      week: requiredString(week.week, `weeks[${index}].week`),
      label: requiredString(week.label, `weeks[${index}].label`),
      summary: requiredString(week.summary, `weeks[${index}].summary`),
      files: {},
      closeups: [],
      transition: null,
    };
    if (!plainObject(week.files)) throw new Error(`Manifest weeks[${index}].files must be an object.`);
    for (const role of Object.keys(ROLE_LABELS)) {
      const value = week.files[role];
      if (['orbit', 'yaw', 'time'].includes(role) && !value) throw new Error(`Manifest week ${id} is missing required ${role} artifact.`);
      normalized.files[role] = value ? artifactPath(roundDir, value, `week ${id} ${role}`) : null;
    }
    if (Boolean(week.hasMonument) !== Boolean(normalized.files.surface)) {
      throw new Error(`Manifest week ${id} monument flag and surface artifact disagree.`);
    }
    const closeups = week.closeups ?? [];
    if (!Array.isArray(closeups)) throw new Error(`Manifest week ${id} closeups must be an array.`);
    const seenCloseups = new Set();
    normalized.closeups = closeups.map((closeup, closeupIndex) => {
      if (!plainObject(closeup)) throw new Error(`Manifest week ${id} closeups[${closeupIndex}] must be an object.`);
      const kind = requiredString(closeup.kind, `week ${id} closeups[${closeupIndex}].kind`);
      if (!/^[a-z][a-z0-9-]*$/.test(kind) || seenCloseups.has(kind)) {
        throw new Error(`Manifest week ${id} has an invalid or duplicate close-up kind ${kind}.`);
      }
      seenCloseups.add(kind);
      return {
        kind,
        featureKind: requiredString(closeup.featureKind, `week ${id} closeups[${closeupIndex}].featureKind`),
        featureId: requiredString(closeup.featureId, `week ${id} closeups[${closeupIndex}].featureId`),
        file: artifactPath(roundDir, closeup.file, `week ${id} ${kind} close-up`),
      };
    });
    if (Boolean(week.transition) !== Boolean(normalized.files.transition)) {
      throw new Error(`Manifest week ${id} transition metadata and artifact disagree.`);
    }
    if (week.transition) {
      if (!plainObject(week.transition) || !plainObject(week.transition.target)
        || week.transition.frames !== 180 || week.transition.fps !== 30
        || !Number.isFinite(week.transition.stepMs)) {
        throw new Error(`Manifest week ${id} has incomplete transition timing metadata.`);
      }
      requiredString(week.transition.source, `week ${id} transition.source`);
      requiredString(week.transition.deterministicCapture, `week ${id} transition.deterministicCapture`);
      normalized.transition = week.transition;
    }
    if (!plainObject(week.perf) || typeof week.perf.pass !== 'boolean' || !plainObject(week.perf.reported) || !plainObject(week.perf.frameCalls)) {
      throw new Error(`Manifest week ${id} has incomplete performance measurements.`);
    }
    return normalized;
  });
  const supplementalRaw = manifest.supplementalCloseups ?? [];
  if (!Array.isArray(supplementalRaw)) throw new Error('Manifest supplementalCloseups must be an array.');
  const supplementalCloseups = supplementalRaw.map((item, index) => {
    if (!plainObject(item)) throw new Error(`Manifest supplementalCloseups[${index}] must be an object.`);
    const id = requiredString(item.id, `supplementalCloseups[${index}].id`);
    if (seenIds.has(id)) throw new Error(`Manifest repeats week id ${id} in supplemental close-ups.`);
    seenIds.add(id);
    if (!Array.isArray(item.closeups)) throw new Error(`Manifest supplemental close-up week ${id} must contain a closeups array.`);
    const seenKinds = new Set();
    const closeups = item.closeups.map((closeup, closeupIndex) => {
      if (!plainObject(closeup)) throw new Error(`Manifest supplemental week ${id} closeups[${closeupIndex}] must be an object.`);
      const kind = requiredString(closeup.kind, `supplemental week ${id} closeups[${closeupIndex}].kind`);
      if (!/^[a-z][a-z0-9-]*$/.test(kind) || seenKinds.has(kind)) {
        throw new Error(`Manifest supplemental week ${id} has an invalid or duplicate close-up kind ${kind}.`);
      }
      seenKinds.add(kind);
      return {
        kind,
        featureKind: requiredString(closeup.featureKind, `supplemental week ${id} closeups[${closeupIndex}].featureKind`),
        featureId: requiredString(closeup.featureId, `supplemental week ${id} closeups[${closeupIndex}].featureId`),
        file: artifactPath(roundDir, closeup.file, `supplemental week ${id} ${kind} close-up`),
      };
    });
    return {
      raw: item,
      id,
      week: requiredString(item.week, `supplementalCloseups[${index}].week`),
      label: requiredString(item.label, `supplementalCloseups[${index}].label`),
      summary: requiredString(item.summary, `supplementalCloseups[${index}].summary`),
      closeups,
    };
  });
  const expected = [sheets.orbit.rel, sheets.surface.rel];
  for (const week of weeks) {
    for (const file of Object.values(week.files)) if (file) expected.push(file.rel);
    for (const closeup of week.closeups) expected.push(closeup.file.rel);
  }
  for (const item of supplementalCloseups) for (const closeup of item.closeups) expected.push(closeup.file.rel);
  if (new Set(expected).size !== expected.length) throw new Error(`${label} manifest references the same artifact more than once.`);
  if (!Array.isArray(manifest.files) || manifest.files.some((file) => typeof file !== 'string')) throw new Error('Manifest files must be an array of relative artifact paths.');
  const listed = [...manifest.files].sort();
  const wanted = [...expected].sort();
  if (listed.length !== wanted.length || listed.some((file, index) => file !== wanted[index])) {
    throw new Error(`${label} manifest files does not exactly match its sheet and per-week artifact references.`);
  }
  if (manifest.perf.pass !== weeks.every((week) => week.raw.perf.pass)) {
    throw new Error(`${label} manifest performance pass does not agree with its week results.`);
  }
  if (!plainObject(manifest.checks?.images) || !plainObject(manifest.checks?.videos)) {
    throw new Error(`${label} manifest must contain image and video verification checks.`);
  }
  for (const rel of wanted) {
    const png = extname(rel).toLowerCase() === '.png';
    const check = png ? manifest.checks.images[rel] : manifest.checks.videos[rel];
    if (!plainObject(check)) throw new Error(`${label} manifest has no verification result for ${rel}.`);
    if (png && (!Number.isFinite(check.lumaStdDev) || !Number.isFinite(check.lumaRange)
      || check.lumaStdDev < 3 || check.lumaRange < 18)) {
      throw new Error(`${label} manifest has a failed image verification result for ${rel}.`);
    }
    if (!png && (check.sampledFrames !== 6 || !Number.isFinite(check.weakestLumaStdDev)
      || !Number.isFinite(check.weakestLumaRange) || check.weakestLumaStdDev < 3 || check.weakestLumaRange < 18)) {
      throw new Error(`${label} manifest has a failed video verification result for ${rel}.`);
    }
    await validateArtifact(resolve(roundDir, rel), rel);
  }
  return { dir: roundDir, path, manifest, sheets, weeks, supplementalCloseups };
}

function text(value) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
}

function pathCode(path) {
  return `\`${path.replaceAll('`', '\\`')}\``;
}

function tileLabel(index) {
  let value = index + 1;
  let label = '';
  while (value > 0) {
    value--;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return `Tile ${label}`;
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function baselineWeekFor(week, baseline) {
  if (!baseline) return null;
  return baseline.weeks.find((candidate) => candidate.id === week.id)
    || baseline.weeks.find((candidate) => candidate.week === week.week)
    || null;
}

async function hardlinkOrCopy(source, destination) {
  await mkdir(resolve(destination, '..'), { recursive: true });
  try { await link(source, destination); }
  catch (error) {
    if (!['EXDEV', 'EPERM', 'EACCES', 'ENOTSUP', 'EMLINK'].includes(error?.code)) throw error;
    await copyFile(source, destination);
  }
}

async function buildBlindPackage(round, baseline, stage) {
  const seed = digest(JSON.stringify({
    set: round.manifest.set,
    panel: round.manifest.panel,
    weeks: round.weeks.map((week) => week.id),
    baseline: baseline ? { set: baseline.manifest.set, panel: baseline.manifest.panel, weeks: baseline.weeks.map((week) => week.id) } : null,
  }));
  let shuffled = round.weeks.map((week, index) => ({ week, index, rank: digest(`${seed}\0${week.id}`) }))
    .sort((a, b) => a.rank.localeCompare(b.rank) || a.index - b.index);
  if (shuffled.length > 1 && shuffled.every((entry, index) => entry.index === index)) shuffled = [...shuffled.slice(1), shuffled[0]];
  const blindDir = join(stage, 'blind');
  await mkdir(blindDir, { recursive: true });
  const tiles = [];
  const keyTiles = [];

  for (let index = 0; index < shuffled.length; index++) {
    const current = shuffled[index].week;
    const prior = baselineWeekFor(current, baseline);
    const label = tileLabel(index);
    const slug = label.toLowerCase().replace(' ', '-');
    const finalDir = join(round.dir, 'blind', slug);
    const stageDir = join(blindDir, slug);
    const sources = prior
      ? (parseInt(digest(`${seed}\0${current.id}\0takes`).slice(0, 2), 16) % 2
        ? [{ source: 'baseline', round: baseline, week: prior }, { source: 'candidate', round, week: current }]
        : [{ source: 'candidate', round, week: current }, { source: 'baseline', round: baseline, week: prior }])
      : [{ source: 'candidate', round, week: current }];
    const takes = [];
    const keyTakes = [];
    for (let takeIndex = 0; takeIndex < sources.length; takeIndex++) {
      const source = sources[takeIndex];
      const take = sources.length === 2 ? String.fromCharCode(65 + takeIndex) : null;
      const paths = {};
      const keyFiles = {};
      for (const role of BLIND_ROLES) {
        const file = source.week.files[role];
        if (!file) throw new Error(`Blind package requires ${role} for every Tile and take.`);
        const name = `${take ? `take-${take.toLowerCase()}-` : ''}${role}.png`;
        const staged = join(stageDir, name);
        const final = join(finalDir, name);
        await hardlinkOrCopy(file.absolute, staged);
        paths[role] = final;
        keyFiles[role] = { blind: relative(round.dir, final).split(sep).join('/'), source: file.rel };
      }
      takes.push({ take, paths });
      keyTakes.push({ take, source: source.source, round: source.round.dir, files: keyFiles });
    }
    const summary = round.weeks.indexOf(current) + 1;
    tiles.push({ label, summary, takes });
    keyTiles.push({ tile: label, summary: `Summary ${summary}`, id: current.id, week: current.week, takes: keyTakes });
  }

  const key = {
    version: 1,
    generatedAt: new Date().toISOString(),
    algorithm: 'SHA-256 rank by candidate manifest identity; identity ordering within A/B is SHA-256 parity',
    seed,
    candidate: round.dir,
    baseline: baseline?.dir || null,
    tiles: keyTiles,
  };
  await Bun.write(join(stage, 'blind-key.json'), `${JSON.stringify(key, null, 2)}\n`);
  return { tiles, key };
}

function artifactLines(files, indent = '') {
  const lines = [];
  for (const role of Object.keys(ROLE_LABELS)) {
    const file = files[role];
    if (file) lines.push(`${indent}- ${ROLE_LABELS[role]}: ${pathCode(file.absolute || file)}`);
  }
  return lines;
}

function closeupLines(week, indent = '') {
  const lines = week.closeups.map((closeup) => `${indent}- ${closeup.kind} close-up (${closeup.featureKind}, feature ${text(closeup.featureId)}): ${pathCode(closeup.file.absolute)}`);
  if (week.files?.held && plainObject(week.raw.heldOrbit)) {
    lines.push(`${indent}- Held-camera pose: ${text(week.raw.heldOrbit.camera)}; motion.orbitRate=${week.raw.heldOrbit.overrideParams?.['motion.orbitRate'] ?? 'n/a'}.`);
  }
  if (week.transition) {
    lines.push(`${indent}- Transition timing: ${text(week.transition.source)}; captured deterministically with ${text(week.transition.deterministicCapture)} at ${week.transition.fps} fps (${week.transition.stepMs} ms steps).`);
  }
  return lines;
}

function perfLine(week) {
  const perf = week.raw.perf;
  const state = perf.pass ? 'PASS' : 'FAIL';
  const reported = perf.reported || {};
  const observed = perf.frameCalls || {};
  const failures = Array.isArray(perf.failures) && perf.failures.length ? `; ${perf.failures.map(text).join('; ')}` : '';
  return `**${state}** — reported ${reported.frameMs ?? 'n/a'} ms, frame() p95 ${observed.p95Ms ?? 'n/a'} ms, DPR ${reported.dpr ?? 'n/a'}, adaptive steps ${reported.steps ?? 'n/a'}${failures}`;
}

function identifiedInventory(round, title) {
  const lines = [`## ${title}`, '', `- Orbit contact sheet: ${pathCode(round.sheets.orbit.absolute)}`, `- Surface contact sheet: ${pathCode(round.sheets.surface.absolute)}`, ''];
  for (const week of round.weeks) {
    lines.push(`### ${text(week.week)} — ${text(week.label)}`, '', text(week.summary), '',
      ...artifactLines(week.files), ...closeupLines(week), '');
  }
  if (round.supplementalCloseups.length) {
    lines.push('### Supplemental close-up weeks', '',
      'These weeks are outside the selected still panel and exist only to exercise requested feature kinds.', '');
    for (const item of round.supplementalCloseups) {
      lines.push(`#### ${text(item.week)} — ${text(item.label)}`, '', text(item.summary), '', ...closeupLines(item), '');
    }
  }
  return lines.join('\n');
}

function comparisonSection(round, baseline) {
  if (!baseline) return '';
  const lines = ['## Identified baseline A/B paths', '', 'Candidate and baseline identities are visible in this non-blind package.', ''];
  for (const week of round.weeks) {
    const prior = baselineWeekFor(week, baseline);
    lines.push(`### ${text(week.week)} — ${text(week.label)}`, '', '**Candidate A**',
      ...artifactLines(week.files, '  '), ...closeupLines(week, '  '));
    if (prior) lines.push('', '**Baseline B**', ...artifactLines(prior.files, '  '), ...closeupLines(prior, '  '));
    else lines.push('', '**Baseline B**', '  - No matching baseline week.');
    lines.push('');
  }
  return lines.join('\n');
}

function blindInventory(blind) {
  const lines = ['## Opaque artifact inventory', '', 'Tile order is unrelated to Summary order. When two takes exist, A/B identity is also hidden.', ''];
  for (const tile of blind.tiles) {
    lines.push(`### ${tile.label}`, '');
    for (const take of tile.takes) {
      if (take.take) lines.push(`**Take ${take.take}**`);
      lines.push(...artifactLines(take.paths, '  '), '');
    }
  }
  return lines.join('\n');
}

function summariesSection(round, blind) {
  const lines = ['## Week summaries', '', blind
    ? 'These numbered summaries are deliberately unpaired with the opaque Tiles. Use each Summary exactly once.'
    : 'These summaries are identified; data-legibility scoring is not blind unless the package is regenerated with --blind.', ''];
  round.weeks.forEach((week, index) => {
    const prefix = blind ? `Summary ${index + 1}` : `${text(week.week)} — ${text(week.label)}`;
    lines.push(`### ${prefix}`, '', blind ? `**${text(week.week)} — ${text(week.label)}**` : '', text(week.summary), '');
  });
  return lines.join('\n');
}

function performanceSection(round, blind) {
  const lines = ['## Measured performance', '', `Round gate: **${round.manifest.perf.pass ? 'PASS' : 'FAIL'}**`, '',
    `Recorded budget: ${Object.entries(round.manifest.perf.budget).map(([key, value]) => `${key}=${value}`).join(', ')}`, ''];
  round.weeks.forEach((week, index) => {
    const label = blind ? `Summary ${index + 1}` : `${text(week.week)} — ${text(week.label)}`;
    lines.push(`- ${label}: ${perfLine(week)}`);
  });
  return lines.join('\n');
}

function reviewerPrompt({ blind, count, tileLabels, comparisonLabels }) {
  const matchRows = blind
    ? tileLabels.map((label) => `- ${label} -> Summary __ — confidence __% — visual evidence: __`).join('\n')
    : '- NOT SCORED — this package exposes week identity; rerun review.mjs with --blind.';
  const preferenceRows = comparisonLabels.length
    ? comparisonLabels.map((label) => `- ${label}: prefer A | B | tie — motion evidence: __ — ink/readability evidence: __`).join('\n')
    : '- No matched baseline take.';
  const blindRules = blind
    ? `This is a blind package. Use only the opaque artifact paths and numbered Summary cards printed above. Do not open the manifest, any key file, original round artifacts, parent-directory listings, link metadata, or inode metadata. Do not infer identity from ordering. Assign every Tile to exactly one Summary and every Summary to exactly one Tile; lock all ${count} predictions before any key holder reveals or scores them. For A/B tiles, judge Take A and Take B without guessing which is the candidate. The reviewer must leave the exact-match count PENDING; only the key holder may replace it with the integer scored against the key after this response is locked.`
    : 'This is an identified package. Do not claim a blind data-legibility score. Record NOT SCORED in the blind-match fields; use --blind for a valid exact-match count.';
  return `\`\`\`text
You are reviewing private Planet Creator render evidence. Work locally: do not upload, transmit, or quote the images, paths, manifest data, or personal summaries to any external service. Inspect every supplied orbit poster, yaw strip, deterministic time strip, monument surface, turning-orbit clip, held-camera orbit clip, feature close-up, and orbit-to-surface transition that exists. Apply the included rubric exactly, with special attention to frame-spacing judder, one-frame/LOD pop-in, screen-fixed grain, and every stated ink law. Performance is copied from the measured manifest section; never infer or override it from playback.

Judge object and world motion from the held-camera orbit clips and feature close-ups, where camera rotation cannot masquerade as motion; do not cite a turning orbit alone as evidence that clouds, water, groves, wheels, lagoons, cairns, monuments, spires, or treadmill forms move well. Judge orbit-to-surface clips for camera-path ease, orientation continuity, terrain/feature LOD pop-in, and the handoff into the settled surface view. Camera easing uses a render delta rather than uTime, so the round pins absolute uTime and supplies an explicit 1/30-second delta through the app’s frame hook while leaving the native performance clock intact for build budgets.

${blindRules}

Return exactly this structure and no extra sections:
PLANET CREATOR REVIEW
Overall recommendation: ACCEPT | REJECT
Performance gate: PASS | FAIL
Readability: __/5 — evidence: __
Motion quality: __/5 — evidence: __
Data legibility: __/5 | NOT SCORED
Beauty under ink laws: __/5 — evidence: __

Blind predictions:
${matchRows}
Exact match count: PENDING KEY-HOLDER SCORE / ${blind ? count : 'NOT SCORED'}

A/B preferences:
${preferenceRows}

Motion defects:
- [Tile/take and exact frame or time range] — [judder | pop-in | screen-fixed grain | other] — severity [minor | major | blocking] — evidence: __
- Write “None observed” if and only if every motion artifact was checked.

Ink-law violations:
- [Tile/take/view] — [limited palette | flat wash/hard broken edge | pigment pooling | paper-lit edge | specular | smooth ramp | gradient fill | Gaussian blur | wet-in-wet default] — severity [minor | major | blocking] — evidence: __
- Write “None observed” if and only if every view was checked.

Decision rationale: __
\`\`\``;
}

function buildReview({ round, baseline, blind, rubric }) {
  const lines = ['# Planet Creator round review', '', '## Privacy', '',
    `This is a private, local-only review package under ${pathCode(round.dir)}. Do not upload or transmit its images, clips, paths, summaries, manifest, or blind mapping. Use only a local browser/player and an explicitly approved private reviewer.`, '',
    '## Evidence protocol', '',
    'Yaw strips run left to right from 0° through 315° in 45° steps. Time strips run left to right over eight inclusive samples from t=0 to t=2 seconds. A held-camera orbit begins at the exact camera and world pose of the yaw strip’s 0° / t=1 frame, then keeps motion.orbitRate at 0. Each motion, held-camera, feature close-up, and transition clip, when present, is exactly 180 deterministic frames at 30 fps (six seconds). Orbit-to-surface motion uses the app’s real two-second camera transition: absolute uTime is pinned, each frame receives an explicit 1/30-second render delta, and native performance.now remains untouched for work budgets.', ''];
  if (blind) {
    lines.push('The artifact names below are opaque. The mapping is intentionally absent from this review; do not inspect any key file or original artifact directory before predictions and A/B judgments are locked. Only orbit, yaw, and time evidence is included because those roles exist for every Tile and take; conditional clips and monument surfaces remain in the identified package so their presence cannot leak an identity.', '', blindInventory(blind), '');
  } else {
    lines.push(identifiedInventory(round, 'Candidate artifact inventory'), '');
    if (baseline) lines.push(identifiedInventory(baseline, 'Baseline artifact inventory'), '', comparisonSection(round, baseline), '');
  }
  lines.push(summariesSection(round, Boolean(blind)), '', performanceSection(round, Boolean(blind)), '',
    '## Rubric (included verbatim)', '', '<!-- BEGIN rubric.md -->', rubric.trimEnd(), '<!-- END rubric.md -->', '',
    '## AI motion reviewer prompt', '', reviewerPrompt({
      blind: Boolean(blind),
      count: round.weeks.length,
      tileLabels: blind ? blind.tiles.map((tile) => tile.label) : round.weeks.map((week) => `${week.week} — ${week.label}`),
      comparisonLabels: blind
        ? blind.tiles.filter((tile) => tile.takes.length === 2).map((tile) => tile.label)
        : baseline ? round.weeks.filter((week) => baselineWeekFor(week, baseline)).map((week) => `${week.week} — ${week.label}`) : [],
    }), '');
  return `${lines.join('\n')}\n`;
}

async function replaceGenerated(roundDir, stage, includeBlind) {
  for (const name of GENERATED) await rm(join(roundDir, name), { recursive: true, force: true });
  if (includeBlind) {
    await rename(join(stage, 'blind'), join(roundDir, 'blind'));
    await rename(join(stage, 'blind-key.json'), join(roundDir, 'blind-key.json'));
  }
  await rename(join(stage, 'review.md'), join(roundDir, 'review.md'));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(usage); return; }
  const roundDir = await resolveRound(args.round, 'Round directory');
  const baselineDir = args.baseline ? await resolveRound(args.baseline, 'Baseline directory') : null;
  if (baselineDir === roundDir) throw new Error('Baseline directory must be different from the reviewed round.');
  const [round, baseline, rubric] = await Promise.all([
    readManifest(roundDir, 'Round'),
    baselineDir ? readManifest(baselineDir, 'Baseline') : null,
    readFile(rubricPath, 'utf8'),
  ]);
  if (!rubric.trim()) throw new Error(`Rubric is empty at ${rubricPath}.`);

  const stage = await mkdtemp(join(roundDir, '.review-stage-'));
  let committed = false;
  try {
    const blind = args.blind ? await buildBlindPackage(round, baseline, stage) : null;
    const review = buildReview({ round, baseline, blind, rubric });
    const fenceCount = (review.match(/```/g) || []).length;
    if (fenceCount !== 2) throw new Error(`Review must contain exactly one fenced AI prompt; found ${fenceCount / 2}.`);
    await Bun.write(join(stage, 'review.md'), review);
    await replaceGenerated(roundDir, stage, Boolean(blind));
    committed = true;
    console.log(`review: wrote ${join(roundDir, 'review.md')}${blind ? ' and opaque blind package' : ''}`);
  } finally {
    if (!committed || await lstat(stage).then(() => true, () => false)) await rm(stage, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`review: ${error?.message || String(error)}`);
    process.exitCode = 1;
  });
}

/* How a session was done, read once at import while its samples still exist and kept as a few small fields (the
 * planet keeps no stream): where it was done (place), what kind of effort it was (shape), its intensity along the way
 * (ribbon), its repeats (reps) and, for a race, its splits. Every field is null when the samples cannot say: unknown is
 * never 'steady'. Pure and DOM-free; fit-import.js and the provider Functions (functions/_shared/*-map.js) call it. */

// a link keeps a place or shape as its index here (share.js): append to these lists, never reorder them
export const PLACES = ['road', 'treadmill', 'trainer', 'pool', 'open', 'gym', 'mat', 'stairs', 'elliptical'];
export const SHAPES = ['intervals', 'tempo', 'steady', 'long', 'recovery', 'climb'];
const ROUTELESS = new Set(['treadmill', 'trainer', 'pool', 'gym', 'mat', 'stairs', 'elliptical']);

/** Where a session was done, for a reader: the place the link carries, or for a link from before places (no field at
 *  all) the one thing its words can still tell, which machine a fitness_equipment session was. A stair stepper or an
 *  elliptical is never read as a treadmill. */
export function placeOf(a) {
  if (a?.place !== undefined) return a.place;
  if (String(a?.sport || '').toLowerCase() !== 'fitness_equipment') return null;
  const title = String(a.title || '').toLowerCase();
  if (/stair/.test(title)) return 'stairs';
  if (/ellipt/.test(title)) return 'elliptical';
  if (/treadmill|run|walk/.test(title)) return 'treadmill';
  if (/bike|cycle|spin|trainer/.test(title)) return 'trainer';
  return 'gym';
}

/** A session with no route of its own: a machine, a pool, a mat, or (with no place known) no GPS. */
export function isRouteless(a) {
  return a?.place != null ? ROUTELESS.has(a.place) : !a?.hasGps;
}

const RIBBON = 12; // the samples a session's intensity is kept as
const BIN_S = 5; // the grid a session's samples are read on, s
const MAX_GAP_S = 10; // a longer gap between samples is a pause, and counts this much
const MIN_S = 10 * 60; // a shorter session shows no structure worth naming
// One ribbon step: 7% of the session's own middle speed, or 3.5% of its heart rate, which moves about half as far.
// Level 3 is the session's middle, so a ribbon says how a session went against itself; shape says how hard it was.
const STEP = { speed: 0.07, hr: 0.035 };
// what the series has to clear before it says anything: its spread for repeats, its lift for one held block, and
// how little it may wander to be called level
const REPS_SPREAD = { speed: 0.25, hr: 0.12 };
const REP_LIFT = { speed: 0.12, hr: 0.05 };
const TEMPO_LIFT = { speed: 0.08, hr: 0.05 };
const TEMPO_CV = { speed: 0.05, hr: 0.03 };
const FLAT_SPREAD = { speed: 0.12, hr: 0.08 };

const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** Where a session was done, at import: from the provider's own word for it (FIT sub_sport and profile name, Strava
 *  sport_type, Junction's sport slug), its sport, whether it has a route, and Strava's trainer flag. Null when they
 *  cannot say: a run with no GPS may be a treadmill or a watch with GPS off. */
export function placeFrom({ sport, hint = '', hasGps = false, trainer = false } = {}) {
  const s = String(sport || '').toLowerCase();
  const h = String(hint || '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  if (/stair/.test(h)) return 'stairs';
  if (/ellipt/.test(h)) return 'elliptical';
  if (/treadmill/.test(h)) return 'treadmill';
  if (/lap_swim|pool/.test(h)) return 'pool';
  if (/open_water/.test(h)) return 'open';
  if (/yoga|pilates|breath|flexib|stretch|mobility|meditat/.test(h)) return 'mat';
  if (/strength|weight|crossfit|hiit|high_intensity|cardio|indoor_row|virtual_row|amrap|emom|tabata/.test(h)) return 'gym';
  if (s === 'cycling' && (trainer || /indoor|virtual|spin|trainer/.test(h))) return 'trainer';
  if (/^(running|walking)$/.test(s) && (trainer || /virtual/.test(h))) return 'treadmill';
  if (s === 'swimming') return hasGps ? 'open' : 'pool';
  if (hasGps && /^(running|walking|hiking|cycling)$/.test(s)) return 'road';
  return null;
}

/** A route-less session's recorded ascent is incline, not climb: it moves out of ascentM into inclineM. */
export function climbOf(ascentM, routeless) {
  return routeless && finite(ascentM) && ascentM > 0 ? { ascentM: null, inclineM: ascentM } : { ascentM };
}

// foot sessions read speed first, rides heart rate first (a ride's speed is the road's grade as much as the rider),
// machines heart rate only
function familyOf(sport, place) {
  const s = String(sport || '').toLowerCase();
  if (place === 'stairs' || place === 'elliptical' || s === 'fitness_equipment') return 'machine';
  if (/^(running|walking|hiking)$/.test(s)) return 'foot';
  if (s === 'cycling') return 'ride';
  return null;
}

/** One signal on a 5 s grid of moving time, smoothed, with its median: or null when the session is too short, the
 *  signal covers too little of it, or it is too faint to read. */
function gridOf(t, x, kind, family) {
  const n = Math.min(t?.length ?? 0, x?.length ?? 0);
  if (n < 60) return null;
  const at = new Float64Array(n);
  for (let i = 1; i < n; i++) at[i] = at[i - 1] + (finite(t[i]) && finite(t[i - 1]) ? clamp(t[i] - t[i - 1], 0, MAX_GAP_S) : 0);
  const total = at[n - 1];
  if (total < MIN_S) return null;
  const m = Math.floor(total / BIN_S) + 1;
  const sum = new Float64Array(m), weight = new Float64Array(m);
  let covered = 0;
  for (let i = 0; i < n; i++) {
    const value = x[i];
    if (!finite(value) || value < 0 || (kind === 'hr' && value < 30)) continue;
    const held = i + 1 < n ? at[i + 1] - at[i] : 0;
    const k = Math.floor(at[i] / BIN_S);
    sum[k] += value * (held || 1e-3);
    weight[k] += held || 1e-3;
    covered += held;
  }
  if (covered < 0.7 * total) return null;
  const raw = new Float64Array(m);
  let last = -1;
  for (let k = 0; k < m; k++) {
    if (weight[k] > 0) raw[k] = sum[k] / weight[k];
    else if (last >= 0) raw[k] = raw[last];
    if (weight[k] > 0 && last < 0) raw.fill(raw[k], 0, k);
    if (weight[k] > 0) last = k;
  }
  const half = kind === 'speed' ? 3 : 2; // a 35 s window for speed, 25 s for heart rate
  const prefix = new Float64Array(m + 1);
  for (let k = 0; k < m; k++) prefix[k + 1] = prefix[k] + raw[k];
  const out = new Float64Array(m);
  for (let k = 0; k < m; k++) {
    const a = Math.max(0, k - half), b = Math.min(m, k + half + 1);
    out[k] = (prefix[b] - prefix[a]) / (b - a);
  }
  const sorted = Float64Array.from(out).sort();
  const ref = sorted[m >> 1];
  const floor = kind === 'hr' ? 60 : family === 'ride' ? 2 : 0.8;
  return ref >= floor ? { x: out, sorted, ref, kind } : null;
}

const quantile = (sorted, q) => sorted[Math.round(q * (sorted.length - 1))];

function ribbonOf({ x, ref, kind }) {
  const m = x.length;
  const ribbon = [];
  for (let k = 0; k < RIBBON; k++) {
    const from = Math.floor((k * m) / RIBBON), to = Math.max(from + 1, Math.floor(((k + 1) * m) / RIBBON));
    let s = 0;
    for (let i = from; i < to; i++) s += x[Math.min(i, m - 1)];
    ribbon.push(clamp(Math.round(3 + (s / (to - from) / ref - 1) / STEP[kind]), 0, 7));
  }
  return ribbon;
}

/** Repeats the watch's own laps show: the work laps beside a workout's rest laps (any session), or laps pressed by
 *  hand, fast and slow by turns (on foot). Laps a watch closes by distance, place or clock are splits, never reps. */
function repsFromLaps(laps, family) {
  const list = (Array.isArray(laps) ? laps : []).filter((l) => finite(l?.s) && l.s >= 15);
  if (list.length < 5) return null;
  const rest = (l) => l?.intensity === 'rest' || l?.intensity === 'recovery';
  if (list.filter(rest).length >= 2) {
    let reps = 0;
    for (let i = 0; i < list.length; i++) {
      if (rest(list[i]) || list[i].intensity === 'warmup' || list[i].intensity === 'cooldown') continue;
      if (rest(list[i - 1]) || rest(list[i + 1])) reps++;
    }
    return reps >= 2 ? reps : null;
  }
  if (family !== 'foot' || !list.every((l) => l.trigger === 'manual' || l.trigger === 'session_end')) return null;
  const speeds = list.map((l) => (finite(l.v) && l.v > 0 ? l.v : finite(l.m) && l.m > 0 ? l.m / l.s : null));
  if (speeds.some((v) => v == null)) return null;
  const middle = [...speeds].sort((a, b) => a - b)[speeds.length >> 1];
  let reps = 0, fastSum = 0, fastN = 0, slowSum = 0, slowN = 0, seenFast = false, inFast = false;
  for (let i = 0; i < speeds.length; i++) {
    const fast = speeds[i] >= middle * 1.12;
    if (fast) {
      if (!inFast) reps++;
      fastSum += speeds[i];
      fastN++;
      seenFast = inFast = true;
    } else {
      // a slow lap between two reps is a recovery; one before the first or after the last is the warm-up or cool-down
      if (seenFast && speeds.slice(i + 1).some((v) => v >= middle * 1.12)) { slowSum += speeds[i]; slowN++; }
      inFast = false;
    }
  }
  return reps >= 3 && slowN && fastSum / fastN >= 1.2 * (slowSum / slowN) ? reps : null;
}

/** Repeats in the series itself: rises clearly over the session's own moving middle (a stop, a traffic light or a
 *  standing rest, is never the low they are measured against), each between 30 s (45 s on heart rate, which lags)
 *  and 15 minutes, at least three of them, no one more than six times another, starting on a steady beat (no gap
 *  between starts over three times another), and together between a twelfth and three fifths of the session. A
 *  steady run's noise never clears the spread gate. */
function repsFromGrid({ x, sorted, ref, kind }) {
  const m = x.length;
  const p10 = quantile(sorted, 0.1), p90 = quantile(sorted, 0.9), spread = p90 - p10;
  if (spread / ref < REPS_SPREAD[kind]) return null;
  const lift = quantile(sorted.subarray(sorted.findIndex((v) => v >= 0.3 * p90)), 0.5) * (1 + REP_LIFT[kind]);
  const up = p10 + 0.65 * spread, down = p10 + 0.35 * spread;
  const shortest = kind === 'speed' ? 6 : 9, longest = 180;
  const starts = [], lengths = [];
  let high = false, start = 0;
  for (let i = 0; i <= m; i++) {
    const value = i < m ? x[i] : -Infinity;
    if (!high && value >= up) { high = true; start = i; continue; }
    if (!high || value > down) continue;
    high = false;
    let s = 0;
    for (let k = start; k < i; k++) s += x[k];
    if (i - start >= shortest && i - start <= longest && s / (i - start) >= lift) { starts.push(start); lengths.push(i - start); }
  }
  if (lengths.length < 3) return null;
  const gaps = starts.slice(1).map((s, i) => s - starts[i]);
  const covered = lengths.reduce((a, b) => a + b, 0) / m;
  return Math.max(...lengths) <= 6 * Math.min(...lengths) && Math.max(...gaps) <= 3 * Math.min(...gaps)
    && covered >= 1 / 12 && covered <= 0.6 ? Math.min(lengths.length, 99) : null;
}

function coarse(x, count) {
  const m = x.length;
  const out = new Float64Array(count);
  for (let k = 0; k < count; k++) {
    const from = Math.floor((k * m) / count), to = Math.max(from + 1, Math.floor(((k + 1) * m) / count));
    let s = 0;
    for (let i = from; i < to; i++) s += x[Math.min(i, m - 1)];
    out[k] = s / (to - from);
  }
  return out;
}

/** One held block through the middle: a quarter to three fifths of the session and ten minutes or more, after a
 *  warm-up and before a cool-down that were themselves run (each at least two thirds of the block on average, not
 *  walked), clearly over the upper quarter of each (so neither a steady run between a walk out and a walk back nor
 *  a fast finish is a tempo), and level inside. */
function tempoIn({ x, kind }) {
  const c = coarse(x, 48);
  const prefix = new Float64Array(49);
  for (let k = 0; k < 48; k++) prefix[k + 1] = prefix[k] + c[k];
  const mean = (a, b) => (prefix[b] - prefix[a]) / (b - a);
  // the upper quarter of each warm-up (parts before s) and cool-down (parts from e) a block could have
  const head = new Float64Array(21), tail = new Float64Array(45);
  for (let s = 4; s <= 20; s++) head[s] = quantile(c.slice(0, s).sort(), 0.75);
  for (let e = 16; e <= 44; e++) tail[e] = quantile(c.slice(e).sort(), 0.75);
  const shortest = Math.max(12, Math.ceil(600 / ((x.length * BIN_S) / 48)));
  for (let s = 4; s <= 20; s++) {
    for (let e = s + shortest; e <= Math.min(s + 29, 44); e++) {
      const block = mean(s, e);
      if (Math.min(mean(0, s), mean(e, 48)) < (2 / 3) * block) continue;
      if (block / Math.max(head[s], tail[e]) - 1 < TEMPO_LIFT[kind]) continue;
      let wander = 0;
      for (let k = s; k < e; k++) wander += (c[k] - block) ** 2;
      if (Math.sqrt(wander / (e - s)) / block <= TEMPO_CV[kind]) return true;
    }
  }
  return false;
}

/** Level the whole way: from the end of a warm-up (the first fifth) to the start of a cool-down (the last tenth) the
 *  session holds a narrow band about its own median, and neither end, taken as a whole, runs above that band: a fast
 *  finish is not steady. */
function isFlat({ x, kind }) {
  const c = coarse(x, 48);
  const middle = c.slice(10, 43).sort();
  const lo = quantile(middle, 0.1), hi = quantile(middle, 0.9), median = quantile(middle, 0.5);
  if ((hi - lo) / median > FLAT_SPREAD[kind]) return false;
  const ceiling = hi + 0.5 * FLAT_SPREAD[kind] * median;
  const mean = (a, b) => c.slice(a, b).reduce((s, v) => s + v, 0) / (b - a);
  return mean(0, 10) <= ceiling && mean(43, 48) <= ceiling;
}

// an easy hour or less, nearly all of it under 70% of max heart rate: the generator's zones 1 and 2
function isEasy({ hrZoneSeconds, activeS }) {
  const z = Array.isArray(hrZoneSeconds) ? hrZoneSeconds.map((s) => (finite(s) && s > 0 ? s : 0)) : null;
  const total = z ? z.reduce((a, b) => a + b, 0) : 0;
  return total > 0 && activeS > 0 && activeS <= 3600 && (z[0] + z[1]) / total >= 0.75 && (z[3] + z[4]) / total <= 0.02;
}

// a hike that climbed, or a run slow on a steep route: climbing was the session
function isSteep({ sport, hasGps, distanceM, ascentM, activeS }) {
  if (!hasGps || !(distanceM >= 1000) || !finite(ascentM)) return false;
  const perKm = ascentM / (distanceM / 1000);
  if (sport === 'hiking' || sport === 'walking') return perKm >= 25;
  return sport === 'running' && perKm >= 40 && activeS > 0 && distanceM / activeS <= 2.5;
}

function regroup(parts, count) {
  const out = [];
  for (let g = 0; g < count; g++) {
    let m = 0, s = 0;
    for (let i = Math.floor((g * parts.length) / count); i < Math.floor(((g + 1) * parts.length) / count); i++) {
      m += parts[i][0];
      s += parts[i][1];
    }
    out.push([m, s]);
  }
  return out;
}

// each whole kilometre's time from the distance and time series, and the last part when it is 200 m or more
function kilometres(t, d) {
  const n = Math.min(t?.length ?? 0, d?.length ?? 0);
  const parts = [];
  let lastT = null, lastD = null, markT = null, markD = 0;
  for (let i = 0; i < n; i++) {
    if (!finite(t[i]) || !finite(d[i])) continue;
    if (lastT == null) {
      lastT = markT = t[i];
      lastD = markD = d[i];
      continue;
    }
    if (d[i] <= lastD) { lastT = t[i]; continue; }
    while (d[i] >= markD + 1000) {
      const crossT = lastT + ((t[i] - lastT) * (markD + 1000 - lastD)) / (d[i] - lastD);
      parts.push([1000, crossT - markT]);
      markT = crossT;
      markD += 1000;
      lastT = crossT;
      lastD = markD;
    }
    lastT = t[i];
    lastD = d[i];
  }
  if (lastD != null && lastD - markD >= 200) parts.push([lastD - markD, lastT - markT]);
  return parts;
}

/** A session's splits, seconds per km for each part: the watch's own laps when it kept two or more, else each
 *  kilometre of the distance and time series; past 64 parts, neighbours join into 64. Null when a part is implausible.
 *  Read for every session, since an import may learn a session was a race after this (a title from the export's
 *  list); the link keeps them for races only (share.js). */
function splitsFrom(t, d, laps) {
  const lapped = (Array.isArray(laps) ? laps : []).filter((l) => finite(l?.m) && l.m >= 100 && finite(l?.s) && l.s > 0);
  let parts = lapped.length >= 2 ? lapped.map((l) => [l.m, l.s]) : kilometres(t, d);
  if (parts.length < 2) return null;
  if (parts.length > 64) parts = regroup(parts, 64);
  const splits = parts.map(([m, s]) => Math.round((s / m) * 1000));
  return splits.every((x) => x >= 30 && x <= 3600) ? splits : null;
}

/**
 * How a session went, from its samples: parallel series t (seconds, rising: elapsed or Unix), v (speed, m/s), hr (bpm)
 * and d (distance, m), any of them absent, and laps ({ s, m, v, hr, intensity, trigger }) when the watch kept them.
 * In order: repeats in the laps, a climb, repeats in the series, one held block, then level (recovery when easy and
 * short, else steady). Returns { shape, ribbon, reps, splits }; each null when the samples cannot say.
 */
export function effortFrom({ t, v, hr, d, laps } = {}, activity = {}) {
  const out = { shape: null, ribbon: null, reps: null, splits: splitsFrom(t, d, laps) };
  const family = familyOf(activity.sport, activity.place);
  if (!family) return out;
  const order = family === 'foot' ? [[v, 'speed'], [hr, 'hr']] : family === 'ride' ? [[hr, 'hr'], [v, 'speed']] : [[hr, 'hr']];
  let grid = null;
  for (const [x, kind] of order) if (!grid) grid = gridOf(t, x, kind, family);
  if (!grid) return out;
  out.ribbon = ribbonOf(grid);
  const lapReps = repsFromLaps(laps, family);
  if (lapReps) return { ...out, shape: 'intervals', reps: lapReps };
  if (family === 'foot' && isSteep(activity)) return { ...out, shape: 'climb' };
  const reps = repsFromGrid(grid);
  if (reps) return { ...out, shape: 'intervals', reps };
  if (tempoIn(grid)) return { ...out, shape: 'tempo' };
  if (isFlat(grid)) return { ...out, shape: isEasy(activity) ? 'recovery' : 'steady' };
  return out;
}

/** Every effort field for one session at import, in the activity's own names, to spread over it: hint, trainer and
 *  the samples as placeFrom and effortFrom take them. */
export function effortFields(activity, { hint = '', trainer = false, series = {} } = {}) {
  const place = placeFrom({ sport: activity.sport, hint, hasGps: activity.hasGps, trainer });
  return {
    place,
    ...effortFrom(series, { ...activity, place }),
    ...climbOf(activity.ascentM, isRouteless({ place, hasGps: activity.hasGps })),
  };
}

/** The week's long run: its longest run, when that run was steady and lasted 75 minutes or more. */
export function markLong(activities) {
  let longest = null;
  for (const a of activities) if (a.sport === 'running' && (a.distanceM || 0) > (longest?.distanceM || 0)) longest = a;
  if (longest?.shape === 'steady' && longest.activeS >= 75 * 60) longest.shape = 'long';
}

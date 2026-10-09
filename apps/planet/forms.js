/* Planet Creator — what a session's effort builds (round 13's levers; the fields are the data contract's: place,
 * shape, ribbon, reps, splits, inclineM).
 *
 * A run with a route is a ridge (base.js routeFor), and its effort shapes the crest: intervals carve terraces, a
 * tempo holds one high shelf, an easy day lies down, and a steady run keeps the smooth crest it always had. A
 * session with no route is built in its own day's slice: a stair stepper as a flight of stairs, an elliptical as a
 * raised oval, and a run as a built hill whose shelves are its effort. A race's own splits band its ring. The
 * generator (base.js), the race rings and the reading (planet-home/lib/reading.js) all read this module, so they
 * never name a form differently. A session that carries none of the contract's fields has no effort and no form,
 * and is drawn and read as it always was, unless its title names a stair stepper or an elliptical (placeOf).
 */
import { placeOf } from './effort.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// The four heights a shelf may stand at, as shares of the ridge's own: quantised this coarsely so a shelf reads as
// one from orbit instead of as a wobble in the crest.
const STEP = [0.4, 0.6, 0.8, 1];

function ribbonOf(a) {
  const r = a?.ribbon;
  return Array.isArray(r) && r.length >= 2 && r.every((v) => Number.isFinite(v)) ? r : null;
}

// the ribbon on the session's own range, 0..1, so a hard set reads as one wherever the watch put its numbers
function spread(r) {
  let lo = Infinity, hi = -Infinity;
  for (const v of r) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  return hi - lo < 1e-6 ? r.map(() => 0.5) : r.map((v) => (v - lo) / (hi - lo));
}

/** How many hard stretches a session ran: its own count (laps, or the rises effort.js saw), else the rises in its
 *  ribbon — a sample in the top half of its range after one in the bottom half. Null when nothing says. */
export function repsOf(a) {
  const reps = Number(a?.reps);
  if (Number.isFinite(reps) && reps > 0) return Math.round(reps);
  const r = ribbonOf(a);
  if (!r) return null;
  const s = spread(r);
  let rises = 0;
  for (let i = 1; i < s.length; i++) if (s[i] >= 0.5 && s[i - 1] < 0.5) rises++;
  return rises || null;
}

/**
 * What a session with no route (base.js kind 'constructed') is built as: 'stair' (a stair stepper), 'oval' (an
 * elliptical), and for the rest of them a built hill — 'terraces' (intervals), 'shelf' (a tempo), 'low' (an easy
 * day) or 'mound' (anything else, the effort unknown included). Null for a session that carries none of the
 * contract's fields: it stays the machine it always was.
 */
export function formOf(a) {
  const place = placeOf(a);
  if (place === 'stairs') return 'stair';
  if (place === 'elliptical') return 'oval';
  if (a.place == null && a.shape == null && a.ribbon == null && a.reps == null) return null;
  if (a.shape === 'intervals') return 'terraces';
  if (a.shape === 'tempo') return 'shelf';
  if (a.shape === 'recovery') return 'low';
  return 'mound';
}

/** The terraces a built hill steps up in: one a rep, three to six. */
export function tiersOf(a) {
  return clamp(repsOf(a) ?? 4, 3, 6);
}

/**
 * The session's effort along its route, for a ridge: `levels` (shares of the ridge's height laid evenly along the
 * course, at most four distinct), how flat a shelf's top is laid (`flat`, 0..1) and how much wider the ridge lies
 * (`wide`). Null keeps the crest it always had: a steady run, a long one, a climb, and a session that says nothing.
 */
export function ridgeEffort(a) {
  const r = ribbonOf(a);
  if (a?.shape === 'intervals') {
    if (r) return { levels: spread(r).map((v) => STEP[clamp(Math.round(v * 3), 0, 3)]), flat: 1, wide: 1 };
    // no ribbon: the reps the session counted, laid evenly between a warm-up and a cool-down
    const levels = [STEP[1]];
    for (let i = 0, n = clamp(repsOf(a) ?? 4, 2, 8); i < n; i++) levels.push(STEP[3], STEP[1]);
    return { levels, flat: 1, wide: 1 };
  }
  if (a?.shape === 'tempo') {
    // one shelf: the longest stretch in the top part of the session's own range, else the middle third
    const s = r ? spread(r) : null;
    let from = -1, len = 0;
    if (s) {
      for (let i = 0; i < s.length; i++) {
        let j = i;
        while (j < s.length && s[j] >= 0.6) j++;
        if (j - i > len) { from = i; len = j - i; }
        i = j;
      }
    }
    const n = s && len >= 2 ? s.length : 9;
    if (!(s && len >= 2)) { from = 3; len = 3; }
    return { levels: Array.from({ length: n }, (_, i) => (i >= from && i < from + len ? STEP[3] : 0.55)), flat: 1, wide: 1 };
  }
  if (a?.shape === 'recovery') return { levels: [0.42], flat: 0.5, wide: 1.45 };
  return null;
}

/** A race's own splits when the record kept them (the contract's `splits`: seconds a kilometre, per lap or per
 *  kilometre of the stream), or null when it kept none: the race rings then read the pace off the course. */
export function realSplits(a) {
  const s = Array.isArray(a?.splits) ? a.splits.filter((v) => Number.isFinite(v) && v > 0) : [];
  return s.length >= 2 ? s : null;
}

/** Those splits gathered into `count` bands in the race's own order, each the mean pace of the splits it covers,
 *  as a cost against the race's mean pace (a ring's band is drawn from that cost). */
export function gatherSplits(paces, count) {
  const out = new Float64Array(count);
  let mean = 0;
  for (const v of paces) mean += v / paces.length;
  for (let i = 0; i < count; i++) {
    const a = (i * paces.length) / count, b = ((i + 1) * paces.length) / count;
    let sum = 0, w = 0;
    for (let j = Math.floor(a); j < Math.min(paces.length, Math.ceil(b)); j++) {
      const part = Math.min(b, j + 1) - Math.max(a, j);
      sum += paces[j] * part;
      w += part;
    }
    out[i] = sum / Math.max(1e-9, w) / mean;
  }
  return out;
}

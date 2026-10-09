/* Planet Creator — the race's ring: the week's race, drawn round the whole globe.
 *
 * A race week's loudest fact is a line on the ground — a marathon's course, the
 * trail the ink pass draws in vermilion and the poster pulls back to keep whole.
 * This module carries that line off the planet: one washer of pigment in a plane
 * through the globe's centre, its bands the race's own splits, its divisions the
 * race's own halves, its finish one hairline of the race line's vermilion, and
 * the planet's own shadow laid across it the way it falls out of the sun.
 *
 * Four things decide what it looks like, and all four are read from the week:
 *
 *   the plane   A ring drawn in the plane the course itself fits would be seen
 *               face-on from the poster (which is aimed at the course) and would
 *               stand at the runner's own pole, where no part of it is over his
 *               horizon — nothing of it in his sky at all. So the plane is
 *               opened instead: the family of planes that keep the runner's own
 *               sky (the site sits a lean off the plane, never on it, so the
 *               ring arches over him instead of ruling a line across his zenith)
 *               is scored on what each would show the poster — the ellipse as
 *               open as the geometry allows, the sun well off the plane so the
 *               rings carry light and the planet's shadow crosses them, the lit
 *               face toward the camera — and, least of all, on how much of the
 *               course's own fitted plane survives in it.
 *
 *   the banding One split per kilometre the race actually ran (or per lap, when
 *               that is more), in the race's own order: the inner edge is the
 *               start line, the outer the finish. Where the record kept the
 *               race's splits (laps, or a stream's kilometres) each band is
 *               one of them at the pace it was run; where it kept none, each
 *               is drawn with the pace the ground under it asked for — the
 *               course's own gradient (headings and the flat, sampled from the
 *               terrain the race is drawn on), the week's own fatigue over the
 *               distance, and the week's own seed — and either way a fast split
 *               is a close comb of fine loads where a slow one
 *               is fewer and wider. The halfway split is cut open as a division,
 *               the split that hurt most is opened again, and a group of splits
 *               at a time is drawn a shade heavier than its neighbours, so the
 *               ring reads as masses of bands at any size instead of as one
 *               texture. The outermost mark is the finish: one hairline of the
 *               race line's own vermilion.
 *
 *   the light   A ring is a sheet of grains, and it is lit like one: what it
 *               catches is the sun's elevation over its own plane, the face
 *               turned away from the sun is a paler glow rather than a black,
 *               and the globe's own shadow — an analytic test against the
 *               sphere, softened by the sun's own breadth — is inked across it
 *               as more pigment, not as a veil. The same shadow is thrown back
 *               on the ground by a transparent shell that hugs the terrain
 *               (MultiplyBlending, the way ink-clouds.js lays its own cast
 *               shadow), so the rings' banding crosses the week's ground.
 *
 *   the hand    Ringlets are not ruled circles: the radius the bands are read at
 *               wanders with the ring's own angle, the wash breaks dry where the
 *               sheet's tooth is high, and the outer fringe is a drift of dust
 *               whose grains catch the light one at a time. All of it is laid as
 *               the same washes the rest of the week is painted with — paper
 *               seen through a load of the palette's own pigment — so a print
 *               laid over the frame takes the ring with everything else.
 *
 * Everything is deterministic: the same week always draws the same ring, and the
 * only clock is uTime, for the drift of the dust.
 */
import { P } from './params.js';
import { attachTeardown } from './teardown.js';
import { gatherSplits, realSplits } from './forms.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a || 1e-6), 0, 1); return t * t * (3 - 2 * t); };

// Where the ring sits, in planet radii. The outer edge is the reach the poster
// already fits (base.js RACE_RING_REACH 1.42, and "at most 1.4 R" is a promise
// that page makes); the inner one is as far in as a ring can stand over the
// week's own ground without the tallest peaks of a race range poking through a
// sheet that is only a few units thick in the middle of the drawing.
const RING_IN = 1.16;
const RING_OUT = 1.40;

// The band table: one row of ringlet loads per level of minification. A ring
// drawn at the shelf's own size is a hundredth of a pixel per ringlet, so the
// table keeps, under each level's blur, the mean a pixel actually covers — the
// way a real photograph of a ring is smooth and only a poster is banded. Row r
// is blurred over ROW0·2^(r−1) texels; the shader picks the two rows bracketing
// the fragment's own footprint and mixes them.
const TABLE = 2048;
const ROWS = 10;
const ROW0 = 3;

// The cast shadow's shell: it rides the capped terrain the way ink-clouds' own
// glaze does, and it multiplies rather than covers.
const SHELL_LIFT = 1.1;
const SHELL_FRAG_DARK = 0.85;

/* ------------------------------------------------------------------ maths -- */

function hashStr(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

/** A 0–100 float seed from the week's own name: what the dust and the table's
 *  own hand are drawn with, so two weeks are never one ring. */
function seedOf(week) {
  return (hashStr(String(week ?? '')) % 100000) / 1000;
}

// The plane a course's own samples are fitted by: every pair of samples votes
// with the normal of the plane it shares with the other, each by the sine of the
// angle between them, and the whole sum is one walk back to front carrying the
// rest of the course as a suffix. A course too short or too straight to have a
// plane of its own falls back to its first and last samples, then to nothing.
function courseAxis(T, seg) {
  const n = seg.length / 3;
  const out = new T.Vector3(), tail = new T.Vector3(), at = new T.Vector3(), chord = new T.Vector3();
  for (let i = n - 1; i >= 0; i--) {
    at.set(seg[i * 3], seg[i * 3 + 1], seg[i * 3 + 2]).normalize();
    out.add(chord.crossVectors(at, tail));
    tail.add(at);
  }
  if (out.lengthSq() < 1e-8) {
    out.set(0, 0, 0).crossVectors(
      new T.Vector3(seg[0], seg[1], seg[2]),
      new T.Vector3(seg[seg.length - 3], seg[seg.length - 2], seg[seg.length - 1]),
    );
  }
  return out.lengthSq() > 1e-12 ? out.normalize() : null;
}

/** The route's own midcourse: half its length along its own samples. */
function midcourse(T, race, out = new T.Vector3()) {
  const half = race.total * 0.5;
  let i = 1;
  while (i < race.cum.length - 1 && race.cum[i] < half) i++;
  const t = (half - race.cum[i - 1]) / Math.max(1e-6, race.cum[i] - race.cum[i - 1]);
  const a = (i - 1) * 3, b = i * 3;
  out.set(
    race.seg[a] + (race.seg[b] - race.seg[a]) * t,
    race.seg[a + 1] + (race.seg[b + 1] - race.seg[a + 1]) * t,
    race.seg[a + 2] + (race.seg[b + 2] - race.seg[a + 2]) * t,
  );
  return out.normalize();
}

/**
 * The direction the poster looks from: base.js's own rule (posterSubject, then
 * turnToSun) — the week's subject turned away from us, then part of the way back
 * toward the sun (POSTER_OFF 0.6 on a race week). The ring is built before the
 * poster picks its frame, and this is the frame it will pick: the ring's plane
 * has to be chosen against it, so it is read here rather than waited for.
 */
function posterAxis(T, { race, light, out = new T.Vector3() }) {
  midcourse(T, race, out).multiplyScalar(-1);
  const side = new T.Vector3().copy(light).addScaledVector(out, -light.dot(out));
  if (side.lengthSq() > 1e-8) out.addScaledVector(side.normalize(), 0.6).normalize();
  return out;
}

/**
 * What the runner's own eye holds. The chase camera stands behind him and looks
 * a little down his own road, so the sky it frames is the band from the horizon
 * up to about eleven degrees, across the front of the frame. A ring reads as an
 * arch there when its band crosses that window with its own width, so this
 * counts the part of the band (three radii, all the way round) that lands in it,
 * and how much of the frame's own azimuth the crossing spans. The first draft of
 * this ring was scored on the site's own sky alone, which put the ring's crown
 * 30-50° up — above the top of the frame, leaving a wedge of grating down one
 * side of it and, on the half marathon's week, nothing at all.
 */
function skyArch(T, { n, site, view, inner, outer, R, eye = 2.2 }) {
  const d = site.clone().normalize();
  const ahead = view ? view.clone().addScaledVector(d, -view.dot(d)) : new T.Vector3();
  if (ahead.lengthSq() < 1e-8) ahead.crossVectors(d, new T.Vector3(0, 1, 0));
  ahead.normalize();
  const across = new T.Vector3().crossVectors(d, ahead).normalize();
  const perp = d.clone().addScaledVector(n, -n.dot(d));
  if (perp.lengthSq() < 1e-10) return 0;
  perp.normalize();
  const side = new T.Vector3().crossVectors(n, perp).normalize();
  const eyeAt = d.clone().multiplyScalar(R + eye);
  const q = new T.Vector3(), v = new T.Vector3();
  const AHEAD = 0.60, EMAX = 0.199;         // the frame's own front, and its top edge
  const bins = new Set();
  let inside = 0, total = 0;
  for (let ri = 0; ri < 3; ri++) {
    const rho = inner + (outer - inner) * (ri / 2);
    for (let i = 0; i < 72; i++) {
      const phi = (i / 72) * TAU;
      q.copy(perp).multiplyScalar(Math.cos(phi)).addScaledVector(side, Math.sin(phi)).multiplyScalar(rho);
      v.copy(q).sub(eyeAt);
      const len = v.length();
      if (!(len > 1e-3)) continue;
      v.divideScalar(len);
      const e = Math.asin(clamp(v.dot(d), -1, 1));
      total++;
      if (e < 0.006 || e > EMAX) continue;      // below the horizon, or over the frame's top
      const az = Math.atan2(v.dot(across), v.dot(ahead));
      if (Math.abs(az) > AHEAD) continue;
      inside++;
      bins.add(Math.floor((az + AHEAD) / (AHEAD / 5)));
    }
  }
  if (!total) return 0;
  return clamp((inside / total) * 3.2, 0, 1) * 0.64 + clamp(bins.size / 8, 0, 1) * 0.36;
}

/**
 * How much of the planet's own shadow falls on a part of the ring the poster can
 * actually see. The shadow lies on the ring's anti-sun arc, and half of any ring
 * is behind its globe, so a plane that puts the umbra on the hidden arc leaves
 * the poster's ring with no dark mass at all — the one mark that says the rings
 * are lit by a sun and not printed flat. Scored the same way the eye would find
 * it: the ring's mid-radius all the way round, kept where the globe does not
 * stand between it and the camera, and counted where the sun's ray to that
 * fragment meets the sphere.
 */
function posterShadow(T, { n, camera, light, R, inner, outer }) {
  const rho = (inner + outer) * 0.5;
  const perp = new T.Vector3().copy(n).cross(new T.Vector3(Math.abs(n.y) > 0.9 ? 1 : 0, Math.abs(n.y) > 0.9 ? 0 : 1, 0)).normalize();
  const side = new T.Vector3().crossVectors(n, perp).normalize();
  const q = new T.Vector3();
  let lit = 0, seen = 0, total = 0;
  for (let i = 0; i < 72; i++) {
    const phi = (i / 72) * TAU;
    q.copy(perp).multiplyScalar(Math.cos(phi)).addScaledVector(side, Math.sin(phi)).multiplyScalar(rho);
    total++;
    if (q.dot(camera) <= R) continue;               // the globe stands in front of it
    seen++;
    const b = q.dot(light);
    const hit = b * b - (q.dot(q) - R * R);
    if (b < 0 && hit > 0) lit++;
  }
  if (!total) return 0;
  return clamp((lit / total) * 4.5, 0, 1) * clamp(seen / total * 1.6, 0, 1);
}

/**
 * The ring's plane. The family is every plane that is a lean off the site's own
 * plane, all the way round the sky — and each is scored on what it would show:
 * the poster's ellipse as open as the family allows, the runner's own sky
 * carrying an arch, the planet's shadow falling on a part of the ring the poster
 * can see, the sun off the plane, the lit face toward the poster's eye, and last
 * the course's own fitted plane. The lean is searched as well as the azimuth:
 * too small and the ring is a crown above the runner's frame, too large and the
 * band sits on his horizon instead of arching over it. `open` is that winner;
 * the dial blends it back toward the fitted plane, so at 0 the ring lies where
 * the course's own plane lies and at 1 it is the ring the runner sees over him.
 */
function ringAxis(T, { course, site, view, camera, light, tilt, inner, outer, R }) {
  const zenith = site.clone().normalize();
  const ref = Math.abs(zenith.y) > 0.9 ? new T.Vector3(1, 0, 0) : new T.Vector3(0, 1, 0);
  const e1 = new T.Vector3().crossVectors(zenith, ref).normalize();
  const e2 = new T.Vector3().crossVectors(zenith, e1).normalize();
  const n = new T.Vector3(), best = new T.Vector3();
  let bestScore = -Infinity;
  for (let li = 0; li < 14; li++) {
    const lean = 0.12 + (0.80 - 0.12) * (li / 13);
    for (let i = 0; i < 72; i++) {
      const phi = (i / 72) * TAU;
      n.copy(zenith).multiplyScalar(lean)
        .addScaledVector(e1, Math.cos(phi))
        .addScaledVector(e2, Math.sin(phi))
        .normalize();
      const open = Math.abs(n.dot(camera));       // |n·camera|: the ellipse's own flattening
      const sun = Math.abs(n.dot(light));         // the sun's elevation over the plane
      const seen = n.dot(camera) * n.dot(light);  // the lit face, or its underside
      // the open ellipse: the eye some 50° off the ring's pole, so the washer is
      // neither the line an edge-on ring is nor the halo a face-on one is — and
      // at this flattening the near arc's own band crosses the globe's disc
      // instead of ringing it, which is what says a ring and not a saucer
      const ellipse = Math.max(0, 1 - Math.abs(open - 0.60) / 0.34);
      const score = 0.34 * ellipse
        + 0.28 * skyArch(T, { n, site, view, inner, outer, R })
        + 0.12 * posterShadow(T, { n, camera, light, R, inner, outer })
        + 0.14 * Math.max(0, 1 - Math.abs(sun - 0.52) / 0.48)
        + 0.06 * sstep(-0.02, 0.12, seen)
        + 0.06 * n.dot(course);
      if (score > bestScore + 1e-9) { bestScore = score; best.copy(n); }
    }
  }
  const t = clamp(Number(tilt), 0, 1);
  if (t < 1) best.multiplyScalar(t).addScaledVector(course, 1 - t);
  return best.lengthSq() > 1e-12 ? best.normalize() : course.clone();
}

/* ----------------------------------------------------------------- banding -- */

/**
 * The race's own banding: the splits, the pace each was run at, and where the
 * divisions and the finish line fall in the ring's own width (u: 0 at the inner
 * edge, 1 at the outer). Where the record kept the race's splits they are the
 * bands, at the pace each was run. Where it kept none, nothing here is a time:
 * the pace is read off the ground the race was drawn on (the terrain under each
 * split's own stretch of the course), the week's own fatigue over the distance
 * it ran, and the week's own seed for the day each split had.
 */
function laceFrom(T, { features, race, stats, seed }) {
  const rng = features.makeRng(`companion-ring/${seed.toFixed(2)}`);
  const n = race.seg.length / 3;
  const at = new T.Vector3();
  const ground = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    at.set(race.seg[i * 3], race.seg[i * 3 + 1], race.seg[i * 3 + 2]);
    const h = Number(features.heightAt(at));
    ground[i] = Number.isFinite(h) ? h : 0;
  }

  // One split per kilometre — or per lap, when the watch divided the race into
  // more of those than that, or the record's own splits — and
  // `companions.ringBands` walks the count down to a coarse reading of the race.
  const km = Math.max(0, Number(stats?.distanceM) || 0) / 1000;
  const laps = Math.max(0, Number(stats?.laps) || 0);
  const bands = clamp(Number(P['companions.ringBands']), 0, 1);
  const real = realSplits(stats);
  const splits = real
    ? clamp(Math.round(real.length * (0.30 + 0.70 * bands)), Math.min(6, real.length), 48)
    : clamp(Math.round(Math.max(km, laps, 8) * (0.30 + 0.70 * bands)), 6, 48);

  // What each split of the ground asked of the race: the course's own gradient,
  // read against the course's own average slope, so a mountain week and a flat
  // one are both drawn as the race they were and neither saturates the dial.
  const cost = real ? gatherSplits(real, splits) : new Float64Array(splits);
  const fatigue = clamp((km || 10) / 100, 0.06, 0.42);
  if (!real) {
    const rise = new Float64Array(splits);
    let meanAbs = 0;
    for (let i = 0; i < splits; i++) {
      const a = Math.floor((i * n) / splits);
      const b = Math.max(a + 1, Math.floor(((i + 1) * n) / splits)) - 1;
      const ds = Math.max(1e-3, race.cum[b] - race.cum[a]);
      rise[i] = (ground[b] - ground[a]) / ds;
      meanAbs += Math.abs(rise[i]);
    }
    meanAbs = Math.max(1e-6, meanAbs / splits);
    for (let i = 0; i < splits; i++) {
      const grade = clamp(rise[i] / meanAbs, -2.2, 2.2);
      let c = 1 + 0.34 * Math.max(0, grade) - 0.22 * Math.min(0, grade);
      c *= 1 + fatigue * Math.pow(i / Math.max(1, splits - 1), 2.2);
      c *= 1 + 0.10 * (rng() * 2 - 1);
      cost[i] = clamp(c, 0.45, 2.2);
    }
  }
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < splits; i++) { lo = Math.min(lo, cost[i]); hi = Math.max(hi, cost[i]); }
  const pace = new Float64Array(splits);
  let slowest = 0;
  // an evenly run race reads even: real splits a few seconds apart are not drawn as a fast comb and a slow one
  const spread = real ? Math.max(hi - lo, 0.06) : hi - lo;
  for (let i = 0; i < splits; i++) {
    pace[i] = spread < 1e-4 ? 0.6 : 1 - (cost[i] - lo) / spread;
    if (cost[i] > cost[slowest]) slowest = i;
  }

  // The ring's own width, laid out: soft margins at both ends (so the geometry's
  // own edges are never a cut), the race's banding up to the finish line, the
  // drift beyond it. The two divisions are the one mark that has to survive the
  // poster, so they are measured in the ring's own width rather than in splits:
  // the first version cut the halfway division 0.6 of *one split's* slice wide,
  // which is half a pixel at the shelf — a division nobody could see.
  const MARGIN = 0.028;
  const TOP = 0.872;                  // where the race's own banding stops
  const DIV_HALF = 0.046;             // the race's own half, cut open
  const DIV_WALL = 0.024;             // …and the split that hurt most, opened again
  const FINISH = TOP + 0.007;         // the vermilion hairline, just outside it
  const DUST0 = 0.906;                // the drift that never settled, outermost

  const wob = new Float64Array(splits);
  let wobTotal = 0;
  for (let i = 0; i < splits; i++) { wob[i] = 0.82 + 0.36 * rng(); wobTotal += wob[i]; }
  // the masses: a handful of splits at a time drawn a shade heavier, so the ring
  // reads as groups of bands and not as one even comb
  const groups = Math.max(1, Math.round(splits / 5));
  const groupLoad = new Float64Array(groups);
  for (let i = 0; i < groups; i++) groupLoad[i] = 0.66 + 0.62 * rng();

  const half = Math.floor(splits / 2);
  const wallGap = slowest !== half ? DIV_WALL : 0;
  const span = TOP - MARGIN - DIV_HALF - wallGap;
  const plan = [];
  let cursor = MARGIN;
  for (let i = 0; i < splits; i++) {
    const slice = (span * wob[i]) / wobTotal;
    const room = slice * 0.92;
    const strokes = 1 + Math.round(2.0 * pace[i]);      // a fast split is a comb
    const load = (0.58 + 0.52 * pace[i]) * groupLoad[Math.floor(i / 5) % groups];
    const tint = clamp(0.02 + 0.94 * ((i + 0.5) / splits) + 0.06 * (rng() - 0.5), 0, 1);
    // The gap a stroke leaves is a real one: at the runner's own scale a ringlet
    // is two or three pixels across, and a comb of them with hairline gaps is a
    // grating rather than a ring — so every stroke carries its own width and a
    // gap of the same order, and the ring reads as separate loads of the brush.
    const unit = room / (strokes + 1.05 * (strokes - 1));
    let inner = cursor;
    for (let j = 0; j < strokes; j++) {
      const w = unit * (0.78 + 0.40 * rng());
      plan.push({
        u0: inner,
        u1: Math.min(inner + w, TOP),
        load: clamp(load * (j === 0 ? 1 : 0.70), 0, 1),
        tint: clamp(tint + 0.05 * (rng() - 0.5), 0, 1),
        phase: rng(),
        verm: 0,
      });
      inner += w + unit * 1.05;
    }
    cursor += slice;
    if (i === half) cursor += DIV_HALF;
    else if (i === slowest && wallGap) cursor += wallGap;
  }

  // the finish: the race line's own vermilion, one hairline at the outer end of
  // the race's own banding
  plan.push({ u0: FINISH, u1: FINISH + 0.020, load: 0.95, tint: 1, phase: rng(), verm: 1 });

  // …and beyond it the drift the ring never gathered: a fringe of dust, fading
  // out into the sheet, that the dust dial takes away. The first version laid it
  // faint enough that the ring simply ended at the finish line — a rim of dust
  // has to carry weight of its own, or the poster sees a washer with a cut edge.
  const dust = clamp(Number(P['companions.ringDust']), 0, 1);
  const flecks = 24;
  for (let i = 0; i < flecks; i++) {
    const t = i / (flecks - 1);
    const u0 = DUST0 + (1 - DUST0) * t;
    const w = ((1 - DUST0) / (flecks - 1)) * (0.36 + 0.60 * rng());
    const fade = 1 - Math.pow(t, 2.6);
    plan.push({
      u0,
      u1: Math.min(u0 + w, 0.9995),
      load: (0.42 + 0.44 * rng()) * fade * (0.30 + 0.70 * dust),
      tint: 0.70 + 0.26 * rng(),
      phase: rng(),
      verm: 0,
    });
  }

  return { plan, splits, pace, cost, slowest, half, km, laps, fatigue, DUST0, TOP };
}

/**
 * The band table itself. Each ringlet is stamped into one row of texels as the
 * load a brush would leave across its width — squared at both edges, a hair
 * paler through the middle — and the rows under it are the same profile
 * averaged over a growing radius, so minification reads the mean and never an
 * alias. R is the load, G the ringlet's own place on the warm-to-cool walk, B
 * the phase the hand is drawn with, A the finish line's vermilion flag.
 */
function buildTable(plan) {
  const sharp = new Float32Array(TABLE * 4);
  for (const band of plan) {
    const a = Math.max(0, Math.floor(band.u0 * TABLE));
    const b = Math.min(TABLE - 1, Math.ceil(band.u1 * TABLE));
    const width = Math.max(1e-6, band.u1 - band.u0);
    for (let i = a; i <= b; i++) {
      const x = ((i + 0.5) / TABLE - band.u0) / width;
      if (x < 0 || x > 1) continue;
      const taper = Math.min(1, x / 0.13, (1 - x) / 0.13);
      const edges = 0.62 + 0.38 * (1 - Math.sin(Math.PI * x));
      const load = band.load * edges * taper;
      const k = i * 4;
      if (load > sharp[k]) {
        sharp[k] = load;
        sharp[k + 1] = band.tint;
        sharp[k + 2] = band.phase;
        sharp[k + 3] = band.verm;
      }
    }
  }

  const data = new Uint8Array(TABLE * ROWS * 4);
  const mean = new Float32Array(TABLE * 4);
  for (let r = 0; r < ROWS; r++) {
    const radius = r === 0 ? 0 : ROW0 * Math.pow(2, r - 1);
    // the vermilion flag is a hue, not a load: it is blurred no further than the
    // ringlet it belongs to, or the finish line would warm the whole outer edge
    const flagRadius = Math.min(radius, 8);
    // a running sum, so the widest row costs the same as the sharpest one
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
    let count = 0, flagCount = 0;
    for (let i = -radius; i <= radius; i++) {
      const k = clamp(i, 0, TABLE - 1);
      s0 += sharp[k * 4]; s1 += sharp[k * 4 + 1]; s2 += sharp[k * 4 + 2];
      count++;
    }
    for (let i = -flagRadius; i <= flagRadius; i++) {
      s3 += sharp[clamp(i, 0, TABLE - 1) * 4 + 3];
      flagCount++;
    }
    for (let i = 0; i < TABLE; i++) {
      const base = i * 4;
      const row = (r * TABLE + i) * 4;
      mean[base] = s0 / Math.max(1, count);
      mean[base + 1] = s1 / Math.max(1, count);
      mean[base + 2] = s2 / Math.max(1, count);
      mean[base + 3] = s3 / Math.max(1, flagCount);
      data[row] = Math.round(clamp(mean[base], 0, 1) * 255);
      data[row + 1] = Math.round(clamp(mean[base + 1], 0, 1) * 255);
      data[row + 2] = Math.round(clamp(mean[base + 2], 0, 1) * 255);
      data[row + 3] = Math.round(clamp(mean[base + 3], 0, 1) * 255);
      // slide: the texel leaving the window, the one entering it
      const out = clamp(i - radius, 0, TABLE - 1), inb = clamp(i + radius + 1, 0, TABLE - 1);
      s0 += sharp[inb * 4] - sharp[out * 4];
      s1 += sharp[inb * 4 + 1] - sharp[out * 4 + 1];
      s2 += sharp[inb * 4 + 2] - sharp[out * 4 + 2];
      const fout = clamp(i - flagRadius, 0, TABLE - 1), fin = clamp(i + flagRadius + 1, 0, TABLE - 1);
      s3 += sharp[fin * 4 + 3] - sharp[fout * 4 + 3];
    }
  }
  return data;
}

/* ------------------------------------------------------------------- glsl -- */

// The ring's own hand: a value noise and a cell hash, both from the same three
// constants the rest of the ink shaders use, so nothing here draws a pattern the
// rest of the sheet would not.
const RING_NOISE = /* glsl */ `
float rgHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float rgNoise(vec2 x) {
  vec2 i = floor(x);
  vec2 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float a = rgHash(vec3(i, 0.0));
  float b = rgHash(vec3(i + vec2(1.0, 0.0), 0.0));
  float c = rgHash(vec3(i + vec2(0.0, 1.0), 0.0));
  float d = rgHash(vec3(i + vec2(1.0, 1.0), 0.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

// The band table, read at the level the fragment's own footprint needs: two
// taps, the two rows that bracket it. Every lookup in this module — the ring
// itself and the shadow it throws — goes through here, so the shadow is banded
// by the very ringlets that cast it.
const RING_LACE = /* glsl */ `
uniform sampler2D tProfile;
uniform float uTable, uRows;
vec4 rgLace(float u, float du) {
  float hw = max(du * uTable * 0.5, 0.5);
  float lvl = hw <= float(${ROW0}) ? 0.0 : 1.0 + log2(hw / float(${ROW0}));
  lvl = clamp(lvl, 0.0, uRows - 1.0);
  float i0 = floor(lvl);
  float i1 = min(i0 + 1.0, uRows - 1.0);
  float uu = clamp(u, 0.0, 1.0);
  vec4 a = texture2D(tProfile, vec2(uu, (i0 + 0.5) / uRows));
  vec4 b = texture2D(tProfile, vec2(uu, (i1 + 0.5) / uRows));
  return mix(a, b, lvl - i0);
}
`;

const RING_VERT = /* glsl */ `
varying vec2 vPlane;
varying vec3 vWorld;
varying vec3 vNrm;
void main() {
  vPlane = position.xy;                       // the ring's own plane: a washer in XY
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNrm = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const RING_FRAG = /* glsl */ `
${RING_NOISE}
${RING_LACE}
varying vec2 vPlane;
varying vec3 vWorld;
varying vec3 vNrm;
uniform vec3 uSunDir;
uniform float uIn, uSpan;
uniform float uR, uSea, uTime, uSeed;
uniform vec3 uPaper, uWarm, uMineral, uCool, uVerm;
uniform float uLoad, uBreak, uGrain, uDust, uShadow;
void main() {
  vec3 N = normalize(vNrm);
  vec3 V = normalize(cameraPosition - vWorld);
  float r = length(vPlane);
  float u = (r - uIn) / uSpan;
  float ang = atan(vPlane.y, vPlane.x);
  float du = max(fwidth(u), 1e-6);
  vec2 orb = vec2(cos(ang), sin(ang));

  // ---- the hand. The radius the bands are read at is not the radius they were
  // ruled at: it wanders with the ring's own angle, more at both edges than in
  // the body, so a band's edge is a brush's edge and the ring's own rim is not a
  // circle struck about the planet. Three scales of it, because the same ring is
  // seen at two: a slow swell that bends a whole group of bands, a ragged wander
  // that breaks a stroke's edge, and a fine one that frays it — a ringlet beside
  // the runner is two pixels across, and an edge ruled straight there reads as
  // corrugated metal, which is exactly what it read as before this was added.
  float w1 = rgNoise(orb * 3.1 + uSeed * 0.7) - 0.5;
  float w2 = rgNoise(orb * 11.0 + uSeed * 1.7 + 13.0) - 0.5;
  float w3 = rgNoise(vec2(u * 140.0, 0.0) + orb * 24.0 + uSeed) - 0.5;
  float rim = smoothstep(0.26, 1.0, abs(u * 2.0 - 1.0));
  float uu = u + uBreak * ((0.34 + 1.15 * rim) * (0.55 * w1 + 0.30 * w2) + 0.30 * w3);
  vec4 p = rgLace(uu, du);
  float load = p.r;

  // ---- the light. A ring is a sheet of grains: the sun's own elevation over
  // its plane is what it catches, the face turned away from the sun is the
  // sheet's pale through the gaps, and the globe's own shadow — the ray from
  // this fragment toward the sun, met against the sphere — falls across it. Both
  // are read here as factors; they are laid on as glazes below, never as another
  // load of pigment.
  vec3 L = normalize(uSunDir);
  float sunPlane = dot(N, L);
  float facing = dot(N, V);
  float lit = abs(sunPlane);
  float face = smoothstep(-0.07, 0.07, facing * sunPlane);
  float Rs = uR + uSea;
  float b = dot(vWorld, L);
  float hit = b * b - (dot(vWorld, vWorld) - Rs * Rs);
  // The shadow's own test, and the one place this shader can go wrong silently:
  // b < 0 puts the sun ahead of the fragment, and the discriminant is the ray's
  // own depth into the sphere — zero where it only grazes it, positive only
  // where the planet really stands between this ringlet and the sun. Read the
  // other way round (which this did, for three rounds of posters) the ring's
  // whole anti-sun half is inked while the true umbra stays bright, and the
  // b = 0 plane cuts a knife edge across the picture to boot.
  float shadow = (b < 0.0 ? smoothstep(0.0, 2.0 * Rs * 5.0, hit) : 0.0) * uShadow;
  float away = (1.0 - face) * (0.35 + 0.55 * lit);

  // ---- the wash. The palette's own warm, its mineral grey and its cool, walked
  // outerward by the ringlet's own place; then the house's glaze: paper seen
  // through a load of that pigment.
  vec3 hue = mix(uWarm, uMineral, clamp(p.g * 2.0, 0.0, 1.0));
  hue = mix(hue, uCool, clamp(p.g * 2.0 - 1.0, 0.0, 1.0));
  hue = mix(hue, uVerm, step(0.55, p.a));
  float deep = clamp(load * uLoad, 0.0, 2.0);
  // The scale the ring is read at decides how deep the wash is laid. A poster
  // pixel covers a dozen ringlets, so what it samples is their mean load — and a
  // mean laid at one ringlet's own depth and coverage leaves the poster with a
  // film of bare paper between strokes (three rounds of posters measured it at
  // 6-8% under the paper, which is no mark at all). Where the footprint spans a
  // comb the mean is laid deeper and covered, so the poster reads the wash the
  // ringlets average to as a mark; the drift outside the finish line is left a
  // veil, because a fringe is meant to be thin.
  float fine = smoothstep(0.0035, 0.022, du) * (1.0 - smoothstep(0.02, 0.10, du));
  float fringeZone = smoothstep(0.88, 0.92, u);
  deep = clamp(deep * mix(1.0, 2.7, fine * (1.0 - fringeZone)), 0.0, 2.0);
  vec3 ratio = hue / max(uPaper, vec3(0.03));
  vec3 col = uPaper * pow(max(ratio, vec3(0.035)), vec3(deep));
  // The two glazes. The face that turns away is the wash cooled and deepened a
  // step; the planet's shadow is the same banding drawn deeper still — a ringlet
  // stays the ringlet it was. The finish line keeps three quarters of its
  // strength inside the dark, because a vermilion line that goes out in the
  // shadow is a line nobody can follow round the ring.
  col = mix(col, col * 0.80 + uCool * 0.02, away);
  col = mix(col, col * 0.46 + uCool * 0.05, shadow * (1.0 - 0.72 * step(0.55, p.a)));

  // ---- dry brush: where the sheet's own tooth is high the wash broke and the
  // paper shows through, which is what breaks a band's edge into a stroke
  float tooth = rgNoise(vPlane * 0.42 + uSeed) * 0.58 + rgNoise(vPlane * 1.9 + 11.0 + uSeed) * 0.42;
  float dry = smoothstep(0.56, 0.92, tooth) * uGrain * smoothstep(0.02, 0.26, load);
  // …and the wash's own coverage. A ringlet is laid whole — the paper shows
  // through a *pale* wash, not through a thin one — while the drift outside the
  // last ringlet stays a veil. Reading the load straight into alpha (which this
  // did) blended most of the ring back into the sky and left a film 7% under the
  // paper, which is no mark at all.
  float cover = pow(clamp(load, 0.0, 1.0), 0.45) * (1.0 - dry);

  // ---- the drift beyond the last ringlet: dust, and the grains in it that
  // catch the light for a moment as the ring's own slow turn carries them
  float fringe = smoothstep(0.84, 1.0, u);
  if (fringe > 0.01 && uDust > 0.01) {
    float cells = 1500.0;
    float id = floor((ang / 6.2831853 + 0.5) * cells);
    float h1 = rgHash(vec3(id, 1.0, uSeed));
    float h2 = rgHash(vec3(id, 2.0, uSeed * 1.3));
    float rad = 0.86 + 0.14 * h1;
    float grain = 1.0 - smoothstep(0.0, 0.026, abs(u - rad));
    float blink = 0.30 + 0.70 * (0.5 + 0.5 * sin(uTime * (0.5 + 2.4 * h2) + h2 * 57.0));
    float glint = grain * smoothstep(0.50, 1.0, h1) * blink * uDust * fringe;
    cover += glint * 0.95;
    col = mix(col, mix(uPaper, uWarm, 0.45), min(1.0, glint) * 0.70);
  }
  if (cover < 0.004) discard;
  gl_FragColor = vec4(col, clamp(cover, 0.0, 1.0));
}
`;

const RING_SHELL_VERT = /* glsl */ `
varying vec3 vNrm;
varying vec3 vView;
varying vec3 vPos;
void main() {
  vNrm = normalize(normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPos = wp.xyz;
  vView = cameraPosition - wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

// The rings' own shadow on the ground: a glaze riding just above the terrain,
// multiplied rather than laid over it (ink-clouds.js lays its cast shadow the
// same way). Where the ray from this patch of ground toward the sun leaves the
// ring's plane is where the light was stopped — and the ring's banding is read
// there, so the divisions the ring is drawn with are the divisions that cross
// the ground.
const RING_SHELL_FRAG = /* glsl */ `
${RING_LACE}
varying vec3 vNrm;
varying vec3 vView;
varying vec3 vPos;
uniform vec3 uSunDir, uPaper, uSepia, uInk, uCool, uRingN;
uniform float uIn, uSpan, uShadow;
void main() {
  vec3 N = normalize(vNrm);
  vec3 V = normalize(vView);
  vec3 L = normalize(uSunDir);
  // the shell's own edge, and nothing casting where the sun is down: the edge
  // fade is tight because N·V falls off as the square of the distance from the
  // silhouette, and a loose one would wash the shadow out of the very limb band
  // — the one place a ring's shadow can still be seen from the sun's own side of
  // the ring's plane
  float limb = smoothstep(0.0, 0.020, dot(N, V));
  float gate = smoothstep(0.06, 0.26, dot(N, L));
  if (limb * gate < 0.008) discard;
  float den = dot(L, uRingN);
  if (abs(den) < 1e-4) discard;                 // the sun in the ring's own plane
  float t = -dot(vPos, uRingN) / den;
  if (t <= 0.0) discard;                        // the ring is behind this ground
  vec3 q = vPos + L * t;
  float u = (length(q) - uIn) / uSpan;
  if (u < 0.0 || u > 1.0) discard;
  // one split's worth of the table at least: a division is a fact about the ring
  // and has to survive on the ground, but the finest ringlets of a marathon
  // cannot be drawn across a week's own globe
  float amt = rgLace(u, max(fwidth(u), 1.0 / 48.0)).r * uShadow;
  amt = min(1.0, amt * 1.7) * limb * gate * float(${SHELL_FRAG_DARK});
  if (amt < 0.004) discard;
  vec3 shade = mix(uPaper, mix(uSepia, uInk, 0.6), 0.22);
  vec3 tint = shade / max(uPaper, vec3(0.04));
  gl_FragColor = vec4(mix(vec3(1.0), tint, amt), 1.0);
}
`;

/* ------------------------------------------------------------------ build -- */

/** The shell the ring's shadow is cast on: the capped terrain's own sphere, a
 *  hair above it, exactly as ink-clouds.js builds the sheet its shadow rides. */
function buildShadowShell(T, features, R, lift) {
  const geo = new T.SphereGeometry(R, 72, 48);
  const pos = geo.attributes.position;
  const v = new T.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    const h = Math.max(features.orbitHeightAt(v), Number(features.seaLevel) || 0) + lift;
    pos.setXYZ(i, v.x * (R + h), v.y * (R + h), v.z * (R + h));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * The race ring: on a week whose course has a route, the race drawn round the
 * globe in a plane through it — one ringlet per split of the race, a division at
 * the half and at the wall, the finish line in the race's own vermilion, the
 * planet's shadow across the rings and the rings' shadow across the ground.
 * Returns null when there is no course, or too little of one to fit a plane to.
 */
export function raceRing(ctx) {
  const { THREE: T, features, palette: pal, uniforms } = ctx;
  const race = features?.race;
  if (!race?.seg || race.seg.length < 15) return null;
  const course = courseAxis(T, race.seg);
  if (!course) return null;

  const R = Number(ctx.R) || 120;
  const seaLevel = Number(features.seaLevel) || 0;
  const light = uniforms.uSunDir;
  const sun = (light?.value || new T.Vector3(0.55, 0.72, 0.42)).clone().normalize();
  const stats = (race.featureId && features.byId?.[race.featureId]?.stats) || features.monument?.stats || null;

  // The reach the week's own race has earned: a 5 k a waistband, a marathon a
  // ring wide enough to read from the shelf, never past the 1.4 R the poster has
  // always been framed for. The radii are settled before the plane, because the
  // plane's own search has to know how much of the runner's sky the band covers.
  const reach = clamp(race.total / (TAU * R * 0.55), 0, 1);
  const inner = R * RING_IN;
  const outer = Math.min(R * RING_OUT, inner + R * (0.15 + 0.10 * reach));

  // where the poster will stand, where the runner stands under it, and which
  // way he is looking: the course's own last stretch, which is the road the
  // chase camera holds in the ground view
  const camera = posterAxis(T, { race, light: sun });
  const site = (features.spawn || features.monument?.dir || features.list[0]?.dir || camera).clone().normalize();
  const view = features.spawnTangent ? features.spawnTangent.clone().normalize() : null;
  const axis = ringAxis(T, { course, site, view, camera, light: sun, tilt: P['companions.ringTilt'], inner, outer, R });

  const seed = seedOf(features.week);
  const lace = laceFrom(T, { features, race, stats, seed });
  const data = buildTable(lace.plan);
  const profile = new T.DataTexture(data, TABLE, ROWS, T.RGBAFormat, T.UnsignedByteType);
  profile.name = 'companion-race-ring-profile';
  profile.minFilter = T.LinearFilter;
  profile.magFilter = T.LinearFilter;
  profile.wrapS = T.ClampToEdgeWrapping;
  profile.wrapT = T.ClampToEdgeWrapping;
  profile.generateMipmaps = false;
  profile.needsUpdate = true;

  const shadowDial = clamp(Number(P['companions.ringShadow']), 0, 1);
  const dustDial = clamp(Number(P['companions.ringDust']), 0, 1);

  const group = new T.Group();
  group.name = 'companion-race-ring';
  const frame = new T.Group();
  frame.name = 'companion-race-ring-plane';
  frame.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), axis);
  group.add(frame);

  // The washes the ringlets are painted with, inner to outer: the palette's own
  // warm light through a mineral grey to its committed dark — but loaded, every
  // one of them, because the palette's warm light is nearly the paper's own
  // value and an inner half laid in it simply vanishes against a pale sky (the
  // first version measured 210 of the sky's 225 there, which is no ring at all).
  // So the walk starts at a loaded ochre, and the middle and outer stops are
  // mixed to the palette's own mineral and its dark.
  const warm = pal.litWarm.clone().lerp(pal.sepia, 0.50);
  const mineral = pal.stone.clone().lerp(pal.landHigh, 0.55);
  const cool = pal.shadeCool.clone().lerp(pal.dark || pal.ink, 0.60);

  const shared = {
    tProfile: { value: profile },
    uTable: { value: TABLE },
    uRows: { value: ROWS },
    uIn: { value: inner },
    uSpan: { value: Math.max(1e-3, outer - inner) },
    uSunDir: light || { value: sun },
    uR: { value: R },
    uSea: { value: seaLevel },
    uPaper: { value: pal.paper.clone() },
    uInk: { value: pal.ink.clone() },
    uSepia: { value: pal.sepia.clone() },
    uWarm: { value: warm },
    uMineral: { value: mineral },
    uCool: { value: cool },
    uVerm: { value: pal.vermilion.clone() },
    uShadow: { value: shadowDial },
  };

  const mat = new T.ShaderMaterial({
    uniforms: {
      ...shared,
      uTime: uniforms.uTime,
      uSeed: { value: seed },
      uLoad: { value: 1.26 },
      uBreak: { value: 0.017 },
      uGrain: { value: 0.55 },
      uDust: { value: dustDial },
    },
    vertexShader: RING_VERT,
    fragmentShader: RING_FRAG,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    // a sheet of ringlets has no business rewriting the frame's own alpha: the
    // ink pass reads it (the sea's own clear, see ink.js WASH_FRAG) and a ring
    // over the water would turn the horizon into land
    blending: T.CustomBlending,
    blendSrc: T.SrcAlphaFactor,
    blendDst: T.OneMinusSrcAlphaFactor,
    blendSrcAlpha: T.ZeroFactor,
    blendDstAlpha: T.OneFactor,
  });
  const geo = new T.RingGeometry(inner, outer, 512, 1);
  const ring = new T.Mesh(geo, mat);
  ring.name = 'companion-race-ring-washer';
  ring.renderOrder = 0;
  frame.add(ring);

  const shellMat = new T.ShaderMaterial({
    uniforms: {
      ...shared,
      uRingN: { value: axis.clone() },
    },
    vertexShader: RING_SHELL_VERT,
    fragmentShader: RING_SHELL_FRAG,
    transparent: true,
    depthWrite: false,
    side: T.FrontSide,
    blending: T.MultiplyBlending,
    premultipliedAlpha: true,
  });
  const shellGeo = buildShadowShell(T, features, R, SHELL_LIFT);
  const shell = new T.Mesh(shellGeo, shellMat);
  shell.name = 'companion-race-ring-shadow';
  shell.renderOrder = -2;
  group.add(shell);

  // what the ring was drawn from, for the eye and the bench
  group.userData.ring = {
    axis: axis.toArray(),
    inner, outer, reach,
    splits: lace.splits, half: lace.half, slowest: lace.slowest,
    ringlets: lace.plan.length,
    km: lace.km, laps: lace.laps,
    pace: Array.from(lace.pace, (v) => +v.toFixed(3)),
    site: site.toArray(),
    camera: camera.toArray(),
    angleToCamera: +(Math.acos(clamp(Math.abs(axis.dot(camera)), -1, 1)) * 180 / Math.PI).toFixed(1),
    angleToSite: +(Math.asin(clamp(Math.abs(axis.dot(site)), -1, 1)) * 180 / Math.PI).toFixed(1),
    angleToSun: +(Math.asin(clamp(Math.abs(axis.dot(sun)), -1, 1)) * 180 / Math.PI).toFixed(1),
    seed,
  };
  // the ring's own teardown: the profile table, the washer, the shadow shell
  attachTeardown(group);
  return group;
}

// The Saturn-grade ring (companions.ringStyle saturn) lives in its own module:
// the band table, the divisions and the backlit glow are a sheet of their own,
// and this file is long enough. It is re-exported here, where the dispatcher
// (worlds/index.js) looks for every ring style.
export { saturnRing } from './rings-saturn-shader.js';

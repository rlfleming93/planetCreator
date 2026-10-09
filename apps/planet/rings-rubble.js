/* Planet Creator — the race as a rubble belt, and the week's own runs as an
 * orrery (companions.ringStyle rubble / orrery).
 *
 * rubble: the week's race laid round the globe as a belt of stone — thousands
 * of instanced chunks in one wide, gently tilted torus, their bands the race's
 * own splits, a division open where the race's halfway falls, the fastest
 * splits carrying the boulders and the slowest the ice dust. Every grain
 * orbits and tumbles on the GPU (Kepler-ish: the inner edge runs fastest), lit
 * by the painted light in flat toon tones with the ink the form is drawn with,
 * and throwing the planet's own umbra across its far half. From the ground the
 * belt is an arch of stone crossing the sky.
 *
 * orrery: the week's runs as an armillary. One thin brass-and-ink ring per run
 * of the week — its tilt from the run's own route plane where the watch kept
 * GPS and from its own day where it did not, its radius from the distance it
 * covered, its beads one per kilometre — and the race's ring standing dominant
 * among them, edged in the race line's vermilion. Together they read as a
 * gyroscope round the globe.
 *
 * Both builders take the companions ctx (worlds/index.js companionsFor) and
 * return an Object3D named 'companion-race-ring' carrying userData.reach — the
 * outer radius in planet radii, which is what the poster fits — or null on a
 * week they have nothing to draw for, which falls the dispatcher back to the
 * splits ring. Every plane, radius, band and tint here is read off the week
 * alone: no Math.random, so a capture at t is the same frame every time.
 */
import { P } from './params.js';
import { attachTeardown } from './teardown.js';
import { gatherSplits, realSplits } from './forms.js';

const TAU = Math.PI * 2;
const DAYS = 7;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

// The belt's own seat in the sky, in planet radii. Outside the weather sheet —
// ink-clouds.js rides at R + max(cap + 2, 14), about 1.117 R, and a belt under
// it would be a belt behind every bank of cloud — and inside the 1.45 R the
// poster's craft.frame promises a companion it will frame whole (base.js).
// The flattening the poster reads a companion at. A ring seen square on is a
// target and the same ring edge on is a bar laid across the disc; the house's
// own race ring stands at 0.57 of the view axis, and a belt or an armillary
// wants to stand where the house's ring stands — open enough that there is paper
// between the ellipse and the limb, closed enough that it is an ellipse and not
// a target. The plane is built on that cone rather than searched for near it,
// because a week whose course fits a plane sixty degrees off the poster has no
// member of its own family that opens at all.
const FACE_ON = 0.57;
// …and the belt a fuller one than the instrument. A belt is a disc of stone on a
// sphere that is three thousandths of the belt's own width away from it, so its
// far half is always going to pass behind the globe: at any tilt the inner edge
// of a belt at 1.215 R projects to under the globe's own limb. What the belt's
// own flattening buys is not a closed ellipse — nothing buys that — but the arc
// the poster does see: 0.57 lies across the disc like a bar and hides the far
// side high behind the upper limb, while 0.72 stands the ellipse up until the
// near arc hangs under the globe and the far arc clears the limb where the
// crown is, which is what makes it read as a ring tucking behind rather than a
// rod laid on the face.
const FACE_BELT = 0.72;
// What the free half of the cone is spent on: staying in the plane the course
// itself fits, and crossing the runner's own window of sky.
const NEAR_W = 0.62;
const ARCH_MIN = 0.10;
// The window of sky the runner's own frame holds: from this far above his
// horizon (below it is ground) up to this, within this azimuth of where he
// faces. A belt that crosses it is stone over his road.
const SKY_LO = 0.05;
const SKY_HI = 1.05;
const SKY_NEAR = 0.46;        // below this elevation an arc is in the runner's sky…
const SKY_AZ = 1.00;          // …and above it, over his head

const BELT_IN = 1.215;
const BELT_OUT = 1.440;
const ORRERY_IN = 1.225;
const ORRERY_OUT = 1.400;
const REACH_ALL = 1.45;

/* ----------------------------------------------------------------- seeds -- */

function hashStr(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

/** A 0–100 float seed from the week's own name (rings.js draws its dust the
 *  same way), so two weeks are never one belt. */
function seedOf(week) {
  return (hashStr(String(week ?? '')) % 100000) / 1000;
}

/** A walk along a colour ramp, clamped: the week's own pigment, mixed. */
function ramp(stops, u) {
  const t = clamp(u, 0, 1) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t));
  return stops[i].clone().lerp(stops[i + 1], t - i);
}

/* ---------------------------------------------------------------- planes -- */

/** The plane a course's own samples are fitted by: every pair of samples votes
 *  with the normal of the plane it shares with the other, each by the sine of
 *  the angle between them, and the sum is one walk back to front carrying the
 *  rest of the course as a suffix. (rings.js fits the race ring this way; the
 *  fit is repeated here because a module may not reach into another's own
 *  maths, and the two must agree on what a course's plane is.) */
function courseAxis(T, seg) {
  const n = seg.length / 3;
  if (n < 2) return null;
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

/** The direction the poster looks from: base.js's own rule (posterSubject,
 *  then turnToSun), which is the frame the belt's plane is chosen against. */
function midcourse(T, race, out = new T.Vector3()) {
  const half = race.total * 0.5;
  const cum = race.cum;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < half) i++;
  const t = (half - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
  const a = (i - 1) * 3, b = i * 3;
  out.set(
    race.seg[a] + (race.seg[b] - race.seg[a]) * t,
    race.seg[a + 1] + (race.seg[b + 1] - race.seg[a + 1]) * t,
    race.seg[a + 2] + (race.seg[b + 2] - race.seg[a + 2]) * t,
  );
  return out.normalize();
}

function posterAxis(T, race, light, out = new T.Vector3()) {
  midcourse(T, race, out).multiplyScalar(-1);
  const side = new T.Vector3().copy(light).addScaledVector(out, -light.dot(out));
  if (side.lengthSq() > 1e-8) out.addScaledVector(side.normalize(), 0.6).normalize();
  return out;
}

/** What share of a ring's own band stands in the runner's window of sky. He
 *  stands at his own site facing along his own road: the window is everything
 *  from SKY_LO above his horizon up to SKY_HI, within SKY_AZ of the way he
 *  faces. Three radii of the ring, all the way round, are walked and this counts
 *  the part that lands in the window, and how much of the window's own width the
 *  crossing fills. rings.js measures the same window for its own ring, so a belt
 *  and a ring chosen for the same week arch over the same runner. */
function skyArch(T, { axis, site, view, inner, outer, R, eye = 2.2 }) {
  const d = site.clone().normalize();
  const ahead = view ? view.clone().addScaledVector(d, -view.dot(d)) : new T.Vector3();
  if (ahead.lengthSq() < 1e-8) ahead.crossVectors(d, new T.Vector3(0, 1, 0));
  ahead.normalize();
  const across = new T.Vector3().crossVectors(d, ahead).normalize();
  const perp = d.clone().addScaledVector(axis, -axis.dot(d));
  if (perp.lengthSq() < 1e-10) return 0;
  perp.normalize();
  const side = new T.Vector3().crossVectors(axis, perp).normalize();
  const eyeAt = d.clone().multiplyScalar(R + eye);
  const q = new T.Vector3(), v = new T.Vector3();
  const bins = new Set();
  const N = 96;
  let low = 0, high = 0, total = 0;
  for (let ri = 0; ri < 4; ri++) {
    const rho = inner + (outer - inner) * (ri / 3);
    for (let i = 0; i < N; i++) {
      const phi = (i / N) * TAU;
      q.copy(perp).multiplyScalar(Math.cos(phi)).addScaledVector(side, Math.sin(phi)).multiplyScalar(rho);
      v.copy(q).sub(eyeAt);
      total++;
      if (v.lengthSq() < 1e-6) continue;
      v.normalize();
      const e = Math.asin(clamp(v.dot(d), -1, 1));
      if (e < SKY_LO || e > SKY_HI) continue;
      const az = Math.atan2(v.dot(across), v.dot(ahead));
      if (Math.abs(az) > SKY_AZ) continue;
      if (e < SKY_NEAR) low++;
      else high++;
      bins.add(Math.floor((az + SKY_AZ) / ((2 * SKY_AZ) / 6)));
    }
  }
  if (!total) return 0;
  // An arc across the runner's own horizon is what a landing frame holds of a
  // ring: the sky over his head is over the frame's own top edge, so the low
  // crossing counts for more than the high one and the spread across the window
  // counts for the rest.
  return clamp((low / total) * 3.0, 0, 1) * 0.50
    + clamp((high / total) * 2.2, 0, 1) * 0.25
    + clamp(bins.size / 5, 0, 1) * 0.25;
}

/**
 * The belt's plane. The family is every plane between the race's own, which lies
 * in the course, and the plane that stands over the runner's own head across his
 * road — the one a ring has to lie in to rise out of his horizon, cross his
 * zenith and set behind him. The search walks that family and keeps the plane
 * that best serves both the poster, which reads a ring anywhere inside its own
 * band of flattening and a bar anywhere outside it, and the runner, whose sky
 * wants the ring overhead. The companions.ringTilt dial then walks the answer
 * back toward the course's plane, so 0 is the runner's own plot and 1 is the sky
 * the belt was drawn to arch across.
 */
function beltAxis(T, { race, site, view, siteAlt, viewAlt, camera, inner, outer, R, tilt, faceOn = FACE_ON, control = {} }) {
  const course = courseAxis(T, race.seg);
  const d = site.clone().normalize();
  const ahead = view ? view.clone().addScaledVector(d, -view.dot(d)) : null;
  if (ahead && ahead.lengthSq() < 1e-8) ahead.set(0, 0, 0);
  // The plane that carries the ring over the runner's own head: its normal is
  // the one horizontal his own road does not use, so the ring rises out of the
  // horizon he faces, crosses his zenith and sets behind him. Without a road to
  // stand on it is the plane that merely clears him, which is the same plane
  // seen from the poster's own side.
  const arch = (ahead && ahead.lengthSq() > 1e-8
    ? new T.Vector3().crossVectors(d, ahead)
    : new T.Vector3().copy(camera).addScaledVector(d, -camera.dot(d))).normalize();
  const own = course || arch;
  const c = camera.clone().normalize();

  // Every plane the poster reads a ring in has its normal on one cone about the
  // view direction, and the point of that cone nearest the plane the course fits
  // is one rotation away. The rest of the cone — the azimuth about the view
  // direction, which changes nothing about how open the ring reads — is walked
  // for the runner's own sky.
  const s0 = own.clone().multiplyScalar(own.dot(c) < 0 ? -1 : 1);
  const perp = new T.Vector3().crossVectors(s0, c);
  if (perp.lengthSq() < 1e-10) perp.copy(new T.Vector3(0, 1, 0)).cross(c);
  if (perp.lengthSq() < 1e-10) perp.copy(new T.Vector3(1, 0, 0));
  perp.normalize();
  const from = Math.acos(clamp(s0.dot(c), -1, 1));
  const to = Math.acos(clamp(faceOn, 0, 1));
  const base = s0.clone()
    .applyQuaternion(new T.Quaternion().setFromAxisAngle(perp, from - to))
    .normalize();

  // The runner is shot twice in a week — standing where the week put him and
  // standing at the finish — and the belt arches over whichever of them the frame
  // is showing, so the sky is asked of both and the better answer is the one that
  // counts.
  const skyAt = (ax) => {
    let best = skyArch(T, { axis: ax, site, view, inner, outer, R });
    if (siteAlt) best = Math.max(best, skyArch(T, { axis: ax, site: siteAlt, view: viewAlt, inner, outer, R }));
    return best;
  };
  const spin = new T.Quaternion();
  const probe = new T.Vector3();
  const trace = [];
  let best = base.clone(), bestPsi = 0, bestScore = -Infinity, bestSky = 0, bestNear = 1;
  for (let k = 0; k < 24; k++) {
    const psi = (k / 24) * TAU;
    probe.copy(base).applyQuaternion(spin.setFromAxisAngle(c, psi)).normalize();
    const face = Math.abs(probe.dot(c));
    const sky = skyAt(probe);
    const away = Math.min(probe.angleTo(own), Math.PI - probe.angleTo(own));
    const near = 1 - away / (Math.PI / 2);
    // A belt in the runner's sky is the whole point of the belt, so any plane that
    // crosses his window is preferred to any plane that does not, however near the
    // course's own plane that one lies; between two that do, the course's plane
    // and how much of the window is filled decide it.
    const score = sky >= ARCH_MIN ? 1 + 0.5 * sky + 0.5 * near : NEAR_W * near;
    trace.push({
      psi: +psi.toFixed(3), face: +face.toFixed(3), near: +near.toFixed(3),
      sky: +sky.toFixed(3), score: +score.toFixed(3),
    });
    if (score > bestScore + 1e-9) { bestScore = score; bestPsi = psi; best.copy(probe); bestSky = sky; bestNear = near; }
  }
  const axis = best.clone();
  // …and the dial walks the answer back toward the plane the course itself fits:
  // 0 is the runner's own plot, 1 the sky the ring was drawn to arch across
  if (course) axis.lerp(course, 1 - clamp(tilt, 0, 1)).normalize();
  control.psi = bestPsi;
  control.score = +bestScore.toFixed(3);
  control.face = +Math.abs(axis.dot(c)).toFixed(3);
  control.sky = +skyAt(axis).toFixed(3);
  control.near = +bestNear.toFixed(3);
  control.own = own.toArray().map((v) => +v.toFixed(3));
  control.trace = trace;
  return axis;
}

/* ------------------------------------------------------------ the bands -- */

const LACE_W = 1024;         // texels across the belt's own width
const LACE_ROWS = 7;         // minification levels, each a blur of the one above
const LACE_ROW0 = 2;         // …doubling from this radius, in texels

/**
 * The race's own banding, laid out across the belt's width: one band per split
 * of the race (companions.ringBands walks the count from a coarse reading of the
 * race up to one band per kilometre), each band's load and grain read off the
 * pace that split was run at — the pace is not a time, because the record keeps
 * none: it is the ground the split crossed, read the way rings.js reads it, and
 * the week's own fatigue over the distance it ran. A division is left open where
 * the race's halfway falls, the race line's own vermilion hairline ends the
 * banding, and beyond it lies the drift the belt never gathered.
 */
function beltPlan(T, { features, race, stats, seed }) {
  const rng = features.makeRng(`companion-rubble/${seed.toFixed(2)}`);
  const n = race.seg.length / 3;
  const at = new T.Vector3();
  const ground = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    at.set(race.seg[i * 3], race.seg[i * 3 + 1], race.seg[i * 3 + 2]);
    const h = Number(features.heightAt(at));
    ground[i] = Number.isFinite(h) ? h : 0;
  }
  const km = Math.max(0, Number(stats?.distanceM) || 0) / 1000;
  const laps = Math.max(0, Number(stats?.laps) || 0);
  const bandsDial = clamp(Number(P['companions.ringBands']), 0, 1);
  // A belt is read as bands and not as a comb, and the number of them is bounded
  // by the belt's own width: a band is only a band where there is room for a
  // stone and a gap beside it, so a marathon's forty kilometres are drawn as the
  // nine passages the sheet can carry and no more.
  const splits = clamp(Math.round(4 + Math.max(km, laps, 7) * (0.05 + 0.13 * bandsDial)), 5, 9);

  // Where the record kept the race's own splits (forms.js) each passage is the
  // mean pace of the splits it gathers; where it kept none, the course's own.
  const real = realSplits(stats);
  const cost = real ? gatherSplits(real, splits) : new Float64Array(splits);
  const fatigue = clamp((km || 10) / 150, 0.05, 0.22);
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
      c *= 1 + fatigue * Math.pow(i / Math.max(1, splits - 1), 1.5);
      c *= 1 + 0.10 * (rng() * 2 - 1);
      cost[i] = clamp(c, 0.45, 2.2);
    }
  }
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < splits; i++) { lo = Math.min(lo, cost[i]); hi = Math.max(hi, cost[i]); }
  const pace = new Float64Array(splits);
  // …and no band of the belt is left without stone: a passage that carries
  // nothing is not a passage, it is the edge of the ring. An evenly run race
  // reads even (real splits a few seconds apart).
  const spread = real ? Math.max(hi - lo, 0.06) : hi - lo;
  for (let i = 0; i < splits; i++) {
    pace[i] = spread < 1e-4 ? 0.6 : Math.max(0.17, 1 - (cost[i] - lo) / spread);
  }

  // The belt's own width, laid out: a soft margin at the inner edge (so the
  // geometry's own rim is never a cut in the sky), the race's bands, the open
  // division at halfway, the vermilion hairline, and the drift beyond it.
  const MARGIN = 0.032, TOP = 0.862, GAP = 0.200, FIN = TOP + 0.010, DRIFT = 0.906;
  const wob = new Float64Array(splits);
  let wobTotal = 0;
  for (let i = 0; i < splits; i++) { wob[i] = 0.80 + 0.40 * rng(); wobTotal += wob[i]; }
  const groups = Math.max(1, Math.round(splits / 5));
  const groupLoad = new Float64Array(groups);
  for (let i = 0; i < groups; i++) groupLoad[i] = 0.42 + 1.08 * rng();
  const half = Math.floor(splits / 2);
  const bands = [];
  const span = TOP - MARGIN - GAP;
  let cursor = MARGIN;
  for (let i = 0; i < splits; i++) {
    const slice = (span * wob[i]) / wobTotal;
    // A band's own load: what its split asked of the race, the group of bands
    // it sits in, and the belt's own hand. A split run slowly is a thin band of
    // dust; one run fast is a loaded band of broken stone. The two bands either
    // side of the halfway division are laid thin, so the division reads as an
    // opening in the belt and not as a seam across it.
    const edge = i === half || i === half + 1 ? 0.35 : 1;
    const load = clamp((0.20 + 0.86 * pace[i]) * groupLoad[Math.floor(i / 5) % groups] * edge, 0.06, 1.25);
    bands.push({
      u0: cursor,
      u1: cursor + slice,
      load,
      pace: pace[i],
      tint: clamp((i + 0.5) / splits + 0.08 * (rng() - 0.5), 0, 1),
      phase: rng() * 6.2831853,
      halfGap: i === half,
    });
    cursor += slice + (i === half ? GAP : 0);
  }
  return { bands, splits, pace, half, km, laps, MARGIN, TOP, GAP, FIN, DRIFT, span };
}

/**
 * The band table: one row of texels across the belt's width for the plan
 * itself, and under it the same profile averaged over a radius that doubles
 * with every row — so a fragment reads the mean a pixel actually covers and a
 * band's edge is never an alias. R is the load, G the band's own place on the
 * warm-to-cool walk, B the phase its hand is drawn with, A the race line's
 * vermilion flag.
 */
function buildLace(plan, rng) {
  const load = new Float32Array(LACE_W);
  const tint = new Float32Array(LACE_W);
  const phase = new Float32Array(LACE_W);
  const verm = new Float32Array(LACE_W);
  const stamp = (u0, u1, l, t, p, v, soft) => {
    const i0 = Math.max(0, Math.floor(u0 * LACE_W));
    const i1 = Math.min(LACE_W - 1, Math.ceil(u1 * LACE_W));
    const width = Math.max(1e-6, u1 - u0);
    for (let i = i0; i <= i1; i++) {
      const x = ((i + 0.5) / LACE_W - u0) / width;
      if (x < 0 || x > 1) continue;
      const edge = Math.min(1, x / soft, (1 - x) / soft);
      const taper = edge * edge * (3 - 2 * edge);
      if (l * taper <= load[i]) continue;
      load[i] = l * taper;
      tint[i] = t;
      phase[i] = p;
      verm[i] = v * taper;
    }
  };
  for (const band of plan.bands) stamp(band.u0, band.u1, band.load * 1.06, band.tint, band.phase, 0, 0.22);
  // the race's own line: one vermilion hairline at the outer end of the banding
  stamp(plan.FIN, plan.FIN + 0.034, 1.0, 1.0, rng() * 6.2831853, 1, 0.30);
  // the drift beyond the last band: the dust the belt never gathered, fading
  // into the sheet — a fringe has to carry weight of its own, or the belt is
  // seen to have a cut edge
  const flecks = 26;
  for (let i = 0; i < flecks; i++) {
    const t = i / (flecks - 1);
    const u0 = plan.DRIFT + (1 - plan.DRIFT) * t;
    const w = ((1 - plan.DRIFT) / (flecks - 1)) * (0.40 + 0.60 * rng());
    const fade = 1 - Math.pow(t, 2.6);
    stamp(u0, Math.min(u0 + w, 0.9995), (0.34 + 0.40 * rng()) * fade * 0.8, 0.72 + 0.26 * rng(), rng() * 6.2831853, 0, 0.40);
  }

  const rows = new Uint8Array(LACE_W * LACE_ROWS * 4);
  const write = (row, l, t, p, v) => {
    for (let i = 0; i < LACE_W; i++) {
      const j = (row * LACE_W + i) * 4;
      rows[j] = clamp(Math.round(l[i] * 255), 0, 255);
      rows[j + 1] = clamp(Math.round(t[i] * 255), 0, 255);
      rows[j + 2] = clamp(Math.round(p[i] / 6.2831853 * 255), 0, 255);
      rows[j + 3] = clamp(Math.round(v[i] * 255), 0, 255);
    }
  };
  write(0, load, tint, phase, verm);
  // …and every row under it the one above blurred by a radius that doubles, so
  // the table carries its own mip chain and the poster reads the mean of the
  // bands rather than a moire of their edges
  let prev = { load, tint, phase, verm };
  for (let r = 1; r < LACE_ROWS; r++) {
    const w = LACE_ROW0 * Math.pow(2, r - 1);
    const next = {
      load: new Float32Array(LACE_W), tint: new Float32Array(LACE_W),
      phase: new Float32Array(LACE_W), verm: new Float32Array(LACE_W),
    };
    // one summed-area pass per channel: a box blur walked along the row
    for (const key of ['load', 'tint', 'phase', 'verm']) {
      const src = prev[key], dst = next[key];
      let acc = 0;
      for (let i = -w; i <= w; i++) acc += src[clamp(i, 0, LACE_W - 1)];
      const span = 2 * w + 1;
      for (let i = 0; i < LACE_W; i++) {
        dst[i] = acc / span;
        acc += src[clamp(i + w + 1, 0, LACE_W - 1)] - src[clamp(i - w, 0, LACE_W - 1)];
      }
    }
    write(r, next.load, next.tint, next.phase, next.verm);
    prev = next;
  }
  return rows;
}

/* ----------------------------------------------------------------- glsl -- */

// The hand the belt and the orrery are drawn in: one hash, one value noise, a
// rotation about any axis, and the planet's own umbra. The same three constants
// the rest of the ink shaders use, so nothing here draws a pattern the rest of
// the sheet would not.
const RB_COMMON = /* glsl */ `
uniform vec3 uSunDir, uPaper, uInk, uCool, uWarm;
uniform float uR, uSea, uTime;
float rbHash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float rbNoise(vec2 x) {
  vec2 i = floor(x);
  vec2 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float a = rbHash(i);
  float b = rbHash(i + vec2(1.0, 0.0));
  float c = rbHash(i + vec2(0.0, 1.0));
  float d = rbHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
vec3 rbRot(vec3 v, vec3 axis, float a) {
  float s = sin(a);
  float c = cos(a);
  return v * c + cross(axis, v) * s + axis * (dot(axis, v) * (1.0 - c));
}
/** The planet's own shadow: 0 in the sun, 1 deep inside the umbra. The same
 *  test rings.js draws its cast shadow with, so a belt and a ring darken at the
 *  same place on the same week. */
float rbUmbral(vec3 w) {
  vec3 L = normalize(uSunDir);
  float b = dot(w, L);
  float Rs = uR + uSea;
  float hit = b * b - (dot(w, w) - Rs * Rs);
  return b < 0.0 ? smoothstep(0.0, 2.6 * Rs, hit) : 0.0;
}
`;

// The toon: a form is read in three flat loads of its own pigment laid through
// the paper, and it is drawn with the ink of its own turning — a rim where it
// goes round, a hair along its terminator, both of those only where the form is
// big enough on the sheet to carry a line. fine arrives as the form's own size,
// so a grain of dust is a grain of dust and a boulder is a drawing.
const RB_TOON = /* glsl */ `
uniform float uInkRim, uInkLine, uGlint, uLoad;
vec3 rbToon(vec3 N, vec3 w, vec3 hue, float glint, float fine, float load) {
  vec3 L = normalize(uSunDir);
  vec3 V = normalize(cameraPosition - w);
  float d = dot(N, L);
  float tone = d > 0.50 ? 2.0 : (d > 0.015 ? 1.0 : 0.0);
  float depth = tone > 1.5 ? 1.00 : (tone > 0.5 ? 1.26 : 1.40);
  vec3 col = uPaper * pow(max(hue / max(uPaper, vec3(0.03)), vec3(0.03)), vec3(depth * load));
  // the night of a stone is the painting's own cool wash laid over a deeper load
  // of its pigment, never a value drop into black
  col = mix(col, col * 0.86 + uCool * 0.12, tone < 0.5 ? 0.45 : 0.0);
  float rim = 1.0 - clamp(dot(N, V), 0.0, 1.0);
  col = mix(col, uInk, smoothstep(0.34, 0.88, rim) * uInkRim * fine);
  col = mix(col, uInk, (1.0 - smoothstep(0.0, 0.15, abs(d - 0.015))) * uInkLine * fine);
  float g = pow(max(dot(reflect(-L, N), V), 0.0), 40.0);
  col = mix(col, mix(uPaper, uWarm, 0.35), clamp(g * glint, 0.0, 1.0));
  float sh = rbUmbral(w);
  col = mix(col, mix(col * 0.76, uCool * 0.10, 0.38), sh);
  return col;
}
`;

// One grain of stone, dust or metal. Everything about the instance is drawn
// from its own attributes: where it stands on the belt (or the ring it rides —
// the transformation matrix), how fast it turns, the corner knock that makes
// this boulder a different boulder from the last, and how much of it the light
// catches. Nothing here is touched between frames; uTime does all of it.
const ROCK_VERT = /* glsl */ `
attribute float aCorner;
uniform float uFarPx;
attribute vec3 aOrbit;
attribute vec4 aSize;
attribute vec4 aSpin;
uniform float uRate, uR0, uShell;
varying vec3 vW;
varying vec3 vN;
varying vec3 vHue;
varying vec4 vV;
varying float vSp;
${RB_COMMON}
void main() {
  float size = aSize.x;
  float r = max(aOrbit.x, 1.0);
  float om = uRate * pow(uR0 / r, 1.5);         // the inner edge runs the fastest
  float ang = aOrbit.y + uTime * om;
  vec3 centre = vec3(cos(ang) * r, sin(ang) * r, aOrbit.z);
  // the corner knock: one geometry, a different boulder at every instance
  float kx = 0.40 + 1.30 * rbHash(vec2(aCorner * 1.71 + aSize.w * 9.13, aSize.w * 3.31));
  float ky = 0.44 + 1.16 * rbHash(vec2(aCorner * 2.93 + aSize.w * 5.71, 7.19));
  float kz = 0.48 + 1.06 * rbHash(vec2(aCorner * 4.13 + aSize.w * 2.17, 3.77));
  vec3 p = position * vec3(kx, ky, kz) * size;
  vec3 n = normalize(position);
  float ph = aSpin.w + uTime * aSize.y;
  p = rbRot(p, aSpin.xyz, ph);
  n = rbRot(n, aSpin.xyz, ph);
  vec3 centreW = (modelMatrix * vec4(centre, 1.0)).xyz;
  float vz = max(-(viewMatrix * vec4(centreW, 1.0)).z, 1.0);
  // What the form covers on the sheet, measured the way the pipeline measures it:
  // the instance is projected twice, once at its own centre and once a size to the
  // camera's right, and the two clip positions give the share of the frame's own
  // half-height that the form's radius covers. (A camera that is not a perspective
  // one — a landing shot of another kind — is measured right by this and would not
  // be by the fov term.)
  vec3 rightW = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec4 clip0 = projectionMatrix * (viewMatrix * vec4(centreW, 1.0));
  vec4 clip1 = projectionMatrix * (viewMatrix * vec4(centreW + rightW * max(size, 1e-4), 1.0));
  float sp = length(clip1.xy / max(abs(clip1.w), 1e-4) - clip0.xy / max(abs(clip0.w), 1e-4)) * 0.5;
  // The belt is read from the poster, where a stone is a few pixels of the
  // frame's own half-height; the same belt read from under it would be a wall of
  // rock, and a form that covers the shot is not a stone. Past that share of the
  // frame the form is held there — which leaves every stone of the poster, all of
  // them far inside it, exactly the size the week gave them.
  float sc = min(1.0, uFarPx / max(sp, 1e-6));
  size *= sc;
  sp *= sc;
  vSp = sp;
  if (uShell > 0.5) {
    // the ink shell is a hair of the form or a pixel of the sheet, whichever is
    // wider, and a form too small to be drawn with a line is not drawn at all
    if (sp < 0.0075) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    p += n * max(size * 0.030, 0.0005 * vz);
  }
  vec4 wp = modelMatrix * vec4(centre + p, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * n);
  vHue = instanceColor;
  vV = vec4(aSize.z, size, aSize.y, aSize.w);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const ROCK_FRAG = /* glsl */ `
varying vec3 vW;
varying vec3 vN;
varying vec3 vHue;
varying vec4 vV;
varying float vSp;
uniform float uFade;
${RB_COMMON}
${RB_TOON}
void main() {
  vec3 face = normalize(cross(dFdx(vW), dFdy(vW)));
  if (!gl_FrontFacing) face = -face;
  // the form's own size on the sheet, carried down from the vertex shader: how
  // much of a drawing it is allowed to be
  float fine = smoothstep(0.006, 0.032, vSp);
  // a facet is only trusted where the facet covers pixels; a grain smaller than
  // that keeps the normal it was born with, or every speckle of the belt would
  // be a coin toss
  vec3 N = normalize(mix(normalize(vN), face, fine));
  float blink = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * (0.7 + 2.1 * vV.w) + vV.w * 37.0));
  vec3 col = rbToon(N, vW, vHue, vV.x * blink * uGlint, fine, uLoad);
  // a veil class (the dust beyond the belt) varies grain by grain; anything laid
  // whole is laid whole
  float fade = uFade > 0.999 ? 1.0 : uFade * mix(0.55, 1.15, rbHash(vec2(vV.w, 3.17)));
  gl_FragColor = vec4(col, fade);
}
`;

// The belt's own bed: the wash the bands are laid in, read from the table at
// the level the fragment's own footprint needs, so the poster sees the mean of
// the bands and the runner beside the belt sees the bands themselves.
const BED_VERT = /* glsl */ `
varying vec2 vPlane;
varying vec3 vW;
void main() {
  vPlane = position.xy;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const RB_LACE = /* glsl */ `
uniform sampler2D tLace;
uniform float uLaceW, uRows;
vec4 rbLace(float u, float du) {
  float hw = max(du * uLaceW * 0.5, 0.5);
  float lvl = clamp(log2(max(hw, 1e-4)) - 1.0, 0.0, uRows - 1.0);
  float i0 = floor(lvl);
  float i1 = min(i0 + 1.0, uRows - 1.0);
  float uu = clamp(u, 0.0, 1.0);
  vec4 a = texture2D(tLace, vec2(uu, (i0 + 0.5) / uRows));
  vec4 b = texture2D(tLace, vec2(uu, (i1 + 0.5) / uRows));
  return mix(a, b, lvl - i0);
}
`;

const BED_FRAG = /* glsl */ `
${RB_COMMON}
${RB_LACE}
varying vec2 vPlane;
varying vec3 vW;
uniform float uIn, uSpan, uSeed, uShadow;
uniform vec3 uMineral, uVerm;
void main() {
  float r = length(vPlane);
  float u = (r - uIn) / uSpan;
  if (u < -0.05 || u > 1.05) discard;
  float ang = atan(vPlane.y, vPlane.x);
  float du = max(fwidth(u), 1e-6);
  vec4 p = rbLace(u, du);
  float load = p.r;
  // The bed is a veil and not a mass: what the poster reads as a band is the
  // mean of thousands of grains, so the wash under them is laid thin and the
  // stones drawn over it carry the weight of the belt.
  float cover = pow(clamp(load, 0.0, 1.0), 0.85) * 0.62;
  if (cover < 0.004) discard;
  vec3 hue = mix(uWarm, uMineral, clamp(p.g * 2.0, 0.0, 1.0));
  hue = mix(hue, uCool, clamp(p.g * 2.0 - 1.0, 0.0, 1.0));
  hue = mix(hue, uVerm, step(0.55, p.a));
  float deep = clamp(0.55 + load * 1.15, 0.0, 2.2);
  vec3 col = uPaper * pow(max(hue / max(uPaper, vec3(0.03)), vec3(0.035)), vec3(deep));
  // the sheet's own tooth: where it is high the wash broke and the paper shows
  float tooth = rbNoise(vPlane * 0.42 + uSeed) * 0.55 + rbNoise(vPlane * 1.9 + 11.0 + uSeed) * 0.45;
  cover *= mix(1.0, 0.42 + 0.58 * smoothstep(0.28, 0.92, tooth), 0.38);
  // the belt's own hand: the width the bands are read at wanders with the angle,
  // more at both edges than through the body, so no division is a struck circle
  float wob = (rbNoise(vec2(ang, 0.0) * 3.1 + uSeed * 0.7) - 0.5) * 0.55
            + (rbNoise(vec2(ang, 0.0) * 11.0 + 13.0 + uSeed * 1.7) - 0.5) * 0.30;
  cover *= 0.72 + 0.56 * (wob + 0.5);
  // …and both its edges fray: the wash thins to nothing at a different radius at
  // every angle of the ring, because an envelope that closes on its own circle
  // is a mould and a belt of stone is not cast in one
  float uIn = 0.020 + max(0.0, wob) * 0.055;
  float uOut = 0.945 + wob * 0.040;
  cover *= smoothstep(uIn, uIn + 0.055, u) * (1.0 - smoothstep(uOut - 0.05, uOut, u));
  float sh = rbUmbral(vW);
  col = mix(col, mix(col * 0.58, uCool * 0.07, 0.40), sh * uShadow);
  gl_FragColor = vec4(col, clamp(cover, 0.0, 1.0));
}
`;

// The ink the shell is: the same instanced form, expanded along its own corners
// and laid in one flat ink under the stone. A drawing's outline, which is what
// makes the few large stones read as stones and not as stamps.
const SHELL_FRAG = /* glsl */ `
varying vec3 vW;
varying vec3 vN;
varying vec3 vHue;
varying vec4 vV;
varying float vSp;
uniform vec3 uShellInk;
void main() {
  gl_FragColor = vec4(uShellInk, 1.0);
}
`;

// A ring of the orrery: a ribbon struck about the globe in the ring's own
// plane, spun about the ring's own normal so its scale and its beads travel.
// Brass laid as a wash with the paper showing through its middle, ink along
// both ruled edges, a tick every five kilometres and a longer one every ten,
// and — on the race's own ring — a second line inside the edge in the race
// line's vermilion.
const RING_VERT = /* glsl */ `
uniform float uSpin, uRingR, uWide, uMinW, uMaxW;
varying float vR;
varying float vPhi;
varying vec3 vW;
varying vec3 vNw;
${RB_COMMON}
void main() {
  vec3 p = rbRot(position, vec3(0.0, 0.0, 1.0), uTime * uSpin);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  // The ribbon is ruled on the sheet and not in the world: past its own share of
  // the frame it is a strap and short of it a wire, and a ring seen edge on that
  // is one pixel of wire is a ring the runner standing under it cannot see at
  // all. Its width is held inside a share of the frame's half-height and left
  // quite alone in between, which is where every ring of the poster lives.
  float vz = max(-(viewMatrix * wp).z, 1.0);
  float proj = projectionMatrix[1][1];
  float want = clamp(uWide * proj / vz, uMinW, uMaxW) * vz / proj;
  float rr = length(p.xy);
  float s = want / max(uWide, 1e-6);
  vec2 dir = rr > 1e-5 ? p.xy / rr : vec2(1.0, 0.0);
  p.xy = dir * (uRingR + (rr - uRingR) * s);
  wp = modelMatrix * vec4(p, 1.0);
  vR = rr;
  vPhi = atan(p.y, p.x);
  vW = wp.xyz;
  vNw = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const RING_FRAG = /* glsl */ `
${RB_COMMON}
varying float vR;
varying float vPhi;
varying vec3 vW;
varying vec3 vNw;
uniform float uRingR, uWide, uKm, uDominant, uAlpha;
uniform vec3 uBrass, uEdge;
void main() {
  float t = (vR - uRingR) / max(uWide, 1e-4);       // -1 the inner edge, +1 the outer
  float at = abs(t);
  if (at > 1.0) discard;
  float km = (vPhi / 6.2831853) * uKm;
  float kmAbs = abs(km);
  // the scale: a tick every five kilometres, struck across the ribbon, and a
  // longer one every ten — a ring is graduated, or it is a bracelet
  float d5 = min(fract(kmAbs / 5.0), 1.0 - fract(kmAbs / 5.0)) * 5.0;
  float d10 = min(fract(kmAbs / 10.0), 1.0 - fract(kmAbs / 10.0)) * 10.0;
  float tick = max((1.0 - smoothstep(0.02, 0.26, d5)) * (1.0 - smoothstep(-0.30, -0.16, t)),
                   (1.0 - smoothstep(0.02, 0.26, d10)) * (1.0 - smoothstep(0.16, 0.34, t)));
  // The ribbon's own two edges. The outer one is ruled, and on the race's ring
  // it is the race line's own vermilion and nothing else is; the inner one is a
  // hair beside it. Two loaded edges all the way round a ribbon makes a strap,
  // and a strap is not an instrument.
  float outer = smoothstep(0.66 - 0.04 * uDominant, 0.90, t);
  float inner = smoothstep(0.72 + 0.04 * uDominant, 0.92, -t);
  float grain = 0.86 + 0.28 * rbHash(vec2(floor(kmAbs * 4.0), floor(t * 9.0)));
  vec3 col = uPaper * pow(max(uBrass / max(uPaper, vec3(0.03)), vec3(0.03)), vec3(1.30 + 0.30 * uDominant));
  // brass is a wash laid on the sheet: the paper breathes through the middle of
  // the ribbon and only the ruled edges are loaded
  col = mix(col, uPaper, (0.10 + 0.22 * (1.0 - at)) * grain);
  col *= grain;
  // the sun stands over the ring's plane or under it: a ribbon of brass has one
  // face, and the light it catches is the elevation of the light upon it
  vec3 L = normalize(uSunDir);
  float sun = abs(dot(normalize(vNw), L));
  col = mix(col * 0.62 + uCool * 0.04, col, 0.28 + 0.72 * sun);
  col = mix(col, mix(uInk, uEdge, uDominant), outer * (0.86 + 0.14 * uDominant));
  col = mix(col, uInk, inner * 0.72);
  // a graduation is lighter than the metal it is cut in: ink here reads as the
  // stitching of a tyre, which is a thing this must not be
  col = mix(col, uPaper, tick * (0.46 + 0.26 * uDominant));
  col = mix(col, mix(col * 0.46, uCool * 0.05, 0.30), rbUmbral(vW));
  float a = mix(0.80, 0.97, max(outer, max(inner, tick * 0.6))) * uAlpha;
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}
`;

// A bead of the orrery: one of the brass counters threaded on a ring at every
// kilometre of the run it stands for. It rides the ring's own spin, so the
// scale of the instrument is seen to turn.
const BEAD_VERT = /* glsl */ `
uniform float uSpin, uMinW, uMaxW;
varying vec3 vW;
varying vec3 vN;
varying vec3 vHue;
varying vec4 vV;
varying float vSp;
${RB_COMMON}
void main() {
  mat3 basis = mat3(instanceMatrix[0].xyz, instanceMatrix[1].xyz, instanceMatrix[2].xyz);
  vec3 centre = instanceMatrix[3].xyz;
  float rad = length(basis[0]);
  vec3 spinAt = rbRot(centre, vec3(0.0, 0.0, 1.0), uTime * uSpin);
  vec4 centreW = modelMatrix * vec4(spinAt, 1.0);
  float vz = max(-(viewMatrix * centreW).z, 1.0);
  float proj = projectionMatrix[1][1];
  // A counter is a counter on the sheet: two pixels of bead is speckle and a
  // bead the size of the runner's own head is a lampshade, so the casting is
  // held inside a share of the frame and left alone where it already belongs.
  float f = clamp(rad * proj / vz, uMinW, uMaxW) * vz / proj / max(rad, 1e-6);
  vec3 p = spinAt + rbRot(basis * (position * f), vec3(0.0, 0.0, 1.0), uTime * uSpin);
  vec3 n = rbRot(basis * normal, vec3(0.0, 0.0, 1.0), uTime * uSpin);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * n);
  vHue = instanceColor;
  vV = vec4(0.0, rad * f, 0.0, rad * f);
  vSp = rad * f * proj / vz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

/* ------------------------------------------------------------ geometry -- */

/**
 * A corner id per vertex: every face that meets at one corner of the solid
 * carries the same id, so the shader can knock that corner once and the shape
 * still closes. (PolyhedronGeometry's corners are shared values, so the same
 * vertex is written the same bits on every face that meets it.)
 */
function cornerIds(T, geo) {
  const pos = geo.attributes.position;
  const seen = new Map();
  const ids = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    if (!seen.has(key)) seen.set(key, seen.size);
    ids[i] = seen.get(key);
  }
  geo.setAttribute('aCorner', new T.BufferAttribute(ids, 1));
  return geo;
}

/** One instanced class of the belt: its own buffers, handed over whole. A class
 *  with nothing in it is no class at all (a week of tiny runs and the dust dial
 *  at zero can empty one), so it answers null and is never added. */
function beltInstances(T, geo, material, orbit, size, spin, color, name) {
  const count = orbit.length / 3;
  if (count < 1) return null;
  const mesh = new T.InstancedMesh(geo, material, count);
  mesh.name = name;
  mesh.frustumCulled = false;                 // the belt is far wider than its geometry
  mesh.geometry.setAttribute('aOrbit', new T.InstancedBufferAttribute(new Float32Array(orbit), 3));
  mesh.geometry.setAttribute('aSize', new T.InstancedBufferAttribute(new Float32Array(size), 4));
  mesh.geometry.setAttribute('aSpin', new T.InstancedBufferAttribute(new Float32Array(spin), 4));
  mesh.instanceColor = new T.InstancedBufferAttribute(new Float32Array(color), 3);
  return mesh;
}

/* --------------------------------------------------------------- rubble -- */

/**
 * The race as a rubble belt (companions.ringStyle rubble): a wide, gently
 * tilted torus of instanced stone round the week's own globe, banded by the
 * race's splits, open at its halfway, dusted past its own finish line, and
 * turning. Returns null when the week has no course to lay a belt on.
 */
export function rubbleRing(ctx) {
  const { THREE: T, features, palette: pal, uniforms } = ctx;
  const race = features?.race;
  if (!race?.seg || race.seg.length < 12) return null;
  const R = Number(ctx.R) || 120;
  const sea = Number(features.seaLevel) || 0;
  const light = uniforms.uSunDir;
  const sun = (light?.value || new T.Vector3(0.55, 0.72, 0.42)).clone().normalize();
  const stats = (race.featureId && features.byId?.[race.featureId]?.stats) || features.monument?.stats || null;
  // the race's own size: a 5 k belt is a waistband, a marathon's reaches out
  const reach = clamp(race.total / (TAU * R * 0.55), 0, 1);
  const inner = R * BELT_IN;
  const outer = R * BELT_OUT;
  const span = outer - inner;

  const camera = posterAxis(T, race, sun);
  const site = (features.spawn || features.monument?.dir || features.list?.[0]?.dir || camera).clone().normalize();
  const view = features.spawnTangent ? features.spawnTangent.clone().normalize() : null;
  const control = {};
  const axis = beltAxis(T, {
    race, site, view, siteAlt: features.monument?.dir || null, viewAlt: features.monument?.spawnTangent || null,
    camera, inner, outer, R, tilt: clamp(Number(P['companions.ringTilt']), 0, 1), faceOn: FACE_BELT, control,
  });

  const seed = seedOf(features.week);
  const plan = beltPlan(T, { features, race, stats, seed });
  const rng = features.makeRng(`companion-rubble-stone/${seed.toFixed(2)}`);
  const laceTable = buildLace(plan, features.makeRng(`companion-rubble-lace/${seed.toFixed(2)}`));
  const profile = new T.DataTexture(laceTable, LACE_W, LACE_ROWS, T.RGBAFormat, T.UnsignedByteType);
  profile.name = 'companion-rubble-bands';
  profile.minFilter = T.LinearFilter;
  profile.magFilter = T.LinearFilter;
  profile.wrapS = T.ClampToEdgeWrapping;
  profile.wrapT = T.ClampToEdgeWrapping;
  profile.generateMipmaps = false;
  profile.needsUpdate = true;

  const dustDial = clamp(Number(P['companions.ringDust']), 0, 1);
  const shadowDial = clamp(Number(P['companions.ringShadow']), 0, 1);
  const weekScale = 0.90 + 0.45 * reach;

  // ---- the stones. Every band carries its own grain: a fast split is broken
  // stone, a slow one is dust, and the largest stones of the belt come off the
  // fastest splits of the race.
  const weights = plan.bands.map((b) => Math.max(1e-4, b.u1 - b.u0) * (0.30 + 0.70 * b.load));
  const wSum = weights.reduce((a, b) => a + b, 0) || 1;
  const fastWeights = plan.bands.map((b, i) => weights[i] * Math.pow(Math.max(0, b.pace - 0.30), 1.4));
  const fSum = fastWeights.reduce((a, b) => a + b, 0) || 1;
  const slowWeights = plan.bands.map((b, i) => weights[i] * (1.15 - b.pace));
  const sSum = slowWeights.reduce((a, b) => a + b, 0) || 1;
  // The numbers are the belt's own massing. What the eye reads on a ring is
  // cluster and gap: a little stone is grit and a thousand of them are a wash,
  // so the small class is sparse and widened until each of them is a stone the
  // poster can draw a line round, the boulders are the ones that carry the
  // silhouette, and the dust is dust.
  const gravelN = Math.round(900 + 700 * reach);
  const chunkN = Math.round(240 + 320 * reach);
  const dustN = Math.round((1000 + 900 * reach) * (0.35 + 0.65 * dustDial));

  const gravel = { orbit: [], size: [], spin: [], color: [] };
  const chunks = { orbit: [], size: [], spin: [], color: [] };
  const dust = { orbit: [], size: [], spin: [], color: [] };

  const rockStops = [
    pal.paper.clone().lerp(pal.litWarm, 0.55),
    pal.stone.clone().lerp(pal.litWarm, 0.35),
    pal.sepia.clone().lerp(pal.wood, 0.30),
    pal.sepia.clone().lerp(pal.shadeCool, 0.42),
  ];
  // the drift is dust of the belt's own rock and never a cream brighter than the
  // sheet: a pale mote laid a thousand deep is a fog, and the house has no fog
  const dustStops = [
    pal.stone.clone().lerp(pal.paper, 0.26),
    pal.stone.clone().lerp(pal.sepia, 0.40),
    pal.farGlaze.clone().lerp(pal.shadeCool, 0.34),
  ];

  // The belt's own hand, laid on the ring's whole circumference: it is what
  // keeps the belt from reading as a mould. The swell is where the belt gathers
  // and the notches are where it thins to nothing, and both the stones and the
  // wash under them are carried by it.
  const warp = (ang) => 1.90 * Math.sin(ang * 2.7 + seed) + 0.90 * Math.sin(ang * 5.1 + seed * 2.0)
    + 0.42 * Math.sin(ang * 11.3 + seed * 3.7);

  /** One stone: where it stands on the belt, how big, how it turns, its hue.
   *  Its own surface is kept inside the reach the poster has been promised, so
   *  the largest boulder of the fastest split is framed whole. */
  const place = (into, r, ang, size, hueU, stops) => {
    const t = clamp(hueU, 0, 1);
    const c = ramp(stops, t);
    const rr = Math.min(r, R * REACH_ALL - size * 0.85);
    const z = warp(ang) * (0.35 + 0.55 * rng()) + (rng() * 2 - 1) * (0.20 + 0.55 * size)
      + (rng() * 2 - 1) * span * 0.11 * (0.35 + 0.65 * rng());
    into.orbit.push(rr, ang, z);
    into.size.push(size, (0.05 + 0.50 * rng()) * (0.7 + 0.6 * rng()), rng() < 0.13 ? 0.35 + 0.65 * rng() : 0, rng());
    const ax = rng() * 2 - 1, az = rng() * 2 - 1;
    const s = Math.hypot(ax, 1.4 - rng() * 0.8, az) || 1;
    into.spin.push(ax / s, (1.2 - rng() * 0.9) / s, az / s, rng() * TAU);
    into.color.push(c.r, c.g, c.b);
  };

  // The belt's own gatherings. They are the belt's and not a band's: a few
  // knots unequal in width and in weight, standing at their own places round the
  // ring, with open sky between them — because stones spread evenly along a
  // circumference are a necklace, and a necklace of stone is a bangle. Every
  // class of the belt is drawn to the same knots, which is what makes a knot one
  // gathering of stone, gravel and dust rather than three families that happen
  // to overlap.
  const knots = [];
  {
    const n = 3 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i++) {
      knots.push({
        ang: ((i + 0.5) / n) * TAU + (rng() - 0.5) * (TAU / n) * 0.26 + seed * 0.37,
        w: 0.26 + 0.34 * rng(),
        m: 0.30 + 1.40 * rng(),
      });
    }
  }
  /** A place on the ring: in one of the knots, or — for the share of stones the
   *  belt dropped between them — anywhere at all. */
  const clumpAngle = (stray) => {
    if (rng() < stray) return TAU * rng();
    const total = knots.reduce((s, c) => s + c.m, 0);
    let x = rng() * total;
    let pick = knots[knots.length - 1];
    for (const c of knots) {
      x -= c.m;
      if (x <= 0) { pick = c; break; }
    }
    const half = (TAU / knots.length) * 0.5 * pick.w;
    return pick.ang + (rng() * 2 - 1) * half;
  };

  for (let i = 0; i < plan.bands.length; i++) {
    const band = plan.bands[i];
    const u0 = band.u0, w = Math.max(1e-4, band.u1 - band.u0);
    const gN = Math.max(band.load > 0.2 ? 1 : 0, Math.round(gravelN * (weights[i] / wSum)));
    const cN = Math.round(chunkN * (fastWeights[i] / fSum));
    const dN = Math.round(dustN * (slowWeights[i] / sSum));
    const grain = (0.30 + 0.42 * Math.pow(band.pace, 1.6)) * weekScale;
    for (let k = 0; k < gN; k++) {
      const u = lerp(u0, u0 + w, rng());
      const size = grain * (1.05 + 1.15 * Math.pow(rng(), 1.4));
      const hueU = clamp(0.30 + 0.34 * band.tint + 0.13 * (rng() * 2 - 1) + 0.12 * (1 - band.pace), 0.06, 0.94);
      place(gravel, inner + u * span, clumpAngle(0.03), size, hueU, rockStops);
    }
    for (let k = 0; k < cN; k++) {
      const u = lerp(u0, u0 + w, rng());
      const size = grain * (1.55 + 2.75 * rng() * rng());
      const hueU = clamp(0.28 + 0.30 * band.tint + 0.12 * (rng() * 2 - 1) + 0.10 * (1 - band.pace), 0.05, 0.90);
      place(chunks, inner + u * span, clumpAngle(0.03), size, hueU, rockStops);
    }
    for (let k = 0; k < dN; k++) {
      const u = lerp(u0, u0 + w, rng());
      const size = (0.40 + 0.50 * Math.pow(rng(), 1.5)) * (0.85 + 0.35 * weekScale);
      place(dust, inner + u * span, clumpAngle(0.55), size, 0.24 + 0.36 * rng(), dustStops);
    }
  }

  // …and the ones the race actually broke: a handful of boulders, all of them
  // off the fastest splits, lying where the race was run hardest
  const top = plan.bands.map((b, i) => i).sort((a, b) => plan.bands[b].pace - plan.bands[a].pace).slice(0, 3);
  const bigs = 4 + Math.round(8 * reach);
  for (let k = 0; k < bigs; k++) {
    const band = plan.bands[top[k % top.length]];
    const u = lerp(band.u0, band.u1, rng());
    const size = clamp((2.20 + 1.60 * band.pace) * weekScale * (0.80 + 0.45 * rng()), 1.6, 4.6);
    place(chunks, inner + u * span, clumpAngle(0.10), size, 0.30 + 0.22 * rng(), rockStops);
  }

  // the drift beyond the last band: the belt's own dust, spilled outward
  const drift = Math.round(dustN * 0.4);
  for (let k = 0; k < drift; k++) {
    const t = Math.pow(rng(), 0.7);
    const u = lerp(plan.DRIFT, 0.998, t);
    const size = (0.10 + 0.26 * rng()) * (0.8 + 0.4 * weekScale);
    place(dust, inner + u * span, rng() * TAU, size, 0.30 + 0.45 * rng(), dustStops);
  }

  // ---- the frame the belt is laid in
  const group = new T.Group();
  group.name = 'companion-race-ring';
  const frame = new T.Group();
  frame.name = 'companion-race-ring-plane';
  frame.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), axis);
  group.add(frame);

  const shared = {
    uTime: uniforms.uTime,
    uSunDir: light || { value: sun },
    uPaper: { value: pal.paper.clone() },
    uInk: { value: pal.ink.clone() },
    uCool: { value: pal.shadeCool.clone() },
    uWarm: { value: pal.litWarm.clone().lerp(pal.stone, 0.30) },
    uR: { value: R },
    uSea: { value: sea },
    uRate: { value: TAU / 165 },
    uR0: { value: R * 1.25 },
  };

  const bedMat = new T.ShaderMaterial({
    uniforms: {
      ...shared,
      tLace: { value: profile },
      uLaceW: { value: LACE_W },
      uRows: { value: LACE_ROWS },
      uIn: { value: inner },
      uSpan: { value: span },
      uSeed: { value: seed },
      uShadow: { value: shadowDial },
      uMineral: { value: pal.sepia.clone().lerp(pal.stone, 0.40) },
      uVerm: { value: pal.vermilion.clone() },
    },
    vertexShader: BED_VERT,
    fragmentShader: BED_FRAG,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    // a sheet of bands has no business rewriting the frame's own alpha: the ink
    // pass reads it as land (see ink.js WASH_FRAG)
    blending: T.CustomBlending,
    blendSrc: T.SrcAlphaFactor,
    blendDst: T.OneMinusSrcAlphaFactor,
    blendSrcAlpha: T.ZeroFactor,
    blendDstAlpha: T.OneFactor,
  });
  const bed = new T.Mesh(new T.RingGeometry(inner, outer, 420, 1), bedMat);
  bed.name = 'companion-rubble-bed';
  bed.renderOrder = -3;
  bed.frustumCulled = false;
  frame.add(bed);

  const chunkGeo = cornerIds(T, new T.IcosahedronGeometry(1, 0));
  const gravelGeo = cornerIds(T, new T.OctahedronGeometry(1, 0));
  const dustGeo = cornerIds(T, new T.TetrahedronGeometry(1, 0));

  // A stone may fill this share of the frame's own half-height and no more: at
  // the poster a stone is under two thirds of a percent of it, so nothing the
  // poster draws is touched by this; under the belt it is what keeps the shot.
  const FRAME_SHARE = 0.045;
  const litMat = (opts) => new T.ShaderMaterial({
    uniforms: { ...shared, uFarPx: { value: FRAME_SHARE }, ...opts },
    vertexShader: ROCK_VERT,
    fragmentShader: ROCK_FRAG,
  });
  const chunkMat = litMat({
    uShell: { value: 0 },
    uFade: { value: 1 },
    uLoad: { value: 1.02 },
    uInkRim: { value: 0.90 },
    uInkLine: { value: 0.44 },
    uGlint: { value: 1.0 },
  });
  const gravelMat = litMat({
    uShell: { value: 0 },
    uFade: { value: 1 },
    uLoad: { value: 0.88 },
    uInkRim: { value: 0.55 },
    uInkLine: { value: 0.30 },
    uGlint: { value: 1.35 },
  });
  const dustMat = litMat({
    uShell: { value: 0 },
    uFade: { value: 0.28 },
    uLoad: { value: 1.02 },
    uInkRim: { value: 0.20 },
    uInkLine: { value: 0.10 },
    uGlint: { value: 0.90 },
  });
  dustMat.transparent = true;
  dustMat.depthWrite = false;
  dustMat.blending = T.CustomBlending;
  dustMat.blendSrc = T.SrcAlphaFactor;
  dustMat.blendDst = T.OneMinusSrcAlphaFactor;
  dustMat.blendSrcAlpha = T.ZeroFactor;
  dustMat.blendDstAlpha = T.OneFactor;

  const chunkMesh = beltInstances(T, chunkGeo, chunkMat, chunks.orbit, chunks.size, chunks.spin, chunks.color, 'companion-rubble-chunks');
  const gravelMesh = beltInstances(T, gravelGeo, gravelMat, gravel.orbit, gravel.size, gravel.spin, gravel.color, 'companion-rubble-gravel');
  const dustMesh = beltInstances(T, dustGeo, dustMat, dust.orbit, dust.size, dust.spin, dust.color, 'companion-rubble-dust');
  for (const mesh of [chunkMesh, gravelMesh, dustMesh]) if (mesh) frame.add(mesh);
  if (dustMesh) dustMesh.renderOrder = 2;

  // the ink the largest stones are drawn with: the same geometry and the very
  // same instance buffers, one flat ink, expanded along the corners
  const shellMat = new T.ShaderMaterial({
    uniforms: {
      ...shared,
      uFarPx: { value: FRAME_SHARE },
      uShell: { value: 1 },
      uShellInk: { value: pal.ink.clone().lerp(pal.shadeCool, 0.30) },
      uFade: { value: 1 },
      uLoad: { value: 1 },
      uInkRim: { value: 1 },
      uInkLine: { value: 1 },
      uGlint: { value: 0 },
    },
    vertexShader: ROCK_VERT,
    fragmentShader: SHELL_FRAG,
    side: T.BackSide,
  });
  if (chunkMesh) {
    const shell = new T.InstancedMesh(chunkGeo, shellMat, chunkMesh.count);
    shell.name = 'companion-rubble-ink';
    shell.frustumCulled = false;
    shell.renderOrder = -1;
    shell.instanceColor = chunkMesh.instanceColor;
    frame.add(shell);
  }

  group.userData.reach = REACH_ALL;
  group.userData.ring = {
    style: 'rubble',
    axis: axis.toArray().map((v) => +v.toFixed(4)),
    inner, outer, reach: REACH_ALL,
    splits: plan.splits, half: plan.half, km: plan.km, laps: plan.laps,
    aim: {
      face: control.face, sky: control.sky, near: control.near, psi: +control.psi.toFixed(3),
      score: control.score, own: control.own, trace: control.trace,
    },
    pace: Array.from(plan.pace, (v) => +v.toFixed(3)),
    bands: plan.bands.length,
    stones: { chunks: chunkMesh?.count || 0, gravel: gravelMesh?.count || 0, dust: dustMesh?.count || 0 },
    site: site.toArray(),
    camera: camera.toArray(),
    angleToCamera: +(Math.acos(clamp(Math.abs(axis.dot(camera)), -1, 1)) * 180 / Math.PI).toFixed(1),
    angleToSite: +(Math.asin(clamp(Math.abs(axis.dot(site)), -1, 1)) * 180 / Math.PI).toFixed(1),
    seed,
  };
  // the belt's own teardown: the band table, the stones, the gravel, the dust
  attachTeardown(group);
  return group;
}

/* --------------------------------------------------------------- orrery -- */

/** A run of the week: the watch's own sport name, and — for a treadmill or an
 *  indoor trainer — the title it was filed under (worlds/index.js reads the
 *  same pair for the week's sport families). */
function isRunFeature(f, raceIds) {
  if (!f?.stats || f.kind === 'monument' || f.kind === 'pitch') return false;
  if (raceIds.has(f.id)) return true;
  const sport = String(f.stats.sport || '').toLowerCase();
  const title = String(f.stats.title || '').toLowerCase();
  if (/^(running|walking|hiking)$/.test(sport)) return true;
  return sport === 'fitness_equipment' && /run|walk|treadmill/.test(title);
}

/**
 * The week's runs as an orrery (companions.ringStyle orrery): one ring per run
 * of the week, its radius from the distance the run covered and its plane from
 * the run's own route where the watch kept GPS — the plane the course was run
 * in — or from its own day of the week where it did not; the race's ring among
 * them drawn dominant and edged in vermilion; every ring graduated in
 * kilometres with a bead at each one, and turning. Returns null on a week with
 * no runs to draw.
 */
export function orreryRings(ctx) {
  const { THREE: T, features, palette: pal, uniforms } = ctx;
  const race = features?.race;
  const R = Number(ctx.R) || 120;
  const sea = Number(features.seaLevel) || 0;
  const light = uniforms.uSunDir;
  const sun = (light?.value || new T.Vector3(0.55, 0.72, 0.42)).clone().normalize();
  const raceIds = new Set();
  for (const r of features?.races || []) if (r?.raceFeatureId) raceIds.add(r.raceFeatureId);
  if (features?.monument?.raceFeatureId) raceIds.add(features.monument.raceFeatureId);

  const kmOf = (f) => Math.max(0, Number(f.stats?.distanceM) || 0) / 1000;
  const runs = (features?.list || [])
    .filter((f) => isRunFeature(f, raceIds) && kmOf(f) > 0.05)
    .sort((a, b) => kmOf(a) - kmOf(b));
  if (!runs.length) return null;

  const seed = seedOf(features.week);
  const tiltDial = clamp(Number(P['companions.ringTilt']), 0, 1);
  const raceAxis = race?.seg ? courseAxis(T, race.seg) : null;
  const kmMax = kmOf(runs[runs.length - 1]);
  const kmTotal = runs.reduce((sum, f) => sum + kmOf(f), 0);
  // the race's own ring is struck first — it is the instrument's own pole — and
  // the week's other runs are fanned round it
  runs.sort((a, b) => (raceIds.has(b.id) ? 1 : 0) - (raceIds.has(a.id) ? 1 : 0));
  const rMin = R * ORRERY_IN, rMax = R * ORRERY_OUT;
  const site = (features.spawn || features.monument?.dir || features.list?.[0]?.dir || new T.Vector3(0, 1, 0)).clone().normalize();
  const view = features.spawnTangent ? features.spawnTangent.clone().normalize() : null;
  // The instrument is stood in the poster's own frame before a single ring is
  // struck: the pole the week's own planes gather round is carried to the pole
  // the poster reads an ellipse open at, and every ring's lean relative to the
  // others — the week's own relationships — is carried with it. Without the
  // carry a week of runs on one island is one diagonal wire from the poster's
  // side, which is a hoop and not an armillary.
  const control = {};
  const pole = race?.seg
    ? beltAxis(T, {
      race, site, view, siteAlt: features.monument?.dir || null, viewAlt: features.monument?.spawnTangent || null,
      camera: posterAxis(T, race, sun), inner: rMin, outer: rMax, R, tilt: tiltDial, control,
    })
    : null;

  const shared = {
    uTime: uniforms.uTime,
    uSunDir: light || { value: sun },
    uPaper: { value: pal.paper.clone() },
    uInk: { value: pal.ink.clone() },
    uCool: { value: pal.shadeCool.clone() },
    uWarm: { value: pal.litWarm.clone().lerp(pal.stone, 0.30) },
    uR: { value: R },
    uSea: { value: sea },
  };
  const brass = pal.stone.clone().lerp(pal.litWarm, 0.50).lerp(pal.sepia, 0.12);
  const beadHue = brass.clone().lerp(pal.paper, 0.16);
  const beadGeo = cornerIds(T, new T.IcosahedronGeometry(1, 0));
  const beadMat = new T.ShaderMaterial({
    uniforms: {
      ...shared,
      uSpin: { value: 0 },
      uMinW: { value: 0.0070 },
      uMaxW: { value: 0.0210 },
      uFade: { value: 1 },
      uLoad: { value: 1.1 },
      uInkRim: { value: 0.72 },
      uInkLine: { value: 0.40 },
      uGlint: { value: 0.55 },
    },
    vertexShader: BEAD_VERT,
    fragmentShader: ROCK_FRAG,
  });

  const group = new T.Group();
  group.name = 'companion-race-ring';
  const rig = new T.Group();
  rig.name = 'companion-orrery';
  if (pole && raceAxis) rig.quaternion.setFromUnitVectors(raceAxis, pole);
  group.add(rig);

  let beads = 0;
  const rings = [];
  const placedAxes = [];
  // How far apart two rings' planes have to stand to be read as two planes and
  // not as one hoop drawn twice: at a ring's own scale (a ribbon is a few
  // thousandths of the globe) thirty-five degrees of lean is the least that
  // shows, and a week whose runs all left from the same trailhead has to be
  // fanned to find it.
  const MIN_LEAN = 0.62;
  // Two planes are as close when their normals are opposed as when they agree:
  // the angle that matters is the acute one.
  const leanOf = (a, b) => { const t = a.angleTo(b); return Math.min(t, Math.PI - t); };
  const nearestLean = (axis) => placedAxes.reduce((worst, a) => Math.min(worst, leanOf(axis, a)), Math.PI);
  for (let i = 0; i < runs.length; i++) {
    const f = runs[i];
    const km = kmOf(f);
    const kmNorm = clamp(km / Math.max(kmMax, 1e-3), 0, 1);
    // A ring's radius is the distance it stands for, walked into the band the
    // instrument occupies. The band is narrow on purpose: runs of one week are
    // of one size, and rings that nearly share a radius cross each other at
    // their poles — crossing rings are an armillary, nested ones are a target.
    const r = rMin + (rMax - rMin) * Math.pow(kmNorm, 0.55);

    // the plane the run was actually run in: its own route where the watch kept
    // GPS, and its own day of the week where it did not — the site's own
    // longitude is the day (base.js lays a week out one day per seventh of the
    // globe), so a session leans along its own meridian
    const route = (features.routes || []).find((rr) => rr.featureId === f.id) || null;
    const own = route?.seg ? courseAxis(T, route.seg) : null;
    // The run's own day: the site's own longitude is the day (base.js lays a week
    // out one day per seventh of the globe), so a session that kept no route
    // still leans along its own meridian — midweek flat, the ends of the week
    // stood right over.
    const lon = Math.atan2(f.dir.z, f.dir.x);
    const day = ((Math.round(lon / (TAU / DAYS)) % DAYS) + DAYS) % DAYS;
    const lean = (0.24 + 0.76 * Math.abs(day - 3) / 3) * (Math.PI / 2) * 0.95;
    const dayAxis = new T.Vector3(Math.cos(lon) * Math.sin(lean), Math.cos(lean), Math.sin(lon) * Math.sin(lean)).normalize();
    // A run with GPS is drawn in the plane it was run in. Where that plane would
    // lie all but on top of a ring already struck — two routes out of the same
    // trailhead, or a week of short loops — the ring leans toward its own day
    // instead, because a gyroscope whose rings are one ring is not a gyroscope.
    let axis = (own || dayAxis).clone();
    // Fanned until it stands clear of every ring already struck. The lean comes
    // out of the run's own day of the week, so the fan is the week's own order of
    // days and not a lid laid over it.
    for (let mix = 0; own && placedAxes.length && mix < 1 && nearestLean(axis) < MIN_LEAN;) {
      mix = Math.min(1, mix + 0.25);
      axis = own.clone().lerp(dayAxis, mix).normalize();
    }
    // the dial closes the instrument: at 0 every ring lies in the plane the
    // course itself fits, and at 1 every ring keeps the plane it was run in
    if (raceAxis && tiltDial < 1) axis = raceAxis.clone().lerp(axis, 0.15 + 0.85 * tiltDial).normalize();
    placedAxes.push(axis.clone());

    const dominant = raceIds.has(f.id);
    // The race's ring is the instrument's principal ring, not a strap: a little
    // wider than the others and carrying the vermilion on one edge only.
    const halfW = R * (0.0092 + 0.0086 * kmNorm) * (dominant ? 1.42 : 1);
    const speed = km / Math.max(1e-3, (Number(f.stats?.activeS) || 0) / 3600);
    const pace01 = clamp((speed - 6) / 9, 0, 1);
    const spin = (0.055 + 0.095 * pace01) * Math.pow(R / r, 1.2);
    // A bead has to be a bead on the sheet: one of these is a ruling's own
    // counter, and a counter under two pixels is speckle.
    const beadR = R * (0.0150 + 0.0100 * kmNorm) * (dominant ? 1.25 : 1);

    const holder = new T.Group();
    holder.name = `companion-orrery-ring-${f.id}`;
    holder.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), axis);
    rig.add(holder);

    const ringMat = new T.ShaderMaterial({
      uniforms: {
        ...shared,
        uSpin: { value: spin },
        uRingR: { value: r },
        uWide: { value: halfW },
        uMinW: { value: 0.0045 },
        uMaxW: { value: dominant ? 0.017 : 0.0100 },
        uKm: { value: km },
        uDominant: { value: dominant ? 1 : 0 },
        uAlpha: { value: 0.90 },
        uBrass: { value: brass.clone() },
        uEdge: { value: (dominant ? pal.vermilion : pal.ink).clone() },
      },
      vertexShader: RING_VERT,
      fragmentShader: RING_FRAG,
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
      blending: T.CustomBlending,
      blendSrc: T.SrcAlphaFactor,
      blendDst: T.OneMinusSrcAlphaFactor,
      blendSrcAlpha: T.ZeroFactor,
      blendDstAlpha: T.OneFactor,
    });
    const ribbon = new T.Mesh(new T.RingGeometry(r - halfW, r + halfW, 256, 1), ringMat);
    ribbon.name = `companion-orrery-ribbon-${f.id}`;
    ribbon.frustumCulled = false;
    holder.add(ribbon);

    // one bead per kilometre of the run, threaded on the ribbon, the first of
    // them standing exactly where the run started
    const n = clamp(Math.round(km), 3, 60);
    const mat4 = new T.Matrix4();
    const pos = new T.Vector3();
    const quat = new T.Quaternion();
    const scale = new T.Vector3();
    const beadMesh = new T.InstancedMesh(beadGeo, beadMat.clone(), n);
    // A material's clone carries its own deep copy of the uniforms — the beam's
    // own sun, its clock and its palette would part company with the rest of
    // the instrument, and every bead would sit in a frozen frame of its own.
    // The shared uniforms are put back on the clone, leaving uSpin (which is
    // not one of them) as this ring's own.
    Object.assign(beadMesh.material.uniforms, shared);
    beadMesh.material.uniforms.uSpin.value = spin;
    beadMesh.name = `companion-orrery-beads-${f.id}`;
    beadMesh.frustumCulled = false;
    const colors = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU;
      pos.set(Math.cos(a) * r, Math.sin(a) * r, 0);
      const rad = beadR * (0.82 + 0.36 * rng01(rng0(seed, f.id, k)));
      scale.set(rad, rad, rad);
      mat4.compose(pos, quat, scale);
      beadMesh.setMatrixAt(k, mat4);
      colors[k * 3] = beadHue.r;
      colors[k * 3 + 1] = beadHue.g;
      colors[k * 3 + 2] = beadHue.b;
    }
    beadMesh.instanceMatrix.needsUpdate = true;
    beadMesh.instanceColor = new T.InstancedBufferAttribute(colors, 3);
    holder.add(beadMesh);
    beads += n;

    rings.push({
      id: f.id, km: +km.toFixed(2), radius: +(r / R).toFixed(4), dominant,
      beads: n, spin: +spin.toFixed(4),
      axis: axis.clone().applyQuaternion(rig.quaternion).toArray().map((v) => +v.toFixed(4)),
      angleToSun: +(Math.acos(clamp(Math.abs(axis.dot(sun)), -1, 1)) * 180 / Math.PI).toFixed(1),
    });
  }

  // The whole instrument's reach: its widest ring, plus the bead's own half.
  let widest = 0;
  rig.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry.computeBoundingSphere?.();
    const bs = child.geometry.boundingSphere;
    if (bs) widest = Math.max(widest, bs.radius + child.position.length());
  });
  const reach = clamp(widest / R + 0.005, 1.13, REACH_ALL);
  // the instrument's own fan, as it will be seen: the least angle between any
  // two rings' planes, carried into the poster's frame
  let lean = Math.PI;
  const world = placedAxes.map((a) => a.clone().applyQuaternion(rig.quaternion));
  for (let i = 0; i < world.length; i++) {
    for (let k = i + 1; k < world.length; k++) {
      const t = world[i].angleTo(world[k]);
      lean = Math.min(lean, t, Math.PI - t);
    }
  }
  group.userData.reach = +reach.toFixed(3);
  group.userData.ring = {
    style: 'orrery',
    reach: +reach.toFixed(3),
    rings,
    runs: runs.length,
    km: +kmTotal.toFixed(2),
    beads,
    seed,
    inner: +(rMin / R).toFixed(3),
    outer: +(rMax / R).toFixed(3),
    leanDeg: world.length > 1 ? +(lean * 180 / Math.PI).toFixed(1) : null,
    pole: pole ? pole.toArray().map((v) => +v.toFixed(3)) : null,
    base: raceAxis ? raceAxis.toArray().map((v) => +v.toFixed(3)) : null,
    aim: pole ? {
      face: control.face, sky: control.sky, near: control.near, psi: +control.psi.toFixed(3),
      score: control.score, own: control.own,
    } : null,
  };
  // the instrument's own teardown: the bead geometry, every ribbon, every clone
  attachTeardown(group);
  return group;
}

/* ------------------------------------------------------------- helpers -- */

/** A deterministic 0–1 from a week's seed, a feature's own id and an index:
 *  the orrery's beads are each a slightly different casting, and the same week
 *  draws the same ones. */
function rng0(seed, id, k) {
  return hashStr(`${seed.toFixed(2)}/${id}/${k}`);
}

function rng01(h) {
  let a = (h ^ 0x9e3779b9) >>> 0;
  a = Math.imul(a ^ (a >>> 16), 0x7feb352d) >>> 0;
  a = Math.imul(a ^ (a >>> 15), 0x846ca68b) >>> 0;
  return ((a ^ (a >>> 16)) >>> 0) / 4294967296;
}

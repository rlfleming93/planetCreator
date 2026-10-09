/* Planet Creator — the race as a glowing track in orbit, and as an aurora ring
 * (companions.ringStyle track / aurora). Each builder takes the companions ctx
 * (worlds/index.js companionsFor) and returns an Object3D named
 * 'companion-race-ring' with userData.reach (outer radius, in planet radii), or
 * null on a week it has nothing to draw for — the dispatcher then falls back to
 * the splits ring.
 *
 * Both are one reading of the same week taken a step further than the splits
 * ring. That ring lays the race out as divisions in a plane through the globe,
 * which is what a record of splits looks like from far enough away. These two
 * draw the race as a place instead, and they share everything that reading
 * costs: the week's own pace along the course, the loop's plane, the table the
 * pace is carried in, and the clock.
 *
 *   the track   The course unrolled into a ribbon that circles the planet: an
 *               annulus a band's width wide through a plane chosen for two eyes
 *               at once — the poster's own (an open ellipse over the globe, the
 *               near arc crossing its face) and the runner's on the ground (an
 *               arch standing in the sky his camera actually carries) — banked
 *               like a velodrome's, though half as steeply as a velodrome's wall
 *               would be, because the ribbon has to be a band in the sky and not
 *               a wall of colour filling the frame. Its face is laid in the
 *               race's own pace — deep crimson where the splits were slow, hot
 *               vermilion and a step toward the warm paper where they were fast,
 *               the page's own white left to the light and to the finish line —
 *               with an ink rim drawing both its edges, the split gates standing
 *               over it as luminous arches (the halfway and the finish at their
 *               own strength, the rest carrying under them), a tick at every
 *               kilometre of the course it carries, and the week's own light
 *               running it: a mote lapping the ring at the race's own average
 *               pace, slowed and quickened where its splits were, dragging a
 *               faint trail of light behind it. Everything luminous is drawn
 *               twice: once as a mark on the sheet (the paper left, the race's
 *               red loaded), and once as an additive pass along the same
 *               surface, which is what makes a glow read on a page whose sky is
 *               already nearly white — though the glow is a mark and not a
 *               material, and the surface keeps the painting. The ink rim is the
 *               other half of that bargain: a light with no edge is a smudge.
 *
 *   the aurora  The same course as a curtain of light standing on the ring's own
 *               plane: folds that ripple on the clock and are read as ribs, the
 *               week's own green at the foot walked up into a violet that
 *               survives the alpha all the way to the crest, the rays along its
 *               length bright where the race was fast and dark where it hurt,
 *               and the finish left vermilion — a fringe of the race line
 *               hanging in the sky. The curtain is light and not matter: drawn
 *               as the page saved with pigment through it, throwing no shadow,
 *               and let go where it comes too close to the eye — light hanging
 *               in the lens is not painted.
 *
 * Deterministic: no Math.random anywhere (the week's own name seeds the hand),
 * and the only clock is uTime — captures pin t, so a pinned capture is the same
 * frame every time.
 */
import { P } from './params.js';
import { attachTeardown } from './teardown.js';
import { gatherSplits, realSplits } from './forms.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a || 1e-6), 0, 1); return t * t * (3 - 2 * t); };

// ---- The track, in planet radii. The outer edge is the reach the poster has
// always been framed for (base.js: at most 1.42 R for a race ring). The inner
// edge is set by the runner's own eye and not by the poster: the ring's near arc
// passes a handful of units over his head and the arc he can see crosses his sky
// at only ~0.8 R, so a band that is a hand's width on the shelf is a wall across
// his frame. The ribbon is therefore a fine one — a velodrome's own line, and it
// stands clear of the week's own crests, which is what keeps a ring a ring and
// not a lid on one.
const TRACK_IN = 1.372;
const TRACK_OUT = 1.40;
const TRACK_BANK = 0.055;     // the outer edge lifted this far along the loop's normal
const TRACK_SEGS = 720;       // the loop's own resolution (a segment is ~1.3 u of arc)

// ---- the aurora, in planet radii: the curtain's ring radius, how far the folds
// push it out of that ring, and the ring's own second shell behind it.
const AURORA_RHO = 1.225;
const AURORA_FOLD = 0.045;
const AURORA_SHELL = 0.07;
const AURORA_TOP = 0.40;      // the crest of the curtain, above the ring's plane
const AURORA_FOOT = 0.09;     // …and its bright foot, below it
const AURORA_SEGS = 512;
const AURORA_ROWS = 10;

// ---- the table the pace is carried in: one row of texels round the whole loop.
// R is the pace, G the kilometre ticks, B the gate thresholds, A the finish
// zone. A loop is ~965 u long, so a texel is half a unit of arc: a tick four
// texels wide is a brush's width at the poster and a dash at the shelf.
const TABLE = 2048;
const TICK_W = 0.0048;        // a kilometre tick, in loop fractions
const GATE_W = 0.011;         // a gate's own threshold across the ribbon

// ---- the band the landing view is asked to carry, in radians of apparent width
// across the runner's own sight line. A ribbon this wide cannot read thinner than
// the far arc of the loop it is on — the near arc passes a handful of units over
// his head — so the target is the arc standing off across his sky, and the search
// is left to find the planes where the loop reads as a band there and not as a
// slab laid over the frame.
const BAND_WANT = 0.09;      // a ribbon band ~65 px of the 720 frame the ground sees
const CURTAIN_WANT = 0.50;   // a curtain ~360 px: the sky's own height, filled

/* ------------------------------------------------------------------ maths -- */

function hashStr(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

/** A 0-100 float seed from the week's own name: what the hand is drawn with, so
 *  two weeks are never one track. */
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
 * turnToSun) plus the race weeks' own pitch bias, POSTER_TILT — the poster is
 * lifted 0.17 rad on a race week, and a plane chosen 10 degrees off the eye it
 * will actually be seen from is a plane chosen blind. The ring is built before
 * the poster picks its frame, so this is read here rather than waited for: the
 * loop's plane is chosen against it.
 */
function posterAxis(T, { race, light, out = new T.Vector3() }) {
  midcourse(T, race, out).multiplyScalar(-1);
  const side = new T.Vector3().copy(light).addScaledVector(out, -light.dot(out));
  if (side.lengthSq() > 1e-8) out.addScaledVector(side.normalize(), 0.6).normalize();
  const pitch = clamp(Math.asin(clamp(out.y, -1, 1)) + 0.17, -1.35, 1.35);   // base.js POSTER_TILT
  const y = Math.sin(pitch);
  const h = Math.sqrt(Math.max(1e-6, 1 - y * y));
  const flat = Math.hypot(out.x, out.z) || 1;
  return out.set((out.x / flat) * h, y, (out.z / flat) * h);
}

/**
 * The runner's own frame, measured as the camera it actually is. The eye stands
 * his own height above the ground he starts from, the frame is square and 45
 * degrees tall, and it is pitched down by the chase camera's own fifteen degrees
 * (both read off the landing captures) — so the sky it carries is a band from a
 * little under his horizon up to a few degrees over it, and what he sees of a
 * ring is whatever of it lands inside those four edges.
 *
 * So each candidate plane is scored by projecting the loop's own samples through
 * that camera: how much of the loop is inside the frame and clear of the globe,
 * how far ACROSS the frame those samples span (an arc that crosses it reads as an
 * arch; an arc clipped at one edge is a slab of colour down the side, which is
 * the failure this replaced), how centred it is, how thick the band reads against
 * the frame's own height, and where in the frame it stands. The far half of the
 * loop, seen through nothing, is what fills the sky with a curve.
 */
const LAND_FOV = (45 * Math.PI) / 180;      // the landing capture's own frame
const LAND_PITCH = (-15.4 * Math.PI) / 180; // …and the chase camera's own pitch
const LAND_HEIGHT = 18;                     // units above the surface: the landing stands 12-21 up

function landingFrame(T, { n, site, view, inner, outer, R, band, lean, avoid = null, eye = LAND_HEIGHT }) {
  const up = site.clone().normalize();
  const facing = view ? view.clone().addScaledVector(up, -view.dot(up)) : new T.Vector3();
  if (facing.lengthSq() < 1e-8) facing.crossVectors(new T.Vector3(0, 1, 0), up);
  facing.normalize();
  const fwd = facing.clone().multiplyScalar(Math.cos(-LAND_PITCH)).addScaledVector(up, Math.sin(LAND_PITCH)).normalize();
  const camUp = up.clone().addScaledVector(fwd, -up.dot(fwd)).normalize();
  const right = new T.Vector3().crossVectors(camUp, fwd).normalize();
  const eyeAt = up.clone().multiplyScalar(R + eye);
  const perp = up.clone().addScaledVector(n, -n.dot(up));
  if (perp.lengthSq() <= 1e-10) return { cover: 0, width: 0, span: 0, mid: 1, low: 1, high: -1, clear: 1, above: 0 };
  perp.normalize();
  const side = new T.Vector3().crossVectors(n, perp).normalize();
  const width = outer - inner;
  const cosB = Math.cos(lean), sinB = Math.sin(lean);
  const tanH = Math.tan(LAND_FOV / 2);
  const q = new T.Vector3(), v = new T.Vector3(), cross = new T.Vector3(), radial = new T.Vector3(), toCam = new T.Vector3();
  const xs = [], ys = [], thicks = [];
  let above = 0, inside = 0, total = 0, clear = 1;
  for (let ri = 0; ri < 3; ri++) {
    const rho = inner + width * (ri / 2);
    for (let i = 0; i < 90; i++) {
      const phi = (i / 90) * TAU;
      radial.copy(perp).multiplyScalar(Math.cos(phi)).addScaledVector(side, Math.sin(phi));
      q.copy(radial).multiplyScalar(rho);
      total++;
      if (q.clone().sub(eyeAt).dot(up) > 0) above++;
      v.copy(q).sub(eyeAt);
      const fz = v.dot(fwd);
      if (!(fz > 1)) continue;                       // behind the eye of the frame
      // the globe's own limb: a sample it hides is not in the frame at all
      toCam.copy(eyeAt).sub(q);
      const cosA = toCam.normalize().dot(v.clone().multiplyScalar(-1).normalize());
      if (cosA > 0) {
        const len = q.length();
        if (len * Math.sin(Math.acos(clamp(cosA, -1, 1))) < R && len * cosA < eyeAt.length()) continue;
      }
      const len = v.length();
      const x = v.dot(right) / (fz * tanH);
      const y = v.dot(camUp) / (fz * tanH);
      if (Math.abs(x) > 0.97 || Math.abs(y) > 0.97) continue;
      inside++;
      xs.push(x);
      ys.push(y);
      // how far this sample stands from the week's own monument in the frame: a
      // ribbon that runs into the landmark's silhouette is a strut beside it, and
      // a ring is a ring only if the sky is left open around the thing itself
      if (avoid) {
        const mv = avoid.clone().multiplyScalar(R * 1.6).sub(eyeAt);
        const mz = mv.dot(fwd);
        if (mz > 1) {
          const mx = mv.dot(right) / (mz * tanH);
          const my = mv.dot(camUp) / (mz * tanH);
          if (Math.abs(mx) <= 1.1 && Math.abs(my) <= 1.1) {
            const gap = Math.max(Math.abs(x - mx) - 0.06, 0);
            clear = Math.min(clear, gap);
          }
        }
      }
      // the cross-section stands in the plane of the radius and the loop's own
      // normal; what the eye sees of it is what lies across its own sight line
      cross.copy(radial).multiplyScalar(cosB).addScaledVector(n, sinB);
      const seenW = Math.sqrt(Math.max(0, 1 - Math.pow(v.clone().divideScalar(len).dot(cross), 2)));
      thicks.push((band * seenW) / (len * tanH * 2));
    }
  }
  if (!inside) return { cover: 0, width: 0, span: 0, mid: 1, low: 1, high: -1, clear: 1, above: above / Math.max(1, total) };
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  thicks.sort((a, b) => a - b);
  const mid = xs[Math.floor(xs.length / 2)];
  const edge = xs.filter((x) => Math.abs(x) > 0.86).length / xs.length;
  return {
    above: above / total,
    clear,
    cover: clamp((inside / total) * 10, 0, 1) * 0.55 + clamp((xs[xs.length - 1] - xs[0]) / 1.6, 0, 1) * 0.45,
    width: thicks[Math.floor(thicks.length / 2)],
    span: xs[xs.length - 1] - xs[0],
    mid: Math.abs(mid),
    edge,
    low: ys[0],
    high: ys[ys.length - 1],
    elev: ys[Math.floor(ys.length / 2)],
  };
}

function planeFor(T, { course, site, view, camera, light, tilt, inner, outer, R, band, lean, want = BAND_WANT, arc = true, avoid = null }) {
  const zenith = site.clone().normalize();
  const ref = Math.abs(zenith.y) > 0.9 ? new T.Vector3(1, 0, 0) : new T.Vector3(0, 1, 0);
  const e1 = new T.Vector3().crossVectors(zenith, ref).normalize();
  const e2 = new T.Vector3().crossVectors(zenith, e1).normalize();
  const n = new T.Vector3(), best = new T.Vector3(), open = new T.Vector3();
  let bestScore = -Infinity, openScore = -Infinity, seenBest = null;
  // the width the landing view can carry, per style: the ribbon's own thickness
  // against the frame's height for the track, the curtain's height for the aurora
  const thin = (w) => (w <= 1e-5 ? 0 : Math.max(0, 1 - Math.abs(Math.log(w / want)) / 1.0));
  for (let li = 0; li < 14; li++) {
    const lean = 0.10 + (0.86 - 0.10) * (li / 13);
    for (let i = 0; i < 60; i++) {
      const phi = (i / 60) * TAU;
      n.copy(zenith).multiplyScalar(lean)
        .addScaledVector(e1, Math.cos(phi))
        .addScaledVector(e2, Math.sin(phi))
        .normalize();
      const cam = n.dot(camera);
      if (cam < 0.06) continue;                   // the loop's face is the poster's own side
      const seen = landingFrame(T, { n, site, view, inner, outer, R, band, lean, avoid });
      const sun = Math.abs(n.dot(light));
      const ellipse = Math.max(0, 1 - Math.abs(cam - 0.58) / 0.26);
      // An arch and not a slab. The loop the ground can hold is scored on where
      // its samples land in the runner's own frame: how much of it is there, how
      // far ACROSS the frame it spans (an arc that crosses reads as an arch; one
      // clipped at an edge reads as a pillar down the side), how centred it is,
      // how thick the band reads against the frame's height, and where it stands
      // — with the poster's ellipse kept alongside, because both eyes matter.
      const cent = clamp(1 - seen.mid / 0.8, 0, 1);
      const thinFit = Math.max(0, 1 - Math.abs(Math.log(Math.max(1e-4, seen.width) / want)) / 1.0);
      const heightFit = Math.max(0, 1 - Math.abs(seen.elev - 0.45) / 0.60);
      // How hard the landing arc is asked to cross the frame is the one thing the
      // two styles want differently: the track's ribbon, now that it is a fine
      // one, can be a line across the corner of the runner's frame and would
      // rather keep the poster's open ellipse; the curtain is read through, so
      // its arc is asked to sit centred in the sky.
      const score = (arc ? 0.22 : 0.30) * ellipse
        + (arc ? 0.12 : 0.14) * seen.cover
        + (arc ? 0.20 : 0.12) * cent
        + (arc ? 0.08 : 0.05) * (1 - clamp(seen.edge, 0, 1))
        + 0.08 * clamp(seen.clear / 0.30, 0, 1)
        + 0.18 * thinFit
        + 0.06 * heightFit
        + 0.04 * Math.max(0, 1 - Math.abs(sun - 0.48) / 0.48)
        + 0.02 * n.dot(course);
      // the second ranking is the same walk with the landing left out of it, so a
      // week the runner's own sky cannot hold still gets the poster's best ring
      if (score > openScore + 1e-9) { openScore = score; open.copy(n); }
      // and the first is gated: a race ring that the ground cannot see is a ring
      // nobody ever sees, and no amount of poster ellipse is worth that
      if (seen.cover < 0.22) continue;
      if (score > bestScore + 1e-9) { bestScore = score; best.copy(n); seenBest = seen; }
    }
  }
  if (bestScore === -Infinity) {
    if (openScore === -Infinity) best.copy(course);
    else best.copy(open);
  }
  const t = clamp(Number(tilt), 0, 1);
  if (t < 1) best.multiplyScalar(t).addScaledVector(course, 1 - t);
  if (best.lengthSq() < 1e-12) best.copy(course);
  best.normalize();
  if (best.dot(camera) < 0) best.multiplyScalar(-1);   // the bank always tilts to the poster

  // The basis the loop is written in: ax across it, ay up it, and the plane's
  // own normal out of it — the axis the bank lifts toward, and the side the
  // poster sees.
  const bRef = Math.abs(best.y) > 0.9 ? new T.Vector3(1, 0, 0) : new T.Vector3(0, 1, 0);
  const ax = new T.Vector3().crossVectors(bRef, best).normalize();
  const ay = new T.Vector3().crossVectors(best, ax).normalize();
  const flat = new T.Vector3().copy(camera).addScaledVector(best, -camera.dot(best));
  const phiCam = flat.lengthSq() > 1e-8 ? Math.atan2(flat.dot(ay), flat.dot(ax)) : 0;
  // what the search settled on, kept for the probe: the arch the runner holds,
  // and whether the gated ranking found anything at all
  const seen = seenBest || landingFrame(T, { n: best, site, view, inner, outer, R, band, lean, avoid });
  return {
    n: best,
    ax, ay, phiCam,
    gated: bestScore !== -Infinity,
    seen: {
      cover: +seen.cover.toFixed(3),
      above: +seen.above.toFixed(3),
      width: +seen.width.toFixed(3),
      span: +seen.span.toFixed(3),
      mid: +seen.mid.toFixed(3),
      edge: +(seen.edge ?? 0).toFixed(3),
      elev: +seen.elev.toFixed(3),
    },
  };
}

/* ----------------------------------------------------------------- banding -- */

/**
 * The paces the ribbon is painted with: one per split, fastest at 1. Nothing
 * here is a time — the record keeps none — so a split's pace is read off the
 * ground the race was drawn on (the course's own gradient under that split,
 * against the course's own average slope), the week's own fatigue over the
 * distance it ran, and the week's own seed for the day that split had.
 */
function paceOf(T, { features, race, stats, seed }) {
  const rng = features.makeRng(`companion-track/${seed.toFixed(2)}`);
  const n = race.seg.length / 3;
  const at = new T.Vector3();
  const ground = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    at.set(race.seg[i * 3], race.seg[i * 3 + 1], race.seg[i * 3 + 2]);
    const h = Number(features.heightAt(at));
    ground[i] = Number.isFinite(h) ? h : 0;
  }

  // One split per kilometre — or per lap, when the watch divided the race into
  // more of those than that, or the record's own splits (forms.js) — walked
  // down to a coarser reading of the same race as companions.ringBands falls.
  const km = Math.max(0, Number(stats?.distanceM) || 0) / 1000;
  const laps = Math.max(0, Number(stats?.laps) || 0);
  const bands = clamp(Number(P['companions.ringBands']), 0, 1);
  const real = realSplits(stats);
  const splits = real
    ? clamp(Math.round(real.length * (0.30 + 0.70 * bands)), Math.min(6, real.length), 48)
    : clamp(Math.round(Math.max(km, laps, 8) * (0.30 + 0.70 * bands)), 6, 48);

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
  // an evenly run race reads even (real splits a few seconds apart)
  const spread = real ? Math.max(hi - lo, 0.06) : hi - lo;
  for (let i = 0; i < splits; i++) pace[i] = spread < 1e-4 ? 0.62 : 1 - (cost[i] - lo) / spread;

  // the race's own duration, for the light's lap: its average pace is distance
  // over time, and the loop carries the whole distance once
  const durationS = Math.max(0, Number(stats?.activeS) || 0);
  const kmReal = km > 0 ? km : 10;
  return { splits, pace, km: kmReal, laps: Math.round(laps), durationS, fatigue };
}

/**
 * Where the gates stand. The splits are the watch's own divisions and there may
 * be forty-eight of them, which is a grating and not a row of gates; so every
 * stride-th split gets one, and the half always does. Each gate carries the pace
 * of the split it opens, because a gate stands for the stretch of race that runs
 * out from under it.
 */
function gatesOf({ splits, pace }) {
  const stride = Math.max(1, Math.round(splits / 7));
  const half = Math.floor(splits / 2);
  const gates = [];
  for (let i = 1; i <= splits; i++) {
    if (i === splits) continue;                    // the finish stands where the start does
    if (i % stride !== 0 && i !== half) continue;
    gates.push({ s: i / splits, kind: i === half ? 1 : 0, pace: pace[Math.min(splits - 1, i)] });
  }
  gates.push({ s: 0, kind: 2, pace: pace[0] });    // the finish line, at the loop's own seam
  return { gates, half, stride };
}

/**
 * The table itself: the loop unrolled into one row of texels. The pace is laid
 * across each split's own stretch of the loop, a step at the split's edge and a
 * brush's softening before it, so what the poster reads is the race's own
 * banding and not a gradient. The ticks are the course's kilometres (every fifth
 * one longer, the way a road marks them), the thresholds the gates, and the last
 * channel the finish zone — the stretch of loop that carries the race line's
 * vermilion, which the aurora reads as its fringe.
 */
function buildTable({ splits, pace, km, gates }) {
  const data = new Float32Array(TABLE * 4);
  const wrap = (s) => Math.abs(((s + 0.5) % 1 + 1) % 1 - 0.5);
  for (const gate of gates) {
    const weight = gate.kind === 2 ? 1 : gate.kind === 1 ? 0.92 : 0.76;
    for (let i = 0; i < TABLE; i++) {
      const w = wrap((i + 0.5) / TABLE - gate.s) / GATE_W;
      if (w > 1) continue;
      const t = Math.pow(1 - w, 1.7) * weight;
      if (t > data[i * 4 + 2]) data[i * 4 + 2] = t;
    }
  }
  for (let k = 1; k <= Math.floor(km + 0.0001); k++) {
    const big = k % 5 === 0;
    const w = big ? TICK_W * 1.7 : TICK_W;
    for (let i = 0; i < TABLE; i++) {
      const t = wrap((i + 0.5) / TABLE - k / km) / w;
      if (t > 1) continue;
      const mark = (1 - t) * (1 - t) * (big ? 0.95 : 0.58);
      if (mark > data[i * 4 + 1]) data[i * 4 + 1] = mark;
    }
  }
  const finW = 0.032;
  for (let i = 0; i < TABLE; i++) {
    const s = (i + 0.5) / TABLE;
    const q = s * splits;
    const i0 = clamp(Math.floor(q), 0, splits - 1);
    const i1 = Math.min(splits - 1, i0 + 1);
    const soft = sstep(0.88, 1.0, q - Math.floor(q));
    data[i * 4] = pace[i0] * (1 - soft) + pace[i1] * soft;
    data[i * 4 + 3] = Math.max(0, 1 - Math.pow(clamp(wrap(s) / finW, 0, 1), 0.7));
  }
  const bytes = new Uint8Array(TABLE * 4);
  for (let i = 0; i < TABLE * 4; i++) bytes[i] = Math.round(clamp(data[i], 0, 1) * 255);
  return bytes;
}

/**
 * The light's own lap, as a table: where the mote stands round the loop at each
 * phase of its lap, and — in the row under it — when the light was last at each
 * point of the loop. It runs the course's own progression once per lap, and its
 * speed along the loop is the pace of the split it is on (floored, so the light
 * never stops where the race all but did), so the lap takes the race's own
 * average pace scaled and the mote visibly slows where the race did. The second
 * row is what the trail is read from: a wake is the last seconds of the run and
 * not a fixed slice of the course, so a light that has only just left the line
 * still drags the whole of its own wake behind it.
 */
function runnerTable({ splits, pace }) {
  const N = 512, M = 1024;
  const speed = new Float64Array(M);
  let total = 0;
  for (let i = 0; i < M; i++) {
    const p = pace[clamp(Math.floor(((i + 0.5) / M) * splits), 0, splits - 1)];
    speed[i] = 0.26 + 0.74 * p;
    total += speed[i];
  }
  const phaseAt = new Float64Array(M + 1);
  let acc = 0;
  for (let i = 0; i < M; i++) { phaseAt[i] = acc / total; acc += speed[i]; }
  phaseAt[M] = 1;
  const data = new Uint8Array(N * 2 * 4);
  let j = 0;
  for (let i = 0; i < N; i++) {
    const x = (i + 0.5) / N;
    while (j < M - 1 && phaseAt[j + 1] < x) j++;
    const span = Math.max(1e-9, phaseAt[j + 1] - phaseAt[j]);
    const s = (j + clamp((x - phaseAt[j]) / span, 0, 1)) / M;
    // row 0: phase to place
    data[i * 4] = Math.round(clamp(s, 0, 1) * 255);
    data[i * 4 + 1] = Math.round(clamp(speed[Math.min(M - 1, j)], 0, 1) * 255);
    data[i * 4 + 2] = Math.round(clamp(phaseAt[Math.min(M - 1, j)] / Math.max(1e-9, phaseAt[M]), 0, 1) * 255);
    data[i * 4 + 3] = 255;
    // row 1: place to phase — the walk back from a point of the loop to the
    // instant the light was standing on it
    const k = (N + i) * 4;
    const at = (i + 0.5) / N;
    const ph = phaseAt[Math.min(M, Math.max(0, Math.round(at * M)))];
    data[k] = Math.round(clamp(ph, 0, 1) * 255);
    data[k + 1] = 255;
    data[k + 2] = 255;
    data[k + 3] = 255;
  }
  return data;
}

/* ------------------------------------------------------------------- glsl -- */

// The hand: a value noise and a cell hash, from the three constants the rest of
// the ink shaders use, so nothing here draws a pattern the sheet would not.
const RT_NOISE = /* glsl */ `
float rtHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float rtNoise(vec2 x) {
  vec2 i = floor(x);
  vec2 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float a = rtHash(vec3(i, 0.0));
  float b = rtHash(vec3(i + vec2(1.0, 0.0), 0.0));
  float c = rtHash(vec3(i + vec2(0.0, 1.0), 0.0));
  float d = rtHash(vec3(i + vec2(1.0, 1.0), 0.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

// The two tables, and the light's own lap: where it stands now, and when it was
// last standing on the point this fragment is on. Both are reads of the clock,
// never a clock the frame has to answer to.
const RT_READ = /* glsl */ `
uniform sampler2D tTrack;
uniform sampler2D tRunner;
uniform float uTime, uPeriod, uPhase;
vec4 rtTrack(float s) { return texture2D(tTrack, vec2(fract(s), 0.5)); }
float rtPhase() { return fract(uTime / uPeriod + uPhase); }
float rtRunner() { return texture2D(tRunner, vec2(rtPhase(), 0.25)).r; }
float rtWake(float s) { return fract(rtPhase() - texture2D(tRunner, vec2(fract(s), 0.75)).r); }
`;

// The globe's own umbra, analytically: the ray from this fragment toward the sun
// met against the sphere. The one mark that says this is a ring in a system lit
// by a sun and not a drawing.
const RT_UMBRA = /* glsl */ `
float rtUmbra(vec3 p, vec3 L, float Rs) {
  float b = dot(p, L);
  float hit = b * b - (dot(p, p) - Rs * Rs);
  return b < 0.0 ? smoothstep(0.0, 2.0 * Rs * 5.0, hit) : 0.0;
}
`;

const TRACK_VERT = /* glsl */ `
attribute float aS;
attribute float aV;
varying vec3 vWorld;
varying vec3 vNrm;
varying float vS;
varying float vV;
void main() {
  vS = aS;
  vV = aV;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNrm = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

// The racing surface: one pass over the ribbon, carrying the whole painted mark
// — the pace walked from the race's own deep crimson to the paper's white, the
// splits' banding showing through as steps, the ink rim inside both edges, the
// kilometre ticks, the gates' thresholds, the finish line, and the light's own
// trail, which is the paper saved behind it, because on this sheet light is the
// page left alone.
const TRACK_FRAG = /* glsl */ `
${RT_NOISE}
${RT_READ}
${RT_UMBRA}
varying vec3 vWorld;
varying vec3 vNrm;
varying float vS;
varying float vV;
uniform vec3 uSunDir, uPaper, uInk, uCool, uDeep, uMid, uHot, uWhite, uVerm;
uniform float uSeed, uR, uSea, uShadow, uCover, uTrail, uLane;
void main() {
  float s = fract(vS);
  vec4 t = rtTrack(s);
  float pace = t.r;
  vec3 N = normalize(vNrm);
  vec3 V = normalize(cameraPosition - vWorld);
  if (dot(N, V) < 0.0) N = -N;                 // the bank is seen from either side

  // ---- the hand. Nothing on this ribbon is ruled: its lanes, its rims and the
  // pace read under them all wander, so a band's edge is a brush's edge. The
  // wander is three scales deep, because the ribbon is seen at three — from the
  // shelf it is forty pixels across, from the runner's own sky it is the width
  // of the frame.
  float tooth = rtNoise(vec2(s * 190.0, vV * 26.0) + uSeed) * 0.62
              + rtNoise(vec2(s * 37.0, vV * 7.0) - uSeed * 1.7) * 0.38;
  float fine = rtNoise(vec2(s * 620.0, vV * 90.0) + uSeed * 3.1);
  float vv = vV + (tooth - 0.5) * 0.030 + (fine - 0.5) * 0.008;
  float pw = clamp(pace + (rtNoise(vec2(s * 90.0, 3.0) + uSeed) - 0.5) * 0.085, 0.0, 1.0);

  // ---- the pace, from the deep crimson of a slow split to the paper of a fast
  // one. The white is spent only where the race was at its own limit and only in
  // the body of the ribbon: an edge that goes to paper is an edge the sky eats.
  float edge = min(vv, 1.0 - vv);
  float body = smoothstep(0.02, 0.16, edge);
  vec3 col = mix(uDeep, uMid, smoothstep(0.0, 0.46, pw));
  col = mix(col, uHot, smoothstep(0.44, 0.84, pw) * body);
  // the limit of pace is the warm paper and not the page's white: the near-white
  // is spent on the light and on the finish line, and on nothing else
  col = mix(col, mix(uHot, uPaper, 0.55), smoothstep(0.82, 1.0, pw) * body * 0.80);
  // the inner edge runs a step darker than the lane, the way a banked track's own
  // shadow does: it is the mark that tells the eye which way the ribbon leans
  col = mix(col, mix(uInk, uDeep, 0.45), (1.0 - smoothstep(0.0, 0.20, vv)) * 0.30);

  // ---- the lane: one pale line down the track the way a velodrome carries its
  // measurement line, and the gate thresholds burning across the whole width
  float lane = 1.0 - smoothstep(0.006, 0.034, abs(vv - 0.42));
  col = mix(col, mix(uPaper, uHot, 0.35), lane * 0.22);
  float gate = t.b * (1.0 - smoothstep(0.86, 0.98, vv));
  col = mix(col, mix(uVerm, uPaper, 0.32), gate * 0.70);
  float fin = smoothstep(0.22, 1.0, t.a);
  col = mix(col, mix(uVerm, uPaper, 0.18), fin);

  // the course's kilometres: ticks along the outer lane, where a runner reads
  // them, longest every fifth
  float tick = t.g * smoothstep(0.30, 0.44, vv) * (1.0 - smoothstep(0.88, 0.97, vv));
  col = mix(col, mix(uInk, uDeep, 0.35), tick * 0.42);

  // ---- the light's own wake: the mote has just been here, and what it left is
  // the paper itself — hot where it stands and thinning back along the last
  // seconds of its run
  float since = rtWake(s);
  float trail = exp(-since / uTrail) * (1.0 - step(0.5, since));
  float laneW = 1.0 - smoothstep(0.05, 0.32, abs(vv - uLane));
  float light = trail * laneW * (0.45 + 0.55 * pw);
  col = mix(col, mix(uPaper, uWhite, 0.45), clamp(light, 0.0, 1.0) * 0.70);

  // ---- the ink outline: both edges of the ribbon are drawn, and the pen runs
  // inside the edge, so the silhouette is a line and not a cut — broken where the
  // brush ran dry, because a rim of even weight is a moulded edge and not a hand
  float rim = (1.0 - smoothstep(0.012, 0.080, edge)) * (0.52 + 0.48 * tooth);
  col = mix(col, mix(uInk, uDeep, 0.22), rim * 0.88);

  // ---- the light on it. The sheet is lit like a sheet of grains: what it
  // catches is the sun's own elevation over the loop's plane, the face turned
  // away is the wash cooled a step, and the globe's shadow is laid across it as
  // more pigment. The race's own red keeps three fifths of its strength inside
  // the dark — a track that goes out in the shadow cannot be followed round.
  vec3 L = normalize(uSunDir);
  col = mix(col * 0.80 + uCool * 0.03, col, smoothstep(-0.06, 0.30, dot(N, L)));
  float shadow = rtUmbra(vWorld, L, uR + uSea) * uShadow;
  col = mix(col, col * 0.40 + uCool * 0.04, shadow * (1.0 - 0.58 * body * smoothstep(0.6, 1.0, pw)));

  // ---- the wash's own load, and where the sheet's tooth broke it
  col *= 0.95 + 0.09 * fine;
  float dry = smoothstep(0.60, 0.95, tooth) * 0.5;
  // The stretch of the ribbon that passes right over the runner's own head is a
  // wall of pigment in his frame, not a track in his sky: it is let go as it
  // comes too close to the eye, exactly as the aurora's curtain is, so what the
  // ground sees of the ring is its arch.
  float near = smoothstep(uR * 0.25, uR * 0.70, distance(vWorld, cameraPosition));
  float cover = clamp((uCover * (1.0 - dry * 0.35) + light * 0.25 + tick * 0.2 + gate * 0.08) * near, 0.0, 1.0);
  if (cover < 0.004) discard;
  gl_FragColor = vec4(col, cover);
}
`;

// The glow: a second pass along the same surface, added rather than laid. This
// is what the two halves of the bargain are for — the surface says what colour
// the track is, this says how hot it is. The pace at its own limit blooms, the
// gates and the ticks catch, the finish burns, and the light's head and trail
// carry the eye round the ring.
const TRACK_GLOW_FRAG = /* glsl */ `
${RT_NOISE}
${RT_READ}
varying vec3 vNrm;
varying vec3 vWorld;
varying float vS;
varying float vV;
uniform vec3 uHot, uPaper, uWhite, uVerm;
uniform float uSeed, uGlow, uTrail, uLane, uR;
void main() {
  float s = fract(vS);
  vec4 t = rtTrack(s);
  float pw = t.r;
  float tooth = rtNoise(vec2(s * 190.0, vV * 26.0) + uSeed) * 0.62
              + rtNoise(vec2(s * 37.0, vV * 7.0) - uSeed * 1.7) * 0.38;
  float vv = vV + (tooth - 0.5) * 0.030;
  float edge = min(vv, 1.0 - vv);
  float body = smoothstep(0.02, 0.20, edge);

  // A glow is a mark, not a material: the surface carries the painting, and what
  // is added here is only what burns — the limit of pace, the gates, the finish,
  // and the light itself. Spread across the whole ribbon it was chrome.
  float heat = smoothstep(0.44, 1.0, pw) * body;
  vec3 col = mix(uHot, mix(uHot, uPaper, 0.5), smoothstep(0.72, 1.0, pw));
  float amt = heat * 0.14;

  amt += t.b * 0.34 * (1.0 - smoothstep(0.90, 1.0, vv));
  col += uVerm * t.b * 0.26;
  amt += t.g * 0.05;
  amt += smoothstep(0.5, 1.0, t.a) * 0.52;
  col += uVerm * t.a * 0.30;

  float since = rtWake(s);
  float trail = exp(-since / uTrail) * (1.0 - step(0.5, since));
  float laneW = 1.0 - smoothstep(0.04, 0.34, abs(vv - uLane));
  float light = trail * laneW * (0.35 + 0.65 * pw);
  amt += light * 0.55;
  col += uWhite * light * 0.30;

  amt *= uGlow;
  // the same bargain as the wash's: the glow is dropped where the ribbon comes
  // right over the runner's head, so the ground sees an arch and not a ceiling
  amt *= smoothstep(uR * 0.25, uR * 0.70, distance(vWorld, cameraPosition));
  if (amt < 0.003) discard;
  gl_FragColor = vec4(col * amt, 1.0);
}
`;

// The mote: the week's own light running the course, a small burning mark
// standing over the bank. It is a screen-facing quad whose world position is read
// out of the light's table in the vertex shader, so the whole lap costs the
// frame's clock nothing.
const MOTE_VERT = /* glsl */ `
${RT_READ}
attribute vec2 corner;
uniform float uInner, uOuter, uBank, uLane, uLift, uAspect, uWidth;
varying vec2 vCorner;
void main() {
  float s = rtRunner();
  float phi = s * 6.2831853;     // the frame already carries the start line
  float rho = mix(uInner, uOuter, uLane);
  vec3 p = vec3(cos(phi) * rho, sin(phi) * rho, uBank * uLane + uLift);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vec4 mv = viewMatrix * wp;
  mv.xy += corner * vec2(uWidth, uWidth * uAspect);
  vCorner = corner * 2.0;
  gl_Position = projectionMatrix * mv;
}
`;

const MOTE_INK_FRAG = /* glsl */ `
${RT_NOISE}
varying vec2 vCorner;
uniform vec3 uInk, uDeep;
uniform float uSeed, uTime;
void main() {
  float d = length(vCorner);
  if (d > 1.3) discard;
  // the ring round the light, drawn by a hand: it wanders, it thickens on one
  // side and it breaks where the brush ran out
  float wob = (rtNoise(vec2(vCorner.x * 3.4 + uSeed, vCorner.y * 3.4 - uSeed)) - 0.5) * 0.24
            + (rtNoise(vec2(vCorner.x * 9.0 - uSeed, vCorner.y * 9.0 + uSeed * 2.0)) - 0.5) * 0.11;
  float ring = exp(-pow((d - 0.80 - wob) / 0.13, 2.0));
  float breaks = 0.70 + 0.30 * rtNoise(vec2(atan(vCorner.y, vCorner.x) * 4.0, uTime * 0.2 + uSeed));
  float amt = ring * breaks;
  if (amt < 0.01) discard;
  gl_FragColor = vec4(mix(uInk, uDeep, 0.3), clamp(amt, 0.0, 1.0) * 0.42);
}
`;

const MOTE_GLOW_FRAG = /* glsl */ `
${RT_NOISE}
varying vec2 vCorner;
uniform vec3 uHot, uWhite;
uniform float uSeed, uGain, uTime;
void main() {
  float d = length(vCorner);
  if (d > 1.7) discard;
  // the light's own heat: a core the paper cannot hold, a halo that goes out in
  // a brush's width, and a breath of the runner's own stride in it
  float pulse = 0.88 + 0.12 * sin(uTime * 5.1 + uSeed);
  float core = exp(-d * d * 7.0);
  float halo = exp(-d * d * 1.9) * 0.22;
  float grain = 0.84 + 0.16 * rtNoise(vec2(vCorner * 5.0 + uSeed + uTime * 0.05));
  vec3 col = mix(uHot, uWhite, clamp(core * 1.35, 0.0, 1.0));
  float amt = (core + halo) * uGain * pulse * grain;
  gl_FragColor = vec4(col * amt, 1.0);
}
`;

// The gates: a luminous arch standing over the bank, spanning the ribbon's own
// cross-section. One geometry instanced round the loop, a dark one drawn a hair
// larger under each so the light has an edge to burn against.
const GATE_VERT = /* glsl */ `
attribute float aGain;
varying vec3 vNrm, vWorld;
varying vec2 vUv;
varying float vGain;
void main() {
  vUv = uv;
  vGain = aGain;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNrm = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const GATE_FRAG = /* glsl */ `
${RT_NOISE}
varying vec3 vNrm, vWorld;
varying vec2 vUv;
varying float vGain;
uniform vec3 uHot, uPaper, uWhite;
uniform float uSeed, uGain, uR;
void main() {
  vec3 N = normalize(vNrm);
  vec3 V = normalize(cameraPosition - vWorld);
  // a tube read as a light: brightest where the eye meets it square on, falling
  // away round the cylinder, and never a ruled line. The finish and the halfway
  // mark stand at their own strength and the splits' gates stand under them, so
  // the race is read as a hierarchy of marks and not as a luminous grating.
  float facing = abs(dot(N, V));
  float grain = 0.78 + 0.22 * rtNoise(vec2(vUv.x * 26.0 + uSeed, vUv.y * 3.0));
  vec3 col = mix(uHot, uPaper, 0.26);
  col = mix(col, uWhite, smoothstep(0.55, 1.0, facing) * 0.55);
  float amt = (0.35 + 0.65 * facing) * grain * uGain * vGain;
  amt *= smoothstep(uR * 0.25, uR * 0.70, distance(vWorld, cameraPosition));
  if (amt < 0.01) discard;
  gl_FragColor = vec4(col * amt, 1.0);
}
`;

// The aurora: a curtain of light standing on the loop, its folds carried round
// it. The vertical is the week's own green walked up into its shade's violet;
// the horizontal is the race's own pace, so the curtain burns along the splits
// that hurt and thins over the ones that did not; the seam carries the race
// line's vermilion as a fringe. Drawn as a veil with the page showing through
// its rays, never as an opaque band.
const AURORA_VERT = /* glsl */ `
${RT_NOISE}
attribute float aS;
attribute float aRow;
attribute float aShell;
uniform float uRho, uFold, uTop, uFoot, uShellOut, uTime, uSeed;
varying float vS, vRow, vShell;
varying vec3 vWorld;
void main() {
  float a = aS * 6.2831853;
  float rho0 = uRho + aShell * uShellOut;
  // the folds: one long wave carries the curtain round the ring and a shorter
  // one breaks the long folds into bays. Both ride the clock, and the crest
  // swings further than the foot — which is what makes a curtain a curtain.
  float wave = sin(a * 2.0 + uTime * 0.20 + uSeed) * 0.62 + sin(a * 5.0 - uTime * 0.13 + aShell * 2.1) * 0.38;
  float bay = rtNoise(vec2(aS * 7.0 + uTime * 0.018, uSeed * 3.0 + aShell * 11.0)) - 0.5;
  float lift = 0.18 + 0.82 * aRow;
  float rho = rho0 + (wave * 0.55 + bay * 1.3) * uFold * lift * (1.0 - 0.30 * aShell);
  float z = mix(uFoot, uTop * (1.0 - 0.22 * aShell), pow(aRow, 0.86)) + bay * uFold * 0.6 * aRow;
  vec3 p = vec3(cos(a) * rho, sin(a) * rho, z);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  vS = aS;
  vRow = aRow;
  vShell = aShell;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const AURORA_FRAG = /* glsl */ `
${RT_NOISE}
${RT_READ}
varying float vS, vRow, vShell;
varying vec3 vWorld;
uniform vec3 uGreen, uViolet, uPaper, uVerm, uCool, uInk;
uniform float uSeed, uGain, uPaceMix, uR;
void main() {
  vec4 t = rtTrack(vS);
  float pace = t.r;
  // the rays: a curtain is folds seen almost edge-on, so its light is read in
  // vertical striations — a fine walk along the ring, wobbled by a slower noise
  // so no two rays are the same width, both drifting on the clock
  float ray = rtNoise(vec2(vS * 104.0 + uTime * 0.035, vRow * 0.30 + uSeed));
  float slow = rtNoise(vec2(vS * 23.0 - uTime * 0.022, 9.0 + uSeed * 1.7));
  // The ribs are the curtain, and a watercolour curtain is paper reserved between
  // deposits of light: the walk from valley to crest is taken all the way to
  // nothing, so the sheet shows through between the rays instead of being glazed
  // by one even film. A stain with no dry ground in it is cellophane.
  // the rays' own width wanders on a third, slower hand, so the ribs are not a
  // ruled ladder: a curtain is torn cloth, not slats
  float wander = rtNoise(vec2(vS * 6.0 - uTime * 0.01, 21.0 + uSeed * 0.7));
  float rib = pow(ray * (0.30 + 0.70 * slow) * (0.72 + 0.56 * wander), 1.05);
  float strip = smoothstep(0.10, 0.92, rib);
  // the ribs are pigment and not film: where a ray is loaded it is laid down
  // near opaque — gouache — and the page between two rays is left dry, which is
  // the whole difference between a curtain and a pane of coloured cellophane
  float load = smoothstep(0.34, 0.92, strip);
  float foot = exp(-vRow * 6.5);
  // the body carries the wash up through the middle of the curtain and lets it
  // go at the crest, which is where the violet has to be legible: a colour that
  // only arrives after the alpha has died is a colour that is never seen
  float body = (1.0 - smoothstep(0.62, 1.0, vRow)) * smoothstep(0.0, 0.12, vRow);
  float rise = mix(0.50, 1.0, pace);                     // a fast split stands taller
  // the crest is ragged because the rays are: a curtain of light is torn along
  // its top edge by the very striations that make it one, and a ruled edge there
  // reads as a wall of colour and not as sky fire
  float topEdge = clamp(rise * 0.68 + strip * 0.34 + (slow - 0.5) * 0.30 - 0.04, 0.16, 0.97);
  float height = 1.0 - smoothstep(topEdge, topEdge + 0.16, vRow);
  float curtain = (body * 0.85 + foot * 0.70) * height * uGain * (1.0 - 0.62 * vShell);
  curtain *= mix(0.45, 1.35, mix(0.35, 1.0, uPaceMix * pace));
  // The light that hangs in the lens is not painted. A curtain is a band across
  // the runner's sky; the stretch of it standing right over his head is a wall of
  // colour filling the frame and no reading at all, so the veil is let go as it
  // comes too close to the eye and the arch across his sky is what is left.
  curtain *= smoothstep(uR * 0.22, uR * 0.70, distance(vWorld, cameraPosition));

  vec3 col = mix(uGreen, uViolet, smoothstep(0.16, 0.86, vRow));
  col = mix(col, uCool, vShell * 0.28);
  // the rays' own crests hold the paper, and the foot's own edge holds it
  // hardest: this is where the light is, and a wash stopped short of white is
  // how a painting says so
  float crest = smoothstep(0.72, 1.0, strip) * smoothstep(0.62, 1.0, pace) * smoothstep(0.05, 0.45, vRow);
  col = mix(col, uPaper, clamp(crest * 0.55 + smoothstep(0.07, 0.0, vRow) * 0.35, 0.0, 1.0));
  // The hem: the foot of a curtain is the line every aurora is read by — one near
  // opaque stroke the light lays along its own bottom edge, where it meets the
  // dark. And the folds' own turnings are drawn in ink, because a fold of light
  // is read by the stroke a brush leaves where it turns.
  float hem = exp(-vRow * 16.0);
  col = mix(col, mix(uGreen, uPaper, 0.28), hem * 0.65);
  float flank = smoothstep(0.12, 0.26, rib) - smoothstep(0.46, 0.68, rib);
  col = mix(col, mix(uInk, uViolet, 0.30), flank * 0.30);

  // the fringe: the loop's own seam carries the race line's vermilion, so the
  // week's finish hangs in the sky as a red edge to the curtain
  float fin = smoothstep(0.10, 0.90, t.a);
  col = mix(col, mix(uVerm, uPaper, 0.18), fin * (0.45 + 0.55 * foot));

  float amt = clamp(curtain * mix(strip, 1.0, load * 0.85) * (0.45 + 0.55 * fin) + hem * 0.45 + flank * 0.16, 0.0, 1.0);
  if (amt < 0.006) discard;
  gl_FragColor = vec4(col, amt);
}
`;

// the aurora's own core: the same curtain added rather than laid, so the rays'
// brightest heads glow where they cross something dark
const AURORA_GLOW_FRAG = /* glsl */ `
${RT_NOISE}
${RT_READ}
varying float vS, vRow, vShell;
varying vec3 vWorld;
uniform vec3 uGreen, uViolet, uPaper, uVerm;
uniform float uSeed, uGain, uR;
void main() {
  vec4 t = rtTrack(vS);
  float pace = t.r;
  float ray = rtNoise(vec2(vS * 104.0 + uTime * 0.035, vRow * 0.30 + uSeed));
  float slow = rtNoise(vec2(vS * 23.0 - uTime * 0.022, 9.0 + uSeed * 1.7));
  float strip = pow(ray * (0.38 + 0.62 * slow), 1.5);
  float foot = exp(-vRow * 3.4);
  float rise = mix(0.50, 1.0, pace);
  float topEdge = clamp(rise * 0.58 + strip * 0.40 - 0.02, 0.16, 0.96);
  float height = 1.0 - smoothstep(topEdge, topEdge + 0.22, vRow);
  float amt = strip * foot * height * uGain * (0.30 + 0.70 * pace) * (1.0 - 0.5 * vShell);
  amt *= smoothstep(uR * 0.22, uR * 0.70, distance(vWorld, cameraPosition));
  vec3 col = mix(uGreen, uViolet, smoothstep(0.20, 0.95, vRow));
  col = mix(col, uPaper, 0.20) + uVerm * t.a * 0.35;
  if (amt < 0.004) discard;
  gl_FragColor = vec4(col * amt, 1.0);
}
`;

/* ---------------------------------------------------------------- geometry -- */

/**
 * The racing surface: an annulus whose outer edge is lifted along the loop's own
 * normal, so the ribbon is a bank and not a sheet lying in the sky. Three rows of
 * vertices carry it (the bank is a straight line across the ribbon), the seam is
 * duplicated so the loop's own table can be sampled without a wrap seam, and the
 * walk round the loop rides along as an attribute, because every mark on the
 * track — pace, ticks, gates, the light — is a function of that same walk.
 */
function buildRibbon(T, { inner, outer, bank, segs }) {
  const rows = 3;
  const width = outer - inner;
  const slope = bank / width;
  const inv = 1 / Math.hypot(slope, 1);
  const count = (segs + 1) * rows;
  const pos = new Float32Array(count * 3);
  const nrm = new Float32Array(count * 3);
  const aS = new Float32Array(count);
  const aV = new Float32Array(count);
  const index = [];
  for (let i = 0; i <= segs; i++) {
    const phi = (i / segs) * TAU;
    const c = Math.cos(phi), sn = Math.sin(phi);
    for (let j = 0; j < rows; j++) {
      const v = j / (rows - 1);
      const r = inner + width * v;
      const k = i * rows + j;
      pos[k * 3] = c * r;
      pos[k * 3 + 1] = sn * r;
      pos[k * 3 + 2] = bank * v;
      nrm[k * 3] = -slope * c * inv;
      nrm[k * 3 + 1] = -slope * sn * inv;
      nrm[k * 3 + 2] = inv;
      aS[k] = i / segs;
      aV[k] = v;
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < rows - 1; j++) {
      const a = i * rows + j, b = a + rows, c = b + 1, d = a + 1;
      index.push(a, c, b, a, d, c);
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new T.BufferAttribute(nrm, 3));
  geo.setAttribute('aS', new T.BufferAttribute(aS, 1));
  geo.setAttribute('aV', new T.BufferAttribute(aV, 1));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  return geo;
}

/**
 * The gates. A torus cut in half is a gate whose own chord is the ribbon's
 * cross-section: its feet stand on both edges of the track and its crown rises
 * square off the bank, which is what a gate over a velodrome does. One geometry,
 * instanced once round the loop for the light and once for the ink beneath it.
 */
function buildGates(T, { gates, inner, outer, bank, R }) {
  const width = outer - inner;
  const beta = Math.atan2(bank, width);              // the bank's own angle
  // the gate's own chord is a little short of the ribbon's cross-section, so its
  // feet stand on the track and its crown rises over it — and so the tallest
  // gate never reaches past the ribbon's own banked edge, which is the reach the
  // poster was framed for
  const chord = Math.hypot(width * 0.5, bank * 0.5) * 1.02;
  const geo = new T.TorusGeometry(chord, chord * 0.20, 6, 24, Math.PI);
  const inkGeo = new T.TorusGeometry(chord, chord * 0.30, 6, 24, Math.PI);
  const m = new T.Matrix4();
  const X = new T.Vector3(), Y = new T.Vector3(), Z = new T.Vector3(), at = new T.Vector3();
  const rMid = (inner + outer) * 0.5;
  const zMid = bank * 0.5;
  const scaleOf = (kind) => (kind === 2 ? 1.34 : kind === 1 ? 1.18 : 1.0);
  let reach = 0;
  const gains = new Float32Array(gates.length);
  const matrices = gates.map((gate, gi) => {
    const phi = gate.s * TAU;
    const c = Math.cos(phi), sn = Math.sin(phi);
    // the cross-section's own direction, and the perpendicular standing on it
    X.set(c * Math.cos(beta), sn * Math.cos(beta), Math.sin(beta));
    Y.set(-c * Math.sin(beta), -sn * Math.sin(beta), Math.cos(beta));
    Z.copy(X).cross(Y);
    const k = scaleOf(gate.kind);
    gains[gi] = gate.kind ? 1.0 : 0.50;      // the halfway and the finish stand, the rest carry
    at.set(c * rMid, sn * rMid, zMid);
    m.makeBasis(X, Y, Z);
    m.scale(new T.Vector3(k, k, k));
    m.setPosition(at);
    // the arch's furthest point — its outer foot — is what the poster has to fit
    const rr = rMid + k * chord * Math.cos(beta);
    const zz = zMid + k * chord * Math.sin(beta);
    reach = Math.max(reach, Math.hypot(rr, zz) / R);
    gate.scale = k;
    return m.clone();
  });
  geo.setAttribute('aGain', new T.InstancedBufferAttribute(gains, 1));
  inkGeo.setAttribute('aGain', new T.InstancedBufferAttribute(gains, 1));
  return { geo, inkGeo, matrices, reach, chord, beta };
}

/** What the light's own quad is: a screen-facing square, told its corner. */
function buildQuad(T) {
  const geo = new T.PlaneGeometry(1, 1);
  geo.setAttribute('corner', new T.BufferAttribute(
    new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5]), 2));
  return geo;
}

/** The two textures both builders read: the loop's own table, and the light's. */
function tables(T, opts) {
  const track = new T.DataTexture(buildTable(opts), TABLE, 1, T.RGBAFormat, T.UnsignedByteType);
  track.name = 'companion-track-table';
  track.minFilter = track.magFilter = T.LinearFilter;
  track.wrapS = T.RepeatWrapping;
  track.wrapT = T.ClampToEdgeWrapping;
  track.generateMipmaps = false;
  track.needsUpdate = true;
  const runner = new T.DataTexture(runnerTable(opts), 512, 2, T.RGBAFormat, T.UnsignedByteType);
  runner.name = 'companion-track-runner';
  runner.minFilter = runner.magFilter = T.LinearFilter;
  runner.wrapS = T.RepeatWrapping;
  runner.wrapT = T.ClampToEdgeWrapping;
  runner.generateMipmaps = false;
  runner.needsUpdate = true;
  return { track, runner };
}

/* ------------------------------------------------------------------ build -- */

/**
 * The race as a glowing track in orbit: a banked ribbon circling the planet,
 * painted in the race's own pace, gated, ticked, and run by the week's own
 * light. Returns null when there is no course, or too little of one to fit a
 * plane to.
 */
export function trackRing(ctx) {
  const { THREE: T, features, palette: pal, uniforms } = ctx;
  const race = features?.race;
  if (!race?.seg || race.seg.length < 15) return null;
  const course = courseAxis(T, race.seg);
  if (!course) return null;

  const R = Number(ctx.R) || 120;
  const seaLevel = Number(features.seaLevel) || 0;
  const light = uniforms.uSunDir;
  const sun = (light?.value || new T.Vector3(0.55, 0.72, 0.42)).clone().normalize();
  const inner = R * TRACK_IN;
  const outer = R * TRACK_OUT;
  const bank = R * TRACK_BANK;

  const camera = posterAxis(T, { race, light: sun });
  const site = (features.spawn || features.monument?.dir || features.list?.[0]?.dir || camera).clone().normalize();
  const view = features.spawnTangent ? features.spawnTangent.clone().normalize() : null;
  const plane = planeFor(T, {
    course, site, view, camera, light: sun,
    tilt: Number(P['companions.ringTilt']), inner, outer, R,
    band: Math.hypot(outer - inner, bank), lean: Math.atan2(bank, outer - inner), arc: false,
    avoid: features.monument?.dir || features.list?.[0]?.dir || null,
  });

  const seed = seedOf(features.week);
  const stats = (race.featureId && features.byId?.[race.featureId]?.stats) || features.monument?.stats || null;
  const lace = paceOf(T, { features, race, stats, seed });
  const { gates, half, stride } = gatesOf(lace);
  const { track, runner } = tables(T, { ...lace, gates });

  // Where the light runs: the outer half of the bank, the way a runner holds a
  // line on a track. The start line stands a little before the loop's own point
  // nearest the poster, so the poster sees the finish, the gate standing over it
  // and the light just past it, all on the arc that crosses the globe's own
  // face — and it is carried by the frame's own turn about the loop's normal, so
  // the table the ribbon is painted from, the gates and the light all read the
  // same walk round the loop rather than three walks that agree only by luck.
  const lane = 0.54;
  const phi0 = plane.phiCam - 0.62;
  // the lap: the race's own average pace, scaled so a marathon's loop takes
  // three quarters of a minute and a 10 k's about nine seconds
  const durationS = lace.durationS || lace.km * 300;
  const period = clamp(durationS / 300, 9, 46);

  const group = new T.Group();
  group.name = 'companion-race-ring';
  const frame = new T.Group();
  frame.name = 'companion-race-ring-plane';
  frame.quaternion.setFromRotationMatrix(
    new T.Matrix4().makeBasis(plane.ax, plane.ay, plane.n).multiply(new T.Matrix4().makeRotationZ(phi0)),
  );
  group.add(frame);

  // ---- the wash the track is painted in. The race's own vermilion is the
  // middle of the walk: its deep is that red dried a step toward its own
  // magenta — crimson, which is what a slow split is — its hot is the same red
  // burning toward the paper, and the top of the walk is the paper itself, the
  // only white this sheet has.
  const deep = pal.vermilion.clone().lerp(pal.dark || pal.ink, 0.34);
  deep.offsetHSL(-0.012, 0.12, -0.02);
  const mid = pal.vermilion.clone().lerp(pal.sepia, 0.12);
  const hot = pal.vermilion.clone().lerp(pal.paper, 0.45);
  const white = pal.paper.clone().lerp(new T.Color(1, 1, 1), 0.45);
  const cool = pal.shadeCool.clone().lerp(pal.dark || pal.ink, 0.35);

  const shared = {
    tTrack: { value: track },
    tRunner: { value: runner },
    uTime: uniforms.uTime,
    uPeriod: { value: period },
    uPhase: { value: 0 },
    uSunDir: light || { value: sun },
    uR: { value: R },
    uSea: { value: seaLevel },
    uPaper: { value: pal.paper.clone() },
    uInk: { value: pal.ink.clone() },
    uCool: { value: cool },
    uDeep: { value: deep },
    uMid: { value: mid },
    uHot: { value: hot },
    uWhite: { value: white },
    uVerm: { value: pal.vermilion.clone() },
    uSeed: { value: seed },
    uLane: { value: lane },
    uTrail: { value: 0.115 },   // the wake the light drags, in laps of its own phase
    uShadow: { value: clamp(Number(P['companions.ringShadow']), 0, 1) },
    uGlow: { value: 1 },
  };

  // both passes keep the frame's own alpha untouched: the ink pass reads it (see
  // rings.js), and a ribbon has no business rewriting it
  const alphaSafe = {
    blendSrc: T.SrcAlphaFactor,
    blendDst: T.OneMinusSrcAlphaFactor,
    blendSrcAlpha: T.ZeroFactor,
    blendDstAlpha: T.OneFactor,
  };
  const additive = {
    blendSrc: T.SrcAlphaFactor,
    blendDst: T.OneFactor,
    blendSrcAlpha: T.ZeroFactor,
    blendDstAlpha: T.OneFactor,
  };

  const geo = buildRibbon(T, { inner, outer, bank, segs: TRACK_SEGS });
  const wash = new T.Mesh(geo, new T.ShaderMaterial({
    uniforms: { ...shared, uCover: { value: 0.94 } },
    vertexShader: TRACK_VERT,
    fragmentShader: TRACK_FRAG,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    blending: T.CustomBlending,
    ...alphaSafe,
  }));
  wash.name = 'companion-track-wash';
  wash.renderOrder = 1;
  frame.add(wash);

  const glow = new T.Mesh(geo, new T.ShaderMaterial({
    uniforms: { ...shared },
    vertexShader: TRACK_VERT,
    fragmentShader: TRACK_GLOW_FRAG,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    blending: T.CustomBlending,
    ...additive,
  }));
  glow.name = 'companion-track-glow';
  glow.renderOrder = 2;
  frame.add(glow);

  // ---- the gates, standing over the bank, and the ink drawn a hair larger
  // under each so the light has an edge to burn against
  const gateBuild = buildGates(T, { gates, inner, outer, bank, R });
  const gateGlowMat = new T.ShaderMaterial({
    uniforms: {
      uHot: { value: hot.clone() },
      uPaper: { value: pal.paper.clone() },
      uWhite: { value: white.clone() },
      uSeed: { value: seed },
      uGain: { value: 1 },
      uR: { value: R },
    },
    vertexShader: GATE_VERT,
    fragmentShader: GATE_FRAG,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    blending: T.CustomBlending,
    ...additive,
  });
  const inkMesh = new T.InstancedMesh(gateBuild.inkGeo, new T.ShaderMaterial({
    uniforms: {
      uHot: { value: pal.ink.clone() },
      uPaper: { value: pal.ink.clone() },
      uWhite: { value: pal.ink.clone() },
      uSeed: { value: seed },
      uGain: { value: 0.85 },
      uR: { value: R },
    },
    vertexShader: GATE_VERT,
    fragmentShader: GATE_FRAG,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    blending: T.CustomBlending,
    ...alphaSafe,
  }), gates.length);
  const gateMesh = new T.InstancedMesh(gateBuild.geo, gateGlowMat, gates.length);
  gateBuild.matrices.forEach((m, i) => {
    gateMesh.setMatrixAt(i, m);
    inkMesh.setMatrixAt(i, m);
  });
  gateMesh.instanceMatrix.needsUpdate = true;
  inkMesh.instanceMatrix.needsUpdate = true;
  gateMesh.frustumCulled = false;
  inkMesh.frustumCulled = false;
  inkMesh.name = 'companion-track-gate-ink';
  gateMesh.name = 'companion-track-gates';
  inkMesh.renderOrder = 3;
  gateMesh.renderOrder = 4;
  frame.add(inkMesh);
  frame.add(gateMesh);

  // ---- the light itself: a mote standing over the bank, screen-facing, with
  // the ink ring round it drawn first so the glow has an edge to burn against.
  // Its place comes out of the table in the vertex shader, so the app's frame
  // does no work for it and the geometry (a unit quad) says nothing about where
  // it is — hence no frustum culling of either mesh.
  const quad = buildQuad(T);
  const moteUniforms = {
    ...shared,
    uInner: { value: inner },
    uOuter: { value: outer },
    uBank: { value: bank },
    uLift: { value: R * 0.03 },
    uAspect: { value: 1.0 },
    uWidth: { value: R * 0.055 },
    uGain: { value: 1 },
  };
  const moteInk = new T.Mesh(quad, new T.ShaderMaterial({
    uniforms: moteUniforms,
    vertexShader: MOTE_VERT,
    fragmentShader: MOTE_INK_FRAG,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    blending: T.CustomBlending,
    ...alphaSafe,
  }));
  const moteGlow = new T.Mesh(quad, new T.ShaderMaterial({
    uniforms: moteUniforms,
    vertexShader: MOTE_VERT,
    fragmentShader: MOTE_GLOW_FRAG,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    blending: T.CustomBlending,
    ...additive,
  }));
  for (const mote of [moteInk, moteGlow]) {
    mote.frustumCulled = false;
    frame.add(mote);
  }
  moteInk.name = 'companion-track-mote-ink';
  moteGlow.name = 'companion-track-mote';
  moteInk.renderOrder = 5;
  moteGlow.renderOrder = 6;

  const reach = Math.max(TRACK_OUT, Math.hypot(TRACK_OUT, TRACK_BANK), gateBuild.reach);
  group.userData.reach = reach;
  group.userData.ring = {
    style: 'track',
    axis: plane.n.toArray(),
    inner: TRACK_IN, outer: TRACK_OUT, bank: TRACK_BANK,
    splits: lace.splits, stride, km: +lace.km.toFixed(2), laps: lace.laps,
    gates: gates.length, half,
    pace: Array.from(lace.pace, (v) => +v.toFixed(3)),
    period: +period.toFixed(2), lane, phi0: +phi0.toFixed(3),
    reach: +reach.toFixed(3),
    gated: plane.gated, seen: plane.seen,
    angleToCamera: +(Math.acos(clamp(plane.n.dot(camera), -1, 1)) * 180 / Math.PI).toFixed(1),
    angleToSun: +(Math.asin(clamp(Math.abs(plane.n.dot(sun)), -1, 1)) * 180 / Math.PI).toFixed(1),
    seed,
  };
  // the track's own teardown: the ribbon, the gates, the motes and their tables
  attachTeardown(group);
  return group;
}

/**
 * The race as an aurora: a luminous curtain circling the planet, its folds
 * rippling on the clock, the week's green at the foot walked into its shade's
 * violet at the crest, its rays burning along the splits that were fast, and the
 * finish left vermilion. Returns null when there is no course to hang it on.
 */
export function auroraRing(ctx) {
  const { THREE: T, features, palette: pal, uniforms } = ctx;
  const race = features?.race;
  if (!race?.seg || race.seg.length < 15) return null;
  const course = courseAxis(T, race.seg);
  if (!course) return null;

  const R = Number(ctx.R) || 120;
  const light = uniforms.uSunDir;
  const sun = (light?.value || new T.Vector3(0.55, 0.72, 0.42)).clone().normalize();
  const rho = R * AURORA_RHO;
  const inner = rho * 0.80;
  const outer = rho * 1.12;

  const camera = posterAxis(T, { race, light: sun });
  const site = (features.spawn || features.monument?.dir || features.list?.[0]?.dir || camera).clone().normalize();
  const view = features.spawnTangent ? features.spawnTangent.clone().normalize() : null;
  const plane = planeFor(T, {
    course, site, view, camera, light: sun,
    tilt: Number(P['companions.ringTilt']), inner, outer, R,
    band: R * (AURORA_TOP + AURORA_FOOT), lean: Math.PI * 0.5, want: CURTAIN_WANT, arc: false,
    avoid: features.monument?.dir || features.list?.[0]?.dir || null,
  });

  const seed = seedOf(features.week);
  const stats = (race.featureId && features.byId?.[race.featureId]?.stats) || features.monument?.stats || null;
  const lace = paceOf(T, { features, race, stats, seed });
  const { gates } = gatesOf(lace);
  const { track, runner } = tables(T, { ...lace, gates });

  const group = new T.Group();
  group.name = 'companion-race-ring';
  const frame = new T.Group();
  frame.name = 'companion-race-ring-plane';
  // the curtain's own walk starts at the poster's own point of the loop, so the
  // finish — the one place the aurora is red — hangs where the poster can see it
  const phi0 = plane.phiCam - 0.5;
  frame.quaternion.setFromRotationMatrix(
    new T.Matrix4().makeBasis(plane.ax, plane.ay, plane.n).multiply(new T.Matrix4().makeRotationZ(phi0)),
  );
  group.add(frame);

  // The week's own green, pushed the way an aurora is: its sea's teal walked
  // toward its own vegetation and then a step beyond the palette, into the green
  // no week's ground ever is — this is light and not ground. The violet is its
  // shade's own slate walked toward the race's vermilion — a blue and a red make
  // the purple — and then out past it, because the crest of a curtain is the one
  // colour in this picture that no pigment on the sheet would have.
  const green = pal.teal.clone().lerp(pal.veg || pal.landLow, 0.55).lerp(new T.Color(0x1fbf72), 0.34);
  const violet = pal.shadeCool.clone().lerp(pal.vermilion, 0.30).lerp(new T.Color(0x8d6ade), 0.34);

  const shared = {
    tTrack: { value: track },
    tRunner: { value: runner },
    uTime: uniforms.uTime,
    uPeriod: { value: 40 },
    uPhase: { value: 0 },
    uR: { value: R },
    uRho: { value: rho },
    uFold: { value: R * AURORA_FOLD },
    uShellOut: { value: R * AURORA_SHELL },
    uTop: { value: R * AURORA_TOP },
    uFoot: { value: R * AURORA_FOOT },
    uGreen: { value: green },
    uViolet: { value: violet },
    uInk: { value: pal.ink.clone() },
    uCool: { value: pal.shadeCool.clone() },
    uPaper: { value: pal.paper.clone() },
    uVerm: { value: pal.vermilion.clone() },
    uSeed: { value: seed },
    uGain: { value: 1 },
    uPaceMix: { value: 1 },
  };

  // the curtain: two shells of the same walk, the inner brighter and the outer a
  // taller veil behind it, which gives a curtain depth without a second idea. The
  // geometry is a bare cylinder — every fold, every fold's wander and the crest's
  // own height are the vertex shader's, so its bounds have to be stated by hand.
  const segs = AURORA_SEGS, rows = AURORA_ROWS;
  const perShell = (segs + 1) * rows;
  const count = perShell * 2;
  const pos = new Float32Array(count * 3);
  const nrm = new Float32Array(count * 3);
  const aS = new Float32Array(count);
  const aRow = new Float32Array(count);
  const aShell = new Float32Array(count);
  const index = [];
  for (let shell = 0; shell < 2; shell++) {
    const base = shell * perShell;
    for (let i = 0; i <= segs; i++) {
      const phi = (i / segs) * TAU;
      for (let j = 0; j < rows; j++) {
        const k = base + i * rows + j;
        pos[k * 3] = Math.cos(phi);
        pos[k * 3 + 1] = Math.sin(phi);
        nrm[k * 3] = Math.cos(phi);
        nrm[k * 3 + 1] = Math.sin(phi);
        aS[k] = i / segs;
        aRow[k] = Math.pow(j / (rows - 1), 1.35);   // rows laid denser at the foot
        aShell[k] = shell;
      }
    }
    for (let i = 0; i < segs; i++) {
      for (let j = 0; j < rows - 1; j++) {
        const a = base + i * rows + j, b = a + rows, c = b + 1, d = a + 1;
        index.push(a, b, c, a, c, d);
      }
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new T.BufferAttribute(nrm, 3));
  geo.setAttribute('aS', new T.BufferAttribute(aS, 1));
  geo.setAttribute('aRow', new T.BufferAttribute(aRow, 1));
  geo.setAttribute('aShell', new T.BufferAttribute(aShell, 1));
  geo.setIndex(index);
  const rhoMax = rho + R * AURORA_SHELL + R * AURORA_FOLD * 1.05;
  const rhoMin = Math.max(1, rho - R * AURORA_FOLD * 1.05);
  const zTop = R * AURORA_TOP + R * AURORA_FOLD * 0.5;
  const zFoot = -R * AURORA_FOOT - R * AURORA_FOLD * 0.5;
  geo.boundingSphere = new T.Sphere(
    new T.Vector3(0, 0, (zTop + zFoot) * 0.5),
    Math.hypot(rhoMax, (zTop - zFoot) * 0.5) + 1,
  );

  const alphaSafe = {
    blendSrc: T.SrcAlphaFactor,
    blendDst: T.OneMinusSrcAlphaFactor,
    blendSrcAlpha: T.ZeroFactor,
    blendDstAlpha: T.OneFactor,
  };
  const veil = new T.Mesh(geo, new T.ShaderMaterial({
    uniforms: { ...shared, uGain: { value: 1.25 } },
    vertexShader: AURORA_VERT,
    fragmentShader: AURORA_FRAG,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    blending: T.CustomBlending,
    ...alphaSafe,
  }));
  veil.name = 'companion-aurora-veil';
  veil.renderOrder = 2;
  frame.add(veil);

  const core = new T.Mesh(geo, new T.ShaderMaterial({
    uniforms: { ...shared, uGain: { value: 0.95 } },
    vertexShader: AURORA_VERT,
    fragmentShader: AURORA_GLOW_FRAG,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    blending: T.CustomBlending,
    blendSrc: T.SrcAlphaFactor,
    blendDst: T.OneFactor,
    blendSrcAlpha: T.ZeroFactor,
    blendDstAlpha: T.OneFactor,
  }));
  core.name = 'companion-aurora-core';
  core.renderOrder = 3;
  frame.add(core);

  const reach = Math.max(Math.hypot(rhoMax, zTop), Math.hypot(rhoMin, zFoot)) / R;
  group.userData.reach = reach;
  group.userData.ring = {
    style: 'aurora',
    axis: plane.n.toArray(),
    rho: AURORA_RHO, top: AURORA_TOP, foot: AURORA_FOOT, fold: AURORA_FOLD, phi0: +phi0.toFixed(3),
    splits: lace.splits, km: +lace.km.toFixed(2), laps: lace.laps,
    pace: Array.from(lace.pace, (v) => +v.toFixed(3)),
    reach: +reach.toFixed(3),
    gated: plane.gated, seen: plane.seen,
    angleToCamera: +(Math.acos(clamp(plane.n.dot(camera), -1, 1)) * 180 / Math.PI).toFixed(1),
    angleToSun: +(Math.asin(clamp(Math.abs(plane.n.dot(sun)), -1, 1)) * 180 / Math.PI).toFixed(1),
    seed,
  };
  // the curtain's own teardown: the folds, the core and the pace table under them
  attachTeardown(group);
  return group;
}

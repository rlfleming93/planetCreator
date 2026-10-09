/* Planet Creator — the Saturn-grade ring.
 *
 * companions.ringStyle saturn. Where the splits ring (rings.js raceRing) draws
 * the week's race as one washer in the course's own plane, this draws it as a
 * ring system, the way a Saturn is drawn: the week's own splits become the
 * banding, the race's own half is cut open as a Cassini-style division, the
 * split that hurt most is opened as an Encke-style gap with a shepherd moonlet
 * in it, the finish line is the thin bright vermilion hair just outside the
 * mass, and beyond it the week's own drift is left as a dust haze — the E ring
 * a week of miles feeds. Density and colour are sampled from one 1D band table
 * built from the splits, plus a sharp marks table for the divisions the race
 * names; the spokes, the planet's own shadow across the sheet, the sheet's own
 * shadow banded across the globe and the forward-scattered glow of the unlit
 * face are read in the shader.
 *
 * The ring's own plane is chosen, not given, and chosen for the runner first:
 * the search below walks every plane and scores it on what his own frame would
 * show (runnerCamera, runnerView) — the chase camera's still cut by the
 * ground's own skyline, in which the ring has to bend into an arch, show its
 * own width, cross the frame and leave him sky — then on the sun low over the
 * sheet and on his standing under the face the sun is behind. The poster then
 * finds its own eye on the lit face (posterEye) and the hero shot stands there
 * (shots.js), with the globe's shadow a long wedge cut across the ring.
 *
 * Underfoot (the eye down out of the poster's orbit) the sheet is painted as a
 * sky is: the race's banding cut into three washes with hand-cut edges, the
 * inner edge inked, the half's division cut wide with its two bright rims, the
 * face he reads lit by the sun or, turned away, dark where it is dense and lit
 * through where it is thin, the far side in the air.
 *
 * Radii are in planet radii: the band runs 1.25 to 2.30, the haze out to 2.56;
 * the hero poster keeps the solid ring whole (userData.ring.finish) and the
 * classic one pulls back to userData.reach. Everything is deterministic: the
 * seed is the week's own name and the only motion is the clock.
 */
import { P } from './params.js';
import { attachTeardown } from './teardown.js';
import { gatherSplits, realSplits } from './forms.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a || 1e-6), 0, 1); return t * t * (3 - 2 * t); };

// Where the system sits, in planet radii. The inner edge stands well clear of
// the tallest relief a week can raise (the ring is one sheet, and a peak
// through it is a mistake nobody forgets), and the outer edge is what the
// poster is pulled back to fit.
const RING_IN = 1.25;
const RING_OUT = 2.30;
const HAZE_OUT = 2.56;
// What the poster has to fit. The ringlets and the finish line run out to about
// 2.20 planet radii and the drift a little past that; only the E-ring haze goes
// further, and a veil is the one part of a ring a crop may take. So the reach is
// the drawn ring's own edge with a margin, not the haze's, and the camera comes
// in far enough that the planet is a world and not a bead: the haze runs off the
// crop, the finish line does not.
const REACH = 2.26;

// The band table: one row of ringlet loads per level of minification, exactly
// as the splits ring reads it — a ringlet is a hundredth of a pixel per shelf
// pixel, so the table keeps, under each level's blur, the mean a pixel really
// covers, and the shader mixes the two rows bracketing its own footprint.
const TABLE = 4096;
const ROWS = 10;
const ROW0 = 2;

// The cast shadow's own shell, riding the capped terrain as ink-clouds' glaze.
const SHELL_LIFT = 1.1;

/* ------------------------------------------------------------------ maths -- */

function hashStr(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

/** A 0-100 float seed from the week's own name: what the hand, the splits and
 *  the shepherds are drawn with, so two weeks are never one ring. */
function seedOf(week) {
  return (hashStr(String(week ?? '')) % 100000) / 1000;
}

/** The plane a course's own samples are fitted by (rings.js courseAxis), the
 *  floor every search here is blended back toward at ringTilt 0. */
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
 * Where base.js's own poster eye is: its race-week rule (the midcourse turned
 * away from us, then POSTER_OFF of the way back toward the sun), and the pitch
 * lift a week with a monument carries (POSTER_TILT). The hero poster stands
 * where posterEye puts it instead; this is the side of the globe the week has
 * always shown, which that eye keeps to where the ring allows.
 */
function posterAxis(T, { race, light, lift, out = new T.Vector3() }) {
  midcourse(T, race, out).multiplyScalar(-1);
  const side = new T.Vector3().copy(light).addScaledVector(out, -light.dot(out));
  if (side.lengthSq() > 1e-8) out.addScaledVector(side.normalize(), 0.6).normalize();
  const yaw = Math.atan2(out.z, out.x);
  const pitch = clamp(Math.asin(clamp(out.y, -1, 1)) + lift, -1.35, 1.35);
  return out.set(Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw)).normalize();
}

// The runner's own camera as the landing leaves it (base.js's chase camera at
// rest on the race's monument): chaseDist back down the road and chasePitch up
// from his feet, looking at his head (CHASE_LOOK over them), with the still
// keeping the middle eight tenths of the frame. The ring is judged in that
// frame, cut by the ground's own skyline.
const CHASE_LOOK = 1.6;
const CROP = 0.8;
const WIN_COLS = 16, WIN_ROWS = 12, WIN_STEPS = 240;
const WIN_BINS = new Uint8Array(10);
const WIN_HIT = new Uint8Array(WIN_COLS);

/**
 * The runner's camera at the landing: where it stands, how it is turned, the
 * tangent of the still's half-frame, and the ground's skyline across it — one
 * screen height per column, from the terrain marched out along that column's
 * own bearing, so a ring that crosses the frame behind a ridge is not a ring
 * the runner can see.
 */
function runnerCamera(T, { features, site, view, R }) {
  const d = site.clone().normalize();
  const ahead = view ? view.clone().addScaledVector(d, -view.dot(d)) : new T.Vector3();
  if (ahead.lengthSq() < 1e-8) ahead.crossVectors(d, new T.Vector3(0, 1, 0));
  ahead.normalize();
  const sea = Number(features.seaLevel) || 0;
  const groundAt = (dir) => R + Math.max(Number(features.heightAt(dir)) || 0, sea);
  const dist = Number(P['camera.chaseDist']) || 10.9;
  const pitch = Number(P['camera.chasePitch']) || 0.34;
  const floor = groundAt(d);
  const eye = d.clone().multiplyScalar(floor + dist * Math.sin(pitch)).addScaledVector(ahead, -dist * Math.cos(pitch));
  const fwd = d.clone().multiplyScalar(floor + CHASE_LOOK).sub(eye).normalize();
  const right = new T.Vector3().crossVectors(fwd, d).normalize();
  const up = new T.Vector3().crossVectors(right, fwd);
  const tan = Math.tan((Number(P['camera.fov']) || 45) * Math.PI / 360) * CROP;
  const upE = eye.clone().normalize();
  const sky = new Float32Array(WIN_COLS).fill(-1);
  const hdg = new T.Vector3(), at = new T.Vector3();
  for (let ci = 0; ci < WIN_COLS; ci++) {
    hdg.copy(fwd).addScaledVector(right, (-1 + (2 * ci + 1) / WIN_COLS) * tan);
    hdg.addScaledVector(upE, -hdg.dot(upE)).normalize();
    for (let k = 0, s = 3; k < 44; k++, s *= 1.12) {
      at.copy(eye).addScaledVector(hdg, s).normalize();
      at.multiplyScalar(groundAt(at)).sub(eye);
      const z = at.dot(fwd);
      if (z > 1e-3) sky[ci] = Math.max(sky[ci], at.dot(up) / z / tan);
    }
  }
  return { eye, fwd, right, up, tan, sky };
}

// The monument he stands before takes the middle of his frame, up to its own
// top (in still half-widths and half-heights). A ring that passes behind it
// still arches — the monument stands in front of the arch, the way a column
// stands before a vault — but only what shows either side of it is read.
const MONUMENT_COL = 0.15;
const MONUMENT_TOP = 0.95;
// The turn that reads as an arch in a still this narrow. The crop is some 37
// degrees across, and the edge of a ring seen from the ground turns at most
// some thirty degrees inside it: the arch is read in that turn, and a band
// turning half of it reads as a slope.
const ARCH_TURN = 28 * Math.PI / 180;

/**
 * How far one circle of the ring bends inside the runner's frame: the longest
 * run of it in his sky (above the skyline, in front of the globe — behind the
 * monument it runs on, unseen), the length of it he does see, and how far it
 * turns between its two ends. A ring that arches over the world draws its
 * edges as curves across the frame; a ring seen down its own plane draws them
 * as straight streaks. The circle is walked from a point out of sight, so a
 * run across the seam of the walk is one run.
 */
function arcInFrame(cam, perp, side, rho, R) {
  const { eye, fwd, right, up, tan, sky } = cam;
  const ee = eye.lengthSq() - R * R;
  let best = 0, len = 0, x0 = 0, y0 = 0, x1 = 0, y1 = 0, px = 0, py = 0, ax = 0, ay = 0, run = 0, began = false;
  const bend = () => {
    if (run < 5) return 0;
    let turn = Math.abs(Math.atan2(py - y1, px - x1) - Math.atan2(ay, ax));
    if (turn > Math.PI) turn = 2 * Math.PI - turn;
    return Math.min(1, len / 1.2) * Math.min(1, turn / ARCH_TURN);
  };
  for (let i = 0; i <= 2 * WIN_STEPS; i++) {
    const a = (i / WIN_STEPS) * TAU;
    const c = Math.cos(a) * rho, s = Math.sin(a) * rho;
    const vx = perp.x * c + side.x * s - eye.x;
    const vy = perp.y * c + side.y * s - eye.y;
    const vz = perp.z * c + side.z * s - eye.z;
    const z = vx * fwd.x + vy * fwd.y + vz * fwd.z;
    let seen = z > 1e-3, sx = 0, sy = 0;
    if (seen) {
      sx = (vx * right.x + vy * right.y + vz * right.z) / z / tan;
      sy = (vx * up.x + vy * up.y + vz * up.z) / z / tan;
      seen = Math.abs(sx) <= 1 && Math.abs(sy) <= 1
        && sy > sky[Math.min(WIN_COLS - 1, Math.floor((sx + 1) * 0.5 * WIN_COLS))];
    }
    if (seen) {
      // the globe's own body between his eye and it
      const l = Math.sqrt(vx * vx + vy * vy + vz * vz);
      const b = (eye.x * vx + eye.y * vy + eye.z * vz) / l;
      const disc = b * b - ee;
      if (disc > 0) { const th = -b - Math.sqrt(disc); if (th > 0 && th < l) seen = false; }
    }
    if (!seen) {
      if (run) best = Math.max(best, bend());
      run = 0;
      if (began && i >= WIN_STEPS) break;
      began = true;
      continue;
    }
    if (!began) continue;
    if (!run) { len = 0; x0 = sx; y0 = sy; }
    else {
      if (!(Math.abs(sx) < MONUMENT_COL && sy < MONUMENT_TOP)) len += Math.hypot(sx - px, sy - py);
      if (run === 4) { ax = sx - x0; ay = sy - y0; }
      if (run >= 4) { x1 = px; y1 = py; }
    }
    px = sx; py = sy;
    run++;
  }
  return best;
}

/**
 * What the ring does in the runner's own frame: how much of its own width he
 * reads (the share of its radius in sight — a ring whose inner rim alone
 * crosses the frame shows him nothing of the race), how many columns of the
 * frame it crosses, how much of the open sky beside the monument it takes, how
 * steeply he sees the sheet (seen down its own plane a ring is a fan of
 * streaks), and how far its inner edge, the start of its mass and its middle
 * bend inside the frame.
 */
function runnerView({ n, cam, inner, outer, R, perp, side, out }) {
  const { eye, fwd, right, up, tan, sky } = cam;
  WIN_BINS.fill(0);
  WIN_HIT.fill(0);
  const en = eye.dot(n), ee = eye.lengthSq() - R * R;
  let open = 0, band = 0, slant = 0;
  for (let ci = 0; ci < WIN_COLS; ci++) {
    const cx = -1 + (2 * ci + 1) / WIN_COLS;
    const sx = cx * tan;
    for (let ri = 0; ri < WIN_ROWS; ri++) {
      const sn = -1 + (2 * ri + 1) / WIN_ROWS;
      if (sn <= sky[ci] || (Math.abs(cx) < MONUMENT_COL && sn < MONUMENT_TOP)) continue;
      open++;
      const sy = sn * tan;
      let dx = fwd.x + right.x * sx + up.x * sy;
      let dy = fwd.y + right.y * sx + up.y * sy;
      let dz = fwd.z + right.z * sx + up.z * sy;
      const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
      dx /= l; dy /= l; dz /= l;
      const den = dx * n.x + dy * n.y + dz * n.z;
      if (Math.abs(den) < 1e-6) continue;
      const t = -en / den;
      if (!(t > 0)) continue;
      const b = eye.x * dx + eye.y * dy + eye.z * dz;
      const disc = b * b - ee;
      if (disc > 0) { const th = -b - Math.sqrt(disc); if (th > 0 && th < t) continue; }
      const r = Math.hypot(eye.x + dx * t, eye.y + dy * t, eye.z + dz * t);
      if (r < inner || r > outer) continue;
      band++;
      slant += Math.abs(den);
      WIN_HIT[ci] = 1;
      WIN_BINS[Math.min(9, Math.floor(((r - inner) / (outer - inner)) * 10))] = 1;
    }
  }
  let cols = 0, ucov = 0;
  for (let i = 0; i < WIN_COLS; i++) cols += WIN_HIT[i];
  for (let i = 0; i < 10; i++) ucov += WIN_BINS[i];
  let arc = 0;
  if (band) {
    for (const f of [0, 0.3, 0.6]) arc = Math.max(arc, arcInFrame(cam, perp, side, inner + (outer - inner) * f, R));
  }
  out.ucov = ucov / 10;
  out.cols = cols / WIN_COLS;
  out.fill = open ? band / open : 0;
  out.slant = band ? slant / band : 0;
  out.arc = arc;
  return out;
}

/** The runner's frame in one number: the ring has to bend before anything
 *  else counts — a band that crosses his sky without turning is a stripe
 *  however much of it there is, so a plane whose edges do not turn scores
 *  nothing here — and has to show him its own width, cross the frame, take a
 *  share of his sky (under half of it, and never all of it: a near side that
 *  fills the frame is a ceiling and not a ring) and be seen steeply enough to
 *  read as a sheet. */
function landingScore(win) {
  if (win.arc < 0.3) return 0;
  const ceiling = win.fill > 0.7 ? Math.max(0.4, 1 - 2 * (win.fill - 0.7)) : 1;
  return sstep(0.15, 0.70, win.ucov) * ceiling * win.arc * sstep(0.16, 0.36, win.slant)
    * (0.40 * Math.min(1, win.cols / 0.8) + 0.35 * Math.max(0, 1 - Math.abs(win.fill - 0.45) / 0.3)
      + 0.25 * Math.min(1, win.slant / 0.4));
}

/**
 * How much of the globe's own shadow falls on a part of the ring the poster can
 * see: the shadow lies on the ring's anti-sun arc and half of any ring is
 * behind its globe, so a plane that puts the umbra on the hidden arc leaves the
 * picture with no dark mass at all — the one mark that says the sheet is lit by
 * a sun and not printed flat.
 */
function posterShadow(T, { n, camera, light, R, inner, outer }) {
  const rho = (inner + outer) * 0.5;
  const ref = new T.Vector3(Math.abs(n.y) > 0.9 ? 1 : 0, Math.abs(n.y) > 0.9 ? 0 : 1, 0);
  const perp = new T.Vector3().copy(n).cross(ref).normalize();
  const side = new T.Vector3().crossVectors(n, perp).normalize();
  const q = new T.Vector3();
  let lit = 0, seen = 0, total = 0;
  for (let i = 0; i < 96; i++) {
    const phi = (i / 96) * TAU;
    q.copy(perp).multiplyScalar(Math.cos(phi)).addScaledVector(side, Math.sin(phi)).multiplyScalar(rho);
    total++;
    if (q.dot(camera) <= R) continue;               // the globe stands in front of it
    seen++;
    const b = q.dot(light);
    if (b < 0 && b * b - (q.dot(q) - R * R) > 0) lit++;
  }
  if (!total) return 0;
  return clamp((lit / total) * 4.2, 0, 1) * clamp((seen / total) * 1.5, 0, 1);
}

// The angles the poster is built around: the eye this far over the ring's lit
// face (an open, graceful ellipse) and the sun this far over the plane (a long
// wedge of globe-shadow across the sheet, and a band of ring-shadow laid across
// the globe).
const CAM_ELEV = 26.5 * Math.PI / 180;
const SUN_ELEV = 14 * Math.PI / 180;
// How many planes the search walks: one pole to each, spread evenly over a
// hemisphere (a plane and its flip are one sheet).
const PLANES = 1344;

/**
 * The ring's plane, chosen for the runner first: every plane is walked, and
 * each is scored on the arch it draws in his own frame (runnerView), read
 * against the best arch any plane gives this week's own ground — some landings
 * cannot arch as high as others, and the one that arches best is still the one
 * to stand under — then on the sun low over the sheet (the poster's long wedge
 * of globe-shadow) and on his seeing the face the sun is behind, where the
 * dense mass goes dark and the thin of the sheet glows. The poster then finds
 * its own eye on the lit face (posterEye). `ringTilt` blends the winner back
 * toward the course's own fitted plane, exactly as the splits ring's dial does.
 */
function saturnAxis(T, { course, cam, light, tilt, inner, outer, R }) {
  const n = new T.Vector3(), best = new T.Vector3();
  const perp = new T.Vector3(), side = new T.Vector3();
  const win = { ucov: 0, cols: 0, fill: 0, slant: 0, arc: 0 };
  const lands = new Float32Array(PLANES), rests = new Float32Array(PLANES);
  const pole = (k) => {
    const y = 1 - (k + 0.5) / PLANES, r = Math.sqrt(1 - y * y), a = k * Math.PI * (3 - Math.sqrt(5));
    return n.set(Math.cos(a) * r, y, Math.sin(a) * r);
  };
  let top = 0;
  for (let k = 0; k < PLANES; k++) {
    pole(k);
    perp.set(Math.abs(n.y) > 0.9 ? 1 : 0, Math.abs(n.y) > 0.9 ? 0 : 1, 0).cross(n).normalize();
    side.crossVectors(n, perp);
    lands[k] = landingScore(runnerView({ n, cam, inner, outer, R, perp, side, out: win }));
    top = Math.max(top, lands[k]);
    // the sun low over the sheet, never so high that its wedge is a nick, and
    // the runner under the face it is behind
    const sunEl = Math.asin(Math.min(1, Math.abs(n.dot(light))));
    const sunTerm = Math.max(0, 1 - Math.abs(sunEl - SUN_ELEV) / (13 * Math.PI / 180));
    const unlit = Math.sign(n.dot(light)) !== Math.sign(n.dot(cam.eye)) ? 1 : 0;
    rests[k] = (sunEl > 30 * Math.PI / 180 ? 0.80 : 1) * (0.15 * sunTerm + 0.15 * unlit);
  }
  // a runner's sky with no ring arching in it is the one thing the rest cannot
  // buy back
  let bestScore = -Infinity, bestK = 0;
  for (let k = 0; k < PLANES; k++) {
    const land = lands[k] / Math.max(top, 0.25);
    const score = (land < 0.15 ? 0.60 : 1) * (0.70 * land + rests[k]);
    if (score > bestScore + 1e-9) { bestScore = score; bestK = k; }
  }
  best.copy(pole(bestK));
  const t = clamp(Number(tilt), 0, 1);
  if (t < 1) best.multiplyScalar(t).addScaledVector(course, 1 - t);
  return best.lengthSq() > 1e-12 ? best.normalize() : course.clone();
}

/**
 * The poster's own eye, for a plane chosen for the runner: on the face the sun
 * lights, 22 to 31 degrees over the sheet (neither the line of an edge-on ring
 * nor the halo of a face-on one), turned round the pole no further from the
 * sun than leaves the globe three quarters lit, where the ellipse lies across
 * the still on a diagonal rather than standing on end (the world's own up is
 * the still's, and a diagonal ring is also the one that leaves the globe
 * largest in the hero's fit), with the globe's shadow across the arc the eye
 * sees, and as near base.js's own eye as all that allows.
 */
function posterEye(T, { n, light, base, R, inner, outer }) {
  const up = n.clone();
  if (up.dot(light) < 0) up.negate();
  const a1 = light.clone().addScaledVector(up, -light.dot(up));
  if (a1.lengthSq() < 1e-8) a1.set(Math.abs(up.y) > 0.9 ? 1 : 0, Math.abs(up.y) > 0.9 ? 0 : 1, 0).cross(up);
  a1.normalize();
  const a2 = new T.Vector3().crossVectors(up, a1);
  const v = new T.Vector3(), best = base.clone();
  const wUp = new T.Vector3(), rgt = new T.Vector3(), ln = new T.Vector3();
  let bestScore = -Infinity;
  for (let ei = 0; ei < 4; ei++) {
    const e = (22 + 3 * ei) * Math.PI / 180;
    for (let ai = -14; ai <= 14; ai++) {
      const az = ai * 5 * Math.PI / 180;
      v.copy(up).multiplyScalar(Math.sin(e))
        .addScaledVector(a1, Math.cos(e) * Math.cos(az))
        .addScaledVector(a2, Math.cos(e) * Math.sin(az))
        .normalize();
      // base.js holds a poster's pitch inside 1.35 radians
      if (Math.abs(v.y) > 0.95) continue;
      const lit = sstep(0.30, 0.80, v.dot(light));
      wUp.set(0, 1, 0).addScaledVector(v, -v.y).normalize();
      rgt.crossVectors(v, wUp).normalize();
      ln.crossVectors(v, up).normalize();
      const lean = (180 / Math.PI) * Math.atan2(Math.abs(ln.dot(wUp)), Math.abs(ln.dot(rgt)));
      const grace = Math.max(0, 1 - Math.abs(lean - 32) / 30);
      const shadow = posterShadow(T, { n: up, camera: v, light, R, inner, outer });
      const open = 1 - Math.abs(e - CAM_ELEV) / (6 * Math.PI / 180);
      const score = 0.40 * lit + 0.30 * grace + 0.15 * shadow + 0.10 * (0.5 + 0.5 * v.dot(base)) + 0.05 * open;
      if (score > bestScore) { bestScore = score; best.copy(v); }
    }
  }
  return best;
}

/** What to hand base.js for an eye: its yaw, and its pitch less the lift base.js
 *  adds to a race week's poster (see posterAxis). */
function aimFor(T, eye, lift) {
  const yaw = Math.atan2(eye.z, eye.x);
  const pitch = Math.asin(clamp(eye.y, -1, 1)) - lift;
  return new T.Vector3(Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw));
}

/* ---------------------------------------------------------------- banding -- */

// The colour classes a ringlet can be drawn in: the palette's own grey, cream,
// ochre, a faint rose, and the palest of the paper. Adjacent ringlets are not
// neighbours on a walk — a grey ringlet beside a cream one beside an ochre one
// is what a real ring's own colour variation looks like.
const CLASS = { GREY: 0, CREAM: 1, OCHRE: 2, ROSE: 3, PALE: 4 };

/** The class a ringlet of this split is drawn in: the crepe is grey, the mass
 *  cream and ochre, and the outer third keeps a few ringlets of faint rose. */
function rollClass(rng, t, force) {
  if (force != null) return force;
  const r = rng();
  const crepe = 1 - sstep(0.08, 0.30, t);          // the thin margin the week began in
  const drift = sstep(0.84, 0.96, t);              // the fringe it ran out into
  const rose = sstep(0.40, 0.62, t) * (1 - sstep(0.78, 0.96, t));
  const light = clamp(crepe + drift, 0, 1);
  const grey = 0.34 + 0.40 * crepe;
  if (r < grey) return CLASS.GREY;
  if (r < grey + 0.34 * light) return CLASS.CREAM;
  if (r < 0.90 - 0.10 * rose) return CLASS.OCHRE;
  if (r < 0.97) return rose > 0.30 ? CLASS.ROSE : CLASS.OCHRE;
  return CLASS.PALE;
}

/**
 * The race's own banding, laid out as a ring system. The splits run from the
 * inner margin to the finish line; each is a group of ringlets (a fast split is
 * a comb), the group's own mass follows the week's shape — a thin crepe while
 * it was fresh, its heaviest miles after the half — and at the halfway split
 * the banding stops for the Cassini-style division, at the split that hurt most
 * for the narrower Encke-style gap. Beyond the finish line the week's own drift
 * is left as a dust fringe.
 */
function laceFrom(T, { features, race, stats, seed }) {
  const rng = features.makeRng(`companion-saturn/${seed.toFixed(2)}`);
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
  const bands = clamp(Number(P['companions.ringBands']), 0, 1);
  // How fine the race's own banding is drawn. A ringlet has to be a brush's
  // width on the poster, not a hairline: at the ring's own reach the band is
  // some 95 poster pixels deep, so the whole race is carried in two or three
  // dozen ringlets — one to a mile of the marathon — and never in a hundred.
  const splits = clamp(Math.round(3 + Math.sqrt(Math.max(km, laps, 8)) * 1.6 * (0.35 + 0.65 * bands)), 6, 14);

  // What each split asked of the race. Where the record kept the race's own
  // splits (forms.js) each band is the mean pace of the splits it gathers;
  // where it kept none, the course's own gradient read against the course's own
  // average slope, the week's fatigue over the distance it ran, and the week's
  // own seed for the day each split had.
  const real = realSplits(stats);
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

  // The ring's own width: a soft margin at the inner edge (so the geometry's
  // own edge is never a cut), the race's banding, the division the half cuts,
  // the gap the wall cuts, the finish line's own hair, then the drift.
  const MARGIN = 0.030;
  const TOP = 0.838;
  const DIV_HALF = 0.060;
  const DIV_WALL = 0.024;
  const F_LINE = 0.856;
  const F_WIDE = 0.030;
  const DUST0 = 0.900;
  const half = Math.floor(splits / 2);
  const wallGap = slowest !== half ? DIV_WALL : 0;
  const span = TOP - MARGIN - DIV_HALF - wallGap;

  const wob = new Float64Array(splits);
  let wobTotal = 0;
  for (let i = 0; i < splits; i++) { wob[i] = 0.80 + 0.40 * rng(); wobTotal += wob[i]; }
  const groups = Math.max(1, Math.round(splits / 4));
  const groupLoad = new Float64Array(groups);
  for (let i = 0; i < groups; i++) groupLoad[i] = 0.62 + 0.68 * rng();

  // The shoulder: the ring is a crepe where the week began, its mass through
  // the miles it ran, and a pale fringe where the week ran out.
  const shoulder = (t) => 0.40
    + 0.72 * sstep(0.02, 0.22, t)
    + 0.16 * sstep(0.40, 0.56, t)
    - 0.34 * sstep(0.88, 1.0, t);

  // The band the ringlets are laid on: one wide glaze from the inner margin to
  // the finish, pale enough that a lane between two ringlets is a thin wash on
  // paper and never bare sky, and weak enough that a division still cuts it.
  const plan = [{
    u0: MARGIN, u1: TOP, load: 0.30, cls: CLASS.CREAM, phase: rng(), dust: 0.30,
  }];
  const divs = [];
  let cursor = MARGIN;
  for (let i = 0; i < splits; i++) {
    const t = (i + 0.5) / splits;
    const slice = (span * wob[i]) / wobTotal;
    const room = slice * 0.97;
    const strokes = 1 + Math.round(0.9 * pace[i]);          // a fast split is a comb
    const load = clamp(shoulder(t) * (0.55 + 0.65 * pace[i]) * groupLoad[Math.floor(i / 4) % groups], 0.22, 1.0);
    // the rose the outer third keeps: one ringlet of a few of its splits, so
    // the hue is a fact of the race and not of the dice alone
    const roseSplit = sstep(0.42, 0.58, t) > 0.5 && rng() < 0.42;
    const roseStroke = roseSplit ? Math.floor(rng() * strokes) : -1;
    // the ringlets of a split sit shoulder to shoulder: what shows between two
    // of them is the lane of paper a brush leaves, not a hole in the band. The
    // widths and loads are drawn wide, so a fat dark ringlet lies beside a
    // hairline and a pale lane — a comb of even strokes is what makes a ring
    // read as blinds from underneath.
    const unit = room / (strokes + 0.62 * (strokes - 1));
    let inner = cursor;
    for (let j = 0; j < strokes; j++) {
      const w = unit * (0.42 + 1.25 * Math.pow(rng(), 1.5));
      plan.push({
        u0: inner,
        u1: Math.min(inner + w, TOP),
        load: clamp(load * (j === 0 ? 1.0 : 0.35 + 0.95 * rng()), 0, 1),
        cls: rollClass(rng, t, j === roseStroke ? CLASS.ROSE : null),
        phase: rng(),
        dust: clamp(0.10 + 0.85 * rng() - 0.45 * load, 0, 1),
      });
      inner += w + unit * 0.62;
    }
    cursor += slice;
    if (i === half) {
      divs.push({ u0: cursor, u1: cursor + DIV_HALF, kind: 'cassini', depth: 0.92 });
      cursor += DIV_HALF;
    } else if (i === slowest && wallGap) {
      divs.push({ u0: cursor, u1: cursor + DIV_WALL, kind: 'encke', depth: 0.80 });
      cursor += DIV_WALL;
    }
  }

  // The finish line: the race line's own vermilion, one bright hair just outside
  // the mass, and the two shepherds' rims the division keeps.
  plan.push({ u0: F_LINE, u1: F_LINE + F_WIDE, load: 0.98, cls: CLASS.CREAM, phase: rng(), dust: 0.06, verm: 1 });

  // …and beyond it the drift the ring never gathered, fading into the haze the
  // dust dial takes away.
  const dust = clamp(Number(P['companions.ringDust']), 0, 1);
  const flecks = 26;
  for (let i = 0; i < flecks; i++) {
    const t = i / (flecks - 1);
    const u0 = DUST0 + (1 - DUST0) * t;
    const w = ((1 - DUST0) / (flecks - 1)) * (0.34 + 0.62 * rng());
    const fade = 1 - Math.pow(t, 2.4);
    plan.push({
      u0,
      u1: Math.min(u0 + w, 0.9995),
      load: (0.34 + 0.42 * rng()) * fade * (0.34 + 0.66 * dust),
      cls: rng() < 0.6 ? CLASS.PALE : CLASS.GREY,
      phase: rng(),
      dust: 0.75 + 0.25 * rng(),
    });
  }

  // The shepherds: one in the wall's own gap (the Pan of the week, clearing its
  // lane), one at each edge of the half's division, one outside the finish line.
  const wallDiv = divs.find((d) => d.kind === 'encke');
  const halfDiv = divs.find((d) => d.kind === 'cassini');
  const moonlets = [];
  if (wallDiv) moonlets.push({ u: (wallDiv.u0 + wallDiv.u1) * 0.5, ang: rng() * TAU, size: 1.75, wake: 0.9, rate: 0.022 + 0.02 * rng() });
  if (halfDiv) {
    moonlets.push({ u: halfDiv.u0 - 0.004, ang: rng() * TAU, size: 1.25, wake: 0.55, rate: 0.018 + 0.02 * rng() });
    moonlets.push({ u: halfDiv.u1 + 0.004, ang: rng() * TAU, size: 1.05, wake: 0.45, rate: 0.016 + 0.02 * rng() });
  }
  moonlets.push({ u: F_LINE + 0.006, ang: rng() * TAU, size: 1.15, wake: 0.0, rate: 0.012 + 0.02 * rng() });

  return { plan, divs, moonlets, splits, pace, cost, slowest, half, km, laps, fatigue, F_LINE, F_EDGE: F_LINE + F_WIDE, DUST0 };
}

/**
 * The band table itself. Each ringlet is stamped into one row of texels as the
 * load a brush would leave across its width — squared at both edges, a hair
 * paler through the middle — and the rows under it are the same profile
 * averaged over a growing radius, so minification reads the mean and never an
 * alias. R is the load, G the ringlet's own class on the palette's walk from
 * grey through cream and ochre to faint rose, B the phase the hand is drawn
 * with, A how dusty the ringlet is (what the glow of a backlit sheet reads).
 */
function buildBands(plan) {
  const sharp = new Float32Array(TABLE * 4);
  for (const band of plan) {
    const a = Math.max(0, Math.floor(band.u0 * TABLE));
    const b = Math.min(TABLE - 1, Math.ceil(band.u1 * TABLE));
    const width = Math.max(1e-6, band.u1 - band.u0);
    for (let i = a; i <= b; i++) {
      const x = ((i + 0.5) / TABLE - band.u0) / width;
      if (x < 0 || x > 1) continue;
      const taper = Math.min(1, x / 0.12, (1 - x) / 0.12);
      const edges = 0.60 + 0.40 * (1 - Math.sin(Math.PI * x));
      const load = band.load * edges * taper;
      const k = i * 4;
      if (load > sharp[k]) {
        sharp[k] = load;
        sharp[k + 1] = band.cls / 4;
        sharp[k + 2] = band.phase;
        sharp[k + 3] = band.dust;
      }
    }
  }

  const data = new Uint8Array(TABLE * ROWS * 4);
  const mean = new Float32Array(TABLE * 4);
  for (let r = 0; r < ROWS; r++) {
    const radius = r === 0 ? 0 : ROW0 * Math.pow(2, r - 1);
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0, count = 0;
    for (let i = -radius; i <= radius; i++) {
      const k = clamp(i, 0, TABLE - 1) * 4;
      s0 += sharp[k]; s1 += sharp[k + 1]; s2 += sharp[k + 2]; s3 += sharp[k + 3];
      count++;
    }
    for (let i = 0; i < TABLE; i++) {
      const base = i * 4;
      const row = (r * TABLE + i) * 4;
      mean[base] = s0 / count;
      mean[base + 1] = s1 / count;
      mean[base + 2] = s2 / count;
      mean[base + 3] = s3 / count;
      data[row] = Math.round(clamp(mean[base], 0, 1) * 255);
      data[row + 1] = Math.round(clamp(mean[base + 1], 0, 1) * 255);
      data[row + 2] = Math.round(clamp(mean[base + 2], 0, 1) * 255);
      data[row + 3] = Math.round(clamp(mean[base + 3], 0, 1) * 255);
      const out = clamp(i - radius, 0, TABLE - 1) * 4, inb = clamp(i + radius + 1, 0, TABLE - 1) * 4;
      s0 += sharp[inb] - sharp[out];
      s1 += sharp[inb + 1] - sharp[out + 1];
      s2 += sharp[inb + 2] - sharp[out + 2];
      s3 += sharp[inb + 3] - sharp[out + 3];
    }
  }
  return data;
}

/**
 * The marks: the facts about the ring that have to stay sharp while the
 * banding blurs — a division's own floor, the two bright hairlines a division
 * keeps along its edges, the finish line's vermilion, and the shepherds' own
 * lanes. One row, read at the fragment's own place in the ring's width.
 */
function buildMarks(divs, finish, plan) {
  const data = new Uint8Array(TABLE * 4);
  const HAIR = 0.0017;
  for (let i = 0; i < TABLE; i++) {
    const u = (i + 0.5) / TABLE;
    let div = 0, rim = 0, hair = 0, verm = 0;
    for (const d of divs) {
      const w = Math.max(1e-6, d.u1 - d.u0);
      if (u > d.u0 - 0.04 && u < d.u1 + 0.04) {
        const x = (u - d.u0) / w;
        const floor = x <= 0 || x >= 1 ? 0 : Math.min(1, Math.min(x, 1 - x) / 0.16);
        div = Math.max(div, floor * d.depth);
        const hin = Math.exp(-Math.pow((u - d.u0) / (HAIR * 1.15), 2));
        const hout = Math.exp(-Math.pow((u - d.u1) / (HAIR * 1.15), 2));
        rim = Math.max(rim, Math.max(hin, hout));
      }
    }
    for (const band of plan) {
      // the finish line's own vermilion, and the hair of every bright ringlet
      // the race leaves: the line itself, and the last ringlet inside a gap
      if (band.verm) {
        if (u > band.u0 - 0.004 && u < band.u1 + 0.004) {
          const x = clamp((u - band.u0) / Math.max(1e-6, band.u1 - band.u0), 0, 1);
          verm = Math.max(verm, 0.35 + 0.65 * Math.sin(Math.PI * x));
        }
        hair = Math.max(hair, verm);
      }
    }
    if (hair < rim) hair = rim;
    const k = i * 4;
    data[k] = Math.round(clamp(div, 0, 1) * 255);
    data[k + 1] = Math.round(clamp(rim, 0, 1) * 255);
    data[k + 2] = 0;
    data[k + 3] = Math.round(clamp(verm, 0, 1) * 255);
  }
  return data;
}

/* ------------------------------------------------------------------- glsl -- */

// The ring's own hand: a value noise and a cell hash from the same three
// constants the rest of the ink shaders are drawn with, so nothing here draws a
// pattern the rest of the sheet would not.
const SATURN_NOISE = /* glsl */ `
float sgHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float sgNoise(vec2 x) {
  vec2 i = floor(x);
  vec2 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float a = sgHash(vec3(i, 0.0));
  float b = sgHash(vec3(i + vec2(1.0, 0.0), 0.0));
  float c = sgHash(vec3(i + vec2(0.0, 1.0), 0.0));
  float d = sgHash(vec3(i + vec2(1.0, 1.0), 0.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

// The band table, read at the level the fragment's own footprint needs: the two
// rows that bracket it, mixed. Every lookup in this module goes through here —
// the sheet itself and the shadow it throws across the globe — so the shadow is
// banded by the very ringlets that cast it, and a division stays a division at
// every scale.
const SATURN_LACE = /* glsl */ `
uniform sampler2D tBands, tMarks;
uniform float uTable, uRows;
vec4 sgLace(float u, float du) {
  float hw = max(du * uTable * 0.5, 0.5);
  float lvl = hw <= float(${ROW0}) ? 0.0 : 1.0 + log2(hw / float(${ROW0}));
  lvl = clamp(lvl, 0.0, uRows - 1.0);
  float i0 = floor(lvl);
  float i1 = min(i0 + 1.0, uRows - 1.0);
  float uu = clamp(u, 0.0, 1.0);
  vec4 a = texture2D(tBands, vec2(uu, (i0 + 0.5) / uRows));
  vec4 b = texture2D(tBands, vec2(uu, (i1 + 0.5) / uRows));
  return mix(a, b, lvl - i0);
}
vec4 sgMark(float u) {
  return texture2D(tMarks, vec2(clamp(u, 0.0, 1.0), 0.5));
}
`;

const SATURN_VERT = /* glsl */ `
varying vec2 vPlane;
varying vec3 vWorld;
varying vec3 vNrm;
void main() {
  vPlane = position.xy;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNrm = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SATURN_FRAG = /* glsl */ `
${SATURN_NOISE}
${SATURN_LACE}
varying vec2 vPlane;
varying vec3 vWorld;
varying vec3 vNrm;
uniform vec3 uSunDir, uPaper, uInk, uCool, uVerm;
uniform vec3 uGrey, uCream, uOchre, uRose, uPale, uGlow, uHair;
uniform float uIn, uSpan, uOut, uHazeOut;
uniform float uR, uSea, uTime, uSeed;
uniform float uLoad, uBreak, uGrain, uShadow, uDust, uGlowAmt, uMass;
uniform vec4 uMoon[4];
uniform vec2 uCass;

// The palette's own walk, as five stops a ringlet is dropped on: the greys the
// crepe is drawn in, the cream and ochre of the mass, the faint rose the outer
// third keeps, and the paper itself for the brightest hairs.
vec3 sgTint(float t) {
  vec3 c = uGrey;
  c = mix(c, uCream, smoothstep(0.08, 0.20, t));
  c = mix(c, uOchre, smoothstep(0.33, 0.45, t));
  c = mix(c, uRose, smoothstep(0.58, 0.70, t));
  c = mix(c, uPale, smoothstep(0.83, 0.95, t));
  return c;
}

void main() {
  vec3 N = normalize(vNrm);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 L = normalize(uSunDir);
  float r = length(vPlane);
  float uBand = (r - uIn) / uSpan;
  float du = max(fwidth(uBand), 1e-6);
  float ang = atan(vPlane.y, vPlane.x);
  vec2 orb = vec2(cos(ang), sin(ang));
  // How far the eye is down out of the poster's orbit and into the runner's
  // sky: 0 at the poster's distance, 1 underfoot (see the underfoot wash below).
  float nearK = 1.0 - smoothstep(1.7 * uR, 3.0 * uR, length(cameraPosition));

  // ---- the hand. The radius the bands are read at is not the radius they were
  // ruled at: it wanders with the ring's own angle, more at both edges than
  // through the body, so a band's edge is a brush's edge and the rim is not a
  // circle struck about the planet. Three scales of it, because the same ring is
  // seen at two.
  float w1 = sgNoise(orb * 3.1 + uSeed * 0.7) - 0.5;
  float w2 = sgNoise(orb * 11.0 + uSeed * 1.7 + 13.0) - 0.5;
  float w3 = sgNoise(vec2(uBand * 34.0, 0.0) + orb * 22.0 + uSeed) - 0.5;
  float rim = smoothstep(0.24, 1.0, abs(uBand * 2.0 - 1.0));
  float uu = uBand + uBreak * ((0.30 + 1.10 * rim) * (0.55 * w1 + 0.30 * w2) + 0.26 * w3);

  // ---- the shepherds' own wakes: the lanes they clear ripple the banding
  // beside them, and turn with the clock as they go round.
  float wake = 0.0;
  for (int i = 0; i < 4; i++) {
    float mw = uMoon[i].w;
    if (mw < 0.001) continue;
    float da = ang - uMoon[i].y;
    da = atan(sin(da), cos(da));
    float dr = uu - uMoon[i].x;
    float w = exp(-(da * da) / (uMoon[i].z * uMoon[i].z)) * exp(-(dr * dr) / 0.00022);
    wake += w * mw;
    uu += w * mw * 0.010 * sin(da * 11.0 + uSeed * 5.0);
  }
  wake = clamp(wake, 0.0, 1.0);

  vec4 band = sgLace(uu, du);
  vec4 mark = sgMark(uu);
  float inside = 1.0 - smoothstep(0.994, 1.0, uBand);
  // companions.ringMass (uMass): from orbit the ringlets are read through a broad
  // mean of the band table, so the ring is first one immense sheet — its mass, a
  // few divisions, the finish — and its trim second; a quarter of the ringlets'
  // own grain is kept. Underfoot the sheet is painted as it always was.
  float kM = uMass * (1.0 - nearK);
  if (kM > 0.0) band = mix(band, sgLace(uu, max(du, 0.035)), 0.75 * kM);
  float load = band.r * inside;

  // ---- the spokes: the radial wisps the sheet's own dust throws up over the
  // outer mass, sheared with the radius the way a Keplerian ring shears them,
  // and longer lived than the clock of any one poster.
  float spoke = 0.0;
  float rho = (uIn + uSpan * clamp(uBand, 0.0, 1.0)) / uR;
  float th = ang + uTime * 0.06 * pow(max(rho, 0.3), -1.5);
  float gate = smoothstep(0.12, 0.19, uBand) * (1.0 - smoothstep(0.46, 0.58, uBand));
  float coarse = sgNoise(vec2(th * 7.0, uBand * 1.5 + uSeed * 3.0));
  float fine = sgNoise(vec2(th * 29.0, uBand * 9.0 + 5.0));
  // underfoot a spoke is a wisp hundreds of units long laid down the band, which
  // reads as a scratch, so the runner's sky keeps none
  spoke = smoothstep(0.44, 0.74, coarse * 0.62 + fine * 0.38) * gate * (1.0 - nearK) * (1.0 - 0.75 * kM);
  load *= 1.0 - 0.42 * spoke;

  // ---- the divisions. A division is a gap in the banding itself, and the two
  // bright hairlines it leaves along its edges are the mark that survives every
  // scale: this is the race's own half, cut open.
  float div = mark.r;
  float hair = mark.g;
  float verm = mark.a;
  // the ringlet's own place on the palette's walk, wandered a little by the
  // hand that drew it and again along the circumference — a ring ruled in one
  // colour all the way round is a decoration, not a wash
  float walk = clamp(band.g + (band.b - 0.5) * 0.10
    + (sgNoise(vec2(ang * 3.4 + band.b * 12.0, uBand * 7.0)) - 0.5) * 0.12, 0.0, 1.0);
  vec3 pig = sgTint(walk);
  pig = mix(pig, uVerm, verm);
  pig = mix(pig, uHair, hair * 0.75 * (1.0 - 0.70 * kM));
  load = load * (1.0 - 0.94 * div) + hair * 0.32 * (1.0 - 0.70 * kM) + wake * 0.12;
  load = clamp(load, 0.0, 1.6);

  // ---- the light. A ring is a sheet of grains: the sun's own elevation over
  // its plane is what it catches, and the face turned away is the sheet seen
  // through, lit only by the light its own grains throw forward.
  float sunEl = dot(N, L);
  float eyeSide = dot(N, V);
  float litFace = sunEl * eyeSide;
  float face = smoothstep(-0.03, 0.03, litFace);
  // a sheet of grains held up to a low sun still catches it: the ring dims
  // toward the plane's own edge, it does not go out
  float illum = mix(0.44, 1.0, smoothstep(0.03, 0.34, abs(sunEl)));

  // The wash: the palette's own glazed wash, the ringlet's own class walked
  // through it. The scale the ring is read at decides how deep it is laid — a
  // poster pixel covers a dozen ringlets, and a mean laid at one ringlet's own
  // depth leaves a film of bare paper between the strokes.
  float deep = clamp(load * uLoad, 0.0, 2.4);
  float scan = smoothstep(0.0035, 0.022, du) * (1.0 - smoothstep(0.02, 0.10, du));
  deep = clamp(deep * mix(1.0, 2.4, scan * inside) * mix(1.0, 0.55, kM), 0.0, 2.6);
  vec3 ratio = pig / max(uPaper, vec3(0.03));
  vec3 col = uPaper * pow(max(ratio, vec3(0.035)), vec3(deep));
  col *= mix(0.52, 1.0, illum);
  // (ringMass: the dense mass is the sheet that catches the most light, a pale
  // cream where it is loaded; the thin of it keeps the pigment's own warmth)
  col = mix(col, mix(uCream, uPaper, 0.30) * mix(0.52, 1.0, illum), kM * 0.35 * smoothstep(0.35, 0.85, load));
  // the finish line is the one mark the race leaves in the week's own vermilion
  // rather than in a glaze of the paper — and it stays that vermilion on the
  // face turned away from the sun, where a washed ringlet would go to shade
  col = mix(col, uVerm * 1.06, verm * 0.62);

  // ---- dry brush: where the sheet's own tooth is high the wash broke and the
  // paper shows through, which is what breaks a band's edge into a stroke. The
  // tooth is read in the sheet's own plane at the fragment's own footprint: a
  // grain ruled in fixed world units is sub-pixel on the poster and a field of
  // streaks from underneath, where one axis of the footprint is ten times the
  // other.
  float fp = max(fwidth(vPlane.x), fwidth(vPlane.y));
  float tooth = sgNoise(vPlane * (0.26 / max(fp, 1e-4)) + uSeed) * 0.62
    + sgNoise(vPlane * (0.62 / max(fp, 1e-4)) + 11.0 + uSeed) * 0.38;
  float dry = smoothstep(0.54, 0.90, tooth) * uGrain * smoothstep(0.03, 0.28, load) * (1.0 - nearK);

  // ---- the globe's own shadow, cut across the sheet: the ray from this
  // ringlet toward the sun, met against the sphere. b < 0 puts the sun ahead of
  // the fragment and the discriminant is the ray's own depth into the sphere,
  // so the umbra is exactly where the planet stands between the sheet and the
  // sun. The sphere's own radius wanders a hair with the sheet's own hand, so
  // the edge of the shadow is a brush's edge and not a printed arc.
  float Rs = (uR + uSea) * (1.0 + 0.011 * (sgNoise(orb * 2.6 + uSeed) - 0.5));
  float b = dot(vWorld, L);
  float hit = b * b - (dot(vWorld, vWorld) - Rs * Rs);
  float pw = max(fwidth(hit) * 0.9, Rs * 0.012);
  // only matter casts a shadow and only matter is shadowed: past the last ringlet
  // the drift thins to a veil, and a wedge laid on a veil is a grey halo on the
  // paper — the mark Fable read as a rectangle pasted over the picture
  float matter = 1.0 - smoothstep(0.86, 1.02, uBand);
  float shadow = (b < 0.0 ? smoothstep(-pw, pw, hit) : 0.0) * uShadow * matter;

  // the face turned away from the sun: the sheet's own shade, cooled — the
  // wash keeps the weight the ringlet was laid at, so the banding still reads
  // where the sun is behind the sheet and every ringlet would otherwise go to
  // one flat grey
  vec3 shade = mix(col, uCool, 0.42) * 0.60;
  col = mix(col, shade, 1.0 - face);
  col = mix(col, col * 0.44 + uCool * 0.03, shadow * (1.0 - 0.72 * verm));

  // ---- the forward scatter. Seen from the unlit face with the sun behind it,
  // the sheet is light coming through: the grains throw the light on toward the
  // eye, dusty ringlets glow and the dense ice stays dark, and the globe's own
  // shadow takes the glow out of the wedge behind it. This is the whole reason
  // a ring read from underneath is worth painting.
  float dust = clamp(band.a * 0.8 + (1.0 - min(load, 1.0)) * 0.40, 0.0, 1.0);
  float fwd = pow(clamp(-dot(L, V), 0.0, 1.0), 2.4);
  float glow = fwd * (1.0 - face) * (1.0 - shadow) * (0.26 + 0.92 * dust) * (0.42 + 0.88 * illum);
  glow *= uGlowAmt * (1.0 + 1.4 * spoke);
  glow = clamp(glow, 0.0, 1.0);

  // ---- the E ring: the haze the week's own drift feeds, beyond the last
  // ringlet — soft, wide, and lit through the same way the sheet is
  float hazeT = (r - uOut) / max(1e-3, uHazeOut - uOut);
  float haze = 0.0;
  if (hazeT > 0.0 && hazeT < 1.0 && uDust > 0.01) {
    float hn = sgNoise(vec2(ang * 2.6 + uSeed, r * 0.08)) * 0.62
      + sgNoise(vec2(ang * 9.4 + 3.0, r * 0.26)) * 0.38;
    haze = pow(1.0 - hazeT, 1.9) * (0.10 + 0.30 * hn) * (0.30 + 0.70 * uDust) * mix(1.0, 0.35, kM);
    haze *= mix(0.42, 1.0, illum) * (1.0 - 0.85 * shadow);
    haze *= mix(1.0, 2.2, face);
  }
  glow += haze * mix(0.35, 1.25, 1.0 - face);

  // ---- the wash's own coverage: a ringlet is laid whole — the paper shows
  // through a pale wash, not through a thin one — while the haze and the drift
  // outside the last ringlet stay veils.
  float cover = clamp(pow(clamp(load, 0.0, 1.0), 0.38) * 1.12, 0.0, 1.0) * (1.0 - dry);
  // (ringMass: the coverage is the sheet's own optical depth along the eye's
  // slant: the dense mass opaque, the dusty bands and the crepe let the sky through)
  float tau = load * 2.6 * (1.0 - 0.45 * band.a);
  cover = mix(cover, (1.0 - exp(-tau / max(abs(eyeSide), 0.12))) * (1.0 - dry), kM);
  cover = clamp(cover * inside + haze, 0.0, 1.6);
  // the glow rides the dust, not the ice: a dense ringlet is opaque to its own
  // forward scatter, so the banding survives being backlit and the band does
  // not go to one flat warm field the moment the sun is behind it
  float lit = glow * (1.0 - 0.62 * clamp(load, 0.0, 1.0));
  col = mix(col, mix(uGlow, uCream, 0.30), lit * 0.92);
  cover = clamp(cover + lit * 0.45, 0.0, 1.0);

  // ---- the grains in the drift that catch the light for a moment as the
  // ring's own slow turn carries them
  float fringe = smoothstep(0.86, 1.0, uBand) * inside;
  if (fringe > 0.01 && uDust > 0.01) {
    float cells = 1800.0;
    float id = floor((ang / 6.2831853 + 0.5) * cells);
    float h1 = sgHash(vec3(id, 1.0, uSeed));
    float h2 = sgHash(vec3(id, 2.0, uSeed * 1.3));
    float rad = 0.88 + 0.11 * h1;
    float grain = 1.0 - smoothstep(0.0, 0.020, abs(uBand - rad));
    float blink = 0.30 + 0.70 * (0.5 + 0.5 * sin(uTime * (0.5 + 2.2 * h2) + h2 * 57.0));
    float glint = grain * smoothstep(0.55, 1.0, h1) * blink * uDust * fringe * (1.0 - 0.60 * kM);
    cover = clamp(cover + glint * 0.75, 0.0, 1.0);
    col = mix(col, mix(uPaper, uCream, 0.4), min(1.0, glint) * 0.55);
  }
  // ---- underfoot. The sheet the runner reads is hundreds of units across and
  // he stands under its inner edge, so it is not the poster's sheet seen
  // closer. The race's banding is laid as the sheet's own density — a band of
  // it thicker or thinner, never a bar with sky either side — the finest
  // ringlets come in only where the footprint holds them, a lane lets the sky
  // through as it is thin and as steeply as it is seen (the same sheet is
  // opaque edge-on and open overhead), and the far side goes into the air the
  // horizon is painted in. The face he reads it from decides the light: the
  // sunlit face is the sun's own cream, the face turned away is dark where the
  // sheet is dense and lit through where it is thin, and the globe's shadow
  // takes the light out of both.
  if (nearK > 0.001) {
    float slant = max(abs(eyeSide), 0.07);
    // the race's banding laid the way the sky and the ground are: the splits
    // read a hand's width soft and cut into three washes with hand-cut edges —
    // the thin of the sheet, its body and its dense mass — so the eye takes in
    // the week's own shape (the crepe it began in, the heavy miles after the
    // half, the pale fringe it ran out into) as a few broad bands and not as a
    // fan of stripes. The footprint's own ringlets are kept as the grain inside
    // each wash, the finest of them let in only where the footprint holds them,
    // and the divisions keep their own sharp edges (the marks, below).
    vec4 soft = sgLace(uu, max(du, 0.022));
    vec4 crisp = sgLace(uu, du);
    float dens = clamp((soft.r - 0.16) / 0.46, 0.0, 1.0);
    float cut = 0.6 * fwidth(dens) + 0.012;
    float wash = 0.5 * (smoothstep(0.38 - cut, 0.38 + cut, dens) + smoothstep(0.70 - cut, 0.70 + cut, dens));
    float grain = clamp(crisp.r - soft.r, -0.5, 0.5)
      + (1.0 - smoothstep(0.10, 0.40, 60.0 * du)) * 0.45 * (sgNoise(vec2(uu * 60.0, 7.3 + uSeed)) - 0.5);
    // the half's own division cut wider than the poster's: from underneath it
    // has to read as the gap the race opened, not as one more lane between
    // washes. The marks are read through a warp about its centre — the
    // division and its two bright rims spread twice as wide, the marks beside
    // them pressed back in — and the banding under the spread is cut away.
    float dc = uu - uCass.x;
    float adc = abs(dc);
    float spread = uCass.y * 2.0;
    float back = spread + 0.05;
    float wc = adc < spread ? adc * 0.5 : adc < back ? uCass.y + (adc - spread) * (back - uCass.y) / (back - spread) : adc;
    vec4 markN = sgMark(uCass.x + sign(dc) * wc);
    float divN = markN.r;
    float hairN = markN.g;
    float vermN = markN.a;
    // ...and its two rims drawn at the runner's own scale, a pixel or two wide
    // wherever the gap is: the bright edges of the sheet either side of it
    float rimN = step(0.001, uCass.y) * exp(-pow((adc - spread) / max(1.6 * du, 0.002), 2.0)) * inside;
    float tau = max((0.32 + 2.3 * wash * sqrt(wash)) * (1.0 + 0.55 * grain) * (1.0 - 0.97 * divN) * inside, 0.0);
    float te = tau / slant;
    float alpha = (1.0 - exp(-te)) * smoothstep(0.0, 1.5 * du, uBand);
    vec3 pigN = sgTint(clamp(soft.g + (soft.b - 0.5) * 0.10, 0.0, 1.0));
    // the sunlit face: the band's own class in the sun's light, paler where the
    // sheet is thin and the pigment's own where it is dense
    vec3 litC = mix(pigN, uPaper, 0.36 - 0.22 * wash + 0.10 * illum) * (1.0 + 0.25 * grain);
    // the face turned away is the sheet held up against its own light: the
    // dense mass stops it and keeps the cool dark of its own pigment, the way
    // the body of a cloud does with the sun behind it, while the thin of the
    // sheet, the lanes and the crepe let the light through and glow. Toward
    // the sun the glow reaches into the body of the band, never into its
    // densest wash, so the band reads as a volume with depth, dark against the
    // sky where it is thick and lit where it thins.
    float toward = pow(clamp(-dot(L, V), 0.0, 1.0), 2.0);
    vec3 under = mix(pigN * 0.82, uCool, 0.30 + 0.30 * wash) * mix(0.95, 0.55, wash) * (1.0 + 0.25 * grain);
    vec3 glowC = mix(uGlow, uPaper, 0.45);
    float thin = (1.0 - wash) * (1.0 - wash);
    float lift = clamp(thin * (0.55 + 0.45 * toward) + 0.45 * toward * toward * (1.0 - wash), 0.0, 1.0) * (1.0 - shadow);
    vec3 colN = mix(mix(under, glowC, lift), litC, face);
    alpha = max(alpha, 0.55 * toward * toward * inside * (1.0 - face) * (1.0 - shadow));
    // the ringlets that catch the light: a few fine bright hairs through the
    // band, there only where the footprint can hold a hair
    float hairs = smoothstep(0.66, 0.74, sgNoise(vec2(uu * 70.0, 41.0 + uSeed)))
      * (1.0 - smoothstep(0.15, 0.45, 70.0 * du)) * inside * (1.0 - shadow);
    colN = mix(colN, glowC, hairs * 0.55);
    alpha = max(alpha, hairs * 0.45);
    colN = mix(colN, mix(uCool, uInk, 0.35) * 0.82, shadow * 0.78);
    colN = mix(colN, uHair, max(hairN, rimN) * 0.75);
    alpha = max(alpha, max(hairN, rimN) * 0.65);
    colN = mix(colN, uVerm * 1.04, vermN * 0.85);
    alpha = max(alpha, vermN * 0.90);
    // the inner edge drawn: the one line of the ring a hand would ink, and the
    // line the arch is read by
    float edge = exp(-pow(uBand / max(2.2 * du, 1e-5), 2.0));
    colN = mix(colN, mix(uCool, uInk, 0.45), edge * 0.85);
    alpha = max(alpha, edge * 0.85);
    colN = mix(colN, mix(uGlow, uCream, 0.30), clamp(haze * 1.6, 0.0, 1.0) * (1.0 - inside));
    alpha = clamp(alpha + haze * 0.45, 0.0, 1.0);
    // the far side of the sheet is read through the air the horizon is
    float farK = smoothstep(1.8 * uR, 5.0 * uR, length(vWorld - cameraPosition));
    colN = mix(colN, mix(uPaper, uGlow, 0.25), farK * 0.40);
    alpha *= 1.0 - 0.45 * farK;
    // the division is a lane of sky: nothing the sheet throws forward fills it
    alpha *= 1.0 - 0.92 * divN * (1.0 - rimN);
    col = mix(col, colN, nearK);
    cover = mix(cover, alpha, nearK);
  }
  if (cover < 0.004) discard;
  // ---- the sheet's own depth. The ring is hundreds of units across and the
  // runner stands inside it: the far side of the band is read through the same
  // air the horizon is, and lifts toward the paper there. A wash laid at one
  // depth across a surface that recedes for two radii is what makes a ring read
  // as a plate lying in the sky instead of stripes cut into it. Read against
  // the eye's own distance: from orbit the whole frame sits at one depth and
  // this does nothing at all.
  float depth = length(vWorld - cameraPosition) / max(1e-3, length(cameraPosition)) - 1.0;
  float air = smoothstep(0.35, 1.15, depth) * (1.0 - nearK);
  col = mix(col, mix(col, uPaper, 0.45), air * 0.55);
  cover *= mix(1.0, 0.86, air);
  gl_FragColor = vec4(col, clamp(cover, 0.0, 1.0));
}
`;

const SATURN_SHELL_VERT = /* glsl */ `
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

// The rings' own shadow on the globe: a glaze riding just above the terrain,
// multiplied rather than laid over it. Where the ray from this patch of ground
// toward the sun leaves the ring's plane is where the light was stopped — and
// the ring's banding is read there, so the divisions the sheet is drawn with
// are the divisions that cross the ground, and the widest of them is a stripe
// of daylight through the dark.
const SATURN_SHELL_FRAG = /* glsl */ `
${SATURN_LACE}
varying vec3 vNrm;
varying vec3 vView;
varying vec3 vPos;
uniform vec3 uSunDir, uPaper, uSepia, uInk, uCool, uRingN;
uniform float uIn, uSpan, uOut, uHazeOut, uShadow;
void main() {
  vec3 N = normalize(vNrm);
  vec3 V = normalize(vView);
  vec3 L = normalize(uSunDir);
  float limb = smoothstep(0.0, 0.020, dot(N, V));
  float gate = smoothstep(0.06, 0.26, dot(N, L));
  if (limb * gate < 0.008) discard;
  float den = dot(L, uRingN);
  if (abs(den) < 1e-4) discard;                 // the sun in the ring's own plane
  float t = -dot(vPos, uRingN) / den;
  if (t <= 0.0) discard;                        // the ring is behind this ground
  vec3 q = vPos + L * t;
  float rho = length(q);
  float u = (rho - uIn) / uSpan;
  if (u < 0.0) discard;
  // the drift past the last ringlet has almost nothing to stop the light with,
  // but a band of it still crosses the ground where the mass no longer does
  float reach = 1.0 - clamp((rho - uOut) / max(1e-3, uHazeOut - uOut), 0.0, 1.0);
  if (reach <= 0.0) discard;
  vec4 band = sgLace(u, max(fwidth(u), 1.0 / 64.0));
  vec4 mark = sgMark(u);
  float amt = band.r * (1.0 - 0.45 * mark.r) * uShadow * (0.22 + 0.78 * reach);
  // a division's own hairlines let the light through: the stripe the half of
  // the race cuts is drawn across the ground it crossed
  float light = mark.g * 0.65;
  amt = clamp(amt * 1.75, 0.0, 1.0) * limb * gate * 0.90;
  if (amt < 0.004) discard;
  vec3 shade = mix(uPaper, mix(uSepia, uInk, 0.62), 0.26);
  vec3 tint = shade / max(uPaper, vec3(0.04));
  gl_FragColor = vec4(mix(vec3(1.0 + light * 0.5), tint, amt * (1.0 - light)), 1.0);
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

/** One shepherd moonlet: a small dented stone, painted as one flat wash to the
 *  face with the terminator stopping on a wandering line, ink on its own
 *  silhouette and the paper left round its rim. */
function shepherd(T, ctx, { size, seed }) {
  const { palette: pal, uniforms, washMaterial } = ctx;
  const geo = new T.IcosahedronGeometry(Math.max(0.4, size), 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = Math.sin(pos.getX(i) * 91.7 + pos.getY(i) * 57.3 + pos.getZ(i) * 33.1 + seed * 7.1) * 43758.5453;
    const s = 0.74 + 0.44 * (k - Math.floor(k));
    pos.setXYZ(i, pos.getX(i) * s, pos.getY(i) * s, pos.getZ(i) * s);
  }
  geo.computeVertexNormals();
  const mat = washMaterial(T, uniforms, pal, geo, {
    lit: mixColor(pal.paper, pal.stone, 0.34),
    shade: mixColor(pal.shadeCool, pal.ink, 0.40),
    sky: mixColor(pal.stone, pal.paper, 0.30),
    ink: pal.ink,
    paper: pal.paper,
    rag: 0.18,
    grain: 1.1,
    inkLine: 0.85,
    top: 0,
    skyTop: 0,
    dry: 0,
    base: 0,
    margin: size * 0.06,
    seed,
  });
  const mesh = new T.Mesh(geo, mat);
  mesh.name = 'companion-race-ring-shepherd';
  return mesh;
}

function mixColor(a, b, t) {
  return a.clone().lerp(b, t);
}

/**
 * The Saturn-grade ring (companions.ringStyle saturn): the week's race drawn as
 * a ring system in its own plane, with the divisions the race's own halves cut,
 * the shepherds its gaps keep, the globe's shadow across the sheet, the sheet's
 * own shadow banded across the globe, and the haze beyond the last ringlet.
 * Returns null on a week with no course to fit a plane to, and the dispatcher
 * falls back to the splits ring.
 */
export function saturnRing(ctx) {
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

  // The ring's radii, in world units: fixed fractions of the globe, so the
  // system is the same size on every week and the week's own race is drawn in
  // its banding rather than in its width.
  const inner = R * RING_IN;
  const outer = R * RING_OUT;
  const hazeOut = R * HAZE_OUT;

  // base.js lifts the poster of a week with a monument (its POSTER_TILT)
  const lift = features.monument ? 0.17 : 0;
  const camera = posterAxis(T, { race, light: sun, lift });
  const site = (features.spawn || features.monument?.dir || features.list[0]?.dir || camera).clone().normalize();
  const view = features.spawnTangent ? features.spawnTangent.clone().normalize() : null;
  const cam = runnerCamera(T, { features, site, view, R });
  const axis = saturnAxis(T, { course, cam, light: sun, tilt: P['companions.ringTilt'], inner, outer, R });
  const eye = posterEye(T, { n: axis, light: sun, base: camera, R, inner, outer });

  const seed = seedOf(features.week);
  const lace = laceFrom(T, { features, race, stats, seed });
  const bands = buildBands(lace.plan);
  const marks = buildMarks(lace.divs, lace.F_LINE, lace.plan);
  const cass = lace.divs.find((d) => d.kind === 'cassini');
  const cassMid = cass ? (cass.u0 + cass.u1) * 0.5 : 0;
  const cassHalf = cass ? (cass.u1 - cass.u0) * 0.5 : 0;

  const tBands = new T.DataTexture(bands, TABLE, ROWS, T.RGBAFormat, T.UnsignedByteType);
  tBands.name = 'companion-race-ring-bands';
  tBands.minFilter = T.LinearFilter;
  tBands.magFilter = T.LinearFilter;
  tBands.wrapS = T.ClampToEdgeWrapping;
  tBands.wrapT = T.ClampToEdgeWrapping;
  tBands.generateMipmaps = false;
  tBands.needsUpdate = true;

  const tMarks = new T.DataTexture(marks, TABLE, 1, T.RGBAFormat, T.UnsignedByteType);
  tMarks.name = 'companion-race-ring-marks';
  tMarks.minFilter = T.LinearFilter;
  tMarks.magFilter = T.LinearFilter;
  tMarks.wrapS = T.ClampToEdgeWrapping;
  tMarks.wrapT = T.ClampToEdgeWrapping;
  tMarks.generateMipmaps = false;
  tMarks.needsUpdate = true;

  const shadowDial = clamp(Number(P['companions.ringShadow']), 0, 1);
  const dustDial = clamp(Number(P['companions.ringDust']), 0, 1);

  const group = new T.Group();
  group.name = 'companion-race-ring';
  group.userData.reach = REACH;
  const frame = new T.Group();
  frame.name = 'companion-race-ring-plane';
  frame.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), axis);
  group.add(frame);

  // The washes the ringlets are painted with: the palette's own paper and ink
  // for the glazes, and the five classes the band table walks — the greys the
  // crepe is drawn in, the cream and ochre of the mass, the faint rose the
  // outer third keeps, and the paper for the brightest hairs.
  const grey = mixColor(pal.stone, pal.shadeCool, 0.45);
  const cream = mixColor(pal.paper, pal.litWarm, 0.22);
  const ochre = mixColor(pal.litWarm, pal.sepia, 0.40);
  const rose = mixColor(mixColor(pal.paper, pal.vermilion, 0.40), pal.stone, 0.26);
  const pale = mixColor(pal.paper, pal.stone, 0.14);
  const cool = mixColor(pal.shadeCool, pal.ink, 0.48);
  const glow = mixColor(pal.paper, pal.litWarm, 0.34);
  const hair = mixColor(pal.paper, pal.litWarm, 0.06);

  // The shepherds, in the ring's own plane: up to four, at the places the
  // race's own divisions put them.
  const moonUniforms = [];
  const shepherds = new T.Group();
  shepherds.name = 'companion-race-ring-shepherds';
  frame.add(shepherds);
  for (let i = 0; i < 4; i++) {
    const m = lace.moonlets[i];
    const v = new T.Vector4(0, 0, 0, 0);
    moonUniforms.push(v);
    if (!m) continue;
    const rho = inner + (outer - inner) * m.u;
    const seedM = seed + i * 13.7;
    const body = shepherd(T, ctx, { size: m.size, seed: seedM });
    const holder = new T.Group();
    holder.rotation.z = m.ang;
    body.position.set(rho, 0, 0);
    holder.add(body);
    shepherds.add(holder);
    v.set(m.u, m.ang, 0.055, m.wake);
    // the moonlet's own slow cruise: the wake it drags is read from the same
    // angle, so the two never come apart
    if (m.rate > 0) {
      const drift = holder.updateMatrixWorld;
      holder.updateMatrixWorld = function cruisingShepherd(force) {
        const a = m.ang + m.rate * (Number(uniforms?.uTime?.value) || 0);
        this.rotation.z = a;
        v.y = a;
        return drift.call(this, force);
      };
    }
  }

  const shared = {
    tBands: { value: tBands },
    tMarks: { value: tMarks },
    uTable: { value: TABLE },
    uRows: { value: ROWS },
    uIn: { value: inner },
    uSpan: { value: Math.max(1e-3, outer - inner) },
    uOut: { value: outer },
    uHazeOut: { value: hazeOut },
    uSunDir: light || { value: sun },
    uR: { value: R },
    uSea: { value: seaLevel },
    uPaper: { value: pal.paper.clone() },
    uInk: { value: pal.ink.clone() },
    uSepia: { value: pal.sepia.clone() },
    uCool: { value: cool },
    uVerm: { value: pal.vermilion.clone() },
    uGrey: { value: grey },
    uCream: { value: cream },
    uOchre: { value: ochre },
    uRose: { value: rose },
    uPale: { value: pale },
    uGlow: { value: glow },
    uHair: { value: hair },
    uShadow: { value: shadowDial },
  };

  const mat = new T.ShaderMaterial({
    uniforms: {
      ...shared,
      uTime: uniforms.uTime,
      uSeed: { value: seed },
      uLoad: { value: 1.35 },
      uBreak: { value: 0.016 },
      uGrain: { value: 0.32 },
      uDust: { value: dustDial },
      uGlowAmt: { value: 1.0 },
      uMass: { value: 1 },
      uMoon: { value: moonUniforms },
      // the half's own division, centre and half-width in the band's own
      // coordinate: what the runner's sky cuts wider (see the underfoot wash)
      uCass: { value: new T.Vector2(cassMid, cassHalf) },
    },
    vertexShader: SATURN_VERT,
    fragmentShader: SATURN_FRAG,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    // a sheet of ringlets has no business rewriting the frame's own alpha: the
    // ink pass reads it (the sea's own clear, see ink.js WASH_FRAG), and a ring
    // over the water would turn the horizon into land
    blending: T.CustomBlending,
    blendSrc: T.SrcAlphaFactor,
    blendDst: T.OneMinusSrcAlphaFactor,
    blendSrcAlpha: T.ZeroFactor,
    blendDstAlpha: T.OneFactor,
  });
  const geo = new T.RingGeometry(inner, hazeOut, 768, 1);
  const sheet = new T.Mesh(geo, mat);
  sheet.name = 'companion-race-ring-washer';
  sheet.renderOrder = 0;
  frame.add(sheet);
  // companions.ringMass is a look dial and is read every frame, so a page can lay
  // and lift it while the poster is looked at
  const massU = mat.uniforms.uMass;
  sheet.onBeforeRender = () => { massU.value = clamp(Number(P['companions.ringMass']) || 0, 0, 1); };

  const shellMat = new T.ShaderMaterial({
    uniforms: {
      ...shared,
      uRingN: { value: axis.clone() },
    },
    vertexShader: SATURN_SHELL_VERT,
    fragmentShader: SATURN_SHELL_FRAG,
    transparent: true,
    depthWrite: false,
    side: T.FrontSide,
    blending: T.MultiplyBlending,
    premultipliedAlpha: true,
  });
  const shell = new T.Mesh(buildShadowShell(T, features, R, SHELL_LIFT), shellMat);
  shell.name = 'companion-race-ring-shadow';
  shell.renderOrder = -2;
  group.add(shell);

  // what the ring was drawn from, for the eye and the bench
  const perp = new T.Vector3(Math.abs(axis.y) > 0.9 ? 1 : 0, Math.abs(axis.y) > 0.9 ? 0 : 1, 0).cross(axis).normalize();
  const land = runnerView({ n: axis, cam, inner, outer, R, perp, side: new T.Vector3().crossVectors(axis, perp), out: {} });
  group.userData.ring = {
    style: 'saturn',
    axis: axis.toArray(),
    inner, outer, hazeOut, reach: REACH,
    // the solid ring's own edge (the finish line's outer rim and the hand's
    // wander past it), in units: what the hero poster keeps inside its still
    // (shots.js heroShot); only the dust beyond it may leave the frame
    finish: inner + (outer - inner) * (lace.F_EDGE + 0.012),
    splits: lace.splits, half: lace.half, slowest: lace.slowest,
    ringlets: lace.plan.length,
    divisions: lace.divs.map((d) => ({ kind: d.kind, u0: +d.u0.toFixed(4), u1: +d.u1.toFixed(4) })),
    shepherds: lace.moonlets.map((m) => ({ u: +m.u.toFixed(4), ang: +m.ang.toFixed(3), size: m.size })),
    km: lace.km, laps: lace.laps,
    pace: Array.from(lace.pace, (v) => +v.toFixed(3)),
    site: site.toArray(),
    view: view ? view.toArray() : null,
    sun: sun.toArray(),
    // the poster's own eye on the lit face, and the aim that puts base.js's
    // camera there (shots.js heroShot hands it over as its direction)
    camera: eye.toArray(),
    aim: aimFor(T, eye, lift).toArray(),
    camElev: +(Math.asin(clamp(Math.abs(axis.dot(eye)), -1, 1)) * 180 / Math.PI).toFixed(1),
    sunElev: +(Math.asin(clamp(axis.dot(sun) * Math.sign(axis.dot(eye)), -1, 1)) * 180 / Math.PI).toFixed(1),
    siteLat: +(Math.asin(clamp(axis.dot(site), -1, 1)) * 180 / Math.PI).toFixed(1),
    // the runner's own frame: the share of the ring's width in it, the columns
    // it crosses, the sky it takes, how steeply it is seen and how it bends
    landing: {
      width: +land.ucov.toFixed(2), cols: +land.cols.toFixed(3), fill: +land.fill.toFixed(3),
      slant: +land.slant.toFixed(3), arc: +land.arc.toFixed(3), score: +landingScore(land).toFixed(3),
    },
    seed,
  };
  // the system's own teardown: the band and mark tables, the sheet, the shell
  attachTeardown(group);
  return group;
}

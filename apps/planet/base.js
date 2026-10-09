/* Planet Creator — wave 1 base.
 *
 * Owns everything that is not the look: world reading, terrain, sphere movement,
 * the runner rig + animation, cameras and the mode transition, the field guide,
 * and the capture hooks. Style authors pass `{ style }` to createApp(); every
 * style hook is optional and falls back to a plain neutral default. createApp
 * resolves once the planet is built (window.__app set); the build runs as short
 * tasks (pace.js), so a style's setupScene and postprocess may be async, and a
 * style's ready(app) is called as the app stands, before the first frame.
 *
 *   import { createApp } from './base.js';
 *   await createApp({ style: { name: 'mine', planetMaterial({ features }) { … } } });
 */
import * as THREE from 'three';
import { createRunner } from './runner.js';
import { P, applyParams } from './params.js';
import { composeWorld, loadWorlds, worldFor, weekStats, worldReason } from './worlds/index.js';
import { bodyFor } from './bodies/index.js';
import { createSpines, createCoast, createDrainage, DRAIN_DETAIL } from './terrain.js';
import { posterShot, landedShot } from './shots.js';
import { pace } from './pace.js';
import { formOf, repsOf, ridgeEffort, tiersOf } from './forms.js';
import { isRouteless } from './effort.js';
import { createBuild, LANDFORM_BITS } from './build.js';

export const R = 120; // planet radius (units); 1 unit ≈ 1 m, runner ≈ 1.8 units
export const MONUMENT_ID = 'monument';

const TAU = Math.PI * 2;
const DAY_LON = TAU / 7; // one day of the week → 360/7° of longitude
const RAD = Math.PI / 180;
const MI = 1609.344;
const U_PER_MI = 45 / 3.5; // 3.5 mi ≈ 45 units
const DETAIL = 7; // icosphere detail → 163 842 verts / 327 680 tris

const JUMP_V = 10.6;
const JUMP_GRAVITY_UP = 27;
const JUMP_GRAVITY_DOWN = 32;
const JUMP_BUFFER = 0.12;
const COYOTE_TIME = 0.1;
const JUMP_CROUCH = 0.08;
const WADE_DEPTH = 0.4;
const SWIM_DEPTH = 1.2;
const SWIM_HEIGHT = 1.25; // swimmer's root below the waterline
const LABEL_RANGE = 15; // proximity label radius
const TRANSITION = 2; // seconds of camera flight between modes
// The last stretch of a flight's height, units, over which the orbit's painting hands over to the ground's (the sky,
// the weather, the sea, a body's shells): a flight longer than this is flown as a zoom, its height over the ground
// end falling by a steady ratio, so the hand-over is read off where the camera is rather than how long it has flown.
const FLIGHT_HANDOFF = 40;
const CAM_MIN = 2.4; // closest the chase camera may get to the runner
const FRAME_RUNNER_MAX = 14.2; // far enough for landmarks while keeping a standing runner at least 15% tall
const CHASE_LOOK = 1.6; // look at head height, so the runner sits in the lower third
const ORBIT_RELIEF_CAP = 12; // keep mountain chains from tearing the poster's limb
// The round's own terrain fundamentals (terrain.js; every dial defaults to 0).
// A seam chain is read at the continental scale, raised as a tent profile 15-30 u
// wide, and broken into summits ~22 u apart; the coast is displaced by a few
// units within a few units of the waterline; a channel is drawn once it gathers
// a catchment, and grows to a river's width and depth at twelve times that.
const SPINE_SEAM_BAND_SIGMA = 0.48; // seam band half-width, in the week's own field spread (~25 u of ground at most)
const SPINE_SEAM_WARP = 0.075; // seam domain-warp travel, in unit-sphere fractions (~9 u)
const SPINE_SEAM_FREQ = 0.6; // seam scale against the continental term's own (few long chains, not many short ones)
const SPINE_AMP = 13.5; // ground a chain adds at its summits, units (scaled by the week's roughness)
const SPINE_CHAIN_FREQ = 5.5; // along-chain summit frequency
const SPINE_SEA_GATE = 0.3; // a chain reaches full height this far above the waterline, units
const SPINE_SEA_SPAN = 1.0; // and is gone at the waterline (see sample)
const SPINE_HIGH_MIN = 0.45; // a chain over flat lowland is this share of its height (see sample)
const SPINE_HIGH_SPAN = 2.0; // and stands whole this far above the waterline
const SPINE_CAP_LIFT = 5; // the orbit relief cap rises this much with the dial, so crests are not cut flat
const COAST_BAND = 3.0; // how far inland the coast detail reaches, units
const COAST_SEA_BAND = 2.0; // how far offshore it reaches: only the shelf
const COAST_AMP = 2.6; // how far it moves the ground either way
const COAST_SEA_AMP = 1.0; // and how strong it is offshore (islets, not an archipelago)
const COAST_FREQ = 4.6; // capes ~26 u across, islets a few units
const COAST_WARP_AMP = 0.045; // coast domain-warp travel, in unit-sphere fractions (~5 u)
const RIVER_MIN_AREA = 340; // u² of catchment where a channel becomes a river
const RIVER_SMOOTH_PASSES = 6; // low-pass passes over the flow grid before it is drained
const RIVER_AREA_RATIO = 12; // catchment over that where a river reaches its full width and depth
const RIVER_HALF_WIDTH_MAX = 4.6; // half-width of the widest reach (a 9 u wide river at its mouth)
const RIVER_DEPTH_MAX = 3.6; // carve depth of the widest reach
const LINEAGE_EPOCH = Date.parse('2020-01-06T00:00:00Z'); // a Monday, so every four-week anchor is one
const LINEAGE_ANCHOR_WEEKS = 4; // weeks of coastlines a lineage anchor is drawn for
const WEEK_MS = 7 * 86400000;
const LAND_ALT = 26; // orbit altitude where another inward wheel step commits to landing
const ZOOM_HYST = 12; // separation between the land and leave thresholds
const INTERACT_RANGE = 12;
// Round 13's effort (forms.js). A ridge's shelves meet on a riser this many units of course long, and the brush
// moves a riser's line across the ridge up to this far either way. A built form's switchback ramps climb its south
// face from this far off due south, each over this much of the turn (radians).
const RISER_RUN = 1.8;
const RISER_BREAK = 3;
const RAMP_FROM = 0.12;
const RAMP_SPAN = 0.8;
// the field guide's line for a ridge its effort shaped
const EFFORT_LINES = {
  intervals: 'Intervals → the ridge cut into terraces, a shelf for each hard stretch',
  tempo: 'A tempo → one high shelf along the ridge',
  recovery: 'An easy run → a low, wide ridge',
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// A world hook that answers with nothing useful leaves the value it was given.
const finiteOr = (value, fallback) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const smoothstep = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const wrapPi = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;

// Ink's established noon-side key light. Hour-driven light rotates east to
// west around this bearing while its elevation follows the training clock.
const LEGACY_INK_SUN = new THREE.Vector3(0.79, 0.6, 0.05).normalize();
const LEGACY_INK_AZIMUTH = Math.atan2(LEGACY_INK_SUN.z, LEGACY_INK_SUN.x);

const SPAWN_BACK = 10; // metres back along the race trail from the finish
const SPOT_BACK = 10; // metres out from a landmark when ?at= spawns you next to one
const STAND_RADII = 1.3; // …or this many of the landmark's own bounding-sphere radii + STAND_CLEAR
const STAND_CLEAR = 4; // clear ground in front of it (see featureStart)
const LAND_CLEAR = 0.5; // a landing stands this far above the sea, on ground that stays dry round it
const FOOT_R = 4; // the ground a built landmark needs dry under it (see readWeek's siting)
const BUILT = new Set(['constructed', 'calm', 'spires', 'wheel', 'cairn', 'pitch']); // landmarks that stand on the ground
const PITCH_RATIO = 0.62; // a laid-out pitch's width against its length (a real 68/105, at the mark's own scale)
const PITCH_FALL = 4.5; // units of fall a pitch's footprint may carry: a field is laid on the ground, not levelled
const PITCH_REACH = 40; // and how far it may be carried to find ground level enough to lay it on
const FRAME_MARGIN = 1.08; // a landmark must clear the frame edge by this much
const FRAME_MAX = 18; // the furthest the chase camera will pull back to frame one (the zoom limit)
const CHASE_YAWS = [0, 0.42, -0.42, 0.84, -0.84, 1.26, -1.26, Math.PI];
const RUNNER_HALF = 0.3; // the runner's own half-width: what a landmark standing dead ahead hides behind

// Ground patch: the camera-centred height field that replaces the globe under the
// viewer (see `createPatch`). Cell size grows geometrically from the centre out.
const PATCH_CELL = 0.25; // innermost cell, units
const PATCH_EDGE = 2.5; // outermost cell, units; coarser where perspective hides it
const PATCH_HALF = 120; // tangent-plane half-extent, units (≈3× the horizon on foot)
const PATCH_DRIFT = 12; // re-centre once the viewer has moved this far, units
const PATCH_ALT = 45; // drawn below this height above the ground, units
const PATCH_FADE = 0.72; // opaque share of the footprint; the rim dissolves into the globe
const PATCH_MS = 3; // rebuild work allowed per frame, ms
const MAX_BUFFER_PIXELS = 2.8e6;
const DPR_LEVELS = [1, 0.85, 0.7, 0.55];
// Feature LOD: once the resolution is at its floor and frames are still slow, the style's own ladder (style.lodLevels,
// ink.js LOD_ORDER) takes its costliest features away one level at a time, each faded over LOD_FADE seconds, and
// gives them back first when there is room again. A level is kept only if it bought LOD_KEEP of the frame.
const LOD_FADE = 1.2;
const LOD_SETTLE = 3;
const LOD_KEEP = 0.97;

/* ---------------------------------------------------------------- noise ---- */

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function noise3(seed) {
  const H = (x, y, z) => {
    let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1442695041) ^ seed;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  return (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const fx = x - xi, fy = y - yi, fz = z - zi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
    const c000 = H(xi, yi, zi), c100 = H(xi + 1, yi, zi), c010 = H(xi, yi + 1, zi), c110 = H(xi + 1, yi + 1, zi);
    const c001 = H(xi, yi, zi + 1), c101 = H(xi + 1, yi, zi + 1), c011 = H(xi, yi + 1, zi + 1), c111 = H(xi + 1, yi + 1, zi + 1);
    const x00 = c000 + (c100 - c000) * u, x10 = c010 + (c110 - c010) * u;
    const x01 = c001 + (c101 - c001) * u, x11 = c011 + (c111 - c011) * u;
    const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
    return y0 + (y1 - y0) * w;
  };
}

function fbm(nz, x, y, z, oct = 5, gain = 0.5, lac = 2.03) {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * nz(x * f, y * f, z * f);
    n += a;
    a *= gain;
    f *= lac;
  }
  return s / n; // 0..1
}

/* ------------------------------------------------------------- geometry ---- */

// Indexed icosphere (three's PolyhedronGeometry is non-indexed: 3× the work and
// faceted normals). Midpoints are welded per level, so the surface is smooth.
// A generator, so the globe's own mesh (the finest, ~160k vertices) can be cut
// between turns of the page (buildPlanetGeometry); icosphere() runs it through.
function* icosphereSteps(detail) {
  const t = (1 + Math.sqrt(5)) / 2;
  const v = [];
  const push = (x, y, z) => {
    const l = Math.hypot(x, y, z);
    v.push(x / l, y / l, z / l);
    return v.length / 3 - 1;
  };
  for (const [x, y, z] of [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]) push(x, y, z);
  let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  const cache = new Map();
  const mid = (a, b) => {
    const key = a < b ? a * 4194304 + b : b * 4194304 + a;
    let i = cache.get(key);
    if (i === undefined) {
      i = push((v[a * 3] + v[b * 3]) / 2, (v[a * 3 + 1] + v[b * 3 + 1]) / 2, (v[a * 3 + 2] + v[b * 3 + 2]) / 2);
      cache.set(key, i);
    }
    return i;
  };
  for (let d = 0; d < detail; d++) {
    const next = [];
    for (let f0 = 0; f0 < faces.length; f0 += 4096) {
      yield;
      for (let f = f0, end = Math.min(faces.length, f0 + 4096); f < end; f++) {
        const [a, b, c] = faces[f];
        const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
        next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
      }
    }
    faces = next;
    cache.clear();
  }
  const indices = new Uint32Array(faces.length * 3);
  for (let f0 = 0; f0 < faces.length; f0 += 65536) {
    yield;
    for (let i = f0, end = Math.min(faces.length, f0 + 65536); i < end; i++) {
      indices[i * 3] = faces[i][0];
      indices[i * 3 + 1] = faces[i][1];
      indices[i * 3 + 2] = faces[i][2];
    }
  }
  return { positions: new Float32Array(v), indices };
}

function icosphere(detail) {
  const steps = icosphereSteps(detail);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

function sphereGeometry(radius, detail) {
  const { positions, indices } = icosphere(detail);
  for (let i = 0; i < positions.length; i++) positions[i] *= radius;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();
  return geo;
}

// Closest point on a range's polyline. Writes hit = [chord², segment + t, 0,
// cx, cy, cz] (where along the line, and the closest point) and returns it —
// one scan feeds distance, summit phase, effort and the race trail attribute.
const hit = [0, 0, 0, 0, 0, 0];
function segInfo(r, px, py, pz) {
  const seg = r.seg;
  let best = Infinity;
  const n = seg.length / 3 - 1;
  for (let i = 0; i < n; i++) {
    const j = i * 3;
    const ax = seg[j], ay = seg[j + 1], az = seg[j + 2];
    const ex = seg[j + 3] - ax, ey = seg[j + 4] - ay, ez = seg[j + 5] - az;
    let t = ((px - ax) * ex + (py - ay) * ey + (pz - az) * ez) / (ex * ex + ey * ey + ez * ez);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = ax + ex * t - px, cy = ay + ey * t - py, cz = az + ez * t - pz;
    const d2 = cx * cx + cy * cy + cz * cz;
    if (d2 < best) {
      best = d2;
      hit[1] = i + t;
      hit[3] = ax + ex * t;
      hit[4] = ay + ey * t;
      hit[5] = az + ez * t;
    }
  }
  hit[0] = best;
  return hit;
}

// Ridged fBm (0..1, crests at 1) — used for summits along a chain and for the
// erosion detail on its flanks.
function ridged(nz, x, y, z, oct = 2, gain = 0.5, lac = 2.07) {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * (1 - Math.abs(nz(x * f, y * f, z * f) * 2 - 1));
    n += a;
    a *= gain;
    f *= lac;
  }
  return s / n;
}

const dirLL = (lat, lon) => new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));

// Exponential map: a tangent-plane offset (a along east, b along north) laid on the sphere.
function onSphere(c, east, north, a, b, out = new THREE.Vector3()) {
  out.set(0, 0, 0).addScaledVector(east, a).addScaledVector(north, b);
  const len = out.length();
  if (len < 1e-9) return out.copy(c);
  out.divideScalar(len);
  const th = len / R;
  return out.multiplyScalar(Math.sin(th)).addScaledVector(c, Math.cos(th));
}

// The lowest and highest ground at `dir` and on a ring `r` units round it: what
// decides whether a thing put down there stands on land, and how level it is.
const spanRef = new THREE.Vector3(), spanEast = new THREE.Vector3(), spanNorth = new THREE.Vector3(), spanP = new THREE.Vector3();
function groundSpan(heightAt, dir, r, out = { low: 0, high: 0 }) {
  spanRef.set(Math.abs(dir.y) > 0.9 ? 1 : 0, Math.abs(dir.y) > 0.9 ? 0 : 1, 0);
  spanEast.crossVectors(dir, spanRef).normalize();
  spanNorth.crossVectors(spanEast, dir).normalize();
  out.low = out.high = heightAt(dir);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const h = heightAt(onSphere(dir, spanEast, spanNorth, Math.cos(a) * r, Math.sin(a) * r, spanP));
    if (h < out.low) out.low = h;
    if (h > out.high) out.high = h;
  }
  return out;
}

/* ------------------------------------------------------------ readWeek ----- */

const tang = new THREE.Vector3(); // scratch for readWeek's route layout
const worldDir = new THREE.Vector3(); // the unit direction handed to a world's hooks

/**
 * Read a training week into a planet. Pure + deterministic (all randomness comes
 * from a PRNG seeded by the week string).
 * @returns the `features` object consumed by everything else (see report).
 */
export function readWeek(seed) {
  const source = seed || {};
  const {
    'world.archetype': archetype,
    'world.contAmp': contAmp,
    'world.contFreq': contFreq,
    'world.baseAmp': baseAmpMin,
    'world.roughAmp': roughAmp,
    'world.baseFreq': baseFreq,
    'world.lineage': lineage,
    'world.dayMass': dayMassBlend,
    'climate.tempScale': tempScale,
    'climate.warmthFallback': warmthFallback,
    'climate.seasonFallback': seasonFallback,
    'climate.roughFallback': roughFallback,
    'climate.energyScale': energyScale,
    'climate.oceanAnchorL': oceanAnchorL,
    'climate.oceanAnchorFrac': oceanAnchorFrac,
    'climate.oceanMin': oceanMin,
    'climate.oceanMax': oceanMax,
    'terrain.warp': warp,
    'terrain.warpFreq': warpFreq,
    'terrain.alongFreq': alongFreq,
    'terrain.envFreq': envFreq,
    'terrain.detailFreq': detailFreq,
    'terrain.ampKnee': ampKnee,
    'terrain.rangeAmp': rangeAmpK,
    'terrain.rangePow': rangePow,
    'terrain.rangeWidth': rangeWidthK,
    'terrain.detailAmp': detailAmp,
    'terrain.valleyAmp': valleyAmpK,
    'terrain.valleyWidth': valleyWidthK,
    'terrain.rivers': terrainRivers,
    'terrain.spines': terrainSpines,
    'terrain.coast': terrainCoast,
    'kinds.lagoon.radiusBase': lagoonRadiusBase,
    'kinds.lagoon.radiusDistance': lagoonRadiusDistance,
    'kinds.spires.countSeconds': spireCountSeconds,
    'kinds.lagoon.radiusTimeDiv': lagoonRadiusTimeDiv,
    'kinds.lagoon.depthBase': lagoonDepthBase,
    'kinds.lagoon.depthDistance': lagoonDepthDistance,
  } = P;
  const week = String(source.week || '2025-04-28');
  const nz = noise3(hashStr(week + '/terrain'));
  const makeRng = (salt = '') => mulberry32(hashStr(week + '/' + salt));
  const acts = Array.isArray(source.activities) ? source.activities.filter(Boolean) : [];
  const weekStart = Date.parse(week + 'T00:00:00Z');
  const number = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const raceTitle = String(source.race || '');
  // The world is resolved once, before anything is read, so the world that
  // answers the climate below is the same one that draws the ground and is
  // named in the reading's features. `auto` asks every world how well this week
  // suits it (see worlds/index.js); with no other world it is classic.
  const stats = weekStats(source);
  // The body (bodies/index.js) is the kind of thing the week is in space — a
  // rocky planet unless world.body names another — and is drawn with the world.
  const body = bodyFor(P['world.body'], stats);
  const world = composeWorld(worldFor(archetype, stats), body);
  // A world may frame its own orbit: a relief cap for the orbit mesh (the
  // landing patch stays uncapped) and, when it asks for one, a poster fill of
  // its own (see worlds/index.js). A week with mountains of its own reads its
  // chains as chains: the cap rises with the spines dial, so a range's summits
  // are drawn whole instead of being shaved off flat at round five's ceiling.
  // A body whose face stands well over the ground (a giant's cloud deck, an ice
  // giant's haze) keeps the closest orbit, `floor` units over R, far enough out
  // that its face is still a picture and not one flat wash of its own colour.
  const orbitReliefCap = finiteOr(world.orbit?.reliefCap, ORBIT_RELIEF_CAP + SPINE_CAP_LIFT * clamp(terrainSpines, 0, 1));
  const orbitFill = finiteOr(world.orbit?.fill, null);
  const orbitFloor = finiteOr(world.orbit?.floor, LAND_ALT);

  let sunHour = null, sunDirection = null;
  if (P['sun.fromHours']) {
    let clockX = 0, clockY = 0, clockWeight = 0;
    const offsetMinutes = P['sun.utcOffsetH'] * 60;
    for (const a of acts) {
      const at = Date.parse(a.startedAt);
      const weight = Math.max(0, number(a.activeS) || 0);
      if (!Number.isFinite(at) || !weight) continue;
      // Share links carry UTC instants but no activity timezone. Apply one
      // explicit training-locale offset instead of the viewer's local clock.
      const utcMinute = Math.floor(at / 60000);
      const minute = ((utcMinute + offsetMinutes) % 1440 + 1440) % 1440;
      const angle = minute / 1440 * TAU;
      clockX += Math.cos(angle) * weight;
      clockY += Math.sin(angle) * weight;
      clockWeight += weight;
    }
    const clockLength = Math.hypot(clockX, clockY);
    if (clockWeight && clockLength > clockWeight * 0.1) {
      sunHour = Math.atan2(clockY, clockX) / TAU * 24;
      if (sunHour < 0) sunHour += 24;
      const daylight = Math.max(0, Math.cos((sunHour - 12) / 12 * Math.PI));
      const elevation = lerp(12, 68, Math.pow(daylight, 1.6)) * RAD;
      const azimuth = LEGACY_INK_AZIMUTH + (sunHour - 12) / 12 * Math.PI;
      const horizontal = Math.cos(elevation);
      const target = new THREE.Vector3(
        Math.cos(azimuth) * horizontal,
        Math.sin(elevation),
        Math.sin(azimuth) * horizontal,
      );
      sunDirection = LEGACY_INK_SUN.clone().lerp(target, clamp(P['sun.strength'], 0, 1)).normalize();
    }
  }

  // Place every activity on its day (longitude) and order within that day
  // (latitude). Missing dates fall back to stable weekly order.
  const byDay = Array.from({ length: 7 }, () => []);
  acts.forEach((a, index) => {
    const at = Date.parse(a.startedAt);
    const rawDay = Number.isFinite(at) && Number.isFinite(weekStart) ? Math.floor((at - weekStart) / 86400000) : index % 7;
    byDay[clamp(rawDay, 0, 6)].push(a);
  });
  // Every activity on its day: the week's sites, which is also the list the
  // worlds read (see worldCtx.placed), in the order their features are listed.
  // The id and kind its feature ends up with are written back here as the
  // features are named below.
  const placed = [];
  byDay.forEach((dayActs, day) => dayActs.forEach((a, i) => {
    const lat = dayActs.length > 1 ? ((i / (dayActs.length - 1)) * 2 - 1) * 12 * RAD : 0;
    placed.push({
      a,
      id: null,
      kind: null,
      day,
      dir: dirLL(lat, day * DAY_LON),
      hours: Math.max(0, number(a.activeS) || 0) / 3600,
      distanceKm: Math.max(0, number(a.distanceM) || 0) / 1000,
      climbM: Math.max(0, number(a.ascentM) || 0),
      isRace: !!a.isRace || (!!raceTitle && a.title === raceTitle),
    });
  }));

  // Round five's climate and ocean rules are the terrain baseline. Raw activity
  // sums are only a fallback for imported weeks that do not carry totals.
  const totals = source.totals || {};
  let tempSum = 0, tempW = 0, hard = 0, all = 0, load = 0, sweat = 0;
  for (const { a } of placed) {
    const lo = number(a.minTempC), hi = number(a.maxTempC);
    if (lo != null && hi != null) {
      const w = (number(a.activeS) || 0) + 1;
      tempSum += ((lo + hi) / 2) * w;
      tempW += w;
    }
    for (const z of Array.isArray(a.hrZoneSeconds) ? a.hrZoneSeconds : []) all += number(z) || 0;
    hard += number(a.hrZoneSeconds?.[3]) || 0;
    hard += number(a.hrZoneSeconds?.[4]) || 0;
    load += Math.max(0, number(a.trainingLoad) || 0);
    sweat += Math.max(0, number(a.sweatMl) || 0);
  }
  // A week that carried no temperatures reads the fallback — or, with the
  // season dial up, the calendar: the northern winter is cold and July is warm,
  // whatever the week was spent doing. January reads ~0.15, July ~0.85.
  let warmthDefault = warmthFallback;
  if (seasonFallback && !tempW) {
    const date = new Date(Number.isFinite(weekStart) ? weekStart : LINEAGE_EPOCH);
    const month = date.getUTCMonth() + (date.getUTCDate() - 1) / 30.44; // fractional month, January → 0
    warmthDefault = 0.5 + 0.35 * Math.cos(((month - 6) / 12) * TAU);
  }
  let warmth = clamp(tempW ? tempSum / tempW / tempScale : warmthDefault, 0, 1);
  let roughness = clamp(all ? hard / all : roughFallback, 0, 1);
  let energy = clamp((number(totals.trainingLoad) ?? load) / energyScale, 0, 1.5);
  const weeklySweat = Math.max(0, number(totals.sweatMl) ?? sweat);
  const sweatL = weeklySweat / 1000;
  // The loved race week is the sea anchor: 6.302 L covered 47.5% of its globe.
  // Other weeks grow ocean area with sweat, rather than accidentally reversing it.
  let oceanFrac = clamp(oceanAnchorFrac * Math.sqrt(sweatL / oceanAnchorL), oceanMin, oceanMax);
  let baseAmp = baseAmpMin + roughAmp * roughness;

  // A world may read the week as its own climate before the sea is fixed: from
  // here on — the sea's quantile, the palettes, the terrain, where the lagoons
  // find their shore — every later step starts from these numbers. The hook
  // may change them in place or answer with a new set; anything it leaves out
  // or answers with no number stays as the week read it.
  const climate = { stats, seed: source, week, warmth, roughness, energy, sweatL, oceanFrac, baseAmp };
  if (world.climate) {
    const tuned = world.climate(climate) || climate;
    warmth = finiteOr(tuned.warmth, warmth);
    roughness = finiteOr(tuned.roughness, roughness);
    energy = finiteOr(tuned.energy, energy);
    oceanFrac = finiteOr(tuned.oceanFrac, oceanFrac);
    baseAmp = finiteOr(tuned.baseAmp, baseAmp);
  }

  const ranges = [];
  const valleys = [];
  const routes = [];
  const lagoons = [];
  const forms = []; // round 13: what a session with no route was built as (builtFor)
  const list = [];
  const raceCandidates = [];

  // The day-mass field, the `world.dayMass` dial's own terrain and any world's
  // for the taking: M(d) says how much of the week's training the ground at
  // `dir` carries. Each site's width comes from the hours spent there, and a
  // site the direction is more than three sigma from is skipped on the dot
  // product alone — before any angle is taken — where its bump is already down
  // to a thousandth. Nothing here allocates: the loop is over precomputed sites.
  const massSites = placed.map((place) => {
    const sigma = 0.18 + 0.12 * Math.sqrt(place.hours);
    return { dir: place.dir, sigma, gate: 3 * sigma >= Math.PI ? -1 : Math.cos(3 * sigma) };
  });
  function dayMass(dir) {
    let keep = 1;
    for (let i = 0; i < massSites.length; i++) {
      const site = massSites[i];
      const dot = dir.x * site.dir.x + dir.y * site.dir.y + dir.z * site.dir.z;
      if (dot < site.gate) continue;
      const ratio = Math.acos(clamp(dot, -1, 1)) / site.sigma;
      keep *= 1 - Math.exp(-ratio * ratio);
    }
    return 1 - keep;
  }

  // The continental term: the week's own noise, and — with the lineage dial up —
  // a date-anchored field every week near this one draws too, so coastlines run
  // on from week to week instead of being redrawn. Each four-week anchor has its
  // own noise field and the week interpolates between the two around it. At dial
  // 0 no anchor is ever built and this is exactly round five's continental term.
  const lineageWeek = Math.floor(((Number.isFinite(weekStart) ? weekStart : LINEAGE_EPOCH) - LINEAGE_EPOCH) / WEEK_MS);
  const lineageAnchor = Math.floor(lineageWeek / LINEAGE_ANCHOR_WEEKS);
  const lineageMix = lineageWeek / LINEAGE_ANCHOR_WEEKS - lineageAnchor;
  const nzBefore = lineage > 0 ? noise3(hashStr(`lineage/${lineageAnchor}`)) : null;
  const nzAfter = lineage > 0 ? noise3(hashStr(`lineage/${lineageAnchor + 1}`)) : null;
  function macro(dir) {
    const x = dir.x, y = dir.y, z = dir.z;
    const own = contAmp * (fbm(nz, x * contFreq, y * contFreq, z * contFreq, 2) * 2 - 1);
    if (!lineage) return own;
    const before = contAmp * (fbm(nzBefore, x * contFreq, y * contFreq, z * contFreq, 2) * 2 - 1);
    const after = contAmp * (fbm(nzAfter, x * contFreq, y * contFreq, z * contFreq, 2) * 2 - 1);
    return own + (before + (after - before) * lineageMix - own) * lineage;
  }

  // The classic world's undecorated ground, from its already-computed
  // continental term: round five's fine relief, and — with the day-mass dial up
  // — the week's training raising the land under it while its rest days sink.
  // One function, so the mesh's default path and the hook a world builds on
  // agree to the last bit.
  function classicGround(dir, cont) {
    const fine = baseAmp * (fbm(nz, dir.x * baseFreq, dir.y * baseFreq, dir.z * baseFreq) * 2 - 1);
    const ground = cont + fine;
    if (!dayMassBlend) return ground;
    const M = dayMass(dir);
    const trained = cont * (0.35 + 0.65 * M) + 4.5 * M - 1.5 * (1 - M) + fine;
    return ground + (trained - ground) * dayMassBlend;
  }

  // What a world's hooks read: the week's own noise field and PRNG (so a world
  // draws from the same week base.js does, and the same week twice draws the
  // same planet), the two noise helpers the default terrain is built from, the
  // dials, the resolved climate and the week's stats, every activity's site and
  // its route, the day-mass field and the continental term — that last in world
  // units, the same term (and scale) the classic baseline is built from, which
  // is also what the orbit mesh carries as aMacro. The `dir` a hook is handed is
  // a reused unit vector — copy it to keep it.
  const worldCtx = {
    nz, fbm, ridged, P, rng: makeRng, stats, R, warmth, roughness, energy,
    placed, routes, dayMass, macro,
    classicBaseline: (dir) => classicGround(dir, macro(dir)),
  };

  // The round's own terrain fields (terrain.js: the plate-seam chains and the
  // fractal coast). Each is built only when its dial asks for it, and each is
  // read off the week's own noise, seeded apart from the classic terrain's, so a
  // chain is never a coastline's shadow and every week draws its own relief. The
  // two shear directions a field's domain warp runs along come from the week's
  // PRNG, so no two weeks' seams wander the same way. The drainage's own graph
  // is read later, once the sea line is known (see below).
  let spineField = null, coastField = null, drainage = null;
  if (terrainSpines > 0 || terrainCoast > 0) {
    const rng = makeRng('terrain/fields');
    const shear = () => {
      const x = rng() * 2 - 1, y = rng() * 2 - 1, z = rng() * 2 - 1;
      const l = Math.hypot(x, y, z) || 1;
      return { x: x / l, y: y / l, z: z / l };
    };
    const seed = (salt) => noise3(hashStr(`${week}/terrain/${salt}`));
    const seamShear = shear(), chainShear = shear(), coastShear = shear();
    if (terrainSpines > 0) {
      // The seam field's own spread, read once over 512 directions: the level
      // the seam runs along and the band round it are that week's own, so a week
      // whose field is flat draws the same share of its globe in chains as a
      // week whose field is steep (a fixed band would leave one week bare and
      // another tiled). The scan is unwarped — the warp only carries the seam
      // across the coasts, not its spread.
      const seam = seed('seam');
      const freq = contFreq * SPINE_SEAM_FREQ;
      let sum = 0, sum2 = 0;
      const K = 512, GA = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < K; i++) {
        const y = 1 - (i / (K - 1)) * 2;
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        const th = GA * i;
        const s = fbm(seam, Math.cos(th) * r * freq, y * freq, Math.sin(th) * r * freq, 2) * 2 - 1;
        sum += s; sum2 += s * s;
      }
      const level = sum / K;
      const sigma = Math.sqrt(Math.max(1e-4, sum2 / K - level * level));
      spineField = createSpines({
        dial: clamp(terrainSpines, 0, 1),
        seam, warpA: seed('seam/warpA'), warpB: seed('seam/warpB'),
        chain: seed('chain'), spur: seed('spur'), wide: seed('seam/wide'),
        fbm, ridged,
        freq,
        band: SPINE_SEAM_BAND_SIGMA * sigma,
        level,
        warp: SPINE_SEAM_WARP,
        chainFreq: SPINE_CHAIN_FREQ,
        // a hard week's chains stand a little higher than an easy week's
        amp: SPINE_AMP * (0.75 + 0.45 * roughness),
        ax: seamShear.x, ay: seamShear.y, az: seamShear.z,
        bx: chainShear.x, by: chainShear.y, bz: chainShear.z,
      });
    }
    if (terrainCoast > 0) {
      coastField = createCoast({
        dial: clamp(terrainCoast, 0, 1),
        warp: seed('coast/warp'), detail: seed('coast'),
        fbm,
        band: COAST_BAND,
        seaBand: COAST_SEA_BAND,
        seaAmp: COAST_SEA_AMP,
        amp: COAST_AMP,
        freq: COAST_FREQ,
        warpAmp: COAST_WARP_AMP,
        ax: coastShear.x, ay: coastShear.y, az: coastShear.z,
      });
    }
  }

  // The football rule the cairn has always read its ball from — a session whose
  // sport says football, whatever it was recorded on (ink-kinds.js reads the
  // same string for the stone's top ball). It is only ever asked of a session
  // that has already fallen through every other kind, so turning the pitch on
  // moves exactly the cairns football was already drawing a ball on.
  const isFootball = (a) => String(a.sport || '').toLowerCase().includes('football');

  function activityKind(a) {
    const title = String(a.title || '').toLowerCase();
    const sport = String(a.sport || '').toLowerCase();
    if (a.hasGps && /^(running|walking|hiking)$/.test(sport)) return 'range';
    if (a.hasGps && sport === 'cycling') return 'valley';
    if ((!a.hasGps && sport === 'running') || sport === 'fitness_equipment') return 'constructed';
    if (sport === 'training') return /yoga|pilates|stretch|breath|mobility/.test(title) ? 'calm' : 'spires';
    if (sport === 'cycling') return 'wheel';
    if (sport === 'swimming') return 'lagoon';
    if (P['kinds.pitch'] > 0 && isFootball(a)) return 'pitch';
    return 'cairn';
  }

  function routeFor(a, dir, kind, featureId) {
    const cleanShape = Array.isArray(a.routeShape)
      ? a.routeShape.filter((p) => Array.isArray(p) && number(p[0]) != null && number(p[1]) != null)
      : [];
    const shape = cleanShape.length > 1 ? cleanShape : [[0.25, 0.5], [0.75, 0.5]];
    const distance = Math.max(0, number(a.distanceM) || 0);
    const span = Math.min((distance / MI) * U_PER_MI, TAU * R * 0.55);
    const ref = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const east = new THREE.Vector3().crossVectors(dir, ref).normalize();
    const north = new THREE.Vector3().crossVectors(east, dir).normalize();
    const seg = new Float64Array(shape.length * 3);
    const cum = new Float64Array(shape.length);
    let reach = 0;
    for (let i = 0; i < shape.length; i++) {
      onSphere(dir, east, north, (clamp(shape[i][0], 0, 1) - 0.5) * span, (clamp(shape[i][1], 0, 1) - 0.5) * span, tang);
      seg[i * 3] = tang.x;
      seg[i * 3 + 1] = tang.y;
      seg[i * 3 + 2] = tang.z;
      if (i > 0) {
        const chord = Math.hypot(seg[i * 3] - seg[i * 3 - 3], seg[i * 3 + 1] - seg[i * 3 - 2], seg[i * 3 + 2] - seg[i * 3 - 1]);
        cum[i] = cum[i - 1] + 2 * R * Math.asin(Math.min(1, chord / 2));
      }
      reach = Math.max(reach, tang.distanceTo(dir));
    }
    const climb = Math.max(0, number(a.ascentM) || 0);
    // Height follows the climb, but past the height knee (the tallest range any week
    // drew before) only slowly: a range's width, summit spacing and erosion are
    // laid out at fixed scales, and a 1,600 m ride at the full rate stood a wall
    // of spikes 60 u high on a 120 u planet, too tall for any view to frame.
    const rawAmp = rangeAmpK * Math.pow(Math.max(climb, 12), rangePow);
    const rangeAmp = rawAmp <= ampKnee ? rawAmp : ampKnee * (1 + 0.25 * Math.log(rawAmp / ampKnee));
    // the session's effort along it (forms.js): a ridge only, and only a shape that changes the crest
    const effort = kind === 'range' ? ridgeEffort(a) : null;
    const rangeWidth = clamp(span * rangeWidthK, 6, 22) * (effort ? effort.wide : 1);
    const amp = kind === 'valley'
      ? clamp(1.8 + valleyAmpK * Math.pow(Math.max(climb, 12), rangePow), 3, 18)
      : rangeAmp;
    const width = kind === 'valley' ? clamp(span * valleyWidthK, 5, 8) : rangeWidth;
    const cap = Math.min(reach + (3.4 * Math.max(rangeWidth, width) + 2) / R, 1.98);
    const finish = new THREE.Vector3(seg[seg.length - 3], seg[seg.length - 2], seg[seg.length - 1]);
    const total = cum[cum.length - 1];
    const sBack = Math.max(0, total - SPAWN_BACK);
    let k = 1;
    while (k < cum.length - 1 && cum[k] < sBack) k++;
    const t = (sBack - cum[k - 1]) / Math.max(1e-6, cum[k] - cum[k - 1]);
    const spawn = new THREE.Vector3(
      seg[(k - 1) * 3] + (seg[k * 3] - seg[(k - 1) * 3]) * t,
      seg[(k - 1) * 3 + 1] + (seg[k * 3 + 1] - seg[(k - 1) * 3 + 1]) * t,
      seg[(k - 1) * 3 + 2] + (seg[k * 3 + 2] - seg[(k - 1) * 3 + 2]) * t,
    ).normalize();
    const finishTangent = finish.clone().addScaledVector(spawn, -finish.dot(spawn)).normalize();
    return {
      featureId, kind, seg, cum, total, amp, width, baseAmp: rangeAmp, baseWidth: rangeWidth,
      detAmp: rangeAmp * detailAmp, span, dir: dir.clone(), capSq: cap * cap,
      race: false, finish, spawn, finishTangent,
      effort: effort ? Float32Array.from(effort.levels) : null, flat: effort ? effort.flat : 0,
      line: effort ? EFFORT_LINES[a.shape] : null,
    };
  }

  // How high a ridge its effort shaped stands at the ground's nearest point on its course (`info`, segInfo's): the
  // session's levels laid evenly along the course, each riser a short slope whose line across the ridge the brush
  // breaks, so a shelf reads as one from orbit and its edge is still drawn by hand underfoot.
  function effortAt(r, info, x, y, z) {
    const i = Math.min(Math.floor(info[1]), r.cum.length - 2);
    const total = Math.max(1e-6, r.total);
    const L = r.effort, K = L.length;
    const s = (r.cum[i] + (r.cum[i + 1] - r.cum[i]) * (info[1] - i)) / total;
    const c = s * K + (nz(x * detailFreq, y * detailFreq, z * detailFreq) - 0.5) * RISER_BREAK * K / total;
    const j = clamp(Math.floor(c), 0, K - 1);
    const run = Math.min(0.45, RISER_RUN * K / total);
    const f = c - j;
    return j + 1 < K && f > 1 - run ? L[j] + (L[j + 1] - L[j]) * smoothstep(Math.min(1, (f - 1 + run) / run)) : L[j];
  }

  // Round 13: a session with no route is built in its own day's slice, from what it was (forms.js): a run as a hill
  // whose shelves are its effort (a terrace a rep, a tempo's one high shelf, an easy day's low mound, a smooth mound
  // for the rest), a stair stepper as a flight of stairs as tall as its climb, an elliptical as a raised oval. Each
  // is sized by the session's time and laid out level on the ground it is sited on (below), under the orbit's cap.
  function builtFor(a, dir, form, featureId) {
    const root = Math.sqrt(Math.max(0.25, (number(a.activeS) || 2700) / 3600));
    const mins = Math.round(root * root * 60);
    const f = { featureId, form, dir: dir.clone(), east: new THREE.Vector3(), north: new THREE.Vector3(), base: 0, ready: false, edges: null };
    if (form === 'stair') {
      const climb = number(a.inclineM);
      f.b = clamp(6 + 3 * root, 6, 11); // half the flight's length, up the day's slice
      f.a = 2.1; // half its width
      f.H = climb > 0 ? clamp(2.5 + climb / 70, 3, 8) : clamp(3 + 2.5 * root, 3.5, 7);
      f.steps = clamp(Math.round(f.H / 0.55), 6, 14);
      f.line = `${climb > 0 ? `${Math.round(climb)} m climbed` : `${mins} min on the stairs`} → a flight of ${f.steps} stairs`;
    } else if (form === 'oval') {
      f.b = clamp(9 + 5 * root, 9, 16);
      f.a = f.b * 0.62;
      f.H = 1.6;
      f.w = 1.5; // half the bank's level top
      f.line = `${mins} min on the elliptical → a raised oval ${Math.round(2 * f.b)} m long`;
    } else if (form === 'low') {
      f.b = clamp(11 + 5 * root, 11, 18);
      f.a = f.b * 0.8;
      f.H = 2.4;
      f.line = 'An easy run with no route → a low, wide built mound';
    } else {
      f.b = clamp(14 + 6 * root, 16, 23) * (a.shape === 'long' ? 1.2 : 1);
      f.a = f.b * 0.78;
      f.H = clamp(5 + 2.5 * root, 5.5, 9);
      f.ramp = [RAMP_FROM, RAMP_SPAN]; // where the switchback climbs (builtGround; the ink leaves the lip open there)
      if (form === 'terraces') {
        const n = tiersOf(a), reps = repsOf(a);
        f.edges = Array.from({ length: n }, (_, i) => 0.94 - (i * 0.7) / n);
        f.levels = f.edges.map((_, i) => (i + 1) / n);
        f.rw = (0.34 * 0.7) / n;
        f.line = `${reps ? `${reps} reps` : 'Intervals'} → a built hill of ${n} terraces${reps === n ? ', a shelf a rep' : ''}`;
      } else if (form === 'shelf') {
        f.edges = [0.94, 0.5];
        f.levels = [0.25, 1];
        f.rw = 0.09;
        f.line = 'A tempo with no route → a built hill with one high shelf';
      } else {
        f.line = a.shape === 'steady' || a.shape === 'long' ? `A ${a.shape} run with no route → one smooth built mound` : 'No route → one smooth built mound';
      }
    }
    const chord = 2 * Math.sin((Math.max(f.a, f.b) * 1.35 + 2) / (2 * R));
    f.capSq = chord * chord;
    return f;
  }

  // A built form's ground (builtFor): inside its footprint the week's own ground is cut and filled to the form's
  // base and the form stands on that; outside it a short skirt hands back to the ground.
  function builtGround(f, x, y, z, h) {
    const u = R * (x * f.east.x + y * f.east.y + z * f.east.z);
    const v = R * (x * f.north.x + y * f.north.y + z * f.north.z);
    const brush = nz(x * detailFreq, y * detailFreq, z * detailFreq) - 0.5;
    let lift = 0, keep;
    if (f.form === 'stair') {
      // a raised flight up the day's slice, a step at a time from its foot to a landing at its head
      const along = (v + f.b) / (2 * f.b);
      keep = (1 - smoothstep(clamp((Math.abs(u) / f.a - 1) / 0.35, 0, 1)))
        * smoothstep(clamp((along + 0.08) / 0.08, 0, 1)) * (1 - smoothstep(clamp((along - 1.1) / 0.08, 0, 1)));
      const s = clamp(along, 0, 1) * f.steps + 0.25 * brush;
      const k = Math.floor(s);
      lift = (f.H / f.steps) * (k >= f.steps ? f.steps : Math.max(0, k) + smoothstep(clamp((s - k - 0.6) / 0.4, 0, 1)));
    } else {
      const rho = Math.hypot(u / f.a, v / f.b) + 0.05 * brush;
      if (f.form === 'oval') {
        // a bank round the oval with a level top, and the ground inside it laid level too
        const off = Math.abs(rho - 1) * 0.5 * (f.a + f.b);
        lift = f.H * (1 - smoothstep(clamp((off - f.w) / 0.9, 0, 1)));
        keep = rho < 1 ? 1 : 1 - smoothstep(clamp((off - f.w - 0.9) / 3, 0, 1));
      } else {
        keep = 1 - smoothstep(clamp((rho - 1) / 0.3, 0, 1));
        if (!f.edges) lift = f.H * smoothstep(clamp((1 - rho) / 0.75, 0, 1));
        else {
          // a riser at each edge, and the ramp up to it laid on the shelf below, on alternate sides of the south
          // face: walked from the foot, the shelves are a switchback to the top
          const phi = Math.atan2(u / f.a, -v / f.b);
          let below = 0, outer = 1.05;
          for (let i = 0; i < f.edges.length; i++) {
            const e = f.edges[i];
            let s = smoothstep(clamp((e - rho) / f.rw, 0, 1));
            if (rho > e && rho < outer) {
              const t = ((i % 2 ? 1 : -1) * phi - RAMP_FROM) / RAMP_SPAN;
              if (t > 0) s = Math.max(s, t <= 1 ? t : 1 - Math.min(1, (t - 1) * 10));
            }
            lift += (f.levels[i] - below) * s;
            below = f.levels[i];
            outer = e - f.rw;
          }
          lift *= f.H;
        }
      }
    }
    return h + (f.base + lift - h) * keep;
  }

  function detailFor(a, day) {
    const parts = [dayNames[day]];
    const distance = number(a.distanceM), active = number(a.activeS), climb = number(a.ascentM), incline = number(a.inclineM);
    if (distance != null) parts.push(`${(distance / MI).toFixed(1)} mi`);
    if (active != null) parts.push(`${Math.round(active / 60)} min`);
    // a route-less session's recorded ascent is incline, not climb (effort.js)
    if (climb != null) parts.push(`${Math.round(climb)} m ${isRouteless(a) ? 'incline' : 'climb'}`);
    else if (incline != null) parts.push(`${Math.round(incline)} m incline`);
    if (parts.length === 1) parts.push(String(a.sport || 'activity').replaceAll('_', ' '));
    return parts.join(' · ');
  }

  function explainFor(kind, a, landform) {
    const lines = [];
    const distance = number(a.distanceM), active = number(a.activeS), climb = number(a.ascentM);
    const mins = active == null ? null : Math.round(active / 60);
    if (kind === 'range') {
      lines.push(climb == null
        ? `No climb recorded → a neutral-height mountain range (${landform.amp.toFixed(1)} m)`
        : `${Math.round(climb)} m of climbing → peaks up to ${landform.amp.toFixed(1)} m`);
      lines.push(distance == null
        ? `No distance recorded → a short ${Math.round(landform.span)} m range`
        : `${(distance / MI).toFixed(1)} mi of route → a ${Math.round(landform.span)} m mountain chain`);
    } else if (kind === 'valley') {
      lines.push(climb == null
        ? `No climb recorded → a neutral ${landform.amp.toFixed(1)} m valley carve`
        : `${Math.round(climb)} m of climbing → a valley carved ${landform.amp.toFixed(1)} m deep`);
      lines.push(distance == null
        ? `No distance recorded → a short ${Math.round(landform.span)} m valley`
        : `${(distance / MI).toFixed(1)} mi of route → a ${Math.round(landform.span)} m winding valley`);
    } else if (kind === 'constructed') {
      lines.push(`No outdoor GPS → ${String(a.title || 'the workout')} becomes a constructed landmark`);
      if (mins != null) lines.push(`${mins} min of work → its footprint and scale`);
    } else if (kind === 'calm') {
      lines.push(`${mins == null ? 'Unrecorded time' : `${mins} min`} of mobility work → a quiet grove and stone circle`);
    } else if (kind === 'spires') {
      const recordedSets = number(a.strength?.sets);
      const sets = recordedSets != null && recordedSets > 0 ? recordedSets : 0;
      const strengthSeconds = active != null && active > 0 ? active : 0;
      const count = clamp(Math.round(sets || (strengthSeconds ? strengthSeconds / spireCountSeconds : 4)), 3, 12);
      const source = sets ? `${Math.round(sets)} sets`
        : strengthSeconds ? `${Math.round(strengthSeconds / 60)} min of strength`
          : 'A strength session';
      lines.push(`${source} → ${count} rock spires`);
      const volume = number(a.strength?.volumeKg);
      const trainingLoad = number(a.trainingLoad);
      if (volume != null) lines.push(`${Math.round(volume)} kg lifted → the spires' height`);
      else if (trainingLoad != null) lines.push(`${trainingLoad.toFixed(0)} training load → the spires' height`);
    } else if (kind === 'wheel') {
      lines.push(`${mins == null ? 'An indoor ride' : `${mins} min indoors`} → a standing training wheel`);
    } else if (kind === 'lagoon') {
      lines.push(`${distance == null ? 'A swim' : `${Math.round(distance)} m swum`} → a ${landform.radius.toFixed(1)} m lagoon basin`);
      lines.push(`${mins == null ? 'Unrecorded time' : `${mins} min in the water`} → a basin carved ${landform.depth.toFixed(1)} m deep`);
    } else if (kind === 'pitch') {
      lines.push(`${mins == null ? 'A football session' : `${mins} min of football`} → a pitch laid out ${Math.round(landform.span)} × ${Math.round(landform.width)} m`);
      lines.push('Mown stripes, chalk and two small goals on ground level enough to play on');
    } else {
      const trainingLoad = number(a.trainingLoad);
      lines.push(`${mins == null ? 'An activity' : `${mins} min of activity`} → a stacked-stone cairn`);
      if (trainingLoad != null) lines.push(`${trainingLoad.toFixed(0)} training load → the cairn's scale`);
    }
    if (weeklySweat > 0) lines.push(`${sweatL.toFixed(1)} L of weekly sweat → ${Math.round(oceanFrac * 100)}% ocean`);
    return lines;
  }

  // The order the week's landforms are laid in, one bit each in sample's o.lf: what the build (createApp) raises
  // them by, one at a time.
  let landforms = 0;
  for (const place of placed) {
    const { a, day, dir } = place;
    const kind = activityKind(a);
    const title = String(a.title || a.sport || 'Untitled activity');
    const id = slug(`${dayNames[day]}-${title}`, list);
    place.id = id;
    place.kind = kind;
    let landform = null;
    if (kind === 'range' || kind === 'valley') {
      landform = routeFor(a, dir, kind, id);
      routes.push(landform);
      (kind === 'range' ? ranges : valleys).push(landform);
    } else if (kind === 'lagoon') {
      const distance = Math.max(0, number(a.distanceM) || 0);
      const active = Math.max(0, number(a.activeS) || 0);
      const radius = clamp(lagoonRadiusBase + Math.sqrt(distance) * lagoonRadiusDistance + active / lagoonRadiusTimeDiv, lagoonRadiusBase, 18);
      const cap = 2 * Math.sin((radius + 3.5) / (2 * R));
      landform = {
        featureId: id,
        dir: dir.clone(),
        radius,
        depth: clamp(lagoonDepthBase + Math.sqrt(distance) * lagoonDepthDistance, lagoonDepthBase, 15),
        capSq: cap * cap,
      };
      lagoons.push(landform);
    } else if (kind === 'pitch') {
      // A pitch is sized before it is sited, because its own footprint is what
      // its footing is measured over: a session's length, capped (see
      // kinds.pitch), and a real pitch's own width against it.
      const active = Math.max(0, number(a.activeS) || 0);
      const span = clamp(
        P['kinds.pitch.spanBase'] + P['kinds.pitch.spanK'] * Math.sqrt(active / 3600),
        P['kinds.pitch.spanBase'], P['kinds.pitch.spanMax'],
      );
      landform = { featureId: id, dir: dir.clone(), span, width: span * PITCH_RATIO };
    } else if (kind === 'constructed') {
      // round 13: a session with no route, built in its day's slice from what it was (forms.js)
      const form = formOf(a);
      if (form) forms.push(landform = builtFor(a, dir, form, id));
    }
    if (kind === 'range' || kind === 'valley' || kind === 'lagoon' || landform?.form) landform.order = Math.min(landforms++, LANDFORM_BITS - 1);
    const feature = {
      id,
      kind,
      day, // 0 Monday … 6 Sunday: the build raises the week a day at a time
      label: title,
      detail: detailFor(a, day),
      dir: dir.clone(),
      stats: a,
      explain: explainFor(kind, a, landform),
    };
    if (landform && (kind === 'range' || kind === 'valley')) {
      feature.span = landform.span;
      feature.width = landform.width;
      feature.amp = landform.amp;
    } else if (kind === 'pitch') {
      // the field's own footprint: what its footing is measured over (below) and
      // what the ink style lays its turf, its chalk and its orbit mark out from
      feature.span = landform.span;
      feature.width = landform.width;
    }
    list.push(feature);
    // the session's effort in the field guide's own words: a ridge it shaped, or what was built for it
    if (landform?.line) {
      feature.explain.push(landform.line);
      if (landform.form) feature.form = landform.form;
    }
    const isRace = place.isRace;
    if (isRace) {
      const distance = Math.max(0, number(a.distanceM) || 0);
      raceCandidates.push({ a, day, feature, route: kind === 'range' || kind === 'valley' ? landform : null, score: distance * 1e6 + Math.max(0, number(a.activeS) || 0) });
    }
  }

  // Race monuments are independent features. The biggest race is first, owns
  // the legacy `monument` id, and is the one whose route receives the trail.
  let biggestRace = null;
  for (const race of raceCandidates) if (!biggestRace || race.score > biggestRace.score) biggestRace = race;
  const orderedRaces = biggestRace ? [biggestRace, ...raceCandidates.filter((r) => r !== biggestRace)] : [];
  const races = [];
  for (let i = 0; i < orderedRaces.length; i++) {
    const race = orderedRaces[i];
    const { a, day, feature, route } = race;
    let finish, spawn, spawnTangent;
    if (route) {
      finish = route.finish.clone();
      spawn = route.spawn.clone();
      spawnTangent = route.finishTangent.clone();
      route.race = race === biggestRace;
    } else {
      const ref = Math.abs(feature.dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const east = new THREE.Vector3().crossVectors(feature.dir, ref).normalize();
      const north = new THREE.Vector3().crossVectors(east, feature.dir).normalize();
      finish = onSphere(feature.dir, east, north, 5, 0).normalize();
      spawn = onSphere(finish, east, north, -SPAWN_BACK, 0).normalize();
      spawnTangent = finish.clone().addScaledVector(spawn, -finish.dot(spawn)).normalize();
    }
    const id = i === 0 ? MONUMENT_ID : slug(`${dayNames[day]}-${feature.label}-finish`, list);
    const distance = number(a.distanceM), active = number(a.activeS), climb = number(a.ascentM);
    const explain = ['Marked as a race → a finish monument'];
    if (distance != null) explain.push(`${(distance / MI).toFixed(1)} mi raced → the monument's scale`);
    if (race === biggestRace && route) explain.push(`Biggest race of the week → the highlighted race trail`);
    const monument = {
      id,
      kind: 'monument',
      label: `${feature.label} · finish`,
      detail: detailFor(a, day),
      dir: finish,
      spawn,
      spawnTangent,
      stats: a,
      explain,
      anchor: route ? 'finish' : 'beside',
      raceFeatureId: feature.id,
    };
    if (active == null && climb == null && distance == null) monument.detail = `${dayNames[day]} · race`;
    list.push(monument);
    races.push(monument);
  }

  // The locked round-five field is evaluated first. New kinds are local
  // overlays, so neither their carve nor their basin can move the global sea.
  // `until` leaves out every landform laid after that one (the build's week so
  // far), and o.lf says which landforms shaped the ground here, a bit each.
  function sample(dir, o, overlays = true, until = LANDFORM_BITS) {
    let x = dir.x, y = dir.y, z = dir.z;
    const l2 = x * x + y * y + z * z;
    if (Math.abs(l2 - 1) > 1e-6) {
      const s = 1 / Math.sqrt(l2 || 1);
      x *= s;
      y *= s;
      z *= s;
    }
    let h;
    // A world may draw the undecorated ground itself. Everything below — the
    // routes, the valleys, the lagoons, the sea's quantile — is then laid on
    // that baseline, so the week's reading still holds together. `o.macro` is
    // the smooth ground under that height, with no route carve or fine detail:
    // the orbit mesh hands it to ink.js as aMacro, and a world's own baseline
    // is already exactly that.
    if (world.baseline) {
      worldDir.set(x, y, z);
      h = world.baseline(worldDir, worldCtx);
      o.macro = h;
    } else {
      worldDir.set(x, y, z);
      o.macro = macro(worldDir);
      h = classicGround(worldDir, o.macro);
    }
    // The week's own chains go under everything else (terrain.js): they are the
    // continental ground's seams, so a route is carved into a chain rather than
    // laid beside it, and a chain is there on a week whose GPS never left town.
    // A chain stands on land, and it stands on high ground. It fades out over
    // the shelf (this planet's sea is only a few units deep: a range raised
    // straight across it would be a ribbon of dry paper drawn over open water,
    // and new land where the week's reading put water) and it is a swell rather
    // than a range across the lowland — because from orbit this style reads
    // height in bands, so a chain that lifts flat coastal ground turns it into a
    // pale slab, while a chain that sharpens the week's own uplands into a
    // toothed crest is what a range looks like on the sheet. The sea line is
    // read without the chains, so the week's map — continents and ocean area —
    // is exactly the classic week's.
    if (overlays && spineField) {
      const stand = (h - seaLevel + SPINE_SEA_GATE) / SPINE_SEA_SPAN;
      const landK = stand <= 0 ? 0 : stand >= 1 ? 1 : smoothstep(stand);
      if (landK > 0) {
        const high = (h - seaLevel) / SPINE_HIGH_SPAN;
        const highK = high <= SPINE_HIGH_MIN ? SPINE_HIGH_MIN : high >= 1 ? 1 : high;
        h += spineField(x, y, z) * (landK * highK);
      }
    }
    let prox = 0, raceD = 999, lf = 0;
    for (let i = 0; i < routes.length; i++) {
      const r = routes[i];
      if (r.order > until) continue;
      const dx = x - r.dir.x, dy = y - r.dir.y, dz = z - r.dir.z;
      if (dx * dx + dy * dy + dz * dz > r.capSq) continue;
      const info = segInfo(r, x, y, z);
      const d = 2 * R * Math.asin(Math.min(1, Math.sqrt(info[0]) / 2));
      if (r.race && d < raceD) raceD = d;

      // Every GPS route keeps round five's range profile underneath. A cycling
      // valley is then carved into that field rather than replacing it.
      // a ridge its effort shaped stands at the level of the stretch of the session it is nearest (effortAt)
      const amp = r.effort && d < 3.5 * r.baseWidth ? r.baseAmp * effortAt(r, info, x, y, z) : r.baseAmp;
      const w = r.baseWidth;
      const fade = d < w * 0.5 ? d / (w * 0.5) : 1;
      const dw = d + warp * w * fade * (nz(x * warpFreq, y * warpFreq, z * warpFreq) * 2 - 1);
      const t1 = 1 - dw / w;
      const tf = 1 - dw / (3 * w);
      if (t1 > 0 || tf > 0) {
        const cx = info[3], cy = info[4], cz = info[5];
        const rn = clamp((ridged(nz, cx * alongFreq, cy * alongFreq, cz * alongFreq) - 0.3) / 0.45, 0, 1);
        const env = clamp((nz(cx * envFreq, cy * envFreq, cz * envFreq) - 0.35) / 0.4, 0, 1);
        let along = (0.45 + 0.55 * rn) * (0.68 + 0.32 * env);
        // a shelf's top is laid level: the summits along it are taken down toward one height
        if (r.flat) along = lerp(along, 0.86, 0.75 * r.flat);
        let rh = 0, crest = 0;
        if (t1 > 0) {
          crest = Math.pow(t1, 1.6);
          if (r.flat) crest = lerp(crest, smoothstep(Math.min(1, t1 / 0.55)), 0.85 * r.flat);
          rh += amp * along * crest;
        }
        if (tf > 0) {
          const f = tf * tf * (3 - 2 * tf);
          rh += 0.25 * amp * along * Math.max(0, f - crest);
          if (f > prox) prox = f;
        }
        const slope = Math.min(1, (amp * 1.4 * (t1 > 0 ? Math.pow(t1, 0.6) : 0)) / w);
        if (crest > 0 || slope > 0) {
          const det = ridged(nz, x * detailFreq, y * detailFreq, z * detailFreq) * 2 - 1;
          rh += det * (amp * detailAmp * 4 * crest * (1 - crest) * (0.35 + 0.65 * slope) + 0.5 * slope * Math.min(1, amp / 12));
        }
        h += rh;
        lf |= 1 << r.order;
      }

      if (overlays && r.kind === 'valley') {
        const vw = r.width;
        const vfade = d < vw * 0.5 ? d / (vw * 0.5) : 1;
        const vdw = d + warp * vw * vfade * (nz(x * warpFreq, y * warpFreq, z * warpFreq) * 2 - 1);
        const t = clamp(1 - vdw / (vw * 1.35), 0, 1);
        if (t > 0) {
          h -= r.amp * smoothstep(t) * (0.82 + 0.18 * nz(x * detailFreq, y * detailFreq, z * detailFreq));
          lf |= 1 << r.order;
        }
      }
    }

    if (overlays) {
      for (let i = 0; i < lagoons.length; i++) {
        const basin = lagoons[i];
        if (basin.order > until) continue;
        const chordSq = (x - basin.dir.x) ** 2 + (y - basin.dir.y) ** 2 + (z - basin.dir.z) ** 2;
        if (chordSq > basin.capSq) continue;
        const was = h;
        const chord = Math.sqrt(chordSq);
        const d = 2 * R * Math.asin(Math.min(1, chord / 2));
        const cut = smoothstep(clamp((basin.radius - d) / (basin.radius * 0.35), 0, 1));
        if (cut > 0) {
          const bowl = basin.floor + 0.45 * Math.pow(Math.min(1, d / (basin.radius * 0.65)), 2);
          h = lerp(h, Math.min(h, bowl), cut);
        }
        const rim = Math.exp(-Math.pow((d - basin.radius) / 1.4, 2));
        h = lerp(h, Math.max(h, basin.waterLevel + 0.6), rim);
        if (h !== was) lf |= 1 << basin.order;
      }
    }
    // The coast and the rivers are the last of the drawn ground, and drawn
    // ground only (overlays): the sea's quantile probe and the shore a lagoon is
    // sited on read the undecorated ground, so the continents, the sea line and
    // every siting keep the classic week's answer while what is painted has the
    // capes and the channels in it. The coast is laid first, on the waterline
    // the ground actually has, and a channel then cuts through it — so a river
    // runs into its own estuary instead of stopping on a cape (terrain.js).
    if (overlays) {
      if (coastField) h += coastField(x, y, z, h - seaLevel);
      if (drainage) {
        const cut = drainage.carve(x, y, z);
        if (cut > 0) h -= cut;
      }
    }
    // The world's last word on the ground, after the routes and the lagoons.
    // Every probe reads it too, so the sea's quantile, a lagoon's shore and a
    // landmark's footing are all measured on the height that is drawn.
    if (world.shape) {
      worldDir.set(x, y, z);
      h = world.shape(worldDir, h, worldCtx);
    }
    // Round 13's built forms, the last of what is drawn: what was built for each session with no route
    // (builtFor), level on whatever the world left there.
    if (overlays) {
      for (let i = 0; i < forms.length; i++) {
        const f = forms[i];
        if (!f.ready || f.order > until) continue;
        const dx = x - f.dir.x, dy = y - f.dir.y, dz = z - f.dir.z;
        if (dx * dx + dy * dy + dz * dz > f.capSq) continue;
        const was = h;
        h = builtGround(f, x, y, z, h);
        if (h !== was) lf |= 1 << f.order;
      }
    }
    o.h = h;
    o.range = prox;
    o.race = raceD > 60 ? 60 : raceD;
    o.lf = lf;
    return o;
  }

  const NS = 2400;
  const samples = new Float64Array(NS);
  const probe = new THREE.Vector3();
  const out = { h: 0, range: 0, race: 0, macro: 0, lf: 0 };
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < NS; i++) {
    const y = 1 - (i / (NS - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = ga * i;
    samples[i] = sample(probe.set(Math.cos(th) * r, y, Math.sin(th) * r), out, false).h;
  }
  const sorted = Float64Array.from(samples).sort();
  const seaLevel = sorted[clamp(Math.floor(oceanFrac * NS), 0, NS - 1)];
  // Lagoons belong in coastal lowland, not at the bottom of a deep dry dish.
  // Search out from the activity's day-band position and take the nearest ring
  // with a low shore; only a week with no such ground needs a local water disc.
  const site = new THREE.Vector3(), shore = new THREE.Vector3();
  const siteRef = new THREE.Vector3(), siteEast = new THREE.Vector3(), siteNorth = new THREE.Vector3();
  const shoreProfile = (basin, dir) => {
    siteRef.set(Math.abs(dir.y) > 0.9 ? 1 : 0, Math.abs(dir.y) > 0.9 ? 0 : 1, 0);
    siteEast.crossVectors(dir, siteRef).normalize();
    siteNorth.crossVectors(siteEast, dir).normalize();
    let low = Infinity, high = -Infinity, sum = 0;
    const ring = basin.radius + 1.8;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      onSphere(dir, siteEast, siteNorth, Math.cos(a) * ring, Math.sin(a) * ring, shore);
      const h = sample(shore, out, false).h;
      low = Math.min(low, h);
      high = Math.max(high, h);
      sum += h;
    }
    return { low, high, mean: sum / 8 };
  };
  // The nearest site round `from` that `rate` takes (it returns a score, lower
  // is better, or null): searched out ring by ring, the best of the first ring
  // that has any.
  const nearestSite = (from, limit, rate) => {
    siteRef.set(Math.abs(from.y) > 0.9 ? 1 : 0, Math.abs(from.y) > 0.9 ? 0 : 1, 0);
    const east = new THREE.Vector3().crossVectors(from, siteRef).normalize();
    const north = new THREE.Vector3().crossVectors(east, from).normalize();
    for (let distance = 0; distance <= limit; distance += 3) {
      let best = null;
      const steps = distance ? Math.max(24, Math.ceil((TAU * distance) / 6)) : 1;
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * TAU;
        onSphere(from, east, north, Math.cos(a) * distance, Math.sin(a) * distance, site);
        const rated = rate(site);
        if (rated && (!best || rated.score < best.score)) best = { ...rated, dir: site.clone() };
      }
      if (best) return best;
    }
    return null;
  };
  for (const basin of lagoons) {
    const nominal = basin.dir.clone();
    let spot = nearestSite(nominal, 48, (dir) => {
      const p = shoreProfile(basin, dir);
      const level = p.mean - seaLevel;
      if (level < 0.5 || level > 1.5 || p.high - seaLevel > 2) return null;
      return { profile: p, score: Math.abs(level - 0.8) + (p.low > seaLevel + 0.25 ? 0.35 : 0) };
    });
    let profile = spot ? spot.profile : shoreProfile(basin, nominal);
    // A pool of its own is for dry ground. Where the sea has drowned the site,
    // that pool would lie under the sea: the nearest cove takes the lagoon
    // instead — a shore mostly of land, open to the sea — one without a cliff
    // over it (8 u) if there is any, else however steep.
    if (!spot && profile.mean - 0.4 < seaLevel) {
      const cove = (cliff) => (dir) => {
        const p = shoreProfile(basin, dir);
        return p.low < seaLevel && p.mean >= seaLevel && p.high - seaLevel <= cliff ? { profile: p, score: Math.abs(p.mean - seaLevel - 0.8) } : null;
      };
      spot = nearestSite(nominal, 120, cove(8)) || nearestSite(nominal, 120, cove(Infinity));
      if (spot) profile = spot.profile;
    }
    if (spot) {
      basin.dir.copy(spot.dir);
      basin.waterLevel = seaLevel;
      basin.localWater = false;
    } else {
      basin.waterLevel = profile.mean - 0.4;
      basin.localWater = true;
    }
    basin.rimLevel = profile.mean;
    const feature = list.find((f) => f.id === basin.featureId);
    if (feature) feature.dir.copy(basin.dir);
    const base = sample(basin.dir, out, false).h;
    basin.floor = Math.min(base - basin.depth, basin.waterLevel - 1.4);
  }

  // The drainage (terrain.js) is read once here: the lagoons have found their
  // shores, the sea line is fixed, and every landmark siting below is measured
  // on the ground a channel is carved into (a river is a valley the runner can
  // stand in, not a decal on the map). Each coarse node reads the drawn ground —
  // the chains, the coast, a route's range, a world's own shape — and the graph
  // is built on the week's own height field, so nothing here can feed back into
  // its own routing.
  if (terrainRivers > 0) {
    const coarse = icosphere(DRAIN_DETAIL);
    drainage = createDrainage({
      positions: coarse.positions,
      indices: coarse.indices,
      ground: (x, y, z) => sample(probe.set(x, y, z), out, true).h,
      seaLevel,
      R,
      dial: clamp(terrainRivers, 0, 1),
      minArea: RIVER_MIN_AREA,
      refRatio: RIVER_AREA_RATIO,
      smoothPasses: RIVER_SMOOTH_PASSES,
      halfWidthMax: RIVER_HALF_WIDTH_MAX,
      depthMax: RIVER_DEPTH_MAX,
    });
  }

  // A built landmark stands on land. Where the week's sea has risen over its
  // day-band site, it moves as a lagoon finds its shore: to level ground within
  // half a day's reach if there is any (no more than 2 u of fall across its
  // footing), else to the nearest ground with dry land all round it for a
  // runner to stand on — in each case the levellest of the first ring out that
  // has any.
  const ground = (dir) => sample(dir, out).h;
  const span = { low: 0, high: 0 };
  const footing = (r, fall) => (dir) => {
    groundSpan(ground, dir, r, span);
    return span.low >= seaLevel + LAND_CLEAR && span.high - span.low <= fall ? { score: span.high - span.low } : null;
  };
  // A field is not a cairn: a ring tells you where the edges of a thing are,
  // and a bowl whose rim is level and whose floor is 4 u down passes a ring test
  // and then hides its own far touchline behind the ground in front of it. A
  // pitch's footing is therefore read across the whole footprint — the ground
  // point, half way out and the rim — and the spread of all of it is the cost.
  const laidFooting = (r, fall) => (dir) => {
    let low = Infinity, high = -Infinity;
    for (const ring of [0, r * 0.5, r]) {
      groundSpan(ground, dir, ring, span);
      if (span.low < low) low = span.low;
      if (span.high > high) high = span.high;
    }
    return low >= seaLevel + LAND_CLEAR && high - low <= fall ? { score: high - low } : null;
  };
  // Round 13's built forms (builtFor) are laid out the way a pitch is: on the levellest dry ground near the day's
  // site that their footprint fits, carried no further than a third of the day's band, then cut and filled to the
  // mean of the ground there, the whole of them under the orbit's relief cap. They are sited before the other
  // landmarks, which then keep off them. Each is landed at its foot on its first dry side, facing up into it — a
  // terraced hill at its south-east foot, facing along its face toward the first ramp, so the shelves are seen
  // stacked rather than end-on; an oval on its own bank, facing along it.
  for (const f of forms) {
    const foot = Math.max(f.a, f.b) * 0.8;
    const spot = nearestSite(f.dir, 36, laidFooting(foot, 6)) || nearestSite(f.dir, 60, laidFooting(foot, 12))
      || nearestSite(f.dir, 60, footing(FOOT_R, Infinity));
    if (spot) f.dir.copy(spot.dir);
    siteRef.set(Math.abs(f.dir.y) > 0.9 ? 1 : 0, Math.abs(f.dir.y) > 0.9 ? 0 : 1, 0);
    f.east.crossVectors(f.dir, siteRef).normalize();
    f.north.crossVectors(f.east, f.dir).normalize();
    let sum = 0, n = 0;
    for (const ring of [0, foot * 0.5, foot]) {
      for (let i = 0, k = ring ? 8 : 1; i < k; i++, n++) {
        sum += ground(onSphere(f.dir, f.east, f.north, Math.cos((i / k) * TAU) * ring, Math.sin((i / k) * TAU) * ring, site));
      }
    }
    f.base = Math.max(sum / n, seaLevel + LAND_CLEAR + 0.3);
    f.H = clamp(orbitReliefCap - 0.6 - f.base, 1.5, f.H);
    f.ready = true;
    const feature = list.find((x) => x.id === f.featureId);
    feature.dir.copy(f.dir);
    const sx = Math.sin(0.5), cx = Math.cos(0.5);
    const stands = f.form === 'oval'
      ? [[0, -f.b, 1, 0], [0, f.b, -1, 0], [f.a, 0, 0, 1], [-f.a, 0, 0, -1]]
      : [[0, -f.b - 3.5, 0, 1], [f.a + 3.5, 0, -1, 0], [-f.a - 3.5, 0, 1, 0], [0, f.b + 3.5, 0, -1]];
    if (f.edges) stands.unshift([f.a * 1.07 * sx, -f.b * 1.07 * cx, -f.a * cx - f.a * sx, -f.b * sx + f.b * cx]);
    for (const [u, v, fu, fv] of stands) {
      const at = onSphere(f.dir, f.east, f.north, u, v);
      if (groundSpan(ground, at, 2, span).low < seaLevel + LAND_CLEAR) continue;
      feature.spawn = at;
      feature.spawnTangent = new THREE.Vector3().addScaledVector(f.east, fu).addScaledVector(f.north, fv);
      feature.spawnTangent.addScaledVector(at, -feature.spawnTangent.dot(at)).normalize();
      break;
    }
  }
  for (const f of list) {
    if (!BUILT.has(f.kind) || f.form) continue;
    // A laid-out pitch is painted over everything it covers, so it needs its
    // whole footprint dry and level enough to play on — half of the length it
    // lays out, plus a pace for the corners and the run-off — where a cairn
    // needs only the few units under it, and a wet cairn is the only one that
    // ever has to move.
    const laid = f.kind === 'pitch';
    const foot = laid ? Math.max(FOOT_R, f.span * 0.6 + 1) : FOOT_R;
    if (!laid && groundSpan(ground, f.dir, 2, span).low >= seaLevel) continue;
    // …and a field is carried no further than a third of its own day's band to
    // find that ground, so the week's own layout survives the search
    const spot = laid
      ? nearestSite(f.dir, PITCH_REACH, laidFooting(foot, PITCH_FALL))
        || nearestSite(f.dir, 60, laidFooting(foot, PITCH_FALL * 2))
        || nearestSite(f.dir, 60, footing(foot, Infinity))
      : nearestSite(f.dir, 60, footing(foot, 2)) || nearestSite(f.dir, 120, footing(2 * foot, Infinity));
    if (spot) f.dir.copy(spot.dir);
  }

  const byId = {};
  for (const f of list) byId[f.id] = f;
  const monument = races[0] || null;
  const spawnTangent = monument?.spawnTangent || null;
  const heightAt = (dir) => sample(dir, out).h;
  // The sea a share of the week's sweat stands at (the build, createApp): the same rule read off the same samples,
  // held to the week's own sea at the week's own sweat.
  const seaFrac = (litres) => clamp(oceanAnchorFrac * Math.sqrt(Math.max(0, litres) / oceanAnchorL), oceanMin, oceanMax);
  const seaTune = seaFrac(sweatL) > 0 ? oceanFrac / seaFrac(sweatL) : 1;
  const quantile = (frac) => {
    const x = clamp(frac * NS, 0, NS - 1), i = Math.floor(x);
    return i + 1 < NS ? sorted[i] + (sorted[i + 1] - sorted[i]) * (x - i) : sorted[NS - 1];
  };
  const seaAt = (litres) => (litres >= sweatL ? seaLevel : quantile(seaFrac(litres) * seaTune) - quantile(oceanFrac) + seaLevel);

  return {
    seed, week, radius: R, dayLon: DAY_LON,
    // which world drew this reading, the week's cheap signals as its fit(stats)
    // read them — a style can tell a repainted classic week from another
    // world's, and say which week a shape was chosen for — and why this world
    // took the week, in a phrase (see worldReason)
    world: { id: world.id, label: world.label || world.id, reason: worldReason(world, stats) },
    // the kind of body the week is, or null for a rocky planet (bodies/index.js)
    body: body ? { id: body.id, label: body.label || body.id, reason: body.reason?.(stats) || null } : null,
    // the orbit mesh's own framing: the relief cap its height is drawn under,
    // the poster fill the world asked for (or null for the camera.fill dial),
    // and the closest orbit's height over R
    orbit: { reliefCap: orbitReliefCap, fill: orbitFill, floor: orbitFloor },
    stats,
    seaLevel, warmth, roughness, energy, baseAmp, sweatL, seaAt,
    ...(sunDirection ? { sunHour, sunDirection } : {}),
    list, byId, ranges, valleys, routes, lagoons,
    // round 13: what was built for the sessions with no route (builtFor)
    forms,
    // The round's own terrain (terrain.js): the drainage graph a style may read
    // for a river's own line (channels are node indices into its positions, each
    // carrying its catchment, width and depth), and which layers the dials built.
    drainage,
    terrain: { spines: !!spineField, coast: !!coastField, rivers: drainage ? drainage.channels.length : 0 },
    race: biggestRace?.route || null,
    races,
    monument,
    dirLL, onSphere,
    spawn: monument?.spawn?.clone() || dirLL(0, 0),
    spawnTangent,
    heightAt,
    orbitHeightAt: (dir) => Math.min(heightAt(dir), orbitReliefCap),
    /** the full sample at dir; `until` leaves out the landforms laid after that order (route/lagoon .order) */
    sample: (dir, o = out, until = LANDFORM_BITS) => sample(dir, o, true, until),
    /** distance to the highlighted race trail, clamped 0..60 */
    raceDistance: (dir) => sample(dir, out).race,
    /** deterministic PRNG for styles: makeRng('rocks')() → 0..1 */
    makeRng,
  };
}

function slug(s, list) {
  let base = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'feature';
  let id = base, n = 2;
  while (list.some((f) => f.id === id)) id = `${base}-${n++}`;
  return id;
}

function mulberry32(a) {
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------ planet geometry ---- */

/**
 * Displaced planet mesh with the style attributes, built between turns of the
 * page (pace.js).
 * @returns Promise of a THREE.BufferGeometry with aHeight, aMacro, aSlope, aRace, aRange, aSea.
 */
export async function buildPlanetGeometry(features, opts = {}) {
  const steps = icosphereSteps(opts.detail ?? DETAIL);
  let step;
  while (!(step = steps.next()).done) await pace();
  const { positions, indices } = step.value;
  const n = positions.length / 3;
  const cap = opts.maxHeight ?? Infinity; // the orbit relief cap: what the globe's silhouette is held to
  const dirs = new Float32Array(positions); // unit directions, kept for the normals pass
  const aHeight = new Float32Array(n);
  const aMacro = new Float32Array(n);
  const aSlope = new Float32Array(n);
  const aRace = new Float32Array(n);
  const aRange = new Float32Array(n);
  const aSea = new Float32Array(n);
  const lf = new Uint32Array(n); // which landforms shaped each vertex (sample's o.lf), for the build
  const d = new THREE.Vector3();
  const out = { h: 0, range: 0, race: 0, macro: 0, lf: 0 };
  // a block of vertices at a time, the turn of the page between blocks (a loop holding an await is not compiled like
  // one without, so the awaits stay out of the loops that do the work)
  for (let i0 = 0; i0 < n; i0 += 4096) {
    await pace();
    for (let i = i0, end = Math.min(n, i0 + 4096); i < end; i++) {
      const j = i * 3;
      d.set(dirs[j], dirs[j + 1], dirs[j + 2]);
      features.sample(d, out);
      aHeight[i] = out.h;
      // The smooth undecorated ground (see readWeek's macro): craft.limb eases the
      // silhouette to it at the limb, so it is held to the same cap as the height.
      aMacro[i] = out.macro < cap ? out.macro : cap;
      aRange[i] = out.range;
      aRace[i] = out.race;
      aSea[i] = out.h - features.seaLevel;
      lf[i] = out.lf;
      const r = R + Math.min(out.h, cap);
      positions[j] = d.x * r;
      positions[j + 1] = d.y * r;
      positions[j + 2] = d.z * r;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  // Already per-vertex averaged, and within 1.4° of the field's own gradient at
  // this mesh's 1 u scale (measured) — a ring refit came out no better, so the
  // globe keeps it and only the patch's rebuild uses fitNormals (which chunks).
  // These are computeVertexNormals' own sums, in its order and stored as it stores
  // them (Float32), a block of triangles at a time: the same normals to the bit.
  const nrm = new Float32Array(n * 3);
  for (let t0 = 0; t0 < indices.length; t0 += 3 * 16384) {
    await pace();
    for (let t = t0, end = Math.min(indices.length, t0 + 3 * 16384); t < end; t += 3) {
      const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
      const bx = positions[b], by = positions[b + 1], bz = positions[b + 2];
      const cbx = positions[c] - bx, cby = positions[c + 1] - by, cbz = positions[c + 2] - bz;
      const abx = positions[a] - bx, aby = positions[a + 1] - by, abz = positions[a + 2] - bz;
      const x = cby * abz - cbz * aby, y = cbz * abx - cbx * abz, z = cbx * aby - cby * abx;
      const ax1 = nrm[a] + x, ay1 = nrm[a + 1] + y, az1 = nrm[a + 2] + z;
      const bx1 = nrm[b] + x, by1 = nrm[b + 1] + y, bz1 = nrm[b + 2] + z;
      const cx1 = nrm[c] + x, cy1 = nrm[c + 1] + y, cz1 = nrm[c + 2] + z;
      nrm[a] = ax1; nrm[a + 1] = ay1; nrm[a + 2] = az1;
      nrm[b] = bx1; nrm[b + 1] = by1; nrm[b + 2] = bz1;
      nrm[c] = cx1; nrm[c + 1] = cy1; nrm[c + 2] = cz1;
    }
  }
  await pace();
  for (let j = 0; j < nrm.length; j += 3) {
    const x = nrm[j], y = nrm[j + 1], z = nrm[j + 2], s = 1 / (Math.sqrt(x * x + y * y + z * z) || 1);
    nrm[j] = x * s; nrm[j + 1] = y * s; nrm[j + 2] = z * s;
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  for (let i = 0; i < n; i++) {
    const j = i * 3;
    const dot = nrm[j] * dirs[j] + nrm[j + 1] * dirs[j + 1] + nrm[j + 2] * dirs[j + 2];
    aSlope[i] = 1 - clamp(dot, 0, 1); // 0 flat … 1 cliff
  }
  geo.setAttribute('aHeight', new THREE.BufferAttribute(aHeight, 1));
  geo.setAttribute('aMacro', new THREE.BufferAttribute(aMacro, 1));
  geo.setAttribute('aSlope', new THREE.BufferAttribute(aSlope, 1));
  geo.setAttribute('aRace', new THREE.BufferAttribute(aRace, 1));
  geo.setAttribute('aRange', new THREE.BufferAttribute(aRange, 1));
  geo.setAttribute('aSea', new THREE.BufferAttribute(aSea, 1));
  geo.userData.seaLevel = features.seaLevel;
  geo.userData.landforms = lf;
  return geo;
}

/** Sea sphere at R + seaLevel. */
export function buildOceanGeometry(features, opts = {}) {
  const geo = sphereGeometry(R + features.seaLevel, opts.detail ?? 5);
  geo.name = 'ocean';
  return geo;
}

/* --------------------------------------------------------------- normals ---- */

// Ring of neighbours per vertex, deduplicated: an icosphere vertex has 6, a grid
// vertex 8. Duplicates are dropped so a least-squares fit is not weighted by how
// many triangles happen to share an edge. `index` can be a coarse lattice rather
// than the drawn one, which is how the patch fits over ~1 u instead of one cell.
function ringList(index, count) {
  const deg = new Uint8Array(count);
  const ring = new Uint32Array(count * 9);
  const add = (a, b) => {
    const k = a * 9, d = deg[a];
    for (let i = 0; i < d; i++) if (ring[k + i] === b) return;
    if (d < 9) { ring[k + d] = b; deg[a] = d + 1; }
  };
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i], b = index[i + 1], c = index[i + 2];
    add(a, b); add(b, a); add(b, c); add(c, b); add(c, a); add(a, c);
  }
  return { deg, ring };
}

const _fa = new THREE.Vector3(), _fb = new THREE.Vector3(), _fc = new THREE.Vector3();
/**
 * Per-vertex normals from a least-squares plane fit over each vertex's ring.
 *
 * The globe keeps `computeVertexNormals` — measured within 1.4° of the field's own
 * gradient at its 1 u scale, and a ring refit came out no better. The patch uses
 * this instead because its grid is rebuilt every few metres: the fit is chunkable
 * (`from`/`to` bound the vertex range) and needs nothing but positions, whereas
 * `computeVertexNormals` is one call over 166k triangles that would land in a
 * single frame. The two conventions differ by 0.15° on average where they meet at
 * the patch's rim, so a style's ink cannot tell where the patch ends and the globe
 * starts.
 */
function fitNormals(geo, rings, from = 0, to = geo.attributes.position.count) {
  const pos = geo.attributes.position.array;
  const nrm = geo.attributes.normal.array;
  const { deg, ring } = rings;
  for (let v = from; v < to; v++) {
    const p = v * 3;
    const px = pos[p], py = pos[p + 1], pz = pos[p + 2];
    const r = Math.hypot(px, py, pz) || 1;
    const cx = px / r, cy = py / r, cz = pz / r;
    _fc.set(cx, cy, cz);
    // any two tangents will do; the fit is expressed in them and rotated back out
    _fa.set(0, Math.abs(cy) > 0.9 ? 0 : 1, Math.abs(cy) > 0.9 ? 1 : 0);
    _fa.addScaledVector(_fc, -_fa.dot(_fc)).normalize(); // perpendicular to the radius
    _fb.crossVectors(_fc, _fa);
    let suu = 0, suv = 0, svv = 0, sud = 0, svd = 0, used = 0;
    const k = v * 9, d = deg[v];
    for (let i = 0; i < d; i++) {
      const o = ring[k + i] * 3;
      const dx = pos[o] - px, dy = pos[o + 1] - py, dz = pos[o + 2] - pz;
      const u = dx * _fa.x + dy * _fa.y + dz * _fa.z;
      const w = dx * _fb.x + dy * _fb.y + dz * _fb.z;
      const len = Math.hypot(u, w); // tangent-plane distance to the neighbour
      if (len < 1e-4) continue;
      const slope = (Math.hypot(pos[o], pos[o + 1], pos[o + 2]) - r) / len;
      const un = u / len, wn = w / len;
      suu += un * un; suv += un * wn; svv += wn * wn;
      sud += un * slope; svd += wn * slope;
      used++;
    }
    const det = suu * svv - suv * suv;
    if (used < 3 || Math.abs(det) < 1e-9) {
      // a corner or a degenerate ring: the sphere's own normal is the honest answer
      if (nrm[p] === 0 && nrm[p + 1] === 0 && nrm[p + 2] === 0) { nrm[p] = cx; nrm[p + 1] = cy; nrm[p + 2] = cz; }
      continue;
    }
    const ga = (sud * svv - svd * suv) / det;
    const gb = (svd * suu - sud * suv) / det;
    // n ∝ (r/R)·r̂ − g_a·ê − g_b·n̂, exact for a radial height field
    const nx = _fc.x * (r / R) - _fa.x * ga - _fb.x * gb;
    const ny = _fc.y * (r / R) - _fa.y * ga - _fb.y * gb;
    const nz = _fc.z * (r / R) - _fa.z * ga - _fb.z * gb;
    const l = Math.hypot(nx, ny, nz) || 1;
    nrm[p] = nx / l; nrm[p + 1] = ny / l; nrm[p + 2] = nz / l;
  }
}

/* ----------------------------------------------------------- ground patch ---- */

// Grid plan: cells grow geometrically so the centre is walk-close detail and the
// rim is a coarse skirt out to ~3x the horizon. PATCH_HALF fixes the growth rate
// (the sum of the cells must reach it) and the cell ratio fixes the count.
const PATCH_K = Math.round(Math.log(PATCH_EDGE / PATCH_CELL) / Math.log(1 + (PATCH_CELL * (PATCH_EDGE / PATCH_CELL - 1)) / PATCH_HALF));
const PATCH_W = PATCH_K * 2 + 1;
const PATCH_G = Math.exp(Math.log(PATCH_EDGE / PATCH_CELL) / PATCH_K);
const PATCH_OFF = (() => {
  const o = new Float64Array(PATCH_K + 1);
  let r = 0, c = PATCH_CELL;
  for (let i = 1; i <= PATCH_K; i++) { r += c; o[i] = r; c *= PATCH_G; }
  return o;
})();
const PATCH_REACH = PATCH_OFF[PATCH_K];
// the grid's two axes: offsets from the centre vertex out both ways
const PATCH_AXIS = Float64Array.from({ length: PATCH_W }, (_, i) => (i < PATCH_K ? -PATCH_OFF[PATCH_K - i] : PATCH_OFF[i - PATCH_K]));

// The patch's normal fit runs over a stride-2 neighbourhood of the same grid: its
// footprint is ~1 u of ground at the centre (and grows with the cells outward)
// instead of one 0.25 u cell, so the shading normal follows the landform — the
// base's erosion detail is ~4.5 u — rather than the sharp creases the fBm carries at
// cell scale. Measured against the field's own ±0.6 u gradient: 7.7° → 4.6° mean
// deviation on the race flanks. No extra field sampling: the same vertex heights,
// read through a coarser connectivity that reaches every vertex.
function patchLattice() {
  const idx = [];
  for (let i = 0; i + 2 < PATCH_W; i++) {
    for (let j = 0; j + 2 < PATCH_W; j++) {
      const a = i * PATCH_W + j, b = a + 2, c = a + PATCH_W * 2;
      idx.push(a, c, b);
    }
  }
  return Uint32Array.from(idx);
}

/** Empty grid geometry with the globe's attribute set (positions land later). */
function patchGrid() {
  const n = PATCH_W * PATCH_W;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  for (const [name, size] of [['normal', 3], ['aHeight', 1], ['aSlope', 1], ['aRace', 1], ['aRange', 1], ['aSea', 1]]) {
    geo.setAttribute(name, new THREE.BufferAttribute(new Float32Array(n * size), size));
  }
  const idx = new Uint32Array((PATCH_W - 1) * (PATCH_W - 1) * 6);
  let k = 0;
  for (let i = 0; i < PATCH_W - 1; i++) {
    for (let j = 0; j < PATCH_W - 1; j++) {
      const a = i * PATCH_W + j, b = a + 1, c = a + PATCH_W, d = c + 1;
      idx[k++] = a; idx[k++] = c; idx[k++] = b;
      idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
  }
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}

/**
 * The camera-relative ground. Owns two grids so a rebuild is invisible until it is
 * whole, plus the uniforms that tell the globe's shader to stay out of the
 * footprint while the patch is drawn.
 * @returns { mesh, mask, ready, building, centre, update(dir, wanted), step() }
 */
function createPatch(features, planetMaterial) {
  const geos = [patchGrid(), patchGrid()];
  const rings = (() => {
    const lattice = patchLattice();
    const count = PATCH_W * PATCH_W;
    return [ringList(lattice, count), ringList(lattice, count)];
  })();
  const mesh = new THREE.Mesh(geos[0], patchMaterial(planetMaterial));
  mesh.name = 'ground-patch';
  mesh.visible = false;

  // The globe's shader reads these (see `maskGlobe`): the footprint's frame, its
  // half-extent in radians, and the camera's inverse view-projection to turn
  // gl_FragCoord back into a world direction.
  const mask = {
    centre: { value: new THREE.Vector3(0, 1, 0) },
    east: { value: new THREE.Vector3(1, 0, 0) },
    north: { value: new THREE.Vector3(0, 0, 1) },
    half: { value: PATCH_REACH / R },
    fade: { value: PATCH_FADE },
    on: { value: 0 },
    invVP: { value: new THREE.Matrix4() },
    res: { value: new THREE.Vector2(1, 1) },
  };

  const live = { centre: new THREE.Vector3(0, 1, 0), east: new THREE.Vector3(1, 0, 0), north: new THREE.Vector3(0, 0, 1), slot: 0, ready: false };
  const rebuild = { centre: new THREE.Vector3(), east: new THREE.Vector3(), north: new THREE.Vector3(), slot: 0, i: 0, stage: 0 };
  const q = new THREE.Vector3();
  const out = { h: 0, range: 0, race: 0, macro: 0 };
  let build = null;

  function rowHeights(b, i) {
    const g = geos[b.slot];
    const pos = g.attributes.position.array;
    const aH = g.attributes.aHeight.array, aR = g.attributes.aRace.array;
    const aG = g.attributes.aRange.array, aE = g.attributes.aSea.array;
    const a = PATCH_AXIS[i];
    for (let j = 0; j < PATCH_W; j++) {
      const k = i * PATCH_W + j;
      features.onSphere(b.centre, b.east, b.north, a, PATCH_AXIS[j], q);
      features.sample(q, out);
      const r = R + out.h;
      pos[k * 3] = q.x * r; pos[k * 3 + 1] = q.y * r; pos[k * 3 + 2] = q.z * r;
      aH[k] = out.h;
      aR[k] = out.race;
      aG[k] = out.range;
      aE[k] = out.h - features.seaLevel;
    }
  }

  function slopeRows(b, from, to) {
    const g = geos[b.slot];
    const pos = g.attributes.position.array;
    const nrm = g.attributes.normal.array;
    const aS = g.attributes.aSlope.array;
    for (let v = from; v < to; v++) {
      const p = v * 3;
      const l = Math.hypot(pos[p], pos[p + 1], pos[p + 2]) || 1;
      aS[v] = 1 - clamp((nrm[p] * pos[p] + nrm[p + 1] * pos[p + 1] + nrm[p + 2] * pos[p + 2]) / l, 0, 1);
    }
  }

  function publish() {
    live.centre.copy(build.centre);
    live.east.copy(build.east);
    live.north.copy(build.north);
    live.slot = build.slot;
    live.ready = true;
    const g = geos[live.slot];
    for (const name of ['position', 'normal', 'aHeight', 'aSlope', 'aRace', 'aRange', 'aSea']) g.attributes[name].needsUpdate = true;
    g.computeBoundingSphere();
    mesh.geometry = g;
    mask.centre.value.copy(live.centre);
    mask.east.value.copy(live.east);
    mask.north.value.copy(live.north);
  }

  return {
    mesh,
    mask,
    get building() { return !!build; },
    get ready() { return live.ready; },
    get centre() { return live.centre; },
    /** Request a rebuild under `dir` if the live grid is missing or has drifted. */
    update(dir, wanted) {
      if (!wanted || build) return;
      if (live.ready && live.centre.angleTo(dir) * R < PATCH_DRIFT) return;
      const ref = Math.abs(dir.y) > 0.9 ? _fa.set(1, 0, 0) : _fa.set(0, 1, 0);
      rebuild.centre.copy(dir);
      rebuild.east.crossVectors(ref, dir).normalize();
      rebuild.north.crossVectors(dir, rebuild.east).normalize();
      rebuild.slot = 1 - live.slot;
      rebuild.i = rebuild.stage = 0;
      build = rebuild;
    },
    /** Spread one frame's worth of rebuild work (PATCH_MS) across the grid. */
    step() {
      if (!build) return;
      const end = performance.now() + PATCH_MS;
      do {
        if (build.stage === 0) {
          rowHeights(build, build.i++);
          if (build.i >= PATCH_W) { build.i = 0; build.stage = 1; }
        } else {
          const to = Math.min(PATCH_W, build.i + 8);
          fitNormals(geos[build.slot], rings[build.slot], build.i * PATCH_W, to * PATCH_W);
          slopeRows(build, build.i * PATCH_W, to * PATCH_W);
          build.i = to;
          if (build.i >= PATCH_W) { publish(); build = null; }
        }
      } while (build && performance.now() < end);
    },
  };
}

// The patch is the same material as the globe — a clone sharing the *same*
// uniform objects, so anything a style animates stays in step between the two.
// (A clone is needed at all only because the globe's copy carries the mask
// below.) polygonOffset keeps the two depth-equal where the rim dissolves.
function patchMaterial(planetMaterial) {
  const mat = planetMaterial.clone ? planetMaterial.clone() : planetMaterial;
  if (mat.uniforms && planetMaterial.uniforms) mat.uniforms = planetMaterial.uniforms;
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -2;
  mat.polygonOffsetUnits = -2;
  return mat;
}

/**
 * Hide the globe inside the patch's footprint.
 *
 * The globe's 1 u facets miss the true surface by up to 2 u — drawn under a patch
 * that is nearly exact they poke through it as the same triangles the patch exists
 * to remove. So the terrain material gets one injected call that discards
 * fragments inside the footprint, and in a band at its rim dissolves them out
 * stochastically so the two surfaces hand over without a seam. gl_FragCoord plus
 * the camera's inverse view-projection recovers the fragment's world direction, so
 * this needs nothing from a style's own shader — not even a varying.
 * @returns {{ injected: boolean }} whether the injection found and patched main()
 */
function maskGlobe(material, u) {
  const state = { injected: false };
  const decl = `
uniform vec3 uPatchCentre;
uniform vec3 uPatchEast;
uniform vec3 uPatchNorth;
uniform float uPatchHalf;
uniform float uPatchFade;
uniform float uPatchOn;
uniform mat4 uPatchInvVP;
uniform vec2 uPatchRes;
float pcDither(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void pcDropPatch(){
  if (uPatchOn < 0.5) return;
  vec4 w = uPatchInvVP * vec4((gl_FragCoord.xy / uPatchRes) * 2.0 - 1.0, gl_FragCoord.z * 2.0 - 1.0, 1.0);
  vec3 f = normalize(w.xyz / w.w);
  float th = acos(clamp(dot(f, uPatchCentre), -1.0, 1.0));
  float m = th * max(abs(dot(f, uPatchEast)), abs(dot(f, uPatchNorth))) / (max(sin(th), 1e-6) * uPatchHalf);
  if (m >= 1.0) return;
  // Dissolve into the globe over the outer band, on a grid fixed in the world
  // rather than in screen space: the two surfaces differ by up to ~1.4 u at the
  // rim, and a screen-space dither would shimmer (and every style that reads depth
  // back — ink draws its contours from it — would see the noise move).
  float k = smoothstep(uPatchFade, 1.0, m);
  if (k > 0.0 && pcDither(floor(f * 64.0).xy) < k) return;
  discard;
}
`;
  const before = material.onBeforeCompile;
  material.onBeforeCompile = function (shader, renderer) {
    if (before) before.call(this, shader, renderer);
    shader.uniforms.uPatchCentre = u.centre;
    shader.uniforms.uPatchEast = u.east;
    shader.uniforms.uPatchNorth = u.north;
    shader.uniforms.uPatchHalf = u.half;
    shader.uniforms.uPatchFade = u.fade;
    shader.uniforms.uPatchOn = u.on;
    shader.uniforms.uPatchInvVP = u.invVP;
    shader.uniforms.uPatchRes = u.res;
    const patched = shader.fragmentShader.replace(/void\s+main\s*\(\s*\)\s*\{/, 'void main() {\n  pcDropPatch();\n');
    state.injected = patched !== shader.fragmentShader;
    shader.fragmentShader = decl + patched;
  };
  return state;
}

/* ------------------------------------------------------------- runner ------ */

// The runner figure lives in runner.js: one continuous, smooth, faceless body with a
// procedural gait. Same return shape, units and orientation as the rig it replaced.
export { createRunner };

/* ------------------------------------------------------------ the app ------ */

// The sphere a feature object really occupies in the world: the centre of its
// box, and the furthest vertex from it. A sphere drawn round the box's corners
// instead over-states a tall, narrow thing like the monument badly enough to
// miss a perfectly good shot of it. The flat washes the style lays on the ground
// around a feature (`userData.groundWash`: cast shadows, pools) are the ground it
// stands on rather than the thing itself, so they count for neither.
const sphereBox = new THREE.Box3();
const sphereV = new THREE.Vector3();
function boundingSphere(obj, out) {
  obj.updateWorldMatrix(true, true);
  const parts = [];
  obj.traverseVisible((k) => {
    if (k.geometry && k.geometry.attributes && k.geometry.attributes.position) parts.push(k);
  });
  const solid = parts.filter((k) => !k.userData.groundWash);
  const size = solid.length ? solid : parts; // a style that only painted washes still needs a sphere
  sphereBox.makeEmpty();
  for (const k of size) {
    const pos = k.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) sphereBox.expandByPoint(sphereV.fromBufferAttribute(pos, i).applyMatrix4(k.matrixWorld));
  }
  if (sphereBox.isEmpty()) {
    obj.getWorldPosition(out.center);
    out.radius = 0;
    return out;
  }
  sphereBox.getCenter(out.center);
  let r = 0;
  for (const k of size) {
    const pos = k.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) r = Math.max(r, sphereV.fromBufferAttribute(pos, i).applyMatrix4(k.matrixWorld).distanceTo(out.center));
  }
  out.radius = r;
  return out;
}

// The chase camera that `targetState` builds — pitched up, looking at head
// height — so where a landmark's bounding sphere lands in the frame depends only
// on how far back that camera gets to stand. Same camera here, to pick a landing.
const standPivot = new THREE.Vector3();
const standFacing = new THREE.Vector3();
const standAxis = new THREE.Vector3();
const standLat = new THREE.Vector3();
const standDir = new THREE.Vector3();
const standLook = new THREE.Vector3();
const standV = new THREE.Vector3();
const standC = new THREE.Vector3();

/**
 * The distance the chase camera must stand behind a runner at `spot` for the
 * landmark's whole bounding sphere to sit inside the frame (`shot.halfAngle`
 * already carries the margin), and which the ground actually leaves room for.
 * `yaw` swings it round from dead astern, exactly as `chase.yaw` does. 0 when
 * there is no such view from here — or, with `needRoom`, none the ground
 * leaves room for.
 */
function framedDist(features, f, spot, shot, yaw, facing = f.dir, needRoom = false) {
  const sphere = shot.sphere;
  standPivot.copy(spot).multiplyScalar(R + features.heightAt(spot));
  standFacing.copy(facing).addScaledVector(spot, -facing.dot(spot)).normalize();
  // dead astern is −facing; `yaw` turns it about the local up, as chase.yaw does
  standLat.copy(standFacing).multiplyScalar(-Math.cos(yaw)).addScaledVector(standAxis.copy(spot).cross(standFacing), -Math.sin(yaw));
  standDir.copy(spot).multiplyScalar(Math.sin(P['camera.chasePitch'])).addScaledVector(standLat, Math.cos(P['camera.chasePitch'])).normalize();
  standLook.copy(standPivot).addScaledVector(spot, CHASE_LOOK);
  let framed = 0;
  for (let d = P['camera.chaseDist']; d <= FRAME_MAX + 1e-6; d += 0.25) {
    standC.copy(sphere.center).addScaledVector(standDir, -d).sub(standPivot); // camera → the object
    const dist = standC.length();
    if (dist <= sphere.radius) continue;
    standV.copy(standLook).addScaledVector(standDir, -d).sub(standPivot).normalize(); // camera → what it looks at
    const off = Math.acos(clamp(standC.dot(standV) / dist, -1, 1)) + Math.asin(Math.min(1, sphere.radius / dist));
    if (off > shot.halfAngle) continue;
    if (!framed) framed = d;
    if (shot.room(standPivot, standDir, d) >= d - 0.05) return d;
  }
  return needRoom ? 0 : framed;
}

// Ground a runner can be put down on: clear of the sea, and no sliver in it —
// the ground two units round stays dry too.
const drySpan = { low: 0, high: 0 };
function dryAt(features, dir) {
  return features.heightAt(dir) >= features.seaLevel + LAND_CLEAR
    && groundSpan(features.heightAt, dir, 2, drySpan).low >= features.seaLevel;
}

// The dry ground nearest `centre` (see dryAt): out ring by ring, then anywhere.
function nearestDry(features, centre) {
  const c = centre.clone().normalize();
  if (dryAt(features, c)) return c;
  const ref = Math.abs(c.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const east = new THREE.Vector3().crossVectors(ref, c).normalize();
  const north = new THREE.Vector3().crossVectors(c, east).normalize();
  const probe = new THREE.Vector3();
  for (let radius = 3; radius <= 90; radius += 3) {
    const steps = Math.max(12, Math.ceil(TAU * radius / 4));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * TAU;
      onSphere(c, east, north, Math.cos(a) * radius, Math.sin(a) * radius, probe);
      if (dryAt(features, probe)) return probe.clone();
    }
  }
  let best = null, bestAngle = Infinity;
  for (let i = 0; i < 800; i++) {
    const y = 1 - (i / 799) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = Math.PI * (3 - Math.sqrt(5)) * i;
    probe.set(Math.cos(a) * r, y, Math.sin(a) * r);
    if (!dryAt(features, probe)) continue;
    const angle = c.angleTo(probe);
    if (angle < bestAngle) { bestAngle = angle; best = probe.clone(); }
  }
  return best || c;
}

/**
 * Where `?at=<featureId>` drops the runner, and which way they face.
 *
 * A landmark is something to stand in front of, not inside: the runner lands
 * STAND_RADII radii + STAND_CLEAR units out from the landmark's own bounding
 * sphere (SPOT_BACK where the style built no object) on the sunlit side, walking
 * round the compass past water, the waterline and any bearing the chase camera
 * cannot back away from far enough to frame it — facing it, with both in view. A
 * range has no object to stand beside, so the runner lands on its highest crest,
 * facing along the crest, or on the dry ground nearest it where the sea has it.
 *
 * `shot` is the framing gate: the object's world bounding sphere, the half-angle
 * of the frame it has to fit inside, and the camera's own ground-clearance test.
 * @returns {{dir, facing, camDist, camYaw}} camDist is the chase pull-back the
 * landmark needs (0: the default distance frames it, or nothing here did), and
 * camYaw the swing off dead astern that keeps a landmark narrow enough to hide
 * behind the runner out where it can be seen beside them.
 */
function featureStart(features, f, sun, shot) {
  const up = new THREE.Vector3(0, 1, 0);
  if (f.spawn) {
    const dir = f.spawn.clone();
    const facing = (f.spawnTangent || features.spawnTangent || new THREE.Vector3(0, 0, 1)).clone();
    return { dir, facing, camDist: shot ? framedDist(features, f, dir, shot, 0, facing) : 0, camYaw: 0 };
  }
  const ref = Math.abs(f.dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : up;
  const east = new THREE.Vector3().crossVectors(ref, f.dir).normalize();
  const north = new THREE.Vector3().crossVectors(f.dir, east).normalize();
  if (f.kind === 'lagoon') {
    const basin = features.lagoons.find((b) => b.featureId === f.id);
    if (basin) {
      const hub = shot ? shot.sphere.center.clone().normalize() : null;
      const toward = hub
        ? hub.addScaledVector(f.dir, -hub.dot(f.dir)).normalize()
        : new THREE.Vector3().copy(sun).addScaledVector(f.dir, -sun.dot(f.dir)).normalize();
      const first = toward.lengthSq() > 1e-6 ? Math.atan2(toward.dot(north), toward.dot(east)) : 0;
      const to = new THREE.Vector3();
      const stand = basin.radius + 3;
      for (let i = 0; i < 24; i++) {
        const a = first + (i === 0 ? 0 : (i % 2 ? -1 : 1) * Math.ceil(i / 2) * Math.PI / 12);
        features.onSphere(f.dir, east, north, Math.cos(a) * stand, Math.sin(a) * stand, to);
        to.normalize();
        if (!dryAt(features, to)) continue;
        const facing = f.dir.clone().addScaledVector(to, -f.dir.dot(to)).normalize();
        return { dir: to.clone(), facing, camDist: 16, camYaw: 0.28 };
      }
    }
  }
  if (f.kind === 'range' || f.kind === 'valley') {
    const r = features.routes.find((rr) => rr.featureId === f.id);
    if (r) {
      const n = r.seg.length / 3;
      const p = new THREE.Vector3();
      let best = -Infinity, bestI = 0;
      for (let i = 0; i < n; i++) {
        p.set(r.seg[i * 3], r.seg[i * 3 + 1], r.seg[i * 3 + 2]);
        const h = features.heightAt(p);
        if (h > best) { best = h; bestI = i; }
      }
      const j = Math.min(bestI + 1, n - 1), k = Math.max(bestI - 1, 0);
      const dir = new THREE.Vector3(r.seg[bestI * 3], r.seg[bestI * 3 + 1], r.seg[bestI * 3 + 2]);
      const facing = new THREE.Vector3(
        r.seg[j * 3] - r.seg[k * 3],
        r.seg[j * 3 + 1] - r.seg[k * 3 + 1],
        r.seg[j * 3 + 2] - r.seg[k * 3 + 2],
      ).normalize();
      facing.addScaledVector(dir, -facing.dot(dir));
      if (facing.lengthSq() > 1e-9) {
        facing.normalize();
        if (!dryAt(features, dir)) {
          // the sea has the crest (or a valley's floor): the dry ground nearest
          // it, still facing along the course
          dir.copy(nearestDry(features, dir));
          facing.addScaledVector(dir, -facing.dot(dir)).normalize();
        }
        return { dir, facing };
      }
    }
  }
  const s = new THREE.Vector3().copy(sun).addScaledVector(f.dir, -sun.dot(f.dir));
  const sunlit = s.lengthSq() > 1e-6 ? Math.atan2(s.dot(north), s.dot(east)) : 0;
  // A pitch is a thing the visitor walks out onto rather than stands in front
  // of: its bounding sphere is the whole field, so standing clear of the sphere
  // would leave the field a sliver at the horizon — and its ends are goals, so
  // standing off its length would put a 2 u net between the camera and the
  // runner. They are put down at the halfway line, a few paces off a touchline,
  // facing across the field on the side the light comes from: the way a field is
  // seen, with the goals on the wings.
  let bearing = sunlit;
  let stand = shot ? STAND_RADII * shot.sphere.radius + STAND_CLEAR : SPOT_BACK;
  if (f.kind === 'pitch') {
    const along = new THREE.Vector3(1, 0, 0).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, f.dir));
    const side = Math.atan2(along.dot(north), along.dot(east)) + Math.PI / 2;
    bearing = Math.abs(wrapPi(side - sunlit)) <= Math.abs(wrapPi(side + Math.PI - sunlit)) ? side : wrapPi(side + Math.PI);
    stand = Math.max(2, (f.width || 0) * 0.5 - 2);
  }
  // …and measured from the object's own centre, not the feature's ground point: a
  // painted cast shadow runs a long way off it, and it is the object we are framing.
  const hub = shot ? shot.sphere.center.clone().normalize() : f.dir;
  const to = new THREE.Vector3();
  let dir = null, camDist = 0, camYaw = 0, dry = null;
  // a bearing the camera has room to back away on first; only failing any,
  // one it frames the object from without that room
  for (let pass = 0; pass < 2 && !dir; pass++) {
    for (let i = 0; i < 24 && !dir; i++) {
      const a = bearing + (i === 0 ? 0 : (i % 2 ? -1 : 1) * Math.ceil(i / 2) * (Math.PI / 12));
      features.onSphere(hub, east, north, Math.cos(a) * stand, Math.sin(a) * stand, to);
      to.normalize();
      if (!dryAt(features, to)) continue;
      if (!dry) dry = to.clone();
      if (shot) {
        camDist = framedDist(features, f, to, shot, 0, f.dir, pass === 0);
        if (!camDist) continue;
        camYaw = 0;
        // The runner stands between the camera and whatever they face, so a
        // landmark no wider than the figure would sit behind it. Swing the camera
        // round until the whole object clears them — but only where the frame can
        // still hold it off to the side: a big landmark is left dead ahead.
        const w = Math.atan(RUNNER_HALF / camDist);
        const alpha = Math.asin(Math.min(1, shot.sphere.radius / (camDist + stand)));
        if (w + 2 * alpha <= shot.halfAngle) {
          const swing = ((w + alpha) * (camDist + stand)) / stand;
          // …to the sunlit side, so the object is looked at across its own light
          const base = Math.atan2(-standFacing.dot(north), -standFacing.dot(east));
          const side = Math.abs(wrapPi(base + swing - bearing)) <= Math.abs(wrapPi(base - swing - bearing)) ? 1 : -1;
          const swung = framedDist(features, f, to, shot, side * swing);
          if (swung) { camDist = swung; camYaw = side * swing; }
        }
      }
      dir = to.clone();
    }
  }
  if (!dir) {
    // nowhere here frames the object: fall back to the sunlit side, or the dry
    // ground nearest it
    dir = dry || nearestDry(features, features.onSphere(hub, east, north, stand, 0));
    camDist = 0;
    camYaw = 0;
  }
  return { dir, facing: f.dir.clone().addScaledVector(dir, -f.dir.dot(dir)).normalize(), camDist, camYaw };
}

const CSS = `
.pc-hud{position:fixed;left:16px;bottom:16px;display:flex;align-items:center;flex-wrap:wrap;gap:8px;z-index:9;font-family:var(--fg-font,ui-monospace,Menlo,monospace)}
.pc-hud button{appearance:none;border:1px solid color-mix(in srgb,var(--fg-accent,#9fd2ff) 45%,transparent);background:var(--fg-bg,rgba(12,14,18,.82));color:var(--fg-ink,#eef1f4);font:inherit;font-size:12px;letter-spacing:.04em;padding:7px 12px;border-radius:999px;cursor:pointer}
.pc-hud button:hover{border-color:var(--fg-accent,#9fd2ff);color:var(--fg-accent,#9fd2ff)}
.pc-hint{color:var(--fg-ink,#eef1f4);background:var(--fg-bg,rgba(12,14,18,.82));border:1px solid color-mix(in srgb,var(--fg-accent,#9fd2ff) 28%,transparent);border-radius:999px;padding:7px 12px;font-size:11px;transition:opacity 1s ease}
.pc-hint.off{opacity:0;pointer-events:none}
.pc-guide{position:fixed;left:16px;top:16px;width:min(330px,72vw);max-height:min(70vh,560px);overflow:auto;z-index:9;background:var(--fg-bg,rgba(12,14,18,.82));color:var(--fg-ink,#eef1f4);font-family:var(--fg-font,ui-monospace,Menlo,monospace);font-size:12px;line-height:1.45;border:1px solid color-mix(in srgb,var(--fg-accent,#9fd2ff) 28%,transparent);border-radius:10px;padding:12px 14px;backdrop-filter:blur(6px)}
.pc-guide[hidden]{display:none}
.pc-guide h2{margin:0 0 8px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--fg-accent,#9fd2ff);font-weight:600}
.pc-guide-hint{margin:0 0 8px;opacity:.7}
.pc-guide-world{margin:10px 0 4px}
.pc-guide-world h3{margin:0 0 4px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--fg-accent,#9fd2ff);font-weight:600}
.pc-guide .pc-guide-world li{padding:4px 0;padding-right:0;cursor:default;opacity:.82}
.pc-guide ul{margin:0;padding:0;list-style:none}
.pc-guide li{padding:6px 0;border-top:1px solid color-mix(in srgb,var(--fg-ink,#eef1f4) 10%,transparent);cursor:pointer}
.pc-guide li:hover .pc-label,.pc-guide li[data-active] .pc-label{color:var(--fg-accent,#9fd2ff)}
.pc-label{display:block;font-weight:600}
.pc-detail{display:block;opacity:.62}
.pc-guide li{position:relative;padding-right:44px}
.pc-guide .pc-label,.pc-guide .pc-detail{padding-right:40px}
.pc-guide .pc-go{position:absolute;right:0;top:50%;transform:translateY(-50%);appearance:none;border:0;background:none;color:var(--fg-accent,#9fd2ff);font:inherit;font-size:11px;cursor:pointer;padding:4px}
.pc-why{position:fixed;right:18px;bottom:18px;width:min(300px,calc(100vw - 36px));box-sizing:border-box;z-index:10;color:var(--fg-ink,#eef1f4);background:var(--fg-bg,rgba(12,14,18,.82));border:1px solid color-mix(in srgb,var(--fg-accent,#9fd2ff) 28%,transparent);border-radius:10px;padding:10px 14px;font:12px/1.45 var(--fg-font,ui-monospace,Menlo,monospace);opacity:0;visibility:hidden;cursor:pointer}
.pc-why[hidden],html.embed .pc-why{display:none}
.pc-why b{display:block;margin-bottom:3px;color:var(--fg-accent,#9fd2ff);font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:600}
.pc-why p{margin:0}
[data-pc-painted]>.pc-why{animation:pc-why 9s ease .8s both}
@keyframes pc-why{0%{opacity:0;visibility:visible}8%,82%{opacity:1;visibility:visible}100%{opacity:0;visibility:hidden}}
.pc-near.can-interact::after{content:'E';display:inline-block;margin-left:7px;padding-left:7px;border-left:1px solid currentColor;font-weight:700}
.pc-info{position:fixed;right:18px;top:18px;width:min(370px,calc(100vw - 36px));max-height:calc(100vh - 36px);overflow:auto;box-sizing:border-box;z-index:11;color:var(--fg-ink,#eef1f4);background:var(--fg-bg,rgba(12,14,18,.92));border:1px solid color-mix(in srgb,var(--fg-accent,#9fd2ff) 35%,transparent);border-radius:10px;padding:16px 18px;font:12px/1.45 var(--fg-font,ui-monospace,Menlo,monospace);backdrop-filter:blur(8px)}
.pc-info[hidden]{display:none}
.pc-info h2{margin:0 28px 2px 0;color:var(--fg-accent,#9fd2ff);font-size:15px;line-height:1.25}
.pc-info .pc-info-detail{margin:0 0 12px;opacity:.65}
.pc-info table{width:100%;border-collapse:collapse;margin:0 0 12px}
.pc-info th,.pc-info td{padding:4px 0;border-top:1px solid color-mix(in srgb,var(--fg-ink,#eef1f4) 10%,transparent);text-align:left;vertical-align:baseline}
.pc-info th{font-weight:400;opacity:.62}
.pc-info td{text-align:right}
.pc-info small{display:block;font-size:10px;opacity:.55}
.pc-info ul{margin:0;padding-left:18px}
.pc-info li+li{margin-top:5px}
.pc-info .pc-info-close{position:absolute;right:10px;top:8px;border:0;background:none;color:var(--fg-ink,#eef1f4);font:20px/1 var(--fg-font,ui-monospace,Menlo,monospace);cursor:pointer}
.pc-near{position:fixed;transform:translate(-50%,-50%);pointer-events:none;z-index:8;font-family:var(--fg-font,ui-monospace,Menlo,monospace);font-size:11px;letter-spacing:.03em;color:var(--fg-ink,#eef1f4);background:var(--fg-bg,rgba(12,14,18,.72));border:1px solid color-mix(in srgb,var(--fg-accent,#9fd2ff) 30%,transparent);padding:3px 8px;border-radius:999px;opacity:0;transition:opacity .45s ease}
.pc-near.on{opacity:1}
.pc-arrow{position:fixed;left:50%;top:64px;width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:14px solid var(--fg-accent,#9fd2ff);transform-origin:50% 90%;pointer-events:none;z-index:8;opacity:0;transition:opacity .3s ease}
.pc-arrow.on{opacity:.85}
.pc-arrow b{position:absolute;left:-42px;top:20px;width:84px;text-align:center;font-family:var(--fg-font,ui-monospace,Menlo,monospace);font-size:11px;font-weight:400;color:var(--fg-ink,#eef1f4)}
.pc-touch{position:fixed;inset:0;pointer-events:none;display:none}
.pc-stick,.pc-knob{position:absolute;left:0;top:0;border-radius:50%;opacity:0;transition:opacity .25s ease}
.pc-stick{width:120px;height:120px;margin:-60px 0 0 -60px;border:1px solid color-mix(in srgb,var(--fg-accent,#9fd2ff) 45%,transparent);background:rgba(12,14,18,.3)}
.pc-knob{width:48px;height:48px;margin:-24px 0 0 -24px;background:color-mix(in srgb,var(--fg-accent,#9fd2ff) 70%,transparent)}
.pc-touch.held .pc-stick,.pc-touch.held .pc-knob{opacity:1}
.pc-hud .pc-touch button{position:absolute;right:16px;min-width:64px;min-height:48px;pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}
.pc-hud .pc-jump{bottom:20px}
.pc-hud .pc-inspect{bottom:84px}
.pc-hud .pc-inspect[hidden]{display:none}
@media (pointer:coarse){.pc-touch.on{display:block}.pc-hud{max-width:calc(100vw - 150px)}.pc-near.can-interact::after{content:none}}
`;

const NEUTRAL = {
  name: 'neutral',
  palette: { sky: 0x0b1017, land: 0x6f7a5e, sea: 0x2a5c8a, body: 0xdcdfe4, accent: 0x6e7a8c },
  setupScene({ THREE: T, scene, uniforms }) {
    scene.background = new T.Color(0x8fb6d6);
    const sun = new T.DirectionalLight(0xfff2df, 2.4);
    sun.position.copy(uniforms.uSunDir.value);
    scene.add(sun, new T.HemisphereLight(0xdff0ff, 0x3a4436, 1.6));
  },
  planetMaterial: ({ THREE: T }) => new T.MeshLambertMaterial({ color: 0x6f7a5e }),
  oceanMaterial: ({ THREE: T }) => new T.MeshLambertMaterial({ color: 0x2a5c8a }),
  featureObject({ THREE: T, feature, features }) {
    const g = new T.Group();
    const grey = new T.MeshLambertMaterial({ color: 0xb8bcc2 });
    const dark = new T.MeshLambertMaterial({ color: 0x4a4f57 });
    if (feature.kind === 'monument') {
      const spire = new T.Mesh(new T.ConeGeometry(0.8, 5.4, 6), grey);
      spire.position.y = 2.7;
      g.add(spire, new T.Mesh(new T.CylinderGeometry(1.5, 1.7, 0.5, 12), dark));
    } else if (feature.kind === 'calm') {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const s = new T.Mesh(new T.IcosahedronGeometry(0.34 + 0.12 * Math.sin(i * 2.3), 0), grey);
        s.position.set(Math.cos(a) * 2.1, 0.2, Math.sin(a) * 2.1);
        g.add(s);
      }
    } else if (feature.kind === 'constructed') {
      const deck = new T.Mesh(new T.BoxGeometry(1.5, 0.22, 2.6), dark);
      deck.position.y = 0.35;
      const post = new T.Mesh(new T.BoxGeometry(1.1, 1.3, 0.16), grey);
      post.position.set(0, 1.05, 1.2);
      g.add(deck, post);
    } else if (feature.kind === 'spires') {
      for (let i = 0; i < 5; i++) {
        const spire = new T.Mesh(new T.ConeGeometry(0.35 + i * 0.05, 1.8 + i * 0.45, 5), i % 2 ? dark : grey);
        spire.position.set((i - 2) * 0.65, spire.geometry.parameters.height / 2, (i % 2) * 0.55);
        g.add(spire);
      }
    } else if (feature.kind === 'wheel') {
      const wheel = new T.Mesh(new T.TorusGeometry(1.5, 0.18, 8, 24), grey);
      wheel.position.y = 1.55;
      g.add(wheel);
    } else if (feature.kind === 'lagoon') {
      const waterY = Math.max(0, features.seaLevel - features.heightAt(feature.dir));
      const marker = new T.Mesh(new T.CylinderGeometry(0.32, 0.42, 1.8, 8), dark);
      const cap = new T.Mesh(new T.SphereGeometry(0.62, 10, 7), grey);
      marker.position.y = waterY + 0.9;
      cap.position.y = waterY + 1.9;
      g.add(marker, cap);
    } else if (feature.kind === 'cairn') {
      for (let i = 0; i < 4; i++) {
        const stone = new T.Mesh(new T.SphereGeometry(0.65 - i * 0.11, 8, 5), i % 2 ? grey : dark);
        stone.scale.y = 0.55;
        stone.position.y = 0.28 + i * 0.48;
        g.add(stone);
      }
    } else if (feature.kind === 'pitch') {
      const span = Number.isFinite(feature.span) ? feature.span : 20;
      const wide = Number.isFinite(feature.width) ? feature.width : span * 0.62;
      const turf = new T.Mesh(new T.BoxGeometry(span, 0.14, wide), new T.MeshLambertMaterial({ color: 0x5f8f6a }));
      turf.position.y = 0.07;
      turf.userData.groundWash = true;
      g.add(turf);
      const line = new T.Mesh(new T.BoxGeometry(0.22, 0.05, wide), new T.MeshLambertMaterial({ color: 0xe6dfcd }));
      line.position.y = 0.16;
      line.userData.groundWash = true;
      g.add(line);
      for (const s of [-1, 1]) {
        const goal = new T.Mesh(new T.BoxGeometry(0.22, 1.3, 2.4), grey);
        goal.position.set(s * (span / 2 - 0.1), 0.72, 0);
        g.add(goal);
      }
    } else {
      return null;
    }
    return g;
  },
  runnerMaterials: ({ THREE: T }) => ({ body: new T.MeshLambertMaterial({ color: 0xdcdfe4 }), accent: new T.MeshLambertMaterial({ color: 0x6e7a8c }) }),
  postprocess: () => null,
  update() {},
};

/**
 * Build the planet and run it.
 * @param {{style?: object, container?: HTMLElement, seed?: object}} opts
 */
export async function createApp(opts = {}) {
  const style = opts.style || {};
  const hook = (k) => (typeof style[k] === 'function' ? style[k].bind(style) : NEUTRAL[k]);
  await loadWorlds(P['world.archetype']); // a world other than classic is fetched before the week is read
  const features = readWeek(opts.seed || window.SEED);
  // the closest the orbit comes: one more inward wheel step from here lands
  const ORBIT_NEAR = R + features.orbit.floor;
  const host = opts.container || document.body;
  const params = new URLSearchParams(location.search);
  const fixedT = params.has('t') ? Number(params.get('t')) || 0 : null;
  const poseNumber = (name, fallback) => {
    const raw = params.get(name);
    if (raw == null) return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  };
  const yawOffset = fixedT == null ? 0 : poseNumber('yaw', 0) * RAD;
  const pitchOffset = fixedT == null ? 0 : poseNumber('pitch', 0) * RAD;
  const distMultiplier = fixedT == null ? 1 : Math.max(0.1, poseNumber('dist', 1));
  let overrideT = null;
  const frameRequests = [];
  let frameRequestAt = 0, activeFrameRequest = null;
  // Embedded (?embed=1): a page holding the planet in a frame (the galaxy: galaxy-dive.js) hands it the zoom at the
  // page's own picture of it, the seat: its poster's crop square, as many CSS px across (box) in the middle of the
  // frame. Past the poster the lens opens (wide, 1 the poster's own) until the poster is the seat's size; zoomed out
  // past that the planet hands the zoom back (handBack, the zoom left over) and is held: it draws nothing and sends
  // the page every zoom it is given. A page shows it (hold off) when it is ready to.
  const embed = params.get('embed') === '1';
  if (embed) document.documentElement.classList.add('embed');
  const seat = { box: 0 };
  let wide = 1, held = false, handBack = 0;
  const tell = (type, by) => { if (embed && parent !== window) parent.postMessage({ source: 'planet', type, by }, location.origin); };

  const uniforms = {
    uTime: { value: fixedT || 0 },
    uSunDir: { value: features.sunDirection?.clone() || new THREE.Vector3(0.55, 0.72, 0.42).normalize() },
    uWarmth: { value: features.warmth },
    uEnergy: { value: features.energy },
    uSeaLevel: { value: features.seaLevel },
    uRadius: { value: R },
    // the build (build.js), for what only a shader can bring in: x the week's body (its crown, its deck), y the race's
    // own marks, z its life; (1, 1, 1), the whole week, except while a build plays
    uBuild: { value: new THREE.Vector3(1, 1, 1) },
  };

  await pace();
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setPixelRatio(1); // resized to the adaptive budget once the post stack exists

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(P['camera.fov'], 1, 0.1, 5000);
  const CENTER = new THREE.Vector3();

  // The build, phase by phase, each handing the page a turn as it goes (pace.js): the style's scene (the survey bake,
  // the week's body, life and companions), the globe, the ground, the runner, the passes. The canvas and the HUD go
  // in after, in one task, so nothing on the page is half built while it can be seen or used.
  await pace();
  await hook('setupScene')({ THREE, scene, renderer, features, uniforms });
  await pace();

  const planetMaterial = hook('planetMaterial')({ THREE, features, uniforms });
  const planet = new THREE.Mesh(await buildPlanetGeometry(features, { maxHeight: features.orbit.reliefCap }), planetMaterial);
  planet.name = 'planet';
  scene.add(planet);

  await pace();
  // The fine ground under the viewer, and the globe's promise to stay out of it.
  const patch = createPatch(features, planetMaterial);
  scene.add(patch.mesh);
  const mask = maskGlobe(planetMaterial, patch.mask);
  // Styles that drape geometry can follow the same capped-globe/full-patch
  // handoff as the ground instead of guessing from camera mode.
  uniforms.patchMask = patch.mask;
  const oceanMat = hook('oceanMaterial')({ THREE, features, uniforms });
  const ocean = oceanMat ? new THREE.Mesh(buildOceanGeometry(features), oceanMat) : null;
  if (ocean) scene.add(ocean);
  const up = new THREE.Vector3(0, 1, 0);
  if (oceanMat) {
    for (const basin of features.lagoons) {
      if (!basin.localWater) continue;
      const geo = new THREE.CircleGeometry(basin.radius * 0.92, 64).rotateX(-Math.PI / 2);
      const water = new THREE.Mesh(geo, oceanMat);
      water.name = `${basin.featureId}-water`;
      water.position.copy(basin.dir).multiplyScalar(R + basin.waterLevel + 0.02);
      water.quaternion.setFromUnitVectors(up, basin.dir);
      scene.add(water);
    }
  }

  function makeFeatureObject(f) {
    const ctx = { THREE, feature: f, features, uniforms, camera };
    let obj = hook('featureObject')(ctx);
    if (!obj && style.name === 'neutral') obj = NEUTRAL.featureObject(ctx);
    if (!obj) return null;
    const h = features.heightAt(f.dir);
    obj.position.copy(f.dir).multiplyScalar(R + h);
    obj.quaternion.setFromUnitVectors(up, f.dir);
    obj.userData.feature = f;
    return obj;
  }
  const featureObjects = new Map();
  for (const f of features.list) {
    await pace();
    const obj = makeFeatureObject(f);
    if (!obj) continue;
    scene.add(obj);
    featureObjects.set(f.id, obj);
  }

  await pace();
  const runner = await createRunner(hook('runnerMaterials')({ THREE, uniforms }), features);
  scene.add(runner.object3D);
  await pace();
  const post = await hook('postprocess')({ THREE, renderer, scene, camera, features });
  // lod is the feature level asked for and lodK the level the style draws with as it fades there; lodFloor and floor
  // are how low each ladder may go (a step that bought nothing lowers them); settle is how long a change is given
  const perf = {
    dpr: 1, frameMs: 16.7, step: 0, slow: 0, stable: 0, changedAt: -Infinity, settle: 5, from: null,
    floor: DPR_LEVELS.length - 1, probe: 12, rose: false,
    lod: 0, lodK: 0, lodFloor: Math.max(0, style.lodLevels | 0), lodPinned: false,
  };
  const perfBuffer = new THREE.Vector2();

  // Feature bounding spheres: the chase camera must never sit inside one, and the
  // runner→camera ray must never pass through one.
  const featureSpheres = [];
  const featureSphereOf = new Map();
  function refreshFeatureSpheres() {
    featureSpheres.length = 0;
    featureSphereOf.clear();
    for (const [id, obj] of featureObjects) {
      const sphere = boundingSphere(obj, new THREE.Sphere());
      if (sphere.radius > 0.05) featureSpheres.push(sphere);
      featureSphereOf.set(id, sphere);
    }
  }
  refreshFeatureSpheres();
  await pace();
  host.appendChild(renderer.domElement);

  /* ---------------------------------------------------------------- HUD --- */
  const styleEl = document.createElement('style');
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);
  const q = (cls, text, tag = 'div') => {
    const el = document.createElement(tag);
    el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  };
  const hud = q('pc-hud');
  const btnLand = q('', 'Land', 'button');
  const btnOrbit = q('', 'Orbit', 'button');
  const btnGuide = q('', 'Field guide', 'button');
  // a touch screen is told its own ways in (see input), none of the keys it has not got
  const touchUI = matchMedia('(pointer: coarse)');
  const hintText = touchUI.matches
    ? 'Left thumb run · pinch land / leave'
    : 'WASD run · Space jump · E inspect · scroll land / leave';
  const hint = q('pc-hint', hintText);
  // On foot on a touch screen: the thumb stick's ring and knob, shown where the left thumb holds it, Jump, and Inspect
  // while a landmark is near enough to ask about. Laid before the hint, so a page that hides what follows it keeps them.
  const touchPad = q('pc-touch');
  const stickRing = q('pc-stick'), stickKnob = q('pc-knob');
  const btnInspect = q('pc-inspect', 'Inspect', 'button'), btnJump = q('pc-jump', 'Jump', 'button');
  btnInspect.hidden = true;
  touchPad.append(stickRing, stickKnob, btnInspect, btnJump);
  hud.append(btnLand, btnOrbit, btnGuide, touchPad, hint);
  hud.addEventListener('click', (e) => e.target.closest('button')?.blur());
  const guide = q('pc-guide');
  guide.hidden = true;
  const guideWorld = q('pc-guide-world');
  guideWorld.hidden = true;
  const worldReasons = q('', null, 'ul');
  guideWorld.append(q('', 'This world', 'h3'), worldReasons);
  function syncPaletteGuide() {
    const reasons = Array.isArray(window.__app?.palette?.reasons) ? window.__app.palette.reasons : [];
    guideWorld.hidden = !reasons.length;
    worldReasons.replaceChildren(...reasons.map((reason) => q('', reason, 'li')));
  }

  // What kind of world the week is and why, in its own numbers (bodies/*.js reason): a slip on arrival that fades
  // (CSS, from the first frame) or goes on a tap, and the same words kept at the top of the field guide. A rocky
  // planet says nothing extra.
  const kind = features.body?.reason ? features.body : null;
  const guideKind = q('pc-guide-world');
  guideKind.hidden = !kind;
  const why = kind ? q('pc-why') : null;
  if (kind) {
    const said = q('', null, 'li'), list = q('', null, 'ul');
    said.append(q('', `${kind.label}. `, 'b'), kind.reason);
    list.append(said);
    guideKind.append(q('', 'What kind of world', 'h3'), list);
    why.setAttribute('role', 'note');
    why.append(q('', `Why ${/^[aeiou]/i.test(kind.label) ? 'an' : 'a'} ${kind.label.toLowerCase()}`, 'b'), q('', kind.reason, 'p'));
    why.addEventListener('click', () => { why.hidden = true; });
  }

  const guideList = q('', null, 'ul');
  guide.append(q('', 'Field guide', 'h2'), q('pc-guide-hint', hintText), guideKind, guideWorld, guideList);
  const labelLayer = q('', null);
  const arrow = q('pc-arrow');
  const arrowDist = document.createElement('b');
  arrow.append(arrowDist);
  // The interaction key lives beside the feature's own floating label.
  const info = q('pc-info');
  info.hidden = true;
  info.innerHTML = '<button class="pc-info-close" type="button" aria-label="Close">×</button><h2></h2><p class="pc-info-detail"></p><table><tbody></tbody></table><ul></ul>';
  info.querySelector('.pc-info-close').addEventListener('click', closeInfo);
  host.append(hud, guide, labelLayer, arrow, info, ...(why ? [why] : []));

  const items = new Map();
  const labels = new Map();
  for (const f of features.list) {
    const li = document.createElement('li');
    li.innerHTML = '<span class="pc-label"></span><span class="pc-detail"></span><button class="pc-go" type="button">Go</button>';
    li.querySelector('.pc-label').textContent = f.label;
    li.querySelector('.pc-detail').textContent = f.detail;
    li.addEventListener('click', () => focus(f));
    li.querySelector('.pc-go').addEventListener('click', (e) => { e.stopPropagation(); goFeature(f); });
    guideList.append(li);
    items.set(f.id, li);
    const lab = q('pc-near', f.label);
    lab.style.top = lab.style.left = '0px';
    labelLayer.append(lab);
    labels.set(f.id, lab);
  }

  // Never let the camera end up inside the planet or the sea: walk the segment
  // from the pivot to the camera and shorten until every sample is clear. The
  // required clearance ramps up with distance so the near-pivot samples (which
  // are legitimately close to the ground) don't collapse the camera onto it.
  // The line to the runner's head is walked too, a sample every CLEAR_STEP: on
  // extreme relief a crest half a unit from him can stand over his head, and
  // eight samples (the first over a unit out) step over it and frame a wall.
  // That line stands over the feet's all the way, so it only ever turns down a
  // camera with ground taller than the runner between it and him.
  // `?at=` uses it too, to reject a landing spot the camera cannot back away from.
  const probe = new THREE.Vector3();
  const samplePoint = new THREE.Vector3();
  const headPoint = new THREE.Vector3();
  const CLEAR_STEP = 0.4;
  const groundUnder = (p) => R + Math.max(features.heightAt(p), features.seaLevel);
  function clearCam(pivot, dir, dist) {
    let d = Math.max(dist, CAM_MIN);
    headPoint.copy(pivot).normalize().multiplyScalar(pivot.length() + CHASE_LOOK);
    for (let pass = 0; pass < 12; pass++) {
      probe.copy(pivot).addScaledVector(dir, d);
      let hit = false;
      for (let i = 1; i <= 8 && !hit; i++) {
        const f = i / 8;
        samplePoint.lerpVectors(pivot, probe, f);
        hit = samplePoint.length() < groundUnder(samplePoint) + 0.45 * f;
      }
      const n = Math.ceil(d / CLEAR_STEP);
      for (let i = 1; i < n && !hit; i++) {
        samplePoint.lerpVectors(headPoint, probe, i / n);
        hit = samplePoint.length() < groundUnder(samplePoint);
      }
      if (!hit) return d;
      d *= 0.86;
      if (d <= CAM_MIN) return 0;
    }
    return d;
  }

  /* -------------------------------------------------------------- state --- */
  const posterDir = new THREE.Vector3();
  const posterLight = new THREE.Vector3();
  const posterAim = new THREE.Vector3();
  const racePoster = !!features.monument;
  let posterYaw = 0, posterPitch = 0;
  // How far a poster turns off the week's own subject toward the sun: a race is
  // the red stroke on the far rim and leans further than an ordinary week's
  // activity side, so both keep round five's big values.
  const POSTER_OFF = racePoster ? 0.6 : 0.28;
  const POSTER_TILT = racePoster ? 0.17 : 0; // …and the race's pitch bias

  /** The week's own subject on the globe: the highlighted race's midcourse, the
   *  finish monument, or the week's activity centroid weighted by time spent. A
   *  race is the red stroke on the far rim, so its aim is turned away from us. */
  function posterSubject(out) {
    if (features.race) {
      const route = features.race;
      const half = route.total * 0.5;
      let i = 1;
      while (i < route.cum.length - 1 && route.cum[i] < half) i++;
      const t = (half - route.cum[i - 1]) / Math.max(1e-6, route.cum[i] - route.cum[i - 1]);
      const a = (i - 1) * 3, b = i * 3;
      out.set(
        lerp(route.seg[a], route.seg[b], t),
        lerp(route.seg[a + 1], route.seg[b + 1], t),
        lerp(route.seg[a + 2], route.seg[b + 2], t),
      );
    } else if (features.monument) {
      out.copy(features.monument.dir);
    } else {
      for (const f of features.list) {
        if (f.kind === 'monument') continue;
        const seconds = Number(f.stats?.activeS);
        out.addScaledVector(f.dir, Number.isFinite(seconds) ? Math.max(900, seconds) : 900);
      }
    }
    if (out.lengthSq() < 1e-6) out.copy(features.list[0]?.dir || uniforms.uSunDir.value);
    out.normalize();
    if (racePoster) out.multiplyScalar(-1);
    return out;
  }

  /** An aim turned toward the sun by POSTER_OFF: the framing every default
   *  poster uses, and the one craft.frame's candidates are scored after. */
  function turnToSun(dir, out) {
    out.copy(dir);
    posterLight.copy(uniforms.uSunDir.value).addScaledVector(out, -out.dot(uniforms.uSunDir.value));
    if (posterLight.lengthSq() > 1e-6) out.addScaledVector(posterLight.normalize(), POSTER_OFF).normalize();
    return out;
  }

  // craft.frame weighs twelve directions spread evenly over the sphere by the
  // golden spiral — the same twelve every week — on what each would show. A
  // candidate is turned toward the sun like the default poster first, so the
  // frame's own light is scored, not guessed.
  const CRAFT_FRAME_DIRECTIONS = 12;
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  // The face being scored: the direction itself and two rings of probes round
  // it, up to 52° off centre (the limb hides most of what lies further out).
  const FACE_RINGS = [[0, 1], [0.45, 8], [0.9, 8]];
  const faceOffsets = (() => {
    const offsets = [];
    for (const [angle, probes] of FACE_RINGS) for (let i = 0; i < probes; i++) {
      const a = (i / probes) * TAU;
      offsets.push(R * angle * Math.cos(a), R * angle * Math.sin(a));
    }
    return offsets;
  })();
  const posterCand = new THREE.Vector3();
  const posterBest = new THREE.Vector3();
  const posterRef = new THREE.Vector3();
  const posterEast = new THREE.Vector3();
  const posterNorth = new THREE.Vector3();
  const posterAt = new THREE.Vector3();
  // The landmarks a poster wants showing, the race monument first: the finish
  // takes the top weight, then the week's three largest features by time, each
  // half the weight of the one before it and scaled by its own time.
  const posterLandmarks = (() => {
    const biggest = features.list
      .filter((f) => f.kind !== 'monument')
      .map((f) => ({ dir: f.dir, weight: Math.max(900, Number(f.stats?.activeS) || 900) }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3);
    const top = biggest.length ? biggest[0].weight : 1;
    const marks = biggest.map((mark, rank) => ({ dir: mark.dir, weight: (0.5 / (rank + 1)) * (mark.weight / top) }));
    return features.monument ? [{ dir: features.monument.dir, weight: 1 }, ...marks] : marks;
  })();

  /** The share of the visible face that is land: probes over the disc the
   *  camera sees. */
  function faceLand(dir) {
    const ref = Math.abs(dir.y) > 0.9 ? 1 : 0;
    posterRef.set(ref, 1 - ref, 0);
    posterEast.crossVectors(dir, posterRef).normalize();
    posterNorth.crossVectors(posterEast, dir).normalize();
    let land = 0, probes = 0;
    for (let i = 0; i < faceOffsets.length; i += 2) {
      features.onSphere(dir, posterEast, posterNorth, faceOffsets[i], faceOffsets[i + 1], posterAt);
      if (features.heightAt(posterAt) > features.seaLevel) land++;
      probes++;
    }
    return land / probes;
  }

  /** The direction craft.frame picks: the candidate that best holds the crop's
   *  land/sea balance (35–65% land on the visible face), keeps the week's
   *  landmarks lit and clear of the limb, and turns to the sun plausibly. A tie
   *  goes to the candidate closest to the framing the default rule chose. */
  function craftFrameDir(base) {
    const sun = uniforms.uSunDir.value;
    let bestScore = -1, bestAlign = -1;
    for (let i = 0; i < CRAFT_FRAME_DIRECTIONS; i++) {
      const y = 1 - (2 * (i + 0.5)) / CRAFT_FRAME_DIRECTIONS;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const a = i * GOLDEN_ANGLE;
      posterCand.set(Math.cos(a) * r, y, Math.sin(a) * r);
      turnToSun(posterCand, posterCand);
      const share = faceLand(posterCand);
      const off = Math.max(0, 0.35 - share, share - 0.65) / 0.35;
      let shown = 0, weight = 0;
      for (const mark of posterLandmarks) {
        weight += mark.weight;
        const dot = mark.dir.dot(posterCand);
        if (dot <= 0) continue; // the far side of the globe
        const angle = Math.acos(clamp(dot, -1, 1));
        const clear = 1 - smoothstep(clamp((angle - 0.8) / 0.6, 0, 1)); // whole by 46°, gone by 80°
        shown += mark.weight * clear * clamp(mark.dir.dot(sun), 0, 1); // lit ground, not the terminator
      }
      const score = 0.45 * (1 - off) + 0.4 * (weight ? shown / weight : 0) + 0.15 * clamp(posterCand.dot(sun), 0, 1);
      const align = posterCand.dot(base);
      if (score > bestScore + 1e-9 || (score > bestScore - 1e-9 && align > bestAlign)) {
        bestScore = score;
        bestAlign = align;
        posterBest.copy(posterCand);
      }
    }
    return posterBest;
  }

  // The shelf's crop: apps/planet-home/lib/paint.js cuts the central 80% of the
  // frame for a still (apps/bench/capture.mjs captureSquare mirrors it), and the
  // app says so in api.posterCrop. With craft.frame on, the whole disc — or the
  // 1.45 R a companion may stand out to — is framed to fill 86% of that crop, so
  // the still arrives uncut.
  const POSTER_CROP = 0.8;
  const COMPANION_REACH = 1.45;
  const CRAFT_FRAME_FILL = 0.86 * POSTER_CROP;
  const RACE_RING_REACH = 1.42;

  /* ------------------------------------------------------- the poster shot --- */
  // The poster's own distance. Five shots (shots.js) each show the week of one
  // scale — a crescent the frame cuts, the week's ground from just above it, a
  // long lens, the whole system — and classic, which is what this file has
  // always drawn. A shot brings its own aim, its own lens and its own fit for
  // the shelf's crop; it stands while the poster is a picture and the first drag
  // or zoom hands the ordinary orbit back (endShot).
  const shotSubject = new THREE.Vector3();
  const shotBaseAim = new THREE.Vector3();
  const shotCamera = { up: new THREE.Vector3(0, 1, 0), view: new THREE.Vector3(0, 0, -1), look: new THREE.Vector3() };
  let shotPlan = null, shotLive = false;

  /** Read the dial: build the shot's plan, or none for the classic poster. The
   *  scene is built by now, so a companion's own reach is read from what is in
   *  it — the race ring and the week's system both say how far they reach. */
  function rebuildShot() {
    const name = P['poster.shot'];
    shotPlan = name === 'classic' ? null : posterShot({
      name,
      features,
      scene,
      sun: uniforms.uSunDir.value,
      subject: posterSubject(shotSubject),
      baseAim: turnToSun(shotSubject, shotBaseAim),
      R,
      crop: POSTER_CROP,
      aspect: camera.aspect,
      // Where the week's own runner stands in the world: the low shot keeps him
      // out of its sky (see shots.js). He does not move while the poster is a
      // picture, so the plan reads him once.
      runner: runner.object3D.position,
    });
    shotLive = !!shotPlan;
    setShotLook(shotPlan?.look);
  }

  // A shot is a picture of a kind: the crescent is a night, the horizon is a
  // world with air over it, and a page is free to have those look dials down
  // (both default to 0). While the shot is up its own numbers stand — never
  // below what the page asked for — and the page's own come back when the
  // picture is handed over (endShot), so a reader who drags the sheet is looking
  // at exactly the planet their dials describe. They come back over LOOK_EASE
  // seconds of the reader's own clock rather than at once: a crescent's night
  // lifts into the day as the camera comes in, instead of the sun jumping round
  // the globe on the first wheel step. The style reads these per frame (ink.js
  // st.look), so nothing has to be repainted by hand here.
  const LOOK_EASE = 1.6;
  const shotLook = new Map();
  const lookBack = new Map(); // key → [the shot's value, the page's]
  let lookK = 1, lookStepped = false;
  function setShotLook(look, ease = false) {
    settleLook(); // a hand-back still under way lands first
    for (const [key, had] of shotLook) {
      if (ease) lookBack.set(key, [Number(P[key]) || 0, had]);
      else applyParams({ [key]: had });
    }
    if (lookBack.size) { lookK = 0; lookStepped = false; }
    shotLook.clear();
    if (!look) return;
    for (const [key, want] of Object.entries(look)) {
      const had = Number(P[key]) || 0;
      if (!(want > had)) continue; // the page's own look is already at least this loud
      shotLook.set(key, had);
      applyParams({ [key]: want });
    }
  }
  function settleLook() {
    for (const [key, [, to]] of lookBack) applyParams({ [key]: to });
    lookBack.clear();
  }
  /** One frame of the hand-back. Like a flight (see frame), it runs on the real
   *  clock or on frame(t, delta)'s steps, and lands at once on a fixed ?t= frame
   *  that was never stepped. */
  function easeLook(dt, deterministic) {
    if (!lookBack.size) return;
    if (deterministic && dt > 0) lookStepped = true;
    const live = !deterministic && fixedT == null;
    lookK = dt > 0 ? Math.min(1, lookK + dt / LOOK_EASE) : live || lookStepped ? lookK : 1;
    if (lookK >= 1) { settleLook(); return; }
    const k = smoothstep(lookK);
    for (const [key, [from, to]] of lookBack) applyParams({ [key]: lerp(from, to, k) });
  }

  /** The camera's lens and the orbit's resting distance: the live shot's own
   *  when there is one (its long lens, its place in the still), the dials'
   *  otherwise. The planet ≈ 70% of the viewport, of whichever way the viewport
   *  is narrower: a phone's frame is cut off either side of a planet framed to
   *  its height (a room's frame has been), its own width is what it has to fit
   *  in. craft.frame, a world's own orbit.fill and a shot all change what that
   *  share is (see posterBase). */
  function fitPoster() {
    const lens = shotLive && shotPlan.lens ? Math.min(shotPlan.lens, P['camera.fov']) : P['camera.fov'];
    if (camera.fov !== lens) {
      camera.fov = lens;
      camera.updateProjectionMatrix();
    }
    halfV = (camera.fov * RAD) / 2;
    const vFov = camera.fov * RAD, hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    orbit.base = posterBase(vFov, hFov);
    // A shot's distance is its composition: the landing threshold does not reach
    // it (a low shot stands below LAND_ALT on purpose, which is what makes it
    // low), and zoom keeps the range the ordinary orbit has always had.
    orbit.dist = shotLive ? orbit.base * distMultiplier : clamp(orbit.dist, ORBIT_NEAR, orbit.base * 1.65);
  }

  /** The poster is a picture until it is handled: the first drag or zoom hands
   *  the ordinary orbit back, lit and framed as its dials say. The globe keeps
   *  its size in the frame across the hand-over: the orbit stands where its own
   *  lens sees the same silhouette the shot's lens did (a long lens' poster is
   *  three times the distance), so a zoom carries on from the picture and a
   *  landing starts from it, instead of first jumping back to the classic
   *  poster's distance. The camera is moved there too, for a flight that may
   *  start from it this very frame. */
  function endShot() {
    if (!shotLive) return;
    const was = orbit.dist, tanWas = Math.tan((camera.fov * RAD) / 2);
    shotLive = false;
    setShotLook(null, true); // the page's own light and air, eased back (see LOOK_EASE)
    fitPoster();
    const k = tanWas / Math.tan((camera.fov * RAD) / 2);
    orbit.dist = clamp(Math.sqrt(R * R + Math.max(0, was * was - R * R) * k * k), ORBIT_NEAR, orbit.base * 1.65);
    camera.position.multiplyScalar(orbit.dist / Math.max(1e-6, camera.position.length()));
  }

  /** Where the live shot's camera looks, standing where the orbit has put it:
   *  its up and the direction of its eye in shotCamera. False when there is no
   *  live shot, so the ordinary orbit renders exactly as it always has. */
  function placeShot(dir) {
    if (!shotLive || !shotPlan.place(shotCamera, dir, camera.position)) return false;
    shotCamera.look.copy(camera.position).addScaledVector(shotCamera.view, orbit.dist);
    return true;
  }
  rebuildShot();

  /** The disc craft.frame has to fit: the globe, or the 1.45 R a companion may
   *  stand out to. Companions are named 'companion…' (worlds/companions.js), and
   *  a world's own are somewhere under its group, so the whole scene is asked. */
  function posterRadius() {
    if (!P['craft.frame']) return R;
    let companions = false;
    scene.traverse((child) => {
      if (!companions && String(child.name || '').startsWith('companion')) companions = true;
    });
    return companions ? R * COMPANION_REACH : R;
  }

  /** The orbit's resting distance, from the camera's own field of view. By
   *  default — and with a world's own orbit.fill over the camera.fill dial — the
   *  planet is that share of the frame's short axis, in the angle convention
   *  base.js has always framed with. craft.frame instead fits the shelf's crop:
   *  the crop is the central 80% of that axis, so a disc across 86% of it is an
   *  image radius of 0.688 of the half-axis, which is 0.688·tan(fov/2) in the
   *  tangent plane. A world's own fill still widens the shot: of the two shares,
   *  the smaller is the wider framing. */
  function posterBase(vFov, hFov) {
    const minFov = Math.min(vFov, hFov);
    // A shot frames the still itself — the central crop the shelf keeps — so its
    // own distance answers here and nothing else does: the globe's silhouette,
    // or the reach the week's whole system needs, in that crop's own half-height.
    if (shotLive) return shotPlan.fit(Math.atan(POSTER_CROP * Math.tan(minFov / 2)));
    if (!P['craft.frame']) {
      // A race's ring is the race week's Saturn: the shot pulls back so the whole ring, not just the globe, fills the
      // poster's usual share. A ring says how far out it reaches (userData.reach, in planet radii); 1.42 otherwise.
      let reach = 1;
      scene.traverse((child) => {
        if (child.name === 'companion-race-ring') reach = Math.max(reach, Number(child.userData?.reach) || RACE_RING_REACH);
      });
      return R * reach / Math.sin((features.orbit.fill ?? P['camera.fill']) * minFov / 2);
    }
    const share = features.orbit.fill == null ? CRAFT_FRAME_FILL : Math.min(CRAFT_FRAME_FILL, features.orbit.fill);
    const want = share * Math.tan(minFov / 2);
    return posterRadius() * Math.sqrt(1 + want * want) / want;
  }

  /** Aim the orbit at the week: the default subject-and-sun framing, or
   *  craft.frame's best of twelve. */
  function framePoster() {
    turnToSun(posterSubject(posterAim), posterDir);
    // A shot brings its own where: the week's own subject is the classic
    // poster's aim, and the one the wide shots are built from.
    if (shotPlan) posterDir.copy(shotPlan.dir);
    else if (P['craft.frame']) posterDir.copy(craftFrameDir(posterDir));
    posterYaw = Math.atan2(posterDir.z, posterDir.x);
    posterPitch = clamp(Math.asin(clamp(posterDir.y, -1, 1)) + POSTER_TILT, -1.35, 1.35);
  }
  framePoster();
  const orbit = {
    yaw: posterYaw + yawOffset,
    pitch: clamp(posterPitch + pitchOffset, -1.35, 1.35),
    dist: 0, base: 0, drag: false,
  };
  const chase = { yaw: 0, pitch: P['camera.chasePitch'], dist: P['camera.chaseDist'], drag: false };
  // A landed look (shots.js landedShot, poster.shot=cloudsea): the page opens on foot at the look's own site and the
  // look holds the camera until the reader's first input of any kind hands the chase camera back; the chase camera
  // itself is never changed. Every other dial value leaves landedPlan null and every path here as it was.
  const landedPlan = landedShot({ name: P['poster.shot'], features, sun: uniforms.uSunDir.value, scene });
  const landedCam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), up: new THREE.Vector3() };
  const landedFeet = new THREE.Vector3();
  let landedLive = false;
  let atFeature = params.has('at') ? features.byId[String(params.get('at'))] : landedPlan?.site || null;
  let halfV = (camera.fov * RAD) / 2;
  let atFeatureSphere = atFeature ? featureSphereOf.get(atFeature.id) : null;
  // The globe and sky carry shared uniforms, but landmark washes bake their
  // mixed colours when each material is made. Rebuild those few static objects
  // after a live palette change, then refresh every camera-clearance sphere so
  // landing and inspection keep using the replacement geometry.
  function disposeFeatureObject(root) {
    const geometries = new Set();
    const materials = new Set();
    root.traverse((child) => {
      if (child.geometry) geometries.add(child.geometry);
      const own = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of own) if (material) materials.add(material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  }

  function repaintFeatureObjects() {
    const next = new Map();
    for (const f of features.list) {
      const obj = makeFeatureObject(f);
      if (obj) next.set(f.id, obj);
    }
    for (const obj of featureObjects.values()) {
      scene.remove(obj);
      disposeFeatureObject(obj);
    }
    featureObjects.clear();
    for (const [id, obj] of next) {
      scene.add(obj);
      featureObjects.set(id, obj);
    }
    refreshFeatureSpheres();
    atFeatureSphere = atFeature ? featureSphereOf.get(atFeature.id) : null;
  }

  function landingShot(f) {
    const sphere = featureSphereOf.get(f.id);
    if (!sphere) return null;
    const aspect = (host.clientWidth || window.innerWidth) / Math.max(1, host.clientHeight || window.innerHeight);
    return {
      sphere,
      halfAngle: Math.min(halfV, Math.atan(aspect * Math.tan(halfV))) / FRAME_MARGIN,
      room: clearCam,
    };
  }
  const start = atFeature ? featureStart(features, atFeature, uniforms.uSunDir.value, landingShot(atFeature)) : null;
  let landedYaw = (start && start.camYaw) || 0;
  if (start && start.camDist > chase.dist) chase.dist = Math.min(FRAME_RUNNER_MAX, start.camDist);
  const run = {
    dir: (start ? start.dir : features.spawn).clone(),
    facing: (start ? start.facing : features.spawnTangent || new THREE.Vector3(0, 0, 1)).clone(),
    speed: 0, air: 0, vAir: 0, coyote: COYOTE_TIME, jumpCrouch: 0,
    depth: 0, waterMode: 'running', wade: 0, rootH: 0, rootEasing: false,
  };
  run.facing.addScaledVector(run.dir, -run.facing.dot(run.dir));
  if (run.facing.lengthSq() < 1e-6) run.facing.set(0, 0, 1).cross(run.dir).normalize();
  run.facing.normalize();
  run.rootH = features.heightAt(run.dir);

  const state = { mode: 'orbit', t: 0, frames: 0, transition: null, focus: null, target: null, landed: !!start };
  const keys = new Set();
  let jumpQueuedUntil = -Infinity, hintMove = 0;

  function focus(f) {
    state.target = f;
    for (const [id, li] of items) li.toggleAttribute('data-active', id === f.id);
    if (state.mode === 'orbit') {
      endShot(); // the camera is the reader's from here: the shot lets go
      state.focus = { dir: f.dir.clone(), k: 0 };
    }
    labelsDirty = true;
  }

  function placeAtFeature(f) {
    const spot = featureStart(features, f, uniforms.uSunDir.value, landingShot(f));
    run.dir.copy(spot.dir);
    run.facing.copy(spot.facing).addScaledVector(run.dir, -spot.facing.dot(run.dir));
    if (run.facing.lengthSq() < 1e-6) run.facing.set(0, 0, 1).cross(run.dir);
    run.facing.normalize();
    run.speed = run.air = run.vAir = 0;
    landedYaw = spot.camYaw || 0;
    chase.dist = clamp(Math.max(P['camera.chaseDist'], spot.camDist || 0), 4, FRAME_RUNNER_MAX);
    state.landed = true;
    state.focus = null;
    atFeature = f;
    atFeatureSphere = featureSphereOf.get(f.id) || null;
    focus(f);
    moveRunner(0);
  }

  // A landing opens on land beside one of the week's features: whichever one
  // lands nearest the ground the camera looks down on (the orbit's view, or the
  // spot zoomed in on). Only a week with nothing in it lands on bare ground.
  function landNear() {
    const centre = camera.position.lengthSq() > 1
      ? camera.position.clone().normalize()
      : new THREE.Vector3(Math.cos(orbit.pitch) * Math.cos(orbit.yaw), Math.sin(orbit.pitch), Math.cos(orbit.pitch) * Math.sin(orbit.yaw));
    let near = null, nearAngle = Infinity;
    for (const f of features.list) {
      const angle = featureStart(features, f, uniforms.uSunDir.value, null).dir.angleTo(centre);
      if (angle < nearAngle) { nearAngle = angle; near = f; }
    }
    if (near) {
      placeAtFeature(near);
      return;
    }
    run.dir.copy(nearestDry(features, centre));
    run.facing.copy(camera.up).addScaledVector(run.dir, -camera.up.dot(run.dir));
    if (run.facing.lengthSq() < 1e-6) run.facing.copy(tangentFrame().e);
    run.facing.normalize();
    run.speed = run.air = run.vAir = 0;
    chase.dist = P['camera.chaseDist'];
    landedYaw = 0;
    state.landed = true;
    state.target = null;
    atFeature = null;
    moveRunner(0);
  }

  function goFeature(f) {
    const short = state.mode === 'surface';
    closeInfo();
    guide.hidden = true;
    placeAtFeature(f);
    requestMode('surface', short ? 0.75 : TRANSITION, true);
  }

  const finite = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const clockText = (seconds) => {
    const total = Math.max(0, Math.round(seconds));
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  };
  function closeInfo() {
    info.hidden = true;
    state.infoFeature = null;
    labelsDirty = true;
  }
  function openInfo(f) {
    const a = f.stats || {};
    info.querySelector('h2').textContent = f.label;
    info.querySelector('.pc-info-detail').textContent = f.detail;
    const tbody = info.querySelector('tbody');
    tbody.replaceChildren();
    const row = (label, value, metric = '') => {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      const td = document.createElement('td');
      th.textContent = label;
      td.textContent = value;
      if (metric) {
        const small = document.createElement('small');
        small.textContent = metric;
        td.append(small);
      }
      tr.append(th, td);
      tbody.append(tr);
    };
    const distance = finite(a.distanceM), active = finite(a.activeS), climb = finite(a.ascentM);
    if (distance != null) row('Distance', `${(distance / MI).toFixed(2)} mi`, `${(distance / 1000).toFixed(2)} km`);
    if (active != null) row('Time', clockText(active));
    if (distance > 0 && active != null) row('Pace', `${clockText(active / (distance / MI))} /mi`, `${clockText(active / (distance / 1000))} /km`);
    if (finite(a.avgHeartRate) != null) row('Avg HR', `${Math.round(a.avgHeartRate)} bpm`);
    if (finite(a.maxHeartRate) != null) row('Max HR', `${Math.round(a.maxHeartRate)} bpm`);
    // a session with no route of its own climbed a machine's incline, not the ground (effort.js)
    const incline = finite(a.inclineM) ?? (isRouteless(a) ? climb : null);
    if (incline != null) row('Incline', `${Math.round(incline * 3.28084)} ft`, `${Math.round(incline)} m`);
    else if (climb != null) row('Climb', `${Math.round(climb * 3.28084)} ft`, `${Math.round(climb)} m`);
    if (finite(a.sweatMl) != null) row('Sweat', `${(a.sweatMl / 29.5735).toFixed(1)} fl oz`, `${Math.round(a.sweatMl)} mL`);
    const tempLo = finite(a.minTempC), tempHi = finite(a.maxTempC);
    if (tempLo != null || tempHi != null) {
      const values = tempLo == null ? [tempHi] : tempHi == null ? [tempLo] : [tempLo, tempHi];
      row('Temperature', `${values.map((v) => Math.round(v * 9 / 5 + 32)).join('–')} °F`, `${values.map((v) => Math.round(v)).join('–')} °C`);
    }
    if (finite(a.avgCadence) != null) row('Cadence', `${Math.round(a.avgCadence)} ${a.sport === 'cycling' ? 'rpm' : 'spm'}`);
    if (finite(a.trainingLoad) != null) row('Training load', a.trainingLoad.toFixed(1));
    if (finite(a.aerobicEffect) != null) row('Aerobic effect', a.aerobicEffect.toFixed(1));
    if (finite(a.anaerobicEffect) != null) row('Anaerobic effect', a.anaerobicEffect.toFixed(1));
    info.querySelector('table').hidden = !tbody.children.length;
    const explain = info.querySelector('ul');
    explain.replaceChildren();
    for (const line of f.explain || []) {
      const li = document.createElement('li');
      li.textContent = line;
      explain.append(li);
    }
    state.infoFeature = f;
    info.hidden = false;
    setPrompt(null);
  }

  const target = { pos: new THREE.Vector3(), look: new THREE.Vector3(), up: new THREE.Vector3() };
  const targetDir = new THREE.Vector3();
  const tangent = { e: new THREE.Vector3(), n: new THREE.Vector3() };
  const tangentRef = new THREE.Vector3();
  const chasePivot = new THREE.Vector3();
  const chaseFlat = new THREE.Vector3();
  const chaseRaised = new THREE.Vector3();
  const targetForward = new THREE.Vector3();
  const targetFeatureDir = new THREE.Vector3();
  const chaseSide = new THREE.Vector3();
  const chaseEye = new THREE.Vector3();
  const chaseCandidateDir = new THREE.Vector3();
  const chaseSafeRequest = new THREE.Vector3();
  let chaseSafeWanted = NaN, chaseSafeDist = 0, chaseSafeYaw = 0, chaseSafePitch = P['camera.chasePitch'];
  let chaseSafeControlYaw = NaN, chaseSafeControlPitch = NaN;
  const faceBack = new THREE.Vector3();

  function targetState(mode) {
    if (mode === 'orbit') {
      targetDir.set(Math.cos(orbit.pitch) * Math.cos(orbit.yaw), Math.sin(orbit.pitch), Math.cos(orbit.pitch) * Math.sin(orbit.yaw));
      orbitCamPos(targetDir, orbit.dist, target.pos);
      target.look.copy(CENTER);
      target.up.copy(up);
      return target;
    }
    const u = run.dir;
    if (landedLive && landedPlan.place(landedCam, runnerRootPos(landedFeet), camera.aspect, halfV)) {
      target.pos.copy(landedCam.pos);
      target.look.copy(landedCam.look);
      target.up.copy(landedCam.up);
      return target;
    }
    chaseDirection(targetDir).normalize();
    chasePos(targetDir, target.pos);
    runnerRootPos(target.look).addScaledVector(u, CHASE_LOOK);
    if (atFeatureSphere) {
      targetForward.copy(target.look).sub(target.pos);
      const lookDist = targetForward.length();
      targetFeatureDir.copy(atFeatureSphere.center).sub(target.pos);
      const featureDist = targetFeatureDir.length();
      targetForward.divideScalar(lookDist || 1);
      targetFeatureDir.divideScalar(featureDist || 1);
      const angle = Math.acos(clamp(targetForward.dot(targetFeatureDir), -1, 1));
      const radius = Math.asin(Math.min(1, atFeatureSphere.radius / Math.max(featureDist, 1e-6)));
      // Turn the look toward the landmark until all of it is in frame, but no
      // further than the runner's feet can follow to the frame's edge: a
      // landmark too big to fit beside them is cut by the frame, not the runner.
      // A portrait screen's frame is narrower across than up and down.
      const half = Math.min(halfV, Math.atan(camera.aspect * Math.tan(halfV))) / FRAME_MARGIN;
      const most = half - Math.atan2(CHASE_LOOK, lookDist);
      const shift = Math.min(angle + radius - half, most);
      if (shift > 0 && angle > 1e-6) {
        const t = Math.min(1, shift / angle), sin = Math.sin(angle);
        targetForward.multiplyScalar(Math.sin((1 - t) * angle) / sin)
          .addScaledVector(targetFeatureDir, Math.sin(t * angle) / sin).normalize();
        target.look.copy(target.pos).addScaledVector(targetForward, lookDist);
      }
    }
    target.up.copy(u);
    return target;
  }

  // tangent-plane frame at the runner: e = "east", n = "north"
  function tangentFrame() {
    const u = run.dir;
    const ref = Math.abs(u.y) > 0.9 ? tangentRef.set(1, 0, 0) : up;
    tangent.e.crossVectors(ref, u).normalize();
    tangent.n.crossVectors(u, tangent.e).normalize();
    return tangent;
  }

  function chaseDirection(out) {
    const u = run.dir, { e, n } = tangentFrame();
    return out.set(0, 0, 0).addScaledVector(u, Math.sin(chase.pitch)).addScaledVector(e, Math.cos(chase.pitch) * Math.cos(chase.yaw)).addScaledVector(n, Math.cos(chase.pitch) * Math.sin(chase.yaw));
  }

  const sphereRay = new THREE.Vector3();
  function rayClearsFeatures(pivot, dir, dist) {
    chaseEye.copy(pivot).addScaledVector(dir, dist);
    keepOutside(chaseEye, 0.45);
    keepSwimCameraAbove(chaseEye);
    chaseCandidateDir.copy(chaseEye).sub(pivot);
    const finalDist = chaseCandidateDir.length();
    chaseCandidateDir.divideScalar(finalDist || 1);
    for (let i = 0; i < featureSpheres.length; i++) {
      const s = featureSpheres[i];
      if (chaseEye.distanceTo(s.center) < s.radius + 0.4) return false;
      sphereRay.copy(s.center).sub(pivot);
      const b = sphereRay.dot(chaseCandidateDir);
      if (b <= 0) continue;
      const c = sphereRay.lengthSq() - s.radius * s.radius;
      if (c <= 0) continue;
      const disc = b * b - c;
      if (disc > 0 && b - Math.sqrt(disc) < finalDist + 0.4) return false;
    }
    return true;
  }

  function chasePos(dir, out) {
    const pivot = cameraPivot(chasePivot);
    const wanted = chase.dist;
    chaseFlat.copy(dir).addScaledVector(run.dir, -dir.dot(run.dir));
    if (chaseFlat.lengthSq() < 1e-6) chaseFlat.copy(tangentFrame().e);
    chaseFlat.normalize();
    chaseSide.crossVectors(run.dir, chaseFlat).normalize();

    let valid = chaseSafeDist > 0
      && Math.abs(wanted - chaseSafeWanted) < 0.01
      && Math.abs(chase.yaw - chaseSafeControlYaw) < 1e-4
      && Math.abs(chase.pitch - chaseSafeControlPitch) < 1e-4;
    if (valid && run.dir.dot(chaseSafeRequest) < 0.9998) {
      chaseRaised.copy(chaseFlat).multiplyScalar(Math.cos(chaseSafeYaw)).addScaledVector(chaseSide, Math.sin(chaseSafeYaw));
      chaseRaised.multiplyScalar(Math.cos(chaseSafePitch)).addScaledVector(run.dir, Math.sin(chaseSafePitch)).normalize();
      const open = clearCam(pivot, chaseRaised, chaseSafeDist);
      valid = open >= chaseSafeDist - 0.05 && rayClearsFeatures(pivot, chaseRaised, open);
      if (valid) chaseSafeRequest.copy(run.dir);
    }

    if (!valid) {
      let best = 0, bestScore = -1, bestYaw = 0, bestPitch = chase.pitch;
      chaseSafeDist = 0;
      // Prefer walking the camera round a ridge or landmark at its normal
      // height; only raise it when every low bearing is blocked.
      search:
      for (let p = 0; p < 9; p++) {
        const pitch = p ? Math.min(1.3, chase.pitch + p * 0.12) : chase.pitch;
        const frameDist = p
          ? Math.max(CAM_MIN, wanted * 1.35 * Math.cos(pitch) / Math.max(0.2, Math.cos(chase.pitch)))
          : wanted;
        for (let y = 0; y < CHASE_YAWS.length; y++) {
          const yaw = CHASE_YAWS[y];
          chaseRaised.copy(chaseFlat).multiplyScalar(Math.cos(yaw)).addScaledVector(chaseSide, Math.sin(yaw));
          chaseRaised.multiplyScalar(Math.cos(pitch)).addScaledVector(run.dir, Math.sin(pitch)).normalize();
          const open = clearCam(pivot, chaseRaised, frameDist);
          if (!rayClearsFeatures(pivot, chaseRaised, open)) continue;
          const score = open / frameDist;
          if (score > bestScore) { bestScore = score; best = open; bestYaw = yaw; bestPitch = pitch; }
          if (open >= frameDist - 0.05) {
            chaseSafeYaw = yaw;
            chaseSafePitch = pitch;
            chaseSafeDist = frameDist;
            break search;
          }
        }
      }
      if (!chaseSafeDist) {
        chaseSafeYaw = bestYaw;
        chaseSafePitch = bestPitch;
        chaseSafeDist = best || wanted;
      }
      chaseSafeWanted = wanted;
      chaseSafeControlYaw = chase.yaw;
      chaseSafeControlPitch = chase.pitch;
      chaseSafeRequest.copy(run.dir);
    }
    dir.copy(chaseFlat).multiplyScalar(Math.cos(chaseSafeYaw)).addScaledVector(chaseSide, Math.sin(chaseSafeYaw));
    dir.multiplyScalar(Math.cos(chaseSafePitch)).addScaledVector(run.dir, Math.sin(chaseSafePitch)).normalize();
    out.copy(pivot).addScaledVector(dir, Math.max(chaseSafeDist, 0.8));
    keepOutside(out, 0.45);
    return keepSwimCameraAbove(out);
  }

  // chase camera azimuth that sits behind the runner's facing, less the swing a
  // landmark landing needs to keep itself out from behind the runner
  function faceCamera() {
    const { e, n } = tangentFrame();
    faceBack.copy(run.facing).negate();
    chase.yaw = Math.atan2(faceBack.dot(n), faceBack.dot(e)) + landedYaw;
  }

  function requestMode(mode, dur = TRANSITION, force = false) {
    landedLive = false;
    if (mode === 'surface') build.end(); // the ground underfoot is the whole week's
    if (mode === state.mode && !state.transition && !force) return;
    endShot(); // landing or leaving: the poster's own camera is not the orbit's
    if (mode === 'surface' && !state.landed) {
      if (features.monument) placeAtFeature(features.monument);
      else landNear();
    }
    if (mode === 'orbit') {
      orbit.dist = Math.max(orbit.dist, orbit.base * 0.72, ORBIT_NEAR + ZOOM_HYST);
      closeInfo();
    }
    faceCamera();
    state.transition = { to: mode, k: 0, fromPos: camera.position.clone(), fromLook: lookAt.clone(), fromUp: camera.up.clone(), dur };
    clearSurfaceLabels();
    labelsDirty = true;
  }

  const groundPos = (dir, out = new THREE.Vector3()) => out.copy(dir).multiplyScalar(R + features.heightAt(dir));
  const runnerRootPos = (out = new THREE.Vector3()) => out.copy(run.dir).multiplyScalar(R + run.rootH);
  const cameraPivot = (out = new THREE.Vector3()) => out.copy(run.dir).multiplyScalar(R + lerp(run.rootH, features.seaLevel + 0.3, run.wade));
  function keepSwimCameraAbove(p) {
    if (run.wade <= 0) return p;
    const min = R + features.seaLevel + 2.5, len = p.length();
    return len < min ? p.multiplyScalar(min / len) : p;
  }
  const lookAt = new THREE.Vector3();

  // Push a world point out of the terrain radially (terrain is a radius field,
  // so "outside" is exactly this condition).
  function keepOutside(p, margin) {
    const len = p.length();
    if (len < 1e-4) return p.set(0, R + 20, 0);
    const floor = R + Math.max(features.heightAt(p), features.seaLevel) + margin;
    return len < floor ? p.multiplyScalar(floor / len) : p;
  }

  // Orbit keeps the whole planet in frame: only the end point may need a lift.
  function orbitCamPos(dir, dist, out = new THREE.Vector3()) {
    return keepOutside(out.copy(dir).multiplyScalar(dist), 1.5);
  }

  /* -------------------------------------------------------------- input --- */
  const el = renderer.domElement;
  el.style.touchAction = 'none'; // a pinch is the planet's own zoom, not the page's
  let pointer = null;
  // the fingers down (pointerId → [x, y]): two are a pinch, the ratio of their spread the zoom
  const fingers = new Map();
  let spread = 0, downAt = -Infinity;
  const spreadNow = () => { const [a, b] = fingers.values(); return Math.hypot(a[0] - b[0], a[1] - b[1]); };
  // The thumb stick (a touch screen, on foot): a thumb put down on the left half holds it where it lands, and pushed
  // out it runs the runner as the keys do (moveRunner), half way at a walk and all the way at a sprint; pushed past
  // the rim, the stick follows it. Fingers that come down together (PINCH_GRACE apart) are a pinch, whichever half the
  // first found, so a pinch begun on the left takes the stick's finger as its first.
  const STICK_R = 56; // px from the stick's centre to its rim: pushed all the way
  const STICK_DEAD = 0.15; // the share of that a resting thumb may wander, the runner standing
  const PINCH_GRACE = 250; // ms
  const stick = { id: null, x: 0, y: 0, px: 0, py: 0, fx: 0, sx: 0, push: 0, moved: false };
  function stickMove(x, y) {
    const len = Math.hypot(x - stick.x, y - stick.y);
    if (len > STICK_R) {
      stick.x += (x - stick.x) * (1 - STICK_R / len);
      stick.y += (y - stick.y) * (1 - STICK_R / len);
    }
    const push = Math.min(1, len / STICK_R);
    stick.push = push > STICK_DEAD ? (push - STICK_DEAD) / (1 - STICK_DEAD) : 0;
    if (stick.push) {
      stick.moved = true;
      stick.fx = stick.y - y; // up the screen is forward
      stick.sx = x - stick.x;
    }
    stick.px = x;
    stick.py = y;
    stickRing.style.transform = `translate(${stick.x}px,${stick.y}px)`;
    stickKnob.style.transform = `translate(${x}px,${y}px)`;
  }
  function stickOff() {
    stick.id = null;
    stick.push = 0;
    touchPad.classList.remove('held');
  }
  el.addEventListener('pointerdown', (e) => {
    const together = e.timeStamp - downAt < PINCH_GRACE;
    downAt = e.timeStamp;
    if (stick.id == null && !(fingers.size && together) && e.pointerType === 'touch' && touchUI.matches
      && state.mode === 'surface' && !state.transition && e.clientX < el.clientWidth / 2) {
      stick.id = e.pointerId;
      stick.moved = false;
      stick.x = e.clientX;
      stick.y = e.clientY;
      stickMove(e.clientX, e.clientY);
      touchPad.classList.add('held');
      el.setPointerCapture(e.pointerId);
      return;
    }
    if (stick.id != null && !stick.moved && !fingers.size && together) {
      fingers.set(stick.id, [stick.px, stick.py]);
      stickOff();
    }
    fingers.set(e.pointerId, [e.clientX, e.clientY]);
    spread = fingers.size === 2 ? spreadNow() : 0;
    pointer = { x: e.clientX, y: e.clientY };
    (state.mode === 'orbit' ? orbit : chase).drag = true;
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId === stick.id) return stickMove(e.clientX, e.clientY);
    const finger = fingers.get(e.pointerId);
    if (!finger) return; // not down here: a mouse passing over, or a thumb whose stick a flight let go (clearSurfaceLabels)
    finger[0] = e.clientX;
    finger[1] = e.clientY;
    if (fingers.size > 1) {
      const s = spreadNow();
      if (spread > 0 && s > 0) zoom(s / spread);
      spread = s;
      return;
    }
    if (!pointer || held) return;
    const dx = (e.clientX - pointer.x) * 0.006, dy = (e.clientY - pointer.y) * 0.006;
    pointer = { x: e.clientX, y: e.clientY };
    if (state.mode === 'orbit') {
      endShot(); // dragging the sheet is handling it: the ordinary orbit comes back
      orbit.yaw -= dx;
      orbit.pitch = clamp(orbit.pitch + dy, -1.35, 1.35);
      state.focus = null;
    } else {
      chase.yaw -= dx;
      chase.pitch = clamp(chase.pitch + dy, -0.25, 1.15);
    }
  });
  const endPointer = (e) => {
    if (e.pointerId === stick.id) return stickOff();
    if (!fingers.delete(e.pointerId)) return;
    spread = 0;
    const [rest] = fingers.values(); // a pinch let go of by one finger turns on with the other
    pointer = rest ? { x: rest[0], y: rest[1] } : null;
    if (!rest) orbit.drag = chase.drag = false;
    if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
  };
  el.addEventListener('pointerup', endPointer);
  el.addEventListener('pointercancel', endPointer);
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (!e.deltaY) return;
    const sign = Math.sign(e.deltaY);
    if (state.mode === 'orbit' || held) zoom(1 / (1 + sign * 0.08));
    else if (!state.transition) zoomFoot(-sign);
  }, { passive: false });
  // The zoom, f over 1 in: a wheel notch 1/0.92 in or 1/1.08 out, a pinch the ratio of its spread. Held, it is the
  // page's (and once the planet has handed back, what is left over goes with it).
  function zoom(f) {
    if (handBack) { handBack /= f; return; }
    if (held) { tell('zoom', f); return; }
    if (state.transition || !(f > 0) || f === 1) return;
    if (state.mode === 'orbit') zoomOrbit(f);
    else zoomFoot(Math.log(f) / Math.log(1 / 0.92));
  }
  // On foot, n notches in (a wheel's ±1, a pinch its share of one): the chase camera; two notches past its farthest
  // take off again. With reduced motion asked for, a landing or a take-off by the zoom is a cut.
  const quick = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 1e-3 : TRANSITION);
  let surfaceOverscroll = 0;
  function zoomFoot(n) {
    if (n < 0 && chase.dist >= FRAME_MAX - 0.01) surfaceOverscroll -= 0.7 * n;
    else if (n > 0) surfaceOverscroll = 0;
    chase.dist = clamp(chase.dist - 0.7 * n, 4, FRAME_MAX);
    if (surfaceOverscroll >= 1.4) {
      surfaceOverscroll = 0;
      requestMode('orbit', quick());
    }
  }
  // In orbit: in to the closest orbit, where one more step lands; out to the farthest (1.65 posters, or embedded the
  // poster and then its lens opening to the seat), past which the planet leaves for its galaxy (pastFar).
  function zoomOrbit(f) {
    const lo = seatWide();
    if (lo && f > 1 && wide < 1) { // in through the lens first: the poster stays a picture until it is its own size
      const w = Math.min(1, wide * f);
      f *= wide / w;
      wide = w;
      if (f < 1.0001) return;
    } else if (lo && f < 1 && orbit.dist >= orbit.base * 0.999) {
      openLens(f);
      return;
    }
    endShot(); // zooming is handling it too, before the range it is zoomed in
    const far = lo ? Math.max(orbit.base, orbit.dist) : orbit.base * 1.65, next = orbit.dist / f;
    orbit.dist = clamp(next, ORBIT_NEAR, far);
    if (f > 1 && next <= ORBIT_NEAR) {
      landNear();
      requestMode('surface', quick());
    } else if (f < 1 && next > far) {
      if (lo) openLens(far / next);
      else pastFar(next / far);
    } else if (f > 1) farOver = 1;
  }
  // embedded, out past the poster: the lens opens down to the seat, and past it the page takes the zoom
  function openLens(f) {
    const lo = seatWide(), w = wide * f;
    wide = Math.max(lo, w);
    if (w < lo) pastFar(lo / w);
  }
  // The share of the poster the seat is (where the lens opens to), or 0 with no seat.
  function seatWide() {
    return seat.box ? Math.min(1, seat.box / (POSTER_CROP * Math.min(host.clientWidth || innerWidth, host.clientHeight || innerHeight))) : 0;
  }
  // Out past the farthest: embedded, the zoom goes back to the page, the next frame its picture (see frame); on the
  // site, a little further (some four notches) a week of Ryan's shelf fades and goes up to its place in the galaxy.
  let farOver = 1, toGalaxy = null, gone = false;
  function pastFar(by) {
    if (embed) { handBack = (handBack || 1) * by; return; }
    toGalaxy ??= galaxyLink(); // asked at the first step past, so it is known by the last
    farOver *= by;
    if (farOver < 1.35 || gone) return;
    toGalaxy.then((url) => {
      if (!url || gone) return;
      gone = true;
      const fade = quick() > 1 ? 350 : 0;
      host.style.transition = `opacity ${fade}ms ease`;
      host.style.opacity = '0';
      // back from the galaxy (the page kept as it was left): the planet as it was
      addEventListener('pageshow', () => { host.style.opacity = ''; gone = false; farOver = 1; }, { once: true });
      setTimeout(() => location.assign(url), fade);
    });
  }
  // the galaxy's page on this planet's week when it is one of the shelf's (its link carries the very code this page
  // was opened with): null for anyone else's planet, or off the site
  async function galaxyLink() {
    const code = new URLSearchParams(location.hash.slice(1)).get('p');
    if (!code) return null;
    try {
      const shelf = await (await fetch(new URL('../shelf/ryan.json', location.href))).json();
      const week = shelf.find((w) => String(w.link).replace(/^.*[#?&]p=/, '') === code)?.week;
      return week ? new URL(`../galaxy/#week=${week}`, location.href).href : null;
    } catch {
      return null;
    }
  }
  function toggleGuide() {
    guide.hidden = !guide.hidden;
  }
  // E, or a touch screen's Inspect: the card on the landmark at hand, or the card put away
  function inspect() {
    if (!info.hidden) closeInfo();
    else if (state.nearby) openInfo(state.nearby);
  }
  // a landed look lets go at the reader's first input of any kind: a key, a touch or a click anywhere, a wheel
  for (const type of ['pointerdown', 'keydown', 'wheel']) {
    window.addEventListener(type, () => { landedLive = false; }, { capture: true, passive: true });
  }
  window.addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (e.code === 'KeyG') toggleGuide();
    if (!e.repeat && e.code === 'KeyE') inspect();
    if (e.code === 'Escape') closeInfo();
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) jumpQueuedUntil = performance.now() + JUMP_BUFFER * 1000;
      if (state.mode === 'surface' && document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  function resizeRenderer() {
    const w = host.clientWidth || window.innerWidth, h = host.clientHeight || window.innerHeight;
    const cap = Math.sqrt(MAX_BUFFER_PIXELS / Math.max(1, w * h));
    perf.dpr = Math.max(0.75, Math.min(window.devicePixelRatio || 1, 2, cap) * DPR_LEVELS[perf.step]);
    renderer.setPixelRatio(perf.dpr);
    renderer.setSize(w, h, false);
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.display = 'block';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fitPoster();
    post && post.setSize(w, h);
  }
  // Dynamic resolution, then feature LOD, both read off the frame's clock. A pinned capture passes no dt (?t=,
  // frame(t)), so neither ever moves under one, and its frames draw every feature whatever level the live frames
  // have faded to (see frame).
  function updateResolution(dt) {
    if (!dt || state.frames < 60) return; // fixed captures stay at their requested DPR
    perf.frameMs += (dt * 1000 - perf.frameMs) * 0.04;
    perf.slow = perf.frameMs > 20.5 ? perf.slow + dt : Math.max(0, perf.slow - dt * 2);
    perf.stable = perf.frameMs < 17.5 ? perf.stable + dt : 0;
    // the features fade toward the level asked for, one level each LOD_FADE seconds
    perf.lodK += clamp(perf.lod - perf.lodK, -dt / LOD_FADE, dt / LOD_FADE);
    if (perf.lodPinned || state.t - perf.changedAt < perf.settle) return;
    // a step down that bought no time (a screen held at 30 Hz, a frame bound by its scripts) is undone, and goes no
    // lower again
    const from = perf.from;
    perf.from = null;
    if (from && perf.frameMs > from.ms * from.keep) {
      if (from.lod) {
        perf.lodFloor = from.step;
        setLod(from.step);
      } else {
        perf.floor = from.step;
        setResolutionStep(from.step);
      }
    } else if (perf.slow >= 1.25 && (perf.step < perf.floor || perf.lod < perf.lodFloor)) {
      if (perf.rose) perf.probe *= 2; // the last try back up was too much: wait twice as long before the next
      perf.rose = false;
      if (perf.step < perf.floor) {
        // as far down at once as the time asks: a frame's cost goes with its pixels, the square of the ratio
        const want = DPR_LEVELS[perf.step] * Math.sqrt(16.7 / perf.frameMs);
        let step = perf.step + 1;
        while (step < perf.floor && DPR_LEVELS[step] > want) step++;
        perf.from = { step: perf.step, ms: perf.frameMs, keep: 0.85, lod: false };
        setResolutionStep(step);
      } else {
        // the pixels are as few as they go and the frame is still slow: the style's next costliest feature fades out
        perf.from = { step: perf.lod, ms: perf.frameMs, keep: LOD_KEEP, lod: true };
        setLod(perf.lod + 1);
      }
    } else if (perf.stable >= perf.probe && (perf.lod > 0 || perf.step > 0)) {
      // back up in the order it came down: the features first, then the pixels
      perf.rose = true;
      if (perf.lod > 0) setLod(perf.lod - 1);
      else setResolutionStep(perf.step - 1);
    } else perf.rose = false; // the last step back up has held
  }
  function setResolutionStep(step) {
    perf.step = step;
    perf.slow = perf.stable = 0;
    perf.changedAt = state.t;
    perf.settle = 5;
    resizeRenderer();
  }
  function setLod(level) {
    perf.lod = level;
    perf.slow = perf.stable = 0;
    perf.changedAt = state.t;
    perf.settle = LOD_SETTLE;
  }
  window.addEventListener('resize', resizeRenderer);
  resizeRenderer();
  orbit.dist = orbit.base * distMultiplier;

  btnLand.addEventListener('click', () => requestMode('surface'));
  btnOrbit.addEventListener('click', () => requestMode('orbit'));
  btnGuide.addEventListener('click', toggleGuide);
  // as Space does, on the press: a jump waits for no lift of the thumb
  btnJump.addEventListener('pointerdown', () => { jumpQueuedUntil = performance.now() + JUMP_BUFFER * 1000; });
  btnInspect.addEventListener('click', inspect);

  /* -------------------------------------------------------------- frame --- */
  const clock = new THREE.Clock();
  // what the style's update() is handed: one bag, refilled each frame (see frame)
  const styleUpdate = hook('update');
  const updateBag = {
    dt: 0, time: 0, camera, scene, renderer, mode: state.mode, surface: 0, landing: null, runner: runner.object3D,
    runnerState: run, features, uniforms, lod: 0,
  };
  const camState = { dir: new THREE.Vector3() };
  const tmp = new THREE.Vector3();
  const tmpDir = new THREE.Vector3();
  const landCam = new THREE.PerspectiveCamera(); // where a flight down will stand the camera (see frame)
  const m4 = new THREE.Matrix4();
  const moveCr = new THREE.Vector3();
  const moveWish = new THREE.Vector3();
  const moveNext = new THREE.Vector3();
  const moveX = new THREE.Vector3();
  const moveZ = new THREE.Vector3();

  function moveRunner(dt, time = null) {
    // the thumb stick, pushed past its dead zone, stands in for the keys: their axes, and the pace by how far it is
    // pushed, half way the walk and all the way the sprint
    const push = stick.push;
    const fx = push ? stick.fx : (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const sx = push ? stick.sx : (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const sprint = push ? push > 0.75 : keys.has('ShiftLeft') || keys.has('ShiftRight');
    const airborne = run.air > 0;
    let ground = features.heightAt(run.dir);
    let depth = features.seaLevel - ground;
    let pace = 1;
    if (depth >= WADE_DEPTH) {
      const swimPace = sprint ? 0.75 : 0.55;
      pace = depth <= SWIM_DEPTH
        ? lerp(1, 0.7, smoothstep((depth - WADE_DEPTH) / (SWIM_DEPTH - WADE_DEPTH)))
        : lerp(0.7, swimPace, smoothstep(clamp((depth - SWIM_DEPTH) / 0.5, 0, 1)));
    }
    const gait = !push ? (sprint ? P['runner.sprint'] : P['runner.walk'])
      : push < 0.5 ? P['runner.walk'] * 2 * push : lerp(P['runner.walk'], P['runner.sprint'], 2 * push - 1);
    const target = fx || sx ? gait * pace : 0;
    const accel = airborne ? 2 : 8;
    run.speed += clamp(target - run.speed, -accel * dt, accel * dt);

    if (fx || sx || (airborne && run.speed > 0.01)) {
      const u = run.dir;
      // "Forward" is explicitly from the camera through the runner; camera
      // right is forward × up. The arrow keys share these same axes. In the air,
      // no input keeps the take-off heading and input only trims it.
      const cf = tmp.copy(runner.object3D.position).sub(camera.position).addScaledVector(u, -tmp.dot(u));
      if (cf.lengthSq() < 1e-6) cf.copy(run.facing);
      cf.normalize();
      moveCr.crossVectors(cf, u);
      if (fx || sx) moveWish.set(0, 0, 0).addScaledVector(cf, fx).addScaledVector(moveCr, sx).normalize();
      else moveWish.copy(run.facing);
      const wish = moveWish;
      const step = dt * run.speed / R;
      moveNext.set(0, 0, 0).addScaledVector(u, Math.cos(step)).addScaledVector(wish, Math.sin(step));
      run.dir.copy(moveNext);
      runner.collide?.(run.dir); // soft collision: he slides round what stands or walks there (runner.js)
      const t = 1 - Math.exp(-(airborne ? 2.5 : 10) * dt);
      run.facing.lerp(wish, t).addScaledVector(run.dir, -run.facing.dot(run.dir));
      if (run.facing.lengthSq() < 1e-9) run.facing.copy(wish);
      run.facing.normalize();
    }

    if (fx || sx) {
      hintMove += dt;
      if (hintMove >= 4) hint.classList.add('off');
    }

    ground = features.heightAt(run.dir);
    depth = features.seaLevel - ground;
    const swimming = depth > SWIM_DEPTH;
    const wade = smoothstep(clamp((depth - WADE_DEPTH) / (SWIM_DEPTH - WADE_DEPTH), 0, 1));
    run.depth = depth;
    run.wade = wade;
    run.waterMode = swimming ? 'swimming' : depth >= WADE_DEPTH ? 'wading' : 'running';

    // Buffered, coyote-tolerant jump with a short crouch before take-off.
    if (swimming) {
      run.air = run.vAir = run.jumpCrouch = 0;
      run.coyote = 0;
      jumpQueuedUntil = -Infinity;
    } else {
      if (run.air <= 0) run.coyote = COYOTE_TIME;
      else run.coyote = Math.max(0, run.coyote - dt);
      if (performance.now() <= jumpQueuedUntil && run.coyote > 0 && run.jumpCrouch <= 0) {
        run.jumpCrouch = JUMP_CROUCH;
        jumpQueuedUntil = -Infinity;
      }
      if (run.jumpCrouch > 0) {
        run.jumpCrouch -= dt;
        if (run.jumpCrouch <= 0) {
          run.jumpCrouch = 0;
          run.vAir = JUMP_V * lerp(1, 0.65, wade);
          run.air = 0.001;
          run.coyote = 0;
        }
      }
      if (run.air > 0) {
        const gravity = run.vAir > 0 ? JUMP_GRAVITY_UP : JUMP_GRAVITY_DOWN;
        run.air += run.vAir * dt - 0.5 * gravity * dt * dt;
        run.vAir -= gravity * dt;
        if (run.air <= 0) { run.air = 0; run.vAir = 0; }
      }

    }

    const rootTarget = swimming ? features.seaLevel - SWIM_HEIGHT : ground;
    if (!dt) {
      run.rootH = rootTarget;
      run.rootEasing = false;
    } else if (swimming || run.rootEasing) {
      run.rootEasing = true;
      run.rootH = lerp(run.rootH, rootTarget, 1 - Math.exp(-8 * dt));
      if (!swimming && Math.abs(run.rootH - rootTarget) < 0.01) {
        run.rootH = rootTarget;
        run.rootEasing = false;
      }
    } else {
      run.rootH = ground;
    }

    const u = run.dir;
    runner.object3D.position.copy(u).multiplyScalar(R + run.rootH + run.air);
    moveX.crossVectors(u, run.facing).normalize();
    moveZ.crossVectors(moveX, u).normalize();
    runner.object3D.quaternion.setFromRotationMatrix(m4.makeBasis(moveX, u, moveZ));
    runner.update(dt, {
      speed: run.speed,
      grounded: run.air <= 0,
      swimming,
      wade,
      anticipation: run.jumpCrouch > 0 ? 1 - run.jumpCrouch / JUMP_CROUCH : 0,
      tuck: run.air > 0 ? clamp(1 - Math.abs(run.vAir) / JUMP_V, 0, 1) : 0,
      gaitTime: P['living.gait'] > 0 ? uniforms.uTime.value : null,
      time,
    });
  }

  const routeById = new Map(features.routes.map((r) => [r.featureId, r]));
  function routeDistance(route) {
    const info = segInfo(route, run.dir.x, run.dir.y, run.dir.z);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(info[0]) / 2));
  }
  function updateInteraction() {
    let landmark = null, landmarkD = Infinity, linear = null, linearD = Infinity;
    state.targetNear = false;
    if (state.mode === 'surface' && !state.transition) {
      for (const f of features.list) {
        const route = routeById.get(f.id);
        const sphere = featureSphereOf.get(f.id);
        const d = route ? routeDistance(route)
          : sphere ? Math.max(0, runner.object3D.position.distanceTo(sphere.center) - sphere.radius)
            : run.dir.angleTo(f.dir) * R;
        if (d > INTERACT_RANGE) continue;
        if (f === state.target) state.targetNear = true;
        if (route) {
          if (d < linearD) { linear = f; linearD = d; }
        } else if (d < landmarkD) {
          landmark = f;
          landmarkD = d;
        }
      }
    }
    state.nearby = landmark || linear;
    setPrompt(!info.hidden && state.nearby ? null : state.nearby?.id);
    // on foot (the only place this runs): a touch screen's stick and buttons are out
    if (!touchPad.classList.contains('on')) touchPad.classList.add('on');
  }
  // the landmark at hand to ask about, or none: its name's E, a touch screen's Inspect
  function setPrompt(id) {
    if (id === state.promptId) return;
    if (state.promptId) labels.get(state.promptId)?.classList.remove('can-interact');
    if (id) labels.get(id)?.classList.add('can-interact');
    btnInspect.hidden = !id;
    state.promptId = id;
  }

  const featurePos = new THREE.Vector3();
  const proj = new THREE.Vector3();
  const labelCamDir = new THREE.Vector3();
  const labelTo = new THREE.Vector3();
  const labelFwd = new THREE.Vector3();
  const labelRight = new THREE.Vector3();
  const labelCameraPos = new THREE.Vector3(Infinity, Infinity, Infinity);
  const labelRunnerPos = new THREE.Vector3(Infinity, Infinity, Infinity);
  const labelCameraQuat = new THREE.Quaternion();
  let labelElapsed = 1 / 25;
  let labelsDirty = true;

  function clearSurfaceLabels() {
    for (const lab of labels.values()) lab.classList.remove('on', 'can-interact');
    arrow.classList.remove('on');
    touchPad.classList.remove('on');
    btnInspect.hidden = true;
    stickOff(); // a flight takes the runner out of the thumb's hands: back on foot, it is put down again
    state.nearby = null;
    state.promptId = null;
  }

  function labelsAndArrow() {
    camera.getWorldDirection(labelCamDir).normalize();
    const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
    for (const f of features.list) {
      const lab = labels.get(f.id);
      const obj = featureObjects.get(f.id);
      if (obj) featurePos.copy(obj.position);
      else featurePos.copy(f.dir).multiplyScalar(R + features.heightAt(f.dir));
      const d = featurePos.distanceTo(runner.object3D.position);
      if (d > LABEL_RANGE) { lab.classList.remove('on'); continue; }
      proj.copy(featurePos).project(camera);
      if (proj.z < -1 || proj.z > 1) { lab.classList.remove('on'); continue; }
      lab.style.left = `${((proj.x * 0.5 + 0.5) * w).toFixed(1)}px`;
      lab.style.top = `${((-proj.y * 0.5 + 0.5) * h - 26).toFixed(1)}px`;
      lab.classList.add('on');
    }
    updateInteraction();
    api._positionInkNames?.();
    const t = state.target;
    if (!t) { arrow.classList.remove('on'); return; }
    const u = run.dir;
    labelTo.copy(t.dir).multiplyScalar(R + features.heightAt(t.dir)).sub(runner.object3D.position);
    const dist = labelTo.length();
    labelFwd.copy(labelCamDir).addScaledVector(u, -labelCamDir.dot(u)).normalize();
    labelRight.crossVectors(labelFwd, u);
    const bearing = Math.atan2(labelTo.dot(labelRight), labelTo.dot(labelFwd));
    // no pointer to the thing already at hand (see updateInteraction)
    arrow.classList.toggle('on', dist > LABEL_RANGE && !state.targetNear);
    arrow.style.transform = `rotate(${(bearing * 180 / Math.PI).toFixed(1)}deg)`;
    arrowDist.textContent = `${Math.round(dist)} m`;
  }

  function updateLabels(dt) {
    if (state.mode !== 'surface' || state.transition) return;
    labelElapsed += dt;
    const moved = camera.position.distanceToSquared(labelCameraPos) > 1e-5
      || runner.object3D.position.distanceToSquared(labelRunnerPos) > 1e-5
      || 1 - Math.abs(camera.quaternion.dot(labelCameraQuat)) > 1e-6;
    if ((!labelsDirty && !moved) || (dt && labelElapsed < 1 / 25)) return;
    labelsAndArrow();
    labelCameraPos.copy(camera.position);
    labelRunnerPos.copy(runner.object3D.position);
    labelCameraQuat.copy(camera.quaternion);
    labelElapsed = 0;
    labelsDirty = false;
  }

  // The fine ground under the viewer: rebuild it when it drifts (spread over
  // frames), draw it on foot only, and hand the globe's shader the footprint to
  // keep out of. Above PATCH_ALT the globe is the ground — that is the whole of
  // the handover, and on foot the patch covers everything the camera can see.
  const patchDir = new THREE.Vector3();
  function groundPatch() {
    const wanted = state.mode === 'surface' || state.transition?.to === 'surface';
    if (!wanted) {
      patch.mesh.visible = false;
      patch.mask.on.value = 0;
      return;
    }
    patch.update(run.dir, true);
    do patch.step(); while (clipStep != null && patch.building); // a clip's frame waits for all of it: the same on any CPU
    const above = camera.position.length() - (R + features.heightAt(patchDir.copy(camera.position).normalize()));
    const on = patch.ready && above <= PATCH_ALT;
    patch.mesh.visible = on;
    patch.mask.on.value = on ? 1 : 0;
    if (on) {
      // gl_FragCoord → world needs the *current* camera, before the render
      camera.updateMatrixWorld();
      patch.mask.invVP.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).invert();
      renderer.getDrawingBufferSize(patch.mask.res.value);
    }
  }

  // Embedded, the seat's lens: opened (wide) while the planet is further out than its poster, and closed again on the
  // way down to the ground. Returns the lens to put back once the frame is drawn (the camera's own stays the
  // poster's), or 0.
  function embedView(dt) {
    if (wide < 1 && (state.transition || state.mode !== 'orbit')) wide = dt > 0 ? Math.min(1, wide + (1 - wide) * Math.min(1, dt * 5) + 1e-3) : 1;
    if (wide >= 1) return 0;
    const lens = camera.fov;
    camera.fov = (2 * Math.atan(Math.tan((lens * RAD) / 2) / wide)) / RAD;
    camera.updateProjectionMatrix();
    return lens;
  }
  // the seat's square of the frame just drawn (the canvas holds it until this task ends): the page's picture of the
  // planet from here on
  const still = embed ? document.createElement('canvas') : null;
  function snapStill() {
    const src = renderer.domElement, side = seat.box * (src.width / Math.max(1, host.clientWidth || innerWidth));
    still.width = still.height = Math.max(2, Math.min(512, Math.round(side)));
    still.getContext('2d').drawImage(src, (src.width - side) / 2, (src.height - side) / 2, side, side, 0, 0, still.width, still.height);
  }

  let clipStep = null; // api.clip.draw's step: that frame is drawn at once, off the page's own loop
  function frame() {
    if (clipStep == null) requestAnimationFrame(frame);
    if (held && clipStep == null) return; // embedded and held: the page holding the planet draws, and this frame stays as it was
    if (!activeFrameRequest && frameRequestAt < frameRequests.length) {
      activeFrameRequest = frameRequests[frameRequestAt++];
      overrideT = activeFrameRequest.time;
      if (frameRequestAt === frameRequests.length) {
        frameRequests.length = 0;
        frameRequestAt = 0;
      }
    }
    const deterministic = overrideT != null;
    const requestedStep = clipStep ?? (deterministic && activeFrameRequest && !activeFrameRequest.painted
      ? activeFrameRequest.delta
      : 0);
    const dt = deterministic
      ? requestedStep
      : fixedT == null ? Math.min(clock.getDelta(), 0.05) : 0;
    updateResolution(deterministic ? 0 : dt);
    state.t = deterministic ? overrideT : fixedT == null ? state.t + dt : fixedT;
    uniforms.uTime.value = state.t;
    build.tick(state.t);
    easeLook(dt, deterministic);
    if (deterministic) moveRunner(0, state.t);
    let surface = state.mode === 'surface' ? 1 : 0;
    let landing = null;

    if (state.transition) {
      const tr = state.transition;
      if (deterministic && dt > 0) tr.stepped = true;
      // frame(t, delta) advances a capture transition once per explicit request. The ordinary one-argument
      // frame(t) and fixed ?t= poster paths retain their old instant-landing behavior.
      tr.k = dt > 0 ? Math.min(1, tr.k + dt / tr.dur) : tr.stepped ? tr.k : 1;
      const k = tr.k * tr.k * tr.k * (tr.k * (tr.k * 6 - 15) + 10);
      surface = tr.to === 'surface' ? k : 1 - k;
      if (tr.to === 'orbit' && deterministic && !orbit.drag) {
        orbit.yaw = posterYaw + yawOffset + P['motion.orbitRate'] * state.t;
      }
      const to = targetState(tr.to);
      // where a flight down will stand the camera, handed to the style with the
      // frame (`landing`): what a landing places (life.js) stands there before
      // the camera is down, and fades in with the ground on the way
      if (tr.to === 'surface') {
        landCam.fov = camera.fov;
        landCam.aspect = camera.aspect;
        landCam.position.copy(to.pos);
        landCam.up.copy(to.up);
        landCam.lookAt(to.look);
        landCam.updateMatrixWorld();
        landing = landCam;
      }
      // Spherical interpolation of the camera about the planet: the radius
      // descends monotonically and the direction swings, so the flight can
      // never cut through the surface.
      const rA = tr.fromPos.length() || 1, rB = to.pos.length() || 1;
      // A short flight (the wheel's own landing, from just over the ground)
      // slides straight down and hands over as it goes. A long one (Land from
      // the poster, a leave back out to orbit) is a zoom: its height over the
      // ground end changes by a steady ratio, and the hand-over is that height's
      // last FLIGHT_HANDOFF units — a camera still holding the whole globe keeps
      // the orbit's painting (its space, its weather, its sea) until it is down.
      // Its swing round the globe (and its look and its up) is made while it is
      // high, so it is over the landing before it is near the ground, and not
      // skimming the hills on the way there.
      const ground = tr.to === 'surface' ? rB : rA, high = tr.to === 'surface' ? rA : rB;
      let radius = lerp(rA, rB, k), swing = k;
      if (high - ground > FLIGHT_HANDOFF) {
        const along = tr.to === 'surface' ? 1 - k : k; // the share of the way out from the ground end
        const h = Math.exp(lerp(Math.log(FLIGHT_HANDOFF), Math.log(high - ground + FLIGHT_HANDOFF), along)) - FLIGHT_HANDOFF;
        radius = ground + h;
        surface = 1 - Math.min(1, h / FLIGHT_HANDOFF);
        swing = tr.to === 'surface' ? 1 - (1 - k) * (1 - k) : k * k;
      }
      camState.dir.copy(tr.fromPos).divideScalar(rA).lerp(tmpDir.copy(to.pos).divideScalar(rB), swing);
      if (camState.dir.lengthSq() < 1e-6) camState.dir.copy(tmpDir);
      const flight = camState.dir.normalize().multiplyScalar(radius);
      camera.position.copy(tr.k >= 1 ? to.pos : keepOutside(flight, 0.45));
      lookAt.lerpVectors(tr.fromLook, to.look, swing);
      camera.up.copy(tr.fromUp).lerp(to.up, swing).normalize();
      camera.lookAt(lookAt);
      if (tr.k >= 1) {
        state.mode = tr.to;
        state.transition = null;
        labelsDirty = true;
        if (state.mode === 'orbit') clearSurfaceLabels();
      }
    } else if (state.mode === 'orbit') {
      if (!orbit.drag) orbit.yaw = deterministic
        ? posterYaw + yawOffset + P['motion.orbitRate'] * state.t
        : orbit.yaw + P['motion.orbitRate'] * dt;
      if (state.focus) {
        state.focus.k = Math.min(1, state.focus.k + dt / 1.2);
        const k = smoothstep(state.focus.k);
        const want = state.focus.dir;
        orbit.yaw = lerpAngle(orbit.yaw, Math.atan2(want.z, want.x), k);
        orbit.pitch = lerp(orbit.pitch, Math.asin(clamp(want.y, -1, 1)) * 0.75 + 0.12, k);
        if (state.focus.k >= 1) state.focus = null;
      }
      // the build turns the orbit to the day coming in: at once in a clip (at's face), eased on a live page (to's)
      if (build.face > 0 && !orbit.drag) orbit.yaw = lerpAngle(orbit.yaw, build.yaw, deterministic ? build.face : 1 - Math.exp(-2.5 * dt));
      camState.dir.set(Math.cos(orbit.pitch) * Math.cos(orbit.yaw), Math.sin(orbit.pitch), Math.cos(orbit.pitch) * Math.sin(orbit.yaw));
      camera.position.copy(orbitCamPos(camState.dir, orbit.dist));
      if (placeShot(camState.dir)) {
        camera.up.copy(shotCamera.up);
        camera.lookAt(lookAt.copy(shotCamera.look));
      } else {
        camera.up.set(0, 1, 0);
        camera.lookAt(CENTER);
        lookAt.copy(CENTER);
      }
    } else {
      if (!deterministic) moveRunner(dt);
      const to = targetState('surface');
      const alpha = dt > 0 ? 1 - Math.exp(-9 * dt) : 1;
      camera.position.lerp(to.pos, alpha);
      keepSwimCameraAbove(camera.position);
      lookAt.lerp(to.look, alpha);
      camera.up.copy(to.up); // sphere gravity: the runner's up is the screen's up (a landed look's own, while it holds)
      camera.lookAt(lookAt);
    }

    const lens = embedView(dt);
    updateLabels(dt);
    groundPatch();
    updateBag.dt = dt;
    updateBag.time = state.t;
    updateBag.mode = state.mode;
    updateBag.surface = surface;
    updateBag.landing = landing;
    updateBag.runner = runner.object3D;
    // a pinned frame (?t=, frame(t)) draws every feature, whatever level the live frames have faded to
    updateBag.lod = deterministic || fixedT != null ? 0 : perf.lodK;
    styleUpdate(updateBag);
    if (post) post.render(dt);
    else renderer.render(scene, camera);
    if (lens) {
      camera.fov = lens;
      camera.updateProjectionMatrix();
    }

    state.frames++;
    // the first frame on screen: what a page holding this planet in a frame waits for before it drops the still it
    // was showing (a room does; the ready beat below is thirty frames, far too late for that). Embedded, the planet
    // then holds until the page shows it.
    if (state.frames === 1) {
      host.setAttribute('data-pc-painted', '');
      if (embed) {
        held = true;
        tell('ready');
      }
    }
    if (handBack) { // zoomed out past the seat: this frame is the page's picture, and the zoom is the page's again
      snapStill();
      tell('zoom-out-past-max', handBack);
      handBack = 0;
      held = true;
    }
    if (state.frames === 30) {
      window.__ready = true;
      host.setAttribute('data-pc-ready', '');
    }
    if (activeFrameRequest && !activeFrameRequest.painted) {
      const painted = activeFrameRequest;
      painted.painted = true;
      requestAnimationFrame(() => {
        if (activeFrameRequest === painted) activeFrameRequest = null;
        painted.resolve(painted.time);
      });
    }
  }

  function setParams(partial) {
    const changed = applyParams(partial);
    // A shot's own look stands while it is live, but the page may still dial
    // those same keys underneath it: whatever it passes now is the number the
    // picture hands back when it ends, not the one captured when the shot began.
    if (shotLive && partial && typeof partial === 'object')
      for (const key of shotLook.keys()) if (key in partial) shotLook.set(key, P[key]);
    // …and once it has ended, a key the page dials is the page's at once: it
    // leaves the hand-back still under way
    if (partial && typeof partial === 'object') for (const key of Object.keys(partial)) lookBack.delete(key);
    if (!changed.length) return 'live';
    const oldBase = orbit.base;
    const followsPoster = Math.abs(orbit.dist - oldBase * distMultiplier) < 1e-6;
    if (changed.includes('camera.fov')) camera.fov = P['camera.fov'];
    if (changed.some((key) => key === 'camera.fov' || key === 'camera.fill')) {
      resizeRenderer();
      if (followsPoster) orbit.dist = orbit.base * distMultiplier;
    }
    // craft.frame is the poster's own aim and fit: a change re-picks the face of
    // the week to show (and, with it, where the orbit stands to fit the crop).
    // poster.shot is the poster itself: a change asks for another shot and stands
    // the orbit on it, so the bench can watch one dial turn the sheet — but only
    // from steady orbit. A shot is a picture of the orbit, and while landed or
    // mid-flight the camera is the ground's: there the dial is recorded and left
    // alone (applyParams has already kept it), taking up no lens, no look
    // override and no orbit refit until the reader is back in space and asks for
    // another shot of their own.
    if (state.mode === 'orbit' && !state.transition && changed.includes('poster.shot')) {
      rebuildShot();
      framePoster();
      orbit.yaw = posterYaw + yawOffset;
      orbit.pitch = clamp(posterPitch + pitchOffset, -1.35, 1.35);
      resizeRenderer();
      orbit.dist = orbit.base * distMultiplier;
    } else if (changed.includes('craft.frame')) {
      framePoster();
      orbit.yaw = posterYaw + yawOffset;
      orbit.pitch = clamp(posterPitch + pitchOffset, -1.35, 1.35);
      resizeRenderer();
      orbit.dist = orbit.base * distMultiplier;
    }
    const chaseChanged = changed.some((key) => key.startsWith('camera.chase'));
    if (chaseChanged) chase.pitch = P['camera.chasePitch'];
    if (chaseChanged || (changed.includes('camera.fov') && atFeature)) {
      let distance = P['camera.chaseDist'];
      if (atFeature) {
        const shot = landingShot(atFeature);
        const framed = shot ? framedDist(features, atFeature, run.dir, shot, landedYaw, run.facing) : 0;
        distance = Math.max(distance, framed);
      }
      chase.dist = clamp(distance, 4, FRAME_RUNNER_MAX);
      chaseSafeWanted = NaN;
    }
    if (changed.some((key) => key.startsWith('pal.') || key.startsWith('sky.'))) {
      style.repaint?.({ THREE, scene, renderer, features, uniforms, runner: runner.object3D, changed });
      if (changed.some((key) => key.includes('.landMid') || key.startsWith('pal.accent'))) repaintFeatureObjects();
      syncPaletteGuide();
    }
    // `world.archetype` belongs to the world.* dials: another world is another
    // planet, so it rebuilds rather than repaints.
    return changed.some((key) => /^(world|climate|terrain|kinds|sun|living)\./.test(key)) ? 'reload' : 'live';
  }

  // The build (build.js): the week as it stood at the end of each day, played when a page asks for it (api.build).
  // Nothing of it runs until then, and when it ends the planet is exactly the one built above.
  const build = createBuild({
    features, seed: opts.seed || window.SEED, planet, ocean, scene, objects: featureObjects, material: planetMaterial,
    uniforms, cap: features.orbit.reliefCap, R,
  });

  const api = {
    setMode: (m) => { requestMode(m === 'surface' ? 'surface' : 'orbit'); },
    setParams,
    /** The week as it stood at the end of each day (build.js): await prepare(), then at(p) in a clip's frames, or
     *  to(p) / show(ids) / end() on a live page; days lists each day's sessions. */
    build: {
      prepare: () => build.prepare(),
      at: (p, o) => build.at(p, o),
      to: (p, o) => build.to(p, o),
      show: (ids, o) => build.show(ids, o),
      end: (o) => build.end(o),
      days: build.days,
      get live() { return build.live; },
      get position() { return build.position; },
    },
    /** Embedded (?embed=1): what the page holding the planet works it by (galaxy-dive.js documents the protocol). */
    embed: embed ? {
      /** The page's picture of the planet: its poster's crop square, box CSS px across in the middle of the frame, as
       *  far out as the planet zooms. Held, the planet is parked there. */
      seat(box) {
        seat.box = box;
        if (held && state.mode === 'orbit' && !state.transition) {
          orbit.dist = Math.max(orbit.dist, orbit.base);
          wide = seatWide() || 1;
        }
      },
      /** Hold the frame (the page draws), or draw it again. */
      hold(on) {
        held = !!on;
        if (!held) clock.getDelta(); // the time held is not the planet's
      },
      /** Zoom by f (over 1 in), as a pinch would. */
      zoom,
      /** Land (the Land flight), or come back up to orbit; instant asks for a cut. */
      land: (instant) => requestMode('surface', instant ? 1e-3 : TRANSITION),
      leave: (instant) => requestMode('orbit', instant ? 1e-3 : TRANSITION),
      /** Whether it is flying between orbit and the ground (zoom waits for it). */
      get flying() { return !!state.transition; },
      /** How many CSS px across the seat's square is now (in the middle of the frame): the page keeps its own picture
       *  over it as the two cross. */
      view() {
        const near = Math.sqrt(Math.max(1e-6, orbit.base ** 2 - R * R) / Math.max(1e-6, orbit.dist ** 2 - R * R));
        return POSTER_CROP * Math.min(host.clientWidth || innerWidth, host.clientHeight || innerHeight) * wide * Math.max(1, near);
      },
      /** The seat's square as the planet last handed the zoom back (a canvas). */
      still,
    } : null,
    /** The crop this frame was composed for, for the still that will cut it: the
     *  central share of the short axis a shelf poster keeps. Set only when
     *  craft.frame or a shot framed the orbit for it, so a default page says
     *  nothing and apps/planet-home/lib/paint.js cuts its own crop, exactly as
     *  before. Every shot composes for that same crop. */
    get posterCrop() { return P['craft.frame'] || shotLive ? POSTER_CROP : null; },
    frame: (time, delta = 0) => {
      const value = Number(time);
      const step = Number(delta);
      const at = Number.isFinite(value) ? Math.max(0, value) : 0;
      const dt = Number.isFinite(step) ? clamp(step, 0, 0.05) : 0;
      return new Promise((resolve) => frameRequests.push({ time: at, delta: dt, resolve, painted: false }));
    },
    /** A clip's own frames (apps/planet-home/lib/story.js): from the first draw the page's loop draws nothing, and
     *  draw(t, delta, far) draws one frame at once, at time t moved on by delta, the orbit far times the poster's
     *  distance; land(id, seconds) flies down to feature id (or where Land goes), leave() is in orbit again at once. */
    clip: {
      draw(t, delta = 0, far = 1) {
        held = true;
        orbit.dist = orbit.base * far;
        overrideT = t;
        clipStep = delta;
        try { frame(); } finally { clipStep = null; }
      },
      land(id, seconds = TRANSITION) {
        const f = features.byId[id];
        if (f) placeAtFeature(f);
        state.focus = null; // the clip keeps its own orbit: no turn toward the landmark once it is back up
        requestMode('surface', seconds, true);
      },
      leave: () => requestMode('orbit', 1e-3),
    },
    params: () => ({ ...P }),
    get mode() { return state.mode; },
    features,
    uniforms,
    scene,
    camera,
    renderer,
    planet,
    ocean,
    runner,
    objects: featureObjects,
    debug: {
      perf() {
        renderer.getDrawingBufferSize(perfBuffer);
        return {
          dpr: +renderer.getPixelRatio().toFixed(3),
          bufferMP: +((perfBuffer.x * perfBuffer.y) / 1e6).toFixed(3),
          frameMs: +perf.frameMs.toFixed(2),
          steps: perf.step,
          lod: perf.lod,
          lodK: +perf.lodK.toFixed(3),
          lodFloor: perf.lodFloor,
        };
      },
      /** Feature LOD by hand: pin a level (0 … the style's lodLevels; the bench reads what each costs), or hand it back
       *  to the frame-time governor (null). Pinned, neither the level nor the resolution moves. */
      lod(level) {
        if (level == null) perf.lodPinned = false;
        else {
          perf.lod = perf.lodK = clamp(Math.round(Number(level)) || 0, 0, Math.max(0, style.lodLevels | 0));
          perf.lodPinned = true;
        }
        return perf.lod;
      },
      /** The poster as it stands: which shot is up (classic when the dial asked
       *  for it or the reader has taken the camera), the lens it uses, and the
       *  distance the orbit is resting at. */
      poster() {
        return {
          dial: P['poster.shot'],
          shot: shotLive && shotPlan ? shotPlan.id : 'classic',
          live: shotLive,
          lens: +camera.fov.toFixed(2),
          distance: +orbit.dist.toFixed(2),
          base: +orbit.base.toFixed(2),
          crop: P['craft.frame'] || shotLive ? POSTER_CROP : null,
        };
      },
      framing() {
        camera.updateMatrixWorld();
        const p = runner.object3D.position.clone();
        const u = run.dir;
        const feet = p.clone().project(camera);
        const head = p.clone().addScaledVector(u, 1.81).project(camera);
        const mon = features.monument ? groundPos(features.monument.dir).addScaledVector(features.monument.dir, 3).project(camera) : null;
        let atY = null, atOn = null, atDist = null, atRadius = null, atFill = null;
        if (atFeature) {
          const obj = featureObjects.get(atFeature.id);
          const at = obj ? obj.position : groundPos(run.dir);
          const v = at.clone().project(camera);
          atY = +v.y.toFixed(3);
          atOn = Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z <= 1;
          atDist = +camera.position.distanceTo(at).toFixed(2);
          // …and the whole object, not just its origin: the bounding sphere has
          // to clear the frame edges, `atFeatureFill` being how much of the way
          // to one it reaches (1 = touching).
          const sphere = featureSphereOf.get(atFeature.id);
          if (sphere) {
            const half = (camera.fov * RAD) / 2;
            const to = sphere.center.clone().sub(camera.position);
            const dist = to.length();
            const off = Math.acos(clamp(to.divideScalar(dist || 1).dot(camera.getWorldDirection(new THREE.Vector3())), -1, 1))
              + Math.asin(Math.min(1, sphere.radius / Math.max(dist, 1e-6)));
            const edge = Math.min(half, Math.atan(camera.aspect * Math.tan(half)));
            atRadius = +sphere.radius.toFixed(2);
            atFill = +(off / edge).toFixed(3);
            atOn = dist > sphere.radius && off <= edge;
          }
        }
        // camera must not be inside a feature, nor look through one at the runner
        let inside = false, blocked = false;
        const dirC = camera.position.clone().sub(p);
        const distC = dirC.length();
        dirC.divideScalar(distC || 1);
        for (const s of featureSpheres) {
          if (camera.position.distanceTo(s.center) < s.radius - 0.05) inside = true;
          const oc = s.center.clone().sub(p);
          const b = oc.dot(dirC);
          const disc = b * b - (oc.lengthSq() - s.radius * s.radius);
          if (disc > 0) {
            const enter = b - Math.sqrt(disc);
            if (enter > 0.5 && enter < distC - 0.05) blocked = true;
          }
        }
        return {
          mode: state.mode,
          cameraDist: +distC.toFixed(2),
          chaseDist: +chase.dist.toFixed(2),
          runnerFeetY: +feet.y.toFixed(3),
          runnerHeadY: +head.y.toFixed(3),
          runnerHeightFracOfFrame: +((head.y - feet.y) / 2).toFixed(3),
          runnerFeetFracFromBottom: +((feet.y + 1) / 2).toFixed(3),
          runnerOnScreen: Math.abs(feet.x) <= 1 && Math.abs(head.x) <= 1 && feet.y >= -1 && head.y <= 1,
          monumentY: mon ? +mon.y.toFixed(3) : null,
          monumentOnScreen: mon ? Math.abs(mon.x) <= 1 && mon.y <= 1 && mon.y >= -1 : null,
          // what `?at=` sent the runner to: the landmark object, or (a range has
          // none) the crest under their feet
          atFeature: atFeature ? atFeature.id : null,
          atFeatureY: atY,
          atFeatureOnScreen: atOn,
          atFeatureDist: atDist,
          atFeatureRadius: atRadius,
          atFeatureFill: atFill,
          cameraInsideFeature: inside,
          runnerToCameraRayBlocked: blocked,
          featureSpheres: featureSpheres.length,
        };
      },
      patch() {
        return {
          drawn: patch.mesh.visible,
          built: patch.ready,
          building: patch.building,
          centre: patch.centre.toArray().map((v) => +v.toFixed(5)),
          east: patch.mask.east.value.toArray().map((v) => +v.toFixed(6)),
          north: patch.mask.north.value.toArray().map((v) => +v.toFixed(6)),
          drift: +(patch.centre.angleTo(run.dir) * R).toFixed(2),
          verts: patch.mesh.geometry.attributes.position.count,
          cells: [PATCH_CELL, PATCH_EDGE],
          reach: +PATCH_REACH.toFixed(1),
          maskInjected: mask.injected,
          maskOn: patch.mask.on.value,
        };
      },
      swim() {
        return { depth: run.depth, mode: run.waterMode };
      },
      measure() {
        const h = features.heightAt(run.dir);
        const counts = {};
        for (const f of features.list) counts[f.kind] = (counts[f.kind] || 0) + 1;
        return {
          mode: state.mode,
          frames: state.frames,
          t: state.t,
          ready: !!window.__ready,
          rootOffset: runner.object3D.position.length() - (R + h),
          feetY: runner.debug.feetY(),
          speed: run.speed,
          air: run.air,
          vAir: run.vAir,
          anticipation: run.jumpCrouch > 0 ? 1 - run.jumpCrouch / JUMP_CROUCH : 0,
          waterMode: run.waterMode,
          at: run.dir.toArray(),
          counts,
          seaLevel: features.seaLevel,
          warmth: features.warmth,
          roughness: features.roughness,
          energy: features.energy,
          rangeSpans: features.ranges.map((r) => Math.round(r.span || 0)),
          featureIds: features.list.map((f) => f.id),
          camera: camera.position.toArray(),
        };
      },
      selfCheck() {
        const c = [];
        const ok = (name, cond, detail) => c.push({ name, ok: !!cond, detail });
        const twice = readWeek(opts.seed || window.SEED);
        let same = twice.list.length === features.list.length;
        for (let i = 0; same && i < 400; i++) {
          const d = new THREE.Vector3(Math.sin(i), Math.cos(i * 1.7), Math.sin(i * 0.31)).normalize();
          same = Math.abs(twice.heightAt(d) - features.heightAt(d)) < 1e-12;
        }
        ok('deterministic readWeek + heightAt', same);
        const kinds = {};
        for (const f of features.list) kinds[f.kind] = (kinds[f.kind] || 0) + 1;
        const checkedSeed = opts.seed || window.SEED || {};
        const activities = Array.isArray(checkedSeed.activities) ? checkedSeed.activities.filter(Boolean) : [];
        const oldRace = String(checkedSeed.race || '');
        const raceCount = activities.filter((a) => !!a.isRace || (!!oldRace && a.title === oldRace)).length;
        const allowed = new Set(['range', 'valley', 'constructed', 'calm', 'spires', 'wheel', 'lagoon', 'cairn', 'pitch', 'monument']);
        ok('one mapped feature per activity', features.list.length - (kinds.monument || 0) === activities.length, JSON.stringify(kinds));
        ok('race monuments match marked races', features.races.length === raceCount && (kinds.monument || 0) === raceCount, `${features.races.length} of ${raceCount}`);
        ok('feature kinds known', features.list.every((f) => allowed.has(f.kind)), JSON.stringify(kinds));
        ok('route landforms match range + valley features', features.routes.length === (kinds.range || 0) + (kinds.valley || 0));
        ok('lagoon basins match swim features', features.lagoons.length === (kinds.lagoon || 0));
        const lagoonDepths = features.lagoons.map((b) => [b.featureId, b.waterLevel - features.heightAt(b.dir)]);
        ok('every lagoon floor is flooded', lagoonDepths.every(([, depth]) => depth > 0.5), lagoonDepths.map(([id, depth]) => `${id} ${depth.toFixed(1)} u`).join(', '));
        ok('every feature explains its mapping', features.list.every((f) => Array.isArray(f.explain) && f.explain.length > 0));
        ok('sea level sane', Number.isFinite(features.seaLevel) && features.seaLevel > -30 && features.seaLevel < 30, String(features.seaLevel));
        ok('warmth/roughness/energy in range', features.warmth >= 0 && features.warmth <= 1 && features.roughness >= 0 && features.roughness <= 1 && features.energy >= 0 && features.energy <= 1.5, `${features.warmth.toFixed(3)} ${features.roughness.toFixed(3)} ${features.energy.toFixed(3)}`);
        const geo = planet.geometry;
        ok('planet attributes', !!(geo.attributes.aHeight && geo.attributes.aMacro && geo.attributes.aSlope && geo.attributes.aRace && geo.attributes.aRange && geo.attributes.aSea), `${geo.attributes.position.count} verts`);
        ok('feature dirs on sphere', features.list.every((f) => Math.abs(f.dir.length() - 1) < 1e-6));
        ok('spawn belongs to primary monument', !features.monument || features.spawn.distanceTo(features.monument.spawn) < 1e-9);
        // A highlighted running race remains a landform, not an extruded tube:
        // its crest varies along the course.
        const race = features.race;
        if (race?.kind === 'range') {
          const n = race.seg.length / 3;
          let hi = -99, lo = 99;
          for (let i = 0; i < 40; i++) {
            const k = Math.floor((i / 39) * (n - 1)) * 3;
            const h = features.heightAt(new THREE.Vector3(race.seg[k], race.seg[k + 1], race.seg[k + 2]));
            hi = Math.max(hi, h);
            lo = Math.min(lo, h);
          }
          ok('summits and saddles along the race', hi - lo > 4 && hi > 12, `min ${lo.toFixed(1)} max ${hi.toFixed(1)}`);
          ok('race crest reaches ≈ its ascent amplitude', hi >= race.amp * 0.6, `${hi.toFixed(1)} of ${race.amp.toFixed(1)}`);
        }
        // the runner lands ~SPAWN_BACK units short of the monument, facing it
        if (features.monument) {
          const back = features.spawn.angleTo(features.monument.dir) * R;
          const toMon = features.monument.dir.clone().addScaledVector(features.spawn, -features.monument.dir.dot(features.spawn)).normalize();
          ok('spawn ≈10 u down-course', Math.abs(back - SPAWN_BACK) < 1.5, `${back.toFixed(2)} u`);
          ok('facing the monument', features.spawnTangent.dot(toMon) > 0.98, features.spawnTangent.dot(toMon).toFixed(3));
        }
        // a built landmark stands on land, a lagoon's water is never under the
        // sea, and every landing (?at=, Land, a zoom) puts the runner on dry ground
        const span = { low: 0, high: 0 };
        const wetBuilt = features.list.filter((f) => BUILT.has(f.kind) && groundSpan(features.heightAt, f.dir, 2, span).low < features.seaLevel);
        ok('built landmarks stand on land', !wetBuilt.length, wetBuilt.map((f) => f.id).join(', '));
        const sunk = features.lagoons.filter((b) => b.waterLevel < features.seaLevel);
        ok('lagoon water not under the sea', !sunk.length, sunk.map((b) => b.featureId).join(', '));
        const wetLandings = features.list.filter((f) => !dryAt(features, featureStart(features, f, uniforms.uSunDir.value, landingShot(f)).dir));
        ok('every landing on dry ground', !wetLandings.length, wetLandings.map((f) => f.id).join(', '));
        // continents and basins rather than one flat plain
        {
          let deep = 0, high = 0, N = 0;
          for (let i = 0; i < 1200; i++) {
            const y = 1 - (i / 1199) * 2, r2 = Math.sqrt(Math.max(0, 1 - y * y)), th = Math.PI * (3 - Math.sqrt(5)) * i;
            const h = features.heightAt(new THREE.Vector3(Math.cos(th) * r2, y, Math.sin(th) * r2));
            if (h < features.seaLevel - 2) deep++;
            if (h > features.seaLevel + 2) high++;
            N++;
          }
          ok('continents and basins exist', deep / N > 0.01 && high / N > 0.01, `deep ${(deep / N).toFixed(2)} land ${(high / N).toFixed(2)}`);
        }
        // planted feet: min sole height in the root frame while grounded
        const feet = runner.debug.feetY();
        ok('feet at ground while idle', run.air === 0 && (run.waterMode === 'swimming' || (Math.abs(Math.min(...feet)) < 0.02 && Math.abs(Math.max(...feet)) < 0.02)), feet.map((v) => v.toFixed(4)).join(' '));
        const rootTarget = run.waterMode === 'swimming' ? features.seaLevel - SWIM_HEIGHT : features.heightAt(run.dir);
        ok('root sits on terrain or swim line', run.rootEasing || Math.abs(runner.object3D.position.length() - (R + rootTarget + run.air)) < 1e-9);
        // the ground patch: a grid that reaches past the horizon on foot, and (once
        // built) vertices that sit exactly on the terrain it claims to be
        ok('ground patch plan reaches past the horizon', PATCH_REACH > 90 && PATCH_REACH < 150 && PATCH_CELL < 0.5 && PATCH_AXIS[0] === -PATCH_REACH && PATCH_AXIS[PATCH_W - 1] === PATCH_REACH, `${PATCH_W}² verts, reach ±${PATCH_REACH.toFixed(1)} u, cells ${PATCH_CELL}→${PATCH_EDGE}`);
        // a zero normal means the ring fit never reached that vertex: either the
        // index buffer is short (it has been) or a ring came out degenerate
        const unfitted = (geo2) => {
          const n = geo2.attributes.normal.array;
          let z = 0;
          for (let i = 0; i < n.length; i += 3) if (n[i] === 0 && n[i + 1] === 0 && n[i + 2] === 0) z++;
          return z;
        };
        ok('every planet vertex has a fitted normal', unfitted(planet.geometry) === 0, `${unfitted(planet.geometry)} unfitted`);
        if (patch.ready) {
          const g = patch.mesh.geometry;
          const pos = g.attributes.position.array;
          const step = Math.floor(g.attributes.position.count / 24);
          let worst = 0;
          const d = new THREE.Vector3();
          for (let i = 0; i < 24; i++) {
            const k = i * step * 3;
            d.set(pos[k], pos[k + 1], pos[k + 2]);
            const len = d.length();
            worst = Math.max(worst, Math.abs(len - (R + features.heightAt(d))));
          }
          ok('patch vertices lie on heightAt', worst < 5e-3, `worst ${worst.toFixed(4)} u over 24 verts`);
          ok('patch triangles cover the whole grid', g.index.count === (PATCH_W - 1) * (PATCH_W - 1) * 6, `${g.index.count} indices`);
          ok('every patch vertex has a fitted normal', unfitted(g) === 0, `${unfitted(g)} unfitted`);
        }
        if (state.mode === 'surface' && !state.transition) {
          camera.updateMatrixWorld();
          const root = runner.object3D.position.clone();
          const feet = root.clone().project(camera);
          const head = root.clone().addScaledVector(run.dir, 1.81).project(camera);
          const frameHeight = (head.y - feet.y) / 2;
          ok('surface runner stays framed', Math.abs(feet.x) <= 1 && Math.abs(head.x) <= 1
            && feet.y >= -1 && head.y <= 1 && frameHeight >= 0.15 && frameHeight <= 0.22,
          `height ${(frameHeight * 100).toFixed(1)}%, feet ${feet.y.toFixed(2)}, head ${head.y.toFixed(2)}`);
          const eyeDir = camera.position.clone().normalize();
          const eyeClear = camera.position.length() - (R + Math.max(features.heightAt(eyeDir), features.seaLevel));
          ok('surface camera clears terrain', eyeClear > 0.05, `${eyeClear.toFixed(2)} u`);
        }
        return c;
      },
    },
  };
  window.__app = api;
  style.ready?.(api);
  queueMicrotask(syncPaletteGuide);

  const want = params.get('view');
  if (want === 'surface' || landedPlan) {
    requestMode('surface');
    state.transition = null;
    state.mode = 'surface';
    landedLive = !!landedPlan;
  }
  moveRunner(0); // seat the runner on the terrain even in orbit mode
  faceCamera();
  if (state.mode === 'surface') {
    const to = targetState('surface');
    camera.position.copy(to.pos);
    lookAt.copy(to.look);
    camera.up.copy(to.up);
    camera.lookAt(lookAt);
  }
  if (fixedT != null && params.get('view') !== 'surface' && !landedPlan) {
    camState.dir.set(Math.cos(orbit.pitch) * Math.cos(orbit.yaw), Math.sin(orbit.pitch), Math.cos(orbit.pitch) * Math.sin(orbit.yaw));
    camera.position.copy(orbitCamPos(camState.dir, orbit.dist));
    camera.lookAt(CENTER);
  }
  // The shaders: where the GPU can compile them side by side (KHR_parallel_shader_compile), every program the scene
  // will want (the orbit's, and the ground's for a landing) and every pass the style lays after it (post.compile) is
  // started at once and the first frame waits for them, instead of each being compiled and waited on inside the frame
  // that first draws it. The scene draws into the style's pass target, and a program is made for the target it draws
  // into. Each program's uniforms and attributes are then read back from the GPU (a round trip apiece, which three
  // does on a program's first use) a program at a time, so the first frame does none of it. The pixels are the same
  // either way.
  if (renderer.extensions.has('KHR_parallel_shader_compile')) {
    renderer.setRenderTarget(post?.target ?? null);
    const programs = renderer.compileAsync(scene, camera);
    renderer.setRenderTarget(null);
    Promise.all([programs, post?.compile?.()]).then(async () => {
      for (const program of renderer.info.programs) {
        await pace();
        program.getUniforms();
      }
      frame();
    });
  } else frame();
  return api;
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * t;
}

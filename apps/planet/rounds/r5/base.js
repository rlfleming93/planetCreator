/* Planet Creator — wave 1 base.
 *
 * Owns everything that is not the look: world reading, terrain, sphere movement,
 * the runner rig + animation, cameras and the mode transition, the field guide,
 * and the capture hooks. Style authors pass `{ style }` to createApp(); every
 * style hook is optional and falls back to a plain neutral default.
 *
 *   import { createApp } from './base.js';
 *   createApp({ style: { name: 'mine', planetMaterial({ features }) { … } } });
 */
import * as THREE from 'three';
import { createRunner } from './runner.js';

export const R = 120; // planet radius (units); 1 unit ≈ 1 m, runner ≈ 1.8 units
export const MONUMENT_ID = 'monument';

const TAU = Math.PI * 2;
const DAY_LON = TAU / 7; // one day of the week → 360/7° of longitude
const RAD = Math.PI / 180;
const MI = 1609.344;
const U_PER_MI = 45 / 3.5; // 3.5 mi ≈ 45 units
const DETAIL = 7; // icosphere detail → 163 842 verts / 327 680 tris

const WALK = 3.4;
const SPRINT = 6.6;
const JUMP_V = 8.2;
const GRAVITY = 24;
const KNEE_DEPTH = 0.7; // deepest water the runner will enter
const LABEL_RANGE = 15; // proximity label radius
const TRANSITION = 2; // seconds of camera flight between modes
const CAM_MIN = 2.4; // closest the chase camera may get to the runner
const CHASE_DIST = 10.9; // runner ≈ 1/5 of the frame height at fov 45 (2·1.81/(0.2·2·tan22.5°))
const CHASE_LOOK = 1.6; // look at head height, so the runner sits in the lower third
const ORBIT_FILL = 0.68; // planet diameter as a fraction of the viewport height

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smoothstep = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const wrapPi = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;

// Terrain landform dials.
const CONT_AMP = 5; // continental relief, units
const CONT_F = 1.5; // …~1.5 cycles per radius: continents and bays
const WARP = 0.35; // domain-warp amplitude, × range width
const WARP_F = 3; // …low frequency: meandering flanks
const ALONG_F = 12; // summit spacing along a chain ≈ 10 units (≈4–6 peaks / 45 u)
const ENV_F = 2.6; // broad envelope: a few dominant summits
const DET_F = 26; // erosion detail (spurs/gullies), ~4.5-unit cells
const SPAWN_BACK = 10; // metres back along the race trail from the finish
const SPOT_BACK = 10; // metres out from a landmark when ?at= spawns you next to one
const STAND_RADII = 1.3; // …or this many of the landmark's own bounding-sphere radii + STAND_CLEAR
const STAND_CLEAR = 4; // clear ground in front of it (see featureStart)
const FRAME_MARGIN = 1.08; // a landmark must clear the frame edge by this much
const FRAME_MAX = 18; // the furthest the chase camera will pull back to frame one (the zoom limit)
const CHASE_PITCH = 0.34; // the chase camera's default elevation above the runner
const RUNNER_HALF = 0.3; // the runner's own half-width: what a landmark standing dead ahead hides behind

// Ground patch: the camera-centred height field that replaces the globe under the
// viewer (see `createPatch`). Cell size grows geometrically from the centre out.
const PATCH_CELL = 0.25; // innermost cell, units
const PATCH_EDGE = 2; // outermost cell, units
const PATCH_HALF = 120; // tangent-plane half-extent, units (≈3× the horizon on foot)
const PATCH_DRIFT = 8; // re-centre once the viewer has moved this far, units
const PATCH_ALT = 45; // drawn below this height above the ground, units
const PATCH_FADE = 0.72; // opaque share of the footprint; the rim dissolves into the globe
const PATCH_MS = 3; // rebuild work allowed per frame, ms

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
function icosphere(detail) {
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
    for (const [a, b, c] of faces) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
    cache.clear();
  }
  const indices = new Uint32Array(faces.length * 3);
  for (let i = 0; i < faces.length; i++) {
    indices[i * 3] = faces[i][0];
    indices[i * 3 + 1] = faces[i][1];
    indices[i * 3 + 2] = faces[i][2];
  }
  return { positions: new Float32Array(v), indices };
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

// Closest point on a range's polyline. Writes hit = [chord², 0, 0, cx, cy, cz]
// (closest point) and returns it — one scan feeds distance, summit phase and
// the race trail attribute.
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

/* ------------------------------------------------------------ readWeek ----- */

const tang = new THREE.Vector3(); // scratch for readWeek's route layout

/**
 * Read a training week into a planet. Pure + deterministic (all randomness comes
 * from a PRNG seeded by the week string).
 * @returns the `features` object consumed by everything else (see report).
 */
export function readWeek(seed) {
  const week = String((seed && seed.week) || '2025-04-28');
  const nz = noise3(hashStr(week + '/terrain'));
  const acts = (seed && seed.activities) || [];
  const weekStart = Date.parse(week + 'T00:00:00Z');

  // --- place every activity on a day (longitude) and an order (latitude)
  const byDay = Array.from({ length: 7 }, () => []);
  for (const a of acts) {
    const d = Math.floor((Date.parse(a.startedAt) - weekStart) / 86400000);
    byDay[clamp(d, 0, 6)].push(a);
  }
  const placed = [];
  byDay.forEach((list, day) => list.forEach((a, i) => {
    const lat = list.length > 1 ? ((i / (list.length - 1)) * 2 - 1) * 12 * RAD : 0;
    placed.push({ a, day, dir: dirLL(lat, day * DAY_LON) });
  }));

  // --- climate, intensity, energy
  let tempSum = 0, tempW = 0;
  for (const { a } of placed) {
    if (a.minTempC == null || a.maxTempC == null) continue;
    const w = (a.activeS || 0) + 1;
    tempSum += ((a.minTempC + a.maxTempC) / 2) * w;
    tempW += w;
  }
  const warmth = clamp(tempW ? tempSum / tempW / 30 : 0.5, 0, 1);

  let hard = 0, all = 0;
  for (const { a } of placed) {
    for (const z of a.hrZoneSeconds || []) all += z || 0;
    hard += (a.hrZoneSeconds?.[3] || 0) + (a.hrZoneSeconds?.[4] || 0);
  }
  const roughness = clamp(all ? hard / all : 0.4, 0, 1);

  const totals = (seed && seed.totals) || {};
  const energy = clamp((totals.trainingLoad || 0) / 1000, 0, 1.5);

  const baseAmp = 1.5 + 2.5 * roughness; // base terrain noise, units
  const NF = 1.6; // base fBm frequency

  // --- ranges: one per GPS activity
  const ranges = [];
  const list = [];
  const raceTitle = (seed && seed.race) || '';
  let finishTangent = null;

  for (const { a, day, dir } of placed) {
    const mi = a.distanceM ? a.distanceM / MI : 0;
    const isRace = !!raceTitle && a.title === raceTitle;
    const dayName = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][day];
    const mins = a.activeS ? Math.round(a.activeS / 60) : 0;

    if (a.hasGps && a.routeShape && a.routeShape.length > 1) {
      const span = Math.min(mi * U_PER_MI, TAU * R * 0.55);
      const up = new THREE.Vector3(0, 1, 0);
      const east = new THREE.Vector3().crossVectors(dir, up).normalize();
      const north = new THREE.Vector3().crossVectors(east, dir).normalize();
      const shape = a.routeShape;
      const seg = new Float64Array(shape.length * 3);
      const cum = new Float64Array(shape.length); // arc length along the route, world units
      let reach = 0;
      for (let i = 0; i < shape.length; i++) {
        onSphere(dir, east, north, (shape[i][0] - 0.5) * span, (shape[i][1] - 0.5) * span, tang);
        seg[i * 3] = tang.x; seg[i * 3 + 1] = tang.y; seg[i * 3 + 2] = tang.z;
        if (i > 0) {
          const chord = Math.hypot(seg[i * 3] - seg[i * 3 - 3], seg[i * 3 + 1] - seg[i * 3 - 2], seg[i * 3 + 2] - seg[i * 3 - 1]);
          cum[i] = cum[i - 1] + 2 * R * Math.asin(Math.min(1, chord / 2));
        }
        const rd = Math.hypot(tang.x - dir.x, tang.y - dir.y, tang.z - dir.z);
        if (rd > reach) reach = rd;
      }
      const amp = 0.4 * Math.pow(Math.max(a.ascentM || 0, 12), 0.68); // 54 m → 6 u, 346 m → 21.5 u
      const width = clamp(span * 0.1, 6, 22);
      const detAmp = amp * 0.18;
      // the cap test runs in unit-sphere space and has to cover the polyline's own
      // reach plus the foothills (3w) and the warp
      const cap = Math.min(reach + (3.4 * width + 2) / R, 1.98);
      ranges.push({ seg, cum, total: cum[cum.length - 1], amp, width, detAmp, span, dir: dir.clone(), capSq: cap * cap, race: isRace });

      if (isRace) {
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
        const finish = new THREE.Vector3(seg[(shape.length - 1) * 3], seg[(shape.length - 1) * 3 + 1], seg[(shape.length - 1) * 3 + 2]);
        finishTangent = finish.clone().sub(spawn); // the runner looks back up the course at the monument
        const t2 = (a.activeS / 3600);
        const monument = {
          id: MONUMENT_ID,
          kind: 'monument',
          label: `${raceTitle || a.title} · finish`,
          detail: `${dayName} · ${mi.toFixed(1)} mi · ${Math.floor(t2)}h ${String(Math.round((t2 % 1) * 60)).padStart(2, '0')}m · ${a.avgHeartRate} bpm avg · ${Math.round(a.ascentM || 0)} m climb`,
          dir: finish,
          spawn,
          stats: a,
          anchor: 'finish',
        };
        list.push(monument);
      }
      list.push({
        id: slug(`${dayName}-${a.title}`, list),
        kind: 'range',
        label: a.title,
        detail: `${dayName} · ${mi.toFixed(1)} mi · ${mins} min · ${Math.round(a.ascentM || 0)} m climb`,
        dir: dir.clone(),
        stats: a,
        span,
        width,
        amp,
      });
    } else {
      // --- artifacts: non-GPS sessions
      const title = String(a.title || '').toLowerCase();
      const sport = String(a.sport || '').toLowerCase();
      const kind = /yoga|mobility|stretch/.test(title) || sport === 'training' ? 'calm'
        : sport === 'strength' ? 'spires'
          : /cycl|bik/.test(sport) ? 'wheel'
            : /swim/.test(sport) ? 'lagoon'
              : 'constructed';
      const detail = kind === 'calm'
        ? `${dayName} · ${mins} min · ${a.title}`
        : `${dayName} · ${mi.toFixed(1)} mi · ${mins} min · ${title.includes('treadmill') ? 'treadmill' : sport}`;
      list.push({
        id: slug(`${dayName}-${a.title}`, list),
        kind,
        label: a.title,
        detail,
        dir: dir.clone(),
        stats: a,
      });
    }
  }

  // --- sea level: submerged fraction from the week's sweat
  const submerged = clamp((totals.sweatMl || 0) / 1000 / 12, 0.15, 0.6);
  const NS = 2400;
  const samples = new Float64Array(NS);
  const probe = new THREE.Vector3();
  const out = { h: 0, range: 0, race: 0 };
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < NS; i++) {
    const y = 1 - (i / (NS - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = ga * i;
    samples[i] = sample(probe.set(Math.cos(th) * r, y, Math.sin(th) * r), out).h;
  }
  const sorted = Float64Array.from(samples).sort();
  const seaLevel = sorted[clamp(Math.floor((1 - submerged) * NS), 0, NS - 1)];

  const rangesByRace = ranges.find((r) => r.race) || null;

  function sample(dir, o = out) {
    let x = dir.x, y = dir.y, z = dir.z;
    const l2 = x * x + y * y + z * z;
    if (Math.abs(l2 - 1) > 1e-6) {
      const s = 1 / Math.sqrt(l2);
      x *= s; y *= s; z *= s;
    }
    // continental plates under everything, then the week's own base roughness
    let h = CONT_AMP * (fbm(nz, x * CONT_F, y * CONT_F, z * CONT_F, 2) * 2 - 1)
      + baseAmp * (fbm(nz, x * NF, y * NF, z * NF) * 2 - 1);
    let prox = 0, raceD = 999;
    for (let i = 0; i < ranges.length; i++) {
      const r = ranges[i];
      const dx = x - r.dir.x, dy = y - r.dir.y, dz = z - r.dir.z;
      if (dx * dx + dy * dy + dz * dz > r.capSq) continue;
      const hit = segInfo(r, x, y, z);
      const d = 2 * R * Math.asin(Math.min(1, Math.sqrt(hit[0]) / 2)); // arc distance, world units
      if (r.race && d < raceD) raceD = d;
      const w = r.width;
      // meander the flanks — but never the crest, so the race trail stays on it
      const fade = d < w * 0.5 ? d / (w * 0.5) : 1;
      const dw = d + WARP * w * fade * (nz(x * WARP_F, y * WARP_F, z * WARP_F) * 2 - 1);
      const t1 = 1 - dw / w; // sharp crest profile
      const tf = 1 - dw / (3 * w); // foothills, ~3x wider
      if (t1 <= 0 && tf <= 0) continue;
      // height along the chain: summits and saddles, then a few dominant peaks.
      // The ridged field is re-normalised to its full 0..1 swing, otherwise its
      // octave sum clusters near 0.5 and the chain reads as a constant crest.
      const cx = hit[3], cy = hit[4], cz = hit[5];
      const rn = clamp((ridged(nz, cx * ALONG_F, cy * ALONG_F, cz * ALONG_F) - 0.3) / 0.45, 0, 1);
      const env = clamp((nz(cx * ENV_F, cy * ENV_F, cz * ENV_F) - 0.35) / 0.4, 0, 1);
      const along = (0.45 + 0.55 * rn) * (0.68 + 0.32 * env);
      let rh = 0, crest = 0;
      if (t1 > 0) {
        crest = Math.pow(t1, 1.6);
        rh += r.amp * along * crest;
      }
      if (tf > 0) {
        const f = tf * tf * (3 - 2 * tf);
        // foothills are the skirt the crest leaves behind, so they never flatten it
        rh += 0.25 * r.amp * along * Math.max(0, f - crest);
        if (f > prox) prox = f;
      }
      // erosion: spurs down the flanks, plus a small slope-dependent roughness
      const slope = Math.min(1, (r.amp * 1.4 * (t1 > 0 ? Math.pow(t1, 0.6) : 0)) / w);
      if (crest > 0 || slope > 0) {
        const det = ridged(nz, x * DET_F, y * DET_F, z * DET_F) * 2 - 1;
        rh += det * (r.amp * 0.18 * 4 * crest * (1 - crest) * (0.35 + 0.65 * slope) + 0.5 * slope * Math.min(1, r.amp / 12));
      }
      h += rh;
    }
    o.h = h;
    o.range = prox;
    o.race = raceD > 60 ? 60 : raceD;
    return o;
  }

  const byId = {};
  for (const f of list) byId[f.id] = f;
  const monument = byId[MONUMENT_ID] || null;
  // The runner lands SPAWN_BACK metres short of the finish, looking at the monument.
  let spawnTangent = finishTangent;
  if (monument && monument.spawn) {
    const t = (finishTangent || new THREE.Vector3()).clone();
    t.addScaledVector(monument.spawn, -t.dot(monument.spawn)).normalize();
    spawnTangent = t.lengthSq() > 1e-6 ? t : null;
  }

  return {
    seed, week, radius: R, dayLon: DAY_LON,
    seaLevel, warmth, roughness, energy, baseAmp,
    list, byId, ranges, race: rangesByRace, monument,
    dirLL, onSphere,
    spawn: monument && monument.spawn ? monument.spawn.clone() : (monument ? monument.dir.clone() : dirLL(0, 0)),
    spawnTangent,
    heightAt: (dir) => sample(dir).h,
    sample,
    /** distance to the race trail, clamped 0..60 (same value as the aRace attribute) */
    raceDistance: (dir) => sample(dir).race,
    /** deterministic PRNG for styles: makeRng('rocks')() → 0..1 */
    makeRng: (salt = '') => mulberry32(hashStr(week + '/' + salt)),
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
 * Displaced planet mesh with the style attributes.
 * @returns THREE.BufferGeometry with aHeight, aSlope, aRace, aRange, aSea.
 */
export function buildPlanetGeometry(features, opts = {}) {
  const { positions, indices } = icosphere(opts.detail ?? DETAIL);
  const n = positions.length / 3;
  const dirs = new Float32Array(positions); // unit directions, kept for the normals pass
  const aHeight = new Float32Array(n);
  const aSlope = new Float32Array(n);
  const aRace = new Float32Array(n);
  const aRange = new Float32Array(n);
  const aSea = new Float32Array(n);
  const d = new THREE.Vector3();
  const out = { h: 0, range: 0, race: 0 };
  for (let i = 0; i < n; i++) {
    const j = i * 3;
    d.set(dirs[j], dirs[j + 1], dirs[j + 2]);
    features.sample(d, out);
    aHeight[i] = out.h;
    aRange[i] = out.range;
    aRace[i] = out.race;
    aSea[i] = out.h - features.seaLevel;
    const r = R + out.h;
    positions[j] = d.x * r;
    positions[j + 1] = d.y * r;
    positions[j + 2] = d.z * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  // Already per-vertex averaged, and within 1.4° of the field's own gradient at
  // this mesh's 1 u scale (measured) — a ring refit came out no better, so the
  // globe keeps it and only the patch's rebuild uses fitNormals (which chunks).
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal.array;
  for (let i = 0; i < n; i++) {
    const j = i * 3;
    const dot = nrm[j] * dirs[j] + nrm[j + 1] * dirs[j + 1] + nrm[j + 2] * dirs[j + 2];
    aSlope[i] = 1 - clamp(dot, 0, 1); // 0 flat … 1 cliff
  }
  geo.setAttribute('aHeight', new THREE.BufferAttribute(aHeight, 1));
  geo.setAttribute('aSlope', new THREE.BufferAttribute(aSlope, 1));
  geo.setAttribute('aRace', new THREE.BufferAttribute(aRace, 1));
  geo.setAttribute('aRange', new THREE.BufferAttribute(aRange, 1));
  geo.setAttribute('aSea', new THREE.BufferAttribute(aSea, 1));
  geo.userData.seaLevel = features.seaLevel;
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
  const q = new THREE.Vector3();
  const out = { h: 0, range: 0, race: 0 };
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
      const east = new THREE.Vector3().crossVectors(ref, dir).normalize();
      build = {
        centre: dir.clone(),
        east,
        north: new THREE.Vector3().crossVectors(dir, east).normalize(),
        slot: 1 - live.slot,
        i: 0,
        stage: 0,
      };
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
  obj.traverse((k) => {
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

// The chase camera that `targetState` builds — CHASE_PITCH up, looking at head
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
 * there is no such view from here.
 */
function framedDist(features, f, spot, shot, yaw) {
  const sphere = shot.sphere;
  standPivot.copy(spot).multiplyScalar(R + features.heightAt(spot));
  standFacing.copy(f.dir).addScaledVector(spot, -f.dir.dot(spot)).normalize();
  // dead astern is −facing; `yaw` turns it about the local up, as chase.yaw does
  standLat.copy(standFacing).multiplyScalar(-Math.cos(yaw)).addScaledVector(standAxis.copy(spot).cross(standFacing), -Math.sin(yaw));
  standDir.copy(spot).multiplyScalar(Math.sin(CHASE_PITCH)).addScaledVector(standLat, Math.cos(CHASE_PITCH)).normalize();
  standLook.copy(standPivot).addScaledVector(spot, CHASE_LOOK);
  for (let d = CHASE_DIST; d <= FRAME_MAX + 1e-6; d += 0.25) {
    standC.copy(sphere.center).addScaledVector(standDir, -d).sub(standPivot); // camera → the object
    const dist = standC.length();
    if (dist <= sphere.radius) continue;
    standV.copy(standLook).addScaledVector(standDir, -d).sub(standPivot).normalize(); // camera → what it looks at
    const off = Math.acos(clamp(standC.dot(standV) / dist, -1, 1)) + Math.asin(Math.min(1, sphere.radius / dist));
    if (off > shot.halfAngle) continue;
    return shot.room(standPivot, standDir, d) >= d - 0.05 ? d : 0;
  }
  return 0;
}

/**
 * Where `?at=<featureId>` drops the runner, and which way they face.
 *
 * A landmark is something to stand in front of, not inside: the runner lands
 * STAND_RADII radii + STAND_CLEAR units out from the landmark's own bounding
 * sphere (SPOT_BACK where the style built no object) on the sunlit side, walking
 * round the compass past water and past any bearing the chase camera cannot back
 * away from far enough to frame it — facing it, with both in view. A range has no
 * object to stand beside, so the runner lands on its highest crest, facing along
 * the crest.
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
  if (f.spawn) return { dir: f.spawn.clone(), facing: (features.spawnTangent || new THREE.Vector3(0, 0, 1)).clone() };
  const ref = Math.abs(f.dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : up;
  const east = new THREE.Vector3().crossVectors(ref, f.dir).normalize();
  const north = new THREE.Vector3().crossVectors(f.dir, east).normalize();
  if (f.kind === 'range') {
    const r = features.ranges.find((rr) => rr.dir.distanceToSquared(f.dir) < 1e-12);
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
      if (facing.lengthSq() > 1e-9) return { dir, facing: facing.normalize() };
    }
  }
  const s = new THREE.Vector3().copy(sun).addScaledVector(f.dir, -sun.dot(f.dir));
  const bearing = s.lengthSq() > 1e-6 ? Math.atan2(s.dot(north), s.dot(east)) : 0;
  const stand = shot ? STAND_RADII * shot.sphere.radius + STAND_CLEAR : SPOT_BACK;
  // …and measured from the object's own centre, not the feature's ground point: a
  // painted cast shadow runs a long way off it, and it is the object we are framing.
  const hub = shot ? shot.sphere.center.clone().normalize() : f.dir;
  const to = new THREE.Vector3();
  let dir = null, camDist = 0, camYaw = 0, dry = null;
  for (let i = 0; i < 24 && !dir; i++) {
    const a = bearing + (i === 0 ? 0 : (i % 2 ? -1 : 1) * Math.ceil(i / 2) * (Math.PI / 12));
    features.onSphere(hub, east, north, Math.cos(a) * stand, Math.sin(a) * stand, to);
    to.normalize();
    if (features.heightAt(to) <= features.seaLevel - KNEE_DEPTH) continue;
    if (!dry) dry = to.clone();
    if (shot) {
      camDist = framedDist(features, f, to, shot, 0);
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
  if (!dir) {
    // nowhere here frames the object: fall back to the sunlit side, as before
    dir = dry || features.onSphere(hub, east, north, stand, 0).normalize();
    camDist = 0;
    camYaw = 0;
  }
  return { dir, facing: f.dir.clone().addScaledVector(dir, -f.dir.dot(dir)).normalize(), camDist, camYaw };
}

const CSS = `
.pc-hud{position:fixed;left:16px;bottom:16px;display:flex;gap:8px;z-index:9;font-family:var(--fg-font,ui-monospace,Menlo,monospace)}
.pc-hud button{appearance:none;border:1px solid color-mix(in srgb,var(--fg-accent,#9fd2ff) 45%,transparent);background:var(--fg-bg,rgba(12,14,18,.82));color:var(--fg-ink,#eef1f4);font:inherit;font-size:12px;letter-spacing:.04em;padding:7px 12px;border-radius:999px;cursor:pointer}
.pc-hud button:hover{border-color:var(--fg-accent,#9fd2ff);color:var(--fg-accent,#9fd2ff)}
.pc-guide{position:fixed;left:16px;top:16px;width:min(330px,72vw);max-height:min(70vh,560px);overflow:auto;z-index:9;background:var(--fg-bg,rgba(12,14,18,.82));color:var(--fg-ink,#eef1f4);font-family:var(--fg-font,ui-monospace,Menlo,monospace);font-size:12px;line-height:1.45;border:1px solid color-mix(in srgb,var(--fg-accent,#9fd2ff) 28%,transparent);border-radius:10px;padding:12px 14px;backdrop-filter:blur(6px)}
.pc-guide[hidden]{display:none}
.pc-guide h2{margin:0 0 8px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--fg-accent,#9fd2ff);font-weight:600}
.pc-guide ul{margin:0;padding:0;list-style:none}
.pc-guide li{padding:6px 0;border-top:1px solid color-mix(in srgb,var(--fg-ink,#eef1f4) 10%,transparent);cursor:pointer}
.pc-guide li:hover .pc-label,.pc-guide li[data-active] .pc-label{color:var(--fg-accent,#9fd2ff)}
.pc-label{display:block;font-weight:600}
.pc-detail{display:block;opacity:.62}
.pc-near{position:fixed;transform:translate(-50%,-50%);pointer-events:none;z-index:8;font-family:var(--fg-font,ui-monospace,Menlo,monospace);font-size:11px;letter-spacing:.03em;color:var(--fg-ink,#eef1f4);background:var(--fg-bg,rgba(12,14,18,.72));border:1px solid color-mix(in srgb,var(--fg-accent,#9fd2ff) 30%,transparent);padding:3px 8px;border-radius:999px;opacity:0;transition:opacity .45s ease}
.pc-near.on{opacity:1}
.pc-arrow{position:fixed;left:50%;top:64px;width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:14px solid var(--fg-accent,#9fd2ff);transform-origin:50% 90%;pointer-events:none;z-index:8;opacity:0;transition:opacity .3s ease}
.pc-arrow.on{opacity:.85}
.pc-arrow b{position:absolute;left:-42px;top:20px;width:84px;text-align:center;font-family:var(--fg-font,ui-monospace,Menlo,monospace);font-size:11px;font-weight:400;color:var(--fg-ink,#eef1f4)}
`;

const NEUTRAL = {
  name: 'neutral',
  palette: { sky: 0x0b1017, land: 0x6f7a5e, sea: 0x2a5c8a, body: 0xdcdfe4, accent: 0x6e7a8c },
  setupScene({ THREE: T, scene }) {
    scene.background = new T.Color(0x8fb6d6);
    const sun = new T.DirectionalLight(0xfff2df, 2.4);
    sun.position.set(0.55, 0.72, 0.42).normalize();
    scene.add(sun, new T.HemisphereLight(0xdff0ff, 0x3a4436, 1.6));
  },
  planetMaterial: ({ THREE: T }) => new T.MeshLambertMaterial({ color: 0x6f7a5e }),
  oceanMaterial: ({ THREE: T }) => new T.MeshLambertMaterial({ color: 0x2a5c8a }),
  featureObject({ THREE: T, feature }) {
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
    } else {
      const deck = new T.Mesh(new T.BoxGeometry(1.5, 0.22, 2.6), dark);
      deck.position.y = 0.35;
      const post = new T.Mesh(new T.BoxGeometry(1.1, 1.3, 0.16), grey);
      post.position.set(0, 1.05, 1.2);
      g.add(deck, post);
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
export function createApp(opts = {}) {
  const style = opts.style || {};
  const hook = (k) => (typeof style[k] === 'function' ? style[k].bind(style) : NEUTRAL[k]);
  const features = readWeek(opts.seed || window.SEED);
  const host = opts.container || document.body;
  const params = new URLSearchParams(location.search);
  const fixedT = params.has('t') ? Number(params.get('t')) || 0 : null;

  const uniforms = {
    uTime: { value: fixedT || 0 },
    uSunDir: { value: new THREE.Vector3(0.55, 0.72, 0.42).normalize() },
    uWarmth: { value: features.warmth },
    uEnergy: { value: features.energy },
    uSeaLevel: { value: features.seaLevel },
    uRadius: { value: R },
  };

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
  const CENTER = new THREE.Vector3();

  hook('setupScene')({ THREE, scene, renderer, features, uniforms });

  const planetMaterial = hook('planetMaterial')({ THREE, features, uniforms });
  const planet = new THREE.Mesh(buildPlanetGeometry(features), planetMaterial);
  planet.name = 'planet';
  scene.add(planet);

  // The fine ground under the viewer, and the globe's promise to stay out of it.
  const patch = createPatch(features, planetMaterial);
  scene.add(patch.mesh);
  const mask = maskGlobe(planetMaterial, patch.mask);
  const oceanMat = hook('oceanMaterial')({ THREE, features, uniforms });
  const ocean = oceanMat ? new THREE.Mesh(buildOceanGeometry(features), oceanMat) : null;
  if (ocean) scene.add(ocean);

  const featureObjects = new Map();
  const up = new THREE.Vector3(0, 1, 0);
  for (const f of features.list) {
    const obj = hook('featureObject')({ THREE, feature: f, features, uniforms });
    if (!obj) continue;
    const h = features.heightAt(f.dir);
    obj.position.copy(f.dir).multiplyScalar(R + h);
    obj.quaternion.setFromUnitVectors(up, f.dir);
    obj.userData.feature = f;
    scene.add(obj);
    featureObjects.set(f.id, obj);
  }

  const runner = createRunner(hook('runnerMaterials')({ THREE, uniforms }));
  scene.add(runner.object3D);
  const post = hook('postprocess')({ THREE, renderer, scene, camera, features });

  // Feature bounding spheres: the chase camera must never sit inside one, and the
  // runner→camera ray must never pass through one.
  const featureSpheres = [];
  const featureSphereOf = new Map();
  for (const [id, obj] of featureObjects) {
    const sphere = boundingSphere(obj, new THREE.Sphere());
    if (sphere.radius > 0.05) featureSpheres.push(sphere);
    featureSphereOf.set(id, sphere);
  }

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
  hud.append(btnLand, btnOrbit, btnGuide);
  const guide = q('pc-guide');
  guide.hidden = true;
  const guideList = q('', null, 'ul');
  guide.append(q('', 'Field guide', 'h2'), guideList);
  const labelLayer = q('', null);
  const arrow = q('pc-arrow');
  const arrowDist = document.createElement('b');
  arrow.append(arrowDist);
  host.append(hud, guide, labelLayer, arrow);

  const items = new Map();
  const labels = new Map();
  for (const f of features.list) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="pc-label"></span><span class="pc-detail"></span>`;
    li.querySelector('.pc-label').textContent = f.label;
    li.querySelector('.pc-detail').textContent = f.detail;
    li.addEventListener('click', () => focus(f));
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
  // `?at=` uses it too, to reject a landing spot the camera cannot back away from.
  const probe = new THREE.Vector3();
  const samplePoint = new THREE.Vector3();
  function clearCam(pivot, dir, dist) {
    let d = Math.max(dist, CAM_MIN);
    for (let pass = 0; pass < 12; pass++) {
      probe.copy(pivot).addScaledVector(dir, d);
      let hit = false;
      for (let i = 1; i <= 8; i++) {
        const f = i / 8;
        samplePoint.lerpVectors(pivot, probe, f);
        const len = samplePoint.length();
        const floor = R + Math.max(features.heightAt(samplePoint), features.seaLevel) + 0.45 * f;
        if (len < floor) { hit = true; break; }
      }
      if (!hit) return d;
      d *= 0.86;
      if (d <= CAM_MIN) return CAM_MIN;
    }
    return d;
  }

  /* -------------------------------------------------------------- state --- */
  const orbit = { yaw: 1.15, pitch: 0.3, dist: 0, base: 0, drag: false };
  const chase = { yaw: 0, pitch: CHASE_PITCH, dist: CHASE_DIST, drag: false };
  const atFeature = params.has('at') ? features.byId[String(params.get('at'))] : null;
  // The frame a landmark has to fit inside: the tighter of the two half-angles
  // the chase camera will have once it has been sized to the viewport.
  const halfV = (camera.fov * RAD) / 2;
  const viewAspect = (host.clientWidth || window.innerWidth) / Math.max(1, host.clientHeight || window.innerHeight);
  const shotSphere = atFeature ? featureSphereOf.get(atFeature.id) : null;
  const start = atFeature ? featureStart(features, atFeature, uniforms.uSunDir.value, shotSphere && {
    sphere: shotSphere,
    halfAngle: Math.min(halfV, Math.atan(viewAspect * Math.tan(halfV))) / FRAME_MARGIN,
    room: clearCam,
  }) : null;
  const landedYaw = (start && start.camYaw) || 0; // the landing's own camera swing
  if (start && start.camDist > chase.dist) chase.dist = start.camDist; // one landmark needs a wider shot
  const run = {
    dir: (start ? start.dir : features.spawn).clone(),
    facing: (start ? start.facing : features.spawnTangent || new THREE.Vector3(0, 0, 1)).clone(),
    speed: 0, air: 0, vAir: 0,
  };
  run.facing.addScaledVector(run.dir, -run.facing.dot(run.dir));
  if (run.facing.lengthSq() < 1e-6) run.facing.set(0, 0, 1).cross(run.dir).normalize();
  run.facing.normalize();

  const state = { mode: 'orbit', t: 0, frames: 0, transition: null, focus: null, target: null, landed: params.has('at') };
  const keys = new Set();

  function focus(f) {
    state.target = f;
    for (const [id, li] of items) li.toggleAttribute('data-active', id === f.id);
    if (state.mode === 'orbit') state.focus = { dir: f.dir.clone(), k: 0 };
  }

  function targetState(mode) {
    if (mode === 'orbit') {
      const d = new THREE.Vector3(Math.cos(orbit.pitch) * Math.cos(orbit.yaw), Math.sin(orbit.pitch), Math.cos(orbit.pitch) * Math.sin(orbit.yaw));
      return { pos: orbitCamPos(d, orbit.dist), look: CENTER.clone(), up: up.clone() };
    }
    const u = run.dir;
    const d = chaseDirection().normalize();
    return { pos: chasePos(d), look: groundPos(run.dir).addScaledVector(u, CHASE_LOOK), up: u.clone() };
  }

  // tangent-plane frame at the runner: e = "east", n = "north"
  function tangentFrame() {
    const u = run.dir;
    const ref = Math.abs(u.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : up;
    const e = new THREE.Vector3().crossVectors(ref, u).normalize();
    return { e, n: new THREE.Vector3().crossVectors(u, e).normalize() };
  }

  function chaseDirection(out = new THREE.Vector3()) {
    const u = run.dir, { e, n } = tangentFrame();
    return out.addScaledVector(u, Math.sin(chase.pitch)).addScaledVector(e, Math.cos(chase.pitch) * Math.cos(chase.yaw)).addScaledVector(n, Math.cos(chase.pitch) * Math.sin(chase.yaw));
  }

  const sphereRay = new THREE.Vector3();
  function chasePos(dir) {
    const pivot = groundPos(run.dir);
    let dist = clearCam(pivot, dir, chase.dist);
    for (let i = 0; i < featureSpheres.length; i++) {
      const s = featureSpheres[i];
      sphereRay.copy(s.center).sub(pivot);
      const b = sphereRay.dot(dir);
      if (b <= 0) continue; // feature is behind the camera
      const c = sphereRay.lengthSq() - s.radius * s.radius;
      if (c <= 0) continue; // runner is inside the sphere: no usable clamp
      const disc = b * b - c;
      if (disc <= 0) continue; // ray misses
      const enter = b - Math.sqrt(disc); // where the ray first enters the sphere
      if (enter > 0.8 && enter - 0.4 < dist) dist = enter - 0.4;
    }
    return pivot.addScaledVector(dir, Math.max(dist, 0.8));
  }

  // chase camera azimuth that sits behind the runner's facing, less the swing a
  // landmark landing needs to keep itself out from behind the runner
  function faceCamera() {
    const { e, n } = tangentFrame();
    const back = run.facing.clone().negate();
    chase.yaw = Math.atan2(back.dot(n), back.dot(e)) + landedYaw;
  }

  function requestMode(mode) {
    if (mode === state.mode && !state.transition) return;
    if (mode === 'surface' && !state.landed) {
      const m = features.monument;
      if (m) run.dir.copy(m.spawn || m.dir);
      if (features.spawnTangent) {
        run.facing.copy(features.spawnTangent).addScaledVector(run.dir, -features.spawnTangent.dot(run.dir)).normalize();
      }
      state.landed = true;
    }
    faceCamera();
    state.transition = { to: mode, k: 0, fromPos: camera.position.clone(), fromLook: lookAt.clone(), fromUp: camera.up.clone(), dur: TRANSITION };
  }

  const groundPos = (dir, out = new THREE.Vector3()) => out.copy(dir).multiplyScalar(R + features.heightAt(dir));
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
  let pointer = null;
  el.addEventListener('pointerdown', (e) => {
    pointer = { x: e.clientX, y: e.clientY };
    (state.mode === 'orbit' ? orbit : chase).drag = true;
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (!pointer) return;
    const dx = (e.clientX - pointer.x) * 0.006, dy = (e.clientY - pointer.y) * 0.006;
    pointer = { x: e.clientX, y: e.clientY };
    if (state.mode === 'orbit') {
      orbit.yaw -= dx;
      orbit.pitch = clamp(orbit.pitch + dy, -1.35, 1.35);
      state.focus = null;
    } else {
      chase.yaw -= dx;
      chase.pitch = clamp(chase.pitch + dy, -0.25, 1.15);
    }
  });
  const endPointer = (e) => {
    pointer = null;
    orbit.drag = chase.drag = false;
    if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
  };
  el.addEventListener('pointerup', endPointer);
  el.addEventListener('pointercancel', endPointer);
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (state.mode === 'orbit') {
      orbit.dist = clamp(orbit.dist * (1 + Math.sign(e.deltaY) * 0.08), orbit.base * 0.62, orbit.base * 1.65);
    } else {
      chase.dist = clamp(chase.dist + Math.sign(e.deltaY) * 0.7, 4, 18);
    }
  }, { passive: false });
  window.addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (e.code === 'KeyG') guide.hidden = !guide.hidden;
    if (e.code === 'Space') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  const onResize = () => {
    const w = host.clientWidth || window.innerWidth, h = host.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.display = 'block';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    orbit.base = R / Math.sin(ORBIT_FILL * (camera.fov * RAD) / 2); // planet ≈ 70% of viewport height
    orbit.dist = clamp(orbit.dist, orbit.base * 0.62, orbit.base * 1.65);
    post && post.setSize(w, h);
  };
  window.addEventListener('resize', onResize);
  onResize();
  orbit.dist = orbit.base;

  btnLand.addEventListener('click', () => requestMode('surface'));
  btnOrbit.addEventListener('click', () => requestMode('orbit'));
  btnGuide.addEventListener('click', () => { guide.hidden = !guide.hidden; });

  /* -------------------------------------------------------------- frame --- */
  const clock = new THREE.Clock();
  const camState = { dir: new THREE.Vector3() };
  const tmp = new THREE.Vector3();
  const tmpDir = new THREE.Vector3();
  const m4 = new THREE.Matrix4();

  function moveRunner(dt) {
    const fx = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const sx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const target = fx || sx ? (sprint ? SPRINT : WALK) : 0;
    run.speed += clamp(target - run.speed, -8 * dt, 8 * dt);

    if (fx || sx) {
      const u = run.dir;
      // camera-relative basis on the tangent plane
      const cf = camera.getWorldDirection(tmp).addScaledVector(u, -tmp.dot(u));
      if (cf.lengthSq() < 1e-6) cf.copy(run.facing);
      cf.normalize();
      const cr = new THREE.Vector3().crossVectors(u, cf);
      const wish = new THREE.Vector3().addScaledVector(cf, fx).addScaledVector(cr, sx).normalize();
      const step = dt * run.speed / R;
      const next = new THREE.Vector3().addScaledVector(u, Math.cos(step)).addScaledVector(wish, Math.sin(step));
      if (features.heightAt(next) > features.seaLevel - KNEE_DEPTH) {
        run.dir.copy(next);
        const t = 1 - Math.exp(-10 * dt);
        run.facing.lerp(wish, t).addScaledVector(run.dir, -run.facing.dot(run.dir));
        if (run.facing.lengthSq() < 1e-9) run.facing.copy(wish);
        run.facing.normalize();
      }
    }
    // jump / gravity toward the centre
    if (keys.has('Space') && run.air <= 0.001) { run.vAir = JUMP_V; run.air = 0.001; }
    if (run.air > 0) {
      run.vAir -= GRAVITY * dt;
      run.air += run.vAir * dt;
      if (run.air <= 0) { run.air = 0; run.vAir = 0; }
    }

    const u = run.dir;
    const pos = groundPos(u);
    runner.object3D.position.copy(pos).addScaledVector(u, run.air);
    const x = new THREE.Vector3().crossVectors(u, run.facing).normalize();
    const z = new THREE.Vector3().crossVectors(x, u).normalize();
    runner.object3D.quaternion.setFromRotationMatrix(m4.makeBasis(x, u, z));
    runner.update(dt, { speed: run.speed, grounded: run.air <= 0 });
  }

  const featurePos = new THREE.Vector3();
  const proj = new THREE.Vector3();
  function labelsAndArrow() {
    const camDir = camera.getWorldDirection(tmp).normalize();
    const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
    for (const f of features.list) {
      const lab = labels.get(f.id);
      if (state.mode !== 'surface') { lab.classList.remove('on'); continue; }
      const obj = featureObjects.get(f.id);
      if (obj) featurePos.copy(obj.position);
      else featurePos.copy(f.dir).multiplyScalar(R + features.heightAt(f.dir));
      const d = featurePos.distanceTo(runner.object3D.position);
      if (d > LABEL_RANGE) { lab.classList.remove('on'); continue; }
      proj.copy(featurePos).project(camera);
      lab.style.left = `${((proj.x * 0.5 + 0.5) * w).toFixed(1)}px`;
      lab.style.top = `${((-proj.y * 0.5 + 0.5) * h - 26).toFixed(1)}px`;
      lab.classList.add('on');
    }
    const t = state.target;
    if (state.mode !== 'surface' || !t) { arrow.classList.remove('on'); return; }
    const u = run.dir;
    const toF = t.dir.clone().multiplyScalar(R + features.heightAt(t.dir)).sub(runner.object3D.position);
    const dist = toF.length();
    const fwd = camDir.clone().addScaledVector(u, -camDir.dot(u)).normalize();
    const right = new THREE.Vector3().crossVectors(u, fwd);
    const bearing = Math.atan2(toF.dot(right), toF.dot(fwd));
    arrow.classList.toggle('on', dist > LABEL_RANGE);
    arrow.style.transform = `rotate(${(bearing * 180 / Math.PI).toFixed(1)}deg)`;
    arrowDist.textContent = `${Math.round(dist)} m`;
  }

  // The fine ground under the viewer: rebuild it when it drifts (spread over
  // frames), draw it on foot only, and hand the globe's shader the footprint to
  // keep out of. Above PATCH_ALT the globe is the ground — that is the whole of
  // the handover, and on foot the patch covers everything the camera can see.
  const patchDir = new THREE.Vector3();
  function groundPatch() {
    const wanted = state.mode === 'surface' || !!(state.transition && state.transition.to === 'surface');
    patch.update(run.dir, wanted);
    patch.step();
    const above = camera.position.length() - (R + features.heightAt(patchDir.copy(camera.position).normalize()));
    const on = wanted && patch.ready && above <= PATCH_ALT;
    patch.mesh.visible = on;
    patch.mask.on.value = on ? 1 : 0;
    if (on) {
      // gl_FragCoord → world needs the *current* camera, before the render
      camera.updateMatrixWorld();
      patch.mask.invVP.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).invert();
      renderer.getDrawingBufferSize(patch.mask.res.value);
    }
  }

  function frame() {
    requestAnimationFrame(frame);
    const dt = fixedT == null ? Math.min(clock.getDelta(), 0.05) : 0;
    state.t = fixedT == null ? state.t + dt : fixedT;
    uniforms.uTime.value = state.t;

    if (state.transition) {
      const tr = state.transition;
      tr.k = dt > 0 ? Math.min(1, tr.k + dt / tr.dur) : 1; // a fixed clock lands instantly
      const k = smoothstep(tr.k);
      const to = targetState(tr.to);
      // Spherical interpolation of the camera about the planet: the radius
      // descends monotonically and the direction swings, so the flight can
      // never cut through the surface.
      const rA = tr.fromPos.length() || 1, rB = to.pos.length() || 1;
      camState.dir.copy(tr.fromPos).divideScalar(rA).lerp(tmpDir.copy(to.pos).divideScalar(rB), k);
      if (camState.dir.lengthSq() < 1e-6) camState.dir.copy(tmpDir);
      camera.position.copy(keepOutside(camState.dir.normalize().multiplyScalar(lerp(rA, rB, k)), 0.5));
      lookAt.lerpVectors(tr.fromLook, to.look, k);
      camera.up.copy(tr.fromUp).lerp(to.up, k).normalize();
      camera.lookAt(lookAt);
      if (tr.k >= 1) { state.mode = tr.to; state.transition = null; }
    } else if (state.mode === 'orbit') {
      if (!orbit.drag) orbit.yaw += 0.035 * dt;
      if (state.focus) {
        state.focus.k = Math.min(1, state.focus.k + dt / 1.2);
        const k = smoothstep(state.focus.k);
        const want = state.focus.dir;
        orbit.yaw = lerpAngle(orbit.yaw, Math.atan2(want.z, want.x), k);
        orbit.pitch = lerp(orbit.pitch, Math.asin(clamp(want.y, -1, 1)) * 0.75 + 0.12, k);
        if (state.focus.k >= 1) state.focus = null;
      }
      const d = new THREE.Vector3(Math.cos(orbit.pitch) * Math.cos(orbit.yaw), Math.sin(orbit.pitch), Math.cos(orbit.pitch) * Math.sin(orbit.yaw));
      camera.position.copy(orbitCamPos(d, orbit.dist));
      camera.up.set(0, 1, 0);
      camera.lookAt(CENTER);
      runner.update(dt, { speed: 0, grounded: true });
      lookAt.copy(CENTER);
    } else {
      moveRunner(dt);
      const to = targetState('surface');
      const alpha = dt > 0 ? 1 - Math.exp(-9 * dt) : 1;
      camera.position.lerp(to.pos, alpha);
      lookAt.lerp(to.look, alpha);
      camera.up.copy(run.dir); // sphere gravity: the runner's up is the screen's up
      camera.lookAt(lookAt);
    }

    labelsAndArrow();
    groundPatch();
    hook('update')({ dt, time: state.t, camera, scene, renderer, mode: state.mode, runner: runner.object3D, runnerState: run, features, uniforms });
    if (post) post.render(dt);
    else renderer.render(scene, camera);

    state.frames++;
    if (state.frames === 30) {
      window.__ready = true;
      host.setAttribute('data-pc-ready', '');
    }
  }

  const api = {
    setMode: (m) => { requestMode(m === 'surface' ? 'surface' : 'orbit'); },
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
        ok('4 GPS ranges', kinds.range === 4, JSON.stringify(kinds));
        ok('1 monument', kinds.monument === 1);
        ok('1 constructed (treadmill)', kinds.constructed === 1);
        ok('1 calm (yoga)', kinds.calm === 1);
        ok('marathon range wraps', features.ranges.some((r) => r.span > TAU * R * 0.3));
        ok('sea level sane', features.seaLevel > -6 && features.seaLevel < 6, String(features.seaLevel));
        ok('warmth/roughness/energy in range', features.warmth >= 0 && features.warmth <= 1 && features.roughness >= 0 && features.roughness <= 1 && features.energy >= 0 && features.energy <= 1.5, `${features.warmth.toFixed(3)} ${features.roughness.toFixed(3)} ${features.energy.toFixed(3)}`);
        const geo = planet.geometry;
        ok('planet attributes', !!(geo.attributes.aHeight && geo.attributes.aSlope && geo.attributes.aRace && geo.attributes.aRange && geo.attributes.aSea), `${geo.attributes.position.count} verts`);
        ok('feature dirs on sphere', features.list.every((f) => Math.abs(f.dir.length() - 1) < 1e-6));
        ok('spawn faces the monument', !!features.monument && features.spawn.distanceTo(features.monument.spawn) < 1e-9);
        // landforms, not extruded tubes: the crest varies along the course
        const race = features.race;
        if (race) {
          const n = race.seg.length / 3;
          let hi = -99, lo = 99, hsum = 0;
          for (let i = 0; i < 40; i++) {
            const k = Math.floor((i / 39) * (n - 1)) * 3;
            const h = features.heightAt(new THREE.Vector3(race.seg[k], race.seg[k + 1], race.seg[k + 2]));
            hi = Math.max(hi, h); lo = Math.min(lo, h); hsum += h;
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
          ok('continents and basins exist', deep / N > 0.15 && high / N > 0.2, `deep ${(deep / N).toFixed(2)} land ${(high / N).toFixed(2)}`);
        }
        // planted feet: min sole height in the root frame while grounded
        const feet = runner.debug.feetY();
        ok('feet at ground while idle', run.air === 0 && Math.abs(Math.min(...feet)) < 0.02 && Math.abs(Math.max(...feet)) < 0.02, feet.map((v) => v.toFixed(4)).join(' '));
        ok('root sits on terrain', Math.abs(runner.object3D.position.length() - (R + features.heightAt(run.dir))) < 1e-9);
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
        return c;
      },
    },
  };
  window.__app = api;

  const want = params.get('view');
  if (want === 'surface') {
    requestMode('surface');
    state.transition = null;
    state.mode = 'surface';
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
  if (fixedT != null && params.get('view') !== 'surface') {
    camera.position.copy(orbitCamPos(new THREE.Vector3(Math.cos(orbit.pitch) * Math.cos(orbit.yaw), Math.sin(orbit.pitch), Math.cos(orbit.pitch) * Math.sin(orbit.yaw)), orbit.dist));
    camera.lookAt(CENTER);
  }
  frame();
  return api;
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * t;
}

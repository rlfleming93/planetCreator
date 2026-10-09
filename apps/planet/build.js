/* Planet Creator — the build (base.js api.build): the week as it stood at the end of each day. Monday morning is the
 * week's bare ground under the sea a week of no sweat leaves; then each session comes in as it was done: a run's ridge
 * rises along its route and its climb lifts the mountain, a ride carves its valley, a swim digs its lagoon, a landmark
 * stands up out of the ground, the sea rises with the sweat, the week's life comes in as it trains, and the body and
 * the race's ring arrive when the week earns them.
 *
 * Every landform the week lays has a bit (readWeek: a route's or lagoon's .order, sample's o.lf). prepare() reads the
 * ground before each one, once, for every globe vertex, survey texel and landmark it shaped, and a session's share k
 * (0 not yet, 1 done) raises it as the sum of those steps, exact at the end of each session. Only what changes is
 * written, on the frames it changes; when the build ends every buffer and object it touched is put back as it was
 * built, so the planet after a build is the planet without one, to the bit. Deterministic: k is a function of the
 * position given (at) or of the app's own clock (to, show, end), never of the wall.
 *
 *   const build = createBuild(ctx)    ctx: { features, seed, planet, ocean, scene, objects, material, cap, R }
 *   await build.prepare()             the ground before each landform (paced, once)
 *   build.at(p, { face, look })       at once: p 0 is Monday morning, 7 the whole week; day d comes in over [d, d + 1];
 *                                     face (0..1) turns the orbit to the day at p, or at look when given
 *   build.to(p, { duration, face })   there on the app's clock, a day's sessions one after another → Promise
 *   build.show(ids, { duration })     those sessions (features.list ids) in, whatever the position → Promise
 *   build.end({ duration })           the whole week, then the build lets go → Promise
 *   build.tick(t)                     every frame (base.js), with the app's time
 *   build.face, build.yaw             while it turns the orbit: how much (0..1) and to which longitude */
import * as THREE from 'three';
import { P } from './params.js';
import { weekStats } from './worlds/index.js';
import { bodyFor } from './bodies/index.js';
import { pace } from './pace.js';

/** Routes and lagoons each get one bit of sample's o.lf (int32: bits 0-30); any past the 31st share the last. */
export const LANDFORM_BITS = 31;

const DAY_LON = (Math.PI * 2) / 7; // readWeek: one day of the week, 360/7° of longitude
// Day d comes in over [d, d + 1] (at, to): its sessions start one after another from LEAD over SPREAD of the day, and
// each takes RAMP to come in, so a day is done by 0.8 of it. The orbit holds on the day while it builds and turns to
// the next over TURN, across the day's end.
const LEAD = 0.1, SPREAD = 0.25, RAMP = 0.45, TURN = [-0.25, 0.1];
// a session's share k, read as each of its parts: the ground first, then what stands on it
const GROUND = [0, 0.8], THING = [0.35, 1], WATER = [0.3, 0.9], TRAIL = [0.7, 1], RING = [0.55, 1], BODY = [0.45, 1];
const HIDE = 1e-3;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => t * t * (3 - 2 * t);
const part = (k, [a, b]) => smooth(clamp((k - a) / (b - a), 0, 1));
const lerp = (a, b, t) => a + (b - a) * t;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
// the day the orbit faces at position p: held while it builds, turned to the next across the day's end
const facing = (p) => {
  const q = p - TURN[0], d = Math.floor(q);
  return d - 1 + smooth(clamp((q - d) / (TURN[1] - TURN[0]), 0, 1));
};
const BODY_NAME = /^body-|^marble-body$/; // a body's own object (bodies/*.js create), and its companions below
const BODY_COMPANION = /^(marble-pebble|companion-ice-ring)$/;
const RACE_RING = /(^|-)companion-race-ring$/; // muted- while a crown wears the race (bodies/star.js ringMute)

export function createBuild({ features, seed, planet, ocean, scene, objects, material, uniforms, cap = Infinity, R = 120 }) {
  const sessions = features.list.filter((f) => f.kind !== 'monument').map((f) => ({
    f, day: clamp(f.day | 0, 0, 6), start: 0, k: 1, from: 1, to: 1, t0: 0, dur: 0, sweat: 0, hours: 0,
  }));
  const byId = new Map(sessions.map((s) => [s.f.id, s]));
  for (let d = 0; d < 7; d++) {
    const mates = sessions.filter((s) => s.day === d);
    mates.forEach((s, j) => { s.start = d + LEAD + SPREAD * (j / mates.length); });
  }
  // the week's sweat and hours, session by session: what raises the sea and lets the life in
  const sweatSum = sessions.reduce((a, s) => a + num(s.f.stats?.sweatMl), 0);
  const hourSum = sessions.reduce((a, s) => a + num(s.f.stats?.activeS), 0);
  for (const s of sessions) {
    const even = 1 / Math.max(1, sessions.length);
    s.hours = hourSum ? num(s.f.stats?.activeS) / hourSum : even;
    s.sweat = sweatSum ? num(s.f.stats?.sweatMl) / sweatSum : s.hours;
  }
  const owners = Array.from({ length: LANDFORM_BITS }, () => []);
  for (const r of [...(features.routes || []), ...(features.lagoons || []), ...(features.forms || [])]) {
    const s = byId.get(r.featureId);
    if (s && Number.isInteger(r.order)) owners[r.order].push(s);
  }
  const race = byId.get(features.race?.featureId || features.monument?.raceFeatureId) || null;
  const earner = bodyEarner(features, seed, sessions);
  const sessionOf = (f) => byId.get(f.kind === 'monument' ? f.raceFeatureId : f.id) || null;

  let ready = null, live = false, pos = { from: 7, to: 7, t0: 0, dur: 0 }, now = 0, dirty = true;
  let face = 0, faceTo = 0, look = null, yaw = 0, ending = false;
  const waits = [];
  let ground = null, survey = null, things = [], extras = null, amount0 = 1;
  const bitK = new Float64Array(LANDFORM_BITS).fill(1), bitWas = new Float64Array(LANDFORM_BITS).fill(1);
  let seaWas = features.seaLevel;

  /* ---------------------------------------------------------------- reading the ground before each landform */
  const o = { h: 0, range: 0, race: 0, macro: 0, lf: 0 };
  const popcount = (m) => { let c = 0; for (; m; m >>>= 1) c += m & 1; return c; };
  // The ground at each item before each landform in its mask was laid, and what each added (CSR): base[3i] the
  // height, range and race before the first, then per step its bit and the three changes; `fin` ends the last step.
  async function layers(count, dirOf, maskOf, finOf) {
    let m = 0, e = 0;
    for (let i = 0; i < count; i++) { const mask = maskOf(i); if (mask) { m++; e += popcount(mask); } }
    const L = {
      count: m, idx: new Uint32Array(m), base: new Float32Array(m * 3), off: new Uint32Array(m + 1),
      bit: new Uint8Array(e), d: new Float32Array(e * 3), dir: new Float32Array(m * 3),
    };
    const dir = new THREE.Vector3(), fin = [0, 0, 0];
    let slot = 0, at = 0;
    for (let i0 = 0; i0 < count; i0 += 2048) {
      await pace();
      for (let i = i0, end = Math.min(count, i0 + 2048); i < end; i++) {
        const mask = maskOf(i);
        if (!mask) continue;
        dirOf(i, dir);
        finOf(i, fin);
        L.idx[slot] = i;
        L.dir[slot * 3] = dir.x; L.dir[slot * 3 + 1] = dir.y; L.dir[slot * 3 + 2] = dir.z;
        L.off[slot] = at;
        let ph = 0, pr = 0, pc = 0, last = -1;
        for (let b = 0, k = mask; k; b++, k >>>= 1) {
          if (!(k & 1)) continue;
          features.sample(dir, o, b - 1);
          if (last < 0) { L.base[slot * 3] = o.h; L.base[slot * 3 + 1] = o.range; L.base[slot * 3 + 2] = o.race; }
          else { L.bit[at] = last; L.d[at * 3] = o.h - ph; L.d[at * 3 + 1] = o.range - pr; L.d[at * 3 + 2] = o.race - pc; at++; }
          ph = o.h; pr = o.range; pc = o.race; last = b;
        }
        L.bit[at] = last; L.d[at * 3] = fin[0] - ph; L.d[at * 3 + 1] = fin[1] - pr; L.d[at * 3 + 2] = fin[2] - pc; at++;
        slot++;
      }
    }
    L.off[m] = at;
    // and the other way round: every item each bit shaped
    const bOff = new Uint32Array(LANDFORM_BITS + 1), bSlot = new Uint32Array(e);
    for (let i = 0; i < e; i++) bOff[L.bit[i] + 1]++;
    for (let b = 0; b < LANDFORM_BITS; b++) bOff[b + 1] += bOff[b];
    const fill = bOff.slice(0, LANDFORM_BITS);
    for (let s = 0; s < m; s++) for (let i = L.off[s]; i < L.off[s + 1]; i++) bSlot[fill[L.bit[i]]++] = s;
    L.bOff = bOff; L.bSlot = bSlot;
    L.mark = new Uint32Array(m); L.list = new Uint32Array(m); L.stamp = 0;
    return L;
  }
  // the height (and range, race) of slot s with every bit at its share now
  function heightOf(L, s, out) {
    let h = L.base[s * 3], r = L.base[s * 3 + 1], c = L.base[s * 3 + 2];
    for (let i = L.off[s]; i < L.off[s + 1]; i++) {
      const k = bitK[L.bit[i]];
      h += k * L.d[i * 3]; r += k * L.d[i * 3 + 1]; c += k * L.d[i * 3 + 2];
    }
    out[0] = h; out[1] = r; out[2] = c;
  }
  // the slots holding a bit that moved since the last frame, each once
  function moved(L, bits, nb) {
    const stamp = ++L.stamp;
    let n = 0;
    for (let j = 0; j < nb; j++) {
      const b = bits[j];
      for (let e = L.bOff[b]; e < L.bOff[b + 1]; e++) {
        const s = L.bSlot[e];
        if (L.mark[s] !== stamp) { L.mark[s] = stamp; L.list[n++] = s; }
      }
    }
    return n;
  }

  async function prepareGround() {
    const geo = planet?.geometry, lf = geo?.userData.landforms;
    if (!lf) return null;
    const A = geo.attributes, n = A.position.count;
    const L = await layers(n,
      (i, d) => d.fromArray(A.position.array, i * 3).normalize(),
      (i) => lf[i],
      (i, fin) => { fin[0] = A.aHeight.array[i]; fin[1] = A.aRange.array[i]; fin[2] = A.aRace.array[i]; });
    await pace();
    // each vertex's triangles, for the normals of the ground that moves
    const tri = geo.index.array, vtOff = new Uint32Array(n + 1);
    for (let i = 0; i < tri.length; i++) vtOff[tri[i] + 1]++;
    for (let v = 0; v < n; v++) vtOff[v + 1] += vtOff[v];
    const vtList = new Uint32Array(tri.length), fill = vtOff.slice(0, n);
    for (let t = 0; t < tri.length; t++) vtList[fill[tri[t]]++] = (t / 3) | 0;
    await pace();
    const keep = {};
    for (const name of ['position', 'normal', 'aHeight', 'aSlope', 'aRange', 'aRace', 'aSea']) keep[name] = A[name].array.slice();
    return { L, A, n, tri, vtOff, vtList, keep, vMark: new Uint32Array(n), vStamp: 0, ring: new Uint32Array(n), hrc: [0, 0, 0] };
  }

  // The survey the style paints the orbit's form and its shallows from (ink.js bakeSurvey: land over the sea, a
  // texel per longitude and latitude step, as half floats): kept with the ground, or left alone if it isn't that.
  async function prepareSurvey() {
    const tex = material?.uniforms?.tLand?.value;
    const data = tex?.isDataTexture ? tex.image?.data : null;
    if (!(data instanceof Uint16Array) || data.length !== tex.image.width * tex.image.height) return null;
    const NX = tex.image.width, NY = tex.image.height, N = NX * NY;
    const dirAt = (i, d) => {
      const x = i % NX, y = (i / NX) | 0;
      const lat = Math.PI * (0.5 - (y + 0.5) / NY), lon = Math.PI * 2 * ((x + 0.5) / NX - 0.5);
      return d.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
    };
    const d = new THREE.Vector3();
    for (let j = 0; j < 24; j++) { // the chart must be the one the style laid
      const i = Math.floor(((j + 0.5) / 24) * N * 0.997);
      const want = clamp(features.heightAt(dirAt(i, d)) - features.seaLevel, -40, 60);
      if (Math.abs(THREE.DataUtils.fromHalfFloat(data[i]) - want) > 0.06 + 0.002 * Math.abs(want)) return null;
    }
    const fin = new Float32Array(N), mask = new Uint32Array(N);
    for (let i0 = 0; i0 < N; i0 += 2048) {
      await pace();
      for (let i = i0, end = Math.min(N, i0 + 2048); i < end; i++) {
        features.sample(dirAt(i, d), o);
        fin[i] = o.h;
        mask[i] = o.lf;
      }
    }
    const L = await layers(N, dirAt, (i) => mask[i], (i, f) => { f[0] = fin[i]; f[1] = 0; f[2] = 0; });
    return { tex, data, keep: data.slice(), fin, cur: fin.slice(), L, N, hrc: [0, 0, 0] };
  }

  function prepareThings() {
    const out = [];
    const d = new THREE.Vector3();
    for (const [id, obj] of objects) {
      const f = features.byId[id], s = f && sessionOf(f);
      if (!s) continue;
      features.sample(d.copy(f.dir), o);
      const mask = o.lf, fin = [o.h, 0, 0];
      const steps = [];
      let base = fin[0], prev = 0, last = -1;
      for (let b = 0, k = mask; k; b++, k >>>= 1) {
        if (!(k & 1)) continue;
        features.sample(d, o, b - 1);
        if (last < 0) base = o.h;
        else steps.push(last, o.h - prev);
        prev = o.h; last = b;
      }
      if (last >= 0) steps.push(last, fin[0] - prev);
      out.push({ obj, f, s, base, steps, pos: obj.position.clone(), scale: obj.scale.clone(), visible: obj.visible });
    }
    return out;
  }

  // What stands off the globe is staged by its size: one centred on the globe is drawn at s0 of it, small enough to
  // be wholly inside the ground (so it is hidden whatever its own update says), and grows out of the globe as it
  // comes in; one standing anywhere else grows from nothing where it stands.
  function prepareExtras() {
    const sphere = new THREE.Sphere();
    const reachOf = (obj) => {
      let r = 0;
      obj.updateWorldMatrix(true, true);
      obj.traverse((m) => {
        const g = m.geometry;
        if (!g?.attributes?.position) return;
        if (!g.boundingSphere) g.computeBoundingSphere();
        sphere.copy(g.boundingSphere).applyMatrix4(m.matrixWorld);
        r = Math.max(r, sphere.center.length() + sphere.radius);
      });
      return r;
    };
    const stage = (obj) => ({
      obj, scale: obj.scale.clone(), visible: obj.visible,
      s0: obj.position.lengthSq() < 1e-6 ? clamp((0.97 * R) / Math.max(reachOf(obj), R), 0.3, 0.95) : 0,
    });
    const waters = [];
    for (const basin of features.lagoons || []) {
      const water = scene.getObjectByName(`${basin.featureId}-water`), s = byId.get(basin.featureId);
      if (water && s) waters.push({ ...stage(water), s0: 0, s });
    }
    const bodies = [];
    for (const top of scene.children) if (BODY_NAME.test(top.name)) for (const c of top.children) bodies.push(stage(c));
    scene.traverse((c) => { if (BODY_COMPANION.test(c.name)) bodies.push(stage(c)); });
    const rings = [];
    scene.traverse((c) => { if (RACE_RING.test(c.name)) rings.push(stage(c)); });
    const trail = scene.getObjectByName('race-trail');
    return { waters, bodies, rings, trail: trail ? stage(trail) : null };
  }
  function grow(x, e) {
    x.obj.scale.copy(x.scale).multiplyScalar(Math.max(lerp(x.s0, 1, e), HIDE));
    x.obj.visible = x.visible && e > HIDE;
  }

  function prepare() {
    ready ||= (async () => {
      ground = await prepareGround();
      survey = await prepareSurvey();
      things = prepareThings();
      extras = prepareExtras();
    })();
    return ready;
  }

  /* ------------------------------------------------------------------------------------------- the frame */
  const kAt = (s, p) => clamp((p - s.start) / RAMP, 0, 1);
  const posAt = (t) => (pos.dur > 0 ? lerp(pos.from, pos.to, smooth(clamp((t - pos.t0) / pos.dur, 0, 1))) : pos.to);
  const showAt = (s, t) => (s.dur > 0 ? lerp(s.from, s.to, smooth(clamp((t - s.t0) / s.dur, 0, 1))) : s.to);
  const changedBits = new Uint8Array(LANDFORM_BITS);

  function tick(t) {
    if (!live) return;
    now = t;
    const p = posAt(t);
    for (const s of sessions) {
      const k = Math.max(kAt(s, p), showAt(s, t));
      if (k !== s.k) { s.k = k; dirty = true; }
    }
    // the orbit turns to the day coming in (a clip), and lets go of it as asked
    face = faceTo;
    yaw = facing(look ?? p) * DAY_LON;
    if (dirty) apply();
    dirty = false;
    for (let i = waits.length - 1; i >= 0; i--) if (t >= waits[i].at) { waits[i].resolve(); waits.splice(i, 1); }
    if (ending && t >= pos.t0 + pos.dur && allIn()) release();
  }
  function allIn() {
    for (const s of sessions) if (s.k < 1) return false;
    return true;
  }

  function apply() {
    // the landforms: each moves with its session's ground
    let nb = 0;
    for (let b = 0; b < LANDFORM_BITS; b++) {
      const own = owners[b];
      let k = 1;
      for (const s of own) k = Math.min(k, part(s.k, GROUND));
      bitK[b] = k;
      if (k !== bitWas[b]) { changedBits[nb++] = b; bitWas[b] = k; }
    }
    // the sea, with the sweat so far
    let share = 0;
    for (const s of sessions) share += s.k * s.sweat;
    const sea = share >= 1 - 1e-9 ? features.seaLevel : features.seaAt(features.sweatL * share);
    const seaMoved = sea !== seaWas;
    seaWas = sea;
    if (ground && (nb || seaMoved)) applyGround(nb, sea, seaMoved);
    if (survey && (nb || seaMoved)) applySurvey(nb, sea, seaMoved);
    if (ocean) ocean.scale.setScalar((R + sea) / (R + features.seaLevel));
    for (const th of things) applyThing(th);
    applyExtras();
    // the week's life, as it trains
    let hours = 0;
    for (const s of sessions) hours += s.k * s.hours;
    const life = hours >= 1 - 1e-9 ? 1 : clamp(hours, 0, 1);
    P['life.amount'] = life >= 1 ? amount0 : amount0 * life;
    uniforms?.uBuild?.value.set(earner ? part(earner.k, BODY) : 1, race ? part(race.k, RING) : 1, life);
  }

  function applyGround(nb, sea, seaMoved) {
    const G = ground, L = G.L, A = G.A, hrc = G.hrc;
    const posA = A.position.array, hA = A.aHeight.array, rA = A.aRange.array, cA = A.aRace.array;
    const n = nb ? moved(L, changedBits, nb) : 0;
    if (n) {
      const vStamp = ++G.vStamp;
      let nr = 0;
      for (let j = 0; j < n; j++) {
        const s = L.list[j], v = L.idx[s];
        heightOf(L, s, hrc);
        hA[v] = hrc[0]; rA[v] = hrc[1]; cA[v] = hrc[2];
        const r = R + Math.min(hrc[0], cap);
        posA[v * 3] = L.dir[s * 3] * r; posA[v * 3 + 1] = L.dir[s * 3 + 1] * r; posA[v * 3 + 2] = L.dir[s * 3 + 2] * r;
        // its ring of neighbours re-reads its normal
        for (let e = G.vtOff[v]; e < G.vtOff[v + 1]; e++) {
          const t = G.vtList[e] * 3;
          for (let c = 0; c < 3; c++) {
            const u = G.tri[t + c];
            if (G.vMark[u] !== vStamp) { G.vMark[u] = vStamp; G.ring[nr++] = u; }
          }
        }
      }
      normals(G, nr);
      for (const name of ['position', 'normal', 'aHeight', 'aSlope', 'aRange', 'aRace']) A[name].needsUpdate = true;
    }
    const seaA = A.aSea.array;
    if (seaMoved) for (let i = 0; i < G.n; i++) seaA[i] = hA[i] - sea;
    else for (let j = 0; j < n; j++) { const v = L.idx[L.list[j]]; seaA[v] = hA[v] - sea; }
    A.aSea.needsUpdate = true;
  }

  // buildPlanetGeometry's own normals (the area-weighted sum of each triangle's cross product) and slope, for the
  // vertices whose ground moved and their ring
  function normals(G, nr) {
    const p = G.A.position.array, nrm = G.A.normal.array, slope = G.A.aSlope.array, tri = G.tri;
    for (let j = 0; j < nr; j++) {
      const u = G.ring[j];
      let x = 0, y = 0, z = 0;
      for (let e = G.vtOff[u]; e < G.vtOff[u + 1]; e++) {
        const t = G.vtList[e] * 3, a = tri[t] * 3, b = tri[t + 1] * 3, c = tri[t + 2] * 3;
        const bx = p[b], by = p[b + 1], bz = p[b + 2];
        const cbx = p[c] - bx, cby = p[c + 1] - by, cbz = p[c + 2] - bz;
        const abx = p[a] - bx, aby = p[a + 1] - by, abz = p[a + 2] - bz;
        x += cby * abz - cbz * aby; y += cbz * abx - cbx * abz; z += cbx * aby - cby * abx;
      }
      const s = 1 / (Math.sqrt(x * x + y * y + z * z) || 1);
      x *= s; y *= s; z *= s;
      const k = u * 3;
      nrm[k] = x; nrm[k + 1] = y; nrm[k + 2] = z;
      const l = 1 / (Math.sqrt(p[k] * p[k] + p[k + 1] * p[k + 1] + p[k + 2] * p[k + 2]) || 1);
      slope[u] = 1 - clamp((x * p[k] + y * p[k + 1] + z * p[k + 2]) * l, 0, 1);
    }
  }

  function applySurvey(nb, sea, seaMoved) {
    const S = survey, L = S.L, cur = S.cur, data = S.data, hrc = S.hrc, half = THREE.DataUtils.toHalfFloat;
    const n = nb ? moved(L, changedBits, nb) : 0;
    for (let j = 0; j < n; j++) {
      const s = L.list[j], i = L.idx[s];
      heightOf(L, s, hrc);
      cur[i] = hrc[0];
      if (!seaMoved) data[i] = half(clamp(cur[i] - sea, -40, 60));
    }
    if (seaMoved) for (let i = 0; i < S.N; i++) data[i] = half(clamp(cur[i] - sea, -40, 60));
    S.tex.needsUpdate = true;
  }

  function applyThing(th) {
    const e = part(th.s.k, THING);
    let h = th.base;
    for (let i = 0; i < th.steps.length; i += 2) h += bitK[th.steps[i]] * th.steps[i + 1];
    th.obj.position.copy(th.f.dir).multiplyScalar(R + h);
    const w = lerp(0.3, 1, e);
    th.obj.scale.set(th.scale.x * w, th.scale.y * Math.max(e, HIDE), th.scale.z * w);
    th.obj.visible = th.visible && e > HIDE;
  }

  function applyExtras() {
    const X = extras;
    for (const w of X.waters) grow(w, part(w.s.k, WATER));
    // the body swells up out of the ground once the week is it; the race's ring opens out of the globe, and its trail
    // comes up on the ridge once the ridge is up
    const body = earner ? part(earner.k, BODY) : 1;
    for (const b of X.bodies) grow(b, body);
    const ring = race ? part(race.k, RING) : 1;
    for (const r of X.rings) grow(r, ring);
    if (X.trail) grow(X.trail, race ? part(race.k, TRAIL) : 1);
  }

  // The whole week as it was built: every buffer, texture, object and dial put back.
  function release() {
    for (const s of sessions) { s.k = s.from = s.to = 1; s.dur = 0; }
    if (ground) {
      for (const [name, arr] of Object.entries(ground.keep)) { ground.A[name].array.set(arr); ground.A[name].needsUpdate = true; }
    }
    if (survey) { survey.data.set(survey.keep); survey.cur.set(survey.fin); survey.tex.needsUpdate = true; }
    if (ocean) ocean.scale.setScalar(1);
    for (const th of things) { th.obj.position.copy(th.pos); th.obj.scale.copy(th.scale); th.obj.visible = th.visible; }
    if (extras) {
      for (const x of [...extras.waters, ...extras.bodies, ...extras.rings, ...(extras.trail ? [extras.trail] : [])]) {
        x.obj.scale.copy(x.scale);
        x.obj.visible = x.visible;
      }
    }
    P['life.amount'] = amount0;
    uniforms?.uBuild?.value.set(1, 1, 1);
    bitK.fill(1); bitWas.fill(1);
    seaWas = features.seaLevel;
    live = ending = false;
    face = faceTo = 0;
    for (const w of waits.splice(0)) w.resolve();
  }

  function engage() {
    if (!extras) throw new Error('build.prepare() first');
    if (live) return;
    live = true;
    amount0 = P['life.amount'];
  }

  const until = (at) => new Promise((resolve) => waits.push({ at, resolve }));
  return {
    LANDFORM_BITS,
    get live() { return live; },
    get position() { return posAt(now); },
    get face() { return face; },
    get yaw() { return yaw; },
    /** Each day's sessions (features.list ids), for a page that tells the week alongside. */
    days: Array.from({ length: 7 }, (_, d) => sessions.filter((s) => s.day === d).map((s) => s.f.id)),
    prepare,
    at(p, { face: w = 0, look: q = null } = {}) {
      engage();
      ending = false;
      pos.from = pos.to = clamp(p, 0, 7);
      pos.t0 = now;
      pos.dur = 0;
      for (const s of sessions) { s.from = s.to = 0; s.dur = 0; }
      faceTo = clamp(Number(w) || 0, 0, 1);
      look = q;
      dirty = true;
    },
    async to(p, { duration = 1.6, face: w = 0 } = {}) {
      await prepare();
      engage();
      ending = false;
      pos = { from: posAt(now), to: clamp(p, 0, 7), t0: now, dur: Math.max(0, duration) };
      faceTo = w ? 1 : 0;
      look = null;
      dirty = true;
      return until(now + pos.dur);
    },
    async show(ids, { duration = 1.4 } = {}) {
      await prepare();
      engage();
      for (const id of [].concat(ids)) {
        const s = byId.get(id);
        if (!s || s.k >= 1) continue;
        Object.assign(s, { from: s.k, to: 1, t0: now, dur: Math.max(0, duration) });
      }
      dirty = true;
      return until(now + duration);
    },
    end({ duration = 0 } = {}) {
      if (!live) return Promise.resolve();
      ending = true;
      pos = { from: posAt(now), to: 7, t0: now, dur: Math.max(0, duration) };
      for (const s of sessions) Object.assign(s, { from: s.k, to: 1, t0: now, dur: Math.max(0, duration) });
      dirty = true;
      const done = until(now + duration);
      if (!(duration > 0)) release();
      return done;
    },
    tick,
  };
}

// The session after which the week is its body: the first whose week so far picks it as auto would (bodies/index.js),
// or the last, for a body named outright. Null for a rocky planet.
function bodyEarner(features, seed, sessions) {
  if (!features.body || !sessions.length) return null;
  if (P['world.body'] === 'auto') {
    const acts = sessions.map((s) => s.f.stats);
    for (let j = 0; j < sessions.length; j++) {
      const stats = weekStats({ week: seed?.week || features.week, race: seed?.race, activities: acts.slice(0, j + 1) });
      if (bodyFor('auto', stats)?.id === features.body.id) return sessions[j];
    }
  }
  return sessions[sessions.length - 1];
}

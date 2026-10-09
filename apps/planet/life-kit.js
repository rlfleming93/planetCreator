/* Planet Creator — the week's life: what every part of it shares (life.js).
 *
 * The house's own noise, the survey chart and the brush's one-pixel edge, so a
 * creature is drawn in the hand the ground is; a date hash, so neighbouring
 * weeks share their ancestry; and the one instanced quad every creature rides. */

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const num = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

// FNV-1a and mulberry32: the generator's own pair (base.js keeps them private),
// so a lineage seeded by a date draws the same numbers in every week near it.
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function mulberry32(a) {
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The house's noise (ink.js / ink-objects.js NOISE), the survey's chart and the
// brush's edge: one pixel of paper, never a soft ramp.
export const NOISE = /* glsl */ `
float inkH13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
float inkH12(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float inkN3(vec3 x){
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(inkH13(i), inkH13(i + vec3(1.0,0.0,0.0)), f.x), mix(inkH13(i + vec3(0.0,1.0,0.0)), inkH13(i + vec3(1.0,1.0,0.0)), f.x), f.y);
  float b = mix(mix(inkH13(i + vec3(0.0,0.0,1.0)), inkH13(i + vec3(1.0,0.0,1.0)), f.x), mix(inkH13(i + vec3(0.0,1.0,1.0)), inkH13(i + vec3(1.0,1.0,1.0)), f.x), f.y);
  return mix(a, b, f.z);
}
float inkN2(vec2 x){
  vec2 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(inkH12(i), inkH12(i + vec2(1.0,0.0)), f.x);
  float b = mix(inkH12(i + vec2(0.0,1.0)), inkH12(i + vec2(1.0,1.0)), f.x);
  return mix(a, b, f.y);
}
float inkF3(vec3 p){ float s = 0.0, a = 0.5, n = 0.0; for (int i = 0; i < 3; i++){ s += a * inkN3(p); n += a; p = p * 2.03 + vec3(1.7, -2.3, 0.9); a *= 0.5; } return s / n; }
float inkF2(vec2 p){ float s = 0.0, a = 0.5, n = 0.0; for (int i = 0; i < 3; i++){ s += a * inkN2(p); n += a; p = p * 2.03 + vec2(1.7, -2.3); a *= 0.5; } return s / n; }
float inkPixel(float x, float w){ return clamp(x / max(w, 1e-5) + 0.5, 0.0, 1.0); }
vec2 inkUV(vec3 d){ return vec2(0.5 + atan(d.z, d.x) * 0.15915494, 0.5 - asin(clamp(d.y, -1.0, 1.0)) * 0.31830989); }
// a stroke between a and b, its width r0 at a and r1 at b
float inkSeg(vec2 q, vec2 a, vec2 b, float r0, float r1){
  vec2 pa = q - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
  return length(pa - ba * h) - mix(r0, r1, h);
}
float inkEll(vec2 q, vec2 c, vec2 r){ vec2 p = (q - c) / r; return (length(p) - 1.0) * min(r.x, r.y); }
`;

// A mark too small for the sheet is drawn a pixel and a half across and only as
// strong as the ink it would have held, so a far bird or a speck is a faint
// touch and never a flicker. uViewH is the drawing buffer's height in pixels
// (life.js keeps it); `inkMark(clip, size)` returns the size to draw and the
// share of the mark's strength to keep.
export const MARK = /* glsl */ `
uniform float uViewH;
vec2 inkMark(vec4 clip, float size){
  float px = size * projectionMatrix[1][1] * 0.5 * uViewH / max(clip.w, 1e-4);
  float minPx = 1.5;
  return px >= minPx ? vec2(size, 1.0) : vec2(size * minPx / max(px, 1e-4), (px / minPx) * (px / minPx));
}
`;

/** One quad (two triangles, uv 0..1) drawn `count` times; `attrs` maps a name to a Float32Array of vec4s. */
export function instancedQuad(T, count, attrs) {
  const geo = new T.InstancedBufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geo.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  for (const [name, data] of Object.entries(attrs)) geo.setAttribute(name, new T.InstancedBufferAttribute(data, 4));
  geo.instanceCount = count;
  return geo;
}

/** A tangent frame at a unit direction: east and north, the way the survey's chart turns. */
export function tangentFrame(T, dir, east = new T.Vector3(), north = new T.Vector3()) {
  east.set(-dir.z, 0, dir.x);
  if (east.lengthSq() < 1e-8) east.set(1, 0, 0);
  east.normalize();
  north.crossVectors(dir, east).normalize();
  return { east, north };
}

/**
 * Where the eye has landed, the way ink.js stands its sky: read every frame
 * while the camera is still coming down (`surface` under 1), then held while it
 * walks or turns — so what is placed by it stays put in the world — and read
 * afresh only when it jumps (a teleport). `serial` counts the readings; `landed`
 * says the last one was taken on the ground. The frame is the camera's own
 * (look, right, lift), its lens (tanH, aspect), and the ground's up and the
 * level forward under it.
 */
export function landingEye(T, R) {
  const last = new T.Vector3();
  let fresh = true;
  const eye = {
    serial: 0, landed: false,
    pos: new T.Vector3(), up: new T.Vector3(), fw: new T.Vector3(), side: new T.Vector3(),
    look: new T.Vector3(), right: new T.Vector3(), lift: new T.Vector3(), tanH: 0.41, aspect: 1,
    /** A point in the frame: across and up (1 at the frame's edge), `dist` from the eye. */
    at(x, y, dist, out) {
      return out.copy(eye.look).addScaledVector(eye.right, x * eye.tanH * eye.aspect).addScaledVector(eye.lift, y * eye.tanH)
        .normalize().multiplyScalar(dist).add(eye.pos);
    },
    /** Where a world point stands in the frame: across, up (1 at the edge) and how far ahead. */
    frame(w, out) {
      const dx = w.x - eye.pos.x, dy = w.y - eye.pos.y, dz = w.z - eye.pos.z;
      const z = dx * eye.look.x + dy * eye.look.y + dz * eye.look.z;
      out.x = (dx * eye.right.x + dy * eye.right.y + dz * eye.right.z) / (z * eye.tanH * eye.aspect);
      out.y = (dx * eye.lift.x + dy * eye.lift.y + dz * eye.lift.z) / (z * eye.tanH);
      out.z = z;
      return out;
    },
    update(camera, surface) {
      const jumped = fresh || camera.position.distanceToSquared(last) > 16;
      last.copy(camera.position);
      // only an eye near the ground lands: from orbit nothing here is placed
      if (camera.position.length() > R + 40) return false;
      const coming = surface < 0.999;
      if (!coming && !jumped && eye.landed) return false;
      fresh = false;
      eye.landed = !coming;
      eye.pos.copy(camera.position);
      eye.up.copy(camera.position).normalize();
      camera.getWorldDirection(eye.look);
      eye.right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      eye.lift.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
      eye.fw.copy(eye.look).addScaledVector(eye.up, -eye.look.dot(eye.up));
      if (eye.fw.lengthSq() < 1e-8) eye.fw.copy(eye.lift);
      eye.fw.normalize();
      eye.side.crossVectors(eye.fw, eye.up).normalize();
      eye.tanH = Math.tan(((camera.fov || 45) * Math.PI) / 360);
      eye.aspect = camera.aspect || 1;
      eye.serial++;
      return true;
    },
  };
  return eye;
}

/** Half-float survey (ink.js bakeSurvey: 640×320, longitude across, latitude down) read on the CPU. */
export function surveyReader(T, texture) {
  const img = texture?.image;
  if (!img?.data) return null;
  const { width: NX, height: NY, data } = img;
  const from = T.DataUtils.fromHalfFloat;
  return (dir) => {
    const u = 0.5 + Math.atan2(dir.z, dir.x) / TAU;
    const v = 0.5 - Math.asin(clamp(dir.y, -1, 1)) / Math.PI;
    const x = ((Math.floor(u * NX) % NX) + NX) % NX;
    const y = clamp(Math.floor(v * NY), 0, NY - 1);
    return from(data[y * NX + x]);
  };
}

// ---- what stands on the ground, and what walks on it ----------------------------------------------------------------
// Everything that stands or walks on the ground keeps out of everything else (the herds, the tree a landing stands, the
// runner: life-herds.js, life-forest.js, runner.js), each a disc on the globe: a unit direction and a radius in units.
// What the week built is read off the scene as the eye comes near it — every opaque piece of a feature's object, as far
// as it stands up to a body's height (the washes laid on the ground are not in the way) — a part lays its own standing
// discs by a tag, and the herds lay their animals every frame in a spatial hash. One field a week, keyed on the week's
// features, so life's parts and the runner share it. Nothing here allocates once a disc is laid.
const SOLIDS = new WeakMap();
const CELL = 3;        // the hash's cell, in units: more than any walker's reach
const SLOTS = 2048;
const BODY = 2.2;      // what stands above a body's height is over its head, not in its way
const READ_NEAR = 120; // a feature's object is read once the eye is this near it (from further its own LOD shrinks it)

/** The week's field of solids (made on first asking). */
export function solidsOf(features, R = 120) {
  let s = SOLIDS.get(features);
  if (!s) SOLIDS.set(features, (s = makeSolids(R)));
  return s;
}

function makeSolids(R) {
  // the standing: unit direction, radius, height, tag (null: read off a feature's object)
  const sx = [], sy = [], sz = [], sr = [], sh = [], tags = [];
  const seen = new Set();
  let inv = null, m = null, v = null; // read()'s scratch, made on its first call
  // the moving: world points on the ground and their radii, hashed by cell
  let mx = new Float32Array(64), my = new Float32Array(64), mz = new Float32Array(64), mr = new Float32Array(64);
  let next = new Int32Array(64);
  const head = new Int32Array(SLOTS).fill(-1);
  const visited = new Int32Array(27);
  const slot = (i, j, k) => ((i * 73856093) ^ (j * 19349663) ^ (k * 83492791)) & (SLOTS - 1);
  const lay = (tag, x, y, z, r, h) => {
    sx.push(x); sy.push(y); sz.push(z); sr.push(r); sh.push(h); tags.push(tag);
  };
  const field = {
    /** Bumped whenever a standing disc is laid or moved. */
    version: 0,
    count: 0,
    sx, sy, sz, sr, sh,
    mx, my, mz, mr,
    /** Read every feature object within READ_NEAR of `near` (a world point) that has not been read. */
    read(T, scene, near) {
      if (!scene || !near) return;
      let laid = false;
      for (const root of scene.children) {
        const f = root.userData?.feature;
        if (!f || seen.has(f.id) || root.position.distanceTo(near) > READ_NEAR) continue;
        root.updateMatrixWorld(true);
        if (!v) { inv = new T.Matrix4(); m = new T.Matrix4(); v = new T.Vector3(); }
        inv.copy(root.matrixWorld).invert();
        // an LOD is read by its near level, shown or not: a landing stands its tree while the flight down is still
        // far enough out for the LOD to show its empty far level
        const top = root.isLOD ? root.levels[0]?.object : root;
        if (!top) continue;
        top[root.isLOD ? 'traverse' : 'traverseVisible']((mesh) => {
          const pos = mesh.isMesh ? mesh.geometry?.attributes?.position : null;
          const mat = mesh.material;
          if (!pos || !mat) return;
          seen.add(f.id);
          if (mat.transparent) return;
          m.multiplyMatrices(inv, mesh.matrixWorld);
          let x = 0, z = 0, r = 0, top = -Infinity, k = 0;
          if (pos.count === 4 && mat.uniforms?.uSize) {
            // a sheet its shader stands up (a grove's pine): its root, as wide as its lowest boughs
            v.setFromMatrixPosition(m);
            x = v.x; z = v.z; r = 0.3 * mat.uniforms.uSize.value.x; top = v.y + mat.uniforms.uSize.value.y;
          } else {
            const step = Math.max(1, pos.count >> 8);
            for (let i = 0; i < pos.count; i += step) {
              v.fromBufferAttribute(pos, i).applyMatrix4(m);
              top = Math.max(top, v.y);
              if (v.y < BODY) { x += v.x; z += v.z; k++; }
            }
            if (!k || top < 0.15) return;
            x /= k; z /= k;
            for (let i = 0; i < pos.count; i += step) {
              v.fromBufferAttribute(pos, i).applyMatrix4(m);
              if (v.y < BODY) r = Math.max(r, Math.hypot(v.x - x, v.z - z));
            }
          }
          v.set(x, 0, z).applyMatrix4(root.matrixWorld).normalize();
          lay(null, v.x, v.y, v.z, r, top);
          laid = true;
        });
      }
      if (laid) { field.count = sx.length; field.version++; }
    },
    /** Lay `tag`'s own standing disc where `dir` points (or take it away: r ≤ 0). */
    stand(tag, dir, r, h) {
      let i = tags.indexOf(tag);
      if (i < 0 && r > 0) { lay(tag, 0, 0, 0, 0, 0); i = sx.length - 1; }
      if (i < 0) return;
      sx[i] = dir.x; sy[i] = dir.y; sz[i] = dir.z; sr[i] = r > 0 ? r : -1e6; sh[i] = h;
      field.count = sx.length;
      field.version++;
    },
    /** Room for `n` moving ones (field.mx … field.mr); lay them, then index(n). */
    moving(n) {
      if (n <= mx.length) return;
      const grow = (a) => { const b = new Float32Array(n * 2); b.set(a); return b; };
      field.mx = mx = grow(mx); field.my = my = grow(my); field.mz = mz = grow(mz); field.mr = mr = grow(mr);
      next = new Int32Array(n * 2);
    },
    moved: 0,
    /** Hash the first `n` moving ones by where they stand. */
    index(n) {
      head.fill(-1);
      for (let i = 0; i < n; i++) {
        const h = slot(Math.floor(mx[i] / CELL), Math.floor(my[i] / CELL), Math.floor(mz[i] / CELL));
        next[i] = head[h];
        head[h] = i;
      }
      field.moved = n;
    },
    /** The moving ones in the cells round a world point, into `out` (as many as fit); returns how many. */
    around(x, y, z, out) {
      const i0 = Math.floor(x / CELL), j0 = Math.floor(y / CELL), k0 = Math.floor(z / CELL);
      let n = 0, slots = 0;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
        const h = slot(i0 + a, j0 + b, k0 + c);
        let dup = false;
        for (let q = 0; q < slots; q++) if (visited[q] === h) { dup = true; break; }
        if (dup) continue;
        visited[slots++] = h;
        for (let i = head[h]; i >= 0 && n < out.length; i = next[i]) out[n++] = i;
      }
      return n;
    },
    /**
     * Push the unit direction `dir` (a body of radius `r` standing there) out of every standing disc and every moving
     * one it is inside, along the ground: the body slides round what it meets. Returns whether it was moved.
     */
    push(dir, r) {
      let moved = false;
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < sx.length; i++) moved = out(dir, sx[i], sy[i], sz[i], sr[i] + r) || moved;
        for (let i = 0; i < field.moved; i++) {
          const l = Math.hypot(mx[i], my[i], mz[i]);
          moved = out(dir, mx[i] / l, my[i] / l, mz[i] / l, mr[i] + r) || moved;
        }
      }
      return moved;
    },
  };
  // out of one disc: along the great circle from its centre, to its edge
  const out = (dir, x, y, z, reach) => {
    if (reach <= 0) return false;
    const c = dir.x * x + dir.y * y + dir.z * z;
    const want = reach / R;
    if (c < Math.cos(want)) return false;
    let ax = dir.x - x * c, ay = dir.y - y * c, az = dir.z - z * c;
    let l = Math.hypot(ax, ay, az);
    // dead centre: out along any bearing
    if (l < 1e-9) { ax = -z; ay = 0; az = x; l = Math.hypot(ax, az); }
    if (l < 1e-9) { ax = 1; ay = 0; az = 0; l = 1; }
    const cw = Math.cos(want), swn = Math.sin(want) / l;
    dir.set(x * cw + ax * swn, y * cw + ay * swn, z * cw + az * swn).normalize();
    return true;
  };
  return field;
}

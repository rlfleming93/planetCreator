/* Planet Creator — the week's life: the forests (life.js).
 *
 * Calm grows woods. The week's yoga and how easily it went say how much of the
 * lowland is wooded — a quiet week's valleys fill, a week of intervals keeps
 * its ground open — and the woods gather in the hollows and down the valleys,
 * thickest round the places where the week was stilled. Their kind is the
 * week's warmth: firs on a cold week, cedars on a mild one, stone pines on a
 * hot one.
 *
 * From orbit   a glaze laid over the ground: the canopy deepens what it covers
 *              a shade and keeps the ground's own light under it, so a wood on
 *              a slope turned from the sun is darker still. The week's great
 *              stand — the largest on the face the poster turns to — is laid
 *              thin, its ground showing through, with a found edge all round
 *              that wanders as the hand does and dried darker just inside it,
 *              its crowns gathered in small clumps lit a little on the side
 *              the sun is on; every other wood is a quieter glaze lost into the
 *              ground's wash. Under a real sun the woods go into the night with
 *              the ground.
 * Underfoot    the woods themselves, every tree of them planted once for the
 *              week where the glaze lies: broadleaves, firs, birches, cedars
 *              or stone pines in stands by the week's warmth, at true scale,
 *              tallest deep in a wood and thinning to shrubs and ferns at its
 *              edge, gathered in clumps with gaps between. Each is painted once
 *              into a sheet of the week (its masses, its light from either
 *              side and from the front, its edge) and drawn from it turned to
 *              the eye, swaying a little in the wind, lit on the sun's side,
 *              taking the air with the ground it stands on. A landing keeps a
 *              glade round the runner, the way to him clear, and lays the
 *              near trees' shade on the ground, the sun coming through it.
 *              And one great tree — each landing its own, of three the week
 *              grows — stood where the eye lands on wooded ground in its view,
 *              in a glade of its own with the woods parted toward it: a wide
 *              crown over the canopy, in flower on a mild week, laying its
 *              shade on the ground away from the sun. Far woods keep the glaze
 *              on the hills.
 * The ground under them is read once, from the survey: nothing moves but the
 * wind in the crowns and the light on the leaves. */
import { P } from './params.js';
import { NOISE, TAU, clamp, instancedQuad, num, solidsOf, sstep, tangentFrame } from './life-kit.js';

const PADS = 20;
const LIMBS = 14;
const KINDS = ['fir', 'cedar', 'stone pine'];
// the woods' sheet: CELLS trees painted CELL px a side, COLS to a row; the
// shade laid under the SHADES trees nearest a landing, and the POOL nearest
// stood in the way of whatever walks there
const CELL = 512, COLS = 4, CELLS = 16, SHADES = 150, POOL = 48;

// ---- the reading -----------------------------------------------------------

/** How much the week grows, of what kind, and why; null for a week of none. */
function readForest(features) {
  const s = features.stats || {};
  const calm = (features.list || []).filter((f) => f.kind === 'calm');
  const yoga = calm.reduce((n, f) => n + num(f.stats?.activeS, 600) / 60, 0);
  // an easy week: little of it spent hard (unknown zones read as middling)
  const hard = s.hard == null ? 0.3 : num(s.hard, 0.3);
  const easy = clamp((0.34 - hard) / 0.26, 0, 1);
  // (a week that did any yoga grows at least its groves)
  const cover = Math.max(clamp((yoga / 150) * 0.75 + easy * 0.45, 0, 1), calm.length ? 0.12 : 0);
  if (cover < 0.1) return null;
  const warmth = clamp(num(features.warmth, 0.5), 0, 1);
  const kind = warmth < 0.36 ? 0 : warmth > 0.8 ? 2 : 1;
  return {
    calm, cover, kind, warmth,
    // how close the woods stand: a few hours of yoga is a forest; a little is a
    // grove, smaller (cover) but never thin
    dense: 0.55 + 0.45 * clamp(yoga / 240, 0, 1),
    why: `${Math.round(yoga)} min of yoga, ${Math.round(hard * 100)}% hard → ${Math.round(cover * 100)}% of the valleys wooded with ${KINDS[kind]}`,
  };
}

// ---- the ground it grows on --------------------------------------------------

// a small 3D value noise for the bake (the shaders keep the house's own)
function hash3(x, y, z, s) {
  let h = Math.imul(x, 0x8da6b343) ^ Math.imul(y, 0xd8163841) ^ Math.imul(z, 0xcb1ab31f) ^ Math.imul(s, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
function vnoise(x, y, z, s) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  const c = (a, b, d) => hash3(ix + a, iy + b, iz + d, s);
  const x00 = c(0, 0, 0) + (c(1, 0, 0) - c(0, 0, 0)) * ux, x10 = c(0, 1, 0) + (c(1, 1, 0) - c(0, 1, 0)) * ux;
  const x01 = c(0, 0, 1) + (c(1, 0, 1) - c(0, 0, 1)) * ux, x11 = c(0, 1, 1) + (c(1, 1, 1) - c(0, 1, 1)) * ux;
  const y0 = x00 + (x10 - x00) * uy, y1 = x01 + (x11 - x01) * uy;
  return y0 + (y1 - y0) * uz;
}

/** Box-blur a lon×lat grid in place: `rx(y)` texels across (wrapping), `ry` down. */
function boxBlur(src, NX, NY, rx, ry) {
  const tmp = new Float32Array(src.length);
  for (let y = 0; y < NY; y++) {
    const r = rx(y), n = 2 * r + 1, o = y * NX;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[o + ((k % NX) + NX) % NX];
    for (let x = 0; x < NX; x++) {
      tmp[o + x] = acc / n;
      acc += src[o + (x + r + 1) % NX] - src[o + ((x - r) % NX + NX) % NX];
    }
  }
  for (let x = 0; x < NX; x++) {
    for (let y = 0; y < NY; y++) {
      let acc = 0, n = 0;
      for (let k = Math.max(0, y - ry); k <= Math.min(NY - 1, y + ry); k++) { acc += tmp[k * NX + x]; n++; }
      src[y * NX + x] = acc / n;
    }
  }
}

/**
 * The woods' field over the survey's own chart: where the canopy stands
 * (above 0) and how far in. The hollows fill first, then the stands the
 * noise gives; the shore, the heights, the week's own places and its routes
 * are kept open. Returns the texture (the field, the stand's breadth, the
 * great stand) and a CPU reader of the same field.
 */
function bakeField(T, { features, survey, R, read, subject }) {
  const img = survey.land.image;
  const NX = img.width, NY = img.height, N = NX * NY;
  const from = T.DataUtils.fromHalfFloat;
  const land = new Float32Array(N);
  for (let i = 0; i < N; i++) land[i] = from(img.data[i]);
  const dirs = new Float32Array(N * 3);
  for (let y = 0; y < NY; y++) {
    const lat = Math.PI * (0.5 - (y + 0.5) / NY), cy = Math.sin(lat), cr = Math.cos(lat);
    for (let x = 0; x < NX; x++) {
      const lon = TAU * ((x + 0.5) / NX - 0.5), i = (y * NX + x) * 3;
      dirs[i] = cr * Math.cos(lon); dirs[i + 1] = cy; dirs[i + 2] = cr * Math.sin(lon);
    }
  }
  // stamp a disc of `units` round a direction: fn(texel, distance in units)
  const stamp = (d, units, fn) => {
    const v = d.clone().normalize();
    const lat = Math.asin(clamp(v.y, -1, 1)), lon = Math.atan2(v.z, v.x);
    const a = units / R;
    const y0 = Math.max(0, Math.floor((0.5 - (lat + a) / Math.PI) * NY)), y1 = Math.min(NY - 1, Math.ceil((0.5 - (lat - a) / Math.PI) * NY));
    const wide = Math.abs(lat) + a >= Math.PI / 2 - 1e-3 ? Math.PI : a / Math.max(Math.cos(Math.abs(lat) + a), 0.02);
    const xs = Math.floor(((lon - wide) / TAU + 0.5) * NX), xe = Math.ceil(((lon + wide) / TAU + 0.5) * NX);
    const ca = Math.cos(a);
    for (let y = y0; y <= y1; y++) {
      for (let xx = Math.max(xs, xe - NX + 1); xx <= xe; xx++) {
        const i = y * NX + ((xx % NX) + NX) % NX, j = i * 3;
        const c = dirs[j] * v.x + dirs[j + 1] * v.y + dirs[j + 2] * v.z;
        if (c >= ca) fn(i, Math.acos(Math.min(1, c)) * R);
      }
    }
  };
  // the hollows: the ground's own height against its country's, at two
  // reaches, so a valley's floor fills and so does a dell in it
  const texel = (TAU * R) / NX;
  const hollowAt = (rUnits) => {
    const low = new Float32Array(N);
    for (let i = 0; i < N; i++) low[i] = Math.max(land[i], 0);
    const rx = (y) => clamp(Math.round(rUnits / (texel * Math.max(Math.cos(Math.PI * (0.5 - (y + 0.5) / NY)), 0.12))), 1, NX >> 3);
    const ry = Math.max(1, Math.round(rUnits / texel));
    boxBlur(low, NX, NY, rx, ry);
    boxBlur(low, NX, NY, rx, ry);
    let s2 = 0, n = 0;
    for (let i = 0; i < N; i++) {
      low[i] -= land[i];
      if (land[i] >= 0.2) { s2 += low[i] * low[i]; n++; }
    }
    const sd = Math.sqrt(s2 / Math.max(n, 1)) || 1;
    for (let i = 0; i < N; i++) low[i] /= sd;
    return low;
  };
  const near = hollowAt(6), wide = hollowAt(16);
  // the lowland: the woods keep below the ground's middle height and thin out
  // above it, so their edge runs with the contours the ground is painted in
  // and they deepen its low green band rather than standing on the pale
  const dryH = [];
  for (let i = 0; i < N; i += 5) if (land[i] >= 0.2) dryH.push(land[i]);
  dryH.sort((a, b) => a - b);
  const hMid = dryH.length ? dryH[dryH.length >> 1] : 1;
  const hSpread = dryH.length ? Math.max(0.3, dryH[Math.floor(dryH.length * 0.84)] - hMid) : 1;
  const warmth = clamp(num(features.warmth, 0.5), 0, 1);
  // the treeline: no wood above it (lower on a cold week)
  const top = hMid + hSpread * (1.2 + 1.6 * warmth);
  const seed = read.seed;
  const score = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const h = land[i];
    if (h < 0.2) { score[i] = -9; continue; }
    const j = i * 3, x = dirs[j] * 4.6, y = dirs[j + 1] * 4.6, z = dirs[j + 2] * 4.6;
    const n = vnoise(x, y, z, seed) * 0.6 + vnoise(x * 2.4, y * 2.4, z * 2.4, seed + 1) * 0.4 - 0.5;
    score[i] = 0.45 * near[i] + 0.55 * wide[i] - 1.4 * (h - hMid) / hSpread + 2.6 * n
      - 1.5 * Math.max(0, h - top) - (h < 0.4 ? 0.8 : 0);
  }
  // thickest round the week's stilled places: the yoga's own groves, so a
  // landing there stands in the woods it planted (the place itself is kept open)
  for (const f of read.calm) {
    const w = clamp(num(f.stats?.activeS, 600) / 1800, 0.4, 1);
    stamp(f.dir, 42, (i, u) => { score[i] += 3.2 * w * Math.sqrt(1 - u / 42); });
  }
  // the threshold that woods the week's share of the dry ground
  const dry = [];
  for (let i = 0; i < N; i += 3) if (score[i] > -9) dry.push(score[i]);
  dry.sort((a, b) => a - b);
  const share = 0.08 + 0.3 * read.cover;
  const thr = dry.length ? dry[clamp(Math.floor((1 - share) * dry.length), 0, dry.length - 1)] : 0;
  let sd = 0;
  for (const v of dry) sd += (v - thr) * (v - thr);
  sd = Math.sqrt(sd / Math.max(dry.length, 1)) || 1;
  const field = new Float32Array(N);
  for (let i = 0; i < N; i++) field[i] = clamp(((score[i] - thr) / sd) * 1.6, -2, 2);
  // and round each place the week did yoga a grove of its own, whatever the
  // ground there, reaching as far out as the session was long
  for (const f of read.calm) {
    const w = clamp(num(f.stats?.activeS, 600) / 2700, 0.3, 1), reach = 18 + 22 * w;
    stamp(f.dir, reach, (i, u) => { if (land[i] >= 0.4) field[i] = Math.max(field[i], 1.4 * w * Math.min(1, (reach - u) / 8)); });
  }
  // kept open: the week's places (and the eye's own ground about them), its
  // routes and its lagoons
  // (a yoga place only round its ring of stones: the woods stand where its pines did)
  for (const f of features.list || []) {
    const r = f.kind === 'calm' ? 3.2 : 7;
    stamp(f.dir, r, (i, u) => { field[i] = Math.min(field[i], (u - r) * 0.25 - 0.1); });
  }
  for (const r of features.routes || []) {
    const seg = r.seg || [];
    const p = new T.Vector3();
    for (let k = 0; k + 2 < seg.length; k += 6) {
      p.set(seg[k], seg[k + 1], seg[k + 2]);
      stamp(p, 3.2, (i, u) => { field[i] = Math.min(field[i], (u - 3.2) * 0.3 - 0.1); });
    }
  }
  for (const b of features.lagoons || []) stamp(b.dir, b.radius + 4, (i) => { field[i] = Math.min(field[i], -0.5); });
  // how much wood stands round a point, a stand's breadth across: a great
  // stand keeps its found edge from orbit, a small one is lost into the ground
  const mass = new Float32Array(N);
  for (let i = 0; i < N; i++) mass[i] = field[i] > 0 ? 1 : 0;
  const rM = (y) => clamp(Math.round(9 / (texel * Math.max(Math.cos(Math.PI * (0.5 - (y + 0.5) / NY)), 0.12))), 1, NX >> 3);
  boxBlur(mass, NX, NY, rM, Math.max(1, Math.round(9 / texel)));
  // the week's great stand: the one wood, of all of them, that is the largest
  // on the face the poster turns to (life.js's subject), found whole
  const comp = new Int32Array(N).fill(-1);
  const stack = [];
  let great = -1, greatW = 0;
  for (let i0 = 0; i0 < N; i0++) {
    if (field[i0] <= 0 || comp[i0] >= 0) continue;
    let a = 0, cx = 0, cy = 0, cz = 0;
    comp[i0] = i0;
    stack.push(i0);
    while (stack.length) {
      const i = stack.pop(), y = Math.floor(i / NX), x = i - y * NX;
      const w = Math.cos(Math.PI * (0.5 - (y + 0.5) / NY));
      a += w; cx += dirs[i * 3] * w; cy += dirs[i * 3 + 1] * w; cz += dirs[i * 3 + 2] * w;
      for (const j of [y * NX + (x + 1) % NX, y * NX + (x + NX - 1) % NX, y > 0 ? i - NX : -1, y < NY - 1 ? i + NX : -1]) {
        if (j >= 0 && field[j] > 0 && comp[j] < 0) { comp[j] = i0; stack.push(j); }
      }
    }
    const face = (cx * subject.x + cy * subject.y + cz * subject.z) / (Math.hypot(cx, cy, cz) || 1);
    // (its breadth as the poster sees it: a stand near the limb is foreshortened away)
    const w = a * clamp((face - 0.35) / 0.6, 0, 1) ** 2;
    if (w > greatW) { greatW = w; great = i0; }
  }
  const own = new Float32Array(N);
  for (let i = 0; i < N; i++) own[i] = great >= 0 && comp[i] === great ? 1 : 0;
  boxBlur(own, NX, NY, (y) => clamp(Math.round(2.5 / (texel * Math.max(Math.cos(Math.PI * (0.5 - (y + 0.5) / NY)), 0.12))), 1, NX >> 3), 2);
  const half = new Uint16Array(N * 4);
  for (let i = 0; i < N; i++) {
    half[i * 4] = T.DataUtils.toHalfFloat(field[i]);
    half[i * 4 + 1] = T.DataUtils.toHalfFloat(mass[i]);
    half[i * 4 + 2] = T.DataUtils.toHalfFloat(Math.min(1, own[i] * 1.6));
  }
  const tex = new T.DataTexture(half, NX, NY, T.RGBAFormat, T.HalfFloatType);
  tex.minFilter = T.LinearFilter;
  tex.magFilter = T.LinearFilter;
  tex.wrapS = T.RepeatWrapping;
  tex.wrapT = T.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  // the same field, bilinear, for the CPU
  const at = (d) => {
    const u = 0.5 + Math.atan2(d.z, d.x) / TAU, v = 0.5 - Math.asin(clamp(d.y / (d.length() || 1), -1, 1)) / Math.PI;
    const fx = u * NX - 0.5, fy = clamp(v * NY - 0.5, 0, NY - 1.001);
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const g = (x, y) => field[y * NX + ((x % NX) + NX) % NX];
    return (g(x0, y0) * (1 - tx) + g(x0 + 1, y0) * tx) * (1 - ty) + (g(x0, y0 + 1) * (1 - tx) + g(x0 + 1, y0 + 1) * tx) * ty;
  };
  // the share of dry ground the canopy holds, for the table
  let held = 0;
  for (let i = 0; i < N; i += 3) if (land[i] >= 0.2 && field[i] > 0) held++;
  return { tex, at, held: held / Math.max(1, dry.length), field, land, NX, NY };
}

// ---- from orbit: the glaze ---------------------------------------------------

const GLAZE_VERT = /* glsl */ `
varying vec3 vW;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  // brought forward along the line of sight (the house's ground-wash trick):
  // the glaze never fights the ground under it for depth
  vec3 toCam = cameraPosition - wp.xyz;
  float dist = length(toCam);
  wp.xyz += toCam / max(dist, 1e-4) * (0.05 + 0.0025 * dist);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

// A glaze: what is drawn here is a multiplier the ground is laid under
// (premultiplied, so the blend is dst * mix(1, tint, a)) — the canopy keeps the
// light the ground was painted with, and a wood on a shaded slope is darker.
const GLAZE_FRAG = /* glsl */ `
uniform sampler2D tForest;
uniform vec3 uLight, uTint, uTintLit, uTintDeep;
uniform float uOrbit, uFoot, uAmount, uCrown, uFogBase, uTerm;
varying vec3 vW;
${NOISE}
void main(){
  vec3 d = normalize(vW);
  vec3 SMG = texture2D(tForest, inkUV(d)).rgb;
  float S = SMG.r, M = SMG.g, G = SMG.b;         // how far into a wood, how great a stand, the great one
  // the great stand's edge wanders as a hand's would, never with the chart's
  // own squares: its field read a few units off along a slow drift, and only
  // a little pushed out by it (the ways kept open stay open)
  if (G > 0.01) {
    vec3 wv = vec3(inkN3(d * 11.0 + 1.3), inkN3(d * 11.0 + 7.1), inkN3(d * 11.0 + 3.7)) - 0.5;
    float Sw = texture2D(tForest, inkUV(normalize(d + wv * 0.2))).r;
    S = mix(S, min(Sw, S + 0.3), smoothstep(0.0, 0.4, G));
  }
  if (S < -0.6) discard;
  vec3 V = normalize(cameraPosition - vW);
  float dist = distance(cameraPosition, vW);
  float face = abs(dot(d, V));
  float fp = max(1e-4, length(fwidth(vW)));      // the world size of a pixel here
  // the crowns: the nearest on a jittered lattice a crown across
  vec3 p = vW / uCrown;
  vec3 ip = floor(p);
  float F1 = 9.0, F2 = 9.0;
  vec3 o1 = vec3(0.0);
  float id1 = 0.0;
  for (int k = 0; k < 27; k++) {
    vec3 g = vec3(float(k - (k / 3) * 3), float((k / 3) - (k / 9) * 3), float(k / 9)) - 1.0;
    vec3 c = ip + g;
    vec3 jit = vec3(inkH13(c), inkH13(c + 17.31), inkH13(c + 41.7));
    vec3 o = p - (c + 0.15 + 0.7 * jit);
    float r = length(o) / (0.78 + 0.44 * jit.x);   // no two crowns of a size
    if (r < F1) { F2 = F1; F1 = r; o1 = o; id1 = jit.y; }
    else if (r < F2) F2 = r;
  }
  // a broad wood's crowns gathered in clumps, each just big enough to be
  // painted from orbit (the great stand's most of all); a small one keeps none
  float found = max(smoothstep(0.0, 0.35, G), 0.9 * smoothstep(0.22, 0.55, M));
  float C1 = 9.0, C2 = 9.0;
  vec3 oc = vec3(0.0);
  if (found > 0.01) {
    vec3 pc = vW / (uCrown * 1.6);
    vec3 ic = floor(pc);
    for (int k = 0; k < 27; k++) {
      vec3 g = vec3(float(k - (k / 3) * 3), float((k / 3) - (k / 9) * 3), float(k / 9)) - 1.0;
      vec3 c = ic + g;
      vec3 jit = vec3(inkH13(c + 3.1), inkH13(c + 23.7), inkH13(c + 57.3));
      vec3 o = pc - (c + 0.15 + 0.7 * jit);
      float r = length(o) / (0.6 + 0.8 * jit.x);   // no two clumps of a size
      if (r < C1) { C2 = C1; C1 = r; oc = o; }
      else if (r < C2) C2 = r;
    }
  }
  float clump = 1.0 - smoothstep(0.25, 1.0, C1);
  // the stand's edge: it wanders with the hand. The great stand's is found
  // all round, a hard line the hand's wander breaks into bays and tongues,
  // its clumps only fraying it; every other wood is lost into the ground's
  // own wash over a long reach, wet into wet — it thins out of the ground,
  // never sits on it as an island, and stays quiet. The dial thins the woods
  // from their edges in
  float crown = 1.0 - smoothstep(0.2, 0.9, F1);
  float slow = (inkF3(d * 19.0 + 5.0) - 0.5) * 0.7;
  float wob = slow + (inkN3(d * 80.0 + 2.0) - 0.5) * 0.18;
  float dial = (1.0 - uAmount) * 2.4;
  float field = S + wob * (1.0 + 0.4 * found) + mix(0.1 * (crown - 0.5), 0.2 * (clump - 0.4), found) - dial;
  float fw = max(fwidth(field), 1e-4);
  float A = mix(smoothstep(0.0, 1.8, S + 0.3 * slow - dial), smoothstep(-fw, fw, field), found);
  // just inside a found edge, where the pigment pooled and dried
  float edgeIn = (1.0 - smoothstep(fw, fw * 3.5, field)) * found;
  // and a small stand is a lighter glaze than a broad one, a speck of one
  // none; the great one is laid thinner, its ground showing through it, and
  // full along its edge
  A *= mix(mix(0.9 * smoothstep(0.15, 0.45, M), mix(0.85, 1.0, edgeIn), found), mix(0.75, 1.0, edgeIn), G);
  if (A <= 0.0) discard;
  vec3 L = normalize(uLight);
  vec3 sunT = L - d * dot(L, d);
  float sunUp = step(0.0, dot(L, d));
  vec3 ot = o1 - d * dot(o1, d);
  float side = dot(ot, sunT) / max(length(ot) * length(sunT), 1e-4);
  // a crown's size on the sheet: only big enough to be painted one by one
  // does a crown stand out of the canopy
  float detail = smoothstep(6.0, 14.0, uCrown / fp);
  // a wood is not one tone: stands of an age, broad and soft
  float stand = inkF3(d * 14.0 + 11.0);
  vec3 tint = mix(uTint, uTintDeep, smoothstep(0.5, 0.78, stand) * 0.3 + 0.1 * G);
  // here and there a crown stands out of the canopy: lit on the side the
  // light is on, in its own shade on the other
  float tall = step(0.7, id1) * (1.0 - smoothstep(0.4, 0.85, F1));
  tint = mix(tint, uTintLit, smoothstep(0.0, 0.45, side) * tall * sunUp * 0.6 * detail);
  tint = mix(tint, uTintDeep, smoothstep(0.05, 0.5, -side) * tall * sunUp * 0.35 * detail);
  // the great stand's clumps: a little lit on the side the light is on, a
  // little in their own shade on the other, and darker in a gap here and
  // there between them — a quiet texture the ground's own light shows through
  vec3 oct = oc - d * dot(oc, d);
  float cs = dot(oct, sunT) / max(length(oct) * length(sunT), 1e-4);
  float cdetail = found * smoothstep(3.0, 7.0, uCrown * 1.6 / fp);
  float seam = (1.0 - smoothstep(0.0, 0.14, C2 - C1)) * step(0.5, inkN3(d * 60.0 + 7.0));
  tint = mix(tint, uTintLit, smoothstep(-0.1, 0.45, cs) * smoothstep(0.1, 0.6, clump) * sunUp * 0.6 * cdetail);
  tint = mix(tint, uTintDeep, max(smoothstep(0.15, 0.6, -cs) * 0.45, seam * 0.5) * cdetail);
  // the pigment dried a little darker just inside a found edge
  tint = mix(tint, uTintDeep, A * edgeIn * 0.3);
  // from orbit the limb is the ground's own business; underfoot only the far
  // hills keep the glaze (the near ones are the giants'), and the air between
  // takes it back
  float hold = smoothstep(0.05, 0.3, face);
  float span = mix(130.0, 330.0, step(100.0, uFogBase));
  float air = smoothstep(uFogBase, uFogBase + span, dist) * 0.92;
  float far = smoothstep(45.0, 110.0, dist) * (1.0 - air);
  float a = A * max(uOrbit * hold, uFoot * far);
  // under a real sun the wood goes into the dark with the ground it stands on
  // (light.terminator): the night side keeps its own flat wash
  a *= 1.0 - uTerm * (1.0 - smoothstep(0.0, 0.22, dot(d, L)));
  if (a < 0.004) discard;
  gl_FragColor = vec4(tint * a, a);
}
`;

// ---- underfoot: the ancients ---------------------------------------------------

// A great tree on its own sheet, turned to the eye about its own up, the root
// on the ground. The sheet is in units with the root at 0.
const TREE_VERT = /* glsl */ `
uniform vec4 uBox;          // the sheet: x from, x to, y from, y to
uniform vec3 uSun;
uniform float uLean, uShow;
varying vec2 vQ;
varying float vSide, vDist;
void main(){
  vec3 O = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 up = normalize(O);
  vec3 ax = cross(up, cameraPosition - O);
  ax = length(ax) > 1e-3 ? normalize(ax) : normalize(cross(up, vec3(1.0, 0.0, 0.0)));
  vec2 q = vec2(mix(uBox.x, uBox.y, position.x + 0.5), mix(uBox.z, uBox.w, position.y + 0.5));
  vQ = q;
  vSide = dot(uSun, ax);
  vDist = distance(cameraPosition, O);
  vec3 world = O + ax * (q.x + uLean * max(q.y, 0.0)) + up * q.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  if (uShow <= 0.001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

// The foliage is pads laid back to front, each a flat-bottomed mass with leaf
// masses heaped along its top, every one of them a low dome: the light is read
// off whichever dome stands highest at a point, so a pad is lit on the tops of
// its masses on the sun's side and dark in the creases and underneath. Three
// flat washes on hard wandering edges, the dried rim along the shade, paper
// where the brush broke on the lit edge; the back pads are the crown's own
// shade. Then the wood behind, and the air between. The great tree is painted
// with it live (TREE_FRAG), the woods' trees once into their sheet (BAKE_FRAG).
const TREE_HEAD = /* glsl */ `
uniform vec4 uPad[${PADS}];     // centre x, y; across, up
uniform vec4 uPadB[${PADS}];    // underside (share of up), leafiness, tilt, layer (0 back … 1 front)
uniform vec4 uPadC[${PADS}];    // where its leaf masses sit along its top (radians; below -1 is none)
uniform vec4 uLimb[${LIMBS}];   // from x, y; to x, y
uniform vec4 uLimbW[${LIMBS}];  // width from, width to, dead, -
uniform vec4 uTrunk;            // x at the root, half-width there, x at the top, top
uniform vec4 uTrunkB;           // half-width at the top, the root's flare, bend, -
uniform vec4 uCrown;            // the crown's box: centre x, y; half across, half up
uniform float uPadN, uLimbN, uH, uSeed;
varying vec2 vQ;
${NOISE}
// a pad: its distance (units, the union of its masses), where in it q is
// (-1 … 1 across and up), and the normal of the mass standing highest at q
float padD(vec2 q, vec4 P, vec4 B, vec4 C, float k, float brk, out vec2 lp, out vec3 nrm){
  vec2 p = q - P.xy;
  float c = cos(B.z), s = sin(B.z);
  p = vec2(c * p.x + s * p.y, -s * p.x + c * p.y);
  float ry = p.y > 0.0 ? P.w : P.w * B.x;              // flat underneath
  lp = p / vec2(P.z, ry);
  float r2 = dot(lp, lp);
  float m = min(P.z, P.w);
  float d = (sqrt(r2) - 1.0) * min(P.z, ry);
  float top = sqrt(max(1.0 - r2, 0.0)) * m;
  nrm = normalize(vec3(lp.x * 0.7, lp.y, sqrt(max(1.0 - r2, 0.0)) + 0.1));
  for (int j = 0; j < 4; j++) {
    float a = C[j];
    if (a < -1.0) continue;
    float h = inkH12(vec2(k * 7.0 + float(j), uSeed));
    float lr = m * (0.42 + 0.4 * h);
    vec2 lq = p - vec2(cos(a) * P.z, sin(a) * P.w) * (0.9 - 0.2 * h) + vec2(0.0, lr * 0.15);
    float rl2 = dot(lq, lq) / (lr * lr);
    d = min(d, (sqrt(rl2) - 1.0) * lr);
    float lh = sqrt(max(1.0 - rl2, 0.0)) * lr * 0.8 + 0.5 * m;
    if (lh > top && rl2 < 1.0) { top = lh; nrm = normalize(vec3(lq / lr, sqrt(max(1.0 - rl2, 0.0)) + 0.1)); }
  }
  // the leaves break the edge
  return d + brk * 0.16 * m * min(B.y, 1.4);
}
// The light on the leaves: first the whole crown's — high and on the sun's
// side, its underside and its far side in shade — then each pad's own and its
// masses' tops, on an edge the hand wanders: so the low pads take only a
// little of it, and the crown is one form, never a stack of lit shelves. A
// leafier pad (past 1) is a softer mass: its heaps lift the light less, the
// light on it breaks into clumps of needles, and its edges are barely drawn
float lightOf(float sun, float sideK, vec2 q, vec2 hp, vec3 hn, float layer, float soft, float wob, float grain){
  vec3 Ld = normalize(vec3(0.62 * sun * sideK, 0.78, 0.42));
  float kD = 0.45 * (1.0 - 0.65 * soft);
  vec2 gc = clamp((q - uCrown.xy) / max(uCrown.zw, vec2(1e-3)), -1.0, 1.0);
  float whole = 0.36 + 0.34 * gc.y + 0.3 * sun * gc.x * sideK;
  float own = 0.42 + 0.42 * hp.y + 0.3 * sun * hp.x * sideK;
  return (1.0 - kD) * mix(own, whole, 0.55) + kD * dot(hn, Ld) - (1.0 - layer) * 0.24
       + grain * (wob * 0.4 + (inkN2(q * (9.0 / uH) + uSeed) - 0.5) * 0.18 + soft * (inkF2(q * (11.0 / uH) + uSeed * 1.7) - 0.5) * 0.36);
}
`;

// The tree's shape at q (its units): the crown's distance dU and what of it is
// seen there (hd, hn, hp, layer, soft, under), the wood's dW (across it, dead),
// and how much of each covers the pixel (leaf, wood).
const TREE_SHAPE = /* glsl */ `
  float H = uH;
  float wob = inkF2(q * (3.0 / H) + uSeed) - 0.5;
  float brk = inkN2(q * (24.0 / H) + uSeed) - 0.5 + (inkN2(q * (90.0 / H) - uSeed) - 0.5) * 0.35;
  // ---- the foliage, back to front: the last pad over a point is the one seen
  float dU = 1e3, hd = 1e3, hit = -1.0, under = 0.0, layer = 0.0, soft = 0.0, nLayer = 0.0;
  vec3 hn = vec3(0.0, 0.0, 1.0), nN = hn;
  vec2 hp = vec2(0.0), nP = hp;
  for (int i = 0; i < ${PADS}; i++) {
    if (float(i) >= uPadN) break;
    vec3 n;
    vec2 lp;
    float d = padD(q, uPad[i], uPadB[i], uPadC[i], float(i), brk, lp, n);
    // the nearest pad: how soft the crown is here, and what its own edge is
    if (d < dU) { soft = clamp((uPadB[i].y - 1.0) * 1.5, 0.0, 1.0); nLayer = uPadB[i].w; nP = lp; nN = n; }
    dU = min(dU, d);
    if (d < 0.0) { under = hit >= 0.0 ? 1.0 : under; hit = float(i); hd = d; hn = n; hp = lp; layer = uPadB[i].w; }
  }
  // just outside a soft crown the brush's last hair is still that pad's own
  // colour, never the dark of the crown's inside
  if (hit < 0.0 && soft > 0.0) { layer = nLayer; hp = nP / max(1.0, length(nP)); hn = nN; hd = dU; }
  float fw = max(fwidth(dU), 1e-4);
  float leaf = 1.0 - inkPixel(dU, fw);
  // ---- the wood: the trunk with its root flare, and the limbs
  float yt = clamp(q.y / uTrunk.w, 0.0, 1.0);
  float tx = mix(uTrunk.x, uTrunk.z, yt) + uTrunkB.z * sin(yt * 3.1416) * H * 0.04 + (inkN2(vec2(yt * 3.0, uSeed)) - 0.5) * 0.02 * H;
  float tw = mix(uTrunk.y, uTrunkB.x, pow(yt, 0.7)) * (0.9 + 0.2 * inkN2(vec2(yt * 9.0, uSeed + 3.0)))
           + uTrunkB.y * exp(-max(q.y, 0.0) / (0.035 * H)) * (0.75 + 0.5 * inkN2(vec2(q.x * 0.9, uSeed)));
  float dW = max(abs(q.x - tx) - tw, max(q.y - uTrunk.w, -q.y - 0.015 * H));
  float across = (q.x - tx) / max(tw, 1e-3);
  float dead = 0.0;
  for (int i = 0; i < ${LIMBS}; i++) {
    if (float(i) >= uLimbN) break;
    vec4 l = uLimb[i];
    float d = inkSeg(q, l.xy, l.zw, uLimbW[i].x, uLimbW[i].y);
    if (d < dW) { dW = d; dead = uLimbW[i].z; vec2 ba = l.zw - l.xy; across = dot(q - l.xy, vec2(-ba.y, ba.x)) / max(length(ba), 1e-4) / max(uLimbW[i].x, 1e-3); }
  }
  float fwW = max(fwidth(dW), 1e-4);
  float wood = 1.0 - inkPixel(dW, fwW);
`;

const TREE_FRAG = /* glsl */ `
${TREE_HEAD}
uniform vec3 uLeafLit, uLeaf, uLeafDeep, uLeafBack, uWood, uWoodLit, uInk, uPaper, uFar, uMist, uBloom;
uniform float uFogBase, uShow, uBloomK;
varying float vSide, vDist;
void main(){
  vec2 q = vQ;
  float sun = vSide >= 0.0 ? 1.0 : -1.0;
  float sideK = smoothstep(0.0, 0.45, abs(vSide));
${TREE_SHAPE}
  // ---- the paint
  float Lk = lightOf(sun, sideK, q, hp, hn, layer, soft, wob, 1.0);
  float fl = max(fwidth(Lk), 1e-3);
  vec3 deep = mix(uLeafBack, uLeafDeep, layer);
  vec3 body = mix(mix(uLeafBack, uLeaf, 0.6), uLeaf, layer);
  vec3 c = mix(deep, body, inkPixel(Lk - 0.34, fl));
  float litW = inkPixel(Lk - 0.7, fl);
  c = mix(c, uLeafLit, litW * (0.45 + 0.55 * layer));
  // the pigment dried darker along a pad's edge in the shade; where a pad lies
  // over another its own edge is drawn
  float rim = inkPixel(hd + 1.6 * fw, fw);
  c = mix(c, mix(deep, uInk, 0.5), rim * (1.0 - inkPixel(Lk - 0.45, fl)) * (0.55 + 0.45 * under) * (1.0 - 0.9 * soft));
  // on the lit edge the brush breaks up and the paper shows
  float paper = rim * litW * step(0.12, brk);
  c = mix(c, mix(uLeafLit, uPaper, 0.55), paper * 0.75);
  // a fine broken contour on the crown's shaded side (barely, on a soft crown)
  float edge = (1.0 - inkPixel(-dU - 1.2 * fw, fw)) * step(0.3, inkN2(q * (40.0 / H) + uSeed * 2.0));
  c = mix(c, uInk, edge * (1.0 - litW) * 0.55 * (1.0 - 0.9 * soft));
  // in flower (a mild week's great tree): the blossom over the outer masses in
  // clusters, laid as its own wash where the light is and its cool in the
  // crown's shade
  if (uBloomK > 0.0) {
    float cl = inkN2(q * (26.0 / H) + uSeed * 1.3) * 0.7 + inkN2(q * (70.0 / H) - uSeed) * 0.3;
    float bloom = uBloomK * inkPixel(cl - 0.64 + 0.08 * litW, fl * 2.0) * smoothstep(0.3, 0.7, layer) * (0.25 + 0.75 * litW);
    c = mix(c, mix(mix(uBloom, uLeafDeep, 0.5), mix(uBloom, uLeafLit, 0.35), litW), bloom * 0.85);
  }
  // the wood: dark, the sun along one side, bark laid on in a dry brush
  float bark = inkN2(vec2(across * 1.3 + uSeed, q.y * (7.0 / H))) * 0.6 + inkN2(vec2(across * 3.0 - uSeed, q.y * (22.0 / H))) * 0.4;
  vec3 cw = mix(uWood, uWoodLit, step(0.25, sun * across) * sideK * (1.0 - 0.6 * dead));
  cw = mix(cw, mix(uWood, uInk, 0.5), step(0.62, bark) * 0.7);
  float a = max(leaf, wood);
  // the leaves over the wood, and over the sky only their own colour
  vec3 col = mix(cw, c, leaf / max(a, 1e-4));
  // the air between: a far tree goes into the glaze of the distance, its foot
  // first, lost in the pale where the ground meets the sky
  float span = mix(130.0, 330.0, step(100.0, uFogBase));
  float air = smoothstep(uFogBase, uFogBase + span, vDist) * 0.9;
  float lv = dot(col, vec3(0.32, 0.55, 0.13));
  col = mix(col, uFar * (0.80 + 0.32 * smoothstep(0.16, 0.94, lv)), air);
  float mist = smoothstep(uFogBase + 15.0, uFogBase + 90.0, vDist) * (1.0 - smoothstep(0.0, 0.4 * H, q.y));
  col = mix(col, uMist, mist * 0.55);
  a *= uShow;
  if (a < 0.02) discard;
  gl_FragColor = vec4(col, a);
}
`;

// ---- the woods' sheet: every kind of tree the week grows, painted once ---------

// One tree to a cell of the sheet, its box filling the cell.
const BAKE_VERT = /* glsl */ `
uniform vec4 uBox;
varying vec2 vQ;
void main(){
  vec2 p = position.xy + 0.5;
  vQ = vec2(mix(uBox.x, uBox.y, p.x), mix(uBox.z, uBox.w, p.y));
  gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
}
`;
// What the woods' shader needs to paint a tree from its cell: its light with
// the sun on its right (r) and on its left (g) — the front's is their mean —
// what it is (b: 0 leaves, 0.5 wood, 1 a birch's white bark) and its edge (a,
// a distance, 0.5 on it). The rims dried inside each mass's edge are laid in
// as shade; the wood is its shade or, on the sun's side, its light.
const BAKE_FRAG = /* glsl */ `
${TREE_HEAD}
uniform float uPale, uPx;
void main(){
  vec2 q = vQ;
${TREE_SHAPE}
  // (the woods' trees are seen near and large: less of the needle's grain is laid in the sheet)
  vec2 L = vec2(lightOf(1.0, 1.0, q, hp, hn, layer, soft, wob, 0.5), lightOf(-1.0, 1.0, q, hp, hn, layer, soft, wob, 0.5));
  float rim = inkPixel(hd + 1.6 * fw, fw) * (0.55 + 0.45 * under) * (1.0 - 0.9 * soft);
  L -= 0.4 * rim * (1.0 - step(0.45, L));
  float lit = 1.0 - 0.6 * dead;
  // the leaves over the wood; past the edge whichever is nearer
  bool isWood = leaf < 0.5 && (wood >= 0.5 || dW < dU);
  vec2 e = isWood ? 0.2 + 0.6 * lit * vec2(step(0.25, across), step(0.25, -across)) : clamp((L + 0.25) / 1.5, 0.0, 1.0);
  gl_FragColor = vec4(e, isWood ? 0.5 + 0.5 * uPale : 0.0, clamp(0.5 - min(dU, dW) / (12.0 * uPx), 0.0, 1.0));
}
`;

// ---- underfoot: the woods ------------------------------------------------------

// Each tree of the woods: its cell of the sheet turned to the eye about its own
// up, its foot on the ground and its crown swinging a little in the wind. What
// is not drawn: beyond the reach or under the world's edge, past the dial,
// round the eye and across its view of the runner, and in the glades a landing
// keeps (round the runner, round the great tree, and the way to it).
const WOODS_VERT = /* glsl */ `
attribute vec4 aFoot;      // the foot (world), the height
attribute vec4 aForm;      // its cell, its width (negative: drawn mirrored), a seed, its rank under the dial
attribute vec4 aTint;      // its leaves' own colour, how far it gives to the wind
uniform vec4 uBox[${CELLS}];  // each cell's tree, in heights: x from, x to, y from, y to
uniform vec4 uClear;       // the runner's ground at the landing, and the glade round it
uniform vec4 uGlade;       // the great tree's foot, and its glade
uniform vec4 uLane;        // where the eye landed, and the cosine the way to the great tree is kept open in
uniform vec3 uRunner, uSun;
uniform float uTime, uShow, uAmount, uOcc, uReach, uR;
varying vec2 vUv;
varying vec3 vTint;
varying float vSideK, vSunR, vBack, vDist, vRel, vFade;
void main(){
  vec3 O = aFoot.xyz;
  float H = aFoot.w;
  vec3 up = normalize(O);
  vec3 toC = cameraPosition - O;
  float dist = length(toC);
  int k = int(aForm.x + 0.5);
  vec4 box = uBox[k];
  float wide = abs(aForm.y);
  float rad = 0.3 * (box.y - box.x) * wide * H;           // what of it stands in the way
  float jag = 0.85 + 0.3 * fract(aForm.z * 7.13);
  bool off = uShow <= 0.001 || dist > uReach || aForm.w >= uAmount;
  vec3 d = O + up * H - cameraPosition;
  float t = clamp(-dot(cameraPosition, d) / max(dot(d, d), 1e-6), 0.0, 1.0);
  off = off || length(cameraPosition + d * t) < uOcc;
  // (the shrubs and ferns keep to a glade's edge and grow on in the way to the great tree)
  float low = k >= ${CELLS - 4} ? 1.0 : 0.0;
  off = off || distance(O, uClear.xyz) < uClear.w * jag * (1.0 - 0.4 * low) || distance(O, uGlade.xyz) < uGlade.w * jag * (1.0 - 0.5 * low);
  vec3 toO = O - uLane.xyz, toG = uGlade.xyz - uLane.xyz;
  off = off || (low < 0.5 && uLane.w > 0.0 && length(toO) < length(toG) && dot(normalize(toO), normalize(toG)) > uLane.w + 0.02 * (jag - 1.0));
  // round the eye, and across its view of the runner, a tree goes as the eye
  // nears it (a shrub or a fern only when it is right in the way)
  vec3 lev = toC - up * dot(toC, up);
  vec3 ab = uRunner - cameraPosition;
  vec3 s = O - cameraPosition - ab * clamp(dot(O - cameraPosition, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  float ls = length(s - up * dot(s, up)), ne = low > 0.5 ? 1.5 : 7.0 + 0.3 * rad, li = low > 0.5 ? 0.4 * rad + 0.3 : rad + 0.3;
  vFade = smoothstep(ne, ne + 1.2, length(lev)) * (low > 0.5 ? step(li, ls) : smoothstep(li, li + 1.2, ls));
  if (off || vFade < 0.01) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 ax = normalize(cross(up, toC));
  vec2 p = position.xy + 0.5;
  vec2 q = vec2(mix(box.x, box.y, p.x) * aForm.y, mix(box.z, box.w, p.y));
  // the wind: the crown swings, the foot stays
  float sw = sin(uTime * (0.7 + 0.5 * aForm.z) + aForm.z * 40.0) * 0.7 + sin(uTime * (1.9 + aForm.z) + aForm.z * 13.0) * 0.3;
  vec3 world = O + (ax * (q.x + sw * aTint.w * 0.012 * q.y * max(q.y, 0.0)) + up * q.y) * H;
  vUv = (vec2(float(k - (k / ${COLS}) * ${COLS}), float(k / ${COLS})) + p) / vec2(${COLS}.0, ${CELLS / COLS}.0);
  // the sun on the tree's own right as it was painted, or its left
  float side = dot(uSun, ax);
  vSunR = side * aForm.y;
  vSideK = smoothstep(0.0, 0.45, abs(side));
  vBack = smoothstep(0.0, 0.7, -dot(uSun, toC / dist));
  vTint = aTint.rgb;
  vDist = dist;
  vRel = length(world) - uR;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

// Three flat washes on edges found per pixel (the sheet keeps the light, not
// the colour, so an edge is never the sheet's own pixels blown up), the rim
// dried inside the silhouette on the shaded side or caught by a light from
// behind, the wood dark or a birch's white with its black marks; then the air
// the ground under it takes, so a far wood goes pale with its hill.
const WOODS_FRAG = /* glsl */ `
uniform sampler2D tAtlas;
uniform vec3 uInk, uShadeCool, uLitWarm, uPaper, uWood, uWoodLit, uBirch, uFar, uMist;
uniform float uShow, uFogBase, uAerial, uSeaR;
varying vec2 vUv;
varying vec3 vTint;
varying float vSideK, vSunR, vBack, vDist, vRel, vFade;
${NOISE}
void main(){
  vec4 g = texture2D(tAtlas, vUv);
  float fa = max(fwidth(g.a), 1e-4);
  float cov = clamp((g.a - 0.5) / fa + 0.5, 0.0, 1.0) * uShow * vFade;
  if (cov < 0.02) discard;
  float front = 0.5 * (g.r + g.g);
  float e = mix(front, vSunR >= 0.0 ? g.r : g.g, vSideK);
  // the leaves
  vec3 body = vTint;
  vec3 deep = mix(mix(body, uInk, 0.42), uShadeCool, 0.22);
  vec3 lit = mix(mix(body, uLitWarm, 0.4), uPaper, 0.1);
  // against the light a crown is one dark mass, its edge caught (below)
  float L = mix(e * 1.5 - 0.25, 0.22 + 0.3 * (front * 1.5 - 0.75), vBack);
  float fl = max(fwidth(L), 1e-3);
  vec3 c = mix(deep, body, inkPixel(L - 0.34, fl));
  float litW = inkPixel(L - 0.7, fl);
  c = mix(c, lit, litW * 0.8);
  float rim = 1.0 - clamp((g.a - 0.5 - 2.5 * fa) / fa + 0.5, 0.0, 1.0);
  c = mix(c, mix(deep, uInk, 0.5), rim * (1.0 - litW) * 0.5 * (1.0 - vBack));
  c = mix(c, mix(lit, body, 0.3), rim * vBack * 0.5);
  // the wood
  float pale = step(0.75, g.b);
  float wl = step(0.5, e) * (1.0 - step(0.5, vBack));
  vec3 cw = mix(mix(uWood, uWoodLit, wl), mix(uBirch * 0.8, uBirch, wl), pale);
  // a birch's black marks across it; the bark of the rest laid on in a dry brush
  float mark = step(0.7, inkN2(vec2(vUv.x * 110.0, vUv.y * 520.0)));
  float bark = step(0.62, inkN2(vec2(vUv.x * 300.0, vUv.y * 40.0)));
  cw = mix(cw, uInk, mix(bark * 0.35, mark * 0.8, pale));
  vec3 col = mix(c, cw, smoothstep(0.2, 0.35, g.b));
  // the air: the same as the ground's under it
  float span = mix(130.0, 330.0, step(100.0, uFogBase));
  float lv = dot(col, vec3(0.32, 0.55, 0.13));
  vec3 cool = uFar * (0.80 + 0.32 * smoothstep(0.16, 0.94, lv));
  vec3 cAir = mix(col, cool, smoothstep(uFogBase, uFogBase + span, vDist) * 0.92);
  float hz = sqrt(max(dot(cameraPosition, cameraPosition) - uSeaR * uSeaR, 1.0));
  float farT = 0.8 * smoothstep(uFogBase + 4.0, max(uFogBase + 24.0, 1.35 * hz), vDist);
  vec3 fit = mix(mix(col, vec3(lv), 0.40 * farT), cool, 0.82 * farT * farT);
  col = mix(cAir, fit, uAerial);
  float mist = mix(smoothstep(uFogBase + 15.0, uFogBase + 90.0, vDist), smoothstep(0.55 * hz, 1.5 * hz, vDist), uAerial)
             * (1.0 - smoothstep(1.5, 12.0, vRel));
  col = mix(col, uMist, mist * 0.45);
  gl_FragColor = vec4(col, cov);
}
`;

// A tree's shade on the ground: laid away from the sun from its foot, the
// crown's shadow broken where light comes through it. One flat value laid as
// a soft-edged wash, so shades lying over one another merge without a line.
const SHADE_VERT = /* glsl */ `
attribute vec4 aShade;    // along (0 at the foot … 1 at the far end), across (-1 … 1), seed, rank
varying vec4 vS;
varying float vDist;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 toCam = cameraPosition - wp.xyz;
  float dist = length(toCam);
  wp.xyz += toCam / max(dist, 1e-4) * (0.04 + 0.002 * dist);
  vS = aShade;
  vDist = dist;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const SHADE_FRAG = /* glsl */ `
uniform vec3 uInk;
uniform float uShow, uAmount, uFogBase;
varying vec4 vS;
varying float vDist;
${NOISE}
void main(){
  if (vS.w >= uAmount) discard;
  vec2 p = vS.xy;
  // the trunk's bar from the foot, then the crown's pool
  float trunk = abs(p.y) - 0.05 * (1.0 - 0.4 * p.x);
  float crown = length(vec2((p.x - 0.62) / 0.4, p.y)) - 1.0 + (inkN2(p * vec2(5.0, 4.0) + vS.z) - 0.5) * 0.35;
  float e = min(max(trunk, p.x - 0.4), crown);
  float holes = smoothstep(0.6, 0.74, inkN2(p * vec2(9.0, 7.0) + vS.z * 3.0)) * smoothstep(0.0, -0.2, e);
  // a soft-edged wash with no rim: nothing for the ink pass to find an edge
  // in, so pools lying over one another merge without lines
  float a = 1.0 - smoothstep(-0.22, 0.04, e);
  // (a woods tree's, its seed past 100, is a lighter glaze: they lie over one another)
  float wood = step(100.0, vS.z);
  a *= (0.32 - 0.16 * wood) * (1.0 - holes * 0.7);
  float span = mix(130.0, 330.0, step(100.0, uFogBase));
  a *= uShow * (1.0 - smoothstep(uFogBase, uFogBase + span, vDist) * 0.9);
  if (a < 0.01) discard;
  gl_FragColor = vec4(uInk, a);
}
`;

/**
 * One tree, as limbs and pads on its own sheet (units, root at 0). The
 * ancients are of the week's kind: a fir's drooping tiers to a spire, a
 * cedar's heavy plates on long limbs, a stone pine's soft clouds held high on
 * bent limbs, or a broadleaf's heaped dome; the woods add birches, shrubs and
 * ferns. Behind every crown a dark core: its inside, where the light never
 * gets. An old one keeps a dead limb.
 */
function growTree(kind, H, rng, old) {
  const r = () => rng();
  const pads = [], limbs = [];
  // a pad and the leaf masses heaped along its top (n of them, spread over its upper arc)
  const pad = (x, y, rx, ry, under, leafy, tilt, layer, n = 3) => {
    const lobes = [-9, -9, -9, -9];
    for (let k = 0; k < Math.min(n, 4); k++) lobes[k] = 0.35 + (Math.PI - 0.7) * (k + 0.5 + (r() - 0.5) * 0.7) / n;
    pads.push([x, y, rx, ry, under, leafy, tilt, layer, lobes]);
  };
  const limb = (ax, ay, bx, by, w0, w1, dead = 0) => limbs.push([ax, ay, bx, by, w0, w1, dead]);
  let W, trunk;
  const lean = (r() - 0.5) * 0.06;
  if (kind === 0) {
    // a fir: one straight stem, tiers drooping off it and turned up at the
    // tips, narrowing to a spire — longer downwind, a tier gone here and
    // there, a few dead stubs low on the stem
    W = H * (0.36 + 0.08 * r());
    trunk = { x0: 0, w0: 0.028 * H, x1: lean * H, y1: 0.97 * H, w1: 0.004 * H, flare: 0.035 * H, bend: (r() - 0.5) * 0.4 };
    pad(lean * H * 0.5, 0.55 * H, W * 0.11, 0.38 * H, 0.9, 1.0, 0, 0, 0);
    const wind = r() < 0.5 ? -1 : 1;
    const tiers = 8 + Math.floor(r() * 3);
    for (let i = 0; i < tiers; i++) {
      const t = (i + 0.45 * r()) / tiers;
      const y = H * (0.2 + 0.72 * t);
      const hw = (W / 2) * Math.pow(1 - t, 0.85) * (0.75 + 0.4 * r()) + 0.025 * H;
      const xc = lean * H * (y / H);
      for (const sgn of [-1, 1]) {
        if (r() < 0.16 && i > 0) continue;                      // a tier missing a side
        const reach = hw * (0.65 + 0.5 * r()) * (1 + 0.28 * wind * sgn);
        const droop = (0.015 + 0.04 * r()) * H;
        if (t < 0.4 && r() < 0.18) {
          // a dead stub: bare wood, broken short
          limb(xc, y, xc + sgn * reach * 0.45, y - droop * 0.5, 0.007 * H, 0.002 * H, 1);
          continue;
        }
        limb(xc, y + 0.01 * H, xc + sgn * reach * 0.85, y - droop, 0.008 * H, 0.002 * H);
        pad(xc + sgn * reach * 0.5, y - droop * 0.6, reach * 0.6, H * (0.024 + 0.02 * (1 - t)) * (0.75 + 0.5 * r()), 0.6, 1.0, sgn * -(0.08 + 0.25 * r()), i % 2 ? 0.35 + 0.25 * r() : 0.7 + 0.3 * r(), 1 + Math.floor(r() * 2));
      }
    }
    pad(lean * H * 0.96, 0.95 * H, 0.03 * H, 0.045 * H, 0.6, 0.4, 0, 1, 1);
  } else if (kind === 1) {
    // a cedar: a massive stem forking low into great limbs run out near
    // level, and on them its needles in broad tiers of rounded clumps: a wide
    // low tier, a lesser one over it and a flat top, each clump of its own
    // size and height. Each tier lies over the one under it by the stem and is
    // parted from it toward the rim by a dark gap, where a limb shows; the low
    // tiers in the high ones' shade
    W = H * (1.0 + 0.3 * r());
    const yF = H * (0.24 + 0.06 * r());
    trunk = { x0: 0, w0: 0.055 * H, x1: lean * H, y1: yF + 0.05 * H, w1: 0.034 * H, flare: 0.06 * H, bend: (r() - 0.5) * 0.9 };
    const fx = lean * H;
    const sA = r() < 0.5 ? -1 : 1;                       // the side the crown reaches furthest
    // the crown's dark inside, behind every tier
    pad(fx + sA * 0.06 * W, 0.6 * H, W * 0.32, 0.2 * H, 0.8, 1.25, 0, 0, 3);
    // the tiers, low to high: height, reach on the long side and the short,
    // depth; the oldest's low limb on the short side dead
    const tiers = [[0.42, 0.5, 0.34, 0.1], [0.61, 0.38, 0.3, 0.09], [0.8, 0.24, 0.2, 0.085]];
    tiers.forEach(([ty, far, near, dy], t) => {
      for (const side of [sA, -sA]) {
        const reach = W * (side === sA ? far : near) * (0.8 + 0.35 * r());
        const y = H * (ty + (side === sA ? 0 : 0.03 + 0.03 * r()) + (r() - 0.5) * 0.03);
        const w0 = 0.022 * H * (1 - 0.3 * t);
        if (old && t === 0 && side === -sA) {
          limb(fx, y - 0.1 * H, fx + side * reach * 0.5, y - 0.04 * H, w0, w0 * 0.5, 1);
          continue;
        }
        // the limb, near level and turned up at its end, hidden but by the stem
        if (t < 2) limb(fx, y - 0.11 * H, fx + side * reach * 0.75, y - 0.02 * H, w0, w0 * 0.45);
        // two clumps along it, the outer one lower and smaller, never of a size
        const ry = H * dy * (0.85 + 0.3 * r());
        pad(fx + side * reach * (0.3 + 0.08 * r()), y + ry * 0.2, ry * (1.7 + 0.4 * r()), ry, 0.5, 1.3, side * 0.03, 0.35 + 0.25 * t + 0.15 * r(), 3);
        pad(fx + side * reach * (0.72 + 0.1 * r()), y - ry * (0.15 + 0.2 * r()), ry * (1.4 + 0.4 * r()), ry * (0.8 + 0.2 * r()), 0.5, 1.3, side * 0.06, 0.3 + 0.25 * t + 0.2 * r(), 3);
      }
    });
    // the leader, lost in the flat top
    limb(fx, yF, fx + (r() - 0.5) * 0.06 * H, 0.74 * H, 0.026 * H, 0.012 * H);
    pad(fx + (r() - 0.5) * 0.1 * H, H * (0.89 + 0.03 * r()), H * (0.12 + 0.05 * r()), H * 0.075, 0.5, 1.3, (r() - 0.5) * 0.1, 1, 3);
  } else if (kind === 2) {
    // a stone pine: a tall stem forking high into a few short limbs, lost at
    // once in one broad umbrella of needles hung low over the fork: soft
    // clouds of it in two rows — the far row heaped higher over the stem, the
    // near one lower and over the limbs — overlapping across them, a spray
    // hung under the rim, and the crown's dark inside showing in a gap or two.
    // Only the stem and the stubs of the forks under the crown are bare, and
    // no two crowns are as deep
    W = H * (0.88 + 0.3 * r());
    const sA = r() < 0.5 ? -1 : 1;                       // the side the crown leans out over
    const yF = H * (0.4 + 0.08 * r());                   // the fork
    const tx = lean * H * 2;
    trunk = { x0: 0, w0: 0.036 * H, x1: tx, y1: yF + 0.03 * H, w1: 0.024 * H, flare: 0.035 * H, bend: (r() - 0.5) * 1.6 };
    const cx = tx + sA * W * (0.03 + 0.07 * r());
    const yB = yF + H * (0.045 + 0.025 * r());           // the crown's underside, just over the fork
    const deep = Math.min(H * (0.3 + 0.15 * r()), 0.99 * H - yB);
    // the limbs: up from the fork close together, bent once inside the crown
    // and spread out there, each lost in it
    for (const [f, w] of [[-0.75, 0.017], [0.05, 0.016], [0.65, 0.015]]) {
      const ex = cx + sA * f * W * 0.3, ey = yB + deep * (0.22 + 0.1 * r());
      const mx = tx + (ex - tx) * 0.3, my = yB + deep * 0.12;
      limb(tx, yF, mx, my, w * H, w * H * 0.8);
      limb(mx, my, ex, ey, w * H * 0.8, w * H * 0.5);
    }
    // the crown's dark inside, behind every cloud
    pad(cx, yB + deep * 0.45, W * 0.4, deep * 0.36, 0.8, 1.5, 0, 0, 3);
    // the clouds, row by row: heaped over the stem, sagging to the rim, no
    // two of a size or a height
    for (const [n, lift, spread, front] of [[4, 0.52, 0.34, 0], [4 + Math.floor(r() * 3), 0.18, 0.42, 1]]) {
      for (let k = 0; k < n; k++) {
        const u = -1 + (2 * (k + 0.5 + (r() - 0.5) * 0.5)) / n;
        const dome = 1 - u * u;
        pad(cx + u * W * spread, yB + deep * (lift + 0.3 * dome + (r() - 0.5) * 0.26), W * (0.14 + 0.06 * r()) * (1.1 - 0.3 * Math.abs(u)) * (5 / (n + 1)) ** 0.5,
          deep * (0.22 + 0.12 * r()), 0.75, 1.7, -u * (0.06 + 0.08 * r()), front ? 0.5 + 0.35 * dome + 0.15 * r() : 0.2 + 0.15 * r(), 3);
      }
    }
    // heaped over the middle, the crown's top
    pad(cx + (r() - 0.5) * 0.24 * W, yB + deep * (0.8 + 0.08 * r()), W * (0.15 + 0.05 * r()), deep * 0.22, 0.6, 1.7, (r() - 0.5) * 0.15, 0.45, 3);
    // a spray sagging under the rim, on its far side and now and then the other
    for (const side of [sA, -sA]) {
      if (side !== sA && r() < 0.6) continue;
      pad(cx + side * W * (0.34 + 0.06 * r()), yB + deep * (0.02 + 0.05 * r()), W * (0.09 + 0.04 * r()), deep * 0.15, 1, 1.9, -side * 0.2, 0.3, 2);
    }
  } else if (kind === 3) {
    // a broadleaf: a short stout bole forking into a few great limbs, lost in
    // one heaped dome of leaf masses — a dark inside, a back row heaped high
    // over the middle, a middle row, and a front row lower toward the rim and
    // nearer the eye; an old one spreads wider than it is tall
    W = H * (old ? 1.15 + 0.2 * r() : 0.74 + 0.28 * r());
    const yF = H * (old ? 0.22 + 0.05 * r() : 0.26 + 0.08 * r());
    const tx = lean * H;
    trunk = { x0: 0, w0: (old ? 0.06 : 0.042) * H, x1: tx, y1: yF + 0.04 * H, w1: 0.03 * H, flare: 0.045 * H, bend: (r() - 0.5) * 0.8 };
    const cx = tx + (r() - 0.5) * 0.08 * W;
    const yB = yF + H * (0.04 + 0.04 * r());
    const deep = H * (0.96 + 0.03 * r()) - yB;
    for (const f of [-0.85, -0.3, 0.3, 0.85]) {
      if (r() < 0.2) continue;
      limb(tx, yF, cx + f * W * 0.3, yB + deep * (0.18 + 0.2 * r()), 0.022 * H, 0.008 * H, old && f === -0.85 ? 1 : 0);
    }
    pad(cx, yB + deep * 0.46, W * 0.44, deep * 0.4, 0.8, 1.2, 0, 0, 3);
    for (const [n, lift, spread, l0] of [[4, 0.6, 0.34, 0.12], [5, 0.4, 0.42, 0.4], [4, 0.2, 0.36, 0.68]]) {
      for (let k = 0; k < n; k++) {
        const u = -1 + (2 * (k + 0.5 + (r() - 0.5) * 0.6)) / n;
        const dome = 1 - u * u;
        const rx = W * (0.15 + 0.07 * r()) * (1.05 - 0.25 * Math.abs(u));
        pad(cx + u * W * spread, yB + deep * (lift + 0.28 * dome + (r() - 0.5) * 0.12), rx, rx * (0.7 + 0.2 * r()) * Math.min(1.2, deep / (0.62 * W)),
          0.6, 0.9 + 0.1 * r(), -u * 0.12 * r(), l0 + 0.22 * r() + 0.12 * dome, 3 + (r() < 0.5 ? 1 : 0));
      }
    }
  } else if (kind === 4) {
    // a birch: a slim white stem with a little bend, its leaves in small loose
    // clouds up the top two thirds of it, never a closed crown
    W = H * (0.34 + 0.12 * r());
    const bend = (r() - 0.5) * 1.2, x1 = lean * H * 1.5, y1 = 0.95 * H;
    trunk = { x0: 0, w0: 0.016 * H, x1, y1, w1: 0.004 * H, flare: 0.012 * H, bend };
    const stem = (y) => x1 * (y / y1) + bend * Math.sin(Math.PI * y / y1) * 0.04 * H;
    const n = 7 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5 + (r() - 0.5) * 0.6) / n;
      const y = H * (0.36 + 0.56 * t);
      const sgn = k % 2 ? 1 : -1;
      const reach = W * (0.5 - 0.25 * t) * (0.6 + 0.6 * r());
      if (t < 0.8 && r() < 0.7) limb(stem(y - 0.04 * H), y - 0.04 * H, stem(y) + sgn * reach * 0.6, y + 0.02 * H, 0.005 * H, 0.002 * H);
      pad(stem(y) + sgn * reach * 0.45, y, reach * 0.55 + 0.03 * H, H * (0.05 + 0.02 * r()), 0.7, 1.7, sgn * -0.15, 0.3 + 0.7 * r(), 3);
    }
    pad(stem(0.93 * H), 0.93 * H, 0.07 * H, 0.06 * H, 0.7, 1.7, 0, 0.8, 2);
  } else if (kind === 5) {
    // a shrub: no stem to speak of, a low heap of leaf masses off the ground
    W = H * (1.25 + 0.4 * r());
    trunk = { x0: 0, w0: 0.03 * H, x1: 0, y1: 0.25 * H, w1: 0.02 * H, flare: 0, bend: 0 };
    pad(0, 0.42 * H, W * 0.42, 0.34 * H, 0.9, 1.2, 0, 0, 3);
    const n = 5 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const u = -1 + (2 * (k + 0.5 + (r() - 0.5) * 0.5)) / n;
      const dome = 1 - u * u;
      const rx = W * (0.17 + 0.07 * r());
      pad(u * W * 0.33, H * (0.3 + 0.38 * dome + (r() - 0.5) * 0.1), rx, H * (0.2 + 0.08 * r()), 0.55, 1.3, -u * 0.12, 0.2 + 0.5 * dome + 0.3 * r(), 3);
    }
  } else {
    // a fern: fronds arched out of one crown at the ground, the long ones
    // bowed over, each a narrow blade cut into leaflets along its top
    W = H * (1.6 + 0.4 * r());
    trunk = { x0: 0, w0: 0, x1: 0, y1: -1, w1: 0, flare: 0, bend: 0 };
    const n = 7 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const a = (-1 + (2 * (k + 0.5 + (r() - 0.5) * 0.5)) / n) * 1.25;   // from the upright
      const len = H * (0.75 + 0.35 * r()) * (1 - 0.25 * Math.abs(a));
      pad(Math.sin(a) * len * 0.5, Math.cos(a) * len * 0.45 + 0.02 * H, len * 0.5, H * (0.07 + 0.03 * r()), 0.8, 1.6, Math.PI / 2 - a, 0.2 + 0.8 * (1 - Math.abs(a) / 1.25) * r(), 4);
    }
  }
  pads.sort((a, b) => a[7] - b[7]);
  const xs = pads.map((p) => Math.abs(p[0]) + p[2] * 1.35);
  const halfW = Math.max(W * 0.6, ...xs, 0.1 * H);
  // the crown's own box, for the light the whole of it takes
  const x0 = Math.min(...pads.map((p) => p[0] - p[2])), x1 = Math.max(...pads.map((p) => p[0] + p[2]));
  const y0 = Math.min(...pads.map((p) => p[1] - p[3] * p[4])), y1 = Math.max(...pads.map((p) => p[1] + p[3]));
  const crown = [(x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2];
  const top = Math.max(1.08 * H, ...pads.map((p) => p[1] + p[3] * 1.5));
  return { pads: pads.slice(0, PADS), limbs: limbs.slice(0, LIMBS), trunk, crown, box: [-halfW, halfW, -0.03 * H, top] };
}

/** A grown tree's uniforms for TREE_HEAD, name → value. */
function shapeValues(T, shape) {
  const pad = shape.pads.map((p) => new T.Vector4(p[0], p[1], p[2], p[3]));
  const padB = shape.pads.map((p) => new T.Vector4(p[4], p[5], p[6], p[7]));
  const padC = shape.pads.map((p) => new T.Vector4(...p[8]));
  const limb = shape.limbs.map((l) => new T.Vector4(l[0], l[1], l[2], l[3]));
  const limbW = shape.limbs.map((l) => new T.Vector4(l[4], l[5], l[6], 0));
  while (pad.length < PADS) { pad.push(new T.Vector4()); padB.push(new T.Vector4()); padC.push(new T.Vector4(-9, -9, -9, -9)); }
  while (limb.length < LIMBS) { limb.push(new T.Vector4()); limbW.push(new T.Vector4()); }
  const tr = shape.trunk;
  return {
    uPad: pad, uPadB: padB, uPadC: padC, uLimb: limb, uLimbW: limbW,
    uPadN: shape.pads.length, uLimbN: shape.limbs.length,
    uTrunk: new T.Vector4(tr.x0, tr.w0, tr.x1, tr.y1),
    uTrunkB: new T.Vector4(tr.w1, tr.flare, tr.bend, 0),
    uCrown: new T.Vector4(...shape.crown),
  };
}
const uniformsOf = (values) => Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { value: v }]));

// ---- the woods' kinds --------------------------------------------------------

// growTree's kind, the height range (units; the runner is 1.8), how far it
// gives to the wind, and whether it stands in the way or is walked through
const WOOD = [
  { name: 'fir', kind: 0, h: [10, 17], flex: 0.6, tree: true },
  { name: 'cedar', kind: 1, h: [9, 14], flex: 0.6, tree: true },
  { name: 'stone pine', kind: 2, h: [9, 14], flex: 0.7, tree: true },
  { name: 'broadleaf', kind: 3, h: [8, 13], flex: 1.0, tree: true },
  { name: 'birch', kind: 4, h: [7, 11], flex: 1.5, tree: true },
  { name: 'shrub', kind: 5, h: [0.9, 1.9], flex: 0.4, tree: false },
  { name: 'fern', kind: 6, h: [0.6, 1.1], flex: 1.2, tree: false },
];

/** The trees' mix by the week's warmth: firs and birches on a cold week, broadleaves on a mild one, stone pines on a hot one. */
function mixOf(w) {
  const m = [
    0.08 + 0.9 * clamp(1 - w / 0.55, 0, 1),
    0.35 * clamp(1 - Math.abs(w - 0.72) / 0.22, 0, 1),
    0.85 * clamp((w - 0.62) / 0.3, 0, 1),
    0.1 + 0.9 * clamp(1 - Math.abs(w - 0.55) / 0.35, 0, 1),
    0.55 * clamp(1 - Math.abs(w - 0.32) / 0.3, 0, 1),
  ];
  const sum = m.reduce((a, b) => a + b, 0);
  return m.map((v) => v / sum);
}

/** The sheet's cells: the trees by the week's mix (every kind with a share at least one), two shrubs and two ferns. */
function cellsOf(read, rng) {
  const mix = mixOf(read.warmth), n = CELLS - 4;
  const kinds = [0, 1, 2, 3, 4].filter((s) => mix[s] >= 0.05);
  const counts = [0, 0, 0, 0, 0];
  for (const s of kinds) counts[s] = 1;
  for (let left = n - kinds.length; left > 0; left--) {
    // the next cell to the kind furthest under its share
    const s = kinds.reduce((a, b) => (mix[b] * n - counts[b] > mix[a] * n - counts[a] ? b : a));
    counts[s]++;
  }
  const species = [...counts.flatMap((c, s) => Array(c).fill(s)), 5, 5, 6, 6];
  return species.map((s) => ({ species: s, shape: growTree(WOOD[s].kind, 1, rng, false), seed: rng() * 40, pale: s === 4 ? 1 : 0 }));
}

/**
 * Every tree of the week's woods, planted once over the survey's chart where
 * the field says wood: in clumps with gaps between, of the kind the ground
 * there suits by the week's mix, tallest deep in a wood; shrubs along its
 * edge and ferns under it. None in the sea, on its shore or on a cliff.
 */
function plantWoods(T, { features, R, read, baked, cells, pal, MIX }) {
  const { field, land, NX, NY, at } = baked;
  const sea = num(features.seaLevel, 0), seed = read.seed, mix = mixOf(read.warmth);
  const byKind = WOOD.map((_, s) => cells.map((c, k) => (c.species === s ? k : -1)).filter((k) => k >= 0));
  const leaf = [
    MIX(MIX(pal.veg, pal.shadeCool, 0.3), pal.ink, 0.3),
    MIX(MIX(pal.veg, pal.teal, 0.35), pal.ink, 0.25),
    MIX(MIX(pal.veg, pal.sepia, 0.25), pal.ink, 0.22),
    MIX(MIX(pal.veg, pal.teal, 0.2), pal.ink, 0.12),
    MIX(MIX(pal.veg, pal.litWarm, 0.32), pal.landLow, 0.1),
    MIX(MIX(pal.veg, pal.teal, 0.3), pal.ink, 0.18),
    MIX(MIX(pal.veg, pal.litWarm, 0.2), pal.teal, 0.12),
  ];
  const MAX = 16000;
  const foot = new Float32Array(MAX * 4), form = new Float32Array(MAX * 4), tint = new Float32Array(MAX * 4);
  const half = new Float32Array(MAX), tree = new Uint8Array(MAX), per = WOOD.map(() => 0);
  const v = new T.Vector3(), e = new T.Vector3(), nn = new T.Vector3(), o = new T.Vector3();
  const texel = (TAU * R) / NX, row = (Math.PI * R) / NY;
  let n = 0;
  for (let y = 0; y < NY && n < MAX; y++) {
    const lat0 = Math.PI * (0.5 - (y + 0.5) / NY), cl = Math.cos(lat0), sl = Math.sin(lat0);
    const area = texel * Math.max(cl, 0.01) * row;
    for (let x = 0; x < NX && n < MAX; x++) {
      const i = y * NX + x, F0 = field[i];
      if (land[i] < 0.3 || F0 < -0.6) continue;
      const lon0 = TAU * ((x + 0.5) / NX - 0.5), cx = cl * Math.cos(lon0), cz = cl * Math.sin(lon0);
      // clumps with gaps between, and under them the shrubs at the edge and the ferns inside
      const clump = 0.3 + 1.4 * sstep(0.35, 0.68, vnoise(cx * 8.5, sl * 8.5, cz * 8.5, seed + 7));
      const lt = area * read.dense * 0.045 * sstep(-0.1, 0.5, F0) * clump;
      const lu = area * read.dense * (0.035 * sstep(-0.6, -0.1, F0) * (1 - sstep(0.2, 0.8, F0)) + 0.012 * sstep(0, 0.6, F0));
      const nt = Math.floor(lt + hash3(x, y, 1, seed)), nu = Math.floor(lu + hash3(x, y, 2, seed));
      for (let k = 0; k < nt + nu && n < MAX; k++) {
        const r = (salt) => hash3(x, y, 30 + k * 16 + salt, seed);
        const lon = TAU * ((x + r(14)) / NX - 0.5), lat = Math.PI * (0.5 - (y + r(15)) / NY);
        v.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
        const F = at(v), h = features.heightAt(v);
        if (h < sea + 0.6) continue;
        tangentFrame(T, v, e, nn);
        const he = features.heightAt(o.copy(v).addScaledVector(e, 1 / R).normalize());
        const hn = features.heightAt(o.copy(v).addScaledVector(nn, 1 / R).normalize());
        if (Math.hypot(he - h, hn - h) > 0.8) continue;
        let s = 5;
        if (k < nt) {
          // the stand's kind: the week's mix laid along a slow noise, so a kind
          // grows in stands and the rarer ones keep to their own corners
          let u = clamp(0.5 + (vnoise(v.x * 5, v.y * 5, v.z * 5, seed + 20) - 0.5) * 2.2 + (r(0) - 0.5) * 0.3, 0, 0.999);
          for (s = 0; s < 4 && u >= mix[s]; s++) u -= mix[s];
        } else if (r(5) < 0.4 + 0.3 * sstep(0, 0.6, F)) s = 6;
        if (!byKind[s].length) continue;
        const W = WOOD[s];
        const cell = byKind[s][Math.floor(r(6) * byKind[s].length)];
        const H = (W.h[0] + (W.h[1] - W.h[0]) * r(7) ** 0.8) * (W.tree ? 0.78 + 0.32 * sstep(0, 1.2, F) : 1);
        const wide = (0.88 + 0.24 * r(8)) * (r(9) < 0.5 ? -1 : 1);
        const lift = R + h - 0.08 - 0.015 * H;
        foot.set([v.x * lift, v.y * lift, v.z * lift, H], n * 4);
        form.set([cell, wide, r(10), r(11)], n * 4);
        // its leaves the kind's own colour, a little lighter or darker, and
        // warmer or cooler stand by stand
        const c = leaf[s], val = 0.9 + 0.18 * r(12), warm = 0.24 * (vnoise(v.x * 14, v.y * 14, v.z * 14, seed + 40) - 0.5);
        tint.set([clamp(c.r * val * (1 + warm), 0, 1), clamp(c.g * val, 0, 1), clamp(c.b * val * (1 - warm), 0, 1), W.flex * (0.8 + 0.4 * r(13))], n * 4);
        const box = cells[cell].shape.box;
        half[n] = 0.5 * (box[1] - box[0]) * Math.abs(wide) * H;
        tree[n] = W.tree ? 1 : 0;
        per[s]++;
        n++;
      }
    }
  }
  const trees = per.slice(0, 5).reduce((a, b) => a + b, 0);
  return {
    count: n, trees,
    foot: foot.slice(0, n * 4), form: form.slice(0, n * 4), tint: tint.slice(0, n * 4), half: half.slice(0, n), tree: tree.slice(0, n),
    kinds: per.map((c, s) => (s < 5 && c ? `${WOOD[s].name} ${Math.round((100 * c) / Math.max(trees, 1))}%` : '')).filter(Boolean).join(', '),
  };
}

/**
 * Each yoga place's landmark pines and their shadows (ink-objects.js calm: the
 * sheets its shader stands up, uSize), collected into `out` as the features
 * come into the scene. Returns how many places are still to find.
 */
function groveMeshes(scene, left, out) {
  for (const root of scene.children) {
    if (root.userData?.feature?.kind !== 'calm' || root.userData.woods) continue;
    root.userData.woods = true;
    root.traverse((o) => { if (o.isMesh && o.material?.uniforms?.uSize) out.push(o); });
    left--;
  }
  return left;
}

/** Paint each cell's tree into the woods' sheet once (BAKE_FRAG), on the GPU, and give the renderer back as it was. */
function paintSheet(T, renderer, cells) {
  const rt = new T.WebGLRenderTarget(COLS * CELL, (CELLS / COLS) * CELL, {
    type: T.UnsignedByteType, depthBuffer: false, generateMipmaps: true,
    minFilter: T.LinearMipmapLinearFilter, magFilter: T.LinearFilter,
  });
  const u = uniformsOf({ ...shapeValues(T, cells[0].shape), uH: 1, uSeed: 0, uBox: new T.Vector4(), uPale: 0, uPx: 0 });
  const mat = new T.ShaderMaterial({ uniforms: u, vertexShader: BAKE_VERT, fragmentShader: BAKE_FRAG, depthTest: false, depthWrite: false });
  const quad = new T.Mesh(new T.PlaneGeometry(1, 1), mat);
  quad.frustumCulled = false;
  const scene = new T.Scene();
  scene.add(quad);
  const cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const was = { target: renderer.getRenderTarget(), color: renderer.getClearColor(new T.Color()), alpha: renderer.getClearAlpha(), auto: renderer.autoClear };
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear(true, false, false);
  renderer.autoClear = false;
  cells.forEach((c, k) => {
    for (const [name, value] of Object.entries(shapeValues(T, c.shape))) u[name].value = value;
    u.uSeed.value = c.seed;
    u.uPale.value = c.pale;
    u.uBox.value.fromArray(c.shape.box);
    u.uPx.value = (c.shape.box[3] - c.shape.box[2]) / CELL;
    rt.viewport.set((k % COLS) * CELL, Math.floor(k / COLS) * CELL, CELL, CELL);
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
  });
  renderer.autoClear = was.auto;
  renderer.setClearColor(was.color, was.alpha);
  renderer.setRenderTarget(was.target);
  mat.dispose();
  quad.geometry.dispose();
  return rt;
}

/**
 * The woods. `week` is life.js's reading (its subject and the survey's
 * readers). Returns { object, update(frame), dispose } or null for a week
 * that grows none.
 */
export function createForest(T, { features, survey, light, uniforms, R, palette: pal, week, amount, scene, renderer }) {
  if (!survey?.land?.image?.data) return null; // life.js asks only a rock world's ground for its woods
  const read = readForest(features);
  if (!read) return null;
  const rng = features.makeRng('life/forest');
  read.seed = Math.floor(rng() * 1e6);
  const baked = bakeField(T, { features, survey, R, read, subject: week.subject });
  const { tex, at: forestAt, held } = baked;
  const sea = num(features.seaLevel, 0);
  const cap = num(features.orbit?.reliefCap, 12);
  const MIX = (a, b, t) => a.clone().lerp(b, t);
  const field = solidsOf(features, R);

  // ---- the glaze's tints: the wood's colour over the lowland's own, so the
  // multiply lands it on the ground it covers; a fir wood bluer, a pine wood
  // warmer. A wood is the ground a good shade deeper and greener, toward the
  // sea's teal: a mass from orbit, never a patch laid on it
  const leafBase = [
    MIX(MIX(pal.veg, pal.shadeCool, 0.35), pal.ink, 0.42),
    MIX(MIX(pal.veg, pal.landLow, 0.2), pal.ink, 0.36),
    MIX(MIX(pal.veg, pal.sepia, 0.3), pal.ink, 0.3),
  ][read.kind];
  const glazeLeaf = [
    MIX(MIX(pal.veg, pal.shadeCool, 0.25), pal.teal, 0.12),
    MIX(MIX(pal.veg, pal.teal, 0.14), pal.sepia, 0.18),
    MIX(MIX(pal.veg, pal.sepia, 0.26), pal.teal, 0.06),
  ][read.kind].multiplyScalar(0.78);
  const ref = MIX(pal.landLow, pal.litWarm, 0.3);
  const tintOf = (c) => new T.Color(clamp(c.r / Math.max(ref.r, 0.05), 0.12, 1), clamp(c.g / Math.max(ref.g, 0.05), 0.12, 1), clamp(c.b / Math.max(ref.b, 0.05), 0.12, 1));
  const tint = tintOf(glazeLeaf);
  const tintLit = tint.clone().lerp(new T.Color(1, 1, 1), 0.35);
  const tintDeep = tint.clone().multiplyScalar(0.78);
  const fogBase = { value: 900 };
  const gu = {
    tForest: { value: tex },
    uLight: light,
    uTint: { value: tint },
    uTintLit: { value: tintLit },
    uTintDeep: { value: tintDeep },
    uOrbit: { value: 1 },
    uFoot: { value: 0 },
    uAmount: amount,
    uCrown: { value: read.kind === 0 ? 1.9 : read.kind === 1 ? 2.6 : 3.0 },
    uFogBase: fogBase,
    uTerm: { value: 0 },
  };
  const glazeMat = new T.ShaderMaterial({
    uniforms: gu,
    vertexShader: GLAZE_VERT,
    fragmentShader: GLAZE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: T.MultiplyBlending,
    premultipliedAlpha: true,
  });
  // the shell: every vertex set down on the survey at the cap the orbit globe
  // is drawn to, a hair above it
  const glazeGeo = new T.SphereGeometry(R, 320, 160);
  {
    const pos = glazeGeo.attributes.position;
    const v = new T.Vector3();
    const landAt = week.read.landAt;
    for (let i = 0; i < pos.count; i++) {
      v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
      const h = Math.max(Math.min(landAt(v) + sea, cap), sea) + 0.2;
      pos.setXYZ(i, v.x * (R + h), v.y * (R + h), v.z * (R + h));
    }
    pos.needsUpdate = true;
  }
  const glaze = new T.Mesh(glazeGeo, glazeMat);
  glaze.name = 'life-forest-glaze';
  glaze.frustumCulled = false;
  // under the cloud's shadow (a multiply too, so the order is the light's)
  glaze.renderOrder = -2;

  // ---- the ancients: three great trees grown once for the week, and one of
  // them — each landing its own — stood where the eye lands (life-kit.js
  // landingEye), on wooded ground in its view: off to one side in the middle
  // distance, whole in the frame. A view with no wood in it has none, and none
  // stands near the eye
  const sunDir = (uniforms.uSunDir?.value || light.value).clone().normalize();
  const routes = (features.routes || []).map((rt) => {
    const pts = [];
    for (let i = 0; i + 2 < (rt.seg || []).length; i += 9) pts.push(new T.Vector3(rt.seg[i], rt.seg[i + 1], rt.seg[i + 2]).normalize());
    return pts;
  });
  const sites = (features.list || []).filter((f) => f.dir);
  const clearOf = (v, routeGap, siteGap) => routes.every((pts) => pts.every((p) => p.angleTo(v) * R > routeGap))
    && sites.every((f) => f.dir.angleTo(v) * R > siteGap)
    && (features.lagoons || []).every((b) => b.dir.angleTo(v) * R > b.radius + 6);
  const east = new T.Vector3(), north = new T.Vector3();
  const ground = (v) => {
    const h = features.heightAt(v);
    if (h < sea + 0.5 || h > cap - 0.6) return null;
    tangentFrame(T, v, east, north);
    const he = features.heightAt(v.clone().addScaledVector(east, 1.5 / R).normalize());
    const hn = features.heightAt(v.clone().addScaledVector(north, 1.5 / R).normalize());
    if (Math.hypot(he - h, hn - h) / 1.5 > 0.45) return null;
    return h;
  };

  const group = new T.Group();
  group.name = 'life-forest';
  group.add(glaze);
  const treeQuad = new T.PlaneGeometry(1, 1);
  const show = { value: 0 };
  const leafLit = MIX(MIX(MIX(leafBase, pal.veg, 0.2), pal.litWarm, 0.58), pal.paper, 0.08);
  const leafMid = MIX(MIX(leafBase, pal.veg, 0.3), pal.litWarm, 0.15);
  const leafDeep = MIX(MIX(leafBase, pal.ink, 0.42), pal.shadeCool, 0.22);
  const leafBack = MIX(MIX(leafBase, pal.ink, 0.6), pal.shadeCool, 0.32);
  const far = MIX(pal.farGlaze, pal.skyWash, 0.5);
  const mats = [];
  // the ancients are of the week's warmth, each with a wide crown: a cedar on a
  // cold week, a broadleaf in flower on a mild one, a stone pine on a hot one
  const greatKind = [1, 3, 2][read.kind];
  const trees = [0, 1, 2].map((i) => {
    const H = 23 + rng() * 8;
    const shape = growTree(greatKind, H, rng, i === 0);
    const tr = shape.trunk;
    const mat = new T.ShaderMaterial({
      uniforms: {
        ...uniformsOf(shapeValues(T, shape)),
        uBox: { value: new T.Vector4(...shape.box) },
        uSun: { value: sunDir },
        uLean: { value: 0 },
        uShow: { value: 0 },
        uH: { value: H },
        uSeed: { value: rng() * 40 },
        uFogBase: fogBase,
        uLeafLit: { value: leafLit },
        uLeaf: { value: leafMid },
        uLeafDeep: { value: leafDeep },
        uLeafBack: { value: leafBack },
        uWood: { value: MIX(MIX(pal.wood, pal.ink, 0.5), pal.shadeCool, 0.12) },
        uWoodLit: { value: MIX(pal.wood, pal.litWarm, 0.25) },
        uInk: { value: pal.ink.clone() },
        uPaper: { value: pal.paper.clone() },
        uFar: { value: far },
        uMist: { value: pal.skyBand.clone() },
        uBloom: { value: MIX(pal.paper, pal.vermilion, 0.16) },
        uBloomK: { value: greatKind === 3 ? 1 : 0 },
      },
      vertexShader: TREE_VERT,
      fragmentShader: TREE_FRAG,
      side: T.DoubleSide,
      alphaToCoverage: true,
    });
    const mesh = new T.Mesh(treeQuad, mat);
    mesh.frustumCulled = false;
    mesh.visible = false;
    group.add(mesh);
    mats.push(mat);
    // (its foot on the ground: the stem's flare; and how high its lowest boughs hang)
    const crownLo = shape.crown[1] - shape.crown[3];
    return { mesh, H, W: shape.box[1], trunkR: tr.w0 + 0.5 * tr.flare, crownLo, rank: 0.25, seed: rng() * 20, v: new T.Vector3(), placed: false };
  });

  // ---- the shade under each, and under the woods' trees nearest a landing,
  // draped on the ground where it stands (an unstood tree's is a rank no dial
  // reaches)
  const G = 8, PER = (G + 1) * (G + 1), SLOTS = trees.length + SHADES;
  const shadePos = new Float32Array(SLOTS * PER * 3);
  const shadeAtt = new Float32Array(SLOTS * PER * 4);
  const idx = [];
  for (let k = 0; k < SLOTS; k++) {
    for (let i = 0; i < PER; i++) shadeAtt[(k * PER + i) * 4 + 3] = 2;
    for (let i = 0; i < G; i++) {
      for (let j = 0; j < G; j++) {
        const vi = k * PER + i * (G + 1) + j;
        idx.push(vi, vi + 1, vi + G + 1, vi + 1, vi + G + 2, vi + G + 1);
      }
    }
  }
  const shadeGeo = new T.BufferGeometry();
  shadeGeo.setAttribute('position', new T.BufferAttribute(shadePos, 3));
  shadeGeo.setAttribute('aShade', new T.BufferAttribute(shadeAtt, 4));
  shadeGeo.setIndex(idx);
  const shadeMat = new T.ShaderMaterial({
    uniforms: { uInk: { value: MIX(pal.shadeCool, pal.ink, 0.45) }, uShow: show, uAmount: amount, uFogBase: fogBase },
    vertexShader: SHADE_VERT,
    fragmentShader: SHADE_FRAG,
    transparent: true,
    depthWrite: false,
    // the drape's triangles are wound facing into the ground; and the ground
    // patch is drawn pulled toward the eye (polygonOffset -2): the shade on it, more
    side: T.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    // the wash pass reads the ground's alpha as its handoff: keep it
    blending: T.CustomBlending,
    blendEquation: T.AddEquation,
    blendSrc: T.SrcAlphaFactor,
    blendDst: T.OneMinusSrcAlphaFactor,
    blendSrcAlpha: T.ZeroFactor,
    blendDstAlpha: T.OneFactor,
  });
  const shadeMesh = new T.Mesh(shadeGeo, shadeMat);
  shadeMesh.name = 'life-forest-shade';
  shadeMesh.frustumCulled = false;
  shadeMesh.visible = false;
  shadeMesh.renderOrder = -2;
  group.add(shadeMesh);
  const w = new T.Vector3(), away = new T.Vector3(), across = new T.Vector3();
  const drape = (k, t) => {
    const up = t.v;
    tangentFrame(T, up, east, north);
    away.copy(sunDir).addScaledVector(up, -sunDir.dot(up)).negate();
    if (away.lengthSq() < 1e-6) away.copy(east);
    away.normalize();
    across.crossVectors(up, away);
    const elev = Math.max(0.2, sunDir.dot(up));
    const len = clamp((t.H * 0.8) / Math.tan(Math.asin(Math.min(elev, 0.99))), t.H * 0.4, t.H * (t.long || 1.6));
    const wide = t.W * (t.wide || 0.7);
    for (let i = 0; i <= G; i++) {
      for (let j = 0; j <= G; j++) {
        const a = i / G, b = (j / G) * 2 - 1;
        w.copy(up).addScaledVector(away, ((a * 1.15 - 0.08) * len) / R).addScaledVector(across, (b * wide) / R).normalize();
        w.multiplyScalar(R + Math.max(features.heightAt(w), sea) + 0.08);
        const vi = k * PER + i * (G + 1) + j;
        shadePos[vi * 3] = w.x; shadePos[vi * 3 + 1] = w.y; shadePos[vi * 3 + 2] = w.z;
        shadeAtt[vi * 4] = a * 1.15 - 0.08; shadeAtt[vi * 4 + 1] = b * 1.15; shadeAtt[vi * 4 + 2] = t.seed; shadeAtt[vi * 4 + 3] = t.rank;
      }
    }
  };
  const unstood = (k) => { for (let i = 0; i < PER; i++) shadeAtt[(k * PER + i) * 4 + 3] = 2; };

  // ---- the woods (WOODS_VERT): every tree of them planted once, each kind
  // painted once into the sheet
  const wrng = features.makeRng('life/woods');
  const cells = cellsOf(read, wrng);
  const wood = renderer ? plantWoods(T, { features, R, read, baked, cells, pal, MIX }) : null;
  const sheet = wood && wood.count ? paintSheet(T, renderer, cells) : null;
  const wu = {
    tAtlas: { value: sheet?.texture || null },
    uBox: { value: Array.from({ length: CELLS }, (_, k) => new T.Vector4(...(cells[k]?.shape.box || [0, 0, 0, 0]))) },
    uClear: { value: new T.Vector4() },
    uGlade: { value: new T.Vector4() },
    uLane: { value: new T.Vector4() },
    uRunner: { value: new T.Vector3() },
    uSun: { value: sunDir },
    uTime: { value: 0 },
    uShow: show,
    uAmount: amount,
    uOcc: { value: R + sea - 0.6 },
    uReach: { value: 300 },
    uR: { value: R },
    uInk: { value: pal.ink.clone() },
    uShadeCool: { value: pal.shadeCool.clone() },
    uLitWarm: { value: pal.litWarm.clone() },
    uPaper: { value: pal.paper.clone() },
    uWood: { value: MIX(MIX(pal.wood, pal.ink, 0.5), pal.shadeCool, 0.12) },
    uWoodLit: { value: MIX(pal.wood, pal.litWarm, 0.25) },
    uBirch: { value: MIX(pal.paper, pal.stone, 0.25) },
    uFar: { value: pal.farGlaze.clone() },
    uMist: { value: pal.skyBand.clone() },
    uFogBase: fogBase,
    uAerial: { value: 1 },
    uSeaR: { value: R + sea },
  };
  let woodGeo = null, woodMat = null, woodMesh = null;
  if (sheet) {
    woodGeo = instancedQuad(T, wood.count, { aFoot: wood.foot, aForm: wood.form, aTint: wood.tint });
    woodMat = new T.ShaderMaterial({ uniforms: wu, vertexShader: WOODS_VERT, fragmentShader: WOODS_FRAG, side: T.DoubleSide, alphaToCoverage: true });
    woodMesh = new T.Mesh(woodGeo, woodMat);
    woodMesh.name = 'life-forest-woods';
    woodMesh.frustumCulled = false;
    woodMesh.visible = false;
    group.add(woodMesh);
  }

  // ---- where the eye lands: the best wooded ground in its view for each
  const fr = { x: 0, y: 0, z: 0 };
  const v = new T.Vector3(), s = new T.Vector3(), sd = new T.Vector3();
  const seen = (eye, p) => {
    for (let k = 1; k < 20; k++) {
      s.copy(eye.pos).lerp(p, k / 20);
      sd.copy(s).normalize();
      if (s.length() < R + features.heightAt(sd) - 0.05) return false;
    }
    return true;
  };
  // ---- what stands on the ground near the eye (life-kit.js): a tree keeps its
  // stem off all of it, its crown off anything tall enough to reach into it,
  // and stands off the herds' animals
  const clearOfSolids = (t, at) => {
    for (let i = 0; i < field.count; i++) {
      const r = field.sr[i];
      if (r <= 0) continue;
      const d = Math.acos(Math.min(1, at.x * field.sx[i] + at.y * field.sy[i] + at.z * field.sz[i])) * R;
      if (d < r + t.trunkR + 1.5 || (field.sh[i] > t.crownLo && d < r + 0.45 * t.W)) return false;
    }
    for (let i = 0; i < field.moved; i++) {
      const l = Math.hypot(field.mx[i], field.my[i], field.mz[i]);
      const d = Math.acos(Math.min(1, (at.x * field.mx[i] + at.y * field.my[i] + at.z * field.mz[i]) / l)) * R;
      if (d < field.mr[i] + t.trunkR + 1) return false;
    }
    return true;
  };
  // and how much of its picture something built nearer the eye stands across
  // (0 … 1 of it): a great tree seen through a grove's pines reads as grown
  // into them. `near` holds each standing disc as the eye frames it.
  const near = [];
  const framed = (eye) => {
    near.length = 0;
    for (let i = 0; i < field.count; i++) {
      if (field.sr[i] <= 0) continue;
      sd.set(field.sx[i], field.sy[i], field.sz[i]);
      const h = features.heightAt(sd);
      eye.frame(w.copy(sd).multiplyScalar(R + h), fr);
      if (fr.z < 1) continue;
      const x = fr.x, y = fr.y, z = fr.z;
      eye.frame(w.copy(sd).multiplyScalar(R + h + field.sh[i]), fr);
      near.push({ x, y0: y, y1: fr.y, z, half: field.sr[i] / (z * eye.tanH * eye.aspect) });
    }
  };
  const hidden = (eye, t, at) => {
    const half = (0.5 * t.W) / (at.z * eye.tanH * eye.aspect), top = at.y + t.H / (at.z * eye.tanH);
    const area = 2 * half * (top - at.y);
    let cover = 0;
    for (const n of near) {
      if (n.z > at.z - 5) continue;
      const ox = Math.min(at.x + half, n.x + n.half) - Math.max(at.x - half, n.x - n.half);
      const oy = Math.min(top, n.y1) - Math.max(at.y, n.y0);
      if (ox > 0 && oy > 0) cover += (ox * oy) / area;
    }
    return Math.min(1, cover);
  };
  // ---- the woods round a landing: a glade where the runner stands, one under
  // the great tree and the way to it kept open (what WOODS_VERT reads), the
  // near trees' stems in the way of whatever walks there (life-kit.js) and
  // their shade on the ground. Laid again round the runner once he is well
  // away from where they were laid.
  // (a woods tree's shade is drawn shorter under a low sun than a great tree's: they lie in each other's)
  const runnerAt = new T.Vector3(), poolAt = new T.Vector3(), ws = { v: new T.Vector3(), H: 0, W: 0, seed: 0, rank: 0, long: 0.9, wide: 0.5 };
  let runner = null, pooled = false;
  const runnerOf = (eye) => {
    if (!runner && scene) runner = scene.children.find((o) => o.name === 'runner') || null;
    return runner ? runnerAt.copy(runner.position) : runnerAt.copy(eye.pos).addScaledVector(eye.fw, 10.9);
  };
  const kept = (i) => {
    const f = wood.foot, x = f[i * 4], y = f[i * 4 + 1], z = f[i * 4 + 2];
    const jag = 0.85 + 0.3 * ((wood.form[i * 4 + 2] * 7.13) % 1);
    const c = wu.uClear.value, g = wu.uGlade.value, l = wu.uLane.value;
    if (Math.hypot(x - c.x, y - c.y, z - c.z) < c.w * jag || Math.hypot(x - g.x, y - g.y, z - g.z) < g.w * jag) return false;
    if (l.w <= 0) return true;
    const ox = x - l.x, oy = y - l.y, oz = z - l.z, gx = g.x - l.x, gy = g.y - l.y, gz = g.z - l.z;
    const lo = Math.hypot(ox, oy, oz), lg = Math.hypot(gx, gy, gz);
    return lo >= lg || (ox * gx + oy * gy + oz * gz) / (lo * lg) <= l.w + 0.02 * (jag - 1);
  };
  const pool = (at) => {
    pooled = true;
    poolAt.copy(at);
    const d2 = [];
    for (let i = 0; i < wood.count; i++) {
      if (!wood.tree[i]) continue;
      const dx = wood.foot[i * 4] - at.x, dy = wood.foot[i * 4 + 1] - at.y, dz = wood.foot[i * 4 + 2] - at.z;
      const q = dx * dx + dy * dy + dz * dz;
      if (q < 6400 && kept(i)) d2.push([q, i]);
    }
    d2.sort((a, b) => a[0] - b[0]);
    for (let k = 0; k < Math.max(SHADES, POOL); k++) {
      const i = k < d2.length ? d2[k][1] : -1;
      if (i >= 0) ws.v.set(wood.foot[i * 4], wood.foot[i * 4 + 1], wood.foot[i * 4 + 2]).normalize();
      if (k < SHADES) {
        if (i < 0) unstood(trees.length + k);
        else {
          ws.H = wood.foot[i * 4 + 3]; ws.W = wood.half[i]; ws.seed = 100 + wood.form[i * 4 + 2] * 20; ws.rank = wood.form[i * 4 + 3];
          drape(trees.length + k, ws);
        }
      }
      if (k < POOL) field.stand(`wood${k}`, ws.v, i < 0 ? 0 : 0.045 * wood.foot[i * 4 + 3] + 0.15, i < 0 ? 0 : wood.foot[i * 4 + 3]);
    }
    shadeGeo.attributes.position.needsUpdate = true;
    shadeGeo.attributes.aShade.needsUpdate = true;
  };
  const unpool = (at) => {
    if (!pooled) return;
    pooled = false;
    for (let k = 0; k < POOL; k++) field.stand(`wood${k}`, at, 0, 0);
  };
  const standWoods = (eye, great) => {
    const c = runnerOf(eye);
    wu.uClear.value.set(c.x, c.y, c.z, 7.5);
    if (great) {
      const g = great.mesh.position, dg = eye.pos.distanceTo(g);
      wu.uGlade.value.set(g.x, g.y, g.z, 0.6 * great.W);
      wu.uLane.value.set(eye.pos.x, eye.pos.y, eye.pos.z, Math.cos(Math.atan((0.4 * great.W + 4) / Math.max(dg, 1))));
    } else {
      wu.uGlade.value.w = 0;
      wu.uLane.value.w = 0;
    }
    pool(c);
  };

  let landings = 0;
  const stand = (eye) => {
    const chosen = landings++ % trees.length;
    // the last landing's trees are let go before this one's are stood
    field.stand('tree', eye.up, 0, 0);
    if (wood) unpool(eye.up);
    field.read(T, scene, eye.pos);
    framed(eye);
    trees.forEach((t, k) => {
      let best = null;
      for (let d = 34; d <= (k === chosen ? 128 : 0); d += 4) {
        for (let deg = -42; deg <= 42; deg += 2) {
          const b = (deg * Math.PI) / 180;
          v.copy(eye.up).addScaledVector(eye.fw, (Math.cos(b) * d) / R).addScaledVector(eye.side, (Math.sin(b) * d) / R).normalize();
          const F = forestAt(v);
          if (F < 0.15) continue;
          eye.frame(w.copy(v).multiplyScalar(R + features.heightAt(v)), fr);
          const ax = Math.abs(fr.x);
          // well off to one side, its stem in the frame and at least its lower
          // half: a crown this wide over a low eye is cut by the frame, the
          // less of it the better
          if (fr.z < 30 || ax < 0.3 || ax > 0.85) continue;
          const tall = t.H / (fr.z * eye.tanH);
          if (fr.y + 0.45 * tall > 0.95) continue;
          const cut = Math.max(0, ax + (0.8 * t.W) / (fr.z * eye.tanH * eye.aspect) - 1.12) + Math.max(0, fr.y + tall - 0.95);
          const sc = Math.min(F, 1.2) * 0.5 - Math.abs(ax - 0.58) - Math.abs(d - 60) / 60 - 0.5 * cut;
          if (best && sc + 0.5 <= best.sc) continue;
          if (!clearOf(v, 3.5, 12) || !clearOfSolids(t, v)) continue;
          const h = ground(v);
          if (h == null) continue;
          // a foot seen is best, a crown over a crest will do; none seen
          // through something built nearer the eye
          const at = { x: fr.x, y: fr.y, z: fr.z };
          const foot = seen(eye, w.copy(v).multiplyScalar(R + h + 1.5));
          if (!foot && !seen(eye, w.copy(v).multiplyScalar(R + h + t.H * 0.5))) continue;
          const total = sc + (foot ? 0.5 : 0) - 1.5 * hidden(eye, t, at);
          if (!best || total > best.sc) best = { sc: total, h, x: fr.x, v: v.clone() };
        }
      }
      t.placed = !!best;
      if (best) {
        t.v.copy(best.v);
        t.mesh.position.copy(best.v).multiplyScalar(R + best.h - 0.15);
        drape(k, t);
        // its stem is in the way of whatever walks there
        field.stand('tree', t.v, t.trunkR, t.H);
      } else {
        unstood(k);
      }
    });
    if (wood) standWoods(eye, trees.find((t) => t.placed) || null);
    shadeGeo.attributes.position.needsUpdate = true;
    shadeGeo.attributes.aShade.needsUpdate = true;
  };

  group.userData.species = {
    kind: KINDS[read.kind],
    cover: +read.cover.toFixed(2),
    wooded: +held.toFixed(2),
    ancients: trees.length,
    woods: wood ? { trees: wood.trees, undergrowth: wood.count - wood.trees, kinds: wood.kinds } : null,
    why: read.why,
  };
  const camPos = new T.Vector3();
  let stood = -1, groveLeft = read.calm.length, groveOn = false;
  const grove = [];
  return {
    object: group,
    update({ orbit, foot, term, camera, eye, time }) {
      gu.uOrbit.value = orbit;
      gu.uFoot.value = foot;
      gu.uTerm.value = term;
      glaze.visible = Math.max(orbit, foot) > 0.002;
      // the air underfoot is measured from the eye's own distance to the
      // runner (ink.js), about the chase camera's: near enough to take as it
      if (camera) camPos.copy(camera.position);
      fogBase.value = foot > 0.5 ? 11 : 900 + Math.max(0, camPos.length() - 700);
      show.value = foot;
      // a landing stands them as soon as its flight down knows where the view
      // will be (life.js reads the eye off the flight's end), so they fade in
      // with the ground on the way down; back in orbit they are let go
      if (foot <= 0) {
        // (their stems leave the field with them)
        if (stood >= 0) field.stand('tree', camPos, 0, 0);
        if (wood) unpool(camPos);
        for (const t of trees) t.placed = false;
        stood = -1;
      } else if (eye.landed && eye.serial !== stood) {
        stood = eye.serial;
        stand(eye);
      } else if (wood && pooled && runnerOf(eye).distanceTo(poolAt) > 20) pool(runnerAt);
      let any = false;
      for (const t of trees) {
        const on = foot > 0.002 && t.placed && t.rank < amount.value;
        t.mesh.visible = on;
        const u = t.mesh.material.uniforms;
        u.uShow.value = on ? foot : 0;
        // the crown leans with the wind, a little
        u.uLean.value = 0.004 * Math.sin(num(time) * 0.55 + t.seed) + 0.002 * Math.sin(num(time) * 1.3 + 2 * t.seed);
        any = any || t.placed;
      }
      shadeMesh.visible = foot > 0.002 && (any || pooled);
      // the woods take the yoga places' own ground: the pines of each one's
      // landmark (ink-objects.js calm) are let go once it is in the scene, and
      // given back if the dial takes the woods away
      if (groveLeft > 0 && scene) { groveLeft = groveMeshes(scene, groveLeft, grove); groveOn = null; }
      if (groveOn !== amount.value > 0) {
        groveOn = amount.value > 0;
        for (const m of grove) m.visible = !groveOn;
      }
      if (woodMesh) {
        woodMesh.visible = foot > 0.002;
        wu.uTime.value = num(time);
        wu.uAerial.value = clamp(num(P['light.aerial'], 1), 0, 1);
        if (foot > 0.002) wu.uRunner.value.copy(runnerOf(eye));
      }
    },
    dispose() {
      tex.dispose();
      glazeGeo.dispose();
      glazeMat.dispose();
      treeQuad.dispose();
      for (const m of mats) m.dispose();
      shadeGeo.dispose();
      shadeMat.dispose();
      sheet?.dispose();
      woodGeo?.dispose();
      woodMat?.dispose();
      for (const m of grove) m.visible = true;
    },
  };
}

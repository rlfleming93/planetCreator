/* Planet Creator — the galaxy, painted: what galaxy-data.js places, laid out in three.js with galaxy-paint.js's
 * shaders, and the planet's own black hole (bodies/blackhole-lens.js, its pass exactly as the planet runs it) at
 * the heart of it.
 *
 * The frame is drawn in four steps: the scene (the sky, the bulge, the field, the disc, the phenomena and the
 * weeks) into a target; that frame bent round the hole by its lens (galaxy-paint.js WARP_FRAG: the far side, behind
 * it, comes round it as a ring, the near side passes in front unbent) into a second; the jets laid over that, since
 * they come out of the hole and not from behind it; then the hole's pass over it all to the screen, placed each
 * frame where the galaxy's middle falls and sized by the hole's mass, drawn far larger than any real hole so it
 * holds the middle from the whole-galaxy view. Its disc is laid in the galaxy's own plane: the eye's height over
 * that plane is the pass's incline, and the way the plane's line of nodes runs across the sheet is its tilt, so the
 * arch and the blade turn with the camera. The galaxy turns on its own, slowly, the way the hole's disc does: the
 * hole's spin is the galaxy's. The turn holds still from the first touch, so what the eye is looking at stays put,
 * and comes back gently once the eye has been idle a while with the whole galaxy in view.
 *
 * It opens on the whole galaxy. Asked to (playOpening), it plays its opening: close on the hole, nearly edge-on to
 * its disc, drawn back until the galaxy stands whole; any key, tap, click or wheel ends that at once, and with
 * reduced motion asked for there is no opening at all.
 *
 * The eye: a drag turns it round its pivot, two fingers or the right button slide it in the galaxy's own plane, and
 * the wheel (eased), a pinch or a double-tap zoom toward what is under the pointer or between the fingers, the pivot
 * kept on that plane. Close in the pivot may go anywhere on the disc; from the whole-galaxy view only a little way
 * off the core, so zooming out always comes back to the galaxy whole and centred.
 *
 * The guide: a week picked (from the page's timeline, a star, a step) carries the eye to it along the arms, the
 * pivot running on each arm's crest through the weeks between, the eye turned so the arm runs across the screen with
 * time going left to right, and drawn back while it travels fast: a step is a glide along the arm, a long way a
 * flight over the galaxy. It frames the week where the page keeps a week's place (spot), close enough that its
 * neighbours stand apart along the arm. Any touch hands the eye back.
 *
 * The rail: with a week picked, every zoom (the wheel, a pinch, a double-tap, the keys) runs one way. In, it closes
 * on the week, turning the eye as the guide frames it and bringing the week to the middle of the screen, until its
 * planet is dive.box() px across and the page's dive takes over (galaxy-dive.js shows the planet itself there); out,
 * it draws back to the whole galaxy and lets the week go. With none picked the zoom is free, toward the pointer, and
 * a zoom in that comes close to a week picks it (dive.pick).
 *
 * createGalaxy(host, galaxy, { onFrame, inset, spot, onReveal, thumbOf, paintingOf, planetPx, dive }) returns what a page needs: the weeks under
 * a point (nearest first), where a week stands on the screen (as the lens shows it), pick one (and be carried to
 * it), zoom toward a point, fly back to the whole galaxy or to the hole, play the opening, and (for a capture) set and
 * read the camera, read the opening's camera at a time, and draw one frame at a chosen time. With reduced motion
 * asked for, it draws only when something changed, and flies nowhere: the eye is set where it is going at once.
 * inset() names the room the page's own words take at each side ({ left, top, right, bottom }, CSS px); the whole
 * galaxy is centred in the rest. spot() names where a picked week stands ({ x, y }, CSS px). planetPx() is how many
 * px across the page draws a picked week's planet at the guide's distance (the side of its still: its system is
 * galaxy-system.js's; thumbOf and paintingOf name each week's globe picture at 96 px and whole). dive = { box(), enter(i, rest), zoom(f),
 * pick(i), home(i) }: where the planet takes over and what is left of the zoom then, the zoom while it has the screen
 * (pause), a week a free zoom came to, and a zoom out that reached the whole galaxy with week i picked.
 * onReveal(event) is called when the opening has drawn back far enough to show the galaxy, and again with the input
 * that cut it short (if one did), so the page can let that input do nothing else; with no opening it is never called.
 */
import * as THREE from '../planet/vendor/three/build/three.module.js';
import { OrbitControls } from '../planet/vendor/three/examples/jsm/controls/OrbitControls.js';
import { createLens } from '../planet/bodies/blackhole-lens.js';
import { pace } from '../planet/pace.js';
import { R0, R1, WIND, PHASE, SIN_PITCH, armWidth, onArm } from './galaxy-data.js';
import * as PAINT from './galaxy-paint.js';
import { createSystems } from './galaxy-system.js';

const TAU = Math.PI * 2;
const SPIN = TAU / 720;   // the galaxy turns once in twelve minutes
const FOV = 40;
const UP = new THREE.Vector3(0, 1, 0);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v) => clamp(v, 0, 1);
const smooth = (a, b, x) => { const s = clamp01((x - a) / (b - a)); return s * s * (3 - 2 * s); };

function rngOf(seed) { // mulberry32: the same galaxy every time
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (rng) => Math.sqrt(-2 * Math.log(1 - rng() * 0.999999)) * Math.cos(TAU * rng());

// ---------------------------------------------------------------- the arms' data
// Each arm's weeks on 53 slots, one a week from January, two rows an arm: how big (0 … 1), in a streak, there at
// all, how warm; and on the second row how much star birth. The same table goes to the disc's shader as a texture
// and is read here for where the field stars stand.
function armTable(g) {
  const rows = g.years.length, data = new Uint8Array(64 * rows * 2 * 4);
  for (const w of g.weeks) {
    const o = (w.arm * 128 + Math.min(52, Math.round(w.t * 52))) * 4;
    data[o] = 255 * clamp01(w.load / 2.6);
    data[o + 1] = w.lane ? 255 : 0;
    data[o + 2] = 255;
    data[o + 3] = 255 * clamp01(w.warmth);
    data[o + 256] = 255 * clamp01(w.birth || 0);
  }
  const at = (arm, t, c) => { // linear between slots, as the texture is sampled
    const s = clamp01(t) * 52, i = Math.floor(s), f = s - i, o = arm * 128 * 4;
    return (data[o + i * 4 + c] * (1 - f) + data[o + Math.min(52, i + 1) * 4 + c] * f) / 255;
  };
  const texture = new THREE.DataTexture(data, 64, rows * 2, THREE.RGBAFormat);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return { texture, at, rows };
}

// the arm nearest a point of the disc, and where across it the point is (the disc shader's own reading)
function nearestArm(r, phi, arms) {
  const lr = Math.log(Math.max(r, 0.015) / R0), t = (r - R0) / (R1 - R0), w = armWidth(clamp01(t));
  let x = 99, arm = 0;
  for (let k = 0; k < arms; k++) {
    let d = phi - (PHASE + (TAU * k) / arms - WIND * lr);
    d = ((((d + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
    const xk = (d * r * SIN_PITCH) / w;
    if (Math.abs(xk) < Math.abs(x)) { x = xk; arm = k; }
  }
  return { x, arm, t };
}

// ---------------------------------------------------------------- the field
// Stars where the disc's light is: kept by the arm's own profile and its weeks' size, thinned in a dust lane, a
// warm ball of old stars round the core.
function fieldStars(g, table, n, rng) {
  const pos = new Float32Array(n * 3), color = new Float32Array(n * 3), size = new Float32Array(n);
  const arms = g.years.length;
  let k = 0;
  for (let guard = 0; k < n && guard < n * 80; guard++) {
    let x, y, z, c, s;
    if (rng() < 0.15) { // the bulge: a flattened ball
      const r = 0.012 + Math.abs(gauss(rng)) * 0.07, th = Math.acos(2 * rng() - 1), ph = rng() * TAU;
      x = r * Math.sin(th) * Math.cos(ph); y = r * Math.cos(th) * 0.6; z = r * Math.sin(th) * Math.sin(ph);
      c = rng() < 0.7 ? [0.98, 0.86, 0.62] : [0.95, 0.70, 0.48];
      s = 0.7 + rng() * 0.8;
    } else {
      const r = Math.min(1.08, R0 * 0.6 - Math.log(1 - rng() * 0.985) * 0.34), phi = rng() * TAU;
      const a = nearestArm(r, phi, arms);
      const there = table.at(a.arm, a.t, 2), vol = table.at(a.arm, a.t, 0);
      const ends = clamp01((a.t + 0.06) / 0.08) * (1 - clamp01((a.t - 0.96) / 0.12));
      const load = (0.045 + (0.235 + 0.72 * vol) * there) * ends;   // the disc shader's own
      const keep = 0.035 + 0.965 * Math.exp(-a.x * a.x * (a.x < 0 ? 1.4 : 0.6)) * load;
      if (rng() > keep) continue;
      x = r * Math.cos(phi); z = -r * Math.sin(phi);
      y = gauss(rng) * (0.006 + 0.03 * Math.exp(-r / 0.12));
      const h = rng(), warm = clamp01(1 - (r - 0.1) / 0.3);
      // white and blue-white, the few warm ones pale and none of them big: gold and orange are the weeks' own
      c = h < 0.55 - 0.4 * warm ? [0.80, 0.86, 0.97] : h < 0.88 ? [0.96, 0.94, 0.89] : [0.95, 0.89, 0.80];
      s = 0.6 + rng() * 0.8;
      const dust = table.at(a.arm, a.t, 1) * Math.exp(-((a.x + 0.45) ** 2) / 0.14);
      if (dust > 0.2) c = c.map((v) => v * (1 - 0.65 * dust));
    }
    pos.set([x, y, z], k * 3);
    color.set(c, k * 3);
    size[k++] = s;
  }
  return points(pos.subarray(0, k * 3), color.subarray(0, k * 3), size.subarray(0, k));
}

// a time record's globular cluster: a King ball of old stars, hung above the disc beside its week (170 each, so
// the five records cost fewer stars than four did at 220), drawn in hard to a bright core; most of them faint and
// warm, a few red giants among them and fewer blue stragglers
function clusterStars(centers, rng) {
  const per = 170, pos = [], color = [], size = [];
  for (const c of centers) {
    for (let i = 0; i < per; i++) {
      const u = rng() * 0.985, r = Math.min(0.04, 0.0055 * Math.sqrt(u / (1 - u)));
      const th = Math.acos(2 * rng() - 1), ph = rng() * TAU;
      pos.push(c[0] + r * Math.sin(th) * Math.cos(ph), c[1] + r * Math.cos(th), c[2] + r * Math.sin(th) * Math.sin(ph));
      const kind = rng(), big = rng() ** 4;
      color.push(...(kind < 0.06 ? [0.98, 0.66, 0.38] : kind < 0.09 ? [0.70, 0.78, 0.94] : kind < 0.72 ? [0.62, 0.54, 0.40] : [0.60, 0.44, 0.31]));
      size.push(0.6 + big * 1.1 + (kind < 0.06 ? 0.5 : 0));
    }
  }
  return points(new Float32Array(pos), new Float32Array(color), new Float32Array(size));
}

// star birth: on the outer edge of the arm wherever a run of regular weeks went, a bloom or a few a week (more as
// the week had more sessions), each with a smaller one or two beside it, so they lie in clumps and never in a row
function nebulaStars(g, rng) {
  const pos = [], color = [], size = [];
  const tints = [[0.84, 0.36, 0.38], [0.88, 0.46, 0.44], [0.76, 0.34, 0.42]]; // rose madder, not magenta
  for (const w of g.weeks) {
    if (!w.birth) continue;
    for (let k = 0, n = 1 + Math.round(2.4 * w.birth * rng()); k < n; k++) {
      const [x, z] = onArm(w.t + (rng() - 0.5) / 52, w.arm, g.years.length, 0.15 + 1.2 * rng());
      const big = 0.005 + 0.011 * rng() ** 2 * (0.5 + w.birth), tint = tints[Math.floor(rng() * 3)];
      for (let j = 0, m = 1 + (rng() < 0.6 ? 2 : 1); j < m; j++) {
        const s = j ? big * (0.35 + 0.3 * rng()) : big, o = j ? big * 1.6 : 0, b = (0.55 + 0.3 * rng()) * (j ? 0.8 : 1);
        pos.push(x + gauss(rng) * o, gauss(rng) * 0.003, z + gauss(rng) * o);
        color.push(tint[0] * b, tint[1] * b, tint[2] * b);
        size.push(s);
      }
    }
  }
  return points(new Float32Array(pos), new Float32Array(color), new Float32Array(size));
}

function points(pos, color, size) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  return geo;
}

// ---------------------------------------------------------------- the sky's furniture
function skyUniforms() {
  const C = (hex) => new THREE.Color(hex);
  // the planet's default palette, mixed as ink-space.js mixes it
  const paper = C(0xe6dfcd), dark = C(0x141c33), cobalt = C(0x294a78), skyWash = C(0xa9b4cc);
  const skyDeep = C(0x5e7199), litWarm = C(0xd6a462), crest = C(0xe3e6d6), vermilion = C(0xc53e25), bare = C(0x8c5433);
  const night = new THREE.Color(0.80, 0.66, 1.12);
  const dir = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
  const neb = [[dir(0.42, -0.30, -1), 0.34, 0.42, 0.15, 1.0], [dir(-1, 0.35, -0.55), 0.22, 0.34, 0.75, 1.4]];
  return {
    uTime: { value: 0 },
    uPx: { value: 0.001 },
    uSeed: { value: 7.3 },
    uVoidDeep: { value: cobalt.clone().multiplyScalar(0.26).lerp(dark.clone().multiplyScalar(0.38), 0.34).multiply(night) },
    uVoidLift: { value: cobalt.clone().multiplyScalar(0.48).lerp(dark.clone().multiplyScalar(0.44), 0.30).multiply(night).lerp(paper, 0.03) },
    uNebCool: { value: skyDeep.clone().lerp(cobalt, 0.45).multiply(night).multiplyScalar(0.66) },
    uNebWarm: { value: litWarm.clone().lerp(bare, 0.28).multiplyScalar(0.36) },
    uStarPale: { value: paper.clone().lerp(crest, 0.40) },
    uStarA: { value: litWarm.clone().lerp(vermilion, 0.22) },
    uStarB: { value: skyWash.clone().lerp(paper, 0.34) },
    uStarC: { value: vermilion.clone().lerp(paper, 0.34) },
    uNeb: { value: neb.map(([d, spread]) => new THREE.Vector4(d.x, d.y, d.z, Math.cos(Math.min(2.4 * spread * 1.26, 1.35)))) },
    uNebK: { value: neb.map(([, spread, strength, warm, stretch]) => new THREE.Vector4(strength, spread, warm, stretch)) },
  };
}

const material = (uniforms, vertexShader, fragmentShader, extra = {}) => new THREE.ShaderMaterial({
  uniforms, vertexShader, fragmentShader, transparent: true, depthTest: false, depthWrite: false, ...extra,
});
// light, added to what is behind it: everything but the disc's dust, the weeks' own marks and a remnant's rose
const light = (uniforms, vertexShader, fragmentShader) => material(uniforms, vertexShader, fragmentShader, { blending: THREE.AdditiveBlending });

function billboard(size, fragment, uniforms, order, how = { blending: THREE.AdditiveBlending }) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material({ uSize: { value: size }, ...uniforms }, PAINT.BILLBOARD_VERT, fragment, how));
  mesh.renderOrder = order;
  mesh.frustumCulled = false;
  return mesh;
}

// ---------------------------------------------------------------- the comeback
// A dwarf galaxy above the disc and the stream the tide has pulled out of it: the stream falls into the arm at the
// comeback's week (the bridge) and trails on round the dwarf's orbit, out and down through the disc's plane, as
// far round as the quiet before it ran long (a year of quiet would be most of a turn). The dwarf stands a radian
// round from its week, on whichever side is further from `away` (the way the jets lean), so the two never meet.
// Its old stars are warm and dim and scattered wider the further they have drifted, over a haze of their own
// unresolved light.
function comebackOf(week, quiet, rng, dpr, scale, away) {
  const rc = Math.hypot(week[0], week[2]), phc = Math.atan2(-week[2], week[0]);
  const off = (a) => Math.abs(Math.atan2(Math.sin(a - away), Math.cos(a - away)));
  const dir = off(phc + 1) > off(phc - 1) ? 1 : -1;
  const rD = Math.max(rc + 0.3, 0.55), phD = phc + dir, hD = 0.26, SD = 0.2; // SD: the dwarf's place on the stream
  const span = Math.min(2.6, (quiet / 52) * 4.4), out = 1.02 - rD;
  const ring = (r, ph, y, v) => v.set(r * Math.cos(ph), y, -r * Math.sin(ph));
  const D = ring(rD, phD, hD, new THREE.Vector3());
  // the tail's way out of the dwarf, which the bridge comes in along
  const T = new THREE.Vector3(Math.cos(phD) * out - dir * Math.sin(phD) * span * rD, 0, -Math.sin(phD) * out - dir * Math.cos(phD) * span * rD).normalize();
  const P = new THREE.Vector3().fromArray(week);
  const bridge = new THREE.CubicBezierCurve3(P, P.clone().add(new THREE.Vector3(0, 0.1, 0)), D.clone().addScaledVector(T, -0.2), D);
  const at = (s, v) => {
    if (s <= SD) return bridge.getPoint(s / SD, v);
    const u = (s - SD) / (1 - SD);
    return ring(rD + out * u, phD + dir * span * u, hD * Math.cos(1.9 * u), v);
  };
  const v = new THREE.Vector3(), pos = [], color = [], size = [];
  // old stars, most of them faint, a few giants warmer and brighter among them
  const star = (p, spread, dim, r = rng) => {
    pos.push(p.x + gauss(r) * spread, p.y + gauss(r) * spread * 0.7, p.z + gauss(r) * spread);
    const k = (0.45 + 0.55 * r()) * dim, big = r() ** 3;
    color.push(...(big > 0.8 ? [1.0 * k, 0.74 * k, 0.48 * k] : [0.92 * k, 0.86 * k, 0.76 * k]));
    size.push(0.55 + big * 0.95);
  };
  for (let i = 0; i < 700; i++) {
    const tail = rng() < 0.62;
    const s = tail ? SD + (1 - SD) * rng() ** 1.6 : SD * (1 - rng() ** 1.3);
    const far = tail ? (s - SD) / (1 - SD) : (SD - s) / SD; // 0 at the dwarf, 1 at either end
    star(at(s, v), 0.005 + (tail ? 0.03 : 0.01) * far, 1 - (tail ? 0.5 : 0.25) * far);
  }
  // the dwarf itself: a Plummer ball of them, drawn out a little along the stream (the first 320 as they always
  // were; the rest, fainter, from their own salt, so the dwarf resolves into stars as the eye comes near)
  const deep = rngOf(1309);
  for (let i = 0; i < 1000; i++) {
    const r = i < 320 ? rng : deep, u = r() * 0.96, a = Math.min(0.09, 0.021 / Math.sqrt(u ** (-2 / 3) - 1));
    v.set(gauss(r), gauss(r), gauss(r)).normalize().multiplyScalar(a);
    star(v.addScaledVector(T, v.dot(T) * 0.8).add(D), 0, i < 320 ? 1 : 0.6, r);
  }
  const stars = new THREE.Points(points(new Float32Array(pos), new Float32Array(color), new Float32Array(size)), light({ uDpr: dpr }, PAINT.FIELD_VERT, PAINT.FIELD_FRAG));
  // the haze: dabs overlapping all the way along (never a row of beads), each a little off the line; thicker over
  // the bridge, where the stream joins its week. It and the dwarf's own light (lit) brighten while the week is picked.
  const hp = [], hc = [], hs = [];
  for (let k = 0; k < 150; k++) {
    const s = (k + rng()) / 150, bridge = s < SD, far = bridge ? (SD - s) / SD : (s - SD) / (1 - SD);
    const b = bridge ? 0.04 * (1 - 0.35 * far) : 0.026 * (1 - 0.6 * far);
    at(s, v);
    hp.push(v.x + gauss(rng) * 0.008 * far, v.y + gauss(rng) * 0.005 * far, v.z + gauss(rng) * 0.008 * far);
    hc.push(b, b * 0.95, b * 0.88);
    hs.push(0.03 + 0.04 * far);
  }
  const lit = { value: 0 };
  const haze = new THREE.Points(points(new Float32Array(hp), new Float32Array(hc), new Float32Array(hs)), light({ uScale: scale, uLit: lit }, PAINT.HAZE_VERT, PAINT.HAZE_FRAG));
  for (const [o, order] of [[haze, 4], [stars, 5]]) { o.renderOrder = order; o.frustumCulled = false; }
  const glow = billboard(0.12, PAINT.DWARF_FRAG, { uStretch: { value: new THREE.Vector2(1, 0) }, uLit: lit }, 4);
  glow.position.copy(D);
  return { at: D.toArray(), tangent: T, glow, lit, objects: [haze, stars, glow] };
}

// ---------------------------------------------------------------- the galaxy
export function createGalaxy(host, g, { onFrame, inset, spot, onReveal, thumbOf, paintingOf, planetPx, dive } = {}) {
  THREE.ColorManagement.enabled = false; // the house uses its colors raw (ink.js setupScene)
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.domElement.className = 'galaxy-canvas';
  host.append(renderer.domElement);
  const full = Math.min(devicePixelRatio || 1, coarse ? 1.75 : 2);
  let ratio = full; // as the frame's cost asks (res, below)

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.004, 120);
  const galaxy = new THREE.Group();
  scene.add(galaxy);
  const rng = rngOf(2025);
  const table = armTable(g);
  const disposables = [table.texture];

  // the sky: a shell round the eye, drawn first
  const skyU = skyUniforms();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), material(skyU, PAINT.SKY_VERT, PAINT.SKY_FRAG, { side: THREE.BackSide, transparent: false }));
  sky.scale.setScalar(60);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);

  // the bulge and the galaxy's halo (one billboard, PAINT.HALO galaxy radii across its half) and the field first,
  // then the disc, flat in the galaxy's plane (its local y is the galaxy's -z, so its angle is the arms' own), laid
  // premultiplied: its light added, its dust standing dark against them
  galaxy.add(billboard(PAINT.HALO, PAINT.BULGE_FRAG, { uSeed: { value: 1.9 } }, 1));
  // the hole's own light on the core: under the lens it comes round the shadow as a ring
  galaxy.add(billboard(8 * g.hole.shadow, PAINT.GLARE_FRAG, { uSeed: { value: 2.7 }, uOn: { value: 0.55 + 0.45 * g.hole.activity } }, 1));
  const dpr = { value: ratio };
  const field = new THREE.Points(fieldStars(g, table, coarse ? 2200 : 3400, rng), light({ uDpr: dpr }, PAINT.FIELD_VERT, PAINT.FIELD_FRAG));
  field.renderOrder = 2;
  field.frustumCulled = false;
  galaxy.add(field);
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.3), material({
    uData: { value: table.texture }, uArms: { value: table.rows }, uSeed: { value: 3.7 },
    uR0: { value: R0 }, uR1: { value: R1 }, uWind: { value: WIND }, uPhase: { value: PHASE }, uSinP: { value: SIN_PITCH }, uDpr: dpr,
  }, PAINT.DISC_VERT, PAINT.DISC_FRAG, { premultipliedAlpha: true }));
  disc.rotation.x = -Math.PI / 2;
  disc.renderOrder = 3;
  galaxy.add(disc);

  // ---- the phenomena, each beside the week that made it
  const time = { value: 0 };
  const W = g.weeks;
  const targets = []; // [position, week, reach in galaxy radii] for picking
  for (const [k, r] of g.remnants.entries()) {
    // laid over the light as well as shining (premultiplied), so its rose holds on the bright arm
    const m = billboard(0.05 + 0.04 * r.size, PAINT.REMNANT_FRAG, { uSeed: { value: 3.1 + 7.7 * k }, uTime: time }, 6, { premultipliedAlpha: true });
    m.position.fromArray(W[r.at].pos);
    galaxy.add(m);
    targets.push([W[r.at].pos, r.at, 0.6 * m.material.uniforms.uSize.value]);
  }
  // over its week's own star (the hard point in the soft one is the sign), its beams long enough to reach past the
  // arm's bright crest
  const pulsars = g.pulsars.map((p, k) => {
    const m = billboard(0.085, PAINT.PULSAR_FRAG, { uBeam: { value: new THREE.Vector3() }, uSeed: { value: 5.0 + k }, uTime: time }, 10);
    m.position.fromArray(W[p.at].pos);
    galaxy.add(m);
    // its spin axis, tipped off the galaxy's, and the beam tipped off that; each turns at its own rate
    const tip = 0.5 + rng() * 0.6, round = rng() * TAU;
    const spin = new THREE.Vector3(Math.sin(tip) * Math.cos(round), Math.cos(tip), Math.sin(tip) * Math.sin(round));
    return { mesh: m, spin, beam: 0.55 + rng() * 0.4, rate: 0.9 + rng() * 0.8, phase: rng() * TAU };
  });
  const clusterAt = g.clusters.map((c, k) => {
    const p = W[c.at].pos, r = Math.hypot(p[0], p[2]) || 1;
    return [p[0] * (1 + 0.06 / r), 0.12 + 0.03 * (k % 2), p[2] * (1 + 0.06 / r)];
  });
  for (const [k, c] of g.clusters.entries()) {
    const m = billboard(0.05, PAINT.CLUSTER_FRAG, {}, 4);
    m.position.fromArray(clusterAt[k]);
    galaxy.add(m);
    targets.push([clusterAt[k], c.at, 0.03]);
  }
  if (clusterAt.length) {
    const cl = new THREE.Points(clusterStars(clusterAt, rng), light({ uDpr: dpr }, PAINT.FIELD_VERT, PAINT.FIELD_FRAG));
    cl.renderOrder = 5;
    cl.frustumCulled = false;
    galaxy.add(cl);
  }

  // The way the weeks' long axis runs (the home views are laid along it), and the hole's spin axis: tipped TIP off
  // the galaxy's, as a real one's often is, and away from the eye of the tall home view (read from the weeks, so a
  // shelf always leans it the same way): its disc is seen more nearly edge-on and its jets longer there, and across
  // a wide screen the jets run on the slant. It turns with the galaxy.
  let sxx = 0, szz = 0, sxz = 0;
  for (const wk of W) { sxx += wk.pos[0] ** 2; szz += wk.pos[2] ** 2; sxz += wk.pos[0] * wk.pos[2]; }
  const long = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  const homeAzimuth = (tall) => { // across a wide screen, up a tall one, the newest week on the near side
    const turn = galaxy.rotation.y, [nx, , nz] = W.at(-1).pos;
    let azimuth = turn - long + (tall ? Math.PI / 2 : 0);
    const x = nx * Math.cos(turn) + nz * Math.sin(turn), z = -nx * Math.sin(turn) + nz * Math.cos(turn);
    if (x * Math.sin(azimuth) + z * Math.cos(azimuth) < 0) azimuth += Math.PI;
    return azimuth;
  };
  const TIP = 0.45, leanAz = homeAzimuth(true);
  const holeAxis = new THREE.Vector3(-Math.sin(TIP) * Math.sin(leanAz), Math.cos(TIP), -Math.sin(TIP) * Math.cos(leanAz));

  // ---- the comeback: a dwarf galaxy hung above the disc, torn into a stream of stars that falls into the arm at
  // its week and trails back round its orbit, as far round as the quiet before it ran long
  const pxScale = { value: 1 }; // device px per galaxy radius at a distance of one
  const dwarf = g.comeback && comebackOf(W[g.comeback.at].pos, g.comeback.quiet, rng, dpr, pxScale, Math.atan2(-holeAxis.z, holeAxis.x));
  if (dwarf) {
    for (const o of dwarf.objects) galaxy.add(o);
    targets.push([dwarf.at, g.comeback.at, 0.05]);
  }
  // the nebulae of star birth along the outer edge of each run of regular weeks
  const nebulae = new THREE.Points(nebulaStars(g, rng), light({ uScale: pxScale }, PAINT.NEBULA_VERT, PAINT.NEBULA_FRAG));
  nebulae.renderOrder = 4;
  nebulae.frustumCulled = false;
  galaxy.add(nebulae);

  // the jets, while the last month was big, out along the hole's spin axis and long enough to leave the disc: not
  // bent by the lens (they come out of the hole, not from behind it), so laid over its frame, under its own pass
  const jetScene = new THREE.Scene(), jets = new THREE.Group();
  jetScene.add(jets);
  const jetOn = clamp01((g.hole.activity - 0.25) / 0.5);
  if (jetOn > 0) {
    for (const flip of [0, Math.PI]) {
      const geo = new THREE.PlaneGeometry(2, 1, 1, 24);
      geo.translate(0, 0.5, 0);
      const jet = new THREE.Mesh(geo, light({ uLen: { value: 0.55 + 0.6 * g.hole.activity }, uWidth: { value: 0.1 }, uTime: time, uOn: { value: jetOn }, uSeed: { value: 2.0 + flip } }, PAINT.JET_VERT, PAINT.JET_FRAG));
      jet.rotation.x = flip;
      jet.frustumCulled = false;
      jets.add(jet);
    }
  }

  // ---- the weeks
  const weekU = { uScale: pxScale, uDpr: dpr, uHover: { value: -1 } };
  const wgeo = points(new Float32Array(W.flatMap((w) => w.pos)), new Float32Array(W.flatMap((w) => w.color)), new Float32Array(W.map((w) => w.size)));
  wgeo.setAttribute('aIndex', new THREE.BufferAttribute(new Float32Array(W.map((w) => w.i)), 1));
  const weeks = new THREE.Points(wgeo, material(weekU, PAINT.WEEK_VERT, PAINT.WEEK_FRAG));
  weeks.renderOrder = 9;
  weeks.frustumCulled = false;
  galaxy.add(weeks);
  // ---- each week's own small solar system (galaxy-system.js): its star painted once it is near, its planet in its
  // own painting from the shelf, its moons, belt, comet and ring; the picked week's turned to its planet, composed
  // against the page as the lens shows it (screenOfPoint, below)
  const systems = createSystems({ THREE, galaxy, weeks: W, thumbOf, paintingOf, onLoad: () => wake(), screenOf: (p, out) => screenOfPoint(p, out) });
  // a week is picked anywhere out to its planet's orbit (the reach only tells once the eye is near)
  for (const w of W) targets.push([w.pos, w.i, systems.reach(w.i)]);

  // ---- the hole: the planet's own pass, its week lens left out (no globe to bend), compiled with BH_GALAXY (its
  // galaxy path: finer strokes as the eye comes near, the paper's tooth); before it, the galaxy's own lens, the
  // Einstein radius LENS shadows
  const LENS = 1.7;
  const lens = createLens({ THREE, R: 1 });
  const lensU = {
    ...lens.post.uniforms({ dials: { 'sky.space': 1 } }),
    tDiffuse: { value: null }, uResolution: { value: new THREE.Vector2() }, uSeed: { value: 4.2 }, uTime: time,
  };
  lensU.uPlanetR.value = 0;
  lensU.uGlobe.value.set(-1e6, -1e6);
  lensU.uInset.value.set(0, 0);
  const pass = (uniforms, fragmentShader) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms, vertexShader: PAINT.SCREEN_VERT, fragmentShader, depthTest: false, depthWrite: false }));
    mesh.frustumCulled = false;
    return new THREE.Scene().add(mesh);
  };
  const screenScene = pass(lensU, '#define BH_GALAXY\n' + lens.post.fragment);
  const warpU = { tDiffuse: { value: null }, uResolution: lensU.uResolution, uHole: lensU.uHole, uTilt: { value: 0 }, uE: { value: 0 }, uQuiet: { value: 0 } };
  const warpScene = pass(warpU, PAINT.WARP_FRAG);
  const rt = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false }), bent = rt.clone();
  disposables.push(rt, bent);

  // ---- the camera
  // OrbitControls: a drag turns the eye round the pivot, two fingers (or the right button) slide it in the
  // galaxy's own plane, a pinch zooms toward the point between the fingers (the wheel is eased below, then zoomed
  // the same way). The pivot is kept on the plane, and how far it may stray from the core grows as the eye comes
  // in (reach): close in it goes anywhere on the disc and out to the dwarf, at the whole-galaxy view a little way.
  const controls = new OrbitControls(camera, renderer.domElement);
  const PAN = 0.6;
  Object.assign(controls, {
    enableDamping: true, dampingFactor: 0.08, rotateSpeed: 0.55, zoomSpeed: 1, panSpeed: PAN, screenSpacePanning: false,
    minDistance: 0.12, maxDistance: 7, minPolarAngle: 0.18, maxPolarAngle: 1.42, zoomToCursor: true,
  });
  let homeDist = 1, flight = null;
  const guide = { on: false, i: -1, L: 0, v: 0, d: 1, az: null }; // the eye being carried along the arms (below)
  const reach = (d) => 0.12 + 1.04 * smooth(0.85, 0.3, d / homeDist);
  // the pivot kept within reach; while the page carries the eye (a flight, the guide, the rail to a picked week) it
  // goes where it is taken
  const limit = () => { controls.maxTargetRadius = guide.on || flight || (dive && guide.i >= 0) ? Infinity : reach(camera.position.distanceTo(controls.target)); };
  const size = new THREE.Vector2(), css = { w: 1, h: 1, left: 0, top: 0, right: 0, bottom: 0 };
  let laid = ''; // the drawing buffer as last set: its size and ratio
  const tanV = Math.tan((FOV * Math.PI) / 360);
  const v = new THREE.Vector3(), w = new THREE.Vector3(), w2 = new THREE.Vector3(), eye = new THREE.Vector3(), nodes = new THREE.Vector3();
  const spinAxis = new THREE.Vector3(), beam = new THREE.Vector3(), perp = new THREE.Vector3(), axisW = new THREE.Vector3();
  // the whole galaxy, tipped toward the eye: lower on a wide screen, nearer face-on on a tall one, and fitted to
  // the room the page's own words leave it (css.left, top, right and bottom). The weeks' long axis runs across a
  // wide screen and up a tall one, the newest week on the near side. A tall screen is narrow, so there the fit is
  // the rim (the furthest week and its arm), whichever way the galaxy has turned: its tips never leave the sides.
  const rim = Math.max(...W.map((wk) => Math.hypot(wk.pos[0], wk.pos[2]))) + 0.06;
  const roomW = () => css.w - css.left - css.right, roomH = () => css.h - css.top - css.bottom;
  const homeView = (out = { target: [0, 0, 0] }) => {
    const w = roomW(), h = roomH(), tall = w / h < 0.85, elev = tall ? 1.1 : 0.56;
    out.azimuth = homeAzimuth(tall);
    out.elevation = elev;
    out.distance = Math.max((tall ? rim : 1.08) / w, (0.95 * Math.sin(elev) + 0.22) / h) * (css.h / tanV);
    out.target[0] = out.target[1] = out.target[2] = 0;
    return out;
  };
  // where the pivot stands on the screen (CSS px): the middle of the room for the whole galaxy, the page's spot
  // for a picked week (less the lens's shift of its star, lensFix, while the guide has the eye); flights carry it
  // from one to the other
  const aim = { x: 0, y: 0 }, aimA = { x: 0, y: 0 }, lensFix = { x: 0, y: 0 }, aimB = { x: 0, y: 0 };
  let aimSpot = false;
  const room = { x: 0, y: 0 }; // read at once by every caller, so one will do
  const roomAim = () => { room.x = css.left + roomW() / 2; room.y = css.top + roomH() / 2; return room; };
  const aimOf = (atSpot) => (atSpot && spot?.()) || roomAim();
  function goalAim() {
    const s = aimOf(aimSpot);
    if (!aimSpot || !guide.on) return s;
    aimB.x = s.x - lensFix.x;
    aimB.y = s.y - lensFix.y;
    return aimB;
  }
  const sph = new THREE.Spherical();
  function view({ azimuth, elevation, distance, target = [0, 0, 0] }) {
    controls.target.fromArray(target);
    sph.set(distance, Math.PI / 2 - elevation, azimuth);
    camera.position.setFromSpherical(sph).add(controls.target);
    camera.lookAt(controls.target);
    limit();
    controls.update();
    camera.updateMatrixWorld();
  }
  // the eye as view() takes it
  function poseNow(out) {
    sph.setFromVector3(w2.copy(camera.position).sub(controls.target));
    out.azimuth = sph.theta;
    out.elevation = Math.PI / 2 - sph.phi;
    out.distance = sph.radius;
    out.target = controls.target.toArray(out.target || []);
    return out;
  }

  function resize() {
    css.w = Math.max(1, host.clientWidth);
    css.h = Math.max(1, host.clientHeight);
    const keep = inset?.() || {};
    css.left = Math.min(css.w * 0.45, keep.left || 0);
    css.right = Math.min(css.w * 0.45, keep.right || 0);
    css.top = Math.min(css.h * 0.4, keep.top || 0);
    css.bottom = Math.min(css.h * 0.4, keep.bottom || 0);
    if (!flight) Object.assign(aim, aimOf(aimSpot));
    // one reallocation, and none when nothing changed (a page's layout() at the same size keeps the frame drawn)
    const want = `${css.w}x${css.h}@${ratio}`;
    if (want !== laid) { laid = want; renderer.setDrawingBufferSize(css.w, css.h, ratio); }
    renderer.getDrawingBufferSize(size);
    rt.setSize(size.x, size.y);
    bent.setSize(size.x, size.y);
    frameSheet();
    dpr.value = ratio;
    lensU.uResolution.value.copy(size);
    skyU.uPx.value = (2 * Math.tan((FOV * Math.PI) / 360)) / size.y;
    pxScale.value = size.y / (2 * Math.tan((FOV * Math.PI) / 360));
    homeDist = homeView().distance;
    controls.maxDistance = 1.6 * homeDist;
  }
  // The pivot moved to its place on the screen (aim): the screen is a window on a larger virtual sheet whose middle
  // is the pivot, and the field of view widened with it so a galaxy radius is as many pixels as ever. OrbitControls
  // reads its pan from the field of view, which the sheet widened, so the pan is slowed to match: what is under the
  // fingers stays under them.
  function frameSheet() {
    const fullW = 2 * Math.max(aim.x, css.w - aim.x), fullH = 2 * Math.max(aim.y, css.h - aim.y);
    camera.fov = (360 / Math.PI) * Math.atan((tanV * fullH) / css.h);
    camera.aspect = fullW / fullH;
    camera.setViewOffset(fullW, fullH, fullW / 2 - aim.x, fullH / 2 - aim.y, css.w, css.h);
    camera.updateProjectionMatrix();
    controls.panSpeed = (PAN * css.h) / fullH;
  }
  resize();
  const home = homeView();
  view(home);

  // ---- each frame
  // the way a plane square to `axis` runs across the sheet through the hole (its line of nodes), as an angle
  function nodesTilt(axis) {
    nodes.crossVectors(axis, eye);
    if (nodes.lengthSq() < 1e-8) nodes.set(1, 0, 0);
    w.copy(nodes).normalize().multiplyScalar(0.01).project(camera);
    return Math.atan2((w.y - v.y) * size.y, (w.x - v.x) * size.x);
  }
  function placeHole() {
    const f = size.y / 2 / Math.tan((FOV * Math.PI) / 360);
    const dist = camera.position.length();
    v.set(0, 0, 0).project(camera);
    lensU.uHole.value.set((v.x * 0.5 + 0.5) * size.x, (v.y * 0.5 + 0.5) * size.y);
    lensU.uShadow.value = (f * g.hole.shadow) / dist;
    lensU.uPixel.value = Math.max(0.75, size.y / 768);
    // the hole's disc lies square to its spin: the eye's height over it (from whichever face the eye is on), and
    // its line of nodes on the sheet; the lens's far side is the galaxy's own plane's
    eye.copy(camera.position).normalize();
    axisW.copy(holeAxis).transformDirection(galaxy.matrixWorld);
    jets.quaternion.setFromUnitVectors(UP, axisW);
    if (eye.dot(axisW) < 0) axisW.negate();
    lensU.uIncl.value = clamp(Math.asin(eye.dot(axisW)), 0.06, 1.45);
    lensU.uTilt.value = nodesTilt(axisW);
    warpU.uTilt.value = nodesTilt(UP);
    lensU.uMix.value = v.z < 1 ? 1 : 0;
    warpU.uE.value = LENS * lensU.uShadow.value * lensU.uMix.value;
  }
  function aimPulsars(t) {
    for (const p of pulsars) {
      // the beam turns about the spin axis; seen from the eye it is a stroke on the sheet, and a flash on the eye
      spinAxis.copy(p.spin).transformDirection(galaxy.matrixWorld);
      perp.crossVectors(spinAxis, UP);
      if (perp.lengthSq() < 1e-6) perp.set(1, 0, 0);
      perp.normalize();
      beam.copy(spinAxis).multiplyScalar(Math.cos(p.beam)).addScaledVector(perp, Math.sin(p.beam))
        .applyAxisAngle(spinAxis, p.phase + t * p.rate).transformDirection(camera.matrixWorldInverse);
      p.mesh.material.uniforms.uBeam.value.set(beam.x, beam.y, Math.abs(beam.z) ** 60);
    }
    if (dwarf) { // the dwarf drawn out along its stream as the stream lies on the sheet
      beam.copy(dwarf.tangent).transformDirection(galaxy.matrixWorld).transformDirection(camera.matrixWorldInverse);
      const l = Math.hypot(beam.x, beam.y);
      dwarf.glow.material.uniforms.uStretch.value.set(l > 1e-3 ? beam.x / l : 1, l > 1e-3 ? beam.y / l : 0);
    }
  }

  // ---- the eye moved for the page: flights (back to the whole galaxy, to the hole, into the guide) eased over a
  // second or so, and the wheel spent over a few frames (a notch about 6% nearer, a trackpad's pinch coming as the
  // wheel with ctrl held), toward what is under the pointer; any touch cuts a flight short. Kept still (reduced
  // motion), the eye is set where it is going at once.
  let wheelLeft = 0, wheelX = 0, wheelY = 0;
  const WHEEL = 1.25, poseA = {}, poseB = { target: [0, 0, 0] }, poseC = {}, pose = { target: [0, 0, 0] };
  // to: where the eye goes, or (dt) => where it goes now (a goal that moves: the guide); toSpot: the pivot carried
  // to the page's spot for a week, or else to the middle of the room
  function flyTo(to, dur, toSpot, done) {
    wheelLeft = 0;
    poseNow(poseA);
    Object.assign(aimA, aim);
    aimSpot = toSpot;
    flight = { u: still ? 1 : 0, dur, done, to, first: true };
    if (still) stepFlight(0);
    wake();
  }
  function stepFlight(dt) {
    const to = typeof flight.to === 'function' ? flight.to(dt) : flight.to;
    // the short way round (a moving goal: on from where it was)
    const from = flight.first ? poseA.azimuth : poseB.azimuth;
    flight.first = false;
    poseB.azimuth = from + Math.atan2(Math.sin(to.azimuth - from), Math.cos(to.azimuth - from));
    poseB.elevation = to.elevation;
    poseB.distance = to.distance;
    for (let k = 0; k < 3; k++) poseB.target[k] = to.target?.[k] ?? 0;
    const u = (flight.u = Math.min(1, flight.u + dt / flight.dur)), e = u * u * u * (u * (6 * u - 15) + 10);
    // drawing back, the pivot moves late (when the eye is far, so the picture does not race); coming in, early
    const et = poseB.distance > poseA.distance ? e * e : 1 - (1 - e) * (1 - e);
    for (let k = 0; k < 3; k++) pose.target[k] = poseA.target[k] + (poseB.target[k] - poseA.target[k]) * et;
    pose.azimuth = poseA.azimuth + (poseB.azimuth - poseA.azimuth) * e;
    pose.elevation = poseA.elevation + (poseB.elevation - poseA.elevation) * e;
    pose.distance = poseA.distance * (poseB.distance / poseA.distance) ** e;
    const goal = goalAim();
    aim.x = aimA.x + (goal.x - aimA.x) * et;
    aim.y = aimA.y + (goal.y - aimA.y) * et;
    frameSheet();
    view(pose);
    if (u === 1) { const done = flight.done; flight = null; done?.(); }
  }
  function stepWheel() {
    const a = Math.abs(wheelLeft), part = still ? wheelLeft : Math.sign(wheelLeft) * Math.min(a, Math.max(40, 0.3 * a));
    wheelLeft = Math.abs(wheelLeft - part) < 0.01 ? 0 : wheelLeft - part;
    zoomBy(0.95 ** (part / 100), wheelX, wheelY);
  }
  // queue a zoom toward (x, y), client px, as wheel units (OrbitControls': 100 is 5% with zoomSpeed 1; less than 0 in)
  function queueZoom(delta, x, y) {
    if (paused) return dive?.zoom(0.95 ** (delta / 100));
    wheelLeft += delta;
    wheelX = x;
    wheelY = y;
    wake();
  }
  // The zoom, f over 1 in, toward (x, y) (client px). While the dive's planet has the screen it is the planet's; with
  // a week picked it runs along the rail; else it is OrbitControls' own zoom-to-cursor step (vendored r17x; not
  // public, so the wheel and a pinch zoom alike), watched for a week to pick.
  const wheelStep = { clientX: 0, clientY: 0, deltaY: 0 };
  function zoomBy(f, x, y) {
    if (paused) return dive?.zoom(f);
    if (guide.i >= 0 && dive) return railZoom(f);
    wheelStep.clientX = x;
    wheelStep.clientY = y;
    wheelStep.deltaY = (100 * Math.log(f)) / Math.log(0.95);
    controls._handleMouseWheel(wheelStep);
    autoPick(f, x, y);
  }
  // A free zoom in begun on a week (its star within AIM px of the point it zooms to as it began, nearest first) picks
  // that week once it has come in AIM_IN times: the page picks it (no flight), and the rail takes the zoom on to it
  // from there. A zoom out, or one that moves well off the week, begins it again. The week is read as the zoom begins,
  // as the pivot (kept within reach of the core) draws the picture off it on the way in.
  const AIM = 30, AIM_IN = 1.35, seen = {};
  let aimed = -1, aimedBy = 1;
  function autoPick(f, x, y) {
    if (!dive || guide.i >= 0) return;
    if (f < 1) { aimed = -1; return; }
    const r = renderer.domElement.getBoundingClientRect(), px = x - r.left, py = y - r.top;
    if (aimed >= 0 && Math.hypot(screenOfPoint(W[aimed].pos, seen).x - px, seen.y - py) > 4 * AIM) aimed = -1;
    if (aimed < 0) {
      let bestD = AIM;
      for (const wk of W) {
        screenOfPoint(wk.pos, seen);
        const d = Math.hypot(seen.x - px, seen.y - py);
        if (seen.visible && d < bestD) { aimed = wk.i; bestD = d; }
      }
      aimedBy = 1;
      if (aimed < 0) return;
    }
    aimedBy *= f;
    if (aimedBy < AIM_IN) return;
    const i = aimed;
    aimed = -1;
    dive.pick(i);
  }
  // Two fingers: with a week picked (or the planet up) their spread is the zoom, OrbitControls only sliding with them
  // (its own dolly is off while a week is picked); with none OrbitControls pinches by itself, watched for a week to pick.
  // Either finger may land on the page's words over the galaxy (a phone's week card, not its controls): it still
  // pinches, and OrbitControls, which has at most one of the two, is held off until they lift.
  const fingers = new Map(), doc = renderer.domElement.ownerDocument;
  let spread = 0;
  function onFinger(e) {
    if (e.pointerType !== 'touch') return;
    let p = fingers.get(e.pointerId);
    if (e.type === 'pointerdown') {
      const on = e.target === renderer.domElement;
      if (!on && e.target.closest?.('a, button, select, input, label, [role="option"], [role="listbox"]')) return;
      fingers.set(e.pointerId, (p = [0, 0, on]));
      if (fingers.size === 2 && [...fingers.values()].some((q) => !q[2])) controls.enabled = false;
    } else if (!p) return;
    else if (e.type !== 'pointermove') {
      fingers.delete(e.pointerId);
      spread = 0;
      if (!fingers.size) controls.enabled = true;
      return;
    }
    p[0] = e.clientX;
    p[1] = e.clientY;
    if (fingers.size !== 2) { spread = 0; return; }
    const [a, b] = fingers.values(), s = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (spread > 0 && s > 0 && s !== spread && e.type === 'pointermove') {
      const f = s / spread, x = (a[0] + b[0]) / 2, y = (a[1] + b[1]) / 2;
      if (paused || guide.i >= 0 || !controls.enabled) zoomBy(f, x, y);
      else autoPick(f, x, y);
    }
    spread = s;
  }
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) doc.addEventListener(type, onFinger, true);
  // ---- the rail: each zoom step takes its share (in the log of the distance) of what is left of the way to its end:
  // in, the guide's own framing of the week (the arm across, ELEV over the disc), the week brought from the page's
  // spot to the middle of the screen (where the planet's own frame has it), at the distance where its planet is
  // dive.box() px across; out, the whole galaxy. A drag between steps only moves where the next one starts from.
  const railP = { azimuth: 0, elevation: 0, distance: 1, target: [0, 0, 0] }, railG = { azimuth: 0, elevation: 0, distance: 1, target: [0, 0, 0] };
  const railAim = { x: 0, y: 0 }, railLens = { x: 0, y: 0 };
  const diveDist = (box = dive.box()) => (nearDist() * (planetPx?.() ?? 160)) / Math.max(1, box);
  function divePose(i, out, distance) {
    onPath(i, piv, tng);
    out.azimuth = Math.atan2(-tng.z, tng.x);
    out.elevation = ELEV;
    out.distance = distance;
    piv.toArray(out.target);
    return out;
  }
  // where the pivot stands for week i at the dive's end: the middle of the screen, less the lens's shift of its star
  function diveAim(i) {
    lensOf(i, railLens);
    railAim.x = css.w / 2 - railLens.x;
    railAim.y = css.h / 2 - railLens.y;
    return railAim;
  }
  function railZoom(f) {
    const i = guide.i, inward = f > 1, end = inward ? diveDist() : homeView(railG).distance;
    if (inward) divePose(i, railG, end);
    poseNow(railP);
    const d1 = railP.distance;
    let d2 = d1 / f, s = 1;
    const done = inward ? d2 <= end * 1.0001 : d2 >= end * 0.9999;
    if (done || (inward ? d1 <= end : d1 >= end)) d2 = end;
    else s = Math.log(d1 / d2) / Math.log(d1 / end);
    railP.azimuth += Math.atan2(Math.sin(railG.azimuth - railP.azimuth), Math.cos(railG.azimuth - railP.azimuth)) * s;
    railP.elevation += (railG.elevation - railP.elevation) * s;
    for (let k = 0; k < 3; k++) railP.target[k] += (railG.target[k] - railP.target[k]) * s;
    railP.distance = d2;
    if (inward) diveAim(i);
    else { railAim.x = css.left + roomW() / 2; railAim.y = css.top + roomH() / 2; }
    aim.x += (railAim.x - aim.x) * s;
    aim.y += (railAim.y - aim.y) * s;
    aimSpot = inward;
    controls.minDistance = Math.min(0.12, 0.9 * diveDist());
    frameSheet();
    view(railP);
    if (!done) return;
    if (inward) dive.enter(i, (end * f) / d1);
    else {
      homeView(home);
      controls.userMoved = false;
      dive.home(i);
    }
  }
  let skipped = null; // the input that cut the opening short does nothing else
  function onWheel(e) {
    e.preventDefault();
    e.stopImmediatePropagation(); // OrbitControls' own wheel zooms all at once
    if (e === skipped) return;
    touched();
    queueZoom(e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1) * (e.ctrlKey ? 10 : 1) * WHEEL, e.clientX, e.clientY);
  }
  renderer.domElement.addEventListener('wheel', onWheel, { capture: true, passive: false });

  // ---- the guide: the eye carried along the arms to a picked week. The pivot runs on each arm's crest (a smooth
  // curve through the places on it of the weeks' own days, each week's small offset off it eased in between; from a
  // year's last week to the next year's first it crosses to the next arm), measured by its length, so the eye goes
  // as fast over the way between the arms as along them. It chases the picked week's place on that curve as a
  // critically damped spring, held to a speed the eye can follow on the screen, and drawn back while it goes fast:
  // a step glides along the arm, a long way rises over the galaxy and comes down again. The eye is turned so the
  // arm runs across the screen, time going left to right as on the page's timeline, a little over the disc, near
  // enough that neighbouring weeks stand stepPx() apart. Any touch hands the eye back (touched).
  const ARM_STEP = ((R1 - R0) * Math.hypot(1, WIND)) / 52; // a week along an arm, galaxy radii (the same all the way out)
  const OMEGA = 6, GLIDE = 0.55, FAST = 1.3, ELEV = 0.42;
  const crestPts = W.map((wk) => { const [x, z] = onArm(wk.t, wk.arm, g.years.length); return new THREE.Vector3(x, 0, z); });
  if (crestPts.length < 2) crestPts.push(crestPts[0].clone()); // ponytail: a shelf of one week has no way to go
  const crest = new THREE.CatmullRomCurve3(crestPts, false, 'centripetal');
  const offs = W.map((wk, i) => new THREE.Vector3().fromArray(wk.pos).sub(crestPts[i]));
  const SUB = 8, ends = crestPts.length - 1, arc = new Float32Array(ends * SUB + 1);
  for (let k = 1, a = crest.getPoint(0), b = new THREE.Vector3(); k <= ends * SUB; k++) {
    crest.getPoint(k / (ends * SUB), b);
    arc[k] = arc[k - 1] + a.distanceTo(b);
    a.copy(b);
  }
  const stepPx = () => clamp(0.32 * css.w, 118, 170); // how far apart neighbouring weeks stand, CSS px
  const nearDist = () => (cssScale() * ARM_STEP) / stepPx();
  // where on the curve (as a week index) its length L runs out
  function sOfL(L) {
    let lo = 0, hi = arc.length - 1;
    if (L <= 0) return 0;
    if (L >= arc[hi]) return ends;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arc[m] <= L) lo = m; else hi = m; }
    return (lo + (L - arc[lo]) / Math.max(1e-9, arc[hi] - arc[lo])) / SUB;
  }
  const tA = new THREE.Vector3(), tB = new THREE.Vector3(), piv = new THREE.Vector3(), tng = new THREE.Vector3();
  // the pivot at s (a week index, fractional) and the way the arm runs there, in the world as the galaxy has turned
  function onPath(s, p, t) {
    const u = s / ends, du = 0.25 / ends, i = Math.min(ends - 1, Math.floor(s)), n = W.length - 1;
    crest.getPoint(clamp01(u), p).add(tA.copy(offs[Math.min(n, i)]).lerp(offs[Math.min(n, i + 1)], clamp01(s - i)));
    crest.getPoint(Math.min(1, u + du), t).sub(crest.getPoint(Math.max(0, u - du), tB));
    p.applyMatrix4(galaxy.matrixWorld);
    t.transformDirection(galaxy.matrixWorld);
  }
  const gp = { azimuth: 0, elevation: 0, distance: 1, target: [0, 0, 0] };
  function guidePose(dt) {
    const Lt = arc[guide.i * SUB], scale = cssScale(), d0 = nearDist();
    if (still) { guide.L = Lt; guide.v = 0; guide.d = d0; }
    else if (dt > 0) {
      for (let n = Math.ceil(dt / 0.008), k = 0; k < n; k++) {
        const h = dt / n, vmax = (FAST * css.w * guide.d) / scale;
        guide.v = clamp(guide.v + (OMEGA * OMEGA * (Lt - guide.L) - 2 * OMEGA * guide.v) * h, -vmax, vmax);
        guide.L += guide.v * h;
      }
      const want = clamp((Math.abs(guide.v) * scale) / (GLIDE * css.w), d0, homeDist);
      guide.d += (want - guide.d) * (1 - Math.exp(-5 * dt));
    }
    onPath(sOfL(guide.L), piv, tng);
    const along = Math.atan2(-tng.z, tng.x), far = smooth(d0, homeDist, guide.d);
    if (guide.az === null || still) guide.az = along;
    else if (dt > 0) guide.az += Math.atan2(Math.sin(along - guide.az), Math.cos(along - guide.az)) * (1 - Math.exp(-dt * 7 * (1 - 0.8 * far)));
    gp.azimuth = guide.az;
    gp.elevation = ELEV + (home.elevation - ELEV) * far;
    gp.distance = guide.d;
    piv.toArray(gp.target);
    return gp;
  }
  // take the eye from wherever it is into the guide, the spring set off from the week the eye was last carried to
  function startGuide(from) {
    endOpening();
    controls.userMoved = true;
    lastTouch = clock;
    spinOn = 0;
    // ponytail: OrbitControls' leftover glide (private; vendored r17x) would pull against the guide for a few frames
    controls._sphericalDelta.set(0, 0, 0);
    controls._panOffset.set(0, 0, 0);
    Object.assign(guide, { on: true, L: arc[(from >= 0 ? from : guide.i) * SUB], v: 0, d: nearDist(), az: null });
    const d = camera.position.distanceTo(controls.target);
    flyTo(guidePose, clamp(0.55 + 0.45 * Math.abs(Math.log(d / guide.d)), 0.6, 1.6), true);
  }

  // The galaxy's own turn: held still from the first touch, and taken up again gently (over a few seconds) once
  // the eye has been idle IDLE seconds with the whole galaxy in view, so it never pulls what the eye is looking at
  // out from under it. A capture sets it from its own clock (frame).
  const IDLE = 5;
  let turn = 0, spinOn = 1, lastTouch = -1e9, clock = 0;
  function touched() {
    controls.userMoved = true;
    lastTouch = clock;
    spinOn = 0;
    flight = null;
    guide.on = false;
  }
  let t0 = 0, raf = 0, last = 0, held = false, paused = false, compiling = false, gone = false;
  // The frame's size follows what it costs, by the planet's own rule (apps/planet/base.js): the screen's ratio times a
  // step of LEVELS (never under 0.75). Frames slower than a 60 Hz screen keeps, for a second and more, step down as far
  // as their time asks (a frame's cost goes with its pixels); a step down that bought no time is undone and is the
  // floor from then on; held fast a while, it steps back up, waiting twice as long after a try that failed. A gap over
  // 100 ms is a hitch (or a pause), not what a frame costs, and is not counted. Kept still (reduced motion) nothing is
  // judged; a capture (frame) is drawn at the full ratio.
  const LEVELS = [1, 0.85, 0.7, 0.55];
  const res = { n: 0, ms: 16.7, step: 0, slow: 0, stable: 0, at: 0, from: null, floor: LEVELS.length - 1, probe: 12, rose: false };
  function resStep(step) {
    res.step = step;
    res.slow = res.stable = 0;
    res.at = clock;
    ratio = Math.max(0.75, full * LEVELS[step]);
    resize();
  }
  function resBy(gap) {
    if (gap > 100 || ++res.n < 60) return; // and not before the first second's frames, which compile and upload
    const dt = gap / 1000;
    res.ms += (gap - res.ms) * 0.04;
    res.slow = res.ms > 20.5 ? res.slow + dt : Math.max(0, res.slow - dt * 2);
    res.stable = res.ms < 17.5 ? res.stable + dt : 0;
    if (clock - res.at < 5) return;
    const from = res.from;
    res.from = null;
    if (from && res.ms > from.ms * 0.85) {
      res.floor = from.step;
      resStep(from.step);
    } else if (res.slow >= 1.25 && res.step < res.floor) {
      const want = LEVELS[res.step] * Math.sqrt(16.7 / res.ms);
      let step = res.step + 1;
      while (step < res.floor && LEVELS[step] > want) step++;
      if (res.rose) res.probe *= 2;
      res.rose = false;
      res.from = { step: res.step, ms: res.ms };
      resStep(step);
    } else if (res.stable >= res.probe && res.step > 0) {
      res.rose = true;
      resStep(res.step - 1);
    } else res.rose = false; // the last step back up has held
  }
  const sysFrame = { camera, time: 0, dt: 0, picked: -1, scale: 1, dpr: 1, big: 0, size };
  function draw(t, dt) {
    if (!held) {
      const idle = clock - lastTouch > IDLE && camera.position.distanceTo(controls.target) > 0.7 * homeDist && controls.target.lengthSq() < 0.09;
      spinOn = idle ? Math.min(1, spinOn + dt / 3) : 0;
      turn += SPIN * dt * spinOn;
    }
    time.value = t;
    skyU.uTime.value = t;
    galaxy.rotation.y = still ? 0 : turn;
    galaxy.updateMatrixWorld();
    if (flight) stepFlight(dt);
    else if (guide.on) { Object.assign(aim, goalAim()); frameSheet(); view(guidePose(dt)); }
    else if (wheelLeft) stepWheel();
    limit();
    if (dt > 0) controls.dampingFactor = 1 - 0.92 ** (dt * 60); // the same glide at any frame rate
    controls.update();
    // the galaxy round a picked week goes quiet
    const show = guide.i < 0 ? 1 : 0;
    warpU.uQuiet.value = still || held ? 1 - show : warpU.uQuiet.value + (1 - show - warpU.uQuiet.value) * Math.min(1, dt * 2.5);
    sky.position.copy(camera.position);
    camera.updateMatrixWorld();
    placeHole();
    // the hole's lens moves a star near it on the screen: the guide frames the picked week as it is seen, so its
    // painting (laid where its star is seen) stands at the spot; one frame late, which it never shows
    if (guide.on) {
      const was = lensFix.x + lensFix.y;
      lensOf(guide.i, lensFix);
      if (still && Math.abs(lensFix.x + lensFix.y - was) > 0.5) wake();
    } else lensFix.x = lensFix.y = 0;
    // the weeks' systems, from the eye as it now stands; the picked one's planet the page's size (planetPx)
    sysFrame.time = t;
    sysFrame.dt = still || held ? 0 : dt;
    sysFrame.picked = guide.i;
    sysFrame.scale = pxScale.value;
    sysFrame.dpr = ratio;
    sysFrame.big = (((planetPx?.() ?? 160) / 2) * ARM_STEP) / stepPx();
    systems.update(sysFrame);
    aimPulsars(t);
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    warpU.tDiffuse.value = rt.texture;
    renderer.setRenderTarget(bent);
    renderer.render(warpScene, camera);
    renderer.autoClear = false;
    renderer.render(jetScene, camera);
    renderer.autoClear = true;
    lensU.tDiffuse.value = bent.texture;
    renderer.setRenderTarget(null);
    renderer.render(screenScene, camera);
    onFrame?.();
  }
  // The opening (INTRO seconds), played only when the page asks (playOpening): held a breath close on the hole (its
  // shadow CLOSE of the frame's shorter side across its half), from the side its axis leans away from and a little
  // over its disc (so the disc is nearly edge-on and arches over the shadow), then drawn back, up and round until the
  // galaxy stands whole at home. Any key, tap, click or wheel ends it there at once; kept still (reduced motion),
  // there is none. Kept still, a frame is drawn only when something changed: a week picked, the size, the camera
  // (and on while the controls ease to rest).
  const INTRO = 8, CLOSE = 0.14, OVER = TIP + 0.1;
  const fly = { azimuth: 0, elevation: 0, distance: 0, target: [0, 0, 0] };
  function introView(t) {
    const u = clamp01((t / INTRO - 0.1) / 0.9), e = u * u * u * (u * (6 * u - 15) + 10);
    const round = ((((home.azimuth - leanAz) % TAU) + 3 * Math.PI) % TAU) - Math.PI; // the short way round
    const near = (g.hole.shadow * css.h) / (2 * tanV * CLOSE * Math.min(roomW(), roomH()));
    fly.distance = near * (home.distance / near) ** e;
    fly.elevation = OVER + (home.elevation - OVER) * e;
    fly.azimuth = home.azimuth - round * (1 - e);
    return fly;
  }
  const SKIP = ['pointerdown', 'wheel', 'keydown', 'touchstart'];
  let opening = false, openAt = 0, revealed = true;
  function endOpening(e) {
    if (!opening) return;
    opening = false;
    skipped = e || null;
    for (const k of SKIP) removeEventListener(k, endOpening, true);
    if (!controls.userMoved) view(home);
    revealed = true;
    onReveal?.(e);
    wake();
  }
  function playOpening() {
    if (still || opening) return; // the page lets its week go first (select(-1))
    flight = null;
    wheelLeft = 0;
    aimSpot = false;
    Object.assign(aim, roomAim());
    frameSheet();
    controls.userMoved = false;
    Object.assign(home, homeView());
    opening = true;
    revealed = false;
    openAt = clock;
    for (const k of SKIP) addEventListener(k, endOpening, { capture: true, passive: true });
    wake();
  }
  const wake = () => { if (!raf && !held && !paused && !compiling && !gone) raf = requestAnimationFrame(loop); };
  function loop(now) {
    raf = still || paused ? 0 : requestAnimationFrame(loop);
    if (!last) t0 = now; // the clock starts with the first frame, so the opening is seen from its start
    const t = (now - t0) / 1000, dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    clock = t;
    if (opening) {
      const u = t - openAt;
      if (u < INTRO && !controls.userMoved) view(introView(u));
      else endOpening();
      if (u > 0.6 * INTRO && !revealed) { revealed = true; onReveal?.(); }
    }
    if (last && !still) resBy(now - last);
    last = now;
    draw(still ? 0 : t, dt);
  }
  controls.addEventListener('start', touched);
  controls.addEventListener('change', wake);
  const onResize = () => { resize(); if (!controls.userMoved) { Object.assign(home, homeView()); view(home); } wake(); };
  addEventListener('resize', onResize);
  // The shaders: where the GPU can compile them side by side (KHR_parallel_shader_compile), every program of the four
  // passes is started after the page's own start (a turn later, a pass or so a turn), each for the target its pass
  // draws into, and the loop waits for them; their uniforms are then read back a program a turn (a round trip apiece,
  // which three does on a program's first use), so no frame or task holds the page for them, as the planet's does
  // (apps/planet/base.js). The pixels are the same.
  if (renderer.extensions.has('KHR_parallel_shader_compile')) {
    compiling = true;
    (async () => {
      const ready = [];
      for (const [s, target] of [[scene, rt], [warpScene, bent], [jetScene, bent], [screenScene, null]]) {
        await pace();
        if (gone) return;
        renderer.setRenderTarget(target);
        ready.push(renderer.compileAsync(s, camera));
        renderer.setRenderTarget(null);
      }
      await Promise.all(ready);
      for (const program of renderer.info.programs) {
        await pace();
        if (gone) return;
        program.getUniforms();
      }
      compiling = false;
      wake();
    })();
  } else raf = requestAnimationFrame(loop);

  // ---- what the page asks
  const scr = new THREE.Vector3(), planetAt = new THREE.Vector3(), planetXyz = [0, 0, 0], galaxyInv = new THREE.Matrix4();
  // where the pivot stands on the screen (CSS px in the host)
  const pivotOnScreen = () => aim;
  // A point at o (device px, GL axes) as the lens shows it: its primary image, pushed out from the hole along its
  // own way by the law the warp bends the frame with (beta = theta - k E^2 / theta, solved for theta).
  function bend(o) {
    const e = warpU.uE.value, h = lensU.uHole.value, dx = o.x - h.x, dy = o.y - h.y, b = Math.hypot(dx, dy);
    if (!e || b < 1e-6) return;
    const tl = warpU.uTilt.value, k = smooth(-0.6, 0.3, (-Math.sin(tl) * dx + Math.cos(tl) * dy) / b);
    const s = (b + Math.sqrt(b * b + 4 * k * e * e)) / (2 * b);
    o.x = h.x + dx * s;
    o.y = h.y + dy * s;
  }
  function screenOfPoint(p, out = {}) {
    scr.fromArray(p).applyMatrix4(galaxy.matrixWorld).project(camera);
    out.visible = scr.z < 1 && Math.abs(scr.x) < 1.2 && Math.abs(scr.y) < 1.2;
    out.x = (scr.x * 0.5 + 0.5) * size.x;
    out.y = (scr.y * 0.5 + 0.5) * size.y;
    bend(out);
    out.x *= css.w / size.x;
    out.y = css.h - (out.y * css.h) / size.y;
    return out;
  }
  // how far the lens moves week i's star on the screen (CSS px; held to a reach, as a star right behind the hole
  // would be thrown far)
  const lensAt = {};
  function lensOf(i, out) {
    scr.fromArray(W[i].pos).applyMatrix4(galaxy.matrixWorld).project(camera);
    const x = (scr.x * 0.5 + 0.5) * size.x, y = (scr.y * 0.5 + 0.5) * size.y;
    lensAt.x = x;
    lensAt.y = y;
    bend(lensAt);
    out.x = clamp(((lensAt.x - x) * css.w) / size.x, -120, 120);
    out.y = clamp((-(lensAt.y - y) * css.h) / size.y, -120, 120);
  }
  const cssScale = () => css.h / (2 * Math.tan((FOV * Math.PI) / 360));
  function reachPx(p, reach) {
    scr.fromArray(p).applyMatrix4(galaxy.matrixWorld);
    return (reach * cssScale()) / Math.max(1e-3, scr.distanceTo(camera.position));
  }
  const at = {};
  return {
    canvas: renderer.domElement,
    /** The weeks under (x, y), CSS px in the host, within `radius` px of their star or phenomenon: nearest first. */
    pickAt(x, y, radius) {
      const near = new Map();
      for (const [p, i, reach] of targets) {
        screenOfPoint(p, at);
        if (!at.visible) continue;
        const d = Math.hypot(at.x - x, at.y - y) / Math.max(radius, reachPx(p, reach));
        if (d < 1 && !(near.get(i) <= d)) near.set(i, d);
      }
      return [...near.keys()].sort((a, b) => near.get(a) - near.get(b));
    },
    /** Where week i's star stands: { x, y, r, visible }, written into `out`; r is the radius on the screen (px) of
     *  its star, or of a ball R galaxy radii across its half standing there. */
    screenOf(i, out = {}, R = W[i].size) {
      const p = W[i].pos;
      screenOfPoint(p, out);
      out.r = reachPx(p, R);
      return out;
    },
    /** Where week i's planet stands on the screen: { x, y, r, visible } (CSS px, as the lens shows it), r half the
     *  side of its still there (the still's square inscribed in the circle, its globe inside as in the still). The
     *  picked week's is where it stands once its system has turned to it (galaxy-system.js pickTarget). */
    planetOf(i, out = {}) {
      const R = i === guide.i ? systems.pickTarget(i, planetAt) : systems.planetNow(i, planetAt);
      planetAt.applyMatrix4(galaxyInv.copy(galaxy.matrixWorld).invert()).toArray(planetXyz);
      screenOfPoint(planetXyz, out);
      out.r = reachPx(planetXyz, R);
      return out;
    },
    /** Lay a canvas or ImageBitmap (framed as the shelf's still) on week i's planet in place of its still; null lays
     *  the still again. */
    paintWeek(i, source) { systems.paint(i, source); wake(); },
    screenOfPoint,
    /** Ring week i for a moment (a pointer over it), or (i < 0) the picked week again. */
    hover(i) { weekU.uHover.value = i < 0 ? guide.i : i; wake(); },
    /** Pick week i: ringed (the comeback's dwarf and its stream lit with their week), and (carry) the eye carried to
     *  it along the arms, or turned there if it is being carried already; i < 0 lets it go (the eye stays). With a
     *  week picked two fingers zoom along its rail, not OrbitControls' own dolly. */
    select(i, carry = true) {
      const from = guide.i;
      guide.i = i;
      weekU.uHover.value = i;
      if (dwarf) dwarf.lit.value = i >= 0 && i === g.comeback.at ? 1 : 0;
      controls.enableZoom = i < 0 || !dive;
      // a week let go while the eye is closer than a free eye may come leaves it there (no snap out)
      controls.minDistance = Math.min(0.12, i < 0 || !dive ? camera.position.distanceTo(controls.target) : 0.9 * diveDist());
      if (i < 0) guide.on = false;
      else if (carry && !guide.on) startGuide(from);
      wake();
    },
    /** Whether the guide has the eye (no touch has taken it back since a week was picked). */
    guided: () => guide.on,
    /** How many CSS px a galaxy radius is across at the guide's distance: the scale a picked week is shown at. */
    nearScale: () => stepPx() / ARM_STEP,
    /** Zoom (eased) toward (x, y), CSS px in the host, or toward the pivot without them: factor over 1 comes in. */
    zoomAt(x, y, factor) {
      touched();
      const r = renderer.domElement.getBoundingClientRect(), p = x == null ? pivotOnScreen() : { x, y };
      queueZoom((-100 * Math.log(factor)) / -Math.log(0.95), r.left + p.x, r.top + p.y);
    },
    /** A wheel event over something the page lays on the galaxy (a week's card): zoom as if it fell on the galaxy. */
    wheel: onWheel,
    /** Fly back to the whole galaxy as it stands now (the newest week on the near side). */
    reset() {
      touched();
      flyTo(homeView(), 1.3, false, () => { Object.assign(home, homeView()); controls.userMoved = false; });
    },
    /** Fly close to the hole, from the side its disc arches over (as the opening begins, a little further off),
     *  to the page's spot. */
    toHole() {
      touched();
      flyTo({ ...introView(0), distance: introView(0).distance * 1.8, target: [0, 0, 0] }, 1.6, true);
    },
    /** The page's words have moved (their room, the spot): frame the galaxy to suit. */
    layout: () => onResize(),
    /** Whether the eye has been moved off the whole-galaxy view (and not flown back to it); never in the opening. */
    moved() {
      if (opening) return false;
      const p = poseNow(poseC), turned = Math.atan2(Math.sin(p.azimuth - home.azimuth), Math.cos(p.azimuth - home.azimuth));
      return Math.abs(Math.log(p.distance / home.distance)) > 0.06 || Math.hypot(...p.target) > 0.03 || Math.abs(turned) > 0.06 || Math.abs(p.elevation - home.elevation) > 0.05;
    },
    /** Play the opening from the hole out to the whole galaxy (no week picked); none with reduced motion. */
    playOpening,
    /** End the opening now, as any key or tap does (for a Skip control). */
    skipOpening: () => endOpening(),
    view(v2) { controls.userMoved = true; endOpening(); flight = null; wheelLeft = 0; guide.on = false; aimSpot = false; Object.assign(aim, roomAim()); frameSheet(); view(v2); },
    /** The eye now, as view() takes it. */
    now: () => poseNow({}),
    /** How far the eye is, as a share of the whole-galaxy view's distance (1 at home, less nearer). */
    zoom: () => camera.position.distanceTo(controls.target) / homeDist,
    /** Where the comeback's dwarf galaxy stands (in the galaxy, as screenOfPoint takes it), or null. */
    dwarfAt: dwarf ? dwarf.at : null,
    /** Fetch the weeks' paintings for their planets now (they come by themselves once the eye is near): for a capture. */
    paintings: () => systems.load(),
    home: () => ({ ...home }),
    /** The opening's camera at t seconds, for a capture to fly it (view() it, then frame(t)). */
    introView: (t) => ({ ...introView(t) }),
    /** Draw one frame at time t (seconds) and stop the clock there (the galaxy turned as far as t): for a capture,
     *  drawn at the screen's full ratio whatever the frames before it cost. */
    frame(t) {
      cancelAnimationFrame(raf);
      raf = 0;
      held = true;
      if (res.step) resStep(0);
      turn = SPIN * t;
      draw(t, 0);
    },
    /** Zoom by f (over 1 in) at once, toward (x, y) client px (the pivot without them): the rest of a pinch that
     *  began over the dive's planet. */
    zoomBy(f, x, y) {
      touched();
      const r = renderer.domElement.getBoundingClientRect(), p = pivotOnScreen();
      zoomBy(f, x ?? r.left + p.x, y ?? r.top + p.y);
      wake();
    },
    /** Put the eye at once where a zoom in on week i hands over to its planet (its planet `box` CSS px across, by
     *  default dive.box()): the way back up from the planet starts there. */
    atDive(i, box) {
      endOpening();
      touched();
      wheelLeft = 0;
      // ponytail: OrbitControls' leftover glide and zoom (private; vendored r17x) would carry on from the frozen frame
      controls._sphericalDelta.set(0, 0, 0);
      controls._panOffset.set(0, 0, 0);
      controls._scale = 1;
      const d = diveDist(box);
      controls.minDistance = Math.min(0.12, 0.9 * d);
      divePose(i, railP, d);
      for (let k = 0; k < 2; k++) { // the lens's shift of the week, read the second time at the pose itself
        Object.assign(aim, diveAim(i));
        aimSpot = true;
        frameSheet();
        view(railP);
      }
      wake();
    },
    /** Stop drawing (the dive's planet has the screen; the canvas keeps the frame drawn now, as the eye stands), or
     *  draw again. Paused, every zoom goes to dive.zoom. */
    pause(on) {
      if (!on) {
        paused = false;
        return wake();
      }
      if (!paused && !held) draw(still ? 0 : clock, 0);
      paused = true;
      cancelAnimationFrame(raf);
      raf = 0;
      if (wheelLeft) { const f = 0.95 ** (wheelLeft / 100); wheelLeft = 0; dive?.zoom(f); }
    },
    dispose() {
      gone = true; // nothing wakes it again, and the shaders' walk stops
      cancelAnimationFrame(raf);
      removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('wheel', onWheel, true);
      for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) doc.removeEventListener(type, onFinger, true);
      for (const k of SKIP) removeEventListener(k, endOpening, true);
      controls.dispose();
      for (const s of [scene, warpScene, jetScene, screenScene]) {
        s.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
      }
      systems.dispose();
      for (const d of disposables) d.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

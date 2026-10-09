/* Planet Creator — the race week as an eclipse (bodies/star.js, star.look 3).
 *
 * The week stays its own rock world, and it is given a sun of its own: a close,
 * bright one standing behind the globe, a little larger on the sheet than the
 * world and nearly all of it hidden. What is left of it burns round the
 * silhouette as a ring, thickest on the side the poster's light comes from; a
 * bead of light breaks where its limb crosses the world's, the corona streams
 * out past both, and the world's air is lit from behind as a thin red ring. The
 * face the painter sees is the backlit one: the week's ground under a deep blue
 * wash, with a thin lit sliver along the sun's side.
 *
 * Everything is one screen pass (bodies/index.js: post) laid over the finished
 * ink frame, placed against the sheet each frame from the camera that draws it,
 * the way the week's own star is (system.js): the globe's disc on the sheet, the
 * light's bearing across it, and the depth buffer for what stands in front of
 * the sun. The sun drifts a little round the world on a slow clock, so the bead
 * travels along the limb. On foot the same sun hangs where the light really is,
 * large and low.
 *
 * Deterministic: the only clock is uTime.
 */
import { ringMute } from './star.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (value, fallback) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

// The close sun on the sheet, in the globe's own silhouette radii: its radius,
// how far its centre stands off the globe's along the bearing, and the light's
// angle off the eye's own axis behind the world (the lit sliver's width).
const SUN_K = 1.10;
const SUN_OFF = 0.15;
const TILT = 0.50;
// the bearing leans up the sheet, so the thick of the ring stands over the world
const LIFT = 0.7;
// the slow drift of the sun round the world: radians of bearing, and its rate
const DRIFT = 0.30;
const DRIFT_RATE = 0.11;

export function createLook(shared) {
  const { THREE: T, features, scene } = shared;
  const R = num(shared.R, 120);
  const rho = R + Math.max(0, num(features?.seaLevel, 0)) + 1.5;
  const seed = num(features?.makeRng?.('body/eclipse')?.(), 0.37) * 100;
  const mute = ringMute(scene, true);
  mute();
  const state = { surface: 0 };
  const _p = new T.Vector3(), _e = new T.Vector3(), _r = new T.Vector3(), _u = new T.Vector3(), _s = new T.Vector3();

  const post = {
    id: 'star-eclipse',
    fragment: ECLIPSE_FRAG,
    uniforms() {
      return {
        uCenter: { value: new T.Vector2(0.5, 0.5) },
        uRad: { value: 100 },
        uBear: { value: new T.Vector2(0.6, 0.8) },
        uSunUv: { value: new T.Vector2(0.5, 0.8) },
        uFoot: { value: 0 },
        uSeedE: { value: seed },
        uSunK: { value: SUN_K },
        uSunOff: { value: SUN_OFF },
        uTilt: { value: TILT },
        uSunCore: { value: new T.Color('#fffaf0') },
        uSunEdge: { value: new T.Color('#ff9a3a') },
        uCorona: { value: new T.Color('#ffd9a6') },
        uRimHot: { value: new T.Color('#fff3d6') },
        uRimWarm: { value: new T.Color('#ff6a3a') },
        uNight: { value: new T.Color('#0e1530') },
      };
    },
    update(ctx, u) {
      const cam = ctx.camera;
      const res = ctx.resolution;
      if (!cam || !res) return;
      u.uFoot.value = state.surface;
      _p.set(0, 0, 0).project(cam);
      u.uCenter.value.set(_p.x * 0.5 + 0.5, _p.y * 0.5 + 0.5);
      const d0 = cam.position.length();
      const f = (res.y * 0.5) / Math.tan((cam.fov * Math.PI) / 360);
      u.uRad.value = d0 > rho * 1.02 ? (f * rho) / Math.sqrt(Math.max(1e-3, d0 * d0 - rho * rho)) : f * 6;
      const light = ctx.light?.value;
      if (!light) return;
      // the light's bearing across the eye, in the camera's own right and up
      // (ink.js reads the air's gather the same way), leant up the sheet and
      // turned a little on the slow clock
      _e.copy(cam.position).normalize();
      _s.copy(light).addScaledVector(_e, -light.dot(_e));
      _r.setFromMatrixColumn(cam.matrixWorld, 0);
      _u.setFromMatrixColumn(cam.matrixWorld, 1);
      let bx = _s.dot(_r), by = _s.dot(_u);
      const bl = Math.hypot(bx, by);
      if (bl > 1e-4) { bx /= bl; by /= bl; } else { bx = 0.6; by = 0.8; }
      const a = Math.atan2(by + LIFT, bx) + DRIFT * Math.sin(num(ctx.time?.value, 0) * DRIFT_RATE + seed);
      u.uBear.value.set(Math.cos(a), Math.sin(a));
      _p.copy(light).multiplyScalar(4000).add(cam.position).project(cam);
      u.uSunUv.value.set(_p.x * 0.5 + 0.5, _p.y * 0.5 + 0.5);
    },
  };

  return {
    post,
    update({ surface } = {}) {
      mute();
      state.surface = clamp(num(surface, 0), 0, 1);
    },
    dispose() {},
  };
}

const ECLIPSE_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tDiffuse, tDepth;
uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uCenter, uBear, uSunUv;
uniform float uRad, uFoot, uSeedE, uSunK, uSunOff, uTilt;
uniform vec3 uSunCore, uSunEdge, uCorona, uRimHot, uRimWarm, uNight;

float ecH(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float ecN(vec2 x) {
  vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ecH(i), ecH(i + vec2(1.0, 0.0)), f.x), mix(ecH(i + vec2(0.0, 1.0)), ecH(i + vec2(1.0, 1.0)), f.x), f.y);
}
float ecF(vec2 x) { return 0.55 * ecN(x) + 0.28 * ecN(x * 2.03 + 7.1) + 0.17 * ecN(x * 4.11 + 3.7); }

// the sun's own face: white nearly to its edge, where it goes gold and then a
// thin orange, with a soft boil of cells across it
vec3 ecDisc(vec2 p, float t) {
  float mu = sqrt(max(0.0, 1.0 - dot(p, p)));
  float cells = ecF(p * 22.0 + vec2(uSeedE, t * 0.05));
  vec3 c = mix(uSunEdge, uSunCore, smoothstep(0.02, 0.45, mu));
  return c * (0.95 + 0.07 * cells * smoothstep(0.0, 0.5, mu));
}

void main() {
  vec4 src = texture2D(tDiffuse, vUv);
  vec3 c = src.rgb;
  float depth = texture2D(tDepth, vUv).r;
  // the cleared depth is exactly the far plane; a globe a thousand units off
  // already reads 0.99995, so the test has to sit far closer to one than that
  float sky = step(0.9999995, depth);
  vec2 px = vUv * uResolution;
  float t = uTime;
  float orbit = 1.0 - uFoot;

  if (orbit > 0.001) {
    vec2 q = (px - uCenter * uResolution) / max(uRad, 1.0);   // in globe radii
    float r = length(q);
    vec2 qn = q / max(r, 1e-5);
    float aa = 1.6 / max(uRad, 1.0);
    vec2 sc = uBear * uSunOff;
    vec2 qs = (q - sc) / uSunK;                                 // in sun radii
    float rs = length(qs);
    vec2 sd = qs / max(rs, 1e-5);   // noise is read on the direction, never on an angle (no seam)
    float toward = max(dot(qn, uBear), 0.0);

    // ---- the planet's backlit face: the sun stands behind it, tilted toward
    // the bearing, so only a sliver along that limb takes the light
    float onGlobe = (1.0 - sky) * (1.0 - smoothstep(1.18, 1.30, r));
    if (onGlobe > 0.0) {
      vec3 n = vec3(qn * min(r, 1.0), sqrt(max(0.0, 1.0 - min(r * r, 1.0))));
      vec3 ls = normalize(vec3(uBear * sin(uTilt), -cos(uTilt)));
      float wob = (ecF(q * 6.0 + uSeedE) - 0.5) * 0.07;
      float ndl = dot(n, ls) + wob;
      float lit = smoothstep(-0.04, 0.20, ndl);
      float lum = dot(c, vec3(0.30, 0.55, 0.15));
      // the night keeps the week's ground under a deep blue wash, a shade
      // lighter toward the sun's side, where the air scatters a little light in
      vec3 night = mix(uNight, c * vec3(0.30, 0.34, 0.52), 0.55) + uNight * 0.25 * (1.0 - lum);
      night *= 0.80 + 0.35 * smoothstep(-0.6, 0.9, dot(qn, uBear) * min(r, 1.0));
      // what stands proud of the sea's own disc is a silhouette against the light
      float proud = smoothstep(0.992, 1.012, r);
      night = mix(night, uNight * 0.42, proud);
      float rim = smoothstep(0.80, 1.0, r);
      vec3 day = mix(c, uRimHot, 0.25 + 0.45 * rim) * (1.0 + 0.15 * lit);
      vec3 shade = mix(night, day, lit);
      // the terminator's own band: the light that reaches it has crossed the
      // air, and comes in the colour of an evening
      float band = exp(-pow(ndl / 0.06, 2.0)) * smoothstep(0.5, 0.95, r);
      shade += uRimWarm * band * 0.32;
      c = mix(c, shade, onGlobe);
    }

    // ---- the sun, wherever nothing stands in front of it
    // its edge is a hand's, not a compass's: wandered a little, and the
    // pigment pooled along it as a wash dries at its own rim
    float wander = (ecN(sd * 9.0 + uSeedE * 0.7) - 0.5) * 0.012 + (ecN(sd * 31.0 + 5.0) - 0.5) * 0.004;
    float rw = rs + wander;
    float sunIn = 1.0 - smoothstep(1.0 - aa / uSunK, 1.0 + aa / uSunK, rw);
    vec3 face = ecDisc(qs, t) * (0.97 + 0.06 * ecH(floor(px * 0.6) + 3.0));
    face = mix(face, uSunEdge * 0.92, exp(-pow((1.0 - rw) / 0.010, 2.0)) * 0.55);
    c = mix(c, face, sunIn * sky);

    // ---- its corona: the inner crown packed tight to the limb, and the
    // streamers drawn out of it at their own lengths
    if (rs > 0.97) {
      float x = max(rs - 1.0, 0.0);
      float s1 = ecN(sd * 2.1 + vec2(uSeedE, 1.3));
      float s2 = ecN(sd * 5.9 + vec2(9.0 + x * 0.6 - t * 0.012, 4.0));
      float s3 = ecN(sd * 21.0 + vec2(3.0, x * 1.8 - t * 0.025));
      float helmets = pow(s1, 2.2);
      float reach = 0.12 + 1.10 * helmets + 0.25 * s2;
      float inner = exp(-x / 0.045);
      float streamer = exp(-x / reach) * (0.25 + 0.75 * helmets) * (0.55 + 0.45 * s3);
      float glow = inner * 0.95 + streamer * 0.55 + exp(-x / 0.35) * 0.10;
      float root = smoothstep(0.995, 1.01, rs);
      // the crown is laid with a dry brush: the paper's own tooth breaks it
      float tooth = 0.82 + 0.36 * ecH(floor(px * 0.75));
      vec3 cor = mix(uCorona, uSunCore, inner);
      c += cor * glow * root * (0.35 + 0.65 * sky) * mix(1.0, tooth, 0.6 * (1.0 - inner));
    }

    // ---- the world's air, lit from behind: a thin bright ring at the
    // silhouette, white where the sun is, an evening red round the rest
    // (over the sky only once past the sea's own disc: a summit standing proud of
    // the limb is in front of the ring, not lit by it)
    float ring = exp(-max(r - 1.0, 0.0) / 0.018) * smoothstep(0.972, 1.0, r) * mix(1.0, sky, step(1.0, r));
    vec3 air = mix(uRimWarm, uRimHot, pow(toward, 1.4));
    c += air * ring * (0.50 + 0.70 * toward);
    c += uRimWarm * exp(-max(r - 1.0, 0.0) / 0.07) * smoothstep(0.99, 1.02, r) * 0.12 * (1.0 - toward) * sky;

    // ---- the beads: where the sun's limb crosses the world's, the light breaks
    // through as a short bright arc hugging the limb, and a soft halo round it
    float dd = length(sc);
    if (dd > abs(uSunK - 1.0) && dd < uSunK + 1.0) {
      float a = (1.0 - uSunK * uSunK + dd * dd) / (2.0 * dd);
      float h = sqrt(max(0.0, 1.0 - a * a));
      vec2 ax = sc / dd, pe = vec2(-ax.y, ax.x);
      for (int k = 0; k < 2; k++) {
        float sgn = k == 0 ? 1.0 : -1.0;
        vec2 b = ax * a + pe * h * sgn;
        float along = length(qn - b);
        float arc = exp(-pow((r - 1.004) / 0.012, 2.0)) * exp(-pow(along / 0.13, 2.0));
        float db = length(q - b);
        float halo = exp(-db / 0.05) * 0.70 + exp(-db / 0.20) * 0.18;
        float gain = k == 0 ? 1.0 : 0.45;
        c += uRimHot * (arc * 1.6 + halo) * gain;
      }
    }

    // ---- the sheet round it, lifted a little by so much light
    c += uCorona * exp(-max(rs - 1.0, 0.0) / 0.9) * 0.025 * sky;
    c = mix(src.rgb, c, orbit);
  }

  // ---- on foot: the close sun stands where the light does, large and low
  if (uFoot > 0.001) {
    vec2 rel = (vUv - uSunUv) * uResolution;
    float qh = max(uResolution.y, 1.0) * 0.075;
    float sr = length(rel) / qh;
    float edge = 1.0 - smoothstep(0.97, 1.03, sr);
    vec3 glow = uCorona * (exp(-max(sr - 1.0, 0.0) / 0.4) * 0.55 + exp(-sr / 6.0) * 0.22);
    c = mix(c, ecDisc(rel / qh, t), edge * sky * uFoot);
    c += glow * sky * uFoot;
  }
  gl_FragColor = vec4(min(c, vec3(1.0)), src.a);
}
`;

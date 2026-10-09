/* Planet Creator — the race week lacquered (bodies/star.js, star.look 4).
 *
 * The week stays its own rock world, every coast and range of it, and is made
 * an object: a lacquered sphere, the land laid in gold, the sea in black
 * urushi, the race in the vermilion the race line already is (shu, the third
 * colour of the lacquer box). The pigments are the body's palette (star.js,
 * lacquer); this module is the metal and the gloss.
 *
 * The gold is laid over the ground's own wash in the terrain's shader (`ground`):
 * the wash's value says which leaf is in shadow and which is lit, and a metal's
 * light is laid on it, dark bronze where the leaf faces away from the light's
 * reflection and pale gold where it catches it, with a dust of flakes (nashiji)
 * each turned its own way, so the sphere glints as it turns. The gloss is the
 * body's screen pass: one soft window of light reflected in the lacquer, a
 * darker lacquer toward the limb, and a thin gold line round the silhouette,
 * the rim of a lacquer box.
 *
 * Deterministic: shapes from the week, motion only from the clock.
 */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (value, fallback) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

export function createLook(shared) {
  const { THREE: T, features } = shared;
  const R = num(shared.R, 120);
  const rho = R + Math.max(0, num(features?.seaLevel, 0)) + 1.0;
  const state = { surface: 0 };
  const ground = {
    glsl: GOLD_GLSL,
    uniforms: {
      uGoldDeep: { value: new T.Color('#3a2408') },
      uGold: { value: new T.Color('#b88a2e') },
      uGoldHi: { value: new T.Color('#ffe8a8') },
    },
  };
  const _p = new T.Vector3();
  const post = {
    id: 'star-lacquer',
    fragment: GLOSS_FRAG,
    uniforms() {
      return {
        uCenter: { value: new T.Vector2(0.5, 0.5) },
        uRad: { value: 100 },
        uFoot: { value: 0 },
        uRimGold: { value: new T.Color('#d9b25a') },
        uWindow: { value: new T.Color('#fff4dc') },
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
    },
  };
  return {
    ground,
    post,
    update({ surface } = {}) {
      state.surface = clamp(num(surface, 0), 0, 1);
    },
    dispose() {},
  };
}

// laid inside the terrain's own shader, after its wash (bodies/index.js: ground)
const GOLD_GLSL = /* glsl */ `
uniform vec3 uGoldDeep, uGold, uGoldHi;
float lqH(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 bodyGround(vec3 c, vec3 dW, vec3 n, vec3 V, float dist, float fp, float tooth, float sunSh){
  // the land only: the sea floor stays under its black
  float land = smoothstep(-0.15, 0.35, vH);
  // the wash's own value is the relief the leaf is laid over
  float lum = dot(c, vec3(0.30, 0.59, 0.11));
  vec3 L = normalize(uLight);
  vec3 H = normalize(L + V);
  float nh = max(dot(n, H), 0.0);
  float sheen = pow(nh, 5.0);
  float glint = pow(nh, 48.0);
  // the leaf: dark bronze where it faces away from the light's reflection,
  // pale gold where it catches it
  vec3 gold = mix(uGoldDeep, uGold, smoothstep(0.08, 0.80, lum));
  gold = mix(gold, uGoldHi, clamp(sheen * 0.65 + glint * 0.9, 0.0, 1.0));
  // nashiji: a dust of flakes, each turned its own way, a few catching the light
  vec3 cell = floor(dW * 1400.0);
  float fh = lqH(cell + 17.0);
  vec3 fn = normalize(n + (vec3(lqH(cell + 3.0), lqH(cell + 7.0), lqH(cell + 11.0)) - 0.5) * 0.9);
  float catchL = pow(max(dot(fn, H), 0.0), 40.0) * step(0.70, fh);
  gold += uGoldHi * catchL * 0.55 * (1.0 - uSurface * 0.5);
  // the paper's own tooth still under it
  gold *= 0.94 + 0.10 * tooth;
  return mix(c, gold, land);
}
`;

const GLOSS_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tDiffuse, tDepth;
uniform vec2 uResolution;
uniform vec2 uCenter;
uniform float uRad, uFoot, uTime;
uniform vec3 uRimGold, uWindow;
float lgH(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
void main() {
  vec4 src = texture2D(tDiffuse, vUv);
  vec3 c = src.rgb;
  float orbit = 1.0 - uFoot;
  if (orbit > 0.001) {
    float sky = step(0.9999995, texture2D(tDepth, vUv).r);
    vec2 q = (vUv - uCenter) * uResolution / max(uRad, 1.0);
    float r = length(q);
    if (r < 1.06) {
      float onGlobe = 1.0 - sky;
      vec3 n = vec3(q, sqrt(max(0.0, 1.0 - min(r * r, 1.0))));
      // the eye's own ray reflected in the lacquer
      vec3 refl = vec3(2.0 * n.z * n.xy, 2.0 * n.z * n.z - 1.0);
      // one soft window of light, up and to the left behind the painter
      vec2 w = (refl.xy - vec2(-0.42, 0.50)) / vec2(0.30, 0.20);
      float win = exp(-pow(dot(w, w), 1.6)) * smoothstep(0.0, 0.3, refl.z);
      // a second, fainter one low on the right, as a room gives
      vec2 w2 = (refl.xy - vec2(0.55, -0.48)) / vec2(0.22, 0.12);
      win += 0.35 * exp(-pow(dot(w2, w2), 1.6)) * smoothstep(0.0, 0.3, refl.z);
      // the lacquer darker toward the limb, where it holds less of the room
      float limb = smoothstep(0.55, 1.0, r);
      float tooth = 0.92 + 0.16 * lgH(floor(vUv * uResolution * 0.7));
      vec3 g = c * (1.0 - 0.28 * limb);
      g += uWindow * win * 0.42 * tooth;
      // the rim of the box: a thin line of gold round the silhouette
      float rim = exp(-pow((r - 0.992) / 0.006, 2.0));
      g = mix(g, uRimGold, rim * 0.75);
      c = mix(c, g, onGlobe * orbit);
    }
  }
  gl_FragColor = vec4(min(c, vec3(1.0)), src.a);
}
`;

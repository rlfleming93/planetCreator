/* Planet Creator — the painted star (bodies/star.js, star.look 1).
 *
 * The same rule as the star (a race week of real hours, or the season's
 * longest), the same crust underfoot, and a sun drawn the way a sun is seen:
 * the disc is darkest and reddest at its limb and white-gold at its middle
 * (limb darkening, the thing a flat disc lacks), its face a soft boil of
 * granules with the bright faculae gathered toward the edge, the week's places
 * as spot groups turned to the face the poster reads, a thin rose chromosphere
 * at the silhouette, prominences standing off the limb as glowing loops, and a
 * pearl corona that is light and not paint: it lifts the dark round the disc,
 * streamers drawn out of it at their own lengths.
 *
 * Deterministic: the week's own PRNG, and uTime the only clock.
 */
import { buildArcs, painterAxis, ringMute } from './star.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (value, fallback) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const SPOTS = 6;

export function createLook(shared) {
  const { THREE: T, features, scene } = shared;
  const R = num(shared.R, 120);
  const cap = num(features?.orbit?.reliefCap, 12);
  const shellR = R + Math.max(cap, 6) + 2.4;
  const rng = features?.makeRng ? features.makeRng('body/star-painted') : (() => 0.5);
  const seed = rng() * 100;
  const sun = (shared.light?.value || new T.Vector3(0.55, 0.72, 0.42)).clone().normalize();
  const eye = painterAxis(T, features, sun);
  const mute = ringMute(scene, true);
  mute();
  const hot = clamp(num(features?.warmth, 0.5), 0, 1);

  // the week's places as spot groups, turned into the cone the poster reads
  const spots = [];
  const sites = Array.isArray(features?.list) ? features.list.filter((f) => f?.dir) : [];
  for (let i = 0; i < SPOTS / 2; i++) {
    const d = (sites[i]?.dir?.clone() || new T.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5)).normalize();
    d.lerp(eye, 0.62 + 0.12 * rng()).normalize();
    const hours = Math.max(0.6, num(sites[i]?.stats?.activeS, 3600) / 3600);
    const size = 0.022 + 0.020 * clamp(hours / 3, 0, 1);
    const east = new T.Vector3().crossVectors(new T.Vector3(0, 1, 0), d).normalize();
    spots.push(d, d.clone().addScaledVector(east, size * 1.7).normalize());
    spots.sizes = [...(spots.sizes || []), size, size * 0.5];
  }
  const photoU = {
    uSpots: { value: spots.slice(0, SPOTS) },
    uSize: { value: spots.sizes.slice(0, SPOTS) },
    uSeedP: { value: seed },
    uHot: { value: hot },
    uTime: { value: 0 },
    uFade: { value: 1 },
  };
  const photoGeo = new T.SphereGeometry(shellR, 192, 128);
  const photoMat = new T.ShaderMaterial({ uniforms: photoU, vertexShader: SHELL_VERT, fragmentShader: PHOTO_FRAG, transparent: true });
  const photo = new T.Mesh(photoGeo, photoMat);
  photo.name = 'body-star-photosphere';

  const arcU = { uTime: { value: 0 }, uFade: { value: 1 } };
  const arcs = new T.Mesh(
    buildArcs(T, { R: shellR + 0.35, eye, rng, hot, count: 6 }),
    new T.ShaderMaterial({ uniforms: arcU, vertexShader: ARC_VERT, fragmentShader: ARC_FRAG, transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending }),
  );
  arcs.name = 'body-star-prominences';
  const group = new T.Group();
  group.name = 'body-star';
  group.add(arcs, photo);

  const insideSq = (shellR + 4) ** 2;
  const state = { surface: 0, presence: 1 };
  const _p = new T.Vector3();
  const post = {
    id: 'star-painted-corona',
    fragment: CORONA_FRAG,
    uniforms() {
      return {
        uCenter: { value: new T.Vector2(0.5, 0.5) },
        uRad: { value: 100 },
        uSunUv: { value: new T.Vector2(0.5, 0.9) },
        uPresence: { value: 1 },
        uFoot: { value: 0 },
        uSeedC: { value: seed },
        uPearl: { value: new T.Color('#fff1d8') },
        uGold: { value: new T.Color('#ffb85a') },
        uRose: { value: new T.Color('#ff6f6a') },
      };
    },
    update(ctx, u) {
      const cam = ctx.camera, res = ctx.resolution;
      if (!cam || !res) return;
      u.uPresence.value = state.presence;
      u.uFoot.value = state.surface;
      _p.set(0, 0, 0).project(cam);
      u.uCenter.value.set(_p.x * 0.5 + 0.5, _p.y * 0.5 + 0.5);
      const d0 = cam.position.length();
      const f = (res.y * 0.5) / Math.tan((cam.fov * Math.PI) / 360);
      u.uRad.value = d0 > shellR * 1.02 ? (f * shellR) / Math.sqrt(Math.max(1e-3, d0 * d0 - shellR * shellR)) : f * 6;
      const light = ctx.light?.value;
      if (light) {
        _p.copy(light).multiplyScalar(4000).add(cam.position).project(cam);
        u.uSunUv.value.set(_p.x * 0.5 + 0.5, _p.y * 0.5 + 0.5);
      }
    },
  };

  return {
    object: group,
    post,
    update({ camera, surface, time } = {}) {
      mute();
      const t = num(time, 0);
      photoU.uTime.value = t;
      arcU.uTime.value = t;
      state.surface = clamp(num(surface, 0), 0, 1);
      state.presence = 1 - Math.min(1, Math.max(0, (state.surface - 0.02) / 0.14));
      photoU.uFade.value = state.presence;
      arcU.uFade.value = state.presence;
      const under = !!(camera && camera.position.lengthSq() < insideSq);
      photo.visible = state.presence > 0.004 && !under;
      photoMat.depthWrite = state.presence > 0.985;
      arcs.visible = state.presence > 0.02 && !under;
    },
    dispose() {
      photoGeo.dispose();
      photoMat.dispose();
      arcs.geometry.dispose();
      arcs.material.dispose();
      if (group.parent) group.parent.remove(group);
    },
  };
}

const NOISE = /* glsl */ `
float spH(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float spN(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(spH(i), spH(i + vec3(1.0, 0.0, 0.0)), f.x), mix(spH(i + vec3(0.0, 1.0, 0.0)), spH(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(spH(i + vec3(0.0, 0.0, 1.0)), spH(i + vec3(1.0, 0.0, 1.0)), f.x), mix(spH(i + vec3(0.0, 1.0, 1.0)), spH(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
`;

const SHELL_VERT = /* glsl */ `
varying vec3 vDir;
varying vec3 vWorld;
varying vec3 vNrm;
void main() {
  vDir = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNrm = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const PHOTO_FRAG = /* glsl */ `
${NOISE}
varying vec3 vDir;
varying vec3 vWorld;
varying vec3 vNrm;
uniform vec3 uSpots[6];
uniform float uSize[6];
uniform float uSeedP, uHot, uTime, uFade;
void main() {
  vec3 d = normalize(vDir);
  float mu = clamp(dot(normalize(vNrm), normalize(cameraPosition - vWorld)), 0.0, 1.0);
  float t = uTime;
  // limb darkening: the disc's light falls off toward its edge as a sphere of
  // glowing gas does, and its colour cools with it, white gold to deep red
  float x = 1.0 - mu;
  float lum = 1.0 - 0.58 * x - 0.26 * x * x;
  vec3 deep = vec3(0.62, 0.13, 0.04), ember = vec3(0.93, 0.36, 0.08), gold = vec3(1.0, 0.70, 0.30);
  vec3 white = mix(vec3(1.0, 0.90, 0.70), vec3(1.0, 0.97, 0.88), uHot);
  vec3 c = mix(deep, ember, smoothstep(0.16, 0.42, lum));
  c = mix(c, gold, smoothstep(0.40, 0.70, lum));
  c = mix(c, white, smoothstep(0.68, 0.98, lum));
  // the granules: a soft cellular boil, foreshortened toward the limb, and the
  // slower mottle that gathers them
  vec3 p = d * 46.0 + vec3(t * 0.010, t * 0.006, uSeedP);
  vec3 ip = floor(p);
  float f1 = 9.0, f2 = 9.0;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) for (int k = -1; k <= 1; k++) {
    vec3 cell = ip + vec3(float(i), float(j), float(k));
    vec3 o = cell + vec3(spH(cell + 1.3), spH(cell + 7.1), spH(cell + 3.7)) - p;
    float dd = dot(o, o);
    if (dd < f1) { f2 = f1; f1 = dd; } else if (dd < f2) f2 = dd;
  }
  float lane = 1.0 - smoothstep(0.0, 0.32, sqrt(f2) - sqrt(f1));
  float mottle = spN(d * 7.0 + uSeedP) - 0.5;
  float grain = (0.5 - lane) * 0.05 * mix(0.35, 1.0, mu) * (1.0 - 0.6 * smoothstep(0.75, 1.0, lum)) + mottle * 0.09;
  c *= 1.0 + grain;
  // faculae: the bright network, read only toward the limb
  float fac = smoothstep(0.55, 0.85, spN(d * 16.0 + uSeedP * 2.0)) * smoothstep(0.75, 0.25, mu) * smoothstep(0.02, 0.15, mu);
  c = mix(c, white, fac * 0.45);
  // the week's own places as spot groups: a lobed umbra in a filamented penumbra
  float um = 0.0, pen = 0.0;
  for (int i = 0; i < 6; i++) {
    float a = uSize[i];
    if (a <= 0.0) continue;
    float q = length(d - normalize(uSpots[i])) / a;
    float lob = 0.85 + 0.25 * (spN(d * 90.0 + float(i) * 13.0) - 0.5) * 2.0;
    um = max(um, 1.0 - smoothstep(0.45 * lob, 0.62 * lob, q));
    pen = max(pen, (1.0 - smoothstep(0.95, 1.30, q)) * (0.75 + 0.25 * spN(d * 260.0)));
  }
  c = mix(c, c * vec3(0.55, 0.36, 0.26), pen * 0.75);
  c = mix(c, vec3(0.18, 0.05, 0.03), um * 0.92);
  // the chromosphere: a hair of rose at the very edge, broken by the boil
  c = mix(c, vec3(1.0, 0.42, 0.40), smoothstep(0.93, 1.0, x) * (0.4 + 0.5 * spN(d * 60.0 + t * 0.05)));
  gl_FragColor = vec4(c, uFade);
}
`;

const ARC_VERT = /* glsl */ `
attribute float aHeat;
varying float vHeat;
varying vec3 vDir;
void main() {
  vHeat = aHeat;
  vDir = normalize(position);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}
`;

const ARC_FRAG = /* glsl */ `
${NOISE}
varying float vHeat;
varying vec3 vDir;
uniform float uTime, uFade;
void main() {
  // a loop of flux, glowing: rose at its cool edge, orange gold in its core,
  // threaded along its own length and breathing
  float thread = 0.65 + 0.35 * spN(vDir * 70.0 + vec3(uTime * 0.08, 0.0, uTime * 0.05));
  float h = clamp(vHeat * thread, 0.0, 1.0);
  vec3 col = mix(vec3(0.85, 0.22, 0.25), vec3(1.0, 0.62, 0.30), h);
  gl_FragColor = vec4(col * h * 1.15 * uFade, 1.0);
}
`;

const CORONA_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tDiffuse, tDepth;
uniform vec2 uResolution, uCenter, uSunUv;
uniform float uRad, uPresence, uFoot, uSeedC, uTime;
uniform vec3 uPearl, uGold, uRose;
float cpH(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float cpN(vec2 x) {
  vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(cpH(i), cpH(i + vec2(1.0, 0.0)), f.x), mix(cpH(i + vec2(0.0, 1.0)), cpH(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec4 src = texture2D(tDiffuse, vUv);
  vec3 c = src.rgb;
  float sky = step(0.9999995, texture2D(tDepth, vUv).r);
  float orbit = uPresence * (1.0 - uFoot);
  if (orbit > 0.001) {
    vec2 q = (vUv - uCenter) * uResolution / max(uRad, 1.0);
    float r = length(q);
    vec2 sd = q / max(r, 1e-5);   // noise on the direction, never on an angle
    float x = max(r - 1.0, 0.0);
    float t = uTime;
    float s1 = cpN(sd * 2.0 + uSeedC);
    float s2 = cpN(sd * 6.0 + vec2(x * 0.5 - t * 0.01, 3.0));
    float s3 = cpN(sd * 23.0 + vec2(1.0, x * 1.6 - t * 0.02));
    float helm = pow(s1, 2.0);
    float reach = 0.10 + 0.95 * helm + 0.20 * s2;
    float inner = exp(-x / 0.07);
    float streamer = exp(-x / reach) * (0.20 + 0.80 * helm) * (0.6 + 0.4 * s3);
    float tooth = 0.85 + 0.30 * cpH(floor(vUv * uResolution * 0.75));
    float glow = (inner * 0.75 + streamer * 0.55 + exp(-x / 0.6) * 0.08) * smoothstep(0.985, 1.01, r);
    vec3 cor = mix(uGold, uPearl, inner * 0.8 + 0.2);
    c += cor * glow * mix(1.0, tooth, 0.5) * (0.35 + 0.65 * sky) * orbit;
    // the chromosphere's own rose ring, ragged, just past the silhouette
    float ring = exp(-pow((r - 1.004) / 0.008, 2.0)) * (0.5 + 0.5 * s3);
    c += uRose * ring * 0.55 * orbit;
  }
  // on foot the star is the sky: lifted toward its own light where it stands
  if (uFoot > 0.001) {
    float q = max(uResolution.y, 1.0);
    float sr = length((vUv - uSunUv) * uResolution);
    float lift = clamp(0.55 + 0.30 * exp(-sr / (q * 0.45)) + 0.25 * exp(-sr / (q * 0.18)), 0.0, 0.95);
    c = mix(c, uPearl, sky * lift * uFoot);
  }
  gl_FragColor = vec4(min(c, vec3(1.0)), src.a);
}
`;

/* Planet Creator — the race week crowned (bodies/star.js, star.look 2, the default).
 *
 * The week stays his own rock world, with its ground, sea, air, weather and
 * life, and the race is worn as an aurora: an oval of curtains round a pole,
 * standing over the world and following its curve. From orbit the oval is set
 * over the top of the globe as the painter sees it, leant a little toward him,
 * so the far side of it rises over the limb as a crown and the near side lies
 * across the top of the face. Like the week's own star (system.js) it is
 * composed against the sheet: it keeps its place as the orbit turns and the
 * ground turns under it, which is what an auroral oval does over a turning
 * planet. A soft polar night gathers under it. On foot it is dusk, and the oval
 * is stood just ahead of where the eye landed, so its nearest curtain arches
 * across the sky in front of him. The race ring is left undrawn: the crown is
 * the race's mark here.
 *
 * It is one screen pass, laid after the ink frame. The ray is walked through
 * the shell the curtains stand in, and wherever it passes through an arc's
 * folded sheet that curtain is lit as a thin sheet of light: brightest where it
 * is seen edge on, a lower border, green rising into violet, rays of different
 * reach drawn down it, slow waves of brightness running round the oval. A soft
 * glow round the oval is gathered on the same walk. Everything stops at the
 * frame's own depth, so the ground and its ranges stand in front of it.
 *
 * Deterministic: shapes from the week's own PRNG, motion only from the clock.
 */
import { ringMute } from './star.js';
import { landingEye } from '../life-kit.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (value, fallback) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

const THETA = 0.50;   // the oval's own radius about its pole, radians
const LEAN = 0.36;    // the crown's pole, leant from the sheet's top toward the eye
const SPIN = 0.018;   // the oval's own slow turn from orbit, radians a second
const NIGHT = 0.90;   // how far the polar night under the crown goes toward its shade
// the curtains over R, from orbit and on foot (over every range and cloud there)
const ORBIT = { foot: 4, tall: 40 };
const FOOT = { foot: 30, tall: 34 };
const AHEAD = 0.48;   // on foot, the nearest curtain this far ahead of the eye, radians

export function createLook(shared) {
  const { THREE: T, features, scene } = shared;
  const R = num(shared.R, 120);
  const rng = features?.makeRng ? features.makeRng('body/crown') : (() => 0.5);
  const mute = ringMute(scene, true);
  mute();

  const pole = new T.Vector3(0, 1, 0), e1 = new T.Vector3(1, 0, 0), e2 = new T.Vector3(0, 0, 1);
  const U = {
    uEye: { value: new T.Vector3() },
    uCamR: { value: new T.Vector3(1, 0, 0) },
    uCamU: { value: new T.Vector3(0, 1, 0) },
    uCamF: { value: new T.Vector3(0, 0, -1) },
    uTan: { value: new T.Vector2(1, 1) },
    uNear: { value: 0.3 },
    uFar: { value: 2000 },
    uPole: { value: pole },
    uE1: { value: e1 },
    uE2: { value: e2 },
    uPh: { value: new T.Vector4(rng() * TAU, rng() * TAU, rng() * TAU, rng() * TAU) },
    uTheta: { value: THETA },
    uR: { value: R },
    uFoot: { value: ORBIT.foot },
    uTall: { value: ORBIT.tall },
    uOrbit: { value: 1 },
    uGround: { value: 0 },
    uNight: { value: NIGHT },
    // past this the depth is the sky's own dome underfoot (ink.js SKY_DOME), not the world
    uSkyFar: { value: 600 },
    uGreen: { value: new T.Color('#2fd67c') },
    uRose: { value: new T.Color('#6e3aa6') },
    uHem: { value: new T.Color('#d8ffe6') },
    uShade: { value: new T.Color('#2e3a6c') },
    uDuskHi: { value: new T.Color('#2c3366') },
    uDuskMid: { value: new T.Color('#76699a') },
    uDuskLo: { value: new T.Color('#d99a86') },
    uDuskCloud: { value: new T.Color('#3d3a52') },
    uDuskDark: { value: new T.Color('#232a52') },
    uDuskLit: { value: new T.Color('#5a5d86') },
  };

  // The crown's pole and the frame about it: e1 across, e2 = pole × e1.
  const _axis = new T.Vector3(), _up = new T.Vector3(), _rt = new T.Vector3(), _eye = new T.Vector3();
  function setPole(axis, across, spin) {
    pole.copy(axis).normalize();
    e1.copy(across).addScaledVector(pole, -across.dot(pole)).normalize();
    e2.crossVectors(pole, e1);
    if (spin) {
      e1.multiplyScalar(Math.cos(spin)).addScaledVector(e2, Math.sin(spin));
      e2.crossVectors(pole, e1);
    }
  }
  // from orbit: the top of the globe as the sheet shows it (the camera's up, laid
  // square to the eye, since a poster may look past the centre) leant toward the
  // eye, and turned slowly about itself
  function orbitPlace(camera, t) {
    _eye.copy(camera.position).normalize();
    _up.setFromMatrixColumn(camera.matrixWorld, 1);
    _up.addScaledVector(_eye, -_up.dot(_eye)).normalize();
    _rt.crossVectors(_up, _eye);
    _axis.copy(_up).multiplyScalar(Math.cos(LEAN)).addScaledVector(_eye, Math.sin(LEAN));
    setPole(_axis, _rt, t * SPIN);
  }
  // on foot: the pole stood ahead of where the eye landed, so the oval's nearest
  // curtain runs across the sky in front of it; held while he walks or turns
  const eye = landingEye(T, R);
  let placed = -1;
  function footPlace() {
    if (placed === eye.serial) return;
    placed = eye.serial;
    _axis.copy(eye.up).multiplyScalar(Math.cos(THETA + AHEAD)).addScaledVector(eye.fw, Math.sin(THETA + AHEAD));
    setPole(_axis, eye.side, 0);
  }

  const post = {
    id: 'star-crown',
    fragment: CROWN_FRAG,
    uniforms: () => U,
    update(ctx, u) {
      const cam = ctx.camera;
      if (!cam) return;
      u.uEye.value.copy(cam.position);
      u.uCamR.value.setFromMatrixColumn(cam.matrixWorld, 0).normalize();
      u.uCamU.value.setFromMatrixColumn(cam.matrixWorld, 1).normalize();
      u.uCamF.value.setFromMatrixColumn(cam.matrixWorld, 2).normalize().negate();
      const th = Math.tan((cam.fov * Math.PI) / 360);
      u.uTan.value.set(th * cam.aspect, th);
      u.uNear.value = cam.near;
      u.uFar.value = cam.far;
    },
  };

  return {
    object: null,
    post,
    update({ camera, surface, time, landing = null } = {}) {
      mute();
      const s = clamp(num(surface, 0), 0, 1);
      // a day-by-day build (base.js uBuild.x) shows the crown only once the race has earned it
      U.uOrbit.value = (1 - sstep(0.05, 0.35, s)) * (shared.uniforms?.uBuild?.value.x ?? 1);
      U.uGround.value = sstep(0.5, 0.95, s);
      if (!camera) return;
      eye.update(landing || camera, landing ? 1 : s);
      const foot = s >= 0.4 && eye.serial > 0;
      const dims = foot ? FOOT : ORBIT;
      U.uFoot.value = dims.foot;
      U.uTall.value = dims.tall;
      if (foot) footPlace();
      else {
        placed = -1;
        orbitPlace(camera, num(time, 0));
      }
    },
    dispose() {},
  };
}

const CROWN_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tDiffuse, tDepth;
uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uEye, uCamR, uCamU, uCamF;
uniform vec2 uTan;
uniform float uNear, uFar;
uniform vec3 uPole, uE1, uE2;
uniform vec4 uPh;
uniform float uTheta, uR, uFoot, uTall, uOrbit, uGround, uNight, uSkyFar;
uniform vec3 uGreen, uRose, uHem, uShade, uDuskHi, uDuskMid, uDuskLo, uDuskCloud, uDuskDark, uDuskLit;

const float TAU = 6.2831853;
const int STEPS = 12;

float crH(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float crH2(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
// value noise along the oval, closing on itself every n
float crNp(float x, float n) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(crH(mod(i, n)), crH(mod(i + 1.0, n)), f); }
float linZ(float d) { float z = d * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }

// The oval at azimuth phi: an arc of radius th0 about the pole stands at
// colatitude th0 * x + y there, a little eccentric (x) and folded at three
// scales that drift (y).
vec2 oval(float phi) {
  float t = uTime;
  return vec2(1.0 + 0.10 * sin(phi + uPh.x),
              0.050 * sin(3.0 * phi + uPh.y + 0.020 * t) + 0.028 * sin(7.0 * phi + uPh.z - 0.035 * t)
              + 0.011 * sin(16.0 * phi + uPh.w + 0.050 * t));
}
// ...and that colatitude's slope along phi
float ovalSlope(float phi, float th0) {
  float t = uTime;
  return th0 * 0.10 * cos(phi + uPh.x) + 0.150 * cos(3.0 * phi + uPh.y + 0.020 * t)
         + 0.196 * cos(7.0 * phi + uPh.z - 0.035 * t) + 0.176 * cos(16.0 * phi + uPh.w + 0.050 * t);
}

// a direction from the world's centre, about the pole: colatitude and azimuth
vec2 polar(vec3 n) {
  return vec2(acos(clamp(dot(n, uPole), -1.0, 1.0)), atan(dot(n, uE2), dot(n, uE1)));
}

// One curtain where the ray goes through it at t: the light it lays on the eye.
// from/to is the stretch of the oval an arc keeps (0..1 for the whole oval).
vec3 curtain(vec3 C, vec3 D, float t, float tMax, float th0, float from, float to, float k, float pxAng) {
  if (t <= 0.0 || t >= tMax) return vec3(0.0);
  vec3 p = C + D * t;
  float r = length(p);
  vec3 n = p / r;
  vec2 pa = polar(n);
  vec2 s = oval(pa.y);
  float th = th0 * s.x + s.y;
  float u = pa.y / TAU + 0.5;
  // an arc's ends taper; the oval itself closes
  float end = 1.0;
  if (to - from < 1.0) {
    float su = (u - from) / (to - from);
    if (su <= 0.0 || su >= 1.0) return vec3(0.0);
    end = pow(sin(3.1415927 * su), 0.6);
  }
  // the curtain's own height wanders along it; underfoot its lower border is soft
  float H = uTall * (0.80 + 0.14 * sin(2.0 * pa.y + uPh.y) + 0.10 * sin(5.0 * pa.y + uPh.z)) * mix(0.6, 1.0, end);
  float h = (r - uR - uFoot) / H;
  float lo = -0.06 - 0.18 * uGround;
  if (h < lo || h > 1.0) return vec3(0.0);
  // the sheet's normal: the meridian turned by the fold's slope; a sheet seen
  // along itself is all its light in one line of sight
  vec3 m = normalize(n * dot(n, uPole) - uPole);
  vec3 ep = normalize(cross(uPole, n));
  vec3 N = normalize(m - ep * (ovalSlope(pa.y, th0) / max(sin(th), 0.05)));
  float facing = abs(dot(N, D));
  float fold = min(1.0 / (facing + 0.16), 3.6);
  // the rays: four scales drawn down the curtain, drifting along it, gathered in
  // bundles; a scale finer than a pixel's reach along the curtain is let go to
  // its mean, so a curtain seen edge on (or from orbit) does not shimmer
  float px = t * pxAng / max(facing, 0.05) / (TAU * r * sin(th));
  float tm = uTime;
  float r1 = mix(0.5, crNp(u * 170.0 + tm * 0.9, 170.0), 1.0 - smoothstep(0.35, 1.0, px * 170.0));
  float r2 = mix(0.5, crNp(u * 460.0 - tm * 1.7, 460.0), 1.0 - smoothstep(0.35, 1.0, px * 460.0));
  float r3 = mix(0.5, crNp(u * 1300.0 + tm * 2.3, 1300.0), 1.0 - smoothstep(0.35, 1.0, px * 1300.0));
  float r4 = mix(0.5, crNp(u * 3700.0 - tm * 3.1, 3700.0), 1.0 - smoothstep(0.35, 1.0, px * 3700.0));
  float rays = smoothstep(0.15, 0.85, 0.40 * r1 + 0.27 * r2 + 0.20 * r3 + 0.13 * r4);
  rays *= 0.25 + 0.75 * crNp(u * 38.0 + tm * 0.12, 38.0);
  // bright rays reach higher
  float decay = mix(0.22, 0.65, rays);
  float hem = smoothstep(lo, 0.02, h);
  float body = hem * exp(-max(h, 0.0) / decay) * (1.0 - smoothstep(0.75, 1.0, h));
  // slow waves of brightness running round the oval
  float wave = 0.50 + 0.50 * sin(u * TAU * 4.0 - tm * 0.30 + 2.0 * crNp(u * 30.0, 30.0));
  wave = 0.40 + 0.60 * wave;
  vec3 col = mix(uGreen, uRose, smoothstep(0.30, 0.85, h)) + uHem * exp(-max(h, 0.0) * 30.0) * 0.55 * (1.0 - 0.7 * uGround);
  return col * body * (0.15 + 0.85 * rays) * wave * fold * end * k;
}

// how far past an arc's folded sheet a point stands, in radians of colatitude
float past(vec3 p, float th0) {
  vec2 pa = polar(normalize(p));
  vec2 s = oval(pa.y);
  return pa.x - th0 * s.x - s.y;
}

// the sheet's crossing between t0 and t1, where how far past it the ray stands
// (g0, g1) has opposite signs: two steps of false position, then the line
float crossing(vec3 C, vec3 D, float t0, float g0, float t1, float g1, float th0) {
  for (int j = 0; j < 2; j++) {
    float tm = t0 - g0 * (t1 - t0) / (g1 - g0);
    float gm = past(C + D * tm, th0);
    if (gm * g0 < 0.0) { t1 = tm; g1 = gm; } else { t0 = tm; g0 = gm; }
  }
  return t0 - g0 * (t1 - t0) / (g1 - g0);
}

// A sheet only grazed between three readings (ga, gb, gc, a step L apart about
// tm): all on one side, the middle nearest it, yet the parabola through them dips
// across it, so the ray goes in and out within a step, as it does where a
// curtain is seen edge on. Where the dip is real both crossings are lit.
vec3 graze(vec3 C, vec3 D, float ga, float gb, float gc, float tm, float L, float tMax, float th0, float from, float to, float k, float pxAng) {
  if (ga * gb <= 0.0 || gb * gc <= 0.0 || abs(gb) >= abs(ga) || abs(gb) >= abs(gc)) return vec3(0.0);
  float A = 0.5 * (ga + gc) - gb, B = 0.5 * (gc - ga);
  if (B * B - 4.0 * A * gb <= 0.0) return vec3(0.0);
  float tv = tm + L * clamp(-B / (2.0 * A), -0.95, 0.95);
  float gv = past(C + D * tv, th0);
  if (gv * gb >= 0.0) return vec3(0.0);
  return curtain(C, D, crossing(C, D, tm - L, ga, tv, gv, th0), tMax, th0, from, to, k, pxAng)
       + curtain(C, D, crossing(C, D, tv, gv, tm + L, gc, th0), tMax, th0, from, to, k, pxAng);
}

// The ray walked through one stretch [a, b] of the shell the curtains stand in:
// where it goes through an arc's folded sheet (how far past the sheet it stands
// changes sign between two steps) that curtain is lit, and the glow round the
// oval is gathered at every step. The steps are jittered a pixel apart, and one
// reading serves all three arcs, which share the oval's folds.
vec3 walk(vec3 C, vec3 D, float a, float b, float tMax, float jit, float pxAng, inout float glo) {
  vec3 acc = vec3(0.0);
  if (b <= a) return acc;
  float L = (b - a) / float(STEPS);
  vec3 th0 = vec3(uTheta, uTheta + 0.07, uTheta - 0.055);
  vec3 gp = vec3(0.0), gpp = vec3(0.0);
  float tp = 0.0;
  for (int i = 0; i <= STEPS + 1; i++) {
    float t = a + L * (float(i) - 0.5 + jit);
    vec3 p = C + D * t;
    float r = length(p);
    vec2 pa = polar(p / r);
    vec2 s = oval(pa.y);
    vec3 g = pa.x - th0 * s.x - s.y;
    if (i > 0) {
      if (gp.x * g.x < 0.0) acc += curtain(C, D, crossing(C, D, tp, gp.x, t, g.x, th0.x), tMax, th0.x, 0.0, 1.0, 1.0, pxAng);
      if (gp.y * g.y < 0.0) acc += curtain(C, D, crossing(C, D, tp, gp.y, t, g.y, th0.y), tMax, th0.y, 0.08, 0.46, 0.55, pxAng);
      if (gp.z * g.z < 0.0) acc += curtain(C, D, crossing(C, D, tp, gp.z, t, g.z, th0.z), tMax, th0.z, 0.55, 0.93, 0.45, pxAng);
    }
    if (i > 1) {
      acc += graze(C, D, gpp.x, gp.x, g.x, tp, L, tMax, th0.x, 0.0, 1.0, 1.0, pxAng);
      acc += graze(C, D, gpp.y, gp.y, g.y, tp, L, tMax, th0.y, 0.08, 0.46, 0.55, pxAng);
      acc += graze(C, D, gpp.z, gp.z, g.z, tp, L, tMax, th0.z, 0.55, 0.93, 0.45, pxAng);
    }
    // the glow keeps to the oval's own swell and not its folds: one soft band
    if (t > a && t < b) {
      float off = (pa.x - uTheta * s.x) / 0.09;
      float hh = (r - uR - uFoot) / uTall;
      glo += exp(-off * off) * smoothstep(-0.2, 0.05, hh) * (1.0 - smoothstep(0.3, 0.9, hh)) * L;
    }
    gpp = gp;
    gp = g;
    tp = t;
  }
  return acc;
}

void main() {
  vec4 src = texture2D(tDiffuse, vUv);
  vec3 c = src.rgb;
  float on = max(uOrbit, uGround);
  if (on < 0.001) {
    gl_FragColor = src;
    return;
  }
  vec3 C = uEye;
  vec3 D = normalize(uCamF + (vUv.x * 2.0 - 1.0) * uTan.x * uCamR + (vUv.y * 2.0 - 1.0) * uTan.y * uCamU);
  float dz = texture2D(tDepth, vUv).x;
  float tSurf = dz >= 0.99998 ? 1e9 : linZ(dz) / max(dot(D, uCamF), 1e-3);
  // the sky: the cleared depth from orbit; underfoot also the painted dome far off
  float sky = max(step(0.99998, dz), step(uSkyFar, tSurf) * step(length(C), uR + 80.0));
  float tMax = sky > 0.5 ? 1e9 : tSurf;
  float jit = crH2(floor(gl_FragCoord.xy));
  float tooth = 0.93 + 0.14 * crH2(floor(gl_FragCoord.xy * 0.8) + 17.0);
  float pxAng = 2.0 * uTan.y / uResolution.y;
  float lum = dot(c, vec3(0.30, 0.55, 0.15));

  // ---- from orbit, a soft polar night gathers under the crown, and the oval's
  // own light lies on the ground under it as a faint ring
  if (uOrbit > 0.001 && sky < 0.5) {
    vec3 n = normalize(C + D * tSurf);
    vec2 pa = polar(n);
    vec2 s = oval(pa.y);
    float th = uTheta * s.x + s.y;
    float night = (1.0 - smoothstep(th - 0.12, th + 0.15, pa.x)) * uNight * uOrbit;
    c *= mix(vec3(1.0), uShade, night);
    float under = (pa.x - th) / 0.06;
    float ring = 0.30 * exp(-under * under) + 0.07 * (1.0 - smoothstep(th - 0.25, th, pa.x));
    c += uGreen * ring * uOrbit * (1.0 - c);
  }

  // ---- on foot it is dusk, all of it in the one light: a warm band low down
  // under a violet that deepens overhead, with only a trace of the painted
  // washes left in it so their dried edges go soft, the weather's paper gone
  // dusky against it, and the ground and all that stands on it in the blue,
  // held under the sky, with the crown's green on what is pale. A mark drawn on
  // the sky (a flock) is darker than what lies on both sides of it, where a
  // wash's own edge is darker on one side only; a mark keeps its dark.
  float cloud = 0.0;
  if (uGround > 0.001) {
    const vec3 W = vec3(0.30, 0.55, 0.15);
    vec2 o = 4.0 / uResolution;
    float bg = max(lum, max(
      min(dot(texture2D(tDiffuse, vUv - vec2(o.x, 0.0)).rgb, W), dot(texture2D(tDiffuse, vUv + vec2(o.x, 0.0)).rgb, W)),
      min(dot(texture2D(tDiffuse, vUv - vec2(0.0, o.y)).rgb, W), dot(texture2D(tDiffuse, vUv + vec2(0.0, o.y)).rgb, W))));
    cloud = sky * smoothstep(0.80, 0.92, bg);
    float y = dot(D, normalize(C));
    vec3 skyT = mix(mix(uDuskLo, uDuskMid, smoothstep(-0.04, 0.16, y)), uDuskHi, smoothstep(0.12, 0.50, y));
    vec3 skyC = mix(skyT * mix(1.0, bg / 0.62, 0.15), uDuskCloud * (0.85 + 0.3 * bg), 0.85 * cloud) * (lum / max(bg, 1e-3));
    vec3 land = c * mix(uDuskDark, uDuskLit, smoothstep(0.10, 0.90, lum)) + uGreen * 0.15 * lum * lum;
    c = mix(c, mix(land, skyC, sky), uGround);
    cloud *= uGround;
  }

  // ---- the curtains, the main oval and two shorter arcs beside it, walked in
  // the shell they stand in (in front of the world, and past it beside the limb)
  vec3 aur = vec3(0.0);
  float tc = -dot(C, D);
  float d2 = dot(C, C) - tc * tc;
  float ra = uR + uFoot - 0.25 * uTall, rb = uR + uFoot + 1.05 * uTall;
  if (d2 < rb * rb) {
    float glo = 0.0;
    float ho = sqrt(rb * rb - d2);
    if (d2 < ra * ra) {
      float hi = sqrt(ra * ra - d2);
      aur += walk(C, D, max(tc - ho, 0.0), min(tc - hi, tMax), tMax, jit, pxAng, glo);
      aur += walk(C, D, max(tc + hi, 0.0), min(tc + ho, tMax), tMax, jit, pxAng, glo);
    } else {
      aur += walk(C, D, max(tc - ho, 0.0), min(tc + ho, tMax), tMax, jit, pxAng, glo);
    }
    // underfoot the eye looks along the shell, so its glow is let down
    aur = aur * mix(3.2, 1.7, uGround) + uGreen * glo * mix(0.004, 0.0006, uGround);
  }
  // the light keeps its hue however much of it gathers: its strongest channel is
  // eased toward one and the others follow, so a deep curtain is a full green and
  // never a white; the paper's own tooth under it; a cloud underfoot in front of it
  float peak = max(max(aur.r, aur.g), max(aur.b, 1e-4));
  aur *= (1.0 - exp(-peak)) / peak;
  aur *= tooth * on * (1.0 - 0.85 * cloud);
  c += aur * (1.0 - c);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), src.a);
}
`;

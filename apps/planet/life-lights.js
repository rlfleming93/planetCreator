/* Planet Creator — the week's life: the settlements' lights (life.js).
 *
 * What the week built with others: every football session a village, every
 * two strength sessions a walled stone town, on low ground near a coast and
 * near the week's own country. By day nothing of them is drawn — at a poster's
 * distance a village is a pixel of the ground's own wash — but where
 * light.terminator has put the land in the dark they are a faint warm web: a
 * knot of points at each town's heart thinning out to its edge, a little warm
 * air over the biggest, roads of fainter points strung from town to town and
 * out to the places the week was lived, hamlets along them. The lights are
 * added to the dark, never laid over it, so they are only ever as bright as the
 * night leaves room for. One instanced quad a light, laid on the orbit ground
 * and gone as it lands. */
import { MARK, TAU, clamp, instancedQuad, tangentFrame } from './life-kit.js';

const VERT = /* glsl */ `
attribute vec4 aAt;     // the light's place (unit), its height from the centre
attribute vec4 aLook;   // size (units), rank, seed, strength
uniform float uShow, uAmount, uTerm;
uniform vec3 uLight;
varying vec2 vUv;
varying float vGlow, vSeed, vFade;
${MARK}
void main(){
  vec3 d = aAt.xyz;
  // dark ground only: the land the light has left
  float nd = dot(d, normalize(uLight));
  vGlow = uTerm * (1.0 - smoothstep(-0.14, 0.0, nd)) * aLook.w;
  vec3 C = d * aAt.w;
  // brought forward along the line of sight: the orbit ground's facets never
  // swallow a light, and nothing moves on the sheet
  vec3 toCam = cameraPosition - C;
  float dist = length(toCam);
  C += toCam / max(dist, 1e-4) * (0.6 + 0.004 * dist);
  vec2 mk = inkMark(projectionMatrix * viewMatrix * vec4(C, 1.0), aLook.x);
  vec3 E = normalize(cross(vec3(0.0, 1.0, 0.0), d) + vec3(1e-4, 0.0, 0.0));
  vec3 N = cross(d, E);
  vec4 wp = vec4(C + (E * position.x + N * position.y) * mk.x, 1.0);
  vUv = uv;
  vSeed = aLook.z;
  vFade = mk.y;
  gl_Position = projectionMatrix * viewMatrix * wp;
  if (aLook.y >= uAmount || uShow * vGlow <= 0.002) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uGold;
uniform float uShow, uTime;
varying vec2 vUv;
varying float vGlow, vSeed, vFade;
void main(){
  float r = length(vUv - 0.5) * 2.0;
  // a soft point, or (for a town's warm air) a wide low breath of it
  float a = (1.0 - smoothstep(0.0, 1.0, r));
  a *= a;
  float breathe = 0.85 + 0.15 * sin(uTime * (0.5 + vSeed) + vSeed * 40.0);
  a *= vGlow * uShow * vFade * breathe;
  if (a < 0.004) discard;
  // added to the dark (see the blend)
  gl_FragColor = vec4(uGold * a, 1.0);
}
`;

/** The towns, their roads and hamlets. `week.towns` is life.js's reading. */
export function createLights(T, { features, uniforms, R, palette: pal, week, amount, light, viewH }) {
  const rng = features.makeRng('life/lights');
  const { landAt } = week.read;
  const subject = week.subject;
  const cap = Number(features.orbit?.reliefCap) || 12;
  const ground = (v) => R + Math.min(features.heightAt(v), cap) + 0.15;
  // low ground near a coast, the week's own country first
  const found = [];
  for (let i = 0; i < 1600; i++) {
    const y = rng() * 2 - 1, a = rng() * TAU, s = Math.sqrt(1 - y * y);
    const v = new T.Vector3(Math.cos(a) * s, y * 0.85, Math.sin(a) * s).normalize();
    const h = landAt(v);
    if (h < 0.4 || h > 4.5) continue;
    found.push({ v, score: v.dot(subject) * 0.8 + rng() * 0.7 - h * 0.06 });
  }
  found.sort((p, q) => q.score - p.score);
  const towns = [];
  for (const { v } of found) {
    if (towns.length >= week.towns.length) break;
    if (towns.every((t) => t.dir.angleTo(v) * R > 18)) towns.push({ dir: v, ...week.towns[towns.length] });
  }
  const lights = [];
  const e = new T.Vector3(), n = new T.Vector3();
  const cluster = (at, count, radius, size, strength) => {
    tangentFrame(T, at, e, n);
    for (let k = 0; k < count; k++) {
      // gathered thick in the middle, thinning out to the edge
      const r = radius * Math.pow(rng(), 0.8);
      const a = rng() * TAU;
      const v = at.clone().addScaledVector(e, Math.cos(a) * r / R).addScaledVector(n, Math.sin(a) * r / R).normalize();
      if (landAt(v) < 0.1) continue;
      const heart = 1 - r / radius;
      lights.push({ v, size: size * (0.7 + 0.6 * heart), strength: strength * (0.45 + 0.55 * heart) * (0.7 + 0.3 * rng()) });
    }
  };
  for (const town of towns) {
    cluster(town.dir, town.lights, town.radius * 0.8, 0.55, 0.85);
    // the warm air over a town's heart
    lights.push({ v: town.dir, size: town.radius * 1.4, strength: 0.16 });
  }
  // the roads: a wandering string of faint points from each town to its two
  // nearest neighbours and to the nearest of the week's own places, over the
  // land only, a hamlet here and there along the way
  const road = (a, b) => {
    const span = a.angleTo(b) * R;
    const steps = Math.floor(span / 1.3);
    const side = new T.Vector3().crossVectors(a, b).normalize();
    const bow = (rng() - 0.5) * 0.12 * span / R, ph = rng() * TAU;
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      const v = a.clone().lerp(b, t).normalize();
      v.addScaledVector(side, Math.sin(t * Math.PI) * bow + Math.sin(t * 9 + ph) * 0.6 / R).normalize();
      if (landAt(v) < 0.1 || rng() < 0.18) continue;
      lights.push({ v, size: 0.4, strength: 0.35 + 0.25 * rng() });
      if (rng() < 0.035) cluster(v, 5 + Math.floor(rng() * 6), 1.6, 0.45, 0.6);
    }
  };
  const roads = new Set();
  for (let i = 0; i < towns.length; i++) {
    const near = towns.map((t, j) => ({ j, g: towns[i].dir.angleTo(t.dir) })).filter((x) => x.j !== i && x.g * R < 110).sort((p, q) => p.g - q.g).slice(0, 2);
    for (const { j } of near) {
      const key = i < j ? `${i}/${j}` : `${j}/${i}`;
      if (roads.has(key)) continue;
      roads.add(key);
      road(towns[i].dir, towns[j].dir);
    }
    const site = (features.list || []).map((f) => ({ f, g: towns[i].dir.angleTo(f.dir) })).filter((x) => x.g * R > 6 && x.g * R < 60).sort((p, q) => p.g - q.g)[0];
    if (site) road(towns[i].dir, site.f.dir);
  }
  const attrs = { aAt: new Float32Array(lights.length * 4), aLook: new Float32Array(lights.length * 4) };
  lights.forEach((l, i) => {
    attrs.aAt.set([l.v.x, l.v.y, l.v.z, ground(l.v)], i * 4);
    attrs.aLook.set([l.size, (i * 0.618034) % 1, rng(), clamp(l.strength, 0, 1)], i * 4);
  });
  const u = {
    uTime: uniforms.uTime,
    uShow: { value: 0 },
    uAmount: amount,
    uTerm: { value: 0 },
    uLight: light,
    uViewH: viewH,
    uGold: { value: pal.litWarm.clone().lerp(pal.vermilion, 0.3).multiplyScalar(0.9) },
  };
  const material = new T.ShaderMaterial({
    uniforms: u,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    // added to the dark; the sheet's alpha untouched
    blending: T.CustomBlending,
    blendEquation: T.AddEquation,
    blendSrc: T.OneFactor,
    blendDst: T.OneFactor,
    blendSrcAlpha: T.ZeroFactor,
    blendDstAlpha: T.OneFactor,
  });
  const mesh = new T.Mesh(instancedQuad(T, lights.length, attrs), material);
  mesh.name = 'life-lights';
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.userData.species = { towns: towns.length, roads: roads.size, lights: lights.length };
  return {
    object: mesh,
    update({ orbit, term }) {
      u.uShow.value = orbit;
      u.uTerm.value = term;
      mesh.visible = orbit * term > 0.002 && lights.length > 0;
    },
    dispose() {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}

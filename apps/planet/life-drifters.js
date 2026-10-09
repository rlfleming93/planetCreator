/* Planet Creator — the week's life: the drifters (life.js).
 *
 * A giant has no ground to graze and no sea to bloom: what lives on it lives in
 * the air. From orbit they are what a naturalist would see of a shoal of
 * gas-bags from that far off: specks, thousands of them, swarming in a few long
 * veils strung out along the belts and carried round at the belts' own rates
 * (the same profile giant-shader.js turns its bands with), so the deck's own
 * shear draws each veil out. A speck is the deck under it a shade lighter where
 * the sun catches it or a shade darker where it shades, never a colour of its
 * own: you find the swarms on a second look.
 *
 * Underfoot, one of them, grown majestic, hangs in the sky where the eye lands
 * (life-kit.js landingEye), and one more far off and small: a translucent bell
 * lit through from the sun's side, leaning and fuller on one side, its shade
 * a deeper wash, its rim found in places and lost into the sky in others, a
 * few frilled arms under it and its tendrils trailing far below as veils, all
 * of it the air's colour as much as its own. An ice giant's are paler. */
import { MARK, NOISE, TAU, clamp, instancedQuad, tangentFrame } from './life-kit.js';

const SPECK_VERT = /* glsl */ `
attribute vec4 aLook;   // size (units), rank, seed, tone (-1 shade .. 1 lit)
uniform float uTime, uShow, uAmount, uRate, uShell;
varying float vTone, vFade, vFace;
${MARK}
void main(){
  vec3 h = position;
  // carried with its belt: the deck's own profile, faster at the jets
  float ang = uTime * uRate * (1.0 + 0.85 * sin(h.y * 7.0) + 0.22 * h.y);
  float c = cos(ang), s = sin(ang);
  vec3 d = normalize(vec3(h.x * c - h.z * s, h.y, h.x * s + h.z * c));
  // and swarming about its own place in the veil
  vec3 e = normalize(cross(vec3(0.0, 1.0, 0.0), d) + vec3(1e-4, 0.0, 0.0));
  vec3 n = cross(d, e);
  float sd = aLook.z * 40.0;
  d = normalize(d + (e * sin(uTime * 0.31 + sd) + n * sin(uTime * 0.23 + sd * 1.7)) * 0.0016);
  vec3 C = d * (uShell + 0.6 + aLook.z * 1.8);
  vec4 clip = projectionMatrix * viewMatrix * vec4(C, 1.0);
  vec2 mk = inkMark(clip, aLook.x);
  gl_PointSize = mk.x * projectionMatrix[1][1] * 0.5 * uViewH / max(clip.w, 1e-4);
  vTone = aLook.w;
  vFade = mk.y;
  vFace = dot(d, normalize(cameraPosition - C));
  gl_Position = clip;
  if (aLook.y >= uAmount || uShow <= 0.001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const SPECK_FRAG = /* glsl */ `
uniform vec3 uLit, uShade;
uniform float uShow;
varying float vTone, vFade, vFace;
void main(){
  float r = length(gl_PointCoord - 0.5);
  // thin away toward the limb: never hung out over space
  float a = (1.0 - smoothstep(0.22, 0.5, r)) * vFade * uShow * smoothstep(0.12, 0.4, vFace);
  if (a < 0.004) discard;
  vec3 tone = vTone > 0.0 ? uLit : uShade;
  // the sheet times the speck: 2 × src × dst (see the blend)
  gl_FragColor = vec4(mix(vec3(1.0), tone, a * abs(vTone)) * 0.5, 1.0);
}
`;

const JELLY_VERT = /* glsl */ `
attribute vec4 aSlot;   // index of its place, -, seed, rank
uniform float uTime, uShow, uAmount;
uniform vec3 uSun;
uniform vec4 uAt[3];    // where each hangs, and its size (0: no room for it here)
varying vec2 vUv, vSun;
varying float vPulse, vSeed, vDist;
void main(){
  int k = int(aSlot.x + 0.5);
  vec4 at = k == 0 ? uAt[0] : k == 1 ? uAt[1] : uAt[2];
  vec3 P = at.xyz;
  float size = at.w;
  vec3 up = normalize(P);
  float sd = aSlot.z;
  // it rises and settles with its own slow pulse, and drifts with the air
  P += up * sin(uTime * 0.21 + sd * 9.0) * size * 0.04;
  vec3 V = normalize(cameraPosition - P);
  vec3 right = normalize(cross(up, V) + vec3(1e-5, 0.0, 0.0));
  vec3 lift = cross(V, right);
  float roll = (sd - 0.5) * 0.3 + 0.04 * sin(uTime * 0.13 + sd * 5.0);
  vec3 r2 = right * cos(roll) + lift * sin(roll);
  vec3 u2 = lift * cos(roll) - right * sin(roll);
  // the quad is twice as tall as it is wide: the bell at its top, the veils under
  vec3 corner = P + (r2 * position.x + u2 * (position.y * 2.0 - 0.45)) * size;
  vUv = vec2(uv.x, uv.y);
  // where the sun stands on the sheet: the side its light comes through from
  vSun = vec2(dot(uSun, r2), dot(uSun, u2));
  vPulse = uTime * 0.55 + sd * 31.0;
  vSeed = sd;
  vDist = distance(cameraPosition, P);
  gl_Position = projectionMatrix * viewMatrix * vec4(corner, 1.0);
  if (aSlot.w >= uAmount || uShow <= 0.001 || size <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

// A bell lit through from the sun's side, drawn as a painter would: no two
// alike and none a symbol. It leans and is fuller on one side, its crown off
// the middle and its margin frilled; the light comes through it in a broad
// pale wash on the sun's flank and its shade lies on the other, flat washes on
// edges the hand wanders, the hollow under the crown a deeper glaze seen
// through the skin. The rim is found only in places, mostly in the shade, and
// lost into the sky elsewhere. Under it a few frilled arms, and the veils
// trailing far below, the faintest thing in the sky and broken where they thin.
const JELLY_FRAG = /* glsl */ `
uniform vec3 uSkin, uDeep, uSky, uLight;
uniform float uShow;
varying vec2 vUv, vSun;
varying float vPulse, vSeed, vDist;
${NOISE}
vec4 lay(vec4 top, vec4 under){
  float a = top.a + under.a * (1.0 - top.a);
  return vec4(mix(under.rgb, top.rgb, top.a / max(a, 1e-4)), a);
}
void main(){
  // the quad: x across (-0.5..0.5), y up (0 about the bell's margin)
  vec2 q = vec2(vUv.x - 0.5, vUv.y * 2.0 - 1.55);
  float pulse = sin(vPulse);
  float hand = vSeed < 0.5 ? 1.0 : -1.0;
  float lean = hand * (0.08 + 0.1 * fract(vSeed * 7.3)) + 0.05 * sin(vPulse * 0.5 + 1.0);
  vec2 b = vec2(cos(lean) * q.x + sin(lean) * q.y, -sin(lean) * q.x + cos(lean) * q.y);
  float sx = clamp(b.x / 0.15, -1.0, 1.0);
  float rx = 0.28 * (1.0 + 0.06 * pulse) * (1.0 + 0.14 * hand * sx);
  float ry = 0.25 * (1.0 - 0.07 * pulse) * (1.0 + 0.08 * hand * sx);
  vec2 e = (b - vec2(0.03 * hand, 0.0)) / vec2(rx, ry);
  // the margin: the mouth of the bell seen a little from below, sagging under
  // the middle, frilled into lappets
  float marg = -0.035 * (1.0 - min(e.x * e.x, 1.0)) + 0.01 * sin(b.x * 46.0 + vSeed * 9.0) + 0.006 * sin(b.x * 97.0 + vSeed * 3.0);
  float bell = max((length(e) - 1.0) * min(rx, ry), marg - b.y);
  float fb = max(fwidth(bell), 1e-4);
  float inBell = 1.0 - inkPixel(bell, fb);
  // the light through it: a dome lit from the sun's side, in flat washes
  vec3 n = normalize(vec3(e.x, max(e.y, 0.0) * 0.8, sqrt(max(1.0 - dot(e, e), 0.0)) + 0.15));
  vec3 L = normalize(vec3(vSun.x + 0.35 * hand, max(vSun.y, 0.3), 0.5));
  float lk = dot(n, L) + (inkF2(q * 7.0 + vSeed * 5.0) - 0.5) * 0.35;
  float fl = max(fwidth(lk), 1e-3);
  float litW = inkPixel(lk - 0.62, fl);
  float shadeW = 1.0 - inkPixel(lk - 0.2, fl);
  // the hollow under the crown, seen through the skin
  vec2 h = (b - vec2(0.04 * hand, 0.035)) / vec2(rx * 0.6, ry * 0.5);
  float hd = (length(h) - 1.0) * rx * 0.55 + (inkN2(b * 30.0 + vSeed) - 0.5) * 0.012;
  float hollow = (1.0 - inkPixel(hd, max(fwidth(hd), 1e-4))) * step(marg + 0.015, b.y);
  // the rim found in places, mostly on the shade side; lost into the sky on
  // the lit side, where the skin thins to nothing at its edge
  float ang = atan(e.y, e.x);
  float found = step(0.48, inkN2(vec2(ang * 2.4, vSeed * 13.0))) * (1.0 - 0.7 * litW);
  float rim = (1.0 - inkPixel(-bell - 0.011, fb)) * inBell * found;
  float lost = smoothstep(-0.05, 0.0, bell) * (1.0 - found);
  vec3 skin = mix(uSky, uSkin, 0.78);
  vec3 c = mix(skin, mix(uDeep, skin, 0.2), shadeW * 0.85);
  c = mix(c, uLight, litW * 0.7);
  c = mix(c, mix(uDeep, skin, 0.25), hollow * (1.0 - 0.5 * litW) * 0.6);
  c = mix(c, mix(uDeep, uSky, 0.3), rim * 0.65);
  float aB = inBell * ((0.46 + 0.24 * shadeW + 0.12 * hollow) * (1.0 - 0.8 * lost) + 0.2 * rim);
  // the arms close under it: a few long frilled ribbons of their own lengths,
  // swaying, gathered under the mouth
  float arms = 1e3;
  for (int i = 0; i < 3; i++) {
    float fi = float(i) - 1.0;
    float len = 0.55 + 0.45 * fract(vSeed * 7.0 + fi * 0.37);
    float x = fi * 0.055 + 0.02 * hand + 0.05 * sin(q.y * 5.0 - vPulse * 0.7 + fi * 2.0 + vSeed * 6.0) * smoothstep(0.0, -0.5, q.y);
    float wd = (0.03 + 0.012 * sin(q.y * 22.0 + fi * 3.0 + vSeed * 11.0) + 0.006 * sin(q.y * 61.0 + fi * 7.0)) * (1.0 - 0.65 * smoothstep(0.0, -len, q.y));
    arms = min(arms, max(abs(q.x - x) - wd, max(q.y + 0.02, -len - q.y)));
  }
  float armK = (1.0 - inkPixel(arms, max(fwidth(arms), 1e-4))) * (1.0 - inBell);
  // the veils: a few long tendrils, none parallel, thinning and broken
  float veil = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i) / 7.0;
    float h1 = fract(sin((fi + vSeed) * 91.7) * 43758.5);
    float x0 = (fi - 0.5) * 0.5 + 0.03 * hand + (h1 - 0.5) * 0.05;
    float len = 0.7 + 0.75 * h1;
    float t = clamp(-q.y / len, 0.0, 1.0);
    float sway = (0.03 + 0.11 * t) * t * sin(q.y * (3.0 + 2.0 * h1) - vPulse * 0.5 + fi * 5.0 + vSeed * 7.0);
    float dd = abs(q.x - x0 - sway) - mix(0.004, 0.0015, t);
    float on = (1.0 - inkPixel(dd, max(fwidth(dd), 1e-4))) * step(-len, q.y) * step(q.y, 0.0) * (1.0 - t * t);
    veil = max(veil, on * step(0.3, inkN2(vec2(fi * 13.0, q.y * 8.0 + vSeed * 3.0))));
  }
  veil *= (1.0 - inBell) * (1.0 - armK);
  vec4 acc = vec4(mix(uDeep, uSky, 0.45), veil * 0.2);
  acc = lay(vec4(mix(uDeep, skin, 0.45), armK * 0.26), acc);
  acc = lay(vec4(c, aB), acc);
  // the air between: the further, the more of the sky
  float air = smoothstep(30.0, 200.0, vDist);
  acc.rgb = mix(acc.rgb, uSky, air * 0.55);
  acc.a *= (1.0 - air * 0.45) * uShow;
  if (acc.a < 0.01) discard;
  gl_FragColor = acc;
}
`;

/**
 * The drifters: from orbit swarming on the deck, and underfoot in the sky.
 * `week.drifters` is life.js's reading. Returns { object, update, dispose }.
 */
export function createDrifters(T, { features, uniforms, R, palette: pal, colors, week, amount, viewH }) {
  const rng = features.makeRng('life/drifters');
  const spec = week.drifters;
  const subject = week.subject;
  const shell = R + spec.deck;

  // ---- the swarms: a few long veils on the face the poster shows (a giant
  // keeps its own framing, so they are laid out the first time the orbit's eye
  // looks, toward it), drawn out east and west along their belt the way a shoal
  // is drawn out by a current: a wandering spine, thick in the middle and
  // tapering to both ends, the specks gathered into knots along it and thinning
  // out at its edges
  const N = spec.specks;
  const pos = new Float32Array(N * 3);
  const look = new Float32Array(N * 4);
  const veils = [];
  const gauss = () => (rng() + rng() + rng() + rng() - 2) * 0.87;
  const lay = (aim) => {
    for (let i = 0; i < spec.swarms; i++) {
      let c = aim.clone();
      for (let k = 0; k < 64; k++) {
        const y = rng() * 2 - 1, a = rng() * TAU, s = Math.sqrt(1 - y * y);
        const v = new T.Vector3(Math.cos(a) * s, y * 0.8, Math.sin(a) * s).normalize();
        if (v.dot(aim) > (i < spec.swarms - 1 ? 0.8 : 0.45) && veils.every((o) => Math.abs(o.lat - Math.asin(v.y)) > 0.1 || o.c.angleTo(v) > 0.8)) { c = v; break; }
      }
      const knots = Array.from({ length: 4 + Math.floor(rng() * 4) }, () => rng() * 1.6 - 0.8);
      veils.push({
        c, lat: Math.asin(c.y), lon: Math.atan2(c.z, c.x), len: 0.3 + rng() * 0.35, wid: 0.016 + rng() * 0.018,
        bend: (rng() - 0.5) * 0.18, wave: 0.6 + rng() * 1.0, tilt: (rng() - 0.5) * 0.1, phase: rng() * TAU, knots,
      });
    }
    for (let i = 0; i < N; i++) {
      const v = veils[i % veils.length];
      // along the spine: half the shoal in its knots, the rest spread, fewer
      // toward the ends
      let t = rng() < 0.5 ? v.knots[Math.floor(rng() * v.knots.length)] + gauss() * 0.08 : rng() * 2 - 1;
      if (rng() > 1 - t * t) t *= 0.6;
      t = clamp(t, -1, 1);
      const taper = Math.sqrt(Math.max(0, 1 - t * t));
      const lon = v.lon + t * v.len;
      const spine = v.bend * Math.sin(t * v.wave * Math.PI + v.phase) + v.tilt * t;
      const lat = v.lat + spine + gauss() * v.wid * (0.2 + 0.8 * taper);
      const cl = Math.cos(lat);
      pos.set([Math.cos(lon) * cl, Math.sin(lat), Math.sin(lon) * cl], i * 3);
      // most of them shade; one in three catches the sun
      look.set([spec.speck * (0.6 + 0.6 * rng()), (i + 0.5) / N, rng(), rng() < 0.35 ? 0.9 : -0.9], i * 4);
    }
    speckGeo.attributes.position.needsUpdate = true;
    speckGeo.attributes.aLook.needsUpdate = true;
  };
  const speckGeo = new T.BufferGeometry();
  speckGeo.setAttribute('position', new T.BufferAttribute(pos, 3));
  speckGeo.setAttribute('aLook', new T.BufferAttribute(look, 4));
  const speckU = {
    uTime: uniforms.uTime,
    uShow: { value: 0 },
    uAmount: amount,
    uViewH: viewH,
    uRate: { value: spec.rate },
    uShell: { value: shell },
    uLit: { value: new T.Vector3(...spec.lit) },
    uShade: { value: new T.Vector3(...spec.shade) },
  };
  const speckMat = new T.ShaderMaterial({
    uniforms: speckU,
    vertexShader: SPECK_VERT,
    fragmentShader: SPECK_FRAG,
    transparent: true,
    depthWrite: false,
    // the deck times the speck; the sheet's alpha untouched
    blending: T.CustomBlending,
    blendEquation: T.AddEquation,
    blendSrc: T.DstColorFactor,
    blendDst: T.SrcColorFactor,
    blendSrcAlpha: T.ZeroFactor,
    blendDstAlpha: T.OneFactor,
  });
  const specks = new T.Points(speckGeo, speckMat);
  specks.name = 'life-drifters-orbit';
  specks.frustumCulled = false;
  specks.visible = false;
  // over the body's own halo (bodies draw it at renderOrder 3), not under it
  specks.renderOrder = 4;

  // ---- the majestic few, underfoot
  const J = spec.majestic;
  const slots = new Float32Array(J * 4);
  for (let k = 0; k < J; k++) slots.set([k, 0, rng(), (k + 0.5) / J], k * 4);
  const sky = colors.uSkyWash.value.clone().lerp(colors.uSkyBand.value, 0.35);
  const jellyU = {
    uTime: uniforms.uTime,
    uShow: { value: 0 },
    uAmount: amount,
    uSun: uniforms.uSunDir,
    uAt: { value: [new T.Vector4(), new T.Vector4(), new T.Vector4()] },
    // the lineage's tint, half taken by the air it hangs in
    uSkin: { value: spec.skin.clone().lerp(sky, 0.4) },
    uDeep: { value: spec.deep.clone().lerp(sky, 0.15) },
    uSky: { value: sky },
    uLight: { value: pal.paper.clone().lerp(pal.litWarm, 0.25) },
  };
  const jellyMat = new T.ShaderMaterial({ uniforms: jellyU, vertexShader: JELLY_VERT, fragmentShader: JELLY_FRAG, transparent: true, depthWrite: false, side: T.DoubleSide });
  const jellies = new T.Mesh(instancedQuad(T, J, { aSlot: slots }), jellyMat);
  jellies.name = 'life-drifters-foot';
  jellies.frustumCulled = false;
  jellies.visible = false;
  // after the gas giant's ceiling (renderOrder 1), which would otherwise wash over them
  jellies.renderOrder = 2;
  // where the eye lands they hang in its sky: one near and grand off to one
  // side, the one strong thing in it, and one far and small across from it. A
  // gas giant's sky underfoot is the deck overhead (giant-shader.js stands its
  // ceiling a hair under the deck), so there they keep under it, as big as the
  // room between the cloud tops and the deck allows.
  const side = rng() < 0.5 ? -1 : 1;
  const SKY = [[side * 0.4, 0.05, 40, 0.9], [-side * 0.62, 0.55, 130, 0.4]];
  const ceiling = spec.ceiling ? (R + spec.deck) * 0.994 - 1 : Infinity;
  const tmp = new T.Vector3();
  let placed = -1;

  const group = new T.Group();
  group.name = 'life-drifters';
  group.add(specks, jellies);
  group.userData.species = { kind: spec.kind, swarms: spec.swarms, specks: N, majestic: J };
  return {
    object: group,
    update({ orbit, foot, eye, camera }) {
      if (!veils.length && camera) lay(orbit > 0.5 ? tmp.copy(camera.position).normalize() : subject);
      speckU.uShow.value = orbit;
      specks.visible = orbit > 0.002;
      if (eye.serial !== placed && eye.serial > 0) {
        placed = eye.serial;
        for (let k = 0; k < SKY.length; k++) {
          const [x, y, dist, scale] = SKY[k];
          const at = jellyU.uAt.value[k];
          // the bell where the composition wants it, raised until its veils'
          // last reach clears the ground, and as big as the room under a gas
          // giant's ceiling allows
          eye.at(x, y, dist, tmp);
          const r = tmp.length();
          tmp.normalize();
          const ground = R + Math.max(features.heightAt(tmp), features.seaLevel) + 1.5;
          const size = Math.min(spec.giant * scale, (ceiling - ground) / 1.6);
          tmp.multiplyScalar(clamp(r, ground + 1.05 * size, ceiling - 0.55 * size));
          at.set(tmp.x, tmp.y, tmp.z, size > 3 ? size : 0);
        }
      }
      const show = placed > 0 ? foot : 0;
      jellyU.uShow.value = show;
      jellies.visible = show > 0.002;
    },
    dispose() {
      speckGeo.dispose();
      speckMat.dispose();
      jellies.geometry.dispose();
      jellyMat.dispose();
    },
  };
}

export const driftersFor = (T, body, features, pal, genes) => {
  const hours = Number(features.stats?.hours) || 0;
  const ice = body === 'ice';
  // the skin's colour underfoot: a lineage of rose, violet, sea-green or amber
  // bells, each the palette's own hue at the clarity of a living membrane and
  // never the deck's own hue: no amber over a giant's warm belts, no sea-green
  // over an ice giant's
  const hsl = { h: 0, s: 0, l: 0 };
  const tone = (c, dh, s, l) => {
    c.getHSL(hsl);
    return new T.Color().setHSL((hsl.h + dh + 1) % 1, s, l);
  };
  const tints = [
    tone(pal.vermilion, -0.035, 0.42, 0.66),
    tone(pal.shadeCool, 0.02, 0.36, 0.62),
    tone(pal.teal, 0, 0.36, 0.58),
    tone(pal.litWarm, 0, 0.5, 0.62),
  ];
  const kin = ice ? [0, 1, 3] : [0, 1, 2];
  const skin = tints[kin[Math.floor(genes.bell * 3) % 3]];
  const energy = clamp(Number(features.energy) || 0, 0, 1.5);
  return {
    kind: ice ? 'ice drifters' : 'gas-bags',
    // from orbit: the week's hours are the shoal's numbers
    swarms: ice ? 2 : 3,
    specks: Math.round(clamp((ice ? 900 : 1600) + hours * (ice ? 60 : 110), 900, ice ? 2200 : 3600)),
    speck: ice ? 0.32 : 0.36,
    // what a speck makes of the deck under it: lit a shade lighter and warmer,
    // shading a shade darker and cooler (on an ice giant's pale deck it takes
    // a deeper shade to show at all)
    lit: ice ? [1.08, 1.08, 1.06] : [1.12, 1.09, 1.03],
    shade: ice ? [0.8, 0.85, 0.9] : [0.84, 0.84, 0.9],
    // the deck: a gas giant's stands DECK_LIFT over the ground (giant-shader.js),
    // an ice giant's shell a lift over the orbit's relief cap (bodies/ice.js);
    // only the gas giant's hangs overhead as the sky underfoot
    deck: ice ? Math.max(Number(features.orbit?.reliefCap) || 12, 6) + 2 : 20,
    ceiling: !ice,
    rate: ice ? 0.012 : 0.011 + 0.016 * clamp(energy / 1.5, 0, 1) + 0.010 * clamp(Number(features.roughness) || 0, 0, 1),
    // underfoot: one majestic, and one far off
    majestic: 2,
    giant: (ice ? 8 : 9) * (0.85 + 0.3 * genes.arms),
    skin,
    deep: skin.clone().lerp(pal.ink, 0.3),
    why: `${hours.toFixed(1)} hours → ${ice ? 'a cold sky' : 'a gas giant'}'s drifters`,
  };
};

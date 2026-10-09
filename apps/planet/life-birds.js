/* Planet Creator — the week's life: the birds (life.js).
 *
 *   the skeins       every long route the week ran or rode is a flyway: the
 *                    great circle through its start and its finish, flown by one
 *                    long thin skein that crosses the week's own country at the
 *                    poster's moment. From orbit a skein is at its true scale, a
 *                    hairline of birds a few pixels long, and it is the ground
 *                    under it a shade darker rather than ink laid on it: found on
 *                    a second look, never a speck of dust on the print.
 *   the murmuration  underfoot, the week's sessions are a murmuration of
 *                    starlings over the country, out in the middle distance of
 *                    the sky the eye lands under: one sheet of birds folding and
 *                    turning through itself, dark where it is seen edge on, the
 *                    air's colour as much as the ink's.
 *   the high skein   and the longest flyway's skein going over, high and small,
 *                    the house's own bird (two arcs of the brush meeting at a
 *                    body) beating steadily across.
 * Underfoot both are placed by where the eye lands (life-kit.js landingEye), and
 * held there while it walks. One instanced quad per bird and the clock alone. */
import { MARK, NOISE, TAU, clamp, hashStr, instancedQuad, mulberry32 } from './life-kit.js';

const SKEIN_VERT = /* glsl */ `
attribute vec4 aWay;    // flyway axis, angular speed (rad/s, signed)
attribute vec4 aRef;    // the flyway's zero, altitude over the radius
attribute vec4 aSlot;   // phase, units along (behind the leader), units across, seed
attribute vec4 aLook;   // size, beats a second, rank, -
uniform float uTime, uR, uOrbit, uAmount;
varying vec2 vUv;
varying float vBeat, vFade;
${MARK}
void main(){
  vec3 A = aWay.xyz, U = aRef.xyz, W = cross(A, U);
  float rad = uR + aRef.w;
  float th = aSlot.x + aWay.w * uTime + sign(aWay.w) * aSlot.y / rad;
  vec3 P = cos(th) * U + sin(th) * W;
  vec3 F = (cos(th) * W - sin(th) * U) * sign(aWay.w);
  // each bird keeps its slot loosely
  float across = aSlot.z + sin(uTime * 0.5 + aSlot.w * 6.3) * 0.08;
  float along = sin(uTime * 0.37 + aSlot.w * 3.1) * 0.08;
  vec3 C = P * rad + A * across + F * along;
  vec2 mk = inkMark(projectionMatrix * viewMatrix * vec4(C, 1.0), aLook.x);
  vec3 corner = C + (A * position.x + F * position.y) * mk.x;
  vUv = uv;
  vBeat = uTime * aLook.y * 6.2831853 + aSlot.w * 17.0;
  vFade = mk.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(corner, 1.0);
  // a population the dial has not reached yet, or no orbit to see it from
  if (aLook.z >= uAmount || uOrbit <= 0.001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

// A bird seen from above, its wings swept back from the body and drawing in
// with the beat; the mark is what it takes from the ground under it.
const SKEIN_FRAG = /* glsl */ `
uniform float uOrbit, uDark;
varying vec2 vUv;
varying float vBeat, vFade;
${NOISE}
void main(){
  vec2 q = vUv - 0.5;
  float span = 0.44 * (0.78 + 0.22 * sin(vBeat));
  vec2 root = vec2(0.0, 0.1);
  float d = min(inkSeg(q, root, vec2(-span, -0.14), 0.1, 0.05), inkSeg(q, root, vec2(span, -0.14), 0.1, 0.05));
  float a = (1.0 - inkPixel(d, max(fwidth(d), 1e-4))) * vFade * uOrbit;
  if (a < 0.01) discard;
  // the sheet times the mark: 2 × src × dst (see the blend)
  gl_FragColor = vec4(vec3(mix(1.0, uDark, a)) * 0.5, 1.0);
}
`;

const MURMUR_VERT = /* glsl */ `
attribute vec4 aBird;   // across and up on the sheet (-1..1), through it, seed
attribute vec4 aLook;   // size, rank, beats a second, -
uniform float uTime, uFoot, uAmount, uScale, uShare, uPhase;
uniform vec3 uCentre, uE1, uE2, uE3;
varying vec2 vUv;
varying float vFade, vDist, vBeat;
${MARK}
void main(){
  float t = uTime + uPhase;
  vec2 s = aBird.xy;
  // the outline draws out and gathers in again
  float stretch = 1.0 + 0.3 * sin(t * 0.19 + 1.3);
  vec2 p = vec2(s.x * stretch, s.y / stretch);
  // the sheet folds through itself — a wave travelling along it and another
  // across it — and twists, so it goes edge on and opens again
  float fold = 0.55 * sin(p.x * 2.1 + t * 0.53) + 0.3 * sin(p.y * 2.6 - t * 0.41 + 2.0);
  float tw = 0.9 * sin(t * 0.16 + p.x * 0.9);
  vec3 sheet = uE1 * p.x + (uE2 * cos(tw) + uE3 * sin(tw)) * p.y * 0.6 + (uE3 * cos(tw) - uE2 * sin(tw)) * fold;
  // every bird a little off the sheet, and the whole flock wheeling slowly
  sheet += (uE3 * cos(tw) - uE2 * sin(tw)) * aBird.z * 0.1;
  vec3 C = uCentre + (uE1 * sin(t * 0.07) * 0.5 + uE2 * sin(t * 0.11) * 0.25) * uScale + sheet * uScale;
  vec4 clip = projectionMatrix * viewMatrix * vec4(C, 1.0);
  vec2 mk = inkMark(clip, aLook.x);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 corner = C + (right * position.x + up * position.y) * mk.x;
  vUv = uv;
  vFade = mk.y;
  vDist = distance(cameraPosition, C);
  vBeat = t * aLook.z * 6.2831853 + aBird.w * 40.0;
  gl_Position = projectionMatrix * viewMatrix * vec4(corner, 1.0);
  if (aLook.y >= uAmount * uShare || uFoot <= 0.001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

// A starling at a few pixels: a body and the blur of its wings.
const MURMUR_FRAG = /* glsl */ `
uniform vec3 uInk, uSky;
uniform float uFoot;
varying vec2 vUv;
varying float vFade, vDist, vBeat;
${NOISE}
void main(){
  vec2 q = vUv - 0.5;
  float wing = 0.36 + 0.1 * sin(vBeat);
  float d = min(inkEll(q, vec2(0.0), vec2(0.13, 0.11)), inkSeg(q, vec2(-wing, 0.04 * sin(vBeat)), vec2(wing, 0.04 * sin(vBeat)), 0.06, 0.06));
  float a = (1.0 - inkPixel(d, max(fwidth(d), 1e-4))) * vFade * uFoot * 0.85;
  if (a < 0.01) discard;
  // the further, the more of the air's colour
  gl_FragColor = vec4(mix(uInk, uSky, 0.3 + 0.5 * smoothstep(20.0, 160.0, vDist)), a);
}
`;

const HIGH_VERT = /* glsl */ `
attribute vec4 aSlot;   // units along (behind the leader), units across, seed, rank
uniform float uTime, uFoot, uAmount, uSpeed, uLoop, uSpan, uBeat;
uniform vec3 uStart, uVel, uAcross;
varying vec2 vUv;
varying float vBeat, vSeed, vDist, vFade;
${MARK}
void main(){
  vec3 up = normalize(uStart);
  // the skein is over the eye at the start of the clock, and comes round again
  float s = mod(uTime * uSpeed + uLoop * 0.5, uLoop) - uLoop * 0.5;
  vec3 C = uStart + uVel * (s - aSlot.x) + uAcross * aSlot.y + up * sin(uTime * 0.4 + aSlot.z * 9.0) * 0.3;
  vec4 clip = projectionMatrix * viewMatrix * vec4(C, 1.0);
  vec2 mk = inkMark(clip, uSpan);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 vup = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 corner = C + (right * position.x + vup * position.y) * mk.x;
  vUv = uv;
  vBeat = uTime * uBeat * (0.92 + 0.16 * aSlot.z) * 6.2831853 + aSlot.z * 23.0;
  vSeed = aSlot.z;
  vDist = distance(cameraPosition, C);
  vFade = mk.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(corner, 1.0);
  if (aSlot.w >= uAmount || uFoot <= 0.001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

// The house's bird: two arcs of the brush meeting at a body, beating steadily,
// the stroke swelling at the shoulder and lifting off to a hairline at the tip.
const HIGH_FRAG = /* glsl */ `
uniform vec3 uInk, uSky;
uniform float uFoot;
varying vec2 vUv;
varying float vBeat, vSeed, vDist, vFade;
${NOISE}
void main(){
  vec2 q = vUv - 0.5;
  float beat = sin(vBeat);
  vec2 root = vec2(0.0, -0.03);
  float d = 1e3;
  for (int s = -1; s <= 1; s += 2) {
    float side = float(s);
    vec2 elbow = vec2(side * 0.19, 0.06 + 0.12 * beat);
    vec2 tip = vec2(side * 0.47, 0.22 * beat - 0.02);
    d = min(d, min(inkSeg(q, root, elbow, 0.05, 0.034), inkSeg(q, elbow, tip, 0.034, 0.007)));
  }
  d = min(d, inkEll(q, vec2(0.0, -0.04), vec2(0.075, 0.045)));
  float a = (1.0 - inkPixel(d, max(fwidth(d), 1e-4))) * vFade * uFoot;
  if (a < 0.02) discard;
  gl_FragColor = vec4(mix(uInk, uSky, 0.35 + 0.45 * smoothstep(30.0, 200.0, vDist)), a);
}
`;

function birdMesh(T, { name, count, attrs, vert, frag, uniforms, blend }) {
  const mat = new T.ShaderMaterial({
    uniforms,
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    ...blend,
  });
  const mesh = new T.Mesh(instancedQuad(T, count, attrs), mat);
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.visible = false;
  return mesh;
}

/**
 * The skeins (orbit), the murmuration and the high skein (underfoot).
 * `week.flyways` and `week.murmuration` are life.js's reading.
 * Returns { object, update(frame), dispose }.
 */
export function createBirds(T, { features, uniforms, R, palette: pal, colors, week, amount, viewH, rng }) {
  const group = new T.Group();
  group.name = 'life-birds';
  const meshes = [];

  // ---- the skeins: the dial lets whole skeins in, never half a V
  const birds = [];
  week.flyways.forEach((way, w) => {
    const rank = (w + 0.5) / week.flyways.length;
    let row = 0;
    for (let k = 0; k < way.birds; k++) {
      // a V: the leader, then a bird down each arm in turn, each arm its own
      // length; an echelon is one arm only, strung out on a diagonal. Now and
      // then a bird has dropped out of its place.
      if (k > 2 && rng() < 0.08) continue;
      row = way.echelon ? k : Math.ceil(k / 2);
      const side = way.echelon ? 1 : k === 0 ? 0 : k % 2 ? 1 : -1;
      const j = rng() - 0.5;
      birds.push({ way, rank, along: -row * way.gap * (1 + 0.2 * j), across: side * row * way.gap * way.spread * (1 + 0.3 * j), seed: rng() });
    }
  });
  const sk = {
    aWay: new Float32Array(birds.length * 4),
    aRef: new Float32Array(birds.length * 4),
    aSlot: new Float32Array(birds.length * 4),
    aLook: new Float32Array(birds.length * 4),
  };
  birds.forEach((b, i) => {
    const w = b.way;
    sk.aWay.set([w.axis.x, w.axis.y, w.axis.z, w.speed], i * 4);
    sk.aRef.set([w.ref.x, w.ref.y, w.ref.z, w.altitude], i * 4);
    sk.aSlot.set([w.phase, b.along, b.across, b.seed], i * 4);
    sk.aLook.set([w.size * (0.85 + 0.3 * b.seed), w.beat * (0.92 + 0.16 * b.seed), b.rank, 0], i * 4);
  });
  const skeinU = {
    uTime: uniforms.uTime,
    uR: { value: R },
    uOrbit: { value: 1 },
    uAmount: amount,
    uViewH: viewH,
    uDark: { value: 0.45 },
  };
  const skeins = birds.length ? birdMesh(T, {
    name: 'life-skeins', count: birds.length, attrs: sk, vert: SKEIN_VERT, frag: SKEIN_FRAG, uniforms: skeinU,
    // the ground under a skein, a shade darker; the sheet's alpha untouched
    blend: { blending: T.CustomBlending, blendEquation: T.AddEquation, blendSrc: T.DstColorFactor, blendDst: T.SrcColorFactor, blendSrcAlpha: T.ZeroFactor, blendDstAlpha: T.OneFactor },
  }) : null;
  if (skeins) {
    skeins.userData.species = week.flyways.map((w) => ({ kind: w.kind, birds: w.birds, why: w.why }));
    group.add(skeins);
    meshes.push(skeins);
  }

  // the air the far birds are seen through, from the ground
  const sky = colors.uFarGlaze.value.clone().lerp(colors.uSkyWash.value, 0.4);
  const ink = pal.ink.clone().lerp(pal.shadeCool, 0.2);

  // ---- the murmuration: a sheet of birds, denser in its heart, ragged at its
  // edge, a few strung out in streamers
  const mm = week.murmuration;
  let murmur = null, murmurU = null;
  if (mm) {
    const n = mm.birds;
    const ma = { aBird: new Float32Array(n * 4), aLook: new Float32Array(n * 4) };
    for (let i = 0; i < n; i++) {
      let x, y;
      if (rng() < 0.08) {
        // a streamer drawn off one end
        const t = rng();
        x = 0.7 + t * 0.9; y = 0.25 * Math.sin(t * 3 + 1) + (rng() - 0.5) * 0.08;
      } else {
        // a dense heart, thinning out to a ragged edge
        const a = rng() * TAU, r = Math.min(1.1, Math.sqrt(-2 * Math.log(1 - rng() * 0.98)) * 0.42);
        x = Math.cos(a) * r; y = Math.sin(a) * r;
      }
      ma.aBird.set([x, y, rng() * 2 - 1, rng()], i * 4);
      ma.aLook.set([mm.size * (0.8 + 0.4 * rng()), (i + 0.5) / n, 6 + rng() * 4, 0], i * 4);
    }
    murmurU = {
      uTime: uniforms.uTime,
      uFoot: { value: 0 },
      uAmount: amount,
      uViewH: viewH,
      uScale: { value: mm.scale },
      uShare: { value: 1 },
      uPhase: { value: 0 },
      uCentre: { value: new T.Vector3() },
      uE1: { value: new T.Vector3(1, 0, 0) },
      uE2: { value: new T.Vector3(0, 1, 0) },
      uE3: { value: new T.Vector3(0, 0, 1) },
      uInk: { value: ink },
      uSky: { value: sky },
    };
    murmur = birdMesh(T, { name: 'life-murmuration', count: n, attrs: ma, vert: MURMUR_VERT, frag: MURMUR_FRAG, uniforms: murmurU });
    murmur.userData.species = { kind: 'starlings', birds: n, why: mm.why };
    group.add(murmur);
    meshes.push(murmur);
  }

  // ---- the high skein: the longest flyway's, going over
  const top = week.flyways[0];
  let high = null, highU = null;
  if (top) {
    const n = clamp(top.birds, 9, 21);
    const ha = { aSlot: new Float32Array(n * 4) };
    for (let k = 0; k < n; k++) {
      const row = top.echelon ? k : Math.ceil(k / 2);
      const side = top.echelon ? 1 : k === 0 ? 0 : k % 2 ? 1 : -1;
      ha.aSlot.set([row * 2.2, side * row * 2.2 * 0.7, rng(), (k + 0.5) / n], k * 4);
    }
    highU = {
      uTime: uniforms.uTime,
      uFoot: { value: 0 },
      uAmount: amount,
      uViewH: viewH,
      uSpeed: { value: top.ride ? 2.2 : 2.8 },
      uLoop: { value: 260 },
      uSpan: { value: top.ride ? 1.5 : 1.1 },
      uBeat: { value: top.ride ? 1.3 : 2.2 },
      uStart: { value: new T.Vector3() },
      uVel: { value: new T.Vector3(1, 0, 0) },
      uAcross: { value: new T.Vector3(0, 0, 1) },
      uInk: { value: ink },
      uSky: { value: sky },
    };
    high = birdMesh(T, { name: 'life-high-skein', count: n, attrs: ha, vert: HIGH_VERT, frag: HIGH_FRAG, uniforms: highU });
    high.userData.species = { kind: top.kind, birds: n, why: top.why };
    group.add(high);
    meshes.push(high);
  }

  // where the eye lands, the flock and the skein are put in its sky. A
  // murmuration is met only now and then, and never the same twice: each
  // landing draws its own (life-kit.js mulberry32 on the week and the landing's
  // count, so the same landing always meets the same sky) — most see open sky,
  // a few a small knot far off, now and then a great cloud of birds
  const side = rng() < 0.5 ? -1 : 1;
  const tmp = new T.Vector3();
  const spot = { x: 0, y: 0, dist: 0 };
  let placed = -1, landings = 0, drawn = -1, flock = false;
  const place = (eye) => {
    if (murmurU) {
      // (drawn once a landing: the descent keeps the sky it is coming down into)
      if (drawn !== landings) {
        drawn = landings;
        const r = mulberry32(hashStr(`${features.week}/murmuration/${landings}`));
        flock = r() < 0.4;
        const mass = r() * r();
        murmurU.uShare.value = 0.2 + 0.8 * mass;
        murmurU.uScale.value = mm.scale * (0.4 + 1.1 * mass);
        murmurU.uPhase.value = r() * 400;
        spot.x = (r() < 0.5 ? -side : side) * (0.2 + 0.5 * r());
        spot.y = 0.3 + 0.45 * r();
        spot.dist = mm.dist * (0.8 + 1.2 * r());
      }
      if (eye.landed) landings++;
      eye.at(spot.x, spot.y, spot.dist, murmurU.uCentre.value);
      // never down in the hills: a flock this size keeps well over the ground
      tmp.copy(murmurU.uCentre.value).normalize();
      const floor = R + Math.max(features.heightAt(tmp), features.seaLevel) + murmurU.uScale.value * 1.6;
      if (murmurU.uCentre.value.length() < floor) murmurU.uCentre.value.copy(tmp).multiplyScalar(floor);
      murmurU.uE1.value.copy(eye.side);
      murmurU.uE2.value.copy(eye.up);
      murmurU.uE3.value.copy(eye.fw);
    }
    if (highU) {
      eye.at(-side * 0.15, 0.8, 120, highU.uStart.value);
      highU.uVel.value.copy(eye.side).multiplyScalar(side);
      highU.uAcross.value.copy(eye.fw);
    }
  };

  return {
    object: group,
    update({ orbit, foot, eye }) {
      skeinU.uOrbit.value = orbit;
      if (skeins) skeins.visible = orbit > 0.002;
      if (eye.serial !== placed && eye.serial > 0) {
        place(eye);
        placed = eye.serial;
      }
      const show = placed > 0 ? foot : 0;
      if (murmurU) {
        murmurU.uFoot.value = flock ? show : 0;
        murmur.visible = flock && show > 0.002;
      }
      if (highU) {
        highU.uFoot.value = show;
        high.visible = show > 0.002;
      }
    },
    dispose() {
      for (const m of meshes) {
        m.geometry.dispose();
        m.material.dispose();
      }
    },
  };
}

/* Planet Creator — the week's life: the sea (life.js).
 *
 * The bloom: plankton fed by the week's sweat, its salt. It is not a shape laid
 * on the water but the water's own colour shifted: a glaze the sheet's colour is
 * multiplied by (the blend is the sea already painted times the glaze), so the
 * bloom keeps the value of whatever water it lies in — lighter over the
 * shallows, deep over the deep, and gone on the night side with the sea itself.
 * It is carried the way a satellite sees a bloom: marbled by the current into
 * filaments, wound loosely round a few small eddies (most of them in pairs
 * turning against each other), thick in swaths over the shelf and thinning out
 * into open water, the pigment settled into the paper's tooth. The week's warmth
 * is its kind: diatoms green a cold sea, coccoliths turn a mild one milky
 * turquoise, a very hot one carries a rust tide. The current carries the
 * pattern through its eddies with the clock.
 *
 * Life grows where the week was lived: the bloom is sought first off the coasts
 * nearest the week's own sites, which is the face the poster is turned to. */
import { NOISE, TAU, clamp, tangentFrame } from './life-kit.js';

const REGIONS = 2;
const EDDIES = 6;

const VERT = /* glsl */ `
varying vec3 vW;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  // brought forward along the line of sight (the house's ground-wash trick):
  // nothing moves on the sheet, and the skin never fights the water for depth
  vec3 toCam = cameraPosition - wp.xyz;
  float dist = length(toCam);
  wp.xyz += toCam / max(dist, 1e-4) * (0.03 + 0.0025 * dist);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
uniform sampler2D tLand, tCoast;
uniform float uTime, uShow, uAmount, uFreq, uLines;
uniform vec3 uTint, uVein, uOff, uDrift;
uniform int uRegN, uEddyN;
uniform vec4 uReg[${REGIONS}];    // centre (unit), radius (rad)
uniform vec3 uEC[${EDDIES}];      // eddy centre (unit)
uniform vec4 uEP[${EDDIES}];      // radius (rad), twist at the eye (rad, signed), breath, -
varying vec3 vW;
${NOISE}
void main(){
  vec3 d = normalize(vW);
  vec3 V = normalize(cameraPosition - vW);
  // the size of a pixel on the unit sphere, read before anything is discarded
  float px = max(length(fwidth(d)), 1e-6);
  // where the bloom lives: a ragged patch round each of its centres
  float rag = (inkF3(d * 3.4 + uOff) - 0.5) * 0.7;
  float reg = 0.0;
  for (int i = 0; i < ${REGIONS}; i++) {
    if (i >= uRegN) break;
    float r = acos(clamp(dot(d, uReg[i].xyz), -1.0, 1.0)) / uReg[i].w + rag;
    reg = max(reg, 1.0 - smoothstep(0.4, 1.05, r));
  }
  if (reg < 0.003) discard;
  vec2 uv = inkUV(d);
  float landH = texture2D(tLand, uv).r;
  float coast = texture2D(tCoast, uv).r;
  float shore = smoothstep(-0.05, -0.6, landH);
  // thickest over the shelf, thinning out into open water
  float shelf = mix(0.45, 1.0, 1.0 - smoothstep(6.0, 50.0, coast));

  // ---- the current: the pattern wound round each eddy (a turn that dies off
  // with distance from its eye, so the filaments are drawn round it rather than
  // a spiral drawn on it), and the whole field carried through them
  vec3 p = d;
  for (int i = 0; i < ${EDDIES}; i++) {
    if (i >= uEddyN) break;
    vec3 c = uEC[i];
    float r = acos(clamp(dot(p, c), -1.0, 1.0)) / uEP[i].x;
    float th = uEP[i].y * exp(-r * r) * (1.0 + 0.12 * sin(uTime * 0.07 + uEP[i].z));
    float ct = cos(th), st = sin(th);
    p = p * ct + cross(c, p) * st + c * dot(c, p) * (1.0 - ct);
  }
  vec3 q = p * uFreq + uOff + uDrift * uTime;
  vec3 w = vec3(inkF3(q * 0.5 + 3.1), inkF3(q * 0.5 + 17.3), inkF3(q * 0.5 + 29.7)) - 0.5;
  q += w * 3.0;
  float dye = inkF3(q);
  float vein = inkF3(q * 2.1 + 11.0);
  // the envelope: where the dye is thick enough to show at all
  float env = smoothstep(0.26, 0.56, dye);
  // the marbling: the dye's contours pulled into bands by the current, tinted
  // water and clear lanes in turn, each lane its own width. A band's edge is
  // never under a pixel; where a band is narrower than a few pixels it is
  // only its colour, the way the eye takes it from further off.
  float band = 0.5 + 0.5 * cos(6.2831853 * (dye * uLines + vein * 0.8));
  float aa = px * uFreq * uLines * 4.0;
  float cut = 0.5 + (vein - 0.5) * 0.7;
  float marb = smoothstep(cut - 0.08 - aa, cut + 0.08 + aa, band);
  marb = mix(marb, 0.5, smoothstep(0.6, 1.4, aa));
  // the limb is the ocean's own business: the glaze dies away over the last of
  // the disc, where a pixel holds a hundred of its marks
  float hold = smoothstep(0.05, 0.3, abs(dot(d, V)));
  float k = reg * shelf * shore * hold * uShow * uAmount;
  // the pigment settled into the paper's tooth
  float grain = 0.82 + 0.36 * inkN3(d * 420.0 + uOff);
  float body = clamp(env * (0.15 + 0.85 * marb) * grain * k, 0.0, 1.0);
  vec3 m = mix(vec3(1.0), uTint, body);
  // and a step further where the lanes are thickest
  m *= mix(vec3(1.0), uVein, body * marb);
  // the sheet times the glaze: 2 × src × dst (see the blend)
  gl_FragColor = vec4(m * 0.5, 1.0);
}
`;

/**
 * The sea's skin. `week` is life.js's reading (bloom, the survey readers and
 * the week's subject). Returns { object, update(frame), dispose }.
 */
export function createSea(T, { features, survey, uniforms, R, rng, week, amount }) {
  const { coastAt, landAt } = week.read;
  const subject = week.subject;
  const bloom = week.bloom;
  // open water between two distances from a coast, spread apart from each
  // other and from `taken`, sought first toward `toward`
  const pick = (n, minCoast, maxCoast, apart, toward = subject, taken = []) => {
    const found = [];
    for (let i = 0; i < 1400; i++) {
      const y = rng() * 2 - 1, a = rng() * TAU, s = Math.sqrt(1 - y * y);
      const v = new T.Vector3(Math.cos(a) * s, y * 0.92, Math.sin(a) * s).normalize();
      if (landAt(v) > -0.8) continue;
      const c = coastAt(v);
      if (c < minCoast || c > maxCoast) continue;
      found.push({ v, score: v.dot(toward) + rng() * 0.45 });
    }
    found.sort((a, b) => b.score - a.score);
    const out = taken.slice();
    for (const { v } of found) {
      if (out.length >= taken.length + n) break;
      if (out.every((o) => o.dot(v) < Math.cos(apart))) out.push(v);
    }
    return out.slice(taken.length);
  };
  // one bloom off the week's own coast, and on a wetter week a second, smaller
  // one somewhere else on the world
  const centres = pick(1, 6, 40, 0);
  if (bloom.regions > 1) centres.push(...pick(1, 6, 40, 1.2, subject.clone().negate(), centres));
  const reg = [];
  for (let i = 0; i < REGIONS; i++) {
    const c = centres[i] || new T.Vector3(0, 1, 0);
    reg.push(new T.Vector4(c.x, c.y, c.z, bloom.reach * (i === 0 ? 1 : 0.7) * (0.9 + rng() * 0.2)));
  }
  // the eddies inside it: most of them in pairs, a turn each way
  const EC = [], EP = [];
  const e = new T.Vector3(), n = new T.Vector3();
  for (let i = 0; i < EDDIES; i++) {
    const host = reg[i % Math.max(1, centres.length)];
    const c = new T.Vector3(host.x, host.y, host.z);
    tangentFrame(T, c, e, n);
    const pair = i % 2 === 1 ? EC[i - 1] : null;
    let at;
    if (pair) {
      // the partner: a little way off, turning the other way
      tangentFrame(T, pair, e, n);
      const a = rng() * TAU, r = (EP[i - 1].x * (1.4 + rng() * 0.6));
      at = pair.clone().addScaledVector(e, Math.cos(a) * r).addScaledVector(n, Math.sin(a) * r).normalize();
    } else {
      const a = rng() * TAU, r = Math.sqrt(rng()) * host.w * 0.75;
      at = c.clone().addScaledVector(e, Math.cos(a) * r).addScaledVector(n, Math.sin(a) * r).normalize();
    }
    EC.push(at);
    const radius = (0.04 + rng() * 0.05) * (pair ? 0.8 : 1);
    const turn = (1.6 + rng() * 1.6) * (pair ? -Math.sign(EP[i - 1].y) : rng() < 0.5 ? -1 : 1);
    EP.push(new T.Vector4(radius, turn, rng() * TAU, 0));
  }
  // the glaze: what the bloom multiplies the water by where it is thickest,
  // and its filaments a step further
  const KIND = {
    emerald: { tint: [0.76, 1.07, 0.82], vein: [0.9, 1.05, 0.92] },
    cocco: { tint: [1.12, 1.28, 1.2], vein: [1.08, 1.14, 1.1] },
    red: { tint: [1.16, 0.88, 0.74], vein: [1.08, 0.92, 0.84] },
  }[bloom.hue];
  const u = {
    tLand: { value: survey.land },
    tCoast: { value: survey.coast },
    uTime: uniforms.uTime,
    uShow: { value: 1 },
    uAmount: amount,
    uFreq: { value: 4 + rng() * 1.2 },
    uLines: { value: 3.5 + rng() },
    uTint: { value: new T.Vector3(...KIND.tint) },
    uVein: { value: new T.Vector3(...KIND.vein) },
    uOff: { value: new T.Vector3(rng() * 40, rng() * 40, rng() * 40) },
    uDrift: { value: new T.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(0.03) },
    uRegN: { value: centres.length },
    uReg: { value: reg },
    uEddyN: { value: centres.length ? EDDIES : 0 },
    uEC: { value: EC },
    uEP: { value: EP },
  };
  const material = new T.ShaderMaterial({
    uniforms: u,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    // the sheet times the glaze, twice over so a glaze can lighten as well as
    // deepen; the wash pass reads the sea's own alpha as its handoff: keep it
    blending: T.CustomBlending,
    blendEquation: T.AddEquation,
    blendSrc: T.DstColorFactor,
    blendDst: T.SrcColorFactor,
    blendSrcAlpha: T.ZeroFactor,
    blendDstAlpha: T.OneFactor,
  });
  const geometry = new T.SphereGeometry(R + features.seaLevel + 0.06, 128, 80);
  const mesh = new T.Mesh(geometry, material);
  mesh.name = 'life-sea';
  mesh.frustumCulled = false;
  // under the cloud's shadow and the week's own marks
  mesh.renderOrder = -3;
  mesh.userData.species = { bloom: bloom.hue, regions: centres.length, eddies: centres.length ? EDDIES : 0 };
  return {
    object: mesh,
    update({ orbit, foot }) {
      u.uShow.value = Math.max(orbit, foot * 0.6);
      mesh.visible = centres.length > 0 && u.uShow.value > 0.002;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

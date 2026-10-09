/* Planet Creator — the week's life: the herds (life.js).
 *
 * Every run the week carried over the ground leaves a herd or two grazing the
 * flanks of its range — beside the route, never on it, never at a landmark's
 * foot and never in a lagoon. What kind is the run's own ground: a climbing run
 * keeps ibex (stocky, a sweep of horn), a long one bison (the hump, the low
 * head), any other antelope (long legs, back-swept horns). The lineage of the
 * date sets their proportions, so the herds of neighbouring weeks are kin.
 * Wherever the eye lands (life-kit.js landingEye) three of the week's own kind
 * are come upon in the middle distance, off to one side: one grazing, one a
 * few strides behind it walking the other way, and one farther back still,
 * head up and half turned to the eye, the brow of the ground over its legs —
 * each at its own depth and in its own pose, never a row. None is met close by
 * the eye.
 *
 * They are painted the way a background painter puts animals into a
 * landscape: three washes on the body modelled as one rounded mass — the back
 * and whatever faces the sun in a warm light, the flank the coat's own, the
 * belly, the far legs and the horns in a cool shade; against the light the
 * back keeps a rim broadened by a half-lit band and the flank a half-shade,
 * never the belly's — a warm broken edge where the sun comes over the back,
 * the hooves set down in a shadow pooled on the ground in front of them, and
 * the air between laid over them as it is over the ancients, so a far herd
 * goes into the haze. Each animal is one quad stood on its own ground and
 * turned to the eye, its side view drawn in the shader (foreshortened when it
 * is half turned). They graze — the head goes down and comes up — and shuffle
 * about on their own legs, all of it off the clock; the three met on landing
 * hold their poses. */
import { NOISE, TAU, clamp, instancedQuad, num, solidsOf, sstep, tangentFrame } from './life-kit.js';

const W = 2.8, H = 2.0;   // the quad, in animal units (an antelope is ~1.1 tall at the back)
const LANDING = 3;        // the herd met where the eye lands
const CLOCK = [-1, -1, 0, 1]; // a pose the clock keeps (aPose)

const VERT = /* glsl */ `
attribute vec4 aHome;   // where it stands this frame (createHerds keeps it clear of the rest), its pace east
attribute vec4 aGrad;   // the ground's slope east and north at its place, its pace north, seed
attribute vec4 aForm;   // species (0 antelope, 1 ibex, 2 bison), size, rank, coat
attribute vec4 aPose;   // a held pose: head down (1) or up (0), stride, facing (±1), turn (1 side-on
                        // … 0.5 three-quarter); a head or stride of -1 and a facing of 0 are the clock's
uniform float uTime, uFoot, uAmount;
uniform vec3 uSun;
varying vec2 vQ;
varying vec3 vSun;
varying float vFace, vLeg, vWalk, vGraze, vDist, vTurn;
varying vec4 vForm;
void main(){
  vec3 foot = aHome.xyz;
  vec3 up = normalize(foot);
  // east and north as the survey's chart turns them (life-kit.js tangentFrame),
  // the frame aGrad's slope and the pace were read in
  vec3 E = normalize(cross(up, vec3(0.0, 1.0, 0.0)) + vec3(1e-4, 0.0, 0.0));
  vec3 N = cross(up, E);
  float sd = aGrad.w;
  vec2 vel = vec2(aHome.w, aGrad.z);
  float speed = length(vel);
  vec3 toCam = cameraPosition - foot;
  vec3 side = cross(up, toCam);
  side = length(side) > 1e-4 ? normalize(side) : E;
  float s = aForm.y;
  // the quad's baseline laid along the slope it stands on, the hooves a hair
  // above the ground and room under them for the shadow
  vec2 qq = vec2(position.x * ${W.toFixed(1)}, (position.y + 0.5) * ${(H + 0.12).toFixed(2)} - 0.12);
  // (half of it: on a slope an animal keeps its back nearer level than the ground)
  float lean = clamp(0.6 * (aGrad.x * dot(E, side) + aGrad.y * dot(N, side)), -0.45, 0.45);
  vec3 corner = foot + side * (qq.x * s) + up * ((qq.y + qq.x * lean - 0.02) * s);
  vec3 velW = E * vel.x + N * vel.y;
  // which way it faces on the sheet, and keeps facing while it stands
  float headX = dot(velW, side);
  vFace = aPose.z != 0.0 ? aPose.z : headX >= 0.0 ? 1.0 : -1.0;
  vWalk = aPose.y >= 0.0 ? aPose.y : smoothstep(0.012, 0.04, speed);
  vLeg = aPose.y >= 0.0 ? sd * 9.0 + 1.2 : uTime * 5.5 * (0.8 + 0.4 * fract(sd * 11.0)) + sd * 9.0;
  vGraze = aPose.x >= 0.0 ? aPose.x : (1.0 - vWalk) * smoothstep(-0.2, 0.4, sin(uTime * 0.21 + sd * 13.0));
  vTurn = aPose.w;
  // the sun as the sheet has it: along the animal (toward its head), up, and
  // toward the eye. Only its bearing is the week's: underfoot it always
  // stands well up in the sky, as it does for the ancients
  vec3 camF = toCam - up * dot(toCam, up);
  vec3 sunF = uSun - up * dot(uSun, up);
  sunF = length(sunF) > 1e-4 ? normalize(sunF) : -normalize(camF + 1e-4);
  vSun = vec3(dot(sunF, side) * vFace * 0.8, 0.6, dot(sunF, normalize(camF + 1e-4)) * 0.8);
  vQ = qq;
  vForm = aForm;
  vDist = length(toCam);
  // brought toward the eye along its own line of sight (the house's ground-wash
  // trick), so the shadow pooled under the hooves lies on the ground in front
  // of them, not behind it
  vec3 toC = cameraPosition - corner;
  corner += toC / max(length(toC), 1e-4) * min(1.6, 0.5 + 0.02 * vDist);
  gl_Position = projectionMatrix * viewMatrix * vec4(corner, 1.0);
  if (aForm.z >= uAmount || uFoot <= 0.001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uCoat0, uCoat1, uCoat2;   // antelope, ibex, bison: each coat in a flat light
uniform vec3 uLit, uCool, uInk, uPool, uFar;  // uCool: the shade's hue at full strength
uniform vec4 uGenes;                   // neck, legs, bulk, horn
uniform float uFoot, uFogBase;
varying vec2 vQ;
varying vec3 vSun;
varying float vFace, vLeg, vWalk, vGraze, vDist, vTurn;
varying vec4 vForm;
${NOISE}
float smin(float a, float b, float k){ float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
vec2 rot(vec2 v, float a){ float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
// a leg from the hip down: a knee forward on a foreleg, a hock back on a hind
// one, swinging with the stride, thick at the top and fine at the hoof
float leg(vec2 q, vec2 hip, float swing, float bend, float w0, float w1){
  float len = hip.y;
  vec2 knee = hip + vec2(sin(swing) * len * 0.5 + bend, -len * 0.5);
  vec2 hoof = vec2(knee.x + sin(swing * 0.6) * len * 0.5 - bend * 0.5, 0.0);
  return min(inkSeg(q, hip, knee, w0, w1 * 1.35), inkSeg(q, knee, hoof, w1 * 1.35, w1));
}
// the build, set once in main: the species' and the lineage's
float an, ib, bi, gb, legL;
vec2 cC, cR, hC, hR, sh, hd, nose;
vec4 nW;                               // the neck's width at the shoulder and the poll, the head's at the poll and the nose
// the trunk: a chest and a haunch joined through the belly, a bison's hump
// over its shoulders, the neck and the head: the one mass the light models
float trunkD(vec2 q){
  float body = smin(inkEll(q, cC, cR), inkEll(q, hC, hR), 0.14);
  body = smin(body, inkEll(q, vec2((cC.x + hC.x) * 0.5, legL + 0.15 * gb), vec2(0.42, 0.12 * gb)), 0.08);
  if (bi > 0.5) body = smin(body, inkEll(q, cC + vec2(0.06, 0.34 * gb), vec2(0.27, 0.16 * gb)), 0.12);
  return smin(smin(body, inkSeg(q, sh, hd, nW.x, nW.y), 0.06), inkSeg(q, hd, nose, nW.z, nW.w), 0.03);
}
void main(){
  float sp = vForm.x;
  ib = step(0.5, sp) * step(sp, 1.5); bi = step(1.5, sp); an = 1.0 - ib - bi;
  // (an animal half turned to the eye is foreshortened along its length)
  vec2 q = vec2(vQ.x * vFace / vTurn, vQ.y);
  // proportions: the species', and the lineage's own drift in them
  float gl = 0.9 + 0.2 * uGenes.y, gn = 0.85 + 0.3 * uGenes.x, gh = 0.75 + 0.5 * uGenes.w;
  gb = 0.9 + 0.2 * uGenes.z;
  legL = (0.6 * an + 0.46 * ib + 0.47 * bi) * gl;
  cC = vec2(0.26 + 0.04 * bi, legL + (0.2 * an + 0.24 * ib + 0.38 * bi) * gb);
  cR = vec2(0.27 * an + 0.3 * ib + 0.44 * bi, (0.2 * an + 0.23 * ib + 0.42 * bi) * gb);
  hC = vec2(-0.3 * an - 0.28 * ib - 0.42 * bi, legL + (0.2 * an + 0.23 * ib + 0.27 * bi) * gb);
  hR = vec2(0.27 * an + 0.27 * ib + 0.3 * bi, (0.19 * an + 0.21 * ib + 0.26 * bi) * gb);
  // the neck off the top of the chest, and the head: alert, or down in the grass
  sh = cC + vec2(cR.x * (0.5 + 0.25 * bi), cR.y * (0.55 - 0.5 * bi));
  float nl = (0.4 * an + 0.3 * ib + 0.16 * bi) * gn;
  float na = mix(1.05 * an + 0.85 * ib - 0.3 * bi, -1.15 - 0.15 * bi, vGraze);
  hd = sh + vec2(cos(na), sin(na)) * nl;
  float ha = mix(-0.45 * (an + ib) - 1.05 * bi, -1.7, vGraze);
  vec2 hv = vec2(cos(ha), sin(ha));
  nose = hd + hv * (0.21 * an + 0.2 * ib + 0.27 * bi);
  nW = vec4(0.09 * an + 0.11 * ib + 0.24 * bi, 0.055 * an + 0.075 * ib + 0.17 * bi, 0.065 * an + 0.075 * ib + 0.2 * bi, 0.032 * an + 0.045 * ib + 0.13 * bi);
  float trunk = trunkD(q);
  // horns ride the head: lyres, a scimitar sweep, or two short hooks
  float turn = ha + 0.45 * (an + ib) + 1.05 * bi;
  vec2 hb = hd + rot(vec2(-0.03, 0.05), turn);
  vec2 a1 = hb + rot(vec2(-0.06, 0.16) * gh, turn), a2 = hb + rot(vec2(-0.12, 0.33) * gh, turn), a3 = hb + rot(vec2(-0.07, 0.42) * gh, turn);
  float lyre = min(min(inkSeg(q, hb, a1, 0.026, 0.02), inkSeg(q, a1, a2, 0.02, 0.012)), inkSeg(q, a2, a3, 0.012, 0.004));
  vec2 s1 = hb + rot(vec2(-0.06, 0.2) * gh, turn), s2 = hb + rot(vec2(-0.26, 0.34) * gh, turn), s3 = hb + rot(vec2(-0.5, 0.26) * gh, turn);
  float scim = min(min(inkSeg(q, hb, s1, 0.055, 0.042), inkSeg(q, s1, s2, 0.042, 0.026)), inkSeg(q, s2, s3, 0.026, 0.008));
  vec2 k1 = hb + rot(vec2(0.07, 0.06), turn), k2 = hb + rot(vec2(0.05, 0.15) * gh, turn);
  float hook = min(inkSeg(q, hb, k1, 0.04, 0.03), inkSeg(q, k1, k2, 0.03, 0.008));
  float horn = an > 0.5 ? lyre : ib > 0.5 ? scim : hook;
  float ear = inkSeg(q, hd + rot(vec2(-0.04, 0.02), turn), hd + rot(vec2(-0.15, 0.06 - 0.04 * vGraze), turn), 0.03, 0.008);
  // a beard: the ibex's tuft, the bison's shag under its chin and throat
  float beard = mix(inkSeg(q, nose - hv * 0.06, nose - hv * 0.08 + vec2(0.0, -0.1), 0.025, 0.006),
                    inkSeg(q, hd + vec2(0.04, -0.1), nose + vec2(-0.06, -0.12), 0.11, 0.04), bi);
  beard = mix(1e3, beard, ib + bi);
  float tail = inkSeg(q, hC + vec2(-hR.x * 0.92, hR.y * 0.45), hC + vec2(-hR.x * 1.12, hR.y * (0.05 - 0.6 * bi)), 0.035, 0.014);
  // the legs: near pair in front of the far pair, diagonals swinging together,
  // drawn stout enough to stand on at the distance it is met
  float sw = 0.36 * vWalk;
  float w0 = 0.075 * an + 0.085 * ib + 0.11 * bi, w1 = 0.03 * an + 0.036 * ib + 0.05 * bi;
  float ft = cC.x + cR.x * 0.2, bk = hC.x - hR.x * 0.1;
  float yN = legL + 0.08, yF = legL + 0.1;
  float near = min(leg(q, vec2(ft, yN), sin(vLeg) * sw, 0.025, w0, w1), leg(q, vec2(bk, yN), sin(vLeg + 3.1416) * sw, -0.07, w0 * 1.2, w1));
  float far = min(leg(q, vec2(ft - 0.1, yF), sin(vLeg + 3.1416) * sw, 0.025, w0 * 0.9, w1 * 0.9), leg(q, vec2(bk + 0.1, yF), sin(vLeg) * sw, -0.07, w0 * 1.05, w1 * 0.9));
  float d = min(min(trunk, min(near, far)), min(min(horn, ear), min(beard, tail)));
  float fw = max(fwidth(d), 1e-4);
  float a = 1.0 - inkPixel(d, fw);
  // only the hooves' last hair is lost in the grass: the legs stand on it
  a *= smoothstep(-0.01, 0.035, q.y + (inkN2(vec2(q.x * 14.0, vForm.w * 9.0)) - 0.5) * 0.03);

  // ---- the light, painted in bands on the trunk as one rounded mass: how
  // far toward its back or its belly a point is (1 on the back's edge, 0 down
  // its middle, -1 on the belly's), read off the shape itself. A band of warm
  // light along the shoulder, the back and the top of the neck wherever the
  // sun is up — against the light a rim, broadened by a half-lit band under
  // it; the belly in a cool shade; the flank the coat's own, or against the
  // light a half-shade between the two, never the belly's: under any light
  // the body keeps its values
  float e = 0.012;
  vec2 gr = vec2(trunkD(q + vec2(e, 0.0)), trunkD(q + vec2(0.0, e))) - trunk;
  vec2 n2 = gr / max(length(gr), 1e-6);
  float cyl = n2.y * (1.0 - clamp(-trunk / (0.2 + 0.14 * bi), 0.0, 1.0));
  float wob = (inkN2(q * 6.0 + vForm.w * 13.0) - 0.5) * 0.2;
  float against = 1.0 - smoothstep(-0.35, 0.15, vSun.z);
  float topB = cyl - mix(0.48, 0.68, against) + wob, botB = -cyl - 0.22 + wob;
  float fl = max(fwidth(cyl), 1e-3);
  vec3 coat = mix(mix(uCoat0, uCoat1, ib), uCoat2, bi) * (0.94 + 0.12 * vForm.w);
  vec3 lit = mix(coat, uLit, 0.2) * 1.25;
  vec3 shade = coat * uCool * 0.62;
  vec3 flank = mix(coat, shade, 0.4 * (1.0 - smoothstep(-0.3, -0.05, vSun.z)));
  vec3 m = mix(flank, shade, inkPixel(botB, fl));
  float sunUp = smoothstep(-0.1, 0.15, vSun.y);
  m = mix(m, mix(flank, lit, 0.4), inkPixel(topB + 0.2, fl) * against * sunUp);
  m = mix(m, lit, inkPixel(topB, fl) * sunUp);
  // the legs: the near pair in the belly's shade, the far pair, the horns and
  // the beard deeper still
  float onT = 1.0 - inkPixel(trunk, fw);
  float nearL = (1.0 - inkPixel(near, fw)) * (1.0 - onT);
  float farL = (1.0 - inkPixel(far, fw)) * (1.0 - onT) * step(0.0, near);
  m = mix(m, mix(shade, coat, 0.55), nearL);
  m = mix(m, mix(shade, uInk, 0.2), max(max(farL, 1.0 - inkPixel(min(horn, beard), fw)), (1.0 - inkPixel(tail, fw)) * (1.0 - onT)));
  // where the sun comes over the back, a warm edge broken where the brush
  // lifted; along the shaded underside the pigment dried darker
  float edgeIn = (1.0 - inkPixel(-trunk - 0.035, fw)) * onT;
  m = mix(m, mix(lit, uLit, 0.4), edgeIn * smoothstep(0.2, 0.6, n2.y) * step(0.35, inkN2(q * 9.0 + vForm.w * 31.0)) * 0.6 * smoothstep(-0.1, 0.15, vSun.y));
  m = mix(m, mix(shade, uInk, 0.35), edgeIn * smoothstep(0.1, 0.5, -n2.y) * 0.6);
  // its shadow on the ground: a pool laid a little away from the light, the
  // hooves standing in the darkest of it
  vec2 mid = vec2((cC.x + hC.x) * 0.5, 0.0);
  float pd = length((q - mid + vec2(vSun.x * 0.25, 0.0)) / vec2(0.7 + 0.16 * bi, 0.07)) - 1.0 + (inkN2(q * vec2(6.0, 30.0) + vForm.w * 5.0) - 0.5) * 0.3;
  float cd = length((q - mid) / vec2(0.48 + 0.12 * bi, 0.032)) - 1.0;
  float pool = (1.0 - inkPixel(pd, max(fwidth(pd), 1e-4))) * (0.32 + 0.24 * (1.0 - inkPixel(cd, max(fwidth(cd), 1e-4)))) * (1.0 - a);
  // ---- the air between, as the ancients have it; and one that comes right up
  // to the eye let go before it is near enough to be seen as a sheet (one
  // beside the runner, a chase camera's length off, is drawn whole)
  float span = mix(130.0, 330.0, step(100.0, uFogBase));
  float air = smoothstep(uFogBase, uFogBase + span, vDist) * 0.9;
  float lv = dot(m, vec3(0.32, 0.55, 0.13));
  vec3 col = mix(m, uFar * (0.8 + 0.32 * smoothstep(0.16, 0.94, lv)), air);
  float alpha = max(a, pool * (1.0 - air));
  col = mix(uPool, col, a / max(alpha, 1e-4));
  alpha *= uFoot * smoothstep(5.0, 8.0, vDist);
  if (alpha < 0.02) discard;
  gl_FragColor = vec4(col, alpha);
}
`;

// How far apart the animals keep (each its share, × its size), how near they let
// the runner come (past his own reach), how far anything may move one off its
// own place, and how near the eye one has to be for its feet to be set on the
// ground exactly rather than on the slope at its place.
const SPACE = 0.6;
const SHY = 2.2;
const ROOM = 4.5;
const EXACT = 60;
// what each built thing's object reaches out to from its feature's centre
// (life-kit.js reads the real ones off the scene as the eye comes near; a herd
// is laid before anything is built, so it keeps this far off)
const REACH = { monument: 3.5, calm: 6.5, spires: 4, constructed: 4.6, wheel: 2.6, cairn: 2 };

/**
 * The herds. `week.herds` is life.js's reading: one entry per run with its
 * route (or site), its species and its count. Every animal grazes about a
 * place of its own, spaced from its neighbours, clear of what is built and on
 * ground it could stand on; each frame the CPU sets it down there: its wander
 * off the clock, kept apart from the others (the field's spatial hash), out of
 * whatever stands (life-kit.js solidsOf), backing off from the runner, and
 * never off its own room. All of it is read off the clock and where the
 * runner stands, so a pinned frame is the same frame. The herds are laid back
 * to front, so a near animal is always drawn over a far one.
 * Returns { object, update, dispose }.
 */
export function createHerds(T, { features, uniforms, R, palette: pal, week, amount, scene }) {
  const rng = features.makeRng('life/herds');
  const sea = features.seaLevel;
  const cap = Number(features.orbit?.reliefCap) || 12;
  const field = solidsOf(features, R);
  const routes = (features.routes || []).map((r) => {
    const n = Math.floor(r.seg.length / 3);
    const pts = [];
    for (let i = 0; i < n; i++) pts.push(new T.Vector3(r.seg[i * 3], r.seg[i * 3 + 1], r.seg[i * 3 + 2]).normalize());
    return pts;
  });
  const routeDist = (v) => {
    let d = Infinity;
    for (const pts of routes) for (const p of pts) d = Math.min(d, p.angleTo(v) * R);
    return d;
  };
  const clearOfRoutes = (v, units) => routeDist(v) > units;
  const clearOfSites = (v, scale = 1) => (features.list || []).every((f) => f.dir.angleTo(v) * R > (f.kind === 'monument' ? 16 : 8) * scale);
  // an animal's own place clear of what every built thing reaches out to, by `keep` more
  const clearOfBuilt = (v, keep) => (features.list || []).every((f) => f.dir.angleTo(v) * R > (REACH[f.kind] ?? 4) + keep);
  const inLagoon = (v, by) => (features.lagoons || []).some((b) => b.dir.angleTo(v) * R < b.radius + by);
  const groundAt = (v) => features.heightAt(v);
  const east = new T.Vector3(), north = new T.Vector3(), probe = new T.Vector3();
  // dry ground out of every lagoon's basin, no steeper than `steep`, never on
  // a pinnacle or a cliff's lip (the ground a body length round its feet falls
  // away no further than that slope would take it), and below the orbit's
  // relief cap unless `top` says otherwise (near the eye the ground is drawn whole)
  const grazable = (v, top = cap - 0.5, steep = 0.9) => {
    const h = groundAt(v);
    if (h < sea + 0.8 || h > top || inLagoon(v, 2.5)) return null;
    tangentFrame(T, v, east, north);
    const ge = (groundAt(probe.copy(v).addScaledVector(east, 0.6 / R).normalize()) - h) / 0.6;
    const gn = (groundAt(probe.copy(v).addScaledVector(north, 0.6 / R).normalize()) - h) / 0.6;
    if (Math.hypot(ge, gn) > steep) return null;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      const hk = groundAt(probe.copy(v).addScaledVector(east, (Math.cos(a) * 1.4) / R).addScaledVector(north, (Math.sin(a) * 1.4) / R).normalize());
      if (hk < sea + 0.5 || h - hk > steep * 1.4 + 0.4) return null;
    }
    return { h, ge, gn };
  };
  // how far it may be moved off its place (by its neighbours, or backing off
  // from the runner) and still stand on ground it could graze: out along
  // eight bearings a stride at a time, never as far as `most`
  const roomAt = (home, h0, steep, most) => {
    tangentFrame(T, home, east, north);
    let room = Math.min(ROOM, most);
    for (let k = 0; k < 8 && room > 0; k++) {
      const a = (k / 8) * TAU;
      for (let r = 1.5; r <= room; r += 1.5) {
        probe.copy(home).addScaledVector(east, (Math.cos(a) * r) / R).addScaledVector(north, (Math.sin(a) * r) / R).normalize();
        const h = groundAt(probe);
        if (h < sea + 0.8 || Math.abs(h - h0) > steep * r || inLagoon(probe, 1.5)) { room = r - 1.5; break; }
      }
    }
    return Math.max(0, room);
  };
  const animal = (herd, home, g, size, pose = CLOCK, room = 0) => ({
    home, g, species: herd.species, size, coat: rng(), seed: rng(), pose,
    // the wander is smaller on a slope, where every step is a climb, and never
    // past the room it has; a held pose stands where it is
    wander: pose === CLOCK ? Math.min((0.5 + rng() * 0.8) / (1 + 2 * Math.hypot(g.ge, g.gn)), room) : 0,
    room,
  });
  // none stands where another already does
  const spaced = (home, size, list) => list.every((a) => a.home.angleTo(home) * R > SPACE * (a.size + size) + 0.4);

  const animals = [];
  const herdsOut = [];
  const centres = [];
  // a herd about its centre, every animal on grazable ground of its own
  const graze = (herd, centre, count, routeGap) => {
    centres.push(centre);
    let n = 0;
    for (let k = 0; k < count * 6 && n < count; k++) {
      // (a herd short of room spreads out further, as a crowded one would)
      const r = 1.2 + Math.sqrt(rng()) * (2 + count * 0.3) * (1 + k / (count * 3));
      const home = centre.clone();
      tangentFrame(T, centre, east, north);
      const a = rng() * TAU;
      home.addScaledVector(east, Math.cos(a) * r / R).addScaledVector(north, Math.sin(a) * r / R).normalize();
      const size = herd.size * (0.85 + rng() * 0.3);
      const rd = routeDist(home);
      if (rd <= routeGap || !spaced(home, size, animals) || !clearOfBuilt(home, 1.5 + SPACE * size)) continue;
      const g = grazable(home);
      if (!g) continue;
      animals.push(animal(herd, home, g, size, CLOCK, roomAt(home, g.h, 0.9, rd - 1.5)));
      n++;
    }
    herdsOut.push({ species: herd.species, animals: n });
  };

  for (const herd of week.herds) {
    let placed = 0;
    // a place on the flank: along the run — most often its last stretch,
    // where a race finishes — off to one side, clear of every route
    const pts = herd.route.slice();
    for (let tries = 0; tries < 60 && placed < herd.count; tries++) {
      const i = Math.min(pts.length - 1, Math.floor((1 - rng() * rng()) * pts.length));
      const p = pts[i];
      const q = pts[Math.min(pts.length - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]);
      const across = new T.Vector3().crossVectors(p, q);
      if (across.lengthSq() < 1e-12) continue;
      across.normalize();
      const centre = p.clone().addScaledVector(across, ((rng() < 0.5 ? -1 : 1) * (8 + rng() * 10)) / R).normalize();
      if (!clearOfRoutes(centre, 6) || !clearOfSites(centre) || !grazable(centre)) continue;
      if (centres.some((c) => c.angleTo(centre) * R < 14)) continue;
      graze(herd, centre, herd.animals, 4);
      placed++;
    }
  }
  // the dial lets herds in whole, a share of the week's animals at a time; the
  // last LANDING slots are the herd met where the eye lands, laid when it does
  const first = week.herds[0];
  const slots = first ? LANDING : 0;
  const count = animals.length + slots;
  const attrs = {
    aHome: new Float32Array(count * 4),
    aGrad: new Float32Array(count * 4),
    aForm: new Float32Array(count * 4),
    aPose: new Float32Array(count * 4),
  };
  // each animal's own: its place (unit, its ground's radius, east, north), the
  // slope there, its wander (size, the clock's two rates and phases), its room,
  // its build and pose; and where it stands this frame, how far it was pushed
  // off its wander and how fast that push is going
  const used = new Uint8Array(count);
  const U = new Float32Array(count * 3), E = new Float32Array(count * 3), N = new Float32Array(count * 3);
  const HR = new Float32Array(count), GE = new Float32Array(count), GN = new Float32Array(count);
  const WND = new Float32Array(count), SEED = new Float32Array(count), ROOMS = new Float32Array(count);
  const F1 = new Float32Array(count), F2 = new Float32Array(count), P1 = new Float32Array(count), P2 = new Float32Array(count);
  const FORM = new Float32Array(count * 4), POSE = new Float32Array(count * 4);
  const FOOT = new Float32Array(count * 3), VX = new Float32Array(count), VY = new Float32Array(count);
  const QX = new Float32Array(count), QY = new Float32Array(count), PX = new Float32Array(count), PY = new Float32Array(count);
  const fract = (v) => v - Math.floor(v);
  const set = (i, m, rank) => {
    used[i] = 1;
    const i3 = i * 3;
    U[i3] = m.home.x; U[i3 + 1] = m.home.y; U[i3 + 2] = m.home.z;
    tangentFrame(T, m.home, east, north);
    E[i3] = east.x; E[i3 + 1] = east.y; E[i3 + 2] = east.z;
    N[i3] = north.x; N[i3 + 1] = north.y; N[i3 + 2] = north.z;
    HR[i] = R + m.g.h; GE[i] = m.g.ge; GN[i] = m.g.gn;
    WND[i] = m.wander; SEED[i] = m.seed; ROOMS[i] = m.room;
    // (the clock's own rates and phases, as the shader had them)
    F1[i] = 0.05 + 0.04 * fract(m.seed * 7.3); F2[i] = 0.045 + 0.04 * fract(m.seed * 3.7);
    P1[i] = m.seed * 40; P2[i] = m.seed * 17;
    FORM.set([m.species, m.size, rank, m.coat], i * 4);
    POSE.set(m.pose, i * 4);
    FOOT[i3] = m.home.x * HR[i]; FOOT[i3 + 1] = m.home.y * HR[i]; FOOT[i3 + 2] = m.home.z * HR[i];
    VX[i] = VY[i] = QX[i] = QY[i] = PX[i] = PY[i] = 0;
  };
  // (an empty slot is a rank no dial reaches)
  const empty = (i) => { used[i] = 0; FORM.set([0, 1, 2, 0], i * 4); POSE.set(CLOCK, i * 4); FOOT.set([0, R, 0], i * 3); };
  animals.forEach((m, i) => set(i, m, (i + 0.5) / Math.max(1, animals.length)));
  for (let i = animals.length; i < count; i++) empty(i);

  // ---- the herd where the eye lands: three of the week's kind come upon in
  // the middle distance, off to one side of the runner and of whatever stands
  // in the middle of the frame. Never a row: the near one grazing, one a few
  // strides behind it and over, walking the other way, and one farther back
  // still, head up and half turned to the eye, the brow of the ground over its
  // legs — each at its own depth and in its own pose
  const fr = { x: 0, y: 0, z: 0 }, s = new T.Vector3(), w = new T.Vector3(), dir = new T.Vector3();
  const seen = (eye, p) => {
    for (let k = 1; k < 20; k++) {
      s.copy(eye.pos).lerp(p, k / 20);
      dir.copy(s).normalize();
      if (s.length() < R + groundAt(dir) - 0.05) return false;
    }
    return true;
  };
  // clear of what the eye's own ground has built (read off the scene by now)
  const clearOfStanding = (v, keep) => {
    for (let i = 0; i < field.count; i++) {
      if (field.sr[i] <= 0) continue;
      const c = v.x * field.sx[i] + v.y * field.sy[i] + v.z * field.sz[i];
      if (Math.acos(Math.min(1, c)) * R < field.sr[i] + keep) return false;
    }
    return true;
  };
  const at = (eye, along, over) => eye.up.clone().addScaledVector(eye.fw, along / R).addScaledVector(eye.side, over / R).normalize();
  const meet = (eye) => {
    const herd = first;
    const steep = herd.species === 1 ? 1.3 : 1.0;
    const roam = animals.slice();
    field.read(T, scene, eye.pos);
    let best = null;
    for (let d = 26; d <= 56; d += 2) {
      for (let deg = -40; deg <= 40; deg += 4) {
        const b = (deg * Math.PI) / 180;
        const v = at(eye, Math.cos(b) * d, Math.sin(b) * d);
        const g = grazable(v, Infinity, steep);
        if (!g) continue;
        eye.frame(w.copy(v).multiplyScalar(R + g.h + 0.6), fr);
        if (fr.z < 22 || Math.abs(fr.x) < 0.25 || Math.abs(fr.x) > 0.8 || fr.y > 0.05 || fr.y < -0.7) continue;
        const score = -Math.abs(d - 30) / 20 - Math.abs(Math.abs(fr.x) - 0.5) - Math.abs(fr.y + 0.2) * 0.6;
        if (best && score <= best.score) continue;
        if (!clearOfRoutes(v, 3) || !clearOfSites(v, 0.7)) continue;
        if (!seen(eye, w.copy(v).multiplyScalar(R + g.h + 0.3))) continue;
        best = { score, b, d, out: fr.x > 0 ? 1 : -1 };
      }
    }
    const taken = [];
    let n = 0;
    for (let i = animals.length; i < count; i++) empty(i);
    if (best) {
      const { b, d, out } = best;
      const cb = Math.cos(b), sb = Math.sin(b);
      // each: its pose (head down 1 … up 0, stride, facing, turn), how far
      // behind the first along the line of sight it may stand, and where it
      // would rather: how far behind, how far over (toward the middle of the
      // frame is -out)
      const plan = [
        { pose: [1, 0, out, 0.92], back: [0, 0], want: [0, 0] },
        { pose: [0.5, 0.7, -out, 0.88], back: [3, 9], want: [5, -out * 1.5] },
        { pose: [0, 0, out, 0.75], back: [8, 20], want: [13, out * 2] },
      ];
      for (const [k, p] of plan.entries()) {
        let pick = null;
        const size = herd.size * (0.9 + rng() * 0.2);
        for (let back = p.back[0]; back <= p.back[1]; back += 1.5) {
          for (let over = k ? -4 : 0; over <= (k ? 4 : 0); over += 0.8) {
            const want = -Math.abs(back - p.want[0]) / 4 - Math.abs(over - p.want[1]) / 3;
            if (pick && want + 0.8 <= pick.score) continue;
            const home = at(eye, cb * (d + back) - sb * over, sb * (d + back) + cb * over);
            const g = grazable(home, Infinity, steep);
            if (!g) continue;
            eye.frame(w.copy(home).multiplyScalar(R + g.h + 0.6), fr);
            const span = (1.4 * herd.size) / (fr.z * eye.tanH * eye.aspect);
            // one over another is how a herd stands, but none hidden behind another
            if (fr.z < 22 || taken.some((t) => Math.abs(t.x - fr.x) < span * 0.3 && Math.abs(t.y - fr.y) < span * 0.25)) continue;
            // the near two seen to the hoof; the far one at least to its back,
            // and best with the brow of the ground over its legs
            const foot = seen(eye, w.copy(home).multiplyScalar(R + g.h + 0.2));
            if (!foot && (k < 2 || !seen(eye, w.copy(home).multiplyScalar(R + g.h + 0.9 * herd.size)))) continue;
            const score = want + (k === 2 && !foot ? 0.8 : 0);
            if ((pick && score <= pick.score) || !clearOfRoutes(home, 2)) continue;
            // never in another's place, nor in anything built
            if (!spaced(home, size, roam) || !clearOfStanding(home, 1 + SPACE * size)) continue;
            pick = { score, home, g, x: fr.x, y: fr.y };
          }
        }
        if (!pick) continue;
        taken.push({ x: pick.x, y: pick.y });
        const m = animal(herd, pick.home, pick.g, size, p.pose, roomAt(pick.home, pick.g.h, steep, Infinity));
        roam.push(m);
        set(animals.length + LANDING - 1 - k, m, ((k + 0.5) / LANDING) * 0.999);
        n++;
      }
    }
    listed = -1;
    sorted = false;
    met = { species: herd.species, animals: n };
  };

  // ---- each frame: where every animal stands
  const order = new Int32Array(count).map((_, i) => i);
  const key = new Float32Array(count);
  const mid = new Int32Array(count);          // the field's moving index → the animal
  const push = new Float32Array(count * 3);   // the keeping apart, summed over a pass
  const cand = new Int32Array(96);
  let near0 = new Int32Array(count + 1), nearAt = new Int32Array(0), listed = -1, sorted = false;
  let runner = null, lastTime = null;
  // the standing discs each animal could be moved into, listed again whenever one is laid
  const relist = () => {
    const list = [];
    for (let i = 0; i < count; i++) {
      near0[i] = list.length;
      if (!used[i]) continue;
      const i3 = i * 3;
      for (let k = 0; k < field.count; k++) {
        if (field.sr[k] <= 0) continue;
        const c = U[i3] * field.sx[k] + U[i3 + 1] * field.sy[k] + U[i3 + 2] * field.sz[k];
        if (Math.acos(Math.min(1, c)) * R < ROOMS[i] + WND[i] + field.sr[k] + 2) list.push(k);
      }
    }
    near0[count] = list.length;
    nearAt = Int32Array.from(list);
    listed = field.version;
  };
  // out of a disc of `reach` units round the unit direction (x, y, z): along the
  // ground, the world point at k kept at its own height over the centre
  const outOf = (k, x, y, z, reach) => {
    const px = field.mx[k], py = field.my[k], pz = field.mz[k];
    const l = Math.hypot(px, py, pz);
    const c = (px * x + py * y + pz * z) / l;
    if (c < Math.cos(reach / R)) return;
    let ax = px / l - x * c, ay = py / l - y * c, az = pz / l - z * c;
    const al = Math.hypot(ax, ay, az);
    if (al < 1e-9) return;
    const cw = Math.cos(reach / R) * l, sw = (Math.sin(reach / R) * l) / al;
    field.mx[k] = x * cw + ax * sw; field.my[k] = y * cw + ay * sw; field.mz[k] = z * cw + az * sw;
  };
  const solve = (time, camera) => {
    const amt = amount.value;
    const dt = lastTime == null ? 0 : time - lastTime;
    lastTime = time;
    if (!runner && scene) runner = scene.children.find((o) => o.name === 'runner') || null;
    field.read(T, scene, runner ? runner.position : camera.position);
    if (listed !== field.version) relist();
    field.moving(count);
    // its wander off the clock, about its own place
    let m = 0;
    for (let i = 0; i < count; i++) {
      if (!used[i] || !(FORM[i * 4 + 2] < amt)) continue;
      const i3 = i * 3, wd = WND[i];
      const ox = Math.sin(time * F1[i] + P1[i]) * wd, oy = Math.sin(time * F2[i] + P2[i]) * 0.8 * wd;
      PX[i] = ox; PY[i] = oy;
      field.mx[m] = U[i3] * HR[i] + E[i3] * ox + N[i3] * oy;
      field.my[m] = U[i3 + 1] * HR[i] + E[i3 + 1] * ox + N[i3 + 1] * oy;
      field.mz[m] = U[i3 + 2] * HR[i] + E[i3 + 2] * ox + N[i3 + 2] * oy;
      field.mr[m] = SPACE * FORM[i * 4 + 1];
      mid[m++] = i;
    }
    field.index(m);
    // kept apart: two passes, each moving every pair that stands too close
    // half of the way out, all of them together
    for (let pass = 0; pass < 2; pass++) {
      push.fill(0, 0, m * 3);
      for (let a = 0; a < m; a++) {
        const ax = field.mx[a], ay = field.my[a], az = field.mz[a];
        const u3 = mid[a] * 3;
        const got = field.around(ax, ay, az, cand);
        for (let c = 0; c < got; c++) {
          const b = cand[c];
          if (b <= a) continue;
          let dx = ax - field.mx[b], dy = ay - field.my[b], dz = az - field.mz[b];
          // (along the ground: a slope's rise between them is not room)
          const up = dx * U[u3] + dy * U[u3 + 1] + dz * U[u3 + 2];
          dx -= U[u3] * up; dy -= U[u3 + 1] * up; dz -= U[u3 + 2] * up;
          const need = field.mr[a] + field.mr[b];
          let d = Math.hypot(dx, dy, dz);
          if (d >= need) continue;
          if (d < 1e-4) { dx = E[u3]; dy = E[u3 + 1]; dz = E[u3 + 2]; d = 1e-4; }
          const f = (0.5 * (need - d)) / Math.max(d, 1e-4);
          push[a * 3] += dx * f; push[a * 3 + 1] += dy * f; push[a * 3 + 2] += dz * f;
          push[b * 3] -= dx * f; push[b * 3 + 1] -= dy * f; push[b * 3 + 2] -= dz * f;
        }
      }
      for (let a = 0; a < m; a++) {
        field.mx[a] += push[a * 3]; field.my[a] += push[a * 3 + 1]; field.mz[a] += push[a * 3 + 2];
      }
    }
    // out of whatever stands, back from the runner, never off its own room;
    // then set down on its ground
    const rp = runner && runner.visible !== false ? runner.position : null;
    const rl = rp ? rp.length() : 1;
    const ease = dt > 0 && dt < 0.25 ? 1 - Math.exp(-6 * dt) : 0;
    for (let a = 0; a < m; a++) {
      const i = mid[a], i3 = i * 3, size = FORM[i * 4 + 1];
      for (let q = near0[i]; q < near0[i + 1]; q++) {
        const k = nearAt[q];
        outOf(a, field.sx[k], field.sy[k], field.sz[k], field.sr[k] + 0.55 * size);
      }
      if (rp) outOf(a, rp.x / rl, rp.y / rl, rp.z / rl, SHY + SPACE * size);
      const dx = field.mx[a] - U[i3] * HR[i], dy = field.my[a] - U[i3 + 1] * HR[i], dz = field.mz[a] - U[i3 + 2] * HR[i];
      let ox = dx * E[i3] + dy * E[i3 + 1] + dz * E[i3 + 2], oy = dx * N[i3] + dy * N[i3 + 1] + dz * N[i3 + 2];
      const l = Math.hypot(ox, oy), room = Math.max(ROOMS[i], WND[i]);
      if (l > room) { ox *= room / l; oy *= room / l; }
      // how far it was pushed off its wander, and how fast: what it faces and walks by
      const qx = ox - PX[i], qy = oy - PY[i];
      if (ease > 0) {
        VX[i] += ((qx - QX[i]) / dt - VX[i]) * ease;
        VY[i] += ((qy - QY[i]) / dt - VY[i]) * ease;
      }
      QX[i] = qx; QY[i] = qy;
      let fx = U[i3] * HR[i] + E[i3] * ox + N[i3] * oy;
      let fy = U[i3 + 1] * HR[i] + E[i3 + 1] * ox + N[i3 + 1] * oy;
      let fz = U[i3 + 2] * HR[i] + E[i3 + 2] * ox + N[i3 + 2] * oy;
      // on the slope at its place, as it always stood; once pushed off it and
      // near enough to be read, on the ground itself
      let h = HR[i] - R + GE[i] * ox + GN[i] * oy;
      const exact = sstep(0.05, 0.4, Math.hypot(qx, qy)) * (1 - sstep(EXACT - 10, EXACT, camera.position.distanceTo(probe.set(fx, fy, fz))));
      if (exact > 0) h += (groundAt(probe.normalize()) - h) * exact;
      const fl = Math.hypot(fx, fy, fz);
      fx *= (R + h) / fl; fy *= (R + h) / fl; fz *= (R + h) / fl;
      FOOT[i3] = fx; FOOT[i3 + 1] = fy; FOOT[i3 + 2] = fz;
      field.mx[a] = fx; field.my[a] = fy; field.mz[a] = fz;
    }
    // laid back to front: the far first, so a near animal is drawn over it
    const c = camera.position;
    for (let i = 0; i < count; i++) key[i] = (FOOT[i * 3] - c.x) ** 2 + (FOOT[i * 3 + 1] - c.y) ** 2 + (FOOT[i * 3 + 2] - c.z) ** 2;
    for (let a = 1; a < count; a++) {
      const i = order[a], k = key[i];
      let b = a - 1;
      while (b >= 0 && key[order[b]] < k) { order[b + 1] = order[b]; b--; sorted = false; }
      order[b + 1] = i;
    }
    for (let slot = 0; slot < count; slot++) {
      const i = order[slot], i3 = i * 3, o = slot * 4;
      attrs.aHome[o] = FOOT[i3]; attrs.aHome[o + 1] = FOOT[i3 + 1]; attrs.aHome[o + 2] = FOOT[i3 + 2];
      attrs.aHome[o + 3] = Math.cos(time * F1[i] + P1[i]) * F1[i] * WND[i] + VX[i];
      attrs.aGrad[o] = GE[i]; attrs.aGrad[o + 1] = GN[i];
      attrs.aGrad[o + 2] = Math.cos(time * F2[i] + P2[i]) * F2[i] * 0.8 * WND[i] + VY[i];
      attrs.aGrad[o + 3] = SEED[i];
      if (!sorted) {
        for (let q = 0; q < 4; q++) { attrs.aForm[o + q] = FORM[i * 4 + q]; attrs.aPose[o + q] = POSE[i * 4 + q]; }
      }
    }
    geometry.attributes.aHome.needsUpdate = true;
    geometry.attributes.aGrad.needsUpdate = true;
    if (!sorted) {
      geometry.attributes.aForm.needsUpdate = true;
      geometry.attributes.aPose.needsUpdate = true;
      sorted = true;
    }
  };

  const MIX = (a, b, t) => a.clone().lerp(b, t);
  const g = week.lineage.genes;
  // each kind's coat in a flat light, and the warm light and the cool shade
  // every coat takes, as the ancients have them
  const u = {
    uTime: uniforms.uTime,
    uFoot: { value: 0 },
    uAmount: amount,
    uSun: uniforms.uSunDir,
    uFogBase: { value: 11 },
    uCoat0: { value: MIX(MIX(pal.litWarm, pal.sepia, 0.55), pal.vermilion, 0.1) },
    uCoat1: { value: MIX(MIX(pal.stone, pal.sepia, 0.6), pal.ink, 0.2) },
    uCoat2: { value: MIX(MIX(pal.sepia, pal.ink, 0.4), pal.wood || pal.sepia, 0.2) },
    uLit: { value: MIX(pal.litWarm, pal.paper, 0.15) },
    uCool: { value: pal.shadeCool.clone().multiplyScalar(1 / Math.max(pal.shadeCool.r, pal.shadeCool.g, pal.shadeCool.b, 0.05)) },
    uInk: { value: pal.ink.clone() },
    uPool: { value: MIX(pal.shadeCool, pal.ink, 0.45) },
    uFar: { value: MIX(pal.farGlaze, pal.skyWash, 0.5) },
    uGenes: { value: new T.Vector4(g.neck, g.legs, g.bulk, g.horn) },
  };
  const material = new T.ShaderMaterial({
    uniforms: u,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    // the wash pass reads the ground's alpha as its handoff: keep it
    blending: T.CustomBlending,
    blendEquation: T.AddEquation,
    blendSrc: T.SrcAlphaFactor,
    blendDst: T.OneMinusSrcAlphaFactor,
    blendSrcAlpha: T.ZeroFactor,
    blendDstAlpha: T.OneFactor,
  });
  const geometry = instancedQuad(T, count, attrs);
  for (const a of Object.values(geometry.attributes)) if (a.isInstancedBufferAttribute) a.setUsage(T.DynamicDrawUsage);
  const mesh = new T.Mesh(geometry, material);
  mesh.name = 'life-herds';
  mesh.frustumCulled = false;
  mesh.visible = false;
  let met = null;
  let placed = -1;
  mesh.userData.species = herdsOut;
  return {
    object: mesh,
    update({ foot, eye, camera, time }) {
      if (slots && eye.landed && eye.serial !== placed) {
        placed = eye.serial;
        meet(eye);
        mesh.userData.landing = met;
      }
      u.uFoot.value = foot;
      mesh.visible = foot > 0.002 && count > 0;
      if (mesh.visible && camera) solve(num(time, 0), camera);
      // (in orbit no animal is in the runner's way)
      else if (field.moved) field.index(0);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

/* Planet Creator — the week's life: the reefs (life.js).
 *
 * Strength builds reef. Every lift the week carried lays down coral on the
 * shallow shelf, the more minutes the more of the coast it fringes, and
 * thickest off the shores nearest where the lifting was done. A reef is what
 * it is from the air: a crest of coral a few units off the beach with the
 * surf breaking on its seaward edge, a lagoon of pale turquoise sand inside it
 * and the deep falling away beyond; out in open water, wherever the floor
 * comes up near the light, an atoll's ring round its own lagoon, sand cays on
 * it. All of it subtle — a fringe on the coast, not a border drawn round it.
 * Its colour is the water's warmth: a warm sea's coral is rose and ochre, a
 * cold one's pale and stony.
 *
 * Underfoot, wherever the runner looks into shallow water, the reef is under
 * the surface: heads of coral in a few colours on turquoise sand, wavering
 * with the water over them, there when looking down into it and gone at a
 * slant, where the water only gives back the sky.
 *
 * One skin on the sea, a hair under the bloom's; it moves with the clock alone. */
import { NOISE, clamp, num } from './life-kit.js';

const SITES = 6;

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
uniform vec3 uLight;
uniform float uTime, uOrbit, uFoot, uAmount, uTerm, uFogBase;
uniform vec3 uLagoon, uCoral, uCoralB, uCoralC, uSurf, uDrop, uFar;
uniform float uCrest, uAtoll, uThr;
uniform vec3 uOff;
uniform int uSiteN;
uniform vec3 uSite[${SITES}];
varying vec3 vW;
${NOISE}
// a coral head: the nearest on a jittered lattice; its distance (cells) and
// which head it is
vec2 heads(vec3 p){
  vec3 ip = floor(p);
  float F1 = 9.0, id = 0.0;
  for (int k = 0; k < 27; k++) {
    vec3 g = vec3(float(k - (k / 3) * 3), float((k / 3) - (k / 9) * 3), float(k / 9)) - 1.0;
    vec3 c = ip + g;
    vec3 j = vec3(inkH13(c), inkH13(c + 7.7), inkH13(c + 19.3));
    float r = length(p - c - 0.2 - 0.6 * j) / (0.7 + 0.5 * j.z);
    if (r < F1) { F1 = r; id = j.x; }
  }
  return vec2(F1, id);
}
void main(){
  vec3 d = normalize(vW);
  vec2 uv = inkUV(d);
  float landH = texture2D(tLand, uv).r;
  if (landH > 0.05) discard;
  float coast = texture2D(tCoast, uv).r;
  vec3 V = normalize(cameraPosition - vW);
  float dist = distance(cameraPosition, vW);
  float fp = max(1e-4, length(fwidth(vW)));        // the world size of a pixel here
  float face = abs(dot(d, V));
  // ---- where the reef grows: a share of the coast the dial and the lifts
  // say, thickest near the week's lifting
  float near = 0.0;
  for (int i = 0; i < ${SITES}; i++) {
    if (i >= uSiteN) break;
    near = max(near, 1.0 - smoothstep(0.15, 0.6, acos(clamp(dot(d, uSite[i]), -1.0, 1.0))));
  }
  float grow = inkF3(d * 4.2 + uOff) * 0.75 + inkN3(d * 13.0 + uOff) * 0.25 + 0.3 * near;
  float thr = uThr + (1.0 - uAmount) * 0.6;
  float present = smoothstep(thr - 0.02, thr + 0.05, grow);
  if (present <= 0.0) discard;
  // ---- the fringe: a crest a few units off the beach, wandering along it,
  // the lagoon inside it and the drop beyond. Everything is measured in units
  // off the shore, so a crest is the same width wherever the shelf is steep
  float cw = coast + (inkF3(d * 26.0 + uOff * 1.3) - 0.5) * 3.2 + (inkN3(d * 70.0 + uOff) - 0.5) * 0.6;
  float wC = 0.3 + 0.4 * inkF3(d * 12.0 + uOff * 0.3);          // the crest's half-width
  float off = cw - uCrest;                                          // units seaward of the crest
  float open = smoothstep(12.0, 18.0, coast);
  // ---- the atolls: out in open water, a ring where the floor comes up near
  // the light, measured in units off its own contour
  float depth = -landH;
  float gd = max(fwidth(depth) / fp, 0.004);                       // the floor's fall a unit
  float offA = (depth - uAtoll) / gd + (inkF3(d * 30.0 + uOff) - 0.5) * 2.5;
  off = mix(off, offA, open);
  float crestF = 1.0 - smoothstep(wC - 0.15, wC + 0.15, abs(off));
  // the shallows are not the crest's tracing: their own broad, uneven reach
  // off the shore, wider here and narrower there (an atoll's, inside its ring),
  // and along the coast they come and go, so no long shore is outlined
  float lagOff = mix(cw - uCrest * (0.6 + 0.9 * inkF3(d * 7.0 + uOff * 0.5)), off + wC, open);
  float lagoonF = (1.0 - smoothstep(-0.6, 0.0, lagOff)) * mix(smoothstep(0.2, 1.4, coast), 1.0 - smoothstep(3.5, 6.0, -off), open)
                * mix(smoothstep(0.36, 0.56, inkF3(d * 11.0 + uOff * 0.4)), 1.0, open);
  float dropF = smoothstep(wC, wC + 0.6, off) * (1.0 - smoothstep(wC + 1.0, wC + 3.0, off));
  // the crest is not a wall: only short reaches of it break the water, a few
  // units each, cut by grooves and passes, and the shallows carry the rest
  float reach = smoothstep(0.55, 0.59, inkF3(d * 22.0 + uOff * 0.7));
  float pass = reach * step(0.35, inkN3(d * 55.0 + uOff * 2.0));
  crestF *= pass;
  // ---- the paint from the air: the lagoon a thin turquoise over the sand,
  // uneven in its depth, pale shoals in it; the crest's reaches coral, broken
  // surf on their seaward lip, a cay on an atoll's ring, the deep a little deeper
  float aw = max(fwidth(crestF), 1e-3);
  float crest = smoothstep(0.5 - aw, 0.5 + aw, crestF);
  float surf = crest * step(wC * 0.35, off) * step(0.42, inkN3(d * 44.0 + vec3(uTime * 0.01, 0.0, 0.0) + uOff));
  float cay = crest * open * step(0.68, inkF3(d * 22.0 + uOff * 0.5));
  float shoal = lagoonF * step(0.57, inkF3(d * 15.0 + uOff * 1.7));
  vec3 col = mix(uLagoon, uSurf, shoal * 0.35);
  float a = lagoonF * (0.2 + 0.28 * inkF3(d * 5.0 + uOff)) + dropF * 0.1 * pass;
  col = mix(col, uDrop, dropF * pass * (1.0 - lagoonF));
  vec3 coral = mix(uCoral, uCoralB, smoothstep(0.4, 0.7, inkN3(d * 40.0 + uOff)));
  col = mix(col, coral, crest);
  a = max(a, crest * 0.45);
  col = mix(col, uSurf, max(surf, cay));
  a = max(a, max(surf * 0.6, cay * 0.85));
  // ---- underfoot: looking down through the water, the heads of coral on the
  // sand, wavering with the water over them
  float close = (1.0 - smoothstep(0.12, 0.35, fp)) * uFoot;
  if (close > 0.001) {
    vec3 w = vW + vec3(sin(uTime * 0.7 + vW.z * 0.9), 0.0, cos(uTime * 0.6 + vW.x * 0.8)) * 0.08;
    vec2 h = heads(w / 1.7);
    vec2 h2 = heads(w / 0.7 + 11.0);
    float headF = (1.0 - smoothstep(0.55, 0.75, h.x)) * (0.5 + 0.5 * step(0.35, h.y));
    float small = (1.0 - smoothstep(0.5, 0.7, h2.x)) * step(0.55, h2.y);
    float zone = max(crestF * 1.4, lagoonF * 0.8) * present;
    vec3 headC = h.y < 0.33 ? uCoral : h.y < 0.66 ? uCoralB : uCoralC;
    vec3 under = mix(uLagoon, headC, max(headF, small * 0.8));
    // each head dark round its foot, where the sand is in its shade
    under = mix(under, under * 0.72, smoothstep(0.45, 0.7, h.x) * headF * 0.6);
    float look = smoothstep(0.04, 0.3, dot(d, V));                 // looking down into it
    float air = smoothstep(uFogBase, uFogBase + 130.0, dist);
    float underA = zone * look * (0.3 + 0.32 * max(headF, small)) * (1.0 - air);
    col = mix(col, under, close);
    a = mix(a, underA, close);
    // the surface over it: a few strokes of the sky laid back across
    float glint = step(0.8, inkN2(vec2(vW.x * 0.6 + uTime * 0.15, vW.z * 2.4)));
    col = mix(col, uSurf, glint * close * 0.6);
    a = max(a, glint * close * zone * look * 0.35);
  }
  // from orbit the limb is the sea's own business; at night the reef is gone
  float hold = mix(smoothstep(0.04, 0.26, face), 1.0, uFoot);
  float night = uTerm * (1.0 - smoothstep(-0.07, 0.07, dot(d, normalize(uLight))));
  a *= present * hold * max(uOrbit, uFoot) * (1.0 - 0.85 * night);
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, a);
}
`;

/** How much reef the week builds, of what colour, and why; null for none. */
function readReef(features) {
  const lifts = (features.list || []).filter((f) => f.kind === 'spires');
  if (!lifts.length) return null;
  const minutes = lifts.reduce((n, f) => n + num(f.stats?.activeS, 1800) / 60, 0);
  const amount = clamp(minutes / 180, 0.2, 1);
  const warmth = clamp(num(features.warmth, 0.5), 0, 1);
  return {
    lifts, amount, warmth,
    why: `${lifts.length} lifts, ${Math.round(minutes)} min of strength → reef on ${Math.round(amount * 100)}% of the shelf it can hold`,
  };
}

/**
 * The reefs. `week` is life.js's reading. Returns { object, update(frame),
 * dispose } or null for a week that lifted nothing.
 */
export function createReef(T, { features, survey, light, uniforms, R, palette: pal, amount }) {
  if (!survey?.land?.image?.data) return null; // life.js asks only a rock world's sea for its reefs
  const read = readReef(features);
  if (!read) return null;
  const rng = features.makeRng('life/reef');
  const sea = num(features.seaLevel, 0);
  // the shelf the reef can stand on: an atoll's ring where the open water's
  // floor comes nearest the light (the shallowest tenth of it)
  const img = survey.land.image, cimg = survey.coast.image;
  const from = T.DataUtils.fromHalfFloat;
  const open = [];
  for (let i = 0; i < img.data.length; i += 5) {
    const h = from(img.data[i]);
    if (h < 0 && from(cimg.data[i]) > 16) open.push(-h);
  }
  open.sort((a, b) => a - b);
  const atoll = open.length > 50 ? clamp(open[Math.floor(open.length * 0.08)], 0.15, 3) : 99;
  // the fringe stands off the beach by about the shelf's own width
  const crest = clamp(4.5 + 2 * read.warmth, 4, 7);
  const MIX = (a, b, t) => a.clone().lerp(b, t);
  const warm = read.warmth;
  const coralWarm = MIX(MIX(pal.vermilion, pal.litWarm, 0.45), pal.paper, 0.18);
  const coralCold = MIX(MIX(pal.stone, pal.sepia, 0.2), pal.paper, 0.2);
  const coral = MIX(coralCold, coralWarm, clamp((warm - 0.3) / 0.5, 0, 1));
  const sites = read.lifts.slice(0, SITES).map((f) => f.dir.clone().normalize());
  while (sites.length < SITES) sites.push(new T.Vector3(0, 1, 0));
  const u = {
    tLand: { value: survey.land },
    tCoast: { value: survey.coast },
    uLight: light,
    uTime: uniforms.uTime,
    uOrbit: { value: 1 },
    uFoot: { value: 0 },
    uAmount: amount,
    uTerm: { value: 0 },
    uFogBase: { value: 900 },
    uLagoon: { value: MIX(MIX(pal.seaShallow, pal.teal, 0.35), pal.paper, 0.42) },
    uCoral: { value: coral },
    uCoralB: { value: MIX(coral, MIX(pal.sepia, pal.litWarm, 0.4), 0.45) },
    uCoralC: { value: MIX(coral, MIX(pal.shadeCool, pal.vermilion, 0.35), 0.5) },
    uSurf: { value: pal.paper.clone() },
    uDrop: { value: MIX(pal.seaDeep, pal.cobalt, 0.4) },
    uFar: { value: MIX(pal.farGlaze, pal.skyWash, 0.5) },
    uCrest: { value: crest },
    uAtoll: { value: atoll },
    uThr: { value: 0.62 - 0.22 * read.amount },
    uOff: { value: new T.Vector3(rng() * 40, rng() * 40, rng() * 40) },
    uSiteN: { value: Math.min(read.lifts.length, SITES) },
    uSite: { value: sites },
  };
  const material = new T.ShaderMaterial({
    uniforms: u,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    // the wash pass reads the sea's own alpha as its handoff: keep it
    blending: T.CustomBlending,
    blendEquation: T.AddEquation,
    blendSrc: T.SrcAlphaFactor,
    blendDst: T.OneMinusSrcAlphaFactor,
    blendSrcAlpha: T.ZeroFactor,
    blendDstAlpha: T.OneFactor,
  });
  const geometry = new T.SphereGeometry(R + sea + 0.04, 160, 96);
  const mesh = new T.Mesh(geometry, material);
  mesh.name = 'life-reef';
  mesh.frustumCulled = false;
  // under the bloom's skin: the plankton is on the water, the reef under it
  mesh.renderOrder = -4;
  mesh.userData.species = { kind: warm > 0.55 ? 'warm reef' : 'cold reef', lifts: read.lifts.length, atolls: atoll < 99, why: read.why };
  return {
    object: mesh,
    update({ orbit, foot, term, camera }) {
      u.uOrbit.value = orbit;
      u.uFoot.value = foot;
      u.uTerm.value = term;
      u.uFogBase.value = foot > 0.5 ? 11 : 900 + Math.max(0, (camera?.position.length() || 0) - 700);
      mesh.visible = Math.max(orbit, foot) > 0.002;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

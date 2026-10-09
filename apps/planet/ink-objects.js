/* Planet Creator — "ink": the painted objects.
 *
 * Everything the ink style lays on the ground besides the terrain and the sea:
 * the monument and the treadmill as built things, the yoga grove as brush
 * strokes, the race as one loaded vermilion stroke, and the runner.
 *
 * Same hand as ink.js: one limited palette, flat washes with hard broken edges,
 * pigment pooling wherever a wash stops, paper left along the lit edge, and no
 * CG shading at all — no specular, no smooth value ramps, no gradient fill, no
 * gaussian blur. A wash here is a flat area of pigment that ends in a crisp,
 * slightly darker rim; wet-in-wet softness is never the default.
 *
 * Kept apart from ink.js because these are the objects, not the sheet.
 */
import { inkKindObject, livingObjectLod } from './ink-kinds.js';
import { P } from './params.js';
import { FIGURE } from './runner.js';

const R = 120; // planet radius (matches base.js)
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const MIX = (a, b, t) => a.clone().lerp(b, t);

/* -------------------------------------------------------------------- glsl */

const NOISE = /* glsl */ `
float inkH13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
float inkH12(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float inkN3(vec3 x){
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(inkH13(i), inkH13(i + vec3(1.0,0.0,0.0)), f.x), mix(inkH13(i + vec3(0.0,1.0,0.0)), inkH13(i + vec3(1.0,1.0,0.0)), f.x), f.y);
  float b = mix(mix(inkH13(i + vec3(0.0,0.0,1.0)), inkH13(i + vec3(1.0,0.0,1.0)), f.x), mix(inkH13(i + vec3(0.0,1.0,1.0)), inkH13(i + vec3(1.0,1.0,1.0)), f.x), f.y);
  return mix(a, b, f.z);
}
float inkN2(vec2 x){
  vec2 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(inkH12(i), inkH12(i + vec2(1.0,0.0)), f.x);
  float b = mix(inkH12(i + vec2(0.0,1.0)), inkH12(i + vec2(1.0,1.0)), f.x);
  return mix(a, b, f.y);
}
float inkF3(vec3 p){ float s = 0.0, a = 0.5, n = 0.0; for (int i = 0; i < 3; i++){ s += a * inkN3(p); n += a; p = p * 2.03 + vec3(1.7, -2.3, 0.9); a *= 0.5; } return s / n; }
float inkF2(vec2 p){ float s = 0.0, a = 0.5, n = 0.0; for (int i = 0; i < 3; i++){ s += a * inkN2(p); n += a; p = p * 2.03 + vec2(1.7, -2.3); a *= 0.5; } return s / n; }
// one pixel of paper, whatever the fragment's own scale: the transition of a
// brushed edge, never a soft ramp
float inkPixel(float x, float w){ return clamp(x / max(w, 1e-5) + 0.5, 0.0, 1.0); }
`;

const WASH_VERT = /* glsl */ `
varying vec3 vW;
varying vec3 vN;
varying vec3 vL;
varying vec3 vNL;
varying vec3 vAx;
varying vec3 vAz;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vL = position;
  vNL = normal;
  vAx = normalize(mat3(modelMatrix) * vec3(1.0, 0.0, 0.0));
  vAz = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

// A built thing, a stone: one flat wash to a face, a second, darker wash where
// the face turns from the sun, granulation in the shade, and ink only where the
// mass turns out of sight. A tall thing catches the sky: a paler wash is laid
// over its upper part on a hard wandering edge. A dry brush dragged down it
// leaves streaks. Paper is left along its edges: a ragged margin, and a clean
// wide strip down the edge the light comes over. The pigment pools at its foot.
// Every boundary here is a brush edge: hard, and just irregular enough.
const WASH_FRAG = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uLit, uShade, uInk, uPaper, uSky;
uniform vec3 uBoxMin, uBoxMax;
uniform float uRag, uGrain, uInkLine, uSeed, uTop, uSkyTop, uDry, uMargin, uLitEdge, uBase;
varying vec3 vW;
varying vec3 vN;
varying vec3 vL;
varying vec3 vNL;
varying vec3 vAx;
varying vec3 vAz;
${NOISE}
void main(){
  vec3 n = normalize(vN);
  float l = dot(n, uSunDir);
  // granulation: pigment settling into the tooth of the paper
  float grain = inkF3(vW * 4.6 + uSeed) * 0.65 + inkN3(vW * 13.0 + uSeed) * 0.35;
  // the light stops on a wandering line, not on a computed terminator: the
  // threshold drifts slowly and the edge itself is one pixel of the light
  float edge = l + (inkF3(vW * 0.9 + uSeed * 2.0) - 0.5) * uRag + (inkN3(vW * 2.7 + uSeed) - 0.5) * uRag * 0.35;
  float lit = inkPixel(edge - 0.04, max(fwidth(l), 0.012));

  vec3 c = mix(uShade, uLit, lit);
  // the second, deeper wash on the shaded face, and its grain
  c = mix(c, mix(uShade, uInk, 0.4), (1.0 - lit) * smoothstep(0.45, 0.92, grain) * 0.55);
  float y = (vL.y - uBoxMin.y) / max(0.001, uBoxMax.y - uBoxMin.y);

  // the face's own frame: where on it this is, in metres, and how far from its
  // edges — the vertical faces have no bottom edge, they stand in the ground
  vec3 an = abs(vNL), hb = (uBoxMax - uBoxMin) * 0.5, lp = vL - (uBoxMax + uBoxMin) * 0.5;
  vec2 fp = lp.xy, fh = hb.xy;
  vec3 across = vAx;
  if (an.x > an.z && an.x >= an.y) { fp = lp.zy; fh = hb.zy; across = vAz; }
  bool horiz = an.y > an.x && an.y > an.z;
  if (horiz) { fp = lp.xz; fh = hb.xz; }
  vec2 ed = fh - abs(fp);
  float toEdge = horiz ? min(ed.x, ed.y) : min(ed.x, fh.y - fp.y);
  float wob = inkF2(vec2(fp.x * 1.3, vL.y * 0.9) + uSeed) - 0.5;

  // the upper part catches the sky: a paler wash over it, and a paler one again
  // over the very top, each stopped on a hard line that the hand let wander
  float fy = fwidth(y) + 1e-4;
  c = mix(c, mix(c, uSky, 0.5), inkPixel(y - (0.58 + wob * 0.3), fy) * uSkyTop);
  c = mix(c, mix(c, uSky, 0.45), inkPixel(y - (0.86 + wob * 0.2), fy) * uSkyTop);
  // a dry brush dragged down the face: in bands, the hairs leave the lighter
  // wash showing between them, more of it the higher the brush had run dry
  float bands = smoothstep(0.35, 0.75, inkN2(vec2(fp.x * 3.0 + uSeed, vL.y * 0.35)));
  float hair = inkN2(vec2(fp.x * 26.0 + uSeed, vL.y * 0.9)) * 0.6 + inkN2(vec2(fp.x * 60.0, vL.y * 2.0 + uSeed)) * 0.4;
  float dry = uDry * (0.25 + 0.75 * y) * bands;
  c = mix(c, mix(c, uSky, 0.6), inkPixel(hair - (1.0 - 0.7 * dry), fwidth(hair) + 1e-4) * step(0.001, dry));
  // paper held back along the top of the lit face: the light comes over the edge
  c = mix(c, uPaper, smoothstep(0.74, 0.97, y) * lit * uTop);
  // the pigment pools at the foot of the mass
  c = mix(c, mix(uShade, uInk, 0.55), (1.0 - smoothstep(0.0, 0.2, y)) * uBase);
  c *= 0.97 + 0.07 * (grain - 0.5) * uGrain;

  // ink only on the silhouette: a few strokes where the mass turns out of sight
  vec3 V = normalize(cameraPosition - vW);
  float face = abs(dot(n, V));
  float band = 1.0 - inkPixel(face, fwidth(face) * 3.2);
  float tooth = inkF2(vec2(vW.y * 2.4, (vW.x + vW.z) * 1.7) + uSeed * 3.0);
  float stroke = band * smoothstep(0.44, 0.78, tooth) * mix(0.5, 1.0, 1.0 - lit) * uInkLine;
  c = mix(c, uInk, stroke);

  // paper left standing along the edges, ragged; and down the edge the light
  // comes over, a clean wide strip of it
  float marg = uMargin * (0.35 + 1.3 * inkF2(vec2(fp.x + fp.y, vL.y) * 2.6 + uSeed));
  float paper = (1.0 - inkPixel(toEdge - marg, fwidth(toEdge) + 1e-4)) * step(1e-4, uMargin);
  float litSide = dot(across, uSunDir) >= 0.0 ? 1.0 : -1.0;
  float litEdge = fh.x - fp.x * litSide;
  float strip = 1.0 - inkPixel(litEdge - uLitEdge * (0.8 + 0.5 * wob), fwidth(litEdge) + 1e-4);
  paper = max(paper, strip * step(1e-4, uLitEdge) * (horiz ? 0.0 : 1.0));
  c = mix(c, uPaper, paper);
  gl_FragColor = vec4(c, 1.0);
}
`;

const SHADOW_VERT = /* glsl */ `
attribute vec2 aP;
varying vec2 vP;
void main(){
  vP = aP;
  // brought forward along the line of sight, which moves nothing on the sheet:
  // the wash lies on the ground as it is drawn, not as the land is
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 toCam = cameraPosition - wp.xyz;
  float dist = length(toCam);
  wp.xyz += toCam / max(dist, 1e-4) * (0.02 + 0.002 * dist);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

// A wash on the ground: a cast shadow, or the pool of pigment at the foot of a
// mass. The rule the rocks follow: one flat value that stops on a hard edge,
// wandering slowly, with the pigment dried a step darker in a thin rim just
// inside it. No falloff and no blur: what stops, stops on a line.
const SHADOW_FRAG = /* glsl */ `
uniform vec3 uInk;
uniform float uAlpha, uCentre, uStretch, uSeed;
varying vec2 vP;
${NOISE}
void main(){
  float r = length(vec2((vP.x - uCentre) * uStretch, vP.y));
  float e = r - (1.0 + (inkF2(vP * 1.6 + uSeed) - 0.5) * 0.24);
  float fw = fwidth(e) + 1e-5;
  float a = 1.0 - inkPixel(e, fw);
  // the last pixel and a half inside the edge is where the pigment dried
  float rim = inkPixel(e + 1.5 * fw, fw) * a;
  a *= uAlpha * (1.0 + 0.55 * rim);
  if (a < 0.01) discard;
  gl_FragColor = vec4(uInk, a);
}
`;

// A pine the way Homer paints one: a thin trunk that leans and bends, and its
// foliage in dark clumps laid sideways off it — each clump two or three
// calligraphic dabs, landing at the trunk, fullest in the middle and lifted off
// to a point, flat underneath and ragged with needles on top — mostly downwind,
// with the sky showing between them. The clumps are dark, lighter on top and on
// the sun's side, where the lightest breaks up into paper; the shadow edges
// dry darker. One pine is snapped; one is a dead snag, a dark dry-brush stroke
// broken off short with a few stubs of branch. Opaque.
const TREE_VERT = /* glsl */ `
uniform vec2 uSize;
uniform float uLean;
uniform vec3 uSunDir;
varying vec2 vUv;
varying float vSide;
void main(){
  vUv = uv;
  vec3 O = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 up = normalize(O);                                  // up is the ground's normal here
  vec3 ax = cross(up, normalize(cameraPosition - O));
  ax = length(ax) > 1e-3 ? normalize(ax) : normalize(cross(up, vec3(1.0, 0.0, 0.0)));
  vSide = dot(uSunDir, ax);
  // the sheet leans from its own root, so no two trees stand the same way
  float h = position.y + 0.5;
#ifdef LIVING_ORBIT_SCALE
  // Billboard dimensions normally live in world units. During the orbit
  // handover they must also inherit their parent's collapsing scale.
  float livingScale = length(modelMatrix[1].xyz);
  vec3 world = O + livingScale * (ax * (position.x * uSize.x + uLean * h * uSize.y) + up * (h * uSize.y));
#else
  vec3 world = O + ax * (position.x * uSize.x + uLean * h * uSize.y) + up * (h * uSize.y);
#endif
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

// The pine's shape, shared by the tree and by its shadow on the ground.
const PINE = /* glsl */ `
// one dab laid sideways: it lands at xa, is fullest in the middle and lifts to
// a point at xb; bv is where in its thickness the point is, -1 below … 1 above
float inkLens(vec2 q, float xa, float xb, float y0, float lift, float th, float up, out float bv){
  float len = xb - xa;
  float u = (q.x - xa) / len;
  float uc = clamp(u, 0.0, 1.0);
  float w = pow(max(sin(3.14159 * uc), 0.0), 0.55);
  float dy = q.y - (y0 + lift * uc);
  float tt = th * w * (dy > 0.0 ? up : 0.6);
  bv = dy / max(tt, 1e-4);
  return max(abs(dy) - tt, (abs(u - 0.5) - 0.5) * abs(len));
}
float inkSeg(vec2 q, vec2 a, vec2 b, float r0, float r1){
  vec2 pa = q - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - mix(r0, r1, h);
}
// The pine on its own sheet, q in metres with the root at 0: returns the
// distance to its foliage (bv and bs say where in a dab the point is and which
// way the dab runs), with the distance to its wood — trunk and branches — in
// dWood, and where the trunk is at this height (tx) and how wide (tw).
float inkPine(vec2 q, float W, float H, float sd, float tiers, float wind, float bend, float dead, float snap,
              out float bv, out float bs, out float dWood, out float tx, out float tw){
  float wob = inkF2(q * 2.2 + sd) - 0.5;                     // the wander of the hand
  float nee = inkN2(vec2(q.x * 14.0, q.y * 4.0) + sd) - 0.5; // needles flicked off a top edge
  float top = H * (0.97 - snap);                             // a broken pine stops short
  // the trunk: one stroke up from the ground, bending as it goes, tapering —
  // a dead one heavier — and where it broke it ends on a jag
  float yt = q.y / H;
  tx = bend * yt * yt * 0.08 * H + (inkN2(vec2(yt * 2.5, sd)) - 0.5) * 0.025 * H;
  tw = (H * (mix(0.015, 0.022, dead) - mix(0.011, 0.013, dead) * yt) + 0.003) * (0.8 + 0.4 * inkN2(vec2(yt * 16.0, sd + 4.0)));
  float jag = top + (inkN2(vec2(q.x * 40.0, sd)) - 0.5) * 0.05 * H * step(0.01, snap);
  dWood = max(abs(q.x - tx) - tw, q.y - jag);
  // the clumps, each on its branch; a dead snag keeps only stubs of branches
  float best = 1e3;
  bv = 0.0; bs = 0.0;
  float cnt = dead > 0.5 ? 5.0 : tiers;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    if (fi >= cnt) break;
    float h1 = inkH12(vec2(fi, sd)), h2 = inkH12(vec2(fi + 7.0, sd));
    float h3 = inkH12(vec2(fi + 13.0, sd)), h4 = inkH12(vec2(fi + 19.0, sd));
    float t = (fi + 0.3 + 0.4 * h1) / cnt;                     // 0 low … 1 high
    float y = mix(0.34 * H, top - 0.06 * H, t);
    float x0 = bend * (y / H) * (y / H) * 0.08 * H;
    float dir = h2 < 0.5 + 0.3 * wind ? 1.0 : -1.0;           // mostly downwind
    float L = min(0.5 * W * mix(1.0, 0.32, t) * (0.5 + 0.6 * h3), 0.48 * W - dir * x0);
    if (dead > 0.5) {
      // a stub of dead branch: short, heavy where it leaves the trunk, and as
      // often hanging as reaching
      vec2 end = vec2(x0 + dir * L * (0.25 + 0.3 * h3), y + (h4 - 0.6) * 0.1 * H);
      dWood = min(dWood, inkSeg(q, vec2(x0, y), end, 0.009 * H, 0.0035 * H));
      continue;
    }
    vec2 tip = vec2(x0 + dir * L, y + (h4 - 0.3) * 0.08 * H);
    dWood = min(dWood, inkSeg(q, vec2(x0, y - 0.03 * H), tip - vec2(dir * 0.25 * L, 0.0), 0.005 * H, 0.0018 * H));
    float th = H * mix(0.04, 0.026, t) * (0.8 + 0.45 * h4);
    float lift = tip.y - y;
    float b;
    float d = inkLens(q, x0 - dir * 0.12 * L, x0 + dir * 0.66 * L, y, lift * 0.66, th, 1.2 + nee, b);
    if (d < best) { best = d; bv = b; bs = dir; }
    d = inkLens(q, x0 + dir * 0.34 * L, tip.x, y + lift * 0.34 + (h1 - 0.5) * th, lift * 0.66, th * 0.85, 1.25 + nee, b);
    if (d < best) { best = d; bv = b; bs = dir; }
    // most of them put out a shorter clump the other way
    if (h4 > 0.4) {
      d = inkLens(q, x0 + dir * 0.08 * L, x0 - dir * L * (0.2 + 0.45 * h1), y + th * (0.2 + 0.6 * h3), -lift * 0.3, th * 0.8, 1.15 + nee, b);
      if (d < best) { best = d; bv = b; bs = -dir; }
    }
  }
  // a whole live pine ends in a narrow tuft
  if (dead < 0.5 && snap < 0.01) {
    float b;
    float xl = bend * 0.08 * H * 0.9;
    float d = inkLens(q, xl - 0.035 * H, xl + 0.05 * H, top - 0.035 * H, 0.02 * H, 0.03 * H, 1.3 + nee, b);
    if (d < best) { best = d; bv = b; bs = 1.0; }
  }
  return best + wob * 0.018 * H;                             // the whole edge wanders a little
}
`;

const TREE_FRAG = /* glsl */ `
uniform vec3 uLeaf, uLeafLit, uLeafDeep, uInk, uWood, uPaper;
uniform vec2 uSize;
uniform float uSeed, uTiers, uWind, uBend, uDead, uSnap;
varying vec2 vUv;
varying float vSide;
${NOISE}
${PINE}
void main(){
  float W = uSize.x, H = uSize.y, sd = uSeed;
  vec2 q = vec2((vUv.x - 0.5) * W, vUv.y * H);              // metres on the sheet, the root at 0
  float sun = vSide >= 0.0 ? 1.0 : -1.0;                     // the side of the sheet the sun is on
  float sideK = smoothstep(0.0, 0.45, abs(vSide));           // and how much that matters
  float wob = inkF2(q * 2.2 + sd) - 0.5;                     // the wander of the hand
  float bv, bs, dWood, tx, tw;
  float best = inkPine(q, W, H, sd, uTiers, uWind, uBend, uDead, uSnap, bv, bs, dWood, tx, tw);

  float fw = fwidth(best) + 1e-5;
  float leaf = 1.0 - inkPixel(best, fw);
  float wood = 1.0 - inkPixel(dWood, fwidth(dWood) + 1e-5);
  // three washes on wandering edges: dark, lighter on top and on the sun's side
  float L = 0.28 + 0.36 * bv + 0.24 * sun * bs * sideK + wob * 0.45;
  float fl = fwidth(L) + 1e-3;
  vec3 c = mix(uLeafDeep, uLeaf, inkPixel(L - 0.45, fl));
  c = mix(c, uLeafLit, inkPixel(L - 0.76, fl));
  // the pigment dries darker along the shadow edges, a pixel or two wide; on
  // the lit edges the brush breaks up and the paper shows through
  float rim = inkPixel(best + 1.6 * fw, fw);
  c = mix(c, mix(uLeafDeep, uInk, 0.5), rim * (1.0 - inkPixel(L - 0.5, fl)) * 0.8);
  leaf *= 1.0 - rim * inkPixel(L - 0.7, fl) * step(0.5, inkN2(q * 36.0 + sd));

  // the dead snag is laid in with a dry brush: the hairs part along the
  // stroke, more of them toward its broken top
  float across = (q.x - tx) / max(tw, 1e-4);
  float hairs = inkN2(vec2(across * 1.4 + sd, q.y / H * 6.0)) * 0.65 + inkN2(vec2(across * 3.1 - sd, q.y / H * 17.0)) * 0.35;
  wood *= mix(1.0, inkPixel(hairs - 0.12 - 0.3 * smoothstep(0.15, 1.0, q.y / H), fwidth(hairs) + 1e-4), uDead);
  // the wood behind: a dark stroke with the sun along one side of it
  vec3 cw = mix(uWood, mix(uWood, uPaper, 0.4 - 0.25 * uDead), step(0.3 + 0.2 * uDead, sun * across) * sideK);
  float a = max(leaf, wood);
  if (a < 0.02) discard;
  gl_FragColor = vec4(mix(cw, c, leaf), a);
}
`;

// A pine's shadow is the pine laid down on the ground away from the sun: the
// trunk from its foot, and its shelves as flat bars across it. One flat value,
// a hard edge and a dried rim, the rule every shadow here keeps.
const TREE_SHADOW_FRAG = /* glsl */ `
uniform vec3 uInk;
uniform float uAlpha;
uniform vec2 uSize;
uniform float uSeed, uTiers, uWind, uBend, uDead, uSnap;
varying vec2 vP;
${NOISE}
${PINE}
void main(){
  float W = uSize.x, H = uSize.y;
  // the ground read as the pine's sheet: along the shadow is up the tree
  vec2 q = vec2(vP.y * 0.5 * W, vP.x * H);
  float bv, bs, dWood, tx, tw;
  float e = min(inkPine(q, W, H, uSeed, uTiers, uWind, uBend, uDead, uSnap, bv, bs, dWood, tx, tw), dWood);
  float fw = fwidth(e) + 1e-5;
  float a = 1.0 - inkPixel(e, fw);
  float rim = inkPixel(e + 1.5 * fw, fw) * a;
  a *= uAlpha * (1.0 + 0.55 * rim);
  if (a < 0.01) discard;
  gl_FragColor = vec4(uInk, a);
}
`;

const STROKE_VERT = /* glsl */ `
attribute float aS;
attribute float aSide;
attribute vec3 aBi;
attribute vec3 aMid;
attribute vec2 aDrop;
uniform float uHalf;
uniform float uPx;
uniform float uTotal;
uniform float uFigDist;
uniform vec3 uPatchCentre;
uniform vec3 uPatchEast;
uniform vec3 uPatchNorth;
uniform float uPatchHalf;
uniform float uPatchFade;
uniform float uPatchOn;
varying float vS;
varying float vSide;
varying float vFace;
varying float vPx;
varying float vDist;
varying float vW;
void main(){
  vec3 mid = (modelMatrix * vec4(aMid, 1.0)).xyz;
  vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 up = normalize(mid);
  // laid on whichever ground is drawn under it: the fine patch's true relief
  // round a viewer on foot, and the orbit globe's capped relief from orbit and
  // beyond the patch — base.js's own footprint test, run for each ring — so
  // it sinks (aDrop: the lane, the ring's centre) onto the capped globe
  float capped = 1.0;
  if (uPatchOn > 0.5) {
    float th = acos(clamp(dot(up, uPatchCentre), -1.0, 1.0));
    float m = th * max(abs(dot(up, uPatchEast)), abs(dot(up, uPatchNorth))) / (max(sin(th), 1e-6) * uPatchHalf);
    capped = smoothstep(uPatchFade, 1.0, m);
  }
  mid -= up * aDrop.y * capped;
  p -= normalize(p) * aDrop.x * capped;
  vec3 toCam = cameraPosition - mid;
  float dist = length(toCam);
  toCam /= max(dist, 1e-4);
  // the weight of the hand: loaded near the eye and all down the last stretch
  // to the stone, and finer the further off the rest of the course runs
  float w = max(mix(0.42, 1.0, smoothstep(uTotal - 110.0, uTotal - 30.0, aS)), 1.0 - smoothstep(16.0, 50.0, dist));
  p = mid + (p - mid) * w;
  // a brush line keeps its width on the sheet however edge-on the course runs:
  // along a crest seen from the side it is widened across the line of sight to
  // half its own width, and far off it never comes out under a hairline
  vec3 along = normalize(cross(aBi, up));
  vec3 across = cross(along, toCam);
  float al = length(across);
  across = al > 1e-3 ? across / al : aBi;
  float cs = dot(aBi, across);
  float onSheet = uHalf * w * abs(cs);
  float hairline = 1.6 * uPx * dist;
  float wide = max(onSheet, max(hairline, 0.5 * uHalf * w));
  p += across * (cs < 0.0 ? -aSide : aSide) * (wide - onSheet);
  // from orbit the line is kept on the face of the globe: it is drawn inside
  // the edge it runs along, never over the paper beyond it
  float orbit = smoothstep(200.0, 300.0, dist);
  vec3 outward = up - toCam * dot(up, toCam);
  float ol = length(outward);
  if (ol > 1e-4) p -= outward / ol * hairline * orbit;
  // laid on the ground near the eye — a hair above it, under the figure's own
  // shadow — and a little into it far off, where the ground is drawn coarser
  // than the land is; and beyond the figure drawn over the land, never into it:
  // brought forward along the line of sight, which moves nothing on the sheet,
  // by more than the ground's own mesh strays from the land, so a crest cannot
  // bite teeth out of it; only a real ridge in front hides it
  float over = 0.02 + 0.003 * dist + 0.016 * max(0.0, dist - uFigDist - 3.0) + 12.0 * orbit;
  p += up * (0.03 - 0.0015 * max(0.0, dist - 20.0)) + toCam * over;
  vS = aS;
  vSide = aSide;
  vFace = dot(up, toCam);
  vPx = clamp(hairline / wide, 0.0, 1.0);
  vDist = dist;
  vW = w;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

// One loaded vermilion stroke down the whole course: one flat wash of the red
// at a steady width, with its pigment dried a step darker in a thin rim along
// both edges. It is carried unbroken over every crest; only land that really
// stands in front of it hides it, and there it breaks clean. The hand is loaded
// near the eye and down the last stretch to the finish — the climax, full width,
// its rim pooled darker — and draws the rest of the course finer the further
// off it runs, down to a hairline, and from orbit a hairline of the same red.
// The brush is reloaded every twenty-odd metres, so each load lands a touch
// wetter; at the finish it is set down full and lifted clean short of the
// stone, a round end where the pigment pools. No paint behind the figure:
// paper is left round her, or a red mark behind her reads as part of her.
const STROKE_FRAG = /* glsl */ `
uniform vec3 uVerm, uInk, uPaper;
uniform float uHalf, uTotal, uFigDist;
uniform vec4 uFig;
varying float vS;
varying float vSide;
varying float vFace;
varying float vPx;
varying float vDist;
varying float vW;
${NOISE}
float inkLoad(float k){ return k * 24.0 + (inkH12(vec2(k, 7.31)) - 0.5) * 16.0; }
void main(){
  // which load of the brush this is, and how far into it
  float k = floor(vS / 24.0);
  float b0 = inkLoad(k);
  if (vS < b0) { k -= 1.0; b0 = inkLoad(k); }
  float b1 = inkLoad(k + 1.0);
  float d0 = vS - b0, d1 = b1 - vS;
  float sd = inkH12(vec2(k, 2.7)) * 50.0;
  float orbit = smoothstep(200.0, 300.0, vDist);
  float hair = smoothstep(0.35, 0.7, vPx);                      // a line only a few pixels wide
  float fs = fwidth(vS) + 1e-5;
  float fw = fwidth(vSide) + 1e-5;
  float fin = smoothstep(uTotal - 60.0, uTotal - 20.0, vS);     // the last stretch to the stone

  // the hand: a steady pressure, easing only a touch as each load runs out;
  // the course starts on a touch
  float press = 0.92 + (inkF2(vec2(vS * 0.11, 3.0)) - 0.5) * 0.12;
  press *= 1.0 - 0.06 * smoothstep(3.0, 0.0, d1);
  press *= smoothstep(0.0, 1.5, vS);
  float reach = mix(clamp(press, 0.0, 1.0), 0.95, hair);
  float edge = reach * (1.0 + (inkF2(vec2(vS * 0.6, sign(vSide) * 5.0 + sd)) - 0.5) * 0.14 * (1.0 - hair));
  // …and at the finish it is lifted clean short of the stone: a round end
  float hw = max(uHalf * vW, 1e-3);
  float lift = uTotal - 2.4;
  float s = length(vec2(max(0.0, vS - (lift - reach * hw)) / hw, vSide));
  float fe = fwidth(s) + 1e-5;
  float cover = 1.0 - inkPixel(s - edge, fe);
  // from orbit it is spared everywhere but past the limb
  cover *= mix(1.0, smoothstep(0.0, 0.04, vFace), orbit);
  // paper left round the figure: nothing of the course is painted behind her
  if (uFig.z > 0.0) {
    vec2 f = (gl_FragCoord.xy - uFig.xy) / uFig.zw;
    float o = length(f) + (inkF2(gl_FragCoord.xy * 0.04) - 0.5) * 0.25;
    cover *= 1.0 - step(uFigDist + 0.6, vDist) * (1.0 - inkPixel(o - 1.0, fwidth(o) + 1e-4));
  }
  if (cover < 0.02) discard;

  vec3 c = uVerm;
  // where each load landed it is a touch wetter, up to a drying front that
  // wanders across the stroke; and where the brush stopped, it pools
  float front = 0.9 + 0.8 * inkF2(vec2(vSide * 1.3 + sd, k));
  c = mix(c, mix(uVerm, uInk, 0.12), (1.0 - inkPixel(d0 - front, fs)) * (1.0 - hair));
  c = mix(c, mix(uVerm, uInk, 0.2), smoothstep(lift - 1.6, lift - 0.3, vS) * (1.0 - hair));
  // the dried rim: the last pixel and a half inside each edge, one step darker,
  // wherever the stroke is wide enough on the sheet to have one — pooled wider
  // and darker down the last stretch
  float rimW = min(mix(1.6, 2.6, fin) * fe, 0.4 * edge);
  float rim = inkPixel(s - (edge - rimW), fe) * smoothstep(4.0, 8.0, 2.0 * edge / fw);
  c = mix(c, mix(uVerm, uInk, mix(0.42, 0.54, fin)), rim);
  // the tooth of the paper, and far off on the ground the red cools into the air
  float g = inkN2(gl_FragCoord.xy * 0.55) * 0.6 + inkN2(gl_FragCoord.xy * 1.9) * 0.4;
  c *= 1.0 - 0.05 * smoothstep(0.4, 0.85, g) * (1.0 - hair);
  c = mix(c, mix(uVerm, uPaper, 0.35), smoothstep(60.0, 180.0, vDist) * (1.0 - orbit) * 0.5);
  gl_FragColor = vec4(c, cover);
}
`;

/* --------------------------------------------------------------- particles */

// The runner is a rig of plain meshes rebuilt every frame, so its materials are
// three's own with the painting done through onBeforeCompile: one colour per
// part, a light wash and a cooler shadow wash that meet on a crisp wandering
// line set well up the form — a painter's light, so a figure lit from behind
// the eye still turns into shade before its edge — pigment settling into the
// tooth, most in the shade, and a broken ink contour on the shadow side only.
const RUNNER_VERT_HEAD = /* glsl */ `
varying vec3 inkRW;
varying vec3 inkRN;
varying float inkRY;
`;

const RUNNER_VERT_BODY = /* glsl */ `
{
  vec4 inkWP = modelMatrix * vec4( transformed, 1.0 );
  inkRW = inkWP.xyz;
  inkRY = transformed.y;
#ifdef USE_SKINNING
  inkRN = normalize( mat3( modelMatrix ) * objectNormal );
#else
  inkRN = normalize( mat3( modelMatrix ) * normal );
#endif
}
`;

const RUNNER_FRAG_HEAD = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uWashLit;
uniform vec3 uWashShade;
uniform vec3 uHemLit;
uniform vec3 uHemShade;
uniform vec3 uInk;
uniform float uRag;
uniform float uFlat;
uniform float uSplit;
uniform float uGrain;
uniform float uHem;
varying vec3 inkRW;
varying vec3 inkRN;
varying float inkRY;
${NOISE}
`;

const RUNNER_FRAG_WASH = /* glsl */ `
{
  vec3 n = normalize( inkRN );
  float lam = dot( n, uSunDir );
  // the split is drawn, not shaded: the threshold wanders deliberately, and the
  // transition is one pixel of the light's own gradient — never a soft ramp
  float rag = ( inkF3( inkRW * 0.8 ) - 0.5 ) * 2.0;
  float tooth = inkN3( inkRW * 4.2 ) - 0.5;
  float l = lam + rag * uRag + tooth * uRag * 0.35;
  float lit = inkPixel( l - uSplit, max( fwidth( lam ), 0.012 ) );
  // whatever of a part shows above the hem is the part the hem covers
  bool hem = inkRY > uHem;
  vec3 wl = hem ? uHemLit : uWashLit;
  vec3 ws = hem ? uHemShade : uWashShade;
  vec3 c = mix( ws, wl, mix( lit, 0.5, uFlat ) );
  // the pigment carries to the boundary and dries there a shade darker
  float rim = ( 1.0 - smoothstep( 0.0, 0.14, abs( l - uSplit ) ) ) * ( 1.0 - lit );
  c = mix( c, mix( ws, uInk, 0.35 ), rim * 0.6 );
  // and settles into the tooth of the paper, most where the wash is deepest
  float gr = inkN2( gl_FragCoord.xy * 0.7 ) * 0.6 + inkN2( gl_FragCoord.xy * 2.1 ) * 0.4;
  c *= 1.0 - uGrain * ( 0.4 + 0.6 * ( 1.0 - lit ) ) * smoothstep( 0.4, 0.9, gr );
  diffuseColor.rgb = c;
}
`;

const RUNNER_FRAG_INK = /* glsl */ `
{
  vec3 n = normalize( inkRN );
  vec3 V = normalize( cameraPosition - inkRW );
  float face = abs( dot( n, V ) );
  // a band of constant width in pixels, whatever the figure's size on screen
  float band = 1.0 - inkPixel( face, max( fwidth( face ) * 3.4, 1e-5 ) );
  float tooth = inkN2( gl_FragCoord.xy * 0.42 ) * 0.6 + inkN2( gl_FragCoord.xy * 1.7 ) * 0.4;
  // the contour is only on the side the light does not reach, and the brush
  // lifts off it here and there
  float shaded = 1.0 - smoothstep( uSplit - 0.12, uSplit + 0.04, dot( n, uSunDir ) );
  float contour = band * shaded * smoothstep( 0.30, 0.62, tooth );
  diffuseColor.rgb = mix( diffuseColor.rgb, uInk, contour * 0.85 );
}
`;

// runner.look 1, the drawn figure: the same washes, but a part knows what it
// is (uKind: 0 skin, 1 the singlet over the torso, 2 a shoe, 3 the cap, 4 hair
// or beard, 5 the shorts, 6 the face), so the singlet can cut its armholes and
// its neck and hang its hem over the shorts with a few folds where the cloth
// hangs, a shoe can stand on a pale midsole, the cap can have its panels and
// the strap's opening at the back, the shorts a turned hem that shades the
// thigh under it, and the brim can shade the face. The brush rides on him
// (along and round a limb, else in the part's own frame), so a stride never
// drags the noise across him. The contour is a brush line: heavy on the
// shadow side and under a form, thin and broken where the light is, and there
// the paper is left along the edge instead; it thins as he gets small.
const RUNNER2_VERT_HEAD = /* glsl */ `
attribute vec3 aRunner;
varying vec3 inkRW;
varying vec3 inkRN;
varying vec3 inkRP;
varying vec3 inkRA;
varying vec3 inkRL;
`;

const RUNNER2_VERT_BODY = /* glsl */ `
{
  vec4 inkWP = modelMatrix * vec4( transformed, 1.0 );
  inkRW = inkWP.xyz;
  inkRP = transformed;
  inkRA = aRunner;
  inkRL = normal;
  inkRN = normalize( mat3( modelMatrix ) * normal );
}
`;

const INK_STROKE = /* glsl */ `// a brush stroke from a to b, bowed off its chord by bow at the middle and
// tapering to nothing at both ends: its cover at p, with aa of edge
float inkStroke( vec2 p, vec2 a, vec2 b, float bow, float w, float aa ){
  vec2 ab = b - a;
  float len = max( length( ab ), 1e-5 );
  vec2 t = ab / len;
  float u = dot( p - a, t ) / len;
  if ( u < 0.0 || u > 1.0 ) return 0.0;
  float off = dot( p - a, vec2( -t.y, t.x ) ) - bow * 4.0 * u * ( 1.0 - u );
  float hw = w * pow( sin( 3.14159 * u ), 0.6 );
  return 1.0 - smoothstep( hw - aa, hw + aa, abs( off ) );
}
`;

const RUNNER2_FRAG_HEAD = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uWashLit;
uniform vec3 uWashShade;
uniform vec3 uAltLit;
uniform vec3 uAltShade;
uniform vec3 uLowLit;
uniform vec3 uLowShade;
uniform vec3 uInk;
uniform vec3 uPaper;
uniform float uRag;
uniform float uSplit;
uniform float uGrain;
uniform float uKind;
uniform float uLine;
varying vec3 inkRW;
varying vec3 inkRN;
varying vec3 inkRP;
varying vec3 inkRA;
varying vec3 inkRL;
${NOISE}
${INK_STROKE}`;

const RUNNER2_FRAG = /* glsl */ `
{
  vec3 n = normalize( inkRN );
  vec3 V = normalize( cameraPosition - inkRW );
  vec3 p = inkRP;
  vec3 q = inkRA.z > 0.5 ? vec3( inkRA.x, 0.05 * cos( 6.2832 * inkRA.y ), 0.05 * sin( 6.2832 * inkRA.y ) ) : p;
  float lam = dot( n, uSunDir );
  float rag = ( inkF3( q * 2.0 + 3.1 * uKind ) - 0.5 ) * 2.0;
  float tooth = inkN3( q * 11.0 + 1.7 * uKind ) - 0.5;
  float l = lam + rag * uRag + tooth * uRag * 0.35;
  float lit = inkPixel( l - uSplit, max( fwidth( lam ), 0.012 ) );
  // metres of him in a pixel: the small things are drawn only close to
  float px = max( length( fwidth( p ) ), 1e-5 );
  float near = smoothstep( 0.012, 0.004, px );
  float aa = max( px, 0.0008 );
  float alt = 0.0, low = 0.0, seam = 0.0, fold = 0.0, dark = 0.0, occ = 0.0, pool = 0.0;
  if ( uKind > 0.5 && uKind < 1.5 ) {
    float ax = abs( p.x );
    float back = smoothstep( 0.03, -0.05, p.z );
    float hole = ax - ( 0.125 + 0.07 * pow( clamp( ( 0.545 - p.y ) / 0.2, 0.0, 1.0 ), 2.0 ) );
    float neck = p.y - mix( 0.455 + 0.1 * pow( ax / 0.08, 2.0 ), 0.52 + 0.04 * pow( ax / 0.08, 2.0 ), back );
    float open = max( hole, neck );
    alt = inkPixel( open, fwidth( open ) + 1e-5 );
    float hem = -0.035 - 0.012 * back + 0.004 * sin( p.x * 40.0 + 1.3 ) + ( inkN2( vec2( atan( p.x, p.z ) * 3.0, 7.0 ) ) - 0.5 ) * 0.01;
    float dh = hem - p.y;
    low = inkPixel( dh, fwidth( dh ) + 1e-5 );
    seam = ( 1.0 - smoothstep( 0.0, 0.006, -open ) ) * ( 1.0 - alt ) * ( 1.0 - low );
    seam = max( seam, ( 1.0 - smoothstep( 0.0, 0.006, -dh ) ) * ( 1.0 - low ) );
    seam *= 0.35 + 0.65 * near;
    float f = inkStroke( vec2( ax, p.y ), vec2( 0.15, 0.36 ), vec2( 0.05, 0.14 ), 0.018, 0.006, aa );
    f = max( f, inkStroke( vec2( ax, p.y ), vec2( 0.162, 0.25 ), vec2( 0.08, 0.035 ), 0.012, 0.005, aa ) );
    f = max( f, inkStroke( p.xy, vec2( -0.1, 0.052 ), vec2( 0.07, 0.062 ), -0.012, 0.0045, aa ) );
    f = max( f, inkStroke( p.xy, vec2( -0.045, 0.098 ), vec2( 0.11, 0.086 ), -0.01, 0.0035, aa ) );
    fold = f * smoothstep( 0.05, -0.02, p.z ) * ( 1.0 - alt ) * ( 1.0 - low ) * ( 0.45 + 0.55 * near );
    // one broad wash over the cloth, a little deeper where the pigment ran
    // down and pooled toward the hem, its edge wandering across the back
    pool = inkPixel( 0.2 - p.y + 0.07 * ( inkF2( vec2( p.x * 5.0, p.z * 5.0 + 3.0 ) ) - 0.5 ), 0.012 ) * ( 1.0 - alt ) * ( 1.0 - low );
    // the head shades the whole neck under it, one shadow from the neckline
    // up; and the arms hang in the light that would reach his sides
    occ = max( smoothstep( 0.535, 0.565, p.y ) * alt,
      smoothstep( 0.55, 0.85, abs( normalize( inkRL ).x ) ) * smoothstep( 0.1, 0.2, p.y ) * ( 1.0 - smoothstep( 0.38, 0.46, p.y ) ) );
  } else if ( uKind > 1.5 && uKind < 2.5 ) {
    float h = p.y + 0.1;
    float mid = 0.022 + 0.014 * smoothstep( 0.12, -0.06, p.z );
    alt = inkPixel( mid - h, fwidth( h ) + 1e-5 );
    low = inkPixel( 0.006 - h, fwidth( h ) + 1e-5 );
    seam = ( 1.0 - smoothstep( 0.0, 0.004, abs( h - mid ) ) ) * near;
  } else if ( uKind > 2.5 && uKind < 3.5 ) {
    vec3 c = p - vec3( 0.0, 0.205, -0.01 );
    vec3 d = vec3( c.x, c.y * 0.9689 - c.z * 0.2474, c.y * 0.2474 + c.z * 0.9689 );
    float panel = abs( sin( 3.0 * atan( d.x, d.z ) ) ) * length( d.xz );
    seam = ( 1.0 - smoothstep( 0.0012 - aa, 0.0012 + aa, panel ) ) * step( 0.016, d.y );
    seam = max( seam, 1.0 - smoothstep( 0.0012 - aa, 0.0012 + aa, abs( d.y - 0.014 ) ) );
    seam = max( seam, 1.0 - smoothstep( 0.008 - aa, 0.008 + aa, length( d - vec3( 0.0, 0.125, 0.0 ) ) ) );
    seam *= near;
    float gap = length( d.xy ) - 0.032;
    alt = inkPixel( -gap, fwidth( gap ) + 1e-5 ) * step( d.z, -0.06 ) * step( 0.011, d.y );
    seam = max( seam, ( 1.0 - smoothstep( 0.0, 0.003, abs( gap ) ) ) * step( d.z, -0.06 ) * step( 0.011, d.y ) * near );
  } else if ( uKind > 3.5 && uKind < 4.5 ) {
    // the hair round the back stops in a short, uneven line at the nape
    if ( p.z < -0.04 && p.y < 0.104 + 0.008 * inkN2( vec2( atan( p.x, p.z ) * 14.0, 2.0 ) ) ) discard;
    // a few strands where the brush was split, drawn only close to, combed down
    float s1 = inkN2( vec2( atan( p.x, p.z ) * 70.0, p.y * 9.0 ) );
    fold = smoothstep( 0.7, 0.86, s1 ) * near * 0.3;
    float face = abs( dot( n, V ) );
    float edge = 1.0 - inkPixel( face - 0.3, max( fwidth( face ), 1e-4 ) );
    dark = edge * ( 0.25 + 0.25 * smoothstep( 0.3, 0.62, inkN2( gl_FragCoord.xy * 0.33 + 17.0 ) ) );
  } else if ( uKind > 4.5 && uKind < 5.5 ) {
    seam = ( 1.0 - smoothstep( 0.0, 0.007, -inkRA.x ) ) * step( 0.5, inkRA.z );
  } else if ( uKind > 5.5 ) {
    occ = smoothstep( 0.02, 0.05, p.z ) * smoothstep( 0.148, 0.158, p.y + 0.004 * sin( p.x * 90.0 ) );
  }
  if ( uKind < 0.5 ) {
    // the shorts' hem shades the thigh just under it
    occ = ( 1.0 - smoothstep( 0.006, 0.032, inkRA.x + 0.006 * ( inkN2( vec2( inkRA.y * 12.0, 3.0 ) ) - 0.5 ) ) ) * step( 0.0, inkRA.x ) * step( 0.5, inkRA.z );
    if ( inkRA.z > 1.5 ) {
      // a leg (runner.js LIMB1.leg: the knee about 0.25 m on from the hem,
      // the ankle about 0.69): the crease behind the knee, and an ankle
      // sock over the shoe, its cuff higher at the heel
      float knee = ( 1.0 - smoothstep( 0.002, 0.006, abs( inkRA.x - 0.25 ) ) ) * ( 1.0 - smoothstep( 0.05, 0.1, abs( inkRA.y - 0.5 ) ) );
      float cuff = inkRA.x - 0.67 - 0.01 * cos( 6.2832 * inkRA.y );
      alt = inkPixel( cuff, fwidth( inkRA.x ) + 1e-5 );
      seam = max( knee * near * 0.7, ( 1.0 - smoothstep( 0.0, 0.004, abs( cuff ) ) ) * near );
    } else if ( inkRA.z > 0.5 ) {
      // an arm (LIMB1.arm: the elbow about 0.38 m from the shoulder's cap):
      // the crease inside the elbow
      seam = ( 1.0 - smoothstep( 0.002, 0.006, abs( inkRA.x - 0.378 ) ) ) * ( 1.0 - smoothstep( 0.04, 0.08, min( inkRA.y, 1.0 - inkRA.y ) ) ) * near * 0.7;
    } else if ( p.y > 0.1 ) {
      // an ear (runner.js HEAD1.ear, head frame): the curl of its rim
      float e = length( vec2( ( p.y - 0.143 ) / 0.03, ( p.z + 0.01 ) / 0.02 ) );
      seam = ( 1.0 - smoothstep( 0.07, 0.15, abs( e - 0.6 ) ) ) * step( 0.0, -( p.z + 0.01 ) + 0.4 * ( p.y - 0.143 ) + 0.006 ) * near * 0.8;
    }
  }
  if ( inkRA.z > 0.5 ) {
    // a limb's side that faces his body is in its shade: the inside of a
    // thigh, the inside of an arm
    occ = max( occ, smoothstep( -0.3, -0.8, sign( p.x ) * normalize( inkRL ).x ) );
  }
  // the shade a form throws on itself is a wash too: one crisp, wandering edge
  lit *= 1.0 - inkPixel( occ + tooth * 0.35 - 0.5, fwidth( occ ) + 0.02 );
  vec3 wl = mix( mix( uWashLit, uAltLit, alt ), uLowLit, low );
  vec3 ws = mix( mix( uWashShade, uAltShade, alt ), uLowShade, low );
  vec3 col = mix( ws, wl, lit );
  col = mix( col, mix( col, ws, 0.3 ), pool );
  float dried = ( 1.0 - smoothstep( 0.0, 0.035, abs( l - uSplit ) ) ) * ( 1.0 - lit );
  col = mix( col, mix( ws, uInk, 0.35 ), dried * 0.55 );
  col = mix( col, mix( ws, uInk, 0.12 + 0.3 * ( 1.0 - lit ) ), fold );
  col = mix( col, mix( ws, uInk, 0.5 ), seam * 0.85 );
  col = mix( col, mix( ws, uInk, 0.3 ), dark );
  float gr = inkN2( gl_FragCoord.xy * 0.7 ) * 0.6 + inkN2( gl_FragCoord.xy * 2.1 ) * 0.4;
  col *= 1.0 - uGrain * ( 0.4 + 0.6 * ( 1.0 - lit ) ) * smoothstep( 0.4, 0.9, gr );
  float face = abs( dot( n, V ) );
  float fwf = max( fwidth( face ), 1e-5 );
  float zoom = clamp( 0.006 / px, 0.45, 1.4 );
  float shadeSide = 1.0 - smoothstep( uSplit - 0.15, uSplit + 0.05, lam );
  float under = smoothstep( 0.05, -0.6, dot( n, normalize( inkRW ) ) );
  float swell = inkN2( vec2( dot( q, vec3( 23.0, 17.0, 29.0 ) ), 3.0 + uKind ) );
  float weight = uLine * zoom * mix( 1.0, 4.2, max( shadeSide, 0.75 * under ) ) * ( 0.6 + 0.8 * swell );
  // a hand or an ear is small: the same brush would swallow it
  weight *= uKind < 0.5 && inkRA.z < 0.5 ? 0.55 : 1.0;
  float contour = 1.0 - inkPixel( face - weight * fwf, fwf );
  float lift = smoothstep( 0.32, 0.6, inkN2( vec2( dot( q, vec3( 41.0, 37.0, 31.0 ) ), 9.0 + uKind ) ) );
  // in the light the brush all but lifts: the post's own line takes the cuts
  // where one form passes in front of another
  contour *= mix( lift * 0.45, 1.0, shadeSide ) * step( 0.001, uLine );
  float rimW = zoom * mix( 3.0, 7.0, inkN2( vec2( dot( q, vec3( 13.0, 19.0, 11.0 ) ), 5.0 ) ) );
  // paper is left along a lit edge where the wash is light enough to leave
  // it; on the dark shorts, shoes and cap the edge only catches a little
  float paper = lit * smoothstep( 0.05, 0.35, lam ) * ( 1.0 - inkPixel( face - rimW * fwf, fwf ) ) * ( 1.0 - contour );
  paper *= mix( 0.2, 1.0, smoothstep( 0.2, 0.5, dot( wl, vec3( 0.3, 0.59, 0.11 ) ) ) );
  col = mix( col, mix( col, uPaper, 0.8 ), paper );
  col = mix( col, mix( uInk, ws, 0.2 ), contour * 0.8 );
  diffuseColor.rgb = col;
}
`;

// runner.look 2, the sculpted figure (runner.js): one program for all of
// him. The body (uKind 0) is skin, singlet, shorts and sock by its `aFig`
// (how far inside each, in metres); the head (1) is skin, beard, hair and cap
// by its; a hand (2) is skin; a shoe (3) the upper, midsole, outsole and
// laces by height in the foot's frame. Washes A–D are those parts', in that
// order. The light is the house's: two washes split on a wandering line from
// the scene's own sun, a third where the form shuts itself in (aFig.x) or the
// brim's shade falls (the sun, turned into the head's frame, meets the
// plate), each wash's edge dried darker, paper left along a lit edge and a
// brush contour heavy on the shadow side; the small things are drawn only
// close to. The head is lit as one form of a few planes, so face, beard and
// hair share one shadow shape; only the cap and the ears keep planes of
// their own, and the nose is drawn, not shaded. The cloth folds with his
// stride (uPose: the torso's twist over the hips, each thigh's swing, the
// stride's phase).
const fg = (v) => Number(v).toFixed(5);
const fv3 = (a, i = 0) => `vec3( ${fg(a[i])}, ${fg(a[i + 1])}, ${fg(a[i + 2])} )`;
const [BRIM_Z0, BRIM_Y0, BRIM_TILT, BRIM_CURVE, , BRIM_AX, BRIM_OZ, BRIM_AZ] = FIGURE.brim.map(fg);

const RUNNER3_VERT_HEAD = /* glsl */ `
attribute vec4 aFig;
attribute vec3 aSoft;
uniform vec3 uSunDir;
varying vec3 inkRW;
varying vec3 inkRN;
varying vec3 inkRM;
varying vec3 inkRO;
varying vec3 inkRP;
varying vec3 inkRS;
varying vec4 inkRF;
`;

const RUNNER3_VERT_BODY = /* glsl */ `
{
  vec4 inkWP = modelMatrix * vec4( transformed, 1.0 );
  inkRW = inkWP.xyz;
  inkRP = position;
  inkRF = aFig;
  // the sun in the piece's own frame (a rigid piece's: the head's, a shoe's)
  inkRS = normalize( uSunDir * mat3( modelMatrix ) );
  // the form's masses alone (runner.js softNormals), carried by the skin
  vec3 inkSoft = aSoft;
#ifdef USE_SKINNING
  inkSoft = ( skinMatrix * vec4( aSoft, 0.0 ) ).xyz;
  inkRN = normalize( mat3( modelMatrix ) * objectNormal );
#else
  inkRN = normalize( mat3( modelMatrix ) * normal );
#endif
  inkRM = normalize( mat3( modelMatrix ) * inkSoft );
  inkRO = aSoft;
}
`;

const RUNNER3_FRAG_HEAD = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uLitA;
uniform vec3 uShadeA;
uniform vec3 uLitB;
uniform vec3 uShadeB;
uniform vec3 uLitC;
uniform vec3 uShadeC;
uniform vec3 uLitD;
uniform vec3 uShadeD;
uniform vec3 uInk;
uniform vec3 uPaper;
uniform float uRag;
uniform float uSplit;
uniform float uGrain;
uniform float uKind;
uniform float uLine;
uniform vec4 uPose;
varying vec3 inkRW;
varying vec3 inkRN;
varying vec3 inkRM;
varying vec3 inkRO;
varying vec3 inkRP;
varying vec3 inkRS;
varying vec4 inkRF;
${NOISE}
${INK_STROKE}
// a field's own line where it crosses nought, about w wide
float inkEdge( float v, float w ){ return 1.0 - smoothstep( 0.0, w, abs( v ) ); }
// the cap's band round the head, th from his front (runner.js HEAD2.band)
float inkBand( float th ){ return ${fg(FIGURE.band[0])} + ${fg(FIGURE.band[1])} * pow( 0.5 + 0.5 * cos( th ), ${fg(FIGURE.band[2])} ); }
// the shoe's sole under z: flat between the rocker's arcs (runner.js SHOE2)
float inkSole( float z ){
  float h = ${fg(FIGURE.rocker[0])}, rh = ${fg(FIGURE.rocker[1])}, t = ${fg(FIGURE.rocker[2])}, rt = ${fg(FIGURE.rocker[3])};
  if ( z < h ) return ${fg(FIGURE.sole[0])} + rh - sqrt( max( 0.0, rh * rh - ( z - h ) * ( z - h ) ) );
  if ( z > t ) return ${fg(FIGURE.sole[0])} + rt - sqrt( max( 0.0, rt * rt - ( z - t ) * ( z - t ) ) );
  return ${fg(FIGURE.sole[0])};
}
`;

const RUNNER3_FRAG = /* glsl */ `
{
  vec3 V = normalize( cameraPosition - inkRW );
  vec3 p = inkRP;
  // metres of him in a pixel: the small things are drawn only close to
  float px = max( length( fwidth( p ) ), 1e-5 );
  float near = smoothstep( 0.012, 0.004, px );
  float close = smoothstep( 0.006, 0.0025, px );
  float aa = max( px, 0.0004 );
  // from across the field he is his broad masses, his anatomy only close to,
  // and on the body only half of it, so a limb's light stays one taper
  vec3 n = normalize( mix( normalize( inkRM ), normalize( inkRN ), smoothstep( 0.012, 0.005, px ) * ( uKind < 0.5 ? 0.5 : 1.0 ) ) );
  float lam = dot( n, uSunDir );
  float rag = ( inkF3( p * 2.4 + 3.1 * uKind ) - 0.5 ) * 2.0;
  float tooth = inkN3( p * 13.0 + 1.7 * uKind ) - 0.5;
  float wb = 0.0, wc = 0.0, wd = 0.0, seam = 0.0, fold = 0.0, mark = 0.0, pool = 0.0, shut = 0.0, iris = 0.0, glint = 0.0, sheen = 0.0;
  // how far the contour and the paper follow the fine form close to (the
  // face draws by its masses alone), and a part whose line takes its side
  // from its own planes rather than the light it is painted by (the nose)
  float edges = 1.0, lineOwn = 0.0;
  // a part may lie deeper in the shade than the piece's own split, and
  // granulate more (the hair and the beard)
  float split = uSplit, grain = uGrain, lineK = 1.0;
  // where the form shuts itself in (a crease is too small to see from afar)
  float occ = smoothstep( 0.3, 0.6, inkRF.x ) * mix( 0.4, 1.0, near );
  if ( uKind < 0.5 ) {
    // the body: the cloth by how far inside it each point is, wavering a
    // little where it was cut
    float sg = inkRF.y + 0.003 * ( inkN2( vec2( atan( p.x, p.z ) * 7.0, p.y * 40.0 ) ) - 0.5 );
    float sh = inkRF.z + 0.0025 * ( inkN2( vec2( p.x * 50.0 + p.z * 35.0, p.y * 40.0 + 5.0 ) ) - 0.5 );
    float so = inkRF.w;
    wb = inkPixel( sg, fwidth( sg ) + 1e-5 );
    wc = inkPixel( sh, fwidth( sh ) + 1e-5 ) * ( 1.0 - wb );
    wd = inkPixel( so, fwidth( so ) + 1e-5 ) * ( 1.0 - wb ) * ( 1.0 - wc );
    // a hem where each stops, and the cloth's shade on the skin just out of it
    float ew = 0.0022 + 0.6 * aa;
    seam = max( inkEdge( sg, ew ), inkEdge( sh, ew ) * ( 1.0 - wb ) );
    seam = max( seam, inkEdge( so, ew ) * ( 1.0 - wb ) * ( 1.0 - wc ) * 0.55 ) * ( 0.35 + 0.65 * near );
    occ = max( occ, ( 1.0 - smoothstep( 0.002, 0.02, -sh ) ) * step( sh, 0.0 ) * step( p.y, 0.9 ) * ( 1.0 - wb ) );
    // the armpit, where the arm folds against the chest as it comes down:
    // one recess in the shade of its masses, never drawn as a crease
    float pit = 1.0 - smoothstep( 0.6, 1.0, length( vec2( ( abs( p.x ) - 0.17 ) / 0.045, ( p.y - 1.37 ) / 0.055 ) ) );
    n = normalize( mix( n, normalize( inkRM ), pit ) );
    lam = dot( n, uSunDir );
    edges = 1.0 - pit;
    occ *= 1.0 - 0.6 * pit;
    // the singlet wrung by the torso's twist over the hips and gathered at
    // its sides; the shorts creased across the front of the hip as the thigh
    // comes through, and under the seat as it goes back
    float tw = clamp( uPose.x / 0.3, -1.0, 1.0 );
    float front = smoothstep( -0.03, 0.05, p.z );
    vec2 q = vec2( p.x * ( 2.0 * front - 1.0 ), p.y );
    vec2 sd = vec2( abs( p.x ), p.y );
    float f = inkStroke( q, vec2( -0.11 * tw, 1.0 ), vec2( 0.07 * tw, 1.21 ), 0.012, 0.0045, aa ) * abs( tw );
    f = max( f, inkStroke( q, vec2( -0.05 * tw, 1.0 ), vec2( 0.11 * tw, 1.15 ), -0.01, 0.0035, aa ) * abs( tw ) * 0.8 );
    f = max( f, inkStroke( sd, vec2( 0.15, 1.27 ), vec2( 0.142, 1.1 ), 0.01, 0.004, aa ) * smoothstep( 0.11, 0.14, sd.x ) );
    f = max( f, inkStroke( sd, vec2( 0.06, 1.24 ), vec2( 0.078, 1.0 ), 0.006, 0.003, aa ) * front * 0.55 );
    float flex = p.x < 0.0 ? uPose.y : uPose.z;
    float g = inkStroke( sd, vec2( 0.04, 0.875 ), vec2( 0.145, 0.95 ), -0.01, 0.0045, aa ) * front * smoothstep( 0.25, 0.75, flex );
    g = max( g, inkStroke( sd, vec2( 0.03, 0.865 ), vec2( 0.13, 0.885 ), 0.008, 0.004, aa ) * ( 1.0 - front ) * smoothstep( -0.02, -0.3, flex ) );
    fold = max( f * wb, g * wc ) * ( 0.45 + 0.55 * near );
    // one broad wash over the singlet, deeper where it ran down to the hem
    pool = inkPixel( 1.17 - p.y + 0.07 * ( inkF2( vec2( p.x * 5.0, p.z * 5.0 + 3.0 ) ) - 0.5 ), 0.012 ) * wb;
  } else if ( uKind < 1.5 ) {
    // the head: skin, beard, hair and cap by which is nearest; the strap's
    // opening at the back of the cap shows the hair through it; the hair and
    // the beard stop in short strands, not a cut line
    float strand = inkN2( vec2( atan( p.x, p.z ) * 90.0, p.y * 40.0 ) ) - 0.5;
    float bd = inkRF.y + 0.0015 * strand, hr = inkRF.z + 0.003 * strand, cp = inkRF.w;
    wb = inkPixel( bd, fwidth( bd ) + 1e-5 );
    wc = inkPixel( hr, fwidth( hr ) + 1e-5 ) * ( 1.0 - wb );
    wd = inkPixel( cp, fwidth( cp ) + 1e-5 ) * ( 1.0 - wb ) * ( 1.0 - wc );
    float th = atan( abs( p.x ), p.z );
    float skin = ( 1.0 - wb ) * ( 1.0 - wc ) * ( 1.0 - wd );
    float ew = 0.0018 + 0.6 * aa;
    seam = max( inkEdge( cp, ew ), max( inkEdge( bd, ew ), inkEdge( hr, ew ) ) * 0.45 );
    // the cap's six panels, from the button down to the band, and the rows
    // of stitching round the brim
    vec3 c = p - ${fv3(FIGURE.crown)};
    float cr = length( c / ${fv3(FIGURE.crown, 3)} );
    float panel = abs( sin( 3.0 * atan( c.x, c.z ) ) ) * length( c.xz );
    seam = max( seam, ( 1.0 - smoothstep( 0.0011 - aa, 0.0011 + aa, panel ) ) * wd * step( cr, 1.03 ) * step( inkBand( th ) + 0.012, p.y ) * near );
    float be = length( vec2( p.x / ${BRIM_AX}, ( p.z - ${BRIM_OZ} ) / ${BRIM_AZ} ) );
    seam = max( seam, max( inkEdge( be - 0.93, 0.008 ), inkEdge( be - 0.87, 0.008 ) ) * wd * step( 1.04, cr ) * near * 0.6 );
    // the brim's top a shade lighter than the crown, so from the front it
    // reads as a brim and not a helmet
    float ym = ${BRIM_Y0} - ${BRIM_TILT} * ( p.z - ${BRIM_Z0} ) - ${BRIM_CURVE} * p.x * p.x;
    sheen = step( 1.04, cr ) * step( ym, p.y ) * wd;
    // the head is lit as one form of a few planes (its broad masses squared
    // toward its own front, sides, top and underside), so its shadow is one
    // shape down the side of the face that runs on into the beard's and the
    // hair's, whose locks break its edge; close to, half the face's own
    // modelling bends that edge round the brow, the cheekbone and the jaw.
    // Only the cap and the ears keep planes of their own; the nose is drawn
    // by its own contour, not shaded.
    vec3 s = normalize( inkRS );
    vec3 m = normalize( inkRO );
    vec3 pl = normalize( sign( m ) * pow( abs( m ), vec3( 2.0 ) ) );
    float locks = ( inkN2( vec2( atan( p.x, p.z ) * 28.0, p.y * 7.0 ) ) - 0.5 ) * ( wb + wc );
    float inFace = smoothstep( 0.03, 0.07, p.z ) * skin;
    float nose = ( 1.0 - smoothstep( 0.014, 0.022, abs( p.x ) ) ) * smoothstep( 0.114, 0.12, p.y ) * ( 1.0 - smoothstep( 0.152, 0.162, p.y ) ) * smoothstep( 0.094, 0.1, p.z ) * skin;
    float ear = smoothstep( 0.066, 0.074, abs( p.x ) ) * ( 1.0 - smoothstep( 0.024, 0.034, abs( p.y - ${fg(FIGURE.ear[1])} ) ) ) * ( 1.0 - smoothstep( 0.016, 0.026, abs( p.z - ${fg(FIGURE.ear[2])} ) ) ) * skin;
    float own = max( wd, ear );
    float detail = ( dot( normalize( inkRN ), uSunDir ) - dot( normalize( inkRM ), uSunDir ) ) * inFace * ( 1.0 - nose ) * close;
    n = normalize( mix( normalize( inkRM ), n, own ) );
    lam = mix( dot( pl, s ) + 0.22 * locks + 0.8 * detail, dot( n, uSunDir ), own );
    // the nose is drawn only where the face is big enough to carry it
    float noseNear = smoothstep( 0.004, 0.0015, px );
    edges = max( own, nose * noseNear );
    lineOwn = nose * noseNear;
    occ *= 1.0 - 0.9 * inFace;
    // the cap's edge shades the hair and the brow just under it
    occ = max( occ, ( 1.0 - smoothstep( 0.002, 0.012, -cp ) ) * step( cp, 0.0 ) );
    // the brim's shade: the sun's ray from here meets the plate (its curve
    // down at the sides read where the ray first meets it flat)
    float den = s.y + ${BRIM_TILT} * s.z;
    float t = ( ${BRIM_Y0} - ${BRIM_TILT} * ( p.z - ${BRIM_Z0} ) - p.y ) / ( abs( den ) > 1e-3 ? den : 1e-3 );
    vec3 h = p + s * t;
    t -= ${BRIM_CURVE} * h.x * h.x / ( abs( den ) > 1e-3 ? den : 1e-3 );
    h = p + s * t;
    float he = length( vec2( h.x / ${BRIM_AX}, ( h.z - ${BRIM_OZ} ) / ${BRIM_AZ} ) );
    float hc = length( ( h - ${fv3(FIGURE.crown)} ) / ${fv3(FIGURE.crown, 3)} );
    shut = step( 0.0, t ) * step( 1.0, hc ) * inkPixel( 1.0 - he + 0.05 * ( inkN2( h.xz * 120.0 ) - 0.5 ), 0.02 ) * ( 1.0 - wd );
    // a face that reads from the front: under each brow an upper lid drawn
    // over a dark iris that holds a catch of light, the lower lid a breath;
    // the brows a stroke of the beard's colour; under the moustache a short
    // break for the mouth over the lower lip
    float fr = smoothstep( 0.06, 0.08, p.z ) * skin * close;
    vec2 fx = vec2( abs( p.x ), p.y );
    float ex = ${fg(FIGURE.eye[0])}, ey = ${fg(FIGURE.eye[1])};
    float u = clamp( ( fx.x - ex + 0.0115 ) / 0.023, 0.0, 1.0 );
    float lidY = ey - 0.0008 + 0.001 * u + 0.0128 * u * ( 1.0 - u );
    float lid = inkStroke( fx, vec2( ex - 0.0115, ey - 0.0008 ), vec2( ex + 0.0115, ey + 0.0002 ), 0.0032, 0.0014 + 0.3 * aa, aa );
    float low = inkStroke( fx, vec2( ex - 0.009, ey - 0.0058 ), vec2( ex + 0.0095, ey - 0.005 ), -0.0012, 0.0006 + 0.3 * aa, aa );
    vec2 ic = vec2( sign( p.x ) * ( ex + 0.0004 ), ey - 0.0007 );
    iris = ( 1.0 - smoothstep( 0.0042 - aa, 0.0042 + aa, length( p.xy - ic ) ) ) * smoothstep( lidY + aa, lidY - aa, fx.y ) * fr;
    glint = ( 1.0 - smoothstep( 0.0009 - aa, 0.0009 + aa, length( p.xy - ic - vec2( -0.0013, 0.0013 ) ) ) ) * iris;
    float brow = inkStroke( fx, vec2( ex - 0.016, ey + 0.0125 ), vec2( ex + 0.019, ey + 0.0165 ), 0.0028, 0.0027 + 0.3 * aa, aa );
    mark = max( lid, low * 0.35 ) * fr;
    wb = max( wb, brow * fr );
    float fm = smoothstep( 0.07, 0.09, p.z ) * close * ( 1.0 - wd );
    float lip = ( 1.0 - smoothstep( 0.75, 1.0, length( vec2( p.x / 0.0095, ( p.y - 0.0898 ) / 0.0032 ) ) ) ) * fm;
    wb *= 1.0 - lip;
    shut = max( shut, lip );
    mark = max( mark, inkStroke( p.xy, vec2( -0.0165, 0.0948 ), vec2( 0.0165, 0.0948 ), 0.0006, 0.0011 + 0.3 * aa, aa ) * fm );
    // the nostrils, darker on the side turned from the sun
    float away = smoothstep( -0.2, 0.3, -sign( p.x ) * s.x );
    float nb = inkStroke( fx, vec2( 0.0025, 0.1212 ), vec2( 0.0128, 0.1228 ), -0.0012, 0.0008 + 0.3 * aa, aa );
    mark = max( mark, nb * mix( 0.5, 1.0, away ) * fr * noseNear );
    lineK = mix( mix( 1.0, 0.25, inFace ), 0.6, nose ) * ( 1.0 - 0.4 * wb );
    // the ear's rim
    float ee = length( vec2( ( p.y - ${fg(FIGURE.ear[1])} ) / 0.031, ( p.z - ${fg(FIGURE.ear[2])} ) / 0.02 ) );
    seam = max( seam, inkEdge( ee - 0.7, 0.1 ) * step( 0.074, abs( p.x ) ) * skin * near * 0.35 );
    seam *= 0.4 + 0.6 * near;
    // the beard combed down in a few short strands, the hair the same
    fold = smoothstep( 0.72, 0.9, inkN2( vec2( atan( p.x, p.z - 0.02 ) * 30.0, p.y * 26.0 ) ) ) * wb * near * 0.25;
    fold = max( fold, smoothstep( 0.72, 0.88, inkN2( vec2( atan( p.x, p.z ) * 70.0, p.y * 14.0 ) ) ) * wc * near * 0.22 );
    // hair is darker turned from the light than skin, and settles in the tooth
    split += 0.06 * ( wb + wc ) * ( 1.0 - wd );
    grain += 0.09 * ( wb + wc ) * ( 1.0 - wd );
  } else if ( uKind < 2.5 ) {
    // a hand: the gaps between the curled fingers
    float gap = min( min( abs( p.x + 0.0145 ), abs( p.x ) ), abs( p.x - 0.0145 ) );
    seam = inkEdge( gap, 0.0008 + 0.5 * aa ) * step( 0.074, p.z ) * step( p.y, 0.002 ) * near * 0.7;
  } else {
    // a shoe: a dark outsole, a pale midsole up to its sprung toe, the upper,
    // and laces across the instep
    float hgt = p.y - inkSole( p.z );
    float mid = mix( ${fg(FIGURE.sole[1])}, ${fg(FIGURE.sole[2])}, smoothstep( -0.02, 0.12, p.z ) );
    wc = inkPixel( 0.005 - hgt, fwidth( hgt ) + 1e-5 );
    wb = inkPixel( mid + 0.002 - hgt, fwidth( hgt ) + 1e-5 ) * ( 1.0 - wc );
    seam = inkEdge( hgt - mid - 0.002, 0.0015 + 0.5 * aa ) * near;
    float lace = 0.0;
    for ( int i = 0; i < 4; i++ ) {
      float z0 = 0.03 + 0.016 * float( i );
      lace = max( lace, inkStroke( p.xz, vec2( -0.015, z0 ), vec2( 0.015, z0 + 0.005 ), 0.002, 0.0022 + 0.3 * aa, aa ) );
    }
    wd = lace * step( -0.03, p.y ) * ( 1.0 - wb ) * ( 1.0 - wc ) * near;
  }
#ifdef INK_TATTOO
  // the sleeve's own line round each island of skin (inkSleeveFull)
  mark = max( mark, inkTat );
#endif
  float l = lam + rag * uRag + tooth * uRag * 0.35;
  float lit = inkPixel( l - split, max( fwidth( lam ), 0.012 ) );
  float o = inkPixel( occ + tooth * 0.35 - 0.5, fwidth( occ ) + 0.02 );
  float sunlit = lit;
  lit *= ( 1.0 - o ) * ( 1.0 - shut );
  vec3 wl = mix( mix( mix( uLitA, uLitB, wb ), uLitC, wc ), uLitD, wd );
  vec3 ws = mix( mix( mix( uShadeA, uShadeB, wb ), uShadeC, wc ), uShadeD, wd );
  vec3 col = mix( ws, wl, lit );
  // the deepest value: shut in, and turned from the light as well
  col = mix( col, mix( ws, uInk, 0.2 ), o * ( 1.0 - sunlit ) * 0.55 );
  col = mix( col, mix( col, ws, 0.35 ), pool );
  col = mix( col, mix( col, uPaper, 0.3 ), sheen * mix( 0.45, 1.0, lit ) );
  float dried = ( 1.0 - smoothstep( 0.0, 0.035, abs( l - split ) ) ) * ( 1.0 - sunlit );
  col = mix( col, mix( ws, uInk, 0.35 ), dried * 0.5 );
  col = mix( col, mix( ws, uInk, 0.12 + 0.3 * ( 1.0 - lit ) ), fold * mix( 0.3, 1.0, near ) );
  col = mix( col, mix( ws, uInk, 0.5 ), seam * mix( 0.4, 1.0, near ) * 0.85 );
  col = mix( col, uInk, mark * 0.9 );
  col = mix( col, mix( uInk, uShadeB, 0.4 ), iris * 0.92 );
  col = mix( col, uPaper, glint * 0.85 );
  float gr = inkN2( gl_FragCoord.xy * 0.7 ) * 0.6 + inkN2( gl_FragCoord.xy * 2.1 ) * 0.4;
  col *= 1.0 - grain * ( 0.4 + 0.6 * ( 1.0 - lit ) ) * smoothstep( 0.4, 0.9, gr );
  // the contour: a brush line, heavy on the shadow side and under a form,
  // thin and lifted in the light, where paper is left along the edge instead;
  // it finds the true edge, but from afar only where a mass turns away
  float face = abs( dot( normalize( inkRN ), V ) );
  float masses = mix( smoothstep( 0.55, 0.25, abs( dot( normalize( inkRM ), V ) ) ), 1.0, near * edges );
  float fwf = max( fwidth( face ), 1e-5 );
  float zoom = clamp( 0.006 / px, 0.45, 1.4 );
  float lamL = mix( lam, dot( normalize( inkRN ), uSunDir ), lineOwn );
  float shadeSide = 1.0 - smoothstep( split - 0.15, split + 0.05, lamL );
  float under = smoothstep( 0.05, -0.6, dot( n, normalize( inkRW ) ) );
  float swell = inkN2( vec2( dot( p, vec3( 23.0, 17.0, 29.0 ) ), 3.0 + uKind ) );
  float weight = uLine * lineK * zoom * mix( 1.0, 4.2, max( shadeSide, 0.75 * under ) ) * ( 0.6 + 0.8 * swell );
  float contour = ( 1.0 - inkPixel( face - weight * fwf, fwf ) ) * masses;
  float lift = smoothstep( 0.32, 0.6, inkN2( vec2( dot( p, vec3( 41.0, 37.0, 31.0 ) ), 9.0 + uKind ) ) );
  contour *= mix( lift * 0.45, 1.0, shadeSide ) * step( 0.001, uLine );
  float rimW = zoom * mix( 3.0, 7.0, inkN2( vec2( dot( p, vec3( 13.0, 19.0, 11.0 ) ), 5.0 ) ) );
  float paper = lit * smoothstep( 0.05, 0.35, lamL ) * ( 1.0 - inkPixel( face - rimW * fwf, fwf ) ) * ( 1.0 - contour ) * masses;
  paper *= mix( 0.2, 1.0, smoothstep( 0.2, 0.5, dot( wl, vec3( 0.3, 0.59, 0.11 ) ) ) );
  col = mix( col, mix( col, uPaper, 0.8 ), paper );
  col = mix( col, mix( uInk, ws, 0.2 ), contour * 0.8 );
  diffuseColor.rgb = col;
}
`;

/* ---------------------------------------------------------------- helpers */

function sunOf(T, uniforms) {
  return (uniforms && uniforms.uSunDir) || { value: new T.Vector3(0.79, 0.6, 0.05) };
}

// The tangent frame base.js will put the feature in, so a ground wash written
// in world terms can be folded back into the object's own local space.
function featureFrame(T, features, dir) {
  const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), dir);
  const P = dir.clone().multiplyScalar(R + features.heightAt(dir));
  return { q, P, qi: q.clone().invert() };
}

// Where a point of the feature's own frame lands on the planet, and how far it
// sits above the ground there. Everything placed off the feature's centre — a
// stone, a tree, the treadmill's own feet — is set down with this, because the
// ground is a curved, uneven thing and the tangent plane is not.
function onGround(features, frame, local) {
  const v = local.clone().applyQuaternion(frame.q).add(frame.P);
  const d = v.clone().normalize();
  const h = features.heightAt(d);
  return {
    dir: d,                                                        // the ground's own normal there
    above: v.length() - (R + h),                                   // how far the point floats
    pos: d.clone().multiplyScalar(R + h).sub(frame.P).applyQuaternion(frame.qi),
  };
}

// The ground's own normal, in the feature's frame: what a built thing stands on.
function groundTilt(T, features, frame, span) {
  const h = (x, z) => features.heightAt(
    new T.Vector3(x, 0, z).applyQuaternion(frame.q).add(frame.P).normalize(),
  );
  const gx = (h(span, 0) - h(-span, 0)) / (2 * span);
  const gz = (h(0, span) - h(0, -span)) / (2 * span);
  return new T.Vector3(-gx, 1, -gz).normalize();
}

// A wash laid on the ground: a fan running away from a mass (a cast shadow), or
// a pool centred on one (u0 = -1, flare = 0). Every vertex is put back down on
// the terrain, a hand's breadth apart — near the ground's own spacing — so the
// wash keeps to a curved, uneven ground instead of cutting through it.
function groundWash(T, features, {
  frame, len, wide, mat, lift = 0.02, cell = 0.35, away = null, side = null, origin = null, u0 = 0, flare = 0.85,
}) {
  const { q, qi, P } = frame;
  const a = away ? away.clone() : new T.Vector3(1, 0, 0);
  const b = side ? side.clone() : new T.Vector3(0, 0, 1);
  const steps = Math.max(4, Math.ceil((len * (1 - u0)) / cell));
  const lanes = Math.max(4, Math.ceil((2 * wide * (flare ? 0.5 + flare : 1)) / cell));
  const pos = new Float32Array((steps + 1) * (lanes + 1) * 3);
  const ap = new Float32Array((steps + 1) * (lanes + 1) * 2);
  const idx = [];
  const p = new T.Vector3();
  const d = new T.Vector3();
  let k = 0;
  for (let i = 0; i <= steps; i++) {
    const u = u0 + (1 - u0) * (i / steps);
    const w = flare ? wide * (0.5 + flare * u) : wide;
    for (let j = 0; j <= lanes; j++) {
      const v = (j / lanes) * 2 - 1;
      p.copy(a).multiplyScalar(u * len).addScaledVector(b, v * w);
      if (origin) p.add(origin);
      d.copy(p).applyQuaternion(q).add(P).normalize();
      p.copy(d).multiplyScalar(R + features.heightAt(d) + lift).sub(P).applyQuaternion(qi);
      pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
      ap[k * 2] = u; ap[k * 2 + 1] = v;
      k++;
      if (i > 0 && j > 0) {
        const o = (i - 1) * (lanes + 1) + (j - 1);
        idx.push(o, o + 1, o + lanes + 1, o + 1, o + lanes + 2, o + lanes + 1);
      }
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  geo.setAttribute('aP', new T.BufferAttribute(ap, 2));
  geo.setIndex(idx);
  const m = new T.Mesh(geo, mat);
  m.frustumCulled = false;
  // pigment on the ground, not a mass: nothing a camera could walk into
  m.userData.groundWash = true;
  return m;
}

// The shadows and pools share one pigment with the runner's and the land's
// (ink.js): the cool slate, at one flat strength, its rim dried darker. A
// pine's shadow draws the pine itself (frag, with the pine's own uniforms).
function shadowMaterial(T, pal, {
  alpha = 0.4, centre = 0, stretch = 1, seed = 0, ink = MIX(pal.shadeCool, pal.ink, 0.45), frag = SHADOW_FRAG, extra = null,
}) {
  return new T.ShaderMaterial({
    uniforms: {
      uInk: { value: ink },
      uAlpha: { value: alpha },
      uCentre: { value: centre },
      uStretch: { value: stretch },
      uSeed: { value: seed },
      ...extra,
    },
    vertexShader: SHADOW_VERT,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide, // the grid's winding depends on the shadow direction
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -8,
  });
}

// A cast shadow: one flat wash attached at the foot, running away from the sun.
function castShadow(T, features, { dir, frame, len, wide, uniforms, pal, seed = 0, origin = null, mat = null, flare = 0.85 }) {
  const sun = sunOf(T, uniforms).value;
  const flat = sun.clone().addScaledVector(dir, -sun.dot(dir));
  if (flat.lengthSq() < 1e-5) return null; // sun overhead: nothing to cast
  const away = flat.normalize().negate().applyQuaternion(frame.qi); // falls away from the light
  const side = new T.Vector3().crossVectors(new T.Vector3(0, 1, 0), away).normalize();
  mat = mat || shadowMaterial(T, pal, { centre: 0.4, stretch: 1.25, seed });
  return groundWash(T, features, { frame, len, wide, mat, away, side, origin, flare });
}

// A painted plane for a built thing: the geometry's own box tells the shader
// where its faces end, so paper can be left along their edges and the sky can
// be laid over the top of it. Exported for a world's companions, which are
// drawn in the same hand as the week's own objects.
export function washMaterial(T, uniforms, pal, geo, {
  lit, shade, ink = pal.ink, paper = pal.paper, sky = null, rag = 0.09, grain = 1, inkLine = 0.55, top = 0.8, seed = 0,
  skyTop = 0, dry = 0, margin = 0, litEdge = 0, base = 0,
}) {
  if (geo && !geo.boundingBox) geo.computeBoundingBox();
  const bb = geo && geo.boundingBox;
  return new T.ShaderMaterial({
    uniforms: {
      uSunDir: sunOf(T, uniforms),
      uLit: { value: lit },
      uShade: { value: shade },
      uInk: { value: ink.clone() },
      uPaper: { value: paper.clone() },
      uSky: { value: sky ? sky.clone() : MIX(lit, paper, 0.5) },
      uBoxMin: { value: bb ? bb.min.clone() : new T.Vector3(-1, -1, -1) },
      uBoxMax: { value: bb ? bb.max.clone() : new T.Vector3(1, 1, 1) },
      uRag: { value: rag },
      uGrain: { value: grain },
      uInkLine: { value: inkLine },
      uTop: { value: top },
      uSeed: { value: seed },
      uSkyTop: { value: skyTop },
      uDry: { value: dry },
      uMargin: { value: margin },
      uLitEdge: { value: litEdge },
      uBase: { value: base },
    },
    vertexShader: WASH_VERT,
    fragmentShader: WASH_FRAG,
  });
}

function mesh(T, geo, mat, x = 0, y = 0, z = 0) {
  const m = new T.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

// A stone: a low boulder laid on the ground it stands on — never on the
// feature's flat plane, or it floats at one end and sinks at the other. It is
// knocked about into facets, so its light and shade are planes, each one wash,
// and the pigment pools dark where it meets the ground.
function stone(T, features, frame, pal, {
  x = 0, z = 0, r = 0.4, flat = 0.55, sink = 0.06, seed = 0, uniforms, rng,
}) {
  const seat = onGround(features, frame, new T.Vector3(x, 0, z));
  const geo = new T.IcosahedronGeometry(r, 0);
  // the same corner gets the same knock, so the facets still close
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = Math.sin(p.getX(i) * 91.7 + p.getY(i) * 57.3 + p.getZ(i) * 33.1 + seed * 7.1) * 43758.5453;
    const s = 0.78 + 0.38 * (k - Math.floor(k));
    p.setXYZ(i, p.getX(i) * s, p.getY(i) * s, p.getZ(i) * s);
  }
  geo.scale(1.2, flat, 1.0);
  geo.computeVertexNormals();
  const mat = washMaterial(T, uniforms, pal, geo, {
    lit: MIX(MIX(pal.stone, pal.sepia, 0.34), pal.litWarm, 0.1),
    shade: MIX(pal.shadeCool, pal.ink, 0.38),
    rag: 0.22,
    grain: 1.3,
    inkLine: 0.7,
    top: 0.35,
    base: 0.75,
    seed,
  });
  const m = new T.Mesh(geo, mat);
  m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), seat.dir.clone().applyQuaternion(frame.qi));
  m.rotateY(rng ? rng() * 6.283 : 0);
  // its own axis, in the feature's frame: a stone sits with its base just in the
  // ground, so it has weight instead of hovering
  const up = new T.Vector3(0, 1, 0).applyQuaternion(m.quaternion);
  m.position.copy(seat.pos).addScaledVector(up, flat * r * 0.8 - sink);
  m.frustumCulled = false;
  return m;
}

/* --------------------------------------------------------------- objects -- */

// The monument: a standing stone on its base, painted as one dry-brush slab —
// a dark wash dragged down it so the hairs leave streaks, a paler wash over its
// upper part where it catches the sky, a clean strip of paper down the edge
// the light comes over and a ragged margin along the others, and the pigment
// pooled at its foot and bled out into the damp ground around it. Its shadow
// is thrown on the sand as a flat wash of its own.
function monument(T, { feature, features, uniforms, palette: pal, rng }) {
  const dir = feature.dir;
  const g = new T.Group();
  const frame = featureFrame(T, features, dir);
  const face = (geo, o, seed) => washMaterial(T, uniforms, pal, geo, {
    lit: MIX(pal.shadeCool, pal.ink, 0.45),
    shade: MIX(pal.ink, pal.shadeCool, 0.16),
    sky: MIX(pal.skyHigh, pal.shadeCool, 0.3),
    rag: 0.16,
    grain: 1.1,
    inkLine: 0.45,
    top: 0,
    seed,
    ...o,
  });

  // the base: a mass that comes up out of the ground rather than standing on
  // it, cut into a few rough planes
  const plinth = new T.CylinderGeometry(1.95, 2.45, 1.9, 7).toNonIndexed();
  plinth.computeVertexNormals();
  g.add(mesh(T, plinth, face(plinth, { dry: 0.55, base: 0.7, sky: MIX(pal.shadeCool, pal.farGlaze, 0.3) }, 0.7), 0, -0.53, 0));

  const slab = new T.BoxGeometry(1.25, 4.9, 0.52);
  const shaft = mesh(T, slab, face(slab, { skyTop: 1, dry: 0.9, margin: 0.03, litEdge: 0.075, base: 0.45 }, 2.3), 0, 2.75, 0);
  shaft.rotation.set(0.035, 0.25, -0.045);
  g.add(shaft);

  const capGeo = new T.BoxGeometry(1.42, 0.3, 0.66);
  const cap = mesh(T, capGeo, face(capGeo, { skyTop: 1, dry: 0.6, margin: 0.025, litEdge: 0.06 }, 4.1), 0, 5.16, 0);
  cap.rotation.y = 0.25;
  g.add(cap);

  // the race's own red, dragged down the face in two dry strokes
  const red = {
    lit: MIX(pal.vermilion, pal.paper, 0.12),
    shade: MIX(pal.vermilion, pal.ink, 0.4),
    sky: MIX(pal.vermilion, pal.paper, 0.45),
    rag: 0.12, inkLine: 0.3, dry: 1, margin: 0.015,
  };
  const bandGeo = new T.BoxGeometry(0.34, 3.6, 0.06);
  const band = mesh(T, bandGeo, face(bandGeo, red, 5.2), -0.3, 2.85, 0.28);
  band.rotation.set(0.035, 0.25, -0.045);
  g.add(band);
  const band2Geo = new T.BoxGeometry(0.16, 2.2, 0.06);
  const band2 = mesh(T, band2Geo, face(band2Geo, red, 6.4), 0.28, 2.6, 0.29);
  band2.rotation.set(0.035, 0.25, -0.045);
  g.add(band2);

  // the stones at its foot: seated on the ground, each in its own small wash
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4;
    g.add(stone(T, features, frame, pal, {
      x: Math.cos(a) * 2.75, z: Math.sin(a) * 2.75,
      r: 0.32 + rng() * 0.22, flat: 0.6, sink: 0.05,
      seed: 10 + i * 3.7, uniforms, rng,
    }));
  }
  for (let i = 0; i < 3; i++) {
    g.add(stone(T, features, frame, pal, {
      x: 1.9 + rng() * 0.7, z: -0.7 + i * 0.9,
      r: 0.42 + rng() * 0.16, flat: 0.52, sink: 0.06,
      seed: 40 + i * 2.9, uniforms, rng,
    }));
  }

  // the stone's own pigment, pooled on the ground round its foot
  const pool = shadowMaterial(T, pal, { alpha: 0.26, centre: 0, stretch: 1, seed: 7.7 });
  g.add(groundWash(T, features, { frame, len: 3.3, wide: 3.3, mat: pool, u0: -1, flare: 0 }));
  const cast = castShadow(T, features, { dir, frame, len: 5.4, wide: 1.5, uniforms, pal, seed: 3.1 });
  if (cast) g.add(cast);
  return g;
}

function treadmillMeasures(feature) {
  const active = Number(feature.stats?.activeS);
  const activeS = Number.isFinite(active) && active > 0 ? active : 3600;
  const living = P['living.treadmill'] > 0;
  const durationScale = living ? clamp(0.55 + 0.45 * Math.sqrt(activeS / 3600), 0.78, 1.4) : 1;
  const speed = Number(feature.stats?.avgSpeedMps);
  return {
    machineScale: P['kinds.constructed.scale'],
    beltLength: 1.62 * durationScale,
    deckLength: 1.9 * durationScale,
    beltSpeed: living && Number.isFinite(speed) && speed > 0 ? clamp(speed * 0.28, 0.35, 1.8) : 0,
  };
}

// The treadmill: the one built thing on the planet, set up the way a monument
// is — bigger than life, on a cut stone seat of its own — and the only place
// where the hand tightens up: hard-edged washes on ruled planes, paper at the
// lit edges. The seat is found, not forced: the flattest ground a few paces
// round the feature, turned to lie along the slope, so it is a low level slab
// cut into the hill rather than a wall hung off it; its pigment pools round its
// foot and it throws one long shadow. On it, a few bold masses: a slate deck
// with the pale belt laid along it, the motor's hood at the front, two uprights
// leaning back to the console, and a rail down each side to hold. The machine
// is the slate and ink of the drawing, so it stands off the ochre ground and
// against the sky; only the belt and the console's face take the paper.
function constructed(T, { feature, features, uniforms, palette: pal }) {
  const dir = feature.dir;
  const g = new T.Group();
  const frame = featureFrame(T, features, dir);
  const rig = new T.Group();
  const machine = new T.Group();
  const { machineScale, beltLength, deckLength, beltSpeed } = treadmillMeasures(feature);
  machine.scale.setScalar(machineScale);                          // bigger than life
  rig.add(machine);
  g.add(rig);
  const part = (geo, o, seed, x = 0, y = 0, z = 0, to = machine) => {
    const m = mesh(T, geo, washMaterial(T, uniforms, pal, geo, {
      lit: MIX(pal.shadeCool, pal.ink, 0.3),
      shade: MIX(pal.ink, pal.shadeCool, 0.12),
      sky: MIX(pal.shadeCool, pal.paper, 0.35),
      rag: 0.06,
      grain: 0.85,
      inkLine: 0.45,
      top: 0.3,
      seed,
      ...o,
    }), x, y, z);
    to.add(m);
    return m;
  };
  const dark = { lit: MIX(pal.ink, pal.inkSoft, 0.5), shade: pal.ink.clone(), top: 0.15, inkLine: 0.3 };
  const pale = { lit: MIX(pal.paper, pal.litWarm, 0.18), shade: MIX(pal.stone, pal.shadeCool, 0.5), top: 0, rag: 0.04, inkLine: 0.5 };

  // the seat: turned three-quarters to the side the sun and the visitor come
  // from, so it is read along its length and across its front at once; but a
  // level slab on a hillside is only as low as the ground under it is even, so
  // a few turns either side of that and every spot a few paces round are
  // measured under its corners, sides and middle, and the flattest wins, a
  // little against straying from the feature or from the three-quarter turn
  const sunL = sunOf(T, uniforms).value.clone().applyQuaternion(frame.qi);
  const face = Math.atan2(-sunL.z, sunL.x) + 0.55;
  const PX = 0.95;
  const PZ = P['living.treadmill'] > 0 ? deckLength * machineScale * 0.5 + 0.25 : 1.95;
  let seat = null;
  for (const r of [0, 1.5, 3]) {
    for (let a = 0; a < (r ? 8 : 1); a++) {
      const ox = r * Math.cos((a * Math.PI) / 4), oz = r * Math.sin((a * Math.PI) / 4);
      for (const k of [-1, 0, 1]) {
        const yaw = face + k * 0.45, c = Math.cos(yaw), s = Math.sin(yaw);
        let hi = -Infinity, lo = Infinity;
        for (const x of [-PX, 0, PX]) {
          for (const z of [-PZ, -PZ / 2, 0, PZ / 2, PZ]) {
            const h = -onGround(features, frame, new T.Vector3(ox + x * c + z * s, 0, oz - x * s + z * c)).above;
            hi = Math.max(hi, h);
            lo = Math.min(lo, h);
          }
        }
        const cost = hi - lo + 0.1 * Math.abs(k) + 0.12 * r;
        if (!seat || cost < seat.cost) seat = { cost, hi, lo, ox, oz, yaw };
      }
    }
  }
  rig.position.set(seat.ox, 0, seat.oz);
  rig.rotation.y = seat.yaw;
  // knee-high clear of level ground and of the sea; on a slope its top is kept
  // low and the hill above it is cut away, so it never stands as a wall
  const sea = features.seaLevel - features.heightAt(dir);
  const top = Math.max(Math.min(Math.max(seat.hi + 0.25, seat.lo + 0.8), seat.lo + 1.25), sea + 0.5);
  const foot = seat.lo - 0.35, die = top - 0.16;
  const padGeo = new T.BoxGeometry(2 * PX, die - foot, 2 * PZ);
  part(padGeo, {
    lit: MIX(pal.stone, pal.shadeCool, 0.22), shade: MIX(pal.shadeCool, pal.ink, 0.3), sky: MIX(pal.stone, pal.paper, 0.3),
    margin: 0.035, litEdge: 0.1, dry: 0.12, base: 0.6, top: 0.12, rag: 0.12, inkLine: 0.6,
  }, 0.4, 0, (die + foot) / 2, 0, rig);
  // its cap: a paler slab laid over it, a hand proud of its faces all round
  part(new T.BoxGeometry(2 * PX + 0.24, 0.24, 2 * PZ + 0.24), {
    lit: MIX(pal.stone, pal.paper, 0.35), shade: MIX(pal.shadeCool, pal.stone, 0.35),
    margin: 0.02, litEdge: 0.06, top: 0.3, rag: 0.08, inkLine: 0.6,
  }, 0.9, 0, top - 0.12, 0, rig);
  machine.position.y = top;

  // the deck, and its belt a pale band along the top with the deck's lit edge
  // left as paper under it; the hood over the motor at the front
  const livingTreadmill = P['living.treadmill'] > 0;
  const frontZ = livingTreadmill ? -deckLength * 0.5 + 0.15 : -0.8;
  const hoodZ = livingTreadmill ? frontZ + 0.02 : -0.78;
  const railZ = livingTreadmill ? frontZ + 0.3 : -0.5;
  const consoleZ = livingTreadmill ? frontZ + 0.14 : -0.66;
  part(new T.BoxGeometry(0.84, 0.2, deckLength), { margin: 0.012, litEdge: 0.035 }, 1.1, 0, 0.1, 0.05);
  part(new T.BoxGeometry(0.72, 0.07, beltLength), pale, 2.2, 0, 0.235, 0.14);
  part(new T.BoxGeometry(0.86, 0.3, 0.42), { margin: 0.012, litEdge: 0.03 }, 3.3, 0, 0.26, hoodZ);
  // two uprights leaning back to the console, and a rail down each side, cut as
  // stout as a monument's members are, not as a machine's
  for (const x of [-0.36, 0.36]) {
    const post = part(new T.BoxGeometry(0.12, 1.2, 0.12), dark, 4.4 + x, x, 0.88, frontZ);
    post.rotation.x = 0.18;
    part(new T.BoxGeometry(0.09, 0.09, 0.62), dark, 5.5 + x, x, 1.12, railZ);
  }
  const console_ = part(new T.BoxGeometry(0.78, 0.12, 0.36), {}, 6.6, 0, 1.47, consoleZ);
  console_.rotation.x = -0.55;
  part(new T.BoxGeometry(0.5, 0.012, 0.22), pale, 7.7, 0, 0.066, 0.01, console_);
  if (livingTreadmill) {
    const marks = new T.Group();
    marks.name = 'treadmill-belt-marks';
    const markLength = 0.075;
    const markGeo = new T.BoxGeometry(0.5, 0.012, markLength);
    const markMat = washMaterial(T, uniforms, pal, markGeo, {
      lit: MIX(pal.shadeCool, pal.ink, 0.48),
      shade: MIX(pal.ink, pal.shadeCool, 0.12),
      sky: MIX(pal.shadeCool, pal.paper, 0.2),
      seed: 8.8, rag: 0.04, grain: 0.8, inkLine: 0.45, top: 0, skyTop: 0, dry: 0.2, margin: 0, base: 0,
    });
    const stripes = [];
    const at = [0.12, 0.46, 0.81];
    const widths = [0.72, 1, 0.58];
    const tilts = [0.025, -0.018, 0.04];
    const start = 0.14 - beltLength * 0.5;
    // Give each stroke one extra stroke-length in which to cross the seam;
    // trim that geometry to the exposed belt so it slips under either end.
    const end = start + beltLength;
    const halfMark = markLength * 0.5;
    const travelLength = beltLength + markLength;
    const placeStripe = (stripe, phase) => {
      const centre = start - halfMark + phase % travelLength;
      const from = Math.max(start, centre - halfMark);
      const to = Math.min(end, centre + halfMark);
      const visible = Math.max(0, to - from);
      stripe.visible = visible > 1e-4;
      stripe.scale.z = visible / markLength;
      stripe.position.z = (from + to) * 0.5;
    };
    for (let i = 0; i < at.length; i++) {
      const stripe = new T.Mesh(markGeo, markMat);
      stripe.name = 'treadmill-belt-mark';
      stripe.scale.x = widths[i];
      stripe.rotation.y = tilts[i];
      stripe.position.set(0, 0.276, 0);
      placeStripe(stripe, at[i] * travelLength);
      marks.add(stripe);
      stripes.push(stripe);
    }
    if (beltSpeed) {
      const updateMatrixWorld = marks.updateMatrixWorld;
      marks.updateMatrixWorld = function updateBeltMarks(force) {
        const travel = ((Number(uniforms?.uTime?.value) || 0) * beltSpeed) % travelLength;
        for (let i = 0; i < stripes.length; i++) {
          placeStripe(stripes[i], at[i] * travelLength + travel);
        }
        return updateMatrixWorld.call(this, force);
      };
    }
    machine.add(marks);
  }

  // its pigment pooled on the ground round the seat's foot, and its shadow
  const along = new T.Vector3(0, 0, 1).applyEuler(rig.rotation);
  const across = new T.Vector3(1, 0, 0).applyEuler(rig.rotation);
  const pool = shadowMaterial(T, pal, { alpha: 0.3, centre: 0, stretch: 1, seed: 5.3 });
  g.add(groundWash(T, features, { frame, len: PZ + 0.9, wide: PX + 0.9, mat: pool, away: along, side: across, origin: rig.position, u0: -1, flare: 0 }));
  const cast = castShadow(T, features, {
    dir, frame,
    len: livingTreadmill ? 8.5 * (PZ / 1.95) : 8.5,
    wide: 2.1,
    uniforms, pal, seed: 8.7, origin: rig.position, flare: 0.4,
  });
  if (cast) g.add(cast);
  return g;
}

// The grove: eight pines round a quiet ring of painted stones, no two of an
// age — tall ones, short ones, a dead snag, one snapped — leaning together with
// the wind, each laying its own shape on the grass as its shadow: the trunk
// from its foot and its shelves across it, stretched away from the low sun.
function calm(T, { feature, features, uniforms, palette: pal, rng }) {
  const dir = feature.dir;
  const g = new T.Group();
  const frame = featureFrame(T, features, dir);
  const quad = new T.PlaneGeometry(1, 1);
  const wind = rng() < 0.5 ? -1 : 1;                         // the grove leans one way
  const dead = Math.floor(rng() * 8), snapped = (dead + 3) % 8;
  const sways = P['living.grove'] > 0 ? [] : null;
  const active = Number(feature.stats?.activeS);
  const swayBend = 0.22 + 0.18 * clamp(Number.isFinite(active) ? active / 5400 : 0, 0, 1);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2 + (rng() - 0.5) * 0.35;
    const r = 3.2 + rng() * 2.2;
    const seat = onGround(features, frame, new T.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    const height = 2.3 + rng() * 3.1;
    const wide = height * (0.55 + rng() * 0.3);
    // drawn in the order the grove has always been drawn in, so no pine moves
    const leafLit = MIX(MIX(pal.landLow, pal.litWarm, 0.16 + rng() * 0.1), pal.ink, 0.08);
    const leafDeep = MIX(MIX(pal.landLow, pal.ink, 0.66 + rng() * 0.1), pal.shadeCool, 0.25);
    // the pine's shape, shared by the tree and by its shadow
    const pine = {
      uSize: { value: new T.Vector2(wide, height) },
      uTiers: { value: 5 + Math.floor(rng() * 4) },          // the clump loop draws up to eight
      uWind: { value: wind * (0.3 + rng() * 0.4) },
      uBend: { value: wind * (0.2 + rng() * 0.9) },
    };
    const lean = wind * (0.02 + rng() * 0.07);
    pine.uDead = { value: i === dead ? 1 : 0 };
    pine.uSnap = { value: i === snapped ? 0.24 : (i === dead ? 0.14 : 0) };
    pine.uSeed = { value: rng() * 40 };
    if (sways && i !== dead && i !== snapped) {
      const seed = pine.uSeed.value;
      sways.push({
        bend: pine.uBend,
        base: pine.uBend.value,
        amp: swayBend * (0.88 + (seed % 1) * 0.24),
        phase: seed * 2.399963,
        period: 5 + (seed * 0.37) % 3,
      });
    }
    const matOptions = {
      uniforms: {
        uSunDir: sunOf(T, uniforms),
        uLeaf: { value: MIX(MIX(pal.landLow, pal.ink, 0.38), pal.shadeCool, 0.1) },
        uLeafLit: { value: leafLit },
        uLeafDeep: { value: leafDeep },
        uInk: { value: pal.ink.clone() },
        // the dead one is the darkest wood in the grove: a snag is an ink stroke
        uWood: { value: i === dead ? MIX(MIX(pal.wood, pal.ink, 0.62), pal.shadeCool, 0.18) : MIX(pal.wood, pal.ink, 0.45) },
        uPaper: { value: pal.paper.clone() },
        uLean: { value: lean },
        ...pine,
      },
      vertexShader: TREE_VERT,
      fragmentShader: TREE_FRAG,
      side: T.DoubleSide,
      alphaToCoverage: true,
    };
    if (P['living.orbitMarks'] > 0) matOptions.defines = { LIVING_ORBIT_SCALE: 1 };
    const mat = new T.ShaderMaterial(matOptions);
    const t = new T.Mesh(quad, mat);
    t.position.copy(seat.pos);
    t.frustumCulled = false;
    g.add(t);
    const cast = castShadow(T, features, {
      dir, frame, len: height * 1.4, wide: 0.5 * wide, uniforms, pal, origin: seat.pos, flare: 0,
      mat: shadowMaterial(T, pal, { frag: TREE_SHADOW_FRAG, extra: pine }),
    });
    if (cast) g.add(cast);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + (rng() - 0.5) * 0.25;
    g.add(stone(T, features, frame, pal, {
      x: Math.cos(a) * 1.6, z: Math.sin(a) * 1.6,
      r: 0.26 + rng() * 0.16, flat: 0.62, sink: 0.05,
      seed: 60 + i * 4.3, uniforms, rng,
    }));
  }
  if (sways?.length) {
    const updateMatrixWorld = g.updateMatrixWorld;
    g.updateMatrixWorld = function updateGroveSway(force) {
      const time = Number(uniforms?.uTime?.value) || 0;
      for (let i = 0; i < sways.length; i++) {
        const sway = sways[i];
        sway.bend.value = sway.base + sway.amp * Math.sin(TAU * time / sway.period + sway.phase);
      }
      return updateMatrixWorld.call(this, force);
    };
  }
  return g;
}

function orbitConstructed(T, { feature, uniforms, palette: pal }) {
  const { deckLength } = treadmillMeasures(feature);
  const g = new T.Group();
  const slate = {
    lit: MIX(pal.shadeCool, pal.ink, 0.26),
    shade: MIX(pal.ink, pal.shadeCool, 0.1),
    sky: MIX(pal.shadeCool, pal.paper, 0.34),
  };
  const pale = {
    lit: MIX(pal.paper, pal.litWarm, 0.18),
    shade: MIX(pal.stone, pal.shadeCool, 0.5),
    sky: MIX(pal.paper, pal.skyHigh, 0.2),
  };
  const part = (geo, colors, seed, x, y, z) => {
    const m = mesh(T, geo, washMaterial(T, uniforms, pal, geo, {
      ...colors, seed, rag: 0.04, grain: 0.75, inkLine: 0.55, top: 0.2, margin: 0.01, base: 0.4,
    }), x, y, z);
    g.add(m);
    return m;
  };
  const length = clamp(deckLength * 1.45, 2.4, 3.8);
  const front = -length * 0.5 + 0.12;
  part(new T.BoxGeometry(1.15, 0.32, length), slate, 91.1, 0, 0.26, 0);
  part(new T.BoxGeometry(0.88, 0.08, length * 0.82), pale, 92.3, 0, 0.46, 0.16);
  for (const x of [-0.48, 0.48]) {
    const post = part(new T.BoxGeometry(0.16, 2.8, 0.16), slate, 94 + x, x, 1.75, front);
    post.rotation.x = 0.16;
  }
  const console_ = part(new T.BoxGeometry(1.1, 0.28, 0.55), pale, 97.4, 0, 3.15, front + 0.22);
  console_.rotation.x = -0.45;
  return g;
}

function orbitCalm(T, { feature, uniforms, palette: pal }) {
  const g = new T.Group();
  const pivots = [];
  const active = Number(feature.stats?.activeS);
  const sway = (1 + clamp(Number.isFinite(active) ? active / 5400 : 0, 0, 1)) * Math.PI / 180;
  const colors = {
    lit: MIX(pal.landLow, pal.litWarm, 0.18),
    shade: MIX(MIX(pal.landLow, pal.ink, 0.6), pal.shadeCool, 0.22),
    sky: MIX(pal.landLow, pal.paper, 0.28),
  };
  for (let i = 0; i < 3; i++) {
    const pivot = new T.Group();
    const height = 3.5 + i * 0.45;
    const geo = new T.ConeGeometry(0.95 + i * 0.08, height, 5);
    const tree = mesh(T, geo, washMaterial(T, uniforms, pal, geo, {
      ...colors, seed: 103 + i * 2.7, rag: 0.08, grain: 0.85, inkLine: 0.75, top: 0.28, base: 0.45,
    }), 0, height * 0.5, 0);
    pivot.position.set((i - 1) * 1.25, 0, i === 1 ? -0.35 : 0.3);
    pivot.add(tree);
    g.add(pivot);
    pivots.push(pivot);
  }
  if (P['living.grove'] > 0) {
    const updateMatrixWorld = g.updateMatrixWorld;
    g.updateMatrixWorld = function updateOrbitGrove(force) {
      const time = Number(uniforms?.uTime?.value) || 0;
      for (let i = 0; i < pivots.length; i++) {
        pivots[i].rotation.z = sway * Math.sin(TAU * time / (5 + i * 1.35) + i * 2.17);
      }
      return updateMatrixWorld.call(this, force);
    };
  }
  return g;
}

function orbitBuiltMark(T, ctx) {
  if (ctx.feature.kind === 'constructed') return orbitConstructed(T, ctx);
  if (ctx.feature.kind === 'calm') return orbitCalm(T, ctx);
  return null;
}

/* ----------------------------------------------------------- built forms -- */

// The edges a builder cut into a form built for a session with no route
// (base.js builtFor), as polylines in the form's own east/north units: the lip
// of every terrace (left open where its switchback ramp climbs past), the edges
// of a flight's treads and the nose of every step, the two rims of an oval's
// bank, the foot of a mound.
function formLines(f) {
  const ring = (rho, open = null) => {
    const out = [];
    let run = [];
    for (let i = 0; i <= 96; i++) {
      const phi = (i / 96) * TAU - Math.PI;
      if (open && open(phi)) { if (run.length > 2) out.push(run); run = []; continue; }
      run.push(f.a * rho * Math.sin(phi), -f.b * rho * Math.cos(phi));
    }
    if (run.length > 2) out.push(run);
    return out;
  };
  if (f.form === 'stair') {
    const out = [[-f.a, -f.b, -f.a, f.b * 1.1], [f.a, -f.b, f.a, f.b * 1.1]];
    for (let k = 1; k <= f.steps; k++) {
      const v = -f.b + (2 * f.b * k) / f.steps;
      out.push([-f.a, v, f.a, v]);
    }
    return out;
  }
  if (f.form === 'oval') {
    const w = f.w / (0.5 * (f.a + f.b));
    return [...ring(1 - w), ...ring(1 + w)];
  }
  if (!f.edges) return ring(0.92);
  const [from, span] = f.ramp;
  return f.edges.flatMap((e, i) => ring(e - f.rw, (phi) => {
    const t = ((i % 2 ? 1 : -1) * phi - from) / span;
    return t > 0 && t < 1;
  }));
}

// The form's edges drawn in ink: a strip of the brush along each line, seated on
// the ground it was cut into, a little wider or narrower as the hand went and
// lifted now and then; near on the drawn relief, from orbit wider on the capped
// globe (livingObjectLod hands the one over to the other), so the hill reads as
// built at every distance the planet is seen from.
function builtForm(T, ctx) {
  const { feature, features, uniforms, palette: pal, rng } = ctx;
  const form = features.forms?.find((f) => f.featureId === feature.id);
  if (!form) return null;
  const frame = featureFrame(T, features, feature.dir);
  const lines = formLines(form);
  const d = new T.Vector3(), p = new T.Vector3();
  const ink = MIX(pal.ink, pal.shadeCool, 0.2);
  const strip = (height, wide, lift, name) => {
    const pos = [], idx = [];
    for (const pts of lines) {
      const n = pts.length / 2;
      const base = pos.length / 3;
      for (let i = 0; i < n; i++) {
        const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
        let tx = pts[b * 2] - pts[a * 2], tz = pts[b * 2 + 1] - pts[a * 2 + 1];
        const len = Math.hypot(tx, tz) || 1;
        const half = 0.5 * wide * (0.75 + 0.5 * rng());
        tx = (tx / len) * half; tz = (tz / len) * half;
        for (const s of [-1, 1]) {
          features.onSphere(form.dir, form.east, form.north, pts[i * 2] - s * tz, pts[i * 2 + 1] + s * tx, d);
          p.copy(d).multiplyScalar(R + height(d) + lift).sub(frame.P).applyQuaternion(frame.qi);
          pos.push(p.x, p.y, p.z);
        }
        if (i > 0 && rng() > 0.05) {
          const o = base + (i - 1) * 2;
          idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
        }
      }
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(new Float32Array(pos), 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = washMaterial(T, uniforms, pal, geo, {
      lit: ink, shade: ink, sky: ink, seed: 9.3, rag: 0.05, grain: 0.6, inkLine: 0, top: 0, skyTop: 0, dry: 0.15, margin: 0, base: 0,
    });
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -2;
    mat.polygonOffsetUnits = -8;
    const m = new T.Mesh(geo, mat);
    m.name = name;
    m.frustumCulled = false;
    m.userData.groundWash = true;
    return m;
  };
  const near = strip(features.heightAt, 0.35, 0.08, 'built-form-lines');
  // the far lines are seated on the capped field, wide enough to hold a pixel or two at the poster's distance; the
  // lod wrapper lifts them by the cap's own drop at the centre, so that is taken back out here
  const far = strip(features.orbitHeightAt, 1.5, 0.06 - (features.orbitHeightAt(feature.dir) - features.heightAt(feature.dir)), 'built-form-mark');
  return livingObjectLod(T, ctx, near, far, { always: true });
}

/* ------------------------------------------------------------- the race -- */

// The course as one stroke of the brush, carried through the course's own
// samples in one movement and laid on the ground a hand's breadth at a time.
// `uniforms.patchMask` is base.js's ground handover: where the fine patch's
// true relief is drawn, and where the orbit globe's capped relief is instead.
export function buildRaceStroke({ THREE: T, features, uniforms, palette: pal }) {
  const race = features.race;
  if (!race || !race.seg || race.seg.length < 6) return null;
  const n0 = race.seg.length / 3;
  const raw = [];
  for (let i = 0; i < n0; i++) raw.push(new T.Vector3(race.seg[i * 3], race.seg[i * 3 + 1], race.seg[i * 3 + 2]).normalize());
  // the samples are metres apart: a curve through them, never a polyline with
  // a kink at every sample, cut into rings a third of a metre apart
  const curve = new T.CatmullRomCurve3(raw, false, 'centripetal');
  curve.arcLengthDivisions = n0 * 40;
  const STEP = 0.32;
  const N = Math.max(2, Math.ceil((curve.getLength() * R) / STEP) + 1);
  const dirs = curve.getSpacedPoints(N - 1).map((p) => p.normalize());
  const hs = dirs.map((d) => features.heightAt(d));
  // metres along the ground, the climb included
  const along = new Float32Array(N);
  for (let i = 1; i < N; i++) along[i] = along[i - 1] + Math.hypot(dirs[i].distanceTo(dirs[i - 1]) * R, hs[i] - hs[i - 1]);
  const at = (i) => Math.min(N - 1, Math.max(0, i));

  // Five lanes across, each set down on the ground under it, so the stroke
  // drapes over a crest instead of bridging it; every lane also knows the ring's
  // centre, which the shader draws the lanes in toward where the hand is finer,
  // and how far it and the centre sink onto the orbit globe's capped relief.
  // The shader draws the edge.
  const HALF = 0.28;
  const LANES = [-1, -0.5, 0, 0.5, 1];
  const L = LANES.length;
  const pos = new Float32Array(N * L * 3), bis = new Float32Array(N * L * 3), mid = new Float32Array(N * L * 3);
  const aS = new Float32Array(N * L), aSide = new Float32Array(N * L), drop = new Float32Array(N * L * 2);
  const tg = new T.Vector3(), bi = new T.Vector3(), d = new T.Vector3(), c = new T.Vector3();
  for (let i = 0; i < N; i++) {
    const up = dirs[i];
    tg.subVectors(dirs[at(i + 1)], dirs[at(i - 1)]);
    tg.addScaledVector(up, -tg.dot(up)).normalize();
    bi.crossVectors(tg, up).normalize();
    c.copy(up).multiplyScalar(R + hs[i]);
    const sink = hs[i] - features.orbitHeightAt(up);
    for (let j = 0; j < L; j++) {
      const v = i * L + j;
      d.copy(up).addScaledVector(bi, (LANES[j] * HALF) / R).normalize();
      const h = LANES[j] === 0 ? hs[i] : features.heightAt(d);
      drop[v * 2] = LANES[j] === 0 ? sink : h - features.orbitHeightAt(d);
      drop[v * 2 + 1] = sink;
      d.multiplyScalar(R + h);
      d.toArray(pos, v * 3);
      bi.toArray(bis, v * 3);
      c.toArray(mid, v * 3);
      aS[v] = along[i]; aSide[v] = LANES[j];
    }
  }
  const idx = [];
  for (let i = 1; i < N; i++) {
    for (let j = 0; j < L - 1; j++) {
      const o = (i - 1) * L + j;
      idx.push(o, o + 1, o + L, o + 1, o + L + 1, o + L);
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  geo.setAttribute('aBi', new T.BufferAttribute(bis, 3));
  geo.setAttribute('aMid', new T.BufferAttribute(mid, 3));
  geo.setAttribute('aDrop', new T.BufferAttribute(drop, 2));
  geo.setAttribute('aS', new T.BufferAttribute(aS, 1));
  geo.setAttribute('aSide', new T.BufferAttribute(aSide, 1));
  geo.setIndex(idx);
  const mat = new T.ShaderMaterial({
    uniforms: {
      uVerm: { value: pal.vermilion.clone() },
      uInk: { value: pal.ink.clone() },
      uPaper: { value: pal.paper.clone() },
      uHalf: { value: HALF },
      uTotal: { value: along[N - 1] },
      uPx: { value: 0.001 },
      uFig: { value: new T.Vector4() },
      uFigDist: { value: 0 },
      uPatchCentre: uniforms.patchMask.centre,
      uPatchEast: uniforms.patchMask.east,
      uPatchNorth: uniforms.patchMask.north,
      uPatchHalf: uniforms.patchMask.half,
      uPatchFade: uniforms.patchMask.fade,
      uPatchOn: uniforms.patchMask.on,
    },
    vertexShader: STROKE_VERT,
    fragmentShader: STROKE_FRAG,
    side: T.DoubleSide,
    alphaToCoverage: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
  const g = new T.Group();
  g.name = 'race-trail';
  const stroke = new T.Mesh(geo, mat);
  stroke.frustumCulled = false;
  // one pixel of the sheet per metre of distance, for the hairline's width; and
  // where the figure stands on the sheet, so paper can be left round her
  const size = new T.Vector2(), foot = new T.Vector3(), head = new T.Vector3();
  stroke.onBeforeRender = (renderer, scene, camera) => {
    const rt = renderer.getRenderTarget();
    if (rt) size.set(rt.width, rt.height); else renderer.getDrawingBufferSize(size);
    const u = mat.uniforms;
    u.uPx.value = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, size.y);
    u.uFig.value.set(0, 0, 0, 0);
    const fig = window.__app && window.__app.runner && window.__app.runner.object3D;
    if (!fig) return;
    foot.copy(fig.position);
    u.uFigDist.value = foot.distanceTo(camera.position);
    head.copy(foot).normalize().multiplyScalar(1.81).add(foot).project(camera);
    foot.project(camera);
    if (foot.z > 1 || head.z > 1) return;
    const fx = (foot.x * 0.5 + 0.5) * size.x, fy = (foot.y * 0.5 + 0.5) * size.y;
    const hx = (head.x * 0.5 + 0.5) * size.x, hy = (head.y * 0.5 + 0.5) * size.y;
    const tall = Math.hypot(hx - fx, hy - fy);
    if (tall < 24) return;                                  // a speck from orbit: no halo
    u.uFig.value.set(fx + (hx - fx) * 0.55, fy + (hy - fy) * 0.55, 0.42 * tall, 0.85 * tall);
  };
  g.add(stroke);
  return g;
}

/* ------------------------------------------------------------ the runner -- */

function runnerPart(T, uniforms, pal, {
  lit, shade, ink = pal.ink, rag = 0.2, flat = 0, split = 0.3, grain = 0.07, hem = null,
}) {
  const mat = new T.MeshBasicMaterial({ color: 0xffffff });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSunDir = sunOf(T, uniforms);
    shader.uniforms.uWashLit = { value: lit };
    shader.uniforms.uWashShade = { value: shade };
    shader.uniforms.uInk = { value: ink.clone() };
    shader.uniforms.uRag = { value: rag };
    shader.uniforms.uFlat = { value: flat };
    shader.uniforms.uSplit = { value: split };
    shader.uniforms.uGrain = { value: grain };
    // a part that runs up under another (the shorts under the top) takes that
    // part's washes above the given height of its own frame
    shader.uniforms.uHem = { value: hem ? hem.y : 1e3 };
    shader.uniforms.uHemLit = { value: hem ? hem.lit : lit };
    shader.uniforms.uHemShade = { value: hem ? hem.shade : shade };
    shader.vertexShader = RUNNER_VERT_HEAD + shader.vertexShader.replace(
      '#include <project_vertex>',
      '#include <project_vertex>\n' + RUNNER_VERT_BODY,
    );
    shader.fragmentShader = RUNNER_FRAG_HEAD + shader.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + RUNNER_FRAG_WASH)
      .replace('#include <alphatest_fragment>', RUNNER_FRAG_INK + '\n#include <alphatest_fragment>');
  };
  // every part runs the same injected source: one program, six palettes
  mat.customProgramCacheKey = () => 'ink-runner';
  return mat;
}

/** A part of the drawn figure (runner.look 1): its own washes, the second and
 *  third its kind lays on it (`alt`: the skin in the singlet's openings, a
 *  shoe's midsole, the hair in the cap's opening; `low`: the shorts under the
 *  singlet's hem, a shoe's tread), and the weight of its contour. */
function runnerPart2(T, uniforms, pal, {
  lit, shade, alt = null, low = null, kind = 0, rag = 0.16, split = 0.06, grain = 0.07, line = 1,
}) {
  const mat = new T.MeshBasicMaterial({ color: 0xffffff });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSunDir = sunOf(T, uniforms);
    shader.uniforms.uWashLit = { value: lit };
    shader.uniforms.uWashShade = { value: shade };
    shader.uniforms.uAltLit = { value: alt ? alt.lit : lit };
    shader.uniforms.uAltShade = { value: alt ? alt.shade : shade };
    shader.uniforms.uLowLit = { value: low ? low.lit : lit };
    shader.uniforms.uLowShade = { value: low ? low.shade : shade };
    shader.uniforms.uInk = { value: pal.ink.clone() };
    shader.uniforms.uPaper = { value: pal.paper.clone() };
    shader.uniforms.uRag = { value: rag };
    shader.uniforms.uSplit = { value: split };
    shader.uniforms.uGrain = { value: grain };
    shader.uniforms.uKind = { value: kind };
    shader.uniforms.uLine = { value: line };
    shader.vertexShader = RUNNER2_VERT_HEAD + shader.vertexShader.replace(
      '#include <project_vertex>',
      '#include <project_vertex>\n' + RUNNER2_VERT_BODY,
    );
    shader.fragmentShader = RUNNER2_FRAG_HEAD + shader.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + RUNNER2_FRAG);
  };
  mat.customProgramCacheKey = () => 'ink-runner-2';
  return mat;
}

/** A part of the sculpted figure (runner.look 2): the washes of its four
 *  parts (see RUNNER3_FRAG; a part with fewer repeats its first), how ragged
 *  its light's split and where it falls, its grain, the weight of its
 *  contour. Every part runs one program; `userData.pose` is the uniform the
 *  rig's pose is bound to when he is painted. */
function runnerPart3(T, uniforms, pal, {
  kind, a, b = a, c = a, d = a, rag = 0.16, split = 0.15, grain = 0.07, line = 1,
}) {
  const mat = new T.MeshBasicMaterial({ color: 0xffffff });
  const pose = { value: new T.Vector4() };
  mat.userData.pose = pose;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uSunDir: sunOf(T, uniforms),
      uLitA: { value: a.lit }, uShadeA: { value: a.shade },
      uLitB: { value: b.lit }, uShadeB: { value: b.shade },
      uLitC: { value: c.lit }, uShadeC: { value: c.shade },
      uLitD: { value: d.lit }, uShadeD: { value: d.shade },
      uInk: { value: pal.ink.clone() }, uPaper: { value: pal.paper.clone() },
      uRag: { value: rag }, uSplit: { value: split }, uGrain: { value: grain }, uKind: { value: kind }, uLine: { value: line },
      uPose: pose,
    });
    shader.vertexShader = RUNNER3_VERT_HEAD + shader.vertexShader.replace(
      '#include <project_vertex>',
      '#include <project_vertex>\n' + RUNNER3_VERT_BODY,
    );
    shader.fragmentShader = RUNNER3_FRAG_HEAD + shader.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + RUNNER3_FRAG);
  };
  mat.customProgramCacheKey = () => 'ink-runner-3';
  return mat;
}

// The drawn figure's contact shadow: a small puddle of the shadow's own wash
// under each sole, crisp at its rim where the pigment stopped, with the air
// under the arch a soft breath round it. runner.js fades it through the
// puddle's y scale, which a flat thing has no other use for.
function runnerContact(T, pal) {
  return new T.ShaderMaterial({
    uniforms: { uInk: { value: MIX(pal.ink, pal.shadeCool, 0.4) } },
    vertexShader: /* glsl */ `
varying vec2 vP;
varying float vFade;
void main(){
  vP = uv * 2.0 - 1.0;
  vFade = length( modelMatrix[ 1 ].xyz );
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,
    fragmentShader: /* glsl */ `
${NOISE}
uniform vec3 uInk;
varying vec2 vP;
varying float vFade;
void main(){
  float r = length( vP );
  float e = r - ( 0.6 + ( inkF2( vP * 2.3 + 4.0 ) - 0.5 ) * 0.22 );
  float fw = fwidth( e ) + 1e-5;
  float core = 1.0 - inkPixel( e, fw );
  float rim = inkPixel( e + 1.5 * fw, fw ) * core;
  float soft = 1.0 - smoothstep( 0.25, 1.0, r );
  float a = ( 0.42 * core + 0.18 * soft * ( 1.0 - core ) + 0.16 * rim ) * clamp( vFade, 0.0, 1.0 );
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( uInk, a );
}`,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -6,
  });
}

// The sleeve on his right forearm: a few loose strokes of ink under the skin,
// laid along the arm as a brush follows the form, fewer toward the ends of the
// sleeve; between them the arm shows through. The sleeve tube's uv runs along
// it and round it.
function inkSleeve(mat, key) {
  const inked = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader) => {
    inked(shader);
    shader.vertexShader = 'varying vec2 inkUv;\n' + shader.vertexShader
      .replace('#include <project_vertex>', '#include <project_vertex>\n  inkUv = uv;');
    shader.fragmentShader = 'varying vec2 inkUv;\n' + shader.fragmentShader.replace('#include <color_fragment>', /* glsl */ `{
  float along = ( inkUv.x - 0.24 ) / 0.52;
  float n = inkF2( vec2( along * 2.4 + 5.0, inkUv.y * 4.5 ) );
  float ends = smoothstep( 0.0, 0.2, along ) * smoothstep( 1.0, 0.8, along );
  if ( along < 0.0 || along > 1.0 || n < 0.68 - 0.1 * ends ) discard;
}
#include <color_fragment>`);
  };
  mat.customProgramCacheKey = () => key;
}

// The sculpted figure's sleeve (runner.look 2), shoulder to wrist: the same
// strokes laid along the arm, but so many that the ink runs together into one
// connected design, the skin showing through it in islands, each edged in a
// darker line with a second one echoing it inside the ink, the ground
// deepest farthest from them (RUNNER3_FRAG reads inkTat). It stops in a
// wavering line under the shoulder and above the wrist, breaking up toward
// both; from afar the islands close and it is one wash on the arm. Its uv:
// along the arm from the shoulder's joint (0) to the wrist (1), and round it.
function inkSleeveFull(mat, key) {
  const inked = mat.onBeforeCompile;
  mat.defines = { INK_TATTOO: '' };
  mat.onBeforeCompile = (shader) => {
    inked(shader);
    shader.vertexShader = 'varying vec2 inkUv;\n' + shader.vertexShader
      .replace('#include <project_vertex>', '#include <project_vertex>\n  inkUv = uv;');
    shader.fragmentShader = 'varying vec2 inkUv;\n' + shader.fragmentShader.replace('#include <color_fragment>', /* glsl */ `float inkTat = 0.0;
{
  float u = inkUv.x, v = inkUv.y;
  float top = 0.1 + 0.05 * sin( v * 8.0 + 1.3 ), bot = 0.92 + 0.03 * sin( v * 6.0 + 0.4 );
  float fade = smoothstep( 0.0, 0.12, u - top ) * smoothstep( 0.0, 0.08, bot - u );
  float n = inkF2( vec2( u * 8.5 + 5.0, v * 4.5 ) );
  float far = smoothstep( 0.005, 0.014, length( fwidth( inkRP ) ) );
  float cut = mix( mix( 0.66, 0.42, fade ), 0.2, far );
  if ( u < top || u > bot || inkRF.y > 0.0 || n < cut ) discard;
  float d = ( n - cut ) / max( fwidth( n ), 1e-4 );
  float echo = 0.09 / max( fwidth( n ), 1e-4 );
  inkTat = max( 1.0 - smoothstep( 1.0, 1.8, d ), 0.75 * ( 1.0 - smoothstep( 0.5, 1.1, abs( d - echo ) ) ) );
  inkTat = max( inkTat, 0.35 * smoothstep( 0.17, 0.24, n - cut ) ) * ( 1.0 - far );
}
#include <color_fragment>`);
  };
  mat.customProgramCacheKey = () => key;
}

// The rig, read by its own shape. runner.js builds one lathe torso, a group for
// the head — a bare skull plus the hair and the beard — one tube per limb, split
// by material into clothing above and skin below, and a shoe per foot. Nothing
// moves once it is built, so the parts are found where they hang: the torso's
// parent is the waist, the waist's parent the hip, and a shoe is the one thing
// left hanging off the hip. The head's own meshes carry names, because three of
// its five hair pieces are spheres and shape alone cannot tell them from a skull.
function paintRunner(parts, rig) {
  if (rig.userData.drawn === 2) {
    // the sculpted figure names its pieces too, and draws its cloth by the
    // pose the rig keeps
    const named = {
      body: parts.body, head: parts.head, brim: parts.head, hand: parts.hand,
      shoe: parts.shoes, sleeve: parts.tattoo, contact: parts.contact,
    };
    rig.traverse((k) => {
      if (k.isMesh && named[k.name]) k.material = named[k.name];
    });
    for (const m of Object.values(parts)) if (m.userData.pose && rig.userData.pose) m.userData.pose.value = rig.userData.pose;
    return true;
  }
  if (rig.userData.drawn) {
    // the drawn figure names every piece for what it is
    const named = {
      torso: parts.top, skull: parts.face, face: parts.face, ear: parts.skin, hand: parts.skin,
      hair: parts.hair, beard: parts.beard, cap: parts.cap, shoe: parts.shoes, sleeve: parts.tattoo, contact: parts.contact,
    };
    rig.traverse((k) => {
      if (!k.isMesh) return;
      if (k.name === 'arm') k.material = [parts.top, parts.skin];
      else if (k.name === 'leg') k.material = [parts.shorts, parts.skin];
      else if (named[k.name]) k.material = named[k.name];
    });
    return true;
  }
  const meshes = [];
  rig.traverse((k) => { if (k.isMesh) meshes.push(k); });
  const kind = (k) => (k.geometry && k.geometry.type) || '';
  const torso = meshes.find((k) => kind(k) === 'LatheGeometry');
  const skull = meshes.find((k) => k.name === 'skull') || meshes.find((k) => kind(k) === 'SphereGeometry');
  if (!torso || !skull) return false;
  const waist = torso.parent;
  const hip = waist.parent;
  const head = skull.parent;
  torso.material = parts.top;
  for (const k of meshes) {
    if (k === torso) continue;
    if (k.parent === head) {
      // the skull is skin; the hair and the beard are the dark wash, whether
      // they arrived named or only as whatever else grew out of the head
      k.material = (k.name === 'hair' || k.name === 'beard' || kind(k) !== 'SphereGeometry') ? parts.hair : parts.skin;
    } else if (k.parent === waist && Array.isArray(k.material)) {
      k.material = [parts.top, parts.skin];       // sleeve, then bare arm
    } else if (k.parent === hip && Array.isArray(k.material)) {
      k.material = [parts.shorts, parts.skin];    // shorts, then bare leg
    } else if (k.material === parts.accent) {
      k.material = parts.shoes;                   // the shoe on each foot
    }
  }
  return true;
}

/* ---------------------------------------------------------- the letters -- */

// The names are written on the sheet, so they have to sit in the painting: a
// little bleed, a baseline that is not quite level, and never over the figure
// or over the thing they name. Each is written just above the thing it names,
// the museum way, with a short hairline down to its top; slid along clear of
// the figure if she is in the way, and written beside the top instead where no
// sky is left above it. A name with nothing built to name (a range) hangs over
// the ground base.js anchors it to.
function guardNames(T) {
  const app = window.__app;
  const els = Array.from(document.querySelectorAll('.pc-near'));
  const rig = app && app.runner && app.runner.object3D;
  if (!els.length || !rig) return false;
  const boxOf = (lo, hi) => {
    const out = [];
    for (let i = 0; i < 8; i++) out.push(new T.Vector3(i & 1 ? hi.x : lo.x, i & 2 ? hi.y : lo.y, i & 4 ? hi.z : lo.z));
    return out;
  };

  // the figure's own box, in its own frame: measured once, then carried by the
  // rig's matrix every frame
  rig.updateWorldMatrix(true, true);
  const inv = rig.matrixWorld.clone().invert();
  const lo = new T.Vector3(Infinity, Infinity, Infinity);
  const hi = new T.Vector3(-Infinity, -Infinity, -Infinity);
  const corner = new T.Vector3();
  rig.traverse((k) => {
    if (!k.isMesh || !k.geometry) return;
    if (!k.geometry.boundingBox) k.geometry.computeBoundingBox();
    const bb = k.geometry.boundingBox;
    k.updateWorldMatrix(true, false);
    const toLocal = inv.clone().multiply(k.matrixWorld);
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z);
      corner.applyMatrix4(toLocal);
      lo.min(corner); hi.max(corner);
    }
  });
  lo.y -= 0.06; hi.y += 0.06;
  lo.z -= 0.32; hi.z += 0.32;   // the stride reaches past the standing rig
  const figure = { obj: rig, corners: boxOf(lo, hi) };

  // the parts of the thing each name belongs to, each in its own box — not its
  // pigment on the ground; a pine is a sheet its shader sizes, so it is boxed
  // by that size — and each with its peak: the middle of its highest vertices,
  // the point of a spire, the middle of a cap, the top of a pine. The names are
  // written in the order of the features, so the n-th name is the n-th
  // feature's: two sessions of Strength share a name, not a place
  const peakOf = (pos) => {
    let top = -Infinity;
    for (let i = 0; i < pos.count; i++) top = Math.max(top, pos.getY(i));
    const c = new T.Vector3();
    let n = 0;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < top - 1e-3) continue;
      c.x += pos.getX(i); c.y += pos.getY(i); c.z += pos.getZ(i); n++;
    }
    return c.divideScalar(n);
  };
  const list = app.features.list;
  const partsOf = els.map((el, i) => {
    const f = list[i] && list[i].label === el.textContent ? list[i] : list.find((g) => g.label === el.textContent);
    const obj = f && app.objects && app.objects.get(f.id);
    const parts = [];
    if (obj) {
      obj.traverse((k) => {
        if (!k.isMesh || !k.geometry || k.userData.groundWash) return;
        const sz = k.material && k.material.uniforms && k.material.uniforms.uSize;
        if (sz) {
          const s = sz.value;
          parts.push({ obj: k, corners: boxOf(new T.Vector3(-0.3 * s.x, 0, -0.3 * s.x), new T.Vector3(0.3 * s.x, s.y, 0.3 * s.x)), peak: new T.Vector3(0, s.y, 0) });
          return;
        }
        if (!k.geometry.boundingBox) k.geometry.computeBoundingBox();
        parts.push({ obj: k, corners: boxOf(k.geometry.boundingBox.min, k.geometry.boundingBox.max), peak: peakOf(k.geometry.attributes.position) });
      });
    }
    return parts;
  });

  let w = 0, h = 0, dirty = true;
  const size = () => {
    const el = app.renderer && app.renderer.domElement;
    w = el ? el.clientWidth : 0;
    h = el ? el.clientHeight : 0;
    dirty = true;
  };
  size();
  window.addEventListener('resize', size);

  const probe = new T.Vector3();
  const figureRect = { l: 0, r: 0, t: 0, b: 0 };
  const partRect = { l: 0, r: 0, t: 0, b: 0 };
  const camPos = new T.Vector3(Infinity, Infinity, Infinity);
  const runnerPos = new T.Vector3(Infinity, Infinity, Infinity);
  const camQuat = new T.Quaternion();
  const runnerQuat = new T.Quaternion();
  const jobs = els.map((el, i) => ({
    el, i, ax: 0, ay: 0, nw: 0, nh: 0, dx: 0, dy: 0, hx: 0, hl: 0, ha: 0,
  }));
  const active = new Array(jobs.length);
  const HAIR = 16, GAP = 12, EDGE = 10;
  // where a box is on screen; false if any of it is behind the eye or all of
  // it is off the sheet
  const rectOf = (p, rect) => {
    let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
    for (const c of p.corners) {
      probe.copy(c).applyMatrix4(p.obj.matrixWorld).project(app.camera);
      if (probe.z > 1) return false;
      const x = (probe.x * 0.5 + 0.5) * w, y = (-probe.y * 0.5 + 0.5) * h;
      l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y);
    }
    if (r < 0 || l > w || b < 0 || t > h) return false;
    rect.l = l; rect.r = r; rect.t = t; rect.b = b;
    return true;
  };
  const tick = () => {
    if (!document.body.contains(els[0])) return;      // the page moved on
    if (app.mode !== 'surface') { dirty = true; return; }

    // every name's place and size is read before any is written: one layout
    let count = 0, changed = dirty
      || app.camera.position.distanceToSquared(camPos) > 1e-5
      || rig.position.distanceToSquared(runnerPos) > 1e-5
      || 1 - Math.abs(app.camera.quaternion.dot(camQuat)) > 1e-6
      || 1 - Math.abs(rig.quaternion.dot(runnerQuat)) > 1e-6;
    for (const j of jobs) {
      if (!j.el.classList.contains('on')) continue;
      const ax = parseFloat(j.el.style.left) || 0, ay = parseFloat(j.el.style.top) || 0;
      const nw = j.el.offsetWidth, nh = j.el.offsetHeight;
      changed ||= ax !== j.ax || ay !== j.ay || nw !== j.nw || nh !== j.nh;
      j.ax = ax; j.ay = ay; j.nw = nw; j.nh = nh;
      active[count++] = j;
    }
    if (!count || !changed) return;

    const hasFigure = rectOf(figure, figureRect);
    if (hasFigure) figureRect.b += Math.max(48, (figureRect.b - figureRect.t) * 0.35); // keep names out from under the figure and stride shadow
    for (let n = 0; n < count; n++) {
      const j = active[n];
      // the top of the thing: the highest peak of its parts on the sheet
      let hasTop = false, topL = 0, topR = 0, tx = j.ax, ty = j.ay + 26;
      for (const p of partsOf[j.i]) {
        if (!rectOf(p, partRect)) continue;
        probe.copy(p.peak).applyMatrix4(p.obj.matrixWorld).project(app.camera);
        const py = (-probe.y * 0.5 + 0.5) * h;
        if (hasTop && py >= ty) continue;
        hasTop = true; topL = partRect.l; topR = partRect.r;
        tx = (probe.x * 0.5 + 0.5) * w; ty = py;
      }
      let x = clamp(tx - j.nw / 2, EDGE, w - EDGE - j.nw);
      let y = ty - HAIR - j.nh;
      if (y < EDGE) {
        // no sky left above it: beside its top, on whichever side has room
        y = clamp(ty - j.nh + 4, EDGE, h - EDGE - j.nh);
        const r = (hasTop ? topR : tx) + GAP;
        x = clamp(r + j.nw <= w - EDGE ? r : (hasTop ? topL : tx) - GAP - j.nw, EDGE, w - EDGE - j.nw);
      }
      // never over the figure: along to whichever side of her is nearer
      if (hasFigure && x < figureRect.r + GAP && x + j.nw > figureRect.l - GAP && y < figureRect.b + GAP && y + j.nh > figureRect.t - GAP) {
        const l = figureRect.l - GAP - j.nw, r = figureRect.r + GAP;
        x = l >= EDGE && (x - l < r - x || r + j.nw > w - EDGE) ? l : r;
      }
      // the hairline: from under the stroke at the foot of the name (3 px up in
      // it), straight over the top where it can, to just short of the top — and
      // none if the top itself is off the sheet
      j.hx = clamp(tx - x, 8, j.nw - 8);
      const dx = tx - (x + j.hx), dy = ty - (y + j.nh);
      j.dx = x - j.ax; j.dy = y - j.ay;
      j.hl = ty < 0 ? 0 : Math.hypot(dx, dy);
      j.ha = Math.atan2(-dx, dy);
    }
    for (let n = 0; n < count; n++) {
      const j = active[n], s = j.el.style;
      s.setProperty('--ink-dx', j.dx.toFixed(1) + 'px');
      s.setProperty('--ink-dy', j.dy.toFixed(1) + 'px');
      s.setProperty('--ink-hx', j.hx.toFixed(1) + 'px');
      s.setProperty('--ink-hl', j.hl.toFixed(1) + 'px');
      s.setProperty('--ink-ha', j.ha.toFixed(3) + 'rad');
    }
    camPos.copy(app.camera.position);
    camQuat.copy(app.camera.quaternion);
    runnerPos.copy(rig.position);
    runnerQuat.copy(rig.quaternion);
    dirty = false;
  };
  // Base can move an anchor late in its own animation frame; let it re-place
  // the names synchronously so the unguarded anchor is never painted.
  app._positionInkNames = tick;
  const frame = () => {
    if (!document.body.contains(els[0])) {
      if (app._positionInkNames === tick) delete app._positionInkNames;
      return;
    }
    tick();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return true;
}

/* --------------------------------------------------------------- exports -- */

/**
 * The painted objects for one feature: the monument, the treadmill, the grove.
 * Everything is built in the feature's own tangent frame — base.js places it.
 * A session with no route whose link says what it was (base.js builtFor: a
 * built hill, a stair, an oval) is built into the ground and stands no machine.
 * @returns Object3D|null  (null for the ranged features, which are landform only)
 */
export function inkFeatureObject({ THREE: T, feature, features, uniforms, palette: pal, camera = null }) {
  if (!T || !feature || !features || !pal) return null;
  const rng = features.makeRng('ink-objects-' + feature.id);
  const ctx = { feature, features, uniforms, palette: pal, camera, rng };
  let g = null;
  if (feature.kind === 'monument') g = monument(T, ctx);
  else if (feature.form) g = builtForm(T, ctx);
  else if (feature.kind === 'constructed' || feature.kind === 'calm') {
    const detailed = feature.kind === 'constructed' ? constructed(T, ctx) : calm(T, ctx);
    const distant = P['living.orbitMarks'] > 0 ? orbitBuiltMark(T, ctx) : null;
    g = livingObjectLod(T, ctx, detailed, distant);
  } else g = inkKindObject({ THREE: T, ...ctx });
  if (!g) return null;
  // the ground washes are written in the feature's frame before base.js moves it
  g.userData.dir = feature.dir.clone();
  g.userData.feature = feature;
  return g;
}

/**
 * Runner materials: one flat colour per part — skin, the top, the shorts, the
 * shoes, the cap, the hair, the beard and the ink of his tattoo sleeve — with a
 * light wash and a shadow wash that stop on a crisp wandering line, and a thin
 * broken ink contour on the shadow side. Built on three's own basic material
 * so any future skinning survives; the parts are repainted onto the rig itself
 * on the first frame after it is built.
 */
function runnerParts(T, uniforms, pal) {
  // the top is an orange, warmer and lighter than the race's vermilion, so the
  // figure and the course never read as one mark; where the light is off it,
  // it is the same orange cooled, and he still reads at a glance
  const topLit = MIX(MIX(pal.vermilion, pal.litWarm, 0.32), pal.paper, 0.06);
  const topShade = MIX(MIX(pal.vermilion, pal.litWarm, 0.18), pal.shadeCool, 0.3);
  const skinLit = MIX(pal.vermilion, pal.paper, 0.72);
  const skinShade = MIX(MIX(pal.vermilion, pal.paper, 0.45), pal.shadeCool, 0.35);
  // it is a tank top: above its back neckline the neck is bare
  const body = runnerPart(T, uniforms, pal, {
    lit: topLit, shade: topShade, rag: 0.16, split: 0.06,
    hem: { y: 0.535, lit: skinLit, shade: skinShade },
  });
  const accent = runnerPart(T, uniforms, pal, { lit: skinLit, shade: skinShade, rag: 0.2, split: 0.15 });
  // skin and the top are each one flat wash with one hard shadow side, as
  // Homer's paddlers are: where the wash dries at the split it leaves a line,
  // not a band that shades round the form
  for (const mat of [body, accent]) {
    const paint = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader) => {
      paint(shader);
      shader.fragmentShader = shader.fragmentShader.replace(
        'smoothstep( 0.0, 0.14, abs( l - uSplit ) )',
        'smoothstep( 0.0, 0.03, abs( l - uSplit ) )',
      );
    };
    mat.customProgramCacheKey = () => 'ink-runner-flat';
  }
  // his cap is as dark as the shorts, so the head reads by its silhouette
  const cap = runnerPart(T, uniforms, pal, {
    lit: MIX(pal.ink, pal.inkSoft, 0.5), shade: pal.ink.clone(), rag: 0.16, split: 0.06,
  });
  // the hair is dirty blonde, a pale straw-gold where the light crosses it and
  // a golden ochre under it; the beard is the same gold run well toward ginger
  // and a shade deeper, as his is — so the flare of it past his jaw reads apart
  // from his skin and from the ochre ground. Each is a wash laid on its own, so
  // it dries darker all round where it stops — over the face, against the sky —
  // not only along the split; the rim breaks where the brush ran dry. Both granulate
  const dried = (mat) => {
    const paint = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader) => {
      paint(shader);
      shader.fragmentShader = shader.fragmentShader.replace(RUNNER_FRAG_INK, /* glsl */ `{
  float face = abs( dot( normalize( inkRN ), normalize( cameraPosition - inkRW ) ) );
  float edge = 1.0 - inkPixel( face - 0.3, max( fwidth( face ), 1e-4 ) );
  float held = smoothstep( 0.3, 0.62, inkN2( gl_FragCoord.xy * 0.33 + 17.0 ) );
  diffuseColor.rgb = mix( diffuseColor.rgb, mix( uWashShade, uInk, 0.3 ), edge * ( 0.3 + 0.4 * held ) );
}
` + RUNNER_FRAG_INK);
    };
    mat.customProgramCacheKey = () => 'ink-runner-dried';
    return mat;
  };
  const hair = dried(runnerPart(T, uniforms, pal, {
    lit: MIX(pal.litWarm, pal.paper, 0.25),
    shade: MIX(MIX(pal.litWarm, pal.landMid, 0.35), pal.shadeCool, 0.1),
    rag: 0.24,
    split: 0.4,
    grain: 0.16,
  }));
  const beard = dried(runnerPart(T, uniforms, pal, {
    lit: MIX(pal.landMid, pal.vermilion, 0.22),
    shade: MIX(MIX(MIX(pal.landMid, pal.sepia, 0.35), pal.vermilion, 0.16), pal.shadeCool, 0.08),
    rag: 0.24,
    split: 0.4,
    grain: 0.16,
  }));
  // the sleeve on his right forearm: a few loose strokes of ink under the skin,
  // laid along the arm as a brush follows the form, fewer toward the ends of
  // the sleeve; between them the arm shows through. Slate where the light is
  // on it, near-ink under it
  const tattoo = runnerPart(T, uniforms, pal, {
    lit: MIX(pal.inkSoft, skinLit, 0.42),
    shade: MIX(pal.ink, skinShade, 0.32),
    rag: 0.2,
    split: 0.15,
    grain: 0.1,
  });
  inkSleeve(tattoo, 'ink-runner-tattoo');
  const parts = {
    body, accent, hair, beard, cap, tattoo,
    top: body,
    skin: accent,
    // The legs run up inside the top: above the hem they are the top's colour,
    // split where the top splits.
    shorts: runnerPart(T, uniforms, pal, {
      lit: MIX(pal.ink, pal.inkSoft, 0.45),
      shade: pal.ink.clone(),
      rag: 0.16,
      split: 0.06,
      hem: { y: -0.09, lit: topLit, shade: topShade },
    }),
    shoes: runnerPart(T, uniforms, pal, {
      lit: MIX(pal.wood, pal.ink, 0.42),
      shade: MIX(pal.wood, pal.ink, 0.72),
      rag: 0.18,
    }),
  };
  return parts;
}

/** The drawn figure's parts (runner.look 1): his own colours, as above, but
 *  each part told what it is (see RUNNER2_FRAG): the singlet's shade a deeper
 *  orange rather than a cooled one, pale ankle socks, the shoes on a pale
 *  midsole, and a contact shadow under each foot. */
function drawnRunnerParts(T, uniforms, pal) {
  const skin = { lit: MIX(pal.vermilion, pal.paper, 0.72), shade: MIX(MIX(pal.vermilion, pal.paper, 0.45), pal.shadeCool, 0.35) };
  const sock = { lit: MIX(pal.paper, pal.litWarm, 0.08), shade: MIX(pal.paper, pal.shadeCool, 0.42) };
  const shorts = { lit: MIX(pal.ink, pal.inkSoft, 0.45), shade: pal.ink.clone() };
  const hairWash = { lit: MIX(pal.litWarm, pal.paper, 0.25), shade: MIX(MIX(pal.litWarm, pal.landMid, 0.35), pal.shadeCool, 0.1) };
  const top = runnerPart2(T, uniforms, pal, {
    lit: MIX(MIX(pal.vermilion, pal.litWarm, 0.32), pal.paper, 0.06),
    shade: MIX(MIX(pal.vermilion, pal.sepia, 0.3), pal.shadeCool, 0.12),
    alt: skin, low: shorts, kind: 1, split: 0.22,
  });
  const tattoo = runnerPart2(T, uniforms, pal, {
    lit: MIX(pal.inkSoft, skin.lit, 0.42), shade: MIX(pal.ink, skin.shade, 0.32), rag: 0.2, split: 0.15, grain: 0.1, line: 0,
  });
  inkSleeve(tattoo, 'ink-runner-2-tattoo');
  const parts = {
    top,
    skin: runnerPart2(T, uniforms, pal, { ...skin, alt: sock, rag: 0.18, split: 0.2 }),
    face: runnerPart2(T, uniforms, pal, { ...skin, rag: 0.18, split: 0.28, kind: 6 }),
    shorts: runnerPart2(T, uniforms, pal, { ...shorts, kind: 5 }),
    shoes: runnerPart2(T, uniforms, pal, {
      lit: MIX(pal.ink, pal.inkSoft, 0.7), shade: MIX(pal.ink, pal.inkSoft, 0.25),
      alt: { lit: MIX(pal.paper, pal.litWarm, 0.12), shade: MIX(pal.paper, pal.shadeCool, 0.45) },
      low: { lit: MIX(pal.ink, pal.inkSoft, 0.2), shade: pal.ink.clone() },
      kind: 2, rag: 0.18,
    }),
    cap: runnerPart2(T, uniforms, pal, { lit: MIX(pal.ink, pal.inkSoft, 0.5), shade: pal.ink.clone(), alt: hairWash, kind: 3 }),
    hair: runnerPart2(T, uniforms, pal, { ...hairWash, kind: 4, rag: 0.24, split: 0.4, grain: 0.16, line: 0.8 }),
    beard: runnerPart2(T, uniforms, pal, {
      lit: MIX(pal.landMid, pal.vermilion, 0.22),
      shade: MIX(MIX(MIX(pal.landMid, pal.sepia, 0.35), pal.vermilion, 0.16), pal.shadeCool, 0.08),
      kind: 4, rag: 0.24, split: 0.4, grain: 0.16, line: 0.8,
    }),
    tattoo,
    contact: runnerContact(T, pal),
  };
  parts.body = parts.top;
  parts.accent = parts.skin;
  return parts;
}

/** The sculpted figure's parts (runner.look 2): his own colours — skin, an
 *  orange singlet, black shorts and cap, pale socks, the shoes on a pale
 *  midsole — and his hair and full beard ginger, a copper a shade browner and
 *  deeper than the singlet so the two never read as one; each part told what
 *  it is (see RUNNER3_FRAG), and a contact shadow under each foot. */
function figureParts(T, uniforms, pal) {
  const part = (o) => runnerPart3(T, uniforms, pal, o);
  const skin = { lit: MIX(pal.vermilion, pal.paper, 0.72), shade: MIX(MIX(pal.vermilion, pal.paper, 0.45), pal.shadeCool, 0.35) };
  const singlet = { lit: MIX(MIX(pal.vermilion, pal.litWarm, 0.32), pal.paper, 0.06), shade: MIX(MIX(pal.vermilion, pal.sepia, 0.3), pal.shadeCool, 0.12) };
  const black = { lit: MIX(pal.ink, pal.inkSoft, 0.45), shade: pal.ink.clone() };
  const sock = { lit: MIX(pal.paper, pal.litWarm, 0.08), shade: MIX(pal.paper, pal.shadeCool, 0.42) };
  const hair = { lit: MIX(MIX(pal.vermilion, pal.sepia, 0.28), pal.litWarm, 0.3), shade: MIX(MIX(pal.vermilion, pal.sepia, 0.55), pal.ink, 0.15) };
  const beard = { lit: MIX(hair.lit, pal.sepia, 0.22), shade: MIX(hair.shade, pal.ink, 0.1) };
  const parts = {
    body: part({ kind: 0, a: skin, b: singlet, c: black, d: sock, split: 0.16 }),
    head: part({ kind: 1, a: skin, b: beard, c: beard, d: { lit: MIX(pal.ink, pal.inkSoft, 0.5), shade: pal.ink.clone() }, split: 0.2, rag: 0.09 }),
    hand: part({ kind: 2, a: skin, split: 0.2 }),
    shoes: part({
      kind: 3, a: { lit: MIX(pal.ink, pal.inkSoft, 0.7), shade: MIX(pal.ink, pal.inkSoft, 0.25) },
      b: { lit: MIX(pal.paper, pal.litWarm, 0.12), shade: MIX(pal.paper, pal.shadeCool, 0.45) },
      c: { lit: MIX(pal.ink, pal.inkSoft, 0.2), shade: pal.ink.clone() },
      d: { lit: MIX(pal.paper, pal.litWarm, 0.05), shade: MIX(pal.paper, pal.shadeCool, 0.3) },
      rag: 0.18,
    }),
    tattoo: part({ kind: 0, a: { lit: MIX(pal.inkSoft, skin.lit, 0.5), shade: MIX(pal.ink, skin.shade, 0.4) }, split: 0.16, grain: 0.1, line: 0 }),
    contact: runnerContact(T, pal),
  };
  inkSleeveFull(parts.tattoo, 'ink-runner-3-tattoo');
  // what the rig is built from before it is painted
  parts.accent = parts.hand;
  parts.hair = parts.beard = parts.cap = parts.head;
  return parts;
}

/**
 * The runner's materials for the style: the figure as he was, or with
 * runner.look the drawn figure (1) or the sculpted one (2), whose rigs name
 * their pieces. The parts are repainted onto the rig itself as soon as it is
 * built (the sculpted figure) or on the first frame after.
 */
export function inkRunnerMaterials({ THREE: T, uniforms, palette: pal, autoPaint = true }) {
  const look = P['runner.look'];
  const parts = look > 1 ? figureParts(T, uniforms, pal) : look > 0 ? drawnRunnerParts(T, uniforms, pal) : runnerParts(T, uniforms, pal);
  const { body, accent, hair, beard, cap, tattoo, contact } = parts;

  // The rig does not exist on the first call: it is built from these materials.
  // Later palette repaints swap the whole small material set in place, keeping
  // the rig, gait and camera state untouched.
  let cancelled = false;
  const exposed = { body, accent, hair, beard, cap, tattoo };
  if (contact) exposed.contact = contact;
  Object.defineProperties(exposed, {
    parts: { value: parts },
    paint: { value: (rig) => paintRunner(parts, rig) },
    replace: {
      value: (rig, next) => {
        const replacements = new Map();
        for (const [name, material] of Object.entries(parts)) replacements.set(material, next.parts[name]);
        rig.traverse((child) => {
          if (!child.isMesh) return;
          if (Array.isArray(child.material)) child.material = child.material.map((material) => replacements.get(material) || material);
          else child.material = replacements.get(child.material) || child.material;
        });
      },
    },
    dispose: {
      value: () => {
        cancelled = true;
        new Set(Object.values(parts)).forEach((material) => material.dispose());
      },
    },
  });
  if (autoPaint) {
    let tries = 0;
    const start = () => {
      if (cancelled) return;
      const app = window.__app;
      if (!app || !app.runner) { if (tries++ < 300) requestAnimationFrame(start); return; }
      exposed.paint(app.runner.object3D);
      guardNames(T);
    };
    if (window.__app && window.__app.runner) start();
    else if (typeof requestAnimationFrame === 'function') requestAnimationFrame(start);
  }
  return exposed;
}

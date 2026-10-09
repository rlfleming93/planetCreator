/* Planet Creator — the space a week hangs in (sky.space).
 *
 * Today the orbit stands on bare paper. With sky.space up, the sheet behind the
 * globe is the week's own sky: the ink laid over the whole of it and left to dry
 * black, a field of stars standing in the tooth of the paper, the galaxy's band
 * across the frame with its dust drawn out of it, a nebula blown out of the
 * week's own weather, and — far off, the smallest thing in the picture — a
 * scatter of furthest galaxies. It is drawn from orbit and lifted as the camera
 * lands, because the surface wears its own sky.
 *
 * One shell, and it writes no depth. Every screen pass in the app asks the depth
 * buffer what is sky — the wash, the hand, every print — by testing
 * depth >= 0.99998, and the band of air the world's own edge gathers
 * (light.atmosphere) draws only where the depth beside it is sky; the pixels of
 * an unwritten background keep the cleared 1.0, which is the one value all of
 * them read as sky. So the shell writes none: it is laid over the day sky and
 * leaves the sheet's own bareness behind it, and every one of those passes still
 * sees space exactly where it always did.
 *
 * What that costs is that its radius is not free. The style's post pass sets the
 * camera to near 0.3 / far 2000 (ink.js makePost), so the shell is stood at
 * SHELL_SHARE of the camera's own far plane, read again each frame: as far out
 * as the frustum reaches, so that every cloud, ring, moon and sun is in front of
 * it, and never outside the plane it would be clipped by. It is centred on the
 * eye, so its depth is the same everywhere on it, and the whole picture is
 * always inside it.
 *
 * It is laid in the transparent list with renderOrder -10: that list is drawn
 * after the whole opaque pass, in which the style's own day sky is the last
 * thing (renderOrder 10), so the shell covers the day sky from orbit while every
 * cloud, ring, sun and print still draws over it — and, because it writes no
 * depth, nothing drawn after it can be hidden by it either. Its alpha is what
 * the handoff needs: as the camera lands, the sky comes off the sheet through
 * the paper's own tooth, and what is left behind it is the painted sky of the
 * surface.
 *
 * Where its furniture stands is the poster's own doing. The field is the week's,
 * but the band, the nebulae and the far galaxies are hung on the eye the poster
 * is FIRST looked from — the app frames the orbit before it paints, so that eye
 * is the poster's resting eye — which is what puts the band across the frame
 * rather than round the corner and puts a nebula behind the world, for the globe
 * to be read against. They are hung once and never laid out again: a sky does
 * not rearrange itself because the viewer walked round the world.
 *
 * Nothing here is random. The week's own name seeds the whole sky — the band's
 * bearing, the nebulae, the salt of the field — so the same week is the same sky
 * every time it is looked at; only the twinkle moves, and only on uTime.
 *
 * createSpace(shared) gets the same shared object as bodies/index.js and returns
 * { object, update?(frame), dispose? }; frame = { camera, surface, time }. The
 * module is always stood, and costs nothing while the dial is down: no shell is
 * built, nothing is added to the scene and nothing is drawn, so a week at every
 * dial's default is painted exactly as it was — and the sky can be laid and
 * lifted again while a poster is being looked at.
 */
import { P } from './params.js';

// The shell's radius as a share of the camera's own far plane (see the header):
// as far out as the frustum reaches, so that everything the app or a world
// stands in the scene is in front of it.
const SHELL_SHARE = 0.95;
// How far off the frame the band's own great circle is held: squared to the eye
// the poster looks from and tipped by this much, so the crossing is a diagonal
// and never a rule.
const BAND_TIP = 0.32;
// The handoff: the sky is lifted before the camera is under it, on the same
// curve the orbit's cloud sheet uses.
const LIFT_A = 0.12, LIFT_B = 0.56;

const clamp01 = (x) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

const VERT = /* glsl */ `
varying vec3 vDir;
void main(){
  // The shell is centred on the eye and never turned, so a vertex's own
  // position is the direction it stands in — the same reading the style's sky
  // dome takes (ink.js SKY_VERT).
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const NOISE = /* glsl */ `
float spH13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
float spH12(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float spN2(vec2 x){
  vec2 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(spH12(i), spH12(i + vec2(1.0, 0.0)), f.x),
             mix(spH12(i + vec2(0.0, 1.0)), spH12(i + vec2(1.0, 1.0)), f.x), f.y);
}
float spN3(vec3 x){
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(spH13(i), spH13(i + vec3(1.0, 0.0, 0.0)), f.x),
                mix(spH13(i + vec3(0.0, 1.0, 0.0)), spH13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y);
  float b = mix(mix(spH13(i + vec3(0.0, 0.0, 1.0)), spH13(i + vec3(1.0, 0.0, 1.0)), f.x),
                mix(spH13(i + vec3(0.0, 1.0, 1.0)), spH13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y);
  return mix(a, b, f.z);
}
// Two octaves is all a wash needs: a third is a texture, and the sky is a wash.
float spF3(vec3 p){ return spN3(p) * 0.65 + spN3(p * 2.63 + 11.3) * 0.35; }
// The sheet's own tooth (ink.js inkTooth, the same paper): the grain of the
// sheet, its fibre, and the pressed undulation under both. Fixed to the picture
// and never to the sky — this is the paper the sky is washed onto.
float spTooth(vec2 sp){
  float grain = spH12(floor(sp * 0.44)) * 0.55
              + spH12(floor(vec2(sp.x * 0.14, sp.y * 0.52) + 31.0)) * 0.28
              + spH12(floor(vec2(sp.x * 0.61, sp.y * 0.12) + 71.0)) * 0.17;
  return clamp(grain * 0.68 + spN2(sp * 0.19) * 0.32, 0.0, 1.0);
}
// One layer of the field. The sky is cut into cells of its own; a cell holds one
// candidate star, and the cell's own hash says whether it is lit, where inside
// it the star stands and how it burns. The star is pushed out onto the shell
// first, so what a pixel measures is the angle between two directions and a star
// is never a ring. A mark keeps its size on the sheet (uPx, the angle one pixel
// covers), and never reaches across its own cell, so the grain of the field can
// never show through as a square. salt is the week: it is the cell's own seed, so
// one week's field is another week's field. live is the share of the sky's own
// cells that hold a star of this layer at all — the caller works the band's
// density and its own drift into it, so a layer that wants only a few giants
// asks for a few per cent — and cut is where the layer's three colours begin to
// show.
vec3 spField(vec3 d, float K, float salt, float live, float scale, float gain, vec3 cut){
  vec3 id = floor(d * K);
  float h = spH13(id + salt);
  if (h > live) return vec3(0.0);
  vec3 p = normalize(id + 0.5 + (vec3(spH13(id + salt + 1.3), spH13(id + salt + 7.1), spH13(id + salt + 13.7)) - 0.5) * 0.58);
  // The offset to the star is taken BEFORE the squares cancel: 2 - 2 dot(d, p)
  // is the same number, but for a star the eye is nearly on it is the difference
  // of two nearly equal ones, and float32 gives back noise where the mark's own
  // falloff is steepest — which a still never shows and a slow pan would, as a
  // field of marks that flash. Subtraction first, square after, and the mark is
  // the same mark at every subpixel the camera stops at.
  vec3 pd = d - p;
  float q2 = dot(pd, pd);
  float hi = spH13(id + salt + 23.9);
  // The mark's own radius, in RADIANS — the same measure q2 is in, never in
  // cells: the mark is the better part of a pixel across at the sheet's own
  // scale, so it lands on a pixel and keeps its size however the poster is
  // pulled, and the cap is a fifth of its own cell, so the square grain of the
  // field can never show through a mark that has outgrown its cell.
  float r = min(uPx * scale * (0.70 + 0.85 * hi * hi), 0.22 / K);
  float core = exp(-q2 / (r * r * 0.55));
  float air = exp(-q2 / (r * r * 2.20));
  float tw = 0.76 + 0.24 * sin(uTime * (0.22 + 0.74 * h) + hi * 6.283);
  // how bright the star burns is its own draw, and not the draw that chose
  // whether it stands at all: a layer that keeps one cell in twenty would
  // otherwise keep only the dimmest twentieth of them
  float burn = spH13(id + salt + 41.3);
  float on = (core * 0.62 + air * 0.38) * (0.26 + 0.74 * burn) * tw * gain;
  vec3 tint = uStarPale;
  tint = mix(tint, uStarA, step(cut.x, hi));
  tint = mix(tint, uStarB, step(cut.y, hi));
  tint = mix(tint, uStarC, step(cut.z, hi));
  return tint * on;
}
`;

const FRAG = /* glsl */ `
uniform float uTime, uFade, uSeed, uWet, uHot, uAcc, uPx, uRidge;
uniform vec3 uQuiet;       // sky.ridge: the middle of the quiet passage beside the planet
#ifdef SPACE_LOD
uniform float uDetail;      // feature LOD (base.js): 1 lays every wash, 0 leaves the finest of them out
#endif
uniform vec3 uVoidDeep, uVoidLift, uBandPale, uBandCore, uBandCool;
uniform vec3 uNebCool, uNebWarm, uNebAccent;
uniform vec3 uStarPale, uStarA, uStarB, uStarC;
uniform vec3 uBandN;        // the band's own plane, squared to the eye the poster looks from
uniform vec4 uBandT;        // a bearing along it, and its width
uniform vec4 uNeb[3];       // each nebula: its bearing, and the cosine it is cut at
uniform vec4 uNebK[3];      // its strength, the size of its core, its own warmth, its spread
uniform vec4 uGal[10];      // each far galaxy: its bearing, and the cosine it is cut at
uniform vec4 uGalA[10];     // the way its disc lies, and how round it is
uniform vec4 uGalT[10];     // its colour with its own light already in it, and its size
varying vec3 vDir;
${NOISE}
void main(){
  vec3 d = normalize(vDir);
  float tooth = spTooth(gl_FragCoord.xy);

  // ---- the void. One wash of the ink over the whole sheet and left to dry: the
  // pigment is thinner where the brush lifted (uVoidLift) and it gathers in the
  // tooth of the paper. Read in the sky's own chart — directions, never a map —
  // so the wash has no seam and no pole, however the camera turns.
  float wash = spF3(d * 2.2 + uSeed);
  // (feature LOD: the vein, the band's mottle and streams, the nebulae's gaps and
  // the band's dust of small stars are the finest washes here, eased to their
  // middle value and left out as uDetail falls. That is a program of its own,
  // SPACE_LOD, so at full detail the sky is the program it always was.)
#ifdef SPACE_LOD
  float vein = 0.5;
  if (uDetail > 0.0) {
    vein = spN3(d * 6.7 + 17.0);
    if (uDetail < 1.0) vein = mix(0.5, vein, uDetail);
  }
#else
  float vein = spN3(d * 6.7 + 17.0);
#endif
  vec3 c = mix(uVoidDeep, uVoidLift, smoothstep(0.32, 0.80, wash) * (0.35 + 0.65 * vein));

  // ---- the band. A great circle squared to the eye the poster looks from, so
  // it crosses the frame instead of passing behind the world, and tipped a
  // little, so the crossing is a diagonal and not a rule. A broad pale wash with
  // a loaded ridge inside it, the pigment drawn out of one flank along the dust,
  // and the whole of it heavier and warmer toward its own centre.
  float bt = dot(d, uBandN);
  float bs = dot(d, uBandT.xyz);
  float bw = uBandT.w;
  float clump = spF3(d * 2.9 + uSeed * 1.7);
#ifdef SPACE_LOD
  float mottle = 0.5;
  if (uDetail > 0.0) {
    mottle = spN3(d * 11.0 + 5.0);
    if (uDetail < 1.0) mottle = mix(0.5, mottle, uDetail);
  }
#else
  float mottle = spN3(d * 11.0 + 5.0);
#endif
  // The band's own grain is read in the band's own chart — along its length and
  // across it — so what is drawn runs WITH the galaxy: streamers of dust, gaps
  // between them, and a ridge that is loaded here and thin there. Noise read off
  // a sphere instead would only ever lay a blur over the top of it.
  float along = spN2(vec2(bs * 5.4, bt * 36.0) + vec2(uSeed * 0.7, 3.1));
#ifdef SPACE_LOD
  float stream = 0.5;
  if (uDetail > 0.0) {
    stream = spN2(vec2(bs * 19.0 + uSeed * 1.3, bt * 11.0));
    if (uDetail < 1.0) stream = mix(0.5, stream, uDetail);
  }
#else
  float stream = spN2(vec2(bs * 19.0 + uSeed * 1.3, bt * 11.0));
#endif
  float grain = clamp(0.30 + 0.70 * along, 0.0, 1.4) * (0.60 + 0.40 * stream);
  float nucleus = smoothstep(0.55, -0.25, bs);            // the loaded end of it
  // sky.ridge (uRidge): the galaxy gathered into one loaded ridge with real dark
  // gaps through it. The skirt goes, the body narrows and comes apart into the
  // band's own clumps, and the ridge wanders a little off the great circle and is
  // loaded only where those clumps are, with the void between its lengths; the
  // lanes beside it cut deeper. Most of the band's light is then the ridge's.
  float wander = uRidge > 0.0 ? (spN2(vec2(bs * 3.1 + uSeed * 1.9, 7.7)) - 0.5) * bw * 0.36 * uRidge : 0.0;
  float bt2 = bt - wander;
  float seg = mix(1.0, smoothstep(0.38, 0.62, clump), uRidge);
  float bwB = bw * mix(1.0, 0.60, uRidge);
  // ...and a quiet passage of sky beside the planet, which the band, its skirt and
  // the nebulae leave alone: somewhere for the eye to rest beside the world
  float quiet = 1.0 - 0.85 * uRidge * smoothstep(0.955, 0.997, dot(d, uQuiet));
  // Three widths of it, the way a band is really laid: a wide faint skirt of
  // wash, the body of it, and inside that the ridge it was loaded twice along —
  // and between the ridge and the body, the dust drawn out of it in two lanes.
  // The ridge has to carry the band (it is the brightest thing in it) and the
  // lanes have to be a real cut, or the whole thing reads as one grey plume.
  float skirt = exp(-(bt / (bw * 1.9)) * (bt / (bw * 1.9))) * (0.35 + 0.65 * clump) * (1.0 - 0.82 * uRidge);
  float band = exp(-(bt / bwB) * (bt / bwB)) * mix(0.24 + 0.76 * clump, 0.06 + 0.94 * seg, uRidge) * (0.62 + 0.38 * nucleus) * grain;
  float rw = bw * mix(0.30, 0.24, uRidge);
  float ridge = exp(-(bt2 / rw) * (bt2 / rw)) * (0.18 + 0.82 * clump) * (0.55 + 0.45 * nucleus)
              * (0.30 + 0.70 * along) * mix(1.0, 0.04 + 1.45 * seg, uRidge);
  c += uBandPale * (band * mix(0.82, 0.30, uRidge) + skirt * 0.24) * 0.95 * quiet;
  c += uBandCore * ridge * (0.50 + 0.50 * mottle) * mix(1.0, 1.15, uHot) * quiet;
  // The dust lanes are cut BESIDE the ridge, inside the body of the band — where
  // the dust of a galaxy really lies — so the bright ridge stands out of a cut
  // rather than the band simply fading off at its own edge.
  float rift = exp(-((bt2 - 0.058) / (bw * 0.14)) * ((bt2 - 0.058) / (bw * 0.14)))
             + 0.55 * exp(-((bt2 + 0.058) / (bw * 0.11)) * ((bt2 + 0.058) / (bw * 0.11)));
  c = mix(c, c * 0.22 + uBandCool * 0.09, clamp(rift * (0.30 + 0.70 * stream) * (0.35 + band + 0.4 * ridge) * mix(1.5, 2.4, uRidge), 0.0, 1.0));

  // ---- the nebula. The week's own weather blown into the dark. Its sweat is
  // how wet the sheet was: a wet week's pigment runs, so its nebula spreads and
  // veils, and a dry one's stopped where it was laid and keeps a tight, bright
  // core. Its warmth is the hue — a hot week's ember against a cold week's pale
  // blue — and the week's own mineral is left in the filaments of it.
  for (int i = 0; i < 3; i++) {
    vec4 nb = uNeb[i];
    float ca = dot(d, nb.xyz);
    if (ca < nb.w) continue;
    vec4 nk = uNebK[i];
    // the chord, taken before the squares cancel (see spField): the same number
    // as 2 - 2 dot, and the same number at every subpixel the camera stops at
    vec3 nd = d - nb.xyz;
    float q = dot(nd, nd);
    float sig = nk.w * mix(0.70, 1.14, uWet);
    float fall = exp(-q / (sig * sig));
    // The veil has run out and the core with it (a core is always smaller than
    // the veil it stands in), so there is nothing here to draw filaments in: the
    // sky past the third width of a nebula is the sky, and reading its noise
    // would be paying for a wash that is not on the sheet.
    if (fall < 0.006) continue;
    // The filaments are read across the nebula's own tangent plane, stretched
    // along one bearing of it: pigment blown into a damp sky runs one way, and a
    // cloud that is only soft in every direction is a spotlight and not a nebula.
    vec3 nu = cross(nb.xyz, vec3(0.11, 0.97, 0.21));
    nu = normalize(mix(nu, vec3(1.0, 0.0, 0.0), step(length(nu), 0.04)));
    vec3 nv = cross(nb.xyz, nu);
    float fil = spF3(vec3(dot(d, nu) * 2.6, dot(d, nv) * 8.4, float(i) * 19.1 + uSeed * 2.3));
    float veins = pow(clamp(1.0 - abs(2.0 * fil - 1.0), 0.0, 1.0), mix(2.6, 1.2, uWet));
    // Pigment blown into a damp sky is never an even veil: where the sheet was
    // already wet the wash broke and left the paper, so the veil is read through
    // its own noise and comes apart into patches, and only where the brush was
    // loaded does it hold together. A dry week's was stopped where it was laid:
    // a small core, held tight; a wet week's ran, and keeps almost nothing of one.
    float broke = smoothstep(0.24, 0.64, fil * (0.72 + 0.42 * veins));
    // and the wash is not one sheet of damp: it was laid in passes, so two to
    // four of them never touched the paper at all and the veil is missing there
#ifdef SPACE_LOD
    float gap = 0.5;
    if (uDetail > 0.0) {
      gap = smoothstep(0.30, 0.68, spF3(vec3(dot(d, nu) * 6.1 + 4.3, dot(d, nv) * 3.7 + 9.1, float(i) * 7.7 + uSeed * 1.9)));
      if (uDetail < 1.0) gap = mix(0.5, gap, uDetail);
    }
#else
    float gap = smoothstep(0.30, 0.68, spF3(vec3(dot(d, nu) * 6.1 + 4.3, dot(d, nv) * 3.7 + 9.1, float(i) * 7.7 + uSeed * 1.9)));
#endif
    broke *= 0.16 + 0.84 * gap;
    float cr = nk.y * mix(1.0, 0.66, clamp(1.0 - 1.4 * uWet, 0.0, 1.0));
    float core = exp(-q / (cr * cr));
    vec3 ember = mix(uNebCool, uNebWarm, clamp(mix(nk.z, 1.0, uHot), 0.0, 1.0));
    // (sky.ridge: most of the veil lets go into the void; the core and its filaments stay)
    float lit = fall * (0.08 + 0.92 * veins) * (0.35 + 0.65 * broke) * mix(0.55, 0.95, 1.0 - 0.5 * uWet) * mix(1.0, 0.35, uRidge)
              + core * mix(0.72, 0.34, uWet) * mix(1.0, 0.90, uRidge);
    c += ember * (lit * nk.x) * quiet;
    c += uNebAccent * (veins * fall * core * uAcc * 1.6);
  }

  // ---- the furthest galaxies. Ten smudges the painter dragged his thumb
  // across: each a disc seen at an angle, soft in every direction but its own
  // and with a nucleus in it that is not a star's point — the smallest thing in
  // the picture and the only thing in it that is not the week.
  for (int i = 0; i < 10; i++) {
    vec4 g = uGal[i];
    float ca = dot(d, g.xyz);
    if (ca < g.w) continue;
    vec3 rel = d - g.xyz * ca;                            // the offset across the eye
    vec4 ga = uGalA[i];
    vec4 gt = uGalT[i];
    float u = dot(rel, ga.xyz);
    float v = dot(rel, cross(ga.xyz, g.xyz));
    float r2 = (u * u + v * v / max(0.04, ga.w * ga.w)) / (gt.w * gt.w);
    c += gt.rgb * (exp(-r2 * 0.80) * 0.42 + exp(-r2 * 5.0) * 0.92);
  }

  // The dust is a wash and not a spray: it belongs to the band, so it gathers
  // there and drifts away from it in its own weather, thinning until the sky
  // outside the band is nearly bare and the eye is given somewhere quiet to
  // rest. What stands everywhere is the layer of stars that read one by one —
  // five hundred of them over a poster, not five thousand — and the handful big
  // enough to have a colour of their own.
  float drift = 0.30 + 0.70 * spN3(d * 3.4 + uSeed * 4.1);
  float inBand = min(1.0, band);
#ifdef SPACE_LOD
  if (uDetail > 0.0) {
    vec3 dust = spField(d, 132.0, uSeed + 3.0, 0.05 + 0.54 * inBand * (0.40 + 0.60 * drift), 0.95, 0.66 * (0.40 + 0.60 * drift), vec3(0.94, 0.985, 0.998));
    if (uDetail < 1.0) dust *= uDetail;
    c += dust;
  }
#else
  c += spField(d, 132.0, uSeed + 3.0, 0.05 + 0.54 * inBand * (0.40 + 0.60 * drift), 0.95, 0.66 * (0.40 + 0.60 * drift), vec3(0.94, 0.985, 0.998));
#endif
  c += spField(d, 64.0, uSeed + 47.0, 0.03 + 0.19 * drift + 0.14 * inBand, 1.35, 0.95 * (0.60 + 0.40 * drift), vec3(0.90, 0.972, 0.996));
  c += spField(d, 27.0, uSeed + 91.0, 0.045 + 0.05 * inBand, 2.70, 1.60, vec3(0.58, 0.840, 0.950));

  // ---- the sheet. The void is a wash like any other, so the tooth takes the
  // pigment: the darkest passage in the picture is granulated and never flat,
  // and the grain is heavier where the pigment is heavier, which is where it
  // would have settled. motion.living never enters this — the tooth is read at
  // the fragment's own pixel, so the paper the sky is washed onto stays the
  // paper the viewer is looking at.
  float pigment = 1.0 - clamp(dot(c, vec3(1.6)) * 0.5, 0.0, 1.0);
  c += uVoidLift * (tooth - 0.5) * (0.42 + 0.40 * pigment);
  // The lift-off. As the camera lands the sky comes off the sheet through the
  // same tooth, and what is left behind it is the surface's painted sky.
  gl_FragColor = vec4(c, clamp(uFade * 1.35 - 0.35 * tooth, 0.0, 1.0));
}
`;

export function createSpace(shared) {
  const { THREE: T, scene, renderer, features, palette, uniforms } = shared;
  const pal = palette || {};
  const rng = features.makeRng('space');
  const size = new T.Vector2();

  const dial = () => clamp01(num(Number(P['sky.space']), 0));

  // ---- the week's own weather, in the two numbers the brief asks for: how wet
  // its air was (its sweat, against the race week's 6.3 L, the anchor the whole
  // palette is mixed against) and how warm (its own temperature, 20.3 °C being
  // that same anchor). Both are read once: the sky over a week never changes.
  const stats = features.stats || {};
  const tempC = num(stats.tempC, num(features.warmth, 0.68) * 30);
  const sweatL = num(stats.sweatL, 4.2);
  const wet = clamp01(Math.log2(Math.max(sweatL, 0.5) / 6.3) / 2.4 + 0.62);
  const hot = clamp01((tempC - 6) / 20);

  // ---- the palette, taken as the week mixed it (raw values: the style turns
  // colour management off, so a colour is used exactly as the palette holds it).
  const col = (c, hex) => (c && c.clone ? c.clone() : new T.Color(hex));
  const paper = col(pal.paper, 0xe6dfcd);
  const paperWet = col(pal.paperWet, 0xd4cfbe);
  const dark = col(pal.dark, 0x141c33);
  const cobalt = col(pal.cobalt, 0x294a78);
  const skyWash = col(pal.skyWash, 0xa9b4cc);
  const skyDeep = col(pal.skyDeep, 0x5e7199);
  const litWarm = col(pal.litWarm, 0xd6a462);
  const crest = col(pal.crest, 0xe3e6d6);
  const vermilion = col(pal.vermilion, 0xc53e25);
  const bare = col(pal.bare, 0x8c5433);
  const accent = col(pal.accent, 0x6d5238);

  // the void: a sky this dark is still a wash of some pigment and never a hole
  // cut in the sheet, so it is the week's own blue taken down with a third of
  // the week's dark pigment stirred into it — and then the night is always
  // bluer than the week: whatever that blue is (a week grown green carries a
  // teal one) the ink of space takes it with the green drawn out and the blue
  // let in, so every week's night is an indigo and never a green sky, and a hot
  // week's sky stays a night sky with an ember in it instead of turning the
  // whole sheet the red-brown its own darks run to.
  const nightBias = new T.Color(0.80, 0.66, 1.12);
  const voidDeep = cobalt.clone().multiplyScalar(0.26).lerp(dark.clone().multiplyScalar(0.38), 0.34).multiply(nightBias);
  const voidLift = cobalt.clone().multiplyScalar(0.48).lerp(dark.clone().multiplyScalar(0.44), 0.30).multiply(nightBias).lerp(paper, 0.030);
  // the band: the wet paper's white, warmed a little and cooled a little — a
  // band laid in dead neutral grey over an indigo sheet reads as a smear and not
  // as the galaxy — the week's own light for the loaded ridge of it, and the
  // ink's blue for the dust drawn out of it
  const bandPale = paperWet.clone().lerp(litWarm, 0.20).lerp(skyWash, 0.16).multiplyScalar(0.26);
  const bandCore = paper.clone().lerp(litWarm, 0.34).multiplyScalar(0.30);
  const bandCool = cobalt.clone().multiplyScalar(0.30).multiply(nightBias);
  // the nebula: the week's own blue for its haze, the week's warm light for the
  // ember at its heart, and the mineral its sports left in the rock
  const nebCool = skyDeep.clone().lerp(cobalt, 0.45).multiply(nightBias).multiplyScalar(0.66);
  const nebWarm = litWarm.clone().lerp(bare, 0.28).multiplyScalar(0.36);
  const nebAccent = accent.clone().multiplyScalar(0.55);
  // the stars: the paper's own white for the field, and three that are allowed a
  // colour — the week's light burnt to an ember, its sky's own blue, its
  // vermilion left as a rose
  const starPale = paper.clone().lerp(crest, 0.40);
  const starA = litWarm.clone().lerp(vermilion, 0.22);
  const starB = skyWash.clone().lerp(paper, 0.34);
  const starC = vermilion.clone().lerp(paper, 0.34);

  // ---- where the sky's own furniture stands. It is hung on the eye the poster
  // is looked from, and it is hung once, on the first frame there is an eye to
  // hang it on: the app frames the orbit before its first frame, so that eye is
  // the poster's own resting eye. The band's plane runs through it — which is
  // what puts the band across the frame instead of round the corner — the
  // nebulae stand where the picture has room for them, and a sky does not lay
  // itself out again because the viewer walked round the world.
  const uNeb = [], uNebK = [], uGal = [], uGalA = [], uGalT = [];
  const uBandN = new T.Vector3(0, 0, 1);
  const uBandT = new T.Vector4(1, 0, 0, 0.2);
  const uQuiet = new T.Vector3(0, 0, 1);
  let composed = false;

  function compose(eye) {
    composed = true;
    const up = Math.abs(eye.y) > 0.94 ? new T.Vector3(1, 0, 0) : new T.Vector3(0, 1, 0);
    const e1 = new T.Vector3().crossVectors(eye, up).normalize();
    const e2 = new T.Vector3().crossVectors(eye, e1).normalize();
    // the band: its plane through the eye, turned by the week's own angle so the
    // crossing is not a rule, and tipped a little so the middle of the band is
    // off the frame's own centre
    const spin = rng() * Math.PI * 2;
    const n = e1.clone().multiplyScalar(Math.cos(spin)).addScaledVector(e2, Math.sin(spin));
    n.addScaledVector(eye, (rng() - 0.5) * BAND_TIP).normalize();
    uBandN.copy(n);
    const t = new T.Vector3().crossVectors(n, eye);
    if (t.lengthSq() < 1e-8) t.copy(e1);
    t.normalize();
    uBandT.set(t.x, t.y, t.z, 0.105 + rng() * 0.045);
    // the quiet passage (sky.ridge): beside the globe, on the side of it away from
    // the band, a little over one globe's width off the eye
    const across = n.clone().addScaledVector(eye, -n.dot(eye));
    if (across.lengthSq() > 1e-8) across.normalize(); else across.copy(e1);
    uQuiet.copy(eye).addScaledVector(across, n.dot(eye) >= 0 ? 0.30 : -0.30).normalize();
    // one nebula behind the world, which is where the poster's eye is pointed, so
    // the globe is read against its glow — stood just off to one side of the disc
    // and kept small: a veil that reaches the whole of the frame is a fog and not
    // a nebula, and it would take the darkness the sky needs away with it
    const behind = eye.clone()
      .addScaledVector(e1, (rng() - 0.5) * 0.56)
      .addScaledVector(e2, (rng() - 0.5) * 0.56).normalize();
    nebulae.push({ dir: behind, spread: 0.16 + rng() * 0.06, core: 0.10 + rng() * 0.04, strength: 0.58 + rng() * 0.14, warm: 0.30 + rng() * 0.35 });
    // one on the band: the loaded knot of it
    const knotAt = rng() * Math.PI * 2;
    const onBand = t.clone().multiplyScalar(Math.cos(knotAt)).addScaledVector(eye, Math.sin(knotAt) * 0.30).normalize();
    nebulae.push({ dir: onBand, spread: 0.13 + rng() * 0.05, core: 0.07 + rng() * 0.03, strength: 0.72, warm: 0.45 });
    // one out in the poster's own field, where the frame has room for it — hung
    // inside the frame rather than anywhere on the sphere, because a nebula the
    // eye meets as a bloom cut by the frame's edge reads as a spotlight and not
    // as weather
    const na = rng() * Math.PI * 2;
    const nout = 0.34 + rng() * 0.18;
    const aside = eye.clone()
      .addScaledVector(e1, Math.cos(na) * nout)
      .addScaledVector(e2, Math.sin(na) * nout * 0.62).normalize();
    nebulae.push({ dir: aside, spread: 0.17 + rng() * 0.05, core: 0.09 + rng() * 0.03, strength: 0.44, warm: 0.18 });

    // ---- the furthest galaxies: ten of them, the smallest thing in the picture
    // and the only thing in it that is not the week. Most are hung in the
    // poster's own frame — a loose ring of them clear of the world's disc, out
    // where the corners of the eye are — because a sky whose only marks stand
    // round the corner is a sky nobody ever sees; the rest are let loose
    // anywhere on the sphere, because a sky is not a decoration on a frame.
    // Each has its own bearing, its own way of lying to the eye and its own
    // light, reddened a little by the distance it is at.
    const galPale = paperWet.clone().lerp(skyWash, 0.30);
    for (let i = 0; i < 10; i++) {
      let dir;
      if (i < 7) {
        const a = (i / 7) * Math.PI * 2 + (rng() - 0.5) * 0.7;
        const out = 0.30 + rng() * 0.20;                 // radians off the eye: outside the world's disc, inside the frame
        dir = eye.clone()
          .addScaledVector(e1, Math.cos(a) * out)
          .addScaledVector(e2, Math.sin(a) * out * 0.62).normalize();
      } else {
        const gu = rng() * 2 - 1, ga = rng() * Math.PI * 2, gr = Math.sqrt(Math.max(0, 1 - gu * gu));
        dir = new T.Vector3(gr * Math.cos(ga), gu, gr * Math.sin(ga));
        if (dir.dot(eye) > 0.90) dir.negate();
        dir.normalize();
      }
      const axis = e1.clone().multiplyScalar(rng() - 0.5)
        .addScaledVector(e2, rng() - 0.5)
        .addScaledVector(eye, rng() - 0.5);
      axis.addScaledVector(dir, -axis.dot(dir));
      if (axis.lengthSq() < 1e-6) axis.copy(e1);
      axis.normalize();
      const galSize = 0.011 + rng() * rng() * 0.020;
      const aspect = 0.24 + rng() * 0.34;
      const tint = galPale.clone();
      if (rng() < 0.3) tint.lerp(vermilion, 0.20 + rng() * 0.20);        // gone red with distance
      else tint.lerp(skyDeep, 0.05 + rng() * 0.18);
      galaxies.push({ dir, axis, aspect, size: galSize, tint: tint.multiplyScalar(0.15 + rng() * 0.15) });
    }

    for (const nb of nebulae) {
      uNeb.push(new T.Vector4(nb.dir.x, nb.dir.y, nb.dir.z, Math.cos(Math.min(2.4 * nb.spread * 1.26, 1.35))));
      uNebK.push(new T.Vector4(nb.strength, nb.core, nb.warm, nb.spread));
    }
    for (const g of galaxies) {
      uGal.push(new T.Vector4(g.dir.x, g.dir.y, g.dir.z, Math.cos(Math.min(3.2 * g.size, 1.2))));
      uGalA.push(new T.Vector4(g.axis.x, g.axis.y, g.axis.z, g.aspect));
      uGalT.push(new T.Vector4(g.tint.r, g.tint.g, g.tint.b, g.size));
    }
  }

  const nebulae = [], galaxies = [];

  const seed = rng() * 977;
  let shell = null, material = null, geometry = null;
  // the same sky with its finest washes eased out (SPACE_LOD, see FRAG), on the very same uniforms, and the mesh it is
  // compiled through: built only when the feature LOD first engages (see update)
  let materialLod = null, lodProbe = null, lodReady = false;

  function stand() {
    // a unit sphere, stood at SHELL_SHARE of the frame's own far plane: the
    // shader reads directions, not lengths, so the radius is the camera's to say
    geometry = new T.SphereGeometry(1, 48, 32);
    material = new T.ShaderMaterial({
      uniforms: {
        uTime: uniforms?.uTime || { value: 0 },
        uFade: { value: 1 },
        uSeed: { value: seed },
        uWet: { value: wet },
        uHot: { value: hot },
        uAcc: { value: num(pal.accentAmt, 0) },
        uPx: { value: 0.001 },
        uDetail: { value: 1 },
        uRidge: { value: 1 },
        uQuiet: { value: uQuiet },
        uVoidDeep: { value: voidDeep },
        uVoidLift: { value: voidLift },
        uBandPale: { value: bandPale },
        uBandCore: { value: bandCore },
        uBandCool: { value: bandCool },
        uNebCool: { value: nebCool },
        uNebWarm: { value: nebWarm },
        uNebAccent: { value: nebAccent },
        uStarPale: { value: starPale },
        uStarA: { value: starA },
        uStarB: { value: starB },
        uStarC: { value: starC },
        uBandN: { value: uBandN },
        uBandT: { value: uBandT },
        // every uniform is a slot, even an array of them: three.js reads .value
        uNeb: { value: uNeb },
        uNebK: { value: uNebK },
        uGal: { value: uGal },
        uGalA: { value: uGalA },
        uGalT: { value: uGalT },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: T.BackSide,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    shell = new T.Mesh(geometry, material);
    shell.name = 'ink-space';
    // behind everything: the transparent list is drawn after the whole opaque
    // pass, and this is laid first in it, under every cloud, ring and sun
    shell.renderOrder = -10;
    shell.frustumCulled = false;
    shell.visible = false;
    scene.add(shell);
  }
  // The lighter program, compiled off the frame (KHR_parallel_shader_compile) as soon as the app asks for any feature
  // LOD at all: the sky is several levels down the ladder (ink.js LOD_ORDER), so it is ready long before it is used.
  function prepareLod(camera) {
    materialLod = new T.ShaderMaterial({
      uniforms: material.uniforms,
      defines: { SPACE_LOD: '' },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: T.BackSide,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    lodProbe = new T.Mesh(geometry, materialLod);
    renderer.compileAsync(lodProbe, camera, scene).then(() => { lodReady = true; }, () => {});
  }

  // the shell's alpha is clamp(fade × 1.35 − 0.35 × tooth): at a full fade it is 1 on every pixel it draws, and the
  // style need not paint the day sky under it (ink.js)
  let opaque = false;
  function update({ camera, surface, lod = 1, level = 0 } = {}) {
    // the dial is read again every frame, so a sky can be lifted and laid while
    // a poster is looked at; with it at 0 nothing is ever stood
    const fade = dial() * (1 - sstep(LIFT_A, LIFT_B, clamp01(num(surface, 0))));
    opaque = false;
    if (fade <= 0.002) {
      if (shell) shell.visible = false;
      return;
    }
    if (!camera) return;
    // the sky is hung on the eye the poster is first looked from, and never again
    if (!composed) {
      const eye = camera.position.clone();
      if (eye.lengthSq() < 1e-6) eye.set(0, 0, 1); else eye.normalize().negate();
      compose(eye);
    }
    if (!shell) stand();
    if (shell.parent !== scene) scene.add(shell);
    shell.visible = true;
    shell.position.copy(camera.position);
    // as far out as the frustum reaches, so every cloud, ring, moon and sun
    // stands in front of the sky rather than behind it
    if (Number.isFinite(camera.far) && camera.far > 0) shell.scale.setScalar(camera.far * SHELL_SHARE);
    // A mark keeps its size on the sheet: the angle one pixel of this frame
    // covers, so the field is the same field at any size the poster is pulled at,
    // and a star is a point and not a blob.
    if (renderer && Number.isFinite(camera.fov)) {
      renderer.getDrawingBufferSize(size);
      if (size.y > 0) material.uniforms.uPx.value = (2 * Math.tan((camera.fov * Math.PI) / 360)) / size.y;
    }
    material.uniforms.uFade.value = fade;
    material.uniforms.uRidge.value = clamp01(num(Number(P['sky.ridge']), 0));
    // feature LOD: the lighter program once it is built and asked for (until then the sky stays whole)
    if (level > 0 && !materialLod) prepareLod(camera);
    material.uniforms.uDetail.value = clamp01(lod);
    shell.material = lod < 1 && lodReady ? materialLod : material;
    opaque = fade >= 1;
  }

  function dispose() {
    if (material) material.dispose();
    if (materialLod) materialLod.dispose();
    if (geometry) geometry.dispose();
    if (shell && shell.parent) shell.parent.remove(shell);
    shell = null;
    material = null;
    geometry = null;
  }

  // The sky cannot be stood here: it is hung on the eye the poster is looked
  // from, and the first frame is where that eye is first known (the app frames
  // the orbit before it paints). So the shell is stood by update, on the first
  // frame the dial is up with a camera — and with the dial down nothing is built,
  // added or drawn at all, which is what keeps a week at its defaults painted
  // exactly as it was.
  const api = {
    update,
    dispose,
    // what the sky was drawn from and what it is made of, for the bench and the
    // eye: the shell itself only exists once it has been stood, and this reads it
    // as it is now rather than as it was when the module was handed over
    get object() { return shell; },
    /** Whether this frame's shell covers everything behind it (see update). */
    get opaque() { return opaque; },
    week: features.week,
    wet,
    hot,
    share: SHELL_SHARE,
    nebulae: nebulae.length,
    galaxies: galaxies.length,
  };
  return api;
}

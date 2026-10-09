/* Planet Creator — the gas giant's cloud deck, and the moons beside it.
 *
 * A giant week is not a marble with bands painted on it. The week's globe is
 * under a shell — one sphere standing DECK_LIFT units over the ground — and the
 * shell is what the picture is: from orbit the ground never shows at all, and
 * the handoff is the crossing itself, the eye's own distance from the deck, so
 * the cloud stays whole until the camera is inside it, breaks into the masses it
 * is made of, and is gone under the cloud tops. What the eye lands on is the
 * deck it flew down through — the ground under it is built from the same band.
 *
 * The shell is drawn in the ink hand, one wash to a band:
 *
 *   the belts   latitude read nine and a half times to a belt, so a belt runs
 *               out along its own flow. Every field here is stretched along the
 *               flow: latitude is read three to sixty times as fast as the
 *               east-west direction, so noise that would be a blob becomes a
 *               filament. Three warps draw the boundary between a zone and a
 *               belt — a slow one carrying the whole belt, a quicker one tearing
 *               its edge, the brush leaving the rest — and a band's own widths
 *               are read off its index, so the deck swings from a belt two
 *               thirds of its cell to a lane of a brush's width, and cells that
 *               carry no belt at all. The washes meet on the one edge here that
 *               is never softened, and the pixel's own width is what spreads it:
 *               the two bands either side are mixed across it, so the boundary
 *               is hard and never a stair.
 *   the flow    the deck turns, and turns faster at the equator than at the
 *               poles: the sample every field is read at is the fragment's own
 *               direction turned about the axis by its own rate, so the belts
 *               shear against each other as the clock runs. uTime only, never
 *               Math.random: a capture is the same picture every time.
 *   the storms  the week's own sessions, at the sites where they were trained:
 *               the longest one is the great spot (its size from its hours, on
 *               the site's own latitude, its core in the week's mineral), the
 *               next few are white ovals. Each turns the deck's own coordinates
 *               about itself, so the belts are dragged round it and curl away
 *               behind it; each is a wash rather than a lid — its eye nearly
 *               opaque, its outer third let the belt behind it read through —
 *               with the ink pooled on a wandering radius, cut on the leading
 *               side and carried on downstream as a tapered wake. (giant.storms
 *               stands each storm in its own frame instead: the flow is dragged
 *               round it into an elliptical vortex before it is carried, so the
 *               storm is the belt it wound up; the wash, rim and wake above are
 *               the dial at 0.)
 *   the poles   a vortex at each end of the axis, and — at the north — the
 *               hexagon: a six-sided jet drawn on a wandering line, with the
 *               polar vortex wound inside it. It is masked to the pole by its own
 *               terms and never by a branch on the fragment's latitude: a
 *               derivative read inside a varying branch is undefined, and the
 *               seam it leaves is a dashed rule laid straight across the deck.
 *   the light   the light the globe is painted with, and no other. The day side
 *               is the wash, the night is the ink laid over it in two passes on
 *               a hand-cut boundary that wanders at four scales (light.
 *               terminator), and the very limb holds the haze and the drawn
 *               edge: the air is a fifth of a radius deep, so from close in the
 *               veil thickens long before the edge arrives.
 *
 * A mark keeps its size on the sheet: each octave of the weather is gated by the
 * world size of its own cell, read off the shell's radius, so a small cell loses
 * it rather than gathering it into a fringe. Nothing here is a second renderer:
 * the palette, the light, the clock and the surface handoff are all the ink
 * style's own uniforms and objects.
 *
 * The moons are simple ink cut-outs of our own (a lumpy sphere, one pigment to a
 * face, a wandering terminator, ink on the silhouette) — paintedMoon is gone and
 * this body does not depend on another module for its companions. They stand
 * well inside the deck's own orbit, and the near one wears a shadow on the
 * clouds: a ray test against the light every other surface here is lit by, so
 * the mark on the deck and the body that makes it are the same picture.
 */
import { P } from '../params.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
// A JS number as a GLSL float literal: a whole number written bare is an int,
// and vec3 * int does not compile.
const gl = (v) => (Number.isInteger(v) ? `${v}.0` : `${v}`);

// The shell's own lift over the globe, in units.
export const DECK_LIFT = 20;
// How many belts run from pole to pole: the band coordinate is latitude times
// this, so the globe wears twice as many bands as this number.
const BELTS = 9.5;
// giant.eddies: the lattice the eddies are hung on, cells round the equator and
// pole to pole (each cell holds at most one, kept inside it)
const EDDY_LON = 24, EDDY_LAT = 20;
// The storms the deck will carry: the great spot and the white ovals beside it.
const SPOTS = 6;
// The moons' sizes (units) and where they stand (planet radii): the giant's
// poster is taken from close in — the deck nearly fills the sheet — so both
// moons stand well inside the deck's own orbit, and both are small: a body
// crossing the belts at this range is a bead a few dozen pixels across, and it
// is the shadow it drops on the clouds, and not its own size, that says how far
// the giant runs. The first is the caster.
const MOON_R0 = 1.7, MOON_R1 = 2.9;
const MOON_D0 = 1.30, MOON_D1 = 1.62;
// How fast a moon goes round: slow enough to be a moon and not a firework, and
// read off uTime so a pinned capture is always the same frame.
const MOON_RATE = 0.0075;

/* ------------------------------------------------------------------ glsl --- */
// The sheet's noise, exactly as the ink style draws it (ink.js NOISE): the same
// hash, the same value noise, the same three-octave fbm — so a deck is drawn
// from the same hand as the ground under it. Copied rather than imported
// because ink.js keeps its glsl chunks to itself.

const NOISE = `
float inkH13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
float inkH12(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float inkN3(vec3 x){
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(inkH13(i), inkH13(i + vec3(1.0,0.0,0.0)), f.x), mix(inkH13(i + vec3(0.0,1.0,0.0)), inkH13(i + vec3(1.0,1.0,0.0)), f.x), f.y);
  float b = mix(mix(inkH13(i + vec3(0.0,0.0,1.0)), inkH13(i + vec3(1.0,0.0,1.0)), f.x), mix(inkH13(i + vec3(0.0,1.0,1.0)), inkH13(i + vec3(1.0,1.0,1.0)), f.x), f.y);
  return mix(a, b, f.z);
}
float inkF3(vec3 p){ float s = 0.0, a = 0.5, n = 0.0; for (int i = 0; i < 3; i++){ s += a * inkN3(p); n += a; p = p * 2.03 + vec3(1.7, -2.3, 0.9); a *= 0.5; } return s / n; }
float inkF3b(vec3 p){ float s = 0.0, a = 0.5, n = 0.0; for (int i = 0; i < 2; i++){ s += a * inkN3(p); n += a; p = p * 2.03 + vec3(1.7, -2.3, 0.9); a *= 0.5; } return s / n; }

// A mark keeps its size on the sheet: one of world size s survives while it is
// worth drawing (about 2 px) and is not drawn at all past that. This single
// line is the whole of the distance LOD.
float inkMark(float s, float fp){ return 1.0 - smoothstep(0.45, 0.95, fp / max(1e-5, s)); }

// Paper. Cold-press: the grains of the sheet and a slow undulation beneath
// them, fixed to the sheet and never to the world.
float inkTooth(vec2 sp){
  float grain = inkH12(floor(sp * 0.85)) * 0.52
              + inkH12(floor(vec2(sp.x * 0.24, sp.y * 1.05) + 31.0)) * 0.30
              + inkH12(floor(vec2(sp.x * 1.15, sp.y * 0.20) + 71.0)) * 0.18;
  return clamp(grain * 0.64 + 0.52 * (0.5 + 0.5 * sin(sp.y * 0.03) * sin(sp.x * 0.021)), 0.0, 1.0);
}
`;

const DECK_VERT = /* glsl */ `
varying vec3 vW;
varying vec3 vN;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const DECK_FRAG = /* glsl */ `
uniform vec3 uPaper, uInk, uInkSoft, uSepia;
uniform vec3 uLandLow, uLandMid, uLandHigh, uCrest, uDry, uBare;
uniform vec3 uLitWarm, uShadeCool, uSkyHaze, uAccent, uDark;
uniform vec3 uLight;         // the light the globe is painted with (ink.js st.light)
uniform float uTime, uPresence, uRate, uWarmth, uRough, uLiquid, uTerm;
uniform float uForm, uEddy;  // body.form, giant.eddies (see their blocks)
uniform float uStorm;        // giant.storms (see its blocks)
uniform float uShell;        // the shell's own radius: a mark's world size is read off it
uniform vec3 uMoonP;         // the small moon beside the giant, in world units
uniform float uMoonR;        // that moon's own radius
uniform float uMoonA;        // 1 when it stands between the deck and the light
uniform float uSpotN;
uniform vec4 uSpot[${SPOTS}];      // xyz: the session's own site (unit)  w: the oval's size
uniform vec4 uSpotLook[${SPOTS}];  // x: the oval's aspect  y: its own spin  z: its hand  w: its collar
varying vec3 vW;
varying vec3 vN;
${NOISE}

// The deck's two washes, each read off a band's own index: a zone is a pale one
// of the week's own light, a belt is the same week's deeper ground, and the two
// are hashed apart, so no two bands of the deck carry the same pair. Both are
// read for the bands either side of a boundary as well as for the band itself,
// which is what lets the boundary be mixed across the pixel rather than stepped
// (see the belts, below).
vec3 zoneWash(float i){
  float h = inkH12(vec2(i, 7.0));
  vec3 z = mix(uLitWarm, uCrest, mix(0.15, 1.0, h));
  return mix(z, uDry, 0.40 * step(0.70, h));
}
vec3 beltWash(float i){
  float hB = inkH12(vec2(i, 23.0));
  float hC = inkH12(vec2(i, 61.0));
  vec3 b = mix(uLandMid, uLandHigh, mix(0.30, 1.0, hB));
  b = mix(b, mix(uShadeCool, uLandHigh, 0.45), 0.55 * step(0.58, hC));
  return mix(b, uSepia, 0.35 * step(0.86, hC));
}

void main(){
  vec3 d = normalize(vW);
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float fp = max(1e-4, length(fwidth(vW)));
  float tooth = inkTooth(gl_FragCoord.xy);

  // ---- giant.storms. A storm stands in the flow and the flow is dragged
  // round it: the point the belts are read at is turned about each storm's own
  // site, on the storm's own oval, before the flow carries it — so the belt
  // drawn inside a storm is the belt the flow brought there, wound into the
  // vortex, and the storm and the pigment it is made of are one picture in one
  // frame. The core turns as one, the turn falls away round it, and the belts
  // beside it bend round the oval; each turns the way an anticyclone does in
  // its own hemisphere, and the week's longest session turns hardest.
  vec3 dd = d;
  float stormRim = 0.0;   // the shear along a storm's own edge: filaments gather there
  if (uStorm > 0.0) {
    for (int i = 0; i < ${SPOTS}; i++) {
      if (float(i) >= uSpotN) break;
      vec4 sp = uSpot[i];
      vec4 lk = uSpotLook[i];
      if (dot(d, sp.xyz) < 0.42) continue;
      vec3 ref = abs(sp.y) > 0.94 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
      vec3 nr = normalize(ref - sp.xyz * dot(ref, sp.xyz));
      vec3 e = cross(sp.xyz, nr);
      float sy = max(0.03, sp.w), sx = lk.x * sy;
      vec2 q = vec2(dot(dd, e) / sx, dot(dd, nr) / sy);
      float r = length(q);
      if (r > 2.4) continue;
      float great = i == 0 ? 1.0 : 0.0;
      float th = (sp.y > 0.0 ? -1.0 : 1.0) * mix(1.0 + 0.8 * lk.w, 3.4, great)
               * exp(-0.9 * r * r) * (1.0 - smoothstep(1.4, 2.4, r)) * uStorm;
      float ct = cos(th), st = sin(th);
      vec2 q2 = vec2(q.x * ct - q.y * st, q.x * st + q.y * ct);
      dd = normalize(dd + e * ((q2.x - q.x) * sx) + nr * ((q2.y - q.y) * sy));
      stormRim = max(stormRim, exp(-pow((r - 1.0) / 0.32, 2.0)) * mix(0.45, 1.0, great));
    }
  }

  // ---- the flow. The deck turns, and a belt at the equator goes round faster
  // than one near the pole: the sample every field below is read at is the
  // fragment's own direction turned about the axis by its own rate, so belts
  // drift against their neighbours and the deck shears as the clock runs. A
  // week with no load in it and one that was all work do not move alike.
  float ang = uTime * uRate * (1.0 + 0.85 * sin(dd.y * 7.0) + 0.22 * dd.y);
  float ca = cos(ang), sa = sin(ang);
  vec3 p = vec3(dd.x * ca - dd.z * sa, dd.y, dd.x * sa + dd.z * ca);

  // ---- the storms' say in the belts: a vortex drags the boundary round
  // itself, so no belt runs straight past one. (With giant.storms the drag is
  // the storm's own, above.)
  vec3 pv = p;
  float shift = 0.0;
  for (int i = 0; i < ${SPOTS}; i++) {
    if (uStorm > 0.0 || float(i) >= uSpotN) break;
    vec4 sp = uSpot[i];
    vec4 lk = uSpotLook[i];
    vec3 ax = normalize(sp.xyz);
    if (dot(p, ax) < 0.42) continue;
    vec3 ref = abs(ax.y) > 0.94 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 nr = normalize(ref - ax * dot(ref, ax));
    vec3 e = cross(ax, nr);
    vec2 q = vec2(dot(p, e) / lk.x, dot(p, nr)) / max(0.03, sp.w);
    float r = length(q);
    if (r > 2.6) continue;
    // how hard this storm turns the deck at this point: hardest at its eye,
    // gone by its edge, so the belts beside it are dragged round it and curl
    // away behind it instead of passing it straight
    float fall = exp(-r * r * 0.50) * (1.0 - smoothstep(1.5, 2.6, r));
    float th = (0.55 + 0.95 * lk.z + 0.55 * lk.w) * fall;
    float ct = cos(th), st = sin(th);
    pv = pv * ct + cross(ax, pv) * st + ax * (dot(ax, pv) * (1.0 - ct));
    shift += lk.w * 0.55 * fall;
  }

  // ---- giant.eddies. Where a belt shears against the zone beside it the edge
  // does not run on smooth: it rolls up into eddies, a hook here and a curl
  // there, some turning with the flow and some against it. Each is a turn of
  // the deck's own coordinates about a point, as a storm's is, so the belts are
  // wound round it and nothing is laid on; one to a cell of a lattice on the
  // deck, kept inside its cell so no edge of the lattice can show, and missing
  // from most cells, so they gather where they gather. Inside a zone or a belt
  // the turn moves nothing: an eddy only shows on an edge.
  if (uEddy > 0.0) {
    float lonE = atan(pv.z, pv.x);
    float latE = asin(clamp(pv.y, -1.0, 1.0));
    vec2 gk = vec2(${gl(EDDY_LON / TAU)}, ${gl(EDDY_LAT / Math.PI)});
    vec2 gi = floor(vec2(lonE, latE) * gk);
    vec3 h = vec3(inkH12(gi + 3.1), inkH12(gi + 17.3), inkH12(gi + 29.7));
    vec2 cc = (gi + 0.40 + 0.20 * h.xy) / gk;
    vec3 ax = vec3(cos(cc.y) * cos(cc.x), sin(cc.y), cos(cc.y) * sin(cc.x));
    float rr = length(pv - ax) / (0.032 + 0.026 * h.x);
    float on = step(h.z, 0.55) * (1.0 - smoothstep(0.80, 1.05, abs(latE)));
    float th = (h.y > 0.5 ? 1.0 : -1.0) * (1.8 + 2.0 * h.z) * pow(max(0.0, 1.0 - rr * rr), 2.0) * on * uEddy;
    float ce = cos(th), se = sin(th);
    pv = pv * ce + cross(ax, pv) * se + ax * (dot(ax, pv) * (1.0 - ce));
  }

  // ---- the belts. Latitude is read ${gl(BELTS)} times to a belt, so a belt runs
  // out along its own flow; the three fields the boundary is drawn from are read
  // three, seven and sixteen times as fast north to south as they are east to
  // west, so each is a filament and never a blob. The slow one carries the whole
  // belt, the mid one tears its edge, the brush does the rest; a week with the
  // race week's hard share in it tears a great deal more.
  float tear = 0.85 + 0.55 * uRough;
  float wA = inkF3(vec3(pv.x, pv.y * 3.1, pv.z) * 1.35 + 3.0) - 0.5;
  float wB = inkF3(vec3(pv.x, pv.y * 7.4, pv.z) * 3.05 + 17.0) - 0.5;
  float wC = inkN3(vec3(pv.x, pv.y * 16.5, pv.z) * 6.3 + 41.0) - 0.5;
  // the finest tear the boundary is drawn on is a mark and not a pixel: it is
  // read only while its own cell still stands about two pixels wide, so a far
  // disc has a clean edge and never a fringe
  float markC = inkMark(0.0096 * uShell, fp);
  float band = pv.y * ${gl(BELTS)} + wA * 1.32 + (wB * 0.62 + wC * 0.15 * markC) * tear + shift;

  // One wash to a band, and the boundary between two of them is drawn, not
  // softened: the tone is read at the band's own index, so the washes meet on
  // the one edge in the picture with no gradient across it, and the pixel's own
  // width antialiases it. No two bands are the same tone, and no two are the
  // same width: a giant's stripes swing from a pale zone wider than its
  // neighbours to a dark belt a third of one, and from the week's warm light to
  // its coolest shade — a repeat of one stripe is what would make it cloth.
  float sq = band * 0.5;
  float ci = floor(sq);
  float cyc = sq - ci;
  float hA = inkH12(vec2(ci, 7.0));
  float hB = inkH12(vec2(ci, 23.0));
  // where this cell's belt starts and how far it runs: a hierarchy, from a belt
  // two thirds of its cell to one no wider than a brush, and cells that carry no
  // belt at all, across which the zone runs unbroken — one stripe repeated at
  // one width is the thing that would make the deck cloth
  float thr = 0.26 + 0.26 * hA;
  float b1 = thr + (hB < 0.20 ? 0.0 : min(0.14 + 0.62 * (hB - 0.20) / 0.80, 1.0 - thr - 0.07));
  // the pixel's own share of the two cells it straddles: a boundary between one
  // cell and the next is never softened — the washes meet on it — and this is
  // what keeps it from becoming a stair, the two zones mixed across the pixel's
  // own width rather than stepped between
  float aa = clamp(0.5 * fwidth(sq), 1e-5, 0.5);
  float wLo = clamp((aa - cyc) / (2.0 * aa), 0.0, 1.0);
  float wHi = clamp((cyc - 1.0 + aa) / (2.0 * aa), 0.0, 1.0);
  vec3 zoneC = zoneWash(ci);
  zoneC = mix(zoneC, zoneWash(ci - 1.0), wLo);
  zoneC = mix(zoneC, zoneWash(ci + 1.0), wHi);
  // the contrast of the belts holds in the middle of the globe and gives out
  // toward the poles, where the vortex takes the deck over
  float mid = 1.0 - 0.55 * smoothstep(0.55, 0.95, abs(pv.y));
  float bw = clamp(0.5 * fwidth(band), 0.0018, 0.02);
  float deepK = smoothstep(thr - bw, thr + bw, cyc) * (1.0 - smoothstep(b1 - bw, b1 + bw, cyc))
              * mix(0.60, 1.0, hB) * mid;
  vec3 c = mix(zoneC, beltWash(ci), deepK);

  // ---- the flow's own drawing. Every band carries its own weather and not one
  // flat fill: filaments a third of its width running sheared along it, the
  // paper the brush left dry on the lit flanks, and the pigment it loaded
  // beside them. A mark keeps its size on the sheet, so each octave here is
  // gated by the world size of its own cell, read off the shell's own radius:
  // the filaments are drawn only while their grain still stands about two pixels
  // across, and the brush's finer hairs only while theirs does, so a far disc is
  // a clean disc and never a fringe.
  float fineK = inkMark(0.0032 * uShell, fp);
  float hairK = inkMark(0.00077 * uShell, fp);
  // giant.storms: the flow's fine drawing gathers where the flow shears — on a
  // belt's two edges, where one zone meets the next, round a storm's own rim —
  // and the broad middle of a zone or a belt is left quiet
  float shearW = 1.0;
  if (uStorm > 0.0) {
    float dE = min(cyc, 1.0 - cyc);
    if (b1 - thr > 0.02) dE = min(dE, min(abs(cyc - thr), abs(cyc - b1)));
    shearW = mix(1.0, 0.22 + 0.78 * max(exp(-dE * dE / 0.0144), stormRim), uStorm);
  }
  if (fineK > 0.004) {
    // the filaments: a band and a third against the belts' own spacing, read at
    // the sheared coordinate so they run with the flow and not across it
    float fil = fract(band * 1.35 + wB * 0.85 + 0.5) - 0.5;
    float fl = inkF3(vec3(pv.x, pv.y * 30.0, pv.z) * 10.5 + 71.0) - 0.5;
    float wgt = (0.06 + 0.18 * uRough) * fineK * shearW;
    c = mix(c, mix(uCrest, uLandHigh, step(0.0, fl)), wgt * abs(fl) + 0.07 * wgt * abs(fil) * 8.0);
    // dry brush and a loaded streak beside it, on whichever side of the band the
    // brush was travelling
    float dry = smoothstep(0.60, 0.72, fl + 0.5) * smoothstep(0.20, 0.55, abs(fil) * 2.0);
    float load = smoothstep(0.28, 0.40, fl + 0.5) * (1.0 - dry);
    c = mix(c, uPaper, dry * 0.34 * fineK * shearW);
    c = mix(c, mix(uInkSoft, uLandHigh, 0.45), load * 0.16 * fineK * shearW);
    // the brush's own hairs: two or three thinner lines in every band, and the
    // paper showing between them where the wash never reached. The brush is
    // lifted and set down as it travels, so the hairs come and go along the flow
    // and never run the width of the deck as an even dashed rule
    if (hairK > 0.004) {
      float fil2 = fract(band * 3.4 + wA * 1.6 + 0.2) - 0.5;
      float fl2 = inkN3(vec3(pv.x, pv.y * 62.0, pv.z) * 21.0 + 113.0) - 0.5;
      float lifted = smoothstep(0.34, 0.72, inkF3(vec3(pv.x, pv.y * 2.4, pv.z) * 1.7 + 29.0));
      float near2 = 1.0 - smoothstep(0.05, 0.30, abs(fil2) * 2.0);
      float fine = smoothstep(0.34, 0.72, fl2 + 0.5) * near2 * lifted * hairK * shearW;
      c = mix(c, mix(uInkSoft, uLandHigh, 0.30), fine * 0.16);
      c = mix(c, mix(uPaper, uCrest, 0.40), near2 * (1.0 - fine) * lifted * hairK * shearW * 0.10);
    }
  }
  // the great sweep: whole quarters of the deck are paler or deeper than the
  // rest, the way one part of a sky is, so the globe is not one even pattern
  float sweep = inkF3b(vec3(p.x, p.y * 1.15, p.z) * 0.95 + 5.0);
  c = mix(c, uCrest, clamp((sweep - 0.60) * 1.5, 0.0, 0.20));
  c = mix(c, uShadeCool, clamp((0.42 - sweep) * 1.2, 0.0, 0.16));

  // ---- giant.storms: each storm is painted in the frame it turns in. The
  // great spot is the belt it wound up, laid in the week's warm end — deepest
  // where a belt's own pigment was dragged in and paler where the zone was, so
  // the arms of the vortex read through it — with a darker eye; the others are
  // white ovals, the band they stand in lifted quietly toward the paper by
  // their session's own share of the week.
  if (uStorm > 0.0) {
    for (int i = 0; i < ${SPOTS}; i++) {
      if (float(i) >= uSpotN) break;
      vec4 sp = uSpot[i];
      vec4 lk = uSpotLook[i];
      if (dot(d, sp.xyz) < 0.42) continue;
      vec3 ref = abs(sp.y) > 0.94 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
      vec3 nr = normalize(ref - sp.xyz * dot(ref, sp.xyz));
      vec3 e = cross(sp.xyz, nr);
      float sy = max(0.03, sp.w);
      vec2 q = vec2(dot(d, e) / (lk.x * sy), dot(d, nr) / sy);
      float r = length(q);
      if (r > 1.1) continue;
      float body = 1.0 - smoothstep(0.80, 1.02, r);
      if (i == 0) {
        vec3 spotC = mix(mix(uSepia, uDark, 0.22), uBare, 0.30);
        c = mix(c, mix(c, spotC, 0.50 + 0.38 * deepK), body * 0.90 * uStorm);
        c = mix(c, mix(spotC, uInk, 0.35), (1.0 - smoothstep(0.0, 0.36, r)) * 0.34 * uStorm);
      } else {
        c = mix(c, mix(uPaper, uCrest, 0.5), body * (0.22 + 0.36 * lk.w) * uStorm);
      }
    }
  }

  // ---- the storms. The week's own sessions, where they were trained: the
  // longest is the great spot — its core the week's mineral, its size its hours
  // — and the next few are white ovals. Each is a wash in its own frame, with a
  // spiral for an eye, the belt's pigment dragged up round it, and a tail of
  // that pigment running away downstream: a storm in a flow leaves a wake, and
  // the wake is what says the belts are moving and the storm is standing in
  // them. (giant.storms at 0: the earlier ovals.)
  for (int i = 0; i < ${SPOTS}; i++) {
    if (uStorm > 0.0 || float(i) >= uSpotN) break;
    vec4 sp = uSpot[i];
    vec4 lk = uSpotLook[i];
    float dc = dot(d, sp.xyz);
    if (dc < 0.28) { continue; }
    vec3 ref = abs(sp.xyz.y) > 0.94 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 nr = normalize(ref - sp.xyz * dot(ref, sp.xyz));
    vec3 e = cross(sp.xyz, nr);
    vec2 q = vec2(dot(d, e), dot(d, nr)) / max(0.03, sp.w);
    vec2 o = vec2(q.x / lk.x, q.y);
    float r = length(o);
    if (r > 2.2) continue;
    // the eye: a spiral wound inside the oval, on an integer number of arms to
    // the turn—three—so the seam of the angle can never be seen, and an oval
    // long enough east-west that its arms run with the belts and not across them
    float spin = atan(o.y, o.x) + lk.y + 1.15 * log(max(r, 0.12));
    float arms = 0.5 + 0.5 * sin(3.0 * spin + 4.0 * r);
    // the wash itself: filled, not an outline — the week's mineral on the great
    // one, the band it stands in lifted a step on the small ones — granulated
    // with the sheet's own noise so the falloff is painted and not airbrushed.
    // It is a wash and not a lid: the eye of the storm is nearly opaque, and the
    // outer third lets the belt it stands in read through it, so what crosses
    // the oval is the deck's own flow and not a tint laid over it.
    float body = 1.0 - smoothstep(0.68, 1.06, r);
    float bodyOp = body * mix(0.62, 0.94, lk.z) * mix(1.0, 0.66, smoothstep(0.25, 0.80, r));
    float eye = 1.0 - smoothstep(0.0, 0.62, r);
    float grain = inkF3(vec3(o * 2.6, lk.y * 0.7) + 17.0) - 0.5;
    // the collar of pigment dragged up round it, and the tail of it running away
    // downstream: one side of the storm's own wash, drawn out behind it
    float collar = exp(-pow((r - 1.00) / 0.26, 2.0));
    float tail = exp(-pow((r - 1.35) / 0.55, 2.0)) * smoothstep(-0.30, 0.90, q.x);
    // a storm is not a disc of paper laid on the deck: its core is the week's own
    // wash lifted — the mineral on the great one, the band it stands in raised a
    // step on the small ones — so what the eye reads is the deck turning over and
    // not a badge
    // The great spot is the week's own warm end and never its cool one: a storm
    // that size is pigment — brick, rust, vermilion, the road colour of the week
    // — with the pale collar of cloud dragged up round it. The small ovals are
    // the deck's own band lifted a step, so what the eye reads there is the band
    // turning over.
    vec3 lifted = mix(c, mix(uCrest, uPaper, 0.25), 0.55);
    vec3 core = mix(mix(lifted, mix(uBare, uLitWarm, 0.30), 0.75), mix(uLandHigh, uInk, 0.42), lk.z);
    c = mix(c, mix(core, uCrest, 0.22 * arms + 0.20 * grain), bodyOp);
    c = mix(c, mix(uInkSoft, uCrest, 0.30), tail * 0.24 * (0.55 + 0.45 * lk.z));
    c = mix(c, mix(uPaper, uCrest, 0.45), collar * (0.24 + 0.20 * lk.z));
    c = mix(c, mix(uShadeCool, uInk, 0.30), eye * (0.38 + 0.34 * lk.z));
    // the drawn rim: the ink that pooled where the oval's wash stopped, laid on
    // a wandering radius and broken where the brush ran out. The stroke is cut
    // on the leading side and carried on downstream, where the same ink becomes
    // the storm's wake — so no oval is ever a closed ring
    float rr = 0.94 + (inkF3(vec3(o * 1.7, lk.y * 0.7) + 5.0) - 0.5) * 0.26;
    float rw = max(fwidth(r) * 1.5, 0.016);
    float rimK = 1.0 - smoothstep(0.0, rw, abs(r - rr));
    float broke = smoothstep(0.18, 0.62, inkN3(vec3(o * 3.3, lk.y * 0.4) + 11.0));
    float open = smoothstep(-1.10, 0.30, o.x);          // thin on the leading side
    c = mix(c, uInk, rimK * broke * open * (0.18 + 0.30 * lk.z));
    // the wake: the same stroke, tapered, laid along the flow behind the oval
    float wake = exp(-pow((r - 1.45) / 0.75, 2.0)) * smoothstep(-0.10, 1.25, o.x)
               * (0.45 + 0.55 * broke);
    c = mix(c, mix(uInkSoft, uInk, 0.45), wake * (0.20 + 0.16 * lk.z) * (1.0 - body) * open);
    // and the belts are not stopped by the wash: the filaments running past the
    // oval are drawn through its own outer third, the way a jet is drawn through
    // the weather it drives
    float through = clamp(4.0 * body * (1.0 - body), 0.0, 1.0)
                  * (0.5 + 0.5 * sin(10.0 * o.y + 2.6 * o.x + lk.y * 3.0 + 5.0 * grain));
    c = mix(c, mix(uShadeCool, core, 0.45), through * 0.45);
  }

  // ---- the poles. At each end of the axis the belts give up and go round: a
  // vortex, wound in rings, and at the north the hexagon — six corners of jet,
  // drawn on a wandering line, with the vortex closed inside it. The branch is
  // taken on the dial and never on the fragment's own latitude: a derivative read
  // inside a varying branch is undefined, and the seam it leaves is a dashed rule
  // drawn straight across the deck (the jet and the vortex are masked to the pole
  // by their own terms, so nothing of them is drawn away from it).
  if (uLiquid > 0.01) {
    float south = step(d.y, 0.0);
    float colat = acos(clamp(abs(d.y), 0.0, 1.0));
    float phi = atan(d.z, d.x);
    // a hexagon's radius: one corner every sixty degrees, its edge sagging to
    // the cosine between two of them
    float hexR = 0.8660254 / max(0.86, cos(mod(phi + (1.0 - south) * 0.5236, 1.0471976) - 0.5236));
    float wob = (inkF3(vec3(p.x, p.y * 4.0, p.z) * 5.5 + 23.0 + south * 19.0) - 0.5) * 0.055;
    float jetAt = colat - (0.30 + south * 0.06 + wob) * mix(1.0, hexR, 1.0 - south);
    float jw = max(fwidth(jetAt) * 1.2, 0.004);
    float jet = (1.0 - smoothstep(0.0, jw * 1.6, abs(jetAt))) * (1.0 - south * 0.55);
    // the vortex inside: rings of the deck dragged round the axis, closing to a
    // darker eye at the pole itself
    float inside = 1.0 - smoothstep(-jw, jw, jetAt);
    float rings = 0.5 + 0.5 * sin(colat * 26.0 + 3.0 * (inkF3(vec3(p.x, p.y * 3.0, p.z) * 4.0 + 61.0) - 0.5));
    float capK = inside * uLiquid;
    c = mix(c, mix(uLandHigh, uShadeCool, 0.42), capK * (0.10 + 0.16 * rings));
    c = mix(c, mix(uInkSoft, uInk, 0.35), capK * (1.0 - smoothstep(0.0, 0.16, colat)) * 0.42);
    c = mix(c, mix(uShadeCool, uInk, 0.45), jet * uLiquid * 0.55);
  }

  // ---- the light. The day side is the wash; the night is the ink laid over it
  // in two passes, and the boundary between them is hand-cut — it wanders at
  // four scales, from the belt down to the brush — because a rim of light drawn
  // as a chord across the disc is the one thing that would say marble.
  float ndl = dot(N, uLight);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float rim = 1.0 - ndv;
  // The deck is painted in three values and never as a ramp: the wash the light
  // stands square on, the wash it grazes, and the shade between them. The
  // boundary every one of them is read across wanders at four scales, from the
  // belt down to the brush, because a step of the plan drawn as a chord of
  // light is the one thing here that would say marble.
  float wob = (inkF3(d * 3.1 + 2.0) - 0.5) * 0.16
            + (inkF3(d * 5.6 + 19.0) - 0.5) * 0.10
            + (inkN3(d * 9.5 + 7.0) - 0.5) * 0.062
            + (inkN3(d * 22.0 + 11.0) - 0.5) * 0.022;
  float lum = smoothstep(-0.62, 1.05, ndl + wob);
  float soft = 0.42 * max(fwidth(lum), 1e-5) + 0.006;
  vec3 shadeC = mix(c, mix(uShadeCool, c, 0.30), 0.52);
  vec3 dayC = mix(c, mix(uCrest, c, 0.55), 0.30);
  vec3 col = mix(shadeC, c, smoothstep(0.30 - soft, 0.30 + soft, lum));
  col = mix(col, dayC, smoothstep(0.66 - soft, 0.66 + soft, lum));
  // ---- body.form. The deck turns from the light across its whole face and not
  // only at its shade step: a half-light graded from the lit face to the turn,
  // the shade side sunk a step further into the week's own cool, and the warm
  // of a low sun along the turn. Glazes over the three values, never a ramp
  // under them (a real night, light.terminator, keeps its own).
  if (uForm > 0.0) {
    vec3 coolT = uShadeCool / max(max(uShadeCool.r, uShadeCool.g), max(uShadeCool.b, 1e-3)) * 0.82;
    vec3 warmT = uLitWarm / max(max(uLitWarm.r, uLitWarm.g), max(uLitWarm.b, 1e-3));
    float turnK = exp(-(ndl - 0.10) * (ndl - 0.10) / 0.025);
    float halfL = ((1.0 - smoothstep(0.0, 0.90, ndl)) * 0.36 + (1.0 - smoothstep(-0.45, 0.05, ndl)) * 0.26)
                * (1.0 - 0.6 * turnK) * (1.0 - uTerm);
    col *= mix(vec3(1.0), coolT, halfL * uForm);
    col *= mix(vec3(1.0), warmT, turnK * 0.30 * uForm);
  }
  float sunK = smoothstep(0.15, 0.92, lum);
  // the night, on the same dial the ground wears (light.terminator): the ink
  // laid over the deck in two passes, and the pigment the wash left standing
  // where it stopped. The ink is not one flat mask either — the deck's own
  // bands run on through it at a lower value, so the night side of the giant is
  // still the giant, and not a sheet laid over it.
  float s = -(ndl + wob * 1.1);
  float nw = max(0.6 * fwidth(s), 0.0032);
  float night = smoothstep(-nw, nw, s) * uTerm;
  float nightVar = 0.62 + 0.38 * inkF3(vec3(pv.x, pv.y * 2.2, pv.z) * 2.6 + 47.0);
  col = mix(col, mix(uDark, uInk, 0.35), night * 0.88 * nightVar);
  col = mix(col, mix(uDark, uInk, 0.10), smoothstep(-nw, nw, s - 0.34) * 0.55 * uTerm);
  col = mix(col, mix(uShadeCool, c, 0.55), night * 0.30 * (1.0 - nightVar));
  float held = step(0.30, inkN3(d * 13.0 + 3.0)) * step(0.42, inkN3(d * 33.0 + 9.0));
  col = mix(col, mix(uShadeCool, uInk, 0.4), (1.0 - smoothstep(0.0, 2.6 * nw, abs(s))) * held * 0.35 * uTerm);

  // ---- the moon's shadow. The small body beside the giant stands between the
  // deck and the light for part of its turn, and the deck goes out under it: a
  // soft dark mark, no wider than the moon itself, with the belts running
  // through it — the one thing in the frame that gives the giant its size
  // without a ruler, and it costs no tap but the ray's own length.
  if (uMoonA > 0.001) {
    vec3 rel = uMoonP - vW;
    float along = dot(rel, uLight);
    if (along > 0.0) {
      float off = length(rel - uLight * along);
      float shK = 1.0 - smoothstep(uMoonR * 0.86, uMoonR * 1.5, off);
      col = mix(col, mix(uShadeCool, uInk, 0.34), shK * 0.42 * uMoonA);
    }
  }

  // ---- the limb. The ground's own light falls off as the eye comes round to
  // the edge — a limb is nearly edge-on to the light as well as to the eye —
  // and then the haze takes it: the deck's own air, standing a little higher
  // than the clouds, pale where the day is and inked where it is not. The air is
  // a fifth of a radius deep, so from close in the veil is already thickening
  // across the outer reach of the deck long before the edge arrives, and what an
  // eye reads at the frame's own corner is the top of the atmosphere and not a
  // cut.
  float limbK = smoothstep(0.20, 1.0, rim);
  col *= 1.0 - 0.20 * limbK;
  float haze = smoothstep(0.34, 1.0, rim);
  float air = mix(0.72, 1.34, uWarmth);
  col = mix(col, mix(uSkyHaze, uPaper, 0.42), haze * (0.14 + 0.30 * sunK) * air);
  col = mix(col, mix(uShadeCool, uSkyHaze, 0.35), haze * (1.0 - sunK) * 0.30);
  // the sheet's own grain, and the drawn edge: a line right at the silhouette,
  // broken where the brush came off the paper
  col *= 0.965 + 0.07 * tooth;
  float ew = max(1.5 * fwidth(rim), 0.0022);
  float line = 1.0 - smoothstep(0.0, ew, 1.0 - rim - 0.004);
  float broken = 0.45 + 0.55 * step(0.32, inkN3(d * 26.0 + 5.0));
  col = mix(col, mix(uInk, uInkSoft, 0.35), line * broken * 0.62);

  // ---- the handoff. The deck does not fade out like a lamp: as the camera
  // comes down through it the shell breaks up into the masses it is made of and
  // the ground shows through the gaps between them — ragged, and the shreds of
  // it left white with the deck's own haze, the way cloud goes when the eye is
  // finally inside it. At the dial's top the sheet is whole and this costs one
  // noise tap.
  float alpha = uPresence;
  if (uPresence < 0.995) {
    float rag = inkF3(d * 2.35 + 21.0) * 0.62 + inkN3(d * 6.8 + 3.0) * 0.22
              + (inkF3(vec3(d.x, d.y * 1.8, d.z) * 14.0 + 91.0)) * 0.16;
    alpha = clamp((rag - (1.0 - uPresence * 1.12)) / 0.24, 0.0, 1.0) * min(1.0, uPresence * 3.0);
    col = mix(col, mix(uSkyHaze, uPaper, 0.30), (1.0 - uPresence) * 0.45);
    col = mix(col, uPaper, clamp((rag - (1.0 - uPresence * 1.05)) / 0.16, 0.0, 1.0) * 0.55);
  }
  gl_FragColor = vec4(col, alpha);
}
`;

// The deck's two washes, as the ground underfoot and the ceiling overhead read
// them (the shell draws its own, above): a zone is a pale one of the week's own
// light, a belt the same week's deeper ground, hashed apart band by band. The
// host declares the palette's uniforms; gdBand reads the shell's own coordinate
// at a direction, lifted by `lift` (a billow carries a band's edge round it)
// and mixed across the pixel where two cells meet.
const BAND_WASH = /* glsl */ `
vec3 gdZone(float i){
  float h = inkH12(vec2(i, 7.0));
  vec3 z = mix(uLitWarm, uCrest, mix(0.15, 1.0, h));
  return mix(z, uDry, 0.40 * step(0.70, h));
}
vec3 gdBelt(float i){
  float hB = inkH12(vec2(i, 23.0));
  float hC = inkH12(vec2(i, 61.0));
  vec3 b = mix(uLandMid, uLandHigh, mix(0.30, 1.0, hB));
  b = mix(b, mix(uShadeCool, uLandHigh, 0.45), 0.55 * step(0.58, hC));
  return mix(b, uSepia, 0.35 * step(0.86, hC));
}
vec3 gdBand(vec3 d, float belts, float tear, float lift, float soft){
  float wA = inkF3(vec3(d.x, d.y * 3.1, d.z) * 1.35 + 3.0) - 0.5;
  float wB = inkF3(vec3(d.x, d.y * 7.4, d.z) * 3.05 + 17.0) - 0.5;
  float band = d.y * belts + wA * 1.32 + wB * 0.62 * tear + lift;
  float sq = band * 0.5;
  float ci = floor(sq);
  float cyc = sq - ci;
  float hA = inkH12(vec2(ci, 7.0)), hB = inkH12(vec2(ci, 23.0));
  float thr = 0.26 + 0.26 * hA;
  float b1 = thr + (hB < 0.20 ? 0.0 : min(0.14 + 0.62 * (hB - 0.20) / 0.80, 1.0 - thr - 0.07));
  float aa = clamp(max(0.5 * fwidth(sq), soft * 0.5), 1e-5, 0.5);
  vec3 zoneC = gdZone(ci);
  zoneC = mix(zoneC, gdZone(ci - 1.0), clamp((aa - cyc) / (2.0 * aa), 0.0, 1.0));
  zoneC = mix(zoneC, gdZone(ci + 1.0), clamp((cyc - 1.0 + aa) / (2.0 * aa), 0.0, 1.0));
  float bw = clamp(max(0.5 * fwidth(band), soft), 0.002, 0.3);
  float deepK = smoothstep(thr - bw, thr + bw, cyc) * (1.0 - smoothstep(b1 - bw, b1 + bw, cyc)) * mix(0.60, 1.0, hB);
  return mix(zoneC, gdBelt(ci), deepK);
}
`;

// The sky under the deck. A runner on the cloud tops is standing between two
// decks: the one underfoot, and the one the camera came down through, twenty
// units overhead, which is the whole of the sky — no blue, no house cumulus,
// the weather they fell through. Everything here is read in the sky's own chart:
// the bearing off the way the runner was looking when they landed (uAnchor,
// carried with the viewer and never turned by the head), and the height over
// this little world's own horizon, which dips a sixth of a right angle under
// the level from four units up. Back to front:
//   the ceiling  the deck's underside, read where the eye's ray meets the shell:
//                the same belts, a step deeper, foreshortened to stripes that
//                run into the horizon, the sun's glow through the thinner
//                cloud, and the deck letting go of it in the last few degrees,
//                where the light between the decks pours out
//   the opening  the deck torn open round the near moon: the clear air over the
//                weather showing through, deeper and colder than the deck, and
//                the lip of the tear catching the light
//   the moons    above the deck, shown through that window: huge, a cut-out of
//                the week's own paper lit by the real sun, its night side
//                warmed by the giant's own light
//   the wall     the great spot seen from inside the weather: a long wall of
//                turning cloud on the horizon, banded with its own turn, its
//                crown spreading under the ceiling
//   the towers   cumulonimbus at up to six stations round the horizon, each a
//                column of heads climbing out of the deck into a flat anvil
//                drawn out downwind under the ceiling, lit on the sun's side
//   the rim      a scalloped row of far tops standing on the horizon, and the
//                air laid over every foot.
// Shared by every body whose sky on foot is its own weather (createCeiling): a
// lava world's ash is the same ceiling in smoke, lit from under it (uEmber),
// its one tower the vent's own eruption column.
const CEILING_FRAG = /* glsl */ `
uniform vec3 uPaper, uCrest, uDry, uLitWarm, uShadeCool, uInk, uInkSoft, uLandMid, uLandHigh, uSepia;
uniform vec3 uLight;
uniform vec3 uGlow, uShade, uSpotC, uHigh;
uniform vec4 uEmber;       // rgb: the light the ground throws up under smoke  a: how much (nought on the giants)
uniform vec3 uAnchor;
uniform vec3 uMoonA, uMoonB;
uniform vec4 uMoonAt[2];   // x: bearing off the anchor  y: height over the horizon  z: angular radius (nought: none)  w: seed
uniform vec4 uStorm;       // x: bearing  y: half width  z: height (radians)  w: 1 when the week has a great spot
uniform vec3 uTowers;      // x: the first station's bearing  y: how near it stands  z: how many stations stand
uniform float uTime, uCeil, uShell, uGround, uBelts, uTear, uSeed;
varying vec3 vW;
${NOISE}
${BAND_WASH}

float gdBill(float x, float s){ return abs(inkN3(vec3(x, s, s * 1.7)) * 2.0 - 1.0); }

// One cumulonimbus in the chart: q.x across its axis in widths (downwind
// positive), q.y up from the horizon in heights. Returns how far inside its edge
// the point is (positive inside) and how lit it is. The last argument turns its
// light from the sun's side to underneath: an eruption column lit by its vent.
vec2 gdTower(vec2 q, float seed, float sunSide, float below){
  // the column's outline: heads climbing one on another, each bulging out round
  // and notched where the next begins, never the same on the two flanks
  float hL = gdBill(q.y * 4.2, seed) * 0.60 + gdBill(q.y * 11.0 + 7.0, seed * 1.7) * 0.25;
  float hR = gdBill(q.y * 4.2 + 3.7, seed) * 0.60 + gdBill(q.y * 11.0 + 12.1, seed * 1.7) * 0.25;
  float lean = 0.10 * q.y * q.y;
  float cw = 0.42 + 0.20 * q.y + 0.30 * (q.x < lean ? hL : hR);
  float column = min(cw - abs(q.x - lean), (0.97 - q.y) * 2.0);
  // the column's own light: from the sun's side, or under smoke from its own
  // fire beneath it
  float heads = 0.5 * (hL + hR);
  float side = mix(smoothstep(-0.16, 0.20, (q.x - lean) * sunSide + 0.26 * (heads - 0.45)),
                   1.0 - smoothstep(0.05, 0.55, q.y), below);
  // …and inside it the heads themselves: two to a row, one to each flank, each
  // a round mass of its own size and height, turned by that light, the lower one
  // standing in front of the one it climbs into — so every crown is drawn
  // against the shade under the next one up, and the column is a heap of lit
  // heads and never a stem, nor a stack of plates
  // (an eruption column keeps its fire as a glow up from its foot, the side
  // term above: its heads are only turned a little by the day's own light, or
  // a light from below stripes the column into a stack of rings)
  vec3 Lh = normalize(vec3(sunSide * 0.85, 0.32, 0.45));
  float lit = side;
  float front = 1e3;
  for (int k = -1; k <= 1; k++) {
    float row = floor(q.y / 0.16) + float(k);
    float hy0 = (row + 0.55) * 0.16;
    float hw = 0.42 + 0.20 * hy0;
    for (int s = 0; s < 2; s++) {
      float fs = float(s);
      float hj = inkH12(vec2(row * 2.0 + fs, seed));
      float hk = inkH12(vec2(row * 2.0 + fs, seed + 9.1));
      float hx = 0.10 * hy0 * hy0 + (fs * 2.0 - 1.0) * (0.12 + 0.34 * hj) * hw;
      float hy = hy0 + (hk - 0.5) * 0.08;
      vec2 u = vec2((q.x - hx) / (hw * (0.55 + 0.40 * hk)), (q.y - hy) / (0.16 * (0.70 + 0.55 * hj)));
      float r2 = dot(u, u);
      float order = row + 0.5 * fs * step(0.5, hk);
      if (r2 < 1.0 && order < front) {
        front = order;
        lit = mix(side, smoothstep(-0.30, 0.50, dot(vec3(u, sqrt(1.0 - r2)), Lh)), mix(0.70, 0.30, below));
      }
    }
  }
  // the anvil: a lens drawn out downwind under the ceiling, short upwind, thick
  // over the column and thinning downwind to nothing, an overshooting dome over
  // the column, fibrous along its top and more so as it thins, pouched along its
  // underside, and flaring down into the column it spreads from rather than
  // sitting on it like a lid
  float ax = (q.x - 0.85) / (q.x < 0.85 ? 1.5 : 2.6);
  float axD = max(ax, 0.0), axU = min(ax, 0.0);
  float fib = (inkN3(vec3(q.x * 1.6, q.y * 15.0, seed * 2.3)) - 0.5) * (0.05 + 0.06 * axD);
  float top = 1.0 - 0.05 * ax * ax - 0.04 * axD + 0.09 * exp(-q.x * q.x * 2.2) + fib;
  float under = 0.80 + 0.17 * pow(axD, 0.8) + 0.20 * axU * axU + 0.04 * gdBill(q.x * 3.2, seed + 4.0) + fib * 0.5
              - 0.10 * exp(-(q.x - lean) * (q.x - lean) * 4.0);
  float anvil = min(min(top - q.y, q.y - under) * 5.0, (1.05 - abs(ax)) * 2.0);
  float inside = max(column, anvil);
  float litA = mix(smoothstep(0.88, 0.97, q.y) * 0.75 + 0.25 * side, 1.0 - smoothstep(under, under + 0.07, q.y), below);
  return vec2(inside, mix(lit, litA, step(column, anvil)));
}

// Where a body of the sky stands: a bearing off the anchor and a height over the
// horizon, as a direction.
vec3 gdSkyAt(vec4 at, vec3 up, vec3 E, vec3 Rt, float hzA){
  float el = hzA + at.y;
  return normalize((E * cos(at.x) + Rt * sin(at.x)) * cos(el) + up * sin(el));
}

// One moon: a disc in the chart, lit by the real sun as a ball would be. pxR
// is a pixel in the sky's own radians, so nothing here needs a derivative.
vec4 gdMoon(vec3 d, vec3 up, vec3 E, vec3 Rt, vec4 at, vec3 pig, float hzA, float pxR){
  if (at.z <= 0.0) return vec4(0.0);
  vec3 m = gdSkyAt(at, up, E, Rt, hzA);
  vec3 mR = normalize(cross(m, up));
  vec3 mU = cross(mR, m);
  vec2 o = vec2(dot(d, mR), dot(d, mU)) / at.z;
  float r = length(o) + step(dot(d, m), 0.5) * 9.0;
  if (r > 1.06) return vec4(0.0);
  vec3 N = normalize(o.x * mR + o.y * mU - sqrt(max(0.0, 1.0 - r * r)) * m);
  float ndl = dot(N, uLight);
  float aa = max(pxR / at.z, 1e-3);
  // the maria: two or three broad washes cut on a wandering line
  float maria = inkF3b(N * 2.3 + at.w) - (0.50 + 0.06 * (inkN3(N * 5.0 + at.w * 3.0) - 0.5));
  vec3 c = mix(pig, mix(uShadeCool, pig, 0.55), smoothstep(-0.02, 0.02, maria) * 0.32);
  c = mix(c, uPaper, smoothstep(0.30, 0.95, ndl) * 0.30);
  // the night side is not black: the giant's own light is on it
  float s = -(ndl + (inkF3(N * 3.4 + 9.0) - 0.5) * 0.10);
  c = mix(c, mix(mix(uShade, uLitWarm, 0.30), pig, 0.25), smoothstep(-0.015, 0.015, s) * 0.70);
  float a = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);
  // ink on the silhouette, broken where the brush lifted
  float line = (1.0 - smoothstep(0.0, 2.2 * aa, abs(r - 1.0 + aa))) * step(0.30, inkN3(N * 9.0 + 2.0));
  c = mix(c, mix(uInk, uShadeCool, 0.4), line * 0.45);
  return vec4(c, a);
}

void main(){
  vec3 up = normalize(cameraPosition);
  vec3 d = normalize(vW - cameraPosition);
  vec3 E = uAnchor - up * dot(uAnchor, up);
  E = dot(E, E) > 1e-6 ? normalize(E) : normalize(cross(up, vec3(0.31, 0.12, 0.94)));
  vec3 Rt = normalize(cross(E, up));
  float tooth = inkTooth(gl_FragCoord.xy);
  float rc = length(cameraPosition);
  float hzA = -asin(sqrt(max(0.0, 1.0 - (uGround / rc) * (uGround / rc))));
  float y = asin(clamp(dot(d, up), -1.0, 1.0)) - hzA;           // radians over the horizon
  float az = atan(dot(d, Rt), dot(d, E));                           // radians off the anchor
  float px = max(1e-4, length(fwidth(d)));
  vec3 L = normalize(uLight);
  float sunAz = atan(dot(L, Rt), dot(L, E));

  // ---- the ceiling: where the eye's ray meets the shell, the deck's own
  // belts a step deeper, the sun's glow through the thin of it
  float b = dot(cameraPosition, d);
  float t = -b + sqrt(max(0.0, b * b - (rc * rc - uShell * uShell)));
  vec3 P = cameraPosition + d * t;
  vec3 dP = normalize(P);
  float mass = inkF3(P * 0.045 + vec3(0.0, 0.0, uTime * 0.004) + 53.0);
  float lobes = inkF3(vec3(P.x, P.y * 2.0, P.z) * 0.11 + 7.0);
  vec3 ceilC = mix(gdBand(dP, uBelts, uTear, 0.0, 0.14), uShade, 0.52);
  ceilC = mix(ceilC, mix(uShade, uInkSoft, 0.38), smoothstep(0.56, 0.72, lobes) * 0.40);
  ceilC = mix(ceilC, mix(uLitWarm, uPaper, 0.55), smoothstep(0.55, 0.80, mass) * 0.34);
  // under a lava world's smoke the light comes from below: the fissures' own
  // glow on the underside of every pouch of the ash, gathering toward the
  // horizon, where the eye looks across the most of the burning ground
  float emb = uEmber.a * (0.30 + 0.70 * (1.0 - smoothstep(0.0, 0.45, y))) * (0.45 + 0.55 * smoothstep(0.35, 0.70, mass));
  ceilC = mix(ceilC, uEmber.rgb, clamp(emb, 0.0, 0.85));
  float sunGlow = pow(max(dot(d, L), 0.0), 5.0);
  ceilC = mix(ceilC, mix(uPaper, uLitWarm, 0.25), sunGlow * 0.65);
  // the deck lets go of the sky in its last few degrees: there the light
  // between the two decks pours out toward the eye, brightest at the horizon
  float gapK = 1.0 - smoothstep(0.02, 0.22, y + 0.05 * (mass - 0.5));
  vec3 col = mix(ceilC, mix(uGlow, uPaper, 0.45 * (1.0 - smoothstep(0.0, 0.10, y))), gapK);

  // ---- the opening: the deck torn open round the near moon. The clear air
  // over the weather shows through, deeper and colder than the deck, so the moon
  // stands in it as a body and not as a stain on the cloud; the tear's edge is
  // ragged with the deck's own lobes, and its lip catches the light.
  float win = 0.0;
  if (uMoonAt[0].z > 0.0) {
    float ra = acos(clamp(dot(d, gdSkyAt(uMoonAt[0], up, E, Rt, hzA)), -1.0, 1.0)) / uMoonAt[0].z;
    float edge = 1.80 + (inkF3(P * 0.07 + 41.0) - 0.5) * 1.5 + (inkN3(P * 0.29 + 5.0) - 0.5) * 0.45;
    float aw = 1.2 * px / uMoonAt[0].z;
    win = (1.0 - smoothstep(edge - aw, edge + aw, ra)) * (1.0 - gapK);
    vec3 airC = mix(uHigh, mix(uHigh, uPaper, 0.35), pow(max(dot(d, L), 0.0), 3.0));
    // a last thin streak of the deck still drawn across the gap near its edge
    float wisp = smoothstep(0.60, 0.80, inkF3(vec3(P.x, P.y * 3.0, P.z) * 0.07 + 13.0)) * smoothstep(edge - 1.1, edge, ra);
    airC = mix(airC, mix(ceilC, uPaper, 0.25), wisp * 0.55);
    float lip = (1.0 - smoothstep(0.0, 0.40, ra - edge)) * step(edge, ra) * (1.0 - gapK);
    col = mix(col, mix(col, mix(uPaper, uLitWarm, 0.30), 0.60), lip);
    col = mix(col, airC, win);
  }

  // ---- the moons, through that window
  vec4 mA = gdMoon(d, up, E, Rt, uMoonAt[0], uMoonA, hzA, px);
  vec4 mB = gdMoon(d, up, E, Rt, uMoonAt[1], uMoonB, hzA, px);
  vec4 m4 = mA.a > 0.0 ? mA : mB;
  if (m4.a > 0.0) {
    // the deck's thin streaks still cross in front of it where the deck is,
    // and the air between the decks takes its lower limb
    float veil = smoothstep(0.55, 0.80, inkF3(vec3(P.x, P.y * 3.0, P.z) * 0.09 + 31.0)) * 0.55 * (1.0 - gapK) * (1.0 - 0.85 * win);
    vec3 mc = mix(m4.rgb, ceilC, veil);
    mc = mix(mc, uGlow, (1.0 - smoothstep(0.04, 0.24, y)) * 0.30);
    col = mix(col, mc, m4.a);
  }

  float sunSide = sin(sunAz - az) < 0.0 ? 1.0 : -1.0;
  // ---- the wall: the great spot seen from inside the weather, a dark mound of
  // turning cloud on the horizon, its crown torn into heads, its face banded
  // with its own turn — the bands bow down toward its flanks, the way a
  // spinning thing's do — and its foot lost in the light between the decks
  if (uStorm.w > 0.5) {
    float sx = (az - uStorm.x) / uStorm.y;
    if (abs(sx) < 1.0) {
      float crown = uStorm.z * pow(max(0.0, 1.0 - sx * sx), 0.35)
                  * (0.86 + 0.10 * gdBill(az * 14.0, uSeed) + 0.06 * gdBill(az * 37.0, uSeed + 2.0));
      float inK = crown - y;
      float k = smoothstep(-px * 1.2, px * 1.2, inK);
      if (k > 0.0) {
        float v = y / max(crown, uStorm.z * 0.35) + 0.40 * sx * sx;
        float turn = v * 5.0 + (inkN3(vec3(sx * 3.0, v * 6.0, uSeed)) - 0.5) * 0.9;
        float stripe = smoothstep(0.32, 0.68, 0.5 + 0.5 * sin(turn * 3.14159));
        float lit = smoothstep(-0.65, 0.55, sx * -sunSide);
        vec3 dark = mix(uSpotC, uInk, 0.30);
        vec3 wc = mix(dark, mix(uSpotC, uCrest, 0.35), stripe * 0.75);
        wc = mix(mix(wc, uShade, 0.25), mix(wc, uPaper, 0.25), lit);
        // its crown catches the light the ceiling lets through
        wc = mix(wc, mix(uCrest, uPaper, 0.35), (1.0 - smoothstep(0.0, 0.016, inK)) * 0.55 * lit);
        // the air between: the wall stands far off, its foot lost in the light
        wc = mix(wc, uGlow, 0.18 + 0.55 * (1.0 - smoothstep(0.0, uStorm.z * 0.7, y)));
        float rim = (1.0 - smoothstep(0.0, 2.4 * px, inK)) * (1.0 - lit) * step(0.35, inkN3(vec3(az * 30.0, y * 30.0, 3.0)));
        wc = mix(wc, mix(wc, uInkSoft, 0.45), rim * 0.6);
        col = mix(col, wc, k);
      }
    }
  }

  // ---- the towers: up to six stations round the horizon, the first standing
  // in the view the runner landed looking at. Under smoke (uEmber) a tower is
  // the vent's own eruption column: lit from under it, its foot the fountain.
  float below = step(0.001, uEmber.a);
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    if (fi >= uTowers.z) break;
    float h1 = inkH12(vec2(fi, uSeed + 3.0)), h2 = inkH12(vec2(fi + 7.0, uSeed)), h3 = inkH12(vec2(uSeed, fi + 13.0));
    float bear = uTowers.x + fi * 1.0471976 + (h1 - 0.5) * 0.45 * step(0.5, fi);
    float rel = mod(az - bear + 3.14159265, 6.2831853) - 3.14159265;
    float near = i == 0 ? uTowers.y : 0.40 + 0.50 * h2;            // how near: big and clear, or small and lost
    float H = 0.075 + 0.095 * near;
    float W = H * (0.55 + 0.15 * h3);
    vec2 q = vec2(rel / W, y / H);
    if (q.x < -1.6 || q.x > 3.6 || q.y > 1.1) continue;
    float side = sin(sunAz - bear) < 0.0 ? 1.0 : -1.0;
    vec2 tw = gdTower(q, fi * 7.3 + uSeed, side, below);
    float tw0 = px / W;
    float k = smoothstep(-tw0, tw0, tw.x);
    if (k <= 0.0) continue;
    vec3 lc = mix(mix(uPaper, uLitWarm, 0.16), uEmber.rgb, uEmber.a);
    vec3 sc = mix(uShade, uCrest, 0.32);
    // a cloud's lit side stops on its edge; smoke lit by its own fire fades up
    vec3 tc = mix(sc, lc, mix(smoothstep(0.35, 0.65, tw.y), smoothstep(0.10, 0.90, tw.y), below));
    tc = mix(tc, mix(sc, uInkSoft, 0.18), (1.0 - smoothstep(0.05, 0.40, q.y)) * 0.55 * (1.0 - below));
    tc = mix(tc, mix(uEmber.rgb, uPaper, 0.30), below * (1.0 - smoothstep(0.0, 0.20, q.y)) * 0.85);
    float rim = (1.0 - smoothstep(0.0, 2.4 * tw0, tw.x)) * (1.0 - tw.y) * step(0.35, inkN3(vec3(q * 9.0, fi)));
    tc = mix(tc, mix(tc, uInkSoft, 0.40), rim * 0.55);
    tc = mix(tc, uGlow, (1.0 - near) * 0.55 + 0.30 * (1.0 - smoothstep(0.0, 0.35, q.y)) * (1.0 - below));
    col = mix(col, tc, k);
  }

  // ---- the rim: a scalloped row of far tops on the horizon, and the air
  float tops = 0.010 + 0.012 * gdBill(az * 26.0, uSeed + 5.0) + 0.006 * gdBill(az * 71.0, uSeed + 9.0);
  float tk = smoothstep(-px, px, tops - y);
  col = mix(col, mix(uGlow, uShade, 0.10 + 0.12 * gdBill(az * 26.0, uSeed + 5.0)), tk);
  col = mix(col, uGlow, (1.0 - smoothstep(0.0, 0.06, y)) * 0.35 * (1.0 - tk));
  col *= 0.97 + 0.06 * tooth;
  gl_FragColor = vec4(col, uCeil);
}
`;

// The deck underfoot, laid inside the terrain's own shader (ink.js's body ground
// hook: it is handed the finished wash and has the last word on foot). The
// ground a runner lands on is the top of a lower deck. Its crowns are the
// ground's own relief (giant.js); here they are read as cloud: the heads on
// them and the curds on those, modelled by a painter's light held low on the
// sun's own bearing — the tops near the paper, the flanks turned from the light
// in the deck's own luminous cool, the gaps between heads a step deeper — in
// the band colour of the shell overhead, which gathers with the distance. It is
// vapour and not foam: the shade is laid wet and runs into the half-light, lit
// through at a head's thin edge and warmed in the gaps by the tops around it,
// and only the chosen crowns keep a hard edge where their lit top stops. A mark
// keeps its size on the sheet: the curds go first, then the heads, and the far
// deck is the band strata alone, going into the luminous air the two decks hold
// between them. The week's race is a faint ribbon of light laid along the deck.
// Shared with the ice giant, whose deck is the same weather in its own colours.
export const DECK_GROUND = /* glsl */ `
uniform vec3 uGdGlow;      // the air between the decks: the far deck goes into it
uniform vec3 uGdShade;     // the cool a head's own flank is laid in
uniform float uGdTear;     // how hard the week tears a band's edge
uniform float uGdBelts;    // belts pole to pole, the shell's own count
uniform float uGdBand;     // how much of the band's colour the deck wears
uniform float uGdPuff;     // the curds on a head, units across (heads are 2.2 of them)
${BAND_WASH}
// The lumps on a crown: a lattice of small spheres, each cell's own one stood a
// little off its centre and of its own size, and the highest cap standing over
// the ground at this point is the cloud's surface there — so every lump is a
// rounded scallop with a crease where it meets the next, which is what a
// cauliflower top is. Every sphere that can stand over the point is searched:
// the lattice is read round two points on the plumb line through it (a tenth of
// a cell under it and six tenths over), and each sphere is cut to the balls the
// two searches always hold, so no cap is dropped where a search moves on a cell
// (a dropped cap was a straight cut and a wedge across the deck). The two
// highest caps are mixed over a narrow step of height, so the crease between two
// heads is drawn, and the edge of a head standing over a lower one stays crisp.
// Returns the cap's height over the ground (below nought where none reaches it:
// the gap between two lumps), writes its normal, and the winning cell's own
// hash: the painter's choice of which heads keep an edge.
vec3 gdHash3(vec3 p){
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float gdCaps(vec3 p, vec3 up, float S, out vec3 nrm, out float id){
  vec3 u = p / S;
  vec3 lo0 = floor(u - up * 0.1 - 0.5);
  vec3 lo1 = floor(u + up * 0.6 - 0.5);
  float h1 = -1.0, h2 = -1.0;
  vec3 n1 = up, n2 = up;
  id = 0.0;
  for (int s = 0; s < 2; s++) {
    vec3 i0 = s == 0 ? lo0 : lo1;
    for (int a = 0; a < 2; a++) {
      for (int b = 0; b < 2; b++) {
        for (int k = 0; k < 2; k++) {
          vec3 cell = i0 + vec3(float(a), float(b), float(k));
          // a cell the first search held is the same sphere
          if (s == 1 && all(greaterThanEqual(cell, lo0)) && all(lessThanEqual(cell, lo0 + 1.0))) continue;
          vec3 rel = u - (cell + 0.25 + 0.5 * gdHash3(cell));
          float v = dot(rel, up);
          float w2 = dot(rel, rel) - v * v;
          // a search holds every sphere whose centre lies within 0.74 of a cell
          // of its own point (a cell's jitter is a quarter): the sphere is cut to
          // those two balls, so it shrinks to nothing before a search lets it go
          // (0.3844: the largest radius, so most cells stop before their own)
          float re2 = min(0.3844, 0.5476 - min((v - 0.1) * (v - 0.1), (v + 0.6) * (v + 0.6)));
          if (w2 >= re2) continue;
          float r = 0.44 + 0.18 * inkH13(cell + 41.9);
          re2 = min(r * r, re2);
          if (w2 >= re2) continue;
          float cap = sqrt(re2 - w2);
          float top = (cap - v) * S;
          vec3 nc = normalize(rel + up * (cap - v));
          if (top > h1) { h2 = h1; n2 = n1; h1 = top; n1 = nc; id = inkH13(cell + 53.7); }
          else if (top > h2) { h2 = top; n2 = nc; }
        }
      }
    }
  }
  nrm = normalize(mix(n2, n1, 0.5 + 0.5 * clamp((h1 - h2) / (0.05 * S), 0.0, 1.0)));
  return h1;
}
vec3 bodyGround(vec3 c, vec3 dW, vec3 n, vec3 V, float dist, float fp, float tooth, float sunSh){
  if (uSurface <= 0.001) return c;
  // the painter's light: the sun's own bearing, held low enough over the deck
  // that every crown has a lit side and a side turned from it, whatever the
  // hour — a cloud top under a noon sun is still drawn from one side
  vec3 sunH = uLight - dW * dot(uLight, dW);
  sunH = dot(sunH, sunH) > 1e-4 ? normalize(sunH) : normalize(cross(dW, vec3(0.3, 0.9, 0.2)));
  vec3 L = normalize(sunH * 0.86 + dW * max(0.42, dot(uLight, dW) * 0.6));
  // the crowns are the ground's own (giant.js); the lumps on them are drawn
  // here at two sizes — a crown's own heads, and the curds on those — each kept
  // only while it still stands a few pixels across
  vec3 capA, capB = dW;
  float idA, idB;
  float capH = gdCaps(vW, dW, uGdPuff * 2.2, capA, idA);
  float modelA = inkMark(uGdPuff * 1.2, fp);
  float model = inkMark(uGdPuff * 0.45, fp);
  // the curds are only searched for where they are drawn (model is exactly
  // nought past them, so the far deck is the same picture)
  float capS = 1.0;
  if (model > 0.0) capS = gdCaps(vW * 1.37 + 11.0, dW, uGdPuff * 1.37 * 0.8, capB, idB);
  float gap = (1.0 - smoothstep(-0.02, 0.12, capH)) * modelA * 0.8 + (1.0 - smoothstep(-0.02, 0.06, capS)) * model * 0.35;
  vec3 nb = normalize(n + (capA - dW) * 0.95 * modelA + (capB - dW) * 0.55 * model);
  float ndl = dot(nb, L);
  float t = 0.14 + 0.60 * smoothstep(-0.30, 0.85, ndl) + 0.22 * smoothstep(0.30, 0.95, dot(nb, dW));
  t = mix(t, t * 0.78, clamp(gap, 0.0, 1.0));
  t += (inkF3(vW * 0.19 + 5.0) - 0.5) * 0.05 - 0.12 * sunSh;
  float h0 = clamp(capH / (uGdPuff * 2.2), 0.0, 1.0);
  // a crown's edge turned from the eye catches the light through it: the
  // silver of a cloud's own rim, on the sun's side only
  float rimV = 1.0 - smoothstep(0.06, 0.40, abs(dot(nb, V)));
  float edge = rimV * smoothstep(-0.25, 0.45, dot(nb, L));
  // the band the deck is in: the shell's own coordinate, its edge carried round
  // the heads; near, a head in the sun is cloud before it is band, and the
  // band's own colour gathers with the distance, where the deck is its strata
  vec3 bandC = gdBand(dW, uGdBelts, uGdTear, (h0 - 0.40) * 0.16, 0.0);
  vec3 base = mix(mix(uPaper, uCrest, 0.42), bandC, min(1.0, uGdBand * mix(0.20, 0.9, smoothstep(6.0, 34.0, dist))));
  // the values: a cloud top is the lightest thing in the picture, its flank the
  // deck's own luminous cool — light enough to be lit through, never a grey
  // stone — and the band's colour lives in the half-light between them. The
  // shade is laid wet: each step runs into the next across a wide edge, so a
  // head is turned by its value and not cut out by it. One head in three, near
  // enough to be read, is a chosen crown: its lit top stops on a hard edge.
  vec3 shadeC = mix(base, uGdShade, 0.58);
  vec3 cDeep = mix(shadeC, uGdShade, 0.35);
  vec3 cHalf = mix(base, uPaper, 0.14);
  vec3 cLit = mix(mix(base, uLitWarm, 0.12), uPaper, 0.60);
  vec3 cTop = mix(uPaper, base, 0.05);
  float sw = 0.7 * fwidth(t) + 0.004;
  float crisp = step(0.64, idA) * modelA;
  float wl = mix(0.09, sw, crisp);
  vec3 col = mix(cDeep, shadeC, smoothstep(0.10, 0.36, t));
  col = mix(col, cHalf, smoothstep(0.32, 0.56, t));
  col = mix(col, cLit, smoothstep(0.61 - wl, 0.61 + wl, t));
  col = mix(col, cTop, smoothstep(0.79 - wl, 0.79 + wl, t));
  col = mix(col, cTop, edge * 0.85);
  // lit through: in the shade, a head's own thin edge glows with the air behind
  // it, and the gaps between heads take the light of the tops around them
  float shade = 1.0 - smoothstep(0.34, 0.58, t);
  col = mix(col, mix(uGdGlow, uPaper, 0.30), rimV * shade * 0.42 * modelA);
  col = mix(col, mix(col, mix(uGdGlow, uLitWarm, 0.35), 0.50), clamp(gap, 0.0, 1.0) * shade * 0.30);
  // the pigment dried where the lit top stopped, on the chosen crowns only, and
  // broken where the brush lifted
  float rim = (1.0 - smoothstep(0.0, 2.2 * sw, abs(t - 0.61))) * crisp * step(0.42, inkN3(vW * 0.8 + 3.0));
  col = mix(col, mix(col, uInkSoft, 0.30), rim * 0.30);
  col *= 1.0 - shade * 0.05 * tooth;
  // the week's race: a faint ribbon of light along the deck — a run leaves no
  // road on a cloud — broken where the brush skipped and carried out across the
  // deck as far as the strata go
  float rw = 0.8 + 0.5 * inkN3(vW * 0.17 + 7.0);
  float rib = (1.0 - smoothstep(rw * 0.30, rw + 1.5 * fp, vRace)) * (0.55 + 0.45 * smoothstep(0.25, 0.70, inkN3(vW * 0.29 + 19.0)));
  col = mix(col, mix(mix(uPaper, uLitWarm, 0.45), col, 0.25), rib * 0.60);
  // the far deck is the band strata alone, and then the air
  float far = smoothstep(8.0, 40.0, dist);
  col = mix(col, mix(base, uGdGlow, 0.50), far * 0.50);
  col = mix(col, uGdGlow, smoothstep(16.0, 46.0, dist) * 0.80);
  return mix(c, col, uSurface);
}
`;


const MOON_VERT = /* glsl */ `
varying vec3 vW;
varying vec3 vN;
varying vec3 vL;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vL = normalize(mat3(modelMatrix) * position);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const MOON_FRAG = /* glsl */ `
uniform vec3 uPaper, uInk, uInkSoft, uShadeCool, uCrest, uPigment, uDark;
uniform vec3 uLight;
uniform float uPresence, uSeed;
varying vec3 vW;
varying vec3 vN;
varying vec3 vL;
${NOISE}

void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  vec3 L = normalize(vL);
  float tooth = inkTooth(gl_FragCoord.xy);
  float ndl = dot(N, uLight);
  // the maria: two or three broad washes on the near face, cut on a wandering
  // line the way every other wash on this globe is cut
  float maria = inkF3b(L * 2.3 + uSeed) - (0.50 + 0.06 * (inkN3(L * 5.0 + uSeed * 3.0) - 0.5));
  float mw = max(fwidth(maria) * 1.3, 0.012);
  float dark = smoothstep(-mw, mw, maria) * smoothstep(-0.35, 0.25, ndl);
  vec3 c = mix(uPigment, mix(uDark, uPigment, 0.35), dark * 0.42);
  c = mix(c, uCrest, smoothstep(0.20, 0.95, ndl) * 0.22);
  // the terminator stops on a wandering line, and the night is one flat wash
  float s = -(ndl + (inkF3(L * 3.4 + 9.0) - 0.5) * 0.10 + (inkN3(L * 12.0 + 2.0) - 0.5) * 0.03);
  float nw = max(0.7 * fwidth(s), 0.004);
  float night = smoothstep(-nw, nw, s);
  c = mix(c, mix(uDark, uInk, 0.35), night * 0.90);
  c = mix(c, mix(uShadeCool, c, 0.5), (1.0 - smoothstep(0.10, 0.80, ndl)) * 0.35 * (1.0 - night));
  // paper along the lit edge, and ink on the silhouette
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float rim = 1.0 - ndv;
  c = mix(c, uPaper, smoothstep(0.82, 1.0, rim) * 0.30 * (1.0 - night));
  c *= 0.97 + 0.06 * tooth;
  float ew = max(1.4 * fwidth(rim), 0.003);
  c = mix(c, uInk, (1.0 - smoothstep(0.0, ew, 1.0 - rim - 0.006)) * (0.45 + 0.35 * night));
  gl_FragColor = vec4(c, uPresence);
}
`;

/* --------------------------------------------------------------- reading --- */

/** The week's own sessions, biggest first: the sites, in hours. */
function sessionsOf(features) {
  const list = Array.isArray(features?.list) ? features.list : [];
  return list
    .filter((f) => f && f.kind !== 'monument' && f.dir && f.stats)
    .map((f) => ({ dir: f.dir, hours: Math.max(0, num(f.stats.activeS, 0)) / 3600, kind: f.kind, id: f.id }))
    .filter((s) => s.hours > 0.12)
    .sort((a, b) => b.hours - a.hours);
}

/** A direction at a given latitude, carried round to a given longitude: how a
 *  storm is stood on the deck. A gas giant's clouds have no fixed longitude —
 *  nothing on the deck is a place — but its belts have their latitudes, and a
 *  session's own latitude is what its storm keeps. */
function stormDir(lat, lon, out) {
  const y = clamp(lat, -0.93, 0.93);
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  out.set(Math.cos(lon) * r, y, Math.sin(lon) * r);
  return out.normalize();
}

/** The storm table: the great spot from the longest session (its size from its
 *  hours, its latitude the site's own), then a white oval per other big one.
 *  Every storm is stood on the face the poster opens on — the week's own
 *  activity side turned toward the sun, where base.js's poster already aims —
 *  and spread about it, so the deck is not a column of spots and the great spot
 *  is not round the back of the world. */
function stormTable(T, features, aim) {
  const sessions = sessionsOf(features);
  const spot = [], look = [];
  const rng = features.makeRng?.('giant/storms') || (() => 0.5);
  const top = sessions[0] || null;
  const aimLon = Math.atan2(aim.z, aim.x);
  // where each storm is carried to, in longitude about the axis: the great spot
  // stands a little off the aim — the poster's own subject, one step to the side
  // of the middle — and the ovals are spread either side of it, all of them on
  // the face the poster opens on, which is the only face there is room for on a
  // disc that runs off two sides of the frame
  const SPREAD = [0.16, 0.44, -0.38, 0.74, -0.66, 0.98];
  const dir = new T.Vector3();
  // every slot is filled: the shader's loop has a constant bound and breaks on
  // the count, and a uniform array is read whole
  for (let i = 0; i < SPOTS; i++) {
    const s = sessions[i];
    if (s) {
      const first = i === 0;
      stormDir(s.dir.y, aimLon + SPREAD[i] * (first ? 1 : 1 + 0.18 * (rng() - 0.5)), dir);
      const hours = s.hours;
      const size = clamp((first ? 0.042 : 0.018) + 0.030 * Math.sqrt(hours), 0.026, first ? 0.135 : 0.072);
      spot.push(new T.Vector4(dir.x, dir.y, dir.z, size));
      look.push(new T.Vector4(
        first ? 1.60 : 1.25 + 0.5 * rng(),          // how long the oval runs east
        rng() * TAU,                                 // its own spin
        first ? 1.0 : rng() < 0.16 ? 0.55 : 0.0,     // its hand: mineral, or paper
        first ? 0.85 : 0.30 + 0.45 * clamp(hours / Math.max(0.4, top?.hours || 1), 0, 1),
      ));
    } else {
      spot.push(new T.Vector4(0, 1, 0, 0.05));
      look.push(new T.Vector4(1, 0, 0, 0));
    }
  }
  return { spot, look, top, count: Math.min(SPOTS, sessions.length) };
}

/* ---------------------------------------------------------------- deck ----- */

// A smoothstep, for the CPU: none of this is a dial, so none of it has to be live.
const smoothstep01 = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * The sky under a deck (CEILING_FRAG) as one mesh, for every body whose whole
 * sky on foot is its own weather: the gas giant, the ice giant in its cold
 * pigments, the lava world's ash lit from under it. `pal` holds the washes it is
 * painted in, under the palette's own names; the rest is the body's composition:
 *   glow, shade  the air between the decks, and the deck's own cool
 *   high         the clear air over the weather, in the moon's opening
 *   spot         the great spot's wall in its own mineral (null: no wall)
 *   moons        the two moons' pigments (null: none); moonScale sizes the near one
 *   tower        { near, count, at }: how near the first anvil stands, how many
 *                stations stand round the horizon (six at most), and the first
 *                one's bearing off the landing (radians, on the wall's side)
 *   ember        { color, amount }: the light the ground throws up under smoke
 * The layout is the week's own hand ('giant/sky'): which side the moon and the
 * wall stand, and the seeds they are drawn from. update(camera, k) takes how
 * much of the sky it is (the body's own handoff) and carries the chart's anchor.
 */
export function createCeiling(T, {
  pal, light, time, features, R, radius, glow, shade, high = null, spot = null,
  moons = null, moonScale = 1, tower = {}, ember = null, belts = BELTS, tear = 1,
}) {
  const rng = features.makeRng?.('giant/sky') || (() => 0.5);
  const seed = rng() * 40;
  // which side of the landing the great spot's wall stands, and the moon the
  // other: the week's own hand, so the giants do not all open on one picture
  const side = rng() < 0.5 ? 1 : -1;
  const anchor = new T.Vector3();
  const anchorAt = new T.Vector3();
  const up = new T.Vector3();
  const wash = (c, fallback) => ({ value: (c || fallback).clone() });
  const material = new T.ShaderMaterial({
    uniforms: {
      uPaper: wash(pal.paper),
      uCrest: wash(pal.crest),
      uDry: wash(pal.dry, pal.crest),
      uLitWarm: wash(pal.litWarm),
      uShadeCool: wash(pal.shadeCool),
      uInk: wash(pal.ink),
      uInkSoft: wash(pal.inkSoft, pal.ink),
      uLandMid: wash(pal.landMid),
      uLandHigh: wash(pal.landHigh, pal.landMid),
      uSepia: wash(pal.sepia, pal.landHigh || pal.landMid),
      uLight: light,
      uGlow: { value: glow },
      uShade: { value: shade },
      uHigh: { value: high || shade.clone() },
      uSpotC: { value: spot || shade.clone() },
      uEmber: { value: ember ? new T.Vector4(ember.color.r, ember.color.g, ember.color.b, ember.amount) : new T.Vector4(0, 0, 0, 0) },
      uAnchor: { value: anchor },
      uMoonA: { value: moons ? moons[0] : shade.clone() },
      uMoonB: { value: moons ? moons[1] : shade.clone() },
      uMoonAt: { value: [
        new T.Vector4(-0.21 * side, 0.20, moons ? 0.105 * moonScale : 0, rng() * 40),
        new T.Vector4(2.3 * side, 0.11, moons ? 0.042 : 0, rng() * 40),
      ] },
      uStorm: { value: new T.Vector4(0.31 * side, 0.26, 0.075, spot ? 1 : 0) },
      uTowers: { value: new T.Vector3((tower.at ?? 0.07) * side, tower.near ?? 0.92, tower.count ?? 6) },
      uTime: time,
      uCeil: { value: 0 },
      uShell: { value: radius },
      uGround: { value: R + 1.5 },
      uBelts: { value: belts },
      uTear: { value: tear },
      uSeed: { value: seed },
    },
    vertexShader: DECK_VERT,
    fragmentShader: CEILING_FRAG,
    transparent: true,
    depthWrite: false,
    fog: false,
    side: T.BackSide,
  });
  // the shader reads every ray's own direction, so the dome only has to be
  // there to be drawn on: a plain sphere a hair under the deck it stands for.
  // It takes no depth, and it is the whole sky.
  const mesh = new T.Mesh(new T.SphereGeometry(radius * 0.994, 64, 32), material);
  mesh.name = 'body-sky-ceiling';
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.renderOrder = 1;
  return {
    mesh,
    uniforms: material.uniforms,
    anchor,
    update(camera, k) {
      material.uniforms.uCeil.value = k;
      mesh.visible = k > 0.004;
      // the sky's chart is stood on the way the eye was looking as it came
      // under the deck, and is carried with it from there, never turned by the
      // head: a landing or a jump sets it afresh
      if (!camera || k <= 0.004) return;
      if (camera.position.distanceToSquared(anchorAt) > 16 || anchor.lengthSq() < 0.5) camera.getWorldDirection(anchor);
      up.copy(camera.position).normalize();
      anchor.addScaledVector(up, -anchor.dot(up));
      if (anchor.lengthSq() > 1e-8) anchor.normalize();
      anchorAt.copy(camera.position);
    },
    dispose() {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}

/**
 * The body itself: the deck as one shell over the globe, painted as the week's
 * own weather and fading as the camera comes down through it, and the moons
 * beside it (see the module header). Returns a body's own shape:
 * { object, update, dispose }.
 */
export function createGiant(shared) {
  const T = shared.THREE;
  // `light` is the ink style's own uLight uniform ({ value: Vector3 }), shared
  // outright so the deck is lit by exactly the light the globe is: the sun
  // underfoot, and from orbit the poster's light, turned toward the painter.
  const { features, palette: pal, uniforms, light, R } = shared;
  const radius = R + DECK_LIFT;
  const table = stormTable(T, features, posterAim(features, (uniforms.uSunDir || light).value, new T.Vector3()));
  const rate = 0.011 + 0.016 * clamp(num(features.energy, 0) / 1.5, 0, 1) + 0.010 * clamp(num(features.roughness, 0), 0, 1);
  const uPresence = { value: 1 };
  // the moon's shadow: the caster's own place, and how much of it there is
  const uMoonPm = { value: new T.Vector3(0, radius * 3, 0) };
  const uMoonAm = { value: 0 };
  const material = new T.ShaderMaterial({
    uniforms: {
      uPaper: { value: pal.paper.clone() },
      uInk: { value: pal.ink.clone() },
      uInkSoft: { value: (pal.inkSoft || pal.ink).clone() },
      uSepia: { value: (pal.sepia || pal.landHigh).clone() },
      uLandLow: { value: (pal.landLow || pal.landMid).clone() },
      uLandMid: { value: pal.landMid.clone() },
      uLandHigh: { value: (pal.landHigh || pal.landMid).clone() },
      uCrest: { value: pal.crest.clone() },
      uDry: { value: (pal.dry || pal.crest).clone() },
      uBare: { value: (pal.bare || pal.landHigh).clone() },
      uLitWarm: { value: pal.litWarm.clone() },
      uShadeCool: { value: pal.shadeCool.clone() },
      uSkyHaze: { value: (pal.skyHaze || pal.skyWash).clone() },
      uAccent: { value: (pal.accent || pal.ink).clone() },
      uDark: { value: (pal.dark || pal.ink).clone() },
      uLight: light,
      uTime: uniforms.uTime,
      uPresence,
      uShell: { value: radius },
      uMoonP: uMoonPm,
      uMoonR: { value: MOON_R0 },
      uMoonA: uMoonAm,
      uRate: { value: rate },
      uWarmth: { value: num(features.warmth, 0.5) },
      uRough: { value: clamp(num(features.roughness, 0.4), 0, 1) },
      uTerm: { value: P['light.terminator'] },
      uForm: { value: P['body.form'] },
      uEddy: { value: P['giant.eddies'] },
      uStorm: { value: P['giant.storms'] },
      // how much of a vortex the deck wears: a week that never stopped moving
      // winds it tighter and rings its poles harder
      uLiquid: { value: 0.55 + 0.45 * clamp(num(features.energy, 0) / 1.5, 0, 1) },
      uSpotN: { value: table.count },
      uSpot: { value: table.spot },
      uSpotLook: { value: table.look },
    },
    vertexShader: DECK_VERT,
    fragmentShader: DECK_FRAG,
    transparent: true,
    depthWrite: true,
    fog: false,
    side: T.FrontSide,
  });
  const deck = new T.Mesh(new T.IcosahedronGeometry(radius, 32), material);
  deck.name = 'body-giant-deck';
  deck.frustumCulled = false;
  deck.renderOrder = -1;
  // The deck seen from inside: the sky under the deck (CEILING_FRAG, read in
  // its own chart off the way the runner landed looking), stood a hair under the
  // deck itself, so a runner on the cloud tops has the weather they flew down
  // through overhead instead of whatever sky another module drew.
  const tear = 0.85 + 0.55 * clamp(num(features.roughness, 0.4), 0, 1);
  const moonPigment = (i) => pal.landHigh.clone().lerp(pal.paper, 0.34 + 0.16 * i).lerp(pal.ink, 0.12);
  const sky = createCeiling(T, {
    pal, light, time: uniforms.uTime, features, R, radius,
    glow: pal.paper.clone().lerp(pal.litWarm, 0.34),
    shade: pal.shadeCool.clone().lerp(pal.landMid, 0.22),
    high: pal.shadeCool.clone().lerp(pal.landHigh, 0.20).lerp(pal.paper, 0.26),
    spot: table.top ? pal.landHigh.clone().lerp(pal.ink, 0.30).lerp(pal.bare || pal.landHigh, 0.25) : null,
    moons: [moonPigment(0), moonPigment(1)],
    tear,
  });
  const moons = createGiantMoons(T, features, pal, light, uniforms, R);
  const object = new T.Group();
  object.name = 'body-giant';
  object.add(deck, sky.mesh, moons);
  // the deck is the one thing between the eye and the ground from orbit, and a
  // giant week has no sea and no second body to read: nothing of it is hidden
  let lastPresence = -1;
  // the deck underfoot (see DECK_GROUND): the band colours are the palette's
  // own, so only the air, the cool and the week's tear are handed over — the
  // same air the sky's horizon is laid in, so the two meet without a seam
  const ground = {
    glsl: DECK_GROUND,
    uniforms: {
      uGdGlow: sky.uniforms.uGlow,
      // the deck's own flank: the week's cool, thinned toward the paper and
      // nothing of the ground's tan in it — a warm week's deck is lit cloud
      // with violet shade, and a tan shade on a tan deck is a dune
      uGdShade: { value: pal.shadeCool.clone().lerp(pal.paper, 0.30) },
      uGdTear: sky.uniforms.uTear,
      uGdBelts: { value: BELTS },
      uGdBand: { value: 1 },
      uGdPuff: { value: 2.4 },
    },
  };
  return {
    object,
    ground,
    // a cloud deck holds nothing up: no grove, no stones, no road on it
    props: false,
    // …and under the deck the deck is the whole sky (CEILING_FRAG)
    sky: true,
    update(frame = {}) {
      const surface = clamp(num(frame.surface, 0), 0, 1);
      const dist = (frame.camera?.position?.length?.() || radius * 4);
      // the ground's own terminator dial, read live: the night side is the one
      // thing on a giant that is the house's and not this body's
      material.uniforms.uTerm.value = P['light.terminator'];
      material.uniforms.uForm.value = P['body.form'];
      material.uniforms.uEddy.value = P['giant.eddies'];
      material.uniforms.uStorm.value = P['giant.storms'];
      // the shell is crossed at radius × 1.0 and the handoff is the crossing
      // itself: the deck stays whole until the eye is inside the cloud, shreds
      // over the last thirteen hundredths of a radius, and is gone under the
      // cloud tops — so what the camera flies through is the weather it was
      // looking at, and not a sheet lifted off a different world
      const bySurface = 1 - smoothstep01(0.90, 1.0, surface);
      const byDistance = clamp((dist - radius * 0.93) / (radius * 0.13), 0, 1);
      const presence = Math.min(bySurface, byDistance);
      if (Math.abs(presence - lastPresence) > 0.0015) {
        uPresence.value = presence;
        lastPresence = presence;
      }
      deck.visible = presence > 0.004;
      // …and the other side of the same crossing: under the deck, the deck is
      // overhead. It comes on as the camera passes the cloud tops and stays
      // while the runner is under them.
      const ceilK = clamp((radius - dist) / (radius * 0.09), 0, 1);
      sky.update(frame.camera, ceilK);
      // the moons are the sky's own under the deck (CEILING_FRAG): the small
      // bodies themselves belong to the view from outside it
      moons.visible = ceilK < 0.5;
      spinMoons(moons, num(frame.time, 0));
      // the caster: the near moon's own place, read off the clock like the moon
      // itself, so the shadow and the body that drops it can never part — and
      // only while it stands between the deck and the light at all
      const caster = moons.children[0];
      if (caster) {
        uMoonPm.value.copy(caster.position);
        uMoonAm.value = clamp(caster.position.dot(light.value) / (radius * MOON_D0 * 0.4), 0, 1);
      }
    },
    dispose() {
      deck.geometry.dispose();
      material.dispose();
      sky.dispose();
      for (const moon of moons.children) {
        moon.geometry.dispose();
        moon.material.dispose();
      }
    },
  };
}
/* --------------------------------------------------------------- moons ----- */

/** One small ink moon: a lumpy sphere, one pigment to a face, a wandering
 *  terminator, ink on the silhouette. Deterministic from the week's own PRNG. */
function inkMoon(T, { radius, distance, dir, seed, pigment, paper, ink, light }) {
  const geo = new T.IcosahedronGeometry(radius, 4);
  const pos = geo.attributes.position;
  const v = new T.Vector3();
  // the moon's own lumps: a body with a shape, not a ball — and a silhouette
  // that is a drawn edge rather than a circle
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const lump = Math.sin(v.x * 5.1 + seed) * Math.cos(v.y * 4.3 - seed * 1.7) * Math.sin(v.z * 6.7 + seed * 0.6);
    v.multiplyScalar(radius * (1 + 0.045 * lump));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  const mesh = new T.Mesh(geo, new T.ShaderMaterial({
    uniforms: {
      uPaper: { value: paper.clone() },
      uInk: { value: ink.clone() },
      uInkSoft: { value: ink.clone() },
      uShadeCool: { value: ink.clone() },
      uCrest: { value: paper.clone() },
      uDark: { value: ink.clone() },
      uPigment: { value: pigment.clone() },
      uLight: light,
      uPresence: { value: 1 },
      uSeed: { value: seed },
    },
    vertexShader: MOON_VERT,
    fragmentShader: MOON_FRAG,
    transparent: false,
    depthWrite: true,
    fog: false,
  }));
  mesh.name = 'companion-giant-moon';
  mesh.position.copy(dir).multiplyScalar(distance);
  // its own place and its own orbit: the plane is tipped off the deck's, so no
  // moon ever runs along the belts it is drawn against
  mesh.userData.home = dir.clone().multiplyScalar(distance);
  mesh.userData.axis = new T.Vector3(Math.cos(seed * 0.7), 0.22 + 0.2 * Math.sin(seed), Math.sin(seed * 0.7)).normalize();
  return mesh;
}

/** Where the poster will be looking: the week's own subject — every session's
 *  site weighted by the time spent at it — turned toward the sun by the same
 *  lean base.js's poster takes (POSTER_OFF, 0.28 rad on a week with no race).
 *  Read here so the moons can be stood where the poster's own aim will find
 *  them: a giant with its moons behind it is a giant with no moons. */
function posterAim(features, sun, out) {
  out.set(0, 0, 0);
  for (const f of features.list || []) {
    if (f.kind === 'monument') continue;
    const seconds = Number(f.stats?.activeS);
    out.addScaledVector(f.dir, Number.isFinite(seconds) ? Math.max(900, seconds) : 900);
  }
  if (out.lengthSq() < 1e-6) out.set(0, 1, 0);
  out.normalize();
  const side = sun.clone().addScaledVector(out, -out.dot(sun));
  if (side.lengthSq() > 1e-6) out.addScaledVector(side.normalize(), 0.28).normalize();
  return out;
}

/** The moons beside the giant: two small ones, both off the week's own activity
 *  side — one crossing the deck's edge, one out in the sky — each a cut-out of
 *  the week's own paper and ink, and each going slowly round the axis as the
 *  clock runs. */
export function createGiantMoons(T, features, pal, light, uniforms, R) {
  const rng = features.makeRng?.('giant/moons') || (() => 0.5);
  const group = new T.Group();
  group.name = 'companions';
  // One light for the whole picture: the deck's own — the sun underfoot, and
  // from orbit the poster's light, turned toward the painter. A moon lit by one
  // light and casting its shadow from another is two pictures on one page, so
  // the moon is painted with exactly the uniform the deck and its shadow are
  // (the weeks' own sun is only read to stand the moons on the sun's side of the
  // poster, as base.js stands the camera).
  const sun = light;
  const aim = posterAim(features, (uniforms?.uSunDir || light).value, new T.Vector3());
  const axis = new T.Vector3(0, 1, 0);
  const ink = (pal.ink || pal.shadeCool).clone();
  const paper = pal.paper.clone();
  // one up on one side, one down on the other, so the two do not read as a pair
  // of beads on one string: both on the face the poster opens on, and both well
  // inside the deck's own orbit, where the deck's belts are behind them
  const place = [
    { az: -0.20, el: 0.28, d: MOON_D0, r: MOON_R0 },
    { az: 0.15, el: -0.17, d: MOON_D1, r: MOON_R1 },
  ];
  for (let i = 0; i < place.length; i++) {
    const p = place[i];
    const dir = aim.clone().applyAxisAngle(axis, p.az).normalize();
    const side = new T.Vector3().crossVectors(dir, axis).normalize();
    dir.applyAxisAngle(side, p.el).normalize();
    const moon = inkMoon(T, {
      radius: p.r,
      distance: R * p.d,
      dir,
      seed: rng() * 40,
      pigment: pal.landHigh.clone().lerp(paper, 0.34 + 0.16 * i).lerp(ink, 0.12),
      paper,
      ink,
      light: sun,
    });
    moon.userData.reach = p.d;
    group.add(moon);
  }
  return group;
}

/** The moons go round: each is read off the clock rather than advanced, so a
 *  pinned instant always draws the same sky (see the module header). */
function spinMoons(group, time) {
  const angle = time * MOON_RATE;
  for (const moon of group.children) {
    moon.position.copy(moon.userData.home).applyAxisAngle(moon.userData.axis, angle);
  }
}

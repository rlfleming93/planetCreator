/* Planet Creator — the nocturne print.
 *
 * A nocturne is the same view painted at night: the sheet is thrown away and
 * the picture is repainted in the dark, lit only by the moon and by the lights
 * the week itself kept. That is what this pass is. The frame the wash and the
 * hand painted is a day — a paper sky and washes read in sunlight — so the pass
 * reads that day's own value plan (its paper-to-ink axis, its sea against its
 * land) and repaints the world in three dark blues: the sea's deepest, the
 * land's one value above it, and the third the moon reaches. The relief the
 * ground is legible by comes out of the depth buffer's own normals, and the
 * light it is read by is the week's own: the direction the ink pass lit the
 * world from decides which side the moon is on, and the print decides only how
 * far round it stands — a night is read by its terminator, and a light the
 * poster left near the eye leaves no night to be seen.
 *
 * Over that: the sky is real space — the week's own band across it and a field
 * of stars, drawn on the sheet and seeded by the week, so a week's sky is the
 * same sky every time the print is pulled. The week's training is what burns:
 * every activity site is a town on that dark ground, a cluster of warm lamps
 * whose reach follows the hours spent there; the race line and the week's own
 * routes are threads of light laid over the ground; and a week hard enough in
 * the red carries an aurora curtain over its pole. A thin blue rim stands on
 * the world's own silhouette, taken from the depth the frame was drawn with
 * rather than from the sphere, so mountains keep their own edge at the limb.
 *
 * The sites and the threads are the only things here that come from the week's
 * features rather than from the frame, and both are laid out in world units
 * once, when the pass is built — `update` runs every frame and only projects
 * what is already there. A site on the far side is switched off by its own
 * facing against the eye, so the lights stop at the limb and the week's
 * training is never drawn through the world.
 *
 * The dials follow the other prints: each is an offset from the nocturne this
 * module ships, so an absent entry and a 0 both change nothing, and a print
 * that never spread them still lays a whole night. Four of the bench's own
 * dials are answered as well, because a night has a use for each of them: the
 * committed dark deepens the picture's ink masses, the terminator strengthens
 * the moon, the atmosphere carries the rim and the aurora, and reserved paper
 * puts the sheet's own light back into the stars and the band.
 */
import * as THREE from 'three';

// What the sheet can carry. Both are loops in the shader, so both bounds are
// written into the source: a week has no more than this many sites, and a route
// read as a line rather than a survey needs no more samples than the second.
const SITES = 32;
const CHAIN = 56;
const LAMPS = 14;
// Where the nocturne's own moon stands: the phase the world is seen at, in
// radians from the eye's own direction, and how far round the dial may push it.
// A phase near the second quarter is what a night is read by — its terminator
// crosses the disc and its lit limb is the brightest ground on the sheet — and
// the week's own light still decides which side that limb is on (see update).
const MOON_PHASE = 1.82;
const MOON_FAR = 2.20;

/** The week's sites and threads in world units, laid out once when the pass is
 *  built (see uniforms). `update` only projects them. */
let laid = null;

const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const _moon = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a || 1e-9), 0, 1);
  return t * t * (3 - 2 * t);
};

/** The night's own blues. The week's sea keeps a third of its lean in them — a
 *  teal week's night is not the same blue as an ultramarine week's — and all of
 *  them are night. Plain vec3s rather than Colors: these are the pixels the
 *  pass writes, and a print's shader is the last word on the sheet. */
function nightTones(sea) {
  const hsl = { h: 0.605, s: 0.6, l: 0.2 };
  if (sea && sea.getHSL) sea.getHSL(hsl);
  const lean = clamp((hsl.h - 0.605) * 0.5, -0.09, 0.09);
  const tint = (r, g, b) => new THREE.Vector3(
    r * (1 + lean * 1.2), g * (1 + lean * 0.12), b * (1 - lean * 1.0),
  );
  return {
    space: tint(0.0165, 0.0225, 0.0465),   // the sheet's own space, nearly black
    deep: tint(0.0570, 0.0820, 0.1500),    // the sea, and the deepest shade
    land: tint(0.1080, 0.1390, 0.2310),    // the land, one value up from it
    lit: tint(0.2750, 0.3350, 0.4650),     // what the moon reaches
    air: tint(0.1150, 0.2450, 0.5200),     // the blue the air is
  };
}

/** How hard the week was, as the aurora reads it: the week's own heart-rate
 *  reading where it has one, and the roughness the climate was read with where
 *  it carried no zones at all, so a hard week with a chest strap and a hard
 *  week without one both earn their curtain. */
function auroraOf(features, sharedAtmo, dial, curlGain) {
  const stats = features && features.stats;
  const hard = Number(stats && stats.hard);
  const rough = Number(features && features.roughness);
  const value = Number.isFinite(hard) ? hard : (Number.isFinite(rough) ? (rough - 0.5) * 1.4 : 0);
  const gate = clamp((value - 0.08) / 0.30, 0, 1);
  return gate * (1.0 + dial + curlGain * sharedAtmo);
}

export default {
  id: 'nocturne',
  label: 'Nocturne',
  fragment: /* glsl */ `
uniform sampler2D tDiffuse, tDepth;
uniform vec2 uResolution;
uniform float uTime, uSeed;
uniform vec3 uPaper, uInk, uSeaDeep, uLand;

// the night's own values, the lights the week kept, and the space it sits in
uniform vec3 uNoctSpace, uNoctDeep, uNoctLand, uNoctLit, uNoctAir;
uniform vec3 uNoctWarm, uNoctLamp, uNoctStar, uNoctBand, uNoctAur, uNoctViolet;
// the moon, the eye it is seen from, and the frame the eye opens
uniform vec3 uMoonView;
uniform vec2 uMoonSheet;
uniform mat3 uViewBasis;
uniform vec3 uEye;
uniform vec2 uTanHalf;
uniform float uNear, uFar;
// the world's disc on the sheet, and the aurora's own strength
uniform vec2 uDisc;
uniform float uAurora;
uniform float uMoonLo, uMoonHi;
// the dials
uniform float uKey, uGlow, uThread, uThreadW, uStar, uBand, uRim, uAir, uTone, uVig;
// the week's own sites and threads, projected onto the sheet every frame
uniform vec2 uSitePos[32];
uniform float uSiteR[32], uSiteOn[32], uSiteL[32], uSiteS[32];
uniform vec3 uChainA[40], uChainB[40];
varying vec2 vUv;

float ntH12(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float ntN2(vec2 x){
  vec2 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(ntH12(i), ntH12(i + vec2(1.0, 0.0)), f.x);
  float b = mix(ntH12(i + vec2(0.0, 1.0)), ntH12(i + vec2(1.0, 1.0)), f.x);
  return mix(a, b, f.y);
}
float ntF2(vec2 x){
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 3; i++) { s += a * ntN2(x); n += a; x = x * 2.03 + vec2(1.7, -2.3); a *= 0.5; }
  return s / n;
}
// The eye's own depth, and the point of the eye's own space a pixel of the sheet
// stands for. Both are the ink pass's own conversions, so a normal read here is
// the normal the hand was drawing.
float linZ(float d){ float z = d * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }
vec3 vpos(vec2 uv, float z){ return vec3((uv * 2.0 - 1.0) * uTanHalf * z, -z); }
// The surface a pixel carries, from the depth of its four neighbours: the taps
// are clamped to what a steep-but-continuous surface could do over that offset,
// so a normal taken across the limb still describes the ground in front of it
// and not the void behind it. The moon is only as legible as this normal is.
vec3 ntNrm(vec2 uv, float rpx, vec2 px){
  float z0 = linZ(texture2D(tDepth, uv).x);
  float lim = max(0.02, 5.2 * uTanHalf.y * abs(z0) * px.y * rpx);
  vec2 o = px * rpx;
  float za = clamp(linZ(texture2D(tDepth, uv + vec2(o.x, 0.0)).x), z0 - lim, z0 + lim);
  float zb = clamp(linZ(texture2D(tDepth, uv - vec2(o.x, 0.0)).x), z0 - lim, z0 + lim);
  float ze = clamp(linZ(texture2D(tDepth, uv + vec2(0.0, o.y)).x), z0 - lim, z0 + lim);
  float zf = clamp(linZ(texture2D(tDepth, uv - vec2(0.0, o.y)).x), z0 - lim, z0 + lim);
  vec3 a = vpos(uv + vec2(o.x, 0.0), za), b = vpos(uv - vec2(o.x, 0.0), zb);
  vec3 e = vpos(uv + vec2(0.0, o.y), ze), f = vpos(uv - vec2(0.0, o.y), zf);
  vec3 n = normalize(cross(a - b, e - f));
  return n.z < 0.0 ? -n : n;
}
// One segment of a thread: the light it carries at this pixel, or none at all.
// A segment lives only where both its ends do — a sample the world has turned
// away carries no light, and a chain must break there rather than run to the
// sheet's corner through it. za also carries the sample's own depth (see
// update), so a thread the ground stands in front of is behind the ridge and not
// drawn over it. The loose term is the light the air keeps, the tight one the
// line itself; the caller takes the brightest segment, never the sum, or every
// joint between two segments beads.
float ntSeg(vec2 a, vec2 b, float za, float zb, float w, float pixDepth){
  if (min(za, zb) < 0.5) return 0.0;
  // how far the ground at this pixel stands in front of the sample: a thread a
  // ridge has come between the eye and is let go gradually, because a line that
  // breaks into dashes wherever the ground tilts reads as a mistake
  float occ = 1.0 - smoothstep(14.0, 46.0, (za - 1.0) * 1000.0 - pixDepth);
  if (occ <= 0.0) return 0.0;
  vec2 db = b - a;
  float reach = 0.5 * length(db) + 4.0 * w;
  vec2 dm = gl_FragCoord.xy - 0.5 * (a + b);
  if (dot(dm, dm) > reach * reach) return 0.0;
  vec2 pa = gl_FragCoord.xy - a;
  float h = clamp(dot(pa, db) / max(1.0, dot(db, db)), 0.0, 1.0);
  vec2 d = pa - db * h;
  float d2 = dot(d, d);
  float w2 = w * w;
  return occ * (0.34 * exp(-d2 / (w2 * 0.55)) + 0.13 * exp(-d2 / (w2 * 4.0)));
}
void main(){
  vec2 px = 1.0 / uResolution;
  float sheet = uResolution.y;                     // the sheet's height, device pixels
  vec2 q = gl_FragCoord.xy / sheet;                // the sheet, measured in its own height
  vec2 ndc = vUv * 2.0 - 1.0;
  float d0 = texture2D(tDepth, vUv).x;
  float sky = step(0.99998, d0);
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  vec3 ray = normalize(uViewBasis * vec3(ndc * uTanHalf, -1.0));

  // ---- the day this was painted as. Its own value plan first: the axis from
  // the sheet's paper to its ink, which is the one measure every style in this
  // app agrees on; then its two colours separated the way a plate is separated
  // (see the riso). What is left of a pixel once the ink axis is taken out of it
  // is chroma, and chroma is either the sea's or the land's. That is the whole
  // of what the night needs from the day.
  vec3 W = vec3(0.32, 0.55, 0.13);
  float lum = dot(c, W);
  float pl = dot(uPaper, W), il = dot(uInk, W);
  float v = clamp((pl - lum) / max(1e-3, pl - il), 0.0, 1.0);
  vec3 e0 = uInk - uPaper;
  float e00 = max(1e-4, dot(e0, e0));
  vec3 dd = c - uPaper;
  vec3 chroma = dd - e0 * clamp(dot(dd, e0) / e00, 0.0, 1.20);
  vec3 e1 = uSeaDeep - uPaper; e1 -= e0 * (dot(e1, e0) / e00);
  vec3 e2 = uLand - uPaper; e2 -= e0 * (dot(e2, e0) / e00);
  float sAmt = clamp(dot(chroma, e1) / max(0.03, dot(e1, e1)), 0.0, 1.0);
  float lAmt = clamp(dot(chroma, e2) / max(0.03, dot(e2, e2)), 0.0, 1.0);
  float water = smoothstep(0.08, 0.38, sAmt - 0.70 * lAmt);

  // ---- the ground at night: three values about the moon's own edge. The moon
  // is the week's light, so the terminator stands on the side the shaded side
  // always stood on. Three steps rather than a ramp, their boundaries broken by
  // the sheet's tooth, because a night read as a gradient is a night read as
  // mud: three separated values are what a form survives the dark in.
  vec3 ground = mix(uNoctLand, uNoctDeep, water);
  vec3 n0 = vec3(0.0, 0.0, 1.0);
  float key = 0.0;
  if (sky < 0.5) {
    n0 = ntNrm(vUv, 1.4, px);
    // the moon's own key, read across the range the eye can actually see: the
    // disc's centre faces the eye and the limb turns away by the world's own
    // angle, so the terminator and the lit limb are the ends of the ladder and
    // the three steps are laid between them (see update)
    float moon = clamp((dot(n0, uMoonView) - uMoonLo) / max(0.05, uMoonHi - uMoonLo), 0.0, 1.0);
    // and it is stretched across the lune rather than laid on it evenly: a
    // sphere's cosine crowds its own top into the last few degrees before the
    // limb, and three steps laid on the raw cosine would all fall there
    moon = clamp(pow(moon, 0.62) * uKey, 0.0, 1.0);
    float tooth = 0.085 * (ntN2(gl_FragCoord.xy * 0.72 + 11.0) - 0.5)
                + 0.045 * (ntN2(gl_FragCoord.xy * 0.24 + 3.0) - 0.5);
    float s3 = moon * 3.0 + tooth;
    key = (floor(s3) + smoothstep(0.42, 0.90, s3 - floor(s3))) / 3.0;
  }
  ground = mix(ground, uNoctLit, key * mix(1.0, 0.45, water));
  // the picture's own ink is still ink: a contour, a hatch, a shadow mass lies
  // one more step down in the dark, which is what keeps the day's drawing in it
  ground *= 1.0 - 0.18 * uTone * smoothstep(0.40, 0.96, v) * (1.0 - key);
  // which way round the world the rim gathers: away from the disc's centre on
  // the sheet, which is the one thing about the silhouette a point can answer
  // for — the edge itself is the frame's own depth (see the rim below)
  vec2 dc = gl_FragCoord.xy - uDisc;
  vec2 edgeDir = normalize(dc + vec2(1e-4, 1e-4));

  // ---- the sky, which the day had painted as paper. Space, the week's own
  // band across it, and the stars. The band and the field are drawn on the
  // sheet, never on the sky: the sheet is what a print is pulled from, and its
  // own seed is what makes one week's sky another week's sky.
  vec3 space = uNoctSpace;
  float band = 0.0;
  {
    float ang = 0.65 + fract(uSeed * 0.6180339887) * 2.5;
    vec2 n = vec2(cos(ang), sin(ang));
    vec2 o = vec2(ntH12(vec2(uSeed, 3.0)) - 0.5, ntH12(vec2(uSeed, 9.0)) - 0.5) * 0.16;
    float t = dot(q - 0.5 - o, n) / 0.185;
    float s = dot(q - 0.5 - o, vec2(-n.y, n.x));
    float clump = ntF2(vec2(s * 3.1 + uSeed * 11.0, t * 1.5 + uSeed * 3.0));
    band = exp(-t * t) * (0.16 + 0.84 * clump);
    space += uNoctBand * band * uBand;
  }
  {
    float star = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float cell = 0.0132 * pow(2.55, fi);
      vec2 g = q / cell + vec2(uSeed * 41.0, uSeed * 17.0) + fi * 23.1;
      vec2 id = floor(g);
      vec2 f = fract(g) - 0.5;
      float h = ntH12(id + fi * 19.7);
      float live = step(0.960 - 0.010 * fi - 0.055 * band, h);
      vec2 at = (vec2(ntH12(id + 5.1), ntH12(id + 12.9)) - 0.5) * 0.60;
      float rad = (0.00075 + 0.00100 * ntH12(id + 2.3)) * pow(1.30, fi);
      float d2 = dot((f - at) * cell, (f - at) * cell);
      float tw = 0.76 + 0.24 * sin(uTime * 0.6 + h * 71.0);
      // a star is a point with a little air around it, and the point is what
      // tells a sky from a field of bokeh
      star += live * tw * (0.55 * exp(-d2 / (rad * rad * 0.16)) + 0.45 * exp(-d2 / (rad * rad)))
            * (0.30 + 0.70 * ntH12(id + 8.3));
    }
    space += mix(uNoctStar, vec3(1.0, 0.86, 0.62), 0.35) * min(star, 1.7) * uStar;
  }

  // ---- the aurora, on the week that earned one: a curtain standing in the
  // ring of colatitude the ovals live in, its fold running round the pole and
  // drifting slowly. Over bare space the pixel's own ray answers for where it
  // points; over the world, the ground's own bearing does, which is what lets
  // one curtain lie across both the terrain and the sky it is seen against —
  // and from a poster's own low vantage that is the whole of what is visible of
  // it: the near half of the oval, laid over the world's top limb, green at its
  // foot and violet where it reaches up.
  vec3 aurora = vec3(0.0);
  if (uAurora > 0.001) {
    vec3 dir = sky > 0.5 ? ray : normalize(uEye + uViewBasis * vpos(vUv, linZ(d0)));
    float co = acos(clamp(dir.y, -1.0, 1.0));            // colatitude: 0 at the pole
    float lon = atan(dir.z, dir.x);
    // the oval: open toward the pole, closed toward the equator, which from a
    // poster's low vantage puts the near half of the ring across the world's top
    // limb and lets it reach up past the limb into the sky behind it
    // the oval: a ribbon, not a cap. Its poleward half is beyond the limb
    // whatever the poster does, so the band is opened toward the pole and only
    // closed well equatorward of it, which is where the half that shows lives
    float ring = smoothstep(1.04, 0.54, co) * smoothstep(0.13, 0.30, co);
    // The rays: fine round the pole and coarse across it, drifting slowly, so the
    // curtain reads as filaments running poleward rather than as a blotch of
    // colour. Two scales of them, because one noise is a haze and two are a
    // curtain — the long ones carry the drape and the short ones the loom of it.
    float rays = ntF2(vec2(lon * 36.0 + uTime * 0.055, co * 1.0 - uTime * 0.018));
    float folds = ntF2(vec2(lon * 8.5 + uTime * 0.022, co * 3.2 - uTime * 0.055));
    float drape = 0.16 + 0.62 * rays * (0.42 + 0.58 * folds);
    // The foot of a curtain is where it burns: a bright hem laid along the
    // equatorward edge of the band, which is the edge the eye sees, and the one
    // thing that makes an aurora read at a shelf's own size instead of as a
    // smudge of green. The hem wanders with the rays, so it is a broken line of
    // light and never a drawn arc.
    float hemD = (co - 0.300 - 0.030 * (rays - 0.5)) / 0.052;
    float hem = exp(-hemD * hemD) * (0.55 + 0.45 * rays);
    // Up the band the green goes over into the violet a high curtain turns: read
    // along the ray and not across the picture, so the colour is the altitude's.
    vec3 hue = mix(uNoctViolet, uNoctAur, smoothstep(0.56, 0.24, co));
    float dark = 0.30 + 0.70 * (1.0 - clamp(dot(dir, uMoonView), 0.0, 1.0));
    aurora = hue * ring * (drape + hem * 0.95) * dark * uAurora;
    // and the high arc above it: the second, fainter oval a strong night carries,
    // steady where the lower one looms, so the curtain has a sky to stand in
    float ring2 = smoothstep(0.92, 0.50, co) * smoothstep(0.10, 0.22, co);
    float rays2 = ntF2(vec2(lon * 21.0 + uTime * 0.031, co * 1.7 - uTime * 0.012));
    aurora += mix(uNoctAur, uNoctViolet, 0.62) * ring2 * (0.05 + 0.20 * rays2) * dark * uAurora;
  }

  // ---- the week's training. Every site is a town: the air around it and the
  // lamps laid through it — more of them, and further out, the longer the week
  // spent there. The far side is already switched off (see update), so nothing is
  // drawn through the world.
  vec3 lights = vec3(0.0);
  for (int i = 0; i < 32; i++) {
    float on = uSiteOn[i];
    if (on > 0.0) {
      vec2 d = gl_FragCoord.xy - uSitePos[i];
      float R = uSiteR[i];
      float d2 = dot(d, d);
      // The town's street plan, its wicks and the air it is lit in, all three
      // measured on the sheet and all three before the town's own edge: the
      // pitch of the lamp lattice, a lamp's wick, and the reach that has to
      // hold them. A town's reach reaches further than the town does, and further
      // than a fixed share of the sheet as well — at the size a shelf shows, a
      // village's whole footprint is two pixels across and the week's training
      // is invisible in the dark, which is the one thing a nocturne of a training
      // week cannot afford. But the reach also has to *contain* the plan: the
      // lattice stands about 1.8 pitches either way from its own centre with a
      // lamp's air twice its wick beyond that, and a reach built from the site's
      // own disc alone cuts the outer lamps off the picture and leaves the middle
      // ones drawn as the single bead the plan was cut to break up. The reach is
      // therefore built from the plan, with the sheet's own floors under both.
      float plan = max(R * 0.72, 0.0120 * sheet);
      float wickR = max(R * 0.30, 0.0028 * sheet);
      float reach = min(max(R * 5.5, 2.9 * plan + 2.0 * wickR), 0.10 * sheet);
      if (d2 < reach * reach) {
        float s = uSiteS[i];
        // one town's lamps carry one town's light: spread over a wider disc, the
        // peak is lower, so a close pass cannot blow the picture out
        float peak = min(1.0, 11.0 / R);
        // The air round the town is kept well under the lamps it carries: a city
        // at night is read by the skirt of its own light, but a skirt that stands
        // a quarter as tall as the lamps fills the dark the lamps were separated
        // by, and the street plan goes back to being one glowing disc. There is
        // deliberately no second, brighter light on the town's own disc either:
        // the wicks and their air already are the town.
        lights += uNoctLamp * (exp(-d2 / (reach * reach * 0.24)) * 0.20 + exp(-d2 / (R * R * 9.0)) * 0.18) * peak * on;
        float lamps = 0.0;
        float cool = 0.0;
        // The lamps are laid on a lattice and not scattered at random, because a
        // settlement is a street plan: a grid of fourteen sites, each nudged by
        // the town's own hand, a few of them dark. A town of four lamps is a
        // crossroads and one of fourteen is a city, and both read as somewhere the
        // week went rather than as a fleck of warm — and with the pitch, the wick
        // and the reach floors above, the plan survives the smallest picture the
        // poster is read at instead of collapsing into one dot.
        // Their air thins as the town fills: four lamps a street apart have airs
        // that never meet, fourteen have airs that add up to the one blaze the
        // lattice was cut to break up — a dense town keeps its wicks and gives up
        // its haze, which is what a city seen from far off does.
        float airW = 0.34 * mix(1.0, 0.42, clamp((uSiteL[i] - 5.0) / 9.0, 0.0, 1.0));
        for (int k = 0; k < 14; k++) {
          if (float(k) < uSiteL[i]) {
            float kx = mod(float(k), 3.5) - 1.25 + (ntH12(vec2(s + float(k) * 1.7, 3.1)) - 0.5) * 1.1;
            float ky = floor(float(k) / 3.5) - 1.5 + (ntH12(vec2(s + float(k) * 2.3, 8.7)) - 0.5) * 1.1;
            vec2 dl = d - vec2(kx, ky) * plan;
            float lit = 0.30 + 0.70 * ntH12(vec2(s + float(k) * 3.9, 13.1));
            // a lamp has a wick and it has an air: the point is what reads as a
            // window and the air is what reads as a street. The air is kept to
            // twice the wick and no wider, because air that reaches past the next
            // lamp along the row is the bead again, drawn around fourteen points
            // instead of one.
            float wick = exp(-dot(dl, dl) / (wickR * wickR));
            lamps += (wick * 1.10 + exp(-dot(dl, dl) / (wickR * wickR * 4.0)) * airW) * lit;
            // and the few cool ones: a lit window is sodium, a floodlit pitch is
            // not, and a week played under lights should say so in the picture and
            // not only in the reading
            cool += wick * step(0.82, ntH12(vec2(s + float(k) * 5.3, 21.5))) * lit;
          }
        }
        lights += (uNoctWarm * (lamps * 0.92)
                 + mix(uNoctLamp, vec3(0.62, 0.78, 1.0), 0.55) * cool * 0.95) * peak * on * uGlow;
      }
    }
  }
  lights *= mix(1.0, 0.62, key);                 // the moon washes a town out

  // ---- and the lines the week drew. The race line is the bright thread and
  // the week's own routes run under it, so a week with a race is read as its
  // story over its map.
  float lineA = 0.0, lineB = 0.0;
  float pixDepth = linZ(d0);
  for (int i = 0; i < 39; i++) {
    lineA = max(lineA, ntSeg(uChainA[i].xy, uChainA[i + 1].xy, uChainA[i].z, uChainA[i + 1].z, uThreadW, pixDepth));
    lineB = max(lineB, ntSeg(uChainB[i].xy, uChainB[i + 1].xy, uChainB[i].z, uChainB[i + 1].z, uThreadW, pixDepth));
  }
  vec3 thread = (uNoctLamp * lineA + mix(uNoctLamp, uNoctAir, 0.35) * lineB * 0.5) * uThread;
  thread *= mix(1.0, 0.5, key);           // the moon washes the lines out too

  // ---- the rim, and the air it scatters into. Both come out of the frame's
  // own depth and from two rings of taps rather than from one: the world's edge
  // is its own relief — mountains stand out past the sea's circle by more than
  // the print's whole line — so a circle drawn from the planet's nominal radius
  // would sit inside the mountains and outside the bays, which is the one thing
  // a rim must never do. Each ring is read as the mean of its four taps against
  // the pixel's own state, which is a line with a width rather than a staircase.
  // No stroke here is ruled: the cross the taps are taken on is turned off the
  // ruler by the sheet's own hash, so a diagonal limb loses its staircase the
  // way a drawn line does — the same trick the hand's own pass uses.
  float ra = (ntH12(gl_FragCoord.xy * 1.7) - 0.5) * 1.15;
  vec2 rxA = vec2(cos(ra), sin(ra)), ryA = vec2(-rxA.y, rxA.x);
  float o1 = 0.0045 * sheet, o2 = 0.0160 * sheet, o3 = 0.0340 * sheet;
  #define NT_SKY(off) step(0.99998, texture2D(tDepth, vUv + (off)).x)
  float sA = NT_SKY(rxA * o1 * px.y), sB = NT_SKY(-rxA * o1 * px.y);
  float sC = NT_SKY(ryA * o1 * px.y), sD = NT_SKY(-ryA * o1 * px.y);
  float tA = NT_SKY(rxA * o2 * px.y), tB = NT_SKY(-rxA * o2 * px.y);
  float tC = NT_SKY(ryA * o2 * px.y), tD = NT_SKY(-ryA * o2 * px.y);
  float uA = NT_SKY(rxA * o3 * px.y), uB = NT_SKY(-rxA * o3 * px.y);
  float uC = NT_SKY(ryA * o3 * px.y), uD = NT_SKY(-ryA * o3 * px.y);
  float line = mix(max(max(sA, sB), max(sC, sD)), 1.0 - min(min(sA, sB), min(sC, sD)), sky)
             * mix(0.55, 1.0, sky);
  float halo = abs(sky - 0.25 * (tA + tB + tC + tD)) * mix(0.45, 1.0, sky);
  float far = abs(sky - 0.25 * (uA + uB + uC + uD)) * mix(0.30, 1.0, sky);
  float moonSide = 0.42 + 0.58 * smoothstep(-0.25, 0.95, dot(edgeDir, uMoonSheet));

  vec3 col = mix(ground, space, sky);
  col += aurora;
  // the line is the world's own edge; the halo and the wide glow are the light
  // the air keeps of it, which is the one thing on the sheet that is neither
  // drawn nor on the world
  col += uNoctAir * line * 0.46 * uRim * moonSide;
  col += uNoctAir * (halo * 0.34 + far * 0.22) * uAir * moonSide;
  // the lights the week kept stand on the world: a town's glow dies at the
  // limb with the ground it was built on, less the little the air scatters
  float world = mix(1.0, 0.04, sky);
  col += (lights + thread) * world;
  // the sheet under it all: a night is still printed, so the tooth sits in the
  // deepest values and the corners fall away into the paper's own dark
  col *= 1.0 + (ntN2(gl_FragCoord.xy * 0.85) - 0.5) * 0.030;
  col *= 1.0 - 0.13 * uVig * smoothstep(0.42, 0.98, length(q - vec2(0.5, 0.50)) * 1.42);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`,
  uniforms(ctx = {}) {
    // A dial comes from params.js as `print.nocturne.glow` when it is there at
    // all, and from the bare name otherwise. Either way it is an offset from the
    // night this module ships, so an absent entry and a 0 both change nothing.
    const dial = (name, fallback) => {
      const p = ctx?.dials;
      const value = p?.[`print.nocturne.${name}`] ?? p?.[name];
      return typeof value === 'number' ? value : fallback;
    };
    // The bench's own dials, answered where a night has a use for them: the
    // committed dark, the terminator's own turn, the air, and reserved paper.
    const shared = ctx?.dials || {};
    const sharedDial = (key, fallback) => (typeof shared[key] === 'number' ? shared[key] : fallback);

    const T = ctx.THREE;
    const features = ctx.features || {};
    const palette = ctx.palette || null;
    const radius = Number(ctx.radius) || 120;
    const seed = Number.isFinite(Number(ctx.seed)) ? Number(ctx.seed) : 1;
    const night = nightTones(palette && palette.seaDeep);

    // ---- the week's own sites, in world units. The longest hours get the
    // room: a week of one long ride and four short walks is that ride's lights.
    const heightAt = typeof features.heightAt === 'function' ? features.heightAt : () => 0;
    const list = Array.isArray(features.list) ? features.list : [];
    // A feature carries the activity it was read from (base.js), so the hours
    // the week spent there are the recording's own active seconds — and a
    // feature that carries nothing is a session with no time behind it, which is
    // a village and never a city.
    const places = list
      .filter((f) => f && f.dir)
      .map((f, i) => ({
        id: i,
        dir: f.dir.clone().normalize(),
        hours: Math.max(0, Number(f.hours) || Number(f.stats?.activeS) / 3600 || 0),
      }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, SITES);
    const sites = places.map((place) => {
      const ground = Math.max(0, Number(heightAt(place.dir)) || 0);
      const hours = Math.min(place.hours, 6);
      return {
        dir: place.dir,
        pos: place.dir.clone().multiplyScalar(radius + ground + 0.35),
        // A town spreads with the time spent in it: a session is a village, a
        // four-hour ride is a city. In world units, so any camera and any
        // capture size see the same town.
        r: 1.70 + 0.90 * Math.sqrt(hours),
        lamps: Math.max(4, Math.min(LAMPS, 4 + Math.round(hours * 2.2))),
        seed: (Math.abs(Math.sin((place.id + 1) * 12.9898 + seed * 0.6180339887) * 43758.5453) % 1),
        // brightness follows the hours as well, gently: a big day burns
        // brighter, and no week's town is a searchlight
        bright: 0.55 + 0.45 * Math.min(1, hours / 3),
      };
    });

    // ---- the week's own lines: the race first, then its routes, longest
    // first, so the story is the bright thread and the map runs under it.
    const routes = [];
    if (features.race && features.race.seg && features.race.seg.length >= 9) routes.push(features.race);
    for (const route of Array.isArray(features.routes) ? features.routes : []) {
      if (route && route !== features.race && route.seg && route.seg.length >= 9) routes.push(route);
    }
    routes.sort((a, b) => (Number(b.total) || 0) - (Number(a.total) || 0));
    const chains = routes.slice(0, 2).map((route) => {
      const n = Math.floor(route.seg.length / 3);
      const cum = route.cum && route.cum.length === n ? route.cum : null;
      const total = cum ? cum[n - 1] : 0;
      const out = [];
      let i = 1;
      for (let k = 0; k < CHAIN; k++) {
        const s = total > 0 ? (k / (CHAIN - 1)) * total : 0;
        if (cum) while (i < n - 1 && cum[i] < s) i++;
        const a = cum ? i - 1 : Math.max(0, Math.min(n - 2, Math.round((k / (CHAIN - 1)) * (n - 1)) - 1));
        const b = Math.min(n - 1, a + 1);
        const t = cum ? clamp((s - cum[a]) / Math.max(1e-9, cum[b] - cum[a]), 0, 1) : 0;
        _p.set(
          route.seg[a * 3] + (route.seg[b * 3] - route.seg[a * 3]) * t,
          route.seg[a * 3 + 1] + (route.seg[b * 3 + 1] - route.seg[a * 3 + 1]) * t,
          route.seg[a * 3 + 2] + (route.seg[b * 3 + 2] - route.seg[a * 3 + 2]) * t,
        ).normalize();
        const ground = Math.max(0, Number(heightAt(_p)) || 0);
        out.push(_p.clone().multiplyScalar(radius + ground + 0.5));
      }
      return out;
    });
    laid = { sites, chains, phase: MOON_PHASE + dial('phase', 0) };

    const fill = (count, make) => Array.from({ length: count }, make);
    return {
      uNoctSpace: { value: night.space },
      uNoctDeep: { value: night.deep },
      uNoctLand: { value: night.land },
      uNoctLit: { value: night.lit },
      uNoctAir: { value: night.air },
      uNoctWarm: { value: new T.Vector3(1.0, 0.720, 0.400) },
      uNoctLamp: { value: new T.Vector3(1.0, 0.540, 0.190) },
      uNoctStar: { value: new T.Vector3(0.780, 0.840, 1.000) },
      uNoctBand: { value: new T.Vector3(0.072, 0.086, 0.132) },
      uNoctAur: { value: new T.Vector3(0.200, 0.950, 0.360) },
      uNoctViolet: { value: new T.Vector3(0.620, 0.280, 0.950) },
      uMoonView: { value: new T.Vector3(0, 1, 0) },
      uMoonLo: { value: -0.25 },
      uMoonHi: { value: 0.90 },
      uMoonSheet: { value: new T.Vector2(0, 1) },
      uViewBasis: { value: new T.Matrix3() },
      uEye: { value: new T.Vector3() },
      uTanHalf: { value: new T.Vector2(1, 1) },
      uNear: { value: 0.3 },
      uFar: { value: 2000 },
      uDisc: { value: new T.Vector2() },
      uAurora: { value: auroraOf(features, sharedDial('light.atmosphere', 0), dial('aurora', 0), 0.5) },
      // The craft dials, each an offset from the night this module ships.
      uKey: { value: 1.0 + dial('key', 0) + 0.35 * sharedDial('light.terminator', 0) },
      uGlow: { value: 1.0 + dial('glow', 0) },
      uThread: { value: 1.0 + dial('thread', 0) },
      uThreadW: { value: 1 },
      uStar: { value: 1.0 + dial('star', 0) + 0.9 * sharedDial('craft.paper', 0) },
      uBand: { value: 1.0 + dial('band', 0) + 0.9 * sharedDial('craft.paper', 0) },
      uRim: { value: 1.0 + dial('rim', 0) + 0.8 * sharedDial('light.atmosphere', 0) },
      uAir: { value: 1.0 + dial('air', 0) + 0.6 * sharedDial('light.atmosphere', 0) },
      uTone: { value: 1.0 + dial('tone', 0) + 1.1 * sharedDial('craft.values', 0) },
      uVig: { value: 1.0 + dial('vignette', 0) },
      uSitePos: { value: fill(SITES, () => new T.Vector2()) },
      uSiteR: { value: fill(SITES, () => 0) },
      uSiteOn: { value: fill(SITES, () => 0) },
      uSiteL: { value: fill(SITES, () => 0) },
      uSiteS: { value: fill(SITES, () => 0) },
      uChainA: { value: fill(CHAIN, () => new T.Vector3()) },
      uChainB: { value: fill(CHAIN, () => new T.Vector3()) },
    };
  },
  /** Every frame, before the pass: where the world's disc, the moon and the
   *  week's own sites and lines now stand on the sheet, in the sheet's own
   *  pixels. A capture pins the camera, but the bench also resizes the sheet
   *  between cells and the app is a live planet, so none of it can be baked. */
  update(ctx, u) {
    const cam = ctx.camera;
    const res = u.uResolution.value;
    const sheet = res.y;
    const halfTan = Math.tan((cam.fov * Math.PI) / 360);
    const f = (sheet * 0.5) / halfTan;                 // the eye's focal length, in pixels
    const radius = Number(ctx.radius) || 120;
    const d0 = cam.position.length();                  // how far the eye stands off
    u.uTanHalf.value.set(halfTan * cam.aspect, halfTan);
    u.uNear.value = cam.near;
    u.uFar.value = cam.far;
    u.uViewBasis.value.setFromMatrix4(cam.matrixWorld);
    u.uEye.value.copy(cam.position);
    u.uThreadW.value = Math.max(1.0, 0.0024 * sheet);

    // ---- the moon, which is the week's own light standing where the print puts
    // it (see MOON_PHASE): the side is the week's, the phase is the night's, and
    // the terminator therefore falls across the disc instead of around its edge.
    // Everything downstream — the quantised key, the rim's own gathering, the
    // aurora's dark side — is read off this one moon.
    const light = ctx.light && ctx.light.value ? ctx.light.value : null;
    if (light && light.lengthSq() > 1e-8) {
      _moon.copy(light).normalize().transformDirection(cam.matrixWorldInverse);
      // The eye's own direction is +z in the eye's frame, so the angle between
      // the two is the phase the disc is seen at, and the axis is the one that
      // keeps the week's own side. The phase itself is the print's: the night
      // owns its moon, and a week whose light the poster left behind the painter
      // would otherwise be lit flat, with no terminator to read a sphere by.
      _tan.crossVectors(_v.set(0, 0, 1), _moon);
      if (_tan.lengthSq() > 1e-6) {
        const cur = Math.acos(clamp(_moon.z, -1, 1));
        const want = clamp(laid ? laid.phase : MOON_PHASE, 0.65, MOON_FAR);
        _moon.applyAxisAngle(_tan.normalize(), want - cur);
      }
      u.uMoonView.value.copy(_moon);
      // the range of the moon's own key that the eye can see at all: the disc's
      // centre faces the eye, and the limb turns away by the world's own angle.
      // The night's three steps are laid between those two, so the terminator
      // falls where the moon's direction says it does and the lit limb is the
      // top of the ladder rather than a step it can never reach.
      const phase = Math.acos(clamp(_moon.z, -1, 1));
      const limbAng = Math.acos(clamp(radius / Math.max(1e-4, d0), -1, 1));
      u.uMoonLo.value = Math.cos(phase);
      u.uMoonHi.value = Math.max(u.uMoonLo.value + 0.25, Math.cos(Math.max(0, phase - limbAng)));
      // and the moon's own bearing on the sheet: the side the rim gathers on
      // and the dark the aurora answers to.
      _p.copy(_moon).applyMatrix3(u.uViewBasis.value);
      _right.setFromMatrixColumn(cam.matrixWorld, 0);
      _up.setFromMatrixColumn(cam.matrixWorld, 1);
      const bx = _p.dot(_right), by = _p.dot(_up);
      const sep = Math.hypot(bx, by);
      u.uMoonSheet.value.set(sep > 1e-4 ? bx / sep : 0, sep > 1e-4 ? by / sep : 1);
    }

    // where the world's centre stands on the sheet: the one thing the rim's own
    // gathering is read from, and the only part of it that a circle can answer
    // for — the world's edge itself is the frame's depth (see the fragment).
    _p.set(0, 0, 0).project(cam);
    u.uDisc.value.set((_p.x * 0.5 + 0.5) * res.x, (_p.y * 0.5 + 0.5) * res.y);

    // ---- the sites. A site stands on the world it was placed on, and the eye
    // sees the near face of a sphere: past the limb a site is on the far side
    // and its town is switched off, faded over the last degree of the turn so
    // that a light never blinks out at the edge of the world.
    const eye = _eye.copy(cam.position).normalize();
    const limb = radius / Math.max(1e-4, d0);
    const margin = 1.6 * sheet;
    for (let i = 0; i < SITES; i++) {
      const site = laid && laid.sites[i];
      const facing = site ? site.dir.dot(eye) : -1;
      const vis = site ? sstep(limb + 0.004, limb + 0.05, facing) : 0;
      _v.copy(site ? site.pos : _p.set(0, 0, 0)).applyMatrix4(cam.matrixWorldInverse);
      const depth = -_v.z;
      if (vis <= 0 || depth < 0.05) {
        u.uSiteOn.value[i] = 0;
        continue;
      }
      _p.copy(site.pos).project(cam);
      const sx = (_p.x * 0.5 + 0.5) * res.x;
      const sy = (_p.y * 0.5 + 0.5) * res.y;
      if (sx < -margin || sy < -margin || sx > res.x + margin || sy > res.y + margin) {
        u.uSiteOn.value[i] = 0;
        continue;
      }
      u.uSitePos.value[i].set(sx, sy);
      // a town near the eye is still a town: the glow is capped to a share of
      // the sheet, or a close pass turns one cluster into a blown-out slab
      u.uSiteR.value[i] = clamp((site.r * f) / Math.max(1e-3, depth), 1.5, 0.035 * sheet);
      u.uSiteOn.value[i] = vis * site.bright;
      u.uSiteL.value[i] = site.lamps;
      u.uSiteS.value[i] = site.seed;
    }

    // ---- the lines. A segment is live only when both its ends are: the thread
    // stops at the limb, and no segment costs anything where it is not.
    for (let c = 0; c < 2; c++) {
      const chain = laid ? laid.chains[c] : null;
      const target = c === 0 ? u.uChainA.value : u.uChainB.value;
      for (let i = 0; i < CHAIN; i++) {
        const at = chain && chain[i];
        const facing = at ? at.dot(eye) : -1;
        const vis = at ? sstep(limb + 0.004, limb + 0.05, facing) : 0;
        _v.copy(at || _p.set(0, 0, 0)).applyMatrix4(cam.matrixWorldInverse);
        const depth = -_v.z;
        if (vis <= 0.35 || depth < 0.05) {
          target[i].set(0, 0, 0);
          continue;
        }
        _p.copy(at).project(cam);
        // a live sample carries its own depth in z beside its flag: the pass
        // needs it to let a ridge stand in front of the thread it hides
        target[i].set((_p.x * 0.5 + 0.5) * res.x, (_p.y * 0.5 + 0.5) * res.y, 1 + depth / 1000);
      }
      // a sample carries the segment that starts at it, so the last one carries
      // nothing and the shader's loop stops at CHAIN - 2 of its own accord
    }
  },
};

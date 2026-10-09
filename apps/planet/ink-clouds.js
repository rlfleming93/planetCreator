/* Planet Creator — the orbit's weather (sky.orbitClouds).
 *
 * From orbit a week's planet is a disc hung in deep space. This module hangs
 * one more shell over it — above the orbit relief cap, where the terrain mesh's
 * silhouette can never reach it — and paints the week's weather on it the way
 * the world's weather is read from orbit: a few planet-sized systems with clear
 * sky between them, each a kind of weather a glance can name.
 *   the storms    on a stormy week one cyclone: a spiral wound out of the sky
 *                 by its own wind, its bands curling into a dense white head
 *                 round a small dark eye and fraying as they run out, and on a
 *                 cooler week's low a long front trailing out of it, so it
 *                 reads as a comma
 *   the fronts    long bands of weather along the week's own lines, broken into
 *                 their own stretches, and the latitudes' own climate under them
 *                 (the equator's convection on a hot week, the storm tracks, the
 *                 clear subtropical highs between)
 *   the cumulus   a hot week's masses heaped out of round towers, with the
 *                 puffs they boil up out of clustered round them; and over a
 *                 cold sea, rows of puffs combed out along the wind into streets
 *   the cirrus    a few patches of fine strands combed along the wind, bent on
 *                 its long waves and wound round a storm's own outflow
 *   the light     the masses are gouache white over the painting, cut hard at
 *                 the edge with the pigment pooled in a dried rim, a translucent
 *                 grey-blue where they thin and cool glazes where they turn from
 *                 the light; under a real sun (light.terminator) the night
 *                 side's weather sinks into the dark, and only the edges still
 *                 facing the sun past the ground's terminator keep a warm rim
 *   the ground    every mass casts its shadow on the ground under it, offset
 *                 down-sun by the height the weather stands at: a tight drop
 *                 shadow under a high sun, long ones toward the terminator
 *
 * Everything the sheet is drawn from is the week's own reading:
 *   sweat (litres)  → how much of the poster's face is clouded: from a dry
 *                     week's 14% to a very wet one's 40%, and *measured*, not
 *                     assumed: solveThreshold() draws the week's own field over
 *                     the face the poster shows and solves the threshold that
 *                     leaves exactly that share of it clouded
 *   warmth          → what kind: hot weeks raise cumulus over the land and
 *                     convection along the equator, cold weeks run their masses
 *                     out in long east-west bands and comb their seas into streets
 *   hard share      → the storms: a week with real time above threshold winds
 *                     one cyclone up; a hot, very wet week breeds its own
 *                     hurricane
 *   the race route  → the weather over it is drawn pale, so the line keeps its
 *                     colour and no bank of cloud is ever cut off by a corridor
 *   a lava world    → no weather at all, but ash: a plume from every vent the
 *                     week's hard sessions opened, carried downwind and lit from
 *                     under by the melt
 * The other bodies (a giant's deck, an ice giant, a star, the marble, the hole)
 * draw their own sky or have none, and get no sheet.
 *
 * The storms are stood where the poster can see them: on the first frame the
 * sheet is drawn, from the eye the poster is looked from and the light it is
 * painted with (as ink-space.js hangs its sky), and never moved after. Nothing
 * is random at runtime: every number comes from features.makeRng and the eye,
 * and the drift is uTime × the week's own cloudRate, which is exactly 0 at the
 * default dials — so a capture is the same picture every time it is taken.
 *
 * motion.living adds the sheet's own clock (see LIVE_TURN and LIVE_EVOLVE): the
 * weather turns slowly round the pole, the equator leading the poles by a
 * bounded lean (LIVE_SHEAR_T), thickens and thins at the scale of its own
 * systems, and the cumulus boils as it rides with its masses. Everything a mass
 * is painted with — its broken edge, its lumps, its puffs — rides with it, so
 * nothing slides through it; a lava world's plumes stay on their vents. All of
 * it is read off uTime alone and multiplied by the dial.
 *
 * Hidden on the surface (the ground already wears its own sky), and drawn
 * before the week's own marks: the race line, the ground's pools and the
 * figure are never buried under weather.
 */
import { P } from './params.js';
import { ventSessions } from './bodies/lava-crust.js';
import { crowned } from './bodies/star.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// a smoothstep on the CPU, for the week's readings
const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
// A JS number as a GLSL float literal. A whole number written bare (`19`) is an
// int in GLSL, and `vec3 * int` does not compile.
const gl = (v) => (Number.isInteger(v) ? `${v}.0` : `${v}`);

// The bodies that draw their own sky, or keep none: no sheet over them (the race
// week's crowned world, bodies/star.js crowned(), keeps a rock world's sheet).
const NO_WEATHER = new Set(['giant', 'ice', 'star', 'marble', 'blackhole']);

// The sheet's own height over the globe: clear of the orbit relief cap, so a
// mountain can never poke through it.
const SHEET_LIFT = 2;
// … but the weather is painted on a sphere this far over the sea, read along
// the eye's own ray (see CLOUD_FRAG): low enough that a cloud stands over the
// ground it is seen against, out to the limb.
const CLOUD_LOW = 3;
// How far above the ground the shadow's own skin rides. It follows the terrain
// vertex for vertex (see buildShadowShell), so this only has to clear the
// difference between the survey the shell was built from and the painted mesh.
const SHADOW_LIFT = 1.1;
// The drop shadow: each patch of ground takes the shadow of the weather a step
// toward the light from it (SHADOW_HEIGHT, in radians of the globe, longer
// toward the terminator), so every mass's shadow lies a step down-light of it,
// toward the night side: enough to stand the weather off the ground, and a
// glaze, never a second cloud.
const SHADOW_HEIGHT = 0.030;
const SHADOW_STRENGTH = 0.42;
// The optical depth: past its cut a mass is a translucent grey-blue wash the
// land reads through (ALPHA_THIN) for a few pixels, and thick this far in.
const TAU_FULL = 0.04;
const ALPHA_THIN = 0.70;
// sky.cloudDepth: the optical depth read further in (TAU_FULL × 1 + DEPTH_TAU),
// the thin edge's own cover where it was laid wet and where it dried hard, and
// how far into the field a wet edge thins into the air (CLOUD_SOFT)
const DEPTH_TAU = 1.4;
const DEPTH_THIN_WET = 0.30;
const DEPTH_THIN_HARD = 0.85;
const CLOUD_SOFT = 0.014;
// The mass's form: white, with two cool glazes laid over it where it turns from
// the light or thins (GLAZE1) and in the hollows of that (GLAZE2), both broken
// by the lumps the cloud is heaped in (BILLOW, at BILLOW_FREQ to the radian).
const GLAZE1 = 0.26;
const GLAZE2 = 0.75;
const BILLOW = 0.45;
const BILLOW_FREQ = 16.0;
// The dried rims: how many pixels in from its cut a mass holds the pigment it
// pooled, how dark that is on its shade side and on its lit side, and how dark
// along each glaze's own edge.
const RIM_PX = 1.8;
const RIM_SHADE = 0.80;
const RIM_LIT = 0.25;
const GLAZE_RIM = 0.45;
// The masses' own relief: how far toward the light the slope is read, and how
// hard a difference in the field turns into light and shade.
const SHADE_STEP = 0.05;
const RELIEF_K = 8.0;
// The white the weather is laid in: the paper lifted toward pure light, so a
// cloud is the brightest thing on the globe and never the reserved paper of a
// dry plain beside it.
const CLOUD_WHITE = 0.78;
// The sheet's night: the palette's cool carried toward its ink, one small step
// above the ground's own night (ink.js inkNight), so weather in the dark reads
// as weather and never as a glow — and laid thinner, so it sinks into the night.
const NIGHT_MIX = 0.30;
const NIGHT_LIFT = 0.03;
const NIGHT_KEEP = 0.55;
// The tops still in the sun past the ground's terminator: how far into the
// night (in the light's own elevation) they hold it.
const RIM_REACH = 0.16;
// The week's fronts: one long band of weather, and on a cold week a second one
// crossing it, each broken into its own stretches by a coarse tap and
// meandering on the sky's own flow (FRONT_MEANDER), never a ruled line.
const FRONT_AMP = 0.15;
const FRONT_W = 0.16;
const FRONT_K = 1 / (FRONT_W * FRONT_W);
const FRONT_FREQ = 0.85;
const FRONT_SEG_LO = 0.32;
const FRONT_SEG_HI = 0.54;
const FRONT_COLD = 0.30;
const FRONT_TILT = 0.15;
const FRONT_MEANDER = 0.6;
// The latitudes' own climate: how much density the storm tracks and the
// equator's convection add and the subtropical highs take away.
const CLIMATE = 0.11;
// The edge's own break, in the field's units: two scales, because one
// value-noise lattice broken on its own line reads as a polygon. Small: the cut
// is a painted edge, wandering a little, never a fringe of specks.
const RAG = 0.022;
const RAG_FREQ = 38.0;
const RAG_FINE = 2.7;
const RAG_FINE_AMP = 0.3;
// The cloud's own grain at the scale of its edge, over the whole sheet, the
// storms' bands included: a torn edge and the small loose clouds a big one
// sheds, never a slab cut on a smooth line.
const DETAIL = 0.045;
const DETAIL_FREQ = 15.0;
// The samples the week's threshold is solved from (see solveThreshold).
const CAL_SAMPLES = 3072;

// -- the week's cover ----------------------------------------------------------
const COVER_DRY = 0.14;   // the share of the poster's face a dry week keeps clouded …
const COVER_WET = 0.40;   // … and a very wet one: never more, so the land is always read
// The dial's own near-nothing end: what the free sky is left at as `presence`
// falls, so the layer can be faded out without its last masses lingering.
const COVER_EDGE = 0.03;
// how much of its paper the weather over the race route gives up
const THIN_PALE = 0.50;
const BAND_HOT = 1.0;     // hot: the sampling frame is round, so clumps stay round
const BAND_COLD = 2.6;    // cold: stretched along the meridian, so masses run as east-west bands
// how far the sky's own flow carries the field (see icFlow): a cold week's
// weather is drawn further along its wind
const WARP_HOT = 2.4;
const WARP_COLD = 3.2;
const FREQ_LO = 1.60;     // a dry week: broad systems
const FREQ_HI = 2.70;     // a very wet one: more, smaller ones
const FREQ_COLD_K = 0.92;

// -- the storms ------------------------------------------------------------------
// One storm a stormy week. A hurricane (a hot week's): compact, a clear eye in a
// dense heart. A cyclone (any other week's): broader, its front trailing. The
// eye is in the storm's own radii.
const STORM_TROPIC = { radius: 0.15, wind: 8.0, eye: 0.14, arms: 1.0, tail: 0, lat: [0.20, 0.38] };
const STORM_MID = { radius: 0.21, wind: 5.6, eye: 0.12, arms: 1.0, tail: 0.40, lat: [0.55, 0.80] };
// how hard the bands are wound: two arms on a log spiral, so two or three bands
// cross any radius (near a real storm's twenty-degree pitch)
const STORM_WOUND = 5.0;
const STORM_CANDIDATES = 40;
// how far a storm quietens the rest of the weather round it (see icStorms)
const STORM_CALM = 0.6;
const STORM_FLOOR = 0.35;  // … and the density it leaves the quietened sky at, below any week's threshold
// Fair-weather cumulus: separate puffs on a jittered lattice of CU_FREQ cells to
// the radian (three to seven pixels across on a shelf's globe), and how far
// round a mass (in the field's units below its cut) the puffs it boils up out
// of reach. Every mass is also broken at PUFF_FREQ — a hot week's into
// separate clusters with the land between them.
const CU_FREQ = 14.0;
const CU_NEAR = 0.05;
const PUFF_FREQ = 7.5;
// Cloud streets: small puffs on a lattice of STREET_FREQ cells to the radian,
// kept only where they fall on the rows the wind combs out along the latitudes.
const STREET_FREQ = 18.0;
// A hot week's towers: the masses are heaped out of round heads HEAD_FREQ to the
// radian, HEADS deep in the field's units, laid only near the break.
const HEADS = 0.15;
const HEAD_FREQ = 7.0;
// The high veils: strands to the radian, and how much of the sheet's white
// they carry.
const CIRRUS_FREQ = 14.0;
const CIRRUS_A = 0.85;

// The wander that breaks the sheet's two long lines — its night side and its
// edge at the limb.
const WANDER_COARSE = 5.5;
const WANDER_FINE = 19.0;
const LIMB_FINE = 57.0;
const NIGHT_BREAK = 0.055;
// How far outside the world's own edge the wash still carries, and how far the
// noise may bite into it, both in world units of radius.
const LIMB_FALL = 0.12;
const LIMB_BITE = 0.15;
// motion.living: the sheet's own clock (see icTurned and icField).
const LIVE_TURN = 0.014;     // radians a second the weather's own turn adds
const LIVE_SHEAR = 0.45;     // … and how much faster its equatorial band runs
const LIVE_SHEAR_T = 45;     // … for a while: its lead swings back over this many seconds (× 2π), so the bands lean and
                             // ease and never wind up, and no mass is ever drawn through the one beside it
const LIVE_EVOLVE = 0.055;   // density the weather thickens and thins by
const LIVE_EVO_FREQ = 0.62;  // the scale it does that at: broad systems, not cells
const LIVE_EVO_RATE = 0.070; // and how fast that field creeps, in its own units
const LIVE_EVO_RAMP = 0.03;  // how fast the thickening comes up, in units a second
const LIVE_BOIL = 0.05;      // how fast the cumulus boils in place
const LIVE_SPIN = 0.008;     // radians a second a storm's bands turn

// From close in. A poster's weather is read from three hundred units off; seen
// from a camera coming down through it the same masses are flat white walls,
// cut on lines and glazed in blotches the frame is far too close to read. Over
// the camera's height above the sheet from CLOSE_FAR down to CLOSE_NEAR
// (uClose, 0 → 1) the weather is drawn as clouds seen from near: the cover thins
// to the free sky's own break (CLOSE_THIN of the way, on the square of uClose)
// and CLOSE_PAST beyond it, so only the weather's densest heads are left as the
// eye comes down; every mass breaks into the billows it is heaped of — three
// octaves finer than the poster's grain (CLOSE_F1 … CLOSE_F3, CLOSE_D1 …
// CLOSE_D3 deep in the field's units) — and is modelled by the light on the
// broadest of them (CLOSE_RELIEF); its edge is soft over CLOSE_SOFT of the
// field instead of cut at the pixel, with no dried rim; and it is translucent:
// its thin parts a veil (CLOSE_THIN_A) and even its cores letting the ground
// through (CLOSE_CORE_A). The fair-weather puffs and a hot week's tower heads,
// discs at this range, give way to the billows. From the poster's distance
// uClose is 0 and the sheet is the one it always was.
const CLOSE_FAR = 220;
const CLOSE_NEAR = 20;
const CLOSE_THIN = 1.0;
const CLOSE_F1 = 46.0;
const CLOSE_F2 = 107.0;
const CLOSE_F3 = 241.0;
const CLOSE_D1 = 0.10;
const CLOSE_D2 = 0.045;
const CLOSE_D3 = 0.012;
const CLOSE_PAST = 0.04;
const CLOSE_RELIEF = 45.0;
const CLOSE_SOFT = 0.025;
const CLOSE_TAU = 0.10;
const CLOSE_THIN_A = 0.28;
const CLOSE_CORE_A = 0.75;

/* ------------------------------------------------------------------ shaders */

// The field's hash, noise and fbm. The same functions are written again in JS
// below (see "the field, twice"); they are one formula living in two languages
// and they move together.
const NOISE_GLSL = /* glsl */ `
float icHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float icNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = icHash(i);
  float n100 = icHash(i + vec3(1.0, 0.0, 0.0));
  float n010 = icHash(i + vec3(0.0, 1.0, 0.0));
  float n110 = icHash(i + vec3(1.0, 1.0, 0.0));
  float n001 = icHash(i + vec3(0.0, 0.0, 1.0));
  float n101 = icHash(i + vec3(1.0, 0.0, 1.0));
  float n011 = icHash(i + vec3(0.0, 1.0, 1.0));
  float n111 = icHash(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z);
}
float icFbm(vec3 p) {
  float sum = 0.0, amp = 0.5, norm = 0.0;
  for (int i = 0; i < 3; i++) {
    sum += amp * icNoise(p);
    norm += amp;
    amp *= 0.5;
    p = p * 2.07 + vec3(13.7, 5.3, 9.1);
  }
  return sum / norm;
}
float icFbm2(vec3 p) {
  float sum = 0.0, amp = 0.5, norm = 0.0;
  for (int i = 0; i < 2; i++) {
    sum += amp * icNoise(p);
    norm += amp;
    amp *= 0.5;
    p = p * 2.07 + vec3(13.7, 5.3, 9.1);
  }
  return sum / norm;
}
vec3 icWound(vec3 v, vec3 axis, float turn) {
  float c = cos(turn), s = sin(turn);
  return v * c + cross(axis, v) * s + axis * (dot(axis, v) * (1.0 - c));
}
`;

// The week's weather, as one field. Read by the sheet and by the shadow on the
// ground, so both break on the same line.
const FIELD_GLSL = /* glsl */ `
uniform vec3 uSunDir;        // the light the globe itself is painted with
uniform float uTime;
uniform float uRate;         // radians of drift a second; 0 at the default dials
uniform float uLive;         // motion.living: 0 leaves the sheet exactly still
uniform vec3 uOffE;          // where the weather's own thickening is read from
uniform float uPresence;     // the dial × the surface handoff
uniform float uClose;        // how near the camera has come (see CLOSE_FAR): 0 from the poster
uniform float uDetail;       // feature LOD (base.js): 1 models the masses and casts their shadow, 0 does neither
uniform float uThr;          // the threshold the week's own cover was solved for
uniform float uThrHi;        // … and the one its free sky breaks at
uniform float uBand;         // how far the masses are drawn out along the meridian
uniform float uFreq;
uniform float uWarp;
uniform float uRag;
uniform float uRagFreq;
uniform float uHot;          // the week's heat: the equator's convection
uniform float uStreets;      // streets over the sea
uniform float uCirrus;       // the high veils
uniform float uAsh;          // a lava world: ash from its vents instead of weather
uniform float uThinK;        // 0 on a week with no race
uniform float uThinC;
uniform float uThinC2;
uniform float uMonK;
uniform float uMonC;
uniform float uMonC2;
uniform vec3 uFrontA1;
uniform vec3 uFrontA2;
uniform vec3 uOffF;
uniform float uFrontC1;
uniform float uFrontC2;
uniform float uFrontAmp1;
uniform float uFrontAmp2;
uniform vec3 uOff;
uniform vec3 uOffW;
uniform vec3 uOffR;
uniform vec3 uOffR2;
uniform vec3 uOffA;
uniform vec3 uOffB;
uniform vec3 uOffC;
uniform vec3 uOffS;
uniform vec3 uThinP[8];
uniform vec3 uMonDir;
// the storms: centre and wind (radians of turn at the eye, its sign the sense
// it turns in; 0 is no storm), then radius, eye (in its own radii), weight and
// trailing front, and the bearing the front trails along
uniform vec4 uStorm[3];
uniform vec4 uStormK[3];
uniform vec3 uStormT[3];
// a lava world's vents: direction, and how hard each burns (0: none)
uniform vec4 uVent[8];
uniform sampler2D tLand;
uniform float uR;
uniform float uCap;
uniform float uSeaLevel;
uniform vec3 uEye;          // the eye the sheet was stood from (unit): the lean its light and shadow are read with
varying vec3 vDir;
varying vec3 vNrm;
varying vec3 vView;
varying vec3 vPos;

vec2 icChart(vec3 d) {
  return vec2(0.5 + atan(d.z, d.x) * 0.15915494, 0.5 - asin(clamp(d.y, -1.0, 1.0)) * 0.31830989);
}

// Is this point of the sheet over ground the painter can see? The ray's own
// distance from the world's centre against the ground's radius where the ray
// passes closest, read off the survey, so the wash dies exactly where the world
// does, on whatever relief the world has there.
float icOver(float clear) {
  vec3 ray = normalize(vPos - cameraPosition);
  vec3 foot = cameraPosition - ray * dot(cameraPosition, ray);
  float r = length(foot);
  vec3 dir = foot / max(1e-4, r);
  float h = texture2D(tLand, icChart(dir)).r;
  return uR + max(min(h, uCap), uSeaLevel) + clear - r;
}

// How much of the sheet has been drawn pale over the race route — one line and
// one clearing, so the mark painted on the ground is never buried.
float icThin(vec3 dir) {
  float thin = 0.0;
  if (uThinK > 0.0) {
    float rag = 0.05 * (icNoise(dir * 11.0 + uOffR) - 0.5);
    for (int i = 0; i < 8; i++) {
      thin = max(thin, smoothstep(uThinC + rag, uThinC2 + rag, dot(dir, uThinP[i])));
    }
    thin *= uThinK;
  }
  return max(thin, smoothstep(uMonC, uMonC2, dot(dir, uMonDir)) * uMonK);
}

// The turn the week's sky is read through at this moment: the drift, and with
// motion.living the weather's own slow turn round the pole, faster at the
// equator so its bands shear rather than spin whole — a lead that grows as the
// clock starts and swings back again (LIVE_SHEAR_T), so however long the eye
// stays the bands never wind up into streaks and no mass slides through its
// neighbour.
vec3 icTurned(vec3 dir) {
  float turn = uTime * uRate;
  if (uLive > 0.0) {
    float lead = ${gl(LIVE_SHEAR_T)} * sin(uTime / ${gl(LIVE_SHEAR_T)});
    turn += uLive * ${gl(LIVE_TURN)} * (uTime + ${gl(LIVE_SHEAR)} * (1.0 - dir.y * dir.y) * lead);
  }
  float ct = cos(turn), st = sin(turn);
  return vec3(dir.x * ct - dir.z * st, dir.y, dir.x * st + dir.z * ct);
}

// The storms' own winds: each turns the sky about its centre, hardest at the
// eye and gone a few radii out, so whatever weather drifts into it is wound
// into its spiral.
vec3 icWinds(vec3 q) {
  for (int i = 0; i < 3; i++) {
    vec4 s = uStorm[i];
    if (s.w != 0.0) {
      float cd = dot(q, s.xyz);
      if (cd > 0.2) {
        float ang = acos(min(cd, 1.0));
        q = icWound(q, s.xyz, s.w * exp(-ang / uStormK[i].x));
      }
    }
  }
  return q;
}

// What the storms draw of their own: the dense heart, two bands spiralling in
// on the sense their wind turns, a clear eye in a hurricane's, and a cyclone's
// front trailing out of it — read in the wound sky, so the front curls into
// the storm and the whole reads as one comma. It is a shape and not a density:
// positive is cloud, whatever cover the rest of the week's sky was solved to,
// so a dry week's storm is the same storm as a wet week's. The calm it hands
// back is how far a storm owns the sky round it: the rest of the weather is
// quietened there, so the storm stands in its own clear air.
float icStorms(vec3 q, vec3 w, out float calm) {
  float shape = -1.0;
  calm = 0.0;
  for (int i = 0; i < 3; i++) {
    vec4 s = uStorm[i];
    if (s.w == 0.0) continue;
    vec4 k = uStormK[i];
    vec3 t = uStormT[i];
    vec3 b = cross(s.xyz, t);
    float cd = dot(q, s.xyz);
    if (cd > 0.4) {
      float ang = acos(min(cd, 1.0));
      // the storm's own polar frame: how far out, in its own radii, and the bearing
      float rho = ang / k.x;
      float lr = log(max(rho, 0.02));
      float phi = atan(dot(q, b), dot(q, t));
      float sgn = s.w > 0.0 ? -1.0 : 1.0;
      float spin = uLive > 0.0 ? uTime * uLive * ${gl(LIVE_SPIN)} * sgn : 0.0;
      // two arms wound in on the sense the wind turns, wobbling as cloud does
      float psi = 2.0 * (phi + spin) + sgn * ${gl(STORM_WOUND)} * lr + 1.3 * (icNoise(q * 8.0 + uOffS) - 0.5);
      // each band is broad where it leaves the head and runs out to a thread,
      // swelling and pinching as it goes, and outside the head it comes in
      // unequal lengths with open sea between them
      float run = smoothstep(0.45, 2.3, rho);
      float gn = icNoise(vec3(cos(phi) * 3.2, sin(phi) * 3.2, sgn * 3.0 * lr) + uOffS.zxy);
      float groups = mix(1.0, smoothstep(0.34, 0.60, gn), smoothstep(0.35, 0.75, rho));
      float band = smoothstep(mix(-0.25, 0.60, run) + 0.30 * (0.5 - gn), 1.0, cos(psi));
      float env = smoothstep(0.08, 0.30, rho) * exp(-0.9 * max(rho - 0.30, 0.0));
      // the dense head round the eye, thin enough that the lanes between the
      // bands show through it as they wind in, and the cloud's own grain,
      // which frays the bands as they thin
      float heart = exp(-(rho * rho) / 0.16);
      float tex = icFbm2(q * 18.0 + uOffS.yzx) - 0.5;
      float head = k.z * (0.16 * heart + 0.21 * band * groups * env)
                 + (0.07 + 0.10 * run) * tex - 0.03 - 0.045 * run;
      // and a small clear eye: a hurricane's own, or a low's centre
      head -= 0.6 * (1.0 - smoothstep(0.6 * k.y, k.y, rho));
      shape = max(shape, head);
      calm = max(calm, exp(-(rho * rho) / 5.0));
    }
    if (k.w > 0.0) {
      float along = atan(dot(w, t), dot(w, s.xyz));
      // the front leaves the storm dense and comes apart as it runs out:
      // narrower, thinner and broken on a finer grain the further it goes,
      // until only small fragments are left; it wanders across its own line
      // and is broken cloud all the way down, never a ribbon
      float out1 = smoothstep(0.05, 0.85, along);
      float off = dot(w, b) + 0.035 * (icNoise(vec3(along * 6.0, 1.3, 2.1) + uOffS) - 0.5);
      float wd = (0.045 - 0.032 * out1) * (0.6 + 0.8 * icNoise(vec3(along * 3.5, 5.1, 0.7) + uOffS.yzx));
      float run = smoothstep(-0.05, 0.10, along) * (1.0 - smoothstep(0.55, 0.95, along));
      float frag = smoothstep(0.38 + 0.12 * out1, 0.58 + 0.12 * out1, icFbm2(w * (13.0 + 14.0 * out1) + uOffS.zxy));
      shape = max(shape, k.w * 0.36 * (1.0 - 0.45 * out1) * exp(-(off * off) / (wd * wd)) * run * (0.20 + 0.95 * frag) - 0.06);
    }
  }
  return shape;
}

// The week's fronts: the density a long band of weather adds along the week's
// own lines, broken into its own stretches, read in the wound sky — the
// stretches in the turned one (q), so a front's breaks ride with it rather
// than letting it in and out as it goes by.
float icFront(vec3 q, vec3 w, vec3 fl) {
  float d1 = dot(w, uFrontA1) - uFrontC1 + ${gl(FRONT_MEANDER)} * fl.x;
  float d2 = dot(w, uFrontA2) - uFrontC2 + ${gl(FRONT_MEANDER)} * fl.y;
  float ridge = uFrontAmp1 * exp(-d1 * d1 * ${gl(FRONT_K)})
              + uFrontAmp2 * exp(-d2 * d2 * ${gl(FRONT_K)});
  float seg = smoothstep(${gl(FRONT_SEG_LO)}, ${gl(FRONT_SEG_HI)},
    icNoise(q * ${gl(FRONT_FREQ)} + uOffF));
  return ridge * seg;
}

// The latitudes' own weather: the equator's convection on a hot week, the
// storm tracks of the middle latitudes, and the clear subtropical highs.
float icClimate(vec3 q) {
  float y = q.y;
  float ay = abs(y);
  float itcz = exp(-(y * y) / 0.0144);
  float track = exp(-((ay - 0.74) * (ay - 0.74)) / 0.030);
  float high = exp(-((ay - 0.45) * (ay - 0.45)) / 0.016);
  return ${gl(CLIMATE)} * (0.9 * uHot * itcz + 0.6 * track - 0.8 * high);
}

// A hot week's convection: its masses are heaped out of round towers, one on
// each cell of a jittered lattice (the jitter kept inside the cell, so the
// eight round a point hold its nearest), and a hot sky comes in clusters of
// heads, never as one slab: 1 at a head's own centre, 0 between them.
float icHeads(vec3 p) {
  vec3 i0 = floor(p - 0.5);
  float f1 = 1.0;
  for (int x = 0; x < 2; x++) {
    for (int y = 0; y < 2; y++) {
      for (int z = 0; z < 2; z++) {
        vec3 c = i0 + vec3(float(x), float(y), float(z));
        vec3 dv = p - c - 0.15 - 0.70 * vec3(icHash(c + 5.17), icHash(c + 23.9), icHash(c + 61.3));
        // every tower its own size
        float s = 0.65 + 0.5 * icHash(c + 9.7);
        f1 = min(f1, dot(dv, dv) / (s * s));
      }
    }
  }
  return 1.0 - smoothstep(0.0, 0.11, f1);
}

// Fair-weather puffs: separate discs on a jittered lattice, each kept or left
// out by its own lot against how thick the field of them is there (k), the
// larger ones where it is thickest. Each lattice cell holds one puff kept well
// inside it, so the eight cells round a point are every puff that can cover
// it. Returns the cover and how much of it is the puff's own grey underside,
// the half turned from the light.
vec2 icPuffs(vec3 p, float k, vec3 toward, float aa) {
  vec3 i0 = floor(p - 0.5);
  // every puff is lumped, never a coin; a thin field keeps none and a thick one
  // never more than about half its cells, so puffs come in clusters of their
  // own, never as a spray of single dots or a sheet
  float lump = 0.11 * (icNoise(p * 2.9) - 0.5);
  float keep = 0.6 * smoothstep(0.25, 1.0, k);
  vec2 best = vec2(0.0);
  for (int x = 0; x < 2; x++) {
    for (int y = 0; y < 2; y++) {
      for (int z = 0; z < 2; z++) {
        vec3 c = i0 + vec3(float(x), float(y), float(z));
        if (icHash(c + 7.13) > keep) continue;
        vec3 dv = p - c - 0.15 - 0.70 * vec3(icHash(c), icHash(c + 17.31), icHash(c + 41.7));
        float rad = (0.12 + 0.10 * k) * (0.80 + 0.45 * icHash(c + 3.9));
        float cov = 1.0 - smoothstep(rad - aa, rad + aa, length(dv) + lump);
        if (cov > best.x) best = vec2(cov, smoothstep(-0.15, 0.60, -dot(dv, toward) / rad));
      }
    }
  }
  return best;
}

// Cloud streets: small puffs on a jittered lattice, each kept only where its
// centre falls on one of the rows the wind combs out along the latitudes (one
// every two cells), so they stand in lines of separate puffs.
vec2 icStreets(vec3 p, float k, vec3 toward, float aa) {
  vec3 i0 = floor(p - 0.5);
  vec2 best = vec2(0.0);
  for (int x = 0; x < 2; x++) {
    for (int y = 0; y < 2; y++) {
      for (int z = 0; z < 2; z++) {
        vec3 c = i0 + vec3(float(x), float(y), float(z));
        vec3 cp = c + 0.15 + 0.70 * vec3(icHash(c), icHash(c + 17.31), icHash(c + 41.7));
        if (abs(fract(cp.y * 0.5 + 0.5) - 0.5) > 0.14 || icHash(c + 7.13) > k) continue;
        vec3 dv = p - cp;
        float rad = 0.20 + 0.08 * icHash(c + 3.9);
        float cov = 1.0 - smoothstep(rad - aa, rad + aa, length(dv));
        if (cov > best.x) best = vec2(cov, smoothstep(-0.15, 0.60, -dot(dv, toward) / rad));
      }
    }
  }
  return best;
}

// Fair-weather cumulus: on a hot week, round every mass the puffs it is boiling
// up out of, thickest at its edge and thinning away from it (near: how close
// the masses are), so they come clustered round their cores and never as a
// spray over open ground; over a cold sea, rows of them combed out along the
// wind into streets. A hot week's puffs boil as they ride with the masses they
// boil out of — laid in the sky's own turn (w), so a puff is never let in and
// out as a mass goes by. pxR is a pixel in radians of the globe.
vec2 icCumulus(vec3 d, vec3 w, vec3 toward, float near, float pxR) {
  float heap = near * uHot;
  float street = 0.0;
  if (uStreets > 0.0) {
    float h = texture2D(tLand, icChart(d)).r;
    street = (1.0 - smoothstep(-2.0, 0.0, h)) * smoothstep(0.55, 0.75, icNoise(w * 2.2 + uOffC.zyx)) * uStreets;
  }
  if (max(heap, street) <= 0.03) return vec2(0.0);
  if (street > heap) return icStreets(w * ${gl(STREET_FREQ)} + uOffC, street, toward, 0.6 * pxR * ${gl(STREET_FREQ)});
  float boil = uLive > 0.0 ? uTime * uLive * ${gl(LIVE_BOIL)} : 0.0;
  return icPuffs(w * ${gl(CU_FREQ)} + uOffC + boil * vec3(0.6, -0.4, 0.8), heap, toward, 0.6 * pxR * ${gl(CU_FREQ)});
}

// The high veils: two or three small patches of narrow strands combed along the
// jet and bent hard on its long waves, never ruled: their spacing wanders, and
// each strand is broken into short lengths of its own, swelling in the middle
// of each and cut at the pixel, wound round a storm with everything else.
float icCirrus(vec3 w, float pxR) {
  if (uCirrus <= 0.0) return 0.0;
  float where = smoothstep(0.62, 0.80, icNoise(w * 3.0 + uOffB.zxy));
  if (where <= 0.0) return 0.0;
  float v = (w.y + 0.11 * dot(w, uFrontA2) + 0.55 * (icFbm2(w * 1.8 + uOffA.zxy) - 0.5)) * ${gl(CIRRUS_FREQ)}
          + 0.45 * (icNoise(w * 5.0 + uOffB) - 0.5);
  float strand = floor(v);
  float len = icNoise(w * 9.0 + vec3(0.0, strand * 7.31, 0.0) + uOffB.yzx);
  float wd = 0.05 + 0.13 * smoothstep(0.50, 0.82, len);
  float aa = 0.7 * pxR * ${gl(CIRRUS_FREQ)};
  float line = 1.0 - smoothstep(wd - aa, wd + aa, abs(fract(v) - 0.5));
  float fibre = 0.75 + 0.25 * icNoise(vec3(w.x * 40.0, v * 3.0, w.z * 40.0) + uOffA);
  return line * smoothstep(0.52, 0.70, len) * fibre * where * uCirrus;
}

// A lava world's ash: from every vent a plume carried downwind (east in the
// westerlies, west under the trades), widening as it goes, billowing, and
// thinning out where the wind has spread it. The plume stands on its vent, on
// the ground (d); only its billows ride the sky's turn (q), so a plume streams
// from where it rises and never drifts off it.
float icAsh(vec3 d, vec3 q) {
  float a = 0.0;
  for (int i = 0; i < 8; i++) {
    vec4 v = uVent[i];
    if (v.w <= 0.0) continue;
    float cd = dot(d, v.xyz);
    if (cd < 0.55) continue;
    vec3 east = cross(vec3(0.0, 1.0, 0.0), v.xyz);
    east = length(east) > 1e-4 ? normalize(east) : vec3(1.0, 0.0, 0.0);
    vec3 wind = east * mix(1.0, -1.0, 1.0 - smoothstep(0.30, 0.50, abs(v.y)));
    vec3 across = cross(v.xyz, wind);
    vec3 lv = d - v.xyz * cd;
    float s = dot(lv, wind);
    float len = 0.42 + 0.50 * v.w;
    float t = dot(lv, across) + 0.45 * max(s, 0.0) * (icNoise(vec3(s * 3.0, float(i) * 3.7, 1.0) + uOffS) - 0.5);
    float wid = 0.012 + 0.13 * clamp(s, 0.0, len);
    float body = exp(-(t * t) / (wid * wid)) * smoothstep(-0.015, 0.01, s) * (1.0 - smoothstep(0.45 * len, len, s));
    float puff = icNoise(q * 22.0 + uOffC + vec3(-9.0 * s, 0.0, 0.0)) * 0.6 + icNoise(q * 51.0 + uOffC.yzx) * 0.4;
    a = max(a, body * (0.30 + 0.95 * puff) * (0.7 + 0.3 * v.w));
  }
  return a;
}

// The sky's own flow: the field is read through a warp of itself, so its
// masses come out marbled and drawn along the wind — the way weather is — and
// never as blobs.
vec3 icFlow(vec3 p) {
  return vec3(icFbm2(p + uOffW), icFbm2(p + uOffW.yzx + 5.2), icFbm2(p + uOffW.zxy + 1.7)) - 0.5;
}

// The weather's density at a direction, and the threshold it breaks at there,
// the wound sky it was read in and its flow. Every mass is broken into puffs,
// a hot week's hardest of all.
float icField(vec3 dir, out float thr, out vec3 w, out vec3 fl) {
  vec3 q = icTurned(dir);
  w = icWinds(q);
  float dens;
  float storm = -1.0;
  if (uAsh > 0.5) {
    fl = vec3(0.0);
    dens = icAsh(dir, q) + 0.35 * (icFbm2(q * 2.6 + uOff) - 0.5);
  } else {
    vec3 p = vec3(1.0, uBand, 1.0) * w * uFreq;
    fl = icFlow(p);
    float calm;
    storm = icStorms(q, w, calm);
    // the storm owns the sky round it: the week's own weather, its fronts and
    // its climate are all quietened there
    dens = (icFbm(p + uWarp * fl + uOff) + icFront(q, w, fl) + icClimate(q)) * (1.0 - ${gl(STORM_CALM)} * calm)
         + ${gl(STORM_FLOOR * STORM_CALM)} * calm + (0.03 + 0.11 * uHot) * (icNoise(w * ${gl(PUFF_FREQ)} + uOffC.zxy) - 0.5);
    // a hot week's masses heaped out of round heads: only where the weather is
    // already near its break, so a mass is lobed and sheds its own puffs, but
    // no head stands alone in clear sky. From close in a head is a disc on its
    // own (the cover thins past the break it was laid at), and the billows
    // heap the masses instead (see CLOSE_FAR).
    if (uHot > 0.0) dens += uHot * ${gl(HEADS)} * (icHeads(w * ${gl(HEAD_FREQ)} + uOffC.yzx) - 0.5) * smoothstep(uThr - 0.05, uThr + 0.02, dens) * (1.0 - smoothstep(0.0, 0.35, uClose));
  }
  // motion.living: the weather thickens and thins at the scale of its own
  // systems, centred on its own mean so the solved cover holds; taken only
  // when the dial asks for it
  if (uLive > 0.0) {
    dens += uLive * ${gl(LIVE_EVOLVE)} * min(1.0, uTime * ${gl(LIVE_EVO_RAMP)})
          * (icNoise(q * ${gl(LIVE_EVO_FREQ)} * uFreq + uOffE + uTime * ${gl(LIVE_EVO_RATE)} * vec3(1.0, -0.63, 0.81)) - 0.5);
  }
  // (the edge's own break rides the turned sky with the masses it breaks)
  float breakage = icNoise(q * uRagFreq + uOffR) - 0.5
                 + ${gl(RAG_FINE_AMP)} * (icNoise(q * (uRagFreq * ${gl(RAG_FINE)}) + uOffR2) - 0.5);
  thr = mix(uThrHi, uThr, uPresence) + uRag * breakage;
  // from close in the cover thins toward the free sky's own break and a step
  // past it, so only the weather's densest heads are left as the eye comes
  // down through it (see CLOSE_FAR)
  // (on the square of uClose: the weather is still the poster's well into a zoom)
  if (uClose > 0.0) thr = mix(thr, uThrHi + uRag * breakage, ${gl(CLOSE_THIN)} * uClose * uClose) + ${gl(CLOSE_PAST)} * uClose * uClose * uClose;
  // the storms' own shape, on the week's full threshold: it fades with the
  // rest as the sheet is lifted; and over all of it the cloud's own grain
  return max(dens, uThr + storm) + ${gl(DETAIL)} * (icNoise(w * ${gl(DETAIL_FREQ)} + uOffR.yzx) - 0.5);
}

// The same sky a step toward the light, for the masses' own relief: read
// through the flow already found here, two octaves instead of three and no
// cells — the slope of a mass, not its grain.
float icRelief(vec3 dir, vec3 fl) {
  vec3 q = icTurned(dir);
  vec3 w = icWinds(q);
  if (uAsh > 0.5) return icAsh(dir, q) + 0.35 * (icFbm2(q * 2.6 + uOff) - 0.5);
  vec3 p = vec3(1.0, uBand, 1.0) * w * uFreq;
  float calm;
  float storm = icStorms(q, w, calm);
  float dens = (icFbm2(p + uWarp * fl + uOff) + icFront(q, w, fl) + icClimate(q)) * (1.0 - ${gl(STORM_CALM)} * calm)
             + ${gl(STORM_FLOOR * STORM_CALM)} * calm + (0.03 + 0.11 * uHot) * (icNoise(w * ${gl(PUFF_FREQ)} + uOffC.zxy) - 0.5);
  if (uHot > 0.0) dens += uHot * ${gl(HEADS)} * (icHeads(w * ${gl(HEAD_FREQ)} + uOffC.yzx) - 0.5) * smoothstep(uThr - 0.05, uThr + 0.02, dens) * (1.0 - smoothstep(0.0, 0.35, uClose));
  return max(dens, uThr + storm);
}

// The billows a mass is heaped of, read from close in (see CLOSE_FAR): three
// octaves finer than the poster's grain, centred on nothing, so they break the
// mass's edge into its own lobes without moving its cover. The sheet and its
// shadow both add them, so the shadow breaks with the cloud. The broadest of
// them on its own is what the light models (icBillow): the finer two only
// fray the lobes, and modelled they would be a speckle.
float icBillow(vec3 w) {
  return ${gl(CLOSE_D1)} * (icNoise(w * ${gl(CLOSE_F1)} + uOffC.zxy) - 0.5);
}
float icClose(vec3 w) {
  return icBillow(w)
       + ${gl(CLOSE_D2)} * (icNoise(w * ${gl(CLOSE_F2)} + uOffA.zxy) - 0.5)
       + ${gl(CLOSE_D3)} * (icNoise(w * ${gl(CLOSE_F3)} + uOffB.yzx) - 0.5);
}
`;

// Both shells want the same hand: the fragment's own direction, the surface's
// normal, and which way the eye is.
const CLOUD_VERT = /* glsl */ `
varying vec3 vDir;
varying vec3 vNrm;
varying vec3 vView;
varying vec3 vPos;
void main() {
  vDir = normalize(position);
  vNrm = normalize(normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPos = wp.xyz;
  vView = cameraPosition - wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

// The sheet itself: the week's weather in gouache white over the painting, its
// masses modelled by the light, the cells and veils laid under them, the night
// side dark with its last lit tops, and a short ragged lift of the whole layer
// where the globe turns away.
const CLOUD_FRAG = /* glsl */ `
${NOISE_GLSL}
${FIELD_GLSL}
uniform vec3 uPaper;
uniform vec3 uShadeCool;
uniform vec3 uSkyWash;
uniform vec3 uInk;
uniform vec3 uLitWarm;
uniform vec3 uVerm;
uniform float uTerm, uNight;  // light.terminator, light.night: how deep the ground's night goes
uniform float uLow;           // the sphere the weather is painted on (see CLOUD_LOW)
uniform float uDepth;         // sky.cloudDepth: the mass as optical depth (see its blocks)
vec4 icLay(vec4 top, vec4 under) {
  float a = top.a + under.a * (1.0 - top.a);
  return vec4((top.rgb * top.a + under.rgb * under.a * (1.0 - top.a)) / max(a, 1e-4), a);
}
// how far into a storm's eye a direction of the turned sky is: 1 inside it
float icEye(vec3 q) {
  float e = 0.0;
  for (int i = 0; i < 3; i++) {
    if (uStorm[i].w == 0.0) continue;
    float rho = acos(min(dot(q, uStorm[i].xyz), 1.0)) / uStormK[i].x;
    e = max(e, 1.0 - smoothstep(0.55 * uStormK[i].y, uStormK[i].y, rho));
  }
  return e;
}
void main() {
  // The weather is painted on a sphere just over the sea, read along the eye's
  // own ray; this sheet, hung clear of the relief cap so no mountain pokes
  // through it, only carries it. Painted that low a cloud stands over the
  // ground it is seen against out to the limb (at the sheet's own height it
  // would sit a fifth of a radian inward there, in the night behind a
  // crescent's lit edge), and its light, its night and the shadow it casts
  // are all read off the same point of the globe.
  vec3 rd = normalize(vPos - cameraPosition);
  float rb = dot(cameraPosition, rd);
  float disc = rb * rb - dot(cameraPosition, cameraPosition) + uLow * uLow;
  vec3 dW = normalize(cameraPosition + rd * (disc > 0.0 ? -rb - sqrt(disc) : -rb));
  vec3 N = dW;
  // a pixel, in radians of the globe
  float pxR = max(length(fwidth(dW)), 1e-5);
  // the sheet's two long lines — where it turns away from the sun, and where
  // the world's own edge cuts it — are broken on the same two scales of wander
  float wander = (icNoise(dW * ${gl(WANDER_COARSE)} + uOffA) - 0.5)
               + 0.6 * (icNoise(dW * ${gl(WANDER_FINE)} + uOffB) - 0.5);
  float limb = smoothstep(0.0, ${gl(LIMB_FALL)},
    icOver(0.0) + ${gl(LIMB_BITE)} * wander + 0.10 * (icNoise(dW * ${gl(LIMB_FINE)}) - 0.5));
  if (limb < 0.01) discard;

  float thr;
  vec3 w, fl;
  float dens = icField(dW, thr, w, fl);
  // from close in, the billows a mass is heaped of (see CLOSE_FAR)
  float bil = uClose > 0.0 ? icClose(w) : 0.0;
  float d = dens + uClose * bil - thr;
  // every mass is cut at the pixel — the hard dried edge of a gouache wash —
  // and how far in from that cut a fragment is is counted in pixels; from
  // close in the edge is soft over CLOSE_SOFT of the field instead, mostly
  // inside the cut, so a cloud seen from near thins into the air at its edge.
  // (sky.cloudDepth: where the edge was laid wet, not dried — see hard below —
  // it thins into the air the same way, over CLOUD_SOFT of the field)
  float hard = smoothstep(0.28, 0.46, icNoise(w * 5.0 + uOffR.zxy));
  float fw = max(fwidth(d), 1e-5);
  float softE = ${gl(CLOUD_SOFT)} * (1.0 - hard) * uDepth;
  float body = smoothstep(-max(0.75 * fw, max(0.3 * ${gl(CLOSE_SOFT)} * uClose, 0.3 * softE)),
                          max(0.75 * fw, max(${gl(CLOSE_SOFT)} * uClose, softE)), d);
  float inPx = d / fw;

  // the light the globe is painted with, read toward the light here and
  // leaning on its bearing across the picture where the sun stands nearly
  // overhead, so every mass and every puff is modelled from the same side
  vec3 L = normalize(uSunDir);
  float sunE = dot(N, L);
  vec3 Lt = L - N * sunE;
  // (the lean is read across the picture the sheet was stood for, not the one
  // the camera has now: an orbiting eye never slides a mass's light or shadow)
  vec3 ed = uEye;
  vec3 Lp = L - ed * dot(L, ed);
  vec3 toL = Lt + 0.6 * (Lp - N * dot(Lp, N));
  float lt = length(toL);
  vec3 toLn = toL / max(lt, 1e-4);
  vec2 cuv = uAsh > 0.5 ? vec2(0.0) : icCumulus(dW, w, toLn, smoothstep(-${gl(CU_NEAR)}, -0.004, d), pxR);
  // the puffs are discs from close in: they give way to the billows early
  cuv.x *= 1.0 - smoothstep(0.0, 0.35, uClose);
  float cir = uAsh > 0.5 ? 0.0 : icCirrus(w, pxR);
  float eye = uAsh > 0.5 ? 0.0 : icEye(icTurned(dW));
  if (body < 0.004 && cuv.x < 0.004 && cir < 0.004 && eye < 0.004) discard;
  float relief = 0.0;
  if (lt > 0.03 && body > 0.004 && uDetail > 0.0) {
    float toward = icRelief(normalize(dW + toLn * ${gl(SHADE_STEP)}), fl);
    relief = clamp((dens - toward) * ${gl(RELIEF_K)}, -1.0, 1.0) * smoothstep(0.03, 0.45, lt);
    if (uDetail < 1.0) relief *= uDetail;
  }
  // from close in each billow is modelled by the light on its own scale
  float reliefB = 0.0;
  if (uClose > 0.0 && body > 0.004) {
    reliefB = clamp((icBillow(w) - icBillow(w + toLn * 0.006)) * ${gl(CLOSE_RELIEF)}, -1.0, 1.0) * uClose;
  }

  // the mass by its own depth and form. For a few pixels past its cut it is a
  // translucent grey-blue wash the land reads through; inside it is white,
  // with its form laid over the white as two cool glazes — the first where it
  // turns from the light or thins, the second in the hollows of the first —
  // each cut hard where it dried with its pigment pooled along that edge, and
  // both broken by the lumps the cloud is heaped in, so a mass reads as heaped
  // cloud and never as a slab
  float tau = smoothstep(0.0, mix(${gl(TAU_FULL)}, ${gl(CLOSE_TAU)}, uClose) * (1.0 + ${gl(DEPTH_TAU)} * uDepth), d);
  // the shade is the palette's cool, carried toward its sky and laid over the
  // white: a hot week's warm light never turns its weather to cream
  vec3 white = mix(uPaper, vec3(1.0), ${gl(CLOUD_WHITE)});
  vec3 wash = mix(white, mix(uShadeCool, uSkyWash, 0.5), 0.38);
  vec3 under = mix(white, mix(uShadeCool, uSkyWash, 0.3), 0.62);
  // a lava world's ash: smoke, a warm grey a step above the crust it drifts
  // over, darker where it rolls away from the light
  white = mix(white, mix(uLitWarm, uPaper, 0.20), uAsh);
  wash = mix(wash, mix(uLitWarm, uPaper, 0.12), uAsh);
  under = mix(under, mix(uInk, uLitWarm, 0.50), uAsh);
  // (the lumps, the lost-and-found edge and the pooled rim ride with the
  // masses, in the sky's own turn, rather than staying put as the weather goes by)
  float billow = icNoise(w * ${gl(BILLOW_FREQ)} + uOffC.yzx) * 0.65
               + icNoise(w * ${gl(BILLOW_FREQ * 2.3)} + uOffC.zxy) * 0.35 - 0.5;
  // the thickest weather — a storm's head, a tower's top — keeps its white
  // whatever side of it the light is on (sky.cloudDepth: a thin edge is a veil
  // of the white and not a band of the glaze)
  float form = 0.45 * (1.0 - smoothstep(0.15, 0.85, tau)) * (1.0 - 0.7 * uDepth)
             - relief * (1.0 - 0.6 * smoothstep(0.08, 0.20, d))
             + ${gl(BILLOW)} * billow * (1.0 - 0.7 * uClose) - reliefB;
  // lost and found: most of the form dried hard, with its pigment pooled along
  // the edge; here and there it was laid wet into wet and runs soft (hard, above)
  float fwF = max(fwidth(form), 1e-4);
  // (from close in every glaze is laid wet: a cloud seen from near has no
  // dried edges, and neither has it the rims below)
  float s1 = mix(mix(0.16, fwF, hard), 0.16, uClose);
  float g1 = smoothstep(${gl(GLAZE1)} - s1, ${gl(GLAZE1)} + s1, form);
  float g2 = smoothstep(${gl(GLAZE2)} - 0.18, ${gl(GLAZE2)} + 0.18, form);
  // ---- sky.cloudDepth. The mass is lit as a body of depth: one broad
  // half-tone laid across it off its own density's slope toward the light
  // (relief), the lit side the white and the far side the week's cool, a
  // loaded core keeping more of its white; the two glazes are laid lighter on
  // top of it, so the form is a turn of light and not a bevel
  float halfT = smoothstep(-0.1, 0.8, -relief) * mix(1.0, 0.6, smoothstep(0.08, 0.25, d));
  vec3 mass = mix(white, wash, halfT * 0.55 * uDepth);
  mass = mix(mass, wash, g1 * (1.0 - 0.6 * uDepth));
  mass = mix(mass, under, 0.75 * g2 * (1.0 - 0.3 * uDepth));
  float pool = smoothstep(0.25, 0.55, icNoise(w * 48.0 + uOffA.yzx));
  float rimG = hard * g1 * (1.0 - smoothstep(0.0, 2.2 * fwF, form - ${gl(GLAZE1)})) * (1.0 - uClose);
  float rimC = (1.0 - smoothstep(0.5, ${gl(RIM_PX)}, inPx)) * body * mix(${gl(RIM_LIT)}, ${gl(RIM_SHADE)}, g1) * mix(0.45, 1.0, hard) * (1.0 - uClose);
  // (sky.cloudDepth: the dried pigment stays on a few crisp stretches of the
  // edge, never as a line round the whole mass)
  rimC *= mix(1.0, hard * smoothstep(0.50, 0.80, pool) * 0.7, uDepth);
  rimG *= 1.0 - 0.65 * uDepth;
  mass = mix(mass, mix(under, uInk, 0.30), max(rimG * ${gl(GLAZE_RIM)}, rimC) * mix(0.35, 1.0, pool));
  // translucent from close in: the thin parts a veil, the cores letting the ground through
  // (sky.cloudDepth: by its optical depth everywhere — a thin edge laid wet is
  // a veil, one that dried hard holds more of its white, the core is opaque)
  float thinA = mix(mix(${gl(ALPHA_THIN)}, ${gl(CLOSE_THIN_A)}, uClose), mix(${gl(DEPTH_THIN_WET)}, ${gl(DEPTH_THIN_HARD)}, hard), uDepth * (1.0 - uClose));
  float massA = body * mix(thinA, mix(1.0, ${gl(CLOSE_CORE_A)}, uClose), smoothstep(0.15, 0.70, tau));

  // the puffs under it, white, each with its own grey underside cut on the
  // side turned from the light, and the high veils under those
  vec3 puff = mix(white, wash, smoothstep(0.40 - 0.10 * uDepth, 0.60 + 0.20 * uDepth, cuv.y) * (1.0 - 0.2 * uDepth));
  puff = mix(puff, under, 0.35 * smoothstep(0.80, 0.95, cuv.y) * (1.0 - 0.5 * uDepth));
  vec4 lay = vec4(white, cir * ${gl(CIRRUS_A)});
  lay = icLay(vec4(puff, cuv.x * 0.94), lay);
  lay = icLay(vec4(mass, massA), lay);
  // a storm's eye is dark over whatever ground it opens on — the eyewall's own
  // shadow fills it — so it reads even over ice
  lay = icLay(vec4(mix(under, uInk, 0.50), 0.80 * eye), lay);
  vec3 col = lay.rgb;

  // the night. A flat-lit poster has none: its far side is only a step cooler.
  // Under a real sun the weather goes into dusk across the band the ground's
  // own painted terminator wanders over (ink.js inkNight), so it is never left
  // lit far out in the ground's night, and past it sinks into that night,
  // darker and thinner. Near the terminator only, the edges still facing the
  // light keep it: narrow, broken, warm.
  float dayR = smoothstep(0.02, 0.14, sunE + ${gl(NIGHT_BREAK)} * wander);
  vec3 nightGrey = mix(mix(uShadeCool, uInk, ${gl(NIGHT_MIX)}), uPaper, ${gl(NIGHT_LIFT)});
  if (uNight > 0.0) nightGrey = mix(nightGrey, mix(uInk, uShadeCool, 0.25) * 0.72, uNight * uTerm);
  float flatDim = mix(0.84, 1.0, smoothstep(-0.55, 0.45, sunE));
  vec3 day = col * mix(flatDim, 1.0, uTerm);
  vec3 night = nightGrey * (0.70 + 0.14 * tau);
  col = mix(day, mix(night, day, dayR), uTerm);
  float nearT = smoothstep(-${gl(RIM_REACH)}, 0.06, sunE + 0.02 * wander) * (1.0 - dayR);
  float edge = (1.0 - smoothstep(0.3, 1.6, inPx)) * body * smoothstep(0.10, 0.50, relief);
  float lining = uTerm * nearT * edge * mix(0.45, 1.0, pool) * (1.0 - uClose);
  col = mix(col, mix(mix(uLitWarm, uVerm, 0.30), white, 0.40), lining * 0.9);

  // a lava world's ash is lit from under where it leaves its vent
  if (uAsh > 0.5) {
    float glow = 0.0;
    for (int i = 0; i < 8; i++) {
      if (uVent[i].w > 0.0) glow = max(glow, exp(-acos(clamp(dot(dW, uVent[i].xyz), -1.0, 1.0)) / 0.035) * uVent[i].w);
    }
    col = mix(col, mix(uVerm, vec3(1.0, 0.82, 0.5), 0.25), glow * 0.75);
  }

  // over the race route the weather is drawn pale rather than left out
  float thin = icThin(dW);
  float sink = mix(1.0, mix(${gl(NIGHT_KEEP)}, 1.0, max(dayR, lining)), uTerm);
  float a = lay.a * sink * limb * uPresence * (1.0 - ${gl(THIN_PALE)} * thin) * (1.0 - 0.25 * uAsh);
  gl_FragColor = vec4(col, min(a, 1.0));
}
`;

// The cast shadow: the same field, sampled where the light leaves the height
// the weather is cast from, laid back on the ground as a cool glaze —
// multiplied, never covering, so the terrain's own painting reads through it.
const SHADOW_FRAG = /* glsl */ `
${NOISE_GLSL}
${FIELD_GLSL}
uniform vec3 uPaper;
uniform vec3 uShadeCool;
uniform vec3 uInk;
uniform float uShadowH;
void main() {
  vec3 N = normalize(vNrm);
  float pxR = max(length(fwidth(vDir)), 1e-5);
  // cut on the ground's edge, one shell-height in, with the same broken fall
  // the sheet's own edge has
  float wander = (icNoise(vDir * ${gl(WANDER_COARSE)} + uOffA) - 0.5)
               + 0.6 * (icNoise(vDir * ${gl(WANDER_FINE)} + uOffB) - 0.5);
  float limb = smoothstep(0.0, ${gl(LIMB_FALL)},
    icOver(0.4) + ${gl(LIMB_BITE)} * wander + 0.10 * (icNoise(vDir * ${gl(LIMB_FINE)}) - 0.5));
  if (limb < 0.01) discard;

  vec3 L = normalize(uSunDir);
  float sunE = dot(N, L);
  // nothing casts a shadow where the sun is down
  float gate = smoothstep(0.02, 0.16, sunE);
  if (gate * limb < 0.01) discard;

  // the weather a step toward the light casts this patch's shadow, so the
  // shadow lies a step down-light of its cloud, longer toward the terminator,
  // cut nearly as crisply as the cloud and with its puffs' own small shadows
  vec3 Lt = L - N * sunE;
  vec3 ed = uEye;
  vec3 Lp = L - ed * dot(L, ed);
  vec3 toL = Lt + 0.6 * (Lp - N * dot(Lp, N));
  vec3 sd = normalize(vDir + toL / max(length(toL), 1e-4) * uShadowH * (0.7 + 1.1 * (1.0 - sunE)));
  float thr;
  vec3 w, fl;
  float d = icField(sd, thr, w, fl) - thr;
  // from close in the shadow breaks, softens and thins with its cloud (see CLOSE_FAR)
  if (uClose > 0.0) d += uClose * icClose(w);
  float fw = max(fwidth(d), 1e-5);
  float sw = max(1.2 * fw, ${gl(CLOSE_SOFT)} * uClose);
  float mass = smoothstep(-sw, sw + 0.004, d)
             * mix(mix(${gl(ALPHA_THIN)}, ${gl(CLOSE_THIN_A)}, uClose), mix(1.0, ${gl(CLOSE_CORE_A)}, uClose),
                   smoothstep(0.15, 0.70, smoothstep(0.0, mix(${gl(TAU_FULL)}, ${gl(CLOSE_TAU)}, uClose), d)));
  vec2 cuv = uAsh > 0.5 ? vec2(0.0) : icCumulus(sd, w, vec3(0.0), smoothstep(-${gl(CU_NEAR)}, -0.004, d), pxR);
  mass = max(mass, 0.85 * cuv.x * (1.0 - smoothstep(0.0, 0.35, uClose)));
  float amt = mass * gate * limb * uPresence * ${gl(SHADOW_STRENGTH)} * (1.0 - ${gl(THIN_PALE)} * icThin(sd));
  if (uDetail < 1.0) amt *= uDetail;
  if (amt < 0.004) discard;

  vec3 shade = mix(uPaper, mix(uShadeCool, uInk, 0.30), 0.55);
  vec3 tint = shade / max(uPaper, vec3(0.04));
  gl_FragColor = vec4(mix(vec3(1.0), tint, amt), 1.0);
}
`;

/* ------------------------------------------------------- the field, twice -- */

// The same hash, noise and fbm as NOISE_GLSL, in JS, for one job: solving the
// week's own threshold from the week's own field (see solveThreshold). Only the
// distribution of the field matters here, so the two need not agree bit for bit
// — they need to be the same formula, and they are.
const fract = (v) => v - Math.floor(v);
function hash3(x, y, z) {
  let px = fract(x * 0.1031), py = fract(y * 0.1031), pz = fract(z * 0.1031);
  const d = px * (pz + 31.32) + py * (py + 31.32) + pz * (px + 31.32);
  px += d; py += d; pz += d;
  return fract((px + py) * pz);
}
function noise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const n000 = hash3(ix, iy, iz);
  const n100 = hash3(ix + 1, iy, iz);
  const n010 = hash3(ix, iy + 1, iz);
  const n110 = hash3(ix + 1, iy + 1, iz);
  const n001 = hash3(ix, iy, iz + 1);
  const n101 = hash3(ix + 1, iy, iz + 1);
  const n011 = hash3(ix, iy + 1, iz + 1);
  const n111 = hash3(ix + 1, iy + 1, iz + 1);
  const a = n000 + (n100 - n000) * fx;
  const b = n010 + (n110 - n010) * fx;
  const c = n001 + (n101 - n001) * fx;
  const e = n011 + (n111 - n011) * fx;
  const f = a + (b - a) * fy;
  const g = c + (e - c) * fy;
  return f + (g - f) * fz;
}
function fbm3(x, y, z) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let i = 0; i < 3; i++) {
    sum += amp * noise3(x, y, z);
    norm += amp;
    amp *= 0.5;
    x = x * 2.07 + 13.7; y = y * 2.07 + 5.3; z = z * 2.07 + 9.1;
  }
  return sum / norm;
}
function fbm2(x, y, z) {
  return (0.5 * noise3(x, y, z) + 0.25 * noise3(x * 2.07 + 13.7, y * 2.07 + 5.3, z * 2.07 + 9.1)) / 0.75;
}
function heads3(x, y, z) {
  const ix = Math.floor(x - 0.5), iy = Math.floor(y - 0.5), iz = Math.floor(z - 0.5);
  let f1 = 1;
  for (let a = 0; a < 2; a++) {
    for (let b = 0; b < 2; b++) {
      for (let c = 0; c < 2; c++) {
        const cx = ix + a, cy = iy + b, cz = iz + c;
        const dx = x - cx - 0.15 - 0.7 * hash3(cx + 5.17, cy + 5.17, cz + 5.17);
        const dy = y - cy - 0.15 - 0.7 * hash3(cx + 23.9, cy + 23.9, cz + 23.9);
        const dz = z - cz - 0.15 - 0.7 * hash3(cx + 61.3, cy + 61.3, cz + 61.3);
        const s = 0.65 + 0.5 * hash3(cx + 9.7, cy + 9.7, cz + 9.7);
        f1 = Math.min(f1, (dx * dx + dy * dy + dz * dz) / (s * s));
      }
    }
  }
  return 1 - sstep(0, 0.11, f1);
}
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function wound(v, axis, turn) {
  const c = Math.cos(turn), s = Math.sin(turn);
  const x = cross3(axis, v);
  const k = dot3(axis, v) * (1 - c);
  return [v[0] * c + x[0] * s + axis[0] * k, v[1] * c + x[1] * s + axis[1] * k, v[2] * c + x[2] * s + axis[2] * k];
}
const smooth = (a, b, x) => sstep(a, b, x);

/** icWinds, icFlow, icStorms, icFront, icClimate and icField at t = 0. The
 *  cells and the veils are left out: they are translucent, and the cover the
 *  week asks for is the cover of what hides the ground. */
function fieldAt(dir, L) {
  let w = dir;
  for (const s of L.storms) {
    const cd = dot3(w, s.c);
    if (cd > 0.2) w = wound(w, s.c, s.wind * Math.exp(-Math.acos(Math.min(cd, 1)) / s.radius));
  }
  const px = w[0] * L.freq, py = w[1] * L.band * L.freq, pz = w[2] * L.freq;
  const o = L.offW;
  const flx = fbm2(px + o[0], py + o[1], pz + o[2]) - 0.5;
  const fly = fbm2(px + o[1] + 5.2, py + o[2] + 5.2, pz + o[0] + 5.2) - 0.5;
  const flz = fbm2(px + o[2] + 1.7, py + o[0] + 1.7, pz + o[1] + 1.7) - 0.5;
  const base = fbm3(px + L.warp * flx + L.off[0], py + L.warp * fly + L.off[1], pz + L.warp * flz + L.off[2]);
  // the fronts and the climate, quietened round a storm with the rest
  const d1 = dot3(w, L.frontA1) - L.frontC1 + FRONT_MEANDER * flx;
  const d2 = dot3(w, L.frontA2) - L.frontC2 + FRONT_MEANDER * fly;
  const seg = sstep(FRONT_SEG_LO, FRONT_SEG_HI, noise3(dir[0] * FRONT_FREQ + L.offF[0], dir[1] * FRONT_FREQ + L.offF[1], dir[2] * FRONT_FREQ + L.offF[2]));
  const y = dir[1], ay = Math.abs(y);
  const weather = base + (L.frontAmp1 * Math.exp(-d1 * d1 * FRONT_K) + L.frontAmp2 * Math.exp(-d2 * d2 * FRONT_K)) * seg
    + CLIMATE * (0.9 * L.hot * Math.exp(-(y * y) / 0.0144) + 0.6 * Math.exp(-((ay - 0.74) ** 2) / 0.030) - 0.8 * Math.exp(-((ay - 0.45) ** 2) / 0.016));
  // the storms' own shape, and how far each owns the sky round it
  let calm = 0;
  let shape = -1;
  for (const s of L.storms) {
    const b = cross3(s.c, s.t);
    const cd = dot3(dir, s.c);
    if (cd > 0.4) {
      const ang = Math.acos(Math.min(cd, 1));
      const rho = ang / s.radius;
      const lr = Math.log(Math.max(rho, 0.02));
      const phi = Math.atan2(dot3(dir, b), dot3(dir, s.t));
      const sgn = s.wind > 0 ? -1 : 1;
      const psi = 2 * phi + sgn * STORM_WOUND * lr
        + 1.3 * (noise3(dir[0] * 8 + L.offS[0], dir[1] * 8 + L.offS[1], dir[2] * 8 + L.offS[2]) - 0.5);
      const run = smooth(0.45, 2.3, rho);
      const gn = noise3(Math.cos(phi) * 3.2 + L.offS[2], Math.sin(phi) * 3.2 + L.offS[0], sgn * 3 * lr + L.offS[1]);
      const groups = 1 + (smooth(0.34, 0.60, gn) - 1) * smooth(0.35, 0.75, rho);
      const band = smooth(-0.25 + 0.85 * run + 0.30 * (0.5 - gn), 1, Math.cos(psi));
      const env = smooth(0.08, 0.30, rho) * Math.exp(-0.9 * Math.max(rho - 0.30, 0));
      const heart = Math.exp(-(rho * rho) / 0.16);
      const tex = fbm2(dir[0] * 18 + L.offS[1], dir[1] * 18 + L.offS[2], dir[2] * 18 + L.offS[0]) - 0.5;
      let head = s.arms * (0.16 * heart + 0.21 * band * groups * env)
        + (0.07 + 0.10 * run) * tex - 0.03 - 0.045 * run;
      head -= 0.6 * (1 - smooth(0.6 * s.eye, s.eye, rho));
      shape = Math.max(shape, head);
      calm = Math.max(calm, Math.exp(-(rho * rho) / 5));
    }
    if (s.tail > 0) {
      const along = Math.atan2(dot3(w, s.t), dot3(w, s.c));
      const out1 = smooth(0.05, 0.85, along);
      const off = dot3(w, b) + 0.035 * (noise3(along * 6 + L.offS[0], 1.3 + L.offS[1], 2.1 + L.offS[2]) - 0.5);
      const wd = (0.045 - 0.032 * out1) * (0.6 + 0.8 * noise3(along * 3.5 + L.offS[1], 5.1 + L.offS[2], 0.7 + L.offS[0]));
      const run = smooth(-0.05, 0.10, along) * (1 - smooth(0.55, 0.95, along));
      const ff = 13 + 14 * out1;
      const frag = smooth(0.38 + 0.12 * out1, 0.58 + 0.12 * out1, fbm2(w[0] * ff + L.offS[2], w[1] * ff + L.offS[0], w[2] * ff + L.offS[1]));
      shape = Math.max(shape, s.tail * 0.36 * (1 - 0.45 * out1) * Math.exp(-(off * off) / (wd * wd)) * run * (0.20 + 0.95 * frag) - 0.06);
    }
  }
  const dens = weather * (1 - STORM_CALM * calm) + STORM_FLOOR * STORM_CALM * calm
    + (0.03 + 0.11 * L.hot) * (noise3(w[0] * PUFF_FREQ + L.offC[2], w[1] * PUFF_FREQ + L.offC[0], w[2] * PUFF_FREQ + L.offC[1]) - 0.5);
  // a hot week's heads, laid only near the break (see shareAt)
  const towers = L.hot > 0 ? L.hot * HEADS * (heads3(w[0] * HEAD_FREQ + L.offC[1], w[1] * HEAD_FREQ + L.offC[2], w[2] * HEAD_FREQ + L.offC[0]) - 0.5) : 0;
  // the edge's own break, with the cloud's grain folded in: a direction is
  // clouded where max(dens - t, shape) clears it
  const rag = RAG * ((noise3(dir[0] * RAG_FREQ + L.offR[0], dir[1] * RAG_FREQ + L.offR[1], dir[2] * RAG_FREQ + L.offR[2]) - 0.5)
    + RAG_FINE_AMP * (noise3(dir[0] * RAG_FREQ * RAG_FINE + L.offR2[0], dir[1] * RAG_FREQ * RAG_FINE + L.offR2[1], dir[2] * RAG_FREQ * RAG_FINE + L.offR2[2]) - 0.5))
    - DETAIL * (noise3(w[0] * DETAIL_FREQ + L.offR[1], w[1] * DETAIL_FREQ + L.offR[2], w[2] * DETAIL_FREQ + L.offR[0]) - 0.5);
  return { dens, towers, shape, rag };
}

/** The week's directions, each with the share of the poster it stands for. */
function sampleSky(layout, eye) {
  const ga = Math.PI * (3 - Math.sqrt(5));
  const out = { hot: layout.hot, dens: new Float32Array(CAL_SAMPLES), towers: new Float32Array(CAL_SAMPLES), shape: new Float32Array(CAL_SAMPLES), rag: new Float32Array(CAL_SAMPLES), weight: new Float32Array(CAL_SAMPLES) };
  for (let i = 0; i < CAL_SAMPLES; i++) {
    const y = 1 - (2 * i + 1) / CAL_SAMPLES;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const dir = [Math.cos(ga * i) * r, y, Math.sin(ga * i) * r];
    // the share of the poster's face this direction stands for: its projected
    // area on the disc the eye sees (the far side counts for nothing)
    out.weight[i] = Math.max(0, dot3(dir, eye));
    if (out.weight[i] <= 0) continue;
    const f = fieldAt(dir, layout);
    out.dens[i] = f.dens;
    out.towers[i] = f.towers;
    out.shape[i] = f.shape;
    out.rag[i] = f.rag;
  }
  return out;
}

/** The share of the poster's face the field leaves clouded at threshold `t`. */
function shareAt(sample, t) {
  let hit = 0, total = 0;
  for (let s = 0; s < CAL_SAMPLES; s++) {
    const wgt = sample.weight[s];
    total += wgt;
    if (wgt <= 0) continue;
    const dens = sample.dens[s] + sample.towers[s] * sstep(t - 0.05, t + 0.02, sample.dens[s]);
    if (Math.max(dens - t, sample.shape[s]) > sample.rag[s]) hit += wgt;
  }
  return total > 0 ? hit / total : 0;
}

/** The threshold that leaves `share` of the poster's face clouded. */
function solveThreshold(sample, share) {
  let lo = -0.4;
  let hi = 2.0;
  for (let i = 0; i < 32; i++) {
    const t = (lo + hi) * 0.5;
    if (shareAt(sample, t) > share) lo = t; else hi = t;
  }
  return (lo + hi) * 0.5;
}

/* --------------------------------------------------------------- the week -- */

// What the week's own numbers ask the sheet for.
function readWeek(features) {
  const stats = features.stats || {};
  const anchor = Math.max(0.2, num(P['climate.oceanAnchorL'], 6.302));
  const sweat = num(stats.sweatL, anchor);
  // sweat is read on the same anchor as the sea, a factor of four either way
  // being a whole step
  const wet = clamp(Math.log2(Math.max(0.2, sweat) / anchor) / 2.2, -1, 1);
  const cover01 = clamp(0.5 + 0.5 * wet, 0, 1);
  const cover = COVER_DRY + (COVER_WET - COVER_DRY) * Math.pow(cover01, 1.25);
  const warmth = clamp(num(features.warmth, 0.5), 0, 1);
  const cold = clamp((0.60 - warmth) / 0.35, 0, 1);
  const hot = clamp((warmth - 0.62) / 0.30, 0, 1);
  // the hard share of the week winds the storms up; a hot, very wet week breeds
  // its own. A week without heart-rate zones borrows its climate's roughness.
  const hard = clamp(num(stats.hard, num(features.roughness, 0.4)), 0, 1);
  const storm = Math.max(sstep(0.20, 0.58, hard), 0.85 * sstep(0.55, 0.85, cover01) * sstep(0.60, 0.95, warmth));
  return { cover, cover01, cold, hot, warmth, wet, hard, storm };
}

// Where the sheet has to stay thin: the race line (up to eight points along it,
// spaced by the route's own length so its thinning never breaks into dotted
// clearings) and a small clearing over the monument.
function readThin(features, THREE) {
  const points = [];
  for (let i = 0; i < 8; i++) points.push(new THREE.Vector3(0, 0, 1));
  let thinK = 0;
  let thinC = 1;
  let thinC2 = 1;
  const race = features.race;
  const n = race && race.seg ? Math.floor(race.seg.length / 3) : 0;
  if (n >= 2) {
    const at = (i) => new THREE.Vector3(race.seg[i * 3], race.seg[i * 3 + 1], race.seg[i * 3 + 2]).normalize();
    let arc = 0;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    a.copy(at(0));
    for (let i = 1; i < n; i++) {
      b.copy(at(i));
      arc += Math.acos(clamp(a.dot(b), -1, 1));
      a.copy(b);
    }
    const step = Math.max(1, Math.round((n - 1) / 7));
    for (let k = 0; k < 8; k++) points[k].copy(at(Math.min(n - 1, k * step)));
    const radius = clamp(0.72 * (arc / 7), 0.10, 0.30);
    thinK = 1;
    thinC = Math.cos(radius);
    thinC2 = Math.cos(radius * 0.70);
  }
  const mon = features.monument && features.monument.dir
    ? new THREE.Vector3().copy(features.monument.dir).normalize()
    : new THREE.Vector3(0, 0, 1);
  const monK = features.monument ? 0.85 : 0;
  return { points, thinK, thinC, thinC2, mon, monK, monC: Math.cos(0.13), monC2: Math.cos(0.045) };
}

// The ground's own skin: a sphere of its own, every vertex set down on the
// survey at the cap the orbit globe is drawn to (or on the sea, whichever is
// higher), so the shadow it carries lands on the ground.
function buildShadowShell(T, features, radius, lift) {
  const geo = new T.SphereGeometry(radius, 72, 48);
  const pos = geo.attributes.position;
  const v = new T.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    const h = Math.max(features.orbitHeightAt(v), num(features.seaLevel, 0)) + lift;
    pos.setXYZ(i, v.x * (radius + h), v.y * (radius + h), v.z * (radius + h));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Stand the week's storm where the poster sees it: on the lit part of the face
 * the eye looks at, a little off its middle (a storm met head on is a target,
 * one seen at an angle is weather), at its own kind's latitude and in its own
 * hemisphere's sense. One storm, never two: a second only halves the first.
 * `eye` and `light` are unit arrays.
 */
function standStorms(week, rng, eye, light) {
  const storms = [];
  if (week.storm <= 0.12) return storms;
  const kind = week.warmth > 0.78 ? STORM_TROPIC : STORM_MID;
  const cands = [];
  for (let i = 0; i < STORM_CANDIDATES; i++) {
    const lat = (kind.lat[0] + (kind.lat[1] - kind.lat[0]) * rng()) * (rng() < 0.5 ? -1 : 1);
    const lon = rng() * TAU;
    const cr = Math.sqrt(Math.max(0, 1 - lat * lat));
    const c = [Math.cos(lon) * cr, lat, Math.sin(lon) * cr];
    const e = dot3(c, eye);
    const l = dot3(c, light);
    const score = sstep(0.40, 0.84, e) * (1 - 0.5 * sstep(0.93, 1.0, e)) + 0.7 * sstep(-0.05, 0.45, l) * sstep(0.1, 0.4, e) + 0.12 * rng();
    cands.push({ c, score });
  }
  cands.sort((a, b) => b.score - a.score);
  const c = cands[0].c;
  const north = c[1] >= 0;
  // the local frame: east along the latitude, north toward the pole
  let east = cross3([0, 1, 0], c);
  const el = Math.hypot(east[0], east[1], east[2]) || 1;
  east = [east[0] / el, east[1] / el, east[2] / el];
  const up = cross3(c, east);
  // a cyclone's front trails toward the equator and the west of it
  const tx = -0.62 * east[0] + (north ? -0.78 : 0.78) * up[0];
  const ty = -0.62 * east[1] + (north ? -0.78 : 0.78) * up[1];
  const tz = -0.62 * east[2] + (north ? -0.78 : 0.78) * up[2];
  const tl = Math.hypot(tx, ty, tz) || 1;
  // a weak storm is still one a glance can name: the hard share only adds weight
  const k = 0.75 + 0.25 * week.storm;
  storms.push({
    c,
    t: [tx / tl, ty / tl, tz / tl],
    // the northern hemisphere's lows turn anticlockwise seen from above
    wind: (north ? -1 : 1) * kind.wind * (0.7 + 0.3 * week.storm),
    radius: kind.radius * (0.85 + 0.25 * week.storm),
    eye: kind.eye,
    arms: kind.arms * k,
    tail: kind.tail * k,
  });
  return storms;
}

/**
 * Hang the week's weather over the globe, and its shadow on the ground. `ctx`
 * carries what ink.js already holds: the THREE classes, the week's features,
 * the app's live uniforms, the palette's own uniforms (so a repaint is
 * followed), the survey, the light the globe is painted with, the planet's
 * radius and the week's own cloud clock — plus motion.living's own pair and
 * the style's look dials (light.terminator, light.night). Returns null for a
 * body that keeps no weather; otherwise an object with the group to add, an
 * update() for the surface handoff and the dial, and a dispose().
 */
export function createOrbitClouds({ THREE: T, features, uniforms, palette, survey, light, R = 120, weather = null, live = null, look = null }) {
  const bodyId = features.body?.id;
  if (NO_WEATHER.has(bodyId) && !(bodyId === 'star' && crowned())) return null;
  const ash = bodyId === 'lava';
  const week = readWeek(features);
  const thin = readThin(features, T);
  const rng = features.makeRng ? features.makeRng('ink-clouds') : () => 0.5;

  const cap = num(features.orbit && features.orbit.reliefCap, 12);
  const sheetR = R + Math.max(cap + SHEET_LIFT, 14);

  // The week's fronts: the one line of weather the week is built round, and — on
  // a cold week properly, on a hot one as a last stretch of its own — a second
  // crossing it.
  const fy = rng() * 0.6 - 0.3;
  const fl = rng() * TAU;
  const fr = Math.sqrt(Math.max(0, 1 - fy * fy));
  const frontAxis1V = new T.Vector3(Math.cos(fl) * fr, fy, Math.sin(fl) * fr).normalize();
  const across = new T.Vector3().crossVectors(frontAxis1V, new T.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1));
  const frontAxis2V = across.lengthSq() < 1e-4 ? new T.Vector3(0, 1, 0) : across.normalize();
  const frontC1 = (rng() * 2 - 1) * FRONT_TILT;
  const frontC2 = (rng() * 2 - 1) * FRONT_TILT;
  const frontAmp1 = FRONT_AMP;
  const frontAmp2 = FRONT_AMP * (FRONT_COLD + (1 - FRONT_COLD) * week.cold);

  // the field's own seed: the offsets, so two weeks of the same readings are
  // still two skies, and the same week is always the same one
  const v3 = () => new T.Vector3(rng() * 40, rng() * 40, rng() * 40);
  const off = v3(), offW = v3(), offR = v3(), offR2 = v3(), offA = v3(), offB = v3(), offF = v3(), offC = v3(), offS = v3();
  const offE = new T.Vector3(offA.x * 1.31 + 7.7, offA.y * 1.19 + 3.3, offA.z * 1.43 + 5.1);
  const arr = (v) => [v.x, v.y, v.z];

  const layout = {
    off: arr(off), offW: arr(offW), offR: arr(offR), offR2: arr(offR2), offF: arr(offF), offC: arr(offC), offS: arr(offS),
    frontA1: arr(frontAxis1V), frontA2: arr(frontAxis2V), frontC1, frontC2, frontAmp1, frontAmp2,
    band: BAND_HOT + (BAND_COLD - BAND_HOT) * week.cold,
    freq: (FREQ_LO + (FREQ_HI - FREQ_LO) * week.cover01) * (1 - (1 - FREQ_COLD_K) * week.cold),
    warp: WARP_HOT + (WARP_COLD - WARP_HOT) * week.cold,
    hot: week.hot,
    streets: ash ? 0 : week.cold,
    storms: [],
  };

  // a lava world's vents, as the lava body itself reads them
  const vents = [];
  for (let i = 0; i < 8; i++) vents.push(new T.Vector4(0, 0, 1, 0));
  if (ash) {
    ventSessions(features).slice(0, 8).forEach((vent, i) => {
      const d = vent.dir.clone().normalize();
      vents[i].set(d.x, d.y, d.z, clamp(vent.burn, 0, 1));
    });
  }

  const storm4 = [0, 1, 2].map(() => new T.Vector4(0, 1, 0, 0));
  const stormK = [0, 1, 2].map(() => new T.Vector4(0.2, 0, 0, 0));
  const stormT = [0, 1, 2].map(() => new T.Vector3(1, 0, 0));

  const shared = {
    // the light THE GLOBE ITSELF IS PAINTED WITH (ink.js st.light): the sheet
    // takes its light, its night and its shadows from the same light, or its
    // night line runs on a great circle of its own
    uSunDir: light || uniforms.uSunDir,
    uTime: uniforms.uTime,
    uRate: weather || { value: 0 },
    uLive: live ? live.on : { value: 0 },
    uOffE: { value: offE },
    uPresence: { value: 0 },
    uClose: { value: 0 },
    uDetail: { value: 1 },
    uThr: { value: 1 },
    uThrHi: { value: 1.5 },
    uBand: { value: layout.band },
    uFreq: { value: layout.freq },
    uWarp: { value: layout.warp },
    uRag: { value: RAG },
    uRagFreq: { value: RAG_FREQ },
    uHot: { value: week.hot },
    uStreets: { value: layout.streets },
    uCirrus: { value: ash ? 0 : 0.70 + 0.30 * Math.max(week.cover01, week.storm) },
    uAsh: { value: ash ? 1 : 0 },
    uThinK: { value: thin.thinK },
    uThinC: { value: thin.thinC },
    uThinC2: { value: thin.thinC2 },
    uThinP: { value: thin.points },
    uMonK: { value: thin.monK },
    uMonDir: { value: thin.mon },
    uMonC: { value: thin.monC },
    uMonC2: { value: thin.monC2 },
    uFrontA1: { value: frontAxis1V },
    uFrontA2: { value: frontAxis2V },
    uFrontC1: { value: frontC1 },
    uFrontC2: { value: frontC2 },
    uFrontAmp1: { value: ash ? 0 : frontAmp1 },
    uFrontAmp2: { value: ash ? 0 : frontAmp2 },
    uOffF: { value: offF },
    uStorm: { value: storm4 },
    uStormK: { value: stormK },
    uStormT: { value: stormT },
    uVent: { value: vents },
    tLand: { value: survey.land },
    uR: { value: R },
    uCap: { value: cap },
    uSeaLevel: { value: num(features.seaLevel, 0) },
    uEye: { value: new T.Vector3(0, 0, 1) },
    uOff: { value: off },
    uOffW: { value: offW },
    uOffR: { value: offR },
    uOffR2: { value: offR2 },
    uOffA: { value: offA },
    uOffB: { value: offB },
    uOffC: { value: offC },
    uOffS: { value: offS },
  };

  // the palette's own washes, shared as the same uniform objects the sky and the
  // globe read: a repainted week repaints the sheet with it
  const sheetMat = new T.ShaderMaterial({
    uniforms: {
      ...shared,
      uPaper: palette.uPaper,
      uShadeCool: palette.uShadeCool,
      uSkyWash: palette.uSkyWash,
      uInk: palette.uInk,
      uLitWarm: palette.uLitWarm,
      uVerm: palette.uVerm,
      uTerm: look ? look.terminator : { value: 0 },
      uNight: look ? look.night : { value: 0 },
      uLow: { value: R + num(features.seaLevel, 0) + CLOUD_LOW },
      uDepth: look?.cloudDepth || { value: 0 },
    },
    vertexShader: CLOUD_VERT,
    fragmentShader: CLOUD_FRAG,
    transparent: true,
    depthWrite: false,
    side: T.FrontSide,
  });
  const sheetGeo = new T.SphereGeometry(sheetR, 96, 64);
  const sheet = new T.Mesh(sheetGeo, sheetMat);
  sheet.name = 'ink-clouds';
  sheet.visible = false;
  // before the week's own marks: the race line, the ground's pools and the
  // figure are all drawn over the weather, never under it
  sheet.renderOrder = -1;

  const shadowMat = new T.ShaderMaterial({
    uniforms: {
      ...shared,
      uPaper: palette.uPaper,
      uShadeCool: palette.uShadeCool,
      uInk: palette.uInk,
      uShadowH: { value: SHADOW_HEIGHT },
    },
    vertexShader: CLOUD_VERT,
    fragmentShader: SHADOW_FRAG,
    transparent: true,
    depthWrite: false,
    side: T.FrontSide,
    // a glaze, not a cover: three only sets up a multiply blend for a material
    // that declares its colour premultiplied, and this one's colour *is* the
    // multiplier it lays on the ground
    blending: T.MultiplyBlending,
    premultipliedAlpha: true,
  });
  const shadowGeo = buildShadowShell(T, features, R, SHADOW_LIFT);
  const shadow = new T.Mesh(shadowGeo, shadowMat);
  shadow.name = 'ink-cloud-shadow';
  shadow.visible = false;
  shadow.renderOrder = -2;

  const object = new T.Group();
  object.name = 'ink-clouds-sheet';
  object.add(shadow);
  object.add(sheet);

  // The storms and the threshold are stood once, on the first frame the sheet
  // is drawn: from the eye the poster is looked from and the light it is
  // painted with, so the week's weather is on the face the poster shows.
  let stood = false;
  let covered = 0;
  const eye = new T.Vector3();
  function stand(camera) {
    stood = true;
    eye.copy(camera.position);
    if (eye.lengthSq() < 1e-6) eye.set(0, 0, 1);
    eye.normalize();
    shared.uEye.value.copy(eye);
    const lv = shared.uSunDir.value.clone().normalize();
    const e = [eye.x, eye.y, eye.z];
    layout.storms = ash ? [] : standStorms(week, rng, e, [lv.x, lv.y, lv.z]);
    layout.storms.forEach((s, i) => {
      storm4[i].set(s.c[0], s.c[1], s.c[2], s.wind);
      stormK[i].set(s.radius, s.eye, s.arms, s.tail);
      stormT[i].set(s.t[0], s.t[1], s.t[2]);
    });
    if (ash) {
      // ash has no cover to solve: a plume is as big as its vent burned
      shared.uThr.value = 0.40;
      shared.uThrHi.value = 0.80;
      return;
    }
    const sample = sampleSky(layout, e);
    shared.uThr.value = solveThreshold(sample, week.cover);
    shared.uThrHi.value = solveThreshold(sample, COVER_EDGE);
    covered = shareAt(sample, shared.uThr.value);
  }

  // The eye coming down to the sheet: from a few units over its own tops the
  // weather is no longer weather but a wall of wash cut on lines the frame is too
  // close to read, so the sheet dissolves (its cover thins, as the dial does it)
  // over the last NEAR_FADE units before the camera would be under it, rather
  // than standing whole at the closest orbit and then going out at once.
  const insideR = sheetR + 6;
  const NEAR_FADE = 12;

  function update({ camera, surface, lod = 1 } = {}) {
    const dial = clamp(num(P['sky.orbitClouds'], 0), 0, 1);
    // the surface handoff: the ground wears its own sky, so the sheet is gone
    // before the camera is under it
    const mix = clamp(num(surface, 0), 0, 1);
    const near = camera ? clamp((camera.position.length() - insideR) / NEAR_FADE, 0, 1) : 1;
    const presence = dial * (1 - sstep(0.10, 0.52, mix)) * sstep(0, 1, near);
    shared.uPresence.value = presence;
    // how near the camera has come to the weather (see CLOSE_FAR)
    shared.uClose.value = camera ? 1 - sstep(CLOSE_NEAR, CLOSE_FAR, camera.position.length() - sheetR) : 0;
    const on = presence > 0.002;
    if (on && !stood && camera) stand(camera);
    sheet.visible = on;
    // feature LOD: the shadow fades out with the modelling and is not drawn at all once it has
    shared.uDetail.value = lod;
    shadow.visible = on && lod > 0;
  }

  function dispose() {
    sheetGeo.dispose();
    shadowGeo.dispose();
    sheetMat.dispose();
    shadowMat.dispose();
    if (object.parent) object.parent.remove(object);
  }

  // what the sheet was drawn from, for the bench and the eye:
  // window.__ink.clouds.week / .cover / .storms
  return {
    object,
    sheet,
    shadow,
    update,
    dispose,
    week,
    get cover() { return covered; },
    get storms() { return layout.storms; },
    get thresholds() { return { thr: shared.uThr.value, thrHi: shared.uThrHi.value }; },
    sheetR,
  };
}

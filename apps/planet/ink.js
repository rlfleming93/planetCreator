/* Planet Creator — "ink".
 * Painterly ink and watercolour: washes with pigment pooling at their edges, a
 * paper-grain sheet, ink contours (screen-space, from depth + normals, in one
 * post pass), hatching in shadow, one limited palette (indigo ink, sepia, four
 * wash colours shifted by the week's warmth), a wash sky with brush-stroke
 * clouds, the race as a vermilion brush line, and the objects drawn in the
 * same hand.
 *
 * Everything here is style: base.js owns the world, the cameras and the loop.
 */
import * as THREE from 'three';
import { createOrbitClouds } from './ink-clouds.js';
import { createBody, loadBody } from './bodies/index.js';
import { crowned } from './bodies/star.js';
import { createSpace } from './ink-space.js';
import { createLife, loadLife } from './life.js';
import { buildRaceStroke, inkFeatureObject, inkRunnerMaterials, washMaterial } from './ink-objects.js';
import { P } from './params.js';
import { pace } from './pace.js';
import { printFor, PRINT_VERT } from './prints/index.js';
import { companionsFor, loadRing, resolvedWorld } from './worlds/index.js';

const R = 120; // planet radius (matches base.js)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const C = (hex) => new THREE.Color(typeof hex === 'string' ? Number.parseInt(hex.slice(1), 16) : hex);
const mixc = (a, b, t) => C(a).lerp(C(b), t);

// The craft dials. A dial the catalogue does not carry yet reads as its pinned
// default — the picture before the craft pass — so a missing key is never a
// picture that changed.
const dial = (key, fallback) => (typeof P[key] === 'number' ? P[key] : fallback);
const dialId = (key, fallback) => (typeof P[key] === 'string' && P[key] ? P[key].toLowerCase() : fallback);

// A stable number from the week's own name (FNV-1a; no RNG, no clock). Two
// weeks of the same name are always the same picture: it is what gives a week
// its signature weather in a widened palette, and the seed a print cuts its
// screen with.
function weekHash(text) {
  const s = String(text ?? '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ------------------------------------------------------------------ palette */

// Every week is painted from the same box: the sheet, the ink, the sepia and the
// vermilion of the race never change. What changes is the weather the week was
// trained in. The race week is the anchor the owner chose and its palette is
// kept exactly: that is `coast`, and every rule below is zero for it. The other
// families are the same painting laid in other weather, each a set of washes
// that belong together with the same value plan (paper lightest, a warm light, a
// cool shade, an ink-dark accent), and a week is a blend of them, read from its
// own numbers against the race week's:
//
//   the week's input                         what it moves                              race week
//   temperature, activity-time-weighted      the family on the warm/cool axis:           20.3 °C
//     (features.warmth × 30)                 ≤2 °C alpine · 11 highland · 20.3 coast;
//                                            above the race the heat comes on as its
//                                            square, so 26 °C still leans coast and
//                                            30 °C is wholly hot
//   intensity = 0.8 × share of HR time in    hot weeks: chalk (easy) … desert (hard).    0.456
//     zones 4–5 + 0.2 × anaerobic effect/2   Against the race, ±0.18 is a whole step:
//                                            harder → dusk light, deeper shadow, redder
//                                            rock; easier → shadows lifted (hue kept)
//                                            and calm, unbroken planes
//   volume, active minutes (log2 vs race)    the lowland as a patchwork of fields        404 min
//                                            (more) or bare umber earth on the page
//                                            (fewer)
//   sweat (log2 vs race)                     the sea's depth and colour, underfoot as    6.3 L
//                                            from orbit: darker, calmer water with more;
//                                            paler, shallower water with less
//   sport mix, share of active time          a mineral in the rock's darkest creases     none
//                                            and on the week's own objects: strength
//                                            indigo, swim teal (and turquoise shallows),
//                                            rides iron red, other sports verdigris
const ANCHOR = { tempC: 20.337370070131804, hard: 0.45608977231582265, minutes: 403.61285000000004, sweat: 6302 };

// The race week's palette. One limited palette — indigo ink, sepia, a warm
// light wash and a cool shadow glaze — every colour shifted by the warmth it was
// laid in. Pigment the sun reaches is warm (ochre through sienna), pigment in
// shade is cool (ultramarine through violet), and everything far enough away
// loses its warmth to the air.
function coastPalette(w) {
  return {
    paper: mixc(0xe6dfcd, 0xf3e7cb, w),
    paperWet: mixc(0xd4cfbe, 0xe4d5b6, w),
    ink: mixc(0x1b2540, 0x2a2318, w * 0.5),
    inkSoft: mixc(0x3b4a66, 0x4b4030, w * 0.5),
    // the palette's committed dark (craft.values): the one pigment the picture's
    // dark mass is made of. The coast's is the ink its sea and its deepest shade
    // are laid with, a step below anything the wash reaches without it.
    dark: mixc(0x141c33, 0x221c12, w * 0.5),
    sepia: mixc(0x6d5238, 0x82603a, w),
    landLow: mixc(0x86977a, 0xa89e6c, w),
    landMid: mixc(P['pal.coast.landMidCold'], P['pal.coast.landMidWarm'], w),
    landHigh: mixc(0x7b7889, 0x8d8084, w),
    litWarm: mixc(0xd6a462, 0xeaba73, w),
    shadeCool: mixc(0x4b5584, 0x5d5a7c, w),
    farGlaze: mixc(0x91a2b1, 0xaaa69b, w),
    crest: mixc(0xe3e6d6, 0xf0dcb4, w),
    seaShallow: mixc(0x7fa6ab, 0x90a79b, w),
    seaDeep: mixc(0x27476b, 0x335771, w),
    foam: mixc(0xe9e6d8, 0xf2e9d2, w),
    vermilion: mixc(0xc53e25, 0xdf552a, w),
    stone: mixc(0xa8aaa4, 0xc2b69c, w),
    wood: mixc(0x6c5a45, 0x7d6440, w),
    skyHigh: mixc(0x596f90, 0x718697, w),
    skyLow: mixc(0xc9bea8, 0xdfc59a, w),
    // the sky is laid wash by wash on the sheet: a warm pale band at the
    // horizon, one slate-ultramarine wash over it, and a loaded glaze of the
    // same blue across the top; the clouds are the paper left out of all three,
    // with one cool grey laid under them
    skyBand: mixc(0xebdcbf, 0xf3dbb4, w),
    skyWash: mixc(P['pal.coast.skyWashCold'], P['pal.coast.skyWashWarm'], w),
    skyDeep: mixc(0x5e7199, 0x6a799d, w),
    cloudUnder: mixc(0xb9c3cd, 0xc4c8ca, w),
    // P1's surface-water accents.
    cobalt: mixc(0x294a78, 0x30557a, w),
    teal: mixc(0x4b8690, 0x588a89, w),
    // the fields a longer week grows on the coast's low ground, and the umber
    // a shorter one leaves bare
    veg: C(0x7b9550),
    bare: C(0x8c5433),
    // the driest ground seen from orbit: the sheet, with the sky's own blue in it
    dry: mixc(0xe6dfcd, 0xf3e7cb, w).lerp(mixc(0x93a6c4, 0x9eadc0, w), 0.13),
  };
}

// The other weather. Every sky colour is a glaze: no channel above the paper,
// and the zenith no lighter than the wash it is laid over. Each family has a
// signature of its own beyond its light: the second colour, the shadow's hue
// and the driest ground all differ, so two pale weeks are never one cream. Each
// also commits one dark — `dark`, the pigment its dark mass is made of, a deep
// oxblood, an indigo under ice, a sepia stone — because three separated values
// are what a poster reads as a plan (craft.values).
const FAMILIES = {
  // hot and hard: a red-rock desert — pale sand next to the paper, burnt
  // sienna slopes, oxblood rock, violet shadow; an ultramarine sea, its
  // complement, under a hot sky: a thin apricot haze (HAZE) on the horizon
  // under a clean cerulean
  desert: {
    litWarm: 0xeddcb8, get landMid() { return P['pal.desert.landMid']; }, landHigh: 0x9e5a48, landLow: 0xd8cbac, shadeCool: 0x4c417c,
    crest: 0xf5e3c9, farGlaze: 0xbba8ae, stone: 0xd4ae8e, veg: 0x6a8f4c, bare: 0x9a5234, dry: 0xf1e0c6, dark: 0x5a2a24,
    seaShallow: 0x8a9ec4, seaDeep: 0x2b3a70, cobalt: 0x30427e, teal: 0x5c82ae,
    skyBand: 0xeed7b0, get skyWash() { return P['pal.desert.skyWash']; }, skyDeep: 0x5f8cb8, cloudUnder: 0xd6bca8, skyHigh: 0x6f94b8, skyLow: 0xe5c198,
  },
  // hot and easy: the sun-bleached limestone coast — straw light, warm
  // limestone, a straw lowland, lavender shade; a jade sea under a bleached,
  // white-hot haze on the horizon under a pale sky
  chalk: {
    litWarm: 0xf2dcac, get landMid() { return P['pal.chalk.landMid']; }, landHigh: 0xc2a07e, landLow: 0xe6cf8e, shadeCool: 0x8a82b4,
    crest: 0xf5eedb, farGlaze: 0xc6c7b8, stone: 0xd8cfba, veg: 0x94ac6c, bare: 0xa3703f, dry: 0xefe6cc, dark: 0x4c3a24,
    seaShallow: 0x92cdb4, seaDeep: 0x23796a, cobalt: 0x2a6d66, teal: 0x55b09a,
    skyBand: 0xefe2c0, get skyWash() { return P['pal.chalk.skyWash']; }, skyDeep: 0x8fb0b8, cloudUnder: 0xd8cfb6, skyHigh: 0xa4bcc4, skyLow: 0xe8dcbc,
  },
  // cold: sunlit snow over blue-grey granite and pine, cobalt shadow, steel
  // water under a high, pale, icy sky
  alpine: {
    litWarm: 0xefe7d8, get landMid() { return P['pal.alpine.landMid']; }, landHigh: 0x6c7a98, landLow: 0x587a62, shadeCool: 0x46599a,
    crest: 0xf5f5ef, farGlaze: 0xa8b6c8, stone: 0xb8bcbe, veg: 0x4c6e52, bare: 0x7e4f33, dry: 0xebeeec, dark: 0x223252,
    seaShallow: 0x86a8b0, seaDeep: 0x1f3a5e, cobalt: 0x26466f, teal: 0x4b7d8c,
    skyBand: 0xe6e6cc, get skyWash() { return P['pal.alpine.skyWash']; }, skyDeep: 0x8ea6bc, cloudUnder: 0xc0c8cc, skyHigh: 0x8aa2b8, skyLow: 0xd8dbca,
  },
  // cool: moss and yellow ochre, grey-violet rock, blue-green shade, a deep
  // green-blue sea under a soft grey sky
  highland: {
    litWarm: 0xd9c079, get landMid() { return P['pal.highland.landMid']; }, landHigh: 0x7e7888, landLow: 0x748b52, shadeCool: 0x485d70,
    crest: 0xede6ca, farGlaze: 0xa0aeb0, stone: 0xb2af9e, veg: 0x66804a, bare: 0x875530, dry: 0xe7e4cb, dark: 0x3f3428,
    seaShallow: 0x6fa39a, seaDeep: 0x1f4d63, cobalt: 0x24506e, teal: 0x4a8a86,
    skyBand: 0xe2dcc2, get skyWash() { return P['pal.highland.skyWash']; }, skyDeep: 0x7f8c8a, cloudUnder: 0xc0c2ba, skyHigh: 0x7c8a8c, skyLow: 0xd4ceb0,
  },
  // harder than the race: rose light, madder rock, indigo shadow and water
  // under a lavender sky with a rose horizon
  dusk: {
    litWarm: 0xe6aa8c, get landMid() { return P['pal.dusk.landMid']; }, landHigh: 0x8c5a6c, landLow: 0x8c8878, shadeCool: 0x483f7a,
    crest: 0xf2dac8, farGlaze: 0xaba2be, stone: 0xbaa4a8, veg: 0x6e7a5c, bare: 0x86503e, dry: 0xefdbd2, dark: 0x2e2547,
    seaShallow: 0x8096ae, seaDeep: 0x28326c, cobalt: 0x2c3c76, teal: 0x5c7f9c,
    skyBand: 0xefc4a4, get skyWash() { return P['pal.dusk.skyWash']; }, skyDeep: 0x6e6298, cloudUnder: 0xd8b4b4, skyHigh: 0x6a6294, skyLow: 0xdcb49e,
  },
};

// craft.palettes. The five weathers above are the week's own; a shelf painted
// only from them is one warm tan from March to March, because four of the five
// put their light and their mid-ground within twenty degrees of each other. So
// the box is widened with five families the axis above cannot reach: two cold
// ones (verdigris over copper, slate under indigo) and three saturated earths
// (oxide red against a violet shade, sage against sepia, ochre under
// ultramarine). Every family carries the same keys as the five — the value
// plan, the sea, the sky glazes and the committed dark — so the blend, the
// objects and the sea read a week the same way whichever families it was
// mixed from. They are plain colours rather than dials of their own: the five
// established families are the ones the bench tunes.
//
// A week takes one of them as its signature (see weekPalette): half its
// picture, chosen from the week's own name, so the weeks of a year spread
// across the hues instead of landing in one bucket.
const FAMILIES_WIDE = {
  ...FAMILIES,
  // cool and wet: the copper roof and its verdigris — a copper light, patina
  // ground, slate-blue shade, a pale patina sky over a deep green sea. The
  // ground is the patina itself: a green whose blue is carried in the rock, so
  // a verdigris week is never the sage one with a colder light on it.
  verdigris: {
    litWarm: 0xe8b98a, landMid: 0x5f9078, landHigh: 0x4f7480, landLow: 0x93ac80, shadeCool: 0x2f5266,
    crest: 0xeef0dc, farGlaze: 0xa6bcb4, stone: 0xa8b6ac, veg: 0x679543, bare: 0x9c5b2c, dry: 0xdfe6cf, dark: 0x1c3a3a,
    seaShallow: 0x74a9a2, seaDeep: 0x1d4b52, cobalt: 0x22596a, teal: 0x4f9a8e,
    skyBand: 0xe3e6cf, skyWash: 0xaec6c0, skyDeep: 0x7e9a9c, cloudUnder: 0xc2cbc4, skyHigh: 0x82a0a2, skyLow: 0xd6dcc4,
  },
  // cold: slate under a sky of indigo — pale cool light, blue-grey ground,
  // indigo shade and water, the whole family a step cooler than alpine. Its
  // ground is violet where the sage's is green: the two cold families are two
  // different worlds and not one grey.
  indigo: {
    litWarm: 0xdcd8e8, landMid: 0x5b6f9e, landHigh: 0x5a648e, landLow: 0x6d84a8, shadeCool: 0x3a4674,
    crest: 0xe8ecf2, farGlaze: 0xa8b4c6, stone: 0xa8b2c6, veg: 0x4a7068, bare: 0x6d4a3f, dry: 0xdde4f0, dark: 0x161c38,
    seaShallow: 0x7d97b6, seaDeep: 0x1c2f58, cobalt: 0x25386b, teal: 0x4d7d9c,
    skyBand: 0xdfe2ec, skyWash: 0xaebbd2, skyDeep: 0x707f9e, cloudUnder: 0xc4c9d8, skyHigh: 0x8090ac, skyLow: 0xd2d6e2,
  },
  // hot: an oxide red — a saturated earth, its slopes burnt orange and its
  // rock violet, under the violet shade the complement of a red rock throws.
  // This is the hot box's own red: the desert family is a rock the sun has
  // bleached, this one is the pigment before the sun reached it.
  oxide: {
    litWarm: 0xeec48f, landMid: 0xb45a30, landHigh: 0x8f4668, landLow: 0xc98a52, shadeCool: 0x4a3a72,
    crest: 0xf2dcc2, farGlaze: 0xb59aa2, stone: 0xc99a6a, veg: 0x92933f, bare: 0x9c4726, dry: 0xecd2b0, dark: 0x46182f,
    seaShallow: 0x8f92be, seaDeep: 0x35306b, cobalt: 0x3a3577, teal: 0x6a83b0,
    skyBand: 0xebcfa6, skyWash: 0xb6b3d0, skyDeep: 0x6d6296, cloudUnder: 0xd2b4ae, skyHigh: 0x75709c, skyLow: 0xdcbcae,
  },
  // dry and cool: sage over sepia — grey-green ground, sepia stone and earth,
  // a soft grey-green sky, the quietest family in the box and the one that
  // keeps the week's own light closest
  sage: {
    litWarm: 0xe3cfa4, landMid: 0x8d9b6a, landHigh: 0x8a8468, landLow: 0x9fae72, shadeCool: 0x57626a,
    crest: 0xefe9d6, farGlaze: 0xb2b3a2, stone: 0xbab49d, veg: 0x8fa86c, bare: 0x936a42, dry: 0xe9e3cd, dark: 0x3a3423,
    seaShallow: 0x8fa9a4, seaDeep: 0x2c4f56, cobalt: 0x2f5460, teal: 0x5f8f8a,
    skyBand: 0xe7e0c6, skyWash: 0xb8bfb2, skyDeep: 0x8b938c, cloudUnder: 0xc8c5b6, skyHigh: 0x8e9890, skyLow: 0xd9d3b8,
  },
  // hot: an ochre world under an ultramarine sky — gold ground, blue-violet
  // rock and shade, the strongest light the box holds and the one whose shade
  // is the sky's own blue
  ochre: {
    litWarm: 0xf0d79b, landMid: 0xc68f42, landHigh: 0x8a789e, landLow: 0xd6ab55, shadeCool: 0x3f4a86,
    crest: 0xf6e8c8, farGlaze: 0xafa8a6, stone: 0xcdb489, veg: 0x84994c, bare: 0xa8622f, dry: 0xf0e2c0, dark: 0x1f2650,
    seaShallow: 0x7f9fce, seaDeep: 0x1f3070, cobalt: 0x243a80, teal: 0x4c78b4,
    skyBand: 0xe9d8ae, skyWash: 0x9fb6d8, skyDeep: 0x4c6aa8, cloudUnder: 0xc6c1c2, skyHigh: 0x5f7cb4, skyLow: 0xd8c7a4,
  },
};
// The weather a signature may be worn in: a cold week is never a red rock and
// a hot one never under ice, so the family a week takes is drawn from its own
// climate — and within that climate from its place in the year, salted with its
// own name, so a hot spell turns its families over week by week instead of
// sitting in one (see weekPalette).
const SIGNATURE_WEATHER = [
  { max: 12, list: ['indigo', 'verdigris'] },
  { max: 18, list: ['verdigris', 'sage', 'indigo'] },
  { max: 23, list: ['sage', 'ochre', 'verdigris'] },
  { max: 99, list: ['oxide', 'ochre', 'sage'] },
];
// the ground the signature owns outright, and the weather that stays its own:
// the light, the shade, the sky and the sea belong to the week's climate
// (that is where the week's temperature is read), while the ground and the
// picture's one dark are the family's
const SIGNATURE_GROUND = new Set(['landLow', 'landMid', 'landHigh', 'veg', 'bare', 'dry', 'stone', 'dark']);
const SIG_GROUND = 0.70, SIG_WEATHER = 0.30;

// ground.season: the ground walks the year. Two months a family round the
// calendar (indigo slate at midwinter, verdigris in spring, sage, ochre at
// midsummer, oxide in autumn, umber going into winter), and the week's own
// temperature pulls it along its half of the year: toward midsummer's ochre
// when warm, toward midwinter's indigo when cold. A week with no temperature
// reads the calendar alone. The family is laid over the week's own weather as
// the step it stands from the race week's ground, so a hot week and a cool one
// in the same month still differ as their weather does. It takes the ground
// and some of the light; the shade, the sky and the sea stay the weather's.
// Umber is a ground only, so it carries the ground's keys and its light.
const UMBER = {
  litWarm: 0xe2c29a, landLow: 0x9a8266, landMid: 0x84604a, landHigh: 0x66505c, veg: 0x77744a, bare: 0x6e432c,
  dry: 0xe6dccb, stone: 0xab9a8c, dark: 0x2b1d1f,
};
const SEASON = ['indigo', 'verdigris', 'sage', 'ochre', 'oxide', 'umber'];
const SEASON_FAMILY = SEASON.map((name) => (name === 'umber' ? UMBER : FAMILIES_WIDE[name]));
const SEASON_GROUND = 0.9, SEASON_LIGHT = 0.6, SEASON_TEMP = 0.35;
// ground.soil: the driest ground seen from orbit (pal.dry, the reserve the lit
// face leaves) takes the soil of where the week was trained, kept pale so it
// is still the picture's light: a salt pan under a roof, sienna on a climbing
// week, gold sand on a hot one, lichen otherwise. The season's ground is let
// into it too (SOIL_SEASON), so the year still reads on the reserve.
const SOIL = { salt: 0xe6eaef, sienna: 0xe2b58c, gold: 0xe8c985, lichen: 0xc8d3ad };
const SOIL_AMT = 0.9, SOIL_SEASON = 0.3;
// sea.mineral: the water a mineral is laid in, keyed as ACCENTS is: strength's
// indigo is that family's own sea, football's verdigris a jade one, a ride's
// iron a wine-dark sea (deep plum under mauve-grey shallows), a swim's a clear
// teal. Laid as the step it stands from the race week's sea, over the week's
// own: as far as the share of its time spent on the other sports, and at most.
const MINERAL_SEA = {
  strength: FAMILIES_WIDE.indigo,
  sport: { seaShallow: 0x7fb8a4, teal: 0x4fa08a, seaDeep: 0x1f5a4e, cobalt: 0x256a5c },
  ride: { seaShallow: 0xa3909c, teal: 0x7a6276, seaDeep: 0x3a2438, cobalt: 0x46304a },
  swim: { seaShallow: 0x6fb3a9, teal: 0x2e9490, seaDeep: 0x154f55, cobalt: 0x1b5f68 },
};
const SEA_MINERAL = 3.5, SEA_MINERAL_MAX = 0.9;

// The week's place in its year (ISO-8601 week number), so a signature can walk
// its family list with the calendar. No clock: the week's own name is the date.
function isoWeek(text) {
  const [y, m, d] = String(text ?? '').split('-').map(Number);
  if (!y || !m || !d) return 0;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 3 - ((dt.getUTCDay() + 6) % 7));   // that week's Thursday
  const first = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  first.setUTCDate(first.getUTCDate() + 3 - ((first.getUTCDay() + 6) % 7));
  return 1 + Math.round((dt - first) / 604800000);
}
const FAMILY_KEYS = Object.keys(FAMILIES.desert);
// the water is slow to warm (see weekPalette)
const SEA_KEYS = new Set(['seaShallow', 'seaDeep', 'cobalt', 'teal']);
// the haze a hot week lays up its sky: apricot over the desert, bleached
// straw over the chalk (a step below the paper, so its clouds still show)
const HAZE = { desert: 0xdcc8a2, chalk: 0xe3d8b6 };
// the sport a feature kind stands for, and the mineral it lays in the rock
const ACCENT_OF = { spires: 'strength', lagoon: 'swim', valley: 'ride', wheel: 'ride', cairn: 'sport', pitch: 'sport' };
const ACCENTS = {
  get strength() { return P['pal.accentStrength']; },
  get swim() { return P['pal.accentSwim']; },
  get ride() { return P['pal.accentRide']; },
  get sport() { return P['pal.accentSport']; },
};

const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hexOf = (c) => `#${c.getHexString()}`;
const pct = (x) => `${Math.round(x * 100)}%`;
const _hsl = { h: 0, s: 0, l: 0 };
// lighter or darker by dl, the hue and its strength kept: a lighter wash of the
// same pigment, never a greyer one
const lift = (c, dl) => { c.getHSL(_hsl); c.setHSL(_hsl.h, _hsl.s, clamp(_hsl.l + dl, 0, 0.95)); };
// the value a wash is read at, as the shaders read it
const lum = (c) => 0.32 * c.r + 0.55 * c.g + 0.13 * c.b;
// a pigment let down with water until it reads at value y: its hue kept, its strength going as it pales
const dilute = (c, y) => C(0xffffff).lerp(c, clamp((1 - y) / Math.max(1e-3, 1 - lum(c)), 0, 1));
// OKLab (Ottosson) on the palette's own sRGB values (colour management is off)
const _lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const _enc = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
function toLab(c, o) {
  const r = _lin(c.r), g = _lin(c.g), b = _lin(c.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  o.L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  o.a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  o.b = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
}
function fromLab(o, c) {
  const l = (o.L + 0.3963377774 * o.a + 0.2158037573 * o.b) ** 3;
  const m = (o.L - 0.1055613458 * o.a - 0.0638541728 * o.b) ** 3;
  const s = (o.L - 0.0894841775 * o.a - 1.2914855480 * o.b) ** 3;
  const e = (v) => _enc(clamp(v, 0, 1));
  return c.setRGB(e(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    e(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), e(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s));
}
const _w = { L: 0, a: 0, b: 0 }, _to = { L: 0, a: 0, b: 0 }, _from = { L: 0, a: 0, b: 0 };
// A wash moved by k of the step from one pigment to another, wherever it stood
// (OKLab), and never past the lighter, the darker or the stronger of the wash
// and the pigment it moves toward: a step laid on a week already that way would
// otherwise overshoot both into a louder colour than either.
function shiftBy(c, to, from, k) {
  toLab(c, _w); toLab(to, _to); toLab(from, _from);
  const cap = Math.max(Math.hypot(_w.a, _w.b), Math.hypot(_to.a, _to.b));
  const L = clamp(_w.L + k * (_to.L - _from.L), Math.min(_w.L, _to.L), Math.max(_w.L, _to.L));
  const a = _w.a + k * (_to.a - _from.a), b = _w.b + k * (_to.b - _from.b);
  const s = Math.min(1, cap / Math.max(Math.hypot(a, b), 1e-6));
  _w.L = L; _w.a = a * s; _w.b = b * s;
  return fromLab(_w, c);
}

// Read the week (the raw activity behind every feature) and paint its palette.
// Returns { pal, objPal, info }: objPal is the palette the week's objects are
// drawn in, info is what window.__app.palette shows.
function weekPalette(features) {
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  let secs = 0, sweat = 0, anaT = 0, anaS = 0, cadenceT = 0, cadenceS = 0;
  const sport = { strength: 0, swim: 0, ride: 0, sport: 0 };
  for (const f of features.list) {
    if (f.kind === 'monument') continue; // a race's monument repeats its run
    const a = f.stats || {};
    const s = num(a.activeS);
    secs += s;
    sweat += num(a.sweatMl);
    if (typeof a.anaerobicEffect === 'number') { anaT += a.anaerobicEffect * s; anaS += s; }
    const cadence = num(a.avgCadence);
    if (s > 0 && cadence > 0 && /^(running|walking|hiking)$/.test(String(a.sport || '').toLowerCase())) {
      cadenceT += cadence * s;
      cadenceS += s;
    }
    if (ACCENT_OF[f.kind]) sport[ACCENT_OF[f.kind]] += s;
  }
  const tempC = features.warmth * 30;
  const anaerobic = anaS ? anaT / anaS : 0;
  const hard = 0.8 * features.roughness + 0.2 * clamp(anaerobic / 2, 0, 1);
  const minutes = secs / 60;
  // Motion keeps the same data vocabulary as the painting: sweat loads the
  // broad sea wash, heart-rate roughness breaks its glints, load carries the
  // cloud bands, and running cadence supplies a quiet stride-length pulse.
  const cadenceSpm = cadenceS ? cadenceT / cadenceS : 0;
  const breath = {
    seaRate: 0.65 + 0.70 * clamp(features.roughness, 0, 1),
    seaAmp: clamp(Math.sqrt(sweat / ANCHOR.sweat), 0.15, 1.4),
    seaChop: clamp(features.roughness, 0, 1),
    cloudRate: 0.08 + 0.92 * sstep(0, 1.2, clamp(features.energy, 0, 1.5)),
    cadenceHz: cadenceSpm > 0 ? clamp(cadenceSpm / 120, 0.5, 2) : 0,
  };
  // intensity against the race week: a whole step either way is ±0.18, and a
  // week within a sixth of a step of it (±0.03) is as hard as the race week
  const step = clamp((hard - ANCHOR.hard) / 0.18, -1, 1);
  const ease = Math.max(0, -step - 1 / 6) * 1.2, harder = Math.max(0, step - 1 / 6) * 1.2;

  // ---- the families. Temperature walks the warm/cool axis; a hot week is
  // bleached chalk when it was easy and desert when it was hard; a week harder
  // than the race takes some of its light from dusk. Above the race the land
  // and the sky take the week's heat as it comes, but the sea is slow to warm
  // and takes it as its cube: a week six degrees warmer than the race has
  // its own ground and its own sky over water still mostly the race's, and
  // only a wholly hot week has a hot sea.
  const T = clamp(tempC, 2, 30), T0 = ANCHOR.tempC;
  const heat = clamp((T - T0) / (30 - T0), 0, 1);
  const dusk = 0.5 * sstep(0, 1, harder);
  const weights = (hot) => {
    const x = { coast: 0, alpine: 0, highland: 0, desert: 0, chalk: 0, dusk: 0 };
    if (T <= 11) { x.highland = (T - 2) / 9; x.alpine = 1 - x.highland; }
    else if (T <= T0) { x.coast = (T - 11) / (T0 - 11); x.highland = 1 - x.coast; }
    else {
      x.coast = 1 - hot;
      x.desert = hot * sstep(0.12, 0.40, hard);
      x.chalk = hot - x.desert;
    }
    for (const k in x) x[k] *= 1 - dusk;
    x.dusk = dusk;
    return x;
  };
  const w = weights(heat), wSea = weights(heat ** 3);

  // ---- craft.palettes: the widened weather. The five above are still the
  // week's light, its sky and its season; a widened week also carries a
  // signature family of its own — verdigris, indigo, oxide, sage, ochre —
  // drawn from the weather it was trained in and from its place in the year, so
  // the weeks of a year spread across the hues instead of landing in the one
  // warm tan, and a hot spell is not four weeks of the same ground. The
  // signature owns the ground and the picture's one dark; the sky, the sea, the
  // light and the shade stay the week's own weather, because that is where its
  // temperature and its intensity are read. The race week is the anchor and
  // takes none of it.
  const wide = dial('craft.palettes', 0) >= 0.5;
  const sigList = SIGNATURE_WEATHER.find((band) => T <= band.max).list;
  const signature = wide && w.coast < 1
    ? sigList[(isoWeek(features.week) + weekHash(features.week)) % sigList.length]
    : null;

  let pal = coastPalette(ANCHOR.tempC / 30);
  for (const key of FAMILY_KEYS) {
    const wk = SEA_KEYS.has(key) ? wSea : w;
    const sig = signature ? (SIGNATURE_GROUND.has(key) ? SIG_GROUND : SIG_WEATHER) : 0;
    if (wk.coast >= 1 && !sig) continue;
    const c = pal[key].multiplyScalar(wk.coast * (1 - sig));
    for (const name in FAMILIES) if (wk[name] > 0) c.add(C(FAMILIES[name][key]).multiplyScalar(wk[name] * (1 - sig)));
    if (sig) c.add(C(FAMILIES_WIDE[signature][key]).multiplyScalar(sig));
  }

  // ---- ground.season and ground.soil: the week's place in the year and the
  // ground it was trained on, laid over the ground its weather left
  const stats = features.stats || {};
  const ownT = typeof stats.tempC === 'number' && Number.isFinite(stats.tempC) ? stats.tempC : null;
  const [, mo, dd] = String(features.week ?? '').split('-').map(Number);
  const seasonAmt = mo ? dial('ground.season', 0) * SEASON_GROUND : 0;
  // the race week's own palette: what the season's ground and the mineral's sea are laid as steps from
  const race = seasonAmt > 0 || dial('sea.mineral', 0) > 0 ? coastPalette(ANCHOR.tempC / 30) : null;
  let season = null, seasonLow = null;
  if (seasonAmt > 0) {
    const sCal = ((mo - 1 + ((dd || 1) - 1) / 30.44 - 0.5) / 2 + 6) % 6;   // 0 mid-January, 3 mid-July
    const sT = ownT == null ? sCal : sCal <= 3 ? 3 * clamp((ownT - 10) / 20, 0, 1) : 6 - 3 * clamp((ownT - 10) / 20, 0, 1);
    const s = (sCal + SEASON_TEMP * (sT - sCal) + 6) % 6;
    const i = Math.floor(s), f = s - i, a = SEASON_FAMILY[i], b = SEASON_FAMILY[(i + 1) % 6];
    for (const key of SIGNATURE_GROUND) shiftBy(pal[key], mixc(a[key], b[key], f), race[key], seasonAmt);
    shiftBy(pal.litWarm, mixc(a.litWarm, b.litWarm, f), race.litWarm, seasonAmt * SEASON_LIGHT);
    seasonLow = mixc(a.landLow, b.landLow, f);
    season = f < 0.5 ? `${SEASON[i]} ${pct(1 - f)}, ${SEASON[(i + 1) % 6]}` : `${SEASON[(i + 1) % 6]} ${pct(f)}, ${SEASON[i]}`;
  }
  const soilAmt = dial('ground.soil', 0) * SOIL_AMT;
  let soil = null;
  if (soilAmt > 0) {
    const share = { salt: sstep(0.62, 0.71, stats.indoor || 0) };
    share.sienna = (1 - share.salt) * sstep(360, 440, stats.climb || 0);
    share.gold = (1 - share.salt - share.sienna) * sstep(26.25, 27.75, ownT ?? 0);
    share.lichen = 1 - share.salt - share.sienna - share.gold;
    const ground = new THREE.Color(0, 0, 0);
    for (const k in share) ground.add(C(SOIL[k]).multiplyScalar(share[k]));
    // the soil is the season's ground too, let down to the soil's own value
    if (seasonLow) ground.lerp(dilute(seasonLow, lum(ground)), SOIL_SEASON);
    pal.dry.lerp(ground, soilAmt);
    soil = Object.entries(share).filter(([, x]) => x > 0.005).sort((p, q) => q[1] - p[1]).map(([k, x]) => `${k} ${pct(x)}`).join(', ');
  }

  // ---- intensity. An easy week keeps its hues but lifts its shadows, so the
  // contrast drops and the colour stays; a hard one sinks them and reddens
  // the rock.
  if (ease > 0) {
    lift(pal.shadeCool, 0.16 * ease);
    lift(pal.landHigh, 0.07 * ease);
  }
  if (harder > 0) {
    lift(pal.shadeCool, -0.05 * harder);
    pal.landHigh.lerp(C(0x8a4640), 0.25 * harder);
  }
  pal.calm = ease;

  // ---- the sea: more sweat is deeper water, less is a paler, shallower sea.
  // The whole sea moves together — the water underfoot with the water seen
  // from orbit — so a deep sea is a darker wash, not a louder pattern.
  const sw = clamp(Math.log2(Math.max(sweat, 1) / ANCHOR.sweat), -3, 2);
  const deeper = clamp(sw / 1.2, 0, 1), paler = clamp(-sw / 2, 0, 1);
  if (deeper > 0) {
    pal.teal.lerp(pal.cobalt, 0.55 * deeper);
    pal.seaShallow.lerp(pal.seaDeep, 0.22 * deeper);
    pal.seaDeep.lerp(pal.ink, 0.22 * deeper);
    pal.cobalt.lerp(pal.ink, 0.20 * deeper);
  }
  if (paler > 0) {
    pal.cobalt.lerp(pal.teal, 0.5 * paler);
    pal.seaDeep.lerp(pal.seaShallow, 0.45 * paler);
    pal.teal.lerp(pal.seaShallow, 0.35 * paler);
    pal.seaShallow.lerp(pal.paperWet, 0.15 * paler);
  }
  pal.seaCalm = 0.75 * deeper;

  // ---- the week's other sports: one mineral, each sport weighted by the
  // fourth power of its share so the dominant one speaks and two never make
  // a mud between them. It is a note, not a wash: the terrain lays it only in
  // the darkest creases of the rock, and the week's objects (the spires of a
  // strength session) carry it in their stone.
  let s4 = 0, sum = 0;
  const accent = new THREE.Color(0, 0, 0);
  for (const k in sport) {
    const sh = secs ? sport[k] / secs : 0;
    sum += sh;
    s4 += sh ** 4;
    accent.add(C(ACCENTS[k]).multiplyScalar(sh ** 4));
  }
  const accentAmt = s4 > 0 ? clamp(1.8 * sum, 0, 0.6) : 0;
  if (s4 > 0) accent.multiplyScalar(1 / s4);
  else accent.copy(pal.ink);
  pal.accent = accent;
  pal.accentAmt = accentAmt;
  // ---- sea.mineral: the water carries the same mineral, as far as the other
  // sports go; a week of running alone keeps its weather's sea
  const seaMin = s4 > 0 ? dial('sea.mineral', 0) * clamp(SEA_MINERAL * sum, 0, SEA_MINERAL_MAX) : 0;
  if (seaMin > 0) {
    for (const key of SEA_KEYS) {
      const sea = new THREE.Color(0, 0, 0);
      for (const k in sport) if (sport[k] > 0) sea.add(C(MINERAL_SEA[k][key]).multiplyScalar((sport[k] / secs) ** 4 / s4));
      shiftBy(pal[key], sea, race[key], seaMin);
    }
  }
  const swim = secs ? sport.swim / secs : 0;
  if (swim > 0) {
    const tq = clamp(swim * 4, 0, 0.6);
    pal.teal.lerp(C(ACCENTS.swim), tq);
    pal.seaShallow.lerp(C(0x5fb8ac), tq * 0.6);
  }
  // ---- the shore seen from orbit. Round five's damp coast — pooled ink, foam
  // and the sage of the drowned lowland along every shore — is the race week's
  // own weather; a week laid in other weather keeps its shallows clean: one
  // flat wash of its own shallow water, lifted a step for a shallow week and
  // sunk for a deep one (hue kept).
  pal.damp = sstep(0.7, 1, w.coast);
  const clean = pal.seaShallow.clone();
  lift(clean, 0.04 - 0.16 * deeper);
  pal.shelf = pal.landLow.clone().lerp(clean, 1 - pal.damp);

  // ---- the sky's own scheme, read from the same numbers, and nothing for the
  // race week. Heat lays a thin warm haze on the horizon — thicker the hotter
  // the week, in the hot family's own haze — pales the band beneath
  // it toward the paper, widens the lifted sun, and gives the clouds'
  // undersides the warmth of the ground. Sweat is the water in the week's air:
  // a wet week's clouds are bigger, a dry week's fewer and smaller. An easier
  // week's sky opens — its loaded glaze lifts off the top — unless its air is
  // wet enough to hold it down.
  const hot = w.desert + w.chalk;
  const weekHaze = hot > 0
    ? C(HAZE.desert).multiplyScalar(w.desert / hot).add(C(HAZE.chalk).multiplyScalar(w.chalk / hot))
    : pal.skyWash.clone();
  const hazeMix = P['pal.hazeMix'];
  pal.skyHaze = hazeMix === 1 ? weekHaze : pal.skyWash.clone().lerp(weekHaze, hazeMix);
  pal.skyBand.lerp(pal.paper, P['sky.bandHeat'] * heat);
  pal.cloudUnder.lerp(pal.landMid, P['sky.cloudHeat'] * heat);
  const glazeLift = P['sky.glazeEase'] * ease - P['sky.glazeWet'] * Math.max(0, sw - 0.5);
  const cloudSize = 2 ** (P['sky.cloudSweat'] * sw);
  pal.skyScheme = new THREE.Vector4(glazeLift, P['sky.heatHaze'] * heat, cloudSize, 1 + 0.8 * heat);
  // cold, dry air is where cirrus is combed out: more strokes to a station
  const cold = clamp((T0 - T) / (T0 - 2), 0, 1);
  pal.skyCirrus = Math.floor(2.5 + 4 * cold * clamp(-sw, 0, 1));

  // ---- the lowland: a patchwork of fields for a longer week, bare earth on
  // the page for a shorter one; a doubling of the time is two thirds of it
  pal.vegAmt = clamp(Math.log2(Math.max(minutes, 1) / ANCHOR.minutes) / 1.5, -1, 1);

  // ---- the world archetype's own repaint, if it has one. The week's palette
  // is finished here, and the readout below, the objects' palette at the end
  // and every uniform built from `pal` are all taken from the repainted one:
  // the wash names are the contract (litWarm, landMid, shadeCool, stone,
  // seaDeep, accent…), so a world that rewrites them is followed everywhere.
  // Repainting in place is the usual way; a world that answers with a palette
  // of its own is taken at its word.
  const world = resolvedWorld(features);
  if (world.palette) pal = world.palette(pal, features) || pal;

  // ---- what the palette says about the week, in words
  const named = Object.entries(w).filter(([, x]) => x > 0.005).sort((a, b) => b[1] - a[1]);
  const reasons = [
    `${tempC.toFixed(1)} °C average → ${named.map(([k, x]) => `${k} ${pct(x)}`).join(', ')}`
      + (signature ? `, under a ${signature} signature` : ''),
    `${pct(features.roughness)} of heart-rate time in zones 4–5, anaerobic ${anaerobic.toFixed(1)} → `
      + (harder > 0 ? `harder than the race week: deeper shadows, redder rock (${pct(harder)})`
        : ease > 0 ? `easier than the race week: lifted shadows, calm unbroken planes (${pct(ease)})`
          : `as hard as the race week: its contrast`),
    `${Math.round(minutes)} min active → ${pal.vegAmt > 0 ? `a patchwork of fields on the lowland (${pct(pal.vegAmt)})`
      : pal.vegAmt < 0 ? `bare umber earth on the page (${pct(-pal.vegAmt)})` : 'the lowland as the race week'}`,
    `${(sweat / 1000).toFixed(1)} L of sweat → ${deeper > 0 ? `deeper, darker, calmer water (${pct(deeper)})`
      : paler > 0 ? `paler, shallower water (${pct(paler)})` : 'the sea as the race week'}`,
    s4 > 0
      ? `${Object.entries(sport).filter(([, x]) => x > 0).map(([k, x]) => `${pct(x / secs)} ${k}`).join(', ')} → ${hexOf(accent)} in the rock's darkest creases and the week's stone (${pct(accentAmt)})`
        + (seaMin > 0 ? `, and its sea turned toward it (${pct(seaMin)})` : '')
      : 'no strength, swim, ride or other sport → no mineral in the rock',
    ...(season ? [`the week's month${ownT == null ? ', with no temperature: the calendar alone' : ` at ${ownT.toFixed(1)} °C`} → a ground of ${season}`] : []),
    ...(soil ? [`${pct(stats.indoor || 0)} under a roof, ${Math.round(stats.climb || 0)} m climbed → the driest ground ${soil}`] : []),
    `the sky → ${[
      heat > 0 ? `a heat haze along the horizon (${pct(heat)})` : '',
      cloudSize > 1.01 ? 'bigger clouds in wet air' : cloudSize < 0.99 ? 'smaller, fewer clouds in dry air' : '',
      glazeLift > 0.005 ? 'an open sky, its glaze lifted' : glazeLift < -0.005 ? 'a low, heavy sky' : '',
      pal.skyCirrus > 2 ? 'cirrus combed out in cold, dry air' : '',
    ].filter(Boolean).join(', ') || 'the race week\'s sky'}`,
  ];
  const info = {
    weights: Object.fromEntries(Object.entries(w).map(([k, x]) => [k, +x.toFixed(3)])),
    signature,
    inputs: { tempC: +tempC.toFixed(1), hard: +hard.toFixed(3), anaerobic: +anaerobic.toFixed(2), minutes: Math.round(minutes), sweatL: +(sweat / 1000).toFixed(1), cadenceSpm: cadenceSpm ? +cadenceSpm.toFixed(1) : null },
    colours: Object.fromEntries(['litWarm', 'landMid', 'shadeCool', 'landHigh', 'landLow', 'veg', 'bare', 'crest', 'dry', 'dark',
      'seaShallow', 'teal', 'seaDeep', 'skyDeep', 'skyWash', 'skyBand', 'cloudUnder', 'accent'].map((k) => [k, hexOf(pal[k])])),
    intensity: +step.toFixed(3),
    vegAmt: +pal.vegAmt.toFixed(3),
    accentAmt: +accentAmt.toFixed(3),
    ground: season,
    soil,
    seaMineral: +seaMin.toFixed(3),
    reasons,
  };
  pal.energy = clamp(features.energy, 0, 1.5);
  // The objects' palette is the week's, taken after the world has had its say:
  // one mineral note on the rock, nothing else.
  const objPal = { ...pal, landHigh: pal.landHigh.clone().lerp(accent, 0.55 * accentAmt) };
  return { pal, objPal, info, breath };
}

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
float inkF3b(vec3 p){ float s = 0.0, a = 0.5, n = 0.0; for (int i = 0; i < 2; i++){ s += a * inkN3(p); n += a; p = p * 2.03 + vec3(1.7, -2.3, 0.9); a *= 0.5; } return s / n; }
float inkF2(vec2 p){ float s = 0.0, a = 0.5, n = 0.0; for (int i = 0; i < 3; i++){ s += a * inkN2(p); n += a; p = p * 2.03 + vec2(1.7, -2.3); a *= 0.5; } return s / n; }

// A mark keeps its size on the sheet: one of world size s survives while it is
// worth drawing (about 2 px) and is not drawn at all past that. This single
// line is the whole of the distance LOD — a far ridge is one broad wash, a near
// slope is a hundred small ones.
float inkMark(float s, float fp){ return 1.0 - smoothstep(0.45, 0.95, fp / max(1e-5, s)); }

// Paper. Cold-press: the grains of the sheet, a fibre stretched along it, and
// the pressed sheet's own undulation beneath both. Fixed to the sheet, never to
// the world — and never a blotch: a few percent, at the size of a grain. Empty
// paper in a painting is nearly flat; the texture lives in the pigment.
float inkTooth(vec2 sp){
  float grain = inkH12(floor(sp * 0.85)) * 0.52
              + inkH12(floor(vec2(sp.x * 0.24, sp.y * 1.05) + 31.0)) * 0.30
              + inkH12(floor(vec2(sp.x * 1.15, sp.y * 0.20) + 71.0)) * 0.18;
  return clamp(grain * 0.64 + inkN2(sp * 0.34) * 0.36, 0.0, 1.0);
}
// The sheet itself: uneven the way a stretched sheet dries, a slow variation of
// absorbency at the scale of the sheet, carrying no mark of its own.
float inkSheet(vec2 sp){ return inkN2(sp * 0.0052 + 13.0); }
// the survey's chart: longitude across, and latitude down from the north pole,
// row for row as bakeSurvey lays it (a DataTexture's first row sits at v = 0)
vec2 inkUV(vec3 d){ return vec2(0.5 + atan(d.z, d.x) * 0.15915494, 0.5 - asin(clamp(d.y, -1.0, 1.0)) * 0.31830989); }
`;

// Aerial perspective is a change of colour, not a veil. Distance takes the
// warmth out of a wash and gives it back as one pale cool glaze taken from the
// sky's own blue, and it takes the wash's small structure with it — but not its
// light: a far crest keeps a pale lit side and a darker shade side inside that
// one glaze, so it sits in the air instead of reading as a flat cut-out. Nothing
// is laid over the picture — the pigment itself is cooler. The glaze is also
// kept below the paper of the horizon: a distance painted at the sky's own
// value has no silhouette left to give.
const AERIAL = /* glsl */ `
vec3 inkAerial(vec3 c, float dist, vec3 far, float base){
  float span = mix(130.0, 330.0, step(100.0, base));
  float f = smoothstep(base, base + span, dist) * 0.92;
  float lv = dot(c, vec3(0.32, 0.55, 0.13));
  vec3 cool = far * (0.80 + 0.32 * smoothstep(0.16, 0.94, lv));
  return mix(c, cool, f);
}
`;

// craft.paper. The sheet a poster leaves dry is one reserve in one place: a
// crescent along the lit limb, its outer edge the silhouette itself and its
// inner edge where the brush ran out. It is laid the same way over the land and
// over the sea — a limb is a limb whatever lies under it — and it is cut, never
// poured: the paper stops on the teeth of the run-out field, and the troughs of
// that field are a wash the brush only left light. Returns (paper, dried rim,
// edge depth, edge width), all zero with the dial off.
const CRESCENT = /* glsl */ `
vec4 inkCrescent(vec3 dW, vec3 V, vec3 L, float dial){
  if (dial <= 0.0) return vec4(0.0);
  // The band sits on the side of the disc the light comes from — the azimuth of
  // the poster's light about the eye — so it is a crescent on the lit limb and
  // not a halo round the rim. How much lit limb there is depends on how far off
  // the eye the light stands: a poster lit square on the eye has no lit limb at
  // all, and there the sheet is left dry in a thin broken rim that runs the
  // whole way round the disc — the dry edge of the drawing, not a highlight of
  // it. Between the two the band deepens and gathers onto the light's side.
  vec3 eye = normalize(cameraPosition);
  vec3 eSun = L - eye * dot(L, eye);
  vec3 rHat = dW - eye * dot(dW, eye);
  float sep = length(eSun);
  float az = dot(rHat, eSun) / max(1e-5, sep * length(rHat));
  float sunDeep = smoothstep(0.30, 0.74, sep);
  float sunSide = mix(1.0, smoothstep(0.04, 0.52, az), sunDeep);
  // how deep the pale band reaches, and where along it the brush stopped: the
  // run-out is a few marks wide and wanders, so no two weeks' crescents are the
  // same shape. The band is narrow — the last twelfth of the radius and less —
  // because the face keeps the sheet it had (see the caller): this is the dry
  // edge of the drawing, laid on top of it.
  float ran = inkF3(dW * 3.6 + 3.0);
  float hold = inkN3(dW * 1.5 + 29.0);
  float teeth = inkN3(dW * 11.0 + 61.0);
  float depth = mix(0.26, 0.46, sunDeep) + 0.05 * hold + 0.05 * (ran - 0.5) + 0.03 * (teeth - 0.5);
  float dl = abs(dot(dW, V));
  float dw = max(fwidth(dl) * 0.9, 1e-5);
  float inside = 1.0 - smoothstep(depth - dw, depth + dw, dl);
  // bare sheet where the brush left the sheet, a wash it only left light in the
  // troughs of the run-out: the break is crisp
  float bare = 0.34 + 0.66 * smoothstep(0.345, 0.375, ran);
  return vec4(inside * sunSide * bare * mix(0.78, 1.0, sunDeep) * dial,
              (1.0 - smoothstep(0.0, 2.0 * dw, abs(dl - depth))) * sunSide * dial,
              depth, dw);
}
`;

// light.terminator. What a globe lit by a real sun has and a flat-lit disc has
// not: a night side, and between the two a hand-cut edge. The boundary is not a
// circle of the light — it wanders at four scales, from the continent down to the
// brush, so no week's terminator is a parallel of the sun or a ruled chord across
// the disc — and it is a wash edge, not an outline: the pigment the night wash
// left as it stopped is gathered on the dark side of it, lifted in places as a
// brush leaves an edge, and left out entirely where the brush ran dry. The night
// itself is laid in two washes, the way a watercolour dark is: one over the whole
// of it, and a second, deeper one gathered away from the terminator on a hand-cut
// edge of its own. The sun-side face needs none of this, so nothing is computed
// over most of it.
// Returns (night, the pooled edge, the second wash), each zero in daylight.
// motion.living lets the edge breathe (see the block inside); with the dial down
// it is the same sum, to the bit. light.night redraws the edge for a deep night
// (see the two blocks inside); with that dial down they are stepped over too.
const NIGHT = /* glsl */ `
vec3 inkNight(vec3 dW, vec3 light){
  float nd = dot(dW, light);
  if (nd > 0.34) return vec3(0.0);
  float wob = (inkF3(dW * 3.1 + 2.0) - 0.5) * 0.13
            + (inkN3(dW * 9.5 + 7.0) - 0.5) * 0.045
            + (step(0.58, inkN3(dW * 21.0 + 11.0)) - 0.42) * 0.045
            + (step(0.50, inkN3(dW * 47.0 + 23.0)) - 0.50) * 0.014;
  // light.night: a deep night shows every bite of that cut against the day, and
  // the two finest scales read as cut paper. There the line wanders on a few
  // broad lobes of the wash's own run instead, and (below) it dries over a few
  // pixels of translucent wash rather than one, with the pigment it pooled left
  // in occasional hard deposits along it.
  if (uNight > 0.0) {
    float lobes = (inkF3(dW * 3.1 + 2.0) - 0.5) * 0.13 + (inkN3(dW * 6.5 + 7.0) - 0.5) * 0.07;
    wob = mix(wob, lobes, uNight);
  }
  // the line the first wash dried on. motion.living breathes THAT line (below),
  // and only that line: the second, deeper wash is gathered off the edge as it
  // was first laid, so what moves is the near side of the terminator and its
  // pigment, never the interior of the dark mass, which is a settled weight in
  // the picture and has to stay one.
  float sBase = -(nd + wob);
  float s = sBase;
  // motion.living: the edge breathes. The wash that stopped on this line is
  // still settling — the whole cut creeps in and out with the picture's own
  // slow beat (uPulse.w), and by a differing amount along its length, on one
  // more tap of the same noise taken far below the four scales above it — so
  // what moves is a line being re-laid, never a circle being scaled. Three or
  // four pixels of arc at the poster's size, and with the dial down this whole
  // block is stepped over and s is the sum it has always been, to the bit.
  if (uLiving > 0.0) {
    s += uLiving * (0.018 * (uPulse.w * 2.0 - 1.0)
                  + 0.007 * (inkN3(dW * 2.3 + 17.0 + uTime * 0.06) - 0.5));
  }
  float w = max(0.55 * fwidth(s), 0.0028);
  float wn = w;
  if (uNight > 0.0) wn *= 1.0 + uNight * (2.0 + 5.0 * inkN3(dW * 4.3 + 37.0));
  float night = smoothstep(-wn, wn, s);
  // where the wash stopped: a bank of pigment along the edge, lifted into gaps
  // where the brush came off the sheet and loaded where it was pressed
  float held = step(0.30, inkN3(dW * 13.0 + 3.0)) * step(0.42, inkN3(dW * 33.0 + 9.0));
  if (uNight > 0.0) held = mix(held, step(0.56, inkN3(dW * 7.0 + 3.0)), uNight);
  float edge = (1.0 - smoothstep(0.0, 2.6 * w, abs(s))) * held * (0.5 + 0.8 * inkN3(dW * 60.0 + 29.0)) * night;
  // the second wash: deeper water, gathered well inside the first, on an edge of
  // its own — read off the line as it was first laid (sBase), so the breathing
  // of the terminator never scales the dark mass with it
  float deep2 = smoothstep(-w, w, sBase - 0.30 - 0.28 * inkF3(dW * 1.9 + 9.0));
  return vec3(night, edge, deep2);
}
`;

// pal.caps. The sheet is only left dry where leaving it dry means something: at
// the poles, where the ice is, and on the true heights above the snow line. The
// cap is a latitude of the planet's own axis — so it turns with the world and
// not with the picture — and its size is the week's own coldness: a week in the
// mid twenties wears none, one in the mid teens wears it down past the sixties.
//
// Its edge is not a parallel of the equator, though: it is cut at four scales,
// from the lobes of a continent to the brush, and the ground has the last word
// in it — ice holds on the land that stands above the sea and lets go of the
// water and of the low shore, so a ridge draws a tongue out of the cap and a bay
// reaches in where the country falls away. The snow line drops with the cold in
// the same way, measured on the ground's true height above the sea (which is not
// the height the orbit mesh draws: its relief is capped, and a capped summit
// still deserves its snow) — and snow lies only on steep, high ground, on flanks
// and crests in the shapes a range makes, so a cold week wears its caps on its
// summits and its plains stay ground.
//
// On the water the cap is not the land's sheet carried out past the shore: sea
// ice is pack — plates that froze, drifted and broke — and it lies only on a
// week that was genuinely cold, so a mild one leaves the polar sea open. Its
// edge is cut on the same line the land's cap stops on, so the two meet at the
// coast instead of crossing on it, and inside it the cover closes from the
// scattered floes of a marginal zone to a sheet with channels through it.
//
// A warm week returns nothing and costs nothing. `above` is the height above the
// sea in world units; `face` is how square-on the surface faces the eye — one in
// the middle of the disc, nought at the limb — because every edge drawn here is a
// few units of the ground across and at the rim the sheet holds a hundred of them
// in one pixel. Nothing is drawn inside the ice at all: the line belongs to the
// edge the wash stopped on, and a snowfield's patches are wash boundaries, not
// outlines, so a cap carries no drawing but the hollows of its own wash.
// Returns (mask, the cut line, the pigment the wash left just outside it).
const CAPS = /* glsl */ `
// The line the ice stops on: the planet's own surface at four scales — the lobes
// of a continent, a bay, a coast, the brush — so that no edge of ice is ever a
// rule laid across the world. The land's sheet and the sea's pack are cut on the
// same line, so the two meet at the coast rather than crossing on it. The two
// finest scales are let go of at the rim of the disc, where the sheet holds them
// in less than a pixel and they would only fray the edge into a fringe.
float inkIceCut(vec3 dW, float face){
  return (inkF3(dW * 2.2 + 13.0) - 0.5) * 0.26
       + (inkF3(dW * 4.6 + 31.0) - 0.5) * 0.14
       + (inkN3(dW * 10.0 + 5.0) - 0.5) * 0.055
       + (inkN3(dW * 24.0 + 41.0) - 0.5) * 0.014 * face;
}
// A break in the ice: a threshold through a noise field, cut at a fixed width
// because the field is read at a mark's scale and never at the pixel's — what
// falls inside a pixel of the sheet is not blurred into a grey no brush ever
// made, it is simply not drawn (see inkMark).
float inkBreaks(float n, float thr, float w){
  return smoothstep(thr - w, thr + w, n);
}

vec3 inkCaps(vec3 dW, float above, float warm, float tooth, float steep, float face){
  // The year the shelf actually holds runs from about fifteen degrees to thirty,
  // so the cold is read against that: the coldest weeks wear the caps, a week in
  // the twenties wears none. (A synthetic or wintry week below fifteen simply
  // reads as cold as the scale goes.)
  float cold = clamp((26.0 - warm * 30.0) / 18.0, 0.0, 1.0);
  float cw = cold * cold * (3.0 - 2.0 * cold);
  if (cw < 0.02) return vec3(0.0);
  float lat = abs(dW.y);

  // The ground's own say in the edge. Ice lies where the land holds it: ground
  // that stands above the sea reaches the ice further from the pole and draws a
  // tongue out of the cap, and the flat shore with the water lets it go. Before
  // this term a cap was one latitude with a wobble on it; with it, the outline is
  // the country under the ice — a ridge and its foothills, a basin biting in.
  float hold = (smoothstep(0.30, 4.2, above) - 0.34) * 0.115;

  float capAt = lat - mix(1.07, 0.72, cw) - inkIceCut(dW, face) + hold;
  // One width for the whole edge, taken from the edge's own gradient: where the
  // cut turns fast — over a ridge, across a bay — the line gives way instead of
  // breaking into a stair of sub-pixel noise. The tooth of the sheet is added
  // inside that width, so the ice still stops on a dry edge.
  float lw = max(1.1 * fwidth(capAt), 0.0022);
  float cap = smoothstep(-lw, lw, capAt + (tooth - 0.5) * 0.6 * lw);

  // The line falls fast, because the heights the shelf actually holds fall the
  // other way: the cold weeks are its short ones — their ranges top out a handful
  // of units above the sea — and the tall ranges belong to the long, hot weeks,
  // whose snow line is high. Read this way, a cold week wears a cap on the hills
  // it has and a hot one wears none until the ground stands very high indeed.
  // A week's snow is on its RIDGES, though: a line low enough to touch the hills
  // of a short, cold week would also flood every flat high plain with one pale
  // slab, so nothing lies above the line but steep ground — flanks and crests, in
  // the shapes a range makes — and the plain inside the line stays ground.
  float line = 30.0 * pow(1.0 - cw, 2.4) + 3.0 + 2.2 * (inkF3(dW * 4.2 + 3.0) - 0.5)
             + 0.9 * (inkN3(dW * 11.0 + 29.0) - 0.5);
  float snowBase = above - line;
  float sw = max(1.3 * fwidth(snowBase), 0.020);
  float snow = smoothstep(-sw, sw, snowBase + (tooth - 0.5) * 0.65 * sw)
             * smoothstep(0.07, 0.27, steep);

  // Where a wash stopped, its pigment stands a little way outside the edge it
  // stopped on: a few pixels of the week's shade, coming off in dabs as a loaded
  // brush does — never a second outline, and cut on the cap's own edge only,
  // because the snow's edge is a wash boundary and nothing else.
  float pw = max(3.0 * fwidth(capAt), 0.010);
  float dabs = inkBreaks(inkN3(dW * 9.0 + 43.0) * 0.65 + inkN3(dW * 21.0 + 19.0) * 0.35, 0.47, 0.035);
  float pool = clamp((smoothstep(-pw, pw, capAt) - cap) * dabs * face, 0.0, 1.0);

  // the line the wash stopped on, broken where the brush came off the sheet, and
  // gone at the rim with the dabs and the finest cut
  float broken = inkBreaks(inkN3(dW * 17.0 + 17.0), 0.44, 0.03);
  float cutLine = cap * (1.0 - cap) * 4.0 * broken * face;

  return vec3(max(cap, snow), cutLine, pool);
}

// pal.caps on the water. Sea ice is not the land's sheet carried out past the
// shore: it is pack — plates that froze, drifted and broke — and it lies only on
// a week that was genuinely cold, so a mild one leaves the polar sea open. Its
// edge is cut on the same line the land's cap stops on; inside it the cover
// closes from the scattered floes of a marginal zone to a sheet with channels
// cut through it and open water in them, so ice on the water reads as pack and
// never as a pale ring laid round the world. No line is drawn anywhere on it: a
// floe is a wash of the sheet, and its edge is only where the wash ran out.
// Returns (ice, the slush the plates left outside them).
vec2 inkPack(vec3 dW, float warm, float tooth, float face){
  float cold = clamp((26.0 - warm * 30.0) / 18.0, 0.0, 1.0);
  float cw = cold * cold * (3.0 - 2.0 * cold);
  float pack = smoothstep(0.42, 0.80, cw);
  if (pack < 0.04) return vec2(0.0);
  float lat = abs(dW.y);

  // the pack drifts as well as freezes, so its edge wanders a little further than
  // the land's — what floats answers to a current and not only to the cold — and
  // it stops just inside the land's cap, so the ice on the water and the ice on
  // the coast are one sheet's two materials with a lead between them at most
  float zoneAt = lat - mix(1.07, 0.72, pack) - 0.01 - inkIceCut(dW, face)
               - (inkN3(dW * 19.0 + 7.0) - 0.5) * 0.05 * face;
  float zw = max(2.4 * fwidth(zoneAt), 0.007);
  float zone = smoothstep(-zw, zw, zoneAt + (tooth - 0.5) * 0.6 * zw);
  // how far in from the margin the water is: the deeper into the pack, the more
  // of it has closed, and a milder week never closes it at all — its threshold
  // sits above the noise, so only the strongest plates of a marginal zone form
  float depth = smoothstep(0.0, 0.20, max(0.0, zoneAt));
  float floeN = inkF3(dW * 5.0 + 83.0) * 0.60 + inkN3(dW * 12.0 + 97.0) * 0.28
              + inkN3(dW * 30.0 + 11.0) * 0.12 * face;
  float thr = mix(0.60, 0.38, depth) + (1.0 - pack) * 0.30;
  float ice = inkBreaks(floeN, thr, 0.035) * zone;
  // the plates that come off the margin are shoals of slush: a wet edge a few
  // pixels wide, where the sheet's wash ran out into the water
  float pw = max(2.0 * fwidth(floeN), 0.016);
  float wet = clamp((smoothstep(thr - pw, thr + pw, floeN) - ice) * zone * face, 0.0, 1.0);
  return vec2(ice, wet);
}
`;

const PLANET_VERT = /* glsl */ `
attribute float aHeight;
attribute float aSlope;
attribute float aRace;
attribute float aRange;
attribute float aSea;
attribute float aMacro;    // the macro height: the ground without route or fine detail
uniform float uLimb;       // craft.limb: how much of the outer disc is drawn as the swell
uniform float uSurface;    // 0 from orbit, 1 underfoot (the ground patch is the ground there)
varying vec3 vW;
varying vec3 vN;
varying float vH;
varying float vSlope;
varying float vRace;
varying float vRange;
varying float vSea;
void main(){
  vH = aHeight; vSlope = aSlope; vRace = aRace; vRange = aRange; vSea = aSea;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  // craft.limb. A few units of the mesh's own relief is a tenth of the radius
  // out at the rim of the disc, and it is the rim the eye reads a globe by: a
  // mountain poking past the macro swell chews the silhouette. With the dial
  // up, the outer edge of the disc is drawn from the macro height instead — the
  // ground's broad shape, no route, no fine noise — so the rim is the swell,
  // one smooth curve, and the wash pass and the contour find that curve the way
  // they always do: from the depth this mesh drew. The disc's own normal
  // decides where its rim is, so a bump inside the disc keeps its relief. None
  // of it is drawn underfoot or from close in: the ground patch is the ground
  // there, it is not a silhouette, and it carries no macro height — so the
  // swell is only ever asked for at the poster's distance.
  float k = uLimb * (1.0 - clamp(uSurface, 0.0, 1.0)) * smoothstep(300.0, 520.0, distance(cameraPosition, wp.xyz));
  if (k > 0.0) {
    vec3 dW = normalize(wp.xyz);
    vec3 V = normalize(cameraPosition - wp.xyz);
    // the window is the rim itself — the last five hundredths of the radius —
    // so the silhouette settles into one curve while the country it was made of
    // is still drawn right up to it
    float edge = 1.0 - smoothstep(0.03, 0.24, abs(dot(dW, V)));
    wp = modelMatrix * vec4(mix(position, dW * (${R}.0 + aMacro), k * edge), 1.0);
  }
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SEA_VERT = /* glsl */ `
varying vec3 vW;
varying vec3 vN;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const TERRAIN_FRAG = /* glsl */ `
uniform vec3 uSunDir, uLight;
uniform vec3 uFillDir;
uniform vec3 uPaper, uPaperWet, uInk, uInkSoft, uSepia, uLandLow, uLandMid, uLandHigh, uCrest;
uniform vec3 uVerm, uFarGlaze, uSeaShallow, uSeaDeep, uLitWarm, uShadeCool, uSkyBand, uSkyWash, uVeg;
uniform vec3 uBare, uDry, uAccent, uDark;
uniform float uWarmth, uSeaLevel, uTime, uFogBase, uSurface, uVegAmt, uAccentAmt, uCalm, uCrescent, uValues;
uniform float uTerm, uCaps;    // light.terminator, pal.caps (see inkNight, inkCaps)
uniform float uNight;          // light.night: how deep that night goes (see the last wash)
uniform float uLiving;         // motion.living: with it at 0 every term below is left out
uniform float uCloudShade;     // sky.cloudShade: the weather's shadows on the land underfoot
uniform vec3 uSkyE;            // … read off the sky's own chart and drift (SKY_FRAG)
uniform vec4 uSkyScheme;
uniform float uCloudRate, uCloudBand;
uniform float uAerial;         // light.aerial: the distance underfoot fitted to the horizon (see farT)
uniform float uForm;           // light.form: the globe's turn inside its three values (see its block)
uniform vec4 uPulse;           // its four beats: settlement glow, aurora, sea glitter, edge breath
uniform sampler2D tSun, tLand;
varying vec3 vW;
varying vec3 vN;
varying float vH;
varying float vSlope;
varying float vRace;
varying float vRange;
varying float vSea;
${NOISE}
${AERIAL}
${CRESCENT}
${NIGHT}
${CAPS}
void main(){
  vec3 n = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float dist = distance(cameraPosition, vW);
  float fp = max(1e-4, length(fwidth(vW)));      // world size of one pixel here
  float hRel = vH;
  // light.aerial: how far into the distance this ground stands, fitted to the
  // world's own horizon (hz, the eye's tangent distance to the sea) and read
  // from a little past the runner, so the nearest ridge keeps all of itself:
  // farT is 0 there and 1 a little past the horizon, farF that under the dial
  float hz = sqrt(max(dot(cameraPosition, cameraPosition) - (120.0 + uSeaLevel) * (120.0 + uSeaLevel), 1.0));
  float farT = smoothstep(uFogBase + 4.0, max(uFogBase + 24.0, 1.35 * hz), dist);
  float farF = uAerial * uSurface * farT;

  // ---- the painted form. A hill is stated as two or three planes, never as the
  // mesh's own facets under a lambert term. Underfoot the surface's own
  // interpolated normal leads, because the ground there is a fine grid and it
  // knows what it is doing; the survey only supplies the broad form it is read
  // at, on a step that grows with the distance, so that a mountain on the far
  // side of the world — where the mesh really is 1 u facets — is read as one
  // mass instead of a scatter of triangles.
  vec3 dW = normalize(vW);
  vec3 eE = normalize(cross(vec3(0.0, 1.0, 0.0), dW) + vec3(1e-4, 0.0, 0.0));
  vec3 eN = normalize(cross(dW, eE));
  vec2 uvS = inkUV(dW);
  float su = clamp(2.4 + 0.06 * dist, 2.4, 34.0);
  // the survey's chart runs west in u and south in v (inkUV), so the taps a
  // step east and north of here are at -u and -v; a step east is a wider
  // stretch of u the nearer it lies to a pole
  float cu = su / (6.2831853 * 120.0 * max(length(dW.xz), 0.05)), cv = su / (3.14159265 * 120.0);
  float hE1 = texture2D(tLand, uvS - vec2(cu, 0.0)).r, hE0 = texture2D(tLand, uvS + vec2(cu, 0.0)).r;
  float hN1 = texture2D(tLand, uvS - vec2(0.0, cv)).r, hN0 = texture2D(tLand, uvS + vec2(0.0, cv)).r;
  float dhE = hE1 - hE0, dhN = hN1 - hN0;
  // is there water within a form's step of here? A waterline is only drawn
  // where there is water for it to be the edge of.
  float wetNear = step(min(min(hE1, hE0), min(hN1, hN0)), 0.0);
  vec3 nForm = normalize(dW - eE * (dhE / su) - eN * (dhN / su));
  float nFormW = mix(0.30, 0.75, 1.0 - smoothstep(2.0, 40.0, dist));
  vec3 nSh = normalize(nForm + nFormW * (n - nForm));
  float steep = smoothstep(0.10, 0.34, length(vec2(dhE, dhN)) / su);
  float fpS = fp / su;                                  // a pixel, measured in the form
  float mark = 1.0 - smoothstep(0.30, 1.10, fpS);        // is the form bigger than a mark?
  float tooth = inkTooth(gl_FragCoord.xy);               // the sheet, at the pixel
  // how square-on the ground faces the eye: one in the middle of the disc, nought
  // at the limb. pal.caps reads it, because every edge the ice has is a few units
  // of the ground across and the rim of the disc holds a hundred of them in one
  // pixel (see inkCaps).
  float iceFace = smoothstep(0.10, 0.42, abs(dot(dW, V)));


  // ---- one light and the sky's own light, and the ridge's cast shadow baked
  // in behind them. The light a painter has to work with is one number between
  // shade and full sun: measured from the sky's own weaker light up to the sun,
  // and every step of the plan is cut out of it. A field at dusk is still a
  // field, so the floor is the sky's light — never a black. (uLight is the sun
  // underfoot; from orbit it may be turned toward the eye. From orbit a ridge's
  // cast shadow is a sliver, not a shape, and the bake is let go.)
  float ndl = dot(nSh, uLight);
  float nfl = dot(nSh, uFillDir);
  float shadowRaw = texture2D(tSun, uvS).r;
  float shadowAA = max(0.55 * fwidth(shadowRaw), 0.0012);
  float sunSh = smoothstep(0.50 - shadowAA, 0.50 + shadowAA, shadowRaw) * uSurface;
  float afar = smoothstep(120.0, 430.0, dist);
  // the sun's own term runs past the terminator, so that a face turned
  // three-quarters into the sun is not the same wash as one facing it, and only
  // the second one leaves the sheet nearly dry. A cast shadow costs one step of
  // value wherever it falls.
  float skyLight = 0.34 + 0.30 * (0.5 + 0.5 * nfl);
  float light = mix(skyLight, 1.0, smoothstep(-0.42, 1.10, ndl)) - 0.30 * sunSh;
  // light.night: a deep night is a hard light. The day beside it is lit nearly
  // to the terminator — the sliver a sun past the limb leaves is the brightest
  // ground on the sheet, never a dusk — and the night does the shading the
  // globe needs. From orbit only: underfoot the sun is the sun.
  if (uNight > 0.0) {
    float hard = mix(skyLight, 1.0, smoothstep(-0.25, 0.50, ndl)) - 0.30 * sunSh;
    light = mix(light, hard, uNight * uTerm * (1.0 - clamp(uSurface, 0.0, 1.0)));
  }

  // a wash boundary is not a contour of the light: it wanders, at the scale of
  // the form rather than of the pixel, so no two steps of the plan are parallel
  // and none of them is a contour line of the terrain. On flat ground that
  // wander is the only structure there is, which is exactly how a field is laid
  // in — a second wash over the first.
  //
  // How broken the washes are is the week's intensity. A week as hard as the
  // race is laid as the race week is: broken washes that wander across every
  // face. An easier week is laid calm (uCalm): underfoot the value belongs to
  // the plane it is laid on — the face turned to the sun one wash, the face
  // turned away another, the ridge's cast shadow a third — and the wander only
  // roughens the edges between them.
  float calm = uCalm * uSurface;
  float wf = 0.55 / su;
  float bA = inkF3(vW * wf + 5.0);
  float bB = inkN3(vW * wf * 3.7 + 9.0);
  float wander = (bA - 0.5) * mix(0.28, 0.06, calm) + (bB - 0.5) * 0.12 * (1.0 - afar);
  float t = light + wander;
  // In a calm week each step of the plan is read at its own scale. The deepest
  // accents keep the fine form, where the ground really creases. The shade
  // step is read off the survey's form, and the mesh's own form speaks there
  // only where it disagrees by more than a bump could — a cliff turned from
  // the sun keeps its plane, a knoll does not. The two lit steps are read off
  // a form three times broader, so a knoll the sun touches on a lit face does
  // not start a new patch. A face is one wash from fold to fold.
  float tMid = t, tHi = t;
  if (calm > 0.001) {
    float tForm = mix(skyLight, 1.0, smoothstep(-0.42, 1.10, dot(nForm, uLight))) - 0.30 * sunSh + wander;
    float dF = t - tForm;
    tMid = mix(t, tForm + dF * smoothstep(0.15, 0.40, abs(dF)), calm);
    float sb = su * 3.0;
    float cb = 3.0 * cu, cbv = 3.0 * cv;
    float dhEb = texture2D(tLand, uvS - vec2(cb, 0.0)).r - texture2D(tLand, uvS + vec2(cb, 0.0)).r;
    float dhNb = texture2D(tLand, uvS - vec2(0.0, cbv)).r - texture2D(tLand, uvS + vec2(0.0, cbv)).r;
    vec3 nB = normalize(dW - eE * (dhEb / sb) - eN * (dhNb / sb));
    tHi = mix(t, mix(skyLight, 1.0, smoothstep(-0.42, 1.10, dot(nB, uLight))) - 0.30 * sunSh + wander, calm);
  }

  // ---- the lowland. Level ground gives a plan nothing to shape, and a plan
  // laid on nothing is a field of puddles. A painter lays one warm ochre wash
  // and drags two or three long slate strokes across it. The strokes belong to
  // the world: bands across the great circles through the sun, so each points
  // down the fall of the light wherever it lies, and nothing moves with the eye.
  // They are a plain seen across, from the ground: seen from over it (a camera
  // coming down) they would rule it with long dark stripes, so they thin to
  // nothing as the view steepens past anything the chase camera looks down at,
  // and the warm wash under them is left on its own.
  float flatK = uSurface * (1.0 - smoothstep(0.015, 0.060, vSlope)) * (1.0 - smoothstep(6.0, 10.0, vSea));
  if (flatK > 0.001) {
    vec3 sA = normalize(uSunDir);
    vec3 sB = normalize(cross(sA, abs(sA.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 sC = cross(sA, sB);
    float cz = clamp(dot(dW, sA), -1.0, 1.0);
    float along = asin(cz) * 120.0;                             // down the light, in units
    float qa = atan(dot(dW, sC), dot(dW, sB)) * 6.3661977;      // 40 lanes round the sun's axis
    float lane = floor(qa);
    float l1 = inkH12(vec2(lane, 3.0)), l2 = inkH12(vec2(lane, 7.0)), l3 = inkH12(vec2(lane, 13.0));
    float laneW = 18.8496 * sqrt(max(1e-4, 1.0 - cz * cz));      // the lane's width here, in units
    float wob = (inkN2(vec2(along * 0.045, lane * 1.7)) - 0.5) * 0.28;
    float off = (fract(qa) - 0.5 - (l1 - 0.5) * 0.45 - wob) * laneW;
    float run = inkN2(vec2(along * 0.018 + lane * 5.3, 2.0));
    float half_ = (0.25 + 0.55 * l2) * smoothstep(0.50, 0.62, run) * step(0.50, l3);
    float sdS = abs(off) - half_;
    float aaS = max(fwidth(sdS), 1e-3) * 0.75;
    float strokeS = (1.0 - smoothstep(-aaS, aaS, sdS)) * step(0.05, half_) * (1.0 - smoothstep(0.75, 0.95, dot(dW, V)));
    // The base stays warm even when the whole plain faces away from the sun:
    // only the decisive directional strokes spend slate (light.aerial: less of
    // it the further off, so a far plain is not ruled with them)
    strokeS *= 1.0 - 0.8 * farF;
    t = mix(t, mix(0.72, 0.30, strokeS), flatK);
    tMid = mix(tMid, mix(0.72, 0.30, strokeS), flatK);
    tHi = mix(tHi, mix(0.72, 0.30, strokeS), flatK);
  }

  // a boundary is normally crisp. One occasional distant edge is allowed to
  // bleed while it is still wet; the rest keep the hard dried edge of gouache.
  float bleedEdge = smoothstep(0.77, 0.91, inkF3(dW * 3.2 + 17.0)) * smoothstep(65.0, 220.0, dist);
  // Orbit retains round 5's compact antialias floor; underfoot P1 keeps every
  // edge to the light's own step so a slow field cannot grow a soft halo.
  float floorK = mix(0.08, 1.0, uSurface);
  float softR5 = max((0.38 + 1.25 * bleedEdge) * fwidth(t), (0.0012 + 0.0050 * bleedEdge) * floorK);
  float softP1 = (0.38 + 1.25 * bleedEdge) * max(fwidth(t), 1e-5) + 0.0050 * bleedEdge;
  float soft = mix(softR5, softP1, uSurface);
  float e1 = smoothstep(0.24 - soft, 0.24 + soft, t);
  float softMid = mix(soft, (0.38 + 1.25 * bleedEdge) * max(fwidth(tMid), 1e-5) + 0.0050 * bleedEdge, uSurface);
  float softHi = mix(soft, (0.38 + 1.25 * bleedEdge) * max(fwidth(tHi), 1e-5) + 0.0050 * bleedEdge, uSurface);
  float e2 = smoothstep(0.42 - softMid, 0.42 + softMid, tMid);
  float e3 = min(e2, smoothstep(0.62 - softHi, 0.62 + softHi, tHi));
  // a calm week lays its sunlit faces in the light wash and reserves the paper
  // only where the sun is square on, so a big lit face is never a blank sheet
  float dryAt = 0.82 + 0.10 * calm;
  float e4 = min(e3, smoothstep(dryAt - softHi, dryAt + softHi, tHi));

  // ---- craft.paper. The reserve above is the lit face: the poster's light is
  // turned toward the eye (see update), so the sun is square on the middle of
  // the disc and every week's globe holds a large pale centre. With the dial up
  // that centre stays as it was — the picture's light is not taken away from it
  // — and a crescent is laid on top: the sheet reserved along the lit limb too,
  // the one place on a disc where the ground really is nearly edge-on to the
  // eye. Its outer edge is the silhouette and its inner edge is where the brush
  // ran out, ragged and a twelfth of the radius or less, so it reads as the
  // dried edge of the drawing rather than a second, smaller reserve. Its wash is
  // bare sheet on the crests of the run-out and a wash the brush only left light
  // in the troughs, its inner edge carries a pooled rim, and it is never laid
  // over the sea: what lies across the water's limb is the water's own graze.
  // Underfoot nothing of it moves: a crescent belongs to a disc, not to a
  // valley, and the ground the runner walks is not a poster.
  float crescent = 0.0, cresRim = 0.0;
  if (uCrescent > 0.0) {
    float orbit = 1.0 - clamp(uSurface, 0.0, 1.0);
    vec4 cres = inkCrescent(dW, V, uLight, uCrescent);
    crescent = cres.x * orbit;
    cresRim = cres.y * orbit;
    // the reserve the lit face already had stays where it is — the crescent is
    // laid on top of it, as a dry edge laid last, and never takes the sheet
    // away from the middle of the drawing
    e4 = mix(e4, max(e4, crescent), uCrescent * orbit);
  }

  // ---- pal.caps and light.terminator are read here, before the washes are
  // laid, because both decide what those washes are: the sheet the caps own —
  // at the poles and above the snow line, cut on a wandering edge of the
  // planet's own axis (see inkCaps) — and the night the light leaves, which is
  // one hand-cut boundary (see inkNight). Underfoot the night is the runner's
  // own ground: the sun is the sun there, and no poster light is turned.
  float orbitK = 1.0 - clamp(uSurface, 0.0, 1.0);
  float capK = 0.0, capLine = 0.0, capPool = 0.0;
  if (uCaps > 0.0) {
    vec3 cp = inkCaps(dW, vSea, uWarmth, tooth, steep, iceFace);
    capK = cp.x * uCaps;
    capLine = cp.y * uCaps;
    capPool = cp.z * uCaps;
  }
  float nightK = 0.0, termEdgeK = 0.0, deepK = 0.0;
  if (uTerm > 0.0 && orbitK > 0.0) {
    vec3 nt = inkNight(dW, uLight);
    nightK = nt.x * uTerm * orbitK;
    termEdgeK = nt.y * uTerm * orbitK;
    deepK = nt.z * uTerm * orbitK;
  }
  // what the sheet is left dry for. The lit face's reserve the plan always had
  // is what the caps dial gives back, so the two fade through each other, and
  // craft.paper's crescent is carved out of it either way: one reserve is not
  // the other's to take.
  float resK = max(crescent, mix(e4, capK, uCaps));
  // the ice's own shadow: a cap's night side is one cool wash laid over the
  // sheet, flat and on the cap's own edge
  float capNight = clamp(nightK * capK, 0.0, 1.0);

  // ---- the lowland's own colour, which the week sets, on its low, gentle
  // ground only. The week's volume lays it as a few broad washes, each on a
  // hand-cut edge — a district of the lowland, more of them the further the
  // week's time is from the race week's — so from orbit it is a shape, never
  // a tint over everything.
  //
  // A longer week's districts are fields (uVegAmt > 0). Up close a district is
  // a patchwork of parcels, each one flat wash in one of two tones, parted by
  // hedges: a line of the brush, the same on the sheet near or far, never a
  // strip of the world that widens as the eye comes down to it. It wanders a
  // little along its run, swells and thins, breaks where the brush lifted, and
  // gathers in a dab where two hedges meet. From orbit a district is one wash:
  // parcels a few pixels across would only make a hatch of it.
  //
  // A shorter week's are bare umber earth on the page (< 0): loose washes in
  // two tones and the page between them. No parcels, no ruled lines: bare
  // ground has no field walls.
  float lowAmt = abs(uVegAmt);
  float parcel = 0.0, hedge = 0.0, page = 0.0, tone = 0.0, lowFlat = 0.0, parcelRim = 0.0;
  if (lowAmt > 0.001) {
    float lowS = mix(3.0, 12.0, lowAmt) + 3.0 * (inkN3(vW * 0.08 + 29.0) - 0.5) - vSea;
    float gentleS = 0.11 - vSlope;
    float ground = smoothstep(-max(fwidth(lowS), 1e-3), max(fwidth(lowS), 1e-3), lowS)
                 * smoothstep(-max(fwidth(gentleS), 1e-4), max(fwidth(gentleS), 1e-4), gentleS)
                 * step(0.0, vSea);
    float ds = inkF3(vW * 0.03 + 23.0) + 0.08 * (inkN3(vW * 0.3 + 7.0) - 0.5)
             - (uVegAmt > 0.0 ? mix(0.64, 0.38, lowAmt) : mix(0.64, 0.50, lowAmt));
    float dw = max(fwidth(ds), 1e-5);
    float district = ground * smoothstep(-dw, dw, ds);
    float districtRim = district * (1.0 - smoothstep(1.0, 2.6, ds / dw));
    if (uVegAmt > 0.0) {
      float lod = smoothstep(18.0, 48.0, 1.0 / max(fp * 0.13, 1e-4)) * uSurface;   // a parcel's size on the sheet
      vec3 warp = vec3(inkN3(vW * 0.05 + 3.0), inkN3(vW * 0.05 + 11.0), inkN3(vW * 0.05 + 19.0)) - 0.5;
      if (lod > 0.001) warp += (vec3(inkN3(vW * 0.26 + 7.0), inkN3(vW * 0.26 + 13.0), inkN3(vW * 0.26 + 23.0)) - 0.5) * 0.05;
      vec3 q = vW * 0.13 + warp * 1.3;
      vec3 cell = floor(q);
      vec3 toEdge = (0.5 - abs(fract(q) - 0.5)) / max(fwidth(q), vec3(1e-5));   // pixels to each wall
      float edgePx = min(min(toEdge.x, toEdge.y), toEdge.z);
      tone = step(0.5, inkH13(cell + 41.0)) * lod;
      float taken = step(inkH13(cell + 17.0), 0.9) * district;
      parcel = mix(district, taken, lod);
      parcelRim = max(districtRim, parcel * (1.0 - smoothstep(1.9, 3.6, edgePx)) * lod);
      if (lod > 0.001) {
        float wgt = 0.35 + 1.9 * inkN3(vW * 0.7 + 5.0);
        float run = smoothstep(0.40, 0.47, inkN3(vW * 0.3 + 17.0));
        float edge2 = max(min(toEdge.x, toEdge.y), min(max(toEdge.x, toEdge.y), toEdge.z));
        float dabR = 2.2 + 2.6 * inkH13(floor(q + 0.5) + 5.0);
        float dab = 1.0 - smoothstep(dabR - 0.7, dabR + 0.7, length(vec2(edgePx, edge2)));
        hedge = max((1.0 - smoothstep(wgt - 0.6, wgt + 0.6, edgePx)) * run, dab) * district * lod;
      }
    } else {
      parcel = district;
      parcelRim = districtRim;
      float tn = inkF3(vW * 0.035 + 41.0) - 0.5;
      float tw = max(fwidth(tn), 1e-5);
      tone = smoothstep(-tw, tw, tn);
      // the rest of a bare week's lowland is the page
      page = ground * (1.0 - parcel) * lowAmt;
    }
    // under the fields or the earth the lowland is laid flat too, one tone to
    // a wash, so no ramp of colour runs beneath it
    lowFlat = ground * smoothstep(0.0, 0.15, lowAmt);
  }
  float lowRamp = mix(smoothstep(0.5, 7.0, hRel), 0.30 + 0.30 * tone, lowFlat);
  vec3 lowW = mix(uLandLow, uLandMid, lowRamp);
  vec3 highW = mix(lowW, uLandHigh, smoothstep(9.0, 20.0, hRel));
  // ---- the wash. Five related notes build one mass: indigo-violet deep
  // shadow, cool slate, a broken neutral middle, ochre light and reserved paper
  // on the driest crest. They are flat shapes, not continuous Lambert shading.
  // Keep P1's cool ice a step below the page while restoring round 5's wash;
  // seen from orbit the driest ground is the week's own (uDry).
  vec3 cDryR5 = mix(uCrest, uPaper, mix(0.72, 0.38, uSurface));
  vec3 cDry = mix(uDry, cDryR5, uSurface);
  vec3 cLit = mix(uLitWarm, mix(lowW, uLandMid, 0.35), 0.34);
  vec3 cHalf = mix(highW, uLandMid, 0.22);
  vec3 cShade = mix(uShadeCool, highW, 0.30);
  vec3 cDeep = mix(uShadeCool, uInk, 0.46);
  // the week's mineral lies in the darkest creases of the rock and nowhere
  // else: a note, never a wash
  float mineral = clamp(uAccentAmt * 1.3, 0.0, 0.75) * steep;
  vec3 creaseC = mix(mix(uShadeCool, uAccent, mineral), uInk, 0.55);
  cDeep = mix(cDeep, mix(uAccent, uInk, 0.30), mineral);
  // craft.values: the palette's committed dark — the ink sea, the oxblood
  // shade, the indigo under the ice — is what the picture's dark mass is made
  // of, not the ink of whatever family happened to be mixed in. The week's
  // mineral stays inside it: the accent is laid in the dark, not over it.
  cDeep = mix(cDeep, mix(uDark, uAccent, mineral * 0.35), uValues);
  // the parcels take the same light as the ground
  vec3 pc = uVegAmt > 0.0 ? mix(mix(uVeg, uLitWarm, 0.30), mix(uVeg, uInk, 0.16), tone)
                          : mix(mix(uBare, uLitWarm, 0.22), mix(uBare, uInk, 0.10), tone);
  cDry = mix(cDry, mix(pc, uCrest, 0.30), parcel);
  cLit = mix(cLit, pc, parcel);
  cHalf = mix(cHalf, mix(pc, uShadeCool, 0.25), parcel);
  cShade = mix(cShade, mix(pc, uShadeCool, 0.55), parcel);
  // pal.caps: the ground the reserve used to cover takes the week's own light
  // wash instead of the sheet — and it is left as that, a wash, never a second
  // pale slab: the step it is laid at fades out with the caps themselves, so at
  // the dial's top the lit face is the week's own light with the relief drawn on
  // it as it always was, and no boundary is left where the reserve's edge ran.
  // The fields keep their own tone inside it either way.
  vec3 dryLit = mix(mix(cLit, mix(uLitWarm, uCrest, 0.40), 0.50 * (1.0 - uCaps)), mix(pc, uCrest, 0.30), parcel);
  vec3 c = mix(cDeep, cShade, e1);
  c = mix(c, cHalf, e2);
  c = mix(c, cLit, e3);
  c = mix(c, dryLit, e4 * (1.0 - uCaps));
  // the reserve itself: the sheet where the caps mean ice or the crescent means
  // a lit limb (craft.paper), the week's dry ground at the bottom of the caps
  // dial. craft.paper's crescent is the bare sheet with its tooth; a cap is the
  // sheet a wash has passed over — the snowfield's own hollows in the week's cool
  // shade, laid as flat shapes on the paper — so ice is part of the painting and
  // not a shape cut out of it.
  vec3 resPaper = mix(uPaper, uPaperWet, 0.30 * tooth);
  if (uCaps > 0.0) {
    // the hollows of the ice's own wash. The finest of the two is let go of at
    // the rim of the disc, where the sheet holds it in less than a pixel: the
    // ice there is a flat pale wash and not a mottle of broken pixels
    float fine = mix(0.5, inkN3(dW * 33.0 + 7.0), iceFace);
    float hollow = smoothstep(0.44, 0.58, inkF3(dW * 8.6 + 31.0) * 0.58 + fine * 0.42);
    resPaper = mix(resPaper, mix(uShadeCool, uPaper, 0.44), capK * hollow * 0.34);
  }
  c = mix(c, mix(cDry, resPaper, max(crescent, uCaps)), resK);
  // the pigment the ice's wash left as it stopped: a few pixels of the week's
  // shade standing outside the cap's own edge, on the same wandering line, so the
  // cap is a wash that dried and not a shape cut out of the sheet
  c = mix(c, mix(uShadeCool, c, 0.62), capPool * 0.55);
  // a cap's night side is snow in shade: one cool wash laid over the sheet, flat,
  // on the cap's own edge
  c = mix(c, mix(uShadeCool, c, 0.60), capNight);
  // the hedges between the parcels, the page through a bare week's lowland;
  // pigment gathers just inside each parcel's edge
  // the lowland's own lines stop at the ice: a hedge or a parcel wall is drawn on
  // the ground, and the sheet lying over the ground has no field walls on it
  c = mix(c, mix(c, uInk, 0.25), parcelRim * 0.5 * (1.0 - capK));
  c = mix(c, mix(uVeg, uInk, 0.45), hedge * 0.8 * (1.0 - capK));
  c = mix(c, mix(uPaper, uCrest, 0.3), page * 0.6 * (1.0 - capK));

  // ---- craft.values. Three weights, kept apart and read off the drawing
  // itself: the deep and the shade of the plan are the committed dark, the
  // mid-ground its luminous middle, the lit planes and the dry crests its
  // light. A wash is placed by the band it was laid in and not by the value it
  // happens to land on, so a fold is never mistaken for a plain and a crest is
  // never swallowed by the ground beside it; its hue is kept — the mass's value
  // is reached by scaling the wash, never by repainting it — and a good part of
  // its own variation is kept inside the mass, because a mass is a wash and not
  // a hole cut in the picture. The middle is lifted in its own pigment, so a
  // warm week's plain is an ochre in the sun rather than a mud, and the
  // reserved sheet is left out of the plan altogether: paper keeps the value it
  // was laid at, which is what makes it paper. Everything after this — the
  // rims, the dry brush, the creases — is drawn on that plan as it always was.
  if (uValues > 0.0) {
    float lum = dot(c, vec3(0.32, 0.55, 0.13));
    float lumDark = dot(mix(uDark, uShadeCool, 0.12), vec3(0.32, 0.55, 0.13));
    float lumMid = dot(mix(uLandLow, uLandMid, 0.45), vec3(0.32, 0.55, 0.13)) + 0.03;
    float lumLight = dot(mix(uLitWarm, uCrest, 0.10), vec3(0.32, 0.55, 0.13));
    // 0.42 is the step where the shade gives way to the mid-ground and 0.64 the
    // one where the lit planes begin (the washes above are laid on the same two)
    float sw = 0.05;
    float mD = 1.0 - smoothstep(0.42 - sw, 0.42 + sw, tHi);
    float mL = smoothstep(0.64 - sw, 0.64 + sw, tHi);
    float mM = max(0.0, 1.0 - mD - mL);
    float mass = lumDark * mD + lumMid * mM + lumLight * mL;
    // the dark is committed and flat; the two lit masses keep half their own
    // wash, because that is where the drawing lives — the light mass is the
    // week's lightest wash and not a step below the sheet, so the paper left in
    // the crests and the crescent still reads as the picture's own light
    float keep = 0.32 * mD + 0.42 * mM + 0.60 * mL;
    // the reserved sheet is not one of the three: it keeps the value it was
    // laid at, so the paper of a caps ice field and of the crescent stays the
    // paper of the poster (and the factor is 1 wherever both dials are off, or
    // underfoot, where resK is 0)
    float vk = uValues * (1.0 - smoothstep(0.25, 0.90, resK));
    c *= mix(1.0, (mass + keep * (lum - mass)) / max(lum, 1e-3), vk);
    // the middle is the week's own pigment at its own strength: a step of
    // chroma there is what keeps a warm week's mid-ground from going to mud
    c = mix(vec3(dot(c, vec3(0.32, 0.55, 0.13))), c, 1.0 + 0.16 * mM * vk);
  }

  // ---- light.form. Inside its three values the globe still turns: a graded
  // half-tone glazed over each mass in the week's own cool, read off the light
  // the globe is painted with on the sphere (square to it the mass keeps its
  // value, toward the terminator it goes down a cool step) and off the form's
  // own normal (a slope turned to the light lifted, one turned away lowered),
  // so the disc reads as a ball under one light and its relief as relief while
  // every mass keeps its own edges. From orbit only; the reserved sheet keeps
  // its value.
  if (uForm > 0.0 && orbitK > 0.0) {
    vec3 Lf = normalize(uLight);
    float sphere = dot(dW, Lf);
    float reliefF = clamp(dot(nSh, Lf) - sphere, -0.5, 0.5);
    float turnF = 1.0 - smoothstep(-0.15, 0.95, sphere);
    vec3 coolF = uShadeCool / max(max(uShadeCool.r, uShadeCool.g), max(uShadeCool.b, 1e-3));
    float fk = uForm * orbitK * (1.0 - resK);
    c *= mix(vec3(1.0), coolF * 0.80, turnF * 0.45 * fk) * (1.0 + 0.35 * reliefF * fk);
  }

  // ---- dried rims. Pigment gathers just inside each planned wash shape. In a
  // calm week each rim belongs to the step it bounds.
  float rw = max(fwidth(t), mix(0.004 * floorK, 1e-5, uSurface));
  float rwMid = max(fwidth(tMid), mix(0.004 * floorK, 1e-5, uSurface));
  float rwHi = max(fwidth(tHi), mix(0.004 * floorK, 1e-5, uSurface));
  float planRim = max(max((1.0 - smoothstep(0.0, 1.6 * rw, abs(t - 0.24))) * mix(1.0, 1.0 - e2, calm),
                         1.0 - smoothstep(0.0, 1.6 * rwMid, abs(tMid - 0.42))),
                      max(max((1.0 - smoothstep(0.0, 1.7 * rwHi, abs(tHi - 0.62))) * mix(1.0, e2, calm),
                              (1.0 - smoothstep(0.0, 1.9 * rwHi, abs(tHi - dryAt))) * mix(1.0, e3, calm)
                                * (1.0 - crescent) * (1.0 - uCaps)),
                          cresRim));
  // a wash boundary has no business crossing the sheet: inside the caps the
  // plan's rims are lifted off, and the cap's own edge carries the rim instead —
  // pigment left where the ice stopped, which is what keeps a cap a wash laid on
  // the sheet and not a shape cut out of it. (light.aerial: the further off, the
  // less of the hand: a far range's rims, dry brush and creases are lighter)
  float handK = 1.0 - 0.7 * farF;
  float rim = max(planRim * (1.0 - capK), capLine * 1.15 * (1.0 - crescent)) * mark * handK;
  float lum0 = dot(c, vec3(0.32, 0.55, 0.13));
  vec3 rimC = (c - lum0) * 1.30 + lum0 * 0.80;
  c = mix(c, mix(rimC, uInk, 0.20), rim * 0.72);

  // ---- dry brush. The brush travels down the fall line, leaving narrow paper
  // breaks on lit crests and a loaded streak beside them.
  vec2 grad2 = vec2(dhE, dhN) / su;
  float gl = length(grad2);
  vec2 fl = gl > 1e-4 ? grad2 / gl : normalize(vec2(0.82, 0.34));
  vec2 pl = vec2(dot(vW, eE), dot(vW, eN));
  vec2 pa = vec2(dot(pl, fl), dot(pl, vec2(-fl.y, fl.x))) * (2.0 / su);
  float brush = inkF3(vec3(pa.x * 0.30, pa.y * 2.5, 7.0));
  float bwB = max(0.7 * fwidth(brush), 0.002);
  float dryB = 1.0 - smoothstep(0.3725 - bwB, 0.3725 + bwB, brush);
  float pool = smoothstep(0.6725 - bwB, 0.6725 + bwB, brush);
  float open = smoothstep(0.34, 0.56, tMid) * mark;
  // the paper a crest carries stays where it is under every dial: the breaks
  // the brush left on the lit folds are the sheet's own life, and one reserve in
  // one place would be one flat patch of a picture. pal.caps is the one dial it
  // answers to: with the sheet reserved for real ice, a bare crest is not a
  // second claim on it
  float crestDry = smoothstep(0.66, 0.88, tHi) * smoothstep(0.08, 0.30, steep) * (1.0 - 0.55 * uCaps);
  float flatDrag = (1.0 - steep) * smoothstep(0.38, 0.72, open) * (1.0 - flatK);
  c = mix(c, uPaper, dryB * open * (0.22 + 0.34 * flatDrag + 0.46 * crestDry) * handK);
  // a loaded streak of the brush never crosses the ice either: inside the caps
  // the sheet is the wash, and the ground's own drawing stops at its edge
  c = mix(c, mix(c, uInk, 0.30), pool * mark * (0.16 + 0.24 * (1.0 - open)) * (1.0 - capK) * handK);

  // ---- the accents. Two or three darks belong in a frame and they go where the
  // ground creases and where the sun has been taken away: the shadow side of a
  // ridge, the floor of a gully, the cast shadow of the crest above it. They are
  // the ground's own drawing and they stop at the ice: a snowfield takes its form
  // from its hollows' wash, not from a pen run over it.
  float crease = steep * (1.0 - e1) * (0.35 + 0.65 * sunSh) * (1.0 - capK);
  c = mix(c, creaseC, clamp(crease, 0.0, 1.0) * 0.55 * mark * handK);

  // ---- granulation settles into the tooth only in loaded washes. It follows
  // the brush direction, including across broad calm fields and ochre planes.
  float loadedW = 1.0 - smoothstep(0.24, 0.70, dot(c, vec3(0.32, 0.55, 0.13)));
  float grainDir = inkN3(vec3(pa.x * 0.22, pa.y * 1.8, 31.0));
  c *= 1.0 - clamp(loadedW * loadedW, 0.0, 1.0) * 0.23
             * (0.24 + 0.90 * tooth) * (0.66 + 0.54 * grainDir) * (1.0 - afar);
  // ---- the race underpaint. The geometry owns the one solid loaded stroke;
  // terrain only keeps the soft vermilion that creeps into damp paper beside it.
  float markB = inkMark(2.5, fp);
  if (vRace < 4.0 && markB > 0.01) {
    float flats = 1.0 - smoothstep(0.06, 0.42, vSlope);
    float reach = 0.28 + 0.78 * inkF3(vW * 0.34 + 13.0) * (0.35 + 0.65 * flats);
    float wet = 1.0 - smoothstep(0.26, reach + 0.26, vRace);
    float creep = smoothstep(0.42, 0.72, inkN3(vW * 1.4 + 23.0)) * flats;
    float bleed = wet * creep;
    c = mix(c, mix(c, uVerm, 0.28), clamp(bleed, 0.0, 1.0) * 0.15 * markB);
  }

  // ---- light.terminator: the night side of the land. A real sun leaves a real
  // night, and in a wash it is one or two flat cool masses of the week's own
  // palette: the ground in the shade's own indigo, a step lighter where it
  // stands high, and a last step of the shallows' cool along the shore so the
  // coast, the fields and the folds stay faintly legible in it. The day's
  // drawing is kept under them as a ghost — the night of a watercolour is a wash
  // laid over the picture, never a hole cut in it — so nothing goes black. The
  // edge they stopped on is the dried line inkNight returns, and it is laid
  // before the limb, so the world's edge still gathers its own ink over it.
  if (nightK > 0.001) {
    vec3 nightSea = mix(uSeaShallow, uInk, 0.60);
    vec3 nightLand = mix(uShadeCool, uInk, 0.34);
    vec3 nightHigh = mix(nightLand, mix(uShadeCool, uPaper, 0.16), 0.50);
    nightLand = mix(nightLand, nightSea, exp(-max(0.0, vSea) * 0.55) * 0.35);
    vec3 nightC = mix(nightLand, nightHigh, smoothstep(1.5, 9.0, vSea));
    // the night carries the day's own values — a fold's light and its shade, the
    // sea's deeper ground, the lowland's fields — on the night's own cool hue: a
    // watercolour dark is one wash laid over the drawing, so what stays legible
    // in it is the drawing, never a second and muddier day.
    float dayLum = dot(c, vec3(0.32, 0.55, 0.13));
    nightC *= mix(1.0, 0.72 + 0.60 * smoothstep(0.16, 0.78, dayLum), 0.45);
    // a cap is the sheet, and the sheet is what a watercolour's light is made
    // of: the night is laid over the ground and never over the ice, which takes
    // its own cool shadow instead (capNight, laid with the washes)
    float ice = 1.0 - capK;
    c = mix(c, nightC, nightK * 0.94 * ice);
    // the second wash of the dark, gathered away from the terminator on an edge
    // of its own: the night of a watercolour is two washes deep, not one sheet of
    // one colour — and the second is a step, never a hole
    vec3 nightDeep = mix(nightC, mix(uInk, uShadeCool, 0.45), 0.34);
    c = mix(c, nightDeep, deepK * 0.60 * ice);
    // the wash stopped on a line of its own: pigment left where the brush lifted,
    // so the day and the night are two washes meeting and not a graduated sheet
    c = mix(c, mix(c, uInk, 0.38), termEdgeK * 0.75);
  }

  // ---- the limb, where the land meets the sheet. A form does not lose itself to
  // an outline: as it turns away it gathers pigment, but only in shade. A lit
  // limb gives its value back to the paper along a wet edge that wanders — in a
  // few places the wash runs out well inside the drawing and in others it is
  // carried right to it, so the silhouette is cut by hand and never by a compass.
  // From orbit the globe's own normal decides the limb, so an interior mountain
  // face is not mistaken for the edge of the world.
  vec3 nL = normalize(mix(dW, n, uSurface));
  float graze = 1.0 - smoothstep(0.05, 0.34, abs(dot(nL, V)));
  if (graze > 0.01) {
    float limbN = inkF3(dW * 6.0 + 3.0);
    float sunFace = smoothstep(-0.10, 0.56, dot(nL, uLight));
    // light.night's hard light: the whole sliver of a crescent is lit limb, and
    // none of it gathers the shade's ink (from orbit: underfoot the sun is the sun)
    if (uNight > 0.0) sunFace = mix(sunFace, smoothstep(-0.04, 0.12, dot(nL, uLight)), uNight * uTerm * orbitK);
    float orbitBreak = smoothstep(0.62, 0.70, limbN);
    c = mix(c, mix(c, uInkSoft, 0.50), graze * 0.45 * (1.0 - sunFace) * (0.45 + 0.75 * limbN));
    c = mix(c, uPaper, clamp(graze * sunFace * (0.24 + 0.92 * limbN), 0.0, 1.0)
                           * mix(orbitBreak * 0.52, 0.68, uSurface));
  }

  float above = smoothstep(-0.06, 0.06, vSea);
  float nb = 0.45 + 0.75 * inkF3b(vW * 0.75 + 31.0);
  float orbitCoast = 1.0 - clamp(uSurface, 0.0, 1.0);
  if (orbitCoast > 0.0) {
    // Round 5's damp coast and pooled waterline remain part of the orbit wash.
    float ice = resK;
    c = mix(c, mix(c, uSeaShallow, 0.55), exp(-max(0.0, vSea) * 0.7) * nb * 0.60 * above * markB * (1.0 - ice) * orbitCoast);
    float waterline = (1.0 - smoothstep(0.0, max(2.5 * fwidth(vSea), 1e-4), max(0.0, vSea))) * (1.0 - capK);
    c = mix(c, mix(c, uInk, 0.55), waterline * (0.40 + 0.60 * nb) * 0.75 * above * orbitCoast);
    c = mix(c, mix(c, uSeaDeep, 0.35), exp(-max(0.0, -vSea) * 0.22) * 0.6 * (1.0 - ice) * orbitCoast);
  }

  // ---- light.night: the night taken down from a cool wash to a deep one, and
  // laid last over everything the night side holds — the ground, its shore, its
  // limb and its snow — so none of the day's colour is left in it: the shade's
  // own indigo carried down nearly to the ink, the same pigment the sea's night
  // is laid in (see the sea's own), so the dark side is one mass and not a map
  // recoloured. It is still two washes and a dried edge: the first, along the
  // terminator, a step lighter than the second, which is gathered away from it
  // on inkNight's own second edge, and the pigment carried to where the wash
  // stopped, darker than both. What is left of the drawing is a whisper of
  // value: the land a step above the water, the heights a step above the land,
  // and snow under a night sky a step of the shade's cool light.
  if (uNight > 0.0 && nightK > 0.001) {
    vec3 deepC = mix(uInk, uShadeCool, 0.22);
    deepC = mix(vec3(dot(deepC, vec3(0.32, 0.55, 0.13))), deepC, 1.5) * 0.68;
    deepC *= (1.0 + 0.06 * smoothstep(1.5, 12.0, vSea)) * (1.0 + 0.30 * capK);
    deepC *= mix(1.07, 0.95, clamp(deepK, 0.0, 1.0));
    c = mix(c, deepC, nightK * uNight);
    // and the lowland is lived on: under the second wash the night keeps a
    // spatter of warm gouache on the low ground by the water — a dot flicked
    // into one cell in two, and only where towns gather — and none on the
    // heights, the ice or the sea
    float low = smoothstep(0.05, 0.6, vSea) * (1.0 - smoothstep(2.0, 5.0, vSea)) * (1.0 - capK);
    float town = smoothstep(0.60, 0.74, inkF3(dW * 6.0 + 51.0));
    vec3 lq = dW * 26.0;
    vec3 lc = floor(lq);
    vec3 at = 0.3 + 0.4 * vec3(inkH13(lc + 3.0), inkH13(lc + 11.0), inkH13(lc + 19.0));
    float lr = length(fract(lq) - at);
    float lw = max(fwidth(lr), 1e-3);
    float lamp = (1.0 - smoothstep(0.22 - lw, 0.22 + lw, lr)) * step(0.5, inkH13(lc + 29.0))
               * low * town * clamp(deepK, 0.0, 1.0);
    c = mix(c, mix(uLitWarm, uVerm, 0.35), lamp * 0.90 * uNight);
    c *= 1.0 - termEdgeK * 0.55 * uNight;
  }
  if (uSurface > 0.0) {
    // Underfoot the water is laid to a reserved-paper hairline on a hard edge,
    // and only where there is water for it to edge: a plain that merely comes
    // close to the sea's level keeps its sand.
    float fs = max(fwidth(vSea), 1e-4);
    float dampAt = 0.04 + 0.12 * nb;
    float damp = (1.0 - smoothstep(dampAt - fs, dampAt + fs, vSea)) * above * markB * wetNear * uSurface;
    vec3 wetC = mix(c, uSeaShallow, 0.35) * 0.86;
    c = mix(c, wetC, damp);
    c = mix(c, mix(wetC, uInk, 0.35), damp * (1.0 - smoothstep(0.6 * fs, 2.2 * fs, dampAt - vSea)) * 0.6);
    float hair = (1.0 - smoothstep(1.2 * fs, 2.2 * fs, vSea)) * above * wetNear;
    c = mix(c, uPaper, hair * 0.9 * uSurface);
  }

  // ---- sky.cloudShade. Underfoot each mass the sky paints lays its shadow on
  // the far plain under it in the picture: one broad cool wash at the mass's
  // own bearing on the sky's chart (SKY_FRAG), cut on a hard edge with the
  // pigment it dried on gathered a touch darker, drifting as the mass drifts.
  // It starts well past the runner, so it gives the plain distance and never
  // blots the foreground; an airless sky (its cloud scale at or under nought)
  // paints no mass and casts no shadow; none is laid from orbit, where the
  // cloud sheet casts its own.
  if (uCloudShade > 0.0 && uSurface > 0.0 && uSkyScheme.z > 0.0) {
    vec3 upC = normalize(cameraPosition);
    vec3 Ec = normalize(uSkyE - upC * dot(uSkyE, upC) + vec3(1e-5, 0.0, 0.0));
    // the station the sky's chart puts at this bearing, drifted as the sky
    // drifts its masses at their base
    float drift = uTime * uCloudRate * (1.0 - 0.19 * uCloudBand) + uLiving * uTime * 0.021 * (1.0 - 0.19 * 0.55);
    float cq = (-atan(dot(-V, cross(upC, Ec)), dot(-V, Ec)) + drift) / 1.2566371;
    float across = (fract(cq) - 0.5) * 1.2566371;              // radians off the mass's middle
    float halfW = (0.17 + 0.07 * inkH12(vec2(mod(floor(cq), 5.0), 29.0))) * uSkyScheme.z;
    // a pool on the ground under the mass: its near edge well past the runner,
    // its far edge past the world's own horizon
    float deep = max(0.35 * hz, 8.0);
    float rc = max(uFogBase + 10.0, 0.45 * hz) + deep;
    float pe = length(vec2(across * dist / (halfW * rc), (dist - rc) / deep)) - 1.0
             + 0.45 * (inkN3(vW * 0.06 + 41.0) - 0.5) + 0.40 * (inkN3(vW * 0.16 + 7.0) - 0.5)
             + 0.12 * (inkN3(vW * 0.45 + 3.0) - 0.5);
    float pw = max(fwidth(pe), 1e-4);
    float shadeA = 1.0 - smoothstep(-pw, pw, pe);
    float shadeR = shadeA * (1.0 - smoothstep(0.0, 3.0 * pw, -pe));
    vec3 coolS = uShadeCool / max(max(uShadeCool.r, uShadeCool.g), max(uShadeCool.b, 1e-3));
    float ck = uCloudShade * uSurface;
    c *= mix(vec3(1.0), coolS * 0.86, shadeA * 0.42 * ck);
    c *= 1.0 - shadeR * 0.06 * ck;
  }

  vec3 cAir = inkAerial(c, dist, uFarGlaze, uFogBase);
  // light.aerial: underfoot the same change of colour, fitted to the horizon
  // (farT): the middle distance gives up a little of its chroma and takes a
  // little of the glaze, and past the horizon a far range is the glaze's own
  // pale cool, its light and shade kept inside it, its saturation and its
  // contrast both gone down — three planes, one behind another
  if (farF > 0.0) {
    float lvA = dot(c, vec3(0.32, 0.55, 0.13));
    vec3 fit = mix(c, vec3(lvA), 0.40 * farT);
    fit = mix(fit, uFarGlaze * (0.80 + 0.32 * smoothstep(0.16, 0.94, lvA)), 0.82 * farT * farT);
    cAir = mix(cAir, fit, uAerial * uSurface);
  }
  c = cAir;
  // A far range stands in the air: its foot is lost into the pale of the
  // horizon, graded up its flank as a painter lays a graded wash, so its crest
  // is found against the sky and its base is not. (The horizon of a world this
  // small is some seventy units off, so "far" begins close; light.aerial reads
  // it off the eye's own horizon.)
  // A patchwork takes the same haze in three flat steps, one per wash, so a
  // field never fades inside its own edge.
  float mist = mix(smoothstep(uFogBase + 15.0, uFogBase + 90.0, dist),
                   smoothstep(0.55 * hz, 1.5 * hz, dist), uAerial) * uSurface
             * (1.0 - smoothstep(1.5, 12.0, hRel));
  mist = mix(mist, floor(mist * 3.0 + 0.5) / 3.0, parcel);
  c = mix(c, uSkyBand, mist * 0.45);
  gl_FragColor = vec4(c, 1.0);
}
`;

// Round 5 paints the orbit sea. Underfoot P1's hard wash keeps a darker far
// band, broken reserved-paper glints, and a swimmer's decisive splash and wake:
// one entry mark and two diverging strokes, never a blurred halo.
const OCEAN_FRAG = /* glsl */ `
uniform sampler2D tLand, tCoast, tSun;
uniform vec3 uLight;  // the terrain's light: the sun, turned toward the eye from orbit
uniform vec3 uFillDir;
uniform vec3 uPaper, uPaperWet, uInk, uInkSoft, uSeaShallow, uSeaDeep, uFoam, uFarGlaze, uShadeCool;
uniform vec3 uTeal, uCobalt, uSkyWash, uSkyE, uShelf, uVeg, uLitWarm, uLandMid, uDry, uDark;
uniform float uDamp, uDrowned, uVegAmt, uValues;
uniform float uWarmth, uEnergy, uSeaLevel, uTime, uFogBase, uSurface, uSeaCalm, uWaterRate;
uniform float uSeaRate, uSeaAmp, uSeaChop, uCadenceHz, uCadenceAmp;
uniform float uTerm, uCaps;    // light.terminator, pal.caps (see inkNight, inkCaps)
uniform float uNight;          // light.night: how deep that night goes (see the last wash)
uniform float uLiving;         // motion.living: with it at 0 every term below is left out
uniform float uGlint;          // sea.glint: the sun's image on the orbit's water (see its block)
uniform float uForm;           // light.form: the water turns with the ground (see the terrain's block)
uniform vec4 uPulse;           // its four beats: settlement glow, aurora, sea glitter, edge breath
uniform vec4 uSwim;    // where the body meets the water; w: 0 dry, 1 wading, 2 swimming
uniform vec4 uSwimF;   // which way he is going; w: how hard he swims, 0 … 1
varying vec3 vW;
varying vec3 vN;
${NOISE}
${AERIAL}
${CRESCENT}
${NIGHT}
${CAPS}
void main(){
  vec3 d = normalize(vW);
  vec3 V = normalize(cameraPosition - vW);
  float dist = distance(cameraPosition, vW);
  float tooth = inkTooth(gl_FragCoord.xy);
  vec3 c = uCobalt;
  vec3 orbitC = c;
  // motion.living: the sea's own clock, read once here and used by the blocks
  // below — the wash that is still drifting, the swell that carries the
  // glitter, and the day's own copy of the drift. liveDrift is the creep of the
  // mottling through the paint's own noise space, liveDayDrift is that creep
  // faded out as the water turns away from the light (the night's dark is one
  // settled mass and its interior must not crawl), and liveSwell is the
  // travelling swell along the light's path. Every one of them is the dial
  // times the clock, so with the dial at 0 they are exactly zero and every line
  // that reads them reads what it always read.
  vec3 liveSun = normalize(uLight);   // the painted light, unit: the beats read it too
  vec3 liveDrift = vec3(0.0);
  vec3 liveDayDrift = vec3(0.0);
  float liveSwell = 0.0;
  if (uLiving > 0.0) {
    // a feature of the paint's own mottling takes some ten seconds to travel a
    // width of itself: slow enough that nothing reads as an object sliding over
    // the water, fast enough that the sea is plainly not printed. The three axes
    // move at different rates, so the pattern creeps in two directions at once,
    // the way a wet wash does.
    liveDrift = (uTime * uLiving) * vec3(0.030, 0.006, -0.024);
    // the creep is the day's. The night's dark is one settled mass in the
    // picture and its interior must not crawl, so the drift is faded out as the
    // water turns away from the light: what the dark keeps is its edge, and the
    // edge has its own breathing (inkNight). The gate is the light's own dot, so
    // it is the same function of the picture in every run.
    liveDayDrift = liveDrift * smoothstep(-0.05, 0.30, dot(d, liveSun));
    liveSwell = uLiving * (0.5 + 0.5 * sin(dot(d, liveSun) * 46.0 - uTime * 0.55));
  }
  bool lagoonAbove = false;
  if (uSurface < 1.0) {
    // a drowned globe's lagoon water stands above its capped relief: from
    // orbit only the sea itself is painted (discarded last, after every
    // derivative the quad shares)
    lagoonAbove = uDrowned > 0.5 && length(vW) > 120.0 + uSeaLevel + 0.01;
    float fp = max(1e-4, length(fwidth(vW)));
    vec3 n = normalize(vN);
    vec2 uv = inkUV(d);
    float landH = texture2D(tLand, uv).r;
    float coast = texture2D(tCoast, uv).r;
    // a drowned globe keeps no narrow ground: the rim of a flooded basin is no
    // shore (its thin ring of shallows reads as a stamp), so there the survey
    // is read wide, and a rim standing in open water is open water
    if (uDrowned > 0.5) {
      vec2 o = vec2(4.0 / 640.0, 4.0 / 320.0);
      float wide = 0.25 * (texture2D(tLand, uv + vec2(o.x, 0.0)).r + texture2D(tLand, uv - vec2(o.x, 0.0)).r
                         + texture2D(tLand, uv + vec2(0.0, o.y)).r + texture2D(tLand, uv - vec2(0.0, o.y)).r);
      landH = min(landH, wide);
      coast = max(coast, 9.0 * smoothstep(-0.5, -3.0, wide));
    }
    float mark = inkMark(2.5, fp);
    float near = 1.0 - smoothstep(45.0, 260.0, dist);
    float afarO = smoothstep(120.0, 430.0, dist);
    float fwc = max(fwidth(coast), 0.012);

    vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), d) + vec3(1e-4, 0.0, 0.0));
    vec3 north = normalize(cross(d, east));
    vec2 flow = vec2(dot(vW, east), dot(vW, north));

    // Round 5's coast: successive flat washes with pooled dried rims.
    float irr = 0.55 + 0.85 * inkF2(uv * 190.0);
    float co1 = 1.45 + 0.62 * (irr - 0.85);
    float co2 = 6.6 + 1.25 * (irr - 0.85);
    float coastWet = smoothstep(0.75, 0.91, inkF2(uv * 23.0 + 17.0));
    // a deep week's water (uSeaCalm, 0 for the race week) is laid with a firmer
    // brush: its bands stop on hard edges and its shelves drown
    float bw = mix(0.13, 0.68, (1.0 - near) * (0.35 + 0.65 * coastWet)) * (1.0 - 0.8 * uSeaCalm);
    float b1 = smoothstep(co1 - bw, co1 + bw, coast);
    float b2 = smoothstep(co2 - bw * 1.7, co2 + bw * 1.7, coast);
    vec3 cShelf = mix(uSeaShallow, uSeaDeep, 0.43);
    c = mix(uSeaShallow, cShelf, b1);
    c = mix(c, uSeaDeep, b2);
    // the shallows over drowned ground: graded and half-tinted for the race
    // week's damp coast, one hard-edged shelf for a deep week's; a week laid in
    // other weather lays its shelf as one flat wash of its own shallows (uShelf:
    // the race week's sage lowland, any other week the pale of its own water)
    float fwl = max(fwidth(landH), 1e-3);
    float shelfK = mix(smoothstep(-3.5, 0.0, landH), smoothstep(-1.6 - fwl, -1.6 + fwl, landH),
                       max(uSeaCalm / 0.75, 1.0 - uDamp));
    c = mix(c, mix(c, uShelf, mix(1.0, 0.48, uDamp)), shelfK * mix(1.0, 0.52, uDamp));
    // the band edges' pooled rims are the race week's damp coast (uDamp); in
    // other weather they would draw the sea's depth as contour lines
    float rimS = max(1.0 - smoothstep(0.0, 2.1 * fwc, abs(coast - co1)),
                     1.0 - smoothstep(0.0, 2.5 * fwc, abs(coast - co2))) * near * mark * uDamp;
    float lumS = dot(c, vec3(0.32, 0.55, 0.13));
    c = mix(c, mix((c - lumS) * 1.26 + lumS * 0.79, uInk, 0.22), rimS * 0.58);

    // The coast and basin never move. Only these secondary open-water loads
    // are re-laid, on a bounded cycle whose small world-space offset reads as a
    // few pixels over a six-second orbit clip rather than as flowing geometry.
    vec3 waterAxis = vec3(1.0, 0.37, -0.21);
    vec3 waterDrift = uTime * uWaterRate * waterAxis;
    float seaPhase = 6.2831853 * uTime * uSeaRate;
    if (uSeaAmp > 0.0) waterDrift += sin(seaPhase) * uSeaAmp * waterAxis;
    vec3 glintDrift = waterDrift;
    if (uSeaChop > 0.0) glintDrift += sin(seaPhase * 2.17) * uSeaChop * vec3(-0.31, 0.52, 0.27);
    if (uCadenceAmp > 0.0 && uCadenceHz > 0.0) {
      float stride = 0.5 - 0.5 * cos(6.2831853 * uTime * uCadenceHz);
      glintDrift += stride * uCadenceAmp * vec3(0.61, -0.37, 0.24);
    }
    // motion.living: the mottling the open water is painted with is still
    // being laid — it creeps across the sea on the picture's own clock (along
    // liveDrift, a slow slide of the paint's own noise space), so the deep
    // water's bands and light patches travel while the coast and the basin, as
    // ever, do not move at all. With the dial down liveDrift is exactly zero.
    // Up close one cell of the plan's broad lattice fills the frame, and where
    // its corners happen to agree the field runs one way only: a load cut on
    // it there is cut on a ruled line (2025-04-14 at close orbit). Near water
    // reads the lattice through a warp of its own that bends those lines;
    // from the poster's distance (near = 0) the plan is the one it always was.
    vec3 planP = d * 2.7 + vec3(3.0, 11.0, -5.0) + waterDrift + liveDayDrift;
    if (near > 0.0) planP += (0.30 * near * near) * (vec3(inkN3(d * 4.3 + 1.0), inkN3(d * 4.3 + 7.0), inkN3(d * 4.3 + 13.0)) - 0.5);
    float plan = inkF3b(planP) * 0.72
               + inkN3(d * 7.4 + vec3(-9.0, 2.0, 13.0) + waterDrift + liveDayDrift) * 0.28;
    plan += 0.08 * dot(d, normalize(vec3(-0.62, 0.18, 0.76)));
    // …and up close the load's edge takes the wander a hand-cut edge has at
    // this scale, so a broad smooth contour across the frame is never a rule
    if (near > 0.0) plan += near * near * (0.07 * (inkN3(d * 23.0 + 3.0) - 0.5) + 0.03 * (inkN3(d * 61.0 + 9.0) - 0.5));
    float ps = max(0.65 * fwidth(plan), 0.0004);
    float p1 = smoothstep(0.40 - ps, 0.40 + ps, plan);
    float p2 = smoothstep(0.68 - ps, 0.68 + ps, plan);
    vec3 cDeep = mix(uSeaDeep, uInk, 0.24);
    // craft.values: the sea's dark belongs to the picture's one dark mass too —
    // an ink sea is the coast family's committed dark — so the deep water is
    // carried to that mass's value with its own hue: a sea laid in the rock's
    // oxblood would not be a sea, but a sea a value off the rock's dark is a
    // fourth weight in a picture that is meant to have three.
    float lumSea = max(dot(cDeep, vec3(0.32, 0.55, 0.13)), 1e-3);
    cDeep *= mix(1.0, dot(uDark, vec3(0.32, 0.55, 0.13)) / lumSea, uValues);
    vec3 cMid = mix(uSeaDeep, uSeaShallow, 0.48);
    // dark water keeps its paper: a deep week's pale loads are paler still
    vec3 cLight = mix(uSeaShallow, uPaperWet, 0.18 + 0.30 * uSeaCalm);
    vec3 planC = mix(cDeep, cMid, p1);
    planC = mix(planC, cLight, p2);
    c = mix(c, planC, smoothstep(0.6, 8.0, coast) * 0.82);
    // (and the same for the loads' own rims: nested, they are a fingerprint)
    float rp = max(1.0 - smoothstep(0.0, 1.8 * ps, abs(plan - 0.40)),
                   1.0 - smoothstep(0.0, 1.9 * ps, abs(plan - 0.68))) * mark * uDamp;
    c = mix(c, mix(c, uShadeCool, 0.38), rp * 0.36);

    float strength = (1.0 - smoothstep(0.06, 0.5, fp)) * (1.0 - afarO * 0.88);
    if (strength > 0.02) {
      float spacing = clamp(fp * 25.0, 0.07, 4.0);
      float band = inkF2(vec2(flow.x * 0.045, flow.y / (spacing * 13.0)) + 3.0);
      float l1 = abs(fract(flow.y / spacing + band * 3.0) - 0.5) * 2.0;
      float stroke = smoothstep(0.88, 0.14, l1) * smoothstep(0.38, 0.76, band);
      c = mix(c, mix(c, uPaper, 0.58), stroke * strength * 0.32);
    }

    // where the light lies along the water, the sheet is lifted in a few shapes,
    // each on a hard edge
    float sunPath = smoothstep(0.74, 0.94, dot(d, uLight));
    float rn = inkN3(d * 13.0 + glintDrift * 2.0 + 29.0) - 0.59;
    float reserve = smoothstep(-max(fwidth(rn), 1e-4), max(fwidth(rn), 1e-4), rn);
    c = mix(c, mix(uPaper, uPaperWet, 0.45), sunPath * reserve * (0.16 + 0.16 * uEnergy));
    // ---- sea.glint. The sun's own image on the water is where the light is
    // mirrored to the eye, not where it stands overhead (the reserve above): a
    // pale warm sheen over the water round it, the sheet reserved at its heart in
    // broken dabs on hard edges, the sky the water mirrors gathered on it where it
    // is seen edge-on toward the lit limb, and the open ocean far from any shore
    // deepened into the week's own blue. The light is the painted one, so the
    // glint stands where the poster's light puts it.
    if (uGlint > 0.0) {
      vec3 Lg = normalize(uLight);
      float mirror = dot(reflect(-V, n), Lg);
      float sheen = smoothstep(0.82, 0.997, mirror);
      c = mix(c, mix(uPaper, uLitWarm, 0.28), sheen * sheen * 0.60 * uGlint);
      // the glitter: short strokes of the sheet laid across the swell, gathered
      // into the heart and breaking up toward its edge
      vec3 gq = vW * vec3(0.16, 0.60, 0.16) + glintDrift * 3.0;
      float gn = inkN3(gq + 7.0) * 0.65 + inkN3(gq * 2.3 + 31.0) * 0.35;
      float gw = max(fwidth(gn), 1e-4);
      float gcut = mix(0.74, 0.55, smoothstep(0.95, 0.999, mirror));
      float dab = smoothstep(gcut - gw, gcut + gw, gn) * smoothstep(0.92, 0.965, mirror) * mark;
      c = mix(c, uPaper, dab * 0.90 * uGlint);
      float edgeOn = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 3.0) * smoothstep(-0.05, 0.45, dot(d, Lg));
      c = mix(c, mix(uSkyWash, uPaper, 0.30), edgeOn * 0.50 * uGlint);
      // a glaze of the week's blue darkens and turns the water, it never lifts it
      vec3 deepT = uCobalt / max(max(uCobalt.r, uCobalt.g), max(uCobalt.b, 1e-3));
      float openSea = smoothstep(8.0, 26.0, coast) * (1.0 - sheen);
      c *= mix(vec3(1.0), deepT, openSea * 0.30 * uGlint);
    }
    // light.night: with the sun past the limb the water mirrors it there — a
    // glint only a back-lit sea has, along the lit limb and nowhere else. It is
    // laid as the sun's path is: one lifted shape on a hand-cut edge, with the
    // sheet reserved inside it on the same broken field, so the crescent is as
    // bright over the water as it is over the land.
    if (uNight > 0.0) {
      float mirror = dot(reflect(-V, n), normalize(uLight));
      float sheen = smoothstep(0.55, 0.90, mirror) * (1.0 - smoothstep(0.22, 0.50, dot(n, V)))
                  + 0.25 * (inkN3(d * 9.0 + 41.0) - 0.5);
      float sw = max(fwidth(sheen), 1e-3);
      float glint = smoothstep(0.30 - sw, 0.30 + sw, sheen) * smoothstep(-0.02, 0.06, dot(d, uLight));
      c = mix(c, mix(uPaper, uSkyWash, 0.25), glint * (0.45 + 0.35 * reserve) * uNight * uTerm);
    }
    // motion.living: and the sea along the sun's own path glitters. The sheet is
    // re-laid there in a few dabs — reserved paper, not paint, so each one is
    // laid at nearly the sheet's own value and cut on a hard edge — on the mask
    // the few reserved shapes above are already laid on (sunPath), so the living
    // light gathers where the painted light does instead of washing over the day
    // side. The field they are cut from creeps along the light, and the swell
    // travelling up the path gathers the dabs and lets them go again in bands
    // that cross the water, so the sparkle travels rather than the whole sea
    // opening and closing at once. Nothing is laid on water seen edge-on (the
    // limb would squeeze a dab into a sliver, which is a specular, not a dab),
    // nothing on the night, and with the dial down none of it is computed.
    if (uLiving > 0.0) {
      vec3 gp = d * 8.5 + vec3(uTime * 0.10, uTime * 0.06, uTime * 0.13) + liveSun * (uTime * 0.18);
      float g = inkN3(gp) * 0.66 + inkN3(gp * 2.07 + 5.0) * 0.34;
      float gw = max(0.9 * fwidth(g), 1e-4);
      float cut = 0.80 + 0.05 * (inkN3(d * 4.6 + 7.0) - 0.5);
      float dab = smoothstep(cut - gw, cut + gw, g) * step(0.6, coast);
      // the same mask the reserved shapes above are laid on, with its own ramp:
      // that one reaches full only at the sub-solar point, which leaves a dab's
      // interior at half strength where the light actually lies. The footprint is
      // unchanged (it still starts at the same place), so the living light still
      // gathers where the painted light does; it just gets all the way there.
      float dabPath = smoothstep(0.74, 0.86, dot(d, liveSun));
      // a dab is on the water the viewer can see across, not on water edge-on:
      // the gate takes only the last of the limb, so it can never be the thing
      // that keeps a mark from reaching paper
      float graze = smoothstep(0.04, 0.20, dot(normalize(vN), V));
      // the swell never takes a dab away altogether: it gathers them and lets
      // them back, so what the eye reads is the light moving along the path,
      // not a patch opening and closing
      c = mix(c, mix(uPaper, uPaperWet, 0.10),
              clamp(dab * dabPath * graze, 0.0, 1.0) * mix(0.88, 1.0, liveSwell) * 0.96);
    }
    // Dark water is still full of paper (Homer's lake): a deep week leaves
    // long, broad, broken strokes of the sheet reserved across its lit half,
    // each stopping on a hard edge; the deeper the week, the more of them. They
    // circle a tilted axis with a wind that wanders a little, so across the globe
    // they sweep in arcs with its roundness instead of lying flat along the
    // picture, and they come in drifts: here many and bold, there a few faint.
    if (uSeaCalm > 0.01) {
      vec3 wind = normalize(vec3(0.35, 1.0, -0.25) + 0.6 * (vec3(inkN3(d * 0.9 + 1.0), inkN3(d * 0.9 + 7.0), inkN3(d * 0.9 + 13.0)) - 0.5));
      vec3 gq = d * 4.5 + wind * (dot(d, wind) * 29.5) + vec3(5.0, 1.0, 9.0) + glintDrift * 1.6;
      float gs = inkN3(gq) * 0.75 + inkN3(gq * 2.3 + 11.0) * 0.25;
      float gw = max(fwidth(gs), 1e-4);
      float drift = inkN3(d * 2.1 + glintDrift * 0.7 + 17.0);
      // gathered along the sun's path, thicker in a drift, and thinning out
      // where the water turns away to the limb, where they would only crowd
      float gAt = mix(0.94, 0.75, smoothstep(0.30, 0.85, dot(d, uLight)) * uSeaCalm / 0.75) + 0.10 * (0.5 - drift)
                + 0.30 * (1.0 - smoothstep(0.15, 0.55, dot(n, V)));
      float glint = smoothstep(gAt - gw, gAt + gw, gs) * step(0.6, coast);
      c = mix(c, mix(uPaper, uPaperWet, 0.40), glint * (0.45 + 0.50 * smoothstep(0.35, 0.65, drift)));
    }

    // Round five's damp shore — pooled ink, foam and the drowned ground's own
    // colour along every shore the survey draws — is the race week's weather
    // (uDamp); a week laid in other weather keeps its shallows clean.
    float irrC = 0.55 + 0.8 * inkF2(uv * 210.0);
    c = mix(c, mix(c, uInk, 0.55), exp(-coast * 0.42) * 0.68 * irrC * uDamp);
    float foam = smoothstep(0.52, 0.70, inkF3(vW * 0.9 + 17.0)) * exp(-pow((coast - 1.1) / 1.1, 2.0));
    c = mix(c, mix(uFoam, uPaper, 0.35), clamp(foam, 0.0, 1.0) * 0.72 * near * uDamp);
    c = mix(c, mix(c, uShelf, 0.5), exp(-coast * 0.24)
            * (0.28 + 0.68 * inkN3(vW * 0.6 + 5.0)) * 0.55 * mark * uDamp);

    // A week whose sea stands above the globe's relief has all of its land
    // under the orbit's sea (uDrowned): the sea paints the land that stands
    // above it, one flat wash of the week's lowland — its fields, if it grew
    // them — with the paper left where the light lies full on it, both on hard
    // edges.
    if (uDrowned > 0.5) {
      float fl = max(fwidth(landH), 1e-3);
      float lt = dot(d, normalize(uLight)) + 0.14 * (inkF3b(d * 5.0 + 7.0) - 0.5);
      float lw = max(fwidth(lt), 1e-3);
      vec3 landC = uVegAmt > 0.0 ? mix(uVeg, uLitWarm, 0.25) : mix(uLandMid, uLitWarm, 0.4);
      landC = mix(landC, uDry, smoothstep(0.80 - lw, 0.80 + lw, lt));
      c = mix(c, landC, smoothstep(-fl, fl, landH));
    }

    // ---- light.form: the water turns with the ground under the same light, a
    // cool half-tone glazed toward the terminator (see the terrain's own block)
    if (uForm > 0.0) {
      float turnF = 1.0 - smoothstep(-0.15, 0.95, dot(d, normalize(uLight)));
      vec3 coolF = uShadeCool / max(max(uShadeCool.r, uShadeCool.g), max(uShadeCool.b, 1e-3));
      c *= mix(vec3(1.0), coolF * 0.80, turnF * 0.45 * uForm);
    }

    // ---- light.terminator: the night side of the water. The same hand-cut edge
    // the land's night is laid on (inkNight), in the sea's own deep indigo with
    // the shore one step lighter inside it, so the coast keeps its shape in the
    // dark; and the edge the wash stopped on, drawn on the dark side of it.
    // (light.night carries the dried edge and the pack on to its last wash.)
    float nightK = 0.0, deepK = 0.0, edgeK = 0.0, packK = 0.0;
    if (uTerm > 0.0) {
      vec3 nt = inkNight(d, uLight);
      nightK = nt.x * uTerm;
      deepK = nt.z * uTerm;
      edgeK = nt.y * uTerm;
      if (nightK > 0.001) {
        vec3 nightSea = mix(uSeaDeep, uShadeCool, 0.32);
        nightSea = mix(nightSea, uInk, 0.20);
        nightSea = mix(nightSea, mix(uShadeCool, uInk, 0.20), exp(-coast * 0.55) * 0.5);
        // the night sea keeps the day's own values — the shelf, the deep bands,
        // the shore — on its own cool hue, so the water's drawing stays faintly
        // legible and the dark never doubles the day in a mud
        float dayLum = dot(c, vec3(0.32, 0.55, 0.13));
        nightSea *= mix(1.0, 0.70 + 0.68 * smoothstep(0.14, 0.55, dayLum), 0.55);
        c = mix(c, nightSea, nightK * 0.94);
        // and the second wash, deeper, gathered well inside the first
        c = mix(c, mix(nightSea, mix(uInk, uShadeCool, 0.40), 0.32), deepK * 0.55);
        c = mix(c, mix(c, uInk, 0.36), nt.y * uTerm * 0.7);
      }
    }
    // ---- pal.caps: the sea's own ice. It is pack — plates broken by open leads
    // — and never the land's sheet carried out over the water, so what lies at
    // the top of the world on a cold week is a field of floes closing toward the
    // pole and coming apart into open water at its margin (see inkPack). Night
    // takes it as one cool wash over the sheet rather than as the sea's own night
    // colour: ice is lighter than water on either side of the world, and the two
    // are one picture, not two.
    if (uCaps > 0.0) {
      float iceFace = smoothstep(0.10, 0.42, abs(dot(d, V)));
      vec2 pk = inkPack(d, uWarmth, tooth, iceFace);
      float iceK = pk.x * uCaps;
      packK = iceK;
      if (iceK > 0.001 || pk.y > 0.001) {
        // a floe is the sheet a wash has passed over: the snowfield's own
        // hollows in the week's cool shade, and at night one cool wash over the
        // lot — ice is lighter than water on either side of the world, but it is
        // never a flat ring of bare paper lying on the sea. Between and inside
        // the plates is the water itself, which is what makes a pack a pack.
        vec3 iceC = mix(uPaper, uPaperWet, 0.30 * tooth);
        float fine = mix(0.5, inkN3(d * 33.0 + 7.0), iceFace);
        float hollow = smoothstep(0.44, 0.58, inkF3(d * 8.6 + 31.0) * 0.58 + fine * 0.42);
        iceC = mix(iceC, mix(uShadeCool, uPaper, 0.52), 0.30 + 0.30 * hollow);
        // sea ice is thinner than the sheet on the land and it lies on water:
        // one step cooler, so the coast is still a coast where the two meet
        iceC = mix(iceC, uShadeCool, 0.08);
        iceC = mix(iceC, mix(uShadeCool, iceC, 0.55), clamp(nightK, 0.0, 1.0));
        c = mix(c, iceC, iceK);
        // the slush a plate leaves in the water it broke off: a wet edge and
        // never a drawn line, because a pack has a thousand edges and a pen has
        // no business on any of them
        c = mix(c, mix(uShadeCool, c, 0.60), pk.y * uCaps * 0.42);
      }
    }
    float graze = 1.0 - smoothstep(0.04, 0.30, abs(dot(n, V)));
    if (graze > 0.01) {
      float limbN = inkF3(d * 6.0 + 3.0);
      float litSide = smoothstep(-0.12, 0.52, dot(d, uLight));
      // light.night's hard light: a crescent's whole sliver is lit limb
      if (uNight > 0.0) litSide = mix(litSide, smoothstep(-0.04, 0.12, dot(d, uLight)), uNight * uTerm);
      float orbitBreak = smoothstep(0.62, 0.70, limbN);
      c = mix(c, mix(c, uInkSoft, 0.52), graze * (1.0 - litSide) * (0.35 + 0.72 * limbN));
      c = mix(c, mix(uPaper, uSkyWash, 0.13),
              clamp(graze * litSide * (0.30 + 0.90 * limbN), 0.0, 1.0) * orbitBreak * 0.62);
    }
    // ---- light.night: the water's deep night, laid last as the ground's is and
    // in the ground's own pigment (see the terrain's last wash), so the dark
    // side is one mass: the open water a step below the land, so a coast is
    // still a coast in the dark, the shelf along the shore a ghost of value
    // above it, the pack a step of the shade's cool light, the first wash along
    // the terminator a step lighter than the second, and the pigment dried where
    // it stopped.
    if (uNight > 0.0 && nightK > 0.001) {
      vec3 deepC = mix(uInk, uShadeCool, 0.22);
      deepC = mix(vec3(dot(deepC, vec3(0.32, 0.55, 0.13))), deepC, 1.5) * 0.68;
      deepC *= (0.93 + 0.05 * exp(-coast * 0.45)) * (1.0 + 0.30 * packK);
      deepC *= mix(1.07, 0.95, clamp(deepK, 0.0, 1.0));
      c = mix(c, deepC, nightK * uNight);
      c *= 1.0 - edgeK * 0.50 * uNight;
    }
    float darkS = 1.0 - smoothstep(0.08, 0.58, dot(c, vec3(0.32, 0.55, 0.13)));
    float grainDir = inkN3(vec3(flow.x * 0.065, flow.y * 0.28, 19.0));
    c *= 1.0 - clamp(darkS * darkS, 0.0, 1.0) * 0.15
               * (0.24 + 0.92 * tooth) * (0.68 + 0.50 * grainDir) * (1.0 - afarO);
    c = inkAerial(c, dist, uFarGlaze, uFogBase);
    orbitC = c;
    if (uSurface <= 0.0) {
      if (lagoonAbove) discard;
      gl_FragColor = vec4(c, 1.0);
      return;
    }
    c = uCobalt;
  }
  if (uSurface > 0.0) {
    float coast = texture2D(tCoast, inkUV(d)).r;
    float fwc = max(fwidth(coast), 1e-3);
    // motion.living: underfoot the same creep is laid on the shelf's own break,
    // so the deep water's edge creeps the way the orbit's mottling does — and
    // like it, only by day, so the night water keeps its settled dark. Exactly
    // zero with the dial down.
    float shelf = 6.5 + 3.0 * (inkN3(vW * 0.045 + 3.0 + liveDayDrift * 1.6) - 0.5);
    float deep = smoothstep(shelf - fwc, shelf + fwc, coast);
    vec3 open = mix(uCobalt, uTeal, 0.3);
    c = mix(uTeal, open, deep);
    c = mix(c, mix(c, uInk, 0.3), deep * (1.0 - smoothstep(fwc, 3.0 * fwc, coast - shelf)) * 0.45);
    // Distance takes one decisive darker load: near water stays teal, the far
    // half pools cobalt instead of fading into the horizon.
    float fd = max(fwidth(dist), 1e-3);
    float farAt = uFogBase + 10.0 + 8.0 * (inkN3(vW * 0.018 + 9.0) - 0.5);
    vec3 farWater = mix(uCobalt, uInkSoft, 0.12);
    c = mix(c, farWater, smoothstep(farAt - fd, farAt + fd, dist) * 0.88);
    // a few hard strokes laid across the water level with the eye. Each is a
    // short arc of a ring round the viewer, too short to show its curve, at a
    // bearing fixed in the world, so neither a turn of the head nor the
    // camera's own sway drags it; tapered where the brush left the sheet.
    // They are the eye's own and only belong to water it sees at a glance:
    // from over it (a camera coming down, a runner on a cliff over the shallows)
    // they would rule the whole sea with hatching, so they thin to nothing as
    // the view steepens. The swell's lines below are the same device.
    float level = 1.0 - smoothstep(0.35, 0.60, dot(d, V));
    vec3 upC = normalize(cameraPosition);
    vec3 Ec = normalize(uSkyE - upC * dot(uSkyE, upC) + vec3(1e-5, 0.0, 0.0));
    vec3 dv = -V;
    float az = atan(dot(dv, cross(upC, Ec)), dot(dv, Ec)) + 3.14159265;
    float q = log2(max(dist, 1.0)) * 2.4;
    float ring = floor(q);
    float fq = abs(fract(q) - 0.5) / max(fwidth(q), 1e-4);
    float sa = az * 2.5464791;                                   // sixteen slots round the eye
    float slot = floor(sa);
    float halfA = 0.15 + 0.20 * inkH12(vec2(slot, ring + 7.0));
    float cA = 0.5 + (inkH12(vec2(ring + 3.0, slot)) - 0.5) * 0.3;
    float tip = abs(fract(sa) - cA) / halfA;
    float wpx = 1.7 * (1.0 - tip * tip) * step(tip, 1.0) * step(0.55, inkH12(vec2(ring, slot)))
              * step(4.0, dist) * (1.0 - step(90.0, dist)) * level;
    c = mix(c, mix(c, uPaper, 0.90), (1.0 - smoothstep(wpx - 0.6, wpx + 0.6, fq)) * step(0.05, wpx));

    // motion.living: the sea in front of the viewer is on the same clock, and
    // two things about it are the dial times the picture's own time — neither
    // of them computed at the default:
    //   the swell, read here at the viewer's own scale (its wavelength is world
    //     space and not the globe's), crosses the water in front of him and not
    //     the whole sea at once. It is drawn as what a painter draws a swell
    //     with: a line. The crest of each band is laid on the water as a thin
    //     stroke of reserved paper and travels in with the band, so the cue is a
    //     water-shaped mark crossing the sea and not a flat tonal stripe (a flat
    //     stripe reads as a cloud's shadow, which is not water at all);
    //   the wash under it: the flat of the near water is still being laid —
    //     patches of deeper water creep across it on the same drift the orbit's
    //     mottling uses, so the sea is never one flat layer of teal.
    float swellS = 0.0;
    if (uLiving > 0.0) {
      // the swell is laid on the water the viewer is actually looking at, which
      // on foot is usually the shallows and not the open sea: the gate is the
      // water's own edge (coast), not the deep-water break, so it stops only at
      // the foam line
      float wet = smoothstep(0.35, 1.6, coast);
      // a short swell: at a viewer's scale a wavelength of a few units means
      // several crests lie across the water he is looking at, and they cross it
      // in view instead of the whole sea rising at once
      float crest = 0.5 + 0.5 * sin(dot(vW, liveSun) * 2.2 - uTime * 0.55);
      swellS = uLiving * crest;
      float cw = max(0.9 * fwidth(crest), 1e-4);
      // the crest is a line and not a band: it breaks high (0.95) so only the
      // top of the swell is drawn and it is cut at the pixel. The breakup tap is
      // at the scale of a pool and not of a sea — it has to vary across the water
      // the viewer is standing in, or a small pool sits in one lobe of it and no
      // crest is ever laid there — and it passes most of the surface, so the line
      // comes and goes along its length the way a stroke does.
      float sw = inkN3(vW * 0.9 + 11.0) * 0.65 + inkN3(vW * 2.6 + 4.0) * 0.35;
      float swc = 0.42 + 0.06 * (inkN3(vW * 4.0 + 21.0) - 0.5);
      float sww = max(0.9 * fwidth(sw), 1e-4);
      float line = smoothstep(0.95 - cw, 0.95 + cw, crest) * smoothstep(swc - sww, swc + sww, sw) * wet * level;
      c = mix(c, mix(uPaper, uPaperWet, 0.12), line * 0.68);
      float mo = inkF3b(vW * 0.16 + liveDayDrift * 3.5) * 0.72 + inkN3(vW * 0.42 + liveDayDrift * 5.0) * 0.28;
      float mw = max(0.8 * fwidth(mo), 1e-4);
      c = mix(c, mix(c, uInkSoft, 0.45), smoothstep(0.62 - mw, 0.62 + mw, mo) * 0.16 * wet);
    }

    // motion.living: and the sun's own path on the water carries the same dabs
    // — the sheet left dry where the eye and the sun are mirrored off the
    // surface, so the lights run across the water in front of the viewer the
    // way a painter's lights sit on the sea before him: a few of them, each cut
    // on a hard edge and laid at nearly the sheet's own value, and always
    // moving, because the field they are cut from does and the swell that
    // gathers them crosses the water. Nothing here is a highlight — it is the
    // paper, and it is only ever laid where the sun's reflection really falls.
    // With the dial down, none of it is computed.
    if (uLiving > 0.0) {
      vec3 nW = normalize(vN);
      float mirror = dot(reflect(normalize(vW - cameraPosition), nW), normalize(uLight));
      vec3 gp = vW * 0.55 + vec3(uTime * 0.30, uTime * 0.18, uTime * 0.25) + liveSun * (uTime * 0.16);
      float g = inkN3(gp) * 0.66 + inkN3(gp * 2.07 + 11.0) * 0.34;
      float gw = max(1.1 * fwidth(g), 1e-4);
      float cut = 0.72 + 0.05 * (inkN3(vW * 2.7 + 13.0) - 0.5);
      float dab = smoothstep(cut - gw, cut + gw, g);
      float path = smoothstep(0.70, 0.97, mirror);
      c = mix(c, mix(uPaper, uPaperWet, 0.06), clamp(dab * path, 0.0, 1.0) * mix(0.72, 1.0, swellS) * 0.95);
    }

    if (uSwim.w > 0.5) {
      vec3 upS = normalize(uSwim.xyz);
      vec3 fS = normalize(uSwimF.xyz - upS * dot(uSwimF.xyz, upS) + vec3(1e-5, 0.0, 0.0));
      vec3 rel = vW - uSwim.xyz;
      float a = dot(rel, fS), b = dot(rel, cross(upS, fS));
      float pxW = max(length(fwidth(vW)), 1e-4);              // one pixel, in units
      float swimming = step(1.5, uSwim.w);
      vec2 er = mix(vec2(0.22, 0.22), vec2(0.40, 0.22), swimming);
      float dE = (length(vec2(a - 0.10 * swimming, b) / er) - 1.0) * min(er.x, er.y);
      float lw = 0.012 + 1.1 * pxW;                           // a line a brush's width
      // The rig owns the compact hand/foot splashes; the water shader only
      // paints the two hard wake strokes, so no elliptical halo hugs the body.
      float marks = 0.0;
      float speed = uSwimF.w;
      if (speed > 0.02) {
        // the V: two thin strokes that open behind him, thinning to nothing
        float behind = -a - 0.35;
        float L = 2.6 * speed;
        if (behind > 0.0 && behind < L) {
          float wA = lw * (1.0 - 0.7 * behind / L);
          float dA = abs(abs(b) - (0.22 + behind * 0.33));
          float dash = step(0.40, inkN3(vec3(behind * 4.5, sign(b) * 3.0, 11.0)));
          marks = max(marks, (1.0 - smoothstep(wA - pxW, wA + pxW, dA)) * dash);
        }
        // No echo rings: the two divergent strokes are the whole wake, with
        // only one-pixel antialiasing on their dried edges.
      }
      c = mix(c, mix(c, uPaper, 0.9), marks * step(0.0, dE));
      // and the ink line where the body enters the water, drawn last
      float lwI = 0.004 + 0.7 * pxW;
      float enter = (1.0 - smoothstep(lwI - pxW, lwI + pxW, dE)) * step(-pxW, dE)
                  * step(0.38, inkN3(vW * 5.0 + 1.0)) * smoothstep(-0.30, 0.0, a);
      c = mix(c, uInk, enter * 0.85);
    }
  }
  float dark = 1.0 - smoothstep(0.1, 0.6, dot(c, vec3(0.32, 0.55, 0.13)));
  c *= 1.0 - dark * 0.10 * (0.25 + 0.9 * tooth);
  if (uSurface < 1.0) c = mix(orbitC, c, uSurface);
  // Alpha carries the continuous water-to-ground handoff into the sheet pass.
  gl_FragColor = vec4(c, 1.0 - uSurface);
}
`;

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// The sky is painted, not lit. Three washes are laid on the sheet in the order a
// painter lays them: a warm pale band along the horizon, one slate-ultramarine
// wash above it, and a loaded glaze of the same blue across the top. Each stops
// on a dried edge where its pigment pooled. The clouds are never painted at
// all: they are the paper all three washes were laid around, with one flat
// cool grey put under them afterwards. Washes are glazes, so where two overlap
// they multiply, and the tooth of the sheet takes the pigment as granulation.
// Everything is drawn in the sky's own chart — along the horizon and up from it
// — anchored to the world, so a turn of the head brings the next part of the
// same painting into view.
const SKY_FRAG = /* glsl */ `
uniform vec3 uSunDir, uSkyE;
uniform vec3 uSkyHigh, uSkyLow, uSkyBand, uSkyWash, uSkyDeep, uCloudUnder, uPaper, uSkyHaze;
uniform float uEnergy, uSurface, uTime, uCloudRate, uCloudBand;
uniform float uLiving;     // motion.living: with it at 0 the weather here is still, to the pixel
                           // (no beat is read here: the sky's clock is its drift and its crowns)
// the week's own scheme (weekPalette): x lifts the glaze's lower edge, y is
// how high the heat haze reaches, z sizes the clouds, w widens the lifted sun
uniform vec4 uSkyScheme;
uniform float uSkyCirrus;  // cirrus strokes to a cloud station: 2 for the race week
uniform float uAerial;     // light.aerial: the broad glazes keep no continuous outline (see the rims)
varying vec3 vDir;
${NOISE}

// A profile along the horizon, sampled round a circle so that it closes on
// itself: the painting has no seam behind the viewer.
float inkRing(float x, float k, float s){ return inkN2(vec2(cos(x), sin(x)) * k + vec2(s, 1.7 * s)); }

// Billows: value noise folded about its middle, so a threshold of it gives
// rounded lumps with sharp creases between them — a cumulus edge, not a blob.
float inkBillow(vec2 p){ return abs(inkN2(p) * 2.0 - 1.0); }

// One cumulus, flat on the sheet, made the way Season's are. Its crown is a
// row of domes of their own widths and heights, one of them towering, so every
// flank bulges and no slope runs straight; its base is flat; billows at three
// sizes cut its edge into lumps all round, let the blue in through a window or
// two and shed a few rags. p is in radians, x along the horizon and y up from
// the base. Returns the silhouette (x) and the grey laid under it (y), both
// signed, positive inside. The grey's top is its own low, nearly level line —
// it never follows the crown, which would draw a range of peaks inside it.
vec2 inkCumulus(vec2 p, float halfW, float tall, float tower, float seed, int domes){
  float nd = float(domes);
  // the tower is always an inner dome: an end that towers is a wall
  float at = 1.0 + floor(inkH12(vec2(seed, 91.0)) * (nd - 2.0));
  // motion.living: the mass is still growing and settling while the picture
  // runs. The billows of its crown are read through an offset that creeps — a
  // slow circle in the noise's own space — so a flank that was ragged becomes
  // smooth and back again while the mass itself drifts across the sky. The
  // offset is the dial times the clock, exactly zero at the default, and it is
  // laid on the two coarse scales of the billow; the fine tooth is left alone,
  // because what changes about a cloud in six seconds is its shape and not the
  // grain of its edge. The crown's own lift breathes with it, a hair.
  vec2 evo = uLiving * 0.6 * vec2(cos(uTime * 0.090), sin(uTime * 0.062));
  float grow = 1.0 + uLiving * 0.04 * sin(uTime * 0.071 + seed * 3.1);
  float top = -0.3 * tall;
  float xl = 1.0, xr = -1.0;
  for (int i = 0; i < 5; i++) {
    if (i >= domes) break;
    float fi = float(i);
    float ha = inkH12(vec2(seed, fi + 1.0)), hb = inkH12(vec2(fi + 5.0, seed)), hc = inkH12(vec2(seed + 3.0, fi));
    float a = (fi + 0.5) / nd * 2.0 - 1.0;
    float w = halfW * (0.34 + 0.22 * hb) * (1.3 - 0.4 * abs(a));
    float h = tall * grow * (0.45 + 0.40 * hc) * (1.0 - 0.35 * abs(a)) * (fi == at ? 1.0 + tower : 1.0);
    float cx = (a * 0.74 + (ha - 0.5) * 0.25) * halfW;
    float t = (p.x - cx) / w;
    float r2 = max(0.0, 1.0 - t * t);
    top = max(top, h * (0.65 * (sqrt(r2) + r2) - 0.3));
    xl = min(xl, cx - 0.94 * w);
    xr = max(xr, cx + 0.94 * w);
  }
  // toward either end the base curls up, so the mass is lobed on every side
  // and never ends in a square corner, however tall its last dome
  float bl = 0.34 * tall * pow(1.0 - smoothstep(0.0, 0.6 * tall, min(p.x - xl, xr - p.x)), 2.0);
  float e = min(top - p.y, 2.4 * (p.y - bl));
  // the billows scale with the cloud, so a small one is as ragged as a big one
  // instead of a smooth lens
  float k = clamp(1.7 / tall, 8.0, 60.0);
  float b = 0.45 * inkBillow(p * k + seed + evo) + 0.33 * inkBillow(p * k * 2.5 + seed * 1.7 + 3.0 + evo * 0.6)
          + 0.22 * inkBillow(p * min(k * 6.0, 150.0) + seed * 2.3 + 7.0);
  float amp = min(0.5 * tall, 0.045) * mix(0.35, 1.0, smoothstep(0.0, 0.35 * tall, p.y));
  float s = e + amp * (b - 0.34);
  float ul = tall * (0.15 + 0.10 * (inkN2(vec2(p.x * 9.0, seed * 3.1)) - 0.5)
                   + 0.02 * (inkN2(vec2(p.x * 40.0, seed * 5.3)) - 0.5));
  return vec2(s, ul - p.y);
}

void main(){
  vec3 d = normalize(vDir);
  float tooth = inkTooth(gl_FragCoord.xy);
  // Orbit is bare paper; during a landing the painted sky is laid in with the
  // same eased progress as the camera instead of appearing on the final frame.
  float orbitVeil = smoothstep(0.46, 0.70, inkF3b(d * 1.9 + vec3(4.0, 8.0, -3.0)));
  vec3 orbitSky = mix(uPaper, mix(uSkyLow, uSkyHigh, 0.42), orbitVeil * 0.09);
  if (uSurface <= 0.0) {
    gl_FragColor = vec4(orbitSky, 1.0);
    return;
  }
  vec3 up = normalize(cameraPosition);
  vec3 E = normalize(uSkyE - up * dot(uSkyE, up) + vec3(1e-5, 0.0, 0.0));
  vec3 N = cross(up, E);
  float y = dot(d, up);                                 // up from the horizontal
  float x = -atan(dot(d, N), dot(d, E));                 // the fixed sky wash
  float cloudX = x + uTime * uCloudRate * (1.0 + uCloudBand * y);
  // motion.living: the sky's weather is on the same clock. Its stations drift
  // across the painting faster than the sheet's own chart, so the masses travel
  // over the land while the ground turns under them, and each mass is read
  // through an offset that creeps (see inkCumulus) — a crown reshapes as it
  // goes instead of sliding across the blue like a decal. The dial times the
  // clock: at the default this is the still sky, to the pixel.
  cloudX += uLiving * uTime * 0.021 * (1.0 + 0.55 * y);
  float px = max(2e-5, length(fwidth(d)));              // one pixel of the sheet, in radians
  float drama = clamp(uEnergy, 0.0, 1.5);

  // ---- the clouds. Five stations round the horizon, each one dominant mass
  // and a few satellites, so any view holds one mass and some small change.
  const float SP = 1.2566371;
  float q = cloudX / SP;
  float cell = floor(q);
  float u = (q - cell - 0.5) * SP;
  float id = mod(cell, 5.0);
  float h1 = inkH12(vec2(id, 17.0)), h2 = inkH12(vec2(id, 29.0));
  float h3 = inkH12(vec2(id, 41.0)), h4 = inkH12(vec2(id, 43.0));
  float xc = 0.0;
  float halfW = (0.17 + 0.07 * h2) * uSkyScheme.z;
  float tall = (0.14 + 0.06 * h3) * (0.85 + 0.20 * drama) * uSkyScheme.z;
  float yb = -0.205 + 0.035 * h1;
  float sd = -1.0, ul = -1.0;
  vec2 pm = vec2(u - xc, y - yb);
  if (abs(pm.x) < halfW * 1.35 + 0.03 && pm.y > -0.03 && pm.y < tall * 2.2) {
    vec2 cm = inkCumulus(pm, halfW, tall, 0.35 + 0.65 * h4, id * 7.1 + 1.3, 5);
    sd = cm.x;
    ul = cm.y;
  }
  for (int j = 0; j < 3; j++) {
    float fj = float(j);
    float hj = inkH12(vec2(id * 3.0 + fj, 53.0));
    float hk = inkH12(vec2(fj, id * 5.0 + 61.0));
    float sHalf = (0.040 + 0.050 * hk) * (j == 2 ? 0.7 : 1.0);
    float sTall = (0.020 + 0.020 * hk) * (j == 2 ? 0.7 : 1.0);
    float sx = j == 0 ? xc + halfW + 0.10 + 0.14 * hj
             : j == 1 ? xc - halfW - 0.11 - 0.16 * hj
             : xc + (hj - 0.5) * 0.8;
    sx = clamp(sx, -0.50, 0.50);
    float sy = j == 2 ? yb + 0.15 + 0.05 * hk : yb + 0.02 + 0.08 * hj;
    vec2 ps = vec2(u - sx, y - sy);
    // an airless sky (the palette's cloud scale at or under nought: marble.js)
    // keeps no satellites either, as it keeps no dominant mass
    if (uSkyScheme.z > 0.0 && abs(ps.x) < sHalf * 1.35 + 0.03 && ps.y > -0.02 && ps.y < sTall * 1.8 + 0.03) {
      vec2 cs = inkCumulus(ps, sHalf, sTall, 0.3 * hj, id * 13.0 + fj * 3.3 + 5.0, 3);
      if (cs.x > sd) { sd = cs.x; ul = -1.0; }
    }
  }
  // flat cirrus: a couple of long thin strokes of reserved paper high in the
  // loaded glaze, tapered at both ends and broken by the tooth like dry brush
  float wisp = 0.0;
  for (int j = 0; j < 2; j++) {
    float fj = float(j);
    float hw = inkH12(vec2(id * 7.0 + fj, 71.0)), hv = inkH12(vec2(fj + 3.0, id * 11.0 + 73.0));
    float L = 0.10 + 0.14 * hv;
    float t = (u - (hw - 0.5) * (SP - 2.0 * L - 0.1)) / L;
    // (uSkyCirrus is the strokes' count: an airless sky's 0 draws none)
    if (abs(t) < 1.0 && fj < uSkyCirrus) {
      float wy = 0.13 + 0.16 * fract(hw * 7.3 + fj * 0.51) + (hv - 0.5) * 0.03 * t;
      float th = (0.0030 + 0.0035 * hv) * (1.0 - t * t) * (0.55 + 0.9 * inkN2(vec2(u * 60.0, fj + id * 3.0)));
      wisp = max(wisp, smoothstep(-px, px, th - abs(y - wy) + 0.0022 * (tooth - 0.5)));
    }
  }
  // A cold, dry week (uSkyCirrus above 2) combs more out beside each one,
  // shorter and a little above or below it, so a streak is never alone.
  if (uSkyCirrus > 2.5) {
    for (int j = 2; j < 6; j++) {
      float fj = float(j);
      if (fj >= uSkyCirrus) break;
      float lead = mod(fj, 2.0);
      float hw = inkH12(vec2(id * 7.0 + lead, 71.0)), hv = inkH12(vec2(lead + 3.0, id * 11.0 + 73.0));
      float hc = inkH12(vec2(id * 5.0 + fj, 83.0));
      float L0 = 0.10 + 0.14 * hv, L = L0 * (0.5 + 0.4 * hc);
      float t = (u - (hw - 0.5) * (SP - 2.0 * L0 - 0.1) - (hc - 0.5) * 0.16) / L;
      if (abs(t) < 1.0) {
        float wy = 0.13 + 0.16 * fract(hw * 7.3 + lead * 0.51) + (hv - 0.5) * 0.03 * t
                 + (fj < 4.0 ? 1.0 : -1.0) * (0.014 + 0.022 * hc);
        float th = (0.0030 + 0.0035 * hv) * (1.0 - t * t) * (0.55 + 0.9 * inkN2(vec2(u * 60.0, fj + id * 3.0)));
        wisp = max(wisp, smoothstep(-px, px, th - abs(y - wy) + 0.0022 * (tooth - 0.5)));
      }
    }
  }
  // the edge is antialiased over its own gradient, but never wider than a few
  // pixels, so the jump where a station's box ends cannot smear into a line
  float caa = clamp(fwidth(sd), 0.3 * px, 3.0 * px);
  float cloud = smoothstep(-0.75 * caa, 0.75 * caa, sd);
  float cloudRim = (1.0 - cloud) * (1.0 - smoothstep(0.8 * caa, 2.8 * caa, -sd));
  float uaa = clamp(fwidth(ul), 0.3 * px, 3.0 * px);
  float shade = cloud * smoothstep(-0.75 * uaa, 0.75 * uaa, ul);
  float shadeRim = shade * (1.0 - smoothstep(0.6 * uaa, 2.6 * uaa, ul));

  // ---- where each wash stops. The blue comes down to a wandering edge a
  // little above the planet's own horizon, never higher than the cloud bases,
  // and below it the brush was dragged out in two horizontal strokes over the
  // warm band, which has an edge of its own. Over the dry blue a second wash of
  // the same pigment was laid again, not everywhere, and a loaded glaze across
  // the top; every one of them stops on its own dried edge.
  float rr = min(1.0, 120.0 / length(cameraPosition));
  float hz = -sqrt(max(0.0, 1.0 - rr * rr));
  float yA = min(-0.25, hz + 0.26) + 0.030 * (inkRing(x, 2.3, 3.0) - 0.5) + 0.012 * (inkRing(x, 9.0, 11.0) - 0.5);
  float yC = yA + 0.007 * (inkRing(x, 6.0, 31.0) - 0.62);
  float yB = 0.040 + uSkyScheme.x + 0.050 * (inkRing(x, 1.2, 13.0) - 0.5) + 0.040 * (inkRing(x, 2.2, 17.0) - 0.5)
           + 0.018 * (inkRing(x, 6.5, 23.0) - 0.5) + 0.005 * (inkRing(x, 26.0, 37.0) - 0.5);
  float mBand = 1.0 - smoothstep(-px, px, y - yC);
  float mWash = smoothstep(-px, px, y - yA);
  float mGlaze = smoothstep(-px, px, y - yB) * mWash;
  float rimBand = mBand * (1.0 - smoothstep(0.6 * px, 2.4 * px, yC - y));
  float rimWash = mWash * (1.0 - smoothstep(0.6 * px, 2.4 * px, y - yA));
  float rimGlaze = mGlaze * (1.0 - smoothstep(0.6 * px, 2.8 * px, y - yB));
  // the heat haze (uSkyScheme.y, nothing for the race week): a thin warm tint
  // taken into the blue where it meets the horizon, strongest at the wash's
  // own edge and gone below the clouds, never opaque, so the sky stays cooler
  // than the ground it stands on
  float hazeOn = step(1e-4, uSkyScheme.y);
  float mHaze = 0.0;
  if (hazeOn > 0.5) {
    float yH = yA + uSkyScheme.y * (0.75 + 0.5 * inkRing(x, 1.7, 91.0));
    mHaze = 0.55 * (1.0 - smoothstep(yA, yH, y)) * mWash;
  }
  vec3 cq = vec3(cos(x) * 2.3, sin(x) * 2.3, y * 8.5);
  float on2 = inkN3(cq + 21.0) * 0.62 + inkN3(cq * 2.2 + 33.0) * 0.26 + inkN3(cq * 5.1 + 47.0) * 0.12;
  float ofw = max(fwidth(on2), 1e-4);
  float over = smoothstep(0.56 - ofw, 0.56 + ofw, on2) * mWash;
  float overRim = over * (1.0 - smoothstep(0.8 * ofw, 3.0 * ofw, on2 - 0.56));
  float strip = 0.0, stripRim = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float ys = yA - 0.032 - 0.046 * fi + 0.014 * (inkRing(x, 2.8, 50.0 + 7.0 * fi) - 0.5);
    float on = smoothstep(0.40, 0.60, inkRing(x, 3.2, 70.0 + 11.0 * fi));
    float th = (0.012 - 0.0025 * fi) * on * (0.45 + 0.9 * inkRing(x, 8.0, 80.0 + fi));
    float s = th - abs(y - ys) + 0.004 * (tooth - 0.5);
    float m = smoothstep(-px, px, s);
    strip = max(strip, m);
    stripRim = max(stripRim, m * (1.0 - smoothstep(0.5 * px, 2.0 * px, s)));
  }
  strip *= 1.0 - mWash;

  // the load is never one value: heavier toward the top, breathing at the
  // scale of the brush, pooled unevenly along every edge
  float grade = smoothstep(yA, yB, y);
  float uneven = inkF3b(d * 4.6 + vec3(3.0, -5.0, 8.0)) - 0.5;
  float gran = smoothstep(0.25, 0.90, tooth * 0.6 + inkN2(gl_FragCoord.xy * 0.16) * 0.4);
  float pool = 0.45 + 0.90 * inkN3(d * 34.0 + 3.0);
  float free = 1.0 - max(cloud, 0.85 * wisp);

  // a lifted sun: pigment taken back off the sheet with a damp brush — one pale
  // disc, and round it a second, larger lift with a ragged but hard edge where
  // the damp brush stopped: never a drawn ring, never a glow, never a gradient.
  // The halo's edge is cut on its own gradient, raggedness and all, so where
  // its wander runs with the radius it is still a pixel wide, not a blur.
  float sa = acos(clamp(dot(d, normalize(uSunDir)), -1.0, 1.0));
  float disc = 1.0 - smoothstep(0.034 - 1.5 * px, 0.034 + 1.5 * px, sa + 0.002 * (inkN3(d * 90.0) - 0.5));
  float hs = sa - 0.078 * uSkyScheme.w - 0.016 * (inkN3(d * 22.0 + 5.0) - 0.5);
  float hw = max(0.75 * fwidth(hs), 0.5 * px);
  float halo = 1.0 - smoothstep(-hw, hw, hs);
  float keep = 1.0 - max(disc, halo * 0.45);

  // light.aerial: the broadest washes are glazes and not cut paper — the second
  // wash and the loaded glaze stop on their own edge with no line of pooled
  // pigment round them, and the blue's edge over the horizon keeps it only in
  // broken stretches; the clouds keep theirs
  float rimK = 1.0 - uAerial;
  rimWash *= mix(1.0, 0.6 * smoothstep(0.50, 0.70, inkN3(d * 7.0 + 19.0)), uAerial);
  float Db = mBand * free * (1.0 + 0.9 * pool * max(rimBand, cloudRim) + 0.25 * uneven) * (1.0 + 0.10 * gran);
  float Dw = free * (mWash * (0.72 + 0.34 * grade + 0.30 * uneven) + 0.50 * strip + 0.40 * over
           + 0.55 * pool * max(max(rimWash, stripRim), max(overRim * rimK, cloudRim * mWash))) * (1.0 + 0.16 * gran);
  float Dg = mGlaze * free * (1.0 + 0.30 * uneven + 0.6 * pool * max(rimGlaze * rimK, cloudRim)) * (1.0 + 0.26 * gran);
  // the haze veils the clouds' own shadow as it veils the blue
  float Du = shade * (1.0 + 0.6 * pool * shadeRim) * (1.0 + 0.10 * gran) * (1.0 - 0.5 * mHaze);
  Db *= keep; Dw *= keep; Dg *= keep;

  vec3 Tb = uSkyBand / uPaper;
  vec3 Tw = mix(uSkyWash, uSkyHaze, max(mHaze, 0.55 * strip * hazeOn)) / uPaper;
  vec3 Tg = uSkyDeep / uSkyWash;
  vec3 Tu = uCloudUnder / uPaper;
  vec3 c = uPaper * pow(Tb, vec3(Db)) * pow(Tw, vec3(Dw)) * pow(Tg, vec3(Dg)) * pow(Tu, vec3(Du));
  c *= 1.0 - 0.045 * (tooth - 0.5);
  if (uSurface < 1.0) c = mix(orbitSky, c, uSurface);
  gl_FragColor = vec4(c, 1.0);
}
`;


// Pass one: the sheet. What is left of wet-in-wet (pigment creeping a pixel or
// two across a boundary that was still damp), blooms where a wash dried on
// itself, and the granulation that settles into the tooth of the paper. The dried
// rims are not drawn here: a wash draws its own rim, where it knows where its own
// edge is. An edge detected in the colour buffer cannot tell a wash boundary from
// the silhouette of an object, which is how a halo gets painted round a figure.
const WASH_FRAG = /* glsl */ `
uniform sampler2D tDiffuse, tDepth;
uniform vec2 uRes;
uniform float uNear, uFar, uSurface;
uniform vec3 uInk, uPaper;
uniform vec2 uGlobe;       // the planet's centre on the sheet, in pixels
// light.atmosphere: the world's own edge, uRim is the disc's radius in pixels
// (0 underfoot), uSunAz the light's bearing on the sheet and uSunSep how far it
// stands off the eye (see makePost and the band below)
uniform float uAtmo, uRim, uSunSep;
uniform float uScatter;       // light.scatter: the air seen across the lit face (see its block)
uniform float uForm;          // light.form: its half-light kept under a real terminator
uniform float uTerm, uNight;  // light.terminator × light.night: a deep night keeps its air on the lit limb
uniform vec2 uSunAz;
uniform vec3 uSkyWash, uSkyDeep;
// light.atmosphere over deep space (sky.space): the air beyond the limb is light
// rather than a wash (see the glow below). uSpace is the space dial as the
// landing lifts it, uAir how much air the week's body keeps (none for a body
// that draws its own limb) and uEmber how much of it is a lava world's smoke;
// the rest is the frame in the world: the eye, the camera's own right, up and
// forward, its lens, the sea-level sphere the limb stands on, how far the
// world's relief reaches above it, and the light the globe is painted with.
uniform float uSpace, uAir, uEmber, uRho, uReach;
uniform vec3 uEye, uCamR, uCamU, uCamF, uLightW;
uniform vec2 uTanW;
uniform vec3 uLitWarm, uVerm, uCobalt;
varying vec2 vUv;
${NOISE}
float linZ(float d){ float z = d * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }
void main(){
  vec2 px = 1.0 / uRes;
  vec2 q = vUv * vec2(uRes.x / uRes.y, 1.0);
  float sky = step(0.99998, texture2D(tDepth, vUv).x);
  vec4 c4 = texture2D(tDiffuse, vUv);
  vec3 c = c4.rgb;
  float land = c4.a;                    // the sea's clear alpha fades with the surface handoff
  float tooth = inkTooth(gl_FragCoord.xy);
  float lum = dot(c, vec3(0.32, 0.55, 0.13));

  // ---- wet-in-wet, and only that: where one wash was laid into another still
  // damp, the pigment creeps across the boundary — a pixel or two, not a blur.
  // A *wash* boundary is broad; the edge of an object is narrow, and an object is
  // drawn on top of the sheet, so only the first one takes the bleed. Neither it
  // nor the bloom below is laid on the sky (both are weighted by 1 - sky), so a
  // sky pixel takes none of their taps.
  if (sky < 0.5) {
  vec3 dx = texture2D(tDiffuse, vUv + vec2(px.x * 2.0, 0.0)).rgb - texture2D(tDiffuse, vUv - vec2(px.x * 2.0, 0.0)).rgb;
  vec3 dy = texture2D(tDiffuse, vUv + vec2(0.0, px.y * 2.0)).rgb - texture2D(tDiffuse, vUv - vec2(0.0, px.y * 2.0)).rgb;
  vec2 g2 = vec2(dot(dx, vec3(0.333)), dot(dy, vec3(0.333)));
  float gm = length(g2);
  vec2 gdir = gm > 1e-6 ? g2 / gm : vec2(0.0);

  float rw = 11.0;
  vec3 bx = texture2D(tDiffuse, vUv + vec2(px.x * rw, 0.0)).rgb - texture2D(tDiffuse, vUv - vec2(px.x * rw, 0.0)).rgb;
  vec3 by = texture2D(tDiffuse, vUv + vec2(0.0, px.y * rw)).rgb - texture2D(tDiffuse, vUv - vec2(0.0, px.y * rw)).rgb;
  float broad = clamp((length(bx) + length(by)) * 2.4 / max(1e-4, gm), 0.0, 1.0);
  float creep = clamp(gm * 1.6, 0.0, 1.0) * smoothstep(0.45, 0.90, broad)
              * (1.0 - sky) * mix(0.22, 1.0, uSurface) * land;
  if (creep > 0.03) {
    vec2 nz = vec2(inkF2(q * 5.0 + 3.0), inkF2(q * 5.0 + 17.0)) - 0.5;
    vec2 off = (-gdir * (0.6 + 1.8 * creep) + nz * 1.5) * px;
    vec3 src = texture2D(tDiffuse, vUv + off).rgb;
    c = mix(c, mix(c, src, 0.50), creep * 0.32);
  }

  // ---- a bloom: pigment caught in its own edge while the paper was still wet.
  // One or two of them in a loaded wash, never a pattern over the frame.
  float bl = inkF2(q * 5.0 + 11.0);
  float ring = smoothstep(0.38, 0.47, bl) * (1.0 - smoothstep(0.53, 0.62, bl));
  ring *= smoothstep(0.16, 0.60, 1.0 - lum) * (1.0 - sky) * land;
  c = mix(c, mix(c, uInk, 0.24), ring * 0.28);
  }

  // ---- the limb seen from orbit. Where the globe meets the sheet a thin line
  // of pooled pigment finds its edge: broken where the brush lifted, heavier
  // and lighter along its length, lost only on the arc the key light is on
  // (the upper right of the picture), and never under the race line, which
  // carries that edge itself. The edge is the frame's own depth, not a line of
  // the world, so this stroke follows whatever silhouette the terrain mesh drew
  // — a rim chewed by relief, or, with craft.limb up (PLANET_VERT), the one
  // smooth curve of the macro swell. Nothing here has to be told which.
  if (uSurface < 1.0 && sky < 0.5) {
    float e1 = max(max(step(0.99998, texture2D(tDepth, vUv + vec2(px.x, 0.0)).x),
                       step(0.99998, texture2D(tDepth, vUv - vec2(px.x, 0.0)).x)),
                   max(step(0.99998, texture2D(tDepth, vUv + vec2(0.0, px.y)).x),
                       step(0.99998, texture2D(tDepth, vUv - vec2(0.0, px.y)).x)));
    float e2 = max(max(step(0.99998, texture2D(tDepth, vUv + vec2(px.x * 2.0, 0.0)).x),
                       step(0.99998, texture2D(tDepth, vUv - vec2(px.x * 2.0, 0.0)).x)),
                   max(step(0.99998, texture2D(tDepth, vUv + vec2(0.0, px.y * 2.0)).x),
                       step(0.99998, texture2D(tDepth, vUv - vec2(0.0, px.y * 2.0)).x)));
    float edge = max(e1, 0.6 * e2);
    if (edge > 0.0) {
      vec2 rel = gl_FragCoord.xy - uGlobe;
      float rl = max(length(rel), 1.0);
      float s = atan(rel.y, rel.x) * rl;                    // along the limb, in pixels
      float lost = smoothstep(0.86, 0.97, dot(rel / rl, vec2(0.7071)) + 0.08 * (inkN2(vec2(s * 0.02, 5.0)) - 0.5));
      float held = step(0.30, inkN2(vec2(s * 0.05, 11.0)));
      float weight = 0.55 + 0.45 * inkN2(vec2(s * 0.016, 17.0));
      // the race line near: vermilion is red well past its green and blue
      float verm = step(1.45 * c.g, c.r) * step(0.2, c.r - max(c.g, c.b));
      for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.7853982;
        vec3 k = texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * px * 5.0).rgb;
        verm = max(verm, step(1.45 * k.g, k.r) * step(0.2, k.r - max(k.g, k.b)));
      }
      c = mix(c, mix(c, uInk, 0.55), edge * held * weight * (1.0 - lost) * (1.0 - verm) * (1.0 - uSurface));
    }
  }

  // ---- light.atmosphere. Everything the world holds beyond its own edge, from
  // orbit: a thin band of the sky's own wash laid on the sheet just outside the
  // silhouette — two to four hundredths of the radius, thickest where the brush
  // was loaded, stopping on a hand-cut and broken outer edge — strongest on the
  // side the light comes from and thinning round to the night side, where it is
  // the sky's deep blue under the same wash. It is a wash and not a glow: the
  // inner edge is the drawn silhouette's own ink line, the outer one is where the
  // brush ran out, and between them there is no falloff — only the sheet's tooth
  // taking the pigment. Drawn where the depth buffer is sky beside the world,
  // which is also the only place a limb of the world can be — and laid against
  // that depth, not against a circle struck from the disc's centre: a limb chewed
  // by a range holds the wash at the range's own edge, and deep water's smooth
  // rim holds it where the water is. (A circle would be hidden behind every
  // mountain, because the relief the globe is drawn with is a tenth of its
  // radius.)
  if (uAtmo > 0.001 && uRim > 1.0 && uSurface < 1.0) {
   // on paper the air is this wash; deep space (uSpace, below) takes it over
   if (sky > 0.5 && uSpace < 0.999) {
    vec2 rel = gl_FragCoord.xy - uGlobe;
    float r = length(rel) / uRim;
    if (r > 0.84 && r < 1.20) {
      float azi = atan(rel.y, rel.x);
      vec2 ring = vec2(cos(azi), sin(azi));
      // the band is not one width the whole way round: the brush is loaded where
      // it is loaded and runs out where it runs out
      float load = inkN2(ring * 2.1 + 9.0) * 0.62 + inkN2(ring * 6.4 + 21.0) * 0.38;
      float wide = (0.022 + 0.014 * load + 0.006 * (inkN2(ring * 17.0 + 3.0) - 0.5)) * mix(0.5, 1.0, uAtmo);
      // light.night: the air over a crescent is the one wash beside the sliver.
      // It is a narrow stroke, laid fullest at the light's own bearing and drawn
      // thinner toward the crescent's two tips, where it runs out (see below)
      float nightA = uNight * uTerm;
      float sunward = smoothstep(0.0, 0.85, dot(ring, uSunAz));
      if (nightA > 0.0) wide *= mix(1.0, 0.30 + 0.55 * sunward, nightA);
      // the run-out: where the brush was loaded it carries the wash further and
      // leaves the pigment gathered along its edge, and where it was not the wash
      // simply stopped — so the outer edge is lobed and broken, never a second
      // circle struck about the first
      float hold = smoothstep(0.32, 0.68, inkN2(ring * 4.1 + 11.0) * 0.55 + inkN2(ring * 13.0 + 23.0) * 0.30
                                            + inkN2(ring * 31.0 + 5.0) * 0.15);
      // the two rings: a pixel the world is within part of the band's width of,
      // and one within the whole of it. Six taps each, their angles jittered at
      // the sheet's own scale, so the edge is a brush's and not a polygon's.
      float jit = inkN2(gl_FragCoord.xy * 0.12 + 3.0);
      float near = 0.0, far = 0.0;
      for (int i = 0; i < 6; i++) {
        float a = (float(i) + jit) * 1.0471976;
        vec2 o = vec2(cos(a), sin(a));
        near = max(near, step(texture2D(tDepth, vUv + o * (wide * 0.62 * uRim * px)).x, 0.99998));
        far = max(far, step(texture2D(tDepth, vUv + o * (wide * (0.80 + 0.42 * hold) * uRim * px)).x, 0.99998));
      }
      float band = max(near * (0.72 + 0.14 * load), far * (0.50 + 0.62 * hold));
      // the light's own bearing on the sheet (uSunAz): the wash gathers on that
      // side, and where the light stands square on the painter (uSunSep) the
      // ring is even the whole way round, because a poster lit front-on has no
      // lit limb to gather on
      float side = dot(ring, uSunAz);
      float lit = mix(0.44, 0.34 + 0.72 * smoothstep(-0.25, 0.75, side), uSunSep);
      vec3 ac = mix(uSkyWash, uPaper, 0.22);
      ac = mix(ac, mix(uSkyDeep, uPaper, 0.10), clamp(1.0 - lit, 0.0, 1.0) * 0.7);
      // light.night: a deep night keeps its air on the lit arc and nowhere else.
      // There the band is the sky's own blue, lifted to a pale accent at the
      // light's own bearing, and it runs out to nothing toward both tips of the
      // crescent: the night side gets no halo, so the dark disc is parted from
      // the dark beyond only by the stars it hides.
      if (nightA > 0.0) {
        vec3 air = mix(mix(uSkyWash, uSkyDeep, 0.35), mix(uSkyWash, uPaper, 0.55), smoothstep(0.55, 1.0, side));
        lit = mix(lit, sunward, nightA);
        ac = mix(ac, air, nightA);
      }
      float a = band * lit * (0.86 + 0.24 * (tooth - 0.5)) * (0.55 + 0.70 * inkN2(ring * 7.3 + 31.0)) * (1.0 - uSurface);
      c = mix(c, ac, clamp(a, 0.0, 0.9) * (1.0 - uSpace));
    }
   }

   // ---- over deep space the air is light. A painter lays it in gouache over
   // the dried black: one loaded stroke of the sky's palest blue hugging the lit
   // limb, the week's own blue let into the black beside it, and a long thin
   // scatter of its deep blue beyond that — brightest where the light comes
   // from, warmed to the week's own light and its vermilion where the limb
   // crosses the terminator (the air up there is still in the sun when the
   // ground under it has gone into the night), and gone on a true night side.
   // It is read off the ray itself rather than off a circle on the sheet: how
   // close each pixel's ray comes to the sea-level sphere is how much air it
   // crosses, so the rim is exact on an off-centre crescent, a hero shot or a
   // long lens alike. The depth decides what the air lies over: open sky and
   // anything past the limb take the glow, the world's own ground takes the
   // veil of air it is seen through near its edge, and a ring or a moon in front
   // of the world takes none.
   if (uSpace > 0.001 && uAir > 0.001) {
    vec2 ndc = vUv * 2.0 - 1.0;
    vec3 ray = normalize(uCamF + uCamR * (ndc.x * uTanW.x) + uCamU * (ndc.y * uTanW.y));
    float tca = -dot(uEye, ray);
    float hh = sqrt(max(dot(uEye, uEye) - tca * tca, 0.0));
    float up = hh / uRho - 1.0;            // the ray's least height over the sea, in radii
    if (tca > 0.0 && up > (uScatter > 0.0 ? -1.0 : -0.30) && up < 0.30) {
      float tp = linZ(texture2D(tDepth, vUv).x) / max(1e-4, dot(ray, uCamF));
      float rp = length(uEye + ray * tp);
      float world = (1.0 - sky) * step(rp, uRho + uReach);
      float open = max(sky, (1.0 - sky) * (1.0 - world) * step(tca, tp));
      if (open + world > 0.0) {
        // where the ray meets the air: the point it grazes, or where it meets
        // the sea-level sphere, and how high the light stands over that
        float th = up < 0.0 ? tca - sqrt(max(uRho * uRho - hh * hh, 0.0)) : tca;
        float sunE = dot(normalize(uEye + ray * th), uLightW);
        float nightA = uNight * uTerm;
        // With a real sun (light.terminator) the air is lit where its own sun
        // is up, warmed where it is setting and dark under a true night. A
        // flat-lit poster has no night on its ground and none in its air: there
        // the air gathers toward the side the light comes from (its bearing
        // across the eye), and a poster lit square from the front is lit evenly
        // all the way round.
        vec3 ed = normalize(uEye);
        float sepW = max(length(uLightW - ed * dot(uLightW, ed)), 1e-3);
        float side = clamp(sunE / sepW, -1.0, 1.0);
        float flatLit = mix(0.52, 0.14 + 0.86 * smoothstep(-0.40, 0.85, side), uSunSep);
        float day = smoothstep(-0.05, 0.42, sunE);
        float realLit = max(day, 0.10 * (1.0 - nightA));
        // the dusk: where the limb crosses the terminator. Under a real sun that
        // is a narrow band of the light's own elevation; on a flat poster the
        // terminator still crosses the limb at its two flanks (square to the
        // light's bearing), and the air there takes the week's warm light
        // across a wider arc, so the ring runs from the sunward blue through a
        // warm flank to the deep blue of its far side
        float duskReal = exp(-(sunE + 0.03) * (sunE + 0.03) / (sunE < -0.03 ? 0.0040 : 0.0100));
        float duskFlat = exp(-(side + 0.12) * (side + 0.12) / 0.045) * 0.62 * uSunSep;
        float dusk = mix(duskFlat, duskReal, uTerm);
        float duskK = clamp(dusk * (1.0 - smoothstep(0.10, 0.40, mix(side, sunE, uTerm))), 0.0, 1.0);
        float illum = max(mix(flatLit, realLit, uTerm), duskReal * 0.90 * uTerm);
        // the air lit from behind: looking toward the light through the limb
        // (a crescent) the stroke is loaded far past its daylight weight
        float fwd = pow(max(dot(ray, uLightW), 0.0), 6.0);
        // the brush: loaded where it is loaded along the limb, and its edge cut
        // by hand, read round the disc on the sheet so it is the painter's
        // stroke and never a pattern carried round with the world. The scatter
        // runs out on lobes of its own and settles in the tooth of the paper.
        vec2 rel = gl_FragCoord.xy - uGlobe;
        float azi = atan(rel.y, rel.x);
        vec2 ring = vec2(cos(azi), sin(azi));
        float load = inkN2(ring * 2.3 + 41.0) * 0.6 + inkN2(ring * 7.1 + 13.0) * 0.4;
        // wide and soft, thinner where the air is unlit, so the far limb never
        // carries a ring of its own
        float hr = 0.042 * (0.60 + 0.80 * load) * mix(0.6, 1.0, uAtmo) * (1.0 + 0.6 * fwd) * mix(0.55, 1.0, smoothstep(0.10, 0.80, illum));
        float above = max(up, 0.0);
        float rim = exp(-above / hr);
        float lobe = 0.70 + 0.60 * inkN2(ring * 4.7 + 17.0);
        float halo = exp(-above / (hr * 3.2 * lobe));
        // light.scatter: the dusk is the air's thinnest edge, a band hugging the
        // limb, so where the limb crosses the terminator the wide scatter beyond it
        // keeps the air's own blue and no plume of the warm light stands into the void
        halo *= 1.0 - 0.85 * duskK * uScatter;
        // the loaded stroke: only on the strongest sunward arc, and dry-brushed
        // so the tooth breaks it
        float cut = hr * (0.30 + 0.20 * (inkN2(ring * 19.0 + 7.0) - 0.5));
        float pxR = 1.0 / uRim;
        float core = (1.0 - smoothstep(cut - pxR, cut + 2.0 * pxR, above)) * smoothstep(0.55, 0.95, illum)
                   * smoothstep(0.35, 0.70, 0.55 * tooth + 0.45 * inkN2(ring * 31.0 + 29.0));
        // the week's air. Its blue is a sky blue taken toward the week's own (a
        // hot week's runs teal, a cold one's periwinkle), its scatter is the
        // week's own deep sky with the chroma let back in, and the loaded stroke
        // is that blue lifted nearly to the light; at the terminator the week's
        // light and its vermilion, and over a lava world its own smoke, lit from
        // under by the melt
        vec3 wk = mix(uSkyWash, uCobalt, 0.45);
        float wl = dot(wk, vec3(0.30, 0.59, 0.11));
        vec3 airBlue = clamp(mix(vec3(0.40, 0.64, 1.0), mix(vec3(wl), wk, 2.3) * 1.18, 0.42), 0.0, 1.0);
        vec3 dk = mix(uSkyDeep, uCobalt, 0.50);
        float dl = dot(dk, vec3(0.30, 0.59, 0.11));
        vec3 airDeep = clamp(mix(vec3(dl), dk, 2.0) * 1.05, 0.0, 1.0);
        vec3 airHi = mix(airBlue, uPaper, 0.78);
        vec3 dw = mix(uLitWarm, uVerm, 0.52);
        float dwl = dot(dw, vec3(0.30, 0.59, 0.11));
        vec3 duskC = clamp(mix(vec3(dwl), dw, 1.5), 0.0, 1.0);
        vec3 duskHi = mix(uLitWarm, vec3(1.0), 0.30);
        airHi = mix(airHi, mix(uVerm, uPaper, 0.45), uEmber);
        airBlue = mix(airBlue, mix(uVerm, uLitWarm, 0.25), uEmber);
        airDeep = mix(airDeep, uVerm * 0.45, uEmber);
        // laid as pigment over the black, not added light: the week's deep sky
        // where the air is thin, its blue nearer the limb, its pale on the
        // loaded arc, and its light and vermilion where the limb meets dusk
        vec3 paint = mix(mix(airDeep, airBlue, rim), airHi, clamp(0.8 * core + 0.3 * rim * rim, 0.0, 1.0));
        paint = mix(paint, mix(duskC, duskHi, rim * rim), duskK * 0.85 * (1.0 - uEmber));
        float k = uSpace * uAir * mix(0.55, 1.0, uAtmo) * (1.0 - uSurface);
        // (light.scatter: at dusk the stroke is drawn thinner still, so the warm
        // light is a band along the limb and never a flame standing off it)
        float rimA = rim * mix(1.0, rim * rim, duskK * uScatter);
        float aGlow = (0.70 * rimA + 0.38 * halo + 0.30 * core) * illum * (1.0 + 1.6 * fwd)
                    * (0.80 + 0.40 * load) * (0.66 + 0.68 * tooth) * k;
        c = mix(c, paint, clamp(aGlow, 0.0, 0.88) * open);
        // the ground near its own edge is seen through the air: a veil of the
        // air's own blue, gathered at the lit limb and gone a few hundredths of
        // the radius in, so the edge of the world is light where the air is
        float mu = sqrt(max(1.0 - (up + 1.0) * (up + 1.0), 0.0));
        float veil = up < 0.0 ? exp(-mu / 0.12) : 0.65 * rim;
        vec3 veilC = mix(mix(airHi, airBlue, 0.55), duskC, duskK * 0.6 * (1.0 - uEmber));
        float vLit = max(mix(flatLit * flatLit, day, uTerm), duskReal * 0.8 * uTerm);
        c = mix(c, veilC, clamp(veil * vLit * (1.0 + 1.2 * fwd) * 0.80 * k, 0.0, 0.85) * world);
        // ---- light.scatter. The air is seen across the whole lit face and not
        // only at its edge: the path a ray takes through it grows toward the limb
        // (1/mu), so the week's blue is laid over the ground as one graded glaze
        // gathered on the lit side; where the light turns, the ground and the
        // weather on it take the warm of a low sun; and the side turned from the
        // light sinks into the air's own deep blue rather than a grey. It is read
        // off the sea-level sphere, so land, water and cloud take it alike, and it
        // is laid as glazes over what the passes drew.
        if (uScatter > 0.0 && world > 0.0) {
          float sk = uScatter * k * world;
          float litS = smoothstep(-0.12, 0.40, sunE);
          float path = up < 0.0 ? exp(-mu / 0.24) : 1.0;
          c = mix(c, mix(airBlue, airHi, 0.40), clamp(path * litS * 0.55 * sk, 0.0, 0.75));
          // a glaze darkens and turns, it never lifts: its tint is the pigment's
          // hue at full strength in its strongest channel
          vec3 warmT = mix(duskC, duskHi, 0.5);
          warmT /= max(max(warmT.r, warmT.g), max(warmT.b, 1e-3));
          vec3 coolT = airDeep / max(max(airDeep.r, airDeep.g), max(airDeep.b, 1e-3));
          float turn = exp(-(sunE - 0.10) * (sunE - 0.10) / 0.020) * (1.0 - uEmber);
          c *= mix(vec3(1.0), warmT, turn * 0.40 * sk);
          // the face turns from the light across its whole breadth and not only at
          // the terminator: a broad half-light graded from the lit face to the turn,
          // and past the turn the shade side in the air's deep blue (a real night,
          // light.terminator, keeps its own; light.form keeps the half-light on its
          // day side, so a crescent's lit face still turns)
          float halfK = mix(1.0 - uTerm, 1.0 - uTerm * (1.0 - smoothstep(-0.02, 0.12, sunE)), uForm);
          float away = ((1.0 - smoothstep(0.02, 0.80, sunE)) * 0.20 * halfK
                        + (1.0 - smoothstep(-0.50, 0.04, sunE)) * 0.36 * (1.0 - uTerm))
                     * (1.0 - 0.7 * turn) * (1.0 - uEmber);
          c *= mix(vec3(1.0), coolT, away * sk);
        }
      }
    }
   }
  }

  // ---- cold-press paper. The sheet is quiet when empty; granulation appears
  // only where a dark wash carries pigment into its tooth. motion.living never
  // enters this pass: the tooth and the grain are read at the fragment's own
  // pixel (inkTooth, inkSheet of gl_FragCoord.xy) and are never given the
  // picture's clock, so the paper the painting is on stays the paper the viewer
  // is looking at and can never swim, however the washes above it move. The
  // same is true of the hatching in the hand's own pass.
  float pigment = smoothstep(0.035, 0.24, distance(c, uPaper));
  float dark = (1.0 - smoothstep(0.10, 0.62, lum)) * pigment;
  c *= 1.0 - clamp(dark * dark, 0.0, 1.0) * 0.16 * (0.24 + 0.96 * tooth) * (1.0 - sky);
  float paper = (inkSheet(gl_FragCoord.xy) - 0.5) * 0.010 + (tooth - 0.5) * 0.006;
  c *= 1.0 + paper * (1.0 - 0.45 * dark);
  float de = min(min(vUv.x, 1.0 - vUv.x) * uRes.x, min(vUv.y, 1.0 - vUv.y) * uRes.y);
  float deck = smoothstep(5.0, 1.0, de + 2.4 * inkH12(floor(gl_FragCoord.yx * vec2(0.5, 0.7))));
  c = mix(c, mix(c, uPaper, 0.6), deck * 0.28);
  gl_FragColor = vec4(c, 1.0);
}
`;

// Pass two: the hand. Contours only where a scene has marks worth drawing —
// major silhouettes and the few folds of a landform — as a brush line whose
// weight swells and thins along the stroke, that breaks where it was lifted and
// where the form turns into the light, and that is drawn by hand rather than
// snapped to the mesh that happens to carry it.
const INK_FRAG = /* glsl */ `
uniform sampler2D tWash, tDepth;
uniform vec2 uRes;
uniform vec2 uTanHalf;
uniform float uNear, uFar;
uniform float uDetail;   // feature LOD (base.js): 1 draws the creases, 0 gives them up
uniform float uAerial, uSurface, uHz;  // light.aerial: the hand thins with the distance underfoot
uniform vec3 uInk, uSepia;
varying vec2 vUv;
${NOISE}
float linZ(float d){ float z = d * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }
vec3 vpos(vec2 uv, float z){ return vec3((uv * 2.0 - 1.0) * uTanHalf * z, -z); }
// The surface normal, reconstructed from the depth. Taps are clamped to what a
// steep-but-continuous surface could do over that offset, so a normal sampled
// across a cut still describes the ground in front rather than the void behind
// it — without this the planet's own limb loses its line.
vec3 nrmAt(vec2 uv, float rpx, vec2 px){
  float z0 = linZ(texture2D(tDepth, uv).x);
  float lim = max(0.02, 5.2 * uTanHalf.y * abs(z0) * px.y * rpx);
  vec2 o = px * rpx;
  float za = clamp(linZ(texture2D(tDepth, uv + vec2(o.x, 0.0)).x), z0 - lim, z0 + lim);
  float zb = clamp(linZ(texture2D(tDepth, uv - vec2(o.x, 0.0)).x), z0 - lim, z0 + lim);
  float ze = clamp(linZ(texture2D(tDepth, uv + vec2(0.0, o.y)).x), z0 - lim, z0 + lim);
  float zf = clamp(linZ(texture2D(tDepth, uv - vec2(0.0, o.y)).x), z0 - lim, z0 + lim);
  vec3 a = vpos(uv + vec2(o.x, 0.0), za);
  vec3 b = vpos(uv - vec2(o.x, 0.0), zb);
  vec3 e = vpos(uv + vec2(0.0, o.y), ze);
  vec3 f = vpos(uv - vec2(0.0, o.y), zf);
  vec3 n = normalize(cross(a - b, e - f));
  return n.z < 0.0 ? -n : n;
}
// How far a neighbour sits behind the surface the pixel's own plane predicts,
// less everything a slope break could account for. Positive means the ground is
// cut rather than merely folded — which is the only thing a brush draws.
float dipAt(vec2 uv, vec3 p0, vec3 n0, vec2 dir, float rpx, vec2 px){
  vec2 o = dir * px * rpx;
  vec3 p = vpos(uv + o, linZ(texture2D(tDepth, uv + o).x));
  float pred = -(n0.x * (p.x - p0.x) + n0.y * (p.y - p0.y)) / max(0.06, n0.z);
  float lateral = length(vec2(p.x - p0.x, p.y - p0.y));
  return (pred - (p.z - p0.z) - 1.9 * lateral) / max(0.35, abs(p0.z));
}
void main(){
  vec2 px = 1.0 / uRes;
  float d0 = texture2D(tDepth, vUv).x;
  float sky = step(0.99998, d0);
  vec2 q = vUv * vec2(uRes.x / uRes.y, 1.0);
  float tooth = inkTooth(gl_FragCoord.xy);
  vec3 c = texture2D(tWash, vUv).rgb;

  // ---- the hand: no stroke here is ruled, and none of it follows the mesh.
  // Every sample the contour test takes is a few pixels off the ruler, so a line
  // cannot run straight along a polygon edge and cannot kink at a vertex.
  vec2 jit = (vec2(inkF2(q * 1.4), inkF2(q * 1.4 + 29.0)) - 0.5) * 3.4
           + (vec2(inkF2(q * 5.2), inkF2(q * 5.2 + 13.0)) - 0.5) * 1.7;
  vec2 uv = vUv + jit * px;
  float zC = linZ(texture2D(tDepth, uv).x);
  // The contour and crease tests below are laid only off the sky and nearer than
  // the lines' own far fade (both weight the line: 1 - sky, nearLine), so a sky
  // pixel, and the whole globe from orbit, takes none of their taps.
  float nearLine = 1.0 - smoothstep(105.0, 245.0, abs(zC));
  // light.aerial: underfoot a far range keeps a thinner line than the ridge in
  // front of it, fitted to the eye's own horizon
  nearLine *= 1.0 - 0.6 * uAerial * uSurface * smoothstep(0.45 * uHz, 1.4 * uHz, abs(zC));
  float inkLine = 0.0, wob = 0.0;
  if (sky < 0.5 && nearLine > 0.0) {
  vec3 pC = vpos(uv, zC);
  vec3 n0 = nrmAt(uv, 1.6, px);

  // ---- silhouette. A real cut survives two brush widths; a depth-quantised
  // ground facet at grazing angle does not. The one-sided test keeps a step to
  // one line rather than drawing a pair of ghosts.
  float sil = 0.0;
  sil = max(sil, min(dipAt(uv, pC, n0, vec2(1.0, 0.0), 3.4, px), dipAt(uv, pC, n0, vec2(1.0, 0.0), 7.2, px)));
  sil = max(sil, min(dipAt(uv, pC, n0, vec2(-1.0, 0.0), 3.4, px), dipAt(uv, pC, n0, vec2(-1.0, 0.0), 7.2, px)));
  sil = max(sil, min(dipAt(uv, pC, n0, vec2(0.0, 1.0), 3.4, px), dipAt(uv, pC, n0, vec2(0.0, 1.0), 7.2, px)));
  sil = max(sil, min(dipAt(uv, pC, n0, vec2(0.0, -1.0), 3.4, px), dipAt(uv, pC, n0, vec2(0.0, -1.0), 7.2, px)));
  sil *= smoothstep(0.14, 0.32, n0.z);

  // ---- crease: a landform folds, and it folds at every size. A single vertex,
  // or the facet of the mesh carrying it, is a difference that is gone by the
  // time the same test is run over a wider neighbourhood — so a fold has to
  // survive three scales before a brush is spent on it.
  float fp2 = 2.0 * uTanHalf.y * (6.5 / uRes.y) * abs(zC);
  float fold = 0.0;
  // (feature LOD, base.js: the creases are the first marks the hand gives up)
  if (fp2 > 0.30 && uDetail > 0.0) {
    vec3 n1 = nrmAt(uv, 5.0, px);
    vec3 n2 = nrmAt(uv, 11.0, px);
    vec3 n3 = nrmAt(uv, 22.0, px);
    fold = smoothstep(0.10, 0.26, 1.0 - dot(n0, n1))
         * smoothstep(0.045, 0.13, 1.0 - dot(n0, n2))
         * smoothstep(0.022, 0.080, 1.0 - dot(n2, n3))
         * smoothstep(0.30, 1.0, fp2);
  }

  // ---- the brush: it swells on the shadow side of a form and runs dry where the
  // form turns into the light. Where a form is lit is read off the wash itself —
  // at a grazing limb a normal rebuilt from depth is not to be trusted, and a
  // painter breaks the line where the sheet is bright anyway. The weight is never
  // constant: it swells and thins along the stroke, and the stroke is lifted
  // wherever the brush ran out.
  float lumW = dot(c, vec3(0.32, 0.55, 0.13));
  float litGate = smoothstep(0.50, 0.72, lumW);       // 1 where the sheet is bright
  wob = inkF2(q * 2.6 + 5.0) * 0.62 + inkF2(q * 7.3 + 41.0) * 0.38;
  float w = mix(2.25, 0.42, litGate) * (0.38 + 1.08 * wob);
  vec3 washDx = texture2D(tWash, uv + vec2(px.x * 5.0, 0.0)).rgb
              - texture2D(tWash, uv - vec2(px.x * 5.0, 0.0)).rgb;
  vec3 washDy = texture2D(tWash, uv + vec2(0.0, px.y * 5.0)).rgb
              - texture2D(tWash, uv - vec2(0.0, px.y * 5.0)).rgb;
  float washEdge = max(length(washDx), length(washDy));
  float jumpX = abs(linZ(texture2D(tDepth, uv + vec2(px.x * 5.0, 0.0)).x)
                  - linZ(texture2D(tDepth, uv - vec2(px.x * 5.0, 0.0)).x));
  float jumpY = abs(linZ(texture2D(tDepth, uv + vec2(0.0, px.y * 5.0)).x)
                  - linZ(texture2D(tDepth, uv - vec2(0.0, px.y * 5.0)).x));
  float cutGate = smoothstep(0.025, 0.075, max(jumpX, jumpY) / max(0.35, abs(zC)));
  float line = smoothstep(0.030 / w, 0.075 / w, sil)
             * smoothstep(0.070, 0.180, washEdge) * cutGate;
  // a cut is the silhouette's business: a crease drawn over one is the ghost
  float creaseGate = 1.0 - smoothstep(0.34, 0.52, lumW);
  float crease = smoothstep(0.032 / w, 0.090 / w, fold * 0.85)
               * (1.0 - smoothstep(0.014 / w, 0.032 / w, sil)) * creaseGate;
  if (uDetail < 1.0) crease *= uDetail;
  inkLine = max(line * nearLine, crease * nearLine) * (1.0 - sky);
  inkLine *= (0.54 + 0.66 * tooth);
  float lift = smoothstep(0.20, 0.62, inkF2(q * 2.3 + 61.0));
  inkLine *= 1.0 - litGate;
  inkLine *= mix(1.0, lift, 0.38 + 0.52 * litGate);
  inkLine = clamp(inkLine, 0.0, 1.0);
  }
  // ---- hatching, where the wash has gone dark, while a pencil mark would
  // still be a mark at this distance
  float lum = dot(c, vec3(0.32, 0.55, 0.13));
  float mx3 = max(max(c.r, c.g), c.b), mn3 = min(min(c.r, c.g), c.b);
  float chroma = mx3 > 0.001 ? (mx3 - mn3) / mx3 : 0.0;
  float dark = (1.0 - smoothstep(0.05, 0.45, lum)) * (1.0 - clamp(chroma * 1.1, 0.0, 0.7));
  // ---- hatching. Short strokes, one direction, stopping: a pencil laid on the
  // darkest passages, never a pattern over the whole frame.
  float hf = 1.0 - smoothstep(30.0, 120.0, abs(zC));
  float hatch = 0.0;
  if (dark > 0.02 && hf > 0.02) {
    vec2 sc = gl_FragCoord.xy;
    float a1 = 0.60 + 0.22 * (inkN2(sc * 0.0035) - 0.5);      // one direction, near enough
    vec2 d1 = vec2(cos(a1), sin(a1));
    vec2 d2 = vec2(-d1.y, d1.x);
    float sp = 7.5;                                            // a stroke every 7.5 px on the sheet
    float u = dot(sc, d1) / sp + (inkN2(vec2(floor(dot(sc, d2) / sp), 0.0) * 0.7 + 3.0) - 0.5) * 0.22;
    float v = floor(dot(sc, d2) / sp);
    float dash = smoothstep(0.30, 0.62, inkN2(vec2(floor(u), v) * 0.37 + 7.0));
    float stroke = smoothstep(0.78, 0.22, abs(fract(u) - 0.5) * 2.0) * dash;
    hatch = stroke * (0.5 + 0.55 * tooth) * smoothstep(0.05, 0.45, dark) * hf;
  }

  // The sky is left alone here: it is painted up to the edge of the world and
  // the land is laid over it dry, so nothing of the land is carried out into
  // it — a wet overrun sampled round a ridge drew stepped ghosts of the ridge
  // across the clouds behind it.

  vec3 inkCol = mix(uInk, uSepia, 0.22 * wob);
  c = mix(c, inkCol, inkLine * 0.85);
  c = mix(c, uInk, clamp(hatch, 0.0, 1.0) * 0.30);

  // Only the hand catches strongly on the tooth; the unpainted sheet no longer
  // receives a second layer of uniform film grain.
  float hand = clamp(inkLine + hatch, 0.0, 1.0);
  c = mix(c, c * (0.94 + 0.10 * tooth), hand);
  c = mix(c, c * vec3(1.03, 1.0, 0.95) + vec3(0.016, 0.013, 0.006), 0.14);
  gl_FragColor = vec4(c, 1.0);
}
`;

/* ------------------------------------------------------------- survey bake */

// A survey of the planet: land height above sea level, and the distance from
// every water texel to the nearest shore. The sea uses both to pool pigment
// along the coast and to let the land show through the shallow water. Baked a
// row at a time between turns of the page (pace.js).
async function bakeSurvey(features, sun) {
  const NX = 640, NY = 320;
  const land = new Float32Array(NX * NY);
  const d = new THREE.Vector3();
  const peak = new THREE.Vector3();   // the highest ground (see uDrowned)
  let top = -Infinity;
  // a column's longitude, and an arc's turn about the planet's centre, are the same on every row and every texel:
  // their sines and cosines are taken once (the same numbers, so the same survey)
  const cosLon = new Float64Array(NX), sinLon = new Float64Array(NX);
  for (let x = 0; x < NX; x++) {
    const lon = Math.PI * 2 * ((x + 0.5) / NX - 0.5);
    cosLon[x] = Math.cos(lon);
    sinLon[x] = Math.sin(lon);
  }
  for (let y = 0; y < NY; y++) {
    await pace();
    const lat = Math.PI * (0.5 - (y + 0.5) / NY);
    const cy = Math.sin(lat), cr = Math.cos(lat);
    for (let x = 0; x < NX; x++) {
      d.set(cr * cosLon[x], cy, cr * sinLon[x]);
      const h = features.heightAt(d) - features.seaLevel;
      land[y * NX + x] = h;
      if (h > top) { top = h; peak.copy(d); }
    }
  }
  const INF = 1e6;
  const dist = new Float32Array(NX * NY);
  for (let i = 0; i < NX * NY; i++) dist[i] = land[i] >= 0 ? 0 : INF;
  const dy = (Math.PI * R) / NY;
  for (let pass = 0; pass < 2; pass++) {
    const fwd = pass === 0;
    for (let k = 0; k < NY; k++) {
      if (k % 16 === 0) await pace();
      const y = fwd ? k : NY - 1 - k;
      const lat = Math.PI * (0.5 - (y + 0.5) / NY);
      const dx = ((Math.PI * 2 * R) / NX) * Math.max(0.15, Math.cos(lat));
      const dg = Math.sqrt(dx * dx + dy * dy);
      for (let kx = 0; kx < NX; kx++) {
        const x = fwd ? kx : NX - 1 - kx;
        const i = y * NX + x;
        if (dist[i] <= 0) continue;
        let v = dist[i];
        const xl = (x - 1 + NX) % NX, xr = (x + 1) % NX;
        v = Math.min(v, dist[y * NX + xl] + dx, dist[y * NX + xr] + dx);
        if (y > 0) v = Math.min(v, dist[(y - 1) * NX + x] + dy, dist[(y - 1) * NX + xl] + dg, dist[(y - 1) * NX + xr] + dg);
        if (y < NY - 1) v = Math.min(v, dist[(y + 1) * NX + x] + dy, dist[(y + 1) * NX + xl] + dg, dist[(y + 1) * NX + xr] + dg);
        dist[i] = v;
      }
    }
  }
  // The sun's own shadow: for every texel, the highest ground standing between
  // it and the sun, walked along the great circle that faces the sun. Baked
  // once, because the sun does not move — this is what gives every ridge a lit
  // face and a shadow face instead of two mid-greys, and it is the only cast
  // shadow a terrain this size can afford.
  const sunShade = new Float32Array(NX * NY);
  {
    const t = new THREE.Vector3();
    const ARCS = [];
    for (let a = 3.0; a < 190.0; a *= 1.15) ARCS.push(a);
    const arcCos = ARCS.map((arc) => Math.cos(arc / R)), arcSin = ARCS.map((arc) => Math.sin(arc / R));
    const arcDrop = ARCS.map((arc) => (arc * arc) / (2 * R)); // the planet's curve falling away over the arc
    for (let y = 0; y < NY; y++) {
      await pace();
      const lat = Math.PI * (0.5 - (y + 0.5) / NY);
      const cy = Math.sin(lat), cr = Math.cos(lat);
      for (let x = 0; x < NX; x++) {
        const i = y * NX + x;
        d.set(cr * cosLon[x], cy, cr * sinLon[x]);
        const sd = d.dot(sun);
        if (sd <= 0.02) { sunShade[i] = 0; continue; }           // the sun is down: the light model owns the night, not the shadow bake
        t.copy(sun).addScaledVector(d, -sd).normalize();
        const h0 = land[i];
        let maxEl = -9;
        for (let k = 0; k < ARCS.length; k++) {
          const arc = ARCS[k];
          const ca = arcCos[k], sa = arcSin[k];
          const px = d.x * ca + t.x * sa, py = d.y * ca + t.y * sa, pz = d.z * ca + t.z * sa;
          const gy = clamp(Math.round((0.5 - Math.asin(clamp(py, -1, 1)) / Math.PI) * NY), 0, NY - 1);
          const gx = ((Math.round(((Math.atan2(pz, px) / (Math.PI * 2)) + 0.5) * NX) % NX) + NX) % NX;
          const el = (land[gy * NX + gx] - h0 - arcDrop[k]) / arc;
          if (el > maxEl) maxEl = el;
        }
        const tanSun = Math.sqrt(Math.max(0, 1 - sd * sd)) / Math.max(1e-3, sd);
        sunShade[i] = clamp((maxEl - tanSun) / 0.035 + 0.5, 0, 1);
      }
    }
  }

  const toTex = async (src) => {
    const out = new Uint16Array(src.length);
    for (let i = 0; i < src.length; i++) {
      if (i % 16384 === 0) await pace();
      out[i] = THREE.DataUtils.toHalfFloat(clamp(src[i], -40, 60));
    }
    const t = new THREE.DataTexture(out, NX, NY, THREE.RedFormat, THREE.HalfFloatType);
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
    return t;
  };
  return { land: await toTex(land), coast: await toTex(dist), sun: await toTex(sunShade), peak };
}

/* -------------------------------------------------------------------- style */

export function createInkStyle() {
  const sun = new THREE.Vector3(0.79, 0.6, 0.05);
  // the sky's own light, at right angles to the sun: it is what still models a
  // ridge on the side the sun has left
  const fill = new THREE.Vector3(-0.05, 0.34, 0.79).normalize();

  const st = {
    u: null,
    pal: null,
    CU: null,
    breath: null,
    survey: null,
    blot: null,
    post: null,
    runnerPaint: null,
    fogBase: { value: 500 },
    surface: { value: 1 },
    // the terrain's light: the sun underfoot; from orbit, the poster's light
    // (see update)
    light: { value: sun.clone() },
    // the sky's bearing on the ground: carried with the viewer, never spun about
    // the vertical by the planet's own axes, so it has no pole to flip at
    skyE: { value: new THREE.Vector3() },
    skyAt: new THREE.Vector3(),
    // the swimmer, for the marks he leaves on the water
    swim: { value: new THREE.Vector4() },
    swimF: { value: new THREE.Vector4() },
    // motion.living: the painting's own clock. `on` is the dial, exactly 0 at
    // the default, and every shader term that reads it is multiplied by it or
    // stepped around it, so the still picture is the picture it was, to the bit.
    // `pulse` is what the living terms breathe with: four beats, all of them read
    // off uTime alone — the settlements' own glow, the sky's aurora, the sea's
    // glitter and the terminator's breath. A body's pass and every print are
    // handed both as well (see makePost), so a screen a print cuts can pulse on
    // the same clock the washes do.
    live: {
      on: { value: 0 },
      pulse: { value: new THREE.Vector4() },
    },
    cloudRate: { value: P['motion.cloudRate'] },
    waterRate: { value: P['motion.waterRate'] },
    cloudBand: { value: 0 },
    seaRate: { value: 0 },
    seaAmp: { value: 0 },
    seaChop: { value: 0 },
    cadenceHz: { value: 0 },
    cadenceAmp: { value: 0 },
    // the craft dials, as live uniforms: the outer disc drawn as the macro
    // swell, the reserved sheet as a crescent on the lit limb, and the picture
    // pulled to three separated values. `repaint` re-reads them, so the bench
    // can turn any of them without reloading the week.
    craft: {
      limb: { value: dial('craft.limb', 0) },
      paper: { value: dial('craft.paper', 0) },
      values: { value: dial('craft.values', 0) },
    },
    // the look dials of this round, as live uniforms too: what the sky does
    // beyond the world from orbit, whether the globe takes a real sun, how deep
    // the night it leaves goes, and what the sheet is left dry for. All are zero
    // by default: the picture before this round, to the pixel.
    look: {
      terminator: { value: dial('light.terminator', 0) },
      night: { value: dial('light.night', 0) },
      atmosphere: { value: dial('light.atmosphere', 0) },
      caps: { value: dial('pal.caps', 0) },
      // round 13's beauty dials, on by default: the air across the lit face and
      // the sun's image on the water (the sky pin's PAINTING list turns both off)
      scatter: { value: dial('light.scatter', 0) },
      glint: { value: dial('sea.glint', 0) },
      cloudShade: { value: dial('sky.cloudShade', 0) },
      // …and its second pass, on by default too (the PAINTING list turns them
      // off): the globe's turn of light inside its three values, the orbit
      // clouds as optical depth, and the distance underfoot fitted to the horizon
      form: { value: dial('light.form', 0) },
      cloudDepth: { value: dial('sky.cloudDepth', 0) },
      aerial: { value: dial('light.aerial', 0) },
    },
    // feature LOD (base.js, LOD_ORDER): how much of each feature this frame draws, 1 (all of it) … 0 (given up)
    lod: Object.fromEntries(LOD_ORDER.map((name) => [name, { value: 1 }])),
    // what every module's update() is handed, reused frame to frame
    frame: { camera: null, surface: 0, time: 0, landing: null, lod: 1, level: 0, mode: 'orbit' },
  };

  function colorUniforms(pal) {
    return {
      uPaper: { value: pal.paper.clone() },
      uPaperWet: { value: pal.paperWet.clone() },
      uInk: { value: pal.ink.clone() },
      uInkSoft: { value: pal.inkSoft.clone() },
      uSepia: { value: pal.sepia.clone() },
      uLandLow: { value: pal.landLow.clone() },
      uLandMid: { value: pal.landMid.clone() },
      uLandHigh: { value: pal.landHigh.clone() },
      uCrest: { value: pal.crest.clone() },
      uSeaShallow: { value: pal.seaShallow.clone() },
      uSeaDeep: { value: pal.seaDeep.clone() },
      uFoam: { value: pal.foam.clone() },
      uVerm: { value: pal.vermilion.clone() },
      uLitWarm: { value: pal.litWarm.clone() },
      uShadeCool: { value: pal.shadeCool.clone() },
      // the distance takes half its glaze from the sky's own blue wash
      uFarGlaze: { value: pal.farGlaze.clone().lerp(pal.skyWash, 0.5) },
      uSkyHigh: { value: pal.skyHigh.clone() },
      uSkyLow: { value: pal.skyLow.clone() },
      uSkyBand: { value: pal.skyBand.clone() },
      uSkyWash: { value: pal.skyWash.clone() },
      uSkyDeep: { value: pal.skyDeep.clone() },
      uCloudUnder: { value: pal.cloudUnder.clone() },
      // the sky's own scheme and its heat haze (see weekPalette), nothing for
      // the race week
      uSkyScheme: { value: pal.skyScheme.clone() },
      uSkyHaze: { value: pal.skyHaze.clone() },
      uSkyCirrus: { value: pal.skyCirrus },
      uCobalt: { value: pal.cobalt.clone() },
      uTeal: { value: pal.teal.clone() },
      // the week's fields (uVegAmt > 0) or bare ground (< 0) on the lowland
      uVeg: { value: pal.veg.clone() },
      uVegAmt: { value: pal.vegAmt },
      // how deep a week's sea is beyond the race week's (0 … 0.75)
      uSeaCalm: { value: pal.seaCalm },
      // bare earth, the orbit's driest ground, and the week's mineral
      uBare: { value: pal.bare.clone() },
      uDry: { value: pal.dry.clone() },
      uAccent: { value: pal.accent.clone() },
      uAccentAmt: { value: pal.accentAmt },
      // the palette's committed dark: the one pigment the picture's dark mass
      // is made of (craft.values). A world sets it in its palette() hook, as
      // `dark` beside the other wash names — the ink of a sea, the oxblood of a
      // hot rock, the indigo under ice, a sepia stone — and it is read here
      // like any other colour, so a world that rewrites it is followed.
      uDark: { value: pal.dark.clone() },
      // how calm (unbroken) an easy week's washes are (0 for the race week)
      uCalm: { value: pal.calm },
      // the orbit's shore: how much of round five's damp coast the week keeps
      // (1 for the race week), and the colour of its drowned ground
      uDamp: { value: pal.damp },
      uShelf: { value: pal.shelf.clone() },
      // set once the survey is baked: the sea stands above the globe's relief
      uDrowned: { value: 0 },
    };
  }
  function repaintWeek(features) {
    const week = weekPalette(features);
    const next = colorUniforms(week.pal);
    for (const [name, uniform] of Object.entries(next)) {
      if (name === 'uDrowned') continue;
      const target = st.CU[name];
      if (target.value && uniform.value && typeof target.value.copy === 'function') target.value.copy(uniform.value);
      else target.value = uniform.value;
    }
    st.pal = week.pal;
    st.objPal = week.objPal;
    st.palInfo = week.info;
    if (window.__app) window.__app.palette = st.palInfo;
  }
  // The craft dials are uniform values, not baked geometry: reading them again
  // is all a live change takes (the palette dial is read inside weekPalette).
  function readCraft() {
    st.craft.limb.value = dial('craft.limb', 0);
    st.craft.paper.value = dial('craft.paper', 0);
    st.craft.values.value = dial('craft.values', 0);
    st.look.terminator.value = dial('light.terminator', 0);
    st.look.night.value = dial('light.night', 0);
    st.look.atmosphere.value = dial('light.atmosphere', 0);
    st.look.caps.value = dial('pal.caps', 0);
    st.look.scatter.value = dial('light.scatter', 0);
    st.look.glint.value = dial('sea.glint', 0);
    st.look.cloudShade.value = dial('sky.cloudShade', 0);
    st.look.form.value = dial('light.form', 0);
    st.look.cloudDepth.value = dial('sky.cloudDepth', 0);
    st.look.aerial.value = dial('light.aerial', 0);
  }
  function runnerPalette() {
    // His shirt, hair and beard are his own colours in any weather; only the
    // light and the shade he stands in belong to the week.
    const own = coastPalette(ANCHOR.tempC / 30);
    return { ...st.pal, litWarm: own.litWarm, landMid: own.landMid };
  }

  function repaintRunner(T, uniforms, runner) {
    const next = inkRunnerMaterials({ THREE: T, uniforms, palette: runnerPalette(), autoPaint: false });
    if (st.runnerPaint) {
      st.runnerPaint.replace(runner, next);
      next.paint(runner);
      st.runnerPaint.dispose();
    } else next.paint(runner);
    st.runnerPaint = next;
  }




  /* -------------------------------------------------------- post process -- */

  // A cast shadow, not a blot: it runs away from the sun, it is darkest at the
  // feet, and its boundary is a wash boundary — crisp, ragged, with a darker rim
  // where the pigment stopped — instead of a blurred silhouette of a polygon.
  function groundBlot(radius, power) {
    const geo = new THREE.PlaneGeometry(radius * 3.0, radius * 1.35);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uInk: st.CU.uInk,
        uShade: st.CU.uShadeCool,
        uPower: { value: power },
      },
      vertexShader: `varying vec2 vP; void main(){ vP = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `${NOISE}
        uniform vec3 uInk, uShade; uniform float uPower;
        varying vec2 vP;
        void main(){
          float x = vP.x;
          float bend = (inkF2(vec2(x * 1.7, 4.0)) - 0.5) * 0.24;
          float width = mix(0.43, 0.10, smoothstep(-0.88, 0.88, x));
          width *= 0.88 + 0.24 * inkF2(vec2(x * 3.1, 11.0));
          float side = abs(vP.y - bend);
          float edge = max(0.0025, 0.72 * fwidth(side));
          float along = smoothstep(-0.96 - edge, -0.96 + edge, x)
                      * (1.0 - smoothstep(0.90 - edge, 0.90 + edge, x));
          float body = (1.0 - smoothstep(width - edge, width + edge, side)) * along;
          float contactN = 0.24 + 0.08 * inkF2(vP * 3.2 + 7.0);
          float contact = 1.0 - smoothstep(contactN - edge, contactN + edge,
            length(vec2((x + 0.78) * 1.35, vP.y - bend)));
          float a = max(contact, body);
          float rim = (1.0 - smoothstep(0.0, 2.2 * edge, abs(side - width))) * along;
          vec3 shadow = mix(uShade, uInk, 0.45);
          gl_FragColor = vec4(shadow, clamp(a * uPower + rim * uPower * 0.55, 0.0, 1.0));
        }`,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -6,
    });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    return m;
  }

  function makePost({ THREE: T, renderer, scene, camera, features }) {
    camera.near = 0.3;
    // the house's own plane: the sky's update moves it out only when the poster
    // is looked at from past it (see the sky in update)
    camera.far = HOUSE_FAR;
    camera.updateProjectionMatrix();
    renderer.toneMapping = T.NoToneMapping;

    const size = new T.Vector2();
    renderer.getDrawingBufferSize(size);
    const rt = new T.WebGLRenderTarget(size.x, size.y, {
      minFilter: T.LinearFilter,
      magFilter: T.LinearFilter,
      type: T.UnsignedByteType,
      depthBuffer: true,
      depthTexture: new T.DepthTexture(size.x, size.y, T.UnsignedIntType),
      samples: 4,
    });
    rt.texture.generateMipmaps = false;
    const rt2 = new T.WebGLRenderTarget(size.x, size.y, {
      minFilter: T.LinearFilter,
      magFilter: T.LinearFilter,
      type: T.UnsignedByteType,
      depthBuffer: false,
    });
    rt2.texture.generateMipmaps = false;

    // ---- the print. A week may be finished with one more screen laid over the
    // whole sheet — a riso overprint, a woodblock cut — and `look.print` names
    // it, or asks for `auto`, which is a woodblock on a race week and ink on any
    // other. A print reads the finished ink frame, so the ink pass draws into a
    // target of its own instead of the screen and the print lays its screen over
    // that: one more pass and one more target, and only when there is a print to
    // draw. An ink week is the frame it always was, through the two targets it
    // always had.
    const print = st.print;
    const printId = print ? print.id : 'ink';
    st.printId = printId;   // capture hook: what the poster was finished with
    // The screen passes laid after the ink frame, in order: the body's own (a
    // black hole's lens, a star's bloom — bodies/index.js) and then the print.
    // Each reads the frame the pass before it finished; with neither, the ink
    // pass draws straight to the screen, exactly as it always has.
    const passMods = [st.body?.post, print].filter(Boolean);
    const passTargets = passMods.map(() => {
      const target = new T.WebGLRenderTarget(size.x, size.y, {
        minFilter: T.LinearFilter,
        magFilter: T.LinearFilter,
        type: T.UnsignedByteType,
        depthBuffer: false,
      });
      target.texture.generateMipmaps = false;
      return target;
    });

    const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
    const quad = new T.Mesh(new T.PlaneGeometry(2, 2));
    quad.frustumCulled = false;
    const quadScene = new T.Scene();
    quadScene.add(quad);
    const quadCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // pass one: the sheet — bleeding, rims, blooms, granulation
    const washMat = new T.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: rt.texture },
        tDepth: { value: rt.depthTexture },
        uRes: { value: new T.Vector2(size.x, size.y) },
        uNear: { value: camera.near },
        uFar: { value: camera.far },
        uInk: st.CU.uInk,
        uPaper: st.CU.uPaper,
        uSurface: st.surface,
        uGlobe: { value: new T.Vector2() },
        // light.atmosphere: the dial, the sky's own washes, and what the band
        // needs to know about the light and the disc (see render)
        uAtmo: st.look.atmosphere,
        uTerm: st.look.terminator,
        uNight: st.look.night,
        uRim: { value: 0 },
        uScatter: st.look.scatter,
        uForm: st.look.form,
        uSunSep: { value: 0 },
        uSunAz: { value: new T.Vector2(0, 1) },
        uSkyWash: st.CU.uSkyWash,
        uSkyDeep: st.CU.uSkyDeep,
        // light.atmosphere over deep space: the frame in the world, the week's
        // own air and the colours it is mixed from (see the glow in WASH_FRAG
        // and render). A body that draws its own limb (a giant's haze, an ice
        // giant's, a star's corona) or keeps no air (the marble, the hole) has
        // none here; a lava world's is its own smoke, lit from under.
        uSpace: { value: 0 },
        uAir: { value: features?.body?.id === 'star' && crowned() ? 1 : BODY_AIR[features?.body?.id] ?? 1 },
        uEmber: { value: features?.body?.id === 'lava' ? 1 : 0 },
        uRho: { value: R + (features?.seaLevel ?? 0) },
        uReach: { value: (features?.orbit?.reliefCap ?? 12) + 10 },
        uEye: { value: new T.Vector3() },
        uCamR: { value: new T.Vector3(1, 0, 0) },
        uCamU: { value: new T.Vector3(0, 1, 0) },
        uCamF: { value: new T.Vector3(0, 0, -1) },
        uLightW: { value: new T.Vector3(0, 0, 1) },
        uTanW: { value: new T.Vector2(1, 1) },
        uLitWarm: st.CU.uLitWarm,
        uVerm: st.CU.uVerm,
        uCobalt: st.CU.uCobalt,
      },
      vertexShader: VERT,
      fragmentShader: WASH_FRAG,
      depthTest: false,
      depthWrite: false,
    });

    // pass two: the hand — the contour brush, the hatching, the wet edge
    const inkMat = new T.ShaderMaterial({
      uniforms: {
        tWash: { value: rt2.texture },
        tDepth: { value: rt.depthTexture },
        uRes: { value: new T.Vector2(size.x, size.y) },
        uTanHalf: { value: new T.Vector2(1, 1) },
        uNear: { value: camera.near },
        uFar: { value: camera.far },
        uInk: st.CU.uInk,
        uSepia: st.CU.uSepia,
        uDetail: st.lod.creases,
        // light.aerial: the hand thins with the distance underfoot, read off
        // the eye's own horizon (uHz, set with the camera each frame)
        uAerial: st.look.aerial,
        uSurface: st.surface,
        uHz: { value: 1 },
      },
      vertexShader: VERT,
      fragmentShader: INK_FRAG,
      depthTest: false,
      depthWrite: false,
    });

    // A screen pass's own context, kept for its per-frame update: a pass that
    // draws with the globe itself (its disc on the sheet, the sun, the week's
    // sites) reads them here each frame rather than once at setup. Each pass
    // reads the frame finished before it, and the scene's depth.
    const printSeed = (weekHash(features?.week) % 100000) / 1000;
    const passCtxs = passMods.map((mod, i) => ({
      THREE: T,
      renderer,
      camera,
      features,
      palette: st.pal,
      uniforms: st.u,
      resolution: size,
      time: st.u.uTime,
      seed: printSeed,
      target: passTargets[i],
      dials: P,
      light: st.light,
      radius: R,
      seaLevel: features.seaLevel,
      // motion.living's own pair, for a pass that draws with the clock rather
      // than with a dial: `live.pulse` is a Vector4 the pass may read each frame
      // (the settlements' glow, the aurora, the sea's glitter, the edge breath)
      // and `live.on` is the dial. Both are 0 with the dial down.
      live: st.live,
    }));
    const passMats = passMods.map((mod, i) => new T.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: passTargets[i].texture },
        tDepth: { value: rt.depthTexture },
        uResolution: { value: new T.Vector2(size.x, size.y) },
        uTime: st.u.uTime,
        uPaper: st.CU.uPaper,
        uInk: st.CU.uInk,
        uSeaDeep: st.CU.uSeaDeep,
        uSeaShallow: st.CU.uSeaShallow,
        uLand: st.CU.uLandMid,
        uSeed: { value: printSeed },
        // motion.living, as the pass chain's own hook. Both are live uniforms of
        // the picture's clock (see update): uLiving is the dial, and uPulse is
        // its four beats — the settlements' glow, the sky's aurora, the sea's
        // glitter and the terminator's breath, each 0 … 1 and each read off
        // uTime alone, so they are the same numbers in every run of a pinned
        // capture. A print may declare them in its fragment and pulse a screen
        // of city lights, an aurora, a sparkle or a breathing edge with the very
        // clock the washes below it are breathing with, and its update(ctx) gets
        // the same pair on the ctx itself (`live`).
        uLiving: st.live.on,
        uPulse: st.live.pulse,
        ...(mod.uniforms ? mod.uniforms(passCtxs[i]) : {}),
      },
      vertexShader: PRINT_VERT,
      fragmentShader: mod.fragment,
      depthTest: false,
      depthWrite: false,
    }));
    const printMat = print ? passMats[passMats.length - 1] : null;

    const stat = { ms: 0, avg: 0, max: 0, n: 0 };

    const syncCam = () => {
      const th = Math.tan((camera.fov * Math.PI) / 360);
      washMat.uniforms.uNear.value = camera.near;
      washMat.uniforms.uFar.value = camera.far;
      inkMat.uniforms.uTanHalf.value.set(th * camera.aspect, th);
      inkMat.uniforms.uNear.value = camera.near;
      inkMat.uniforms.uFar.value = camera.far;
      const sea = R + (features?.seaLevel ?? 0);
      inkMat.uniforms.uHz.value = Math.sqrt(Math.max(camera.position.lengthSq() - sea * sea, 1));
    };
    syncCam();

    return {
      render() {
        const t0 = performance.now();
        syncCam();
        renderer.setRenderTarget(rt);
        renderer.render(scene, camera);
        // the planet's centre on the sheet, for the limb the sheet pass draws
        _g.set(0, 0, 0).project(camera);
        washMat.uniforms.uGlobe.value.set(
          (_g.x * 0.5 + 0.5) * washMat.uniforms.uRes.value.x,
          (_g.y * 0.5 + 0.5) * washMat.uniforms.uRes.value.y,
        );
        stat.calls = renderer.info.render.calls;
        stat.tris = renderer.info.render.triangles;
        // light.atmosphere: the band's own geometry, once a frame. The disc's
        // radius on the sheet in pixels, for the sphere of sea level the world's
        // edge is drawn on — a sphere projects to a circle of radius
        // f·ρ/√(d²−ρ²) — and the light's bearing on the sheet: its component
        // across the eye, read in the camera's own right and up, which is what
        // the band's gather and its night side are read from.
        {
          const rho = R + features.seaLevel;
          const d0 = camera.position.length();
          const f = (washMat.uniforms.uRes.value.y * 0.5) / Math.tan((camera.fov * Math.PI) / 360);
          washMat.uniforms.uRim.value = d0 > rho * 1.02 ? (f * rho) / Math.sqrt(Math.max(1e-3, d0 * d0 - rho * rho)) : 0;
          _camR.setFromMatrixColumn(camera.matrixWorld, 0);
          _camU.setFromMatrixColumn(camera.matrixWorld, 1);
          _eye.copy(camera.position).normalize();
          _sunT.copy(st.light.value).addScaledVector(_eye, -st.light.value.dot(_eye));
          const sep = _sunT.length();
          const a2 = washMat.uniforms.uSunAz.value;
          if (sep > 1e-4) a2.set(_sunT.dot(_camR) / sep, _sunT.dot(_camU) / sep).normalize();
          else a2.set(0, 1);
          washMat.uniforms.uSunSep.value = sstep(0.30, 0.74, sep);
          // …and over deep space the air is read off the ray itself: the eye,
          // the camera's own frame and lens, the light, and the space dial on
          // the same lift ink-space.js takes it off the sheet with
          const wu = washMat.uniforms;
          wu.uEye.value.copy(camera.position);
          wu.uCamR.value.copy(_camR).normalize();
          wu.uCamU.value.copy(_camU).normalize();
          wu.uCamF.value.setFromMatrixColumn(camera.matrixWorld, 2).normalize().negate();
          const tw = Math.tan((camera.fov * Math.PI) / 360);
          wu.uTanW.value.set(tw * camera.aspect, tw);
          wu.uLightW.value.copy(st.light.value).normalize();
          wu.uSpace.value = clamp(dial('sky.space', 0), 0, 1) * (1 - sstep(0.12, 0.56, st.surface.value));
        }
        quad.material = washMat;
        renderer.setRenderTarget(rt2);
        renderer.render(quadScene, quadCam);
        quad.material = inkMat;
        for (let i = 0; i < passMats.length; i++) {
          // each screen pass lays its work over the frame finished before it
          renderer.setRenderTarget(passTargets[i]);
          renderer.render(quadScene, quadCam);
          passMods[i].update?.(passCtxs[i], passMats[i].uniforms);
          quad.material = passMats[i];
        }
        renderer.setRenderTarget(null);
        renderer.render(quadScene, quadCam);
        const ms = performance.now() - t0;
        stat.ms = ms;
        stat.n++;
        stat.avg += (ms - stat.avg) / Math.min(stat.n, 90);
        stat.max = Math.max(stat.max, ms);
      },
      setSize(w, h) {
        const r = renderer.getPixelRatio();
        const W = Math.max(2, Math.floor(w * r)), H = Math.max(2, Math.floor(h * r));
        rt.setSize(W, H);
        rt2.setSize(W, H);
        for (const target of passTargets) target.setSize(W, H);
        washMat.uniforms.uRes.value.set(W, H);
        inkMat.uniforms.uRes.value.set(W, H);
        for (const material of passMats) material.uniforms.uResolution.value.set(W, H);
        size.set(W, H); // passCtxs' resolution: a pass's update() reads the sheet's current size
        syncCam();
      },
      // exposed so a capture can measure the passes and poke at their uniforms
      debug: stat,
      // The passes' programs, each made for the target it draws into and all started at once: base.js has the first
      // frame wait for them with the scene's (KHR_parallel_shader_compile), so none is linked inside that frame.
      compile() {
        const chain = [[washMat, rt2], [inkMat, passTargets[0] ?? null], ...passMats.map((m, i) => [m, passTargets[i + 1] ?? null])];
        const jobs = chain.map(([material, target]) => {
          quad.material = material;
          renderer.setRenderTarget(target);
          return renderer.compileAsync(quadScene, quadCam);
        });
        renderer.setRenderTarget(null);
        return Promise.all(jobs);
      },
      printId,
      material: inkMat,
      material2: washMat,
      material3: printMat,
      target: rt,
      target2: rt2,
      target3: print ? passTargets[passTargets.length - 1] : null,
      passes: passMods.map((mod) => mod.id),
      scene: quadScene,
      camera: quadCam,
    };
  }

  /* --------------------------------------------------------------- style -- */

  return {
    name: 'ink',
    // feature LOD (base.js): how many levels the painting can give up (LOD_ORDER)
    lodLevels: LOD_ORDER.length,
    repaint({ THREE: T, features, uniforms, runner, changed }) {
      readCraft();
      repaintWeek(features);
      if (runner && changed.some((key) => key.startsWith('pal.coast.landMid'))) repaintRunner(T, uniforms, runner);
    },


    async setupScene({ THREE: T, scene, renderer, features, uniforms }) {
      T.ColorManagement.enabled = false;
      renderer.toneMapping = T.NoToneMapping;
      st.u = uniforms;
      // the week's own modules — its print, its body's drawing, its life, its race ring — asked for now, so they come
      // in while the survey is baked (each is awaited where it is drawn)
      const print = printFor(dialId('look.print', 'ink'), features);
      for (const load of [print, loadBody(features), loadLife(features), loadRing(features)]) load?.catch(() => {});
      const week = weekPalette(features);
      st.pal = week.pal;
      st.palInfo = week.info;
      st.objPal = week.objPal;
      st.breath = week.breath;
      readCraft();
      st.CU = colorUniforms(st.pal);
      const activeSun = features.sunDirection || sun;
      uniforms.uSunDir.value.copy(activeSun);
      st.light.value.copy(activeSun);
      st.survey = await bakeSurvey(features, activeSun);
      // the orbit's globe caps its relief (features.orbitHeightAt); a sea that
      // stands above even the highest capped ground drowns the whole globe
      st.CU.uDrowned.value = features.orbitHeightAt(st.survey.peak) <= features.seaLevel ? 1 : 0;
      scene.background = null;
      scene.fog = null;

      const skyMat = new T.ShaderMaterial({
        uniforms: {
          uSunDir: uniforms.uSunDir,
          uSkyE: st.skyE,
          uEnergy: uniforms.uEnergy,
          uTime: uniforms.uTime,
          // motion.living: the sky's weather drifts and its crowns evolve
          // (see the drift in main and the offset in inkCumulus)
          uLiving: st.live.on,
          uCloudRate: st.cloudRate,
          uCloudBand: st.cloudBand,
          uSkyHigh: st.CU.uSkyHigh,
          uSkyLow: st.CU.uSkyLow,
          uSkyBand: st.CU.uSkyBand,
          uSkyWash: st.CU.uSkyWash,
          uSkyDeep: st.CU.uSkyDeep,
          uCloudUnder: st.CU.uCloudUnder,
          uSkyScheme: st.CU.uSkyScheme,
          uSkyHaze: st.CU.uSkyHaze,
          uSkyCirrus: st.CU.uSkyCirrus,
          uAerial: st.look.aerial,
          uPaper: st.CU.uPaper,
          uSurface: st.surface,
        },
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: T.BackSide,
        depthWrite: false,
        fog: false,
      });
      const sky = new T.Mesh(new T.SphereGeometry(SKY_DOME, 48, 28), skyMat);
      sky.name = 'ink-sky';
      // laid last of the opaque passes: the sky is only ever painted where the
      // world has left the sheet bare, so it costs nothing behind a mountain.
      // Its radius is the world's own reach, stood each frame in update: a dome
      // of one fixed size is painted over everything the world leaves *beyond*
      // it, which is how a pulled-back poster came back as blank paper.
      sky.renderOrder = 10;
      sky.frustumCulled = false;
      scene.add(sky);
      st.sky = sky;

      // A world may stand objects of its own in the scene (classic stands
      // none) and paint them with the same wash helper the week's own objects
      // use. They are handed the light the globe itself is painted with — the
      // sun underfoot, and from orbit the poster's light, turned toward the
      // painter (see update) — so a ring or a moon reads with the disc beside
      // it; sharing the uniform object keeps them in step frame by frame. They
      // are added to the scene and never to the feature list, so the ground
      // patch, the landings, the chase framing and the field guide never treat
      // them as ground the runner can stand on.
      const world = resolvedWorld(features);
      await pace();
      const companions = await companionsFor(world, {
        THREE: T,
        features,
        palette: st.pal,
        uniforms: { ...uniforms, uSunDir: st.light },
        washMaterial,
        R,
      });
      if (companions) scene.add(companions);
      st.companions = companions;
      // the week's star system fades its lens flare and halo with the feature LOD (system.js reads userData.lod)
      const system = companions?.getObjectByName('companion-system');
      if (system?.userData.lod) system.userData.lod = st.lod.flare;

      // The orbit's weather: a painted cloud sheet above the relief cap, with
      // its own cast shadow on the ground under it (ink-clouds.js). It reads
      // the week's own sun, so the sheet is where the sphere's terminator is
      // drawn, its survey, so the wash dies where the world's own edge does,
      // and it is hidden from the surface, which wears its own sky.
      await pace();
      st.clouds = createOrbitClouds({
        THREE: T,
        features,
        uniforms,
        palette: st.CU,
        survey: st.survey,
        light: st.light,
        R,
        weather: st.cloudRate,
        // motion.living: the sheet's own clock and beats — the weather drifts
        // round the pole, shears with latitude and evolves, all of it off uTime
        live: st.live,
        // light.terminator and light.night: the sheet's night goes as deep as
        // the ground's under it
        look: st.look,
      });
      if (st.clouds) scene.add(st.clouds.object);

      // What kind of body the week is (bodies/index.js: a rocky world, a gas
      // giant's banded deck, a star, a black hole...) and the space it hangs in
      // (ink-space.js). A body draws as its own objects over the ground from
      // orbit, fading as the camera lands, and may add a screen pass of its own
      // (st.body.post) that the post chain runs before any print. Both are null
      // on today's planet.
      const shared = { THREE: T, scene, renderer, features, uniforms, palette: st.pal, colors: st.CU, survey: st.survey, light: st.light, R, washMaterial };
      await pace();
      st.body = await createBody(shared);
      if (st.body?.object) scene.add(st.body.object);
      await pace();
      st.space = createSpace(shared);
      if (st.space?.object) scene.add(st.space.object);
      // The week's life (life.js): what lives on the world, from orbit and underfoot. Null when life.amount is 0.
      await pace();
      st.life = await createLife(shared);
      if (st.life?.object) scene.add(st.life.object);
      st.print = await print;
    },

    // capture hook: the week's families, key colours and the reasons for them, on the app once it stands; and the
    // runner in his own paint before base.js precompiles the scene, so his programs are made with the rest
    ready(app) {
      app.palette = st.palInfo;
      st.runnerPaint?.paint(app.runner.object3D);
    },

    planetMaterial({ THREE: T, uniforms }) {
      // A body may paint its own ground (bodies/index.js: `ground`, { glsl,
      // uniforms }): its glsl declares bodyGround(c, dW, n, V, dist, fp, tooth,
      // sunSh), which is handed the finished wash and has the last word on it.
      // Today's planet has none, and its shader is the one it always was.
      const ground = st.body?.ground;
      const frag = ground
        ? TERRAIN_FRAG.replace('void main(){', `${ground.glsl}\nvoid main(){`)
          .replace('gl_FragColor = vec4(c, 1.0);', 'c = bodyGround(c, dW, n, V, dist, fp, tooth, sunSh);\n  gl_FragColor = vec4(c, 1.0);')
        : TERRAIN_FRAG;
      return new T.ShaderMaterial({
        uniforms: {
          ...ground?.uniforms,
          ...st.CU,
          uSunDir: uniforms.uSunDir,
          uLight: st.light,
          uFillDir: { value: fill },
          uTime: uniforms.uTime,
          uWarmth: uniforms.uWarmth,
          uEnergy: uniforms.uEnergy,
          uSeaLevel: uniforms.uSeaLevel,
          uFogBase: st.fogBase,
          uSurface: st.surface,
          // the craft dials (see PLANET_VERT and the two blocks in TERRAIN_FRAG)
          uLimb: st.craft.limb,
          uCrescent: st.craft.paper,
          uValues: st.craft.values,
          // this round's look dials: the night side (see update and inkNight)
          // and the ice the sheet is left dry for (inkCaps)
          uTerm: st.look.terminator,
          uNight: st.look.night,
          uCaps: st.look.caps,
          uCloudShade: st.look.cloudShade,
          uSkyE: st.skyE,
          uCloudRate: st.cloudRate,
          uCloudBand: st.cloudBand,
          uAerial: st.look.aerial,
          uForm: st.look.form,
          // motion.living: the dial and its beats (see inkNight's breathing edge)
          uLiving: st.live.on,
          uPulse: st.live.pulse,
          tSun: { value: st.survey.sun },
          tLand: { value: st.survey.land },
        },
        vertexShader: PLANET_VERT,
        fragmentShader: frag,
      });
    },

    oceanMaterial({ THREE: T, uniforms }) {
      return new T.ShaderMaterial({
        uniforms: {
          ...st.CU,
          uLight: st.light,
          uFillDir: { value: fill },
          uTime: uniforms.uTime,
          uWaterRate: st.waterRate,
          uSeaRate: st.seaRate,
          uSeaAmp: st.seaAmp,
          uSeaChop: st.seaChop,
          uCadenceHz: st.cadenceHz,
          uCadenceAmp: st.cadenceAmp,
          uWarmth: uniforms.uWarmth,
          uEnergy: uniforms.uEnergy,
          uSeaLevel: uniforms.uSeaLevel,
          uFogBase: st.fogBase,
          uSurface: st.surface,
          // craft.values, for the deep water's share of the picture's dark mass
          uValues: st.craft.values,
          // this round's look dials: the sea's night side and its polar ice
          uTerm: st.look.terminator,
          uNight: st.look.night,
          uCaps: st.look.caps,
          uGlint: st.look.glint,
          uForm: st.look.form,
          // motion.living: the sea's own clock (see the two blocks in OCEAN_FRAG)
          uLiving: st.live.on,
          uPulse: st.live.pulse,
          uSwim: st.swim,
          uSwimF: st.swimF,
          uSkyE: st.skyE,
          tLand: { value: st.survey.land },
          tCoast: { value: st.survey.coast },
          tSun: { value: st.survey.sun },
        },
        vertexShader: SEA_VERT,
        fragmentShader: OCEAN_FRAG,
      });
    },

    featureObject({ THREE: T, feature, features, uniforms, camera }) {
      // a body whose ground holds nothing up (a giant's cloud deck) stands only
      // the race's monument on it, and without the washes it lays flat on rock
      // (its pooled pigment, its cast shadow): on cloud a flat wash is a pane
      // draped over the crowns
      if (st.body?.props === false && feature.kind !== 'monument') return null;
      const obj = inkFeatureObject({ THREE: T, feature, features, uniforms, camera, palette: st.objPal });
      if (st.body?.props === false) obj?.traverse?.((k) => { if (k.userData?.groundWash) k.visible = false; });
      return obj;
    },

    runnerMaterials({ THREE: T, uniforms }) {
      st.runnerPaint = inkRunnerMaterials({ THREE: T, uniforms, palette: runnerPalette() });
      return st.runnerPaint;
    },

    postprocess(ctx) {
      st.post = makePost(ctx);
      st.blot = groundBlot(1.6, 0.42);
      ctx.scene.add(st.blot);
      // the race's own loaded stroke is a thing laid on the ground too: a body
      // that stands nothing on its ground draws the week's routes itself
      const trail = st.body?.props === false ? null : buildRaceStroke({ THREE: ctx.THREE, features: ctx.features, uniforms: st.u, palette: st.pal });
      if (trail) ctx.scene.add(trail);
      window.__ink = st; // capture hook: the pass, the survey, the palette, the print
      return st.post;
    },

    update({ camera, scene, features, mode, surface, runner, runnerState, landing, lod }) {
      const seaBreath = P['breath.sea'];
      const cloudBreath = P['breath.clouds'];
      // motion.living: the picture's clock, and the four beats the living terms
      // (and any print or body pass) breathe with. Every value here is a function
      // of uTime alone — nothing is drawn from the wall clock and nothing from a
      // random source — so a capture pinned at t is the same frame on every run,
      // and a clip is the same six seconds every time it is rendered. With the
      // dial down every beat is exactly zero and every living term is multiplied
      // by the dial as well, so the still painting is the painting it was.
      const living = clamp(dial('motion.living', 0), 0, 1);
      const lt = st.u.uTime.value;
      st.live.on.value = living;
      const beat = st.live.pulse.value;
      if (living > 0) {
        beat.set(
          living * (0.5 + 0.5 * Math.sin(lt * 0.21 + 1.1)),   // the settlements' glow: slow
          living * (0.5 + 0.5 * Math.sin(lt * 0.077 + 2.3)),  // the sky's aurora: slower still
          living * (0.5 + 0.5 * Math.sin(lt * 1.35)),         // the sea's glitter: a twinkle
          living * (0.5 + 0.5 * Math.sin(lt * 0.38)),         // the terminator's breath
        );
      } else beat.set(0, 0, 0, 0);
      st.cloudRate.value = P['motion.cloudRate'] + cloudBreath * P['breath.cloudRate'] * st.breath.cloudRate;
      st.cloudBand.value = cloudBreath * P['breath.cloudBand'];
      st.waterRate.value = P['motion.waterRate'];
      st.seaRate.value = seaBreath * P['breath.seaRate'] * st.breath.seaRate;
      st.seaAmp.value = seaBreath * P['breath.seaAmp'] * st.breath.seaAmp;
      st.seaChop.value = seaBreath * P['breath.seaAmp'] * st.breath.seaChop * 0.45;
      st.cadenceHz.value = st.breath.cadenceHz;
      st.cadenceAmp.value = seaBreath * P['breath.cadence'];
      // the craft and look dials, read every frame: a poster shot raises some of
      // them while it is live and hands them back after (base.js setShotLook),
      // and nothing repaints the style for either
      readCraft();
      _up.copy(camera.position);
      if (st.sky && _up.lengthSq() > 1) {
        st.sky.position.copy(camera.position);
        // The frame's own reach. The dome is depth-tested and laid last of the
        // opaque passes, so it is painted over whatever the world has left
        // *beyond* it: it has to stand past every mark the world lays, or the
        // world is painted out. A dome of one fixed size is nearer than the
        // world from any poster pulled back past it — a wide ring, a long lens,
        // a small body, a race week at camera.fill 0.3 (1450 u out) or its
        // saturn ring (2600) — and there the whole globe came back as blank
        // paper with nothing of it left but the wash pass's own rim. So the dome
        // is stood at the world's own reach: the eye's own distance from the
        // globe's centre, plus the reach the week's companions declare
        // (userData.reach, in planet radii — the reading posterBase frames the
        // poster with, so it is the world the app itself holds in the frame) and
        // the room a rim of haze and the orbit's relief cap need. The reach is
        // read off the companions' own group and re-read only when that group or
        // what stands in it is replaced, so a frame pays a scan of a handful of
        // nodes. The dome is centred on the eye and its shader reads directions,
        // not lengths (SKY_VERT: vDir = position), so its own picture never
        // changes with its radius: it is the same sky, stood where the frame
        // needs it.
        const companions = st.companions;
        const first = companions?.children[0] ?? null;
        const count = companions ? companions.children.length : 0;
        if (st.reachFirst !== first || st.reachCount !== count) {
          st.reachFirst = first;
          st.reachCount = count;
          st.reach = 1;
          for (const node of companions ? companions.children : []) {
            const own = Number(node.userData?.reach);
            if (Number.isFinite(own) && own > st.reach) st.reach = own;
          }
        }
        const dome = Math.max(SKY_DOME, camera.position.length() + R * st.reach + REACH_MARGIN);
        st.sky.scale.setScalar(dome / SKY_DOME);
        // …and the frame's plane is moved out to hold that dome whole, on the
        // same share of it ink-space.js stands its own shell at: the plane is
        // the outermost reach of this camera, so a dome stood inside it is
        // behind every mark the world can lay. Both numbers are the camera's
        // own, so the globe is painted the same wherever the poster is looked
        // from; at the house's distances the plane is the 2000 it always was and
        // the dome the 900 it always was, because nothing of the world reaches
        // past them.
        const far = Math.max(HOUSE_FAR, dome / SKY_DOME_SHARE);
        if (Number.isFinite(far) && camera.far !== far) {
          camera.far = far;
          camera.updateProjectionMatrix();
        }
        _up.normalize();
        // The sky's bearing is carried along with the viewer, so walking and
        // turning never spin it. Wherever the viewer lands — the first frame, a
        // jump — it is set afresh by a rule of the place, so that each place on
        // the planet opens on its own part of the painting.
        const e = st.skyE.value;
        if (camera.position.distanceToSquared(st.skyAt) > 16 || e.lengthSq() < 0.5) {
          e.copy(SKY_K).addScaledVector(_up, -SKY_K.dot(_up));
          if (e.lengthSq() < 0.01) e.set(1, 0, 0).addScaledVector(_up, -_up.x);
          e.normalize().applyAxisAngle(_up, SKY_P.dot(_up) + SKY_C);
        } else e.addScaledVector(_up, -e.dot(_up)).normalize();
        st.skyAt.copy(camera.position);
      }
      const surfaceMix = clamp(surface ?? (mode === 'orbit' ? 0 : 1), 0, 1);
      st.surface.value = surfaceMix;
      // feature LOD (base.js): how much of each of LOD_ORDER's features is drawn, 1 (all) … 0 (given up), each
      // eased over its own level of the app's
      const level = Number.isFinite(lod) ? clamp(lod, 0, LOD_ORDER.length) : 0;
      for (let i = 0; i < LOD_ORDER.length; i++) st.lod[LOD_ORDER[i]].value = 1 - sstep(0, 1, level - i);
      const f = st.frame;
      f.camera = camera;
      f.surface = surfaceMix;
      f.time = st.u.uTime.value;
      f.landing = landing;
      f.lod = 1;
      f.level = level;
      // (a body composed once from the poster's own camera waits for steady orbit: bodies/ice.js)
      f.mode = mode;
      st.body?.update?.(f);
      // a body that is the whole sky underfoot (a giant's deck overhead, a lava
      // world's smoke) has nothing of the week's companions showing through it
      if (st.companions && st.body?.sky) st.companions.visible = surfaceMix < 0.5;
      f.lod = st.lod.space.value;
      st.space?.update?.(f);
      // under a shell that covers the whole sky the day dome is never seen, so it is not drawn
      if (st.sky) st.sky.visible = !st.space?.opaque;
      // (and where a flight down will stand the camera: what a landing places is
      // placed from there, see life.js)
      f.lod = st.lod.life.value;
      st.life?.update?.(f);
      // The poster's light. Underfoot it is the sun. From orbit it is the sun
      // turned toward the painter until it stands no further than POSTER_OFF
      // from his eye, so every week's globe keeps round five's big lit face,
      // with its paper, whichever side of the world the week faces. The race
      // week's own poster is 58° off the sun and is not turned.
      //
      // light.terminator (see inkNight): with the dial up, the light is the
      // week's own sun, left where it stands anywhere inside a painter's band
      // about the eye — no closer than TERM_CLOSE, so that even a sun square
      // behind the painter leaves a day side and a night side to read the globe
      // by, and no further than TERM_FAR, so a sun nearly behind the world still
      // leaves the week's own ground lit and its limb holding the sheet. A deep
      // night (light.night) opens that far bound until the light is the sun
      // itself, wherever it stands: a real night is the one a real sun leaves,
      // and a sun past the limb leaves a crescent. The turn is in the sun's own
      // plane about the eye, so the light keeps the week's bearing, and the dial
      // blends the two: at 0 this is the flat-lit poster it has always been, to
      // the pixel.
      const activeSun = st.u.uSunDir.value;
      const L = st.light.value.copy(activeSun);
      if (surfaceMix < 1) {
        _dir.copy(camera.position).normalize();
        _side.crossVectors(_dir, activeSun);
        const eyeSun = _dir.angleTo(activeSun);
        let off = Math.min(eyeSun, POSTER_OFF);
        if (st.look.terminator.value > 0) {
          const far = TERM_FAR + (Math.PI - TERM_FAR) * st.look.night.value;
          off += (clamp(eyeSun, TERM_CLOSE, far) - off) * st.look.terminator.value;
        }
        if (Math.abs(off - eyeSun) > 1e-4 && _side.lengthSq() > 1e-8) {
          L.copy(_dir).applyAxisAngle(_side.normalize(), off).multiplyScalar(activeSun.length());
        }
        if (surfaceMix > 0) L.lerp(activeSun, surfaceMix);
      }
      // the orbit's cloud sheet rides the same handoff: gone before the camera
      // is under it, and still while nothing asks for it. It is read after the
      // poster's light, which it is lit by and stands its storms against.
      f.lod = st.lod.clouds.value;
      st.clouds?.update(f);
      // the swimmer's marks: where his body meets the water, and how he moves
      const rs = runnerState;
      if (mode !== 'orbit' && rs && rs.depth > 0.05) {
        const swimming = rs.waterMode === 'swimming';
        _dir.copy(runner.position).normalize().multiplyScalar(R + features.seaLevel);
        st.swim.value.set(_dir.x, _dir.y, _dir.z, swimming ? 2 : 1);
        st.swimF.value.set(rs.facing.x, rs.facing.y, rs.facing.z, swimming ? clamp(rs.speed / 1.9, 0, 1) : 0);
      } else st.swim.value.w = 0;
      // From orbit the air starts past the globe's near face: a shot pulled back past the house distance (a wide ring,
      // a telephoto, a small body) moves the air back with it, or the whole globe would sit in the far glaze.
      const orbitFog = 900 + Math.max(0, camera.position.length() - 700);
      st.fogBase.value = orbitFog + (Math.max(8, camera.position.distanceTo(runner.position)) - orbitFog) * surfaceMix;
      if (st.blot) {
        _dir.copy(runner.position).normalize();
        const h = features.heightAt(_dir);
        st.blot.position.copy(_dir).multiplyScalar(R + h + 0.05);
        // the puddle lies away from the sun in the runner's tangent plane
        _away.copy(activeSun).addScaledVector(_dir, -activeSun.dot(_dir));
        if (_away.lengthSq() < 1e-6) _away.copy(runner.facing || _UP);
        _away.normalize().negate();
        st.blot.quaternion.setFromRotationMatrix(
          _m4.makeBasis(_away, _dir, _side.crossVectors(_away, _dir).normalize()),
        );
        const air = Math.max(0, runner.position.length() - (R + h));
        st.blot.material.uniforms.uPower.value = rs && rs.depth > 0.05
          ? 0
          : 0.40 * (1 - clamp(air / 2.5, 0, 0.85));
        const s = 0.84 + clamp(air, 0, 3) * 0.18;
        st.blot.scale.set(s * (1.0 + clamp(air, 0, 3) * 0.18), s, s);
      }
    },

    dispose() {
      // the companions (moons, the race's ring, the week's system) own their GPU resources; each builder hangs its
      // own disposer on userData (teardown.js)
      for (const node of st.companions?.children ?? []) node.userData?.dispose?.();
      st.companions?.removeFromParent();
      st.companions = null;
      st.clouds?.dispose();
      st.clouds = null;
      st.body?.dispose?.();
      st.body = null;
      st.space?.dispose?.();
      st.space = null;
      st.life?.dispose?.();
      st.life = null;
    },
  };
}

const _UP = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _away = new THREE.Vector3();
const _side = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _up = new THREE.Vector3();
const _g = new THREE.Vector3();
// light.atmosphere's own reading of the frame: the camera's right and up in the
// world, the eye's own direction, and the light's part across it (see makePost).
const _camR = new THREE.Vector3();
const _camU = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _sunT = new THREE.Vector3();
// …and how much of that air a body keeps over deep space (rock and lava: all of
// it). These draw their own limb, or have none; the race week's crowned world
// (bodies/star.js crowned()) keeps a rock world's air.
const BODY_AIR = { giant: 0, ice: 0, star: 0, marble: 0, blackhole: 0 };
// The sky's chart: its bearing starts toward SKY_K, turned by an amount that
// is a rule of the place (SKY_P, SKY_C), so the landmarks' own views each open
// on a different cloud station rather than all on the one behind the sun.
const SKY_K = new THREE.Vector3(0.3, 0.25, 0.92).normalize();
const SKY_P = new THREE.Vector3(0.9537, -3.3092, -1.9448);
const SKY_C = -1.17;
// The day dome, and the frame it is stood in (see the sky's update in the pass).
// A dome that stands nearer than the world's own reach is painted over every
// mark the world leaves beyond it, so its radius is the world's reach plus
// REACH_MARGIN (room for a ring's own haze and the orbit's relief cap), and the
// camera's far plane is moved out to hold it whole, on the same share of the
// plane ink-space.js stands its own shell at. HOUSE_FAR is the style's own
// plane — the house's distances, where nothing of the world is past it and
// neither number moves.
const SKY_DOME = 900;
const SKY_DOME_SHARE = 0.95;
const REACH_MARGIN = 40;
const HOUSE_FAR = 2000;
// How far off the eye the orbit's light may stand (see update): just past the
// race week's own 58°, so its poster is never turned.
const POSTER_OFF = (60 * Math.PI) / 180;
// light.terminator: the band the light is held in about the eye, in the sun's
// own plane around it (see update). TERM_CLOSE is a strong side light — the
// furthest the painter's light is allowed to keep its back to us, so that even a
// week whose sun stands square behind the poster still gets a night side to read
// the globe by; TERM_FAR is the point past which the sun-side limb would lose
// its sheet and the week's own ground would be lit only edge-on.
const TERM_CLOSE = (66 * Math.PI) / 180;
const TERM_FAR = (86 * Math.PI) / 180;
// Feature LOD (base.js): what the painting gives up, in this order, when frames are still slow at the lowest
// resolution, one feature a level, each faded on its own and given back in the reverse order. First what costs the
// same at any resolution (life's orbit layers are geometry), then the weather's cast shadow and modelling, the lens's
// flare and halo, the deep sky's finest washes, and last the creases the hand draws underfoot.
const LOD_ORDER = ['life', 'clouds', 'flare', 'space', 'creases'];

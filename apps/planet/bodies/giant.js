/* Planet Creator — the gas giant body.
 *
 * A giant is not a rocky week with bands painted on it: it is the week whose
 * volume will not fit on a globe. Ryan's longest weeks — ten hours and up, or
 * eleven hundred of load across eight sessions and more — are drawn as a shell
 * of cloud standing twenty units over the ground, and that shell is the planet:
 * belts from the week's own palette, sheared by their own flow, the week's
 * biggest session a storm on the site where it was trained, the poles wound
 * into a vortex (and, at the north, the hexagon).
 *
 * Underfoot it is a cloud deck and not a world: the ground is the week's soft
 * rolling roof (a body baseline, so as little of the classic terrain is left in
 * it as a roof of cloud would keep), the week's own routes are softened into
 * furrows across it rather than carved into it, and the sea is gone — a giant
 * has weather all the way down, not a shoreline. What the ground keeps is the
 * palette, so the deck the eye lands on is the deck it flew down through.
 *
 * The drawing is in bodies/giant-shader.js: the deck, and the moons beside it,
 * fetched for a giant's week only (load).
 */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
// A smoothstep for the deck's own edges, in the shell's own form: the two files
// draw the same belt, so they read it with the same curve.
const smoothstep01 = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// The deck underfoot is the deck overhead: the same band coordinate the shell
// is drawn from (giant-shader.js reads it nine and a half times to a belt, so
// the two files agree), the same cells, the same hashed widths — so the belt a
// runner stands in is the belt they flew down through. A belt is a trough in
// the roof and the zone between two of them a swell, and every edge of it is
// drawn long: a deck of cloud has no crest and no cliff, so the relief here is a
// third of what a rocky week's would be and the roof only lifts and falls under
// the eye, band by band, the way the sky above it does.
const BELTS = 9.5;
const ROLL_AMP = 1.5;
const SWELL_AMP = 0.55;
// …and on the roof, its billows: the deck is cloud, and cloud stands in rounded
// crowns with a crease between every two of them — value noise folded about its
// middle and lifted to a dome (the fold's own root, softened), two sizes of it:
// a crown every six units or so, and the lumps on it. It is what puts a
// scalloped row of tops on the horizon instead of a dune line, and what the ink
// finds its contours on. A crown stands about knee to chest high on the runner,
// so the deck stays runnable.
const PUFF_AMP = 2.4;
const PUFF_F0 = 17;
const PUFF_F1 = 41;
// |2n − 1| with its crease rounded over a tenth of the fold, then lifted to a
// dome: a crown is round on top and the gap between two of them is a valley,
// never a knife (a knife-edged crease reads as rock)
const dome = (n) => {
  const x = n * 2 - 1;
  return Math.sqrt(Math.sqrt(x * x + 0.01) - 0.08) - 0.1414;
};

// The sheet's own hash, exactly as the ink style and the shell shader read it
// (ink.js NOISE inkH12): a band's own width is the same number in both, so the
// ground and the sky agree band for band.
const fract = (x) => x - Math.floor(x);
function hash12(i, k) {
  const qx = fract(i * 0.1031), qy = fract(k * 0.1031), qz = qx;
  const d = qx * (qy + 33.33) + qy * (qz + 33.33) + qz * (qx + 33.33);
  return fract((qx + d + qy + d) * (qz + d));
}

/** The undecorated cloud roof at a direction. Deterministic, cheap, and read
 *  on every probe: the same field draws the ground and softens the routes. */
function deckAt(dir, ctx) {
  const nz = ctx.nz, fbm = ctx.fbm;
  // the band, read from the same three stretched fields the shell's boundary is
  // drawn from: latitude five times as fast as the east-west direction, so the
  // noise runs out along the belts and never across them
  const wA = fbm(nz, dir.x * 1.35, dir.y * 4.20, dir.z * 1.35, 3) * 2 - 1;
  const wB = fbm(nz, dir.x * 3.05, dir.y * 22.60, dir.z * 3.05, 3) * 2 - 1;
  const sq = (dir.y * BELTS + wA * 1.32 + wB * 0.68) * 0.5;
  const ci = Math.floor(sq);
  const cyc = sq - ci;
  const hA = hash12(ci, 7);
  const hB = hash12(ci, 23);
  // the belt's own span in its cell, hashed like the shell's: a wide one, a
  // lane, or none at all, with the zone running across
  const thr = 0.26 + 0.26 * hA;
  const b1 = thr + (hB < 0.20 ? 0 : Math.min(0.14 + 0.62 * (hB - 0.20) / 0.80, 1 - thr - 0.07));
  const bw = 0.19;
  const beltK = smoothstep01(thr - bw, thr + bw, cyc) * (1 - smoothstep01(b1 - bw, b1 + bw, cyc));
  const swells = fbm(nz, dir.x * 4.6, dir.y * 9.8, dir.z * 4.6, 2) * 2 - 1;
  const fine = fbm(nz, dir.x * 11.0, dir.y * 23.0, dir.z * 11.0, 2) * 2 - 1;
  const puff = PUFF_AMP * (0.72 * dome(nz(dir.x * PUFF_F0, dir.y * PUFF_F0, dir.z * PUFF_F0))
    + 0.28 * dome(nz(dir.x * PUFF_F1 + 5.1, dir.y * PUFF_F1, dir.z * PUFF_F1)));
  return ROLL_AMP * (0.42 - 0.95 * beltK) * (0.72 + 0.52 * hB) + SWELL_AMP * swells + 0.18 * fine + puff;
}

export default {
  id: 'giant',
  label: 'Gas giant',
  blurb: 'banded cloud decks, storms and a hexagon',

  /** Ten hours in a week, or eleven hundred of load across eight sessions and
   *  more: the weeks whose volume does not fit on a globe. Everything below the
   *  floor is a rounding error, and a week that was neither long nor heavy
   *  claims nothing at all. */
  fit(stats) {
    const hours = num(stats?.hours, 0);
    const load = num(stats?.load, 0);
    const count = num(stats?.count, 0);
    if (!(hours > 0)) return 0;
    const volume = clamp((hours - 7.0) / 4.2, 0, 1);
    const heavy = clamp((load - 950) / 350, 0, 1);
    const many = clamp((count - 6) / 6, 0, 1);
    return clamp(0.62 * volume + 0.24 * heavy + 0.14 * many, 0, 1);
  },

  /** Why the week is a gas giant, in plain words: what fit() weighs, then the week's own numbers. */
  reason(stats) {
    const hours = num(stats?.hours, 0);
    const load = Math.round(num(stats?.load, 0));
    const count = num(stats?.count, 0);
    return `The biggest weeks turn to gas. Hours past 7 count most, then training load and sessions. This week: ${hours.toFixed(1)} hours in ${count} sessions, a load of ${load.toLocaleString('en-US')}.`;
  },

  /** A giant has no shoreline. The sea is read off the same quantile as every
   *  other week (base.js), so the honest way to take it away is to say the sea
   *  line is the lowest ground there is: the clouds are the floor, top to
   *  bottom. */
  climate(c) {
    c.oceanFrac = 0;
    return c;
  },

  /** The undecorated ground: the week's cloud roof, and nothing else. */
  baseline(dir, ctx) {
    return deckAt(dir, ctx);
  },

  /** The week's own routes, laid on the roof rather than carved through it: a
   *  run leaves a ribbon of light across the clouds (the body draws it) and
   *  never a range or a road. Nine tenths of the carve is given back to the
   *  deck, so what the week's own country would have made of this ground is
   *  only a faint working of it under the billows: the cloud is what is
   *  standing there. */
  shape(dir, h, ctx) {
    const deck = deckAt(dir, ctx);
    return deck + (h - deck) * 0.10;
  },

  /** The week's palette, read as a deck: every ground name is pulled to the pale
   *  end and toward its neighbour — a cloud top is a wash of the same light, one
   *  or two steps apart, not a country — the fields are taken off the lowland
   *  entirely, and the sky is not another planet's at all: it is the deck's own
   *  washes, thinned, so what stands over the runner is the top of the same
   *  atmosphere they are standing on. The week's mineral and the palette's
   *  committed dark are left exactly where the week put them: they are the great
   *  spot and the night. */
  palette(pal, features) {
    const paper = pal.paper;
    const pale = (c, t) => c.clone().lerp(paper, t);
    // the roof's own washes: three steps of one pale light, and no step of them
    // far enough from its neighbour to be a different material
    pal.landLow = pal.landLow.clone().lerp(pal.litWarm, 0.50).lerp(paper, 0.34);
    pal.landMid = pal.landMid.clone().lerp(pal.litWarm, 0.46).lerp(pal.crest, 0.24);
    pal.landHigh = pal.landHigh.clone().lerp(pal.litWarm, 0.44).lerp(pal.crest, 0.22);
    pal.stone = pal.stone.clone().lerp(pal.litWarm, 0.55).lerp(paper, 0.22);
    // …but the palest wash of all stays a step under the sheet: the deck is the
    // picture and the paper is not, and a zone as pale as the page would take
    // the giant's own edge away with it, band by band
    pal.crest = pale(pal.crest, 0.10);
    pal.dry = pale(pal.dry, 0.12);
    pal.veg = pale(pal.veg, 0.58);
    pal.bare = pal.bare.clone().lerp(pal.litWarm, 0.45).lerp(paper, 0.40);
    // no fields, no bare earth: a deck has no lowland to lay them on
    pal.vegAmt = 0;
    // …and no creased plane either. A calm week reads each step of the plan at
    // its own scale, so the washes here are laid long and unbroken across the
    // swells: a cloud sheet is one wash over its own band from fold to fold, and
    // a broken one would put a country back under the runner's feet.
    pal.calm = 0.42;
    // the air over the deck: the deck's own washes and its own banding, thinned
    // — a giant's sky is the top of the same atmosphere the runner is standing
    // on, and its darkest band is the deck's own shade, warmed
    pal.skyHigh = pale(pal.skyHigh, 0.62);
    pal.skyBand = pal.skyBand.clone().lerp(pal.litWarm, 0.62);
    pal.skyLow = pal.skyLow.clone().lerp(pal.litWarm, 0.62).lerp(paper, 0.24);
    pal.skyWash = pal.skyWash.clone().lerp(pal.crest, 0.62).lerp(paper, 0.20);
    pal.skyDeep = pal.skyDeep.clone().lerp(pal.landMid, 0.72).lerp(paper, 0.10);
    pal.cloudUnder = pal.cloudUnder.clone().lerp(pal.landMid, 0.42);
    pal.skyHaze = pale(pal.skyHaze, 0.46);
    if (pal.skyScheme?.clone) {
      const s = pal.skyScheme.clone();
      pal.skyScheme = s.setW(Math.min(2.6, num(s.w, 1) * 1.35 + 0.25));
    }
    return pal;
  },

  /** The poster is the giant's own crop: the deck itself is what the frame is
   *  fitted to, and at 0.82 of the short axis the deck's own limb runs through
   *  every side of the shelf's crop: the belts are seen to curve with the sphere
   *  as they come round to it, the haze thickens along it, the ink edge is drawn
   *  on it, and the night the light leaves still has a wedge of the frame of its
   *  own — a giant at the range where its weather stops being a pattern and
   *  starts being a place. The paper is left only in the corner wedges a round
   *  thing leaves when it is bigger than the page. (Nearer than ~0.70 the whole
   *  disc sits inside the crop and the giant is a specimen again; past ~1.0 no
   *  edge is left in the frame at all and it is a texture.) The closest orbit
   *  stands 45 units over the deck (floor, over R): nearer, the frame holds a
   *  tenth of one band and the deck is a flat wash of its own cream. */
  orbit: { fill: 0.82, floor: 65 },

  /** The deck in the sky and the moons beside it, in one object: the deck fades
   *  as the camera comes down through it, the moons stay. A giant week is never
   *  a race week (no race week is this big), so nothing here meets a race ring. */
  load: () => import('./giant-shader.js'),
  create(shared, { createGiant }) {
    return createGiant(shared);
  },
};

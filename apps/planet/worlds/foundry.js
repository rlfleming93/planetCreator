/* Planet Creator — the foundry world.
 *
 * A strength week is a week built rather than travelled: the hours went into
 * work done standing still, under a bar and on the floor, and the week crossed
 * nothing. So this world has no country to be read as. It is a floor.
 *
 * Basalt. That floor is a pavement of cooled columns, drawn as one system: a
 * jittered lattice of tiles ~35 units across — the band a tile has to live in,
 * wider than the step the ink reads *form* at from orbit (su = 2.4 + 0.06·distance
 * ≈ 26–34 u, so a tile is read as one mark instead of as mottle, and narrower
 * than a plate) — so about thirty-five of them show across the face. Each tile
 * is a flat top standing on one of two quantised rungs of the week's own slow
 * field, every cell rounded by its own jitter, so the pavement reads as
 * districts of columns whose neighbours step against each other tile by tile.
 *
 * The drawing is in the cracks. Every shared wall carries a joint — a flat floor
 * two and a half units either side of the boundary, with a near-vertical side —
 * cut the whole way down to the glass the flow cooled on: hRel 0, the bottom of
 * the ink's low band. So the network is painted in the palette's dark glass and
 * is drawn in *tone*, which is the only thing that survives a light this flat: a
 * two-unit shadow is erased by it, and a step of six units is what moves the
 * ground from one band of the picture to the next (lowRamp crosses hRel 0.5 →
 * 7.0). The tiles stand three units apart, which is the other half of the same
 * argument — a step that small is a terrace underfoot and a round edge at the
 * limb — and the two rungs are far enough apart on the ink's own ramp (0.28 and
 * 0.39) that neighbouring columns read as two values of the one stone, with the
 * joint between them a tone darker than either.
 *
 * Where that drawing arrives at orbit is worth saying plainly, because it is a
 * rule of the ink rather than of this floor: from the poster's distance every
 * surface square-on to the light takes the reserve — one flat wash of the
 * driest ground's own colour — so across the lit middle of the disc the joints
 * are drawn by their sides alone, an ink sketch on a stone wash, and their dark
 * floors arrive where the ground turns from the light: the outer belt of the
 * disc, and the whole night side under light.terminator. Both are set up for it
 * here: the reserve is a mid warm grey and never the sheet, so the sketch reads
 * as a drawing on stone rather than as scratches on paper, and the quarries
 * stand far enough above the floor that their yards break the reserve wherever
 * they fall.
 *
 * At the site of every lift the floor is quarried: a raised block of the same
 * basalt, cut off from the pavement by a yard of the glass, which is the dark
 * ring the eye finds it by. The block is read from the session's own load — its
 * lifted volume where the watch recorded one, its training load otherwise, the
 * same reading ink-kinds gives a spire — and it stands high enough to be the one
 * thing on this floor in the picture's top band, so a foundry week's lifts read
 * as pale plates laid on a dark, cracked plain instead of as bumps in rubble.
 *
 * No sea (see climate): a week spent indoors has no coastline, and the floor is
 * read as one thing everywhere — glass, then columns — instead of a land with a
 * shore.
 *
 * The palette is four pigments and the page: indigo (the shade, the heights and
 * the committed dark), a near-black glass for the cracks and the lava plains,
 * umber for the pavement's own stone, and a weathered grey for the quarried
 * blocks. Nothing here is paper-bright — not the lit face, which is a mid warm
 * grey, and not the crest, which is stone — so the poster stays dark and heavy
 * with paper only where the brush broke, and no rung of the picture is a pale
 * slab. The week still shows through all of it — a hot week keeps its ochre in
 * the light and its umber on the stone, a cold one reads greyer and bluer —
 * because the family is laid over the week's palette and not in place of it.
 *
 * The overlap with mesa (worlds/mesa.js) is settled by the larger share. A ride
 * week and a strength week are two readings of the same hours, so a week with
 * both at or over their claim belongs to whichever share is larger: the loser's
 * `fit` is 0 (see fit below), and the winner adds its whole lead over the rival
 * to its own fit, so the two claims stand 1.5× the difference apart and `auto`
 * is never asked to break a tie. A week the two are within a few points of each
 * other on is left to classic (2026-01-19, with tundra also claiming it, is the
 * one week of the nine that reads as classic by `auto`).
 */
import { paintedMoon } from './companions.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smoothstep = (t) => t * t * (3 - 2 * t);

/* --------------------------------------------------------------- the claim --- */

// The claim is 45% of active time — the share the week's own reading rounds to
// a whole percent — so a week the readout calls 45% is a strength week even
// when the hours behind it sit a hair under (2025-07-21 is 0.4489 of its time
// under the bar, and reads as a 45% week).
const CLAIM = 0.45;
const CLAIM_SLACK = 0.005;
const claims = (share) => share >= CLAIM - CLAIM_SLACK;
const REST_SESSIONS = 3; // a week of three sessions or fewer is a rest week

const share = (stats, family) => {
  const value = Number(stats?.sports?.[family]);
  return Number.isFinite(value) ? value : 0;
};

// Rest weeks are the weeks with nothing in them: three sessions is a rest week
// whatever they were made of, and the two strength-heavy weeks this holds back
// (2025-10-13, 2026-06-08) carry under two hours of work between them. A
// foundry is filled by a week's work; there is no week here to fill.
const rested = (stats) => (Number(stats?.count) || 0) <= REST_SESSIONS;

/** The strength family, read the way worlds/index.js reads it (familyOf): a
 *  `training` session that is not mobility work. The watch files yoga under
 *  `training` too, and a stretch session does not pour columns. */
const isLift = (a) => String(a?.sport || '').toLowerCase() === 'training'
  && !/yoga|pilates|stretch|breath|mobility/.test(String(a?.title || '').toLowerCase());

/* ----------------------------------------------------------- the pavement --- */

// The column lattice: cells per radian of direction. At 3.4 a cell spans
// ~1/3.4 rad ≈ 35 world units of ground — the middle of the band a tile has to
// live in: wider than the step the ink reads *form* at from orbit
// (su = 2.4 + 0.06·distance ≈ 26–34 u, so a tile is read as one mark instead of
// as noise), and small enough that about thirty-five of them show across the
// face. At 27 u the lattice falls under the survey's own step and the floor
// comes back as rubble; at 45 u the face is five tiles wide and reads as plate.
const LATTICE = 3.4;
// The wall between two columns: their two tops meet over 0.16 of a cell, some
// six units of ground, so a step between neighbouring rungs is a slope of about
// half — a terrace the runner walks up, and at the limb a rounded shoulder
// rather than a facet.
const WALL = 0.16;
// The crack: a joint cut along every shared wall, taken the whole way down to
// the glass — a flat floor 0.07 of a cell wide (two and a half units either
// side of the boundary) with a near-vertical side over the next 0.055. This is
// the one thing in the world that has to survive the poster's flat light: the
// ink reads a ground's colour off its height, so a joint whose floor is at
// hRel 0 and whose tiles stand six units up is painted in a *tone* dark enough
// to be a line, where a joint cut two units deep is erased. A parallel-sided
// joint and not a V, because the picture's tone ramp is six and a half units
// wide: a V spends five of them on its own flanks and comes back as a smudge.
const CRACK_FLOOR = 0.07;
const CRACK_W = 0.125;
// The glass the flow cooled on: the floor of every joint, and the yard a quarry
// is cut out of. It sits two units below hRel 0 — the bottom of the ink's low
// band — with only the week's own slow roll in it, so the network is dark
// everywhere; and it sits *below* the columns by five to eight units rather than
// by three, which is what the light asks for. The ink reads its form off a
// survey sampled every thirty-four units, and the tilt of a joint's wall is what
// drops the light below the reserve the poster's sun lays on a lit floor: a
// joint three units deep tilts that sample barely at all and reads as a pencil
// scratch, one eight units deep reads as a cut.
const GLASS = -2.0;
const CONT = 0.16; // how much of the week's continental term the floor carries
const CALM = 0.22; // the glass's own slow roll, in world units
// The columns' two tops, in world units above the glass. Two, and three units
// apart, and the reason is the picture again: the ink's low band is only six and
// a half units tall (lowRamp crosses hRel 0.5 → 7.0), so the whole ladder from
// the joint floor to the tallest column has to fit inside it, and three rungs
// would either land two tiles on the same tone or leave the lowest one dark
// enough to read as another joint. Two rungs three units apart give what the
// brief asks of a silhouette that has to stay round under a twelve-unit relief
// cap — the step the runner climbs and the eye reads as columnar — and put
// neighbouring tiles on two clearly different values of the one stone: with the
// glass at −2 these tops stand at hRel 3.4 and 6.4, which the ink reads as 0.26
// and 0.39, with the joint floor at 0.15 a tone darker than either.
const RUNGS = [5.4, 8.4];
// How far a cell's own jitter may move it off its district's rung, in rung
// units: ±1, so the tiles inside a district alternate tile by tile — which is
// what makes a pavement read as columns rather than as two painted plates.
const JITTER = 0.5;
// The district field, how hard it is pushed into its rungs and where its middle
// sits. Its wavelength is ~1/1.25 rad ≈ 96 u, so a district is two or three
// tiles across and the floor is a patchwork of them rather than a texture.
const SHELF_FREQ = 1.25;
const SHELF_GAIN = 1.25;
const BASE = 0.5;
// The quarry: how high a lift's block stands above the glass, and how much of
// the session's heft is added to that. The block is left well above the orbit
// relief cap on purpose. It is drawn flat at the cap, so what the extra height
// buys is not relief but *tone*: the ink reads a ground's colour off its height,
// and the top band of the palette — the weathered grey, the one pale rock in
// this family — is only reached at eighteen units. A block standing at the cap
// would be the same stone as the pavement it was cut from and would read as a
// boulder; a block at twenty is the pale plate the yard's dark ring is drawn
// around, and the ring and the plate are the whole shape.
const BLOCK = 18.6;
const BLOCK_HEFT = 4.0;

/** One lattice cell's own numbers, from its three integers and the week's salt:
 *  a plain integer hash, because the pavement asks for four of them at every
 *  vertex it visits and nothing here may allocate. */
function cellHash(x, y, z, salt) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x9e3779b1) ^ Math.imul(z | 0, 0x85ebca77) ^ salt;
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  h = Math.imul(h ^ (h >>> 13), 0x3b7f1e2b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// The pavement's height above the glass at the last direction asked (see
// pavement), and the scratch the next call fills: module numbers, never objects
// — baseline runs ~163k times a globe and none of it may allocate.
let pav = 0;

/** A cell's own top: its district's rung, rounded by the cell's own jitter, so
 *  two neighbours in one district stand on different rungs as often as on the
 *  same one. Three rungs and a ±1 of jitter, so the worst step between two
 *  neighbouring columns is one rung — 2.9 units — whatever the field does. */
function rung(u, h) {
  return RUNGS[Math.round(clamp(u + JITTER * (h * 2 - 1), 0, 1) * (RUNGS.length - 1))];
}

/**
 * The two nearest sites of the jittered lattice, and the top each carries.
 * Distances are in lattice cells; `u` is the district field (0..1) that says
 * which rung a district of columns stands on. The pavement's height above the
 * glass at this direction is left in `pav`: the two tiles' own tops, blended
 * across the wall between them, with the crack cut along that same wall all the
 * way down to the glass — so the surface stands at exactly 0 on a boundary, and
 * the ink paints the whole network in the bottom of its low band. A cell whose
 * plane is already further off than the second-nearest site found so far is
 * skipped before its hash is read, which is why the three loops cost closer to
 * ten cells than to twenty-seven.
 */
function pavement(x, y, z, salt, u) {
  const px = x * LATTICE, py = y * LATTICE, pz = z * LATTICE;
  const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
  let d1 = 1e9, d2 = 1e9, h1 = 0, h2 = 0;
  for (let dx = -1; dx <= 1; dx++) {
    const gx = dx * dx;
    if (gx >= d2) continue;
    const cx = ix + dx;
    for (let dy = -1; dy <= 1; dy++) {
      const gxy = gx + dy * dy;
      if (gxy >= d2) continue;
      const cy = iy + dy;
      for (let dz = -1; dz <= 1; dz++) {
        const g = gxy + dz * dz;
        if (g >= d2) continue;
        const cz = iz + dz;
        const jx = cx + 0.08 + 0.84 * cellHash(cx, cy, cz, salt);
        const jy = cy + 0.08 + 0.84 * cellHash(cx, cy, cz, salt ^ 0x5bf03635);
        const jz = cz + 0.08 + 0.84 * cellHash(cx, cy, cz, salt ^ 0x1b873593);
        const ex = jx - px, ey = jy - py, ez = jz - pz;
        const d = ex * ex + ey * ey + ez * ez;
        const top = cellHash(cx, cy, cz, salt ^ 0x27d4eb2f);
        if (d < d1) {
          d2 = d1; h2 = h1;
          d1 = d; h1 = top;
        } else if (d < d2) {
          d2 = d; h2 = top;
        }
      }
    }
  }
  // the wall: 0 on the boundary between two columns, 1 well inside one — and
  // the crack, which is 1 on the floor of that boundary and 0 out on the tiles
  const edge = Math.sqrt(d2) - Math.sqrt(d1);
  const wall = smoothstep(clamp(edge / WALL, 0, 1));
  const joint = smoothstep(clamp((edge - CRACK_FLOOR) / (CRACK_W - CRACK_FLOOR), 0, 1));
  // Across the wall the pavement runs from the two tiles' meeting height — so
  // the boundary reads at the same height from either side — up to the nearer
  // tile's own top; and along the boundary the crack is cut the whole way down,
  // which is the dark line the network is drawn by.
  const top = rung(u, h1) * wall + rung(u, h2) * (1 - wall);
  pav = top * joint;
}

/* ------------------------------------------------------------ the reading --- */

// The week, read once: the lift sites' own data and the salt the pavement draws
// from. Cached on the ctx identity, so the ~163k baseline calls each pay one
// comparison and nothing else.
let preparedFor = null;
let prepared = null;

function prepare(ctx) {
  if (preparedFor === ctx) return prepared;
  const rng = ctx.rng('foundry');
  const salt = (rng() * 4294967296) | 0;
  const sites = [];
  for (const place of ctx.placed || []) {
    if (!isLift(place?.a)) continue;
    const a = place.a;
    const load = Number(a.trainingLoad) || 0;
    const volume = Number(a.strength?.volumeKg) || 0;
    // The session's heft, read the way ink-kinds reads a spire's height: lifted
    // volume where the watch recorded it, training load otherwise.
    const heft = volume > 0 ? Math.log1p(volume / 900) : Math.sqrt(load) / 12;
    // A quarry is 31 to 41 units across — a block wider than a tile, so the
    // week counts its lifts as separate places on the floor rather than as a
    // texture — and the yard it was cut out of reaches half again as far, which
    // is the dark ring the block is read by.
    const radius = clamp(0.13 + 0.03 * heft, 0.13, 0.17);
    sites.push({
      x: place.dir.x, y: place.dir.y, z: place.dir.z,
      radius,
      radius2: radius * radius,
      outer2: radius * radius * 3.06, // 1.75 radii: the yard's own reach
      top: BLOCK + BLOCK_HEFT * heft,
    });
  }
  prepared = { salt, sites, ox: rng() * 40 - 20, oy: rng() * 40 - 20, oz: rng() * 40 - 20 };
  preparedFor = ctx;
  return prepared;
}

/* ------------------------------------------------------------- the palette ---
 *
 * Four pigments and the page, and — because a foundry has no sea to lay the
 * picture's darks in — a value ladder of its own, three masses apart:
 *
 *   the glass      the joints and the quarry yards, the committed dark (0.15–0.20)
 *   the pavement   the columns' own stone, umber in the middle (0.26–0.42)
 *   the quarries   weathered rock, a step lighter and still stone (0.50–0.56)
 *   the light      the sunlit face of the floor, a mid warm grey (0.44–0.50)
 *
 * The ink reads its ground colour off the height (lowRamp crosses hRel 0.5 → 7,
 * highW takes over at 9), so the rung a column stands on is what moves the
 * picture a tone: a joint floor two units under hRel 0 and a block at twenty are
 * the only things on this floor that leave the middle, and that is what keeps
 * the network a drawing and a quarry a find. The sheet is left to the brush and
 * never to a wash — the crest rung is stone and not paper, and the reserve the
 * poster lays on the lit ground is a mid warm grey rather than the page — so the
 * poster reads dark and heavy with paper only where the brush broke, and no rung
 * of the picture is a pale slab.
 */
const GLASS_COLD = 0x232838; // the joints and the yards: near-black indigo
const GLASS_HOT = 0x35332e; // …and where the sun has been on them
const UMBER_COLD = 0x6a655c; // the pavement's stone, cold
const UMBER_HOT = 0x86694a; // …and the umber it turns in the sun
const HIGH_COLD = 0x8f949c; // the quarried blocks: weathered, a step lighter
const HIGH_HOT = 0xa59c8c;
const INDIGO = 0x39406b; // the shade the columns throw
const DARK = 0x121627; // the committed dark: the ink the sea would have been
const STONE = 0x8a8e96; // the week's objects, cut from the same basalt
const SEPIA = 0x5b4531;
const LIGHT_COLD = 0x9d9a92; // the sunlit face of the floor, and the driest
const LIGHT_HOT = 0xb0a693; //   ground seen from orbit: a mid warm grey,
const DRY_COLD = 0x6e6a63; //   never the sheet and never a pale slab: the
const DRY_HOT = 0x7c7367; //     reserve the sun lays on this floor is stone
const CREST_COLD = 0x8e887c; // the crest rung is stone, not the sheet
const CREST_HOT = 0x9c9182;

const _hsl = { h: 0, s: 0, l: 0 };
/** A wash with less of its own hue: the sky over a foundry is a grey one. */
function soften(color, k) {
  color.getHSL(_hsl);
  color.setHSL(_hsl.h, _hsl.s * (1 - k), _hsl.l);
}

/** A pigment of the family's own, cut from a wash the week already carries —
 *  the hook runs once a week, so a clone here costs nothing. */
const pigment = (wash, hex) => wash.clone().setHex(hex);

/* ---------------------------------------------------------------- the world --- */

export default {
  id: 'foundry',
  label: 'Foundry',
  blurb: "A strength week's planet: a floor of cooled basalt columns 35 units across, parted by a network of joints cut all the way down to the glass, the columns standing on two values of the one stone, and a quarried block standing pale in its own dark yard at every lift's own site — no coastline anywhere.",
  // The shelf's still keeps the frame's middle 80%, and the ore moon stands
  // 1.2 R out: the poster is framed a step wider than the dial so the whole
  // moon is inside the crop on every week, without shrinking the globe much.
  orbit: { fill: 0.58 },

  /**
   * The week's claim, 0..1: how much of its active time went into lifting, and
   * how far that share leads the ride share mesa claims weeks by (both worlds
   * claim a strand of the week at 45% of active time). The gates are the whole
   * claim — a week under 45% strength, a week of three sessions or fewer, and a
   * week a ride owns are all answered with 0, so no `auto` pass ever has to
   * choose between two worlds that both fit.
   */
  fit(stats) {
    const strength = share(stats, 'strength');
    if (!claims(strength)) return 0;
    if (rested(stats)) return 0;
    const ride = share(stats, 'ride');
    if (ride >= strength) return 0; // mesa's week: the larger share wins
    // The claim, plus the lead it holds over a rival the other world also
    // wanted. The rival's side of this is the same rule read backwards, so a
    // real win stands 1.5× the difference clear of the loser's fit (0.12 of
    // lead is an 8-point difference in shares), and a week this world is sure
    // of — half its hours under the bar and no riding at all — reads 1.
    return Math.min(1, 0.5 + 0.5 * strength + (strength - ride));
  },

  /** Why this world took the week, in the words the readout uses. */
  reason(stats) {
    return `${Math.round(share(stats, 'strength') * 100)}% of the week lifting → a floor of cooled basalt`;
  },

  /**
   * No sea. An indoor week has no coastline to draw, and the floor is one thing
   * everywhere: glass, then shelves, then the columns. The ocean sphere is
   * still built — every world's is — but its water stands at the lowest ground
   * on the globe and never rises over a shore.
   */
  climate(c) {
    c.oceanFrac = 0;
    return c;
  },

  /**
   * Basalt, laid over the week's own palette rather than in place of it: the
   * week keeps its sheet, its sky (cooled a step) and its own light, and the
   * stone it is painted as moves with the week's temperature — a hot week keeps
   * its ochre in the light and its umber on the shelves, a cold one reads
   * greyer and bluer.
   */
  palette(pal, features) {
    const hot = clamp(Number(features?.warmth) || 0, 0, 1);
    const glass = pigment(pal.landLow, GLASS_COLD).lerp(pigment(pal.landLow, GLASS_HOT), hot);
    const umber = pigment(pal.landMid, UMBER_COLD).lerp(pigment(pal.landMid, UMBER_HOT), hot);
    const high = pigment(pal.landHigh, HIGH_COLD).lerp(pigment(pal.landHigh, HIGH_HOT), hot);
    const light = pigment(pal.litWarm, LIGHT_COLD).lerp(pigment(pal.litWarm, LIGHT_HOT), hot);
    // the lit ground seen from orbit: a mid warm grey, never the sheet and
    // never the pale slab the reserve would otherwise lay over the lit half
    const dry = pigment(pal.dry, DRY_COLD).lerp(pigment(pal.dry, DRY_HOT), hot);
    // the driest rung of the plan is stone here too: a foundry has no ice and
    // no beach, and the ink paints whatever the sun is square on with this
    const crest = pigment(pal.crest, CREST_COLD).lerp(pigment(pal.crest, CREST_HOT), hot);

    // the ground: the cracks and the lava plain the committed dark, the
    // pavement's own stone in the middle, the quarried blocks a step lighter
    pal.landLow.lerp(glass, 0.85);
    pal.landMid.lerp(umber, 0.8);
    pal.landHigh.lerp(high, 0.75);
    pal.shadeCool.lerp(pigment(pal.shadeCool, INDIGO), 0.65);
    pal.dark.lerp(pigment(pal.dark, DARK), 0.85);
    pal.litWarm.lerp(light, 0.72);
    pal.crest.lerp(crest, 0.7);
    pal.stone.lerp(pigment(pal.stone, STONE), 0.6);
    pal.sepia.lerp(pigment(pal.sepia, SEPIA), 0.6);
    pal.dry.lerp(dry, 0.85);
    pal.bare.lerp(umber, 0.7);
    // No fields on a foundry floor, and no bare-earth patchwork either: the
    // lowland stays stone. The week's volume is said elsewhere — in how many
    // sessions stand as column clusters, and how tall the watch's load stands
    // them — where a patchwork of fields would only say the week was long.
    pal.vegAmt = 0;
    // the sea is never seen, but its washes are the dark the shade is made of
    pal.seaDeep.setHex(0x14182a);
    pal.seaShallow.setHex(0x2a3050);
    pal.cobalt.setHex(0x252c52);
    pal.teal.setHex(0x394066);
    pal.damp = 0;
    pal.shelf.lerp(pal.landLow, 0.6);
    // the sky stays the week's own weather, cooled a step toward the stone
    soften(pal.skyBand, 0.25);
    soften(pal.skyWash, 0.30);
    soften(pal.skyDeep, 0.20);
    soften(pal.skyHigh, 0.20);
    soften(pal.skyLow, 0.20);
    // the week's mineral lies in the creases of the rock, and on this week it
    // is the indigo a strength session carries: read a step louder than usual
    pal.accentAmt = clamp((Number(pal.accentAmt) || 0) * 1.2 + 0.08, 0, 0.6);
    return pal;
  },

  /**
   * The floor, per vertex. Three terms and no allocation:
   *   the glass    — the week's continent at a small weight, rolled slowly, and
   *                  the floor of every crack the pavement is cut by
   *   the pavement — the columns' own quantised tops, cut down at every wall
   *   the quarries — a raised block in a yard of the glass at every lift's site
   */
  baseline(dir, ctx) {
    const wk = prepare(ctx);
    const x = dir.x, y = dir.y, z = dir.z;

    // 1. the glass. The week is still the shape of the ground, but at a small
    //    weight and inside the ink's own low band: this is a floor, not a
    //    country, and everything the picture paints dark is made of it.
    const calm = ctx.fbm(ctx.nz, x * 1.15 + wk.ox, y * 1.15 + wk.oy, z * 1.15 + wk.oz, 3) * 2 - 1;
    const glass = GLASS + CONT * ctx.macro(dir) + CALM * calm;

    // 2. the pavement. One slow field says which rung of the floor a district
    //    of columns stands on; every cell rounds it by its own jitter, so the
    //    districts step against each other and the tiles within them step by
    //    their own. Where the two tops meet, the crack cuts the whole way down
    //    to the glass, and it is that cut — not the rung — the network is drawn
    //    by (see pavement).
    const broad = ctx.fbm(ctx.nz, x * SHELF_FREQ - 4.1, y * SHELF_FREQ + 8.3, z * SHELF_FREQ - 2.7, 2) * 2 - 1;
    const u = clamp(BASE + SHELF_GAIN * broad, 0, 1);
    pavement(x, y, z, wk.salt, u);

    // 3. the quarries. Every strength session's own site is quarried: a block
    //    of the floor's own run cut free of the pavement and left standing in
    //    the yard it came out of, sized by the session's own load. The block is
    //    what the week counts — its lifts stand at their own place on the floor
    //    as pale plates on the dark, and never as bumps in a rubble — and the
    //    yard is the dark ring they are read by. Masks are combined before they
    //    are used, so two quarries that touch still leave one surface.
    const sites = wk.sites;
    let block = 0, yard = 0, top = 0;
    for (let i = 0; i < sites.length; i++) {
      const s = sites[i];
      const dot = x * s.x + y * s.y + z * s.z;
      const chord2 = 2 - 2 * dot;
      if (chord2 >= s.outer2) continue; // before any sqrt: most sites, most vertices
      const r = Math.sqrt(chord2) / s.radius; // 0 at the centre, 1 on the rim
      // the block: everything inside the rim, with a near-vertical cut face —
      // a quarry face and not a shoulder, so the plate reads as cut stone
      const cut = 1 - smoothstep(clamp((r - 0.88) / 0.12, 0, 1));
      // the yard: the ring of glass the block was lifted out of, reaching three
      // quarters of a radius past the rim before the pavement takes over again
      const ring = smoothstep(clamp((r - 0.90) / 0.12, 0, 1)) * (1 - smoothstep(clamp((r - 1.28) / 0.47, 0, 1)));
      if (cut > block) { block = cut; top = s.top; }
      if (ring > yard) yard = ring;
    }
    // the yard is the glass (the pavement is cut away there), and the block
    // stands out of it: the same floor, one rung of the picture higher
    return glass + pav * (1 - block) * (1 - yard) + top * block;
  },

  /**
   * The ore moon: a lump of the week's own mineral hung over the floor, sized
   * from the week's load and set square to the poster the app will frame — the
   * camera stands where base.js's own rule puts it (the week's subject turned
   * toward the sun by POSTER_OFF), and the moon hangs a quarter of the sky round
   * from it, so it sits beside the globe's limb and inside the shelf's crop on
   * every week rather than across the disc or off the edge.
   */
  companions(ctx) {
    const features = ctx.features;
    if (!features?.makeRng) return null;
    const rng = features.makeRng('foundry-moon');
    const sun = ctx.uniforms?.uSunDir?.value;
    // the week's subject: the same time-weighted centroid base.js aims at (a
    // strength week has no race, so no monument and no far-rim aim)
    let cx = 0, cy = 0, cz = 0;
    for (const f of features.list || []) {
      if (f.kind === 'monument') continue;
      const seconds = Math.max(900, Number(f.stats?.activeS) || 0);
      cx += f.dir.x * seconds;
      cy += f.dir.y * seconds;
      cz += f.dir.z * seconds;
    }
    let cl = Math.hypot(cx, cy, cz);
    if (!(cl > 1e-6)) { cx = 0; cy = 1; cz = 0; cl = 1; }
    cx /= cl; cy /= cl; cz /= cl;
    // …turned toward the sun by POSTER_OFF, the way turnToSun does it
    let ax = 1, ay = 0, az = 0;
    if (sun) {
      const sd = cx * sun.x + cy * sun.y + cz * sun.z;
      ax = sun.x - cx * sd; ay = sun.y - cy * sd; az = sun.z - cz * sd;
      const al = Math.hypot(ax, ay, az);
      if (al > 1e-3) {
        const off = (60 * Math.PI) / 180;
        cx += (ax / al) * off; cy += (ay / al) * off; cz += (az / al) * off;
        const l = Math.hypot(cx, cy, cz) || 1;
        cx /= l; cy /= l; cz /= l;
      }
    }
    // square to the camera: the camera's own east (a quarter turn about the
    // world's pole), lifted a little in the view plane, which puts the moon out
    // at the limb and above the equator of the frame
    let sx = cz, sy = 0, sz = -cx;
    const sl = Math.hypot(sx, sy, sz);
    if (sl > 1e-3) { sx /= sl; sz /= sl; } else { sx = 1; sy = 0; sz = 0; }
    // the view plane's up: cross(camera, east)
    const ux = cy * sz - cz * sy;
    const uy = cz * sx - cx * sz;
    const uz = cx * sy - cy * sx;
    let mx = sx + 0.22 * ux, my = sy + 0.22 * uy, mz = sz + 0.22 * uz;
    const ml = Math.hypot(mx, my, mz) || 1;
    mx /= ml; my /= ml; mz /= ml;
    const load = Number(features?.stats?.load) || 0;
    // A moon has to read at thumbnail size and stay inside the crop: its disc is
    // an eighth of the globe's own diameter, standing 1.2 R out.
    const radius = clamp(10 + load / 300, 10, 13);
    return paintedMoon(ctx, {
      radius,
      distance: features.radius * 1.2,
      dir: [mx, my, mz],
      seed: Math.floor(rng() * 1000),
      drift: 0.02,
    });
  },
};

/* Planet Creator — the commons world.
 *
 * Football is the sport Ryan plays in the middle of a village: nearly half of
 * his weeks carry a kickabout, and in a handful of them the football is most of
 * what the week was. Those weeks read as one green landscape rather than a
 * mountain range — broad commons of low, rolling pasture, hedged fields rising
 * in shelves toward the downs, and, where the week's sessions were played, a
 * levelled clearing that stays flat and dry underfoot. The pitch landmark is
 * built on that clearing (see ink-kinds.js), so it is cut to the footprint a
 * pitch needs: a smooth oval, twenty units long and fifteen across, standing
 * above the week's water wherever the week put it.
 *
 * The world takes the week apart like this:
 *
 *   fit      football share of active time ≥ 0.45, on a week that was not a
 *            rest: half the week on the pitch is what a commons is made of.
 *   climate  the sea is drawn back to its slate edges — a commons week is
 *            mostly land, so the ocean keeps three quarters of the area the
 *            week's sweat asked for.
 *   baseline the week's own continental term, drawn down to common land, over
 *            the commons' own long swell; the ground is taken into plots by a
 *            seeded field-boundary Voronoi (each site placed in its cell by the
 *            cell's own hash), each plot a little above or below its neighbours
 *            so a boundary is a low lynchet rather than a wall, hedged along it
 *            with a bank the ink pass draws as a line; the whole ground is also
 *            quantised into pasture shelves, low ones by the water and more of
 *            them up the land.
 *   shape    the week's own landforms are drawn down to pasture scale (a run's
 *            ridge is a long bank across the commons, not a massif; a race week
 *            keeps its courses whole), and then at every football session's
 *            site a clearing is levelled into the pasture — the land's own
 *            swell with the fields and the shelves taken out of it, lifted
 *            clear of the week's water — with a low chalk lip where the level
 *            meets them.
 *   orbit    the globe is framed to a low relief cap, so the poster's limb holds
 *            the commons' own round shape; the landing patch stays uncapped.
 *   palette  village green: sage and meadow low down, chalk on the dry crests
 *            and the field walls, slate water, and a committed dark of hedged
 *            country. The fields are always up, whatever the week's volume.
 *
 * Everything is drawn from the week alone (ctx.rng / ctx.nz) and sits behind
 * `world.archetype: commons`: no default path, no other world, no pin moves.
 */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* ---- the week's claim on the world ---------------------------------------- */

// Half the week's active time on the pitch is the gate. Below it the week is
// better read as whatever else it was — a ride week with a kickabout in it —
// and the world stays out of the way (a fit of 0 is no claim at all).
const FOOTBALL_GATE = 0.45;
// A rest week is not a week spent on the green, however much of it was
// football: one session, or barely two hours of training, is a week of lying
// about, and there is no week there to draw as a landscape.
const REST_HOURS = 2.5;
const REST_SESSIONS = 1;

// The sport's own name settles it, and so does the title — the same reading
// worlds/index.js gives a football share (a kickabout on a track reads as a run
// to a watch, and the title is all that tells them apart).
const isFootball = (activity) => /football/i.test(String(activity?.sport || ''))
  || /football/i.test(String(activity?.title || ''));

/* ---- the ground the world draws ------------------------------------------- */

// The fields: a seeded Voronoi on a lattice — every site is placed inside its
// own lattice cell by the hash of that cell, so a field is always in the same
// place, there is no seed list to walk, and a vertex only has to look at the 27
// cells around it.
//
// The plots come out about forty-six units across: big for a field, and cut to
// the size the poster reads. The washes see the ground through a survey whose
// step is a sixth of the globe's radius (34 u at the poster's distance,
// TERRAIN_FRAG), and the ink's hand draws a fold only where it survives three
// taps — five, eleven and twenty-two pixels of the same ground. At thirty units
// a plot was under one step of the survey: the whole patchwork averaged to a
// single mottled wash, which is what made the old commons read as camouflage
// rather than as country. At forty-six a plot is two steps and the boundary
// between two of them is a fold the hand can find, so the network of hedges is
// drawn as lines instead of guessed at as texture.
const FIELD_SCALE = 2.6;       // lattice cells across the globe's radius
const FIELD_JITTER = 0.92;     // how far a site may sit from its cell's own centre
const FIELD_U = 120 / 2.6;     // one lattice unit in world units (≈46 u)

// Each plot sits a little above or below its neighbours, and the ground is taken
// up across the hedge between them, so a boundary is a step two fields can be
// read across rather than a wall. That step — more than the hedge itself — is
// what makes the network legible from the air: it is the fold the hand draws,
// and a step below ~6 u is under the survey's own resolution and disappears into
// the wash. Plots level out up the land, so the low commons is a patchwork and
// the downs are open pasture.
const PLOT_LEVEL = 3.8;        // the furthest a plot sits from its neighbours, in units
const PLOT_BAND = 4.5;         // the run over which a plot reaches its own level, in units
const PLOT_FADE_LO = 3;        // the height above the sea at which plots come to full strength
const PLOT_FADE_HI = 13;       // the height above the sea at which the downs are open pasture

// The hedge on a boundary: a bank five units high and ten across, wandering off
// the exact boundary the way a planted hedge does. The wander's fbm is only run
// by the vertices near a boundary, inside the gate.
//
// The size is not a taste, and it is not the ink hand's either. The hand draws
// its lines only where the sheet is *dark* (INK_FRAG lifts the brush off the lit
// face: the crease term is gated by 1-smoothstep(0.34, 0.52, lum), and the whole
// line by 1-litGate), so a network of dark hedge lines across the lit half of a
// commons is not a thing this engine can draw — and the form itself is read at
// the survey's own step, thirty-four units from orbit (TERRAIN_FRAG), where a
// five-unit bank is nothing at all. What the washes can say is *value*: the band
// a vertex's own height falls in (hRel, read off the mesh, so at full
// resolution), so a bank that stands proud of the fields it parts carries the
// high band's wash along its whole length. That is the network: hedges as a
// darker thread of ground between the parcels, and the parcels as flat washes of
// gold, olive and green. The bank is therefore made tall enough to cross the
// high band's own threshold (9 u above the sea, see highW in ink.js) over the
// whole of the low commons, and wide enough that the band is a band and not a
// hairline the survey averages away.
const HEDGE_HW = 5.2;          // the bank's half-width, in units: wide enough that its
                               // flanks are a band of ground the washes can read, and
                               // narrow enough that a parcel still reads as a parcel
const HEDGE_H = 3.4;           // ...and its height. This was taken to five and a half in
                               // the last round, on the theory that a crest standing
                               // over the high band's own threshold would be painted in
                               // the band's darker wash. It is not: the threshold a
                               // commons' crest crosses first is the *snow line*
                               // (inkCaps, ten units over this week's sea), and a cap is
                               // the sheet asked for the reserve and exempted from the
                               // night — so the taller hedges came out as paper-white
                               // dashes, on the lit side and on the night side alike,
                               // which is worse than a hedge that does not read. The
                               // bank is therefore kept under the line: the network is
                               // carried by the plots' own tone (a field's level is its
                               // wash) and by the hedges drawn where the sheet is dark,
                               // which is the only place this engine draws a line.
const HEDGE_GATE = 22;         // how far a vertex may be from a boundary and still be bothered with
const HEDGE_WOBBLE = 0.9;      // how far the line wanders off the boundary, in units
const HEDGE_WANDER_FREQ = 26;
const HEDGE_WANDER_OCT = 2;

// The commons' own ground: the week's own continent, its fine relief softened
// (this is pasture, not a massif — what makes it gentle is the smallness of the
// detail, not the flatness of the land), over a long swell and a gentle rise
// that are the world's own and the same shape in every commons week. The
// continent's low side is kept whole and its high side drawn down a little: a
// vale deep enough for the week's water to lie in, and downs that stay downs
// without becoming a massif.
const GROUND_HIGH = 0.95;
const GROUND_LOW = 1.3;
const GROUND_LOW_OVER = 2.5;  // the fall over which the low side reaches its own scale
const FINE_K = 0.5;
const FINE_FREQ = 2.6;
const FINE_OCT = 3;
// The commons' own swell, and it is not a detail: the washes read the ground's
// *form*, and a country of one-plane fields has none until the land under the
// fields rolls. Five units over a hundred and sixty is a rise and a fall the
// eye reads across half a county from orbit, and it is what gives the fields a
// lit side and a shaded one instead of leaving every parcel the same tone.
const ROLL_FREQ = 0.72;
const ROLL_OCT = 3;
const ROLL_AMP = 5.0;
const RISE_FREQ = 3.1;
const RISE_OCT = 2;
const RISE_AMP = 0.9;

// Pasture shelves: the ground is quantised into levels of one step, flat over
// most of each level and rising over a soft band. Low commons keep few shelves
// — broad level ground, the water's own terrace — and the pastures up the land
// keep more, which is what makes the hillside read as terraced.
const TERRACE_STEP = 2.4;
const TERRACE_SOFT = 0.34;
const TERRACE_LOW = 0.28;
const TERRACE_HIGH = 0.74;
const TERRACE_RANGE = 7;     // the height over which the terraces come in, in units

// A clearing: the levelled oval a session was played on. Half its length and
// half its width in units — the pitch landmark's footprint (an oblong up to
// 30 × 18.6 for a long session, with a metre of margin round it) fits inside —
// and its level reads the land's own swell, so a clearing is level ground in its
// valley rather than a table standing in it. It is lifted clear of the week's
// water, and the blend back to the fields widens with the fall it has to take
// up, so a clearing that stands above a bay is a headland, not a cliff.
const CLEAR_LONG = 20;
const CLEAR_SHORT = 15;
const CLEAR_RING = 12;         // how many points of a clearing's rim are read for its level
const CLEAR_TILT = 0.18;       // how much of the land's own fall a clearing keeps across it
const CLEAR_SLACK = 0.25;      // ...and how much is kept in hand under the lowest of them
const CLEAR_LIFT = 0.18;       // how far a clearing sits above the land it is cut into
const CLEAR_CLEARANCE = 1.2;   // ...and how far it always stands above the week's sea level
const CLEAR_LIP = 0.35;        // the chalk lip where the level meets the fields
const CLEAR_LIP_W = 0.35;      // ...over this fraction of the oval's radius
const CLEAR_SKIRT = 1.6;       // how much of the fall the blend back to the pasture takes
const CLEAR_SKIRT_MIN = 2.4;
const CLEAR_SKIRT_MAX = 12;

// A village: the place the week's games were played in, drawn at the clearing
// the pitch stands on. A commons with a pitch and no houses round it is a field
// with a rectangle in it; what makes the landscape lived-in from the air is the
// knot of small ground at the edge of the big fields — a green, a lane worn
// through it, gardens cut to their own levels with walls between them, and the
// houses themselves, one of them the church. All of it is ground: the houses are
// blocks on the hillside, which is what a house is when the world is a height
// field, and at the poster's distance the knot reads the way a village reads
// from a plane — a speck of fine, broken ground among the great flat fields,
// which is the one thing a hedgerow landscape never has anywhere else.
const VILLAGE_OFF = 58;        // how far the village stands from the clearing's own centre, u
const VILLAGE_R = 34;          // the run of its own footprint, u
const VILLAGE_PLOT = 14;       // the tread of its gardens, u
const VILLAGE_PLOT_H = 1.8;    // how far one garden sits above its neighbour
const VILLAGE_WALL = 1.5;      // the wall between two gardens: how tall, and...
const VILLAGE_WALL_W = 2.0;    // ...how wide: a fold the ink hand can find, like the hedges
const VILLAGE_GREEN = 14;      // the green's own radius, u
const VILLAGE_HOUSE_MIN = 7, VILLAGE_HOUSE_MAX = 11;
const VILLAGE_HOUSE_H = 4.2;   // how tall a house stands, u: over the survey's own
                               // step, so a cluster of them is a mass and not a mottle
const VILLAGE_HOUSE_HW = 4.6;  // half the long side of a house's own footprint, u
const VILLAGE_HOUSE_RATIO = 0.68;
const VILLAGE_CHURCH_H = 8.0;  // the church's own height, u
const VILLAGE_LANE = 3.4;      // half the lane's own width, u
const VILLAGE_LANE_SINK = 1.0; // how far the lane is worn below its gardens

// The commons' sea: three quarters of the area the week's sweat asked for, and
// never the whole globe — a commons has a coast, not an ocean.
const SEA_KEEP = 0.74;
const SEA_MIN = 0.13;
const SEA_MAX = 0.52;

// The week's own landforms, drawn into the pasture: a run's ridge is a long low
// bank across the commons and a ride's valley is a shallow one, so the world
// keeps the week's reading (the route is still a ridge you can walk along) at
// pasture scale instead of standing a massif in the middle of a village. A week
// with a race keeps its courses whole: the ridge is the race's own monument,
// and a world may not sand it down.
const ROUTE_KEEP = 0.45;

// The poster's own limb: no massif, so the globe's silhouette is held well
// under the default cap. It has to clear the world's own tallest ground all the
// same — base.js cuts the mesh flat at this number (R + min(h, cap)), and the
// hedgerows now stand five and a half units over plots that already sit four
// above their neighbours, so the tallest ground a commons week draws is twelve
// or so above the sea. Under that the bank crests of the highest fields came out
// as flat-topped flaps on the limb, which is a worse failure than a slightly
// more relieved silhouette.
const ORBIT_CAP = 13.5;

// The week's ocean fraction, read the way readWeek reads it but with the
// commons' own keep. The climate hook is this function of the week's own
// fraction, and the clearings read it too, so the level a clearing is cut at is
// above the water the same week will be flooded to.
const oceanOf = (frac) => clamp(frac * SEA_KEEP, SEA_MIN, SEA_MAX);

/* ---- the ground, evaluated ------------------------------------------------ */

// One hash of a lattice cell, mixed enough that neighbouring cells are not
// related: four bytes of it are the site's own jitter, its plot's level and the
// height of the hedge that field grows.
function cellHash(i, j, k) {
  let n = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 1274126177);
  n = Math.imul(n ^ (n >>> 15), 2246822519);
  n = Math.imul(n ^ (n >>> 13), 3266489917);
  return (n ^ (n >>> 16)) >>> 0;
}

// The two nearest field sites, their plots' levels, and how far this vertex is
// from the boundary between them — all in module-level slots: this runs for
// every vertex of a 163 842-vertex mesh and never allocates.
let fieldEdgeU = 0, fieldNearLevel = 0, fieldFarLevel = 0, fieldTall = 1;

function fieldsAt(x, y, z, s) {
  const t = s.turn;
  // the week's own bearing for the lattice (see build), so the same countryside
  // gives each week its own fields
  const w0 = t[0] * x + t[1] * y + t[2] * z;
  const w1 = t[3] * x + t[4] * y + t[5] * z;
  const w2 = t[6] * x + t[7] * y + t[8] * z;
  const px = w0 * FIELD_SCALE, py = w1 * FIELD_SCALE, pz = w2 * FIELD_SCALE;
  const ci = Math.floor(px), cj = Math.floor(py), ck = Math.floor(pz);
  let best = Infinity, second = Infinity, bHash = 0, sHash = 0;
  for (let i = ci - 1; i <= ci + 1; i++) {
    const jx = (i + 0.5) - px;
    for (let j = cj - 1; j <= cj + 1; j++) {
      const jy = (j + 0.5) - py;
      const flat = jx * jx + jy * jy;
      for (let k = ck - 1; k <= ck + 1; k++) {
        const jz = (k + 0.5) - pz;
        const coarse = flat + jz * jz;
        // A site may sit up to 0.8 of a cell from its centre (the jitter's own
        // reach), so a cell whose centre is more than four — twice that reach
        // plus a whole unit of slack — beyond the second-best distance cannot
        // hold either of the two nearest sites, and its hash is not computed.
        if (coarse > second + 4) continue;
        const h = cellHash(i, j, k);
        const sx = i + 0.5 + ((h & 255) / 255 - 0.5) * FIELD_JITTER;
        const sy = j + 0.5 + (((h >>> 8) & 255) / 255 - 0.5) * FIELD_JITTER;
        const sz = k + 0.5 + (((h >>> 16) & 255) / 255 - 0.5) * FIELD_JITTER;
        const dx = sx - px, dy = sy - py, dz = sz - pz;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < best) { second = best; sHash = bHash; best = d; bHash = h; }
        else if (d < second) { second = d; sHash = h; }
      }
    }
  }
  // the boundary runs where the two sites are equally far: the distance to it
  // is the difference of the distances, halved
  const root = Math.sqrt(best) || 1e-4;
  fieldEdgeU = ((second - best) / (4 * root)) * FIELD_U;
  fieldNearLevel = (((bHash >>> 24) & 255) / 255 - 0.5) * 2 * PLOT_LEVEL;
  fieldFarLevel = (((sHash >>> 24) & 255) / 255 - 0.5) * 2 * PLOT_LEVEL;
  // a hedge grown taller where it was laid thicker, from the two fields' hashes
  fieldTall = 0.6 + 0.7 * ((((bHash ^ sHash) >>> 5) & 255) / 255);
}

/** The pasture's own ground, with no fields in it: the week's continent drawn
 *  down, its fine relief softened, over the commons' long swell. A clearing is
 *  levelled to this, so the pan follows the land instead of standing on it. */
function rollingAt(x, y, z, dir, ctx) {
  const nz = ctx.nz;
  const cont = ctx.macro(dir);
  let h = cont * lerp(GROUND_HIGH, GROUND_LOW, smoothstep(0, -GROUND_LOW_OVER, cont));
  h += (ctx.fbm(nz, x * FINE_FREQ, y * FINE_FREQ, z * FINE_FREQ, FINE_OCT) * 2 - 1) * FINE_K;
  h += (ctx.fbm(nz, x * ROLL_FREQ, y * ROLL_FREQ, z * ROLL_FREQ, ROLL_OCT) * 2 - 1) * ROLL_AMP;
  h += (ctx.fbm(nz, x * RISE_FREQ, y * RISE_FREQ, z * RISE_FREQ, RISE_OCT) * 2 - 1) * RISE_AMP;
  return h;
}

/** The undecorated ground at a direction: the pasture, taken into plots, then
 *  quantised into pasture shelves and hedged along the plot boundaries. No
 *  clearing — `shape` lays those in last, after the routes and the lagoons, so
 *  a clearing is level whatever was drawn under it. */
function groundAt(x, y, z, dir, ctx, s) {
  let h = rollingAt(x, y, z, dir, ctx);
  fieldsAt(x, y, z, s);

  // ---- the plots: each field sits a little above or below its neighbours, and
  // the ground is taken up across the hedge between them. Both sides of a
  // boundary meet at the two plots' mean level, so the step is shared out into
  // two low lynchets — a field's own rise, read across the hedge.
  //
  // Fields belong to the land. Everything here is taken out below the week's
  // waterline (a hedge bank drawn on under a shallow bay shows through as a
  // pale arc across the sea, which is not a field), and the patchwork also
  // eases off up the downs, which are open pasture.
  const above = h - s.sea;
  const land = smoothstep(1, 4, above);
  const lowland = land * (1 - smoothstep(PLOT_FADE_LO, PLOT_FADE_HI, above));
  if (lowland > 0.002) {
    const mid = (fieldNearLevel + fieldFarLevel) * 0.5;
    const own = mid + (fieldNearLevel - mid) * smoothstep(0, PLOT_BAND, fieldEdgeU);
    h += own * lowland;
  }

  // ---- the shelves: one after another, the low commons nearly level and the
  // ground up toward the downs stepped.
  const amount = lerp(TERRACE_LOW, TERRACE_HIGH, clamp(h / TERRACE_RANGE, 0, 1)) * (0.3 + 0.7 * land);
  if (amount > 0.001) {
    const u = h / TERRACE_STEP;
    const level = Math.floor(u);
    const f = u - level;
    const riser = f < 1 - TERRACE_SOFT ? 0 : smoothstep(0, 1, (f - (1 - TERRACE_SOFT)) / TERRACE_SOFT);
    h += ((level + riser) * TERRACE_STEP - h) * amount;
  }

  // ---- the hedgerow: a bank on the boundary, off the waterline too, tallest
  // where the fields are — the lowland — and shorter on the open downs. The
  // wander is a low fbm, read only by the vertices near a boundary, so the line
  // is not a ruled edge.
  if (fieldEdgeU < HEDGE_GATE) {
    const nz = ctx.nz;
    const wob = (ctx.fbm(nz, x * HEDGE_WANDER_FREQ, y * HEDGE_WANDER_FREQ, z * HEDGE_WANDER_FREQ, HEDGE_WANDER_OCT) * 2 - 1)
      * HEDGE_WOBBLE;
    const e = (fieldEdgeU + wob) / HEDGE_HW;
    const q = 1 - e * e;
    if (q > 0) {
      const on = smoothstep(0.5, 2.5, above) * (0.45 + 0.55 * (1 - smoothstep(PLOT_FADE_LO, PLOT_FADE_HI, above)));
      h += HEDGE_H * q * fieldTall * on;
    }
  }
  return h;
}

/** The drawn ground: the pasture, then every clearing laid into it. */
function surfaceAt(x, y, z, dir, ctx, s, h) {
  const pitches = s.pitches;
  if (!pitches.length) return h;
  const R = ctx.R;
  for (let i = 0; i < pitches.length; i++) {
    const p = pitches[i];
    const dz = x * p.x + y * p.y + z * p.z;
    if (dz < p.gate) continue;
    // the oval's own axes: how far out along its long and short half, in units
    const along = (x * p.ex + y * p.ey + z * p.ez) * R;
    const across = (x * p.nx + y * p.ny + z * p.nz) * R;
    const e = Math.sqrt(along * along * p.invLong + across * across * p.invShort);
    if (e > p.outer) continue;
    const k = 1 - smoothstep(1, p.outer, e);
    const level = p.ref + (rollingAt(x, y, z, dir, ctx) - p.ref) * CLEAR_TILT + p.lift;
    h = lerp(h, level, k);
    // the lip: a low chalk bank just outside the level, the clearing's own line
    if (e > 1) {
      const lip = 1 - (e - 1) / CLEAR_LIP_W;
      if (lip > 0) h += CLEAR_LIP * lip * k;
    }
  }
  // the villages last, and only where no clearing has flattened the ground: a
  // pitch stands in the village's field, never the other way about
  for (let i = 0; i < pitches.length; i++) {
    const p = pitches[i];
    if (!p.village) continue;
    if (x * p.x + y * p.y + z * p.z < p.vgate) continue;
    const along = (x * p.ex + y * p.ey + z * p.ez) * R;
    const across = (x * p.nx + y * p.ny + z * p.nz) * R;
    const e = Math.sqrt(along * along * p.invLong + across * across * p.invShort);
    if (e < p.outer) continue;        // the clearing owns this ground
    h = villageAt(x, y, z, dir, ctx, p, h);
  }
  return h;
}

/**
 * The village at a clearing: its gardens cut into their own levels with a wall
 * between each pair, its green levelled, its lane worn through both, and its
 * houses standing on the ground the lane runs between. Read only where the
 * village is — a gated dot product and one noise field first, then a hash a
 * vertex — so the whole of the rest of the globe pays almost nothing for it.
 */
function villageAt(x, y, z, dir, ctx, p, h) {
  const v = p.village;
  const R = ctx.R, nz = ctx.nz;
  // the village's own frame: u along its lane's bearing, t across it
  const u = (x * v.ex + y * v.ey + z * v.ez) * R;
  const t = (x * v.nx + y * v.ny + z * v.nz) * R;
  const r = Math.hypot(u, t);
  if (r > VILLAGE_R) return h;
  const inward = 1 - smoothstep(VILLAGE_R * 0.72, VILLAGE_R, r);
  // the ground the village stands on: the clearing's own pan, carried on to here
  const base = p.ref + (rollingAt(x, y, z, dir, ctx) - p.ref) * CLEAR_TILT + p.lift + 0.1;
  // its gardens: a lattice in the village's own frame, warped off the square, so
  // every garden is a different size and no two walls run parallel for long
  const wu = 3.2 * (nz(u * 0.085 + 11.2, t * 0.085 - 3.4, 5.5) * 2 - 1);
  const wt = 3.2 * (nz(u * 0.085 - 7.7, t * 0.085 + 2.1, 9.9) * 2 - 1);
  const gu = (u + wu) / VILLAGE_PLOT, gt = (t + wt) / VILLAGE_PLOT;
  const ci = Math.floor(gu), cj = Math.floor(gt);
  const hsh = cellHash(ci, cj, v.seed);
  const own = ((((hsh & 255) / 255) - 0.5) * 2) * VILLAGE_PLOT_H;
  // the wall round the garden this vertex is in: how far to the nearest wall
  const du = 0.5 - Math.abs(gu - ci - 0.5);
  const dt = 0.5 - Math.abs(gt - cj - 0.5);
  const wall = Math.max(0, Math.min(du, dt) * 2 * VILLAGE_PLOT / VILLAGE_WALL_W);
  let g = base + own;
  if (wall < 1) g += VILLAGE_WALL * (1 - wall) * (0.5 + 0.5 * ((hsh >>> 12) & 1));
  // the green: the one piece of level ground the village keeps open
  const green = r < VILLAGE_GREEN ? 1 - smoothstep(VILLAGE_GREEN * 0.6, VILLAGE_GREEN, r) : 0;
  if (green > 0) g = lerp(g, base + 0.2, green);
  // the lane: worn through the gardens, and the way the houses stand along
  const laneAt = 3.4 * Math.sin(u * 0.055) + 0.06 * u;
  const offLane = Math.abs(t - laneAt);
  if (offLane < VILLAGE_LANE + 2.6) {
    const k = 1 - smoothstep(VILLAGE_LANE, VILLAGE_LANE + 2.6, offLane);
    g = lerp(g, base + 0.15 - VILLAGE_LANE_SINK, k);
  }
  h += (g - h) * inward;
  // the houses: blocks with their own walls, the church the tallest of them
  const houses = v.houses;
  for (let i = 0; i < houses.length; i += 5) {
    const hu = u - houses[i], ht = t - houses[i + 1];
    const q = Math.max(Math.abs(hu) / houses[i + 2], Math.abs(ht) / houses[i + 3]);
    if (q >= 1) continue;
    const top = base + houses[i + 4];
    const k = 1 - smoothstep(0.72, 1, q);
    const block = top * k + h * (1 - k);
    if (block > h) h += (block - h) * inward;
  }
  return h;
}

/* ---- the week's layout, built once ---------------------------------------- */

// One slot: the hooks are handed the same ctx for a whole reading (baseline and
// shape, and every probe after them), so the second call does nothing. A new
// week — a new ctx — builds again.
let cached = null;
let cachedCtx = null;

function commonsOf(ctx) {
  if (cachedCtx === ctx) return cached;
  cached = build(ctx);
  cachedCtx = ctx;
  return cached;
}

function build(ctx) {
  const P = ctx.P || {};
  const stats = ctx.stats || {};
  const number = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  // The fields are the same countryside from week to week — a village keeps its
  // hedges — but each week turns the lattice to its own bearing, so two commons
  // weeks are two valleys of the same country rather than the same photograph.
  const rng = ctx.rng('commons/fields');
  const rx = rng() * 2 - 1, ry = rng() * 2 - 1, rz = rng() * 2 - 1;
  const rlen = Math.hypot(rx, ry, rz) || 1;
  const kx = rx / rlen, ky = ry / rlen, kz = rz / rlen;
  const ang = rng() * Math.PI * 2, ca = Math.cos(ang), sa = Math.sin(ang), ic = 1 - ca;
  const turn = [
    ca + kx * kx * ic, kx * ky * ic - kz * sa, kx * kz * ic + ky * sa,
    ky * kx * ic + kz * sa, ca + ky * ky * ic, ky * kz * ic - kx * sa,
    kz * kx * ic - ky * sa, kz * ky * ic + kx * sa, ca + kz * kz * ic,
  ];

  const s = { turn, pitches: [], sea: 0, lastX: NaN, lastY: NaN, lastZ: NaN, lastGround: 0 };
  // A week with a race keeps every landform the week drew: its course is the
  // week's monument and its ridge is the thing the week is (see ROUTE_KEEP).
  s.raced = (ctx.routes || []).some((route) => route.race);
  const dir = { x: 0, y: 0, z: 0 };

  // The week's water line, read before readWeek fixes it: the same quantile,
  // over this world's own ground, with a margin for the routes and lagoons the
  // real sea is measured among. A clearing is cut above this, not above the sea
  // it can only learn later.
  const seaFrac = oceanOf(clamp(
    number(P['climate.oceanAnchorFrac'], 0.475) * Math.sqrt(Math.max(0, number(stats.sweatL, 0)) / number(P['climate.oceanAnchorL'], 6.302)),
    number(P['climate.oceanMin'], 0.2), number(P['climate.oceanMax'], 0.7),
  ));
  const N = 512;
  const ga = Math.PI * (3 - Math.sqrt(5)); // the Fibonacci spiral the samples walk
  const heights = new Float64Array(N);
  const water = () => {
    for (let i = 0; i < N; i++) {
      const y = 1 - (2 * i + 1) / N;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const th = ga * i;
      dir.x = Math.cos(th) * r;
      dir.y = y;
      dir.z = Math.sin(th) * r;
      heights[i] = surfaceAt(dir.x, dir.y, dir.z, dir, ctx, s, groundAt(dir.x, dir.y, dir.z, dir, ctx, s));
    }
    heights.sort();
    return heights[clamp(Math.floor((seaFrac + 0.05) * N), 0, N - 1)];
  };
  s.sea = water();

  // ---- the clearings: one for every football session, at the site the week
  // placed it on. `kind` is written back before the terrain is sampled, so a
  // pitch landmark's own kind is honoured as well as the sport's name.
  // a single throw for every village on the globe: each clearing draws its own
  // bearing and its own houses from the same stream, so no two villages sit the
  // same way round their pitch
  const vrng = ctx.rng('commons/village');
  for (const place of ctx.placed || []) {
    if (place.kind !== 'pitch' && !isFootball(place.a)) continue;
    const site = place.dir;
    // an oval's own frame: east and north on the sphere at the site
    const refX = Math.abs(site.y) > 0.9 ? 1 : 0, refY = refX ? 0 : 1;
    const cx = site.y * 0 - site.z * refY, cy = site.z * refX - site.x * 0, cz = site.x * refY - site.y * refX;
    const clen = Math.hypot(cx, cy, cz) || 1;
    const ex = cx / clen, ey = cy / clen, ez = cz / clen;
    const ax = site.y * ez - site.z * ey, ay = site.z * ex - site.x * ez, az = site.x * ey - site.y * ex;

    // The level reads the land's own swell around the clearing, not only under
    // it: the lowest of the rim decides how far the pan is lifted, so no part of
    // the clearing — and nothing the pitch landmark stands on — can end up under
    // the week's water.
    dir.x = site.x; dir.y = site.y; dir.z = site.z;
    const ref = rollingAt(site.x, site.y, site.z, dir, ctx);
    let lowest = ref;
    for (let i = 0; i < CLEAR_RING; i++) {
      const th = (i / CLEAR_RING) * TAU;
      const along = Math.cos(th) * CLEAR_LONG;
      const across = Math.sin(th) * CLEAR_SHORT;
      const px = site.x + (ex * along + ax * across) / ctx.R;
      const py = site.y + (ey * along + ay * across) / ctx.R;
      const pz = site.z + (ez * along + az * across) / ctx.R;
      const plen = Math.hypot(px, py, pz) || 1;
      dir.x = px / plen; dir.y = py / plen; dir.z = pz / plen;
      lowest = Math.min(lowest, rollingAt(dir.x, dir.y, dir.z, dir, ctx));
    }
    // The pan keeps only a fifth of the fall the land had across it, so its
    // lowest point is the rim's lowest read about the site's own ground — and
    // that, not the site alone, is what has to stand above the week's water.
    const panLow = ref + (lowest - ref) * CLEAR_TILT;
    const lift = Math.max(CLEAR_LIFT, s.sea + CLEAR_CLEARANCE + CLEAR_SLACK - panLow);
    const cut = Math.max(lift, (1 - CLEAR_TILT) * Math.abs(lowest - ref));
    const skirt = clamp(CLEAR_SKIRT * cut, CLEAR_SKIRT_MIN, CLEAR_SKIRT_MAX);
    const outer = 1 + skirt / CLEAR_LONG;
    // the village: one to a clearing, standing off the pitch's far side so the
    // games are played on the village's own field, with the lane running from the
    // green to the pitch's gate
    const bearing = vrng() * TAU;
    const vcu = Math.cos(bearing), vcv = Math.sin(bearing);
    // the offset's own bearing, in the site's tangent plane (east and north at
    // the site are the clearing's own frame: ex..ez and ax..az)
    let ox = ex * vcu + ax * vcv, oy = ey * vcu + ay * vcv, oz = ez * vcu + az * vcv;
    const ol = Math.hypot(ox, oy, oz) || 1;
    ox /= ol; oy /= ol; oz /= ol;
    const vdir = {
      x: site.x * Math.cos(VILLAGE_OFF / ctx.R) + ox * Math.sin(VILLAGE_OFF / ctx.R),
      y: site.y * Math.cos(VILLAGE_OFF / ctx.R) + oy * Math.sin(VILLAGE_OFF / ctx.R),
      z: site.z * Math.cos(VILLAGE_OFF / ctx.R) + oz * Math.sin(VILLAGE_OFF / ctx.R),
    };
    const vl = Math.hypot(vdir.x, vdir.y, vdir.z) || 1;
    vdir.x /= vl; vdir.y /= vl; vdir.z /= vl;
    // The village's own frame at its centre: `e` the lane's own bearing, `n`
    // across it. The lane runs back toward the pitch's gate — a lane is the way
    // from the houses to the field — so `e` is the offset direction flattened
    // into the village's own tangent plane.
    const od = ox * vdir.x + oy * vdir.y + oz * vdir.z;
    let eux = ox - vdir.x * od, euy = oy - vdir.y * od, euz = oz - vdir.z * od;
    const eul = Math.hypot(eux, euy, euz) || 1;
    eux /= eul; euy /= eul; euz /= eul;
    const enx = vdir.y * euz - vdir.z * euy, eny = vdir.z * eux - vdir.x * euz, enz = vdir.x * euy - vdir.y * eux;
    const houses = [];
    const count = VILLAGE_HOUSE_MIN + Math.round(vrng() * (VILLAGE_HOUSE_MAX - VILLAGE_HOUSE_MIN));
    for (let q = 0; q < count; q++) {
      // the houses stand along the lane, alternate sides, their own throw on
      // where they sit: a village is a line of houses and not a scatter of them
      const hu = (q / (count - 1) - 0.5) * VILLAGE_R * 1.25 + (vrng() - 0.5) * 3.4;
      const side = q % 2 ? 1 : -1;
      const ht = side * (6.4 + 2.6 * vrng()) + 3.4 * Math.sin(hu * 0.055) + 0.06 * hu;
      const hl = VILLAGE_HOUSE_HW * (0.82 + 0.5 * vrng());
      const hw = hl * VILLAGE_HOUSE_RATIO * (0.85 + 0.3 * vrng());
      const top = (q === Math.floor(count * 0.5) ? VILLAGE_CHURCH_H : VILLAGE_HOUSE_H) * (0.85 + 0.3 * vrng());
      houses.push(hu, ht, hl, hw, top);
    }
    s.pitches.push({
      x: site.x, y: site.y, z: site.z,
      ex, ey, ez, nx: ax, ny: ay, nz: az,
      ref, lift, outer,
      invLong: 1 / (CLEAR_LONG * CLEAR_LONG),
      invShort: 1 / (CLEAR_SHORT * CLEAR_SHORT),
      gate: Math.cos(Math.min(Math.PI, outer * CLEAR_LONG / ctx.R * 1.1)),
      vgate: Math.cos(Math.min(1.5, (VILLAGE_OFF + VILLAGE_R + 12) / ctx.R)),
      village: {
        x: vdir.x, y: vdir.y, z: vdir.z,
        ex: eux, ey: euy, ez: euz,
        nx: enx, ny: eny, nz: enz,
        seed: (cellHash(Math.round(vdir.x * 8191), Math.round(vdir.y * 8191), Math.round(vdir.z * 8191)) & 1023) + 1,
        houses,
      },
    });
  }
  if (s.pitches.length) {
    // the clearings are part of the ground the sea is measured among: read the
    // water line again with them in place, and lift any that the second reading
    // left within a metre of it
    const again = water();
    if (again > s.sea) {
      const rise = again - s.sea;
      s.sea = again;
      for (const p of s.pitches) p.lift += rise;
    }
  }
  return s;
}

/* ---- the world ------------------------------------------------------------ */

// The village palette: the last weeks of summer read from above. The pasture is
// sage and hay, the mown fields are straw, the corn is gold, the chalk shows on
// the dry crests and along every wall, and the sea is a warm slate — a village
// green drawn in a pale tint is a grey field, and a late-summer one drawn in
// spring's green is the wrong August entirely. The light that falls on it stays
// warm, so the sunlit ground is straw and the shade under it is slate.
const VILLAGE = {
  ink: 0x222b22, inkSoft: 0x3e4a36, sepia: 0x6d5636,
  litWarm: 0xf0cf88, landLow: 0xd8b862, landMid: 0x8a9a4c, landHigh: 0x62703c,
  shadeCool: 0x44523c, crest: 0xf3ead0, dry: 0xe8d69c, veg: 0xc9a848, bare: 0xb0763a,
  dark: 0x232d24, stone: 0xbdb49a, wood: 0x6b5738, farGlaze: 0xafb98a,
  seaShallow: 0x6f9a94, seaDeep: 0x2f5a5c, cobalt: 0x3a6b66, teal: 0x5f8f85, foam: 0xeae4cd,
  skyHigh: 0x8a9c9a, skyLow: 0xe4dcc0, skyBand: 0xefe6c8, skyWash: 0xbcc3ab,
  skyDeep: 0x788c88, cloudUnder: 0xcdcbb2, shelf: 0x8fa898, paperWet: 0xd9d5b8,
};
// ...and the two ends of its week-to-week range: a warm commons is straw-lit,
// a wet one's pasture is the deeper green
const VILLAGE_LIGHT = 0xf0dda0;
const VILLAGE_DEEP = 0x5a7a38;
const VILLAGE_WATER = 0x2c4a4c;

export default {
  id: 'commons',
  label: 'Commons',
  blurb: 'A football week as one village green: broad hedged pasture, terraced slopes, and a level clearing where the week was played.',
  orbit: { reliefCap: ORBIT_CAP },

  /** The share of the week that was football, on a week that was not a rest. */
  fit(stats) {
    const share = Number(stats?.football) || 0;
    if (!(share >= FOOTBALL_GATE)) return 0;
    if ((Number(stats?.hours) || 0) < REST_HOURS) return 0;
    if ((Number(stats?.count) || 0) <= REST_SESSIONS) return 0;
    // the further past the gate the week is, the more surely it is this world
    return clamp(0.56 + (share - FOOTBALL_GATE) * 1.15, 0, 0.93);
  },

  reason(stats) {
    const share = Number(stats?.football) || 0;
    return `${Math.round(share * 100)}% of the week on the pitch → commons and hedged pasture`;
  },

  /** The sea drawn back to its slate edges: a commons week is mostly land, and
   *  its air is late-summer air — a warm week's warmth, lifted, so the caps dial
   *  leaves the poles alone and the snow line stands over the downs instead of
   *  through them. A snow-capped hedge in August would be the one thing on the
   *  globe that is not this world. */
  climate(c) {
    c.oceanFrac = oceanOf(Number.isFinite(c.oceanFrac) ? c.oceanFrac : SEA_MAX);
    const warm = Number.isFinite(c.warmth) ? c.warmth : 0.5;
    c.warmth = clamp(warm * 0.78 + 0.2, 0, 0.95);
    return c;
  },

  /** The pasture: the week's own continent, low, over shelves and hedges. */
  baseline(dir, ctx) {
    const s = commonsOf(ctx);
    const h = groundAt(dir.x, dir.y, dir.z, dir, ctx, s);
    // `shape` is handed this same direction a moment later (see readWeek's
    // sample): keep the ground, so the week's landforms can be drawn down to
    // pasture scale without walking the fields twice.
    s.lastX = dir.x; s.lastY = dir.y; s.lastZ = dir.z; s.lastGround = h;
    return h;
  },

  /** The week's landforms drawn down to pasture scale, then the clearings. */
  shape(dir, h, ctx) {
    const s = commonsOf(ctx);
    const g = (dir.x === s.lastX && dir.y === s.lastY && dir.z === s.lastZ)
      ? s.lastGround
      : groundAt(dir.x, dir.y, dir.z, dir, ctx, s);
    const over = h - g;
    let out = h;
    // A carve is left alone: it is the week's own water and the shore a lagoon
    // finds (readWeek measures the drawn floor), and a valley is a dale in a
    // commons, not a massif.
    if (!s.raced && over > 0) out = g + over * ROUTE_KEEP;
    if (!s.pitches.length) return out;
    return surfaceAt(dir.x, dir.y, dir.z, dir, ctx, s, out);
  },

  /** Village green. */
  palette(pal, features) {
    const stats = features?.stats || {};
    const sweat = Math.max(0, Number(stats.sweatL) || 0);
    const wet = clamp(sweat / 9, 0, 1);
    const warmth = clamp(Number(features?.warmth) || 0.5, 0, 1);
    for (const key of Object.keys(VILLAGE)) {
      const colour = pal[key];
      if (colour && typeof colour.setHex === 'function') colour.setHex(VILLAGE[key]);
    }
    // the week still shows in the light and in the water: a warm commons is a
    // straw-lit one, and a wet week's pasture is its deeper green. `foam` is
    // chalk and is set from the table again at the end of this, so it can serve
    // as the mixing colour without a colour of its own.
    if (pal.litWarm && pal.foam) {
      pal.foam.setHex(VILLAGE_LIGHT);
      pal.litWarm.lerp(pal.foam, 0.45 * warmth);
      pal.foam.setHex(VILLAGE_DEEP);
      if (pal.veg) pal.veg.lerp(pal.foam, 0.55 * wet);
      if (pal.landLow) pal.landLow.lerp(pal.foam, 0.35 * wet);
      pal.foam.setHex(VILLAGE_WATER);
      if (pal.seaDeep) pal.seaDeep.lerp(pal.foam, 0.5 * wet);
      pal.foam.setHex(VILLAGE.foam);
    }
    // the fields are always up on a commons, whatever the week's volume, and
    // the coast is a clean one: its shelf is a flat wash of the shallows
    pal.vegAmt = clamp(0.5 + 0.45 * (Number(pal.vegAmt) || 0), 0.35, 1);
    pal.damp = clamp((Number(pal.damp) || 0) * 0.35, 0, 0.45);
    return pal;
  },
};

/* Planet Creator — the tundra world.
 *
 * A winter week that never climbed and never went outdoors is drawn as a sheet
 * of ice: a cap a few units proud of the water, crested over the week's own pole
 * of training, grooved by the streams and the crevasse fields that carry its ice
 * down the fall line to the margin, its rim a hard broken edge, bays of ground
 * and water bitten into it where the week trained, and dark rock standing
 * through it where the week's own days were.
 *
 * The sheet is read from the week, never from a dial, because a sheet that reads
 * the same in November and in February is wallpaper:
 *
 *   - the rim's reach is the week's load, and the cap is carried onto the bearing
 *     of the week's own days — the bearing, not how tightly they gathered — so
 *     the ice gathers over the side the week trained on and the sheet lies
 *     somewhere else on every poster. Its outline is the week's own noise, so no
 *     two weeks break along the same line.
 *   - the sheet's own form is a crest: the ice is thickest over that pole and
 *     thins down the fall line to the rim, and how thick it stands wanders on the
 *     sheet's own roll, so the crest is a range of ice and not a dome, and its
 *     washes break into reaches instead of ringing the cap.
 *   - the ice streams are the week's own days read as flow: one or two troughs
 *     cut from the crest down to the bay that session trained in. The crevasse
 *     fields are belts of stepped ice running the same way, turned off the fall
 *     line so they cross it. Both are cut for the step the washes are read at
 *     (see the FLOW_ dials below), so they are drawn on the poster and not only
 *     in the file.
 *   - the bays are the day-mass field, given a bay's own anatomy: dry broken
 *     ground at each site — where that session's landmark stands — falling away
 *     to water at the mouth, with the ice front for walls.
 *   - the nunataks are the week's sessions again: rock thrown up inland of each
 *     site, dark and steep, breaking out through the ice — a bigger island the
 *     longer that session was (see NUN_HOURS).
 *
 * The trigger is the whole claim: nothing climbed, and (nearly) every hour under
 * a roof. What is left of that winter belongs to another world — a week under
 * 2.6 h is the moon's rest week and a football-dominant week is the commons' —
 * so this world returns 0 for both and never takes a week by accident.
 *
 * Everything the hooks touch is built once per reading (stateOf) and read per
 * vertex without allocating; the sea-band early-out keeps the open water down to
 * a couple of noise fields.
 */
const STATES = new WeakMap();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mix = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* ------------------------------------------------------------- the dials --- */
/* World units on R = 120: the sheet's rim stands ~9 u proud of the sphere and
 * the sea floor sits ~5 u under it, so the rim is a cliff a tenth of the radius
 * tall, and a bay is a scoop of that order cut into the ice.
 *
 * Two numbers decide everything drawn below. From orbit the washes are read off
 * a two-point step of su = 2.4 + 0.06·dist world units (ink.js, TERRAIN_FRAG):
 * 23-34 u on these posters, a little more the further the frame is pulled back.
 * So a form is only on the poster if it holds its slope across some sixty units
 * — and a train of grooves is only there if its step is spaced so the two taps
 * land either side of it (a groove a step apart is averaged away to a flat wash,
 * which is why a seventy-unit spacing left the sheet a blank leaf). Both are cut
 * for that reading, not for the mesh: underfoot the same ice is read at 2.4 u,
 * where the fine grain below still draws. */

const SHEET_TOP = 11.0;      // the sheet's mean height at its rim: nearly its whole height,
                             // so the cap's outline stays round and the rim's cliff stays even.
                             // A sheet is thick: at six and a half units the ice was a shell
                             // over the sea, and the survey read one pale slab across it —
                             // the height, not the drawing, is what the washes have to find.
const SHEET_MACRO = 0.35;    // how much of the week's own continental term it carries
// fbm() is a normalised average, so its real spread is a third of its range:
// the amplitudes below are chosen for the grade they leave at the scale the
// washes are read on (45 u), not for their nominal numbers.
const SHEET_DOME = 7.0;      // the sheet's own roll: the reaches that cross the ice, so
                             // the light finds a form on it in every week. This was
                             // thirteen, and read against the *centred* crest below it
                             // the two domes fought: the fbm roll carried the ice into
                             // lobes of its own that stood outside the cap's own
                             // contour, and the sheet read as stacked blobs with a
                             // blunt overhang on the limb. Seven leaves the ice one
                             // dome — the crest, read off the cap's own axis — with the
                             // roll's reaches on it, which is what a sheet is.
const SHEET_DOME_FREQ = 0.95;//   (~125 u across: a lit face and a shaded one)
const SHEET_SWELL = 2.6;     // the swell that crosses the dome
const SHEET_FREQ = 2.4;
const SHEET_CREST = 7.0;     // the crest: how much thicker the ice stands over the
                             // week's own pole of training than at its rim
const CREST_POW = 2.5;       // how long the crest's own top holds before it breaks away:
                             // ^2.5 keeps the middle a level field of ice and puts the
                             // fall where the margin is, so the sheet is read as a plain
                             // and a shoulder rather than as a bell
const CREST_WANDER = 0.72;   // how much of the crest's height the week's own roll takes
                             // back: a crest that holds its height all the way round is a
                             // dome, and a dome's slope rings the cap with one wash

// The sheet's grain, in world units: trains of strokes laid along one direction
// and spaced this far apart. Ridged noise would have been the obvious way to
// draw them, and it is wrong here: a ridged field's crests wind round their own
// maxima and close into rings, and a ring of ice ridge on a sheet of ice reads as
// a donut. A warped train comes and goes instead — a stroke, not a ring — which
// is also how the week's own noise would break the ice. The groove train is the
// sheet's own grain, read all over it; the ridge is the broad roll it was laid
// over and the drift is the fine relief it keeps underfoot.
const GROOVE_SPACING = 118, RIDGE_SPACING = 150, DRIFT_SPACING = 30;
const TRAIN_WARP = 1.2;      // the week's noise wander, in radians of phase (~20 u)
const TRAIN_LO = 0.30, TRAIN_HI = 0.42;   // where the week's own field lets a train run
const TRAIN_FLOOR = 0.45;    // ...and how much of a train runs everywhere: a train that
                             // fades to nothing over half the globe leaves that half of
                             // the week's sheet a blank leaf, which is the one thing this
                             // world's ice cannot be. The floor keeps the grain, the
                             // field keeps it from being the same ruled pattern twice
const TRAIN_FADE_FREQ = 1.5; // how long a train's own reach is (~75 u)

// The rim's own latitude, read from the cap's axis: the week's load is how far
// the ice reaches. The range is cut so a heavy week's disc is nearly all sheet
// with water at its rim, and a light week's is an island of ice in a dark sea —
// the same world, and never the same poster twice.
const EDGE_EASY = 0.62;      // the rim's cos-latitude on the lightest week
const EDGE_HEAVY = 0.26;     // ...and on the heaviest
// the rim's own coastline. fbm()'s spread is about a third of its range, so
// these are cut for the bights they leave in the rim's line (in cos-latitude,
// where 0.08 is ~9 u of arc), not for the numbers.
const LOBE_AMP = 0.150, LOBE_FREQ = 1.15;   // bights and headlands, ~100 u across
const MID_AMP = 0.085, MID_FREQ = 3.0;      // the second scale of the same coast
const JAG_AMP = 0.035, JAG_FREQ = 7.4;      // and the break along the edge itself
const RIM_RAMP = 0.036;      // the step's width in cos-latitude: ~4.3 u of arc,
                             // wide enough that the mesh resolves it without stair-steps
const RIM_TAPER = 0.11;      // how far in from the rim the ice comes up to its own
                             // thickness: ~13 u of arc, a front and not a step
const FRONT_TOP = 7.0;       // the front's own height over the ground it lies on
// The cap is carried onto the week's own side by its bearing, and then by its own
// shrug off that line. Between a light week's lean and the shrug a cap's pole can
// sit sixty degrees off the world's, which is what puts the sheet somewhere new
// on the poster every week — and why the lean is read as a bearing rather than as
// the week's own scatter (six sessions round the globe gather nowhere, and an
// unnormalised centroid would leave that week's cap nailed to the pole).
const TILT_MAX = 0.52;       // how far the week's own shrug leans the rim (radians)
const TILT_JITTER = 0.16;    // ...and how unsure the week is of its own lean
const LEAN_HEAVY = 0.30;     // a heavy week's wide cap sits near its own pole: the disc
const LEAN_LIGHT = 0.70;     // keeps its open water. A light week's narrow cap is turned
                             // right onto the trained side, or it would be off the disc

const FLOE_CUT = 0.30, FLOE_FREQ = 4.2;     // the ice broken off the edge
const FLOE_BAND = 0.16;      // ...drifting no further out than this
const FLOE_TOP = -1.2;       // a floe's deck, just over the water it floats in

const GROUND_MID = -4.6;     // the sea floor: the week's ground, low
const GROUND_MACRO = 0.75;   // ...carrying the week's continental term
const GROUND_SPAN = 1.8;     // ...and its own fine relief
const GROUND_FINE_FREQ = 2.6;

// A bay is where the ice simply is not: the week's own ground showing through it,
// raised as one level shelf so that session's landmark has dry ground, with the
// ground's own hollows flooded and its own noise for a shore. It is deliberately
// NOT a shape drawn round the site: a floor that rose at the site and fell away
// from it would be a circular shore, and a circular shore on a sheet of ice reads
// as a ring — a moat of water round a dry island. The shelf has no shape of its
// own, so a bay is as irregular as the week's own ground.
const BAY_SHELF = 3.6;       // how far the week's own ground is lifted inside a bay:
                             // a uniform shelf, so a bay's floor is the week's ground
                             // with its hollows flooded and no shape of its own
const BAY_CAP = 4.0;         // ...and how close it may come to the ice above it
const BAY_LO = 0.40, BAY_HI = 0.50;   // the day-mass band a bay is cut on
const BAY_WOBBLE = 0.18;     // ...its own edge broken by the week's noise

// The sheet's grain: a groove takes the wash down its walls, a ridge gives the
// light a lit side and a shaded one. A sheet without them is a blank page. The
// groove's depth is what the week's own time in zones 4-5 earns it.
const CREV_BASE = 12.0;      // a groove's depth on the easiest week...
const CREV_HARD = 6.0;       // ...and what a hard week adds
const RIDGE_AMP = 5.5;       // a pressure ridge, thrown up between the trains: the
                             // plain's own form. At four the middle of a heavy week's
                             // sheet measured a median gradient of 0.07 — a flat deep
                             // plain, which is exactly what this world was asked to fix
const DRIFT_AMP = 3.4;       // and the wind drift that crosses them

// The rim's own outline, besides its noise: the cap is drawn as an ellipse whose
// long axis the week's own shrug turns, so one week's sheet is a broad lobe with a
// bight opposite it and the next is nearly round. It is read off the cap's own
// azimuth (a dot product and a square root, no angle taken).
const LOBE_ELL = 0.055, LOBE_ELL_SPREAD = 0.075;

// The flow. A stream is one deep trough cut from the crest down to a bay; a belt
// is a shallower one whose floor is stepped by a crevasse train. Both are read in
// the cap's own frame, so the ice the week's days earned carries its own drawing
// wherever the cap is turned. Their depths are cut against the reading step above:
// a trough under ~6 u deep has no slope the washes can see, whatever it looks
// like underfoot.
const STREAM_MAX = 2;        // the days with the most time behind them earn a stream
const STREAM_WIDTH = 54;     // a stream's own width in world units
const STREAM_WALL = 0.55;    // the share of its half-width that is wall: a stream is
                             // a reach of flat ice between two walls, not a V
const STREAM_DEPTH = 18.0;   // and how far its floor is cut below the ice
const STREAM_HOURS = 1.6;    // what a session's hours add to that width (u per hour)
const STREAM_REACH = 0.62;   // how far up the fall line a stream is born (radians of
                             // arc toward the crest): a stream is a reach of the sheet
                             // and not a scratch on the rim
const ICE_MIN = 0.3;         // ice kept over the bed: a stream scours nearly to it, so
                             // its floor takes the ground's own wash and the reach reads as
                             // a grey band down the sheet — the bays own the water
const FIELD_MIN = 4, FIELD_MAX = 7;   // how many crevasse belts a week's sheet carries:
                                      // the brief asks for fields that read, and a belt is
                                      // the one cut here wide enough for the survey's own
                                      // step to land either side of its scarps
const FIELD_WIDTH = 104;     // a belt's own width in world units
const FIELD_WALL = 0.26;     // the share of its half-width that is wall
const FIELD_STEP = 13.0;     // what one crevasse scarp drops
const FIELD_BED = 11.0;      // the trough the belt's floor lies in
const FIELD_TREAD = 118;     // the tread a belt's own scarps are spaced by. A scarp is
                             // a step and not a wave: the two taps of the survey land
                             // either side of a riser whatever the tread between them,
                             // where a train finer than the reading step is averaged
                             // away — and a belt shorter than a tread carries one step
const FIELD_TREADS_MIN = 2, FIELD_TREADS_MAX = 4;   // the steps one belt may carry
const FIELD_TURN = 0.75;     // how far a belt's mouth turns off its own head (radians):
                             // cuts it across the fall line, which is what keeps the
                             // sheet's reaches from ringing the cap
const FIELD_FADE = 0.30;     // the share of a belt's own length its ends fade over

// The wind-scoured flats: the blue ice. Katabatic wind falling off a crest
// carries the snow away with it, and what is left is the ice itself — flat,
// bare and blue, because blue ice is dense ice: the air has been pressed out of
// it, and a painter's blue is the only honest way to say so. A flat is cut to one
// level over its own footprint, so what stands in the middle of the sheet is a
// level field of ice six or eight units under the snow that drifted round it,
// with its wall where the cut meets the drift. Flat means flat: the survey reads
// a slope of a twentieth as steep and hands it to the snow, so the floor of a
// scour has to be *level* for the ice's own washes to be seen at all — which is
// also why a scour is the one thing on this sheet a painter can lay a wash in.
const SCOUR_MIN = 2, SCOUR_MAX = 4;     // how many scoured flats a sheet carries
const SCOUR_SPAN = 27;                  // the half-run of a flat's own footprint, u
const SCOUR_SPAN_SPREAD = 0.5;
const SCOUR_DROP = 9.0;                 // how far its floor is cut below the ice it was
const SCOUR_EDGE = 0.26;                // the share of its run its wall takes
const SCOUR_WOBBLE = 0.20;              // the week's own noise on the footprint's rim
const SCOUR_FLOOR = 2.6;                // the least ice kept under a scoured floor
const SCOUR_INSET = 0.16;               // how far inside the rim a flat's own centre must
                                        // stand, in cos-latitude: a scour is a fact about
                                        // the middle of a sheet, not its edge
// ...and the sastrugi: the wind's own combing of that bare ice, long shallow
// grooves down the wind. Shallow enough that the survey still reads the floor as
// level — a groove train deep enough to be steep would put the snow back on it.
const SAST_SPACING = 30;
const SAST_AMP = 2.2;
const SAST_WARP = 0.9;

// the nunataks: rock where the week trained, standing off each site up the sheet
// so the landmark keeps its level ground and the rock breaks out through the ice
// rather than standing in the water of its own bay.
//
// A nunatak is a *range* here and not a peak, and that is a fact about the
// reading and not about mountains. From orbit the snow reserve is drawn on the
// survey's own slope (inkCaps: above the snow line *and* steeper than a
// twentieth), so a narrow spire is snow-covered whatever it is made of — it came
// out as a white button on white ice, one of the shapes that made the old sheet
// read as assembled. A range is broad: forty units of run to ten of rise is a
// slope of a quarter, and at that grade the snow lets go of half the ground and
// the rock's own washes show through, dark, the way a real range stands out of a
// real ice sheet. So each site throws up one ridge, long across the fall line,
// with three summits along it and the week's own noise ragging its crest.
const NUN_OFF = 0.16, NUN_OFF_SPREAD = 0.10;    // how far off its site a range stands (rad):
                                                // far enough up the fall line to stand on ice
const NUN_LONG = 0.42, NUN_LONG_SPREAD = 0.16;  // half the range's own length (rad of arc)
const NUN_WIDE = 0.45, NUN_WIDE_SPREAD = 0.14;  // ...and half its width, as a share of that:
                                                // broad enough that the survey reads it as a
                                                // slope and not as a wall
const NUN_AMP = 5.5, NUN_HOURS = 1.4, NUN_SPREAD = 1.6;  // tall enough to break out of the
                                                // ice — by the hours, so the week's long
                                                // session is the big range
const NUN_SUMMIT_MIN = 2.6, NUN_SUMMIT_MAX = 6.2; // how fast a range's own summits come
const NUN_RAGGED = 0.30;                        // how much of its height the week's own
                                                // noise takes back off its crest

const ROUTE_KEEP = 0.35;      // what of a route's own relief this world keeps

const LOAD_FULL = 900;       // the load a sheet's reach is read against
const HARD_FULL = 0.4;       // ...and the zone-4/5 share its crevasses are read against

/** The rim's latitude the week's load earns: easy weeks leave the sea most of
 *  the globe, heavy ones carry the sheet down to the training band. */
const edgeOf = (load) => mix(EDGE_EASY, EDGE_HEAVY, clamp(load / LOAD_FULL, 0, 1));

/** One train of strokes: a direction of its own, and the phase rate that puts
 *  its lines `spacing` world units apart (arc ≈ radians on R = 120). */
function trainOf(rng, spacing) {
  const z = rng() * 2 - 1;
  const a = rng() * Math.PI * 2;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return { x: Math.cos(a) * r, y: z, z: Math.sin(a) * r, k: Math.PI / (spacing / 120) };
}

/** The side of the globe the week trained on: its sites, weighted by the hours
 *  spent at them. A week with no sites at all leans nowhere. */
function centroidOf(ctx) {
  let x = 0, y = 0, z = 0, w = 0;
  for (const place of ctx.placed) {
    const hours = Math.max(0.25, place.hours || 0);
    x += place.dir.x * hours; y += place.dir.y * hours; z += place.dir.z * hours; w += hours;
  }
  if (!w) return { x: 0, y: 0, z: 0 };
  const l = Math.hypot(x, y, z) || 1;
  return { x: x / l, y: y / l, z: z / l };
}

/** A bearing on the cap: the direction at `lat` cos-latitude round the cap's
 *  axis, `az` radians of azimuth off the cap's own first meridian. */
function bearingAt(axis, e1, e2, lat, az, out) {
  const s = Math.sqrt(Math.max(0, 1 - lat * lat));
  const c = Math.cos(az), n = Math.sin(az);
  out.x = axis.x * lat + (e1.x * c + e2.x * n) * s;
  out.y = axis.y * lat + (e1.y * c + e2.y * n) * s;
  out.z = axis.z * lat + (e1.z * c + e2.z * n) * s;
  return out;
}

/**
 * One belt's own frame: the great circle from `head` to `exit`, read later as the
 * midpoint it is measured from, the tangent along it and the normal its width is
 * taken across. Chord lengths stand in for arcs: at the widths a belt is drawn
 * at, the two part in the third decimal. A head and a mouth that fall on the same
 * line have no belt between them, and get a normal of their own instead.
 */
function trackOf(head, exit, R) {
  let nx = head.y * exit.z - head.z * exit.y;
  let ny = head.z * exit.x - head.x * exit.z;
  let nz = head.x * exit.y - head.y * exit.x;
  const nl = Math.hypot(nx, ny, nz);
  if (nl < 1e-4) {
    // the two ends are the same point (or its antipode): any normal will do,
    // since the track has no length to speak of and its gates close at once
    nx = 0.62; ny = 0; nz = -0.78;
  } else { nx /= nl; ny /= nl; nz /= nl; }
  let mx = head.x + exit.x, my = head.y + exit.y, mz = head.z + exit.z;
  const ml = Math.hypot(mx, my, mz) || 1;
  mx /= ml; my /= ml; mz /= ml;
  let tx = ny * mz - nz * my, ty = nz * mx - nx * mz, tz = nx * my - ny * mx;   // n × m
  if (tx * (exit.x - head.x) + ty * (exit.y - head.y) + tz * (exit.z - head.z) < 0) {
    tx = -tx; ty = -ty; tz = -tz;
  }
  const dot = clamp(head.x * exit.x + head.y * exit.y + head.z * exit.z, -1, 1);
  // half the arc between the two ends, in *world units*: everything downstream —
  // the run along the track, its fade at the ends, the treads a belt's scarps are
  // spaced by — is measured in units off the ground (see the flow loop in
  // sheetAt), so a half-length left in radians closed every stream and every belt
  // within half a unit of its own centre, which is why the sheet carried hairlines
  // where it should carry reaches and crevasse fields.
  return { mx, my, mz, tx, ty, tz, nx, ny, nz, half: Math.acos(dot) * 0.5 * R };
}

/* --------------------------------------------------------------- the week --- */

/**
 * The week's own sheet, built once per reading and cached on the ctx: the cap's
 * axis (the week's own bearing, its lean and its shrug), how far the rim reaches,
 * the crest, the streams and the belts the week's days earned, the groove depths,
 * the floe field's cut and the nunataks. Nothing here allocates after the first
 * call.
 */
function stateOf(ctx) {
  let st = STATES.get(ctx);
  if (st) return st;
  const rng = ctx.rng('tundra');
  const nz = ctx.nz, fbm = ctx.fbm;
  const stats = ctx.stats || {};
  const load = Number(stats.load) || 0;
  const hard = clamp((Number(stats.hard) || 0) / HARD_FULL, 0, 1);

  // Where the sheet sits. Its cap is turned toward the bearing of the side of the
  // globe the week trained on — the ice gathers over the week's own days — and
  // then, by its own shrug, off that line, so no two weeks carry the same cap in
  // the same place. The lean is what keeps this world from being a white cap
  // nailed to the top of every poster; it is the week's own shrug that keeps it
  // from being the same cap one line further down.
  const centre = centroidOf(ctx);
  // A narrow cap has to be turned onto the week's own side to be seen at all; a
  // wide one would swallow the disc's water if it were. So the lighter the week,
  // the further the sheet is carried away from its pole.
  const lean = clamp(LEAN_LIGHT - (LEAN_LIGHT - LEAN_HEAVY) * clamp(load / LOAD_FULL, 0, 1)
    + (rng() * 2 - 1) * TILT_JITTER, 0.10, 0.85);
  const shrug = (rng() * 2 - 1) * TILT_MAX;
  // The cap's axis: up (the pole the latitude is read from), turned `lean`
  // toward the week's own bearing, and then `shrug` off to one side of it. Its
  // circle is the rim; where it stands is the week's own geography.
  const qx = -centre.z, qz = centre.x;            // the week's bearing, turned a quarter
  const ax0 = centre.x * lean + qx * shrug, az0 = centre.z * lean + qz * shrug;
  const al = Math.hypot(ax0, 1, az0) || 1;
  const ax = ax0 / al, ay = 1 / al, az = az0 / al;
  const edgeCos = edgeOf(load);

  // A basis across the cap's axis, for every bearing the week's own flow is read
  // at. The axis always stands within some sixty degrees of the world's pole, so
  // a helper laid in the equator's plane is never parallel to it.
  const axis = { x: ax, y: ay, z: az };
  let e1x = ay * -0.78, e1y = az * 0.62 - ax * -0.78, e1z = -ay * 0.62;
  const e1l = Math.hypot(e1x, e1y, e1z) || 1;
  e1x /= e1l; e1y /= e1l; e1z /= e1l;
  const e1 = { x: e1x, y: e1y, z: e1z };
  const e2 = { x: ay * e1z - az * e1y, y: az * e1x - ax * e1z, z: ax * e1y - ay * e1x };

  // The flow: the streams the week's own long sessions earned, and the belts its
  // own hardness earned. A stream is aimed at a bay (its session's site); a belt
  // is laid on the sheet's fall line and turned off it, so the reaches the two cut
  // cross instead of ringing the cap. Both run from up the fall line down to the
  // rim, and both are read as: how far off the track, and how far along it.
  const flow = [];
  const sites = [...ctx.placed].filter((p) => (p.hours || 0) > 0).sort((a, b) => (b.hours || 0) - (a.hours || 0));
  const used = [];
  for (const place of sites) {
    if (used.length >= STREAM_MAX) break;
    const exit = place.dir;
    // one stream to a side of the week, never two down the same fall line
    let apart = true;
    for (const u of used) if (u.x * exit.x + u.y * exit.y + u.z * exit.z > 0.86) { apart = false; break; }
    if (!apart) continue;
    const exitLat = clamp(exit.x * ax + exit.y * ay + exit.z * az, -1, 1);
    const azS = Math.atan2(exit.x * e2.x + exit.y * e2.y + exit.z * e2.z,
      exit.x * e1.x + exit.y * e1.y + exit.z * e1.z);
    // born up the fall line, on the same line of the cap as the bay it runs to
    const head = bearingAt(axis, e1, e2, clamp(exitLat + STREAM_REACH, -0.98, 0.98), azS, { x: 0, y: 0, z: 0 });
    const track = trackOf(head, exit, ctx.R);
    const w = STREAM_WIDTH * 0.5 + STREAM_HOURS * Math.min(2.5, place.hours || 0);
    flow.push({
      ...track, w, wall: w * (1 - STREAM_WALL), gate: Math.sin((w + 8) / 120),
      depth: STREAM_DEPTH, step: 0, k: 0, ends: track.half * 0.25,
    });
    used.push(exit);
  }
  // the belts. Their heads are read on the sheet's own high ground, over the cap's
  // pole, and their mouths at the rim, with the mouth turned off the head's own
  // meridian: a belt runs the whole fall line — long enough to be a field of
  // crevasses and not a patch of one — and crosses the fall line as it goes, which
  // is what keeps the sheet's reaches from closing round the cap. Its scarps are
  // spaced off its own length, so even a narrow week's cap carries one.
  const belts = FIELD_MIN + Math.round(clamp(hard, 0, 1) * (FIELD_MAX - FIELD_MIN));
  for (let i = 0; i < belts; i++) {
    const az = rng() * Math.PI * 2;
    const headLat = 0.90 + 0.09 * rng();
    const turn = (rng() * 2 - 1) * FIELD_TURN;
    // the mouth is read at the rim's own latitude, on the week's own coast line
    const head = bearingAt(axis, e1, e2, headLat, az, { x: 0, y: 0, z: 0 });
    const exit = bearingAt(axis, e1, e2, clamp(edgeCos + 0.04, -0.95, 0.95), az + turn, { x: 0, y: 0, z: 0 });
    const track = trackOf(head, exit, ctx.R);
    const w = FIELD_WIDTH * (0.78 + 0.42 * rng()) * 0.5;
    const len = track.half * 2;
    const treads = clamp(Math.round(len / FIELD_TREAD), FIELD_TREADS_MIN, FIELD_TREADS_MAX);
    flow.push({
      ...track, w, wall: w * (1 - FIELD_WALL), gate: Math.sin((w + 8) / 120),
      depth: FIELD_BED, step: FIELD_STEP * (0.72 + 0.56 * rng()),
      k: treads / Math.max(24, len), ends: Math.max(track.half * FIELD_FADE, 0.06),
    });
  }

  // the nunataks: one range to a training site, standing off it by its own step,
  // laid across the fall line so the rock is a ridge in the ice and not a row of
  // specks up the slope
  const peaks = [];
  const prng = ctx.rng('tundra-rock');
  for (const place of ctx.placed) {
    const dir = place.dir;
    // the step the rock stands off its site: mostly inland, up the sheet, so the
    // range breaks out of the ice rather than standing in the bay's water, with a
    // little of the week's own scatter either side of that line
    const along = ax * dir.x + ay * dir.y + az * dir.z;
    let ix = ax - dir.x * along, iy = ay - dir.y * along, iz = az - dir.z * along;
    let il = Math.hypot(ix, iy, iz);
    if (il < 1e-6) { ix = 0; iy = 1; iz = 0; il = 1; }
    ix /= il; iy /= il; iz /= il;
    // a perpendicular of that line: the range's own axis, across the fall line
    let sx = dir.y * iz - dir.z * iy, sy = dir.z * ix - dir.x * iz, sz = dir.x * iy - dir.y * ix;
    const sl = Math.hypot(sx, sy, sz) || 1;
    sx /= sl; sy /= sl; sz /= sl;
    const side = (prng() * 2 - 1) * 0.6;
    let tx = ix + sx * side, ty = iy + sy * side, tz = iz + sz * side;
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    const off = NUN_OFF + NUN_OFF_SPREAD * prng() + 0.10;
    const so = Math.sin(off), co = Math.cos(off);
    const cx = dir.x * co + tx * so, cy = dir.y * co + ty * so, cz = dir.z * co + tz * so;
    // the range's own frame at its centre: its axis across the fall line, and the
    // normal its width is taken along
    const long = NUN_LONG + NUN_LONG_SPREAD * prng();
    // …and in world units, which is the frame the ground is read in: the offsets
    // the range is measured against below are dot products of tangents, i.e. an
    // arc in radians, so they are taken to units by multiplying by R — and a half
    // length left in radians against them is a range 120 times too short. That is
    // how this world's rock has been drawn until now: a range of ~50 u along and
    // ~35 u across, culled to the half unit round its own centre, which is why
    // the nunataks read from orbit as serrations on the rim and never as rock.
    const la = long * ctx.R;
    const lc = long * (NUN_WIDE + NUN_WIDE_SPREAD * (prng() - 0.5)) * ctx.R;
    peaks.push({
      x: cx, y: cy, z: cz,
      ex: sx, ey: sy, ez: sz,
      nx: cy * sz - cz * sy, ny: cz * sx - cx * sz, nz: cx * sy - cy * sx,
      la, lc,
      amp: NUN_AMP + NUN_HOURS * Math.min(2.5, place.hours || 0) + NUN_SPREAD * prng(),
      phase: prng() * Math.PI * 2,
      // the range's own spine: how fast its summits come, and a seed, so no
      // two ranges of a week are the same ridge (see the crest in sheetAt)
      freq: NUN_SUMMIT_MIN + (NUN_SUMMIT_MAX - NUN_SUMMIT_MIN) * prng(),
      seed: prng() * 17.3,
      // the gate: the range's own reach, in cosines, with its width added on
      gate: Math.cos(Math.min(1.5, (la * 1.15 + lc + 10) / ctx.R)),
    });
  }
  // the wind-scoured flats: the blue ice, cut level into the middle of the sheet
  const flats = [];
  const srng = ctx.rng('tundra/scour');
  const want = SCOUR_MIN + Math.round(srng() * (SCOUR_MAX - SCOUR_MIN));
  for (let tries = 0; tries < 64 && flats.length < want; tries++) {
    const y0 = srng() * 2 - 1;
    const r0 = Math.sqrt(Math.max(0, 1 - y0 * y0));
    const th0 = srng() * Math.PI * 2;
    const fx = Math.cos(th0) * r0, fy = y0, fz = Math.sin(th0) * r0;
    // inside the ice, and well inside it: a scour belongs to the middle of a sheet
    if (fx * ax + fy * ay + fz * az < edgeCos + SCOUR_INSET) continue;
    let apart = true;
    for (let i = 0; i < flats.length; i++) {
      if (flats[i].x * fx + flats[i].y * fy + flats[i].z * fz > 0.86) { apart = false; break; }
    }
    if (!apart) continue;
    const span = SCOUR_SPAN * (1 - SCOUR_SPAN_SPREAD * 0.5 + SCOUR_SPAN_SPREAD * srng());
    // the flat's own floor: the sheet at its centre, cut down by the scour
    const fm = ctx.macro({ x: fx, y: fy, z: fz });
    const roll = fbm(nz, fx * SHEET_DOME_FREQ - 5.3, fy * SHEET_DOME_FREQ + 2.7, fz * SHEET_DOME_FREQ - 7.9, 3) * 2 - 1;
    const centre = SHEET_TOP + SHEET_MACRO * fm + SHEET_DOME * roll;
    flats.push({
      x: fx, y: fy, z: fz, span,
      floor: centre - SCOUR_DROP,
      gate: Math.cos(Math.min(1.5, (span * 1.7 + 10) / 120)),
    });
  }
  // the cap's own outline: an ellipse whose long axis the week's own shrug turns,
  // so its rim reaches further on one side of the week's geography than on the
  // other and one week's sheet is a broad lobe where the next is nearly round
  const ellAxis = bearingAt(axis, e1, e2, 0, rng() * Math.PI * 2, { x: 0, y: 0, z: 0 });
  const ell = LOBE_ELL + LOBE_ELL_SPREAD * rng();
  st = {
    ax, ay, az,
    edge: edgeCos, peaks, flow, flats,
    elx: ellAxis.x, ely: ellAxis.y, elz: ellAxis.z, ell,
    // the crest: how thick the ice stands over the week's own pole, and how much
    // of that height its own roll takes back before it gets there
    crest: 0.55 + 0.75 * rng(),
    // how much of the week's own noise is read as ice rather than as water
    floeCut: FLOE_CUT + (rng() - 0.5) * 0.08,
    // the trains: a direction of their own each week, and their spacings
    grove: trainOf(rng, GROOVE_SPACING), ridge: trainOf(rng, RIDGE_SPACING), drift: trainOf(rng, DRIFT_SPACING),
    // the wind that combs the bare ice: its own direction, and its own tread
    sast: trainOf(rng, SAST_SPACING),
    // crevasses: a hard week grooves its sheet deeper
    crevDepth: CREV_BASE + CREV_HARD * hard,
    // a heavier week's sheet sits a touch higher (and its bays with it)
    lift: (load / LOAD_FULL - 0.4) * 0.5,
  };
  STATES.set(ctx, st);
  return st;
}

/**
 * The ground the sheet stands on, the sheet itself with its roll, its crest, its
 * grain trains, the streams and the crevasse belts cut down the fall line, its
 * rim, the floes broken off it, and the bays the week's training cut into it.
 * Read per vertex: nothing here allocates.
 */
function sheetAt(dir, ctx) {
  const st = stateOf(ctx);
  const nz = ctx.nz, fbm = ctx.fbm, ridged = ctx.ridged;
  const x = dir.x, y = dir.y, z = dir.z;

  // ---- the week's own continental term, read once and used twice: it is the
  // floor the sea lies in and the dome the sheet is laid over, so a world of
  // ice still stands on the week's own continents.
  const m = ctx.macro(dir);
  const ground = GROUND_MID + GROUND_MACRO * m
    + GROUND_SPAN * (fbm(nz, x * GROUND_FINE_FREQ + 3.1, y * GROUND_FINE_FREQ - 1.7, z * GROUND_FINE_FREQ + 5.3, 3) * 2 - 1);
  // The bed: the shelf a bay's floor is raised to, and the floor no cut may make
  // water through. A trough that reached it would be a channel through the sheet,
  // and this world's channels are its bays.
  const bed = ground + BAY_SHELF;
  const iceFloor = bed + ICE_MIN;
  // The sheet is a sheet: a nearly level cap, its own roll and the swell that
  // crosses it the only relief it carries at the cap's scale, so its outline
  // stays round and its rim's cliff stays even. What life it has is put in by the
  // crest, the streams, the belts, the bays and the rock — and the roll is read
  // twice here, once as the sheet's own height and once as the figure the crest
  // wanders at, since the two are the same drawing.
  const roll = fbm(nz, x * SHEET_DOME_FREQ - 5.3, y * SHEET_DOME_FREQ + 2.7, z * SHEET_DOME_FREQ - 7.9, 3) * 2 - 1;
  const dome = SHEET_DOME * roll;
  const sheetBase = SHEET_TOP + st.lift + SHEET_MACRO * m + dome;

  // ---- the rim: a line of the week's own latitude, eaten along its length by
  // the week's own noise. The two broad scales are read everywhere (they are
  // the rim), the fine break only within a few units of it: further out the
  // sheet is either wholly there or wholly gone, and the term cannot show.
  const lat = x * st.ax + y * st.ay + z * st.az;
  // the cap's own outline, read off its azimuth: cos(2·az) from a dot product and
  // a square root, no angle taken
  const perp = 1 - lat * lat;
  const ca = perp > 0.02 ? (x * st.elx + y * st.ely + z * st.elz) / Math.sqrt(perp) : 1;
  let band = lat - st.edge - st.ell * (ca * ca * 2 - 1)
    + LOBE_AMP * (fbm(nz, x * LOBE_FREQ - 2.3, y * LOBE_FREQ + 4.7, z * LOBE_FREQ - 6.1, 3) * 2 - 1)
    + MID_AMP * (fbm(nz, x * MID_FREQ + 6.7, y * MID_FREQ - 3.3, z * MID_FREQ + 1.9, 2) * 2 - 1);

  // ---- the week's training, read wherever it falls: a bay is cut into the
  // sheet and, where a site lies out in the water, stands as ground in it.
  const dayM = ctx.dayMass(dir);
  const bay = dayM > BAY_LO
    ? sstep(BAY_LO, BAY_HI, dayM + BAY_WOBBLE * (fbm(nz, x * 6.3 + 8.4, y * 6.3 - 2.2, z * 6.3 + 4.6, 2) * 2 - 1))
    : 0;

  let h, cover = 0;
  if (band < -0.06) {
    // ---- open water. Just off the rim the ice that broke off it drifts: a
    // second field's own islands, low over the water and gone by the time the
    // rim's own ramp begins.
    h = ground;
    if (band > -FLOE_BAND) {
      const fl = fbm(nz, x * FLOE_FREQ + 9.1, y * FLOE_FREQ - 5.5, z * FLOE_FREQ + 2.7, 3) * 2 - 1;
      const floe = sstep(st.floeCut, st.floeCut + 0.10, fl) * sstep(-FLOE_BAND, -0.02, band);
      if (floe > 0) h = mix(h, h > FLOE_TOP ? h : FLOE_TOP + 0.6 * fl, floe);
    }
  } else {
    // ---- the sheet. Its swell is slow so the plateau stays a sheet, and the
    // crest is the thickness the week's own days earned it: level over the
    // middle of the cap, falling away where the margin is, and taken back by the
    // roll wherever the roll stands high, so the ice reads as a range with
    // reaches in it rather than as one dome with a ring round its shoulder.
    const swell = SHEET_SWELL * (fbm(nz, x * SHEET_FREQ + 1.3, y * SHEET_FREQ + 7.7, z * SHEET_FREQ - 3.9, 3) * 2 - 1);
    const u = clamp((1 - lat) / (1 - st.edge), 0, 1);
    const sr = Math.sqrt(u);
    const thick = 1 - CREST_WANDER * (0.5 - 0.5 * roll);
    const crest = SHEET_CREST * st.crest * thick * Math.max(0, 1 - u * u * sr);
    // the wander and the breaks the week's own noise lays over every train
    const wander = TRAIN_WARP * (fbm(nz, x * 0.9 + 12.3, y * 0.9 - 5.5, z * 0.9 + 8.1, 2) * 2 - 1);
    const trains = TRAIN_FLOOR + (1 - TRAIN_FLOOR) * sstep(TRAIN_LO, TRAIN_HI, fbm(nz, x * TRAIN_FADE_FREQ - 3.3, y * TRAIN_FADE_FREQ + 7.7, z * TRAIN_FADE_FREQ - 2.2, 2));
    const g = st.grove, rr = st.ridge, d = st.drift;
    const pg = (x * g.x + y * g.y + z * g.z) * g.k + wander;
    const cg = Math.abs(Math.cos(pg));                 // the grooves run on the crests
    const sg = Math.abs(Math.sin(pg));                 // ...and the ridges between them
    const pd = (x * d.x + y * d.y + z * d.z) * d.k + wander;
    const cd = Math.abs(Math.cos(pd));
    const groove = cg * cg * cg * trains;
    const ridge = RIDGE_AMP * (sg * sg * sg) * trains;
    const drift = DRIFT_AMP * (cd * cd) * trains;
    let sheet = sheetBase + swell + crest + ridge + drift - st.crevDepth * groove;

    // ---- the wind-scoured flats: ice cut to one level in the lee of the crest,
    // its floor flat enough that the survey hands it to the washes and the snow
    // lets go of it, its rim the wall the drift left. The sastrugi are the wind's
    // combing of the bare floor: long shallow grooves down the wind, kept too
    // shallow to bring the snow back onto it.
    const flats = st.flats;
    if (flats.length) {
      const R = ctx.R;
      for (let i = 0; i < flats.length; i++) {
        const f = flats[i];
        const dot = x * f.x + y * f.y + z * f.z;
        if (dot < f.gate) continue;
        // the run from the flat's own centre, its rim raggled by the week's noise
        const chord = Math.sqrt(Math.max(0, 2 - 2 * dot)) * R;
        const wob = SCOUR_WOBBLE * (fbm(nz, x * 5.7 + 3.3, y * 5.7 - 7.1, z * 5.7 + 1.9, 2) * 2 - 1);
        const q = chord / f.span + wob;
        if (q >= 1) continue;
        const flat = q <= 1 - SCOUR_EDGE ? 1 : 1 - sstep(0, 1, (q - (1 - SCOUR_EDGE)) / SCOUR_EDGE);
        // a scour only ever cuts down: where the ice already stands below the
        // level the wind would have left, the wind has nothing to do
        const floor = f.floor < iceFloor + SCOUR_FLOOR ? iceFloor + SCOUR_FLOOR : f.floor;
        if (floor < sheet) sheet += (floor - sheet) * flat;
        const ps = (x * st.sast.x + y * st.sast.y + z * st.sast.z) * st.sast.k + wander * SAST_WARP;
        const cs = Math.abs(Math.cos(ps));
        sheet -= SAST_AMP * cs * cs * cs * flat;
      }
    }

    // ---- the flow: the streams and the belts, read in the cap's own frame. A
    // trough's floor is its own depth below the ice it was cut from, and never
    // below the bed: what carries the ice to a bay is a valley in the ice, and
    // the water at a bay's mouth is the bay's own business.
    for (let i = 0; i < st.flow.length; i++) {
      const f = st.flow[i];
      const dn = x * f.nx + y * f.ny + z * f.nz;
      if (dn > f.gate || dn < -f.gate) continue;         // the track's width, read as its sine
      const dm = x * f.mx + y * f.my + z * f.mz;
      if (dm < 0.15) continue;                           // its far side: every arc has run out
      const along = Math.atan2(x * f.tx + y * f.ty + z * f.tz, dm) * 120;
      if (along < -f.half || along > f.half) continue;   // past either end of the track
      const run = sstep(-f.half, -f.half + f.ends, along) * (1 - sstep(f.half - f.ends, f.half, along));
      if (run < 0.01) continue;
      const across = Math.abs(dn) * 120;
      const cut = (1 - sstep(f.wall, f.w, across)) * run;
      if (cut < 0.01) continue;
      const floor = sheet - f.depth > iceFloor ? sheet - f.depth : iceFloor;
      sheet += (floor - sheet) * cut;
      if (f.step > 0) {
        // the belt's own crevasse train: its floor steps down as it runs, each
        // riser a stroke of its own. A scarp is drawn as far as its own tread is
        // long — the two taps of the survey land either side of a riser and the
        // wash steps with the ice — so the treads are spaced off the belt's own
        // length and never off a fixed number.
        const q = along * f.k + wander;
        const seg = Math.floor(q);
        sheet -= f.step * (seg + sstep(0.55, 0.9, q - seg)) * cut;
      }
    }
    if (sheet < iceFloor) sheet = iceFloor;
    // ---- the ice front. The sheet's own edge is the one line of this world the
    // eye is promised from every distance, and it has to be a *front*: the ice
    // comes down to a low cliff at its rim and the globe's own contour stays the
    // sphere's. The sheet is eleven units thick at the rim by design (SHEET_TOP),
    // and a slab of that depth ending at the limb is a tab of ice standing outside
    // the disc — the failure both critics named on every week. So the ice thins,
    // over the last thirteen units of its own arc, to a front seven units over the
    // ground it lies on: a breadths-thick edge with the bays and the rock breaking
    // through it, which is also what makes the cut edge read at all.
    if (band < RIM_TAPER) {
      const front = sstep(0, RIM_TAPER, band);
      const low = ground + FRONT_TOP;
      if (low < sheet) sheet = mix(low, sheet, front);
    }
    if (band <= 0.06 && band >= -0.06) {
      band += JAG_AMP * (ridged(nz, x * JAG_FREQ + 3.3, y * JAG_FREQ - 6.6, z * JAG_FREQ + 9.9, 2) * 2 - 1);
    }
    const face = sstep(0, RIM_RAMP, band < 0 ? band + RIM_RAMP : RIM_RAMP);
    h = band >= RIM_RAMP ? sheet : mix(ground, sheet, face);
    cover = band >= RIM_RAMP ? 1 : face;
  }

  // ---- the bays next. A bay is where the ice simply is not: the week's own
  // ground showing through it, its low parts flooded and its high parts dry
  // enough for that session's landmark, with the ice front for its walls. It is
  // deliberately not a shape drawn round the site — a floor that rose at a site
  // and fell away from it would be a circular shore, and a circular shore on a
  // sheet of ice reads as a ring — so only the bay's edge comes from the week's
  // day-mass field and its floor is the week's own ground. Read only where a bay
  // is, which is a few per cent of a globe.
  if (bay > 0) {
    const capH = sheetBase - BAY_CAP;          // never above the ice it is cut from
    let floor = bed;                           // the week's own ground, raised to a shelf
    if (floor > capH) floor = capH;
    h = mix(h, floor, bay);
  }

  // ---- and last the rock the week trained against: one range per site, laid
  // across the fall line, broad enough that the survey reads it as a slope and
  // the snow lets go of half of it, so the rock's own washes stand out of the
  // sheet. Read where the sheet or a bay is; its own gate is a dot product,
  // taken before anything else is measured.
  if (cover > 0 || bay > 0) {
    for (let i = 0; i < st.peaks.length; i++) {
      const peak = st.peaks[i];
      const dot = x * peak.x + y * peak.y + z * peak.z;
      if (dot < peak.gate) continue;
      // the range's own two axes: along its length, and across it
      const al = (x * peak.ex + y * peak.ey + z * peak.ez) * ctx.R / peak.la;
      const ac = (x * peak.nx + y * peak.ny + z * peak.nz) * ctx.R / peak.lc;
      const across2 = ac * ac;
      const along2 = al * al;
      if (across2 > 3 || along2 > 1.2) continue;
      // its crest: a ridge with summits of its own, read off the week's own
      // noise along the range's spine. The old crest was three cosines along
      // every range — a week with four ranges drew twelve teeth at one spacing,
      // and on the rim they read as a zip, not as rock. A ridge's summits are
      // its own: the frequency, the phase and the seed all come off the range,
      // so no two of the week's ranges repeat each other and none of them is a
      // comb.
      const spine = al * peak.freq + peak.phase;
      const ridgeNoise = fbm(nz, spine * 1.7, peak.seed * 5.1, spine * 0.43 + peak.seed * 2.3, 3) * 2 - 1;
      const ridge = 1 - Math.abs(ridgeNoise);
      const crest = 0.30 + 0.70 * ridge * ridge;
      const body = Math.exp(-across2) * Math.max(0, 1 - along2 * 0.82);
      const ragged = 1 - NUN_RAGGED * (fbm(nz, x * 6.3 + 4.4, y * 6.3 - 2.2, z * 6.3 + 8.8, 2) * 2 - 1);
      // its height comes down toward the rim with the ice it stands out of (a
      // tooth outside the silhouette is the comb the last two rounds flagged), and
      // stands whole where a bay's own ground carries it
      const e = peak.amp * body * crest * ragged * (0.25 + 0.75 * Math.max(cover, bay));
      if (e > 0.5) {
        const top = h + e;
        if (top > h) h = top;
      }
    }
  }
  return h;
}

export default {
  id: 'tundra',
  label: 'Tundra',
  // The sheet's own crest, swell and scours stand over any cap a marble wears:
  // the cap is set above the tallest ice this world can draw (the sheet's rim,
  // its dome, its crest and its swell together), because a cap that cuts the
  // sheet flattens the top of the ice into a squared flap hanging outside the
  // globe's own contour — which is exactly what a low cap did here. What the cap
  // holds off is the limb: the outline the eye reads stays the ice's own.
  orbit: { reliefCap: 38 },
  blurb: "A cold week that never climbed and never went outside: a sheet of ice over an ink-dark sea, crested with the week's own training, streaming to its bays.",

  /** Zero climb and (nearly) every hour under a roof, with the rest weeks left
   *  to the moon and football-dominant weeks to the commons. Climb is the
   *  week's climbing on routes (weekStats): a treadmill's incline never counts. */
  fit(stats) {
    const s = stats || {};
    if ((Number(s.climb) || 0) > 0) return 0;
    if (!((Number(s.indoor) || 0) >= 0.85)) return 0;
    if ((Number(s.hours) || 0) < 2.6) return 0;
    if ((Number(s.football) || 0) >= 0.45) return 0;
    // sure of itself, then surer: a wholly indoor week with hours behind it is
    // the sheet beyond argument
    const reach = clamp(((Number(s.indoor) || 0) - 0.85) / 0.15, 0, 1);
    const weight = clamp(((Number(s.hours) || 0) - 2.6) / 4, 0, 1);
    return 0.62 + 0.20 * reach + 0.14 * weight;
  },

  /** The week this world was made for: (nearly) every hour under a roof. A tie
   *  inside the auction's margin goes to it (worlds/index.js). */
  builtFor(stats) {
    return (Number(stats?.indoor) || 0) >= 0.85;
  },

  /** The week's own climate, read as highland air: these weeks carry no
   *  temperatures at all, and the picture is the sheet and the water it stands
   *  in, so the palette's season is set cold rather than left to the fallback.
   *  The sea is capped as well: a bay's shore is ground a step above the water
   *  and the site's landmark has to stand on it, so a week whose ocean rose
   *  past the shore would drown the very thing it drew. */
  climate(c) {
    const s = (c && c.stats) || {};
    const load = clamp((Number(s.load) || 0) / LOAD_FULL, 0, 1);
    c.warmth = 0.26 - 0.08 * load;
    // The sheet reaches past the training band on its heavy weeks, so the ground
    // it leaves is thinner than a classic week's: the sea is capped at the share
    // that ground can pay for, or the water would rise over the bays' shores.
    c.oceanFrac = Math.min(c.oceanFrac, 0.30);
    return c;
  },

  /** The ground the sheet stands on and the sea floor below it; see sheetAt. */
  baseline(dir, ctx) {
    return sheetAt(dir, ctx);
  },

  /** The world's last word on the ground. base.js stamps every course the week
   *  ran with a watch as a ridged range along its own route, and a loop course
   *  read that way is a wall of ice standing in a ring — a donut with nothing to
   *  do with the week. This world draws its routes down instead: whatever the
   *  routes (and any lagoon) laid on the sheet is kept at ROUTE_KEEP of its
   *  height, so a loop reads as a trail across the ice rather than a ridge round
   *  it. A week with no courses at all pays nothing for this.
   */
  shape(dir, h, ctx) {
    if (!ctx.routes.length) return h;
    const clean = sheetAt(dir, ctx);
    return clean + (h - clean) * ROUTE_KEEP;
  },

  /** Alpine air over ice. The page keeps its own warm cream — the sky, the limb
   *  and every break of the dry brush are the sheet this world is painted on —
   *  and the ice is laid in two washes the light can be read between: the lit
   *  plain of the cap in the palest cold wash the paper can stand beside, and
   *  the ground that turns away in a blue-grey a clear step under it, so a
   *  crevasse, a stream and a shoulder are drawn as values and not only as
   *  lines. The rock is the deepest slate of the same family; the shade, the sea
   *  and the picture's one committed dark are indigo; the week keeps its own
   *  sky, its mineral (cooled into the ink so the creases read as blue ice
   *  rather than a scribble) and a third of its own sea. */
  palette(pal, features) {
    const s = (features && features.stats) || {};
    const load01 = clamp((Number(s.load) || 0) / LOAD_FULL, 0, 1);
    // A hex literal is not a number: the two sheets below are mixed channel by
    // channel, not by adding the whole colour.
    const hexMix = (a, b, t) => {
      const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t);
      const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t);
      const c = (a & 255) + (((b & 255) - (a & 255)) * t);
      return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(c);
    };
    // The palette's components are plain numbers (this build runs three with
    // colour management off, as weekPalette's own mixc()/lerp() read them), so
    // a wash is mixed in the same space it is stored in.
    const put = (key, hex, t) => {
      const c = pal[key];
      if (!c) return;
      c.setRGB(
        mix(c.r, ((hex >> 16) & 255) / 255, t),
        mix(c.g, ((hex >> 8) & 255) / 255, t),
        mix(c.b, (hex & 255) / 255, t),
      );
    };
    // the ice: the lit plain seen from orbit, and the cold light that falls across
    // the ground it turns away from. Both are laid as washes a clear step under
    // the page: a wash that stands at the paper's own value is a blank leaf — the
    // shader's dry brush, its creased rims and its granulation are all drawn in
    // paper and in ink, so an ice left at the paper's value swallows every one of
    // them, and the sheet reads as one flat slab however much form is under it.
    // The plain is therefore the palest cold wash the page can stand *beside*
    // rather than at, and the light that falls across it a stride under that.
    put('dry', hexMix(0xd2dce8, 0xdde5ee, load01), 0.9);
    put('crest', 0xe9eef4, 0.9);
    put('litWarm', hexMix(0xa9b9cd, 0xbdccdd, load01), 0.9);
    // the sheet's half-tone: the ice on the ground that turns away from the
    // light, and the ground a bay leaves bare. These are the washes a scoured
    // flat and a nunatak are drawn in, so they carry the picture's blues: bare
    // blue ice on the floor of a scour, and the slate of rock at a range's own
    // height. Chrome, not grey — a blue ice is a *blue*, and a grey one reads as
    // a shadow on paper.
    put('landMid', 0x6f9cc8, 0.86);
    put('landLow', 0x3f6ea6, 0.84);
    put('landHigh', 0x35446c, 0.84);
    put('ink', 0x1a2236, 0.9);
    put('inkSoft', 0x475275, 0.86);
    put('sepia', 0x586179, 0.8);
    put('shadeCool', 0x35447a, 0.88);
    put('dark', 0x151e3a, 0.9);
    // the sea is the picture's dark. A week's own sweat is still what earned
    // it, so a third of the week's depth stays under the ink.
    put('seaShallow', 0x3a4c78, 0.68);
    put('seaDeep', 0x131c3a, 0.6);
    put('cobalt', 0x1c2a55, 0.68);
    put('teal', 0x3a5478, 0.68);
    put('foam', 0xeef3f7, 0.8);
    if (pal.shelf) put('shelf', 0x2f4068, 0.68);
    put('bare', 0x6b6a72, 0.6);
    put('veg', 0x5c6b66, 0.6);
    // the ice's own mineral note: this world's accent is a glacier's blue, and
    // it is spent where the ground really creases — a crevasse wall, a stream's
    // side, the fold at the foot of a range. That is the only blue in the
    // picture that is drawn *in* the form rather than lying on it, and on an ice
    // sheet it is the note that says the ice is ice and not snow.
    if (pal.accent) pal.accent.setHex(0x2f6fc4);
    if ('accentAmt' in pal) pal.accentAmt = 0.5;
    // no fields on the ice and no drowned coast under it: both are the lowland's
    // weather, and this world's lowland is the sea floor
    if ('vegAmt' in pal) pal.vegAmt = 0;
    if ('damp' in pal) pal.damp = 0;
    return pal;
  },

  /** Why the week is the sheet, in the reading's own words. */
  reason(stats) {
    const s = stats || {};
    const hours = Number(s.hours) || 0;
    const indoor = Number(s.indoor) || 0;
    const all = indoor >= 0.999 ? 'every hour' : `${Math.round(indoor * 100)}% of it`;
    return `nothing climbed and ${all} in ${hours.toFixed(1)} h indoors → the sheet, bayed where the week trained`;
  },
};

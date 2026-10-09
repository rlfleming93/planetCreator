/* Planet Creator — the Marble body (bodies/index.js).
 *
 * Scale is the lever, and this is the small end of it: a week that barely
 * happened is not a small planet, it is a rock — a few hundred paces round,
 * airless, cratered, and near enough that its own curve reads across the
 * poster. Where a giant is a week of consequence seen from far off, a marble is
 * a week of consequence seen close up, which is the whole of its trick: the
 * same ground, framed as a stone.
 *
 * Five things say small, and all five are levers this body owns:
 *
 *   the shape       A body this size has not the gravity to round itself, so
 *                   the tiniest weeks are potatoes and the merely small ones
 *                   are round marbles. The lump is three unequal axes, two
 *                   great bites and two octaves of slow noise (see the shape
 *                   hook), and it is the silhouette that carries the read — a
 *                   circle says planet at any distance, a lump says rock.
 *   the relief      The body sits a little inside R and its relief is drawn ten
 *                   units a side, so the limb is chewed by bowls and outcrops
 *                   instead of being an arc. `orbit.reliefCap` is raised to
 *                   leave all of it whole: a cap that shaved the crests flat
 *                   would draw a facet on the silhouette, which is the one
 *                   thing a small body never has.
 *   the face        The rock draws its own face from orbit: a shell a fraction
 *                   of a unit over the ground, carrying the cool wash on every
 *                   wall the sun has left, the sheet left dry on the crests it
 *                   catches, ink in the creases and a stroke along the last of
 *                   the mass (see the face below). The terrain shader paints a
 *                   globe and this is not a globe; without it a marble's disc
 *                   comes out one flat tone with a chewed edge, which is a
 *                   stone-coloured pebble and not a cratered rock.
 *   the frame       A closer shot (a larger `orbit.fill`), made possible by
 *                   that same sink: the body's own average radius is under R,
 *                   so a fuller frame still holds the whole lump, and the
 *                   paper's tooth is magnified into the rock's grain.
 *   the company     One chip of a satellite in the sky beside it — the same
 *                   stone in two pieces, knocked out of the same sack as the
 *                   rubble on the ground and painted with the same washes — hung
 *                   on whichever corner of the crop the light rakes across, a
 *                   little off that corner's diagonal by the week's own seed. A
 *                   body with something small beside it is the shortest scale bar
 *                   there is, and on a week this small the pair of them reads as
 *                   a rock and its chip rather than a planet and its moon.
 *                   Failing that, the sheet itself: the ground is laid dry and
 *                   stony enough that the paper's grain is part of the rock (see
 *                   the palette).
 *
 * The ground underneath is still the week's own — the world's terrain, its
 * sites, its activities, repainted as stone — because a marble is a week and
 * not a template; the face is a drawing laid over that ground and not a coat of
 * paint on it, so the week's own washes are what it is drawn on and what shows
 * through every part of it the sun has not left. What the body adds to the
 * ground is the shape of a rock, the light of one and the hand of one: no sea
 * anywhere (climate.oceanFrac 0), no green, no weather, hard shadows, and a
 * deep airless sky.
 *
 * Landing is untouched by all of it. The shape hook is a pure height, so the
 * ground patch samples it exactly as it samples any world's, and the feet meet
 * the surface wherever the surface is. The deformation is low-order and gentle
 * on purpose — an ellipsoid, two broad dishes and domes, never a ridge — so the
 * slopes the runner walks near the spawn are hill-walkable: the steepest ground
 * on the body is a crater wall, and a crater wall is a thing one walks down.
 * The face is a drawing of a disc seen from far off and lets go of the rock as
 * the camera comes down, so the ground the runner stands on is the week's own.
 */
import { P } from '../params.js';

const RAD = Math.PI / 180;
const R_PLANET = 120; // base.js's R, for the hooks that are handed no R of their own
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mix = (a, b, t) => a + (b - a) * t;
const num = (v) => (Number.isFinite(v) ? v : 0);
const smooth = (t) => t * t * (3 - 2 * t);
const sstep = (a, b, x) => smooth(clamp((x - a) / (b - a), 0, 1));
const MIX = (a, b, t) => a.clone().lerp(b, t);

// how the poster is framed: base.js's own fill for this body, and the crop the
// shelf takes, kept here because the companions hook is called with no framing
const MARBLE_FILL = 0.76;
const POSTER_CROP = 0.8;   // apps/planet-home/lib/paint.js cuts the central 80%
const CRAFT_FRAME_FILL = 0.86 * POSTER_CROP;
const COMPANION_REACH = 1.45;

/* ---------------------------------------------------------------- the fit -- */

// A small week: under three and a half hours on the clock, or no more than
// three sessions in it as long as they stay under five hours. An hour of yoga
// and a single long walk are both small weeks; three sessions that ran a
// marathon's worth of miles are not.
const SMALL_HOURS = 3.5;
const SMALL_COUNT = 3;
const SMALL_COUNT_HOURS = 5;
// What is *not* a marble: a week that barely happened at all. Under forty
// minutes on the clock, or a single session that was almost nothing, is a week
// that fell in on itself, and the black hole is the body that answers for it —
// so the fit runs down to zero here instead of climbing, and `auto` never has
// to choose between two bodies for the emptiest week of a year.
const DEAD_HOURS = 0.6;
const DEAD_COUNT = 1;
const FIT_BASE = 0.93;
const FIT_LEAD = 0.05;

/** The week measured against the trigger, or null when it is not a small one.
 *  `lived` is how far past the black hole's floor it still is (0 at nothing at
 *  all), and `tininess` how far under the ceiling — 1 on the emptiest week a
 *  marble can have, 0 at the edge of the class, where a marble is round. */
function smallOf(stats) {
  const hours = Math.max(0, num(stats?.hours));
  const count = Math.max(0, Math.round(num(stats?.count)));
  if (!(hours <= SMALL_HOURS || (count <= SMALL_COUNT && hours <= SMALL_COUNT_HOURS))) return null;
  const lived = clamp(Math.max((hours - DEAD_HOURS) / 0.9, count - DEAD_COUNT), 0, 1);
  if (!(lived > 0)) return null;
  const tininess = clamp(Math.max(
    (SMALL_HOURS - hours) / SMALL_HOURS,
    (SMALL_COUNT + 1 - count) / (SMALL_COUNT + 1),
  ), 0, 1);
  return { hours, count, lived, tininess };
}

/** How much of a potato the week is: the trigger's own reading, or — for a week
 *  the body was asked for by hand, whatever its size — how far under the ceiling
 *  it would have sat. A marathon week forced to a marble is round. */
function tinyOf(stats) {
  const small = smallOf(stats);
  if (small) return small.tininess;
  const hours = Math.max(0, num(stats?.hours));
  const count = Math.max(0, Math.round(num(stats?.count)));
  return clamp(Math.max(
    (SMALL_HOURS - hours) / SMALL_HOURS,
    (SMALL_COUNT + 1 - count) / (SMALL_COUNT + 1),
  ), 0, 1);
}

/* --------------------------------------------------------------- the shape -- */

// The lump itself. Three unequal axes is the shape every small body in the sky
// actually has — Eros, Phobos and Ryugu are each one rock pulled out along an
// axis, and not one of them is a ball — and it is also the cheapest honest way
// to say "not a planet" at the silhouette, which is the only place the poster
// has to say it.
//
// The axes are unequal the way a rock is unequal, which is to say by *loss*: the
// long axis is hollowed twice as far as the other two bulge, so the body is a
// ball with a great dish carved down one side of it and a shallow swell over the
// rest, and none of its lobes stands much over R. That is the honest shape (what
// a small body loses, it lost to an impact, and no lump this size grows a peak),
// and it is also what keeps the frame budget: base.js draws the poster's framing
// from R, so a widest lobe at R is a widest lobe that cannot be cut by the
// poster's crop, however close the shot is pulled in.
const POTATO_MIN = 3.5;   // the axes' spread on a merely small week, units
const POTATO_MAX = 9.5;   // ...and on a week that hardly happened
const POTATO_DEEP = 2.6;  // the long axis is hollowed well over twice as far as the others bulge
// The wobble, in two octaves: the first carries the body's own swell, the
// second the bays and headlands between them — which is what an outline needs
// to read as a rock rather than as a ball somebody sat on. Both together stay
// inside the frame budget of the sink below.
const WOBBLE = 0.50;      // the slow noise laid over the ellipsoid, of the spread
const WOBBLE_FINE = 0.78; // ...and the octave under it, which is the one that chews the limb
const WOBBLE_CHEW = 0.34; // ...and a third under that, the chips along the edge
const POTATO_FREQ = 1.55; // its cells: two or three across the globe
const CHEW_FREQ = 4.6;    // the mid octave's: eight or ten round the body
const CHEW_FINE = 9.4;    // and the last one's
// One great bite out of the potato. A lump of three axes on its own is still a
// shape a geometer drew; a lump with a bite out of it is a rock. The bite is a
// dish with a flat floor and a ridge thrown up round its rim, at the scale of
// half the body, so it is read from orbit as the form of the thing and not as a
// crater on it. Deeper and it would be a hole rather than a body — and it is cut
// on every week, from the merely small to the emptiest, because one broad
// irregularity on the limb is what tells the poster this is a rock at all.
const BITE_MIN = 5.0;
const BITE_MAX = 10.5;
const BITE_R_MIN = 0.62;  // its angular radius, radians
const BITE_R_MAX = 0.94;
const BITE_RIM = 0.22;    // the ridge its edge throws up, of its depth
const BITE_FLOOR = 0.44;  // its floor: flat this far out, then the wall climbs
const BITE_LIPW = 0.17;   // the rim's width, of the radius
// ...and a second one, smaller and a hundred and thirty degrees round from the
// first. Two great dishes on one rock is the shape the eye already knows from
// every ploughshare and every potato: one bite reads as a hollow, two bites at
// an angle to each other read as a body — the swell between them is a ridge,
// the hollows are where the mass went, and the silhouette has a waist, which is
// the one thing no amount of lumpiness on a single axis ever draws.
const BITE2_DEPTH = 1.55;  // of the first bite's depth: it is the deep one
const BITE2_RADIUS = 0.44; // of the first bite's radius: and the narrow one
const BITE2_TURN = 2.35;   // where it stands round the first, radians (135°)
const BITE2_RIM = 0.17;
const BITE2_FLOOR = 0.34;
const BITE2_LIPW = 0.15;
// The whole body sits this far inside R on a mean reading, and the week's own
// ground is fitted into the same budget: whatever the world drew above CEIL is
// eased down (KNEE of the excess survives) before the potato is laid over it, so
// a marble is a marble — a small body's own relief is limited by its own weak
// gravity and by the strength of the rock, and a moon's rims or a continent's
// mountains do not stand on it as they would on a planet. Between them the sink
// and the ceiling are what buy the closer frame: the widest lobe of the whole
// body reaches R and no further, so the shot can be pulled in until the lump's
// own silhouette is nearly touching the poster's edges — and every part of the
// shape that is added above is paid for here, so the lobe still reaches R and
// no further however hard the lump is pushed.
const SINK_MIN = 8.0;
const SINK_MAX = 18.0;
const CEIL = 2.0;   // units of its own ground a marble's surface may stand over R
const KNEE = 0.35;  // how much of the excess above that survives the easing

// The bowls on top of it, at the scale the shader can read a globe's form at
// all: the survey it reads that form from is sampled on a step of some thirty
// units at the poster's distance (TERRAIN_FRAG, ink.js), so a bowl has to be
// most of that wide before its wall reads as steep rather than as a smudge.
// Twelve to thirty-two units of radius is where a marble's craters live — a
// third of the way across the disc, the way the Moon's own large craters are
// against the Moon.
const BASIN_COUNT = 3;
const BASIN_R_MIN = 28;
const BASIN_R_MAX = 38;
const CRATER_COUNT = 44;
const CRATER_R_MIN = 7;
const CRATER_R_MAX = 17;
const CRATER_CLEAR = 1.06; // two bowls never overlap: two arcs inside one another read as a drawn circle, never as two holes
// Deep bowls. A crater's wall is the only place on a marble where the ground
// turns far enough from the light for the shader to draw anything but the
// week's wash on it — the ink of the creases and the paper the brush left on
// its crests are read off the survey's own slope, and a shallow bowl is a
// smudge in the survey rather than a mark on the sheet. The ratio is what the
// wall's own steepness is, so it is set where a wall reads, and the floor stays
// wide enough to stand in: the runner's own doorstep is kept clear of them all
// (DOORSTEP), so nothing here has to be walked up.
const DEPTH_OF = 0.50;
const DEPTH_MIN = 5.0;
const DEPTH_MAX = 12.0;
const LIP_OF = 0.18;
const LIP_MIN = 2.2;
const LIP_MAX = 4.4;
const CRATER_REACH = 1.12; // in radii: past this a bowl has no say at all
const FLOOR_T = 0.42;
const LIP_W = 0.15;
// The outcrops: the boulders the rock is made of, standing out of it. They are
// what makes the limb rugged where no bowl happens to lie on it — a lump the
// tenth of the body across, the size of the great boulders that stand on
// Phobos — and on foot they are the rocks a runner steps around. The field is
// seeded; the week's own sites each stand one too, the day's own rock, left
// where the day was.
const OUTCROP_COUNT = 12;
const OUTCROP_R_MIN = 6.0;
const OUTCROP_R_MAX = 13.0;
const OUTCROP_H_MIN = 2.6;
const OUTCROP_H_MAX = 6.4;
const OUTCROP_SITE_R = 4.5;
const OUTCROP_SITE_H = 0.5;
const OUTCROP_REACH = 1.06; // in radii: past this a dome has no say at all
// The fine octaves are let down round the doorstep. They are what chews the
// limb, and on the limb they cost nothing — but the same noise runs over the
// ground the runner lands on, and a slope is a slope whether it is walked or
// drawn. Inside the doorstep the body is smooth and walkable; outside it, it is
// a rock. The two radii are in units, as chords on the sphere.
const DOORSTEP_FLAT = 10;
const DOORSTEP_SOFT = 30;
// the walkable doorstep the body keeps round the landing site, units: a bowl's
// whole wall stands this far clear of it
const DOORSTEP = 14;

// One field per readWeek. The week's own terrain context is the key, so the
// potato is built on the first vertex that asks and read back — as flat arrays,
// with no property lookups — by the two hundred thousand that follow (the
// survey bake, the orbit mesh, every ground patch rebuild).
const FIELDS = new WeakMap();

function buildField(ctx) {
  const tiny = tinyOf(ctx.stats);
  const rng = ctx.rng('marble/shape');
  const R = num(ctx.R) || R_PLANET;
  // The direction the poster is framed from, as far as the shape is concerned:
  // the week's own subject — the activities it left, weighted by the time spent
  // on each, which is what base.js aims its camera with. The aim the camera
  // finally takes is that subject turned sixteen degrees toward the sun, so this
  // is the view to within a fifth of a right angle — near enough to decide which
  // face of a lump the poster sees.
  let vx = 0, vy = 0, vz = 0;
  for (const place of ctx.placed || []) {
    const dir = place?.dir;
    if (!dir) continue;
    const weight = Math.max(900, 3600 * Math.max(0, num(place.hours)));
    vx += dir.x * weight; vy += dir.y * weight; vz += dir.z * weight;
  }
  let vlen = Math.hypot(vx, vy, vz);
  if (!(vlen > 1e-6)) {
    const first = ctx.placed?.[0]?.dir;
    vx = first ? first.x : 1; vy = first ? first.y : 0; vz = first ? first.z : 0;
    vlen = Math.hypot(vx, vy, vz) || 1;
  }
  const view = [vx / vlen, vy / vlen, vz / vlen];
  // the triad the lump is cut on, read against that view. The hollow axis is
  // laid *across* the view, at a bearing of the week's own drawing, so a lump
  // that is a deep dish down one side always shows its dish on the limb and
  // never presents the camera a circle; the other two axes, which are the two
  // that bulge, are the view itself and the tangent beside it. A body whose
  // longest axis happened to point at the camera would be drawn as a ball, which
  // is the one thing this body exists not to be.
  const ref = Math.abs(view[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  let t1 = [
    view[1] * ref[2] - view[2] * ref[1],
    view[2] * ref[0] - view[0] * ref[2],
    view[0] * ref[1] - view[1] * ref[0],
  ];
  const t1l = Math.hypot(t1[0], t1[1], t1[2]) || 1;
  t1 = [t1[0] / t1l, t1[1] / t1l, t1[2] / t1l];
  const t2 = [
    view[1] * t1[2] - view[2] * t1[1],
    view[2] * t1[0] - view[0] * t1[2],
    view[0] * t1[1] - view[1] * t1[0],
  ];
  const bearing = rng() * Math.PI * 2;
  const cb = Math.cos(bearing), sb = Math.sin(bearing);
  const axis = [t1[0] * cb + t2[0] * sb, t1[1] * cb + t2[1] * sb, t1[2] * cb + t2[2] * sb];
  const second = view;
  const third = [
    axis[1] * second[2] - axis[2] * second[1],
    axis[2] * second[0] - axis[0] * second[2],
    axis[0] * second[1] - axis[1] * second[0],
  ];
  const spread = mix(POTATO_MIN, POTATO_MAX, tiny);
  // ...and the bite, on the axis the potato is hollowed along, so the dish the
  // axes carved and the dish the impact carved are the one great feature of the
  // body rather than two marks beside each other
  const bite = [axis[0], axis[1], axis[2]];
  const biteDepth = mix(BITE_MIN, BITE_MAX, tiny);
  const biteRadius = mix(BITE_R_MIN, BITE_R_MAX, rng());
  // the second bite, round from the first on the same circle of bearings: an
  // angle in the tangent plane, so the two dishes never merge into one hollow
  const turn = BITE2_TURN + (rng() - 0.5) * 0.5;
  const cb2 = Math.cos(turn), sb2 = Math.sin(turn);
  const bite2 = [
    t1[0] * cb2 + t2[0] * sb2,
    t1[1] * cb2 + t2[1] * sb2,
    t1[2] * cb2 + t2[2] * sb2,
  ];
  const bite2Depth = biteDepth * BITE2_DEPTH;
  const bite2Radius = biteRadius * BITE2_RADIUS;
  // the wobble's own corner of the week's noise field
  const nx = rng() * 40 - 20, ny = rng() * 40 - 20, nz = rng() * 40 - 20;

  const dirs = [], radii = [];
  // The week's own doorstep. A week with no monument lands at the prime
  // meridian's first degree (base.js's spawn), and a race week lands a few paces
  // down-course of its finish; either way the runner's first steps are on one
  // small piece of the body, and a bowl's wall underfoot is the one slope on a
  // marble that is not a walk. The bowls and the seeded domes therefore stand
  // back from it — the whole of a bowl, wall and rim both — while the *sites*
  // keep their own rocks, because those are where the week went and not where
  // the camera came down.
  const race = (ctx.placed || []).find((place) => place?.isRace && place.dir);
  const doorstep = race ? [race.dir.x, race.dir.y, race.dir.z] : [1, 0, 0];
  const clear = (x, y, z, reach) => {
    const dot = x * doorstep[0] + y * doorstep[1] + z * doorstep[2];
    const chord = 2 * (1 - clamp(dot, -1, 1));
    return chord > ((reach + DOORSTEP) / R) ** 2;
  };
  const claim = (x, y, z, radius) => {
    if (!clear(x, y, z, radius)) return;
    for (let k = 0; k < radii.length; k++) {
      const gap = (radius + radii[k]) * CRATER_CLEAR / R;
      const dx = x - dirs[k * 3], dy = y - dirs[k * 3 + 1], dz = z - dirs[k * 3 + 2];
      if (dx * dx + dy * dy + dz * dz < gap * gap) return;
    }
    dirs.push(x, y, z);
    radii.push(radius);
  };
  // the body's own two old basins first, on a short spiral of their own, so no
  // later bowl can crowd them out: every marble, however empty the week, is a
  // rock with two great marks on it
  for (let i = 0; i < BASIN_COUNT; i++) {
    const y = 1 - (2 * (i + 0.5)) / BASIN_COUNT;
    const a = i * GOLDEN * 1.7 + rng() * 0.8;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    claim(Math.cos(a) * r, y, Math.sin(a) * r, BASIN_R_MIN + (BASIN_R_MAX - BASIN_R_MIN) * rng());
  }
  // then the field, spread by the golden spiral and jittered off it so the
  // spread never reads as a lattice
  for (let i = 0; i < CRATER_COUNT; i++) {
    const y = 1 - (2 * (i + 0.5) + (rng() - 0.5) * 1.7) / CRATER_COUNT;
    const a = i * GOLDEN + rng() * 0.8;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    claim(Math.cos(a) * r, y, Math.sin(a) * r, CRATER_R_MIN + (CRATER_R_MAX - CRATER_R_MIN) * rng() ** 2);
  }
  const n = radii.length;
  const bx = new Float64Array(n), by = new Float64Array(n), bz = new Float64Array(n);
  const binv = new Float64Array(n), bgate = new Float64Array(n);
  const depth = new Float64Array(n), lip = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const radius = radii[i];
    bx[i] = dirs[i * 3]; by[i] = dirs[i * 3 + 1]; bz[i] = dirs[i * 3 + 2];
    binv[i] = R / radius;
    bgate[i] = (CRATER_REACH * radius / R) ** 2;
    depth[i] = clamp(radius * DEPTH_OF, DEPTH_MIN, DEPTH_MAX);
    lip[i] = clamp(radius * LIP_OF, LIP_MIN, LIP_MAX);
  }

  // the outcrops: one on each of the week's own sites, then a field of them
  // over the rest of the body, so no face of the rock is left smooth
  const ox = [], oy = [], oz = [], oh = [], orad = [];
  const stand = (x, y, z, radius, height) => {
    ox.push(x); oy.push(y); oz.push(z); oh.push(height); orad.push(radius);
  };
  for (const place of ctx.placed || []) {
    const dir = place?.dir;
    if (!dir) continue;
    const hours = Math.max(0, num(place.hours));
    const radius = OUTCROP_SITE_R + 0.6 * hours;
    stand(dir.x, dir.y, dir.z, radius, OUTCROP_SITE_H * radius);
  }
  for (let i = 0; i < OUTCROP_COUNT; i++) {
    const y = 1 - (2 * (i + 0.5) + (rng() - 0.5) * 1.5) / OUTCROP_COUNT;
    const a = i * GOLDEN + 2.1 + rng() * 0.8;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const radius = mix(OUTCROP_R_MIN, OUTCROP_R_MAX, rng());
    const height = mix(OUTCROP_H_MIN, OUTCROP_H_MAX, rng());
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    if (!clear(cx, y, cz, radius)) continue;
    stand(cx, y, cz, radius, height);
  }

  return {
    ax: new Float64Array([axis[0], axis[1], axis[2], second[0], second[1], second[2], third[0], third[1], third[2]]),
    w1: -POTATO_DEEP * spread, w2: spread, w3: spread,
    wob: WOBBLE * spread, wobFine: WOBBLE_FINE * spread, wobChew: WOBBLE_CHEW * spread, nx, ny, nz,
    bite: new Float64Array(bite), biteDepth, biteInv: 1 / biteRadius,
    biteGate: 2 * (1 - Math.cos(BITE_R_MAX * 1.3)),
    bite2: new Float64Array(bite2), bite2Depth, bite2Inv: 1 / bite2Radius,
    bite2Gate: 2 * (1 - Math.cos(BITE_R_MAX * BITE2_RADIUS * 1.3)),
    sink: -mix(SINK_MIN, SINK_MAX, tiny),
    door: new Float64Array(doorstep),
    doorNear: (DOORSTEP_FLAT / R) ** 2, doorFar: (DOORSTEP_SOFT / R) ** 2,
    n, bx, by, bz, binv, bgate, depth, lip,
    m: ox.length,
    ox: Float64Array.from(ox), oy: Float64Array.from(oy), oz: Float64Array.from(oz),
    oh: Float64Array.from(oh),
    oinv: Float64Array.from(orad, (radius) => R / radius),
    // the chord gate: a dome's own reach, squared, so a vertex outside it is a
    // compare and a continue
    ogate: Float64Array.from(orad, (radius) => (OUTCROP_REACH * radius / R) ** 2),
  };
}

function fieldOf(ctx) {
  let field = FIELDS.get(ctx);
  if (!field) { field = buildField(ctx); FIELDS.set(ctx, field); }
  return field;
}

/* ------------------------------------------------------------- the objects -- */

// The rubble the body is made of, standing on the ground it came off. It is
// strewn where the week went — a scatter round every site, and one round the
// spawn — because that is where a runner's eye is: on foot the rocks he passes
// close to are the ones that give his own size away, and the poster never sees
// them at all (they are hidden from orbit, where a two-unit rock is a dot of
// noise and the shape is saying the same thing better).
const SITE_ROCKS = 15;   // rocks strewn round each of the week's own sites
const SITE_BIG = 2;      // ...and the big ones among them
const SITE_REACH = 26;   // how far off the site they lie, units
const ROCK_MIN = 0.42;
const ROCK_MAX = 1.85;
const BIG_MIN = 2.4;
const BIG_MAX = 4.0;
// Where the rubble is *not*. A rock is a small thing on a big body and it is
// scattered by the week's own noise, but the camera comes down at the spawn and
// the runner's first steps are on the ground around it, and the poster's
// landing shot is composed from behind his shoulder: a four-unit boulder there
// is a boulder across the picture, standing between the camera and the runner,
// and the terrain's own landing clearance cannot know about it — it samples the
// height field, and this rock is not in it. So the field keeps out of the
// runner's own doorstep, and out of the last of the course on a race week, and
// what does stand within sight of the spawn is a stone and not a slab.
const SPAWN_CLEAR = 8;    // units round the landing that no rock stands in
const COURSE_CLEAR = 5;   // ...and the corridor kept along the last of the course
const COURSE_TAIL = 12;   // how much of the course's end is kept clear, units
const NEAR_SPAWN = 30;    // inside this, the big rocks are let down to stone size
// The shape every rock in the field is cut from: twelve corners, knocked about
// so no two faces are the same plane, squashed a little — a boulder sits on the
// ground rather than balancing on one point of it.
const KNOCK_MIN = 0.8;
const KNOCK_RANGE = 0.36;
const FLATTEN = 0.78;

/** One merged, painted field of rubble: every rock in the week's own scatter as
 *  one geometry and one draw call. The facets are per-face normals on purpose —
 *  one flat wash to a face is the whole of the wash material's look, and a rock
 *  is the object that look was invented for. */
function rubbleField(shared) {
  const { THREE: T, features, uniforms, palette: pal, washMaterial } = shared;
  const R = num(shared.R) || R_PLANET;
  const rng = features.makeRng('marble/rubble');
  // the week's own ground: every site it left a feature on, and the spawn. Two
  // features on one site are one scatter.
  const spots = [];
  const seen = new Set();
  const consider = (dir) => {
    if (!dir) return;
    const key = `${dir.x.toFixed(4)}/${dir.y.toFixed(4)}/${dir.z.toFixed(4)}`;
    if (seen.has(key)) return;
    seen.add(key);
    spots.push(dir.clone());
  };
  for (const f of features.list || []) consider(f?.dir);
  consider(features.spawn);
  if (!spots.length) return null;

  const core = new T.IcosahedronGeometry(1, 0);
  const coreP = core.attributes.position;
  const verts = coreP.count;
  const perSite = SITE_ROCKS + SITE_BIG;
  const positions = new Float32Array(spots.length * perSite * verts * 3);
  const normals = new Float32Array(spots.length * perSite * verts * 3);
  const scratch = new T.Vector3();
  const ref = new T.Vector3();
  const east = new T.Vector3();
  const north = new T.Vector3();
  const up = new T.Vector3();
  const dir = new T.Vector3();
  const rock = new Float64Array(verts * 3);
  let at = 0;

  const seat = (centre, size, seed) => {
    // the rock's own frame: its axis is the ground's own normal, so a boulder on
    // a slope leans with the slope instead of standing plumb in it
    ref.set(Math.abs(centre.y) > 0.9 ? 1 : 0, Math.abs(centre.y) > 0.9 ? 0 : 1, 0);
    east.crossVectors(centre, ref).normalize();
    north.crossVectors(east, centre).normalize();
    const reach = 2.0;
    const step = reach / R;
    const hE = features.heightAt(scratch.copy(centre).addScaledVector(east, step));
    const hW = features.heightAt(scratch.copy(centre).addScaledVector(east, -step));
    const hN = features.heightAt(scratch.copy(centre).addScaledVector(north, step));
    const hS = features.heightAt(scratch.copy(centre).addScaledVector(north, -step));
    up.copy(centre)
      .addScaledVector(east, -(hE - hW) / (2 * reach))
      .addScaledVector(north, -(hN - hS) / (2 * reach))
      .normalize();
    // its own turn about that axis, and one shared knock so the corners stay
    // closed: the same corner gets the same knock every time
    const spin = rng() * Math.PI * 2;
    const ca = Math.cos(spin), sa = Math.sin(spin);
    const ex = east.x * ca + north.x * sa, ey = east.y * ca + north.y * sa, ez = east.z * ca + north.z * sa;
    const fx = north.x * ca - east.x * sa, fy = north.y * ca - east.y * sa, fz = north.z * ca - east.z * sa;
    for (let i = 0; i < verts; i++) {
      const px = coreP.getX(i), py = coreP.getY(i), pz = coreP.getZ(i);
      const knock = Math.sin(px * 91.7 + py * 57.3 + pz * 33.1 + seed * 7.1) * 43758.5453;
      const s = KNOCK_MIN + KNOCK_RANGE * (knock - Math.floor(knock));
      const vx = px * s, vy = py * s * FLATTEN, vz = pz * s;
      rock[i * 3] = (ex * vx + fx * vy + up.x * vz) * size;
      rock[i * 3 + 1] = (ey * vx + fy * vy + up.y * vz) * size;
      rock[i * 3 + 2] = (ez * vx + fz * vy + up.z * vz) * size;
    }
    // set down on the ground there, its base just into the surface
    const lift = R + features.heightAt(centre) + size * FLATTEN * 0.6;
    const cx = centre.x * lift, cy = centre.y * lift, cz = centre.z * lift;
    for (let i = 0; i < verts; i += 3) {
      const a = i * 3, b = a + 3, c = a + 6;
      const ax = rock[a] + cx, ay = rock[a + 1] + cy, az = rock[a + 2] + cz;
      const bx = rock[b] + cx, by = rock[b + 1] + cy, bz = rock[b + 2] + cz;
      const dx = rock[c] + cx, dy = rock[c + 1] + cy, dz = rock[c + 2] + cz;
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = dx - ax, vy = dy - ay, vz = dz - az;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      const w = at * 3;
      positions[w] = ax; positions[w + 1] = ay; positions[w + 2] = az;
      positions[w + 3] = bx; positions[w + 4] = by; positions[w + 5] = bz;
      positions[w + 6] = dx; positions[w + 7] = dy; positions[w + 8] = dz;
      normals[w] = nx; normals[w + 1] = ny; normals[w + 2] = nz;
      normals[w + 3] = nx; normals[w + 4] = ny; normals[w + 5] = nz;
      normals[w + 6] = nx; normals[w + 7] = ny; normals[w + 8] = nz;
      at += 3;
    }
  };

  // What the rubble keeps out of: the runner's own doorstep, and the last of a
  // race's course. Both are read as chord distances in units and both are the
  // same test — the angle between two unit directions, squared, against a
  // radius over R — so a candidate is a compare and a continue.
  const spawn = features.spawn || null;
  const route = features.race || null;
  const seg = route?.seg || null;
  const cum = route?.cum || null;
  const total = num(route?.total);
  const tail = [];
  if (seg && cum && cum.length > 1) {
    for (let i = cum.length - 1; i >= 0; i--) {
      if (total - cum[i] > COURSE_TAIL) break;
      tail.push([seg[i * 3], seg[i * 3 + 1], seg[i * 3 + 2]]);
    }
  }
  const tooClose = (dir, clear) => {
    const reach = (clear / R) ** 2;
    const chord = (x, y, z) => {
      const dx = dir.x - x, dy = dir.y - y, dz = dir.z - z;
      return dx * dx + dy * dy + dz * dz;
    };
    if (spawn && chord(spawn.x, spawn.y, spawn.z) < reach) return true;
    for (let i = 0; i < tail.length; i++) {
      const t = tail[i];
      if (chord(t[0], t[1], t[2]) < reach) return true;
    }
    return false;
  };

  for (const spot of spots) {
    ref.set(Math.abs(spot.y) > 0.9 ? 1 : 0, Math.abs(spot.y) > 0.9 ? 0 : 1, 0);
    east.crossVectors(spot, ref).normalize();
    north.crossVectors(east, spot).normalize();
    for (let i = 0; i < perSite; i++) {
      const big = i >= SITE_ROCKS;
      const from = big ? SITE_REACH * (0.25 + 0.5 * rng()) : SITE_REACH * (0.12 + 0.88 * rng() ** 0.7);
      const angle = rng() * Math.PI * 2;
      dir.copy(spot)
        .addScaledVector(east, Math.cos(angle) * from / R)
        .addScaledVector(north, Math.sin(angle) * from / R)
        .normalize();
      const roll = rng();
      if (tooClose(dir, SPAWN_CLEAR) || tooClose(dir, COURSE_CLEAR)) continue;
      // near the landing the field is stones and not slabs: a boulder is a
      // thing the eye reads the runner against, and at four units it reads as
      // a wall between him and the camera
      const shrink = tooClose(dir, NEAR_SPAWN) ? 0.45 : 1;
      const size = (big ? mix(BIG_MIN, BIG_MAX, roll) : mix(ROCK_MIN, ROCK_MAX, roll ** 1.6)) * shrink;
      seat(dir, size, rng() * 10);
    }
  }
  core.dispose();

  const geo = new T.BufferGeometry();
  // the rocks the clearances sent back left their room in the buffer: only what
  // was actually seated is handed to the geometry
  const used = at * 3;
  geo.setAttribute('position', new T.BufferAttribute(positions.subarray(0, used), 3));
  geo.setAttribute('normal', new T.BufferAttribute(normals.subarray(0, used), 3));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  const mat = washMaterial(T, uniforms, pal, geo, {
    lit: MIX(MIX(pal.stone, pal.sepia, 0.34), pal.litWarm, 0.12),
    shade: MIX(pal.shadeCool, pal.ink, 0.42),
    ink: pal.ink,
    paper: pal.paper,
    sky: MIX(pal.stone, pal.paper, 0.34),
    rag: 0.24,
    grain: 1.3,
    inkLine: 0.75,
    top: 0,     // a boulder is not a monument: no pale cap on it and no pooling at its foot
    skyTop: 0,
    dry: 0,
    base: 0,
    seed: 3.7,
  });
  const mesh = new T.Mesh(geo, mat);
  mesh.name = 'marble-rubble';
  mesh.frustumCulled = false;
  return mesh;
}

/* ----------------------------------------------------------- the satellite -- */

// One pebble of a satellite, hung in the sky beside the body. A moon is the
// oldest scale bar there is — the eye knows how big a moon is — so a moon the
// size of a thumbnail on a disc the size of the poster says the disc is a rock
// and not a world.
//
// Where it hangs is a screen position, not an angle: the poster's camera stands
// under four R out while the pebble stands one and a half out, so a direction a
// comfortable twenty degrees off the eye puts it a long way out of frame. The
// direction is therefore solved for, off the apparent edge of the disc: the
// globe's limb shows from the camera at a tangent of 1/root(cd² − 1) (cd the
// camera's distance in R), and the pebble's centre is put a fifth again past it,
// on the arc of bearings the square crop leaves it (see `pebble` below).
const PEBBLE_R_MIN = 0.050; // the pebble's radius, in R: a chip of the same rock
const PEBBLE_R_MAX = 0.068;
const PEBBLE_D = 1.45;    // its distance from the centre, in R
const PEBBLE_PAST = 1.07; // how far past the limb's tangent its centre is put
const PEBBLE_INSET = 0.97; // ...of the crop it must stay inside, disc and all
const CORNER = Math.SQRT1_2; // how far out a corner of the crop is, either tangent
const POSTER_OFF = 0.28;  // how far base.js turns an ordinary week's aim toward the sun
const RACE_POSTER_OFF = 0.6; // ...and a race's, which leans further

/** The subject the poster is framed on, as a unit vector: the race's midcourse,
 *  the finish monument, or the week's activities weighted by time (base.js's
 *  posterSubject), aimed the other way on a race week — the race is the red
 *  stroke on the far rim. */
function posterSubject(features, sun) {
  const race = features?.race;
  let x = 0, y = 0, z = 0;
  if (race && race.seg?.length >= 6 && race.cum?.length > 1) {
    const half = race.total * 0.5;
    let i = 1;
    while (i < race.cum.length - 1 && race.cum[i] < half) i++;
    const t = (half - race.cum[i - 1]) / Math.max(1e-6, race.cum[i] - race.cum[i - 1]);
    const a = (i - 1) * 3, b = i * 3;
    x = mix(race.seg[a], race.seg[b], t);
    y = mix(race.seg[a + 1], race.seg[b + 1], t);
    z = mix(race.seg[a + 2], race.seg[b + 2], t);
  } else if (features?.monument?.dir) {
    const dir = features.monument.dir;
    x = dir.x; y = dir.y; z = dir.z;
  } else {
    for (const f of features?.list || []) {
      if (f.kind === 'monument' || !f.dir) continue;
      const seconds = Number(f.stats?.activeS);
      const weight = Number.isFinite(seconds) ? Math.max(900, seconds) : 900;
      x += f.dir.x * weight; y += f.dir.y * weight; z += f.dir.z * weight;
    }
  }
  let len = Math.hypot(x, y, z);
  if (!(len > 1e-6)) {
    const first = features?.list?.[0]?.dir;
    x = first ? first.x : sun.x; y = first ? first.y : sun.y; z = first ? first.z : sun.z;
    len = Math.hypot(x, y, z) || 1;
  }
  const flip = race || features?.monument ? -1 : 1;
  return [flip * x / len, flip * y / len, flip * z / len];
}

/** `subject` turned toward the sun: base.js's turnToSun, by POSTER_OFF (by the
 *  race's own lean on a race week). */
function turnToSun(subject, sun, off) {
  const dot = subject[0] * sun[0] + subject[1] * sun[1] + subject[2] * sun[2];
  const fx = sun[0] - subject[0] * dot, fy = sun[1] - subject[1] * dot, fz = sun[2] - subject[2] * dot;
  const flen = Math.hypot(fx, fy, fz);
  if (!(flen > 1e-9)) return subject;
  const k = off / flen;
  const x = subject[0] + fx * k, y = subject[1] + fy * k, z = subject[2] + fz * k;
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

/** The week's own sun, recovered from the light the poster is painted with.
 *  From orbit the painted light is not the sun: ink.js turns the sun toward the
 *  eye by POSTER_OFF, in the sun's own plane about the eye — and the eye is the
 *  week's subject turned toward the sun by POSTER_OFF in the first place. So the
 *  sun is the light turned back the same way, and the eye it was turned toward
 *  is the aim, which the sun decides: two passes settle the pair of them. */
function posterSun(light, subject, off) {
  let sx = light.x, sy = light.y, sz = light.z;
  for (let pass = 0; pass < 2; pass++) {
    const aim = turnToSun(subject, [sx, sy, sz], off);
    // the axis of ink.js's own turn — the eye crossed with the sun, in the plane
    // the light never left — and the light carried back along it
    let ax = aim[1] * light.z - aim[2] * light.y;
    let ay = aim[2] * light.x - aim[0] * light.z;
    let az = aim[0] * light.y - aim[1] * light.x;
    const alen = Math.hypot(ax, ay, az);
    if (!(alen > 1e-9)) break;
    ax /= alen; ay /= alen; az /= alen;
    const c = Math.cos(off), s = Math.sin(off);
    const dot = ax * light.x + ay * light.y + az * light.z;
    const cx = ay * light.z - az * light.y, cy = az * light.x - ax * light.z, cz = ax * light.y - ay * light.x;
    sx = light.x * c + cx * s + ax * dot * (1 - c);
    sy = light.y * c + cy * s + ay * dot * (1 - c);
    sz = light.z * c + cz * s + az * dot * (1 - c);
  }
  return [sx, sy, sz];
}

/** One pebble of a satellite, placed for the poster's own frame. */
function pebble(ctx) {
  const light = ctx.uniforms?.uSunDir?.value;
  if (!light) return null;
  const subject = posterSubject(ctx.features, light);
  const race = Boolean(ctx.features?.race) || Boolean(ctx.features?.monument);
  const off = race ? RACE_POSTER_OFF : POSTER_OFF;
  const sun = posterSun(light, subject, off);
  // the direction the camera stands on, and the frame's own basis about it:
  // looking down the aim with +Y as its up, the right of the frame is Y × aim and
  // the top of it is aim × right
  const aim = turnToSun(subject, sun, off);
  let rx = aim[2], rz = -aim[0];
  let rlen = Math.hypot(rx, rz);
  if (!(rlen > 1e-6)) { rx = 1; rz = 0; rlen = 1; }
  rx /= rlen; rz /= rlen;
  const ux = aim[1] * rz, uy = aim[2] * rx - aim[0] * rz, uz = -aim[1] * rx;
  // where the camera stands, in R, and the tangent the disc's limb shows at from
  // there — the same framing base.js draws (posterBase), craft.frame and all
  const fovRad = num(P['camera.fov']) * RAD;
  const share = P['craft.frame'] ? Math.min(CRAFT_FRAME_FILL, MARBLE_FILL) : MARBLE_FILL;
  const want = share * Math.tan(fovRad / 2);
  const cd = P['craft.frame']
    ? COMPANION_REACH * Math.sqrt(1 + want * want) / want
    : 1 / Math.max(0.05, Math.sin(share * fovRad / 2));
  const limb = 1 / Math.sqrt(Math.max(1e-4, cd * cd - 1));
  const half = POSTER_CROP * Math.tan(fovRad / 2);   // the crop's half-side, in tangents
  // each week's pebble is its own chip: the week's own name draws its size, its
  // dents, and which corner of the sky it hangs in, so two marbles never wear the
  // same companion twice
  const seed = ctx.features?.makeRng ? ctx.features.makeRng('marble/pebble') : null;
  const size = seed ? mix(PEBBLE_R_MIN, PEBBLE_R_MAX, seed()) : PEBBLE_R_MAX;
  // Where it goes: the tangent of the chip's centre is what the crop has to hold,
  // so the seat and the angle that draws it are solved together. The ask is a
  // fifth again past the limb; the crop's own limit comes first, and it is the
  // *seated* tangent the angle must be drawn from — a limit computed and then
  // not used is no limit at all (the chip's radius has to be read at the seat,
  // and the seat at the radius: two passes settle them, and the second is
  // already inside the first by a tenth of the crop).
  const ask = PEBBLE_PAST * limb;                    // the tangent it asks to show at
  let seat = ask, phi = 0, cos = 0, sin = 0, dist = 1, rt = 0;
  for (let pass = 0; pass < 2; pass++) {
    const amplitude = Math.sqrt(1 + seat * seat);
    const ratio = clamp(seat * cd / PEBBLE_D / amplitude, -1, 1);
    phi = Math.asin(ratio) - Math.atan(seat);
    cos = Math.cos(phi); sin = Math.sin(phi);
    dist = Math.sqrt(Math.max(1e-6, cd * cd + PEBBLE_D * PEBBLE_D - 2 * cd * PEBBLE_D * cos));
    rt = size / dist;                                // the chip's own tangent radius
    // the furthest out that is safe on any bearing: the crop shows `half` at its
    // edge and the corners are 0.7071 of the way out, and the chip's own disc —
    // its knocked corners and its long axis both — has to fit inside what is left
    // 1.5 of its own tangent radius, because the chip is knocked out of a
    // longer rock than it is round: its corners stand half again as far out as
    // the sphere it was cut from. CORNER is the worst of the bearings the week
    // may take inside its own wander — a bearing off the diagonal pushes the
    // chip's coordinate along one axis of the crop further out than the corner
    // does, and the crop is a square.
    seat = Math.max(rt * 1.5 + limb * 1.06, Math.min(ask, (half * PEBBLE_INSET - rt * 1.5) / CORNER));
  }
  // Which corner. A disc that fills the sheet leaves its sky in the four corners
  // and nowhere else, and a chip hung in one of them has the whole square crop
  // between it and the edge — which is the only place on this poster where a
  // companion can stand at all. Which of the four is the sun's business: the one
  // it rakes across. A chip lit square on has no shadow on it and reads as a
  // coin; the same chip with the sun across it has a crescent, and a crescent is
  // what says stone.
  const sunRight = sun[0] * rx + sun[2] * rz;
  const sunUp = sun[0] * ux + sun[1] * uy + sun[2] * uz;
  const wants = Math.atan2(sunUp, sunRight) + Math.PI / 2;  // a quarter turn off the sun
  let bestAz = Math.PI / 4, bestCost = Infinity;
  for (let i = 0; i < 4; i++) {
    const az = Math.PI / 4 + i * Math.PI / 2;
    const cost = Math.abs(Math.cos(az - wants));
    if (cost < bestCost) { bestCost = cost; bestAz = az; }
  }
  const bearing = [Math.cos(bestAz), Math.sin(bestAz)];
  const dx = aim[0] * cos + (rx * bearing[0] + ux * bearing[1]) * sin;
  const dy = aim[1] * cos + (uy * bearing[1]) * sin;
  const dz = aim[2] * cos + (rz * bearing[0] + uz * bearing[1]) * sin;
  const dlen = Math.hypot(dx, dy, dz) || 1;
  const R = num(ctx.R) || R_PLANET;
  // The chip itself: a knocked icosahedron out of the same sack as the rubble,
  // so the body and its satellite are one stone in two pieces — the same
  // facets, the same washes, the same ink on the silhouette. The app's own
  // painted moon takes its dents from its seed and has no room for a shape,
  // and a shape is what a chip of rock is: a smooth ball beside a lumpy one
  // reads as a moon wherever it hangs.
  const T = ctx.THREE;
  if (!T) return null;
  const geo = new T.IcosahedronGeometry(1, 1);
  const core = geo.attributes.position;
  const spin = seed ? seed() * 6.283 : 1.7;
  for (let i = 0; i < core.count; i++) {
    const px = core.getX(i), py = core.getY(i), pz = core.getZ(i);
    const knock = Math.sin(px * 91.7 + py * 57.3 + pz * 33.1 + spin * 7.1) * 43758.5453;
    // the chip is knocked harder than a boulder is: at thirty pixels across,
    // a gentle knock is a circle, and a circle beside a lumpy rock reads as a
    // moon. Its facets are what give it a light side and a shade side even
    // when the poster's sun is square on it, which is where no bearing helps.
    const s = 0.60 + 0.58 * (knock - Math.floor(knock));
    core.setXYZ(i, px * s * 1.26, py * s * 0.70, pz * s);
  }
  geo.computeVertexNormals();
  const pal = ctx.palette;
  const mat = ctx.washMaterial(T, ctx.uniforms, pal, geo, {
    lit: MIX(MIX(pal.stone, pal.sepia, 0.30), pal.litWarm, 0.16),
    shade: MIX(pal.shadeCool, pal.ink, 0.52),
    ink: pal.ink,
    paper: pal.paper,
    sky: MIX(pal.stone, pal.paper, 0.30),
    rag: 0.40,
    grain: 1.25,
    inkLine: 0.78,
    top: 0,
    skyTop: 0,
    dry: 0,
    base: 0,
    seed: seed ? 1 + seed() * 8 : 5.13,
  });
  const chip = new T.Mesh(geo, mat);
  chip.name = 'marble-pebble';
  chip.position.set(
    (dx / dlen) * R * PEBBLE_D,
    (dy / dlen) * R * PEBBLE_D,
    (dz / dlen) * R * PEBBLE_D,
  );
  chip.scale.setScalar(R * size);
  chip.quaternion.setFromEuler(new T.Euler(seed ? seed() * 3.1 : 0.4, spin, seed ? seed() * 3.1 : 0.9));
  chip.frustumCulled = false;
  return chip;
}

/* -------------------------------------------------------- the rock's face -- */

// From orbit the ground is *painted*, and a painting is flat. The poster's light
// is turned toward the eye, so the terrain shader lays the whole lit face of a
// disc in one wash built from the palette's light family; the marks it can draw
// on that face — the ink it gathers in a crease, the paper it leaves on a crest
// — are read off a relief it samples thirty-four units at a time, which is a
// third of a marble, so on a body this size they come out as texture and never
// as form. Measure the result: the disc of a short week is one tone to within
// four parts in two hundred and fifty, across three quarters of its area, with
// an irregular edge around it. That is a stone-coloured pebble, not a cratered
// rock, and no amount of shape fixes it — depth was tried, density was tried,
// four times over, and the wash did not move.
//
// So the body draws its own face, the way every other body in this round draws
// its own sky: a shell laid a fraction of a unit over the ground it already has,
// carrying nothing but the *light* and the *ink* of the rock — the cool wash
// laid on every wall the sun has left, the sheet left dry on the crests it
// catches, the ink pooled where a crease turns away from it, and a stroke along
// the last of the mass. What the shell does *not* carry is any colour of its
// own: it is not a coat of paint over the week, it is a drawing laid on it, so
// the week's own washes — its bare ground, its umber, its paper — are what the
// drawing is drawn on and show through every part of it the sun has not left.
//
// The light it reads is the rock's *own* form and not the planet's: the shell
// takes the sun on each facet and subtracts the sun on the sphere beneath it, so
// what is left is what the relief itself adds — a bowl's far wall, the crest
// beside it, the boulder standing on a flat. The globe's own day and its own
// night stay the terrain shader's business, exactly as they are on every other
// week, and this drawing stops where that night begins (the `day` weight), so
// the two never lay a second, contradictory light on the same ground.
//
// It fades as the camera lands: it is a face seen from far off, and the runner
// under it has the ground's own painting again.
const FACE_DETAIL = 6;    // the shell's own resolution: an icosphere's subdivisions
const FACE_LIFT = 0.9;    // how far over the ground it is laid, units
const FACE_STEP = 2.4;    // the step its form is read at, units
const FACE_INK = 0.30;    // how much of the limb a stroke of ink takes
const FACE_SHADE = 0.40;  // the cool wash on a wall the sun has left, at its deepest
const FACE_DRY = 0.26;    // the sheet left dry on a crest the sun catches
const FACE_CREASE = 0.32; // ink pooled in a crease that turns away

/** An indexed icosphere: `detail` subdivisions of the twenty faces, every
 *  vertex shared. The app's own IcosahedronGeometry is not indexed, and a shell
 *  baked by sampling the ground once per vertex cannot afford five hundred
 *  thousand samples for what forty thousand corners can carry. */
function icosphere(detail) {
  const t = (1 + Math.sqrt(5)) / 2;
  const corners = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  const verts = [];
  for (const c of corners) {
    const l = Math.hypot(c[0], c[1], c[2]);
    verts.push(c[0] / l, c[1] / l, c[2] / l);
  }
  let faces = [
    0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11,
    1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
    3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9,
    4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
  ];
  for (let s = 0; s < detail; s++) {
    const mid = new Map();
    const split = (a, b) => {
      const key = a < b ? a * 1048576 + b : b * 1048576 + a;
      const had = mid.get(key);
      if (had !== undefined) return had;
      let x = verts[a * 3] + verts[b * 3];
      let y = verts[a * 3 + 1] + verts[b * 3 + 1];
      let z = verts[a * 3 + 2] + verts[b * 3 + 2];
      const l = Math.hypot(x, y, z) || 1;
      const at = verts.length / 3;
      verts.push(x / l, y / l, z / l);
      mid.set(key, at);
      return at;
    };
    const next = new Array(faces.length * 4);
    let w = 0;
    for (let i = 0; i < faces.length; i += 3) {
      const a = faces[i], b = faces[i + 1], c = faces[i + 2];
      const ab = split(a, b), bc = split(b, c), ca = split(c, a);
      next[w++] = a; next[w++] = ab; next[w++] = ca;
      next[w++] = b; next[w++] = bc; next[w++] = ab;
      next[w++] = c; next[w++] = ca; next[w++] = bc;
      next[w++] = ab; next[w++] = bc; next[w++] = ca;
    }
    faces = next;
  }
  return { verts: Float32Array.from(verts), faces: Uint32Array.from(faces) };
}

const FACE_VERT = `
attribute float aSlope;
varying vec3 vN;
varying vec3 vW;
varying float vSlope;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vSlope = aSlope;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FACE_FRAG = `
uniform vec3 uSunDir, uLight, uShade, uInk, uPaper;
uniform float uFade, uTime, uShadeAmt, uDryAmt, uCreaseAmt, uInkAmt;
uniform float uLForm;  // light.form: the bowls' concavity first (see below)
varying vec3 vN;
varying vec3 vW;
varying float vSlope;
float faceHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float faceNoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(faceHash(i), faceHash(i + vec2(1.0, 0.0)), u.x),
             mix(faceHash(i + vec2(0.0, 1.0)), faceHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main(){
  vec3 n = normalize(vN);
  vec3 dW = normalize(vW);
  // light.form: the bowls are lit by the light the globe itself is painted with
  // (from orbit the sun turned toward the painter, ink.js), so a wall turns from
  // the same light the rest of the disc does
  vec3 Ls = normalize(mix(uSunDir, uLight, uLForm));
  // the form's own light: the sun on the facet, less the sun on the globe under
  // it. What is left is what this piece of relief adds, and nothing else.
  float sun0 = dot(dW, Ls);
  float relief = dot(n, Ls) - sun0;
  float day = smoothstep(-0.06, 0.32, sun0) * (1.0 - uFade);
  // Every edge here is a brush edge: hard, and only as wide as the pixel it is
  // drawn in. A stone painted in watercolour is a few flat shapes laid one over
  // another, and a shape whose edge ramps over twenty pixels is not a shape, it
  // is a stain — which is what a soft relief pass looks like on a painting and
  // why this drawing is built out of steps instead. raa is that width: the
  // rate the relief's own light changes across one pixel of the sheet.
  float raa = clamp(fwidth(relief) * 1.15, 0.004, 0.055);
  // a band of the rock is left altogether alone: relief within a twentieth of
  // the globe's own light is not form, it is the swell of the potato, and a
  // wash laid over it is a bruise rather than a drawing
  float step0 = -0.045;
  // the threshold is not a contour of the light: it wanders with the hand, and
  // wanders again as the week goes on
  float wob = (faceNoise(vW.xz * 0.055 + vec2(uTime * 0.012, 0.0)) - 0.5) * 0.10;
  float steep = smoothstep(0.26, 0.80, vSlope);
  // Where the brush ran out. It is not dragged in any direction: a marble has no
  // fall line for a brush to follow and a rock's form is its own, so the mask is
  // cut from an isotropic patch of noise and only *removes* wash — the hairs
  // either left pigment or they did not, and the edge between the two is one
  // pixel wide. A wash that fades across twenty of them is an airbrush, and a
  // wash combed into lines is a motion blur; neither is this picture.
  float wear = faceNoise(vW.xz * 0.085 + vW.xy * 0.045 + vec2(uTime * 0.02, 0.0));
  float waa = clamp(fwidth(wear) * 1.1, 0.004, 0.05);
  float hold = smoothstep(0.34 - waa, 0.34 + waa, wear);
  float shadeK = 1.0 - smoothstep(step0 + wob - raa, step0 + wob + raa, relief);
  float dryK = smoothstep(step0 + wob - raa, step0 + wob + raa, relief);
  // light.form: a bowl's concavity is stated before any wear of the brush —
  // the wall turned from the light is one graded wash, lightest at its step and
  // deepest where the wall turns furthest away, the wall facing the light lifted
  // the same way, and the dry-brush breaks are let go of in the shade
  float holdS = mix(hold, 1.0, 0.65 * uLForm);
  float gradeS = mix(1.0, 0.55 + 0.75 * smoothstep(0.0, 0.35, step0 + wob - relief), uLForm);
  float gradeD = mix(1.0, 0.60 + 0.80 * smoothstep(0.0, 0.30, relief - step0 - wob), uLForm);
  float wShade = shadeK * day * uShadeAmt * mix(0.30 + 0.85 * steep, 0.55 + 0.60 * steep, uLForm) * (0.30 + 0.70 * holdS) * gradeS;
  float wDry = dryK * day * uDryAmt * (0.20 + 0.95 * steep) * (1.0 + 0.25 * (1.0 - hold)) * gradeD;
  float wCrease = shadeK * day * uCreaseAmt * steep * hold * hold;
  vec3 V = normalize(cameraPosition - vW);
  float graze = 1.0 - smoothstep(0.05, 0.24, abs(dot(n, V)));
  float wInk = graze * uInkAmt * (1.0 - uFade);
  float cov = wShade + wDry + wCrease + wInk;
  if (cov < 0.004) discard;
  vec3 col = (uShade * wShade + uPaper * wDry + uInk * (wCrease + wInk)) / cov;
  gl_FragColor = vec4(col, clamp(cov, 0.0, 0.86));
}
`;

/** The shell itself: the ground's own surface, sampled from the same height
 *  field the terrain draws, carried a fraction of a unit over it. */
function marbleFace(shared) {
  const { THREE: T, features, uniforms, palette: pal } = shared;
  const R = num(shared.R) || R_PLANET;
  const { verts, faces } = icosphere(FACE_DETAIL);
  const n = verts.length / 3;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const slope = new Float32Array(n);
  const d = new T.Vector3(), ref = new T.Vector3(), east = new T.Vector3(), north = new T.Vector3();
  const step = FACE_STEP / R;
  for (let i = 0; i < n; i++) {
    const x = verts[i * 3], y = verts[i * 3 + 1], z = verts[i * 3 + 2];
    d.set(x, y, z);
    ref.set(Math.abs(y) > 0.9 ? 1 : 0, Math.abs(y) > 0.9 ? 0 : 1, 0);
    east.crossVectors(d, ref).normalize();
    north.crossVectors(east, d).normalize();
    const h = features.heightAt(d);
    const hE = features.heightAt({ x: x + east.x * step, y: y + east.y * step, z: z + east.z * step });
    const hW = features.heightAt({ x: x - east.x * step, y: y - east.y * step, z: z - east.z * step });
    const hN = features.heightAt({ x: x + north.x * step, y: y + north.y * step, z: z + north.z * step });
    const hS = features.heightAt({ x: x - north.x * step, y: y - north.y * step, z: z - north.z * step });
    // the surface's own normal, tilted off the sphere by the ground's fall line
    let nx = x - east.x * (hE - hW) * 0.5 - north.x * (hN - hS) * 0.5;
    let ny = y - east.y * (hE - hW) * 0.5 - north.y * (hN - hS) * 0.5;
    let nz = z - east.z * (hE - hW) * 0.5 - north.z * (hN - hS) * 0.5;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    const r = R + h + FACE_LIFT;
    pos[i * 3] = x * r; pos[i * 3 + 1] = y * r; pos[i * 3 + 2] = z * r;
    nor[i * 3] = nx; nor[i * 3 + 1] = ny; nor[i * 3 + 2] = nz;
    slope[i] = Math.hypot(hE - hW, hN - hS) / (2 * FACE_STEP);
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
  geo.setAttribute('aSlope', new T.BufferAttribute(slope, 1));
  geo.setIndex(new T.BufferAttribute(faces, 1));
  geo.computeBoundingSphere();
  const mat = new T.ShaderMaterial({
    uniforms: {
      uSunDir: uniforms?.uSunDir || { value: new T.Vector3(0.6, 0.5, 0.3) },
      // light.form: the light the globe is painted with (ink.js st.light), read
      // in place of the week's sun as the dial comes up (see FACE_FRAG)
      uLight: shared.light || uniforms?.uSunDir || { value: new T.Vector3(0.6, 0.5, 0.3) },
      uLForm: { value: num(P['light.form']) },
      uShade: { value: pal.shadeCool.clone().lerp(pal.ink, 0.30) },
      uInk: { value: pal.ink.clone() },
      uPaper: { value: pal.paper.clone() },
      uFade: { value: 0 },
      uTime: { value: 0 },
      uShadeAmt: { value: FACE_SHADE },
      uDryAmt: { value: FACE_DRY },
      uCreaseAmt: { value: FACE_CREASE },
      uInkAmt: { value: FACE_INK },
    },
    vertexShader: FACE_VERT,
    fragmentShader: FACE_FRAG,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -8,
  });
  const mesh = new T.Mesh(geo, mat);
  mesh.name = 'marble-face';
  mesh.frustumCulled = false;
  return mesh;
}

/* ---------------------------------------------------------------- the body -- */

export default {
  id: 'marble',
  label: 'Marble',
  blurb: 'a small rocky body, close enough to see its curve',

  fit(stats) {
    const small = smallOf(stats);
    if (!small) return 0;
    // the emptier the week, the surer: a week of an hour is a marble outright, a
    // week of three and a half hours is a marble by a whisker
    return FIT_BASE + FIT_LEAD * (0.4 + 0.6 * small.tininess) * small.lived;
  },

  /** Airless. The sea is taken off the week entirely — a rock this small holds
   *  nothing — and the fine terrain quietened, so the body's own relief and its
   *  bowls are the whole of the ground. */
  climate(c) {
    c.oceanFrac = 0;
    c.baseAmp = 1.1;
    return c;
  },

  /** The shape: the potato, its bite, its bowls and its outcrops, on top of
   *  whatever ground the week drew for itself. One square root and one
   *  exponential per bowl a vertex is inside; a chord short of a bowl's reach is
   *  a compare and a continue. */
  shape(dir, h, ctx) {
    const f = fieldOf(ctx);
    const x = dir.x, y = dir.y, z = dir.z;
    // the week's own ground, fitted into a small body's relief budget: whatever
    // the world stood above the ceiling is eased down rather than shaved flat
    let d = f.sink + (h > CEIL ? CEIL + (h - CEIL) * KNEE : h);
    // three unequal axes ...
    const c1 = x * f.ax[0] + y * f.ax[1] + z * f.ax[2];
    const c2 = x * f.ax[3] + y * f.ax[4] + z * f.ax[5];
    const c3 = x * f.ax[6] + y * f.ax[7] + z * f.ax[8];
    d += f.w1 * c1 * c1 + f.w2 * c2 * c2 + f.w3 * c3 * c3;
    // ... with two octaves of slow noise over them, so the lump is a rock and
    // not an ellipsoid a geometer shopped out: the coarse one draws the swell
    // and the hollow, the fine one the bays between them
    d += f.wob * (ctx.fbm(ctx.nz, x * POTATO_FREQ + f.nx, y * POTATO_FREQ + f.ny, z * POTATO_FREQ + f.nz, 1) * 2 - 1);
    // the two fine octaves, let down over the doorstep so the ground the
    // runner lands on is a floor and not a scree slope
    const dq = 2 - 2 * (x * f.door[0] + y * f.door[1] + z * f.door[2]);
    const soft = 0.22 + 0.78 * sstep(f.doorNear, f.doorFar, dq);
    d += soft * f.wobFine * (ctx.fbm(ctx.nz, x * CHEW_FREQ + f.nx * 1.7, y * CHEW_FREQ + f.ny * 1.7, z * CHEW_FREQ + f.nz * 1.7, 1) * 2 - 1);
    d += soft * f.wobChew * (ctx.fbm(ctx.nz, x * CHEW_FINE + f.nx * 2.9, y * CHEW_FINE + f.ny * 2.9, z * CHEW_FINE + f.nz * 2.9, 1) * 2 - 1);
    // the bites, read off their chords: the angle's square is twice the chord,
    // so no arc tangent is needed anywhere in here
    const bq = 1 - (x * f.bite[0] + y * f.bite[1] + z * f.bite[2]);
    if (bq < f.biteGate) {
      const t = Math.sqrt(2 * bq) * f.biteInv;
      const w = (t - 1) / BITE_LIPW;
      d -= f.biteDepth * (1 - sstep(BITE_FLOOR, 1, t));
      d += BITE_RIM * f.biteDepth * Math.exp(-w * w);
    }
    const b2q = 1 - (x * f.bite2[0] + y * f.bite2[1] + z * f.bite2[2]);
    if (b2q < f.bite2Gate) {
      const t = Math.sqrt(2 * b2q) * f.bite2Inv;
      const w = (t - 1) / BITE2_LIPW;
      d -= f.bite2Depth * (1 - sstep(BITE2_FLOOR, 1, t));
      d += BITE2_RIM * f.bite2Depth * Math.exp(-w * w);
    }
    // the bowls
    const cx = f.bx, cy = f.by, cz = f.bz;
    const binv = f.binv, gate = f.bgate, depth = f.depth, lip = f.lip;
    for (let i = 0; i < f.n; i++) {
      const qx = x - cx[i], qy = y - cy[i], qz = z - cz[i];
      const q = qx * qx + qy * qy + qz * qz;
      if (q >= gate[i]) continue;
      const t = Math.sqrt(q) * binv[i];
      const wall = 1 - sstep(FLOOR_T, 1, t);
      const w = (t - 1) / LIP_W;
      d += lip[i] * Math.exp(-w * w) - depth[i] * wall;
    }
    // the outcrops
    const ox = f.ox, oy = f.oy, oz = f.oz, oh = f.oh, oinv = f.oinv, ogate = f.ogate;
    for (let i = 0; i < f.m; i++) {
      const qx = x - ox[i], qy = y - oy[i], qz = z - oz[i];
      const q = qx * qx + qy * qy + qz * qz;
      if (q >= ogate[i]) continue;
      const t = Math.sqrt(q) * oinv[i];
      d += oh[i] * Math.exp(-t * t * 2.1);
    }
    return d;
  },

  /** Stone, and no weather on it. The week keeps its paper and its one mineral
   *  note; everything the ground is made of is repainted as rock — a pale dry
   *  grey in the week's own temperature, so a hot week's marble is a warm bone
   *  and a cold week's a blue one — and the sea, the fields and the air are
   *  taken off it. What makes the picture harsh is the distance between the
   *  steps: the sunlit face is nearly the paper, the turned faces are nearly the
   *  ink, and the washes are broken by the rock's own form rather than laid as
   *  clean planes (a low `calm`). Nothing on this body is green, nothing pools,
   *  and nothing grows: the lowland is bare ground with the page showing through
   *  it, which is the sheet's own tooth magnified into the rock's grain. */
  palette(pal, features) {
    const C = (hex) => new pal.paper.constructor(hex);
    const warm = clamp(num(features?.warmth), 0, 1);
    const stone = (cold, hot) => C(cold).lerp(C(hot), warm);

    // the week's one mineral, before the rock that carries it. On an airless
    // body the accent is a pigment in the creases and never a wash, so it is
    // carried to a note and left there.
    const accent = pal.accent.clone();
    const peak = Math.max(accent.r, accent.g, accent.b);
    if (peak > 0) accent.multiplyScalar(0.55 / peak);
    pal.accent = accent;

    // the ground, in the three bands the height draws it in — the floors of the
    // bowls deep and cool, the rock between them a mid stone, the rims and the
    // crests pale — with the stone's own temperature kept from the week
    pal.landLow = stone(0x2c2e3c, 0x38312a);
    pal.landMid = stone(0x8a8880, 0x968b7c);
    // the light family is the body's whole voice from orbit: the lit face of a
    // disc seen with the light at the eye is one wash built out of `litWarm`,
    // `crest` and the mid band, and the only marks the shader can draw on it are
    // the *paper* it leaves on a crest and the *ink* it gathers in a crease. Both
    // are read against that wash, so a rock whose lit face is laid near the
    // paper's own value has no marks at all — the sheet is already the colour the
    // mark would be. A stone a step and a half under the sheet is what gives the
    // drawing something to be drawn on; the crests keep enough of the paper's
    // pale to read as the brush's own breaks.
    pal.landHigh = stone(0xbdb6a4, 0xc6b795);
    pal.litWarm = stone(0xb0a68f, 0xbfa987);
    pal.shadeCool = stone(0x2b3554, 0x343049);
    pal.crest = stone(0xded7c3, 0xe6d9b8);
    pal.dark = stone(0x141a2c, 0x1d1a26);
    pal.ink = stone(0x1a2032, 0x232030);
    pal.inkSoft = stone(0x3a4258, 0x43404f);
    pal.sepia = stone(0x635b4e, 0x6c6150);
    pal.stone = stone(0xa39d93, 0xb0a184);
    pal.farGlaze = stone(0xb4b2a8, 0xbdb198);
    // the driest ground is the sunlit face seen from orbit — the one colour most
    // of the poster's disc is laid in — and it is a step under the paper on
    // purpose: from orbit the sky is the sheet itself, so a face as pale as the
    // paper would have no edge against it and the rock would have no silhouette
    pal.dry = stone(0xb5ad9a, 0xc3ae8e);

    // nothing on this body is water, and the pigment the water would have been
    // laid in is the pigment of the floors it can only ever show inside: a pool
    // in the deepest bowl reads as one more shade of that bowl
    pal.teal = pal.landMid.clone();
    pal.cobalt = pal.landLow.clone();
    pal.seaShallow = pal.landLow.clone();
    pal.seaDeep = pal.landLow.clone();
    pal.foam = pal.paper.clone();
    pal.shelf = pal.landLow.clone();
    pal.damp = 0;
    pal.seaCalm = 0;
    // a rock is not a field, and it is not a blank page either. This is the
    // palette's one structural lever, so it is worth the paragraph: the bare-
    // earth washes are the *only* thing the terrain shader lays on a sunlit
    // face from orbit — the lit face is one flat wash (dryLit) wherever the
    // light is turned toward the eye, the night side is off it, and no sea, no
    // cap and no crescent is left on this body to break it. `vegAmt` decides
    // whether those washes are drawn at all and how high above the sea plane
    // they begin (lowS = mix(3, 12, |vegAmt|) + 3), so a marble cannot keep the
    // week's own value: at the bare-earth strength a normal short week has, the
    // washes start six units up, and a marble's whole surface — sunk under R and
    // capped at two units of its own relief — lies below that line, which is
    // what left two of the six weeks a single flat tone. A whisper of the
    // amount (lowS a little over three) lays the loose two-tone washes over the
    // whole rock, with the page showing between them, which is exactly what a
    // short week's bare ground is and exactly what gives the disc its form.
    pal.vegAmt = -0.06;
    // the umber those washes are laid in: the week's family umber is a red-
    // brown earth, and this is a rock, so it is mixed toward the stone
    pal.bare = stone(0x8a7d69, 0x93816a);
    // the washes are broken by the rock's own form rather than laid as clean
    // planes — an easy week is calm (uCalm 1) and a rock is not easy
    pal.calm = 0.28;

    // the sky: an airless one, laid deep and cold with the sheet's own band
    // along the horizon. No haze at all (skyHaze is the wash itself and the
    // scheme carries no heat), no weather whatsoever (the cloud scale is
    // negative: the shader's own cloud gate keeps a sliver at zero, so the
    // scale has to go under it), one tight sun, no cirrus.
    pal.skyBand = stone(0x9aa2b6, 0xa6a29b);
    pal.skyWash = stone(0x46506e, 0x4c4a66);
    pal.skyDeep = stone(0x1f2539, 0x262133);
    pal.cloudUnder = stone(0x8b91a3, 0x94908f);
    pal.skyHigh = pal.skyDeep.clone();
    pal.skyLow = pal.skyBand.clone();
    pal.skyHaze = pal.skyWash.clone();
    pal.skyScheme.set(0.02, 0, -0.4, 0.6);
    pal.skyCirrus = 0;
    return pal;
  },

  /** The pebble: see above — placed for the poster's own frame, seeded per week,
   *  and cut from the same stone as the body. */
  companions(ctx) {
    return pebble(ctx);
  },

  /** The rubble, the rock's own face from orbit, and the one thing the body has
   *  to do every frame: keep the rocks on the ground, off the poster, and the
   *  face down as the camera lands. From orbit a two-unit boulder is a dot of
   *  noise; on the way down they arrive a little before the ground patch does,
   *  and are standing there by the time the camera is. */
  create(shared) {
    const { THREE: T, features } = shared;
    const R = num(shared.R) || R_PLANET;
    const rubble = rubbleField(shared);
    const face = marbleFace(shared);
    const object = new T.Group();
    object.name = 'marble-body';
    if (face) object.add(face);
    if (rubble) object.add(rubble);
    const eye = new T.Vector3();
    const near = 60; // units above the ground at which the rubble is drawn in
    return {
      object,
      update(frame) {
        const surface = clamp(num(frame?.surface), 0, 1);
        if (face) {
          const on = surface < 0.999;
          face.visible = on;
          if (on) {
            // the drawing is a face seen from far off: it lets go of the rock as
            // the camera comes down onto it, a little ahead of the ground patch
            face.material.uniforms.uFade.value = sstep(0.02, 0.42, surface);
            face.material.uniforms.uTime.value = num(frame?.time);
            face.material.uniforms.uLForm.value = num(P['light.form']);
          }
        }
        if (!rubble) return;
        const cam = frame?.camera?.position;
        if (!cam) { rubble.visible = false; return; }
        eye.copy(cam).normalize();
        rubble.visible = cam.length() - (R + features.heightAt(eye)) < near;
      },
      dispose() {
        if (face) {
          face.geometry.dispose();
          face.material.dispose();
        }
        if (!rubble) return;
        rubble.geometry.dispose();
        rubble.material.dispose();
      },
    };
  },

  /** Why this week reads as a marble: the trigger, then the week's own numbers. */
  reason(stats) {
    const count = Math.max(0, Math.round(num(stats?.count)));
    const hours = num(stats?.hours);
    return `Small weeks make small rocks. That's ${SMALL_HOURS} hours or less, or ${SMALL_COUNT} sessions or fewer in ${SMALL_COUNT_HOURS} hours or less. This week: ${count} session${count === 1 ? '' : 's'}, ${hours.toFixed(1)} hours.`;
  },

  // The relief the orbit draws under. Round five's twelve-unit ceiling is for a
  // globe whose mountains must not tear its silhouette; this body's whole point
  // is that its silhouette is not a circle, so the cap is lifted over the
  // potato's own lobe, its bowls' rims and the outcrops standing on top of both
  // — every crest the shape hook draws is left whole, and nothing of the lump is
  // shaved flat into a facet. The frame is pulled in with it: see the sink above
  // for how a body whose average radius is under R fills a fuller frame without
  // its widest lobe leaving the poster's crop.
  orbit: { reliefCap: 30, fill: MARBLE_FILL },
};

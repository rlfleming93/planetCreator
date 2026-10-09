/* Planet Creator — the mesa world.
 *
 * A ride week read as canyon country. The week's own ground is lifted into
 * tableland: a staircase of flat treads — the week's own rise sets how tall a
 * step is, a slow field of the week's noise decides which stretches of the
 * country stand as tables and which lie as low ground between them — and the
 * rides are cut through it as canyons: a stepped shoulder three times the width
 * of the valley a ride would have carved by itself, a wider crack down its
 * middle whose bed grades through the waterline, and a few tributaries branching
 * off. The sea is the week's own ocean cut back to a third: the picture is the
 * tableland, and the water shows at the foot of the lowest riser.
 *
 * Every number comes off the week. The height the plateaus step up from is the
 * week's own waterline and how tall a step is comes from how far that week's
 * ground rises above it (see bake); the whole reading is then dropped to mesa's
 * own datum (see TREAD_LOW) so the treads land in ink's land washes whatever
 * height the week's field happened to sit at. A ride with no GPS at all — the
 * ones ridden indoors — cuts its arc through the sites of the days it was ridden
 * on.
 *
 * base.js gives every GPS route a range profile (a ridge along the path) before
 * it carves a ride's valley into it. A ridge with a notch in it is not canyon
 * country, so mesa undoes both for a ride's route (see ridgeProfile, valleyCarve)
 * and cuts its own canyon there instead.
 *
 * Three rules keep the hooks honest. Everything they do is idempotent: ground
 * already on a tread stays on it, which is what lets the same terrace function
 * run in baseline, before base.js's route carves, and in shape, after them. The
 * transforms that lay the country out — the gain, the tables, the sea floor's
 * fall — are read in the baseline pass only, so the shape pass quantises against
 * the plain lattice the baseline left the ground on. And the low ground is left
 * to ink's own bare-earth districts (see palette): from orbit a flat lit tread
 * is painted in one wash whatever its height (ink.js, TERRAIN_FRAG), so a
 * district of umber and page is the only value such a tread can carry.
 *
 * Perf: baseline and shape run per vertex (163 842 of them) and for every probe.
 * Neither allocates; a canyon's gate is dot products, taken before any distance
 * or trig is measured.
 */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smoothstep = (t) => t * t * (3 - 2 * t);
const pow = Math.pow;

// --- the gate. A week rides when the bike carries more than a quarter of its
// active time and at least as much of it as running does; see fit.
const RIDE_GATE = 0.28;

// --- the sea. The week's own ocean fraction (base.js: the race week's share of
// the globe scaled by the square root of the week's sweat) drawn at a sixth.
// The third this was drawn at left a broad sheet of ultramarine lying in every
// canyon, and the pale shelf round it: at 360 px the blue pools, not the rock,
// were what the eye read, and a canyon that is full of water is a reservoir and
// not a canyon. At a sixth only the deepest cuts — the ones the week's own
// rides actually made — hold water, and the country between them is dry ground
// stepped down to the shiprock.
const SEA_SCALE = 0.22;

// --- mesa's own datum. The first tread stands TREAD_LOW above the globe's mean
// radius and the whole reading is dropped to match, so the treads land in ink's
// three land washes (0.5…7 and 9…20) whatever height the week's own noise put
// its ground at: without it a week whose field sits high stacks every tread in
// one pale wash and one whose field sits low stacks them all in the darkest. It
// is the same world twice, only placed.
const TREAD_LOW = 2.6;
// The waterline — the height above which a week's ground is tableland — is read
// this far up the week's own height distribution, well above the share of the
// globe the sea is drawn at: the ground between the two is the shore the lowest
// terrace stands over, and it is what keeps the sea a step below the tableland.
const SHORE_BIAS = 2.4;

// --- steps. A step is the week's own rise above its waterline, spread over the
// two or three levels a mesa is read at. A step is read from orbit as one of
// ink's height bands (0.5…7 and 9…20, see TERRAIN_FRAG): at two and a half units
// every tread of a week's staircase landed in the same pale wash whatever its
// height, and the tableland came out one flat ochre mask with its strata only in
// the drawing. Four units and more carries the treads across the bands — the low
// treads in the shade's own oxblood, the middle ones brick, the tables in pale
// sand — so the colour of the rock is a fact about its height, and a riser shows
// the two bands it stands between.
const TERRACE_LEVELS = 1.15;
const TERRACE_STEP_MIN = 3.6;
const TERRACE_STEP_MAX = 4.8;
// The week's own ground above its waterline, lifted by this much before the
// terraces are cut. A week's baseline field is a gentle country — on its own,
// quantised into steps, it leaves one tread the size of a hemisphere — and the
// gain is what fills the globe with risers instead of one slab. It is read in
// the baseline pass only, like the tables and the sea floor's fall, and it is
// kept low enough that most of the tableland still stands inside ink's lowland
// band (twelve units above the sea), where the bare-earth districts give a flat
// lit tread the only value it can carry from orbit.
const GAIN = 1.15;
const TERRACE_JITTER = 0.3; // share of a step, from the week's own noise
const TERRACE_FREQ = 3.2;
// --- and the tables: a slow field of the same noise lifts whole stretches of the
// country by up to TABLE_STEPS steps, so the plateaus read as several separate
// mesas with lower ground between them instead of one table the size of the
// globe. The terrace pass lays the lift's edges out as risers of its own.
const TABLE_STEPS = 1;
const TABLE_FREQ = 1.9;
const TABLE_LO = 0.30;
const TABLE_HI = 0.70;
// The treads' own roll. A tread read from orbit is painted in one wash whatever
// its height (TERRAIN_FRAG: cDry is uDry from orbit), so a table top with no
// relief on it is a flat cutout however many bands the rock is coloured in: what
// the roll does is break the top into a lit face, a turning-away face and a
// shaded one, which is the only way a table's own colour can be seen at all.
const ROLL_AMP = 1.5; // the treads' own slow roll, in units
const ROLL_FREQ = 4.6;
const ROLL_FINE = 0.7; // ...and a shorter one over it, so no tread is one flat tone
const ROLL_FINE_FREQ = 9;
// The sea floor keeps the week's own ground, pushed down by up to this much over
// the first step below the waterline: a shore that falls away quickly leaves no
// wide sheet of ground lying exactly at the waterline for the sea to graze.
const SEA_DEEPEN = 1.6;

// --- canyons. A ride's own valley is 5…8 u wide and up to 18 u deep; mesa's
// shoulder is three of those widths and a step deep, and its crack is twice that
// width and as deep as the ride's own climb, cut after the terraces so it is the
// one thing in the picture that is not quantised. The crack's floor is kept just
// above the waterline and graded about it, so what lies at the bottom of a canyon
// is the deepest dark rock in the picture with threads and pools of water in its
// lowest reaches — not a canal of sea filling the cut to the brim, which is what
// a floor graded *through* the waterline became once the ocean was a level
// surface laid over the whole globe.
const SHOULDER_WIDTH_K = 3.4;
const SHOULDER_STEPS = 1.6;  // a cut over one step is laid as one clean step
const CRACK_WIDTH_K = 3.2;
const CRACK_WOBBLE = 0.12; // the crack's own width wanders at this frequency
const CRACK_WOBBLE_K = 0.6; // ...by this share of its width
// How far a crack's floor stands above the waterline, and how much it wanders
// either side of it along its length (in steps): a crack's floor grades like a
// riverbed just over the water, so its water is broken into threads and pools in
// the lowest reaches and its dry reaches are the deepest dark rock in the picture.
const CRACK_DIP = -0.14;
const CRACK_GRADE = 0.24;

// --- an indoor ride's arc: no route record, so the crack is mesa's own.
const ARC_WIDTH = 17; // the arc's shoulder
const ARC_CRACK_WIDTH = 10;
const ARC_CRACK_MIN = 5;
const ARC_CRACK_MAX = 12;
const ARC_LONE = 96; // a week with one indoor ride gets this much of an arc, u
const ARC_STEP = 10; // the arc's own sampling, u
const ARC_WANDER = 9; // how far a drawn arc may leave the ruled line, u

// --- tributaries: cracks branching off a canyon, so the canyons branch too.
const SPUR_WIDTH = 9;
const SPUR_STEPS = 2.6; // their depth, in steps
const SPUR_MIN = 40;
const SPUR_MAX = 80;
const SPUR_STEP = 8;
const CHUNK = 8; // segments to a spatial chunk of a canyon (see makeCanyon)

// --- buttes: the rock that is not part of a stair. The staircase alone is a
// pattern the eye reads as height and never as *place* — a country of tables is
// known by the handful of them that stand alone, with their own wall round them
// and the low ground at their feet. A butte is a table in miniature: an oval
// footprint lifted by two or three of the week's own steps, its wall the width a
// riser is drawn at, so the terrace pass lays its top as a tread of its own and
// its wall as one clean riser. They stand on the week's own low ground, and a
// few of them carry a second, smaller cap: a country with a landmark in it.
const BUTTE_MIN = 4, BUTTE_MAX = 6;
const BUTTE_SPAN = 40;      // the long half of a butte's own footprint, u — big enough
                            // that a butte is a form the orbit reads, not a wart. It was
                            // taken to forty-six in the round before this one, and at
                            // that size the landmarks started to read as terrace walls
                            // where the week's own monument stands between two of them;
                            // forty holds the read and leaves the ground walkable
const BUTTE_RATIO = 0.72;   // ...and its short one, as a share of that
const BUTTE_WALL = 0.26;    // the share of the footprint's own run its wall takes: a
                            // wall with a talus at its foot, so a butte on the limb is
                            // a landform and not a tab of extruded rock
const BUTTE_STEPS_MIN = 3, BUTTE_STEPS_MAX = 5;
const BUTTE_CAP = 0.6;      // the share of the buttes that carry a second cap
const BUTTE_CAP_SPAN = 0.45;
const BUTTE_SINK = 0.55;    // how far up the week's own height its site must be:
                            // a butte stands on low ground, not on another table

// --- arches: a natural bridge over a canyon. The highway of ink is a height
// field, and a height field cannot hold a hole: what it can hold is the *deck*,
// a bar of rock left crossing the cut at the tread the cut was made in, so the
// dark of the canyon stops at the bridge and goes on beyond it, with a cliff at
// each side of the deck where the cut's floor falls away. That is the one way a
// bridge is seen from above, and the way it is drawn on a map. The deck sits a
// little under the tread so the rims stand proud of it on both sides.
const ARCH_MAX = 2;         // natural bridges on a week's globe
const ARCH_WIDE_MIN = 11;   // half the deck's own width along the cut, u ...
const ARCH_WIDE_SPREAD = 9; // ... and the spread of the week's own bridges about it
const ARCH_REACH = 1.7;     // how far past the cut's own wall a deck reaches, in widths
const ARCH_SINK = 0.30;     // how far under the tread the deck sits, in steps

// One world module serves one week at a time: the bake is the reading both
// hooks share, since a hook gets nowhere to keep state between its calls.
const state = { ctx: null, share: 0.1, drop: 0, shore: 0, step: 2.4, canyons: [], buttes: [], arches: [] };
const probe = { x: 0, y: 0, z: 0 };
const hit = { x: 0, y: 0, z: 0 }; // the closest point a canyon's polyline answered with

/**
 * The squared chord distance from (x, y, z) to a polyline of unit directions,
 * with the closest point written to `hit` — base.js's own measure of a route and
 * its own point (see segInfo there), so the carves mesa undoes come out of the
 * same distance base.js laid them down with.
 */
function closestSq(seg, x, y, z) {
  let best = Infinity;
  for (let i = 0; i + 2 < seg.length; i += 3) {
    const ax = seg[i], ay = seg[i + 1], az = seg[i + 2];
    const ex = seg[i + 3] - ax, ey = seg[i + 4] - ay, ez = seg[i + 5] - az;
    let t = ((x - ax) * ex + (y - ay) * ey + (z - az) * ez) / (ex * ex + ey * ey + ez * ez);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + ex * t, py = ay + ey * t, pz = az + ez * t;
    const cx = px - x, cy = py - y, cz = pz - z;
    const d2 = cx * cx + cy * cy + cz * cz;
    if (d2 < best) {
      best = d2;
      hit.x = px; hit.y = py; hit.z = pz;
    }
  }
  return best;
}

/** base.js's own range profile for a GPS route — the ridge it lays along a path,
 *  in its own terms (see sample there). Mesa subtracts this for a ride so its
 *  canyon is cut into the tableland instead of into a ridge. */
function ridgeProfile(work, d, x, y, z, ctx, dials) {
  const w = work.ridge.width;
  const fade = d < w * 0.5 ? d / (w * 0.5) : 1;
  const dw = d + dials.warp * w * fade * (ctx.nz(x * dials.warpFreq, y * dials.warpFreq, z * dials.warpFreq) * 2 - 1);
  const t1 = 1 - dw / w;
  const tf = 1 - dw / (3 * w);
  if (t1 <= 0 && tf <= 0) return 0;
  const cx = hit.x, cy = hit.y, cz = hit.z;
  const rn = clamp((ctx.ridged(ctx.nz, cx * dials.alongFreq, cy * dials.alongFreq, cz * dials.alongFreq) - 0.3) / 0.45, 0, 1);
  const env = clamp((ctx.nz(cx * dials.envFreq, cy * dials.envFreq, cz * dials.envFreq) - 0.35) / 0.4, 0, 1);
  const along = (0.45 + 0.55 * rn) * (0.68 + 0.32 * env);
  const amp = work.ridge.amp;
  let rh = 0, crest = 0;
  if (t1 > 0) {
    crest = pow(t1, 1.6);
    rh += amp * along * crest;
  }
  if (tf > 0) rh += 0.25 * amp * along * Math.max(0, smoothstep(tf) - crest);
  const slope = Math.min(1, (amp * 1.4 * (t1 > 0 ? pow(t1, 0.6) : 0)) / w);
  if (crest > 0 || slope > 0) {
    const det = ctx.ridged(ctx.nz, x * dials.detailFreq, y * dials.detailFreq, z * dials.detailFreq) * 2 - 1;
    rh += det * (amp * dials.detailAmp * 4 * crest * (1 - crest) * (0.35 + 0.65 * slope) + 0.5 * slope * Math.min(1, amp / 12));
  }
  return rh;
}

/** base.js's own carve of a ride's valley — the narrow gorge mesa lifts out of
 *  the ground before the terraces are laid, and re-cuts wider as its crack. */
function valleyCarve(work, d, x, y, z, ctx, dials) {
  const vw = work.valley.width;
  const fade = d < vw * 0.5 ? d / (vw * 0.5) : 1;
  const vdw = d + dials.warp * vw * fade * (ctx.nz(x * dials.warpFreq, y * dials.warpFreq, z * dials.warpFreq) * 2 - 1);
  const t = clamp(1 - vdw / (vw * 1.35), 0, 1);
  if (t <= 0) return 0;
  return work.valley.amp * smoothstep(t)
    * (0.82 + 0.18 * ctx.nz(x * dials.detailFreq, y * dials.detailFreq, z * dials.detailFreq));
}

/** How much of `width`'s own carve is left at `d`: 1 at the path, 0 past its
 *  rim — the profile base.js carves a ride's valley with, and the one mesa cuts
 *  its own shoulders and cracks with. */
function carveT(d, width) {
  return clamp(1 - d / (width * 1.35), 0, 1);
}

/**
 * How far the week's own rock is lifted at a direction by the buttes: each
 * footprint's own oval, its wall over the last share of its run, and — on the few
 * that carry one — a second cap standing on the first. Read by the terrace pass
 * only (like the gain and the tables), so a butte's top is laid as a tread of its
 * own and its wall as one clean riser. Nothing here allocates.
 */
function butteLift(x, y, z, R) {
  const list = state.buttes;
  if (!list.length) return 0;
  let lift = 0;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (x * b.x + y * b.y + z * b.z < b.gate) continue;
    const al = (x * b.ex + y * b.ey + z * b.ez) * R;
    const ac = (x * b.nx + y * b.ny + z * b.nz) * R;
    const q = Math.sqrt((al * al) / (b.la * b.la) + (ac * ac) / (b.lc * b.lc));
    if (q >= 1) continue;
    const wall = q <= 1 - BUTTE_WALL ? 1 : 1 - smoothstep((q - (1 - BUTTE_WALL)) / BUTTE_WALL);
    let up = b.steps * state.step * wall;
    if (b.cap > 0) {
      const qc = q / BUTTE_CAP_SPAN;
      if (qc < 1) up += b.cap * state.step * (qc <= 1 - BUTTE_WALL ? 1 : 1 - smoothstep((qc - (1 - BUTTE_WALL)) / BUTTE_WALL));
    }
    if (up > lift) lift = up;
  }
  return lift;
}

/**
 * The deck of a natural bridge at a direction, or -Infinity where there is none:
 * a bar of rock left crossing a canyon at the tread the cut was made in, wide
 * enough to reach the rim on both sides and no wider than a bridge along the
 * cut, so the cut's floor falls away in a cliff at each side of the deck and the
 * canyon's dark goes on beyond it. Read by the shape pass, last of all, so
 * nothing quantises the deck away.
 */
function archTop(x, y, z, R) {
  const list = state.arches;
  if (!list.length) return -Infinity;
  let top = -Infinity;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (x * a.x + y * a.y + z * a.z < a.gate) continue;
    const across = (x * a.ex + y * a.ey + z * a.ez) * R;   // over the cut
    if (across > a.half || across < -a.half) continue;
    const along = (x * a.tx + y * a.ty + z * a.tz) * R;    // down the cut
    if (along > a.wide || along < -a.wide) continue;
    const t = a.tread - ARCH_SINK * state.step;
    if (t > top) top = t;
  }
  return top;
}

/**
 * A canyon, cut into chunks so a vertex only measures itself against the part of
 * it nearby: a chunk carries its centre, the chord radius of its own points, and
 * the gate that covers both that radius and the canyon's reach, so the gate can
 * never leave out a vertex the carve would touch.
 */
function makeCanyon(points, parts, R) {
  const seg = Float64Array.from(points);
  const reach = parts.reach;
  const reachChord = 2 * Math.sin(Math.min(Math.PI, reach / R) / 2);
  const chunks = [];
  const last = seg.length / 3 - 1;
  for (let i = 0; i < last; i += CHUNK) {
    const end = Math.min(last, i + CHUNK);
    const part = seg.slice(i * 3, (end + 1) * 3);
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < part.length; k += 3) { cx += part[k]; cy += part[k + 1]; cz += part[k + 2]; }
    const len = Math.hypot(cx, cy, cz) || 1;
    cx /= len; cy /= len; cz /= len;
    let radius = 0;
    for (let k = 0; k < part.length; k += 3) {
      const chord = Math.hypot(part[k] - cx, part[k + 1] - cy, part[k + 2] - cz);
      if (chord > radius) radius = chord;
    }
    const gate = radius + reachChord;
    chunks.push({ seg: part, cx, cy, cz, gateSq: gate * gate });
  }
  return {
    chunks,
    reach,
    shoulder: parts.shoulder || null,
    crack: parts.crack || null,
    work: parts.work || null,
  };
}

/** The polyline of a great circle from `a` towards `b`, sampled every `step`
 *  units — points on the unit sphere. */
function arcBetween(a, b, R, step, out) {
  const dot = clamp(a.x * b.x + a.y * b.y + a.z * b.z, -1, 1);
  const angle = Math.acos(dot);
  const steps = Math.max(1, Math.ceil((angle * R) / step));
  const s = Math.sin(angle) || 1e-6;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const wa = Math.sin((1 - t) * angle) / s, wb = Math.sin(t * angle) / s;
    const x = a.x * wa + b.x * wb, y = a.y * wa + b.y * wb, z = a.z * wa + b.z * wb;
    const len = Math.hypot(x, y, z) || 1;
    out.push(x / len, y / len, z / len);
  }
}

/** Unit direction at `a` turned `rad` towards `b` (slerp, one step). */
function towards(a, b, rad, R) {
  const ex = b.x - a.x, ey = b.y - a.y, ez = b.z - a.z;
  const el = Math.hypot(ex, ey, ez) || 1;
  const dot = (ex * a.x + ey * a.y + ez * a.z) / el;
  const tx = ex / el - a.x * dot, ty = ey / el - a.y * dot, tz = ez / el - a.z * dot;
  const tl = Math.hypot(tx, ty, tz) || 1;
  const th = rad / R;
  const c = Math.cos(th), s = Math.sin(th);
  const out = {
    x: a.x * c + (tx / tl) * s,
    y: a.y * c + (ty / tl) * s,
    z: a.z * c + (tz / tl) * s,
  };
  const l = Math.hypot(out.x, out.y, out.z) || 1;
  out.x /= l; out.y /= l; out.z /= l;
  return out;
}

/** A made-up polyline nudged sideways off the week's own rng: the meander a
 *  drawn arc needs before a canyon is cut along it (a real route carries its own
 *  bends already). */
function meander(points, rng, R) {
  const n = points.length / 3;
  const out = [];
  let offset = 0;
  for (let i = 0; i < n; i++) {
    offset = clamp(offset + (rng() - 0.5) * ARC_WANDER, -ARC_WANDER, ARC_WANDER);
    const a = { x: points[i * 3], y: points[i * 3 + 1], z: points[i * 3 + 2] };
    const j = Math.min(n - 1, i + 1), k = Math.max(0, i - 1);
    const tangent = {
      x: points[j * 3] - points[k * 3],
      y: points[j * 3 + 1] - points[k * 3 + 1],
      z: points[j * 3 + 2] - points[k * 3 + 2],
    };
    // sideways, in the tangent plane: the line's own left
    const lx = a.y * tangent.z - a.z * tangent.y;
    const ly = a.z * tangent.x - a.x * tangent.z;
    const lz = a.x * tangent.y - a.y * tangent.x;
    const ll = Math.hypot(lx, ly, lz) || 1;
    const th = offset / R;
    const c = Math.cos(th), sn = Math.sin(th);
    const p = {
      x: a.x * c + (lx / ll) * sn,
      y: a.y * c + (ly / ll) * sn,
      z: a.z * c + (lz / ll) * sn,
    };
    const pl = Math.hypot(p.x, p.y, p.z) || 1;
    out.push(p.x / pl, p.y / pl, p.z / pl);
  }
  return out;
}

/** Short cracks branching off a canyon's own line: its tributaries, laid on
 *  alternating sides down its length, each running out on its own bearing and
 *  length off the week's rng — so a canyon branches instead of being one ruled
 *  cut, and one drawn on a made-up arc (an indoor ride's) is not a canal. */
function spursFor(points, rng, R, depth) {
  const n = points.length / 3;
  const spurs = [];
  const count = clamp(Math.round(n / 10), 2, 5);
  for (let s = 0; s < count; s++) {
    const k = Math.min(n - 1, Math.round(((s + 0.5) / count) * (n - 1)));
    const a = { x: points[k * 3], y: points[k * 3 + 1], z: points[k * 3 + 2] };
    const j = Math.min(n - 1, k + 1);
    const along = { x: points[j * 3] - a.x, y: points[j * 3 + 1] - a.y, z: points[j * 3 + 2] - a.z };
    const al = Math.hypot(along.x, along.y, along.z) || 1;
    // the two bearings square to the canyon at this point
    const ex = a.y * (along.z / al) - a.z * (along.y / al);
    const ey = a.z * (along.x / al) - a.x * (along.z / al);
    const ez = a.x * (along.y / al) - a.y * (along.x / al);
    const el = Math.hypot(ex, ey, ez) || 1;
    const side = s % 2 ? 1 : -1;
    const swing = (rng() - 0.5) * 1.1; // the branch's own bearing off square
    const c = Math.cos(swing) * side, sn = Math.sin(swing) * side;
    const dir = {
      x: (ex / el) * c + a.x * sn,
      y: (ey / el) * c + a.y * sn,
      z: (ez / el) * c + a.z * sn,
    };
    const len = SPUR_MIN + rng() * (SPUR_MAX - SPUR_MIN);
    // a wander down the branch, so no tributary is a ruled line
    const branch = [a.x, a.y, a.z];
    let at = towards(a, dir, 0.001, R);
    const stepRad = SPUR_STEP / R;
    for (let u = 0; u < len; u += SPUR_STEP) {
      const wob = (rng() - 0.5) * 0.7;
      at = towards(at, { x: at.x + dir.x * stepRad + wob, y: at.y + dir.y * stepRad, z: at.z + dir.z * stepRad + wob }, stepRad, R);
      branch.push(at.x, at.y, at.z);
    }
    spurs.push(makeCanyon(branch, {
      reach: SPUR_WIDTH * 1.35,
      crack: { width: SPUR_WIDTH, depth, wobble: true },
    }, R));
  }
  return spurs;
}

/**
 * Every canyon the week earns: one along each ride with a route — a stepped
 * shoulder three times the width of the valley that ride would have carved, a
 * crack of double that width as deep as the ride's own climb, and a few
 * tributaries off it — and, for rides with no route at all (the ones ridden
 * indoors), an arc drawn through the sites of the days they were ridden on, in
 * the week's own day order.
 */
function canyonsFor(ctx) {
  const canyons = [];
  const rng = ctx.rng('mesa/canyons');
  for (const route of ctx.routes) {
    if (route.kind !== 'valley') continue;
    const shoulder = { width: route.width * SHOULDER_WIDTH_K, depth: SHOULDER_STEPS * state.step };
    const crack = { width: route.width * CRACK_WIDTH_K, depth: route.amp, wobble: true };
    const work = { valley: { width: route.width, amp: route.amp }, ridge: { width: route.baseWidth, amp: route.baseAmp } };
    canyons.push(makeCanyon(route.seg, {
      // base's ridge runs to three widths of its own profile, and that is the
      // furthest mesa has to answer for along this route
      reach: Math.max(shoulder.width * 1.35, crack.width * 1.35 * (1 + CRACK_WOBBLE_K), 3 * route.baseWidth),
      shoulder,
      crack,
      work,
    }, ctx.R));
    for (const spur of spursFor(route.seg, rng, ctx.R, SPUR_STEPS * state.step)) canyons.push(spur);
  }
  const sites = [];
  for (const place of ctx.placed) if (place.kind === 'wheel') sites.push(place);
  if (!sites.length) return canyons;
  const points = [sites[0].dir.x, sites[0].dir.y, sites[0].dir.z];
  if (sites.length === 1) {
    // A week with a single indoor ride has no pair of days to run between, so
    // the arc crosses that day's own site, on a bearing off the week's own rng:
    // the same week always cuts the same canyon.
    const dir = sites[0].dir;
    const ref = Math.abs(dir.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    const ex = dir.y * ref.z - dir.z * ref.y, ey = dir.z * ref.x - dir.x * ref.z, ez = dir.x * ref.y - dir.y * ref.x;
    const el = Math.hypot(ex, ey, ez) || 1;
    const nx = dir.y * (ez / el) - dir.z * (ey / el), ny = dir.z * (ex / el) - dir.x * (ez / el), nz = dir.x * (ey / el) - dir.y * (ex / el);
    const bearing = rng() * Math.PI * 2;
    const tx = (ex / el) * Math.cos(bearing) + nx * Math.sin(bearing);
    const ty = (ey / el) * Math.cos(bearing) + ny * Math.sin(bearing);
    const tz = (ez / el) * Math.cos(bearing) + nz * Math.sin(bearing);
    const half = ARC_LONE / 2 / ctx.R;
    const c = Math.cos(half), s = Math.sin(half);
    points.length = 0;
    points.push(dir.x * c - tx * s, dir.y * c - ty * s, dir.z * c - tz * s);
    points.push(dir.x, dir.y, dir.z);
    points.push(dir.x * c + tx * s, dir.y * c + ty * s, dir.z * c + tz * s);
  } else {
    for (let i = 1; i < sites.length; i++) arcBetween(sites[i - 1].dir, sites[i].dir, ctx.R, ARC_STEP, points);
  }
  // The crack is as deep as the work the week did on the trainer, and the whole
  // arc as wide as an outdoor ride's canyon.
  let distance = 0;
  for (const site of sites) distance += site.distanceKm;
  const depth = clamp(ARC_CRACK_MIN + 0.12 * distance, ARC_CRACK_MIN, ARC_CRACK_MAX);
  const line = meander(points, rng, ctx.R);
  for (const spur of spursFor(line, rng, ctx.R, SPUR_STEPS * state.step)) canyons.push(spur);
  canyons.push(makeCanyon(line, {
    reach: Math.max(ARC_WIDTH * 1.35, ARC_CRACK_WIDTH * 1.35 * (1 + CRACK_WOBBLE_K)),
    shoulder: { width: ARC_WIDTH, depth: SHOULDER_STEPS * state.step },
    crack: { width: ARC_CRACK_WIDTH, depth, wobble: true },
  }, ctx.R));
  return canyons;
}

/** Read the week once: where its waterline stands, how tall its steps are, and
 *  the canyons its rides cut. Cached on the ctx, so the 163 842 vertices of a
 *  mesh pay for it once — keyed by identity, so a second readWeek in one page
 *  (the app's self-check reads the week twice) bakes its own. */
function bake(ctx) {
  if (state.ctx === ctx) return;
  state.ctx = ctx;
  // The last reading's buttes are cleared before anything reads the ground:
  // terraced lifts the rock by them (butteLift), so a second readWeek in one
  // page — which bakes its own ctx — would otherwise take its waterline, its
  // sea and its monuments against the previous reading's standing stones and
  // alternate between two terrains. Cleared, every bake reads the same clean
  // globe the first one did; the buttes this bake cuts are hung on state at the
  // end of buildMonuments, once the ground they stand on has been read.
  state.buttes = [];
  const P = ctx.P;
  state.dials = {
    warp: P['terrain.warp'],
    warpFreq: P['terrain.warpFreq'],
    alongFreq: P['terrain.alongFreq'],
    envFreq: P['terrain.envFreq'],
    detailFreq: P['terrain.detailFreq'],
    detailAmp: P['terrain.detailAmp'],
  };
  const N = 1024;
  const raw = new Float64Array(N);
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = ga * i;
    probe.x = Math.cos(th) * r;
    probe.y = y;
    probe.z = Math.sin(th) * r;
    raw[i] = ctx.classicBaseline(probe);
  }
  const sorted = Float64Array.from(raw).sort();
  const q = (f) => sorted[clamp(Math.round(f * (N - 1)), 0, N - 1)];
  // The week's own waterline: the height its ground holds at SHORE_BIAS times
  // the share of the globe the sea is drawn at. Everything above it is
  // tableland; below it, the ground is the week's own.
  const waterline = q(clamp(state.share * SHORE_BIAS, 0.02, 0.6));
  // A step is the week's own rise above that waterline, spread over the two or
  // three levels a mesa is read at — and never so tall a runner cannot take it.
  state.step = clamp((q(0.97) - waterline) / TERRACE_LEVELS, TERRACE_STEP_MIN, TERRACE_STEP_MAX);
  // Mesa's own datum: the first tread stands TREAD_LOW above the globe's mean
  // radius, the waterline one step below it, and the week's reading is dropped
  // to match (see baseline).
  state.shore = TREAD_LOW - state.step;
  state.drop = waterline - state.shore;
  // Where the sea will fall: the same quantile base.js takes, read off the
  // tableland's own ground (which is what the waterline is a shore of). A crack's
  // bed grades either side of it, so a canyon is dark cut rock with broken
  // threads of water rather than a canal.
  const ga2 = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = ga2 * i;
    probe.x = Math.cos(th) * r;
    probe.y = y;
    probe.z = Math.sin(th) * r;
    raw[i] = terraced(raw[i] - state.drop, probe.x, probe.y, probe.z, ctx, true);
  }
  const terracedSorted = Float64Array.from(raw).sort();
  state.sea = terracedSorted[clamp(Math.round(state.share * (N - 1)), 0, N - 1)];
  state.canyons = canyonsFor(ctx);
  buildMonuments(ctx);
}

/**
 * The week's own landmarks: the buttes and the natural bridges. Both are read
 * against the reading the bake just took (the shore, the sea, the step), so they
 * stand where they can be seen — a butte on the low ground, a bridge over a cut
 * that the week's own rides made.
 */
function buildMonuments(ctx) {
  const R = ctx.R;
  const brng = ctx.rng('mesa/buttes');
  const buttes = [];
  const want = BUTTE_MIN + Math.round(brng() * (BUTTE_MAX - BUTTE_MIN));
  const dir = { x: 0, y: 0, z: 0 };
  for (let tries = 0; tries < 96 && buttes.length < want; tries++) {
    const y0 = brng() * 2 - 1;
    const r0 = Math.sqrt(Math.max(0, 1 - y0 * y0));
    const th0 = brng() * Math.PI * 2;
    const bx = Math.cos(th0) * r0, by = y0, bz = Math.sin(th0) * r0;
    dir.x = bx; dir.y = by; dir.z = bz;
    const stand = terraced(ctx.classicBaseline(dir) - state.drop, bx, by, bz, ctx, true);
    // low ground only: the first tread above the shore, standing well clear of
    // the sea, and never next to another butte
    if (!(stand > state.sea + state.step * BUTTE_SINK) || stand > state.shore + state.step * 1.5) continue;
    let apart = true;
    for (let i = 0; i < buttes.length; i++) {
      if (buttes[i].x * bx + buttes[i].y * by + buttes[i].z * bz > 0.90) { apart = false; break; }
    }
    if (!apart) continue;
    const refx = Math.abs(by) > 0.9 ? 1 : 0, refy = refx ? 0 : 1;
    let ex = by * 0 - bz * refy, ey = bz * refx - bx * 0, ez = bx * refy - by * refx;
    const el = Math.hypot(ex, ey, ez) || 1;
    ex /= el; ey /= el; ez /= el;
    const la = BUTTE_SPAN * (0.78 + 0.44 * brng());
    const lc = la * BUTTE_RATIO;
    // one to three of the week's own steps: a butte's cap stands over the low
    // ground it was cut back from
    const steps = BUTTE_STEPS_MIN + Math.round(brng() * (BUTTE_STEPS_MAX - BUTTE_STEPS_MIN));
    buttes.push({
      x: bx, y: by, z: bz, ex, ey, ez,
      nx: by * ez - bz * ey, ny: bz * ex - bx * ez, nz: bx * ey - by * ex,
      la, lc, steps, cap: brng() < BUTTE_CAP ? 1 : 0,
      gate: Math.cos(Math.min(1.5, (la * 1.6 + 8) / R)),
    });
  }
  state.buttes = buttes;

  // the bridges: laid where the week's own cuts run, at a point along the cut
  // with the country's own spread on either side of it
  const arng = ctx.rng('mesa/arches');
  const arches = [];
  for (let i = 0; i < state.canyons.length && arches.length < ARCH_MAX; i++) {
    const canyon = state.canyons[i];
    if (!canyon.crack) continue;
    const chunks = canyon.chunks;
    if (chunks.length < 2) continue;
    const chunk = chunks[1 + Math.floor(arng() * (chunks.length - 2))];
    const seg = chunk.seg;
    const n = seg.length / 3;
    const k = Math.max(1, Math.min(n - 2, Math.floor(n * 0.5)));
    const px = seg[k * 3], py = seg[k * 3 + 1], pz = seg[k * 3 + 2];
    let tx = seg[(k + 1) * 3] - seg[(k - 1) * 3];
    let ty = seg[(k + 1) * 3 + 1] - seg[(k - 1) * 3 + 1];
    let tz = seg[(k + 1) * 3 + 2] - seg[(k - 1) * 3 + 2];
    const tl = Math.hypot(tx, ty, tz);
    if (!(tl > 1e-6)) continue;
    tx /= tl; ty /= tl; tz /= tl;
    // the bar's own crossing: square to the cut, in the cut's own tangent plane
    let ex = py * tz - pz * ty, ey = pz * tx - px * tz, ez = px * ty - py * tx;
    const el = Math.hypot(ex, ey, ez) || 1;
    ex /= el; ey /= el; ez /= el;
    let apart = true;
    for (let j = 0; j < arches.length; j++) {
      if (arches[j].x * px + arches[j].y * py + arches[j].z * pz > 0.985) { apart = false; break; }
    }
    if (!apart) continue;
    dir.x = px; dir.y = py; dir.z = pz;
    const tread = terraced(ctx.classicBaseline(dir) - state.drop, px, py, pz, ctx, true);
    const half = clamp((canyon.shoulder ? canyon.shoulder.width : canyon.crack.width * 2) * ARCH_REACH, 22, 62);
    arches.push({
      x: px, y: py, z: pz,
      ex, ey, ez,
      tx: py * ez - pz * ey, ty: pz * ex - px * ez, tz: px * ey - py * ex,
      tread, half, wide: ARCH_WIDE_MIN + ARCH_WIDE_SPREAD * arng(),
      gate: Math.cos(Math.min(1.5, (half + ARCH_WIDE_MIN + ARCH_WIDE_SPREAD + 10) / R)),
    });
  }
  state.arches = arches;
}

/**
 * One terrace: the ground is laid on whole steps of `state.step`, the edges of
 * the risers wandering with the week's own noise and the treads rolling gently.
 * `first` is the baseline pass, which is the one that reads the mesa gain, the
 * table field and the sea floor's fall into the height — the shape pass reads
 * the same ground against the plain lattice the first pass left it on.
 * Idempotent either way: ground already on a tread stays on it, which is what
 * lets the same function run before and after base.js's route carves.
 */
function terraced(h, x, y, z, ctx, first) {
  const step = state.step, shore = state.shore;
  const roll = ROLL_AMP * (ctx.nz(x * ROLL_FREQ, y * ROLL_FREQ, z * ROLL_FREQ) * 2 - 1)
    + ROLL_FINE * (ctx.nz(x * ROLL_FINE_FREQ, y * ROLL_FINE_FREQ, z * ROLL_FINE_FREQ) * 2 - 1);
  // the week's own rise above the waterline, lifted by mesa's gain
  const grown = first && h > shore ? shore + GAIN * (h - shore) : h;
  // the sea floor: the week's own ground, pushed down over the first step below
  // the waterline (baseline pass only, so the shape pass leaves it as it is)
  const deep = first
    ? SEA_DEEPEN * step * smoothstep(clamp((shore - grown) / step, 0, 1))
    : 0;
  const ground = grown - deep - roll;
  if (ground <= shore) return grown - deep;
  // the tables are tableland, not sea floor: the lift fades in over the first
  // step above the waterline, so the week's own drowned ground stays drowned.
  // The buttes stand on that tableland too, and take the same fade.
  const landK = smoothstep(clamp((grown - shore) / step, 0, 1));
  const table = first
    ? (step * TABLE_STEPS
      * smoothstep(clamp((ctx.nz(x * TABLE_FREQ, y * TABLE_FREQ, z * TABLE_FREQ) - TABLE_LO) / (TABLE_HI - TABLE_LO), 0, 1))
      + butteLift(x, y, z, ctx.R)) * landK
    : 0;
  const t = (ground + table - shore) / step
    + TERRACE_JITTER * ctx.nz(x * TERRACE_FREQ, y * TERRACE_FREQ, z * TERRACE_FREQ);
  // one step clear of the waterline: the sea is met by the lowest riser, and the
  // lowest tread keeps rock under its canyons
  return shore + step * (1 + Math.floor(t)) + roll;
}

export default {
  id: 'mesa',
  label: 'Mesa',
  blurb: "A riding week's planet: separate tables of red rock in two or three steps, the rides cut through them as dry canyons, and a hard little sea at the foot of the lowest riser.",

  /** A riding week, and only one that rides more than it runs: the gate is the
   *  bike's share. Past it the claim grows with that share and with the lead it
   *  holds over running, so a week half run is never mesa's. */
  fit(stats) {
    const sports = stats?.sports || {};
    const ride = Number.isFinite(sports.ride) ? sports.ride : 0;
    const run = Number.isFinite(sports.run) ? sports.run : 0;
    if (ride < RIDE_GATE || ride < run) return 0;
    const over = clamp((ride - RIDE_GATE) / 0.3, 0, 1);
    const lead = clamp((ride - run) / 0.5, 0, 1);
    return clamp(0.55 + 0.25 * over + 0.16 * lead, 0, 0.96);
  },

  /** Why this week is canyon country, in the week's own numbers. */
  reason(stats) {
    const sports = stats?.sports || {};
    const ride = Math.round((Number.isFinite(sports.ride) ? sports.ride : 0) * 100);
    const indoors = (Number.isFinite(stats?.indoor) ? stats.indoor : 0) >= 0.6;
    return indoors
      ? `canyon country — ${ride}% of the week's hours on the bike, most of it indoors`
      : `canyon country — ${ride}% of the week's hours on the bike`;
  },

  /** The sea, cut back: the tableland is the picture, and what water shows is
   *  the sea at the foot of the lowest riser. The share is filed for the bake,
   *  which runs before base.js takes the sea's own quantile.
   *
   *  The air over the rock is read hot as well. A mesa week's own warmth is the
   *  weather it was ridden in, and the caps dial reads that warmth twice: as the
   *  polar sheet, and as the height the snow line lies at (inkCaps). Ridden at
   *  seventeen degrees a week wore a cream cap across its whole upper hemisphere
   *  and snow on every riser, which is a cold week's picture laid over a desert's
   *  rock. Rock in the sun is hot air: the week's own warmth is lifted toward the
   *  desert's, so the sheet is left at the poles, the snow line stands over the
   *  tableland instead of through it, and what the dial adds to this world is
   *  haze and a warm limb rather than a glacier. */
  climate(c) {
    const sea = Number.isFinite(c.oceanFrac) ? c.oceanFrac : 0;
    c.oceanFrac = sea * SEA_SCALE;
    state.share = c.oceanFrac;
    const warm = Number.isFinite(c.warmth) ? c.warmth : 0.5;
    c.warmth = clamp(warm * 0.72 + 0.32, 0, 0.94);
    return c;
  },

  /** Red rock laid in three values — the canyons' floor darkest and reddest, the
   *  table tops palest — with a violet-umber shade under it and an ultramarine
   *  sea, all shifted by the week's own light: a hot week takes a step warmer, a
   *  cold one a step greyer, and the water keeps the depth the week's sweat gave
   *  it (see seaCalm in ink.js). */
  palette(pal, features) {
    const warmth = clamp(Number.isFinite(features?.warmth) ? features.warmth : 0.5, 0, 1);
    const deep = clamp((Number.isFinite(pal.seaCalm) ? pal.seaCalm : 0) / 0.75, 0, 1);
    // a wash between what a hot week and a cold one would draw the same thing in
    const wash = (name, hot, cold) => {
      const cool = pal[name].clone().setHex(cold);
      pal[name].setHex(hot).lerp(cool, 1 - warmth);
    };
    // Three rock values, kept apart: the canyons and the low ground in oxblood,
    // the middle steps in brick, the tables in pale sand. The lit face of a disc
    // is painted in uDry whatever its height (see ink.js), so these are what the
    // picture's height lives in: every riser, every shaded wall, every parcel of
    // the low ground's bare earth is drawn in one of the three, and the palette's
    // one committed dark is the oxblood under the deepest cuts.
    wash('landLow', 0x6a2a22, 0x5f3a38);   // canyon floors, the low plain
    wash('landMid', 0xa8472c, 0x8f5a48);   // the middle steps
    wash('landHigh', 0xd9bb92, 0xc7ac93);  // the tables
    wash('dry', 0xc59a6e, 0xb39a86);       // the lit face's own wash
    wash('litWarm', 0xe8b87e, 0xd9c3a5);
    pal.crest.copy(pal.litWarm).lerp(pal.crest.clone().setHex(0xefdcc0), 0.4);
    pal.shadeCool.setHex(0x3f2b34);        // violet-umber shade, dark
    pal.bare.setHex(0x7a3a22);             // the low ground's bare earth
    pal.seaShallow.setHex(0x3d5a8c).lerp(pal.seaShallow.clone().setHex(0x39496e), deep);
    pal.seaDeep.setHex(0x1d2748).lerp(pal.seaDeep.clone().setHex(0x141a33), deep);
    pal.cobalt.setHex(0x2f4272);
    pal.teal.setHex(0x4a7090);
    pal.shelf.copy(pal.seaShallow).lerp(pal.shelf.clone().setHex(0x8f6a52), 0.45);
    pal.stone.setHex(0xa8785f);
    pal.inkSoft.setHex(0x4a3f66);
    pal.dark.setHex(0x2b1a20);
    // ---- dust. The sky a desert week hangs under is not the week's own air
    // colour: it is rock, ground to flour and held up — a warm ochre near the
    // horizon where the land runs out, a bleached rose overhead, and the whole
    // far limb of the disc dissolved into it. The terrain's haze band (uFarGlaze)
    // and the sky's low washes are the same pigment, so the tableland's far
    // tables and the air in front of them agree, and the limit of the country is
    // weather rather than the edge of a cut-out.
    pal.skyLow.setHex(0xe8c9a0);
    pal.skyBand.setHex(0xf0d6ac);
    pal.skyWash.setHex(0xd8b892);
    pal.skyHigh.setHex(0xb99a86);
    pal.skyDeep.setHex(0x8a7a86);
    pal.cloudUnder.setHex(0xd9bd9e);
    pal.farGlaze.setHex(0xcfae8b).lerp(pal.paper, 0.22);
    pal.damp = 0;      // no race-week coast pooling: these shores are clean
    // the week's mineral, which ink.js spends in the creases and nowhere else:
    // a burnt brick laid down every riser and round the foot of every table, so
    // a wall of rock carries a band of its own and a canyon has a floor the eye
    // can follow. On flat ground it costs nothing — the term is read off the
    // survey's own slope, and a tread has none.
    pal.accent.setHex(0x9c4626);
    pal.accentAmt = clamp(Math.max(Number(pal.accentAmt) || 0, 0.62), 0, 1);
    // bare earth, never fields: mesa's low ground is rifts of umber and page
    // between the tables — the one value a flat-lit tread carries from orbit
    pal.vegAmt = -1;
    return pal;
  },

  /** The undecorated ground: the week's own baseline, dropped to mesa's datum
   *  and stepped into plateaus. */
  baseline(dir, ctx) {
    bake(ctx);
    return terraced(ctx.classicBaseline(dir) - state.drop, dir.x, dir.y, dir.z, ctx, true);
  },

  /** After the routes: the shoulders, the terraces laid over them, and the
   *  cracks cut last of all. A shoulder is a cut deeper than one step, so the
   *  terrace pass lays it as one clean step down and the canyons' walls are the
   *  terraces' own risers — which is what keeps them sharp at any size. A crack
   *  is narrower than a tread and is cut after that pass, so it survives it: it
   *  is the one cut in the picture that is not quantised. */
  shape(dir, h, ctx) {
    bake(ctx);
    const canyons = state.canyons;
    const x = dir.x, y = dir.y, z = dir.z;
    if (!canyons.length) return terraced(h, x, y, z, ctx, false);
    let cut = h, crack = 0, land = -Infinity;
    for (let i = 0; i < canyons.length; i++) {
      const canyon = canyons[i];
      let best = Infinity, bestSeg = null;
      const chunks = canyon.chunks;
      for (let k = 0; k < chunks.length; k++) {
        const chunk = chunks[k];
        const dx = x - chunk.cx, dy = y - chunk.cy, dz = z - chunk.cz;
        if (dx * dx + dy * dy + dz * dz > chunk.gateSq) continue;
        const d2 = closestSq(chunk.seg, x, y, z);
        if (d2 < best) {
          best = d2;
          bestSeg = chunk.seg;
        }
      }
      if (best === Infinity) continue;
      const d = 2 * ctx.R * Math.asin(Math.min(1, Math.sqrt(best) / 2));
      if (d >= canyon.reach) continue;
      // the ridge profile and the valley carves read the route's own closest
      // point, so it is taken again from the chunk that won (hit belongs to
      // whichever ran last): the ridge and the narrow gorge mesa undoes
      if (canyon.work) {
        closestSq(bestSeg, x, y, z);
        cut -= ridgeProfile(canyon.work, d, x, y, z, ctx, state.dials);
        cut += valleyCarve(canyon.work, d, x, y, z, ctx, state.dials);
      }
      // the level this canyon is cut into, before its own shoulder takes it
      // down: what the shoulder may dig and what the crack may keep
      const tread = terraced(cut, x, y, z, ctx, false);
      if (tread > land) land = tread;
      if (canyon.shoulder) {
        const t = carveT(d, canyon.shoulder.width);
        if (t > 0) {
          const depth = Math.min(canyon.shoulder.depth, Math.max(0, tread - (state.sea + state.step * (CRACK_GRADE - CRACK_DIP))));
          if (depth > 0) cut -= depth * smoothstep(t);
        }
      }
      if (canyon.crack) {
        // the crack's own width wanders along its length, so no canyon is a
        // ruled cut (and a canyon drawn on an arc is not a canal), and its floor
        // grades with the same noise. Both read the canyon's own closest point,
        // taken from the chunk that won.
        if (!canyon.work) closestSq(bestSeg, x, y, z);
        const wander = ctx.nz(hit.x * CRACK_WOBBLE, hit.y * CRACK_WOBBLE, hit.z * CRACK_WOBBLE) * 2 - 1;
        // the bed's own grade, at half the crack's wander again: short pools and
        // bars down a canyon, never one even canal of water
        const grade = ctx.nz(hit.x * CRACK_WOBBLE * 0.85, hit.y * CRACK_WOBBLE * 0.85, hit.z * CRACK_WOBBLE * 0.85) * 2 - 1;
        const base = state.sea + state.step * (CRACK_GRADE * grade - CRACK_DIP);
        const t = carveT(d, canyon.crack.width * (1 + CRACK_WOBBLE_K * wander));
        if (t > 0) crack += Math.min(canyon.crack.depth, Math.max(0, tread - base)) * smoothstep(t);
      }
    }
    const ground = terraced(cut, x, y, z, ctx, false);
    let out = ground - crack;
    // a canyon's floor is its own graded bed, never higher than the tread it is
    // cut into (so a canyon fades out over the shore instead of damming it)
    if (land > state.shore + 0.05) {
      const keep = Math.min(land, state.sea + state.step * (CRACK_GRADE - CRACK_DIP));
      if (out < keep) out = keep;
    }
    // ---- the natural bridges, laid last of all: a deck of rock left across the
    // cut at the tread the cut was made in, so the canyon's dark stops at the
    // bridge and goes on beyond it.
    if (state.arches.length && land > state.shore) {
      const deck = archTop(x, y, z, ctx.R);
      if (deck > out) out = deck;
    }
    return out;
  },

  /** The orbit mesh's relief cap. mesa's risers and its canyons' walls are
   *  vertical faces, and a table's flat top does not need the headroom a mountain
   *  chain does — but the cap has to stand above the tallest tread the week's own
   *  staircase reaches (the week's rise over its waterline, gained, over a step
   *  of four units), or the top tables are cut off flat at the cap and read from
   *  orbit as one pale wrapping strip laid round the globe. The cap is set to the
   *  height that leaves the whole staircase standing and no more: the tallest
   *  ground a heavy mesa week draws measures forty-one units above the sea, so
   *  thirty was still cutting the top tables flat — and the cut is a plane, not a
   *  cliff, which is why it reads as a strip laid over the globe. Forty-four
   *  clears it with the survey's own margin. */
  orbit: { reliefCap: 44 },
};

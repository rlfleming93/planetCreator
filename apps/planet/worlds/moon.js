/* Planet Creator — the rest moon world.
 *
 * A week that hardly moved is not a continent with a small hill on it: it is a
 * body with almost nothing on it at all. So a rest week is read as an airless
 * moon — the sea is gone (climate.oceanFrac 0), the ground is one grey plain
 * eight and a fifth units up with a swell of a unit either way under it, and the
 * week's own record is stamped into it: one crater to a session, its radius
 * from the minutes spent, two old basins and a seeded field of twenty-odd more
 * over the rest of the sphere, all of them drawn at the scale the painter can
 * read from orbit at all. The plain sits in the palette's middle band, the
 * floors fall through the low band into the ink at its foot, and the rims stand
 * in the high band pale against the plain: three bands of height are the whole
 * of the drawing the light does not do. Nothing grows on it, nothing pools on
 * it, and the light stops hard where the sun does.
 *
 *   fit       hours under 2.6, or two sessions or fewer. 0.95 and up when it
 *             is unmistakably a rest week, so the moon takes the tiny weeks.
 *   climate   no sea, and a gentle ground.
 *   baseline  the swell of the plains, and their fine tooth.
 *   shape     the craters, laid last so they keep the ground's last word.
 *   palette   stone and ink, with the week's one mineral accent kept in the
 *             floors of the craters, under a sky with no weather in it.
 *   companions  a smaller moon, hanging in the sky beside it, solved into the
 *             poster's own upper-left corner of the crop.
 *
 * Every number here is a function of the week: the same week draws the same
 * moon twice. The crater field is built once per readWeek (lazily, keyed on the
 * context it is built from) and read back per vertex with a chord test and no
 * trigonometry — a vertex is only ever inside a crater or not.
 */
import { paintedMoon } from './companions.js';
import { P } from '../params.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const num = (v) => (Number.isFinite(v) ? v : 0);

/* ------------------------------------------------------------ the trigger -- */

// A rest week is one that barely happened: hardly any hours, or no more than a
// couple of sessions in it. Either alone is enough — a single long walk and a
// weekend of football are both rest weeks in the reading's terms.
const REST_HOURS = 2.6;
const REST_COUNT = 2;
// How sure the world is of a week it has claimed, and how much surer a very
// empty week makes it. A week under either half of the trigger *is* a rest
// week, so the fit is a statement and not a hope — and it has to clear `auto`'s
// margin over whatever else wants the same tiny weeks (a short cold week is a
// tundra's too), which is why the floor sits high enough to lead by more than
// the 0.12 `auto` asks for.
const FIT_BASE = 0.95;
const FIT_LEAD = 0.045;

/** The week measured against the trigger, or null when it is not a rest week. */
function restOf(stats) {
  if (!stats || typeof stats !== 'object') return null;
  const hours = Number(stats.hours), count = Number(stats.count);
  if (!Number.isFinite(hours) || !Number.isFinite(count)) return null;
  if (hours >= REST_HOURS && count > REST_COUNT) return null;
  return { hours, count };
}

/* ------------------------------------------------------------- the ground -- */

// The plains sit in the middle of the palette's height bands — high in them, so
// that a rim has only the first few units of the high ramp to climb before it
// reads pale. TERRAIN_FRAG ramps landLow → landMid over 0.5 … 7 u and landMid →
// landHigh over 9 … 20 u, so a plain at eight and a fifth is laid as the mid
// wash with the whole of the low ramp beneath it and the whole of the high ramp
// above — and those three ramps are the whole of the drawing the height does
// where the light has not already chosen a wash. The swell moves the plain less
// than the width of the band it sits in, so the plain stays one wash however the
// ground rolls beneath it.
const PLAIN_H = 8.2;
const SWELL_H = 1.1;    // the broad rise and fall beneath everything
const GRAIN_H = 0.3;    // the fine tooth of the rock
const SWELL_FREQ = 2.2; // noise cells ≈ 55 u across, with the octaves below that
const GRAIN_FREQ = 7.5; // ≈ 16 u

// Craters are drawn at the scale the painter can read from orbit at all: the
// ink shader reads a globe's form off its survey at a step of tens of units —
// some thirty at the poster's distance, growing with it — and takes the colour
// of the ground off the height bands above, so a bowl a few units across is a
// smudge in the value plan and nothing else. These are the range of the Moon's
// own large craters against its own radius: a session leaves a mark a third of
// the way across the disc.
//
// A session's crater: fourteen units, plus a good deal for every minute spent.
const CRATER_BASE = 14;
const CRATER_PER_MIN = 0.25;
const CRATER_MIN = 25;
const CRATER_MAX = 40;
// The seeded field: how many, and how big. They are spread by the golden
// spiral so no part of the sphere is left bare, and jittered off it so the
// spread does not read as a lattice. Two of the field are the moon's own old
// basins, drawn in the sessions' size class, so every rest week — even one with
// no session on it at all — carries three or four marks big enough to read.
const FIELD_COUNT = 24;
const FIELD_R_MIN = 12;
const FIELD_R_MAX = 22;
const BASIN_COUNT = 2;
const BASIN_R_MIN = 26;
const BASIN_R_MAX = 34;
const CRATER_CLEAR = 1.05;         // two field bowls never overlap
const CRATER_CLEAR_SESSION = 1.2;  // a session's bowl keeps a rim of plain clear
// A crater's depth and its lip, both from its radius. The depth carries the
// floor through the low ramp and out of the far end of it — a plain at 8.2 and
// a floor well under two units, which is the low band pure — and it is deep
// enough that the relief itself survives the survey the shader reads a globe's
// form from: that survey takes a difference of the ground some thirty units
// either side of a point, so a bowl has to be a good ten units deep before its
// wall reads as steep, and a steep crest is what the dry brush breaks pale on.
// The lip is what carries the rim up the high ramp into the pale wash, and it is
// fed by the size of the bowl it stands round, so a session's own mark wears the
// brightest rim on the moon. Both hold inside the band the drawing is written
// in: nothing on this moon stands more than eighteen units over its plains.
const DEPTH_OF = 0.42;
const DEPTH_MIN = 7.0;
const DEPTH_MAX = 11.0;
const LIP_OF = 0.22;
const LIP_MIN = 4.0;       // so even a small bowl's rim climbs the high ramp
const LIP_MAX = 6.8;       // …and the tallest rim stays under the relief cap
const CRATER_REACH = 1.15; // in radii: past this a crater has no say at all
// Shape of the bowl: a flat floor nearly half the way out — the shape the
// palette can read as one dark disc — then the wall climbs to the rim, and the
// lip is a narrow ridge a seventh of a radius wide, so the pale band it draws
// round a bowl is a rim and not a second, wider bowl.
const FLOOR_T = 0.45;
const LIP_W = 0.13;

// One field per readWeek: the week's context is the key, so the craters are
// built on the first vertex and read back — as flat arrays, no property
// lookups — for the other four hundred thousand.
const FIELDS = new WeakMap();

function buildField(ctx) {
  const { rng, placed, R } = ctx;
  const spin = rng('moon/craters');
  const dirs = [];
  const radii = [];
  // One crater to a session, exactly where the week put it: the mark the
  // session left is the session. Its size is the minutes it took — but two
  // sessions a few units apart are two marks on one piece of ground, not one
  // bowl drawn twice, so a mark keeps its rim clear of the marks already laid:
  // the earlier session's bowl is the bigger one and the later gives way.
  for (const place of placed) {
    const minutes = Math.max(6, num(place.hours) * 60);
    let radius = clamp(CRATER_BASE + CRATER_PER_MIN * minutes, CRATER_MIN, CRATER_MAX);
    for (let k = 0; k < radii.length; k++) {
      const dx = place.dir.x - dirs[k * 3], dy = place.dir.y - dirs[k * 3 + 1], dz = place.dir.z - dirs[k * 3 + 2];
      const gap = Math.sqrt(dx * dx + dy * dy + dz * dz) * R / CRATER_CLEAR_SESSION;
      if (gap - radii[k] < radius) radius = gap - radii[k];
    }
    // ground the moon has already stamped keeps one mark: a session that walked
    // the same few units again is one crater drawn once, never two arcs cut
    // through each other
    if (radius < CRATER_MIN * 0.5) continue;
    dirs.push(place.dir.x, place.dir.y, place.dir.z);
    radii.push(radius);
  }
  // The seeded field over the rest of the sphere: laid on golden spirals,
  // jittered off them so the spread does not read as a lattice, and kept clear
  // of the sessions' craters and of each other — a candidate that would overlap
  // one already placed is dropped rather than stamped. Overlapping bowls draw
  // two arcs inside one another, and two arcs inside one another read as a
  // drawn circle, a petal or a mouth, never as two holes in the ground. The
  // moon's own two old basins go down first, on a short spiral of their own —
  // thirty degrees either side of the equator and most of the way round the
  // sphere from each other — so no later bowl can crowd them out.
  const sessionCount = radii.length;
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  const claim = (x, y, z, radius) => {
    for (let k = 0; k < radii.length; k++) {
      // room to breathe: more against a session's own mark than between two of
      // the field, so the week's craters keep a rim of plain around them
      const gap = (radius + radii[k]) * (k < sessionCount ? CRATER_CLEAR_SESSION : CRATER_CLEAR) / R;
      const dx = x - dirs[k * 3], dy = y - dirs[k * 3 + 1], dz = z - dirs[k * 3 + 2];
      if (dx * dx + dy * dy + dz * dz < gap * gap) return;
    }
    dirs.push(x, y, z);
    radii.push(radius);
  };
  for (let i = 0; i < BASIN_COUNT; i++) {
    const y = 1 - (2 * (i + 0.5)) / BASIN_COUNT;
    const a = i * GOLDEN * 1.7 + spin() * 0.8;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    claim(Math.cos(a) * r, y, Math.sin(a) * r, BASIN_R_MIN + (BASIN_R_MAX - BASIN_R_MIN) * spin());
  }
  for (let i = 0; i < FIELD_COUNT; i++) {
    const y = 1 - (2 * (i + 0.5) + (spin() - 0.5) * 1.7) / FIELD_COUNT;
    const a = i * GOLDEN + spin() * 0.8;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    claim(Math.cos(a) * r, y, Math.sin(a) * r, FIELD_R_MIN + (FIELD_R_MAX - FIELD_R_MIN) * spin() ** 2);
  }
  const n = radii.length;
  const field = {
    n,
    x: new Float64Array(n), y: new Float64Array(n), z: new Float64Array(n),
    inv: new Float64Array(n), gate: new Float64Array(n),
    depth: new Float64Array(n), lip: new Float64Array(n),
  };
  for (let i = 0; i < n; i++) {
    const radius = radii[i];
    field.x[i] = dirs[i * 3];
    field.y[i] = dirs[i * 3 + 1];
    field.z[i] = dirs[i * 3 + 2];
    field.inv[i] = R / radius;                          // 1 / the crater's angular radius
    field.gate[i] = (CRATER_REACH * radius / R) ** 2;    // beyond this the chord cannot reach
    field.depth[i] = clamp(radius * DEPTH_OF, DEPTH_MIN, DEPTH_MAX);
    field.lip[i] = clamp(radius * LIP_OF, LIP_MIN, LIP_MAX);
  }
  return field;
}

function fieldOf(ctx) {
  let field = FIELDS.get(ctx);
  if (!field) { field = buildField(ctx); FIELDS.set(ctx, field); }
  return field;
}

/* --------------------------------------------------------- the companion -- */

// A moon needs something in the sky beside it, and the poster is a square crop
// of the frame: the globe's disc fills camera.fill of the short axis and the
// shelf keeps the middle POSTER_CROP of it, so the disc covers 0.85 of the crop
// and the sky that shows is a thin ring with four wide corners. A companion is
// therefore hung in a corner — up and to the left, MOON_CORNER of the way to it
// in each axis, where the crop holds it whole whatever the week.
//
// Where that corner is in the *scene* is not a matter of the direction's own
// angle: the companion stands 1.3 R out while the poster's camera stands under
// 4 R, so a direction at 20° off the eye puts it barely 10° off the middle of
// the frame. What is required is a screen position, so the direction is solved
// for: with the camera at cd (in R), a companion at D (in R) whose transverse
// offset is t and whose depth along the view is a = √(D² − 2t²) shows at
// t / (cd − a) — the frame's own tangent — so t/S = cd − a, a quadratic in t.
const POSTER_CROP = 0.8;      // apps/planet-home/lib/paint.js cuts the central 80%
const MOON_CORNER = 0.72;     // to the corner of the crop, in each axis of the frame
const MOON_R = 0.125;         // the companion's radius, in R
const MOON_D = 1.3;           // its distance from the centre, in R
const POSTER_OFF = 0.28;      // how far the poster's aim is turned toward the sun
const RAD = Math.PI / 180;

const scratchAim = { x: 0, y: 0, z: 0 };
const scratchDir = { x: 0, y: 0, z: 0 };

/** The direction the poster is framed from: the week's own subject — its
 *  activities weighted by time — turned toward the sun by POSTER_OFF, exactly
 *  as base.js turns it (see posterSubject/turnToSun). */
function posterAim(features, sun) {
  let x = 0, y = 0, z = 0;
  for (const f of features.list || []) {
    if (f.kind === 'monument') continue;
    const dir = f.dir;
    if (!dir) continue;
    const seconds = Number(f.stats?.activeS);
    const weight = Number.isFinite(seconds) ? Math.max(900, seconds) : 900;
    x += dir.x * weight; y += dir.y * weight; z += dir.z * weight;
  }
  let len = Math.hypot(x, y, z);
  if (!(len > 1e-6)) {
    const first = features.list?.[0]?.dir;
    x = first ? first.x : sun.x; y = first ? first.y : sun.y; z = first ? first.z : sun.z;
    len = Math.hypot(x, y, z) || 1;
  }
  scratchAim.x = x / len; scratchAim.y = y / len; scratchAim.z = z / len;
  // the sun's own bearing in the aim's tangent plane, and a step along it
  let fx = sun.x - scratchAim.x * (sun.x * scratchAim.x + sun.y * scratchAim.y + sun.z * scratchAim.z);
  let fy = sun.y - scratchAim.y * (sun.x * scratchAim.x + sun.y * scratchAim.y + sun.z * scratchAim.z);
  let fz = sun.z - scratchAim.z * (sun.x * scratchAim.x + sun.y * scratchAim.y + sun.z * scratchAim.z);
  const flen = Math.hypot(fx, fy, fz);
  if (!(flen > 1e-6)) return scratchAim;
  const k = POSTER_OFF / flen;
  x = scratchAim.x + fx * k; y = scratchAim.y + fy * k; z = scratchAim.z + fz * k;
  len = Math.hypot(x, y, z) || 1;
  scratchAim.x = x / len; scratchAim.y = y / len; scratchAim.z = z / len;
  return scratchAim;
}

/* ------------------------------------------------------------ the world --- */

export default {
  id: 'moon',
  label: 'Rest moon',
  blurb: "A week that barely moved, drawn as an airless moon: no sea, a plain of stone, big craters — a session's own mark among them — and a smaller moon for company.",

  fit(stats) {
    const rest = restOf(stats);
    if (!rest) return 0;
    // how far under the trigger the week sits: no hours at all, or a single
    // session, is as empty as a week gets
    const empty = Math.max(
      clamp((REST_HOURS - rest.hours) / REST_HOURS, 0, 1),
      clamp((3 - rest.count) / 3, 0, 1),
    );
    return FIT_BASE + FIT_LEAD * empty;
  },

  /** An airless body: no sea on it anywhere, and a plain whose own swell stays
   *  inside one band of the palette — the craters are the whole of its relief. */
  climate(c) {
    c.oceanFrac = 0;
    c.baseAmp = 1.2;
    return c;
  },

  /** The undecorated ground: the swell of the plains, and their fine tooth.
   *  No continent, no ranges — nothing the week did not put there itself. */
  baseline(dir, ctx) {
    const { nz, fbm } = ctx;
    const x = dir.x, y = dir.y, z = dir.z;
    const swell = fbm(nz, x * SWELL_FREQ + 4.7, y * SWELL_FREQ - 2.3, z * SWELL_FREQ + 9.1, 3) * 2 - 1;
    const grain = fbm(nz, x * GRAIN_FREQ - 7.1, y * GRAIN_FREQ + 5.3, z * GRAIN_FREQ - 1.9, 2) * 2 - 1;
    return PLAIN_H + SWELL_H * swell + GRAIN_H * grain;
  },

  /** The craters, laid last: after the routes and the lagoons, so the marks
   *  the week left are the last word on the ground the poster draws. A bowl —
   *  floor, wall, and the lip the bowl threw up — all read off the chord
   *  between the vertex and the centre: one square root and one exponential
   *  per crater a vertex is inside, and a chord short of the crater's reach is
   *  a compare and a continue. No ejecta blanket beyond the lip: a second ring
   *  of ground above the plain draws a second dried edge round every bowl, and
   *  a bowl with two concentric outlines reads as a drawn circle, not a hole. */
  shape(dir, h, ctx) {
    const field = fieldOf(ctx);
    const x = dir.x, y = dir.y, z = dir.z;
    const cx = field.x, cy = field.y, cz = field.z;
    const inv = field.inv, gate = field.gate, depth = field.depth, lip = field.lip;
    for (let i = 0; i < field.n; i++) {
      const qx = x - cx[i], qy = y - cy[i], qz = z - cz[i];
      const q = qx * qx + qy * qy + qz * qz;
      if (q >= gate[i]) continue;
      const t = Math.sqrt(q) * inv[i];
      const wall = 1 - sstep(FLOOR_T, 1, t);
      const w = (t - 1) / LIP_W;
      h += lip[i] * Math.exp(-w * w) - depth[i] * wall;
    }
    return h;
  },

  /** Stone and ink. The week keeps its paper, its ink and its one mineral
   *  accent; everything the ground is made of is repainted grey — colder the
   *  colder the week was — the lowland is taken away (nothing grows on an
   *  airless moon and nothing pools on it), and the sky is laid deep and
   *  clear, with no haze on it and no weather crossing it.
   *
   *  The greys are laid a step down from the paper on purpose: from orbit the
   *  sky is the sheet itself, so a pale moon would have no edge against it and
   *  the craters would be the only thing one could see. A mid stone disc with
   *  ink in its floors reads as a body in the sky, and the height bands do the
   *  drawing: the floors of the craters fall in landLow, the plains stand in
   *  the middle of the mid band, the rims rise pale into landHigh, and the
   *  week's mineral is mixed into the floors — a note in the dark the poster
   *  reads as the week's own colour, never a wash over it. */
  palette(pal, features) {
    const C = (hex) => new pal.paper.constructor(hex);
    const warm = clamp(num(features?.warmth), 0, 1);
    const stone = (cold, hot) => C(cold).lerp(C(hot), warm);

    // the week's one mineral, before the greys that carry it. Two accents are
    // refused on an airless body: a week whose own is a run's unstated white,
    // which would leave a grey disc with a grey note in it, and the sage of the
    // sport family, which on stone reads as moss — the moon is not a place
    // anything grows. Both weeks keep the drawing's own red instead, so the
    // mineral in the craters is a pigment on every rest week and never a hue
    // borrowed from the weather.
    const raw = pal.accent;
    const top = Math.max(raw.r, raw.g, raw.b);
    const spread = top - Math.min(raw.r, raw.g, raw.b);
    const green = raw.g > raw.r && raw.g > raw.b;
    const accent = (top > 0.86 && spread < 0.09) || green ? pal.vermilion.clone() : raw.clone();
    const peak = Math.max(accent.r, accent.g, accent.b);
    if (peak > 0) accent.multiplyScalar(0.45 / peak);

    // the ground, in the three bands the height draws it in: the floors of the
    // craters under two units, which is the low band pure and the darkest
    // pigment on the body; the plains at eight and a fifth, every one of them
    // the middle band's own grey; and the rims and crests above ten, the high
    // band pale against it. The three are kept far apart in value and not only
    // in hue, because from orbit the value plan lays its washes over broad
    // shapes — the mid-ground is read off the lit planes and the low ground off
    // the folds — so a bowl reads as a bowl only when its floor and its rim
    // arrive as two different pigments and not as two shades of one. The stone
    // itself is grey with only a whisper of the week in it — a moon is not a
    // weather — and the week's mineral is concentrated where the pigment
    // belongs: in the floors of the craters, which is the one place on the disc
    // where the week's own colour can be read at all.
    const tint = (c, amount) => c.lerp(accent, amount);
    pal.landLow = tint(stone(0x0c0e16, 0x100e13), 0.34);
    pal.landMid = tint(stone(0x767c85, 0x7f7768), 0.05);
    pal.landHigh = tint(stone(0xd8d3c4, 0xded6bf), 0.05);
    pal.litWarm = tint(stone(0xa9a395, 0xb5a98f), 0.06);
    pal.shadeCool = tint(stone(0x1a2036, 0x22202c), 0.1);
    pal.crest = tint(stone(0xcfcabf, 0xd5c9b1), 0.04);
    pal.dry = tint(stone(0xbdb7aa, 0xc7baa0), 0.06);
    pal.dark = tint(stone(0x161b2b, 0x1a1c2a), 0.14);
    pal.ink = stone(0x1a2032, 0x1f2233);
    pal.inkSoft = stone(0x333a4e, 0x3a3849);
    pal.sepia = stone(0x55534c, 0x62594a);
    pal.stone = stone(0x9a9e9f, 0xa59e8d);
    pal.farGlaze = stone(0xa8aaa7, 0xb1a897);

    // the sea is not drawn, and it is not left blue either: nothing on this
    // body is water, so the pigment the water would have been laid in is the
    // pigment of the floors it can only ever show inside. A pool in the deepest
    // bowl reads as one more shade of the bowl.
    pal.teal = pal.landMid.clone();
    pal.cobalt = pal.landLow.clone();
    pal.seaShallow = pal.landLow.clone();
    pal.seaDeep = pal.landLow.clone();
    pal.foam = pal.paper.clone();
    pal.shelf = pal.landLow.clone();
    pal.damp = 0;
    pal.seaCalm = 0;
    // the washes are broken by the rock's own form rather than laid as clean
    // planes: an easy week is calm (uCalm 1) and a moon is not a field — at
    // this value the value steps follow the craters instead of the survey
    pal.calm = 0.3;
    pal.vegAmt = 0;

    // the sky: a deep, cold wash with the sheet's own band along the horizon
    // and the glazed dark above it — an airless sky, laid in one pigment. No
    // heat haze at all (skyHaze is the wash itself, skyScheme.y is 0), no
    // weather whatsoever (the cloud scale is negative: the shader's own cloud
    // gate keeps a sliver at zero, so the scale has to go under it), one tight
    // sun, no cirrus.
    // From orbit the app draws bare paper for a sky and these fields only
    // reach the landing, where the same week's air is finally in front of the
    // eye; from the poster they decide the veil's own colour, nothing more.
    pal.skyBand = stone(0x9aa0b1, 0xa39fa4);
    pal.skyWash = stone(0x5b6480, 0x61607c);
    pal.skyDeep = stone(0x2b3146, 0x302f44);
    pal.cloudUnder = stone(0x8b92a6, 0x94919f);
    pal.skyHigh = pal.skyDeep.clone();
    pal.skyLow = pal.skyBand.clone();
    pal.skyHaze = pal.skyWash.clone();
    pal.skyScheme.set(0.02, 0, -0.2, 0.6);
    pal.skyCirrus = 0;

    // the mineral is in the rock, not over it: the accent the readout speaks
    // of is the one the week earned, and it is laid in the craters' floors and
    // in the deepest shade, where TERRAIN_FRAG keeps it
    pal.accent = accent;
    return pal;
  },

  /** A smaller moon, hanging in the sky beside it: pale stone, a few craters of
   *  its own, turning slowly on its axis. It is painted through the companion
   *  helper with a palette of its own: the helper's terminator is the same
   *  ragged wash edge every object in the world is drawn with, and at the size
   *  of a disc in the sky that edge reads as a bite taken out of it — so the
   *  moon's own dark is carried to a mid slate before it is handed over, and
   *  what shows is a phase rather than a hole. */
  companions(ctx) {
    const sun = ctx.uniforms?.uSunDir?.value;
    const aim = sun ? posterAim(ctx.features, sun) : null;
    if (!aim) return null;
    // the poster's own screen basis: the camera sits on `aim` looking at the
    // centre with +Y as its up, so the right of the frame is (0,1,0) × aim and
    // the top of it is aim × right
    let rx = aim.z, ry = 0, rz = -aim.x;
    let len = Math.hypot(rx, ry, rz);
    if (!(len > 1e-6)) { rx = 1; ry = 0; rz = 0; len = 1; }
    rx /= len; ry /= len; rz /= len;
    const ux = aim.y * rz - aim.z * ry, uy = aim.z * rx - aim.x * rz, uz = aim.x * ry - aim.y * rx;
    // the corner of the crop, in the frame's own tangent units: the crop's half
    // is POSTER_CROP of the frame's half angle; then the world offset that
    // *shows* there, solved for the perspective (see the constants above)
    const fovRad = num(P['camera.fov']) * RAD;
    const cd = 1 / Math.max(0.05, Math.sin(num(P['camera.fill']) * fovRad / 2));
    const S = MOON_CORNER * POSTER_CROP * Math.tan(fovRad / 2);
    const qa = 1 / (S * S) + 2, qb = -2 * cd / S, qc = cd * cd - MOON_D * MOON_D;
    const t = (-qb - Math.sqrt(Math.max(0, qb * qb - 4 * qa * qc))) / (2 * qa);
    const a = Math.max(0.2, cd - t / S);
    const dx = aim.x * a - rx * t + ux * t;
    const dy = aim.y * a - ry * t + uy * t;
    const dz = aim.z * a - rz * t + uz * t;
    const dlen = Math.hypot(dx, dy, dz) || 1;
    scratchDir.x = dx / dlen; scratchDir.y = dy / dlen; scratchDir.z = dz / dlen;
    // the helper's own lit/shade pair is taken from the palette it is handed, so
    // its dark side is lifted into slate before it is asked for a moon
    const pal = ctx.palette;
    const soft = {
      ...pal,
      ink: pal.ink.clone().lerp(pal.landMid, 0.35),
      shadeCool: pal.shadeCool.clone().lerp(pal.landMid, 0.45),
    };
    return paintedMoon({ ...ctx, palette: soft }, {
      radius: ctx.R * MOON_R,
      distance: ctx.R * MOON_D,
      dir: scratchDir,
      seed: 11.7,
      drift: 0.03,
    });
  },

  /** Why this week reads as a moon: how empty it was, in its own numbers. */
  reason(stats) {
    const count = Math.max(0, Math.round(num(stats?.count)));
    const hours = num(stats?.hours);
    return `rest week: ${count} session${count === 1 ? '' : 's'}, ${hours.toFixed(1)} h`;
  },

  // The rims are the moon's own high ground — a single lip crest stands some
  // fifteen units over the plain, and where two of them meet the ridge reaches
  // eighteen — so round five's twelve-unit ceiling is lifted to leave them
  // whole. A rim on the limb then chews the silhouette by six units of a
  // hundred and twenty, which is the moon's own edge and not a mountain chain:
  // nothing on this body stands higher than its own bowls threw up.
  orbit: { reliefCap: 19 },
};

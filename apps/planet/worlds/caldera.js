/* Planet Creator — the caldera world.
 *
 * A hard week is a week with a few loud things in it, and classic draws it as a
 * crumpled continent: more relief, deeper shadow, the same texture everywhere —
 * the sessions that went to the top of the watch read as grain, not as facts.
 * This world gives them a place. Each of the week's heaviest sessions stands its
 * own volcano on the globe and the summit of each is a caldera: a broad dome,
 * a ring wall lifted along the crest, a level pan of ash inside it, and radial
 * furrows draining down the flanks. The session's own load draws the crater's
 * size, so the week's loudest day is the week's widest ring; the ground between
 * the volcanoes is raked into ash plains — the week's fine relief at a quarter
 * of its depth, two slow drifts over it, and a wobble on the flanks so the
 * washes do not band the domes into contours.
 *
 * The craters are a handful of radial profiles, precomputed once per week from
 * the sites the reading already placed (worldCtx.placed) and then evaluated per
 * vertex: a dot product to skip a vertex outside a ring, and only then one
 * angle, one walk out along the profile and one Chebyshev walk round for the
 * furrows' azimuth — no allocation, no trig for the azimuth, and the plain's
 * own fbm is what the whole world is built from.
 *
 * The scale is not a taste call. From orbit the ink reads a form at a step of
 * tens of world units (ink.js: `su = 2.4 + 0.06 * dist`), and a wash only
 * breaks where the ground bends by a good twenty degrees across that step, so a
 * ring has to stand ten units and more or it is drawn as nothing at all — which
 * is exactly what the first four passes at this world were. A volcano whose pan
 * would fall below the week's own water is lifted onto its own pad, and the
 * crest is then held under the plain's ceiling so nothing of the world's own
 * shape is ever flattened by the cap the orbit mesh draws under.
 *
 * The palette is the week's own, pulled to the five pigments a volcanic field
 * is painted with — ash grey, burnt umber, madder, violet and ink — and the
 * world repaints the fields the ink reserves for its pale washes (`dry`,
 * `crest`) because at orbit those are what the driest ground is drawn in, and a
 * world whose plains are paper reads as blank paper. The race's vermilion is
 * never among them: a race week keeps its own language (worlds/index.js), and
 * this world refuses one at fit() before anything is drawn.
 *
 * No companion, and it was tried twice: a halo of ash hung outside the globe
 * (1.26–1.37 R) is cropped away by the shelf's still, and one hung tight against
 * it (1.04–1.13 R) is buried inside the ground the volcanoes raise — this world's
 * own surface reaches R + 19. There is no radius at which an ash halo reads at
 * the poster's framing, so the world carries no object at all.
 */
const TAU = Math.PI * 2;
const X_AXIS = { x: 1, y: 0, z: 0 };
const Y_AXIS = { x: 0, y: 1, z: 0 };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const step = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// What a week has to be for this world to want it: loud — half its heart-rate
// time in the top two zones — and long enough to have hard sessions at all, the
// load being the week's own count of work. A race week is never a caldera: the
// race keeps its own language (see worlds/index.js).
const HARD_MIN = 0.5;
const LOAD_MIN = 800;

// A few craters, not one per session: three at the most, each at least this far
// from the others, and none under this share of the week's loudest day's work —
// anything below that is a foothill, not a summit.
const SITE_LIMIT = 3;
const SITE_SPREAD = 0.75;
const SITE_FLOOR = 0.3;

// The session load a crater is drawn at its widest for. Loads run to a few
// hundred for a long hard session, so the square root is what keeps an easy
// hour from drawing a ring the size of a marathon's.
const LOAD_FULL = 300;

// How far off the face the poster is turned a crater may still stand: much past
// this and the ring is foreshortened into the limb, where nothing reads.
const FACE_GATE = Math.cos(1.25);

// The plain's own ceiling, and it is the ranges it is for. The orbit mesh draws
// this world under classic's own cap (CLASSIC_CAP below), so the outline is the
// cap's business and not this number's; what the ceiling does is keep a hard
// week's ranges — which are what a week piles on top of a volcano — from
// standing three times the cap's height above it, so the flat tops the cap
// leaves on the limb are small and few. Past the ceiling the ground is
// compressed rather than lifted: a range laid across a caldera is a ridge.
const CEILING = 17.5;
const CEILING_KEEP = 0.16;

// Classic's own relief cap: the outline every other world is read against, and
// the one this world draws its volcanoes under. A world with its own cap makes
// a globe you can pick out of a shelf by its silhouette alone, which is exactly
// what a caldera week should not be — it is the week's own week.
const CLASSIC_CAP = 12;

// The two numbers a volcano's height budget is spent against, both of them
// absolute heights on the globe: how far a caldera's pan must stand above the
// ground its session was on — so a caldera is a dry pan of ash and never a lake
// with a rim — and how high a ring's wall may stand. A site on low ground is
// lifted by the first of these and pays for it out of the second, which is why
// the wall is the term that moves.
const PAN_CLEAR = 4;
const CREST = 20;

// The week's craters, by week: built once, from the reading's own sites, and
// kept so that the hook, the palette and a bench drawing the same week agree.
const PLANS = new Map();

/** What a session is worth to this world: the week's own count of work, and —
 *  for an import that carries no load — the seconds it spent in the top three
 *  zones, then the time it took. */
function weightOf(place) {
  const a = place.a || {};
  const load = num(a.trainingLoad);
  if (load != null && load > 0) return load;
  const zones = Array.isArray(a.hrZoneSeconds) ? a.hrZoneSeconds : [];
  const hard = (num(zones[2]) || 0) + (num(zones[3]) || 0) + (num(zones[4]) || 0);
  return hard > 0 ? hard / 30 : (place.hours || 0) * 90;
}

/** The direction the week's poster is turned to: the activities' own
 *  time-weighted centre, which is the subject base.js frames the orbit on.
 *  Null for a week with no sites at all to weigh. */
function facingOf(ctx) {
  const placed = Array.isArray(ctx?.placed) ? ctx.placed : [];
  let x = 0, y = 0, z = 0;
  for (const place of placed) {
    const weight = Math.max(900, (place.hours || 0) * 3600);
    x += place.dir.x * weight;
    y += place.dir.y * weight;
    z += place.dir.z * weight;
  }
  const length = Math.hypot(x, y, z);
  return length > 1e-6 ? { x: x / length, y: y / length, z: z / length } : null;
}

/** One crater's own numbers, from the session's weight and the week's PRNG. */
function makeSite(dir, load, base, rng) {
  const charge = clamp(Math.sqrt(Math.max(0, load) / LOAD_FULL), 0, 1.25);
  // The height budget, all of it in absolute units on the globe, and all of it
  // spent so that the volcano keeps the plain's own promises:
  //   PAN_CLEAR  the pan stands this far above the ground the session was on,
  //              so a caldera is a dry ash pan and not a lake with a rim;
  //   CREST      the crest stands under this, so nothing of the world's own
  //              shape is ever flat-cut by the orbit relief cap, and a volcano
  //              crossing the limb is a mountain and not a box.
  const depth = clamp(4.5 + 3.5 * charge, 4.5, 9);
  const pad = clamp(PAN_CLEAR - base, 0, 5);
  const shoulder = clamp(5 + 4 * charge, 5, 10) + pad;
  const wall = Math.min(clamp(7 + 5 * charge, 7, 13.25), Math.max(5, CREST - shoulder));
  // The tangent basis the furrows are counted in, turned by the site's own
  // phase so two rings never draw their spokes the same way. `e2` is the second
  // tangent, so a vertex's azimuth is a dot product rather than an angle.
  const up = Math.abs(dir.y) > 0.92 ? X_AXIS : Y_AXIS;
  let e1x = dir.y * up.z - dir.z * up.y;
  let e1y = dir.z * up.x - dir.x * up.z;
  let e1z = dir.x * up.y - dir.y * up.x;
  const len = Math.hypot(e1x, e1y, e1z) || 1;
  e1x /= len; e1y /= len; e1z /= len;
  const e2x = dir.y * e1z - dir.z * e1y;
  const e2y = dir.z * e1x - dir.x * e1z;
  const e2z = dir.x * e1y - dir.y * e1x;
  const phase = rng() * TAU;
  const cos = Math.cos(phase), sin = Math.sin(phase);
  const radius = clamp(0.28 + 0.22 * charge, 0.28, 0.5);
  return {
    x: dir.x, y: dir.y, z: dir.z,
    radius,
    // The volcano is a dome, never a table: the ground climbs from the plain to
    // the ring and there is no level top for the wash to paint as one pale
    // slab. Its height at the ring, and how far the flank runs out.
    shoulder,
    // the caldera itself: the pan's drop under the ring, and the ring wall
    // lifted along the rim — a wall the light can find, walked like any hill
    depth,
    wall,
    rim: 0.88,
    rimWidth: 0.3,
    // radial drainage: spokes of a wheel counted round the ring, cut deepest
    // where the flank falls steepest
    grooves: 13 + 2 * Math.floor(rng() * 5),
    groove: 3 + 2.2 * charge,
    e1x: e1x * cos + e2x * sin, e1y: e1y * cos + e2y * sin, e1z: e1z * cos + e2z * sin,
    e2x: -e1x * sin + e2x * cos, e2y: -e1y * sin + e2y * cos, e2z: -e1z * sin + e2z * cos,
    gate: Math.cos(radius * 2.0),
  };
}

/** Two shields that meet raise a saddle rather than a crease: the higher of the
 *  two with the join rounded off — never their sum, which would double the
 *  ground's height wherever a week trained two hard sessions side by side. */
function softMax(a, b) {
  const d = a - b;
  return 0.5 * (a + b + Math.sqrt(d * d + 0.36));
}

/** The week's craters: its hardest sessions, thinned to the few that stand
 *  apart, each with the shape its own load draws. The loudest day always has
 *  its ring, wherever it fell; the rest have to be on the side of the globe the
 *  poster is turned to — the week's own activities' time-weighted centre, which
 *  is what base.js frames the orbit on — because a crater on the far side of
 *  the world is a crater nobody ever sees. */
function planFor(ctx) {
  const week = String(ctx?.stats?.week ?? '');
  const cached = PLANS.get(week);
  if (cached) return cached;
  const placed = Array.isArray(ctx?.placed) ? ctx.placed : [];
  const rng = ctx.rng('caldera');
  const ranked = [];
  for (const place of placed) {
    const weight = weightOf(place);
    if (weight > 0) ranked.push({ place, weight });
  }
  ranked.sort((a, b) => b.weight - a.weight);
  const heaviest = ranked.length ? ranked[0].weight : 0;
  const face = facingOf(ctx);
  const sites = [];
  for (let i = 0; i < ranked.length; i++) {
    const { place, weight } = ranked[i];
    if (sites.length >= SITE_LIMIT || weight < SITE_FLOOR * heaviest) break;
    if (i > 0 && face && place.dir.x * face.x + place.dir.y * face.y + place.dir.z * face.z < FACE_GATE) continue;
    const dir = place.dir;
    let clear = true;
    for (const site of sites) {
      if (dir.x * site.x + dir.y * site.y + dir.z * site.z > Math.cos(SITE_SPREAD)) { clear = false; break; }
    }
    if (!clear) continue;
    sites.push(makeSite(dir, weight, 0.94 * ctx.macro(dir), rng));
  }
  // The province the craters stand in: a broad, low swell under the sessions
  // that carried the week, so the rings read as one volcanic field rather than
  // three unrelated hills.
  let lift = 0;
  const centre = { x: 0, y: 0, z: 0 };
  for (const place of placed) {
    const weight = Math.max(0, weightOf(place));
    lift += weight;
    centre.x += place.dir.x * weight;
    centre.y += place.dir.y * weight;
    centre.z += place.dir.z * weight;
  }
  const length = Math.hypot(centre.x, centre.y, centre.z);
  const plan = {
    week,
    sites,
    centre: length > 1e-6 && lift > 0
      ? { x: centre.x / length, y: centre.y / length, z: centre.z / length, lift: clamp(0.9 + 0.006 * lift, 0.9, 1.8), gate: Math.cos(1.2) }
      : null,
  };
  PLANS.set(week, plan);
  return plan;
}

/** The week's craters as the reading built them — the bench reads this to say
 *  where they are, nothing in the render path calls it. */
export function craters(week) {
  return PLANS.get(String(week ?? '')) || null;
}

/** The world's own ground: the week's continent, raked into ash plains, with a
 *  crater on every session loud enough to have one. */
function terrainFor(ctx) {
  const plan = planFor(ctx);
  const nz = ctx.nz;
  const P = ctx.P;
  const baseFreq = P['world.baseFreq'];
  const fine = 0.26 * (P['world.baseAmp'] + P['world.roughAmp'] * ctx.roughness);
  const sites = plan.sites;
  const centre = plan.centre;
  return function calderaGround(dir) {
    const x = dir.x, y = dir.y, z = dir.z;
    // The week's own continent stays — it is where the sea and the land are —
    // a step flatter than classic's, because a volcanic field is a plain first.
    let h = 0.94 * ctx.macro(dir);
    if (centre) {
      const dot = x * centre.x + y * centre.y + z * centre.z;
      if (dot > centre.gate) {
        const t = Math.acos(clamp(dot, -1, 1)) / 1.05;
        h += centre.lift * Math.exp(-t * t);
      }
    }
    let uplift = 0, dug = 0, grooves = 0, pan = 0, laid = false;
    for (let i = 0; i < sites.length; i++) {
      const site = sites[i];
      const dot = x * site.x + y * site.y + z * site.z;
      if (dot < site.gate) continue; // outside everything this ring draws
      const t = Math.acos(clamp(dot, -1, 1)) / site.radius;
      // the dome: the ground climbs from the plain to the ring and falls away
      // outside it — one slope the light can read, with the ring and its pan
      // cut into the top of it
      const shield = site.shoulder * (1 - step((t - 0.18) / 0.95));
      uplift = laid ? softMax(uplift, shield) : shield;
      laid = true;
      if (t < 0.97) {
        // the caldera: a level pan under the ring, rising to the foot of the
        // wall — a floor, not a cone's inside
        const floor = 1 - step((t - 0.3) / 0.66);
        dug -= site.depth * (1 - step((t - 0.62) / 0.3));
        if (floor > pan) pan = floor;
      }
      const rim = (t - site.rim) / site.rimWidth;
      if (rim > -3.2 && rim < 3.2) dug += site.wall * Math.exp(-rim * rim);
      // Radial drainage: the azimuth about the ring's own pole, walked as a
      // Chebyshev polynomial — one multiply a groove, and no angle taken.
      const band = step((t - 1.06) / 0.3) * (1 - step((t - 1.7) / 0.45));
      if (band > 0) {
        const sinT = Math.sqrt(Math.max(1e-8, 1 - dot * dot));
        const c = clamp((x * site.e1x + y * site.e1y + z * site.e1z) / sinT, -1, 1);
        let prev = 1, cur = c;
        for (let n = 2; n <= site.grooves; n++) { const next = 2 * c * cur - prev; prev = cur; cur = next; }
        let w = 0.5 + 0.5 * cur;
        if (w > 0) {
          w *= w; // a valley with shoulders, not a wave
          grooves += site.groove * band * w * (0.62 + 0.38 * ctx.fbm(nz, x * 6.7, y * 6.7, z * 6.7, 1));
        }
      }
    }
    // ash plains: the fine relief of a hard week at a quarter of its depth and
    // two slow drifts over the whole province, so a plain is never a plane —
    // and raked out of every caldera's pan, which is a floor of settled ash
    const relief = 1 - 0.8 * pan;
    h += relief * (
      fine * (ctx.fbm(nz, x * baseFreq, y * baseFreq, z * baseFreq) * 2 - 1)
      + 2.2 * (ctx.fbm(nz, x * 5.5 + 5.7, y * 5.5, z * 5.5, 2) * 2 - 1)
      + 1.7 * (ctx.fbm(nz, x * 13.1 + 2.1, y * 13.1, z * 13.1, 2) * 2 - 1)
    );
    // The flanks carry a wobble of their own, in proportion to the height they
    // stand at: the washes step at fixed heights, and a dome with no noise on
    // it is drawn as concentric bands instead of a volcano.
    h += uplift * 0.14 * (ctx.fbm(nz, x * 3.7 + 11.3, y * 3.7, z * 3.7, 2) * 2 - 1);
    return h + uplift + dug - grooves;
  };
}

/** The material surface, built once per context: the ground is a pure function
 *  of the reading, so the mesh, the probes and the sea's quantile all see it. */
const GROUNDS = new WeakMap();
function groundFor(ctx) {
  let ground = GROUNDS.get(ctx);
  if (!ground) { ground = terrainFor(ctx); GROUNDS.set(ctx, ground); }
  return ground;
}

// The five pigments a volcanic field is painted with. Madder is a plant red deep
// enough to read as rock, umber the burnt earth of the ash plains, violet the
// shade, ink the committed dark — the race's vermilion is not among them.
const MADDER = 0x9c4049;
const MADDER_DEEP = 0x7d2f3c;
const UMBER = 0x8a5230;
const UMBER_DEEP = 0x5f3a24;
const VIOLET = 0x46386e;
const INK = 0x241d33;
const ASH = 0xb0a496;

/** A wash repainted in place: the palette takes `hex`, keeping `keep` of what
 *  the week had laid there. Nothing is allocated — the palette is one object
 *  the whole render reads, and a world repaints it where it stands. */
function repaint(colour, hex, keep) {
  const r = colour.r, g = colour.g, b = colour.b;
  colour.setHex(hex);
  return colour.setRGB(
    colour.r * (1 - keep) + r * keep,
    colour.g * (1 - keep) + g * keep,
    colour.b * (1 - keep) + b * keep,
  );
}

export default {
  id: 'caldera',
  label: 'Caldera',
  blurb: "A hard week drawn as its own volcanoes: a caldera on every session loud enough to leave one, ash plains between, and radial drainage cut down the flanks.",

  fit(stats) {
    const s = stats || {};
    const hard = num(s.hard);
    const load = num(s.load) || 0;
    if (s.race || hard == null || hard < HARD_MIN || load < LOAD_MIN) return 0;
    // How much more than the trigger the week is: a week just over the line is
    // a weak claim, the hardest weeks in the set are a strong one.
    const over = clamp((hard - HARD_MIN) / 0.35, 0, 1) * 0.6 + clamp((load - LOAD_MIN) / 900, 0, 1) * 0.4;
    return 0.56 + 0.4 * over;
  },

  reason(stats) {
    const s = stats || {};
    const hard = Math.round(clamp(num(s.hard) ?? 0, 0, 1) * 100);
    const load = Math.round(num(s.load) || 0);
    return `hard week — ${hard}% of the week's watch in zones 4–5 at a load of ${load} → a caldera on each of its loudest days, ash plains between them`;
  },

  baseline(dir, ctx) {
    return groundFor(ctx)(dir);
  },

  shape(dir, h) {
    // The last word on the ground, and it is the plain's: the week's own ridges
    // and ranges are laid on top of this world's ash, and past the plain's own
    // ceiling they are kept as ridges rather than left to stand a spike on a
    // caldera's rim. Everything the world itself drew is under the ceiling
    // already, so nothing of the volcanoes is touched.
    return h > CEILING ? CEILING + (h - CEILING) * CEILING_KEEP : h;
  },

  palette(pal, features) {
    // How much of the week's own weather is kept beside the volcano's five: a
    // harder week is a deeper, redder one, and the ash goes a step paler.
    const roughness = clamp(num(features?.roughness) ?? 0.5, 0, 1);
    const hard = clamp(num(features?.stats?.hard) ?? roughness, 0, 1);
    const deep = clamp(0.35 + 0.5 * hard, 0, 1);
    const keep = 0.18 + 0.12 * (1 - hard); // the week's own wash, where it is easy
    // The earth first, and darker than the week's own: an ash plain is grey
    // umber, not cream — the rings and their furrows are what carry the light.
    repaint(pal.landLow, hard < 0.5 ? ASH : 0xa2948a, keep);
    repaint(pal.landMid, UMBER, keep);
    repaint(pal.landHigh, MADDER, keep * 0.6);
    repaint(pal.crest, 0xd6c6a4, keep);
    repaint(pal.litWarm, 0xd0a279, keep);
    repaint(pal.shadeCool, VIOLET, keep);
    repaint(pal.ink, INK, keep);
    repaint(pal.inkSoft, 0x3c3450, keep);
    repaint(pal.dark, INK, 0.25);
    repaint(pal.sepia, UMBER_DEEP, keep);
    repaint(pal.bare, UMBER_DEEP, keep);
    repaint(pal.stone, 0x9a8f92, 0.3);
    // no fields and no green on a volcanic field: the lowland's parcels are laid
    // in ash scrub, a grey that belongs to the same five pigments
    repaint(pal.veg, 0x776a50, 0.2);
    repaint(pal.dry, 0x9a8b7a, 0.3);
    // The sea is the ink the rings are cut into: a deep indigo with the madder
    // tide at the shore, kept a step toward the week's own water.
    repaint(pal.seaDeep, 0x232a44, 0.35);
    repaint(pal.seaShallow, 0x5a5a7c, 0.35);
    repaint(pal.cobalt, 0x2b2f55, 0.35);
    repaint(pal.teal, 0x4e5878, 0.4);
    repaint(pal.foam, 0xe4dccc, 0.4);
    repaint(pal.farGlaze, 0x9b93a8, 0.45);
    // the sky over a field of ash: violet at the top, a rose band on the horizon
    repaint(pal.skyHigh, 0x5d5580, 0.4);
    repaint(pal.skyLow, 0xd9c6b8, 0.4);
    repaint(pal.skyBand, 0xe9d3bd, 0.4);
    repaint(pal.skyWash, 0xa9a2bd, 0.4);
    repaint(pal.skyDeep, 0x675f8c, 0.4);
    repaint(pal.cloudUnder, 0xc0b2b8, 0.4);
    // The race's own red is never laid on this world: the deepest madder takes
    // its place wherever a hot week would have warmed the damp paper.
    repaint(pal.vermilion, MADDER_DEEP, 0);
    repaint(pal.accent, deep > 0.75 ? MADDER_DEEP : VIOLET, 0.3);
    pal.accentAmt = clamp((num(pal.accentAmt) || 0) * 0.7, 0, 0.6);
    return pal;
  },

  // The limb is this world's loudest silhouette — a ring wall is meant to stand
  // out of it — so the orbit mesh keeps a cap of its own, above the volcanoes
  // and under the spikes a week's ranges draw across them.
  orbit: { reliefCap: CLASSIC_CAP },
};

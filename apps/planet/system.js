/* Planet Creator — the week's system: its own star, and what the week earned.
 *
 * A week of training is a place in space. Two dials put the rest of that place in
 * the frame, and both are off by default.
 *
 *   system.sun       the week's own star. A week trains at an hour — the mean
 *                    training hour of the reading's own startedAt, weighted by
 *                    active time, on the same training clock base.js reads for
 *                    sun.fromHours — and that hour is the star's pigment: the
 *                    small hours blue-white, dawn orange, midday white-yellow,
 *                    evening red, each mixed into the week's own paper and ink so
 *                    the star is a wash of this week and not a sticker. The disc
 *                    is one flat pigment with its middle lifted off and the
 *                    pigment pooled at the rim, the corona a fan of dry-brush
 *                    spokes with a few sparks thrown past their tips, and the
 *                    lens flare that belongs to a light this bright — the sheet
 *                    itself bleached where the light grazes it, in a graded wash
 *                    that runs out to nothing, and one long streak dragged across
 *                    it. Every edge in
 *                    all of it is cut on its own gradient at about a pixel: a
 *                    brush edge, never a blur. The disc is the one mark here
 *                    allowed to be taken by the shelf's crop — a light that fits
 *                    exactly between the planet's limb and the frame is a washer
 *                    glued to the frame, and ink has always drawn the sun half
 *                    out of the picture. With system.light up (the default)
 *                    the same star is drawn as a light and not as a diagram:
 *                    one loaded warm wash with its middle lifted soft, a bead
 *                    where it dried, a few unequal fans of light, a quiet
 *                    week's halo kept to one broken arc, the flare's graze
 *                    close to the source and its streak a short pale lift.
 *
 *   system.phenomena what the week earned beside it, each read straight off the
 *                    week and drawn in the same hand:
 *                      - a week that doubles up (three or more days carrying two
 *                        sessions — or two such days, on a week of five sessions
 *                        or fewer) earns a binary companion star: the pair stand
 *                        apart in proportion to the two sessions of its widest
 *                        doubled day (and to the primary's own size, so the pair
 *                        keeps its proportion at any scale the frame gives it),
 *                        and the companion's colour is the hour of that day's
 *                        second session. A companion is half of a pair, so a
 *                        doubling week draws the star it stands beside even with
 *                        the star's own dial down — and under both dials the pair
 *                        is one star, drawn once, with the companion beside it;
 *                      - the week's longest run is a comet: a nucleus and coma
 *                        with a dust tail and an ion tail, both swept away from
 *                        the sun, the tail's length off the kilometres that run
 *                        was, foreshortened as the light's own bearing is (with
 *                        system.comet up, a pale nucleus in a round coma, a
 *                        curved dust fan widening as it fades and one cool
 *                        ion thread);
 *                      - a lifting week is an asteroid belt: stones in one merged
 *                        mesh, one wash to a facet, in a wide tilted torus whose
 *                        stones' sizes come from what was lifted (sets and
 *                        volumeKg where the record carries them) and whose count
 *                        comes from the sets;
 *                      - a swimming week gets a small water moon: a cut-out of
 *                        the week's own sea with the currents drifting across it;
 *                      - a yoga or quiet week gets a halo: hairline arcs and a
 *                        faint band, round the star where one is drawn and round
 *                        the globe's own limb where the star's dial is down —
 *                        the stillest thing in the sky either way.
 *
 * Everything is deterministic — the same week always puts the same system in the
 * same place (features.makeRng) — and the only clock is the shared uTime: the
 * slow turning of the belt, the drift of the corona, the moon's own currents.
 *
 * Where the star stands. Two facts decide it. The painted light is what the globe
 * is lit by (ink.js update): underfoot it is the week's own sun, so on foot the
 * star belongs at that direction in the runner's sky. From orbit it is the sun
 * turned toward the painter — always within sixty degrees of his eye, so always
 * at his back — and "at the frame's edge" is that fact taken literally: the
 * sheet's own bearing of the light, its component across the eye, lifted a little
 * toward the emptier part of the frame, with the disc standing as near the crop's
 * edge as the light's bearing allows — on a poster the globe fills, that is the
 * globe's own limb; on a shot that pulls back, the edge of the sheet itself. The
 * star's direction is composed against the sheet from orbit and swung to the real
 * sun as the camera lands; the flare marks follow it in both, which is why they
 * are a sheet of the lens and not a thing in the world.
 *
 * The moon and the comet's head stand in the band between the drawn silhouette
 * (the relief cap, not the sphere: from orbit the limb is the capped globe) and
 * the edge of the shelf's crop, so neither is hidden behind the planet it belongs
 * to and neither is cut by the crop; the star's disc stands on the same bearing
 * but takes the crop's edge, and the crop may take a bite of it in exchange. The
 * belt is a
 * thing of the world: it stands off the globe in its own tilted plane, its near
 * arc crossing the disc and its far arc lost behind it. The comet's tail runs
 * from that band across the globe and out of the sheet — the one mark allowed to
 * leave the picture, because a tail that stopped at the frame's edge would read
 * as a brush stroke and not as a tail. The belt, the moon and the comet all stand
 * nearer than the globe's surface along their own line of sight, which is the
 * only place something drawn over the globe can be and still be true. Those three
 * fade out as the camera lands, the way a body does; the star, its companion and
 * the halo are the sky itself and stay.
 *
 * systemFor(ctx) gets the companions ctx (worlds/index.js companionsFor:
 * { THREE, features, palette, uniforms, washMaterial, R }) and returns the one
 * group named 'companion-system' — the name poster.shot=hero composes with
 * (shots.js companionReach) — carrying userData.reach, the furthest radius the
 * week's system stands at, in planet radii. With both dials at 0 (the default) it
 * returns null and the scene is the scene it has always been.
 */
import { P } from './params.js';
import { attachTeardown } from './teardown.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* ------------------------------------------------------------- the week ---- */

/** The colour of an hour, as a pigment: the four lights a week trains in, and
 *  every hour between them a mix of the two it lies between. These are not
 *  palette colours. The palette is what the week is made of; this is what the sky
 *  did to it, so every one of them is mixed into the week's paper and ink below. */
const HOUR_PIGMENT = [
  [0, '#b7cbe4'],    // the small hours: blue-white, the coldest light there is
  [5.5, '#b7cbe4'],
  [8, '#e08540'],    // dawn: orange, low and warm
  [10.5, '#f2e3ae'], // midday: white-yellow, the light the palette was mixed for
  [16, '#f2e3ae'],
  [18.5, '#c94e28'], // evening: red, the sun going down into the sea
  [21, '#b7cbe4'],
  [24, '#b7cbe4'],
];

/** system.hourSun: the same lights laid over the hours the weeks really train at — 8.5 to 22 h, half of them between
 *  9.75 and 12.5, where the table above is one flat midday — so the dawn's orange runs through amber and gold to
 *  the palette's white-yellow and a true midday white, and the afternoon back through gold and orange to the
 *  evening's red and the crimson of a late session. */
const HOUR_PIGMENT_WIDE = [
  [0, '#b7cbe4'],
  [5.5, '#b7cbe4'],
  [8.5, '#e08540'],   // dawn orange: the earliest week
  [9.75, '#e8a451'],  // amber
  [11, '#efc77a'],    // gold: the median week
  [12.5, '#f2e3ae'],  // the white-yellow the palette was mixed for
  [14, '#f3edd6'],    // midday white
  [16, '#efcf84'],    // afternoon gold
  [17.5, '#e3954a'],  // orange
  [19, '#c94e28'],    // evening red
  [21, '#a33a3e'],    // crimson
  [22.5, '#7c4f7c'],  // the last light, violet
  [24, '#b7cbe4'],
];

/** A palette entry as a fresh colour: palettes hand out hex strings or colours. */
function colourOf(T, value) {
  const c = new T.Color();
  if (typeof value === 'string') c.set(value);
  else if (value && value.isColor) c.copy(value);
  else c.set('#ffffff');
  return c;
}

function pigmentAt(T, table, h) {
  for (let i = 1; i < table.length; i++) {
    const [ha, ca] = table[i - 1];
    const [hb, cb] = table[i];
    if (h <= hb) {
      const t = hb === ha ? 0 : clamp((h - ha) / (hb - ha), 0, 1);
      return colourOf(T, ca).lerp(colourOf(T, cb), t);
    }
  }
  return colourOf(T, table[table.length - 1][1]);
}

function hourColour(T, hour) {
  const h = ((Number(hour) || 0) % 24 + 24) % 24;
  const wide = clamp(Number(P['system.hourSun']) || 0, 0, 1);
  const c = pigmentAt(T, HOUR_PIGMENT, h);
  return wide > 0 ? c.lerp(pigmentAt(T, HOUR_PIGMENT_WIDE, h), wide) : c;
}

/** A stable float seed from the week's own name: two weeks are never one sky. */
function seedOf(week) {
  const s = String(week ?? '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100003) / 1000;
}

/** The hour the week trained at: features.sunHour when the sun dial built one,
 *  else the active-time-weighted mean of the reading's own startedAt on the same
 *  training clock base.js places its sun with. A reading with no usable times is
 *  a late-morning week — the light the palette itself was mixed in. */
function weekHour(features, sessions) {
  if (Number.isFinite(features.sunHour)) return features.sunHour;
  // the mean is over the week's own readings — the sessions weekSessions has
  // already folded by id, so a race that is listed twice (once as the race, once
  // as its finish monument) does not count twice, and neither does any other
  // reading a world lists twice
  let cx = 0, cy = 0, weight = 0;
  for (const s of sessions) {
    const h = s.hour;
    const w = s.activeS;
    if (h == null || !(w > 0)) continue;
    const ang = (h / 24) * TAU;
    cx += Math.cos(ang) * w;
    cy += Math.sin(ang) * w;
    weight += w;
  }
  if (!weight || Math.hypot(cx, cy) < weight * 0.1) return 10.5;
  return ((((Math.atan2(cy, cx) / TAU) * 24) % 24) + 24) % 24;
}

/** One entry per activity of the week: the raw reading, its day (base.js's own
 *  placement), and its hour on the training clock. A race week lists its race
 *  twice — once as the race itself and once as its finish monument, both carrying
 *  the same record — so the records are folded by id. */
function weekSessions(features) {
  const weekStart = Date.parse(`${features.week}T00:00:00Z`);
  const offset = (Number(P['sun.utcOffsetH']) || 0) * 3600000;
  const seen = new Set();
  const out = [];
  (features.list || []).forEach((f, index) => {
    const a = f && f.stats;
    if (!a) return;
    const key = a.id != null ? String(a.id) : `#${index}`;
    if (seen.has(key)) return;
    seen.add(key);
    const at = Date.parse(a.startedAt);
    const day = Number.isFinite(at) && Number.isFinite(weekStart)
      ? clamp(Math.floor((at - weekStart) / 86400000), 0, 6)
      : index % 7;
    out.push({
      day,
      hour: Number.isFinite(at) ? ((((at + offset) / 3600000) % 24) + 24) % 24 : null,
      activeS: Math.max(0, Number(a.activeS) || 0),
      distanceKm: Math.max(0, Number(a.distanceM) || 0) / 1000,
      sets: Math.max(0, Number(a.strength?.sets) || 0),
      volumeKg: Math.max(0, Number(a.strength?.volumeKg) || 0),
      sport: String(a.sport || '').toLowerCase(),
      title: String(a.title || '').toLowerCase(),
    });
  });
  return out;
}

const isRun = (s) => /^(running|walking|hiking)$/.test(s.sport)
  || (s.sport === 'fitness_equipment' && /run|walk|treadmill/.test(s.title));
const isLift = (s) => s.sport === 'training' && !/yoga|pilates|stretch|breath|mobility/.test(s.title);
const isYoga = (s) => s.sport === 'training' && /yoga|pilates|stretch|breath|mobility/.test(s.title);

/** What this week earned, in the sky's own order. Every threshold is the week's
 *  own record: the numbers were read off the 88 weeks the bench carries, so a
 *  doubling week, a long run, a lifting block, a swim week and a quiet one land
 *  where a person would say they do — 40% of those weeks double up, two thirds
 *  run long, a quarter lift, one in thirty swims, one in eight is quiet. */
function weekEarns(features, sessions) {
  const stats = features.stats || {};
  const hours = Number(stats.hours) || 0;

  const byDay = new Map();
  for (const s of sessions) {
    if (!byDay.has(s.day)) byDay.set(s.day, []);
    byDay.get(s.day).push(s);
  }
  let doubled = 0, gapH = 0, lateHour = null;
  for (const list of byDay.values()) {
    if (list.length < 2) continue;
    doubled++;
    const ordered = list.slice().sort((a, b) => (a.hour ?? 0) - (b.hour ?? 0));
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    const gap = first.hour != null && last.hour != null
      ? (last.hour - first.hour + 24) % 24
      : (list.length - 1) * 2;
    if (gap > gapH) { gapH = gap; lateHour = last.hour; }
  }
  const binary = doubled >= 3 || (doubled >= 2 && sessions.length <= 5);

  let longKm = 0;
  for (const s of sessions) if (isRun(s) && s.distanceKm > longKm) longKm = s.distanceKm;
  const comet = longKm >= 5;

  let liftS = 0, sets = 0, volumeKg = 0;
  for (const s of sessions) {
    if (!isLift(s)) continue;
    liftS += s.activeS;
    sets += s.sets;
    volumeKg += s.volumeKg;
  }
  const liftHours = liftS / 3600;
  const belt = liftHours >= 2 || sets >= 18 || volumeKg >= 5000;

  let swimS = 0, yogaS = 0;
  for (const s of sessions) {
    if (s.sport === 'swimming') swimS += s.activeS;
    if (isYoga(s)) yogaS += s.activeS;
  }
  const swimHours = swimS / 3600;
  const moon = swimHours >= 0.35 || (Number(stats.sports?.swim) || 0) >= 0.06;
  const load = Number(stats.load) || 0;
  const halo = yogaS / 3600 >= 0.45 || (hours <= 3.4 && load <= 420);

  return {
    hours, doubled, gapH, lateHour, longKm, liftHours, sets, volumeKg, swimHours,
    earns: { binary, comet, belt, moon, halo },
  };
}

/* ------------------------------------------------------------- the sheet --- */

// The band the frame keeps: base.js composes for the central 80% of the short
// axis and the shelf cuts it (paint.js), so nothing a phenomenon does is allowed
// past 0.795 of the frame's half-height — only the star's flare, which is meant
// to run out of the picture.
const CROP = 0.795;
const POSTER = 0.8;      // base.js's POSTER_CROP, for the same band in still units
const UP_BIAS = 0.42;    // the light's bearing lifted this much toward the frame's top
const GLOBE_BIAS = 0.5;  // ...and this much away from the globe, when it is off the middle
// The star's distance: far behind the planet — a hundred planet radii would be
// further still, but the page's camera stops drawing at 2000 units (ink.js sets
// far), and a light nobody can draw is no light at all. Eleven hundred units is
// nine planet radii out, well beyond the orbit camera and beyond the sky dome the
// page lays at 900, with the whole of it inside the far plane. Nothing about the
// sheet changes with the distance: the sheet is sized from the distance every
// frame, so the disc is the same size on the paper wherever it stands.
const D_STAR = 1150;
const QUAD_K = 4.4;      // the star's sheet, as a multiple of its disc's radius
const SKY_DEPTH = 0.68;  // a sky body's sheet, as a share of the camera's own distance
const STAR_RAY = 0.7;    // the corona's own reach, before the week's own variation

/** The sheet, once a frame: where the eye is, how wide the frame is, where the
 *  globe's drawn silhouette and its own centre fall, and where the light's
 *  bearing lies. Everything a phenomenon needs to place itself is in here. */
function readSheet(sys, camera, renderer) {
  const { R, uniforms } = sys;
  const T = sys.T;
  const s = sys.sheet;
  s.right.setFromMatrixColumn(camera.matrixWorld, 0);
  s.up.setFromMatrixColumn(camera.matrixWorld, 1);
  s.fwd.setFromMatrixColumn(camera.matrixWorld, 2).negate();
  s.tanY = Math.tan((camera.fov * Math.PI) / 360);
  s.aspect = camera.aspect || 1;
  s.m = Math.min(1, s.aspect);
  // the full-frame sheets are laid as squares of half-height units and covered out
  // to the wider viewport: a ring drawn on one stays round on any page, and the
  // coordinates handed to them mean the same thing at any aspect
  s.cover = Math.max(1, s.aspect);
  s.dist = camera.position.length();
  s.light.copy(uniforms.uSunDir.value).normalize();
  if (renderer) {
    renderer.getDrawingBufferSize(s.px);
    s.pxh = Math.max(64, s.px.y);
  }
  // the globe's own centre on the sheet, in half-frame units: the orbit's framing
  // aims its camera at the planet, and a shot may hand the poster a globe off the
  // middle (shots.js hero), so the band is measured from the globe itself
  s.origin.set(0, 0, 0).project(camera);
  s.globeX = s.origin.x * s.aspect;
  s.globeY = s.origin.y;
  // the globe as it is drawn: the orbit mesh is capped (features.orbit.reliefCap),
  // so that, not the sphere, is the edge a phenomenon has to clear
  const capR = R + Math.max(0, Number(sys.features.orbit?.reliefCap) || 0);
  s.sil = s.dist > capR * 1.02
    ? (capR / Math.sqrt(Math.max(1e-3, s.dist * s.dist - capR * capR))) / s.tanY
    : 1.6;
  // the room between that limb and the crop's own edge, and what fits in it
  s.slot = Math.max(0.016, CROP - s.sil);
  s.sky = sstep(1.45, 2.5, s.dist / R);   // 1 from orbit, 0 with the camera on the ground
  // the painted light's own bearing on the sheet, lifted off the bottom of the
  // frame and away from a globe that is not in the middle of it
  const lx = s.light.dot(s.right), ly = s.light.dot(s.up);
  s.lightFlat = Math.hypot(lx, ly);
  let bx = 0, by = 1;
  if (s.lightFlat > 1e-3) { bx = lx / s.lightFlat; by = ly / s.lightFlat; }
  by += UP_BIAS;
  const gn = Math.hypot(s.globeX, s.globeY);
  if (gn > 0.04) { bx -= (s.globeX / gn) * GLOBE_BIAS; by -= (s.globeY / gn) * GLOBE_BIAS; }
  const bn = Math.hypot(bx, by) || 1;
  s.nx = bx / bn; s.ny = by / bn;
  s.tx = -s.ny; s.ty = s.nx;
  // The star: a disc standing on the globe's limb. It is as large as the band the
  // frame keeps — the room between the drawn limb and the crop's own edge — will
  // hold, and it is placed tangent to that limb, so its whole disc stands in the
  // sky and the last hair of it lands on the crop's edge: the biggest sun this
  // camera can put in this frame, at the frame's edge, where a light belongs.
  const band = clamp(CROP - s.sil, 0.02, 1);
  // A sun is the one mark here allowed to be cut by the shelf's crop: a light that
  // just fits between the planet's limb and the edge is a washer glued to the
  // frame, and watercolour has always painted the sun half out of the picture. So
  // the disc takes the band's own size where the globe fills the sheet (and the
  // crop takes its outer rim), and the hero's wider band gives it the cap.
  s.discR = clamp(0.66 * band, 0.050, 0.085);
  // Where its centre stands: on the light's bearing out of the globe, as far from
  // the *frame's* own centre as the crop allows, and never nearer the globe than
  // its limb. The frame's centre is what the crop is measured from, so a shot that
  // pushes the globe off the middle (the hero) pushes the star out with it.
  const rEdge = Math.max(0.05, CROP - 0.70 * s.discR - 0.006);
  const gdist = Math.hypot(s.globeX, s.globeY);
  let tEdge = rEdge;
  if (gdist > 1e-4) {
    const b = s.globeX * s.nx + s.globeY * s.ny;
    tEdge = -b + Math.sqrt(Math.max(0, b * b + rEdge * rEdge - gdist * gdist));
  }
  const rad = Math.max(tEdge, s.sil + s.discR + 0.004);
  s.starX = s.globeX + s.nx * rad * s.m;
  s.starY = s.globeY + s.ny * rad;
  s.bandFrac = s.sil + 0.54 * Math.max(0.01, s.slot);
  // where the star stands: composed against the sheet from orbit, the week's own
  // sun on foot, and swung between the two as the camera comes down
  s.frameDir.copy(s.fwd)
    .addScaledVector(s.right, s.starX * s.tanY)
    .addScaledVector(s.up, s.starY * s.tanY)
    .normalize();
  slerpDir(sys, s.light, s.frameDir, s.sky, s.starDir);
  s.starPos.copy(camera.position).addScaledVector(s.starDir, D_STAR);
  const depth = s.starDir.dot(s.fwd);
  s.starFront = depth > 0.06;
  s.screenX = s.starFront ? s.starDir.dot(s.right) / (depth * s.tanY) : 0;
  s.screenY = s.starFront ? s.starDir.dot(s.up) / (depth * s.tanY) : 0;
  // How much of the star's disc the globe leaves showing. The disc and its halo
  // are depth-tested, so the globe stands in front of them wherever it does; the
  // flare is the lens's and is drawn over everything, so it takes this share
  // instead and goes behind the globe with its light — as the camera comes down
  // and the star swings to a sun the world is turned away from.
  s.starVis = 1;
  if (s.dist > capR * 1.001) {
    const toCentre = Math.acos(clamp(-s.starDir.dot(camera.position) / s.dist, -1, 1));
    const globe = Math.asin(capR / s.dist);
    const disc = Math.atan(s.discR * s.tanY);
    s.starVis = sstep(globe - disc, globe + disc, toCentre);
  }
  // the tails of a comet sweep away from the sun: their own bearing on the sheet,
  // and how much of that bearing the eye was given (a light square behind the
  // painter sweeps almost straight out of sight, and a tail drawn with it would
  // have no length at all)
  const tx = -s.light.dot(s.right), ty = -s.light.dot(s.up);
  const tn = Math.hypot(tx, ty);
  if (tn > 1e-3) { s.tailX = tx / tn; s.tailY = ty / tn; } else { s.tailX = 0; s.tailY = -1; }
  s.foreshort = clamp(s.lightFlat, 0.45, 1);
  s.starHalf = QUAD_K * s.discR * s.tanY * D_STAR;
  s.starPx = 2 / (s.pxh * QUAD_K * s.discR);
  return s;
}

/** A point on the sheet, in half-frame units, as the world direction it lies in:
 *  the tangent plane at unit depth, normalised. The same map readSheet uses for
 *  the star, so a body placed through it lands exactly where it was asked for. */
function sheetDirection(sys, qx, qy, out) {
  const s = sys.sheet;
  return out.copy(s.fwd)
    .addScaledVector(s.right, qx * s.tanY)
    .addScaledVector(s.up, qy * s.tanY)
    .normalize();
}

/** One direction swung toward another along their own great circle. A plain lerp
 *  passes through the origin when the two are nearly opposed, which is exactly
 *  where the painted light and the frame's own edge can stand. */
function slerpDir(sys, a, b, t, out) {
  if (t <= 0) return out.copy(a);
  if (t >= 1) return out.copy(b);
  const cos = clamp(a.dot(b), -1, 1);
  if (cos > -0.9995) {
    const th = Math.acos(cos);
    const sin = Math.sin(th);
    out.copy(a).multiplyScalar(Math.sin((1 - t) * th) / sin).addScaledVector(b, Math.sin(t * th) / sin);
    return out.normalize();
  }
  const axis = sys.axisX;
  axis.set(Math.abs(a.x) < 0.9 ? 1 : 0, Math.abs(a.x) < 0.9 ? 0 : 1, 0);
  const perp = sys.perp.crossVectors(a, axis).normalize();
  const th = Math.PI * t;
  const cross = sys.cross.crossVectors(a, perp);
  return out.copy(a).multiplyScalar(Math.cos(th)).addScaledVector(cross, Math.sin(th)).normalize();
}

/** Compose an object's world matrix from scratch. Every sheet here is written
 *  inside its own onBeforeRender — after the frame's world matrices have already
 *  been walked — so the local matrix and the world one are both set, and the
 *  sheet is exact in the frame it is drawn in, with no frame of lag. */
function setMatrix(node, pos, quat, scale) {
  node.matrixAutoUpdate = false;
  node.matrix.compose(pos, quat, scale);
  node.matrixWorld.copy(node.matrix);
}

/* ---------------------------------------------------------------- glsl ----- */

const NOISE = /* glsl */ `
float syH12(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float syN2(vec2 x){
  vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(syH12(i), syH12(i + vec2(1.0, 0.0)), f.x), mix(syH12(i + vec2(0.0, 1.0)), syH12(i + vec2(1.0, 1.0)), f.x), f.y);
}
float syF2(vec2 p){ float s = 0.0, a = 0.5, n = 0.0; for (int i = 0; i < 3; i++){ s += a * syN2(p); n += a; p = p * 2.03 + vec2(1.7, -2.3); a *= 0.5; } return s / n; }
float syAngle(vec2 v){ return atan(v.y, v.x); }
// one pixel of paper: every edge in the sky here is a brush edge, hard, never a ramp
float syPx(float x, float w){ return clamp(x / max(w, 1e-5) + 0.5, 0.0, 1.0); }
`;

// The sheet every quad here is painted on: an object's own local plane, so the
// meshes carry nothing but their size and their place in the world.
const SHEET_VERT = /* glsl */ `
varying vec2 vP;
void main(){
  vP = position.xy;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}
`;

// The star. One disc of the hour's pigment, the middle of it lifted off with a
// damp brush and the pigment pooled and dried at the rim, and round it a fan of
// dry-brush spokes with a few sparks thrown past their tips. Every edge is cut on
// its own gradient at about a pixel, so the disc stays a disc and the spokes stay
// hairlines at any size the poster is ever printed at.
//
// With system.light up (the default) the star is drawn as the light it is rather
// than as a diagram of one: the same disc and its irregular edge, but one loaded
// warm wash with its middle lifted soft (no edge inside it), the pigment gathered
// toward the rim as a bead where it dried (never an ink ring), the edge crisp round
// most of the disc and eased where the hand eased, and round it a short aura and a
// few unequal fans of light, soft along their sides and run out to nothing.
const STAR_FRAG = /* glsl */ `
uniform vec3 uBody, uCore, uRim, uCor, uSpark, uBead, uFanVoid, uFanPaper;
uniform float uPx, uDisc, uSeed, uAlpha, uSpin, uRays, uLook, uVoid;
varying vec2 vP;
${NOISE}
vec4 syInkStar(vec2 q){
  float r = length(q);
  float ang = syAngle(q);
  float wob = syF2(vec2(cos(ang), sin(ang)) * 2.6 + uSeed) - 0.5;
  float wob2 = syF2(vec2(cos(ang), sin(ang)) * 7.3 + uSeed * 2.9) - 0.5;
  float rd = uDisc * (1.0 + 0.075 * wob + 0.030 * wob2);
  float px = uPx;
  float e = r - rd;
  // the derivatives are taken here, where every pixel of the quad takes them, so
  // the marks below can leave out the work of a pixel they do not reach
  float fe = fwidth(e), fr = fwidth(r);
  float disc = 1.0 - syPx(e, max(fe, px * 0.85));
  // (cd is read only through the disc: mix(cc, cd, disc) below)
  vec3 cd = uBody;
  if (disc > 0.0) {
  // the rim is where the brush was loaded: its width goes with the hand, and the
  // hand skipped twice round the circle
  float rimW = 0.18 * rd * (0.45 + 1.10 * syF2(vec2(cos(ang), sin(ang)) * 3.2 + uSeed * 3.1));
  float rim = syPx(e + rimW, max(fe, px * 1.1)) * disc;
  // the brush runs out twice round the disc: the ring is not a ring
  rim *= smoothstep(0.10, 0.44, syF2(vec2(ang * 2.3, r * 4.5 + uSeed)));
  float core = (1.0 - syPx(r - rd * (0.42 + 0.16 * wob), max(fr, px * 1.7))) * disc;
  core *= 0.72 + 0.50 * syF2(vec2(cos(ang), sin(ang)) * 4.1 + uSeed * 5.7);
  cd = mix(uBody, uRim, rim * 0.92);
  cd = mix(cd, uCore, core * 0.95);
  // and the pigment pooled where the wash was left wet: one blotch, not a plate
  float pool = syF2(vec2(cos(ang) * 1.6, sin(ang) * 1.6) + uSeed * 7.3) - 0.5;
  cd = mix(cd, uRim, clamp(pool * 1.5, 0.0, 1.0) * 0.22 * disc);
  }

  // the fan: one spoke a brush-load, each its own length and weight, thinning as
  // it runs out, its tip a step short of where the pigment stopped
  float cor = 0.0;
  float spark = 0.0;
  float rr = max(r, rd * 0.2);
  for (int i = 0; i < 16; i++) {
    float fi = float(i);
    float h1 = syH12(vec2(fi, uSeed)), h2 = syH12(vec2(fi + 21.0, uSeed)), h3 = syH12(vec2(fi + 47.0, uSeed));
    float a = ((fi + 0.5 * h1) / 16.0) * 6.2831853 + uSpin;
    float da = ang - a;
    da = abs(atan(sin(da), cos(da)));
    float len = rd * (0.10 + 1.7 * uRays * h2 * h2);
    float wide = px * (0.9 + 3.2 * h3 * h3) * (1.05 - 0.78 * clamp((r - rd) / max(len, 1e-4), 0.0, 1.0));
    float side = 1.0 - syPx(da * rr - wide, max(fwidth(da * rr), px * 0.75));
    float root = syPx(r - rd * 0.80, max(fr, px * 1.0));
    // the spoke's ragged end is read only where the spoke can be
    if (side * root > 0.0) {
      float ragged = 0.70 + 0.55 * syF2(vec2(fi * 3.1, r * 7.0 + uSeed));
      float m = side
              * (1.0 - syPx(r - rd - len * ragged, max(fr, px * 0.8)))
              * root;
      cor = max(cor, m * (0.30 + 0.70 * h3));
    }
    float tip = length(vec2(da * rr * (1.0 + 0.35 * wob2), r - rd - len * (1.05 + 0.12 * h1)));
    spark = max(spark, (1.0 - syPx(tip - px * (0.7 + 1.5 * h2), max(px * 1.1, fwidth(tip)))) * step(0.58, h1));
  }
  // a dry brush parts and skips as it goes round
  if (cor > 0.0) cor *= 0.40 + 0.80 * smoothstep(0.22, 0.86, syF2(vec2(ang * 1.5, r * 1.7) + uSeed * 1.7));
  vec3 cc = mix(uCor, uSpark, clamp(spark, 0.0, 1.0));
  return vec4(mix(cc, cd, disc), max(disc, max(cor, spark) * 0.92));
}
vec4 syLightStar(vec2 q){
  float r = length(q);
  float ang = syAngle(q);
  vec2 cs = vec2(cos(ang), sin(ang));
  float wob = syF2(cs * 2.6 + uSeed) - 0.5;
  float wob2 = syF2(cs * 7.3 + uSeed * 2.9) - 0.5;
  float rd = uDisc * (1.0 + 0.075 * wob + 0.030 * wob2);
  float e = r - rd;
  // the edge is cut at a pixel round most of the disc and eased where the hand eased
  float ease = smoothstep(0.50, 0.66, syF2(cs * 1.7 + uSeed * 4.3));
  float disc = 1.0 - syPx(e, max(fwidth(e), uPx * mix(0.85, 7.0, ease)));
  vec3 cd = uBody;
  if (disc > 0.0) {
    // the middle lifted with a damp brush: soft all the way out, a little off the
    // centre, its reach wandering with the hand
    vec2 lq = q / rd - vec2(0.16, 0.12) * (vec2(syH12(vec2(uSeed, 3.7)), syH12(vec2(uSeed, 8.1))) - 0.5);
    float lift = 1.0 - smoothstep(0.0, 0.95 + 0.30 * wob, length(lq));
    cd = mix(uBody, uCore, pow(lift, 0.75) * 0.94);
    // the pigment gathered where the wash dried at the rim: a bead, heavier where
    // the brush was loaded, gone where it skipped
    float bead = smoothstep(0.66, 0.99, r / rd) * smoothstep(0.18, 0.62, syF2(cs * 3.2 + uSeed * 3.1));
    cd = mix(cd, uBead, bead * 0.62);
    // and the wash is never one value: the slow bloom of a wet layer under it
    cd *= 0.96 + 0.08 * syF2(q / rd * 1.9 + uSeed * 5.7);
  }
  // a few fans of light, unequal: most short, one or two long, each soft along
  // its sides, narrowing and running out to nothing, and none of them a line
  float fan = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float h1 = syH12(vec2(fi, uSeed + 3.1)), h2 = syH12(vec2(fi + 21.0, uSeed + 3.1)), h3 = syH12(vec2(fi + 47.0, uSeed + 3.1));
    if (h3 < 0.22) continue;
    float da = ang - (((fi + 0.70 * h1) / 6.0) * 6.2831853 + uSpin);
    da = abs(atan(sin(da), cos(da)));
    float len = rd * (0.80 + 2.4 * uRays * h2);
    float s = clamp((r - rd) / len, 0.0, 1.0);
    float spread = (0.09 + 0.21 * h3) * (1.0 - 0.70 * s);
    float m = (1.0 - smoothstep(spread * 0.25, spread, da)) * pow(1.0 - s, 1.6) * (0.45 + 0.55 * h3);
    fan = max(fan, m);
  }
  // the strands a dry brush leaves along them
  if (fan > 0.0) fan *= 0.60 + 0.40 * syF2(vec2(ang * 26.0, r / uDisc * 2.2 + uSeed));
  // the light's own short air: close round the disc, and gone half a disc out
  float aura = exp(-max(e, 0.0) / (rd * (0.28 + 0.12 * wob)));
  vec3 fc = mix(uFanPaper, uFanVoid, uVoid);
  return vec4(mix(fc, cd, disc), max(disc, max(fan * 0.66, aura * 0.30)));
}
void main(){
  if (length(vP) > 1.02) discard;
  vec4 s = uLook > 0.5 ? syLightStar(vP) : syInkStar(vP);
  float a = s.a * uAlpha;
  if (a < (uLook > 0.5 ? 0.006 : 0.012)) discard;
  gl_FragColor = vec4(s.rgb, a);
}
`;

// The flare: what a lens does to a light this bright — a veil of dilute pigment
// graded out from the star, and one long streak swept across it, grainy the way a
// mark on paper is. The streak is a lift of the light's own pale, never a darker
// pigment (over a pale globe that read as a dark bar through the light itself),
// it tapers to nothing at both ends, and it stops short of the disc it comes from.
// With system.light up the veil is kept close to the light and the streak is
// shorter and fainter: the light's radiance stays round its source.
const FLARE_FRAG = /* glsl */ `
uniform vec3 uVeilPig, uStreakPig;
uniform vec2 uStar;
uniform float uPx, uSeed, uAlpha, uVeil, uRing, uStreak, uDisc, uLook;
varying vec2 vP;
${NOISE}
void main(){
  vec2 rel = vP - uStar;
  float d = length(rel);
  float a = 0.0;
  vec3 c = uVeilPig;

  // the veil: a light this bright bleaches the sheet it falls on — the graze is
  // laid in the page's own paper, not in pigment, so what it does to a dark globe
  // is lift it and what it does to pale sky is almost nothing (a tint in the
  // light's own colour would make the lit part of the picture its dirtiest). It is
  // a graded wash, heaviest at the light and run out to nothing at uVeil: an edge
  // anywhere in the frame leaves the unlit sky beyond it standing as a dark shape.
  float reach = mix(uVeil, uDisc * 5.5, uLook);
  float veil = 1.0 - smoothstep(0.0, reach, d);
  a = max(a, veil * veil * mix(0.13, 0.16, uLook));

  // the streak: a long hairline through the star, thickening away from it like a
  // stretched vowel and thinning again to nothing at both ends
  float len = uStreak * mix(1.0, 0.6, uLook);
  float ax = abs(rel.x);
  float run = 1.0 - smoothstep(len * 0.30, len, ax);
  float thick = (0.004 + 0.045 * uRing * max(0.0, ax - 0.04)) * run;
  thick *= 1.0 + (syF2(vec2(rel.x * 6.0, uSeed)) - 0.5) * 0.6;
  float s = abs(rel.y) - thick;
  float sa = (1.0 - syPx(s, max(uPx * 0.85, fwidth(s)))) * run * smoothstep(uDisc * 1.05, uDisc * 1.8, d);
  // the same drag that laid it ran out of pigment twice along the way (read only
  // on the streak itself)
  if (sa > 0.0) {
    sa *= mix(1.0, step(0.34, syF2(vec2(rel.x * 11.0, uSeed * 3.0))), 0.8);
    a = max(a, sa * mix(0.24, 0.15, uLook));
    c = mix(c, uStreakPig, clamp(sa, 0.0, 1.0) * 0.9);
  }

  a *= uAlpha;
  if (a < 0.008) discard;
  gl_FragColor = vec4(c, a);
}
`;

// The halo: what still air does to a light — a warm hairline, wider cold arcs, a
// faint band across them, and every arc broken where the sky was not even. The
// quietest thing in any week's sky, and the only one drawn round the star itself.
// With system.light up it is one restrained arc, broken for most of its round.
const HALO_FRAG = /* glsl */ `
uniform vec3 uIce, uWarm, uPaper;
uniform vec3 uRings;     // the three arcs' own radii, in half-frame units
uniform vec2 uBand;      // the faint band's inner and outer edge, the same
uniform float uPx, uSeed, uAlpha, uLook;
varying vec2 vP;
${NOISE}
void main(){
  float d = length(vP);
  float ang = syAngle(vP);
  float fw = max(uPx, fwidth(d));
  float a = 0.0;
  vec3 c = uIce;
  if (uLook > 0.5) {
    float reach = uRings.y * 0.03 + uPx * 4.0;
    if (abs(d - uRings.y) < reach) {
      float rr = uRings.y * (1.0 + 0.045 * (syF2(vec2(ang * 1.9, 4.3 + uSeed)) - 0.5));
      float ring = 1.0 - syPx(abs(d - rr) - uPx * 0.8, max(uPx * 1.4, fw * 1.2));
      float brk = smoothstep(0.44, 0.72, syF2(vec2(ang * 1.3, 9.0 + uSeed)));
      a = ring * brk * 0.40;
      c = mix(uIce, mix(uWarm, uPaper, 0.25), 0.30);
    }
  } else {
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float w = max(uPx * 1.6, fw * 1.2);
    // an arc wanders within 5% of its radius: a pixel further off takes none of its noise
    float reach = uPx * 2.1 + 0.5 * w;
    if (d > uRings[i] * 0.949 - reach && d < uRings[i] * 1.051 + reach) {
      float wob2 = syF2(vec2(ang * 1.9, fi * 4.3 + uSeed)) - 0.5;
      float rr = uRings[i] * (1.0 + 0.055 * (syH12(vec2(fi + 5.0, uSeed)) - 0.5) + 0.045 * wob2);
      float ring = 1.0 - syPx(abs(d - rr) - uPx * 1.1, w);
      float brk = 0.18 + 0.95 * smoothstep(0.22, 0.78, syF2(vec2(ang * 1.5, fi * 9.0 + uSeed)));
      float m = ring * brk;
      // the innermost arc is the warm one: the pigment the light reached first
      c = mix(c, mix(uWarm, uPaper, 0.25), (1.0 - fi * 0.5) * m);
      a = max(a, m * (0.72 - 0.15 * fi));
    }
  }
  // the band's edge wanders within 2.5% of its width: the same for it
  if (d > uBand.x - fw - uPx && d < uBand.y + 0.0255 * (uBand.y - uBand.x) + fw + uPx) {
    float wb = 0.05 * (uBand.y - uBand.x) * (syF2(vec2(d * 2.2, uSeed)) - 0.5);
    float band = (1.0 - syPx(d - (uBand.y + wb), fw * 2.0)) * syPx(d - uBand.x, fw * 2.0);
    a = max(a, band * 0.16);
  }
  }
  a *= uAlpha;
  if (a < 0.006) discard;
  gl_FragColor = vec4(c, a);
}
`;

// The comet: a nucleus with its coma, a dust tail laid as a broad eroded fan with
// the striae a real one carries, and an ion tail drawn as the one straight line in
// the sky. Both tails run down the local x, away from the sun, and both thin and
// break up as the brush runs dry toward their ends. The head is measured in the
// sheet's own units both ways (x is tail lengths, y the same lengths across), so it
// is round; the sheet reaches past the coma on the sunward side and past the fan on
// both flanks, and both tails have faded to nothing before the sheet ends.
//
// With system.comet up (the default) it is a body of light: a tiny pale nucleus in a
// round coma soft to its edge, the dust tail a fan about a curved centreline that
// widens as it goes and thins away the whole of its length, combed across into
// striae, and one thinner, cooler ion thread straight down the anti-sun line.
const COMET_FRAG = /* glsl */ `
uniform vec3 uHead, uComa, uDust, uIon, uNucleus, uComaLight, uDustLight;
uniform float uPxX, uPxY, uW2L, uSeed, uAlpha, uCurve, uDustW, uIonW, uComaR, uX0, uLook;
varying vec2 vP;
${NOISE}
vec4 syInkComet(float x, float y, float px){
  // the coma: the head of it, denser at the middle, its edge wandered
  float rh = length(vec2(x, y));
  float ah = atan(y, x);
  float rc = uComaR * (0.86 + 0.30 * (syF2(vec2(cos(ah), sin(ah)) * 2.4 + uSeed) - 0.5));
  float dh = rh - rc;
  float coma = 1.0 - syPx(dh, max(uPxX, fwidth(dh)));
  float nucleus = 1.0 - syPx(rh - rc * 0.52, max(uPxX, fwidth(dh)));

  // the dust tail: a broad fan off the anti-sun line, curving as it goes, combed
  // into striae, and breaking up as the brush runs dry toward the end
  float centre = uCurve * pow(clamp(x, 0.0, 1.0), 1.7);
  float wide = uDustW * (0.30 + 1.05 * sin(3.14159 * clamp(x, 0.0, 1.0)));
  float edge = abs(y - centre) - wide * (0.86 + 0.28 * (syF2(vec2(x * 3.4, y * 9.0 + uSeed)) - 0.5));
  float dust = 1.0 - syPx(edge, max(px, fwidth(edge)));
  dust *= 0.35 + 0.90 * syF2(vec2(x * 5.5, y * 26.0 + uSeed * 2.0));
  float dry = clamp((x - 0.5) / 0.5, 0.0, 1.0);
  dust *= mix(1.0, step(1.0 - dry * 0.9, syF2(vec2(x * 30.0, y * 42.0 + uSeed * 3.0)) * 1.4 - 0.2), dry);
  dust *= syPx(x + 0.02, max(px, fwidth(x)));

  // the ion tail: straight, thin, and the last thing to give out
  float ionEdge = abs(y - centre * 0.35) - uIonW * (0.30 + 0.85 * (1.0 - clamp(x, 0.0, 1.0)));
  float ion = 1.0 - syPx(ionEdge, max(px, fwidth(ionEdge)));
  ion *= mix(1.0, step(0.35, syF2(vec2(x * 26.0, y * 60.0 + uSeed))), clamp((x - 0.55) / 0.45, 0.0, 1.0));
  ion *= syPx(x + 0.02, max(px, fwidth(x)));
  // both run out before the sheet does: no tail ends on the sheet's own edge
  float end = 1.0 - smoothstep(0.80, 0.985, x);
  dust *= end;
  ion *= end;

  vec3 c = mix(uDust, uIon, clamp(ion, 0.0, 1.0));
  c = mix(c, uComa, clamp(coma, 0.0, 1.0) * 0.9);
  c = mix(c, uHead, clamp(nucleus, 0.0, 1.0));
  return vec4(c, max(max(dust * 0.50, ion * 0.72), max(coma * 0.75, nucleus)));
}
vec4 syLightComet(float x, float y, float px){
  float rh = length(vec2(x, y));
  float ah = atan(y, x);
  // the coma: round, soft all the way to its tail side, the edge wandering a
  // little, and cut crisp round the sunward side where the light pushes it back
  float rc = uComaR * (0.90 + 0.20 * (syF2(vec2(cos(ah), sin(ah)) * 2.4 + uSeed) - 0.5));
  float coma = 1.0 - smoothstep(rc * 0.10, rc, rh);
  coma *= coma;
  float bow = (1.0 - syPx(rh - rc, max(px * 1.1, fwidth(rh)))) * smoothstep(rc * 0.35, rc * 0.95, rh) * smoothstep(0.35, -0.55, cos(ah));
  coma = max(coma, bow * 0.30);
  // the nucleus: a tiny pale point at its heart, never a hole
  float nr = max(px * 1.3, rc * 0.11);
  float nucleus = 1.0 - smoothstep(nr * 0.5, nr * 1.6, rh);

  // the dust tail: a fan about a curved centreline that widens as it goes, its
  // density run down the whole of its length and gone before the sheet ends; the
  // convex flank cut crisp near the head and eroding as it goes, the other soft
  float xc = clamp(x, 0.0, 1.0);
  float centre = uCurve * pow(xc, 1.6);
  float w = rc * 0.70 + uDustW * 2.1 * pow(xc, 0.8);
  float v = (y - centre) / w;
  float frayed = abs(v) * (1.0 + 0.24 * (syF2(vec2(x * 3.4, y * 9.0 + uSeed)) - 0.5));
  float soft = 1.0 - smoothstep(0.25, 1.0, frayed);
  float crisp = (1.0 - syPx((frayed - 1.0) * w, px * 1.2)) * (0.55 + 0.45 * soft);
  float across = mix(soft, crisp, step(v, 0.0) * (1.0 - smoothstep(0.30, 0.80, xc)));
  float decay = exp(-1.5 * xc) * (1.0 - smoothstep(0.50, 0.96, xc));
  float born = smoothstep(-rc * 0.2, rc * 0.9, x);
  // combed across into striae: the dust the sun let go of a day at a time
  float striae = 0.62 + 0.38 * syF2(vec2(x * 8.0 - v * 1.3, uSeed * 2.0));
  float dust = across * decay * born * striae;

  // the ion thread: straight down the anti-sun line, thinner, cooler, knotted
  float tw = uIonW * 0.42 * (1.0 + 0.8 * xc);
  float ion = (1.0 - smoothstep(tw * 0.3, tw, abs(y)))
            * exp(-1.2 * xc) * (1.0 - smoothstep(0.58, 0.97, xc)) * smoothstep(rc * 0.2, rc * 1.1, x);
  ion *= 0.55 + 0.45 * syF2(vec2(x * 16.0, uSeed + 9.0));

  vec3 c = mix(uDustLight, uIon, clamp(ion * 1.4, 0.0, 1.0));
  c = mix(c, uComaLight, clamp(coma, 0.0, 1.0));
  c = mix(c, uNucleus, nucleus);
  return vec4(c, max(max(dust * 0.66, ion * 0.62), max(coma * 0.88, nucleus)));
}
void main(){
  float x = mix(uX0, 1.0, vP.x * 0.5 + 0.5);   // tail lengths from the head, the head at 0
  float y = vP.y * uW2L;                        // the same units across
  float px = max(uPxX, uPxY * uW2L);
  vec4 s = uLook > 0.5 ? syLightComet(x, y, px) : syInkComet(x, y, px);
  float a = s.a * uAlpha;
  if (a < 0.008) discard;
  gl_FragColor = vec4(s.rgb, a);
}
`;

// The water moon: one of the week's own sea colours, dried from the light side to
// the dark on a wandering line, the currents drifting across it, and the depth of
// the wash pooled where the light stops — a cut-out of water, in the same hand as
// every other companion in the round.
const MOON_FRAG = /* glsl */ `
uniform vec3 uDeep, uShallow, uFoam, uMare, uPaper, uInk;
uniform vec2 uLight;
uniform float uPx, uSeed, uAlpha, uTime, uArcs;
varying vec2 vP;
${NOISE}
void main(){
  float r = length(vP);
  float ang = syAngle(vP);
  float wob = syF2(vec2(cos(ang), sin(ang)) * 2.8 + uSeed) - 0.5;
  float rr = 0.90 * (1.0 + 0.035 * wob);
  float e = r - rr;
  float fw = max(uPx, fwidth(e));
  float body = 1.0 - syPx(e, fw);
  if (body < 0.01) discard;

  // the light's own bearing on the sheet: a wandering terminator, one pixel of
  // the light's own gradient, and the wash deeper under it
  float lit = clamp(vP.x * uLight.x + vP.y * uLight.y + wob * 0.55, -1.0, 1.0);
  vec3 c = mix(uDeep, uShallow, clamp(lit * 1.6 + 0.5, 0.0, 1.0));
  float mare = step(0.62, syF2(vP * 2.6 + uSeed * 2.0)) * 0.85;
  c = mix(c, mix(uDeep, uMare, 0.5), mare * 0.6);

  // the currents: hairlines round the moon, each drifting at its own rate
  float cur = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float ph = syH12(vec2(fi + 7.0, uSeed)) * 6.2831853 + uTime * (0.05 + 0.13 * syH12(vec2(fi + 13.0, uSeed)));
    float rad = 0.24 + 0.22 * fi + 0.05 * sin(ph);
    float span = smoothstep(0.25, 0.85, syF2(vec2(ang * 1.7 + ph * 0.6, fi * 5.0 + uSeed)));
    cur = max(cur, (1.0 - syPx(abs(r - rad) - uPx * 0.8, fw)) * span);
  }
  c = mix(c, uFoam, clamp(cur, 0.0, 1.0) * 0.75 * uArcs);
  // paper left along the lit edge, the pigment pooled where the light stops
  c = mix(c, uPaper, smoothstep(0.55, 0.95, lit) * 0.32);
  c = mix(c, mix(uDeep, uInk, 0.45), (1.0 - smoothstep(-0.85, -0.25, lit)) * 0.28);
  c = mix(c, mix(uDeep, uInk, 0.5), syPx(e + 0.10 * rr, fw) * body * 0.5);
  float a = body * uAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(c, a);
}
`;

/* -------------------------------------------------------------- builders --- */

function sheetMesh(sys, material, name, renderOrder) {
  const { T } = sys;
  const mesh = new T.Mesh(new T.PlaneGeometry(2, 2), material);
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.renderOrder = renderOrder;
  return mesh;
}

/** The star's own sheet: its disc, its corona and its sparks. `pigment` is the
 *  hour's colour; `scale` lets the same shader draw the companion it earned. */
function buildStar(sys, { pigment, seed, rays, scale }) {
  const { T, pal } = sys;
  const material = new T.ShaderMaterial({
    uniforms: {
      // The light is drawn the way ink draws one on pale paper: the middle of the
      // disc is the sheet left bare, and what makes it a light is the contour —
      // a loaded rim of ink, a fan of dry-brush strokes in the hour's own
      // pigment, and flecks the brush threw past their tips. (A pale wash for a
      // pale light on a pale sky is no mark at all; the ink is what is drawn.)
      uBody: { value: pigment.clone().lerp(pal.ink, 0.05) },
      uCore: { value: pal.paper.clone().lerp(pigment, 0.22) },
      uRim: { value: pigment.clone().lerp(pal.ink, 0.62) },
      uCor: { value: pigment.clone().lerp(pal.ink, 0.24) },
      uSpark: { value: pigment.clone().lerp(pal.ink, 0.26) },
      // system.light: the bead the wash dried to at its rim (the hour's pigment gone
      // warmer and deeper, never ink), and the fans' light — paler than the void
      // they cross from orbit, a warm wash a little under the paper on a pale sky
      uBead: { value: pigment.clone().lerp(colourOf(T, pal.litWarm), 0.35).lerp(colourOf(T, pal.sepia), 0.22) },
      uFanVoid: { value: pal.paper.clone().lerp(pigment, 0.55) },
      uFanPaper: { value: pigment.clone().lerp(pal.ink, 0.12) },
      uLook: { value: 1 },
      uVoid: { value: 1 },
      uPx: { value: 0.02 },
      uDisc: { value: 1 / QUAD_K },
      uSeed: { value: seed },
      uAlpha: { value: 1 },
      uSpin: { value: 0 },
      uRays: { value: rays },
    },
    vertexShader: SHEET_VERT,
    fragmentShader: STAR_FRAG,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
  });
  const mesh = sheetMesh(sys, material, 'companion-star', 12);
  return { mesh, material, scale };
}

/** The flare: one sheet in front of the eye, drawn over everything (a lens does
 *  not care what stands in the way), carrying the veil, the rings and the streak
 *  — as much of them as the globe leaves of the light itself (sheet.starVis). */
function buildFlare(sys, pigment) {
  const { T, pal } = sys;
  const material = new T.ShaderMaterial({
    uniforms: {
      // the graze is the paper lifted (see the veil in the fragment shader), and
      // the streak is a lift of the light's own pale across it
      uVeilPig: { value: pal.paper.clone().lerp(pigment, 0.30) },
      uStreakPig: { value: pal.paper.clone().lerp(pigment, 0.45) },
      uStar: { value: new T.Vector2() },
      uPx: { value: 0.004 },
      uSeed: { value: sys.seed + 11.7 },
      uAlpha: { value: 1 },
      // how far the veil's graded wash reaches before it has run out
      uVeil: { value: 1.45 + 0.35 * sys.dice[7] },
      // the streak's swell; the sizes as authored: what the sheet is given is these
      // over its own cover (see the placement), so a viewport wider than it is tall
      // does not stretch the streak with it
      uRing: { value: 0.075 + 0.05 * sys.dice[8] },
      uStreak: { value: 0.30 + 0.20 * sys.dice[2] },
      // the star's own disc on this sheet, which the streak stops short of
      uDisc: { value: 0.05 },
      uLook: { value: 1 },
    },
    vertexShader: SHEET_VERT,
    fragmentShader: FLARE_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: T.DoubleSide,
  });
  return { mesh: sheetMesh(sys, material, 'companion-flare', 40), material, ring: material.uniforms.uRing.value, streak: material.uniforms.uStreak.value };
}

/** The halo a quiet week earns: the same kind of sheet, round the star itself. */
function buildHalo(sys, pigment) {
  const { T, pal } = sys;
  const material = new T.ShaderMaterial({
    uniforms: {
      uIce: { value: pigment.clone().lerp(pal.paper, 0.45) },
      uWarm: { value: colourOf(T, pal.litWarm).lerp(pal.paper, 0.25) },
      uPaper: { value: pal.paper.clone() },
      uRings: { value: new T.Vector3(0.30, 0.40, 0.50) },
      uBand: { value: new T.Vector2(0.24, 0.33) },
      uPx: { value: 0.004 },
      uSeed: { value: sys.seed + 23.1 },
      uAlpha: { value: 1 },
      uLook: { value: 1 },
    },
    vertexShader: SHEET_VERT,
    fragmentShader: HALO_FRAG,
    transparent: true,
    depthWrite: false,
    // stood at the star's own distance (see the frame): the globe hides it
    depthTest: true,
    side: T.DoubleSide,
  });
  return { mesh: sheetMesh(sys, material, 'companion-halo', 30), material };
}

/** The week's longest run as a comet: one sheet with its head at the local origin
 *  and its tails down the local x, swept away from the sun every frame. The sheet
 *  is sized every frame to hold the whole comet (see the frame): past the coma on
 *  the sunward side, past the curved fan on both flanks. */
function buildComet(sys, earns) {
  const { T, pal } = sys;
  const km = clamp(earns.longKm, 4, 46);
  const material = new T.ShaderMaterial({
    uniforms: {
      uHead: { value: colourOf(T, pal.paper).lerp(colourOf(T, pal.ink), 0.74) },
      uComa: { value: colourOf(T, pal.paper).lerp(colourOf(T, pal.seaShallow), 0.22) },
      uDust: { value: colourOf(T, pal.sepia).lerp(colourOf(T, pal.paper), 0.30) },
      uIon: { value: colourOf(T, pal.skyWash).lerp(colourOf(T, pal.paper), 0.20) },
      // system.comet: the nucleus a pale point and the coma a pale glow, both
      // mixed from the paper (a week's sea can be dark), the dust a paler warm
      uNucleus: { value: colourOf(T, pal.paper).lerp(colourOf(T, pal.litWarm), 0.12) },
      uComaLight: { value: colourOf(T, pal.paper).lerp(colourOf(T, pal.skyWash), 0.14) },
      uDustLight: { value: colourOf(T, pal.sepia).lerp(colourOf(T, pal.paper), 0.55) },
      uPxX: { value: 0.004 },
      uPxY: { value: 0.004 },
      uW2L: { value: 0.1 },
      uX0: { value: -0.14 },
      uSeed: { value: sys.seed + 5.3 },
      uAlpha: { value: 1 },
      uLook: { value: 1 },
      uCurve: { value: 0.08 + 0.18 * sys.dice[9] },
      uDustW: { value: 0.055 + 0.045 * sys.dice[10] },
      uIonW: { value: 0.020 + 0.014 * sys.dice[11] },
      uComaR: { value: 0.05 },
    },
    vertexShader: SHEET_VERT,
    fragmentShader: COMET_FRAG,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
  });
  // the sheet runs from uX0 to 1 along the local x (the head at 0, the tail's end
  // at 1) and ±1 across: the frame places and scales it to those extents
  const mesh = sheetMesh(sys, material, 'companion-comet', 14);
  const u = material.uniforms;
  return {
    mesh, material, comaWorld: clamp(1.75 + 0.10 * km, 2.4, 6.0), tailWorld: km * 1.9,
    // the farthest the fan reaches off the anti-sun line, in tail lengths, with a margin
    flank: u.uCurve.value + 2.2 * u.uDustW.value + 0.04,
  };
}

/** The week's lifting as a belt: every stone of it one wash to a facet, all of
 *  them one merged mesh, standing in a wide torus whose plane is set each frame
 *  so the poster reads a belt and not a line. */
function buildBelt(sys, earns) {
  const { T, pal, R, washMaterial } = sys;
  const sets = earns.sets > 0 ? earns.sets : Math.max(2, earns.liftHours * 4);
  const meanVolume = earns.sets > 0 ? earns.volumeKg / earns.sets : earns.liftHours * 900 + 200;
  const count = clamp(Math.round(sets * 11), 56, 280);
  // a stone has to be a mark on the sheet: the planet's own radius is 120 units,
  // so a stone of a few units is a few pixels from orbit — bigger where more was
  // lifted, and the whole belt's width still no wider than the band it stands in
  const base = clamp(1.05 + 1.45 * Math.cbrt(Math.max(20, meanVolume) / 45), 1.0, 5.6);
  const big = base * 1.45;  // one stone in ten is a boulder; the rest are rubble

  // one faceted stone, knocked about from its own direction so its facets still
  // close on each other, then every stone's faces laid flat into one buffer: the
  // whole belt is one draw call and every facet is one flat value of the wash
  const ico = new T.IcosahedronGeometry(1, 0);
  const rp = ico.attributes.position;
  const knock = new Map();
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i);
    const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    if (!knock.has(key)) {
      const h = Math.sin(x * 91.7 + y * 57.3 + z * 33.1) * 43758.5453;
      knock.set(key, 0.74 + 0.44 * (h - Math.floor(h)));
    }
    const s = knock.get(key);
    rp.setXYZ(i, x * s, y * s, z * s);
  }
  const faces = [];
  for (let i = 0; i < rp.count; i += 3) {
    faces.push([
      [rp.getX(i), rp.getY(i), rp.getZ(i)],
      [rp.getX(i + 1), rp.getY(i + 1), rp.getZ(i + 1)],
      [rp.getX(i + 2), rp.getY(i + 2), rp.getZ(i + 2)],
    ]);
  }

  // a belt is a band, not a track: the stones run from well inside to well
  // outside the mean radius, so the near side passes over the globe's disc and
  // the far side is lost behind it
  const inner = R * 1.10, outer = R * 1.34;
  const pos = new Float32Array(count * faces.length * 9);
  const nor = new Float32Array(count * faces.length * 9);
  const v = [new T.Vector3(), new T.Vector3(), new T.Vector3()];
  const a = new T.Vector3(), b = new T.Vector3(), n = new T.Vector3();
  const rot = new T.Matrix4();
  const euler = new T.Euler();
  let k = 0;
  let biggest = 0;
  for (let i = 0; i < count; i++) {
    // clumped, not strung: a belt is swept into families and gaps by whatever
    // gathered it, and a run of evenly spaced stones reads as a necklace (the
    // golden angle alone, which is what the first passes used, is exactly that)
    const ph = ((i * 0.6180339887) % 1);
    const jitter = (Math.sin(i * 12.9898 + sys.dice[5] * 78.233) * 43758.5453) % 1;
    const phi = sys.dice[1] * TAU + ph * 4.6 + (jitter - 0.5) * 0.55;
    const clump = Math.sin(i * 1.7 + sys.dice[6] * 5.0) * 0.5 + 0.5;
    const band = Math.min(1, 0.45 + 0.85 * clump);   // never past the outer radius the reach declares
    const rr = inner + (outer - inner) * Math.pow(((i * 0.6180339887) % 1), 0.62) * band;
    const lift = (((i * 0.4142135) % 1) * 2 - 1) * 0.062 * R;
    const u1 = ((i * 0.7548777) % 1), u2 = ((i * 0.5698403) % 1);
    const size = (u2 > 0.90 ? big : base) * (0.26 + 0.90 * u1 * u2);
    biggest = Math.max(biggest, size);
    euler.set(((i * 1.13) % 1) * TAU, ((i * 2.71 + sys.dice[2]) % 1) * TAU, ((i * 3.77) % 1) * TAU);
    rot.makeRotationFromEuler(euler);
    const cx = rr * Math.cos(phi), cz = rr * Math.sin(phi);
    for (const f of faces) {
      for (let j = 0; j < 3; j++) {
        v[j].set(f[j][0], f[j][1], f[j][2]).multiplyScalar(size).applyMatrix4(rot);
      }
      a.subVectors(v[1], v[0]);
      b.subVectors(v[2], v[0]);
      n.crossVectors(a, b).normalize();
      for (let j = 0; j < 3; j++) {
        pos[k * 3] = v[j].x + cx;
        pos[k * 3 + 1] = v[j].y + lift;
        pos[k * 3 + 2] = v[j].z + cz;
        nor[k * 3] = n.x; nor[k * 3 + 1] = n.y; nor[k * 3 + 2] = n.z;
        k++;
      }
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
  geo.computeBoundingBox();
  const material = washMaterial(T, sys.uniforms, pal, geo, {
    lit: colourOf(T, pal.stone).lerp(colourOf(T, pal.litWarm), 0.22),
    shade: colourOf(T, pal.shadeCool).lerp(colourOf(T, pal.ink), 0.40),
    rag: 0.26,
    grain: 1.25,
    inkLine: 0.6,
    top: 0,
    skyTop: 0,
    dry: 0,
    margin: 0,
    litEdge: 0,
    base: 0,
    seed: sys.seed,
  });
  const mesh = new T.Mesh(geo, material);
  mesh.name = 'companion-belt';
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.renderOrder = 11;
  return { mesh, tilt: 1.02 + 0.20 * sys.dice[3], spin: 0.014 + 0.026 * sys.dice[4], outer: outer + biggest * 2 };
}

/** The water moon a swimming week earns: a cut-out of the week's own sea. */
function buildMoon(sys) {
  const { T, pal } = sys;
  const material = new T.ShaderMaterial({
    uniforms: {
      // the week's own sea, with the swimming mineral the palette lays in the
      // rock's creases (pal.accentSwim is a dial, not a wash name) mixed in
      uDeep: { value: colourOf(T, pal.seaDeep).lerp(colourOf(T, P['pal.accentSwim']), 0.25) },
      uShallow: { value: colourOf(T, pal.seaShallow).lerp(colourOf(T, pal.paper), 0.22) },
      uFoam: { value: colourOf(T, pal.foam).lerp(colourOf(T, pal.paper), 0.30) },
      uMare: { value: colourOf(T, pal.teal).lerp(colourOf(T, pal.paper), 0.35) },
      uPaper: { value: pal.paper.clone() },
      uInk: { value: pal.ink.clone() },
      uLight: { value: new T.Vector2(0, 1) },
      uPx: { value: 0.006 },
      uSeed: { value: sys.seed + 31.9 },
      uAlpha: { value: 1 },
      uTime: { value: 0 },
      uArcs: { value: 0.55 + 0.35 * sys.dice[5] },
    },
    vertexShader: SHEET_VERT,
    fragmentShader: MOON_FRAG,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
  });
  return {
    mesh: sheetMesh(sys, material, 'companion-water-moon', 13),
    material,
    size: 0.050 + 0.014 * sys.dice[6],
  };
}

/* -------------------------------------------------------------- the system -- */

export function systemFor(ctx) {
  const sunDial = clamp(Number(P['system.sun']) || 0, 0, 1);
  const phenomenaDial = clamp(Number(P['system.phenomena']) || 0, 0, 1);
  if (!sunDial && !phenomenaDial) return null;
  const { THREE: T, features, palette: pal, uniforms, washMaterial, R } = ctx;
  if (!T || !features || !pal) return null;

  const rng = features.makeRng('system');
  // a fixed number of draws, taken once and in one order: a week's own sky does
  // not change because another phenomenon was earned beside it
  const dice = [];
  for (let i = 0; i < 16; i++) dice.push(rng());

  const sessions = weekSessions(features);
  const earns = weekEarns(features, sessions);
  const hour = weekHour(features, sessions);
  const pigment = hourColour(T, hour);
  const sys = {
    T, features, pal, uniforms, washMaterial, R,
    seed: seedOf(features.week), dice, hour, pigment,
    group: new T.Group(),
    sheet: {
      right: new T.Vector3(), up: new T.Vector3(), fwd: new T.Vector3(),
      light: new T.Vector3(), frameDir: new T.Vector3(), starDir: new T.Vector3(),
      starPos: new T.Vector3(), px: new T.Vector2(), origin: new T.Vector3(),
      tanY: 0.4, aspect: 1, m: 1, dist: 1, pxh: 1080, sil: 0.7, slot: 0.1,
      discR: 0.05, starX: 0, starY: 0.7, bandFrac: 0.75, nx: 0, ny: 1, tx: -1, ty: 0,
      sky: 1, globeX: 0, globeY: 0, starFront: true, screenX: 0, screenY: 0.7,
      tailX: 0, tailY: -1, foreshort: 1, starHalf: 400, starPx: 0.01, lightFlat: 0.5, starVis: 1,
    },
    axisX: new T.Vector3(1, 0, 0),
    axisY: new T.Vector3(0, 1, 0),
    perp: new T.Vector3(),
    cross: new T.Vector3(),
    q: new T.Quaternion(),
    q2: new T.Quaternion(),
    spinQ: new T.Quaternion(),
    pos: new T.Vector3(),
    pos2: new T.Vector3(),
    dir: new T.Vector3(),
    dir2: new T.Vector3(),
    drawnFrame: -1,
    drawnCam: null,
    scale: new T.Vector3(1, 1, 1),
    zero: new T.Vector3(),
    xAxis: new T.Vector3(),
    yAxis: new T.Vector3(),
    zAxis: new T.Vector3(),
    basis: new T.Matrix4(),
    // the halo's painted square on the drawing buffer (see the frame) and the scissor it is drawn under
    haloRect: new T.Vector4(),
    scissorWas: new T.Vector4(),
    scissorTestWas: false,
  };
  const group = sys.group;
  group.name = 'companion-system';
  // feature LOD (base.js): ink.js swaps in its own { value } for the flare and the halo, 1 … 0
  group.userData.lod = { value: 1 };

  /* the star, the companion it earned, and the flare and halo that belong to it */
  let star = null, flare = null, binary = null, halo = null;
  if (sunDial > 0 || (phenomenaDial > 0 && earns.earns.binary)) {
    star = buildStar(sys, { pigment, seed: sys.seed, rays: STAR_RAY + 0.5 * dice[12], scale: 1 });
    group.add(star.mesh);
    flare = buildFlare(sys, pigment);
    group.add(flare.mesh);
    if (phenomenaDial > 0 && earns.earns.binary) {
      const gap = clamp(earns.gapH, 1, 16);
      // Apart by the primary's own size, never by a fixed distance on the sheet:
      // a pair that keeps its proportion stays a pair at any size the frame gives
      // it, and one measured in half-frames overlaps on the hero sheet and touches
      // at orbit scale.
      const cScale = 0.60 + 0.15 * dice[14];
      // The pair's separation is kept as a multiple of the primary's own disc, not
      // as a distance on the sheet: the disc's size is a fact about the frame it is
      // drawn in (readSheet), so the multiple is turned into a distance there.
      const second = Number.isFinite(earns.lateHour) ? earns.lateHour : (hour + 8) % 24;
      binary = {
        sepK: (2.9 + 1.2 * clamp((gap - 2) / 11, 0, 1)) * (0.92 + 0.16 * dice[13]),
        scale: cScale,
        companion: buildStar(sys, {
          pigment: hourColour(T, second), seed: sys.seed + 40.7, rays: 0.40 + 0.34 * dice[15], scale: 0.60 + 0.15 * dice[14],
        }),
      };
      group.add(binary.companion.mesh);
    }
  }
  if (phenomenaDial > 0 && earns.earns.halo) {
    halo = buildHalo(sys, colourOf(T, pal.skyWash).lerp(pigment, 0.25));
    group.add(halo.mesh);
  }

  let comet = null, belt = null, moon = null;
  if (phenomenaDial > 0) {
    if (earns.earns.comet) { comet = buildComet(sys, earns); group.add(comet.mesh); }
    if (earns.earns.belt) { belt = buildBelt(sys, earns); group.add(belt.mesh); }
    if (earns.earns.moon) { moon = buildMoon(sys); group.add(moon.mesh); }
  }
  if (!group.children.length) return null;
  // The week's star is drawn by its own dial — or, on a doubling week, by the
  // companion the week earned, because a companion star is one half of a pair and
  // half a pair is nothing. Under both dials it is one star, drawn once.
  let starAlpha = 0;
  // the race week's candidate looks that bring their own light (bodies/star.js:
  // star.look 1 the painted star, 2 the crown's night, 3 the eclipse's close
  // sun): the week's star stands down, and its flare with it
  const starLook = Math.round(Number(P['star.look']) || 0);
  const ownSun = features.body?.id === 'star' && starLook >= 1 && starLook <= 3;

  /* ------------------------------------------------------------- the frame -- */
  // Every sheet is placed once a frame inside its own onBeforeRender, from the
  // camera that is actually drawing it: the only hook a companion has, and the
  // right one, because where a companion stands is a fact about the sheet it will
  // be read on. (The renderer also calls onBeforeRender with no scene for its
  // shadow pass; those are skipped.)
  const s = sys.sheet;
  const update = (renderer, scene, camera) => {
    if (!scene || !camera) return;
    // ... once a frame, whatever number of sheets ask for it
    const frameNo = renderer?.info?.render?.frame;
    if (frameNo !== undefined && sys.drawnFrame === frameNo && sys.drawnCam === camera) return;
    sys.drawnFrame = frameNo;
    sys.drawnCam = camera;
    // The dials are read again every frame, not only where the group was built: a
    // page that turns one of them down (the bench's own controls) has to lose what
    // it asked to lose, and turn it up again to get it back. Building what was
    // never built is the scene's own business, not a frame's.
    const sunNow = clamp(Number(P['system.sun']) || 0, 0, 1);
    const phNow = clamp(Number(P['system.phenomena']) || 0, 0, 1);
    starAlpha = ownSun ? 0 : Math.max(sunNow, binary ? phNow : 0);
    // feature LOD (base.js): the lens's flare and the halo fade out together
    const lodV = group.userData.lod?.value;
    const lodK = Number.isFinite(lodV) ? clamp(lodV, 0, 1) : 1;
    readSheet(sys, camera, renderer);
    const half = s.starHalf;
    // the looks (system.light, system.comet), and how dark the sky behind the star
    // is: deep space from orbit, the painted day sky underfoot or on bare paper
    const lightNow = clamp(Number(P['system.light']) || 0, 0, 1);
    const cometNow = clamp(Number(P['system.comet']) || 0, 0, 1);
    const voidNow = s.sky * clamp(Number(P['sky.space']) || 0, 0, 1);

    if (star) {
      setMatrix(star.mesh, s.starPos, camera.quaternion, sys.scale.set(half, half, half));
      const u = star.material.uniforms;
      u.uPx.value = s.starPx;
      u.uSpin.value = uniforms.uTime.value * 0.03;
      u.uAlpha.value = starAlpha;
      u.uLook.value = lightNow;
      u.uVoid.value = voidNow;
      // at no alpha every pixel of the sheet is discarded: not drawn at all
      star.mesh.visible = starAlpha > 0;
    }

    if (binary) {
      // The companion stands beside the star along the sheet's own tangent, so
      // the pair reads as a pair wherever the light leaves it standing — and the
      // pair is held inside the crop as one thing: a companion cut by the shelf's
      // edge would read as a mark, not as a second star.
      const cHalf = half * binary.scale;
      const cDisc = s.discR * binary.scale;
      const tx = s.screenX - s.globeX, ty = s.screenY - s.globeY;
      const tn = Math.hypot(tx, ty) || 1;
      let sepX = -ty / tn, sepY = tx / tn;
      const room = Math.max(0.02, CROP - 0.004 - cDisc);
      let off = s.discR * binary.sepK;
      let reachR = Math.hypot(s.screenX + sepX * off, s.screenY + sepY * off);
      // (system.light: where this side of the tangent runs out of the crop, the
      // pair stands on the side toward the frame's middle instead)
      if (lightNow > 0.5 && reachR > room && s.screenX * sepX + s.screenY * sepY > 0) {
        sepX = -sepX; sepY = -sepY;
        reachR = Math.hypot(s.screenX + sepX * off, s.screenY + sepY * off);
      }
      if (reachR > room) off = Math.max(0.02, off - (reachR - room) / Math.max(0.2, Math.hypot(sepX, sepY)));
      // ...and never on the star itself: a pair drawn over each other reads as an eclipse
      if (lightNow > 0.5) off = Math.max(off, (s.discR + cDisc) * 1.2);
      sheetDirection(sys, s.screenX + sepX * off, s.screenY + sepY * off, sys.dir2);
      sys.pos.copy(camera.position).addScaledVector(sys.dir2, D_STAR);
      setMatrix(binary.companion.mesh, sys.pos, camera.quaternion, sys.scale.set(cHalf, cHalf, cHalf));
      const u = binary.companion.material.uniforms;
      u.uPx.value = s.starPx / binary.scale;
      u.uSpin.value = uniforms.uTime.value * 0.021 + 2.1;
      u.uAlpha.value = s.starFront ? starAlpha : 0;
      u.uLook.value = lightNow;
      u.uVoid.value = voidNow;
    }

    if (flare) {
      // one sheet in front of the eye, the size of the frame it has to cover
      const d = 2.4;
      const vh = Math.tan((camera.fov * Math.PI) / 360) * d;
      sys.pos.copy(camera.position).addScaledVector(s.fwd, d);
      setMatrix(flare.mesh, sys.pos, camera.quaternion, sys.scale.set(vh * s.cover, vh * s.cover, 1));
      const u = flare.material.uniforms;
      u.uStar.value.set(s.screenX / s.cover, s.screenY / s.cover);
      u.uRing.value = flare.ring / s.cover;
      u.uStreak.value = flare.streak / s.cover;
      u.uDisc.value = s.discR / s.cover;
      u.uLook.value = lightNow;
      u.uPx.value = 2 / (s.pxh * s.cover);
      // the lens's own marks go behind the globe with the light (s.starVis), and
      // a lens only throws them for a light in or near its frame: zoomed in, the
      // star is pushed off the sheet, and its streak would cross the whole frame
      // as a broad band
      const off = Math.max(Math.abs(s.screenX) / s.aspect, Math.abs(s.screenY));
      u.uAlpha.value = (s.starFront ? starAlpha * s.starVis * (1 - sstep(0.95, 1.35, off)) : 0) * lodK;
      flare.mesh.visible = u.uAlpha.value > 0.01;
    }

    if (halo) {
      // The halo rings whatever the sky has in it: the week's own star when one
      // is drawn, and the globe's own limb when it is not (so a quiet week still
      // has its still air, even with the star's own dial off). The arcs are what
      // is left of a light's ring in air: hairlines at one to two of the radii
      // they stand round, and a band across them. The sheet stands as far off as
      // the star does and is depth-tested as the star is: the arcs are the air
      // round a light far behind the world, and the globe stands in front of
      // them wherever it does (zoomed in, they would otherwise be drawn across its
      // limb). Scaled with its distance, the sheet projects exactly as it would in
      // front of the eye.
      const d = D_STAR;
      const vh = Math.tan((camera.fov * Math.PI) / 360) * d;
      const onStar = Boolean(star);
      const hx = onStar ? s.screenX : s.globeX;
      const hy = onStar ? s.screenY : s.globeY;
      const base = onStar ? s.discR : s.sil;
      const k0 = onStar ? 1.55 : 1.16;
      const k1 = onStar ? 2.05 : 1.31;
      const k2 = onStar ? 2.55 : 1.48;
      sheetDirection(sys, hx, hy, sys.dir2);
      sys.pos.copy(camera.position).addScaledVector(sys.dir2, d);
      setMatrix(halo.mesh, sys.pos, camera.quaternion, sys.scale.set(vh * s.cover, vh * s.cover, 1));
      const u = halo.material.uniforms;
      u.uRings.value.set(base * k0 / s.cover, base * k1 / s.cover, base * k2 / s.cover);
      u.uBand.value.set(base * (onStar ? 1.10 : 1.05) / s.cover, base * (onStar ? 1.42 : 1.24) / s.cover);
      u.uPx.value = 2 / (s.pxh * s.cover);
      u.uAlpha.value = phNow * (onStar && !s.starFront ? 0 : 1) * lodK;
      u.uLook.value = lightNow;
      halo.mesh.visible = u.uAlpha.value > 0.02;
      // Where it can paint: its outer arc, wandered and with its edge (see the
      // shader), round its centre. The sheet faces the eye at the star's depth, so
      // a unit of it is cover × (its centre's slant) half-heights of the frame. The
      // halo's own draw turns this into a scissor on whatever it is drawn into.
      sys.haloRect.set(hx / s.aspect, hy, 0, 0);
      sys.haloRect.z = (u.uRings.value.z * 1.06 + 8 * u.uPx.value) * s.cover * Math.sqrt(1 + (hx * hx + hy * hy) * s.tanY * s.tanY);
      sys.haloRect.w = sys.haloRect.z / s.aspect;
    }

    if (comet) {
      // the head stands in the band on the far side of the light's own bearing,
      // so star and comet balance the frame instead of piling into one corner
      const ang = sys.cometTurn;
      const cx = Math.cos(ang) * s.nx - Math.sin(ang) * s.ny;
      const cy = Math.sin(ang) * s.nx + Math.cos(ang) * s.ny;
      let qx = s.globeX + cx * s.bandFrac * s.m;
      let qy = s.globeY + cy * s.bandFrac;
      const qn = Math.hypot(qx, qy);
      if (qn > CROP - 0.04) { qx *= (CROP - 0.04) / qn; qy *= (CROP - 0.04) / qn; }
      sheetDirection(sys, qx, qy, sys.dir);
      const depth = SKY_DEPTH * s.dist;
      sys.pos.copy(camera.position).addScaledVector(sys.dir, depth);
      // the tails run away from the sun, foreshortened as the light's bearing is
      const tailLen = Math.max(1.2, comet.tailWorld * s.foreshort);
      const comaR = comet.comaWorld / tailLen;
      // the sheet holds the whole comet: the coma's wandered edge on the sunward
      // side, the curved fan on both flanks, the tail's end at x = 1
      const x0 = -Math.max(0.14, comaR * 1.35);
      const wide = tailLen * Math.max(comet.flank, comaR * 1.35);
      sys.xAxis.set(0, 0, 0).addScaledVector(s.right, s.tailX).addScaledVector(s.up, s.tailY).normalize();
      sys.zAxis.copy(sys.dir).multiplyScalar(-1).normalize();
      sys.yAxis.crossVectors(sys.zAxis, sys.xAxis).normalize();
      sys.xAxis.crossVectors(sys.yAxis, sys.zAxis).normalize();
      sys.basis.makeBasis(sys.xAxis, sys.yAxis, sys.zAxis);
      sys.q.setFromRotationMatrix(sys.basis);
      sys.pos.addScaledVector(sys.xAxis, tailLen * (x0 + 1) * 0.5);
      setMatrix(comet.mesh, sys.pos, sys.q, sys.scale.set(tailLen * (1 - x0) * 0.5, wide, 1));
      const u = comet.material.uniforms;
      u.uW2L.value = wide / tailLen;
      u.uComaR.value = comaR;
      u.uX0.value = x0;
      u.uLook.value = cometNow;
      u.uPxX.value = Math.max(0.0008, (2 / s.pxh) * ((depth * s.tanY) / tailLen));
      u.uPxY.value = Math.max(0.0008, (2 / s.pxh) * ((depth * s.tanY) / wide));
      u.uAlpha.value = phNow * s.sky;
      comet.mesh.visible = u.uAlpha.value > 0.02;
    }

    if (belt) {
      // the plane: a lean off the eye's own axis, so the poster sees an open belt
      // whose near side crosses the globe and whose far side is hidden behind it
      sys.dir.copy(s.fwd).multiplyScalar(Math.cos(belt.tilt)).addScaledVector(s.up, -Math.sin(belt.tilt)).normalize();
      sys.q.setFromUnitVectors(sys.axisY, sys.dir);
      sys.spinQ.setFromAxisAngle(sys.axisY, uniforms.uTime.value * belt.spin);
      sys.q.multiply(sys.spinQ);
      sys.pos.set(0, 0, 0);
      setMatrix(belt.mesh, sys.pos, sys.q, sys.scale.set(1, 1, 1));
      belt.mesh.visible = phNow * s.sky > 0.02;
    }

    if (moon) {
      // it stands off the limb on the far side of the star from the light, with
      // its own air all round it: a moon pinned to the planet reads as a badge
      // clear of the limb, and as near the crop's edge as that allows: the old
      // inward clamp could pull it back onto the globe's own silhouette, which is
      // exactly where a moon must not be (it reads as a badge on the planet)
      const moonRad = Math.max(s.sil + moon.size + 0.016, CROP - 0.006 - moon.size);
      const mx = s.globeX - s.nx * moonRad * s.m;
      const my = s.globeY - s.ny * moonRad;
      sheetDirection(sys, mx, my, sys.dir);
      const depth = SKY_DEPTH * s.dist;
      sys.pos.copy(camera.position).addScaledVector(sys.dir, depth);
      const rad = moon.size * s.tanY * depth;
      setMatrix(moon.mesh, sys.pos, camera.quaternion, sys.scale.set(rad, rad, 1));
      const u = moon.material.uniforms;
      u.uLight.value.set(s.lightFlat > 1e-3 ? s.nx : 0, s.lightFlat > 1e-3 ? s.ny : 1);
      u.uPx.value = Math.max(0.002, (2 / s.pxh) * ((depth * s.tanY) / rad));
      u.uTime.value = uniforms.uTime.value;
      u.uAlpha.value = phNow * s.sky;
      moon.mesh.visible = u.uAlpha.value > 0.02;
    }
  };

  // Where the comet's head stands, as a turn off the star's own bearing: a
  // bearing of its own, so the two never pile into one corner — but a *tangential*
  // one, because the tail runs along the anti-sun direction whatever the head
  // does, and a head on the far side of the frame would sweep its tail straight
  // out of the picture. Beside the star, the whole comet is in the frame: head in
  // the sky band, tail across the globe, the last dry inch running out of the
  // sheet.
  sys.cometTurn = (1.05 + 0.70 * dice[0]) * (dice[1] > 0.5 ? 1 : -1);
  // One driver carries the frame's own update, and it is the only thing that
  // does. Every other sheet here can be hidden (the belt, the comet and the moon
  // all fade out as the camera lands), and a hidden mesh is never offered a
  // render callback — so a system whose every sheet had faded would never wake
  // again. The driver is a sub-pixel quad that writes nothing at all (its colour is masked off; a shader with no
  // output at all is a failed draw, logged every frame): it is the one thing always in the frame, and its callback
  // is the frame's.
  const driver = new T.Mesh(new T.PlaneGeometry(2, 2), new T.ShaderMaterial({
    vertexShader: SHEET_VERT,
    fragmentShader: 'void main(){ gl_FragColor = vec4(0.0); }',
    transparent: true,
    colorWrite: false,
    depthWrite: false,
    depthTest: false,
  }));
  driver.name = 'companion-system-frame';
  driver.frustumCulled = false;
  driver.matrixAutoUpdate = false;
  driver.renderOrder = 11;
  driver.matrix.makeScale(1e-4, 1e-4, 1);
  driver.matrixWorld.copy(driver.matrix);
  driver.onBeforeRender = (renderer, scene, camera) => update(renderer, scene, camera);
  group.add(driver);
  // Every sheet carries the callback too, not only the driver: the belt's wash is
  // an opaque material, so three draws it in the opaque pass, before any
  // transparent sheet is offered its callback — with the driver alone the belt
  // would be drawn a frame behind the camera. The guard inside update() lets the
  // first of them do the work and the rest do nothing.
  for (const child of group.children) {
    if (child !== driver) child.onBeforeRender = (renderer, scene, camera) => update(renderer, scene, camera);
  }
  // The halo paints only its arcs and its band round one centre, on a sheet the size of the frame: it is drawn under a
  // scissor of that square (sys.haloRect, in the pixels of whatever it is drawn into), so the rest of the frame takes
  // none of its shading. Every pixel it leaves out is one its shader discarded.
  if (halo) {
    let scissored = false;
    halo.mesh.onBeforeRender = (renderer, scene, camera) => {
      update(renderer, scene, camera);
      if (!scene || !camera) return;
      const target = renderer.getRenderTarget();
      const W = target ? target.width : s.px.x, H = target ? target.height : s.px.y;
      const at = sys.haloRect;
      const cx = (at.x * 0.5 + 0.5) * W, cy = (at.y * 0.5 + 0.5) * H;
      const rx = at.w * 0.5 * W, ry = at.z * 0.5 * H;
      const x0 = clamp(Math.floor(cx - rx) - 2, 0, W), x1 = clamp(Math.ceil(cx + rx) + 2, 0, W);
      const y0 = clamp(Math.floor(cy - ry) - 2, 0, H), y1 = clamp(Math.ceil(cy + ry) + 2, 0, H);
      const pr = renderer.getPixelRatio();
      sys.scissorTestWas = renderer.getScissorTest();
      renderer.getScissor(sys.scissorWas);
      renderer.setScissor(x0 / pr, y0 / pr, (x1 - x0) / pr, (y1 - y0) / pr);
      renderer.setScissorTest(true);
      scissored = true;
    };
    halo.mesh.onAfterRender = (renderer) => {
      if (!scissored) return;
      scissored = false;
      renderer.setScissor(sys.scissorWas);
      renderer.setScissorTest(sys.scissorTestWas);
    };
  }

  // The furthest the week's system stands, in planet radii. Only the belt stands
  // in the world at a radius of its own; the star, the comet, the moon and the
  // halo are placed on the sheet from the camera that draws them, so what they
  // ask of a poster is not a distance but a rim: the frame has to keep the band
  // between the globe's own limb and its edge (the disc and the tails all stand
  // in about 1.15 of the globe's own silhouette), and a shot that fills the
  // still with the globe alone would push the whole system out of the picture.
  // A hair over one globe is what that costs, and it is what telescopes and the
  // hero shot are given so a week's sky is in the frame they compose.
  let reach = 1.18;
  if (belt) reach = Math.max(reach, belt.outer / R);
  group.userData.reach = +reach.toFixed(3);
  group.userData.system = {
    week: features.week,
    hour: +hour.toFixed(2),
    sun: `#${pigment.getHexString()}`,
    earns: earns.earns,
    reach: group.userData.reach,
  };
  // the system's own teardown: the star, the belt, the moon, the comet and the
  // sheets that carry them — every geometry, material and texture under the group
  attachTeardown(group);
  return group;
}

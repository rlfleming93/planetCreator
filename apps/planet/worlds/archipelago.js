/* Planet Creator — the archipelago world.
 *
 * A week spent in the water is read as a drowned one: most of the globe is sea
 * and the week's sessions stand in it as islands. Every activity raises one
 * island on its own day-band site — a chain of one, stretched along the band
 * the week's sessions already run down, sized by the hours spent there — and an
 * islet or two strung off its ends. A swim raises no dome but a reef: a pool
 * inside, a broken ring of sand round it and a shallow flat beyond, so the
 * basin base.js carves for a swim finds water that is already the week's own.
 *
 * The sea is the one thing this world cannot lay out in the order it draws in:
 * base.js cuts it after the ground, from the ground's own heights, and the
 * week's route mountains are already in those heights. So the ground is built
 * around a waterline (y = 0) and the waterline is solved: the field this world
 * lays down, with the week's routes' own relief on it, is sampled round the
 * globe the way base.js samples it for the sea, and the whole field is moved
 * until that sample's quantile lands on the line. Every level below — the
 * crowns, the reef flats, the atoll pools, the terraces the beaches are laid on
 * — is then a fixed depth below a line the picture really has, whatever the
 * week's routes lifted the sea to (see stateFor).
 *
 * The companion is the sea's own satellite: a small painted moon, its size
 * taken from the distance swum, hung just off the poster's limb.
 */
import { paintedMoon } from './companions.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smoothstep = (t) => t * t * (3 - 2 * t);
const mix = (a, b, t) => a + (b - a) * t;

/* ---------------------------------------------------------------- water --- */

// Every level below is measured from the world's waterline, which the solve puts
// the week's sea onto (see stateFor).
const SEA_TARGET = 0.2; // where the modelled field's own quantile is aimed: the beaches, the coast raggedness and the land's own swell lower the drawn sea a fifth of a unit below it (measured across the synthetic and the real weeks)
// The reef flat, the lagoon inside the ring, and the ring itself. These three
// numbers are the whole of an atoll: a flat just far enough under the water that
// the shallow wash over it is a *turquoise* and not a pale film, a pool inside
// the ring that is only half as deep again — so the lagoon is a step brighter
// than the reef round it, which is the ring the eye reads — and a rim that
// stands a full body's height out of the water, so it casts the only shadow a
// low island has. At the old depths the pool and the flat were a fifth of a unit
// apart: the ocean's own bands fell in the same wash on both sides of the ring
// and an atoll read as one flat turquoise disc with a pale outline, which is
// what "no lagoon ring" means.
const APRON = -1.55; // the reef flat: the shelf the ink washes run to −1.6, so every flat is laid inside it
const POOL = -0.35; // an atoll's inner pool: half the flat's depth, so the lagoon is its own wash.
                    // Read against the sea's own bands, a pool a fifth of a unit under the water is a lagoon
                    // the light goes *into*, and one deeper than the flat's own shelf band is a hole — which is
                    // what the atolls were read as before this was lifted.
const RIM = 2.4; // an atoll's ring, above the waterline
const CHANNEL = -0.35; // …and where the ring is broken, a channel just under it
const SHORE = 0.30; // an island's last step above the water, before the foreshore
const DEEP = -9.5; // what the reef edge falls away to, where no bank is deeper
const BENCH = 1.8; // the terrace the land's first metres are flattened into: a wide pale shore
const BENCH_POW = 1.18;
const COAST = 2.6; // shore raggedness is drawn only on ground this near the waterline
const COAST_AMP = 0.78;
const COAST_FREQ = 20;
const DUNE_TOP = 6; // the sand plain: low ground gets a slow swell of its own, wide enough that the eye sees it from orbit, so an island's wash has something to break on
const DUNE_AMP = 1.5;
const DUNE_FREQ = 2.8;
const GRAIN_TOP = 7; // …and the ground's own grain, over every piece of land: the walker's ripples, and what the ink's dry brush breaks on
const GRAIN_AMP = 0.38;
const GRAIN_FREQ = 26;

/* --------------------------------------------------------------- banks ---- */

// The bank field: a coarse shelf-versus-basin term and a finer shoal term
// inside it — the shoal carrying most of the amplitude, so the land is a
// scatter of cays and bars rather than one platform — both read through one
// shared warp, so the banks, the shoals and the islands' outlines deform
// together instead of each keeping its own lattice. Both are read across the
// day band only slowly, so shoal chains run down the band the week's sessions
// run down. Where the field crosses the waterline is the week's own sea.
const BANK_FREQ = 1.2, BANK_AMP = 1.8;
const SHOAL_FREQ = 5.2, SHOAL_AMP = 4.6;
const BAND_STRETCH = 1.6; // how much slower the shoals run across the day band than along it
const WARP_FREQ = 2.4, WARP_AMP = 0.45;
const RAGGED_FREQ = 9.5;
// Below the waterline the bank falls away this much faster than it rises above
// it: the same coastline, drawn over a deep sea instead of a shallow shelf. The
// islands' own profiles are laid after this, on their own fixed levels, so the
// reef flats stay exactly where they were put.
const SEA_DEEPEN = 2.6;

/* -------------------------------------------------------------- islands --- */

// An island's profile, read at q — its distance from the centre in its own
// radii, the short radius being the one across the day band. The numbers are
// the profile's breakpoints in q, from the crown out to the reef edge.
const Q_TOP = 0.42; // the crown's plateau
const Q_FLANK = 1.05; // the flank, down to the last step above the water
const Q_SHORE = 1.35; // the foreshore, into the reef flat
const Q_FLAT = 1.75; // the flat's outer edge, where the reef drops off
const Q_EDGE = 2.55; // the reef's own shoulder, into the deep: a wide enough
                     // slope that the ocean's depth bands — and with them the
                     // turquoise grades over the sand — fall across it
const LA_BASE = 0.072, LA_HOURS = 0.055, LA_JITTER = 0.03; // half-length along the band, radians: an hour → ≈15 u
const AC_RATIO = 0.5, AC_JITTER = 0.32; // the across-band radius, as a fraction of it
const PEAK_BASE = 2.8, PEAK_HOURS = 1.4, PEAK_JITTER = 1.2; // crown height above the waterline
const CROWN_MAX = 5; // …and its ceiling: with the tallest bank this keeps a week's own ground, plus the range it carries, under the orbit's relief cap
const CHAIN = 2; // islets strung off an island's own ends, at most
const CHAIN_STEP = 1.2, CHAIN_SIZE = 0.42, CHAIN_PEAK = 1.7;
const RAGGED_BASE = 0.2, RAGGED_JITTER = 0.2; // how far a warped outline may wander

/* ------------------------------------------------------------ volcanoes --- */

// A week whose own heart rate was up in the top zones for a third of it swims
// hard, and a hard week's island is not a sand cay: it is a volcano — the cone
// the windward flank builds, with the caldera bitten out of the top of it, and
// the caldera's floor under the waterline so the hollow holds a lake. That ring
// of rock with a dark dot in it is the one shape in this world an eye reads at
// any distance, and it is earned: the week pays for it in its own zone seconds,
// and a cruise week keeps its flat cays. `readable` is the whole point of the
// numbers below — the rim stands at the crown's own height, the caldera is a
// third of the island across, and the lake is a third of the caldera.
const VOLC_GATE = 0.28;      // the share of the week in zones 4-5 a volcano costs: a hard
                             // week's cays burn. At a third the threshold only a
                             // once-a-season week ever carried one, so on the wall's own
                             // hard weeks there was nothing to see — the brief asks for
                             // island volcanoes on hard weeks, and a hard week is a
                             // quarter of its time in the top two zones.
const VOLC_RIM = 0.30;       // where the rim stands, in q
const VOLC_BASE = 0.45;      // the cone's own floor, as a share of the crown
const VOLC_DEEP = 0.55;      // …and how far the caldera is cut under it
const VOLC_END = 0.70;       // the shoulder the cone's flank leaves the crown at
const VOLC_COUNT = 2;        // how many of the week's islands burn

/* --------------------------------------------------------- the routes ----- */

// What the week's routes lift the ground by. Only the waterline solve reads
// this: base.js lays the real profile down itself, and this world only has to
// predict where the sea it cuts will land, which the routes' own relief takes
// part in. The crest's reach and its broader apron are modelled at base.js's
// own widths and amplitudes, with the two modulations and the warp folded into
// the one mean factor (they move the sea by a hundredth of a unit and no more).
const ROUTE_ALONG = 0.62; // the mean of base.js's summit-along-route modulation
const ROUTE_APRON = 0.25; // the share of a range's height its apron carries, as base.js lays it
// Where a route begins and ends, this world lays a cay: base.js runs a range's
// own summit modulation to nothing at the two ends of its route, so the finish
// of the week's race — and the spot the runner lands on — can stand in open
// water when the route is drawn on an ocean. A spit of sand under each end is
// what the sea would have left there anyway, and it is the one piece of this
// world a landing depends on: without it the finish monument stands in the
// lagoon and the spawn is swimming. Measured from the waterline, like every
// other level here, and laid in both the drawn ground and the solve that finds
// the waterline, so the two always agree.
const CAY_R = 8.5; // the spit's radius: wide enough that it reaches from the
                   // finish to the spot the runner lands on, ten units back — at half a
                   // route's own width the two stood on separate patches of sand with
                   // water between them
const CAY_TOP = 1.9; // how far its crown stands above the waterline: a low cay, and a beach to land on
const CAY_FINISH = 1.35; // the finish end is the bigger of the two, where the monument stands
const CAY_LIFT = 1.1; // …and how much taller the crown is there

/* ---------------------------------------------------------- the reading --- */

// The sea a week earns, from its own stats alone: an archipelago keeps between
// 65% and three quarters of the globe under water, the more of it the more of
// the week was swum. `climate` hands this to the reading and `stateFor` aims
// its own waterline solve at the same number.
function oceanFracFor(stats) {
  const swim = Number(stats?.sports?.swim) || 0;
  return clamp(0.65 + 0.1 * Math.min(1, swim / 0.4), 0.65, 0.75);
}

// A week's islands, built once per week and kept off the ctx: the hooks run per
// vertex, so nothing may be built there.
const STATES = new WeakMap();

// One site: its centre, the band's own frame at it — e along the day band, n
// across it — the profile's two radii, and what the profile is worth there.
function makeSite(dir, { la, ac, top, pool, rim, ragg, flatW = 1, volc = false }) {
  let ex = dir.z, ey = 0, ez = -dir.x; // cross(up, dir): the tangent along the day band
  let el = Math.hypot(ex, ey, ez);
  if (!(el > 1e-6)) { ex = 1; ey = 0; ez = 0; el = 1; } // over a pole: any tangent will do
  ex /= el; ey /= el; ez /= el;
  return {
    cx: dir.x, cy: dir.y, cz: dir.z,
    ex, ey, ez,
    nx: dir.y * ez - dir.z * ey, ny: dir.z * ex - dir.x * ez, nz: dir.x * ey - dir.y * ex,
    la, ac, top, pool, rim, ragg, flatW, volc,
    // the reach the profile can really stand at, warped outline included: past
    // this a site has fallen below any bank it could have stood on
    gate: Math.cos(Math.min(1.5, Q_EDGE * 1.45 * flatW * Math.max(la, ac))),
  };
}

// What a site is worth at q, the outline's own raggedness having already been
// read: the crown — or, for a swim, the pool and its broken ring; for a volcano,
// the rim and its caldera — the flank, the foreshore, the flat, and the edge it
// falls away at.
function profileAt(s, q, ragged) {
  if (s.pool == null) {
    if (q <= Q_TOP) {
      if (s.volc) {
        // the cone, with the caldera cut out of the top of it: the flank climbs
        // to the rim and the floor falls away inside, under the waterline, where
        // the sea fills it
        if (q <= VOLC_RIM) {
          const u = q / VOLC_RIM;
          const cone = VOLC_BASE + (1 - VOLC_BASE) * u * u;
          const bowl = 1 - u * u * (3 - 2 * u);
          return s.top * cone - s.top * VOLC_DEEP * bowl;
        }
        const w = (q - VOLC_RIM) / (Q_TOP - VOLC_RIM);
        return s.top * (1 - (1 - VOLC_END) * w * w);
      }
      return s.top;
    }
    const top = s.volc ? s.top * VOLC_END : s.top;
    if (q <= Q_FLANK) return mix(top, SHORE, smoothstep((q - Q_TOP) / (Q_FLANK - Q_TOP)));
    if (q <= Q_SHORE) return mix(SHORE, APRON, smoothstep((q - Q_FLANK) / (Q_SHORE - Q_FLANK)));
  } else {
    // the ring is broken by the same warped field that draws the outline: a rim
    // of sand where it stands high, a channel where it does not
    const crest = mix(CHANNEL, s.rim, clamp((ragged + 0.22) * 1.15, 0, 1));
    if (q <= Q_TOP) return s.pool;
    if (q <= Q_FLANK) return mix(s.pool, crest, smoothstep((q - Q_TOP) / (Q_FLANK - Q_TOP)));
    if (q <= Q_SHORE) return mix(crest, APRON, smoothstep((q - Q_FLANK) / (Q_SHORE - Q_FLANK)));
  }
  const flat = Q_FLAT * s.flatW;
  const edge = Q_EDGE * s.flatW;
  if (q <= flat) return APRON;
  if (q <= edge) return mix(APRON, DEEP, smoothstep((q - flat) / (edge - flat)));
  return DEEP;
}

// The ground one site stands on at a direction, or null where it has none.
function siteAt(st, s, x, y, z) {
  if (x * s.cx + y * s.cy + z * s.cz < s.gate) return null;
  const dx = x * s.ex + y * s.ey + z * s.ez;
  const dy = x * s.nx + y * s.ny + z * s.nz;
  const a = dx / s.la, b = dy / s.ac;
  const ragged = st.fbm(st.nz, x * RAGGED_FREQ, y * RAGGED_FREQ, z * RAGGED_FREQ, 2) * 2 - 1;
  let q = Math.sqrt(a * a + b * b);
  if (s.ragg > 0) q *= 1 + s.ragg * ragged;
  return profileAt(s, q, ragged);
}

// One island (or atoll) at a site, and the islets strung off its ends.
function addSite(st, sites, dir, { la, ac, top, pool, rim, ragg, flatW, volc, hours2, rng }) {
  sites.push(makeSite(dir, { la, ac, top, pool, rim, ragg, flatW, volc }));
  const site = sites[sites.length - 1];
  const count = Math.round(rng() * CHAIN);
  for (let k = 0; k < count; k++) {
    const off = la * (CHAIN_STEP + 0.5 * rng()) * (k % 2 ? 1 : -1);
    // the islet rides the tangent plane at the island: along the band, outward
    const tx = dir.x + site.ex * off;
    const ty = dir.y + site.ey * off;
    const tz = dir.z + site.ez * off;
    const len = Math.hypot(tx, ty, tz) || 1;
    const small = CHAIN_SIZE * (0.7 + 0.6 * rng());
    sites.push(makeSite({ x: tx / len, y: ty / len, z: tz / len }, {
      la: la * small,
      ac: ac * small,
      top: Math.min(CROWN_MAX, CHAIN_PEAK + 2 * hours2 * rng()),
      ragg,
      // a cay keeps its reef narrow: the wide flats belong to the island that
      // carries the week, so the picture has a hierarchy of reefs and not one
      // even shelf round every speck of sand
      flatW: 0.6 + 0.5 * rng(),
    }));
  }
}

// The week's sites: one island to a session, its own day-band site its centre.
function buildSites(st) {
  const ctx = st.ctx;
  const rng = ctx.rng('archipelago/islands');
  const placed = Array.isArray(ctx.placed) ? ctx.placed : [];
  // the week's own hardness, which is what a volcano is made of: a hard week
  // burns, a cruise week does not
  const hard = clamp((Number(ctx.stats?.hard) || 0) / 0.4, 0, 1);
  const burns = hard >= VOLC_GATE;
  // the week's biggest sessions are the islands that burn: the longest swim or
  // the longest ride of the week is its mountain, and the rest are cays
  const ranked = placed
    .map((place, index) => ({ place, index, hours: Number(place.hours) || 0 }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, VOLC_COUNT)
    .map((row) => row.index);
  const sites = [];
  for (let i = 0; i < placed.length; i++) {
    const place = placed[i];
    const dir = place.dir;
    if (!dir) continue;
    const hours = clamp(Number(place.hours) || 0, 0.15, 8);
    const hours2 = Math.sqrt(hours);
    const swim = String(place.a?.sport || '').toLowerCase() === 'swimming';
    // a long session builds a bigger island, and a swim's island is a reef: the
    // reef's own width is read off the hours so no two islands wear the same ring
    const la = LA_BASE + LA_HOURS * hours2 + LA_JITTER * rng() + (swim ? 0.02 : 0);
    const ac = la * (AC_RATIO + AC_JITTER * rng());
    const ragg = RAGGED_BASE + RAGGED_JITTER * rng();
    const volc = burns && ranked.includes(i) && !swim;
    addSite(st, sites, dir, {
      la: volc ? la * 1.15 : la, ac: volc ? ac * 1.15 : ac, ragg, hours2, rng, volc,
      flatW: (volc ? 1.25 : 0.78) + 0.55 * rng(),
      top: Math.min(CROWN_MAX, PEAK_BASE + PEAK_HOURS * hours2 + PEAK_JITTER * rng() + (volc ? 1.1 : 0)),
      pool: swim ? POOL + 0.25 * rng() : null,
      rim: swim ? RIM + 0.6 * rng() : 0,
    });
  }
  return sites;
}

// The bank under everything: shifted so that its own ocean-fraction quantile is
// the waterline, deepened below it, and left alone above it.
function bankAt(st, x, y, z) {
  const w = st.fbm(st.nz, x * WARP_FREQ, y * WARP_FREQ, z * WARP_FREQ, 2) * 2 - 1;
  const k = 1 + WARP_AMP * w;
  const bankF = BANK_FREQ * k, bankY = BANK_FREQ * BAND_STRETCH * k;
  const shoalF = SHOAL_FREQ * k, shoalY = SHOAL_FREQ * BAND_STRETCH * k;
  const raw = BANK_AMP * (st.fbm(st.nz, x * bankF, y * bankY, z * bankF, 3) * 2 - 1)
    + SHOAL_AMP * (st.fbm(st.nz, x * shoalF, y * shoalY, z * shoalF, 2, 0.45) * 2 - 1)
    + st.water - st.bankMid;
  return raw > 0 ? raw : raw * SEA_DEEPEN;
}

// The undecorated ground at a direction: the bank, and whichever of the week's
// islands stands higher there. Everything is measured from the waterline, so
// the whole field moves with it.
function groundAt(st, x, y, z) {
  let h = bankAt(st, x, y, z);
  const sites = st.sites;
  for (let i = 0; i < sites.length; i++) {
    const t = siteAt(st, sites[i], x, y, z);
    if (t != null && t > h - st.water) h = t + st.water;
  }
  return h;
}

// What the other hands' own relief — the week's route mountains, above all —
// comes to in this world, measured from the ground this world laid down. An
// island's range is a ridge and not a wall: the added relief is drawn down to a
// fraction of itself (the reading commons and tundra give their own weeks), with
// a knee over the top so a once-in-a-year climb cannot stand as a tower, and the
// sea kept wherever it would build land out of open water. Both hooks and the
// waterline solve read the ground through this, so the sea lands where the drawn
// ground really is.
const ROUTE_SCALE = 0.3;
const ADD_CEIL = 4.5; // above this the added relief only creeps: with this world's own crowns at six units, the tallest ground a week can raise stays under the orbit's relief cap, which would otherwise cut it into a flat-topped shelf on the limb
const ADD_KNEE = 0.2;
const SHOAL_ADD = 3.5; // how far a route may raise open water of its own
const SHOAL_CLEAR = 0.3; // …the clearance it leaves under the waterline
const SHOAL_BLEND = 2; // …and how far up the shore the handover from held to free runs
function keepTheSea(st, own, h) {
  const added = h - own;
  if (added <= 0) return h; // the week carved here; that is the week's own
  const ceiling = st.water - SHOAL_CLEAR;
  const room = own >= ceiling ? 0 : Math.min(SHOAL_ADD, ceiling - own);
  const held = own + Math.min(added, room);
  return mix(held, h, smoothstep(clamp((own - ceiling) / SHOAL_BLEND, 0, 1)));
}
function reliefFor(st, own, h) {
  if (!(h > own)) return h; // nothing added, or a valley carved: the week's own reading, left as it is
  let added = (h - own) * ROUTE_SCALE;
  if (added > ADD_CEIL) added = ADD_CEIL + (added - ADD_CEIL) * ADD_KNEE;
  return keepTheSea(st, own, own + added);
}

// The cay under a route's two ends: a smooth spit whose crown stands CAY_TOP
// above the waterline (a little more under the finish), its shore where the
// profile meets the water itself. Returns the height above the waterline, or 0
// where no end is near. Read by the drawn ground and by the solve alike.
function cayAt(st, x, y, z) {
  const ends = st.ends;
  if (!ends.length) return 0;
  let best = 0;
  for (let i = 0; i < ends.length; i += 4) {
    const ex = x - ends[i], ey = y - ends[i + 1], ez = z - ends[i + 2];
    const d2 = ex * ex + ey * ey + ez * ez;
    if (d2 > CAY_R * CAY_R) continue; // the chord never exceeds the arc, so this cannot skip a cay that is near
    const d = 2 * st.R * Math.asin(Math.min(1, Math.sqrt(d2) * 0.5));
    if (d >= CAY_R) continue;
    const t = smoothstep(1 - d / CAY_R);
    const h = (CAY_TOP + CAY_LIFT * ends[i + 3]) * Math.pow(t, 0.7);
    if (h > best) best = h;
  }
  return best;
}

// …and how it is laid: a floor at the waterline plus the cay's own height, so
// whatever the week's own relief does at the end of its route, the end itself
// is a piece of land.
function laid(st, h, x, y, z) {
  const cay = cayAt(st, x, y, z);
  if (cay <= 0) return h;
  const floor = st.water + cay;
  return h > floor ? h : floor;
}

// What the week's routes lift the waterline solve's own field by: a crest at
// the range's height with base.js's own reach, and the apron around it.
function routeBump(st, x, y, z) {
  let add = 0;
  const routes = st.routes;
  for (let i = 0; i < routes.length; i++) {
    const r = routes[i];
    const dx = x - r.cx, dy = y - r.cy, dz = z - r.cz;
    if (dx * dx + dy * dy + dz * dz > r.capSq) continue;
    const seg = r.seg;
    let best = Infinity;
    for (let k = 0; k < seg.length; k += 3) {
      const ex = x - seg[k], ey = y - seg[k + 1], ez = z - seg[k + 2];
      const d2 = ex * ex + ey * ey + ez * ez;
      if (d2 < best) best = d2;
    }
    // the chord back to the arc the range is measured in
    const d = 2 * st.R * Math.asin(Math.min(1, Math.sqrt(best) * 0.5));
    const crest = 1 - d / r.width;
    const up = crest > 0 ? Math.pow(crest, 1.6) : 0;
    if (up > 0) add += ROUTE_ALONG * r.amp * up;
    const apron = 1 - d / (3 * r.width);
    if (apron > 0) add += ROUTE_ALONG * ROUTE_APRON * r.amp * Math.max(0, smoothstep(apron) - up);
  }
  return add;
}

// The week's noise, sites and routes, plus the waterline: the field — this
// world's ground with the week's routes on it — is sampled round the globe the
// way base.js samples it for the sea, and moved until the sample's own
// ocean-fraction quantile lands on SEA_TARGET. The bank's own mid is fixed
// first, so the shoals keep their own waterline, and the whole field is then
// moved under them until the sea lands where base.js will cut it. A few passes
// are enough: the field is monotone in the shift. One solve, on the first
// vertex, and never again.
function stateFor(ctx) {
  const cached = STATES.get(ctx);
  if (cached) return cached;
  const st = {
    ctx,
    nz: ctx.nz,
    fbm: ctx.fbm,
    R: Number(ctx.R) || 120,
    sites: null,
    routes: [],
    ends: [], // the two ends of every route, where the cays are laid: x, y, z, finish?
    water: 0, // the waterline, in world units
    bankMid: 0,
  };
  STATES.set(ctx, st);
  st.sites = buildSites(st);
  for (const route of Array.isArray(ctx.routes) ? ctx.routes : []) {
    st.routes.push({
      seg: route.seg,
      capSq: route.capSq,
      amp: route.baseAmp,
      width: route.baseWidth,
      cx: route.dir.x, cy: route.dir.y, cz: route.dir.z,
    });
    // the two ends, the finish marked: the last point of the route's own arc is
    // where base.js stands the monument, and the first is where the runner lands
    if (route.finish) st.ends.push(route.finish.x, route.finish.y, route.finish.z, 1);
    if (route.spawn) st.ends.push(route.spawn.x, route.spawn.y, route.spawn.z, 0);
  }
  const n = 2400, ga = Math.PI * (3 - Math.sqrt(5));
  const samples = new Float64Array(n);
  const index = clamp(Math.floor(oceanFracFor(ctx.stats) * n), 0, n - 1);
  const dirX = new Float64Array(n), dirY = new Float64Array(n), dirZ = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = ga * i;
    dirX[i] = Math.cos(th) * r;
    dirY[i] = y;
    dirZ[i] = Math.sin(th) * r;
  }
  // the shoals' own waterline, so the banks keep the sea they were drawn with
  for (let i = 0; i < n; i++) samples[i] = bankAt(st, dirX[i], dirY[i], dirZ[i]);
  samples.sort();
  st.bankMid = samples[index];
  // …and the field's, with the week's own routes on it, drawn down as this
  // world draws them and with the sea kept where they would build land
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < n; i++) {
      const own = groundAt(st, dirX[i], dirY[i], dirZ[i]);
      samples[i] = laid(st, reliefFor(st, own, own + routeBump(st, dirX[i], dirY[i], dirZ[i])), dirX[i], dirY[i], dirZ[i]);
    }
    samples.sort();
    const q = samples[index];
    st.water += SEA_TARGET - q;
    if (Math.abs(SEA_TARGET - q) < 0.02) break;
  }
  return st;
}

/* ---------------------------------------------------------- the palette --- */

// The family this world repaints a week in — sand and ochre on the land, chalk
// on its crests, turquoise over a deep that is nearly the ink's — built once,
// out of the palette's own colour class so the module needs no second copy.
let FAM = null;
function family(pal) {
  if (FAM) return FAM;
  const C = pal.landLow.constructor;
  FAM = {
    landLow: new C(0xdfcda4), landMid: new C(0xd6bd93), landHigh: new C(0xb08a58),
    crest: new C(0xf4edd8), dry: new C(0xe9dcb8), bare: new C(0xbd8347), stone: new C(0xd9cdb2),
    veg: new C(0x8fa269), foam: new C(0xe9e6d6), farGlaze: new C(0xa9c4c4),
    seaShallow: new C(0x63bfb4), seaDeep: new C(0x123a44), teal: new C(0x4fb0a8), cobalt: new C(0x2b6d78),
    shelf: new C(0x9ed9c9), dark: new C(0x14262b),
    skyWash: new C(0xbcd9d4), skyDeep: new C(0x6f93a0), cloudUnder: new C(0xc3cfc8), skyBand: new C(0xe6e7d6),
  };
  return FAM;
}

/* --------------------------------------------------------- the companion -- */

const aimScratch = { x: 0, y: 0, z: 0 };
const dirScratch = { x: 0, y: 0, z: 0 };
const probeScratch = { x: 0, y: 0, z: 0 };

// The poster's own aim, as base.js composes it (posterSubject then turnToSun):
// the race's midcourse turned away from us, the finish monument, or the week's
// activity centroid weighted by the time spent there.
function posterAim(features, sun, out) {
  const race = features.race;
  if (race) {
    const half = race.total * 0.5;
    let i = 1;
    while (i < race.cum.length - 1 && race.cum[i] < half) i++;
    const t = (half - race.cum[i - 1]) / Math.max(1e-6, race.cum[i] - race.cum[i - 1]);
    const a = (i - 1) * 3, b = i * 3;
    out.x = mix(race.seg[a], race.seg[b], t);
    out.y = mix(race.seg[a + 1], race.seg[b + 1], t);
    out.z = mix(race.seg[a + 2], race.seg[b + 2], t);
  } else if (features.monument) {
    out.x = features.monument.dir.x;
    out.y = features.monument.dir.y;
    out.z = features.monument.dir.z;
  } else {
    out.x = 0; out.y = 0; out.z = 0;
    for (const f of features.list || []) {
      if (f.kind === 'monument') continue;
      const seconds = Number(f.stats?.activeS);
      const w = Number.isFinite(seconds) ? Math.max(900, seconds) : 900;
      out.x += f.dir.x * w; out.y += f.dir.y * w; out.z += f.dir.z * w;
    }
  }
  let len = Math.hypot(out.x, out.y, out.z);
  if (!(len > 1e-6)) {
    const first = features.list?.[0]?.dir || sun;
    out.x = first.x; out.y = first.y; out.z = first.z;
    len = Math.hypot(out.x, out.y, out.z) || 1;
  }
  out.x /= len; out.y /= len; out.z /= len;
  if (race) { out.x = -out.x; out.y = -out.y; out.z = -out.z; }
  // turn toward the sun by POSTER_OFF, the framing every default poster uses
  const off = features.monument ? 0.6 : 0.28;
  const along = out.x * sun.x + out.y * sun.y + out.z * sun.z;
  const lx = sun.x - along * out.x, ly = sun.y - along * out.y, lz = sun.z - along * out.z;
  const ll = Math.hypot(lx, ly, lz);
  if (ll > 1e-6) {
    out.x += (lx / ll) * off; out.y += (ly / ll) * off; out.z += (lz / ll) * off;
    const ol = Math.hypot(out.x, out.y, out.z) || 1;
    out.x /= ol; out.y /= ol; out.z /= ol;
  }
  return out;
}

/**
 * Where the companion hangs: at right angles to the poster's own camera — that
 * is, out at the limb — a third of a radian off the frame's own up, so it stands
 * clear of the disc's top side over open water and clear of everything the moon
 * would otherwise be standing in. A bearing whose bay is a mountain is walked
 * round the limb a twentieth of a turn at a time until it finds water.
 */
function limbDirection(ctx) {
  const { features } = ctx;
  const sun = ctx.uniforms?.uSunDir?.value;
  if (!sun) return null;
  const cam = posterAim(features, sun, aimScratch);
  // the frame's own axes at that camera: up is the world's up, right is square
  // to both, and the limb is every direction square to the camera
  let ux = 0, uy = 1, uz = 0;
  const along = ux * cam.x + uy * cam.y + uz * cam.z;
  ux -= along * cam.x; uy -= along * cam.y; uz -= along * cam.z;
  let ul = Math.hypot(ux, uy, uz);
  if (!(ul > 1e-6)) { ux = 1; uy = 0; uz = 0; ul = 1; }
  ux /= ul; uy /= ul; uz /= ul;
  const rx = cam.y * uz - cam.z * uy;
  const ry = cam.z * ux - cam.x * uz;
  const rz = cam.x * uy - cam.y * ux;
  const sea = Number(features.seaLevel) || 0;
  const bearing = 0.55; // off the frame's own up, toward its right
  for (let i = 0; i < 24; i++) {
    const a = bearing + (i % 2 ? -1 : 1) * Math.ceil(i / 2) * 0.055;
    const c = Math.cos(a), s = Math.sin(a);
    const dx = ux * c + rx * s, dy = uy * c + ry * s, dz = uz * c + rz * s;
    let clear = true;
    for (let k = 0; k < 5 && clear; k++) {
      const b = (k / 5) * TAU;
      const cb = Math.cos(b) * 0.085, sb = Math.sin(b) * 0.085;
      probeScratch.x = dx + ux * cb + rx * sb;
      probeScratch.y = dy + uy * cb + ry * sb;
      probeScratch.z = dz + uz * cb + rz * sb;
      const pl = Math.hypot(probeScratch.x, probeScratch.y, probeScratch.z) || 1;
      probeScratch.x /= pl; probeScratch.y /= pl; probeScratch.z /= pl;
      if (features.heightAt(probeScratch) > sea - 1.2) clear = false;
    }
    if (!clear) continue;
    dirScratch.x = dx; dirScratch.y = dy; dirScratch.z = dz;
    return dirScratch;
  }
  return null;
}

/* ----------------------------------------------------------- the world ---- */

export default {
  id: 'archipelago',
  label: 'Archipelago',
  blurb: 'A wet, swim-heavy week: the globe is mostly sea, and every session stands in it as an island — a swim as a reef ring round a pool.',

  /** A week is an archipelago when the water is a real share of it: a fifth of
   *  the week's active time in a pool, a lake or the sea — and the more of it
   *  the louder the claim. */
  fit(stats) {
    const swim = Number(stats?.sports?.swim) || 0;
    if (!(swim >= 0.2)) return 0;
    return clamp(0.58 + 0.9 * (swim - 0.2), 0, 0.95);
  },

  reason(stats) {
    const swim = Number(stats?.sports?.swim) || 0;
    return `a swim week: ${Math.round(swim * 100)}% of its time in the water`;
  },

  climate(c) {
    c.oceanFrac = oceanFracFor(c.stats);
    return c;
  },

  baseline(dir, ctx) {
    const st = stateFor(ctx);
    return groundAt(st, dir.x, dir.y, dir.z);
  },

  /** After every other hand, in order: the other hands' own relief, drawn down
   *  (a range here is a ridge, and the sea keeps its floor); the land's first
   *  metres flattened into a beach terrace; a slow swell and a fine grain over
   *  the land, so a walker finds the ground and the wash something to break on;
   *  and the coast itself chewed by a warped noise, so an island's edge is a
   *  ragged thing with spits and pools rather than the smooth dome the profile
   *  draws. Deep water and high ground are left exactly as they were — and that
   *  is also where the hook spends nothing, its early-outs standing before any
   *  noise is read. */
  shape(dir, h, ctx) {
    const st = stateFor(ctx);
    // the other hands' own relief, drawn down before anything else is read: a
    // route's range is a ridge here, and the sea keeps its floor. The gate skips
    // the deep basins, where nothing a route adds can reach the waterline.
    if (h > st.water - 6) h = reliefFor(st, groundAt(st, dir.x, dir.y, dir.z), h);
    // the cay under a route's ends: laid before the terrace and the grain, so the
    // spit wears the same beach, the same dune swell and the same ragged shore
    // every other piece of land here wears
    h = laid(st, h, dir.x, dir.y, dir.z);
    const above = h - st.water;
    if (above > 0 && above < BENCH) h = st.water + BENCH * Math.pow(above / BENCH, BENCH_POW);
    if (above > 0 && above < DUNE_TOP) {
      // the low ground is a sand plain, not a blank sheet: a slow dune texture
      // over it, so the wash has something to break on
      const d = st.fbm(st.nz, dir.x * DUNE_FREQ, dir.y * DUNE_FREQ, dir.z * DUNE_FREQ, 2, 0.45) * 2 - 1;
      h += d * DUNE_AMP * smoothstep(1 - above / DUNE_TOP);
    }
    if (above > 0 && above < GRAIN_TOP) {
      // and the ground's own grain over every piece of land: what a walker's
      // eye finds underfoot, and what the ink's dry brush breaks on
      const g = st.fbm(st.nz, dir.x * GRAIN_FREQ, dir.y * GRAIN_FREQ, dir.z * GRAIN_FREQ, 2) * 2 - 1;
      h += g * GRAIN_AMP * smoothstep(1 - above / GRAIN_TOP);
    }
    if (above > COAST || above < -COAST) return h;
    const w = st.fbm(st.nz, dir.x * COAST_FREQ, dir.y * COAST_FREQ, dir.z * COAST_FREQ, 2) * 2 - 1;
    return h + w * COAST_AMP * smoothstep(1 - Math.abs(above) / COAST);
  },

  palette(pal) {
    const F = family(pal);
    const to = (key, w) => { pal[key]?.lerp(F[key], w); };
    // the land: sand and ochre under a chalk crest
    to('landLow', 0.7); to('landMid', 0.68); to('landHigh', 0.6);
    to('crest', 0.66); to('dry', 0.66); to('bare', 0.62); to('stone', 0.6);
    to('veg', 0.5); to('foam', 0.5); to('farGlaze', 0.5);
    // the sea: turquoise shallows over a dark that is nearly the ink's own
    to('seaShallow', 0.86); to('seaDeep', 0.84); to('teal', 0.8); to('cobalt', 0.78);
    // the sky keeps the week's own light and takes a little of the water it
    // hangs over: a cold week stays cold, a hot one stays bleached
    to('skyWash', 0.3); to('skyDeep', 0.24); to('cloudUnder', 0.2); to('skyBand', 0.2);
    // what the water leaves behind: one flat wash of turquoise over every flat
    // the sea has drowned, and a dark the picture can be built around. The shelf
    // is pale *and* cool, because it is sand seen through water — the wash the
    // reef flat and the lagoon inside its rim are both laid in, a step apart.
    // Not *chalk* pale, though: the shelf's own wash stands on a hard edge in
    // OCEAN_FRAG (the band at −1.6, which is exactly where every reef flat here
    // is laid), and a near-white wash on a hard edge is a luminous outline round
    // every island — the filter the last two rounds were criticised for. Held a
    // step nearer the shallows' own turquoise, the ring is a reef the water is
    // shallow over and not a glow.
    pal.shelf = pal.seaShallow.clone().lerp(F.shelf, 0.5);
    pal.dark = pal.ink.clone().lerp(F.dark, 0.65);
    // the ink laws: a limited palette, flat washes, one committed dark. The
    // week's own sweep of the brush is kept but firmed — an archipelago's
    // shallows are bands and not a gradient — and its lowland left sandy. An
    // easy week's calm washes are held back too: whole islands of unbroken
    // paper read as slabs, and no island here is a blank sheet.
    //
    // The coast is this world's own weather, and it is *weather* and not a
    // contour: the surf is drawn on the damp-shore term (ink.js OCEAN_FRAG),
    // which the race week's coasts own by default, and an ocean of reefs without
    // a breaking edge anywhere is a map of a sea rather than a sea. So the coast
    // is damp here — a broken white surf line where the swell meets the flat, the
    // pooled pigment where the wash stopped, and the drowned ground's own colour
    // showing through the shallows — and the depth bands keep their hard edges,
    // which is what keeps the reef reading as a reef and not as a blur.
    pal.damp = clamp(Math.max(Number(pal.damp) || 0, 0.46), 0, 0.62);
    pal.seaCalm = clamp(Math.max(Number(pal.seaCalm) || 0, 0.42), 0, 0.75);
    pal.calm = Math.min(Number(pal.calm) || 0, 0.3);
    pal.vegAmt = clamp((Number(pal.vegAmt) || 0) * 0.35 - 0.1, -1, 1);
    return pal;
  },

  /** The sea's own satellite: one small moon off the poster's limb, its size
   *  taken from the distance the week swam. */
  companions(ctx) {
    const { features } = ctx;
    const stats = features.stats || {};
    const swimKm = Math.max(0, (Number(stats.sports?.swim) || 0) * (Number(stats.distanceKm) || 0));
    const radius = clamp(7.5 + 1.1 * swimKm, 9, 13.5);
    const R = Number(ctx.R) || 120;
    const dir = limbDirection(ctx);
    if (!dir) return null;
    // the seed has to be a number: the builders take a number and the wash
    // shader reads it as one, and a week's own string would reach it as a NaN
    // and draw the moon as a black disc.
    const week = String(features.week || '');
    let seed = 7;
    for (let i = 0; i < week.length; i++) seed = (seed * 31 + week.charCodeAt(i)) % 9973;
    // centre and surface both clear of the globe: the moon reads as a separate
    // body at the limb, never as a piece of it
    return paintedMoon(ctx, {
      radius,
      distance: R * 1.07 + radius * 1.5,
      dir: [dir.x, dir.y, dir.z],
      seed,
      drift: 0.02,
    });
  },

  // The moon hangs just off the limb, so the poster holds a touch more than the
  // globe: 0.62 of the short axis. The moon's own reach — its hang at 1.07 R
  // plus the largest radius it takes, 13.5 u — is 1.24 R, inside the 1.45 R the
  // shelf's crop keeps whole (see craft.frame), so one fill is enough for every
  // week. No relief cap of its own: the default cap is the ceiling this world
  // designs under (crowns at five units, a range's knee at four and a half) so
  // that nothing a week can raise is ever cut into a flat-topped shelf on the
  // rim, and the objects standing on that ground never float over it.
  orbit: { fill: 0.62 },
};

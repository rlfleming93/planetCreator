/* Planet Creator — the world archetypes.
 *
 * A week is drawn as one world. A world is a module whose default export may
 * take over any step of the reading, and every hook is optional:
 *
 *   { id, label, blurb,
 *     fit(stats)                 → 0..1, how well this world suits the week
 *     builtFor(stats)            → true when the week is the one this world was
 *                                  made for (tundra: a week under a roof)
 *     climate(c)                 → the week's warmth/roughness/energy/sweat
 *                                  re-read before the sea is fixed
 *     baseline(dir, ctx)         → the height of the undecorated ground
 *     shape(dir, h, ctx)         → the height after every other step
 *     palette(pal, features)     → the week's palette, repainted in place
 *     companions(ctx)            → a THREE.Object3D to stand in the scene, or null
 *     reason(stats)              → why this world claims the week, in a few words
 *     orbit: { reliefCap, fill } → how the globe is framed and capped }
 *
 * `world.archetype` names one, or `auto`, which asks every world's fit(stats)
 * how well it suits the week. A world is only chosen when it is sure of itself:
 * its fit has to clear AUTO_FIT_MIN and lead the runner-up by AUTO_LEAD_MIN.
 * Inside the margin it is a tie, and a tie goes to whichever of the two is
 * built for the week when the other is not — anything else, and an unknown id,
 * and a week no world wants, all fall to classic. Classic is always here; the
 * others are fetched when a page asks for them (loadWorlds: the one named, or
 * all of them for `auto`), before readWeek reads the week. Adding a world:
 * drop `<id>.js` beside this file, add its loader to LOADERS here, and let its
 * default export carry the same `id`, then add that id to WORLD_ARCHETYPES in
 * params.js. That list is a literal there because the module is also loaded on
 * its own — by the bench, where a page may name a world before this registry
 * has been read — so the two are held against each other here, at load, and a
 * drift throws rather than leaving a world a URL cannot ask for.
 *
 * `weekStats(seed)` is the cheap reading of a week every fit() may use: what
 * was done (shares of active time by sport family), how much of it, and what
 * weather it was done in. It costs one pass over the activities and never
 * touches the terrain, so `auto` can ask every world about a week before any of
 * them has built it.
 */
import { P, WORLD_ARCHETYPES } from '../params.js';
import { raceName } from '../share.js';
import { isRouteless } from '../effort.js';
import * as classic from './classic.js';
import { bodyFor } from '../bodies/index.js';
import { systemFor } from '../system.js';
import { pace } from '../pace.js';

// companions.ringStyle → the builder that draws the race round the globe, fetched on a race week only. A style with
// nothing to draw for a week (null) falls back to the splits ring.
const RING_STYLES = {
  splits: () => import('../rings.js').then((m) => m.raceRing),
  saturn: () => import('../rings.js').then((m) => m.saturnRing),
  rubble: () => import('../rings-rubble.js').then((m) => m.rubbleRing),
  orrery: () => import('../rings-rubble.js').then((m) => m.orreryRings),
  track: () => import('../rings-track.js').then((m) => m.trackRing),
  aurora: () => import('../rings-track.js').then((m) => m.auroraRing),
};

// every world but classic, fetched when asked for (loadWorlds); ORDER is the order `auto` asks them in, which settles
// a tie, whatever order they arrived in
const LOADERS = {
  moon: () => import('./moon.js'),
  tundra: () => import('./tundra.js'),
  mesa: () => import('./mesa.js'),
  archipelago: () => import('./archipelago.js'),
  foundry: () => import('./foundry.js'),
  caldera: () => import('./caldera.js'),
  commons: () => import('./commons.js'),
};
const ORDER = ['classic', ...Object.keys(LOADERS)];

function checked(id, module) {
  const world = module.default;
  if (!world || world.id !== id) {
    throw new Error(`Planet worlds: worlds/${id}.js must default-export a world whose id is "${id}".`);
  }
  return world;
}

/** id → the world module's default export, for the worlds loaded so far. */
const WORLDS = { classic: checked('classic', classic) };

/** Fetch the worlds a reading of world.archetype `id` can need: the one it names, every one for `auto`, none for
 *  classic (or an unknown id, which reads as classic). */
export async function loadWorlds(id) {
  const ids = id === 'auto' ? Object.keys(LOADERS) : Object.hasOwn(LOADERS, id) ? [id] : [];
  await Promise.all(ids.filter((w) => !WORLDS[w]).map(async (w) => { WORLDS[w] = checked(w, await LOADERS[w]()); }));
}

// `auto` and the ids of every world the registry can fetch: the dial in params.js
// lists exactly these. A name that is listed but not here would fail the
// moment a page resolved it, and a world that is here but not listed is one a
// URL cannot name — both are the same load-time bug, so both are thrown here.
const IDS = ORDER.concat('auto');
{
  const listed = [...WORLD_ARCHETYPES];
  const drift = [
    ...listed.filter((id) => !IDS.includes(id)).map((id) => `${id} is listed but not loaded`),
    ...IDS.filter((id) => !listed.includes(id)).map((id) => `${id} is loaded but not listed in params.js WORLD_ARCHETYPES`),
  ];
  if (drift.length) throw new Error(`Planet worlds: ${drift.join('; ')}.`);
}

// What `auto` asks of a fit before it takes a world over classic: a fit below
// the floor is no claim at all, and a lead smaller than the margin is a tie,
// which goes to the one of the two built for the week when the other is not.
const AUTO_FIT_MIN = 0.55;
const AUTO_LEAD_MIN = 0.12;

/** The world a week is drawn as: the world named, or — for `auto` — the best
 *  fit when it clears the floor and the margin, or the one of a tied pair built
 *  for the week. Everything else, an unknown id included, falls to classic. */
export function worldFor(id, stats = null) {
  const want = id === 'auto' ? ORDER : Object.hasOwn(LOADERS, id) ? [id] : [];
  const missing = want.filter((w) => !WORLDS[w]);
  if (missing.length) throw new Error(`Planet worlds: ${missing.join(', ')} not loaded; await loadWorlds(${JSON.stringify(id)}) first.`);
  if (id === 'auto') {
    if (stats) {
      let best = null, bestFit = 0, runner = null, second = 0;
      for (const world of ORDER.map((w) => WORLDS[w])) {
        const fit = Number(world.fit?.(stats)) || 0;
        if (!(fit > 0)) continue;
        if (fit > bestFit) { runner = best; second = bestFit; best = world; bestFit = fit; }
        else if (fit > second) { runner = world; second = fit; }
      }
      if (best && bestFit >= AUTO_FIT_MIN) {
        if (bestFit - second >= AUTO_LEAD_MIN) return best;
        const built = (world) => !!world?.builtFor?.(stats);
        if (built(best) && !built(runner)) return best;
        if (built(runner) && !built(best) && second >= AUTO_FIT_MIN) return runner;
      }
    }
  } else if (typeof id === 'string' && Object.hasOwn(WORLDS, id)) {
    return WORLDS[id];
  }
  return WORLDS.classic;
}

/**
 * A world and a body drawn as one: the body's hooks run after the world's
 * (its climate on the world's climate, its shape on the world's ground, its
 * palette over the world's), its baseline and orbit take precedence, and both
 * stand their companions. A hook is only present when one of the two has it, so
 * a week with no body draws exactly as its world does.
 */
export function composeWorld(world, body) {
  if (!body) return world;
  const out = { ...world, body };
  // A climate hook may change its argument in place and return nothing, or
  // return a new one: each is asked once, the body after the world.
  if (world.climate || body.climate) {
    out.climate = (c) => {
      const after = world.climate ? world.climate(c) ?? c : c;
      return body.climate ? body.climate(after) ?? after : after;
    };
  }
  if (body.baseline) out.baseline = body.baseline;
  if (world.shape && body.shape) out.shape = (dir, h, ctx) => body.shape(dir, world.shape(dir, h, ctx), ctx);
  else if (body.shape) out.shape = body.shape;
  if (world.palette && body.palette) out.palette = (pal, f) => body.palette(world.palette(pal, f) || pal, f) || pal;
  else if (body.palette) out.palette = body.palette;
  if (world.companions && body.companions) {
    out.companions = (ctx) => {
      const group = new ctx.THREE.Group();
      for (const one of [world.companions(ctx), body.companions(ctx)]) if (one) group.add(one);
      return group.children.length ? group : null;
    };
  } else if (body.companions) out.companions = body.companions;
  if (body.orbit) out.orbit = { ...world.orbit, ...body.orbit };
  return out;
}

/** The world a reading's features were drawn as, with its body: what the ink
 *  style asks for after readWeek has resolved both (features.world, features.body). */
export function resolvedWorld(features) {
  return composeWorld(worldFor(features?.world?.id), bodyFor(features?.body?.id));
}

/**
 * Why a week reads as the world it does, in a few words. A world answers for
 * itself when it defines `reason(stats)`; classic has none to give — it is what
 * is left when no world claims the week — so its reason names the week's own
 * loudest habit instead.
 */
export function worldReason(world, stats) {
  const own = world?.reason?.(stats);
  if (typeof own === 'string' && own.trim()) return own;
  return classicReason(stats);
}

/** The week's loudest habit, in the words the reading would use for it. */
function classicReason(stats) {
  const s = stats && typeof stats === 'object' ? stats : {};
  const share = (value) => (Number.isFinite(value) ? value : 0);
  const sport = (family) => share(s.sports?.[family]);
  if (s.race) return 'race week';
  if (share(s.football) >= 0.35) return 'football week';
  if (share(s.indoor) >= 0.8) return 'indoor week';
  if (sport('ride') >= 0.5) return 'ride week';
  if (Number(s.count) <= 3) return 'quiet week';
  return 'mixed week';
}

/**
 * The objects a world stands beside its globe, or null when there are none: the
 * world's own companions, and — on a week with a race, when `companions.race`
 * is on — the race ring in the course's own plane (its style's module fetched
 * then: loadRing). The builders live in ./companions.js and the ring modules;
 * this only decides whose they are and whether the week earns one.
 */
export async function companionsFor(world, ctx) {
  const group = new ctx.THREE.Group();
  group.name = 'companions';
  const own = world?.companions?.(ctx);
  if (own) group.add(own);
  const builders = loadRing(ctx.features);
  if (builders) {
    const [build, splits] = await builders;
    await pace();
    const ring = build(ctx) || splits(ctx);
    if (ring) group.add(ring);
  }
  await pace();
  const system = systemFor(ctx);
  if (system) group.add(system);
  return group.children.length ? group : null;
}

/** The week's race ring builders, asked for — its style's, and the splits ring it falls back to — or null on a week
 *  that draws none. */
export function loadRing(features) {
  if (!(P['companions.race'] > 0 && features?.race)) return null;
  return Promise.all([(RING_STYLES[P['companions.ringStyle']] || RING_STYLES.splits)(), RING_STYLES.splits()]);
}

/** The sport family a session belongs to: the shares below are shares of
 *  active time, so half an hour and four hours of the same work read the
 *  same. Titles only decide the one split the sport's own name cannot. */
function familyOf(activity) {
  const sport = String(activity.sport || '').toLowerCase();
  const title = String(activity.title || '').toLowerCase();
  if (/^(running|walking|hiking)$/.test(sport)) return 'run';
  if (sport === 'cycling') return 'ride';
  if (sport === 'swimming') return 'swim';
  // A treadmill run and a smart-trainer ride carry the equipment's sport name.
  if (sport === 'fitness_equipment') return /run|walk|treadmill/.test(title) ? 'run' : /bike|cycle|spin|trainer/.test(title) ? 'ride' : 'other';
  if (sport === 'training') return /yoga|pilates|stretch|breath|mobility/.test(title) ? 'yoga' : 'strength';
  return 'other';
}

// Football is the one family the sport's own name does not settle — a kickabout
// on a track reads as a run to a watch — so the title decides too, the same
// reading ink-kinds.js gives a cairn's top stone.
const isFootball = (activity) => /football/.test(String(activity.sport || '').toLowerCase())
  || /football/.test(String(activity.title || '').toLowerCase());

/**
 * Read the week's cheap signals. Every value comes from the seed alone: no
 * terrain, no noise, no randomness, so a world may ask about a week it has not
 * been given. Shares are 0..1 of active time; `hard` and `tempC` are null when
 * the week carries no zones or no temperatures rather than pretending to be 0,
 * and `routeless` is null on a week whose sessions carry no place (a link from
 * before places), so such a week reads as it always has. `climb` is climbing
 * done on a route: a route-less session's ascent is incline (effort.js).
 */
export function weekStats(seed) {
  const source = seed || {};
  const acts = Array.isArray(source.activities) ? source.activities.filter(Boolean) : [];
  const totals = source.totals || {};
  const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  const sports = { run: 0, ride: 0, swim: 0, strength: 0, yoga: 0, other: 0 };
  let activeS = 0, distanceM = 0, climb = 0, load = 0, sweatMl = 0, longRunM = 0;
  let tempSum = 0, tempW = 0, hardS = 0, zoneS = 0, race = null;
  let indoorS = 0, footballS = 0, routelessS = 0, placed = false;
  const raced = String(source.race || '');
  for (const a of acts) {
    const active = Math.max(0, num(a.activeS) || 0);
    const family = familyOf(a);
    activeS += active;
    sports[family] += active;
    // No GPS is the reading's own mark of work done under a roof: the same
    // signal that raises a constructed landmark instead of a route.
    if (!a.hasGps) indoorS += active;
    if (isFootball(a)) footballS += active;
    distanceM += Math.max(0, num(a.distanceM) || 0);
    if (isRouteless(a)) routelessS += active;
    else climb += Math.max(0, num(a.ascentM) || 0);
    if (a.place != null) placed = true;
    load += Math.max(0, num(a.trainingLoad) || 0);
    sweatMl += Math.max(0, num(a.sweatMl) || 0);
    if (family === 'run') longRunM = Math.max(longRunM, Math.max(0, num(a.distanceM) || 0));
    const lo = num(a.minTempC), hi = num(a.maxTempC);
    if (lo != null && hi != null) {
      const weight = active + 1; // unmeasured time still bends the mean a little
      tempSum += ((lo + hi) / 2) * weight;
      tempW += weight;
    }
    const zones = Array.isArray(a.hrZoneSeconds) ? a.hrZoneSeconds : [];
    for (const z of zones) zoneS += num(z) || 0;
    hardS += num(zones[3]) || 0;
    hardS += num(zones[4]) || 0;
    if (!race && (a.isRace || (raced && String(a.title || '') === raced))) race = a;
  }
  const shares = {};
  for (const [family, seconds] of Object.entries(sports)) shares[family] = activeS ? seconds / activeS : 0;
  return {
    week: String(source.week || ''),
    count: acts.length,
    activeS,
    hours: activeS / 3600,
    distanceKm: distanceM / 1000,
    climb,
    // the week's own totals are the generator's first source too (readWeek),
    // and the sums of its activities are what a totals-less import carries
    load: num(totals.trainingLoad) ?? load,
    sweatL: Math.max(0, num(totals.sweatMl) ?? sweatMl) / 1000,
    tempC: tempW ? tempSum / tempW : num(totals.tempC),
    hard: zoneS ? hardS / zoneS : null,
    race: !!race,
    // the race in words ('the marathon', 'a 10K'), for a body's reason
    raceName: race ? raceName(race) : null,
    longRunKm: longRunM / 1000,
    sports: shares,
    indoor: activeS ? indoorS / activeS : 0,
    football: activeS ? footballS / activeS : 0,
    routeless: placed ? (activeS ? routelessS / activeS : 0) : null,
  };
}

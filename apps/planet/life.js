/* Planet Creator — the week's life (dial life.amount, 0..1). What lives on the
 * world, read from the week: drawn from orbit and underfoot in the house ink
 * style. createLife(shared) gets the same shared bag as createBody/createSpace
 * (ink.js setupScene: THREE, scene, renderer, features, uniforms, palette,
 * colors, survey, light, R, washMaterial) and resolves to
 *   { object, update({ camera, surface, time }), dispose() }
 * or null. At life.amount 0 it returns null before any side effect, so the
 * scene is exactly as before. Only the modules a week grows are fetched
 * (loadLife): a rocky world's lineages, or a giant's drifters.
 *
 * Every sport seeds a lineage, and the week's own numbers say how much of it
 * there is (the table is window.__app.scene's `life` group, userData.life):
 *   sweat         → the sea's bloom (its salt), warmth its kind     life-sea.js
 *   the three longest GPS routes → a long thin skein each; rides
 *                   fly geese, runs swifts                         life-birds.js
 *   sessions      → a murmuration in the sky the eye lands under   life-birds.js
 *   every run over the ground → herds on its flanks, and one where
 *                   the eye lands                                  life-herds.js
 *   football, strength → towns, a faint warm web on the night side life-lights.js
 *   yoga, calm    → woods; lifts → reef        life-forest.js, life-reef.js
 *   every swim and every dozen km of the long run → a whale met from the shore
 *                   where a landing looks out on open sea           life-whales.js
 *   a giant's hours → swarms in its belts, a few majestic underfoot life-drifters.js
 * Life sits in the world's light, air and scale: a glaze of the ground's or the
 * sea's own colour from orbit, silhouettes in the air underfoot. The lineage is
 * the date's: species' traits are drawn for every fourth week and each week is
 * the blend of the two around it, so neighbouring weeks share their ancestry.
 * A star, a lava world, a marble and a black hole carry no life at all; the race
 * week's crowned world (bodies/star.js) is his own rock world and lives as one. Amount
 * is population: the dial lets a share of each lineage in. */
import { P } from './params.js';
import { TAU, clamp, hashStr, landingEye, mulberry32, num, sstep, surveyReader, tangentFrame } from './life-kit.js';
import { crowned } from './bodies/star.js';

// what each kind of world grows, fetched for the week's own: the lineages of a rocky world's ground and sea (in the
// order createLife makes them), or the drifters in a giant's air
const ROCK = () => Promise.all([
  import('./life-sea.js'), import('./life-birds.js'), import('./life-herds.js'), import('./life-lights.js'),
  import('./life-forest.js'), import('./life-reef.js'), import('./life-whales.js'),
]);
const AIR = () => import('./life-drifters.js');

// the bodies nothing lives on: a star, a lava world, a marble, a black hole
const LIFELESS = new Set(['star', 'lava', 'marble', 'blackhole']);
// what grows on the week: a rock world's life (the race week's crowned world is
// one), a giant's drifters, or none for the bodies above
const lifeOf = (features) => {
  const body = features?.body?.id || 'rock';
  return body === 'star' && crowned() ? 'rock' : body;
};
// the grazers a run's ground keeps (life-herds.js draws them by index)
const SPECIES = ['antelope', 'ibex', 'bison'];
// the lineage's clock: base.js's own epoch, a trait set every four weeks
const LINEAGE_EPOCH = Date.parse('2020-01-06T00:00:00Z');
const WEEK_MS = 7 * 86400000;
const ANCHOR_WEEKS = 4;
const GENES = ['wing', 'beat', 'vee', 'neck', 'legs', 'bulk', 'horn', 'curl', 'coat', 'bell', 'arms'];

/** The traits the week inherits: the blend of the two anchors around its date. */
function lineage(week) {
  const at = Date.parse(`${week}T00:00:00Z`);
  const index = Number.isFinite(at) ? (at - LINEAGE_EPOCH) / WEEK_MS : 0;
  const anchor = Math.floor(index / ANCHOR_WEEKS);
  const mix = index / ANCHOR_WEEKS - anchor;
  const draw = (k) => {
    const rng = mulberry32(hashStr(`life-lineage/${k}`));
    return Object.fromEntries(GENES.map((g) => [g, rng()]));
  };
  const a = draw(anchor), b = draw(anchor + 1);
  return { anchor, mix: +mix.toFixed(3), genes: Object.fromEntries(GENES.map((g) => [g, a[g] + (b[g] - a[g]) * mix])) };
}

/** A unit direction `units` along the ground from `dir`, at a bearing. */
function offsetDir(T, dir, units, bearing, R) {
  const { east, north } = tangentFrame(T, dir);
  return dir.clone().addScaledVector(east, Math.cos(bearing) * units / R).addScaledVector(north, Math.sin(bearing) * units / R).normalize();
}

/** What the week grows, and why. */
function readLife(T, features, survey, R) {
  const s = features.stats || {};
  const sports = s.sports || {};
  const landAt = surveyReader(T, survey.land) || ((d) => features.heightAt(d) - features.seaLevel);
  const coastAt = surveyReader(T, survey.coast) || (() => 20);
  const sweat = num(s.sweatL, 0);
  const warmth = clamp(num(features.warmth, 0.5), 0, 1);
  const wet = clamp(sweat / 8, 0, 1);
  const line = lineage(features.week);
  const g = line.genes;
  const rng = features.makeRng('life/read');
  // the week's subject: every site weighted by the time spent at it — where
  // the week was lived, and so the face the poster turns to
  const subject = new T.Vector3();
  for (const f of features.list || []) {
    if (f.kind !== 'monument') subject.addScaledVector(f.dir, Math.max(900, num(f.stats?.activeS, 900)));
  }
  if (subject.lengthSq() < 1e-6) subject.set(0, 0, 1);
  subject.normalize();

  // the flyways: every route's great circle, start to finish
  const cap = num(features.orbit?.reliefCap, 12);
  const flyways = [];
  for (const r of features.routes || []) {
    const n = Math.floor((r.seg?.length || 0) / 3);
    if (n < 2) continue;
    const at = (i) => new T.Vector3(r.seg[i * 3], r.seg[i * 3 + 1], r.seg[i * 3 + 2]).normalize();
    const a = at(0);
    let b = at(n - 1);
    // a loop comes home: fly toward its far point instead
    if (a.angleTo(b) < 0.04) for (let i = 1; i < n; i++) if (a.angleTo(at(i)) > a.angleTo(b)) b = at(i);
    const axis = new T.Vector3().crossVectors(a, b);
    if (axis.lengthSq() < 1e-10) continue;
    const km = num(features.byId?.[r.featureId]?.stats?.distanceM, 0) / 1000;
    flyways.push({ axis: axis.normalize(), ref: a, ride: r.kind === 'valley', km });
  }
  // a week that ran or rode under a roof still has its birds: one flyway
  // through its own country
  if (!flyways.length && num(sports.run) + num(sports.ride) > 0.15) {
    const axis = new T.Vector3().crossVectors(subject, new T.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5)).normalize();
    flyways.push({ axis, ref: subject.clone(), ride: num(sports.ride) > num(sports.run), km: num(s.distanceKm) / Math.max(1, s.count || 1) });
  }
  flyways.sort((p, q) => q.km - p.km);
  // fewer and stronger: the week's three longest
  flyways.length = Math.min(flyways.length, 3);
  for (const w of flyways) {
    const ride = w.ride;
    const W = new T.Vector3().crossVectors(w.axis, w.ref);
    const speed = (ride ? 0.012 : 0.016) * (0.85 + 0.3 * g.beat);
    // the skein crosses the week's own country at the poster's moment (t = 1)
    const phase = Math.atan2(subject.dot(W), subject.dot(w.ref)) - speed + (rng() - 0.5) * 0.4;
    Object.assign(w, {
      kind: ride ? 'geese' : 'swifts',
      // a long thin skein at its true scale: a bird is a fraction of a unit
      birds: clamp(24 + Math.round(w.km * 1.2), 24, 48),
      size: (ride ? 0.68 : 0.58) * (0.85 + 0.3 * g.wing),
      beat: (ride ? 1.4 : 2.5) * (0.8 + 0.4 * g.beat),
      gap: ride ? 0.8 : 0.7,
      spread: (ride ? 0.55 : 0.4) * (0.75 + 0.5 * g.vee),
      echelon: rng() < 0.25,
      speed,
      altitude: cap + 3 + rng() * 2,
      phase,
      why: `${w.km.toFixed(0)} km ${ride ? 'ridden' : 'run'} → a flyway of ${ride ? 'geese' : 'swifts'}`,
    });
  }

  // the murmuration: every session a few score starlings more, one flock
  // underfoot in the sky the eye lands under
  const sessions = num(s.count, (features.list || []).length);
  const murmuration = sessions >= 2 ? {
    birds: clamp(Math.round(600 + 110 * sessions), 900, 2200),
    size: 0.17,
    scale: clamp(4 + sessions * 0.15, 4, 6),
    dist: 72,
    why: `${sessions} sessions → a murmuration of starlings`,
  } : null;

  // the herds: every run over the ground grazes its range's flanks. The kind
  // is the run's own ground: a climb keeps ibex, a long run bison, any other
  // antelope. A run under a roof keeps a herd near its treadmill.
  const herds = [];
  for (const r of features.routes || []) {
    if (r.kind !== 'range') continue;
    const st = features.byId?.[r.featureId]?.stats || {};
    const km = num(st.distanceM, 0) / 1000;
    const climb = num(st.ascentM, 0);
    const species = climb / Math.max(km, 1) > 18 ? 1 : km > 15 ? 2 : 0;
    const route = [];
    for (let i = 0; i + 2 < r.seg.length; i += 3) route.push(new T.Vector3(r.seg[i], r.seg[i + 1], r.seg[i + 2]).normalize());
    herds.push({
      route, species, km, race: features.race === r,
      count: clamp(Math.round(km / 7), 1, 3),
      animals: clamp(4 + Math.round(km * 0.5), 5, 14),
      size: species === 2 ? 1.3 : species === 1 ? 1.0 : 1.1,
      why: `${km.toFixed(1)} km, ${Math.round(climb)} m climb → ${SPECIES[species]}`,
    });
  }
  if (!herds.length && num(sports.run) > 0.2) {
    for (const f of (features.list || []).filter((x) => x.kind === 'constructed').slice(0, 2)) {
      const bearing = rng() * TAU;
      const route = [-12, -6, 0, 6, 12].map((u) => offsetDir(T, f.dir, Math.abs(u), u < 0 ? bearing + Math.PI : bearing, R));
      herds.push({ route, species: 0, km: 0, count: 1, animals: 6, size: 1.1, why: 'a run under a roof → antelope by the treadmill' });
    }
  }
  herds.sort((p, q) => Number(!!q.race) - Number(!!p.race) || q.km - p.km);
  herds.length = Math.min(herds.length, 5);

  // the towns: what the week did with others or built up — a village for
  // every football session, a stone town for every two of strength — lit on
  // the night side
  const towns = [];
  const minutes = (f) => num(f.stats?.activeS, 1800) / 60;
  for (const f of features.list || []) {
    if (!/football/i.test(`${f.stats?.sport || ''} ${f.stats?.title || ''}`)) continue;
    towns.push({ kind: 'village', lights: clamp(Math.round(15 + minutes(f) / 3.3), 15, 51), radius: clamp(4.5 + minutes(f) / 20, 4.5, 10.5), why: `${Math.round(minutes(f))} min of football → a village` });
  }
  const lifts = (features.list || []).filter((f) => f.kind === 'spires');
  for (let i = 0; i < lifts.length; i += 2) {
    const m = lifts.slice(i, i + 2).reduce((n, f) => n + minutes(f), 0);
    towns.push({ kind: 'stone town', lights: clamp(Math.round(18 + m / 4), 18, 54), radius: clamp(5 + m / 27, 5, 10.5), why: `${Math.round(m)} min of strength → a stone town` });
  }
  towns.length = Math.min(towns.length, 9);

  return {
    read: { landAt, coastAt },
    subject,
    lineage: line,
    bloom: {
      // the sweat is the sea's salt: the more of it, the further the bloom
      // reaches, and a wet week blooms off a second coast too
      regions: wet > 0.45 ? 2 : 1,
      reach: 0.3 + 0.22 * wet,
      hue: warmth > 0.95 ? 'red' : warmth < 0.62 ? 'emerald' : 'cocco',
      why: `${sweat.toFixed(1)} L of sweat, warmth ${warmth.toFixed(2)}`,
    },
    flyways,
    murmuration,
    herds,
    towns,
  };
}

/** The modules the week's life is drawn with, asked for: null for a week that grows none. */
export function loadLife(features) {
  if (!(P['life.amount'] > 0)) return null;
  const body = lifeOf(features);
  if (LIFELESS.has(body)) return null;
  return body === 'rock' ? ROCK() : AIR();
}

export async function createLife(shared) {
  const kinds = loadLife(shared.features);
  if (!kinds) return null;
  const { THREE: T, features, R } = shared;
  const body = lifeOf(features);
  const week = readLife(T, features, shared.survey, R);
  const amount = { value: clamp(P['life.amount'], 0, 1) };
  // the drawing buffer's height in pixels: a mark too small for it is drawn faint, never as a flicker
  const viewH = { value: shared.renderer?.domElement?.height || 768 };
  const ctx = { ...shared, week, amount, viewH, rng: features.makeRng('life') };
  const parts = [];
  // feature LOD (base.js): the orbit's layers drawn with real geometry (the sea's bloom, the woods' glaze, the reefs)
  // are what fades out; the rest of the week's life costs next to nothing
  const heavy = new Set();
  if (body === 'rock') {
    const [sea, birds, herds, lights, forest, reef, whales] = await kinds;
    // (forest, reef and whales return null on a week that grows none)
    for (const make of [sea.createSea, birds.createBirds, herds.createHerds, lights.createLights, forest.createForest, reef.createReef, whales.createWhales]) {
      const part = make(T, ctx);
      if (!part) continue;
      parts.push(part);
      if (make === sea.createSea || make === forest.createForest || make === reef.createReef) heavy.add(part);
    }
  } else {
    // a giant's life is in its air
    const { createDrifters, driftersFor } = await kinds;
    week.drifters = driftersFor(T, body, features, shared.palette, week.lineage.genes);
    parts.push(createDrifters(T, ctx));
  }
  const object = new T.Group();
  object.name = 'life';
  for (const part of parts) object.add(part.object);
  // the species table, for the bench and the eye: only what this body grows
  const d = week.drifters;
  object.userData.life = body === 'rock' ? {
    body,
    lineage: { anchor: week.lineage.anchor, mix: week.lineage.mix },
    bloom: { kind: week.bloom.hue, regions: week.bloom.regions, why: week.bloom.why },
    flyways: week.flyways.map((w) => ({ kind: w.kind, birds: w.birds, why: w.why })),
    murmuration: week.murmuration && { birds: week.murmuration.birds, why: week.murmuration.why },
    herds: week.herds.map((h) => ({ kind: SPECIES[h.species], herds: h.count, animals: h.animals, why: h.why })),
    towns: week.towns.map((t) => ({ kind: t.kind, lights: t.lights, why: t.why })),
    ...Object.fromEntries(['life-forest', 'life-reef', 'life-whales'].map((n) => [n.slice(5), object.getObjectByName(n)?.userData.species || null])),
  } : {
    body,
    lineage: { anchor: week.lineage.anchor, mix: week.lineage.mix },
    drifters: { kind: d.kind, swarms: d.swarms, specks: d.specks, majestic: d.majestic, why: d.why },
  };
  // the eye underfoot (where it landed) and the size of a pixel, kept for
  // every part. A flight down hands over where it will stand the camera
  // (`landing`, base.js): the eye is read there, as landed, from the flight's
  // first frame, so what a landing places is standing before the camera is
  // down and fades in with the ground instead of appearing as it touches.
  const eye = landingEye(T, R);
  const frame = { orbit: 1, foot: 0, term: 0, camera: null, time: 0, eye };
  return {
    object,
    update({ camera, surface, time, landing = null, lod = 1 }) {
      amount.value = clamp(num(P['life.amount'], 0), 0, 1);
      const s = clamp(num(surface, 0), 0, 1);
      const orbit = amount.value > 0 ? 1 - sstep(0.1, 0.5, s) : 0;
      frame.foot = amount.value > 0 ? sstep(0.5, 0.9, s) : 0;
      frame.term = clamp(num(P['light.terminator'], 0), 0, 1);
      frame.camera = camera;
      frame.time = time;
      viewH.value = shared.renderer?.domElement?.height || viewH.value;
      if (camera) eye.update(landing || camera, landing ? 1 : s);
      for (const part of parts) {
        frame.orbit = heavy.has(part) ? orbit * lod : orbit;
        part.update(frame);
      }
    },
    dispose() {
      for (const part of parts) part.dispose();
      object.removeFromParent();
    },
  };
}

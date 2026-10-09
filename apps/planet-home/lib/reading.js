/* The reading: a week told back to the person who trained it, a day at a time, in plain words: what they did and
 * what it made of their planet. Nothing here is model-written. Every number comes from the week itself, read through
 * its share link without names (so a planet read at the reveal, saved to the shelf or opened from a shared link reads
 * word for word the same). Each kind of thing on the planet is explained the first time the week makes one and only
 * mentioned after that. How each day is told (one sentence or two, the planet's side first or last, a busy day as
 * one line, a run of days as one) and the words for each part are dealt by a generator seeded with the link: the same
 * week always reads the same, and two weeks rarely read alike.
 *   reading(seed, { metric }) → [{ day, days, title, lines, focus }]
 *     day    0-6 (Monday-Sunday), the entry's first day; null for the last entry (the whole week)
 *     days   every day the entry covers ([] for the whole week)
 *     lines  plain sentences
 *     focus  for each line, the index of its session in seed.activities (null for none): the reveal turns the
 *            planet's camera to that session as its line comes up */
import { decodePlanet, encodePlanet, raceName } from '../planet/share.js';
import { kindOf } from './week.js';
import { formOf, realSplits, repsOf, tiersOf } from '../planet/forms.js';

const MI = 1609.344, FT = 3.28084, LB = 2.20462;
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const NTH = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const word = (k) => WORDS[k] ?? String(k);
const Cap = (s) => s[0].toUpperCase() + s.slice(1);
const thousands = (v) => Math.round(v).toLocaleString('en-US');
const an = (text) => (/^(8|11(?!\d)|18(?!\d))/.test(text) ? `an ${text}` : `a ${text}`); // "an 11.1-mile ride"
const list = (xs) => (xs.length < 2 ? xs[0] || '' : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const seq = (xs) => (xs.length < 2 ? xs[0] || '' : `${xs.slice(0, -1).join(', ')}, then ${xs.at(-1)}`);
// "3.5 miles each", or "3.5, 4 and 4.3 miles"
function each(xs) {
  if (xs.every((x) => x === xs[0])) return `${xs[0]} each`;
  const unit = xs[0].match(/ [a-z]+$/)?.[0];
  return unit && xs.every((x) => x.endsWith(unit) && /^[\d.,]+ [a-z]+$/.test(x)) ? list(xs.map((x, i) => (i < xs.length - 1 ? x.slice(0, -unit.length) : x))) : list(xs);
}

const GAMES = /football|soccer|tennis|basketball|hockey|rugby|volleyball|golf|squash|badminton|pickleball|lacrosse|baseball|softball|cricket|ultimate/;
const SPORT = { american_football: 'football', e_biking: 'e-biking', stand_up_paddleboarding: 'paddleboarding', hiit: 'HIIT', indoor_climbing: 'climbing', rock_climbing: 'climbing', floor_climbing: 'stair climbing', generic: 'training' };
const sportWord = (sport) => SPORT[sport] || String(sport || 'training').replace(/_/g, ' ');

function rng(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Each way of saying a thing is a function that returns it, or nothing where it doesn't fit (a line about climbing,
// for a run with none). A pile of them is dealt like cards, in an order shuffled by the week, and a way that's been
// used waits until every other way that fits has been.
function dealer(rand) {
  const piles = new Map();
  return (name, ways, ...args) => {
    let pile = piles.get(name);
    if (!pile) {
      const order = ways.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      piles.set(name, pile = { order, used: new Set() });
    }
    for (const fresh of [true, false]) {
      for (const i of pile.order) {
        if (fresh && pile.used.has(i)) continue;
        const said = ways[i](...args);
        if (!said) continue;
        if (!fresh) pile.used.clear();
        pile.used.add(i);
        return said;
      }
    }
    return '';
  };
}

/* ----------------------------------------------------------------------------- units */
function units(metric) {
  const km = (m) => { const k = m / 1000; return k >= 9.95 || Math.abs(k - Math.round(k)) < 0.05 ? String(Math.round(k)) : k.toFixed(1); };
  const mi = (m) => { const t = (m / MI).toFixed(1); return t.endsWith('.0') ? t.slice(0, -2) : t; };
  return {
    dist: (m) => (metric ? `${km(m)} km` : mi(m) === '1' ? '1 mile' : `${mi(m)} miles`),
    adj: (m) => (metric ? `${km(m)}-kilometer` : `${mi(m)}-mile`), // "a 24.5-mile ride"
    climb: (m) => (metric ? `${thousands(m)} meters` : `${thousands(m * FT)} feet`),
    pace: (a) => {
      const s = Math.round(a.activeS / (a.distanceM / (metric ? 1000 : MI)));
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} a ${metric ? 'kilometer' : 'mile'}`;
    },
    speed: (a) => `${Math.round((a.distanceM / a.activeS) * (metric ? 3.6 : 3600 / MI))} ${metric ? 'km/h' : 'mph'}`,
    weight: (kg) => (metric ? `${thousands(kg)} kg` : `${thousands(kg * LB)} pounds`),
    liters: (ml) => { const t = (ml / 1000).toFixed(1); return t === '1.0' ? 'a liter' : `${t} liters`; },
  };
}

function time(s) {
  const m = Math.round(s / 60);
  if (m < 1) return 'a minute';
  if (m < 10) return `${WORDS[m]} minute${m === 1 ? '' : 's'}`;
  if (m >= 28 && m <= 32) return 'half an hour';
  if (m >= 58 && m <= 62) return 'an hour';
  if (m < 60) return `${m} minutes`;
  const h = Math.floor(m / 60), r = m % 60;
  if (r >= 28 && r <= 32) return h === 1 ? 'an hour and a half' : `${word(h)} and a half hours`;
  const hours = h === 1 ? 'an hour' : `${h} hours`;
  return r <= 2 ? hours : `${hours} and ${r} minutes`;
}
const clock = (s) => { const m = Math.round(s / 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };

/* ------------------------------------------------------------------- a session's facts */
const THING = { range: 'ridge', valley: 'valley', calm: 'grove', spires: 'spires', wheel: 'wheel', lagoon: 'lagoon', cairn: 'cairn' };
// what a session with no route is built as, when its link says what it was (forms.js)
const FORM_THING = { terraces: 'hill', shelf: 'hill', mound: 'hill', low: 'hill', stair: 'stair', oval: 'oval' };
const ACT = { run: 'run', long: 'long run', race: 'race', walk: 'walk', hike: 'hike', valley: 'ride', treadmill: 'treadmill run', indoors: 'run', calm: 'yoga', spires: 'lifting', wheel: 'trainer ride', lagoon: 'swim' };
function pileOf(s) {
  if (s.kind === 'range') return s.race ? 'race' : s.a.sport === 'walking' ? 'walk' : s.a.sport === 'hiking' ? 'hike' : s.long ? 'long' : 'run';
  if (s.kind === 'constructed') return s.noun === 'treadmill' ? 'treadmill' : s.a.sport === 'running' ? 'indoors' : 'machine';
  if (s.kind === 'cairn') return s.game ? 'game' : 'cairn';
  return s.kind;
}

// Everything a line might say about a session, worked out once: what it was, its numbers in words, and how it stood
// against the rest of the week (the longest, the hilliest, the fastest, the third day in a row).
function factsOf(week, u) {
  const t0 = Date.parse(`${week.week}T00:00:00Z`);
  const all = week.activities.map((a, i) => {
    const zones = Array.isArray(a.hrZoneSeconds) ? a.hrZoneSeconds : null;
    const zoneSum = zones ? zones.reduce((sum, z) => sum + (z || 0), 0) : 0;
    const m = n(a.distanceM) || 0, secs = n(a.activeS) || 0, up = n(a.ascentM), kg = n(a.strength?.volumeKg);
    const noun = String(a.title || '').replace(/^\w{3} /, '').replace(/ \d+$/, ''); // share.js's noun: an unnamed link's title
    return {
      a, i, m, secs, up, noun, kind: kindOf(a),
      day: Math.max(0, Math.min(6, Math.floor((Date.parse(a.startedAt) - t0) / 86400000))),
      sweat: n(a.sweatMl) || 0,
      hard: zoneSum > 60 ? ((zones[3] || 0) + (zones[4] || 0)) / zoneSum : null,
      sets: n(a.strength?.sets),
      sport: sportWord(a.sport),
      football: /football/.test(`${a.sport} ${noun}`),
      game: GAMES.test(a.sport) || noun === 'football',
      // what a person would count "days in a row" of: running on a treadmill is still running
      family: /^(running|cycling|swimming)$/.test(a.sport) ? a.sport : /^(walking|hiking)$/.test(a.sport) ? 'walking' : `${a.sport}/${kindOf(a)}`,
      race: a.isRace ? raceName(a) : null,
      dist: m ? u.dist(m) : null,
      adj: m ? u.adj(m) : null,
      dur: secs ? time(secs) : null,
      climb: up >= 1 ? u.climb(up) : null,
      pace: m >= 800 && secs && /^(running|walking|hiking)$/.test(a.sport) ? u.pace(a) : null,
      speed: m && secs && a.sport === 'cycling' ? u.speed(a) : null,
      weight: kg >= 100 ? u.weight(kg) : null,
      swim: m ? `${thousands(m)} meters` : null,
      swimAdj: m ? `${thousands(m)}-meter` : null,
    };
  });
  const top = (xs, key) => xs.reduce((best, s) => (best && best[key] >= s[key] ? best : s), null);
  const foot = all.filter((s) => s.kind === 'range' && s.m);
  const routes = all.filter((s) => (s.kind === 'range' || s.kind === 'valley') && s.m);
  const longest = routes.length > 1 ? top(routes, 'm') : null;
  const climbed = foot.filter((s) => s.up >= 60);
  const hilliest = foot.length > 1 && climbed.length ? top(climbed, 'up') : null;
  const runs = foot.filter((s) => s.a.sport === 'running' && s.m >= MI && s.secs);
  for (const s of runs) s.perM = s.secs / s.m;
  const fastest = runs.length > 2 ? runs.reduce((b, s) => (b.perM <= s.perM ? b : s)) : null;
  const rated = all.filter((s) => s.hard != null);
  const hardest = rated.length > 2 ? top(rated, 'hard') : null;
  const median = foot.map((s) => s.m).sort((x, y) => x - y)[Math.floor(foot.length / 2)] || 0;
  const topFoot = top(foot, 'm');
  for (const s of all) {
    s.Day = DAYS[s.day];
    s.longest = s === longest && s.m >= 5000;
    s.long = s.kind === 'range' && s.a.sport === 'running' && (s.m >= 16000 || (s === topFoot && foot.length > 1 && s.m >= 9600 && s.m >= 1.4 * median));
    s.hilliest = s === hilliest && s.up >= 100;
    s.fastest = s === fastest;
    s.hardest = s === hardest && s.hard >= 0.25;
    s.priorLong = Math.max(0, ...all.filter((x) => x.i < s.i && x.long).map((x) => x.m));
    let streak = 1;
    while (all.some((x) => x.family === s.family && x.day === s.day - streak)) streak++;
    s.streak = all.some((x) => x.family === s.family && x.day === s.day && x.i < s.i) ? 0 : streak;
    s.pile = pileOf(s);
    s.form = s.kind === 'constructed' ? formOf(s.a) : null;
    s.thing = s.form ? FORM_THING[s.form] : s.kind === 'constructed' ? (s.a.sport === 'running' ? 'treadmill' : 'machine') : THING[s.kind];
    s.act = ACT[s.pile] || (s.pile === 'machine' ? (s.noun === 'stair stepper' ? 'stair stepper' : 'gym session') : s.sport);
    s.act0 = s.a.sport === 'walking' ? 'walk' : s.a.sport === 'hiking' ? 'hike' : 'run';
    s.machine = s.noun === 'stair stepper' ? 'stair stepper' : 'machines';
    s.raceTime = s.secs >= 3600 ? clock(s.secs) : s.dur;
    s.of = all.filter((x) => x.thing === s.thing).length;
  }
  // a short run on a day with a much longer one is told with it, as a warm-up or a cool-down
  for (const s of all) {
    if (s.pile !== 'run' || s.m >= 2000 || s.secs >= 1200) continue;
    const main = all.find((x) => x !== s && x.day === s.day && x.kind === 'range' && x.a.sport === 'running' && !x.jog && !x.foldedInto && x.m >= 3 * s.m);
    if (main) { s.foldedInto = main; main.jog = s.i > main.i ? 'after' : 'before'; }
  }
  return all;
}

/* ----------------------------------------------------------------- what things are called */
const ONE = { ridge: 'ridge', valley: 'valley', treadmill: 'giant treadmill', machine: 'machine on a stone seat', hill: 'hill', stair: 'flight of stairs', oval: 'raised oval', grove: 'grove', spires: 'stand of spires', wheel: 'wheel', lagoon: 'lagoon', cairn: 'cairn', monument: 'monument' };
const MANY = { ridge: 'ridges', valley: 'valleys', treadmill: 'giant treadmills', machine: 'machines on stone seats', hill: 'hills', stair: 'flights of stairs', oval: 'raised ovals', grove: 'groves', spires: 'stands of spires', wheel: 'wheels', lagoon: 'lagoons', cairn: 'cairns', monument: 'monuments' };
const ANOTHER = { ridge: 'another ridge', valley: 'another valley', treadmill: 'another giant treadmill', machine: 'another machine on a stone seat', hill: 'another hill', stair: 'another flight of stairs', oval: 'another raised oval', grove: 'another grove', spires: 'more spires', wheel: 'another wheel', lagoon: 'another lagoon', cairn: 'another cairn' };
const PAST = { ridge: 'raised', valley: 'carved', treadmill: 'built', machine: 'built', hill: 'built', stair: 'built', oval: 'laid out', grove: 'planted', spires: 'stood up', wheel: 'stood up', lagoon: 'dug', cairn: 'stacked' };
const LISTED = { // one thing, in a list of the day's things
  ridge: (s) => (s.longest ? 'the longest ridge on the planet' : s.long ? 'a long ridge' : s.m < 1600 ? 'a little ridge' : 'a ridge'),
  grove: (s) => (s.secs < 900 ? 'a small grove' : 'a grove'),
  spires: (s) => (s.sets >= 3 && s.sets <= 12 ? `${word(s.sets)} spires` : 'a stand of spires'),
  cairn: (s) => (s.football ? 'a cairn with a football on top' : 'a cairn'),
};

// the first of a thing in the week: why the planet made it
const EXPLAIN = {
  ridge: [
    () => 'The planet raised a ridge along the route.',
    (s) => `${Cap(s.act0)}s raise ridges, and this one follows the route you took.`,
    () => "That route is a ridge on the planet now.",
    () => 'It came up out of the sea as a ridge in the shape of the route.',
  ],
  valley: [
    () => "Rides carve instead of raising, so there's a valley winding through the land where you went.",
    () => 'A ride cuts into the land, so it left a valley in the shape of the route.',
  ],
  treadmill: [
    (s) => s.pile === 'treadmill' && "A treadmill doesn't go anywhere, so the planet built one: a giant treadmill on a stone seat.",
    (s) => s.pile === 'indoors' && 'There was no route to raise, so the planet built a giant treadmill for it instead.',
    () => 'There was no route to follow, so the planet built a landmark instead, a giant treadmill set on cut stone.',
  ],
  machine: [
    () => "It doesn't go anywhere, so the planet built a landmark for it: a big machine on a stone seat.",
    () => 'With no route to follow, the planet built a machine for it and set it on cut stone.',
  ],
  hill: [
    (s) => s.form === 'terraces' && `There was no route, so the planet built the intervals as a terraced hill, ${terraces(s)}.`,
    (s) => s.form === 'shelf' && 'There was no route, so the planet built it as a hill with one high shelf, the way a tempo holds one.',
    (s) => s.form === 'low' && 'It was an easy run with no route, so the planet built it low and wide.',
    (s) => s.form === 'mound' && /^(steady|long)$/.test(s.a.shape) && 'There was no route, so the planet built it as one smooth mound, the way a steady run goes.',
    (s) => s.form === 'mound' && 'There was no route, so the planet built a smooth mound for it.',
  ],
  stair: [
    () => 'A stair stepper climbs, so the planet built a flight of stairs for it.',
    () => "It doesn't go anywhere but up, so the planet built it as a flight of stairs.",
  ],
  oval: [() => 'An elliptical goes round and round, so the planet laid out a raised oval for it.'],
  grove: [
    () => 'Yoga plants a grove: pines around a ring of stones.',
    () => 'That planted a grove, pines around a ring of stones.',
    () => "Somewhere on the planet there's a grove of pines for it, around a ring of stones.",
  ],
  spires: [
    (s) => s.sets >= 3 && s.sets <= 12 && `Each set stood up a spire of rock, ${word(s.sets)} of them.`,
    (s) => s.weight && 'Lifting stands up rock: a stand of stone spires, taller for the weight.',
    () => "Lifting stands up rock, so there's a stand of stone spires for it.",
    () => 'Rock spires stood up where you lifted.',
  ],
  wheel: [
    () => "There's no road on a trainer, so the planet stood a big wheel up on its edge.",
    () => 'The planet stood a wheel up on its edge for it, spokes and all.',
  ],
  lagoon: [
    () => 'Swims dig lagoons, and a longer swim digs a wider one.',
    () => 'It dug a lagoon out of the land and filled it.',
  ],
  cairn: [
    (s) => s.game && `Games don't have a route, so each one is a cairn${s.football ? ', a football sitting on the top stone' : ' of stacked stones'}.`,
    (s) => !s.game && "There's no route in that, so the planet stacked a cairn of stones.",
    (s) => `A cairn of stones went up for it, taller the longer you ${s.game ? 'played' : 'went'}.`,
  ],
};
// the rest of them: just what it is
const REFER = {
  ridge: [
    () => 'Another ridge.',
    () => 'One more ridge.',
    () => 'It left a ridge too.',
    (s) => s.nth >= 3 && s.nth <= 10 && `That's the ${NTH[s.nth]} ridge.`,
    (s) => s.up != null && s.up < 20 && s.m >= 3000 && 'The ridge it left is a low one, with hardly any climbing in it.',
    (s) => s.m < 1600 && "Just a little ridge's worth.",
    () => 'A ridge came up for that one too.',
  ],
  valley: [() => 'Another valley.', () => 'One more valley cut through the land.', () => 'It carved another valley.'],
  treadmill: [
    () => 'Another giant treadmill.',
    (s) => s.nth >= 3 && s.nth === s.of && `That makes ${word(s.of)} giant treadmills on the planet.`,
    () => 'One more giant treadmill for the planet.',
  ],
  machine: [() => 'Another machine on a stone seat.', () => 'One more machine for the planet.'],
  hill: [() => 'Another built hill.', () => 'The planet built one more hill.'],
  stair: [() => 'Another flight of stairs.', () => 'One more flight of stairs.'],
  oval: [() => 'Another raised oval.'],
  grove: [() => 'Another grove.', (s) => s.nth === 2 && 'A second grove.', () => 'More pines.', (s) => s.nth >= 3 && `Grove number ${word(s.nth)}.`],
  spires: [
    () => 'More spires.',
    () => 'Another stand of spires.',
    () => 'Up went more spires.',
    (s) => s.sets >= 3 && s.sets <= 12 && `${Cap(word(s.sets))} more spires, one a set.`,
  ],
  wheel: [() => 'Another wheel.', () => 'One more wheel.', (s) => s.nth >= 3 && `Wheel number ${word(s.nth)}.`],
  lagoon: [() => 'Another lagoon.', (s) => s.nth === 2 && 'A second lagoon.', () => 'One more lagoon.'],
  cairn: [(s) => (s.football ? 'Another cairn, another football on top.' : 'Another cairn.'), () => 'One more cairn.'],
};
// the same, as the end of a sentence ("…, and that's another ridge.")
const CLAUSE = {
  ridge: [() => "that's another ridge", () => 'another ridge came up', () => 'the planet added a ridge', (s) => s.nth >= 3 && `that's ridge number ${word(s.nth)}`],
  valley: [() => "that's another valley", () => 'it cut another valley'],
  treadmill: [() => "that's another giant treadmill", () => 'the planet built another giant treadmill'],
  machine: [() => "that's another machine on a stone seat"],
  hill: [() => "that's another built hill", () => 'the planet built another hill'],
  stair: [() => "that's another flight of stairs"],
  oval: [() => "that's another raised oval"],
  grove: [() => 'another grove grew', () => "that's another grove"],
  spires: [() => 'up went more spires', () => "that's another stand of spires"],
  wheel: [() => "that's another wheel", () => 'another wheel went up'],
  lagoon: [() => "that's another lagoon", () => 'it dug another lagoon'],
  cairn: [() => "that's another cairn", () => 'another cairn went up'],
};
const LONGEST = [() => 'That route is the longest ridge on the planet now.', () => 'It raised the longest ridge on the planet.', () => "It's the longest ridge on the planet."];
const TALLEST = [() => 'It stood up the tallest peaks on the planet.', () => 'Those are the tallest peaks on the planet.'];
const LONG = [
  (s) => !s.priorLong && 'It pushed a long ridge up out of the sea.',
  () => "That's a long ridge on the planet now.",
  () => 'The ridge it raised runs a long way.',
  (s) => s.priorLong && 'Another long ridge.',
];
// a ridge its effort shaped (forms.js), said the first time the week has a ridge of that shape
const EFFORT = {
  intervals: 'Intervals carve terraces, so that ridge steps up a shelf for each hard stretch.',
  tempo: 'A tempo holds one high shelf, and so does that ridge.',
  recovery: 'An easy day lies down: that ridge is low and wide.',
};
// a built hill's terraces, in words: a shelf a rep where the hill could hold one for each
const terraces = (s) => (repsOf(s.a) === tiersOf(s.a) ? `a shelf for each of the ${word(tiersOf(s.a))} reps` : `stepped in ${word(tiersOf(s.a))} terraces`);
// a first of something, told a few at a time: a run of days, or three of a thing in a day
const FIRST_FEW = {
  ridge: (k, span) => `Runs raise ridges, so that's ${word(k)} of them${span && k === 3 ? ', one a day' : ''}.`,
  valley: (k) => `Rides carve valleys, ${word(k)} of them.`,
  treadmill: (k, span, s) => (s.pile === 'indoors' ? `With no GPS there was no route to raise, so the planet built ${word(k)} giant treadmills instead.` : `A treadmill doesn't go anywhere, so the planet built ${word(k)} giant ones.`),
  machine: (k) => `The planet built ${word(k)} machines for them, each on a stone seat.`,
  hill: (k) => `With no route to raise, the planet built ${word(k)} hills instead.`,
  stair: (k) => `A stair stepper climbs, so the planet built ${word(k)} flights of stairs.`,
  oval: (k) => `An elliptical goes round and round, so the planet laid out ${word(k)} raised ovals.`,
  grove: (k) => `Yoga plants a grove every time, so there are ${word(k)}.`,
  spires: (k) => `Lifting stands up rock, so there are ${word(k)} stands of spires.`,
  wheel: (k) => `There's no road on a trainer, so the planet stood up ${word(k)} wheels.`,
  lagoon: (k) => `Each swim dug a lagoon, ${word(k)} in all.`,
  cairn: (k, span, s) => (s.football ? "Games don't have a route, so each one is a cairn, a football sitting on the top stone." : `There's no route in a game, so that's ${word(k)} cairns.`),
};

/* ---------------------------------------------------------------------- the sessions */
const DETAIL = [ // the one thing more a session with a distance says about itself
  (s) => s.pace && ` at ${s.pace}`,
  (s) => s.speed && ` at ${s.speed}`,
  (s) => s.dur && ` in ${s.secs >= 5400 && s.kind === 'range' ? clock(s.secs) : s.dur}`,
  (s) => s.climb && s.up >= 40 && ` with ${s.climb} of climbing`,
  () => ' ',
];
const jog = (s) => (s.jog === 'after' ? ', plus a short jog after' : s.jog === 'before' ? ', after a short warm-up jog' : '');
const mins = (s) => `${Math.round(s.secs / 60)} minutes`; // in a list of times: "45 and 75 minutes"
const GONE = { run: 'ran', walk: 'walked', hike: 'hiked', valley: 'rode' };
const NOUN = { walk: 'walk', hike: 'hike', valley: 'ride' };

// the shapes a single session's line can take; `c` carries the words for it
const SINGLE = [
  (s, c) => `${c.when} you ${c.verb()}. ${c.feat()}`,
  (s, c) => c.first && `${s.Day} was ${c.noun()}. ${c.feat()}`,
  (s, c) => c.told && `${c.when} you ${c.verb()}, and ${c.clause()}.`,
  (s, c) => c.first && `${s.Day}'s ${s.act} ${c.raised()}: ${c.detail()}.`,
  (s, c) => c.first && c.told && `${s.Day}: ${c.noun()}. ${c.feat()}`,
  (s, c) => c.first && c.told && !s.long && !s.longest && !s.hilliest && `${Cap(c.another())} on ${s.Day}, for ${c.noun()}.`,
];
const RACE = [
  (s, c) => c.first && `${s.Day} was ${s.race}. ${Cap(s.dist)} in ${s.raceTime}, ${s.longest ? 'the longest ridge on the planet' : 'a ridge along the course'}, and a monument where you stopped.`,
  (s, c) => `${c.when} you ran ${s.race}, ${s.dist} in ${s.raceTime}. The course is a ridge now with its line painted red, and there's a monument at the finish.`,
  (s, c) => c.first && s.race !== 'a race' && `${s.Day} was race day: ${s.race}, ${s.dist} in ${s.raceTime}. A race gets a monument at the finish, and its course is painted red.`,
];
// a day of two or three things, told as one line
const MULTI = [
  (items, c) => `${c.Day} was ${items.length === 2 ? 'a double' : 'a triple'}: ${seq(items.map(c.noun))}. ${Cap(c.things(items, false))}, side by side.`,
  (items, c) => `${c.Day} you ${seq(items.map(c.verb))}. ${Cap(c.things(items, true))}.`,
  (items, c) => `${Cap(word(items.length))} things on ${c.Day}: ${seq(items.map(c.noun))}. ${Cap(c.things(items, false))}.`,
  () => 'apart',
];
// three or more of one thing in a day, told as one line
const SEVERAL = {
  range: (g) => `${g.when} you ${GONE[g.s.act0 === 'run' ? 'run' : g.s.act0]} ${word(g.k)} times, ${g.u.dist(g.m)} in all.`,
  valley: (g) => `${g.when} you rode ${word(g.k)} times, ${g.u.dist(g.m)} in all.`,
  constructed: (g) => `${g.when} you ${g.s.a.sport === 'running' ? 'ran' : 'got on the machines'} ${word(g.k)} times${g.s.noun === 'treadmill' ? ' on the treadmill' : g.s.a.sport === 'running' ? ' with no GPS' : ''}, ${g.m ? g.u.dist(g.m) : time(g.secs)} in all.`,
  calm: (g) => `${g.when} you were on the mat ${word(g.k)} times, ${time(g.secs)} in all.`,
  spires: (g) => `${g.when} you were in the gym ${word(g.k)} times, ${time(g.secs)} in all.`,
  wheel: (g) => `${g.when} you rode the trainer ${word(g.k)} times, ${time(g.secs)} in all.`,
  lagoon: (g) => `${g.when} you swam ${word(g.k)} times${g.m ? `, ${thousands(g.m)} meters in all` : ''}.`,
  cairn: (g) => (g.s.game ? `${g.when} you played ${word(g.k)} games of ${g.s.sport}, ${each(g.durs)}.` : `${g.when} you did ${word(g.k)} rounds of ${g.s.sport}, ${time(g.secs)} in all.`),
};
// a run of days with one of the same thing each, told as one line
const SPAN = { // two days, three days
  run: [(x) => `you ran ${x}`, (x) => `you ran every day: ${x}`, (s) => s.dist],
  treadmill: [(x) => `you ran ${x} on the treadmill`, (x) => `you were on the treadmill every day: ${x}`, (s) => s.dist || mins(s)],
  spires: [(x) => `you were in the gym for ${x}`, (x) => `you were in the gym every day: ${x}`, mins],
  calm: [(x) => `you did ${x} of yoga`, (x) => `you were on the mat every day: ${x}`, mins],
  wheel: [(x) => `you rode the trainer for ${x}`, (x) => `you rode the trainer every day: ${x}`, mins],
  lagoon: [(x) => `you swam ${x}`, (x) => `you swam every day: ${x}`, (s) => s.swim],
};
const SPAN_MORE = [(k, t) => `${Cap(word(k))} more ${MANY[t]}.`, (k, t) => `${Cap(an(ONE[t]))} for each.`];
const THEN = ['Then', 'After that', 'Later', 'And then'];

// something about a day worth saying on top: the first that fits, each once a week
const SEA_DAY = [() => "Most of the week's sea came from that one day.", () => "More than half the sea is that one day's sweat."];
const HARD = [() => 'Your hardest session of the week.', () => 'The hardest one all week.'];
const STREAK = [(k) => `${Cap(word(k))} days in a row now.`, (k) => `That's ${word(k)} days running.`, (k) => NTH[k] && `The ${NTH[k]} day in a row.`];

/* ---------------------------------------------------------------------- the whole week */
const TOTAL = [
  (t) => t.k > 1 && `${Cap(word(t.k))} sessions, ${t.dur} all told.`,
  (t) => t.k > 1 && `${Cap(word(t.k))} sessions in all, ${t.dur} of training.`,
  (t) => t.k > 1 && `All of it came to ${t.dur}, over ${word(t.k)} sessions.`,
  (t) => t.k === 1 && `Just the one session, ${t.dur}.`,
];
const INVENTORY = [
  (t) => `${Cap(t.things)}, all from one week.`,
  (t) => `The planet ended up with ${t.things}.`,
  (t) => `By Sunday the planet had ${t.things}.`,
];
const SEA = [
  (t) => t.ml >= 1100 && t.ml < 13700 && `You sweated ${t.liters} over the week, and that's the sea.`,
  (t) => t.ml >= 1100 && t.ml < 13700 && `The sea is your sweat, ${t.liters} of it.`,
  (t) => t.ml >= 1100 && t.ml < 13700 && `All that sweat went into the sea: ${t.liters} of it.`,
  (t) => t.ml >= 1100 && t.ml < 13700 && `${Cap(t.liters)} of sweat filled the sea.`,
  (t) => t.ml > 0 && t.ml < 1100 && `The sea is the week's sweat, ${t.liters} of it, so it's a small one.`,
  (t) => t.ml >= 13700 && `You sweated ${t.liters} over the week, and the sea is as big as a sea gets here.`,
  (t) => !t.ml && "The watch didn't record any sweat, so the sea is as small as a sea gets here.",
];
const CLOSE = [ // the order the last lines come in, so no two weeks have to end the same way
  (t) => [t.total(), t.sea()],
  (t) => t.kinds >= 2 && [t.sea(), t.inventory()],
  (t) => t.kinds >= 2 && t.k > 1 && [t.sea(), `${Cap(word(t.k))} sessions, ${t.dur} of training, and the planet has ${t.things} to show for it.`],
  (t) => t.kinds >= 2 && [t.total(), t.sea(), t.inventory()],
  (t) => t.kinds >= 2 && [t.inventory(), t.sea()],
];

/** The reading of a week: see the top of this file. `seed` is a planet's week, as share.js decodePlanet gives it. */
export function reading(seed, { metric = false } = {}) {
  const code = encodePlanet(seed); // no names: the reading can't depend on them
  const u = units(metric);
  const rand = rng(code);
  const deal = dealer(rand);
  const all = factsOf(decodePlanet(code), u);
  const weekSweat = all.reduce((sum, s) => sum + s.sweat, 0);
  const told = new Set(), seen = {}, used = new Set();

  const count = (s) => { s.nth = seen[s.thing] = (seen[s.thing] || 0) + 1; };
  const detail = (s) => {
    if (s.fastest && s.pace && !s.saidFast) { s.saidFast = true; return ` at ${s.pace}, your fastest of the week`; }
    return deal('detail', DETAIL, s).trimEnd();
  };
  const verb = (s) => ({
    run: () => deal('verb.run', [() => `ran ${s.dist}`, () => `went out for ${s.dist}`]) + detail(s) + jog(s),
    long: () => `${s.priorLong ? 'went long again' : 'went long'}, ${s.dist}${detail(s)}${jog(s)}`,
    walk: () => deal('verb.walk', [() => `walked ${s.dist}`, () => `went for a walk, ${s.dist}`]) + detail(s),
    hike: () => `hiked ${s.dist}${detail(s)}`,
    valley: () => deal('verb.valley', [() => `rode ${s.dist}`, () => `took the bike out for ${s.dist}`]) + detail(s),
    treadmill: () => `ran ${s.dist || s.dur} on the treadmill`,
    indoors: () => `ran ${s.dist || s.dur} with no GPS`,
    machine: () => `spent ${s.dur || 'a while'} on the ${s.machine}`,
    calm: () => (s.dur ? deal('verb.calm', [() => `did ${s.dur} of yoga`, () => `spent ${s.dur} on the mat`]) : 'did some yoga'),
    spires: () => deal('verb.spires', [() => s.sets >= 3 && s.dur && `lifted, ${s.sets} sets in ${s.dur}`, () => `lifted for ${s.dur || 'a while'}`, () => s.dur && `spent ${s.dur} in the gym`]),
    wheel: () => deal('verb.wheel', [() => `rode the trainer for ${s.dur || 'a while'}`, () => s.dur && `spent ${s.dur} on the trainer`]),
    lagoon: () => (s.swim ? deal('verb.lagoon', [() => `swam ${s.swim}${s.dur ? ` in ${s.dur}` : ''}`, () => s.dur && `swam for ${s.dur}, ${s.swim} of it`, () => `swam ${s.swim}`]) : `swam for ${s.dur || 'a while'}`),
    game: () => `played ${s.dur ? `${s.dur} of ` : ''}${s.sport}`,
    cairn: () => `did ${s.dur ? `${s.dur} of ` : ''}${s.sport}`,
  })[s.pile]();
  const noun = (s) => ({
    run: () => `${s.dist}${detail(s)}${jog(s)}`,
    long: () => `a long run, ${s.dist}${detail(s)}${jog(s)}`,
    treadmill: () => `${s.dist || s.dur} on the treadmill`,
    indoors: () => `${s.dist || s.dur} with no GPS`,
    machine: () => `${s.dur || 'a session'} on the ${s.machine}`,
    calm: () => (s.dur ? deal('noun.calm', [() => `${s.dur} on the mat`, () => `${s.dur} of yoga`]) : 'a little yoga'),
    spires: () => (s.dur ? deal('noun.spires', [() => `${s.dur} of lifting`, () => `${s.dur} in the gym`]) : 'a session in the gym'),
    wheel: () => (s.dur ? deal('noun.wheel', [() => `${s.dur} on the trainer`, () => `${s.dur} on the indoor bike`]) : 'a session on the trainer'),
    lagoon: () => (s.swim ? an(`${s.swimAdj} swim`) : `${s.dur} in the water`),
    game: () => `${s.dur ? `${s.dur} of ` : ''}${s.sport}`,
    cairn: () => `${s.dur ? `${s.dur} of ` : ''}${s.sport}`,
  })[s.pile]?.() ?? (s.m ? an(`${s.adj} ${NOUN[s.pile]}`) : `${s.dur} of ${s.act}`);
  const detailOnly = (s) => (/^(run|long|walk|hike|valley)$/.test(s.pile) && s.m ? `${s.dist}${detail(s)}${jog(s)}`
    : /^(treadmill|indoors)$/.test(s.pile) && s.m ? `${s.dist}${s.dur ? ` in ${s.dur}` : ''}`
      : s.pile === 'lagoon' && s.swim ? `${s.swim}${s.dur ? ` in ${s.dur}` : ''}`
        : s.pile === 'spires' && s.sets >= 3 && s.dur ? `${s.sets} sets in ${s.dur}`
          : s.dur || s.dist || 'a session');
  function feat(s) {
    const t = s.thing, was = told.has(t);
    count(s);
    told.add(t);
    if (t === 'ridge' && EFFORT[s.a.shape] && !told.has(s.a.shape)) { told.add(s.a.shape); return EFFORT[s.a.shape]; }
    if (t === 'ridge' && s.longest) return deal('longest', LONGEST);
    if (t === 'valley' && s.longest) return 'It cut the longest valley on the planet.';
    if (t === 'ridge' && s.hilliest) return deal('tallest', TALLEST);
    if (t === 'ridge' && s.long) return deal('long', LONG, s);
    return was ? deal(`refer.${t}`, REFER[t], s) : deal(`explain.${t}`, EXPLAIN[t], s);
  }
  function clause(s) {
    count(s);
    if (s.thing === 'ridge' && s.longest) return 'that route is the longest ridge on the planet now';
    if (s.thing === 'ridge' && s.long) return 'it pushed a long ridge up out of the sea';
    return deal(`clause.${s.thing}`, CLAUSE[s.thing], s);
  }
  function raised(s) {
    const t = s.thing, was = told.has(t);
    count(s);
    told.add(t);
    const what = t === 'ridge' && s.longest ? 'the longest ridge on the planet' : t === 'ridge' && s.hilliest ? 'the tallest peaks on the planet'
      : t === 'ridge' && s.long ? (s.priorLong ? 'another long ridge' : 'a long ridge') : was ? ANOTHER[t] : `the week's first ${ONE[t]}`;
    return `${t === 'ridge' && s.hilliest && !s.longest ? 'stood up' : PAST[t]} ${what}`;
  }
  // the day's things, one phrase for each kind: "a small grove for the yoga, a stand of spires and a ridge"
  function things(items, refer) {
    const kinds = new Map();
    for (const { s } of items) kinds.set(s.thing, [...(kinds.get(s.thing) || []), s]);
    return list([...kinds].map(([t, ss]) => {
      const was = told.has(t), s = ss[0];
      ss.forEach(count);
      told.add(t);
      if (ss.length > 1) return `${word(ss.length)}${was && refer ? ' more' : ''} ${MANY[t]}`;
      if (t === 'ridge' && s.longest) return LISTED.ridge(s);
      if (was && refer) return ANOTHER[t];
      const one = LISTED[t]?.(s) || an(ONE[t]);
      if (was || t === 'treadmill' || t === 'machine' || t === 'stair' || t === 'oval') return one;
      return t === 'cairn' ? `a cairn for the ${s.game ? 'game' : s.sport}` : `${one} for the ${s.act}`;
    }));
  }
  const ctx = (s, when) => ({
    when, first: when === s.Day, told: told.has(s.thing),
    verb: () => verb(s), noun: () => noun(s), detail: () => detailOnly(s),
    feat: () => feat(s), clause: () => clause(s), raised: () => raised(s),
    another: () => { count(s); told.add(s.thing); return ANOTHER[s.thing]; },
  });
  function single(s, when) {
    const c = ctx(s, when);
    // a race whose watch kept its splits has them as its ring's bands (forms.js); without them the bands are the course's
    if (s.pile === 'race') { count(s); told.add('ridge'); return deal('race', RACE, s, c) + (realSplits(s.a) ? ' The ring round the planet is banded by its splits.' : ''); }
    const line = deal('single', SINGLE, s, c);
    return s.race ? `${line} It was a race, so there's a monument standing beside it.` : line;
  }
  function aside(sessions) {
    const daySweat = sessions.reduce((t, s) => t + s.sweat, 0);
    if (!used.has('sea') && weekSweat >= 1500 && daySweat >= 1000 && daySweat >= weekSweat / 2) { used.add('sea'); return deal('seaday', SEA_DAY); }
    const hard = sessions.find((s) => s.hardest && !s.foldedInto);
    if (hard && !used.has('hard')) { used.add('hard'); return sessions.filter((s) => !s.foldedInto).length > 1 ? `The ${hard.act} was the hardest session of the week.` : deal('hard', HARD); }
    const streak = sessions.find((s) => s.streak >= 3 && !s.foldedInto);
    if (streak && !used.has('streak')) { used.add('streak'); return deal('streak', STREAK, streak.streak); }
    return '';
  }

  // a day's sessions as they're told: in the order they happened, a warm-up or cool-down jog inside its run, and three
  // or more of one thing as one item, where the first of them came
  const itemsOf = (d) => {
    const today = all.filter((s) => s.day === d && !s.foldedInto);
    const key = (s) => (s.race ? `race${s.i}` : `${s.kind}/${s.noun}`);
    const same = (s) => today.filter((x) => key(x) === key(s));
    const many = (s) => same(s).length >= (s.pile === 'game' ? 2 : 3); // two games of football are one line already
    return today.filter((s) => !many(s) || same(s)[0] === s).map((s) => (many(s) ? { s, group: same(s) } : { s }));
  };
  const plain = (s) => SPAN[s.pile] && !s.race && !s.long && !s.longest && !s.hilliest && !s.fastest && !s.hardest && !s.jog && SPAN[s.pile][2](s);
  const daySweat = (d) => all.filter((s) => s.day === d).reduce((t, s) => t + s.sweat, 0);

  const out = [];
  for (let d = 0; d < 7; d++) {
    const items = itemsOf(d);
    if (!items.length) continue;
    const entry = { day: d, days: [d], title: DAYS[d], lines: [], focus: [] };
    const say = (line, s) => { entry.lines.push(line); entry.focus.push(s ? s.i : null); };

    // a run of days with one plain session each of the same kind: told as one line, some weeks
    const run = [items];
    const alike = (its) => its.length === 1 && !its[0].group && plain(its[0].s) && daySweat(its[0].s.day) < weekSweat / 2;
    if (alike(items)) while (run.length < 3 && d + run.length < 7) {
      const next = itemsOf(d + run.length);
      if (!alike(next) || next[0].s.pile !== items[0].s.pile) break;
      run.push(next);
    }
    if (run.length > 1 && rand() < 0.55) {
      const ss = run.map((its) => its[0].s), s = ss[0], k = ss.length, t = s.thing, span = SPAN[s.pile];
      const days = ss.map((x) => x.day), was = told.has(t);
      ss.forEach(count);
      told.add(t);
      Object.assign(entry, { days, title: k === 2 ? `${DAYS[days[0]]} and ${DAYS[days[1]]}` : `${DAYS[days[0]]} to ${DAYS[days[k - 1]]}` });
      say(`${entry.title} ${span[k === 3 ? 1 : 0](each(ss.map(span[2])))}. ${was ? deal('span.more', SPAN_MORE, k, t) : FIRST_FEW[t](k, true, s)}`, s);
      out.push(entry);
      d = days.at(-1);
      continue;
    }

    const lone = items.filter((it) => !it.group);
    const shape = items.length >= 2 && items.length <= 3 && lone.length === items.length && !items.some((it) => it.s.race)
      ? deal('multi', MULTI, items, { Day: DAYS[d], noun: (it) => noun(it.s), verb: (it) => verb(it.s), things })
      : 'apart';
    if (shape !== 'apart') say(shape, items[0].s);
    else items.forEach((it, k) => {
      const when = k ? THEN[(k - 1 + d) % THEN.length] : DAYS[d];
      if (!it.group) { say(single(it.s, when), it.s); return; }
      const g = it.group, s = it.s, t = s.thing, was = told.has(t);
      g.forEach(count);
      told.add(t);
      const line = SEVERAL[s.kind]({ s, u, when, k: g.length, m: g.reduce((sum, x) => sum + x.m, 0), secs: g.reduce((sum, x) => sum + x.secs, 0), durs: g.map((x) => x.dur) });
      say(`${line} ${was ? `${Cap(word(g.length))} more ${MANY[t]}.` : FIRST_FEW[t](g.length, false, s)}`, s);
    });
    const extra = aside(all.filter((s) => s.day === d));
    if (extra) entry.lines[entry.lines.length - 1] += ` ${extra}`;
    out.push(entry);
  }

  // the whole week: its time, what's on the planet, and the sea, in an order dealt by the week
  const tally = new Map();
  for (const s of all) tally.set(s.thing, (tally.get(s.thing) || 0) + 1);
  const races = all.filter((s) => s.race).length;
  if (races) tally.set('monument', races);
  const secs = all.reduce((sum, s) => sum + s.secs, 0);
  const t = {
    k: all.length, dur: time(secs), kinds: tally.size, ml: weekSweat, liters: u.liters(weekSweat),
    things: list([...tally].sort((a, b) => b[1] - a[1]).map(([x, k]) => (k === 1 ? an(ONE[x]) : `${word(k)} ${MANY[x]}`))),
  };
  Object.assign(t, { total: () => deal('total', TOTAL, t), inventory: () => deal('inventory', INVENTORY, t), sea: () => deal('sea', SEA, t) });
  const lines = (secs ? deal('close', CLOSE, t) : [t.sea()]).filter(Boolean);
  out.push({ day: null, days: [], title: 'The whole week', lines, focus: lines.map(() => null) });
  return out;
}

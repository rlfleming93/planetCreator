/* A training week as these pages pass it around. Parsed activities (apps/planet/fit-import.js's shape) are
 * grouped into weeks by the visitor's own calendar, and each week is carried as its planet link (share.js):
 *   { week, code, named, seed, stats, name, made }
 *     week   its Monday, YYYY-MM-DD
 *     code   the share code with no names: what a copied link carries, and what the reading reads
 *     named  the same with the activity names, for the visitor's own tab and shelf
 *     seed   the week decoded back out of `named`, so every number on these pages is the one the link keeps
 *     stats  its numbers, in the keys VARÐA's history.json uses (see statsOf)
 *     name   what the shelf and the poster call it ("The marathon week", "Five runs, a lift and a swim")
 *     made   the same count of what's in it, lower case, for a line under a planet */
import { decodePlanet, encodePlanet, raceName } from '../planet/share.js';

// base.js readWeek's activityKind, word for word: what the generator makes of a session
// (apps/planet-home/_check.mjs holds it against readWeek on every real week)
export function kindOf(a) {
  const title = String(a.title || '').toLowerCase();
  const sport = String(a.sport || '').toLowerCase();
  if (a.hasGps && /^(running|walking|hiking)$/.test(sport)) return 'range';
  if (a.hasGps && sport === 'cycling') return 'valley';
  if ((!a.hasGps && sport === 'running') || sport === 'fitness_equipment') return 'constructed';
  if (sport === 'training') return /yoga|pilates|stretch|breath|mobility/.test(title) ? 'calm' : 'spires';
  if (sport === 'cycling') return 'wheel';
  if (sport === 'swimming') return 'lagoon';
  return 'cairn';
}

const MI = 1609.344;
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const r1 = (v) => Math.round(v * 10) / 10;

// what a session counts as on the shelf, from the generator's own reading of it (kindOf)
export function sortOf(a) {
  const kind = kindOf(a);
  if (a.sport === 'running') return 'run';
  if (a.sport === 'cycling') return 'ride';
  if (a.sport === 'swimming') return 'swim';
  if (a.sport === 'walking' || a.sport === 'hiking') return 'walk';
  if (kind === 'calm') return 'yoga';
  if (kind === 'spires') return 'lift';
  if (/football/.test(a.sport)) return 'football';
  return 'other';
}

/** The week's numbers: sessions and counts of each sort, miles and meters climbed over every session (the
 * generator's own totals), liters of sweat, minutes, and the race (its name, or null). */
export function statsOf(seed) {
  const acts = seed.activities;
  const sum = (key) => acts.reduce((t, a) => t + (Number.isFinite(a[key]) ? a[key] : 0), 0);
  const count = (sort) => acts.filter((a) => sortOf(a) === sort).length;
  const race = acts.find((a) => a.isRace);
  return {
    sessions: acts.length, runs: count('run'), mi: r1(sum('distanceM') / MI), climbM: Math.round(sum('ascentM')),
    sweatL: r1(sum('sweatMl') / 1000), min: Math.round(sum('activeS') / 60),
    lift: count('lift'), yoga: count('yoga'), ride: count('ride'), swim: count('swim'), walk: count('walk'), football: count('football'), other: count('other'),
    race: race ? raceName(race).replace(/^(the|an?) /, '').replace(/^./, (c) => c.toUpperCase()) : null,
  };
}

// one and many: the singular carries its own article, since it isn't always "a" (a run, but another session)
const NOUNS = [['runs', 'a run', 'runs'], ['ride', 'a ride', 'rides'], ['swim', 'a swim', 'swims'], ['lift', 'a lift', 'lifts'], ['yoga', 'a yoga class', 'yoga classes'],
  ['walk', 'a walk', 'walks'], ['football', 'a game of football', 'games of football'], ['other', 'another session', 'other sessions']];

/** What's in the week, counted, the most of first: "five runs, a lift and a yoga class". */
export function madeOf(seed) {
  const s = statsOf(seed);
  const parts = NOUNS.filter(([k]) => s[k]).sort((a, b) => s[b[0]] - s[a[0]])
    .map(([k, one, many]) => (s[k] === 1 ? one : `${WORDS[s[k]] ?? s[k]} ${many}`));
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0] || 'nothing';
}

/** The week's name: its race, or what's in it. */
export function nameOf(seed) {
  const race = seed.activities.find((a) => a.isRace);
  if (race) return `The ${raceName(race).replace(/^(the|an?) /, '')} week`;
  const made = madeOf(seed);
  return made[0].toUpperCase() + made.slice(1);
}

/** A week from its share code (a copied link, a sample, the shelf): named or not, it comes out the same. */
export function weekOf(code) {
  const seed = decodePlanet(code);
  const bare = encodePlanet(seed);
  return { week: seed.week, code: bare, named: code, seed, stats: statsOf(seed), name: nameOf(seed), made: madeOf(seed) };
}

// The generator counts days in UTC; a week is read in the visitor's own days, so a Sunday evening run in
// California stays on Sunday. Each start moves by this browser's UTC offset on its own date.
const local = (a) => {
  const t = Date.parse(a.startedAt);
  return Number.isFinite(t) ? { ...a, startedAt: new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString() } : a;
};

/** Parsed activities (fit-import.js's shape) → their weeks, oldest first. */
export async function weeksOf(activities) {
  const { groupActivitiesIntoWeeks } = await import('../planet/fit-import.js');
  return groupActivitiesIntoWeeks(activities.map(local)).map((seed) => weekOf(encodePlanet(seed, { includeNames: true })));
}

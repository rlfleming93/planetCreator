/* Planet Creator — the galaxy: Ryan's weeks (shelf/ryan.json) laid out as one. Pure numbers, no three.js:
 * galaxy.js paints what this places.
 *
 *   a week      one star on a spiral arm. Each arm is a year: January starts at the core and the year winds out,
 *               so the newest week is the tip of the youngest arm. Bigger star, more hours; its color is the
 *               week's sports (by sessions); it stands above the disc by the week's climb.
 *   the hole    a supermassive black hole whose mass is grown by the big blocks: every week whose ten weeks
 *               (itself and the nine before) averaged a high load adds what it was over. Its disc runs hot and
 *               it throws jets when the last four weeks were big.
 *   remnants    a race week leaves a supernova remnant, sized by the race
 *   pulsars     a week that went farther than every week before it
 *   clusters    a week with more hours than every week before it: a globular cluster above the disc
 *   lanes       six or more steady weeks in a row (five sessions and five hours or more) lay a dust lane
 *   nebulae     four or more regular weeks in a row (five sessions or more) light pink nebulae of star birth
 *   the dwarf   the week that ended the longest stretch without a heavy week (eight weeks or more) is a dwarf
 *               galaxy falling in, torn into a stream of stars as long as the quiet was
 *
 * Distances are in galaxy radii (the disc is 1 across its half). Everything is read from the data alone, so the
 * same shelf is always the same galaxy.
 */

const DAY = 864e5;
const utc = (week) => Date.parse(`${week}T00:00:00Z`);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

// The arms: a year runs from R0 (January, at the bulge's edge) to R1 (December, at the rim), turning TURNS of a
// circle on the way as a logarithmic spiral. WIND is the turn per e-fold of radius that comes to.
export const R0 = 0.16, R1 = 0.96, TURNS = 0.62;
export const WIND = (TURNS * 2 * Math.PI) / Math.log(R1 / R0);
export const SIN_PITCH = 1 / Math.hypot(1, WIND); // across an arm, a step round the circle is this much of a step off it
export const PHASE = 0.6; // where the first arm starts, so the youngest arm's tip comes round toward the eye
// an arm's half-width (across it, in galaxy radii), inner to outer
export const armWidth = (t) => 0.035 + 0.03 * t;

// The color real stars come in, given to each sport: rides the hot blue-white, swims teal, yoga white, walks
// cream, runs gold (the sun's own), football orange, lifting red. Raw values, the way the style uses color.
export const SPORTS = [
  { key: 'ride', label: 'rides', color: [0.60, 0.75, 1.0] },
  { key: 'swim', label: 'swims', color: [0.45, 0.80, 0.82] },
  { key: 'yoga', label: 'yoga', color: [0.96, 0.94, 0.90] },
  { key: 'walk', label: 'walks', color: [0.93, 0.86, 0.68] },
  { key: 'runs', label: 'runs', color: [1.0, 0.82, 0.40] },
  { key: 'football', label: 'football', color: [0.98, 0.56, 0.26] },
  { key: 'lift', label: 'lifting', color: [0.95, 0.38, 0.32] },
  { key: 'other', label: 'other', color: [0.80, 0.78, 0.74] },
];

// The load the hole is fed by: hours over eight plus miles over forty (a big week of either is about one), a race
// on top. BLOCK is the ten-week average past which a week counts as part of a big block.
const WINDOW = 10, BLOCK = 1.4;
const raceSize = (race) => (!race ? 0 : /ultra/i.test(race) ? 1.3 : /half/i.test(race) ? 0.65 : /marathon/i.test(race) ? 1 : 0.45);
const loadOf = (s) => (s.min || 0) / 60 / 8 + (s.mi || 0) / 40 + raceSize(s.race);
const steady = (s) => (s.sessions || 0) >= 5 && (s.min || 0) >= 300;
const regular = (s) => (s.sessions || 0) >= 5;
// a heavy week: hours over eight plus miles over forty (a race on top) of two or more, eight hours and forty miles
const BIG = 2, QUIET = 8;

// a week's own small salt, from its date, for the jitter that keeps the stars off a ruled line
function salt(week, k) {
  let h = 2166136261 ^ k;
  for (const c of week) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

function colorOf(s) {
  const c = [0, 0, 0];
  let total = 0;
  for (const sp of SPORTS) {
    const w = (s[sp.key] || 0) ** 3; // the main sport sets the color; a close second tints it
    for (let i = 0; i < 3; i++) c[i] += sp.color[i] * w;
    total += w;
  }
  return total ? c.map((v) => v / total) : SPORTS.at(-1).color.slice();
}

/** Where a point at `t` (0 January … 1 December) on arm `arm` of `arms` stands: [x, z] in the disc's plane;
 *  `across` moves it off the arm's crest, in half-widths (less than 0 toward the core side). */
export function onArm(t, arm, arms, across = 0) {
  const r = R0 + (R1 - R0) * t;
  const phi = PHASE + (2 * Math.PI * arm) / arms - WIND * Math.log(r / R0) + (across * armWidth(t)) / (r * SIN_PITCH);
  return [r * Math.cos(phi), -r * Math.sin(phi)];
}

// progressive records: each week that beat the best before it, as the key says (the first week sets the bar)
function records(list, key) {
  const out = [];
  let best = list.length ? list[0].stats[key] || 0 : 0;
  for (let i = 1; i < list.length; i++) {
    const v = list[i].stats[key] || 0;
    if (v > best) out.push(i);
    best = Math.max(best, v);
  }
  return out;
}

/** The galaxy a shelf of weeks makes. `rows` are ryan.json's: { week, link, title, stats, rev, body?, why? }. */
export function galaxyOf(rows) {
  const list = rows.filter((w) => /^\d{4}-\d{2}-\d{2}$/.test(w?.week) && w.stats).sort((a, b) => (a.week < b.week ? -1 : 1));
  if (!list.length) return null;
  const thursday = (w) => new Date(utc(w.week) + 3 * DAY); // a week belongs to the year its Thursday is in
  const years = [...new Set(list.map((w) => thursday(w).getUTCFullYear()))];
  const maxMin = Math.max(1, ...list.map((w) => w.stats.min || 0));
  const first = utc(list[0].week);

  // the load, ten weeks at a time, by the calendar (a week missing from the shelf weighs nothing)
  const byIndex = new Map(list.map((w) => [Math.round((utc(w.week) - first) / (7 * DAY)), loadOf(w.stats)]));
  let mass = 0, bigWeeks = 0;
  const growth = [];
  const weeks = list.map((w, i) => {
    const s = w.stats, th = thursday(w), year = th.getUTCFullYear();
    const t = (th - Date.UTC(year, 0, 1)) / (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1));
    const arm = years.indexOf(year);
    const n = Math.round((utc(w.week) - first) / (7 * DAY));
    let sum = 0;
    for (let k = n - WINDOW + 1; k <= n; k++) sum += byIndex.get(k) || 0;
    const block = sum / WINDOW;
    if (block > BLOCK) { mass += block - BLOCK; bigWeeks++; }
    growth.push(mass);
    // off the crest and a little along the arm, by the week's own salt, so the weeks are not beads on a string; off
    // it square to the arm (a step round the circle at one radius is mostly a step along a wound arm, which put a
    // week among its neighbours' days), so along the arm the weeks keep their order: the arm is the year
    const ta = t + ((salt(w.week, 2) - 0.5) * 0.24) / 52, off = (salt(w.week, 1) - 0.5) * 1.8 * armWidth(clamp01(ta));
    const [cx, cz] = onArm(ta, arm, years.length), [bx, bz] = onArm(ta + 1e-3, arm, years.length);
    const tl = Math.hypot(bx - cx, bz - cz) || 1, side = -(bz - cz) * cx + (bx - cx) * cz < 0 ? -1 : 1; // + away from the core
    const x = cx - (side * off * (bz - cz)) / tl, z = cz + (side * off * (bx - cx)) / tl;
    return {
      week: w.week, link: w.link, title: w.title, rev: w.rev, body: w.body, why: w.why, globe: w.globe, stats: s, i, arm, t, year, block,
      pos: [x, 0.035 * clamp01((s.climbM || 0) / 1200), z],
      size: 0.0022 + 0.012 * clamp01((s.min || 0) / maxMin) ** 1.4,
      color: colorOf(s),
      // how much of the week was the warm sports (runs, football, lifting) against the cool (rides, swims, yoga)
      warmth: ((s.runs || 0) + (s.football || 0) + (s.lift || 0) + 0.5 * ((s.walk || 0) + (s.other || 0))) / Math.max(1, s.sessions || 0),
      load: loadOf(s),
      steady: steady(s),
      notes: [],
    };
  });

  // back-to-back runs of weeks that pass a test: [from, to] for each run of at least `min`
  const runs = (test, min) => {
    const out = [];
    for (let i = 0; i < weeks.length;) {
      let j = i;
      while (j < weeks.length && test(weeks[j]) && (j === i || utc(weeks[j].week) - utc(weeks[j - 1].week) === 7 * DAY)) j++;
      if (j - i >= min) out.push({ from: i, to: j - 1 });
      i = Math.max(j, i + 1);
    }
    return out;
  };
  // dust lanes: runs of six or more steady weeks back to back
  const lanes = runs((w) => w.steady, 6);
  for (const lane of lanes) {
    for (let i = lane.from; i <= lane.to; i++) weeks[i].lane = lane;
  }
  // star birth: runs of four or more regular weeks; more sessions, more nebulae
  const nurseries = runs((w) => regular(w.stats), 4);
  for (const run of nurseries) {
    for (let i = run.from; i <= run.to; i++) weeks[i].birth = 0.35 + 0.65 * clamp01(((weeks[i].stats.sessions || 0) - 5) / 6);
  }

  // the comeback: the big week that ended the longest stretch without one, if the quiet ran QUIET weeks or more
  let comeback = null;
  for (let i = 0, lastBig = -1; i < weeks.length; i++) {
    if (weeks[i].load < BIG) continue;
    const quiet = lastBig < 0 ? 0 : Math.round((utc(weeks[i].week) - utc(weeks[lastBig].week)) / (7 * DAY)) - 1;
    if (quiet >= QUIET && quiet > (comeback?.quiet || 0)) comeback = { at: i, quiet, from: lastBig + 1 };
    lastBig = i;
  }
  if (comeback) comeback.biggest = weeks.every((w) => w.load <= weeks[comeback.at].load);

  const remnants = weeks.filter((w) => w.stats.race).map((w) => ({ at: w.i, size: raceSize(w.stats.race), race: w.stats.race }));
  const pulsars = records(list, 'mi').map((i) => ({ at: i }));
  const clusters = records(list, 'min').map((i) => ({ at: i }));
  // what made a week special, in plain words, for its card (the galaxy draws each one: a supernova remnant, a
  // pulsar, a globular cluster, the dwarf galaxy, a dust lane, pink nebulae; the key says which is which). One
  // streak a week: a steady week is a busy one too, so a week in both says the steady streak
  const mostMi = pulsars.at(-1)?.at, mostMin = clusters.at(-1)?.at;
  for (const r of remnants) weeks[r.at].notes.push(['remnant', `Raced the ${r.race.toLowerCase()}`]);
  for (const p of pulsars) weeks[p.at].notes.push(['pulsar', p.at === mostMi ? 'The most miles of any week' : 'Most miles yet: farther than any week before']);
  for (const c of clusters) weeks[c.at].notes.push(['cluster', c.at === mostMin ? 'The most hours of any week' : 'Most hours yet: longer than any week before']);
  if (comeback) weeks[comeback.at].notes.push(['dwarf', `First heavy week in ${comeback.quiet + 1} weeks${comeback.biggest ? ', the heaviest of all' : ''}`]);
  for (const lane of lanes) {
    for (let i = lane.from; i <= lane.to; i++) weeks[i].notes.push(['lane', `Steady streak: week ${i - lane.from + 1} of ${lane.to - lane.from + 1}`]);
  }
  for (const run of nurseries) {
    for (let i = run.from; i <= run.to; i++) if (!weeks[i].lane) weeks[i].notes.push(['nebula', `Busy streak: week ${i - run.from + 1} of ${run.to - run.from + 1}`]);
  }

  // the hole: its shadow, in galaxy radii, grows with the mass and slows as it goes; its disc runs hot on the
  // last four weeks' load. Drawn far larger than any real hole, so it holds the middle from the whole-galaxy view.
  const recent = weeks.slice(-4);
  const activity = clamp01((recent.reduce((a, w) => a + w.load, 0) / recent.length - 0.9) / 1.6);
  const hole = { mass, bigWeeks, growth, activity, shadow: 0.024 + 0.03 * (1 - Math.exp(-mass / 10)) };

  return { weeks, years, hole, lanes, nurseries, remnants, pulsars, clusters, comeback };
}

if (import.meta.main) {
  const rows = await Bun.file(new URL('../shelf/ryan.json', import.meta.url).pathname).json();
  const g = galaxyOf(rows);
  if (g.weeks.length !== rows.length) throw new Error('a week went missing');
  if (g.weeks.some((w) => w.pos.some((v) => !Number.isFinite(v)) || Math.hypot(w.pos[0], w.pos[2]) > 1)) throw new Error('a star off the disc');
  if (JSON.stringify(galaxyOf(rows).hole) !== JSON.stringify(g.hole)) throw new Error('not the same galaxy twice');
  // along its arm each week stands after the one before it (the step between them runs the way the arm does)
  for (const [k, w] of g.weeks.entries()) {
    const p = g.weeks[k - 1];
    if (!p || p.arm !== w.arm) continue;
    const [ax, az] = onArm((p.t + w.t) / 2, w.arm, g.years.length), [bx, bz] = onArm((p.t + w.t) / 2 + 1e-3, w.arm, g.years.length);
    if ((w.pos[0] - p.pos[0]) * (bx - ax) + (w.pos[2] - p.pos[2]) * (bz - az) <= 0) throw new Error(`${w.week} stands before ${p.week} along its arm`);
  }
  const name = (i) => g.weeks[i].week;
  console.log(`galaxy ok: ${g.weeks.length} weeks on ${g.years.length} arms (${g.years.join(', ')})`);
  console.log(`hole: mass ${g.hole.mass.toFixed(2)} from ${g.hole.bigWeeks} big-block weeks; shadow ${g.hole.shadow.toFixed(4)} R; activity ${g.hole.activity.toFixed(2)}`);
  console.log(`remnants: ${g.remnants.map((r) => `${name(r.at)} ${r.race}`).join(', ')}`);
  console.log(`pulsars: ${g.pulsars.map((p) => `${name(p.at)} ${g.weeks[p.at].stats.mi} mi`).join(', ')}`);
  console.log(`clusters: ${g.clusters.map((c) => `${name(c.at)} ${g.weeks[c.at].stats.min} min`).join(', ')}`);
  console.log(`lanes: ${g.lanes.map((l) => `${name(l.from)}..${name(l.to)} (${l.to - l.from + 1})`).join(', ')}`);
  console.log(`nebulae: ${g.nurseries.map((l) => `${name(l.from)}..${name(l.to)} (${l.to - l.from + 1})`).join(', ')}`);
  console.log(`comeback: ${g.comeback ? `${name(g.comeback.at)} after ${g.comeback.quiet} quiet weeks from ${name(g.comeback.from)}${g.comeback.biggest ? ', the biggest week' : ''}` : 'none'}`);
  // the comeback: of every gap between two big weeks (by the calendar), the longest, and only if it ran QUIET weeks
  const big = g.weeks.filter((w) => w.load >= BIG);
  const gaps = big.slice(1).map((w, k) => ({ at: w.i, quiet: Math.round((utc(w.week) - utc(big[k].week)) / (7 * DAY)) - 1 }));
  const longest = gaps.reduce((a, b) => (b.quiet > a.quiet ? b : a), { at: -1, quiet: 0 });
  if ((longest.quiet >= QUIET ? `${longest.at}/${longest.quiet}` : 'none') !== (g.comeback ? `${g.comeback.at}/${g.comeback.quiet}` : 'none')) throw new Error('the comeback is not the end of the longest quiet stretch');
  // the key's own words: a record is every week that beat all the weeks before it, and only those
  for (const [key, got] of [['mi', g.pulsars], ['min', g.clusters]]) {
    const want = g.weeks.flatMap((w, i) => (i && (w.stats[key] || 0) > Math.max(...g.weeks.slice(0, i).map((p) => p.stats[key] || 0)) ? [i] : []));
    if (want.join() !== got.map((p) => p.at).join()) throw new Error(`the ${key} records are not the weeks that beat all before them`);
  }
}

// The reading's check: holds lib/week.js's kindOf against the generator's own (base.js readWeek) on every real week
// in VARÐA's data/history.json (the published file, as shelf/_ryan.mjs reads it: _history.mjs) and every sample;
// checks the same week always reads the same, that no sentence
// comes back within a week, and that no British spelling, rest-day call-out, heart-rate zone or leftover code slips
// through; counts how many sentence shapes the weeks share; prints the readings asked for (default: three real weeks).
//   bun apps/planet-home/_check.mjs [week ...] [--metric] [--all]
globalThis.window = globalThis;
const { readWeek } = await import('../planet/base.js');
const { loadWorlds } = await import('../planet/worlds/index.js');
const { P } = await import('../planet/params.js');
await loadWorlds(P['world.archetype']); // as the app does before it reads a week
const { decodePlanet } = await import('../planet/share.js');
const { reading } = await import('./lib/reading.js');
const { kindOf } = await import('./lib/week.js');
const { SAMPLES } = await import('./lib/samples.js');
const { history } = await import('./_history.mjs');

const { weeks: linked } = await history();
const weeks = [
  ...linked.map((w) => [w.start, w.planetLink.replace(/^#p=/, '')]),
  ...SAMPLES.map((s) => [s.key, s.code]),
];
const args = process.argv.slice(2);
const metric = args.includes('--metric');
const failures = [], shapes = new Map();
const DAYWORDS = /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|first|second|third|fourth|fifth|sixth|seventh|eighth)\b/g;
const shapeOf = (sentence) => sentence.replace(/[\d.,:]+\d/g, '#').replace(/\d/g, '#').replace(DAYWORDS, 'X');
for (const [name, code] of weeks) {
  const seed = decodePlanet(code);
  const theirs = readWeek(seed).list.filter((f) => f.kind !== 'monument').map((f) => f.kind).join(' ');
  const ours = seed.activities.map(kindOf).join(' ');
  if (theirs !== ours) failures.push(`${name}: kinds ${ours} != readWeek's ${theirs}`);
  const once = reading(seed, { metric }), text = once.flatMap((e) => e.lines).join('\n');
  if (JSON.stringify(once) !== JSON.stringify(reading(decodePlanet(code), { metric }))) failures.push(`${name}: reads differently twice`);
  const bad = text.match(/.{0,40}(?:[—–]|\bundefined\b|\bnull\b|\bfalse\b|NaN|\.\.|  |,,|\. [a-z]|litre|metre|colour|tonne|still counts|only sweated|heart.rate|%|\btook \w+ off|\w+day off|quiet|rested|Nothing on).{0,40}/);
  if (bad) failures.push(`${name}: ${bad[0]}`);
  const sentences = once.flatMap((e) => e.lines).flatMap((l) => l.split(/(?<=[.:])\s+(?=[A-Z])/));
  const inWeek = new Map();
  for (const x of sentences) {
    const k = shapeOf(x);
    if (inWeek.has(k) && k.length > 24) failures.push(`${name}: said twice: "${x}"`);
    inWeek.set(k, 1);
    shapes.set(k, (shapes.get(k) || new Set()).add(name));
  }
  if (once.some((e) => e.lines.length !== e.focus.length)) failures.push(`${name}: a line without its focus`);
}
const show = args.includes('--all') ? weeks.map(([w]) => w) : args.filter((a) => !a.startsWith('--'));
for (const name of show.length ? show : ['2025-04-28', '2025-06-09', '2025-11-03']) {
  const code = weeks.find(([w]) => w === name)?.[1];
  if (!code) { failures.push(`no week ${name}`); continue; }
  console.log(`\n=== ${name}`);
  for (const e of reading(decodePlanet(code), { metric })) console.log(`${e.title}\n${e.lines.map((l) => `  ${l}`).join('\n')}`);
}
const long = [...shapes].filter(([k]) => k.length > 40), shared = long.filter(([, ws]) => ws.size > 1);
const most = shared.sort((a, b) => b[1].size - a[1].size)[0];
console.log(`\nsentence shapes over 40 characters: ${long.length}, ${shared.length} of them in more than one week${most ? `; the most shared, in ${most[1].size} weeks: "${most[0]}"` : ''}`);
console.log(`reading-check ${failures.length ? 'FAIL' : 'PASS'}: ${weeks.length} weeks, kinds match readWeek, same week reads the same, nothing said twice in a week`);
for (const f of failures) console.error(`- ${f}`);
if (failures.length) process.exitCode = 1;

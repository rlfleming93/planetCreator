globalThis.window = globalThis;
// the pin guards the rocky planet's terrain; by default the race week is drawn as a star body
globalThis.PLANET_PARAMS = { 'world.body': 'rock' };
await import('../../var/private/planet/seed-week.js'); // the race week names towns, so it lives out of git

const [{ readWeek: readCurrent }, { readWeek: readRound5 }] = await Promise.all([
  import('./base.js'),
  import('./rounds/r5/base.js'),
]);

const seed = window.SEED;
const current = readCurrent(seed);
const round5 = readRound5(seed);
const count = 5000;
const golden = Math.PI * (3 - Math.sqrt(5));
let compared = 0;
let excluded = 0;
let maxHeightDelta = 0;

function inNewKindFootprint(dir) {
  for (const route of current.valleys || []) {
    const dx = dir.x - route.dir.x;
    const dy = dir.y - route.dir.y;
    const dz = dir.z - route.dir.z;
    if (dx * dx + dy * dy + dz * dz <= route.capSq) return true;
  }
  for (const lagoon of current.lagoons || []) {
    const dx = dir.x - lagoon.dir.x;
    const dy = dir.y - lagoon.dir.y;
    const dz = dir.z - lagoon.dir.z;
    if (dx * dx + dy * dy + dz * dz <= lagoon.capSq) return true;
  }
  return false;
}

for (let i = 0; i < count; i++) {
  const y = 1 - (i / (count - 1)) * 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const a = golden * i;
  const dir = { x: Math.cos(a) * r, y, z: Math.sin(a) * r };
  if (inNewKindFootprint(dir)) {
    excluded++;
    continue;
  }
  compared++;
  maxHeightDelta = Math.max(maxHeightDelta, Math.abs(current.heightAt(dir) - round5.heightAt(dir)));
}

const metricNames = ['seaLevel', 'warmth', 'roughness', 'energy'];
const metricDeltas = Object.fromEntries(metricNames.map((name) => [name, Math.abs(current[name] - round5[name])]));
const currentFeatures = new Map(current.list.map((feature) => [feature.id, feature]));
const round5Features = new Map(round5.list.map((feature) => [feature.id, feature]));
const featureProblems = [];
for (const [id, expected] of round5Features) {
  const actual = currentFeatures.get(id);
  if (!actual) {
    featureProblems.push(`${id}: missing`);
    continue;
  }
  if (actual.label !== expected.label) featureProblems.push(`${id}: label ${JSON.stringify(actual.label)} != ${JSON.stringify(expected.label)}`);
  const dirDelta = Math.hypot(actual.dir.x - expected.dir.x, actual.dir.y - expected.dir.y, actual.dir.z - expected.dir.z);
  if (dirDelta > 1e-12) featureProblems.push(`${id}: |Δdir|=${dirDelta}`);
}
for (const id of currentFeatures.keys()) if (!round5Features.has(id)) featureProblems.push(`${id}: unexpected`);

const failures = [];
if (!(maxHeightDelta < 0.02)) failures.push(`max |Δh| ${maxHeightDelta} is not < 0.02`);
for (const [name, delta] of Object.entries(metricDeltas)) if (delta > 1e-12) failures.push(`${name} |Δ| ${delta} is not <= 1e-12`);
failures.push(...featureProblems);

console.log(`terrain-pin ${failures.length ? 'FAIL' : 'PASS'}`);
console.log(`directions ${compared}/${count} compared, ${excluded} excluded as new-kind footprints`);
console.log(`max |Δh| ${maxHeightDelta.toFixed(9)} u`);
console.log(metricNames.map((name) => `${name} |Δ| ${metricDeltas[name].toExponential(3)}`).join(', '));
console.log(`features ${featureProblems.length ? featureProblems.join('; ') : 'dirs/labels match'}`);
if (failures.length) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
}

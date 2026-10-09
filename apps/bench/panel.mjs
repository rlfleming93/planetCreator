// The bench panel is built from the same public, nameless share links that VARÐA already stores. The renderer still
// gets the real week, but the bench never needs to read a FIT file or copy an activity title into an experiment.
// Synthetic seeds stay as seed names so they exercise the renderer's edges without pretending to be share links.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';

const benchDir = dirname(fileURLToPath(import.meta.url));
const historyPath = process.env.PLANET_HISTORY || resolve(benchDir, '../../../personalBranding/apps/varda/data/history.json');

const CORE = [
  ['2025-04-28', 'Race / anchor'],
  ['2025-06-30', 'Biggest / hot'],
  ['2025-06-09', 'Swims'],
  ['2025-07-14', 'Cross-training'],
  ['2025-10-13', 'Rest + lifts'],
  ['2026-01-12', 'Winter indoor'],
  ['2026-02-09', 'Ultra-light'],
  ['2026-09-14', 'Football season'],
  ['2026-09-28', 'Current week'],
];

const EXTENDED = [
  ['2025-03-17', 'Early baseline'],
  ['2025-12-29', 'Year turn'],
  ['2026-03-23', 'Spring transition'],
  ['2026-07-06', 'Summer volume'],
];

const SYNTHETIC = [
  ['synthetic-cold-hard', 'Cold + hard edge', 'Synthetic cold, high-intensity week'],
  ['synthetic-hot-easy', 'Hot + easy edge', 'Synthetic hot, low-intensity week'],
  ['synthetic-huge-volume', 'Huge-volume edge', 'Synthetic maximum-volume week'],
  ['synthetic-tiny-week', 'Tiny-week edge', 'Synthetic minimum-volume week'],
];

const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

function codeOf(link) {
  const match = /(?:^|[?#&])p=([^&#]+)/.exec(String(link || ''));
  if (!match) throw new Error(`Panel week has no #p= share code: ${String(link || '(empty)')}`);
  return decodeURIComponent(match[1]);
}

function safeTotals(raw = {}) {
  return {
    sessions: number(raw.sessions), runs: number(raw.runs), mi: number(raw.mi), climbM: number(raw.climbM),
    sweatL: number(raw.sweatL), min: number(raw.min), lift: number(raw.lift), yoga: number(raw.yoga),
    football: number(raw.football), ride: number(raw.ride), other: number(raw.other), race: Boolean(raw.race),
  };
}

function summaryOf(t) {
  const parts = [`${t.sessions} session${t.sessions === 1 ? '' : 's'}`];
  if (t.runs) parts.push(`${t.runs} run${t.runs === 1 ? '' : 's'}`, `${t.mi.toFixed(1)} mi`);
  if (t.climbM) parts.push(`${Math.round(t.climbM)} m climb`);
  if (t.min) parts.push(`${Math.round(t.min)} min`);
  if (t.sweatL) parts.push(`${t.sweatL.toFixed(1)} L sweat`);
  if (t.lift) parts.push(`${t.lift} lift${t.lift === 1 ? '' : 's'}`);
  if (t.yoga) parts.push(`${t.yoga} yoga`);
  if (t.football) parts.push(`${t.football} football`);
  if (t.ride) parts.push(`${t.ride} ride${t.ride === 1 ? '' : 's'}`);
  if (t.race) parts.push('race week');
  return parts.join(' · ');
}

function realItem(row, label, panel) {
  const totals = safeTotals(row.totals);
  return {
    id: row.start,
    week: row.start,
    label,
    panel,
    source: 'history',
    code: codeOf(row.planetLink),
    summary: summaryOf(totals),
    hasMonument: totals.race || row.activities?.some((activity) => Boolean(activity.race)),
    totals,
  };
}

export async function buildPanel() {
  const historyFile = Bun.file(historyPath);
  if (!await historyFile.exists()) {
    throw new Error(`Reference history is missing at ${historyPath}. The bench reads VARÐA's local history.json.`);
  }
  const history = await historyFile.json();
  const rows = new Map((history.weeks || []).map((week) => [week.start, week]));
  const take = (entries, panel) => entries.map(([week, label]) => {
    const row = rows.get(week);
    if (!row) throw new Error(`Reference history has no week ${week}`);
    return realItem(row, label, panel);
  });
  const core = take(CORE, 'core');
  const extended = [
    ...take(EXTENDED, 'extended'),
    ...SYNTHETIC.map(([seed, label, summary]) => ({
      id: seed, week: seed, label, panel: 'extended', source: 'synthetic', seed, summary,
      hasMonument: false, totals: {},
    })),
  ];
  return { generatedAt: history.generatedAt || null, source: historyPath, core, extended, all: [...core, ...extended] };
}

if (import.meta.main) {
  const panel = await buildPanel();
  const outIndex = process.argv.indexOf('--out');
  const json = `${JSON.stringify(panel, null, 2)}\n`;
  if (outIndex >= 0) {
    const out = resolve(process.argv[outIndex + 1] || '');
    if (!process.argv[outIndex + 1]) throw new Error('--out needs a path');
    await mkdir(dirname(out), { recursive: true });
    await Bun.write(out, json);
    console.log(out);
  } else {
    process.stdout.write(json);
  }
}

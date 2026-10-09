// Ryan's weeks, as the hub's data/history.json holds them (every week with its Planet Creator link), for the dev
// scripts that paint or check real weeks: shelf/_ryan.mjs (the demo shelf's stills) and _check.mjs (the reading's
// check). Two sources, both the hub's own file: the published copy at the site, and VARÐA's checkout beside this repo.
// The newer snapshot wins (they carry generatedAt), so a deploy that hasn't gone out yet can't make the shelf older
// than the data it was built from; PLANET_HISTORY (a URL or a path) replaces both. It may also name a shelf saved
// from the site's shelf page (planet-shelf-<date>.json), which is how a fork brings its own weeks in.
//   PLANET_HISTORY=<your VARÐA checkout>/apps/varda/data/history.json bun apps/planet-home/_check.mjs
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { decodePlanet, encodePlanet } from './planet/share.js';

const PUBLISHED = 'https://fleming.run/data/history.json';
const SIBLING = join(import.meta.dir, '../../../personalBranding/apps/varda/data/history.json');
const at = (p) => p.replace('~', homedir());

async function read(source) {
  if (/^https?:/.test(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }
  if (!existsSync(at(source))) throw new Error('no such file');
  return JSON.parse(readFileSync(at(source), 'utf8'));
}

function accept(history, source) {
  // a saved shelf's planets carry their sessions' names, which never leave that computer: each goes on as a copied
  // link does, re-encoded without them
  const saved = (history.planets || []).map((p) => ({ start: p.week, planetLink: `#p=${encodePlanet(decodePlanet(String(p.link).replace(/^.*[#?&]p=/, '')))}` }));
  const weeks = (history.weeks || saved).filter((w) => w.planetLink);
  if (!weeks.length) throw new Error('no week with a planet link in it');
  const when = history.generatedAt ?? history.exportedAt ?? null;
  return { weeks, source, generatedAt: when, at: Date.parse(when || 0) };
}

export async function history() {
  if (process.env.PLANET_HISTORY) return accept(await read(process.env.PLANET_HISTORY), process.env.PLANET_HISTORY);
  const found = [], why = [];
  for (const source of [PUBLISHED, SIBLING]) {
    try { found.push(accept(await read(source), source)); } catch (e) { why.push(`${source} (${e.message})`); }
  }
  if (!found.length) throw new Error(`no weeks to work from: ${why.join('; ')}. Point PLANET_HISTORY at VARÐA's data/history.json`);
  return found.sort((a, b) => b.at - a.at)[0]; // the newest of the two; a tie keeps the published one
}

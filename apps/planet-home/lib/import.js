/* Read what someone drops, entirely inside this tab: Garmin .fit/.fit.gz files, a Garmin "Export your data"
 * zip, or a Strava bulk export zip. Garmin activity names come from its summary file; Strava names come from
 * activities.csv. Every activity comes out as apps/planet/fit-import.js reads it. Zips and gzips are opened
 * with the browser's own DecompressionStream, and only the bytes each file needs are sliced off the archive,
 * so a 2 GB export is never held in memory: nothing is uploaded and no library is added. */
import { parseFitFile } from '../planet/fit-import.js';

const RACE = /marathon|half|\b\d+k\b|race|ultra|relay/i; // fit-import.js's own test for a race

/* ------------------------------------------------------------------ zip ---- */
const u16 = (b, i) => b[i] | (b[i + 1] << 8);
const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const u64 = (b, i) => u32(b, i) + u32(b, i + 4) * 2 ** 32;
const bytes = async (blob, a, b) => new Uint8Array(await blob.slice(a, b).arrayBuffer());

// The central directory, read from the end of the file. ZIP64 (over 4 GB or 65,535 files) included.
async function zipEntries(blob) {
  const tail = await bytes(blob, Math.max(0, blob.size - 65557), blob.size);
  let e = tail.length - 22;
  while (e >= 0 && u32(tail, e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('is not a zip file');
  let count = u16(tail, e + 10), size = u32(tail, e + 12), offset = u32(tail, e + 16);
  if (offset === 0xffffffff || count === 0xffff) {
    if (e < 20 || u32(tail, e - 20) !== 0x07064b50) throw new Error('is a damaged zip file');
    const at = u64(tail, e - 12);
    const rec = await bytes(blob, at, at + 56);
    count = u64(rec, 32); size = u64(rec, 40); offset = u64(rec, 48);
  }
  const cd = await bytes(blob, offset, offset + size);
  const names = new TextDecoder();
  const out = [];
  for (let i = 0, p = 0; i < count && u32(cd, p) === 0x02014b50; i++) {
    const nameLen = u16(cd, p + 28), extraLen = u16(cd, p + 30), commentLen = u16(cd, p + 32);
    const entry = { name: names.decode(cd.subarray(p + 46, p + 46 + nameLen)), method: u16(cd, p + 10), size: u32(cd, p + 20), usize: u32(cd, p + 24), local: u32(cd, p + 42) };
    for (let x = p + 46 + nameLen, end = x + extraLen; x + 4 <= end; x += 4 + u16(cd, x + 2)) {
      if (u16(cd, x) !== 1) continue; // the ZIP64 extra: the 0xffffffff fields, in this order
      let q = x + 4;
      if (entry.usize === 0xffffffff) { entry.usize = u64(cd, q); q += 8; }
      if (entry.size === 0xffffffff) { entry.size = u64(cd, q); q += 8; }
      if (entry.local === 0xffffffff) entry.local = u64(cd, q);
    }
    if (!entry.name.endsWith('/')) out.push(entry);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function entryBlob(blob, entry) {
  const head = await bytes(blob, entry.local, entry.local + 30);
  const start = entry.local + 30 + u16(head, 26) + u16(head, 28);
  const raw = blob.slice(start, start + entry.size);
  if (entry.method === 0) return raw;
  if (entry.method === 8) return new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
  throw new Error(`${entry.name} uses a zip compression this page can't open`);
}

const gunzip = (blob) => new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).blob();

// Strava's CSV permits commas and line breaks inside quoted activity names.
function csvRows(text) {
  const rows = [], row = [];
  let field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      row.push(field); field = '';
      if (char === '\r' && text[i + 1] === '\n') i++;
      if (row.some((value) => value)) rows.push(row.splice(0));
      else row.length = 0;
    } else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const archivePath = (name) => String(name || '').replace(/\\/g, '/').replace(/^\.?\//, '').toLowerCase();

function stravaTitles(text) {
  const rows = csvRows(text);
  const header = rows.shift() || [];
  header[0] = header[0]?.replace(/^\ufeff/, '');
  const filename = header.indexOf('Filename'), title = header.indexOf('Activity Name');
  if (filename < 0 || title < 0) throw new Error('is missing its Filename or Activity Name column');
  return new Map(rows.filter((row) => row[filename]).map((row) => [archivePath(row[filename]), row[title]]));
}

/* ------------------------------------------------------------- the lot ---- */
/**
 * files: File[] (.fit/.fit.gz files, Garmin or Strava export zips). onProgress({ note, read, total }).
 * Returns { activities, log, skipped }: activities as fit-import.js reads them, log as plain lines about what
 * was found, skipped as "name: why" for anything that couldn't be read.
 */
export async function readFiles(files, onProgress = () => {}) {
  const activities = [], log = [], skipped = [], names = [];
  let read = 0, total = 0;
  const tick = (note) => onProgress({ note, read, total });

  async function fit(blob, name, title) {
    const short = name.split('/').pop();
    const bare = short.replace(/\.gz$/i, '');
    try {
      const source = /\.fit\.gz$/i.test(short) ? await gunzip(blob) : blob;
      const activity = await parseFitFile(await source.arrayBuffer(), { name: bare });
      if (title) { activity.title = title; activity.isRace ||= RACE.test(title); }
      activities.push(activity);
    } catch (error) {
      const why = error.message.replace(`${bare} `, '').replace(/^could not be read as a FIT activity: (.*)$/, "isn't a readable .fit file ($1)");
      skipped.push(`${short}: ${why || "couldn't be opened"}`);
    }
    read++;
    tick(`Read ${short}`);
  }

  async function zip(blob, label, depth = 0) {
    const entries = await zipEntries(blob);
    const fits = entries.filter((e) => /\.fit(?:\.gz)?$/i.test(e.name));
    const inner = entries.filter((e) => /\.zip$/i.test(e.name));
    total += fits.length;
    // Garmin names its files by number, so the activities' names (and so the races) come from the summary.
    const summary = entries.find((e) => /summarizedActivities[^/]*\.json$/i.test(e.name));
    if (summary) {
      try {
        const data = JSON.parse(await (await entryBlob(blob, summary)).text());
        for (const a of [data].flat().flatMap((d) => d?.summarizedActivitiesExport || [d])) if (a?.name && a.startTimeGmt) names.push([a.startTimeGmt, a.name]);
        log.push(`${summary.name.split('/').pop()}: the names of ${names.length} activities`);
      } catch (error) { skipped.push(`${summary.name.split('/').pop()}: ${error.message}`); }
    }
    if (depth === 0 && entries.some((e) => /DI_CONNECT|DI-Connect/.test(e.name))) log.push(`${label}: a Garmin "Export your data" archive`);
    // Apple's Health export is XML and GPX: say what it is, since "nothing in there" would read as a fault here
    if (depth === 0 && entries.some((e) => /^apple_health_export\//i.test(archivePath(e.name)))) skipped.push(`${label}: an Apple Health export, which has no .fit files in it`);
    const stravaCsv = depth === 0 && entries.find((e) => /^activities\.csv$/i.test(archivePath(e.name)));
    let titles;
    if (stravaCsv && entries.some((e) => /^activities\//i.test(archivePath(e.name)))) {
      log.push(`${label}: a Strava bulk export`);
      try { titles = stravaTitles(await (await entryBlob(blob, stravaCsv)).text()); }
      catch (error) { skipped.push(`${stravaCsv.name}: ${error.message}`); }
      const unsupported = entries.filter((e) => /^activities\/.*\.(?:gpx|tcx)(?:\.gz)?$/i.test(archivePath(e.name)));
      if (unsupported.length) skipped.push(`${label}: ${unsupported.length} GPX/TCX activity file${unsupported.length === 1 ? '' : 's'} not supported`);
    }
    for (const entry of inner) {
      log.push(`${entry.name.split('/').pop()}: a zip inside the zip, opened`);
      await zip(await entryBlob(blob, entry), entry.name.split('/').pop(), depth + 1);
    }
    if (fits.length) log.push(`${label}: ${fits.length} activity file${fits.length === 1 ? '' : 's'}`);
    for (const entry of fits) await fit(await entryBlob(blob, entry), entry.name, titles?.get(archivePath(entry.name)));
  }

  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      try { await zip(file, file.name); } catch (error) { skipped.push(`${file.name}: ${error.message}`); }
    } else if (/\.fit(?:\.gz)?$/i.test(file.name)) {
      total++;
      await fit(file, file.name);
    } else if (/\.(?:gpx|tcx)(?:\.gz)?$/i.test(file.name)) skipped.push(`${file.name}: a ${file.name.match(/\.(gpx|tcx)/i)[1].toUpperCase()} file, and only the original .fit works here`);
    else skipped.push(`${file.name}: not a .fit file or a Garmin or Strava export`);
  }
  if (!activities.length) throw new Error(skipped.length ? `Nothing in there could be read. ${skipped.slice(0, 3).join(' · ')}.` : 'There were no .fit files in there.');
  for (const a of activities) {
    const t = Date.parse(a.startedAt), hit = names.find(([at]) => Math.abs(at - t) < 120000);
    if (hit) { a.title = hit[1]; a.isRace ||= RACE.test(hit[1]); }
  }
  return { activities, log, skipped };
}

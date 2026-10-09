// The phone kit's clips (apps/planet-home/kit/, the unlisted /kit/ page): Ryan's week so far and his last finished
// week as share clips, painted by the built site's own story/ page (its headless entry, ?auto=1) in headless Chrome
// from a 127.0.0.1 server of the bundle, re-encoded by ffmpeg to under 10 MB each, with each clip's last frame as its
// poster and kit/kit.json saying what's there. The weeks are the bundle's shelf/ryan.json, by this Mac's calendar:
//   day   the week still running, so far (kind=day): story and square
//   week  the last week that ended (kind=week): story, square and wide
// Only the latest of each is kept, under stable names (media/today-story.mp4, media/week-wide.jpg…). A kind's clips
// are replaced together once all of them are made, so a failed render leaves the last good set. kit.json and media/
// are git-ignored: scripts/planet-sync.mjs copies them into its release tree for the deploy.
//   bun scripts/story-render.mjs --day|--week|--both     (paints from var/planet-home-dist: build it first)
// planet-sync runs renderKit on a build of its release tree when dueKinds says a kind's week, or that week's planet,
// changed since its clips were made. Needs ffmpeg, and Chrome and Playwright as scripts/chrome.mjs finds them.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, normalize, relative } from 'node:path';
import { openChrome } from './chrome.mjs';

const ROOT = join(import.meta.dir, '..');
const KIT = join(ROOT, 'apps/planet-home/kit'), MEDIA = join(KIT, 'media'), KIT_JSON = join(KIT, 'kit.json');
export const CLIPS = { day: ['story', 'square'], week: ['story', 'square', 'wide'] };
const NAME = { day: 'today', week: 'week' }; // media/<name>-<format>.mp4|jpg
const MAX_BYTES = 10e6;
const codeOf = (link) => String(link ?? '').replace(/^.*[#?&]p=/, '');
const pad = (n) => String(n).padStart(2, '0');
const today = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const weekEnd = (week) => new Date(Date.parse(`${week}T00:00:00Z`) + 7 * 864e5).toISOString().slice(0, 10); // the next Monday
const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;

export const readKit = () => (existsSync(KIT_JSON) ? JSON.parse(readFileSync(KIT_JSON, 'utf8')) : {});

/** The kit's two weeks among a shelf's rows (ryan.json), each the newest with a session in it: the week still
 *  running on this Mac's calendar, and the last one that ended. */
export function kitWeeks(rows, day = today()) {
  const newest = rows.filter((w) => w.stats?.sessions > 0).sort((a, b) => b.week.localeCompare(a.week));
  return { day: newest.find((w) => w.week <= day && day < weekEnd(w.week)) ?? null, week: newest.find((w) => weekEnd(w.week) <= day) ?? null };
}

/** The kinds whose clips are out of date: their week moved on, its planet changed (a new session), or a file is gone. */
export function dueKinds(rows, kit = readKit()) {
  const weeks = kitWeeks(rows);
  return Object.keys(CLIPS).filter((kind) => weeks[kind] && (kit[kind]?.code !== codeOf(weeks[kind].link)
    || CLIPS[kind].some((format) => !existsSync(join(MEDIA, `${NAME[kind]}-${format}.mp4`)))));
}

// The bundle as Pages serves it (/planet/ink is planet/ink.html, /story/ its index.html), on the first free port of
// 8981-8999, on 127.0.0.1 only.
function serve(dist) {
  const fetch = (req) => {
    const path = normalize(decodeURIComponent(new URL(req.url).pathname));
    for (const f of [path, `${path}.html`, join(path, 'index.html')].map((p) => join(dist, p))) {
      if (f.startsWith(dist) && statSync(f, { throwIfNoEntry: false })?.isFile()) return new Response(Bun.file(f));
    }
    return new Response('Not found', { status: 404 });
  };
  for (let port = 8981; port <= 8999; port++) {
    try { return Bun.serve({ hostname: '127.0.0.1', port, fetch }); } catch (e) { if (e.code !== 'EADDRINUSE') throw e; }
  }
  throw new Error('no free port in 8981-8999 on 127.0.0.1');
}

// One clip, as story/ hands it over: { clip, poster } as base64, the caption, and how long it took to paint.
async function paint(page, url) {
  await page.goto(url);
  await page.waitForFunction(() => window.__story?.done, null, { timeout: 10 * 60e3, polling: 1000 });
  return page.evaluate(async () => {
    const s = window.__story;
    if (s.error) return { error: s.error };
    const base64 = (blob) => new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result.slice(r.result.indexOf(',') + 1));
      r.readAsDataURL(blob);
    });
    return { clip: await base64(s.blob), poster: await base64(s.poster), caption: s.caption, ms: s.ms };
  });
}

function ffmpeg(...args) {
  const out = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { encoding: 'utf8' });
  if (out.status !== 0) throw new Error(`ffmpeg: ${(out.stderr || 'failed').trim().split('\n').pop()}`);
}

/** Paint the kinds' clips from the bundle at `dist` into kit/, and keep kit.json. Returns the kinds made. */
export async function renderKit({ dist = join(ROOT, 'var/planet-home-dist'), kinds = Object.keys(CLIPS), log = console.log } = {}) {
  if (!existsSync(join(dist, 'story/index.html'))) throw new Error(`${relative(ROOT, dist)} has no story/ page to paint the clips with`);
  const weeks = kitWeeks(JSON.parse(readFileSync(join(dist, 'shelf/ryan.json'), 'utf8')));
  mkdirSync(join(ROOT, 'var'), { recursive: true });
  const server = serve(dist), work = mkdtempSync(join(ROOT, 'var/story-render-')), made = []; // beside the kit: one disk to rename across
  let chrome = null;
  try {
    chrome = await openChrome({ width: 1280, height: 800 });
    for (const kind of kinds) {
      const w = weeks[kind];
      if (!w) { log(`${kind}: no week to paint`); continue; }
      const code = codeOf(w.link), clips = {};
      let caption = null;
      for (const format of CLIPS[kind]) {
        const name = `${NAME[kind]}-${format}`;
        const got = await paint(chrome.page, `http://127.0.0.1:${server.port}/story/?link=${code}&kind=${kind}&format=${format}&voice=me&auto=1`);
        if (got.error) throw new Error(`${kind} ${format}: ${got.error}`);
        caption ??= got.caption;
        writeFileSync(join(work, `${name}.raw`), Buffer.from(got.clip, 'base64'));
        writeFileSync(join(work, `${name}.png`), Buffer.from(got.poster, 'base64'));
        // x264 at constant quality, its rate capped so 12 s can't pass 10 MB (6 Mb/s for 12 s, plus one 6 Mb buffer:
        // 9.75 MB); no sound, no metadata, playable as it loads
        ffmpeg('-i', join(work, `${name}.raw`), '-map', '0:v:0', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-maxrate', '6M', '-bufsize', '6M',
          '-pix_fmt', 'yuv420p', '-map_metadata', '-1', '-map_chapters', '-1', '-movflags', '+faststart', join(work, `${name}.mp4`));
        ffmpeg('-i', join(work, `${name}.png`), '-q:v', '3', join(work, `${name}.jpg`));
        const video = readFileSync(join(work, `${name}.mp4`));
        if (video.length >= MAX_BYTES) throw new Error(`${name}.mp4 is ${mb(video.length)}, over 10 MB`);
        clips[format] = { video: `media/${name}.mp4`, poster: `media/${name}.jpg`, bytes: video.length, rev: createHash('sha256').update(video).digest('hex').slice(0, 10) };
        log(`${kind} ${format}: week of ${w.week} · ${mb(video.length)} (painted ${mb(statSync(join(work, `${name}.raw`)).size)} in ${Math.round(got.ms / 1000)} s)`);
      }
      mkdirSync(MEDIA, { recursive: true });
      for (const format of CLIPS[kind]) for (const ext of ['mp4', 'jpg']) renameSync(join(work, `${NAME[kind]}-${format}.${ext}`), join(MEDIA, `${NAME[kind]}-${format}.${ext}`));
      // what the shelf shows of the week already, and no more: its share code (no names, routes as shapes), its name and body
      const kit = { ...readKit(), made: new Date().toISOString() };
      kit[kind] = { week: w.week, code, title: w.title, body: w.body, caption, made: kit.made, clips };
      if (kind === 'week' && kit.day?.week <= w.week) { // the so-far clips of a week that has its full ones now
        for (const f of Object.values(kit.day.clips)) for (const file of [f.video, f.poster]) rmSync(join(KIT, file), { force: true });
        delete kit.day;
      }
      writeFileSync(KIT_JSON, `${JSON.stringify(kit, null, 1)}\n`);
      made.push(kind);
    }
  } finally {
    await chrome?.close();
    server.stop(true);
    rmSync(work, { recursive: true, force: true });
  }
  return made;
}

if (import.meta.main) {
  const flags = { '--day': ['day'], '--week': ['week'], '--both': ['day', 'week'] };
  const kinds = flags[process.argv[2]];
  if (!kinds || process.argv.length > 3) {
    console.error('usage: bun scripts/story-render.mjs --day|--week|--both');
    process.exit(1);
  }
  const made = await renderKit({ kinds }).catch((e) => { console.error(`story-render: ${e.message}`); process.exit(1); });
  console.log(`story-render: ${made.length ? `${made.join(' and ')} in ${relative(ROOT, KIT)}/` : 'nothing to paint'}`);
}

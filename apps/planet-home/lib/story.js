/* A planet as a short clip to share. The real app (../planet/ink.html, in a frame kept off the page) is stepped a
 * frame at a time through its clip hook (base.js api.clip), so a slow phone paints the same clip a laptop does, only
 * slower: it opens on the week's bare ground on Monday morning and builds the week a day at a time (the app's own
 * build, api.build: each day's sessions coming in under the day's name, the globe turning once for the week), flies
 * down to the week's monument (its longest session if it raced none; for kind 'day' the latest session, the day's),
 * then goes back up into orbit under a small slip of the site's paper with the week's name, what it was painted as,
 * its numbers and the site. Encoded as an H.264 MP4 by WebCodecs and mp4-muxer.js (vendored); a browser with no
 * VideoEncoder records the canvas with MediaRecorder instead, in real time, so a phone too slow to paint 30 frames a
 * second gets a slower clip.
 *
 *   renderStory({ link, kind, format, seconds, stats, source, garmin, voice, onProgress }) → { blob, mime, poster, caption }
 *     link        a share code, '#p=CODE', or any link ending in one (default: this page's #p= or ?link=)
 *     kind        'week' or 'day'
 *     format      'story' 1080×1920, 'square' 1080×1080, 'wide' 1920×1080
 *     seconds     11 to 15 (12.5)
 *     stats       the week's numbers as lib/week.js statsOf has them (default: read from the code)
 *     source      'strava' for a week from Strava: its card carries the Powered by Strava mark; 'garmin' for one from
 *                 Garmin through Junction
 *     garmin      a Strava or Garmin week's "Garmin [device model]" lines, when Garmin devices recorded it: every frame names
 *                 the device, as Garmin's API Brand Guidelines ask of a shared image
 *     voice       'me' when Ryan posts his own week (his phone kit): the caption says 'My'; anyone else sharing one
 *                 of his weeks gets 'Ryan's'
 *     onProgress  called with { phase: 'loading' | 'painting' | 'encoding' | 'done', done: 0..1, canvas }, canvas
 *                 being the clip's own frame as it's painted, for a page to show
 *   shareFiles({ files, text, url }) → 'shared' | 'downloaded' | 'cancelled' (call it from a tap) */
import { codeOf } from './store.js';
import { weekOf } from './week.js';
import { metric, numbers, when } from './poster.js';
import { longDate } from './world.js';
import { garminLines, poweredSvg } from '../planet/strava-mark.js';

export const FORMATS = { story: [1080, 1920], square: [1080, 1080], wide: [1920, 1080] };
const FPS = 30;
const SITE = 'planet.fleming.run';
const ORBIT_RATE = 0.09; // radians a second the orbit turns under the card (the app's own is 0.035)
// the clip in seconds: the build (the week's days one after another, a trained day three times a rest day's share),
// a breath on the finished planet, the flight down, the ground; the card has the rest
const BUILD = 4.2, HOLD = 0.5, FLIGHT = 2.4, GROUND = 0.9, REST_SHARE = 1 / 3;
const FADE_IN = 0.4, CROSS = 0.5, CARD_DELAY = 0.2, CARD_IN = 0.8, DAYS_OUT = 0.35; // seconds
// Under the card, per format: the planet's radius as a share of the frame's short side (rb while the week builds),
// and the card's width and scale. The story's card stays inside the band Instagram and TikTok keep clear of their own
// buttons; the square's is pinned over the planet's lower left; the wide's stands beside it.
const LAYOUT = { story: { r: 0.28, rb: 0.38, w: 800, s: 1 }, square: { r: 0.23, rb: 0.34, w: 620, s: 0.78 }, wide: { r: 0.27, rb: 0.36, w: 600, s: 1 } };
const NIGHT = '#0a0d20', PAPER = '#f3ecdc', INK = '#242a3c', SOFT = '#4b5470', ACCENT = '#b0402a';
const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
const STROKE = 'M0.5 4.7 C 9 3.1, 27 3.2, 46 3.6 S 81 3.5, 99.5 4.2 C 84 4.9, 63 5.5, 42 5.4 S 10 5.8, 0.5 4.7 Z'; // ink.css --ink-stroke
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => { const k = clamp01(x); return k * k * (3 - 2 * k); };
const one = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format;
const int = new Intl.NumberFormat('en-US').format;
const amount = (n, unit) => `${unit === 'meters' ? int(Math.round(n)) : one(n)} ${one(n) === '1' ? unit.slice(0, -1) : unit}`;
const hereLink = () => new URLSearchParams(location.hash.slice(1)).get('p') || new URLSearchParams(location.search).get('link') || '';
const pause = () => (globalThis.scheduler?.yield ? scheduler.yield() : new Promise((resolve) => setTimeout(resolve, 0)));

/** A week whose week has not ended yet (by the clock here): what a page shares as kind 'day'. */
export const ongoing = (week) => Date.now() < Date.parse(`${week}T00:00:00Z`) + 7 * 864e5;

/** The clip, its poster (the last frame, as a PNG) and a caption: see the header. */
export async function renderStory({ link, kind = 'week', format = 'story', seconds = 12.5, stats, source, garmin, voice, onProgress } = {}) {
  if (!FORMATS[format]) format = 'story';
  const [W, H] = FORMATS[format];
  const S = Math.min(15, Math.max(11, Number(seconds) || 12.5));
  const N = Math.round(S * FPS);
  const week = weekOf(codeOf(link ?? hereLink())); // throws the share code's own plain words on a bad link
  const numbersOf = stats || week.stats;
  const out = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const g = out.getContext('2d');
  const tell = (phase, done) => onProgress?.({ phase, done, canvas: out });
  tell('loading', 0);
  const ryans = isRyans(week.code);
  // under the card the orbit passes the poster's own face (the side the app turns to the week's subject) half way
  const landT = BUILD + HOLD, upT = landT + FLIGHT + GROUND;
  const yaw = (-ORBIT_RATE * ((upT + S) / 2) * 180) / Math.PI;
  const { frame, app } = await openApp(week.code, W, H, yaw);
  let sink = null;
  try {
    const features = app.features, target = landingOf(features, kind);
    const words = cardWords({ kind, week, stats: numbersOf, features, target });
    const card = await makeCard(words, format, W, H, source === 'strava' ? await svgImage(poweredSvg) : null, source === 'strava' || source === 'garmin' ? garminLines(garmin) : []);
    await app.build.prepare();
    const days = makeDays(features, app.build.days, kind, format, W, H);
    sink = (await encoder(W, H)) || recorder(out);
    // as the week builds the planet fills most of the frame's short side (a race ring's outer edge kept inside it),
    // pushed in a little as it goes, and under the card it is at its format's share of it: a sphere of angular radius
    // a is (H/2)·tan a / tan(fov/2) px in radius
    const base = app.debug.poster().base, lens = Math.tan((app.camera.fov * Math.PI) / 360);
    const farFor = (r) => features.radius / Math.sin(Math.atan((r * Math.min(W, H) * lens) / (H / 2))) / base;
    const ring = (app.scene.getObjectByName('companion-race-ring')?.userData.ring?.outer || 0) / features.radius;
    const farBuild = farFor(Math.min(LAYOUT[format].rb, 0.47 / Math.max(1, ring))), farEnd = farFor(LAYOUT[format].r);
    const src = app.renderer.domElement;
    const still = Object.assign(document.createElement('canvas'), { width: W, height: H });
    const landAt = Math.round(landT * FPS), upAt = Math.round(upT * FPS);
    for (let i = 0; i < N; i++) {
      const t = i / FPS;
      const p = days.at(t / BUILD);
      if (i < landAt) app.build.at(p, { face: 1, look: Math.min(p, days.last + 0.74) }); // held on the last day at the end
      if (i === landAt) app.clip.land(target?.id, FLIGHT); // the landing lets the build go: the ground is the week's
      if (i === upAt) {
        still.getContext('2d').drawImage(out, 0, 0); // the last of the ground, to cross from
        app.clip.leave();
      }
      app.clip.draw(t, i ? 1 / FPS : 0, i < upAt ? farBuild * (1.1 - 0.1 * smooth(t / BUILD)) : farEnd);
      g.globalAlpha = 1;
      g.drawImage(src, 0, 0, W, H);
      if (t < FADE_IN) {
        g.globalAlpha = 1 - smooth(t / FADE_IN);
        g.fillStyle = NIGHT;
        g.fillRect(0, 0, W, H);
      }
      days.draw(g, p, 1 - smooth((t - landT) / DAYS_OUT));
      if (t >= upT && t < upT + CROSS) {
        g.globalAlpha = 1 - smooth((t - upT) / CROSS);
        g.drawImage(still, 0, 0);
      }
      const cardK = (t - upT - CARD_DELAY) / CARD_IN;
      card.tag(g, 1 - smooth(cardK)); // the device's name, until the card that carries it is up
      if (t > upT + CARD_DELAY) card.draw(g, cardK);
      await sink.add(out, i);
      tell('painting', (i + 1) / N);
      await pause();
    }
    tell('encoding', 1);
    const blob = await sink.end();
    const poster = await new Promise((resolve) => out.toBlob(resolve, 'image/png'));
    tell('done', 1);
    return { blob, mime: sink.mime, poster, caption: captionOf({ ryan: (await ryans) && (voice === 'me' ? 'me' : 'him'), kind, week, stats: numbersOf, words }) };
  } catch (error) {
    sink?.cancel();
    throw error;
  } finally {
    frame.remove();
  }
}

// The app in a frame off the page, its canvas W×H device px (base.js resizeRenderer: the device's pixel ratio up to
// 2, under its 2.8 MP cap), at the classic poster's framing and the clip's orbit rate. ?t= fixes the clock, which
// ?yaw= needs; the clip's own draws move it on.
async function openApp(code, W, H, yaw) {
  const ratio = Math.min(devicePixelRatio || 1, 2);
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = `position:fixed;top:0;left:${-Math.ceil(W / ratio) - 64}px;width:${W / ratio}px;height:${H / ratio}px;border:0;pointer-events:none`;
  frame.src = `${new URL('../planet/ink.html', import.meta.url).pathname}?t=0&yaw=${yaw.toFixed(2)}&p.poster.shot=classic&p.motion.orbitRate=${ORBIT_RATE}#p=${code}`;
  document.body.append(frame);
  const t0 = performance.now();
  while (!(frame.contentWindow?.__app?.clip && frame.contentDocument.querySelector('[data-pc-painted]'))) {
    if (performance.now() - t0 > 60000) {
      frame.remove();
      throw new Error('The planet took too long to paint.');
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return { frame, app: frame.contentWindow.__app };
}

// Where the clip lands: the day's session (its race's monument, if it raced), or the week's monument, or the week's
// longest session. Null for an empty week, which lands where Land does.
function landingOf(features, kind) {
  const list = features.list;
  if (kind === 'day') {
    const at = (f) => Date.parse(f.stats?.startedAt) || 0;
    const last = Math.max(...list.map(at));
    const today = list.filter((f) => at(f) === last);
    return today.find((f) => f.kind === 'monument') || today[0] || null;
  }
  return features.monument || list.reduce((a, f) => ((f.stats?.activeS || 0) > (a?.stats?.activeS || 0) ? f : a), null);
}

// "Thursday's run: 8.2 miles", from the session as a share code without names carries it (its title "Thu run 2")
function sessionOf(a, km) {
  const noun = a.isRace ? 'race' : String(a.title || 'session').replace(/^\S+ /, '').replace(/ \d+$/, '');
  const d = a.distanceM || 0, s = a.activeS || 0;
  const far = d >= 100 && /^(running|walking|hiking|cycling)$/.test(a.sport) ? (km ? amount(d / 1000, 'kilometers') : amount(d / 1609.344, 'miles'))
    : d && a.sport === 'swimming' ? amount(d, 'meters')
      : s ? (s >= 5400 ? amount(s / 3600, 'hours') : amount(Math.round(s / 60), 'minutes')) : '';
  return `${DAYS[new Date(a.startedAt).getUTCDay()]}'s ${noun}${far ? `: ${far}` : ''}`;
}

function cardWords({ kind, week, stats, features, target }) {
  const label = features.body?.label || 'Rocky planet';
  const why = String(features.body?.reason || '').split(/(?<=\.)\s/)[0]; // the body's own reason, its first sentence
  const day = kind === 'day' && target ? sessionOf(target.stats, metric) : null;
  return {
    head: (day ? `Week of ${longDate(week.week)}, so far` : when(week.week)).toUpperCase(),
    title: day || week.name,
    body: why ? `${label}: ${why[0].toLowerCase()}${why.slice(1)}` : label,
    label,
    nums: `${day ? 'So far: ' : ''}${numbers(stats, metric)}`,
    day,
  };
}

// The build's days over the clip: the week's position at u (0..1 of the build; a trained day takes three times a rest
// day's share), and the day's name lettered over the planet with what was done that day, and the week's seven days
// as a ribbon under it, lit as they pass. A week still running stops at its last day with a session in it.
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
function makeDays(features, byDay, kind, format, W, H) {
  const trained = byDay.map((ids) => ids.length > 0);
  const last = kind === 'day' ? Math.max(0, trained.lastIndexOf(true)) : 6;
  const share = trained.slice(0, last + 1).map((t) => (t ? 1 : REST_SHARE));
  const cum = share.reduce((c, s) => [...c, c.at(-1) + s], [0]);
  const said = byDay.map((ids) => {
    const done = ids.map((id) => features.byId[id]?.stats).filter(Boolean).map(doneOf);
    return done.length > 3 ? `${done.slice(0, 2).join(' · ')} and ${done.length - 2} more` : done.join(' · ');
  });
  const L = {
    story: { x: W / 2, y: 0.18 * H, name: 116, words: 46, mark: 50, align: 'center', ribbonY: 0.79 * H, step: 104 },
    square: { x: 64, y: 128, name: 84, words: 36, mark: 38, align: 'left', ribbonY: H - 64, step: 70 },
    wide: { x: 96, y: 170, name: 96, words: 38, mark: 40, align: 'left', ribbonY: H - 76, step: 74 },
  }[format];
  // a day's name fades in and out over 0.12 s of its own time, never over its neighbour's
  const fade = share.map((s) => Math.min(0.45, (0.12 * cum.at(-1)) / (s * BUILD)));
  const text = (g, s, x, y, font, color, a) => {
    g.globalAlpha = a;
    g.font = font;
    g.fillStyle = color;
    g.fillText(s, x, y);
  };
  return {
    last,
    at(u) {
      const x = clamp01(u) * cum.at(-1);
      let d = 0;
      while (d < last && x >= cum[d + 1]) d++;
      return Math.min(last + 1, d + (x - cum[d]) / share[d]);
    },
    draw(g, p, alpha) {
      if (!(alpha > 0)) return;
      g.save();
      g.textAlign = L.align;
      g.textBaseline = 'alphabetic';
      g.shadowColor = NIGHT;
      g.shadowBlur = 18;
      const now = Math.min(last, Math.floor(p));
      for (let d = Math.max(0, now - 1); d <= Math.min(last, now + 1); d++) {
        const into = d ? smooth((p - d) / fade[d]) : 1, out = d < last ? 1 - smooth((p - d - 1 + fade[d]) / fade[d]) : 1;
        const a = into * out * alpha, y = L.y + (1 - into) * 20 - (1 - out) * 20;
        if (a <= 0.002) continue;
        text(g, WEEKDAYS[d], L.x, y, `italic ${L.name}px ${SERIF}`, PAPER, a);
        if (said[d]) text(g, said[d], L.x, y + L.words * 1.55, `italic ${L.words}px ${SERIF}`, PAPER, a * 0.88);
      }
      // the ribbon: a day passed is lit (a trained one inked in), the day being built is the race line's vermilion
      g.shadowBlur = 10;
      const x0 = L.align === 'center' ? L.x - 3 * L.step : L.x + L.step / 4;
      for (let d = 0; d < 7; d++) {
        const x = x0 + d * L.step, current = d === now && p < last + 1, past = d < now || p >= last + 1;
        const color = current ? ACCENT : PAPER;
        const a = alpha * (d > last ? 0.18 : current ? 1 : past ? (trained[d] ? 0.95 : 0.5) : 0.32);
        g.textAlign = 'center';
        text(g, 'MTWTFSS'[d], x, L.ribbonY, `600 ${L.mark}px ${SERIF}`, color, a);
        g.beginPath();
        g.arc(x, L.ribbonY + L.mark * 0.55, L.mark * 0.15, 0, Math.PI * 2);
        if (trained[d] && (past || current)) { g.fillStyle = color; g.fill(); }
        else { g.lineWidth = 2; g.strokeStyle = color; g.stroke(); }
      }
      g.restore();
    },
  };
}
// "6.2 mi run", "lift": a session as its share code carries it (its title "Thu run 2", no names)
function doneOf(a) {
  const noun = a.isRace ? 'race' : String(a.title || 'session').replace(/^\S+ /, '').replace(/ \d+$/, '');
  const d = a.distanceM || 0;
  const far = d >= 100 && /^(running|walking|hiking|cycling)$/.test(a.sport) ? `${one(metric ? d / 1000 : d / 1609.344)} ${metric ? 'km' : 'mi'}`
    : d && a.sport === 'swimming' ? `${int(Math.round(d))} m` : '';
  return far ? `${far} ${noun}` : noun;
}

function wrap(g, text, width) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && g.measureText(next).width > width) { lines.push(line); line = word; } else line = next;
  }
  return line ? [...lines, line] : lines;
}

// The card: a slip of the site's paper (ink.css .slip: the same torn edge) lettered as a museum label, laid on
// rising and coming up out of the night as k goes 0 → 1, its brush stroke drawn in after the words. A week from Strava
// carries Strava's mark under its numbers (`powered`, the mark as an image), as the poster and the planet page do, and
// over the mark its Garmin devices (`garmin`), which `tag` writes in the frame's top corner until the card is up.
async function makeCard(words, format, W, H, powered, garmin) {
  const { w: cw, s } = LAYOUT[format];
  const px = (n) => Math.round(n * s);
  const pad = px(50), inner = cw - 2 * pad;
  const m = document.createElement('canvas').getContext('2d');
  const lines = (font, text) => { m.font = font; return wrap(m, text, inner); };
  // the name on two lines at most, a size smaller each time it would take three
  const size = [58, 50, 44].map(px).find((n) => lines(`${n}px ${SERIF}`, words.title).length <= 2) ?? px(44);
  const title = lines(`${size}px ${SERIF}`, words.title).slice(0, 3);
  const lead = Math.round(size * 1.1), small = px(28), gap = px(37);
  const body = lines(`italic ${small}px ${SERIF}`, words.body);
  const nums = lines(`${small}px ${SERIF}`, words.nums);
  const markH = powered ? px(30) : 0, device = garmin.join(' · '), deviceH = device ? px(40) : 0;
  const ch = 2 * pad + px(150) + title.length * lead + (body.length + nums.length) * gap + (powered ? markH + px(8) : 0) + deviceH;
  const card = Object.assign(document.createElement('canvas'), { width: cw, height: ch });
  const g = card.getContext('2d');
  g.drawImage(await svgImage(slip(cw, ch)), 0, 0);
  g.textBaseline = 'alphabetic';
  let y = pad + px(22);
  g.fillStyle = SOFT;
  g.font = `600 ${px(21)}px ${SERIF}`;
  g.letterSpacing = `${px(4)}px`;
  g.fillText(words.head, pad, y);
  g.letterSpacing = '0px';
  y += px(30);
  g.fillStyle = INK;
  g.font = `${size}px ${SERIF}`;
  for (const line of title) { y += lead; g.fillText(line, pad, y); }
  const strokeY = y + px(14), strokeW = Math.min(inner * 0.62, Math.max(px(180), g.measureText(title.at(-1) || '').width * 0.7));
  y += px(34);
  g.fillStyle = SOFT;
  g.font = `italic ${small}px ${SERIF}`;
  for (const line of body) { y += gap; g.fillText(line, pad, y); }
  y += px(10);
  g.fillStyle = INK;
  g.font = `${small}px ${SERIF}`;
  for (const line of nums) { y += gap; g.fillText(line, pad, y); }
  if (device) {
    y += deviceH;
    g.fillStyle = SOFT;
    g.font = `${px(25)}px ${SERIF}`;
    g.fillText(device, pad, y);
  }
  if (powered) g.drawImage(powered, pad, y + px(20), (markH * powered.width) / powered.height, markH);
  g.fillStyle = ACCENT;
  g.font = `600 ${px(19)}px ${SERIF}`;
  g.letterSpacing = `${px(4)}px`;
  g.textAlign = 'right';
  g.fillText(SITE.toUpperCase(), cw - pad, ch - pad + px(4));
  g.letterSpacing = '0px';
  const x = format === 'wide' ? W - cw - 72 : format === 'square' ? 36 : (W - cw) / 2;
  const top = format === 'story' ? Math.round(H * 0.665) : format === 'square' ? H - ch - 36 : Math.round((H - ch) / 2);
  const stroke = new Path2D(STROKE);
  // the frame's tag: top left, under the band a story's own account name and progress bar cover
  const tagFont = `${px(30)}px ${SERIF}`, tagX = px(64), tagY = format === 'story' ? Math.round(H * 0.135) : px(76);
  return {
    draw(ctx, k) {
      const a = smooth(k);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(x, top + (1 - a) * px(24));
      ctx.rotate(-0.006);
      ctx.drawImage(card, 0, 0);
      const drawn = smooth((k - 0.45) / 0.55); // the stroke, drawn left to right once the words are up
      if (drawn > 0) {
        ctx.beginPath();
        ctx.rect(pad - 4, strokeY - px(10), (strokeW + 8) * drawn, px(30));
        ctx.clip();
        ctx.translate(pad - 3, strokeY - px(12));
        ctx.scale(strokeW / 100, 3.4 * s);
        ctx.fillStyle = ACCENT;
        ctx.fill(stroke);
      }
      ctx.restore();
    },
    tag(ctx, alpha) {
      if (!device || alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = alpha * 0.9;
      ctx.font = tagFont;
      ctx.fillStyle = PAPER;
      ctx.shadowColor = NIGHT;
      ctx.shadowBlur = px(12);
      ctx.fillText(device, tagX, tagY);
      ctx.restore();
    },
  };
}

// ink.css's --slip-whole at the card's own size, so its torn edge is the site's at any size (its turbulence is seeded,
// so the same card tears the same way every time)
const slip = (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><filter id="t" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="4" seed="3"/><feDisplacementMap in="SourceGraphic" scale="15"/></filter><rect filter="url(#t)" x="12" y="12" width="${w - 24}" height="${h - 24}" fill="${PAPER}"/></svg>`;

async function svgImage(svg) {
  const image = new Image();
  image.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  await image.decode();
  return image;
}

// WebCodecs: every frame is stamped with its own time, so the clip plays at 30 frames a second however long each
// took to paint. H.264 High, then Main, then Baseline, whichever this browser encodes at this size.
async function encoder(W, H) {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return null;
  let config = null;
  for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42e028']) {
    const c = { codec, width: W, height: H, bitrate: Math.round(W * H * FPS * 0.16), framerate: FPS, avc: { format: 'avc' } };
    if ((await VideoEncoder.isConfigSupported(c).catch(() => null))?.supported) { config = c; break; }
  }
  if (!config) return null;
  const { Muxer, ArrayBufferTarget } = await import('./mp4-muxer.js');
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: W, height: H, frameRate: FPS }, fastStart: 'in-memory', firstTimestampBehavior: 'offset' });
  let failed = null;
  const video = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { failed = e; } });
  video.configure(config);
  return {
    mime: 'video/mp4',
    async add(canvas, i) {
      if (failed) throw failed;
      const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
      video.encode(frame, { keyFrame: i % (2 * FPS) === 0 });
      frame.close();
      while (video.encodeQueueSize > 2) await new Promise((resolve) => setTimeout(resolve, 1));
    },
    async end() {
      await video.flush();
      if (failed) throw failed;
      video.close();
      muxer.finalize();
      return new Blob([muxer.target.buffer], { type: 'video/mp4' });
    },
    cancel() { if (video.state !== 'closed') video.close(); },
  };
}

// MediaRecorder, where there's no VideoEncoder: the canvas is recorded as it's painted, a frame each 1/30 s at most
// (a slower painter makes a slower clip)
function recorder(canvas) {
  const type = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((t) => globalThis.MediaRecorder?.isTypeSupported(t));
  if (!type || !canvas.captureStream) throw new Error("This browser can't make video files.");
  const stream = canvas.captureStream(0), track = stream.getVideoTracks()[0];
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: Math.round(canvas.width * canvas.height * FPS * 0.16) });
  const parts = [];
  rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
  rec.start();
  let next = performance.now();
  return {
    mime: type.split(';')[0],
    async add() {
      track.requestFrame();
      next = Math.max(next + 1000 / FPS, performance.now());
      await new Promise((resolve) => setTimeout(resolve, next - performance.now()));
    },
    end: () => new Promise((resolve) => {
      rec.onstop = () => resolve(new Blob(parts, { type: type.split(';')[0] }));
      rec.stop();
      track.stop();
    }),
    cancel() {
      if (rec.state !== 'inactive') rec.stop();
      track.stop();
    },
  };
}

// Ryan's own weeks (the shelf's, by their exact code, as base.js galaxyLink finds them) are named as his
async function isRyans(code) {
  try {
    const shelf = await (await fetch(new URL('../shelf/ryan.json', import.meta.url))).json();
    return shelf.some((w) => codeOf(w.link) === code);
  } catch {
    return false;
  }
}

// ryan: 'me' (his kit, posting as him), 'him' (someone sharing one of his weeks) or false (anyone's own week)
function captionOf({ ryan, kind, week, stats, words }) {
  const nums = numbers(stats, metric).replaceAll(' · ', ', ');
  if (words.day) return ryan === 'me' ? `${words.day}. This week's planet so far: ${nums}. ${SITE}` : ryan ? `${words.day}. Ryan's planet for the week so far: ${nums}. ${SITE}` : `${words.day}. The week's planet so far: ${nums}. Make one from your own week at ${SITE}`;
  const as = `${/^[aeiou]/i.test(words.label) ? 'an' : 'a'} ${words.label.toLowerCase()}`;
  const raced = week.seed.activities.some((a) => a.isRace);
  const what = raced ? week.name.replace(/^The /, '') : `week of ${week.made}`;
  if (ryan === 'me') return `My ${what} came out as ${as}. ${nums}. ${SITE}`;
  if (ryan) return `Ryan's ${what} came out as ${as}. ${nums}. Make one from your own week at ${SITE}`;
  return `${raced ? week.name : `A week of ${week.made}`}, painted as ${as}. ${nums}. Make one from your own week at ${SITE}`;
}

/** The words on the clipboard (a hidden field and the old copy command where the clipboard API says no). */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = Object.assign(document.createElement('textarea'), { value: text, readOnly: true });
    field.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.append(field);
    field.select();
    const done = document.execCommand('copy');
    field.remove();
    return done;
  }
}

/** The file downloaded, as a link with a download name would. */
export function saveFile(file) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

/** The files to the phone's share sheet (Instagram, TikTok, X, Facebook...), the words copied to paste in: an iPhone
 *  drops Instagram's Stories from a share that has words beside its video. Where there's no sheet that takes files
 *  (most desktops) each file is downloaded instead. Resolves 'shared', 'downloaded' or 'cancelled'. */
export async function shareFiles({ files = [], text = '', url = '' } = {}) {
  const words = [text, url].filter(Boolean).join(' ');
  const copied = words ? copyText(words) : null; // started first, inside the same tap
  if (files.length && navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files });
      return 'shared';
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled';
      // anything else (the tap was too long ago, a file it won't take) saves the files instead
    }
  }
  for (const file of files) saveFile(file);
  await copied;
  return 'downloaded';
}

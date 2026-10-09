/* The poster: one week on a sheet of A3 at 300 dots to the inch. The planet is painted by the real app at print
 * size (paint.js); under it the week's name, its numbers, and its reading (reading.js), lettered in the book
 * serif; posterPDF wraps the sheet in a one-page PDF. Also the words the shelf uses for a week. */
import { paint } from './paint.js';
import { codeOf } from './store.js';
import { reading } from './reading.js';
import { decodePlanet } from '../planet/share.js';
import { garminLines, poweredSvg } from '../planet/strava-mark.js';

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const utc = (week) => new Date(`${week}T00:00:00Z`);
// number formats made once (toLocaleString makes a new one each call, and a shelf of 81 calls it hundreds of times)
const int = new Intl.NumberFormat('en-US').format, one = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format;
export const count = (n, word, many = `${word}s`) => `${int(n)} ${n === 1 ? word : many}`;

const md = (d) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
/** 'April 28 to May 4, 2025': the week, Monday to Sunday. */
export function when(week) {
  const a = utc(week), b = new Date(+a + 6 * 864e5);
  const sameYear = a.getUTCFullYear() === b.getUTCFullYear(), sameMonth = sameYear && a.getUTCMonth() === b.getUTCMonth();
  return `${md(a)}${sameYear ? '' : `, ${a.getUTCFullYear()}`} to ${sameMonth ? b.getUTCDate() : md(b)}, ${b.getUTCFullYear()}`;
}
export const monthYear = (week) => `${MONTHS[utc(week).getUTCMonth()]} ${week.slice(0, 4)}`;
export const nameOf = (p) => p.title || `The week of ${md(utc(p.week))}, ${p.week.slice(0, 4)}`;
// kilometers and meters wherever the browser's language isn't one of the few that run in miles (as /make does)
export const metric = !/-(US|GB|LR|MM)$/i.test(navigator.language) && navigator.language !== 'en';
/** '6 sessions · 41.8 miles · 6.7 hours', from week.js's stats */
export function numbers(s = {}, km = metric) {
  const hours = Math.round((s.min || 0) / 6) / 10;
  const far = s.mi ? (km ? `${one(s.mi * 1.609344)} km` : `${one(s.mi)} miles`) : '';
  return [count(s.sessions || 0, 'session'), far, hours ? count(hours, 'hour') : ''].filter(Boolean).join(' · ');
}

const W = 3508, H = 4961, M = 270; // A3 portrait at 300 dpi, and its margin
const PAPER = '#efe6d2', INK = '#242a3c', SOFT = '#4b5470', ACCENT = '#b0402a', RULE = 'rgba(36, 42, 60, .34)';
const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
const STROKE = new Path2D('M0.5 4.7 C 9 3.1, 27 3.2, 46 3.6 S 81 3.5, 99.5 4.2 C 84 4.9, 63 5.5, 42 5.4 S 10 5.8, 0.5 4.7 Z'); // ink.css --ink-stroke

function wrap(g, text, width) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && g.measureText(next).width > width) { lines.push(line); line = word; } else line = next;
  }
  return line ? [...lines, line] : lines;
}

// the reading in two columns, as large as it fits in `height`
function layReading(g, entries, width, height) {
  for (let size = 50; size >= 26; size -= 3) {
    const lead = size * 1.42, head = size * 1.5, gap = size * 0.85;
    g.font = `${size}px ${SERIF}`;
    const blocks = entries.map((e) => ({ title: e.title, lines: e.lines.flatMap((l) => wrap(g, l, width)) }));
    const tall = blocks.map((b) => head + b.lines.length * lead + gap);
    let split = 0, best = Infinity;
    for (let k = 0; k <= blocks.length; k++) {
      const left = tall.slice(0, k).reduce((a, b) => a + b, 0), right = tall.slice(k).reduce((a, b) => a + b, 0);
      if (Math.max(left, right) < best) { best = Math.max(left, right); split = k; }
    }
    if (best - gap <= height || size <= 26) return { size, lead, head, gap, columns: [blocks.slice(0, split), blocks.slice(split)] };
  }
}

function grain(g) {
  const tile = document.createElement('canvas');
  tile.width = tile.height = 256;
  const t = tile.getContext('2d'), px = t.createImageData(256, 256);
  for (let i = 0; i < px.data.length; i += 4) px.data.set([102, 84, 56, Math.random() * 30], i);
  t.putImageData(px, 0, 0);
  g.save();
  g.globalCompositeOperation = 'multiply';
  g.scale(2, 2); // a fiber about a sixth of a millimeter
  g.fillStyle = g.createPattern(tile, 'repeat');
  g.fillRect(0, 0, W / 2, H / 2);
  g.restore();
}

async function svgImage(svg) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The poster for a kept planet ({link, week, title, stats, metric?, source?, detail?, garmin?}), as an A3 canvas. */
export async function poster(p) {
  const km = p.metric ?? metric;
  const code = codeOf(p.link);
  const coarse = matchMedia('(pointer: coarse)').matches; // a phone's GPU: a smaller frame, scaled up
  const size = 2560;
  const world = await paint(code, { px: coarse ? 1800 : 3000, size, crop: 0.8 });
  const powered = p.source === 'strava' ? await svgImage(poweredSvg) : null;
  const provider = p.source === 'strava' || p.source === 'garmin'; // its sweat is an estimate, and its Garmin line shows
  const sheet = document.createElement('canvas');
  sheet.width = W;
  sheet.height = H;
  const g = sheet.getContext('2d');
  g.fillStyle = PAPER;
  g.fillRect(0, 0, W, H);

  // the planet, its sky feathered into the paper
  const wg = world.getContext('2d');
  wg.globalCompositeOperation = 'destination-in';
  const fade = wg.createRadialGradient(size / 2, size / 2, size * 0.43, size / 2, size / 2, size / 2);
  fade.addColorStop(0, '#000');
  fade.addColorStop(1, 'transparent');
  wg.fillStyle = fade;
  wg.fillRect(0, 0, size, size);
  const top = 430;
  g.drawImage(world, (W - size) / 2, top);

  // the head: what it is, and when
  g.textBaseline = 'alphabetic';
  g.fillStyle = SOFT;
  g.font = `600 40px ${SERIF}`;
  g.letterSpacing = '9px';
  g.textAlign = 'left';
  g.fillText('PLANET CREATOR', M, 330);
  g.textAlign = 'right';
  g.fillText(when(p.week).toUpperCase(), W - M, 330);
  g.letterSpacing = '0px';
  g.fillStyle = RULE;
  g.fillRect(M, 372, W - 2 * M, 3);

  // the name, underlined with the brush, and the numbers
  g.textAlign = 'center';
  g.fillStyle = INK;
  g.font = `150px ${SERIF}`;
  let y = top + size + 200;
  for (const line of wrap(g, nameOf(p), W - 2 * M - 200)) { g.fillText(line, W / 2, y); y += 170; }
  g.save();
  g.translate(W / 2 - 330, y - 110);
  g.rotate(-0.006);
  g.scale(6.6, 5.2);
  g.fillStyle = ACCENT;
  g.fill(STROKE);
  g.restore();
  g.fillStyle = SOFT;
  g.font = `italic 58px ${SERIF}`;
  y += 40;
  g.fillText(`${numbers(p.stats, km)}${p.stats?.race ? ` · ${p.stats.race}` : ''}`, W / 2, y);
  const s = p.stats || {};
  const climb = s.climbM ? (km ? `${int(Math.round(s.climbM))} meters of climbing` : `${int(Math.round(s.climbM * 3.28084))} feet of climbing`) : '';
  const extra = [climb, s.sweatL ? `${provider ? 'an estimated ' : ''}${one(s.sweatL)} liters of sweat` : ''].filter(Boolean).join(' · ');
  if (extra) { y += 78; g.fillText(extra, W / 2, y); }
  // a Strava week recorded on Garmin devices names them by its numbers (Strava API Policy 4.4), and so does a Garmin
  // week from Junction (Garmin's API Brand Guidelines)
  const garmin = provider ? garminLines(p.garmin).join(' · ') : '';
  if (garmin) {
    y += 86;
    g.font = `48px ${SERIF}`;
    g.fillText(garmin, W / 2, y);
  }

  // the reading, the way the app told it
  const foot = H - 250;
  const colW = (W - 2 * M - 170) / 2;
  const lay = layReading(g, reading(decodePlanet(code), { metric: km }), colW, foot - 90 - (y + 150));
  g.textAlign = 'left';
  lay.columns.forEach((blocks, c) => {
    let yy = y + 150 + lay.size;
    const x = M + c * (colW + 170);
    for (const b of blocks) {
      g.fillStyle = ACCENT;
      g.font = `600 ${Math.round(lay.size * 0.72)}px ${SERIF}`;
      g.letterSpacing = `${Math.round(lay.size * 0.16)}px`;
      g.fillText(b.title.toUpperCase(), x, yy);
      g.letterSpacing = '0px';
      yy += lay.head;
      g.fillStyle = INK;
      g.font = `${lay.size}px ${SERIF}`;
      for (const line of b.lines) { g.fillText(line, x, yy); yy += lay.lead; }
      yy += lay.gap;
    }
  });

  // the foot
  g.fillStyle = RULE;
  g.fillRect(M, foot, W - 2 * M, 3);
  g.fillStyle = SOFT;
  g.font = `italic 44px ${SERIF}`;
  if (powered) {
    g.fillText('Painted by Planet Creator from one week of Strava training.', M, foot + 72);
    g.font = `italic 34px ${SERIF}`;
    g.fillText('Garmin-only sweat, training load and anaerobic effect values are estimates.', M, foot + 125);
  } else {
    g.fillText('Painted by Planet Creator from one week of training.', M, foot + 90);
    g.textAlign = 'right';
    g.fillText(location.host, W - M, foot + 90);
  }

  grain(g);
  if (powered) g.drawImage(powered, W - M - powered.width, foot + 78);
  return sheet;
}

/** The poster as a PDF, for a page that only wants the file. */
export const makePoster = async (p) => posterPDF(await poster(p));

/** The sheet as a one-page A3 PDF: the sheet itself, a JPEG at 300 dpi filling the page. */
export async function posterPDF(sheet) {
  const jpeg = new Uint8Array(await (await new Promise((r) => sheet.toBlob(r, 'image/jpeg', 0.92))).arrayBuffer());
  const [w, h] = [841.89, 1190.55]; // A3 in points
  const draw = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    [`<< /Type /XObject /Subtype /Image /Width ${sheet.width} /Height ${sheet.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, jpeg, '\nendstream'],
    `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`,
  ];
  const text = new TextEncoder(), parts = [], at = [];
  let size = 0;
  const put = (x) => { const b = typeof x === 'string' ? text.encode(x) : x; parts.push(b); size += b.length; };
  put('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n');
  objects.forEach((o, i) => { at.push(size); put(`${i + 1} 0 obj\n`); [o].flat().forEach(put); put('\nendobj\n'); });
  const xref = size;
  put(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${at.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`);
  put(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}

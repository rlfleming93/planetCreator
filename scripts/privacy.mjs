// What must never leave this Mac: the private terms in var/private/site-denylist.txt, any place a run started, and any
// secret. scripts/site-build.mjs checks the site bundle with these before a deploy; apps/angel-post checks each week's
// post.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const DENY = join(import.meta.dir, '../var/private/site-denylist.txt');
const literal = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// the terms, and a pattern that finds any of them (null when there are none, which rules nothing out)
export function denylist() {
  const terms = existsSync(DENY) ? readFileSync(DENY, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')) : [];
  return { terms, denied: terms.length ? new RegExp(`\\b(?:${terms.map(literal).join('|')})\\b`, 'i') : null };
}

// a key that holds a coordinate: lat, lon, latitude, start_lat, position_long, startLat, GPSLatitude… (not flat,
// epsilon or semicolon), with a number, an array or a numeral in it
const COORD = (k, x) => (/^(?:lat|lon|lng|latitude|longitude|latlng|latlon)$|[_\-\s.](?:lat|lon|lng|long|latitude|longitude|latlng|latlon)$/i.test(k)
  || /[A-Za-z0-9](?:Lat|Lon|Lng|Long|Latitude|Longitude|LatLng|LatLon)$/.test(k)) && (typeof x === 'number' || Array.isArray(x) || /^\s*-?\d/.test(x));

// every path in v that could place a run: coordinates on anything but a station (light, fort, mountain) or site.hq, and
// a route that isn't a shape in its own unit box
export function unplaced(v, at) {
  if (Array.isArray(v)) return v.flatMap((x, i) => unplaced(x, `${at}[${i}]`));
  if (!v || typeof v !== 'object') return [];
  const here = Object.entries(v).some(([k, x]) => COORD(k, x)) && !['light', 'fort', 'mountain'].includes(v.type) && at !== 'site.hq' ? [at] : [];
  const loose = ['route', 'routeShape'].filter((k) => Array.isArray(v[k]) && v[k].flat().some((x) => !(x >= 0 && x <= 1))).map((k) => `${at}.${k}`);
  return [...here, ...loose, ...Object.entries(v).flatMap(([k, x]) => unplaced(x, `${at}.${k}`))];
}

// a position written out in text, anywhere from New Jersey to Nova Scotia (40–47.99 N, 65–75.99 W, three decimals or
// more): a lat, lon pair, a GeoJSON lon, lat pair, or a video's ISO 6709 location (+DD.DDDD-0DD.DDDD/)
const PAIRS = /(?<![\d.])4[0-7]\.\d{3,}\s*[,;]\s*-(?:6[5-9]|7[0-5])\.\d{3,}|-(?:6[5-9]|7[0-5])\.\d{3,}\s*,\s*4[0-7]\.\d{3,}(?!\d)|\+4[0-7]\.\d{2,}-0(?:6[5-9]|7[0-5])\.\d{2,}/;
export const placed = (text) => text.match(PAIRS)?.[0] ?? null;

// a video as the checks read it: an MP4 as latin1 text without its media data (its mdat boxes, compressed noise that
// can spell a short private term by chance), so its metadata (titles, dates, a location) is what's searched. A video
// with a track of words (subtitles, a chapter track: any handler but picture, sound and metadata) keeps those words in
// that data, so it is read whole.
export function mp4Text(buf) {
  let text = '', o = 0;
  while (o + 8 <= buf.length) {
    let size = buf.readUInt32BE(o), head = 8;
    if (size === 1 && o + 16 <= buf.length) { size = Number(buf.readBigUInt64BE(o + 8)); head = 16; } else if (size === 0) size = buf.length - o;
    if (size < head) return buf.toString('latin1'); // not boxes after all: all of it
    if (buf.toString('latin1', o + 4, o + 8) !== 'mdat') text += buf.toString('latin1', o, Math.min(o + size, buf.length));
    o += size;
  }
  return /hdlr[\s\S]{8}(?!vide|soun|mdir)/.test(text) ? buf.toString('latin1') : text;
}

// a key that ships is a key that's public: the shapes of the ones that have turned up in Ryan's repos, and their cousins
const SECRETS = [
  ['an AWS access key id', /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|ANPA)[0-9A-Z]{16}\b/],
  ['an AWS secret key', /aws_?secret_?access_?key['"]?\s*[=:]\s*['"]?[A-Za-z0-9/+=]{40}/i],
  ['an sk- API key (OpenAI, Anthropic)', /(?<![\w-])sk-(?:proj-|ant-|svcacct-|admin-)?(?=[\w-]*\d)(?=[\w-]*[A-Z])[\w-]{20,}/],
  ['a private key', /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/],
  ['a wallet private key', /private_?key['"]?\s*[:=]\s*['"]?(?:0x)?[0-9a-fA-F]{64}\b/i],
  ['a Stripe secret key', /\b(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,}/],
  ['a Stripe webhook secret', /\bwhsec_[0-9A-Za-z]{24,}/],
  ['a Replicate token', /\br8_[0-9A-Za-z]{30,}/],
  ['an Alchemy key', /\.alchemy(?:api)?\.(?:com|io)\/(?:v2|v3|nft\/v\d)\/[\w-]{16,}|alchemy_?(?:api_?)?key['"]?\s*[:=]\s*['"][\w-]{16,}/i],
  ['a Discord bot token', /\b[MNO][\w-]{23,25}\.[\w-]{6}\.[\w-]{27,38}\b/],
  ['a Discord webhook', /discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]{20,}/i],
  ['a Google API key', /\bAIza[\w-]{35}\b/],
  ['a GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_\w{40,})/],
  ['a Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
];
// the first secret in text, with only its first few characters shown (the rest never goes into a log)
export function secret(text) {
  for (const [what, re] of SECRETS) { const m = text.match(re); if (m) return `${what} (${m[0].slice(0, 6)}…)`; }
  return null;
}

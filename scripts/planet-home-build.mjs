// Planet Creator's public home (apps/planet-home) as a static bundle for Cloudflare Pages, rebuilt from scratch in
// var/planet-home-dist/ (or --out <dir>, which must sit under var/):
//   /, /make/, /how/, /demo/, /privacy/, /terms/, /shelf/, /galaxy/  the pages, their lib/, data and images (JavaScript
//                              minified; links to the planet as /planet/ink, where Pages serves it; the site's two
//                              sheets inlined in each page, which preloads the modules it imports); not the dev
//                              scripts (_*.mjs) or the planet link
//   /planet/                   Planet Creator itself (apps/planet): ink.html and what it loads, followed through its
//                              imports as scripts/site-build.mjs does, plus whatever the pages import from it; its
//                              default week goes out with no titles or places. Everything but ink.html goes out
//                              minified in planet/v/<hash>/, and ink.html preloads the modules its own static imports
//                              reach (the core); a week's own modules (its body's drawing, print, life, world, race
//                              ring) are dynamic imports, traced and checked like the rest, and fetched on demand
//   _headers                   five-minute pages, always-revalidated shelf data, immutable revisioned shelf stills and
//                              immutable planet/v/<hash>/; HSTS, same-origin framing, no camera/mic/geolocation
//   robots.txt, sitemap.xml    every page but kit/
//   media-sizes.json           each film's size in bytes, for the Function that answers byte ranges (functions/)
// Then it checks what would go out, with scripts/privacy.mjs as the VARÐA build does: none of the private terms in
// var/private/site-denylist.txt (in the files, and in every planet a file carries, decoded), no place a run started
// (every planet decodes to routes that are shapes in their own unit box, and no data file has coordinates), no raw
// activity files, no loopback links, no functions/ path, every import there, and Pages' limits (25 MiB a file,
// 20,000 files). A failed check deletes the bundle and exits 1, so there is nothing to deploy.
//   bun scripts/planet-home-build.mjs [--out var/bench/perf/dist]
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve as absolute, sep } from 'node:path';
import { decodePlanet, encodePlanet } from '../apps/planet/share.js';
import { DENY, denylist, mp4Text, unplaced } from './privacy.mjs';

const ROOT = join(import.meta.dir, '..');
const HOME = join(ROOT, 'apps/planet-home'), PLANET = join(ROOT, 'apps/planet');
// the planet's default week names the towns its runs started in, so it lives in var/private/planet and goes out
// with no titles or places (as site-build.mjs sends it)
const SEED = join(ROOT, 'var/private/planet/seed-week.js');
const outAt = process.argv.indexOf('--out');
const OUT = outAt > 0 ? absolute(process.argv[outAt + 1] || '') : join(ROOT, 'var/planet-home-dist');
// the bundle is deleted and rebuilt, so it may only ever be a directory under var/
if (!OUT.startsWith(join(ROOT, 'var') + sep)) { console.error(`planet-home-build: --out ${OUT} is not under ${join(ROOT, 'var')}`); process.exit(1); }
const MiB = 2 ** 20, mib = (n) => `${(n / MiB).toFixed(1)} MiB`;
const fail = (why) => { rmSync(OUT, { recursive: true, force: true }); console.error(`planet-home-build: ${why}`); process.exit(1); };
const put = (rel, data) => { mkdirSync(dirname(join(OUT, rel)), { recursive: true }); writeFileSync(join(OUT, rel), data); };
const files = (dir) => readdirSync(dir, { recursive: true }).filter((f) => statSync(join(dir, f)).isFile()).sort();

// The planet the last build sent out (planet/v/<hash>/, named in its ink.html) goes out once more beside the new one:
// a page a browser still holds from before this deploy (pages are cached five minutes) then still finds its code.
const lastInk = join(OUT, 'planet/ink.html');
const lastV = existsSync(lastInk) ? readFileSync(lastInk, 'utf8').match(/\.\/(v\/[0-9a-f]{10})\//)?.[1] : null;
const carried = lastV && existsSync(join(OUT, 'planet', lastV))
  ? files(join(OUT, 'planet', lastV)).map((f) => [`planet/${lastV}/${f}`, readFileSync(join(OUT, 'planet', lastV, f))]) : [];
rmSync(OUT, { recursive: true, force: true });

// ---------------------------------------------------------------- the lap's beads
// The front page carries every week of the demo shelf as a small planet: shelf/ryan/<week>.webp, the stills the
// shelf page is drawn from, re-encoded once at 96 (a phone) and 192 (a wider screen) px; the galaxy's planets, each
// week's globe (shelf/ryan/globe/<week>.webp, the planet alone on a transparent square) at 96. They live beside the
// pictures rather than in the bundle (<dir>/thumbs/<size>/), so the dev server serves them too, and the pages pick up
// a new week on the next build. cwebp, as VARÐA's poster encoder does; it keeps a globe's transparency.
const THUMBS = [['shelf/ryan', [96, 192]], ['shelf/ryan/globe', [96]]];
for (const [from, sizes] of THUMBS) {
  let made = 0, gone = 0;
  const pics = readdirSync(join(HOME, from)).filter((f) => f.endsWith('.webp'));
  const mine = new Set(pics);
  for (const size of sizes) {
    const dir = join(HOME, from, 'thumbs', String(size));
    mkdirSync(dir, { recursive: true });
    for (const f of readdirSync(dir)) if (f.endsWith('.webp') && !mine.has(f)) { rmSync(join(dir, f)); gone++; } // a week that left the shelf
    for (const f of pics) {
      const src = join(HOME, from, f), out = join(dir, f);
      if (existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs) continue;
      const enc = spawnSync('cwebp', ['-quiet', '-q', '80', '-resize', String(size), String(size), src, '-o', out], { stdio: 'inherit' });
      if (enc.status || !existsSync(out)) fail(`cwebp could not make ${from}/${f} at ${size}px (is it installed?)`);
      made++;
    }
  }
  console.log(`planet-home-build: ${pics.length} weeks → ${from}/thumbs/{${sizes.join(',')}} (${made} re-encoded this run${gone ? `, ${gone} removed` : ''})`);
}

// ---------------------------------------------------------------- the pages and their public assets
// This recursive allowlist naturally includes standalone pages such as privacy/ and terms/. Pages Functions stay at
// the repository root and must never become static files. They are written out once the planet's folder is known.
const pages = files(HOME).filter((f) => !f.startsWith('planet/') && !/(^|\/)[_.]/.test(f) && /\.(html|css|js|json|webp|png|jpg|svg|woff2|ico|mp4|webm|vtt|webmanifest)$/.test(f));
// what goes out as JavaScript goes out without its comments and spacing (the planet's modules: 1.2 MB brotli → 0.7 MB).
// Whitespace only: Bun's identifier renaming has shadowed a module's own export inside a function (base.js's R).
const minifier = new Bun.Transpiler({ loader: 'js', target: 'browser', minifyWhitespace: true });
const minify = (f, src) => { try { return minifier.transformSync(src); } catch (e) { return fail(`${f} won't minify: ${e.message}`); } };

// ---------------------------------------------------------------- Planet Creator
// ink.html's src attributes, <link> hrefs and url()s (an <a href> is a way out, not a load), then every import
// (static, or dynamic with a literal specifier; bare ones through its importmap), all the way down, from ink.html and
// from every page that imports from it.
const INK = readFileSync(join(PLANET, 'ink.html'), 'utf8');
const IMPORTS = JSON.parse(INK.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
const imports = (src) => [...src.matchAll(/^\s*(?:import|export)\b[^'";]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/gm)]
  .map((m) => m[1] ?? m[2] ?? m[3]);
const loads = (src) => [...src.matchAll(/\ssrc="(?![a-z]+:|#)([^"]+)"|<link\b[^>]*?\shref="(?![a-z]+:|#)([^"]+)"|url\(\s*['"]?([\w./-]+\.\w+)['"]?\s*\)/g)]
  .map((m) => m[1] ?? m[2] ?? m[3]).map((u) => (/^\.\.?\//.test(u) ? u : `./${u}`));
const planetFile = (f) => (f === 'seed-week.js' ? SEED : join(PLANET, f));
function resolve(spec, from) { // a planet file's import, as a path in apps/planet
  const clean = spec.split(/[?#]/)[0];
  const bare = Object.keys(IMPORTS).find((k) => clean === k || (k.endsWith('/') && clean.startsWith(k)));
  const file = bare ? normalize(IMPORTS[bare] + clean.slice(bare.length))
    : /^\.\.?\//.test(clean) ? normalize(join(dirname(from), clean)) : null;
  if (!file || file.startsWith('..') || !existsSync(planetFile(file))) {
    fail(`planet: ${from} loads ${spec}, which isn't in apps/planet`);
  }
  return file;
}
const planet = new Set(), todo = ['ink.html'];
// the pages' own imports: into lib/ and the other pages they must be there; into planet/ they join the trace
for (const f of pages.filter((p) => /\.(html|js)$/.test(p))) {
  const src = readFileSync(join(HOME, f), 'utf8');
  for (const spec of imports(src).filter((s) => /^\.\.?\//.test(s))) {
    const to = normalize(join(dirname(f), spec.split(/[?#]/)[0]));
    if (to.startsWith('planet/')) todo.push(to.slice('planet/'.length));
    else if (!pages.includes(to)) fail(`${f} imports ${spec}, which isn't in apps/planet-home`);
  }
}
while (todo.length) {
  const f = todo.pop();
  if (planet.has(f)) continue;
  if (!existsSync(planetFile(f))) fail(`a page imports planet/${f}, which isn't in apps/planet`);
  planet.add(f);
  const src = readFileSync(planetFile(f), 'utf8');
  // what it loads from the site's own pages (../lib/space.css from ink.html) is in the bundle already
  const site = (s) => { const to = normalize(join('planet', dirname(f), s.split(/[?#]/)[0])); return !to.startsWith('planet/') && pages.includes(to); };
  todo.push(...[...(f.endsWith('.html') ? loads(src) : []), ...imports(src)].filter((s) => !site(s)).map((s) => resolve(s, f)));
}

// ---------------------------------------------------------------- the planet, versioned
// Everything ink.html loads goes out under planet/v/<hash of all of it>/, which _headers lets a browser keep for good:
// a deploy that changes any of it is a new folder, and ink.html names the new one. ink.html also lists every module
// its own static imports reach (modulepreload), so the core is asked for at once rather than one level at a time; a
// module reached only through a dynamic import (what one week needs and another doesn't) is left to load on demand.
// Pages makes Link headers of a page's preload links, and a browser acts on those before the page's importmap (see
// _headers below). A link with any extra attribute is left alone; this is the one Pages names for it.
const NO_HEADER = 'data-do-not-generate-a-link-header';
const built = new Map(); // planet file → the bytes that go out
let seed = null;
for (const f of planet) {
  if (f === 'ink.html') continue;
  if (f === 'seed-week.js') { // the default week, as a shared link carries it: no titles or places, routes as shapes
    if (!existsSync(SEED)) fail(`${SEED} is missing: ink.html loads it as its default week`);
    const window = {};
    new Function('window', readFileSync(SEED, 'utf8'))(window);
    const { week, race, activities } = window.SEED; // its race is named, not flagged: flag it, or the monument is lost
    seed = decodePlanet(encodePlanet({ week, activities: activities.map((a) => ({ ...a, isRace: a.isRace || a.title === race })) }));
    built.set(f, `window.SEED = ${JSON.stringify(seed)};\n`);
    continue;
  }
  built.set(f, f.endsWith('.js') ? minify(f, readFileSync(join(PLANET, f), 'utf8')) : readFileSync(join(PLANET, f)));
  const license = join(f.split('/').slice(0, 2).join('/'), 'LICENSE'); // a vendored library (vendor/<lib>/) travels with its licence
  if (f.startsWith('vendor/') && existsSync(join(PLANET, license))) built.set(license, readFileSync(join(PLANET, license)));
}
const digest = createHash('sha256');
for (const f of [...built.keys()].sort()) digest.update(`${f}\0`).update(built.get(f)).update('\0');
const V = `v/${digest.digest('hex').slice(0, 10)}`;
for (const [f, bytes] of built) put(`planet/${V}/${f}`, bytes);
if (lastV !== V) for (const [f, bytes] of carried) put(f, bytes);

const statics = (src) => [...src.matchAll(/^\s*(?:import|export)\b[^'";]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm)].map((m) => m[1] ?? m[2]);
const preload = new Set(), walk = statics(INK).map((s) => resolve(s, 'ink.html'));
while (walk.length) {
  const f = walk.pop();
  if (preload.has(f)) continue;
  preload.add(f);
  walk.push(...statics(readFileSync(planetFile(f), 'utf8')).map((s) => resolve(s, f)));
}
const inV = (rel) => built.has(normalize(rel)) || (rel.endsWith('/') && [...built.keys()].some((k) => k.startsWith(normalize(rel))));
const ink = INK.replace(/(["'(])\.\/([\w./-]+)/g, (m, q, rel) => (inV(rel) ? `${q}./${V}/${rel}` : m))
  .replace(/<script type="importmap">[\s\S]*?<\/script>/, (m) => `${m}\n${[...preload].sort().map((f) => `<link rel="modulepreload" href="./${V}/${f}" ${NO_HEADER}>`).join('\n')}`);
for (const s of [...loads(ink), ...imports(ink)].filter((s) => s.startsWith('./') && !s.startsWith(`./${V}/`) && !s.includes('${'))) {
  fail(`planet/ink.html still loads ${s} from outside planet/${V}/`);
}
put('planet/ink.html', ink);

// ---------------------------------------------------------------- the pages
// An import into planet/ names its file in the versioned folder; a link to the planet names /planet/ink, where Pages
// serves ink.html (planet/ink.html is a 308 to it there: one more round trip on every visit). A page's first paint
// waits on nothing it has to fetch: the site's two sheets (lib/space.css, lib/ink.css) go into its <head>. And every
// module its scripts import, all the way down, is asked for with the page (modulepreload; after its importmap, if it
// has one) rather than one import level at a time.
const SHEETS = Object.fromEntries(['space', 'ink'].map((n) => [n, readFileSync(join(HOME, `lib/${n}.css`), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*\n\s*/g, '\n').trim()]));
function modules(page) { // a page's static imports, all the way down, as paths in the bundle (a bare name is the page's importmap's)
  const seen = new Set(), walk = [page];
  while (walk.length) {
    const f = walk.pop(), inPlanet = f.startsWith('planet/');
    for (const spec of statics(readFileSync(inPlanet ? planetFile(f.slice(7)) : join(HOME, f), 'utf8'))) {
      const to = inPlanet ? `planet/${resolve(spec, f.slice(7))}` : /^\.\.?\//.test(spec) ? normalize(join(dirname(f), spec.split(/[?#]/)[0])) : null;
      if (to && !seen.has(to)) { seen.add(to); walk.push(to); }
    }
  }
  return [...seen].sort().map((p) => (p.startsWith('planet/') ? `planet/${V}/${p.slice(7)}` : p));
}
for (const f of pages) {
  if (!/\.(html|js)$/.test(f)) { put(f, readFileSync(join(HOME, f))); continue; }
  let src = readFileSync(join(HOME, f), 'utf8')
    .replace(/((?:\.\.?\/)+planet\/)([\w./-]+\.js)\b/g, (m, to, rel) => (built.has(normalize(rel)) ? `${to}${V}/${rel}` : m))
    .replaceAll('planet/ink.html', 'planet/ink');
  if (f.endsWith('.html')) {
    const preloads = modules(f).map((p) => `\n<link rel="modulepreload" href="${relative(dirname(f), p)}" ${NO_HEADER}>`).join('');
    src = src.replace(/<link rel="stylesheet" href="(?:\.\.\/)*lib\/(space|ink)\.css">/g, (m, n) => `<style>${SHEETS[n]}</style>`);
    if (preloads) src = /<script type="importmap">/.test(src) ? src.replace(/<script type="importmap">[\s\S]*?<\/script>/, (m) => `${m}${preloads}`)
      : src.replace(/<style>|<\/head>/, (m) => `${preloads.slice(1)}\n${m}`);
  }
  put(f, f.endsWith('.js') ? minify(f, src) : src);
}

// ---------------------------------------------------------------- robots.txt and sitemap.xml
// Without a robots.txt, Pages answers /robots.txt with the home page. The sitemap is every page but kit/, Ryan's phone kit.
const SITE = 'https://planet.fleming.run';
put('robots.txt', `User-agent: *\nAllow: /\nDisallow: /kit/\n\nSitemap: ${SITE}/sitemap.xml\n`);
const urls = pages.filter((f) => /(^|\/)index\.html$/.test(f) && !f.startsWith('kit/')).map((f) => `${SITE}/${f.replace(/index\.html$/, '')}`);
put('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`);

// ---------------------------------------------------------------- headers
put('_headers', `# Cloudflare Pages response headers, written by scripts/planet-home-build.mjs.
# (! Link) Pages turns a page's <link rel=modulepreload> into Link headers once it has served the page, and a browser
# acts on a header before the page's importmap: its module loads start first, the map is refused, and every bare
# 'three' import fails (the planet and the galaxy stop on a second visit). The links stay in the pages, after the map,
# and carry the attribute Pages documents for leaving a link out of its headers (NO_HEADER).
# X-Frame-Options SAMEORIGIN: only the pages here frame the planet; fleming.run's hub frames its own copy of it.
/*
  Cache-Control: public, max-age=300
  Strict-Transport-Security: max-age=31536000
  X-Frame-Options: SAMEORIGIN
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  ! Link

# ryan.json carries the painted bytes' revision in every still URL. Revalidate it so a deploy can point at the new
# painting at once.
/shelf/ryan.json
  ! Cache-Control
  Cache-Control: public, max-age=0, must-revalidate

# A still, its globe and their thumbnails are requested with ?v=<the week's revision, a hash of both pictures>. Every
# repaint gets a new URL, so those bytes can stay cached.
/shelf/ryan/*
  ! Cache-Control
  Cache-Control: public, max-age=31536000, immutable

# Planet Creator's own code goes out in planet/v/<hash of all of it>/: new code is a new folder, so what a browser has
# fetched from one can stay cached.
/planet/v/*
  ! Cache-Control
  Cache-Control: public, max-age=31536000, immutable
`);

// ---------------------------------------------------------------- film sizes
// Pages hands its Functions a file without its length, and a byte-range answer needs it: functions/_shared/range.js,
// which serves the films to Safari a slice at a time, reads each film's size from here.
put('media-sizes.json', JSON.stringify(Object.fromEntries(files(OUT).filter((f) => /\.(mp4|webm)$/.test(f)).map((f) => [`/${f.split(sep).join('/')}`, statSync(join(OUT, f)).size]))));

// ---------------------------------------------------------------- what would go out
// latin1: binaries' metadata is searched too (a video's without its compressed media data: scripts/privacy.mjs, mp4Text)
const out = files(OUT), text = (f) => (f.endsWith('.mp4') ? mp4Text(readFileSync(join(OUT, f))) : readFileSync(join(OUT, f), 'latin1'));
const sizes = out.map((f) => [f, statSync(join(OUT, f)).size]).sort((a, b) => b[1] - a[1]);
if (out.length > 20000) fail(`${out.length} files; Pages takes 20,000`);
for (const [f, n] of sizes) if (n > 25 * MiB) fail(`${f} is ${mib(n)}; Pages takes 25 MiB a file`);
const functionFile = out.find((f) => /(^|\/)functions\//.test(f));
if (functionFile) fail(`${functionFile} is a Pages Function; functions/ must never be copied into the static bundle`);
for (const f of out) if (/\.(fit|gpx|tcx|zip|gz|csv|xml)$/i.test(f) && f !== 'sitemap.xml') fail(`${f} is a raw activity file`);

const { terms, denied } = denylist();
if (!denied) fail(`no terms in ${DENY}, so nothing personal can be ruled out`);
for (const f of out) { const m = text(f).match(denied); if (m) fail(`${f} contains "${m[0]}" (var/private/site-denylist.txt)`); }
for (const f of out) if (/\b(?:127\.0\.0\.1|localhost):\d/.test(text(f))) fail(`${f} links a loopback address`);

// Every planet any file carries (a share code starts UEM: share.js's magic bytes 'PC' in base64url, then the version
// byte, so v1 is UEMB, v2 UEMC, and any later version is caught too): it must decode, and decoded it must hold no
// private term (a code is base64, so the scan above can't see into it) and no place.
const planets = new Map();
for (const f of out.filter((f) => /\.(html|js|json)$/.test(f))) for (const [code] of text(f).matchAll(/(?<![\w-])UEM[A-Za-z0-9_-][\w-]{8,}/g)) planets.set(code, f);
const leaks = [];
for (const [code, f] of planets) {
  let w;
  try { w = decodePlanet(code); } catch (e) { fail(`${f} carries a planet that won't decode (${e.message})`); }
  const m = JSON.stringify(w).match(denied);
  if (m) fail(`${f} carries a planet (week of ${w.week}) with "${m[0]}" in it (var/private/site-denylist.txt)`);
  leaks.push(...unplaced(w, `${f}: planet week ${w.week}`));
}
for (const f of out.filter((f) => f.endsWith('.json'))) leaks.push(...unplaced(JSON.parse(readFileSync(join(OUT, f), 'utf8')), f));
if (seed) leaks.push(...unplaced(seed, `planet/${V}/seed-week.js`));
if (leaks.length) fail(`a place, or a route that isn't a shape: ${leaks.slice(0, 5).join(', ')}`);

const total = sizes.reduce((s, [, n]) => s + n, 0);
console.log(`planet-home-build: ${relative(ROOT, OUT)} · ${out.length} files · ${mib(total)} (pages: ${pages.length} files; planet/: ${planet.size} traced from ink.html and the pages, in planet/${V}/, ${preload.size} preloaded${lastV && lastV !== V && carried.length ? `; planet/${lastV}/ kept from the last build` : ''})`);
console.log(`  largest: ${sizes.slice(0, 6).map(([f, n]) => `${f} ${mib(n)}`).join(' · ')}`);
console.log(`  checks: ${terms.length} private terms absent; ${planets.size} planets decoded, shape-only and clean; no coordinates in data; no raw activity files; no loopback links; no functions/ in static output`);

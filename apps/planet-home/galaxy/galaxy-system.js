/* Planet Creator — every week of the galaxy as its own small solar system, painted in the house's hand (galaxy.js
 * lays the galaxy; this lays each week's system in it).
 *
 * What a system says. RULES below says it in words, for the page's key and cards; systemOf(week) reads one week's
 * parts with no three.js at all, so the page can word them before there is a scene.
 *   the star     the week's own star, where galaxy.js draws its mark: its colour the week's sports by sessions
 *                (galaxy-data.js colorOf), its size the hours
 *   the planet   the week's own globe from the shelf (shelf/ryan/globe/: the planet alone, as its classic poster
 *                paints it, on a transparent square, its radius GLOBE of the side) laid on a ball lit by the star,
 *                its outline the globe's own (a marble's lumps, an ice giant's haze), with a real terminator, the
 *                night side let down into the void's blue and a rim of air on the lit limb; a lava world's open
 *                crust glows on its night side, a marble has no air (the race week's crowned world is lit as a rock)
 *   moons        one for each kind of training but lifting, in that sport's colour, bigger for more sessions of it;
 *                a swim's moon is water
 *   the belt     stones round the star for a week of two lifts or more: more lifts, more stones
 *   the comet    a week of forty miles or more (every sport's miles): its tail as long as the miles
 *   the ring     a race week's, round the planet, banded as the planet page's race ring, the finish a vermilion hair
 *   orbits       ink lines where the planet goes round its star (and, on the picked week, where its moons go round
 *                it). How wide and how tipped they are is the picture's, never the week's.
 *
 * Scale. A system is about two thirds of a week's step along its arm across, so neighbours never meet. Each part
 * comes in by its own size on the screen (an orbit from a few pixels, a planet from under one, the star's painted
 * disc once it is larger than the mark galaxy.js draws for it, the belt and the comet once there is room for them),
 * so the whole galaxy keeps its weeks as stars with a planet beside each, and a system resolves as the eye comes.
 *
 * The picked week (its focus, eased in over half a second). Its system turns to its planet: the planet comes to the
 * week's own place (its star's place in the galaxy, where the guide brings the eye, so the page's spot holds it), at
 * the size the page gives it (`big`: half the side of the still; the globe as large in it as in its classic still,
 * the week's `globe`, so the live planet's classic poster takes over from it in place), and its star stands off it
 * the way the globe's own light comes, beside the globe and in front of it (the planet page's rule: the star is
 * composed against the sheet), held below the top fifth of the page where a phone keeps its links;
 * the planet's orbit, its moons' and its ring turned to the eye the same way, its comet out past its star on the
 * far side from the planet. The quiet galaxy.js lays over the galaxy round a picked week passes its system by, and
 * its neighbours' along the arm mostly (a keep mask in the frame's alpha, galaxy-paint.js WARP_FRAG). As the eye
 * comes on in toward the planet (galaxy-dive.js), everything but the planet and its ring goes, so the live planet
 * takes over from a planet alone. Unpicked, every part stands in the galaxy as it is: the star on its mark, the
 * planet on its orbit on the far side of its star from the guide's eye (lit, seen nearly full), going round in half
 * an hour or so, the moons faster.
 *
 * In front and behind. The frame has no depth buffer (galaxy.js draws into one without), so each part works out,
 * per pixel, whether its own planet or the picked one stands in front of it: a moon or the ring behind the globe is
 * hidden by it, in front of it is laid over it; a planet behind its own star is hidden by the star's disc; an
 * orbit's ink is never laid across a planet's face.
 *
 * The parts' places live in one small float texture, a row a week (ROW), written each frame from the eye, the clock
 * and the focus; every kind of part is one instanced draw that reads it.
 *
 * createSystems({ THREE, galaxy, weeks, thumbOf, paintingOf, onLoad, screenOf }) adds its group to `galaxy` (thumbOf and
 * paintingOf: a week's globe picture at 96 px and whole; screenOf:
 * galaxy.js's screenOfPoint, a point of the galaxy as the hole's lens shows it on the page, CSS px) and returns
 *   update({ camera, time, dt, picked, scale, dpr, big, size })  each frame, the camera placed: picked the week or
 *       -1, scale device px per galaxy radius at a distance of one, dpr, big the picked still's half side (galaxy
 *       radii), size the drawing buffer; dt 0 (still, a capture) sets the focus at once
 *   reach(i)               galaxy radii round week i's star that its system spans (for picking)
 *   pickTarget(i, out)     where week i's planet stands once picked (world, into out) → half its still's side
 *   planetNow(i, out)      where week i's planet stands now (world, into out) → half its still's side now
 *   focus(i)               how far week i's system has turned to its planet (0 … 1)
 *   paint(i, source)       lay a canvas or ImageBitmap (the planet's seat square: its globe as large as in its classic
 *                          still) on week i's planet while it is near as large as then; null: its globe again
 *   load()                 fetch the paintings now (they come by themselves once a planet is near enough to see)
 *   dispose()
 */
import { SPORTS, R0, R1, WIND, onArm } from './galaxy-data.js';
import { pace } from '../planet/pace.js';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v) => clamp(v, 0, 1);
const smooth = (a, b, x) => { const s = clamp01((x - a) / (b - a)); return s * s * (3 - 2 * s); };
const ARM_STEP = ((R1 - R0) * Math.hypot(1, WIND)) / 52; // a week along an arm, galaxy radii (galaxy.js's own)

// ---------------------------------------------------------------- what a system says
export const BELT_LIFTS = 2, COMET_MILES = 40;
export const RULES = [
  { part: 'star', drawnAs: "the week's own star", rule: "its colour is the week's sports, by sessions (runs gold, rides blue-white, swims teal, yoga white, walks cream, football orange, lifting red); its size is the hours" },
  { part: 'planet', drawnAs: "the week's own painting from the shelf, as a planet", rule: 'every week has one, lit by its own star' },
  { part: 'moons', drawnAs: "a moon for each kind of training but lifting, in that sport's colour", rule: 'bigger for more sessions of it; a swim is a moon of water' },
  { part: 'belt', drawnAs: 'a belt of stones round the star', rule: `a week of ${BELT_LIFTS} lifts or more; more lifts, more stones` },
  { part: 'comet', drawnAs: 'a comet', rule: `a week of ${COMET_MILES} miles or more, every sport's miles together; its tail as long as the miles` },
  { part: 'ring', drawnAs: 'a ring round the planet', rule: "a race week's, as on the planet page" },
  { part: 'orbits', drawnAs: 'ink lines', rule: 'where the planet and its moons go; how wide and how tipped is only the picture, not the week' },
];

const MOON_SPORTS = SPORTS.filter((s) => s.key !== 'lift');
/** One week's system in parts (no three.js): its star, its moons (biggest first), its belt (the lifts, or 0), its
 *  comet (the miles, or 0) and its ring (the race, or null). `w` is a galaxy week (galaxy-data.js: stats, color). */
export function systemOf(w) {
  const s = w.stats || {};
  const moons = MOON_SPORTS.filter((sp) => (s[sp.key] || 0) > 0)
    .map((sp) => ({ key: sp.key, label: sp.label, n: s[sp.key], color: sp.color }))
    .sort((a, b) => b.n - a.n);
  return {
    star: { color: w.color, hours: (s.min || 0) / 60 },
    moons,
    belt: (s.lift || 0) >= BELT_LIFTS ? s.lift : 0,
    comet: (s.mi || 0) >= COMET_MILES ? s.mi : 0,
    ring: s.race || null,
  };
}

// a week's own salt (its date's, as galaxy-data.js salts its jitter), so its system is always its own
function saltOf(week, k) {
  let h = 2166136261 ^ (k * 2654435761);
  for (const c of week) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h ^= h >>> 13;
  return ((Math.imul(h, 0x5bd1e995) >>> 0) % 100000) / 100000;
}

// A globe picture's globe: its radius, as a share of the picture's side (lib/paint.js GLOBE paints it so); and a
// week's cell in the sheet of 96 px globe thumbnails every planet is drawn from.
const GLOBE = 0.42, CELL = 96;
// What a week's body asks of its planet's light (PLANET_FRAG iBody): air at the limb, a light of its own, an open crust
// that glows on the night side. A marble has no air; any other body, the race week's crowned world among them, is
// lit as a rock.
const LIGHT = { marble: [0, 0, 0], lava: [1, 0, 1] };

// The globe in a week's picture, read off its thumbnail's pixels (RGBA, n by n, the globe centred, the sheet round it
// transparent): where its own light comes from on the sheet (x right, y up) and how far round (the phase), its
// colour and the colour at its limb.
function readGlobe(px, n) {
  const c = (n - 1) / 2, R = GLOBE;
  const lum = (o) => (0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2]) / 255;
  let sw = 0, sx = 0, sy = 0, lit = 0, all = 0, ln = 0;
  const mean = [0, 0, 0], limb = [0, 0, 0];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const o = (y * n + x) * 4, r = Math.hypot(x - c, y - c) / n;
      if (r >= 0.92 * R || px[o + 3] < 128) continue;
      const l = lum(o), w = l * l;
      sw += w; sx += ((x - c) / n / R) * w; sy += ((y - c) / n / R) * w;
      all++;
      if (l > 0.32) lit++;
      for (let ch = 0; ch < 3; ch++) mean[ch] += px[o + ch] / 255;
      if (r > 0.78 * R) { ln++; for (let ch = 0; ch < 3; ch++) limb[ch] += px[o + ch] / 255; }
    }
  }
  const dx = sw ? sx / sw : 0, dy = sw ? sy / sw : 0, off = Math.hypot(dx, dy), conf = smooth(0.06, 0.18, off);
  // a globe lit from the front says nothing about the side: the house's own light, from the upper left
  let lx = -0.6, ly = 0.8;
  if (off > 1e-6) { lx += (dx / off - lx) * conf; ly += (-dy / off - ly) * conf; }
  const l = Math.hypot(lx, ly) || 1;
  const phase = 0.61 + (clamp(Math.acos(clamp((2 * lit) / Math.max(1, all) - 1, -1, 1)), 0.61, 2.45) - 0.61) * conf;
  return {
    lx: lx / l, ly: ly / l, phase,
    mean: mean.map((v) => v / Math.max(1, all)), limb: ln ? limb.map((v) => v / ln) : mean.map((v) => v / Math.max(1, all)),
  };
}

// ---------------------------------------------------------------- the paint
// The system table: ROW texels a week. S star (xyz, its disc's radius), P planet (xyz, its globe's radius), E1 E2
// the planet's orbit (E1 from the star to the planet, its radius; E2, the focus), MU MV the moons' plane (the first
// moon's orbit; the step out to each next), RN the ring's normal (the moons' radius), C the comet's head (its tail's
// length), B1 B2 the comet's orbit (toward perihelion, its distance; the eccentricity), K (how near the eye is: 1 far,
// 0 at the planet; half the still's side; the belt's radius in the orbit's; the orbit's minor axis in its major), Q
// (how far the quiet round a picked week passes it by: 1 the picked week, less its neighbours along the arm, 0 the rest).
const ROW = 12, T_S = 0, T_P = 1, T_E1 = 2, T_E2 = 3, T_MU = 4, T_MV = 5, T_RN = 6, T_C = 7, T_B1 = 8, T_B2 = 9, T_K = 10, T_Q = 11;

const COMMON = /* glsl */ `
uniform sampler2D uSys;
uniform vec4 uFocus;
uniform float uFocusWeek, uScale, uDpr, uTime;
uniform vec2 uRes;
varying float vFoc;   // how far the quiet round a picked week passes it by (T_Q)
#ifdef MASK
// the keep mask (galaxy-paint.js WARP_FRAG): the picked system's cover (and less of its neighbours') laid into the
// frame's alpha, so the quiet the galaxy keeps round a picked week passes them by; their color is left alone, and
// only the systems kept draw at all (the rest are let go at the top of the vertex shader)
#define CULL(w) vFoc = sysAt(w, ${T_Q}).x; if (vFoc < 0.01) { gl_Position = vec4(0.0, 0.0, -2.0, 1.0); return; }
#define PAINTED(c, a) gl_FragColor = vec4(0.0, 0.0, 0.0, (a) * vFoc)
#else
#define CULL(w)
#define PAINTED(c, a) gl_FragColor = vec4((c), (a))
#endif
vec4 sysAt(float w, int k){ return texelFetch(uSys, ivec2(k, int(w + 0.5)), 0); }
float sH(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float sN(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(sH(i), sH(i + vec2(1.0, 0.0)), f.x), mix(sH(i + vec2(0.0, 1.0)), sH(i + vec2(1.0, 1.0)), f.x), f.y);
}
// how far a point v (view space) is hidden behind the ball s (view-space centre, radius; none when the radius is 0):
// 1 behind it, 0 clear of it or in front of it, soft over a pixel at the ball's limb
float behind(vec3 v, vec4 s){
  if (s.w <= 0.0 || dot(s.xyz, s.xyz) <= s.w * s.w) return 0.0;
  float L = length(v);
  vec3 d = v / L;
  float b = dot(d, s.xyz), h = b * b - dot(s.xyz, s.xyz) + s.w * s.w;
  if (h <= 0.0 || b - sqrt(h) >= L * 0.9999) return 0.0;
  return smoothstep(0.0, 2.0 * s.w * max(1e-6, -s.z / uScale), h);
}
// how far the line of sight through v crosses the ball s at all, in front of v or behind it (soft at its limb): an
// orbit's ink is never laid across a planet's face
float across(vec3 v, vec4 s){
  if (s.w <= 0.0 || dot(s.xyz, s.xyz) <= s.w * s.w) return 0.0;
  vec3 d = normalize(v);
  float b = dot(d, s.xyz), h = b * b - dot(s.xyz, s.xyz) + s.w * s.w;
  return b > 0.0 ? smoothstep(0.0, 2.0 * s.w * max(1e-6, -s.z / uScale), h) : 0.0;
}
`;

// The orbits: a ribbon a pixel or so wide round each path, its width held on the screen however near the eye is,
// laid in the pale ink the house draws on the dark with and broken where the brush ran dry. Kind 0 is the planet's
// path round its star (an ellipse on the picked week, drawn for the eye), 1 … 7 its moons' round it (drawn on the
// picked week only: round every small planet they made targets of them), 9 the comet's long ellipse with its star at
// a focus (not drawn on the picked week, whose comet's way runs off the sheet).
const ORBIT_VERT = /* glsl */ `
${COMMON}
attribute float iWeek, iKind, iSeed;
varying float vU, vSide, vA, vSeed, vLen;
varying vec3 vView;
varying vec4 vPlanet;
vec3 pathAt(float th, vec3 C, vec3 A, vec3 B, float r, float k, float e){
  float rr = r * (1.0 + e) / (1.0 + e * cos(th));
  return C + rr * (cos(th) * A + k * sin(th) * B);
}
void main(){
  CULL(iWeek)
  vec4 tS = sysAt(iWeek, ${T_S}), tP = sysAt(iWeek, ${T_P}), tK = sysAt(iWeek, ${T_K});
  vec3 C = tS.xyz, A, B;
  float r, k = 1.0, e = 0.0, fade, from, to;   // fade: its ink's strength; from, to: the radius on the screen it comes in over
  if (iKind < 0.5) { vec4 a = sysAt(iWeek, ${T_E1}), b = sysAt(iWeek, ${T_E2}); A = a.xyz; B = b.xyz; r = a.w; k = tK.w; fade = 0.75 + 0.25 * b.w; from = 1.5; to = 4.0; }
  else if (iKind < 8.5) { vec4 a = sysAt(iWeek, ${T_MU}), b = sysAt(iWeek, ${T_MV}); C = tP.xyz; A = a.xyz; B = b.xyz; r = a.w + b.w * (iKind - 1.0); fade = 0.6 * sysAt(iWeek, ${T_E2}).w; from = 4.0; to = 9.0; }
  else { vec4 a = sysAt(iWeek, ${T_B1}), b = sysAt(iWeek, ${T_B2}); A = a.xyz; B = b.xyz; r = a.w; e = b.w; fade = 0.55 * (1.0 - sysAt(iWeek, ${T_E2}).w); from = 6.0; to = 12.0; }
  float th = position.x * 6.2831853;
  vec4 mv = modelViewMatrix * vec4(pathAt(th, C, A, B, r, k, e), 1.0);
  vec4 mv2 = modelViewMatrix * vec4(pathAt(th + 0.01, C, A, B, r, k, e), 1.0);
  vec4 c = projectionMatrix * mv, c2 = projectionMatrix * mv2;
  vec2 s = c.xy / c.w * uRes * 0.5, s2 = c2.xy / c2.w * uRes * 0.5;
  vec2 dir = normalize(s2 - s + vec2(1e-6, 0.0));
  float w = 0.55 * uDpr + 0.9;   // half its width, device px: the ink and a pixel to soften it
  c.xy += vec2(-dir.y, dir.x) * position.y * w / (uRes * 0.5) * c.w;
  vec4 mc = modelViewMatrix * vec4(C, 1.0);
  float px = r * uScale / max(1e-5, -mc.z) / uDpr;   // its radius on the screen, CSS px
  vA = smoothstep(from, to, px) * fade * tK.x;
  vU = position.x;
  vSide = position.y * w;
  vSeed = iSeed;
  vLen = 6.2831853 * px;
  vView = mv.xyz;
  vPlanet = vec4((modelViewMatrix * vec4(tP.xyz, 1.0)).xyz, tP.w);
  gl_Position = vA > 0.002 && mv.z < 0.0 && mv2.z < 0.0 ? c : vec4(0.0, 0.0, -2.0, 1.0);
}
`;
const ORBIT_FRAG = /* glsl */ `
${COMMON}
uniform vec3 uInk;
varying float vU, vSide, vA, vSeed, vLen;
varying vec3 vView;
varying vec4 vPlanet;
void main(){
  float a = 1.0 - smoothstep(0.55 * uDpr - 0.5, 0.55 * uDpr + 0.5, abs(vSide));
  // the brush runs dry in places along it, every ten pixels or so whatever the path's size
  float dry = sN(vec2(vU * vLen / 11.0 + vSeed * 17.0, vSeed * 3.0));
  a *= vA * (0.3 + 0.7 * smoothstep(0.3, 0.62, dry));
  // never across a planet's face, nor the outline its globe has past its ball (a range, a marble's lump, its haze)
  a *= (1.0 - across(vView, vec4(vPlanet.xyz, 1.08 * vPlanet.w))) * (1.0 - across(vView, vec4(uFocus.xyz, 1.08 * uFocus.w)));
  if (a < 0.003) discard;
  PAINTED(uInk, a * 0.42);
}
`;

// The stars: the week's own star as the planet page paints one (system.js): a disc of the week's colour with its
// middle lifted off and the pigment pooled at the rim, and round it a fan of dry-brush spokes, held to a pixel or a
// few however large it grows, that turns very slowly. It shows once it is larger than galaxy.js's mark for it.
const STAR_Q = 3.4;
const STAR_VERT = /* glsl */ `
${COMMON}
attribute float iWeek, iSeed;
attribute vec3 iColor;
varying vec2 vQ;
varying vec3 vColor;
varying float vA, vPx, vSeed;
void main(){
  CULL(iWeek)
  vec4 tS = sysAt(iWeek, ${T_S}), tK = sysAt(iWeek, ${T_K});
  vec4 mv = modelViewMatrix * vec4(tS.xyz, 1.0);
  float px = tS.w * uScale / max(1e-5, -mv.z);
  vA = smoothstep(2.2, 4.8, px / uDpr) * tK.x;
  vPx = px;
  vColor = iColor;
  vSeed = iSeed;
  vQ = position.xy * ${STAR_Q.toFixed(1)};
  mv.xy += position.xy * ${STAR_Q.toFixed(1)} * tS.w;
  gl_Position = vA > 0.002 && mv.z < 0.0 ? projectionMatrix * mv : vec4(0.0, 0.0, -2.0, 1.0);
}
`;
const STAR_FRAG = /* glsl */ `
${COMMON}
varying vec2 vQ;
varying vec3 vColor;
varying float vA, vPx, vSeed;
void main(){
  float r = length(vQ);
  if (r > ${STAR_Q.toFixed(1)}) discard;
  float px = 1.0 / max(vPx, 0.5);
  float ang = atan(vQ.y, vQ.x);
  vec2 cs = vec2(cos(ang), sin(ang));
  float wob = sN(cs * 2.6 + vSeed) - 0.5, wob2 = sN(cs * 7.3 + vSeed * 2.9) - 0.5;
  float rd = 1.0 + 0.07 * wob + 0.03 * wob2;
  float disc = 1.0 - smoothstep(rd - px, rd + px, r);
  vec3 paper = vec3(1.0, 0.97, 0.90);
  vec3 body = mix(vColor, paper, 0.16);
  // the middle lifted off with a damp brush; the pigment pooled at the rim, where the hand skipped twice round
  float core = 1.0 - smoothstep(0.28, 0.62 + 0.14 * wob, r);
  float rim = smoothstep(rd - 0.28 - 0.1 * wob2, rd - 0.05, r) * disc * smoothstep(0.15, 0.5, sN(vec2(ang * 2.3, vSeed)));
  vec3 cd = mix(body, mix(body, paper, 0.82), core * 0.9);
  cd = mix(cd, vColor * vec3(1.0, 0.80, 0.60), rim * 0.55);
  // the fan: a spoke a brush-load, each its own length and weight, thinning as it runs out (none on a small star)
  float cor = 0.0;
  for (int i = 0; i < 14; i++) {
    if (vPx < 3.0 * uDpr) break;
    float fi = float(i);
    float h1 = sH(vec2(fi, vSeed)), h2 = sH(vec2(fi + 21.0, vSeed)), h3 = sH(vec2(fi + 47.0, vSeed));
    float a = (fi + 0.5 * h1) / 14.0 * 6.2831853 + 0.02 * uTime;
    float da = abs(atan(sin(ang - a), cos(ang - a)));
    float len = 0.25 + 1.55 * h2 * h2;
    float w = (1.0 + 2.4 * h3 * h3) * px * (1.0 - 0.75 * clamp((r - 1.0) / len, 0.0, 1.0));
    float m = (1.0 - smoothstep(w - px, w + px, da * r)) * (1.0 - smoothstep(1.0 + len - 0.12, 1.0 + len, r)) * smoothstep(0.86, 1.0, r);
    cor = max(cor, m * (0.35 + 0.65 * h3));
  }
  cor *= (0.45 + 0.75 * smoothstep(0.2, 0.85, sN(vec2(ang * 1.5, r * 1.7) + vSeed))) * smoothstep(3.0, 7.0, vPx / uDpr);
  float glow = exp(-1.7 * max(r - 1.0, 0.0)) * (1.0 - disc) * 0.22;
  vec3 c = mix(mix(vColor, paper, 0.45), cd, disc);
  float a = max(disc, max(cor * 0.8, glow)) * vA;
  if (a < 0.004) discard;
  PAINTED(c, a);
}
`;

// The planets: each week's globe picture on a ball facing the eye (its 96 px thumbnail; the picked one its whole
// picture, or for a while what galaxy-dive.js lays there), the ball's limb the picture's GLOBE exactly and its
// outline the globe's own (the picture's coverage), lit from its star: a real terminator, the night side let down
// into the void's blue (never black: the globe has its own light, which the star's is set to agree with on the picked
// planet), air on the lit limb and a thin rim of it outside. Under a few pixels it is a dot of the globe's own
// colour, and under one it fades rather than shrinks. iBody is what the week's body asks of that light: (air, a light
// of its own, an open crust that glows).
const PLANET_VERT = /* glsl */ `
${COMMON}
attribute float iWeek;
attribute vec2 iCell;
attribute vec3 iMean, iLimb, iStar, iBody;
uniform float uTex;
varying vec2 vQ, vCell;
varying vec3 vL, vMean, vLimb, vStar, vCentre, vBody;
varying float vA, vPx, vTex, vWeek, vG;
varying vec4 vSun;
void main(){
  CULL(iWeek)
  vec4 tS = sysAt(iWeek, ${T_S}), tP = sysAt(iWeek, ${T_P});
  vec4 mv = modelViewMatrix * vec4(tP.xyz, 1.0), sun = modelViewMatrix * vec4(tS.xyz, 1.0);
  float g = tP.w, px = g * uScale / max(1e-5, -mv.z), floorPx = 1.1 * uDpr;
  float shown = max(px, floorPx);                        // drawn no smaller than about a pixel...
  vA = smoothstep(0.25, 0.7, px / uDpr) * min(1.0, (px * px) / (floorPx * floorPx) + 0.35);   // ...but fainter
  vPx = shown;
  float hs = shown * 1.22 * -mv.z / uScale;   // the quad's half side, galaxy radii
  vQ = position.xy * 1.22;
  vec4 corner = mv;
  corner.xy += position.xy * hs;
  vL = normalize(sun.xyz - mv.xyz);
  vSun = vec4(sun.xyz, tS.w);
  vCentre = mv.xyz;
  vG = g;
  vTex = smoothstep(2.0, 4.5, px / uDpr) * uTex;
  vCell = iCell; vMean = iMean; vLimb = iLimb; vStar = iStar; vBody = iBody; vWeek = iWeek;
  gl_Position = vA > 0.002 && mv.z < 0.0 ? projectionMatrix * corner : vec4(0.0, 0.0, -2.0, 1.0);
}
`;
const PLANET_FRAG = /* glsl */ `
${COMMON}
uniform sampler2D uAtlas, uFull, uSnap;
uniform vec2 uGrid;
uniform float uFullWeek, uFullOn, uSnapWeek, uSnapOn, uSnapFlip, uSnapCrop;
uniform vec3 uNight;
varying vec2 vQ, vCell;
varying vec3 vL, vMean, vLimb, vStar, vCentre, vBody;
varying float vA, vPx, vTex, vWeek, vG;
varying vec4 vSun;
void main(){
  float rr = length(vQ), px = 1.0 / max(vPx, 0.5);
  if (rr > 1.22) discard;
  float disc = 1.0 - smoothstep(1.0 - px, 1.0 + px, rr);
  vec3 n = vec3(vQ, sqrt(max(0.0, 1.0 - rr * rr))) / max(rr, 1.0);
  // in its globe picture (y down), held inside its cell of the sheet; premultiplied, so its edge filters clean
  vec2 uv = 0.5 + vec2(vQ.x, -vQ.y) * ${GLOBE.toFixed(2)};
  vec2 cell = (vCell + clamp(uv, ${(0.5 / CELL).toFixed(5)}, ${(1 - 0.5 / CELL).toFixed(5)})) / uGrid;
  vec4 globe = texture2D(uAtlas, vec2(cell.x, 1.0 - cell.y));
  if (uFullOn > 0.0 && abs(vWeek - uFullWeek) < 0.5) globe = mix(globe, texture2D(uFull, vec2(uv.x, 1.0 - uv.y)), uFullOn);
  vec3 paint = globe.rgb / max(globe.a, 1e-3);
  float shape = globe.a;
  // the planet as the dive handed it back: its seat square, opaque, the globe in it as large as in its classic still
  if (uSnapOn > 0.0 && abs(vWeek - uSnapWeek) < 0.5) {
    vec2 su = 0.5 + vec2(vQ.x, -vQ.y) * uSnapCrop;
    paint = mix(paint, texture2D(uSnap, vec2(su.x, mix(1.0 - su.y, su.y, uSnapFlip))).rgb, uSnapOn);
    shape = mix(shape, disc, uSnapOn);
  }
  vec3 albedo = mix(vMean, paint, vTex);
  shape = mix(disc, shape, vTex);
  float l = dot(n, vL);
  // the light's side shows once the planet is large enough to carry one: a dot is its globe's colour, lit; a star
  // is lit all round by its own
  float day = max(mix(1.0, smoothstep(-0.12, 0.30, l), smoothstep(3.0, 10.0, vPx / uDpr)), vBody.y);
  vec3 c = mix(albedo * 0.30 + uNight * 0.55, albedo * mix(vec3(1.0), vStar, 0.10), day);
  // a lava world's open crust keeps its glow on the night side
  c = mix(c, albedo, vBody.z * smoothstep(0.25, 0.5, albedo.r - albedo.b) * smoothstep(0.5, 0.85, albedo.r) * (1.0 - day));
  // air: a breath of it over the lit limb, the dark limb a shade darker (a star's is its own fire)
  float limb = pow(1.0 - n.z, 3.0);
  vec3 air = mix(vLimb, vec3(0.90, 0.94, 1.0), 0.5 - 0.5 * vBody.y);
  c = mix(c, air, limb * 0.42 * smoothstep(-0.1, 0.6, l) * vBody.x);
  c *= 1.0 - 0.25 * limb * (1.0 - day);
  // and a thin rim of it outside the globe, brightest where the light grazes
  float lr = dot(normalize(vec3(vQ, 0.0) + 1e-5), vL);
  float rim = exp(-pow((rr - 1.0) / 0.055, 2.0)) * smoothstep(1.0 - px, 1.0 + px, rr) * smoothstep(-0.3, 0.5, max(lr, vBody.y)) * smoothstep(3.0, 8.0, vPx / uDpr) * vBody.x;
  float a = max(shape, rim * 0.75);
  c = mix(air, c, shape);
  // behind its own star's disc, or behind the picked planet (unless it is the picked planet)
  vec3 surf = vCentre + vec3(vQ, n.z) * vG;
  a *= 1.0 - behind(surf, vSun);
  if (abs(vWeek - uFocusWeek) > 0.5) a *= 1.0 - behind(surf, uFocus);
  a *= vA;
  if (a < 0.003) discard;
  PAINTED(c, a);
}
`;

// The moons: small balls of their sport's pigment, lit from the star in two washes and a shade (the terminator a
// brush's edge, not a blur); a swim's moon is water, its currents drifting across it.
const MOON_VERT = /* glsl */ `
${COMMON}
attribute float iWeek, iK, iN, iWater, iSeed, iPhase, iSpeed;
attribute vec3 iColor;
varying vec2 vQ;
varying vec3 vL, vColor, vCentre;
varying float vA, vPx, vWater, vSeed, vR;
varying vec4 vPlanet;
void main(){
  CULL(iWeek)
  vec4 tS = sysAt(iWeek, ${T_S}), tP = sysAt(iWeek, ${T_P}), tMu = sysAt(iWeek, ${T_MU}), tMv = sysAt(iWeek, ${T_MV});
  vec4 tR = sysAt(iWeek, ${T_RN}), tK = sysAt(iWeek, ${T_K});
  float r = tMu.w + tMv.w * iK, th = iPhase + iSpeed * uTime;
  vec3 p = tP.xyz + r * (cos(th) * tMu.xyz + sin(th) * tMv.xyz);
  float rm = tR.w * (1.0 + 0.35 * sqrt(iN));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float px = rm * uScale / max(1e-5, -mv.z), floorPx = 0.9 * uDpr, shown = max(px, floorPx);
  vA = smoothstep(0.2, 0.6, px / uDpr) * min(1.0, (px * px) / (floorPx * floorPx) + 0.3) * tK.x;
  vPx = shown;
  vQ = position.xy * 1.15;
  vec4 corner = mv;
  corner.xy += position.xy * 1.15 * shown * -mv.z / uScale;
  vL = normalize((modelViewMatrix * vec4(tS.xyz, 1.0)).xyz - mv.xyz);
  vPlanet = vec4((modelViewMatrix * vec4(tP.xyz, 1.0)).xyz, tP.w);
  vCentre = mv.xyz;
  vR = shown * -mv.z / uScale;
  vColor = iColor; vWater = iWater; vSeed = iSeed;
  gl_Position = vA > 0.002 && mv.z < 0.0 ? projectionMatrix * corner : vec4(0.0, 0.0, -2.0, 1.0);
}
`;
const MOON_FRAG = /* glsl */ `
${COMMON}
uniform vec3 uNight;
varying vec2 vQ;
varying vec3 vL, vColor, vCentre;
varying float vA, vPx, vWater, vSeed, vR;
varying vec4 vPlanet;
void main(){
  float rr = length(vQ), px = 1.0 / max(vPx, 0.5);
  if (rr > 1.15) discard;
  float disc = 1.0 - smoothstep(1.0 - px, 1.0 + px, rr);
  vec3 n = vec3(vQ, sqrt(max(0.0, 1.0 - rr * rr)));
  float l = dot(n, vL);
  float day = 0.72 * smoothstep(-0.06, 0.10, l) + 0.28 * smoothstep(0.38, 0.56, l);
  vec3 pig = mix(vColor, vec3(0.93, 0.90, 0.84), 0.22);
  if (vWater > 0.5) {
    float cur = sN(vec2(n.x * 4.0 + vSeed * 7.0 + uTime * 0.015, n.y * 9.0 + vSeed));
    pig = mix(vec3(0.16, 0.42, 0.50), vec3(0.62, 0.84, 0.86), smoothstep(0.45, 0.78, cur));
  }
  vec3 c = mix(pig * 0.20 + uNight * 0.5, pig, day);
  c *= 1.0 - 0.2 * pow(1.0 - n.z, 2.0);
  vec3 surf = vCentre + vec3(vQ, n.z) * vR;
  float a = disc * vA * (1.0 - behind(surf, vPlanet)) * (1.0 - behind(surf, uFocus));
  if (a < 0.003) discard;
  PAINTED(c, a);
}
`;

// The belts: stones round the star inside the planet's orbit, each a dab knocked off round and lit on the side
// toward its star, the belt turning slowly; it comes in once it is wide enough on the screen to be a belt.
const BELT_VERT = /* glsl */ `
${COMMON}
attribute float aWeek, aAng, aRad, aH, aSize, aSeed;
varying float vA, vSeed;
varying vec2 vToSun;
void main(){
  CULL(aWeek)
  vec4 tS = sysAt(aWeek, ${T_S}), tP = sysAt(aWeek, ${T_P}), tE1 = sysAt(aWeek, ${T_E1}), tE2 = sysAt(aWeek, ${T_E2}), tK = sysAt(aWeek, ${T_K});
  vec3 nrm = cross(tE1.xyz, tE2.xyz);
  float a = tE1.w, rb = a * (tK.z + 0.055 * aRad), th = aAng + 0.012 * uTime * (1.0 - 0.15 * aRad);
  vec3 p = tS.xyz + rb * (cos(th) * tE1.xyz + tK.w * sin(th) * tE2.xyz) + nrm * (a * 0.028 * aH);
  vec4 mv = modelViewMatrix * vec4(p, 1.0), smv = modelViewMatrix * vec4(tS.xyz, 1.0);
  float wide = rb * uScale / max(1e-5, -smv.z) / uDpr;
  float px = a * 0.0095 * aSize * uScale / max(1e-5, -mv.z);
  vA = smoothstep(9.0, 18.0, wide) * tK.x * clamp(px / (0.8 * uDpr), 0.3, 1.0);
  vA *= (1.0 - behind(mv.xyz, vec4((modelViewMatrix * vec4(tP.xyz, 1.0)).xyz, tP.w))) * (1.0 - behind(mv.xyz, uFocus));
  gl_PointSize = max(2.0 * px, 1.6 * uDpr) + 1.0;
  vec4 c0 = projectionMatrix * mv, c1 = projectionMatrix * smv;
  vToSun = normalize((c1.xy / c1.w - c0.xy / c0.w) * uRes + vec2(1e-5, 0.0));
  vSeed = aSeed;
  gl_Position = vA > 0.003 && mv.z < 0.0 ? c0 : vec4(0.0, 0.0, -2.0, 1.0);
}
`;
const BELT_FRAG = /* glsl */ `
${COMMON}
varying float vA, vSeed;
varying vec2 vToSun;
void main(){
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  q.y = -q.y;
  float ang = atan(q.y, q.x);
  float edge = 0.74 + 0.26 * sN(vec2(ang * 1.2 + vSeed * 9.0, vSeed));
  float d = length(q) / edge;
  if (d > 1.0) discard;
  float lit = 0.5 + 0.5 * dot(normalize(q + 1e-4), vToSun);
  vec3 c = mix(vec3(0.21, 0.20, 0.26), vec3(0.74, 0.67, 0.56), smoothstep(0.32, 0.72, lit));
  PAINTED(c, vA * (1.0 - smoothstep(0.7, 1.0, d)));
}
`;

// The rings: a race week's, round its planet, as the planet page bands its race ring (1.25 to 2.3 globe radii):
// washes of paper, warm and mineral with the cool toward its rim, a Cassini division where the race was halved and
// the finish line a vermilion hair just outside, the globe's shadow across it and its unlit face dim.
const RING_IN = 1.25, RING_OUT = 2.3;
const RING_VERT = /* glsl */ `
${COMMON}
attribute float iWeek, iSeed;
varying float vV, vA, vSeed;
varying vec3 vView, vNv, vLv;
varying vec4 vPlanet;
void main(){
  CULL(iWeek)
  vec4 tS = sysAt(iWeek, ${T_S}), tP = sysAt(iWeek, ${T_P}), tR = sysAt(iWeek, ${T_RN});
  vec3 N = normalize(tR.xyz);
  vec3 A = normalize(cross(N, abs(N.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), B = cross(N, A);
  float th = position.x * 6.2831853, rad = tP.w * mix(${RING_IN.toFixed(2)}, ${RING_OUT.toFixed(2)}, position.y);
  vec4 mv = modelViewMatrix * vec4(tP.xyz + rad * (cos(th) * A + sin(th) * B), 1.0);
  vec4 pc = modelViewMatrix * vec4(tP.xyz, 1.0);
  vA = smoothstep(2.0, 5.0, tP.w * ${RING_OUT.toFixed(2)} * uScale / max(1e-5, -pc.z) / uDpr);
  vV = position.y;
  vSeed = iSeed;
  vView = mv.xyz;
  vNv = normalize((modelViewMatrix * vec4(N, 0.0)).xyz);
  vLv = normalize((modelViewMatrix * vec4(tS.xyz, 1.0)).xyz - pc.xyz);
  vPlanet = vec4(pc.xyz, tP.w);
  gl_Position = vA > 0.002 && mv.z < 0.0 ? projectionMatrix * mv : vec4(0.0, 0.0, -2.0, 1.0);
}
`;
const RING_FRAG = /* glsl */ `
${COMMON}
varying float vV, vA, vSeed;
varying vec3 vView, vNv, vLv;
varying vec4 vPlanet;
void main(){
  float v = vV, fw = fwidth(v);
  float n1 = sN(vec2(v * 21.0, vSeed)), n2 = sN(vec2(v * 63.0, vSeed + 3.0));
  float dens = (0.5 + 0.35 * n1 + 0.15 * n2) * smoothstep(0.0, 0.05 + fw, v) * (1.0 - smoothstep(0.90 - fw, 0.935 + fw, v));
  dens *= 1.0 - 0.92 * (1.0 - smoothstep(0.012 + fw, 0.032 + fw, abs(v - 0.56)));
  vec3 paper = vec3(0.90, 0.86, 0.78), warm = vec3(0.80, 0.60, 0.40), mineral = vec3(0.60, 0.56, 0.50), cool = vec3(0.38, 0.42, 0.52);
  vec3 c = mix(mix(warm, paper, smoothstep(0.3, 0.75, n1)), mix(mineral, cool, n2), smoothstep(0.5, 0.95, v) * 0.65);
  float fin = 1.0 - smoothstep(0.004 + fw, 0.012 + fw, abs(v - 0.968));
  c = mix(c, vec3(0.86, 0.30, 0.18), fin);
  dens = max(dens, fin * 0.9);
  // its lit face toward the eye, or its unlit one
  float lit = dot(vNv, vLv) * dot(vNv, -vView) > 0.0 ? 1.0 : 0.42;
  // the globe's shadow across it: the way from here to the star passes through the globe
  vec3 oc = vView - vPlanet.xyz;
  float b = dot(oc, vLv), h = b * b - dot(oc, oc) + vPlanet.w * vPlanet.w;
  float shade = h > 0.0 && -b > 0.0 ? smoothstep(0.0, 0.08 * vPlanet.w * vPlanet.w, h) : 0.0;
  c *= lit * (1.0 - 0.72 * shade);
  float a = dens * 0.86 * vA * (1.0 - behind(vView, vPlanet)) * (1.0 - behind(vView, uFocus));
  if (a < 0.003) discard;
  PAINTED(c, a);
}
`;

// The comets: a head in its coma and two tails swept straight away from the star (the dust broad, warm and curving
// a little, the ion narrow, straight and blue), combed by the brush along their length; laid on the screen as one
// stroke from the head, long as the week's miles and foreshortened as its way out from the star is.
const COMET_VERT = /* glsl */ `
${COMMON}
attribute float iWeek, iSeed;
varying vec2 vP;
varying float vA, vSeed, vLen, vComa;
void main(){
  CULL(iWeek)
  vec4 tS = sysAt(iWeek, ${T_S}), tP = sysAt(iWeek, ${T_P}), tC = sysAt(iWeek, ${T_C}), tK = sysAt(iWeek, ${T_K});
  vec3 away = normalize(tC.xyz - tS.xyz);
  vec4 h = modelViewMatrix * vec4(tC.xyz, 1.0), e = modelViewMatrix * vec4(tC.xyz + away * tC.w, 1.0);
  vec4 ch = projectionMatrix * h, ce = projectionMatrix * e;
  vec2 sh = ch.xy / ch.w * uRes * 0.5, se = ce.xy / ce.w * uRes * 0.5;
  vec2 ax = se - sh;
  float len = length(ax);
  vec2 dir = len > 1e-3 ? ax / len : vec2(1.0, 0.0), nrm = vec2(-dir.y, dir.x);
  float coma = max(1.6 * uDpr, 0.035 * len), wide = max(2.0 * coma, 0.2 * len);
  float u = position.x * 0.5 + 0.5, along = mix(-2.5 * coma, len, u), across = position.y * mix(2.5 * coma, wide, u);
  vec2 s = sh + dir * along + nrm * across;
  vP = vec2(along, across);
  vLen = max(len, 1e-3);
  vComa = coma;
  vSeed = iSeed;
  vA = smoothstep(6.0, 16.0, len / uDpr) * tK.x;
  vA *= (1.0 - behind(h.xyz, vec4((modelViewMatrix * vec4(tP.xyz, 1.0)).xyz, tP.w))) * (1.0 - behind(h.xyz, uFocus));
  gl_Position = vA > 0.002 && h.z < 0.0 && e.z < 0.0 ? vec4(s / (uRes * 0.5) * ch.w, ch.z, ch.w) : vec4(0.0, 0.0, -2.0, 1.0);
}
`;
const COMET_FRAG = /* glsl */ `
${COMMON}
varying vec2 vP;
varying float vA, vSeed, vLen, vComa;
void main(){
  float x = vP.x, y = vP.y, t = clamp(x / vLen, 0.0, 1.0), on = smoothstep(-0.5 * vComa, 0.5 * vComa, x);
  float coma = exp(-(x * x + y * y) / (vComa * vComa));
  float yd = y + 0.10 * vLen * t * t, wd = 0.9 * vComa + 0.14 * vLen * t;
  float dust = exp(-pow(yd / wd, 2.0)) * (1.0 - t) * on * (0.55 + 0.45 * sN(vec2(t * 16.0 + vSeed, yd / wd * 2.5)));
  float wi = 0.45 * vComa + 0.025 * vLen * t;
  float ion = exp(-pow(y / wi, 2.0)) * (1.0 - 0.85 * t) * on * (0.6 + 0.4 * sN(vec2(t * 30.0 - vSeed, 2.0)));
  vec3 c = (vec3(1.0, 0.97, 0.90) * coma + vec3(0.95, 0.88, 0.74) * dust * 0.8 + vec3(0.62, 0.78, 1.0) * ion * 0.7) / max(1e-3, coma + dust * 0.8 + ion * 0.7);
  float a = clamp(coma + dust * 0.6 + ion * 0.5, 0.0, 1.0) * vA;
  if (a < 0.003) discard;
  PAINTED(c, a);
}
`;

// ---------------------------------------------------------------- the systems
export function createSystems({ THREE, galaxy, weeks: W, thumbOf, paintingOf, onLoad, screenOf }) {
  const N = W.length, arms = Math.max(...W.map((w) => w.arm)) + 1;
  const parts = W.map(systemOf);
  const maxMin = Math.max(1, ...W.map((w) => w.stats.min || 0));
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const UP = V(0, 1, 0);

  // ---- each week's own system, as it stands unpicked (galaxy radii, in the galaxy's own frame)
  const H0 = 0.1 * ARM_STEP; // half the side of the still a planet is laid from
  const sys = W.map((w, i) => {
    const s = (k) => saltOf(w.week, 40 + k), p = parts[i];
    const [ax, az] = onArm(w.t - 0.002, w.arm, arms), [bx, bz] = onArm(w.t + 0.002, w.arm, arms);
    const et = V(bx - ax, 0, bz - az).normalize(); // along the arm, the way time goes (left to right for the guide)
    const ec = V(-et.z, 0, et.x); // level, toward the guide's eye
    // the planet's orbit, tipped toward that eye so it opens to it, and leaned a little, its own way
    const tip = 0.45 + 0.35 * s(0), lean = (s(1) - 0.5) * 0.4;
    const n0 = ec.clone().multiplyScalar(Math.sin(tip)).addScaledVector(UP, Math.cos(tip)).applyAxisAngle(ec, lean);
    const e1 = et.clone().applyAxisAngle(ec, lean), e2 = n0.clone().cross(e1).normalize();
    // the moons' plane, tipped off the orbit's; the ring's off it the other way
    const mt = 0.25 + 0.4 * s(2);
    const mu = e1.clone().applyAxisAngle(e2, (s(3) - 0.5) * 0.6), mv = e2.clone().applyAxisAngle(mu, mt).normalize();
    const rn = n0.clone().applyAxisAngle(e1, -0.35 - 0.3 * s(4)).normalize();
    // the comet's orbit: turned in the plane and tipped out of it
    const kk = TAU * s(5), tau = 0.25 + 0.35 * s(6);
    const b1 = e1.clone().multiplyScalar(Math.cos(kk)).addScaledVector(e2, Math.sin(kk));
    const b2 = e2.clone().multiplyScalar(Math.cos(kk)).addScaledVector(e1, -Math.sin(kk)).applyAxisAngle(b1, tau);
    const hours = clamp01((w.stats.min || 0) / maxMin) ** 0.7;
    return {
      pos: V(...w.pos), et, ec, e1, e2, n0, mu, mv, rn, b1, b2,
      a0: (0.30 + 0.09 * s(7)) * ARM_STEP,
      rs0: (0.028 + 0.034 * hours) * ARM_STEP, hours,
      // on the far side of its star from the guide's eye (e2 is away from it and up), a little to one side; round in
      // half an hour or so
      th0: Math.PI / 2 + (s(8) - 0.5) * 1.6, om: TAU / (1500 + 1500 * s(9)),
      nu0: (s(10) < 0.5 ? -1 : 1) * (0.5 + 0.7 * s(11)), nuW: TAU / (240 + 240 * s(12)),
      tail: 0.75 + 0.9 * clamp01((p.comet - COMET_MILES) / 45),
      ring: !!p.ring,
      // the globe as large as in its classic still (ryan.json's own), and until its picture has been read, lit from
      // the upper left
      globe: w.globe,
      pic: { lx: -0.6, ly: 0.8, phase: 0.61, mean: w.color.map((c) => 0.35 + 0.3 * c), limb: [0.7, 0.78, 0.9] },
    };
  });

  // ---- the paint's shared uniforms, and the table every part reads its system from
  const table = new Float32Array(ROW * N * 4);
  const tableTex = new THREE.DataTexture(table, ROW, N, THREE.RGBAFormat, THREE.FloatType);
  tableTex.minFilter = tableTex.magFilter = THREE.NearestFilter;
  tableTex.needsUpdate = true;
  const GRID = Math.ceil(Math.sqrt(N)), rows = Math.ceil(N / GRID);
  const atlas = document.createElement('canvas');
  atlas.width = GRID * CELL;
  atlas.height = rows * CELL;
  const atlasTex = new THREE.CanvasTexture(atlas);
  atlasTex.minFilter = THREE.LinearMipmapLinearFilter;
  atlasTex.premultiplyAlpha = true;
  const blank = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  blank.needsUpdate = true;
  const U = {
    uSys: { value: tableTex }, uFocus: { value: new THREE.Vector4() }, uFocusWeek: { value: -1 },
    uScale: { value: 1 }, uDpr: { value: 1 }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
    uNight: { value: new THREE.Color(0.05, 0.07, 0.16) }, uInk: { value: new THREE.Color(0.92, 0.89, 0.81) },
    // the sheet of paintings is laid in once they are all in (unread, it would be a sheet of nothing sent to the GPU)
    uAtlas: { value: blank }, uGrid: { value: new THREE.Vector2(GRID, rows) }, uTex: { value: 0 },
    uFull: { value: blank }, uFullWeek: { value: -1 }, uFullOn: { value: 0 },
    uSnap: { value: blank }, uSnapWeek: { value: -1 }, uSnapOn: { value: 0 }, uSnapFlip: { value: 0 }, uSnapCrop: { value: GLOBE },
  };
  const group = new THREE.Group();
  group.name = 'week-systems';
  const disposables = [tableTex, atlasTex, blank];
  const material = (vertexShader, fragmentShader, mask = false) => {
    const m = new THREE.ShaderMaterial({
      uniforms: U, vertexShader, fragmentShader, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      // the keep mask: the frame's alpha drawn down under the kept systems, its color left as it is; drawn after all
      // of the scene (renderOrder 12), so no light added over them later lifts it again
      ...(mask && { defines: { MASK: '' }, blending: THREE.CustomBlending, blendSrc: THREE.ZeroFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor }),
    });
    disposables.push(m);
    return m;
  };
  // a draw, and (keep) its keep mask at the end of the scene, of one geometry
  function draw(geo, vert, frag, order, keep, Kind = THREE.Mesh) {
    let first;
    for (const mask of keep ? [false, true] : [false]) {
      const o = new Kind(geo, material(vert, frag, mask));
      o.frustumCulled = false;
      o.renderOrder = mask ? 12 + order / 100 : order;
      group.add(o);
      first ??= o;
    }
    disposables.push(geo);
    return first;
  }
  // an instanced draw: the base shape and, per instance, the named attributes ([name, itemSize, array of rows])
  function instanced(base, attrs, count, vert, frag, order, keep = true) {
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    for (const [name, size, data] of attrs) geo.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(data), size));
    geo.instanceCount = count;
    return draw(geo, vert, frag, order, keep);
  }
  const quad = new THREE.PlaneGeometry(2, 2);
  // a band round a path: (around 0 … 1, across -1 or 1), and the ring's: (around, inner 0 … outer 1)
  const band = (segs, across) => {
    const pos = [], idx = [];
    for (let k = 0; k <= segs; k++) for (const v of across) pos.push(k / segs, v, 0);
    for (let k = 0; k < segs; k++) idx.push(2 * k, 2 * k + 1, 2 * k + 2, 2 * k + 1, 2 * k + 3, 2 * k + 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    return geo;
  };
  const ribbon = band(72, [-1, 1]), annulus = band(96, [0, 1]);
  disposables.push(quad, ribbon, annulus);

  // the orbits: each planet's, its moons', a comet's
  const orbits = [];
  for (let i = 0; i < N; i++) {
    orbits.push([i, 0, saltOf(W[i].week, 1)]);
    parts[i].moons.forEach((m, k) => orbits.push([i, 1 + k, saltOf(W[i].week, 2 + k)]));
    if (parts[i].comet) orbits.push([i, 9, saltOf(W[i].week, 9)]);
  }
  instanced(ribbon, [['iWeek', 1, orbits.map((o) => o[0])], ['iKind', 1, orbits.map((o) => o[1])], ['iSeed', 1, orbits.map((o) => o[2] * 50)]], orbits.length, ORBIT_VERT, ORBIT_FRAG, 10.6);

  // the stars, under galaxy.js's pulsars (the hard point in the soft one)
  instanced(quad, [
    ['iWeek', 1, W.map((w) => w.i)], ['iSeed', 1, W.map((w) => 30 * saltOf(w.week, 3))], ['iColor', 3, W.flatMap((w) => w.color)],
  ], N, STAR_VERT, STAR_FRAG, 9.2);

  // the planets, over the pulsars: a picked planet stands where its week's pulsar does and hides it
  const planets = instanced(quad, [
    ['iWeek', 1, W.map((w) => w.i)], ['iCell', 2, W.flatMap((w) => [w.i % GRID, Math.floor(w.i / GRID)])],
    ['iMean', 3, sys.flatMap((s) => s.pic.mean)], ['iLimb', 3, sys.flatMap((s) => s.pic.limb)],
    ['iStar', 3, W.flatMap((w) => w.color)], ['iBody', 3, W.flatMap((w) => LIGHT[w.body] ?? [1, 0, 0])],
  ], N, PLANET_VERT, PLANET_FRAG, 10.5);

  // the moons, biggest nearest
  const moons = [];
  for (let i = 0; i < N; i++) {
    parts[i].moons.forEach((m, k) => moons.push({ i, k, m, s: (j) => saltOf(W[i].week, 60 + 7 * k + j) }));
  }
  instanced(quad, [
    ['iWeek', 1, moons.map((o) => o.i)], ['iK', 1, moons.map((o) => o.k)], ['iN', 1, moons.map((o) => o.m.n)],
    ['iWater', 1, moons.map((o) => (o.m.key === 'swim' ? 1 : 0))], ['iSeed', 1, moons.map((o) => 20 * o.s(0))],
    ['iPhase', 1, moons.map((o) => TAU * o.s(1))], ['iSpeed', 1, moons.map((o) => (0.2 / (1 + 0.7 * o.k)) * (0.8 + 0.4 * o.s(2)))],
    ['iColor', 3, moons.flatMap((o) => o.m.color)],
  ], moons.length, MOON_VERT, MOON_FRAG, 10.7);

  // the belts' stones: 22 a lift
  const stones = { aWeek: [], aAng: [], aRad: [], aH: [], aSize: [], aSeed: [] };
  for (let i = 0; i < N; i++) {
    for (let k = 0, n = 22 * parts[i].belt; k < n; k++) {
      const s = (j) => saltOf(W[i].week, 100 + 6 * k + j);
      const g = (s(1) + s(2) + s(3) - 1.5) * 1.4; // most of them near the belt's middle
      stones.aWeek.push(i); stones.aAng.push(TAU * s(0)); stones.aRad.push(clamp(g, -1.6, 1.6));
      stones.aH.push((s(4) - 0.5) * 2); stones.aSize.push(0.5 + 1.1 * s(5) ** 3); stones.aSeed.push(10 * s(5) + k);
    }
  }
  if (stones.aWeek.length) {
    const geo = new THREE.BufferGeometry();
    for (const [name, data] of Object.entries(stones)) geo.setAttribute(name, new THREE.Float32BufferAttribute(data, 1));
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(stones.aWeek.length * 3), 3));
    draw(geo, BELT_VERT, BELT_FRAG, 10.55, true, THREE.Points);
  }
  // the rings and the comets
  const ringed = W.filter((w) => parts[w.i].ring), comets = W.filter((w) => parts[w.i].comet);
  if (ringed.length) instanced(annulus, [['iWeek', 1, ringed.map((w) => w.i)], ['iSeed', 1, ringed.map((w) => 30 * saltOf(w.week, 5))]], ringed.length, RING_VERT, RING_FRAG, 10.65);
  if (comets.length) instanced(quad, [['iWeek', 1, comets.map((w) => w.i)], ['iSeed', 1, comets.map((w) => 30 * saltOf(w.week, 6))]], comets.length, COMET_VERT, COMET_FRAG, 10.62);
  galaxy.add(group);

  // ---- the paintings: every week's 96 px globe in one sheet of cells, each read once it is in; the picked week's
  // whole globe on its own; and the planet as the dive hands it back, for as long as it stays about as large
  let paintings = null, fullFor = -1, fullWant = -1, fullTex = null, snapTex = null, snapAt = 0;
  // in slices that hand the page a turn every 12 ms (pace): 83 reads of a cell's pixels are a long task on a phone
  async function readGlobes() {
    const ctx = atlas.getContext('2d', { willReadFrequently: true });
    const mean = planets.geometry.getAttribute('iMean'), limb = planets.geometry.getAttribute('iLimb');
    for (const w of W) {
      await pace();
      const pic = readGlobe(ctx.getImageData((w.i % GRID) * CELL, Math.floor(w.i / GRID) * CELL, CELL, CELL).data, CELL);
      sys[w.i].pic = pic;
      mean.setXYZ(w.i, ...pic.mean);
      limb.setXYZ(w.i, ...pic.limb);
    }
    mean.needsUpdate = limb.needsUpdate = true;
  }
  function load() {
    if (paintings || !thumbOf) return paintings || Promise.resolve();
    const ctx = atlas.getContext('2d', { willReadFrequently: true });
    paintings = Promise.all(W.map((w) => new Promise((done) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => { ctx.drawImage(img, (w.i % GRID) * CELL, Math.floor(w.i / GRID) * CELL, CELL, CELL); done(); };
      img.onerror = done;
      img.src = thumbOf(w);
    }))).then(async () => {
      await readGlobes();
      U.uAtlas.value = atlasTex;
      atlasTex.needsUpdate = true;
      U.uTex.value = 1;
      onLoad?.();
    });
    return paintings;
  }
  // the picked week's whole globe, once it is in
  function wantFull(i) {
    if (i === fullWant) return;
    fullWant = i;
    if (i < 0 || !paintingOf) return;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (fullWant !== i) return;
      const tex = new THREE.Texture(img);
      tex.premultiplyAlpha = true;
      tex.needsUpdate = true;
      fullTex?.dispose();
      fullTex = tex;
      fullFor = i;
      U.uFull.value = tex;
      U.uFullWeek.value = i;
      onLoad?.();
    };
    img.src = paintingOf(W[i]);
  }
  // what the dive hands back (a canvas or an ImageBitmap of the planet's seat square), on week i's planet; its size
  // on the screen is read at the next frame, and it gives way to the globe as the eye draws back from that
  function setSnap(i, source) {
    snapTex?.dispose();
    snapTex = null;
    U.uSnap.value = blank;
    U.uSnapWeek.value = -1;
    U.uSnapOn.value = 0;
    if (!source) return;
    const bitmap = typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap;
    snapTex = source instanceof HTMLCanvasElement ? new THREE.CanvasTexture(source) : new THREE.Texture(source);
    snapTex.flipY = !bitmap;
    snapTex.minFilter = THREE.LinearFilter;
    snapTex.generateMipmaps = false;
    snapTex.needsUpdate = true;
    U.uSnap.value = snapTex;
    U.uSnapWeek.value = i;
    U.uSnapFlip.value = bitmap ? 1 : 0;
    U.uSnapCrop.value = sys[i].globe;
    snapAt = 0;
    onLoad?.();
  }

  // ---- each frame: the focus, then every system's place in the table
  const focusRaw = new Float32Array(N), keepRaw = new Float32Array(N), curH = new Float32Array(N), curP = new Float32Array(N * 3);
  let bigNow = 2 * H0, cssH = 1;
  const inv = new THREE.Matrix4(), cam = V(), right = V(), back = V(), dW = V(), p = V(), q = V();
  const P = V(), S = V(), E1 = V(), E2 = V(), MU = V(), MV = V(), RN = V(), B1 = V(), B2 = V(), C = V(), tmp = V();
  const f = { e1: V(), e2: V(), mu: V(), mv: V(), rn: V(), b1: V(), b2: V(), S: V() };
  const put = (i, k, x, y, z, w) => { const o = (i * ROW + k) * 4; table[o] = x; table[o + 1] = y; table[o + 2] = z; table[o + 3] = w; };
  const putV = (i, k, v, w) => put(i, k, v.x, v.y, v.z, w);
  // a toward b by e, kept a unit (and b itself when the two cancel)
  const toward = (out, a, b, e) => { out.copy(a).lerp(b, e); const l = out.length(); return l > 1e-4 ? out.divideScalar(l) : out.copy(b); };
  // b made square to a
  const square = (b, a) => { b.addScaledVector(a, -b.dot(a)); const l = b.length(); return l > 1e-6 ? b.divideScalar(l) : b.set(a.y, -a.x, 0).normalize(); };

  // The picked week composed against the eye: its planet at its place, its star off it the way the globe's own
  // light comes (beside the globe, and in front of it but never as near the eye as a third of the way; nearer level
  // than that light if it would stand in the top fifth of the page, where a phone keeps its links), its orbit an
  // ellipse round the star through the planet laid square to the eye, its moons' plane and its ring's seen a little
  // from above, its comet out beyond its star on the far side from the planet. All in f.*.
  const xyz = [0, 0, 0], seen = {};
  function compose(i, g) {
    const st = sys[i].pic;
    back.copy(cam).sub(sys[i].pos);
    const D = back.length();
    back.divideScalar(D || 1);
    q.copy(right).addScaledVector(back, -right.dot(back)).normalize(); // the sheet's right, square to the eye
    p.crossVectors(back, q); // and its up
    const lat = 1.55 * g + 0.6 * g * (0.15 + 0.08 * sys[i].hours);
    const deep = st.phase < Math.PI / 2 ? Math.min(lat / Math.tan(st.phase), 0.3 * D) : Math.max(lat / Math.tan(st.phase), -4 * g);
    // the light's way on the sheet (sn its sine, up), the star a lateral `lat` off the planet that way
    const place = (sn) => {
      dW.copy(q).multiplyScalar((st.lx < 0 ? -1 : 1) * Math.sqrt(Math.max(0, 1 - sn * sn))).addScaledVector(p, sn);
      f.S.copy(sys[i].pos).addScaledVector(dW, lat).addScaledVector(back, deep);
    };
    place(st.ly);
    // seen where the lens shows it (galaxy.js), against the top of the page
    const top = 0.2 * cssH, sy = screenOf ? screenOf(f.S.toArray(xyz), seen).y : top;
    if (sy < top) {
      const py = screenOf(sys[i].pos.toArray(xyz), seen).y;
      if (py > top) place(st.ly * clamp01((py - top) / Math.max(1e-3, py - sy)));
    }
    f.e1.copy(dW).negate(); // from the star toward the planet, on the sheet
    f.e2.crossVectors(back, dW).normalize();
    // the moons: their plane nearly edge on, tipped a little, its near side below the globe
    f.mu.copy(q).multiplyScalar(Math.cos(-0.2)).addScaledVector(p, Math.sin(-0.2));
    tmp.crossVectors(back, f.mu).normalize();
    f.mv.copy(back).multiplyScalar(Math.cos(0.3)).addScaledVector(tmp, -Math.sin(0.3));
    // the ring the same way, open a little more and turned the other way (lower left to upper right)
    f.rn.copy(q).multiplyScalar(Math.cos(0.38)).addScaledVector(p, Math.sin(0.38));
    tmp.crossVectors(back, f.rn).normalize();
    f.b1.copy(back).multiplyScalar(Math.cos(0.33)).addScaledVector(tmp, -Math.sin(0.33));
    f.rn.cross(f.b1).normalize();
    // the comet's orbit: the planet's, its perihelion turned from the planet's way out to one side
    const kk = Math.PI + (saltOf(W[i].week, 45) < 0.5 ? -1 : 1) * (0.7 + 0.5 * saltOf(W[i].week, 46));
    f.b1.copy(f.e1).multiplyScalar(Math.cos(kk)).addScaledVector(f.e2, Math.sin(kk));
    f.b2.copy(f.e2).multiplyScalar(Math.cos(kk)).addScaledVector(f.e1, -Math.sin(kk));
    return D;
  }

  function update({ camera, time, dt = 0, picked: pick = -1, scale, dpr, big, size }) {
    if (big > 0) bigNow = big;
    U.uTime.value = time;
    U.uScale.value = scale;
    U.uDpr.value = dpr;
    if (size) U.uRes.value.copy(size);
    cssH = U.uRes.value.y / dpr;
    inv.copy(galaxy.matrixWorld).invert();
    cam.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(inv);
    right.setFromMatrixColumn(camera.matrixWorld, 0).transformDirection(inv);
    let focusI = -1, focusE = 0, nearest = 0;
    for (let i = 0; i < N; i++) {
      const s = sys[i], want = i === pick ? 1 : 0;
      focusRaw[i] = dt > 0 ? focusRaw[i] + (want - focusRaw[i]) * (1 - Math.exp(-7 * Math.min(dt, 0.1))) : want;
      if (Math.abs(focusRaw[i] - want) < 2e-3) focusRaw[i] = want;
      // the quiet passes the picked week by, and its neighbours along the arm (three either side) mostly
      const keep = want || (pick >= 0 && Math.abs(i - pick) <= 3 && W[i].arm === W[pick].arm ? 0.8 : 0);
      keepRaw[i] = dt > 0 ? keepRaw[i] + (keep - keepRaw[i]) * Math.min(1, dt * 4) : keep;
      const e = smooth(0, 1, focusRaw[i]);
      // unpicked: the star on its mark, the planet on its orbit
      const th = s.th0 + s.om * time;
      S.copy(s.pos);
      P.copy(s.pos).addScaledVector(s.e1, s.a0 * Math.cos(th)).addScaledVector(s.e2, s.a0 * Math.sin(th));
      let H = H0, rs = s.rs0, mo0 = Math.max(1.75, s.ring ? 2.6 : 0), moStep = 0.5, mr = 0.17, D = 0;
      E2.copy(s.e2); MU.copy(s.mu); MV.copy(s.mv); RN.copy(s.rn); B1.copy(s.b1); B2.copy(s.b2);
      const R = s.globe;
      if (e > 0) {
        const gF = bigNow * 2 * R;
        D = compose(i, gF);
        S.lerp(f.S, e);
        P.lerp(s.pos, e);
        H += (bigNow - H) * e;
        rs += (gF * (0.15 + 0.08 * s.hours) - rs) * e;
        mo0 += ((s.ring ? 2.6 : 1.4) - mo0) * e;
        moStep += (0.22 - moStep) * e;
        mr += (0.09 - mr) * e;
        toward(E2, E2, f.e2, e); toward(MU, MU, f.mu, e); toward(MV, MV, f.mv, e); toward(RN, RN, f.rn, e);
        toward(B1, B1, f.b1, e); toward(B2, B2, f.b2, e);
        if (e > focusE) { focusE = e; focusI = i; }
      }
      const g = H * 2 * R;
      E1.copy(P).sub(S);
      if (e > 0) E1.addScaledVector(back, -E1.dot(back) * e); // the picked one's laid square to the eye
      const a = E1.length() || 1e-6;
      E1.divideScalar(a);
      square(E2, E1);
      square(MV, MU);
      square(B2, B1);
      // the comet: near its star, swaying slowly about its own place on its orbit
      const qq = 0.55 * a, ecc = 0.7, nu = s.nu0 + 0.25 * Math.sin(s.nuW * time);
      const rr = (qq * (1 + ecc)) / (1 + ecc * Math.cos(nu));
      C.copy(S).addScaledVector(B1, rr * Math.cos(nu)).addScaledVector(B2, rr * Math.sin(nu));
      // how near the eye is to the planet, in globe radii: everything but the planet and its ring goes as it comes in
      const near = smooth(3.5, 6.5, (D || cam.distanceTo(P)) / g);
      putV(i, T_S, S, rs);
      putV(i, T_P, P, g);
      putV(i, T_E1, E1, a);
      putV(i, T_E2, E2, e);
      putV(i, T_MU, MU, g * mo0);
      putV(i, T_MV, MV, g * moStep);
      putV(i, T_RN, RN, g * mr);
      putV(i, T_C, C, a * s.tail);
      putV(i, T_B1, B1, qq);
      putV(i, T_B2, B2, ecc);
      put(i, T_K, near, H, 0.40 + (0.30 - 0.40) * e, 1 - 0.4 * e);
      put(i, T_Q, keepRaw[i], 0, 0, 0);
      curH[i] = H;
      curP[3 * i] = P.x; curP[3 * i + 1] = P.y; curP[3 * i + 2] = P.z;
      // how large the nearest planet is on the screen (device px), to know when the paintings are wanted
      nearest = Math.max(nearest, (g * scale) / Math.max(1e-4, cam.distanceTo(P)));
    }
    tableTex.needsUpdate = true;
    // the picked planet as a ball in the eye's frame, for what stands behind it
    if (focusI >= 0) {
      tmp.fromArray(curP, 3 * focusI).applyMatrix4(galaxy.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
      U.uFocus.value.set(tmp.x, tmp.y, tmp.z, curH[focusI] * 2 * sys[focusI].globe);
    } else U.uFocus.value.set(0, 0, 0, 0);
    U.uFocusWeek.value = focusI;
    if (!paintings && (pick >= 0 || nearest > 1.8 * dpr)) load();
    wantFull(pick);
    const on = fullFor >= 0 && fullFor === pick ? 1 : 0;
    U.uFullOn.value = dt > 0 ? U.uFullOn.value + (on - U.uFullOn.value) * Math.min(1, dt * 8) : on;
    // the planet the dive handed back holds while it is about as large as it came, and gives way to its globe as the
    // eye draws back (gone, it is let go)
    const si = U.uSnapWeek.value;
    if (si >= 0) {
      const px = (curH[si] * 2 * sys[si].globe * scale) / Math.max(1e-4, cam.distanceTo(tmp.fromArray(curP, 3 * si)));
      if (!snapAt) snapAt = px;
      U.uSnapOn.value = smooth(0.65, 0.95, px / snapAt);
      if (U.uSnapOn.value <= 0) setSnap(-1, null);
    }
  }

  return {
    group,
    update,
    /** Galaxy radii round week i's star that its system spans (its planet's orbit and the planet's moons). */
    reach: (i) => Math.max(W[i].size, 1.2 * sys[i].a0 + 3 * H0 * 0.84),
    /** Where week i's planet stands once picked (world, into out): the week's own place. Returns half its still's side. */
    pickTarget(i, out) {
      out.copy(sys[i].pos).applyMatrix4(galaxy.matrixWorld);
      return bigNow;
    },
    /** Where week i's planet stands now (world, into out). Returns half its still's side now. */
    planetNow(i, out) {
      out.fromArray(curP, 3 * i).applyMatrix4(galaxy.matrixWorld);
      return curH[i] || H0;
    },
    /** How far week i's system has turned to its planet (0 … 1). */
    focus: (i) => smooth(0, 1, focusRaw[i] || 0),
    /** Lay a canvas or ImageBitmap of the planet's seat square (its globe as large as in its classic still) on week
     *  i's planet while it stays about as large as it is then; null: its globe again. */
    paint(i, source) {
      if (source) setSnap(i, source);
      else if (U.uSnapWeek.value === i) setSnap(-1, null);
    },
    load,
    dispose() {
      galaxy.remove(group);
      fullTex?.dispose();
      snapTex?.dispose();
      for (const d of disposables) d.dispose();
    },
  };
}

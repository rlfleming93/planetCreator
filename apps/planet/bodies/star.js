/* Planet Creator — the Star body (world.body=star).
 *
 * A star is the rarest thing a year of training makes: one week that burned.
 * The rule here claims the year's own week — the race that was also a week of
 * real hours, or the longest week the season has — so it takes one or two of
 * eighty-three and no more (see fit).
 *
 * The week is drawn as a sun, and a sun is not lit by anything: its shell is its
 * own light. Across that shell the disc is a load of the week's own pigment —
 * white-gold cells shut in by lanes of vermilion, a bright network of faculae,
 * the limb darkening into red as the sphere turns away, a ragged chromosphere
 * along the silhouette — and the week's own places stand on it as sunspot groups
 * (each session a group, its leader and its follower, sized by the hours spent
 * there), every one of them pulled onto the face the poster reads, because a
 * spot on the limb is a smudge and not a group. Prominences stand off that limb
 * as loops of flux, drawn as brush strokes, and the corona is the body's own
 * screen pass (bodies/index.js: post, run before any print), combed into
 * streamers that fill the sheet without ever leaving the paper bare.
 *
 * A star wears no rings. A race week's world hangs a Saturn ring beside the
 * globe (another module's object, already in the scene); this body leaves it
 * undrawn and unfitted, and the poster is not pulled back to fit it.
 *
 * Underfoot the star is a cooled photosphere: a near-black oxblood crust with
 * the week's own lava lanes standing molten on it (a lane is upwelling, so the
 * terrain's own banded colouring paints it hot), a glow shell riding the ground
 * over those very lanes, and a sky that is the star itself — blinding, warm
 * white-gold, with the blaze laid where the sun actually stands.
 *
 * Deterministic: every random draw comes from the week's own PRNG, and the only
 * clock is uTime, for the boil of the granulation and the pulse of the lanes.
 */

import { P } from '../params.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a || 1e-6), 0, 1); return t * t * (3 - 2 * t); };
const num = (value, fallback) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

function hashStr(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

const seedOf = (week) => (hashStr(String(week ?? '')) % 100000) / 1000;
const to = (colour, hex) => colour.clone().setStyle(hex);

// The star's own claim on a week: a race week of real hours, or the season's
// longest week. Both are gates, not gradients — eight-tenths of a year passes
// neither — so the star stays the thing a year makes once.
const RACE_HOURS = 6;
const LONG_HOURS = 12;
const SPOTS = 8; // the groups' own slots: four places, a leader and a follower each
const FACE = Math.cos(0.46); // the cone about the painter's own axis a group stands in
const POSTER_TILT = 0.17; // base.js's own pitch bias for a race week's poster

// Which body the race week is drawn as (params.js star.look): 2, the default,
// the crowned world; 0 the first star, 1 the painted star, 3 the eclipse, 4 the
// lacquer world. 2 to 4 keep the week's own rock world under them: its climate,
// its ground and its orbit pass through.
const look = () => clamp(Math.round(num(Number(P['star.look']), 2)), 0, 4);
const rocky = () => look() >= 2;
/** The race week as his own rock world under its crown (look 2): it keeps the
 *  air, the weather and the life a rock world has, so ink.js BODY_AIR,
 *  ink-clouds.js NO_WEATHER and life.js LIFELESS let it by. */
export const crowned = () => look() === 2;
const LOOKS = [
  null,
  () => import('./star-painted.js'),
  () => import('./star-crown.js'),
  () => import('./star-eclipse.js'),
  () => import('./star-lacquer.js'),
];
const LABELS = ['Star', 'Star', 'Crowned world', 'Eclipse', 'Lacquer world'];
const RULES = ['burn as stars', 'burn as stars', 'wear an aurora crown', 'get a close sun of their own to eclipse', 'are lacquered in black and gold'];

/**
 * The star's own noise, on this side of the shader: one integer hash per lattice
 * corner with a smoothstep between them, exactly the way base.js's own field is
 * built, seeded from the week's name. The lanes are drawn from it twice — once by
 * the shape hook that raises the ground, once by the glow shell that lights that
 * ground — so the light lies on the crack it belongs to and never beside it. (A
 * body cannot reach the reading's own field from create(); the star keeps its
 * own, which is the one thing on it that is not the week's ground.)
 */
function fieldFor(week) {
  const seed = hashStr(`${String(week ?? '')}/star/lanes`);
  const H = (x, y, z) => {
    let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1442695041) ^ seed;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  return (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const fx = x - xi, fy = y - yi, fz = z - zi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
    const c000 = H(xi, yi, zi), c100 = H(xi + 1, yi, zi), c010 = H(xi, yi + 1, zi), c110 = H(xi + 1, yi + 1, zi);
    const c001 = H(xi, yi, zi + 1), c101 = H(xi + 1, yi, zi + 1), c011 = H(xi, yi + 1, zi + 1), c111 = H(xi + 1, yi + 1, zi + 1);
    const x00 = c000 + (c100 - c000) * u, x10 = c010 + (c110 - c010) * u;
    const x01 = c001 + (c101 - c001) * u, x11 = c011 + (c111 - c011) * u;
    const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
    return y0 + (y1 - y0) * w;
  };
}

/**
 * The week's lava lanes: a ridge network sharpened into lanes that stand a little
 * proud of the plates. Three taps — two ridge scales and a grain — so the field
 * costs the same order as the ground it is laid on.
 */
function lanes(dir, nz) {
  const x = dir.x, y = dir.y, z = dir.z;
  // a lane is where the field crosses its own middle: the level set of a smooth
  // field is a network of thin branching lines, and that network IS the melt.
  // (The distance to the middle of a field, its own value, is a broad mass and
  // never a lane — that is the trap this field used to fall into.)
  const a = Math.abs(nz(x * 2.4 + 7.0, y * 2.4 + 3.0, z * 2.4 + 11.0) * 2 - 1);
  const b = Math.abs(nz(x * 7.1 + 21.0, y * 7.1 + 5.0, z * 7.1 + 2.0) * 2 - 1);
  const grain = nz(x * 15.0 + 3.0, y * 15.0, z * 15.0 + 1.0);
  const ridge = (1 - sstep(0.0, 0.16, a)) * 0.85 + (1 - sstep(0.0, 0.12, b)) * 0.45;
  return clamp(ridge * (0.55 + 0.45 * grain), 0, 1);
}

// The lane field is built once per week and kept: the shape hook runs for every
// vertex of the globe and every probe of the reading, and a field built per call
// would be an allocation in the middle of a 163 842-vertex loop.
const LANE_FIELDS = new Map();
function laneField(ctx) {
  const key = String(ctx?.stats?.week ?? '');
  let nz = LANE_FIELDS.get(key);
  if (!nz) {
    nz = fieldFor(key);
    LANE_FIELDS.set(key, nz);
  }
  return nz;
}

/**
 * Where the painter stands (base.js's own rule: the week's subject, turned from
 * the sun by the small angle its poster framing uses), so a body that has to put
 * something on the face the poster reads asks this rather than guessing.
 */
export function painterAxis(T, features, sun) {
  const out = new T.Vector3();
  const race = features?.race;
  if (race?.seg && race.seg.length >= 6 && race.cum) {
    const half = race.total * 0.5;
    let i = 1;
    while (i < race.cum.length - 1 && race.cum[i] < half) i++;
    const t = clamp((half - race.cum[i - 1]) / Math.max(1e-6, race.cum[i] - race.cum[i - 1]), 0, 1);
    const a = (i - 1) * 3, b = i * 3;
    out.set(
      race.seg[a] + (race.seg[b] - race.seg[a]) * t,
      race.seg[a + 1] + (race.seg[b + 1] - race.seg[a + 1]) * t,
      race.seg[a + 2] + (race.seg[b + 2] - race.seg[a + 2]) * t,
    );
  } else if (features?.monument?.dir) {
    out.copy(features.monument.dir);
  } else if (Array.isArray(features?.list)) {
    for (const f of features.list) {
      if (f.kind === 'monument') continue;
      const seconds = Number(f.stats?.activeS);
      out.addScaledVector(f.dir, Number.isFinite(seconds) ? Math.max(900, seconds) : 900);
    }
  }
  if (!(out.lengthSq() > 1e-6)) out.copy(features?.spawn || sun || new T.Vector3(0, 1, 0));
  out.normalize();
  if (features?.monument) out.multiplyScalar(-1);
  const off = features?.monument ? 0.6 : 0.28;
  const tangential = new T.Vector3().copy(sun).addScaledVector(out, -out.dot(sun));
  if (tangential.lengthSq() > 1e-6) out.addScaledVector(tangential.normalize(), off).normalize();
  // base.js's poster camera does not stand on the subject itself: its pitch is
  // the subject's own elevation plus the poster's tilt, and anything that has to
  // be read on the face the still shows must be placed against the camera's own
  // axis and not the subject's. A race week leans by that tilt; every other
  // week's poster stands square on its subject.
  const tilt = features?.monument ? POSTER_TILT : 0;
  const yaw = Math.atan2(out.z, out.x);
  const pitch = clamp(Math.asin(clamp(out.y, -1, 1)) + tilt, -1.35, 1.35);
  const cosP = Math.cos(pitch);
  return out.set(cosP * Math.cos(yaw), Math.sin(pitch), cosP * Math.sin(yaw));
}

/**
 * The prominences: loops of flux standing off the limb as one merged mesh — one
 * draw call, no instancing machinery, every vertex carrying its own heat — with
 * both feet on the photosphere and the crown standing a hand's width above it.
 * Each loop is drawn as a brush stroke: four columns, a dense core and a
 * feathered edge, so it lifts off the sheet like a loaded mark and not like a
 * sticker. They stand on the limb the poster actually reads (a ring about the
 * painter's own axis), and the first four take the still's own diagonals, where
 * the sheet's corners are: a prominence is only ever a silhouette, and the
 * corners are the only limb a poster crop has room for.
 */
export function buildArcs(T, { R, eye, rng, hot, count }) {
  const up = new T.Vector3(0, 1, 0);
  const u1 = new T.Vector3().crossVectors(eye, Math.abs(eye.y) < 0.92 ? up : new T.Vector3(1, 0, 0));
  if (u1.lengthSq() < 1e-6) u1.set(1, 0, 0);
  u1.normalize();
  const u2 = new T.Vector3().crossVectors(eye, u1).normalize();
  const DIAG = [0.78539816, 2.35619449, 3.92699082, 5.49778714];
  const SEG = 22;
  const OFF = [-1.0, -0.72, -0.36, 0.36, 0.72, 1.0];
  const HOT = [0.20, 0.96, 1.0, 1.0, 0.96, 0.20];
  const position = [], heat = [], idx = [];
  const d0 = new T.Vector3(), d1 = new T.Vector3(), e2 = new T.Vector3(), p = new T.Vector3(), dir = new T.Vector3();
  let base = 0;
  for (let i = 0; i < count; i++) {
    const theta = i < DIAG.length ? DIAG[i] + (rng() * 2 - 1) * 0.30 : rng() * TAU;
    const lean = (rng() * 2 - 1) * 0.10;
    const foot = u1.clone().multiplyScalar(Math.cos(theta)).addScaledVector(u2, Math.sin(theta)).addScaledVector(eye, lean).normalize();
    e2.copy(foot).cross(eye);
    if (e2.lengthSq() < 1e-6) e2.copy(u1);
    e2.normalize();
    const size = 0.80 + 0.55 * rng();               // a hand of its own, every loop
    const span = (0.20 + 0.20 * rng()) * size;      // the arch's own breadth, in radians
    const rise = R * (0.075 + 0.075 * rng()) * size; // how far the crown stands off the limb
    const wide = R * (0.0165 + 0.0160 * rng()) * size; // the ribbon's half width
    const w0 = rng() * TAU, w1 = 0.6 + 1.7 * rng();     // the stroke's own weight, along it
    const arcHot = clamp(hot * (0.70 + 0.45 * rng()) + (rng() - 0.5) * 0.25, 0.15, 1);
    d0.copy(foot).applyAxisAngle(eye, -span);
    d1.copy(foot).applyAxisAngle(eye, span);
    for (let s = 0; s <= SEG; s++) {
      const t = s / SEG;
      // the loop leans a little out of the silhouette plane as it rises, so the
      // crown reads as standing in front of the limb and not pasted on it
      dir.copy(d0).lerp(d1, t).normalize().addScaledVector(eye, lean * Math.sin(Math.PI * t)).normalize();
      const prof = Math.sin(Math.PI * t);
      p.copy(dir).multiplyScalar(R + rise * prof * prof * (3 - 2 * prof));
      // a loaded brush does not carry one weight the whole way: the stroke
      // swells and thins along its own length, heaviest where it was pressed
      const sw = 0.62 + 0.38 * Math.sin(w0 + w1 * Math.PI * t * 2.4);
      const w = wide * (1.0 - 0.42 * prof) * sw;
      for (let k = 0; k < 6; k++) {
        position.push(p.x + e2.x * w * OFF[k], p.y + e2.y * w * OFF[k], p.z + e2.z * w * OFF[k]);
        heat.push(clamp(arcHot * (0.22 + 0.78 * Math.pow(prof, 0.6)) * HOT[k], 0, 1));
      }
    }
    for (let s = 0; s < SEG; s++) {
      const a = base + s * 6;
      for (let k = 0; k < 5; k++) {
        const q0 = a + k, q1 = q0 + 1, q2 = q0 + 6, q3 = q2 + 1;
        idx.push(q0, q2, q1, q1, q2, q3);
      }
    }
    base += (SEG + 1) * 6;
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(position, 3));
  geo.setAttribute('aHeat', new T.Float32BufferAttribute(heat, 1));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

/** The race ring hidden and taken out of the poster's framing (see create's
 *  note): the scene is read at most twice, now and on the first frame. With
 *  `unframe` every part of it is renamed as well, so nothing that frames the
 *  poster by the ring's name (shots.js, base.js) reads its reach or its finish
 *  line: the poster is the globe's and its system's alone. */
export function ringMute(scene, unframe = false) {
  let reads = 0;
  const muteNode = (node) => {
    if (!node || !String(node.name).startsWith('companion-race-ring')) return;
    if (node.name === 'companion-race-ring') {
      node.visible = false;
      if (node.userData) node.userData.reach = 1;
    }
    if (unframe) node.name = `muted-${node.name}`;
  };
  return () => {
    if (reads >= 2 || !scene || typeof scene.traverse !== 'function') return;
    reads++;
    scene.traverse(muteNode);
  };
}

/* The lacquer world's palette (look 4): the land laid in gold, the sea in black
 * urushi, the ink a lacquer black, and the sky underfoot a night the gold
 * stands in. The week's own ground and sea keep their shapes; only the
 * pigments change. */
function lacquer(pal) {
  const p = pal.paper;
  const set = (key, hex, k = 0.92) => { if (pal[key]?.isColor) pal[key].lerp(to(p, hex), k); };
  set('paper', '#f2dc9c', 0.8);
  set('paperWet', '#e6c97e', 0.8);
  set('ink', '#0a0705');
  set('inkSoft', '#2b1c10', 0.85);
  set('dark', '#050302');
  set('sepia', '#4a2e12', 0.85);
  set('litWarm', '#e6bd5c', 0.85);
  set('landLow', '#7a5520');
  set('landMid', '#a8802f');
  set('landHigh', '#d8b056');
  set('crest', '#f4dc94');
  set('dry', '#94702c');
  set('bare', '#a47c34');
  set('stone', '#86622a');
  set('wood', '#5c3f18');
  set('veg', '#8a6526', 0.85);
  set('shadeCool', '#24170c', 0.85);
  set('farGlaze', '#2c1f12', 0.8);
  set('seaShallow', '#17110c');
  set('seaDeep', '#060403');
  set('foam', '#d2a952', 0.88);
  set('cobalt', '#0d0a08');
  set('teal', '#1e160e');
  set('skyHigh', '#120d0a', 0.88);
  set('skyLow', '#2e2014', 0.88);
  set('skyBand', '#3a2a18', 0.85);
  set('skyWash', '#1e160f', 0.85);
  set('skyDeep', '#0c0907', 0.88);
  set('skyHaze', '#2a1e14', 0.85);
  set('cloudUnder', '#3a2a18', 0.85);
  pal.vegAmt = Math.min(pal.vegAmt, -0.6);
  return pal;
}

export default {
  id: 'star',
  get label() { return LABELS[look()]; },
  blurb: 'the week as a sun: a boiling photosphere, spot groups over the week\'s own places, prominences at the limb and a corona over everything',

  /* The year's own week, and nothing else: a race week that was also a week of
   * real hours (six or more), or the season's longest week if it ran to twelve.
   * On the shelf that is one week in eighty-three, or two. */
  fit(stats) {
    const hours = num(stats?.hours, 0);
    if (stats?.race && hours >= RACE_HOURS) return clamp(0.66 + 0.06 * (hours - RACE_HOURS), 0, 1);
    if (hours >= LONG_HOURS) return clamp(0.6 + 0.12 * (hours - LONG_HOURS), 0, 0.98);
    return 0;
  },

  /** Why the week is this body, in plain words: the rule that fired, then the week's own numbers. */
  reason(stats) {
    const hours = num(stats?.hours, 0);
    const rule = RULES[look()];
    if (stats?.race && hours >= RACE_HOURS) return `Race weeks of ${RACE_HOURS}+ hours ${rule}. This week: ${stats.raceName || 'a race'}, ${hours.toFixed(1)} hours.`;
    return `Weeks of ${LONG_HOURS}+ hours ${rule}. This week: ${hours.toFixed(1)} hours.`;
  },

  /* What the week's own sea is when the week is a star: not water but the melt,
   * a crust broken open in a few wide lakes. The reading's own share still says
   * how much of it there is — a week that sweated ten litres cracks wider than
   * one that sweated four — it is only read on a different scale. */
  climate(c) {
    if (rocky()) return c;
    c.oceanFrac = clamp(0.035 + c.oceanFrac * 0.17, 0.03, 0.2);
    return c;
  },

  /* The crust. The world's relief is read at half its height about the week's
   * own smooth ground — a cooled shell is smoother than the mountains it was —
   * and the week's lava lanes stand a good deal proud of the plates, so the
   * terrain's own banded colouring paints them as the molten ground they are. */
  shape(dir, h, ctx) {
    if (rocky()) return h;
    const ref = ctx.macro(dir);
    const lane = lanes(dir, laneField(ctx));
    return ref + (h - ref) * 0.48 + lane * (1.3 + 2.0 * clamp(num(ctx.energy, 0.5), 0, 1.5));
  },

  /* The crust and the blaze: a cooled photosphere — near-black oxblood plates
   * with the week's own lanes standing molten on them — under a sky that is the
   * star itself, a warm white-gold the ink only just holds. */
  palette(pal) {
    if (look() === 4) return lacquer(pal);
    if (rocky()) return pal;
    const paper = pal.paper;
    pal.paper.lerp(to(paper, '#f8efdc'), 0.5);
    pal.paperWet.lerp(to(paper, '#f6e3c0'), 0.5);
    pal.ink.lerp(to(paper, '#1a0a06'), 0.86);
    pal.inkSoft.lerp(to(paper, '#3c1a10'), 0.8);
    pal.dark.lerp(to(paper, '#0e0504'), 0.92);
    pal.sepia.lerp(to(paper, '#7a3a1c'), 0.78);
    pal.litWarm.lerp(to(paper, '#a8481a'), 0.78);
    pal.landLow.lerp(to(paper, '#241009'), 0.9);
    pal.landMid.lerp(to(paper, '#3f1710'), 0.88);
    pal.landHigh.lerp(to(paper, '#68240e'), 0.88);
    pal.crest.lerp(to(paper, '#ff9a2e'), 0.92);
    pal.dry.lerp(to(paper, '#31150c'), 0.88);
    pal.shadeCool.lerp(to(paper, '#1c0a08'), 0.86);
    pal.farGlaze.lerp(to(paper, '#8a3a14'), 0.7);
    pal.stone.lerp(to(paper, '#3a1c12'), 0.82);
    pal.wood.lerp(to(paper, '#2c150e'), 0.78);
    pal.seaShallow.lerp(to(paper, '#ff7a1c'), 0.9);
    pal.seaDeep.lerp(to(paper, '#8f1d05'), 0.88);
    pal.foam.lerp(to(paper, '#ffd489'), 0.85);
    pal.cobalt.lerp(to(paper, '#c0491a'), 0.84);
    pal.teal.lerp(to(paper, '#ff9a2e'), 0.84);
    pal.bare.lerp(to(paper, '#48200f'), 0.84);
    pal.veg.lerp(to(paper, '#54301a'), 0.74);
    pal.vegAmt = Math.min(pal.vegAmt, -0.6);
    // the sky is the star: a warm white-gold sheet, hazier and whiter to the rim
    pal.skyHigh.lerp(to(paper, '#ffe9b4'), 0.85);
    pal.skyLow.lerp(to(paper, '#fffdf4'), 0.9);
    pal.skyBand.lerp(to(paper, '#fff6e2'), 0.9);
    pal.skyWash.lerp(to(paper, '#ffeec9'), 0.88);
    pal.skyDeep.lerp(to(paper, '#f7cf8f'), 0.85);
    pal.cloudUnder.lerp(to(paper, '#ffe6b0'), 0.85);
    pal.skyHaze.lerp(to(paper, '#ffeec2'), 0.88);
    if (pal.skyScheme) {
      pal.skyScheme.x = Math.max(pal.skyScheme.x, 0.02);
      pal.skyScheme.y = Math.max(pal.skyScheme.y, 0.26);
    }
    return pal;
  },

  /* A sun is framed with its whole limb inside the sheet: the disc fills four
   * fifths of the poster and the rest is the crown — room for the helmet
   * streamers to sweep out to the edges and for the prominence loops to stand
   * clear of the limb, which is where a sun is actually read. */
  // the eclipse keeps its limb nearly round: a summit standing proud of a
  // backlit disc reads as a bite out of it
  get orbit() { return look() === 3 ? { reliefCap: 3 } : rocky() ? undefined : { fill: 0.58 }; },

  load: () => LOOKS[look()]?.(),

  create(shared, loaded) {
    if (loaded?.createLook) return loaded.createLook(shared);
    const { THREE: T, features, palette: pal } = shared;
    const R = num(shared.R, 120);
    const cap = num(features?.orbit?.reliefCap, 12);
    const shellR = R + Math.max(cap, 6) + 2.4;
    const seed = seedOf(features?.week);
    const rng = features?.makeRng ? features.makeRng('body/star') : (() => 0.5);
    const sun = (shared.light?.value || shared.uniforms?.uSunDir?.value || new T.Vector3(0.55, 0.72, 0.42)).clone().normalize();
    const eye = painterAxis(T, features, sun);

    // ---- a star wears no rings. A race week's world hangs its Saturn ring
    // beside the globe (worlds/rings.js, another module's object, stood in the
    // scene before this body is made — ink.js adds the companions group, then
    // makes the body); it is left where it is and simply never drawn, and its
    // reach is taken out of the poster's framing so the camera stops pulling
    // back to fit something that is not there. The scan is made at most twice —
    // once now, once on the first frame, for a page that built its scene in the
    // other order — and then the answer is cached, a ring or no ring, which is
    // every week that earns none: no week pays a traversal of the scene per
    // frame. The callback is held rather than minted inside the frame loop.
    const muteRing = ringMute(shared.scene);
    muteRing();

    // ---- the week's warmth decides the sun it is: a cool week an orange-red
    // dwarf, a hot one a white-yellow furnace. Either way the disc is a load of
    // pigment — cells of the week's own light shut in by lanes of vermilion, a
    // limb that goes dark and red — and never a grey mottle.
    const hot = clamp(num(features?.warmth, 0.5), 0, 1);
    const spaced = clamp(Number(P['sky.space']) || 0, 0, 1);
    const warm = sstep(0.25, 0.90, hot);
    const core = to(pal.litWarm, '#ff6a14').lerp(to(pal.litWarm, '#ffd068'), warm);
    const cell = core.clone().lerp(to(core, '#ffe4b4').lerp(to(core, '#fff6dc'), warm), 0.84 + 0.10 * warm);
    const lane = core.clone().lerp(to(core, '#c04a12'), 0.52);
    const rim = lane.clone().lerp(to(core, '#4a0d03'), 0.55);
    const chromo = core.clone().lerp(to(core, '#ff5a14'), 0.68);
    const spotDark = lane.clone().lerp(to(core, '#180502'), 0.84);
    const penumbra = core.clone().lerp(to(core, '#8a3810'), 0.55);
    const facula = cell.clone().lerp(to(core, '#fff8e6'), 0.55);

    // ---- the spot groups: the week's own places, the biggest and most
    // face-on first. A group is only a group where the painter can see it — a
    // spot left on the limb is a smudge — so each one is pulled inside the cone
    // the poster's own axis reads; and where the week kept too few places there,
    // the rest are seeded inside the same cone from the week's own name,
    // because a star with a blank face is a star with nothing to read.
    const sites = Array.isArray(features?.list)
      ? features.list.filter((f) => f?.dir).map((f) => ({ dir: f.dir.clone(), hours: Math.max(0, num(f.stats?.activeS, 0)) / 3600 }))
      : [];
    sites.sort((a, b) => (b.dir.dot(eye) * 0.6 + Math.min(b.hours, 3) * 0.1) - (a.dir.dot(eye) * 0.6 + Math.min(a.hours, 3) * 0.1));
    const u1 = new T.Vector3().crossVectors(eye, Math.abs(eye.y) < 0.92 ? new T.Vector3(0, 1, 0) : new T.Vector3(1, 0, 0));
    if (u1.lengthSq() < 1e-6) u1.set(1, 0, 0);
    u1.normalize();
    const u2 = new T.Vector3().crossVectors(eye, u1).normalize();
    const beltPole = new T.Vector3(0, 1, 0);
    // a place is kept but turned to the face: the group keeps its own longitude
    // and is walked round the sphere until the painter's own axis holds it
    const pullToFace = (d) => {
      d.normalize();
      const dot = clamp(d.dot(eye), -1, 1);
      if (dot >= FACE - 1e-4) return d;
      const axis = new T.Vector3().crossVectors(d, eye);
      if (axis.lengthSq() < 1e-8) return d;
      axis.normalize();
      return d.applyAxisAngle(axis, Math.acos(dot) - Math.acos(FACE)).normalize();
    };
    const chosen = sites.slice(0, 4);
    while (chosen.length < 3) {
      const theta = rng() * TAU;
      const lean = (rng() * 2 - 1) * 0.22;
      chosen.push({
        dir: u1.clone().multiplyScalar(Math.cos(theta)).addScaledVector(u2, Math.sin(theta)).addScaledVector(eye, lean).normalize(),
        hours: 1.2 + rng() * 1.4,
      });
    }
    const spots = [];
    chosen.slice(0, 4).forEach((site, i) => {
      // A week's places all lie in a narrow band about the equator (base.js lays
      // them out by the day of the week, twelve degrees either side at most), and
      // a sun's spots stand in exactly such a belt. So a group keeps its own
      // place's longitude and takes a latitude inside the zone, drawn from the
      // week's seed and alternating sides the way a group's own pair does — a row
      // of spots ruled along the equator would be a necklace, not a sun.
      const d = site.dir.clone();
      const lift = (0.10 + 0.24 * rng()) * (i % 2 ? -1 : 1);
      const pole = beltPole.clone().addScaledVector(d, -beltPole.dot(d));
      if (pole.lengthSq() > 1e-6) d.addScaledVector(pole.normalize(), Math.tan(lift));
      pullToFace(d);
      // the group's own axis: the belt's own east, turned a little, so a leader
      // and its follower stand abreast the way a bipolar group does. The umbra
      // is sized in radians of arc — a week that spent hours there keeps a
      // bigger spot — and never grows past a twelfth of the disc's own radius.
      const east = new T.Vector3().crossVectors(beltPole, d);
      if (east.lengthSq() < 1e-6) east.copy(u1);
      east.normalize().applyAxisAngle(d, (rng() * 2 - 1) * 0.5).normalize();
      const lead = 0.0140 + 0.0170 * clamp(site.hours / 2.6, 0, 1) * (0.8 + 0.4 * rng());
      const part = 0.40 + 0.22 * rng();
      spots.push({ dir: d.clone(), axis: east.clone(), size: lead, seed: rng() });
      spots.push({
        dir: d.clone().addScaledVector(east, lead * (1.5 + 0.4 * rng())).normalize(),
        axis: east.clone(),
        size: lead * part,
        seed: rng(),
      });
    });
    while (spots.length < SPOTS) spots.push({ dir: eye.clone(), axis: u1.clone(), size: 0, seed: 0 });

    // ---- the week's own palette for the blaze: the corona is drawn in the
    // week's own warmth, in three loads — a pale gold for the filaments, the
    // week's gold for the body of a streamer, and a loaded vermilion for the
    // clumps where the brush pressed hardest
    // ---- where the crown is loaded: two or three bearings of the week's own,
    // spaced by its own hand, each one the root of a helmet streamer. A corona
    // without its few dominant structures is a comb, however fine the comb.
    const helmA = new T.Vector3().set(rng() * TAU, 0, 0);
    helmA.y = helmA.x + 1.5 + rng() * 1.4;
    helmA.z = helmA.y + 1.5 + rng() * 1.4;

    const rayHot = core.clone().lerp(to(core, '#ffe9c4'), 0.45);
    const rayCool = core.clone().lerp(to(core, '#e07a26'), 0.40);
    const rayDeep = core.clone().lerp(to(core, '#8f2f0a'), 0.62);
    const glowCool = core.clone().lerp(to(core, '#ff8a1e'), 0.40);
    const glowHot = core.clone().lerp(to(core, '#fff4d6'), 0.72);

    // ---- the photosphere: a shell with no light of its own to receive, so the
    // painted sun never touches it
    const photoUniforms = {
      uCore: { value: core },
      uCell: { value: cell },
      uLane: { value: lane },
      uRim: { value: rim },
      uChromo: { value: chromo },
      uSpotDark: { value: spotDark },
      uPen: { value: penumbra },
      uFacula: { value: facula },
      uBlaze: { value: blazeOf(core) },
      uInk: { value: pal.ink.clone() },
      uSpots: { value: spots.map((s) => s.dir.clone()) },
      uSpotAxis: { value: spots.map((s) => s.axis.clone()) },
      uSpotSize: { value: spots.map((s) => s.size) },
      uSpotSeed: { value: spots.map((s) => s.seed) },
      uHot: { value: hot },
      uSeed: { value: seed },
      uTime: { value: 0 },
      uFade: { value: 1 },
    };
    const photoGeo = new T.SphereGeometry(shellR, 192, 128);
    const photoMat = new T.ShaderMaterial({
      uniforms: photoUniforms,
      vertexShader: STAR_SHELL_VERT,
      fragmentShader: STAR_PHOTO_FRAG,
      transparent: true,
      depthWrite: true,
      side: T.FrontSide,
    });
    const photo = new T.Mesh(photoGeo, photoMat);
    photo.name = 'body-star-photosphere';

    // ---- the prominences, standing off the limb the poster reads. Five or six
    // of them and no more: a limb crowded with loops is confetti, and a loop a
    // viewer cannot point at is not a prominence.
    const hours = num(features?.stats?.hours, 8);
    const arcCount = hours >= 10 ? 6 : 5;
    const arcs = new T.Mesh(buildArcs(T, { R: shellR + 0.35, eye, rng, hot, count: arcCount }), new T.ShaderMaterial({
      uniforms: {
        uCool: { value: to(core, '#c8451a').lerp(rayDeep, 0.30) },
        uHot: { value: to(core, '#ff9f3a').lerp(to(core, '#ffc46a'), warm * 0.5) },
        uInk: { value: pal.ink.clone() },
        uPaper: { value: pal.paper.clone() },
        uTime: { value: 0 },
        uFade: { value: 1 },
      },
      vertexShader: STAR_ARC_VERT,
      fragmentShader: STAR_ARC_FRAG,
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
      blending: T.NormalBlending,
    }));
    arcs.name = 'body-star-prominences';

    const group = new T.Group();
    group.name = 'body-star';
    group.add(arcs, photo);

    // ---- the crust underfoot: a glow over the very lanes the shape hook raised,
    // carrying their own field as a vertex attribute so the light lies on the
    // crack and not beside it
    const nz = fieldFor(features?.week);
    const glowR = R;
    const glowGeo = new T.SphereGeometry(glowR, 240, 160);
    {
      const pos = glowGeo.attributes.position;
      const count = pos.count;
      const laneAttr = new Float32Array(count);
      const v = new T.Vector3();
      for (let i = 0; i < count; i++) {
        v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
        laneAttr[i] = lanes(v, nz);
        const h = num(features?.heightAt?.(v), 0) + 1.35;
        pos.setXYZ(i, v.x * (glowR + h), v.y * (glowR + h), v.z * (glowR + h));
      }
      pos.needsUpdate = true;
      glowGeo.setAttribute('aLane', new T.Float32BufferAttribute(laneAttr, 1));
      glowGeo.computeVertexNormals();
    }
    const glowMat = new T.ShaderMaterial({
      uniforms: {
        uCool: { value: glowCool },
        uHot: { value: glowHot },
        uSeed: { value: seed },
        uTime: { value: 0 },
        uPresence: { value: 0 },
      },
      vertexShader: STAR_GLOW_VERT,
      fragmentShader: STAR_GLOW_FRAG,
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      // the ground patch under the viewer carries a polygon offset of its own,
      // pulling it a depth step or two toward the painter; a glow riding just
      // above that ground must out-bias it or it never reaches the sheet
      polygonOffset: true,
      polygonOffsetFactor: -8,
      polygonOffsetUnits: -8,
      side: T.DoubleSide,
    });
    const glow = new T.Mesh(glowGeo, glowMat);
    glow.name = 'body-star-crust-glow';
    glow.visible = false;
    glow.renderOrder = 4;
    group.add(glow);

    const insideSq = (shellR + 4) * (shellR + 4);
    const state = { surface: 0, presence: 1, radius: shellR };
    const uTime = photoUniforms.uTime;
    const uFade = photoUniforms.uFade;
    const uArcTime = arcs.material.uniforms.uTime;
    const uArcFade = arcs.material.uniforms.uFade;
    const uGlowPresence = glowMat.uniforms.uPresence;

    // one reused vector per frame: the pass projects the disc's own centre and
    // the sun's own bearing, and neither may allocate in the render loop
    const _p = new T.Vector3();

    function update({ camera, surface, time } = {}) {
      muteRing();
      const t = num(time, 0);
      uTime.value = t;
      uArcTime.value = t;
      glowMat.uniforms.uTime.value = t;
      const mix = clamp(num(surface, 0), 0, 1);
      state.surface = mix;
      const presence = 1 - sstep(0.02, 0.16, mix);
      state.presence = presence;
      uFade.value = presence;
      uArcFade.value = presence;
      // the sun is not drawn over its own crust: while the camera is inside the
      // photosphere the ground is the star, and the blaze is the sky
      const under = !!(camera && camera.position.lengthSq() < insideSq);
      photo.visible = presence > 0.004 && !under;
      photoMat.depthWrite = presence > 0.985;
      arcs.visible = presence > 0.02 && !under;
      // the lanes burn wherever the crust is what is being looked at — the glow
      // is the ground's own light and belongs to the landing frames, not to orbit
      const glowOn = sstep(0.22, 0.85, mix);
      uGlowPresence.value = glowOn;
      glow.visible = glowOn > 0.01;
    }

    // where the week's monument stands on the crust (its foot): the melt drawn
    // on the crust by the screen pass never crosses it
    const keepMon = new T.Vector4();
    const monDir = (features?.monument || features?.list?.find?.((f) => f?.kind === 'monument'))?.dir;
    if (monDir) {
      const d = monDir.clone().normalize();
      const foot = R + num(features.heightAt?.(d), 0);
      keepMon.set(d.x * foot, d.y * foot, d.z * foot, 3.0);
    }

    // ---- the body's own screen pass: the corona, run before any print
    const post = {
      id: 'star-corona',
      fragment: STAR_CORONA_FRAG,
      uniforms() {
        return {
          uCenter: { value: new T.Vector2(0.5, 0.5) },
          uSunUv: { value: new T.Vector2(0.5, 0.9) },
          uRad: { value: 100 },
          uPresence: { value: 1 },
          uFoot: { value: 0 },
          uSeed: { value: seed },
          uHot: { value: hot },
          uRayCool: { value: rayCool },
          uRayHot: { value: rayHot },
          uRayDeep: { value: rayDeep },
          uBlaze: { value: blazeOf(core) },
          uMolten: { value: to(core, '#ffe0a8').lerp(to(core, '#fff6e2'), warm * 0.5) },
          uSpace: { value: spaced },
          uHelm: { value: helmA },
          uCamPos: { value: new T.Vector3() },
          uUp: { value: new T.Vector3(0, 1, 0) },
          uLaneHot: { value: core.clone().lerp(to(core, '#ffb028'), 0.55) },
          // the crust's own height, to know where the crust IS (the screen pass
          // draws the melt on it and on nothing standing on it): the survey the
          // ground itself is drawn from, at its own resolution
          tLand: { value: shared.survey?.land || null },
          uSeaLevel: { value: num(features?.seaLevel, 0) },
          uR: { value: R },
          // the two things standing on the crust the melt must never cross: the
          // week's monument (its foot, and a radius holding its plinth and its
          // stones) and the runner, read each frame
          uKeepA: { value: keepMon },
          uKeepB: { value: new T.Vector4() },
          uNear: { value: 0.3 },
          uFar: { value: 2000 },
          uProjInv: { value: new T.Matrix4() },
          uViewWorld: { value: new T.Matrix4() },
          uInvVP: { value: new T.Matrix4() },
          uInk: { value: pal.ink.clone() },
        };
      },
      update(ctx, u) {
        const cam = ctx.camera;
        const res = ctx.resolution;
        if (!cam || !res) return;
        u.uPresence.value = state.presence;
        u.uFoot.value = state.surface;
        u.uSeed.value = seed;
        // the disc on the sheet: the photosphere projects to a circle, and the
        // star's own centre is where the disc stands
        _p.set(0, 0, 0).project(cam);
        u.uCenter.value.set(_p.x * 0.5 + 0.5, _p.y * 0.5 + 0.5);
        const rho = state.radius;
        const d0 = cam.position.length();
        const f = (res.y * 0.5) / Math.tan((cam.fov * Math.PI) / 360);
        u.uRad.value = d0 > rho * 1.02 ? (f * rho) / Math.sqrt(Math.max(1e-3, d0 * d0 - rho * rho)) : f * 6;
        // where the sun stands underfoot: the painted light is the star's own,
        // and the blaze is laid where it actually is in the sky
        u.uCamPos.value.copy(cam.position);
        const fig = window.__app?.runner?.object3D;
        if (fig) u.uKeepB.value.set(fig.position.x, fig.position.y, fig.position.z, 0.7);
        else u.uKeepB.value.w = 0;
        u.uNear.value = cam.near;
        u.uFar.value = cam.far;
        u.uProjInv.value.copy(cam.projectionMatrixInverse);
        u.uViewWorld.value.copy(cam.matrixWorld);
        u.uUp.value.copy(cam.position).normalize();
        u.uInvVP.value.copy(cam.matrixWorld).multiply(cam.projectionMatrixInverse);
        const light = ctx.light?.value;
        if (light) {
          _p.copy(light).multiplyScalar(4000).add(cam.position).project(cam);
          u.uSunUv.value.set(_p.x * 0.5 + 0.5, _p.y * 0.5 + 0.5);
        }
      },
    };

    function dispose() {
      photoGeo.dispose();
      photoMat.dispose();
      arcs.geometry.dispose();
      arcs.material.dispose();
      glowGeo.dispose();
      glowMat.dispose();
      if (group.parent) group.parent.remove(group);
    }

    // what the star was drawn from, for the eye and the bench
    group.userData.star = {
      shellR, seed, hot, arcs: arcCount,
      spots: spots.map((s) => ({ dir: s.dir.toArray(), size: +s.size.toFixed(4), dot: +(s.dir.dot(eye)).toFixed(3) })),
      eye: eye.toArray(),
    };
    return { object: group, update, dispose, post };
  },
};

// The disc's own white, for the corona's chrome: the blaze a sun leaves on the
// paper where its light is loaded thickest.
function blazeOf(core) {
  // a hot week's own light is white-yellow, a cool week's warm cream: the blaze
  // is the week's, not a fixed white
  return core.clone().lerp(core.clone().setStyle('#ffffff'), 0.78);
}

/* ------------------------------------------------------------------- glsl -- */

const STAR_NOISE = /* glsl */ `
float stHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float stNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float a = stHash(i);
  float b = stHash(i + vec3(1.0, 0.0, 0.0));
  float c = stHash(i + vec3(0.0, 1.0, 0.0));
  float d = stHash(i + vec3(1.0, 1.0, 0.0));
  float e = stHash(i + vec3(0.0, 0.0, 1.0));
  float g = stHash(i + vec3(1.0, 0.0, 1.0));
  float h = stHash(i + vec3(0.0, 1.0, 1.0));
  float k = stHash(i + vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y),
             mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
}
float stNoise2(vec2 x) {
  vec2 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float a = stHash(vec3(i, 0.0));
  float b = stHash(vec3(i + vec2(1.0, 0.0), 0.0));
  float c = stHash(vec3(i + vec2(0.0, 1.0), 0.0));
  float d = stHash(vec3(i + vec2(1.0, 1.0), 0.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

const STAR_SHELL_VERT = /* glsl */ `
varying vec3 vDir;
varying vec3 vWorld;
varying vec3 vNrm;
void main() {
  vDir = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNrm = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const STAR_PHOTO_FRAG = /* glsl */ `
${STAR_NOISE}
varying vec3 vDir;
varying vec3 vWorld;
varying vec3 vNrm;
uniform vec3 uCore, uCell, uLane, uRim, uChromo, uSpotDark, uPen, uFacula, uInk, uBlaze;
uniform vec3 uSpots[8];
uniform vec3 uSpotAxis[8];
uniform float uSpotSize[8];
uniform float uSpotSeed[8];
uniform float uHot, uSeed, uTime, uFade;

void main() {
  vec3 d = normalize(vDir);
  vec3 N = normalize(vNrm);
  vec3 V = normalize(cameraPosition - vWorld);
  float mu = clamp(dot(N, V), 0.0, 1.0);
  float t = uTime;

  // ---- the granulation: a cellular field. Every cell is one granule of
  // convection — bright in its own convex body, shut in by the thin lane network
  // where it meets its neighbours — and the lattice is sampled on the sphere's
  // own direction, so the cells foreshorten at the limb exactly as the sphere
  // does. The lattice is jittered by the week's own seed: no two granules alike.
  // A jittered point may stand anywhere in its own cell, so the nearest two can
  // lie in any of the 27 cells round this one: a search of fewer cuts the field
  // along the lattice's own planes, which from close orbit is a grid of tiles.
  vec3 p = d * 88.0 + vec3(t * 0.013, t * 0.007, 0.0);
  vec3 ip = floor(p);
  float f1 = 1e6, f2 = 1e6;
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      for (int k = -1; k <= 1; k++) {
        vec3 cell = ip + vec3(float(i), float(j), float(k));
        vec3 jit = vec3(
          stHash(cell + vec3(uSeed * 3.1, 0.5, 0.5)),
          stHash(cell + vec3(7.3, 1.7 + uSeed * 1.9, 3.3)),
          stHash(cell + vec3(13.7, 5.1, 9.2 + uSeed * 2.7)));
        // every granule has a size of its own, and the sizes come in clusters: a
        // coarse field over the lattice makes a few cells two or three times the
        // size of the small ones about them
        float cluster = stHash(floor(cell * 0.5) + vec3(uSeed * 7.0, 2.0, 5.0));
        float csz = (0.55 + 0.95 * cluster) * (0.80 + 0.40 * stHash(cell + vec3(3.0, 9.0, 1.0)));
        vec3 diff = cell + jit - p;
        float dd = dot(diff, diff) * csz;      // a weighted lattice: bigger cells win more space
        if (dd < f1) { f2 = f1; f1 = dd; } else if (dd < f2) { f2 = dd; }
      }
    }
  }
  float d1 = sqrt(f1), d2 = sqrt(f2);
  float cEdge = clamp((d2 - d1) / 0.55, 0.0, 1.0);
  // the granule's own value rolls from its crown to its edge, and the lane is a
  // narrow band at the boundary, broken by its own noise so it never closes a
  // tidy contour round every cell
  // the crown roll is a gentle gradient inside the cell — the interior stays
  // bright over most of its own area — and the lane is a thin band of two or
  // three pixels at the boundary, broken along its own length
  float crown = 1.0 - smoothstep(0.10, 0.95, d1);
  float band = 1.0 - smoothstep(0.0, 0.13, cEdge);
  float lane = band * (0.28 + 0.92 * stNoise(d * 34.0 + vec3(uSeed * 13.0)));

  // ---- and over the cells the slower scales: mesogranulation gathering granules
  // into flows, a fine grain inside each one, the bright network the week's light
  // stands in. The contrast dies a little toward the limb, where cells are seen
  // edge-on.
  float meso = stNoise(d * 8.0 + vec3(uSeed * 5.0 + 3.0));
  float fine = stNoise(d * 150.0 + vec3(t * 0.02, 0.0, t * 0.013) + vec3(uSeed * 11.0));
  float net = smoothstep(0.40, 0.90, stNoise(d * 15.0 + vec3(uSeed * 5.0 + 2.0)));
  float crisp = mix(0.72, 1.0, pow(mu, 0.45));
  // most of a granule is its own light: the fine grain is texture on it (a few
  // per cent of value) and the lane is the only thing that takes pigment away
  float base = 0.68 + 0.26 * crown - 0.52 * band;
  float heat = clamp((base + 0.16 * (meso - 0.5) + 0.06 * (fine - 0.5)) * crisp, 0.0, 1.0);

  // the face is PIGMENT: the week's own gold laid across the whole disc, deepest
  // in the lanes between the granules, and the white-hot light of the face is
  // kept to its middle — a sun is read by its loaded colour, not by its white
  // the hot middle of the face is a region of gas, not a gloss: the granule
  // network fades out across it, so nothing drawn crosses it as an outline
  float core30 = smoothstep(0.84, 0.99, mu);
  float coreFade = 1.0 - smoothstep(0.90, 0.99, mu);
  vec3 c = mix(uLane, uCore, smoothstep(0.06, 0.78, heat));
  c = mix(c, uCell, smoothstep(0.40, 0.98, heat) * (0.18 + 0.58 * core30));
  c = mix(c, uFacula, net * 0.10 * (0.30 + 0.70 * fine));
  // the lanes are thin and they break where the brush lifted: a pigment network,
  // one to three pixels across, and never a tidy contour round every cell
  // the lanes are broken to almost nothing and carry only a whisper of pigment:
  // at this scale the face must read as one loaded field with grain in it, and
  // never as a cracked shell
  c = mix(c, uLane, clamp(lane * (0.35 + 0.35 * fine) * 0.16 * crisp * coreFade, 0.0, 1.0));
  // the disc's own light: hotter and whiter toward its own centre, the way a
  // photosphere seen through its own air is, so the sun is the brightest thing on
  // the sheet and the air around it is not
  // the light of the face itself: hottest at its own centre and carried most of
  // the way out, so the sun's average is brighter than the sheet it is painted
  // on — the pigment belongs to the lanes and to the outer third alone
  c = mix(c, uBlaze, core30 * core30 * 0.52);

  // ---- the groups: one per place the week trained, a leader and its follower.
  // An umbra is never a clean circle — it is three overlapping lobes — its
  // penumbra is a fan of radial filaments, and the whole group stands in a lace
  // of faculae, the bright ring a sunspot always carries.
  float umbra = 0.0, pen = 0.0, fil = 0.0, fac = 0.0, bridge = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = uSpotSize[i];
    if (a <= 0.0) continue;
    vec3 sd = normalize(uSpots[i]);
    vec3 rel = d - sd;
    float q = length(rel) / a;
    if (q < 4.4) {
      vec3 t1 = normalize(uSpotAxis[i]);
      vec3 t2 = normalize(cross(sd, t1));
      vec2 rl = vec2(dot(rel, t1), dot(rel, t2)) / a;
      float r = length(rl);
      float phi = atan(rl.y, rl.x);
      float sd2 = uSpotSeed[i];
      // the umbra's own outline: a lobed, wandering boundary and never a circle
      float lobes = 0.80 + 0.26 * (stNoise2(vec2(phi * 1.4 + sd2 * 5.0, sd2 * 7.0)) - 0.5) * 2.0;
      float wob = 0.86 + 0.28 * (stNoise2(vec2(phi * 3.1 + sd2 * 9.0, r * 0.9 + sd2 * 3.0)) - 0.5) * 2.0;
      float u1 = 1.0 - smoothstep(0.56, 1.00, r * wob / lobes);
      float u2 = 1.0 - smoothstep(0.30, 0.66, length(rl - vec2(0.52, 0.34) * lobes) / lobes);
      float u3 = 1.0 - smoothstep(0.26, 0.62, length(rl + vec2(0.44, 0.40) * lobes) / lobes);
      float um = clamp(max(max(u1, u2), u3), 0.0, 1.0);
      umbra = max(umbra, um);
      // the penumbra: filaments running out of the umbra, tangled and uneven —
      // never a comb of spokes: the fan is turned and broken by its own noise
      float wob2 = (stNoise2(vec2(phi * 1.6 + sd2 * 11.0, r * 0.7)) - 0.5) * 2.0;
      float streak = 0.5 + 0.5 * sin(phi * 17.0 + wob2 * 5.0 + r * 2.5 + stNoise2(vec2(phi * 4.2 + sd2 * 3.0, r * 0.35)) * 3.0);
      streak = pow(streak, 1.4);
      float fan = smoothstep(0.68, 1.02, r) * (1.0 - smoothstep(1.70, 2.20, r)) * (0.75 + 0.5 * wob2);
      pen = max(pen, fan * (1.0 - um));
      fil = max(fil, fan * streak * (1.0 - um));
      // the light bridge a big spot carries across its own umbra
      if (a > 0.015) {
        bridge = max(bridge, (1.0 - smoothstep(0.0, 0.16, abs(rl.y + 0.10))) * (1.0 - smoothstep(0.40, 0.90, r)) * um);
      }
      // faculae: the bright lace the group stands in, drawn round it and never
      // inside it — short bright patches, the way a plage gathers on the network
      float ring = smoothstep(1.55, 1.95, r) * (1.0 - smoothstep(2.40, 3.10, r));
      float lace = stNoise2(vec2(phi * 9.0 + sd2 * 21.0, r * 2.6));
      float lace2 = stNoise2(vec2(phi * 24.0 + sd2 * 5.0, r * 3.6));
      fac = max(fac, ring * smoothstep(0.42, 0.88, lace) * (0.40 + 0.60 * lace2));
    }
  }
  c = mix(c, uPen, pen * 0.62);
  c = mix(c, uInk, fil * 0.26);
  c = mix(c, uSpotDark, umbra * 0.90);
  c = mix(c, uCell, bridge * 0.55);
  c = mix(c, mix(uFacula, uBlaze, 0.35), fac * 0.42);

  // ---- the sphere itself: the disc goes darker and redder into its own edge —
  // and the colour sits in the last few per cent of the radius, so the rim is a
  // loaded line and never a broad soft band — with the chromosphere standing as
  // a thin ragged line exactly at the silhouette, carried and broken by the
  // granules under it
  c = mix(c, uRim, clamp(pow(1.0 - mu, 6.0) * 1.70, 0.0, 1.0));
  float rimEdge = smoothstep(0.86, 0.995, 1.0 - mu) * (0.35 + 0.80 * fine);
  c = mix(c, uChromo, clamp(rimEdge, 0.0, 1.0) * 0.92);
  // the spicules at the very rim: a hair of the week's own light, a pixel wide
  c = mix(c, uCell, clamp(smoothstep(0.975, 1.0, 1.0 - mu) * (0.30 + 0.70 * fine), 0.0, 0.45));

  gl_FragColor = vec4(c, uFade);
}
`;

const STAR_ARC_VERT = /* glsl */ `
attribute float aHeat;
varying float vHeat;
varying vec3 vDir;
varying vec3 vWorld;
void main() {
  vHeat = aHeat;
  vDir = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const STAR_ARC_FRAG = /* glsl */ `
${STAR_NOISE}
varying float vHeat;
varying vec3 vDir;
varying vec3 vWorld;
uniform vec3 uCool, uHot, uInk, uPaper;
uniform float uTime, uFade;
void main() {
  // a loop of flux is a brush stroke: the crown carries the most pigment, the
  // feet thin away into the surface they stand on, and the whole thread breathes
  vec3 d = normalize(vDir);
  float flicker = 0.80 + 0.20 * stNoise(vec3(d * 24.0 + vec3(uTime * 0.09, 0.0, uTime * 0.05)));
  float heat = clamp(vHeat * (0.72 + 0.28 * flicker), 0.0, 1.0);
  vec3 hue = mix(uCool, uHot, heat);
  float cover = clamp((0.62 + 0.55 * heat) * flicker * uFade, 0.0, 1.0);
  if (cover < 0.02) discard;
  vec3 col = mix(uInk, hue, 0.82 + 0.18 * heat);
  col = mix(col, uPaper, 0.12 * (1.0 - heat));
  gl_FragColor = vec4(col, cover);
}
`;

const STAR_GLOW_VERT = /* glsl */ `
attribute float aLane;
varying float vLane;
varying vec3 vDir;
varying vec3 vWorld;
void main() {
  vLane = aLane;
  vDir = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const STAR_GLOW_FRAG = /* glsl */ `
${STAR_NOISE}
varying float vLane;
varying vec3 vDir;
varying vec3 vWorld;
uniform vec3 uCool, uHot;
uniform float uSeed, uTime, uPresence;
void main() {
  if (vLane < 0.02 || uPresence < 0.01) discard;
  vec3 d = normalize(vDir);
  // the pulse: the melt runs along the lane, not all of it at once
  float pulse = stNoise(d * 9.0 + vec3(uTime * 0.035, uTime * 0.02, 0.0) + vec3(uSeed));
  float fine = stNoise(d * 46.0 + vec3(uTime * 0.05, 0.0, uTime * 0.011) + vec3(uSeed * 1.7 + 3.0));
  float branch = stNoise(d * 21.0 + vec3(0.0, uTime * 0.03, uTime * 0.017) + vec3(uSeed * 2.3 + 7.0));
  float lane = pow(vLane, 2.1) * (0.60 + 0.40 * smoothstep(0.20, 0.74, pulse * 0.7 + branch * 0.5 + 0.2 * fine));
  float dist = distance(cameraPosition, vWorld);
  // clear at his feet, and gone by the far rim: a glow is only read where the
  // crust under it can still be seen
  float reach = smoothstep(1.2, 5.0, dist) * (1.0 - smoothstep(220.0, 620.0, dist));
  float amt = lane * (0.72 + 0.28 * fine) * reach * uPresence;
  if (amt < 0.004) discard;
  vec3 col = mix(uCool, uHot, clamp(0.25 + lane * 1.55, 0.0, 1.0));
  gl_FragColor = vec4(col, clamp(amt * 2.40, 0.0, 1.0));
}
`;

const STAR_CORONA_FRAG = /* glsl */ `
${STAR_NOISE}
// the star's own melt, drawn where it is read: a ridge network is the level set
// of a smooth field crossing its own middle, which is a mesh of thin branching
// cracks and never a broad mass
float stRidge(vec3 p) {
  float a = abs(stNoise(p * 2.4 + vec3(7.0)) * 2.0 - 1.0);
  float b = abs(stNoise(p * 7.1 + vec3(21.0, 5.0, 2.0)) * 2.0 - 1.0);
  float c = abs(stNoise(p * 15.0 + vec3(3.0, 11.0, 1.0)) * 2.0 - 1.0);
  return clamp((1.0 - smoothstep(0.0, 0.11, a)) * 0.80
             + (1.0 - smoothstep(0.0, 0.08, b)) * 0.42
             + (1.0 - smoothstep(0.0, 0.06, c)) * 0.22, 0.0, 1.0);
}
varying vec2 vUv;
uniform sampler2D tDiffuse, tDepth;
uniform vec2 uResolution, uCenter, uSunUv;
uniform float uRad, uPresence, uFoot, uSeed, uHot;
uniform vec3 uRayCool, uRayHot, uRayDeep, uBlaze, uMolten, uInk;
uniform vec3 uCamPos;
uniform vec3 uUp;
uniform mat4 uInvVP;
uniform float uSpace;
uniform vec3 uLaneHot;
uniform sampler2D tLand;
uniform float uSeaLevel, uR;
uniform float uNear, uFar;
// the crust's own radius at a direction, off the survey's chart (ink.js's
// bakeSurvey: longitude across from the antimeridian, latitude down)
float crustRAt(vec3 dir) {
  vec2 uv = vec2(0.5 + atan(dir.z, dir.x) / 6.2831853, 0.5 - asin(clamp(dir.y, -1.0, 1.0)) / 3.14159265);
  return uR + uSeaLevel + texture2D(tLand, uv).r;
}
// a figure standing on the crust, kept clear of the melt: k is its own foot
// (xyz) and its radius (w, nought for none), and anything inside that column
// up to h over the foot is not crust, whatever its radius says
uniform vec4 uKeepA, uKeepB;
float stKeep(vec3 p, vec4 k, float h) {
  if (k.w <= 0.0) return 1.0;
  vec3 up = normalize(k.xyz);
  vec3 rel = p - k.xyz;
  float y = dot(rel, up);
  float inCol = 1.0 - smoothstep(k.w * 0.85, k.w, length(rel - up * y));
  return 1.0 - inCol * step(-1.5, y) * step(y, h);
}
uniform mat4 uProjInv;
uniform mat4 uViewWorld;
uniform vec3 uHelm;
void main() {
  vec4 src = texture2D(tDiffuse, vUv);
  vec3 c = src.rgb;
  float sky = step(0.9999, texture2D(tDepth, vUv).r);
  vec2 rel = (vUv - uCenter) * uResolution;
  float r = length(rel);
  float ang = atan(rel.y, rel.x);

  // ---- the corona, from orbit: streamers drawn out of the limb, not printed on
  // the sheet as a spoke wheel. The crown is laid as PIGMENT and not as light —
  // an ink painter does not make a sun brighter, he loads the sky around it, and
  // the disc reads as the hole the brush left. So the bearing of every mark is
  // bent as it runs out and each one has its own width and length: the clumps are
  // where the brush was loaded and run to the corners, between them a few faint
  // filaments only, and the paper shows through the whole of it.
  if (uPresence > 0.001 && uFoot < 0.999) {
    float rr = r / max(uRad, 1.0);
    // the crown's own geography: a very slow field decides where the helmet
    // streamers stand, a second where the open filaments gather between them, and
    // the bearing of every mark is carried sideways as it runs out, so nothing in
    // the crown is a straight spoke
    float s1 = stNoise2(vec2(ang * 0.85, uSeed * 3.0));
    float s2 = stNoise2(vec2(ang * 2.10 + 4.0, uSeed * 5.0));
    float s3 = stNoise2(vec2(ang * 6.60 + 11.0, uSeed * 2.0));
    float curve = (s1 - 0.5) * 1.15 + (s2 - 0.5) * 0.45;
    float a = ang + curve * smoothstep(0.95, 3.0, rr);
    // two or three helmets, loaded and long; between them an open crown of thin
    // filaments that die a third of the way out
    // two or three helmet streamers stand where the week's own hand put them,
    // and the noise only widens or thins them: the crown always has its own
    // dominant structures, and they are never the same two weeks running
    float t0 = abs(fract((ang - uHelm.x) / 6.2831853 + 0.5) - 0.5) * 6.2831853;
    float t1 = abs(fract((ang - uHelm.y) / 6.2831853 + 0.5) - 0.5) * 6.2831853;
    float t2 = abs(fract((ang - uHelm.z) / 6.2831853 + 0.5) - 0.5) * 6.2831853;
    float h0 = exp(-t0 * t0 / 0.34);
    float h1 = 0.85 * exp(-t1 * t1 / 0.15);
    float h2 = 0.95 * exp(-t2 * t2 / 0.22);
    float helmet = max(max(h0, h1), h2);
    float fil = stNoise2(vec2(a * 26.0 + 3.0, uSeed * 11.0));
    float fil2 = stNoise2(vec2(a * 61.0 + 9.0, uSeed * 13.0));
    float fil3 = stNoise2(vec2(a * 14.0 + 31.0, uSeed * 23.0));
    // a streamer is a comb of strands with bare sheet between them, and outside
    // the helmets there is only a faint local glow and nothing else
    float strand = pow(clamp(fil, 0.0, 1.0), 2.4) * (0.04 + 0.96 * helmet)
                 + 0.60 * fil2 * fil2 * (0.06 + 0.94 * helmet);
    // a helmet runs to the corner, its strands split off it and each one ends at
    // a length of its own, so the structure tapers into open filaments
    // the three helmets are not the same structure: one is short and broad, one
    // is a narrow finger, one runs the whole way to the corner
    float reach = uRad * (0.85 + 1.5 * h0 + 0.9 * h1 + 3.3 * h2) * (0.55 + 0.55 * fil3);
    float run = 1.0 - smoothstep(reach * 0.40, reach, r);
    // the mark starts AT the limb: the sheet is left bare right up to the
    // chromosphere, and the paper shows between the streamers out to the corners
    float root = smoothstep(0.985, 1.01, rr);
    float feather = 0.45 + 0.55 * (0.5 + 0.5 * stNoise2(vec2(a * 3.2 + 21.0, uSeed * 19.0)));
    float amt = root * strand * run * feather * (1.0 - uFoot) * uPresence;
    vec3 hue = mix(uRayHot, uRayCool, clamp(0.25 + 0.75 * s2, 0.0, 1.0));
    hue = mix(hue, uRayDeep, clamp(helmet * 0.70 + 0.25 * fil2 * fil2, 0.0, 0.85));
    c = mix(c, hue, clamp(amt * 1.15, 0.0, 0.92));
    // with the sheet turned to deep space the crown is allowed to give light
    // rather than only to be drawn on it: the same marks, burning
    c += hue * clamp(amt * 0.55, 0.0, 0.55) * uSpace;
    // the chromosphere's own hair, standing just outside the silhouette: the
    // disc's rim is dark, so the line of light belongs to the sky side of it
    float hair = exp(-pow((rr - 1.010) / 0.022, 2.0)) * (0.40 + 0.60 * s3);
    c = mix(c, uBlaze, clamp(hair * 0.55, 0.0, 0.55) * uPresence * (1.0 - uFoot));
  }

  // ---- underfoot: the star is the sky. The blaze stands where the sun actually
  // stands, the sky is lifted toward its own light until the sheet can hardly
  // hold it, the streamers are drawn back over the blaze in the week's own
  // pigment, and the crust goes dim beneath, which is what an eye does when it
  // looks at a sun.
  if (uFoot > 0.001) {
    vec2 srel = (vUv - uSunUv) * uResolution;
    float sr = length(srel);
    float sa = atan(srel.y, srel.x);
    float q = max(uResolution.y, 1.0);
    float core = exp(-sr / (q * 0.20));
    float glare = exp(-sr / (q * 0.46));
    float halo = exp(-sr / (q * 1.10));
    float r1 = stNoise2(vec2(sa * 6.0, uSeed * 3.0));
    float r2 = stNoise2(vec2(sa * 17.0 + 5.0, uSeed * 7.0));
    float r3 = stNoise2(vec2(sa * 43.0 + 2.0, uSeed * 11.0));
    float rays = pow(clamp(r1 * 0.45 + r2 * 0.33 + r3 * 0.22, 0.0, 1.0), 1.6);
    float flare = exp(-sr / (q * 0.80)) * rays;
    vec3 lit = mix(uBlaze, uRayHot, 0.30);
    float lift = clamp(0.58 + 0.28 * glare + 0.24 * core + 0.12 * halo, 0.0, 0.95);
    c = mix(c, lit, sky * lift * uFoot);
    c = mix(c, uRayDeep, sky * uFoot * clamp(flare * 0.60 - 0.05, 0.0, 0.42));
    // the eye stops down: the crust goes dim under the blaze and takes the
    // week's own oxblood, and the star's own melt is drawn back over it as
    // molten ground — the one thing on the sheet still giving out light. The
    // crack is read off the crust itself, recovered from the depth buffer, so it
    // is drawn at the sheet's own resolution and lies on the ground it burns.
    // what is below the painter's own horizon is the crust, whatever the depth
    // buffer happens to hold there: the seam where the near ground hands over to
    // the globe must not become a white slash of sky in the middle of it
    // where this fragment is and which way it looks, recovered from the depth
    // buffer: the near crust is what the melt may be drawn on, and the sky —
    // where nothing wrote depth — is never it
    float dDepth = texture2D(tDepth, vUv).r;
    vec4 wp = uInvVP * vec4(vUv * 2.0 - 1.0, dDepth * 2.0 - 1.0, 1.0);
    vec3 world = wp.xyz / max(1e-4, abs(wp.w));
    vec3 toP = normalize(world - uCamPos);
    float zee = length(world - uCamPos);
    float below = 1.0 - smoothstep(-0.03, 0.10, dot(toP, uUp));
    float ground = uFoot * below;
    if (ground > 0.002) {
      vec3 wdir = toP;
      float lane = stRidge(wdir * 4.2);
      // the melt is drawn only where the depth buffer says this fragment IS the
      // near crust: never on the sky (nothing wrote depth there), never beyond
      // the near range, never off the crust's own surface (its radius here, off
      // the survey the ground itself is drawn from, to within a unit and a half),
      // and never inside the column the runner or the week's monument stands in
      float dRad = length(world);
      float isCrust = (1.0 - step(0.9996, dDepth))
                    * (1.0 - smoothstep(90.0, 200.0, zee))
                    * (1.0 - smoothstep(0.9, 1.6, abs(dRad - crustRAt(world / max(dRad, 1e-4)))))
                    * stKeep(world, uKeepA, 6.0) * stKeep(world, uKeepB, 2.2);
      lane *= isCrust;
      float near = 1.0 - smoothstep(120.0, 420.0, zee);
      float far = zee;
      // the crust is cooled to a near-black oxblood underfoot and opens to its
      // own distance — the far ground keeps the air over it, so the horizon is
      // still read — and the melt is laid back over the near crust as the frame's
      // own structure: a warm bleed into it and, in the middle of the crack, a
      // saturated orange-yellow core that is the hottest colour on the sheet
      float reach = mix(0.45, 1.0, 1.0 - smoothstep(150.0, 560.0, far));
      c = mix(c, c * vec3(0.42, 0.27, 0.20), ground * 0.96 * reach);
      float bleed = smoothstep(0.10, 0.55, lane);
      float core = smoothstep(0.42, 0.88, lane);
      c = mix(c, mix(uMolten, uLaneHot, 0.45), ground * reach * clamp(bleed * 0.40, 0.0, 0.45));
      c = mix(c, uLaneHot, ground * reach * clamp(core * (0.55 + 0.45 * near) * 0.95, 0.0, 0.95));
    }
  }
  gl_FragColor = vec4(c, src.a);
}
`;

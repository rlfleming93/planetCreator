/* Planet Creator — the Ice giant body (world.body=ice).
 *
 * A week that was both long and out of the weather — seven hours or more, spent
 * in the cold or under a roof all week — is not a rocky marble at all. It is an
 * ice giant: a pale cyan-teal shell of deep haze, its bands soft and curved and
 * never ruled, a loaded teal at the face and bleaching into the paper at the
 * limb, so the disc reads as a mass of air and not as a painted ball. A dark
 * oval storm rides the face the poster reads, elongated across its own weather,
 * with a bright collar and three discrete white cloud dabs beside it; a pair of
 * thin soot-dark threads crosses the lower face and runs off the sheet — the
 * Uranian rings — and a whisper of their shadow lies on the cloud tops. Underfoot
 * the same week is the giant's own cloud deck in the cold one's colours, with
 * the giant's own sky over it: the underside of the deck overhead, a big moon in
 * a window torn through it, and a distant anvil standing on the horizon.
 *
 * The shell is a body that draws its own surface (bodies/index.js): from orbit
 * nothing of the terrain is visible but the deck itself, so the orbit's relief
 * cap is only ever covered, never fought with — the shell sits a lift above it
 * and is culled from the inside, so a camera that has landed sees the ground
 * and not the far side of a cloud.
 *
 * The poster's own framing (orbit.fill) stands the shell's edge a hair inside
 * the sheet on all four sides: a giant that sits inside the frame is a marble on
 * a card, and one whose disc runs off every border is a colour field, so the
 * limb and its haze are drawn along every border with the ground left at the
 * corners. The storm and the ring plane are not guessed at from the week's own
 * geometry: they are composed once from the camera the poster is drawn from
 * (update), so the storm rides the face the poster reads and the pair crosses
 * the lower disc at its own open tilt whichever way the week's own subject
 * happens to face, and then they stay where they are in the world while the
 * camera moves round them. The limb's own radius follows the live camera, so the
 * haze always knows where the silhouette falls.
 *
 * Everything is deterministic: one PRNG draw, seeded from the week's name, and
 * the only clock is uTime, for the lanes' slow drift.
 *
 * Hooks (bodies/index.js):
 *   fit       a long week spent out of the weather, and nothing under seven hours
 *   shape     the deck: relief read at a quarter of its height, plus the giant's lanes
 *   palette   the cold one: pale cyan wash, teal shade, hazy sky
 *   companions  the tilted pair of narrow rings
 *   orbit     the poster fill: the limb stands inside the sheet, haze at the rim
 *   create    the deck shell and its limb halo (orbit), the cloud deck and the
 *             sky underfoot, and the pair's plane, composed once and handed to the rings;
 *             the deck's drawing is the gas giant's (giant-shader.js, load)
 */
import { P } from '../params.js';
import { attachTeardown } from '../teardown.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a || 1e-6), 0, 1); return t * t * (3 - 2 * t); };
const num = (value, fallback) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

function hashStr(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

/** A 0–100 float seed from the week's own name: every field of the deck is
 *  drawn from it, so two weeks are never one giant. */
const seedOf = (week) => (hashStr(String(week ?? '')) % 100000) / 1000;

// The gate: seven hours. Below it a giant would be a lie, whatever the weather.
const HOURS_MIN = 7;
const HOURS_FULL = 10.5;

// The pair's own plane, stood off the camera: the open angle is the angle
// between the eye and the plane's own axis, so 75 degrees is an ellipse about a
// quarter as deep as it is wide — a pair whose near arc crosses the lower third
// of the disc and runs off both edges of the sheet, the way Uranus wears hers,
// and not a hula hoop round a marble.
const RING_OPEN = 76 * Math.PI / 180;
// companions.ringTilt opens the plane from a hairline (0, seen edge-on) to the
// open bowl of the default (1), where the near arc crosses the lower third.
const ringOpenFor = (dial) => (90 - 14 * clamp(dial, 0, 1)) * Math.PI / 180;
/** A thread seen near edge-on is compressed by the plane's own openness: a band
 *  a tenth of a radius wide arrives as a hairline. The profile is drawn wide
 *  enough to come back to a drawn thread on the sheet at any tilt, so the pair
 *  reads as two threads and not as two wires. */
const threadScale = (open) => 1 / Math.max(0.22, Math.cos(open));

/** A colour of the week's own palette, moved to another: every body's palette
 *  hook only ever has the wash names (bodies/index.js), so a new pigment is a
 *  clone of one the week already laid and a setStyle on top of it. */
const to = (colour, hex) => colour.clone().setStyle(hex);

// body.tint: an ice giant is as deep as its week was out of doors. All of it under a roof is Uranus, the cold one
// paled toward a celadon cyan; the less of it indoors (a week in cold air outside least of all) the further it turns
// toward Neptune's azure. Every pigment of the cold one but the paper takes the one turn of hue, chroma and value.
// This body takes weeks 68–100% indoors, so the turn is read across 60–100%.
const COLD_KEYS = ['ink', 'inkSoft', 'dark', 'sepia', 'litWarm', 'landLow', 'landMid', 'landHigh', 'crest', 'dry', 'shadeCool',
  'farGlaze', 'stone', 'wood', 'seaShallow', 'seaDeep', 'foam', 'cobalt', 'teal', 'veg', 'bare',
  'skyHigh', 'skyLow', 'skyBand', 'skyWash', 'skyDeep', 'cloudUnder', 'skyHaze'];
function coldTone(features) {
  const tint = clamp(num(P['body.tint'], 0), 0, 1);
  if (!(tint > 0)) return null;
  const u = clamp((num(features?.stats?.indoor, 1) - 0.6) / 0.4, 0, 1); // 0 Neptune … 1 Uranus
  return [(0.10 - 0.14 * u) * tint, (0.10 - 0.14 * u) * tint, (-0.10 + 0.14 * u) * tint];
}

/** The deck's own lanes: the giant's zonal banding, read as gentle steps across
 *  it. Deterministic, allocation-free, and the same field the shell draws its
 *  bands from (in GLSL it is the same warp; here it is a height). */
function lane(dir, ctx) {
  const nz = ctx.nz;
  const warp = (nz(dir.x * 2.4 + 11.0, dir.y * 2.4, dir.z * 2.4) * 2 - 1) * 0.48;
  return Math.cos((dir.y * 3.4 + warp) * TAU) + 0.42 * Math.cos((dir.y * 3.4 + warp) * TAU * 0.5 + 1.7);
}

/* The ring group companions() built, kept so the body's own update can hand it
   its plane and its time: nothing else updates a companion object, and a ring
   whose plane is guessed from the week's geometry is a ring that crosses the
   wrong part of the disc on half the weeks. */
let companionRing = null;

/** The face the camera reads, and the two tangents of its screen — the frame
 *  the storm is drawn in. The direction from the planet's centre to the camera
 *  is the axis of the disc the poster sees: a thing placed there is always on
 *  the face, never on the limb. */
function faceOf(T, camera, out) {
  const eye = out.eye.set(camera.position.x, camera.position.y, camera.position.z);
  if (eye.lengthSq() < 1e-6) eye.set(0.55, 0.72, 0.42);
  eye.normalize();
  const up = out.up.set(0, 1, 0);
  const upDot = eye.dot(up);
  const meridian = out.meridian.copy(up).addScaledVector(eye, -upDot);
  if (meridian.lengthSq() < 1e-6) meridian.set(0, 0, 1);
  meridian.normalize();
  const right = out.right.crossVectors(meridian, eye);
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
  right.normalize();
  return out;
}

/** The two ways out of the weather fit() reads: the cold outdoors, and a roof
 *  (no GPS) that counts for less the hotter the week was outside it. */
function chillOf(stats) {
  const temp = num(stats?.tempC, null);
  const cold = temp == null ? 0 : sstep(19, 5, temp); // 19 °C is no claim; 5 °C is all of it
  const heat = temp == null ? 0 : sstep(24, 33, temp);
  const roof = sstep(0.5, 0.85, num(stats?.indoor, 0)) * (0.32 + 0.68 * (1 - heat));
  return { temp, cold, roof };
}

export default {
  id: 'ice',
  label: 'Ice giant',
  blurb: 'a pale cold giant: deep haze, faint bands, a dark storm, and a thin tipped pair of rings',

  /* The week is long and it was spent out of the weather: outdoors in the cold,
   * or under a roof all week — the same fact the reading's own landmarks read
   * (no GPS, no weather). Under seven hours nothing here claims, a warm week
   * outdoors belongs to some other body, and a week of real heat can only ever
   * reach the floor if the roof was over it all week AND the hours were long:
   * heat outdoors is another world's weather entirely. */
  fit(stats) {
    const hours = num(stats?.hours, 0);
    if (!(hours > HOURS_MIN)) return 0;
    const { cold, roof } = chillOf(stats);
    const chill = Math.max(cold, roof);
    if (chill < 0.12) return 0;
    const volume = sstep(HOURS_MIN, HOURS_FULL, hours);
    return clamp((0.2 + 0.8 * chill) * (0.6 + 0.4 * volume), 0, 1);
  },

  /** Why the week is an ice giant, in plain words: the rule, then the week's own numbers for whichever way out of
   *  the weather counted more. */
  reason(stats) {
    const hours = num(stats?.hours, 0);
    const { temp, cold, roof } = chillOf(stats);
    const indoor = Math.round(num(stats?.indoor, 0) * 100);
    const where = cold >= roof && temp != null ? `at ${Math.round(temp)}\u00a0°C` : indoor === 100 ? 'all of it indoors' : `${indoor}% of it indoors`;
    return `Long weeks out of the weather freeze. That's over ${HOURS_MIN} hours, mostly indoors or in air under 19\u00a0°C. This week: ${hours.toFixed(1)} hours, ${where}.`;
  },

  /* The deck. Whatever ground the world drew is still there: it is read at a
   * quarter of its height, about the week's own smooth ground, so a range becomes
   * the swell a cloud top makes over a mountain and a lagoon becomes a hollow,
   * and the giant's own lanes are laid over the whole of it. Nothing else is
   * touched — the sea's quantile, the footing of every landmark and the race
   * trail all read this height, which is the height the deck is drawn at. */
  shape(dir, h, ctx) {
    const ref = ctx.macro(dir);
    const relief = 0.24;
    return ref + (h - ref) * relief + lane(dir, ctx) * 0.7;
  },

  /* The cold one: one pale cyan-teal wash for the shell and the deck, a deep
   * teal in the shade, a cold haze in the sky. The week's own families are
   * overpainted rather than replaced, so a giant of a hard week is still a
   * harder-looking giant than one of an easy week. */
  palette(pal, features) {
    const paper = pal.paper;
    // The sheet itself stays the week's own warm paper: an ice giant is a cold
    // body ON warm paper, and bleaching the paper to match it threw away the
    // contrast the whole style is built on.
    pal.paper.lerp(to(paper, '#e9efee'), 0.12);
    pal.paperWet.lerp(to(paper, '#d8e4e2'), 0.35);
    pal.ink.lerp(to(paper, '#173741'), 0.74);
    pal.inkSoft.lerp(to(paper, '#38606c'), 0.7);
    pal.dark.lerp(to(paper, '#0b2229'), 0.8);
    pal.sepia.lerp(to(paper, '#58808a'), 0.72);
    pal.litWarm.lerp(to(paper, '#d6ecec'), 0.74);
    pal.landLow.lerp(to(paper, '#6fa6b0'), 0.84);
    pal.landMid.lerp(to(paper, '#93bcc2'), 0.84);
    pal.landHigh.lerp(to(paper, '#54868f'), 0.84);
    pal.crest.lerp(to(paper, '#d8ecea'), 0.82);
    pal.dry.lerp(to(paper, '#a9c9cb'), 0.84);
    pal.shadeCool.lerp(to(paper, '#245566'), 0.72);
    pal.farGlaze.lerp(to(paper, '#9fb9bf'), 0.72);
    pal.stone.lerp(to(paper, '#a8bcbd'), 0.72);
    pal.wood.lerp(to(paper, '#577075'), 0.62);
    pal.seaShallow.lerp(to(paper, '#63a3b1'), 0.8);
    pal.seaDeep.lerp(to(paper, '#123646'), 0.74);
    pal.foam.lerp(to(paper, '#e6f1ef'), 0.72);
    pal.cobalt.lerp(to(paper, '#27596f'), 0.72);
    pal.teal.lerp(to(paper, '#4f9ea9'), 0.74);
    // the lowland is bare haze, not fields: a giant grows nothing
    pal.veg.lerp(to(paper, '#7f9ea0'), 0.7);
    pal.bare.lerp(to(paper, '#7f9ea0'), 0.7);
    pal.vegAmt = Math.min(pal.vegAmt, -0.3);
    // The sky underfoot: a cloud deck's own weather, not a bright day on Earth.
    // Everything is pulled toward the body's grey-teal, hard: a denim sky over a
    // chalk ground was the loudest thing wrong with the landing.
    const sky = (colour, hex, amount) => colour.lerp(to(paper, hex), amount);
    sky(pal.skyHigh, '#9db7bf', 0.86);
    sky(pal.skyLow, '#dfe9e6', 0.9);
    sky(pal.skyBand, '#e8efec', 0.9);
    sky(pal.skyWash, '#b9ccd1', 0.88);
    sky(pal.skyDeep, '#7e98a3', 0.86);
    sky(pal.cloudUnder, '#cfdcdc', 0.86);
    sky(pal.skyHaze, '#dae6e6', 0.92);
    if (pal.skyScheme) {
      // and the haze hangs low: no bright glaze overhead, the whole sky one wash
      pal.skyScheme.x = Math.min(pal.skyScheme.x, 0.02);
      pal.skyScheme.y = Math.max(pal.skyScheme.y, 0.30);
    }
    const tone = coldTone(features);
    if (tone) for (const key of COLD_KEYS) pal[key]?.offsetHSL(...tone);
    return pal;
  },

  /* The poster: a giant that sits inside the frame is a marble on a card, and a
   * giant whose disc runs off every border is a colour field — the limb has to
   * be read somewhere. At 0.86 the shell's own edge stands a hair inside the
   * frame on all four sides, so the curve of the limb and its haze are drawn
   * along every border, the ground keeps the corners, and the storm, the bands
   * and the pair all stand well inside the crop. The closest orbit (floor, over
   * R) is held where the storm still reads as a storm: an ice giant's face is
   * broad washes, and from nearer it is one flat teal. */
  orbit: { fill: 0.86, floor: 100 },

  /* The rings: a pair of thin soot-dark threads in one plane, tipped across the
   * disc the way Uranus wears hers. companions.ringTilt opens the plane from
   * nearly edge-on (0) to the open ellipse of the default (1). */
  companions(ctx) {
    const { THREE: T, features, palette: pal, uniforms } = ctx;
    const R = num(ctx.R, 120);
    const light = uniforms.uSunDir;
    const sun = (light?.value || new T.Vector3(0.55, 0.72, 0.42)).clone().normalize();
    const seed = seedOf(features?.week);
    const dial = clamp(num(P['companions.ringTilt'], 1), 0, 1);
    const open = ringOpenFor(dial);
    const scale = threadScale(open);

    const aMid = R * 1.19;    // the inner thread
    const bMid = R * 1.285;   // the outer one, a shade broader
    const aW = R * 0.0028 * scale;
    const bW = R * 0.0032 * scale;
    const inner = R * 1.13;
    const outer = R * 1.34;

    const group = new T.Group();
    group.name = 'companion-ice-ring';
    group.userData.reach = 1.31;
    const frame = new T.Group();
    frame.name = 'companion-ice-ring-plane';
    frame.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), new T.Vector3(0, 1, 0));
    group.add(frame);

    // the pair is drawn in the palette's own darks — a ring of an ice giant is
    // not gold, it is soot in the sky
    const dark = pal.ink.clone().lerp(pal.dark || pal.ink, 0.6);
    const dusk = pal.shadeCool.clone().lerp(pal.ink, 0.5);
    const dust = pal.farGlaze.clone().lerp(pal.shadeCool, 0.5);
    const ringN = { value: new T.Vector3(0, 1, 0) };
    const shared = {
      uSunDir: light || { value: sun },
      uPaper: { value: pal.paper.clone() },
      uDark: { value: dark },
      uDusk: { value: dusk },
      uDust: { value: dust },
      uSeed: { value: seed },
      uRingN: ringN,
      uBand: { value: new T.Vector4(aMid, aW, bMid, bW) },
      uRingR: { value: new T.Vector2(inner, outer) },
      uR: { value: R },
      uSea: { value: num(features?.seaLevel, 0) },
    };
    const mat = new T.ShaderMaterial({
      uniforms: { ...shared, uTime: uniforms.uTime },
      vertexShader: ICE_RING_VERT,
      fragmentShader: ICE_RING_FRAG,
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
      // a ringlet band must not rewrite the frame's own alpha: the ink pass reads
      // it (the sea's clear water) and a ring over the water would turn the
      // horizon into land
      blending: T.CustomBlending,
      blendSrc: T.SrcAlphaFactor,
      blendDst: T.OneMinusSrcAlphaFactor,
      blendSrcAlpha: T.ZeroFactor,
      blendDstAlpha: T.OneFactor,
    });
    const washer = new T.Mesh(new T.RingGeometry(inner, outer, 512, 1), mat);
    washer.name = 'companion-ice-ring-washer';
    // the pair is drawn AFTER the deck: both are transparent, and a deck that
    // happens to sort first would paint straight over the threads crossing it
    washer.renderOrder = 2;
    frame.add(washer);
    // what the pair was drawn from, for the eye and the bench
    group.userData.rings = { inner, outer, aMid, bMid, aW, bW, dial, open, seed, ringN };
    // the pair's own teardown: the washer's geometry and material, hung where
    // the page's own sweep of the companions group can find it (and where this
    // body's dispose calls it)
    attachTeardown(group);
    companionRing = { group, frame, mat, ringN, R, open, band: { inner, outer, aMid, bMid, aW, bW } };
    return group;
  },

  load: () => import('./giant-shader.js'),
  create(shared, { DECK_GROUND, DECK_LIFT, createCeiling }) {
    const { THREE: T, features, palette: pal } = shared;
    const R = num(shared.R, 120);
    const cap = num(features?.orbit?.reliefCap, 12);
    const shellR = R + Math.max(cap, 6) + 2.0;
    const seed = seedOf(features?.week);
    const sun = (shared.light?.value || shared.uniforms?.uSunDir?.value || new T.Vector3(0.55, 0.72, 0.42)).clone().normalize();
    const stats = features?.stats || {};
    const hours = num(stats.hours, 8);

    // ---- the storm's own size: it grows with the week (a ten-hour week carries
    // a bigger one than a seven-hour week) and it is placed on the face the
    // poster's camera reads, a hand's width off the disc's centre (update).
    const stormK = clamp((hours - 7) / 6, 0, 1) * 0.75 + 0.25;
    const stormX = 0.045 + 0.110 * stormK;   // half the oval's long side, in radians
    const stormY = stormX * 0.46;

    // ---- the plane of the pair, composed with the storm and handed to the rings (update)
    const ringN = companionRing ? companionRing.ringN : { value: new T.Vector3(0, 1, 0) };
    // the same pair the companions() drew, so the shadow across the deck is the
    // shadow of the very threads that cross it
    const band = companionRing?.band
      || { inner: R * 1.13, outer: R * 1.34, aMid: R * 1.19, bMid: R * 1.285, aW: R * 0.0028 * threadScale(RING_OPEN), bW: R * 0.0032 * threadScale(RING_OPEN) };
    const ringA = band.aMid, ringAw = band.aW, ringB = band.bMid, ringBw = band.bW;
    const ringIn = band.inner, ringOut = band.outer;

    // ---- the shell's own colours, out of the week's palette (see palette()).
    // A pale giant: the deep haze of a band is a loaded teal, the body of the
    // deck a pale cyan, and the top of it is nearly the paper — the disc has to
    // read as the LIGHT thing on warm paper, with the storm the only committed
    // dark in it (the palette's own lands are the painted ground underfoot, and
    // they are laid darker than the haze above them).
    const deckLo = pal.seaShallow.clone().lerp(pal.teal, 0.55);
    const tone = coldTone(features);
    const deckMid = pal.teal.clone().lerp(tone ? to(pal.teal, '#8fc3c8').offsetHSL(...tone) : to(pal.teal, '#8fc3c8'), 0.55);
    const deckHi = pal.crest.clone().lerp(pal.paper, 0.42);
    const shade = pal.shadeCool.clone().lerp(pal.seaShallow, 0.35);
    const stormC = pal.seaDeep.clone().lerp(pal.ink, 0.5);
    const haze = pal.paper.clone().lerp(pal.crest, 0.55);
    const cloudC = pal.paper.clone().lerp(pal.crest, 0.08);

    const uniforms = {
      uSunDir: shared.light || { value: sun },
      uPaper: { value: pal.paper.clone() },
      uInk: { value: pal.ink.clone() },
      uDeckLo: { value: deckLo },
      uDeckMid: { value: deckMid },
      uDeckHi: { value: deckHi },
      uShade: { value: shade },
      uStorm: { value: stormC },
      uHaze: { value: haze },
      uCloud: { value: cloudC },
      uSpot: { value: new T.Vector3(0, 0, 1) },
      uSpotT1: { value: new T.Vector3(1, 0, 0) },
      uSpotT2: { value: new T.Vector3(0, 1, 0) },
      uSpotK: { value: stormK },
      uSpotX: { value: stormX },
      uSpotY: { value: stormY },
      uRingN: ringN,
      uBand: { value: new T.Vector4(ringA, ringAw, ringB, ringBw) },
      uRingR: { value: new T.Vector2(ringIn, ringOut) },
      uRings: { value: 1 },
      uSeed: { value: seed },
      uTime: { value: 0 },
      uFade: { value: 1 },
      uR: { value: R },
      // where the shell's own silhouette falls, so the limb haze is read as a
      // radius on the disc and not as a cosine that never quite gets there
      uSinLimb: { value: 0.93 },
      // body.form: the shell's own light (see its blocks in ICE_DECK_FRAG)
      uForm: { value: P['body.form'] },
      // light.form: the bright limb only where the light is, and the face
      // graded by it (see its blocks in ICE_DECK_FRAG and ICE_HALO_FRAG)
      uLForm: { value: num(P['light.form'], 0) },
    };

    const group = new T.Group();
    group.name = 'body-ice-giant';

    const shellGeo = new T.SphereGeometry(shellR, 256, 168);
    const shellMat = new T.ShaderMaterial({
      uniforms,
      vertexShader: ICE_DECK_VERT,
      fragmentShader: ICE_DECK_FRAG,
      transparent: true,
      depthWrite: true,
      side: T.FrontSide,
    });
    const shell = new T.Mesh(shellGeo, shellMat);
    shell.name = 'body-ice-giant-deck';
    group.add(shell);

    // ---- the halo: the last of the haze, standing a hair outside the deck's
    // own edge, so the air crosses the silhouette and bleeds onto the paper
    // instead of stopping dead on a drawn contour. It is a ring and not a shell:
    // its alpha is nothing except where its own limb turns away.
    const haloR = shellR * 1.014;
    const haloGeo = new T.SphereGeometry(haloR, 192, 128);
    const haloMat = new T.ShaderMaterial({
      uniforms: {
        uHaze: { value: pal.crest.clone().lerp(pal.teal, 0.45) },
        uSeed: { value: seed },
        uSinLimb: uniforms.uSinLimb,
        uFade: uniforms.uFade,
        uSunDir: uniforms.uSunDir,
        uLForm: uniforms.uLForm,
      },
      vertexShader: ICE_DECK_VERT,
      fragmentShader: ICE_HALO_FRAG,
      transparent: true,
      depthWrite: false,
      side: T.FrontSide,
      blending: T.NormalBlending,
    });
    const halo = new T.Mesh(haloGeo, haloMat);
    halo.name = 'body-ice-giant-halo';
    halo.renderOrder = 3; // over the deck, under the rings
    group.add(halo);

    // ---- the sky underfoot: the giant's own ceiling (giant-shader.js), in the
    // cold one's pigments — the deck's teal underside, a big pale moon standing
    // in a window torn through it, a distant anvil and no great spot's wall —
    // over the same pale air the far deck closes into, so the two meet without
    // a seam. The pair and the week's ring are companions, hidden on foot.
    const skyR = R + DECK_LIFT;
    const sky = createCeiling(T, {
      pal, light: shared.light, time: shared.uniforms.uTime, features, R, radius: skyR,
      glow: pal.paper.clone().lerp(pal.crest, 0.55),
      shade: pal.shadeCool.clone().lerp(pal.seaShallow, 0.45),
      high: pal.shadeCool.clone().lerp(pal.cobalt, 0.45).lerp(pal.paper, 0.16),
      moons: [to(pal.paper, '#ddd3bd').lerp(pal.paper, 0.35), pal.teal.clone().lerp(pal.paper, 0.40)],
      moonScale: 1.3,
      tower: { near: 0.52, at: 0.30 },
      belts: 6.8,
      tear: 0.8,
    });
    group.add(sky.mesh);

    const insideSq = (shellR + 4) * (shellR + 4);
    const uTime = uniforms.uTime;
    const uFade = uniforms.uFade;
    const skyK = skyR * 0.09;
    const uSinLimb = uniforms.uSinLimb;
    const uSpot = uniforms.uSpot;
    const uSpotT1 = uniforms.uSpotT1;
    const uSpotT2 = uniforms.uSpotT2;
    const spotAngle = 0.085 + 0.055 * ((seed * 0.371) % 1); // a hand off the centre
    const spotRoll = TAU * ((seed * 0.618) % 1);            // and the oval's own lean
    const face = {
      eye: new T.Vector3(0, 0, 1), up: new T.Vector3(0, 1, 0), meridian: new T.Vector3(0, 1, 0), right: new T.Vector3(1, 0, 0),
    };
    const _axis = new T.Vector3();
    const _axis2 = new T.Vector3();
    const ringFwd = new T.Vector3(0, 0, 1);
    // the plane's own lean across the sheet: a bowl whose ends rise level is a
    // hoop, whatever it is drawn with, so the axis is rolled off the meridian
    const ringRoll = (0.10 + 0.22 * ((seed * 0.913) % 1)) * (seed % 2 < 1 ? 1 : -1);
    const stormTilt = (0.05 + 0.16 * ((seed * 0.771) % 1)) * (hours >= 9 ? 1 : 0.6);
    // composed once (see update), then held in the world
    let stood = false;

    function update({ camera, surface, time, mode } = {}) {
      const t = num(time, 0);
      uTime.value = t;
      const mix = clamp(num(surface, 0), 0, 1);
      const presence = 1 - sstep(0.02, 0.18, mix);
      uFade.value = presence;
      uniforms.uForm.value = P['body.form'];
      uniforms.uLForm.value = num(P['light.form'], 0);
      const under = !!(camera && camera.position.lengthSq() < insideSq);

      // ---- the face the poster reads, and the plane of the pair: composed from
      // the camera the poster is drawn from — the storm a hand up and to the side
      // of the disc's centre (so it is never the pupil of an eye), the rings
      // crossing its lower face at their own open tilt — and then held in the
      // world, so turning the camera turns the view of the giant and never the
      // giant. The poster's camera is the first frame in steady orbit; a page
      // that opens on foot rides the flight up with the eye and composes on
      // arrival. After that only the deck's own clock (uTime) moves on it.
      if (camera) {
        const d0 = Math.max(shellR + 1, camera.position.length() || shellR + 1);
        uSinLimb.value = Math.sqrt(Math.max(0.05, 1 - (shellR / d0) * (shellR / d0)));
      }
      if (camera && !under && !stood) {
        stood = mode !== 'surface';
        faceOf(T, camera, face);
        const dir = _axis.copy(face.eye).multiplyScalar(Math.cos(spotAngle))
          .addScaledVector(face.meridian, Math.sin(spotAngle) * 0.78)
          .addScaledVector(face.right, Math.sin(spotAngle) * 0.62)
          .normalize();
        uSpot.value.copy(dir);
        // the oval's own frame: its long side laid across its weather, leaning
        const t1 = uSpotT1.value.copy(face.right).multiplyScalar(Math.cos(spotRoll))
          .addScaledVector(face.meridian, Math.sin(spotRoll)).normalize();
        uSpotT2.value.crossVectors(dir, t1).normalize();
        // the plane: its own axis stands RING_OPEN off the eye, tipped toward
        // the world's pole, so the pair crosses the disc and runs off the sheet
        const open = companionRing ? companionRing.open : RING_OPEN;
        const lean = _axis2.copy(face.meridian).multiplyScalar(Math.cos(ringRoll))
          .addScaledVector(face.right, Math.sin(ringRoll)).normalize();
        const axis = _axis.copy(face.eye).multiplyScalar(Math.cos(open))
          .addScaledVector(lean, Math.sin(open)).normalize();
        ringN.value.copy(axis);
        if (companionRing) companionRing.frame.quaternion.setFromUnitVectors(ringFwd, axis);
      }
      if (companionRing) companionRing.group.visible = presence > 0.5;
      // on foot the pair is not drawn: a ring seen from under the cloud tops is
      // a wheel of spokes across the sky, not a ring, and the deck is the place

      // a shell at three quarters of its fade must not hold depth against the
      // ground behind it: while it thins, the deck is a haze the terrain shows
      // through, and only a full deck stands solid in front of the world
      shellMat.depthWrite = presence > 0.985;
      shell.visible = presence > 0.004 && !under;
      halo.visible = presence > 0.004 && !under;
      // under the deck the deck is overhead, as on the giant
      sky.update(camera, camera ? clamp((skyR - camera.position.length()) / skyK, 0, 1) : 0);
    }

    function dispose() {
      haloGeo.dispose();
      haloMat.dispose();
      shellGeo.dispose();
      shellMat.dispose();
      sky.dispose();
      if (group.parent) group.parent.remove(group);
      // the tilted pair is the deck's own companion object: its geometry and
      // material are released with the deck, not stranded for the page's sweep
      // of the companions group to find or miss
      companionRing?.group?.userData?.dispose?.();
      companionRing = null;
    }

    // what the giant was drawn from, for the eye and the bench
    group.userData.deck = {
      shellR, seed, hours,
      stormK, stormX, stormY, spotAngle, spotRoll,
      ringA, ringB, ringOpenDeg: RING_OPEN * 180 / Math.PI,
    };
    // underfoot the ground is the giant's own cloud deck (giant-shader.js's
    // DECK_GROUND) in the cold one's colours: softer heads, the lanes barely
    // banded, the far deck going into the same pale air the sky's horizon is
    // laid in; and a deck of cloud holds nothing up, so no landmark stands on it
    const ground = {
      glsl: DECK_GROUND,
      uniforms: {
        uGdGlow: sky.uniforms.uGlow,
        uGdShade: sky.uniforms.uShade,
        uGdTear: sky.uniforms.uTear,
        uGdBelts: { value: 6.8 },
        uGdBand: { value: 1.5 },
        uGdPuff: { value: 3.2 },
      },
    };
    return { object: group, update, dispose, ground, props: false, sky: true };
  },
};

/* ------------------------------------------------------------------- glsl -- */

// The same value noise the rest of the sheet is drawn with, so nothing here
// draws a pattern the ink shaders would not.
const ICE_NOISE = /* glsl */ `
float igHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float igNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float a = igHash(i);
  float b = igHash(i + vec3(1.0, 0.0, 0.0));
  float c = igHash(i + vec3(0.0, 1.0, 0.0));
  float d = igHash(i + vec3(1.0, 1.0, 0.0));
  float e = igHash(i + vec3(0.0, 0.0, 1.0));
  float f1 = igHash(i + vec3(1.0, 0.0, 1.0));
  float g = igHash(i + vec3(0.0, 1.0, 1.0));
  float h = igHash(i + vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y),
             mix(mix(e, f1, f.x), mix(g, h, f.x), f.y), f.z);
}
`;

// The pair's own profile: two narrow threads and the whisper of dust between
// them. Shared by the rings themselves and by the shadow they lay on the cloud
// tops, so what crosses the deck is the very pair that is drawn.
const ICE_RING_PROFILE = /* glsl */ `
uniform vec4 uBand;      // x: inner thread's radius, y: its half width, z, w: the outer one
uniform vec2 uRingR;     // the pair's own span, inner edge to outer
float igRingAmt(float r) {
  float a = 1.0 - smoothstep(uBand.y * 0.5, uBand.y * 1.35, abs(r - uBand.x));
  float b = 1.0 - smoothstep(uBand.w * 0.5, uBand.w * 1.35, abs(r - uBand.z));
  float mid = (uBand.x + uBand.z) * 0.5;
  float span = max(1e-3, uBand.z - uBand.x);
  float dust = (1.0 - smoothstep(0.0, span * 1.4, abs(r - mid))) * 0.02;
  return clamp(max(a, max(b * 0.92, dust)), 0.0, 1.0);
}
`;

const ICE_DECK_VERT = /* glsl */ `
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

const ICE_DECK_FRAG = /* glsl */ `
${ICE_NOISE}
${ICE_RING_PROFILE}
varying vec3 vDir;
varying vec3 vWorld;
varying vec3 vNrm;
uniform vec3 uSunDir;
uniform vec3 uPaper, uInk, uDeckLo, uDeckMid, uDeckHi, uShade, uStorm, uHaze, uCloud, uSpot, uSpotT1, uSpotT2;
uniform vec3 uRingN;
uniform float uSpotK, uSpotX, uSpotY, uRings, uSeed, uTime, uFade, uR, uSinLimb;
uniform float uForm;   // body.form
uniform float uLForm;  // light.form
void main() {
  vec3 d = normalize(vDir);
  vec3 N = normalize(vNrm);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 L = normalize(uSunDir);
  float mu = clamp(dot(N, V), 0.0, 1.0);
  float nl = dot(N, L);

  // ---- the haze: broad bands combed along the latitude, each one warped by its
  // own weather so none can be traced from one side of the disc to the other,
  // and each coming and going by longitude. Nothing here is ruled.
  float broad = igNoise(d * 2.4 + uSeed * 0.31);
  float life = igNoise(vec3(d.x * 2.0, d.y * 0.8, d.z * 2.0) + uSeed * 0.73);
  float lat = d.y * 3.4 + (broad - 0.5) * 0.95;
  float band = 0.5 + 0.5 * sin(lat * 6.28318 + (life - 0.5) * 0.8);
  band = pow(band, 1.8);
  float shown = smoothstep(0.10, 0.78, life);
  float load = band * shown;
  // the haze inside a band is combed along it: long streaks that drift
  float drift = uTime * 0.005;
  float comb = igNoise(vec3(d.x * 3.0 + drift, d.y * 9.0, d.z * 3.0 - drift * 0.6) + uSeed * 1.3);
  float fine = igHash(d * 24.0 + vec3(0.0, uTime * 0.008, 0.0) + uSeed * 2.3);

  vec3 c = uDeckMid;
  c = mix(c, uDeckLo, clamp(load * 0.56, 0.0, 1.0));
  c = mix(c, uDeckHi, clamp((1.0 - load) * (0.24 + 0.28 * comb), 0.0, 1.0) * 0.4);
  c *= 0.97 + 0.07 * fine;

  // ---- the light. The poster's light is turned toward the painter, so a shell
  // under it has no terminator to be read by — the form is the turn of the wash:
  // the face the light comes over stands loaded, the far side cools toward the
  // shade, and the real sun's own soft terminator is laid under it for the weeks
  // that ask for one (light.terminator).
  vec3 Lt = L - V * dot(L, V);
  float across = dot(N, normalize(Lt + vec3(1e-5))) * (1.0 - 0.22 * mu);
  float turn = smoothstep(-0.95, 0.80, across);
  c = mix(c * 0.90 + uShade * 0.09, c, 0.22 + 0.78 * turn);
  float lam = clamp(nl * 0.55 + 0.45, 0.0, 1.0);
  c = mix(mix(uShade, c, 0.62), c, lam);
  // body.form: the face is the deck's loaded teal and not a pale wash of it
  c = mix(c, uDeckLo, 0.18 * uForm);

  // ---- the limb: a deep haze turns to light where the shell turns away, and
  // that light is the sheet's own paper seen through the last of the air. The
  // brightening is not a ring: the paper is left to break it where the sheet's
  // tooth is high, and it runs widest where the sun is over it. This is what
  // lets the disc bleed into the page instead of ending on a drawn contour.
  float cosB = clamp(dot(N, normalize(cameraPosition)), 0.0, 1.0);
  float frac = sqrt(max(0.0, 1.0 - cosB * cosB)) / max(1e-3, uSinLimb);
  // (body.form: the haze is gathered nearer the edge and onto the lit limb, so
  // the face keeps its teal and the side turned away does not bleach to paper;
  // light.form narrows it further and lets it out altogether where the light
  // is not: the limb turned from the sun is the deck's own teal to its edge)
  float rim = pow(clamp(frac, 0.0, 1.0), 2.0 + 1.4 * uForm + 3.0 * uLForm);
  float limbN = igNoise(vec3(d.z * 3.1, d.x * 3.1, uSeed * 2.0));
  float limb = rim * (0.92 + 0.52 * limbN) * (0.55 + 0.6 * clamp(nl + 0.35, 0.0, 1.0));
  limb *= mix(1.0, 0.25 + 0.75 * smoothstep(-0.30, 0.45, nl), uForm);
  limb *= mix(1.0, smoothstep(-0.05, 0.40, nl), uLForm);
  c = mix(c, uHaze, clamp(limb, 0.0, 0.97));
  // ---- body.form. The shell turns from the light as a mass of deep air: a
  // half-light graded across the face in the deck's own deep teal, the side
  // turned away sunk into it, and a soft sheen of the sheet where the light is
  // mirrored off the haze tops, so the disc reads as a ball of air in a light.
  if (uForm > 0.0) {
    vec3 deepT = uDeckLo / max(max(uDeckLo.r, uDeckLo.g), max(uDeckLo.b, 1e-3)) * 0.84;
    float halfL = (1.0 - smoothstep(-0.05, 0.85, nl)) * 0.30 + (1.0 - smoothstep(-0.50, 0.02, nl)) * 0.30;
    c *= mix(vec3(1.0), deepT, halfL * uForm);
    float sheen = pow(max(dot(N, normalize(L + V)), 0.0), 18.0);
    c = mix(c, uPaper, sheen * 0.22 * uForm);
  }
  // ---- light.form. Inside its value the face turns as a ball and not as a
  // lit plate: a graded half-tone of the deck's own deep teal laid from the
  // face square to the light toward the terminator.
  if (uLForm > 0.0) {
    vec3 deepF = uDeckLo / max(max(uDeckLo.r, uDeckLo.g), max(uDeckLo.b, 1e-3)) * 0.90;
    c *= mix(vec3(1.0), deepF, (1.0 - smoothstep(-0.20, 0.90, nl)) * 0.32 * uLForm);
  }

  // ---- the storm: one broad oval drawn in the deck's own weather frame, its
  // edge torn by the haze it stands in, its middle the one committed dark on the
  // sheet, a collar of cloud loaded along its leading flank, and the white
  // companions riding off its trailing one the way a real spot is photographed.
  vec3 sd = normalize(uSpot);
  vec3 t1 = normalize(uSpotT1);
  vec3 t2 = normalize(uSpotT2);
  vec3 rel = d - sd;
  float sx = dot(rel, t1) / max(uSpotX, 1e-4);
  float sy = dot(rel, t2) / max(uSpotY, 1e-4);
  // the oval is drawn, not cut: its edge torn by the haze it stands in, and its
  // middle broken by lighter tongues of that haze — which is what keeps a dark
  // spot from reading as a pupil in an eye
  float rag = igNoise(vec3(sx * 1.5, sy * 2.8, uSeed)) - 0.5;
  float bite = igNoise(vec3(sx * 2.1 + 3.0, sy * 3.2, uSeed * 1.3)) - 0.5;
  float q = length(vec2(sx, sy)) * (1.0 + 0.58 * rag + 0.28 * bite);
  float tongue = smoothstep(0.34, 0.95, igNoise(vec3(sx * 2.4, sy * 1.05, uSeed + 31.0)));
  float core = (1.0 - smoothstep(0.30, 0.88, q)) * (1.0 - 0.34 * tongue);
  // the collar is not an iris: the cloud is loaded on the storm's leading flank
  // and thins to nothing on the trailing one, where the companions ride
  float lead = smoothstep(-1.2, 1.0, sx * 0.85 + sy * 0.4);
  float collar = (1.0 - smoothstep(0.90, 1.34, q)) * (1.0 - core);
  float shade2 = 0.62 + 0.38 * lam;
  c = mix(c, uStorm, core * (0.55 + 0.45 * uSpotK) * 0.95 * shade2);
  c = mix(c, uCloud, collar * (0.06 + 0.30 * lead) * (0.45 + 0.55 * lam));
  // the companions: dabs of white thrown off the trailing flank, each with its
  // own torn edge, spaced so the train never reads as a row
  vec2 cp = vec2(sx, sy);
  float dabN = igNoise(vec3(sx * 2.9, sy * 3.4, uSeed + 5.0)) - 0.5;
  float clear = smoothstep(0.95, 1.30, q);
  float dab1 = 1.0 - smoothstep(0.26, 1.05, length((cp - vec2(2.15, -1.05)) / vec2(1.00, 0.38)) * (1.0 + 0.50 * dabN));
  float dab2 = 1.0 - smoothstep(0.30, 1.05, length((cp - vec2(3.45, -1.95)) / vec2(0.66, 0.30)) * (1.0 - 0.50 * dabN));
  float dab3 = 1.0 - smoothstep(0.26, 1.05, length((cp - vec2(0.05, 1.85)) / vec2(0.68, 0.26)) * (1.0 + 0.50 * dabN));
  float train = smoothstep(0.55, 0.95, dabN + 0.5) * (1.0 - smoothstep(1.1, 2.0, q));
  float cloud = clamp(max(max(dab1, dab2 * 0.85), max(dab3 * 0.7, train * 0.20)), 0.0, 1.0) * (1.0 - smoothstep(3.8, 6.6, q)) * uSpotK;
  c = mix(c, uCloud, cloud * clear * 0.74 * (0.5 + 0.5 * lam));
  // and a few wisps elsewhere, thin enough to read as weather and not as spots
  float wisp = smoothstep(0.22, 0.42, comb) * smoothstep(0.30, 0.02, abs(broad - 0.5)) * (1.0 - cloud) * (1.0 - core);
  c = mix(c, uCloud, wisp * 0.10);

  // ---- the pair's shadow, laid across the cloud tops: where the ray from this
  // fragment toward the sun leaves the ring's own plane, read at the radius it
  // crosses there. Nothing is cast where the sun is down, and the mark is a
  // whisper: the rings are soot, not a bar.
  if (uRings > 0.5 && nl > 0.0) {
    float den = dot(L, uRingN);
    if (abs(den) > 1e-3) {
      float tt = -dot(vWorld, uRingN) / den;
      if (tt > 0.0) {
        float rr = length(vWorld + L * tt);
        c = mix(c, uInk, igRingAmt(rr) * 0.035 * clamp(nl * 1.6, 0.0, 1.0));
      }
    }
  }

  gl_FragColor = vec4(c, uFade);
}
`;

const ICE_HALO_FRAG = /* glsl */ `
${ICE_NOISE}
varying vec3 vDir;
varying vec3 vWorld;
varying vec3 vNrm;
uniform vec3 uHaze, uSunDir;
uniform float uSeed, uSinLimb, uFade;
uniform float uLForm;  // light.form: the halo only on the lit limb, and narrower
void main() {
  vec3 d = normalize(vDir);
  vec3 N = normalize(vNrm);
  float cosB = clamp(dot(N, normalize(cameraPosition)), 0.0, 1.0);
  float frac = clamp(sqrt(max(0.0, 1.0 - cosB * cosB)) / max(1e-3, uSinLimb), 0.0, 1.0);
  // nothing but a hand's width at the very edge, and nothing at all AT the edge
  // itself: a bloom that ends on a line would be the contour again, in pale
  // (light.form: a narrower hand, and only where the light is on the limb)
  float ring = smoothstep(mix(0.930, 0.962, uLForm), 0.997, frac) * (1.0 - smoothstep(0.9985, 1.0, frac));
  float torn = 0.40 + 0.80 * igNoise(vec3(d.z * 4.1, d.x * 4.1, uSeed * 3.1));
  float amt = ring * torn * 0.72 * uFade * mix(1.0, smoothstep(-0.10, 0.40, dot(N, normalize(uSunDir))), uLForm);
  if (amt < 0.004) discard;
  gl_FragColor = vec4(uHaze, clamp(amt, 0.0, 0.78));
}
`;

const ICE_RING_VERT = /* glsl */ `
varying vec2 vPlane;
varying vec3 vWorld;
varying vec3 vNrm;
void main() {
  vPlane = position.xy;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNrm = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const ICE_RING_FRAG = /* glsl */ `
${ICE_NOISE}
${ICE_RING_PROFILE}
varying vec2 vPlane;
varying vec3 vWorld;
varying vec3 vNrm;
uniform vec3 uSunDir, uPaper, uDark, uDusk, uDust, uRingN;
uniform float uSeed, uTime, uR, uSea;
void main() {
  vec3 N = normalize(vNrm);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 L = normalize(uSunDir);
  float r = length(vPlane);
  float ang = atan(vPlane.y, vPlane.x);
  vec2 orb = vec2(cos(ang), sin(ang));

  // the hand: the pair is not ruled. The radius it is read at wanders with its
  // own angle — a hairline ring ruled straight reads as wire, and this pair is
  // drawn — but the wander is small, because two threads have to read as two
  // threads at 460 px and not as a smear.
  float w1 = igNoise(vec3(orb * 2.6, uSeed * 0.7)) - 0.5;
  float w2 = igNoise(vec3(orb * 8.5, uSeed * 1.7 + 13.0)) - 0.5;
  float rw = r + (w1 * 0.55 + w2 * 0.22) * (uBand.y + uBand.w) * 0.45;
  float load = igRingAmt(rw);
  // the grains along the thread are the dust it is made of
  float grain = igNoise(vec3(orb * 220.0, r * 0.9 + uSeed));
  load *= 0.55 + 0.75 * grain;
  // a stretched hoop is not machined: a long arc of the pair is laid heavier
  // than the rest, and a stretch of it is thin but never absent
  float thick = smoothstep(0.20, 0.80, igNoise(vec3(orb * 1.5 + 17.0, uSeed * 3.0)));
  load *= 0.62 + 0.62 * thick;
  // and the pair is drawn: it is laid heavier at one end of the arc and thins
  // away round the far side, the way a loaded brush runs out
  load *= 0.42 + 0.68 * smoothstep(-1.0, 1.0, cos(ang - uSeed));
  float breakUp = igNoise(vec3(orb * 2.1 + 5.0, uSeed * 2.7));
  if (breakUp < 0.04) discard;
  load *= 0.45 + 0.75 * smoothstep(0.04, 0.45, breakUp);
  if (load < 0.01) discard;

  // the light: a ring catches what the sun's own elevation over its plane gives
  // it, and the planet's shadow is inked across the far half of the pair
  float sunPlane = dot(N, L);
  float lit = abs(sunPlane);
  float face = smoothstep(-0.06, 0.06, dot(N, V) * sunPlane);
  float Rs = uR + uSea;
  float b = dot(vWorld, L);
  float hit = b * b - (dot(vWorld, vWorld) - Rs * Rs);
  float shadow = (b < 0.0 ? smoothstep(0.0, 2.0 * Rs * 4.0, hit) : 0.0) * 0.8;

  // the wash: soot laid on the sheet, the far side of the pair a step cooler,
  // and the shadow drawn as more pigment rather than as a veil
  vec3 hue = mix(uDark, uDusk, clamp(1.0 - lit, 0.0, 1.0));
  float deep = clamp(load * (0.9 + 0.5 * lit), 0.0, 1.5);
  vec3 ratio = hue / max(uPaper, vec3(0.03));
  vec3 col = uPaper * pow(max(ratio, vec3(0.030)), vec3(deep));
  col = mix(col, col * 0.45 + uDusk * 0.05, shadow);
  col = mix(col, mix(col, uDust, 0.5), (1.0 - face) * 0.16);
  float cover = clamp(pow(clamp(load, 0.0, 1.0), 0.34), 0.0, 1.0) * (0.55 + 0.45 * lit) * (1.0 - 0.5 * shadow);
  if (cover < 0.006) discard;
  gl_FragColor = vec4(col, cover);
}
`;

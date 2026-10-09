/* Planet Creator — the lava world's crust: what the week's rock is painted in,
 * and which of its sessions are the vents the crust opens at.
 *
 * A hot, hard week is ground that is still cooling: basalt that has gone black
 * where it set, ash pale on the crests it was blown onto, and a sea of its own
 * melt. The palette hook repaints ink's own washes in that register rather than
 * inventing a second one — every name it touches is a name ink.js already reads
 * (landLow/landMid/landHigh/crest, the sea's three, the sky's, the one committed
 * dark, the mineral accent) — so the wash pass, the ink pass, the prints, the
 * objects and the ground underfoot all follow without knowing anything happened.
 * The repaint is tempered by how hot the week actually was (heatOf): a week at
 * 25 °C that was hammered is charcoal over its own ground, and the hottest weeks
 * of the year are the blackest.
 *
 * The vents are the week's own hard sessions, read off the zones the record
 * keeps: a session whose heart-rate time was mostly above threshold, or that
 * stood above it long enough to matter, is a place the ground opens. They are
 * read here because both the glow (lava-flow.js) and the reason the body gives
 * (lava.js) speak of the same list.
 *
 * Everything is deterministic and reads only the week: the repaint is a set of
 * constant colours tempered by the week's numbers, and the vent list is a sort
 * of the week's own activities.
 */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// The basalt. Nothing on the ground may be bright except the melt: the rock is
// a cool charcoal that has gone nearly black where it set, the ash is the one
// restrained pale note the picture leaves on the highest, driest ground, and
// every warm thing in the frame is heat. Cool against warm is the whole picture:
// an indigo-black crust under orange breaks.
const ROCK = {
  landLow: 0x121216,
  landMid: 0x1c1c22,
  landHigh: 0x2b2a33,
  // the ash is a half-step above the rock, not a mid-grey: ink reads the crest
  // on every dry lowland and mixes it with the sheet for the dry wash, so a
  // crest at a mid value is a pale country drawn over a black one
  crest: 0x3c3a36,
  bare: 0x15141a,
  // the week's own standing objects (ink-kinds.js reads `stone` for every one of
  // them) are the same rock as the ground they stand on, or a lava world wears a
  // row of pale grey cairns across its black crust
  stone: 0x2a2830,
  dry: 0x232228,
  dark: 0x0c0b10,
  ink: 0x141119,
  inkSoft: 0x211d29,
  sepia: 0x261e1b,
  // the week's own light, laid on the rock: a warm grey, so the lit planes of a
  // black crust read as warm stone and not as a second dark — but only a step
  // off the dark, because a crust read at four times the value of its own shade
  // is a brown planet with black lines on it and not the other way round
  litWarm: 0x3a322b,
  shadeCool: 0x121016,
};

// The melt: the week's own water gone molten. The shallows and the margins stand
// in it and are hot; the deep is where it has crusted over and gone nearly
// black, so the sea keeps the picture's structure instead of flooding it. The
// shallows are the second light in the picture after the cracks, and they are
// the week's fire rather than its earth: at the value of a rust wash a molten
// sea is only a brown basin with the shape of a sea.
const MELT = {
  // The sea is not a lake of light. A body of molten rock is a *skin*: it has
  // crusted over everywhere the heat has had time to leave, and what is bright
  // in it is the seams — the margins along every shore, where the crust is still
  // parting. Painted at the shallows' own value the sea becomes the brightest
  // area in the frame, a flat orange glaze with a specular sheen, and the crust
  // is demoted to a background; painted as cooled skin with the glow left to the
  // shore it keeps the picture's value structure and is what the shell's shore
  // band is drawn on top of.
  seaShallow: 0x5e1f0b,
  seaDeep: 0x260d07,
  foam: 0xe0892c,
  shelf: 0x451809,
  cobalt: 0x301109,
  teal: 0x712710,
  vermilion: 0xb8340f,
  farGlaze: 0x6d5b4d,
  accent: 0xff7a1e,
};

// The ash sky: smoke over the ground rather than weather over it — a grey that
// stays pale enough to hold the black crust's silhouette, warming into the band
// the melt throws up at the horizon.
const ASH = {
  // smoke over the ground rather than weather over it, and lit from below: the
  // one thing a lava field does to a sky that no other world does is put the
  // glow of its own fissures on the undersides of the cloud, so the low sky and
  // the cloud bases are ember and the high ash stays a grey pale enough to hold
  // the black crust's silhouette against it.
  skyHigh: 0x6a6663,
  skyLow: 0x7d6e60,
  skyBand: 0xa87a52,
  skyWash: 0x8a7a68,
  skyDeep: 0x4a3d34,
  cloudUnder: 0x6e4020,
  skyHaze: 0xa8642c,
};

/** How molten the week is, 0 (hot and hard, barely) … 1 (the furnace weeks). */
export function heatOf(features) {
  const st = features?.stats || {};
  const tempC = num(st.tempC);
  const hard = num(st.hard);
  const load = num(st.load) || 0;
  const heat = clamp(((tempC ?? 25) - 24) / 9, 0, 1);
  const drive = clamp(((hard ?? 0.5) - 0.45) / 0.4, 0, 1);
  const burn = clamp((load - 800) / 500, 0, 1);
  return clamp(0.34 + 0.34 * heat + 0.22 * drive + 0.10 * burn, 0, 1);
}

/** Repaint ink's palette as the week's own ground, in place (worlds' way). */
export function paintCrust(pal, features) {
  if (!pal) return pal;
  const heat = heatOf(features);
  // how far from the week's own washes the repaint goes. A lava world is not a
  // week tinted hot: the record has already said the week was a furnace, and a
  // repaint that leaves a fifth of the week's own cream on the lowland leaves a
  // pale country under a black one, which is the one thing this body cannot be
  const k = clamp(0.90 + 0.10 * heat, 0, 1);
  const keep = (name) => pal[name]?.clone?.() || null;
  const was = {};
  for (const name of Object.keys(ROCK)) was[name] = keep(name);
  for (const name of Object.keys(MELT)) if (!was[name]) was[name] = keep(name);
  for (const name of Object.keys(ASH)) if (!was[name]) was[name] = keep(name);
  const paint = (name, hex, mix) => {
    const c = pal[name];
    if (!c || typeof c.setHex !== 'function') return;
    const from = was[name];
    c.setHex(hex);
    if (from && mix < 1) c.lerp(from, 1 - mix);
  };

  for (const [name, hex] of Object.entries(ROCK)) paint(name, hex, k);
  for (const [name, hex] of Object.entries(MELT)) paint(name, hex, k);
  for (const [name, hex] of Object.entries(ASH)) {
    // the sky holds a little more of the week's own weather in it than the rock
    // does: a lava world under a foreign sky reads as a bonfire on someone
    // else's moor, and the ash is the half of the picture the crust is seen
    // against
    paint(name, hex, clamp(0.52 + 0.42 * heat, 0, 1));
  }
  // the sheet is only warmed, never darkened: it is what the black crust is
  // drawn against, and a poster with no paper left in it has no light in it
  if (pal.paper?.lerp) {
    const paper = pal.paper.clone();
    pal.paper.setHex(0xe9dcc2);
    pal.paper.lerp(paper, 0.55);
  }
  if (pal.paperWet?.lerp) {
    const wet = pal.paperWet.clone();
    pal.paperWet.setHex(0xcdbda4);
    pal.paperWet.lerp(wet, 0.5);
  }
  // numbers, not colours: the lowland grows nothing, and it is set to zero and
  // not driven negative. Either sign switches ink's own district drawing on —
  // `lowAmt > 0.001` is the guard — and negative draws the lowland as a bare
  // *page* of loose washes lifted toward the crest and the sheet, while positive
  // sows it with the week's own fields. On a crest this dark the first is a
  // mid-grey country sitting under a black one, and the second is a green one.
  // At zero the ground is simply the ground the rock colours above painted.
  if (Number.isFinite(pal.vegAmt)) pal.vegAmt = 0;
  if (Number.isFinite(pal.accentAmt)) pal.accentAmt = Math.max(pal.accentAmt, 0.50 + 0.28 * heat);
  if (Number.isFinite(pal.damp)) pal.damp = 0;
  if (Number.isFinite(pal.calm)) pal.calm = 0;
  // and the melt is not calm water: a still sea is painted with the one specular
  // note in the picture, and on a molten one that note is orange plastic
  if (Number.isFinite(pal.seaCalm)) pal.seaCalm = 0;
  if (pal.accent?.setHex) {
    // the mineral in the rock's creases is the week's own melt, and the sea's
    // heat is a little of it too
    const accent = pal.accent.clone();
    pal.accent.setHex(MELT.accent);
    pal.accent.lerp(accent, 0.22);
  }
  if (pal.skyScheme?.set && typeof pal.skyScheme.y === 'number') {
    pal.skyScheme.y = Math.max(pal.skyScheme.y, 0.10 + 0.10 * heat);   // heat haze
    pal.skyScheme.w = Math.max(pal.skyScheme.w, 1.35 + 0.9 * heat);    // the sun smeared through smoke
  }
  if (Number.isFinite(pal.skyCirrus)) pal.skyCirrus = Math.min(pal.skyCirrus, 3);
  return pal;
}

// A vent is a session that was mostly above threshold, or that stood above it
// long enough to count on its own — a quarter of an hour of it, or three
// minutes of it for a session that was almost nothing else.
const VENT_MIN_SECONDS = 150;
const VENT_LONG_SECONDS = 900;
const VENT_MIN_SHARE = 0.5;
const VENT_FULL_SECONDS = 2400;
const VENT_MAX = 7;

/**
 * The week's hard sessions, strongest first: the vents the crust opens at.
 * reads the record's own zones (4 and 5 against the session's active time) and
 * carries the share and the burn each is drawn with.
 */
export function ventSessions(features) {
  const out = [];
  for (const f of features?.list || []) {
    if (f.kind === 'monument') continue;   // a race's monument repeats the run it came from
    const a = f.stats || {};
    const active = Math.max(0, num(a.activeS) || 0);
    const zones = Array.isArray(a.hrZoneSeconds) ? a.hrZoneSeconds : [];
    const hardS = (num(zones[3]) || 0) + (num(zones[4]) || 0);
    if (hardS < VENT_MIN_SECONDS) continue;
    const share = active > 0 ? hardS / active : 0;
    if (share < VENT_MIN_SHARE && hardS < VENT_LONG_SECONDS) continue;
    const burn = clamp((hardS - VENT_MIN_SECONDS) / VENT_FULL_SECONDS, 0, 1);
    out.push({
      id: f.id,
      kind: f.kind,
      dir: f.dir.clone(),
      hardS,
      share,
      // how hard it stands out of the ground: a long threshold session is a
      // bigger hole than a short one, and one that was nothing but threshold
      // gets a little more again
      burn: 0.26 + 0.62 * burn + 0.12 * clamp((share - 0.5) / 0.5, 0, 1),
    });
  }
  out.sort((a, b) => b.hardS - a.hardS);
  return out.slice(0, VENT_MAX);
}

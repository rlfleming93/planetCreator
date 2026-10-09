/* Planet Creator — the Black hole body.
 *
 * The rarity at the far end of the scale: a week with nothing in it, or next to
 * nothing. `world.body=blackhole` names it; `auto` takes it only on a week the
 * record itself leaves empty — no activities at all, or under thirty-six minutes
 * of them — and a week with even a few hours of work never fits it, because the
 * whole point of the body is that there is nothing there to see.
 *
 * What it does is three things, and none of them is geometry:
 *
 *   palette     the ground is repainted darker and plainer (paintBare): olive
 *               ground, umber heights and blue water, because on a pale sheet a
 *               pale marble at a sixth of the frame is a hole in the paper.
 *
 *   orbit.fill  the planet is let go of: the poster pulls back until the week
 *               is about a sixth of the frame, so it is a small world with room
 *               beside it for what is standing next to it.
 *
 *   post        the hole (blackhole-lens.js), which is where the body actually
 *               is: a screen pass that lays the frame over so the week stands in
 *               the upper right, traces every ray near the hole round it to the
 *               disc — the shadow, the photon ring, the blade across the shadow,
 *               the arch over it and the return under it, beamed — and paints
 *               all of it in pigment and ink, with the week lit warm by the disc
 *               and its own inverted image come round the hole's lower rim.
 *
 * Underfoot the hole falls away to nothing: standing on the ground of a week,
 * the hole is not a thing in front of the camera, and the picture goes back to
 * being the week — the repaint of its ground excepted, because that is what the
 * week *is*.
 */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// An empty week is a week there is nothing to stand on: past half an hour of
// work, the planet has an occupant and is no longer a marble beside a hole.
const EMPTY_HOURS = 0.6;

// The ground of a week with nothing in it, held dark enough to stand on a pale
// sheet at a sixth of the frame: deep olive ground, umber heights and real blue
// water, so the little thing beside the hole is a world and not a moon. The
// repaint is a step and not a takeover — the week keeps a fifth of its own
// washes — and the crest stays a mid grey (see paintBare).
const BARE = {
  landLow: 0x2f4842,
  landMid: 0x55684e,
  landHigh: 0x7c5c42,
  crest: 0x4a5058,
  dry: 0x6c7656,
  bare: 0x4a3a2c,
  dark: 0x171c22,
  ink: 0x1e242c,
  inkSoft: 0x333b45,
  sepia: 0x3b3b40,
  litWarm: 0x9a8866,
  shadeCool: 0x24303d,
  seaShallow: 0x3c7a95,
  seaDeep: 0x173b58,
  foam: 0xc6d3da,
  shelf: 0x2b5d78,
  cobalt: 0x1e436a,
  teal: 0x2e6f7c,
};

/** Repaint ink's washes as the bare week's ground (in place, worlds' way).
 *
 *  Two of ink's own numbers have to be moved with the colours or the planet
 *  stops being a planet. `vegAmt` is the first: a week with almost nothing in it
 *  drives it to -1, which turns on ink's bare-earth *page* — the lowland is
 *  drawn as loose washes lifted toward the crest and the sheet, and at a sixth
 *  of the frame that is not a small world, it is a dashed outline on paper. The
 *  second is that `crest` is read on every dry lowland and mixed with the sheet
 *  for the dry wash, so a crest at a mid value paints the whole week as paper;
 *  the ground here is dark enough that it reads as ground.
 */
function paintBare(pal) {
  if (!pal) return pal;
  if (Number.isFinite(pal.vegAmt)) pal.vegAmt = 0;
  for (const [name, hex] of Object.entries(BARE)) {
    const c = pal[name];
    if (!c || typeof c.setHex !== 'function') continue;
    const was = c.clone();
    c.setHex(hex);
    c.lerp(was, 0.22);
  }
  return pal;
}

export default {
  id: 'blackhole',
  label: 'Black hole',
  blurb: 'a week that fell in on itself',
  // Only drawn when world.body names it: an empty week is not auto's to turn into a black hole.
  autoPick: false,

  fit(stats) {
    const s = stats || {};
    const count = num(s.count) || 0;
    const hours = num(s.hours) || 0;
    const load = num(s.load) || 0;
    if (count === 0) return hours > 0.05 ? 0.94 : 1;
    if (hours >= EMPTY_HOURS) return 0;
    const thin = clamp(1 - hours / EMPTY_HOURS, 0, 1);
    return clamp(0.78 + 0.20 * thin - 0.06 * clamp(load / 120, 0, 1), 0, 1);
  },

  reason(stats) {
    const s = stats || {};
    const count = num(s.count) || 0;
    const minutes = Math.round((num(s.hours) || 0) * 60);
    // auto never picks it (autoPick: false), so the reason says so before the rule it fits
    return `A black hole is only drawn when the link asks for one. It fits a week with no sessions, or under ${Math.round(EMPTY_HOURS * 60)} minutes. This week: ${count} session${count === 1 ? '' : 's'}, ${minutes} minutes.`;
  },

  // the planet is let go of: about a sixth of the frame, because the hole is
  // the subject and the week is the small world it is bending. Small is not
  // blank: the ground is repainted darker (paintBare) so the world still has
  // land, water and a lit limb at this size.
  orbit: { fill: 0.13 },

  palette(pal) {
    return paintBare(pal);
  },

  // the lens, fetched for a black hole's week only
  load: () => import('./blackhole-lens.js'),
  create(shared, { createLens }) {
    const lens = createLens(shared);
    return {
      post: lens.post,
      update(frame) {
        lens.update(frame);
      },
      dispose() {
        lens.dispose();
      },
      debug() {
        return lens.debug();
      },
    };
  },
};

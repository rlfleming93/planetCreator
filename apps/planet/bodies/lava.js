/* Planet Creator — the Lava world body.
 *
 * What kind of week is ground still cooling? One that was both hot and hard:
 * the record has to show real time above threshold (a mostly-easy week is not a
 * furnace however warm the air was) and air that was actually hot, or a load
 * that was heavy enough to melt the week on its own. `world.body=lava` names it;
 * `auto` takes it on the weeks whose own numbers say so.
 *
 * The body is three hooks and they are the whole of it:
 *
 *   palette   ink's washes repainted as basalt, ash and melt (lava-crust.js), in
 *             place, so the pond, the sheet, the prints, the runner's ground and
 *             every object follow without knowing anything happened.
 *
 *   create    the glow itself (lava-flow.js, fetched for a lava week only): a
 *             skin of the crust carrying the melt in its low ground, its
 *             hollows, its shorelines and its cracks, a thread of melt down the
 *             week's real drainage when the terrain cut one, and a vent — plume
 *             and collar — at every hard session the week kept.
 *
 * Nothing else: the week's own terrain is the shape the lava flowed over, and a
 * body that re-cut it would be painting a different week.
 */
import { paintCrust } from './lava-crust.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const pct = (v) => `${Math.round(v * 100)}%`;

export default {
  id: 'lava',
  label: 'Lava world',
  blurb: 'a crust cracked open over fire',

  /**
   * Hard and hot, or hammered. The two doors the record has to open at least
   * one of: half the week's heart-rate time above threshold in real heat, or a
   * load heavy enough that the week was a furnace whatever the weather did.
   * A week that barely trained is never a lava world, and the fit climbs with
   * how far past the door the week stands.
   */
  fit(stats) {
    const s = stats || {};
    const hours = num(s.hours) || 0;
    const load = num(s.load) || 0;
    const hard = num(s.hard);
    const tempC = num(s.tempC);
    if (hours < 1.5) return 0;
    if (hard == null) return 0;
    const furnace = hard >= 0.5 && tempC != null && tempC >= 25;
    const hammered = hard >= 0.45 && load >= 950;
    if (!furnace && !hammered) return 0;
    const heat = tempC == null ? 0 : clamp((tempC - 25) / 11, 0, 1);
    const drive = clamp((hard - 0.45) / 0.4, 0, 1);
    const burn = clamp((load - 800) / 500, 0, 1);
    return clamp(0.58 + 0.16 * heat + 0.16 * drive + 0.08 * burn, 0, 0.98);
  },

  /** Why the week is this body, in plain words: both doors, then the week's own numbers for the one it opened. */
  reason(stats) {
    const s = stats || {};
    const hard = num(s.hard) || 0;
    const tempC = num(s.tempC);
    const load = Math.round(num(s.load) || 0);
    const furnace = hard >= 0.5 && tempC != null && tempC >= 25;
    // a no-break space keeps each temperature on one line wherever the reason wraps
    const opened = furnace ? `at ${Math.round(tempC)}\u00a0°C` : `and a load of ${load.toLocaleString('en-US')}`;
    return `Hard weeks melt. That's half the heart-rate time in zones 4 and 5 in 25\u00a0°C air, or 45% with a training load of 950+. This week: ${pct(hard)} ${opened}.`;
  },

  palette(pal, features) {
    return paintCrust(pal, features);
  },

  load: () => import('./lava-flow.js'),
  create(shared, { createLavaFlow }) {
    return createLavaFlow(shared);
  },
};

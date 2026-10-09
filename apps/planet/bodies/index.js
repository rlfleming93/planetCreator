/* Planet Creator — the bodies.
 *
 * A world (worlds/*.js) is what the ground of a week is like; a body is what kind
 * of thing the week is in space: a rocky planet (today's, and the default), a
 * small rocky marble, a banded gas giant, an ice giant, a race week's crowned world, a lava world, a
 * black hole. Scale is the lever: a tiny week is a marble, a huge one a giant.
 *
 * A body module's default export may carry, every hook optional:
 *
 *   { id, label, blurb,
 *     fit(stats)               → 0..1, how well this body suits the week
 *     autoPick                 → false keeps the body out of `auto` (named only)
 *     climate(c)               → the week's climate, after the world's
 *     baseline(dir, ctx)       → the undecorated ground, in place of the world's
 *     shape(dir, h, ctx)       → the height after the world's own shape
 *     palette(pal, features)   → the palette, after the world's
 *     companions(ctx)          → objects beside the globe, with the world's
 *     orbit: { reliefCap, fill, floor }  → overrides the world's (floor: the closest orbit, units over R)
 *     reason(stats)            → why the week is this body in plain words: the rule, then the week's own numbers
 *     load()                   → a promise of the module create() draws with,
 *                                fetched for the week drawn as this body only
 *     create(shared, loaded)   → { object?, update?(frame), dispose?, post?, ground?, props?, sky? } }
 *
 * create() runs once in the ink style's setupScene with shared = { THREE, scene,
 * renderer, features, uniforms, palette, colors, survey, light, R, washMaterial }
 * and what load() fetched (undefined without a load).
 * `object` is added to the scene (a body draws over the ground from orbit —
 * a gas giant's cloud deck, a star's photosphere — and fades as the camera
 * lands: frame.surface is 0 in orbit and 1 on foot); update(frame) runs every
 * frame with { camera, surface, time }; `post` is a screen pass with the print
 * contract (prints/index.js: { id, fragment, uniforms(ctx), update?(ctx, u) }),
 * run after the ink frame and before any print — a black hole's lens.
 *
 * `ground` is the body's own ground underfoot: { glsl, uniforms }, where glsl
 * declares vec3 bodyGround(c, dW, n, V, dist, fp, tooth, sunSh) — laid inside
 * the terrain's own shader after its wash, so it reads every uniform, varying
 * and noise of it and has the last word (mix by uSurface to leave orbit alone).
 * `props: false` stands nothing on that ground but the race's monument: no
 * feature objects and no race stroke (a giant's cloud deck). `sky: true` says
 * the body is the whole sky on foot, so the week's companions are hidden there.
 *
 * `world.body` names one, `rock` for today's planet (no body at all), or `auto`,
 * which takes the best fit over the floor and the margin as worlds do.
 */
import { WORLD_BODIES } from '../params.js';
import * as marble from './marble.js';
import * as giant from './giant.js';
import * as ice from './ice.js';
import * as star from './star.js';
import * as lava from './lava.js';
import * as blackhole from './blackhole.js';

const MODULES = { marble, giant, ice, star, lava, blackhole };

/** id → the body module's default export. `rock` is today's planet: no body. */
export const BODIES = Object.freeze(Object.fromEntries(Object.entries(MODULES).map(([id, module]) => {
  const body = module.default;
  if (!body || body.id !== id) throw new Error(`Planet bodies: bodies/${id}.js must default-export a body whose id is "${id}".`);
  return [id, body];
})));

{
  const ids = ['rock', 'auto', ...Object.keys(BODIES)];
  const drift = [
    ...WORLD_BODIES.filter((id) => !ids.includes(id)).map((id) => `${id} is listed but not loaded`),
    ...ids.filter((id) => !WORLD_BODIES.includes(id)).map((id) => `${id} is loaded but not listed in params.js WORLD_BODIES`),
  ];
  if (drift.length) throw new Error(`Planet bodies: ${drift.join('; ')}.`);
}

const AUTO_FIT_MIN = 0.55;
const AUTO_LEAD_MIN = 0.12;

/** The body a week is, or null for a rocky planet (today's). */
export function bodyFor(id, stats = null) {
  if (id === 'auto') {
    if (!stats) return null;
    let best = null, bestFit = 0, second = 0;
    for (const body of Object.values(BODIES)) {
      // a body that only answers when named (the black hole) is never auto's pick
      if (body.autoPick === false) continue;
      const fit = Number(body.fit?.(stats)) || 0;
      if (!(fit > 0)) continue;
      if (fit > bestFit) { second = bestFit; best = body; bestFit = fit; }
      else if (fit > second) second = fit;
    }
    return best && bestFit >= AUTO_FIT_MIN && bestFit - second >= AUTO_LEAD_MIN ? best : null;
  }
  return typeof id === 'string' && Object.hasOwn(BODIES, id) ? BODIES[id] : null;
}

/** Ask for the week's body's own module now (its load()), so it is in by the time createBody draws with it. */
export function loadBody(features) {
  return bodyFor(features?.body?.id)?.load?.() ?? Promise.resolve(null);
}

/** The scene side of the week's body (features.body names it), or null. */
export async function createBody(shared) {
  const body = bodyFor(shared.features?.body?.id);
  return body?.create ? body.create(shared, await body.load?.()) || null : null;
}

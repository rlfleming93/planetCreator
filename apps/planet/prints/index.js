/* Planet Creator — the prints.
 *
 * A print is the last pass over the finished ink frame: the whole picture is
 * already painted by then, and what this pass decides is only which hand made
 * it. A print is a module of shape
 *
 *   { id, label, fragment, uniforms(ctx) -> object, update?(ctx, uniforms) }
 *
 * where `fragment` is a whole GLSL file with a main() — the pass's own vertex
 * shader is exported below, so a print only has to name `vUv` — and
 * `uniforms(ctx)` returns the print's own dials, which the caller spreads over
 * the uniforms the pass already owns. The pass supplies tDiffuse (the finished
 * ink frame), tDepth, uResolution (device pixels), uPaper, uInk, uSeaDeep,
 * uSeaShallow, uLand and uSeed; a print that reads any other name must return
 * it from uniforms(), because three uploads every uniform a shader actually
 * uses and throws on one it was not given. `update`, when a print has one, runs
 * every frame just before the pass with the same ctx (which also carries the
 * camera, the light, the planet's radius and sea level), for a print that draws
 * with the globe itself: its disc on the sheet, the sun, the week's own sites.
 *
 * `look.print` names one of these, or `auto`. `ink` is not a print at all — it
 * is the frame the wash and the hand already painted — so printFor answers it
 * with null, and so does every lookup that comes up empty. A print's module is
 * fetched only for the week pulled in it (printFor), and checked when it comes.
 *
 * The dial's option list is a literal in params.js (that module is also loaded
 * on its own, by the bench), and it is the list this registry is checked
 * against at load, as worlds/index.js checks its own: an id it has never heard
 * of would be a dial that could not be set, and an option with no print behind
 * it would be a dial that quietly does nothing.
 */
import { SPEC } from '../params.js';

// id → its module, fetched when a week is pulled in it
const MODULES = {
  riso: () => import('./riso.js'),
  woodblock: () => import('./woodblock.js'),
  etching: () => import('./etching.js'),
  gouache: () => import('./gouache.js'),
  moebius: () => import('./moebius.js'),
  mosaic: () => import('./mosaic.js'),
  atlas: () => import('./atlas.js'),
  nocturne: () => import('./nocturne.js'),
  pointillist: () => import('./pointillist.js'),
};
const IDS = ['ink', ...Object.keys(MODULES)];

/** The pass's vertex shader: the print is laid on the sheet, full frame. */
export const PRINT_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/** The print a world is pulled as: the hand that flatters the drawing that world
 *  makes of a week. A world is a kind of ground, and every ground has a hand it
 *  belongs to — pasture is opaque colour laid in patches, a drowned globe a
 *  spot-colour plate. A world that is not named here is the ink frame (null),
 *  which is the house style and the answer for the world that is the reference
 *  the others are read against. Tundra and mesa keep it too: on the shelf and a
 *  phone the etching cut the ice sheet into a cream blob, and the ligne claire
 *  laid mesa on a flat vermilion sky. */
const WORLD_PRINT = Object.freeze({
  commons: 'gouache',
  archipelago: 'riso',
});

/** The print a week is pulled as when it is a body rather than a rocky planet:
 *  a body is the whole frame from orbit — a shell of cloud, a photosphere, a
 *  lens — and it is pulled in the hand that flatters that shell. The body's own
 *  answer comes before the world's, because the world's ground is what the body
 *  is drawn over and around, and after nothing else.
 *
 *  A body may also answer with the ink frame itself, and three of them do. A star
 *  and a black hole are not grounds to be redrawn: the star's light is the
 *  picture, and a print laid over it paints a night on a sun — the nocturne turns
 *  it into a dark world with lamps and an aurora, which is a good nocturne of the
 *  wrong subject, and every other hand flattens the photosphere into a disc. The
 *  hole's lens is a screen pass of its own, finished before any print; a night
 *  screen over it buries the lens in the dark. A lava world is the third: its
 *  surface is molten, and a print that reads the frame's value plan reads a
 *  fissure and its crust as one tone — the melt survives the ink frame and not a
 *  screen laid over it. The two giants and the marble were pulled through
 *  mosaic and etching too, and at shelf size the print buried the body's own
 *  drawing (the giant's belts and storms became panes, the marble's craters a
 *  hatched stain), so every body keeps the ink frame: a body draws its own
 *  shell, and `ink` here says so on purpose rather than by the table having no
 *  entry. */
const BODY_PRINT = Object.freeze({
  giant: 'ink',
  ice: 'ink',
  marble: 'ink',
  lava: 'ink',
  star: 'ink',
  blackhole: 'ink',
});

/** What a week that kept a race is pulled as, and the worlds whose own signature
 *  may keep it instead. A race week's story is told by its ring and its hero
 *  shot, and a woodblock laid over them papered out the deep space and the
 *  Saturn ring both, so a race keeps the ink frame unless the ground it was
 *  drawn as has a hand that tells a story too. */
const RACE_PRINT = 'ink';
const RACE_KEEPS = Object.freeze(['riso']);

/** The print a week is pulled as. `auto` reads the week's own world and body out
 *  of its features — features.world.id and features.body.id, both already
 *  resolved by the time the ink style asks — and takes the hand that flatters
 *  what the week was drawn as: the body's print when the week is a body, then
 *  the world's own, and on race weeks the race's own answer over the world.
 *  Either table may answer `ink`, which is not a print at all but the house
 *  frame kept on purpose — what every body and a race week are
 *  pulled as. A week with neither a body nor a world of its own is the ink frame
 *  too, which is also what anything unknown is, which is what the dial was for. */
export async function printFor(id, features = null) {
  const key = id === 'auto' ? autoPrint(features) : id;
  if (!Object.hasOwn(MODULES, key)) return null;
  const print = (await MODULES[key]()).default;
  if (!print || print.id !== key || typeof print.fragment !== 'string' || typeof print.uniforms !== 'function') {
    throw new Error(`prints: ${key}.js must default-export { id: '${key}', label, fragment, uniforms }`);
  }
  return print;
}

/** The hand `auto` takes for a reading: body, then world, then the race's own
 *  block. A body's answer may be the ink frame itself (star, black hole), and
 *  that answer is still the body's first — an id named `ink` in the tables is
 *  the frame and not a missing entry. Every other id named in the tables above
 *  is checked at load, so a lookup that comes up empty here is a week the print
 *  has no opinion about — and the ink frame is the print's answer for those. */
function autoPrint(features) {
  const body = BODY_PRINT[features?.body?.id];
  if (body) return body;
  const world = WORLD_PRINT[features?.world?.id] || null;
  if (hasRace(features)) return world && RACE_KEEPS.includes(world) ? world : RACE_PRINT;
  return world || 'ink';
}

/** A week has a race when its reading kept one: the route itself, or the race
 *  monuments that route was laid from. */
function hasRace(features) {
  return Boolean(features?.race) || (features?.races?.length ?? 0) > 0;
}

const options = SPEC.find((entry) => entry.key === 'look.print')?.options || [];
const unnamed = IDS.filter((id) => !options.includes(id));
if (unnamed.length) throw new Error(`prints: look.print has no option for ${unnamed.join(', ')}`);

// The signature tables name prints by id, and an id no module answers to would
// be a week quietly pulled as the ink frame with a table saying otherwise: the
// same load-time bug the dial's own option list is checked for, so it is thrown
// here as well. A world or body with no signature is not in the tables at all,
// which is the honest way to say that the ink frame is its answer.
const missing = [...Object.entries(WORLD_PRINT), ...Object.entries(BODY_PRINT), ['race', RACE_PRINT], ...RACE_KEEPS.map((id) => ['race keeps', id])]
  .filter(([, id]) => !IDS.includes(id));
if (missing.length) throw new Error(`prints: the signature tables name ${missing.map(([where, id]) => `${id} (${where})`).join(', ')}, which no print answers to`);

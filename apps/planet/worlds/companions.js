/* Planet Creator — the companions: what a world stands beside its globe.
 *
 * A world may put something in the sky with its planet (see index.js): a moon
 * over a rest week, a ring round a race week, or an object of its own. They are
 * painted with the same wash the week's own objects are (ink-objects.js
 * washMaterial): one flat pigment to a face, a terminator that stops on a
 * wandering line, ink on the silhouette, paper left along the lit edge and the
 * ragged margin. Nothing here is shaded in the round: a companion is a cut-out,
 * a disc of pigment with a broken edge.
 *
 * What stands here is the wash-and-cut-out kind of companion. The race week's
 * ring is not one of those any more — it is the race itself drawn round the
 * globe, by a shader of its own — so it lives in ../rings.js and is re-exported
 * from this module, which is where the worlds look for their companions.
 *
 * A companion is built once, when the scene is set up, and then never touched —
 * unless a slow drift is asked for, which is read from the shared clock in
 * uniforms.uTime rather than kept as state, so a drifting moon is still a pure
 * function of the week and the clock. `ctx` carries the THREE classes, as it
 * does for every object module, so nothing here imports three directly; every
 * random number comes from the week's own PRNG, so the same week draws the same
 * moon twice.
 *
 * Frustum culling is left on for each part: the pieces are ordinary meshes with
 * ordinary bounds, and a moon seen from behind the globe costs nothing.
 */
const TAU = Math.PI * 2;
const UP = { x: 0, y: 1, z: 0 };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mix = (a, b, t) => a.clone().lerp(b, t);

// A direction handed in as [x, y, z] or as a Vector3, as a fresh unit vector;
// nothing usable falls back to the axis the caller names.
function direction(T, value, fallback) {
  const v = new T.Vector3();
  if (Array.isArray(value) && value.length >= 3) v.fromArray(value);
  else if (value && typeof value === 'object') v.copy(value);
  if (!(v.lengthSq() > 1e-12)) v.set(fallback.x, fallback.y, fallback.z);
  return v.normalize();
}

// A slow drift, installed only where one is asked for: the object's own turn is
// read from the shared clock whenever its world matrix is built, so at rate 0
// nothing is ever installed and at any other rate there is still no state to
// advance — the same moment always draws the same frame.
function slowDrift(group, axis, rate, uniforms) {
  if (!(rate > 0)) return;
  const update = group.updateMatrixWorld;
  group.updateMatrixWorld = function driftingMatrixWorld(force) {
    group.rotation[axis] = rate * (Number(uniforms?.uTime?.value) || 0);
    return update.call(this, force);
  };
}

// A few craters, dented in from the seed alone: each is a bowl pushed along the
// sphere's own direction, with the last tenth of its size left a touch proud,
// the way a thrown stone leaves a lip. Deterministic, and one pass at build:
// nothing here runs again.
function dentCraters(T, geo, radius, rng, count) {
  const centres = [];
  for (let i = 0; i < count; i++) {
    const y = rng() * 2 - 1;
    const a = rng() * TAU;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    centres.push({
      x: Math.cos(a) * r, y, z: Math.sin(a) * r,
      size: 0.22 + rng() * 0.42, // the crater's angular radius in radians
      depth: 0.045 + rng() * 0.055, // of the moon's radius
    });
  }
  const p = geo.attributes.position;
  const v = new T.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i)).divideScalar(radius); // the vertex's own direction
    let dent = 0;
    for (const c of centres) {
      const cos = clamp(v.x * c.x + v.y * c.y + v.z * c.z, -1, 1);
      if (cos <= 0) continue; // the far side of the moon: nothing to dent
      const t = Math.acos(cos) / c.size;
      if (t >= 1) continue;
      const bowl = Math.cos(t * Math.PI * 0.5); // 1 at the middle, 0 at the rim
      const lip = Math.exp(-Math.pow((t - 0.9) / 0.09, 2)) * 0.18;
      dent = Math.max(dent, c.depth * (bowl - lip));
    }
    if (dent === 0) continue;
    const scale = radius * (1 - dent);
    p.setXYZ(i, v.x * scale, v.y * scale, v.z * scale);
  }
  geo.computeVertexNormals();
}

// The wash material takes its seed as a float uniform; a week name or any other
// string would reach the shader as NaN and paint the whole object black.
function seedOf(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed;
  let h = 2166136261;
  for (const ch of String(seed ?? '')) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return (h >>> 0) % 100000 / 100;
}

/**
 * A moon: a low-poly sphere dented with a few craters and painted as one flat
 * wash to the face, the terminator stopping on a wandering line, ink on the
 * silhouette and paper left round its rim — the sheet showing through where the
 * disc turns away. `dir` is the unit direction it hangs in, `distance` how far
 * out the centre of the moon sits and `radius` its size, all in world units; a
 * `drift` (radians per second, off by default) turns it slowly on its own axis.
 */
export function paintedMoon(ctx, { radius, distance, dir, seed: rawSeed = 0, drift = 0 }) {
  const seed = seedOf(rawSeed);
  const { THREE: T, palette: pal, uniforms, washMaterial } = ctx;
  const size = Math.max(1e-3, Number(radius) || 0);
  const away = direction(T, dir, UP);
  const geo = new T.IcosahedronGeometry(size, 2);
  dentCraters(T, geo, size, ctx.features.makeRng(`companion-moon/${seed}`), 5);
  const mat = washMaterial(T, uniforms, pal, geo, {
    lit: mix(pal.paper, pal.stone, 0.42),
    shade: mix(pal.shadeCool, pal.ink, 0.4),
    sky: mix(pal.stone, pal.paper, 0.35),
    ink: pal.ink,
    paper: pal.paper,
    rag: 0.2,
    grain: 1.15,
    inkLine: 0.85,
    top: 0, // the pale cap belongs to a mass standing on the ground, not to this
    skyTop: 0,
    dry: 0,
    base: 0, // no pooling at the foot of a disc in the sky
    margin: size * 0.05,
    seed,
  });
  const group = new T.Group();
  group.name = 'companion-moon';
  const frame = new T.Group(); // local +Y along the radial: the moon's own pole
  frame.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), away);
  const spin = new T.Group();
  const disc = new T.Mesh(geo, mat);
  disc.name = 'companion-moon-disc';
  disc.position.set(0, Math.max(size, Number(distance) || 0), 0);
  spin.add(disc);
  frame.add(spin);
  group.add(frame);
  slowDrift(spin, 'y', drift, uniforms);
  return group;
}

// The race ring itself lives in ../rings.js: a week's race drawn round the whole
// globe — its bands the race's own splits, its divisions the race's own halves,
// its finish the race line's own vermilion — and re-exported here, where the
// worlds look for their companions.
export { raceRing } from '../rings.js';

/** The objects a world stands beside its globe are built here or in the world
 *  that owns them; the race ring is ../rings.js, re-exported above. */

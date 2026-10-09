/* Planet Creator — the runner figure.
 *
 * ONE continuous, smooth-shaded body instead of a stack of capsules: a lathe
 * torso + head, and tapered tubes whose centreline is rebuilt from its joint
 * chain every frame. Interior joints are rounded into fillet arcs, so a bent
 * knee is one smooth surface and no joint can ever open a gap. Nothing is
 * skinned, so a style's materials — including a custom ShaderMaterial — drive it
 * unchanged. He runs in a tank top: the arms are bare from the shoulder, the
 * shorts end at the mid thigh on a clean ring, so the two materials meet on a
 * drawn edge rather than a seam.
 *
 * Local frame: origin on the ground between the feet, +Y up, +Z the direction of
 * travel, ≈1.81 units tall. The app seats the root on the terrain and rotates it
 * so +Z is the heading.
 *
 *   const runner = await createRunner(style.runnerMaterials({ THREE, uniforms }));
 *   scene.add(runner.object3D);
 *   runner.update(dt, { speed, grounded, swimming, wade, anticipation, tuck });
 *
 * `wade` (0 dry … 1 hip deep) turns the run into a high-kneed wade; `swimming`
 * blends him over into a freestyle crawl with the waterline at local y = 1.25
 * (the app seats a swimmer's root that far under the surface).
 *
 * Materials: { body, accent, hair, beard, cap, tattoo }. The top, the shorts and
 * the skull are the body, the bare limbs and the shoes the accent, the hair the
 * hair colour and the beard the beard's (else the hair's), the cap the cap's
 * (else the accent's); any other slot left out falls back to the body.
 * `tattoo`, if given, paints a sleeve laid over his right forearm (uv: along
 * it, and round it).
 *
 * runner.look 1 builds the drawn figure on the same rig and gait: a lean
 * runner whose singlet, hands, ears, hair and running shoes are pieces of their
 * own, every mesh named for what it is (a style paints by name) and carrying an
 * `aRunner` attribute — along a limb from its clothing's edge in metres, round
 * it, and 1 on a limb (0 on everything else) — and, if the style gives a
 * `contact` material, a contact shadow under each foot. Read when he is built.
 *
 * runner.look 2 sculpts him (see "the sculpted figure"): one skinned body on
 * the same rig, the arms swung from the shoulder, the head, hands, shoes, cap,
 * hair and beard as finer pieces, each named; the pieces carry `aFig` and the
 * rig `userData.pose` for a style to draw the cloth by. If the materials can
 * `paint` a rig, he is painted as soon as he is built. Sculpting him is the
 * longest part of a build, so its loops hand the thread back as they go (pace.js).
 */
import * as THREE from 'three';
import { P } from './params.js';
import { pace } from './pace.js';
import { solidsOf } from './life-kit.js';

// how far round him he keeps things off, in units: a shoulder's half-width
const BODY_R = 0.3;

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => t * t * (3 - 2 * t);

/* --------------------------------------------------------------- figure ---- */
// A tall distance runner with a lifter's top half: legs 53 % of the height, long
// thighs, a narrow waist, broad square shoulders, heavy arms, a head a seventh of
// him. Every number is in the local frame (1 u ≈ 1 m).
const D0 = {
  hipY: 0.99, // hip joints above the ground, standing
  hipX: 0.1, // half the hip separation
  thigh: 0.45,
  shin: 0.43,
  ankle: 0.115, // sole plane → ankle
  waistY: 0.1, // pelvis → waist pivot
  shoulderX: 0.23,
  shoulderY: 0.46, // pelvis → shoulder joint
  upper: 0.315, // shoulder → elbow
  fore: 0.29, // elbow → hand
  neckY: 0.565, // pelvis → head pivot
  headY: 0.17, // head pivot → head centre
  headR: 0.118,
  shoulderZ: 0.008, // the shoulder joints, forward of the spine
};

// The drawn figure (runner.look 1): a lean runner of the same height — the
// shoulders a deltoid's width past a slim chest, the arms the length of a
// runner's, a head a seventh and a half of him (the head's own pieces are drawn
// at D0's size and the group scaled), legs that are most of him.
const D1 = {
  hipY: 0.97,
  hipX: 0.092,
  thigh: 0.45,
  shin: 0.425,
  ankle: 0.1,
  waistY: 0.1,
  shoulderX: 0.19,
  shoulderY: 0.47,
  upper: 0.29, // shoulder → elbow
  fore: 0.255, // elbow → wrist; the hand is its own piece
  neckY: 0.57,
  headY: 0.17,
  headR: 0.118,
  shoulderZ: -0.01,
  head: 0.96, // the head group's scale
};

// The shoe, in the foot frame (the ankle at the origin): a tapered last — narrow
// heel, wide ball, rounded toe — whose flat sole sits exactly `ankle` below the
// ankle. Rolling up onto the toe or back onto the heel, the ground contact is the
// cap's tangency point (see `contact`), so a planted foot is always exactly on the
// ground and never through it.
const SHOE0 = {
  chain: [[0, -0.079, -0.055], [0, -0.068, 0.02], [0, -0.065, 0.1], [0, -0.071, 0.13]],
  rad: [0.036, 0.047, 0.05, 0.044],
  heel: -0.055, rHeel: 0.036, // rear cap
  toe: 0.13, rToe: 0.044, // front cap
  flat: 0.02, // …roll below which the contact point slides along the flat sole
};

// Torso profile, pelvis frame: [half-depth, height, width ÷ depth]. Revolved,
// then each ring is drawn out sideways by its own factor: a body rather than a
// barrel — a lifter's V from a narrow waist out to a broad back and square
// shoulders, heavy traps running up into a thick neck that is round again.
const TORSO = [
  [0.0, -0.1, 1.45], [0.05, -0.098, 1.45], [0.085, -0.085, 1.45], [0.103, -0.062, 1.45], [0.11, -0.03, 1.45],
  [0.112, 0.0, 1.47], [0.108, 0.045, 1.5], [0.099, 0.09, 1.56], [0.093, 0.14, 1.66], [0.096, 0.19, 1.74],
  [0.105, 0.24, 1.82], [0.115, 0.29, 1.9], [0.124, 0.34, 1.96], [0.13, 0.39, 1.98], [0.132, 0.43, 1.96],
  [0.128, 0.465, 1.9], [0.113, 0.497, 1.84], [0.094, 0.522, 1.7], [0.08, 0.542, 1.45], [0.074, 0.566, 1.25],
  [0.07, 0.6, 1.2], [0.062, 0.635, 1.12], [0.047, 0.66, 1.1], [0.0, 0.675, 1.1],
];

// The beard, in the head frame: long and full, flush with the cheeks, widest
// at the jaw and jutting forward off the chin down onto the top of the chest,
// tapering to a blunt point. At the jaw it bushes out in two tufts under the
// ears, well wider than the neck, so from behind it shows either side of a bare
// nape — and when he turns his head the chin mass breaks the line of the face.
const BEARD = {
  chain: [[0, 0.085, 0.03], [0, 0.03, 0.07], [0, -0.03, 0.105], [0, -0.09, 0.125], [0, -0.13, 0.12]],
  rad: [0.07, 0.085, 0.07, 0.042, 0.016],
  wide: 1.4,
  // the flare under each ear: out past the jaw, then straight in and forward
  // toward the chin, so from behind it is a short bracket under the skull
  tuft: { chain: [[0.08, 0.095, 0.015], [0.1, 0.052, 0.048], [0.058, -0.005, 0.1]], rad: [0.034, 0.048, 0.02] }, // x mirrored
};

// The drawn figure's beard is the same beard, held in to the jaw — no wider
// than the jaw, so from behind it never hangs past the neck — and joined to
// the face by a sideburn in front of each ear that runs down the jaw into it.
const BEARD1 = {
  ...BEARD,
  wide: 1.15,
  tuft: { chain: [[0.074, 0.13, 0.028], [0.082, 0.075, 0.058], [0.05, 0.015, 0.1]], rad: [0.017, 0.032, 0.02] },
};

// The drawn figure's running shoe: a long last, high over the instep, its sole
// drawn out wide (`wide`: at the heel, at the ball) and pressed flat underneath.
// Every ring still sits on the sole plane, `ankle` below the ankle.
const SHOE1 = {
  chain: [[0, -0.064, -0.045], [0, -0.054, 0.035], [0, -0.063, 0.12], [0, -0.073, 0.172]],
  rad: [0.036, 0.046, 0.037, 0.027],
  heel: -0.045, rHeel: 0.036,
  toe: 0.172, rToe: 0.027,
  flat: 0.02,
  wide: [1.04, 1.3],
};

// The drawn torso: [half-depth, height, width ÷ depth, forward]. A lean
// runner's: hips narrower than the chest, a waist, the lats flaring under the
// arms, a back that narrows into the trapezius and a man's neck; each ring set
// forward or back on the spine's own curve — the seat behind, the small of
// the back forward, the shoulders back again and the neck forward into the head.
const TORSO1 = [
  [0.0, -0.1, 1.8, -0.01], [0.045, -0.097, 1.8, -0.01], [0.085, -0.085, 1.6, -0.015], [0.102, -0.06, 1.45, -0.018],
  [0.108, -0.03, 1.41, -0.016], [0.108, 0.0, 1.41, -0.012], [0.102, 0.04, 1.43, -0.006], [0.096, 0.09, 1.44, 0.0],
  [0.095, 0.14, 1.47, 0.004], [0.1, 0.19, 1.5, 0.004], [0.106, 0.24, 1.52, 0.002], [0.111, 0.29, 1.54, 0.0],
  [0.114, 0.34, 1.57, -0.004], [0.114, 0.39, 1.6, -0.009], [0.109, 0.44, 1.7, -0.014], [0.1, 0.48, 1.8, -0.017],
  [0.09, 0.51, 1.85, -0.016], [0.078, 0.535, 1.8, -0.012], [0.068, 0.56, 1.6, -0.008], [0.064, 0.585, 1.2, -0.003],
  [0.062, 0.61, 1.14, 0.002], [0.059, 0.635, 1.1, 0.006], [0.048, 0.66, 1.06, 0.01], [0.024, 0.675, 1.0, 0.012],
  [0.0, 0.68, 1.0, 0.012],
];

// The drawn limbs, joint by joint (see the chains in createRunner): a deltoid
// over the shoulder, the arm narrowing to the elbow, a forearm with a belly and
// a slim wrist; a thigh that tapers to a knee, the calf swelling below it and
// behind, then a slim ankle. `split`: the ring where the clothing stops;
// `length`: about how long the tube is, for its `aRunner` distances.
const LIMB1 = {
  arm: { rings: 30, split: 1, length: 0.635, radial: 16, rad: [0.052, 0.061, 0.049, 0.036, 0.043, 0.031, 0.027] },
  // the hip cap sits low and in, under the seat; the thigh's front swells
  // forward of the bone, the calf behind it
  leg: { rings: 32, split: 10, length: 0.94, radial: 16, rad: [0.074, 0.086, 0.076, 0.052, 0.061, 0.032], cap: [0.7, 0.035, -0.01], thigh: 0.012, calf: [0.3, 0.017] },
  // the shorts' leg stands off the thigh toward its hem, and the hem is a
  // step, not a taper: the last ring of the shorts sits just behind the first
  // of the skin
  flare: [0.004, 0.009, 0.013],
  hem: 0.008,
};

// The hand, in its own frame (the wrist at the origin, +Z down the hand, +Y
// its back, +X across it toward the thumb of the left hand): a palm, the
// fingers curled under it into a loose runner's fist, and a thumb along the
// side. [radius, sx, sy, sz, at, rotation x].
const HAND1 = {
  palm: [0.05, 0.84, 0.36, 1.0, [0, 0, 0.046], 0],
  fingers: [0.04, 1.0, 0.55, 0.85, [0, -0.014, 0.088], 0.7],
  thumb: [0.03, 0.4, 0.4, 1.0, [0.03, -0.01, 0.04], 0.35],
};

// The head's own pieces, in D0's head frame (the group is scaled): the ears
// under the cap's band, flared back from the skull; the hair cut short, so
// round the back it shows only as a band just under the cap (`nape`: the
// sphere's phi and theta spans, its stretch over the skull's); and a nose.
const HEAD1 = {
  skull: [0.74, 1.1, 0.95],
  ear: { r: 0.03, s: [0.42, 1.0, 0.68], at: [0.088, 0.143, -0.01], tilt: -0.22, flare: 0.4 },
  nape: { phi: [Math.PI * 1.06, Math.PI * 0.88], theta: [1.4, 0.75], s: [0.74 * 1.05, 1.1 * 1.02, 0.95 * 1.05] },
  nose: [0.02, 0.5, 1.0, 0.75, [0, 0.134, 0.108]],
};

// Standing, the drawn figure is at ease: his weight on his right leg, that hip
// up (`tilt`, rad) and over the foot (`sway`), the left foot eased forward
// and out (`ease`), the toes turned out (`toes`: planted, free), the shoulders
// tipped back against the hips (`counter`, × tilt).
const STAND1 = { tilt: 0.06, sway: 0.028, ease: [0.02, 0.07], toes: [0.14, 0.32], counter: 0.75 };

/* ---------------------------------------------------------------- gait ----- */
// Cadence (stride cycles per second) drives the phase, so the gait's speed is
// what a runner's legs can actually do; the stride then follows from the ground
// speed, and the stance is capped by how far one planted foot can carry the body
// (`travel`) — which is what keeps the feet planted instead of skating.
const GAIT = {
  stanceW: 0.62, stanceR: 0.46, // fraction of the cycle a foot is planted
  travel: 0.64, // most the body may travel over one planted foot
  lean: 0.14, // the spine's own forward lean at speed, rad
  leanA: 0.157, // …plus the lean from the ankles, rad (≈9° at the sprint)
  heelW: 0.16, // toe-up at the walk's heel strike, rad
};

// The sculpted figure's stride: the swing's lift rises sooner with the speed
// (`lift`, the power of the run fraction) so a distance pace brings the heel
// up behind; the foot stays back for the first `lag` of the swing while it
// rises, peaking early (`peak`, the swing's power), then the knee drives it
// through; standing, his weight shifts at `shift` rad/s.
const GAIT2 = { lift: 1.4, lag: 0.12, peak: 0.6, shift: 0.55 };

// Where a swinging hand rides off its shoulder, waist frame: [forward back,
// forward front] at the walk then at the sprint, then the same for down and
// for out — the hand back past the hip, forward to the chest. The drawn
// figure's arms are shorter, so his hands ride a little lower and closer.
const SWING0 = [-0.15, 0.19, -0.25, 0.31, -0.54, -0.52, -0.3, -0.11, 0.13, 0.12, 0.16, 0.05];
const SWING1 = [-0.13, 0.17, -0.17, 0.25, -0.49, -0.47, -0.36, -0.17, 0.11, 0.1, 0.1, 0.04];

// Wading: the water holds the legs back, so the pace drops, the knees come up
// high to clear it, he leans into it and the hands ride out wide over it.
const WADE = {
  cadence: 0.7, // × the dry cadence at hip depth
  lift: 0.42, // sole lift in swing: the knee comes up toward the surface
  lean: 0.12, // extra spine lean, rad
};

// Freestyle, in the local frame with the waterline at y = 1.25: the body pitched
// ~80° forward about the chest, so the back, the shoulders and the capped head
// are awash; it rolls on its long axis with the stroke, the legs flutter (six beats
// a cycle) and every third stroke the head turns out on the recovering side to
// breathe — so the breath alternates sides.
const SWIM = {
  pitch: 1.4, // rad forward from vertical
  hipY: 1.12, hipZ: -0.34, // the pelvis: the hips just under the surface
  rateW: 0.35, rateR: 0.8, // arm cycles per second, adrift … the sprint
  speed: 3.6, // the app's sprint swim speed
  roll: 0.6, // the shoulders' roll about the spine, rad; the hips take 60 % of it
  kick: 0.08, // flutter amplitude at the ankle: the soles stay just under the surface
  blend: 4, // 1/s: how fast he goes over into the stroke and back
};
// One hand's path round its shoulder, waist frame, x outward: the entry in front
// of the head, the reach, the catch and pull under the chest, the push past the
// hip, then out and over the water with the elbow high. The keys are evenly
// timed, so the five under water make the pull the long part of the cycle.
const STROKE = new THREE.CatmullRomCurve3([
  [0, 0.5, 0.1], [0.03, 0.56, 0.16], [0.1, 0.4, 0.36], [0, 0.12, 0.44],
  [0.02, -0.22, 0.34], [0.1, -0.46, 0.12], [0.22, -0.08, -0.2], [0.12, 0.3, -0.08],
].map(([x, y, z]) => new THREE.Vector3(x, y, z)), true, 'centripetal');

/* -------------------------------------------------------------- geometry --- */
const RADIAL0 = 12; // cross-section segments around a limb
const CAP = 4; // rings in each end cap (the last closes the tip)
const DENSE = 160; // centreline samples before resampling to rings
const STEP = 0.015; // …spacing along a straight run
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const COS0 = new Float32Array(RADIAL0), SIN0 = new Float32Array(RADIAL0); // the ring's directions
for (let j = 0; j < RADIAL0; j++) {
  const phi = (j / RADIAL0) * TAU;
  COS0[j] = Math.cos(phi);
  SIN0[j] = Math.sin(phi);
}

/**
 * A tapered tube along a chain of joints, rebuilt in place. Interior corners are
 * rounded into fillet arcs, both ends close with a hemisphere, and the normals
 * are analytic, so the surface stays smooth through a bend. `pts`/`rad` are the
 * joint centres and radii (rad[a] ↔ pts[a]).
 * With `split`, the mesh takes [material, material2] and the two meet on the
 * ring between section `split - 1` and `split` — a clean circle, not a seam.
 * `opts` (the drawn figure's): `radial` segments round it, and an `aRunner`
 * attribute — the distance along it from the split ring (about `length` end to
 * end, laid out at `at`), the fraction round it, and 1.
 */
function createTube(rings, material, split = 0, opts = null) {
  const RADIAL = opts?.radial || RADIAL0;
  const COS = RADIAL === RADIAL0 ? COS0 : new Float32Array(RADIAL), SIN = RADIAL === RADIAL0 ? SIN0 : new Float32Array(RADIAL);
  if (COS !== COS0) {
    for (let j = 0; j < RADIAL; j++) {
      COS[j] = Math.cos((j / RADIAL) * TAU);
      SIN[j] = Math.sin((j / RADIAL) * TAU);
    }
  }
  const count = rings * RADIAL;
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const index = new Uint16Array((rings - 1) * RADIAL * 6);
  for (let k = 0; k < rings - 1; k++) {
    for (let j = 0; j < RADIAL; j++) {
      const a = k * RADIAL + j;
      const b = k * RADIAL + ((j + 1) % RADIAL);
      const o = a * 6;
      index[o] = a; index[o + 1] = b; index[o + 2] = a + RADIAL;
      index[o + 3] = b; index[o + 4] = b + RADIAL; index[o + 5] = a + RADIAL;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  if (opts?.length) {
    const body = rings - 2 * CAP;
    const at = (k) => (opts.at ? opts.at[clamp(k - CAP, 0, body - 1)] : clamp(k - CAP, 0, body - 1) / (body - 1)) * opts.length;
    const tag = new Float32Array(count * 3);
    for (let k = 0; k < rings; k++) {
      for (let j = 0; j < RADIAL; j++) {
        const o = (k * RADIAL + j) * 3;
        tag[o] = at(k) - at(split);
        tag[o + 1] = j / RADIAL;
        tag[o + 2] = opts.tag || 1;
      }
    }
    geo.setAttribute('aRunner', new THREE.BufferAttribute(tag, 3));
  }
  if (split > 0) {
    geo.addGroup(0, split * RADIAL * 6, 0);
    geo.addGroup(split * RADIAL * 6, (rings - 1 - split) * RADIAL * 6, 1);
  }
  const mesh = new THREE.Mesh(geo, split > 0 ? material : material[0]);
  mesh.frustumCulled = false; // the buffers move every frame; a stale sphere pops

  const P = []; // dense centreline
  for (let i = 0; i < DENSE; i++) P.push(new THREE.Vector3());
  const PS = new Int32Array(DENSE); // …each sample's chain segment
  const PU = new Float32Array(DENSE); // …and parameter within it (for the radius)
  const S = new Float32Array(DENSE); // cumulative arc length
  const C = []; // ring centreline
  const CR = new Float32Array(rings);
  for (let i = 0; i < rings; i++) C.push(new THREE.Vector3());
  const d1 = new THREE.Vector3(), d2 = new THREE.Vector3();
  const t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
  const mid = new THREE.Vector3(), rel = new THREE.Vector3(), axis = new THREE.Vector3();
  const tan = new THREE.Vector3(), nr = new THREE.Vector3(), br = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  let m = 0;
  const stops = opts?.at || null, bump = opts?.bump || null; // where the body rings sit, and what each adds to its radius
  const flatLimb = !!opts?.flat;

  function put(p, seg, u) {
    if (m >= DENSE) return;
    P[m].copy(p);
    PS[m] = seg;
    PU[m] = u;
    m++;
  }

  /** Dense samples from `from` to `to`, tagged with the chain segment and its
   *  parameter so the resampled radius can follow the chain. */
  function straight(from, to, seg, u0, u1) {
    tmp.subVectors(to, from);
    const steps = Math.max(2, Math.ceil(tmp.length() / STEP));
    for (let k = 1; k <= steps; k++) {
      const f = k / steps;
      axis.copy(from).addScaledVector(tmp, f);
      put(axis, seg, lerp(u0, u1, f));
    }
  }

  function build(pts, rad, fillet, smooth = 2) {
    const n = pts.length;
    m = 0;
    put(pts[0], 0, 0);
    for (let i = 1; i < n - 1; i++) {
      d1.subVectors(pts[i], pts[i - 1]);
      const l1 = d1.length() || 1;
      d1.divideScalar(l1);
      d2.subVectors(pts[i + 1], pts[i]);
      const l2 = d2.length() || 1;
      d2.divideScalar(l2);
      const alpha = Math.acos(clamp(d1.dot(d2), -1, 1)); // deviation at this joint
      if (alpha < 0.12) { // nearly straight: nothing to round
        put(pts[i], i - 1, 1);
        continue;
      }
      const half = (Math.PI - alpha) / 2;
      const R = Math.min(fillet, 0.4 * Math.min(l1, l2) * Math.tan(half));
      const t = R / Math.tan(half);
      t1.copy(pts[i]).addScaledVector(d1, -t);
      t2.copy(pts[i]).addScaledVector(d2, t);
      straight(P[m - 1], t1, i - 1, 0, 1); // the radius runs the whole segment
      mid.copy(pts[i]).addScaledVector(tmp.copy(d2).sub(d1).normalize(), R / Math.sin(half));
      rel.copy(t1).sub(mid);
      axis.crossVectors(rel, tmp.copy(t2).sub(mid)).normalize();
      for (let k = 1; k <= 8; k++) put(tmp.copy(rel).applyAxisAngle(axis, (alpha * k) / 8).add(mid), i - 1, 1);
    }
    straight(P[m - 1], pts[n - 1], n - 2, 0, 1);

    // Resample by arc length onto the body rings; the radius follows the chain.
    let total = 0;
    for (let i = 1; i < m; i++) {
      total += P[i].distanceTo(P[i - 1]);
      S[i] = total;
    }
    const body = rings - 2 * CAP;
    let at = 0;
    for (let k = 0; k < body; k++) {
      const s = (stops ? stops[k] : k / (body - 1)) * total;
      while (at < m - 2 && S[at + 1] < s) at++;
      const span = S[at + 1] - S[at];
      const f = span > 1e-6 ? clamp((s - S[at]) / span, 0, 1) : 0;
      C[k + CAP].lerpVectors(P[at], P[at + 1], f);
      const r0 = lerp(rad[PS[at]], rad[PS[at] + 1], PU[at]);
      const r1 = lerp(rad[PS[at + 1]], rad[PS[at + 1] + 1], PU[at + 1]);
      CR[k + CAP] = lerp(r0, r1, f);
    }
    for (let pass = 0; pass < smooth; pass++) { // so a taper has no kink at a joint
      let prev = CR[CAP];
      for (let k = CAP + 1; k < CAP + body - 1; k++) {
        const cur = CR[k];
        CR[k] = (prev + 2 * cur + CR[k + 1]) * 0.25;
        prev = cur;
      }
    }
    if (bump) for (let k = CAP; k < CAP + body; k++) CR[k] += bump[k];
    const last = CAP + body - 1;
    tan.subVectors(C[CAP + 1], C[CAP]).normalize();
    for (let j = 0; j < CAP; j++) { // start cap: back to a point
      const th = ((CAP - j) * Math.PI) / (2 * CAP);
      C[j].copy(C[CAP]).addScaledVector(tan, -CR[CAP] * Math.sin(th));
      CR[j] = CR[CAP] * Math.cos(th);
    }
    tan.subVectors(C[last], C[last - 1]).normalize();
    for (let i = 1; i <= CAP; i++) { // end cap: forward to a point
      const th = (i * Math.PI) / (2 * CAP);
      C[last + i].copy(C[last]).addScaledVector(tan, CR[last] * Math.sin(th));
      CR[last + i] = CR[last] * Math.cos(th);
    }

    // Rings: a reference-axis frame along the centreline, analytic normals.
    for (let k = 0; k < rings; k++) {
      const lo = Math.max(0, k - 1), hi = Math.min(rings - 1, k + 1);
      tan.subVectors(C[hi], C[lo]);
      const ds = tan.length() || 1e-5;
      tan.divideScalar(ds);
      // the taper tilts the normal along the path — except on a drawn limb's
      // body, which a painter shades as the cylinder it is round
      const drds = flatLimb && k >= CAP && k < rings - CAP ? 0 : (CR[hi] - CR[lo]) / ds;
      const ref = Math.abs(tan.z) < 0.9 ? AXIS_Z : AXIS_X;
      nr.copy(ref).addScaledVector(tan, -ref.dot(tan)).normalize();
      br.crossVectors(tan, nr);
      const tip = k === 0 ? -1 : k === rings - 1 ? 1 : 0;
      for (let j = 0; j < RADIAL; j++) {
        const co = COS[j], si = SIN[j];
        const ux = co * nr.x + si * br.x, uy = co * nr.y + si * br.y, uz = co * nr.z + si * br.z;
        const o = (k * RADIAL + j) * 3;
        position[o] = C[k].x + CR[k] * ux;
        position[o + 1] = C[k].y + CR[k] * uy;
        position[o + 2] = C[k].z + CR[k] * uz;
        if (tip) {
          normal[o] = tan.x * tip; normal[o + 1] = tan.y * tip; normal[o + 2] = tan.z * tip;
        } else {
          const nx = ux - drds * tan.x, ny = uy - drds * tan.y, nz = uz - drds * tan.z;
          const inv = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);
          normal[o] = nx * inv; normal[o + 1] = ny * inv; normal[o + 2] = nz * inv;
        }
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
  }

  return { mesh, build };
}

/** A sphere with its scaling baked in, so a style's shader sees straight normals
 *  (turned `rx` about x, then `ry` about y, before it is moved into place). */
function ball(r, sx, sy, sz, at, material, rx = 0, ry = 0) {
  const geo = new THREE.SphereGeometry(r, 18, 12);
  geo.scale(sx, sy, sz);
  if (rx) geo.rotateX(rx);
  if (ry) geo.rotateY(ry);
  geo.translate(at[0], at[1], at[2]);
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  return mesh;
}

/** Static tube geometry from a plain chain (no per-frame rebuild), unsmoothed so
 *  a straight sole or jaw keeps its exact line. */
function staticTube(chain, rad, material, fillet = 0, rings = 18, opts = null) {
  const tube = createTube(rings, material, 0, opts);
  const pts = chain.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  tube.build(pts, new Float32Array(rad), fillet, 0);
  return tube.mesh;
}

/** Draw a lathe out sideways ring by ring (`prof[j][2]`, ring j of each column),
 *  keeping the normals true to the stretched surface (n → J⁻ᵀn); a fourth
 *  column sets each ring forward or back. */
function widen(geo, prof) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, n = prof.length;
  for (let i = 0; i < pos.count; i++) {
    const j = i % n;
    const a = prof[Math.max(0, j - 1)], b = prof[Math.min(n - 1, j + 1)];
    const s = prof[j][2], ds = (b[2] - a[2]) / (b[1] - a[1]); // how fast the stretch changes with height
    const x = pos.getX(i), nx = nor.getX(i);
    pos.setX(i, x * s);
    nor.setXYZ(i, nx / s, nor.getY(i) - (x * ds * nx) / s, nor.getZ(i));
    if (prof[j].length > 3) {
      pos.setZ(i, pos.getZ(i) + prof[j][3]);
      nor.setY(i, nor.getY(i) - ((b[3] - a[3]) / (b[1] - a[1])) * nor.getZ(i));
    }
  }
  geo.normalizeNormals();
}

const ikDir = new THREE.Vector3(), ikPole = new THREE.Vector3();

/** Two-bone IK: the middle joint of H→K→T, bending toward `pole`. */
function solve2(H, T, L1, L2, pole, K) {
  const reach = T.distanceTo(H);
  const d = clamp(reach, Math.abs(L1 - L2) + 0.01, L1 + L2 - 0.002);
  ikDir.subVectors(T, H).divideScalar(reach || 1);
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  ikPole.copy(pole).addScaledVector(ikDir, -pole.dot(ikDir));
  const pl = ikPole.length();
  ikPole.divideScalar(pl > 1e-4 ? pl : 1);
  K.copy(H).addScaledVector(ikDir, a).addScaledVector(ikPole, h);
  return reach > L1 + L2 - 0.002;
}

/* ------------------------------------------------- the sculpted figure ---- */
// runner.look 2: one continuous body instead of tubes on a rig. He is
// sculpted once, when he is built, as a field — round cones and ellipsoids
// for the masses of a lean distance runner (ribcage, chest, lats and shoulder
// blades, pelvis and glutes, deltoids, quads, hamstrings and calves) melted
// into one another — and drawn out as a mesh. The body is skinned to the rig's
// own joints, with a helper at each hip, knee, shoulder and elbow that turns
// half way, so a bent joint keeps its volume. The singlet hangs off the chest
// and the shorts stand off the thighs in the same field. The head, the hands,
// the shoes, the cap, the hair and the beard are sculpted finer, each riding
// its own bone; where the head and the hands take over from the body, the body
// is sunk a hair under them, so the two never fight over a pixel.
//
// Every vertex carries `aFig`: how shut in it is (0 open … 1), then how far
// inside the singlet, the shorts and the sock it sits, in metres — so a style
// cuts the cloth's edges as clean lines whatever the mesh.

// The sculpted figure's skeleton: the drawn one's, a little narrower across
// the shoulders, the head at its own size.
const D2 = { ...D1, shoulderX: 0.182, head: 1 };

// The sculpted shoe's sole, in the foot frame: flat between `heel` and `toe`
// and rocked up round them — the same arcs `contact` rolls him over.
const SHOE2 = { heel: -0.04, rHeel: 0.03, toe: 0.165, rToe: 0.04, flat: 0.02 };

// He is sculpted standing with his arms out from his sides (`armRest`, rad
// from the vertical, so an armpit never melts into the chest) and drawn out at
// `cell` metres: the body coarser, the head and the hands finer; the body's
// broad masses (softNormals) are read over `soft` metres, so a limb's light
// is one taper and not its knee and calf. The head takes the neck over across
// `neck` (height), the hand the forearm across `wrist` (along the arm, which
// is cut off at `armCut`): there the body is sunk `inset`. The cloth: the
// singlet's hem; the shorts' hem, its rise at the side split and the
// waistband; the top of the sock and its rise at the heel.
const FIG2 = {
  armRest: 0.5,
  cell: { body: 0.014, head: 0.0045, brim: 0.003, hand: 0.0045, shoe: 0.006 },
  soft: 0.06,
  neck: [1.53, 1.552],
  wrist: [0.512, 0.528],
  armCut: 0.53,
  inset: 0.0015,
  hem: 0.985,
  shorts: [0.8, 0.04, 1.05],
  sock: [0.135, 0.012],
};

// The sculpted figure's arms swing from the shoulder, standing, walking then
// running (rad): the upper arm's lean forward at the middle of its swing and
// its swing either side, the elbow's bend with the hand back and with it
// through in front, the forearm turned in toward his middle, the upper arm out
// from his side. The elbow and the forearm's turn come in early (`bend`: the
// power of the walk left in the run), so a jog already carries the hands at
// the waist with the elbows near square.
const ARM2 = {
  flex: [0.06, -0.06, -0.2],
  swing: [0, 0.3, 0.52],
  back: [0.24, 0.3, 1.5],
  front: [0.24, 0.6, 1.95],
  turn: [0.1, 0.12, 0.36],
  out: [0.1, 0.12, 0.17],
  bend: 3,
};

// The head, in its own frame (origin at the neck's pivot, +z his face): an
// eyeball's centre and an ear's (x mirrored); the cap's brim — a plate whose
// mid-surface passes y0 at the crown's front (z0), tilting down forward and
// curving down at its sides, half as thick as given, out to an arc (half
// width, centre z, reach) that meets the crown at the temples; the crown
// (centre, radii); the band its lower edge follows round the head (at the
// back, its rise to the front, the shape of that rise); and the button.
const HEAD2 = {
  eye: [0.031, 0.16, 0.08],
  ear: [0.078, 0.153, -0.012],
  brim: [0.095, 0.205, 0.32, 2.2, 0.0035, 0.08, -0.049, 0.219],
  crown: [0, 0.188, -0.011, 0.0825, 0.104, 0.111],
  band: [0.155, 0.052, 0.35],
  button: [0, 0.2925, -0.018],
};

/** Where a style draws on the sculpted figure, in the frames its pieces are
 *  built in: the head's (HEAD2), a hand's (the wrist at the origin, +z down
 *  the hand, +y its back) and a shoe's (the ankle at the origin: the sole,
 *  then the midsole's height at the heel and at the ball; the rocker's heel
 *  and its radius, its toe and its radius, as SHOE2). */
export const FIGURE = { ...HEAD2, sole: [-D2.ankle, 0.034, 0.024], rocker: [SHOE2.heel, SHOE2.rHeel, SHOE2.toe, SHOE2.rToe] };

const sminK = (a, b, k) => {
  const h = k - Math.abs(a - b);
  return h > 0 ? Math.min(a, b) - (h * h) / (4 * k) : Math.min(a, b);
};
const smaxK = (a, b, k) => -sminK(-a, -b, k);
// how far a point is from a box, squared (0 inside it): no shape in the box is
// nearer
const gap2 = (b, x, y, z) => {
  const dx = Math.max(b[0] - x, x - b[3], 0), dy = Math.max(b[1] - y, y - b[4], 0), dz = Math.max(b[2] - z, z - b[5], 0);
  return dx * dx + dy * dy + dz * dz;
};
// …and whether it is at least `d` off
const beyond = (b, x, y, z, d) => d <= 0 || gap2(b, x, y, z) >= d * d;
const ramp = (a, b, v) => smoothstep(clamp((v - a) / (b - a), 0, 1));
// world → a shape's own axes (rows), for a shape turned by these Euler angles
function turned(x, y, z) {
  const e = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(x, y, z)).elements;
  return [e[0], e[1], e[2], e[4], e[5], e[6], e[8], e[9], e[10]];
}

/** An ellipsoid (a close bound on its distance), turned by `m` (rows: world →
 *  its own axes). */
function sdEll([cx, cy, cz], [rx, ry, rz], m = null) {
  const jx = 1 / (rx * rx), jy = 1 / (ry * ry), jz = 1 / (rz * rz), r0 = Math.min(rx, ry, rz), R = Math.max(rx, ry, rz);
  const f = (x, y, z) => {
    let dx = x - cx, dy = y - cy, dz = z - cz;
    if (m) {
      const a = m[0] * dx + m[1] * dy + m[2] * dz, b = m[3] * dx + m[4] * dy + m[5] * dz;
      dz = m[6] * dx + m[7] * dy + m[8] * dz;
      dx = a;
      dy = b;
    }
    const k0 = Math.sqrt(dx * dx * jx + dy * dy * jy + dz * dz * jz);
    const k1 = Math.sqrt(dx * dx * jx * jx + dy * dy * jy * jy + dz * dz * jz * jz);
    return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -r0;
  };
  f.box = [cx - R, cy - R, cz - R, cx + R, cy + R, cz + R];
  return f;
}

/** A round cone from `a` (radius ra) to `b` (rb): its exact distance. */
function sdCone([ax, ay, az], [bx, by, bz], ra, rb) {
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const l2 = ux * ux + uy * uy + uz * uz, rr = ra - rb, a2 = l2 - rr * rr, il2 = 1 / l2;
  const f = (x, y, z) => {
    const px = x - ax, py = y - ay, pz = z - az;
    const t = px * ux + py * uy + pz * uz, u = t - l2;
    const qx = px * l2 - ux * t, qy = py * l2 - uy * t, qz = pz * l2 - uz * t;
    const x2 = qx * qx + qy * qy + qz * qz, y2 = t * t * l2, z2 = u * u * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(u) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb;
    if (Math.sign(t) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra;
    return (Math.sqrt(x2 * a2 * il2) + t * rr) * il2 - ra;
  };
  const R = Math.max(ra, rb);
  f.box = [Math.min(ax, bx) - R, Math.min(ay, by) - R, Math.min(az, bz) - R, Math.max(ax, bx) + R, Math.max(ay, by) + R, Math.max(az, bz) + R];
  return f;
}

/** Shapes melted in order, each `[shape, k]`: k > 0 melts it in over k
 *  metres, 0 adds it hard, k < 0 carves it out over |k|. A shape too far off
 *  to change the result is not evaluated. */
function sculpt(list) {
  const fs = list.map((e) => e[0]), ks = list.map((e) => e[1] || 0), n = fs.length;
  const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    if (ks[i] < 0) continue;
    for (let a = 0; a < 3; a++) {
      box[a] = Math.min(box[a], fs[i].box[a] - ks[i]);
      box[a + 3] = Math.max(box[a + 3], fs[i].box[a + 3] + ks[i]);
    }
  }
  const f = (x, y, z) => {
    let d = fs[0](x, y, z);
    for (let i = 1; i < n; i++) {
      const k = ks[i];
      if (k >= 0) {
        if (beyond(fs[i].box, x, y, z, d + k)) continue;
        const s = fs[i](x, y, z);
        d = k > 0 ? sminK(d, s, k) : Math.min(d, s);
      } else if (!beyond(fs[i].box, x, y, z, -k - d)) {
        d = smaxK(d, -fs[i](x, y, z), -k);
      }
    }
    return d;
  };
  f.box = box;
  return f;
}

/** A field moved by -o: g(p) = f(p + o). */
function shifted(f, ox, oy, oz) {
  const g = (x, y, z) => f(x + ox, y + oy, z + oz);
  g.box = [f.box[0] - ox, f.box[1] - oy, f.box[2] - oz, f.box[3] - ox, f.box[4] - oy, f.box[5] - oz];
  return g;
}

const NET_CORNER = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
const NET_EDGE = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

/**
 * The surface f = 0 inside `box`, drawn out at `h` metres a cell (surface
 * nets): one vertex in each cell the surface crosses, a quad across each grid
 * edge it cuts, and each vertex then stepped onto the surface, its normal the
 * field's own gradient. The field is read exactly only near the surface: a
 * coarse pass says where the surface cannot be.
 */
async function nets(f, box, h) {
  const [x0, y0, z0] = box;
  const nx = Math.ceil((box[3] - x0) / h) + 1, ny = Math.ceil((box[4] - y0) / h) + 1, nz = Math.ceil((box[5] - z0) / h) + 1;
  const C = 3, cx = Math.ceil((nx - 1) / C) + 1, cy = Math.ceil((ny - 1) / C) + 1, cz = Math.ceil((nz - 1) / C) + 1;
  const coarse = new Float32Array(cx * cy * cz);
  for (let k = 0; k < cz; k++) {
    await pace();
    for (let j = 0; j < cy; j++) {
      for (let i = 0; i < cx; i++) coarse[i + cx * (j + cy * k)] = f(x0 + i * C * h, y0 + j * C * h, z0 + k * C * h);
    }
  }
  const val = new Float32Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) {
    await pace();
    const ck = Math.min(cz - 1, Math.round(k / C)), dk = k - ck * C;
    for (let j = 0; j < ny; j++) {
      const cj = Math.min(cy - 1, Math.round(j / C)), dj = j - cj * C;
      for (let i = 0; i < nx; i++) {
        const ci = Math.min(cx - 1, Math.round(i / C)), di = i - ci * C;
        const fc = coarse[ci + cx * (cj + cy * ck)];
        // the field changes no faster than distance (with a margin for the
        // ellipsoids' bound): this far from the surface its sign is known
        val[i + nx * (j + ny * k)] = Math.abs(fc) > 1.35 * h * Math.sqrt(di * di + dj * dj + dk * dk) + 1e-7
          ? fc : f(x0 + i * h, y0 + j * h, z0 + k * h);
      }
    }
  }
  const mx = nx - 1, my = ny - 1;
  const cell = new Int32Array(mx * my * (nz - 1)).fill(-1);
  const P = [];
  const off = NET_CORNER.map(([a, b, c]) => a + nx * (b + ny * c));
  const cv = new Float64Array(8);
  for (let k = 0; k < nz - 1; k++) {
    await pace();
    for (let j = 0; j < my; j++) {
      for (let i = 0; i < mx; i++) {
        const base = i + nx * (j + ny * k);
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          cv[c] = val[base + off[c]];
          if (cv[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let ax = 0, ay = 0, az = 0, cnt = 0;
        for (const [a, b] of NET_EDGE) {
          if ((cv[a] < 0) === (cv[b] < 0)) continue;
          const t = cv[a] / (cv[a] - cv[b]), A = NET_CORNER[a], B = NET_CORNER[b];
          ax += A[0] + t * (B[0] - A[0]);
          ay += A[1] + t * (B[1] - A[1]);
          az += A[2] + t * (B[2] - A[2]);
          cnt++;
        }
        cell[i + mx * (j + my * k)] = P.length / 3;
        P.push(x0 + (i + ax / cnt) * h, y0 + (j + ay / cnt) * h, z0 + (k + az / cnt) * h);
      }
    }
  }
  const I = [];
  const at = (i, j, k) => cell[i + mx * (j + my * k)];
  const d2 = (a, b) => (P[3 * a] - P[3 * b]) ** 2 + (P[3 * a + 1] - P[3 * b + 1]) ** 2 + (P[3 * a + 2] - P[3 * b + 2]) ** 2;
  // a quad round a cut edge, wound to face out of the field; split along its
  // shorter diagonal
  const quad = (a, b, c, d, out) => {
    if (!out) [b, d] = [d, b];
    if (d2(a, c) <= d2(b, d)) I.push(a, b, c, a, c, d);
    else I.push(a, b, d, b, c, d);
  };
  // an edge along one axis needs the cells either side of it on the other two
  for (let k = 0; k < nz - 1; k++) {
    await pace();
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const v = i + nx * (j + ny * k), inside = val[v] < 0;
        if (j && k && inside !== val[v + 1] < 0) quad(at(i, j - 1, k - 1), at(i, j, k - 1), at(i, j, k), at(i, j - 1, k), inside);
        if (i && k && inside !== val[v + nx] < 0) quad(at(i - 1, j, k - 1), at(i - 1, j, k), at(i, j, k), at(i, j, k - 1), inside);
        if (i && j && inside !== val[v + nx * ny] < 0) quad(at(i - 1, j - 1, k), at(i, j - 1, k), at(i, j, k), at(i - 1, j, k), inside);
      }
    }
  }
  const n = P.length / 3, pos = new Float32Array(P), nor = new Float32Array(n * 3), e = h * 0.15;
  for (let v0 = 0; v0 < n; v0 += 512) {
    await pace();
    for (let v = v0, end = Math.min(n, v0 + 512); v < end; v++) {
      let x = pos[3 * v], y = pos[3 * v + 1], z = pos[3 * v + 2];
      const f1 = f(x + e, y - e, z - e), f2 = f(x - e, y - e, z + e), f3 = f(x - e, y + e, z - e), f4 = f(x + e, y + e, z + e);
      const gx = f1 - f2 - f3 + f4, gy = -f1 - f2 + f3 + f4, gz = -f1 + f2 - f3 + f4;
      const g = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
      nor[3 * v] = gx / g;
      nor[3 * v + 1] = gy / g;
      nor[3 * v + 2] = gz / g;
      // one Newton step onto the surface, never more than most of a cell
      const step = clamp((f1 + f2 + f3 + f4) / 4 / (g / (4 * e)), -0.6 * h, 0.6 * h);
      x -= (step * gx) / g;
      y -= (step * gy) / g;
      z -= (step * gz) / g;
      pos[3 * v] = x;
      pos[3 * v + 1] = y;
      pos[3 * v + 2] = z;
    }
  }
  return { pos, nor, idx: new Uint32Array(I) };
}

/** The sculpted figure's fields, in the frames its pieces are built in: the
 *  body in his own (the ground at y = 0, standing on D2), the head and what
 *  it wears in the head's, a hand in its own, a shoe in the foot's. */
function figureFields(D) {
  const HY = D.hipY, SY = HY + D.shoulderY, KY = HY - D.thigh, AY = KY - D.shin;
  const HP = [0, HY + D.neckY, 0.008];
  const sa = Math.sin(FIG2.armRest), ca = Math.cos(FIG2.armRest);
  const both = (make) => [-1, 1].flatMap(make);

  // the neck and the trapezius, which the head shares
  const neckTraps = sculpt([
    [sdCone([0, 1.4, -0.016], [0, 1.61, 0], 0.058, 0.054), 0],
    ...both((s) => [[sdCone([0, 1.505, -0.032], [s * 0.162, 1.46, -0.02], 0.04, 0.027), 0.035]]),
  ]);
  // the singlet's fall, hung off the chest and the shoulder blades over the
  // waist to its hem: [height, centre z, half width, half depth]
  const HULL = [[FIG2.hem, -0.012, 0.163, 0.119], [1.05, -0.008, 0.153, 0.108], [1.15, -0.004, 0.152, 0.106], [1.25, -0.006, 0.158, 0.112], [1.33, -0.006, 0.138, 0.094]];
  const hull = (x, y, z) => {
    const v = clamp(y, HULL[0][0], HULL[4][0]);
    let i = 0;
    while (i < 3 && v > HULL[i + 1][0]) i++;
    const a = HULL[i], b = HULL[i + 1], t = (v - a[0]) / (b[0] - a[0]);
    const w = lerp(a[2], b[2], t), dp = lerp(a[3], b[3], t), dz = z - lerp(a[1], b[1], t);
    const e = (Math.sqrt((x * x) / (w * w) + (dz * dz) / (dp * dp)) - 1) * Math.min(w, dp);
    return Math.max(e, HULL[0][0] - y, y - HULL[4][0]);
  };
  hull.box = [-0.165, HULL[0][0], -0.135, 0.165, HULL[4][0], 0.115];
  const torso = sculpt([
    [sdEll([0, 1.272, -0.006], [0.145, 0.165, 0.104]), 0], // ribcage
    [sdEll([0, 1.125, 0.002], [0.132, 0.105, 0.092]), 0.05], // waist
    [sdEll([0, 1.035, 0.012], [0.134, 0.085, 0.09]), 0.04], // belly
    [sdEll([0, 0.968, -0.012], [0.148, 0.098, 0.098]), 0.045], // pelvis
    ...both((s) => [
      [sdEll([s * 0.066, 0.935, -0.058], [0.077, 0.09, 0.068]), 0.035], // glute
      // the upper chest, the top of the back and the shoulder's root as one
      // mass out to the joint, so the shoulders are of a piece with him
      [sdCone([s * 0.03, 1.395, -0.014], [s * 0.165, 1.425, -0.012], 0.07, 0.052), 0.04], // shoulder girdle
      [sdEll([s * 0.07, 1.348, 0.058], [0.082, 0.058, 0.03], turned(0, 0, s * 0.12)), 0.035], // chest, a broad flat plate
      [sdEll([s * 0.112, 1.275, -0.036], [0.045, 0.12, 0.066]), 0.04], // lat
      [sdEll([s * 0.074, 1.36, -0.07], [0.064, 0.074, 0.032], turned(0, 0, -s * 0.25)), 0.035], // shoulder blade
      [sdCone([s * 0.018, 1.445, 0.05], [s * 0.16, 1.47, 0.01], 0.017, 0.016), 0.03], // collarbone
    ]),
    [hull, 0.015],
    [sdEll([0, 1.425, -0.06], [0.115, 0.085, 0.042]), 0.04], // the trapezius' middle, over the shoulder blades up into the neck
    [neckTraps, 0.03],
  ]);

  // the shorts' hem round a thigh, from its outside (th = 0)
  const hemShorts = (th) => FIG2.shorts[0] + FIG2.shorts[1] * smoothstep(clamp(1 - Math.abs(th) / 0.55, 0, 1));
  const leg = (sx) => {
    const L = (dx, y, z) => [sx * (D.hipX + dx), y, z]; // beside the leg's axis, dx out from it
    const ax = sx * D.hipX;
    const cone = sdCone(L(-0.002, HY + 0.005, -0.008), L(0.001, FIG2.shorts[0] - 0.02, 0.004), 0.097, 0.087);
    const shorts = (x, y, z) => Math.max(cone(x, y, z), hemShorts(Math.atan2(z, sx * (x - ax))) - y);
    shorts.box = cone.box;
    return sculpt([
      [sdCone(L(-0.004, HY - 0.005, 0), L(0.001, KY + 0.02, 0.008), 0.08, 0.052), 0], // thigh
      [sdEll(L(0.03, KY + 0.21, 0.004), [0.036, 0.13, 0.05]), 0.04], // vastus lateralis
      [sdEll(L(0.004, KY + 0.24, 0.045), [0.045, 0.15, 0.035]), 0.04], // rectus femoris
      [sdEll(L(0, KY + 0.2, -0.03), [0.055, 0.17, 0.048]), 0.05], // hamstrings, down into the back of the knee
      [sdEll(L(-0.032, KY + 0.32, -0.005), [0.04, 0.1, 0.05]), 0.04], // adductors
      [sdEll(L(0.001, KY, 0.002), [0.044, 0.06, 0.04]), 0.05], // knee
      [sdCone(L(0.001, KY - 0.02, 0.006), L(0, AY + 0.025, -0.002), 0.044, 0.029), 0.04], // shin
      // a lean runner's calf: one long shallow mass from the back of the
      // knee, drawn down into the tendon, so the leg has a single taper
      [sdEll(L(0, KY - 0.13, -0.024), [0.038, 0.15, 0.031]), 0.05], // calf
      [sdCone(L(0, KY - 0.2, -0.024), L(0, AY + 0.02, -0.03), 0.012, 0.014), 0.03], // Achilles
      [sdCone(L(0, AY + 0.055, -0.004), L(0, AY - 0.02, 0), 0.025, 0.028), 0.025], // ankle
      [shorts, 0.012], // the shorts' leg
    ]);
  };

  const arm = (sx) => {
    const S = [sx * D.shoulderX, SY, D.shoulderZ];
    const ux = sx * sa, uy = -ca, ox = sx * ca, oy = sa;
    // along the arm from the shoulder (t), out from it (a), forward (f)
    const A = (t, a = 0, f = 0) => [S[0] + ux * t + ox * a, S[1] + uy * t + oy * a, S[2] + f];
    const M = [ox, oy, 0, ux, uy, 0, 0, 0, 1];
    const fore = sdCone(A(D.upper + 0.01), A(D.upper + D.fore), 0.036, 0.023);
    const shape = sculpt([
      [sdEll(A(0.05, 0.004), [0.04, 0.085, 0.05], M), 0], // deltoid
      [sdCone(A(0.04), A(D.upper - 0.015), 0.041, 0.034), 0.035], // upper arm
      [sdEll(A(0.17, -0.004, 0.014), [0.034, 0.075, 0.034], M), 0.03], // biceps
      [sdEll(A(0.15, 0.006, -0.017), [0.034, 0.09, 0.034], M), 0.03], // triceps
      [sdEll(A(D.upper, 0, -0.004), [0.033, 0.034, 0.032], M), 0.025], // elbow
      [sdEll(A(D.upper + 0.002, 0, -0.024), [0.018, 0.022, 0.014], M), 0.015], // its point
      [fore, 0.025], // forearm
      [sdEll(A(D.upper + 0.07, 0.01, 0.006), [0.038, 0.075, 0.034], M), 0.03], // its belly
    ]);
    const f = (x, y, z) => {
      const t = (x - S[0]) * ux + (y - S[1]) * uy;
      return Math.max(shape(x, y, z), t - FIG2.armCut) + FIG2.inset * ramp(FIG2.wrist[0], FIG2.wrist[1], t);
    };
    f.box = shape.box;
    f.fore = fore;
    return f;
  };

  const legs = [leg(-1), leg(1)], arms = [arm(-1), arm(1)];
  const groups = [torso, legs[0], legs[1], arms[0], arms[1]];
  const join = [0.035, 0.035, 0.035, 0.03, 0.03];
  const lb = new Float64Array(5);
  // the body: its masses melted together, the nearest read first and the
  // others only where they could still change it
  const body = (x, y, z) => {
    let first = 0;
    for (let g = 0; g < 5; g++) {
      lb[g] = gap2(groups[g].box, x, y, z);
      if (lb[g] < lb[first]) first = g;
    }
    const d0 = groups[first](x, y, z);
    let d = Infinity;
    for (let g = 0; g < 5; g++) {
      if (g !== first && beyond(groups[g].box, x, y, z, d0 + 1.5 * join[g])) continue;
      const s = g === first ? d0 : groups[g](x, y, z);
      d = d === Infinity ? s : sminK(d, s, join[g]);
    }
    return d + FIG2.inset * ramp(FIG2.neck[0], FIG2.neck[1], y);
  };

  const [ex, ey, ez] = HEAD2.eye, [rx, ry, rz] = HEAD2.ear;
  const head = sculpt([
    [sdEll([0, 0.188, -0.014], [0.074, 0.096, 0.097]), 0], // cranium
    [sdEll([0, 0.19, 0.035], [0.064, 0.068, 0.058]), 0.03], // forehead
    [sdCone([-0.043, 0.176, 0.078], [0.043, 0.176, 0.078], 0.0125, 0.0125), 0.02], // brow
    [sdEll([0, 0.13, 0.042], [0.057, 0.062, 0.057]), 0.03], // face
    ...both((s) => [
      [sdEll([s * 0.046, 0.147, 0.061], [0.021, 0.015, 0.021]), 0.02], // cheekbone
      [sdCone([s * 0.056, 0.098, -0.012], [s * 0.019, 0.053, 0.072], 0.019, 0.017), 0.03], // jaw
    ]),
    [sdEll([0, 0.053, 0.075], [0.025, 0.021, 0.019]), 0.02], // chin
    [sdCone([0, 0.162, 0.095], [0, 0.129, 0.119], 0.0075, 0.0105), 0.012], // nose
    ...both((s) => [[sdEll([s * 0.011, 0.129, 0.106], [0.0075, 0.007, 0.0075]), 0.008]]), // its wings
    [sdEll([0, 0.096, 0.091], [0.021, 0.0085, 0.01]), 0.01], // lips
    ...both((s) => [[sdEll([s * ex, ey + 0.001, ez + 0.016], [0.012, 0.011, 0.012]), -0.005]]), // eye sockets, shallow
    ...both((s) => [[sdEll([s * ex, ey, ez], [0.0122, 0.0122, 0.0122]), 0.004]]), // …and the eyes in them
    ...both((s) => [[sdEll([s * rx, ry, rz], [0.0105, 0.029, 0.019], turned(-0.2, -s * 0.3, 0)), 0.006]]), // ears
    ...both((s) => [[sdEll([s * (rx + 0.0095), ry - 0.005, rz + 0.004], [0.0055, 0.013, 0.009]), -0.004]]), // …their bowls
    [shifted(neckTraps, HP[0], HP[1], HP[2]), 0.03],
  ]);

  // the cap's band: the line its lower edge follows round the head, from the
  // front (th = 0) to the back (th = π)
  const band = (th) => HEAD2.band[0] + HEAD2.band[1] * Math.pow(0.5 + 0.5 * Math.cos(th), HEAD2.band[2]);

  // the beard: the lower face grown out, thicker toward the jaw, in the zone
  // a full beard keeps (below a line from the sideburn down to the corner of
  // the mouth, where the moustache's own line turns up under the nose; in
  // front of the ear; under the jaw, lower toward the chin and higher at the
  // sides), with its fall hanging off it; thin at its back edge, full at the chin, and at its
  // edge barely off the skin, so where it stops is a change of colour and not
  // a step
  const BEARD_MASS = [
    [sdEll([0, 0.05, 0.062], [0.06, 0.028, 0.068], turned(0.7, 0, 0)), 0.02], // its fall, from under the jaw down to a round point
  ];
  const beardOf = (d, x, y, z, th) => {
    const line = 0.113 + 0.05 * th * th - 0.011 * Math.exp(-(((th - 0.3) / 0.1) ** 2));
    const floor = Math.max(lerp(0.065, 0.03, ramp(-0.015, 0.06, z)), lerp(0.03, 0.072, ramp(0.012, 0.05, Math.abs(x))));
    const zone = Math.max(y - line, lerp(-0.022, 0.006, ramp(0.085, 0.14, y)) - z, floor - y);
    const full = 0.003 + 0.011 * ramp(0.15, 0.095, y) * ramp(-0.025, 0.035, z);
    let b = smaxK(d - 0.0015 - (full - 0.0015) * ramp(0, 0.014, -zone), zone, 0.003);
    for (const [f, k] of BEARD_MASS) if (!beyond(f.box, x, y, z, b + k)) b = sminK(b, f(x, y, z), k);
    // combed into a few locks that end in soft points along its lower edge
    // (the field eased, so the locks never outrun how fast it may change)
    const lock = 0.5 + 0.5 * Math.cos(7 * Math.atan2(x, z - 0.02) + 0.6 * Math.sin(y * 45));
    return 0.7 * (b - (0.001 + 0.0042 * ramp(0.07, 0.0, y)) * lock * ramp(0.11, 0.085, y));
  };
  // the hair, cut short: under the cap's band round the back down to the
  // nape, over the ears and down in front of them as sideburns, thinning to
  // nothing at its line
  const hairline = (th) => lerp(0.192 - 0.042 * ramp(1.14, 1.26, th) * (1 - ramp(1.39, 1.51, th)), 0.118, ramp(2.05, 2.6, th));
  const hairOf = (d, y, th) => {
    const zone = Math.max(hairline(th) - y, (0.95 - th) * 0.08);
    return smaxK(d - 0.0012 - 0.0035 * ramp(0, 0.01, -zone), zone, 0.003);
  };
  // the cap's crown above its band, and its button; the crown never closer
  // to the head than a cap's own thickness, so the hair stays under it
  const dome = sdEll(HEAD2.crown.slice(0, 3), HEAD2.crown.slice(3));
  const button = sdEll(HEAD2.button, [0.0075, 0.005, 0.0075]);
  // the head and all it wears, as one surface; `worn` keeps what the skin,
  // the beard, the hair and the crown each read at the last point
  const worn = new Float64Array(4);
  const top = (x, y, z) => {
    const th = Math.atan2(Math.abs(x), z), d = head(x, y, z);
    worn[0] = d;
    worn[1] = beardOf(d, x, y, z, th);
    worn[2] = hairOf(d, y, th);
    worn[3] = sminK(Math.max(Math.min(dome(x, y, z), d - 0.0095), band(th) - y), button(x, y, z), 0.004);
    return Math.min(worn[0], worn[1], worn[2], worn[3]);
  };
  top.box = head.box;
  top.worn = worn;
  // the brim: a plate tilted down over the eyes and curved down at its
  // sides, out from the crown to an arc that meets it at the temples
  const [bz0, by0, tilt, curve, half, bax, boz, baz] = HEAD2.brim;
  const cosT = Math.cos(Math.atan(tilt));
  const brim = (x, y, z) => {
    const slab = Math.abs(y - (by0 - tilt * (z - bz0) - curve * x * x)) * cosT - half;
    const u = z - boz;
    const out = (Math.sqrt((x * x) / (bax * bax) + (u * u) / (baz * baz)) - 1) * bax;
    return Math.max(slab, out, -dome(x, y, z) - 0.003);
  };
  brim.box = [-bax, by0 - tilt * (boz + baz - bz0) - curve * bax * bax - 0.01, bz0 - 0.1, bax, by0 + 0.03, boz + baz];

  // a hand, loosely closed as a runner carries it: a palm, the knuckles, the
  // fingers curled and tucked under, the thumb along the first finger; in its
  // own frame, the forearm it grows from read off the body
  const hand = (sx) => {
    const ts = -sx, t = D.upper + D.fore;
    const W = [sx * D.shoulderX + sx * sa * t, SY - ca * t, D.shoulderZ];
    const fore = arms[(sx + 1) / 2].fore;
    const wrist = (x, y, z) => fore(W[0] + sx * ca * y + sx * sa * z, W[1] + sa * y - ca * z, W[2] - sx * x);
    wrist.box = [-0.04, -0.04, -D.fore, 0.04, 0.04, 0.03];
    return sculpt([
      [sdEll([0, 0, 0.042], [0.038, 0.017, 0.046]), 0], // palm
      [wrist, 0.02],
      [sdEll([0.022 * ts, -0.009, 0.03], [0.017, 0.015, 0.028]), 0.015], // the thumb's heel
      [sdCone([-0.031 * ts, 0.006, 0.08], [0.027 * ts, 0.008, 0.086], 0.012, 0.013), 0.015], // knuckles
      [sdCone([-0.03 * ts, -0.012, 0.087], [0.026 * ts, -0.013, 0.093], 0.0155, 0.0165), 0.01], // the fingers, curled
      [sdCone([-0.027 * ts, -0.029, 0.072], [0.024 * ts, -0.03, 0.078], 0.0115, 0.012), 0.01], // …and tucked under
      [sdCone([0.03 * ts, -0.012, 0.033], [0.024 * ts, -0.028, 0.068], 0.0115, 0.009), 0.008], // thumb
    ]);
  };

  // a running shoe: a midsole flat between the rocker's arcs (SHOE2), its toe
  // sprung, under an upper built on a last, open at the collar
  const shoe = (sx) => {
    const { heel, rHeel, toe, rToe } = SHOE2, sole = -D.ankle;
    const under = (z) => (z < heel ? sole + rHeel - Math.sqrt(Math.max(0, rHeel * rHeel - (z - heel) ** 2))
      : z > toe ? sole + rToe - Math.sqrt(Math.max(0, rToe * rToe - (z - toe) ** 2)) : sole);
    const over = (z) => under(z) + lerp(FIGURE.sole[1], FIGURE.sole[2], ramp(-0.02, 0.12, z));
    const disc = (x, z, cx, cz, r) => Math.sqrt((x - cx) ** 2 + (z - cz) ** 2) - r;
    const outline = (x, z) => sminK(sminK(disc(x, z, 0, -0.035, 0.038), disc(x, z, -sx * 0.004, 0.115, 0.052), 0.07), disc(x, z, -sx * 0.009, 0.178, 0.036), 0.05);
    const midsole = (x, y, z) => Math.max(outline(x, z) - 0.002, under(z) - y, y - over(z));
    midsole.box = [-0.06, sole - 0.002, -0.08, 0.06, sole + 0.045, 0.22];
    const last = sculpt([
      [sdEll([0, -0.056, -0.028], [0.036, 0.036, 0.04]), 0], // heel
      [sdEll([0, -0.045, 0.045], [0.04, 0.043, 0.065]), 0.03], // instep
      [sdEll([-sx * 0.003, -0.072, 0.12], [0.046, 0.028, 0.058]), 0.03], // ball
      [sdEll([-sx * 0.006, -0.077, 0.172], [0.034, 0.02, 0.036]), 0.025], // toe box
      [sdCone([0, -0.06, -0.058], [0, 0.006, -0.05], 0.011, 0.01), 0.012], // heel tab
    ]);
    const upper = (x, y, z) => Math.max(last(x, y, z), over(z) - 0.004 - y);
    upper.box = last.box;
    return sculpt([[midsole, 0], [upper, 0.005], [sdEll([0, 0.012, -0.006], [0.031, 0.05, 0.037]), -0.008]]);
  };

  // everything he is, at rest, in his own frame: what shuts a point in
  const all = (x, y, z) => {
    let d = body(x, y, z);
    const hx = x - HP[0], hy = y - HP[1], hz = z - HP[2];
    for (const f of [top, brim]) if (!beyond(f.box, hx, hy, hz, d)) d = Math.min(d, f(hx, hy, hz));
    return d;
  };
  return { HP, body, groups, legs, arms, top, brim, hand, shoe, all, hemShorts };
}

// The skin's bones, in the order the skeleton holds them: the trunk, then each
// leg's, then each arm's (see buildFigure).
const NB = 23, LEG_BONE = 5, ARM_BONE = 15;

/** Along a chain of [at, bone] knots (ascending): all `bone` at its knot,
 *  shared smoothly between neighbours between theirs, scaled by `own`. */
function chain(w, o, v, own, knots) {
  const n = knots.length;
  if (v <= knots[0][0]) { w[o + knots[0][1]] += own; return; }
  if (v >= knots[n - 1][0]) { w[o + knots[n - 1][1]] += own; return; }
  let i = 0;
  while (v > knots[i + 1][0]) i++;
  const t = smoothstep((v - knots[i][0]) / (knots[i + 1][0] - knots[i][0]));
  w[o + knots[i][1]] += own * (1 - t);
  w[o + knots[i + 1][1]] += own * t;
}

/**
 * The body's skin: whose it is (the torso, a leg or an arm, by which of their
 * masses it is nearest), its weights down that chain of bones, smoothed over
 * the mesh and kept to the four strongest; and its `aFig`.
 */
async function skinBody(F, D, { pos, nor, idx }) {
  const n = pos.length / 3, HY = D.hipY, SY = HY + D.shoulderY;
  const sa = Math.sin(FIG2.armRest), ca = Math.cos(FIG2.armRest);
  let W = new Float32Array(n * NB), T = new Float32Array(n * NB);
  const fig = new Float32Array(n * 4), armOwn = new Float32Array(n * 2), armT = new Float32Array(n * 2);
  const gd = new Float64Array(5), own = new Float64Array(5), tw = new Float64Array(NB), shares = new Float64Array(4);
  // the trunk: pelvis, a helper half way up the spine, the chest, a helper in
  // the neck, the head; a leg: the pelvis, the hip's helper, thigh, knee's
  // helper, shin, foot (by the drop from the hip); an arm: the chest, the
  // shoulder's helper, upper arm, elbow's helper, forearm (along the arm)
  const TRUNK = [[1.0, 0], [1.1, 1], [1.2, 2], [1.455, 2], [1.505, 3], [1.538, 4]];
  const LEG = [[-0.05, 0], [0.035, 1], [0.13, 2], [0.405, 2], [0.45, 3], [0.495, 4], [0.83, 4], [0.87, 5]];
  const ARM = [[-0.03, 0], [0.035, 1], [0.1, 2], [0.255, 2], [0.29, 3], [0.325, 4]];
  // the neck's opening, a scoop in front and a shallow one behind, open
  // straight up; the armholes round the shoulders, cut straight through from
  // front to back so each strap runs unbroken over its shoulder
  const neckHole = (x, y, z) => {
    const dy = Math.min(0, y - 1.47) / lerp(0.025, 0.065, ramp(-0.03, 0.04, z));
    return (Math.sqrt((x / 0.085) ** 2 + dy * dy) - 1) * 0.085;
  };
  const armHole = (x, y) => (Math.sqrt(((Math.abs(x) - 0.22) / 0.095) ** 2 + ((y - 1.43) / 0.17) ** 2) - 1) * 0.095;
  // and below the shoulder the singlet stays on the trunk: the arms are out
  // from it there, and an arm is never the singlet's
  const sides = (x, y) => 0.2 - Math.abs(x) + Math.max(0, y - 1.3) * 10;
  // (a block of vertices at a time, the turn of the page between blocks: a loop holding an await is not compiled
  // like one without, so the awaits stay out of the loops that do the work)
  for (let v0 = 0; v0 < n; v0 += 256) {
    await pace();
    for (let v = v0, end = Math.min(n, v0 + 256); v < end; v++) {
      const x = pos[3 * v], y = pos[3 * v + 1], z = pos[3 * v + 2];
      let dmin = Infinity, sum = 0;
      for (let g = 0; g < 5; g++) dmin = Math.min(dmin, (gd[g] = F.groups[g](x, y, z)));
      for (let g = 0; g < 5; g++) sum += (own[g] = Math.exp(-(gd[g] - dmin) / 0.012));
      for (let g = 0; g < 5; g++) own[g] /= sum;
      const w = v * NB;
      // the trunk, with the hips' and the shoulders' helpers taking a share
      // near their joints
      tw.fill(0);
      chain(tw, 0, y, 1, TRUNK);
      let shared = 0;
      for (let i = 0; i < 2; i++) {
        const sx = i ? 1 : -1, side = ramp(-0.02, 0.03, sx * x);
        shares[2 * i] = 0.5 * (1 - ramp(0.07, 0.2, Math.hypot(x - sx * D.hipX, y - HY, z))) * side;
        shares[2 * i + 1] = 0.5 * (1 - ramp(0.05, 0.13, Math.hypot(x - sx * D.shoulderX, y - SY, z - D.shoulderZ))) * side;
        shared += shares[2 * i] + shares[2 * i + 1];
      }
      for (let b = 0; b < NB; b++) tw[b] *= 1 - shared;
      for (let i = 0; i < 2; i++) {
        tw[LEG_BONE + 5 * i] += shares[2 * i];
        tw[ARM_BONE + 4 * i] += shares[2 * i + 1];
      }
      for (let b = 0; b < NB; b++) W[w + b] += own[0] * tw[b];
      // the legs and the arms down their chains; their first knot is the trunk's
      for (let i = 0; i < 2; i++) {
        const sx = i ? 1 : -1;
        tw.fill(0);
        chain(tw, 0, HY - y, 1, LEG);
        W[w] += own[1 + i] * tw[0];
        for (let k = 1; k < 6; k++) W[w + LEG_BONE + 5 * i + k - 1] += own[1 + i] * tw[k];
        const t = (x - sx * D.shoulderX) * sx * sa - (y - SY) * ca;
        tw.fill(0);
        chain(tw, 0, t, 1, ARM);
        W[w + 2] += own[3 + i] * tw[0];
        for (let k = 1; k < 5; k++) W[w + ARM_BONE + 4 * i + k - 1] += own[3 + i] * tw[k];
        armOwn[2 * v + i] = own[3 + i];
        armT[2 * v + i] = t;
      }
      // the cloth: the singlet over the trunk under its hem, round its neck and
      // its armholes; the shorts up to the waistband and down each thigh to the
      // hem; the sock up from the shoe, higher at the heel
      const sing = Math.min(y - FIG2.hem, neckHole(x, y, z), armHole(x, y), sides(x, y), 0.05 * (0.5 - own[3] - own[4]));
      let shorts = own[0] * (FIG2.shorts[2] - y) - 0.05 * (own[3] + own[4]), sock = -0.05 * (1 - own[1] - own[2]);
      for (let i = 0; i < 2; i++) {
        const sx = i ? 1 : -1;
        shorts += own[1 + i] * (y - F.hemShorts(Math.atan2(z, sx * (x - sx * D.hipX))));
        sock += own[1 + i] * (FIG2.sock[0] + FIG2.sock[1] * ramp(-0.005, -0.03, z) - y);
      }
      fig[4 * v + 1] = sing;
      fig[4 * v + 2] = shorts;
      fig[4 * v + 3] = sock;
    }
  }
  // smooth the weights over the mesh, so no joint has a seam
  const { deg, nb } = neighbours(idx, n);
  for (let pass = 0; pass < 3; pass++) {
    for (let v0 = 0; v0 < n; v0 += 1024) {
      await pace();
      for (let v = v0, end = Math.min(n, v0 + 1024); v < end; v++) {
        const k = deg[v + 1] - deg[v];
        for (let b = 0; b < NB; b++) {
          let s = 0;
          for (let j = deg[v]; j < deg[v + 1]; j++) s += W[nb[j] * NB + b];
          T[v * NB + b] = k ? 0.5 * W[v * NB + b] + (0.5 * s) / k : W[v * NB + b];
        }
      }
    }
    [W, T] = [T, W];
  }
  // the four strongest
  const index = new Uint16Array(n * 4), weight = new Float32Array(n * 4);
  for (let v0 = 0; v0 < n; v0 += 1024) {
    await pace();
    for (let v = v0, end = Math.min(n, v0 + 1024); v < end; v++) {
      let total = 0;
      for (let s = 0; s < 4; s++) {
        let best = 0, bw = -1;
        for (let b = 0; b < NB; b++) {
          const q = W[v * NB + b];
          if (q > bw && (s < 1 || index[4 * v] !== b) && (s < 2 || index[4 * v + 1] !== b) && (s < 3 || index[4 * v + 2] !== b)) { bw = q; best = b; }
        }
        index[4 * v + s] = best;
        weight[4 * v + s] = Math.max(0, bw);
        total += Math.max(0, bw);
      }
      for (let s = 0; s < 4; s++) weight[4 * v + s] /= total || 1;
    }
  }
  await occlusion(fig, pos, nor, F.all, 0, 0, 0);
  return { index, weight, fig, armOwn, armT };
}

/** Each vertex's neighbours across the mesh's edges (rows `deg`, in `nb`). */
function neighbours(idx, n) {
  const deg = new Int32Array(n + 1);
  for (let i = 0; i < idx.length; i++) deg[idx[i] + 1] += 2;
  for (let v = 0; v < n; v++) deg[v + 1] += deg[v];
  const nb = new Int32Array(deg[n]), fill = deg.slice(0, n);
  for (let i = 0; i < idx.length; i += 3) {
    for (let e = 0; e < 3; e++) {
      const a = idx[i + e], b = idx[i + ((e + 1) % 3)];
      nb[fill[a]++] = b;
      nb[fill[b]++] = a;
    }
  }
  return { deg, nb };
}

/** The normals a painter sees from across the field: a mesh's own (drawn out
 *  at `h`), averaged over their neighbours until the forms smaller than about
 *  `r` metres are gone and only the masses are left. */
async function softNormals(nor, idx, h, r = 0.035) {
  const n = nor.length / 3, { deg, nb } = neighbours(idx, n);
  let A = Float32Array.from(nor), B = new Float32Array(nor.length);
  for (let pass = clamp(Math.round((r / h) ** 2), 4, 60); pass > 0; pass--) {
    await pace();
    for (let v = 0; v < n; v++) {
      let x = A[3 * v], y = A[3 * v + 1], z = A[3 * v + 2];
      for (let j = deg[v]; j < deg[v + 1]; j++) {
        const u = nb[j];
        x += A[3 * u];
        y += A[3 * u + 1];
        z += A[3 * u + 2];
      }
      const l = Math.hypot(x, y, z) || 1;
      B[3 * v] = x / l;
      B[3 * v + 1] = y / l;
      B[3 * v + 2] = z / l;
    }
    [A, B] = [B, A];
  }
  return A;
}

/** How shut in each vertex is (into fig[4v]): how far the figure crowds the
 *  open air a little way out along its normal. (o: the piece's frame in the
 *  field's.) */
async function occlusion(fig, pos, nor, f, ox, oy, oz) {
  const n = pos.length / 3;
  for (let v0 = 0; v0 < n; v0 += 256) {
    await pace();
    for (let v = v0, end = Math.min(n, v0 + 256); v < end; v++) {
      let a = 0;
      for (const [s, w] of [[0.012, 0.5], [0.035, 0.3], [0.07, 0.2]]) {
        const d = f(pos[3 * v] + ox + nor[3 * v] * s, pos[3 * v + 1] + oy + nor[3 * v + 1] * s, pos[3 * v + 2] + oz + nor[3 * v + 2] * s);
        a += (w * Math.max(0, s - d)) / s;
      }
      fig[4 * v] = clamp(a, 0, 1);
    }
  }
}

/**
 * Sculpt the figure and hang it on the rig: the body skinned to bones riding
 * the rig's own groups, the finer pieces on the groups and bones they move
 * with. Returns `pose`, which turns the bones to the joints `update` has just
 * solved.
 */
async function buildFigure(D, rig, mats) {
  const { root, pelvis, waist, head, legs, arms } = rig;
  const F = figureFields(D);
  const sa = Math.sin(FIG2.armRest), ca = Math.cos(FIG2.armRest);
  const geometry = ({ pos, nor, idx }, fig, soft) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('aSoft', new THREE.BufferAttribute(soft, 3));
    g.setAttribute('aFig', new THREE.BufferAttribute(fig, 4));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    return g;
  };
  const piece = async (field, box, h, name, mat, ao, o = [0, 0, 0]) => {
    const net = await nets(field, box, h);
    const fig = new Float32Array((net.pos.length / 3) * 4).fill(-1);
    await occlusion(fig, net.pos, net.nor, ao, ...o);
    const m = new THREE.Mesh(geometry(net, fig, await softNormals(net.nor, net.idx, h)), mat);
    m.name = name;
    m.frustumCulled = false;
    return m;
  };

  // the rig at rest, as he was sculpted, and its bones
  pelvis.position.set(0, D.hipY, 0);
  pelvis.rotation.set(0, 0, 0);
  waist.position.set(0, D.waistY, 0);
  waist.rotation.set(0, 0, 0);
  head.rotation.set(0, 0, 0);
  const bones = [];
  const bone = (parent, x = 0, y = 0, z = 0) => {
    const b = new THREE.Bone();
    b.position.set(x, y, z);
    parent.add(b);
    bones.push(b);
    return b;
  };
  const B = {
    pelvis: bone(pelvis), spine: bone(pelvis, 0, D.waistY, 0), waist: bone(waist),
    neck: bone(waist, head.position.x, head.position.y, head.position.z), head: bone(head),
  };
  for (const leg of legs) {
    leg.foot.position.set(leg.hip.x, -D.thigh - D.shin, 0);
    leg.foot.quaternion.identity();
    leg.bones = {
      hip: bone(pelvis, leg.hip.x), thigh: bone(pelvis, leg.hip.x),
      knee: bone(pelvis, leg.hip.x, -D.thigh), shin: bone(pelvis, leg.hip.x, -D.thigh), foot: bone(leg.foot),
    };
  }
  for (const arm of arms) {
    const u0 = new THREE.Vector3(arm.sx * sa, -ca, 0), n0 = new THREE.Vector3(ca, arm.sx * sa, 0);
    const e = arm.shoulder.clone().addScaledVector(u0, D.upper);
    arm.bones = {
      sh: bone(waist, ...arm.shoulder.toArray()), upper: bone(waist, ...arm.shoulder.toArray()),
      elbow: bone(waist, e.x, e.y, e.z), fore: bone(waist, e.x, e.y, e.z),
      rest: new THREE.Matrix4().makeBasis(n0, u0, new THREE.Vector3().crossVectors(n0, u0)).transpose(),
    };
  }

  // the body, skinned
  const net = await nets(F.body, [-0.48, 0.035, -0.15, 0.48, 1.6, 0.13], FIG2.cell.body);
  const skin = await skinBody(F, D, net);
  const soft = await softNormals(net.nor, net.idx, FIG2.cell.body, FIG2.soft);
  const bodyGeo = geometry(net, skin.fig, soft);
  bodyGeo.setAttribute('skinIndex', new THREE.BufferAttribute(skin.index, 4));
  bodyGeo.setAttribute('skinWeight', new THREE.BufferAttribute(skin.weight, 4));
  const body = new THREE.SkinnedMesh(bodyGeo, mats.body);
  body.name = 'body';
  body.frustumCulled = false;
  root.add(body);
  const skinned = [body];

  // his right arm's sleeve of ink: a shell a hair proud of the arm from the
  // top of the shoulder to the wrist, skinned and lit with it, its uv along
  // the arm (0 at the shoulder's joint, 1 at the wrist) and round it, folded
  // so the round has no seam
  if (mats.tattoo) {
    const keep = new Int32Array(net.pos.length / 3).fill(-1);
    const P = [], N = [], NS = [], UV = [], SI = [], SW = [], FG = [], I = [];
    const S = arms[0].shoulder.clone().add(new THREE.Vector3(0, D.hipY + D.waistY, 0));
    const wrist = FIG2.wrist[0] - 0.012;
    for (let v = 0; v < keep.length; v++) {
      const t = skin.armT[2 * v];
      if (skin.armOwn[2 * v] < 0.5 || t < -0.03 || t > wrist) continue;
      keep[v] = P.length / 3;
      for (let a = 0; a < 3; a++) {
        P.push(net.pos[3 * v + a] + net.nor[3 * v + a] * 0.0016);
        N.push(net.nor[3 * v + a]);
        NS.push(soft[3 * v + a]);
      }
      // round the arm, from its outer side (0) to its inner (1)
      const rx = net.pos[3 * v] - (S.x - sa * t), ry = net.pos[3 * v + 1] - (S.y - ca * t);
      const out = -ca * rx + sa * ry, fwd = net.pos[3 * v + 2] - S.z;
      UV.push(t / wrist, Math.abs(Math.atan2(fwd, out)) / Math.PI);
      for (let a = 0; a < 4; a++) {
        SI.push(skin.index[4 * v + a]);
        SW.push(skin.weight[4 * v + a]);
        FG.push(skin.fig[4 * v + a]);
      }
    }
    for (let i = 0; i < net.idx.length; i += 3) {
      const a = keep[net.idx[i]], b = keep[net.idx[i + 1]], c = keep[net.idx[i + 2]];
      if (a >= 0 && b >= 0 && c >= 0) I.push(a, b, c);
    }
    const g = geometry({ pos: new Float32Array(P), nor: new Float32Array(N), idx: new Uint32Array(I) }, new Float32Array(FG), new Float32Array(NS));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(UV), 2));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(SI), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(SW), 4));
    const sleeve = new THREE.SkinnedMesh(g, mats.tattoo);
    sleeve.name = 'sleeve';
    sleeve.frustumCulled = false;
    root.add(sleeve);
    skinned.push(sleeve);
  }

  // the head and all it wears ride the head: one surface, each vertex told
  // how much it is the beard's, the hair's and the cap's (aFig y, z, w: how
  // much nearer that part is than any other, in metres); the brim a plate of
  // its own, all cap. The hands ride their forearms, the shoes their feet.
  const HP = F.HP;
  const top = await piece(F.top, [-0.1, 0.004, -0.125, 0.1, 0.305, 0.14], FIG2.cell.head, 'head', mats.head, F.all, HP);
  const tp = top.geometry.attributes.position.array, tf = top.geometry.attributes.aFig.array, worn = F.top.worn;
  for (let v0 = 0; v0 < tp.length / 3; v0 += 512) {
    await pace();
    for (let v = v0, end = Math.min(tp.length / 3, v0 + 512); v < end; v++) {
      F.top(tp[3 * v], tp[3 * v + 1], tp[3 * v + 2]);
      for (let p = 1; p < 4; p++) {
        let other = Infinity;
        for (let q = 0; q < 4; q++) if (q !== p) other = Math.min(other, worn[q]);
        tf[4 * v + p] = other - worn[p];
      }
    }
  }
  head.add(top);
  const brim = await piece(F.brim, [-0.09, 0.165, -0.005, 0.09, 0.228, 0.175], FIG2.cell.brim, 'brim', mats.head, F.all, HP);
  const bf = brim.geometry.attributes.aFig.array;
  for (let i = 3; i < bf.length; i += 4) bf[i] = 1;
  head.add(brim);
  const across = new THREE.Vector3(), out = new THREE.Vector3(), along = new THREE.Vector3();
  for (const arm of arms) {
    const field = F.hand(arm.sx);
    const m = await piece(field, [-0.055, -0.05, -0.026, 0.055, 0.035, 0.115], FIG2.cell.hand, 'hand', mats.hand, field);
    along.set(arm.sx * sa, -ca, 0);
    m.position.copy(along).multiplyScalar(D.fore);
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(across.set(0, 0, -arm.sx), out.set(arm.sx * ca, sa, 0), along));
    arm.bones.fore.add(m);
  }
  for (const leg of legs) {
    const field = F.shoe(leg.sx);
    leg.foot.add(await piece(field, [-0.065, -0.105, -0.085, 0.065, 0.02, 0.225], FIG2.cell.shoe, 'shoe', mats.shoe, field));
  }

  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  for (const m of skinned) m.bind(skeleton);
  // the pose a style may draw the cloth by: the torso's twist over the hips,
  // each thigh's swing forward (his right, his left; rad) and the stride's phase
  root.userData.pose = new THREE.Vector4();

  const QI = new THREE.Quaternion();
  const REST_LEG = new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1)).transpose();
  const vY = new THREE.Vector3(), vZ = new THREE.Vector3(), mF = new THREE.Matrix4();
  // a limb's turn from rest: its frame (the bend's axis, the limb, their
  // cross) against the same frame as it was sculpted
  const frame = (n, limb, rest, q) => {
    vZ.crossVectors(n, limb);
    q.setFromRotationMatrix(mF.makeBasis(n, limb, vZ).multiply(rest));
  };
  const swing = (leg) => {
    vY.subVectors(leg.knee, leg.hip);
    return Math.atan2(vY.z, -vY.y);
  };
  function pose(breath, phase) {
    B.spine.position.copy(waist.position);
    B.spine.quaternion.slerpQuaternions(QI, waist.quaternion, 0.5);
    B.waist.scale.set(1 + 1.2 * breath, 1 + 0.25 * breath, 1 + 1.6 * breath);
    B.neck.quaternion.slerpQuaternions(QI, head.quaternion, 0.5);
    for (const leg of legs) {
      const b = leg.bones;
      frame(leg.n, vY.subVectors(leg.knee, leg.hip).normalize(), REST_LEG, b.thigh.quaternion);
      frame(leg.n, vY.subVectors(leg.ankle, leg.knee).normalize(), REST_LEG, b.shin.quaternion);
      b.hip.quaternion.slerpQuaternions(QI, b.thigh.quaternion, 0.5);
      b.knee.position.copy(leg.knee);
      b.shin.position.copy(leg.knee);
      b.knee.quaternion.slerpQuaternions(b.thigh.quaternion, b.shin.quaternion, 0.5);
    }
    for (const arm of arms) {
      const b = arm.bones;
      frame(arm.n, vY.subVectors(arm.elbow, arm.shoulder).normalize(), b.rest, b.upper.quaternion);
      frame(arm.n, vY.subVectors(arm.target, arm.elbow).normalize(), b.rest, b.fore.quaternion);
      b.sh.quaternion.slerpQuaternions(QI, b.upper.quaternion, 0.5);
      b.elbow.position.copy(arm.elbow);
      b.fore.position.copy(arm.elbow);
      b.elbow.quaternion.slerpQuaternions(b.upper.quaternion, b.fore.quaternion, 0.5);
    }
    root.userData.pose.set(waist.rotation.y, swing(legs[0]), swing(legs[1]), phase);
  }
  return { pose };
}

/* ---------------------------------------------------------------- runner --- */

/**
 * The runner: one faceless figure with a procedural gait. The cycle runs at a
 * runner's cadence and the stride follows from the ground speed; the feet are
 * pinned to the ground through a rolling shoe, so a planted foot never slides,
 * and the pelvis dips rather than ask a leg for more reach than it has. Idle →
 * walk → run blends continuously; a jump winds up, tucks knees and arms at the
 * apex, then lands in a squash that recovers into the stride. It wades, then swims.
 * @param {object} materials
 * @param {object|null} features Generated week; its run cadence can drive the gait.
 * @returns {Promise<object>} Runner object, deterministic update hook, phase, stride and debug state.
 */
export async function createRunner(materials = {}, features = null) {
  // runner.look: 0 the figure as he was, 1 the drawn figure, 2 the sculpted
  // figure (read once, here)
  const look = P['runner.look'] > 1 ? 2 : P['runner.look'] > 0 ? 1 : 0;
  const drawn = look > 0;
  const D = look === 2 ? D2 : look ? D1 : D0;
  const SHOE = look === 2 ? SHOE2 : look ? SHOE1 : SHOE0;
  const body = materials.body || new THREE.MeshLambertMaterial({ color: 0xdcdfe4 });
  const accent = materials.accent || new THREE.MeshLambertMaterial({ color: 0x6e7a8c });
  const hair = materials.hair || body; // the hair, when a style tints it
  const beardMat = materials.beard || hair; // …and the beard, which may be a shade apart

  let cadenceTotal = 0, cadenceWeight = 0;
  if (Array.isArray(features?.list)) {
    for (const feature of features.list) {
      if (feature?.kind === 'monument') continue; // a race activity also has its ordinary running feature
      const stats = feature?.stats;
      const cadence = Number(stats?.avgCadence);
      if (String(stats?.sport || '').toLowerCase() !== 'running' || !Number.isFinite(cadence) || cadence <= 0) continue;
      const active = Number(stats.activeS);
      const weight = Number.isFinite(active) && active > 0 ? active : 1;
      cadenceTotal += cadence * weight;
      cadenceWeight += weight;
    }
  }
  const weekCadence = cadenceWeight ? cadenceTotal / cadenceWeight : null; // steps/min; runs are already doubled at import
  const dataCadence = weekCadence == null ? null : clamp(weekCadence / 120, 0.75, 2.2); // full stride cycles/s
  const dataBob = weekCadence == null ? 1 : clamp(weekCadence / 170, 0.88, 1.12);

  const root = new THREE.Group();
  root.name = 'runner';
  if (drawn) root.userData.drawn = look; // a style paints a drawn figure by its pieces' names
  const pelvis = new THREE.Group();
  pelvis.position.y = D.hipY;
  root.add(pelvis);
  const waist = new THREE.Group();
  waist.position.y = D.waistY;
  pelvis.add(waist);

  // Torso + pelvis: one lathe from the crotch to the neck — narrowest at the
  // waist, widest across the back.
  let torso = null;
  if (look < 2) {
    const prof = look ? TORSO1 : TORSO;
    torso = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), look ? 32 : 22), body);
    widen(torso.geometry, prof);
    torso.position.y = -D.waistY;
    if (look) torso.name = 'torso';
    waist.add(torso);
  }

  // Faceless head: a bare skull under a dark cap, the hair cut short — only a
  // sliver shows under the band above each ear, and the nape is bare — and a
  // long full beard off the jaw that bushes out below the ears. Hair, beard and
  // cap in their own materials; all of it silhouette.
  const head = new THREE.Group();
  head.position.set(0, D.neckY - D.waistY, 0.008);
  if (look === 1) head.scale.setScalar(D.head);
  waist.add(head);
  if (look < 2) {
    const skull = ball(D.headR, ...(look ? HEAD1.skull : [0.8, 1.1, 0.95]), [0, D.headY, -0.004], body);
    skull.name = 'skull';
    head.add(skull);
    for (const s of [-1, 1]) {
      const sliver = ball(0.028, 0.5, 0.8, 1.1, [s * 0.088, D.headY + 0.018, -0.004], hair);
      sliver.name = 'hair';
      head.add(sliver);
    }
    if (look) {
      // the drawn head: ears under the band, flared back off the skull, the
      // short hair round the back under the cap, and a nose
      const { ear, nape, nose } = HEAD1;
      for (const s of [-1, 1]) {
        const e = ball(ear.r, ...ear.s, [s * ear.at[0], ear.at[1], ear.at[2]], accent, ear.tilt, -s * ear.flare);
        e.name = 'ear';
        head.add(e);
      }
      const g = new THREE.SphereGeometry(D.headR, 28, 4, nape.phi[0], nape.phi[1], nape.theta[0], nape.theta[1]);
      g.scale(...nape.s).translate(0, D.headY, -0.004);
      const band = new THREE.Mesh(g, hair);
      band.name = 'hair';
      band.frustumCulled = false;
      head.add(band);
      const n = ball(nose[0], nose[1], nose[2], nose[3], nose[4], body, -0.35);
      n.name = 'face';
      head.add(n);
    }
    // The beard and the cap hang from their own groups, so a style that repaints
    // the head's own pieces by kind leaves them the colours they were given.
    const jaw = new THREE.Group();
    head.add(jaw);
    const B = look ? BEARD1 : BEARD;
    const beard = staticTube(B.chain, B.rad, [beardMat], 0.05, 18);
    beard.geometry.scale(B.wide, 1, 1);
    beard.name = 'beard';
    jaw.add(beard);
    for (const s of [-1, 1]) {
      const tuft = staticTube(B.tuft.chain.map(([x, y, z]) => [s * x, y, z]), B.tuft.rad, [beardMat], 0.04, 14);
      tuft.name = 'beard';
      jaw.add(tuft);
    }
    // The cap: a crown a little proud of the skull, sitting back so its band runs
    // low over the back of the head, and a short brim over the brow.
    const crown = new THREE.Group();
    head.add(crown);
    const dome = new THREE.SphereGeometry(1, look ? 36 : 20, look ? 12 : 8, 0, TAU, 0, Math.PI / 2);
    dome.scale(0.106, 0.125, 0.128).rotateX(-0.25).translate(0, D.headY + 0.035, -0.01);
    const brim = new THREE.CylinderGeometry(1, 1, 1, look ? 36 : 20);
    brim.scale(0.095, 0.012, 0.085).rotateX(0.2).translate(0, D.headY + 0.07, 0.115);
    for (const g of [dome, brim]) {
      const m = new THREE.Mesh(g, materials.cap || accent);
      m.name = 'cap';
      m.frustumCulled = false;
      crown.add(m);
    }
  }

  const legs = [];
  const arms = [];
  const restX = [0.086, 0.089]; // standing: feet under the hips
  const restZ = [-0.02, 0.02]; // …and the soles straddling the root
  // the drawn figure's shorts: the rings bunched at the hem so it is a step,
  // and the last few stood off the thigh
  const { arm: A1, leg: L1 } = LIMB1;
  let legOpts = null;
  if (look === 1) {
    const n = L1.rings - 2 * CAP;
    const at = new Float32Array(n).map((_, k) => k / (n - 1));
    at[L1.split - CAP - 1] = at[L1.split - CAP] - LIMB1.hem / L1.length;
    const bump = new Float32Array(L1.rings);
    LIMB1.flare.forEach((r, k) => { bump[L1.split - LIMB1.flare.length + k] = r; });
    legOpts = { radial: L1.radial, length: L1.length, at, bump, flat: true, tag: 2 };
  }
  for (let i = 0; i < 2; i++) {
    const sx = i ? 1 : -1;
    if (look === 2) {
      // the sculpted figure's limbs are joints alone: buildFigure skins them
      const foot = new THREE.Group();
      pelvis.add(foot);
      legs.push({
        sx, i, hip: new THREE.Vector3(D.hipX * sx, 0, 0), foot, tube: null,
        ankle: new THREE.Vector3(), knee: new THREE.Vector3(), n: new THREE.Vector3(), roll: 0, py: 0, toe: 0,
      });
      arms.push({
        sx, shoulder: new THREE.Vector3(D.shoulderX * sx, D.shoulderY - D.waistY, D.shoulderZ), tube: null,
        elbow: new THREE.Vector3(), target: new THREE.Vector3(), n: new THREE.Vector3(),
      });
      continue;
    }
    // Leg: hip cap (inside the pelvis) → hip → mid-thigh → knee → calf → ankle.
    // Shorts in the body material to the mid thigh, bare leg below.
    const hip = new THREE.Vector3(D.hipX * sx, 0, 0);
    const chain = [
      look ? new THREE.Vector3(D.hipX * sx * L1.cap[0], L1.cap[1], L1.cap[2]) : new THREE.Vector3(D.hipX * sx * 0.84, 0.075, -0.012),
      hip, new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),
    ];
    const tube = createTube(look ? L1.rings : 30, [body, accent], look ? L1.split : 11, legOpts); // shorts to the mid thigh
    if (look) tube.mesh.name = 'leg';
    pelvis.add(tube.mesh);
    const foot = new THREE.Group();
    const shoe = staticTube(SHOE.chain, SHOE.rad, [accent], 0, look ? 22 : 18, look ? { radial: 16 } : null);
    if (look) {
      // a running shoe: drawn out wide on a sole pressed flat underneath
      shoe.name = 'shoe';
      const pos = shoe.geometry.attributes.position, nor = shoe.geometry.attributes.normal;
      for (let v = 0; v < pos.count; v++) {
        // the height over the sole plane is pressed down near it: h → h·s(h/2.5 cm)
        const h = pos.getY(v) + D.ankle, t = clamp(h / 0.025, 0, 1), k = smoothstep(t);
        const dh = Math.max(k + 6 * t * t * (1 - t), 1e-3); // …and the slope of that map, for the normal
        const w = lerp(SHOE.wide[0], SHOE.wide[1], smoothstep(clamp(pos.getZ(v) / 0.1, 0, 1)));
        pos.setXYZ(v, pos.getX(v) * w, -D.ankle + h * k, pos.getZ(v));
        nor.setXYZ(v, nor.getX(v) / w, nor.getY(v) / dh, nor.getZ(v));
      }
      shoe.geometry.normalizeNormals();
    }
    foot.add(shoe);
    pelvis.add(foot);
    legs.push({
      sx, i, hip, tube, foot, chain,
      rad: new Float32Array(look ? L1.rad : [0.09, 0.088, 0.078, 0.062, 0.074, 0.04]),
      ankle: new THREE.Vector3(), knee: new THREE.Vector3(),
      roll: 0, py: 0, toe: 0,
    });

    // Arm: shoulder cap (inside the chest) → shoulder → mid-upper → elbow →
    // forearm → wrist → hand: a heavy deltoid, a bicep, a forearm with a belly.
    // Bare from the shoulder: only the cap, inside the chest, is the top.
    const shoulder = new THREE.Vector3(D.shoulderX * sx, D.shoulderY - D.waistY, D.shoulderZ);
    const achain = [
      new THREE.Vector3(D.shoulderX * sx * 0.55, D.shoulderY - D.waistY - 0.01, 0.004), shoulder,
      new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),
    ];
    const atube = createTube(look ? A1.rings : 28, [body, accent], 1, look ? { radial: A1.radial, length: A1.length, flat: true } : null);
    if (look) atube.mesh.name = 'arm';
    waist.add(atube.mesh);
    // the drawn figure's hand: a palm, the fingers curled under it and a thumb,
    // in a frame set each frame at the wrist (see update)
    let fist = null;
    if (look) {
      fist = new THREE.Group();
      for (const [r, hx, hy, hz, at, rx] of Object.values(HAND1)) {
        const piece = ball(r, hx, hy, hz, [at[0] * -sx, at[1], at[2]], accent, rx);
        piece.name = 'hand';
        fist.add(piece);
      }
      waist.add(fist);
    }
    arms.push({
      sx, shoulder, tube: atube, chain: achain, fist,
      rad: new Float32Array(look ? A1.rad : [0.06, 0.086, 0.076, 0.048, 0.057, 0.035, 0.042]),
      elbow: new THREE.Vector3(), hand: new THREE.Vector3(), target: new THREE.Vector3(),
    });
  }

  // A style may give his right forearm its sleeve of ink: a tube a hair proud
  // of the forearm (its radii follow the forearm's own, as smoothed), rebuilt
  // with it, that the style paints only where the strokes are. Its uv runs
  // along it and round it — folded, so the round has no seam, and the fold
  // lies along the arm's outer and inner sides, not its back.
  const ring = look ? A1.radial : RADIAL0;
  const sleeve = look < 2 && materials.tattoo && {
    tube: createTube(24, [materials.tattoo], 0, look ? { radial: ring, flat: true } : null),
    at: [0.12, 0.3, 0.5, 0.76], // along the forearm, elbow → hand
    chain: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
    rad: new Float32Array(look ? [0.041, 0.0455, 0.0405, 0.0345] : [0.0525, 0.0545, 0.0497, 0.0418]),
  };
  if (sleeve) {
    const uv = new Float32Array(24 * ring * 2);
    for (let i = 0; i < 24 * ring; i++) {
      uv[i * 2] = Math.floor(i / ring) / 23;
      uv[i * 2 + 1] = 1 - Math.abs((2 * ((i + 3) % ring)) / ring - 1);
    }
    sleeve.tube.mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (look) sleeve.tube.mesh.name = 'sleeve';
    waist.add(sleeve.tube.mesh);
  }

  // The drawn figure's contact shadows, if the style paints one: a puddle on
  // the ground under each sole, shrinking and fading as the foot lifts. The
  // style's material reads its fade off the mesh's own scale.
  const contactGeo = drawn && materials.contact ? new THREE.PlaneGeometry(0.22, 0.42).rotateX(-Math.PI / 2) : null;
  const contacts = contactGeo ? legs.map(() => {
    const m = new THREE.Mesh(contactGeo, materials.contact);
    m.name = 'contact';
    m.frustumCulled = false;
    root.add(m);
    return m;
  }) : null;
  // every drawn piece carries `aRunner`; off a limb it is all 0, so a shader
  // reading it never meets an attribute some other program left behind
  if (look === 1) {
    root.traverse((k) => {
      if (k.isMesh && !k.geometry.attributes.aRunner) {
        k.geometry.setAttribute('aRunner', new THREE.BufferAttribute(new Float32Array(k.geometry.attributes.position.count * 3), 3));
      }
    });
  }
  // the sculpted figure, skinned to the rig; until a style paints its pieces
  // by name, all of him is the body's colour but the shoes, the accent's
  const figure = look === 2 ? await buildFigure(D, { root, pelvis, waist, head, legs, arms }, {
    body, head: body, hand: body, shoe: accent, tattoo: materials.tattoo,
  }) : null;

  const airPose = [{ y: 0.56, z: 0.3, roll: 0.62 }, { y: 0.5, z: 0.22, roll: 0.66 }];
  // standing, the drawn figure's arms hang with the elbows a little bent
  const idleHand = look ? { down: -0.52, fwd: 0.07, lat: 0.08 } : { down: -0.585, fwd: 0.02, lat: 0.08 };
  const swing = look ? SWING1 : SWING0;
  const pq = new THREE.Quaternion();
  const qi = new THREE.Quaternion();
  const qRoll = new THREE.Quaternion(), qYaw = new THREE.Quaternion();
  const qSwim = new THREE.Quaternion();
  const vDir = new THREE.Vector3();
  const vHip = new THREE.Vector3();
  const vHand = new THREE.Vector3();
  const vPole = new THREE.Vector3();
  const vSwim = new THREE.Vector3();
  const vContact = new THREE.Vector3();
  const vBack = new THREE.Vector3(), vAcross = new THREE.Vector3(), mHand = new THREE.Matrix4();
  let phase = 0, strideNow = 0, air = 0, idleT = 0, over = 0;
  let swim = 0, stroke = 0, land = 0, wasGrounded = true;
  let staticPose = false, staticSpeed = 0, staticWade = 0, staticGrounded = true;
  let staticSwimming = false, staticAnticipation = 0, staticTuck = 0;

  /** The sculpted figure's arm, swung from the shoulder (ARM2) at swing `s`
   *  (+1 = this hand forward; t the same 0 … 1): the upper arm out from his
   *  side and swung forward or back, the forearm bent up from it and turned in
   *  toward his middle. Sets vHand (the wrist, from the shoulder) and vPole
   *  (toward the elbow), so the IK finds this same elbow. */
  const vU = new THREE.Vector3(), vF = new THREE.Vector3(), vM = new THREE.Vector3(), vW = new THREE.Vector3();
  function swingArm(sx, s, t, move, run) {
    const g = (k, r = run) => lerp(ARM2[k][0], lerp(ARM2[k][1], ARM2[k][2], r), move);
    const bent = 1 - (1 - run) ** ARM2.bend;
    const phi = g('flex') + s * g('swing'), eps = lerp(g('back', bent), g('front', bent), t);
    const psi = g('turn', bent) * lerp(0.4, 1, t), beta = g('out');
    const sb = Math.sin(beta), cb = Math.cos(beta), sp = Math.sin(phi), cf = Math.cos(phi);
    vU.set(sx * sb * cf, -cb * cf, sp);
    vF.set(-sx * sb * sp, cb * sp, cf);
    vM.crossVectors(vU, vF).multiplyScalar(sx);
    vF.multiplyScalar(Math.cos(psi)).addScaledVector(vM, Math.sin(psi));
    vW.copy(vU).multiplyScalar(Math.cos(eps)).addScaledVector(vF, Math.sin(eps));
    vHand.copy(vU).multiplyScalar(D.upper).addScaledVector(vW, D.fore);
    vPole.copy(vU).multiplyScalar(D.upper).addScaledVector(vF, -0.1);
  }

  /** Where the shoe touches the ground once it has rolled to `roll`, in the foot
   *  frame: out.x = z, out.y = y. Past a few degrees it is the toe's or the
   *  heel's cap tangency; below that the whole flat sole is down, and both
   *  branches meet at the same point so the roll never jolts the hip. */
  function contact(roll, out) {
    if (Math.abs(roll) >= SHOE.flat) {
      const r = roll > 0 ? SHOE.rToe : SHOE.rHeel;
      const cz = roll > 0 ? SHOE.toe : SHOE.heel;
      out.set(cz + r * Math.sin(roll), -D.ankle + r - r * Math.cos(roll), 0);
      return out;
    }
    const k = (roll + SHOE.flat) / (2 * SHOE.flat);
    return out.set(
      lerp(SHOE.heel + SHOE.rHeel * Math.sin(roll), SHOE.toe + SHOE.rToe * Math.sin(roll), k),
      -D.ankle,
      0,
    );
  }

  /** Ground contact (x, py, pz) in the root frame → the ankle, through the roll. */
  function ankleFrom(x, py, pz, roll, out) {
    contact(roll, vContact);
    const cy = Math.cos(roll), sy = Math.sin(roll);
    const pyf = vContact.y, pzf = vContact.x;
    out.set(x, py - pyf * cy + pzf * sy, pz - pyf * sy - pzf * cy);
  }

  function update(dt, st = {}) {
    dt = clamp(dt, 0, 1 / 30); // a stalled frame must not teleport the rig
    const speed = Math.max(0, st.speed || 0);
    const move = clamp(speed / 0.55, 0, 1); // idle → on the move
    const run = clamp((speed - 1.1) / Math.max(0.1, P['runner.sprint'] - 1.1), 0, 1); // jog → sprint
    const wade = clamp(st.wade || 0, 0, 1);
    const grounded = st.grounded !== false;
    const anticipation = clamp(st.anticipation || 0, 0, 1);
    const swimmingNow = !!st.swimming;
    const tuckNow = clamp(st.tuck || 0, 0, 1);
    const absoluteT = typeof st.time === 'number' && Number.isFinite(st.time) ? Math.max(0, st.time) : null;
    const livingGait = P['living.gait'] > 0 && dataCadence != null;
    const gaitTime = livingGait && typeof st.gaitTime === 'number' && Number.isFinite(st.gaitTime)
      ? Math.max(0, st.gaitTime)
      : absoluteT;
    const cadence = livingGait
      ? dataCadence
      : lerp(P['runner.cadenceWalk'], P['runner.cadenceRun'], clamp(speed / P['runner.sprint'], 0, 1)) * lerp(1, WADE.cadence, wade);
    const swimRate = lerp(SWIM.rateW, SWIM.rateR, clamp(speed / SWIM.speed, 0, 1));
    if (absoluteT != null) {
      phase = (livingGait || speed > 1e-4) ? (cadence * absoluteT) % 1 : 0;
      idleT = absoluteT;
      air = grounded || swimmingNow ? 0 : 1;
      swim = swimmingNow ? 1 - Math.exp(-SWIM.blend * absoluteT) : 0;
      stroke = (swimRate * absoluteT) % 3;
      land = 0;
    } else if (gaitTime != null) {
      phase = (cadence * gaitTime) % 1;
    }
    const c = phase;
    if (!dt && absoluteT == null && gaitTime == null && staticPose
      && speed === staticSpeed && wade === staticWade && grounded === staticGrounded
      && swimmingNow === staticSwimming && anticipation === staticAnticipation && tuckNow === staticTuck) return;
    staticPose = !dt && absoluteT == null && gaitTime == null;
    staticSpeed = speed;
    staticWade = wade;
    staticGrounded = grounded;
    staticSwimming = swimmingNow;
    staticAnticipation = anticipation;
    staticTuck = tuckNow;
    if (absoluteT == null) {
      if (grounded && !wasGrounded && !swimmingNow) land = 1;
      land = Math.max(0, land - dt * 6);
    }
    wasGrounded = grounded;
    const squash = smoothstep(land);
    const crouch = Math.max(anticipation, squash);
    strideNow = speed / cadence; // what one cycle covers at this speed — the phase follows it
    if (absoluteT == null) {
      if (gaitTime == null && speed > 1e-4) phase = (phase + cadence * dt) % 1;
      idleT += dt;
      air += ((!grounded && !swimmingNow ? 1 : 0) - air) * Math.min(1, dt * 9); // no jumping from deep water
      swim += ((swimmingNow ? 1 : 0) - swim) * Math.min(1, dt * SWIM.blend);
      stroke = (stroke + swimRate * dt) % 3;
    }
    const tuck = grounded ? 0 : air * lerp(0.25, 1, tuckNow);
    const sw = smoothstep(swim);
    // The crawl's clock runs in arm cycles, kept to a whole breathing pattern
    // (three strokes = 1.5 cycles), so it never loses precision.
    const bodyRoll = SWIM.roll * Math.cos(TAU * (stroke - 0.78)); // the shoulders': + = his left one up

    // The stance is whatever fits inside one stride without asking a leg for more
    // travel than it has; at speed that alone gives the flight phase.
    const travel = Math.min(GAIT.travel, strideNow * lerp(GAIT.stanceW, GAIT.stanceR, run));
    const stance = strideNow > 1e-4 ? travel / strideNow : 1; // standing: no stance to speak of
    const half = travel / 2;
    // The body tips forward from the ankles as the speed comes up — the hips ride
    // out over the feet — and the spine adds only a little on top of that.
    const leanA = GAIT.leanA * run * move;
    // The swing barely clears the ground at a walk; only a run picks the foot up,
    // and only a sprint brings the heel to the glute. Wading, every step is a
    // high knee.
    const lift = lerp(lerp(P['runner.liftWalk'], P['runner.liftRun'], look === 2 ? Math.pow(run, GAIT2.lift) : run * run * run), WADE.lift, wade) * move;
    const lean = (0.05 + GAIT.lean * run + WADE.lean * wade) * move + 0.02;
    const bobR = P['runner.bobRun'] * (livingGait ? dataBob : 1);
    const bobA = lerp(P['runner.bobWalk'], bobR, run) * move;
    const breath = 0.01 * Math.sin(idleT * 1.6) * (1 - move);
    const yaw = 0.2 * (0.25 + 0.75 * run) * move * Math.sin(TAU * c); // hips lead the stride, even at a walk
    let roll = 0.045 * run * move * Math.sin(TAU * (c - 0.4)); // the swing hip drops
    // The drawn figure stands at ease (STAND1) and breathes, the chest rising
    // and filling.
    const stand = drawn ? (1 - move) * (1 - sw) * (1 - crouch) * (1 - air) : 0;
    // the sculpted figure shifts his weight now and then as he stands
    const shift = look === 2 ? 0.7 + 0.3 * Math.sin(idleT * GAIT2.shift) : 1;
    const cp = STAND1.tilt * stand * shift;
    if (drawn) roll -= cp;
    // A walk lands heel first and rolls down flat; a run lands midfoot, and the
    // heel only comes up behind on the way through at speed.
    const rollLand = lerp(-GAIT.heelW, 0.02, smoothstep(clamp((run - 0.3) / 0.45, 0, 1)));
    const rollOff = lerp(0.55, 0.62, run);
    const flatFrac = lerp(0.15, 0.5, run);

    // --- the sole's path: planted in the root frame through the whole stance
    // (that is the no-slide contract), lifting on an arc through the swing.
    for (const leg of legs) {
      const cc = (c + (leg.sx > 0 ? 0.5 : 0)) % 1;
      let pz, py, rl;
      if (cc < stance) {
        const u = cc / stance;
        pz = half * (1 - 2 * u);
        py = 0;
        rl = u < flatFrac
          ? lerp(rollLand, 0, smoothstep(u / flatFrac)) // down flat off the heel
          : lerp(0, rollOff, smoothstep((u - flatFrac) / (1 - flatFrac))); // then up onto the toe
      } else {
        const v = (cc - stance) / (1 - stance);
        // heel up, then the knee drives; wading, the lift peaks late and the foot
        // comes through early, brought up under a high knee rather than kicked
        // up behind
        pz = -half + 2 * half * (look === 2 ? smoothstep(clamp((v - GAIT2.lag) / (1 - GAIT2.lag), 0, 1)) : smoothstep(v))
          + 0.16 * wade * Math.sin(Math.PI * v);
        py = lift * Math.sin(Math.PI * Math.pow(v, lerp(look === 2 ? GAIT2.peak : 0.75, 1.5, wade)));
        rl = lerp(rollOff, rollLand, smoothstep(v));
      }
      if (crouch > 0) {
        pz = lerp(pz, restZ[leg.i], crouch);
        py = lerp(py, 0, crouch);
        rl = lerp(rl, 0, crouch);
      }
      if (tuck > 0.001) {
        const t = airPose[leg.i];
        pz = lerp(pz, t.z, tuck);
        py = lerp(py, t.y, tuck);
        rl = lerp(rl, t.roll, tuck);
      }
      const active = Math.max(move, tuck);
      leg.roll = lerp(0, rl, active); // idle stands flat-footed
      leg.py = lerp(0, py, active);
      let fx = leg.sx * lerp(restX[leg.i], 0.092, active), fz = lerp(restZ[leg.i], pz, active);
      if (drawn) {
        leg.toe = leg.sx * STAND1.toes[leg.i] * stand;
        if (leg.i) { fx += leg.sx * STAND1.ease[0] * stand; fz += STAND1.ease[1] * stand; }
      }
      ankleFrom(fx, leg.py, fz, leg.roll, leg.ankle);
      if (contacts) {
        // under the sole, fading (the y scale, which a flat puddle does not
        // otherwise use) and shrinking as the foot lifts, gone in the air or the water
        const k = clamp(1 - leg.py / 0.2, 0, 1) * (1 - air) * (1 - sw) * (1 - wade);
        const m = contacts[leg.i];
        m.visible = k > 0.02;
        m.position.set(leg.ankle.x + 0.07 * Math.sin(leg.toe), 0.01, leg.ankle.z + 0.07 * Math.cos(leg.toe));
        m.rotation.y = leg.toe;
        m.scale.set(lerp(0.55, 1, k), k, lerp(0.55, 1, k));
      }
    }
    // --- pelvis: a walk crouches (bent knees carry a long stance), a run rides
    // high and rises through the flight; the reach guard below pulls it down over
    // whatever the planted leg asks for. Standing, it just breathes.
    const flight = clamp(Math.min(legs[0].py, legs[1].py) / 0.12, 0, 1);
    let hipY = D.hipY - 0.05 * (1 - run) * move + bobA * (flight - 0.45) - 0.15 * crouch;
    // The lean turns about the ankles: the hips swing out over the feet by the
    // lean's own arc, so the soles stay exactly where the stance put them.
    const sinA = Math.sin(leanA), cosA = Math.cos(leanA);
    const sway = drawn ? -STAND1.sway * stand * shift : 0;
    const place = () => pelvis.position.set(
      sway, D.ankle + cosA * (hipY - D.ankle), sinA * (hipY - D.ankle),
    );
    pelvis.rotation.set(lean * 0.6 + leanA + 0.12 * anticipation - 0.06 * squash, yaw, roll);
    pq.setFromEuler(pelvis.rotation);
    qi.copy(pq).invert();
    // Reach guard: a leg must never be asked for more than it has (that is what
    // leaves a planted foot floating) — dip the pelvis by the deficit instead.
    const maxLeg = D.thigh + D.shin - 0.004;
    for (let pass = 0; pass < 4; pass++) {
      place();
      let deficit = 0;
      for (const leg of legs) {
        vHip.copy(leg.hip).applyQuaternion(pq).add(pelvis.position);
        deficit = Math.max(deficit, leg.ankle.distanceTo(vHip) - maxLeg);
      }
      if (deficit <= 0.0002) break;
      hipY -= Math.min(deficit, 0.06);
    }
    place();
    // Swimming, the body goes over onto its front about the chest and rolls on its
    // long axis with the stroke (the pelvis's yaw is that axis once it pitches).
    if (sw > 0) {
      pelvis.position.lerp(vSwim.set(0, SWIM.hipY, SWIM.hipZ), sw);
      pelvis.rotation.set(lerp(pelvis.rotation.x, SWIM.pitch, sw), lerp(yaw, 0.6 * bodyRoll, sw), lerp(roll, 0, sw));
      pq.setFromEuler(pelvis.rotation);
      qi.copy(pq).invert();
    }

    // --- legs: IK from the hip to the planted ankle, in the pelvis frame (knees
    // bend forward, whatever the hips do). Swimming, the feet let go of the
    // ground for a flutter kick: six beats a cycle, the knee giving a little
    // as the foot comes up, the toes pointed back along the shin.
    over = 0;
    for (const leg of legs) {
      leg.ankle.sub(pelvis.position).applyQuaternion(qi);
      const k = Math.sin(TAU * (3 * stroke + (leg.sx > 0 ? 0.5 : 0)));
      if (sw > 0) leg.ankle.lerp(vSwim.set(leg.sx * 0.1, -0.86 + 0.05 * Math.max(0, -k), SWIM.kick * k + 0.08), sw);
      if (solve2(leg.hip, leg.ankle, D.thigh, D.shin, drawn ? vPole.set(Math.sin(0.7 * leg.toe), 0, Math.cos(0.7 * leg.toe)) : AXIS_Z, leg.knee)) over++;
      if (leg.tube) {
        leg.chain[2].lerpVectors(leg.chain[1], leg.knee, 0.5);
        if (look) leg.chain[2].z += LIMB1.leg.thigh; // the front of the thigh
        leg.chain[3].copy(leg.knee);
        leg.chain[4].lerpVectors(leg.knee, leg.ankle, look ? LIMB1.leg.calf[0] : 0.45);
        leg.chain[4].z -= look ? LIMB1.leg.calf[1] : 0.01; // the calf sits behind the shin
        leg.chain[5].copy(leg.ankle);
        leg.tube.build(leg.chain, leg.rad, 0.085);
      } else leg.n.crossVectors(ikDir, ikPole); // the knee's axis, for the skin's bones
      // The foot's *world* orientation is the roll alone: the pelvis's lean and
      // yaw must not tip a planted shoe into the ground.
      leg.foot.position.copy(leg.ankle);
      leg.foot.quaternion.copy(qi);
      if (drawn) leg.foot.quaternion.multiply(qYaw.setFromAxisAngle(AXIS_Y, leg.toe)); // toes turned out, standing
      leg.foot.quaternion.multiply(qRoll.setFromAxisAngle(AXIS_X, leg.roll));
      if (sw > 0) {
        vDir.subVectors(leg.ankle, leg.knee);
        leg.foot.quaternion.slerp(qSwim.setFromAxisAngle(AXIS_X, Math.atan2(-vDir.y, vDir.z) + 0.15), sw);
      }
    }

    // --- torso: the shoulders swing against the hips (a walk as much as a run),
    // and the head rides level — the lean is taken out of the neck, so the figure
    // turns and tips at the waist rather than at the chin. Standing, he looks
    // slowly about him, so the beard shows in profile past his shoulder.
    // Swimming, the shoulders roll a little further than the hips, and the head
    // stays face down, looking a little ahead, until every third stroke it turns
    // out on the recovering arm's side to breathe.
    waist.scale.set(1 + 0.08 * squash, 1 - 0.12 * squash, 1 + 0.08 * squash);
    waist.position.y = D.waistY + breath * 0.5 - 0.04 * crouch;
    waist.rotation.set(lerp(lean * 0.4 + 0.12 * anticipation, 0, sw), lerp(-yaw * 1.7, 0.4 * bodyRoll, sw), lerp(-roll * 0.8, 0, sw));
    if (drawn) waist.rotation.z += STAND1.counter * cp;
    if (look === 1) torso.scale.set(1 + 1.2 * breath, 1 + 0.25 * breath, 1 + 1.6 * breath);
    head.rotation.set(-lean - leanA + 0.06 * run, yaw * 1.4, roll * 0.5);
    head.rotation.y += 0.6 * Math.sin(idleT * 0.23 + 1.2) * (1 - move);
    if (sw > 0) {
      const x = 2 * stroke - 1.56, n = Math.round(x); // strokes, peaking as an arm is mid-recovery
      const b = n % 3 === 0 ? smoothstep(clamp(1 - Math.abs(x - n) / 0.45, 0, 1)) : 0;
      const turn = lerp(0.2 * bodyRoll, (n % 2 === 0 ? 1 : -1) * 1.5, b); // the face's turn off the bottom
      head.rotation.set(lerp(head.rotation.x, -0.25, sw), lerp(head.rotation.y, turn - bodyRoll, sw), lerp(head.rotation.z, 0, sw));
    }

    // --- arms: the hands are driven on their own swing arc — forward to chest
    // height close to the body, back past the hip — and the elbow follows from
    // its IK, always bent, opposite the same-side leg. Wading, the hands ride
    // out wide over the water. Swimming, each hand runs the stroke's path, the
    // elbow out through the pull and high over the recovery.
    for (const arm of arms) {
      const ac = (c + (arm.sx > 0 ? 0 : 0.5)) % 1;
      const s = Math.cos(TAU * ac); // +1 = this hand forward (that leg is back)
      const t = (s + 1) / 2;
      if (look === 2) swingArm(arm.sx, s, t, move, run);
      else {
        const fwd = lerp(lerp(swing[0], swing[1], t), lerp(swing[2], swing[3], t), run);
        const down = lerp(lerp(swing[4], swing[5], t), lerp(swing[6], swing[7], t), run);
        const lat = lerp(lerp(swing[8], swing[9], t), lerp(swing[10], swing[11], t), run);
        vHand.set(
          arm.sx * lerp(idleHand.lat, lat, move),
          lerp(idleHand.down, down, move),
          lerp(idleHand.fwd, fwd, move),
        );
      }
      if (wade > 0) vHand.lerp(vDir.set(arm.sx * 0.3, -0.38, 0.1 + 0.1 * s * move), wade * 0.8);
      if (anticipation > 0) vHand.lerp(vDir.set(arm.sx * 0.13, -0.28, -0.22), anticipation);
      if (tuck > 0.001) vHand.lerp(vDir.set(arm.sx * 0.13, 0.26, 0.32), tuck); // hands up and forward at the apex
      arm.target.copy(arm.shoulder).add(vHand);
      // the elbow trails behind and outside; the drawn figure's behind and
      // down, so on the back swing it stays under the shoulder
      if (look === 1) vPole.set(arm.sx * 0.25, -0.35, -1);
      else if (!look) vPole.set(arm.sx * 0.45, 0.1, -1);
      if (sw > 0) {
        const u = (stroke + (arm.sx > 0 ? 0 : 0.5)) % 1;
        STROKE.getPoint(u, vSwim);
        vSwim.x *= arm.sx;
        arm.target.lerp(vSwim.add(arm.shoulder), sw);
        const rec = smoothstep(clamp((u - 0.6) / 0.1, 0, 1)) * smoothstep(clamp((1 - u) / 0.1, 0, 1));
        vPole.lerp(vDir.set(arm.sx * lerp(1, 0.55, rec), lerp(0.1, -0.3, rec), lerp(-0.2, -1, rec)), sw);
      }
      if (solve2(arm.shoulder, arm.target, D.upper, D.fore, vPole, arm.elbow)) over++;
      if (!arm.tube) {
        arm.n.crossVectors(ikDir, ikPole); // the elbow's axis, for the skin's bones
        continue;
      }
      arm.chain[2].lerpVectors(arm.shoulder, arm.elbow, 0.5);
      arm.chain[3].copy(arm.elbow);
      arm.chain[4].lerpVectors(arm.elbow, arm.target, 0.3); // the forearm's belly
      arm.chain[5].lerpVectors(arm.elbow, arm.target, 0.8);
      arm.chain[6].copy(arm.target);
      arm.tube.build(arm.chain, arm.rad, 0.06);
      if (arm.fist) {
        // the hand down the line of the forearm, its back turned out
        vDir.subVectors(arm.target, arm.elbow).normalize();
        vBack.set(arm.sx, 0, 0).addScaledVector(vDir, -arm.sx * vDir.x);
        if (vBack.lengthSq() < 1e-4) vBack.set(0, 1, 0).addScaledVector(vDir, -vDir.y);
        vBack.normalize();
        vAcross.crossVectors(vBack, vDir);
        arm.fist.position.copy(arm.target);
        arm.fist.quaternion.setFromRotationMatrix(mHand.makeBasis(vAcross, vBack, vDir));
      }
      if (sleeve && arm.sx < 0) { // his right forearm
        for (let k = 0; k < 4; k++) sleeve.chain[k].lerpVectors(arm.elbow, arm.target, sleeve.at[k]);
        sleeve.tube.build(sleeve.chain, sleeve.rad, 0);
      }
    }
    if (figure) figure.pose(breath, c);
  }
  // a style that paints the sculpted figure by its pieces' names does so now,
  // so not one frame is drawn in the colours he was built with
  if (figure && typeof materials.paint === 'function') materials.paint(root);

  return {
    object3D: root,
    update,
    /** Soft collision, after each step (base.js): push his ground direction `dir` out of whatever stands or walks
     *  there — the week's built objects, the tree a landing stood, the herds (life-kit.js solidsOf) — so he slides
     *  round it rather than through it. Whether he was moved. */
    collide(dir) {
      if (!features) return false;
      const field = solidsOf(features);
      field.read(THREE, root.parent, root.position);
      return field.push(dir, BODY_R);
    },
    get phase() { return phase; },
    get stride() { return strideNow; },
    debug: {
      // The point under the ankle in the root frame: ≈0 while the foot is on the
      // ground, lifted through the swing.
      feet() {
        root.updateMatrixWorld(true);
        const p = new THREE.Vector3();
        return legs.map((leg) => {
          const v = leg.foot.localToWorld(p.set(0, -D.ankle, 0));
          root.worldToLocal(v);
          return { y: v.y, z: v.z };
        });
      },
      feetY() {
        return this.feet().map((f) => f.y);
      },
      get phase() { return phase; },
      get unreachable() { return over; },
    },
  };
}

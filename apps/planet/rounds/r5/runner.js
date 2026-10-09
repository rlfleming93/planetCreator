/* Planet Creator — the runner figure.
 *
 * ONE continuous, smooth-shaded body instead of a stack of capsules: a lathe
 * torso + head, and tapered tubes whose centreline is rebuilt from its joint
 * chain every frame. Interior joints are rounded into fillet arcs, so a bent
 * knee is one smooth surface and no joint can ever open a gap. Nothing is
 * skinned, so a style's materials — including a custom ShaderMaterial — drive it
 * unchanged. Sleeves end at the mid upper arm and shorts at the mid thigh, on a
 * clean ring, so the two materials meet on a drawn edge rather than a seam.
 *
 * Local frame: origin on the ground between the feet, +Y up, +Z the direction of
 * travel, ≈1.81 units tall. The app seats the root on the terrain and rotates it
 * so +Z is the heading.
 *
 *   const runner = createRunner(style.runnerMaterials({ THREE, uniforms }));
 *   scene.add(runner.object3D);
 *   runner.update(dt, { speed, grounded });      // speed in units/second
 *
 * Materials: { body, accent, hair }. Sleeves and shorts are the accent, the hair
 * and the beard the hair colour, everything else the body; a slot that is left
 * out falls back to the body.
 */
import * as THREE from 'three';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => t * t * (3 - 2 * t);

/* --------------------------------------------------------------- figure ---- */
// A distance runner's build: legs 53 % of the height, long thighs, a narrow
// waist, broad shoulders. Every number is in the local frame (1 u ≈ 1 m).
const D = {
  hipY: 0.955, // hip joints above the ground, standing
  hipX: 0.098, // half the hip separation
  thigh: 0.43,
  shin: 0.415,
  ankle: 0.115, // sole plane → ankle
  waistY: 0.1, // pelvis → waist pivot
  shoulderX: 0.175,
  shoulderY: 0.392, // pelvis → shoulder joint
  upper: 0.3, // shoulder → elbow
  fore: 0.28, // elbow → hand
  neckY: 0.5, // pelvis → head pivot
  headY: 0.208, // head pivot → head centre
  headR: 0.128,
};

// The shoe, in the foot frame (the ankle at the origin): a tapered last — narrow
// heel, wide ball, rounded toe — whose flat sole sits exactly `ankle` below the
// ankle. Rolling up onto the toe or back onto the heel, the ground contact is the
// cap's tangency point (see `contact`), so a planted foot is always exactly on the
// ground and never through it.
const SHOE = {
  chain: [[0, -0.079, -0.055], [0, -0.068, 0.02], [0, -0.065, 0.1], [0, -0.071, 0.13]],
  rad: [0.036, 0.047, 0.05, 0.044],
  heel: -0.055, rHeel: 0.036, // rear cap
  toe: 0.13, rToe: 0.044, // front cap
  flat: 0.02, // …roll below which the contact point slides along the flat sole
};

// Torso profile, pelvis frame: half-depth at each height. Revolved, then widened
// laterally (×1.62) into a body rather than a barrel.
const TORSO = [
  [0.0, -0.152], [0.046, -0.149], [0.082, -0.133], [0.101, -0.099], [0.109, -0.056],
  [0.113, -0.01], [0.111, 0.038], [0.102, 0.082], [0.091, 0.126], [0.09, 0.168],
  [0.099, 0.212], [0.109, 0.258], [0.117, 0.306], [0.122, 0.35], [0.126, 0.392],
  [0.121, 0.424], [0.1, 0.452], [0.07, 0.478], [0.056, 0.5], [0.053, 0.528],
  [0.049, 0.56], [0.04, 0.586], [0.0, 0.6],
];

// The beard, in the head frame: a wedge off the jawline, wide at the cheeks and
// tapering to a soft point below the chin. Flush with the face, so the profile
// grows rather than grows a muzzle.
const BEARD = {
  chain: [[0, 0.185, -0.03], [0, 0.13, 0.012], [0, 0.08, 0.032], [0, 0.035, 0.042], [0, -0.008, 0.038]],
  rad: [0.104, 0.106, 0.09, 0.058, 0.026],
};

// The tuft off the bun, in the head frame: the one piece of the hair that hangs
// clear of the skull, so the tie reads as a tie and not as a lump.
const TAIL = {
  chain: [[0, 0.085, -0.205], [0, 0.04, -0.213], [0, 0.002, -0.203]],
  rad: [0.038, 0.03, 0.014],
};

/* ---------------------------------------------------------------- gait ----- */
// Cadence (stride cycles per second) drives the phase, so the gait's speed is
// what a runner's legs can actually do; the stride then follows from the ground
// speed, and the stance is capped by how far one planted foot can carry the body
// (`travel`) — which is what keeps the feet planted instead of skating.
const GAIT = {
  cadenceW: 0.9, cadenceR: 2.0, // cycles per second: a walk … a sprint
  speed: 6.6, // the app's sprint speed; everything scales below it
  stanceW: 0.62, stanceR: 0.46, // fraction of the cycle a foot is planted
  travel: 0.64, // most the body may travel over one planted foot
  liftW: 0.05, liftR: 0.46, // sole lift in swing: a shuffle … a heel to the glute
  bobW: 0.012, bobR: 0.035, // vertical bob
  lean: 0.14, // the spine's own forward lean at speed, rad
  leanA: 0.157, // …plus the lean from the ankles, rad (≈9° at the sprint)
  heelW: 0.16, // toe-up at the walk's heel strike, rad
};

/* -------------------------------------------------------------- geometry --- */
const RADIAL = 12; // cross-section segments around a limb
const CAP = 4; // rings in each end cap (the last closes the tip)
const DENSE = 160; // centreline samples before resampling to rings
const STEP = 0.015; // …spacing along a straight run
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const AXIS_X = new THREE.Vector3(1, 0, 0);
const COS = new Float32Array(RADIAL), SIN = new Float32Array(RADIAL); // the ring's directions
for (let j = 0; j < RADIAL; j++) {
  const phi = (j / RADIAL) * TAU;
  COS[j] = Math.cos(phi);
  SIN[j] = Math.sin(phi);
}

/**
 * A tapered tube along a chain of joints, rebuilt in place. Interior corners are
 * rounded into fillet arcs, both ends close with a hemisphere, and the normals
 * are analytic, so the surface stays smooth through a bend. `pts`/`rad` are the
 * joint centres and radii (rad[a] ↔ pts[a]).
 * With `split`, the mesh takes [material, material2] and the two meet on the
 * ring between section `split - 1` and `split` — a clean circle, not a seam.
 */
function createTube(rings, material, split = 0) {
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
      const s = (k / (body - 1)) * total;
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
      const drds = (CR[hi] - CR[lo]) / ds; // taper tilts the normal along the path
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

/** A sphere with its scaling baked in, so a style's shader sees straight normals. */
function ball(r, sx, sy, sz, at, material) {
  const geo = new THREE.SphereGeometry(r, 18, 12);
  geo.scale(sx, sy, sz);
  geo.translate(at[0], at[1], at[2]);
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  return mesh;
}

/** Static tube geometry from a plain chain (no per-frame rebuild), unsmoothed so
 *  a straight sole or jaw keeps its exact line. */
function staticTube(chain, rad, material, fillet = 0, rings = 18) {
  const tube = createTube(rings, material);
  const pts = chain.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  tube.build(pts, new Float32Array(rad), fillet, 0);
  return tube.mesh;
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

/* ---------------------------------------------------------------- runner --- */

/**
 * The runner: one faceless figure with a procedural gait. The cycle runs at a
 * runner's cadence and the stride follows from the ground speed; the feet are
 * pinned to the ground through a rolling shoe, so a planted foot never slides,
 * and the pelvis dips rather than ask a leg for more reach than it has. Idle →
 * walk → run blend continuously; airborne it tucks.
 * @returns { object3D, update(dt, {speed, grounded}), phase, stride, debug }
 */
export function createRunner(materials = {}) {
  const body = materials.body || new THREE.MeshLambertMaterial({ color: 0xdcdfe4 });
  const accent = materials.accent || new THREE.MeshLambertMaterial({ color: 0x6e7a8c });
  const hair = materials.hair || body; // the hair and the beard, when a style tints them

  const root = new THREE.Group();
  root.name = 'runner';
  const pelvis = new THREE.Group();
  pelvis.position.y = D.hipY;
  root.add(pelvis);
  const waist = new THREE.Group();
  waist.position.y = D.waistY;
  pelvis.add(waist);

  // Torso + pelvis: one lathe from the crotch to the neck — narrowest at the
  // waist, widest across the shoulders.
  const torso = new THREE.Mesh(new THREE.LatheGeometry(TORSO.map(([r, y]) => new THREE.Vector2(r, y)), 22), body);
  torso.geometry.scale(1.62, 1, 1);
  torso.position.y = -D.waistY;
  waist.add(torso);

  // Faceless head: a bare skull, long hair swept back off the forehead and
  // gathered at the nape into a low bun with a short tail, and a full beard off
  // the jaw. Hair and beard in the hair material; all of it silhouette.
  const head = new THREE.Group();
  head.position.set(0, D.neckY - D.waistY, 0.008);
  waist.add(head);
  const skull = ball(D.headR, 0.95, 1.09, 1.02, [0, D.headY, -0.004], body);
  skull.name = 'skull';
  head.add(skull);
  const HAIR = [
    ball(0.134, 1.0, 0.98, 1.04, [0, 0.226, -0.026], hair), // the cap: proud of the skull all round but the face
    ball(0.1, 1.0, 1.12, 0.92, [0, 0.12, -0.095], hair), // the length gathered down the nape
    ball(0.05, 1.0, 1.0, 1.0, [0, 0.1, -0.2], hair), // …into the bun
    staticTube(TAIL.chain, TAIL.rad, [hair], 0.03, 12), // …with a tail
  ];
  for (const m of HAIR) {
    m.name = 'hair';
    head.add(m);
  }
  const beard = staticTube(BEARD.chain, BEARD.rad, [hair], 0.05, 16);
  beard.name = 'beard';
  head.add(beard);

  const legs = [];
  const arms = [];
  const restX = [0.086, 0.089]; // standing: feet under the hips
  const restZ = [-0.02, 0.02]; // …and the soles straddling the root
  for (let i = 0; i < 2; i++) {
    const sx = i ? 1 : -1;
    // Leg: hip cap (inside the pelvis) → hip → mid-thigh → knee → calf → ankle.
    // Shorts in the body material to the mid thigh, bare leg below.
    const hip = new THREE.Vector3(D.hipX * sx, 0, 0);
    const chain = [
      new THREE.Vector3(D.hipX * sx * 0.84, 0.075, -0.012), hip, new THREE.Vector3(),
      new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),
    ];
    const tube = createTube(30, [body, accent], 11); // shorts to the mid thigh
    pelvis.add(tube.mesh);
    const foot = new THREE.Group();
    foot.add(staticTube(SHOE.chain, SHOE.rad, [accent], 0, 18));
    pelvis.add(foot);
    legs.push({
      sx, i, hip, tube, foot, chain,
      rad: new Float32Array([0.083, 0.079, 0.07, 0.057, 0.061, 0.035]),
      hipR: new THREE.Vector3(), ankle: new THREE.Vector3(), knee: new THREE.Vector3(),
      roll: 0, py: 0,
    });

    // Arm: shoulder cap (inside the chest) → shoulder → mid-upper → elbow →
    // wrist → hand. Sleeve to the mid upper arm, bare arm below.
    const shoulder = new THREE.Vector3(D.shoulderX * sx, D.shoulderY - D.waistY, 0.008);
    const achain = [
      new THREE.Vector3(D.shoulderX * sx * 0.5, D.shoulderY - D.waistY + 0.052, 0.004), shoulder,
      new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),
    ];
    const atube = createTube(26, [body, accent], 11); // sleeve to the mid upper arm
    waist.add(atube.mesh);
    arms.push({
      sx, shoulder, tube: atube, chain: achain,
      rad: new Float32Array([0.056, 0.052, 0.047, 0.042, 0.035, 0.04]),
      elbow: new THREE.Vector3(), hand: new THREE.Vector3(), target: new THREE.Vector3(),
    });
  }

  const airPose = [{ y: 0.5, z: 0.2, roll: 0.35 }, { y: 0.3, z: -0.42, roll: 0.55 }];
  const idleHand = { down: -0.55, fwd: 0.02, lat: 0.05 };
  const pq = new THREE.Quaternion();
  const qi = new THREE.Quaternion();
  const qRoll = new THREE.Quaternion();
  const vDir = new THREE.Vector3();
  const vHip = new THREE.Vector3();
  const vHand = new THREE.Vector3();
  const vContact = new THREE.Vector3();
  let phase = 0, strideNow = 0, air = 0, idleT = 0, over = 0;

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
    const run = clamp((speed - 1.1) / (GAIT.speed - 1.1), 0, 1); // jog → sprint
    const c = phase;
    const cadence = lerp(GAIT.cadenceW, GAIT.cadenceR, clamp(speed / GAIT.speed, 0, 1));
    strideNow = speed / cadence; // what one cycle covers at this speed — the phase follows it
    if (speed > 1e-4) phase = (phase + cadence * dt) % 1;
    idleT += dt;
    air += ((st.grounded === false ? 1 : 0) - air) * Math.min(1, dt * 9);

    // The stance is whatever fits inside one stride without asking a leg for more
    // travel than it has; at speed that alone gives the flight phase.
    const travel = Math.min(GAIT.travel, strideNow * lerp(GAIT.stanceW, GAIT.stanceR, run));
    const stance = strideNow > 1e-4 ? travel / strideNow : 1; // standing: no stance to speak of
    const half = travel / 2;
    // The body tips forward from the ankles as the speed comes up — the hips ride
    // out over the feet — and the spine adds only a little on top of that.
    const leanA = GAIT.leanA * run * move;
    // The swing barely clears the ground at a walk; only a run picks the foot up,
    // and only a sprint brings the heel to the glute.
    const lift = lerp(GAIT.liftW, GAIT.liftR, run * run * run) * move;
    const lean = (0.05 + GAIT.lean * run) * move + 0.02;
    const bobA = lerp(GAIT.bobW, GAIT.bobR, run) * move;
    const breath = 0.01 * Math.sin(idleT * 1.6) * (1 - move);
    const yaw = 0.2 * (0.25 + 0.75 * run) * move * Math.sin(TAU * c); // hips lead the stride, even at a walk
    const roll = 0.045 * run * move * Math.sin(TAU * (c - 0.4)); // the swing hip drops
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
        pz = -half + 2 * half * smoothstep(v);
        py = lift * Math.sin(Math.PI * Math.pow(v, 0.75)); // heel up, then the knee drives
        rl = lerp(rollOff, rollLand, smoothstep(v));
      }
      if (air > 0.001) { // tucked jump: front knee up, trailing leg swept back
        const t = airPose[leg.i];
        pz = lerp(pz, t.z, air);
        py = lerp(py, t.y, air);
        rl = lerp(rl, t.roll, air);
      }
      leg.roll = lerp(0, rl, move); // idle stands flat-footed
      leg.py = lerp(0, py, move);
      ankleFrom(leg.sx * lerp(restX[leg.i], 0.092, move), leg.py, lerp(restZ[leg.i], pz, move), leg.roll, leg.ankle);
    }
    // --- pelvis: a walk crouches (bent knees carry a long stance), a run rides
    // high and rises through the flight; the reach guard below pulls it down over
    // whatever the planted leg asks for. Standing, it just breathes.
    const flight = clamp(Math.min(legs[0].py, legs[1].py) / 0.12, 0, 1);
    let hipY = D.hipY - 0.05 * (1 - run) * move + bobA * (flight - 0.45);
    // The lean turns about the ankles: the hips swing out over the feet by the
    // lean's own arc, so the soles stay exactly where the stance put them.
    const sinA = Math.sin(leanA), cosA = Math.cos(leanA);
    const place = () => pelvis.position.set(
      0, D.ankle + cosA * (hipY - D.ankle), sinA * (hipY - D.ankle),
    );
    pelvis.rotation.set(lean * 0.6 + leanA, yaw, roll);
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
    for (const leg of legs) leg.hipR.copy(leg.hip).applyQuaternion(pq).add(pelvis.position);

    // --- legs: IK from the hip to the planted ankle, drawn in the pelvis frame.
    over = 0;
    for (const leg of legs) {
      vDir.set(0, 0, 1).applyQuaternion(pq); // knees bend forward, whatever the hips do
      if (solve2(leg.hipR, leg.ankle, D.thigh, D.shin, vDir, leg.knee)) over++;
      leg.knee.sub(pelvis.position).applyQuaternion(qi);
      leg.ankle.sub(pelvis.position).applyQuaternion(qi);
      leg.chain[2].lerpVectors(leg.chain[1], leg.knee, 0.5);
      leg.chain[3].copy(leg.knee);
      leg.chain[4].lerpVectors(leg.knee, leg.ankle, 0.45);
      leg.chain[4].z -= 0.01; // the calf sits behind the shin
      leg.chain[5].copy(leg.ankle);
      leg.tube.build(leg.chain, leg.rad, 0.085);
      // The foot's *world* orientation is the roll alone: the pelvis's lean and
      // yaw must not tip a planted shoe into the ground.
      leg.foot.position.copy(leg.ankle);
      leg.foot.quaternion.copy(qi).multiply(qRoll.setFromAxisAngle(AXIS_X, leg.roll));
    }

    // --- torso: the shoulders swing against the hips (a walk as much as a run),
    // and the head rides level — the lean is taken out of the neck, so the figure
    // turns and tips at the waist rather than at the chin.
    waist.position.y = D.waistY + breath * 0.5;
    waist.rotation.set(lean * 0.4, -yaw * 1.7, -roll * 0.8);
    head.rotation.set(-lean - leanA + 0.06 * run, yaw * 1.4, roll * 0.5);
    head.rotation.y += 0.05 * Math.sin(idleT * 0.5) * (1 - move);

    // --- arms: the hands are driven on their own swing arc — forward to chest
    // height close to the body, back past the hip — and the elbow follows from
    // its IK, always bent, opposite the same-side leg.
    for (const arm of arms) {
      const ac = (c + (arm.sx > 0 ? 0 : 0.5)) % 1;
      const s = Math.cos(TAU * ac); // +1 = this hand forward (that leg is back)
      const t = (s + 1) / 2;
      const fwd = lerp(lerp(-0.15, 0.19, t), lerp(-0.25, 0.31, t), run);
      const down = lerp(lerp(-0.52, -0.5, t), lerp(-0.3, -0.11, t), run);
      const lat = lerp(lerp(0.13, 0.12, t), lerp(0.16, 0.05, t), run);
      vHand.set(
        arm.sx * lerp(idleHand.lat, lat, move),
        lerp(idleHand.down, down, move),
        lerp(idleHand.fwd, fwd, move),
      );
      if (air > 0.001) vHand.lerp(vDir.set(arm.sx * 0.04, 0.04, 0.32), air); // hands up in front
      arm.target.copy(arm.shoulder).add(vHand);
      vDir.set(arm.sx * 0.45, 0.1, -1); // the elbow trails behind and outside
      if (solve2(arm.shoulder, arm.target, D.upper, D.fore, vDir, arm.elbow)) over++;
      arm.chain[2].lerpVectors(arm.shoulder, arm.elbow, 0.5);
      arm.chain[3].copy(arm.elbow);
      arm.chain[4].lerpVectors(arm.elbow, arm.target, 0.8);
      arm.chain[5].copy(arm.target);
      arm.tube.build(arm.chain, arm.rad, 0.06);
    }
  }

  return {
    object3D: root,
    update,
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

/* Planet Creator — the terrain's own fundamentals.
 *
 * Three layers of relief, each behind its own dial, each off at 0 so the
 * round-five ground comes back bit for bit. All of them are asked of the drawn
 * ground only: the sea's quantile probe and a lagoon's shore read the
 * undecorated ground, so the continents, the sea line, every siting and every
 * landing stay exactly where the classic week put them and the new relief is
 * laid on the week that was already there.
 *
 *   spines   mountain chains along the seams of a second, warped field at the
 *            continental scale — the globe's own ranges, on every week, stood on
 *            the week's own high ground (see sample in base.js for why).
 *   coast    warped high-frequency relief within a few units of the waterline:
 *            capes and bays on the open coast, narrow fjords where it is steep,
 *            offshore islets beyond it.
 *   rivers   a drainage graph read once per week on a coarse sphere grid: every
 *            node flows to its lowest neighbour, the catchment above it
 *            accumulates downhill, and the channels that gather enough ground
 *            are carved as valleys whose width and depth follow that area — so
 *            a river is a thread at its source and a wide reach at its mouth.
 *
 * Nothing here allocates inside a query, and every query early-outs on its own
 * cheap test (a band on the seam field, a band on height above the sea, the
 * hash cell a point falls in) before it takes a noise sample or a square root.
 * Chord lengths stand in for arcs: at the widths a river or a coast is drawn
 * at, the two part in the third decimal.
 */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ---------------------------------------------------------------- spines ---- */

/**
 * Mountain spines along the continental field's plate seams.
 *
 * The seam is a level crossing of a second field of the week's own noise, read
 * through a warped domain: the warp runs the seam across the coastlines it would
 * otherwise shadow, and the chain's own ridged noise — summits, saddles and the
 * spurs branching off them — is what makes the crossing read as a range rather
 * than as one more fold.
 *
 * `seam`, `warpA`, `warpB`, `chain`, `spur` and `wide` are noise3() fields made
 * by the caller, so every seed lives in one place (readWeek) and the fields are
 * shared with nothing else. Returns spine(x, y, z): the ground raised, in units,
 * zero everywhere off the seam band.
 */
export function createSpines(cfg) {
  const { dial, seam, warpA, warpB, chain, spur, wide, fbm, ridged } = cfg;
  const freq = cfg.freq;
  const wfreq = cfg.freq * 0.72;
  const wideFreq = cfg.freq * 0.35;
  const warp = cfg.warp;
  const band = cfg.band;
  const level = cfg.level;
  const amp = cfg.amp;
  const p = cfg.chainFreq;
  const ax = cfg.ax, ay = cfg.ay, az = cfg.az;
  const bx = cfg.bx, by = cfg.by, bz = cfg.bz;
  return function spine(x, y, z) {
    const u = warpA(x * wfreq + 11.3, y * wfreq + 3.7, z * wfreq + 19.1) - 0.5;
    const v = warpB(x * wfreq + 5.9, y * wfreq + 23.2, z * wfreq + 7.4) - 0.5;
    const qx = x + (ax * u + bx * v) * warp;
    const qy = y + (ay * u + by * v) * warp;
    const qz = z + (az * u + bz * v) * warp;
    const s = fbm(seam, qx * freq, qy * freq, qz * freq, 2) * 2 - 1;
    const d = s > level ? s - level : level - s;
    if (d >= band) return 0;
    // The chain has a width of its own, read along it: broad massifs, single
    // ridges, and fingers where the spurs branch off. A range whose outline in
    // plan is one even band reads as a band whatever its height; broken ground
    // reads as ground. (Both fields are read only inside the seam band.)
    const rn = ridged(chain, qx * p, qy * p, qz * p, 3, 0.5, 2.09);
    const sp = ridged(spur, qx * p * 2.7 + 3.1, qy * p * 2.7 + 7.9, qz * p * 2.7 + 1.7, 2);
    const wd = wide(qx * wideFreq + 7.3, qy * wideFreq + 2.9, qz * wideFreq + 15.1);
    const w = band * (0.40 + 0.45 * wd + 0.15 * sp);
    // A tent, not a dome: the crest is a line along the seam (the profile keeps
    // a slope on the axis), and the crest is cut through (below) rather than
    // carried as an even wall. The two flanks are not the same profile: the
    // ground falls away steeply on one side of the seam and eases off the long
    // way on the other, which is what a painter reads as a range.
    const t = 1 - d / w;
    if (t <= 0) return 0;
    const front = s > level ? 0.86 : 0.50;
    const cross = t * (front + (1 - front) * t);
    const k = 0.42 + 0.58 * rn * Math.sqrt(rn) * (0.30 + 0.70 * sp);
    return amp * cross * k * dial;
  };
}

/* ----------------------------------------------------------------- coast ---- */

/**
 * A fractal coastline: warped high-frequency relief laid only where the ground
 * stands within `band` units of the waterline.
 *
 * The window fades to nothing at the band's rim with a slope of zero, so the
 * detail cannot draw a ring around itself. Inside it, a displacement of a few
 * units either way is what turns a smooth noise blob into capes and bays — and,
 * where the coast is already steep, into narrow fjords; offshore it raises
 * islets and drowns shoals, and the sea line moves with them because the water
 * is read off this same ground.
 *
 * Returns coast(x, y, z, d): the ground's change, in units, where d = h - seaLevel.
 */
export function createCoast(cfg) {
  const { dial, warp, detail, fbm } = cfg;
  const band = cfg.band;
  const seaBand = cfg.seaBand;
  const seaAmp = cfg.seaAmp;
  const amp = cfg.amp;
  const freq = cfg.freq;
  const wfreq = cfg.freq * 0.5;
  const warpAmp = cfg.warpAmp;
  const ax = cfg.ax, ay = cfg.ay, az = cfg.az;
  return function coast(x, y, z, d) {
    // The sea side of the waterline is read on its own shorter, weaker window:
    // this ground's sea is only a few units deep, so an islet needs little more
    // than a shoal lifted, and a full-strength reach out to sea would raise the
    // whole shelf into an archipelago.
    const under = d < 0;
    const a = under ? -d : d;
    const reach = under ? seaBand : band;
    if (a >= reach) return 0;
    const t = a / reach;
    const win = 1 - t * t * (3 - 2 * t);
    const w = warp(x * wfreq + 3.1, y * wfreq + 17.4, z * wfreq + 8.6) - 0.5;
    const qx = x + ax * w * warpAmp;
    const qy = y + ay * w * warpAmp;
    const qz = z + az * w * warpAmp;
    const n = fbm(detail, qx * freq, qy * freq, qz * freq, 2, 0.5, 2.0) * 2 - 1;
    return amp * (under ? seaAmp : 1) * win * n * dial;
  };
}

/* ---------------------------------------------------------------- rivers ---- */

/** The coarse grid the drainage is read on: 10 242 nodes, ~3.9 u apart. */
export const DRAIN_DETAIL = 5;

const GRID = 10; // hash cells per cube axis: 0.2 unit-sphere cells, ~24 u at the face

/**
 * Drainage: the week's rivers, read once.
 *
 * `positions`/`indices` are an icosphere (base.js builds it at DRAIN_DETAIL),
 * `ground(x, y, z)` the week's own ground. Each node's height is sampled once,
 * then smoothed across its neighbours `smoothPasses` times — a low pass that
 * leaves the continental term and the week's chains standing and takes the fine
 * grain out. That matters: `world.baseAmp` is a foot of noise over the whole
 * ground, and read at the node spacing it cuts the land into a thousand tiny
 * catchments, each with its own stream and none of them a river. Every node
 * flows to its lowest neighbour, the cells above it accumulate into that
 * neighbour's catchment, and a node whose catchment passes `minArea` and whose
 * path reaches the sea is a channel.
 *
 * The query is a hash lookup with no allocation: the channels are binned in a
 * cube grid, a point reads the 27 cells around it — any channel axis passing
 * within the widest carve has an endpoint in that block, since the grid's cells
 * (24 u at the face) are wider than that reach plus one edge (3.9 u) — and takes
 * the nearest channel segment's profile, its width and depth read from the area
 * the channel carries there.
 */
export function createDrainage(cfg) {
  const R = cfg.R;
  const dial = cfg.dial;
  const seaLevel = cfg.seaLevel;
  const positions = cfg.positions;
  const indices = cfg.indices;
  const ground = cfg.ground;
  const minArea = cfg.minArea;
  const refRatio = cfg.refRatio;
  const smoothPasses = cfg.smoothPasses;
  const hwMax = cfg.halfWidthMax;
  const dpMax = cfg.depthMax;
  const n = positions.length / 3;
  const nodeArea = (4 * Math.PI * R * R) / n;

  const h = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const j = i * 3;
    h[i] = ground(positions[j], positions[j + 1], positions[j + 2]);
  }

  // Neighbour lists (CSR). Each edge of a closed mesh lists its two ends twice;
  // that is kept, so a mean over the ring is taken over the faces that share the
  // vertex and a vertex on the five-edge ring is not weighted like a six.
  const deg = new Uint8Array(n);
  for (let k = 0; k < indices.length; k++) deg[indices[k]]++;
  const start = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) start[i + 1] = start[i] + 2 * deg[i];
  const cursor = new Uint32Array(start.subarray(0, n));
  const adj = new Uint32Array(start[n]);
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k], b = indices[k + 1], c = indices[k + 2];
    adj[cursor[a]++] = b; adj[cursor[a]++] = c;
    adj[cursor[b]++] = c; adj[cursor[b]++] = a;
    adj[cursor[c]++] = a; adj[cursor[c]++] = b;
  }

  let flowH = h, spare = new Float64Array(n);
  for (let pass = 0; pass < smoothPasses; pass++) {
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = start[i]; k < start[i + 1]; k++) s += flowH[adj[k]];
      const mean = s / (start[i + 1] - start[i]);
      spare[i] = 0.40 * flowH[i] + 0.60 * mean;
    }
    const swap = flowH; flowH = spare; spare = swap;
  }

  // Steepest descent, strictly downhill: a node with no lower neighbour is a
  // sink, and the ground above it is a basin that does not drain to the sea.
  const next = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    if (flowH[i] <= seaLevel) continue;
    let best = -1, bh = flowH[i];
    for (let k = start[i]; k < start[i + 1]; k++) {
      const j = adj[k];
      if (flowH[j] < bh) { bh = flowH[j]; best = j; }
    }
    next[i] = best;
  }

  // Catchment, in units of area, accumulated downstream: strictly downhill means
  // a pass in order of falling height is a topological order.
  const land = [];
  for (let i = 0; i < n; i++) if (flowH[i] > seaLevel) land.push(i);
  land.sort((a, b) => flowH[b] - flowH[a]);
  const acc = new Float64Array(n);
  for (let k = 0; k < land.length; k++) acc[land[k]] = nodeArea;
  for (let k = 0; k < land.length; k++) {
    const i = land[k];
    const j = next[i];
    if (j >= 0) acc[j] += acc[i];
  }

  // Which nodes actually reach the sea (a sink's own catchment does not).
  const reaches = new Uint8Array(n), settled = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (flowH[i] <= seaLevel) { reaches[i] = 1; settled[i] = 1; }
  const walk = [];
  for (let i = 0; i < n; i++) {
    if (settled[i]) continue;
    walk.length = 0;
    let j = i;
    while (!settled[j]) {
      walk.push(j);
      const nx = next[j];
      if (nx < 0) break;
      j = nx;
    }
    // A walk ends either on a sea node (settled, reaches 1) or on a sink with
    // nowhere left to fall (unsettled, reaches 0). Every node on the walk takes
    // the answer, so a long path is walked once and never again.
    const r = reaches[j] ? 1 : 0;
    for (let k = 0; k < walk.length; k++) { reaches[walk[k]] = r; settled[walk[k]] = 1; }
  }

  const span = Math.log(refRatio);
  const channels = [];
  const hw = new Float64Array(n);
  const dep = new Float64Array(n);
  let maxAcc = 0;
  for (let i = 0; i < n; i++) {
    if (flowH[i] <= seaLevel || !reaches[i] || acc[i] < minArea) continue;
    channels.push(i);
    if (acc[i] > maxAcc) maxAcc = acc[i];
  }

  const bins = new Int32Array(GRID * GRID * GRID + 1);
  const cellOf = (v) => clamp(Math.floor((v + 1) * (GRID / 2)), 0, GRID - 1);
  for (let k = 0; k < channels.length; k++) {
    const i = channels[k];
    const c = cellOf(positions[i * 3]) + cellOf(positions[i * 3 + 1]) * GRID + cellOf(positions[i * 3 + 2]) * GRID * GRID;
    bins[c]++;
  }
  let total = 0;
  for (let c = 0; c < bins.length - 1; c++) { const k = bins[c]; bins[c] = total; total += k; }
  bins[bins.length - 1] = total;
  const slot = new Uint32Array(total);
  const fill = new Uint32Array(bins.subarray(0, bins.length - 1));
  for (let k = 0; k < channels.length; k++) {
    const i = channels[k];
    const c = cellOf(positions[i * 3]) + cellOf(positions[i * 3 + 1]) * GRID + cellOf(positions[i * 3 + 2]) * GRID * GRID;
    slot[fill[c]++] = i;
  }
  // Width and depth follow the catchment the channel carries where it is, and
  // they start at nothing: a river is a thread where it is born and a broad
  // reach once it has gathered refRatio times the threshold's area — so a
  // source fades into the ground it rises from instead of stopping dead.
  for (let k = 0; k < channels.length; k++) {
    const i = channels[k];
    const g = Math.pow(clamp(Math.log(acc[i] / minArea) / span, 0, 1), 0.6);
    hw[i] = hwMax * g;
    dep[i] = dpMax * g;
  }
  // The width is read at the nodes and the nodes are one edge apart, so a reach
  // that grows node by node reads as a string of beads. Two relaxations along
  // the channel's own neighbours lay the growth out as one shape.
  let wh = hw, wd = dep;
  let sh = new Float64Array(n), sd = new Float64Array(n);
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 0; k < channels.length; k++) {
      const i = channels[k];
      let hs = 0, ds = 0, count = 0;
      for (let e = start[i]; e < start[i + 1]; e++) {
        const j = adj[e];
        if (hw[j] <= 0) continue; // the channel's own neighbours only
        hs += wh[j]; ds += wd[j]; count++;
      }
      if (count) { sh[i] = 0.5 * wh[i] + 0.5 * hs / count; sd[i] = 0.5 * wd[i] + 0.5 * ds / count; }
      else { sh[i] = wh[i]; sd[i] = wd[i]; }
    }
    const swapH = wh; wh = sh; sh = swapH;
    const swapD = wd; wd = sd; sd = swapD;
  }
  const halfWidth = wh, depth = wd;
  // The channel's own line. The flow steps node to node, so a channel read
  // straight off the graph is a staircase of one-edge turns; three relaxations
  // of the nodes' own positions along the channel lay a smooth, meandering axis
  // through them, and the carve follows that axis instead of the grid it was
  // found on. (Ocean nodes keep their own positions: a mouth's last segment runs
  // to the water, not to a smoothed point that may have drifted inland.)
  let axis = Float64Array.from(positions);
  let axisOut = new Float64Array(n * 3);
  for (let pass = 0; pass < 3; pass++) {
    for (let k = 0; k < channels.length; k++) {
      const i = channels[k], i3 = i * 3;
      let sx = 0, sy = 0, sz = 0, count = 0;
      for (let e = start[i]; e < start[i + 1]; e++) {
        const j = adj[e];
        if (halfWidth[j] <= 0) continue;
        const j3 = j * 3;
        sx += axis[j3]; sy += axis[j3 + 1]; sz += axis[j3 + 2]; count++;
      }
      if (count) {
        let x = 0.45 * axis[i3] + 0.55 * sx / count;
        let y = 0.45 * axis[i3 + 1] + 0.55 * sy / count;
        let z = 0.45 * axis[i3 + 2] + 0.55 * sz / count;
        const l = Math.sqrt(x * x + y * y + z * z) || 1;
        axisOut[i3] = x / l; axisOut[i3 + 1] = y / l; axisOut[i3 + 2] = z / l;
      } else {
        axisOut[i3] = axis[i3]; axisOut[i3 + 1] = axis[i3 + 1]; axisOut[i3 + 2] = axis[i3 + 2];
      }
    }
    const swap = axis; axis = axisOut; axisOut = swap;
  }

  // The carve: distance to the nearest channel's segment, then that channel's
  // own profile — a flat bed with two walls, so a river is a valley to stand in
  // and not a scratch.
  function carve(x, y, z) {
    if (!channels.length) return 0;
    const cx = cellOf(x), cy = cellOf(y), cz = cellOf(z);
    let cut = 0;
    for (let dz = -1; dz <= 1; dz++) {
      const iz = cz + dz;
      if (iz < 0 || iz >= GRID) continue;
      for (let dy = -1; dy <= 1; dy++) {
        const iy = cy + dy;
        if (iy < 0 || iy >= GRID) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const ix = cx + dx;
          if (ix < 0 || ix >= GRID) continue;
          const cell = ix + iy * GRID + iz * GRID * GRID;
          const from = bins[cell], to = bins[cell + 1];
          for (let k = from; k < to; k++) {
            const i = slot[k];
            const i3 = i * 3;
            const px = axis[i3], py = axis[i3 + 1], pz = axis[i3 + 2];
            const j3 = next[i] * 3;
            const ax = axis[j3] - px, ay = axis[j3 + 1] - py, az = axis[j3 + 2] - pz;
            let t = ((x - px) * ax + (y - py) * ay + (z - pz) * az) / (ax * ax + ay * ay + az * az);
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const dx2 = x - (px + ax * t), dy2 = y - (py + ay * t), dz2 = z - (pz + az * t);
            const w = halfWidth[i];
            const r = Math.sqrt(dx2 * dx2 + dy2 * dy2 + dz2 * dz2) * R / w;
            if (r >= 1) continue;
            // flat bed, then a wall to the rim: shape(0) = 1, shape(1) = 0
            let profile;
            if (r <= 0.42) profile = 1;
            else { const u = (1 - r) / 0.58; profile = u * u * (3 - 2 * u); }
            const d = depth[i] * profile;
            if (d > cut) cut = d;
          }
        }
      }
    }
    return cut * dial;
  }

  return {
    nodes: n,
    channels: Int32Array.from(channels),
    acc, halfWidth, depth, next, positions,
    maxAcc, minArea,
    smoothHeight: flowH,
    carve,
  };
}

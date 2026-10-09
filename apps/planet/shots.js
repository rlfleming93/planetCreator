/* Planet Creator — the poster's shots (the poster.shot dial).
 *
 * The classic poster is one distance: the week's own subject turned toward the
 * sun, a whole globe inside the shelf's crop. This module is the other five, and
 * each is another distance from the planet — the poster's scale lever. A marble
 * seen from across the room, a planet the frame cannot hold, or the week's own
 * ground from just above it.
 *
 * Every shot composes for the still the shelf keeps: the central crop of the
 * frame's short axis (POSTER_CROP in base.js), whose half-height base.js hands a
 * shot as an angle. A shot's own numbers are therefore in still half-heights — 1
 * is the crop's own edge, 2 means the subject is twice that and the frame cuts
 * it — so a shot is the same picture on a phone, in a wall cell and on a shelf
 * poster. On the two low shots (crescent, horizon) the composition deliberately
 * runs past the crop: the bleed is the frame's own, the still is the picture.
 *
 *   classic     base.js frames it itself, and posterShot answers nothing: the
 *               dial's default renders byte for byte what this file never
 *               touched.
 *   crescent    the camera stands behind the terminator. The globe is two still
 *               half-heights across — cut by the frame on every side — and its
 *               lit part is the thin sliver along the limb: planet, night, space.
 *   horizon     low orbit. The camera flies a few units over the week's own
 *               ground and looks along the limb: the curved horizon and its
 *               atmosphere band across the lower third, space above it.
 *   telephoto   a long lens from far away: a narrow field of view, the air
 *               taking the pigment off the far limb, the week's whole reach
 *               flattened onto one disc inside the still.
 *   hero        the widest. The globe sits on a thirds point with the week's
 *               rings and companions composed around it, sized from the reach
 *               each companion carries itself (userData.reach, worlds/index.js).
 *   auto        the week chooses, in this file's own reading of it.
 *   crescent-hero, ember, cloudsea   three named hero looks for the showcase
 *               (see "hero looks" below): the crescent's night with the globe
 *               large and off the middle, a long lens across a lava week's
 *               terminator, and a landed frame (landedShot) with the runner small
 *               under a giant's moon. Never chosen by auto.
 *
 * A shot is the poster, not the orbit: base.js keeps it until the first drag or
 * zoom and then hands the ordinary orbit back (see endShot there). Nothing here
 * is live, random or time-dependent — the same week frames the same way on every
 * page, at every capture instants — and nothing here draws: a shot only decides
 * where the camera of a poster stands and what it looks along.
 */
import * as THREE from 'three';
import { crowned } from './bodies/star.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smoothstep = (t) => t * t * (3 - 2 * t);
const WORLD_UP = new THREE.Vector3(0, 1, 0);

// Scratch, in the order each is used: a function takes what it asks for and
// hands it back before anything else runs, so the same vectors serve every shot.
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const tmpE = new THREE.Vector3();
const probe = new THREE.Vector3();
const probeB = new THREE.Vector3();
const probeC = new THREE.Vector3();

/* ----------------------------------------------------------- geometry ----- */

/** The camera distance from the planet's centre at which a body of `radius`
 *  covers `share` of the still's half-height, `halfStill` being that half-height
 *  in radians. A silhouette at angle t from the axis is tan(t) out in the image,
 *  so the disc's own radius is exactly share of the still's — the fit base.js's
 *  craft.frame already uses, in the same tangent-plane convention. */
function spotDistance(radius, share, halfStill) {
  const want = Math.max(1e-4, share * Math.tan(halfStill));
  return radius * Math.sqrt(1 + want * want) / want;
}

/** The direction `i` of `count` laid over a globe by the golden spiral: the
 *  spread base.js's craft.frame weighs, so every week offers a shot its places
 *  to stand in the same order, and a shot is never two pictures for one week. */
function spiralDirection(i, count, out) {
  const y = 1 - (2 * (i + 0.5)) / count;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const a = i * Math.PI * (3 - Math.sqrt(5));
  return out.set(Math.cos(a) * r, y, Math.sin(a) * r);
}

/** A unit vector at right angles to `v`, whichever way `v` happens to point. */
function anyPerpendicular(v, out) {
  const ax = Math.abs(v.x), ay = Math.abs(v.y), az = Math.abs(v.z);
  const axis = ax <= ay && ax <= az ? tmpE.set(1, 0, 0)
    : ay <= az ? tmpE.set(0, 1, 0)
      : tmpE.set(0, 0, 1);
  return out.crossVectors(v, axis).normalize();
}

/** The world's own up as the image's: the one vertical a poster sheet has. A
 *  camera over a pole has no vertical to borrow, and gets any it can. */
function worldUp(dir, out) {
  out.copy(WORLD_UP).addScaledVector(dir, -WORLD_UP.dot(dir));
  if (out.lengthSq() < 1e-6) anyPerpendicular(dir, out);
  return out.normalize();
}

/** Turn a camera's up so that a direction `u` of its image plane (square to
 *  `dir`) sits `roll` radians clockwise from the image's up: the sun, or the
 *  limb, where the shot wants it rather than wherever the planet's axis leaves
 *  it. `up` starts as the image's up from the world's and is rolled about `dir`;
 *  three.js then builds the frame as x = up × dir, y = dir × x. */
function rollUp(up, dir, u, roll) {
  worldUp(dir, up);
  const right = tmpD.crossVectors(up, dir).normalize();
  const turn = roll - Math.atan2(u.dot(right), u.dot(up));
  up.multiplyScalar(Math.cos(turn)).addScaledVector(right, -Math.sin(turn));
  return up.normalize();
}

/** The direction `angle` radians from `dir` along the great circle through the
 *  tangent `along`: a step out over the sphere, which is how a shot reads the
 *  ground ahead of it. */
function stepOut(dir, along, angle, out) {
  return out.copy(dir).multiplyScalar(Math.cos(angle)).addScaledVector(along, Math.sin(angle));
}

/** How high a point of ground stands over the camera's own horizontal plane, in
 *  radians: the camera at `camR` along `camDir`, the point over `at`. A ground's
 *  horizon lies at minus its dip, so a point this far above is a hill in the way
 *  of the curve. */
function elevationOver(camDir, camR, at, height, R) {
  return Math.asin(clamp(probe.copy(at).multiplyScalar(R + height)
    .sub(probeB.copy(camDir).multiplyScalar(camR)).normalize().dot(camDir), -1, 1));
}

// A race ring that states no reach of its own is the 1.42 R the classic poster
// has always pulled back to for one (base.js's own RACE_RING_REACH, in the fit
// beside this): rings.js and rings-rubble.js promise 1.4 R and the newer styles
// spell the reach out. A poster that reads the ring as 1 would frame the globe
// alone and crop the ring the week is about.
const RACE_RING_REACH = 1.42;

/** How far the week's system reaches, in planet radii, and whether a race ring
 *  is what reaches: what a poster has to compose with. A companion says so
 *  itself — userData.reach (worlds/index.js, system.js) or the ring's own
 *  userData.ring.reach (rings.js) — and a race ring that says neither is
 *  RACE_RING_REACH. A week carrying no companion at all reaches 1: the globe
 *  alone. A race ring that names its own finish line (userData.ring.finish,
 *  see heroShot) is handed back as `finish`. */
function companionReach(scene) {
  let reach = 1, raceRing = false, finish = null;
  scene?.traverse?.((child) => {
    const name = String(child.name || '');
    const ring = name.startsWith('companion-race-ring');
    if (!ring && !name.startsWith('companion-system')) return;
    if (ring) raceRing = true;
    const user = child.userData || {};
    if (ring && Number(user.ring?.finish) > 0 && user.ring.axis?.length === 3) finish = user.ring;
    const said = Number(user.reach ?? user.ring?.reach ?? (ring ? RACE_RING_REACH : NaN));
    if (Number.isFinite(said) && said > reach) reach = said;
  });
  return { reach, raceRing, finish };
}

/* ----------------------------------------------------------- crescent ----- */

// The visible face's phase, as the sun's dot with the camera's own direction:
// cos(133°), well past the terminator. The camera stands on the week's night
// side, so the face it is looking at is the painted night and the lit limb is
// the thin crescent a young moon shows: from the shot's own distance (the eye
// sees the globe's near cap, not a hemisphere) 133° leaves a fifth of the
// silhouette's own radius lit at the crescent's widest.
const CRESCENT_PHASE = -0.68;
// The globe's silhouette, in still half-heights: 0.72, so the whole disc sits
// inside the still with the starfield round it — the dark silhouette, the lit
// limb, the night welded to it and the void are all in the picture, and the frame
// is not what is cutting the moon.
const CRESCENT_SHARE = 0.72;
// Where that sunward limb crosses the still: the view is turned off the disc's
// centre toward the sun, so the moon sits away from its light with the limb
// running across it — 0.5 half-heights of turn leaves the disc clear of the
// still's own edge on the sun's side.
const CRESCENT_EDGE = 0.5;
// ...and where the sun lies in the still, in radians clockwise from its up, so
// the lit limb runs the diagonal instead of sitting level across the sheet.
const CRESCENT_ROLL = 0.9;
// A crescent is a night: the wash the terminator dial lays on the dark side, and
// the air that gathers along the lit limb. A page may have both dials off (they
// are look dials, default 0), and a shot is still the picture it is named for, so
// the crescent asks for them while it is up and base.js puts the page's own
// numbers back when the shot is handed over (see setShotLook there). light.night
// is what makes the night a night: it takes the wash down to a deep one and lets
// the light stand where the sun really is, behind the world, so the lit face is
// the limb's own sliver. craft.values carries the picture's committed dark. All
// four are read per frame (ink.js update).
const CRESCENT_LOOK = { 'light.terminator': 1, 'light.night': 1, 'light.atmosphere': 1, 'craft.values': 1 };

/** The camera's direction for a phase: every direction the sun can be seen at
 *  `phase` (the sun's dot with it) from lies on one cone round the sun, and the
 *  camera takes the azimuth of the week's own subject, so the ground the classic
 *  poster would have shown is still the ground in the picture. */
function phaseDir(ctx, phase, out) {
  const { sun, subject } = ctx;
  const along = tmpA.copy(subject).addScaledVector(sun, -subject.dot(sun));
  if (along.lengthSq() < 0.04) anyPerpendicular(sun, along);
  along.normalize();
  const around = Math.sqrt(Math.max(0, 1 - phase * phase));
  return out.copy(sun).multiplyScalar(phase).addScaledVector(along, around).normalize();
}

function crescentShot(ctx) {
  const sun = ctx.sun;
  const dir = phaseDir(ctx, CRESCENT_PHASE, new THREE.Vector3());
  let halfStill = 0.3;
  return {
    id: 'crescent',
    dir,
    lens: null,
    look: CRESCENT_LOOK,
    fit(half) {
      halfStill = half;
      return spotDistance(ctx.R, CRESCENT_SHARE, half);
    },
    place(out, camDir) {
      // The way the sun lies in this frame: the way the lit limb runs.
      const limb = tmpB.copy(sun).addScaledVector(camDir, -sun.dot(camDir));
      if (limb.lengthSq() < 1e-6) return false; // the sun dead behind: no crescent to place
      limb.normalize();
      const radius = Math.atan(CRESCENT_SHARE * Math.tan(halfStill)); // the silhouette, in radians
      const turn = radius - CRESCENT_EDGE * halfStill; // ...to where the disc sits in the still
      out.view.copy(camDir).multiplyScalar(-Math.cos(turn)).addScaledVector(limb, Math.sin(turn));
      rollUp(out.up, camDir, limb, CRESCENT_ROLL);
      return true;
    },
  };
}

/* ------------------------------------------------------------ horizon ----- */

// How high the camera flies over the week's own ground, in units: high enough
// that the planet's own curve is the frame's subject — from here the limb falls
// well over a third of the way below level and sags across the still — and low
// enough that the ground the frame's bottom holds is the week's own ground a few
// tens of units out and still reads as ground rather than as a map. Higher and
// the limb's own band (the paper the ink style reserves along it, the snow and
// ice the relief carries) swells until the picture is a rim on a plate; lower and
// the curve flattens to a level line with the relief standing in front of it.
const HORIZON_ALT = 45;
// Where the horizon crosses the still, in half-heights from its centre: the
// lower third, the planet under it and space over it.
const HORIZON_AT = -0.333;
// How far the view turns off the sun's own tangent, so the ground ahead is lit
// from the side and a hill there carries a shadow toward the camera.
const HORIZON_AZIMUTH = 0.6;
// The directions a low shot may be taken from, and the arc each reads its ground
// over: near is the ground the frame's bottom holds, far is past the planet's own
// horizon, which from this altitude stands ~0.9 rad off (the tangent touches 108
// units away). A ridge between the camera and that horizon is the one thing this
// shot cannot have in it.
const HORIZON_CANDIDATES = 24;
const HORIZON_NEAR = 0.06;
const HORIZON_FAR = 1;
const HORIZON_READS = 14;
// The low frame the ring test scans, in radians: the crop's own half-height at
// the widest lens this shot is ever given (camera.fov's 45° default), and the
// grid of rays across it. The shot's own pitch is part of the test, so the rays
// are the frame itself and not a band near it.
const HORIZON_FRAME = 0.32;
const HORIZON_RAYS = 4;
// The air the shot is named for: light.atmosphere paints the band beyond the
// limb, and a page may have it off (it is a look dial, default 0). The horizon
// asks for it while it is up; base.js puts the page's own number back when the
// poster is handed over (see setShotLook there).
const HORIZON_LOOK = { 'light.atmosphere': 1 };

/** Do the rays from `eye` along `d` cross the annulus `ring` — its axis, and its
 *  inner and outer radius in units (userData.ring, rings.js)? A race ring reads
 *  from the ground as a band across the sky, and the band is a stripe over the
 *  horizon when the view runs along its own plane: the one thing a low shot of
 *  the week's own curve cannot have in it. */
function rayHitsRing(eye, d, ring) {
  const along = ring.axis.dot(d);
  if (Math.abs(along) < 1e-6) return false; // the ray never meets the plane
  const t = -ring.axis.dot(eye) / along;
  if (t <= 0) return false; // behind the camera
  const q = probeC.copy(eye).addScaledVector(d, t);
  const r2 = q.dot(q);
  return r2 >= ring.inner2 && r2 <= ring.outer2;
}

/** Every ring standing in this week's sky, as its own plane and radii: the race
 *  ring says so itself (rings.js), and a system's rings are named the same way. */
function companionRings(scene) {
  const rings = [];
  scene?.traverse?.((child) => {
    const said = child.userData?.ring;
    if (!said) return;
    const axis = new THREE.Vector3().fromArray(said.axis || []);
    const inner = Number(said.inner);
    const outer = Number(said.outer);
    if (axis.lengthSq() < 1e-9 || !(outer > inner) || outer <= 0) return;
    rings.push({ axis: axis.normalize(), inner2: inner * inner, outer2: outer * outer });
  });
  return rings;
}

function horizonShot(ctx) {
  const { R, sun, subject, features } = ctx;
  const sea = features.seaLevel;
  const rings = companionRings(ctx.scene);
  const runner = ctx.runner;
  const dir = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const cand = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const at = new THREE.Vector3();
  const eye = new THREE.Vector3();
  const ray = new THREE.Vector3();
  const view = new THREE.Vector3();
  const right = new THREE.Vector3();
  let best = -Infinity;
  for (let i = 0; i < HORIZON_CANDIDATES; i++) {
    spiralDirection(i, HORIZON_CANDIDATES, cand);
    // The way the sun lies round this point, and the way the camera would look
    // from it: the sun's own tangent, turned by the shot's azimuth.
    tangent.copy(sun).addScaledVector(cand, -sun.dot(cand));
    if (tangent.lengthSq() < 1e-9) continue;
    tangent.normalize();
    fwd.copy(tangent).multiplyScalar(Math.cos(HORIZON_AZIMUTH))
      .addScaledVector(tmpC.crossVectors(cand, tangent), Math.sin(HORIZON_AZIMUTH))
      .normalize();
    // What this camera would stand on, and where its horizon falls.
    const ground = features.heightAt(cand);
    const camR = R + Math.max(ground, sea) + HORIZON_ALT;
    const dip = Math.acos(clamp(R / camR, -1, 1));
    let land = 0, tall = 0, block = 0;
    for (let k = 1; k <= HORIZON_READS; k++) {
      const arc = HORIZON_NEAR + (HORIZON_FAR - HORIZON_NEAR) * (k / HORIZON_READS);
      stepOut(cand, fwd, arc, at);
      const h = features.heightAt(at);
      if (h > sea) land++;
      if (arc > HORIZON_FAR * 0.45) tall = Math.max(tall, h - sea);
      block = Math.max(block, elevationOver(cand, camR, at, h, R) + dip);
    }
    // What the frame's own bottom would hold, over a small grid of the near
    // ground: above the waterline or under it, and how uneven. A plain of one
    // tone under the frame reads as a plate no matter how well the curve above
    // it is drawn, so a direction that puts a coast — land and water both, or a
    // relief step — through the near ground is worth more than one that puts
    // three hundred units of the same wash across it.
    let nearLand = 0, nearN = 0, nearMin = Infinity, nearMax = -Infinity;
    for (let r = 1; r <= 3; r++) {
      for (let c = -1; c <= 1; c++) {
        const arc = HORIZON_NEAR * r;
        stepOut(cand, fwd, arc, at);
        if (c) at.applyAxisAngle(cand, c * 0.22).normalize();
        const h = features.heightAt(at);
        nearN++;
        if (h > sea) nearLand++;
        nearMin = Math.min(nearMin, h);
        nearMax = Math.max(nearMax, h);
      }
    }
    const nearMix = nearN ? nearLand / nearN : 0;
    // A coast (or a shore, or a step in the ground) is a mix; one wash is not.
    const coast = 4 * nearMix * (1 - nearMix) * 0.7 + clamp((nearMax - nearMin) / 8, 0, 1) * 0.3;
    // The week's own ground, reading well: land under the frame rather than open
    // water, a coast or a relief step through the near ground, a range standing
    // out at the limb, a low sun laying its light along the land, dry footing to
    // stand on.
    const sunElevation = Math.asin(clamp(sun.dot(cand), -1, 1));
    const content = 0.22 * (land / HORIZON_READS)
      + 0.24 * coast
      + 0.16 * clamp(tall / 14, 0, 1)
      + 0.24 * (1 - clamp(Math.abs(sunElevation - 0.55) / 0.55, 0, 1))
      + 0.14 * smoothstep(clamp((ground - sea - 0.6) / 3, 0, 1));
    // ...and the planet's own curve clear above it. A ridge standing in front of
    // the limb does not sit in the frame, it empties it — the sky and the curve
    // both go behind a hill — so this is a gate rather than a term: a clear
    // direction with ordinary ground beats a blocked one with a fine view, while
    // a week whose every direction is blocked still gets the best of them.
    // (block is the worst of the read ground, in radians above the planet's own
    // limb.)
    const clear = 1 - smoothstep(clamp(block / 0.05, 0, 1));
    let score = content * (0.15 + 0.85 * clear);
    // The frame this direction would be shot with: the view its own dip and
    // pitch give it (place()), its right, and the eye it is cast from. Both the
    // ring test and the runner test below read the picture itself.
    const pitch = dip + Math.atan(HORIZON_AT * Math.tan(HORIZON_FRAME));
    view.copy(fwd).multiplyScalar(Math.cos(pitch)).addScaledVector(cand, -Math.sin(pitch)).normalize();
    right.crossVectors(cand, view).normalize();
    eye.copy(cand).multiplyScalar(camR);
    // ...and no ring's band across it. A race week's own ring is a sky's width of
    // flat colour seen from just under it: run along its plane and it is one
    // straight stripe over the horizon, which reads as a road, not a world.
    if (rings.length) {
      const step = HORIZON_FRAME / HORIZON_RAYS;
      let crossed = 0, reads = 0;
      for (let a = -HORIZON_RAYS; a <= HORIZON_RAYS; a++) {
        for (let b = -HORIZON_RAYS; b <= HORIZON_RAYS; b++) {
          ray.copy(view).addScaledVector(right, a * step).addScaledVector(cand, b * step).normalize();
          reads++;
          for (const ring of rings) {
            if (rayHitsRing(eye, ray, ring)) { crossed++; break; }
          }
        }
      }
      score *= 1 - 0.9 * (crossed / reads);
    }
    // ...and the week's own runner, if he is in the frame at all: a figure far
    // enough out to be a speck and near enough to be a person, standing on the
    // ground rather than floating in the void — that little silhouette with the
    // limb under him is the only thing in the picture that says how big the
    // picture is. The shot is standing a few units from him only if he fills a
    // corner, and that is the one case it demotes.
    if (runner) {
      at.copy(runner).sub(eye);
      const far = at.length();
      at.divideScalar(far);
      const depth = at.dot(view);
      if (depth > 0) {
        const u = at.dot(right) / depth, v = at.dot(cand) / depth;
        const size = Math.atan(2 / Math.max(1, far)); // his own width on the sheet, radians
        const framed = Math.abs(u) <= HORIZON_FRAME && v < HORIZON_FRAME && v > -0.25;
        if (framed && size > 0.06) score *= 0.6;            // a blot, not a person
        else if (framed && size > 0.006) score *= 1.12;     // tiny, legible, and his own scale
      }
    }
    if (score > best) {
      best = score;
      dir.copy(cand);
      forward.copy(fwd);
    }
  }
  // No direction answered (a week whose sun sits on a candidate's pole): stand
  // where the classic poster would have and look along the sun's own tangent.
  if (best === -Infinity) {
    dir.copy(subject);
    tangent.copy(sun).addScaledVector(dir, -sun.dot(dir));
    if (tangent.lengthSq() < 1e-9) anyPerpendicular(dir, tangent);
    forward.copy(tangent).normalize();
  }
  let halfStill = 0.3;
  return {
    id: 'horizon',
    dir,
    lens: null,
    look: HORIZON_LOOK,
    fit(half) {
      halfStill = half;
      // The camera's own altitude, so what the frame holds does not depend on
      // the dials: the surface it stands over, plus the shot's own seven units.
      return R + Math.max(features.heightAt(dir), sea) + HORIZON_ALT;
    },
    place(out, camDir, position) {
      // The limb's own dip, read off the camera wherever the orbit has carried
      // it: the horizon is held a third up the still from any altitude.
      const radius = Math.max(R + 1e-3, position.length());
      const pitch = Math.acos(clamp(R / radius, -1, 1)) - Math.atan(-HORIZON_AT * Math.tan(halfStill));
      out.up.copy(position).normalize(); // the local up: the limb stays level
      const ahead = tmpB.copy(forward).addScaledVector(camDir, -forward.dot(camDir));
      if (ahead.lengthSq() < 1e-9) anyPerpendicular(camDir, ahead);
      ahead.normalize();
      out.view.copy(ahead).multiplyScalar(Math.cos(pitch)).addScaledVector(out.up, -Math.sin(pitch)).normalize();
      return true;
    },
  };
}

/* ---------------------------------------------------------- telephoto ----- */

// The long lens, in degrees: the floor of the glass this shot will use. A page
// that asks for a wider camera.fov keeps it: the dial is a cap.
const TELEPHOTO_LENS = 13;
// How much of the still the globe fills: more than all of it. The disc is cut by
// the still — the crop holds about seven tenths of it — so the picture reads as
// the world seen through a long lens rather than as another portrait of a whole
// globe with air round it, which is what the classic sheet already is. The limb
// then carries the painter's haze off the frame's own edge.
const TELEPHOTO_FILL = 1.19;
// Where the long lens may stand, in units from the centre: the far end of the
// painter's own range. The air begins to take the pigment out of the ground at
// ink.js's uFogBase (900 units) and has taken nearly all of it by 1230
// (inkAerial's span), so a world further off than this is one flat cream glaze
// with a limb on it — the haze the shot is for, and none of the week. A week
// whose disc will not fill the still from inside the range takes the longest
// glass the range allows and stands at the range: the flattening is the
// distance's, and the haze comes with it.
const TELEPHOTO_RANGE = 980;

function telephotoShot(ctx) {
  const dir = ctx.baseAim.clone();
  // The lens that stands the camera at the far end of the range with the globe
  // filling the still: the long glass, or the shorter one it takes — and what the
  // disc fills at any other distance is fit()'s answer. The crop is a share of the
  // still's short axis (base.js), so its half-height in angle is the frame's own
  // when the frame is taller than it is wide, and narrows with the aspect when the
  // page is a phone's.
  const short = Math.min(1, ctx.aspect || 1);
  const lensAt = (distance) => (360 / Math.PI) * Math.atan(
    Math.tan(Math.atan(ctx.R / (TELEPHOTO_FILL * distance))) / (ctx.crop * short),
  );
  let halfStill = 0.3;
  return {
    id: 'telephoto',
    dir,
    lens: Math.max(TELEPHOTO_LENS, lensAt(TELEPHOTO_RANGE)),
    fit(half) {
      halfStill = half;
      return Math.min(TELEPHOTO_RANGE, spotDistance(ctx.R, TELEPHOTO_FILL, half));
    },
    place(out, camDir) {
      out.view.copy(camDir).negate();
      worldUp(camDir, out.up);
      return true;
    },
  };
}

/* --------------------------------------------------------------- hero ----- */

// The week's whole reach as a share of the still, the globe's own floor and
// ceiling under it: a ring system wide enough is worth a small globe (a
// telescope's Saturn), but never so small that the week stops reading as a world.
const HERO_REACH_SHARE = 0.62;
const HERO_MIN_FILL = 0.22;
const HERO_MAX_FILL = 0.58;
// ...and the floor a race ring's own week keeps: a race is the week's hero, and
// its ring is the week's own monument, so the globe stays half the still and the
// ring sweeps out of one side of the frame rather than being fitted inside it —
// the ring is the week's scale, and a frame it cannot leave has no scale to give.
const HERO_RING_FILL = 0.5;
// Where the globe sits in the still, in half-heights from its centre: on a
// thirds point down and to the left, with the system's own sweep across the
// upper right and out to the frame.
const HERO_THIRDS = 0.333;
// A race ring that names its own finish line (userData.ring.finish: the solid
// ring's outer edge in units, with its plane's axis, the poster eye it chose on
// its lit face and the aim that puts base.js's camera there,
// rings-saturn-shader.js) is shot from that eye and framed whole: the poster
// stands as close as the finish line's own ellipse allows, kept this far inside
// the still's edge (in still half-heights), and the globe leaves the thirds
// point only as far as that ellipse needs it to. The dust past the finish line
// may run off the frame; the line itself may not.
const HERO_RING_MARGIN = 0.04;
const HERO_RING_POINTS = 64;
const heroEye = new THREE.Vector3();
const heroRight = new THREE.Vector3();
const heroUp = new THREE.Vector3();
const heroBox = { x0: 0, x1: 0, y0: 0, y1: 0 };

/** The finish line's own circle, as points in the world: the ring is centred on
 *  the globe, in the plane square to its axis. */
function finishPoints(ring) {
  const axis = new THREE.Vector3().fromArray(ring.axis).normalize();
  const u = anyPerpendicular(axis, new THREE.Vector3());
  const w = new THREE.Vector3().crossVectors(axis, u);
  return Array.from({ length: HERO_RING_POINTS }, (_, i) => {
    const a = (i / HERO_RING_POINTS) * Math.PI * 2;
    return u.clone().multiplyScalar(Math.cos(a) * ring.finish).addScaledVector(w, Math.sin(a) * ring.finish);
  });
}

/** The box the finish line and the globe's disc fill in a still `half` radians
 *  tall, seen from `eye` along `view` with `up` (the frame three.js builds from
 *  them), in still half-heights. */
function stillBox(points, eye, view, up, half, R) {
  const tanHalf = Math.tan(half);
  heroRight.crossVectors(view, up).normalize();
  heroUp.crossVectors(heroRight, view);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of points) {
    probe.copy(p).sub(eye);
    const depth = Math.max(1e-6, probe.dot(view));
    const x = probe.dot(heroRight) / depth / tanHalf, y = probe.dot(heroUp) / depth / tanHalf;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  probe.copy(eye).negate();
  const depth = Math.max(1e-6, probe.dot(view));
  const gx = probe.dot(heroRight) / depth / tanHalf, gy = probe.dot(heroUp) / depth / tanHalf;
  const gr = Math.tan(Math.asin(clamp(R / eye.length(), 0, 1))) / tanHalf;
  heroBox.x0 = Math.min(x0, gx - gr); heroBox.x1 = Math.max(x1, gx + gr);
  heroBox.y0 = Math.min(y0, gy - gr); heroBox.y1 = Math.max(y1, gy + gr);
  return heroBox;
}

/** How far up or right of the centre the view turns, in still half-heights: the
 *  thirds point, or as near it as keeps a box spanning lo..hi inside the still. */
function thirdsWithin(lo, hi, L) {
  return hi - L <= lo + L ? clamp(HERO_THIRDS, hi - L, lo + L) : (lo + hi) / 2;
}

/** Turn the poster at `eye` (out along `camDir`, the world's up its own) so the
 *  finish line and the globe sit inside the still: `view` leans up and right
 *  from the centre toward the thirds point by as much as the ring leaves room
 *  for. Answers how far past the still's edge the worst of them still is. */
function aimFinish(points, camDir, eye, half, R, up, view) {
  const L = 1 - HERO_RING_MARGIN;
  const tanHalf = Math.tan(half);
  worldUp(camDir, up);
  const right = tmpC.crossVectors(up, camDir).normalize();
  view.copy(camDir).negate();
  const b = stillBox(points, eye, view, up, half, R);
  let ax = thirdsWithin(b.x0, b.x1, L), ay = thirdsWithin(b.y0, b.y1, L), over = 0;
  for (let k = 0; ; k++) {
    view.copy(camDir).negate().addScaledVector(right, ax * tanHalf).addScaledVector(up, ay * tanHalf).normalize();
    const c = stillBox(points, eye, view, up, half, R);
    over = Math.max(0, c.x1 - L, -L - c.x0, c.y1 - L, -L - c.y0);
    const dx = c.x1 - c.x0 > 2 * L ? (c.x0 + c.x1) / 2 : Math.max(0, c.x1 - L) + Math.min(0, c.x0 + L);
    const dy = c.y1 - c.y0 > 2 * L ? (c.y0 + c.y1) / 2 : Math.max(0, c.y1 - L) + Math.min(0, c.y0 + L);
    if (k === 3 || (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4)) break;
    ax += dx;
    ay += dy;
  }
  return over;
}

function heroShot(ctx, info) {
  const named = info.finish?.aim?.length === 3 && info.finish?.camera?.length === 3;
  const dir = named ? new THREE.Vector3().fromArray(info.finish.aim).normalize() : ctx.baseAim.clone();
  const floor = info.raceRing ? HERO_RING_FILL : HERO_MIN_FILL;
  const fill = clamp(HERO_REACH_SHARE / info.reach, floor, HERO_MAX_FILL);
  // the finish line's own ellipse, seen from the eye the ring chose for it
  const finish = named ? finishPoints(info.finish) : null;
  const eyeDir = named ? new THREE.Vector3().fromArray(info.finish.camera).normalize() : dir;
  let halfStill = 0.3;
  return {
    id: 'hero',
    dir,
    lens: null,
    fit(half) {
      halfStill = half;
      if (!finish) return spotDistance(ctx.R, fill, half);
      // as close as the globe's own ceiling, then back until the line fits
      let dist = spotDistance(ctx.R, HERO_MAX_FILL, half);
      for (let k = 0; k < 16; k++) {
        const over = aimFinish(finish, eyeDir, heroEye.copy(eyeDir).multiplyScalar(dist), half, ctx.R, tmpA, tmpB);
        if (over <= 1e-3) break;
        dist *= 1 + over / (1 - HERO_RING_MARGIN);
      }
      return dist;
    },
    place(out, camDir, position) {
      if (finish) {
        aimFinish(finish, camDir, position, halfStill, ctx.R, out.up, out.view);
        return true;
      }
      worldUp(camDir, out.up);
      // The globe is pushed off the middle the way the frame is: the view turns
      // up and right along the image's own diagonal, so the globe lands low and
      // left of the middle, on the near thirds point, and the system takes the
      // upper right of the still.
      const turn = Math.atan(HERO_THIRDS * Math.SQRT2 * Math.tan(halfStill));
      const right = tmpC.crossVectors(out.up, camDir).normalize();
      const diagonal = tmpD.copy(out.up).add(right).normalize();
      out.view.copy(camDir).multiplyScalar(-Math.cos(turn)).addScaledVector(diagonal, Math.sin(turn)).normalize();
      return true;
    },
  };
}

/* --------------------------------------------------------- hero looks ----- */
// Three named looks for the showcase (poster.shot crescent-hero, ember, cloudsea).
// Each changes the framing, the camera and the phase only: never the week's own
// record, its features, its light or the companions it earned.

/** Turn the view off the globe's centre so the centre lands at (gx, gy) still
 *  half-heights, the image's own right and up as `up` makes them. */
function offCentre(out, camDir, gx, gy, halfStill) {
  const t = Math.tan(halfStill);
  const right = tmpC.crossVectors(out.up, camDir).normalize();
  const up = tmpD.crossVectors(camDir, right);
  out.view.copy(camDir).negate().addScaledVector(right, -gx * t).addScaledVector(up, -gy * t).normalize();
}

/** The frame's own aspect. base.js builds the poster's shot before its first
 *  resize, while the camera still holds the aspect it was made with (1), so the
 *  page's own window answers then. */
function frameAspect(ctx) {
  const a = Number(ctx.aspect) || 1;
  if (a !== 1) return a;
  const w = Number(globalThis.innerWidth) || 1, h = Number(globalThis.innerHeight) || 1;
  return w / h;
}

// crescent-hero: the crescent's own night — its phase, its roll, its look — with
// the globe pulled in to seven tenths of the frame's short side and pushed off the
// middle: down on a tall frame, so the ring crosses its sides under a quiet sky,
// and left on a wide one, so the lit arc of the ring takes the right half.
const CRESCENT_HERO_SHARE = 0.875;
const CRESCENT_HERO_TALL = [0, -0.62];   // the globe's centre in the still, half-heights
const CRESCENT_HERO_WIDE = [-0.62, -0.06];

function crescentHeroShot(ctx) {
  const sun = ctx.sun;
  const dir = phaseDir(ctx, CRESCENT_PHASE, new THREE.Vector3());
  const [gx, gy] = frameAspect(ctx) < 1 ? CRESCENT_HERO_TALL : CRESCENT_HERO_WIDE;
  let halfStill = 0.3;
  return {
    id: 'crescent-hero',
    dir,
    lens: null,
    look: CRESCENT_LOOK,
    fit(half) {
      halfStill = half;
      return spotDistance(ctx.R, CRESCENT_HERO_SHARE, half);
    },
    place(out, camDir) {
      const limb = tmpB.copy(sun).addScaledVector(camDir, -sun.dot(camDir));
      if (limb.lengthSq() < 1e-6) return false;
      rollUp(out.up, camDir, limb.normalize(), CRESCENT_ROLL);
      offCentre(out, camDir, gx, gy, halfStill);
      return true;
    },
  };
}

// ember: the long lens across the terminator. The camera stands ~95° from the
// week's own sun (the sun itself is never moved), so the real terminator crosses
// the disc and the fractures burn on its night side; the globe overfills the
// still a little, the light low on the left and the night up on the right.
const EMBER_PHASE = Math.cos((95 * Math.PI) / 180);
const EMBER_FILL = 1.36;
const EMBER_ROLL = 3.95;
const EMBER_LOOK = { 'light.terminator': 1, 'light.night': 0.85, 'craft.values': 1 };

function emberShot(ctx) {
  const sun = ctx.sun;
  const dir = phaseDir(ctx, EMBER_PHASE, new THREE.Vector3());
  const short = Math.min(1, frameAspect(ctx));
  const lens = (360 / Math.PI) * Math.atan(Math.tan(Math.atan(ctx.R / (EMBER_FILL * TELEPHOTO_RANGE))) / (ctx.crop * short));
  return {
    id: 'ember',
    dir,
    lens: Math.max(TELEPHOTO_LENS, lens),
    look: EMBER_LOOK,
    fit(half) {
      return Math.min(TELEPHOTO_RANGE, spotDistance(ctx.R, EMBER_FILL, half));
    },
    place(out, camDir) {
      out.view.copy(camDir).negate();
      const limb = tmpB.copy(sun).addScaledVector(camDir, -sun.dot(camDir));
      if (limb.lengthSq() < 1e-6) worldUp(camDir, out.up);
      else rollUp(out.up, camDir, limb.normalize(), EMBER_ROLL);
      return true;
    },
  };
}

// cloudsea: the one look that is not an orbit. The page opens on foot where the
// week's sun stands lowest while still up (the feature whose own up meets the
// sun nearest 0.15, about nine degrees: the bench's golden site), and the shot
// holds the camera there until the reader's first input: the runner small near
// the horizon left of the middle, the horizon level, the light over the camera's
// shoulder — and under a giant's deck its big moon over the right third, standing
// on the horizon. base.js hands the ordinary chase camera back on the first input
// and never changes it (landedLive there).
const CLOUDSEA_SUN = 0.15;
const CLOUDSEA_RUNNER = 0.075;   // his height, as a share of the frame's
const CLOUDSEA_TALL = 1.81;      // ...in units (runner.js)
const CLOUDSEA_LIFT = 4.5;       // the camera over his ground, units: a giant's sky is read from under ~6
const CLOUDSEA_X = -0.36;        // where he stands across the frame, half-widths
const CLOUDSEA_HORIZON = -0.1;   // where the horizon crosses it, half-heights
const CLOUDSEA_MOON = 0.333;     // where the moon stands across it, half-widths: the right third
const CLOUDSEA_LIGHT = 2.35;     // the view's bearing off the sun's, radians
const sea = Array.from({ length: 9 }, () => new THREE.Vector3());

/** The landed look a poster.shot value asks for, or null (every name but
 *  cloudsea). ctx = { name, features, sun, scene }. The answer is { id, site,
 *  place(out, feet, aspect, halfV) }: site is the feature base.js lands at, and
 *  place writes out.pos, out.look and out.up for the runner's feet at `feet`, a
 *  frame `aspect` wide and `halfV` radians half-tall. */
export function landedShot(ctx) {
  if (String(ctx.name || '') !== 'cloudsea') return null;
  const { features, sun, scene } = ctx;
  let site = null, off = Infinity;
  for (const f of features.list || []) {
    if (f.kind === 'monument' || !f.dir) continue;
    const o = Math.abs(f.dir.dot(sun) - CLOUDSEA_SUN);
    if (o < off) { off = o; site = f; }
  }
  if (!site) return null;
  const pos = new THREE.Vector3(), view = new THREE.Vector3(), first = new THREE.Vector3(), madeFor = new THREE.Vector3();
  let aspectWas = 0, halfWas = 0, ceiling;

  // The giant's sky (bodies/giant-shader.js createCeiling) hangs its moon off the
  // way the eye looked when it came under the deck. The shot looks along the bearing
  // that puts the moon over the right third for that first frame, and along its own
  // view from then on; the camera never moves, so the sky is never hung again.
  function compose(feet, aspect, halfV) {
    const [u, sunH, left, W, T, uc, right, upI, probe2] = sea;
    const tanV = Math.tan(halfV), tanH = tanV * aspect;
    const ground = feet.length();
    u.copy(feet).normalize();
    sunH.copy(sun).addScaledVector(u, -sun.dot(u));
    if (sunH.lengthSq() < 1e-8) anyPerpendicular(u, sunH);
    sunH.normalize();
    left.crossVectors(u, sunH);
    W.copy(sunH).multiplyScalar(Math.cos(CLOUDSEA_LIGHT)).addScaledVector(left, Math.sin(CLOUDSEA_LIGHT)).normalize();
    let alpha = Math.atan(-CLOUDSEA_X * tanH);
    let dist = CLOUDSEA_TALL / (CLOUDSEA_RUNNER * 2 * tanV);
    let pitch = 0;
    for (let k = 0; k < 5; k++) {
      // from the camera to him: the view's bearing turned left by alpha, and the
      // camera stood back that far along the ground, over his ground by the lift
      left.crossVectors(u, W);
      T.copy(W).multiplyScalar(Math.cos(alpha)).addScaledVector(left, Math.sin(alpha));
      const arc = dist / ground;
      uc.copy(u).multiplyScalar(Math.cos(arc)).addScaledVector(T, -Math.sin(arc)).normalize();
      pos.copy(uc).multiplyScalar(ground + CLOUDSEA_LIFT);
      // level: the bearing carried to the camera, pitched to set the horizon
      right.copy(W).addScaledVector(uc, -W.dot(uc)).normalize();
      pitch = -Math.acos(clamp(ground / pos.length(), -1, 1)) - Math.atan(CLOUDSEA_HORIZON * tanV);
      view.copy(right).multiplyScalar(Math.cos(pitch)).addScaledVector(uc, Math.sin(pitch)).normalize();
      // where he lands in that frame: correct the turn and the distance
      right.crossVectors(view, uc).normalize();
      upI.crossVectors(right, view);
      probe2.copy(feet).sub(pos);
      const df = probe2.dot(view), xf = probe2.dot(right) / df / tanH, yf = probe2.dot(upI) / df;
      probe2.copy(feet).addScaledVector(u, CLOUDSEA_TALL).sub(pos);
      const share = (probe2.dot(upI) / probe2.dot(view) - yf) / (2 * tanV);
      alpha += Math.atan((xf - CLOUDSEA_X) * tanH);
      dist *= clamp(share / CLOUDSEA_RUNNER, 0.5, 2);
    }
    // the first look: the bearing whose sky puts the moon over the right third
    first.copy(view);
    const moonAt = ceiling?.material?.uniforms?.uMoonAt?.value?.[0];
    if (moonAt && moonAt.z > 0) {
      const turn = Math.atan(CLOUDSEA_MOON * tanH) - moonAt.x;
      right.copy(view).addScaledVector(uc, -view.dot(uc)).normalize();
      upI.crossVectors(right, uc);   // the bearing's own right
      T.copy(right).multiplyScalar(Math.cos(turn)).addScaledVector(upI, Math.sin(turn));
      first.copy(T).multiplyScalar(Math.cos(pitch)).addScaledVector(uc, Math.sin(pitch)).normalize();
    }
  }

  return {
    id: 'cloudsea',
    site,
    place(out, feet, aspect, halfV) {
      if (ceiling === undefined) ceiling = scene?.getObjectByName?.('body-sky-ceiling') || null;
      if (madeFor.distanceToSquared(feet) > 1e-4 || aspect !== aspectWas || halfV !== halfWas) {
        madeFor.copy(feet);
        aspectWas = aspect;
        halfWas = halfV;
        compose(feet, aspect, halfV);
      }
      // until the deck's sky has been hung, look the way it should be hung
      const anchor = ceiling?.material?.uniforms?.uAnchor?.value;
      const look = anchor && anchor.lengthSq() < 0.5 ? first : view;
      out.pos.copy(pos);
      out.look.copy(pos).addScaledVector(look, 10);
      out.up.copy(pos).normalize();
      return true;
    },
  };
}

/* --------------------------------------------------------------- auto ----- */

/** How big the week is, 0 to 1: the volume it trained, the load it carried and
 *  the climbing it did, read off the week's own stats (worlds/index.js). The
 *  thresholds are the shelf's own weeks: a half marathon week is a big one, a
 *  three-hour week is not. */
function weekSize(stats) {
  const hours = Number(stats.hours) || 0;
  const load = Number(stats.load) || 0;
  const climb = Number(stats.climb) || 0;
  return clamp(0.5 * ((hours - 3.5) / 6) + 0.3 * ((load - 300) / 800) + 0.2 * (climb / 1000), 0, 1);
}

const AUTO_BIG = 0.7; // a week this size is a planet-scale week
const AUTO_LONG_RUN_KM = 30; // ...and a week with a near-marathon long run gets the long lens (at 18 km a dozen shelf weeks
// took it, and a shelf of cropped close-ups lost the read of a planet)

/** The shot a week asks for. A race is the week's own hero shot: its ring, its
 *  monument, the whole system round it. A body (a giant, a star, a marble…)
 *  frames itself through its own orbit.fill, and a crescent would hide the
 *  belts and storms it is drawn for, so it keeps that framing. A big rocky week
 *  is shown at planet scale as a crescent; a long-running week gets the long
 *  lens; a small week keeps the classic poster. The horizon is named-only: on
 *  the flatter weeks its low ground read as a dark plain. */
function autoShot(ctx, info) {
  const features = ctx.features;
  const stats = features.stats || {};
  const body = features.body?.id || 'rock';
  // the race week's crowned world (bodies/star.js crowned()) keeps the classic poster:
  // its crown is the race's mark, and its ring is muted
  if (features.monument || stats.race) return body === 'star' && crowned() ? null : heroShot(ctx, info);
  if (body !== 'rock') return null;
  if (weekSize(stats) >= AUTO_BIG) return crescentShot(ctx);
  if ((Number(stats.longRunKm) || 0) >= AUTO_LONG_RUN_KM) return telephotoShot(ctx);
  return null;
}

/* -------------------------------------------------------------- entry ----- */

/** The shot a poster.shot value asks for, or null for the classic framing — in
 *  which case base.js draws exactly what it always has.
 *
 *  ctx = { name, features, scene, sun, subject, baseAim, R }:
 *    name      the dial's value (params.js validates it: classic | crescent |
 *              horizon | telephoto | hero | crescent-hero | ember | cloudsea |
 *              auto); cloudsea is landed (landedShot) and frames no orbit
 *    features  readWeek's own reading of the week
 *    scene     the built scene, asked for the reach of the week's companions
 *    sun       the painted sun, one unit vector (uniforms.uSunDir)
 *    subject   the week's own subject on the globe, one unit vector
 *    baseAim   ...turned toward the sun by the classic offset: the aim the
 *              classic poster uses, and the one the wide shots start from
 *    R         the planet's radius (base.js's R)
 *    crop      the share of the still the shelf keeps, of its short axis (base.js
 *              POSTER_CROP, 0.8): what every shot composes inside
 *    runner    where the week's own runner stands now, one unit vector
 *    aspect    the camera's own aspect: what the crop's half-height is an angle
 *              of, on a page that is not square
 *
 *  The answer is { id, dir, lens, look, fit(halfStill), place(o, camDir, pos) }:
 *    dir       where the poster's camera stands, one unit vector from the centre
 *              (base.js reads its yaw and pitch from it)
 *    lens      the camera's own field of view in degrees, or null for the dial
 *    look      the dials the shot's own picture needs that the page may have
 *              down (e.g. crescent wants light.terminator), as { name: value };
 *              base.js raises them while the shot is live and puts the page's own
 *              numbers back when it is handed over (see setShotLook there)
 *    fit(hs)   the camera's distance from the centre for a still whose
 *              half-height is hs radians
 *    place(o, camDir, position)  writes o.up and o.view (the camera's up, and
 *              the unit direction its eye looks along, at the camera's own
 *              position); false leaves the ordinary orbit's look where it was.
 */
export function posterShot(ctx) {
  const name = String(ctx.name || 'classic');
  if (name === 'classic') return null;
  const info = companionReach(ctx.scene);
  if (name === 'crescent') return crescentShot(ctx);
  if (name === 'horizon') return horizonShot(ctx);
  if (name === 'telephoto') return telephotoShot(ctx);
  if (name === 'hero') return heroShot(ctx, info);
  if (name === 'auto') return autoShot(ctx, info);
  if (name === 'crescent-hero') return crescentHeroShot(ctx);
  if (name === 'ember') return emberShot(ctx);
  return null;
}

/* Planet Creator — the lava world's glow: the crust cracked open over its own
 * melt.
 *
 * Four things carry the glow, and all four are the same light in different
 * places:
 *
 *   the glow    the melt, laid in the ground's own shader as light the rock
 *               gives off (GROUND below, ink.js's body ground hook): the low
 *               ground where the melt pools, the hollows a river would have
 *               taken (read off the survey's own chart, four taps of it), the
 *               band the melt stands at along every shore, the joints the crust
 *               broke into as it cooled — two ridge fields, drawn at the scale
 *               that makes a crack a line two pixels wide on the poster instead
 *               of a spark — and a halo over each vent. It is added to the wash
 *               of exactly the rock the eye meets, brightest on the night side
 *               and carrying a little more of itself on the way down: a skin of
 *               glow a hand's width over the rock fought the ground and the sea
 *               for depth, and at a long lens's range lost, in a zipper of dark
 *               cuts along every shore.
 *
 *   the rivers  when the week's terrain cut real drainage (terrain.rivers), the
 *               channels are drawn along it: a thread of melt down each
 *               channel's own course, hot and pale where the channel is born and
 *               deepening as it gathers, sliding downstream on the clock. The
 *               line is the graph's own polyline, corner-cut twice so a channel
 *               reads as a river and not as the lattice it was found on.
 *
 *   the vents   the week's hard sessions (lava-crust.js), each a hole the crust
 *               opened at: a plume of melt standing off the ground, and a collar
 *               of light laid over the rock around it.
 *
 *   the crackle the glow's own noise is what makes a crack a crack; there is no
 *               geometry for it.
 *
 * On foot the glow gives way to the ground's own fissures (GROUND): the week's
 * rock taken down to basalt, the melt showing through it as fissures that run
 * out to the horizon, hottest along the glow's own rifts, and the race's road a
 * seam of melt. Nothing stands on that crust but the race's monument (props:
 * false), and the sky is the week's own smoke (giant-shader.js's ceiling, in
 * ash lit from under it) with one distant vent erupting on the horizon the
 * runner landed looking at (sky: true).
 *
 * Everything is deterministic (features.makeRng for the salts, the week's own
 * numbers for the sizes) and everything animates through uTime.
 */

import { ventSessions, heatOf } from './lava-crust.js';
import { createCeiling } from './giant-shader.js';
import { P } from '../params.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

const MAX_VENTS = 8;

/* ---------------------------------------------------------------- glsl ---- */

// The survey's own chart: longitude across, latitude down (ink.js's inkUV), so
// the glow reads the same chart the terrain is drawn from.
const CHART = `
vec2 lavaUV(vec3 d){
  return vec2(0.5 + atan(d.z, d.x) * 0.15915494, 0.5 - asin(clamp(d.y, -1.0, 1.0)) * 0.31830989);
}
float lvHash(vec3 p){
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float lvNoise(vec3 x){
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(lvHash(i), lvHash(i + vec3(1.0, 0.0, 0.0)), f.x),
                 mix(lvHash(i + vec3(0.0, 1.0, 0.0)), lvHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(lvHash(i + vec3(0.0, 0.0, 1.0)), lvHash(i + vec3(1.0, 0.0, 1.0)), f.x),
                 mix(lvHash(i + vec3(0.0, 1.0, 1.0)), lvHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float lvFbm(vec3 p){
  return 0.62 * lvNoise(p) + 0.38 * lvNoise(p * 2.13 + 7.3);
}
// A crack is where a ridge field crosses its own middle: a line, not a band.
// The sharpness is what the width of that line costs — a crack two pixels wide
// on the poster is a band wide enough to see and narrow enough to be a crack,
// and a field sampled at a higher frequency draws the same width thinner.
float lvCrack(vec3 d, float freq, float sharp){
  float n = lvFbm(d * freq);
  return smoothstep(sharp, 0.0, abs(n - 0.5));
}
`;

// The river's own line is already baked in world space (the graph's polyline,
// corner-cut and laid on the ground), so the vertex shader only carries it.
const RIVER_VERT = CHART + `
attribute float aAcross;
attribute float aSize;
attribute float aAlong;
attribute float aSeed;
varying float vAcross;
varying float vSize;
varying float vAlong;
varying float vSeed;
varying float vFar;
varying vec3 vDir;
void main(){
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  vAcross = aAcross;
  vSize = aSize;
  vAlong = aAlong;
  vSeed = aSeed;
  vDir = normalize(position);
  vFar = -view.z;
  gl_Position = projectionMatrix * view;
}
`;

const RIVER_FRAG = CHART + `
uniform vec3 uDeep, uMid, uSun;
uniform float uTime, uSurface, uGlow;
varying float vAcross;
varying float vSize;
varying float vAlong;
varying float vSeed;
varying float vFar;
varying vec3 vDir;
void main(){
  // across the thread: a hot core with the wash either side of it
  float core = pow(1.0 - clamp(abs(vAcross), 0.0, 1.0), 0.42);
  // downstream: the crust forms as it runs, so the source is the week's own
  // mineral and a gathered reach is nearly the deep — the pale of a blowing vent
  // belongs to the vent, and a river drawn in it reads as a bar of white light
  // lying on the ground
  float cool = clamp(vSize, 0.0, 1.0);
  vec3 c = mix(uMid, uDeep, smoothstep(0.0, 0.42, cool));
  // the melt slides: bands travelling downstream, on the clock
  float band = 0.70 + 0.30 * sin(vAlong * 0.55 - uTime * 1.35 + vSeed * 9.0);
  band *= 0.80 + 0.20 * lvNoise(vec3(vAlong * 0.22 - uTime * 0.5, vSeed * 3.0, vAcross * 1.4));
  float lit = max(0.0, dot(normalize(vDir), uSun));
  float night = 1.0 - smoothstep(-0.10, 0.55, lit);
  float haze = mix(1.0, 1.0 - smoothstep(90.0, 380.0, vFar), 0.85 * uSurface);
  float a = core * (0.62 + 0.38 * band) * mix(0.95, 1.35, night) * uGlow * haze * mix(0.95, 1.35, uSurface);
  gl_FragColor = vec4(c * a, 1.0);
}
`;

const PLUME_VERT = `
uniform float uVentFade[${MAX_VENTS}];
attribute float aT;
attribute float aAng;
attribute float aSeed;
attribute float aVent;
varying float vT;
varying vec2 vRing;
varying float vSeed;
varying float vFar;
varying float vFade;
void main(){
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  vT = aT;
  // the bearing round the column as a point on its own circle, so the noise
  // closes on itself where the ring of corners does instead of seaming there
  vRing = vec2(cos(aAng), sin(aAng));
  vSeed = aSeed;
  vFar = -view.z;
  // a vent the globe has turned away from is not standing in the sky: its own
  // plume and collar are put out before they can project past the limb
  float fade = 0.0;
  for (int i = 0; i < ${MAX_VENTS}; i++) { if (abs(aVent - float(i)) < 0.5) fade = uVentFade[i]; }
  vFade = fade;
  gl_Position = projectionMatrix * view;
}
`;

const PLUME_FRAG = CHART + `
uniform vec3 uDeep, uMid, uCore;
uniform float uTime, uGlow;
varying float vT;
varying vec2 vRing;
varying float vSeed;
varying float vFar;
varying float vFade;
void main(){
  // the column rises and cools: the bands travel up it on the clock, and the
  // column thins to nothing at its own top
  float up = vT;
  float bands = lvFbm(vec3(vRing.x * 1.7 + vSeed * 4.0, up * 3.4 - uTime * (0.85 + 0.5 * vSeed), vRing.y * 1.7 + vSeed * 2.0));
  float body = smoothstep(0.22, 0.95, bands) * pow(max(0.0, 1.0 - up), 1.35);
  float flicker = 0.70 + 0.30 * sin(uTime * (1.7 + 2.6 * vSeed) + vSeed * 11.0);
  vec3 c = mix(uCore, uMid, smoothstep(0.0, 0.30, up));
  c = mix(c, uDeep, smoothstep(0.35, 1.0, up));
  float a = body * flicker * uGlow * vFade * (1.0 - smoothstep(420.0, 900.0, vFar));
  gl_FragColor = vec4(c * a, 1.0);
}
`;

const COLLAR_VERT = `
uniform float uVentFade[${MAX_VENTS}];
attribute float aR;
attribute float aAng;
attribute float aSeed;
attribute float aVent;
varying float vR;
varying vec2 vRing;
varying float vSeed;
varying float vFade;
void main(){
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  vR = aR;
  vRing = vec2(cos(aAng), sin(aAng)); // as the plume's (see PLUME_VERT)
  vSeed = aSeed;
  float fade = 0.0;
  for (int i = 0; i < ${MAX_VENTS}; i++) { if (abs(aVent - float(i)) < 0.5) fade = uVentFade[i]; }
  vFade = fade;
  gl_Position = projectionMatrix * view;
}
`;

const COLLAR_FRAG = CHART + `
uniform vec3 uMid, uCore;
uniform float uTime, uGlow, uSurface;
varying float vR;
varying vec2 vRing;
varying float vSeed;
varying float vFade;
void main(){
  // the ring of scorched rock round the hole: brightest at the mouth, gone by
  // the collar's rim, mottled so it is a burn and not a disc
  float mottle = 0.72 + 0.28 * lvFbm(vec3(vRing.x * 1.4 + vSeed * 5.0, vR * 2.6, vRing.y * 1.4 + vSeed * 3.0 + uTime * 0.12));
  float a = pow(max(0.0, 1.0 - vR), 2.1) * mottle * uGlow * vFade * mix(0.95, 1.30, uSurface);
  vec3 c = mix(uCore, uMid, smoothstep(0.0, 0.45, vR));
  gl_FragColor = vec4(c * a, 1.0);
}
`;

// The crust, laid inside the terrain's own shader (ink.js's body ground hook:
// the ground's last word, so nothing standing on the ground is ever painted
// with it).
//
// From orbit it is the glow (lvGlow): light the rock gives off, added to the
// wash of exactly the rock the eye meets — the low ground where the melt pools,
// the hollows a river would have taken, the band the melt stands at along every
// shore, the joints the crust broke into, a halo over each vent. It is read off
// the survey's own chart, as the terrain is, so it can never stand off the rock
// or be cut by it.
//
// On foot the week's rock is taken down to basalt, and the melt shows through
// it as fissures: long breaks running out along the landing's own bearing to
// the horizon, where the sky's vent is erupting, and the joints the crust
// crazed into between them — both hottest along the glow's own rifts (the
// cracks the orbit shows, read at the same scale, so the ground a runner stands
// on is the country seen from above). The race's own road is a seam of melt,
// and the far crust goes into the ember-lit smoke.
const GROUND = CHART + `
uniform vec3 uLvDeep, uLvMid, uLvCore, uLvAir;
uniform vec3 uLvHot;       // the pale of a blowing vent, as the glow from orbit wears it
uniform vec3 uLvF, uLvS;   // the long breaks' own bearing over the ground, and across it
uniform vec4 uLvVents[${MAX_VENTS}];
uniform int uLvVentN;
uniform float uLvGlow;     // how hard the glow burns (the week's heat)
uniform float uLvScale;    // how much of the melt reaches the joints (the week's heat)
uniform vec2 uLvTexel;     // one texel of the survey's chart
uniform float uLvFrac;     // lava.fractures (see lvGlow)
// A joint read from close in. The poster's band (lvCrack) is a ridge of the
// field a couple of pixels wide on the disc, and from a few tens of units up the
// same band is a smear of glow units across. There (closeK) the joint is drawn
// as the line itself: its distance from the field's own level set, read off the
// field's slope, so it keeps one width on the ground wherever the field runs
// flat (a band cut on a flat field would be a disc) — a hot thread w radians
// across in a narrow ember lip, crisp at the pixel (px: radians a pixel).
float lvCrackNear(vec3 d, float freq, float sharp, float w, float closeK, float px){
  float n = lvFbm(d * freq);
  float a = abs(n - 0.5);
  float soft = smoothstep(sharp, 0.0, a);
  float dist = a * px / max(fwidth(n), 1e-6);
  float core = 1.0 - smoothstep(w - px, w + px, dist);
  float lip = 1.0 - smoothstep(0.0, 4.0 * w, dist);
  return mix(soft, max(core, 0.45 * lip * lip), closeK);
}
// The glow at a direction (far: the eye's own depth there; fp: the world size of
// one pixel there), as light added to the wash.
vec3 lvGlow(vec3 d, float far, float fp){
  float px = max(length(fwidth(d)), 1e-6);
  // from close orbit the joints are drawn as lines, not as the poster's bands
  // (see lvCrackNear). lava.fractures: close is read off the size the ground
  // stands at on the screen and not off the eye's distance alone, because a long
  // lens from far off makes a close picture
  float closeK = mix(1.0 - smoothstep(40.0, 160.0, far), 1.0 - smoothstep(0.35, 0.80, fp), uLvFrac);
  vec2 uv = lavaUV(d);
  float land = texture2D(tLand, uv).r;
  // The ground's own form, off four taps of the chart: hollow ground is ground
  // a river would have taken, and the steeper the hollow the more surely.
  float hE = texture2D(tLand, uv + vec2(uLvTexel.x, 0.0)).r;
  float hW = texture2D(tLand, uv - vec2(uLvTexel.x, 0.0)).r;
  float hN = texture2D(tLand, uv + vec2(0.0, uLvTexel.y)).r;
  float hS = texture2D(tLand, uv - vec2(0.0, uLvTexel.y)).r;
  float hollow = (hE + hW + hN + hS) * 0.25 - land;
  float slope = max(abs(hE - hW), abs(hN - hS));
  // The joints the crust broke into on cooling, and the branches off them. Both
  // are ridge lines, so both are lines and not areas; the frequency sets how
  // big the plates are and the sharpness how wide the melt in the joint reads,
  // and it is the grain along a joint that makes it a chain of hot reaches
  // instead of an even pen stroke.
  float crazed = smoothstep(0.30, 0.74, lvNoise(d * 2.3 + 11.0));
  float grain = 0.42 + 0.72 * smoothstep(0.24, 0.78, lvFbm(d * 8.0 + 23.0));
  // Two pixels on the poster is what a crack has to be to be a crack, and a line
  // is only that wide if the field is read at the scale the plates actually
  // broke at: a joint field at 2.2 draws bands a little under two units across
  // on a hundred-and-twenty-unit globe, which is a little under two pixels at
  // the poster's own size. Read at 3.3 with the same sharpness the same lines
  // come out at six tenths of a pixel and alias into sparks.
  float plate = lvCrackNear(d, 2.2, 0.090, 0.005, closeK, px) * grain;
  float branch = lvCrackNear(d, 4.8, 0.045, 0.003, closeK, px) * (0.30 + 0.70 * crazed) * grain * 0.55;
  float joint = plate + branch;
  // The ground the melt can reach: the low country, and the hollows a river took
  float low = 1.0 - smoothstep(-0.5, 4.5, land);
  float reach = 0.44 + 0.56 * low;
  float crack = joint * reach;
  float gather = smoothstep(0.01, 0.26, hollow - 0.20 * slope) * (0.34 + 0.66 * low);
  // where the melt stands, along every shore (the rock the eye meets is above
  // the sea, so this is the shore's landward side)
  float shore = exp(-abs(land + 1.4) / 1.9);
  // live country, and country that has crusted over for good
  float field = 0.30 + 0.70 * smoothstep(0.34, 0.84, lvFbm(d * 1.7 + 41.0));
  // the lowest ground is not black rock with lines on it: it is where the melt
  // has pooled and gone on working, so it carries a low heat of its own — but
  // it is a pool and not a printed area, so it is broken by its own grain and
  // never laid down flat
  float poolGrain = 0.42 + 0.86 * lvNoise(d * 5.2 + 61.0);
  float pooled = low * low * 0.06 * field * poolGrain;
  // lava.fractures: where the joints are drawn as lines the soft terms give way
  // to them (a broad stain beside a fine fracture is what the long lens shows
  // up), and the joints themselves burn unevenly: most reaches hold the week's
  // mineral, and only a few flare to the pale of the melt
  float softK = mix(1.0, 0.35, closeK * uLvFrac);
  float flare = mix(1.0, 0.62 + 0.70 * smoothstep(0.55, 0.85, lvNoise(d * 6.0 + 131.0)), uLvFrac);
  // The seams are the picture and everything else is accompaniment. The shore
  // band and the hollows are true to the ground, but at equal weight they are
  // broad soft stains that carry more light than the joints do, and a lava world
  // read as a stain has no crust in it — so the joints lead by a factor of two
  // and the soft terms stay well under them.
  float hot = (crack * 1.60 * flare + (gather * 0.30 + shore * 0.70) * softK) * field + pooled * softK;
  // the vents: a hot core with its own halo, one per hard session. The core is a
  // mouth and not a lamp: it is small, it is broken along its own length by the
  // same grain the seams are, and it is kept well under the brightest seam, so
  // that a vent seen down its own axis reads as a place the ground opened rather
  // than as a round white blob sitting on the globe.
  for (int i = 0; i < ${MAX_VENTS}; i++) {
    if (i >= uLvVentN) break;
    float ang = acos(clamp(dot(d, uLvVents[i].xyz), -1.0, 1.0));
    float core = exp(-ang * ang / 0.0016);
    float halo = exp(-ang * ang / 0.020);
    float torn = 0.52 + 0.48 * smoothstep(0.30, 0.74, lvNoise(d * 11.0 + uLvVents[i].xyz * 9.0));
    hot += uLvVents[i].w * (core * 0.78 * torn + 0.40 * halo * softK);
  }
  hot *= uLvScale;
  // the melt's own temperature: the rock's own dark where it only remembers the
  // heat, the week's mineral where it is working, the pale of a blowing vent in
  // the hottest cores
  float k = clamp(hot, 0.0, 1.6);
  // a seam has a hot centre and a narrow ember margin: the deep ember holds the
  // whole of the joint and the week's mineral only arrives past three quarters
  // of the field, so a crack is a bright line inside a darker one rather than an
  // even smear of orange with the same width all the way out
  vec3 c = mix(uLvDeep, uLvMid, smoothstep(0.06, 0.66, k));
  c = mix(c, uLvHot, smoothstep(0.86, 1.35, k));
  // the night side is where the crust is read by its own light — but the whole
  // of a lava world is night enough that the breaks carry the picture
  float lit = max(0.0, dot(d, uLight));
  float night = 1.0 - smoothstep(-0.10, 0.55, lit);
  float bright = mix(0.90, 1.36, night);
  // a breath in it, so the crust is alive and not a decal — a travelling phase
  // and not a noise field, because the glow is drawn over a third of the frame
  float breath = 0.86 + 0.14 * sin(uTime * 0.85 + dot(d, vec3(7.0, 11.0, 13.0)));
  // on the way down the ash takes the far glow before the horizon does, and the
  // near ground is read from close in, where a centimetre of crust fills the
  // eye — so the glow carries more of itself there than it does across a disc
  float haze = mix(1.0, 1.0 - smoothstep(140.0, 620.0, far), 0.80 * uSurface);
  float near = mix(1.0, 1.50, uSurface);
  // …until the eye is down on the crust, where the ground's own fissures are
  // the melt (bodyGround, below)
  float a = pow(k, 1.02) * uLvGlow * bright * breath * haze * near * (1.0 - smoothstep(0.60, 0.95, uSurface));
  return c * a;
}
// a break is a level set of its field, w wide in the field's own units: hottest
// on its own line and cooling to its lips, kept a pixel wide at least and
// fading as it narrows past one, so a fissure thins into a thread toward the
// horizon instead of breaking into sparks
float lvSeam(float n, float w){
  float fw = fwidth(n);
  return (1.0 - smoothstep(0.0, w + fw, abs(n - 0.5))) * pow(clamp(w / max(fw, 1e-6), 0.0, 1.0), 0.6);
}
vec3 bodyGround(vec3 c, vec3 dW, vec3 n, vec3 V, float dist, float fp, float tooth, float sunSh){
  // the glow, from orbit and on the way down, added over whatever the ground is
  // (the eye's own depth is the fragment's w: a perspective camera's clip w is
  // its view depth)
  vec3 glow = vec3(0.0);
  if (uSurface < 0.95) glow = lvGlow(dW, 1.0 / gl_FragCoord.w, fp);
  if (uSurface <= 0.001) return c + glow;
  // the rifts the orbit shows: the glow's own joints, at the glow's own scale
  float rift = lvCrack(dW, 2.2, 0.09) * (0.42 + 0.72 * smoothstep(0.24, 0.78, lvFbm(dW * 8.0 + 23.0)));
  // basalt: the ink's own wash taken down toward black, its lit planes a glint
  // of warm grey and its shade the dark of the sheet
  vec3 col = mix(uDark, c, 0.34);
  // the long breaks: a field stretched along the bearing, so its level set runs
  // out to the horizon, wandering as it goes; a break is open along some of
  // its length and crusted shut along the rest
  vec2 q = vec2(dot(vW, uLvF), dot(vW, uLvS));
  float wob = (lvFbm(vec3(q * 0.05, 5.0)) - 0.5) * 6.0;
  float nL = lvFbm(vec3(q.x * 0.016, (q.y + wob) * 0.12, 17.0));
  float open = smoothstep(0.42, 0.54, lvNoise(vec3(q.x * 0.012, q.y * 0.05, 29.0)) + rift * 0.5);
  float longF = lvSeam(nL, 0.020) * open;
  // the joints between them: the crust crazed as it cooled, dimmer, and hotter
  // where a rift runs
  float joint = lvSeam(lvFbm(vW * 0.23 + 3.0), 0.012) * (0.25 + 0.75 * rift) * 0.70;
  // the race's own road: one narrow seam of melt down the middle of it,
  // crusted over here and there where the brush skipped
  float road = (1.0 - smoothstep(0.0, 0.20 + fp, vRace)) * smoothstep(0.30, 0.50, lvNoise(vW * 0.45 + 41.0)) * 0.85;
  float hot = max(max(longF, joint), road);
  // the crust beside an open break is lit by it
  float halo = (1.0 - smoothstep(0.0, 0.10, abs(nL - 0.5))) * open * 0.40 + rift * 0.25;
  // the vents: where a hard session opened the crust, a mouth of melt with the
  // rock round it scorched by its light
  for (int i = 0; i < ${MAX_VENTS}; i++) {
    if (i >= uLvVentN) break;
    float at = acos(clamp(dot(dW, uLvVents[i].xyz), -1.0, 1.0)) * 120.0;
    float burn = uLvVents[i].w;
    hot = max(hot, (1.0 - smoothstep(0.5, 1.4 + 1.6 * burn, at)) * (0.75 + 0.25 * lvNoise(vW * 0.8 + 7.0)));
    halo += (1.0 - smoothstep(1.0, 5.0 + 7.0 * burn, at)) * (0.30 + 0.40 * burn);
  }
  col = mix(col, uLvDeep, clamp(halo, 0.0, 1.0) * 0.60);
  // a seam is a bright line inside a darker one: the ember at its lips, the
  // week's mineral in its body, and the pale of the melt itself on its line
  col = mix(col, uLvDeep, smoothstep(0.0, 0.25, hot));
  col = mix(col, uLvMid, smoothstep(0.15, 0.55, hot));
  col = mix(col, uLvCore, smoothstep(0.62, 0.95, hot) * 0.85);
  // the far crust goes into the smoke the sky is lit in
  col = mix(col, uLvAir, smoothstep(30.0, 110.0, dist) * 0.55);
  return mix(c, col, uSurface) + glow;
}
`;

/* ------------------------------------------------------------- helpers ---- */

/** Corner-cut a polyline: two passes of the four-point scheme, which is what
 *  turns the drainage graph's own one-edge turns into a course. */
function smoothPath(points, passes) {
  let path = points;
  for (let pass = 0; pass < passes; pass++) {
    const next = [path[0]];
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25, a[2] * 0.75 + b[2] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75, a[2] * 0.25 + b[2] * 0.75]);
    }
    next.push(path[path.length - 1]);
    path = next;
  }
  return path;
}

/** The rivers: a thread of melt down every channel the week's drainage found. */
function riverGeometry(T, features, rng) {
  const dr = features.drainage;
  if (!dr || !dr.channels?.length) return null;
  const { positions, next, halfWidth, acc, minArea, maxAcc } = dr;
  const upstream = new Map();   // node → how many channel nodes flow into it
  const isChannel = new Set();
  for (let k = 0; k < dr.channels.length; k++) isChannel.add(dr.channels[k]);
  for (const i of isChannel) {
    const j = next[i];
    if (j >= 0) upstream.set(j, (upstream.get(j) || 0) + 1);
  }
  const span = Math.log(Math.max(2, maxAcc / Math.max(minArea, 1e-6)));
  const sizeOf = (i) => (maxAcc > 0 ? clamp(Math.log(Math.max(acc[i], minArea) / minArea) / span, 0, 1) : 0);
  const pointOf = (i, out) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];

  const pos = [], along = [], size = [], across = [], seed = [], index = [];
  const d = new T.Vector3(), e = new T.Vector3();
  const vertical = new T.Vector3(0, 1, 0);
  let base = 0;
  for (const root of isChannel) {
    if ((upstream.get(root) || 0) > 0) continue;   // a source: nothing flows into it
    // walk the channel to the sea
    const path = [];
    const widths = [];
    const sizes = [];
    let node = root, guard = 0;
    while (node >= 0 && isChannel.has(node) && guard++ < 4096) {
      path.push(pointOf(node));
      // the graph's own half width is a valley's, not a river's: a river of melt
      // down the middle of it reads from the poster at three times the graph's
      // own reach, and never thinner than a thread wide enough to be seen at all
      widths.push(Math.max(1.7, (halfWidth[node] || 0.4) * 3.0));
      sizes.push(sizeOf(node));
      node = next[node];
    }
    if (path.length < 2) continue;
    // A course has to thin to nothing at both of its own ends. A ribbon cut off
    // square reads as a bar of light laid on the ground — a blunt bright end at
    // the source and a blunt one at the sea — and there is no reading of that as
    // water. The last reach and the first taper out over a few nodes instead.
    {
      const n = widths.length;
      const ramp = Math.max(1, Math.min(6, Math.floor(n / 5)));
      for (let i = 0; i < ramp; i++) {
        const t = (i + 1) / (ramp + 1);
        widths[i] *= t;
        widths[n - 1 - i] *= t;
      }
    }
    const smooth = smoothPath(path, 2);
    const n = smooth.length;
    // the arc (for the melt's own travel), the width and the size at every
    // corner-cut point, read back along the path's own parameter
    const seedv = rng();
    const dirs = [];
    const widthsAt = [];
    const sizesAt = [];
    const alongAt = [];
    let arc = 0;
    for (let k = 0; k < n; k++) {
      const last = path.length - 1;
      const t = (k / (n - 1)) * last;
      const i0 = Math.min(last, Math.floor(t));
      const i1 = Math.min(last, i0 + 1);
      const f = t - i0;
      d.set(smooth[k][0], smooth[k][1], smooth[k][2]).normalize();
      if (k > 0) arc += dirs[k - 1].distanceTo(d) * features.radius;
      dirs.push(d.clone());
      alongAt.push(arc);
      widthsAt.push(widths[i0] * (1 - f) + widths[i1] * f);
      sizesAt.push(sizes[i0] * (1 - f) + sizes[i1] * f);
    }
    for (let k = 0; k < n; k++) {
      const here = dirs[k];
      // the width runs along the sphere: perpendicular to the course and to the
      // ground it is laid on
      const prev = dirs[Math.max(0, k - 1)];
      const ahead = dirs[Math.min(n - 1, k + 1)];
      e.set(ahead.x - prev.x, ahead.y - prev.y, ahead.z - prev.z);
      if (e.lengthSq() < 1e-9) e.copy(here);
      e.normalize();
      const side = new T.Vector3().crossVectors(e, here);
      if (!Number.isFinite(side.x) || side.lengthSq() < 1e-6) side.crossVectors(here, vertical);
      side.normalize();
      const w = widthsAt[k];
      const y = features.radius + features.heightAt(here) + 0.45;
      pos.push(
        here.x * y + side.x * w, here.y * y + side.y * w, here.z * y + side.z * w,
        here.x * y - side.x * w, here.y * y - side.y * w, here.z * y - side.z * w,
      );
      along.push(alongAt[k], alongAt[k]);
      size.push(sizesAt[k], sizesAt[k]);
      across.push(1, -1);
      seed.push(seedv, seedv);
    }
    for (let k = 0; k < n - 1; k++) {
      const a = base + k * 2;
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    base += n * 2;
  }
  if (!pos.length) return null;
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aAlong', new T.Float32BufferAttribute(along, 1));
  geo.setAttribute('aSize', new T.Float32BufferAttribute(size, 1));
  geo.setAttribute('aAcross', new T.Float32BufferAttribute(across, 1));
  geo.setAttribute('aSeed', new T.Float32BufferAttribute(seed, 1));
  geo.setIndex(index);
  return geo;
}

/** Fold one vent part's attributes into the merged arrays the body is drawn
 *  from, offsetting its indices into the merged vertex list. */
function append(target, geo) {
  const base = target.pos.length / 3;
  const names = { position: 'pos', aT: 't', aR: 'r', aAng: 'ang', aSeed: 'seed', aVent: 'vent' };
  for (const [name, key] of Object.entries(names)) {
    const attr = geo.attributes[name];
    if (!attr || !target[key]) continue;
    for (let i = 0; i < attr.array.length; i++) target[key].push(attr.array[i]);
  }
  const index = geo.index.array;
  for (let i = 0; i < index.length; i++) target.index.push(index[i] + base);
  geo.dispose();
}

/** One vent's plume: a cone of melt standing off the mouth, its walls built in
 *  world space so the shader has only a texture-less column to paint. */
function plumeGeometry(T, base, up, burn, segs, rings, rng, vent) {
  const east = new T.Vector3().crossVectors(up, Math.abs(up.y) > 0.9 ? new T.Vector3(1, 0, 0) : new T.Vector3(0, 1, 0)).normalize();
  const north = new T.Vector3().crossVectors(up, east).normalize();
  // A vent is a mouth and not a chimney: the column is kept low and broad, so
  // that a vent near the rim throws a mound of light on its own country and
  // never a spike into the sky beside the planet.
  const height = 2.8 + 7.0 * burn;
  const rBase = 2.1 + 3.4 * burn;
  const p = new T.Vector3(), radial = new T.Vector3();
  const pos = [], aT = [], aAng = [], aSeed = [], aVent = [], index = [];
  let vi = 0;
  // one seed for the whole column: a seed drawn per corner is interpolated across
  // every facet, which from close in tiles the plume into a faceted ball (the
  // draws are still taken per corner, so every later draw is the one it was)
  let seed = -1;
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    const r = rBase * (1.0 - 0.58 * t * t);
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      radial.copy(east).multiplyScalar(Math.cos(a)).addScaledVector(north, Math.sin(a));
      p.copy(base).addScaledVector(up, height * t).addScaledVector(radial, r);
      pos.push(p.x, p.y, p.z);
      const s = rng();
      if (seed < 0) seed = s;
      aT.push(t); aAng.push(a); aSeed.push(seed); aVent.push(vent);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < segs; i++) {
      const a = vi + j * (segs + 1) + i, b = a + segs + 1;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aT', new T.Float32BufferAttribute(aT, 1));
  geo.setAttribute('aAng', new T.Float32BufferAttribute(aAng, 1));
  geo.setAttribute('aSeed', new T.Float32BufferAttribute(aSeed, 1));
  geo.setAttribute('aVent', new T.Float32BufferAttribute(aVent, 1));
  geo.setIndex(index);
  return geo;
}

/** One vent's collar: the ring of scorched rock round the mouth, laid on the
 *  ground the terrain actually has (each ring reads its own height). */
function collarGeometry(T, features, base, up, burn, segs, rng, vent) {
  const east = new T.Vector3().crossVectors(up, Math.abs(up.y) > 0.9 ? new T.Vector3(1, 0, 0) : new T.Vector3(0, 1, 0)).normalize();
  const north = new T.Vector3().crossVectors(up, east).normalize();
  const reach = 3.2 + 8.5 * burn;
  const d = new T.Vector3();
  const pos = [], aR = [], aAng = [], aSeed = [], aVent = [], index = [];
  const rings = [0.0, 0.34, 0.68, 1.0];
  // one seed for the whole burn, as for the plume (see plumeGeometry)
  let seed = -1;
  for (let j = 0; j < rings.length; j++) {
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      if (j === 0) d.copy(base).normalize();
      // the collar's radii are world units, so they are stepped off the mouth's
      // own position and not off its direction: a step of twelve units on a
      // hundred-and-twenty unit sphere is six degrees of ground, not eighty
      else d.copy(base).addScaledVector(east, Math.cos(a) * reach * rings[j]).addScaledVector(north, Math.sin(a) * reach * rings[j]).normalize();
      const y = features.radius + features.heightAt(d) + 0.22 + 0.05 * rings[j];
      pos.push(d.x * y, d.y * y, d.z * y);
      const s = rng();
      if (seed < 0) seed = s;
      aR.push(rings[j]); aAng.push(a); aSeed.push(seed); aVent.push(vent);
    }
  }
  const ring = segs;
  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * ring + i, b = j * ring + ((i + 1) % segs), c = a + ring, e2 = b + ring;
      index.push(a, c, b, b, c, e2);
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aR', new T.Float32BufferAttribute(aR, 1));
  geo.setAttribute('aAng', new T.Float32BufferAttribute(aAng, 1));
  geo.setAttribute('aSeed', new T.Float32BufferAttribute(aSeed, 1));
  geo.setAttribute('aVent', new T.Float32BufferAttribute(aVent, 1));
  geo.setIndex(index);
  return geo;
}

/* ------------------------------------------------------------------ body ---- */

/** The week's glow, as the objects a body stands in the scene. */
export function createLavaFlow(shared) {
  const { THREE: T, features, uniforms, light, R, colors, survey } = shared;
  const group = new T.Group();
  group.name = 'body-lava';
  const rng = features.makeRng('lava-flow');
  const heat = heatOf(features);
  const glow = 0.95 + 0.65 * heat;
  // one texel of the survey's chart the glow reads (GROUND), as the ink style baked it
  const texel = new T.Vector2(1 / (survey?.land?.image?.width || 640), 1 / (survey?.land?.image?.height || 320));
  const inkC = colors?.uInk?.value || new T.Color(0x16131a);
  const hotC = colors?.uAccent?.value || new T.Color(0xff7a1e);
  const coreC = colors?.uFoam?.value || new T.Color(0xf2c86a);
  // the glow's own three notes: an ember where the rock only remembers the heat,
  // the week's mineral where it is working, and the pale of a blowing vent at
  // the hottest cores — all of them out of the planet's own washes, so a world
  // that repaints the palette repaints the light with it
  const deep = { value: inkC.clone().lerp(hotC, 0.42) };
  const mid = { value: hotC.clone().lerp(coreC, 0.18) };
  const core = { value: coreC.clone() };
  const parts = [];
  const meshes = [];
  // the camera's own handover: 0 from orbit, 1 on foot (the style hands it to
  // every body each frame rather than sharing a uniform)
  const surface = { value: 0 };
  // the vents' own place in the sky, refreshed each frame: a vent the globe has
  // turned away from is put out, so no plume or collar can project past the limb
  const ventDirs = ventSessions(features).map((vent) => vent.dir.clone().normalize());
  const ventFade = new Float32Array(MAX_VENTS).fill(1);
  const camDir = new T.Vector3();
  const ventDir = new T.Vector3();

  // ---- the rivers, when the week's terrain cut real drainage
  {
    const geo = riverGeometry(T, features, rng);
    if (geo) {
      const mat = new T.ShaderMaterial({
        uniforms: {
          uTime: uniforms.uTime,
          uSun: light,
          uDeep: { value: deep.value.clone() },
          uMid: { value: mid.value.clone() },
          uCore: { value: core.value.clone() },
          uGlow: { value: glow },
          uSurface: surface,
        },
        vertexShader: RIVER_VERT,
        fragmentShader: RIVER_FRAG,
        transparent: true,
        blending: T.AdditiveBlending,
        depthWrite: false,
        side: T.DoubleSide,
        fog: false,
      });
      const mesh = new T.Mesh(geo, mat);
      mesh.name = 'lava-rivers';
      mesh.frustumCulled = false;
      group.add(mesh);
      meshes.push(mesh);
      parts.push({ name: 'rivers', verts: geo.attributes.position.count });
    }
  }

  // ---- the vents: the week's hard sessions, each a plume and a collar
  {
    const vents = ventSessions(features);
    const plume = { pos: [], t: [], ang: [], seed: [], vent: [], index: [] };
    const collar = { pos: [], r: [], ang: [], seed: [], vent: [], index: [] };
    const d = new T.Vector3();
    vents.forEach((vent, index) => {
      d.copy(vent.dir).normalize();
      const ground = features.heightAt(d);
      const base = d.clone().multiplyScalar(R + ground);
      const burn = vent.burn;
      append(plume, plumeGeometry(T, base, d.clone(), burn, 18, 5, rng, index));
      append(collar, collarGeometry(T, features, base, d.clone(), burn, 26, rng, index));
    });
    ventFade.fill(1);
    if (plume.pos.length) {
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(plume.pos, 3));
      geo.setAttribute('aT', new T.Float32BufferAttribute(plume.t, 1));
      geo.setAttribute('aAng', new T.Float32BufferAttribute(plume.ang, 1));
      geo.setAttribute('aSeed', new T.Float32BufferAttribute(plume.seed, 1));
      geo.setAttribute('aVent', new T.Float32BufferAttribute(plume.vent, 1));
      geo.setIndex(plume.index);
      const mat = new T.ShaderMaterial({
        uniforms: {
          uTime: uniforms.uTime,
          uVentFade: { value: ventFade },
          uDeep: { value: deep.value.clone() },
          uMid: { value: mid.value.clone() },
          uCore: { value: core.value.clone() },
          uGlow: { value: glow },
        },
        vertexShader: PLUME_VERT,
        fragmentShader: PLUME_FRAG,
        transparent: true,
        blending: T.AdditiveBlending,
        depthWrite: false,
        side: T.DoubleSide,
        fog: false,
      });
      const mesh = new T.Mesh(geo, mat);
      mesh.name = 'lava-vents';
      mesh.frustumCulled = false;
      group.add(mesh);
      meshes.push(mesh);
      parts.push({ name: 'plumes', verts: geo.attributes.position.count, vents: vents.length });
    }
    if (collar.pos.length) {
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(collar.pos, 3));
      geo.setAttribute('aR', new T.Float32BufferAttribute(collar.r, 1));
      geo.setAttribute('aAng', new T.Float32BufferAttribute(collar.ang, 1));
      geo.setAttribute('aSeed', new T.Float32BufferAttribute(collar.seed, 1));
      geo.setAttribute('aVent', new T.Float32BufferAttribute(collar.vent, 1));
      geo.setIndex(collar.index);
      const mat = new T.ShaderMaterial({
        uniforms: {
          uTime: uniforms.uTime,
          uVentFade: { value: ventFade },
          uMid: { value: mid.value.clone() },
          uCore: { value: core.value.clone() },
          uGlow: { value: glow },
          uSurface: surface,
        },
        vertexShader: COLLAR_VERT,
        fragmentShader: COLLAR_FRAG,
        transparent: true,
        blending: T.AdditiveBlending,
        depthWrite: false,
        side: T.DoubleSide,
        fog: false,
      });
      const mesh = new T.Mesh(geo, mat);
      mesh.name = 'lava-collars';
      mesh.frustumCulled = false;
      group.add(mesh);
      meshes.push(mesh);
      parts.push({ name: 'collars', verts: geo.attributes.position.count });
    }
  }

  // ---- on foot: the sky is the week's own smoke — the giants' ceiling
  // (giant-shader.js) laid in the ash, lit from under it by the fissures — with
  // one distant vent erupting on the horizon, its column lit by its own fire.
  // The ceiling stands clear of the week's highest ground, so no summit is ever
  // above it, and it is all of the sky once the eye is down on the crust.
  const pal = shared.palette;
  const peak = survey?.peak ? features.heightAt(survey.peak) : 30;
  const skyR = R + Math.max(peak, 0) + 26;
  const ember = hotC.clone().lerp(coreC, 0.30);
  const sky = createCeiling(T, {
    pal: {
      paper: pal.paper.clone().lerp(pal.skyWash, 0.55), crest: pal.skyWash, dry: pal.skyHigh,
      litWarm: pal.skyLow, shadeCool: pal.skyDeep, ink: pal.ink, inkSoft: pal.inkSoft,
      landMid: pal.skyDeep, landHigh: pal.skyHigh.clone().lerp(pal.skyDeep, 0.5), sepia: pal.cloudUnder,
    },
    light, time: uniforms.uTime, features, R, radius: skyR,
    glow: pal.skyHaze.clone().lerp(ember, 0.35),
    shade: pal.skyDeep.clone().lerp(pal.ink, 0.30),
    tower: { near: 0.50, count: 1, at: 0.28 },
    ember: { color: ember, amount: 0.30 + 0.30 * heat },
    belts: 5.5,
    tear: 1.2,
  });
  group.add(sky.mesh);
  // the long breaks underfoot run along the bearing the vent stands on from the
  // first landing, and are kept there: the ground does not turn with the eye
  const breakF = new T.Vector3(1, 0, 0);
  const breakS = new T.Vector3(0, 0, 1);
  const skyUp = new T.Vector3();
  let laid = false;
  const vents = ventSessions(features);
  const ground = {
    glsl: GROUND,
    uniforms: {
      uLvDeep: deep,
      uLvMid: mid,
      uLvCore: { value: coreC.clone().lerp(new T.Color(0xffd98a), 0.5) },
      uLvAir: sky.uniforms.uGlow,
      uLvF: { value: breakF },
      uLvS: { value: breakS },
      // the vents' own mouths, laid in the ground itself on foot (the plume and
      // the collar are the vent seen from above, and are put out underfoot)
      uLvVents: { value: Array.from({ length: MAX_VENTS }, (_, i) => {
        const d = vents[i]?.dir.clone().normalize();
        return d ? new T.Vector4(d.x, d.y, d.z, vents[i].burn) : new T.Vector4(0, 0, 1, 0);
      }) },
      uLvVentN: { value: Math.min(MAX_VENTS, vents.length) },
      // the glow from orbit (lvGlow): its pale, its strength, the week's heat in
      // the joints, the chart it reads, and lava.fractures
      uLvHot: core,
      uLvGlow: { value: glow },
      uLvScale: { value: 0.72 + 0.42 * heat },
      uLvTexel: { value: texel },
      uLvFrac: { value: P['lava.fractures'] },
    },
  };

  return {
    object: group,
    ground,
    // a crust still cooling holds nothing up but the race's own monument
    props: false,
    // …and over it the smoke is the whole sky (CEILING_FRAG)
    sky: true,
    update(frame) {
      surface.value = clamp(frame?.surface ?? 0, 0, 1);
      ground.uniforms.uLvFrac.value = P['lava.fractures'];
      const camera = frame?.camera;
      if (!camera) return;
      const rc = camera.position.length();
      // the chart's horizon is the ground's own, a few units under the eye
      sky.uniforms.uGround.value = rc - 5.5;
      sky.update(camera, clamp((skyR - rc) / 8, 0, 1) * clamp((surface.value - 0.5) / 0.3, 0, 1));
      if (!laid && sky.mesh.visible) {
        const b = sky.uniforms.uTowers.value.x;
        skyUp.copy(camera.position).normalize();
        breakS.crossVectors(sky.anchor, skyUp).normalize();
        breakF.copy(sky.anchor).multiplyScalar(Math.cos(b)).addScaledVector(breakS, Math.sin(b)).normalize();
        breakS.crossVectors(skyUp, breakF).normalize();
        laid = true;
      }
      // the plumes and collars are the vents seen from above: underfoot the
      // mouths are the ground's own (GROUND), and a cone of glow a hand over the
      // rock would stand across the feet of everything near it
      const fromAbove = 1 - clamp((surface.value - 0.6) / 0.35, 0, 1);
      camDir.copy(camera.position).normalize();
      for (let i = 0; i < ventDirs.length; i++) {
        // how far inside its own horizon the vent stands, from the camera's own
        // bearing: a vent within a third of the limb is put out whole, because a
        // plume is the one thing in this body that stands off the ground and
        // anything standing off the ground near the rim is drawn into the sky
        // beside the planet
        ventDir.copy(ventDirs[i]);
        ventFade[i] = clamp((ventDir.dot(camDir) - 0.30) / 0.24, 0, 1) * fromAbove;
      }
    },
    dispose() {
      for (const mesh of meshes) {
        group.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      meshes.length = 0;
      sky.dispose();
    },
    debug() {
      return { heat: +heat.toFixed(3), glow: +glow.toFixed(3), parts, ventIds: ventSessions(features).map((v) => v.id) };
    },
  };
}

/* Planet Creator — the galaxy's paint: the shaders galaxy.js lays its sky, disc, stars and phenomena with.
 *
 * The hand is the planet's own (apps/planet): the house hash and value noise (ink.js), the sky's paper tooth and
 * star field (ink-space.js), and pigment laid in steps whose edges are feathered by the pixel and pooled a shade
 * darker just inside, the way the black hole's own disc is laid (bodies/blackhole-lens.js). So the galaxy and the
 * hole at its heart, which is that very pass, are one painting.
 */

// ---------------------------------------------------------------- shared
const COMMON = /* glsl */ `
float gH(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float gN(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gH(i), gH(i + vec2(1.0, 0.0)), f.x), mix(gH(i + vec2(0.0, 1.0)), gH(i + vec2(1.0, 1.0)), f.x), f.y);
}
// value noise that closes on itself in y every per cells: an angle round a thing, with no seam
float gLoop(vec2 p, float per){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float y0 = mod(i.y, per), y1 = mod(i.y + 1.0, per);
  return mix(mix(gH(vec2(i.x, y0)), gH(vec2(i.x + 1.0, y0)), f.x), mix(gH(vec2(i.x, y1)), gH(vec2(i.x + 1.0, y1)), f.x), f.y);
}
// the sheet's own tooth (ink-space.js spTooth): grain, fibre and the pressed undulation, fixed to the picture
float gTooth(vec2 sp){
  float grain = gH(floor(sp * 0.44)) * 0.55
              + gH(floor(vec2(sp.x * 0.14, sp.y * 0.52) + 31.0)) * 0.28
              + gH(floor(vec2(sp.x * 0.61, sp.y * 0.12) + 71.0)) * 0.17;
  return clamp(grain * 0.68 + gN(sp * 0.19) * 0.32, 0.0, 1.0);
}
// Light laid as washes: s (0 … 1) held at a few values, each edge feathered by the pixel (tw) and the wash
// pooled a shade darker just inside its own edge; half of it so, half left as it fell.
float gWash(float s, float tw){
  float st = 0.16 * smoothstep(0.07 - tw, 0.07 + tw, s) + 0.22 * smoothstep(0.20 - tw, 0.20 + tw, s)
           + 0.26 * smoothstep(0.40 - tw, 0.40 + tw, s) + 0.36 * smoothstep(0.66 - tw, 0.66 + tw, s);
  float o = 1.6 * tw, k = 1.2 * tw;
  float pool = exp(-pow((s - 0.20 + o) / k, 2.0)) + exp(-pow((s - 0.40 + o) / k, 2.0)) + exp(-pow((s - 0.66 + o) / k, 2.0));
  return mix(s, st, 0.45) * (1.0 - 0.14 * clamp(pool, 0.0, 1.0));
}
// the light's color: cool blue-white on the arms, warm toward the core, white where it is thickest
vec3 gHue(float s, float heat){
  vec3 cool = mix(mix(vec3(0.26, 0.31, 0.62), vec3(0.66, 0.77, 1.0), smoothstep(0.12, 0.65, s)), vec3(1.0, 0.98, 0.95), smoothstep(0.68, 0.97, s));
  vec3 warm = mix(mix(vec3(0.50, 0.38, 0.32), vec3(1.0, 0.82, 0.56), smoothstep(0.12, 0.65, s)), vec3(1.0, 0.96, 0.86), smoothstep(0.62, 0.95, s));
  return mix(cool, warm, clamp(heat, 0.0, 1.0));
}
`;

// a pass laid over the whole frame
export const SCREEN_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// a quad that always faces the eye, uSize galaxy radii across its half
export const BILLBOARD_VERT = /* glsl */ `
uniform float uSize;
varying vec2 vQ;
void main(){
  vQ = position.xy;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * uSize;
  gl_Position = projectionMatrix * mv;
}
`;

// ---------------------------------------------------------------- the sky
// After ink-space.js: one wash of the ink over the whole sheet left to dry, two nebulae blown far behind, the
// furthest galaxies and a field of stars standing in the paper's tooth. No band: from out here the galaxy is the
// thing in front of the eye, not a road across the sky. The far galaxies are laid by cell, as the stars are: a few
// in every patch of sky, each a disc at its own angle (an old round one warm, a spiral cool round a warm heart with
// a breath of two arms, one seen edge-on a sliver with its dust across it), a few pixels across and the faintest
// thing in the picture, so the dark is deep and never empty, and never asks to be read.
export const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

export const SKY_FRAG = /* glsl */ `
uniform float uTime, uPx, uSeed;
uniform vec3 uVoidDeep, uVoidLift, uStarPale, uStarA, uStarB, uStarC, uNebCool, uNebWarm;
uniform vec4 uNeb[2];
uniform vec4 uNebK[2];
varying vec3 vDir;
${COMMON}
float sH3(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
float sN3(vec3 x){
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(sH3(i), sH3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(sH3(i + vec3(0.0, 1.0, 0.0)), sH3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y);
  float b = mix(mix(sH3(i + vec3(0.0, 0.0, 1.0)), sH3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(sH3(i + vec3(0.0, 1.0, 1.0)), sH3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y);
  return mix(a, b, f.z);
}
float sF3(vec3 p){ return sN3(p) * 0.65 + sN3(p * 2.63 + 11.3) * 0.35; }
// one layer of the field (ink-space.js spField): a cell of the sky holds one candidate star
vec3 sField(vec3 d, float K, float salt, float live, float scale, float gain, vec3 cut){
  vec3 id = floor(d * K);
  float h = sH3(id + salt);
  if (h > live) return vec3(0.0);
  vec3 p = normalize(id + 0.5 + (vec3(sH3(id + salt + 1.3), sH3(id + salt + 7.1), sH3(id + salt + 13.7)) - 0.5) * 0.58);
  vec3 pd = d - p;
  float q2 = dot(pd, pd);
  float hi = sH3(id + salt + 23.9);
  float r = min(uPx * scale * (0.70 + 0.85 * hi * hi), 0.22 / K);
  float core = exp(-q2 / (r * r * 0.55));
  float air = exp(-q2 / (r * r * 2.20));
  float tw = 0.76 + 0.24 * sin(uTime * (0.22 + 0.74 * h) + hi * 6.283);
  float on = (core * 0.62 + air * 0.38) * (0.26 + 0.74 * sH3(id + salt + 41.3)) * tw * gain;
  vec3 tint = uStarPale;
  tint = mix(tint, uStarA, step(cut.x, hi));
  tint = mix(tint, uStarB, step(cut.y, hi));
  tint = mix(tint, uStarC, step(cut.z, hi));
  return tint * on;
}
// one layer of the far galaxies: a cell of the sky in some thirty holds one, and keeps it inside itself (faded out
// before the nearest wall of the cell, so no cell's edge ever cuts one); size is its largest half-length in cells.
// Under a pixel it is spread over one and dimmed to match.
vec3 sGalaxy(vec3 d, float K, float salt, float live, float size, float gain){
  vec3 id = floor(d * K);
  if (sH3(id + salt) > live) return vec3(0.0);
  vec3 p = normalize(id + 0.5);
  vec3 f = p * K - id;
  float m = min(min(min(f.x, f.y), f.z), min(min(1.0 - f.x, 1.0 - f.y), 1.0 - f.z));   // to the nearest wall
  vec3 u0 = normalize(cross(p, vec3(0.31, 0.83, 0.47))), v0 = cross(p, u0);
  float a = sH3(id + salt + 3.9) * 6.2831853, ca = cos(a), sa = sin(a);
  vec2 q = vec2(dot(d - p, ca * u0 + sa * v0), dot(d - p, ca * v0 - sa * u0)) * K;    // in cells
  float fade = 1.0 - smoothstep(0.7 * m, m, length(q));
  if (fade <= 0.0 || m < 0.06) return vec3(0.0);
  float kind = sH3(id + salt + 21.7), open = 0.16 + 0.84 * sH3(id + salt + 17.3);  // open: 1 face-on
  float L = min(size * (0.5 + 0.5 * pow(sH3(id + salt + 11.1), 2.0)), 0.4 * m), px = uPx * K * 0.8;
  vec2 ax = vec2(max(L, px), max(L * open, px));
  vec2 e = q / ax;
  float rho = length(e);
  float lum = gain * fade * (0.3 + 0.7 * sH3(id + salt + 31.0)) * (L * L * open) / (ax.x * ax.y);
  vec3 warm = vec3(0.80, 0.66, 0.52), cool = vec3(0.58, 0.64, 0.80);
  if (kind < 0.4) return warm * exp(-2.6 * sqrt(rho)) * 1.6 * lum;
  if (kind < 0.9) {
    float arms = 0.55 + 0.45 * cos(2.0 * atan(e.y, e.x) - 4.0 * log(rho + 0.15) + kind * 40.0);
    return (warm * exp(-rho * rho * 7.0) + cool * exp(-rho * 2.0) * arms * 0.6) * lum;
  }
  float lane = 1.0 - 0.6 * exp(-pow(q.y / max(L * 0.08, px), 2.0)) * exp(-e.x * e.x * 0.8);
  return mix(cool, warm, 0.35) * exp(-rho * 2.2) * lane * lum;
}
void main(){
  vec3 d = normalize(vDir);
  float tooth = gTooth(gl_FragCoord.xy);
  float wash = sF3(d * 2.2 + uSeed);
  float vein = sN3(d * 6.7 + 17.0);
  vec3 c = mix(uVoidDeep, uVoidLift, smoothstep(0.32, 0.80, wash) * (0.35 + 0.65 * vein));
  c *= mix(vec3(0.94, 0.97, 1.06), vec3(1.07, 0.98, 0.93), sN3(d * 1.3 + 7.0));   // the ink a little warmer here, cooler there

  // the nebulae: pigment blown into a damp sky, run one way and broken where the sheet was dry
  for (int i = 0; i < 2; i++) {
    if (dot(d, uNeb[i].xyz) < uNeb[i].w) continue;
    vec3 nd = d - uNeb[i].xyz;
    vec4 k = uNebK[i];
    float fall = exp(-dot(nd, nd) / (k.y * k.y));
    vec3 nu = normalize(cross(uNeb[i].xyz, vec3(0.11, 0.97, 0.21)));
    vec3 nv = cross(uNeb[i].xyz, nu);
    float fil = sF3(vec3(dot(d, nu) * 2.6, dot(d, nv) * 8.4 * k.w, float(i) * 19.1 + uSeed * 2.3));
    float veins = pow(clamp(1.0 - abs(2.0 * fil - 1.0), 0.0, 1.0), 2.0);
    float gap = smoothstep(0.30, 0.68, sF3(vec3(dot(d, nu) * 6.1 + 4.3, dot(d, nv) * 3.7 + 9.1, float(i) * 7.7 + uSeed)));
    float broke = smoothstep(0.26, 0.66, fil * (0.72 + 0.42 * veins)) * (0.2 + 0.8 * gap);
    c += mix(uNebCool, uNebWarm, k.z) * fall * (0.10 + 0.90 * veins) * (0.30 + 0.70 * broke) * k.x;
  }

  // the furthest galaxies: a few bigger ones far apart, and many small
  c += sGalaxy(d, 11.0, uSeed + 61.0, 0.07, 0.12, 1.4);
  c += sGalaxy(d, 34.0, uSeed + 83.0, 0.06, 0.12, 1.0);

  // thin and low: the sky's stars are the backdrop, and must never be taken for a week
  float drift = 0.30 + 0.70 * sN3(d * 3.4 + uSeed * 4.1);
  c += sField(d, 132.0, uSeed + 3.0, 0.04 + 0.06 * drift, 0.95, 0.42 * (0.40 + 0.60 * drift), vec3(0.94, 0.985, 0.998));
  c += sField(d, 64.0, uSeed + 47.0, 0.015 + 0.05 * drift, 1.25, 0.55 * (0.60 + 0.40 * drift), vec3(0.90, 0.972, 0.996));
  c += sField(d, 27.0, uSeed + 91.0, 0.02, 1.9, 0.75, vec3(0.58, 0.840, 0.950));

  float pigment = 1.0 - clamp(dot(c, vec3(1.6)) * 0.5, 0.0, 1.0);
  c += uVoidLift * (tooth - 0.5) * (0.42 + 0.40 * pigment);
  gl_FragColor = vec4(c, 1.0);
}
`;

// ---------------------------------------------------------------- the disc
// Laid flat in the galaxy's plane and read in its own polar chart. Each arm is a year, a logarithmic spiral; a
// pixel finds the arm nearest it and where across that arm it is (in half-widths, the inner side dusty), then
// reads that arm's weeks out of uData at its own radius: how big the week was (r), whether it was in a streak
// (g), whether there is a week there at all (b) and how warm its sports were (a), and on the arm's second row
// how much star birth its run of regular weeks lit (r). The arm is clouds of stars brushed along it, long that
// way and short across, its crest wandering and beaded with knots of young stars on it and just past it (soft and
// blue-white, a few big and many small); the light is added to the dark, laid in a few washes, the old stars' gold
// in the core and the young stars' blue out on the arms, made of a grain of stars a pixel or less across until the
// eye comes near, and where it thins to nothing the brush runs dry on the paper's tooth. The arms carry the weeks'
// size, so they are kept under the weeks' own stars: the paint never outshines what it is about.
// A streak lays a dust lane down the arm's inner edge: a band of soft gas whose line and breadth wander, its edges
// torn by the gas itself, with feathers drawn out across the arm. It takes the arm's light away and stands dark
// against whatever is behind it (its alpha, laid premultiplied over the bulge, the field and the sky), and its
// edge toward the crest is lifted where the young stars' light comes through from behind. Where a run of regular
// weeks went, the gas round the knots on the outer edge glows rose, patchy, under the nebulae galaxy.js lays there.
export const DISC_VERT = /* glsl */ `
varying vec2 vP;
void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

export const DISC_FRAG = /* glsl */ `
uniform sampler2D uData;
uniform float uArms, uSeed, uR0, uR1, uWind, uPhase, uSinP, uDpr;
varying vec2 vP;
${COMMON}
void main(){
  float r = length(vP);
  if (r > 1.14) discard;
  float phi = atan(vP.y, vP.x);
  float lr = log(max(r, 0.015) / uR0);
  float t = (r - uR0) / (uR1 - uR0);
  float w = 0.035 + 0.03 * clamp(t, 0.0, 1.0);

  // ---- the nearest arm, and where across it this pixel is
  float x = 99.0, arm = 0.0;
  for (int k = 0; k < 6; k++) {
    if (float(k) >= uArms) break;
    float d = phi - (uPhase + 6.2831853 * float(k) / uArms - uWind * lr);
    d = mod(d + 3.14159265, 6.2831853) - 3.14159265;
    float xk = d * r * uSinP / w;
    if (abs(xk) < abs(x)) { x = xk; arm = float(k); }
  }
  vec2 row = vec2((clamp(t, 0.0, 1.0) * 52.0 + 0.5) / 64.0, (2.0 * arm + 0.5) / (2.0 * uArms));
  vec4 dat = texture2D(uData, row);
  float birth = texture2D(uData, row + vec2(0.0, 0.5 / uArms)).r;
  float vol = dat.r, lane = dat.g, present = dat.b;

  // the disc's slope on the screen at this pixel (galaxy radii per pixel, across and up), so what is round
  // in the sky is drawn round on the screen however low the eye comes; and how near the eye has come (0 from the
  // whole-galaxy view, 1 close on an arm, by the size of a CSS pixel on the disc), so the arm can come apart
  // into what it is made of
  mat2 jac = mat2(dFdx(vP), dFdy(vP));
  float det = determinant(jac);
  det = (det < 0.0 ? -1.0 : 1.0) * max(abs(det), 1e-12);
  mat2 toPx = mat2(jac[1][1], -jac[0][1], -jac[1][0], jac[0][0]) / det;
  float pxd = sqrt(abs(det));
  float near = smoothstep(0.0016, 0.0004, pxd * uDpr);

  // ---- the arm: clouds of stars brushed along it, its crest wandering, a big week loading the brush
  float along = lr * 2.2 + arm * 7.31 + uSeed;
  float ends = smoothstep(-0.06, 0.03, t) * (1.0 - smoothstep(0.94, 1.08, t));
  float xx = x - (gN(vec2(along * 1.6, arm * 3.0 + 1.0)) - 0.5) * 0.8;
  float c1 = gN(vec2(along * 2.3, xx * 0.55 + 3.1));
  float c2 = gN(vec2(along * 6.0 + 2.0, xx * 1.2 + 7.0));
  float hair = gN(vec2(along * 15.0, xx * 3.2 + 9.7));
  float cloud = smoothstep(0.22, 0.88, c1 * 0.62 + c2 * 0.38);
  // halfway to the next arm a pixel reads that arm instead, so what an arm throws out across the gap is let go
  // before it gets there, and the two meet on nothing
  float seam = 1.0 - smoothstep(0.6, 1.0, abs(x) / (3.14159265 * r * uSinP / (uArms * w)));
  float load = mix(0.045, 0.28 + 0.72 * vol, present) * ends * seam;
  float armL = exp(-xx * xx * (xx < 0.0 ? 1.2 : 0.5)) * load * (0.17 + 0.55 * cloud) * (0.80 + 0.20 * hair);
  float skirt = exp(-xx * xx * 0.08) * load * 0.22 * (0.55 + 0.45 * c1);
  // spurs: the arm's light combed out across the gap, along the shear
  float spur = exp(-xx * xx * 0.03) * smoothstep(0.55, 0.92, gN(vec2(along * 3.2 - xx * 0.12, xx * 0.22 + 5.0))) * 0.10 * load;
  // the knots: young clusters beading the crest and just past it, a few big and many small, never in a row, laid in
  // the arm's own chart so they ride along it. Each pixel looks in its own cell of each size and a knot keeps well
  // inside its cell; the small ones come out only once the eye is near enough to hold them.
  float knot = 0.0, kw = exp(-pow(xx - 0.25, 2.0) * 0.6) * load;
  if (kw > 0.004) {
    for (int k = 0; k < 2; k++) {
      float fk = float(k);
      vec2 kc = k == 0 ? vec2(along * 3.0, xx * 0.45 + 0.2) : vec2(along * 8.0 + 3.7, xx * 0.9 - 0.15);
      vec2 ki = floor(kc), kd = fract(kc) - 0.32 - 0.36 * vec2(gH(ki + 2.3 + fk), gH(ki + 7.9 - fk));
      float kh = gH(ki + 13.1 + 5.0 * fk), ks = 0.05 + 0.08 * kh;
      knot += step(0.55 - 0.1 * fk, kh) * exp(-dot(kd, kd) / (ks * ks)) * (0.35 + 0.65 * gH(ki + 5.5 + fk))
            * (k == 0 ? 1.0 : 0.7 * smoothstep(0.0045, 0.0025, pxd * uDpr));
    }
    knot *= kw;
  }
  // close in, the arm's light comes apart into the clouds of stars it is made of: round clumps (laid in the
  // disc's own plane, not along its spiral chart, which would comb them into streaks), thinner between them, and
  // less of the smooth wash, so its stars and its weeks stand in air
  float fine = 0.5;
  if (near > 0.0) {
    fine = gN(vP * 58.0 + 5.0) * 0.65 + gN(vP * 150.0 + 1.0) * 0.35;
    float clumps = 0.55 + 0.7 * smoothstep(0.25, 0.8, fine);
    armL *= mix(1.0, clumps * 0.85, near);
    skirt *= mix(1.0, (0.6 + 0.45 * fine) * 0.85, near);
  }
  float disc = 0.15 * exp(-r / 0.24) * (0.70 + 0.30 * gN(vP * 5.0 + uSeed)) * (1.0 - smoothstep(0.78, 1.12, r));
  float bulge = 0.08 * exp(-r * r / 0.003) + 0.16 * exp(-r / 0.06) + 0.14 * exp(-r / 0.17);
  // the core's washes laid by hand: their edges wander, so the round light is never a set of rings
  float wander = 0.78 + 0.30 * gN(vP * 9.0 + uSeed * 2.0) + 0.14 * gN(vP * 23.0 - uSeed);
  float I = armL + skirt + spur + knot * 1.5 + (disc + bulge) * wander;

  // ---- dust: a little down every arm's inner edge, and where a streak ran a lane close in under the crest: a band
  // of soft gas whose line and breadth wander, its edges torn by the gas itself (never a cut), streaked along its
  // length and thinned here and there, with feathers drawn out across the arm; close in, it frays into the strands
  // it is made of and thins (gas the light shows through, not a cut-out)
  float rift = exp(-pow(xx + 0.9, 2.0) / 0.06) * 0.22 * (0.4 + 0.6 * c1) * present, rim = 0.0;
  if (lane > 0.0 && abs(xx + 0.55) < 2.6) {
    float lx = xx + 0.55 + 0.32 * (gN(vec2(along * 4.0, 7.0)) - 0.5);
    float wid = 0.30 + 0.24 * gN(vec2(along * 2.6 + 5.0, 3.0));
    float fray = gN(vec2(along * 9.0 + 1.0, lx * 2.6 + 4.0)) * 0.65 + gN(vec2(along * 23.0, lx * 6.0 + 2.0)) * 0.35;
    float band = clamp((wid - abs(lx) + 0.24 * (fray - 0.5)) / (0.6 * wid), 0.0, 1.0);
    band *= band * (3.0 - 2.0 * band);
    float strands = 0.55 + 0.45 * smoothstep(0.30, 0.72, gN(vec2(along * 7.0, lx * 2.2 + 1.3)));
    float gaps = smoothstep(0.18, 0.55, gN(vec2(along * 2.4 + 2.0, 4.0)));
    float feathers = smoothstep(0.58, 0.86, gN(vec2(along * 6.0 + xx * 0.9, xx * 0.5))) * exp(-lx * lx / 0.9) * 0.5;
    rift = max(rift, max(band * strands, feathers) * (0.30 + 0.70 * gaps) * lane);
    // the lane's edge toward the crest, where the young stars' light comes through it from behind: the paper lifted
    rim = band * (1.0 - band) * 4.0 * smoothstep(-0.05, 0.1, lx) * lane * gaps * ends;
  }
  rift *= ends;
  if (near > 0.0 && rift > 0.0) rift *= mix(1.0, 0.5 + 0.6 * smoothstep(0.25, 0.75, gN(vec2(along * 26.0 + 3.0, xx * 13.0 + 1.7))), near);
  I *= 1.0 - 0.85 * rift;

  // ---- the light, laid in washes (close in, their edges let out wide: up close a wash is gas, not cut paper):
  // the old stars' gold in the core, the young stars' blue out on the arms, bluest in the knots, and what light
  // comes through the dust reddened by it
  float s = 1.0 - exp(-2.2 * I);
  float heat = smoothstep(0.5, 0.1, r);
  float young = clamp(knot * 1.6, 0.0, 1.0) * (1.0 - heat);
  vec3 light = gHue(s, heat + 0.25 * dat.a * present * (1.0 - heat) - 0.35 * young + 0.6 * rift) * gWash(s, max(fwidth(s) * 1.4, 0.006) + 0.08 * near);
  light += vec3(0.96, 0.92, 0.84) * rim * 0.10 * load * (1.0 - 0.5 * near);
  light += vec3(0.20, 0.12, 0.08) * rift * load * 0.25;   // the dust's own dull brown, lit by the arm round it

  // ---- where a run of regular weeks went, the gas round the young stars on the outer edge glows rose: patchy,
  // brightest round the knots, under the nebulae of star birth laid there (galaxy.js, NEBULA_FRAG)
  if (birth > 0.0) {
    float hii = birth * present * ends * seam * (exp(-pow(xx - 0.5, 2.0) / 0.5) * smoothstep(0.3, 0.85, c2 * 0.55 + gN(vec2(along * 11.0 + 4.0, xx * 1.6)) * 0.45) * 0.6 + knot * 1.4);
    light += vec3(0.70, 0.30, 0.36) * hii * 0.13 * (1.0 - rift);
  }

  // ---- the stars it is made of: a grain of points, more where the light is, each measured on the screen so it
  // stays round; a point under a pixel is spread over one and dimmed to match, so the grain holds still as the
  // galaxy turns; over a pixel and a half it grows no more, only brighter (a star is a point however near the
  // eye comes), and close in a finer grain comes out between. The coarsest grain is the arm's tooth from afar and
  // dims as its cells open past a few pixels, so nearer in the arm is a wash with stars in it, not snow.
  float gv = mix(0.3, 1.0, smoothstep(4.0, 1.6, 1.0 / (300.0 * pxd)));
  for (int k = 0; k < 3; k++) {
    if (k == 2 && near <= 0.0) break;
    float K = k == 0 ? 300.0 : k == 1 ? 110.0 : 1100.0;
    vec2 sc = vP * K + float(k) * 17.0;
    vec2 sid = floor(sc), sf = fract(sc);
    if (gH(sid + 0.37 * K) > (k == 0 ? clamp(s * s * 0.9, 0.0, 0.5) : k == 1 ? clamp(s * 0.32, 0.0, 0.5) : clamp(s * s * 0.6, 0.0, 0.35) * near)) continue;
    vec2 sp = 0.2 + 0.6 * vec2(gH(sid + 3.1), gH(sid + 5.7));
    vec2 pix = toPx * ((sf - sp) / K);                    // the way to the star, in pixels
    float pr = (k == 0 ? 0.0007 : k == 1 ? 0.0013 : 0.00022) * (0.6 + 0.8 * gH(sid + 9.1)) / pxd;
    float rad = clamp(pr, 0.7, 1.5 * uDpr);
    vec3 tint = gH(sid + 21.0) < 0.65 - 0.4 * heat ? vec3(0.82, 0.88, 1.0) : vec3(1.0, 0.90, 0.72);
    float b = k == 2 ? 0.25 + 0.75 * pow(gH(sid + 13.3), 3.0) : 0.5 + 0.5 * gH(sid + 13.3);   // the finest mostly faint, a few bright
    light += tint * exp(-dot(pix, pix) / (rad * rad)) * min((pr * pr) / (rad * rad), 2.4) * b * (k == 0 ? 0.4 * gv : k == 1 ? 0.8 : 0.5) * (1.0 - rift);
  }

  // ---- the paper: the light catches in its tooth, and where the wash runs thin the brush runs dry on it
  float tooth = gTooth(gl_FragCoord.xy);
  light *= (0.86 + 0.28 * tooth) * (1.0 - 0.5 * smoothstep(0.16, 0.02, s) * smoothstep(0.62, 0.30, tooth));
  gl_FragColor = vec4(light, clamp(rift * mix(1.0, 0.7, near), 0.0, mix(0.78, 0.55, near)));
}
`;

// ---------------------------------------------------------------- the bulge
// The core seen as the ball it is, and the galaxy's halo round it all: a light that faces the eye from any side,
// added over the disc's own. The bulge is old stars, gold, drawn in hard to its middle and mottled (made of stars,
// not mist); the halo is the faintest light in the galaxy, far wider than its disc, so the galaxy stands in air of
// its own. galaxy.js lays it HALO galaxy radii across its half.
export const HALO = 1.6;
export const BULGE_FRAG = /* glsl */ `
uniform float uSeed;
varying vec2 vQ;
${COMMON}
void main(){
  float r = length(vQ);
  if (r > 1.0) discard;
  vec2 p = vQ * ${HALO.toFixed(2)};                    // galaxy radii
  float g = r * ${HALO.toFixed(2)};
  float bulge = 0.09 * exp(-g * g / 0.0045) + 0.12 * exp(-g / 0.06) + 0.16 * exp(-g / 0.16);
  if (g < 0.7) bulge *= 0.80 + 0.30 * gN(p * 13.0 + uSeed) + 0.12 * gN(p * 37.0 - uSeed);
  float halo = 0.03 * exp(-g * g / 0.6) * (1.0 - smoothstep(0.5, 1.0, r));
  float s = 1.0 - exp(-2.2 * bulge);
  gl_FragColor = vec4(gHue(s, 1.0) * s + vec3(0.56, 0.58, 0.68) * halo, 1.0);   // a glow, not washes: laid in steps it would ring
}
`;

// ---------------------------------------------------------------- stars
// The field: dabs of light a pixel or two across, kept that size however near the eye comes, and fading rather
// than shrinking below a pixel. The globular clusters' stars are the same dabs.
export const FIELD_VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
uniform float uDpr;
varying vec3 vColor;
varying float vA;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float px = aSize * uDpr * clamp(1.6 / -mv.z, 0.55, 2.4);
  gl_PointSize = max(px, 1.0);
  vA = clamp(px, 0.0, 1.0);
  vColor = aColor;
  gl_Position = projectionMatrix * mv;
}
`;

export const FIELD_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vA;
void main(){
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(q, q);
  if (d2 > 1.0) discard;
  gl_FragColor = vec4(vColor * exp(-d2 * 3.5) * vA, 1.0);
}
`;

// The weeks: each a star its own size in the galaxy (aSize, galaxy radii), in the mark only a week has (the key
// names it): a soft white core in a wide soft halo of its sports' color, no edge anywhere, so a run of weeks reads
// as stars in the arm's light and not beads on a string. Far off, never less than a clear small star (the small
// ones raised most, so a bigger star still means more hours), its sport's color held to its heart so it reads
// against the arm's pale light; close in it grows, softly held under 9 CSS px (a star is a point, its planet the
// thing that comes near). The picked one (uHover) gets a hairline ring of paper white.
export const WEEK_VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute float aIndex;
uniform float uScale, uDpr, uHover;
varying vec3 vColor;
varying float vHot, vK, vB, vSmall;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vHot = 1.0 - step(0.5, abs(aIndex - uHover));
  float R = aSize * uScale / -mv.z / uDpr;                                // its own radius, CSS px
  float core = R < 3.0 ? max(1.5, 3.0 * sqrt(R / 3.0)) : 9.0 - 6.0 * exp((3.0 - R) / 6.0);
  vSmall = 1.0 - smoothstep(1.6, 3.6, core);
  core *= uDpr;                                                           // the star's radius, in pixels
  vK = vHot > 0.5 ? max(4.6, 7.0 * uDpr / core) : 4.0;                   // and the mark's, in star radii
  vB = max(mix(clamp(aSize / 0.009, 0.45, 1.0), 1.0, 0.45 * vSmall), vHot); // a quiet week burns lower
  gl_PointSize = 2.0 * core * vK;
  vColor = aColor;
  gl_Position = projectionMatrix * mv;
}
`;

export const WEEK_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vHot, vK, vB, vSmall;
void main(){
  float d = length(gl_PointCoord * 2.0 - 1.0) * vK;   // in the star's own radii
  if (d > vK) discard;
  float core = exp(-d * d * 1.3);
  float halo = exp(-d * d * 0.22) * (1.0 - smoothstep(vK - 1.2, vK, d));
  // a star's color is a tint, not a dye: the sport's color let down with white in the halo, near white at the
  // core (small on the screen, the color kept at the core too)
  vec3 c = mix(mix(vColor, vec3(1.0, 0.97, 0.92), 0.12), vec3(1.0, 0.98, 0.94), clamp(core * 1.4, 0.0, 1.0) * mix(0.75, 0.3, vSmall));
  float a = clamp(core + halo * mix(0.34, 0.5, vSmall), 0.0, 1.0) * vB;
  float ring = vHot * exp(-pow((d - vK + 0.6) / (0.12 * vK), 2.0));
  c = mix(c, vec3(0.98, 0.95, 0.88), ring);
  gl_FragColor = vec4(c, max(a, ring * 0.85));
}
`;

// ---------------------------------------------------------------- phenomena
// A race week's supernova remnant: a bubble of rose (the hydrogen) round what the star left, laid over the arm as
// well as shining (premultiplied: it hides a little of the light behind it, so the rose holds on a bright arm),
// brightest at its limb and on the side the shock ran into thicker gas, combed into filaments and torn, with teal
// wisps inside it (the oxygen) and at its heart a glowing core: the hard white point of the dead star in the
// blue-white of its own wind. It drifts very slowly, the way the Veil does. Small on the screen it keeps only the
// detail its pixels can carry (fine filaments a pixel apart break the limb into dashes): a whole rose ring,
// heavier on one side, round a spark.
export const REMNANT_FRAG = /* glsl */ `
uniform float uSeed, uTime;
varying vec2 vQ;
${COMMON}
void main(){
  float r = length(vQ);
  if (r > 1.0) discard;
  float px = fwidth(vQ.x);                     // a pixel, in the quad's own units (its half-width is 1)
  float a = atan(vQ.y, vQ.x) / 6.2831853 + 0.5;
  float drift = uTime * 0.004;
  // each scale of detail, kept while a turn of it has five pixels or more to a stroke (4.15: the limb's length)
  float k0 = smoothstep(3.0, 5.0, 4.15 / px / 9.0), k1 = smoothstep(3.0, 5.0, 4.15 / px / 23.0), k2 = smoothstep(3.0, 5.0, 4.15 / px / 47.0);
  float rr = 0.64 + 0.16 * (gLoop(vec2(uSeed, a * 5.0), 5.0) - 0.5) + 0.06 * k1 * (gLoop(vec2(uSeed + 5.0, a * 17.0), 17.0) - 0.5);
  float limb = smoothstep(rr - max(0.26, 3.0 * px), rr, r) * (1.0 - smoothstep(rr, rr + max(0.08, 1.5 * px), r));
  // the shock ran into thicker gas on one side: there it is a bright crescent, round the far side a breath
  float side = 0.12 + 0.88 * smoothstep(0.22, 0.82, gLoop(vec2(uSeed * 1.7, a * 2.0), 2.0));
  float f1 = gLoop(vec2(r * 6.0 + uSeed - drift, a * 23.0), 23.0);
  float f2 = gLoop(vec2(r * 12.0 + uSeed * 2.0 + drift, a * 47.0), 47.0);
  float ridge = mix(0.40, pow(1.0 - abs(2.0 * f1 - 1.0), 3.0) * 0.6, k1) + mix(0.10, pow(1.0 - abs(2.0 * f2 - 1.0), 5.0) * 0.5, k2);
  float torn = mix(0.85, 0.35 + 0.65 * smoothstep(0.30, 0.70, gLoop(vec2(r * 2.5 + uSeed * 3.0, a * 9.0), 9.0)), k0);
  float s = 1.0 - exp(-2.6 * limb * side * (0.30 + 0.80 * ridge) * torn);
  float wisp = mix(0.3, pow(1.0 - abs(2.0 * gLoop(vec2(r * 4.0 + 9.0 + drift, a * 11.0), 11.0) - 1.0), 2.0), k0);
  float inner = exp(-pow((r - rr * 0.6) / 0.22, 2.0)) * wisp * 0.22;
  float fill = 0.06 * exp(-r * r / 0.30);                         // the bubble's own faint light inside
  float fade = 1.0 - smoothstep(0.86, 1.0, r);
  vec3 rose = mix(vec3(0.80, 0.42, 0.47), vec3(1.0, 0.80, 0.74), smoothstep(0.45, 0.95, s));
  // the core: held to a pixel or more, and dimmed as it is spread, so it reads as a spark at any size
  float cs = max(0.045, 1.1 * px);
  float spark = exp(-r * r / (cs * cs)) * (0.045 * 0.045) / (cs * cs);
  float wind = exp(-r * r / 0.09) * (0.55 + 0.45 * gN(vQ * 7.0 + uSeed + drift * 4.0));
  vec3 heart = vec3(0.55, 0.74, 0.98) * wind * 0.5 + vec3(1.0, 0.97, 0.93) * spark * 1.4;
  gl_FragColor = vec4((rose * (s + fill) + vec3(0.28, 0.58, 0.62) * inner) * fade + heart, (s * 0.6 + fill) * fade);
}
`;

// A distance record's pulsar: a hard blue-white point and its two beams, thin tapered strokes swept round as
// the star turns (uBeam: the beam on the sheet, its length its foreshortening; z the flash as it sweeps the eye).
// Laid over its week's soft star, the hard point in it is the sign; small on the screen the point and the
// strokes are held to a pixel and burn brighter, so it still reads as a needle of light.
export const PULSAR_FRAG = /* glsl */ `
uniform vec3 uBeam;
uniform float uSeed, uTime;
varying vec2 vQ;
${COMMON}
void main(){
  float r = length(vQ);
  if (r > 1.0) discard;
  float px = fwidth(vQ.x);
  float len = length(uBeam.xy);
  vec2 b = uBeam.xy / max(len, 1e-3);
  float along = abs(dot(vQ, b)), across = dot(vQ, vec2(-b.y, b.x));
  float reach = along / max(len, 0.05);
  float width = max(0.007 + 0.042 * along, 0.7 * px);
  float beam = exp(-pow(across / width, 2.0)) * (1.0 - smoothstep(0.45, 1.0, reach)) * smoothstep(0.0, 0.06, along);
  beam *= 0.55 + 0.45 * gN(vec2(along * 16.0 - uTime * 0.6, uSeed));
  float cs = max(0.021, 0.8 * px);
  float core = exp(-r * r / (2.0 * cs * cs));
  float glow = 0.22 * exp(-r * r / (18.0 * cs * cs));
  float flash = uBeam.z * exp(-r * r / 0.015);
  vec3 c = mix(vec3(0.70, 0.82, 0.98), vec3(1.0, 0.99, 0.97), clamp(core + flash * 0.5, 0.0, 1.0));
  gl_FragColor = vec4(c * clamp(beam * mix(0.5, 0.9, smoothstep(0.02, 0.06, px)) + core + glow + flash * 0.7, 0.0, 1.0), 1.0);
}
`;

// A time record's globular cluster: the unresolved light of the ball, behind its own stars, drawn in hard to its
// middle the way an old ball of stars is (a King profile: a bright core, a long faint halo).
export const CLUSTER_FRAG = /* glsl */ `
varying vec2 vQ;
void main(){
  float r2 = dot(vQ, vQ);
  if (r2 > 1.0) discard;
  float v = exp(-r2 * 7.0) * 0.5 + exp(-r2 * 40.0) * 0.4 + exp(-r2 * 220.0) * 0.45;
  gl_FragColor = vec4(mix(vec3(0.86, 0.66, 0.40), vec3(1.0, 0.93, 0.76), clamp(v, 0.0, 1.0)) * v * 0.5 * (1.0 - smoothstep(0.7, 1.0, r2)), 1.0);
}
`;

// The hole's jets, while the last month was big: two beams out of the poles, long enough to leave the disc, laid
// as one stroke of blue-white light each with the brush's bristles along it: bright knots near the hole that fade
// as the beam runs out, a soft sheath round it, a slow wind as the hole's axis nods, and at its end a hot spot in
// a torn lobe where the beam runs into the thin gas round the galaxy. The one coming toward the eye is the
// brighter (its light beamed forward, as a real jet's is). Each is a quad that turns about the axis to face the
// eye (vJ: across it in galaxy radii, and along it 0 … 1); held to a pixel or more across, dimmed as it is spread.
export const JET_VERT = /* glsl */ `
uniform float uLen, uWidth;
varying vec2 vJ;
varying float vBoost;
void main(){
  vec4 base = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec3 axis = normalize((modelViewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  vec3 side = cross(axis, normalize(-base.xyz));
  side = length(side) < 1e-3 ? vec3(1.0, 0.0, 0.0) : normalize(side);
  float across = position.x * uWidth * (0.15 + 0.85 * pow(position.y, 1.4));
  vJ = vec2(across, position.y);
  vBoost = 0.45 + 0.55 * smoothstep(-0.5, 0.5, dot(axis, normalize(-base.xyz)));
  vec3 p = base.xyz + axis * position.y * uLen + side * across;
  gl_Position = projectionMatrix * vec4(p, 1.0);
}
`;

export const JET_FRAG = /* glsl */ `
uniform float uTime, uOn, uSeed, uLen;
varying vec2 vJ;
varying float vBoost;
${COMMON}
void main(){
  float y = vJ.y;
  float px = max(fwidth(vJ.x), 1e-5);                       // a pixel, in galaxy radii across the jet
  float c = 0.005 * y * sin(y * 13.0 - uTime * 0.4 + uSeed) + 0.012 * y * y * (gN(vec2(y * 3.0, uSeed)) - 0.5);
  float ax = vJ.x - c;
  float w = 0.0016 + 0.007 * y, wp = max(w, 0.8 * px);      // the beam's half-width, and as drawn
  float core = exp(-pow(ax / wp, 2.0)) * sqrt(w / wp);
  float sw = max(w * 5.0, 1.6 * px);
  float sheath = exp(-pow(ax / sw, 2.0)) * sqrt(min(1.0, w * 5.0 / sw));
  // knots riding out on it, bright near the hole and fewer further out; and the bristles drawn along the sheath
  float knots = smoothstep(0.35, 0.80, gN(vec2(y * uLen * 16.0 - uTime * 0.08, uSeed + 3.0)));
  float streak = gN(vec2(y * 7.0 - uTime * 0.02, ax / sw * 3.0 + uSeed));
  float fall = exp(-y * 2.2);
  float run = smoothstep(0.0, 0.04, y) * (1.0 - smoothstep(0.66, 0.9, y));
  float beam = (core * (0.25 + 0.75 * knots) * (0.25 + 0.75 * fall) * 0.6 + sheath * 0.26 * (0.35 + 0.65 * streak) * (0.4 + 0.6 * fall)) * run;
  // the hot spot and the lobe: the beam stopped by the gas round the galaxy, and the gas it lit, blown back
  vec2 lq = vec2(ax / 0.04, (y - 0.86) * uLen / 0.04);
  lq += (vec2(gN(lq * 1.4 + uSeed), gN(lq * 1.4 + uSeed + 7.0)) - 0.5) * 0.9;   // its edge torn by the gas
  float lobe = exp(-dot(lq, lq) * 1.3) * (0.40 + 0.60 * gN(lq * 2.6 + uSeed * 1.7));
  float hot = exp(-dot(lq, lq) * 9.0) * smoothstep(0.0, 0.5, 0.6 - lq.y);
  float s = 1.0 - exp(-1.2 * vBoost * (beam + lobe * 0.12 + hot * 0.25));
  vec3 col = mix(vec3(0.46, 0.54, 0.86), vec3(0.88, 0.92, 1.0), smoothstep(0.2, 0.7, core * knots));
  col = mix(col, vec3(0.58, 0.50, 0.82), clamp(lobe - core, 0.0, 1.0) * 0.5);
  gl_FragColor = vec4(col * gWash(s, max(fwidth(s) * 1.4, 0.006)) * uOn, 1.0);
}
`;

// The hole's own light on the core round it: what its disc throws, warm, laid in a few washes. Under the lens it
// comes round the shadow as a ring.
export const GLARE_FRAG = /* glsl */ `
uniform float uSeed, uOn;
varying vec2 vQ;
${COMMON}
void main(){
  float r = length(vQ);
  if (r > 1.0) discard;
  float I = (0.12 * exp(-r * r * 30.0) + 0.12 * exp(-r * 6.0)) * (0.80 + 0.35 * gN(vQ * 5.0 + uSeed)) * (1.0 - smoothstep(0.55, 1.0, r));
  float s = 1.0 - exp(-2.0 * I * uOn);
  vec3 c = mix(vec3(0.55, 0.22, 0.10), vec3(0.95, 0.66, 0.36), smoothstep(0.1, 0.5, s));
  gl_FragColor = vec4(c * gWash(s, max(fwidth(s) * 1.4, 0.006)), 1.0);
}
`;

// The lens: the frame bent round the hole as a point mass bends it (the source a pixel shows is beta = theta -
// E^2 / theta from the hole, E the Einstein radius), so the light behind it comes round as a ring and the arms
// behind it bow round it. Only the far side is behind the hole: the bend is full above the disc's line of nodes
// on the sheet and none below it, where the disc passes in front, and eased between. galaxy.js reads its marks
// through the same law, so a picked star is where it is drawn. While a week is picked (uQuiet 1) the galaxy round its
// painting is kept quiet: the bright arms, the nebulae and the sparkle pressed down the most, the dark the least, and
// their color softened, so the painting has the light; at 0 the frame is untouched. What the scene marks to keep (its
// alpha drawn toward 0: the picked week's own system, galaxy-system.js) is left as it is.
export const WARP_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uResolution, uHole;
uniform float uE, uTilt, uQuiet;
varying vec2 vUv;
void main(){
  vec2 px = vUv * uResolution;
  vec2 d = px - uHole;
  float th = max(length(d), 1e-3);
  float k = smoothstep(-0.6, 0.3, (-sin(uTilt) * d.x + cos(uTilt) * d.y) / th);
  vec2 src = uHole + d * (1.0 - k * uE * uE / (th * th));
  vec4 t = texture2D(tDiffuse, src / uResolution);
  vec3 c = t.rgb;
  float l = dot(c, vec3(0.30, 0.59, 0.11)), q = uQuiet * t.a;
  c = mix(c, vec3(l), 0.3 * q) * (1.0 - 0.25 * q) / (1.0 + 1.6 * q * l);
  gl_FragColor = vec4(c, 1.0);
}
`;

// The comeback's dwarf galaxy: the unresolved light of a small old galaxy, warm, drawn out along its stream by the
// tide (uStretch: the stream's way on the sheet), brighter while its week is picked (uLit). Its light is mottled
// (it is made of stars, not mist), its edge ragged where the tide pulls at it, and a small brighter nucleus sits
// a little off its middle, as a dwarf's often does.
export const DWARF_FRAG = /* glsl */ `
uniform vec2 uStretch;
uniform float uLit;
varying vec2 vQ;
${COMMON}
void main(){
  float r2 = dot(vQ, vQ);
  if (r2 > 1.0) discard;
  vec2 d = vec2(dot(vQ, uStretch), dot(vQ, vec2(-uStretch.y, uStretch.x)));
  float e2 = (d.x * d.x * 0.5 + d.y * d.y * 1.7) * (0.82 + 0.36 * gN(d * 3.4 + 4.1));
  float mottle = 0.72 + 0.28 * gN(d * 9.0 + 1.7) + 0.16 * (gN(d * 23.0 + 8.3) - 0.5);
  vec2 o = d - vec2(0.05, 0.015);
  // big on the screen it is resolved: its stars carry it, and the unresolved light between them thins
  float resolved = smoothstep(0.004, 0.0015, fwidth(vQ.x));
  float v = (exp(-e2 * 7.0) * 0.6 + exp(-e2 * 32.0) * 0.4) * mottle * (1.0 - smoothstep(0.55, 1.0, sqrt(r2))) * (1.0 - 0.55 * resolved) + 0.35 * exp(-dot(o, o) * 700.0);
  gl_FragColor = vec4(mix(vec3(0.70, 0.56, 0.42), vec3(1.0, 0.90, 0.74), clamp(v, 0.0, 1.0)) * v * (0.44 + 0.40 * uLit), 1.0);
}
`;

// The stream's haze: soft dabs sized in the galaxy (aSize, galaxy radii across their half), so the stars torn out
// of the dwarf lie in a faint ribbon of their own unresolved light, brighter while its week is picked (uLit).
export const HAZE_VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
uniform float uScale, uLit;
varying vec3 vColor;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float px = aSize * uScale / -mv.z;
  gl_PointSize = clamp(2.0 * px, 2.0, 256.0);
  vColor = aColor * min(1.0, px) * (1.0 + 1.4 * uLit);
  gl_Position = projectionMatrix * mv;
}
`;

export const HAZE_FRAG = /* glsl */ `
varying vec3 vColor;
void main(){
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(q, q);
  if (d2 > 1.0) discard;
  gl_FragColor = vec4(vColor * exp(-d2 * 3.0) * (1.0 - d2), 1.0);
}
`;

// The nebulae of star birth along an arm's outer edge, where a run of regular weeks went: glows of the hydrogen the
// young stars inside light up, rose let down toward a paler heart where the gas is hottest and kept to a glaze where
// it is thin; a glow and not a disc, no edge anywhere, its shape blown about by the stars' wind once the sprite has
// the pixels to show it. Each is sized in the galaxy (aSize, galaxy radii across its half), and under a pixel dimmed
// as it is spread; its own salt comes from where it stands. Big on the screen it comes apart: the gas combed into
// filaments, a lane of dust across it, the washes' edges let out wide (gas, not cut paper), and the few hot young
// stars that light it, points of blue-white inside.
export const NEBULA_VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
uniform float uScale;
varying vec3 vColor;
varying float vSeed, vPx;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float px = aSize * uScale / -mv.z;
  gl_PointSize = clamp(2.0 * px, 2.0, 256.0);
  vPx = gl_PointSize;
  vColor = aColor * min(1.0, px * px);
  vSeed = fract(position.x * 91.7 + position.z * 37.3) * 50.0;
  gl_Position = projectionMatrix * mv;
}
`;

export const NEBULA_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vSeed, vPx;
${COMMON}
void main(){
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(q, q);
  if (d2 > 1.0) discard;
  float k = smoothstep(14.0, 40.0, vPx), near = smoothstep(50.0, 150.0, vPx);
  vec2 o = q + (vec2(gN(q * 1.6 + vSeed), gN(q * 1.6 - vSeed + 3.0)) - 0.5) * 0.8 * k;
  float g2 = dot(o, o);
  float n = gN(q * 2.2 + vSeed) * 0.65 + gN(q * 5.5 - vSeed) * 0.35;
  float body = (exp(-g2 * 14.0) * 0.55 + exp(-g2 * 3.0) * 0.30) * mix(1.0, 0.4 + 0.9 * n, k);
  vec3 young = vec3(0.0);
  if (near > 0.0) {
    float fil = pow(1.0 - abs(2.0 * gN(vec2(q.x * 7.0 + q.y * 3.0, q.y * 13.0) + vSeed * 1.7) - 1.0), 3.0);
    float lane = smoothstep(0.55, 0.85, gN(q * vec2(1.4, 6.0) + vSeed * 0.7));
    body *= mix(1.0, (0.5 + 0.8 * fil) * (1.0 - 0.7 * lane), near);
    for (int i = 0; i < 3; i++) {
      vec2 at = (vec2(gH(vec2(vSeed, float(i))), gH(vec2(float(i), vSeed))) - 0.5) * 0.9 - q;
      young += vec3(0.80, 0.88, 1.0) * exp(-dot(at, at) * vPx * vPx * 0.35) * (0.6 + 0.4 * gH(vec2(vSeed + float(i), 3.0)));
    }
  }
  float s = 1.0 - exp(-1.5 * body);
  vec3 rose = vColor * vec3(1.0, 1.02, 0.86);
  vec3 c = mix(rose, rose * 0.45 + vec3(0.54, 0.45, 0.44), smoothstep(0.4, 0.85, s) * 0.6);
  gl_FragColor = vec4(c * gWash(s, max(fwidth(s) * 1.4, 0.02) + 0.12 * k) * 0.75 * (1.0 - smoothstep(0.3, 1.0, d2)) + young * near, 1.0);
}
`;

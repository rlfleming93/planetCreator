/* Planet Creator — the week's life: the whales (life.js).
 *
 * A pod for every swim and for every dozen kilometres of the long run, as the
 * week always kept them — but met where they are met, from the shore. A whale
 * comes up and blows three times, a breath every eleven seconds or so, its
 * dark back rolling over after each one; then, a week that swam breaches — the
 * humpback drives up out of the sea nearly whole, its long white flippers
 * flung out, hangs, and goes over backwards into a crown of white water that
 * stands and drifts as mist — and a week that only ran lifts its flukes and
 * slips under. Then nothing for a while: the sea is mostly empty, and a breach
 * is rare.
 *
 * It breaches only where the eye can see the water all round it: open sea in
 * front of the shore, short of the horizon (the world is small — the horizon
 * is forty units off), its waterline in sight across its whole breadth and the
 * water before it too. With no such water in view a whale only blows, far out,
 * a pale breath over the horizon or the shore; the second whale always does.
 *
 * Each whale is one sheet stood on the water and turned to the eye, drawn in
 * the shader at true scale (a humpback is fourteen units long) in the house's
 * washes: a slim stock, the long curve of the back, a deep pleated throat on a
 * long lower jaw, the flippers near a third of its length and knobbed along
 * their leading edge. The back a dark flat wash, the flank the light falls on a
 * step lighter, the throat pale and mottled into the dark with its pleats run
 * along it, the pigment dried darker on the shaded edge and the paper showing
 * where the brush broke on the lit one. The white water is heaped, torn and
 * thrown in paper with a cool shade side, never a skirt: a breach comes up
 * through churned water that hides where it meets the sea; a dive's back
 * slides under in a long low arch, broad where it meets the sea, and its broad
 * dark flukes clear the water low on a short stock, the sea pouring off them
 * in short broken strings. Foam lies on the water as flat as the eye stands
 * high, and rings and a smooth slick are left. All of it goes into the air
 * with distance. Nothing moves on the CPU: the clock is the whole schedule,
 * and the near whale comes up a moment and a half after landing. */
import { NOISE, TAU, clamp, instancedQuad, num, tangentFrame } from './life-kit.js';

const L = 14;          // a humpback, in units
const BLOW = [3, 14, 25];
const EVENT = 37;      // when the breach (or the dive) comes in its cycle
const EVENT_S = 9;     // how long the breach and its white water last

const VERT = /* glsl */ `
attribute vec4 aHome;   // the whale's water (unit) and the sea's radius
attribute vec4 aHead;   // the way it swims (tangent), its speed
attribute vec4 aTime;   // its cycle (s), phase, breaches (1), dives (0) or only blows (-1), seed
attribute vec4 aLook;   // length, rank
uniform float uTime, uFoot, uAmount;
uniform vec3 uSun;
varying vec2 vQ;
varying vec4 vEv;       // breach (0..1, or -1), dive (0..1, or -1), blow age (s, or -1), back (0..1, or -1)
varying float vDist, vSide, vSeed, vL, vDirX, vTilt, vFore;
void main(){
  float P = aTime.x;
  float t = mod(uTime + aTime.y, P);
  float blow = -1.0, back = -1.0;
  for (int k = 0; k < 3; k++) {
    float b = ${BLOW[0].toFixed(1)} + float(k) * ${(BLOW[1] - BLOW[0]).toFixed(1)};
    if (t >= b - 1.2 && t <= b + 2.8) back = (t - (b - 1.2)) / 4.0;
    if (t >= b && t <= b + 4.5) blow = t - b;
  }
  float e = (t - ${EVENT.toFixed(1)}) / ${EVENT_S.toFixed(1)};
  float ev = e >= 0.0 && e <= 1.0 ? e : -1.0;
  vEv = vec4(aTime.z > 0.5 ? ev : -1.0, abs(aTime.z) < 0.5 ? ev : -1.0, blow, back);
  bool on = vEv.x >= 0.0 || vEv.y >= 0.0 || blow >= 0.0 || back >= 0.0;
  // it swims on through its cycle
  vec3 up = aHome.xyz;
  vec3 C = normalize(up + aHead.xyz * (aHead.w * (t - ${EVENT.toFixed(1)}) / aHome.w)) * aHome.w;
  up = normalize(C);
  vec3 ax = cross(up, cameraPosition - C);
  ax = length(ax) > 1e-3 ? normalize(ax) : normalize(cross(up, vec3(1.0, 0.0, 0.0)));
  vL = aLook.x;
  // across 2.4 lengths; from a fifth of a length under the water (where the
  // foam lying on it in front is drawn, as flat as the eye stands high) to
  // most of a length over it
  vec2 q = vec2(position.x * 2.4, position.y * 1.05 + 0.325) * aLook.x;
  vQ = q;
  vec3 world = C + ax * q.x + up * q.y;
  vSide = dot(uSun, ax);
  float hx = dot(aHead.xyz, ax);
  vDirX = hx >= 0.0 ? 1.0 : -1.0;
  // how side-on it swims to the eye: 1 across the view, 0 straight away
  vFore = clamp(abs(hx) / max(length(aHead.xyz), 1e-4), 0.0, 1.0);
  vSeed = aTime.w;
  vec3 toC = cameraPosition - C;
  vDist = length(toC);
  vTilt = clamp(dot(toC / max(vDist, 1e-4), up), 0.03, 0.7);
  // brought toward the eye along its own line of sight, so the foam lying on
  // the water in front of it is never under the sea's own surface
  vec3 toW = cameraPosition - world;
  world += toW / max(length(toW), 1e-4) * 0.32 * aLook.x;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  if (!on || aLook.y >= uAmount || uFoot <= 0.001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uBack, uFlank, uBelly, uPaper, uShade, uInk, uFar, uMist;
uniform float uFoot, uFogBase, uTime;
varying vec2 vQ;
varying vec4 vEv;
varying float vDist, vSide, vSeed, vL, vDirX, vTilt, vFore;
${NOISE}
vec2 rot(vec2 v, float a){ float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
// A humpback in profile, in its own frame (x along it from the tail stock, y
// toward its back): a slim stock, the back's long low curve fullest behind the
// flippers, a deep throat on a long lower jaw under a flat knobbed head, the
// whole of it bowed by arch. Its distance (units), and where along it (t, 0 the
// stock … 1 the snout) and across it (side, -1 the belly's edge … 1 the back's)
float humpD(vec2 p, float L, float arch, out float t, out float side){
  t = clamp(p.x / L, 0.0, 1.0);
  p.y -= arch * L * 4.0 * t * (1.0 - t);
  // the head keeps its depth to a blunt, rounded snout, the jaw the fuller
  float h = min(t, 0.9);
  float v = pow(h, 1.35), u = pow(h, 1.65);
  float end = sqrt(max(1.0 - pow(max(t - 0.9, 0.0) / 0.1, 2.0), 0.0));
  float back = (0.4 * v * (1.0 - v) + 0.008) * end
             + 0.005 * smoothstep(0.8, 0.86, t) * (1.0 - smoothstep(0.95, 0.99, t)) * (0.5 + 0.5 * cos(t * 150.0));
  float belly = (0.56 * u * (1.0 - u) + 0.012) * sqrt(end);
  float r = max((p.y >= 0.0 ? back : belly) * L, 1e-3);
  side = clamp(p.y / r, -1.0, 1.0);
  return max(abs(p.y) - r, max(-p.x, p.x - L));
}
// A pectoral flipper: a long blade from its root, bowed forward and swept back
// at the tip, a fifth as broad as it is long at its widest, knobbed along its
// leading edge. Its distance (units), how far out along it (u) and which side
// of it a point is on (lead: 1 the leading edge's, -1 the trailing's)
float flipper(vec2 p, vec2 a, vec2 dir, float len, out float u, out float lead){
  vec2 perp = vec2(-dir.y, dir.x);
  float hs = perp.x >= 0.0 ? 1.0 : -1.0;      // which side of it is toward the head
  vec2 c = a + dir * len * 0.5 + perp * hs * len * 0.05;
  vec2 b = a + dir * len - perp * hs * len * 0.14;
  float best = 1e3;
  u = 0.0;
  lead = 1.0;
  vec2 p0 = a;
  for (int i = 1; i <= 4; i++) {
    float s1 = float(i) / 4.0;
    vec2 p1 = mix(mix(a, c, s1), mix(c, b, s1), s1);
    vec2 ba = p1 - p0, pa = p - p0;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
    float uu = (float(i) - 1.0 + h) / 4.0;
    float ld = -(pa.x * ba.y - pa.y * ba.x) * hs >= 0.0 ? 1.0 : -1.0;
    float w = len * (0.075 * sin(3.1416 * pow(uu, 0.7)) + 0.02) * (1.0 - 0.55 * uu * uu);
    w += step(0.0, ld) * len * 0.02 * (0.5 + 0.5 * cos(uu * 52.0)) * (1.0 - uu);
    float d = length(pa - ba * h) - w;
    if (d < best) { best = d; u = uu; lead = ld; }
    p0 = p1;
  }
  return best;
}
// one wash laid over another, back to front
void over(inout vec3 c, inout float a, vec3 sc, float sa){
  float na = sa + a * (1.0 - sa);
  c = (sc * sa + c * a * (1.0 - sa)) / max(na, 1e-4);
  a = na;
}
// how far outside a patch lying on the water about x0, r across, in the
// water's own units: the eye sees it as flat as it stands high
float onWater(vec2 q, float x0, float r){ return length(vec2(q.x - x0, q.y / vTilt)) - r; }
float inside(float d){ return 1.0 - inkPixel(d, max(fwidth(d), 1e-4)); }
// white water thrown up off the sea: a mound of rounded heaps about x0, w
// across and h high at its middle, none of a size or in a row, lesser clots
// of spray torn off its top; its distance (units), and how far a point is
// toward the side of the heap it is on away from the light (sun: -1 or 1)
float heap(vec2 q, float x0, float w, float h, float seed, float sun, out float shade){
  float d = 1e3;
  shade = 0.0;
  if (h < 1e-3 * w) return 1e3;
  for (int k = 0; k < 9; k++) {
    float fk = float(k);
    float h1 = inkH12(vec2(fk, seed)), h2 = inkH12(vec2(fk + 5.3, seed)), h3 = inkH12(vec2(fk + 9.1, seed));
    float clot = step(5.0, fk);
    float u = (h1 - 0.5) * mix(1.7, 1.2, clot);
    float hk = h * (1.0 - 0.7 * u * u) * mix(0.6 + 0.5 * h2, 0.9 + 0.5 * h2, clot);
    vec2 c = vec2(x0 + u * w * 0.5, hk * mix(0.35, 0.85, clot));
    vec2 r = mix(vec2(w * (0.12 + 0.1 * h3), hk * 0.65), vec2(w * (0.04 + 0.04 * h3)), clot) + 1e-3;
    vec2 o = (q - c) / r;
    float dk = (length(o) - 1.0) * min(r.x, r.y);
    if (dk < d) { d = dk; shade = dot(normalize(o + 1e-4), vec2(-sun, 0.35)); }
  }
  return d + (inkN2(q * (16.0 / max(w, 1e-3)) + seed * 3.0) - 0.5) * 0.05 * w;
}
void main(){
  vec2 q = vQ;
  float Lw = vL;
  float sun = vSide >= 0.0 ? 1.0 : -1.0;
  vec2 sun2 = normalize(vec2(vSide, 0.75));
  vec3 bodyC = uBack;
  float bodyA = 0.0;
  float white = 0.0, mist = 0.0, foam = 0.0, slick = 0.0;
  float shadeW = 0.0;                     // the shaded side of the white water
  float dU = 1e3;                         // the whale's own outline, for its contour
  // ---- the breach: it drives up out of the sea at a slant, hangs with most of
  // its length clear, and goes over onto its back; turned to or from the eye
  // it is foreshortened along its length
  if (vEv.x >= 0.0) {
    float s = vEv.x * ${(EVENT_S / 4.4).toFixed(3)};      // the whale's own part is the first 4.4 s
    if (s <= 1.0) {
      float yc = Lw * (-0.36 + 2.1 * s * (1.0 - s));
      float pitch = radians(60.0 + 102.0 * smoothstep(0.3, 0.95, s));
      vec2 axis = vec2(cos(pitch) * vDirX, sin(pitch));
      vec2 backD = vDirX * vec2(-axis.y, axis.x);         // toward its back, on the sheet
      vec2 com = vec2(vDirX * (s - 0.4) * 0.26 * Lw, yc);
      vec2 rel = q - com;
      vec2 p = vec2(dot(rel, axis) / mix(0.72, 1.0, vFore) + 0.52 * Lw, dot(rel, backD));
      // bowed up as it rises, and back the other way as it goes over; the
      // stock still bent under it as it leaves the water, never a rigid spar
      float arch = 0.06 - 0.1 * smoothstep(0.35, 0.85, s);
      p.y += 0.09 * Lw * (1.0 - smoothstep(0.25, 0.7, s)) * pow(1.0 - clamp(p.x / Lw, 0.0, 1.0), 3.0);
      float t, side;
      float d = humpD(p, Lw, arch, t, side);
      // the small fin on its hump, a third of the way up from the stock
      float fy = arch * 0.88 * Lw;
      d = min(d, inkSeg(p, vec2(0.37 * Lw, 0.068 * Lw + fy), vec2(0.315 * Lw, 0.108 * Lw + fy), 0.017 * Lw, 0.003 * Lw));
      // the flippers, near a third of its length: held along the throat as it
      // comes up, flung out wide as it hangs, the far one showing over its back
      float spread = smoothstep(0.12, 0.42, s) * (1.0 - smoothstep(0.62, 0.92, s));
      vec2 root = vec2(0.7 * Lw, -0.07 * Lw + arch * 0.84 * Lw);
      float a1 = 3.1416 + 0.3 + 1.15 * spread, a2 = 3.1416 - 0.25 - 1.05 * spread;
      float u1, l1, u2, l2;
      float f1 = flipper(p, root, vec2(cos(a1), sin(a1)), 0.31 * Lw, u1, l1);
      float f2 = flipper(p, root + vec2(-0.01, 0.04) * Lw, vec2(cos(a2), sin(a2)), 0.26 * Lw, u2, l2);
      float whale = min(d, min(f1, f2));
      dU = whale;
      float fwW = max(fwidth(whale), 1e-4);
      float fwB = max(fwidth(d), 1e-4);
      float inB = 1.0 - inkPixel(d, fwB);
      float n1 = 1.0 - inkPixel(f1, max(fwidth(f1), 1e-4));
      float n2 = (1.0 - inkPixel(f2, max(fwidth(f2), 1e-4))) * (1.0 - inB) * (1.0 - n1);
      // the washes, on edges the hand wanders: the back dark; the flank the
      // light falls on a step lighter; the throat and the belly pale, mottled
      // into the dark, the long pleats run along them and broken
      float wob = inkF2(p * (2.6 / Lw) + vSeed * 7.0) - 0.5;
      float lk = side * dot(backD, sun2) + 0.25 * sqrt(max(1.0 - side * side, 0.0)) + 0.45 * wob;
      float flank = inkPixel(lk - 0.3, max(fwidth(lk), 1e-3));
      float mott = 0.5 * wob + 0.3 * (inkN2(p * (11.0 / Lw) + vSeed * 3.0) - 0.5);
      float pale = step(side, -0.38 + mott) * smoothstep(0.4, 0.48, t + 0.08 * wob);
      float pleat = pale * step(0.84, fract((side + 1.0) * 3.4 + 0.1 * sin(t * 8.0 + vSeed))) * step(0.3, inkN2(vec2(t * 16.0, side * 3.0) + vSeed * 3.0)) * smoothstep(0.48, 0.6, t);
      vec3 c = mix(uBack, uFlank, flank);
      c = mix(c, uBelly, pale);
      c = mix(c, mix(uBelly, uBack, 0.45), pleat);
      // the pigment dried darker along the edge in the shade, and the paper
      // where the brush broke on the lit edge
      float rimB = (1.0 - inkPixel(-d - 1.6 * fwB, fwB)) * (1.0 - flank) * (1.0 - pale);
      c = mix(c, mix(uBack, uInk, 0.55), rimB * 0.8);
      float brk = (1.0 - inkPixel(-d - 2.2 * fwB, fwB)) * flank * step(0.6, inkN2(p * (22.0 / Lw) + vSeed));
      c = mix(c, uPaper, brk * 0.7);
      // the near flipper white, its trailing side and its tip in a cool wash;
      // the far one in its own shade
      c = mix(c, mix(uPaper, uShade, step(l1, 0.0) * 0.7 + 0.2 * step(0.82, u1)), n1);
      c = mix(c, mix(uShade, uBack, 0.3), n2);
      bodyC = c;
      bodyA = max(inB, max(n1, n2));
      // the sea pouring off it: sheets down its flanks, and strings falling
      // close under the flippers and the jaw
      float sheet = inB * step(0.58, inkN2(vec2(p.x * (12.0 / Lw) - uTime * 3.0, side * 2.5 + vSeed * 9.0))) * smoothstep(0.5, 0.95, abs(side));
      vec2 below = vec2(q.x * (34.0 / Lw), q.y * (0.8 / Lw) + uTime * 1.6);
      float strings = step(0.8, inkN2(below + vSeed * 4.0)) * (1.0 - inkPixel(whale - 0.06 * Lw, fwW)) * inkPixel(whale, fwW);
      white = max(white, max(sheet * 0.7, strings * 0.75));
      // where it comes out of the sea white water heaps up round it, highest
      // against the body and torn at its top, spray spitting off it, so the
      // body's foot is never seen; it falls in as the whale goes over
      float xw = com.x - axis.x * com.y / max(axis.y, 0.25);
      float hc = Lw * (0.035 + 0.055 * smoothstep(0.02, 0.2, s)) * (1.0 - smoothstep(0.55, 0.88, s));
      float shc;
      float collar = inside(heap(q, xw, Lw * (0.5 + 0.14 * s), hc, vSeed * 7.0, sun, shc));
      white = max(white, collar);
      shadeW = max(shadeW, collar * smoothstep(0.0, 0.5, shc) * 0.7);
      float sp = 1e3;
      for (int k = 0; k < 10; k++) {
        float fk = float(k);
        float h1 = inkH12(vec2(fk, vSeed * 13.0)), h2 = inkH12(vec2(fk + 4.1, vSeed * 2.0));
        float ph = fract(uTime * (0.6 + 0.5 * h2) + h1);
        vec2 c = vec2(xw + (h1 - 0.5) * 0.5 * Lw * (0.5 + ph), hc * (0.8 + 1.4 * ph - 1.2 * ph * ph));
        sp = min(sp, length(q - c) - Lw * (0.006 + 0.008 * h2) * (1.0 - 0.5 * ph));
      }
      white = max(white, inside(sp) * step(0.01 * Lw, hc));
      // and the churned water lying about it on the sea
      foam = max(foam, inside(onWater(q, xw, Lw * (0.24 + 0.16 * s)) + (inkN2(vec2(q.x, q.y / vTilt) * (8.0 / Lw) + vSeed * 3.0) - 0.5) * 0.14 * Lw));
    }
    // the crown of white water it falls into, the spray, then the mist, and
    // rings of foam spreading on the water
    float ts = (vEv.x * ${EVENT_S.toFixed(1)}) - 3.35;
    if (ts > 0.0) {
      vec2 at = vec2(vDirX * 0.12 * Lw, 0.0);
      // a great heap of white water where it went in, thrown up and falling
      // back, its top torn into thin jets with a drop at each end
      float grow = smoothstep(0.0, 0.6, ts), fall = smoothstep(0.8, 3.0, ts);
      float hh = Lw * 0.36 * grow * (1.0 - 0.8 * fall);
      float sh;
      float sd = heap(q, at.x, Lw * (0.5 + 0.25 * ts), hh, vSeed * 11.0, sun, sh);
      for (int k = 0; k < 5; k++) {
        float fk = float(k);
        float h1 = inkH12(vec2(fk, vSeed * 7.0)), h2 = inkH12(vec2(fk + 3.1, vSeed * 3.0));
        float u = (h1 - 0.5) * 1.8;
        vec2 b = at + vec2(u * 0.16 * Lw, hh * 0.6);
        vec2 dir = normalize(vec2(u * (0.8 + 0.6 * h2), 1.0));
        float len = Lw * (0.12 + 0.22 * h2) * (1.0 - 0.4 * u * u) * grow * (1.0 - 0.9 * fall);
        vec2 tip = b + dir * len + vec2(u * fall * 0.1 * Lw, 0.0);
        sd = min(sd, min(inkSeg(q, b, tip, Lw * (0.012 + 0.008 * h1), Lw * 0.003), length(q - tip - dir * Lw * 0.03) - Lw * (0.007 + 0.006 * h2)));
      }
      // the spray: drops thrown wide, falling
      float drops = 1e3;
      for (int k = 0; k < 18; k++) {
        float fk = float(k);
        float h1 = inkH12(vec2(fk, vSeed * 11.0)), h2 = inkH12(vec2(fk + 7.3, vSeed * 5.0));
        float ang = (h1 - 0.5) * 2.4;
        float v = Lw * (0.7 + 0.5 * h2);
        vec2 c = at + vec2(sin(ang) * v * ts * 0.6, cos(ang) * v * ts * 0.9 - 4.9 * ts * ts);
        drops = min(drops, length(q - c) - Lw * (0.008 + 0.014 * h2));
      }
      float fade = 1.0 - smoothstep(2.4, 3.8, ts);
      float wi = inside(sd) * fade;
      float dr = inside(drops) * (1.0 - smoothstep(1.4, 2.4, ts));
      white = max(white, max(wi, dr));
      // the side away from the light in a cool wash, its rim dried darker
      float rimW = inkPixel(sd + 1.5 * max(fwidth(sd), 1e-4), max(fwidth(sd), 1e-4)) * wi;
      shadeW = max(shadeW, wi * smoothstep(0.0, 0.5, sh) * 0.7 + rimW * 0.5);
      // the mist it leaves, drifting down the wind: a pale wash, broken
      vec2 mq = (q - at - vec2(ts * 0.5, Lw * 0.2)) / vec2(Lw * (0.28 + 0.07 * ts), Lw * (0.16 + 0.04 * ts));
      float md = length(mq) - 1.0 + (inkF2(q * (3.0 / Lw) + vSeed) - 0.5) * 0.7;
      mist = max(mist, inside(md) * smoothstep(1.0, 2.0, ts) * (1.0 - smoothstep(3.6, 6.0, ts)) * 0.5);
      // the white water spread on the sea, then rings of it opening, broken,
      // and the smooth slick inside them
      float spreadF = inside(onWater(q, at.x, Lw * (0.3 + 0.1 * ts)) + (inkN2(vec2(q.x, q.y / vTilt) * (8.0 / Lw) + vSeed) - 0.5) * 0.12 * Lw);
      float ring = abs(onWater(q, at.x, Lw * (0.36 + 0.2 * ts))) - Lw * 0.03;
      float rb = step(0.38, inkN2(vec2(atan(q.y / vTilt, q.x - at.x) * 2.5, vSeed * 9.0)));
      foam = max(foam, max(spreadF * (1.0 - smoothstep(1.5, 3.5, ts)), inside(ring) * rb) * (1.0 - smoothstep(3.5, 5.6, ts)));
      slick = max(slick, inside(onWater(q, at.x, Lw * (0.3 + 0.18 * ts))) * smoothstep(1.0, 2.5, ts) * (1.0 - smoothstep(4.0, 5.6, ts)));
    }
  }
  // ---- the dive: the back rolls up out of the sea and arches over, the tail
  // stock comes up out of the arch and the flukes clear the water low over it,
  // the sea running off them in short strings; they stand a moment, broad and
  // dark, and slip straight under, leaving a ring of foam and a smooth slick.
  // Met going away from the shore, so seen from behind and a little to one side
  if (vEv.y >= 0.0) {
    float s = vEv.y * ${(EVENT_S / 6.0).toFixed(3)};
    float rise = smoothstep(0.1, 0.5, s), sink = smoothstep(0.64, 0.96, s);
    if (s <= 1.0) {
      float hF = Lw * (0.085 * rise - 0.3 * sink);         // the flukes' root, low over the water
      vec2 b2 = vec2(vDirX * (0.02 - 0.05 * s) * Lw, hF);
      // the arch: the back sliding under, a long low curve up to the root —
      // broad where it meets the body and pinched to a slim stock only under
      // the flukes, shortening as the body goes down after its tail, never a post
      float reach = Lw * mix(0.24, 0.5, vFore) * (1.0 - 0.4 * smoothstep(0.15, 0.7, s));
      vec2 b0 = vec2(b2.x - vDirX * reach, -0.1 * Lw);
      vec2 b1 = vec2(b2.x - vDirX * reach * 0.25, mix(b0.y, b2.y, 0.35) + 0.07 * Lw * (1.0 - 0.4 * rise));
      float stock = 1e3;
      vec2 p0 = b0;
      for (int i = 1; i <= 6; i++) {
        float u0 = float(i - 1) / 6.0, u1 = float(i) / 6.0;
        vec2 p1 = mix(mix(b0, b1, u1), mix(b1, b2, u1), u1);
        stock = min(stock, inkSeg(q, p0, p1, Lw * mix(0.11, 0.026, pow(u0, 1.6)), Lw * mix(0.11, 0.026, pow(u1, 1.6))));
        p0 = p1;
      }
      // the flukes about the root: swept back to pointed tips, the trailing
      // edge scalloped and notched, the near blade broad and the far one
      // foreshortened, the tail rolled off the level and tipped as it rises
      float roll = vDirX * (0.35 - 0.45 * rise + 0.1 * sink) + (vSeed - 0.5) * 0.3;
      vec2 st = rot(q - b2, roll);
      float nearB = step(0.0, st.x * vDirX);
      float span = Lw * mix(0.17, 0.23, nearB) * mix(1.0, 0.8, vFore);
      float sy = 0.18 * Lw;
      float ax = abs(st.x);
      float tt = ax / span;
      float lo = sy * (0.04 + 0.12 * tt + mix(0.45, 0.3, nearB) * tt * tt * tt);
      float hi = sy * (0.3 + 0.14 * sin(3.1416 * min(tt, 1.0)) + mix(0.32, 0.2, nearB) * tt * tt * tt - 0.1 * tt)
               - sy * 0.07 * exp(-ax / sy * 18.0) - sy * 0.03 * (0.5 + 0.5 * sin(tt * 38.0)) * tt;
      float blade = max(max(lo - st.y, st.y - hi), ax - span);
      float fluke = min(stock, blade);
      dU = fluke;
      float fwB = max(fwidth(blade), 1e-4);
      float inBl = 1.0 - inkPixel(blade, fwB);
      // the stock dark, a step lighter along its top where the light falls;
      // the flukes' underside dark with white blazes of its own, the trailing
      // margin darkest, the far blade in its own shade, and the wet top edge
      // catching the sun where the brush broke
      vec2 ns = normalize(vec2(dFdx(stock), dFdy(stock)) + 1e-6);
      float topS = (1.0 - inkPixel(-stock - 0.02 * Lw, max(fwidth(stock), 1e-4))) * step(0.25, dot(ns, sun2));
      float pat = step(0.66, inkN2(st * (6.0 / Lw) + vSeed * 13.0)) * (1.0 - smoothstep(0.55, 0.85, tt)) * nearB;
      float margin = 1.0 - smoothstep(0.0, 0.08 * sy, hi - st.y);
      vec3 c = mix(uBack, uFlank, topS * (1.0 - inBl));
      c = mix(c, uBelly, pat * inBl * (1.0 - margin) * mix(0.55, 1.0, nearB));
      c = mix(c, mix(uBack, uInk, 0.35), margin * inBl * 0.8);
      c = mix(c, mix(uBack, uInk, 0.25), (1.0 - nearB) * inBl * 0.4);
      vec2 nb = normalize(vec2(dFdx(blade), dFdy(blade)) + 1e-6);
      float shine = inBl * (1.0 - inkPixel(-blade - 1.6 * fwB, fwB)) * step(0.2, dot(nb, sun2)) * step(0.4, inkN2(st * (30.0 / Lw) + vSeed));
      c = mix(c, uPaper, shine * 0.8);
      bodyC = c;
      bodyA = max(bodyA, inside(fluke));
      // the sea pouring off them: short strings hung from the blades' lower
      // edge, whole where they leave it and breaking into drops as they fall,
      // and white water heaped low where the drops land
      float pour = smoothstep(0.22, 0.38, s) * (1.0 - smoothstep(0.8, 0.95, s));
      float strand = 1e3, spanM = Lw * 0.2 * mix(1.0, 0.8, vFore);
      for (int k = 0; k < 6; k++) {
        float fk = float(k);
        float h1 = inkH12(vec2(fk, vSeed * 5.0)), h2 = inkH12(vec2(fk + 2.7, vSeed * 9.0));
        float xk = b2.x + (fk / 2.5 - 1.0 + (h1 - 0.5) * 0.3) * spanM * 0.7;
        float ek = min(abs(xk - b2.x) / spanM, 1.0);
        float yk = hF + sy * (0.04 + 0.12 * ek + 0.35 * ek * ek * ek) - (xk - b2.x) * roll;
        float len = yk * (0.22 + 0.25 * h2);
        float fl = clamp((yk - q.y) / max(len, 1e-3), 0.0, 1.0);
        float kept = step(0.32 + 0.45 * fl, inkN2(vec2(fk * 3.7, q.y * (7.0 / Lw) + uTime * 7.0 + h2 * 9.0)));
        float dk = abs(q.x - xk - fl * fl * (h2 - 0.5) * 0.05 * Lw) - Lw * (0.0035 + 0.0035 * h2) * (1.0 - 0.6 * fl);
        dk = max(dk, max(q.y - yk, yk - len - q.y));
        strand = min(strand, mix(1e3, dk, kept));
      }
      white = max(white, inside(strand) * pour * step(0.0, blade) * 0.8);
      float shF;
      float hpF = inside(heap(q, b2.x, spanM * 1.1, Lw * 0.025 * pour, vSeed * 3.0, sun, shF));
      float mx = (b0.x + b2.x) * 0.5;
      white = max(white, hpF);
      shadeW = max(shadeW, hpF * smoothstep(0.0, 0.5, shF) * 0.7);
      // the churned foam lying about it, and the smooth slick it leaves
      foam = max(foam, inside(onWater(q, mx, abs(b2.x - b0.x) * 0.6 + Lw * 0.12) + (inkN2(vec2(q.x, q.y / vTilt) * (9.0 / Lw) + vSeed) - 0.5) * 0.1 * Lw) * smoothstep(0.05, 0.25, s) * 0.85);
      slick = max(slick, inside(onWater(q, mx, Lw * 0.32)) * smoothstep(0.3, 0.6, s));
    }
    // after they have gone under: a ring of foam opening, broken, and the
    // slick going smooth inside it
    float tg = vEv.y * ${EVENT_S.toFixed(1)} - 5.6;
    if (tg > 0.0) {
      float xg = vDirX * -0.03 * Lw;
      float ring = abs(onWater(q, xg, Lw * (0.14 + 0.12 * tg))) - Lw * 0.025;
      float rb = step(0.4, inkN2(vec2(atan(q.y / vTilt, q.x - xg) * 2.5, vSeed * 9.0)));
      foam = max(foam, inside(ring) * rb * (1.0 - smoothstep(1.5, 3.4, tg)));
      slick = max(slick, inside(onWater(q, xg, Lw * (0.12 + 0.1 * tg))) * (1.0 - smoothstep(2.0, 3.4, tg)));
    }
  }
  // ---- the back rolling over between breaths, its small fin last
  if (vEv.w >= 0.0) {
    float s = vEv.w;
    float rise = smoothstep(0.0, 0.25, s) * (1.0 - smoothstep(0.7, 1.0, s));
    vec2 c = vec2(vDirX * (s - 0.5) * 0.35 * Lw, -0.06 * Lw);
    vec2 p = (q - c) / vec2(0.3 * Lw, 0.06 * Lw + 0.05 * Lw * rise);
    float hump = (length(p) - 1.0) * 0.06 * Lw;
    vec2 fin = c + vec2(-vDirX * (0.12 - 0.3 * s) * Lw, 0.06 * Lw * rise);
    float dfin = inkSeg(q, fin - vec2(0.02 * Lw * vDirX, 0.0), fin + vec2(-0.03 * Lw * vDirX, 0.035 * Lw * rise), 0.018 * Lw, 0.004 * Lw);
    float b = min(hump, dfin);
    dU = min(dU, b);
    bodyA = max(bodyA, inside(b) * step(0.02, rise));
    foam = max(foam, inside(onWater(q, c.x, 0.3 * Lw) + (inkN2(vec2(q.x, q.y / vTilt) * (10.0 / Lw) + vSeed) - 0.5) * 0.08 * Lw) * rise * 0.6);
  }
  // ---- the blow: a column of breath that stands, leans with the wind and goes
  if (vEv.z >= 0.0) {
    float a = vEv.z;
    float h = Lw * 0.36 * smoothstep(0.0, 0.5, a);
    vec2 base = vec2(vDirX * (0.12 - 0.2) * Lw, 0.0);
    float sd = 1e3;
    for (int k = 0; k < 6; k++) {
      float u = float(k) / 5.0;
      vec2 c = base + vec2(0.6 * a * u * u * Lw * 0.06 + (inkH12(vec2(float(k), vSeed)) - 0.5) * 0.3, h * (0.25 + 0.75 * u));
      float r = Lw * (0.018 + 0.05 * u * u) * (1.0 + 0.35 * a);
      sd = min(sd, length(q - c) - r);
    }
    sd += (inkN2(q * 2.2 + vec2(0.0, -uTime * 1.5) + vSeed) - 0.5) * 0.5;
    white = max(white, inside(sd) * (1.0 - smoothstep(1.2, 4.5, a)) * 0.75);
  }
  // ---- the paint, and the air between. Back to front: the slick and the far
  // half of the foam lying on the water, the mist, the whale (only over the
  // sea) with its broken contour, the white water standing over it, and the
  // near half of the foam, in front of its foot
  float above = step(0.0, q.y);
  bodyA *= above; white *= above; mist *= above;
  float fu = max(fwidth(dU), 1e-4);
  float edge = (1.0 - inkPixel(-dU - 1.2 * fu, fu)) * step(0.3, inkN2(q * (20.0 / Lw) + vSeed));
  vec3 col = uPaper;
  float a = 0.0;
  over(col, a, uPaper, slick * 0.28);
  over(col, a, mix(uPaper, uShade, 0.3), foam * above * 0.85);
  over(col, a, uPaper, mist * 0.45);
  over(col, a, mix(bodyC, uInk, edge * 0.45), bodyA);
  over(col, a, mix(uPaper, uShade, shadeW * 0.55), white);
  over(col, a, mix(uPaper, uShade, 0.12), foam * (1.0 - above) * 0.9);
  float span = mix(130.0, 330.0, step(100.0, uFogBase));
  float air = smoothstep(uFogBase, uFogBase + span, vDist) * 0.88;
  float lv = dot(col, vec3(0.32, 0.55, 0.13));
  col = mix(col, uFar * (0.8 + 0.32 * smoothstep(0.16, 0.94, lv)), air);
  col = mix(col, uMist, smoothstep(uFogBase + 40.0, uFogBase + 160.0, vDist) * 0.35);
  a *= uFoot;
  if (a < 0.02) discard;
  gl_FragColor = vec4(col, a);
}
`;

/** How many whales the week keeps, whether they breach, and why; null for none. */
function readWhales(features) {
  const s = features.stats || {};
  const swims = (features.list || []).filter((f) => f.kind === 'lagoon').length;
  const longRun = num(s.longRunKm, 0);
  const pods = clamp(swims + Math.floor(longRun / 12), 0, 4);
  if (!pods) return null;
  return {
    pods, breach: swims > 0,
    why: `${swims} swims, a ${longRun.toFixed(1)} km long run → ${pods} whales${swims ? ' that breach' : ' that sound'}`,
  };
}

/**
 * The whales, met from the shore. `week` is life.js's reading (the survey's
 * readers). Returns { object, update(frame), dispose } or null.
 *
 * What each whale is belongs to the week; where it swims belongs to the
 * landing: on the first frame the eye stands on the ground (life-kit.js
 * landingEye) the first whale takes open water in front of the shore if the
 * view holds any — then it breaches (or dives) a few seconds later and keeps
 * its own long cycle — and otherwise blows far out, as the second always does.
 * A landing with no sea in view has none.
 */
export function createWhales(T, { features, survey, uniforms, light, R, palette: pal, week, amount }) {
  if (!survey?.land?.image?.data) return null; // life.js asks only a rock world's sea for its whales
  const read = readWhales(features);
  if (!read) return null;
  const rng = features.makeRng('life/whales');
  const { landAt, coastAt } = week.read;
  const sea = num(features.seaLevel, 0);
  const sunDir = (uniforms.uSunDir?.value || light.value).clone().normalize();
  const N = read.pods > 1 ? 2 : 1;
  const kin = Array.from({ length: N }, () => ({
    period: 56 + rng() * 22, size: L * (0.85 + rng() * 0.3), speed: 0.2 + rng() * 0.15, turn: rng() * TAU, seed: rng(),
  }));
  const attrs = {
    aHome: new Float32Array(N * 4),
    aHead: new Float32Array(N * 4),
    aTime: new Float32Array(N * 4),
    aLook: new Float32Array(N * 4),
  };
  kin.forEach((k, i) => {
    attrs.aTime.set([k.period, 0, -1, k.seed], i * 4);
    attrs.aLook.set([k.size, 2, 0, 0], i * 4);           // unplaced: past any amount
  });
  const geometry = instancedQuad(T, N, attrs);
  const fr = { x: 0, y: 0, z: 0 };
  const v = new T.Vector3(), w = new T.Vector3(), s = new T.Vector3(), sd = new T.Vector3(), o = new T.Vector3();
  const east = new T.Vector3(), north = new T.Vector3();
  // the line from the eye to p clear of the ground and of the sea's own curve
  const sight = (eye, p, lift) => {
    for (let k = 1; k < 40; k++) {
      s.copy(eye.pos).lerp(p, k / 40);
      sd.copy(s).normalize();
      if (s.length() < R + Math.max(features.heightAt(sd), sea) + lift) return false;
    }
    return true;
  };
  const lagoon = (u) => (features.lagoons || []).some((b) => b.dir.angleTo(u) * R < b.radius + 5);
  // open water all round: no ground within `units` of it
  const open = (c, units) => {
    tangentFrame(T, c, east, north);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      o.copy(c).addScaledVector(east, (Math.cos(a) * units) / R).addScaledVector(north, (Math.sin(a) * units) / R).normalize();
      if (landAt(o) > -0.2) return false;
    }
    return true;
  };
  const toward = (eye, dist, deg) => {
    const b = (deg * Math.PI) / 180;
    return v.copy(eye.up).addScaledVector(eye.fw, (Math.cos(b) * dist) / R).addScaledVector(eye.side, (Math.sin(b) * dist) / R).normalize();
  };
  // the breach's water: open sea in front of the shore, short of the horizon,
  // off to one side of the runner, its waterline seen across its breadth and
  // the water before it seen too
  const near = (eye, size) => {
    let best = null;
    for (let dist = 16; dist <= 56; dist += 3) {
      for (let deg = -36; deg <= 36; deg += 3) {
        toward(eye, dist, deg);
        if (landAt(v) > -0.35 || coastAt(v) < 3.5) continue;
        eye.frame(w.copy(v).multiplyScalar(R + sea), fr);
        const ax = Math.abs(fr.x);
        if (fr.z < 14 || ax < 0.28 || ax > 0.78) continue;
        const score = -Math.abs(dist - 30) / 14 - Math.abs(ax - 0.5) * 1.5 + Math.min(coastAt(v), 20) / 40;
        if (best && score <= best.score) continue;
        if (lagoon(v) || !open(v, 5)) continue;
        let seen = true;
        for (let k = -1; k <= 1 && seen; k++) seen = sight(eye, w.copy(v).multiplyScalar(R + sea + 0.35).addScaledVector(eye.side, k * 0.3 * size), 0.2);
        o.copy(v).addScaledVector(eye.fw, -4 / R).normalize();
        if (!seen || landAt(o) > -0.2 || !sight(eye, w.copy(o).multiplyScalar(R + sea + 0.2), 0.1)) continue;
        best = { v: v.clone(), score };
      }
    }
    return best;
  };
  // a blower's water: far out on the open sea, its spout seen over the
  // horizon or the shore, clear of the other's — on the sea and in the frame
  const fa = { x: 0, y: 0, z: 0 };
  const far = (eye, avoid) => {
    let best = null;
    if (avoid) eye.frame(w.copy(avoid).multiplyScalar(R + sea), fa);
    for (let dist = 40; dist <= 100; dist += 5) {
      for (let deg = -30; deg <= 30; deg += 3) {
        toward(eye, dist, deg);
        if (landAt(v) > -0.35 || coastAt(v) < 8) continue;
        eye.frame(w.copy(v).multiplyScalar(R + sea), fr);
        const ax = Math.abs(fr.x);
        if (fr.z < 30 || ax < 0.15 || ax > 0.8) continue;
        if (avoid && (avoid.angleTo(v) * R < 22 || Math.abs(fr.x - fa.x) < 0.3)) continue;
        const score = -Math.abs(dist - 70) / 30 - Math.abs(ax - 0.45);
        if (best && score <= best.score) continue;
        if (lagoon(v) || !sight(eye, w.copy(v).multiplyScalar(R + sea + 3.5), 0.1)) continue;
        best = { v: v.clone(), score };
      }
    }
    return best;
  };
  function pick(eye, time) {
    let found = 0, first = null;
    for (let i = 0; i < N; i++) {
      const k = kin[i];
      let spot = i === 0 ? near(eye, k.size) : null;
      const event = spot ? (read.breach ? 1 : 0) : -1;
      if (!spot) spot = far(eye, first);
      if (!spot) continue;
      first = first || spot.v;
      const g = spot.v, at = found * 4;
      tangentFrame(T, g, east, north);
      if (event >= 0) {
        // the near one is met going away from the shore and a little to one
        // side: its flukes seen from behind, a breach more from the side
        const turn = ((k.turn < Math.PI ? 1 : -1) * (event > 0 ? 0.9 + 0.35 * k.seed : 0.45 + 0.35 * k.seed));
        east.copy(eye.fw).multiplyScalar(Math.cos(turn)).addScaledVector(eye.side, Math.sin(turn));
        east.addScaledVector(g, -east.dot(g)).normalize();
      } else east.multiplyScalar(Math.cos(k.turn)).addScaledVector(north, Math.sin(k.turn));
      attrs.aHome[at] = g.x; attrs.aHome[at + 1] = g.y; attrs.aHome[at + 2] = g.z; attrs.aHome[at + 3] = R + sea + 0.02;
      // a blower keeps to its water; the near one swims on through its cycle
      attrs.aHead[at] = east.x; attrs.aHead[at + 1] = east.y; attrs.aHead[at + 2] = east.z; attrs.aHead[at + 3] = event < 0 ? 0.03 : k.speed;
      // its cycle starts from the landing: the near one comes up out of the
      // sea a moment after it, a blower blows
      const start = event >= 0 ? EVENT - 1.5 : BLOW[0] - 2 - found * 4;
      attrs.aTime[at] = k.period; attrs.aTime[at + 1] = (((start - time) % k.period) + k.period) % k.period;
      attrs.aTime[at + 2] = event; attrs.aTime[at + 3] = k.seed;
      attrs.aLook[at] = k.size; attrs.aLook[at + 1] = (found + 0.5) / N;
      found++;
    }
    for (let j = found; j < N; j++) attrs.aLook[j * 4 + 1] = 2;
    for (const name of Object.keys(attrs)) geometry.attributes[name].needsUpdate = true;
  }
  const MIX = (a, b, t) => a.clone().lerp(b, t);
  const back = MIX(MIX(pal.ink, pal.shadeCool, 0.3), pal.seaDeep, 0.2);
  const u = {
    uTime: uniforms.uTime,
    uFoot: { value: 0 },
    uAmount: amount,
    uSun: { value: sunDir },
    uFogBase: { value: 11 },
    uBack: { value: back },
    uFlank: { value: MIX(back, MIX(pal.shadeCool, pal.paper, 0.35), 0.45) },
    uBelly: { value: MIX(pal.paper, pal.shadeCool, 0.18) },
    uPaper: { value: pal.paper.clone() },
    uShade: { value: MIX(pal.shadeCool, pal.paper, 0.45) },
    uInk: { value: pal.ink.clone() },
    uFar: { value: MIX(pal.farGlaze, pal.skyWash, 0.5) },
    uMist: { value: pal.skyBand.clone() },
  };
  const material = new T.ShaderMaterial({
    uniforms: u,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    // the wash pass reads the sea's own alpha as its handoff: keep it
    blending: T.CustomBlending,
    blendEquation: T.AddEquation,
    blendSrc: T.SrcAlphaFactor,
    blendDst: T.OneMinusSrcAlphaFactor,
    blendSrcAlpha: T.ZeroFactor,
    blendDstAlpha: T.OneFactor,
  });
  const mesh = new T.Mesh(geometry, material);
  mesh.name = 'life-whales';
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.userData.species = { kind: 'humpback', whales: N, breach: read.breach, why: read.why };
  let picked = -1;
  return {
    object: mesh,
    update({ foot, eye, time }) {
      u.uFoot.value = foot;
      // a new landing takes new water as soon as its flight down knows where
      // the view will be (see life.js), so they fade in with the ground; back
      // in orbit the whales are let go
      if (foot <= 0) picked = -1;
      else if (eye.landed && eye.serial !== picked) {
        picked = eye.serial;
        pick(eye, num(time, 0));
      }
      mesh.visible = picked >= 0 && foot > 0.002;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

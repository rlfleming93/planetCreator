/* Planet Creator — the black hole: a screen pass that paints a hole beside the
 * week, in the register the rest of the poster is painted in.
 *
 * The picture is Gargantua's, and it is not drawn by hand: every pixel near the
 * hole follows its own ray back round a Schwarzschild hole (the photon orbit's
 * own equation, u'' + u = 3u², stepped in the ray's plane) to where it crosses
 * the plane of a thin disc seen twelve degrees off its own edge. The first
 * crossing is the disc as it stands — the near side a tapered blade across the
 * lower middle of the shadow — and on a ray that has gone up and over the hole
 * it is the far side, lifted by the hole into the arch over the top; the second
 * is the far side seen from underneath, the thin return under the bottom, and
 * the same light hugging the shadow's top. So the ring round the ring, its joins
 * to the blade at both shoulders, and the dark gap inside it are the geometry's.
 *
 * Over that, the hand:
 *
 *   the shadow   the ink itself, pooled darker at its rim the way a wash dries,
 *                and on paper the same ink in the gap between it and the disc
 *   the photon   one hairline round the shadow, laid by a brush, not a compass
 *   the disc     pigment in broad masses dragged along the orbit: lemon and
 *                cream where the disc turns toward the eye, rust where it turns
 *                away (its own beaming, from the photon's angular momentum),
 *                white only on the broken crest of the hot side. The masses meet
 *                on feathered, dry-brushed edges with the pigment pooled along
 *                some of them, their load varies inside, and past the core the
 *                brush runs dry in long strokes with staggered ends, thinning
 *                sooner in front of the hole than at the tips; the ink runs
 *                along the edge of the core
 *   the light    on the void (sky.space) the disc glows a little and the dark
 *                round the hole deepens; on paper neither
 *
 * The week's own inverted image comes round the hole as a thin tapered arc
 * hugging the lower rim, on the far side from the week, by a painter's lens: it
 * bends the week and nothing else, so the sky behind is left alone and the arch
 * and the return are the only lensing in the picture.
 *
 * The composition is the pass's: the frame is laid over so the week stands small
 * in the upper right, and the hole, its disc and the lens are placed in the
 * week's own radii, so the picture holds through a zoom. Underfoot all of it
 * falls away — the landing pulls the frame back to the middle as it fades.
 *
 * The galaxy (galaxy.js) lays this same pass at its own core, compiled with
 * BH_GALAXY, and there the eye comes as near as it likes: finer strokes come
 * out inside the broad ones as the pixels can carry them, the finest the
 * brush's own grain, so its marks keep their size on the screen and a mass is
 * never one flat colour (cut paper) nor a smear; as the hole grows on the
 * screen its colour steps widen, its pooled edges fade and long fine streaks
 * run round the orbit, so close in it reads as moving light, not layered
 * paper; the paper's tooth is in the pigment as it is in the galaxy's own;
 * the gap between the shadow and the disc is ink on the void too; and close
 * in the photon ring keeps a breadth and a little light of its own. Without
 * BH_GALAXY the pass is the planet's.
 */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// The composition, in the planet's own projected radii from the middle of the
// sheet (GL axes: y up). The week small in the upper right; the hole left of
// and under the middle, its shadow half again the week's size; the disc tipped
// up toward the week, so its long axis leads the eye to it.
const LAYOUT = {
  planet: [3.37, 3.24],
  hole: [-1.04, -0.91],
  shadow: 1.49,
  tilt: 0.28,        // radians, the disc's roll on the sheet
  incline: 0.21,     // radians, the eye over the disc's plane: twelve degrees
  image: 1.5,        // where the week's own inverted image comes round, in shadows
  arc: 0.5,          // how far round the hole that image is spread (1 = not at all)
};

const FRAG = `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform vec2 uHole, uShift, uPlanet, uInset, uGlobe;
uniform float uPlanetR, uShadow, uLensA, uWeekAng, uArc;
uniform float uTilt, uIncl, uSpin, uMix, uSpace, uSeed, uTime, uPixel;
uniform vec3 uInk, uEmber, uRed, uOrange, uGold, uLemon, uHot;

#define BH_BC 5.1961524
#define BH_RIN 4.6
#define BH_RCORE 10.5
#define BH_RCOREFAR 7.0
#define BH_RNEAR 24.0
#define BH_RFAR 10.5
#define BH_RUNDER 6.4
#define BH_PI 3.14159265
// the steps a ray is traced in, each half of its way: the galaxy's 14 put its disc
// within a thousandth of a radius of the planet's 28 (where the disc shows)
#ifdef BH_GALAXY
#define BH_STEPS 14
#define BH_STEPF 14.0
#else
#define BH_STEPS 28
#define BH_STEPF 28.0
#endif

// the house's own hash (ink.js)
float bhHash(vec2 p){
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float bhNoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(bhHash(i), bhHash(i + vec2(1.0, 0.0)), f.x),
             mix(bhHash(i + vec2(0.0, 1.0)), bhHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// value noise that closes on itself in y every 'per' cells: the disc's own
// azimuth, so a stroke never meets a seam going round
float bhLoop(vec2 p, float per){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float y0 = mod(i.y, per), y1 = mod(i.y + 1.0, per);
  return mix(mix(bhHash(vec2(i.x, y0)), bhHash(vec2(i.x + 1.0, y0)), f.x),
             mix(bhHash(vec2(i.x, y1)), bhHash(vec2(i.x + 1.0, y1)), f.x), f.y);
}
#ifdef BH_GALAXY
// the sheet's tooth (ink-space.js spTooth), so the hole's pigment lies on the
// galaxy's own paper
float bhTooth(vec2 sp){
  float grain = bhHash(floor(sp * 0.44)) * 0.55
              + bhHash(floor(vec2(sp.x * 0.14, sp.y * 0.52) + 31.0)) * 0.28
              + bhHash(floor(vec2(sp.x * 0.61, sp.y * 0.12) + 71.0)) * 0.17;
  return clamp(grain * 0.68 + bhNoise(sp * 0.19) * 0.32, 0.0, 1.0);
}
#endif
// Where none of the hole's own paint can show (bhOff: a crossing past the
// disc's rim, or a pixel out past every traced ray and the ring's light) the
// galaxy does not work out its brush's noise: the 0.5 that stands in for it is
// never seen there. The planet's pass works it all out, as it always has.
#ifdef BH_GALAXY
#define BH_BRUSH(x) (bhOff ? 0.5 : (x))
#else
#define BH_BRUSH(x) x
#endif
// the frame read past its own edge comes back mirrored, a few pixels inside
// the edge so the sheet's border is never read
vec2 bhMirror(vec2 uv){
  vec2 span = 1.0 - 2.0 * uInset;
  vec2 m = mod((uv - uInset) / span, 2.0);
  return uInset + span * (1.0 - abs(1.0 - m));
}
// the week on the frame, as the sphere it is (the depth buffer cannot tell a
// globe this far off from the sky behind it)
float bhGlobe(vec2 src){
  return 1.0 - smoothstep(uPlanetR, uPlanetR * 1.02 + uPixel, length(src - uShift - uGlobe));
}

// ---- the photon's orbit: u = M/r against the angle it has swept, u'' = 3u² - u
vec2 bhF(vec2 s){ return vec2(s.y, 3.0 * s.x * s.x - s.x); }
void bhStep(inout vec2 s, float h){
  vec2 k1 = bhF(s);
  vec2 k2 = bhF(s + 0.5 * h * k1);
  vec2 k3 = bhF(s + 0.5 * h * k2);
  vec2 k4 = bhF(s + h * k3);
  s += h / 6.0 * (k1 + 2.0 * k2 + 2.0 * k3 + k4);
}
// The radius at which a ray of impact parameter b crosses the disc's plane the
// first time (swept angle psi0) and the second (psi0 + pi): 60 for a ray that
// has left before it gets there, 2 for one the hole has taken first. In the
// galaxy a ray already outbound past the disc's rim (and so leaving for good,
// out here) is let go: whatever it crosses from there on shows nothing.
vec2 bhTrace(float b, float psi0){
  vec2 s = vec2(0.0, 1.0 / b);
  vec2 r = vec2(60.0);
  float h = psi0 / BH_STEPF;
  for (int i = 0; i < BH_STEPS; i++) {
    bhStep(s, h);
    if (s.x > 0.5) return vec2(2.0);
    if (s.x < 0.0) return r;
#ifdef BH_GALAXY
    if (s.y < 0.0 && s.x < 1.0 / (BH_RNEAR + 2.5)) return r;
#endif
  }
  r.x = 1.0 / max(s.x, 1.0 / 60.0);
  h = BH_PI / BH_STEPF;
  for (int i = 0; i < BH_STEPS; i++) {
    bhStep(s, h);
    if (s.x > 0.5) return vec2(r.x, 2.0);
    if (s.x < 0.0) return r;
#ifdef BH_GALAXY
    if (s.y < 0.0 && s.x < 1.0 / (BH_RNEAR + 2.5)) return r;
#endif
  }
  r.y = 1.0 / max(s.x, 1.0 / 60.0);
  return r;
}

// The disc where a ray crosses it: radius r, azimuth phi in its own plane (far
// is its sine: 1 straight behind the hole, -1 straight in front), and ax the
// ray's offset along the line of nodes (M), which is all the beaming needs —
// the photon's angular momentum about the disc's axis. under marks the return
// under the hole (the second crossing). fw is how fast r runs across a pixel.
// Returns pigment and cover; lum is the light (for the void), line the ink.
vec4 bhDisc(float r, float ax, float phi, float far, float under, float fw, out float lum, out float line){
  // a ray that left or fell makes r jump: that is not an edge to soften
  float aa = clamp(fw, 1e-4, 1.5);
  float sane = 1.0 - smoothstep(2.0, 4.0, fw);
  float om = pow(max(r, 2.0), -1.5);
  float turn = phi / (2.0 * BH_PI) - uSpin * om * uTime * 0.08;
  float keep = 1.0 - smoothstep(0.2, 0.8, fw * 2.4);   // can a pixel hold the hair
#ifdef BH_GALAXY
  bool bhOff = r > BH_RNEAR + 2.5;   // past the rim and any stroke's soft end
#endif
  // broad bands of pigment laid along the orbit, never the same twice round;
  // the hair of the brush inside them; and how loaded the brush was
  float band = 0.6 * BH_BRUSH(bhLoop(vec2(r * 0.55 + uSeed, turn * 5.0), 5.0))
             + 0.4 * BH_BRUSH(bhLoop(vec2(r * 1.1 + 4.0, turn * 11.0), 11.0));
  float hair = mix(0.5, BH_BRUSH(bhLoop(vec2(r * 2.3 + 7.0, turn * 23.0), 23.0)), keep);
#ifdef BH_GALAXY
  // close in, finer strokes come out inside these as a pixel can carry them
  // (five sheet pixels or more across one), long along the orbit and narrow
  // across it, the finest the pixels hold the brush's grain, so its marks keep
  // their size at any zoom
  float sp = aa * uPixel;
  float o1 = smoothstep(2.5, 5.0, 0.18 / sp) * sane, o2 = smoothstep(2.5, 5.0, 0.075 / sp) * sane;
  float h1 = o1 > 0.0 && !bhOff ? bhLoop(vec2(r * 5.5 + 2.4 * band + uSeed, turn * 17.0), 17.0) : 0.5;
  float h2 = o2 > 0.0 && !bhOff ? bhLoop(vec2(r * 13.0 + 3.0 * h1 + 1.0, turn * 41.0), 41.0) : 0.5;
  float grain = mix(mix(hair, h1, o1), h2, o2);
  // seen close the disc is luminous gas, not cut paper: its colour steps are
  // dragged wide, stroke ends and the core's rim feathered, the pooling faint;
  // and long fine streaks run round the orbit, each its own width and load,
  // wandering a little across it so none is a drawn circle
  float near = smoothstep(20.0, 140.0, uShadow / uPixel);
  // each octave once its cell is three or four sheet pixels across, and only
  // on the disc (a ray that left or fell has nothing to streak)
  vec3 of = smoothstep(2.0, 3.5, vec3(0.385, 0.167, 0.067) / sp) * sane * step(BH_RIN - 1.0, r) * step(r, BH_RNEAR + 1.0);
  float wob = of.x > 0.0 ? 0.7 * bhLoop(vec2(r * 0.6 + 5.0 + uSeed, turn * 3.0), 3.0) : 0.0;
  float f0 = of.x > 0.0 ? bhLoop(vec2((r + wob) * 2.6 + 3.0 + uSeed, turn * 4.0), 4.0) : 0.5;
  float f1 = of.y > 0.0 ? bhLoop(vec2((r + wob) * 6.0 + 1.5 * f0 + uSeed, turn * 5.0), 5.0) : 0.5;
  float f2 = of.z > 0.0 ? bhLoop(vec2((r + wob) * 15.0 + 2.0 * f1, turn * 7.0), 7.0) : 0.5;
  // each streak's edge a couple of pixels wide at any zoom: a brush mark, not a blur
  vec3 fe = clamp(2.0 * uPixel * vec3(fwidth(f0), fwidth(f1), fwidth(f2)), 0.04, 0.22);
  float run = of.x > 0.0 ? smoothstep(0.25, 0.6, bhLoop(vec2((r + wob) * 4.0 + 17.0 + uSeed, turn * 11.0), 11.0)) : 0.0;
  float flow = ((smoothstep(0.5 - fe.x, 0.5 + fe.x, f0) - 0.5) * 0.8 * of.x + (smoothstep(0.5 - fe.y, 0.5 + fe.y, f1) - 0.5) * of.y
             + (smoothstep(0.5 - fe.z, 0.5 + fe.z, f2) - 0.5) * 0.7 * of.z) * (0.3 + 0.7 * run);
#else
  float grain = hair;
  float near = 0.0;
#endif
  float load = BH_BRUSH(bhLoop(vec2(r * 0.35 + 9.0 + uSeed, turn * 3.0), 3.0));
  // The core is laid dense: deepest on the near side, so the blade across the
  // shadow has body, and narrow round the back, so the arch is a ring and not
  // a hood; the change between them is gradual, so each shoulder tapers.
  float back = smoothstep(-0.1, 0.9, far);
  float rEnd = mix(mix(BH_RNEAR, BH_RFAR, back), BH_RUNDER, under);
  float rCore = min(mix(BH_RCORE, BH_RCOREFAR, back), rEnd - 0.5);
  float soft = aa + min(0.8 * near, 5.0 * uPixel * aa);
  float core = 1.0 - smoothstep(rCore - soft, rCore + soft, r);
  // Past it the brush runs dry: strokes along the orbit that thin out toward
  // the rim, and sooner straight in front of the hole than at the tips, where
  // the disc is seen edge-on and keeps its line. The strokes are long (four to
  // a turn) and each radius has its own twist round the orbit, so their ends
  // are staggered and the tips are a few uneven strokes, not a row of teeth.
  float thin = (1.0 - smoothstep(rCore, rEnd, r)) * (1.0 - 0.45 * smoothstep(0.35, 0.95, -far));
  float twist = 0.8 * BH_BRUSH(bhNoise(vec2(r * 0.28 + uSeed, 3.0)));
  float drag = BH_BRUSH(bhLoop(vec2(r * 0.45 + uSeed, (turn + twist) * 4.0), 4.0));
  float sv = 0.72 * drag + 0.28 * grain + 0.02 - 0.95 * (1.0 - thin);
  float sa = max(aa * 1.3, 0.03) + min(0.07 * near, 5.0 * uPixel * fwidth(sv));
  float strokes = smoothstep(-sa, sa, sv) * (1.0 - smoothstep(rEnd - soft, rEnd + soft, r));
  // the beaming: the side turning toward the eye blue-shifted, the other red
  // (inside the disc's hole that sum can go negative, and pow must not see it)
  float g = 1.0 / max(1.0 + uSpin * om * ax * cos(uIncl), 0.25);
  float heat = pow(BH_RIN / max(r, BH_RIN), 1.1);
  // the steps' edges carry the broad bands and the hair: feathered along the
  // orbit, the way one colour is dragged into the next
  float t = pow(heat, 0.45) * pow(g, 1.25) * (1.0 - 0.18 * under) + (band - 0.5) * 0.26 + (hair - 0.5) * 0.14;
#ifdef BH_GALAXY
  t += (h1 - 0.5) * 0.16 * o1 + (h2 - 0.5) * 0.12 * o2 + flow * 0.12;
#endif
  // (never wider than a few pixels on the screen, so a step is a soft edge and
  // not a smear; the pooling keeps the narrow width, a faint fine line)
  float tw0 = max(fwidth(t), 0.012);
  float tw = tw0 + min(0.045 * near, 5.0 * uPixel * fwidth(t));
  vec3 c = mix(uEmber, uRed, smoothstep(0.28 - tw, 0.28 + tw, t));
  c = mix(c, uOrange, smoothstep(0.50 - tw, 0.50 + tw, t));
  c = mix(c, uGold, smoothstep(0.74 - tw, 0.74 + tw, t));
  c = mix(c, uLemon, smoothstep(1.0 - tw, 1.0 + tw, t));
  // pigment pooled along some edges, and the brush skipping across them
  float edge = min(min(abs(t - 0.28), abs(t - 0.50)), min(abs(t - 0.74), abs(t - 1.0)));
  float pooled = exp(-pow((t - 0.50 + 1.8 * tw0) / (1.3 * tw0), 2.0)) + exp(-pow((t - 0.74 + 1.8 * tw0) / (1.3 * tw0), 2.0));
  c = mix(c, c * 0.68, clamp(pooled, 0.0, 1.0) * 0.5 * step(0.42, grain) * (1.0 - 0.55 * near));
  float skip = (1.0 - smoothstep(tw0, tw0 + 0.05, edge)) * (1.0 - smoothstep(0.24, 0.36, grain)) * keep * (1.0 - 0.7 * near);
  // the load: the same pigment laid heavier here, thinner there
  c *= 0.86 + 0.24 * load;
  // white only on the hot crest of the side coming toward the eye, broken
  float crest = (1.0 - smoothstep(BH_RIN + 0.7, BH_RIN + 1.7, r)) * smoothstep(1.18 - tw, 1.18 + tw, t)
              * smoothstep(0.36, 0.50, grain) * (1.0 - under);
  c = mix(c, uHot, crest);
  // the blade's leading edge across the shadow: one decisive pale line
  float lead = (1.0 - smoothstep(1.2, 2.6, (r - BH_RIN) / aa)) * smoothstep(0.05, -0.35, far) * (1.0 - under);
  c = mix(c, mix(uLemon, uHot, 0.5), lead * 0.8);
  c *= 0.95 + 0.09 * grain;
#ifdef BH_GALAXY
  // close in, each stroke the masses are laid in has its own load, a shade
  // lighter or darker than its neighbours, and where the brush skipped the
  // darker underlayer shows rather than the galaxy's light behind
  c *= 1.0 + (smoothstep(0.3, 0.7, h1) - 0.5) * 0.2 * o1 + (smoothstep(0.35, 0.65, h2) - 0.5) * 0.14 * o2 + flow * 0.24;
  c = mix(c, c * 0.55, 0.6 * skip * (1.0 - lead));
  skip *= 0.35;
#endif
  float body = core * (1.0 - 0.8 * skip * (1.0 - lead)) + (1.0 - core) * strokes * (0.72 + 0.25 * load);
  float cover = smoothstep(BH_RIN - aa, BH_RIN + aa, r) * body;
  lum = heat * g * g * g * (0.75 + 0.5 * load) * (1.0 - 0.4 * under);
  // ink where the core's dense pigment ends, broken where the brush lifted
  float lift = smoothstep(0.35, 0.6, BH_BRUSH(bhLoop(vec2(3.0 + uSeed, turn * 6.0), 6.0)));
  line = (1.0 - smoothstep(0.4, 1.3, abs(r - rCore) / aa)) * lift * sane * 0.8 * (1.0 - 0.6 * near);
  return vec4(c, cover);
}

void main(){
  vec2 px = vUv * uResolution;
  float on = uMix;
  float paper = (1.0 - uSpace) * on;

  // ---- the sheet behind, laid over so the week stands in its corner. The
  // lens bends the week alone: inside its ring the week comes round turned
  // over, as an arc spread along the hole's lower rim (the pixel takes it only
  // where the bent ray lands on the week; everywhere else the sky is the sky).
  vec2 d = px - uHole;
  float th = max(length(d), 1e-3);
  vec2 dir = d / th;
  vec2 src = px;
  float beta = th - uLensA / (th * th * th) * on;
  if (beta < 0.0) {
    float rel = mod(atan(-dir.y, -dir.x) - uWeekAng + BH_PI, 2.0 * BH_PI) - BH_PI;
    float a2 = uWeekAng + rel * uArc + (1.0 - uArc) * BH_PI * sign(rel) * pow(abs(rel) / BH_PI, 3.0);
    vec2 bent = uHole - vec2(cos(a2), sin(a2)) * beta;
    if (bhGlobe(bent) > 0.0) src = bent;
  }
  vec3 col = texture2D(tDiffuse, bhMirror((src - uShift) / uResolution)).rgb;
  float onGlobe = bhGlobe(src);

  // ---- the hole's own frame: q.x along the disc's line of nodes, q.y up it
  float ca = cos(uTilt), sa = sin(uTilt);
  vec2 q = vec2(ca * d.x + sa * d.y, -sa * d.x + ca * d.y);
  float cphi = q.x / th, sphi = q.y / th;
  float b = th / uShadow * BH_BC;
#ifdef BH_GALAXY
  bool bhOff = b >= 27.0 && th > uShadow * 1.4 + 40.0 * uPixel;   // no ray traced, past the ring's light
#endif
  float ce = cos(uIncl), se = sin(uIncl);
  float psi0 = atan(se, -sphi * ce);
  vec2 rr = vec2(60.0);
  if (on > 0.001 && b < 27.0) rr = bhTrace(b, psi0);
  vec2 fw = vec2(fwidth(rr.x), fwidth(rr.y));
  float ax = q.x / uShadow * BH_BC;
  float c0 = cos(psi0), s0 = sin(psi0);
  vec2 pd = vec2(s0 * cphi, -c0 * ce + s0 * sphi * se);

  // ---- the week, lit from beside by the hole: a warm glaze on the limb that
  // faces it and the night laid over the limb that does not
  vec2 pn = (px - uPlanet) / max(uPlanetR, 1.0);
  if (onGlobe > 0.5) {
    if (dot(pn, pn) < 1.44) {
      vec3 n = vec3(pn, sqrt(max(0.0, 1.0 - dot(pn, pn))));
      float lam = dot(n, normalize(vec3(normalize(uHole - uPlanet), 0.30)));
      vec3 glaze = mix(uOrange, uGold, 0.55);
      col = mix(col, mix(col, uInk, 0.62), smoothstep(-0.05, -0.55, lam) * on);
      col = mix(col, mix(col * glaze * 1.5, glaze, 0.25), smoothstep(0.15, 0.90, lam) * 0.62 * on);
    } else {
      // its own image, come round the hole, a little warmed by the disc
      col = mix(col, col * vec3(1.0, 0.86, 0.70), 0.35 * on);
    }
  }

  // ---- on the void, the dark round the hole deepens a little: no shape to
  // it, only less of the sky's light getting past
  col *= 1.0 - 0.40 * uSpace * on * exp(-pow((th - uShadow) / (uShadow * 1.6), 2.0)) * (1.0 - onGlobe);

  // ---- the shadow, and on paper the same dark in the gap between it and the
  // disc (the rays that come back out, but only from inside the disc's hole)
  float sh = (1.0 - smoothstep(uShadow - 0.8 * uPixel, uShadow + 0.8 * uPixel, th)) * on;
  float hollow = step(BH_BC, b) * on
               * max(1.0 - smoothstep(BH_RIN - 0.6, BH_RIN + 0.6, rr.x), 1.0 - smoothstep(BH_RIN - 0.6, BH_RIN + 0.6, rr.y));
  float rimPool = smoothstep(uShadow * 0.72, uShadow, th);
  float wash = BH_BRUSH(bhNoise(px / (uPixel * 9.0) + uSeed)) * 0.6 + BH_BRUSH(bhNoise(px / (uPixel * 3.5) - uSeed)) * 0.4;
  vec3 deep = mix(uInk, vec3(0.0), 0.62 + 0.25 * rimPool);
  deep *= 0.90 + 0.22 * wash * (1.0 - rimPool);
  col = mix(col, mix(uInk, vec3(0.0), 0.75), hollow * paper);
#ifdef BH_GALAXY
  col = mix(col, mix(deep, vec3(0.0), 0.6), hollow * uSpace * 0.92);
#endif
  col = mix(col, mix(deep, vec3(0.0), 0.6 * uSpace), sh);

  // ---- the photon ring: one hairline round the shadow, laid by a brush
  float side = 1.0 / (1.0 + 0.45 * uSpin * cphi);
  float ringW = (0.55 + 0.75 * BH_BRUSH(bhNoise(dir * 5.0 + uSeed * 1.3))) * uPixel;
  float lifts = 0.35 + 0.65 * smoothstep(0.25, 0.60, BH_BRUSH(bhNoise(dir * 9.0 - uSeed)));
#ifdef BH_GALAXY
  // close in the ring keeps a breadth of its own, and a little light round it;
  // and it is never broken so often that far off it reads as a dotted line
  float big = smoothstep(40.0, 400.0, uShadow / uPixel);
  ringW *= 1.0 + 1.6 * big;
  lifts = mix(lifts, 1.0, 0.65);
#endif
  float ring = exp(-pow((th - uShadow * 1.012) / ringW, 2.0)) * on * lifts;
  col = mix(col, mix(uGold, uHot, 0.6), clamp(ring * (0.5 + 0.5 * side), 0.0, 1.0));
#ifdef BH_GALAXY
  col += mix(uGold, uHot, 0.3) * exp(-pow((th - uShadow * 1.025) / (uShadow * 0.035), 2.0)) * step(uShadow, th)
       * (0.5 + 0.5 * side) * 0.34 * big * on;
#endif

  // ---- the disc: the return under the hole first, then the light in front
  float lum1, line1, lum0, line0;
  vec4 d1 = bhDisc(rr.y, ax, atan(-pd.y, -pd.x), -pd.y, 1.0, fw.y, lum1, line1);
  vec4 d0 = bhDisc(rr.x, ax, atan(pd.y, pd.x), pd.y, 0.0, fw.x, lum0, line0);
  vec3 lit1 = d1.rgb * (0.45 + 0.75 * (1.0 - exp(-1.3 * lum1)));
  vec3 lit0 = d0.rgb * (0.45 + 0.75 * (1.0 - exp(-1.3 * lum0)));
  col = mix(col, mix(d1.rgb, lit1, uSpace), d1.a * on);
  col = mix(col, uInk, line1 * on * (1.0 - 0.5 * uSpace));
  col = mix(col, mix(d0.rgb, lit0, uSpace), d0.a * on);
  col = mix(col, uInk, line0 * on * (1.0 - 0.5 * uSpace));
#ifdef BH_GALAXY
  // the paper's tooth in the pigment, as in the galaxy's own
  if (max(d0.a, d1.a) * on > 0.0) col *= 1.0 + (bhTooth(gl_FragCoord.xy) - 0.5) * 0.24 * max(d0.a, d1.a) * on;
#endif

  // ---- on the void the disc is a light, and glows a little past itself
  float discA = max(d0.a, d1.a);
  float glowR = exp(-pow((th - uShadow * 1.35) / (uShadow * 0.5), 2.0)) * smoothstep(-0.9, 0.3, sphi);
  float glowB = exp(-pow((q.y + uShadow * 0.2) / (uShadow * 0.35), 2.0)) * exp(-pow(q.x / (uShadow * 3.4), 2.0));
  vec3 glowC = mix(uRed, uGold, clamp(side - 0.5, 0.0, 1.0));
  col += glowC * (glowR * 0.16 + glowB * 0.20) * side * uSpace * on * (1.0 - sh) * (1.0 - 0.75 * discA);
  gl_FragColor = vec4(col, 1.0);
}
`;

/** The pass, its placement and the numbers it publishes for a capture to read. */
export function createLens(shared) {
  const { THREE: T, colors, palette, R } = shared;
  const state = { surface: 0 };
  const place = { hole: new T.Vector2(), planet: new T.Vector2(), planetPx: 0, shadow: 0, mix: 1 };
  const v = new T.Vector3();
  const post = {
    id: 'blackhole-lens',
    fragment: FRAG,
    uniforms(ctx) {
      const ink = (colors?.uInk?.value || palette?.ink || new T.Color(0x242a3c)).clone();
      const warm = (colors?.uVerm?.value || palette?.vermilion || new T.Color(0xc0392b)).clone();
      return {
        uHole: { value: new T.Vector2() },
        uShift: { value: new T.Vector2() },
        uPlanet: { value: new T.Vector2() },
        uInset: { value: new T.Vector2() },
        uGlobe: { value: new T.Vector2() },
        uPlanetR: { value: 1 },
        uShadow: { value: 1 },
        uLensA: { value: 0 },
        uWeekAng: { value: 0 },
        uArc: { value: LAYOUT.arc },
        uTilt: { value: LAYOUT.tilt },
        uIncl: { value: LAYOUT.incline },
        uSpin: { value: 1 },
        uMix: { value: 1 },
        uSpace: { value: Number(ctx.dials?.['sky.space']) || 0 },
        uPixel: { value: 1 },
        uInk: { value: ink },
        // The disc's pigments, coldest to hottest: a rust that is nearly the
        // ink, the week's own red, an orange, an ochre-gold, a lemon cream and
        // the white of the hot crest, lighter than the sheet itself.
        uEmber: { value: new T.Color(0x5e1d10).lerp(ink, 0.2) },
        uRed: { value: new T.Color(0xa8341a).lerp(warm, 0.3) },
        uOrange: { value: new T.Color(0xdc7a2c) },
        uGold: { value: new T.Color(0xe9b44e) },
        uLemon: { value: new T.Color(0xf6e2a0) },
        uHot: { value: new T.Color(0xfff6e2) },
      };
    },
    update(ctx, u) {
      const size = ctx.resolution;
      const cam = ctx.camera;
      const f = (size.y * 0.5) / Math.tan((cam.fov * Math.PI) / 360);
      const d0 = Math.max(1e-3, cam.position.length());
      const planetPx = (f * R) / Math.sqrt(Math.max(1e-3, d0 * d0 - R * R));
      cam.updateMatrixWorld();
      v.set(0, 0, 0).project(cam);
      const cx = (v.x * 0.5 + 0.5) * size.x;
      const cy = (v.y * 0.5 + 0.5) * size.y;
      const mix = 1 - clamp(state.surface, 0, 1);
      const mx = size.x * 0.5, my = size.y * 0.5;
      // the week moved into its corner, by as much of the way as the landing has left
      const px = cx + (mx + LAYOUT.planet[0] * planetPx - cx) * mix;
      const py = cy + (my + LAYOUT.planet[1] * planetPx - cy) * mix;
      const hx = mx + LAYOUT.hole[0] * planetPx;
      const hy = my + LAYOUT.hole[1] * planetPx;
      const shadow = LAYOUT.shadow * planetPx;
      // the lens, beta = theta - A / theta^3: A is what brings the week's own
      // image round to LAYOUT.image shadows from the hole on the far side, and
      // the steep law is what squeezes that image into a thin arc
      const far = Math.hypot(px - hx, py - hy);
      const inner = LAYOUT.image * shadow;
      u.uLensA.value = inner * inner * inner * (inner + far);
      u.uWeekAng.value = Math.atan2(py - hy, px - hx);
      u.uHole.value.set(hx, hy);
      u.uShift.value.set(px - cx, py - cy);
      u.uPlanet.value.set(px, py);
      u.uInset.value.set(5 / size.x, 5 / size.y);
      u.uGlobe.value.set(cx, cy);
      u.uPlanetR.value = planetPx;
      u.uShadow.value = shadow;
      u.uMix.value = mix;
      u.uPixel.value = Math.max(0.75, size.y / 768);
      u.uSpace.value = Number(ctx.dials?.['sky.space']) || 0;
      place.hole.set(hx, hy);
      place.planet.set(px, py);
      place.planetPx = planetPx;
      place.shadow = shadow;
      place.mix = mix;
    },
  };
  return {
    post,
    update(frame) {
      state.surface = clamp(frame?.surface ?? 0, 0, 1);
    },
    dispose() {},
    debug() {
      return {
        hole: [Math.round(place.hole.x), Math.round(place.hole.y)],
        planet: [Math.round(place.planet.x), Math.round(place.planet.y)],
        planetPx: +place.planetPx.toFixed(1),
        shadow: +place.shadow.toFixed(1),
        mix: +place.mix.toFixed(3),
      };
    },
  };
}

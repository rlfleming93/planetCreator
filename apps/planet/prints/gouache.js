/* Planet Creator — the gouache print.
 *
 * Gouache is the painter's opaque body colour: a flat brush, one loaded stroke
 * at a time, and a picture built out of patches that were each laid in a single
 * pass and never blended again. So the frame is flattened twice over. First the
 * picture is read along the sheet's own four diagonals — four rays, each a small
 * average of what lies that way — which is both a set of flat patches and a
 * coarse grid of the picture's value; out of that grid comes the structure
 * tensor. Then the flattening proper: four sectors laid in the tensor's own
 * frame, long with the form and thin across it, each sector's mean weighted by
 * how quiet it was. A patch therefore stays crisp where an edge runs through it
 * and never flickers between sectors where the picture is flat, and the ink
 * frame's hatching turns into the panels of a painting while its forms survive.
 *
 * Over that go the brushstrokes themselves. A brush is a pack of bristles, so a
 * drag is laid at two scales at once: the load of the whole brush, as wide as the
 * brush and as long as the arm's travel, opening and closing as it is pulled and
 * running out of paint at both ends of the travel; and inside it the streak each
 * separate bristle left. Both follow the tensor's own direction, so a place with a
 * form in it gets long strokes that run with the form and a place without one gets
 * the short broad dabs a loaded flat leaves on flat colour — and the hand is scaled
 * to how much the picture had to say there, so a pale cap or an open sea comes out
 * as the even opaque field a gouache lays there and never as grain. The paint
 * stands in relief — a height field built from the brush's load, from the big forms
 * of the picture and from the tooth of the cloth under it, lit from over the left
 * shoulder — and under everything is the canvas: a plain weave, hung several
 * degrees off the sheet so it can never square up with the pixels, showing most
 * where the paint is thin.
 *
 * The sky is not the frame's sky but the sheet's own paper with the week's shallow
 * sea carried in the brush: the colour lives in the load, the paper stands between
 * the strokes, and there is never a star — nothing in a gouache is smaller than a
 * brushstroke. Only the bare paper is brushed over: where the frame drew something
 * in the sky, a ring's arc or a moon or the edge of a cloud, the mark is left as
 * the frame drew it. Round the subject goes one confident load of the darkest ink,
 * its width the hand's own and kept on the planet's own disc, so that what the
 * frame drew beyond the globe — a ring, a moon — is never wired in black.
 *
 * Every length below is a fraction of the sheet's height, so a capture at twice
 * the size is the same painting twice as fine. Nothing reads uTime — a painting
 * does not move between frames — and nothing is a Math.random: every wander of
 * the hand comes from the week's own uSeed.
 */
export default {
  id: 'gouache',
  label: 'Gouache',
  fragment: /* glsl */ `
uniform sampler2D tDiffuse, tDepth;
uniform vec2 uResolution;
uniform vec3 uPaper, uInk, uSeaDeep, uSeaShallow, uLand;
uniform float uSeed;
uniform vec3 uGouDisc;   // the globe's disc on the sheet: centre in device px, then its radius
uniform float uGouPatch, uGouBristle, uGouLength, uGouImpasto, uGouWeave, uGouTooth, uGouContour, uGouChroma, uGouSky;
varying vec2 vUv;

// The value axis the app already measures its own frame with.
const vec3 GO_W = vec3(0.32, 0.55, 0.13);

float goLum(vec3 c){ return dot(c, GO_W); }
// A difference that saturates smoothly. Paint steps, but no single line in the
// frame may step sharply enough to read as a ridge in the raking light.
float goSat(float d){ float a = abs(d); return 0.10 * d / (0.10 + a); }
float goHash(vec2 p){
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float goNoise(vec2 x){
  vec2 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float a = goHash(i), b = goHash(i + vec2(1.0, 0.0));
  float c = goHash(i + vec2(0.0, 1.0)), d = goHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// One sector of the flattening: the picture averaged over the sector's own taps,
// and how far those taps disagreed with each other. A quiet sector is a flat
// patch of the picture; a loud one has an edge running through it.
vec3 goSector(vec2 uv, vec2 o1, vec2 o2, vec3 cC, out float v){
  vec3 m1 = texture2D(tDiffuse, uv + o1).rgb;
  vec3 m2 = texture2D(tDiffuse, uv + o2).rgb;
  vec3 m = cC * 0.24 + m1 * 0.40 + m2 * 0.36;
  vec3 e0 = cC - m, e1 = m1 - m, e2 = m2 - m;
  v = dot(e0, e0) * 0.24 + dot(e1, e1) * 0.40 + dot(e2, e2) * 0.36;
  return m;
}

// One drag of the brush, laid along the local structure: "t1" runs with the form
// and "t2" across it. A brush is not one mark but a pack of bristles, so the drag
// is read twice over: the load of the whole brush — as wide as the brush, as long
// as the arm's travel, opening and closing as it is pulled, wandering because no
// hand is straight, running out of paint at both ends of the travel — and, inside
// it, the streak each separate bristle left. A detail of 0 leaves the bristles
// and the pigment's own micro-breaks out of it, which is how the raking light
// reads the load of the brush and never the speckle.
float goStroke(vec2 q, vec2 t1, vec2 t2, float wid, float arm, float seed, float detail){
  float a1 = dot(q, t1);                 // along the drag
  float a2 = dot(q, t2);                 // across it
  float wander = goNoise(vec2(a1 / arm, seed * 3.3)) - 0.5;
  float widNow = wid * (0.72 + 0.60 * (wander + 0.5));
  float across = (a2 + wander * widNow * 1.4) / widNow;
  float id = floor(across);
  float f = across - id;
  float load = 0.34 + 0.66 * goNoise(vec2(across * 0.42, seed * 11.1 + a1 / arm * 0.35));
  float run = goNoise(vec2(a1 / (arm * 1.15), id * 3.3 + seed * 9.1));
  float edge = smoothstep(0.46, 0.26, abs(f - 0.5));      // the brush's own width, wet side out
  float body = mix(0.05, 1.0, smoothstep(0.26, 0.40, run));
  // the bristles inside the brush: a finer pack of streaks, each carrying its own
  // load, so the mark reads as one stroke of the brush across the room and as its
  // separate hairs up close.
  float fw = wid * 0.36;
  float bw = (a2 + wander * fw * 1.6) / fw;
  float bid = floor(bw);
  float bf = bw - bid;
  float bload = 0.50 + 0.50 * goHash(vec2(bid * 3.1, seed * 19.7));
  float streaks = 0.68 + 0.74 * bload * smoothstep(0.48, 0.30, abs(bf - 0.5));
  float pigment = 0.94 + 0.12 * goNoise(vec2(a1 / (wid * 1.1), id * 2.1 + seed * 4.4));
  float mark = load * edge * body * mix(1.0, streaks, detail) * mix(1.0, pigment, detail);
  return clamp(mark, 0.0, 1.4);
}

// The cloth under the paint: a plain weave of warp and weft, one thread crossing
// over the other in alternate squares. It is hung several degrees off the sheet
// and its two threads are set at two different pitches, so the weave can never
// line up with the pixels and read as a screen; no thread is sewn straight
// either — each row sits a little out of true. The crown of whichever thread is
// on top catches the light, so the height and both of its slopes come out of the
// same two cosines: x is the height, y and z its slopes per sheet fraction.
vec3 goWeave(vec2 q, float pitchW, float pitchF, float seed){
  float ca = 0.9925462, sa = 0.1218693;                   // the cloth as it was stretched: 7°
  vec2 r = vec2(ca * q.x - sa * q.y, sa * q.x + ca * q.y);
  vec2 t = vec2(r.x / pitchW, r.y / pitchF);
  vec2 i = floor(t), fv = fract(t);
  fv.x = fract(fv.x + 0.22 * (goHash(vec2(i.y, seed * 3.7)) - 0.5) + 0.5);
  fv.y = fract(fv.y + 0.22 * (goHash(vec2(i.x, seed * 8.3)) - 0.5) + 0.5);
  float over = mod(i.x + i.y, 2.0);
  vec3 wx = vec3(0.5 + 0.5 * cos(fv.x * 6.2831853), -3.1415927 * sin(fv.x * 6.2831853) / pitchW, 0.0);
  vec3 wy = vec3(0.5 + 0.5 * cos(fv.y * 6.2831853), 0.0, -3.1415927 * sin(fv.y * 6.2831853) / pitchF);
  float h = mix(wy.x + 0.18 * wx.x, wx.x + 0.18 * wy.x, over);
  vec2 gr = mix(wy.yz + 0.18 * wx.yz, wx.yz + 0.18 * wy.yz, over);
  return vec3(h, vec2(ca * gr.x + sa * gr.y, -sa * gr.x + ca * gr.y));
}

// One ring of the depth buffer, outward: is the sheet bare at that distance?
float goSkyAt(vec2 uv, vec2 off){ return step(0.99998, texture2D(tDepth, uv + off).x); }

void main(){
  vec2 q = gl_FragCoord.xy / max(2.0, uResolution.y);      // the sheet, measured in its own heights
  vec2 uvPerQ = vec2(uResolution.y / uResolution.x, 1.0);  // one sheet fraction, in uv
  vec3 cC = texture2D(tDiffuse, vUv).rgb;
  float sky = step(0.99998, texture2D(tDepth, vUv).x);

  // The craft dials: the screen this module ships, unless the host has spread
  // something else over it.
  float R1 = max(uGouPatch, 2.0 / uResolution.y);          // the arm's reach of one patch
  float bristle = max(uGouBristle, 1.5 / uResolution.y);
  float arm = max(uGouLength, bristle * 1.6);
  float imp = clamp(uGouImpasto, 0.0, 2.0);
  float pitchW = max(uGouWeave, 2.2 / uResolution.y);
  float tooth = clamp(uGouTooth, 0.0, 0.60);
  float contour = clamp(uGouContour, 0.6 / uResolution.y, 0.05);
  float chroma = clamp(uGouChroma, 0.70, 2.20);
  float skyMix = clamp(uGouSky, 0.0, 1.0);
  // The week's number, folded into 0..1 whichever magnitude the host hands it.
  float seed = fract(uSeed * 0.6180339887);

  // ---- the form. The picture is read along the sheet's own four diagonals, each
  // ray an average of what lies that way; the four rays are a coarse grid of the
  // picture's value, and out of that grid comes the structure tensor: how far the
  // neighbourhood is stretched one way, and which way the form runs — across its
  // own gradient, which is the way a brush follows an edge.
  vec2 uA = vec2(0.7071068, 0.7071068), uB = vec2(-0.7071068, 0.7071068);
  vec2 oA = uA * R1 * uvPerQ, oB = uB * R1 * uvPerQ;
  float vA, vB, vC, vD;
  vec3 mA = goSector(vUv, oA * 0.55, oA, cC, vA);
  vec3 mB = goSector(vUv, oB * 0.55, oB, cC, vB);
  vec3 mC = goSector(vUv, -oA * 0.55, -oA, cC, vC);
  vec3 mD = goSector(vUv, -oB * 0.55, -oB, cC, vD);
  float lumC = goLum(cC);
  float lA = goLum(mA), lB = goLum(mB), lC = goLum(mC), lD = goLum(mD);
  // Two readings of the gradient on each axis, so the tensor is that of a 2×2
  // grid and not of one noisy difference; divided by the ray's own reach, so the
  // gate below means the same thing at every capture size.
  float inv = 1.0 / max(1e-5, 1.4142136 * R1);
  float gx1 = (lA - lB) * inv, gx2 = (lD - lC) * inv;
  float gy1 = (lA - lD) * inv, gy2 = (lB - lC) * inv;
  float jxx = 0.5 * (gx1 * gx1 + gx2 * gx2);
  float jyy = 0.5 * (gy1 * gy1 + gy2 * gy2);
  float jxy = 0.5 * (gx1 * gy1 + gx2 * gy2);
  float tr = jxx + jyy;
  float df = 0.5 * (jxx - jyy);
  float dc = sqrt(df * df + jxy * jxy);
  float ani = clamp(2.0 * dc / max(1e-6, tr), 0.0, 1.0);
  float theta = 0.5 * atan(2.0 * jxy, jxx - jyy);
  vec2 t2 = vec2(cos(theta), sin(theta));       // across the form
  vec2 t1 = vec2(-t2.y, t2.x);                  // and along it
  float w = smoothstep(0.9, 6.0, sqrt(tr));     // how much form there is here to follow
  float A = ani * w;

  // ---- the flattening proper. Four sectors laid in that frame, so each is long
  // with the form and thin across it; each sector's mean is weighted by how quiet
  // it was, so a patch stays crisp where an edge runs through it and never
  // flickers between sectors where the picture is flat — which is what a flat
  // brush would have laid down there.
  float lenA = R1 * (1.0 + 1.50 * A);
  float lenB = R1 * (0.95 - 0.45 * A);
  vec2 eA = (t1 * lenA + t2 * lenB) * uvPerQ;
  vec2 eB = (-t1 * lenA + t2 * lenB) * uvPerQ;
  vec2 eC = (-t1 * lenA - t2 * lenB) * uvPerQ;
  vec2 eD = (t1 * lenA - t2 * lenB) * uvPerQ;
  float fA, fB, fC, fD;
  vec3 pA = goSector(vUv, eA * 0.55, eA, cC, fA);
  vec3 pB = goSector(vUv, eB * 0.55, eB, cC, fB);
  vec3 pC = goSector(vUv, eC * 0.55, eC, cC, fC);
  vec3 pD = goSector(vUv, eD * 0.55, eD, cC, fD);
  float wA = 1.0 / (0.0004 + 40.0 * fA), wB = 1.0 / (0.0004 + 40.0 * fB);
  float wC = 1.0 / (0.0004 + 40.0 * fC), wD = 1.0 / (0.0004 + 40.0 * fD);
  vec3 win = (pA * wA + pB * wB + pC * wC + pD * wD) / (wA + wB + wC + wD);
  // The frame's own strongest marks are never quite let go of: a drawn contour, a
  // ring's hair line, is still a line under a flat brush, and a print that paints
  // them out would be printing a different picture. So what the flattening had to
  // average away is handed back where the picture insisted on it.
  float stray = abs(lumC - goLum(win));
  float keep = clamp(smoothstep(0.22, 0.04, lumC) * 0.30 + smoothstep(0.16, 0.38, stray) * 0.42, 0.0, 0.72);
  vec3 col = mix(win, cC, keep);

  // ---- the pigment. Gouache is opaque, so every value is a colour and never a
  // glaze: the chroma is pushed past the printing ink's, the picture is lifted
  // off the paper it was laid on, and the lights are only just chalked — the
  // paper mixed into them, but not enough to grey the colour away.
  float vl = goLum(col);
  col = mix(vec3(vl), col, chroma);
  col = clamp(uPaper + (col - uPaper) * 1.10, 0.0, 1.0);
  // A gouache's lights are opaque and even: the paper mixed into the colour, and
  // the brush laid flat there, so the brightest passages carry the least grain.
  float chalkLights = smoothstep(0.70, 0.92, vl);
  col = mix(col, mix(col, uPaper, 0.35), chalkLights * 0.50);

  // ---- the brush. Where the picture has a form in it the bristles are dragged a
  // long way along that form; where it has none they are short and broad, the way
  // a loaded flat leaves a dab. A loaded stroke sits heavier and warmer, and
  // where the drag ran dry the ground is seen through it again.
  float widS = mix(bristle * 1.35, bristle, w);
  float armS = mix(arm * 0.32, arm, w);
  float thick = goStroke(q, t1, t2, widS, armS, seed, 1.0);
  // Not every passage of a painting is brushed the same: some are laid in flat and
  // left, and the hand shows most where it worked hardest. So the brush is scaled
  // to how much the picture itself had to say here — the difference the flattening
  // had to average away — and a pale cap or an open sea comes out as the even
  // opaque field of paint a gouache lays there, with no grain in it at all.
  float passage = mix(0.45, 1.15, goNoise(q * vec2(1.7, 1.4) + seed * 13.3));
  float busy = clamp(length(cC - win) * 5.0, 0.0, 1.0);
  col *= 1.0 + (thick - 0.58) * 0.34 * passage * mix(0.26, 1.15, busy) * mix(0.55, 1.0, chalkLights);
  col = mix(col, mix(col, uLand, 0.50), clamp((thick - 0.85) * 2.4, 0.0, 1.0) * 0.18);
  col = mix(col, mix(col, uSeaDeep, 0.45), clamp((0.34 - thick) * 2.6, 0.0, 1.0) * 0.16);

  // ---- the sky: the sheet's own paper with the week's shallow sea carried in
  // the brush. The colour lives in the load — a loaded brush lays the sea down,
  // a dry one leaves paper — and the wide flat the sky was laid with travels
  // across the sheet at one angle, broken into dabs no longer than the arm that
  // drew them. The tone of the sky is not what varies: the colour is, so the
  // field reads as brushed paint and never as marbled ground.
  vec2 k1 = normalize(vec2(0.94, 0.34)), k2 = vec2(-0.3533, 0.9355);
  float sWid = 0.0380, sArm = 0.0850;
  float sThick = goStroke(q, k1, k2, sWid, sArm, seed * 1.7 + 31.0, 1.0);
  float load = clamp(sThick, 0.0, 1.30);
  // The ground the sky was mixed from barely changes across the sheet: nearly all
  // of the colour is in the brush, so the field is marks with ends to them and
  // never a smooth vein of tinted paper running the whole width of the sheet.
  float ground = 0.060 + 0.030 * goNoise(q * vec2(2.1, 2.7) + seed * 7.3)
               + 0.040 * clamp(1.0 - vUv.y, 0.0, 1.0)
               + 0.020 * goNoise(q * vec2(6.3, 5.1) + seed * 2.9);
  float amt = clamp(ground * (0.06 + 1.75 * load), 0.0, 0.48);
  vec3 skyCol = mix(uPaper, uSeaShallow, amt);
  skyCol *= 1.0 + (load - 0.62) * 0.09;
  skyCol = mix(cC, skyCol, skyMix);
  // The frame's own sky is not thrown away with the paper: the four rays are what
  // lies that way without this pixel, so wherever the frame drew something the
  // rays stand on bare sheet and this pixel does not — a ring's arc, a moon, the
  // edge of a cloud — that mark is left as the frame drew it, and only the bare
  // paper between the marks is brushed over.
  float bg = 0.25 * ((lA + lB + lC + lD) - 0.96 * lumC) * 1.3158;
  float spread = max(max(lA, lB), max(lC, lD)) - min(min(lA, lB), min(lC, lD));
  float kept = clamp(smoothstep(0.045, 0.20, abs(lumC - bg)) * 0.88
                   + smoothstep(0.060, 0.26, spread) * 0.80, 0.0, 0.94);
  skyCol = mix(skyCol, cC, kept);

  // ---- the drawn edge, read before the relief because the paint steps down at
  // the limb and the relief must not read that step as a ridge. One confident
  // load of the darkest ink carried right round the subject, pressed and lifted
  // by the hand, kept on the globe's own disc: what the frame drew beyond it — a
  // ring, a moon — is left as the pale line the frame drew and never wired black.
  float wob = 0.65 * goNoise(q * 3.4 + seed * 5.0) + 0.35 * goNoise(q * 11.0 + seed * 2.7);
  float reach = contour * (0.45 + 0.95 * wob);
  vec2 rA = vec2(reach * 0.62 * uvPerQ.x, 0.0), rB = vec2(0.0, reach * 0.62 * uvPerQ.y);
  vec2 sA = rA * 2.0, sB = rB * 2.0;
  float n1 = max(max(goSkyAt(vUv, rA), goSkyAt(vUv, -rA)), max(goSkyAt(vUv, rB), goSkyAt(vUv, -rB)));
  float n2 = max(max(goSkyAt(vUv, sA), goSkyAt(vUv, -sA)), max(goSkyAt(vUv, sB), goSkyAt(vUv, -sB)));
  float guard = uGouDisc.z > 1.0
    ? 1.0 - smoothstep(uGouDisc.z, uGouDisc.z * 1.14, length(gl_FragCoord.xy - uGouDisc.xy))
    : 1.0;
  float drawn = clamp(n1 + 0.55 * n2, 0.0, 1.0) * (1.0 - sky) * guard;

  // ---- the relief. Three things stand in the paint: the strokes' own load, the
  // big forms the picture is drawn with, and the tooth of the cloth under
  // everything — one height field, lit from over the left shoulder, which is what
  // a finished oil looks like in a raking light. The strokes' height is read from
  // the load alone, without the pigment's micro-breaks, so the raking light
  // follows the bristles and never the speckle; the picture's own step at the
  // limb is taken out of it, and no step is allowed to be steeper than paint can
  // stand.
  vec3 clo = goWeave(q, pitchW, pitchW * 1.27, seed);
  // The picture's own value around the pixel, gathered as four readings and
  // softened at the ends so a lone dark line cannot step the surface: the relief
  // follows the form, and only where the form is gentle enough to read as paint.
  vec2 mass = (uA * goSat(lA - lumC) + uB * goSat(lB - lumC) - uA * goSat(lC - lumC) - uB * goSat(lD - lumC)) * (0.5 / R1);
  float hS = widS * 0.8;
  float tC = goStroke(q, t1, t2, widS, armS, seed, 0.0);
  float tX = goStroke(q + vec2(hS, 0.0), t1, t2, widS, armS, seed, 0.0);
  float tY = goStroke(q + vec2(0.0, hS), t1, t2, widS, armS, seed, 0.0);
  float sH = sWid * 0.6;
  float sC = goStroke(q, k1, k2, sWid, sArm, seed * 1.7 + 31.0, 0.0);
  float sX = goStroke(q + vec2(sH, 0.0), k1, k2, sWid, sArm, seed * 1.7 + 31.0, 0.0);
  float sY = goStroke(q + vec2(0.0, sH), k1, k2, sWid, sArm, seed * 1.7 + 31.0, 0.0);
  float limb = clamp(n1 + n2, 0.0, 1.0);
  vec2 slope = mass * 0.0070
             + vec2(tX - tC, tY - tC) / hS * 0.0032 * (1.0 - sky)
             + vec2(sX - sC, sY - sC) / sH * 0.0032 * sky
             + clo.yz * 0.00022;
  slope *= imp * 0.9 / (0.9 + length(slope));      // no ridge leans past its own height
  vec3 N = normalize(vec3(-slope, 1.0));
  vec3 Lg = normalize(vec3(-0.55, 0.62, 0.55));
  // The relief is a whisper of a raking light, but it must still be a light: the
  // slopes above come out in hundredths, so the term is scaled to the handful of
  // levels a real impasto shows in a photograph, and no more.
  float relief = (dot(N, Lg) - 0.553) * 1.90 * (1.0 - 0.85 * limb);

  // ---- everything at once: the cloth reading hardest where the paint is thin,
  // the sheet's own ground where the sky is, and the impasto standing on the
  // paint rather than on the bare paper.
  float wash = mix(1.0, 1.5, sky) * mix(1.0, 0.30, clamp(thick * 1.15, 0.0, 1.0));
  col = mix(col, skyCol, sky);
  col *= 1.0 + (clo.x - 0.62) * tooth * wash;
  col *= 1.0 + relief * imp * mix(1.0, 0.45, sky);
  col = mix(col, mix(uInk, uSeaDeep, 0.18), drawn * 0.80);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`,
  uniforms(ctx = {}) {
    // A dial comes from params.js as `print.gouache.patch` when it is there at
    // all, and from the bare name otherwise. Either way it is the screen this
    // module ships, so an absent entry and the shipped value both leave the
    // painting exactly as it is drawn here.
    const dial = (name, fallback) => {
      const p = ctx?.dials;
      const value = p?.[`print.gouache.${name}`] ?? p?.[name];
      return typeof value === 'number' ? value : fallback;
    };
    const T = ctx?.THREE;
    return {
      // The craft dials. Every length is a fraction of the sheet's height, so a
      // capture at any size paints the same picture, only finer.
      uGouPatch: { value: dial('patch', 0.0170) },      // the arm's reach of one flat patch
      uGouBristle: { value: dial('bristle', 0.0300) },  // the width of the brush the picture was laid with
      uGouLength: { value: dial('length', 0.1900) },    // how far the arm is dragged
      uGouImpasto: { value: dial('impasto', 0.60) },    // how far the paint stands off the cloth
      uGouWeave: { value: dial('weave', 0.0118) },      // the cloth's warp pitch, the weft set wider
      uGouTooth: { value: dial('tooth', 0.070) },       // how much the weave reads in the value
      uGouContour: { value: dial('contour', 0.0105) },  // the drawn edge's own width
      uGouChroma: { value: dial('chroma', 1.34) },      // how far the pigment is pushed past the ink's
      uGouSky: { value: dial('sky', 0.90) },            // how much of the sky is this print's own ground
      // Filled in by update(): the globe's disc on the sheet, in device pixels.
      uGouDisc: { value: T ? new T.Vector3(0, 0, 0) : { x: 0, y: 0, z: 0 } },
    };
  },
  // The drawn edge is the planet's own, so the disc has to be found on the sheet
  // each frame — and never allocated more than once. A sphere projects to a
  // circle of radius f·ρ/√(d²−ρ²), the same geometry the sheet's own atmosphere
  // band is built on; from the surface there is no disc at all, the radius comes
  // back 0, and the guard lets the edge be drawn wherever the hand finds one.
  update(ctx = {}, uniforms) {
    const value = uniforms?.uGouDisc?.value;
    const camera = ctx.camera;
    const res = ctx.resolution;
    if (!value || !camera || !res || !camera.isCamera || !camera.fov) return;
    if (!_globe) {
      if (!ctx.THREE?.Vector3) return;
      _globe = new ctx.THREE.Vector3();
    }
    const f = (res.y * 0.5) / Math.tan((camera.fov * Math.PI) / 360);
    // The orbit view caps its relief (the world's own reliefCap is 12, lifted
    // further by the spines dial), so the silhouette the frame draws reaches a
    // little past sea level: the guard is measured on the widest the globe can
    // stand, or it would cut the contour off inside the planet's own limb.
    const rho = (ctx.radius ?? 120) + Math.max(ctx.seaLevel ?? 0, _CAP);
    const d0 = camera.position.length();
    const r = d0 > rho * 1.02 ? (f * rho) / Math.sqrt(Math.max(1e-3, d0 * d0 - rho * rho)) : 0;
    _globe.set(0, 0, 0).project(camera);
    value.set((_globe.x * 0.5 + 0.5) * res.x, (_globe.y * 0.5 + 0.5) * res.y, r);
  },
};

// The globe's origin, kept out of the frame so the projection above allocates
// nothing after the first update.
let _globe = null;

// How far the orbit's relief may stand above sea level (base.js caps a mountain
// chain at 12, and the spines dial lifts that cap by 5 more), so the silhouette
// the poster draws is measured on the widest the globe can be.
const _CAP = 17;

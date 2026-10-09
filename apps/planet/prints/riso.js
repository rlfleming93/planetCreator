/* Planet Creator — the riso print.
 *
 * A risograph never mixes its ink. It runs the sheet past the drum once for
 * every spot colour it was given, and what the colours do where they overlap is
 * the picture. So the frame is separated into plates — the week's sea blue,
 * a warm accent struck from its land colour, and the ink dark — and each plate is
 * laid as a screen of its own ruling and angle, a hair out of register with the
 * other two, and starved wherever the drum met a dry patch of sheet. Where the
 * plates land on each other the inks multiply, which is the third colour the
 * process is loved for.
 *
 * The screen belongs to the sheet, never to the planet: turn the camera and the
 * rosette stands still, exactly as it would on paper. Nothing here reads uTime,
 * so no frame is ever re-drawn, and nothing is a Math.random — the register of
 * each plate comes from the week's own uSeed.
 *
 * The pass reads the finished ink frame (tDiffuse) for its tones and the depth
 * buffer twice, to keep every plate off the sky — the drum is run past the
 * planet three times and the space around it is left as the bare sheet — and to
 * carry one drawn line round the silhouette, which is what holds a sphere whose
 * lights are bare paper. Every geometric decision below is measured in fractions
 * of the sheet's height, so a capture at twice the size draws the same print
 * twice as fine rather than a coarser one.
 */
export default {
  id: 'riso',
  label: 'Riso',
  fragment: /* glsl */ `
uniform sampler2D tDiffuse, tDepth;
uniform vec2 uResolution;
uniform vec3 uPaper, uInk, uSeaDeep, uLand;
uniform float uSeed;
uniform float uRisoCells, uRisoReg, uRisoTooth, uRisoStarv, uRisoPunch;
varying vec2 vUv;

float prH12(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float prN2(vec2 x){
  vec2 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(prH12(i), prH12(i + vec2(1.0, 0.0)), f.x);
  float b = mix(prH12(i + vec2(0.0, 1.0)), prH12(i + vec2(1.0, 1.0)), f.x);
  return mix(a, b, f.y);
}
// The sheet: a cold-press grain, a fibre stretched along it, and the uneven
// absorbency of a sheet that dried on the frame. Paper, never world.
float prTooth(vec2 sp){
  return clamp(prH12(floor(sp * 0.85)) * 0.50
             + prH12(floor(vec2(sp.x * 0.22, sp.y * 1.06) + 31.0)) * 0.31
             + prH12(floor(vec2(sp.x * 1.12, sp.y * 0.19) + 71.0)) * 0.19, 0.0, 1.0);
}
// One plate: a dot of ink at the middle of every cell of a grid turned to that
// plate's own angle. The dot's radius carries the tone the frame asks for, its
// cell's own hash makes it as irregular as a drum's, and the pixel of edge
// around it is where the sheet, where it was dry, eats into the dot. The warp
// is how far a dot may wander out of its own cell: at 0 the plate is a ruled
// halftone, at 1 it is a graining with no grid left in it.
float prDot(vec2 q, vec2 reg, float dens, float ang, float cell, float pxPerCell, float grain, float warp){
  float ca = cos(ang), sa = sin(ang);
  vec2 r = q + reg;
  vec2 p = vec2(ca * r.x - sa * r.y, sa * r.x + ca * r.y) / cell;
  vec2 id = floor(p);
  vec2 f = p - id - 0.5 - (vec2(prH12(id + 17.3), prH12(id + 91.7)) - 0.5) * (0.7 * warp);
  float e = 1.15 / pxPerCell;
  float rad = 0.60 * sqrt(clamp(dens, 0.0, 1.0)) * (0.89 + 0.22 * prH12(id + ang * 11.0));
  float cov = 1.0 - smoothstep(rad - e, rad + e * (1.0 + 1.9 * (1.0 - grain)), length(f));
  return cov * smoothstep(0.0, 0.04, dens);
}
void main(){
  vec2 q = gl_FragCoord.xy / max(2.0, uResolution.y);   // the sheet, measured in its own height
  vec2 sheetPx = (1.0 / uResolution) * uResolution.y;   // one sheet fraction, in uv
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float sky = step(0.99998, texture2D(tDepth, vUv).x);
  float tooth = prTooth(gl_FragCoord.xy);

  // The dials: each is an offset from the screen this module ships, so a pass
  // that never spread uniforms() above still lays a whole print.
  float cell = uRisoCells > 0.0006 ? uRisoCells : 0.0130;   // 0 keeps the shipped ruling
  float regS = clamp(0.0018 + uRisoReg, 0.0, 0.006);
  float grain = clamp(0.62 + uRisoTooth, 0.10, 1.25);
  float starve = clamp(0.96 + uRisoStarv, 0.80, 1.12);  // how dry the drum was, all over
  float punch = clamp(1.50 + 0.80 * uRisoPunch, 0.9, 2.7);
  // The week's number, folded into 0..1 whichever magnitude the host hands it:
  // a name's hash is a big integer and a fraction is small, and either way two
  // weeks must land on two different numbers.
  float seed = fract(uSeed * 0.6180339887);

  // ---- the separation. Every pixel of the frame is the paper, plus so much
  // value, plus a lean one way or the other. The value comes out first — it is
  // the sheet's own paper-to-ink axis — and what is left is chroma: the sea's
  // blue and the land's warmth, with the value taken out of those two as well.
  // They then stand nearly opposite each other, so a plate prints only where
  // the picture leans its own way, and a neutral grey leans nowhere and is left
  // to the key plate.
  vec3 W = vec3(0.32, 0.55, 0.13);
  float lum = dot(c, W);
  float pl = dot(uPaper, W), il = dot(uInk, W);
  float v = clamp((pl - lum) / max(1e-3, pl - il), 0.0, 1.0);
  vec3 e0 = uInk - uPaper;
  float e00 = max(1e-4, dot(e0, e0));
  vec3 dd = c - uPaper;
  vec3 chroma = dd - e0 * clamp(dot(dd, e0) / e00, 0.0, 1.20);
  vec3 e1 = uSeaDeep - uPaper; e1 -= e0 * (dot(e1, e0) / e00);
  vec3 e2 = uLand - uPaper; e2 -= e0 * (dot(e2, e0) / e00);
  float sAmt = clamp(dot(chroma, e1) / max(0.03, dot(e1, e1)), 0.0, 1.0);
  float lAmt = clamp(dot(chroma, e2) / max(0.03, dot(e2, e2)), 0.0, 1.0);

  // Where nothing was printed the sheet is still a sheet. The sky is not a
  // colour on a riso — it is the paper the drum never touched — so all three
  // plates are dry there and the depth buffer is what says so.
  float bare = 1.0 - sky;
  // The tone the picture has already committed to, measured once because two of
  // the three plates answer to it.
  float shade = smoothstep(0.52, 0.92, v);
  // Each plate opens with the tone as well as with its own colour: a printer
  // screens a pale ground thinly, and an ink laid on thick where the picture is
  // light stops being a screen and becomes a field of colour. Blue takes the
  // sea, warm takes the land, and both are bolder as the ground goes down.
  float dB = max(sAmt * smoothstep(0.10, 0.55, v), 0.20 * shade);
  float dW = max(lAmt * mix(0.14, 0.62, smoothstep(0.10, 0.60, v)), 0.18 * shade * lAmt);
  // Key: everything the frame has already committed to ink — the contours, the
  // shadow masses — ruled coarser than either colour, so the dark plate reads as
  // its own screen lying over the other two rather than as more of the blue.
  float dK = smoothstep(0.56, 0.96, v);
  // No plate reaches solid, and neither do the three of them together: what is
  // left between the dots is paper. A dark mass is three screens over each other
  // and never a blot, and where two of them land on the same place the inks
  // multiply, which is the third colour the process gets for free.
  dB = min(dB, 0.80);
  dW = min(dW, 0.72);
  dK = min(dK, 0.62);
  float laid = 1.0 - (1.0 - dB) * (1.0 - dW) * (1.0 - dK);
  float fit = laid > 0.86 ? 0.86 / laid : 1.0;
  dB *= fit * bare;
  dW *= fit * bare;
  dK *= fit * bare;

  // Three plates, three rulings: the blue is the finest, the warm accent sits
  // just off it, and the key is the coarsest of the three — which is what lets
  // the dark plate read as its own screen lying over the colours rather than as
  // more of the blue. Each came off the drum a little shifted, and the shift is
  // the week's seed's, so a week's print is the same print every time it is
  // pulled.
  vec2 reg1 = vec2(prH12(vec2(seed * 91.7, 3.1)) - 0.5, prH12(vec2(seed * 57.3, 17.9)) - 0.5) * regS;
  vec2 reg2 = vec2(prH12(vec2(seed * 13.9, 41.0)) - 0.5, prH12(vec2(seed * 67.1, 7.7)) - 0.5) * regS;
  vec2 reg3 = vec2(prH12(vec2(seed * 29.3, 23.0)) - 0.5, prH12(vec2(seed * 11.3, 53.0)) - 0.5) * regS;
  float cB = prDot(q, reg1, dB * starve * (0.92 + 0.16 * prN2(q * 4.3 + 1.0)), 0.2618, cell, max(2.0, cell * uResolution.y), grain, 0.30);
  float cW = prDot(q, reg2, dW * starve * (0.92 + 0.16 * prN2(q * 5.1 + 7.0)), 1.3090, cell * 0.98, max(2.0, cell * 0.98 * uResolution.y), grain, 0.32);
  float cK = prDot(q, reg3, dK * starve * (0.92 + 0.16 * prN2(q * 3.7 + 13.0)), 0.7854, cell * 1.15, max(2.0, cell * 1.15 * uResolution.y), grain, 0.16);

  // The inks, and the one law a risograph really obeys: what is laid down
  // multiplies what is already under it, and the sheet is under everything. The
  // warm accent is not the land's own colour — it is the land's colour pushed
  // away from the paper until it glows, which is what a fluorescent ink is.
  vec3 warm = clamp(uPaper + (uLand - uPaper) * punch + vec3(0.05, 0.0, -0.02) * punch, 0.0, 1.0);
  vec3 Tb = max(mix(uSeaDeep, uInk, 0.16), vec3(0.01)) / max(uPaper, vec3(0.02));
  vec3 Tw = max(warm, vec3(0.01)) / max(uPaper, vec3(0.02));
  vec3 Tk = max(uInk, vec3(0.01)) / max(uPaper, vec3(0.02));
  vec3 col = uPaper * pow(Tb, vec3(cB)) * pow(Tw, vec3(cW)) * pow(Tk, vec3(cK));

  // ---- the sheet under the ink: its tooth reads through the bare paper and is
  // quietest where the pigment has settled into it.
  col *= 1.0 + (tooth - 0.5) * 0.055 * (1.0 - 0.65 * max(max(cB, cW), cK));
  col *= 1.0 + (prN2(q * 2.6 + 21.0) - 0.5) * 0.022;
  // ---- the edge of the plate. A riso of a sphere that leans on bare paper for
  // its lights would otherwise dissolve into scattered dots exactly where the
  // picture needs a shape, so the drum runs a last pass along the silhouette:
  // the one line on the sheet that is drawn and not screened, carried all the
  // way round the subject and never once into the space outside it.
  vec2 lo = sheetPx * 0.0050;
  float lm = max(max(step(0.99998, texture2D(tDepth, vUv - vec2(lo.x, 0.0)).x), step(0.99998, texture2D(tDepth, vUv + vec2(lo.x, 0.0)).x)),
                 max(step(0.99998, texture2D(tDepth, vUv - vec2(0.0, lo.y)).x), step(0.99998, texture2D(tDepth, vUv + vec2(0.0, lo.y)).x)));
  col = mix(col, uInk, lm * bare * 0.88);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`,
  uniforms(ctx = {}) {
    // A dial comes from params.js as `print.riso.cells` when it is there at all,
    // and from the bare name otherwise. Either way it is an offset from the
    // screen this module ships, so an absent entry and a 0 both change nothing.
    const dial = (name, fallback) => {
      const p = ctx?.dials;
      const value = p?.[`print.riso.${name}`] ?? p?.[name];
      return typeof value === 'number' ? value : fallback;
    };
    return {
      // The craft dials. Every length is a fraction of the sheet's height, so a
      // capture at any size draws the same print, only finer; the shader adds
      // each to the screen it ships, so an unspread uniform changes nothing.
      uRisoCells: { value: dial('cells', 0.0130) },      // the screen's cell, sheet fractions
      uRisoReg: { value: dial('register', 0.0002) },     // how far a plate may sit off the others
      uRisoTooth: { value: dial('tooth', 0.10) },        // how much the sheet's tooth eats the dots
      uRisoStarv: { value: dial('starve', 0.05) },       // how dry the drum ran
      uRisoPunch: { value: dial('punch', 0.10) },        // how fluorescent the warm accent is
    };
  },
};

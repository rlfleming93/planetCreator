/* Planet Creator — the woodblock print.
 *
 * Moku-hanga is cut, not painted: a colour is a block, a block is a flat, and
 * the drawing lives in the key block that was cut last and printed on top of
 * everything. So the frame is posterised into flats — the sea's blues, the
 * land's warm cuts, the ink — each flat is bounded by a bold key line drawn
 * where the ground steps or where two flats meet, the sky is wiped as a bokashi
 * from the loaded top of the sheet down into bare paper, and the plank the
 * block was cut from shows its grain through whatever area is loaded.
 *
 * Every length below is a fraction of the sheet's height, so a capture at twice
 * the size is the same print twice as fine. The block is cut from a tone and a
 * family of ground read across the width of the knife rather than at the point
 * of it, and every edge wanders over the sheet rather than per pixel: a week of
 * hard training cuts into flats and into pieces of line, never into speckle.
 * Nothing reads uTime: a block does not move between frames, and nothing here is
 * a Math.random — the key block's register comes from the week's uSeed.
 */
export default {
  id: 'woodblock',
  label: 'Woodblock',
  fragment: /* glsl */ `
uniform sampler2D tDiffuse, tDepth;
uniform vec2 uResolution;
uniform vec3 uPaper, uInk, uSeaDeep, uSeaShallow, uLand;
uniform float uSeed;
uniform float uWoodKey, uWoodWob, uWoodReg, uWoodCut, uWoodGrain, uWoodFibre, uWoodBokashi;
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
// The hand that cut the block wanders: two octaves of it, both slow enough to
// be a cut and not a grain, and both measured on the sheet, so an edge wanders
// the same way at whatever size the print is pulled. A boundary is then one
// clean wandering cut rather than a fringe of speckle.
float prWiggle(vec2 q){
  return (prN2(q * 46.0 + 3.0) - 0.5) * 0.68 + (prN2(q * 112.0 + 11.0) - 0.5) * 0.32;
}
// The plank the block was cut from: grain running the long way of the sheet, a
// slower wave bending it, and no ring so tight it would read as a pattern.
float prGrain(vec2 sp, float k){
  float g = prN2(vec2(sp.x * 0.18, sp.y * 2.75) + k);
  g = g * 0.62 + prN2(vec2(sp.x * 0.46, sp.y * 7.10) + k + vec2(5.0, 31.0)) * 0.38;
  return g;
}
// Which flat a tone belongs to: the family it leans to and the band it was cut
// in. Only a change in this number draws a key line, and the sky is one flat
// whatever the bokashi does inside it. The tone read here is the tone the block
// was cut from — the frame across a hand's width of sheet, not at the point of
// the knife — so the flats are a carver's hills and never the painting's every
// pebble. What the wander of the knife does is jig the cut, not the tone.
float prFlat(float vn, float lean, float skyN, float jig){
  if (skyN > 0.5) return -1.0;
  float band = clamp(floor(clamp(vn + jig * 0.05, 0.0, 1.0) * 3.0), 0.0, 2.0);
  return 8.0 * step(-jig * 0.07, lean) + band + 4.0 * step(0.80, vn);
}
// Which side of the sheet's own axis a colour leans to: below zero the ground is
// the land's warm, above it the sea's cool. The block reads it over its own
// reach rather than at the point of the knife, so a coastline comes out as one
// cut and not as a row of islands.
float prLean(vec3 n){
  float cool = clamp((n.b - n.r) / max(0.02, uSeaShallow.b - uSeaShallow.r), 0.0, 1.0);
  float warm = clamp((n.r - n.b) / max(0.02, uLand.r - uLand.b), 0.0, 1.0);
  return cool - warm;
}
// One arm of the key block's edge test: whether the flat a step away belongs to
// another block at all, how far the ground there sits behind this pixel's, and
// whether the sheet beyond is bare sky — which is what the silhouette is. Both
// the tone and the family the far flat is judged in are this pixel's own block
// reads carried by the small step the arm took, so the test weighs the same
// flats the knife cut and not the grain of the painting between them.
vec3 prKey(vec2 uvp, vec2 qn, float d0, float idSelf, float vb, float v, float lean, float leanRaw){
  vec3 W = vec3(0.32, 0.55, 0.13);
  float dn = texture2D(tDepth, uvp).x;
  float sn = step(0.99998, dn);
  vec3 cn = texture2D(tDiffuse, uvp).rgb;
  float pl = dot(uPaper, W), il = dot(uInk, W);
  float vn = clamp((pl - dot(cn, W)) / max(1e-3, pl - il), 0.0, 1.0);
  float idn = prFlat(clamp(vb + (vn - v), 0.0, 1.0), lean + (prLean(cn) - leanRaw), sn, prWiggle(qn));
  return vec3(step(0.5, abs(idn - idSelf)), abs(dn - d0) / max(0.05, min(dn, d0)), sn);
}
// The band a printer cut in: light, mid, dark. Flat, because a block is.
vec3 prBand(vec3 a, vec3 b, vec3 d, float x){
  if (x < 0.5) return a;
  if (x < 1.5) return b;
  return d;
}
void main(){
  vec2 px = 1.0 / uResolution;
  vec2 q = gl_FragCoord.xy / max(2.0, uResolution.y);   // the sheet, measured in its own height
  vec2 sheetPx = px * uResolution.y;                    // one sheet fraction, in uv
  float tooth = prTooth(gl_FragCoord.xy);
  float d0 = texture2D(tDepth, vUv).x;
  float sky = step(0.99998, d0);
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  vec3 W = vec3(0.32, 0.55, 0.13);
  float pl = dot(uPaper, W), il = dot(uInk, W);
  float lum = dot(c, W);
  float v = clamp((pl - lum) / max(1e-3, pl - il), 0.0, 1.0);

  // The dials: each is an offset from the block this module ships, so a pass
  // that never spread uniforms() above still pulls a whole print.
  float kw = clamp(0.0029 + uWoodKey, 0.0005, 0.008);    // half a key line
  float wf = clamp(0.0013 + uWoodWob, 0.0, 0.006);       // how far the cut wanders
  float rf = clamp(0.0013 + uWoodReg, 0.0, 0.004);       // the key block off the colour blocks
  float reach = clamp(0.0082 + uWoodCut, 0.002, 0.030);  // the carver's reach, sheet fractions
  float grain = clamp(0.55 + uWoodGrain, 0.0, 1.5);
  float fibre = clamp(0.55 + uWoodFibre, 0.0, 1.5);
  float bok = clamp(0.70 + uWoodBokashi, 0.0, 1.6);
  // The week's number, folded into 0..1 whichever magnitude the host hands it:
  // a name's hash is a big integer and a fraction is small, and either way two
  // weeks must land on two different numbers.
  float seed = fract(uSeed * 0.6180339887);

  // ---- the tone the block is cut from, and the family of ground it belongs to.
  // A carver's block knows a hill, not a pebble: the frame is read across the
  // width of the knife rather than at its point, and every decision the key
  // block makes — which band a fill is, whether the ground is sea or land, where
  // an edge is — is made on those reads. This is what keeps a week of hard
  // training from cutting its own grain into the print as speckle. The bare
  // tone is kept as well: what dries into the sheet is the painting's own.
  vec2 kx = vec2(sheetPx.x * reach, 0.0);
  vec2 ky = vec2(0.0, sheetPx.y * reach);
  vec3 cL = texture2D(tDiffuse, vUv - kx).rgb, cR = texture2D(tDiffuse, vUv + kx).rgb;
  vec3 cD = texture2D(tDiffuse, vUv - ky).rgb, cU = texture2D(tDiffuse, vUv + ky).rgb;
  float lumL = dot(cL, W), lumR = dot(cR, W), lumD = dot(cD, W), lumU = dot(cU, W);
  float dL = texture2D(tDepth, vUv - kx).x, dR = texture2D(tDepth, vUv + kx).x;
  float dD = texture2D(tDepth, vUv - ky).x, dU = texture2D(tDepth, vUv + ky).x;
  float tone = max(1e-3, pl - il);
  float vb = clamp((pl - (lum + lumL + lumR + lumD + lumU) * 0.2) / tone, 0.0, 1.0);
  float leanRaw = prLean(c);
  float lean = (leanRaw + prLean(cL) + prLean(cR) + prLean(cD) + prLean(cU)) * 0.2;

  // ---- the flats. Two families — the sea's cool and the land's warm — and
  // three cuts to a family, which is what a printer carries to a sheet like
  // this. The cut wanders with the hand that held the knife, so the edge is the
  // carver's and not the ruler's.
  float jig = prWiggle(q);
  float sea = step(-jig * 0.07, lean);
  float band = clamp(floor(clamp(vb + jig * 0.05, 0.0, 1.0) * 3.0), 0.0, 2.0);
  float idSelf = prFlat(vb, lean, sky, jig);

  vec3 seaL = mix(uSeaShallow, uPaper, 0.40);
  vec3 seaM = mix(uSeaShallow, uSeaDeep, 0.42);
  vec3 seaD = mix(uSeaDeep, uInk, 0.42);
  vec3 landL = mix(uLand, uPaper, 0.45);
  vec3 landM = mix(uLand, uPaper, 0.05);
  vec3 landD = mix(uLand, uInk, 0.42);
  vec3 flatC = sea > 0.5 ? prBand(seaL, seaM, seaD, band) : prBand(landL, landM, landD, band);
  // Bare paper stays bare, and what the frame has already darkened to its ink
  // prints as the ink. Both reads are the block's own tone, so a fill and the
  // cut around it agree.
  flatC = mix(flatC, uPaper, (1.0 - smoothstep(0.02, 0.15, vb)) * (1.0 - sky));
  flatC = mix(flatC, uInk, smoothstep(0.78, 0.94, vb));

  // ---- the sky block. It was wiped from a loaded brush at the top of the sheet
  // down into nothing above the horizon, and the week's own sky decides how far
  // the brush was carried: what the frame shows as cloud becomes the hard band a
  // printer would have cut rather than a gradation.
  float skyv = smoothstep(0.02, 0.30, v);
  float grad = pow(clamp((vUv.y - 0.04) / 0.96, 0.0, 1.0), 1.30);
  float bandy = floor(clamp(skyv, 0.0, 1.0) * 4.0) * 0.25;
  vec3 skyC = mix(uPaper, uSeaDeep, clamp(0.72 * grad * (0.30 + 0.70 * (0.55 * bandy + 0.45 * skyv)) * bok, 0.0, 0.94));

  // ---- the key block. Every edge the picture has — where the ground steps and
  // where two flats meet — is drawn in ink: wider than the brush line the wash
  // pass leaves, cut by hand rather than ruled (the whole edge wanders before it
  // is cut), swelling where the carver left more wood, and pulled a hair off the
  // colour blocks the way a key block always is.
  vec2 reg = vec2(prH12(vec2(seed * 37.1, 5.0)) - 0.5, prH12(vec2(seed * 73.7, 11.0)) - 0.5) * (2.0 * rf);
  float wx = prN2(q * 2.1 + 1.0) - 0.5;
  float wy = prN2(q * 2.1 + 23.0) - 0.5;
  float swell = 0.62 + 0.76 * prN2(q * 3.3 + 8.0);
  // Where the knife went, in sheet fractions: the edge the picture has, less the
  // wander of the hand, less the register of the block.
  vec2 cut = vec2(wx, wy) * (2.0 * wf) + reg;
  float arm = kw * swell;
  vec3 kR = prKey(vUv + sheetPx * (cut + vec2(arm, 0.0)), q + cut + vec2(arm, 0.0), d0, idSelf, vb, v, lean, leanRaw);
  vec3 kL = prKey(vUv + sheetPx * (cut - vec2(arm, 0.0)), q + cut - vec2(arm, 0.0), d0, idSelf, vb, v, lean, leanRaw);
  vec3 kU = prKey(vUv + sheetPx * (cut + vec2(0.0, arm)), q + cut + vec2(0.0, arm), d0, idSelf, vb, v, lean, leanRaw);
  vec3 kD = prKey(vUv + sheetPx * (cut - vec2(0.0, arm)), q + cut - vec2(0.0, arm), d0, idSelf, vb, v, lean, leanRaw);
  float line = max(max(kR.x, kL.x), max(kU.x, kD.x));
  // The flats a hand's width away, judged in this pixel's own tone and family.
  // An edge the block can see at the point of the knife but not at the width of
  // it is a grain of the painting and not a shape, and a knife that answered to
  // every grain would cut a busy week into a field of ticks. What both scales
  // agree on is the smallest thing anyone can call a cut.
  float vL = clamp((pl - lumL) / tone, 0.0, 1.0), vR = clamp((pl - lumR) / tone, 0.0, 1.0);
  float vD = clamp((pl - lumD) / tone, 0.0, 1.0), vU = clamp((pl - lumU) / tone, 0.0, 1.0);
  vec2 qx = vec2(reach, 0.0), qy = vec2(0.0, reach);
  float idcR = prFlat(vb + (vR - v), lean + (prLean(cR) - leanRaw), step(0.99998, dR), prWiggle(q + qx));
  float idcL = prFlat(vb + (vL - v), lean + (prLean(cL) - leanRaw), step(0.99998, dL), prWiggle(q - qx));
  float idcU = prFlat(vb + (vU - v), lean + (prLean(cU) - leanRaw), step(0.99998, dU), prWiggle(q + qy));
  float idcD = prFlat(vb + (vD - v), lean + (prLean(cD) - leanRaw), step(0.99998, dD), prWiggle(q - qy));
  float coarse = max(max(step(0.5, abs(idcR - idSelf)), step(0.5, abs(idcL - idSelf))),
                     max(step(0.5, abs(idcU - idSelf)), step(0.5, abs(idcD - idSelf))));
  line *= coarse;
  // A step is a landform only where the ground really moves across the width of
  // the knife — the arm of the point alone is a pebble, and the frame's own
  // contours have already cut their edge in the flats above. What an arm found
  // beyond the silhouette does not count either: the bare sheet is the edge
  // block's business and it has already drawn it.
  float sR = kR.z > 0.5 ? 0.0 : abs(dR - d0) / max(0.05, min(dR, d0));
  float sL = kL.z > 0.5 ? 0.0 : abs(dL - d0) / max(0.05, min(dL, d0));
  float sU = kU.z > 0.5 ? 0.0 : abs(dU - d0) / max(0.05, min(dU, d0));
  float sD = kD.z > 0.5 ? 0.0 : abs(dD - d0) / max(0.05, min(dD, d0));
  float step3 = max(max(kR.y, kL.y), max(kU.y, kD.y));
  float stepC = max(max(sR, sL), max(sU, sD));
  line = clamp(max(line, max(smoothstep(0.30, 0.62, step3), smoothstep(0.05, 0.17, stepC))), 0.0, 1.0);
  // and it breaks where the block met a dry sheet. The dryness is the sheet's
  // and is read over the sheet, so a line is broken into pieces a printer could
  // see — the paper's own tooth only takes the last of its edge — rather than
  // into a fringe of ticks.
  float dry = clamp(0.55 + 0.34 * (prN2(q * 8.5 + 4.0) - 0.5) + 0.30 * (prN2(q * 27.0 + 9.0) - 0.5) + 0.16 * (tooth - 0.5), 0.0, 1.0);
  line *= smoothstep(0.20, 0.55, dry);
  // The silhouette is cut to the block's own reach and not to the point of the
  // knife: a rim as wide as the carver's hand, laid on after the sheet has had
  // its say, because this is the one line a key block never breaks. It is where
  // an arm of the coarse test found the bare sheet — and only inside it, since
  // what is outside the subject is not this block's to cut.
  float rim = max(max(step(0.99998, dL), step(0.99998, dR)), max(step(0.99998, dD), step(0.99998, dU)));
  line = max(line, rim * (1.0 - sky) * 0.60);

  // ---- the printed sheet. The plank shows through the loaded areas and is
  // nearly gone from the bare paper; the sheet's own fibre rides under all of it.
  vec3 col = mix(flatC, skyC, sky);
  float g = prGrain(gl_FragCoord.xy / max(2.0, uResolution.y) * 6.0, floor(seed * 61.0) * 3.1 + 7.0);
  col *= 1.0 - (g - 0.5) * 0.075 * grain * (0.30 + 0.70 * smoothstep(0.02, 0.34, v));
  col *= 1.0 + (tooth - 0.5) * 0.030 * fibre + (prN2(q * 2.7 + 5.0) - 0.5) * 0.020;
  col = mix(col, uInk, line);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`,
  uniforms(ctx = {}) {
    // A dial comes from params.js as `print.woodblock.key` when it is there at
    // all, and from the bare name otherwise. Either way it is an offset from the
    // block this module ships, so an absent entry and a 0 both change nothing.
    const dial = (name, fallback) => {
      const p = ctx?.dials;
      const value = p?.[`print.woodblock.${name}`] ?? p?.[name];
      return typeof value === 'number' ? value : fallback;
    };
    return {
      // The craft dials. Every length is a fraction of the sheet's height, so a
      // capture at any size draws the same print, only finer; the shader adds
      // each to the block it ships, so an unspread uniform changes nothing.
      uWoodKey: { value: dial('key', 0.0002) },          // half the key line's width
      uWoodWob: { value: dial('wobble', 0.0002) },       // how far the cut wanders off the edge
      uWoodReg: { value: dial('register', 0.0001) },     // the key block off the colour blocks
      uWoodCut: { value: dial('cut', 0.0) },             // the width of the carver's reach
      uWoodGrain: { value: dial('grain', 0.10) },        // the plank showing through the flats
      uWoodFibre: { value: dial('fibre', 0.10) },        // the sheet's own fibre
      uWoodBokashi: { value: dial('bokashi', 0.10) },    // how deep the sky's wipe is
    };
  },
};

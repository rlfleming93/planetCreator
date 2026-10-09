/* Planet Creator — the etching print.
 *
 * A copperplate has no greys. What it has is a burin, and a burin makes a
 * groove, and a groove holds ink: so the picture is built out of families of
 * parallel lines, and the tone a place carries is how many of those families
 * cross there and how wide each one was cut. The first family opens where the
 * ground has left the light behind and widens as it goes down; the second is
 * cut across it at a right angle and answers only to the shades. Where the two
 * cross, the plate holds ink nearly everywhere and prints as a dark, and a
 * sunlit slope is the bare paper the wipe left behind. Nothing in the frame is
 * a grey and nothing is a dot.
 *
 * The ruling is the plate's own and never the picture's: one fixed angle carried
 * across the copper for the whole sheet, a second family crossed over it at a
 * right angle only where the ground has gone dark, and nothing else — no field
 * of directions, so no two lines can ever cancel and knot the ruling into a
 * whorl, which is the one thing an engraving never has. The lines still follow
 * the form, because the tone they are cut from is the painting's own. Nothing
 * here reads uTime, so the field cannot crawl, and nothing is a Math.random —
 * the plate's own wear comes from the week's uSeed. Where the sheet stops and
 * the sky begins, the cut is carried all the way round the subject, which is the
 * silhouette the frame's own pale rim would not have held.
 *
 * Around the drawing sits the plate tone: the film of ink a wipe leaves behind
 * in the hollows of the copper and the streaks the rag carried it in, which is
 * the reason an etching looks like weather and not like a diagram. Over all of
 * it, at a whisper, goes the one hand-coloured wash a colourist would have laid
 * on the sheet — a single tint taken from the week's own palette, strongest in
 * the middle values where a wash shows and taken off the bare paper.
 *
 * The pass reads the finished ink frame (tDiffuse) for its tones and the depth
 * buffer once, to know the sheet from the sky. Every length below is a fraction
 * of the sheet's height, so a capture at twice the size is the same print twice
 * as fine; six texture taps carry the whole plate.
 */
export default {
  id: 'etching',
  label: 'Etching',
  fragment: /* glsl */ `
uniform sampler2D tDiffuse, tDepth;
uniform vec2 uResolution;
uniform vec3 uPaper, uInk, uSeaShallow, uLand;
uniform float uSeed;
uniform float uEtchLine, uEtchWidth, uEtchTone, uEtchWash, uEtchBite;
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
// One cut of the burin: a family of lines ruled at one angle and one spacing,
// each line wandering a little along its own length and swelling where the hand
// leaned on the tool. What comes back is how much of this point the groove
// holds — 1 in the groove, 0 on the paper between two of them.
float prCut(vec2 p, float ang, float sp, float wid){
  float ca = cos(ang), sa = sin(ang);
  vec2 r = vec2(ca * p.x + sa * p.y, ca * p.y - sa * p.x);   // into the line's own frame
  float nz = prN2(vec2(r.x * 11.0, r.y * 0.7 / sp) + 17.0);  // the hand, along the cut
  float s = r.y / sp + (nz - 0.5) * 0.20;                    // how far across the family we are
  float f = abs(fract(s) - 0.5) * 2.0;                       // 0 at a groove, 1 between two
  float w = wid * (0.84 + 0.32 * nz);
  float e = 1.25 / max(2.0, sp * uResolution.y);             // a pixel of edge, in pitches
  return 1.0 - smoothstep(w - e, w + e, f);
}
void main(){
  vec2 q = gl_FragCoord.xy / max(2.0, uResolution.y);   // the sheet, measured in its own height
  vec2 sheetPx = (1.0 / uResolution) * uResolution.y;   // one sheet fraction, in uv
  float tooth = prTooth(gl_FragCoord.xy);
  float d0 = texture2D(tDepth, vUv).x;
  float sky = step(0.99998, d0);
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  vec3 W = vec3(0.32, 0.55, 0.13);
  float pl = dot(uPaper, W), il = dot(uInk, W);
  float lum = dot(c, W);
  float v = clamp((pl - lum) / max(1e-3, pl - il), 0.0, 1.0);

  // The dials: each is an offset from the plate this module ships, so a pass
  // that never spread uniforms() above still pulls a whole print.
  float sp = clamp(0.0135 + uEtchLine, 0.0030, 0.0400);   // the ruling, sheet fractions
  float wid = clamp(uEtchWidth, 0.0, 0.30);               // how much wider every groove is cut
  float plate = clamp(0.34 + uEtchTone, 0.0, 1.20);       // how much ink the wipe left
  float washA = clamp(0.20 + uEtchWash, 0.0, 0.60);       // the colourist's tint
  float bite = clamp(0.55 + uEtchBite, 0.05, 1.20);       // how the acid bit the open lines
  // The week's number, folded into 0..1 whichever magnitude the host hands it:
  // a name's hash is a big integer and a fraction is small, and either way two
  // weeks must land on two different numbers.
  float seed = fract(uSeed * 0.6180339887);

  // ---- the ruling. An engraving is ruled, not drawn: the plate is carried
  // across the copper at one angle and one spacing for the whole picture, and
  // what keeps it from being a machine's is the hand that pushed it — every line
  // wanders and swells on its own account below. Because there is one fixed
  // angle and no field of directions, no two families here can ever agree to
  // cancel: nothing in this plate can knot into a whorl, and the same copper
  // rules the same lines in every frame the week is pulled.
  float ang = 0.5515 + (seed - 0.5) * 0.12;

  // ---- the tone, cut. Two families and no more, and the range they cover is
  // the whole picture: the first opens only where the ground has left the light
  // behind, so the sunlit side of the sphere prints as the bare paper the wipe
  // left it, and widens as the ground goes down; the second is cut across it at
  // a right angle and opens only where the picture is already dark, so a shade
  // is crossed lines and a highlight is paper. Between them there is no grey
  // anywhere and no dot: what a place gets is more line, and a wider one.
  float t0 = clamp((v - 0.30) / 0.30, 0.0, 1.0);
  float t1 = clamp((v - 0.62) / 0.22, 0.0, 1.0);
  float ink = prCut(q, ang, sp, wid + 0.62 * t0) * step(0.004, t0);
  ink = max(ink, prCut(q, ang + 1.5708, sp * 0.74, wid + 0.48 * t1) * step(0.004, t1));

  // ---- the plate tone. What the wipe left in the hollows, streaked along the
  // way the rag went, heaviest where the hand pressed it: the film that makes an
  // etching a print of a plate and not a drawing of a place. The sky keeps the
  // same film a stop lighter, which is what a plate does to the space it holds.
  float streak = prN2(vec2(q.x * 1.35 + q.y * 0.26, q.y * 4.6) + 31.0) * 0.62
               + prN2(vec2(q.x * 3.10 + q.y * 0.55, q.y * 10.5) + 7.0) * 0.38;
  float wipe = plate * (0.42 + 0.58 * streak) * (1.0 - 0.35 * sky);
  // the plate's own wear: a week's plate is used, and the film lies in patches
  float wear = 0.80 + 0.20 * prN2(q * 2.3 + floor(seed * 97.0) + 5.0);

  // ---- the plate mark. A plate has an edge and the printer draws it: where the
  // sheet stops and the sky begins the cut is carried round the whole subject,
  // so the globe keeps the silhouette a plate gives it however pale the frame's
  // own rim was — and it is the one line nothing in the acid breaks.
  vec2 lo = sheetPx * 0.0048;
  float lm = max(max(step(0.99998, texture2D(tDepth, vUv - vec2(lo.x, 0.0)).x), step(0.99998, texture2D(tDepth, vUv + vec2(lo.x, 0.0)).x)),
                 max(step(0.99998, texture2D(tDepth, vUv - vec2(0.0, lo.y)).x), step(0.99998, texture2D(tDepth, vUv + vec2(0.0, lo.y)).x)));

  // ---- what the acid did. A groove that took its bite prints as a line and one
  // the acid found the plate already pitted in prints broken, so the drawing is
  // not a ruling but a hand's: the breaks are the plate's, read over the sheet.
  float dry = clamp(0.62 + 0.30 * (prN2(q * 7.4 + 13.0) - 0.5) + 0.22 * (prN2(q * 23.0 + 3.0) - 0.5), 0.0, 1.0);
  float broken = mix(smoothstep(0.18, 0.52, dry), 1.0, 1.0 - bite);

  // ---- the print. Paper under everything, the plate's film over it, the ink of
  // the grooves over that, and one hand-laid wash over the whole of it.
  vec3 col = uPaper * (1.0 + (tooth - 0.5) * 0.045);
  col = mix(col, uInk, clamp(wipe * 0.22 * wear, 0.0, 0.42));
  vec3 inkCol = mix(uInk, mix(uInk, uPaper, 0.12), 0.35 * sky);
  col = mix(col, inkCol, clamp(ink * broken, 0.0, 1.0));
  col = mix(col, uInk, lm * (1.0 - sky) * 0.90);
  // the deepest masses hold so much ink they print solid, and the lightest
  // grounds are wiped so clean the paper's own tooth is what is left
  col = mix(col, uInk, smoothstep(0.90, 0.99, v) * 0.70);
  col = mix(col, uPaper, (1.0 - smoothstep(0.02, 0.07, v)) * (1.0 - sky) * 0.55);
  // the one wash: a tint of the week's own coast colour, laid thin and lifted
  // off the highlights, so the sheet reads as a coloured print and not a dyed one
  float lean = clamp((c.r - c.b) / max(0.02, uLand.r - uLand.b), 0.0, 1.0);
  vec3 wash = mix(uSeaShallow, uLand, smoothstep(0.02, 0.16, lean));
  float washHere = washA * (1.0 - sky) * (0.30 + 0.70 * smoothstep(0.02, 0.40, v)) * (1.0 - 0.25 * ink);
  col = mix(col, col * mix(vec3(1.0), wash / max(uPaper, vec3(0.05)), 0.80), clamp(washHere, 0.0, 0.60));
  col *= 1.0 + (prN2(q * 2.6 + 21.0) - 0.5) * 0.020;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`,
  uniforms(ctx = {}) {
    // A dial comes from params.js as `print.etching.groove` when it is there at
    // all, and from the bare name otherwise. Either way it is an offset from the
    // plate this module ships, so an absent entry and a 0 both change nothing.
    const dial = (name, fallback) => {
      const p = ctx?.dials;
      const value = p?.[`print.etching.${name}`] ?? p?.[name];
      return typeof value === 'number' ? value : fallback;
    };
    return {
      uEtchLine: { value: dial('line', 0.0) },          // the ruling, in sheet fractions
      uEtchWidth: { value: dial('groove', 0.0) },       // how much wider each groove is cut
      uEtchTone: { value: dial('tone', 0.0) },          // how much ink the wipe left behind
      uEtchWash: { value: dial('wash', 0.0) },          // the strength of the hand-laid tint
      uEtchBite: { value: dial('bite', 0.0) },          // how cleanly the acid took the lines
    };
  },
};

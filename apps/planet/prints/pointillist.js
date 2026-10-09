/* Planet Creator — the pointillist print.
 *
 * Seurat did not lay a sea and then a sky: he put one dab of pure pigment down,
 * and another beside it, and the picture is what a hundred of them do to an eye
 * standing back from the sheet. Three laws follow, and all three are the law
 * here. A dab is one note and never a small picture, so the frame is read at
 * each dab's own centre and the whole dab is that flat colour — which is also
 * why nothing in this pass can shimmer, since the note belongs to the dab and
 * the dabs belong to the sheet. A dab is one pigment, so the place's own colour
 * is taken apart into the pigments it would have been mixed from: its chroma is
 * read against the pigments themselves — ochre through its hot red on the warm
 * side, the blue through its green on the cool side — and the place's own mix
 * decides how many dabs of each it gets, with every place keeping a few dabs of
 * the other family, since a field whose dabs all lean one way does not vibrate.
 * And the dab's *value* is asked for directly: the place's own light, less what
 * the sheet will still be showing between the dabs, is what one dab of that size
 * has to carry, and only a dab that cannot carry it in its family's own hue is
 * taken down into that family's shade. That last rule is the whole reason this
 * print does not turn to mud: a burnt sienna dab and a deep cobalt one are a
 * shadow, a grey one is a stain, and a mid-toned ground keeps its colour because
 * its dabs are never shaded further than they have to be.
 *
 * The chroma is read with the *grey* taken out of the sheet's colour rather than
 * the run from paper to ink, and the pigments are read the same way round — the
 * sheet minus the pigment — because a navy sea and a black ink lose the same
 * amount of light and do not lose the same amount of each channel. Taking the
 * third out with the value is what lets a dark sea stay blue; reading the two
 * sides the same way round is what keeps the two from cancelling.
 *
 * The dabs sit on a hex lattice a pitch apart, each walked well off its node,
 * each laid a touch longer along the line the form runs in — read from the
 * drawing's own value a dab and a half away, so the dabs follow the shapes
 * underneath them without anything being measured per pixel. A dab that lands on
 * one of the drawing's lines takes that line's colour rather than the ground
 * behind it, which is how a drawn edge survives being re-laid as dabs at all,
 * and the last dabs of a mass are laid solid so the subject keeps an edge —
 * solid, not dark, so a pale limb stays pale. The sky is not painted: it is the
 * sheet, with a sparse fall of warm and cool white dabs on it, and wherever the
 * frame had drawn something out there, the dab is that drawing instead.
 *
 * Every length below is a fraction of the sheet's height, so a capture at twice
 * the size is the same print twice as fine. Nothing here reads uTime, so no
 * frame is ever redrawn, and nothing is a Math.random — the lattice's walk, the
 * family each dab belongs to, its rung on the family's ladder and the order the
 * sky's fall lands in all come from the week's own uSeed. Eleven taps carry the
 * whole sheet.
 */
export default {
  id: 'pointillist',
  label: 'Pointillist',
  fragment: /* glsl */ `
uniform sampler2D tDiffuse, tDepth;
uniform vec2 uResolution;
uniform vec3 uPaper, uInk;
uniform vec3 uPointWarm, uPointRed, uPointCool, uPointGreen, uPointDeep;
uniform vec3 uPointWhiteW, uPointWhiteC;
uniform float uSeed;
uniform float uPointDab, uPointPitch, uPointJit, uPointElong, uPointMix, uPointInk, uPointSky, uPointRim;
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
float prLum(vec3 c){ return dot(c, vec3(0.32, 0.55, 0.13)); }
// What of a colour, over and above the light it takes off the sheet, is taken
// off each channel: its hue, as a direction, with its value thrown away.
vec3 prHue(vec3 o){
  vec3 a = o - vec3(dot(o, vec3(0.32, 0.55, 0.13)));
  return a / max(1e-3, length(a));
}
// A place on the sheet, given in fractions of its height, as a uv.
vec2 prUv(vec2 q){ return q * vec2(uResolution.y / max(1.0, uResolution.x), 1.0); }

// The lattice the dabs sit on: a hex grid — rows a pitch and a bit apart, every
// other row half a pitch across — which is the arrangement a hand falls into
// when it is told to keep the dabs the same distance apart. Each node's dab has
// walked a good way off its node, and the four nodes that can own this pixel's
// place on the sheet are searched, so a dab that has walked is still the one and
// only dab a pixel can belong to. Returns (centre.xy, key.xy): the key is the
// node's own whole number, which is what every decision about this dab is
// hashed from.
vec4 prNode(vec2 q, float p, float h, float jit, float shift){
  float r0 = floor(q.y / h - 0.5);
  vec4 best = vec4(0.0);
  float bd = 1e9;
  for (int i = 0; i < 2; i++){
    float row = r0 + float(i);
    float off = mod(row, 2.0) * 0.5;
    float c0 = floor(q.x / p - off - 0.5);
    for (int j = 0; j < 2; j++){
      float col = c0 + float(j);
      vec2 key = vec2(col, row) + shift;
      vec2 c = vec2((col + 0.5 + off) * p, (row + 0.5) * h)
             + (vec2(prH12(key + 3.7), prH12(key + 19.1)) - 0.5) * (jit * p);
      float d = length(q - c);
      if (d < bd){ bd = d; best = vec4(c, key); }
    }
  }
  return best;
}

void main(){
  vec2 q = gl_FragCoord.xy / max(2.0, uResolution.y);   // the sheet, measured in its own height
  float pxh = 1.0 / max(2.0, uResolution.y);            // one pixel, in sheet fractions

  // The dials: each is an offset from the sheet this module ships, so a pass
  // that never spread uniforms() above still pulls a whole print.
  float dabR  = clamp(0.0029 + uPointDab, 0.0012, 0.0060);   // the dab's half-width, sheet fractions
  float pitch = clamp(0.0072 + uPointPitch, 0.0040, 0.0140); // the lattice's column pitch
  float jit   = clamp(0.40 + uPointJit, 0.0, 0.45);          // how far a dab may walk off its node
  float elong = clamp(1.38 + uPointElong, 1.0, 2.10);        // how much longer than wide it is laid
  float mixA  = clamp(1.00 + uPointMix, 0.10, 1.60);         // how far the place's own hue splits the families
  float inkA  = clamp(1.00 + uPointInk, 0.30, 1.70);         // how much pigment the whole sheet holds
  float skyA  = clamp(0.55 + uPointSky, 0.02, 1.00);         // how heavy the sky's own fall is
  float rimA  = clamp(1.00 + uPointRim, 0.0, 1.60);          // how the silhouette is drawn
  // The week's number, folded into 0..1 whichever magnitude the host hands it:
  // a name's hash is a big integer and a fraction is small, and either way two
  // weeks must land on two different sheets.
  float seed = fract(uSeed * 0.6180339887);

  // ---- the dab's place. One node owns this pixel and one only, so no dab is
  // ever laid twice and the screen is the same screen in every frame.
  float h = pitch * 0.8660254;
  vec4 node = prNode(q, pitch, h, jit, floor(seed * 521.0));
  vec2 centre = node.xy, key = node.zw;
  float hA = prH12(key + 41.3), hB = prH12(key + 71.9), hC = prH12(key + 103.1);
  float hD = prH12(key + 137.3), hE = prH12(key + 173.9), hF = prH12(key + 211.7);
  float hG = prH12(key + 249.1), hH = prH12(key + 283.3);

  // ---- what the dab sees. The colour is read once, at the dab's own centre, so
  // every pixel of a dab carries the same flat note, and a second read a dab's
  // step away in a direction of its own: a dab that sits on one of the drawing's
  // own lines takes that line's colour rather than the ground behind it, which
  // is the only way a drawn edge survives being re-laid as dabs at all. Nothing
  // is read at this pixel, so nothing here can crawl between frames.
  vec3 c1 = texture2D(tDiffuse, prUv(centre)).rgb;
  float d1 = texture2D(tDepth, prUv(centre)).x;
  float sky = step(0.99998, d1);
  float a2 = hA * 6.2831853;
  vec3 c2 = texture2D(tDiffuse, prUv(centre + vec2(cos(a2), sin(a2)) * (0.85 * pitch))).rgb;
  // and it only takes the darker of its two readings when the step between them
  // is strong enough to be one of the drawing's lines: a ground's own texture
  // must not be allowed to drag the whole picture down a tone.
  vec3 c = mix(c1, c2, 0.50 * smoothstep(0.16, 0.46, prLum(c1) - prLum(c2)));

  // ---- the form's own line at this place: the direction the drawing's value
  // runs *along*, which is the direction a hand lays a dab when it is following a
  // shape rather than filling a hole. Read a dab and a half out, so the direction
  // is the shape's and not the dabs' own business; and read again closer in for
  // where the sheet stops just past this dab — the silhouette, which the frame's
  // own pale rim would not hold once it is dabs.
  float eg = 1.30 * pitch, es = 0.85 * pitch;
  vec3 cE = texture2D(tDiffuse, prUv(centre + vec2(eg, 0.0))).rgb;
  vec3 cW = texture2D(tDiffuse, prUv(centre - vec2(eg, 0.0))).rgb;
  vec3 cN = texture2D(tDiffuse, prUv(centre + vec2(0.0, eg))).rgb;
  vec3 cS = texture2D(tDiffuse, prUv(centre - vec2(0.0, eg))).rgb;
  float lE = prLum(cE), lW = prLum(cW), lN = prLum(cN), lS = prLum(cS);
  vec2 dir = vec2(lS - lN, lE - lW);   // across the run of the value, i.e. along the form
  dir = dot(dir, dir) < 1e-9 ? vec2(0.94, 0.34) : normalize(dir);
  float sE = step(0.99998, texture2D(tDepth, prUv(centre + vec2(es, 0.0))).x);
  float sW = step(0.99998, texture2D(tDepth, prUv(centre - vec2(es, 0.0))).x);
  float sN = step(0.99998, texture2D(tDepth, prUv(centre + vec2(0.0, es))).x);
  float sS = step(0.99998, texture2D(tDepth, prUv(centre - vec2(0.0, es))).x);
  float someSky = max(max(sE, sW), max(sN, sS));
  float allSky = min(min(sE, sW), min(sN, sS));

  // ---- the split. The chroma is what the sheet lost, over and above what it
  // lost all over: taking the grey out rather than the run from paper to ink is
  // what keeps a dark blue a blue, because a navy and the palette's ink lose the
  // same amount of light and not the same amount of each channel. That direction
  // is then read against the pigments' own — of this place, how much is the
  // ochre, the red, the blue, the green — as directions, so a place's darkness
  // cannot vote in it.
  float pl = prLum(uPaper), il = prLum(uInk);
  float v = clamp((pl - prLum(c)) / max(1e-3, pl - il), 0.0, 1.0);
  vec3 loss = uPaper - c;
  vec3 ch = loss - vec3(dot(loss, vec3(0.32, 0.55, 0.13)));
  vec3 u = length(ch) > 1e-4 ? normalize(ch) : vec3(0.0);
  // Read the same way round as the place's own colour — the sheet minus the
  // pigment — or a blue place and the blue pigment cancel instead of agreeing.
  vec3 nW = prHue(uPaper - uPointWarm), nR = prHue(uPaper - uPointRed);
  vec3 nC = prHue(uPaper - uPointCool), nG = prHue(uPaper - uPointGreen);
  float wW = max(dot(u, nW), 0.0), wR = max(dot(u, nR), 0.0);
  float wC = max(dot(u, nC), 0.0), wG = max(dot(u, nG), 0.0);
  float warmAmt = wW + 0.85 * wR;
  float coolAmt = wC + 0.85 * wG;
  float tot = warmAmt + coolAmt;
  // How many of this place's dabs are warm: its own lean, pushed apart by the
  // dial and held off both ends, because the few dabs of the other family are
  // the complementaries the method is built on. A place the frame left neutral
  // leans nowhere and takes an even mix, which is how a grey is made here at all.
  float lam = tot < 1e-3 ? 0.5 : warmAmt / tot;
  lam = clamp(0.5 + 1.32 * mixA * (lam - 0.5), 0.10, 0.90);
  // How red the warm family's dabs run. A place that is only mildly warm — an
  // ochre ground — hardly wants red in it, or a whole coast reads brick; but a
  // place the frame actually drew red, like the week's route, keeps its red, so
  // the damping is opened back up by how hard the place leans that way.
  float redK = smoothstep(0.45, 1.05, wR);
  float pRed = clamp(wR / max(1e-3, wW + wR) * mix(0.50, 1.15, redK), 0.0, 0.80);
  // The blue and the green of a palette often lean the same way, and a sea's own
  // colour sits between them, so the green's share of the cool dabs is damped:
  // an open sea wants a blue with its green in it, not a green with its blue in it.
  float pGreen = clamp(wG / max(1e-3, wC + wG) * 0.78, 0.0, 0.68);
  float warm = step(hB, lam);
  vec3 hue = warm > 0.5
    ? mix(uPointWarm, uPointRed, step(1.0 - pRed, hC))
    : mix(uPointCool, uPointGreen, step(1.0 - pGreen, hD));
  // this dab's own colour, gone down: scaled rather than greyed, so a deep blue
  // stays blue and a shadow keeps the hue of the thing that is in it.
  vec3 shade = hue * 0.55 + uPointDeep * 0.12;
  // Whether this dab is one of the complementaries a strongly-leaning place
  // keeps: those are laid as small bright notes rather than as full dabs, which
  // is what a complementary is for in a field — and what keeps a blue sea from
  // integrating to a grey one, since a pale accent weighs on the mix lightly.
  float minority = warm > 0.5 ? smoothstep(0.55, 0.80, 1.0 - lam) : smoothstep(0.55, 0.80, lam);

  // ---- how the dab is laid. A pale passage keeps its sheet: its notes are small
  // and one of its nodes in eight is left bare, which is what keeps a flat ground
  // from reading as a machine's screen. The silhouette is held by laying the last
  // dabs of a mass *solid* rather than dark — a pale limb stays pale, and a line
  // the frame drew along the edge stays its own colour.
  float load = clamp((1.30 * v + 0.05) * inkA, 0.0, 1.0);
  float r = dabR * mix(0.80, 1.12, load) * (0.88 + 0.24 * hA) * mix(1.0, 0.56, minority);
  float t = clamp((0.90 + 0.12 * load) * (0.96 + 0.08 * hB), 0.0, 1.0) * mix(1.0, 0.82, minority);
  float rim = (1.0 - sky) * someSky * (1.0 - 0.85 * allSky);
  t = mix(t, max(t, 0.90), rim * rimA);
  r *= 1.0 + 0.10 * rim;

  // ---- the value this one dab has to carry. The place's own light, less what
  // the sheet will still be showing between the dabs, is what a dab of this size
  // is asked for; its family's hue carries that as far as it can and the shade
  // carries the rest, so the shade fires only on the dabs that need it — which
  // is what keeps a mid-toned ground from turning to mud.
  float covGeo = 3.14159265 * r * r / (0.8660254 * pitch * pitch);
  float ink = clamp(covGeo * t, 0.02, 1.0);
  // The mapping from a reading to a pigment is convex — a dark reading is taken
  // further down its family's ladder than a light one is taken up, and the dab
  // that lands on one of the drawing's own dark lines lands hard — so a place is
  // asked for a little more light than it measured, which is what keeps the
  // sheet's overall value level with the frame's.
  float want = mix(pl - (pl - il) * v, pl, 0.10);
  float target = clamp((want - (1.0 - ink) * pl) / ink, 0.0, pl);
  float hueL = prLum(hue), shaL = prLum(shade);
  float dk = clamp((hueL - target) / max(0.03, hueL - shaL), 0.0, 1.0);
  // one dab in five is laid a rung or two lighter than its place asked for: the
  // ladder every pointillist ground is really made of.
  dk = clamp(dk * (1.0 + 0.16 * hE) - 0.42 * step(0.80, hF), 0.0, 1.0);
  // and an accent is never shaded as far down as the field it is an accent in.
  dk *= mix(1.0, 0.40, minority);
  vec3 pig = mix(hue, shade, dk);
  // A place lighter than its own hue takes the pigment thinned into the sheet
  // rather than a white laid on top of it.
  pig = mix(pig, uPaper, clamp((target - hueL) / max(0.03, pl - hueL), 0.0, 0.72) * (0.65 + 0.70 * hF));
  // A place darker than its own shade can reach — a basin, the ink — is taken
  // further down by deepening its *own* pigment rather than by stirring the
  // week's dark into it: a warm week's dark is brown, and a sea mixed into it
  // comes out grey. Only a cool dab goes this far, so the few warm accents a
  // shadow needs stay warm.
  float reach = (1.0 - ink) * pl + ink * shaL;
  float below = clamp((reach - want) / max(0.02, ink * shaL * 0.58), 0.0, 1.0);
  pig = mix(pig, pig * 0.42, below * 0.85 * (1.0 - warm));
  pig = mix(pig, shade, rim * 0.28 * rimA);
  // and where one dab of this size cannot hold the ink the place asks for, the
  // node is gone over a second time: the extra is the shortfall the model itself
  // reports, so it can never overfill a passage and flatten it.
  float pigL = prLum(pig);
  float need = clamp((pl - want) / max(0.03, pl - pigL), 0.0, 1.0);
  float extra = clamp((need - ink) / max(0.06, 0.55 * covGeo), 0.0, 1.0);

  vec2 rel = q - centre;
  vec2 across = vec2(-dir.y, dir.x);
  float s = length(vec2(dot(rel, dir) / elong, dot(rel, across)));
  float aa = 0.78 * pxh;
  float mask = 1.0 - smoothstep(r - aa, r + aa, s);
  mask *= step(hG, 1.0 - 0.13 * (1.0 - load) * (1.0 - load));
  vec3 colP = mix(uPaper, pig, mask * t);
  // The second note, set a little off the first, can only fill the paper the
  // first left inside its own node, so the two never fight and a mass closes
  // without ever becoming a blot.
  float second = extra * (1.0 - sky);
  if (second > 0.003){
    vec2 off = vec2(cos(hE * 6.2831853), sin(hE * 6.2831853)) * (0.48 * r);
    vec2 rel2 = rel - off;
    float s2 = length(vec2(dot(rel2, dir) / elong, dot(rel2, across)));
    float cov2 = (1.0 - smoothstep(r * 0.74 - aa, r * 0.74 + aa, s2)) * second * step(hF, 0.85);
    colP = mix(colP, pig, cov2 * 0.92);
  }

  // ---- the sky. A pointillist does not load a sky: the sheet is the sky, and
  // the fall of pale dabs on it is what says which way the light went — a warm
  // white and a cool white taking turns, sparse enough that the paper is doing
  // the work. Anything the frame had drawn out there is laid as it stands instead
  // of as a white, so a ring comes through the print as a dotted chain of itself.
  float vs = clamp(v * 2.0, 0.0, 1.0);
  // Whatever the frame loaded into the sky — the week's ring is a band of it, and
  // so is a heavy wash or the glaze of the air — is what the fall follows, read
  // against the paper rather than against the sky beside it, because a band wider
  // than the probes reads as flat sky from the inside and no local test can ever
  // see it. Where there is something to say the dabs carry its colour and the
  // fall thickens until the band reads as a dotted chain of itself.
  float heavy = clamp((v - 0.07) / 0.23, 0.0, 1.0);
  float mark = clamp(1.30 * heavy, 0.0, 0.92);
  float fall = skyA * (0.05 + 0.20 * vs + 1.30 * mark);
  float lamS = clamp(0.5 + (c.r - c.b) * 2.6 + 0.30 * (hH - 0.5), 0.15, 0.85);
  vec3 white = mix(uPaper, hE < lamS ? uPointWhiteW : uPointWhiteC, clamp(0.42 + 0.30 * vs, 0.0, 0.72));
  white = mix(white, c, clamp(1.35 * mark, 0.0, 0.95));
  float rs = dabR * (0.68 + 0.32 * vs) * (0.88 + 0.24 * hA);
  float covS = (1.0 - smoothstep(rs - aa, rs + aa, s)) * step(1.0 - fall, hG);
  vec3 col = mix(colP, mix(uPaper, white, covS), sky);

  // ---- and the sheet under all of it: its tooth reads through the bare paper
  // and is quietest where the pigment has settled into it.
  float tooth = prTooth(gl_FragCoord.xy);
  col *= 1.0 + (tooth - 0.5) * 0.048;
  col *= 1.0 + (prN2(q * 2.6 + 21.0) - 0.5) * 0.018;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`,
  uniforms(ctx = {}) {
    // A dial comes from params.js as `print.pointillist.dab` when it is there at
    // all, and from the bare name otherwise. Either way it is an offset from the
    // sheet this module ships, so an absent entry and a 0 both change nothing.
    const dial = (name, fallback) => {
      const p = ctx?.dials;
      const value = p?.[`print.pointillist.${name}`] ?? p?.[name];
      return typeof value === 'number' ? value : fallback;
    };
    // The pigments, taken from the week's own box rather than invented: the
    // ochre the sun lands on, its hot red, the blue the picture leans on, the
    // green of its shallows, and the palette's committed dark — which every dab
    // is shaded into, so nothing on this sheet is ever greyed with a colour the
    // week itself does not own. A palette that does not carry one of the names
    // falls back to its neighbour, so a world that repaints part of a week still
    // gets a box of colours.
    const pal = ctx?.palette || {};
    const pig = (...keys) => {
      for (const key of keys) {
        const value = pal[key];
        if (value && typeof value.clone === 'function') return value.clone();
      }
      return { x: 0.5, y: 0.5, z: 0.5 };
    };
    return {
      uPointWarm: { value: pig('litWarm', 'landLow', 'landMid') },        // the ochre the sun reaches
      uPointRed: { value: pig('vermilion', 'bare', 'landHigh') },         // its hot red, the accent
      uPointCool: { value: pig('cobalt', 'seaDeep', 'shadeCool') },       // the blue the picture leans on
      uPointGreen: { value: pig('teal', 'seaShallow', 'veg') },           // the green of the shallows
      uPointDeep: { value: pig('dark', 'ink') },                          // the pigment every shade is deepened with
      uPointWhiteW: { value: pig('skyLow', 'skyBand', 'foam') },          // the horizon's warm white
      uPointWhiteC: { value: pig('cloudUnder', 'skyHigh', 'farGlaze') },  // the zenith's cool white
      // The craft dials. Every length is a fraction of the sheet's height, so a
      // capture at any size draws the same print, only finer; the shader adds
      // each to the sheet it ships, so an unspread uniform changes nothing.
      uPointDab: { value: dial('dab', 0) },            // the dab's own size
      uPointPitch: { value: dial('pitch', 0) },        // the lattice's pitch
      uPointJit: { value: dial('jitter', 0) },         // how far a dab walks off its node
      uPointElong: { value: dial('elongate', 0) },     // how much the dabs follow the form
      uPointMix: { value: dial('mix', 0) },            // how far a place's hue splits its dabs
      uPointInk: { value: dial('ink', 0) },            // how much pigment the sheet holds
      uPointSky: { value: dial('sky', 0) },            // how heavy the sky's fall is
      uPointRim: { value: dial('rim', 0) },            // how the silhouette is drawn
    };
  },
};

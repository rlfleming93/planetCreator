/* Planet Creator — the Moebius print.
 *
 * Ligne claire is drawn first and filled afterwards. A closed line holds the
 * shape and the shape is a flat: one clean cel colour with a hard edge, never a
 * gradient, and the drawing's modelling is carried by how many flats a form
 * takes — three at the most — and not by how smoothly the paint ran. So the
 * print keeps the finished frame's families and throws its modelling away: every
 * pixel is measured against the week's own sea blue and its own land warmth
 * (with the paper-to-ink value taken out of both, exactly the separation a
 * printer makes and the one riso.js prints with), the larger of the two is the
 * family the pixel is painted in, and inside that family the pixel is pushed
 * onto one of three flats — the palette's own lit end, its mid-ground, its
 * committed dark — so the bands the frame is redrawn in are the week's colours
 * and not the print's. The two cuts between them are the dial.
 *
 * The flat a pixel takes is the middle of five readings — the pixel and four
 * points a line's half-weight away — and not the reading itself. A wash that has
 * gone grainy near a cut flips pixel to pixel, and a print is not a screen: the
 * middle of five cannot be won by one pixel of the frame's own noise or its own
 * dot, while a boundary two pixels wide is three votes and survives. Every
 * reading the flats, the line and the limb are taken from sits on a ring of
 * eight bearings and never on the four axes, because an edge running at
 * forty-five degrees slips between an axis cross — a pixel of it can sit with
 * every tap on its own side and be read as no edge at all — and a contour drawn
 * from those readings dries out into dashes wherever a coast, a terrace or a
 * mountain does not happen to run level. Eight bearings lie within an eighth of
 * a turn of every one, so a cut keeps one weight the whole way round a shape.
 * The line itself is drawn only where four things agree: a reading one weight
 * out disagrees with the smoothed pixel, the reading beyond it on that same
 * bearing says the same thing (so a fleck of grain cannot ring itself with ink),
 * the pixel's own flat runs wider than a patch rather than sitting as a fleck the
 * cut caught, and the frame itself actually stepped there — in colour or in the
 * flats' own tone, because a coast two grounds apart in hue is often nearly one
 * in value and a soft edge the other way about — rather than merely drifting. So
 * a cut carries one clean stroke the whole way round a shape, at one weight, and
 * the silhouette, read off the depth buffer, is cut heavier still, which is what
 * holds a sphere against a sky.
 *
 * Under the shade the sheet is ruled: one family of straight lines across the
 * deep tone and a second cut across the first, at fixed angles on the paper and
 * never on the form, which is how a colourist lays in a shadow and never a
 * texture. The lit flat is clean, water takes no ruling at all — the sea is a
 * colour, not a shadow — and the ruling is drawn coarse enough to read as strokes
 * and not as a screen.
 *
 * The sky is the print's own, and it is the one loud thing here: an airbrushed
 * dusk laid in three out of the week's own palette — the shade's violet at the
 * frame's edge, the week's vermilion across the middle as a rose, the light burnt
 * into ochre at the planet's horizon, because run straight from a violet to an
 * orange the middle goes grey. It is laid across the measure of the crop a poster
 * is cut to and not in globe radii, so a week whose planet fills the sheet gets
 * the same dusk as a week whose planet is a coin in the middle of it; the sun's
 * bearing across the eye decides which side of it burns, and with the sun behind
 * the painter the light comes round the whole limb and the dusk stands as a ring.
 * A few tiny stars stand in the violet (the week's seed deals them, never a
 * random), and the sunward limb carries one thin bright rim. The print paints the
 * sky only where the sky is: a body the painter stood over the sheet — a race's
 * ring — writes no depth and would read as space, so the frame's own colour is
 * asked whether it has the land's chroma in it, and only what has none is sky.
 *
 * Nothing here reads uTime — a frame is drawn, not animated — and every length
 * below is a fraction of the sheet's height, so a capture at twice the size
 * draws the same frame twice as fine. Eighteen texture taps carry the whole
 * print.
 */
const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// The palette entries the print reads beside the five the pass always hands
// over, and the neutral a build that has none of them falls back on.
const PALETTE = Object.freeze([
  ['uMoebLit', 'litWarm', 0xd6a462],
  ['uMoebVerm', 'vermilion', 0xc53e25],
  ['uMoebShade', 'shadeCool', 0x4b5584],
  ['uMoebDark', 'dark', 0x141c33],
  ['uMoebCrest', 'crest', 0xe3e6d6],
  ['uMoebSkyDeep', 'skyDeep', 0x5e7199],
  ['uMoebTeal', 'teal', 0x4b8690],
  ['uMoebLandLow', 'landLow', 0x86977a],
  ['uMoebLandHigh', 'landHigh', 0x7b7889],
]);

// Scratch, made once off the host's own three: a print is handed a context, not
// an import, so nothing here may be built at module load.
let S = null;
function scratch(THREE) {
  if (!S) S = { p: new THREE.Vector3(), size: new THREE.Vector2(), eye: new THREE.Vector3(), sun: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3() };
  return S;
}

export default {
  id: 'moebius',
  label: 'Moebius',
  fragment: /* glsl */ `
uniform sampler2D tDiffuse, tDepth;
uniform vec2 uResolution;
uniform vec3 uPaper, uInk, uSeaDeep, uSeaShallow, uLand;
uniform float uSeed;
// the week's own palette, read where the pass's five are not enough: the light
// the sky is burnt from, the vermilion it burns toward, the violet the shade and
// the top of the sky are made of, the teal the sea's middle flat is mixed from,
// the rock the shade is laid over, and the pale the lit ground is left as
uniform vec3 uMoebLit, uMoebVerm, uMoebShade, uMoebDark, uMoebCrest, uMoebSkyDeep, uMoebTeal, uMoebLandLow, uMoebLandHigh;
// the globe on the sheet — its centre in device pixels, the radius its sea level
// projects to, the sun's bearing across the eye, and how far the sun sits off
// the eye's own axis — which is what the sky's gradient, its stars and the rim
// are read from
uniform vec2 uMoebGlobe, uMoebSun;
uniform float uMoebR, uMoebSunSep;
// the craft dials, each an offset from the frame this module ships
uniform float uMoebLine, uMoebSil, uMoebLitCut, uMoebShadeCut;
uniform float uMoebHatch, uMoebRuling, uMoebRich, uMoebSky, uMoebStars, uMoebRim;
varying vec2 vUv;

const vec3 MB_W = vec3(0.32, 0.55, 0.13);

float mbH12(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float mbN2(vec2 x){
  vec2 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mbH12(i), mbH12(i + vec2(1.0, 0.0)), f.x);
  float b = mix(mbH12(i + vec2(0.0, 1.0)), mbH12(i + vec2(1.0, 1.0)), f.x);
  return mix(a, b, f.y);
}
// A colour pushed away from its own grey: the whole difference between a wash
// that has been reproduced and one that has only been drawn.
vec3 mbRich(vec3 c, float k){
  return clamp(mix(vec3(dot(c, MB_W)), c, k), 0.0, 1.0);
}
// A colour held to a strength of its own. A week's palette is laid for a wash,
// and a wash is greyer than a flat has any business being — so where a print
// wants a violet and the week's shade is a grey slate, the direction the week's
// colour leans is kept and its strength is set instead of merely multiplied: the
// sky of a grey week is a violet and not a grey one.
vec3 mbSet(vec3 c, float sat){
  float g = dot(c, MB_W);
  vec3 dir = c - vec3(g);
  float m = length(dir);
  return m > 1e-4 ? clamp(vec3(g) + dir * (sat * g / m), 0.0, 1.0) : c;
}
// A floor under a colour's strength: keeps whichever of the colour and its own
// held version leans further from grey, so a ramp that passes through the grey
// between two stops is picked up out of it without touching the vivid ends.
vec3 mbFloor(vec3 c, float sat){
  vec3 held = mbSet(c, sat);
  float g = dot(c, MB_W), h = dot(held, MB_W);
  return length(held - vec3(h)) > length(c - vec3(g)) ? held : c;
}
// Where the frame's sky stops. The sky is a dome that writes no depth, so the
// sheet's own cleared depth is the only thing that says a pixel is space.
float mbSky(vec2 uv){ return step(0.99998, texture2D(tDepth, uv).x); }
// The middle of five: the four readings around a pixel sorted between
// themselves, then the pixel's own clamped between the two middle ones. One
// pixel of noise cannot win it; a boundary two pixels wide is three votes.
float mbMed5(float a, float b, float c, float d, float e){
  float t;
  if (a > b) { t = a; a = b; b = t; }
  if (c > d) { t = c; c = d; d = t; }
  if (a > c) { t = a; a = c; c = t; }
  if (b > d) { t = b; b = d; d = t; }
  if (b > c) { t = b; b = c; c = t; }
  return clamp(e, b, c);
}
// Two readings agree when the cel's own number steps between them.
float mbStep(float a, float b){ return step(1.0, abs(a - b)); }

// ---- the separation. Every pixel is measured against the two axes the picture
// was painted on: what it owes to the sea's blue and what it owes to the land's
// warmth, with the paper-to-ink value taken out of both first. The score is
// the land's share less the sea's — its sign is the family, its size how
// committed the pixel is — and the tone is how far down that family's own
// scale it sits, from the lit end the palette keeps for it to its dark.
void mbFamily(vec3 c, out float score, out float tone){
  float pl = dot(uPaper, MB_W), il = dot(uInk, MB_W);
  vec3 e0 = uInk - uPaper;
  float e00 = max(1e-4, dot(e0, e0));
  vec3 dd = c - uPaper;
  vec3 chroma = dd - e0 * clamp(dot(dd, e0) / e00, 0.0, 1.20);
  vec3 e1 = mix(uSeaDeep, uSeaShallow, 0.62) - uPaper; e1 -= e0 * (dot(e1, e0) / e00);
  vec3 e2 = uLand - uPaper; e2 -= e0 * (dot(e2, e0) / e00);
  float sea = clamp(dot(chroma, e1) / max(0.03, dot(e1, e1)), 0.0, 1.25);
  float land = clamp(dot(chroma, e2) / max(0.03, dot(e2, e2)), 0.0, 1.25);
  score = land - sea;
  float fam = step(0.0, score);
  vec3 lite = mix(mix(uPaper, uSeaShallow, 0.58), mix(uPaper, uMoebCrest, 0.72), fam);
  vec3 dark = mix(mix(uSeaDeep, uInk, 0.30), mix(uMoebShade, uInk, 0.42), fam);
  vec3 axis = dark - lite;
  tone = clamp(dot(c - lite, axis) / max(1e-4, dot(axis, axis)), 0.0, 1.0);
}
// One reading of the finished frame, classified where it is.
void mbMark(vec2 uv, out float score, out float tone, out vec3 col){
  col = texture2D(tDiffuse, uv).rgb;
  mbFamily(col, score, tone);
}
// The cel's own number: which family a pixel is painted in and which of that
// family's three flats it takes. Whole numbers, so two pixels of the same flat
// are the same number and every boundary is a step between them.
float mbCodeAt(float tone, float score, float cutLit, float cutShade){
  return step(0.0, score) * 4.0 + (tone < cutLit ? 2.0 : (tone < cutShade ? 1.0 : 0.0));
}

// One family of ruled lines: straight, and ruled at a fixed angle on the paper,
// its pitch a fraction of the sheet's height.
float mbRule(vec2 q, float ang, float pitch, float duty){
  vec2 d = vec2(cos(ang), sin(ang));
  float f = fract(dot(q, d) / pitch);
  float e = 0.6 / (pitch * uResolution.y);
  return smoothstep(-e, e, f) * (1.0 - smoothstep(duty - e, duty + e, f));
}

// The few stars a Moebius sky carries: one thin cell of them at a time, drawn
// only where the violet has taken the sky, sized in device pixels so they stay
// pinpricks at any size. The week's own seed deals them, so a week's sky is the
// same sky every time the frame is pulled.
float mbStars(vec2 q, float seed){
  float cell = 0.030;
  vec2 g = q / cell + vec2(seed * 43.0, seed * 17.0);
  vec2 id = floor(g), f = fract(g) - 0.5;
  float on = step(0.955, mbH12(id + 4.7));
  vec2 off = (vec2(mbH12(id + 13.1), mbH12(id + 27.9)) - 0.5) * 0.84;
  float rad = (0.55 + 0.55 * mbH12(id + 91.3)) / max(2.0, uResolution.y);
  float d = length((f - off) * cell);
  return on * (1.0 - smoothstep(rad, rad * 1.8, d)) * (0.50 + 0.50 * mbH12(id + 7.7));
}

void main(){
  vec2 q = gl_FragCoord.xy / max(2.0, uResolution.y);          // the sheet, in its own heights
  vec2 sheetPx = (1.0 / uResolution) * uResolution.y;          // one sheet fraction, in uv
  float seed = fract(uSeed * 0.6180339887);

  // The dials, each an offset from the frame this module ships, so a pass that
  // never spread uniforms() above still draws a whole frame.
  float lineW = clamp(0.0022 + uMoebLine, 0.0006, 0.0040);            // half the contour's weight
  float silW = clamp(lineW + 0.0011 + uMoebSil, lineW, 0.0075);       // and half the silhouette's
  float cutLit = clamp(0.36 + uMoebLitCut, 0.10, 0.64);               // where the lit flat ends
  float cutShade = clamp(0.70 + uMoebShadeCut, cutLit + 0.06, 0.95);  // where the shade begins
  float pitch = clamp(0.0125 + uMoebHatch, 0.0055, 0.0240);           // the ruling's pitch
  float ruling = clamp(0.80 + uMoebRuling, 0.0, 1.0);                 // how heavily the shade is ruled
  float rich = clamp(1.26 + uMoebRich, 0.85, 1.85);                   // how far a flat is pushed off its grey
  float skyK = clamp(0.86 + uMoebSky, 0.25, 2.0);
  float starK = clamp(1.0 + uMoebStars, 0.0, 2.5);
  float rimK = clamp(1.0 + uMoebRim, 0.0, 2.0);
  // A globe is on the sheet when its disc is registered on the frame and its
  // radius is one a sphere could stand at: on foot the camera is inside the very
  // sphere this maths projects, and the sky is read from the sheet instead.
  float hasGlobe = step(2.0, uMoebR) * step(uMoebR, uResolution.y * 0.85);

  // ---- the readings. The pixel and the ring of eight at a line's own
  // half-weight — four of them, on the axes, are the votes the flats are taken
  // as the middle of, and all eight are the boundary's own reading — then the
  // same ring again at four and a half weights, which is what the line is
  // confirmed against, each far tap out along the bearing of its own near one.
  vec2 linUv = lineW * sheetPx, farUv = 4.6 * lineW * sheetPx;
  vec3 cC; float sC, tC; mbMark(vUv, sC, tC, cC);
  float sN[8], tN[8]; vec3 cN[8];
  float sF[8], tF[8]; vec3 cF[8];
  for (int a = 0; a < 8; a++) {
    float th = float(a) * 0.7853981634;
    vec2 dir = vec2(cos(th), sin(th));
    mbMark(vUv + dir * linUv, sN[a], tN[a], cN[a]);
    mbMark(vUv + dir * farUv, sF[a], tF[a], cF[a]);
  }
  float score0 = mbMed5(sN[0], sN[4], sN[2], sN[6], sC);
  float tone0 = mbMed5(tN[0], tN[4], tN[2], tN[6], tC);

  // ---- what is sky. The depth buffer says the sheet is space there; the
  // frame's own colour has to agree, because a ring writes no depth and the
  // print is not the thing that should erase a week's own monument. The wash a
  // sky is laid with carries nearly no chroma once the paper-to-ink value is
  // taken out of it, whatever hue it is; anything with the land's own chroma in
  // it is a body standing over the sheet and is drawn as one.
  float space = mbSky(vUv);
  float sky0 = space * (1.0 - step(0.55, score0));

  // ---- the flats. Three per family, out of the week's own colours: the sea's
  // deepest water is its dark with the ink in it, its middle is the week's teal,
  // its light is the shallow lifted to the paper; the land's dark is its rock
  // taken down into the ink — dark enough to read as a shadow and not as a hole
  // cut through to the sky — its middle is the week's own mid-ground, its light
  // is the pale its driest ground is left as. The two cuts between them are
  // antialiased over one pixel of the tone's own gradient; the line is drawn
  // over every boundary anyway, so the flat itself may be hard.
  float aa = clamp(1.6 * fwidth(tone0), 0.006, 0.060);
  float seam = clamp(1.6 * fwidth(score0), 0.02, 0.50);
  float t1 = smoothstep(cutLit - aa, cutLit + aa, tone0);
  float t2 = smoothstep(cutShade - aa, cutShade + aa, tone0);
  float famF = smoothstep(-seam, seam, score0);
  vec3 sea0 = mix(uSeaDeep, uInk, 0.30), sea1 = mix(uSeaDeep, uMoebTeal, 0.62), sea2 = mix(uMoebTeal, uPaper, 0.46);
  vec3 lan0 = mix(mix(uMoebLandHigh, uMoebShade, 0.40), uInk, 0.34), lan1 = mix(uLand, uMoebLit, 0.16), lan2 = mix(uMoebCrest, uMoebLandLow, 0.34);
  vec3 sea = mix(mix(sea2, sea1, t1), sea0, t2);
  vec3 lan = mix(mix(lan2, lan1, t1), lan0, t2);
  vec3 cel = mbRich(mix(sea, lan, famF), rich);

  // ---- the ruled shade. The deep tone takes the two families crossed and the
  // middle of the shade takes one — but only where it has all but gone over, so
  // the largest warm mass in the frame is never turned into texture by a ruling
  // it did not ask for. Water takes none at all: a colourist rules the shade,
  // and the sea is not a shadow, it is a colour.
  float ruleA = mbRule(q, -0.30, pitch, 0.30);
  float ruleB = mbRule(q, 1.06, pitch * 1.06, 0.28);
  float deep = t2;
  float mid = t1 * (1.0 - t2) * smoothstep(min(cutLit + 0.14, cutShade - 0.02), cutShade, tone0);
  float cover = max(deep * max(ruleA, ruleB), mid * ruleA * 0.75) * ruling * mix(0.0, 1.0, famF);
  cel = mix(cel, mix(uInk, uMoebShade, 0.28), clamp(cover, 0.0, 1.0) * 0.82);

  // ---- the line. A boundary is drawn where a reading one weight out has a
  // different number from the smoothed pixel, and the reading beyond it, out
  // along the same bearing, says the same thing. One pixel of the frame's own
  // noise can flip a reading, but it cannot flip the reading beyond it as well; a
  // flat two pixels wide holds its line at both rims; and the band drawn is as
  // wide as the reading, which is what gives one weight the whole way round a
  // shape. Both rings — the near one at a line's own half-weight, the far one at
  // four and a half — are taken on eight bearings and not on the four axes: a
  // boundary running at forty-five degrees slips between an axis cross (a pixel
  // of it can sit with all four near taps on its own side, and then no line is
  // drawn there at all), which is what made this print's contours crumble into
  // dashes wherever a coast or a terrace did not happen to run level. Eight taps
  // lie within an eighth of a turn of every bearing, so a boundary is caught at
  // the same weight whichever way it runs, and each far tap is paired with the
  // near one on its own bearing, which is the reading the test was always about.
  float codeC = mbCodeAt(tone0, score0, cutLit, cutShade);
  float edge = 0.0, support = 0.0, dSpread = 0.0, dTone = 0.0;
  for (int a = 0; a < 8; a++) {
    float kN = mbCodeAt(tN[a], sN[a], cutLit, cutShade), kF = mbCodeAt(tF[a], sF[a], cutLit, cutShade);
    edge = max(edge, mbStep(kN, codeC) * mbStep(kF, codeC));
    dSpread = max(dSpread, length(cN[a] - cC));
    dTone = max(dTone, abs(tN[a] - tC));
    // And the flat the pixel itself is in has to be wider than a patch: a reading
    // beyond it, on some bearing, has to be painted in the same number as the
    // pixel. A fleck of the frame's own grain that the cut caught is only a few
    // pixels across, has no such reading, and keeps no ring of ink around it —
    // which is the difference between a print and a stipple.
    support = max(support, 1.0 - mbStep(kF, codeC));
  }
  // And the frame itself has to have an edge there. A draughtsman draws where the
  // form turns; a place where the wash is grainy and the paint drifts across a
  // cut has no edge to draw, and a line laid on it rings the grain and dries into
  // spatter. So the readings also say how far the colour actually stepped between
  // the pixel and its neighbours — a measured distance in the frame's own colours
  // rather than in the tone, because a wash's grain moves the tone as far as a
  // weak edge does — and where the frame only drifts the print draws no line at
  // all, while an ink line, a coast and a wash's own edge all keep theirs. The
  // step the smoothed flats took is read beside the colour, and the two are taken
  // best-first: a coast is often two grounds apart in hue and close in value, and
  // a wash's own edge the other way about. A gate that wanted both broke the line
  // on every quiet coast, which is half of what a crumbled contour is.
  edge *= support * smoothstep(0.085, 0.240, max(dSpread, dTone * 1.6));

  // ---- the silhouette, and the rim laid inside it. The depth buffer says which
  // side of the limb a tap is on: the silhouette's band straddles it, at a
  // heavier weight than any line the cel's own steps are cut with, and the same
  // reading at a wider tap says which pixels are the shoulder of the limb, which
  // is where the rim is laid — brightest at the limb and fading inward, so it
  // reads as light on the edge and not as a stripe.
  vec2 silUv = silW * sheetPx, rimUv = silW * 2.2 * sheetPx;
  // The taps are taken on a ring of eight and not on the four axes. A limb that
  // runs at forty-five degrees slips between an axis cross: one pixel of a
  // diagonal edge can sit there with all four taps on its own side and be read as
  // no edge at all, so the stroke the print draws dries out into a chain of
  // flecks wherever the silhouette is neither vertical nor horizontal — which is
  // everywhere a mountain is. Eight taps lie within an eighth of a turn of every
  // bearing, so the stroke comes off at one weight all the way round and the band
  // it draws is the same width whichever way the edge turns. The same ring,
  // wider, says which pixels are the shoulder of the limb.
  float sil = 0.0, inner = 0.0;
  for (int a = 0; a < 8; a++) {
    float th = float(a) * 0.7853981634;
    vec2 dir = vec2(cos(th), sin(th));
    sil = max(sil, abs(mbSky(vUv + dir * silUv) - space));
    inner = max(inner, mbSky(vUv + dir * rimUv));
  }
  vec2 toLimb = gl_FragCoord.xy - uMoebGlobe;
  float limb = length(toLimb);
  float face = dot(toLimb / max(limb, 1e-3), uMoebSun);
  float sunGate = mix(1.0, smoothstep(-0.05, 0.75, face), uMoebSunSep);
  // Brightest on the limb itself and falling inward, so the rim is a glint on the
  // edge and not a stripe laid a few pixels inside it.
  float shoulder = clamp(1.0 - (uMoebR - limb) / max(1.0, rimUv.y * uResolution.y), 0.0, 1.0);
  // A limb lit down the eye carries its light all the way round, and a ring at
  // full strength round a whole planet reads as a second contour: the ring is
  // held back to a glint's whisper and only the sunward arc is drawn at strength.
  float rim = (1.0 - sky0) * inner * sunGate * shoulder * hasGlobe * mix(0.55, 1.0, uMoebSunSep);

  // ---- the sky: the print's own, and the one loud thing here. An airbrushed
  // dusk — the week's light burnt into its vermilion around the planet's
  // horizon, the shade's violet taking the rest, the sun's own bearing across
  // the eye deciding which side of it burns — flat and smooth, with a dither
  // fine enough to keep a flat gradient flat in eight bits. A few tiny stars
  // stand where the violet has taken it.
  //
  // The gradient hangs on the globe where there is one: a halo at its horizon,
  // hottest on the sun's side. With the sun behind the painter there is no side
  // to burn, and the light comes round the whole limb — which is what a limb lit
  // down the eye does — so the halo stands as a ring. From the ground there is
  // no globe to hang it on at all, and the sheet's own foot is the horizon.
  float vert = gl_FragCoord.y / max(2.0, uResolution.y);
  vec2 relGlobe = (gl_FragCoord.xy - uMoebGlobe) / max(1.0, uMoebR);
  vec2 relGround = vec2((gl_FragCoord.x / max(2.0, uResolution.x) - 0.5) * 1.15, (vert - 0.06) * 1.75);
  vec2 rel = mix(relGround, relGlobe, hasGlobe);
  float rad = length(rel);
  // How much sky the print has to lay its dusk across: from the limb to the
  // corner of the crop a poster keeps, which is four fifths of the sheet — the
  // frame a week is actually looked at in. The dusk is laid in that measure and
  // not in globe radii: a week whose planet fills the sheet gets the same dusk,
  // hot at the limb and violet at the frame's edge with the rose between, as a
  // week whose planet is a coin in the middle of it. Laid in radii, a big planet
  // pushes its own edge into the hot end of the falloff and the whole sky comes
  // out one clipped orange. The floor is what a planet so large that its crop
  // corner is barely a radius of sky gets: the dusk is squeezed into the room
  // there is rather than its violet being pushed off the paper.
  float corner = clamp(length(vec2(uResolution.x, uResolution.y)) * 0.40 / max(1.0, uMoebR), 1.15, 3.6);
  float rn = clamp((rad - 1.0) / max(0.55, corner - 1.0), 0.0, 1.5);
  float along = mix(clamp((0.55 - vert) * 2.4, -1.0, 1.0), dot(relGlobe / max(length(relGlobe), 1e-3), uMoebSun), hasGlobe);
  float side = mix(clamp(0.5 + 0.70 * along, 0.0, 1.0), 0.92, 0.55 * (1.0 - uMoebSunSep));
  // A dusk is hot only where the light is: the halo is a band hugging the limb
  // rather than a glow filling the sky, because the planet is the picture and the
  // sky is its ground — a corona laid all round the world turns a week of quiet
  // drawing into a lamp, and the loudest thing on the sheet must be the week and
  // not the dusk the print poured behind it.
  float halo = pow(1.0 - smoothstep(0.0, 0.44, rn), 2.1) * hasGlobe;
  float reach = mix(1.0 - smoothstep(0.15, 1.80, rad), 1.0 - smoothstep(-0.04, 0.98, rn), hasGlobe);
  // Two lights on one sky make a brighter place and not a plateau, so the terms
  // are folded over one another rather than added, and neither is allowed to sit
  // at its ceiling: a glow that has nowhere left to climb is a doughnut. The one
  // that hangs on the globe also falls away with the sky, so the frame's own edge
  // is the violet's and not a warm floor under it.
  float aW = 0.66 * halo * (0.18 + 0.82 * side);
  float bW = 0.34 * side * (0.30 * hasGlobe * (1.0 - smoothstep(0.55, 1.35, rn)) + 0.70 * reach);
  // The dusk is the ground and the week is the picture, so its warmth ships a
  // shade under full: a rich week still reaches its rose and its burnt horizon,
  // but no week's perimeter is allowed to out-shout the drawing it surrounds —
  // the loud thing on the sheet is the week, and the orange is only the light it
  // is seen by. The violet is untouched by the cut, so the corners stay the
  // dusk's own and the frame does not go grey.
  float warm = clamp(skyK * (1.0 - (1.0 - aW) * (1.0 - bW)), 0.0, 0.88);
  warm = clamp(warm + (mbN2(rel * 1.7 + 3.1) - 0.5) * 0.02, 0.0, 1.0);
  // The dusk is laid in three and not in two: the shade's violet at the frame's
  // edge, the week's own vermilion across the middle as a rose, and its light
  // burnt into ochre at the planet's horizon. Run straight from a violet to an
  // orange the middle goes grey, and a grey middle is the one thing a Moebius sky
  // never has.
  // The week's own shade decides how grey its violet is, and a slate week laid as
  // a wash is both paler and bluer than a coast week's, so a sky poured straight
  // out of it comes out periwinkle one week and violet the next. The violet is
  // therefore held to a hue, a strength and a value of its own — the week still
  // chooses which violet it is, out of the colour it brought — and the ramp
  // between the three stops is given a floor of saturation, because the line
  // between a violet and an orange passes through the grey between them and a
  // Moebius dusk has no grey in it. At the ink itself the warm band lightens into
  // a pale cream, which is where a sprayed horizon gives out.
  vec3 cool = mbSet(mbRich(mix(mix(uMoebShade, uMoebVerm, 0.17), uMoebSkyDeep, 0.16), 2.30), 0.80);
  cool = clamp(mix(cool, cool * (0.44 / max(0.05, dot(cool, MB_W))), 0.65), 0.0, 1.0);
  vec3 deepCool = mix(cool, uMoebDark, 0.30);
  vec3 rose = mbSet(mbRich(mix(uMoebVerm, uMoebLit, 0.30), 1.70), 1.00);
  vec3 warmC = mbSet(mbRich(mix(uMoebLit, uMoebVerm, 0.28), 1.38), 0.90);
  vec3 skyCol = warm < 0.5 ? mix(cool, rose, warm * 2.0) : mix(rose, warmC, (warm - 0.5) * 2.0);
  skyCol = mbFloor(skyCol, 0.62);
  skyCol = mix(skyCol, mbSet(mix(uPaper, uMoebLit, 0.42), 0.34), smoothstep(0.86, 0.94, warm) * 0.85);
  skyCol = mix(skyCol, deepCool, clamp((1.0 - warm) * smoothstep(0.55, 1.30, rn), 0.0, 1.0) * 0.75);
  skyCol += (mbH12(gl_FragCoord.xy + seed) - 0.5) * 0.010;
  // The stars are gated on how dark the sky is *against its own violet*, not
  // against a fixed number: a week whose violet is laid lighter carries the same
  // sky of stars as one laid deeper.
  float lit = dot(skyCol, MB_W) / max(0.05, dot(cool, MB_W));
  float starGate = (1.0 - smoothstep(0.94, 1.14, lit)) * (1.0 - smoothstep(0.22, 0.60, warm));
  skyCol += mbStars(q, seed) * starK * starGate * mix(uPaper, uMoebLit, 0.25);

  // ---- the sheet. The flats and the sky, then the rim on the limb, then the
  // drawing over everything: the cel's own boundaries in the week's ink taken
  // most of the way to black, and the silhouette heavier still.
  vec3 lineCol = mix(uInk, vec3(0.02, 0.02, 0.03), 0.35);
  vec3 rimCol = mix(mix(uPaper, vec3(1.0), 0.45), uMoebLit, 0.22);
  vec3 col = mix(cel, skyCol, sky0);
  col = mix(col, rimCol, clamp(rim * rimK, 0.0, 1.0));
  // The cel's own lines stop where the limb's own shoulder begins: two lines
  // running side by side round a rim read as piping, and a comic closes them into
  // one. The shoulder is the same reading the rim is laid on, so the width the
  // rim occupies is the width kept clear of the cel's lines.
  float closed = max(clamp(sil, 0.0, 1.0), inner);
  col = mix(col, lineCol, clamp(edge, 0.0, 1.0) * (1.0 - sky0) * (1.0 - clamp(closed, 0.0, 1.0)) * 0.92);
  col = mix(col, lineCol, clamp(sil, 0.0, 1.0) * 0.95);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`,
  uniforms(ctx = {}) {
    // A dial comes from params.js as `print.moebius.line` when it is there at
    // all, and from the bare name otherwise. Either way it is an offset from the
    // frame this module ships, so an absent entry and a 0 both change nothing.
    const dial = (name, fallback) => {
      const p = ctx?.dials;
      const value = p?.[`print.moebius.${name}`] ?? p?.[name];
      return typeof value === 'number' ? value : fallback;
    };
    const THREE = ctx?.THREE;
    const palette = ctx?.palette || {};
    const colour = (name, fallback) => {
      const value = new THREE.Color();
      const source = palette[name];
      if (typeof source?.clone === 'function') value.copy(source);
      else if (typeof source === 'number') value.setHex(source);
      else value.setHex(fallback);
      return value;
    };
    const uniforms = {
      // The craft dials. Every length is a fraction of the sheet's height, so a
      // capture at any size draws the same frame, only finer; the shader adds
      // each to the frame it ships, so an unspread uniform changes nothing.
      uMoebLine: { value: dial('line', 0.0) },            // half the contour's weight
      uMoebSil: { value: dial('silhouette', 0.0) },       // what the silhouette is cut heavier by
      uMoebLitCut: { value: dial('lit', 0.0) },           // where a family's lit flat ends
      uMoebShadeCut: { value: dial('shade', 0.0) },       // where its shade begins
      uMoebHatch: { value: dial('hatch', 0.0) },          // the ruling's pitch
      uMoebRuling: { value: dial('ruling', 0.0) },        // how heavily the shade is ruled
      uMoebRich: { value: dial('rich', 0.0) },            // how far a flat is pushed off its grey
      uMoebSky: { value: dial('sky', 0.0) },              // how far the dusk's warmth reaches
      uMoebStars: { value: dial('stars', 0.0) },          // how bright the few stars are
      uMoebRim: { value: dial('rim', 0.0) },              // how bright the rim is
      // Where the globe is, and where the sun is: update() fills these every
      // frame. The zeros are what a print that is never updated gets — a sky
      // read from the sheet itself rather than a halo at the eye's own corner.
      uMoebGlobe: { value: new THREE.Vector2(0.0, 0.0) },
      uMoebSun: { value: new THREE.Vector2(0.0, 1.0) },
      uMoebR: { value: 0.0 },
      uMoebSunSep: { value: 1.0 },
    };
    // The week's own palette beside the five the pass hands over. These are
    // copies: update() re-reads the palette into them every frame, so the week's
    // colours are the ones the frame is actually drawn in.
    for (const [name, key, fallback] of PALETTE) uniforms[name] = { value: colour(key, fallback) };
    return uniforms;
  },
  update(ctx = {}, uniforms = {}) {
    const { THREE, camera } = ctx;
    if (!THREE || !camera || !uniforms.uMoebGlobe) return;
    const s = scratch(THREE);
    // The pass's own drawing buffer, read live: the context's `resolution` is
    // the buffer as it stood when the pass was built, and the app resizes it
    // while it settles, so a print that maps its own globe with it lands the
    // disc on a sheet that is no longer there.
    const renderer = ctx.renderer;
    if (renderer && typeof renderer.getDrawingBufferSize === 'function') renderer.getDrawingBufferSize(s.size);
    else s.size.set(ctx.resolution?.x || 0, ctx.resolution?.y || 0);
    const size = s.size;
    if (!(size.x > 1) || !(size.y > 1)) return;
    // The globe's centre on the sheet, in the same device-pixel frame the pass
    // draws in (bottom-left origin, as gl_FragCoord), and the radius the sphere
    // of sea level projects to: f·ρ/√(d²−ρ²), which is the circle the sky's
    // halo and the rim's falloff are read from.
    s.p.set(0, 0, 0).project(camera);
    uniforms.uMoebGlobe.value.set((s.p.x * 0.5 + 0.5) * size.x, (s.p.y * 0.5 + 0.5) * size.y);
    const rho = (ctx.radius || 120) + (ctx.seaLevel || 0);
    const d = camera.position.length();
    const f = (size.y * 0.5) / Math.tan((camera.fov * Math.PI) / 360);
    uniforms.uMoebR.value = d > rho * 1.02 ? (f * rho) / Math.sqrt(Math.max(1e-3, d * d - rho * rho)) : 0;
    // The sun's bearing across the eye, read in the camera's own right and up:
    // the sky is hottest on that side and the rim is only where the limb faces
    // it. With the sun behind the painter the bearing has nowhere to point and
    // the rim stands as a ring the whole way round, which is what a limb lit
    // down the eye does.
    const light = ctx.light?.value || ctx.uniforms?.uSunDir?.value;
    if (light) {
      s.eye.copy(camera.position).normalize();
      s.sun.copy(light).addScaledVector(s.eye, -light.dot(s.eye));
      const sep = s.sun.length();
      s.right.setFromMatrixColumn(camera.matrixWorld, 0);
      s.up.setFromMatrixColumn(camera.matrixWorld, 1);
      if (sep > 1e-4) {
        const x = s.sun.dot(s.right) / sep;
        const y = s.sun.dot(s.up) / sep;
        const n = Math.hypot(x, y) || 1;
        uniforms.uMoebSun.value.set(x / n, y / n);
      } else uniforms.uMoebSun.value.set(0.0, 1.0);
      uniforms.uMoebSunSep.value = sstep(0.30, 0.74, sep);
    }
    // The week's own palette, re-read every frame: the pass hands the print five
    // colours, and the rest of the frame's colours are the week's to set.
    const palette = ctx.palette;
    if (palette) {
      for (const [name, key] of PALETTE) {
        const target = uniforms[name], source = palette[key];
        if (!target) continue;
        if (typeof source?.clone === 'function') target.value.copy(source);
        else if (typeof source === 'number') target.value.setHex(source);
      }
    }
  },
};

/* Planet Creator — the mosaic print.
 *
 * A mosaic is not painted. It is cut. The week's picture is passed to the
 * glassmaker as a cartoon, and what comes back is a panel of flat pieces held in
 * lead: every piece one colour and one colour only, that colour read off the
 * cartoon at the piece's own heart, and the drawing's whole modelling carried by
 * how the pieces beside each other were chosen. There is no gradation anywhere in
 * this frame and no brush mark — there are panes, and there is the came between
 * them — and a piece is not read at any value the cartoon happens to hold: the
 * rack holds so many tints and no more, so each piece is snapped to the nearest of
 * nine, and it is that step between neighbouring pieces that makes a panel read as
 * cut glass rather than as a photograph of one.
 *
 * The cut is the glassmaker's and not a machine's. The planet is cut on a honeycomb
 * of jittered sites, which is the one figure that leaves no sliver: every piece is
 * a whole piece, and its colour is the cartoon read at the site itself. A cell
 * whose own heart is busy — the coast, the ranges, the ground the hand worked over
 * — is cut again into four small panes, and a cell whose heart is quiet stays one
 * large piece of glass. That is where the density comes from: the small pieces
 * gather where the picture has detail and the big ones lie over the flat sea and
 * the calm ground. The busyness asked of a cell is a question about colour as much
 * as about tone, because the one step a panel has to catch is a coastline, and a
 * coast is often two grounds of the same lightness and two different hues.
 *
 * The sky is cut in courses, the way a window's sky is: rows of larger pieces
 * carried across the sheet, each piece's width and each course's height the hand's.
 * The sky's glass is cobalt — the deep blue a paper sky becomes when it is glass —
 * in four steps of its own, and never so deep that a piece would read as a hole in
 * the panel; and where the cartoon under a piece's heart runs warm — the week's
 * race stroke, the load of its horizon — the piece is struck in amber instead,
 * which is what a glassmaker does with a warm passage in a blue sky. A piece of the
 * planet's glass whose own heart fell past the limb takes the colour of the passage
 * it lies on rather than of one pixel, so no inch of the drawing is ever let into
 * the disc as raw, un-glassed ink.
 *
 * And the cartoon's own line is painted on the glass. Thin ink cannot hold a pane of
 * its own — a ring carried across the sky is thinner than any piece a panel would be
 * cut into, and a contour on the ground is thinner than any tesserae — so it is
 * carried *on* the pieces, the way a window paints the detail it cannot lead, and
 * the week's own ring still crosses the panel.
 *
 * The came is dark, one width on the sheet and uneven along its own length, and it
 * is the sheet and never the picture that measures it: turning the camera slides
 * the cartoon under stationary glass, which is what a window does. Every piece is
 * lit from its own middle — brighter at the heart where a panel is backlit, heavier
 * where the glass thickens into the came — and that light is only let into a piece
 * with room to take it, since the palest glass is already near the sheet's own
 * white. Nothing here reads uTime, because glass does not move, and nothing is a
 * Math.random: the week's uSeed lays out its own cut. Every length below is a
 * fraction of the sheet's height, so a capture at twice the size is the same panel
 * twice as fine; twenty-four texture taps carry the whole window.
 */
/** Scratch vectors, made once: a frame in the panel must not allocate. */
const scratch = {};

export default {
  id: 'mosaic',
  label: 'Mosaic',
  fragment: /* glsl */ `
uniform sampler2D tDiffuse, tDepth;
uniform vec2 uResolution;
uniform vec3 uPaper, uInk, uSeaDeep, uGlassSky, uGlassAmber, uGlassWarm, uGlassDark;
uniform vec2 uGlobe, uSunSheet;      // the disc's heart on the sheet, and the sun's bearing across it
uniform float uGlobeR;               // the disc's radius, in sheet fractions
uniform float uSeed;
uniform float uMosPane, uMosLead, uMosSplit, uMosGlow, uMosSky, uMosAmber, uMosGlass, uMosForm, uMosSat;
varying vec2 vUv;

const vec3 W = vec3(0.32, 0.55, 0.13);

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
// The planet's cut: a honeycomb of sites, each nudged off its lattice point by
// the week's own hand, which is the one figure that leaves every piece a whole
// piece (a square lattice leaves slivers where three cells crowd, and a sliver
// cannot hold a colour). What comes back is the pane this point is in, the pane
// across the came from it, and the cell's own index — the index is what the
// glassmaker's second cut is addressed by.
void prCellNear(vec2 q, float S, float jit, float ph, out float f1, out float f2, out vec2 p1, out vec2 p2, out vec2 id){
  float rowH = S * 0.8660254;
  float j0 = floor(q.y / rowH);
  float i0 = floor(q.x / S);
  f1 = 1.0e6; f2 = 1.0e6; p1 = vec2(0.0); p2 = vec2(0.0); id = vec2(0.0);
  for (int dj = -1; dj <= 1; dj++){
    float j = j0 + float(dj);
    float oy = mod(j, 2.0);
    for (int di = -1; di <= 1; di++){
      float i = i0 + float(di);
      vec2 cid = vec2(i, j);
      vec2 p = vec2((i + 0.5 * oy) * S, j * rowH)
             + (vec2(prH12(cid + ph + 11.3), prH12(cid + ph + 71.7)) - 0.5) * (jit * S);
      float d = length(p - q);
      if (d < f1){ f2 = f1; p2 = p1; f1 = d; p1 = p; id = cid; }
      else if (d < f2){ f2 = d; p2 = p; }
    }
  }
}
// The second cut: a cell whose heart is busy is cut again into k pieces a side,
// each set down by the hand a little off its place in the cluster. A piece that
// was never cut is put far away rather than left out, which costs nothing and
// keeps the search one loop wide.
void prCutNear(vec2 q, vec2 id, float S, float k, float jit, float ph, out float f1, out float f2, out vec2 p1, out vec2 p2){
  float rowH = S * 0.8660254;
  float oy = mod(id.y, 2.0);
  vec2 c = vec2((id.x + 0.5 * oy) * S, id.y * rowH);
  f1 = 1.0e6; f2 = 1.0e6; p1 = vec2(0.0); p2 = vec2(0.0);
  for (int b = 0; b < 3; b++){
    for (int a = 0; a < 3; a++){
      vec2 slot = vec2(float(a), float(b));
      float cuth = step(float(a) + 0.5, k) * step(float(b) + 0.5, k);
      vec2 jd = vec2(prH12(id + slot * 7.1 + ph + 3.3), prH12(id + slot * 5.7 + ph + 91.0));
      vec2 p = c + (slot + 0.5 - 0.5 * k) * vec2(S, rowH) / k + (jd - 0.5) * (jit * S / k);
      p = mix(vec2(1.0e5), p, cuth);
      float d = length(p - q);
      if (d < f1){ f2 = f1; p2 = p1; f1 = d; p1 = p; }
      else if (d < f2){ f2 = d; p2 = p; }
    }
  }
}
// The sky's cut: courses. Rows of panes carried across the sheet at the hand's
// own heights, and within a course pieces of the hand's own widths — the way a
// window's sky was always cut, because a sky is wide and a course is long.
void prCourseNear(vec2 q, vec2 S, float jit, float ph, out float f1, out float f2, out vec2 p1, out vec2 p2){
  float j0 = floor(q.y / S.y);
  float i0 = floor(q.x / S.x);
  f1 = 1.0e6; f2 = 1.0e6; p1 = vec2(0.0); p2 = vec2(0.0);
  for (int dj = -1; dj <= 1; dj++){
    float j = j0 + float(dj);
    float ry = (j + (prH12(vec2(j, 3.7) + ph + 23.0) - 0.5) * jit) * S.y;
    for (int di = -1; di <= 1; di++){
      float i = i0 + float(di);
      vec2 cid = vec2(i, j);
      vec2 p = vec2(i * S.x, ry)
             + (vec2(prH12(cid + ph + 19.1), prH12(cid + ph + 47.3)) - 0.5) * vec2(jit * S.x, jit * S.y * 0.55);
      float d = length(p - q);
      if (d < f1){ f2 = f1; p2 = p1; f1 = d; p1 = p; }
      else if (d < f2){ f2 = d; p2 = p; }
    }
  }
}
// One piece of the picture's glass: flat, its colour taken off the cartoon at the
// piece's own heart. The glassmaker does not take any value at all from the
// cartoon, though — the rack holds so many tints and no more — so the piece is
// snapped to the nearest of six, and it is that step between neighbouring pieces
// that makes the panel read as cut glass rather than as a blurred photograph of
// one. The hue is the cartoon's own and is never stepped; only the value is.
vec3 prGlass(vec3 c, float sat, float gain, float steps){
  float L = dot(c, W);
  vec3 g = mix(vec3(L), c, sat);
  // the rack's tints are centred on their own band, so a piece is as likely to
  // be read a step down as a step up: a panel that only ever rounded upwards
  // would come out lighter than the week it was cut from
  float Lq = min(floor(L * steps) + 0.5, steps - 0.5) / steps;
  float snapped = clamp(mix(L, Lq, 0.88) / max(L, 0.055), 0.45, 2.4);
  g *= snapped;
  g = g * mix(gain, 1.0, smoothstep(0.60, 0.92, L))
    + vec3(0.030, 0.028, 0.024) * (1.0 - smoothstep(0.0, 0.55, L));
  return clamp(g, 0.0, 1.0);
}
// One piece of the sky's glass: cobalt, and darker than the paper it replaces —
// deep where the week's sky ran bright, paler where it ran deep, in a few steps
// of its own. No sky piece is allowed down to the came's own value, or a dark
// piece would read as a hole in the panel; and where the cartoon under the
// piece's heart is *warm* — the week's race stroke, a sunrise band, the load of
// its horizon — the piece is struck in amber instead, which is what a glassmaker
// does with a warm passage in a blue sky.
vec3 prSky(float bright, float amberP, float h, float vary){
  // The rack of blues is the week's own cobalt where the week has one, hauled
  // half way to the deepest water and the ink the frame is already drawn with
  // where it does not. A sky cut from a grey week is cut from grey glass, and a
  // panel whose sky and whose ground are one value is a diagram of a mosaic and
  // not a window; the pull is a mix of two colours the week itself owns, so the
  // sky stays the week's and still separates from whatever ground lies under it.
  vec3 rack = mix(uGlassSky, mix(uSeaDeep, uInk, 0.30), 0.5);
  vec3 deep = mix(rack, uGlassDark, 0.32);
  vec3 pale = mix(rack, uPaper, 0.16);
  float step4 = (floor(min(bright, 0.9999) * 4.0) + 0.5) / 4.0;
  vec3 base = mix(deep, pale, mix(bright, step4, 0.75));
  base = mix(vec3(dot(base, W)), base, 1.55) * (1.0 + vary);
  vec3 amber = mix(uGlassWarm, uGlassAmber, 0.15) * (0.90 + 0.20 * bright) * (1.0 + vary);
  return clamp(mix(base, amber, step(1.0 - amberP, h)), 0.0, 1.0);
}
void main(){
  vec2 qToUv = vec2(uResolution.y / uResolution.x, 1.0);   // one sheet fraction, in uv
  vec2 q = vUv / qToUv;                                     // the sheet, measured in its own height
  float px = 1.0 / uResolution.y;                           // one device pixel, in sheet fractions
  float seed = fract(uSeed * 0.6180339887);
  float ph = floor(seed * 613.0);                           // the week's own laying-out

  float d0 = texture2D(tDepth, vUv).x;
  float skyHere = step(0.99998, d0);
  vec3 c0 = texture2D(tDiffuse, vUv).rgb;
  float L0 = dot(c0, W);
  // The week's own sky, read at a corner of the sheet: the level the rack of
  // blues is a rack of, how warm that week's paper sky already is, and the level a
  // piece has to reach to count as sky at all rather than as something the week
  // laid over it. Every sky is paper and every paper is a little warm, so warmth
  // only means anything against the week's own.
  // A fine, close read of the cartoon around this point: the level the glass has
  // to stay flat against, which is what separates the drawing's *line* — a
  // contour, a ring, the edge of a stroke, all thinner than any pane — from the
  // drawing's *modelling*, which belongs to the panes and not to paint.
  vec2 fp = vec2(0.011, 0.0);
  float fL = (dot(texture2D(tDiffuse, (q + fp) * qToUv).rgb, W)
            + dot(texture2D(tDiffuse, (q - fp) * qToUv).rgb, W)
            + dot(texture2D(tDiffuse, (q + vec2(0.0, fp.x)) * qToUv).rgb, W)
            + dot(texture2D(tDiffuse, (q - vec2(0.0, fp.x)) * qToUv).rgb, W)) * 0.25;
  vec3 cSkyRef = texture2D(tDiffuse, vec2(0.02, 0.98) * qToUv).rgb;
  float skyRef = max(0.40, dot(cSkyRef, W));
  float skyWarm = clamp(cSkyRef.r - cSkyRef.b, 0.0, 0.16);

  // The dials: each is an offset from the panel this module ships, so a pass that
  // never spread uniforms() above still pulls a whole window. The cut is set by
  // what a shelf shows rather than by what a poster does: a pane a tenth of the
  // sheet is a piece of glass the size of the planet's own cheek, and a window
  // whose whole world is six pieces of glass reads as a diagram of a mosaic and
  // not as one. Cut at a sixteenth and the pieces are pieces — ten or a dozen
  // across the disc, which is what a panel has to carry to read as cut glass at
  // the size a shelf shows it, and still large enough to hold a colour of its own.
  float S = clamp(0.0580 + uMosPane, 0.028, 0.150);         // a pane of the planet's glass
  float SK = clamp(0.1150 + uMosSky, 0.055, 0.300);         // a pane of the sky's glass
  // The came is a fraction of the sheet like everything else, but a lead that
  // thins with the capture is a lead that is gone: below a pixel and a half the
  // joint stops being glass and becomes a hairline the shelf never shows, so the
  // width has a floor in device pixels under its fraction of the sheet.
  float hw = max(clamp(0.0019 + uMosLead, 0.0006, 0.0060), 1.05 * px);
  float split = clamp(1.0 + uMosSplit, 0.15, 3.0);          // how readily a cell is cut again
  float glowAmt = clamp(0.18 + uMosGlow, 0.0, 0.60);        // the light behind the glass
  float glassAmt = clamp(1.0 + uMosGlass, 0.0, 2.0);        // the roller the glass was drawn over
  float formAmt = clamp(0.12 + uMosForm, 0.0, 0.60);        // how much cartoon shows through
  float sat = clamp(1.28 + uMosSat, 0.6, 2.4);              // how far off the grey a piece is read

  // ---- the planet's cut. The cell this point is in, and whether its heart is
  // busy enough to cut again: five reads across the cell — its own heart and four
  // points a third of the way out toward its edge — are all the glassmaker asks.
  // The read is of *colour* and not of tone, because the one step a screen has to
  // catch is a coastline, and a coast is often two grounds of the same lightness
  // and two different hues: a panel cut to the picture's tone alone runs its big
  // pieces straight over every shore in the week.
  float f1, f2, g1, g2;
  vec2 p1, p2, p3, p4, id;
  prCellNear(q, S, 0.62, ph, f1, f2, p1, p2, id);
  vec3 bHi = texture2D(tDiffuse, p1 * qToUv).rgb;
  vec3 bLo = bHi;
  vec3 bSum = bHi;
  float lHi = dot(bHi, W), lLo = lHi;
  for (int br = 0; br < 8; br++){
    float a = float(br) * 0.7853982;
    vec3 cs = texture2D(tDiffuse, (p1 + vec2(cos(a), sin(a)) * (0.48 * S)) * qToUv).rgb;
    float ls = dot(cs, W);
    bHi = max(bHi, cs);
    bLo = min(bLo, cs);
    bSum += cs;
    lHi = max(lHi, ls);
    lLo = min(lLo, ls);
  }
  vec3 bRan = bHi - bLo;
  float busy = max(max(bRan.r, max(bRan.g, bRan.b)), (lHi - lLo) * 1.40);
  // and the colour of the passage a pane lies on, which is what a piece straddling
  // the limb is cut from: a pane cannot take one pixel of a drawing for its colour
  // without letting the drawing itself stand in the panel as un-glassed ink
  vec3 bMean = bSum / 9.0;
  // The busyness a cell must show before it is cut again. A panel that wants its
  // subject has to cut finer where the subject is, but a lower threshold than
  // this was tried and read as a mesh of small boxy pieces — segmentation, not a
  // landform — so the cut the rack ships is the one that keeps the drawing's own
  // edges whole at shelf size, and the split dial is what a week can push on.
  float k = 1.0 + step(0.480 / split, busy);
  float cut = step(1.5, k);
  prCutNear(q, id, S, k, 0.55, ph, g1, g2, p3, p4);

  // ---- the sky's cut, and the sky's heart: the panel under a pane's own middle,
  // which is what tells a piece of the sky's cobalt how light this week's sky ran
  // and a piece of the planet's glass whether its heart fell off the limb.
  float k1, k2;
  vec2 s1, s2;
  prCourseNear(q, vec2(SK, SK * 0.68), 0.70, ph, k1, k2, s1, s2);
  vec2 paneP = mix(mix(p1, p3, cut), s1, skyHere);
  vec2 paneM = mix(mix(p2, p4, cut), s2, skyHere);
  float clearC = (f2 - f1) * 0.5;
  float clear = mix(mix(clearC, min((g2 - g1) * 0.5, clearC), cut), (k2 - k1) * 0.5, skyHere);
  vec3 cPane = texture2D(tDiffuse, paneP * qToUv).rgb;
  float dPane = texture2D(tDepth, paneP * qToUv).x;
  // a sky piece is read over the piece and not at a point: a course of glass sixty
  // pixels wide can straddle the week's ring-stroke or its own rim, and the piece
  // has to take the passage's light rather than one hatch of it
  vec3 cS1 = texture2D(tDiffuse, s1 * qToUv).rgb;
  vec3 cS2 = texture2D(tDiffuse, (s1 + vec2(SK * 0.07, 0.05 * SK)) * qToUv).rgb;
  vec3 cSky = (cS1 + cS2) * 0.5;
  // how much the piece's own two reads disagree: a bare sky is flat and a stroke
  // laid over it is not, so this is what tells the two apart
  float l1 = dot(cS1, W), l2 = dot(cS2, W);
  float spread = abs(l1 - l2);
  cPane = mix(cPane, cSky, skyHere);
  float heartSky = step(0.99998, dPane);
  float heartL = dot(cPane, W);

  // ---- the light behind the glass. A piece of the planet's glass whose own
  // heart fell past the limb takes the colour of the ground it covers here, so
  // the pale sky is never let into the disc by a chip that straddles the edge;
  // and every piece is lit from its own middle, brighter there and heavier where
  // it thickens into the came.
  float chip = heartSky * (1.0 - skyHere);
  float bMeanL = dot(bMean, W);
  cPane = mix(cPane, bMean, chip);
  heartL = mix(heartL, bMeanL, chip);
  // a course of glass is cut from a rack of blues: part of each piece's value
  // comes from the week's own sky and part from the piece's own place in the
  // batch, so a wide bare sky is not one flat tile of blue
  float bright = mix(smoothstep(0.62 * skyRef, 1.02 * skyRef, heartL), prH12(paneP + ph + 13.0), 0.35);
  // where the cartoon's own colour runs warm under a sky piece's heart, the
  // glassmaker reaches for an amber instead of a blue. And a piece that is both
  // warm *and* below the week's own sky is not sky at all — it is the week's ring,
  // or the stroke it drew across the sheet — so it is cut from the picture's glass
  // instead of from the rack of blues, and that stroke survives across the panel
  // as a ribbon of pieces rather than being dissolved into the sky. A wash of
  // sky's own blue, however dark, is still sky and stays cobalt: the sky's own
  // weather belongs to the rack's value, not to the picture's glass.
  float over = clamp((spread - 0.10) / 0.30, 0.0, 1.0);
  float warmEx = clamp((cPane.r - cPane.b) - skyWarm, 0.0, 1.0);
  float notSky = clamp(max(over * 1.2, warmEx * 3.0), 0.0, 1.0) * heartSky;
  float onSky = 1.0 - notSky;
  float paneR = mix(mix(0.577 * S, 0.240 * S, cut), 0.30 * SK, skyHere);
  float edgeN = clamp(clear / max(1.0e-4, paneR), 0.0, 1.5);
  float glow = smoothstep(0.0, 0.92, edgeN);
  float haveDisc = step(1.0e-4, uGlobeR);
  float facing = clamp(dot(normalize(paneP - uGlobe + vec2(1.0e-5)), uSunSheet), 0.0, 1.0);
  float lit = mix(0.70, 1.15, facing * (1.0 - skyHere) * haveDisc);
  float rr = length(q - uGlobe) / max(1.0e-4, uGlobeR);
  float limbShade = mix(1.0, 1.0 - 0.14 * smoothstep(0.68, 1.0, rr), haveDisc * (1.0 - skyHere));

  vec3 planetCol = prGlass(cPane, sat, 1.10, mix(9.0, 3.0, chip));
  // a batch of glass is never one colour throughout: every piece is a shade off
  // its neighbours, warm or cool, which is what keeps a panel from reading as a
  // printed grid
  float hv = prH12(paneP + ph + 23.0) - 0.5;
  planetCol *= vec3(1.0 + hv * 0.075, 1.0, 1.0 - hv * 0.065);
  vec3 skyCol = mix(prGlass(cPane, sat * 0.80, 1.02, 6.0),
                    prSky(bright, clamp(0.025 + uMosAmber + 0.95 * warmEx * (0.35 + 0.65 * over) + 0.10 * over, 0.0, 0.45),
                            prH12(paneP + ph + 5.0), (prH12(paneP + ph + 61.0) - 0.5) * 0.13),
                    onSky);
  vec3 col = mix(planetCol, skyCol, skyHere);
  // A pane of glass is not a flat of paint: it stands a hair out of the plane of
  // the pieces beside it, and which way it leans is the glassmaker's own hand —
  // so every piece catches the sun a shade differently and the panel glitters as
  // the eye crosses it. It costs one hash and a dot: the lean is dealt from the
  // piece's own place on the sheet, and the sun's own bearing across it decides
  // which pieces catch the light. Nothing moves, because glass does not, and
  // nothing is a Math.random: the week's laying-out deals the leans.
  float tiltA = prH12(paneP + ph + 71.0) * 6.2831853;
  float tiltR = 0.30 + 0.70 * prH12(paneP + ph + 33.0);
  float catch = clamp(dot(vec2(cos(tiltA), sin(tiltA)) * tiltR, uSunSheet) * 0.5 + 0.5, 0.0, 1.0);
  col *= mix(0.90, 1.14, catch);
  col *= limbShade;
  // the light behind the glass is only visible in a piece that has room to take
  // it: the palest pieces are already near the sheet's own white and a glow laid
  // on them would only flatten them into it
  col *= 1.0 + glowAmt * glow * lit * (1.0 - 0.85 * smoothstep(0.55, 0.92, heartL));
  // the glass thickens into the came: a hair of shade on the piece's own edge,
  // measured on the sheet and not on the pane, so a large piece is flat to its
  // border and a small one is not swallowed by its own shadow
  col *= 1.0 - 0.06 * (1.0 - smoothstep(0.0, 0.0030, clear));
  // And the cartoon's own line is painted on the glass. Thin ink cannot hold a pane
  // of its own — a ring carried across the sky is thinner than any piece a panel
  // would be cut into, and a contour on the ground is thinner than any tesserae —
  // so it is carried *on* the pieces, the way a window paints the detail it cannot
  // lead: measured against its own neighbourhood and never against the pane, so
  // that what the glass takes is the drawing's line and not its modelling, and the
  // ring still crosses the panel while the pieces stay flat.
  float stroke = smoothstep(0.11 + 0.10 * formAmt, 0.30 + 0.20 * formAmt, fL - L0);
  col = mix(col, col * mix(0.72, 0.62, skyHere), stroke * 0.90);

  // ---- the glass itself: the roller's wave and the striation the sheet of glass
  // was drawn up with, both laid on the sheet and not on the picture
  float roll = prN2(q * 9.0 + ph + 5.0) * 0.60 + prN2(q * 31.0 + ph + 17.0) * 0.40;
  float drawn = prN2(vec2(q.x * 46.0, q.y * 2.4) + ph + 29.0);
  col *= 1.0 + (roll - 0.5) * 0.055 * glassAmt + (drawn - 0.5) * 0.030 * glassAmt;

  // ---- the came. It is one width on the sheet — never on the picture — the
  // pieces are cut a shade thinner inside a cell than the cell's own bar, and the
  // whole of it wanders a little, because a came is drawn by hand and bedded in
  // whiting. The bar of the panel is the one the cell was divided at.
  float e = clamp(0.55 * px, 0.20 * hw, 0.45 * hw);
  float wob = ((prN2(q * 12.0 + ph + 41.0) - 0.5) * 0.7 + (prN2(q * 34.0 + ph + 9.0) - 0.5) * 0.3) * (1.1 * hw);
  // and it is drawn by hand, so it wanders off the joint and swells and thins
  // along its own length: a came is milled, stretched and bedded, and no two
  // lengths of it are quite one width
  float hwVar = 0.62 + 0.83 * prN2(q * 7.0 + ph + 3.0) * (0.70 + 0.55 * prN2(q * 2.3 + ph + 71.0));
  float hwMain = hw * hwVar * mix(1.0, 0.72, cut * (1.0 - skyHere));
  float lead = 1.0 - smoothstep(hwMain - e, hwMain + e, max(0.0, clear + wob));
  float bar = 1.0 - smoothstep(hw * hwVar * 1.35 - e, hw * hwVar * 1.35 + e, max(0.0, clearC + wob));
  lead = max(lead, bar * cut * (1.0 - skyHere));
  // the limb: the one line the panel is bounded by, read off the sheet's own edge
  vec2 lp = vec2(px * 1.6, 0.0);
  float limb = 0.0;
  limb += abs(step(0.99998, texture2D(tDepth, vUv + lp).x) - skyHere);
  limb += abs(step(0.99998, texture2D(tDepth, vUv - lp).x) - skyHere);
  limb += abs(step(0.99998, texture2D(tDepth, vUv + vec2(0.0, lp.x)).x) - skyHere);
  limb += abs(step(0.99998, texture2D(tDepth, vUv - vec2(0.0, lp.x)).x) - skyHere);
  lead = max(lead, smoothstep(0.55, 1.45, limb));
  vec3 leadCol = mix(uInk, uSeaDeep, 0.18);
  vec2 nrm = normalize(paneM - paneP + vec2(1.0e-5));
  float sheen = clamp(0.5 + 0.5 * dot(nrm, normalize(uSunSheet + vec2(1.0e-5))), 0.0, 1.0);
  leadCol = mix(leadCol, mix(leadCol, uPaper, 0.30), lead * (1.0 - smoothstep(0.0, hwMain * 0.8, clear)) * 0.75 * sheen);
  col = mix(col, leadCol, clamp(lead, 0.0, 1.0));

  float tooth = prTooth(gl_FragCoord.xy);
  col *= 1.0 + (tooth - 0.5) * 0.045;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`,
  uniforms(ctx = {}) {
    // A dial comes from params.js as `print.mosaic.pane` when it is there at all,
    // and from the bare name otherwise. Either way it is an offset from the panel
    // this module ships, so an absent entry and a 0 both change nothing.
    const dial = (name, fallback) => {
      const p = ctx?.dials;
      const value = p?.[`print.mosaic.${name}`] ?? p?.[name];
      return typeof value === 'number' ? value : fallback;
    };
    // The week's own glass: the cobalt and amber a window's sky is made of, taken
    // from the palette where it carries them and from the sea and the ink where
    // it does not, so no week's family has to know this print exists.
    const T = ctx?.THREE;
    const pal = ctx?.palette || {};
    const colour = (preferred, spare, hex) => {
      const found = preferred.map((name) => pal[name]).find(Boolean);
      if (found) return found.clone();
      return T ? new T.Color(spare ? (pal[spare] ? pal[spare] : hex) : hex) : null;
    };
    return {
      // The craft dials. Every length is a fraction of the sheet's height, so a
      // capture at any size cuts the same window, only finer; the shader adds
      // each to the panel it ships, so an unspread uniform changes nothing.
      uMosPane: { value: dial('pane', 0.0) },        // a pane of the planet's glass
      uMosSky: { value: dial('sky', 0.0) },          // a pane of the sky's glass
      uMosLead: { value: dial('lead', 0.0) },        // the came's width
      uMosSplit: { value: dial('split', 0.0) },      // how readily a cell is cut again
      uMosGlow: { value: dial('glow', 0.0) },        // the light behind the glass
      uMosAmber: { value: dial('amber', 0.0) },      // the sky's own amber pieces
      uMosGlass: { value: dial('glass', 0.0) },      // the roller the glass was drawn over
      uMosForm: { value: dial('form', 0.0) },        // how much of the cartoon shows through
      uMosSat: { value: dial('sat', 0.0) },          // how far off the grey a piece is read
      // the disc, the sun across it, and the window's own glass, read every frame
      // in update() from the camera the pass supplies
      uGlobe: { value: T ? new T.Vector2(0.5, 0.5) : null },
      uGlobeR: { value: 0 },
      uSunSheet: { value: T ? new T.Vector2(0.0, 1.0) : null },
      uGlassSky: { value: colour(['cobalt', 'seaDeep'], null, 0x2a4a7a) },
      uGlassAmber: { value: colour(['vermilion'], ['litWarm'], 0xc6452a) },
      uGlassWarm: { value: colour(['litWarm'], ['landMid'], 0xd6a462) },
      uGlassDark: { value: colour(['dark', 'ink'], null, 0x141c33) },
    };
  },
  // The disc's heart and radius on the sheet, and the sun's bearing across it:
  // the print draws with the globe itself, so it reads the camera every frame —
  // the disc's centre is the world's origin projected, its radius the circle a
  // sphere projects to (f·ρ/√(d²−ρ²)), and the sun's bearing the light's
  // component across the eye, taken in the camera's own right and up.
  update(ctx, uniforms) {
    const T = ctx?.THREE;
    const camera = ctx?.camera;
    const res = uniforms?.uResolution?.value;
    if (!T || !camera || !res || !uniforms.uGlobe) return;
    if (!scratch.g) {
      scratch.g = new T.Vector3();
      scratch.sun = new T.Vector3();
      scratch.eye = new T.Vector3();
      scratch.right = new T.Vector3();
      scratch.up = new T.Vector3();
    }
    const { g, sun, eye, right, up } = scratch;
    g.set(0, 0, 0).project(camera);
    uniforms.uGlobe.value.set(((g.x * 0.5 + 0.5) * res.x) / res.y, g.y * 0.5 + 0.5);
    const rho = (ctx.radius || 0) + (ctx.seaLevel || 0);
    const d = camera.position.length();
    const f = (res.y * 0.5) / Math.tan((camera.fov * Math.PI) / 360);
    uniforms.uGlobeR.value = d > rho * 1.02 ? (f * rho) / Math.sqrt(Math.max(1e-3, d * d - rho * rho)) / res.y : 0;
    const lightDir = ctx.light?.value || ctx.uniforms?.uSunDir?.value;
    if (!lightDir) return;
    eye.copy(camera.position).normalize();
    sun.copy(lightDir).addScaledVector(eye, -lightDir.dot(eye));
    const sep = sun.length();
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);
    if (sep > 1e-4) uniforms.uSunSheet.value.set(sun.dot(right) / sep, sun.dot(up) / sep).normalize();
    else uniforms.uSunSheet.value.set(0, 1);
  },
};

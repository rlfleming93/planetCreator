/* Planet Creator — the atlas print.
 *
 * An antique plate of a globe. The frame is re-dyed the way a cartographer
 * would have engraved it: the sea is a pale blue wash ruled with the burin's
 * straight lines, the land is stepped through a hypsometric ramp from sepia to
 * ochre and cut with contour lines, and over both sits a graticule of meridians
 * and parallels that lies *on the globe* — the sphere is put back out of the
 * sheet every frame, so the lines curve with the world and turn with it instead
 * of lying flat on the paper. The planet lays each day of the week on its own
 * meridian; those seven are ruled heavier and lettered at the equator with
 * small roman numerals, and there is a ruled border round the plate and no
 * compass rose anywhere, because the rose belongs to the chart and this is a
 * globe. The border is set well inside the sheet, where a plate's neat line is,
 * and the globe is printed over it: a week whose world fills the frame wears the
 * border as a rule stopped by the drawing rather than crossing it. The sheet
 * itself is paper a century old: warm, uneven, freckled with foxing — and so is
 * the sky, which is only paper the printer never touched.
 *
 * The sphere is put back the only way a flat sheet can do it. `update` projects
 * the globe's centre onto the sheet, takes the disc's radius from the camera's
 * own distance and the radius + sea level the pass hands it, and carries the
 * camera's right, up and forward onto the uniforms; the fragment turns each
 * pixel inside the disc into a ray from the eye and meets it with the sphere.
 * What comes back is the surface normal there, and the normal is the latitude
 * and the longitude — the two numbers every line below is ruled by. Nothing is
 * read off the depth buffer for this: a graticule belongs to the globe and not
 * to the terrain, and a globe whose lines wobbled with its relief would be a
 * map drawn on a rock. The depth buffer is read once for the sky, and once more
 * for the frame's own silhouette, which is the engraved circle of the globe.
 *
 * The frame is not thrown away, it is re-engraved: what the picture drew in ink
 * — the coastline, the week's own route, its monuments — is read back out of
 * the frame as everything darker than its own neighbourhood, and laid down
 * again in the plate's ink; and what the picture drew in vermilion stays red,
 * because a route line is red on an old map too.
 *
 * Nothing here is a Math.random: the paper, the foxing and the ruling's own
 * wander come from the week's uSeed, so a week is the same sheet every time it
 * is pulled. Nothing reads uTime either — a plate does not move — so no frame is
 * ever re-drawn. Every length is a fraction of the sheet's height, and only the
 * ruling is a screen, so a capture at twice the size draws the same plate twice
 * as fine rather than a coarser one. Fourteen texture taps carry the whole
 * print: nine for the frame's tone, four for the sky and the globe's silhouette,
 * and one for the sky over the pixel itself.
 */
export default {
  id: 'atlas',
  label: 'Atlas',
  fragment: /* glsl */ `
uniform sampler2D tDiffuse, tDepth;
uniform vec2 uResolution;
uniform vec3 uPaper, uInk, uLand, uSeaDeep, uSeaShallow;
uniform float uSeed;
// the plate's own pigments: the week's colours re-dyed as an old sheet
uniform vec3 uAtSheetC, uAtLineC, uAtSepiaC, uAtOchreC, uAtSeaC, uAtSeaInkC, uAtRedC;
// the globe, put back on the sheet every frame by update()
uniform vec2 uAtCentre;      // the globe's centre, in device pixels
uniform vec3 uAtEye, uAtCamR, uAtCamU, uAtCamF, uAtSun;
uniform float uAtF;          // device pixels per unit of tan, for the ray
uniform float uAtRho, uAtRim, uAtGlobe;
uniform vec3 uAtDay[7];      // per day: the equator point in pixels, and how much of it faces us
// the dials, each an offset from the plate this module ships
uniform float uAtGr, uAtBand, uAtCont, uAtSeaD, uAtFox, uAtNight, uAtLet;
varying vec2 vUv;

float atH12(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float atN2(vec2 x){
  vec2 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(atH12(i), atH12(i + vec2(1.0, 0.0)), f.x);
  float b = mix(atH12(i + vec2(0.0, 1.0)), atH12(i + vec2(1.0, 1.0)), f.x);
  return mix(a, b, f.y);
}
// The sheet: a cold-press grain, a fibre stretched along it, and the uneven
// absorbency of a sheet that dried on the frame. Paper, never world.
float atTooth(vec2 sp){
  return clamp(atH12(floor(sp * 0.85)) * 0.50
             + atH12(floor(vec2(sp.x * 0.22, sp.y * 1.06) + 31.0)) * 0.31
             + atH12(floor(vec2(sp.x * 1.12, sp.y * 0.19) + 71.0)) * 0.19, 0.0, 1.0);
}
// One rule of the burin: a straight family at a fixed pitch, wandering a hair
// along its length where the hand leaned. A dens of 1 lays a second family
// exactly halfway between the first, which is how a plate darkens the deep
// water without cutting a ruling of its own; the two never cross, because the
// halfway line carries the same wander as the line it was laid between.
float atRuling(float v, float pitch, float dens, float wPx){
  float f = v / pitch;
  float aa = max(fwidth(f), 1e-5) * wPx;
  float a = 1.0 - smoothstep(aa, aa * 2.4, abs(fract(f + 0.5) - 0.5));
  float b = 1.0 - smoothstep(aa, aa * 2.4, abs(fract(f) - 0.5));
  return max(a, clamp(dens, 0.0, 1.0) * 0.9 * b);
}
// How fast the globe's own coordinates crowd on the sheet: how many world units
// of the surface one pixel of the sheet carries, read off the sphere itself.
// A screen step at a point whose normal stands at an angle to the eye's own
// direction moves that point of the surface by (d - rho cos)^2 / (f (d cos - rho))
// units — the same number the projection gives, and a smooth function of the
// normal rather than a difference taken across a quad. That smoothness is the
// whole reason it is here: the derivative a quad carries is constant over the
// 2x2 block it is read in and jumps from block to block, so a line whose width
// is taken from it goes in and out in squares along the limb — a staircase a
// globe never has, because a printed graticule widens continuously as the
// surface turns away.
float atCrowd(vec3 n, vec3 eye, float rho, float f){
  float d = max(1e-4, length(eye));
  float ct = clamp(dot(n, eye / d), -1.0, 1.0);
  float t = d - rho * ct;
  return (t * t) / max(1e-4, f * max(1e-4, d * ct - rho));
}
// One line of a family ruled on the globe itself. The distance to the line is
// measured in the family's own units and its weight is read from the crowding
// the caller worked out (crowd, divided by the family's own scale), so a line
// keeps its weight as the world turns and the coordinates crowd at the limb —
// and where they crowd past a pixel the line lets go rather than printing a
// solid cap, which is what a graticule does at the edge of a globe. Where the
// line goes it goes evenly: the fade is a ramp on a number that changes by a
// hair from pixel to pixel, never a step between one block of four and the next.
float atRule(float v, float step, float wPx, float crowd){
  float f = v / step;
  float aa = max(crowd * wPx, 1e-5);
  float line = 1.0 - smoothstep(aa, aa * 1.8, abs(fract(f + 0.5) - 0.5));
  return line * (1.0 - smoothstep(0.22, 0.46, crowd));
}
// A stroke of the burin, as a signed distance: a segment, thickest where the
// tool was entered and lifted, so a numeral has a hand in it and not a face.
float atStroke(vec2 p, vec2 a, vec2 b, float w, float lean){
  vec2 pa = p - a, ba = b - a;
  float t = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return w * (1.0 + lean * abs(t * 2.0 - 1.0)) - length(pa - ba * t);
}
// The seven days as a plate letters them: two glyphs and no more — a stem and a
// vee — dealt into three slots. Slot 0 is I for I..IV and V for V..VII, which
// is the only irregularity in the whole set.
float atSlot(float n, float slot){
  if (slot < 0.5) return n < 4.5 ? 0.0 : 1.0;
  if (slot < 1.5) return n < 1.5 ? 2.0 : (n < 3.5 ? 0.0 : (n < 4.5 ? 1.0 : (n < 5.5 ? 2.0 : 0.0)));
  return (n > 2.5 && n < 3.5) ? 0.0 : (n > 6.5 ? 0.0 : 2.0);
}
float atAdvance(float slot){ return slot < 0.5 ? 0.235 : (slot < 1.5 ? 0.400 : 0.0); }
// I, II, III, IV, V, VI, VII — a signed distance in the glyph's own box, whose
// height is 0.92 and whose x runs left to right about its own centre.
float atNumeral(vec2 p, float n){
  float w = atAdvance(atSlot(n, 0.0)) + atAdvance(atSlot(n, 1.0)) + atAdvance(atSlot(n, 2.0));
  float ink = -1.0;
  float x = -w * 0.5;
  for (int i = 0; i < 3; i++) {
    float slot = atSlot(n, float(i));
    if (atAdvance(slot) > 0.001) {
      if (slot < 0.5) {
        ink = max(ink, atStroke(p, vec2(x + 0.118, -0.46), vec2(x + 0.118, 0.46), 0.066, 0.30));
      } else {
        ink = max(ink, atStroke(p, vec2(x + 0.030, 0.46), vec2(x + 0.195, -0.44), 0.062, 0.10));
        ink = max(ink, atStroke(p, vec2(x + 0.195, -0.44), vec2(x + 0.360, 0.46), 0.062, 0.10));
      }
    }
    x += atAdvance(slot);
  }
  return ink;
}
// How far a colour leans to water: the frame's chroma along the sea's own axis
// measured against its rock's, with the paper-to-ink value axis taken out of
// both, because the value is what every tone of the frame already has in common.
float atWater(vec3 col, vec3 paper, vec3 e0, float e00, vec3 eS, vec3 eL){
  vec3 dd = col - paper;
  vec3 ch = dd - e0 * clamp(dot(dd, e0) / e00, 0.0, 1.20);
  return dot(ch, eS) / max(0.03, dot(eS, eS)) - dot(ch, eL) / max(0.03, dot(eL, eL));
}
void main(){
  vec2 sheetPx = (1.0 / uResolution) * uResolution.y;   // one sheet fraction, in uv
  float asp = uResolution.x / max(2.0, uResolution.y);  // the sheet's width, in its own heights
  vec2 q = gl_FragCoord.xy / max(2.0, uResolution.y);   // the sheet, measured in its own height
  float pxS = 1.0 / max(2.0, uResolution.y);            // one device pixel, in sheet fractions
  float seed = fract(uSeed * 0.6180339887);

  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float sky = step(0.99998, texture2D(tDepth, vUv).x);
  vec3 W = vec3(0.32, 0.55, 0.13);
  float lum = dot(c, W);
  float pl = dot(uPaper, W), il = dot(uInk, W);

  // ---- the sheet. Nothing on this plate is white: the paper has gone warm and
  // uneven, its edges have taken the dirt of a hundred years and the light of
  // every one of them, and it has grown the rust freckles a damp sheet grows.
  // This is the sky as much as the margin — the space round a globe is paper
  // the printer never touched, and it is left as exactly that.
  float blot = atN2(q * 2.7 + seed * 19.0) * 0.62 + atN2(q * 8.3 + 41.0) * 0.38;
  float tooth = atTooth(gl_FragCoord.xy);
  vec3 sheet = uAtSheetC * (0.955 + 0.085 * blot) * (0.972 + 0.056 * tooth);
  vec2 edge = min(q, vec2(asp, 1.0) - q);
  float rim = 1.0 - smoothstep(0.0, 0.13, min(edge.x, edge.y));
  sheet *= 1.0 - 0.06 * rim * (0.55 + 0.45 * atN2(q * 4.7 + 7.0));

  // ---- the globe. The disc's centre and radius are the sheet's own, from
  // update; a pixel inside it is a ray out of the eye, and the ray meets the
  // sphere. The normal it comes back with is the latitude and the longitude
  // every line in the rest of this print is ruled by.
  float on = 0.0, lat = 0.0, lon = 0.0, face = 0.0;
  vec3 n = vec3(0.0, 1.0, 0.0);
  if (uAtGlobe > 0.5) {
    vec2 rel = (gl_FragCoord.xy - uAtCentre) / max(1.0, uAtF);
    vec3 ray = normalize(uAtCamR * rel.x + uAtCamU * rel.y + uAtCamF);
    float b = dot(uAtEye, ray);
    float disc = b * b - (dot(uAtEye, uAtEye) - uAtRho * uAtRho);
    if (disc > 0.0) {
      vec3 hit = uAtEye + ray * (-b - sqrt(disc));
      n = hit / uAtRho;
      lat = asin(clamp(n.y, -1.0, 1.0));
      lon = atan(n.z, n.x);
      face = clamp(dot(n, normalize(uAtEye - hit)), 0.0, 1.0);
      on = 1.0;
    }
  }

  // ---- sea and land, told apart by which way the frame's own colour leans. A
  // week's water is the blue it was painted with and its rock is the warm side
  // of the same sheet, so the plate never has to be told where the coast is; the
  // lean itself is the whole test, and its two ends are the week's own colours.
  vec3 e0 = uInk - uPaper;
  float e00 = max(1e-4, dot(e0, e0));
  vec3 eS = mix(uSeaDeep, uSeaShallow, 0.5) - uPaper; eS -= e0 * (dot(eS, e0) / e00);
  vec3 eL = uLand - uPaper; eL -= e0 * (dot(eL, e0) / e00);
  float lean = atWater(c, uPaper, e0, e00, eS, eL);
  // A lean is only worth reading where there is a colour to lean with: snow, ice
  // and the palest rock carry almost no chroma, and on those the lean swings
  // every pixel — which would call the flattest ground on the sheet a coast and
  // rule the ruling over a glacier. So the lean is trusted in proportion to the
  // chroma there is.
  vec3 chC = (c - uPaper) - e0 * clamp(dot(c - uPaper, e0) / e00, 0.0, 1.20);
  float solid = smoothstep(0.012, 0.070, length(chC));
  float sea = smoothstep(-0.02, 0.24, lean) * solid * (1.0 - sky);
  float deep = sea * clamp((pl - lum) / max(1e-3, pl - il) * 2.4, 0.0, 1.0);

  // ---- what the frame drew, kept — and the one line of it that must be, which
  // is the coast. This frame draws its land in the same soft ink it marks it
  // with: a shoreline, a monument and a slope's hatching all lie within a tenth
  // of a tone of each other, so no threshold on darkness can tell the map from
  // the drawing, and a plate that tries keeps the hatching and paints the
  // country over with it. What can be told apart is where the water stops. The
  // coast is read off the sea's own mask against its neighbours', which is a
  // boundary in the country and not in the ink. The soft field below still reads
  // everything the hand drew, and it is laid on faintly enough to give the land
  // its texture rather than to redraw it. A much wider field out of the same
  // taps plus four more is the country the steps and their contours are cut into.
  vec2 k = sheetPx * 0.0052, k2 = sheetPx * 0.0165;
  vec3 cR = texture2D(tDiffuse, vUv + vec2(k.x, 0.0)).rgb;
  vec3 cL = texture2D(tDiffuse, vUv - vec2(k.x, 0.0)).rgb;
  vec3 cU = texture2D(tDiffuse, vUv + vec2(0.0, k.y)).rgb;
  vec3 cD = texture2D(tDiffuse, vUv - vec2(0.0, k.y)).rgb;
  float sm = (lum * 2.0 + dot(cR, W) + dot(cL, W) + dot(cU, W) + dot(cD, W)) / 6.0;
  float field = (sm * 2.0
              + dot(texture2D(tDiffuse, vUv + vec2(k2.x, 0.0)).rgb, W)
              + dot(texture2D(tDiffuse, vUv - vec2(k2.x, 0.0)).rgb, W)
              + dot(texture2D(tDiffuse, vUv + vec2(0.0, k2.y)).rgb, W)
              + dot(texture2D(tDiffuse, vUv - vec2(0.0, k2.y)).rgb, W)) / 6.0;
  float line = clamp((field - lum) * 4.6 - 0.36, 0.0, 1.0);   // everything the hand drew, faintly
  float vv = clamp(1.0 - (pl - field) / max(1e-3, pl - il), 0.0, 1.0);   // the country's own height, read as light
  float coast = max(max(abs(atWater(cR, uPaper, e0, e00, eS, eL) - lean),
                        abs(atWater(cL, uPaper, e0, e00, eS, eL) - lean)),
                    max(abs(atWater(cU, uPaper, e0, e00, eS, eL) - lean),
                        abs(atWater(cD, uPaper, e0, e00, eS, eL) - lean)));
  coast = smoothstep(0.10, 0.42, coast) * solid;               // the coast, a boundary of the country

  // ---- the land, stepped. A hypsometric plate does not shade a slope: it cuts
  // it into steps and gives each step a flat tint, and it cuts each step again
  // with contour lines, every fourth of them heavier and landing on the edge of a
  // step. The height it is all stepped by is the country's own — the wide field
  // above, not the frame's raw tone — because an iso-line of a shading is a
  // scribble and an iso-line of a country is a drawing. Where the ground rises
  // too fast for the pen, the lines let go rather than closing into a blot.
  float bands = clamp(9.0 + uAtBand, 3.0, 12.0);
  float tt = clamp((vv - 0.30) / 0.55, 0.0, 1.0);
  vec3 tint = mix(uAtSepiaC, uAtOchreC, clamp(floor(tt * bands), 0.0, bands - 1.0) / max(1.0, bands - 1.0));
  tint *= 1.0 + clamp((lum - sm) * 1.1, -0.26, 0.26);   // the frame's own modelling, kept under the steps
  float cw = clamp(4.0 + uAtCont, 2.0, 10.0);           // contour lines to a step
  // The contours are cut from the height itself and not from the step the height
  // was rounded into: a flattened step is a constant, and a constant lands on an
  // exact level, so every pixel of a plateau would read as lying on a line and
  // the highest ground on the sheet would print as one solid cut. The field
  // below therefore keeps its slope where the step has none, and a ground with no
  // slope at all carries no iso-line, which is the truth of the matter.
  float cf = (vv - 0.30) / 0.55 * bands * cw;
  float caa = max(fwidth(cf), 1e-5);
  float heavy = 1.0 - step(0.5, mod(floor(cf + 0.5), cw));   // every fourth is cut heavier
  float cont = (1.0 - smoothstep(caa * mix(0.34, 0.78, heavy), caa * 1.9, abs(fract(cf + 0.5) - 0.5)))
             * smoothstep(0.0006, 0.0060, caa)
             * (1.0 - smoothstep(0.12, 0.40, caa))
             * step(0.004, tt) * (0.15 + 0.44 * heavy);
  vec3 land = mix(tint, uAtLineC, cont * (1.0 - sea));

  // ---- the sea, ruled. Horizontal lines the engraver ran straight across the
  // plate, because they are the plate's ruling and not the world's: they stay on
  // the sheet while the water turns under them, which is the whole difference
  // between a ruling and a graticule. Deeper water takes a second family laid
  // halfway between the first.
  float pitch = 0.0122 / (1.0 + 0.6 * clamp(uAtSeaD, -0.7, 1.6));
  float wob = (atN2(vec2(q.x * 2.1, q.y * 0.35) + seed * 13.0) - 0.5) * 0.55;
  float rule = atRuling(q.y + wob * pitch, pitch, clamp(0.28 + uAtSeaD + deep * 1.35, 0.0, 1.0), 0.40);
  vec3 seaC = mix(uAtSheetC, uAtSeaC, 0.36 + 0.34 * deep);
  seaC = mix(seaC, uAtSeaInkC, rule * (0.32 + 0.26 * deep));

  vec3 globe = mix(land, seaC, sea);
  globe = mix(globe, uAtLineC, (1.0 - sky) * max(coast * 0.55, line * 0.20));
  // the week's own red: nothing on an old map is red but the route
  float red = step(1.42 * c.g, c.r) * step(0.16, c.r - max(c.g, c.b));
  globe = mix(globe, uAtRedC, clamp(red * 0.55, 0.0, 1.0));

  // ---- the graticule, and the seven days. Meridians and parallels ruled on
  // the sphere itself, and the days heavier on top of them: the planet lays each
  // day of the week on its own longitude, and the plate follows the planet. The
  // equator is ruled heavier than the rest of the parallels, as it is on every
  // globe ever printed.
  // Two numbers make the ruling stand on the sphere instead of on the sheet.
  // The first is how much the coordinates crowd here, read analytically off the
  // sphere (atCrowd): a pixel carries this many units of the surface, so a line
  // keeps the weight its own pitch asks for and lets go only where a pixel
  // swallows a whole pitch — which is what a graticule does at the edge of a
  // globe, and it does it evenly. The second is how much of the pixel's own
  // neighbourhood stands on the globe at all, read as a mean of four taps of the
  // frame's depth rather than as the frame's own one-pixel edge: a rule stops
  // where the drawn world stops, fading along the ramp the terrain leaves, and
  // not along the circle a sphere of sea level would have projected.
  float gstep = radians(clamp(15.0 + uAtGr, 4.0, 45.0));
  float pole = smoothstep(0.05, 0.22, cos(lat));     // no pile of lines at the poles
  float crowd = uAtGlobe > 0.5 ? atCrowd(n, uAtEye, uAtRho, uAtF) : 0.0;
  // cEdge is the drop of the coordinates across one pixel along an axis, so it
  // carries the meaning the quad's own derivative did, a factor of root two
  // smaller than the sum of the two the old reading used — hence the 1.42, which
  // is what keeps every rule at the weight this plate shipped with.
  float cEdge = 1.42 * crowd / max(1e-4, uAtRho * max(0.05, cos(lat)));   // a pixel, in radians of the sphere's arc
  vec2 cv = sheetPx * 0.0040;
  float cover = 0.25 * (
      (1.0 - smoothstep(0.99950, 0.99998, texture2D(tDepth, vUv + vec2(cv.x, 0.0)).x))
    + (1.0 - smoothstep(0.99950, 0.99998, texture2D(tDepth, vUv - vec2(cv.x, 0.0)).x))
    + (1.0 - smoothstep(0.99950, 0.99998, texture2D(tDepth, vUv + vec2(0.0, cv.y)).x))
    + (1.0 - smoothstep(0.99950, 0.99998, texture2D(tDepth, vUv - vec2(0.0, cv.y)).x)));
  cover = smoothstep(0.18, 0.86, cover);
  float grat = max(max(atRule(lon, gstep, 0.62, cEdge / gstep) * 0.62, atRule(lat, gstep, 0.62, cEdge / gstep) * 0.55),
                   max(atRule(lon, 6.283185307179586 / 7.0, 1.15, cEdge / (6.283185307179586 / 7.0)) * 0.95,
                       atRule(lat, 3.141592653589793, 0.80, cEdge / 3.141592653589793) * 0.85));
  grat *= on * cover * pole * smoothstep(0.10, 0.34, face);
  globe = mix(globe, uAtLineC, clamp(grat, 0.0, 1.0) * 0.78);

  // ---- the night side. A globe is engraved with its dark half hatched, and the
  // family is cut in the sphere's own coordinates, so it turns with the world
  // and is never quite the same twice as the week moves its sun.
  float night = smoothstep(0.10, -0.40, dot(n, uAtSun));
  float hatch = atRule(lat + lon * 0.62, radians(7.5), 0.40, cEdge / radians(7.5)) * night * on * cover * pole
              * clamp(0.18 + uAtNight, 0.0, 0.55) * smoothstep(0.04, 0.26, face);
  globe = mix(globe, uAtLineC, hatch * 0.6);

  // ---- the limb. The sphere turns away from the sheet along its own edge, so
  // the plate's tone deepens into it, and round it goes the engraved circle of
  // the globe — read out of the frame's own silhouette, so the line follows
  // whatever edge the terrain mesh drew and not a circle this print assumed.
  globe *= 1.0 - 0.14 * smoothstep(0.60, 1.0, length(gl_FragCoord.xy - uAtCentre) / max(1.0, uAtRim))
                 * uAtGlobe * mix(0.30, 1.0, face);
  // The circle is the frame's own silhouette, and the only thing in the depth
  // buffer that says so is the sky: this camera's near and far put the whole
  // globe between 0.9971 and 0.9978 of the range, so the threshold has to sit
  // just under the cleared value and nowhere lower — a wider one would draw the
  // circle through the middle of the picture and print the planet solid.
  vec2 lo = sheetPx * 0.0032;
  float lm = max(max(smoothstep(0.99950, 0.99998, texture2D(tDepth, vUv - vec2(lo.x, 0.0)).x),
                     smoothstep(0.99950, 0.99998, texture2D(tDepth, vUv + vec2(lo.x, 0.0)).x)),
                 max(smoothstep(0.99950, 0.99998, texture2D(tDepth, vUv - vec2(0.0, lo.y)).x),
                     smoothstep(0.99950, 0.99998, texture2D(tDepth, vUv + vec2(0.0, lo.y)).x)));
  globe = mix(globe, uAtLineC, clamp(lm, 0.0, 1.0) * 0.58);

  vec3 col = mix(sheet, globe, 1.0 - sky);

  // ---- the border. Two rules and the degrees ticked between them, and nothing
  // else at all: this plate is trimmed, not decorated. It is set well inside the
  // sheet, the way a plate's neat line is, with the paper's own margin outside it
  // — and the globe is printed over it, so a week whose world fills the frame
  // wears the border as a rule stopped by the drawing and not crossing it. The
  // shortest ticks are ruled by the same hand as the sea.
  float ed = min(min(q.x, asp - q.x), min(q.y, 1.0 - q.y));
  float disc = length(gl_FragCoord.xy - uAtCentre) / max(2.0, uResolution.y);
  float limb = uAtRim / max(2.0, uResolution.y);
  float clear = uAtGlobe > 0.5 ? smoothstep(limb - 0.004, limb + 0.012, disc) : 1.0;
  float baa = 1.15 * pxS;
  float rule1 = 1.0 - smoothstep(0.0016, 0.0016 + baa, abs(ed - 0.1150));
  float rule2 = 1.0 - smoothstep(0.0007, 0.0007 + baa, abs(ed - 0.1450));
  float gap = smoothstep(0.1140, 0.1170, ed) * (1.0 - smoothstep(0.1440, 0.1470, ed));
  float top = 1.0 - smoothstep(0.155, 0.175, min(q.y, 1.0 - q.y));
  float side = 1.0 - smoothstep(0.155, 0.175, min(q.x, asp - q.x));
  float ticks = max(max(atRuling(q.x, 0.0240, 0.0, 0.34) * top, atRuling(q.y, 0.0240, 0.0, 0.34) * side),
                    max(atRuling(q.x, 0.1200, 0.0, 0.62) * top, atRuling(q.y, 0.1200, 0.0, 0.62) * side));
  col = mix(col, uAtLineC, clamp(max(rule1, rule2 * 0.75) + ticks * gap * 0.85, 0.0, 1.0) * 0.88 * clear);

  // ---- the days, lettered. Each day's own meridian is labelled where it
  // crosses the equator, in the small roman numerals a plate uses for the hours
  // and the days: update() has already carried those seven points on the sphere
  // onto the sheet, and what is left is to set the numerals flat, as a printer
  // sets type, and to let them shrink and go as the day turns to the limb.
  float letters = 0.0, lettersHalo = 0.0;
  if (uAtGlobe > 0.5) {
    float box = clamp(0.0260 + uAtLet, 0.010, 0.060) * uResolution.y;
    for (int i = 0; i < 7; i++) {
      vec3 a = uAtDay[i];
      if (a.z > 0.02) {
        vec2 g = (gl_FragCoord.xy - a.xy) / box - vec2(1.05, 0.55);   // clear of its own meridian
        float sdf = atNumeral(g, float(i + 1)) * box;
        float held = smoothstep(0.12, 0.34, a.z);
        letters = max(letters, clamp(sdf + 0.5, 0.0, 1.0) * held);
        lettersHalo = max(lettersHalo, clamp(sdf / 2.6 + 0.7, 0.0, 1.0) * held);
      }
    }
  }
  // A numeral over dark ground is lettered on a knocked-out patch of the sheet,
  // as a printer sets type on a busy plate: the darker the ground under it, the
  // more paper the letter takes with it.
  float under = 1.0 - clamp(dot(col, W) * 1.6, 0.0, 1.0);
  col = mix(col, uAtSheetC, lettersHalo * mix(0.32, 0.66, under));
  col = mix(col, uAtLineC, letters * 0.90);

  // ---- the foxing, last, because it grew on the print and not under it: the
  // rust freckles a damp sheet throws, each with the soft ring of browned paper
  // round it, thinned over the places the sheet stayed dry. It is a field and not
  // a grid of cells — a freckle's place is wherever the paper was damp, which is
  // nowhere in particular, and a grid would show its edges through the spots.
  float fld = atN2(q * 34.0 + seed * 71.0) * 0.58 + atN2(q * 78.0 + 29.0) * 0.42
            + (atN2(q * 6.2 + seed * 5.0) - 0.5) * 0.16;
  float foxA = clamp(0.55 + uAtFox, 0.0, 1.4);
  float fox = smoothstep(0.645, 0.715, fld);
  float halo = smoothstep(0.545, 0.640, fld) * (1.0 - fox);
  vec3 rust = mix(uAtRedC, uAtSepiaC, 0.30);
  col = mix(col, rust, fox * 0.34 * foxA);
  col = mix(col, mix(col, rust, 0.35), halo * 0.30 * foxA);

  col *= 1.0 + (tooth - 0.5) * 0.045;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`,
  uniforms(ctx = {}) {
    // A dial comes from params.js as `print.atlas.graticule` when it is there at
    // all, and from the bare name otherwise. Either way it is an offset from the
    // plate this module ships, so an absent entry and a 0 both change nothing.
    const dial = (name, fallback) => {
      const p = ctx?.dials;
      const value = p?.[`print.atlas.${name}`] ?? p?.[name];
      return typeof value === 'number' ? value : fallback;
    };
    // The plate's own pigments, mixed here rather than in the shader: every
    // print re-dyes the week's frame in its own hand, and this one dyes it as an
    // old sheet — warm paper, a brown-black ink, a hypsometric ramp with sepia
    // under the low ground and ochre over the tops, a pale blue for the water.
    // The week keeps its weather through all of it: the paper is its own, the
    // ink is its own, and the ochre is pulled from its own rock.
    const at = (value, hex) => {
      if (value && typeof value.r === 'number') return { x: value.r, y: value.g, z: value.b };
      return { x: (hex >> 16) / 255, y: ((hex >> 8) & 255) / 255, z: (hex & 255) / 255 };
    };
    const mix3 = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
    const pal = ctx?.palette || {};
    const paper = at(pal.paper, 0xf1e9d6);
    const ink = at(pal.ink, 0x1f1c1a);
    const rock = at(pal.landMid || pal.land, 0xb08a5e);
    const water = at(pal.seaShallow || pal.seaDeep || pal.sea, 0x9fb4c4);
    const deep = at(pal.seaDeep, 0x5a7f9c);
    const red = at(pal.vermilion, 0xa8442e);
    return {
      // The plate's pigments, as plain vectors: three uploads .x/.y/.z without
      // this module having to hold a THREE of its own.
      uAtSheetC: { value: mix3(paper, { x: 0.975, y: 0.940, z: 0.860 }, 0.52) },   // the aged sheet
      uAtLineC: { value: mix3(ink, { x: 0.330, y: 0.215, z: 0.135 }, 0.42) },     // the engraved line
      // The land's own two ends. A plate is read by the gap between its ink and
      // its fill, and an antique plate is read by how much paper is left inside
      // that gap: the sepia under the low ground is therefore carried a good way
      // off the ink — a brown-black varnish under the country buries whatever the
      // burin cut in it, and a plate whose whole middle is one tarnish reads as a
      // dirtied globe rather than as an engraving. The ochre over the tops is
      // lifted toward the sheet for the same reason, and the line between them
      // stays the darkest thing on the plate.
      uAtSepiaC: { value: mix3(mix3(mix3(ink, { x: 0.470, y: 0.310, z: 0.175 }, 0.62), paper, 0.14), rock, 0.20) },
      uAtOchreC: { value: mix3(mix3(mix3(paper, { x: 0.845, y: 0.660, z: 0.330 }, 0.58), ink, 0.04), rock, 0.18) },
      uAtSeaC: { value: mix3(mix3(water, { x: 0.610, y: 0.740, z: 0.865 }, 0.34), paper, 0.22) },   // the pale blue wash
      uAtSeaInkC: { value: mix3(mix3(deep, { x: 0.250, y: 0.385, z: 0.545 }, 0.32), ink, 0.14) },   // the ruling's own blue
      uAtRedC: { value: mix3(red, { x: 0.700, y: 0.280, z: 0.200 }, 0.35) },
      // The globe: update() fills these every frame, and the eye is where the
      // sheet's rays start. The zeros here are what a print that is never
      // updated gets — a plate with the globe left off it, not a crash.
      uAtCentre: { value: { x: 0, y: 0 } },
      uAtEye: { value: { x: 0, y: 0, z: 0 } },
      uAtCamR: { value: { x: 1, y: 0, z: 0 } },
      uAtCamU: { value: { x: 0, y: 1, z: 0 } },
      uAtCamF: { value: { x: 0, y: 0, z: -1 } },
      uAtSun: { value: { x: 0, y: 0, z: 1 } },
      uAtF: { value: 1 },
      uAtRho: { value: 120 },
      uAtRim: { value: 0 },
      uAtGlobe: { value: 0 },
      uAtDay: { value: new Float32Array(21) },
      // The dials: an offset each, and every one of them zero at the plate this
      // module ships.
      uAtGr: { value: dial('graticule', 0) },     // degrees between meridians, on top of 15
      uAtBand: { value: dial('bands', 0) },       // hypsometric steps, on top of 5
      uAtCont: { value: dial('contours', 0) },    // contour lines to a step, on top of 4
      uAtSeaD: { value: dial('sea', 0) },         // how hard the sea is ruled
      uAtFox: { value: dial('foxing', 0) },       // how far the sheet has gone rusty
      uAtNight: { value: dial('night', 0) },      // the hatch over the dark half
      uAtLet: { value: dial('letters', 0) },      // the size of the day numerals
    };
  },
  /**
   * The globe, carried onto the sheet. Seven numbers have to change with the
   * camera and not with the frame: the disc's centre in device pixels, the
   * disc's radius for a sphere of radius + sea level, the camera's own right,
   * up and forward in world space, and the pixels-per-tan the rays are cast
   * with. The centre comes from projecting the world's origin, which is where
   * this app always stands its planet; the radius is the projection of a sphere
   * — f·ρ/√(d²−ρ²), the same circle the pass's own wash draws its sea on — and
   * it is the disc the print refuses to draw inside of when the eye is at or
   * under the surface, which is what keeps a walk on the planet from being
   * lettered as a globe.
   */
  update(ctx, uniforms) {
    const T = ctx?.THREE;
    const camera = ctx?.camera;
    const day = uniforms.uAtDay.value;
    if (!T || !camera || !camera.isCamera) { uniforms.uAtGlobe.value = 0; day.fill(0); return; }
    if (!scratch.point) {
      scratch.point = new T.Vector3();
      scratch.v = new T.Vector3();
      scratch.eye = new T.Vector3();
      scratch.normal = new T.Vector3();
    }
    const res = uniforms.uResolution.value;
    const eye = camera.position;
    uniforms.uAtEye.value.x = eye.x;   // the rays on the sheet start at the eye
    uniforms.uAtEye.value.y = eye.y;
    uniforms.uAtEye.value.z = eye.z;
    const rho = (typeof ctx.radius === 'number' ? ctx.radius : 120) + (ctx.seaLevel || 0);
    const dist = eye.length();
    const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
    const f = (res.y * 0.5) / Math.max(1e-6, tanHalf);   // device pixels per unit of tan
    const front = dist > rho * 1.02;

    scratch.point.set(0, 0, 0).project(camera);          // the globe's centre on the sheet
    uniforms.uAtCentre.value.x = (scratch.point.x * 0.5 + 0.5) * res.x;
    uniforms.uAtCentre.value.y = (scratch.point.y * 0.5 + 0.5) * res.y;
    uniforms.uAtF.value = f;
    uniforms.uAtRho.value = rho;
    uniforms.uAtRim.value = front ? (f * rho) / Math.sqrt(Math.max(1e-3, dist * dist - rho * rho)) : 0;
    uniforms.uAtGlobe.value = front ? 1 : 0;

    // the camera's basis, in the world's own terms: the ray a pixel is cast
    // with is one of these three and two tangents of the sheet
    scratch.v.setFromMatrixColumn(camera.matrixWorld, 0);
    uniforms.uAtCamR.value.x = scratch.v.x;
    uniforms.uAtCamR.value.y = scratch.v.y;
    uniforms.uAtCamR.value.z = scratch.v.z;
    scratch.v.setFromMatrixColumn(camera.matrixWorld, 1);
    uniforms.uAtCamU.value.x = scratch.v.x;
    uniforms.uAtCamU.value.y = scratch.v.y;
    uniforms.uAtCamU.value.z = scratch.v.z;
    scratch.v.setFromMatrixColumn(camera.matrixWorld, 2).negate();
    uniforms.uAtCamF.value.x = scratch.v.x;
    uniforms.uAtCamF.value.y = scratch.v.y;
    uniforms.uAtCamF.value.z = scratch.v.z;
    const sun = ctx.light?.value;
    if (sun) {
      uniforms.uAtSun.value.x = sun.x;
      uniforms.uAtSun.value.y = sun.y;
      uniforms.uAtSun.value.z = sun.z;
    }

    // the seven days: each on its own meridian, at the equator, with how much
    // of it faces us — a day carried round to the far side is not lettered
    const dayLon = ctx.features?.dayLon ?? (Math.PI * 2) / 7;
    for (let d = 0; d < 7; d++) {
      const lon = d * dayLon;
      scratch.point.set(Math.cos(lon) * rho, 0, Math.sin(lon) * rho);
      scratch.normal.copy(scratch.point).divideScalar(rho);
      const facing = front
        ? scratch.normal.dot(scratch.eye.copy(eye).sub(scratch.point).normalize())
        : -1;
      scratch.point.project(camera);
      day[d * 3] = (scratch.point.x * 0.5 + 0.5) * res.x;
      day[d * 3 + 1] = (scratch.point.y * 0.5 + 0.5) * res.y;
      day[d * 3 + 2] = facing;
    }
  },
};

/** Scratch for update(): a per-frame allocation is a per-frame allocation. */
const scratch = {
  point: null, v: null, eye: null, normal: null,
};

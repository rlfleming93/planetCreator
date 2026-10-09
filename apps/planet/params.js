/* Planet Creator — tuning parameters.
 *
 * The painter used to keep every useful dial beside the formula it shaped. That
 * made the picture easy to read but slow to tune: a comparison meant editing a
 * module, refreshing it and remembering what changed. This file is the one flat
 * catalogue the private tuning bench can vary. The generator still reads each
 * value at its old formula; this module only validates the three override paths
 * and gives them a stable, shareable encoding.
 *
 * Precedence is deliberately explicit: checked-in defaults, an embedding page's
 * window.PLANET_PARAMS, one packed URL object, then repeatable ?p.<key>= values.
 * A malformed or unknown dial can therefore never become a new property that a
 * typo quietly appears to tune.
 */

const number = (key, group, value, min, max, step, note) => ({ key, group, default: value, min, max, step, note });
const colour = (key, group, value, note) => ({ key, group, default: value, min: null, max: null, step: null, note });
// A named dial: one of a list of ids. The list is a literal here and complete,
// so a name outside it is a typo: it is reported where it is read and the dial
// keeps what it had.
const choice = (key, group, value, options, note) => ({ key, group, default: value, min: null, max: null, step: null, options: [...options], note });

// The world archetypes a URL, the bench or an embedding page may name. The
// literal lives here because this module is also loaded on its own (the bench
// does); worlds/index.js loads exactly these and throws at load if the two
// ever drift apart, since a page may name any of them before the registry has
// been read.
export const WORLD_ARCHETYPES = ['auto', 'classic', 'moon', 'tundra', 'mesa', 'archipelago', 'foundry', 'caldera', 'commons'];
// The bodies a week can be (bodies/index.js): rock is today's planet.
export const WORLD_BODIES = ['rock', 'auto', 'marble', 'giant', 'ice', 'star', 'lava', 'blackhole'];

export const SPEC = [
  choice('world.archetype', 'world', 'classic', WORLD_ARCHETYPES, 'World archetype: classic, or auto to let the week pick the world that fits it best.'),
  choice('world.body', 'world', 'auto', WORLD_BODIES, 'What kind of body the week is in space: rock (a rocky planet), a marble, a gas or ice giant, a race week\'s crowned world (star), a lava world, a black hole (only when named), or auto (the default) to let the week\'s size and character choose.'),
  number('star.look', 'world', 2, 0, 4, 1, 'How the race week\'s body (bodies/star.js) is drawn: 2 (the default) the week\'s own rock world crowned by an aurora, 0 the first star, 1 a painted star, 3 the rock world eclipsing its own close sun, 4 the rock world in black lacquer and gold.'),
  number('world.dayMass', 'world', 0, 0, 1, 0.01, 'Blend of the day-mass field into the classic baseline: the week is the continent.'),
  number('world.lineage', 'world', 0, 0, 1, 0.01, 'Blend of the date-derived macro noise neighbouring weeks share into the continental term.'),
  number('world.contAmp', 'world', 5, 0, 20, 0.1, 'Continental relief in world units.'),
  number('world.contFreq', 'world', 1.5, 0.2, 6, 0.05, 'Continental noise frequency across the globe.'),
  number('world.baseAmp', 'world', 1.5, 0, 10, 0.1, 'Baseline fine terrain relief.'),
  number('world.roughAmp', 'world', 2.5, 0, 10, 0.1, 'Extra fine relief supplied by a hard week.'),
  number('world.baseFreq', 'world', 1.6, 0.2, 6, 0.05, 'Fine terrain noise frequency.'),

  number('climate.tempScale', 'climate', 30, 1, 60, 0.5, 'Temperature divisor that normalizes recorded Celsius into 0–1 warmth.'),
  number('climate.warmthFallback', 'climate', 0.5, 0, 1, 0.01, 'Warmth when no activity has a temperature.'),
  number('climate.seasonFallback', 'climate', 0, 0, 1, 1, 'Warmth when no activity has a temperature falls to the calendar month (northern hemisphere) instead of climate.warmthFallback.'),
  number('climate.roughFallback', 'climate', 0.4, 0, 1, 0.01, 'Roughness when no heart-rate zones exist.'),
  number('climate.energyScale', 'climate', 1000, 100, 5000, 25, 'Training load that maps to energy 1.'),
  number('climate.oceanAnchorL', 'climate', 6.302, 0.1, 20, 0.1, 'Race-week sweat anchor in litres.'),
  number('climate.oceanAnchorFrac', 'climate', 1 - 6.302 / 12, 0.05, 0.95, 0.005, 'Ocean fraction at the sweat anchor.'),
  number('climate.oceanMin', 'climate', 0.2, 0, 0.45, 0.01, 'Smallest allowed ocean fraction.'),
  number('climate.oceanMax', 'climate', 0.7, 0.5, 1, 0.01, 'Largest allowed ocean fraction.'),

  number('terrain.warp', 'terrain', 0.35, 0, 1, 0.01, 'Route-flank domain-warp amplitude.'),
  number('terrain.warpFreq', 'terrain', 3, 0.2, 12, 0.1, 'Route-flank warp frequency.'),
  number('terrain.alongFreq', 'terrain', 12, 1, 40, 0.5, 'Summit frequency along a route.'),
  number('terrain.envFreq', 'terrain', 2.6, 0.2, 12, 0.1, 'Broad summit-envelope frequency.'),
  number('terrain.detailFreq', 'terrain', 26, 1, 80, 1, 'Spur and gully detail frequency.'),
  number('terrain.ampKnee', 'terrain', 25, 5, 60, 0.5, 'Range height where climb begins compressing.'),
  number('terrain.rangeAmp', 'terrain', 0.4, 0.05, 1, 0.01, 'Climb-to-range-height multiplier.'),
  number('terrain.rangePow', 'terrain', 0.68, 0.2, 1.2, 0.01, 'Climb-to-range-height exponent.'),
  number('terrain.rangeWidth', 'terrain', 0.1, 0.02, 0.3, 0.005, 'Route span used as mountain width.'),
  number('terrain.detailAmp', 'terrain', 0.18, 0, 0.5, 0.01, 'Erosion detail as a share of range height.'),
  number('terrain.valleyAmp', 'terrain', 0.22, 0.02, 0.8, 0.01, 'Climb-to-valley-depth multiplier.'),
  number('terrain.valleyWidth', 'terrain', 0.06, 0.01, 0.2, 0.005, 'Route span used as valley width.'),
  number('terrain.rivers', 'terrain', 0, 0, 1, 0.01, 'Drainage: rivers cut from the high ground to the sea, wide enough to read from orbit.'),
  number('terrain.spines', 'terrain', 0, 0, 1, 0.01, 'Mountain spines along plate seams of the continental field.'),
  number('terrain.coast', 'terrain', 0, 0, 1, 0.01, 'Fractal coastline detail: capes, bays and offshore islets.'),

  number('kinds.lagoon.radiusBase', 'kinds', 7, 2, 15, 0.1, 'Lagoon base radius.'),
  number('kinds.lagoon.radiusDistance', 'kinds', 0.16, 0, 0.5, 0.01, 'Lagoon radius gained from swim distance.'),
  number('kinds.lagoon.radiusTimeDiv', 'kinds', 2400, 300, 10000, 100, 'Active seconds per extra lagoon-radius unit.'),
  number('kinds.lagoon.depthBase', 'kinds', 8, 2, 15, 0.1, 'Lagoon base depth.'),
  number('kinds.lagoon.depthDistance', 'kinds', 0.14, 0, 0.5, 0.01, 'Lagoon depth gained from swim distance.'),
  number('kinds.spires.countSeconds', 'kinds', 900, 300, 3600, 60, 'Seconds of strength work per fallback spire.'),
  number('kinds.spires.heightK', 'kinds', 1.8, 0, 5, 0.1, 'Lifted-volume contribution to spire height.'),
  number('kinds.spires.loadK', 'kinds', 0.36, 0, 1, 0.01, 'Training-load contribution to spire height.'),
  number('kinds.wheel.radius', 'kinds', 2.05, 0.5, 6, 0.05, 'Indoor-cycle wheel radius.'),
  number('kinds.wheel.spokes', 'kinds', 8, 3, 20, 1, 'Indoor-cycle wheel spoke count.'),
  number('kinds.cairn.timeDiv', 'kinds', 7200, 900, 20000, 100, 'Active seconds per cairn scale unit.'),
  number('kinds.cairn.loadDiv', 'kinds', 18, 3, 60, 1, 'Training-load divisor for cairn scale.'),
  number('kinds.cairn.scaleMax', 'kinds', 2.05, 1.1, 4, 0.05, 'Largest cairn scale.'),
  number('kinds.constructed.scale', 'kinds', 1.8, 0.5, 4, 0.05, 'Constructed treadmill landmark scale.'),
  number('kinds.pitch', 'kinds', 0, 0, 1, 1, 'Football sessions lay out a mown pitch with goals instead of a stacked-stone cairn.'),
  number('kinds.pitch.spanBase', 'kinds', 14, 6, 40, 0.5, 'Pitch length, goal to goal, before any recorded football time.'),
  number('kinds.pitch.spanK', 'kinds', 9, 0, 24, 0.5, 'Pitch-length units gained per root hour of football.'),
  number('kinds.pitch.spanMax', 'kinds', 30, 8, 60, 0.5, 'Longest pitch any session lays out.'),

  colour('pal.coast.landMidCold', 'pal', '#a2733f', 'Cool endpoint of the coast mid-ground wash.'),
  colour('pal.coast.landMidWarm', 'pal', '#bd8c48', 'Warm endpoint of the coast mid-ground wash.'),
  colour('pal.coast.skyWashCold', 'pal', '#93a6c4', 'Cool endpoint of the coast sky wash.'),
  colour('pal.coast.skyWashWarm', 'pal', '#9eadc0', 'Warm endpoint of the coast sky wash.'),
  colour('pal.desert.landMid', 'pal', '#d08a5c', 'Desert family mid-ground wash.'),
  colour('pal.desert.skyWash', 'pal', '#a9c6d6', 'Desert family sky wash.'),
  colour('pal.chalk.landMid', 'pal', '#dcaa66', 'Chalk family mid-ground wash.'),
  colour('pal.chalk.skyWash', 'pal', '#afcacc', 'Chalk family sky wash.'),
  colour('pal.alpine.landMid', 'pal', '#8d97a8', 'Alpine family mid-ground wash.'),
  colour('pal.alpine.skyWash', 'pal', '#bac8cc', 'Alpine family sky wash.'),
  colour('pal.highland.landMid', 'pal', '#9e8d53', 'Highland family mid-ground wash.'),
  colour('pal.highland.skyWash', 'pal', '#b2bcb4', 'Highland family sky wash.'),
  colour('pal.dusk.landMid', 'pal', '#a8706a', 'Dusk family mid-ground wash.'),
  colour('pal.dusk.skyWash', 'pal', '#b6a4c0', 'Dusk family sky wash.'),
  number('pal.hazeMix', 'pal', 1, 0, 1, 0.01, 'Strength of the hot-family haze over the ordinary sky wash.'),
  colour('pal.accentStrength', 'pal', '#3b4a8c', 'Strength-session mineral accent.'),
  colour('pal.accentSwim', 'pal', '#2e9490', 'Swimming mineral accent.'),
  colour('pal.accentRide', 'pal', '#9a4b35', 'Cycling mineral accent.'),
  colour('pal.accentSport', 'pal', '#5f8f6a', 'Other-sport mineral accent.'),

  number('craft.limb', 'craft', 0, 0, 1, 1, 'Smooth orbit silhouette: displacement eases to the macro height toward the limb.'),
  number('craft.paper', 'craft', 0, 0, 1, 0.01, 'Reserved paper moves from the lit face to a crescent on the lit limb.'),
  number('craft.values', 'craft', 0, 0, 1, 0.01, 'Value structure: three separated value masses, one of them a committed dark.'),
  number('craft.palettes', 'craft', 0, 0, 1, 1, 'The widened palette family table, with fewer warm tans.'),
  number('craft.frame', 'craft', 0, 0, 1, 1, 'Poster framing picks the best of 12 deterministic directions and keeps the whole disc, companions included, inside the shelf crop.'),

  choice('look.print', 'look', 'auto', ['ink', 'riso', 'woodblock', 'etching', 'gouache', 'moebius', 'mosaic', 'atlas', 'nocturne', 'pointillist', 'auto'], 'Final pass over the finished ink frame: ink (none), a print id, or auto (the default) for the hand that flatters the week\'s own world, the ink frame for every body, and a woodblock over the worlds that kept a race.'),
  number('light.terminator', 'look', 0, 0, 1, 0.01, 'From orbit the globe takes the real sun: a painted terminator and an ink-washed night side.'),
  number('light.night', 'look', 0, 0, 1, 0.01, 'How deep the night light.terminator paints: 0 is its light cool wash, 1 a deep ink night with the ground\'s hues gone, and the light left free to stand behind the world, so a sun past the limb leaves a true crescent.'),
  number('light.atmosphere', 'look', 1, 0, 1, 0.01, 'The world\'s air at its limb: on paper a thin washed band, on deep space a luminous painted rim, brightest sunward, with dusk where it meets the terminator.'),
  number('light.scatter', 'look', 1, 0, 1, 0.01, 'The air seen across the globe from orbit, not only at its edge: a graded glaze of the week\'s blue gathered toward the lit limb, the warm of a low sun on the ground and weather where the light turns, and the side turned away sunk into the air\'s deep blue instead of a grey. 0 is the face round 12 left.'),
  number('sea.glint', 'look', 1, 0, 1, 0.01, 'The sun\'s own image on the orbit\'s water: a pale warm sheen where the light is mirrored to the eye, the sheet reserved in broken dabs at its heart, the sky the water mirrors gathered toward the lit limb, and the open ocean far from any shore deepened into the week\'s own blue.'),
  number('body.form', 'look', 1, 0, 1, 0.01, 'The giants\' own light: a gas or ice giant\'s deck turns from the light across its whole face, its shade side sunk into the week\'s deep cool instead of a grey, the warm of a low sun along the turn, and an ice giant\'s haze gathered on its lit limb, so the disc reads as a ball of air in a light and not a pale coin.'),
  number('giant.eddies', 'look', 1, 0, 1, 0.01, 'Where a gas giant\'s belt shears against the zone beside it the edge rolls up into eddies, a hook here and a curl there, wound out of the belts\' own wash.'),
  number('giant.storms', 'look', 1, 0, 1, 0.01, 'A gas giant\'s storms stand in the flow and drag it: each turns the belt\'s own wash round itself into an elliptical vortex, the week\'s longest session the one great spot in the week\'s warm pigment and the others quiet pale ovals, and the flow\'s fine filaments gather where it shears, along a belt\'s edges and a storm\'s rim, leaving the broad zones calm. 0 keeps the earlier soft ovals.'),
  number('lava.fractures', 'look', 1, 0, 1, 0.01, 'A lava world\'s melt is drawn at the size it stands on the screen, not by the camera\'s distance: through a long lens or from close in the joints are fine hot fractures, a narrow pale core inside an ember margin with the brightest melt kept for a few of them, and no soft stains. 0 keeps the earlier glow.'),
  number('sky.cloudShade', 'look', 1, 0, 1, 0.01, 'Underfoot each mass the sky paints lays its shadow on the far plain below it: one broad cool wash at the cloud\'s own bearing, drifting with it, starting well past the runner so it never blots the foreground. An airless sky casts none; nothing from orbit, where the cloud sheet casts its own.'),
  number('light.form', 'look', 1, 0, 1, 0.01, 'The globe turns inside its three values: a cool half-tone graded by the painted light across the disc and by the ground\'s own slopes, kept on a crescent\'s lit face under a real terminator; an ice giant\'s bright limb narrowed and only on its lit side; a marble\'s craters lit by the same light, their walls graded so a bowl reads as a bowl.'),
  number('sky.cloudDepth', 'look', 1, 0, 1, 0.01, 'The orbit\'s clouds as depth and not cut paper: a thin edge laid wet is a veil the land reads through, a dried edge and a loaded core hold their white, one broad half-tone of the week\'s cool turns each mass from the light, and dried pigment stays on a few crisp stretches instead of a dark line round every mass.'),
  number('light.aerial', 'look', 1, 0, 1, 0.01, 'Underfoot the distance is fitted to this small world\'s own horizon: the ground near the runner keeps all its strength, the middle distance gives up some chroma and takes a little cool glaze, the far ranges go pale and close in value with lighter rims, creases and contour lines, and the sky\'s broad washes lose their continuous outlines.'),
  number('pal.caps', 'look', 0, 0, 1, 0.01, 'Reserved paper means something: polar caps and snow on the heights, set by the week\'s warmth, instead of pale slabs.'),
  number('sky.space', 'look', 1, 0, 1, 0.01, 'From orbit the sheet behind the globe becomes deep space: a painted void, stars, the galaxy\'s band, a nebula\'s glow. 0 keeps the paper.'),
  number('system.sun', 'look', 1, 0, 1, 1, 'The week\'s own star stands in the frame, its colour from the hour the week trained at.'),
  number('system.phenomena', 'look', 1, 0, 1, 1, 'The rarer things a week can earn in its sky: a second sun, a comet, an asteroid belt.'),
  number('system.light', 'look', 1, 0, 1, 0.01, 'The week\'s star as a source of light and not a diagram: one loaded warm wash with its middle lifted soft, an irregular edge crisp here and eased there, a few unequal fans of light instead of a wheel of spokes, a quiet week\'s halo kept to one restrained broken arc, and the lens\'s graze kept close to the light. 0 is the star round 12 left.'),
  number('system.comet', 'look', 1, 0, 1, 0.01, 'The comet as a body of light: a tiny pale nucleus in a round coma, the dust tail a curved fan that widens as it goes and thins away to nothing, one thinner and cooler ion thread beside it. 0 is the comet round 12 left.'),
  number('sky.ridge', 'look', 1, 0, 1, 0.01, 'Deep space with fewer veils: the galaxy gathered into one irregular loaded ridge with real dark gaps through it, its wide skirt and the nebulae\'s outer haze let go into the void, and a quiet passage of sky kept beside the planet. 0 is the space round 12 left.'),
  choice('poster.shot', 'look', 'auto', ['classic', 'crescent', 'horizon', 'telephoto', 'hero', 'crescent-hero', 'ember', 'cloudsea', 'auto'], 'How the poster frames the globe: classic, a crescent filling the frame, a low-orbit horizon, a long-lens telephoto, a hero shot with its system, or auto (the default: the week chooses). Three hero looks are named only: crescent-hero (the night side, the globe large and off the middle, its ring leaving the frame), ember (a long lens across the terminator, the globe overfilling the frame), cloudsea (landed: the runner small at the low-sun site under a level horizon, the sky\'s moon over the right third).'),
  number('sky.orbitClouds', 'look', 1, 0, 1, 0.01, 'The orbit\'s weather (ink-clouds.js): a cyclone on stormy weeks, fronts, cumulus, cloud streets and cirrus, sized by the week\'s sweat and warmth, casting shadow on the ground. 0 is a clear sky.'),
  number('life.amount', 'look', 1, 0, 1, 0.01, 'The week\'s life on the world, from orbit and underfoot (life.js): plankton, birds, herds, forests, reefs, town lights, drifters on the giants. 0 is a world without it.'),

  number('sky.bandHeat', 'sky', 0.35, 0, 1, 0.01, 'Heat lift from the horizon band toward paper.'),
  number('sky.cloudHeat', 'sky', 0.3, 0, 1, 0.01, 'Heat tint applied beneath clouds.'),
  number('sky.glazeEase', 'sky', 0.08, 0, 0.3, 0.005, 'Open-sky glaze lift from an easy week.'),
  number('sky.glazeWet', 'sky', 0.06, 0, 0.3, 0.005, 'Heavy-sky glaze added by wet air.'),
  number('sky.cloudSweat', 'sky', 0.18, 0, 0.5, 0.01, 'Cloud-size exponent from weekly sweat.'),
  number('sky.heatHaze', 'sky', 0.06, 0, 0.3, 0.005, 'Heat-haze height.'),

  number('motion.cloudRate', 'motion', 0, -0.2, 0.2, 0.001, 'Cloud drift around the horizon in radians per second.'),
  number('motion.waterRate', 'motion', 0, -0.2, 0.2, 0.001, 'Water wash drift in noise-space units per second.'),
  number('motion.orbitRate', 'motion', 0.035, -0.2, 0.2, 0.001, 'Automatic orbit yaw in radians per second.'),
  number('motion.living', 'motion', 1, 0, 1, 0.01, 'Living painting: as time runs the lit sea glitters and its washes drift, a swell crosses the water underfoot, the weather drifts and evolves — orbit sheet and sky both — and the terminator edge breathes, while the paper the picture is on never moves. All of it is read off the clock alone, so a capture at t is the same frame every time; at 0 this is the still sheet, to the pixel. The same clock is handed to any print or body pass that asks for it: four beats — settlements\' glow, aurora, sea glitter, edge breath.'),

  number('companions.race', 'companions', 1, 0, 1, 1, "The race drawn round the globe on race weeks, in any world: one ringlet per split of the race, a division at its half and at its wall, the finish in the race line's vermilion. The poster pulls back to fit it."),
  number('companions.ringTilt', 'companions', 1, 0, 1, 0.05, "The ring's plane: 0 lies in the plane the course itself fits (loud from the poster, hidden from the runner's own sky), 1 opens it until it arches over the runner and the poster sees an open ellipse."),
  number('companions.ringBands', 'companions', 1, 0, 1, 0.05, "How finely the race's own banding is drawn: one ringlet per kilometre at 1, the race's splits alone at 0."),
  number('companions.ringShadow', 'companions', 1, 0, 1, 0.05, "The planet's shadow laid across the rings, and the rings' banded shadow laid on the ground under them."),
  choice('companions.ringStyle', 'companions', 'saturn', ['splits', 'saturn', 'rubble', 'track', 'orrery', 'aurora'], 'How the race is drawn round the globe: saturn (the default), splits (the ringlet-per-split ring), rubble, track, orrery or aurora.'),
  number('companions.ringDust', 'companions', 0.7, 0, 1, 0.05, "The dust drift beyond the last ringlet, and the shimmer of the grains in it as the light catches them."),
  number('companions.ringMass', 'companions', 1, 0, 1, 0.01, "The ring read as one immense sheet before its trim: the ringlets gathered into one broad light mass with a few real dark divisions and the vermilion finish, fewer luminous hairlines and less of the even outer haze, the dense bands opaque and the dusty ones letting the sky through. 0 is the ring round 12 left."),

  number('camera.fov', 'camera', 45, 25, 80, 1, 'Perspective field of view in degrees.'),
  number('camera.fill', 'camera', 0.68, 0.3, 0.95, 0.01, 'Planet diameter as a fraction of the short viewport axis.'),
  number('camera.chaseDist', 'camera', 10.9, 4, 25, 0.1, 'Default chase-camera distance.'),
  number('camera.chasePitch', 'camera', 0.34, -0.1, 1, 0.01, 'Default chase-camera elevation in radians.'),

  number('runner.walk', 'runner', 3.4, 0.5, 8, 0.1, 'Walking speed in world units per second.'),
  number('runner.sprint', 'runner', 6.6, 1, 15, 0.1, 'Sprint speed in world units per second.'),
  number('runner.cadenceWalk', 'runner', 0.9, 0.2, 4, 0.05, 'Walking stride cycles per second.'),
  number('runner.cadenceRun', 'runner', 2, 0.2, 4, 0.05, 'Sprint stride cycles per second.'),
  number('runner.liftWalk', 'runner', 0.05, 0, 0.8, 0.01, 'Walking sole lift.'),
  number('runner.liftRun', 'runner', 0.46, 0, 0.8, 0.01, 'Sprint sole lift.'),
  number('runner.bobWalk', 'runner', 0.012, 0, 0.15, 0.001, 'Walking pelvis bob.'),
  number('runner.bobRun', 'runner', 0.035, 0, 0.15, 0.001, 'Sprint pelvis bob.'),
  number('runner.look', 'runner', 2, 0, 2, 1, 'The figure we play as: 2 (the default) sculpted (one continuous skinned body with a face, a full ginger beard, a sleeve tattoo, proper hands and running shoes, the cloth folding with his stride, the arms swung from the shoulder), 1 drawn (tube limbs, a singlet with folds, a weighted ink contour), 0 the blocky figure as it was; read when he is built.'),

  number('sun.fromHours', 'sun', 0, 0, 1, 1, 'Use the active-time-weighted mean training hour to place the sun.'),
  number('sun.utcOffsetH', 'sun', -4, -12, 14, 0.25, 'Training-clock offset from UTC when share data has no timezone.'),
  number('sun.strength', 'sun', 0, 0, 1, 0.01, 'Blend from the established key light toward the training-hour direction.'),

  number('breath.sea', 'breath', 0, 0, 1, 0.01, 'Enable week-driven breathing in the open-water wash.'),
  number('breath.seaRate', 'breath', 0, 0, 0.2, 0.001, 'Sea-wash swell cycles per second before the week adjusts it.'),
  number('breath.seaAmp', 'breath', 0, 0, 0.1, 0.001, 'Largest sea-wash travel in noise-space units.'),
  number('breath.clouds', 'breath', 0, 0, 1, 0.01, 'Enable training-load-driven cloud drift.'),
  number('breath.cloudRate', 'breath', 0, 0, 0.05, 0.001, 'Fast-week cloud drift in radians per second.'),
  number('breath.cloudBand', 'breath', 0, 0, 1, 0.01, 'Difference in drift between cloud latitude bands.'),
  number('breath.cadence', 'breath', 0, 0, 0.1, 0.001, 'Run-cadence re-laying distance for reserved-paper sea glints.'),

  number('living.gait', 'living', 0, 0, 1, 1, "Use the week's recorded running cadence for the runner's stride and bob."),
  number('living.wheel', 'living', 0, 0, 1, 1, 'Size indoor-cycle wheels from duration and spin measured-cadence spokes.'),
  number('living.treadmill', 'living', 0, 0, 1, 1, 'Size treadmill belts from duration and scroll their marks from speed.'),
  number('living.grove', 'living', 0, 0, 1, 1, 'Give live yoga-pine crowns a slight duration-shaped sway.'),
  number('living.orbitMarks', 'living', 0, 0, 1, 1, 'Carry simplified activity silhouettes into the distant orbit view.'),
];

export const DEFAULTS = Object.freeze(Object.fromEntries(SPEC.map((entry) => [entry.key, entry.default])));
const BY_KEY = new Map(SPEC.map((entry) => [entry.key, entry]));
const isObject = (value) => {
  if (Object.prototype.toString.call(value) !== '[object Object]') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null
    || (Object.prototype.hasOwnProperty.call(proto, 'constructor') && proto.constructor?.name === 'Object');
};

function valueFor(spec, raw, current) {
  if (spec.options) {
    const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (spec.options.includes(value)) return value;
    console.warn(`Planet params: ${spec.key} has no option ${JSON.stringify(typeof raw === 'string' ? raw : String(raw))}; keeping ${JSON.stringify(current ?? spec.default)}. Options: ${spec.options.join(', ')}.`);
    return null;
  }
  if (spec.min == null) return typeof raw === 'string' && /^#[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : null;
  if (typeof raw !== 'number' && typeof raw !== 'string') return null;
  if (typeof raw === 'string' && !raw.trim()) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return Math.min(spec.max, Math.max(spec.min, value));
}

function mergeInto(target, source, unknown) {
  if (!isObject(source)) return [];
  const changed = [];
  for (const [key, raw] of Object.entries(source)) {
    const spec = BY_KEY.get(key);
    if (!spec) {
      unknown?.add(key);
      continue;
    }
    const value = valueFor(spec, raw, target[key]);
    if (value == null || Object.is(target[key], value)) continue;
    target[key] = value;
    changed.push(key);
  }
  return changed;
}

function base64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function encodeParams(obj) {
  if (!isObject(obj)) throw new TypeError('Planet params must be a plain object');
  return base64(new TextEncoder().encode(JSON.stringify(obj))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function decodeParams(str) {
  const text = String(str || '').replaceAll('-', '+').replaceAll('_', '/');
  const padded = text + '='.repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const value = JSON.parse(new TextDecoder().decode(bytes));
  if (!isObject(value)) throw new TypeError('Encoded planet params must contain an object');
  return value;
}

export const P = { ...DEFAULTS };
const unknown = new Set();
const root = typeof window === 'undefined' ? globalThis : window;

// The boot sources, read once: an embedding page's window.PLANET_PARAMS, one
// packed ?params= object, then repeatable ?p.<key>= values, each later source
// over the ones before it. The choice lists above are complete, so a name
// outside one is a typo and is reported as it is read; an unknown key is
// reported once here and again by applyParams, never as a property of P.
mergeInto(P, root.PLANET_PARAMS, unknown);

const query = new URLSearchParams(globalThis.location?.search || '');
const packed = query.get('params');
if (packed) {
  try {
    mergeInto(P, decodeParams(packed), unknown);
  } catch (error) {
    console.warn('Planet params: ignoring invalid ?params=', error);
  }
}
for (const [name, value] of query) {
  if (name.startsWith('p.')) mergeInto(P, { [name.slice(2)]: value }, unknown);
}
if (unknown.size) console.warn(`Planet params: ignoring unknown keys: ${[...unknown].sort().join(', ')}`);

/** Apply a live partial through the same validation as the boot-time sources. */
export function applyParams(partial) {
  const skipped = new Set();
  const changed = mergeInto(P, partial, skipped);
  if (skipped.size) console.warn(`Planet params: ignoring unknown keys: ${[...skipped].sort().join(', ')}`);
  return changed;
}

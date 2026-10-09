import { estimateStravaMetrics, heartRateZoneSeconds, normalizeRoute } from '../../apps/planet/activity-shape.js';
import { effortFields } from '../../apps/planet/effort.js';
import { garminLines } from '../../apps/planet/strava-mark.js';
import { UUID } from './junction.js';

/* A Garmin workout as Junction gives it (docs: api-reference/data/workouts/get-summary, get-stream) in the shape
 * apps/planet/fit-import.js reads. Junction passes on no workout name and no map for Garmin, so the title is the sport's
 * name and the route comes from the stream's lat/lng, reduced here to a unit-box shape. */
const RACE_NAME = /marathon|half|\b\d+k\b|race|ultra|relay/i;
// Junction publishes no list of sport slugs ("road_biking", "other"…), so a slug is read by what it contains, in the
// words fit-import.js's sports use
const SPORTS = [
  [/swim/, 'swimming'],
  [/run|jog|treadmill/, 'running'],
  [/bik|cycl|ride|spin/, 'cycling'],
  [/hik/, 'hiking'],
  [/walk/, 'walking'],
  [/ellipt|stair/, 'fitness_equipment'],
  [/yoga|pilates|stretch|breath|mobility|meditat|strength|weight|lift|crossfit|hiit|interval|core|barre|boot|cardio|training|workout|gym|fitness/, 'training'],
];

export class InvalidJunctionPayloadError extends Error {}

const number = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const list = (stream, key) => Array.isArray(stream?.[key]) ? stream[key] : [];

export function junctionSport(slug) {
  const value = String(slug || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return SPORTS.find(([pattern]) => pattern.test(value))?.[1] || value || 'other';
}

function positiveAscent(values) {
  let total = 0;
  let previous = null;
  let seen = false;
  for (const raw of values) {
    const value = number(raw);
    if (value == null) {
      previous = null;
      continue;
    }
    if (previous != null) {
      if (value > previous) total += value - previous;
      seen = true;
    }
    previous = value;
  }
  return seen ? total : null;
}

function range(values) {
  let min = Infinity;
  let max = -Infinity;
  for (const raw of values) {
    const value = number(raw);
    if (value == null) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return min === Infinity ? [null, null] : [min, max];
}

function average(values, positiveOnly = false) {
  let total = 0;
  let count = 0;
  for (const raw of values) {
    const value = number(raw);
    if (value == null || (positiveOnly && value <= 0)) continue;
    total += value;
    count++;
  }
  return count ? total / count : null;
}

// Junction's own zones are six: under 50% of max heart rate, then 50–60 … 90%+ (docs: wearables/providers/heart-rate-zones);
// the planet's five start at 50%
function summaryZones(zones) {
  if (!Array.isArray(zones) || zones.length < 6) return null;
  const five = zones.slice(1, 6).map((value) => Math.max(0, number(value) ?? 0));
  return five.some(Boolean) ? five : null;
}

const title = (value) => typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : '';

export function mapJunctionWorkout(workout, stream = null) {
  const id = workout?.id;
  const start = Date.parse(workout?.time_start);
  if (!UUID.test(id ?? '') || !Number.isFinite(start)) throw new InvalidJunctionPayloadError('Junction returned an invalid workout.');
  const sport = junctionSport(workout.sport?.slug);
  const name = title(workout.title) || title(workout.sport?.name) || 'Activity';
  const lat = list(stream, 'lat');
  const lng = list(stream, 'lng');
  const heartRates = list(stream, 'heartrate');
  const times = list(stream, 'time');
  const temperatures = list(stream, 'temperature');
  const [minTempC, maxTempC] = range(temperatures);
  const elapsed = (Date.parse(workout.time_end) - start) / 1000;
  const activity = {
    id: `junction:${id}:0`,
    source: 'garmin',
    estimated: [],
    sport,
    startedAt: new Date(start).toISOString(),
    title: name,
    distanceM: number(workout.distance),
    activeS: number(workout.moving_time) ?? (elapsed > 0 ? elapsed : null),
    ascentM: number(workout.total_elevation_gain) ?? positiveAscent(list(stream, 'altitude')),
    avgHeartRate: number(workout.average_hr),
    maxHeartRate: number(workout.max_hr),
    hrZoneSeconds: (heartRates.length && times.length ? heartRateZoneSeconds(heartRates, times, number(workout.max_hr)) : null)
      ?? summaryZones(workout.hr_zones),
    sweatMl: null,
    minTempC,
    maxTempC,
    avgCadence: average(list(stream, 'cadence'), true), // Junction's cadence is already steps a minute for running
    avgSpeedMps: number(workout.average_speed),
    trainingLoad: null,
    aerobicEffect: null,
    anaerobicEffect: null,
    laps: null,
    strength: null,
    ...normalizeRoute(lat.map((latitude, index) => [latitude, lng[index]])),
    isRace: RACE_NAME.test(name),
  };
  // the same visual proxies a Strava week gets for the values Junction doesn't pass on
  const estimated = estimateStravaMetrics(activity, { averageTempC: average(temperatures) });
  for (const field of ['sweatMl', 'trainingLoad', 'anaerobicEffect']) {
    const value = number(estimated?.[field]);
    if (value == null) continue;
    activity[field] = value;
    activity.estimated.push(field);
  }
  // how the session went, from the same stream (its velocity_smooth and distance), which is then dropped
  return Object.assign(activity, effortFields(activity, {
    hint: `${workout.sport?.slug || ''} ${workout.sport?.name || ''}`,
    series: { t: times, v: list(stream, 'velocity_smooth'), hr: heartRates, d: list(stream, 'distance') },
  }));
}

/** The week's "Garmin [device model]" lines (Garmin's API Brand Guidelines): each model Junction names, or plain
 * "Garmin", since everything Junction sends here was recorded on Garmin devices. */
export function garminDeviceLines(models) {
  const named = models.map((model) => typeof model === 'string' ? model.trim().replace(/^garmin\s*/i, '') : '')
    .filter(Boolean).map((model) => `Garmin ${model}`);
  const lines = garminLines(named);
  return lines.length ? lines : ['Garmin'];
}

import {
  estimateStravaMetrics,
  heartRateZoneSeconds,
  normalizeRoute,
} from '../../apps/planet/activity-shape.js';
import { effortFields } from '../../apps/planet/effort.js';
import { garminLines } from '../../apps/planet/strava-mark.js';

const RACE_NAME = /marathon|half|\b\d+k\b|race|ultra|relay/i;
const WEEK_SECONDS = 7 * 24 * 60 * 60;
const HOUR_SECONDS = 60 * 60;
const MAX_CLOCK_SHIFT_SECONDS = 2 * HOUR_SECONDS; // Antarctica/Troll changes between UTC+0 and UTC+2.

const SPORT_MAP = new Map([
  ['Run', 'running'],
  ['TrailRun', 'running'],
  ['VirtualRun', 'running'],
  ['Ride', 'cycling'],
  ['MountainBikeRide', 'cycling'],
  ['GravelRide', 'cycling'],
  ['VirtualRide', 'cycling'],
  ['EBikeRide', 'cycling'],
  ['Swim', 'swimming'],
  ['Walk', 'walking'],
  ['Hike', 'hiking'],
  ['WeightTraining', 'training'],
  ['Crossfit', 'training'],
  ['Yoga', 'training'],
  ['Pilates', 'training'],
]);

export class InvalidWeekRequestError extends Error {}
export class InvalidStravaPayloadError extends Error {}

const number = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;

// One local week (weeks 1) or `weeks` of them back to back, up to maxWeeks: the Monday it starts on and the visitor's
// own local midnights round it.
export function validateWeekRequest(value, maxWeeks = 1) {
  const week = value?.week;
  const after = value?.after;
  const before = value?.before;
  const weeks = value?.weeks ?? 1;
  const match = typeof week === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(week);
  if (!match || !Number.isSafeInteger(after) || !Number.isSafeInteger(before) || after < 0 || before <= after
      || !Number.isSafeInteger(weeks) || weeks < 1 || weeks > maxWeeks) {
    throw new InvalidWeekRequestError('Choose a valid Monday week.');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const mondayUtc = Date.UTC(year, month - 1, day) / 1000;
  const date = new Date(mondayUtc * 1000);
  const span = weeks * WEEK_SECONDS;
  const duration = before - after;
  if (date.toISOString().slice(0, 10) !== week || date.getUTCDay() !== 1
      || duration < span - MAX_CLOCK_SHIFT_SECONDS || duration > span + MAX_CLOCK_SHIFT_SECONDS) {
    throw new InvalidWeekRequestError('Choose a valid Monday week.');
  }

  // The server cannot know the browser's IANA zone. Plausible whole-minute UTC offsets at both local midnights
  // still bind the supplied label to this interval without pretending UTC is the visitor's calendar.
  const startOffset = mondayUtc - after;
  const endOffset = mondayUtc + span - before;
  if (Math.abs(startOffset) > 14 * HOUR_SECONDS || Math.abs(endOffset) > 14 * HOUR_SECONDS
      || startOffset % 60 !== 0 || endOffset % 60 !== 0 || Math.abs(endOffset - startOffset) > MAX_CLOCK_SHIFT_SECONDS) {
    throw new InvalidWeekRequestError('Choose a valid Monday week.');
  }
  return { week, after, before, weeks };
}

function decodeValue(polyline, cursor) {
  let result = 0;
  let shift = 0;
  while (cursor.index < polyline.length) {
    const value = polyline.charCodeAt(cursor.index++) - 63;
    if (value < 0 || value > 63 || shift > 30) return null;
    result += (value & 0x1f) * 2 ** shift;
    if (value < 0x20) return result % 2 ? -(Math.floor(result / 2) + 1) : Math.floor(result / 2);
    shift += 5;
  }
  return null;
}

export function decodePolyline(polyline) {
  if (typeof polyline !== 'string' || !polyline || polyline.length > 200000) return [];
  const cursor = { index: 0 };
  const points = [];
  let latitude = 0;
  let longitude = 0;
  while (cursor.index < polyline.length) {
    const latitudeDelta = decodeValue(polyline, cursor);
    const longitudeDelta = decodeValue(polyline, cursor);
    if (latitudeDelta == null || longitudeDelta == null) return [];
    latitude += latitudeDelta;
    longitude += longitudeDelta;
    const lat = latitude / 1e5;
    const lng = longitude / 1e5;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return [];
    points.push([lat, lng]);
  }
  return points;
}

function streamData(streams, key) {
  const stream = streams?.[key];
  if (Array.isArray(stream)) return stream;
  return Array.isArray(stream?.data) ? stream.data : [];
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
      const delta = value - previous;
      if (delta > 0) total += delta;
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

export function normalizeStravaSport(value) {
  const original = typeof value === 'string' ? value.trim() : '';
  const known = SPORT_MAP.get(original);
  if (known) return known;
  return original
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase() || 'other';
}

const summaryRoutes = new WeakMap();

function summaryRoute(summary) {
  if (!summary || typeof summary !== 'object') return normalizeRoute([]);
  let route = summaryRoutes.get(summary);
  if (!route) {
    route = normalizeRoute(decodePolyline(summary.map?.summary_polyline));
    summaryRoutes.set(summary, route);
  }
  return route;
}

export function hasUsableSummaryPolyline(summary) {
  return summaryRoute(summary).hasGps === true;
}

export function needsStravaStreams(summary) {
  return summary?.has_heartrate === true || number(summary?.average_heartrate) > 0
    || number(summary?.max_heartrate) > 0 || !hasUsableSummaryPolyline(summary);
}

export function stravaSummaryId(summary) {
  const value = summary?.id;
  const id = typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? String(value)
    : typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value) ? value : null;
  if (!id) throw new InvalidStravaPayloadError('Strava returned an invalid activity.');
  return id;
}

// What a week's Garmin attribution names (Strava API Policy 4.4, Garmin's API Brand Guidelines): each Garmin device's
// model, which Strava has sent in the activity list since October 2025, or plain "Garmin" for an activity from a
// Garmin device (its name, or Garmin Connect's external_id) whose model is missing or won't pass as a model name.
export function garminDevices(summaries) {
  const named = new Set();
  let unnamed = false;
  for (const summary of summaries) {
    const name = typeof summary?.device_name === 'string' ? summary.device_name.trim().replace(/^garmin\b/i, 'Garmin') : '';
    if (/^Garmin\b/.test(name) && garminLines(name).length) named.add(name);
    else if (/^Garmin\b/.test(name) || /^garmin_/i.test(String(summary?.external_id ?? ''))) unnamed = true;
  }
  return named.size ? garminLines([...named]) : unnamed ? ['Garmin'] : [];
}

function startInstant(value) {
  if (typeof value !== 'string') throw new InvalidStravaPayloadError('Strava returned an invalid activity.');
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) throw new InvalidStravaPayloadError('Strava returned an invalid activity.');
  return instant.toISOString();
}

export function mapStravaActivity(summary, streams = null) {
  const id = stravaSummaryId(summary);
  const sport = normalizeStravaSport(summary.sport_type || summary.type);
  const altitude = streamData(streams, 'altitude');
  const temperatures = streamData(streams, 'temp');
  const cadences = streamData(streams, 'cadence');
  const heartRates = streamData(streams, 'heartrate');
  const times = streamData(streams, 'time');
  const streamedRoute = normalizeRoute(streamData(streams, 'latlng'));
  const route = streamedRoute.hasGps ? streamedRoute : summaryRoute(summary);
  const [minTempC, maxTempC] = range(temperatures);
  const summaryAscent = number(summary.total_elevation_gain);
  const rawCadence = average(cadences, true) ?? number(summary.average_cadence);
  const cadenceScale = sport === 'running' || sport === 'walking' ? 2 : 1;
  const workoutType = number(summary.workout_type);
  const title = typeof summary.name === 'string' ? summary.name : '';

  const activity = {
    id: `strava:${id}:0`,
    source: 'strava',
    estimated: [],
    sport,
    startedAt: startInstant(summary.start_date),
    title,
    distanceM: number(summary.distance),
    activeS: number(summary.moving_time) ?? number(summary.elapsed_time),
    ascentM: summaryAscent ?? positiveAscent(altitude),
    avgHeartRate: number(summary.average_heartrate),
    maxHeartRate: number(summary.max_heartrate),
    hrZoneSeconds: heartRates.length && times.length
      ? heartRateZoneSeconds(heartRates, times, number(summary.max_heartrate))
      : null,
    sweatMl: null,
    minTempC,
    maxTempC,
    avgCadence: rawCadence == null ? null : rawCadence * cadenceScale,
    avgSpeedMps: number(summary.average_speed),
    trainingLoad: null,
    aerobicEffect: null,
    anaerobicEffect: null,
    laps: null,
    strength: null,
    ...route,
    isRace: RACE_NAME.test(title)
      || (sport === 'running' && workoutType === 1)
      || (sport === 'cycling' && workoutType === 11),
  };

  const estimated = estimateStravaMetrics(activity, {
    averageTempC: average(temperatures) ?? number(summary.average_temp),
    sufferScore: number(summary.suffer_score),
  });
  for (const field of ['sweatMl', 'trainingLoad', 'anaerobicEffect']) {
    const value = number(estimated?.[field]);
    if (value == null) continue;
    activity[field] = value;
    activity.estimated.push(field);
  }
  // how the session went, read from the same streams (velocity and distance come in the one streams call), which are
  // then dropped
  return Object.assign(activity, effortFields(activity, {
    hint: summary.sport_type || summary.type,
    trainer: summary.trainer === true,
    series: { t: times, v: streamData(streams, 'velocity_smooth'), hr: heartRates, d: streamData(streams, 'distance') },
  }));
}

export function mapStravaActivities(summaries, streamsById = new Map()) {
  if (!Array.isArray(summaries)) throw new InvalidStravaPayloadError('Strava returned an invalid activity list.');
  return summaries.map((summary) => mapStravaActivity(summary, streamsById.get(stravaSummaryId(summary)) || null));
}

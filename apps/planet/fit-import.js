import FitParser from './vendor/fit/fit-parser.js';
import { heartRateZones, normalizeRoute } from './activity-shape.js';
import { effortFields, markLong } from './effort.js';

const parser = new FitParser({
  mode: 'list',
  speedUnit: 'm/s',
  lengthUnit: 'm',
  temperatureUnit: 'celsius',
  elapsedRecordField: true,
});

const RACE_NAME = /marathon|half|\b\d+k\b|race|ultra|relay/i;
const MAX_FILE_BYTES = 64 * 1024 * 1024;

const number = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const firstNumber = (...values) => values.map(number).find((value) => value != null) ?? null;
const iso = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

function normalizeSport(value) {
  const sport = String(value || 'other').toLowerCase().replace(/[ -]+/g, '_');
  if (sport === 'run') return 'running';
  if (sport === 'walk') return 'walking';
  if (sport === 'bike' || sport === 'biking') return 'cycling';
  if (sport === 'swim') return 'swimming';
  return sport;
}

function titleFrom(name, session, data) {
  let stem = String(name || '').replace(/\.fit$/i, '').trim();
  stem = stem.replace(/^\d{6,}[ _-]*/, '').replace(/^activity[ _-]*/i, '').replace(/_/g, ' ').trim();
  if (stem && !/^\d+$/.test(stem)) return stem;
  return String(session.sport_profile_name || data.sports?.[0]?.name || normalizeSport(session.sport) || 'Activity')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function activityId(name, startedAt) {
  const garminId = String(name || '').match(/^(\d{6,})/)?.[1];
  if (garminId) return `${garminId}:0`;
  let hash = 2166136261;
  const source = `${name || ''}/${startedAt}`;
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
  return `${(hash >>> 0).toString(36)}:0`;
}

function measuredAscent(records) {
  let total = 0;
  let previous = null;
  let seen = false;
  for (const record of records) {
    const elevation = firstNumber(record.enhanced_altitude, record.altitude);
    if (elevation == null) {
      previous = null;
      continue;
    }
    if (previous != null) {
      const delta = elevation - previous;
      if (delta > 0) total += delta;
      seen = true;
    }
    previous = elevation;
  }
  return seen ? total : null;
}

function recordRange(records, key) {
  let min = Infinity;
  let max = -Infinity;
  for (const record of records) {
    const value = number(record[key]);
    if (value == null) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return min === Infinity ? [null, null] : [min, max];
}

function averageCadence(records, sport) {
  let sum = 0;
  let count = 0;
  const scale = sport === 'running' || sport === 'walking' ? 2 : 1;
  for (const record of records) {
    const cadence = number(record.cadence);
    if (cadence == null || cadence <= 0) continue;
    sum += cadence * scale;
    count++;
  }
  return count >= 60 ? sum / count : null;
}

function referenceIndex(message) {
  return number(message?.reference_index?.value) ?? number(message?.reference_index);
}

function zonesFromMessages(data) {
  const messages = Array.isArray(data.time_in_zone) ? data.time_in_zone : [];
  const message = messages.find((item) => item.reference_mesg === 'session' && (referenceIndex(item) ?? 0) === 0)
    || messages.find((item) => item.reference_mesg === 'session');
  const raw = message?.time_in_hr_zone;
  if (!Array.isArray(raw)) return null;
  const zones = (raw.length >= 6 ? raw.slice(1, 6) : raw.slice(0, 5)).map((value) => number(value) ?? 0);
  return zones.length === 5 && zones.some(Boolean) ? zones : null;
}

function zonesFromRecords(records, session, data) {
  const metrics = Array.isArray(data.user_metrics) ? data.user_metrics : [];
  return heartRateZones(records, {
    maxHeartRate: firstNumber(session.max_heart_rate),
    profileMaxHeartRate: metrics.map((item) => number(item.max_heart_rate)).find((value) => value != null),
    age: metrics.map((item) => number(item.age)).find((value) => value != null),
  });
}

function routeFromRecords(records) {
  return normalizeRoute(records);
}

// the samples effort.js reads, as plain series (seconds from the start, speed, heart rate, distance), and the laps
function seriesFrom(records, laps) {
  const n = records.length;
  const t = new Float64Array(n), v = new Float64Array(n), hr = new Float64Array(n), d = new Float64Array(n);
  const t0 = new Date(records[0]?.timestamp).getTime();
  for (let i = 0; i < n; i++) {
    const record = records[i];
    t[i] = number(record.elapsed_time) ?? (new Date(record.timestamp).getTime() - t0) / 1000;
    v[i] = firstNumber(record.enhanced_speed, record.speed) ?? NaN;
    hr[i] = number(record.heart_rate) ?? NaN;
    d[i] = number(record.distance) ?? NaN;
  }
  return {
    t, v, hr, d,
    laps: (Array.isArray(laps) ? laps : []).map((lap) => ({
      s: firstNumber(lap.total_timer_time, lap.total_elapsed_time),
      m: number(lap.total_distance),
      v: firstNumber(lap.enhanced_avg_speed, lap.avg_speed),
      hr: number(lap.avg_heart_rate),
      intensity: lap.intensity,
      trigger: lap.lap_trigger,
    })),
  };
}

function strengthFromSets(data, session, title) {
  const sets = (Array.isArray(data.sets) ? data.sets : []).filter((set) => set.set_type !== 'rest');
  const isStrength = /strength/i.test(`${session.sub_sport || ''} ${title}`);
  if (!sets.length || (!isStrength && !sets.some((set) => number(set.repetitions) != null || number(set.weight) != null))) return undefined;
  let reps = 0;
  let volumeKg = 0;
  for (const set of sets) {
    const count = number(set.repetitions) ?? 0;
    reps += count;
    volumeKg += count * (number(set.weight) ?? 0);
  }
  return { sets: sets.length, reps, volumeKg };
}

function mondayOf(isoDate) {
  const date = new Date(isoDate);
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  return date.toISOString().slice(0, 10);
}

function seedFor(week, activities) {
  activities.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  markLong(activities);
  const race = activities.find((activity) => activity.isRace)?.title || null;
  const sum = (key) => activities.reduce((total, activity) => total + (number(activity[key]) ?? 0), 0);
  return {
    week,
    race,
    activities,
    totals: {
      activities: activities.length,
      runs: activities.filter((activity) => activity.sport === 'running').length,
      distanceMi: sum('distanceM') / 1609.344,
      ascentM: sum('ascentM'),
      sweatMl: sum('sweatMl'),
      activeMin: sum('activeS') / 60,
      trainingLoad: sum('trainingLoad'),
    },
  };
}

export function groupActivitiesIntoWeeks(activities) {
  const grouped = new Map();
  for (const activity of activities) {
    const week = mondayOf(activity.startedAt);
    if (!grouped.has(week)) grouped.set(week, []);
    grouped.get(week).push(activity);
  }
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, list]) => seedFor(week, list));
}

async function bytesFrom(input) {
  if (input instanceof ArrayBuffer) return input;
  if (ArrayBuffer.isView(input)) return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
  if (input && typeof input.arrayBuffer === 'function') return input.arrayBuffer();
  throw new Error('Choose a .fit file from your Garmin export.');
}

export async function parseFitFile(input, { name = input?.name || 'activity.fit' } = {}) {
  if (input?.size > MAX_FILE_BYTES) throw new Error(`${name} is too large to read here (64 MB max).`);
  if (input?.name && !/\.fit$/i.test(input.name)) throw new Error(`${input.name} is not a .fit file.`);

  let data;
  try {
    data = await parser.parseAsync(await bytesFrom(input));
  } catch (error) {
    const detail = typeof error === 'string' ? error : error instanceof Error ? error.message : 'FIT parse failed';
    throw new Error(`${name} could not be read as a FIT activity: ${detail}`);
  }
  const session = data.sessions?.[0];
  if (!session) throw new Error(`${name} contains no activity session.`);
  const startedAt = iso(session.start_time || session.timestamp || data.file_ids?.[0]?.time_created);
  if (!startedAt) throw new Error(`${name} has no readable start time.`);

  const records = Array.isArray(data.records) ? data.records : [];
  const sport = normalizeSport(session.sport || data.sports?.[0]?.sport);
  const title = titleFrom(name, session, data);
  const route = routeFromRecords(records);
  const [minTempC, maxTempC] = recordRange(records, 'temperature');
  const strength = strengthFromSets(data, session, title);
  const hint = [name, title, session.sport_event, session.sub_sport, data.sports?.[0]?.name, data.sports?.[0]?.sport_event]
    .filter(Boolean).join(' ');
  const isRace = RACE_NAME.test(hint) || /\b(?:race|competition)\b/i.test(String(session.sport_event || ''));

  const activity = {
    id: activityId(name, startedAt),
    sport,
    startedAt,
    title,
    distanceM: firstNumber(session.total_distance),
    activeS: firstNumber(session.total_timer_time, session.active_time),
    ascentM: measuredAscent(records),
    avgHeartRate: firstNumber(session.avg_heart_rate),
    maxHeartRate: firstNumber(session.max_heart_rate),
    hrZoneSeconds: zonesFromMessages(data) || zonesFromRecords(records, session, data),
    sweatMl: firstNumber(session.est_sweat_loss),
    minTempC,
    maxTempC,
    avgCadence: averageCadence(records, sport),
    avgSpeedMps: firstNumber(session.enhanced_avg_speed, session.avg_speed),
    trainingLoad: firstNumber(session.training_load_peak, session.training_load),
    aerobicEffect: firstNumber(session.total_training_effect),
    anaerobicEffect: firstNumber(session.total_anaerobic_training_effect),
    laps: firstNumber(session.num_laps, data.laps?.length),
    ...route,
    isRace,
    ...(strength ? { strength } : {}),
  };
  return {
    ...activity,
    ...effortFields(activity, { hint: `${session.sub_sport || ''} ${session.sport_profile_name || ''}`, series: seriesFrom(records, data.laps) }),
  };
}

export async function parseFitFiles(files) {
  const list = Array.from(files || []);
  if (!list.length) throw new Error('Choose one or more .fit files first.');
  const activities = [];
  for (const file of list) activities.push(await parseFitFile(file));
  return groupActivitiesIntoWeeks(activities);
}

/* Pure helpers for the activity shape shared by FIT import and provider Functions. Absolute route points are
 * reduced to a unit-box shape here so callers never need to retain or return their original coordinates.
 * The explicitly Strava-named estimators below were fitted to 566 decoded activities across Ryan's 82 real
 * weeks; they are visual proxies for Garmin-only fields, not physiological or coaching measurements. */
const EARTH_R = 6371000;
const DEFAULT_ROUTE_POINTS = 160;

const number = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const latitudeOf = (point) => number(Array.isArray(point) ? point[0] : point?.position_lat ?? point?.lat ?? point?.latitude);
const longitudeOf = (point) => number(Array.isArray(point) ? point[1] : point?.position_long ?? point?.lng ?? point?.lon ?? point?.longitude);
const heartRateOf = (sample) => number(Array.isArray(sample) ? sample[1] : sample?.heart_rate ?? sample?.heartRate);
const timestampOf = (sample) => Array.isArray(sample) ? sample[0] : sample?.timestamp;

/** Absolute [latitude, longitude] points (or FIT records) -> origin-free route fields. */
export function normalizeRoute(points, limit = DEFAULT_ROUTE_POINTS) {
  const list = Array.isArray(points) ? points : [];
  let lat0 = null;
  let lon0 = null;
  let valid = 0;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const rad = Math.PI / 180;
  for (const point of list) {
    const lat = latitudeOf(point);
    const lon = longitudeOf(point);
    if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    if (lat0 == null) {
      lat0 = lat;
      lon0 = lon;
    }
    let dLon = lon - lon0;
    if (dLon > 180) dLon -= 360;
    if (dLon < -180) dLon += 360;
    const x = dLon * rad * EARTH_R * Math.cos(lat0 * rad);
    const y = (lat - lat0) * rad * EARTH_R;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    valid++;
  }
  if (valid < 2) return { hasGps: false };

  const width = maxX - minX;
  const height = maxY - minY;
  const span = Math.max(width, height);
  if (span < 1) return { hasGps: false };

  const count = Math.min(Math.max(2, Math.floor(limit) || DEFAULT_ROUTE_POINTS), valid);
  const shape = [];
  let validIndex = 0;
  let outputIndex = 0;
  let targetIndex = 0;
  for (const point of list) {
    const lat = latitudeOf(point);
    const lon = longitudeOf(point);
    if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    if (validIndex === targetIndex) {
      let dLon = lon - lon0;
      if (dLon > 180) dLon -= 360;
      if (dLon < -180) dLon += 360;
      const x = dLon * rad * EARTH_R * Math.cos(lat0 * rad);
      const y = (lat - lat0) * rad * EARTH_R;
      shape.push([width ? (x - minX) / width : 0.5, height ? (y - minY) / height : 0.5]);
      outputIndex++;
      if (outputIndex === count) break;
      targetIndex = Math.round(outputIndex * (valid - 1) / Math.max(1, count - 1));
    }
    validIndex++;
  }
  return { hasGps: shape.length > 1, routeShape: shape, routeSpanM: span };
}

function heartRateCeiling(observedMax, { maxHeartRate = null, profileMaxHeartRate = null, age = null } = {}) {
  const observed = number(maxHeartRate) ?? observedMax;
  const profileMax = number(profileMaxHeartRate);
  const years = number(age);
  const estimate = profileMax ?? (years == null ? (observed ? observed / 0.95 : 190) : 208 - 0.7 * years);
  return Math.max(observed ?? 0, Math.max(180, Math.min(220, estimate)));
}

/** Heart-rate samples (FIT records or [timestampMs, bpm]) -> the generator's five 50–100% max-HR zones. */
export function heartRateZones(samples, options = {}) {
  const list = Array.isArray(samples) ? samples : [];
  let observedMax = null;
  for (const sample of list) {
    const value = heartRateOf(sample);
    if (value != null && value > 0 && (observedMax == null || value > observedMax)) observedMax = value;
  }
  if (observedMax == null) return null;
  const maxHr = heartRateCeiling(observedMax, options);
  const zones = [0, 0, 0, 0, 0];
  for (let i = 0; i < list.length; i++) {
    const heartRate = heartRateOf(list[i]);
    if (heartRate == null || heartRate <= 0) continue;
    const here = new Date(timestampOf(list[i])).getTime();
    const next = new Date(timestampOf(list[i + 1])).getTime();
    const seconds = Number.isFinite(here) && Number.isFinite(next) ? Math.min(10, Math.max(0, (next - here) / 1000)) : 1;
    const zone = Math.max(0, Math.min(4, Math.floor((heartRate / maxHr * 100 - 50) / 10)));
    zones[zone] += seconds;
  }
  return zones.some(Boolean) ? zones : null;
}

/** Strava parallel heart-rate/time streams -> the same five zones; Strava time values are elapsed seconds. */
export function heartRateZoneSeconds(heartRates, times, maxHeartRate = null) {
  const rates = Array.isArray(heartRates) ? heartRates : [];
  const elapsed = Array.isArray(times) ? times : [];
  let observedMax = null;
  for (const value of rates) {
    const heartRate = number(value);
    if (heartRate != null && heartRate > 0 && (observedMax == null || heartRate > observedMax)) observedMax = heartRate;
  }
  if (observedMax == null) return null;
  const maxHr = heartRateCeiling(observedMax, { maxHeartRate });
  const zones = [0, 0, 0, 0, 0];
  for (let i = 0; i < rates.length; i++) {
    const heartRate = number(rates[i]);
    if (heartRate == null || heartRate <= 0) continue;
    const here = number(elapsed[i]);
    const next = number(elapsed[i + 1]);
    const seconds = here != null && next != null ? Math.min(10, Math.max(0, next - here)) : 1;
    const zone = Math.max(0, Math.min(4, Math.floor((heartRate / maxHr * 100 - 50) / 10)));
    zones[zone] += seconds;
  }
  return zones.some(Boolean) ? zones : null;
}

const ZONE_INTENSITY = [0.55, 0.65, 0.75, 0.85, 0.95];
const LOAD_PER_ZONE_MINUTE = [0.6, 1.1, 1.4, 2.4, 5];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function zoneSummary(activity) {
  const source = activity?.hrZoneSeconds;
  if (!Array.isArray(source) || source.length < 5) return null;
  const zones = new Array(5);
  let total = 0;
  for (let index = 0; index < zones.length; index++) {
    const value = Math.max(0, number(source[index]) ?? 0);
    zones[index] = value;
    total += value;
  }
  return total > 0 ? { zones, total } : null;
}

function stravaIntensity(activity, summary) {
  if (summary) return summary.zones.reduce((sum, value, index) => sum + value * ZONE_INTENSITY[index], 0) / summary.total;
  const average = number(activity?.avgHeartRate);
  if (average != null) return clamp(average / Math.max(180, number(activity?.maxHeartRate) ?? 0), 0.5, 1);
  return 0.65;
}

function stravaSweatMl(activity, averageTempC, summary) {
  const activeS = number(activity?.activeS);
  if (activeS == null || activeS <= 0) return null;
  const recordedTemp = number(activity?.minTempC) != null && number(activity?.maxTempC) != null
    ? (activity.minTempC + activity.maxTempC) / 2
    : null;
  const temperature = number(averageTempC) ?? recordedTemp ?? 15;
  const litersPerHour = clamp(0.62 + 1.23 * (stravaIntensity(activity, summary) - 0.65) + 0.29 * (temperature - 15) / 20, 0.4, 1.8);
  return litersPerHour * activeS / 3.6;
}

/** Strava sweat proxy in millilitres. The calibrated rate is bounded to published broad exercise ranges,
 * 0.4–1.8 L/hour; absent temperature is neutral at 15 C. */
export function estimateStravaSweatMl(activity, averageTempC = null) {
  return stravaSweatMl(activity, averageTempC, zoneSummary(activity));
}

function stravaTrainingLoad(summary, sufferScore) {
  if (summary) return summary.zones.reduce((sum, value, index) => sum + value / 60 * LOAD_PER_ZONE_MINUTE[index], 0);
  const effort = number(sufferScore);
  return effort == null || effort < 0 ? null : effort * 1.3;
}

/** Strava load proxy. Zone-minute weights are a TRIMP-style curve fitted to Ryan's Garmin EPOC load scale;
 * Relative Effort (suffer_score) is the summary-only fallback when streams were unavailable. */
export function estimateStravaTrainingLoad(activity, sufferScore = null) {
  return stravaTrainingLoad(zoneSummary(activity), sufferScore);
}

function stravaAnaerobicEffect(summary) {
  return summary ? clamp(2 * (summary.zones[3] + summary.zones[4]) / summary.total, 0, 5) : null;
}

/** Strava anaerobic-effect proxy (0–5) from the share of recorded time in heart-rate zones 4 and 5. */
export function estimateStravaAnaerobicEffect(activity) {
  return stravaAnaerobicEffect(zoneSummary(activity));
}

/** All Garmin-only values Planet Creator can responsibly estimate from one Strava activity. */
export function estimateStravaMetrics(activity, { averageTempC = null, sufferScore = null } = {}) {
  const summary = zoneSummary(activity);
  const sweatMl = stravaSweatMl(activity, averageTempC, summary);
  const trainingLoad = stravaTrainingLoad(summary, sufferScore);
  const anaerobicEffect = stravaAnaerobicEffect(summary);
  const estimates = {};
  if (sweatMl != null) estimates.sweatMl = sweatMl;
  if (trainingLoad != null) estimates.trainingLoad = trainingLoad;
  if (anaerobicEffect != null) estimates.anaerobicEffect = anaerobicEffect;
  return estimates;
}

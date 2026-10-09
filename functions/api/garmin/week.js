import { hasExpectedOrigin, jsonResponse, methodNotAllowed } from '../../_shared/strava-auth.js';
import { InvalidWeekRequestError, validateWeekRequest } from '../../_shared/strava-map.js';
import {
  boundedText,
  clearConnectionCookie,
  connectionFromRequest,
  deleteUser,
  deviceModel,
  garminConnection,
  InvalidGarminCookieError,
  JunctionError,
  UUID,
  weekWorkouts,
  workoutStream,
} from '../../_shared/junction.js';
import { garminDeviceLines, InvalidJunctionPayloadError, mapJunctionWorkout } from '../../_shared/junction-map.js';

/* One local week of Garmin workouts, read from Junction now and mapped in memory: Planet Creator keeps none of it, and the
 * page gets routes only as unit-box shapes. Same request and answer as api/strava/week.js, with no Strava in it. */
const REQUEST_BYTES = 1024;
const TOTAL_STREAM_BYTES = 32 * 1024 * 1024;
const MAX_WORKOUTS = 127;

const reconnect = () => jsonResponse({ error: 'Reconnect Garmin to fetch that week.' }, {
  status: 401,
  headers: { 'Set-Cookie': clearConnectionCookie() },
});
const busy = (status) => status === 429 || status === 503;

// five at a time; a workout whose samples Junction won't send is drawn from its summary, unless Junction is busy
async function streamsFor(env, workouts) {
  const streams = new Map();
  const budget = { bytes: 0, limit: TOTAL_STREAM_BYTES };
  let next = 0;
  let missing = 0;
  async function worker() {
    while (next < workouts.length) {
      const { id } = workouts[next++];
      try {
        streams.set(id, await workoutStream(env, id, budget));
      } catch (error) {
        if (error instanceof JunctionError && busy(error.status)) throw error;
        missing++;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(5, workouts.length) }, worker));
  return { streams, missing };
}

async function devicesOf(env, userId, workouts) {
  const ids = [...new Set(workouts.map((workout) => workout.source?.device_id).filter((id) => UUID.test(id ?? '')))].slice(0, 3);
  return garminDeviceLines(await Promise.all(ids.map((id) => deviceModel(env, userId, id))));
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  try {
    if (!hasExpectedOrigin(request, env)) return jsonResponse({ error: 'This request must come from Planet Creator.' }, { status: 403 });
  } catch {
    return jsonResponse({ error: 'Garmin connection is not configured.' }, { status: 500 });
  }

  let connection;
  try {
    connection = await connectionFromRequest(request, env);
  } catch (error) {
    if (error instanceof InvalidGarminCookieError) return reconnect();
    return jsonResponse({ error: 'Garmin connection is not configured.' }, { status: 500 });
  }
  if (!connection) return jsonResponse({ error: 'Connect Garmin before choosing a week.' }, { status: 401 });

  let interval;
  try {
    interval = validateWeekRequest(JSON.parse(await boundedText(request.body, request.headers, REQUEST_BYTES)));
  } catch (error) {
    return jsonResponse({ error: error instanceof InvalidWeekRequestError ? error.message : 'Send a valid week request.' }, { status: 400 });
  }

  try {
    const workouts = await weekWorkouts(env, connection.userId, interval.after, interval.before);
    if (!workouts.length) {
      // nothing yet: a connection still waiting on Garmin's history, or one that ended in Garmin Connect or here
      const state = await garminConnection(env, connection.userId);
      if (state === 'gone') return reconnect();
      if (state === 'broken') {
        await deleteUser(env, connection.userId);
        return reconnect();
      }
      return jsonResponse({ activities: [], garmin: [] });
    }
    if (workouts.length > MAX_WORKOUTS) {
      return jsonResponse({ error: 'That week has more activities than a planet can hold. Use FIT files instead.' }, { status: 422 });
    }
    // every ID goes into a URL, so each is checked first
    if (workouts.some((workout) => !UUID.test(workout?.id ?? ''))) throw new InvalidJunctionPayloadError();
    const { streams, missing } = await streamsFor(env, workouts);
    const activities = workouts.map((workout) => mapJunctionWorkout(workout, streams.get(workout.id)));
    return jsonResponse({
      activities,
      garmin: await devicesOf(env, connection.userId, workouts),
      ...(missing ? { warning: `Junction didn't send the samples for ${missing === 1 ? 'one workout' : `${missing} workouts`}, so ${missing === 1 ? 'it has' : 'they have'} no route on this planet.` } : {}),
    });
  } catch (error) {
    if (error instanceof InvalidJunctionPayloadError) {
      return jsonResponse({ error: 'Junction returned workout data Planet Creator could not read.' }, { status: 502 });
    }
    if (error instanceof JunctionError && error.status === 404) return reconnect();
    if (error instanceof JunctionError && busy(error.status)) {
      return jsonResponse({ error: 'Junction is busy. Try this week again in a minute.' }, { status: 429, headers: { 'Retry-After': '60' } });
    }
    return jsonResponse({ error: 'Junction could not provide that week. Try again.' }, { status: 502 });
  }
}

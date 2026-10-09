import { hasExpectedOrigin, jsonResponse, methodNotAllowed } from '../../_shared/strava-auth.js';
import {
  clearConnectionCookie,
  clearStateCookie,
  connectionFromRequest,
  deleteUser,
  InvalidGarminCookieError,
} from '../../_shared/junction.js';

const GONE_MESSAGE = "This browser no longer holds a Garmin connection. Remove Junction under Connected Apps in Garmin Connect if it's still there.";

function cleared() {
  const headers = new Headers();
  headers.append('Set-Cookie', clearConnectionCookie());
  headers.append('Set-Cookie', clearStateCookie());
  return headers;
}

// Deleting the Junction user ends the Garmin connection at once and has Junction erase what Garmin sent. Until Junction
// confirms, the cookie stays, so Disconnect can be tapped again.
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
    if (error instanceof InvalidGarminCookieError) return jsonResponse({ disconnected: true, deleted: false, message: GONE_MESSAGE }, { headers: cleared() });
    return jsonResponse({ error: 'Garmin connection is not configured.', deleted: false }, { status: 500 });
  }
  if (!connection) return jsonResponse({ disconnected: true, deleted: false, message: GONE_MESSAGE }, { headers: cleared() });

  try {
    await deleteUser(env, connection.userId);
    return jsonResponse({ disconnected: true, deleted: true }, { headers: cleared() });
  } catch {
    return jsonResponse({ disconnected: false, deleted: false, error: "Junction didn't confirm the deletion. Try Disconnect again in a minute." }, { status: 502 });
  }
}

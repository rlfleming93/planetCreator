import { jsonResponse, methodNotAllowed } from '../../_shared/strava-auth.js';
import { clearConnectionCookie, connectionFromRequest, InvalidGarminCookieError, junctionConfigured } from '../../_shared/junction.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return methodNotAllowed('GET');
  if (!junctionConfigured(env)) return jsonResponse({ configured: false, connected: false });
  try {
    return jsonResponse({ configured: true, connected: (await connectionFromRequest(request, env)) != null });
  } catch (error) {
    if (error instanceof InvalidGarminCookieError) {
      return jsonResponse({ configured: true, connected: false }, { headers: { 'Set-Cookie': clearConnectionCookie() } });
    }
    return jsonResponse({ error: 'Garmin connection is not configured.' }, { status: 500 });
  }
}

import {
  clearTokenCookie,
  InvalidStravaCookieError,
  jsonResponse,
  methodNotAllowed,
  sessionFromRequest,
  stravaConfigured,
} from '../../_shared/strava-auth.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return methodNotAllowed('GET');
  if (!stravaConfigured(env)) return jsonResponse({ configured: false, connected: false });
  try {
    return jsonResponse({ configured: true, connected: (await sessionFromRequest(request, env)) != null });
  } catch (error) {
    if (error instanceof InvalidStravaCookieError) {
      return jsonResponse({ configured: true, connected: false }, { headers: { 'Set-Cookie': clearTokenCookie() } });
    }
    return jsonResponse({ error: 'Strava connection is not configured.' }, { status: 500 });
  }
}

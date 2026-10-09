import {
  clearStateCookie,
  clearTokenCookie,
  hasExpectedOrigin,
  InvalidStravaCookieError,
  jsonResponse,
  methodNotAllowed,
  retryAfterQuarterHour,
  revoke,
  sessionFromRequest,
  StravaUpstreamError,
} from '../../_shared/strava-auth.js';

const SETTINGS_MESSAGE = 'Planet Creator no longer has a token to revoke. You can remove it in Strava application settings.';

function clearedHeaders() {
  const headers = new Headers();
  headers.append('Set-Cookie', clearTokenCookie());
  headers.append('Set-Cookie', clearStateCookie());
  return headers;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  try {
    if (!hasExpectedOrigin(request, env)) return jsonResponse({ error: 'This request must come from Planet Creator.' }, { status: 403 });
  } catch {
    return jsonResponse({ error: 'Strava connection is not configured.' }, { status: 500 });
  }

  const headers = clearedHeaders();
  let session;
  try {
    session = await sessionFromRequest(request, env);
  } catch (error) {
    if (error instanceof InvalidStravaCookieError) {
      return jsonResponse({ disconnected: true, revoked: false, message: SETTINGS_MESSAGE }, { headers });
    }
    return jsonResponse({ error: 'Strava connection is not configured.', revoked: false }, { status: 500, headers });
  }
  if (!session) return jsonResponse({ disconnected: true, revoked: false, message: SETTINGS_MESSAGE }, { headers });

  try {
    await revoke(env, session.refreshToken);
    return jsonResponse({ disconnected: true, revoked: true }, { headers });
  } catch (error) {
    if (error instanceof StravaUpstreamError && error.status === 429) {
      headers.set('Retry-After', String(retryAfterQuarterHour()));
      return jsonResponse({ disconnected: true, revoked: false, error: 'Strava could not revoke access yet. Remove Planet Creator in Strava application settings.' }, { status: 429, headers });
    }
    const status = error instanceof StravaUpstreamError ? 502 : 500;
    return jsonResponse({
      disconnected: true,
      revoked: false,
      error: status === 500
        ? 'Strava connection is not configured.'
        : 'Strava could not confirm revocation. Remove Planet Creator in Strava application settings.',
    }, { status, headers });
  }
}

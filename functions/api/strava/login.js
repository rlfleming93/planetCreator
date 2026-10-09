import {
  authorizationUrl,
  methodNotAllowed,
  privateResponse,
  randomState,
  stateCookie,
  stravaConfigured,
} from '../../_shared/strava-auth.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return methodNotAllowed('GET');
  if (!stravaConfigured(env)) return privateResponse(null, { status: 302, headers: { Location: '/make/?error=strava&why=off' } });
  try {
    const state = randomState();
    const headers = new Headers({ Location: authorizationUrl(env, state) });
    headers.append('Set-Cookie', stateCookie(state));
    return privateResponse(null, { status: 302, headers });
  } catch {
    return privateResponse(null, { status: 302, headers: { Location: '/make/?error=strava&why=off' } });
  }
}

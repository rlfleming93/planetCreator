import {
  clearStateCookie,
  ConfigurationError,
  exchangeCode,
  hasRequiredScopes,
  methodNotAllowed,
  parseScopes,
  privateResponse,
  siteOrigin,
  stateFromRequest,
  statesMatch,
  StravaUpstreamError,
  tokenCookie,
} from '../../_shared/strava-auth.js';

// A failed connection is a page visit from Strava, so it goes back to the make page, which says why in words
// (make/index.html STRAVA_WHY), instead of leaving the visitor on a bare JSON error.
function backToMake(why, headers) {
  headers.set('Location', `/make/?error=strava&why=${why}`);
  return privateResponse(null, { status: 302, headers });
}

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return methodNotAllowed('GET');
  const headers = new Headers({ 'Referrer-Policy': 'no-referrer' });
  headers.append('Set-Cookie', clearStateCookie());

  const url = new URL(request.url);
  if (!statesMatch(stateFromRequest(request), url.searchParams.get('state'))) return backToMake('expired', headers);
  const scopes = parseScopes(url.searchParams.get('scope'));
  const code = url.searchParams.get('code');
  if (url.searchParams.has('error') || !code) return backToMake('denied', headers);
  if (!hasRequiredScopes(scopes)) return backToMake('scope', headers);

  try {
    const session = await exchangeCode(env, code, scopes);
    // ?connected= tells make/ the visitor just came back from Strava, so it paints their latest week without a click
    const home = `${siteOrigin(env)}/make/?connected=strava`;
    headers.append('Set-Cookie', await tokenCookie(session, env));
    headers.set('Location', home);
    return privateResponse(null, { status: 302, headers });
  } catch (error) {
    if (error instanceof StravaUpstreamError && error.status === 429) return backToMake('busy', headers);
    return backToMake(error instanceof ConfigurationError ? 'off' : 'failed', headers);
  }
}

import { methodNotAllowed, privateResponse, siteOrigin, statesMatch } from '../../_shared/strava-auth.js';
import {
  clearStateCookie,
  connectionCookie,
  connectionFromRequest,
  deleteUser,
  stateFromRequest,
} from '../../_shared/junction.js';

// Junction's Link error types (docs: wearables/connecting-providers/errors), in the words make/ has for them (GARMIN_WHY)
const WHY = {
  provider_credential_error: 'denied',
  user_cancelled: 'denied',
  required_scopes_not_granted: 'scope',
  token_expired: 'expired',
  invalid_token: 'expired',
  token_consumed: 'expired',
  provider_api_error: 'busy',
};

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return methodNotAllowed('GET');
  const headers = new Headers({ 'Referrer-Policy': 'no-referrer' });
  headers.append('Set-Cookie', clearStateCookie());
  const backToMake = (why) => {
    headers.set('Location', `/make/?error=garmin&why=${why}`);
    return privateResponse(null, { status: 302, headers });
  };

  const url = new URL(request.url);
  let pending;
  try {
    pending = await stateFromRequest(request, env);
  } catch {
    return backToMake('off');
  }
  if (!pending || !statesMatch(pending.state, url.searchParams.get('pc'))) return backToMake('expired');
  if (url.searchParams.get('state') !== 'success' || url.searchParams.get('provider') !== 'garmin') {
    // the user made for this attempt has no connection and holds nothing; the sweep is the backstop if this fails
    await deleteUser(env, pending.userId).catch(() => {});
    return backToMake(WHY[url.searchParams.get('error_type')] || 'failed');
  }
  try {
    // one connection a browser: a Garmin connected again replaces the older Junction user, and its data
    const older = await connectionFromRequest(request, env);
    if (older && older.userId !== pending.userId) await deleteUser(env, older.userId).catch(() => {});
  } catch {}
  try {
    headers.append('Set-Cookie', await connectionCookie(env, pending.userId, pending.createdAt));
    // ?connected= tells make/ the visitor just came back from Garmin, so it paints their latest week without a click
    headers.set('Location', `${siteOrigin(env)}/make/?connected=garmin`);
    return privateResponse(null, { status: 302, headers });
  } catch {
    return backToMake('off');
  }
}

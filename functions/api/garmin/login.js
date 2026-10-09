import { ConfigurationError, hasExpectedOrigin, methodNotAllowed, privateResponse, randomState, siteOrigin } from '../../_shared/strava-auth.js';
import { createUser, deleteUser, garminConsentUrl, JunctionError, junctionConfigured, stateCookie } from '../../_shared/junction.js';

// A POST from make/'s own form: each connection makes a Junction user, so another site's link or image can't make them
function backToMake(why) {
  return privateResponse(null, { status: 303, headers: { Location: `/make/?error=garmin&why=${why}` } });
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  if (!junctionConfigured(env)) return backToMake('off');
  try {
    if (!hasExpectedOrigin(request, env)) return backToMake('failed');
  } catch {
    return backToMake('off');
  }
  let userId;
  try {
    const createdAt = Math.floor(Date.now() / 1000);
    userId = await createUser(env);
    const state = randomState();
    // Junction keeps the redirect's own query and adds state=success|error to it, so the check rides as pc
    const consent = await garminConsentUrl(env, userId, `${siteOrigin(env)}/api/garmin/callback?pc=${state}`);
    const headers = new Headers({ Location: consent });
    headers.append('Set-Cookie', await stateCookie(env, state, userId, createdAt));
    return privateResponse(null, { status: 303, headers });
  } catch (error) {
    if (userId) await deleteUser(env, userId).catch(() => {});
    if (error instanceof ConfigurationError) return backToMake('off');
    return backToMake(error instanceof JunctionError && (error.status === 429 || error.status === 503) ? 'busy' : 'failed');
  }
}

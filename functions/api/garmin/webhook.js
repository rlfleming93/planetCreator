import { jsonResponse, methodNotAllowed, privateResponse } from '../../_shared/strava-auth.js';
import { BodyLimitError, boundedText, deleteUser, junctionConfigured, UUID, verifyWebhook } from '../../_shared/junction.js';

/* Junction's webhook (set it to send provider.connection.error only). A Garmin connection that breaks, as when someone
 * removes the app in Garmin Connect, deletes its Junction user and with it what Garmin sent. Planet Creator stores no
 * event: every other kind is acknowledged and dropped. Junction retries a non-2xx answer for about a day
 * (docs: webhooks/retry-policy), so a failed deletion is tried again. */
const EVENT_BYTES = 1024 * 1024;

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  if (!junctionConfigured(env)) return jsonResponse({ error: 'Garmin connection is not configured.' }, { status: 503 });

  let body;
  try {
    body = await boundedText(request.body, request.headers, EVENT_BYTES);
  } catch (error) {
    // a batch of samples this large is never a connection event, so there is nothing to act on
    if (error instanceof BodyLimitError) return privateResponse(null, { status: 204 });
    throw error;
  }
  if (!(await verifyWebhook(env, request.headers, body))) return jsonResponse({ error: 'Signature did not verify.' }, { status: 401 });

  let event;
  try {
    event = JSON.parse(body);
  } catch {
    return jsonResponse({ error: 'Send a JSON event.' }, { status: 400 });
  }
  if (event?.event_type !== 'provider.connection.error' || event.data?.provider !== 'garmin' || !UUID.test(event.user_id ?? '')) {
    return privateResponse(null, { status: 204 });
  }
  try {
    await deleteUser(env, event.user_id);
    return jsonResponse({ deleted: true });
  } catch {
    return jsonResponse({ error: "Junction didn't confirm the deletion." }, { status: 502 });
  }
}

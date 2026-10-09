import {
  clearTokenCookie,
  hasExpectedOrigin,
  InvalidStravaCookieError,
  jsonResponse,
  methodNotAllowed,
  refreshSessionIfNeeded,
  retryAfterQuarterHour,
  sessionFromRequest,
  stravaApiUrl,
  StravaUpstreamError,
} from '../../_shared/strava-auth.js';
import {
  garminDevices,
  InvalidStravaPayloadError,
  InvalidWeekRequestError,
  mapStravaActivities,
  mapStravaActivity,
  needsStravaStreams,
  stravaSummaryId,
  validateWeekRequest,
} from '../../_shared/strava-map.js';

const SUMMARY_WARNING = 'Strava’s request budget was tight, so this planet used summary detail and has no heart-rate zones.';
// velocity_smooth and distance feed the session's effort and a race's splits (effort.js): more keys, the same request
const STREAM_TYPES = Object.freeze(['latlng', 'altitude', 'heartrate', 'time', 'cadence', 'temp', 'velocity_smooth', 'distance']);
const STREAM_KEYS = STREAM_TYPES.join(',');
const REQUEST_JSON_BYTES = 1024;
const LIST_JSON_BYTES = 2 * 1024 * 1024;
const STREAM_JSON_BYTES = 8 * 1024 * 1024;
const TOTAL_STREAM_JSON_BYTES = 32 * 1024 * 1024;
const STREAM_SAMPLES = 500000;
const STREAM_VALUES = 2000000;

class BodyLimitError extends Error {}

async function boundedJson(body, headers, maxBytes, budget = null) {
  const declared = Number(headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await body?.cancel().catch(() => {});
    throw new BodyLimitError();
  }
  if (!body) throw new SyntaxError('Missing JSON body.');
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parts = [];
  let bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (budget) budget.bytes += value.byteLength;
    if (bytes > maxBytes || (budget && budget.bytes > budget.limit)) {
      await reader.cancel().catch(() => {});
      throw new BodyLimitError();
    }
    parts.push(decoder.decode(value, { stream: true }));
  }
  parts.push(decoder.decode());
  return JSON.parse(parts.join(''));
}

function withHeader(headers, name, value) {
  const copy = new Headers(headers);
  copy.set(name, value);
  return copy;
}

function rateLimitResponse(headers) {
  return jsonResponse({ error: 'Strava is rate-limiting requests. Try this week again after the wait.' }, {
    status: 429,
    headers: withHeader(headers, 'Retry-After', String(retryAfterQuarterHour())),
  });
}

function upstreamErrorResponse(error, headers) {
  if (error instanceof StravaUpstreamError && error.status === 429) return rateLimitResponse(headers);
  if (error instanceof StravaUpstreamError && (error.status === 401 || error.status === 403)) {
    const cleared = new Headers(headers);
    cleared.append('Set-Cookie', clearTokenCookie());
    return jsonResponse({ error: 'Reconnect Strava to fetch that week.' }, { status: 401, headers: cleared });
  }
  return jsonResponse({ error: 'Strava could not provide that week. Try again.' }, {
    status: error instanceof StravaUpstreamError ? 502 : 500,
    headers,
  });
}

async function fetchJson(url, accessToken, maxBytes = LIST_JSON_BYTES, budget = null) {
  let response;
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
  } catch {
    throw new StravaUpstreamError();
  }
  if (!response.ok) {
    response.body?.cancel();
    console.error(`strava ${new URL(url).pathname.replace(/\d+/g, ':id')} -> ${response.status}`); // no token, no ids
    throw new StravaUpstreamError(response.status);
  }
  try {
    const value = await boundedJson(response.body, response.headers, maxBytes, budget);
    return { value, headers: new Headers(response.headers) };
  } catch {
    throw new StravaUpstreamError(502);
  }
}

async function fetchActivityList(env, accessToken, after, before, page = 1) {
  const url = new URL(stravaApiUrl(env, 'athlete/activities'));
  url.searchParams.set('after', String(after));
  url.searchParams.set('before', String(before));
  url.searchParams.set('per_page', '200');
  if (page > 1) url.searchParams.set('page', String(page));
  const result = await fetchJson(url, accessToken);
  if (!Array.isArray(result.value)) throw new InvalidStravaPayloadError('Strava returned an invalid activity list.');
  return { summaries: result.value, rateHeaders: result.headers };
}

function quotaPair(headers, prefix) {
  const limits = (headers.get(`${prefix}-Limit`) || '').split(',').map((value) => Number(value.trim()));
  const usages = (headers.get(`${prefix}-Usage`) || '').split(',').map((value) => Number(value.trim()));
  if (limits.length !== 2 || usages.length !== 2
      || !limits.every((value) => Number.isSafeInteger(value) && value >= 0)
      || !usages.every((value) => Number.isSafeInteger(value) && value >= 0)) return null;
  return limits.map((limit, index) => limit - usages[index]);
}

export function rateBudgetAllowsStreams(headers, streamCount) {
  const needed = streamCount + 5;
  const read = quotaPair(headers, 'X-ReadRateLimit');
  const overall = quotaPair(headers, 'X-RateLimit');
  return streamCount <= 40 && read != null && overall != null
    && read[0] >= needed && read[1] >= needed && overall[0] >= needed && overall[1] >= needed;
}

// What's left of this app's Strava read budget (every athlete's reads count against it): [this 15 minutes, today], and
// the limits it's out of.
function readBudget(headers) {
  const left = quotaPair(headers, 'X-ReadRateLimit');
  return left && { left: left.map((n) => Math.max(0, n)), limit: headers.get('X-ReadRateLimit-Limit').split(',').map(Number) };
}

// The week picker's and a batch's weeks, RANGE_WEEKS at most: every page of the activity list, summaries only (no
// streams, so each page is the only read). The answer says what's left of the read budget; a range that needs another
// page while less is left than an opened week can need (its list and up to 40 streams) stops with 429 instead.
const RANGE_WEEKS = 13, RANGE_PAGES = 9, RESERVE = 45;
async function rangeResponse(env, accessToken, { after, before }, headers) {
  const summaries = [];
  for (let page = 1; ; page++) {
    const list = await fetchActivityList(env, accessToken, after, before, page);
    summaries.push(...list.summaries);
    const budget = readBudget(list.rateHeaders);
    if (list.summaries.length < 200) {
      const activities = summaries.map((summary) => ({ ...mapStravaActivity(summary), garmin: garminDevices([summary]) }));
      return jsonResponse({ activities, detail: 'summary', budget }, { headers });
    }
    if (page === RANGE_PAGES) {
      return jsonResponse({ error: 'Those weeks hold more activities than Planet Creator reads at once. Use FIT files instead.' }, { status: 422, headers });
    }
    const overall = quotaPair(list.rateHeaders, 'X-RateLimit');
    if (!budget || !overall || Math.min(...budget.left, ...overall) < RESERVE) {
      return jsonResponse({ error: "Strava's read budget for this site is nearly used up. The rest can come after the wait.", budget }, {
        status: 429,
        headers: withHeader(headers, 'Retry-After', String(retryAfterQuarterHour())),
      });
    }
  }
}

function keyedStreams(value) {
  let source;
  if (value && !Array.isArray(value) && typeof value === 'object') {
    source = value;
  } else if (Array.isArray(value)) {
    source = Object.create(null);
    for (const stream of value) {
      if (typeof stream?.type === 'string' && Array.isArray(stream.data)) source[stream.type] = stream;
    }
  } else {
    throw new InvalidStravaPayloadError('Strava returned invalid activity streams.');
  }

  const streams = Object.create(null);
  let values = 0;
  for (const type of STREAM_TYPES) {
    const stream = source[type];
    if (stream == null) continue;
    if (!Array.isArray(stream.data) || stream.data.length > STREAM_SAMPLES) {
      throw new InvalidStravaPayloadError('Strava returned invalid activity streams.');
    }
    values += stream.data.length;
    if (values > STREAM_VALUES) throw new InvalidStravaPayloadError('Strava returned invalid activity streams.');
    streams[type] = { data: stream.data };
  }
  return streams;
}

async function fetchOneStream(env, accessToken, id, budget) {
  const url = new URL(stravaApiUrl(env, `activities/${id}/streams`));
  url.searchParams.set('keys', STREAM_KEYS);
  url.searchParams.set('key_by_type', 'true');
  return keyedStreams((await fetchJson(url, accessToken, STREAM_JSON_BYTES, budget)).value);
}

async function fetchAllStreams(env, accessToken, candidates) {
  const activities = new Map();
  const failures = [];
  const budget = { bytes: 0, limit: TOTAL_STREAM_JSON_BYTES };
  let cursor = 0;
  let stopped = false;

  async function worker() {
    while (!stopped) {
      const index = cursor++;
      if (index >= candidates.length) return;
      const { id, summary } = candidates[index];
      try {
        const streams = await fetchOneStream(env, accessToken, id, budget);
        activities.set(id, mapStravaActivity(summary, streams));
      } catch (error) {
        // Auth and rate limits end the week; any other miss (an activity with no streams answers 404, a 5xx, an
        // odd payload) leaves that one activity painted from its summary, as the whole week is when the budget's low.
        if (error instanceof StravaUpstreamError && [401, 403, 429].includes(error.status)) {
          failures.push(error);
          stopped = true;
        } else activities.set(id, mapStravaActivity(summary));
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(5, candidates.length) }, () => worker()));
  const rateLimited = failures.find((error) => error instanceof StravaUpstreamError && error.status === 429);
  if (rateLimited) throw rateLimited;
  if (failures.length) throw failures[0];
  if (activities.size !== candidates.length) throw new StravaUpstreamError(502);
  return activities;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  try {
    if (!hasExpectedOrigin(request, env)) return jsonResponse({ error: 'This request must come from Planet Creator.' }, { status: 403 });
  } catch {
    return jsonResponse({ error: 'Strava connection is not configured.' }, { status: 500 });
  }

  let session;
  try {
    session = await sessionFromRequest(request, env);
  } catch (error) {
    if (error instanceof InvalidStravaCookieError) {
      return jsonResponse({ error: 'Reconnect Strava to fetch that week.' }, {
        status: 401,
        headers: { 'Set-Cookie': clearTokenCookie() },
      });
    }
    return jsonResponse({ error: 'Strava connection is not configured.' }, { status: 500 });
  }
  if (!session) return jsonResponse({ error: 'Connect Strava before choosing a week.' }, { status: 401 });

  // a request that says how many weeks (the week picker's, a batch's) wants their summaries; one without, its week's streams
  let interval, range;
  try {
    const ask = await boundedJson(request.body, request.headers, REQUEST_JSON_BYTES);
    interval = validateWeekRequest(ask, RANGE_WEEKS);
    range = ask.weeks !== undefined;
  } catch (error) {
    const message = error instanceof InvalidWeekRequestError ? error.message : 'Send a valid week request.';
    return jsonResponse({ error: message }, { status: 400 });
  }

  let responseHeaders = new Headers();
  try {
    const refreshed = await refreshSessionIfNeeded(env, session);
    session = refreshed.session;
    if (refreshed.cookie) responseHeaders.append('Set-Cookie', refreshed.cookie);
  } catch (error) {
    if (error instanceof StravaUpstreamError && error.status === 400) {
      responseHeaders.append('Set-Cookie', clearTokenCookie());
      return jsonResponse({ error: 'Reconnect Strava to fetch that week.' }, { status: 401, headers: responseHeaders });
    }
    return upstreamErrorResponse(error, responseHeaders);
  }

  try {
    if (range) return await rangeResponse(env, session.accessToken, interval, responseHeaders);
    const { summaries, rateHeaders } = await fetchActivityList(env, session.accessToken, interval.after, interval.before);
    if (summaries.length > 127) {
      return jsonResponse({ error: 'That week has more activities than a planet can hold. Use FIT files instead.' }, {
        status: 422,
        headers: responseHeaders,
      });
    }

    // Validate every provider ID before any one of them is placed in a stream URL.
    const candidates = [];
    for (const summary of summaries) {
      const id = stravaSummaryId(summary);
      if (needsStravaStreams(summary)) candidates.push({ id, summary });
    }
    if (!rateBudgetAllowsStreams(rateHeaders, candidates.length)) {
      return jsonResponse({
        activities: mapStravaActivities(summaries),
        detail: 'summary',
        warning: SUMMARY_WARNING,
        garmin: garminDevices(summaries),
      }, { headers: responseHeaders });
    }

    const enriched = candidates.length
      ? await fetchAllStreams(env, session.accessToken, candidates)
      : new Map();
    const activities = summaries.map((summary) => {
      const id = stravaSummaryId(summary);
      return enriched.has(id) ? enriched.get(id) : mapStravaActivity(summary);
    });
    return jsonResponse({ activities, detail: 'streams', garmin: garminDevices(summaries) }, {
      headers: responseHeaders,
    });
  } catch (error) {
    if (error instanceof InvalidStravaPayloadError) {
      return jsonResponse({ error: 'Strava returned activity data Planet Creator could not read.' }, {
        status: 502,
        headers: responseHeaders,
      });
    }
    return upstreamErrorResponse(error, responseHeaders);
  }
}

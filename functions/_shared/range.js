// Pages serves static files whole: a Range request gets 200 and every byte. Safari on an iPhone won't play a video
// from a server that answers that way, so the folders with films (how/media, demo/media, kit/media) come through here.
// One byte range per request (what a video element asks for): 206 with the slice streamed from the asset, 416 for a
// range the file can't answer, and anything else, or no Range at all, is the asset as Pages serves it. Pages hands a
// Function the asset without its length, so each film's size comes from media-sizes.json, written by the build.

let sizes; // the deploy's media-sizes.json, read once per isolate (an isolate serves one deployment)
const sizeOf = async (env, url) => {
  sizes ??= env.ASSETS.fetch(new URL('/media-sizes.json', url)).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  return (await sizes)[new URL(url).pathname];
};

export async function serveRange({ request, env }) {
  const ask = new Headers(request.headers);
  ask.delete('Range'); // the whole asset, sliced here
  const asset = await env.ASSETS.fetch(new Request(request.url, { method: request.method === 'HEAD' ? 'HEAD' : 'GET', headers: ask }));
  const size = await sizeOf(env, request.url);
  const headers = new Headers(asset.headers);
  headers.set('Accept-Ranges', 'bytes');
  const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('Range') ?? '');
  if (asset.status !== 200 || !match || !(size > 0) || (match[1] === '' && match[2] === '')) return new Response(asset.body, { status: asset.status, headers });

  let start, end;
  if (match[1] === '') [start, end] = [Math.max(0, size - Number(match[2])), size - 1]; // the last N bytes
  else [start, end] = [Number(match[1]), match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1)];
  if (start >= size || start > end) {
    asset.body?.cancel();
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' } });
  }

  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  if (request.method === 'HEAD') return new Response(null, { status: 206, headers });
  return new Response(slice(asset.body, start, end + 1), { status: 206, headers });
}

// The bytes [from, to) of a stream, skipping what comes before without copying it and stopping once past the end.
function slice(body, from, to) {
  const reader = body.getReader();
  let at = 0;
  return new ReadableStream({
    async pull(out) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return out.close();
        const lo = Math.max(from - at, 0), hi = Math.min(to - at, value.byteLength);
        at += value.byteLength;
        if (hi > lo) out.enqueue(value.subarray(lo, hi));
        if (at >= to) {
          reader.cancel();
          return out.close();
        }
        if (hi > lo) return;
      }
    },
    cancel: () => reader.cancel(),
  });
}

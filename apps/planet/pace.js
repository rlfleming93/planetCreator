/* Planet Creator — the build's pace. Building a week is seconds of work on a phone, and done as one task it holds the
 * page (and a page holding the planet in a frame, which shares its thread) for all of it. So createApp awaits between
 * its phases and the long loops await pace() as they go: once a slice has run SLICE_MS, the thread goes back to the
 * page for a turn and the build carries on after it. Nothing the build computes depends on where a slice ends, so a
 * pinned capture paints the same pixels however its slices fell. */
const SLICE_MS = 12;
let sliceEnd = 0;

// scheduler.yield where there is one (the build comes back ahead of other queued work); a message elsewhere, which
// a nested timer's 4 ms clamp does not slow. In a frame (the galaxy's dive) the build always takes a plain message:
// a scheduler.yield continuation runs ahead of the host page's own frames, and the host then paints only every
// 100 ms or so.
const framed = typeof window !== 'undefined' && window.top !== window;
const turn = globalThis.scheduler?.yield && !framed
  ? () => globalThis.scheduler.yield()
  : () => new Promise((resolve) => {
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = () => { port1.close(); resolve(); };
    port2.postMessage(null);
  });

/** At once while the slice has time left; after a turn of the event loop once it has none. */
export async function pace() {
  if (performance.now() < sliceEnd) return;
  await turn();
  sliceEnd = performance.now() + SLICE_MS;
}

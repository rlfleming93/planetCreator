/* Planet Creator — the dive: one zoom from the whole galaxy down to a week's ground, and back up.
 *
 * The galaxy's rail (galaxy.js) zooms in on a picked week until its planet is box() px across (HANDOFF of the
 * screen's shorter side). There the real planet takes over, in a same-origin frame laid over the galaxy so that its
 * poster stands exactly where the galaxy's painting of it stood, and the two cross (FADE); while they cross the
 * galaxy's last frame is kept over the planet as it zooms. From there the zoom is the planet's own: its orbit, its
 * landing, its walk. Zoomed back out past where it came in, the planet hands the zoom back with a picture of itself
 * as it then stands, which the galaxy paints the week with, and the two cross again; the galaxy's rail runs on out to
 * the whole galaxy. 'Land on it' is the same dive, flown, and the back word (or Escape) the same way up. With reduced
 * motion every crossing is a cut.
 *
 * Only one of the two draws at a time (two WebGL contexts never both draw): the galaxy is paused while the planet
 * has the screen, and the planet held while the galaxy has it. A week's planet is fetched once the week has stayed
 * picked a moment (DWELL) and the page is next idle, one at a time.
 *
 * The planet embed (apps/planet/base.js):
 *   ../planet/ink.html?embed=1#p=<share code>   html.embed (ink.html hides its page chrome); window.__app as ever
 *   planet → page (postMessage, same origin, data.source 'planet'):
 *     { type: 'ready' }                    its first frame is drawn; it then holds (draws nothing) until shown
 *     { type: 'zoom-out-past-max', by }    zoomed out past its seat: the zoom (by, over 1: what is left of it) is the
 *                                          page's again, and __app.embed.still holds the seat's square as it last
 *                                          stood; it holds
 *     { type: 'zoom', by }                 held, a zoom it was given (over 1 in), for the page to use
 *   page → planet (__app.embed):
 *     seat(box)         the page's picture of it: its poster's crop square, box CSS px across in the middle of the
 *                       frame, as far out as it zooms; held, the planet is parked there
 *     hold(on)          draw nothing (the page has the screen), or draw again
 *     zoom(f)           zoom by f, as a pinch would; land(instant) and leave(instant): its own Land and Orbit
 *     view()            how many CSS px across the seat's square is now, so the page keeps its picture over it
 *   Standalone, a week of Ryan's shelf zoomed out past its farthest flies up to ../galaxy/#week=<YYYY-MM-DD>, which
 *   opens on that week (the galaxy page's deep link).
 *
 * createDive({ sky, src, title, planetPx, layer, status, onChange, onBack }): sky is the galaxy (createGalaxy), src(i)
 * and title(i) a week's planet frame and its name, planetPx() the page's picked planet's size at the guide's
 * distance, layer the element the frame goes in, status a polite live region; onChange(state) follows the state
 * ('galaxy', 'entering', 'planet', 'leaving'), onBack(i) is asked to take the galaxy on out to week i's own view
 * after the way back up. Returns the hooks galaxy.js's dive option wants (box, enter, zoom) and watch(i), land(i),
 * leave(), up(), and tick() for each galaxy frame: as the picked week's planet grows toward the hand-over the
 * page's own words step back (body.nearing, its --near from 0 to 1).
 */

const HANDOFF = 0.55; // the picked planet's painting, as a share of the screen's shorter side, where the planet takes over
const FADE = 450; // ms the two views cross
const DWELL = 900; // ms a week stays picked before its planet is fetched
const LAND = 1100; // ms the flown dive ('Land on it') takes to the hand-over
const WAIT = 25000; // ms a planet may take to be ready before the dive gives up on it
const SAID = 300; // ms the hand-over waits before it says the planet is on its way

export function createDive({ sky, src, title, planetPx, layer, status, onChange, onBack }) {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const skyEl = sky.canvas.parentElement;
  const circle = {}, was = { x: 0, y: 0, r: 0 }, seatAt = { x: 0, y: 0, box: 1 }, nowAt = { x: 0, y: 0, box: 1 };
  let state = 'galaxy', frame = null, pending = null, dwell = 0, flying = -1, picked = -1, near = 0, restAt = 0;
  const box = () => HANDOFF * Math.min(innerWidth, innerHeight);
  const set = (s) => { state = s; onChange?.(s); };
  const after = (n, fn) => requestAnimationFrame(() => (n > 1 ? after(n - 1, fn) : fn()));
  // the page's next idle moment (a turn later where a browser has no idle callback)
  const idle = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 1000 }) : setTimeout(fn));
  const say = (text) => { status.textContent = text; };
  const planetOf = (i, out) => sky.planetOf(i, out);

  // ---- the planet's frame: one at a time, held (and unseen) until it has the screen
  function load(i) {
    if (frame?.i === i) return frame;
    drop();
    const el = Object.assign(document.createElement('iframe'), { src: src(i), title: `${title(i)}: its planet`, tabIndex: -1 });
    el.setAttribute('aria-hidden', 'true');
    el.inert = true;
    const f = (frame = { i, el, app: null, win: null, box: 1, ready: null, resolve: null });
    f.ready = new Promise((resolve) => { f.resolve = resolve; });
    layer.prepend(el);
    return f;
  }
  function drop() {
    if (!frame) return;
    frame.win?.removeEventListener('keydown', onPlanetKey, true);
    frame.app?.renderer?.dispose();
    frame.app?.renderer?.forceContextLoss();
    frame.el.remove();
    frame = null;
  }
  function shown(f, on) {
    f.el.inert = !on;
    f.el.tabIndex = on ? 0 : -1;
    if (on) f.el.removeAttribute('aria-hidden');
    else f.el.setAttribute('aria-hidden', 'true');
  }
  addEventListener('message', (e) => {
    const f = frame, d = e.data;
    if (!f || e.source !== f.el.contentWindow || e.origin !== location.origin || d?.source !== 'planet') return;
    if (d.type === 'ready') {
      f.win = e.source;
      f.app = f.win.__app;
      f.win.addEventListener('keydown', onPlanetKey, true);
      f.resolve(true);
    } else if (d.type === 'zoom-out-past-max') out(d.by);
    else if (d.type === 'zoom') sky.zoomBy(d.by);
  });
  // Escape in the planet goes back up, once its own card (which Escape closes first) is away
  function onPlanetKey(e) {
    if (e.key !== 'Escape' || state !== 'planet' || frame?.win.document.querySelector('.pc-info:not([hidden])')) return;
    e.preventDefault();
    leave();
  }

  /** The page picked week i (or let go, -1). Its planet is fetched once the eye has been at rest on it a moment
   *  (DWELL), in the page's next idle moment after that: it builds on this page's own thread, so it should not come
   *  while the galaxy is moving or busy. One planet at most, and none kept once its week is let go; one still building
   *  for another week is let go at once, so its build never holds up the flight to the new one. */
  function watch(i) {
    picked = i;
    restAt = performance.now();
    clearTimeout(dwell);
    if (i < 0) {
      if (state === 'galaxy' && !pending) drop();
      return;
    }
    if (frame?.i === i) return;
    if (frame && !frame.app && state === 'galaxy' && !pending && flying < 0) drop();
    const fetch = () => {
      if (picked !== i || frame?.i === i) return;
      if (state === 'galaxy' && !pending && performance.now() - restAt >= DWELL) load(i);
      else dwell = setTimeout(idle, 200, fetch);
    };
    dwell = setTimeout(idle, DWELL, fetch);
  }
  // each galaxy frame: whether the eye is moving (for the fetch), and how far the picked week's planet has grown from
  // its own view to the hand-over, for the page's words to step back by (past half way they let touches through to
  // the galaxy, so a pinch over a faded card still zooms)
  function tick() {
    let k = 0;
    if (picked >= 0 && state !== 'planet') {
      const c = planetOf(picked, circle), from = planetPx();
      if (Math.abs(c.x - was.x) + Math.abs(c.y - was.y) + Math.abs(c.r - was.r) > 0.5) restAt = performance.now();
      Object.assign(was, c);
      if (c.visible) k = Math.min(1, Math.max(0, (2 * c.r - from) / Math.max(1, box() - from)));
    }
    if (Math.abs(k - near) < 0.004 && k > 0 === near > 0) return;
    near = k;
    document.body.classList.toggle('nearing', k > 0);
    document.body.classList.toggle('neared', k > 0.5);
    document.body.style.setProperty('--near', k.toFixed(3));
  }

  /** The galaxy's rail reached the hand-over on week i, with `rest` of the zoom left over; or, the planet up, more of
   *  a zoom that began on the galaxy. */
  function enter(i, rest = 1) {
    if (state === 'entering' || state === 'planet') return zoom(rest);
    if (pending) { pending.rest *= rest; return; }
    pending = { i, rest };
    ready(i).then((ok) => {
      if (pending?.i !== i) return;
      if (ok) go();
      else pending = null;
    });
  }
  // week i's planet fetched (if it is not yet) and ready: true, or false once it has taken too long (said, and let go)
  function ready(i) {
    const f = load(i);
    if (f.app) return Promise.resolve(true);
    const saying = setTimeout(() => say('Opening the planet…'), SAID);
    return Promise.race([f.ready, new Promise((done) => setTimeout(done, WAIT, false))]).then((ok) => {
      clearTimeout(saying);
      say(ok ? '' : 'The planet did not open. Zoom in again to try once more.');
      if (!ok && frame === f) drop();
      return ok && frame === f;
    });
  }
  // the hand-over: the planet parked at its seat (where the painting stands now) and shown, the galaxy held still
  function go() {
    const { i, rest } = pending, f = frame, c = planetOf(i, circle);
    pending = null;
    if (!f?.app || f.i !== i || !c.visible || 2 * c.r < 0.97 * box()) return; // zoomed away while it came
    f.box = 2 * c.r;
    Object.assign(seatAt, { x: c.x, y: c.y, box: f.box });
    f.app.embed.seat(f.box);
    f.app.embed.hold(false);
    sky.pause(true);
    if (flying === i) f.app.embed.land(still);
    else if (rest > 1.0001) f.app.embed.zoom(rest);
    flying = -1;
    shown(f, true);
    set('entering');
    after(2, () => (still ? arrive(f) : cross(f, true))); // the planet's first frame at its seat is drawn by then
  }
  /** The galaxy's zoom while the planet has the screen: the rest of a pinch that began on the galaxy. */
  function zoom(f) {
    if (frame?.app && (state === 'entering' || state === 'planet')) frame.app.embed.zoom(f);
  }
  // the two crossing, the one going kept over the one coming (the galaxy's last frame over the planet as it zooms in,
  // the planet's over the galaxy as it draws back), until the fade (CSS, by the state) is over
  function cross(f, inward) {
    const t0 = performance.now(), want = inward ? 'entering' : 'leaving';
    const step = (now) => {
      if (state !== want || frame !== f) return;
      if (inward) Object.assign(nowAt, { x: innerWidth / 2, y: innerHeight / 2, box: f.app.embed.view() });
      else {
        const c = planetOf(f.i, circle);
        Object.assign(nowAt, { x: c.x, y: c.y, box: 2 * c.r });
      }
      lay(inward ? skyEl : f.el, nowAt);
      if (now - t0 < FADE) requestAnimationFrame(step);
      else if (inward) arrive(f);
      else home(f);
    };
    requestAnimationFrame(step);
  }
  // lay a view so the seat's square stands where `to` is ({ x, y, box }, CSS px)
  function lay(el, to) {
    const k = to.box / seatAt.box;
    el.style.transform = `translate(${(to.x - k * seatAt.x).toFixed(1)}px, ${(to.y - k * seatAt.y).toFixed(1)}px) scale(${k.toFixed(4)})`;
  }
  function arrive(f) {
    skyEl.style.transform = '';
    set('planet');
    f.el.focus({ preventScroll: true });
  }
  function home(f) {
    f.el.style.transform = '';
    if (picked < 0) drop(); // its week let go while the two crossed
    set('galaxy');
  }

  // the planet handed the zoom back: the galaxy's painting of the week becomes the planet as it now stands, the
  // galaxy is put where the hand-over was, and the two cross back
  function out(by = 1) {
    const f = frame;
    if (!f || (state !== 'planet' && state !== 'entering')) return;
    const pic = document.createElement('canvas'), from = f.app.embed.still;
    pic.width = from.width;
    pic.height = from.height;
    pic.getContext('2d').drawImage(from, 0, 0);
    sky.paintWeek?.(f.i, pic);
    skyEl.style.transform = '';
    sky.atDive(f.i, f.box);
    Object.assign(seatAt, { x: innerWidth / 2, y: innerHeight / 2, box: f.box }); // the planet's frame, as it stands
    sky.pause(false);
    shown(f, false);
    set('leaving');
    if (leaving) { // the way back asked for: the zoom's leftover is spent, and the galaxy goes on out to the week
      leaving = false;
      onBack?.(f.i);
    } else if (by > 1.0001) sky.zoomBy(1 / by);
    if (still) return home(f);
    after(1, () => cross(f, false));
  }

  /** 'Land on it': the dive flown, from the galaxy to week i's ground. */
  function land(i) {
    if (state !== 'galaxy' || pending || flying >= 0) return;
    flying = i;
    ready(i).then((ok) => { // the planet builds on this thread: it comes before the flight, not in the middle of it
      if (!ok || flying !== i || state !== 'galaxy') return void (flying = -1);
      if (still) { // a cut: the galaxy where the hand-over is, the planet landed at once
        sky.atDive(i);
        return enter(i);
      }
      const c = planetOf(i, circle), total = Math.max(1.01, box() / Math.max(1, 2 * c.r));
      const t0 = performance.now();
      let done = 0, extra = 0;
      const step = (now) => {
        if (flying !== i || state !== 'galaxy' || pending) return;
        const u = Math.min(1, (now - t0) / LAND), e = u * u * (3 - 2 * u);
        if (u < 1) sky.zoomBy(total ** (e - done));
        else if (extra++ < 60) sky.zoomBy(1.06); // not quite there (the rail turned as well as closed): on in
        else return void (flying = -1);
        done = e;
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  /** The way back up from the planet (the back word, Escape): off the ground, out to its seat, back to the galaxy
   *  and on out to the week's own view there (onBack). */
  let leaving = false;
  function leave() {
    if (state !== 'planet' || !frame?.app) return;
    const f = frame, t0 = performance.now();
    let last = t0;
    leaving = true;
    if (f.app.mode === 'surface') f.app.embed.leave(still);
    const step = (now) => {
      if (state !== 'planet' || frame !== f) return;
      if (now - t0 > 8000) return void (leaving = false);
      // out at about half the size every half second (nothing while it flies up off the ground)
      f.app.embed.zoom(still ? 1e-3 : Math.exp(-1.6 * Math.min(0.1, (now - last) / 1000)));
      last = now;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // a new layout while the planet is up: the galaxy is put where the hand-over now is, and the planet's seat with it
  addEventListener('resize', () => {
    const f = frame;
    if (state !== 'planet' || !f?.app) return;
    f.box = box();
    sky.atDive(f.i, f.box);
    f.app.embed.seat(f.box);
  });

  return {
    box,
    watch,
    enter,
    tick,
    zoom,
    land,
    leave,
    /** Whether the planet has the screen (or is taking it). */
    up: () => state === 'entering' || state === 'planet',
    get state() { return state; },
    /** The frame of the planet the dive has (or null): for a capture. */
    get frame() { return frame?.el ?? null; },
  };
}

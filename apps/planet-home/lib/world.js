/* The real Planet Creator (apps/planet/ink.html, served at /planet/) in an iframe, fed a week through the
 * same #p= link the app already reads. Nothing is re-implemented: what shows is exactly what the app draws. */
const PAGE = new URL('../planet/ink.html', import.meta.url).pathname;
let visits = 0;

// the app's own "Make yours" and share controls are hidden (these pages stand in for them); `quiet` hides the
// rest of its chrome too, for the reading and the front door, which want the bare world
const CSS = `.pc-hint ~ *, .pc-maker-backdrop { display: none !important; }
html.ph-quiet .pc-hud, html.ph-quiet .pc-guide, html.ph-quiet .pc-info, html.ph-quiet .pc-near, html.ph-quiet .pc-arrow { display: none !important; }`;

export const setQuiet = (frame, quiet) => frame.contentDocument?.documentElement.classList.toggle('ph-quiet', quiet);

/** Load the planet `code` (a share code, no '#p=') into `frame`. Resolves with the app (the iframe's
 * window.__app) once it has drawn. */
export function showWorld(frame, code, { quiet = true } = {}) {
  return new Promise((resolve, reject) => {
    frame.onload = () => {
      const win = frame.contentWindow;
      const style = win.document.createElement('style');
      style.textContent = CSS;
      win.document.head.append(style);
      setQuiet(frame, quiet);
      const t0 = performance.now();
      const wait = () => (win.__ready && win.__app ? resolve(win.__app)
        : performance.now() - t0 > 30000 ? reject(new Error('The planet took too long to draw.')) : setTimeout(wait, 50));
      wait();
    };
    frame.src = `${PAGE}?v=${++visits}#p=${code}`;
  });
}

// The page scrolls past an embedded world; it only takes the mouse and keys (drag, wheel, WASD) once asked to.
export function grab(frame, on) {
  frame.style.pointerEvents = on ? 'auto' : 'none';
  if (on) { frame.focus(); frame.contentWindow?.focus(); }
}

// the app's field guide, one row per feature in features.list order: a click turns the camera to it, its Go lands on it
export const guideRows = (frame) => [...(frame.contentDocument?.querySelectorAll('.pc-guide > ul > li') || [])];

// Hand the visitor the world: the app's own chrome back (its hint with it, and on a touch screen its stick and
// buttons), the pointer and keys to it, and the runner put down beside feature `at` (an index into features.list).
export function land(frame, at) {
  setQuiet(frame, false);
  grab(frame, true);
  const go = guideRows(frame)[at]?.querySelector('.pc-go');
  if (go) go.click();
  else frame.contentWindow?.__app?.setMode('surface');
}

// What a week made, in words, from the generator's own features (base.js readWeek kinds).
const NOUNS = {
  range: ['mountain range', 'mountain ranges'], valley: ['valley', 'valleys'], constructed: ['built landmark', 'built landmarks'],
  calm: ['grove', 'groves'], spires: ['stand of rock spires', 'stands of rock spires'], wheel: ['stone wheel', 'stone wheels'],
  lagoon: ['lagoon', 'lagoons'], cairn: ['cairn', 'cairns'], monument: ['finish monument', 'finish monuments'],
};
export function madeOf(features) {
  const count = {};
  for (const f of features.list) count[f.kind] = (count[f.kind] || 0) + 1;
  const parts = Object.entries(count).map(([k, n]) => `${n === 1 ? 'a' : n} ${NOUNS[k]?.[n === 1 ? 0 : 1] || k}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0] || 'bare ground';
}

export const longDate = (week) => new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${week}T00:00:00Z`));

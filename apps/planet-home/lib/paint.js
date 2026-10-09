/* A still of a planet, painted by the real app: /planet/ink.html in a hidden iframe at a fixed clock (?t=1,
 * so the same link always paints the same picture), read off its canvas right after it draws a frame.
 * One at a time: each is a whole WebGL app. The app builds its world in one go (~0.4 s on a fast laptop),
 * so a page painting many should keep stills it has painted (store.js putThumb). paintGlobe paints the
 * planet alone, lifted off its sheet, for the galaxy's week planets. */
import { codeOf } from './store.js';

let queue = Promise.resolve();
const oneAtATime = (work) => {
  const job = queue.then(work);
  queue = job.catch(() => {});
  return job;
};

/** Resolves with a square canvas: the planet `size` px across its middle, cut from a render about `px` wide.
 * `crop` is the share of the shorter side kept — unless the app framed the poster for a crop of its own
 * (`__app.posterCrop`, set when base.js's craft.frame is on), which is then the crop that is taken. */
export function paint(link, { px = 800, size = 400, crop = 0.8 } = {}) {
  return oneAtATime(() => inApp(codeOf(link), px, '', (win) => {
    const src = win.__app.renderer.domElement;
    // queued after the app's own frame callback, so its canvas still holds that frame
    return new Promise((resolve) => win.requestAnimationFrame(() => {
      const out = document.createElement('canvas');
      out.width = out.height = size;
      // The app composes the poster for its own crop when craft.frame is on, and
      // says which one in __app.posterCrop; otherwise the caller's crop stands.
      const cut = Number(win.__app?.posterCrop) || crop;
      const s = Math.min(src.width, src.height) * cut;
      out.getContext('2d').drawImage(src, (src.width - s) / 2, (src.height - s) / 2, s, s, 0, 0, size, size);
      resolve(out);
    }));
  }));
}

/** A globe picture's globe: its radius, as a share of the picture's side. */
export const GLOBE = 0.42;

/** Resolves with { canvas, still }: the week's planet alone, centred on a transparent square `size` px across,
 * the disc it covers GLOBE of the side across its radius. It is the classic poster's globe (its aim, its light,
 * its world, weather and life) without what stands round it (its companions, the race's ring and their shadow,
 * its system's sun and sky things) or the space behind it. `still` is that radius as a share of a still cut at
 * `crop` from the classic poster, so a page can stand the globe at the size the poster has it. It is pulled in the
 * ink frame: a world's print (look.print auto) paints the whole sheet, and the lift would take that for the globe. */
export function paintGlobe(link, { px = 1024, size = 384, crop = 0.8 } = {}) {
  return oneAtATime(() => inApp(codeOf(link), px, '&p.poster.shot=classic&p.companions.ringShadow=0&p.look.print=ink', (win) => lift(win, size, crop)));
}

// The app in a hidden square frame about `px` device px across, its URL's dials (`?p.<key>=…`) added to the fixed
// clock, handed to `work` once it has drawn.
async function inApp(code, px, dials, work) {
  // the app's own resolution rule (base.js resizeRenderer): the device's pixel ratio up to 2, and never
  // under 0.75 once a frame would pass 2.8 megapixels; so a big still is a big frame at 0.75
  const ratio = px * px > 2.8e6 ? 0.75 : Math.min(devicePixelRatio || 1, 2);
  const css = Math.ceil(px / ratio);
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = `position:fixed;top:0;left:${-css - 64}px;width:${css}px;height:${css}px;border:0;pointer-events:none`;
  frame.src = `${new URL('../planet/ink.html', import.meta.url).pathname}?t=1${dials}#p=${code}`;
  document.body.append(frame);
  try {
    const t0 = performance.now();
    while (!frame.contentWindow?.__ready) {
      if (performance.now() - t0 > 30000) throw new Error('The planet took too long to paint.');
      await new Promise((r) => setTimeout(r, 50));
    }
    return await work(frame.contentWindow);
  } finally {
    frame.remove();
  }
}

// The planet lifted off its sheet. The frame is drawn four times: its sky cleared to black and to white, then with
// the whole scene out of the camera's sight (the bare sheet: what the app's passes paint with no world in it) the
// same two ways. A pixel covers as much of the sky as the clear colour shows through it less than it does through
// the bare sheet, and its colour is the black frame with the bare sheet's share taken off. Anything the passes paint
// round the world whether it is there or not (the air's glow, a star's corona) is the sheet's, and stays behind.
async function lift(win, size, crop) {
  const { scene, camera, renderer } = win.__app, src = renderer.domElement, W = src.width, H = src.height;
  const work = document.createElement('canvas');
  work.width = W;
  work.height = H;
  const g = work.getContext('2d', { willReadFrequently: true });
  const grab = (clear) => {
    renderer.setClearColor(clear, 1);
    return new Promise((resolve) => win.requestAnimationFrame(() => {
      g.drawImage(src, 0, 0);
      resolve(g.getImageData(0, 0, W, H).data);
    }));
  };
  // out of the camera's sight on a layer it never looks at: the app sets .visible itself every frame
  const away = (o) => o.traverse((n) => n.layers.set(31));
  for (const c of scene.getObjectByName('companions')?.children ?? []) away(c);
  scene.traverse((n) => { if (n.name === 'ink-sky' || n.name === 'ink-space') away(n); });
  await grab(0x000000);
  const fb = await grab(0x000000), fw = await grab(0xffffff);
  for (const c of scene.children) away(c);
  const bw = await grab(0xffffff), bb = await grab(0x000000);

  const rgba = new Uint8ClampedArray(W * H * 4);
  let area = 0;
  for (let p = 0, o = 0; o < rgba.length; p++, o += 4) {
    const dB = bw[o] + bw[o + 1] + bw[o + 2] - bb[o] - bb[o + 1] - bb[o + 2];
    const dF = fw[o] + fw[o + 1] + fw[o + 2] - fb[o] - fb[o + 1] - fb[o + 2];
    // where the bare sheet hides the clear colour itself (a glow laid over it), the planet is what differs from it
    let a = dB > 36 ? 1 - Math.min(1, Math.max(0, dF / dB))
      : Math.abs(fb[o] - bb[o]) + Math.abs(fb[o + 1] - bb[o + 1]) + Math.abs(fb[o + 2] - bb[o + 2]) > 36 ? 1 : 0;
    if (a < 0.03) continue;
    if (a > 0.97) a = 1;
    for (let c = 0; c < 3; c++) rgba[o + c] = (fb[o + c] - (1 - a) * bb[o + c]) / a;
    rgba[o + 3] = 255 * a;
    area += a;
    const x = p % W, y = (p - x) / W;
    if (a > 0.5 && (x < 2 || y < 2 || x >= W - 2 || y >= H - 2)) throw new Error('The globe runs off its frame.');
  }
  g.putImageData(new ImageData(rgba, W, H), 0, 0);
  // the globe's radius: the disc that covers as much of the sheet as the planet does (a lumpy marble's included)
  const r = Math.sqrt(area / Math.PI), side = r / GLOBE;
  const c = camera.position.clone().set(0, 0, 0).project(camera); // its centre on the sheet
  const cx = ((c.x + 1) / 2) * W, cy = ((1 - c.y) / 2) * H;
  const out = document.createElement('canvas');
  out.width = out.height = size;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(work, cx - side / 2, cy - side / 2, side, side, 0, 0, size, size);
  return { canvas: out, still: r / (crop * Math.min(W, H)) };
}

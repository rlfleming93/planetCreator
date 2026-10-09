/* The bench's shared capture stage. serve.mjs gives the renderer and a tool one origin (so a still's canvas can be
 * read), and these helpers drive the real app through it: find a managed Chrome, launch one headless browser whose
 * single page opens a pinned instant, wait for window.__ready, then read the renderer's own canvas. round.mjs's
 * review rounds and wall.mjs's contact sheets both capture through here, so a still can never mean two different
 * things in two bench commands.
 */
import { existsSync } from 'node:fs';
import { constants as FS, access, lstat, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

const repoRoot = resolve(import.meta.dir, '../..');
const benchRoot = join(repoRoot, 'var/bench');
// Playwright: PLANET_PLAYWRIGHT, else this repo's own (`bun add playwright`), else VARÐA's, in its checkout beside it.
const ownPlaywright = join(repoRoot, 'node_modules/playwright/index.mjs');
const playwrightPath = process.env.PLANET_PLAYWRIGHT ? resolve(repoRoot, process.env.PLANET_PLAYWRIGHT)
  : existsSync(ownPlaywright) ? ownPlaywright : resolve(repoRoot, '../personalBranding/node_modules/playwright/index.mjs');
// A still is a viewport, not a thumbnail: the app sizes its own canvas from this, and every capture asserts it.
const VIEWPORT = Object.freeze({ width: 768, height: 768, deviceScaleFactor: 1 });

export { benchRoot, playwrightPath, repoRoot, VIEWPORT };

/** A path the way a log line or manifest should carry it, whatever platform built it. */
export function posix(path) {
  return path.split(sep).join('/');
}

/** True when `child` sits inside `parent` (or is it). Used to keep outputs where they belong. */
export function isWithin(parent, child) {
  const rel = relative(parent, child);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}

/** lstat, with absence as a plain null instead of a thrown error. */
export async function maybeStat(path) {
  try { return await lstat(path); }
  catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
}

export async function requireExecutable(path) {
  if (!path) return null;
  const candidate = isAbsolute(path) ? path
    : path.includes(sep) ? resolve(repoRoot, path)
      : typeof Bun.which === 'function' ? Bun.which(path) : null;
  if (!candidate) return null;
  try { await access(candidate, FS.X_OK); return candidate; }
  catch { return null; }
}

/** A Chrome that can run WebGL headless, from the environment, Playwright's own download, or the usual installs. */
export async function locateChrome(chromium) {
  const candidates = [process.env.CHROME_BIN, process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH];
  const managed = join(homedir(), '.omp/puppeteer/chrome');
  try {
    const versions = (await readdir(managed, { withFileTypes: true })).filter((entry) => entry.isDirectory())
      .map((entry) => entry.name).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const version of versions) {
      for (const arch of ['chrome-mac-arm64', 'chrome-mac-x64']) {
        candidates.push(join(managed, version, arch, 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'));
      }
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  try { candidates.push(chromium.executablePath()); } catch {}
  candidates.push(
    '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/opt/homebrew/bin/chromium', '/usr/local/bin/chromium',
  );
  for (const candidate of candidates) {
    const found = await requireExecutable(candidate);
    if (found) return found;
  }
  throw new Error(`Managed Chrome was not found under ${managed}. Set CHROME_BIN to a Chrome/Chromium executable.`);
}

/**
 * One headless browser on one page for a whole command. Non-loopback traffic is blocked before any still is taken:
 * these tools read the app's canvas, never the network, and a capture must not depend on what the internet says.
 */
export async function launchBench({ chromium, executablePath }) {
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--no-first-run', '--no-default-browser-check', '--use-mock-keychain', '--password-store=basic',
      '--disable-background-networking', '--disable-component-update', '--disable-domain-reliability', '--disable-sync',
      '--metrics-recording-only', '--no-pings', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext({ viewport: { width: VIEWPORT.width, height: VIEWPORT.height }, deviceScaleFactor: VIEWPORT.deviceScaleFactor });
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if ((url.protocol === 'http:' || url.protocol === 'https:') && !local) await route.abort('blockedbyclient');
    else await route.continue();
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  // three.js reports a shader that failed to compile on the console, not as a page error, and the frame then draws
  // without that material: a capture that looks like a success but shows an empty globe or a black print.
  page.on('console', (message) => {
    if (message.type() === 'error' && /Shader Error|WebGLProgram|THREE\.WebGLShader/i.test(message.text())) {
      pageErrors.push(message.text().split('\n')[0]);
    }
  });
  return { browser, context, page, pageErrors };
}

/**
 * The app's own pinning URL: one origin, one instant, one parameter set. `item` carries either a share code (which
 * travels in the fragment) or a seed name (which the served seed script reads); `extra` adds the ?p.<key>= overrides
 * a wall column compares, which win over the packed object exactly as apps/planet/params.js documents.
 */
export function makeUrl(origin, item, encodedParams, { t, view = 'orbit', yaw, at, extra } = {}) {
  const query = new URLSearchParams({ view, params: encodedParams });
  if (t !== undefined) query.set('t', String(t));
  if (yaw !== undefined) query.set('yaw', String(yaw));
  if (at) query.set('at', at);
  for (const [key, value] of extra || []) query.set(key, String(value));
  if (item.seed) query.set('seed', item.seed);
  const url = `${origin}/planet/ink.html?${query}`;
  if (item.code) return `${url}#p=${encodeURIComponent(item.code)}`;
  if (item.seed) return url;
  throw new Error(`Item ${item.id || item.week || '(unnamed)'} has neither a share code nor a seed.`);
}

/**
 * Open a pinned instant and hand back what the app says it built. A capture is only believable if the renderer came
 * up as a live WebGL canvas of at least the viewport: anything smaller is a page that never finished resizing.
 */
export async function openPlanet(page, url, itemLabel, pageErrors) {
  pageErrors.length = 0;
  let response;
  try {
    response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if (response && !response.ok()) throw new Error(`HTTP ${response.status()}`);
    await page.waitForFunction(() => Boolean(window.__ready && window.__app), null, { timeout: 60_000 });
    const state = await page.evaluate(() => {
      const app = window.__app;
      const canvas = app?.renderer?.domElement;
      const gl = app?.renderer?.getContext?.();
      return {
        canvas: canvas instanceof HTMLCanvasElement,
        width: canvas?.clientWidth || 0,
        height: canvas?.clientHeight || 0,
        webgl: Boolean(gl && typeof gl.getParameter === 'function'),
        monument: Boolean(app?.features?.monument),
        features: Array.isArray(app?.features?.list)
          ? app.features.list.map((feature) => ({ id: String(feature.id), kind: String(feature.kind) }))
          : [],
      };
    });
    if (!state.canvas || !state.webgl) throw new Error('window.__app.renderer does not expose a live WebGL canvas');
    if (state.width < VIEWPORT.width || state.height < VIEWPORT.height) {
      throw new Error(`renderer canvas is ${state.width}×${state.height}; expected at least ${VIEWPORT.width}×${VIEWPORT.height}`);
    }
    if (pageErrors.length) throw new Error('the page reported errors while building');
    return state;
  } catch (error) {
    const detail = pageErrors.length ? ` Page errors: ${pageErrors.slice(-3).join(' | ')}` : '';
    throw new Error(`Could not open ${itemLabel}: ${error.message}.${detail}`, { cause: error });
  }
}

/**
 * The renderer's own canvas, written as a PNG at the moment the app last drew it: the copy is queued after the app's
 * frame callback so the pixels are still that frame's, not a partial next one.
 */
export async function captureCanvas(page, path, label) {
  const data = await page.evaluate(async () => {
    const source = window.__app?.renderer?.domElement;
    if (!(source instanceof HTMLCanvasElement)) return null;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    canvas.getContext('2d').drawImage(source, 0, 0);
    return canvas.toDataURL('image/png');
  });
  const prefix = 'data:image/png;base64,';
  if (typeof data !== 'string' || !data.startsWith(prefix)) throw new Error(`${label} could not read the renderer canvas.`);
  await Bun.write(path, Buffer.from(data.slice(prefix.length), 'base64'));
}

/**
 * The same canvas cut to a square `size` px across its middle — the crop apps/planet-home/lib/paint.js takes for a
 * shelf still, so a contact sheet's cells line up with the stills the home page shows.
 */
export async function captureSquare(page, path, size, label, crop = 0.8) {
  const data = await page.evaluate(async ({ size, crop }) => {
    const source = window.__app?.renderer?.domElement;
    if (!(source instanceof HTMLCanvasElement)) return null;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const side = Math.min(source.width, source.height) * crop;
    canvas.getContext('2d').drawImage(source, (source.width - side) / 2, (source.height - side) / 2, side, side, 0, 0, size, size);
    return canvas.toDataURL('image/png');
  }, { size, crop });
  const prefix = 'data:image/png;base64,';
  if (typeof data !== 'string' || !data.startsWith(prefix)) throw new Error(`${label} could not read the renderer canvas.`);
  await Bun.write(path, Buffer.from(data.slice(prefix.length), 'base64'));
}

/** Advance the app's own clock by hand, so a captured frame is a chosen instant rather than whenever the browser ran. */
export async function callFrame(page, t, delta = 0) {
  return page.evaluate(async ({ time, step }) => {
    if (typeof window.__app?.frame !== 'function') throw new Error('window.__app.frame(t) is unavailable');
    const started = performance.now();
    await window.__app.frame(time, step);
    return performance.now() - started;
  }, { time: t, step: delta });
}

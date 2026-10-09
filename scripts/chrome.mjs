// Headless Chrome for the scripts that paint with the real app: apps/planet-home/shelf/_ryan.mjs's stills and globes
// and scripts/story-render.mjs's clips. It starts Chrome switch for switch as browser-lab's capture.ts did when it
// painted the shelf (new headless; no GPU, ANGLE or colour-profile switches, so Chrome picks its own; none of
// Playwright's defaults), at a device pixel ratio of 1, so a still painted here is byte for byte the one on the shelf.
// Chrome: CHROME_BIN, else a managed Chrome for Testing, else Playwright's own Chromium (`bunx playwright
// install chromium`), else an installed Chrome; Playwright: PLANET_PLAYWRIGHT, else this repo's own (`bun add
// playwright`), else VARÐA's beside it (both found by apps/bench/capture.mjs).
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { locateChrome, playwrightPath } from '../apps/bench/capture.mjs';

const SWITCHES = ['--headless=new', '--no-first-run', '--no-default-browser-check', '--use-mock-keychain', '--password-store=basic',
  '--disable-background-networking', '--hide-scrollbars', '--mute-audio'];

/** A page of `width`×`height` CSS px, and close() for the browser it's in. */
export async function openChrome({ width, height }) {
  if (!existsSync(playwrightPath)) throw new Error('Playwright is missing: run `bun add playwright` in this repo, or set PLANET_PLAYWRIGHT');
  const { chromium } = await import(pathToFileURL(playwrightPath).href);
  const profile = mkdtempSync(join(tmpdir(), 'planet-chrome-'));
  const browser = await chromium.launch({
    executablePath: await locateChrome(chromium),
    ignoreDefaultArgs: true, // the pipe Playwright talks over and a profile of its own are all it adds
    args: [...SWITCHES, '--remote-debugging-pipe', `--user-data-dir=${profile}`],
  });
  // the system's own media features (its dark mode, say), as capture.ts left them: Playwright's default is a light page
  const page = await browser.newPage({ viewport: { width, height }, screen: { width, height }, deviceScaleFactor: 1, colorScheme: null, reducedMotion: null, forcedColors: null, contrast: null });
  return { page, close: async () => { await browser.close(); rmSync(profile, { recursive: true, force: true }); } };
}

// This server deliberately binds only to loopback. It gives the bench and renderer one origin (so an iframe's canvas
// can be read), exposes the private week scripts without copying or symlinking them, and keeps every experiment under
// var/bench. It is not part of the public build and has no route that writes into the app or its private seed store.
import { fileURLToPath } from 'node:url';
import { dirname, extname, relative, resolve } from 'node:path';
import { mkdir, readdir, rename } from 'node:fs/promises';
import { buildPanel } from './panel.mjs';

const benchDir = dirname(fileURLToPath(import.meta.url));
const repoDir = resolve(benchDir, '../..');
const planetDir = resolve(repoDir, 'apps/planet');
const privatePlanetDir = resolve(repoDir, 'var/private/planet');
const snapshotDir = resolve(repoDir, 'var/bench/snapshots');

const MIME = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
};
const jsonHeaders = { 'content-type': MIME['.json'], 'cache-control': 'no-store' };

function json(value, status = 200) {
  return new Response(`${JSON.stringify(value, null, 2)}\n`, { status, headers: jsonHeaders });
}

function inside(root, requested) {
  const path = resolve(root, requested.replace(/^\/+/, ''));
  const rel = relative(root, path);
  return rel && !rel.startsWith('..') && !rel.includes(`..${process.platform === 'win32' ? '\\' : '/'}`) ? path : null;
}

async function fileResponse(path, method = 'GET') {
  const file = Bun.file(path);
  if (!await file.exists()) return null;
  const headers = {
    'content-type': MIME[extname(path).toLowerCase()] || file.type || 'application/octet-stream',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  };
  return new Response(method === 'HEAD' ? null : file, { headers });
}

async function staticResponse(pathname, method) {
  if (pathname === '/' || pathname === '/index.html') return fileResponse(resolve(benchDir, 'index.html'), method);
  if (pathname.startsWith('/planet/')) {
    const subpath = pathname.slice('/planet/'.length);
    if (subpath === 'seed-week.js') {
      return await fileResponse(resolve(privatePlanetDir, 'seed-week.js'), method)
        || fileResponse(resolve(planetDir, 'seed-week.js'), method);
    }
    const seed = /^seeds\/([A-Za-z0-9_-]+\.js)$/.exec(subpath);
    if (seed) {
      return await fileResponse(resolve(privatePlanetDir, 'seeds', seed[1]), method)
        || fileResponse(resolve(planetDir, 'seeds', seed[1]), method);
    }
    const path = inside(planetDir, subpath);
    return path ? fileResponse(path, method) : null;
  }
  const path = inside(benchDir, pathname);
  return path ? fileResponse(path, method) : null;
}

function validParams(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, setting]) => /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(key)
    && ((typeof setting === 'number' && Number.isFinite(setting))
      || (typeof setting === 'string' && (/^#[0-9a-fA-F]{6}$/.test(setting)
        // a named dial such as world.archetype carries one of its own lowercase ids
        || /^[a-z0-9][a-z0-9._-]{0,63}$/.test(setting)))));
}

async function saveSnapshot(request) {
  const text = await request.text();
  if (text.length > 200_000) return json({ error: 'Snapshot is larger than 200 KB.' }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json({ error: 'Snapshot body must be JSON.' }, 400); }
  const name = String(body?.name || '').trim();
  const notes = String(body?.notes || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name)) {
    return json({ error: 'Name must be 1–64 letters, numbers, dots, dashes, or underscores.' }, 400);
  }
  if (name.toLowerCase() === 'default') return json({ error: 'The name “default” is reserved for the built-in parameter set.' }, 400);
  if (notes.length > 4_000) return json({ error: 'Notes must be 4,000 characters or fewer.' }, 400);
  if (!validParams(body?.params)) return json({ error: 'Params must be finite numbers, #rrggbb colours or named choices, keyed by SPEC names.' }, 400);
  await mkdir(snapshotDir, { recursive: true });
  const path = resolve(snapshotDir, `${name}.json`);
  let createdAt = new Date().toISOString();
  try {
    const previous = await Bun.file(path).json();
    if (typeof previous.createdAt === 'string') createdAt = previous.createdAt;
  } catch {}
  const snapshot = { name, notes, createdAt, updatedAt: new Date().toISOString(), params: body.params };
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await Bun.write(temporary, `${JSON.stringify(snapshot, null, 2)}\n`);
  await rename(temporary, path);
  return json(snapshot, 201);
}

async function listSnapshots() {
  await mkdir(snapshotDir, { recursive: true });
  const files = await readdir(snapshotDir, { withFileTypes: true });
  const snapshots = [];
  for (const entry of files) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    try {
      const snapshot = await Bun.file(resolve(snapshotDir, entry.name)).json();
      if (snapshot && typeof snapshot.name === 'string' && validParams(snapshot.params)) snapshots.push(snapshot);
    } catch {}
  }
  snapshots.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) || a.name.localeCompare(b.name));
  return json({ snapshots });
}

export function startBenchServer({ port = Number(process.env.BENCH_PORT || 8800), quiet = false } = {}) {
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.hostname !== '127.0.0.1') return new Response('Misdirected request\n', { status: 421 });
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { return new Response('Bad path\n', { status: 400 }); }
      try {
        if ((pathname === '/api/panel' || pathname === '/panel.json') && request.method === 'GET') return json(await buildPanel());
        if (pathname === '/api/snapshots' && request.method === 'GET') return listSnapshots();
        if (pathname === '/api/snapshot' && request.method === 'POST') {
          if (request.headers.get('origin') !== url.origin) return json({ error: 'Snapshot writes require the bench origin.' }, 403);
          if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) {
            return json({ error: 'Snapshot writes require application/json.' }, 415);
          }
          return saveSnapshot(request);
        }
        if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed\n', { status: 405 });
        const response = await staticResponse(pathname, request.method);
        return response || new Response('Not found\n', { status: 404 });
      } catch (error) {
        console.error(error);
        return json({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });
  if (!quiet) console.log(`Planet bench http://127.0.0.1:${server.port}/`);
  return server;
}

if (import.meta.main) startBenchServer();

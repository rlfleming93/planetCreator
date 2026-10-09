// The bench treats ink.html as the renderer rather than forking the planet. A single visible iframe stays live; every
// wall and comparison image is painted through one off-screen iframe queue at t=1, then reduced to pixels. That keeps
// WebGL memory bounded and makes the A/B number mean the same thing as the generator's existing image pins.
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const initialUrl = new URL(location.href);

let bridge = null;
try {
  bridge = await import('/planet/params.js');
} catch (error) {
  console.warn('Planet parameter bridge is unavailable.', error);
  $('#bridge-error').hidden = false;
}
try {
  // The world registry hands params.js the archetype ids it loads (that module cannot import the registry
  // itself without a cycle), so importing it here keeps the world.archetype dial's list complete.
  await import('/planet/worlds/index.js');
} catch (error) {
  console.warn('Planet world registry is unavailable.', error);
}

const SPEC = Array.isArray(bridge?.SPEC) ? bridge.SPEC : [];
const DEFAULTS = bridge?.DEFAULTS && typeof bridge.DEFAULTS === 'object' ? bridge.DEFAULTS : {};
const specs = new Map(SPEC.map((entry) => [entry.key, entry]));
const utf8 = new TextEncoder();
const unutf8 = new TextDecoder();

function base64urlEncode(value) {
  const bytes = utf8.encode(JSON.stringify(value));
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return JSON.parse(unutf8.decode(Uint8Array.from(binary, (character) => character.charCodeAt(0))));
}

const encode = (value) => bridge?.encodeParams ? bridge.encodeParams(value) : base64urlEncode(value);
const decode = (value) => bridge?.decodeParams ? bridge.decodeParams(value) : base64urlDecode(value);

function coerce(spec, value) {
  // A named dial takes one of its ids, exactly; anything else stays at the default.
  if (Array.isArray(spec.options)) {
    const option = String(value ?? '').trim().toLowerCase();
    return spec.options.includes(option) ? option : spec.default;
  }
  if (typeof spec.default === 'string') return /^#[0-9a-f]{6}$/i.test(String(value)) ? String(value).toLowerCase() : spec.default;
  const number = Number(value);
  if (!Number.isFinite(number)) return spec.default;
  return Math.max(spec.min, Math.min(spec.max, number));
}

function normalizeParams(value = {}) {
  const out = { ...DEFAULTS };
  for (const spec of SPEC) if (Object.hasOwn(value, spec.key)) out[spec.key] = coerce(spec, value[spec.key]);
  return out;
}

function readParams(name) {
  const encoded = initialUrl.searchParams.get(name);
  if (!encoded) return null;
  try { return normalizeParams(decode(encoded)); } catch (error) {
    console.warn(`Ignoring invalid ${name} params in bench URL.`, error);
    return null;
  }
}

function differs(a, b) {
  return typeof a === 'string' ? String(a).toLowerCase() !== String(b).toLowerCase() : Number(a) !== Number(b);
}

function patchFromDefaults(params) {
  const patch = {};
  for (const spec of SPEC) if (differs(params[spec.key], DEFAULTS[spec.key])) patch[spec.key] = params[spec.key];
  return patch;
}

const paramsA = readParams('a') || normalizeParams();
const paramsB = readParams('b') || { ...paramsA };
const state = {
  panelData: null,
  panelMode: initialUrl.searchParams.get('panel') === 'all' ? 'all' : 'core',
  panel: [],
  selectedId: initialUrl.searchParams.get('week'),
  locked: initialUrl.searchParams.get('lock') === '1',
  ab: initialUrl.searchParams.get('mode') === 'ab',
  side: initialUrl.searchParams.get('side') === 'B' ? 'B' : 'A',
  liveMode: initialUrl.searchParams.get('view') === 'surface' ? 'surface' : 'orbit',
  params: { A: paramsA, B: paramsB },
  liveFrame: null,
  liveToken: 0,
  wallToken: 0,
  compareToken: 0,
  snapshots: new Map(),
  stills: new Map(),
};

let paintQueue = Promise.resolve();
let settleTimer = 0;
let reloadTimer = 0;
let toastTimer = 0;
const controlRefs = new Map();

function activeParams() { return state.params[state.side]; }
function selectedWeek() { return state.panelData?.all.find((week) => week.id === state.selectedId) || state.panel[0]; }
function valueText(value) { return typeof value === 'number' ? Number(value.toPrecision(7)).toString() : String(value); }

function showToast(message, error = false) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
}

function makePlanetUrl(week, params, { t = null, view = 'orbit', yaw = null, at = null } = {}) {
  const query = new URLSearchParams();
  if (t !== null) query.set('t', String(t));
  query.set('view', view);
  const patch = patchFromDefaults(params);
  if (Object.keys(patch).length) query.set('params', encode(patch));
  if (yaw !== null) query.set('yaw', String(yaw));
  if (at) query.set('at', at);
  if (week.seed) query.set('seed', week.seed);
  const hash = week.code ? `#p=${encodeURIComponent(week.code)}` : '';
  return `/planet/ink.html?${query}${hash}`;
}

async function waitForPlanet(frame, timeoutMs = 45_000) {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    try {
      if (frame.contentWindow?.__ready && frame.contentWindow?.__app?.renderer?.domElement) {
        await new Promise((resolve) => frame.contentWindow.requestAnimationFrame(resolve));
        return frame.contentWindow;
      }
    } catch {}
    await sleep(50);
  }
  throw new Error('The planet took longer than 45 seconds to paint.');
}

function liveTarget() {
  return state.ab ? $(`#slot-${state.side.toLowerCase()}`) : $('#single-surface');
}

function updateActiveSide() {
  $$('#side-switch [data-side]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.side === state.side)));
  for (const side of ['A', 'B']) {
    const cell = $(`#cell-${side.toLowerCase()}`);
    cell.dataset.active = String(side === state.side);
    const button = $(`[data-activate="${side}"]`);
    button.textContent = side === state.side ? 'Live now' : 'Make live';
    button.disabled = side === state.side;
  }
  $('#wall-set').textContent = `Set ${state.side} · fixed at t = 1, painted one at a time.`;
}

function stageCopy() {
  const week = selectedWeek();
  if (!week) return;
  $('#stage-week').textContent = `${week.week} — ${week.label}`;
  $('#stage-summary').textContent = week.summary;
  $('#mast-status').textContent = `${week.label} · set ${state.side} · ${state.liveMode} view`;
  document.title = `${week.week} · Planet tuning bench`;
}

async function loadLive() {
  const week = selectedWeek();
  if (!week) return;
  const token = ++state.liveToken;
  if (state.ab) state.liveMode = 'orbit';
  else if (state.liveFrame?.contentWindow?.__app?.mode) state.liveMode = state.liveFrame.contentWindow.__app.mode;
  state.liveFrame?.remove();
  $$('.live-slot').forEach((slot) => slot.replaceChildren());
  const target = liveTarget();
  const surface = target.classList.contains('planet-surface') ? target : target.closest('.planet-surface');
  surface.classList.add('loading');
  const frame = document.createElement('iframe');
  frame.title = `Interactive planet for ${week.week}, parameter set ${state.side}`;
  frame.src = makePlanetUrl(week, activeParams(), { t: state.ab ? 1 : null, view: state.ab ? 'orbit' : state.liveMode });
  state.liveFrame = frame;
  target.append(frame);
  stageCopy();
  try {
    await waitForPlanet(frame);
    if (token !== state.liveToken) return;
    surface.classList.remove('loading');
    stageCopy();
    readPerf();
  } catch (error) {
    if (token !== state.liveToken) return;
    surface.classList.remove('loading');
    $('#mast-status').textContent = error.message;
    showToast(error.message, true);
  }
}

async function paintNow(week, params, size = 480, cropRatio = .82) {
  const frame = document.createElement('iframe');
  frame.tabIndex = -1;
  frame.setAttribute('aria-hidden', 'true');
  frame.src = makePlanetUrl(week, params, { t: 1, view: 'orbit' });
  $('#paint-bay').append(frame);
  try {
    const win = await waitForPlanet(frame);
    const source = win.__app.renderer.domElement;
    if (!source.width || !source.height) throw new Error(`Planet ${week.id} painted an empty canvas.`);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const crop = Math.min(source.width, source.height) * cropRatio;
    canvas.getContext('2d', { willReadFrequently: true }).drawImage(
      source, (source.width - crop) / 2, (source.height - crop) / 2, crop, crop, 0, 0, size, size,
    );
    return canvas;
  } finally {
    frame.remove();
  }
}

function paint(week, params, size, cropRatio) {
  const job = paintQueue.then(() => paintNow(week, params, size, cropRatio));
  paintQueue = job.catch(() => {});
  return job;
}

function markSelected() {
  $$('.still').forEach((tile) => {
    const selected = tile.dataset.id === state.selectedId;
    tile.dataset.selected = String(selected);
    $('.still-badge', tile)?.remove();
    if (selected) {
      const badge = document.createElement('span');
      badge.className = 'still-badge';
      badge.textContent = 'live';
      $('.still-visual', tile).append(badge);
    }
  });
}

function renderWall() {
  const wall = $('#stills-wall');
  wall.replaceChildren(...state.panel.map((week) => {
    const figure = document.createElement('figure');
    figure.className = 'still';
    figure.dataset.id = week.id;
    const button = document.createElement('button');
    button.type = 'button';
    button.title = `Make ${week.week} the live tile`;
    const visual = document.createElement('span');
    visual.className = 'still-visual loading';
    const image = document.createElement('img');
    image.alt = `Deterministic orbit still for ${week.label}, ${week.week}`;
    const saved = state.stills.get(week.id);
    if (saved) { image.src = saved; visual.classList.remove('loading'); }
    visual.append(image);
    const caption = document.createElement('figcaption');
    const name = document.createElement('span');
    name.className = 'still-name';
    const strong = document.createElement('strong');
    strong.textContent = week.label;
    const time = document.createElement('time');
    time.textContent = week.source === 'synthetic' ? 'edge seed' : week.week;
    name.append(strong, time);
    const summary = document.createElement('div');
    summary.className = 'still-summary';
    summary.textContent = week.summary;
    caption.append(name, summary);
    button.append(visual, caption);
    button.addEventListener('click', () => chooseWeek(week.id));
    figure.append(button);
    return figure;
  }));
  markSelected();
}

async function paintWall() {
  const token = ++state.wallToken;
  const params = { ...activeParams() };
  $$('.still-visual').forEach((visual) => visual.classList.add('loading'));
  $('#wall-progress').textContent = `0 / ${state.panel.length}`;
  for (let index = 0; index < state.panel.length; index++) {
    const week = state.panel[index];
    let canvas;
    try { canvas = await paint(week, params, 480); } catch (error) {
      if (token === state.wallToken) showToast(`Could not paint ${week.week}: ${error.message}`, true);
      continue;
    }
    if (token !== state.wallToken) return;
    const src = canvas.toDataURL('image/webp', .92);
    state.stills.set(week.id, src);
    const tile = $(`.still[data-id="${CSS.escape(week.id)}"]`);
    if (tile) {
      $('img', tile).src = src;
      $('.still-visual', tile).classList.remove('loading');
    }
    $('#wall-progress').textContent = `${index + 1} / ${state.panel.length}`;
  }
  if (token === state.wallToken) $('#wall-progress').textContent = `${state.panel.length} painted`;
}

function drawDifference(a, b) {
  const width = Math.min(a.width, b.width);
  const height = Math.min(a.height, b.height);
  const aa = a.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height).data;
  const bb = b.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height).data;
  const target = $('#diff-canvas');
  target.width = width;
  target.height = height;
  const context = target.getContext('2d');
  const image = context.createImageData(width, height);
  let total = 0;
  for (let source = 0, out = 0; source < aa.length; source += 4, out += 4) {
    const r = Math.abs(aa[source] - bb[source]);
    const g = Math.abs(aa[source + 1] - bb[source + 1]);
    const blue = Math.abs(aa[source + 2] - bb[source + 2]);
    total += r + g + blue;
    const difference = (r + g + blue) / 3;
    const heat = Math.min(255, difference * 5.5);
    image.data[out] = heat;
    image.data[out + 1] = Math.min(130, heat * .23);
    image.data[out + 2] = Math.min(80, heat * .08);
    image.data[out + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  $('#mad-value').value = (total / (width * height * 3)).toFixed(2);
}

async function refreshCompare() {
  if (!state.ab) return;
  const token = ++state.compareToken;
  const week = selectedWeek();
  $('#surface-a').classList.add('loading');
  $('#surface-b').classList.add('loading');
  try {
    const [a, b] = await Promise.all([paint(week, { ...state.params.A }, 480, 1), paint(week, { ...state.params.B }, 480, 1)]);
    if (token !== state.compareToken || !state.ab) return;
    $('#image-a').src = a.toDataURL('image/png');
    $('#image-b').src = b.toDataURL('image/png');
    $('#surface-a').classList.remove('loading');
    $('#surface-b').classList.remove('loading');
    drawDifference(a, b);
  } catch (error) {
    if (token === state.compareToken) showToast(`A/B paint failed: ${error.message}`, true);
  }
}

function scheduleSettled() {
  clearTimeout(settleTimer);
  settleTimer = setTimeout(async () => {
    syncUrl();
    if (state.ab) await refreshCompare();
    await paintWall();
  }, 480);
}

function scheduleLiveReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => loadLive(), 130);
}

function syncControl(key) {
  const ref = controlRefs.get(key);
  if (!ref) return;
  const value = activeParams()[key];
  if (ref.range) ref.range.value = value;
  if (ref.number) ref.number.value = valueText(value);
  if (ref.colour) ref.colour.value = value;
  if (ref.select) ref.select.value = value;
  if (ref.output) ref.output.textContent = value;
}

function syncControls() { for (const spec of SPEC) syncControl(spec.key); }

async function applyToLive(partial) {
  try {
    const app = state.liveFrame?.contentWindow?.__app;
    if (!app?.setParams) return scheduleLiveReload();
    const result = await app.setParams(partial);
    if (result === 'reload') scheduleLiveReload();
  } catch {
    scheduleLiveReload();
  }
}

function applyPartial(partial) {
  const changed = {};
  for (const [key, raw] of Object.entries(partial)) {
    const spec = specs.get(key);
    if (!spec) continue;
    const value = coerce(spec, raw);
    if (!differs(state.params[state.side][key], value)) continue;
    state.params[state.side][key] = value;
    changed[key] = value;
    syncControl(key);
  }
  if (!Object.keys(changed).length) return;
  void applyToLive(changed);
  scheduleSettled();
}

function applyBulk(params) {
  state.params[state.side] = normalizeParams(params);
  syncControls();
  void loadLive();
  scheduleSettled();
}

function titleCase(value) { return value.replace(/(^|[-_])([a-z])/g, (_, space, letter) => `${space ? ' ' : ''}${letter.toUpperCase()}`); }

function renderParams() {
  const host = $('#param-groups');
  controlRefs.clear();
  if (!SPEC.length) {
    host.innerHTML = '<p class="empty-params">No parameter specification loaded. The renderer remains available.</p>';
    $('#param-count').textContent = '0 dials';
    return;
  }
  const groups = new Map();
  for (const spec of SPEC) {
    if (!groups.has(spec.group)) groups.set(spec.group, []);
    groups.get(spec.group).push(spec);
  }
  let groupIndex = 0;
  host.replaceChildren(...[...groups].map(([group, entries]) => {
    const details = document.createElement('details');
    details.className = 'param-group';
    details.dataset.group = group;
    details.open = groupIndex++ < 2 || group === 'pal';
    const summary = document.createElement('summary');
    const name = document.createElement('span');
    name.className = 'group-name';
    name.textContent = titleCase(group);
    const reset = document.createElement('button');
    reset.className = 'group-reset';
    reset.type = 'button';
    reset.textContent = 'reset group';
    reset.addEventListener('click', (event) => {
      event.preventDefault(); event.stopPropagation();
      applyPartial(Object.fromEntries(entries.map((entry) => [entry.key, entry.default])));
    });
    summary.append(name, reset);
    const list = document.createElement('div');
    list.className = 'param-list';
    for (const spec of entries) {
      const row = document.createElement('div');
      row.className = 'param-row';
      row.dataset.search = `${spec.key} ${spec.group} ${spec.note || ''}`.toLowerCase();
      const label = document.createElement('div');
      label.className = 'param-label';
      const key = document.createElement('span');
      key.className = 'param-key';
      key.textContent = spec.key;
      const keyReset = document.createElement('button');
      keyReset.className = 'key-reset';
      keyReset.type = 'button';
      keyReset.textContent = 'reset';
      keyReset.title = `Reset ${spec.key} to ${spec.default}`;
      keyReset.addEventListener('click', () => applyPartial({ [spec.key]: spec.default }));
      label.append(key, keyReset);
      row.append(label);
      if (spec.note) {
        const note = document.createElement('p');
        note.className = 'param-note';
        note.textContent = spec.note;
        row.append(note);
      }
      const ref = { spec };
      if (Array.isArray(spec.options)) {
        const control = document.createElement('label');
        control.className = 'choice-control';
        const select = document.createElement('select');
        select.setAttribute('aria-label', spec.key);
        for (const option of spec.options) select.append(new Option(option, option));
        select.addEventListener('change', () => applyPartial({ [spec.key]: select.value }));
        control.append(select);
        row.append(control);
        Object.assign(ref, { select });
      } else if (typeof spec.default === 'string') {
        const control = document.createElement('label');
        control.className = 'colour-control';
        const colour = document.createElement('input');
        colour.type = 'color';
        colour.setAttribute('aria-label', spec.key);
        const output = document.createElement('span');
        output.className = 'colour-value';
        colour.addEventListener('input', () => applyPartial({ [spec.key]: colour.value }));
        control.append(colour, output);
        row.append(control);
        Object.assign(ref, { colour, output });
      } else {
        const control = document.createElement('label');
        control.className = 'number-control';
        const range = document.createElement('input');
        range.type = 'range';
        range.min = spec.min; range.max = spec.max; range.step = spec.step;
        range.setAttribute('aria-label', spec.key);
        const number = document.createElement('input');
        number.type = 'number';
        number.min = spec.min; number.max = spec.max; number.step = spec.step;
        number.setAttribute('aria-label', `${spec.key} exact value`);
        range.addEventListener('input', () => applyPartial({ [spec.key]: Number(range.value) }));
        number.addEventListener('input', () => { if (number.value !== '') applyPartial({ [spec.key]: Number(number.value) }); });
        control.append(range, number);
        row.append(control);
        Object.assign(ref, { range, number });
      }
      controlRefs.set(spec.key, ref);
      list.append(row);
    }
    details.append(summary, list);
    return details;
  }));
  syncControls();
  filterParams();
}

function filterParams() {
  const query = $('#param-search').value.trim().toLowerCase();
  let visible = 0;
  $$('.param-group').forEach((group) => {
    let groupVisible = 0;
    $$('.param-row', group).forEach((row) => {
      const matches = !query || row.dataset.search.includes(query);
      row.hidden = !matches;
      if (matches) { visible++; groupVisible++; }
    });
    group.hidden = groupVisible === 0;
    if (query && groupVisible) group.open = true;
  });
  $('#param-count').textContent = `${visible} / ${SPEC.length}`;
}

function chooseWeek(id) {
  if (state.locked && id !== state.selectedId) return showToast('Week is locked. Unlock it before changing the live seed.');
  if (id === state.selectedId) return;
  state.selectedId = id;
  markSelected();
  stageCopy();
  void loadLive();
  if (state.ab) void refreshCompare();
  syncUrl();
}

function chooseOffset(offset) {
  const index = state.panel.findIndex((week) => week.id === state.selectedId);
  if (index < 0) return;
  const next = state.panel[(index + offset + state.panel.length) % state.panel.length];
  chooseWeek(next.id);
}

function setSide(side) {
  if (!state.ab || !['A', 'B'].includes(side) || side === state.side) return;
  state.side = side;
  updateActiveSide();
  syncControls();
  void loadLive();
  scheduleSettled();
}

function setAb(value) {
  state.ab = Boolean(value);
  if (state.ab) state.liveMode = 'orbit';
  $('#ab-toggle').setAttribute('aria-pressed', String(state.ab));
  $('#ab-toggle').title = state.ab ? 'Leave A/B comparison (A)' : 'Compare two parameter sets (A)';
  $('#single-stage').hidden = state.ab;
  $('#ab-stage').hidden = !state.ab;
  $('#side-switch').hidden = !state.ab;
  updateActiveSide();
  void loadLive();
  if (state.ab) void refreshCompare();
  syncUrl();
}

function setLock(value) {
  state.locked = Boolean(value);
  const button = $('#week-lock');
  button.setAttribute('aria-pressed', String(state.locked));
  button.textContent = state.locked ? 'Week locked' : 'Lock week';
  syncUrl();
}

function syncUrl() {
  const week = selectedWeek();
  if (!week) return;
  const url = new URL(location.origin + location.pathname);
  url.searchParams.set('week', week.id);
  url.searchParams.set('panel', state.panelMode);
  url.searchParams.set('view', state.liveMode);
  if (week.code) url.searchParams.set('planet', week.code);
  if (week.seed) url.searchParams.set('seed', week.seed);
  if (state.ab) url.searchParams.set('mode', 'ab');
  if (state.side === 'B') url.searchParams.set('side', 'B');
  if (state.locked) url.searchParams.set('lock', '1');
  const a = patchFromDefaults(state.params.A);
  const b = patchFromDefaults(state.params.B);
  if (Object.keys(a).length) url.searchParams.set('a', encode(a));
  url.searchParams.set('b', encode(b));
  history.replaceState(null, '', url);
}

async function copyUrl() {
  syncUrl();
  try {
    await navigator.clipboard.writeText(location.href);
  } catch {
    const field = document.createElement('textarea');
    field.value = location.href;
    field.style.position = 'fixed'; field.style.opacity = '0';
    document.body.append(field); field.select(); document.execCommand('copy'); field.remove();
  }
  showToast('Exact bench view copied.');
}

async function loadSnapshots(selected = '') {
  try {
    const response = await fetch('/api/snapshots');
    if (!response.ok) throw new Error((await response.json()).error || response.statusText);
    const { snapshots } = await response.json();
    state.snapshots = new Map(snapshots.map((snapshot) => [snapshot.name, snapshot]));
    const select = $('#snapshot-select');
    select.replaceChildren(new Option('Saved snapshots…', ''), ...snapshots.map((snapshot) => new Option(snapshot.name, snapshot.name)));
    if (selected && state.snapshots.has(selected)) select.value = selected;
  } catch (error) {
    showToast(`Snapshots unavailable: ${error.message}`, true);
  }
}

function snapshotName() {
  return $('#snapshot-name').value.trim().replace(/\s+/g, '-').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 64);
}

async function saveSnapshot() {
  const name = snapshotName();
  if (!name) return showToast('Give the snapshot a short name first.', true);
  $('#snapshot-name').value = name;
  const response = await fetch('/api/snapshot', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, notes: $('#snapshot-notes').value, params: activeParams() }),
  });
  const body = await response.json();
  if (!response.ok) return showToast(body.error || 'Snapshot could not be saved.', true);
  await loadSnapshots(name);
  showToast(`Saved ${name} from set ${state.side}.`);
}

function chosenSnapshot() {
  const name = $('#snapshot-select').value;
  if (!name) { showToast('Choose a saved snapshot first.', true); return null; }
  return state.snapshots.get(name) || null;
}

function loadSnapshot() {
  const snapshot = chosenSnapshot();
  if (!snapshot) return;
  $('#snapshot-name').value = snapshot.name;
  $('#snapshot-notes').value = snapshot.notes || '';
  applyBulk(snapshot.params);
  showToast(`Loaded ${snapshot.name} into set ${state.side}.`);
}

function diffSnapshot() {
  const snapshot = chosenSnapshot();
  if (!snapshot) return;
  const before = normalizeParams(snapshot.params);
  const lines = SPEC.filter((spec) => differs(before[spec.key], activeParams()[spec.key]))
    .map((spec) => `${spec.key}:  ${valueText(before[spec.key])}  →  ${valueText(activeParams()[spec.key])}`);
  const output = $('#snapshot-diff');
  output.textContent = lines.length ? `${lines.length} changed dial${lines.length === 1 ? '' : 's'}\n${lines.join('\n')}` : 'No differences from this snapshot.';
  output.hidden = false;
}

function readPerf() {
  const app = state.liveFrame?.contentWindow?.__app;
  if (!app) return;
  if (state.ab && app.mode && app.mode !== 'orbit') {
    app.setMode?.('orbit');
    state.liveMode = 'orbit';
    stageCopy();
    syncUrl();
  } else if (app.mode && app.mode !== state.liveMode) {
    state.liveMode = app.mode;
    stageCopy();
    syncUrl();
  }
  try {
    const perf = app.debug?.perf?.();
    const render = app.renderer?.info?.render;
    if (!perf) return;
    const pieces = [`${perf.frameMs.toFixed(1)} ms`, `DPR ${perf.dpr}`, `${perf.bufferMP.toFixed(2)} MP`, `quality step ${perf.steps}`];
    if (render) pieces.push(`${render.calls} calls`, `${Math.round(render.triangles).toLocaleString()} tris`);
    $('#perf-readout').textContent = pieces.join(' · ');
  } catch {}
}

async function loadPanel() {
  const response = await fetch('/api/panel');
  const panel = await response.json();
  if (!response.ok) throw new Error(panel.error || 'Reference panel could not be loaded.');
  state.panelData = panel;
  const requested = state.selectedId && panel.all.find((week) => week.id === state.selectedId);
  if (requested && !panel[state.panelMode].some((week) => week.id === requested.id)) state.panelMode = 'all';
  const exactCode = initialUrl.searchParams.get('planet');
  const exactSeed = initialUrl.searchParams.get('seed');
  if (requested && exactCode && /^[A-Za-z0-9_-]+$/.test(exactCode)) {
    for (const list of [panel.core, panel.extended, panel.all]) {
      const week = list.find((entry) => entry.id === requested.id);
      if (week) week.code = exactCode;
    }
  }
  if (requested && exactSeed && /^[A-Za-z0-9_-]+$/.test(exactSeed)) {
    for (const list of [panel.core, panel.extended, panel.all]) {
      const week = list.find((entry) => entry.id === requested.id);
      if (week) week.seed = exactSeed;
    }
  }
  state.panel = panel[state.panelMode];
  state.selectedId = requested?.id || state.panel[0]?.id;
  $('#panel-select').value = state.panelMode;
}

function changePanel(mode) {
  const nextMode = mode === 'all' ? 'all' : 'core';
  const nextPanel = state.panelData[nextMode];
  if (state.locked && !nextPanel.some((week) => week.id === state.selectedId)) {
    $('#panel-select').value = state.panelMode;
    showToast('Week is locked. Unlock it before choosing a panel that does not contain this seed.');
    return;
  }
  state.panelMode = nextMode;
  state.panel = nextPanel;
  if (!state.panel.some((week) => week.id === state.selectedId)) state.selectedId = state.panel[0].id;
  renderWall();
  stageCopy();
  void loadLive();
  if (state.ab) void refreshCompare();
  void paintWall();
  syncUrl();
}

$('#param-search').addEventListener('input', filterParams);
$('#week-lock').addEventListener('click', () => setLock(!state.locked));
$('#ab-toggle').addEventListener('click', () => setAb(!state.ab));
$('#copy-url').addEventListener('click', copyUrl);
$('#side-switch').addEventListener('click', (event) => { if (event.target.dataset.side) setSide(event.target.dataset.side); });
$$('[data-activate]').forEach((button) => button.addEventListener('click', () => setSide(button.dataset.activate)));
$('#snapshot-save').addEventListener('click', saveSnapshot);
$('#snapshot-load').addEventListener('click', loadSnapshot);
$('#snapshot-compare').addEventListener('click', diffSnapshot);
$('#snapshot-select').addEventListener('change', () => { $('#snapshot-diff').hidden = true; });
$('#panel-select').addEventListener('change', (event) => changePanel(event.target.value));

document.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const editing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  if (editing && event.key !== 'Escape') return;
  const key = event.key.toLowerCase();
  if (key === '/') { event.preventDefault(); $('#param-search').focus(); }
  else if (key === '[') chooseOffset(-1);
  else if (key === ']') chooseOffset(1);
  else if (key === 'a') setAb(!state.ab);
  else if (key === '1') setSide('A');
  else if (key === '2') setSide('B');
  else if (key === 'l') setLock(!state.locked);
  else if (key === 'c') void copyUrl();
  else if (key === 's') { event.preventDefault(); $('#snapshot-name').focus(); }
});

async function start() {
  setLock(state.locked);
  renderParams();
  await loadPanel();
  renderWall();
  stageCopy();
  setAb(state.ab);
  updateActiveSide();
  void loadSnapshots();
  void paintWall();
  setInterval(readPerf, 1000);
}

start().catch((error) => {
  console.error(error);
  $('#mast-status').textContent = error.message;
  showToast(error.message, true);
});

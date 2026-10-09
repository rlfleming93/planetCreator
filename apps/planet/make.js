import { encodePlanet } from './share.js';

const MI = 1609.344;
const STYLE = `
.pc-maker-backdrop{position:fixed;inset:0;z-index:30;display:grid;place-items:center;padding:24px;box-sizing:border-box;background:rgba(27,37,64,.68);color:var(--fg-ink,#242a3c);font-family:var(--fg-font,Georgia,serif)}
.pc-maker-backdrop[hidden]{display:none}
.pc-maker-sheet{position:relative;width:min(720px,calc(100vw - 32px));max-height:calc(100vh - 40px);overflow:auto;box-sizing:border-box;padding:34px 38px 30px;background:#f3ecdc;clip-path:polygon(.4% 1.1%,99.4% 0,100% 98.7%,1.1% 100%);animation:pc-paper-in .24s cubic-bezier(.16,1,.3,1)}
@keyframes pc-paper-in{from{opacity:0;transform:translateY(10px) rotate(-.25deg)}to{opacity:1;transform:none}}
.pc-maker-head{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;padding-bottom:18px;border-bottom:1px solid var(--ink-rule,rgba(36,42,60,.34))}
.pc-maker-head h1{margin:0;max-width:16ch;font-size:clamp(28px,4vw,42px);font-weight:400;line-height:1.02;letter-spacing:-.025em;text-wrap:balance}
.pc-maker-sheet p{max-width:64ch;margin:14px 0 0;font-size:14px;line-height:1.55}
.pc-maker-sheet button,.pc-maker-pick{appearance:none;position:relative;border:0;border-radius:0;background:none;padding:3px 0 7px;color:inherit;font:600 13px/1.2 var(--fg-font,Georgia,serif);letter-spacing:.045em;cursor:pointer}
.pc-maker-sheet button::after,.pc-maker-pick::after{content:"";position:absolute;left:-3px;right:-4px;bottom:0;height:5px;background:currentColor;opacity:.58;-webkit-mask:var(--ink-stroke) 0 0/100% 100% no-repeat;mask:var(--ink-stroke) 0 0/100% 100% no-repeat}
.pc-maker-sheet button:hover,.pc-maker-sheet button:focus-visible,.pc-maker-pick:hover,.pc-maker-pick:focus-within{color:var(--fg-accent,#b8442a)}
.pc-maker-sheet button:focus-visible,.pc-maker-pick:focus-within{outline:1px dashed var(--fg-accent,#b8442a);outline-offset:4px}
.pc-maker-sheet button:disabled{cursor:default;opacity:.34}
.pc-maker-sheet button:disabled::after{opacity:.2}
.pc-maker-close{flex:none;font-weight:400!important}
.pc-maker-drop{display:grid;place-items:center;min-height:132px;margin-top:24px;padding:24px;border:1px dashed var(--ink-rule,rgba(36,42,60,.34));box-sizing:border-box;text-align:center;background:rgba(177,151,101,.07);transition:background-color .18s ease,color .18s ease}
.pc-maker-drop[data-over]{background:rgba(184,68,42,.1);color:var(--fg-accent,#b8442a)}
.pc-maker-drop small{display:block;margin-top:9px;font-size:12px;font-style:italic;opacity:.62}
.pc-maker-input{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}
.pc-maker-status{min-height:22px;margin:13px 0 0!important;color:var(--fg-accent,#b8442a);font-style:italic}
.pc-maker-weeks{margin-top:20px}
.pc-maker-weeks[hidden]{display:none}
.pc-maker-weeks h2{margin:0 0 8px;font-size:15px;font-weight:500;letter-spacing:.08em;text-transform:uppercase}
.pc-maker-week{display:grid;grid-template-columns:auto 1fr;gap:4px 13px;align-items:start;padding:14px 4px;border-top:1px solid var(--ink-faint,rgba(36,42,60,.14));cursor:pointer}
.pc-maker-week:first-of-type{border-top:0}
.pc-maker-week input{margin-top:4px;accent-color:var(--fg-accent,#b8442a)}
.pc-maker-week strong{display:block;font-size:16px;font-weight:500}
.pc-maker-week span{display:block;margin-top:3px;font-size:12px;line-height:1.45;opacity:.67}
.pc-maker-actions{display:flex;align-items:center;justify-content:space-between;gap:22px;margin-top:18px;padding-top:18px;border-top:1px solid var(--ink-rule,rgba(36,42,60,.34))}
.pc-maker-build{color:var(--fg-accent,#b8442a)!important;font-size:15px!important}
.pc-maker-private{margin:0!important;font-size:11px!important;font-style:italic;opacity:.6}
.pc-maker-share-label{display:flex;align-items:center;gap:6px;color:var(--fg-ink,#242a3c);font:12px/1.2 var(--fg-font,Georgia,serif);letter-spacing:.02em;white-space:nowrap}
.pc-maker-share-label input{accent-color:var(--fg-accent,#b8442a)}
@media(max-width:620px){.pc-maker-backdrop{padding:8px}.pc-maker-sheet{width:calc(100vw - 12px);max-height:calc(100vh - 12px);padding:26px 22px 24px}.pc-maker-head{gap:14px}.pc-maker-actions{align-items:flex-start;flex-direction:column}.pc-maker-share-label{display:none}}
@media(prefers-reduced-motion:reduce){.pc-maker-sheet{animation:none}.pc-maker-drop{transition:none}}
`;

function summary(seed) {
  const activities = seed.activities;
  const count = (test) => activities.filter(test).length;
  const distance = activities.reduce((sum, activity) => sum + (activity.distanceM || 0), 0) / MI;
  const climb = activities.reduce((sum, activity) => sum + (activity.ascentM || 0), 0);
  const runs = count((activity) => activity.sport === 'running');
  const lifts = count((activity) => activity.strength || /strength|lift|weight/i.test(activity.title || ''));
  const rides = count((activity) => activity.sport === 'cycling');
  const swims = count((activity) => activity.sport === 'swimming');
  const races = count((activity) => activity.isRace);
  return `${runs} run${runs === 1 ? '' : 's'} · ${distance.toFixed(1)} mi · ${Math.round(climb)} m climb · ${lifts} lift${lifts === 1 ? '' : 's'} · ${rides} ride${rides === 1 ? '' : 's'} · ${swims} swim${swims === 1 ? '' : 's'} · ${races} race${races === 1 ? '' : 's'}`;
}

function fullDate(week) {
  return new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${week}T00:00:00Z`));
}

function cachedSource(packed, fallback) {
  try {
    const cached = JSON.parse(sessionStorage.getItem('pc-maker-seed'));
    if (cached?.packed === packed && cached.seed?.week && Array.isArray(cached.seed.activities)) return cached.seed;
  } catch {}
  return fallback;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {}
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
  document.body.append(field);
  field.select();
  const copied = document.execCommand('copy');
  field.remove();
  if (!copied) throw new Error('Your browser blocked the clipboard.');
}

export function installMaker({ seed, packed = null } = {}) {
  const hud = document.querySelector('.pc-hud');
  if (!hud || document.querySelector('.pc-maker-backdrop')) return;

  if (!document.getElementById('pc-maker-style')) {
    const style = document.createElement('style');
    style.id = 'pc-maker-style';
    style.textContent = STYLE;
    document.head.append(style);
  }

  const makeButton = document.createElement('button');
  makeButton.type = 'button';
  makeButton.textContent = 'Make yours';
  hud.append(makeButton);

  let copySeed = packed ? cachedSource(packed, seed) : seed;
  if (packed) {
    const names = document.createElement('label');
    names.className = 'pc-maker-share-label';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    names.append(checkbox, document.createTextNode('Include activity names'));
    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.textContent = 'Copy link';
    copyButton.addEventListener('click', async () => {
      try {
        const encoded = encodePlanet(copySeed, { includeNames: checkbox.checked });
        const url = new URL(location.href);
        url.searchParams.delete('seed');
        url.hash = `p=${encoded}`;
        await copyText(url.href);
        copyButton.textContent = 'Link copied';
        setTimeout(() => { copyButton.textContent = 'Copy link'; }, 1800);
      } catch (error) {
        copyButton.textContent = error instanceof Error ? error.message : 'Could not copy';
      }
    });
    hud.append(names, copyButton);
  }

  const backdrop = document.createElement('div');
  backdrop.className = 'pc-maker-backdrop';
  backdrop.hidden = true;
  backdrop.innerHTML = `
    <section class="pc-maker-sheet" role="dialog" aria-modal="true" aria-labelledby="pc-maker-title">
      <header class="pc-maker-head">
        <h1 id="pc-maker-title">Make your week a world</h1>
        <button class="pc-maker-close" type="button">Close</button>
      </header>
      <p>Choose the Garmin .FIT files from a week of training. Runs, rides, swims, lifting and everything else will find a place on your planet.</p>
      <label class="pc-maker-drop" for="pc-maker-files">
        <span class="pc-maker-pick">Choose .FIT files</span>
        <small>or drop several here at once</small>
      </label>
      <input class="pc-maker-input" id="pc-maker-files" type="file" accept=".fit,application/octet-stream" multiple>
      <p class="pc-maker-status" role="status" aria-live="polite"></p>
      <div class="pc-maker-weeks" hidden>
        <h2></h2>
        <div class="pc-maker-list"></div>
      </div>
      <div class="pc-maker-actions">
        <p class="pc-maker-private">Your files never leave this browser. Shared planets keep route shapes, not GPS coordinates.</p>
        <button class="pc-maker-build" type="button" disabled>Build my planet</button>
      </div>
    </section>`;
  document.body.append(backdrop);

  const sheet = backdrop.querySelector('.pc-maker-sheet');
  const closeButton = backdrop.querySelector('.pc-maker-close');
  const input = backdrop.querySelector('.pc-maker-input');
  const drop = backdrop.querySelector('.pc-maker-drop');
  const status = backdrop.querySelector('.pc-maker-status');
  const weekBox = backdrop.querySelector('.pc-maker-weeks');
  const weekHeading = weekBox.querySelector('h2');
  const weekList = backdrop.querySelector('.pc-maker-list');
  const buildButton = backdrop.querySelector('.pc-maker-build');
  let weeks = [];
  let selected = 0;
  let returnFocus = null;

  const close = () => {
    backdrop.hidden = true;
    returnFocus?.focus();
  };
  const open = () => {
    returnFocus = document.activeElement;
    backdrop.hidden = false;
    closeButton.focus();
  };

  function renderWeeks() {
    weekList.replaceChildren();
    weekHeading.textContent = `Found ${weeks.length} week${weeks.length === 1 ? '' : 's'}`;
    weeks.forEach((week, index) => {
      const label = document.createElement('label');
      label.className = 'pc-maker-week';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'pc-maker-week';
      radio.value = String(index);
      radio.checked = index === selected;
      radio.addEventListener('change', () => { selected = index; });
      const text = document.createElement('span');
      const strong = document.createElement('strong');
      strong.textContent = `Week of ${fullDate(week.week)}`;
      const details = document.createElement('span');
      details.textContent = summary(week);
      text.append(strong, details);
      label.append(radio, text);
      weekList.append(label);
    });
    weekBox.hidden = false;
    buildButton.disabled = false;
  }

  async function readFiles(fileList) {
    const files = Array.from(fileList || []);
    const wrong = files.filter((file) => !/\.fit$/i.test(file.name));
    if (!files.length) return;
    if (wrong.length) {
      status.textContent = `Only Garmin .FIT files work here. Remove ${wrong.map((file) => file.name).join(', ')} and try again.`;
      return;
    }
    status.textContent = `Reading ${files.length} activit${files.length === 1 ? 'y' : 'ies'}…`;
    input.disabled = true;
    buildButton.disabled = true;
    weekBox.hidden = true;
    try {
      const { parseFitFiles } = await import('./fit-import.js');
      weeks = await parseFitFiles(files);
      selected = Math.max(0, weeks.length - 1);
      renderWeeks();
      status.textContent = `${files.length} activit${files.length === 1 ? 'y' : 'ies'} ready.`;
    } catch (error) {
      weeks = [];
      status.textContent = error instanceof Error ? error.message : 'Those files could not be read.';
    } finally {
      input.disabled = false;
      input.value = '';
    }
  }

  makeButton.addEventListener('click', open);
  closeButton.addEventListener('click', close);
  backdrop.addEventListener('click', (event) => { if (event.target === backdrop) close(); });
  sheet.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
    if (event.key !== 'Tab') return;
    const controls = [...sheet.querySelectorAll('button,input')].filter((control) => !control.disabled);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  input.addEventListener('change', () => readFiles(input.files));
  for (const type of ['dragenter', 'dragover']) drop.addEventListener(type, (event) => {
    event.preventDefault();
    drop.dataset.over = '';
  });
  for (const type of ['dragleave', 'drop']) drop.addEventListener(type, (event) => {
    event.preventDefault();
    delete drop.dataset.over;
  });
  drop.addEventListener('drop', (event) => readFiles(event.dataTransfer.files));
  buildButton.addEventListener('click', () => {
    const chosen = weeks[selected];
    if (!chosen) return;
    const encoded = encodePlanet(chosen);
    try { sessionStorage.setItem('pc-maker-seed', JSON.stringify({ packed: encoded, seed: chosen })); } catch {}
    history.replaceState(null, '', `${location.pathname}${location.search}#p=${encoded}`);
    location.reload();
  });
}

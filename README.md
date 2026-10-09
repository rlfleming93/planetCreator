# Planet Creator

Every week of Ryan's training, turned into a painted planet you can walk around on, and the public site that shows it
off.

Source: https://github.com/rlfleming93/planetCreator. MIT licensed, with third-party exceptions (see License).

- `apps/planet/` — the app: `ink.html` and its modules, the vendored three.js, the pinned rounds and shots.
- `apps/planet-home/` — the public home at https://planet.fleming.run: the front page, `make/`, `how/`, `privacy/`,
  `terms/`, the demo `shelf/`, `story/` (a week's share clip, see Share clips), `demo/` (the narrated film and its share
  files, encoded into `demo/media/` by `var/private/planet-demo/round12/site-media.sh`; untracked, like the kit's clips,
  and copied into each release by `planet-sync.mjs`), and the dev-only scripts under it
  (`_check.mjs`, `shelf/_ryan.mjs`). It reaches the app at `planet/` through the `planet` symlink beside its pages.
- `scripts/planet-home-build.mjs` — the home as a static bundle in `var/planet-home-dist/`: every public page and
  asset, the app at `/planet/`, the shelf's thumbnails (stills at 96 and 192 px, globes at 96), and the checks (below)
  that refuse anything personal.
- `functions/` — Cloudflare Pages Functions for `/api/strava/*`. Wrangler deploys these separately; they are never
  copied into `var/planet-home-dist/`.
- `scripts/planet-home-deploy.sh` — build, then publish `var/planet-home-dist` to Cloudflare Pages (project
  `planetcreator`, branch `main`); it is also fine to run by hand.
- `scripts/planet-sync.mjs` — the one command a scheduler runs after Garmin data lands: the private seeds, the demo
  shelf's stills and globes, the phone kit's clips, and — with `--publish` — the site above. See Sync.
- `scripts/story-render.mjs`: the phone kit's clips in `apps/planet-home/kit/`, the week so far and the last full week,
  painted from the built site. See Phone kit.

VARÐA (https://fleming.run; its repo is checked out beside this one as `personalBranding/`) consumes this repo: its
build traces the app into `/planet/`, its posters and Angel cards render through `ink.html`, and the hub's dev
server serves the app from here.

## Dev servers

    bash scripts/dev.sh

starts the app at http://127.0.0.1:8790/ink.html and the home at http://127.0.0.1:8795/, with the private weeks linked
in first. Request logs land in `var/`.

## Build

    bun scripts/planet-home-build.mjs [--out var/<dir>]

writes `var/planet-home-dist/` (or `--out`, under `var/`) and checks it with `scripts/privacy.mjs` (no private term, no
place a run started, no raw activity file, no loopback link, and no `functions/` path in the static output). The
recursive public-asset copy includes the privacy and terms pages and their assets. JavaScript goes out without its
comments and spacing; the app goes out in `planet/v/<hash>/` (cached for good by `_headers`; the last build's folder is
kept one more deploy), `ink.html` preloads its modules, and the pages link the app as `/planet/ink`. Needs `cwebp`
(Homebrew) for the shelf's thumbnails. The load and frame audit is `var/bench/perf/audit.md`.

    bun apps/planet-home/_check.mjs       # the reading's check against the real weeks

## Share clips

`apps/planet-home/lib/story.js` paints a week's planet as a 12 s, 30 fps H.264 MP4 in the browser (`story` 1080×1920,
`square` 1080×1080, `wide` 1920×1080): the app in a frame off the page, stepped a frame at a time through base.js
`api.clip`, so a slow phone paints the same clip, only slower. It arrives, orbits, lands at the week's monument (or, for
`kind=day`, its latest session) and ends under a paper card with the week's name, body, numbers and the site.
WebCodecs encodes it with the vendored `lib/mp4-muxer.js`; a browser without `VideoEncoder` records the canvas with
MediaRecorder in real time instead. The planet page, the shelf card and the galaxy card link to `story/#p=<code>`,
which renders it and hands it to the phone's share sheet (or downloads it, with the caption copied). For automation:

    story/index.html?link=<code>&kind=week|day&format=story|square|wide&auto=1

renders at once and sets `window.__story = { done, blob, caption, mime, poster, ms }` (or `{ done, error }`).

## Phone kit

https://planet.fleming.run/kit/ is an unlisted page (`noindex`, linked from nowhere) for posting the week from a
phone. It holds two clips: the week so far (`kind=day`, story and square) and the last full week (`kind=week`, story,
square and wide). Share hands the clip in the shape picked to the phone's share sheet, where Instagram Stories, TikTok
and X take it, and copies the caption in the same tap, since Instagram drops words sent along with a video. Save video
and Save picture download the clip or its last frame, and Copy caption copies the words. Each file is fetched before
its Share is pressed: a phone opens its sheet only right after the tap. On an iPhone, Safari's Share, then Add to Home
Screen, keeps it on the home screen with its own icon (`kit/manifest.webmanifest`).

    bun scripts/story-render.mjs --day|--week|--both

paints them from the built site in `var/planet-home-dist` (so build first): `story/?auto=1` in headless Chrome
(`scripts/chrome.mjs`), each clip re-encoded by ffmpeg (x264 at CRF 18, capped at 6 Mb/s, so under 10 MB) with its
last frame as a JPEG poster. They go into `apps/planet-home/kit/media/` under stable names (`today-story.mp4`,
`week-wide.jpg`), beside `kit/kit.json`: each kind's week, share code, name, body, caption, files and when it was
made. Only the latest day and week are kept, and a kind's clips are swapped in together once all of them are made.
The week so far is the shelf's newest week with a session in it that hasn't ended on this Mac's calendar, and the
last full week is the newest one that has. A week's so-far clips go once its full ones are made. The kit holds what
the shelf already shows: its share codes (no names, routes as shapes) and the captions story/ writes from them.
`kit.json` and `kit/media/` are git-ignored: planet-sync makes them and copies them into its release tree to deploy
(see Sync).

## Sync

    bun scripts/planet-sync.mjs [--publish] [--dry-run] [--force] [--json]

One idempotent step for any scheduler to run after Garmin data lands —
`personalBranding/scripts/garmin-auto.sh` today, Saga's daemon later — so nothing else has to know how the shelf is
kept. It reads the weeks from VARÐA's `data/history.json` (the published copy, or VARÐA's checkout beside this repo)
and then:

- writes the private seeds: `var/private/planet/seeds/<week>.js` for every week with a planet link, plus `latest.js`
  for the newest week with a session in it, and links them into `apps/planet/seeds/` the way `scripts/dev.sh` does.
  Each carries a `// planet-sync: generated from …` header and is rewritten only when its week changed; a seed without
  that header is written by hand and is never touched.
- repaints the demo shelf's stills for the weeks whose planet link, still or look changed, each with its globe
  (`ryan/globe/<week>.webp`: the planet alone on a transparent square, its classic poster's globe without its
  companions, sun or space, which the galaxy lays on its week's planet), paints any globe that is missing, and keeps
  `ryan.json` (with each week's `globe`, how large the globe stands in its classic still). `--force` repaints every
  week. The look is HEAD's `apps/planet` plus `apps/planet-home/lib`, stamped per week in
  `var/sync/shelf-look.json`, so a commit that changes how a planet is drawn refreshes the shelf without a `ryan.json`
  change. A week dropped from history keeps its still and globe.
- paints the phone kit's clips (see Phone kit) when they're out of date: the week so far's at each new session, the
  last full week's at the first run after a week ends. They're painted from a build of the release tree with this
  run's shelf copied in. A failed clip holds nothing else back: the shelf still goes out, and the run ends
  `failed: clips: <reason>`.
- with `--publish`, deploys the home when the shelf or the clips changed this run or an earlier run left a deploy
  pending.

Painting and deploying happen in a detached worktree of HEAD at `var/sync/release`, created or force-checked-out and
cleaned on every run, served as `scripts/dev.sh` serves the app: an unattended run never paints or publishes work in
progress. The shelf data and the kit's clips are the exception: `apps/planet-home/shelf/ryan.json`,
`ryan/<week>.webp`, `ryan/globe/<week>.webp`, `kit/kit.json` and `kit/media/` are read and written in this working
tree, which stays the source of truth, and are copied into the release tree to build and deploy.
One run at a time, by `var/sync/lock`; a lock older than 30 minutes is a crashed run's.

`--dry-run` writes the seeds (they are inert) and reports the weeks and clips a real run would paint and what
`--publish` would do, without painting, deploying or writing deploy state. The final line reads
`planet-sync: <unchanged|changed|published|held: reason|failed: reason>`, and `--json` prints it as one JSON object.
A held run exits 0, since it is asking for a later one, and only a failure (no history, a failed paint, clip or
deploy) exits 1.

- `PLANET_HISTORY`: the history to read, a path or a URL, or a shelf saved from the site (see Run your own).
  Default: the published copy, then VARÐA's checkout.
- `PLANET_DEPLOY_STATE`: where the deploy state is kept. Default `../personalBranding/var/private/garmin`, VARÐA's
  own, in its checkout beside this repo.
- `PLANET_DEPLOY_GATE`: the file whose absence pauses deploys. Default `var/private/garmin/deploy.env`.

In that state directory: `planet-deploy.pending` (a `--publish` run sets it when the shelf or the clips changed and
clears it once the deploy goes out), `planet-last-deploy.at` (this project's 45-minute clock, stamped before deploying
so a failed deploy waits too), `planet-deploys` (`YYYY-MM n`), and, with VARÐA's own `deploys` file, the two sites'
shared monthly allowance: 400 × day ÷ days in the month.

    PLANET_HISTORY=<your VARÐA checkout>/apps/varda/data/history.json bun scripts/planet-sync.mjs --dry-run

The deploy is `scripts/planet-home-deploy.sh` in the release tree, with the real shelf data copied in and the real
`var/private` linked, so the gate file and `site-denylist.txt` are the ones on this machine. Painting needs Chrome,
Playwright and `python3`, and the clips need `ffmpeg`. `scripts/chrome.mjs` finds Chrome and Playwright and starts
Chrome as browser-lab's `capture.ts` did, so the shelf paints byte for byte as before.
`bun apps/planet-home/shelf/_ryan.mjs [--force]` still paints by hand. It serves this working tree, where planet-sync
serves the release checkout.

## Run your own

The quick way needs no setup. Open https://planet.fleming.run/make/, drop in a Garmin or Strava export, and press
Share this planet under the week. The clip is painted in your browser and goes to your phone's share sheet, with the
caption copied.

A copy of the whole thing, painting your weeks' clips and putting them on your own Cloudflare Pages site, runs from
a fork:

1. Fork and clone this repo. You need bun, git, python3, ffmpeg, cwebp (`brew install ffmpeg webp`) and Google Chrome
   (or `bunx playwright install chromium`), and Node to publish. In the repo, run `bun add playwright`.
2. Give the build its two private files. `var/private/site-denylist.txt` lists words that must never go out, one a
   line (your surname, your town), and the build won't run without it. `var/private/planet/seed-week.js` is the
   app's default week, and `cp apps/planet/seeds/synthetic-tiny-week.js var/private/planet/seed-week.js` will do.
3. Bring your weeks in. On make/, drop in your export and save each week to your shelf. Then, on the shelf, press
   Save the shelf to a file. The scripts take each week from that file without its sessions' names.
4. Run

       PLANET_HISTORY=~/Downloads/planet-shelf-2026-10-08.json bun scripts/planet-sync.mjs

   It paints your weeks onto the shelf, in place of Ryan's, and your clips into `apps/planet-home/kit/`. It paints
   from your fork's last commit, so commit what you change first. To paint only the clips again:
   `bun scripts/planet-home-build.mjs && bun scripts/story-render.mjs --both`.
5. To publish, give wrangler a login of its own and make a Pages project:

       XDG_CONFIG_HOME=$PWD/var/private/wrangler npx wrangler login
       XDG_CONFIG_HOME=$PWD/var/private/wrangler npx wrangler pages project create <name> --production-branch main

   Put `CLOUDFLARE_ACCOUNT_ID=<your account id>` and `XDG_CONFIG_HOME=<that folder, as a full path>` in
   `var/private/garmin/deploy.env`. Then add `--publish` to the command in step 4, with `PLANET_PROJECT=<name>` and
   `PLANET_DEPLOY_STATE=var/private/garmin` beside `PLANET_HISTORY`. Each run with a newer shelf file puts its clips
   on `https://<name>.pages.dev/kit/` (Ryan's: `https://planet.fleming.run/kit/`).

The pages still say Ryan in a few places, like the shelf's name and the footer, and every clip's card names
planet.fleming.run (`SITE` in `lib/story.js`). They're yours to change. Connect with Strava needs a Strava API
app of your own (see Strava Functions). Strava's export zip works without one.

## Strava Functions

Cloudflare Pages maps the handlers under `functions/api/strava/` to these routes:

- `GET /api/strava/login` — set a short-lived OAuth state cookie and redirect to Strava; if the three private values
  are not configured yet, return safely to `/make/?error=strava&why=off`.
- `GET /api/strava/callback` — verify the state and granted scopes, exchange the one-use code, and set the encrypted
  connection cookie. Any failure redirects to `/make/?error=strava&why=<expired|denied|scope|busy|failed|off>`, and
  the make page says what happened in words. Success redirects to `/make/?connected=strava`, and the make page paints
  the last full week, Monday to Sunday, with no other tap (when that week is empty, the newest week before it that
  has sessions). The week in progress is a tap away: This week so far.
- `GET /api/strava/status` — report `{configured, connected}` without calling Strava. The make page offers files
  only and hides the Strava chooser until `configured` is true.
- `POST /api/strava/week` — accept `{week, after, before}` for one exact browser-local Monday-to-Monday interval,
  fetch that selected week, and return `{activities, detail, warning?, garmin}`. `garmin` lists the week's
  "Garmin [device model]" lines (from `device_name`, Strava API Policy 4.4): make/, the clip, the poster, the shelf and
  the planet page show them for a Strava week recorded on Garmin devices (`garminLines` in `apps/planet/strava-mark.js`).
  With `weeks: n` (1 to 13 Mondays back to back from `week`) it answers that run as summaries, with no streams: every
  page of the activity list (`per_page=200`, one read a page), each activity carrying its own Garmin lines, and
  `budget: {left, limit}`, what's left of the app's read budget ([this 15 minutes, today], from
  `X-ReadRateLimit-Usage`). A run that needs another page while fewer than 45 reads are left (one opened week's list
  and streams) stops with 429 and `Retry-After`. make/'s week strip reads the last 26 weeks this way in two calls; a
  batch (Paint my last 12 weeks, Paint my year) reuses them, reads the rest a quarter at a time, and waits for the
  next quarter hour while fewer than 45 reads are left. The batch paints each week's still and globe in the browser
  and keeps them with the week on the shelf, so the galaxy can show the visitor's own weeks (`galaxy/?mine`).
- `POST /api/strava/disconnect` — revoke the grant with Strava's `oauth/revoke` (the refresh token, Basic auth; the old
  `oauth/deauthorize` stops on June 1, 2027) and clear both cookies. POST routes require the exact production Origin.

Local end-to-end test, with no Strava account: `var/bench/oneclick/strava-standin.mjs` stands in for Strava's OAuth and
API, `wrangler pages dev` runs the real Functions against it, and `var/bench/oneclick/e2e.mjs` drives the phone flows.

OAuth requests only `read,activity:read_all`, never a write scope. Planet Creator fetches the summaries of the weeks
make/ shows (the last 26, up to a year for a batch) and the streams of only the week a visitor opens; it does not poll
or register a webhook. If the connection cookie has already been cleared, revoke access in
Strava's application settings because Planet Creator no longer has the token needed to do so.

Every API response is `private, no-store`. The week Function transforms Strava data in memory and returns only the
Planet Creator activity shape. Raw latitude/longitude is reduced to an origin-free `routeShape` and `routeSpanM`
before it reaches browser JavaScript. No remote profile, activity, coordinate, or token is stored in KV, D1, R2,
Cache API, Durable Objects, Analytics Engine, or a server session, and sensitive request/provider data is not logged.
Strava and Cloudflare still process the request and ordinary request metadata.

Connection state is not a Planet Creator account. OAuth state lives in a ten-minute host-only, secure, HttpOnly
cookie; athlete ID, scopes, and tokens live in the versioned AES-GCM-encrypted `pc_strava` cookie for at most 30 days.
The encryption key exists only as a Cloudflare secret. Once a normalized week is returned, Strava planets
intentionally retain Planet Creator's full browser shelf, share-link, and poster controls; none of those outputs
contains raw coordinates.

Strava does not provide Garmin's sweat loss, training load, training effects, strength sets or laps. The shared
`apps/planet/activity-shape.js` helpers estimate only `sweatMl`, `trainingLoad` and `anaerobicEffect`, mark those field
names in each activity's `estimated` array, and leave aerobic effect, strength and laps empty. Their transparent
coefficients were fitted to 566 decoded activities across Ryan's 82 real weeks; they are visual proxies, not health
or coaching measurements.

Every import (FIT files, a Strava week, a Garmin week through Junction) also reads how each session went while its
samples still exist (`apps/planet/effort.js`), keeps six small fields and drops the samples. Each field is null when
the samples cannot say, and unknown is never read as steady. `place` is road, treadmill, trainer, pool, open, gym,
mat, stairs or elliptical. `shape` is intervals, tempo, steady, long, recovery or climb. `ribbon` is 12 steps of 0-7:
the intensity along the session against its own median, from speed on foot and heart rate on a ride or a machine
(whichever was recorded). `reps` is set only when laps or a clear repeated rise show it. `splits` is seconds per km for
each lap or kilometre; a link keeps them on races only. `inclineM` is a route-less session's recorded ascent, moved
out of `ascentM`: it is incline, not climb, so neither `weekStats.climb` nor tundra's gate counts it. Strava's one
streams call also asks for `velocity_smooth` and `distance`; Junction's stream already carries both. A link with any
of these fields is version 2 (`share.js`).
A week without them is written as version 1, the link it has always had, and a version-1 link decodes exactly as
before, with none of the fields.

The real endpoint defaults are:

    STRAVA_API_BASE=https://www.strava.com/api/v3
    STRAVA_OAUTH_BASE=https://www.strava.com/oauth

Local fixture tests may override those two bindings and set `SITE_ORIGIN` to the exact loopback origin serving
Wrangler Pages. Do not point production at a substitute service.

### Public policy pages

The public privacy policy is https://planet.fleming.run/privacy/ and the terms are
https://planet.fleming.run/terms/. The privacy page describes the distinct local FIT, transient Strava and Junction
Garmin paths, cookies, sharing, disconnect/deletion, and support contact.

### Secrets and deployment

Create ignored `var/private/strava.env` with the application credentials (the uploader restricts it to mode `0600`):

    STRAVA_CLIENT_ID=123456
    STRAVA_CLIENT_SECRET=the-client-secret

Then run:

    scripts/strava-secrets.sh
    scripts/planet-home-deploy.sh

`strava-secrets.sh` restricts the file to its owner and creates a cryptographically random 32-byte base64
`STRAVA_COOKIE_KEY` when the value is missing or empty. It takes `CLOUDFLARE_ACCOUNT_ID` and the isolated
`XDG_CONFIG_HOME` from `var/private/garmin/deploy.env` in preference to ambient values, removes ambient Cloudflare
API credentials, then sends the client ID, client secret, and cookie key separately to Wrangler's `pages secret put`
for project `planetcreator`; it never prints their values. The deploy remains rooted at `var/planet-home-dist/`,
while Wrangler deploys repository `functions/` separately as Pages Functions.

Before enabling the connection:

1. Deploy the public privacy and terms pages.
2. Create the official application in Strava's API settings. Set website to `https://planet.fleming.run`,
   callback domain to `planet.fleming.run` (domain only), and redirect URI to
   `https://planet.fleming.run/api/strava/callback`.
3. Use Strava's official **Connect with Strava** asset and do not imply Strava sponsorship.
4. Upload the three secrets with `scripts/strava-secrets.sh`, deploy, and authorize the owner-only prototype.
5. Start at Strava's athlete capacity **1**, request the dashboard's self-service increase to **10**, then submit the
   Developer Program review before serving more than ten athletes. A higher capacity is not guaranteed.

## Garmin Functions (Junction)

Garmin's own developer program takes no new apps, so Connect Garmin goes through Junction (docs.junction.com), which
holds Garmin's approval and keeps what Garmin sends. Planet Creator stores no activity data: each week is read from
Junction when asked, as the Strava week is from Strava. The design and its sources are in
`var/bench/oneclick/junction-design.md`. Cloudflare Pages maps `functions/api/garmin/` to:

- `POST /api/garmin/login` — make/'s form (Origin checked, since each connection makes a Junction user): create a Junction
  user with a random ID and `ingestion_end` 30 days out, get a Garmin link token and its OAuth link, set a 30-minute
  encrypted state cookie and redirect (303) to Garmin's consent page. Off, or failing, it returns to
  `/make/?error=garmin&why=<off|busy|failed>`.
- `GET /api/garmin/callback` — Junction's redirect back (`state=success|error`, the check rides as `pc`): set the encrypted
  `pc_garmin` cookie (Junction user ID and creation time, at most 30 days) and redirect to `/make/?connected=garmin`, or
  delete the attempt's user and return with `why=<denied|scope|expired|busy|failed>`.
- `GET /api/garmin/status` — `{configured, connected}` with no Junction call.
- `POST /api/garmin/week` — the Strava week's request and answer: that week's Garmin workouts and their streams, mapped in
  memory (`functions/_shared/junction-map.js`), routes as unit-box shapes, plus the `garmin` "Garmin [device model]" lines.
  An empty week checks the connection: one ended in Garmin Connect is deleted and the page asked to reconnect.
- `POST /api/garmin/disconnect` — delete the Junction user (Junction erases its data within 7 days), then clear the cookies.
- `POST /api/garmin/webhook` — Junction's Svix-signed events; `provider.connection.error` for Garmin deletes that user,
  everything else is acknowledged and dropped. Set the endpoint to send only that event.

`workers/junction-sweep` is a Worker on an hourly cron: it deletes every user in the Junction team 30 days after it was
made, or an hour after when it never connected. The team must be Planet Creator's alone. The site's three values are
`JUNCTION_API_KEY` (its prefix picks the environment: `sk_us_` sandbox, `pk_us_` production), `JUNCTION_WEBHOOK_SECRET`
and `JUNCTION_COOKIE_KEY`; Connect Garmin stays hidden until all three exist. `scripts/junction-secrets.sh` uploads them
from `var/private/junction.env` and deploys the sweep with its key; `scripts/junction-dev.sh` runs the Functions on this
Mac against Junction's sandbox.

Local end-to-end test, with no Junction account: `var/bench/oneclick/junction-standin.mjs` stands in for Junction and
Garmin's consent page and signs its webhooks, `wrangler pages dev` runs the Functions from `var/bench/oneclick/site`
(its `.dev.vars` is `junction-standin.env`, which also sets `JUNCTION_API_BASE`), and
`var/bench/oneclick/junction-e2e.mjs` drives the phone flows. `bun functions/_shared/junction.js` checks the webhook
signature code against Svix's published example.

## Private files (never in git)

`var/private/` is ignored:

- `planet/seed-week.js` and `planet/seeds/<week>.js` — the real weeks. `seed-week.js` (the race week
  `_terrain-pin.mjs` reads) and a few named seeds are written by hand and name the towns their runs started in, so
  both builds strip titles and places before anything goes out; every other week (and `latest.js`) is written by
  `scripts/planet-sync.mjs`. `scripts/dev.sh` links them into `apps/planet/`. No picture painted from them is
  tracked: the sky pin's shots are painted from a synthetic week (see Worlds, prints and craft dials).
- `site-denylist.txt` — the private terms the build must not find in what it ships.
- `strava.env` — the Strava client ID and secret plus the generated cookie key used by
  `scripts/strava-secrets.sh`. Never copy it into the static output.
- `junction.env` — the Junction team key and webhook signing secret plus the generated cookie key used by
  `scripts/junction-secrets.sh`; `junction-dev/` is the local run `scripts/junction-dev.sh` makes from it.
- `garmin/deploy.env` — `CLOUDFLARE_ACCOUNT_ID` and the isolated `XDG_CONFIG_HOME` that `scripts/planet-home-deploy.sh`
  reads. `cloudflare/` is a symlink to VARÐA's `var/private/cloudflare` (in its checkout beside this repo), the one
  wrangler login for Ryan's account. Never copy it: wrangler rotates its refresh token, so two copies break each other.
- `planet-demo/` — the demo video rig and its outputs (its own files say how it runs).

## Worlds, prints and craft dials

A week is drawn as one world. `apps/planet/worlds/<id>.js` modules hook the reading (`fit`, `climate`, `baseline`,
`shape`, `palette`, `companions`, `orbit`; see the header of `worlds/index.js`), and `world.archetype` picks one:
`classic` (the default, pinned by `_terrain-pin.mjs` and `_sky-pin.mjs`), a named world, or `auto`, which takes the
world whose `fit` of the week's signals (`weekStats`) is at least 0.55 and leads the next by 0.12. Inside that margin
the one of the two built for the week (`builtFor`, today only tundra's: a week under a roof) takes it; else classic.

| world | claims | look |
|---|---|---|
| `moon` | rest weeks: under 2.6 h or at most 2 sessions | airless cratered stone, a crater per session, a second moon |
| `tundra` | no climb on a route (a treadmill's incline does not count), at least 85% indoors | an ice sheet over ink sea, bayed where the week trained |
| `mesa` | rides at least 28% of the time and at least the run share | red tablelands cut by the rides' canyons |
| `foundry` | lifting at least 45% | stepped basalt tiles, quarried lift clusters, an ore moon |
| `caldera` | zones 4–5 at least half the time at a load of 800+ | ash volcanoes with calderas on the hardest days |
| `commons` | football at least 45% | hedged green pasture, levelled pitches |
| `archipelago` | swimming at least 20% | island chains and reefs in a drowned globe, a small moon |

`look.print` lays one final pass over the ink frame: `ink` (none), `riso` (three spot plates), `woodblock` (keyed
flats and a bold key block), `etching` (ruled copperplate), `gouache`, `moebius`, `mosaic`, `atlas`, `nocturne`,
`pointillist`, or `auto` (the default: each world's signature print, and the ink frame for every body and race week;
see `prints/index.js`). `kinds.pitch` draws football as a mown, chalked pitch instead of a cairn. `companions.race`, on
by default, hangs a ring round the globe and pulls the poster back to fit it; `companions.ringStyle` picks how it is
drawn (`saturn`, the default, a Saturn-scale ring system from `rings-saturn-shader.js`; `splits`, the ringlet-per-split
ring; `rubble` and `orrery` from `rings-rubble.js`; `track` and `aurora` from `rings-track.js`), and
`companions.ringTilt`, `ringBands`, `ringShadow`,
`ringDust` tune it. The `craft.*` dials (`limb`, `paper`, `values`, `palettes`, `frame`) and `world.dayMass`,
`world.lineage`, `climate.seasonFallback` rework the classic painting. The planet itself: `light.terminator` (the real
sun from orbit, with a painted night side), `light.night` (how dark that night side goes), `light.atmosphere` (a washed
band beyond the limb), `pal.caps` (paper only for polar caps and snow, sized by the week's warmth), `sky.orbitClouds`
(a painted cloud layer from `apps/planet/ink-clouds.js`), and `terrain.spines`, `terrain.rivers`, `terrain.coast`
(mountain chains, drainage and fractal coasts from `apps/planet/terrain.js`). `motion.living`, on by default, puts the
painting on a clock (sea glitter, drifting washes and clouds, a breathing terminator) without moving the paper.

A week may also be drawn as a body rather than a rocky planet. `world.body` picks one from `apps/planet/bodies/` (the
contract is in `bodies/index.js`): `rock`, `marble` (small weeks: a cratered asteroid), `giant` (the biggest weeks:
banded gas giant with the longest session as its great storm), `ice` (cold, roofed volume: an ice giant), `lava`
(hard, hot weeks), `star` (the year's race or longest week: by default the week's own rock world under an aurora
crown, with `star.look` 0, 1, 3 and 4 for a star, a painted star, an eclipse or a lacquer world), `blackhole` (a week's tiny planet beside a black hole;
only when named, never `auto`'s pick), or `auto` (the default: the best-fitting body, else rock). The frame around it,
all on by default: `sky.space` (a painted deep-space backdrop, `ink-space.js`), `system.sun` and `system.phenomena`
(the week's own sun, coloured by the hour it trained, plus a binary companion, comet, asteroid belt, water moon or halo
when the week earned one; `system.js`), and `poster.shot` (`auto`: a hero shot on race weeks, a crescent for big rocky
weeks, a long lens for long runs, else classic; `crescent`, `horizon`, `telephoto`, `hero` and `classic` by name; from
`shots.js`, handing over to the ordinary orbit on the first drag). The pins guard the painting under all of this, so
they turn these dials back off (`_sky-pin.mjs` PAINTING, `_terrain-pin.mjs` world.body=rock); compare a change on a
wall (below) before changing a default, then re-pin. `_sky-pin.mjs` paints the made-up race week
(`seeds/synthetic-cold-hard.js`), and `bun apps/planet/_sky-pin.mjs --write` re-pins it into
`apps/planet/shots/anchor/`. It refuses any other seed: tracked shots are public, so never capture `seed-week.js`, a
private week or a share code into `apps/planet/shots/` by hand.

## Tuning bench

The private tuning bench paints the core reference weeks, keeps one planet live, exposes every entry in
`apps/planet/params.js`, and compares two parameter sets by their fixed-time pixel difference:

    bun apps/bench/serve.mjs

Open http://127.0.0.1:8800/. The server binds only to loopback, serves the app and private seed scripts from their
existing locations, and saves named parameter snapshots under ignored `var/bench/snapshots/`.

Capture a deterministic review round (requires Chrome, `ffmpeg`, and `ffprobe`). Each `--clips` week gets both the
turning orbit and a held-camera orbit; `--closeups` adds one surface clip for every supported feature kind present,
and `--transition` records the real two-second orbit-to-surface flight with explicit deterministic frame deltas:

    bun apps/bench/round.mjs --set default --panel core --clips 2025-04-28,2026-09-28
    bun apps/bench/round.mjs --set default --panel core --clips 2026-01-12,2026-09-28 --closeups 2026-01-12,2026-09-28 --transition 2026-09-28
    bun apps/bench/review.mjs var/bench/rounds/r1 --blind

Rounds stay under ignored `var/bench/rounds/`; they are local review artifacts and must not be deployed or uploaded.

A wall compares strategies instead of one week's looks: rows are weeks, columns are world archetypes or saved
parameter snapshots, and every cell is the real app's own still at `?t=1` (`--view surface` paints the monument
landing instead), cropped square the way a shelf still is. One command writes the labelled grid PNG and a sibling
manifest naming each cell's file and render time:

    bun apps/bench/wall.mjs --weeks 2025-04-28,2026-09-28 --worlds classic,auto --out var/bench/walls/races.png
    bun apps/bench/wall.mjs --shelf 6 --params var/bench/snapshots/a.json,var/bench/snapshots/b.json --out var/bench/walls/dials.png

`--weeks` names seeds (the private store first, then the checked-in fixtures) and `--shelf N` samples N of the demo
shelf's public weeks evenly, so a wall can be built without a private seed at all. Walls stay under ignored
`var/bench/walls/`; like rounds, they are local review artifacts and must not be deployed or uploaded.

## License

This repo's own code is MIT licensed: see [LICENSE](LICENSE). The vendored libraries keep their own licenses, and the
Strava marks are Strava's, not MIT: see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

#!/bin/bash
# Connect Garmin on this Mac against Junction itself (no stand-in): the real Pages Functions under `wrangler pages dev`
# on http://127.0.0.1:8993, with the key from var/private/junction.env. Open http://127.0.0.1:8993/make/ in a browser
# here, tap Connect Garmin, sign in to Garmin, and the latest week paints once Garmin has sent it. Junction's webhooks
# can't reach this Mac, so a disconnect made in Garmin Connect isn't seen here; Disconnect on the page still deletes.
# The local values go in var/private/junction-dev/.dev.vars, where wrangler reads them; nothing is printed.
#   scripts/junction-dev.sh
set -euo pipefail
cd "$(dirname "$0")/.."

JUNCTION_ENV=var/private/junction.env
DEV=var/private/junction-dev
[ -f "$JUNCTION_ENV" ] || { printf '%s\n' "$JUNCTION_ENV is missing: put JUNCTION_API_KEY=sk_us_… in it (var/bench/oneclick/ryan-steps.md, part 3)" >&2; exit 1; }
grep -q '^JUNCTION_API_KEY=sk_' "$JUNCTION_ENV" || { printf '%s\n' "JUNCTION_API_KEY in $JUNCTION_ENV must be a sandbox key (sk_…) for a local test" >&2; exit 1; }

mkdir -p "$DEV"
ln -sfn ../../../functions "$DEV/functions"
umask 077
{
  grep -E '^(JUNCTION_API_KEY|JUNCTION_WEBHOOK_SECRET|JUNCTION_COOKIE_KEY)=' "$JUNCTION_ENV"
  # Functions want all three values; a webhook can't reach 127.0.0.1, so any whsec_ value serves here
  grep -q '^JUNCTION_WEBHOOK_SECRET=' "$JUNCTION_ENV" || printf 'JUNCTION_WEBHOOK_SECRET=whsec_%s\n' "$(openssl rand -base64 24)"
  grep -q '^JUNCTION_COOKIE_KEY=' "$JUNCTION_ENV" || printf 'JUNCTION_COOKIE_KEY=%s\n' "$(openssl rand -base64 32)"
  printf 'SITE_ORIGIN=http://127.0.0.1:8993\n'
} >"$DEV/.dev.vars"

pids=$(lsof -ti tcp:8993 -sTCP:LISTEN || true)
[ -z "$pids" ] || { printf '%s\n' "port 8993 is taken (pid $pids)" >&2; exit 1; }
exec npx -y wrangler@latest pages dev ../../../apps/planet-home --cwd "$DEV" --ip 127.0.0.1 --port 8993 --compatibility-date 2026-06-01

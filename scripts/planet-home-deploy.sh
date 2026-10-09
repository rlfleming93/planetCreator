#!/bin/bash
# Build Planet Creator's public home (scripts/planet-home-build.mjs, which refuses anything personal) and publish
# var/planet-home-dist to Cloudflare Pages: project $PLANET_PROJECT (default planetcreator), branch main.
# personalBranding/scripts/garmin-auto.sh runs this after a full Garmin sync only when the demo shelf changed, behind
# its separate 45-minute clock and the two sites' shared monthly allowance. It is also fine to run by hand.
# CLOUDFLARE_ACCOUNT_ID and XDG_CONFIG_HOME come from the environment, and whatever isn't set there from
# var/private/garmin/deploy.env (or deploy.env.paused for a manual deploy). XDG_CONFIG_HOME holds
# the isolated wrangler login for Ryan's own account: the default wrangler login on this Mac is another account's,
# so this never runs without one.
# The project has to exist first (a pages.dev name is first come, first served):
#   npx -y wrangler@latest pages project create planetcreator --production-branch main
#   scripts/planet-home-deploy.sh                          (or PLANET_PROJECT=planet-creator scripts/planet-home-deploy.sh)
set -euo pipefail
cd "$(dirname "$0")/.."
for env in var/private/garmin/deploy.env var/private/garmin/deploy.env.paused; do
  [ -f "$env" ] || continue
  while IFS='=' read -r key value || [ -n "$key" ]; do
    case "$key" in '' | '#'*) continue ;; esac
    [ -n "${!key:-}" ] || export "$key=$value"
  done <"$env"
  break
done
: "${CLOUDFLARE_ACCOUNT_ID:?is not set: export it, or put it in var/private/garmin/deploy.env}"
: "${XDG_CONFIG_HOME:?is not set: without the isolated login from var/private/garmin/deploy.env, wrangler would use the default one}"
export CLOUDFLARE_ACCOUNT_ID XDG_CONFIG_HOME
bun scripts/planet-home-build.mjs
npx -y wrangler@latest pages deploy var/planet-home-dist --project-name "${PLANET_PROJECT:-planetcreator}" --branch main --commit-dirty=true

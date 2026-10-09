#!/bin/bash
# Switch on Connect Garmin (Junction): load var/private/junction.env, create the cookie key once, upload the three Pages
# secrets to project planetcreator, then deploy the daily sweep Worker (workers/junction-sweep) with its one secret,
# through Ryan's isolated Cloudflare login. Secret values go to Wrangler on stdin only. Deploy the site afterwards
# (scripts/planet-home-deploy.sh): Pages secrets take effect on the next deploy.
#   var/private/junction.env:  JUNCTION_API_KEY=sk_us_… (or pk_us_…)   JUNCTION_WEBHOOK_SECRET=whsec_…
set -euo pipefail
cd "$(dirname "$0")/.."

JUNCTION_ENV=var/private/junction.env
[ -f "$JUNCTION_ENV" ] || { printf '%s\n' "$JUNCTION_ENV is missing" >&2; exit 1; }
chmod 600 "$JUNCTION_ENV"

JUNCTION_API_KEY=
JUNCTION_WEBHOOK_SECRET=
JUNCTION_COOKIE_KEY=
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in '' | '#'* ) continue ;; esac
  key=${line%%=*}
  value=${line#*=}
  [ "$key" != "$line" ] || continue
  case "$key" in
    JUNCTION_API_KEY) JUNCTION_API_KEY=$value ;;
    JUNCTION_WEBHOOK_SECRET) JUNCTION_WEBHOOK_SECRET=$value ;;
    JUNCTION_COOKIE_KEY) JUNCTION_COOKIE_KEY=$value ;;
  esac
done <"$JUNCTION_ENV"

[[ "$JUNCTION_API_KEY" =~ ^(pk|sk)_(us|eu)_ ]] || { printf '%s\n' "JUNCTION_API_KEY in $JUNCTION_ENV must be a Junction team key (sk_us_… sandbox, pk_us_… production)" >&2; exit 1; }
[[ "$JUNCTION_WEBHOOK_SECRET" =~ ^whsec_ ]] || { printf '%s\n' "JUNCTION_WEBHOOK_SECRET in $JUNCTION_ENV must be the webhook's whsec_ signing secret" >&2; exit 1; }
if [ -z "$JUNCTION_COOKIE_KEY" ]; then
  command -v openssl >/dev/null || { printf '%s\n' 'openssl is required to create JUNCTION_COOKIE_KEY' >&2; exit 1; }
  JUNCTION_COOKIE_KEY=$(openssl rand -base64 32)
  printf '\nJUNCTION_COOKIE_KEY=%s\n' "$JUNCTION_COOKIE_KEY" >>"$JUNCTION_ENV"
fi

account=${CLOUDFLARE_ACCOUNT_ID:-}
config=${XDG_CONFIG_HOME:-}
for deploy_env in var/private/garmin/deploy.env var/private/garmin/deploy.env.paused; do
  [ -f "$deploy_env" ] || continue
  while IFS='=' read -r key value || [ -n "$key" ]; do
    case "$key" in
      CLOUDFLARE_ACCOUNT_ID) account=$value ;;
      XDG_CONFIG_HOME) config=$value ;;
    esac
  done <"$deploy_env"
  break
done
: "${account:?CLOUDFLARE_ACCOUNT_ID is not set in var/private/garmin/deploy.env or the environment}"
: "${config:?XDG_CONFIG_HOME is not set in var/private/garmin/deploy.env or the environment}"
CLOUDFLARE_ACCOUNT_ID=$account
XDG_CONFIG_HOME=$config
unset CLOUDFLARE_API_TOKEN CLOUDFLARE_API_KEY CLOUDFLARE_EMAIL CF_API_TOKEN CF_API_KEY WRANGLER_API_TOKEN
export CLOUDFLARE_ACCOUNT_ID XDG_CONFIG_HOME

printf '%s' "$JUNCTION_API_KEY" | npx -y wrangler@latest pages secret put JUNCTION_API_KEY --project-name planetcreator
printf '%s' "$JUNCTION_WEBHOOK_SECRET" | npx -y wrangler@latest pages secret put JUNCTION_WEBHOOK_SECRET --project-name planetcreator
printf '%s' "$JUNCTION_COOKIE_KEY" | npx -y wrangler@latest pages secret put JUNCTION_COOKIE_KEY --project-name planetcreator

# the sweep exists before its secret can be put on it; until then its run finds no key and deletes nothing
npx -y wrangler@latest deploy --config workers/junction-sweep/wrangler.toml
printf '%s' "$JUNCTION_API_KEY" | npx -y wrangler@latest secret put JUNCTION_API_KEY --config workers/junction-sweep/wrangler.toml

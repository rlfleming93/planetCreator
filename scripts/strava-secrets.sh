#!/bin/bash
# Load Planet Creator's private Strava app credentials, create the cookie key once, and upload all three through
# Ryan's isolated Cloudflare login. Secret values are passed only on stdin to Wrangler.
set -euo pipefail
cd "$(dirname "$0")/.."

STRAVA_ENV=var/private/strava.env
[ -f "$STRAVA_ENV" ] || { printf '%s\n' "$STRAVA_ENV is missing" >&2; exit 1; }
chmod 600 "$STRAVA_ENV"

STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
STRAVA_COOKIE_KEY=
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in '' | '#'* ) continue ;; esac
  key=${line%%=*}
  value=${line#*=}
  [ "$key" != "$line" ] || continue
  case "$key" in
    STRAVA_CLIENT_ID) STRAVA_CLIENT_ID=$value ;;
    STRAVA_CLIENT_SECRET) STRAVA_CLIENT_SECRET=$value ;;
    STRAVA_COOKIE_KEY) STRAVA_COOKIE_KEY=$value ;;
  esac
done <"$STRAVA_ENV"

: "${STRAVA_CLIENT_ID:?is not set in $STRAVA_ENV}"
[[ "$STRAVA_CLIENT_ID" =~ ^[1-9][0-9]{0,18}$ ]] || { printf '%s\n' 'STRAVA_CLIENT_ID must be a positive integer' >&2; exit 1; }
: "${STRAVA_CLIENT_SECRET:?is not set in $STRAVA_ENV}"
if [ -z "$STRAVA_COOKIE_KEY" ]; then
  command -v openssl >/dev/null || { printf '%s\n' 'openssl is required to create STRAVA_COOKIE_KEY' >&2; exit 1; }
  STRAVA_COOKIE_KEY=$(openssl rand -base64 32)
  printf '\nSTRAVA_COOKIE_KEY=%s\n' "$STRAVA_COOKIE_KEY" >>"$STRAVA_ENV"
fi
: "${STRAVA_COOKIE_KEY:?is empty in $STRAVA_ENV}"

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

printf '%s' "$STRAVA_CLIENT_ID" | npx -y wrangler@latest pages secret put STRAVA_CLIENT_ID --project-name planetcreator
printf '%s' "$STRAVA_CLIENT_SECRET" | npx -y wrangler@latest pages secret put STRAVA_CLIENT_SECRET --project-name planetcreator
printf '%s' "$STRAVA_COOKIE_KEY" | npx -y wrangler@latest pages secret put STRAVA_COOKIE_KEY --project-name planetcreator

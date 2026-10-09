#!/bin/bash
# Planet Creator's two local servers, started in the background (nohup) in place of whatever holds their ports:
#   http://127.0.0.1:8790/ink.html  the app (apps/planet) on its own
#   http://127.0.0.1:8795/          the public home (apps/planet-home), which reaches the app at planet/ through the
#                                   planet -> ../planet symlink beside its pages, as the built site serves it
# The planet's real weeks name the towns their runs started in, so they stay out of git, in var/private/planet: this
# links them into apps/planet (seed-week.js, the default week, and seeds/<week>.js for ?seed=<week>).
# Request logs: var/planet-dev-8790.log and var/planet-home-dev-8795.log.
#   scripts/dev.sh
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -f var/private/planet/seed-week.js ]; then
  echo "dev: var/private/planet/seed-week.js is missing: the real weeks (which name towns) live in var/private/planet" >&2
  exit 1
fi
ln -sfn "$PWD/var/private/planet/seed-week.js" apps/planet/seed-week.js
for f in var/private/planet/seeds/*.js; do ln -sfn "$PWD/$f" "apps/planet/seeds/${f##*/}"; done
for port in 8790 8795; do
  pids=$(lsof -ti "tcp:$port" -sTCP:LISTEN || true)
  if [ -n "$pids" ]; then kill $pids; fi
  while lsof -ti "tcp:$port" -sTCP:LISTEN >/dev/null; do sleep 0.1; done
done
nohup python3 -m http.server 8790 --bind 127.0.0.1 --directory apps/planet >var/planet-dev-8790.log 2>&1 &
nohup python3 -m http.server 8795 --bind 127.0.0.1 --directory apps/planet-home >var/planet-home-dev-8795.log 2>&1 &
echo "app http://127.0.0.1:8790/ink.html · home http://127.0.0.1:8795/"

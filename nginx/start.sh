#!/bin/sh
set -eu
/app/40-campaign-upstreams.sh
# exec below keeps nginx on this shell's pid, so $$ stays valid as the signal target.
# Without this, a dead Node server leaves nginx serving 502 on every SSR route while
# the container still looks healthy to the orchestrator.
main=$$
{
 HOST=127.0.0.1 PORT=4321 node /app/dist/server/entry.mjs || true
 kill -TERM "$main" 2>/dev/null || true
} &
exec nginx -g 'daemon off;'

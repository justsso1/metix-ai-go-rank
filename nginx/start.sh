#!/bin/sh
set -eu
/app/40-campaign-upstreams.sh
HOST=127.0.0.1 PORT=4321 node /app/dist/server/entry.mjs &
exec nginx -g 'daemon off;'

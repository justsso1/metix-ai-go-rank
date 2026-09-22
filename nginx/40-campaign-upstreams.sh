#!/bin/sh
set -eu
output=/etc/nginx/campaign-upstreams.conf
: > "$output"
write_proxy() {
 route="$1"; upstream="$2"; strip="$3"
 if [ -z "$upstream" ]; then
  cat >> "$output" <<EOF
location ^~ $route { default_type application/json; return 503 '{"msg":"Service upstream is not configured"}'; }
EOF
  return
 fi
 if ! printf '%s' "$upstream" | grep -Eq '^https?://[a-zA-Z0-9.-]+(:[0-9]+)?/?$'; then
  echo "Invalid upstream origin for $route" >&2; exit 1
 fi
 upstream="${upstream%/}"
 [ "$strip" = yes ] && upstream="$upstream/"
 cat >> "$output" <<EOF
location ^~ $route {
 proxy_pass $upstream;
 proxy_ssl_server_name on;
 proxy_ssl_verify on;
 proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;
 proxy_set_header Host \$proxy_host;
 proxy_set_header X-Real-IP \$remote_addr;
 proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
 proxy_set_header X-Forwarded-Proto \$scheme;
 proxy_read_timeout 130s;
 proxy_connect_timeout 10s;
 client_max_body_size 128k;
}
EOF
}
write_proxy /atlas/ "${ATLAS_UPSTREAM:-}" yes
write_proxy /api/track/ "${TRACK_UPSTREAM:-}" no

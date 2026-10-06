#!/bin/sh
set -eu
# Upstream blocks are http context and locations are server context, so they go to
# separate files: http.d/*.conf is included by the stock nginx.conf, while the
# locations file is included from inside the server block in default.conf.
upstreams=/etc/nginx/http.d/00-campaign-upstreams.conf
locations=/etc/nginx/campaign-upstreams.conf
: > "$upstreams"
: > "$locations"
write_proxy() {
 route="$1"; origin="$2"; pool="$3"; prefix="$4"
 if [ -z "$origin" ]; then
  cat >> "$locations" <<EOF
location ^~ $route { default_type application/json; return 503 '{"msg":"Service upstream is not configured"}'; }
EOF
  return
 fi
 if ! printf '%s' "$origin" | grep -Eq '^https?://[a-zA-Z0-9.-]+(:[0-9]+)?/?$'; then
  echo "Invalid upstream origin for $route" >&2; exit 1
 fi
 origin="${origin%/}"
 proto="${origin%%://*}"
 authority="${origin#*://}"
 case "$authority" in
  *:*) name="${authority%:*}" ;;
  *) name="$authority"
     if [ "$proto" = https ]; then authority="$authority:443"; else authority="$authority:80"; fi ;;
 esac
 cat >> "$upstreams" <<EOF
upstream $pool {
 server $authority;
 keepalive 32;
}
EOF
 # Host and SNI must name the real origin: \$proxy_host would resolve to the pool
 # name once proxy_pass points at an upstream block, which fails proxy_ssl_verify.
 cat >> "$locations" <<EOF
location ^~ $route {
 proxy_pass $proto://$pool$prefix/;
 proxy_http_version 1.1;
 proxy_set_header Connection "";
 proxy_ssl_server_name on;
 proxy_ssl_name $name;
 proxy_ssl_verify on;
 proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;
 proxy_set_header Host $name;
 proxy_set_header X-Real-IP \$remote_addr;
 proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
 proxy_set_header X-Forwarded-Proto \$scheme;
 proxy_read_timeout 130s;
 proxy_connect_timeout 10s;
 client_max_body_size 128k;
}
EOF
}
write_proxy /bapi/ "${NEXT_PUBLIC_API_BASE:-}" campaign_bapi /hire/bapi
write_proxy /api/track/ "${NEXT_PUBLIC_API_BASE:-}" campaign_track /hire/api/track

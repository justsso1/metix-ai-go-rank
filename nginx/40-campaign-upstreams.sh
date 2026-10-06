#!/bin/sh
set -eu
output=/etc/nginx/campaign-upstreams.conf
: > "$output"
# The API origins are AWS ELB names that rotate their addresses on a 60s TTL, and
# nginx resolves a literal proxy_pass host only once at startup. Routing through a
# runtime resolver is what keeps the proxy following that rotation, and it rules out
# upstream blocks, whose keepalive pools would pin the same stale address.
nameservers=$(awk '$1 == "nameserver" && $2 ~ /^[0-9.]+$/ { print $2 }' /etc/resolv.conf | tr '\n' ' ')
nameservers="${nameservers% }"
[ -n "$nameservers" ] || { echo "No IPv4 nameserver found in /etc/resolv.conf" >&2; exit 1; }
write_proxy() {
 route="$1"; origin="$2"; prefix="$3"
 if [ -z "$origin" ]; then
  cat >> "$output" <<EOF
location ^~ $route { default_type application/json; return 503 '{"msg":"Service upstream is not configured"}'; }
EOF
  return
 fi
 if ! printf '%s' "$origin" | grep -Eq '^https?://[a-zA-Z0-9.-]+(:[0-9]+)?/?$'; then
  echo "Invalid upstream origin for $route" >&2; exit 1
 fi
 origin="${origin%/}"
 authority="${origin#*://}"
 name="${authority%%:*}"
 cat >> "$output" <<EOF
location ^~ $route {
 resolver $nameservers valid=30s ipv6=off;
 resolver_timeout 5s;
 set \$campaign_origin $origin;
 rewrite ^$route(.*)\$ $prefix/\$1 break;
 proxy_pass \$campaign_origin;
 proxy_ssl_server_name on;
 proxy_ssl_name $name;
 proxy_ssl_verify on;
 proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;
 proxy_set_header Host $authority;
 proxy_set_header X-Real-IP \$remote_addr;
 proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
 proxy_set_header X-Forwarded-Proto \$scheme;
 proxy_read_timeout 130s;
 proxy_connect_timeout 10s;
 client_max_body_size 128k;
}
EOF
}
write_proxy /bapi/ "${NEXT_PUBLIC_API_BASE:-}" /hire/bapi
write_proxy /api/track/ "${NEXT_PUBLIC_API_BASE:-}" /hire/api/track

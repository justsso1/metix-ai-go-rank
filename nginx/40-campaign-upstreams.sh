#!/bin/sh
set -eu
output=/etc/nginx/campaign-upstreams.conf
: > "$output"
# Upstream origins are AWS ELBs whose IPs rotate; a literal proxy_pass host is resolved only once at startup.
nameserver=$(awk '/^nameserver/ { print $2; exit }' /etc/resolv.conf)
if [ -z "$nameserver" ]; then
 echo "No nameserver found in /etc/resolv.conf" >&2; exit 1
fi
case "$nameserver" in *:*) nameserver="[$nameserver]" ;; esac
echo "resolver $nameserver valid=30s ipv6=off;" >> "$output"
echo "resolver_timeout 5s;" >> "$output"
write_proxy() {
 route="$1"; upstream="$2"; strip="$3"; prefix="${4:-}"
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
 rewrite_rule=""
 if [ "$strip" = yes ]; then
  rewrite_rule="rewrite ^$route(.*)\$ $prefix/\$1 break;"
 fi
 cat >> "$output" <<EOF
location ^~ $route {
 set \$campaign_upstream $upstream;
 $rewrite_rule
 proxy_pass \$campaign_upstream;
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
write_proxy /bapi/ "${NEXT_PUBLIC_API_BASE:-}" yes /hire/bapi
write_proxy /api/track/ "${NEXT_PUBLIC_API_BASE:-}" yes /hire/api/track

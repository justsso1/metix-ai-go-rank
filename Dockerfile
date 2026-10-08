FROM node:22-alpine AS builder
WORKDIR /app
ENV ASTRO_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build
FROM node:22-alpine
RUN apk add --no-cache nginx ca-certificates
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/dist/server /app/dist/server
COPY --from=builder /app/dist/client /usr/share/nginx/html
COPY nginx/default.conf /etc/nginx/http.d/default.conf
COPY nginx/40-campaign-upstreams.sh /app/40-campaign-upstreams.sh
COPY nginx/start.sh /app/start.sh
RUN chmod +x /app/40-campaign-upstreams.sh /app/start.sh
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1/recruiters-view/ || exit 1
CMD ["/app/start.sh"]

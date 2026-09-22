FROM node:22-alpine AS builder
WORKDIR /app
ENV ASTRO_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG PUBLIC_ATLAS_LIVE=false
ARG PUBLIC_ENABLE_GA=false
ARG PUBLIC_GA_MEASUREMENT_ID=G-ZDSKQ6EDW2
ARG PUBLIC_ENABLE_CLARITY=false
ARG PUBLIC_CLARITY_PROJECT_ID=
RUN PUBLIC_ATLAS_LIVE="$PUBLIC_ATLAS_LIVE" PUBLIC_ENABLE_GA="$PUBLIC_ENABLE_GA" PUBLIC_GA_MEASUREMENT_ID="$PUBLIC_GA_MEASUREMENT_ID" PUBLIC_ENABLE_CLARITY="$PUBLIC_ENABLE_CLARITY" PUBLIC_CLARITY_PROJECT_ID="$PUBLIC_CLARITY_PROJECT_ID" npm run build
FROM nginx:1.27-alpine
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/40-campaign-upstreams.sh /docker-entrypoint.d/40-campaign-upstreams.sh
RUN chmod +x /docker-entrypoint.d/40-campaign-upstreams.sh
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1

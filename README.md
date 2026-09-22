# Metix Go Rank

Independent Recruiter's View campaign for **https://go.metix.ai**, extracted from `metix-homepage-fork` commit `b7b065a`. No website/blog/pricing/product-demo pages are included.

## Run

Node 22.12+ is required.

```sh
npm ci
cp .env.example .env
npm run dev
```

Open http://127.0.0.1:4322/recruiters-view/. Example: http://127.0.0.1:4322/recruiters-view/share/maya-chen-se.

```sh
npm run check        # production build + regression tests
npm run generate:og  # regenerate PNGs/manifest after card/template changes
npm run preview     # preview static build; API proxies require dev server or nginx
```

## Routes

`/recruiters-view/`, `/recruiters-view/result?u=...`, `/recruiters-view/share/{seeded-handle}`, `/recruiters-view/improve?u=...`, `/recruiters-view/opportunities?u=...`. The domain root redirects to `/recruiters-view/`.
`/recruiters-view/motion/` and `/recruiters-view/motion-preview/` are noindex animation development tools with no production tracking. Only six seeded share pages are statically generated. Live/nonseeded results use `/recruiters-view/result?u=...` and the generic OG cover. They are not immutable server snapshots.

## Services and environment

Default mode uses local example data. Set `PUBLIC_ATLAS_LIVE=true` and `ATLAS_UPSTREAM` to the ranking service origin for live lookups. Example handles always remain demo data. `/atlas/peer-rank/rank` and `/atlas/peer-rank/remove-profile` are proxied after stripping `/atlas`. The source repository did not include the deployed upstream address; none is invented here.

Set `TRACK_UPSTREAM` to the existing collector origin. `/api/track/*` is forwarded with its path unchanged. If infrastructure already routes those paths at ingress, configure that equivalent routing there. Static file hosting alone cannot serve these APIs. nginx returns an explicit 503 when an upstream is unconfigured.

Public values are injected **at build time**. Upstream origins are private development/server runtime configuration, never frontend secrets. Only `go.metix.ai` uploads campaign tracking. Local/preview hosts do not upload; automated tests use a local collector. Batch businessId remains `homepage` for compatibility; campaign page IDs/properties separate this site's data. New business IDs require the collector's schema to support them.

GA4 and Clarity are optional, explicitly enabled through `.env.example`. GA defaults to the existing site's public measurement ID when enabled. Confirm the reporting destination before production deployment. No marketing GTM container or paid landing conversion tags are copied.

Attribution cookies use Domain=metix.ai on production. Browser localStorage and sessionStorage are origin-specific; saved campaigns and visitor IDs from the website are not automatically migrated.

## Deployment

```sh
docker build -t metix-go-rank .
docker run --rm -p 8080:80 metix-go-rank
```

For live mode, build with `--build-arg PUBLIC_ATLAS_LIVE=true` and pass `ATLAS_UPSTREAM` and `TRACK_UPSTREAM` via the deployment environment at container startup. Origins must be http(s) origins without credentials/path. TLS/DNS for go.metix.ai are configured at your ingress. `/healthz` reports container health. Long ranking calls have a 130-second proxy timeout; align the external ingress timeout accordingly.

The CSP permits LinkedIn image hosts for card export. For another avatar provider, use an approved image proxy or explicitly add its origin. Browser export needs image-server CORS permission; displaying an avatar alone does not guarantee it can be exported.

Terms and Privacy link to metix.ai. All current pages retain noindex. robots.txt allows fetching so social crawlers can read OG images. The empty sitemap intentionally does not advertise personal result pages.

## Existing service boundaries

Ranking results/advice/jobs can come from Atlas. Index-notification, ranking-update and job-shortlist email forms still save requests locally: **they do not send emails**. The current success copy is preserved from the source; connect real request endpoints before enabling these promises in a public campaign. Server scheduling and dynamic personalized share previews are separate backend work.

Original website redirects to go.metix.ai are not changed by this extraction. Production upstream connectivity, analytics ingestion, DNS and TLS require deployment verification with the real services.

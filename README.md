# Metix Go Rank

Independent Recruiter's View campaign for **https://go.metix.ai**, extracted from `metix-homepage-fork` commit `b7b065a`. No website/blog/pricing/product-demo pages are included.

## Run

Node 22.19+ is required.

```sh
npm ci
cp .env.example .env
npm run dev
```

Open http://127.0.0.1:4322/recruiters-view/. Completed rankings use `/show/{taskId}` for the result page, while share buttons produce `/share/{taskId}` on the current origin. A development or preview host stays on that host; production links use `go.metix.ai`.

```sh
npm run check        # production build + TypeScript check
npm run preview      # preview the built Astro server
```

## Routes

`/recruiters-view/`, `/recruiters-view/?linkedin_url=...&task_id=...`, `/show/{taskId}`, `/share/{taskId}`, `/recruiters-view/result?u=...`, `/recruiters-view/improve?taskId=...`, `/recruiters-view/opportunities?taskId=...`, and `/unsubscribe?token=...`. The deployed Nginx redirects the legacy misspelled `/unsubcribe?token=...` path to `/unsubscribe?token=...`, preserving the token in existing email links. New email links should use `/unsubscribe`. Email links with `task_id` immediately show the loading state. `linkedin_url` may remain in the URL but is not used for the task lookup. After a successful lookup, browser navigation changes the result URL to `/show/{taskId}` without reloading; copying a link or using the share buttons produces `/share/{taskId}`. Ordinary visitors opening a share link are redirected to `/recruiters-view/`. Legacy `/recruiters-view/share?taskId=...` and `/recruiters-view/?taskId=...` links redirect to the result route. Example results without a backend task ID still share their `/recruiters-view/?u=...` URL.

## Services and environment

Configure `NEXT_PUBLIC_API_BASE` to the same origin used by `openjobs-recruiter-ui`: `https://www-dev.metix.ai` for dev, `https://www-test.metix.ai` for test, or `https://www.metix.ai` for prod. Browser requests to `go-dev.metix.ai/bapi/peer-rank/...` are forwarded to `https://www-dev.metix.ai/hire/bapi/peer-rank/...` in dev. The Vite development proxy and Nginx runtime proxy both read this variable and apply the same `/bapi/` → `/hire/bapi/` path mapping for the configured environment.

For an email link, the browser first posts `{ "task_id": "..." }` to `/bapi/peer-rank/email/result-token`, then polls `/bapi/peer-rank/rank/{taskId}` with the returned `queryToken` in `X-Peer-Rank-Token`. Token issuance failure stops the ranking request and displays the API `msg` below the input. Task IDs must be nonempty and at most 64 characters. Manual searches keep using the token returned by ranking submission.

The unsubscribe page makes no validation request when opened. Cancel returns to `/recruiters-view/`; Confirm posts `{ "token": "..." }` to `/bapi/peer-rank/unsubscribe` and displays the returned error message or a success state.

The `/show/{taskId}` result route reads the ranking on the server and writes its returned `og_image_url`, dimensions, title, and description into the initial HTML head. The result page still loads its ranking in the browser. On `/share/{taskId}`, social crawler User-Agents receive OG metadata from the same ranking result; human visitors receive a 302 redirect to `/recruiters-view/`. Metadata uses the current public host. Responses use `Cache-Control: private, no-store`; the share route also uses `Vary: User-Agent`. A pending task, unavailable result, or missing image uses the general OG image. The returned OG image URL must be public to social crawlers.

Tracking uses the same `NEXT_PUBLIC_API_BASE` origin as ranking requests. Both proxies map `/api/track/*` to `/hire/api/track/*` on that origin, matching the `openjobs-recruiter-ui` collector path. Anonymous visitors use `/api/track/anonymous/collect`; visitors with an access token use `/api/track/collect/batch`. A rejected access token falls back to anonymous collection.

Public values are injected **at build time**. The API origin is server runtime configuration. Both `go.metix.ai` and `go-dev.metix.ai` send campaign tracking to the API origin configured for their environment. Local and other preview hosts do not upload. Tracking uses `businessId=go-rank` and `properties.event_name=go-rank.<page>.<event>`; the collector must accept the `go-rank` business ID.

Attribution cookies use Domain=metix.ai on production. Browser localStorage and sessionStorage are origin-specific; saved campaigns and visitor IDs from the website are not automatically migrated.

## Deployment

```sh
docker build -t metix-go-rank .
docker run --rm -p 8080:80 -e NEXT_PUBLIC_API_BASE=https://www-dev.metix.ai metix-go-rank
```

Pass `NEXT_PUBLIC_API_BASE` to the container at startup, using the matching API origin for each environment. Nginx proxies `/recruiters-view/`, `/recruiters-view/share`, `/share/`, and `/show/` to the Astro server. Public `/bapi/peer-rank/...` requests reach `/hire/bapi/peer-rank/...`, and `/api/track/...` reaches `/hire/api/track/...` on the same API origin. Origins must be http(s) origins without credentials/path. The ingress must forward the public `Host`. Server-rendered share and show URLs use that host when it is a `metix.ai` subdomain, `localhost`, or `127.0.0.1`; public Metix hosts use HTTPS. `/healthz` reports container health. Long ranking calls have a 130-second proxy timeout; align the external ingress timeout accordingly.

The CSP permits LinkedIn image hosts for card export. For another avatar provider, use an approved image proxy or explicitly add its origin. Browser export needs image-server CORS permission; displaying an avatar alone does not guarantee it can be exported.

Terms and Privacy link to metix.ai. All current pages retain noindex. robots.txt allows fetching so social crawlers can read OG images. The empty sitemap intentionally does not advertise personal result pages.

## Existing service boundaries

Ranking results/advice/jobs can come from the Peer Rank API. Social crawlers visiting `/share/{taskId}` read the same result and OG image metadata as `/show/{taskId}` from `/hire/bapi/peer-rank/rank/{taskId}` on the configured API origin. Ranking-update and job-shortlist email forms still save requests locally: **they do not send emails**. The current success copy is preserved from the source; connect real request endpoints before enabling these promises in a public campaign.

Original website redirects to go.metix.ai are not changed by this extraction. Production upstream connectivity, analytics ingestion, DNS and TLS require deployment verification with the real services.

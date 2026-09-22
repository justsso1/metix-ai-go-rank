# Go Rank migration

Approved destination: /Users/jishuya/Demo/metix-ai-go-rank. Production origin: https://go.metix.ai. Baseline: b7b065a.

1. Extract campaign components, styles, assets and regression tests into an independent Astro/React project.
2. Replace website layout with minimal campaign layout and extracted base styles. Use /recruiters-view/ as the entry and namespace all activity pages under /recruiters-view (updated by user request). Keep assets under /recruiters-view to avoid unnecessary material changes.
3. Centralize public origin and route paths. Preserve Peer Rank API adapter and example fixtures; explicitly configure live mode. Regenerate OG images and manifest.
4. Reuse attribution and batch tracking protocol on go.metix.ai and go-dev.metix.ai; add campaign page and action events without personal identifiers. Use businessId go-rank and event_name go-rank.<page>.<event>.
5. Add same-origin proxy templates for /bapi and /api/track, Docker, health check, CI, environment example and deployment documentation. No upstream addresses guessed.
6. Build, execute relevant regression tests, check production HTML/assets and browser workflows including responsive card export. Verify telemetry against a local collection server; real production service checks need supplied upstream addresses.

Scope: existing design and functionality; email forms remain local preview adapters. No publishing, real email backend or dynamic share-snapshot service in this migration. Original repository remains unchanged.

# Migration validation — 2026-09-22

This is a historical migration record. Current task-backed share actions use `/share/{taskId}?from=share`. Social crawlers receive backend OG metadata there; ordinary visitors are redirected to `/recruiters-view/`. The old snapshot API, local personal OG renderer, test source, and mock-personal OG assets were removed at the user's request. The validation results below describe the earlier migration, not the current deployment.

Source: metix-homepage-fork, commit b7b065a. Destination: metix-ai-go-rank.

- Independent production build: passed; 14 HTML pages including entry, result, tasks, six seeded shares, two animation tools, a root redirect and 404.
- TypeScript: passed.
- Automated regression suite: 147 tests passed. Covers business rules, Peer Rank API data mapping, card geometry, motion, share URLs/metadata/PNG integrity, local email intent, campaign analytics and nginx configuration generation.
- HTTP integration: local ranking request reached /peer-rank/rank after proxy prefix removal. Tracker's actual batch request reached /api/track/collect/batch through proxy; payload had no personal handle/title.
- Browser: Maya share card rendered, PNG download became available, Improve navigation and deep-link refresh worked, 390px layout had no horizontal overflow. Priya example completed lookup/reveal and opened the Top 1% opportunities page.
- Sharing points to https://go.metix.ai/recruiters-view/. Updated card/OG images regenerated from shared template and fonts.
- Review fixes: result exposure follows page-view identity update; collection uses no-referrer; debug preview canonical uses the campaign prefix.
- Original website working tree remains unchanged.

## Campaign URL update — 2026-09-22

- Entry and all campaign pages now live under `/recruiters-view/`; the domain root redirects to the entry.
- Production build, TypeScript and all 147 tests passed after the path change.
- Browser verified root redirect, Priya share page, prefixed social links and navigation to Improve.
- Card/OG artwork and analytics paths use the same prefix.

## Deployment checks still required

- Supply Peer Rank API and collector upstream origins; verify real ranking responses and analytics ingestion in the intended production services.
- Docker engine was not running during migration, so container build/runtime was not executed. nginx generation behavior is covered by tests.
- Configure go.metix.ai DNS/TLS/ingress and long-request timeout.
- Email forms remain local preview adapters. No email delivery, scheduling service or dynamic immutable share snapshot service was added.

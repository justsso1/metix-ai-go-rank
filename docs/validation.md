# Migration validation — 2026-09-22

Source: metix-homepage-fork, commit b7b065a. Destination: metix-ai-go-rank.

- Independent production build: passed; 14 HTML pages including entry, result, tasks, six seeded shares, two animation tools, a root redirect and 404.
- TypeScript: passed.
- Automated regression suite: 147 tests passed. Covers business rules, Atlas data mapping, card geometry, motion, share URLs/metadata/PNG integrity, local email intent, campaign analytics and nginx configuration generation.
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

- Supply Atlas and collector upstream origins; verify real ranking responses and analytics ingestion in the intended production services.
- Enable desired GA4/Clarity properties with public build settings.
- Docker engine was not running during migration, so container build/runtime was not executed. nginx generation behavior is covered by tests.
- Configure go.metix.ai DNS/TLS/ingress and long-request timeout.
- Email forms remain local preview adapters. No email delivery, scheduling service or dynamic immutable share snapshot service was added.

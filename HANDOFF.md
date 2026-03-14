# Agent Handoff — fedpurchase (GovPurchase Intel)

**Branch:** `claude/deploy-wrangler-dGAGe`
**Date:** 2026-03-14
**Status:** Worker deployed, D1 seeded, site serving live traffic

---

## What Was Accomplished This Session

### 1. Cloudflare Wrangler Deployment
- Created real Cloudflare resources (D1, KV, R2) and wired their IDs into `wrangler.toml`
- Fixed a Hono regex route pattern (`/sitemap/:segment{[a-z]+}.xml`) that was crashing all requests with a 1101 error — changed to `/sitemap/:segment.xml`
- Added `preview_bucket_name` to R2 config for `wrangler dev --remote` compatibility

### 2. Bootstrap Admin Endpoints (added to `src/index.ts`)
These endpoints were used to seed data and can remain for future re-seeding, but should always be guarded by `ADMIN_SECRET`:
- `POST /admin/migrate` — creates DB tables via the D1 binding
- `POST /admin/load-data` — accepts pre-fetched reference data (agencies, PSC, NAICS)
- `POST /admin/load-transactions` — accepts pre-fetched transaction rows
- `POST /admin/seed-references` — triggers the cron-based reference seeding

### 3. D1 Database Seeded
Successfully loaded into the remote D1 (`fedpurchase`, `519bde12-e5b6-4df6-b46d-9915abc8efc3`):
- **111 agencies** (from USASpending.gov API)
- **1,001 PSC codes** (via batched uploads of 80 records — D1 has a per-invocation API call limit)
- **24 NAICS codes**
- **1,500 micro-purchase transactions**

Note: PSC seeding required batching due to Cloudflare's "Too many API requests by single Worker invocation" limit. The batch size of 80 is safe; do not increase it.

---

## Infrastructure IDs (committed to `wrangler.toml` — see note below)

| Resource | Binding | ID |
|----------|---------|-----|
| D1 Database | `DB` | `519bde12-e5b6-4df6-b46d-9915abc8efc3` |
| KV Namespace | `KV` | `9134b92ad1c648bf9975d4db48e3544c` |
| R2 Bucket | `R2` | `fedpurchase-csv` |

### Are These Secrets?

**These IDs are not API keys or credentials** — they are Cloudflare resource identifiers analogous to a database name. They only work within the `michaelcolenso` Cloudflare account and cannot be used without valid Cloudflare authentication. Committing them is consistent with standard Wrangler practice (the Cloudflare docs and their own examples do this).

**What IS a secret and must NOT be committed:**
- `ADMIN_SECRET` — the bearer token protecting admin endpoints. This lives in `.dev.vars` (gitignored) for local dev and must be set via `wrangler secret put ADMIN_SECRET` for production.
- `.dev.vars` is already in `.gitignore` — confirmed not tracked.

---

## Remaining Work / Next Steps

### High Priority
1. **Set ADMIN_SECRET in production** (if not already done):
   ```
   wrangler secret put ADMIN_SECRET
   ```
2. **Load more transaction data** — only 1,500 rows are loaded. The site will have thin content until more rows are ingested. The cron jobs run weekly (Mondays 3am UTC) and monthly (1st 4am UTC) to pull fresh data from USASpending.gov.

3. **Verify routes return real data** — spot-check a few pages:
   - `https://fedpurchase.io/` — homepage
   - `https://fedpurchase.io/agency/department-of-defense` — agency page
   - `https://fedpurchase.io/industry/334111/department-of-defense` — industry page

### Medium Priority
4. **Remove or lock down bootstrap admin endpoints** — `POST /admin/migrate`, `POST /admin/load-data`, `POST /admin/load-transactions` were used for initial seeding. They are guarded by `ADMIN_SECRET` but consider removing them once data pipeline is stable.
5. **Sitemap generation** — verify `/sitemap.xml` and segment sitemaps render correctly once more data is loaded.
6. **Increase transaction volume** — the USASpending.gov micro-purchase dataset is large. Consider loading data year by year (FY2022, FY2023, FY2024) using the `/admin/load-transactions` endpoint.

### Low Priority
7. **Insights pages** (`/insights/:year/:topicSlug`) — route exists but content generation logic may be skeletal.
8. **Vendor pages** — loaded vendor slugs from transaction data; verify `/vendor/:vendorSlug` pages render correctly.

---

## Key Files

| File | Purpose |
|------|---------|
| `wrangler.toml` | Cloudflare Worker config — resource IDs, cron triggers |
| `src/index.ts` | Main Hono router — all routes + admin endpoints |
| `src/schema.ts` | Drizzle ORM schema (D1 tables) |
| `src/cron.ts` | Scheduled handler — weekly/monthly data refresh |
| `src/pipeline/ingest.ts` | USASpending.gov API ingestion logic |
| `src/pipeline/references.ts` | Reference data seeding (agencies, PSC, NAICS) |
| `src/routes/` | Route handlers per page type |
| `src/templates/` | HTML templates (server-rendered) |
| `migrations/0001_initial.sql` | DB schema migration |
| `.dev.vars` | Local secrets — **gitignored, never commit** |

---

## Cron Schedule

```toml
[triggers]
crons = ["0 3 * * 1", "0 4 1 * *"]
```
- `0 3 * * 1` — Every Monday at 3am UTC (weekly transaction refresh)
- `0 4 1 * *` — 1st of every month at 4am UTC (monthly rollup)

---

## D1 API Call Limit Note

Cloudflare Workers enforce a limit on D1 API calls per Worker invocation. When bulk-inserting records, batch to **≤80 rows per request**. Exceeding this causes:
```
Error: Too many API requests by single Worker invocation
```
The `/admin/load-data` and `/admin/load-transactions` endpoints respect this limit as long as callers send ≤80 rows per POST.

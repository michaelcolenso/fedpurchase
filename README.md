# fedpurchase
# GovPurchase Intel — Product & Architecture Spec

## One-Liner

Programmatic SEO site turning USASpending.gov micro-purchase data into actionable sales intelligence pages for government contractors.

-----

## The Thesis

Every year, federal agencies make millions of purchase card transactions under the $10K micro-purchase threshold. These transactions are individually reported to USASpending.gov with NAICS codes, PSC (Product & Service Codes), awarding agency, recipient name, and dollar amounts — but nobody aggregates them at the product/agency/vendor intersection level.

The micro-purchase layer is the federal government’s “impulse buy” signal. It reveals what agencies need urgently, what they’re buying repeatedly, and which vendors have incumbent relationships — all without the 6-18 month procurement cycle overhead of formal contracting.

**The gap:** Small and mid-size government contractors have no tooling to monitor micro-purchase trends by product category + agency. They’re flying blind on the $50B+ annual micro-purchase market.

**The product:** Programmatic pages that answer the query pattern: *”[Agency] [Product Category] contracts”* — e.g., “Department of Defense IT cable purchases,” “VA medical supply vendors,” “DOE lab equipment spending.”

-----

## Target User

**Primary:** Small business government contractors doing <$5M/year in federal sales. Typically 5-50 employees. Searching Google for phrases like “how to sell to the VA” or “DOD purchase card vendors” or “GSA Schedule IT equipment.”

**Secondary:** Business development reps at mid-market GovCon firms ($5M-$50M) tracking agency buying patterns for capture planning.

**Tertiary:** GovCon consultants and GSA Schedule advisors who need data to justify their fees.

-----

## SEO Keyword Architecture

### Page Type 1: Agency + Product Category Pages (highest volume)

```
/agency/{agency-slug}/{psc-category-slug}
```

Examples:

- `/agency/department-of-defense/it-equipment`
- `/agency/veterans-affairs/medical-supplies`
- `/agency/department-of-energy/laboratory-equipment`

Target queries: “VA medical supply contracts,” “DOD IT equipment spending,” “DOE lab equipment purchases”

Estimated addressable pages: ~1,200 (24 major agencies × 50 meaningful PSC categories)

### Page Type 2: Vendor Profile Pages

```
/vendor/{vendor-slug}
```

Examples:

- `/vendor/grainger-inc`
- `/vendor/amazon-business`
- `/vendor/mcmaster-carr`

Target queries: “Grainger government contracts,” “Amazon Business federal sales”

Estimated addressable pages: ~5,000 (top vendors by micro-purchase volume)

### Page Type 3: NAICS Industry + Agency Pages

```
/industry/{naics-code}/{agency-slug}
```

Examples:

- `/industry/334111/department-of-defense` (Electronic Computer Manufacturing → DOD)
- `/industry/339112/veterans-affairs` (Surgical and Medical Instrument Manufacturing → VA)

Target queries: “NAICS 334111 government contracts,” “medical device manufacturers selling to VA”

Estimated addressable pages: ~2,400 (120 relevant NAICS × 20 agencies)

### Page Type 4: Trend/Insight Hub Pages (link magnets)

```
/insights/{year}/{topic-slug}
```

Examples:

- `/insights/2025/fastest-growing-micro-purchase-categories`
- `/insights/2025/top-100-micro-purchase-vendors`
- `/insights/2025/agency-spending-shifts`

Estimated pages: 20-30 evergreen + annual refresh

### Total Addressable Page Count: ~8,600+

-----

## Data Pipeline

### Source API

**Base URL:** `https://api.usaspending.gov`

**No authentication required.** No rate limit published, but practical limit is ~100 requests/minute based on community reports.

### Key Endpoints

|Endpoint                                   |Purpose                                                        |
|-------------------------------------------|---------------------------------------------------------------|
|`POST /api/v2/search/spending_by_award/`   |Award-level search with filtering by amount, agency, NAICS, PSC|
|`POST /api/v2/search/spending_by_category/`|Aggregated spending by NAICS, PSC, recipient, agency           |
|`POST /api/v2/bulk_download/awards/`       |Async bulk CSV download for initial data load                  |
|`GET /api/v2/references/naics/`            |NAICS code reference data                                      |
|`GET /api/v2/references/filter_tree/psc/`  |PSC code tree reference data                                   |
|`GET /api/v2/agency/{toptier_code}/`       |Agency metadata                                                |
|`POST /api/v2/recipient/`                  |Recipient (vendor) profile data                                |

### Micro-Purchase Filter

The critical filter for our niche: contract awards ≤ $10,000. Applied via `award_amounts`:

```json
{
  "filters": {
    "award_type_codes": ["A", "B", "C", "D"],
    "award_amounts": [
      { "lower_bound": 0, "upper_bound": 10000 }
    ],
    "time_period": [
      { "start_date": "2024-10-01", "end_date": "2025-09-30" }
    ]
  }
}
```

Award type codes A-D = procurement contracts (excludes grants, loans, financial assistance).

### Data Refresh Cadence

USASpending updates contract transaction data **daily** (File D1 from FPDS). Practical refresh cadence for this product:

- **Aggregate tables (agency/PSC/NAICS rollups):** Weekly via Cron Trigger
- **Vendor profiles:** Weekly
- **Trend/insight pages:** Monthly
- **Full historical backfill:** Quarterly (bulk download endpoint)

-----

## Cloudflare Stack Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Cloudflare Edge                     │
│                                                       │
│  ┌──────────┐   ┌──────────────┐   ┌──────────────┐ │
│  │  Worker   │   │  Worker      │   │  Worker      │ │
│  │  (Hono)   │   │  (Cron)      │   │  (Sitemap)   │ │
│  │  Web App  │   │  Data Ingest │   │  Generator   │ │
│  └────┬──┬──┘   └──────┬───────┘   └──────────────┘ │
│       │  │              │                             │
│  ┌────┴──┴──────────────┴────────────────────┐       │
│  │              D1 Database                   │       │
│  │  (Drizzle ORM)                             │       │
│  │                                            │       │
│  │  Tables:                                   │       │
│  │  - agencies                                │       │
│  │  - psc_codes                               │       │
│  │  - naics_codes                             │       │
│  │  - micro_purchases (partitioned by FY)     │       │
│  │  - agency_psc_rollups                      │       │
│  │  - agency_naics_rollups                    │       │
│  │  - vendor_profiles                         │       │
│  │  - vendor_agency_rollups                   │       │
│  │  - page_metadata (SEO titles/descriptions) │       │
│  └───────────────────────────────────────────┘       │
│                                                       │
│  ┌───────────────┐   ┌────────────────────┐          │
│  │  Workers AI   │   │  KV Namespace      │          │
│  │  (Page copy   │   │  (HTML cache,      │          │
│  │   generation) │   │   sitemap cache)   │          │
│  └───────────────┘   └────────────────────┘          │
│                                                       │
│  ┌───────────────┐                                   │
│  │  R2 Bucket    │                                   │
│  │  (Bulk CSV    │                                   │
│  │   archives)   │                                   │
│  └───────────────┘                                   │
└─────────────────────────────────────────────────────┘
```

### D1 Schema (Drizzle)

```typescript
// schema.ts

import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

export const agencies = sqliteTable('agencies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  toptierId: integer('toptier_id'),          // USASpending toptier agency ID
  toptierCode: text('toptier_code'),         // e.g., "097"
  name: text('name').notNull(),              // e.g., "Department of Defense"
  abbreviation: text('abbreviation'),        // e.g., "DOD"
  slug: text('slug').notNull().unique(),     // e.g., "department-of-defense"
});

export const pscCodes = sqliteTable('psc_codes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(),      // e.g., "7035"
  description: text('description').notNull(), // e.g., "ADP Input/Output Equipment"
  categorySlug: text('category_slug'),        // e.g., "it-equipment"
  categoryName: text('category_name'),        // e.g., "IT Equipment"
  parentCode: text('parent_code'),            // PSC hierarchy
});

export const naicsCodes = sqliteTable('naics_codes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(),
  description: text('description').notNull(),
  slug: text('slug').notNull(),
  sectorCode: text('sector_code'),            // 2-digit sector
  sectorName: text('sector_name'),
});

export const microPurchases = sqliteTable('micro_purchases', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  awardId: text('award_id').notNull(),
  agencyId: integer('agency_id').references(() => agencies.id),
  pscCode: text('psc_code'),
  naicsCode: text('naics_code'),
  recipientName: text('recipient_name'),
  recipientUei: text('recipient_uei'),        // Unique Entity ID (replaced DUNS)
  amount: real('amount').notNull(),
  actionDate: text('action_date'),            // YYYY-MM-DD
  fiscalYear: integer('fiscal_year'),
  description: text('description'),
  placeState: text('place_state'),            // Place of performance
  placeCity: text('place_city'),
}, (table) => ({
  agencyPscIdx: index('idx_agency_psc').on(table.agencyId, table.pscCode),
  agencyNaicsIdx: index('idx_agency_naics').on(table.agencyId, table.naicsCode),
  recipientIdx: index('idx_recipient').on(table.recipientUei),
  fyIdx: index('idx_fy').on(table.fiscalYear),
}));

// Pre-computed rollup tables (materialized by cron worker)
export const agencyPscRollups = sqliteTable('agency_psc_rollups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agencyId: integer('agency_id').references(() => agencies.id),
  pscCode: text('psc_code'),
  categorySlug: text('category_slug'),
  fiscalYear: integer('fiscal_year'),
  totalAmount: real('total_amount'),
  transactionCount: integer('transaction_count'),
  uniqueVendors: integer('unique_vendors'),
  topVendorName: text('top_vendor_name'),
  topVendorAmount: real('top_vendor_amount'),
  avgTransactionSize: real('avg_transaction_size'),
  yoyGrowthPct: real('yoy_growth_pct'),       // Year-over-year change
  updatedAt: text('updated_at'),
}, (table) => ({
  slugIdx: index('idx_rollup_slug').on(table.agencyId, table.categorySlug, table.fiscalYear),
}));

export const vendorProfiles = sqliteTable('vendor_profiles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  uei: text('uei').notNull().unique(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  totalMicroPurchaseAmount: real('total_micro_purchase_amount'),
  totalTransactions: integer('total_transactions'),
  agencyCount: integer('agency_count'),       // How many agencies buy from them
  topAgencyName: text('top_agency_name'),
  topPscCategory: text('top_psc_category'),
  firstSeen: text('first_seen'),              // Earliest transaction date
  lastSeen: text('last_seen'),                // Most recent transaction
  updatedAt: text('updated_at'),
});
```

### Hono Web App Routes

```typescript
// src/index.ts

import { Hono } from 'hono';

const app = new Hono();

// Homepage
app.get('/', (c) => { /* Landing page with search + top agencies */ });

// Agency + PSC Category pages (primary SEO target)
app.get('/agency/:agencySlug/:pscSlug', async (c) => {
  const { agencySlug, pscSlug } = c.req.param();
  // Query agency_psc_rollups + top vendors for this combo
  // Render programmatic page with:
  //   - Total spend, transaction count, vendor count
  //   - YoY trend (table or simple bar)
  //   - Top 10 vendors by amount
  //   - Recent transactions sample
  //   - "How to sell [category] to [agency]" generated copy
});

// Agency overview
app.get('/agency/:agencySlug', async (c) => {
  // Top PSC categories for this agency
  // Total micro-purchase volume + trends
  // Top vendors
});

// Vendor profile pages
app.get('/vendor/:vendorSlug', async (c) => {
  // Which agencies buy from this vendor
  // What PSC categories
  // Transaction history
  // Competing vendors in same categories
});

// NAICS industry pages
app.get('/industry/:naicsCode/:agencySlug?', async (c) => {
  // Industry spending by agency
  // Related PSC categories
});

// Insight/trend pages
app.get('/insights/:year/:topicSlug', async (c) => {
  // Pre-computed trend analysis
});

// Sitemap
app.get('/sitemap.xml', async (c) => { /* Dynamic sitemap from KV cache */ });
app.get('/sitemap/:segment.xml', async (c) => { /* Segmented sitemaps */ });

export default app;
```

### Cron Worker (Data Pipeline)

```typescript
// src/cron.ts — runs weekly

export default {
  async scheduled(event: ScheduledEvent, env: Env) {
    switch (event.cron) {
      case '0 3 * * 1': // Monday 3am UTC
        await ingestRecentTransactions(env);
        await recomputeRollups(env);
        await invalidatePageCache(env);
        break;
      case '0 4 1 * *': // 1st of month
        await generateTrendInsights(env);
        await regenerateSitemaps(env);
        break;
    }
  }
};

async function ingestRecentTransactions(env: Env) {
  // 1. Query USASpending /api/v2/search/spending_by_award/
  //    Filter: award_amounts ≤ $10K, last 7 days
  //    Paginate through all results (limit: 100 per page)
  // 2. Upsert into micro_purchases table
  // 3. Log transaction count for monitoring
}

async function recomputeRollups(env: Env) {
  // SQL aggregation queries against micro_purchases
  // INSERT OR REPLACE into agency_psc_rollups
  // INSERT OR REPLACE into vendor_profiles
  // Compute YoY growth percentages
}
```

-----

## Page Content Strategy

Each programmatic page needs enough unique, useful content to rank. Here’s the template for the primary page type (Agency + PSC):

### Agency + PSC Page Template

```
<h1>{Agency Name} {PSC Category} Spending — Micro-Purchase Intelligence</h1>

<p class="lead">
  In FY{year}, {agency} made {count} micro-purchase transactions
  totaling ${amount} in {category}. Here's what they're buying,
  from whom, and what it means for vendors.
</p>

[Summary Stats Bar]
  Total Spend | Transaction Count | Avg Order Size | Active Vendors | YoY Change

<h2>Top Vendors</h2>
[Table: Vendor Name | Total Amount | # Transactions | Avg Order | % of Category]

<h2>Spending Trend</h2>
[Simple HTML bar chart: quarterly spend for last 3 fiscal years]

<h2>Recent Transactions</h2>
[Table: Date | Amount | Vendor | Description (from award description field)]

<h2>How to Sell {Category} to {Agency}</h2>
[Workers AI generated paragraph — practical guidance on:]
  - Relevant GSA Schedule categories
  - Purchase card ordering procedures for this agency
  - SAM.gov registration requirements
  - Set-aside eligibility (SDVOSB, 8(a), HUBZone)

<h2>Related Categories</h2>
[Internal links to adjacent PSC categories for this agency]

<h2>About This Data</h2>
[Boilerplate: Source attribution, update cadence, methodology note]
```

### Workers AI Usage

Use `@cf/meta/llama-3.1-8b-instruct` for generating the “How to Sell” section per page. Template prompt:

```
You are a government contracting advisor. Write 150 words of practical
guidance for a small business that wants to sell {psc_category_name}
to {agency_name}. Include: relevant GSA Schedule numbers, the agency's
typical purchasing process for items under $10,000, and any relevant
set-aside programs. Be specific and actionable. Do not use marketing language.
```

Cache the output in KV with a 30-day TTL. Regenerate monthly.

-----

## Revenue Model

### Phase 1: Programmatic SEO Traffic (Month 0-6)

- **Goal:** 8,000+ indexed pages, 5K-15K monthly organic visits
- **Revenue:** $0 (traffic accumulation)

### Phase 2: Lead Magnets + Email (Month 3-6)

- **Product:** “Agency Buyer Profile” PDF downloads (gated)
- **Content:** Expanded version of page data + procurement calendar + buyer contact info guidance
- **Revenue:** Email list building for Phase 3

### Phase 3: Paid Data Feeds (Month 6+)

- **Tier 1 — Free:** Basic page views (drives SEO)
- **Tier 2 — Pro ($49/mo):** CSV exports, email alerts when new transactions match saved filters, 12-month historical data
- **Tier 3 — Agency ($199/mo):** Full API access, custom agency watch lists, vendor competitive alerts, bulk data exports

### Phase 4: B2B Intelligence (Month 12+)

- **Product:** “GovPurchase Intel for Capture Teams” — white-label reports for BD teams
- **Revenue:** $2K-5K/month per enterprise account
- **Channel:** Direct sales to GovCon BD consultants (referral fees)

### Revenue Target

- Month 6: $500/mo (early Pro subscribers)
- Month 12: $3K-5K/mo (Pro + Agency mix)
- Month 24: $10K-20K/mo (enterprise accounts + self-serve)

-----

## Build Sequence

### Sprint 1 (Week 1-2): Data Foundation

- [ ] Set up Cloudflare Worker project (Hono + Drizzle + D1)
- [ ] Create D1 schema, run migrations
- [ ] Build reference data loaders (agencies, PSC codes, NAICS codes from USASpending API)
- [ ] Build initial bulk download pipeline (FY2023 + FY2024 micro-purchases)
- [ ] Store bulk CSVs in R2, parse and load into D1

### Sprint 2 (Week 3-4): Core Pages

- [ ] Build Hono routes for agency + PSC pages
- [ ] Build rollup computation queries
- [ ] HTML templates (server-rendered, minimal CSS — TailwindCSS via CDN)
- [ ] Agency overview pages
- [ ] Vendor profile pages
- [ ] Basic internal linking structure

### Sprint 3 (Week 5-6): SEO Infrastructure

- [ ] Dynamic sitemap generation (segmented by page type)
- [ ] Meta tags, canonical URLs, Open Graph
- [ ] robots.txt, structured data (Dataset schema.org markup)
- [ ] Workers AI “How to Sell” copy generation for top 200 pages
- [ ] Submit sitemaps to Google Search Console

### Sprint 4 (Week 7-8): Automation + Polish

- [ ] Cron worker for weekly data ingest
- [ ] KV caching layer for rendered pages
- [ ] Error monitoring, data freshness checks
- [ ] Landing page with search functionality
- [ ] GA4 or Plausible analytics integration

### Sprint 5 (Week 9-10): Monetization Scaffold

- [ ] Email capture (ConvertKit or Buttondown)
- [ ] “Agency Buyer Profile” PDF generation (first 5 agencies)
- [ ] Stripe checkout for Pro tier
- [ ] Basic alert system (weekly email digest of new transactions matching filters)

-----

## Risk Assessment

|Risk                                                    |Severity|Mitigation                                                                                                           |
|--------------------------------------------------------|--------|---------------------------------------------------------------------------------------------------------------------|
|USASpending API goes down or changes                    |Medium  |Bulk download backups in R2; API wrapper with fallback                                                               |
|D1 row limits hit (5M rows)                             |Medium  |Partition by fiscal year; archive older data to R2                                                                   |
|Google doesn’t index programmatic pages                 |High    |Ensure unique content per page (Workers AI copy); strong internal linking; manual indexing requests for top 200 pages|
|Micro-purchase data isn’t granular enough (no MCC codes)|Low     |PSC codes are actually more useful than MCC for B2G context — this is a feature                                      |
|Competitor enters market                                |Low     |First-mover + domain authority advantage; nobody is doing this specific aggregation today                            |
|DOGE/budget cuts reduce federal purchasing              |Medium  |Historically resilient — agencies still need supplies; cuts hit big contracts first, not purchase cards              |

-----

## Competitive Landscape

|Competitor            |What They Do                                |Gap We Fill                                       |
|----------------------|--------------------------------------------|--------------------------------------------------|
|GovWin (Deltek)       |Enterprise GovCon intelligence ($10K+/yr)   |No micro-purchase focus; priced out of SMB        |
|Bloomberg Government  |Policy + procurement intelligence           |Zero product-level purchase data                  |
|USASpending.gov itself|Raw data portal                             |No aggregation, no SEO pages, no alerts           |
|SAM.gov               |Contract opportunities + entity registration|Forward-looking only (no historical pattern data) |
|GovTribe              |Opportunity tracking + market intel         |Focused on formal procurements, not purchase cards|

**Our wedge:** Nobody is doing programmatic aggregation of the micro-purchase layer. The incumbents are all focused on contracts >$250K. We own the bottom of the market.

-----

## Key Metric: Time to First Indexed Page

Based on RecallRadar experience, the critical milestone is getting 100+ pages indexed within 60 days of launch. Tactics:

1. Submit sitemap to GSC on day 1
1. Manually request indexing for top 50 pages
1. Internal linking density: every page links to 5+ related pages
1. Schema.org Dataset markup on every page
1. One genuine link-magnet insight page (e.g., “Top 100 Federal Micro-Purchase Vendors 2025”) promoted on LinkedIn/Reddit/Twitter

-----

## Domain Candidates

Suggested: **govpurchase.intel** or **micropurchase.report** or **fedbuys.io**

Worth checking availability. The name should signal “government purchasing data” to both users and Google.

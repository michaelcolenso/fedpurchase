import { ingestRecentTransactions } from './pipeline/ingest';
import { recomputeRollups } from './pipeline/rollups';
import { regenerateSitemaps } from './pipeline/sitemap';
import { loadAgencies, loadPscCodes, loadNaicsCodes } from './pipeline/references';
import { kvSet, cacheKeys, TTL_PAGE } from './lib/cache';
import { currentFiscalYear } from './lib/format';
import type { Env } from './types';

/**
 * Invalidate all page caches so fresh content is served.
 */
async function invalidatePageCache(env: Env): Promise<void> {
  // KV list + delete is quota-heavy; in production use a versioned cache key prefix instead.
  // For now, list page: keys and delete them.
  const listed = await env.KV.list({ prefix: 'page:' });
  await Promise.all(listed.keys.map((k) => env.KV.delete(k.name)));
}

interface TopVendorRow {
  name: string;
  slug: string;
  total_amount: number;
  transaction_count: number;
  agency_count: number;
  top_psc_category: string | null;
}

interface FastestGrowingRow {
  category_slug: string;
  total_amount: number;
  yoy_growth_pct: number;
  transaction_count: number;
}

interface AgencyShiftRow {
  name: string;
  slug: string;
  abbreviation: string | null;
  curr_amount: number;
  prev_amount: number | null;
  yoy_pct: number | null;
}

/**
 * Generate and cache trend insight data for the given fiscal year.
 * Writes computed rows to KV (as JSON) and upserts page_metadata for SEO.
 */
async function generateTrendInsights(env: Env): Promise<void> {
  const fy = currentFiscalYear();
  const now = new Date().toISOString();

  // --- Top 100 vendors for this FY (query micro_purchases directly for FY accuracy) ---
  const topVendors = await env.DB.prepare(`
    SELECT
      mp.recipient_name AS name,
      vp.slug,
      SUM(mp.amount)           AS total_amount,
      COUNT(*)                 AS transaction_count,
      COUNT(DISTINCT mp.agency_id) AS agency_count,
      vp.top_psc_category
    FROM micro_purchases mp
    LEFT JOIN vendor_profiles vp ON mp.recipient_uei = vp.uei
    WHERE mp.fiscal_year = ? AND mp.recipient_uei IS NOT NULL
    GROUP BY mp.recipient_uei
    ORDER BY total_amount DESC
    LIMIT 100
  `).bind(fy).all<TopVendorRow>();

  await kvSet(env, `insights:top-vendors:${fy}`, JSON.stringify(topVendors.results), TTL_PAGE * 32);
  await env.DB.prepare(`
    INSERT INTO page_metadata (path, title, description, h1, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET title=excluded.title, description=excluded.description, h1=excluded.h1, updated_at=excluded.updated_at
  `).bind(
    `/insights/${fy}/top-100-micro-purchase-vendors`,
    `Top 100 Federal Micro-Purchase Vendors FY${fy} | GovPurchase Intel`,
    `The ${topVendors.results.length} vendors receiving the most federal micro-purchase dollars in FY${fy}.`,
    `Top 100 Federal Micro-Purchase Vendors — FY${fy}`,
    now
  ).run();

  console.log(`generateTrendInsights: top vendors cached (${topVendors.results.length} rows)`);

  // --- Fastest growing PSC categories ---
  const fastestGrowing = await env.DB.prepare(`
    SELECT
      category_slug,
      MAX(total_amount)      AS total_amount,
      AVG(yoy_growth_pct)    AS yoy_growth_pct,
      SUM(transaction_count) AS transaction_count
    FROM agency_psc_rollups
    WHERE fiscal_year = ? AND yoy_growth_pct IS NOT NULL AND total_amount > 1000
    GROUP BY category_slug
    ORDER BY yoy_growth_pct DESC
    LIMIT 50
  `).bind(fy).all<FastestGrowingRow>();

  await kvSet(env, `insights:fastest-growing:${fy}`, JSON.stringify(fastestGrowing.results), TTL_PAGE * 32);
  await env.DB.prepare(`
    INSERT INTO page_metadata (path, title, description, h1, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET title=excluded.title, description=excluded.description, h1=excluded.h1, updated_at=excluded.updated_at
  `).bind(
    `/insights/${fy}/fastest-growing-micro-purchase-categories`,
    `Fastest Growing Federal Micro-Purchase Categories FY${fy} | GovPurchase Intel`,
    `Product and service categories with the highest year-over-year growth in federal micro-purchase spending in FY${fy}.`,
    `Fastest Growing Micro-Purchase Categories — FY${fy}`,
    now
  ).run();

  console.log(`generateTrendInsights: fastest growing cached (${fastestGrowing.results.length} rows)`);

  // --- Agency spending shifts ---
  const agencyShifts = await env.DB.prepare(`
    SELECT
      a.name, a.slug, a.abbreviation,
      curr.total_amount AS curr_amount,
      prev.total_amount AS prev_amount,
      CASE WHEN prev.total_amount > 0
        THEN ROUND(((curr.total_amount - prev.total_amount) / prev.total_amount) * 100, 1)
        ELSE NULL
      END AS yoy_pct
    FROM agencies a
    JOIN (
      SELECT agency_id, SUM(total_amount) AS total_amount
      FROM agency_psc_rollups WHERE fiscal_year = ? GROUP BY agency_id
    ) curr ON a.id = curr.agency_id
    LEFT JOIN (
      SELECT agency_id, SUM(total_amount) AS total_amount
      FROM agency_psc_rollups WHERE fiscal_year = ? GROUP BY agency_id
    ) prev ON a.id = prev.agency_id
    ORDER BY curr_amount DESC
    LIMIT 50
  `).bind(fy, fy - 1).all<AgencyShiftRow>();

  await kvSet(env, `insights:agency-shifts:${fy}`, JSON.stringify(agencyShifts.results), TTL_PAGE * 32);
  await env.DB.prepare(`
    INSERT INTO page_metadata (path, title, description, h1, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET title=excluded.title, description=excluded.description, h1=excluded.h1, updated_at=excluded.updated_at
  `).bind(
    `/insights/${fy}/agency-spending-shifts`,
    `Federal Agency Micro-Purchase Spending Shifts FY${fy} | GovPurchase Intel`,
    `Which federal agencies increased or decreased their micro-purchase activity in FY${fy} compared to FY${fy - 1}.`,
    `Agency Micro-Purchase Spending Shifts — FY${fy}`,
    now
  ).run();

  console.log(`generateTrendInsights: agency shifts cached (${agencyShifts.results.length} rows)`);

  // Invalidate rendered page cache so next request pulls fresh pre-computed data
  await env.KV.delete(cacheKeys.insightsPage(fy, 'top-100-micro-purchase-vendors'));
  await env.KV.delete(cacheKeys.insightsPage(fy, 'fastest-growing-micro-purchase-categories'));
  await env.KV.delete(cacheKeys.insightsPage(fy, 'agency-spending-shifts'));

  console.log('generateTrendInsights: complete');
}

/**
 * Scheduled cron handler — called by Cloudflare Workers runtime.
 */
export async function scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
  console.log(`Cron triggered: ${event.cron}`);

  try {
    switch (event.cron) {
      case '0 3 * * 1': {
        // Monday 3am UTC — weekly data refresh
        console.log('Starting weekly data ingest...');
        const ingested = await ingestRecentTransactions(env, 7);
        console.log(`Ingested ${ingested} new transactions`);

        console.log('Recomputing rollups...');
        await recomputeRollups(env);

        console.log('Invalidating page cache...');
        await invalidatePageCache(env);

        console.log('Weekly refresh complete.');
        break;
      }

      case '0 4 1 * *': {
        // 1st of month 4am UTC — monthly tasks
        console.log('Starting monthly tasks...');
        await generateTrendInsights(env);
        await regenerateSitemaps(env);
        console.log('Monthly tasks complete.');
        break;
      }

      default:
        console.warn(`Unknown cron expression: ${event.cron}`);
    }
  } catch (err) {
    console.error('Cron error:', err);
    throw err;
  }
}

/**
 * Admin HTTP endpoint: trigger reference data load manually.
 * Called via POST /admin/seed-references (protected by secret).
 */
export async function seedReferenceData(env: Env): Promise<{ agencies: number; pscCodes: number; naicsCodes: number }> {
  // Run sequentially so failures are easier to identify in logs
  const agencyCount = await loadAgencies(env);
  console.log(`seedReferenceData: agencies done (${agencyCount})`);
  const pscCount = await loadPscCodes(env);
  console.log(`seedReferenceData: pscCodes done (${pscCount})`);
  const naicsCount = await loadNaicsCodes(env);
  console.log(`seedReferenceData: naicsCodes done (${naicsCount})`);
  return { agencies: agencyCount, pscCodes: pscCount, naicsCodes: naicsCount };
}

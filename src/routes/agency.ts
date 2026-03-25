import type { Context } from 'hono';
import { renderAgencyPscPage } from '../templates/agency-psc';
import { renderAgencyPage } from '../templates/agency';
import { kvGet, kvSet, cacheKeys, TTL_PAGE, TTL_AI } from '../lib/cache';
import { currentFiscalYear } from '../lib/format';
import type { Env } from '../types';

const HOW_TO_SELL_PROMPT = (pscCategoryName: string, agencyName: string) =>
  `You are a government contracting advisor. Write 150 words of practical guidance for a small business that wants to sell ${pscCategoryName} to ${agencyName}. Include: relevant GSA Schedule numbers, the agency's typical purchasing process for items under $10,000, and any relevant set-aside programs. Be specific and actionable. Do not use marketing language.`;

/**
 * GET /agency/:agencySlug/:pscSlug — Primary SEO page
 */
export async function agencyPscHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const { agencySlug, pscSlug } = c.req.param();
  const env = c.env;

  // Check page cache
  const cacheKey = cacheKeys.agencyPscPage(agencySlug, pscSlug);
  const cached = await kvGet(env, cacheKey);
  if (cached) {
    return c.html(cached);
  }

  // Use most recent FY that has rollup data (handles reporting lag between FYs)
  const latestRollupFy = await env.DB.prepare(`
    SELECT MAX(fiscal_year) AS fy FROM agency_psc_rollups
  `).first<{ fy: number | null }>();
  const fy = latestRollupFy?.fy ?? currentFiscalYear();

  // Lookup agency
  const agency = await env.DB.prepare(`SELECT * FROM agencies WHERE slug = ?`)
    .bind(agencySlug).first<{ id: number; name: string; slug: string; abbreviation: string | null }>();
  if (!agency) {
    return c.notFound();
  }

  // Lookup PSC category
  const pscRow = await env.DB.prepare(`
    SELECT category_slug, category_name FROM psc_codes
    WHERE category_slug = ? LIMIT 1
  `).bind(pscSlug).first<{ category_slug: string; category_name: string | null }>();

  const pscCategoryName = pscRow?.category_name ?? pscSlug;

  // Rollup data (current and prior FY)
  const rollup = await env.DB.prepare(`
    SELECT * FROM agency_psc_rollups
    WHERE agency_id = ? AND category_slug = ? AND fiscal_year = ?
  `).bind(agency.id, pscSlug, fy).first<{
    total_amount: number; transaction_count: number; unique_vendors: number;
    avg_transaction_size: number; yoy_growth_pct: number | null;
  }>();

  if (!rollup) {
    return c.notFound();
  }

  // Top 10 vendors
  const topVendorRows = await env.DB.prepare(`
    SELECT recipient_name, SUM(amount) AS total, COUNT(*) AS cnt
    FROM micro_purchases mp
    JOIN psc_codes p ON mp.psc_code = p.code
    WHERE mp.agency_id = ? AND p.category_slug = ? AND mp.fiscal_year = ?
      AND mp.recipient_name IS NOT NULL
    GROUP BY mp.recipient_uei
    ORDER BY total DESC
    LIMIT 10
  `).bind(agency.id, pscSlug, fy).all<{ recipient_name: string; total: number; cnt: number }>();

  // Recent 10 transactions
  const recentRows = await env.DB.prepare(`
    SELECT mp.action_date, mp.amount, mp.recipient_name, mp.description
    FROM micro_purchases mp
    JOIN psc_codes p ON mp.psc_code = p.code
    WHERE mp.agency_id = ? AND p.category_slug = ? AND mp.fiscal_year = ?
    ORDER BY mp.action_date DESC
    LIMIT 10
  `).bind(agency.id, pscSlug, fy).all<{
    action_date: string; amount: number; recipient_name: string | null; description: string | null;
  }>();

  // Quarterly spend (last 3 FYs)
  const quarterlyRows = await env.DB.prepare(`
    SELECT
      fiscal_year,
      CASE
        WHEN CAST(substr(action_date, 6, 2) AS INTEGER) BETWEEN 10 AND 12 THEN 'Q1'
        WHEN CAST(substr(action_date, 6, 2) AS INTEGER) BETWEEN 1 AND 3 THEN 'Q2'
        WHEN CAST(substr(action_date, 6, 2) AS INTEGER) BETWEEN 4 AND 6 THEN 'Q3'
        ELSE 'Q4'
      END AS quarter,
      SUM(amount) AS total
    FROM micro_purchases mp
    JOIN psc_codes p ON mp.psc_code = p.code
    WHERE mp.agency_id = ? AND p.category_slug = ? AND mp.fiscal_year >= ?
    GROUP BY fiscal_year, quarter
    ORDER BY fiscal_year, quarter
  `).bind(agency.id, pscSlug, fy - 2).all<{
    fiscal_year: number; quarter: string; total: number;
  }>();

  // AI "How to Sell" copy — cached in KV
  const aiCacheKey = cacheKeys.aiCopy(agencySlug, pscSlug);
  let howToSellCopy = await kvGet(env, aiCacheKey);

  if (!howToSellCopy) {
    try {
      const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        prompt: HOW_TO_SELL_PROMPT(pscCategoryName, agency.name),
      }) as { response: string };
      howToSellCopy = aiResponse.response ?? null;
      if (howToSellCopy) {
        await kvSet(env, aiCacheKey, howToSellCopy, TTL_AI);
      }
    } catch (err) {
      console.error('Workers AI error:', err);
      howToSellCopy = null;
    }
  }

  // Related categories for this agency
  const relatedRows = await env.DB.prepare(`
    SELECT DISTINCT p.category_name, p.category_slug
    FROM agency_psc_rollups r
    JOIN psc_codes p ON r.psc_code = p.code
    WHERE r.agency_id = ? AND r.category_slug != ? AND r.fiscal_year = ?
      AND p.category_slug IS NOT NULL
    ORDER BY r.total_amount DESC
    LIMIT 8
  `).bind(agency.id, pscSlug, fy).all<{ category_name: string | null; category_slug: string }>();

  const totalAmount = rollup.total_amount ?? 0;
  const topVendors = topVendorRows.results.map((v) => ({
    name: v.recipient_name,
    totalAmount: v.total,
    transactionCount: v.cnt,
    avgOrder: v.cnt > 0 ? v.total / v.cnt : 0,
    pctOfCategory: totalAmount > 0 ? (v.total / totalAmount) * 100 : 0,
  }));

  const html = renderAgencyPscPage({
    agencyName: agency.name,
    agencySlug,
    pscCategoryName,
    pscSlug,
    fiscalYear: fy,
    totalAmount,
    transactionCount: rollup.transaction_count ?? 0,
    avgOrderSize: rollup.avg_transaction_size ?? 0,
    uniqueVendors: rollup.unique_vendors ?? 0,
    yoyGrowthPct: rollup.yoy_growth_pct ?? null,
    topVendors,
    recentTransactions: recentRows.results.map((r) => ({
      actionDate: r.action_date,
      amount: r.amount,
      recipientName: r.recipient_name ?? '',
      description: r.description,
    })),
    quarterlySpend: quarterlyRows.results.map((q) => ({
      label: `${q.quarter} FY${q.fiscal_year}`,
      amount: q.total,
    })),
    howToSellCopy,
    relatedCategories: relatedRows.results.map((r) => ({
      name: r.category_name ?? r.category_slug,
      slug: r.category_slug,
    })),
  });

  await kvSet(env, cacheKey, html, TTL_PAGE);
  return c.html(html);
}

/**
 * GET /agency/:agencySlug — Agency overview
 */
export async function agencyHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const { agencySlug } = c.req.param();
  const env = c.env;

  const cacheKey = cacheKeys.agencyPage(agencySlug);
  const cached = await kvGet(env, cacheKey);
  if (cached) return c.html(cached);

  const agency = await env.DB.prepare(`SELECT * FROM agencies WHERE slug = ?`)
    .bind(agencySlug).first<{ id: number; name: string; slug: string; abbreviation: string | null }>();
  if (!agency) return c.notFound();

  // Use most recent FY with data for this agency
  const latestFyRow = await env.DB.prepare(`
    SELECT MAX(fiscal_year) AS fy FROM micro_purchases WHERE agency_id = ?
  `).bind(agency.id).first<{ fy: number | null }>();
  const fy = latestFyRow?.fy ?? currentFiscalYear();

  const statsRow = await env.DB.prepare(`
    SELECT SUM(amount) AS total_amount, COUNT(*) AS total_transactions
    FROM micro_purchases WHERE agency_id = ? AND fiscal_year = ?
  `).bind(agency.id, fy).first<{ total_amount: number; total_transactions: number }>();

  const categoryRows = await env.DB.prepare(`
    SELECT p.category_name, p.category_slug,
           SUM(mp.amount) AS total_amount, COUNT(*) AS transaction_count
    FROM micro_purchases mp
    JOIN psc_codes p ON mp.psc_code = p.code
    WHERE mp.agency_id = ? AND mp.fiscal_year = ? AND p.category_slug IS NOT NULL
    GROUP BY p.category_slug
    ORDER BY total_amount DESC
    LIMIT 12
  `).bind(agency.id, fy).all<{
    category_name: string | null; category_slug: string; total_amount: number; transaction_count: number;
  }>();

  const vendorRows = await env.DB.prepare(`
    SELECT recipient_name, SUM(amount) AS total_amount, COUNT(*) AS transaction_count
    FROM micro_purchases
    WHERE agency_id = ? AND fiscal_year = ? AND recipient_name IS NOT NULL
    GROUP BY recipient_uei
    ORDER BY total_amount DESC
    LIMIT 10
  `).bind(agency.id, fy).all<{ recipient_name: string; total_amount: number; transaction_count: number }>();

  const html = renderAgencyPage({
    agencyName: agency.name,
    agencySlug,
    abbreviation: agency.abbreviation,
    fiscalYear: fy,
    totalAmount: statsRow?.total_amount ?? 0,
    transactionCount: statsRow?.total_transactions ?? 0,
    topCategories: categoryRows.results.map((r) => ({
      categoryName: r.category_name ?? r.category_slug,
      categorySlug: r.category_slug,
      totalAmount: r.total_amount,
      transactionCount: r.transaction_count,
    })),
    topVendors: vendorRows.results.map((r) => ({
      name: r.recipient_name,
      totalAmount: r.total_amount,
      transactionCount: r.transaction_count,
    })),
  });

  await kvSet(env, cacheKey, html, TTL_PAGE);
  return c.html(html);
}

import type { Context } from 'hono';
import { renderIndustryPage } from '../templates/industry';
import { kvGet, kvSet, cacheKeys, TTL_PAGE } from '../lib/cache';
import { currentFiscalYear } from '../lib/format';
import type { Env } from '../types';

/**
 * GET /industry/:naicsCode/:agencySlug? — NAICS industry page
 */
export async function industryHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const { naicsCode, agencySlug } = c.req.param();
  const env = c.env;

  const cacheKey = cacheKeys.industryPage(naicsCode, agencySlug);
  const cached = await kvGet(env, cacheKey);
  if (cached) return c.html(cached);

  const fy = currentFiscalYear();

  // Lookup NAICS
  const naics = await env.DB.prepare(`SELECT * FROM naics_codes WHERE code = ?`)
    .bind(naicsCode).first<{
      id: number; code: string; description: string; slug: string;
      sector_code: string | null; sector_name: string | null;
    }>();
  if (!naics) return c.notFound();

  // Optional agency filter
  let agencyId: number | null = null;
  let agencyName: string | undefined;

  if (agencySlug) {
    const agency = await env.DB.prepare(`SELECT id, name FROM agencies WHERE slug = ?`)
      .bind(agencySlug).first<{ id: number; name: string }>();
    if (!agency) return c.notFound();
    agencyId = agency.id;
    agencyName = agency.name;
  }

  // Total stats
  const statsRow = agencyId
    ? await env.DB.prepare(`
        SELECT SUM(amount) AS total_amount, COUNT(*) AS total_transactions
        FROM micro_purchases WHERE naics_code = ? AND agency_id = ? AND fiscal_year = ?
      `).bind(naicsCode, agencyId, fy).first<{ total_amount: number; total_transactions: number }>()
    : await env.DB.prepare(`
        SELECT SUM(amount) AS total_amount, COUNT(*) AS total_transactions
        FROM micro_purchases WHERE naics_code = ? AND fiscal_year = ?
      `).bind(naicsCode, fy).first<{ total_amount: number; total_transactions: number }>();

  // Agency breakdown (only when not filtered to single agency)
  const agencyBreakdown = agencyId ? [] : (await env.DB.prepare(`
    SELECT a.name AS agency_name, a.slug AS agency_slug,
           SUM(mp.amount) AS total_amount, COUNT(*) AS transaction_count,
           COUNT(DISTINCT mp.recipient_uei) AS unique_vendors
    FROM micro_purchases mp
    JOIN agencies a ON mp.agency_id = a.id
    WHERE mp.naics_code = ? AND mp.fiscal_year = ?
    GROUP BY mp.agency_id
    ORDER BY total_amount DESC
    LIMIT 15
  `).bind(naicsCode, fy).all<{
    agency_name: string; agency_slug: string;
    total_amount: number; transaction_count: number; unique_vendors: number;
  }>()).results.map((r) => ({
    agencyName: r.agency_name,
    agencySlug: r.agency_slug,
    totalAmount: r.total_amount,
    transactionCount: r.transaction_count,
    uniqueVendors: r.unique_vendors,
  }));

  // Top vendors
  const vendorQuery = agencyId
    ? env.DB.prepare(`
        SELECT recipient_name, SUM(amount) AS total_amount, COUNT(*) AS transaction_count
        FROM micro_purchases
        WHERE naics_code = ? AND agency_id = ? AND fiscal_year = ? AND recipient_name IS NOT NULL
        GROUP BY recipient_uei ORDER BY total_amount DESC LIMIT 10
      `).bind(naicsCode, agencyId, fy)
    : env.DB.prepare(`
        SELECT recipient_name, SUM(amount) AS total_amount, COUNT(*) AS transaction_count
        FROM micro_purchases
        WHERE naics_code = ? AND fiscal_year = ? AND recipient_name IS NOT NULL
        GROUP BY recipient_uei ORDER BY total_amount DESC LIMIT 10
      `).bind(naicsCode, fy);

  const vendorRows = await vendorQuery.all<{
    recipient_name: string; total_amount: number; transaction_count: number;
  }>();

  // Related NAICS (same sector)
  const relatedRows = naics.sector_code ? (await env.DB.prepare(`
    SELECT code, description FROM naics_codes
    WHERE sector_code = ? AND code != ?
    LIMIT 6
  `).bind(naics.sector_code, naicsCode).all<{ code: string; description: string }>()).results : [];

  const html = renderIndustryPage({
    naicsCode: naics.code,
    naicsDescription: naics.description,
    sectorName: naics.sector_name,
    agencySlug: agencySlug || undefined,
    agencyName,
    fiscalYear: fy,
    totalAmount: statsRow?.total_amount ?? 0,
    transactionCount: statsRow?.total_transactions ?? 0,
    agencyBreakdown,
    topVendors: vendorRows.results.map((v) => ({
      name: v.recipient_name,
      totalAmount: v.total_amount,
      transactionCount: v.transaction_count,
    })),
    relatedNaics: relatedRows,
  });

  await kvSet(env, cacheKey, html, TTL_PAGE);
  return c.html(html);
}

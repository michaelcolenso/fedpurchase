import type { Context } from 'hono';
import { renderVendorPage } from '../templates/vendor';
import { kvGet, kvSet, cacheKeys, TTL_PAGE } from '../lib/cache';
import type { Env } from '../types';

/**
 * GET /vendor/:vendorSlug — Vendor profile page
 */
export async function vendorHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const { vendorSlug } = c.req.param();
  const env = c.env;

  const cacheKey = cacheKeys.vendorPage(vendorSlug);
  const cached = await kvGet(env, cacheKey);
  if (cached) return c.html(cached);

  // Lookup vendor
  const vendor = await env.DB.prepare(`SELECT * FROM vendor_profiles WHERE slug = ?`)
    .bind(vendorSlug).first<{
      id: number; uei: string; name: string; slug: string;
      total_micro_purchase_amount: number; total_transactions: number;
      agency_count: number; top_agency_name: string | null;
      top_psc_category: string | null; first_seen: string | null; last_seen: string | null;
    }>();

  if (!vendor) return c.notFound();

  // Agency breakdown
  const agencyRows = await env.DB.prepare(`
    SELECT a.name AS agency_name, a.slug AS agency_slug,
           SUM(mp.amount) AS total_amount, COUNT(*) AS transaction_count
    FROM micro_purchases mp
    JOIN agencies a ON mp.agency_id = a.id
    WHERE mp.recipient_uei = ?
    GROUP BY mp.agency_id
    ORDER BY total_amount DESC
    LIMIT 10
  `).bind(vendor.uei).all<{
    agency_name: string; agency_slug: string; total_amount: number; transaction_count: number;
  }>();

  // Recent transactions
  const recentRows = await env.DB.prepare(`
    SELECT mp.action_date, mp.amount, a.name AS agency_name, mp.description
    FROM micro_purchases mp
    LEFT JOIN agencies a ON mp.agency_id = a.id
    WHERE mp.recipient_uei = ?
    ORDER BY mp.action_date DESC
    LIMIT 10
  `).bind(vendor.uei).all<{
    action_date: string; amount: number; agency_name: string | null; description: string | null;
  }>();

  const html = renderVendorPage({
    vendorName: vendor.name,
    vendorSlug: vendor.slug,
    uei: vendor.uei,
    totalAmount: vendor.total_micro_purchase_amount ?? 0,
    totalTransactions: vendor.total_transactions ?? 0,
    agencyCount: vendor.agency_count ?? 0,
    topPscCategory: vendor.top_psc_category,
    firstSeen: vendor.first_seen,
    lastSeen: vendor.last_seen,
    agencyBreakdown: agencyRows.results.map((r) => ({
      agencyName: r.agency_name,
      agencySlug: r.agency_slug,
      totalAmount: r.total_amount,
      transactionCount: r.transaction_count,
    })),
    recentTransactions: recentRows.results.map((r) => ({
      actionDate: r.action_date,
      amount: r.amount,
      agencyName: r.agency_name,
      description: r.description,
    })),
  });

  await kvSet(env, cacheKey, html, TTL_PAGE);
  return c.html(html);
}

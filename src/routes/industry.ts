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

/**
 * GET /industry — Industry list page
 */
export async function industryListHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const env = c.env;

  const cached = await kvGet(env, 'page:industry-list');
  if (cached) return c.html(cached);

  const rows = await env.DB.prepare(`
    SELECT n.code, n.description, n.slug, n.sector_name,
           COALESCE(SUM(mp.amount), 0) AS total_amount,
           COALESCE(COUNT(mp.id), 0)   AS transaction_count
    FROM naics_codes n
    LEFT JOIN micro_purchases mp ON mp.naics_code = n.code
    GROUP BY n.code
    ORDER BY total_amount DESC
  `).all<{ code: string; description: string; slug: string; sector_name: string | null; total_amount: number; transaction_count: number }>();

  const { layout, escapeHtml, breadcrumb, inlineBar } = await import('../templates/layout');
  const { formatCurrency, formatNumber } = await import('../lib/format');

  const maxAmount = Math.max(...rows.results.map((r) => r.total_amount), 1);

  const tableRows = rows.results.map((r, i) => `
    <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors">
      <td class="px-4 py-3">
        <a href="/industry/${r.code}" class="font-medium text-blue-700 hover:underline">${escapeHtml(r.description)}</a>
        <div class="text-xs text-gray-400 mt-0.5 font-mono">${escapeHtml(r.code)}</div>
      </td>
      <td class="px-4 py-3 text-gray-500 text-sm">${escapeHtml(r.sector_name ?? '—')}</td>
      <td class="px-4 py-3 text-right">
        <div class="flex items-center justify-end gap-2">
          ${inlineBar(r.total_amount, maxAmount)}
          <span class="font-medium">${formatCurrency(r.total_amount)}</span>
        </div>
      </td>
      <td class="px-4 py-3 text-right text-gray-500">${formatNumber(r.transaction_count)}</td>
    </tr>`).join('');

  const body = `
    ${breadcrumb([{ label: 'Home', href: '/' }, { label: 'Industries' }])}
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900">Industries (NAICS)</h1>
      <p class="text-sm text-gray-500 mt-1">${rows.results.length} industry codes ranked by federal micro-purchase volume</p>
    </div>
    <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 border-b border-gray-200">
          <tr>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Industry</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Sector</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600">Total Spend</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600">Transactions</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;

  const html = layout(
    { title: 'Industries (NAICS) — Federal Micro-Purchase Spending | GovPurchase Intel', description: 'Browse NAICS industry codes ranked by federal micro-purchase spending volume.', canonicalPath: '/industry' },
    body
  );
  await kvSet(env, 'page:industry-list', html, TTL_PAGE);
  return c.html(html);
}

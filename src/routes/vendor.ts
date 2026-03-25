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

/**
 * GET /vendor — Vendor list page
 */
export async function vendorListHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const env = c.env;

  const cached = await kvGet(env, 'page:vendor-list');
  if (cached) return c.html(cached);

  const rows = await env.DB.prepare(`
    SELECT name, slug, total_micro_purchase_amount, total_transactions, top_agency_name, top_psc_category
    FROM vendor_profiles
    WHERE total_micro_purchase_amount > 0
    ORDER BY total_micro_purchase_amount DESC
    LIMIT 100
  `).all<{
    name: string;
    slug: string;
    total_micro_purchase_amount: number;
    total_transactions: number;
    top_agency_name: string | null;
    top_psc_category: string | null;
  }>();

  const { layout, escapeHtml, breadcrumb, inlineBar } = await import('../templates/layout');
  const { formatCurrency, formatNumber } = await import('../lib/format');

  const maxAmount = Math.max(...rows.results.map((r) => r.total_micro_purchase_amount), 1);

  const tableRows = rows.results.map((r, i) => `
    <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors">
      <td class="px-4 py-3 font-medium">
        <a href="/vendor/${r.slug}" class="text-blue-700 hover:underline">${escapeHtml(r.name)}</a>
      </td>
      <td class="px-4 py-3 text-right">
        <div class="flex items-center justify-end gap-2">
          ${inlineBar(r.total_micro_purchase_amount, maxAmount)}
          <span class="font-medium">${formatCurrency(r.total_micro_purchase_amount)}</span>
        </div>
      </td>
      <td class="px-4 py-3 text-right text-gray-500">${formatNumber(r.total_transactions)}</td>
      <td class="px-4 py-3 text-gray-600 text-sm">${escapeHtml(r.top_agency_name ?? '—')}</td>
      <td class="px-4 py-3 text-gray-500 text-sm">${escapeHtml(r.top_psc_category ?? '—')}</td>
    </tr>`).join('');

  const body = `
    ${breadcrumb([{ label: 'Home', href: '/' }, { label: 'Vendors' }])}
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900">Top Federal Micro-Purchase Vendors</h1>
      <p class="text-sm text-gray-500 mt-1">Top 100 vendors by total micro-purchase receipts</p>
    </div>
    <div class="bg-white border border-gray-200 rounded-lg overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 border-b border-gray-200">
          <tr>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Vendor</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600">Total Received</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600">Transactions</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Top Agency</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Top Category</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;

  const html = layout(
    { title: 'Top Federal Micro-Purchase Vendors | GovPurchase Intel', description: 'The top 100 vendors receiving federal micro-purchase dollars, ranked by total amount received.', canonicalPath: '/vendor' },
    body
  );
  await kvSet(env, 'page:vendor-list', html, TTL_PAGE);
  return c.html(html);
}

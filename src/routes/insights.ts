import type { Context } from 'hono';
import { layout, escapeHtml } from '../templates/layout';
import { formatCurrency, formatNumber } from '../lib/format';
import type { Env } from '../types';

const INSIGHT_TOPICS: Record<string, { title: string; description: string }> = {
  'fastest-growing-micro-purchase-categories': {
    title: 'Fastest Growing Micro-Purchase Categories',
    description: 'Product categories with the highest year-over-year growth in federal micro-purchase spending.',
  },
  'top-100-micro-purchase-vendors': {
    title: 'Top 100 Federal Micro-Purchase Vendors',
    description: 'The vendors receiving the most federal micro-purchase dollars across all agencies.',
  },
  'agency-spending-shifts': {
    title: 'Agency Spending Shifts',
    description: 'Which federal agencies increased or decreased their micro-purchase activity.',
  },
};

/**
 * GET /insights/:year/:topicSlug — Trend/insight hub pages
 */
export async function insightsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const { year, topicSlug } = c.req.param();
  const env = c.env;

  const fy = parseInt(year, 10);
  if (isNaN(fy) || fy < 2010 || fy > 2030) return c.notFound();

  const topic = INSIGHT_TOPICS[topicSlug];

  if (topicSlug === 'top-100-micro-purchase-vendors') {
    return renderTop100Vendors(c, env, fy, topic);
  }
  if (topicSlug === 'fastest-growing-micro-purchase-categories') {
    return renderFastestGrowing(c, env, fy, topic);
  }
  if (topicSlug === 'agency-spending-shifts') {
    return renderAgencySpendingShifts(c, env, fy, topic);
  }

  return c.notFound();
}

async function renderTop100Vendors(
  c: Context<{ Bindings: Env }>,
  env: Env,
  fy: number,
  topic: { title: string; description: string }
): Promise<Response> {
  const rows = await env.DB.prepare(`
    SELECT vp.name, vp.slug, vp.total_micro_purchase_amount,
           vp.total_transactions, vp.agency_count, vp.top_psc_category
    FROM vendor_profiles vp
    ORDER BY total_micro_purchase_amount DESC
    LIMIT 100
  `).all<{
    name: string; slug: string; total_micro_purchase_amount: number;
    total_transactions: number; agency_count: number; top_psc_category: string | null;
  }>();

  const tableRows = rows.results.map((v, i) => `
    <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}">
      <td class="p-3 text-gray-500">${i + 1}</td>
      <td class="p-3">
        <a href="/vendor/${v.slug}" class="text-blue-600 hover:underline font-medium">${escapeHtml(v.name)}</a>
      </td>
      <td class="p-3 text-right">${formatCurrency(v.total_micro_purchase_amount)}</td>
      <td class="p-3 text-right">${formatNumber(v.total_transactions)}</td>
      <td class="p-3 text-right">${v.agency_count}</td>
      <td class="p-3">${escapeHtml(v.top_psc_category ?? '—')}</td>
    </tr>`).join('');

  const body = `
    <h1 class="text-2xl md:text-3xl font-bold mb-2">${escapeHtml(topic.title)} — FY${fy}</h1>
    <p class="text-gray-600 mb-6">${escapeHtml(topic.description)}</p>

    <div class="overflow-x-auto">
      <table class="w-full text-sm border border-gray-200 rounded">
        <thead class="bg-gray-100">
          <tr>
            <th class="text-left p-3">#</th>
            <th class="text-left p-3">Vendor</th>
            <th class="text-right p-3">Total Received</th>
            <th class="text-right p-3">Transactions</th>
            <th class="text-right p-3">Agencies</th>
            <th class="text-left p-3">Top Category</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;

  const html = layout(
    { title: `${topic.title} FY${fy} | GovPurchase Intel`, description: topic.description, canonicalPath: `/insights/${fy}/top-100-micro-purchase-vendors` },
    body
  );
  return c.html(html);
}

async function renderFastestGrowing(
  c: Context<{ Bindings: Env }>,
  env: Env,
  fy: number,
  topic: { title: string; description: string }
): Promise<Response> {
  const rows = await env.DB.prepare(`
    SELECT category_slug, MAX(total_amount) AS total_amount,
           MAX(yoy_growth_pct) AS yoy_growth_pct,
           SUM(transaction_count) AS transaction_count
    FROM agency_psc_rollups
    WHERE fiscal_year = ? AND yoy_growth_pct IS NOT NULL AND total_amount > 1000
    GROUP BY category_slug
    ORDER BY yoy_growth_pct DESC
    LIMIT 50
  `).bind(fy).all<{
    category_slug: string; total_amount: number; yoy_growth_pct: number; transaction_count: number;
  }>();

  const tableRows = rows.results.map((r, i) => `
    <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}">
      <td class="p-3 text-gray-500">${i + 1}</td>
      <td class="p-3">${escapeHtml(r.category_slug)}</td>
      <td class="p-3 text-right">${formatCurrency(r.total_amount)}</td>
      <td class="p-3 text-right ${r.yoy_growth_pct >= 0 ? 'text-green-600' : 'text-red-600'}">
        ${r.yoy_growth_pct >= 0 ? '+' : ''}${r.yoy_growth_pct.toFixed(1)}%
      </td>
      <td class="p-3 text-right">${formatNumber(r.transaction_count)}</td>
    </tr>`).join('');

  const body = `
    <h1 class="text-2xl md:text-3xl font-bold mb-2">${escapeHtml(topic.title)} — FY${fy}</h1>
    <p class="text-gray-600 mb-6">${escapeHtml(topic.description)}</p>

    <div class="overflow-x-auto">
      <table class="w-full text-sm border border-gray-200 rounded">
        <thead class="bg-gray-100">
          <tr>
            <th class="text-left p-3">#</th>
            <th class="text-left p-3">Category</th>
            <th class="text-right p-3">Total Spend</th>
            <th class="text-right p-3">YoY Growth</th>
            <th class="text-right p-3">Transactions</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;

  const html = layout(
    { title: `${topic.title} FY${fy} | GovPurchase Intel`, description: topic.description, canonicalPath: `/insights/${fy}/fastest-growing-micro-purchase-categories` },
    body
  );
  return c.html(html);
}

async function renderAgencySpendingShifts(
  c: Context<{ Bindings: Env }>,
  env: Env,
  fy: number,
  topic: { title: string; description: string }
): Promise<Response> {
  const rows = await env.DB.prepare(`
    SELECT a.name, a.slug, a.abbreviation,
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
  `).bind(fy, fy - 1).all<{
    name: string; slug: string; abbreviation: string | null;
    curr_amount: number; prev_amount: number | null; yoy_pct: number | null;
  }>();

  const tableRows = rows.results.map((r, i) => `
    <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}">
      <td class="p-3">
        <a href="/agency/${r.slug}" class="text-blue-600 hover:underline">${escapeHtml(r.name)}</a>
        ${r.abbreviation ? `<span class="text-gray-500"> (${escapeHtml(r.abbreviation)})</span>` : ''}
      </td>
      <td class="p-3 text-right">${formatCurrency(r.curr_amount)}</td>
      <td class="p-3 text-right ${r.prev_amount ? '' : 'text-gray-400'}">${r.prev_amount ? formatCurrency(r.prev_amount) : '—'}</td>
      <td class="p-3 text-right ${r.yoy_pct != null ? (r.yoy_pct >= 0 ? 'text-green-600' : 'text-red-600') : 'text-gray-400'}">
        ${r.yoy_pct != null ? `${r.yoy_pct >= 0 ? '+' : ''}${r.yoy_pct}%` : '—'}
      </td>
    </tr>`).join('');

  const body = `
    <h1 class="text-2xl md:text-3xl font-bold mb-2">${escapeHtml(topic.title)} — FY${fy}</h1>
    <p class="text-gray-600 mb-6">${escapeHtml(topic.description)}</p>

    <div class="overflow-x-auto">
      <table class="w-full text-sm border border-gray-200 rounded">
        <thead class="bg-gray-100">
          <tr>
            <th class="text-left p-3">Agency</th>
            <th class="text-right p-3">FY${fy} Spend</th>
            <th class="text-right p-3">FY${fy - 1} Spend</th>
            <th class="text-right p-3">YoY Change</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;

  const html = layout(
    { title: `${topic.title} FY${fy} | GovPurchase Intel`, description: topic.description, canonicalPath: `/insights/${fy}/agency-spending-shifts` },
    body
  );
  return c.html(html);
}

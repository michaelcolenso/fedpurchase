import { layout, escapeHtml, statCard, breadcrumb, inlineBar } from './layout';
import { formatCurrency, formatNumber, formatYoY, formatDate } from '../lib/format';

export interface TopVendor {
  name: string;
  totalAmount: number;
  transactionCount: number;
  avgOrder: number;
  pctOfCategory: number;
}

export interface RecentTransaction {
  actionDate: string;
  amount: number;
  recipientName: string;
  description: string | null;
}

export interface QuarterlySpend {
  label: string; // e.g. "Q1 FY2024"
  amount: number;
}

export interface AgencyPscPageData {
  agencyName: string;
  agencySlug: string;
  pscCategoryName: string;
  pscSlug: string;
  fiscalYear: number;
  totalAmount: number;
  transactionCount: number;
  avgOrderSize: number;
  uniqueVendors: number;
  yoyGrowthPct: number | null;
  topVendors: TopVendor[];
  recentTransactions: RecentTransaction[];
  quarterlySpend: QuarterlySpend[];
  howToSellCopy: string | null;
  relatedCategories: Array<{ name: string; slug: string }>;
}

export function renderAgencyPscPage(data: AgencyPscPageData): string {
  const {
    agencyName, agencySlug, pscCategoryName, pscSlug,
    fiscalYear, totalAmount, transactionCount, avgOrderSize,
    uniqueVendors, yoyGrowthPct, topVendors, recentTransactions,
    quarterlySpend, howToSellCopy, relatedCategories,
  } = data;

  const title = `${agencyName} ${pscCategoryName} Spending — Micro-Purchase Intelligence`;
  const description = `FY${fiscalYear}: ${agencyName} made ${formatNumber(transactionCount)} micro-purchase transactions totaling ${formatCurrency(totalAmount)} in ${pscCategoryName}. Top vendors, trends, and how-to-sell guidance.`;

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: title,
    description,
    url: `https://fedpurchase.io/agency/${agencySlug}/${pscSlug}`,
    creator: { '@type': 'Organization', name: 'GovPurchase Intel' },
    license: 'https://creativecommons.org/publicdomain/zero/1.0/',
    isBasedOn: 'https://usaspending.gov',
    temporalCoverage: `FY${fiscalYear}`,
  };

  const yoyClass = yoyGrowthPct != null && yoyGrowthPct >= 0 ? 'text-green-600' : 'text-red-600';

  const statsBar = `
    <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
      ${statCard('Total Spend', formatCurrency(totalAmount), `FY${fiscalYear}`)}
      ${statCard('Transactions', formatNumber(transactionCount))}
      ${statCard('Avg Order Size', formatCurrency(avgOrderSize))}
      ${statCard('Active Vendors', formatNumber(uniqueVendors))}
      ${statCard('YoY Change', formatYoY(yoyGrowthPct), undefined, yoyClass)}
    </div>`;

  const maxVendorAmount = Math.max(...topVendors.map((v) => v.totalAmount), 1);

  const vendorsTable = topVendors.length > 0 ? `
    <h2 class="text-lg font-semibold mt-8 mb-3">Top Vendors</h2>
    <div class="bg-white border border-gray-200 rounded-lg overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 border-b border-gray-200">
          <tr>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Vendor</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600">Total Amount</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600">Transactions</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600">Avg Order</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600">% of Category</th>
          </tr>
        </thead>
        <tbody>
          ${topVendors.map((v, i) => `
          <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors">
            <td class="px-4 py-3 font-medium text-gray-900">${escapeHtml(v.name)}</td>
            <td class="px-4 py-3 text-right">
              <div class="flex items-center justify-end gap-2">
                ${inlineBar(v.totalAmount, maxVendorAmount)}
                <span>${formatCurrency(v.totalAmount)}</span>
              </div>
            </td>
            <td class="px-4 py-3 text-right text-gray-600">${formatNumber(v.transactionCount)}</td>
            <td class="px-4 py-3 text-right text-gray-600">${formatCurrency(v.avgOrder)}</td>
            <td class="px-4 py-3 text-right text-gray-600">${v.pctOfCategory.toFixed(1)}%</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '';

  // Bar chart: fixed 96px chart area, bars sized by px relative to max
  const maxQ = Math.max(...quarterlySpend.map((q) => q.amount), 1);
  const CHART_H = 96; // px

  const trendChart = quarterlySpend.length > 0 ? `
    <h2 class="text-lg font-semibold mt-8 mb-4">Quarterly Spending Trend</h2>
    <div class="bg-white border border-gray-200 rounded-lg p-5">
      <div class="flex items-end gap-3 border-b border-gray-200" style="height:${CHART_H + 24}px;padding-bottom:0">
        ${quarterlySpend.map((q) => {
          const barH = Math.max(4, Math.round((q.amount / maxQ) * CHART_H));
          return `<div class="flex-1 flex flex-col items-center" style="min-width:0">
            <span class="text-xs text-gray-500 mb-1 truncate w-full text-center">${escapeHtml(formatCurrency(q.amount))}</span>
            <div class="w-full bg-blue-500 rounded-t" style="height:${barH}px"></div>
          </div>`;
        }).join('')}
      </div>
      <div class="flex gap-3 mt-1">
        ${quarterlySpend.map((q) => `
          <div class="flex-1 text-center text-xs text-gray-500 truncate">${escapeHtml(q.label)}</div>
        `).join('')}
      </div>
    </div>` : '';

  const recentTable = recentTransactions.length > 0 ? `
    <h2 class="text-lg font-semibold mt-8 mb-3">Recent Transactions</h2>
    <div class="bg-white border border-gray-200 rounded-lg overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 border-b border-gray-200">
          <tr>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Date</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Vendor</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Description</th>
          </tr>
        </thead>
        <tbody>
          ${recentTransactions.map((t, i) => `
          <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}">
            <td class="px-4 py-3 whitespace-nowrap text-gray-600">${escapeHtml(formatDate(t.actionDate))}</td>
            <td class="px-4 py-3 text-right font-medium whitespace-nowrap">${formatCurrency(t.amount)}</td>
            <td class="px-4 py-3 text-gray-900">${escapeHtml(t.recipientName ?? '')}</td>
            <td class="px-4 py-3 text-gray-500 text-xs">${escapeHtml(t.description ?? '—')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '';

  const howToSell = howToSellCopy ? `
    <div class="mt-8 bg-blue-50 border border-blue-100 rounded-xl p-6">
      <h2 class="text-base font-semibold text-blue-900 mb-2">
        How to Sell ${escapeHtml(pscCategoryName)} to ${escapeHtml(agencyName)}
      </h2>
      <p class="text-sm text-blue-800 leading-relaxed">${escapeHtml(howToSellCopy)}</p>
    </div>` : '';

  const related = relatedCategories.length > 0 ? `
    <h2 class="text-lg font-semibold mt-8 mb-3">Related Categories</h2>
    <div class="flex flex-wrap gap-2">
      ${relatedCategories.map((c) =>
        `<a href="/agency/${agencySlug}/${c.slug}"
            class="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm hover:border-blue-400 hover:text-blue-700 transition-colors">
          ${escapeHtml(c.name)}
        </a>`
      ).join('')}
    </div>` : '';

  const body = `
    ${breadcrumb([
      { label: 'Home', href: '/' },
      { label: agencyName, href: `/agency/${agencySlug}` },
      { label: pscCategoryName },
    ])}

    <div class="mb-6">
      <h1 class="text-2xl md:text-3xl font-bold text-gray-900">
        ${escapeHtml(agencyName)}: ${escapeHtml(pscCategoryName)}
      </h1>
      <p class="text-sm text-gray-500 mt-1">Micro-Purchase Intelligence — FY${fiscalYear}</p>
    </div>

    <p class="text-gray-600 mb-6 leading-relaxed">
      In FY${fiscalYear}, ${escapeHtml(agencyName)} made <strong class="text-gray-900">${formatNumber(transactionCount)}</strong> micro-purchase
      transactions totaling <strong class="text-gray-900">${formatCurrency(totalAmount)}</strong> in ${escapeHtml(pscCategoryName)}.
    </p>

    ${statsBar}
    ${vendorsTable}
    ${trendChart}
    ${recentTable}
    ${howToSell}
    ${related}

    <div class="mt-10 border-t border-gray-200 pt-6 text-xs text-gray-400 leading-relaxed">
      Data sourced from <a href="https://usaspending.gov" class="text-blue-500 hover:underline" rel="noopener">USASpending.gov</a>
      via FPDS. Includes procurement contracts ≤ $10,000 (federal micro-purchase threshold).
      Updated weekly. Fiscal year runs October 1 – September 30.
    </div>`;

  return layout(
    { title, description, canonicalPath: `/agency/${agencySlug}/${pscSlug}`, structuredData },
    body
  );
}

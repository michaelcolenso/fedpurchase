import { layout, escapeHtml } from './layout';
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

  // Stats bar
  const statsBar = `
    <div class="grid grid-cols-2 md:grid-cols-5 gap-4 my-6">
      ${statCard('Total Spend', formatCurrency(totalAmount))}
      ${statCard('Transactions', formatNumber(transactionCount))}
      ${statCard('Avg Order Size', formatCurrency(avgOrderSize))}
      ${statCard('Active Vendors', formatNumber(uniqueVendors))}
      ${statCard('YoY Change', formatYoY(yoyGrowthPct), yoyGrowthPct != null && yoyGrowthPct >= 0 ? 'text-green-600' : 'text-red-600')}
    </div>`;

  // Top vendors table
  const vendorsTable = topVendors.length > 0 ? `
    <h2 class="text-xl font-semibold mt-8 mb-3">Top Vendors</h2>
    <div class="overflow-x-auto">
      <table class="w-full text-sm border border-gray-200 rounded">
        <thead class="bg-gray-100">
          <tr>
            <th class="text-left p-3">Vendor</th>
            <th class="text-right p-3">Total Amount</th>
            <th class="text-right p-3">Transactions</th>
            <th class="text-right p-3">Avg Order</th>
            <th class="text-right p-3">% of Category</th>
          </tr>
        </thead>
        <tbody>
          ${topVendors.map((v, i) => `
          <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}">
            <td class="p-3 font-medium">${escapeHtml(v.name)}</td>
            <td class="p-3 text-right">${formatCurrency(v.totalAmount)}</td>
            <td class="p-3 text-right">${formatNumber(v.transactionCount)}</td>
            <td class="p-3 text-right">${formatCurrency(v.avgOrder)}</td>
            <td class="p-3 text-right">${v.pctOfCategory.toFixed(1)}%</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '';

  // Quarterly trend chart (simple CSS bar chart)
  const maxAmount = Math.max(...quarterlySpend.map((q) => q.amount), 1);
  const trendChart = quarterlySpend.length > 0 ? `
    <h2 class="text-xl font-semibold mt-8 mb-3">Spending Trend</h2>
    <div class="flex items-end gap-2 h-32 border-b border-gray-200 pb-2">
      ${quarterlySpend.map((q) => {
        const pct = Math.round((q.amount / maxAmount) * 100);
        return `<div class="flex-1 flex flex-col items-center gap-1">
          <span class="text-xs text-gray-500">${escapeHtml(formatCurrency(q.amount))}</span>
          <div class="w-full bg-blue-500 rounded-t" style="height: ${pct}%"></div>
          <span class="text-xs text-gray-600">${escapeHtml(q.label)}</span>
        </div>`;
      }).join('')}
    </div>` : '';

  // Recent transactions
  const recentTable = recentTransactions.length > 0 ? `
    <h2 class="text-xl font-semibold mt-8 mb-3">Recent Transactions</h2>
    <div class="overflow-x-auto">
      <table class="w-full text-sm border border-gray-200 rounded">
        <thead class="bg-gray-100">
          <tr>
            <th class="text-left p-3">Date</th>
            <th class="text-right p-3">Amount</th>
            <th class="text-left p-3">Vendor</th>
            <th class="text-left p-3">Description</th>
          </tr>
        </thead>
        <tbody>
          ${recentTransactions.map((t, i) => `
          <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}">
            <td class="p-3 whitespace-nowrap">${escapeHtml(formatDate(t.actionDate))}</td>
            <td class="p-3 text-right whitespace-nowrap">${formatCurrency(t.amount)}</td>
            <td class="p-3">${escapeHtml(t.recipientName ?? '')}</td>
            <td class="p-3 text-gray-600">${escapeHtml(t.description ?? '—')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '';

  // How to sell section
  const howToSell = howToSellCopy ? `
    <h2 class="text-xl font-semibold mt-8 mb-3">How to Sell ${escapeHtml(pscCategoryName)} to ${escapeHtml(agencyName)}</h2>
    <div class="bg-blue-50 border border-blue-200 rounded p-4 text-sm leading-relaxed">
      ${escapeHtml(howToSellCopy)}
    </div>` : '';

  // Related categories
  const related = relatedCategories.length > 0 ? `
    <h2 class="text-xl font-semibold mt-8 mb-3">Related Categories</h2>
    <div class="flex flex-wrap gap-2">
      ${relatedCategories.map((c) =>
        `<a href="/agency/${agencySlug}/${c.slug}" class="px-3 py-1 bg-gray-100 rounded text-sm hover:bg-gray-200">${escapeHtml(c.name)}</a>`
      ).join('')}
    </div>` : '';

  const body = `
    <nav class="text-sm text-gray-500 mb-4">
      <a href="/" class="hover:text-blue-700">Home</a> /
      <a href="/agency/${agencySlug}" class="hover:text-blue-700">${escapeHtml(agencyName)}</a> /
      <span>${escapeHtml(pscCategoryName)}</span>
    </nav>

    <h1 class="text-2xl md:text-3xl font-bold mb-2">${escapeHtml(agencyName)} ${escapeHtml(pscCategoryName)} Spending</h1>
    <p class="text-gray-600 mb-2">Micro-Purchase Intelligence — FY${fiscalYear}</p>

    <p class="text-lg text-gray-700 mb-4">
      In FY${fiscalYear}, ${escapeHtml(agencyName)} made <strong>${formatNumber(transactionCount)}</strong> micro-purchase
      transactions totaling <strong>${formatCurrency(totalAmount)}</strong> in ${escapeHtml(pscCategoryName)}.
      Here's what they're buying, from whom, and what it means for vendors.
    </p>

    ${statsBar}
    ${vendorsTable}
    ${trendChart}
    ${recentTable}
    ${howToSell}
    ${related}

    <div class="mt-12 border-t border-gray-200 pt-6 text-xs text-gray-500">
      <h2 class="font-semibold mb-1">About This Data</h2>
      <p>
        Data sourced from <a href="https://usaspending.gov" class="text-blue-600 hover:underline" rel="noopener">USASpending.gov</a>
        via the Federal Procurement Data System (FPDS). Includes procurement contracts with award amounts ≤ $10,000
        (federal micro-purchase threshold). Updated weekly. Fiscal year runs October 1 – September 30.
      </p>
    </div>`;

  return layout(
    { title, description, canonicalPath: `/agency/${agencySlug}/${pscSlug}`, structuredData },
    body
  );
}

function statCard(label: string, value: string, valueClass = 'text-gray-900'): string {
  return `<div class="bg-white border border-gray-200 rounded p-4 text-center">
    <div class="text-xs text-gray-500 uppercase tracking-wide mb-1">${escapeHtml(label)}</div>
    <div class="text-xl font-bold ${valueClass}">${escapeHtml(value)}</div>
  </div>`;
}

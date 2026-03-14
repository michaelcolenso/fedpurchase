import { layout, escapeHtml } from './layout';
import { formatCurrency, formatNumber } from '../lib/format';

export interface AgencyCategory {
  categoryName: string;
  categorySlug: string;
  totalAmount: number;
  transactionCount: number;
}

export interface AgencyPageData {
  agencyName: string;
  agencySlug: string;
  abbreviation: string | null;
  fiscalYear: number;
  totalAmount: number;
  transactionCount: number;
  topCategories: AgencyCategory[];
  topVendors: Array<{ name: string; totalAmount: number; transactionCount: number }>;
}

export function renderAgencyPage(data: AgencyPageData): string {
  const { agencyName, agencySlug, abbreviation, fiscalYear, totalAmount, transactionCount, topCategories, topVendors } = data;

  const displayName = abbreviation ? `${agencyName} (${abbreviation})` : agencyName;
  const title = `${displayName} Micro-Purchase Spending — GovPurchase Intel`;
  const description = `FY${fiscalYear}: ${displayName} made ${formatNumber(transactionCount)} micro-purchase transactions totaling ${formatCurrency(totalAmount)}. Top product categories and vendors.`;

  const categoriesSection = topCategories.length > 0 ? `
    <h2 class="text-xl font-semibold mt-8 mb-3">Top Product Categories</h2>
    <div class="grid md:grid-cols-2 gap-3">
      ${topCategories.map((c) => `
      <a href="/agency/${agencySlug}/${c.categorySlug}"
         class="block bg-white border border-gray-200 rounded p-4 hover:border-blue-400 transition">
        <div class="font-medium">${escapeHtml(c.categoryName ?? c.categorySlug)}</div>
        <div class="text-sm text-gray-600 mt-1">
          ${formatCurrency(c.totalAmount)} · ${formatNumber(c.transactionCount)} transactions
        </div>
      </a>`).join('')}
    </div>` : '<p class="text-gray-500 mt-4">No category data available yet.</p>';

  const vendorsSection = topVendors.length > 0 ? `
    <h2 class="text-xl font-semibold mt-8 mb-3">Top Vendors</h2>
    <div class="overflow-x-auto">
      <table class="w-full text-sm border border-gray-200 rounded">
        <thead class="bg-gray-100">
          <tr>
            <th class="text-left p-3">Vendor</th>
            <th class="text-right p-3">Total Amount</th>
            <th class="text-right p-3">Transactions</th>
          </tr>
        </thead>
        <tbody>
          ${topVendors.map((v, i) => `
          <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}">
            <td class="p-3 font-medium">${escapeHtml(v.name)}</td>
            <td class="p-3 text-right">${formatCurrency(v.totalAmount)}</td>
            <td class="p-3 text-right">${formatNumber(v.transactionCount)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '';

  const body = `
    <nav class="text-sm text-gray-500 mb-4">
      <a href="/" class="hover:text-blue-700">Home</a> /
      <a href="/agency" class="hover:text-blue-700">Agencies</a> /
      <span>${escapeHtml(agencyName)}</span>
    </nav>

    <h1 class="text-2xl md:text-3xl font-bold mb-2">${escapeHtml(displayName)}</h1>
    <p class="text-gray-600 mb-4">Micro-Purchase Spending Overview — FY${fiscalYear}</p>

    <div class="grid grid-cols-2 gap-4 my-6">
      <div class="bg-white border border-gray-200 rounded p-4 text-center">
        <div class="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Spend</div>
        <div class="text-2xl font-bold">${formatCurrency(totalAmount)}</div>
      </div>
      <div class="bg-white border border-gray-200 rounded p-4 text-center">
        <div class="text-xs text-gray-500 uppercase tracking-wide mb-1">Transactions</div>
        <div class="text-2xl font-bold">${formatNumber(transactionCount)}</div>
      </div>
    </div>

    ${categoriesSection}
    ${vendorsSection}`;

  return layout({ title, description, canonicalPath: `/agency/${agencySlug}` }, body);
}

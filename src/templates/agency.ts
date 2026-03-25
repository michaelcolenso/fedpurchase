import { layout, escapeHtml, statCard, breadcrumb, inlineBar } from './layout';
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

  const maxCatAmount = Math.max(...topCategories.map((c) => c.totalAmount), 1);
  const maxVendorAmount = Math.max(...topVendors.map((v) => v.totalAmount), 1);

  const categoriesSection = topCategories.length > 0 ? `
    <h2 class="text-lg font-semibold mt-8 mb-3">Top Product Categories</h2>
    <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 border-b border-gray-200">
          <tr>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Category</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600">Spend</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600">Transactions</th>
          </tr>
        </thead>
        <tbody>
          ${topCategories.map((c, i) => `
          <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors">
            <td class="px-4 py-3">
              <a href="/agency/${agencySlug}/${c.categorySlug}" class="font-medium text-blue-700 hover:underline">
                ${escapeHtml(c.categoryName ?? c.categorySlug)}
              </a>
            </td>
            <td class="px-4 py-3 text-right">
              <div class="flex items-center justify-end gap-2">
                ${inlineBar(c.totalAmount, maxCatAmount)}
                <span>${formatCurrency(c.totalAmount)}</span>
              </div>
            </td>
            <td class="px-4 py-3 text-right text-gray-600">${formatNumber(c.transactionCount)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : `<p class="text-gray-500 mt-4 text-sm">No category data available yet.</p>`;

  const vendorsSection = topVendors.length > 0 ? `
    <h2 class="text-lg font-semibold mt-8 mb-3">Top Vendors</h2>
    <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 border-b border-gray-200">
          <tr>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Vendor</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600">Total Amount</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600">Transactions</th>
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
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '';

  const body = `
    ${breadcrumb([
      { label: 'Home', href: '/' },
      { label: 'Agencies', href: '/agency' },
      { label: agencyName },
    ])}

    <div class="mb-6">
      <h1 class="text-2xl md:text-3xl font-bold text-gray-900">${escapeHtml(displayName)}</h1>
      <p class="text-sm text-gray-500 mt-1">Micro-Purchase Spending — FY${fiscalYear}</p>
    </div>

    <div class="grid grid-cols-2 gap-4 mb-8">
      ${statCard('Total Spend', formatCurrency(totalAmount), `FY${fiscalYear}`)}
      ${statCard('Transactions', formatNumber(transactionCount), 'micro-purchases')}
    </div>

    ${categoriesSection}
    ${vendorsSection}`;

  return layout({ title, description, canonicalPath: `/agency/${agencySlug}` }, body);
}

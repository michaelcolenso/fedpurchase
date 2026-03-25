import { layout, escapeHtml, statCard, breadcrumb, inlineBar } from './layout';
import { formatCurrency, formatNumber } from '../lib/format';

export interface IndustryAgencyRow {
  agencyName: string;
  agencySlug: string;
  totalAmount: number;
  transactionCount: number;
  uniqueVendors: number;
}

export interface IndustryPageData {
  naicsCode: string;
  naicsDescription: string;
  sectorName: string | null;
  agencySlug?: string;
  agencyName?: string;
  fiscalYear: number;
  totalAmount: number;
  transactionCount: number;
  agencyBreakdown: IndustryAgencyRow[];
  topVendors: Array<{ name: string; totalAmount: number; transactionCount: number }>;
  relatedNaics: Array<{ code: string; description: string }>;
}

export function renderIndustryPage(data: IndustryPageData): string {
  const {
    naicsCode, naicsDescription, sectorName, agencySlug, agencyName,
    fiscalYear, totalAmount, transactionCount, agencyBreakdown, topVendors, relatedNaics,
  } = data;

  const pageTitle = agencyName
    ? `NAICS ${naicsCode} ${naicsDescription} — ${agencyName} Micro-Purchases`
    : `NAICS ${naicsCode} ${naicsDescription} — Federal Micro-Purchase Data`;

  const title = `${pageTitle} | GovPurchase Intel`;
  const description = agencyName
    ? `FY${fiscalYear}: ${agencyName} made ${formatNumber(transactionCount)} micro-purchases in NAICS ${naicsCode} (${naicsDescription}) totaling ${formatCurrency(totalAmount)}.`
    : `FY${fiscalYear}: Federal agencies made ${formatNumber(transactionCount)} micro-purchases in NAICS ${naicsCode} (${naicsDescription}) totaling ${formatCurrency(totalAmount)}.`;

  const canonicalPath = agencySlug
    ? `/industry/${naicsCode}/${agencySlug}`
    : `/industry/${naicsCode}`;

  const maxAgencyAmount = Math.max(...agencyBreakdown.map((a) => a.totalAmount), 1);
  const maxVendorAmount = Math.max(...topVendors.map((v) => v.totalAmount), 1);

  const agencyTable = agencyBreakdown.length > 0 ? `
    <h2 class="text-lg font-semibold mt-8 mb-3">Agency Breakdown</h2>
    <div class="bg-white border border-gray-200 rounded-lg overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 border-b border-gray-200">
          <tr>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Agency</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600">Total Spend</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600">Transactions</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600">Vendors</th>
          </tr>
        </thead>
        <tbody>
          ${agencyBreakdown.map((a, i) => `
          <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors">
            <td class="px-4 py-3">
              <a href="/industry/${naicsCode}/${a.agencySlug}" class="font-medium text-blue-700 hover:underline">${escapeHtml(a.agencyName)}</a>
            </td>
            <td class="px-4 py-3 text-right">
              <div class="flex items-center justify-end gap-2">
                ${inlineBar(a.totalAmount, maxAgencyAmount)}
                <span>${formatCurrency(a.totalAmount)}</span>
              </div>
            </td>
            <td class="px-4 py-3 text-right text-gray-600">${formatNumber(a.transactionCount)}</td>
            <td class="px-4 py-3 text-right text-gray-600">${formatNumber(a.uniqueVendors)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '';

  const vendorsTable = topVendors.length > 0 ? `
    <h2 class="text-lg font-semibold mt-8 mb-3">Top Vendors</h2>
    <div class="bg-white border border-gray-200 rounded-lg overflow-x-auto">
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

  const relatedSection = relatedNaics.length > 0 ? `
    <h2 class="text-lg font-semibold mt-8 mb-3">Related Industries</h2>
    <div class="flex flex-wrap gap-2">
      ${relatedNaics.map((n) =>
        `<a href="/industry/${n.code}" class="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm hover:border-blue-400 hover:text-blue-700 transition-colors">
          <span class="font-mono text-gray-500 text-xs">${escapeHtml(n.code)}</span>
          <span class="ml-1">${escapeHtml(n.description)}</span>
        </a>`
      ).join('')}
    </div>` : '';

  const crumbs = agencySlug
    ? [
        { label: 'Home', href: '/' },
        { label: 'Industries', href: '/industry' },
        { label: `NAICS ${naicsCode}`, href: `/industry/${naicsCode}` },
        { label: agencyName ?? '' },
      ]
    : [
        { label: 'Home', href: '/' },
        { label: 'Industries', href: '/industry' },
        { label: `NAICS ${naicsCode}` },
      ];

  const body = `
    ${breadcrumb(crumbs)}

    <div class="mb-6">
      <h1 class="text-2xl md:text-3xl font-bold text-gray-900">
        NAICS ${escapeHtml(naicsCode)}: ${escapeHtml(naicsDescription)}
        ${agencyName ? `<span class="text-gray-400 font-normal">— ${escapeHtml(agencyName)}</span>` : ''}
      </h1>
      ${sectorName ? `<p class="text-sm text-gray-500 mt-1">Sector: ${escapeHtml(sectorName)}</p>` : ''}
    </div>

    <div class="grid grid-cols-2 gap-4 mb-8">
      ${statCard('Total Spend', formatCurrency(totalAmount), `FY${fiscalYear}`)}
      ${statCard('Transactions', formatNumber(transactionCount), 'micro-purchases')}
    </div>

    ${agencyTable}
    ${vendorsTable}
    ${relatedSection}`;

  return layout({ title, description, canonicalPath }, body);
}

import { layout, escapeHtml } from './layout';
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

  const agencyTable = agencyBreakdown.length > 0 ? `
    <h2 class="text-xl font-semibold mt-8 mb-3">Agency Breakdown</h2>
    <div class="overflow-x-auto">
      <table class="w-full text-sm border border-gray-200 rounded">
        <thead class="bg-gray-100">
          <tr>
            <th class="text-left p-3">Agency</th>
            <th class="text-right p-3">Total Spend</th>
            <th class="text-right p-3">Transactions</th>
            <th class="text-right p-3">Vendors</th>
          </tr>
        </thead>
        <tbody>
          ${agencyBreakdown.map((a, i) => `
          <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}">
            <td class="p-3">
              <a href="/industry/${naicsCode}/${a.agencySlug}" class="text-blue-600 hover:underline">${escapeHtml(a.agencyName)}</a>
            </td>
            <td class="p-3 text-right">${formatCurrency(a.totalAmount)}</td>
            <td class="p-3 text-right">${formatNumber(a.transactionCount)}</td>
            <td class="p-3 text-right">${formatNumber(a.uniqueVendors)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '';

  const vendorsTable = topVendors.length > 0 ? `
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

  const relatedSection = relatedNaics.length > 0 ? `
    <h2 class="text-xl font-semibold mt-8 mb-3">Related Industries</h2>
    <div class="flex flex-wrap gap-2">
      ${relatedNaics.map((n) =>
        `<a href="/industry/${n.code}" class="px-3 py-1 bg-gray-100 rounded text-sm hover:bg-gray-200">${escapeHtml(n.code)}: ${escapeHtml(n.description)}</a>`
      ).join('')}
    </div>` : '';

  const body = `
    <nav class="text-sm text-gray-500 mb-4">
      <a href="/" class="hover:text-blue-700">Home</a> /
      <a href="/industry" class="hover:text-blue-700">Industries</a> /
      ${agencySlug ? `<a href="/industry/${naicsCode}" class="hover:text-blue-700">NAICS ${naicsCode}</a> / <span>${escapeHtml(agencyName ?? '')}</span>` : `<span>NAICS ${naicsCode}</span>`}
    </nav>

    <h1 class="text-2xl md:text-3xl font-bold mb-1">
      NAICS ${escapeHtml(naicsCode)}: ${escapeHtml(naicsDescription)}
      ${agencyName ? ` — ${escapeHtml(agencyName)}` : ''}
    </h1>
    ${sectorName ? `<p class="text-gray-500 mb-4">Sector: ${escapeHtml(sectorName)}</p>` : ''}

    <div class="grid grid-cols-2 gap-4 my-6">
      <div class="bg-white border border-gray-200 rounded p-4 text-center">
        <div class="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Spend (FY${fiscalYear})</div>
        <div class="text-2xl font-bold">${formatCurrency(totalAmount)}</div>
      </div>
      <div class="bg-white border border-gray-200 rounded p-4 text-center">
        <div class="text-xs text-gray-500 uppercase tracking-wide mb-1">Transactions</div>
        <div class="text-2xl font-bold">${formatNumber(transactionCount)}</div>
      </div>
    </div>

    ${agencyTable}
    ${vendorsTable}
    ${relatedSection}`;

  return layout({ title, description, canonicalPath }, body);
}

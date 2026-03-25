import { layout, escapeHtml, statCard, breadcrumb, inlineBar } from './layout';
import { formatCurrency, formatNumber, formatDate } from '../lib/format';

export interface VendorAgencyRow {
  agencyName: string;
  agencySlug: string;
  totalAmount: number;
  transactionCount: number;
}

export interface VendorPageData {
  vendorName: string;
  vendorSlug: string;
  uei: string;
  totalAmount: number;
  totalTransactions: number;
  agencyCount: number;
  topPscCategory: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  agencyBreakdown: VendorAgencyRow[];
  recentTransactions: Array<{
    actionDate: string;
    amount: number;
    agencyName: string | null;
    description: string | null;
  }>;
}

export function renderVendorPage(data: VendorPageData): string {
  const {
    vendorName, vendorSlug, uei, totalAmount, totalTransactions,
    agencyCount, topPscCategory, firstSeen, lastSeen,
    agencyBreakdown, recentTransactions,
  } = data;

  const title = `${vendorName} — Federal Micro-Purchase Profile`;
  const description = `${vendorName} (UEI: ${uei}) has received ${formatCurrency(totalAmount)} across ${formatNumber(totalTransactions)} federal micro-purchase transactions from ${agencyCount} agencies.`;

  const maxAgencyAmount = Math.max(...agencyBreakdown.map((a) => a.totalAmount), 1);

  const activeRange = firstSeen && lastSeen
    ? `${formatDate(firstSeen)} – ${formatDate(lastSeen)}`
    : firstSeen ? `Since ${formatDate(firstSeen)}` : null;

  const agencyTable = agencyBreakdown.length > 0 ? `
    <h2 class="text-lg font-semibold mt-8 mb-3">Agency Customers</h2>
    <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <table class="w-full text-sm" data-sortable>
        <thead class="bg-gray-50 border-b border-gray-200">
          <tr>
            <th class="text-left px-4 py-3 font-medium text-gray-600" data-sort="text">Agency</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600" data-sort="currency">Total Amount</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600" data-sort="number">Transactions</th>
          </tr>
        </thead>
        <tbody>
          ${agencyBreakdown.map((a, i) => `
          <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors">
            <td class="px-4 py-3">
              <a href="/agency/${a.agencySlug}" class="font-medium text-blue-700 hover:underline">${escapeHtml(a.agencyName)}</a>
            </td>
            <td class="px-4 py-3 text-right">
              <div class="flex items-center justify-end gap-2">
                ${inlineBar(a.totalAmount, maxAgencyAmount)}
                <span>${formatCurrency(a.totalAmount)}</span>
              </div>
            </td>
            <td class="px-4 py-3 text-right text-gray-600">${formatNumber(a.transactionCount)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '';

  const recentTable = recentTransactions.length > 0 ? `
    <h2 class="text-lg font-semibold mt-8 mb-3">Recent Transactions</h2>
    <div class="bg-white border border-gray-200 rounded-lg overflow-x-auto">
      <table class="w-full text-sm" data-sortable>
        <thead class="bg-gray-50 border-b border-gray-200">
          <tr>
            <th class="text-left px-4 py-3 font-medium text-gray-600" data-sort="text">Date</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600" data-sort="currency">Amount</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600" data-sort="text">Agency</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Description</th>
          </tr>
        </thead>
        <tbody>
          ${recentTransactions.map((t, i) => `
          <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}">
            <td class="px-4 py-3 whitespace-nowrap text-gray-600">${escapeHtml(formatDate(t.actionDate))}</td>
            <td class="px-4 py-3 text-right font-medium whitespace-nowrap">${formatCurrency(t.amount)}</td>
            <td class="px-4 py-3 text-gray-700">${escapeHtml(t.agencyName ?? '—')}</td>
            <td class="px-4 py-3 text-gray-500 text-xs">${escapeHtml(t.description ?? '—')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '';

  const body = `
    ${breadcrumb([
      { label: 'Home', href: '/' },
      { label: 'Vendors', href: '/vendor' },
      { label: vendorName },
    ])}

    <div class="mb-6">
      <h1 class="text-2xl md:text-3xl font-bold text-gray-900">${escapeHtml(vendorName)}</h1>
      <div class="flex flex-wrap items-center gap-3 mt-1.5">
        <span class="text-xs text-gray-500 font-mono bg-gray-100 px-2 py-0.5 rounded">UEI: ${escapeHtml(uei)}</span>
        ${activeRange ? `<span class="text-xs text-gray-500">Active: ${escapeHtml(activeRange)}</span>` : ''}
        ${topPscCategory ? `<span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">${escapeHtml(topPscCategory)}</span>` : ''}
      </div>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      ${statCard('Total Received', formatCurrency(totalAmount))}
      ${statCard('Transactions', formatNumber(totalTransactions))}
      ${statCard('Agencies', String(agencyCount))}
      ${statCard('Top Category', topPscCategory ?? '—')}
    </div>

    ${agencyTable}
    ${recentTable}`;

  return layout({ title, description, canonicalPath: `/vendor/${vendorSlug}` }, body);
}

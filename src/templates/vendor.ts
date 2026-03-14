import { layout, escapeHtml } from './layout';
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

  const agencyTable = agencyBreakdown.length > 0 ? `
    <h2 class="text-xl font-semibold mt-8 mb-3">Agency Customers</h2>
    <div class="overflow-x-auto">
      <table class="w-full text-sm border border-gray-200 rounded">
        <thead class="bg-gray-100">
          <tr>
            <th class="text-left p-3">Agency</th>
            <th class="text-right p-3">Total Amount</th>
            <th class="text-right p-3">Transactions</th>
          </tr>
        </thead>
        <tbody>
          ${agencyBreakdown.map((a, i) => `
          <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}">
            <td class="p-3">
              <a href="/agency/${a.agencySlug}" class="text-blue-600 hover:underline">${escapeHtml(a.agencyName)}</a>
            </td>
            <td class="p-3 text-right">${formatCurrency(a.totalAmount)}</td>
            <td class="p-3 text-right">${formatNumber(a.transactionCount)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '';

  const recentTable = recentTransactions.length > 0 ? `
    <h2 class="text-xl font-semibold mt-8 mb-3">Recent Transactions</h2>
    <div class="overflow-x-auto">
      <table class="w-full text-sm border border-gray-200 rounded">
        <thead class="bg-gray-100">
          <tr>
            <th class="text-left p-3">Date</th>
            <th class="text-right p-3">Amount</th>
            <th class="text-left p-3">Agency</th>
            <th class="text-left p-3">Description</th>
          </tr>
        </thead>
        <tbody>
          ${recentTransactions.map((t, i) => `
          <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}">
            <td class="p-3 whitespace-nowrap">${escapeHtml(formatDate(t.actionDate))}</td>
            <td class="p-3 text-right whitespace-nowrap">${formatCurrency(t.amount)}</td>
            <td class="p-3">${escapeHtml(t.agencyName ?? '—')}</td>
            <td class="p-3 text-gray-600">${escapeHtml(t.description ?? '—')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '';

  const body = `
    <nav class="text-sm text-gray-500 mb-4">
      <a href="/" class="hover:text-blue-700">Home</a> /
      <a href="/vendor" class="hover:text-blue-700">Vendors</a> /
      <span>${escapeHtml(vendorName)}</span>
    </nav>

    <h1 class="text-2xl md:text-3xl font-bold mb-1">${escapeHtml(vendorName)}</h1>
    <p class="text-sm text-gray-500 mb-4">UEI: ${escapeHtml(uei)}</p>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 my-6">
      <div class="bg-white border border-gray-200 rounded p-4 text-center">
        <div class="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Received</div>
        <div class="text-xl font-bold">${formatCurrency(totalAmount)}</div>
      </div>
      <div class="bg-white border border-gray-200 rounded p-4 text-center">
        <div class="text-xs text-gray-500 uppercase tracking-wide mb-1">Transactions</div>
        <div class="text-xl font-bold">${formatNumber(totalTransactions)}</div>
      </div>
      <div class="bg-white border border-gray-200 rounded p-4 text-center">
        <div class="text-xs text-gray-500 uppercase tracking-wide mb-1">Agencies</div>
        <div class="text-xl font-bold">${agencyCount}</div>
      </div>
      <div class="bg-white border border-gray-200 rounded p-4 text-center">
        <div class="text-xs text-gray-500 uppercase tracking-wide mb-1">Top Category</div>
        <div class="text-sm font-semibold">${escapeHtml(topPscCategory ?? '—')}</div>
      </div>
    </div>

    ${firstSeen || lastSeen ? `
    <p class="text-sm text-gray-600 mb-4">
      Active: ${escapeHtml(formatDate(firstSeen))} – ${escapeHtml(formatDate(lastSeen))}
    </p>` : ''}

    ${agencyTable}
    ${recentTable}`;

  return layout({ title, description, canonicalPath: `/vendor/${vendorSlug}` }, body);
}

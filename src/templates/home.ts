import { layout, escapeHtml, statCard, inlineBar } from './layout';
import { formatCurrency, formatNumber } from '../lib/format';

export interface TopAgencyEntry {
  name: string;
  slug: string;
  abbreviation: string | null;
  totalAmount: number;
  transactionCount: number;
}

export interface HomePageData {
  fiscalYear: number;
  totalAmount: number;
  totalTransactions: number;
  topAgencies: TopAgencyEntry[];
  topCategories: Array<{ name: string; slug: string; totalAmount: number }>;
}

export function renderHomePage(data: HomePageData): string {
  const { fiscalYear, totalAmount, totalTransactions, topAgencies, topCategories } = data;

  const title = 'GovPurchase Intel — Federal Micro-Purchase Intelligence for Government Contractors';
  const description = 'Discover which federal agencies are buying what products under $10,000. Actionable intelligence for small business government contractors.';

  const maxAgencyAmount = Math.max(...topAgencies.map((a) => a.totalAmount), 1);

  const agencyCards = topAgencies.map((a) => `
    <a href="/agency/${a.slug}"
       class="agency-card block bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-400 hover:shadow-sm transition"
       data-name="${escapeHtml(a.name.toLowerCase())}">
      <div class="font-semibold text-gray-900 leading-snug">
        ${escapeHtml(a.name)}${a.abbreviation ? `<span class="text-gray-400 font-normal ml-1">(${a.abbreviation})</span>` : ''}
      </div>
      <div class="flex items-center gap-2 mt-2">
        ${inlineBar(a.totalAmount, maxAgencyAmount)}
        <span class="text-sm font-medium text-gray-700">${formatCurrency(a.totalAmount)}</span>
      </div>
      <div class="text-xs text-gray-400 mt-0.5">${formatNumber(a.transactionCount)} transactions</div>
    </a>`).join('');

  // Filter out un-named or generic category placeholders
  const validCategories = topCategories.filter(
    (c) => c.name && c.name !== 'Product' && c.name !== 'Service' && c.slug !== 'product' && c.slug !== 'service'
  );
  const maxCatAmount = Math.max(...validCategories.map((c) => c.totalAmount), 1);

  const categoriesSection = validCategories.length > 0 ? `
    <h2 class="text-xl font-semibold mb-4">Top Product Categories</h2>
    <div class="bg-white border border-gray-200 rounded-lg overflow-hidden mb-10">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 border-b border-gray-200">
          <tr>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Category</th>
            <th class="text-right px-4 py-3 font-medium text-gray-600">Total Spend</th>
          </tr>
        </thead>
        <tbody>
          ${validCategories.map((c, i) => `
          <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors">
            <td class="px-4 py-3">
              <a href="/agency?category=${c.slug}" class="font-medium text-blue-700 hover:underline">${escapeHtml(c.name)}</a>
            </td>
            <td class="px-4 py-3 text-right">
              <div class="flex items-center justify-end gap-2">
                ${inlineBar(c.totalAmount, maxCatAmount)}
                <span class="font-medium">${formatCurrency(c.totalAmount)}</span>
              </div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '';

  const body = `
    <div class="bg-white border border-gray-200 rounded-xl px-6 py-10 mb-8 text-center">
      <div class="inline-block bg-blue-100 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full mb-4 uppercase tracking-wide">FY${fiscalYear} Data</div>
      <h1 class="text-3xl md:text-4xl font-bold text-gray-900 mb-3">Federal Micro-Purchase Intelligence</h1>
      <p class="text-lg text-gray-500 max-w-2xl mx-auto mb-8">
        See exactly what federal agencies are buying under the $10,000 threshold —
        and which vendors are winning those contracts.
      </p>
      <div class="grid grid-cols-2 max-w-sm mx-auto gap-4">
        ${statCard('Total Tracked', formatCurrency(totalAmount), `FY${fiscalYear}`)}
        ${statCard('Transactions', formatNumber(totalTransactions), 'micro-purchases')}
      </div>
    </div>

    <div class="mb-6">
      <input
        id="agency-search"
        type="search"
        placeholder="Search agencies..."
        class="w-full md:w-72 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500 bg-white"
        oninput="filterAgencies(this.value)"
        autocomplete="off"
      >
    </div>

    <h2 class="text-xl font-semibold mb-4">Top Agencies by Micro-Purchase Volume</h2>
    <div id="agency-grid" class="grid md:grid-cols-2 lg:grid-cols-3 gap-3 mb-10">
      ${agencyCards}
    </div>
    <p id="no-results" class="text-gray-500 mb-10 hidden">No agencies match your search.</p>

    ${categoriesSection}

    <div class="grid md:grid-cols-2 gap-6 mb-4">
      <div class="bg-blue-50 border border-blue-100 rounded-xl p-6">
        <h2 class="text-base font-semibold text-blue-900 mb-2">What is a micro-purchase?</h2>
        <p class="text-sm text-blue-800 leading-relaxed">
          Federal agencies can buy goods and services under $10,000 without competitive bidding
          using a government purchase card. These transactions are reported to USASpending.gov
          and represent a huge, largely overlooked market for small government contractors.
        </p>
      </div>
      <div class="bg-gray-900 text-white rounded-xl p-6">
        <h2 class="text-base font-bold mb-1">Get Weekly Micro-Purchase Alerts</h2>
        <p class="text-sm text-gray-300 mb-4">
          A weekly digest of what agencies are buying in your product category.
        </p>
        <form id="subscribe-form" class="flex flex-col sm:flex-row gap-2"
              onsubmit="handleSubscribe(event)">
          <input
            type="email"
            name="email"
            placeholder="your@email.com"
            required
            class="flex-1 px-3 py-2 rounded text-gray-900 text-sm focus:outline-none"
          >
          <button type="submit"
            class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded transition whitespace-nowrap">
            Subscribe
          </button>
        </form>
        <p id="subscribe-msg" class="mt-2 text-xs text-green-400 hidden"></p>
      </div>
    </div>

    <script>
      function filterAgencies(q) {
        var cards = document.querySelectorAll('.agency-card');
        var term = q.toLowerCase().trim();
        var visible = 0;
        cards.forEach(function(card) {
          var match = !term || card.dataset.name.indexOf(term) !== -1;
          card.style.display = match ? '' : 'none';
          if (match) visible++;
        });
        document.getElementById('no-results').classList.toggle('hidden', visible > 0);
      }

      function handleSubscribe(e) {
        e.preventDefault();
        var form = e.target;
        var email = form.querySelector('[name=email]').value;
        var msg = document.getElementById('subscribe-msg');
        fetch('/subscribe', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({email: email})
        }).then(function(r) { return r.json(); }).then(function(data) {
          msg.textContent = data.message || 'You\'re subscribed!';
          msg.classList.remove('hidden');
          form.reset();
        }).catch(function() {
          msg.textContent = 'Something went wrong. Please try again.';
          msg.classList.remove('hidden');
        });
      }
    </script>`;

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'GovPurchase Intel',
    url: 'https://fedpurchase.io',
    description,
  };

  return layout({ title, description, canonicalPath: '/', structuredData }, body);
}

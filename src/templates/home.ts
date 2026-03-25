import { layout, escapeHtml } from './layout';
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

  const agencyCards = topAgencies.map((a) => `
    <a href="/agency/${a.slug}"
       class="agency-card block bg-white border border-gray-200 rounded p-4 hover:border-blue-400 transition"
       data-name="${escapeHtml(a.name.toLowerCase())}">
      <div class="font-semibold">${escapeHtml(a.name)}${a.abbreviation ? ` <span class="text-gray-500 font-normal">(${a.abbreviation})</span>` : ''}</div>
      <div class="text-sm text-gray-600 mt-1">
        ${formatCurrency(a.totalAmount)} · ${formatNumber(a.transactionCount)} transactions
      </div>
    </a>`).join('');

  const categoryPills = topCategories.map((c) => `
    <a href="/agency?category=${c.slug}"
       class="px-3 py-2 bg-white border border-gray-200 rounded text-sm hover:border-blue-400 transition">
      ${escapeHtml(c.name)}
      <span class="text-gray-500 ml-1">${formatCurrency(c.totalAmount)}</span>
    </a>`).join('');

  const body = `
    <div class="text-center py-10">
      <h1 class="text-3xl md:text-4xl font-bold mb-3">Federal Micro-Purchase Intelligence</h1>
      <p class="text-lg text-gray-600 max-w-2xl mx-auto mb-6">
        See exactly what federal agencies are buying under the $10,000 threshold —
        and which vendors are winning those contracts.
      </p>
      <div class="flex justify-center gap-6 text-sm text-gray-500 mb-8">
        <span><strong class="text-gray-900">${formatCurrency(totalAmount)}</strong> tracked in FY${fiscalYear}</span>
        <span><strong class="text-gray-900">${formatNumber(totalTransactions)}</strong> transactions</span>
      </div>
    </div>

    <div class="mb-6">
      <input
        id="agency-search"
        type="search"
        placeholder="Search agencies..."
        class="w-full md:w-80 px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
        oninput="filterAgencies(this.value)"
      >
    </div>

    <h2 class="text-xl font-semibold mb-4">Top Agencies by Micro-Purchase Volume</h2>
    <div id="agency-grid" class="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
      ${agencyCards}
    </div>
    <p id="no-results" class="text-gray-500 mb-10 hidden">No agencies match your search.</p>

    ${topCategories.length > 0 ? `
    <h2 class="text-xl font-semibold mb-4">Top Product Categories</h2>
    <div class="flex flex-wrap gap-2 mb-10">
      ${categoryPills}
    </div>` : ''}

    <div class="bg-blue-50 border border-blue-200 rounded p-6 text-center">
      <h2 class="text-lg font-semibold mb-2">What is a micro-purchase?</h2>
      <p class="text-gray-700 max-w-2xl mx-auto">
        Federal agencies can buy goods and services under $10,000 without competitive bidding
        using a government purchase card. These transactions are reported to USASpending.gov
        and represent a huge, largely overlooked market for small government contractors.
      </p>
    </div>

    <div class="mt-12 bg-gray-900 text-white rounded-lg p-8 text-center">
      <h2 class="text-xl font-bold mb-2">Get Weekly Micro-Purchase Alerts</h2>
      <p class="text-gray-300 mb-6 max-w-md mx-auto">
        New transactions posted every week. Get a digest of what agencies are buying in your product category.
      </p>
      <form id="subscribe-form" class="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto"
            onsubmit="handleSubscribe(event)">
        <input
          type="email"
          name="email"
          placeholder="your@email.com"
          required
          class="flex-1 px-4 py-2 rounded text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
        <button type="submit"
          class="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded transition">
          Subscribe
        </button>
      </form>
      <p id="subscribe-msg" class="mt-3 text-sm text-green-400 hidden"></p>
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

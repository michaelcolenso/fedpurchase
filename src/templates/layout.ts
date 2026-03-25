const BASE_URL = 'https://fedpurchase.io';

export interface LayoutOptions {
  title: string;
  description: string;
  canonicalPath: string;
  structuredData?: object;
}

export function layout(options: LayoutOptions, body: string): string {
  const { title, description, canonicalPath, structuredData } = options;
  const canonical = `${BASE_URL}${canonicalPath}`;

  const jsonLd = structuredData
    ? `<script type="application/ld+json">${JSON.stringify(structuredData)}</script>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:type" content="website">
  <meta name="robots" content="index, follow">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2/dist/tailwind.min.css" rel="stylesheet">
  <script defer data-domain="fedpurchase.io" src="https://plausible.io/js/script.js"></script>
  <style>body { font-family: 'Inter', sans-serif; }</style>
  ${jsonLd}
</head>
<body class="bg-gray-50 text-gray-900 antialiased">

  <nav class="bg-white border-b border-gray-200 sticky top-0 z-10">
    <div class="max-w-6xl mx-auto px-4">
      <div class="flex items-center justify-between h-14">
        <a href="/" class="font-bold text-blue-700 text-base whitespace-nowrap mr-6">GovPurchase Intel</a>
        <div class="flex items-center overflow-x-auto text-sm font-medium" style="gap:2px">
          <a href="/" class="px-3 py-1.5 rounded text-gray-600 hover:text-blue-700 hover:bg-blue-50 whitespace-nowrap transition-colors">Home</a>
          <a href="/agency" class="px-3 py-1.5 rounded text-gray-600 hover:text-blue-700 hover:bg-blue-50 whitespace-nowrap transition-colors">Agencies</a>
          <a href="/vendor" class="px-3 py-1.5 rounded text-gray-600 hover:text-blue-700 hover:bg-blue-50 whitespace-nowrap transition-colors">Vendors</a>
          <a href="/industry" class="px-3 py-1.5 rounded text-gray-600 hover:text-blue-700 hover:bg-blue-50 whitespace-nowrap transition-colors">Industries</a>
          <a href="/insights" class="px-3 py-1.5 rounded text-gray-600 hover:text-blue-700 hover:bg-blue-50 whitespace-nowrap transition-colors">Insights</a>
        </div>
      </div>
    </div>
  </nav>

  <main class="max-w-6xl mx-auto px-4 py-8">
    ${body}
  </main>

  <footer class="border-t border-gray-200 mt-16 py-10 bg-white">
    <div class="max-w-6xl mx-auto px-4">
      <div class="flex flex-col md:flex-row justify-between gap-8 text-sm text-gray-500">
        <div>
          <div class="font-semibold text-gray-700 mb-1">GovPurchase Intel</div>
          <p class="max-w-xs leading-relaxed">Federal micro-purchase intelligence for small business government contractors.</p>
        </div>
        <div class="flex gap-12">
          <div>
            <div class="font-semibold text-gray-700 mb-2">Explore</div>
            <ul class="space-y-1.5">
              <li><a href="/agency" class="hover:text-blue-600 transition-colors">Agencies</a></li>
              <li><a href="/vendor" class="hover:text-blue-600 transition-colors">Vendors</a></li>
              <li><a href="/industry" class="hover:text-blue-600 transition-colors">Industries</a></li>
              <li><a href="/insights" class="hover:text-blue-600 transition-colors">Insights</a></li>
            </ul>
          </div>
          <div>
            <div class="font-semibold text-gray-700 mb-2">Data</div>
            <ul class="space-y-1.5">
              <li><a href="https://usaspending.gov" class="hover:text-blue-600 transition-colors" rel="noopener">USASpending.gov</a></li>
              <li><a href="/sitemap.xml" class="hover:text-blue-600 transition-colors">Sitemap</a></li>
            </ul>
          </div>
        </div>
      </div>
      <div class="mt-8 pt-6 border-t border-gray-100 text-xs text-gray-400">
        Data sourced from USASpending.gov via FPDS. Updated weekly. Not affiliated with the U.S. Government.
      </div>
    </div>
  </footer>

  <script>
    (function() {
      function initSortableTables() {
        document.querySelectorAll('table[data-sortable]').forEach(function(table) {
          var ths = Array.from(table.querySelectorAll('thead th'));
          ths.forEach(function(th, colIdx) {
            if (!th.dataset.sort) return;
            th.style.cursor = 'pointer';
            th.style.userSelect = 'none';
            var icon = document.createElement('span');
            icon.className = 'sort-icon';
            icon.style.cssText = 'margin-left:4px;opacity:0.35;font-size:0.7em';
            icon.textContent = '↕';
            th.appendChild(icon);
            th.addEventListener('click', function() {
              var asc = th.dataset.dir !== 'asc';
              ths.forEach(function(t) {
                delete t.dataset.dir;
                var ic = t.querySelector('.sort-icon');
                if (ic) { ic.textContent = '↕'; ic.style.opacity = '0.35'; }
              });
              th.dataset.dir = asc ? 'asc' : 'desc';
              var ic = th.querySelector('.sort-icon');
              if (ic) { ic.textContent = asc ? '↑' : '↓'; ic.style.opacity = '1'; }
              var tbody = table.querySelector('tbody');
              var rows = Array.from(tbody.querySelectorAll('tr'));
              var type = th.dataset.sort;
              rows.sort(function(a, b) {
                var ac = a.querySelectorAll('td')[colIdx];
                var bc = b.querySelectorAll('td')[colIdx];
                var at = ac ? ac.textContent.trim() : '';
                var bt = bc ? bc.textContent.trim() : '';
                var av, bv;
                if (type === 'currency' || type === 'number') {
                  av = parseFloat(at.replace(/[$,\s]/g, ''));
                  bv = parseFloat(bt.replace(/[$,\s]/g, ''));
                  if (isNaN(av)) av = asc ? Infinity : -Infinity;
                  if (isNaN(bv)) bv = asc ? Infinity : -Infinity;
                } else if (type === 'percent') {
                  av = parseFloat(at.replace(/[+%\s]/g, ''));
                  bv = parseFloat(bt.replace(/[+%\s]/g, ''));
                  if (isNaN(av)) av = asc ? Infinity : -Infinity;
                  if (isNaN(bv)) bv = asc ? Infinity : -Infinity;
                } else {
                  av = at.toLowerCase(); bv = bt.toLowerCase();
                }
                return av < bv ? (asc ? -1 : 1) : av > bv ? (asc ? 1 : -1) : 0;
              });
              rows.forEach(function(row, i) {
                row.className = row.className.replace(/\bbg-(?:white|gray-50)\b/g, '').trim() + ' ' + (i % 2 === 0 ? 'bg-white' : 'bg-gray-50');
                tbody.appendChild(row);
              });
            });
          });
        });
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSortableTables);
      } else {
        initSortableTables();
      }
    })();
  </script>
</body>
</html>`;
}

export function escapeHtml(str: string | null | undefined): string {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** KPI stat card */
export function statCard(label: string, value: string, sub?: string, valueClass = 'text-gray-900'): string {
  return `<div class="bg-white border border-gray-200 rounded-lg p-4">
    <div class="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">${escapeHtml(label)}</div>
    <div class="text-2xl font-bold ${valueClass}">${escapeHtml(value)}</div>
    ${sub ? `<div class="text-xs text-gray-400 mt-0.5">${escapeHtml(sub)}</div>` : ''}
  </div>`;
}

/** Breadcrumb nav */
export function breadcrumb(items: Array<{ label: string; href?: string }>): string {
  const parts = items.map((item, i) => {
    const isLast = i === items.length - 1;
    if (isLast || !item.href) {
      return `<span class="${isLast ? 'text-gray-700 font-medium' : 'text-gray-500'}">${escapeHtml(item.label)}</span>`;
    }
    return `<a href="${item.href}" class="text-gray-500 hover:text-blue-700 transition-colors">${escapeHtml(item.label)}</a>`;
  });
  return `<nav class="flex items-center flex-wrap gap-1.5 text-sm mb-5" aria-label="Breadcrumb">
    ${parts.join('<span class="text-gray-300">/</span>')}
  </nav>`;
}

/** Inline proportional bar (px-based, safe in all layout contexts) */
export function inlineBar(value: number, max: number, colorClass = 'bg-blue-400'): string {
  if (max <= 0) return '';
  const width = Math.max(3, Math.round((value / max) * 72));
  return `<span class="inline-block align-middle rounded h-2 ${colorClass} opacity-60" style="width:${width}px"></span>`;
}

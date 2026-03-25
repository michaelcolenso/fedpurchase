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
  <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2/dist/tailwind.min.css" rel="stylesheet">
  <script defer data-domain="fedpurchase.io" src="https://plausible.io/js/script.js"></script>
  ${jsonLd}
</head>
<body class="bg-gray-50 text-gray-900">
  <nav class="bg-white border-b border-gray-200">
    <div class="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
      <a href="/" class="font-bold text-blue-700 text-lg">GovPurchase Intel</a>
      <div class="flex gap-6 text-sm">
        <a href="/" class="text-gray-600 hover:text-blue-700">Home</a>
        <a href="/agency" class="text-gray-600 hover:text-blue-700">Agencies</a>
        <a href="/vendor" class="text-gray-600 hover:text-blue-700">Vendors</a>
        <a href="/industry" class="text-gray-600 hover:text-blue-700">Industries</a>
        <a href="/insights" class="text-gray-600 hover:text-blue-700">Insights</a>
      </div>
    </div>
  </nav>

  <main class="max-w-6xl mx-auto px-4 py-8">
    ${body}
  </main>

  <footer class="border-t border-gray-200 mt-16 py-8 text-center text-sm text-gray-500">
    <p>Data sourced from <a href="https://usaspending.gov" class="text-blue-600 hover:underline" rel="noopener">USASpending.gov</a>.
    Updated weekly. Not affiliated with the U.S. Government.</p>
    <p class="mt-2">
      <a href="/sitemap.xml" class="hover:underline">Sitemap</a>
    </p>
  </footer>
</body>
</html>`;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

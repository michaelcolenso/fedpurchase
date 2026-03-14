import { kvSet, cacheKeys, TTL_SITEMAP } from '../lib/cache';
import type { Env } from '../types';

const BASE_URL = 'https://fedpurchase.io';

function sitemapUrl(loc: string, lastmod?: string): string {
  return `  <url>\n    <loc>${loc}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n  </url>`;
}

function buildSitemap(urls: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
}

function buildSitemapIndex(sitemaps: string[]): string {
  const entries = sitemaps.map(
    (loc) => `  <sitemap>\n    <loc>${loc}</loc>\n  </sitemap>`
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</sitemapindex>`;
}

/**
 * Generate and cache all sitemaps in KV.
 */
export async function regenerateSitemaps(env: Env): Promise<void> {
  await Promise.all([
    generateAgencySitemap(env),
    generateVendorSitemap(env),
    generateIndustrySitemap(env),
  ]);

  // Write index sitemap
  const index = buildSitemapIndex([
    `${BASE_URL}/sitemap/agencies.xml`,
    `${BASE_URL}/sitemap/vendors.xml`,
    `${BASE_URL}/sitemap/industries.xml`,
  ]);
  await kvSet(env, cacheKeys.sitemap('index'), index, TTL_SITEMAP);
}

async function generateAgencySitemap(env: Env): Promise<void> {
  const rows = await env.DB.prepare(`
    SELECT a.slug AS agency_slug, r.category_slug, r.updated_at
    FROM agency_psc_rollups r
    JOIN agencies a ON r.agency_id = a.id
    WHERE r.category_slug IS NOT NULL
    GROUP BY a.slug, r.category_slug
    ORDER BY r.total_amount DESC
    LIMIT 50000
  `).all<{ agency_slug: string; category_slug: string; updated_at: string | null }>();

  const urls = rows.results.map((row) =>
    sitemapUrl(
      `${BASE_URL}/agency/${row.agency_slug}/${row.category_slug}`,
      row.updated_at ? row.updated_at.split('T')[0] : undefined
    )
  );

  // Add agency overview pages
  const agencyRows = await env.DB.prepare(`SELECT slug FROM agencies ORDER BY slug`).all<{ slug: string }>();
  for (const a of agencyRows.results) {
    urls.push(sitemapUrl(`${BASE_URL}/agency/${a.slug}`));
  }

  await kvSet(env, cacheKeys.sitemap('agencies'), buildSitemap(urls), TTL_SITEMAP);
}

async function generateVendorSitemap(env: Env): Promise<void> {
  const rows = await env.DB.prepare(`
    SELECT slug, updated_at FROM vendor_profiles
    ORDER BY total_micro_purchase_amount DESC
    LIMIT 50000
  `).all<{ slug: string; updated_at: string | null }>();

  const urls = rows.results.map((row) =>
    sitemapUrl(
      `${BASE_URL}/vendor/${row.slug}`,
      row.updated_at ? row.updated_at.split('T')[0] : undefined
    )
  );

  await kvSet(env, cacheKeys.sitemap('vendors'), buildSitemap(urls), TTL_SITEMAP);
}

async function generateIndustrySitemap(env: Env): Promise<void> {
  const rows = await env.DB.prepare(`
    SELECT n.code AS naics_code, a.slug AS agency_slug, r.updated_at
    FROM agency_naics_rollups r
    JOIN agencies a ON r.agency_id = a.id
    JOIN naics_codes n ON r.naics_code = n.code
    GROUP BY n.code, a.slug
    ORDER BY r.total_amount DESC
    LIMIT 50000
  `).all<{ naics_code: string; agency_slug: string; updated_at: string | null }>();

  const urls = rows.results.map((row) =>
    sitemapUrl(
      `${BASE_URL}/industry/${row.naics_code}/${row.agency_slug}`,
      row.updated_at ? row.updated_at.split('T')[0] : undefined
    )
  );

  await kvSet(env, cacheKeys.sitemap('industries'), buildSitemap(urls), TTL_SITEMAP);
}

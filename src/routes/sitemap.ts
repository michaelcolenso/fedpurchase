import type { Context } from 'hono';
import { kvGet, cacheKeys } from '../lib/cache';
import { regenerateSitemaps } from '../pipeline/sitemap';
import type { Env } from '../types';

/**
 * GET /sitemap.xml — Sitemap index
 */
export async function sitemapIndexHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const env = c.env;

  let xml = await kvGet(env, cacheKeys.sitemap('index'));
  if (!xml) {
    await regenerateSitemaps(env);
    xml = await kvGet(env, cacheKeys.sitemap('index'));
  }

  if (!xml) {
    // Fallback minimal sitemap
    xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://fedpurchase.io/sitemap/agencies.xml</loc></sitemap>
  <sitemap><loc>https://fedpurchase.io/sitemap/vendors.xml</loc></sitemap>
  <sitemap><loc>https://fedpurchase.io/sitemap/industries.xml</loc></sitemap>
</sitemapindex>`;
  }

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}

/**
 * GET /sitemap/:segment.xml — Segmented sitemaps
 */
export async function sitemapSegmentHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const segment = c.req.param('segment');
  const env = c.env;

  let xml = await kvGet(env, cacheKeys.sitemap(segment));
  if (!xml) {
    // Regenerate all on cache miss
    await regenerateSitemaps(env);
    xml = await kvGet(env, cacheKeys.sitemap(segment));
  }

  if (!xml) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}

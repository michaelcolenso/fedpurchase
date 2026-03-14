import type { Env } from '../types';

/**
 * Get a value from KV cache. Returns null if not found or on error.
 */
export async function kvGet(env: Env, key: string): Promise<string | null> {
  try {
    return await env.KV.get(key);
  } catch {
    return null;
  }
}

/**
 * Set a value in KV cache with optional TTL (seconds).
 */
export async function kvSet(env: Env, key: string, value: string, ttlSeconds?: number): Promise<void> {
  const opts = ttlSeconds ? { expirationTtl: ttlSeconds } : undefined;
  await env.KV.put(key, value, opts);
}

/**
 * Delete a KV key.
 */
export async function kvDelete(env: Env, key: string): Promise<void> {
  await env.KV.delete(key);
}

// TTL constants
export const TTL_PAGE = 60 * 60 * 24;       // 24 hours for rendered pages
export const TTL_AI = 60 * 60 * 24 * 30;    // 30 days for AI-generated copy
export const TTL_SITEMAP = 60 * 60 * 24;    // 24 hours for sitemaps

/**
 * Cache key helpers
 */
export const cacheKeys = {
  agencyPscPage: (agencySlug: string, pscSlug: string) => `page:agency:${agencySlug}:${pscSlug}`,
  agencyPage: (agencySlug: string) => `page:agency:${agencySlug}`,
  vendorPage: (vendorSlug: string) => `page:vendor:${vendorSlug}`,
  industryPage: (naicsCode: string, agencySlug?: string) =>
    agencySlug ? `page:industry:${naicsCode}:${agencySlug}` : `page:industry:${naicsCode}`,
  aiCopy: (agencySlug: string, pscSlug: string) => `ai:${agencySlug}:${pscSlug}`,
  sitemap: (segment: string) => `sitemap:${segment}`,
};

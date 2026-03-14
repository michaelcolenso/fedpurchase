import { ingestRecentTransactions } from './pipeline/ingest';
import { recomputeRollups } from './pipeline/rollups';
import { regenerateSitemaps } from './pipeline/sitemap';
import { loadAgencies, loadPscCodes, loadNaicsCodes } from './pipeline/references';
import type { Env } from './types';

/**
 * Invalidate all page caches so fresh content is served.
 */
async function invalidatePageCache(env: Env): Promise<void> {
  // KV list + delete is quota-heavy; in production use a versioned cache key prefix instead.
  // For now, list page: keys and delete them.
  const listed = await env.KV.list({ prefix: 'page:' });
  await Promise.all(listed.keys.map((k) => env.KV.delete(k.name)));
}

/**
 * Generate trend insights (stub — extend with real trend analysis).
 */
async function generateTrendInsights(_env: Env): Promise<void> {
  // Future: compute top growing categories, top vendors by FY, etc.
  // Store results in page_metadata or a dedicated insights table.
  console.log('generateTrendInsights: stub — not yet implemented');
}

/**
 * Scheduled cron handler — called by Cloudflare Workers runtime.
 */
export async function scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
  console.log(`Cron triggered: ${event.cron}`);

  try {
    switch (event.cron) {
      case '0 3 * * 1': {
        // Monday 3am UTC — weekly data refresh
        console.log('Starting weekly data ingest...');
        const ingested = await ingestRecentTransactions(env, 7);
        console.log(`Ingested ${ingested} new transactions`);

        console.log('Recomputing rollups...');
        await recomputeRollups(env);

        console.log('Invalidating page cache...');
        await invalidatePageCache(env);

        console.log('Weekly refresh complete.');
        break;
      }

      case '0 4 1 * *': {
        // 1st of month 4am UTC — monthly tasks
        console.log('Starting monthly tasks...');
        await generateTrendInsights(env);
        await regenerateSitemaps(env);
        console.log('Monthly tasks complete.');
        break;
      }

      default:
        console.warn(`Unknown cron expression: ${event.cron}`);
    }
  } catch (err) {
    console.error('Cron error:', err);
    throw err;
  }
}

/**
 * Admin HTTP endpoint: trigger reference data load manually.
 * Called via POST /admin/seed-references (protected by secret).
 */
export async function seedReferenceData(env: Env): Promise<{ agencies: number; pscCodes: number; naicsCodes: number }> {
  const [agencyCount, pscCount, naicsCount] = await Promise.all([
    loadAgencies(env),
    loadPscCodes(env),
    loadNaicsCodes(env),
  ]);

  return { agencies: agencyCount, pscCodes: pscCount, naicsCodes: naicsCount };
}

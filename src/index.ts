import { Hono } from 'hono';
import { homeHandler } from './routes/home';
import { agencyHandler, agencyPscHandler } from './routes/agency';
import { vendorHandler } from './routes/vendor';
import { industryHandler } from './routes/industry';
import { insightsHandler } from './routes/insights';
import { sitemapIndexHandler, sitemapSegmentHandler } from './routes/sitemap';
import { scheduled as scheduledHandler } from './cron';
import { seedReferenceData } from './cron';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

// Homepage
app.get('/', homeHandler);

// Agency routes (order matters — more specific first)
app.get('/agency/:agencySlug/:pscSlug', agencyPscHandler);
app.get('/agency/:agencySlug', agencyHandler);

// Vendor routes
app.get('/vendor/:vendorSlug', vendorHandler);

// Industry routes
app.get('/industry/:naicsCode/:agencySlug', industryHandler);
app.get('/industry/:naicsCode', industryHandler);

// Insight routes
app.get('/insights/:year/:topicSlug', insightsHandler);

// Sitemaps
app.get('/sitemap.xml', sitemapIndexHandler);
app.get('/sitemap/:segment{[a-z]+}\\.xml', sitemapSegmentHandler);

// robots.txt
app.get('/robots.txt', (c) =>
  c.text(`User-agent: *\nAllow: /\nSitemap: https://fedpurchase.io/sitemap.xml\n`)
);

// Admin: seed reference data (protect with a shared secret in production)
app.post('/admin/seed-references', async (c) => {
  const authHeader = c.req.header('Authorization');
  const adminSecret = (c.env as unknown as { ADMIN_SECRET?: string }).ADMIN_SECRET;

  if (adminSecret && authHeader !== `Bearer ${adminSecret}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const result = await seedReferenceData(c.env);
    return c.json({ ok: true, ...result });
  } catch (err) {
    console.error('Seed error:', err);
    return c.json({ error: String(err) }, 500);
  }
});

// Admin: trigger manual ingest
app.post('/admin/ingest', async (c) => {
  const authHeader = c.req.header('Authorization');
  const adminSecret = (c.env as unknown as { ADMIN_SECRET?: string }).ADMIN_SECRET;

  if (adminSecret && authHeader !== `Bearer ${adminSecret}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const { ingestRecentTransactions } = await import('./pipeline/ingest');
    const { recomputeRollups } = await import('./pipeline/rollups');
    const ingested = await ingestRecentTransactions(c.env, 7);
    await recomputeRollups(c.env);
    return c.json({ ok: true, ingested });
  } catch (err) {
    console.error('Ingest error:', err);
    return c.json({ error: String(err) }, 500);
  }
});

// 404 handler
app.notFound((c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en"><head><title>Not Found — GovPurchase Intel</title>
<link href="https://cdn.jsdelivr.net/npm/tailwindcss@2/dist/tailwind.min.css" rel="stylesheet">
</head><body class="bg-gray-50 flex items-center justify-center min-h-screen">
<div class="text-center">
  <h1 class="text-4xl font-bold mb-4">404</h1>
  <p class="text-gray-600 mb-6">Page not found.</p>
  <a href="/" class="text-blue-600 hover:underline">← Back to Home</a>
</div></body></html>`, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.html(`<!DOCTYPE html>
<html lang="en"><head><title>Error — GovPurchase Intel</title>
<link href="https://cdn.jsdelivr.net/npm/tailwindcss@2/dist/tailwind.min.css" rel="stylesheet">
</head><body class="bg-gray-50 flex items-center justify-center min-h-screen">
<div class="text-center">
  <h1 class="text-4xl font-bold mb-4">500</h1>
  <p class="text-gray-600 mb-6">An unexpected error occurred.</p>
  <a href="/" class="text-blue-600 hover:underline">← Back to Home</a>
</div></body></html>`, 500);
});

export default {
  fetch: app.fetch,
  scheduled: scheduledHandler,
};

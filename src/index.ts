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
app.get('/sitemap/:segment.xml', sitemapSegmentHandler);

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

// Admin: run DB migration (temporary bootstrap endpoint)
app.post('/admin/migrate', async (c) => {
  const authHeader = c.req.header('Authorization');
  const adminSecret = (c.env as unknown as { ADMIN_SECRET?: string }).ADMIN_SECRET;

  if (adminSecret && authHeader !== `Bearer ${adminSecret}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const statements = [
    `CREATE TABLE IF NOT EXISTS agencies (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, toptier_id integer, toptier_code text, name text NOT NULL, abbreviation text, slug text NOT NULL UNIQUE)`,
    `CREATE TABLE IF NOT EXISTS psc_codes (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, code text NOT NULL UNIQUE, description text NOT NULL, category_slug text, category_name text, parent_code text)`,
    `CREATE TABLE IF NOT EXISTS naics_codes (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, code text NOT NULL UNIQUE, description text NOT NULL, slug text NOT NULL, sector_code text, sector_name text)`,
    `CREATE TABLE IF NOT EXISTS micro_purchases (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, award_id text NOT NULL, agency_id integer REFERENCES agencies(id), psc_code text, naics_code text, recipient_name text, recipient_uei text, amount real NOT NULL, action_date text, fiscal_year integer, description text, place_state text, place_city text)`,
    `CREATE INDEX IF NOT EXISTS idx_agency_psc ON micro_purchases (agency_id, psc_code)`,
    `CREATE INDEX IF NOT EXISTS idx_agency_naics ON micro_purchases (agency_id, naics_code)`,
    `CREATE INDEX IF NOT EXISTS idx_recipient ON micro_purchases (recipient_uei)`,
    `CREATE INDEX IF NOT EXISTS idx_fy ON micro_purchases (fiscal_year)`,
    `CREATE TABLE IF NOT EXISTS agency_psc_rollups (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, agency_id integer REFERENCES agencies(id), psc_code text, category_slug text, fiscal_year integer, total_amount real, transaction_count integer, unique_vendors integer, top_vendor_name text, top_vendor_amount real, avg_transaction_size real, yoy_growth_pct real, updated_at text)`,
    `CREATE INDEX IF NOT EXISTS idx_rollup_slug ON agency_psc_rollups (agency_id, category_slug, fiscal_year)`,
    `CREATE TABLE IF NOT EXISTS agency_naics_rollups (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, agency_id integer REFERENCES agencies(id), naics_code text, naics_slug text, fiscal_year integer, total_amount real, transaction_count integer, unique_vendors integer, top_vendor_name text, top_vendor_amount real, avg_transaction_size real, yoy_growth_pct real, updated_at text)`,
    `CREATE INDEX IF NOT EXISTS idx_naics_rollup ON agency_naics_rollups (agency_id, naics_code, fiscal_year)`,
    `CREATE TABLE IF NOT EXISTS vendor_profiles (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, uei text NOT NULL UNIQUE, name text NOT NULL, slug text NOT NULL UNIQUE, total_micro_purchase_amount real, total_transactions integer, agency_count integer, top_agency_name text, top_psc_category text, first_seen text, last_seen text, updated_at text)`,
    `CREATE TABLE IF NOT EXISTS vendor_agency_rollups (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, vendor_id integer REFERENCES vendor_profiles(id), agency_id integer REFERENCES agencies(id), total_amount real, transaction_count integer, updated_at text)`,
    `CREATE INDEX IF NOT EXISTS idx_vendor_agency ON vendor_agency_rollups (vendor_id, agency_id)`,
    `CREATE TABLE IF NOT EXISTS page_metadata (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, path text NOT NULL UNIQUE, title text, description text, h1 text, updated_at text)`,
  ];

  const results: string[] = [];
  for (const sql of statements) {
    try {
      await c.env.DB.prepare(sql).run();
      results.push(`OK: ${sql.slice(0, 60)}...`);
    } catch (err) {
      results.push(`ERR: ${sql.slice(0, 60)}... — ${String(err)}`);
    }
  }
  return c.json({ ok: true, results });
});

// Admin: load pre-fetched reference data (agencies, psc_codes, naics_codes)
app.post('/admin/load-data', async (c) => {
  const authHeader = c.req.header('Authorization');
  const adminSecret = (c.env as unknown as { ADMIN_SECRET?: string }).ADMIN_SECRET;

  if (adminSecret && authHeader !== `Bearer ${adminSecret}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const body = await c.req.json() as {
      table: 'agencies' | 'psc_codes' | 'naics_codes';
      rows: Record<string, unknown>[];
    };

    let inserted = 0;
    if (body.table === 'agencies') {
      for (const row of body.rows) {
        await c.env.DB.prepare(
          `INSERT OR IGNORE INTO agencies (toptier_id, toptier_code, name, abbreviation, slug) VALUES (?, ?, ?, ?, ?)`
        ).bind(row.toptier_id ?? null, row.toptier_code ?? null, row.name, row.abbreviation ?? null, row.slug).run();
        inserted++;
      }
    } else if (body.table === 'psc_codes') {
      for (const row of body.rows) {
        await c.env.DB.prepare(
          `INSERT OR IGNORE INTO psc_codes (code, description, category_slug, category_name, parent_code) VALUES (?, ?, ?, ?, ?)`
        ).bind(row.code, row.description, row.category_slug ?? null, row.category_name ?? null, row.parent_code ?? null).run();
        inserted++;
      }
    } else if (body.table === 'naics_codes') {
      for (const row of body.rows) {
        await c.env.DB.prepare(
          `INSERT OR IGNORE INTO naics_codes (code, description, slug, sector_code, sector_name) VALUES (?, ?, ?, ?, ?)`
        ).bind(row.code, row.description, row.slug, row.sector_code ?? null, row.sector_name ?? null).run();
        inserted++;
      }
    } else {
      return c.json({ error: 'Unknown table' }, 400);
    }

    return c.json({ ok: true, table: body.table, inserted });
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

// Admin: load pre-fetched transaction data
app.post('/admin/load-transactions', async (c) => {
  const authHeader = c.req.header('Authorization');
  const adminSecret = (c.env as unknown as { ADMIN_SECRET?: string }).ADMIN_SECRET;
  if (adminSecret && authHeader !== `Bearer ${adminSecret}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  try {
    const body = await c.req.json() as { rows: Record<string, unknown>[] };
    let inserted = 0;
    for (const row of body.rows) {
      // Look up agency_id from toptier_code
      let agencyId: number | null = null;
      if (row.toptier_code) {
        const ag = await c.env.DB.prepare(`SELECT id FROM agencies WHERE toptier_code = ?`).bind(row.toptier_code).first<{ id: number }>();
        agencyId = ag?.id ?? null;
      }
      const existing = await c.env.DB.prepare(`SELECT id FROM micro_purchases WHERE award_id = ?`).bind(row.award_id).first();
      if (!existing) {
        await c.env.DB.prepare(
          `INSERT INTO micro_purchases (award_id, agency_id, psc_code, naics_code, recipient_name, recipient_uei, amount, action_date, fiscal_year, description, place_state, place_city)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          row.award_id, agencyId, row.psc_code ?? null, row.naics_code ?? null,
          row.recipient_name ?? null, row.recipient_uei ?? null, row.amount,
          row.action_date ?? null, row.fiscal_year ?? null, row.description ?? null,
          row.place_state ?? null, row.place_city ?? null
        ).run();
        inserted++;
      }
    }
    return c.json({ ok: true, inserted });
  } catch (err) {
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

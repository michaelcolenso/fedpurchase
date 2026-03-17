import { toSlug } from '../lib/slug';
import type { Env } from '../types';

/**
 * Recompute all rollup tables from the micro_purchases raw data.
 * Uses SQL aggregation to avoid N+1 query patterns that exceed D1 subrequest limits.
 */
export async function recomputeRollups(env: Env): Promise<void> {
  await recomputeAgencyPscRollups(env);
  await recomputeAgencyNaicsRollups(env);
  await recomputeVendorProfiles(env);
}

/**
 * Recompute agency × PSC rollups using a single aggregate query + batch inserts.
 */
async function recomputeAgencyPscRollups(env: Env): Promise<void> {
  const now = new Date().toISOString();

  // Single query: aggregate all groups + get top vendor per group via subquery
  interface AgencyPscRow {
    agency_id: number;
    psc_code: string;
    fiscal_year: number;
    total_amount: number;
    transaction_count: number;
    unique_vendors: number;
    avg_transaction_size: number;
    top_vendor_name: string | null;
    top_vendor_amount: number | null;
    category_slug: string | null;
  }

  const rows = await env.DB.prepare(`
    WITH vendor_totals AS (
      SELECT agency_id, psc_code, fiscal_year, recipient_uei, recipient_name,
             SUM(amount) AS vendor_total,
             ROW_NUMBER() OVER (PARTITION BY agency_id, psc_code, fiscal_year ORDER BY SUM(amount) DESC) AS rn
      FROM micro_purchases
      WHERE agency_id IS NOT NULL AND psc_code IS NOT NULL AND recipient_uei IS NOT NULL
      GROUP BY agency_id, psc_code, fiscal_year, recipient_uei
    )
    SELECT
      mp.agency_id,
      mp.psc_code,
      mp.fiscal_year,
      SUM(mp.amount)           AS total_amount,
      COUNT(*)                 AS transaction_count,
      COUNT(DISTINCT mp.recipient_uei) AS unique_vendors,
      AVG(mp.amount)           AS avg_transaction_size,
      vt.recipient_name        AS top_vendor_name,
      vt.vendor_total          AS top_vendor_amount,
      pc.category_slug
    FROM micro_purchases mp
    LEFT JOIN vendor_totals vt
      ON mp.agency_id = vt.agency_id AND mp.psc_code = vt.psc_code AND mp.fiscal_year = vt.fiscal_year AND vt.rn = 1
    LEFT JOIN psc_codes pc ON mp.psc_code = pc.code
    WHERE mp.agency_id IS NOT NULL AND mp.psc_code IS NOT NULL
    GROUP BY mp.agency_id, mp.psc_code, mp.fiscal_year
  `).all<AgencyPscRow>();

  if (rows.results.length === 0) return;

  // Delete existing rollups and bulk-insert fresh ones
  await env.DB.prepare('DELETE FROM agency_psc_rollups').run();

  const stmt = env.DB.prepare(`
    INSERT INTO agency_psc_rollups
      (agency_id, psc_code, category_slug, fiscal_year, total_amount, transaction_count,
       unique_vendors, top_vendor_name, top_vendor_amount, avg_transaction_size, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Batch in chunks of 100 to stay within subrequest limits
  for (let i = 0; i < rows.results.length; i += 100) {
    const chunk = rows.results.slice(i, i + 100);
    const statements = chunk.map((row) =>
      stmt.bind(
        row.agency_id, row.psc_code,
        row.category_slug ?? toSlug(row.psc_code),
        row.fiscal_year, row.total_amount, row.transaction_count,
        row.unique_vendors, row.top_vendor_name ?? null, row.top_vendor_amount ?? null,
        row.avg_transaction_size, now
      )
    );
    await env.DB.batch(statements);
  }
}

/**
 * Recompute agency × NAICS rollups.
 */
async function recomputeAgencyNaicsRollups(env: Env): Promise<void> {
  const now = new Date().toISOString();

  interface AgencyNaicsRow {
    agency_id: number;
    naics_code: string;
    fiscal_year: number;
    total_amount: number;
    transaction_count: number;
    unique_vendors: number;
    avg_transaction_size: number;
    top_vendor_name: string | null;
    top_vendor_amount: number | null;
  }

  const rows = await env.DB.prepare(`
    WITH vendor_totals AS (
      SELECT agency_id, naics_code, fiscal_year, recipient_uei, recipient_name,
             SUM(amount) AS vendor_total,
             ROW_NUMBER() OVER (PARTITION BY agency_id, naics_code, fiscal_year ORDER BY SUM(amount) DESC) AS rn
      FROM micro_purchases
      WHERE agency_id IS NOT NULL AND naics_code IS NOT NULL AND recipient_uei IS NOT NULL
      GROUP BY agency_id, naics_code, fiscal_year, recipient_uei
    )
    SELECT
      mp.agency_id,
      mp.naics_code,
      mp.fiscal_year,
      SUM(mp.amount)           AS total_amount,
      COUNT(*)                 AS transaction_count,
      COUNT(DISTINCT mp.recipient_uei) AS unique_vendors,
      AVG(mp.amount)           AS avg_transaction_size,
      vt.recipient_name        AS top_vendor_name,
      vt.vendor_total          AS top_vendor_amount
    FROM micro_purchases mp
    LEFT JOIN vendor_totals vt
      ON mp.agency_id = vt.agency_id AND mp.naics_code = vt.naics_code AND mp.fiscal_year = vt.fiscal_year AND vt.rn = 1
    WHERE mp.agency_id IS NOT NULL AND mp.naics_code IS NOT NULL
    GROUP BY mp.agency_id, mp.naics_code, mp.fiscal_year
  `).all<AgencyNaicsRow>();

  if (rows.results.length === 0) return;

  await env.DB.prepare('DELETE FROM agency_naics_rollups').run();

  const stmt = env.DB.prepare(`
    INSERT INTO agency_naics_rollups
      (agency_id, naics_code, naics_slug, fiscal_year, total_amount, transaction_count,
       unique_vendors, top_vendor_name, top_vendor_amount, avg_transaction_size, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < rows.results.length; i += 100) {
    const chunk = rows.results.slice(i, i + 100);
    const statements = chunk.map((row) =>
      stmt.bind(
        row.agency_id, row.naics_code, toSlug(row.naics_code), row.fiscal_year,
        row.total_amount, row.transaction_count, row.unique_vendors,
        row.top_vendor_name ?? null, row.top_vendor_amount ?? null,
        row.avg_transaction_size, now
      )
    );
    await env.DB.batch(statements);
  }
}

/**
 * Recompute vendor profiles.
 */
async function recomputeVendorProfiles(env: Env): Promise<void> {
  const now = new Date().toISOString();

  interface VendorRow {
    recipient_uei: string;
    recipient_name: string;
    total_amount: number;
    transaction_count: number;
    agency_count: number;
    first_seen: string | null;
    last_seen: string | null;
    top_agency_name: string | null;
    top_psc_category: string | null;
  }

  const rows = await env.DB.prepare(`
    WITH agency_totals AS (
      SELECT mp.recipient_uei, a.name AS agency_name, SUM(mp.amount) AS agency_total,
             ROW_NUMBER() OVER (PARTITION BY mp.recipient_uei ORDER BY SUM(mp.amount) DESC) AS rn
      FROM micro_purchases mp
      JOIN agencies a ON mp.agency_id = a.id
      WHERE mp.recipient_uei IS NOT NULL
      GROUP BY mp.recipient_uei, mp.agency_id
    ),
    psc_totals AS (
      SELECT mp.recipient_uei, pc.category_name, SUM(mp.amount) AS psc_total,
             ROW_NUMBER() OVER (PARTITION BY mp.recipient_uei ORDER BY SUM(mp.amount) DESC) AS rn
      FROM micro_purchases mp
      LEFT JOIN psc_codes pc ON mp.psc_code = pc.code
      WHERE mp.recipient_uei IS NOT NULL
      GROUP BY mp.recipient_uei, mp.psc_code
    )
    SELECT
      mp.recipient_uei,
      mp.recipient_name,
      SUM(mp.amount)             AS total_amount,
      COUNT(*)                   AS transaction_count,
      COUNT(DISTINCT mp.agency_id) AS agency_count,
      MIN(mp.action_date)        AS first_seen,
      MAX(mp.action_date)        AS last_seen,
      at.agency_name             AS top_agency_name,
      pt.category_name           AS top_psc_category
    FROM micro_purchases mp
    LEFT JOIN agency_totals at ON mp.recipient_uei = at.recipient_uei AND at.rn = 1
    LEFT JOIN psc_totals pt ON mp.recipient_uei = pt.recipient_uei AND pt.rn = 1
    WHERE mp.recipient_uei IS NOT NULL
    GROUP BY mp.recipient_uei
    ORDER BY total_amount DESC
    LIMIT 10000
  `).all<VendorRow>();

  if (rows.results.length === 0) return;

  await env.DB.prepare('DELETE FROM vendor_profiles').run();

  const stmt = env.DB.prepare(`
    INSERT INTO vendor_profiles
      (uei, name, slug, total_micro_purchase_amount, total_transactions, agency_count,
       top_agency_name, top_psc_category, first_seen, last_seen, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Track all slugs across chunks to prevent UNIQUE constraint violations
  const seenSlugs = new Set<string>();

  for (let i = 0; i < rows.results.length; i += 100) {
    const chunk = rows.results.slice(i, i + 100);
    const statements = chunk.map((row) => {
      let slug = toSlug(row.recipient_name);
      // Append UEI suffix if slug collides with another vendor
      if (seenSlugs.has(slug)) {
        slug = `${slug}-${row.recipient_uei.slice(-8).toLowerCase()}`;
      }
      seenSlugs.add(slug);
      return stmt.bind(
        row.recipient_uei, row.recipient_name, slug,
        row.total_amount, row.transaction_count, row.agency_count,
        row.top_agency_name ?? null, row.top_psc_category ?? null,
        row.first_seen ?? null, row.last_seen ?? null, now
      );
    });
    await env.DB.batch(statements);
  }
}

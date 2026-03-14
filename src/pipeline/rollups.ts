import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { pscCodes } from '../schema';
import { toSlug } from '../lib/slug';
import { currentFiscalYear } from '../lib/format';
import type { Env } from '../types';

/**
 * Recompute all rollup tables from the micro_purchases raw data.
 */
export async function recomputeRollups(env: Env): Promise<void> {
  await recomputeAgencyPscRollups(env);
  await recomputeAgencyNaicsRollups(env);
  await recomputeVendorProfiles(env);
}

interface AgencyPscRow {
  agency_id: number;
  psc_code: string;
  fiscal_year: number;
  total_amount: number;
  transaction_count: number;
  unique_vendors: number;
  top_vendor_name: string | null;
  top_vendor_amount: number | null;
  avg_transaction_size: number;
}

/**
 * Recompute agency × PSC rollups.
 */
async function recomputeAgencyPscRollups(env: Env): Promise<void> {
  const db = drizzle(env.DB);
  const now = new Date().toISOString();
  const fy = currentFiscalYear();

  // Aggregate micro_purchases by agency_id, psc_code, fiscal_year
  const rows = await env.DB.prepare(`
    SELECT
      agency_id,
      psc_code,
      fiscal_year,
      SUM(amount) AS total_amount,
      COUNT(*) AS transaction_count,
      COUNT(DISTINCT recipient_uei) AS unique_vendors,
      AVG(amount) AS avg_transaction_size
    FROM micro_purchases
    WHERE agency_id IS NOT NULL AND psc_code IS NOT NULL
    GROUP BY agency_id, psc_code, fiscal_year
  `).all<AgencyPscRow>();

  // For top vendor per group
  for (const row of rows.results) {
    const topVendor = await env.DB.prepare(`
      SELECT recipient_name, SUM(amount) AS vendor_total
      FROM micro_purchases
      WHERE agency_id = ? AND psc_code = ? AND fiscal_year = ?
      GROUP BY recipient_uei
      ORDER BY vendor_total DESC
      LIMIT 1
    `).bind(row.agency_id, row.psc_code, row.fiscal_year).first<{ recipient_name: string; vendor_total: number }>();

    // Look up category slug from psc_codes table
    const pscRow = await db.select({ categorySlug: pscCodes.categorySlug }).from(pscCodes)
      .where(eq(pscCodes.code, row.psc_code)).get();
    const categorySlug = pscRow?.categorySlug ?? toSlug(row.psc_code);

    // Calculate YoY growth
    const prevFyRow = await env.DB.prepare(`
      SELECT total_amount FROM agency_psc_rollups
      WHERE agency_id = ? AND psc_code = ? AND fiscal_year = ?
    `).bind(row.agency_id, row.psc_code, row.fiscal_year - 1).first<{ total_amount: number }>();

    let yoyGrowthPct: number | null = null;
    if (prevFyRow && prevFyRow.total_amount > 0) {
      yoyGrowthPct = ((row.total_amount - prevFyRow.total_amount) / prevFyRow.total_amount) * 100;
    }

    // Upsert rollup
    await env.DB.prepare(`
      INSERT INTO agency_psc_rollups
        (agency_id, psc_code, category_slug, fiscal_year, total_amount, transaction_count, unique_vendors,
         top_vendor_name, top_vendor_amount, avg_transaction_size, yoy_growth_pct, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        total_amount = excluded.total_amount,
        transaction_count = excluded.transaction_count,
        unique_vendors = excluded.unique_vendors,
        top_vendor_name = excluded.top_vendor_name,
        top_vendor_amount = excluded.top_vendor_amount,
        avg_transaction_size = excluded.avg_transaction_size,
        yoy_growth_pct = excluded.yoy_growth_pct,
        updated_at = excluded.updated_at
    `).bind(
      row.agency_id, row.psc_code, categorySlug, row.fiscal_year,
      row.total_amount, row.transaction_count, row.unique_vendors,
      topVendor?.recipient_name ?? null, topVendor?.vendor_total ?? null,
      row.avg_transaction_size, yoyGrowthPct, now
    ).run();
  }
}

interface AgencyNaicsRow {
  agency_id: number;
  naics_code: string;
  fiscal_year: number;
  total_amount: number;
  transaction_count: number;
  unique_vendors: number;
  avg_transaction_size: number;
}

/**
 * Recompute agency × NAICS rollups.
 */
async function recomputeAgencyNaicsRollups(env: Env): Promise<void> {
  const now = new Date().toISOString();

  const rows = await env.DB.prepare(`
    SELECT
      agency_id,
      naics_code,
      fiscal_year,
      SUM(amount) AS total_amount,
      COUNT(*) AS transaction_count,
      COUNT(DISTINCT recipient_uei) AS unique_vendors,
      AVG(amount) AS avg_transaction_size
    FROM micro_purchases
    WHERE agency_id IS NOT NULL AND naics_code IS NOT NULL
    GROUP BY agency_id, naics_code, fiscal_year
  `).all<AgencyNaicsRow>();

  for (const row of rows.results) {
    const topVendor = await env.DB.prepare(`
      SELECT recipient_name, SUM(amount) AS vendor_total
      FROM micro_purchases
      WHERE agency_id = ? AND naics_code = ? AND fiscal_year = ?
      GROUP BY recipient_uei
      ORDER BY vendor_total DESC
      LIMIT 1
    `).bind(row.agency_id, row.naics_code, row.fiscal_year).first<{ recipient_name: string; vendor_total: number }>();

    const naicsSlug = toSlug(row.naics_code);

    const prevFyRow = await env.DB.prepare(`
      SELECT total_amount FROM agency_naics_rollups
      WHERE agency_id = ? AND naics_code = ? AND fiscal_year = ?
    `).bind(row.agency_id, row.naics_code, row.fiscal_year - 1).first<{ total_amount: number }>();

    let yoyGrowthPct: number | null = null;
    if (prevFyRow && prevFyRow.total_amount > 0) {
      yoyGrowthPct = ((row.total_amount - prevFyRow.total_amount) / prevFyRow.total_amount) * 100;
    }

    await env.DB.prepare(`
      INSERT INTO agency_naics_rollups
        (agency_id, naics_code, naics_slug, fiscal_year, total_amount, transaction_count, unique_vendors,
         top_vendor_name, top_vendor_amount, avg_transaction_size, yoy_growth_pct, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        total_amount = excluded.total_amount,
        transaction_count = excluded.transaction_count,
        unique_vendors = excluded.unique_vendors,
        top_vendor_name = excluded.top_vendor_name,
        top_vendor_amount = excluded.top_vendor_amount,
        avg_transaction_size = excluded.avg_transaction_size,
        yoy_growth_pct = excluded.yoy_growth_pct,
        updated_at = excluded.updated_at
    `).bind(
      row.agency_id, row.naics_code, naicsSlug, row.fiscal_year,
      row.total_amount, row.transaction_count, row.unique_vendors,
      topVendor?.recipient_name ?? null, topVendor?.vendor_total ?? null,
      row.avg_transaction_size, yoyGrowthPct, now
    ).run();
  }
}

interface VendorRow {
  recipient_uei: string;
  recipient_name: string;
  total_amount: number;
  transaction_count: number;
  agency_count: number;
  first_seen: string;
  last_seen: string;
}

/**
 * Recompute vendor profiles from micro_purchases.
 */
async function recomputeVendorProfiles(env: Env): Promise<void> {
  const db = drizzle(env.DB);
  const now = new Date().toISOString();

  const rows = await env.DB.prepare(`
    SELECT
      recipient_uei,
      recipient_name,
      SUM(amount) AS total_amount,
      COUNT(*) AS transaction_count,
      COUNT(DISTINCT agency_id) AS agency_count,
      MIN(action_date) AS first_seen,
      MAX(action_date) AS last_seen
    FROM micro_purchases
    WHERE recipient_uei IS NOT NULL
    GROUP BY recipient_uei
    ORDER BY total_amount DESC
  `).all<VendorRow>();

  for (const row of rows.results) {
    if (!row.recipient_uei || !row.recipient_name) continue;

    const slug = toSlug(row.recipient_name);

    const topAgency = await env.DB.prepare(`
      SELECT a.name, SUM(mp.amount) AS agency_total
      FROM micro_purchases mp
      JOIN agencies a ON mp.agency_id = a.id
      WHERE mp.recipient_uei = ?
      GROUP BY mp.agency_id
      ORDER BY agency_total DESC
      LIMIT 1
    `).bind(row.recipient_uei).first<{ name: string; agency_total: number }>();

    const topPsc = await env.DB.prepare(`
      SELECT p.category_name, SUM(mp.amount) AS psc_total
      FROM micro_purchases mp
      LEFT JOIN psc_codes p ON mp.psc_code = p.code
      WHERE mp.recipient_uei = ?
      GROUP BY mp.psc_code
      ORDER BY psc_total DESC
      LIMIT 1
    `).bind(row.recipient_uei).first<{ category_name: string | null; psc_total: number }>();

    // Upsert vendor profile
    await env.DB.prepare(`
      INSERT INTO vendor_profiles
        (uei, name, slug, total_micro_purchase_amount, total_transactions, agency_count,
         top_agency_name, top_psc_category, first_seen, last_seen, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(uei) DO UPDATE SET
        name = excluded.name,
        total_micro_purchase_amount = excluded.total_micro_purchase_amount,
        total_transactions = excluded.total_transactions,
        agency_count = excluded.agency_count,
        top_agency_name = excluded.top_agency_name,
        top_psc_category = excluded.top_psc_category,
        last_seen = excluded.last_seen,
        updated_at = excluded.updated_at
    `).bind(
      row.recipient_uei, row.recipient_name, slug,
      row.total_amount, row.transaction_count, row.agency_count,
      topAgency?.name ?? null, topPsc?.category_name ?? null,
      row.first_seen, row.last_seen, now
    ).run();
  }
}

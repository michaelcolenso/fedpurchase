#!/usr/bin/env node
/**
 * Fast backfill: fetches USASpending data locally and bulk-inserts via wrangler d1 execute.
 * Much faster than the HTTP endpoint approach (~10x) as it avoids per-record Worker round-trips.
 *
 * Usage:
 *   node scripts/fast-backfill.mjs --fy 2023
 *   node scripts/fast-backfill.mjs --fy 2023 --month 4   # single month
 */

import { ProxyAgent, fetch as uFetch } from 'undici';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const USA_SPENDING = 'https://api.usaspending.gov';
const PAGE_SIZE = 100;
const RATE_DELAY_MS = 700;
const DB_NAME = 'fedpurchase';

const args = process.argv.slice(2);
const fyArg = args.includes('--fy') ? parseInt(args[args.indexOf('--fy') + 1], 10) : null;
const monthArg = args.includes('--month') ? parseInt(args[args.indexOf('--month') + 1], 10) : null;

if (!fyArg) {
  console.error('Usage: node scripts/fast-backfill.mjs --fy YEAR [--month 1-12]');
  process.exit(1);
}

const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;
const proxyAgent = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

function proxiedFetch(url, opts = {}) {
  if (proxyAgent) opts.dispatcher = proxyAgent;
  return uFetch(url, opts);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fiscalYearFromDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const month = d.getUTCMonth() + 1;
  const year = d.getUTCFullYear();
  return month >= 10 ? year + 1 : year;
}

function escape(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  return "'" + String(val).replace(/'/g, "''") + "'";
}

function parseWranglerJson(raw) {
  // wrangler emits "Proxy environment variables detected..." preamble before JSON
  const jsonStart = raw.indexOf('[');
  if (jsonStart === -1) throw new Error('No JSON array in wrangler output: ' + raw.slice(0, 200));
  return JSON.parse(raw.slice(jsonStart));
}

async function runSql(sql) {
  const tmpFile = join(tmpdir(), `backfill-${Date.now()}.sql`);
  writeFileSync(tmpFile, sql);
  try {
    const result = execSync(
      `CLOUDFLARE_API_TOKEN="${process.env.CLOUDFLARE_API_TOKEN || ''}" npx wrangler d1 execute ${DB_NAME} --file "${tmpFile}" --json 2>/dev/null`,
      { encoding: 'utf8', timeout: 60000 }
    );
    return parseWranglerJson(result);
  } catch (err) {
    console.error('D1 execute error:', err.stdout?.slice(0, 500));
    throw err;
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

// Get agency lookup: toptier_code → internal id
async function getAgencyMap() {
  const result = execSync(
    `CLOUDFLARE_API_TOKEN="${process.env.CLOUDFLARE_API_TOKEN || ''}" npx wrangler d1 execute ${DB_NAME} --command "SELECT id, toptier_code FROM agencies WHERE toptier_code IS NOT NULL" --json 2>/dev/null`,
    { encoding: 'utf8', timeout: 30000 }
  );
  const data = parseWranglerJson(result);
  const rows = data[0]?.results ?? [];
  return new Map(rows.map((r) => [r.toptier_code, r.id]));
}

// Get awarding_agency_id → toptier_code from USASpending
async function getToptierMap() {
  const resp = await proxiedFetch(`${USA_SPENDING}/api/v2/references/toptier_agencies/`, {
    headers: { 'User-Agent': 'fedpurchase-fast-backfill/1.0' },
  });
  const data = await resp.json();
  const results = data.results ?? [];
  return new Map(results.map((a) => [a.agency_id ?? a.id, a.toptier_code]));
}

async function backfillMonth(year, month, agencyMap, toptierMap) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(Date.UTC(year, month, 0));
  const end = endDate.toISOString().split('T')[0];

  let page = 1;
  let totalInserted = 0;
  let hasMore = true;
  const allRows = [];

  // Phase 1: fetch all pages
  while (hasMore) {
    let data;
    try {
      const resp = await proxiedFetch(`${USA_SPENDING}/api/v2/search/spending_by_award/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'fedpurchase-fast-backfill/1.0' },
        body: JSON.stringify({
          filters: {
            award_type_codes: ['A', 'B', 'C', 'D'],
            award_amounts: [{ lower_bound: 0, upper_bound: 10000 }],
            time_period: [{ start_date: start, end_date: end }],
          },
          fields: ['Award ID', 'Recipient Name', 'recipient_uei', 'Award Amount', 'Action Date',
            'Award Description', 'awarding_agency_id', 'naics_code', 'Product or Service Code',
            'Place of Performance State Code', 'Place of Performance City Name'],
          limit: PAGE_SIZE,
          page,
          sort: 'Award Amount',
          order: 'desc',
        }),
      });
      data = await resp.json();
    } catch (err) {
      process.stderr.write(`\n  page ${page} error: ${err.message}\n`);
      break;
    }

    const results = data.results ?? [];
    if (results.length === 0) break;
    allRows.push(...results);

    hasMore = data.page_metadata?.hasNext && results.length === PAGE_SIZE;
    page++;
    if (hasMore) await sleep(RATE_DELAY_MS);
  }

  if (allRows.length === 0) return 0;

  // Phase 2: build bulk INSERT SQL
  const insertLines = allRows.map((award) => {
    const toptierCode = award.awarding_agency_id ? toptierMap.get(award.awarding_agency_id) : null;
    const agencyId = toptierCode ? (agencyMap.get(toptierCode) ?? null) : null;
    const actionDate = award['Action Date'] ?? null;
    const fiscalYear = actionDate ? fiscalYearFromDate(actionDate) : null;
    const awardId = String(award.internal_id);

    return `(${[
      escape(awardId),
      escape(agencyId),
      escape(award['Product or Service Code']),
      escape(award.naics_code),
      escape(award['Recipient Name']),
      escape(award.recipient_uei),
      escape(award['Award Amount']),
      escape(actionDate),
      escape(fiscalYear),
      escape(award['Award Description']),
      escape(award['Place of Performance State Code']),
      escape(award['Place of Performance City Name']),
    ].join(',')})`;
  });

  const sql = `INSERT OR IGNORE INTO micro_purchases
    (award_id, agency_id, psc_code, naics_code, recipient_name, recipient_uei, amount, action_date, fiscal_year, description, place_state, place_city)
    VALUES ${insertLines.join(',\n')};`;

  try {
    await runSql(sql);
    totalInserted = allRows.length;
  } catch (err) {
    process.stderr.write(`\n  SQL insert error for ${year}-${month}: ${err.message}\n`);
  }

  return totalInserted;
}

function fyMonths(fy) {
  const months = [];
  for (let m = 10; m <= 12; m++) months.push({ year: fy - 1, month: m });
  for (let m = 1; m <= 9; m++) months.push({ year: fy, month: m });
  return months;
}

async function main() {
  console.log(`=== Fast Backfill FY${fyArg}${monthArg ? ` month ${monthArg}` : ''} ===\n`);

  process.stdout.write('Loading agency maps...');
  const toptierMap = await getToptierMap();
  const agencyMap = await getAgencyMap();
  console.log(` ${toptierMap.size} toptier, ${agencyMap.size} internal`);

  const months = monthArg
    ? fyMonths(fyArg).filter((m) => m.month === monthArg)
    : fyMonths(fyArg);

  let fyTotal = 0;
  for (const { year, month } of months) {
    process.stdout.write(`  ${year}-${String(month).padStart(2, '0')}: fetching...`);
    const inserted = await backfillMonth(year, month, agencyMap, toptierMap);
    fyTotal += inserted;
    process.stdout.write(`\r  ${year}-${String(month).padStart(2, '0')}: ${inserted} records (FY${fyArg} total: ${fyTotal})\n`);
  }

  console.log(`\nFY${fyArg} backfill complete: ${fyTotal} records`);

  // Trigger rollup recompute
  console.log('Triggering rollups via Worker...');
  const proxyFetchWorker = (url, opts = {}) => {
    if (proxyAgent) opts.dispatcher = proxyAgent;
    return uFetch(url, opts);
  };
  const resp = await proxyFetchWorker('https://fedpurchase.aged-morning-c8e4.workers.dev/admin/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer gp-admin-7x9mK2pQnR4wL8vZ' },
    body: '{}',
  });
  const text = await resp.text();
  console.log('Ingest result:', text.slice(0, 200));
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});

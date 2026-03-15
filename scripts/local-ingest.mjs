#!/usr/bin/env node
/**
 * Local ingestion script: fetches data from USASpending.gov and pushes to the Worker.
 * Used as a workaround since the Worker can't reach api.usaspending.gov directly (SSL 525).
 *
 * Usage:
 *   node scripts/local-ingest.mjs               # seed refs + backfill FY2022-2025
 *   node scripts/local-ingest.mjs --refs-only   # only load agencies/PSC/NAICS
 *   node scripts/local-ingest.mjs --skip-refs   # skip refs, only backfill transactions
 *   node scripts/local-ingest.mjs --fy 2024     # backfill a single fiscal year
 */

import { ProxyAgent, fetch as uFetch } from 'undici';

const WORKER_URL = 'https://fedpurchase.aged-morning-c8e4.workers.dev';
const ADMIN_SECRET = 'gp-admin-7x9mK2pQnR4wL8vZ';
const USA_SPENDING = 'https://api.usaspending.gov';
const PAGE_SIZE = 100;
const RATE_DELAY_MS = 700;

// Use proxy for outbound requests (required in this environment)
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;
const proxyAgent = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

function proxiedFetch(url, opts = {}) {
  if (proxyAgent) opts.dispatcher = proxyAgent;
  return uFetch(url, opts);
}

const args = process.argv.slice(2);
const refsOnly = args.includes('--refs-only');
const skipRefs = args.includes('--skip-refs');
const fyArg = args.includes('--fy') ? parseInt(args[args.indexOf('--fy') + 1], 10) : null;

// ── helpers ──────────────────────────────────────────────────────────────────

function toSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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

async function workerPost(path, body) {
  const resp = await proxiedFetch(`${WORKER_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ADMIN_SECRET}`,
    },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function usaGet(path) {
  const resp = await proxiedFetch(`${USA_SPENDING}${path}`, {
    headers: { 'User-Agent': 'fedpurchase-local-ingest/1.0' },
  });
  if (!resp.ok) throw new Error(`GET ${path} → ${resp.status}`);
  return resp.json();
}

async function usaPost(path, body) {
  const resp = await proxiedFetch(`${USA_SPENDING}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'fedpurchase-local-ingest/1.0' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`POST ${path} → ${resp.status}: ${txt.slice(0, 200)}`);
  }
  return resp.json();
}

// ── Reference data ────────────────────────────────────────────────────────────

async function loadAgencies() {
  console.log('Loading agencies from USASpending...');
  const data = await usaGet('/api/v2/references/toptier_agencies/');
  const results = data.results ?? data.agency_list ?? [];
  console.log(`  ${results.length} agencies found`);

  const rows = results
    .filter((a) => a.agency_name || a.name)
    .map((a) => ({
      toptier_id: a.agency_id ?? a.id ?? null,
      toptier_code: a.toptier_code ?? null,
      name: a.agency_name ?? a.name,
      abbreviation: a.abbreviation ?? null,
      slug: toSlug(a.agency_name ?? a.name),
    }));

  // Push in one batch (load-data endpoint handles OR IGNORE)
  const result = await workerPost('/admin/load-data', { table: 'agencies', rows });
  console.log(`  → ${result.inserted ?? '?'} inserted`, result.error ? `ERROR: ${result.error}` : '');
  return rows;
}

async function loadPscCodes() {
  console.log('Loading PSC codes from USASpending...');
  const data = await usaGet('/api/v2/references/filter_tree/psc/');
  const topNodes = data.data ?? data.results ?? [];

  const rows = [];

  function flattenNode(node, parentCode, categorySlug, categoryName) {
    const isCategory = Array.isArray(node.children) && node.children.length > 0;
    const slug = isCategory ? toSlug(node.description) : categorySlug;
    const name = isCategory ? node.description : categoryName;
    rows.push({
      code: node.id,
      description: node.description,
      category_slug: slug,
      category_name: name,
      parent_code: parentCode,
    });
    if (Array.isArray(node.children)) {
      for (const child of node.children) flattenNode(child, node.id, slug, name);
    }
  }

  for (const node of topNodes) flattenNode(node, null, null, null);
  console.log(`  ${rows.length} PSC codes found`);

  const result = await workerPost('/admin/load-data', { table: 'psc_codes', rows });
  console.log(`  → ${result.inserted ?? '?'} inserted`, result.error ? `ERROR: ${result.error}` : '');
}

async function loadNaicsCodes() {
  console.log('Loading NAICS codes from USASpending...');
  const data = await usaGet('/api/v2/references/naics/');
  const results = data.results ?? data.data ?? [];
  console.log(`  ${results.length} NAICS codes found`);

  const rows = results
    .filter((n) => (n.naics_code || n.naics) && (n.naics_description))
    .map((n) => {
      const code = n.naics_code ?? n.naics;
      return {
        code,
        description: n.naics_description,
        slug: toSlug(n.naics_description),
        sector_code: code.substring(0, 2),
        sector_name: null,
      };
    });

  // Push in chunks of 500 to stay within request limits
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const result = await workerPost('/admin/load-data', { table: 'naics_codes', rows: chunk });
    process.stdout.write(`  chunk ${Math.floor(i / 500) + 1}: ${result.inserted ?? '?'} inserted\r`);
  }
  console.log(`\n  Done loading NAICS.`);
}

// ── Transaction backfill ───────────────────────────────────────────────────────

async function backfillMonth(year, month, agencyMap) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = new Date(Date.UTC(year, month, 0)); // last day of month
  const endStr = end.toISOString().split('T')[0];

  let page = 1;
  let totalInserted = 0;
  let hasMore = true;

  while (hasMore) {
    let data;
    try {
      data = await usaPost('/api/v2/search/spending_by_award/', {
        filters: {
          award_type_codes: ['A', 'B', 'C', 'D'],
          award_amounts: [{ lower_bound: 0, upper_bound: 10000 }],
          time_period: [{ start_date: start, end_date: endStr }],
        },
        fields: [
          'Award ID',
          'Recipient Name',
          'recipient_uei',
          'Award Amount',
          'Action Date',
          'Award Description',
          'awarding_agency_id',
          'naics_code',
          'Product or Service Code',
          'Place of Performance State Code',
          'Place of Performance City Name',
        ],
        limit: PAGE_SIZE,
        page,
        sort: 'Award Amount',
        order: 'desc',
      });
    } catch (err) {
      console.error(`  Page ${page} error: ${err.message}`);
      break;
    }

    const results = data.results ?? [];
    if (results.length === 0) break;

    const rows = results.map((award) => {
      const toptierCode = award.awarding_agency_id ? agencyMap.get(award.awarding_agency_id) : null;
      const actionDate = award['Action Date'] ?? null;
      const fiscalYear = actionDate ? fiscalYearFromDate(actionDate) : null;
      return {
        award_id: String(award.internal_id),
        toptier_code: toptierCode ?? null,
        psc_code: award['Product or Service Code'] ?? null,
        naics_code: award.naics_code ?? null,
        recipient_name: award['Recipient Name'] ?? null,
        recipient_uei: award.recipient_uei ?? null,
        amount: award['Award Amount'],
        action_date: actionDate,
        fiscal_year: fiscalYear,
        description: award['Award Description'] ?? null,
        place_state: award['Place of Performance State Code'] ?? null,
        place_city: award['Place of Performance City Name'] ?? null,
      };
    });

    const result = await workerPost('/admin/load-transactions', { rows });
    totalInserted += result.inserted ?? 0;

    hasMore = data.page_metadata?.hasNext && results.length === PAGE_SIZE;
    page++;
    if (hasMore) await sleep(RATE_DELAY_MS);
  }

  return totalInserted;
}

function fyMonths(fy) {
  // FY starts Oct 1 of prior year, ends Sep 30 of fy year
  const months = [];
  for (let m = 10; m <= 12; m++) months.push({ year: fy - 1, month: m });
  for (let m = 1; m <= 9; m++) months.push({ year: fy, month: m });
  return months;
}

async function backfillFiscalYear(fy, agencyMap) {
  console.log(`\nBackfilling FY${fy}...`);
  const months = fyMonths(fy);
  let fyTotal = 0;
  for (const { year, month } of months) {
    process.stdout.write(`  ${year}-${String(month).padStart(2, '0')}: `);
    const inserted = await backfillMonth(year, month, agencyMap);
    fyTotal += inserted;
    console.log(`${inserted} inserted (FY${fy} total: ${fyTotal})`);
  }
  console.log(`FY${fy} complete: ${fyTotal} total records`);
  return fyTotal;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Fedpurchase Local Ingest ===\n');

  let agencyRows = [];

  if (!skipRefs) {
    agencyRows = await loadAgencies();
    await loadPscCodes();
    await loadNaicsCodes();
    console.log('\nReference data loaded.\n');
  } else {
    // Fetch agencies for the ID→code mapping without re-seeding
    console.log('Fetching agency mapping (skip-refs mode)...');
    const data = await usaGet('/api/v2/references/toptier_agencies/');
    const results = data.results ?? data.agency_list ?? [];
    agencyRows = results.map((a) => ({
      toptier_id: a.agency_id ?? a.id ?? null,
      toptier_code: a.toptier_code ?? null,
    }));
  }

  if (refsOnly) {
    console.log('--refs-only flag set, skipping transaction backfill.');
    return;
  }

  // Build awarding_agency_id → toptier_code map
  const agencyMap = new Map(
    agencyRows.filter((a) => a.toptier_id && a.toptier_code).map((a) => [a.toptier_id, a.toptier_code])
  );
  console.log(`Agency map: ${agencyMap.size} entries`);

  const fiscalYears = fyArg ? [fyArg] : [2022, 2023, 2024, 2025];
  let grandTotal = 0;

  for (const fy of fiscalYears) {
    grandTotal += await backfillFiscalYear(fy, agencyMap);
  }

  console.log(`\n=== Backfill complete: ${grandTotal} total records inserted ===`);

  // Trigger rollups + ingest
  console.log('\nTriggering rollup recompute...');
  const ingestResult = await workerPost('/admin/ingest', {});
  console.log('Ingest result:', ingestResult);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

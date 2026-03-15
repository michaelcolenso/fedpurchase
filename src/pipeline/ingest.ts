import { drizzle } from 'drizzle-orm/d1';
import { agencies } from '../schema';
import { currentFiscalYear } from '../lib/format';
import type { Env } from '../types';

const USA_SPENDING_BASE = 'https://api.usaspending.gov';
const MICRO_PURCHASE_THRESHOLD = 10000;
const PAGE_SIZE = 100;
const RATE_LIMIT_DELAY_MS = 650; // ~100 req/min

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Response shape from /api/v2/search/spending_by_transaction/
 * Field names match the USASpending API response keys exactly.
 */
interface TransactionResult {
  internal_id: number;
  'Recipient Name': string | null;
  'Recipient UEI': string | null;
  'Transaction Amount': number;
  'Action Date': string | null;
  'Transaction Description': string | null;
  awarding_agency_id: number | null;
  naics_code: string | null;
  product_or_service_code: string | null;
  pop_state_code: string | null;
  pop_city_name: string | null;
}

interface SpendingByTransactionResponse {
  results: TransactionResult[];
  page_metadata: {
    page: number;
    next: number | null;
    hasNext: boolean;
    count?: number;
  };
}

/**
 * Derive US federal fiscal year from a date string (YYYY-MM-DD).
 * FY starts Oct 1; e.g. 2023-11-01 → FY2024, 2024-03-15 → FY2024.
 */
function fiscalYearFromDate(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00Z');
  const month = d.getUTCMonth() + 1;
  const year = d.getUTCFullYear();
  return month >= 10 ? year + 1 : year;
}

/**
 * Core ingest logic for a specific date range using the spending_by_transaction endpoint.
 * Returns number of new records inserted.
 */
export async function ingestDateRange(
  env: Env,
  startDate: Date,
  endDate: Date,
  agencyByToptierId?: Map<number, number>
): Promise<number> {
  const formatDate = (d: Date) => d.toISOString().split('T')[0];

  // Build agency lookup if not provided
  if (!agencyByToptierId) {
    const db = drizzle(env.DB);
    const agencyRows = await db.select({ id: agencies.id, toptierId: agencies.toptierId }).from(agencies).all();
    agencyByToptierId = new Map(agencyRows.map((a) => [a.toptierId, a.id]));
  }

  // Prepare bulk insert statement
  const insertStmt = env.DB.prepare(
    `INSERT OR IGNORE INTO micro_purchases
       (award_id, agency_id, psc_code, naics_code, recipient_name, recipient_uei, amount, action_date, fiscal_year, description, place_state, place_city)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  let page = 1;
  let totalIngested = 0;
  let hasMore = true;

  while (hasMore) {
    const body = {
      filters: {
        award_type_codes: ['A', 'B', 'C', 'D'],
        award_amounts: [{ lower_bound: 0, upper_bound: MICRO_PURCHASE_THRESHOLD }],
        time_period: [{ start_date: formatDate(startDate), end_date: formatDate(endDate) }],
      },
      fields: [
        'internal_id',
        'Recipient Name',
        'Recipient UEI',
        'Transaction Amount',
        'Action Date',
        'Transaction Description',
        'awarding_agency_id',
        'naics_code',
        'product_or_service_code',
        'pop_state_code',
        'pop_city_name',
      ],
      limit: PAGE_SIZE,
      page,
      sort: 'Action Date',
      order: 'desc',
    };

    const response = await fetch(`${USA_SPENDING_BASE}/api/v2/search/spending_by_transaction/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error(`USASpending API error on page ${page}: ${response.status}`);
      break;
    }

    const data = await response.json() as SpendingByTransactionResponse;
    const results = data.results;
    if (!results || results.length === 0) break;

    // Batch insert all records in this page
    const statements = results.map((tx) => {
      const agencyId = tx.awarding_agency_id ? (agencyByToptierId!.get(tx.awarding_agency_id) ?? null) : null;
      const actionDate = tx['Action Date'] ?? null;
      const fiscalYear = actionDate ? fiscalYearFromDate(actionDate) : currentFiscalYear();
      return insertStmt.bind(
        String(tx.internal_id),
        agencyId,
        tx.product_or_service_code ?? null,
        tx.naics_code ?? null,
        tx['Recipient Name'] ?? null,
        tx['Recipient UEI'] ?? null,
        tx['Transaction Amount'],
        actionDate,
        fiscalYear,
        tx['Transaction Description'] ?? null,
        tx.pop_state_code ?? null,
        tx.pop_city_name ?? null,
      );
    });

    const batchResults = await env.DB.batch(statements);
    const inserted = batchResults.reduce((sum, r) => sum + (r.meta?.changes ?? 0), 0);
    totalIngested += inserted;

    hasMore = data.page_metadata?.hasNext && results.length === PAGE_SIZE;
    page++;

    if (hasMore) {
      await sleep(RATE_LIMIT_DELAY_MS);
    }
  }

  return totalIngested;
}

/**
 * Ingest recent micro-purchase transactions from USASpending.gov.
 * @param env Worker environment bindings
 * @param daysBack Number of days to look back (default 7)
 */
export async function ingestRecentTransactions(env: Env, daysBack = 7): Promise<number> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);
  return ingestDateRange(env, startDate, endDate);
}

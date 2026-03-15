import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import { microPurchases, agencies } from '../schema';
import { currentFiscalYear } from '../lib/format';
import type { Env } from '../types';

const USA_SPENDING_BASE = 'https://api.usaspending.gov';
const MICRO_PURCHASE_THRESHOLD = 10000;
const PAGE_SIZE = 100;
const RATE_LIMIT_DELAY_MS = 650; // ~100 req/min

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface AwardResult {
  internal_id: string;
  'Recipient Name': string;
  recipient_uei: string;
  'Award Amount': number;
  'Action Date': string | null;
  'Award Description': string | null;
  awarding_agency_id: number | null;
  naics_code: string | null;
  'Product or Service Code': string | null;
  'Place of Performance State Code': string | null;
  'Place of Performance City Name': string | null;
}

interface SpendingByAwardResponse {
  results: AwardResult[];
  page_metadata: {
    page: number;
    next: string | null;
    previous: string | null;
    hasNext: boolean;
    hasPrevious: boolean;
    count: number;
    num_pages: number;
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
 * Core ingest logic for a specific date range. Returns number of new records inserted.
 */
export async function ingestDateRange(
  env: Env,
  startDate: Date,
  endDate: Date,
  agencyByToptierId?: Map<number, number>
): Promise<number> {
  const db = drizzle(env.DB);
  const formatDate = (d: Date) => d.toISOString().split('T')[0];

  // Build agency lookup if not provided
  if (!agencyByToptierId) {
    const agencyRows = await db.select({ id: agencies.id, toptierId: agencies.toptierId }).from(agencies).all();
    agencyByToptierId = new Map(agencyRows.map((a) => [a.toptierId, a.id]));
  }

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
    };

    const response = await fetch(`${USA_SPENDING_BASE}/api/v2/search/spending_by_award/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error(`USASpending API error on page ${page}: ${response.status}`);
      break;
    }

    const data = await response.json() as SpendingByAwardResponse;
    const results = data.results;

    for (const award of results) {
      const agencyId = award.awarding_agency_id ? (agencyByToptierId.get(award.awarding_agency_id) ?? null) : null;
      const actionDate = award['Action Date'];
      const fiscalYear = actionDate ? fiscalYearFromDate(actionDate) : currentFiscalYear();

      // Upsert: skip if award_id already exists
      const existing = await db
        .select({ id: microPurchases.id })
        .from(microPurchases)
        .where(eq(microPurchases.awardId, String(award.internal_id)))
        .get();

      if (!existing) {
        await db.insert(microPurchases).values({
          awardId: String(award.internal_id),
          agencyId,
          pscCode: award['Product or Service Code'],
          naicsCode: award.naics_code,
          recipientName: award['Recipient Name'],
          recipientUei: award.recipient_uei,
          amount: award['Award Amount'],
          actionDate,
          fiscalYear,
          description: award['Award Description'],
          placeState: award['Place of Performance State Code'],
          placeCity: award['Place of Performance City Name'],
        });
        totalIngested++;
      }
    }

    hasMore = data.page_metadata.hasNext && results.length === PAGE_SIZE;
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

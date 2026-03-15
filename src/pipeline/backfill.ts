import { drizzle } from 'drizzle-orm/d1';
import { agencies } from '../schema';
import { ingestDateRange } from './ingest';
import type { Env } from '../types';

/**
 * FY date bounds: US federal fiscal year starts Oct 1 and ends Sep 30.
 */
function fyDateRange(fy: number): { start: Date; end: Date } {
  return {
    start: new Date(`${fy - 1}-10-01T00:00:00Z`),
    end: new Date(`${fy}-09-30T23:59:59Z`),
  };
}

/**
 * Add months to a date (UTC-safe).
 */
function addMonths(d: Date, n: number): Date {
  const result = new Date(d);
  result.setUTCMonth(result.getUTCMonth() + n);
  return result;
}

/**
 * Backfill all micro-purchase transactions for a given fiscal year by processing
 * one calendar month at a time to stay within API timeouts and rate limits.
 *
 * @param env   Worker environment bindings
 * @param fy    Fiscal year to backfill (e.g. 2022 = Oct 2021–Sep 2022)
 * @returns     Total number of new records inserted
 */
export async function backfillFiscalYear(env: Env, fy: number): Promise<number> {
  const db = drizzle(env.DB);

  // Pre-build agency lookup once for all chunks
  const agencyRows = await db.select({ id: agencies.id, toptierId: agencies.toptierId }).from(agencies).all();
  const agencyByToptierId = new Map(agencyRows.map((a) => [a.toptierId, a.id]));

  const { start: fyStart, end: fyEnd } = fyDateRange(fy);

  let chunkStart = new Date(fyStart);
  let totalIngested = 0;
  let chunkIndex = 0;

  while (chunkStart < fyEnd) {
    let chunkEnd = addMonths(chunkStart, 1);
    if (chunkEnd > fyEnd) chunkEnd = new Date(fyEnd);

    console.log(
      `backfill FY${fy} chunk ${chunkIndex + 1}: ${chunkStart.toISOString().slice(0, 10)} → ${chunkEnd.toISOString().slice(0, 10)}`
    );

    const ingested = await ingestDateRange(env, chunkStart, chunkEnd, agencyByToptierId);
    totalIngested += ingested;
    console.log(`  → ${ingested} new records`);

    chunkStart = new Date(chunkEnd);
    chunkStart.setUTCDate(chunkStart.getUTCDate() + 1); // advance past chunk end
    chunkIndex++;
  }

  console.log(`backfill FY${fy} complete: ${totalIngested} total new records`);
  return totalIngested;
}

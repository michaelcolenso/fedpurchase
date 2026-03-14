import type { Context } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { renderHomePage } from '../templates/home';
import { currentFiscalYear } from '../lib/format';
import type { Env } from '../types';

export async function homeHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const env = c.env;
  const fy = currentFiscalYear();

  // Total stats
  const statsRow = await env.DB.prepare(`
    SELECT SUM(amount) AS total_amount, COUNT(*) AS total_transactions
    FROM micro_purchases
    WHERE fiscal_year = ?
  `).bind(fy).first<{ total_amount: number; total_transactions: number }>();

  // Top agencies
  const agencyRows = await env.DB.prepare(`
    SELECT a.name, a.slug, a.abbreviation,
           SUM(mp.amount) AS total_amount,
           COUNT(*) AS transaction_count
    FROM micro_purchases mp
    JOIN agencies a ON mp.agency_id = a.id
    WHERE mp.fiscal_year = ?
    GROUP BY mp.agency_id
    ORDER BY total_amount DESC
    LIMIT 9
  `).bind(fy).all<{
    name: string; slug: string; abbreviation: string | null;
    total_amount: number; transaction_count: number;
  }>();

  // Top categories
  const categoryRows = await env.DB.prepare(`
    SELECT p.category_name, p.category_slug,
           SUM(mp.amount) AS total_amount
    FROM micro_purchases mp
    JOIN psc_codes p ON mp.psc_code = p.code
    WHERE mp.fiscal_year = ? AND p.category_slug IS NOT NULL
    GROUP BY p.category_slug
    ORDER BY total_amount DESC
    LIMIT 12
  `).bind(fy).all<{ category_name: string | null; category_slug: string; total_amount: number }>();

  const html = renderHomePage({
    fiscalYear: fy,
    totalAmount: statsRow?.total_amount ?? 0,
    totalTransactions: statsRow?.total_transactions ?? 0,
    topAgencies: agencyRows.results.map((r) => ({
      name: r.name,
      slug: r.slug,
      abbreviation: r.abbreviation,
      totalAmount: r.total_amount,
      transactionCount: r.transaction_count,
    })),
    topCategories: categoryRows.results.map((r) => ({
      name: r.category_name ?? r.category_slug,
      slug: r.category_slug,
      totalAmount: r.total_amount,
    })),
  });

  return c.html(html);
}

/**
 * Format a dollar amount for display.
 * e.g. 1234567.89 → "$1,234,567.89"
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format a large number with commas.
 */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

/**
 * Format a YoY percentage change with sign.
 * e.g. 12.5 → "+12.5%", -3.2 → "-3.2%"
 */
export function formatYoY(pct: number | null | undefined): string {
  if (pct == null) return 'N/A';
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

/**
 * Derive current fiscal year from a date.
 * US federal fiscal year starts Oct 1.
 */
export function currentFiscalYear(date: Date = new Date()): number {
  const month = date.getMonth() + 1; // 1-12
  return month >= 10 ? date.getFullYear() + 1 : date.getFullYear();
}

/**
 * Format YYYY-MM-DD date string for display.
 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/**
 * Converts a string to a URL-safe slug.
 * e.g. "Department of Defense" → "department-of-defense"
 */
export function toSlug(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
}

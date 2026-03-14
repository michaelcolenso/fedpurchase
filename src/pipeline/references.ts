import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { agencies, pscCodes, naicsCodes } from '../schema';
import { toSlug } from '../lib/slug';
import type { Env } from '../types';

const USA_SPENDING_BASE = 'https://api.usaspending.gov';

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${url} returned ${response.status}: ${text.slice(0, 200)}`);
  }
  const json = await response.json();
  console.log(`[references] ${url} top-level keys:`, Object.keys(json as object));
  return json;
}

/**
 * Load agency reference data from USASpending API and seed the agencies table.
 */
export async function loadAgencies(env: Env): Promise<number> {
  const db = drizzle(env.DB);

  const data = await fetchJson(`${USA_SPENDING_BASE}/api/v2/references/toptier_agencies/`) as Record<string, unknown>;

  // USASpending returns { results: [...] }
  const results = (data.results ?? data.agency_list ?? []) as Array<Record<string, unknown>>;
  console.log(`[references] agencies: ${results.length} results`);

  let count = 0;
  for (const agency of results) {
    const name = (agency.agency_name ?? agency.name ?? '') as string;
    if (!name) continue;
    const slug = toSlug(name);
    const existing = await db.select({ id: agencies.id }).from(agencies).where(eq(agencies.slug, slug)).get();
    if (!existing) {
      await db.insert(agencies).values({
        toptierId: (agency.agency_id ?? agency.id ?? null) as number | null,
        toptierCode: (agency.toptier_code ?? null) as string | null,
        name,
        abbreviation: (agency.abbreviation ?? null) as string | null,
        slug,
      });
      count++;
    }
  }
  return count;
}

interface PscNode {
  id: string;
  description: string;
  count: number;
  children?: PscNode[] | null;
}

/**
 * Load PSC code reference data from USASpending API and seed the psc_codes table.
 */
export async function loadPscCodes(env: Env): Promise<number> {
  const db = drizzle(env.DB);

  const data = await fetchJson(`${USA_SPENDING_BASE}/api/v2/references/filter_tree/psc/`) as Record<string, unknown>;

  const topNodes = (data.data ?? data.results ?? []) as PscNode[];
  console.log(`[references] psc top nodes: ${topNodes.length}`);

  let count = 0;

  async function processNode(node: PscNode, parentCode: string | null, categorySlug: string | null, categoryName: string | null): Promise<void> {
    const isCategory = Array.isArray(node.children) && node.children.length > 0;
    const slug = isCategory ? toSlug(node.description) : categorySlug;
    const name = isCategory ? node.description : categoryName;

    const existing = await db.select({ id: pscCodes.id }).from(pscCodes).where(eq(pscCodes.code, node.id)).get();
    if (!existing) {
      await db.insert(pscCodes).values({
        code: node.id,
        description: node.description,
        categorySlug: slug,
        categoryName: name,
        parentCode,
      });
      count++;
    }

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        await processNode(child, node.id, slug, name);
      }
    }
  }

  for (const topNode of topNodes) {
    await processNode(topNode, null, null, null);
  }

  return count;
}

interface NaicsEntry {
  naics_code: string;
  naics_description: string;
}

/**
 * Load NAICS code reference data from USASpending API and seed the naics_codes table.
 */
export async function loadNaicsCodes(env: Env): Promise<number> {
  const db = drizzle(env.DB);

  const data = await fetchJson(`${USA_SPENDING_BASE}/api/v2/references/naics/`) as Record<string, unknown>;

  const results = (data.results ?? data.data ?? []) as NaicsEntry[];
  console.log(`[references] naics: ${results.length} results`);

  let count = 0;
  for (const naics of results) {
    if (!naics.naics_code || !naics.naics_description) continue;
    const slug = toSlug(naics.naics_description);
    const sectorCode = naics.naics_code.substring(0, 2);

    const existing = await db.select({ id: naicsCodes.id }).from(naicsCodes).where(eq(naicsCodes.code, naics.naics_code)).get();
    if (!existing) {
      await db.insert(naicsCodes).values({
        code: naics.naics_code,
        description: naics.naics_description,
        slug,
        sectorCode,
        sectorName: null,
      });
      count++;
    }
  }
  return count;
}

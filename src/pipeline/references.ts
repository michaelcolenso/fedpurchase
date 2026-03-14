import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { agencies, pscCodes, naicsCodes } from '../schema';
import { toSlug } from '../lib/slug';
import type { Env } from '../types';

const USA_SPENDING_BASE = 'https://api.usaspending.gov';

/**
 * Load agency reference data from USASpending API and seed the agencies table.
 */
export async function loadAgencies(env: Env): Promise<number> {
  const db = drizzle(env.DB);

  const response = await fetch(`${USA_SPENDING_BASE}/api/v2/references/toptier_agencies/`, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`USASpending agency API error: ${response.status}`);
  }

  const data = await response.json() as {
    results: Array<{
      agency_id: number;
      toptier_code: string;
      abbreviation: string;
      agency_name: string;
    }>;
  };

  let count = 0;
  for (const agency of data.results) {
    const slug = toSlug(agency.agency_name);
    const existing = await db.select().from(agencies).where(eq(agencies.slug, slug)).get();

    if (!existing) {
      await db.insert(agencies).values({
        toptierId: agency.agency_id,
        toptierCode: agency.toptier_code,
        name: agency.agency_name,
        abbreviation: agency.abbreviation,
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
  children?: PscNode[];
}

/**
 * Load PSC code reference data from USASpending API and seed the psc_codes table.
 */
export async function loadPscCodes(env: Env): Promise<number> {
  const db = drizzle(env.DB);

  const response = await fetch(`${USA_SPENDING_BASE}/api/v2/references/filter_tree/psc/`, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`USASpending PSC API error: ${response.status}`);
  }

  const data = await response.json() as { data: PscNode[] };

  let count = 0;

  async function processNode(node: PscNode, parentCode: string | null, categorySlug: string | null, categoryName: string | null): Promise<void> {
    // Top-level nodes are broad categories (e.g. "10" = Weapons)
    // Leaf nodes are actual PSC codes
    const isCategory = node.children && node.children.length > 0;
    const slug = isCategory ? toSlug(node.description) : categorySlug;
    const name = isCategory ? node.description : categoryName;

    const existing = await db.select().from(pscCodes).where(eq(pscCodes.code, node.id)).get();

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

    if (node.children) {
      for (const child of node.children) {
        await processNode(child, node.id, slug, name);
      }
    }
  }

  for (const topNode of data.data) {
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

  const response = await fetch(`${USA_SPENDING_BASE}/api/v2/references/naics/`, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`USASpending NAICS API error: ${response.status}`);
  }

  const data = await response.json() as { results: NaicsEntry[] };

  let count = 0;
  for (const naics of data.results) {
    const slug = toSlug(naics.naics_description);
    const sectorCode = naics.naics_code.substring(0, 2);

    const existing = await db.select().from(naicsCodes).where(eq(naicsCodes.code, naics.naics_code)).get();

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

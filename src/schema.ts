import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

export const agencies = sqliteTable('agencies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  toptierId: integer('toptier_id'),
  toptierCode: text('toptier_code'),
  name: text('name').notNull(),
  abbreviation: text('abbreviation'),
  slug: text('slug').notNull().unique(),
});

export const pscCodes = sqliteTable('psc_codes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(),
  description: text('description').notNull(),
  categorySlug: text('category_slug'),
  categoryName: text('category_name'),
  parentCode: text('parent_code'),
});

export const naicsCodes = sqliteTable('naics_codes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(),
  description: text('description').notNull(),
  slug: text('slug').notNull(),
  sectorCode: text('sector_code'),
  sectorName: text('sector_name'),
});

export const microPurchases = sqliteTable('micro_purchases', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  awardId: text('award_id').notNull(),
  agencyId: integer('agency_id').references(() => agencies.id),
  pscCode: text('psc_code'),
  naicsCode: text('naics_code'),
  recipientName: text('recipient_name'),
  recipientUei: text('recipient_uei'),
  amount: real('amount').notNull(),
  actionDate: text('action_date'),
  fiscalYear: integer('fiscal_year'),
  description: text('description'),
  placeState: text('place_state'),
  placeCity: text('place_city'),
}, (table) => ({
  agencyPscIdx: index('idx_agency_psc').on(table.agencyId, table.pscCode),
  agencyNaicsIdx: index('idx_agency_naics').on(table.agencyId, table.naicsCode),
  recipientIdx: index('idx_recipient').on(table.recipientUei),
  fyIdx: index('idx_fy').on(table.fiscalYear),
}));

export const agencyPscRollups = sqliteTable('agency_psc_rollups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agencyId: integer('agency_id').references(() => agencies.id),
  pscCode: text('psc_code'),
  categorySlug: text('category_slug'),
  fiscalYear: integer('fiscal_year'),
  totalAmount: real('total_amount'),
  transactionCount: integer('transaction_count'),
  uniqueVendors: integer('unique_vendors'),
  topVendorName: text('top_vendor_name'),
  topVendorAmount: real('top_vendor_amount'),
  avgTransactionSize: real('avg_transaction_size'),
  yoyGrowthPct: real('yoy_growth_pct'),
  updatedAt: text('updated_at'),
}, (table) => ({
  slugIdx: index('idx_rollup_slug').on(table.agencyId, table.categorySlug, table.fiscalYear),
}));

export const agencyNaicsRollups = sqliteTable('agency_naics_rollups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agencyId: integer('agency_id').references(() => agencies.id),
  naicsCode: text('naics_code'),
  naicsSlug: text('naics_slug'),
  fiscalYear: integer('fiscal_year'),
  totalAmount: real('total_amount'),
  transactionCount: integer('transaction_count'),
  uniqueVendors: integer('unique_vendors'),
  topVendorName: text('top_vendor_name'),
  topVendorAmount: real('top_vendor_amount'),
  avgTransactionSize: real('avg_transaction_size'),
  yoyGrowthPct: real('yoy_growth_pct'),
  updatedAt: text('updated_at'),
}, (table) => ({
  naicsSlugIdx: index('idx_naics_rollup').on(table.agencyId, table.naicsCode, table.fiscalYear),
}));

export const vendorProfiles = sqliteTable('vendor_profiles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  uei: text('uei').notNull().unique(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  totalMicroPurchaseAmount: real('total_micro_purchase_amount'),
  totalTransactions: integer('total_transactions'),
  agencyCount: integer('agency_count'),
  topAgencyName: text('top_agency_name'),
  topPscCategory: text('top_psc_category'),
  firstSeen: text('first_seen'),
  lastSeen: text('last_seen'),
  updatedAt: text('updated_at'),
});

export const vendorAgencyRollups = sqliteTable('vendor_agency_rollups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  vendorId: integer('vendor_id').references(() => vendorProfiles.id),
  agencyId: integer('agency_id').references(() => agencies.id),
  totalAmount: real('total_amount'),
  transactionCount: integer('transaction_count'),
  updatedAt: text('updated_at'),
}, (table) => ({
  vendorAgencyIdx: index('idx_vendor_agency').on(table.vendorId, table.agencyId),
}));

export const pageMetadata = sqliteTable('page_metadata', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  path: text('path').notNull().unique(),
  title: text('title'),
  description: text('description'),
  h1: text('h1'),
  updatedAt: text('updated_at'),
});

-- GovPurchase Intel — Initial Schema Migration

CREATE TABLE IF NOT EXISTS `agencies` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `toptier_id` integer,
  `toptier_code` text,
  `name` text NOT NULL,
  `abbreviation` text,
  `slug` text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS `psc_codes` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `code` text NOT NULL UNIQUE,
  `description` text NOT NULL,
  `category_slug` text,
  `category_name` text,
  `parent_code` text
);

CREATE TABLE IF NOT EXISTS `naics_codes` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `code` text NOT NULL UNIQUE,
  `description` text NOT NULL,
  `slug` text NOT NULL,
  `sector_code` text,
  `sector_name` text
);

CREATE TABLE IF NOT EXISTS `micro_purchases` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `award_id` text NOT NULL,
  `agency_id` integer REFERENCES `agencies`(`id`),
  `psc_code` text,
  `naics_code` text,
  `recipient_name` text,
  `recipient_uei` text,
  `amount` real NOT NULL,
  `action_date` text,
  `fiscal_year` integer,
  `description` text,
  `place_state` text,
  `place_city` text
);

CREATE INDEX IF NOT EXISTS `idx_agency_psc` ON `micro_purchases` (`agency_id`, `psc_code`);
CREATE INDEX IF NOT EXISTS `idx_agency_naics` ON `micro_purchases` (`agency_id`, `naics_code`);
CREATE INDEX IF NOT EXISTS `idx_recipient` ON `micro_purchases` (`recipient_uei`);
CREATE INDEX IF NOT EXISTS `idx_fy` ON `micro_purchases` (`fiscal_year`);

CREATE TABLE IF NOT EXISTS `agency_psc_rollups` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `agency_id` integer REFERENCES `agencies`(`id`),
  `psc_code` text,
  `category_slug` text,
  `fiscal_year` integer,
  `total_amount` real,
  `transaction_count` integer,
  `unique_vendors` integer,
  `top_vendor_name` text,
  `top_vendor_amount` real,
  `avg_transaction_size` real,
  `yoy_growth_pct` real,
  `updated_at` text
);

CREATE INDEX IF NOT EXISTS `idx_rollup_slug` ON `agency_psc_rollups` (`agency_id`, `category_slug`, `fiscal_year`);

CREATE TABLE IF NOT EXISTS `agency_naics_rollups` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `agency_id` integer REFERENCES `agencies`(`id`),
  `naics_code` text,
  `naics_slug` text,
  `fiscal_year` integer,
  `total_amount` real,
  `transaction_count` integer,
  `unique_vendors` integer,
  `top_vendor_name` text,
  `top_vendor_amount` real,
  `avg_transaction_size` real,
  `yoy_growth_pct` real,
  `updated_at` text
);

CREATE INDEX IF NOT EXISTS `idx_naics_rollup` ON `agency_naics_rollups` (`agency_id`, `naics_code`, `fiscal_year`);

CREATE TABLE IF NOT EXISTS `vendor_profiles` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `uei` text NOT NULL UNIQUE,
  `name` text NOT NULL,
  `slug` text NOT NULL UNIQUE,
  `total_micro_purchase_amount` real,
  `total_transactions` integer,
  `agency_count` integer,
  `top_agency_name` text,
  `top_psc_category` text,
  `first_seen` text,
  `last_seen` text,
  `updated_at` text
);

CREATE TABLE IF NOT EXISTS `vendor_agency_rollups` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `vendor_id` integer REFERENCES `vendor_profiles`(`id`),
  `agency_id` integer REFERENCES `agencies`(`id`),
  `total_amount` real,
  `transaction_count` integer,
  `updated_at` text
);

CREATE INDEX IF NOT EXISTS `idx_vendor_agency` ON `vendor_agency_rollups` (`vendor_id`, `agency_id`);

CREATE TABLE IF NOT EXISTS `page_metadata` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `path` text NOT NULL UNIQUE,
  `title` text,
  `description` text,
  `h1` text,
  `updated_at` text
);

-- ============================================================
-- CardVault — Migration 0002: Per-user D1 databases
-- Each user gets their own isolated D1. The main DB only stores
-- the user → database mapping. Shared data tables are dropped.
-- ============================================================

-- Add D1 database ID to users
ALTER TABLE users ADD COLUMN d1_database_id TEXT;

-- Drop shared data tables (each user now has their own DB)
DROP TABLE IF EXISTS card_validations;
DROP TABLE IF EXISTS card_codes;
DROP TABLE IF EXISTS push_tokens;
-- Keep share_links in main DB for fast public link resolution
-- (token → user_id → d1_database_id)

-- ============================================================
-- CardVault — D1 schema (Cloudflare)
-- Auth is handled by Firebase Authentication: the users table keys
-- off the Firebase UID. No passwords are stored here.
-- Apply: wrangler d1 execute cardvault-db --file workers/api/migrations/0001_init.sql --remote
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  firebase_uid TEXT UNIQUE NOT NULL,
  email        TEXT NOT NULL,
  name         TEXT,
  is_admin     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- One permanent share link per user (user_id UNIQUE enforces it)
CREATE TABLE IF NOT EXISTS share_links (
  id         TEXT PRIMARY KEY,
  token      TEXT UNIQUE NOT NULL,
  user_id    TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS card_codes (
  id         TEXT PRIMARY KEY,
  user_id    TEXT REFERENCES users(id) ON DELETE CASCADE,
  code       TEXT NOT NULL,
  is_used    INTEGER NOT NULL DEFAULT 0,
  used_at    TEXT,
  created_at TEXT NOT NULL,
  notes      TEXT,
  UNIQUE(user_id, code)
);
CREATE INDEX IF NOT EXISTS idx_codes_user ON card_codes(user_id);

CREATE TABLE IF NOT EXISTS card_validations (
  id         TEXT PRIMARY KEY,
  card_code  TEXT NOT NULL,
  image_url  TEXT,
  status     TEXT NOT NULL CHECK (status IN ('pending','valid','used','invalid')),
  link_id    TEXT REFERENCES share_links(id) ON DELETE SET NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_validations_created ON card_validations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_validations_status ON card_validations(status);

-- Admin devices registered for FCM push
CREATE TABLE IF NOT EXISTS push_tokens (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform   TEXT,
  created_at TEXT NOT NULL
);

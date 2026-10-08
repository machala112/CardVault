// workers/api/src/userdb.js — Per-user D1 database management
// Each user gets their own isolated D1 database. No shared data tables.

const CF_API = 'https://api.cloudflare.com/client/v4';

async function cfRequest(env, path, method = 'GET', body = null) {
  const headers = {
    'Authorization': `Bearer ${env.CF_API_TOKEN}`,
    'Content-Type': 'application/json',
  };
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${CF_API}/accounts/${env.CF_ACCOUNT_ID}${path}`, opts);
  const data = await res.json();
  if (!data.success) {
    throw new Error(`Cloudflare API error: ${JSON.stringify(data.errors)}`);
  }
  return data.result;
}

// Create a new D1 database for a user
export async function createUserDatabase(env, firebaseUid) {
  const dbName = `cardvault-user-${firebaseUid.slice(0, 12)}`;
  const db = await cfRequest(env, '/d1/database', 'POST', { name: dbName });

  // Run schema migration on the new database
  await migrateUserDatabase(env, db.uuid);

  return db.uuid;
}

// Run the per-user schema on a D1 database via REST API
export async function migrateUserDatabase(env, dbUuid) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS card_codes (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      is_used INTEGER DEFAULT 0,
      used_at TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS card_validations (
      id TEXT PRIMARY KEY,
      card_code TEXT NOT NULL,
      image_url TEXT,
      status TEXT NOT NULL,
      link_id TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS share_links (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS push_tokens (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      platform TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS images (
      id TEXT PRIMARY KEY,
      data_url TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_codes_code ON card_codes(code)`,
    `CREATE INDEX IF NOT EXISTS idx_validations_created ON card_validations(created_at DESC)`,
  ];

  for (const sql of statements) {
    await cfRequest(env, `/d1/database/${dbUuid}/query`, 'POST', { sql });
  }
}

// Query a user's database via D1 REST API
export async function queryUserDb(env, dbUuid, sql, params = []) {
  const result = await cfRequest(env, `/d1/database/${dbUuid}/query`, 'POST', {
    sql,
    params,
  });
  return result[0]?.results || [];
}

// Get a single row
export async function queryUserDbFirst(env, dbUuid, sql, params = []) {
  const rows = await queryUserDb(env, dbUuid, sql, params);
  return rows[0] || null;
}

// Run a write (INSERT/UPDATE/DELETE)
export async function execUserDb(env, dbUuid, sql, params = []) {
  const result = await cfRequest(env, `/d1/database/${dbUuid}/query`, 'POST', {
    sql,
    params,
  });
  return result[0]?.meta || {};
}

// CardVault API — Cloudflare Worker.
// Auth is handled by Firebase Authentication: clients sign in with Firebase
// and send the Firebase ID token as `Authorization: Bearer <token>`.
// The Worker verifies the token (see auth.js), keeps the user record +
// permanent share link in D1, stores card images in R2, and sends Firebase
// push on every validation. Static dashboard served from [assets].

import {
  newId, newLinkToken, nowIso,
  verifyIdToken, getAuthUser, ensureShareLink,
} from './auth.js';
import { sendValidationPush } from './fcm.js';
import { createUserDatabase, queryUserDb, queryUserDbFirst, execUserDb } from './userdb.js';

// ── helpers ────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json', ...CORS },
});
const err = (message, status = 400) => json({ error: message }, status);

const originOf = (request) => new URL(request.url).origin;

async function readBody(request) {
  try { return await request.json(); }
  catch { return {}; }
}

async function requireUser(request, env) {
  const user = await getAuthUser(request, env);
  if (!user) throw err('Not signed in', 401);
  return user;
}

// ── public config + auth sync ──────────────────────────────────

// Firebase web config for client SDKs. The apiKey is public-by-design
// (it ships inside every Firebase client app); restrict it by domain/app
// in the Google Cloud console if desired.
async function handleConfig(request, env) {
  if (!env.FIREBASE_WEB_API_KEY) return err('Server misconfigured', 500);
  return json({
    apiKey: env.FIREBASE_WEB_API_KEY,
    authDomain: 'cardvault-ec7f8.firebaseapp.com',
    projectId: 'cardvault-ec7f8',
  });
}

// Called once after Firebase sign-in (and on app start with an existing
// Firebase session): verifies the ID token, upserts the user row, makes
// sure the permanent share link exists, returns both.
async function handleAuthSync(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return err('Missing ID token', 401);
  let verified;
  try {
    verified = await verifyIdToken(env, m[1].trim());
  } catch (e) {
    console.error('token verification error:', e.message);
    return err('Authentication failed', 401);
  }
  if (!verified) return err('Invalid or expired sign-in', 401);

  const id = newId();
  await env.DB.prepare(
    `INSERT INTO users (id, firebase_uid, email, name, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(firebase_uid) DO UPDATE SET
       email = excluded.email,
       name = COALESCE(excluded.name, users.name)`
  ).bind(id, verified.uid, verified.email, verified.name, nowIso()).run();

  let user = await env.DB.prepare(
    'SELECT id, email, name, d1_database_id, created_at FROM users WHERE firebase_uid = ?'
  ).bind(verified.uid).first();

  // Create per-user D1 database on first sync (if not exists)
  if (!user.d1_database_id) {
    try {
      const dbUuid = await createUserDatabase(env, verified.uid);
      await env.DB.prepare(
        'UPDATE users SET d1_database_id = ? WHERE id = ?'
      ).bind(dbUuid, user.id).run();
      user.d1_database_id = dbUuid;
    } catch (e) {
      console.error('Failed to create user database:', e.message);
      return err('Failed to provision your database. Please try again.', 500);
    }
  }

  const link = await ensureShareLink(env, originOf(request), user.id);
  return json({ user: { id: user.id, email: user.email, name: user.name, created_at: user.created_at }, link });
}

// Helper: get user's D1 database ID
async function getUserDbId(env, userId) {
  const row = await env.DB.prepare(
    'SELECT d1_database_id FROM users WHERE id = ?'
  ).bind(userId).first();
  return row?.d1_database_id || null;
}

// ── share links ────────────────────────────────────────────────

async function handleMyLink(request, env) {
  const user = await requireUser(request, env);
  return json({ link: await ensureShareLink(env, originOf(request), user.id) });
}

async function handleRegenerateLink(request, env) {
  const user = await requireUser(request, env);
  const token = newLinkToken();
  await env.DB.prepare(
    'INSERT INTO share_links (id, token, user_id, created_at) VALUES (?, ?, ?, ?) ' +
    'ON CONFLICT(user_id) DO UPDATE SET token = excluded.token'
  ).bind(newId(), token, user.id, nowIso()).run();
  return json({ link: `${originOf(request)}/#/r/${token}` });
}

async function resolveLink(env, token) {
  if (!token || typeof token !== 'string') return null;
  return env.DB.prepare(
    `SELECT l.id, l.token, l.user_id, u.name AS owner_name, u.d1_database_id
     FROM share_links l JOIN users u ON u.id = l.user_id
     WHERE l.token = ?`
  ).bind(token).first();
}

async function handleResolveLink(request, env) {
  const token = new URL(request.url).searchParams.get('token');
  const link = await resolveLink(env, token);
  if (!link) return json({ valid: false });
  return json({ valid: true, owner_name: link.owner_name || 'CardVault user' });
}

// ── upload + validation ────────────────────────────────────────

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

async function handleUpload(request, env) {
  let form;
  try { form = await request.formData(); }
  catch { return err('Expected a multipart form upload'); }
  const linkToken = form.get('link_token');
  const link = await resolveLink(env, linkToken);
  if (!link) return err('Invalid share link', 403);

  const file = form.get('image');
  if (!file || typeof file === 'string') return err('No image file provided');
  if (!file.type.startsWith('image/')) return err('Only image files are allowed');
  if (file.size > MAX_IMAGE_BYTES) return err('Image must be under 8 MB');

  const dbId = link.d1_database_id;
  const imgId = newId();
  const contentType = file.type.split(';')[0] || 'image/jpeg';

  if (env.IMAGES) {
    // R2 path (preferred when configured)
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
    const key = `uploads/${imgId}.${ext}`;
    await env.IMAGES.put(key, file.stream(), {
      httpMetadata: { contentType },
    });
    return json({ image_url: `/img/${key}` });
  }

  // D1 fallback: store as base64 data URL (R2 not configured).
  // Ensure the images table exists (covers pre-existing user DBs).
  await execUserDb(env, dbId,
    `CREATE TABLE IF NOT EXISTS images (
       id TEXT PRIMARY KEY, data_url TEXT NOT NULL, created_at TEXT NOT NULL
     )`);
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  const CHUNK = 8192;
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, buf.subarray(i, i + CHUNK));
  }
  const dataUrl = `data:${contentType};base64,${btoa(bin)}`;
  await execUserDb(env, dbId,
    'INSERT INTO images (id, data_url, created_at) VALUES (?, ?, ?)',
    [imgId, dataUrl, nowIso()]);
  return json({ image_url: `/img/${imgId}` });
}

async function handleValidate(request, env, ctx) {
  const { code = '', link_token = '', image_url = null } = await readBody(request);
  const link = await resolveLink(env, link_token);
  if (!link) return err('Invalid share link', 403);
  const clean = code.trim().toUpperCase();
  if (!clean) return err('Enter a card code');

  const dbId = link.d1_database_id;
  if (!dbId) return err('User database not provisioned', 500);

  const row = await queryUserDbFirst(env, dbId,
    'SELECT id, is_used FROM card_codes WHERE code = ?', [clean]);

  let status;
  if (!row) {
    status = 'invalid';
  } else {
    const upd = await execUserDb(env, dbId,
      'UPDATE card_codes SET is_used = 1, used_at = ? WHERE code = ? AND is_used = 0',
      [nowIso(), clean]);
    status = upd.changes > 0 ? 'valid' : 'used';
  }

  const ip = request.headers.get('CF-Connecting-IP') || null;
  const agent = (request.headers.get('User-Agent') || '').slice(0, 300);
  await execUserDb(env, dbId,
    `INSERT INTO card_validations
       (id, card_code, image_url, status, link_id, ip_address, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [newId(), clean, image_url, status, link.id, ip, agent, nowIso()]);

  // Instant push to the link OWNER's devices only — never blocks the response.
  // Deduplicate: skip the push if the same code was validated in the last 90s
  // (prevents notification spam from double-taps/retries).
  ctx.waitUntil((async () => {
    try {
      const recent = await queryUserDbFirst(env, dbId,
        `SELECT COUNT(*) AS n FROM card_validations
         WHERE card_code = ? AND julianday(created_at) > julianday('now', '-90 seconds')`, [clean]);
      if ((recent?.n || 0) > 1) return; // this row + at least one earlier = duplicate
    } catch (e) { /* fall through and send */ }
    await sendValidationPush(env, link.d1_database_id, {
      title: status === 'valid' ? '✅ Card validated'
           : status === 'used'   ? '⚠️ Card already used'
           :                       '❌ Invalid card code',
      body: `Code ${clean} via ${link.owner_name || 'a shared link'}`,
    });
  })());

  return json({ status, code: clean });
}

async function handleImage(request, env, key) {
  // R2 path
  if (env.IMAGES) {
    const obj = await env.IMAGES.get(key);
    if (obj) {
      const headers = { ...CORS, 'Cache-Control': 'public, max-age=31536000' };
      if (obj.httpMetadata?.contentType) headers['content-type'] = obj.httpMetadata.contentType;
      return new Response(obj.body, { headers });
    }
  }
  // D1 fallback: key may be a bare image id (no slashes) stored per-user.
  // We don't know the owner from the key alone, so scan user DBs (few users).
  if (key && !key.includes('/')) {
    try {
      const users = await env.DB.prepare(
        'SELECT d1_database_id FROM users WHERE d1_database_id IS NOT NULL'
      ).all();
      for (const u of (users.results || [])) {
        try {
          const row = await queryUserDbFirst(env, u.d1_database_id,
            'SELECT data_url FROM images WHERE id = ?', [key]);
          if (row?.data_url) {
            const m = row.data_url.match(/^data:([^;]+);base64,(.+)$/);
            if (!m) return err('Not found', 404);
            const bin = atob(m[2]);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            return new Response(bytes, {
              headers: { ...CORS, 'content-type': m[1], 'Cache-Control': 'public, max-age=31536000' },
            });
          }
        } catch (e) { /* try next */ }
      }
    } catch (e) { /* fall through */ }
  }
  return err('Not found', 404);
}

// ── admin ──────────────────────────────────────────────────────

async function handleAdminValidations(request, env) {
  const user = await requireUser(request, env);
  const dbId = await getUserDbId(env, user.id);
  if (!dbId) return err('Database not provisioned', 500);
  const params = new URL(request.url).searchParams;
  const limit = Math.min(Math.max(parseInt(params.get('limit') || '50', 10), 1), 200);
  const status = params.get('status');
  let q = 'SELECT * FROM card_validations';
  const binds = [];
  if (status) { q += ' WHERE status = ?'; binds.push(status); }
  q += ' ORDER BY created_at DESC LIMIT ?';
  binds.push(limit);
  const rows = await queryUserDb(env, dbId, q, binds);
  return json(rows);
}

async function handleAdminValidationDetail(request, env, id) {
  const user = await requireUser(request, env);
  const dbId = await getUserDbId(env, user.id);
  if (!dbId) return err('Database not provisioned', 500);
  const row = await queryUserDbFirst(env, dbId,
    'SELECT * FROM card_validations WHERE id = ?', [id]);
  if (!row) return err('Not found', 404);
  return json(row);
}

async function handleAdminStats(request, env) {
  const user = await requireUser(request, env);
  const dbId = await getUserDbId(env, user.id);
  if (!dbId) return err('Database not provisioned', 500);
  const count = async (sql, ...b) =>
    (await queryUserDbFirst(env, dbId, sql, b))?.n || 0;
  const [total, valid, used, invalid, codesTotal, codesUnused] = await Promise.all([
    count('SELECT COUNT(*) n FROM card_validations'),
    count("SELECT COUNT(*) n FROM card_validations WHERE status = 'valid'"),
    count("SELECT COUNT(*) n FROM card_validations WHERE status = 'used'"),
    count("SELECT COUNT(*) n FROM card_validations WHERE status = 'invalid'"),
    count('SELECT COUNT(*) n FROM card_codes'),
    count('SELECT COUNT(*) n FROM card_codes WHERE is_used = 0'),
  ]);
  return json({ total, valid, used, invalid, pending: 0, codes_total: codesTotal, codes_unused: codesUnused });
}

async function handleAdminCodes(request, env) {
  const user = await requireUser(request, env);
  const dbId = await getUserDbId(env, user.id);
  if (!dbId) return err('Database not provisioned', 500);
  const rows = await queryUserDb(env, dbId,
    'SELECT id, code, is_used, used_at, created_at FROM card_codes ORDER BY created_at DESC');
  return json(rows.map(r => ({ ...r, is_used: !!r.is_used })));
}

async function handleAdminAddCode(request, env) {
  const user = await requireUser(request, env);
  const dbId = await getUserDbId(env, user.id);
  if (!dbId) return err('Database not provisioned', 500);
  const { code = '' } = await readBody(request);
  const clean = code.trim().toUpperCase();
  if (!clean) return err('Enter a code');
  try {
    await execUserDb(env, dbId,
      'INSERT INTO card_codes (id, code, created_at) VALUES (?, ?, ?)',
      [newId(), clean, nowIso()]);
  } catch {
    return err('You already have that code', 409);
  }
  return json({ ok: true, code: clean });
}

async function handleAdminDeleteCode(request, env, id) {
  const user = await requireUser(request, env);
  const dbId = await getUserDbId(env, user.id);
  if (!dbId) return err('Database not provisioned', 500);
  await execUserDb(env, dbId, 'DELETE FROM card_codes WHERE id = ?', [id]);
  return json({ ok: true });
}

async function handleAdminPushToken(request, env) {
  const user = await requireUser(request, env);
  const dbId = await getUserDbId(env, user.id);
  if (!dbId) return err('Database not provisioned', 500);
  const { token = '', platform = '' } = await readBody(request);
  if (!token) return err('Missing device token');
  const cleanToken = token.trim();
  await execUserDb(env, dbId,
    `INSERT INTO push_tokens (id, token, platform, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(token) DO UPDATE SET platform = excluded.platform`,
    [newId(), cleanToken, platform.slice(0, 20) || null, nowIso()]);
  // CRITICAL: A device token belongs to exactly one user. If this device
  // was previously logged into a different account, its token is still in
  // that account's database — remove it so notifications never leak across users.
  try {
    const others = await env.DB.prepare(
      'SELECT d1_database_id FROM users WHERE id != ? AND d1_database_id IS NOT NULL'
    ).bind(user.id).all();
    for (const o of (others.results || [])) {
      try {
        await execUserDb(env, o.d1_database_id,
          'DELETE FROM push_tokens WHERE token = ?', [cleanToken]);
      } catch (e) { /* best-effort cleanup */ }
    }
  } catch (e) { /* best-effort cleanup */ }
  return json({ ok: true });
}

// ── router ─────────────────────────────────────────────────────

async function handleApi(request, env, ctx) {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/config' && request.method === 'GET') return await handleConfig(request, env);
    if (path === '/api/auth/sync' && request.method === 'POST') return await handleAuthSync(request, env);
    if (path === '/api/auth/me' && request.method === 'GET') {
      const user = await requireUser(request, env);
      return json({ user });
    }
    if (path === '/api/links/mine' && request.method === 'GET') return await handleMyLink(request, env);
    if (path === '/api/links/regenerate' && request.method === 'POST') return await handleRegenerateLink(request, env);
    if (path === '/api/links/resolve' && request.method === 'GET') return await handleResolveLink(request, env);
    if (path === '/api/upload' && request.method === 'POST') return await handleUpload(request, env);
    if (path === '/api/validate' && request.method === 'POST') return await handleValidate(request, env, ctx);

    if (path === '/api/admin/validations' && request.method === 'GET') return await handleAdminValidations(request, env);
    if (path === '/api/admin/stats' && request.method === 'GET') return await handleAdminStats(request, env);
    if (path === '/api/admin/codes' && request.method === 'GET') return await handleAdminCodes(request, env);
    if (path === '/api/admin/codes' && request.method === 'POST') return await handleAdminAddCode(request, env);
    if (path === '/api/admin/push-tokens' && request.method === 'POST') return await handleAdminPushToken(request, env);

    let m = path.match(/^\/api\/admin\/validations\/([^/]+)$/);
    if (m && request.method === 'GET') return await handleAdminValidationDetail(request, env, m[1]);
    m = path.match(/^\/api\/admin\/codes\/([^/]+)$/);
    if (m && request.method === 'DELETE') return await handleAdminDeleteCode(request, env, m[1]);

    return err('Not found', 404);
  } catch (r) {
    // requireUser throws Response errors via err()
    if (r instanceof Response) return r;
    console.error('API error:', r);
    return err('Something went wrong', 500);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env, ctx);
    if (url.pathname.startsWith('/img/')) {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      return handleImage(request, env, url.pathname.slice(5));
    }
    // Everything else: the static dashboard (SPA uses hash routes, e.g. /#/r/<token>)
    return env.ASSETS.fetch(request);
  },
};

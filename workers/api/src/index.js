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

async function requireAdmin(request, env) {
  const user = await requireUser(request, env);
  if (!user.is_admin) throw err('Admin only', 403);
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

  const adminEmail = (env.ADMIN_EMAIL || '').trim().toLowerCase();
  const isAdmin = adminEmail && verified.email === adminEmail ? 1 : 0;
  const id = newId();
  await env.DB.prepare(
    `INSERT INTO users (id, firebase_uid, email, name, is_admin, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(firebase_uid) DO UPDATE SET
       email = excluded.email,
       name = COALESCE(excluded.name, users.name),
       is_admin = excluded.is_admin`
  ).bind(id, verified.uid, verified.email, verified.name, isAdmin, nowIso()).run();

  const user = await env.DB.prepare(
    'SELECT id, email, name, is_admin, created_at FROM users WHERE firebase_uid = ?'
  ).bind(verified.uid).first();
  const link = await ensureShareLink(env, originOf(request), user.id);
  return json({ user: { ...user, is_admin: !!user.is_admin }, link });
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
    `SELECT l.id, l.token, u.name AS owner_name
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

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
  const key = `uploads/${newId()}.${ext}`;
  await env.IMAGES.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });
  return json({ image_url: `/img/${key}` });
}

async function handleValidate(request, env, ctx) {
  const { code = '', link_token = '', image_url = null } = await readBody(request);
  const link = await resolveLink(env, link_token);
  if (!link) return err('Invalid share link', 403);
  const clean = code.trim().toUpperCase();
  if (!clean) return err('Enter a card code');

  const row = await env.DB.prepare(
    'SELECT id, is_used FROM card_codes WHERE code = ?').bind(clean).first();

  let status;
  if (!row) {
    status = 'invalid';
  } else {
    const upd = await env.DB.prepare(
      'UPDATE card_codes SET is_used = 1, used_at = ? WHERE code = ? AND is_used = 0'
    ).bind(nowIso(), clean).run();
    status = upd.meta.changes > 0 ? 'valid' : 'used';
  }

  const ip = request.headers.get('CF-Connecting-IP') || null;
  const agent = (request.headers.get('User-Agent') || '').slice(0, 300);
  await env.DB.prepare(
    `INSERT INTO card_validations
       (id, card_code, image_url, status, link_id, ip_address, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(newId(), clean, image_url, status, link.id, ip, agent, nowIso()).run();

  // Instant push to admin devices — never blocks the response.
  ctx.waitUntil(sendValidationPush(env, {
    title: status === 'valid' ? '✅ Card validated'
         : status === 'used'   ? '⚠️ Card already used'
         :                       '❌ Invalid card code',
    body: `Code ${clean} via ${link.owner_name || 'a shared link'}`,
  }));

  return json({ status, code: clean });
}

async function handleImage(request, env, key) {
  const obj = await env.IMAGES.get(key);
  if (!obj) return err('Not found', 404);
  const headers = { ...CORS, 'Cache-Control': 'public, max-age=31536000' };
  if (obj.httpMetadata?.contentType) headers['content-type'] = obj.httpMetadata.contentType;
  return new Response(obj.body, { headers });
}

// ── admin ──────────────────────────────────────────────────────

async function handleAdminValidations(request, env) {
  await requireAdmin(request, env);
  const params = new URL(request.url).searchParams;
  const limit = Math.min(Math.max(parseInt(params.get('limit') || '50', 10), 1), 200);
  const status = params.get('status');
  let q = 'SELECT * FROM card_validations';
  const binds = [];
  if (status) { q += ' WHERE status = ?'; binds.push(status); }
  q += ' ORDER BY created_at DESC LIMIT ?';
  binds.push(limit);
  const rows = await env.DB.prepare(q).bind(...binds).all();
  return json(rows.results || []);
}

async function handleAdminValidationDetail(request, env, id) {
  await requireAdmin(request, env);
  const row = await env.DB.prepare(
    'SELECT * FROM card_validations WHERE id = ?').bind(id).first();
  if (!row) return err('Not found', 404);
  return json(row);
}

async function handleAdminStats(request, env) {
  await requireAdmin(request, env);
  const count = async (sql, ...b) =>
    (await env.DB.prepare(sql).bind(...b).first())?.n || 0;
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
  await requireAdmin(request, env);
  const rows = await env.DB.prepare(
    'SELECT id, code, is_used, used_at, created_at, notes FROM card_codes ORDER BY created_at DESC'
  ).all();
  return json((rows.results || []).map(r => ({ ...r, is_used: !!r.is_used })));
}

async function handleAdminAddCode(request, env) {
  await requireAdmin(request, env);
  const { code = '', notes = '' } = await readBody(request);
  const clean = code.trim().toUpperCase();
  if (!clean) return err('Enter a code');
  try {
    await env.DB.prepare(
      'INSERT INTO card_codes (id, code, notes, created_at) VALUES (?, ?, ?, ?)'
    ).bind(newId(), clean, notes.trim().slice(0, 200) || null, nowIso()).run();
  } catch {
    return err('That code already exists', 409);
  }
  return json({ ok: true, code: clean });
}

async function handleAdminDeleteCode(request, env, id) {
  await requireAdmin(request, env);
  await env.DB.prepare('DELETE FROM card_codes WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

async function handleAdminPushToken(request, env) {
  const user = await requireAdmin(request, env);
  const { token = '', platform = '' } = await readBody(request);
  if (!token) return err('Missing device token');
  await env.DB.prepare(
    `INSERT INTO push_tokens (token, user_id, platform, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id`
  ).bind(token.trim(), user.id, platform.slice(0, 20) || null, nowIso()).run();
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
    // requireUser/requireAdmin throw Response errors via err()
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

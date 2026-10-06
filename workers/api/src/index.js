// CardVault API — Cloudflare Worker.
// Auth + permanent share links + card validation + R2 image storage
// + admin endpoints + Firebase push on every validation.
// Static dashboard is served from the [assets] directory (env.ASSETS).

import {
  newId, newSalt, newToken, newLinkToken,
  hashPassword, isValidEmail, nowIso,
  getSessionUser, ensureShareLink,
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
  const user = await getSessionUser(request, env);
  if (!user) throw err('Not signed in', 401);
  return user;
}

async function requireAdmin(request, env) {
  const user = await requireUser(request, env);
  if (!user.is_admin) throw err('Admin only', 403);
  return user;
}

// ── auth ───────────────────────────────────────────────────────

async function handleSignup(request, env) {
  const { email = '', password = '', name = '' } = await readBody(request);
  const cleanEmail = email.trim().toLowerCase();
  if (!isValidEmail(cleanEmail)) return err('Enter a valid email address');
  if (typeof password !== 'string' || password.length < 8)
    return err('Password must be at least 8 characters');

  const exists = await env.DB.prepare(
    'SELECT id FROM users WHERE email = ?').bind(cleanEmail).first();
  if (exists) return err('An account with this email already exists', 409);

  const salt = newSalt();
  const id = newId();
  const adminEmail = (env.ADMIN_EMAIL || '').trim().toLowerCase();
  const isAdmin = adminEmail && cleanEmail === adminEmail ? 1 : 0;
  await env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, password_salt, name, is_admin, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, cleanEmail, await hashPassword(password, salt), salt,
         name.trim().slice(0, 80) || null, isAdmin, nowIso()).run();

  const token = newToken();
  await env.DB.prepare(
    `INSERT INTO sessions (token, user_id, expires_at, created_at)
     VALUES (?, ?, ?, ?)`
  ).bind(token, id,
         new Date(Date.now() + 30 * 864e5).toISOString(), nowIso()).run();

  const user = { id, email: cleanEmail, name: name.trim() || null, is_admin: !!isAdmin };
  const link = await ensureShareLink(env, originOf(request), id);
  return json({ user, token, link });
}

async function handleSignin(request, env) {
  const { email = '', password = '' } = await readBody(request);
  const cleanEmail = email.trim().toLowerCase();
  const row = await env.DB.prepare(
    'SELECT * FROM users WHERE email = ?').bind(cleanEmail).first();
  if (!row) return err('Email or password is incorrect', 401);
  const hash = await hashPassword(password, row.password_salt);
  if (hash !== row.password_hash) return err('Email or password is incorrect', 401);

  const token = newToken();
  await env.DB.prepare(
    `INSERT INTO sessions (token, user_id, expires_at, created_at)
     VALUES (?, ?, ?, ?)`
  ).bind(token, row.id,
         new Date(Date.now() + 30 * 864e5).toISOString(), nowIso()).run();

  const user = { id: row.id, email: row.email, name: row.name, is_admin: !!row.is_admin };
  return json({ user, token });
}

async function handleSignout(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(m[1].trim()).run();
  return json({ ok: true });
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
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    if (path === '/api/auth/signup' && request.method === 'POST') return await handleSignup(request, env);
    if (path === '/api/auth/signin' && request.method === 'POST') return await handleSignin(request, env);
    if (path === '/api/auth/signout' && request.method === 'POST') return await handleSignout(request, env);
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

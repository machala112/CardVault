// Auth helpers: PBKDF2 password hashing, session tokens, link tokens.
// Uses only WebCrypto — runs on Cloudflare Workers.

const enc = new TextEncoder();

export function newId() {
  return crypto.randomUUID();
}

export function newSalt() {
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

export function newToken(bytes = 32) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

// URL-safe token for share links (e.g. /#/r/<token>)
export function newLinkToken(length = 16) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    key, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export const nowIso = () => new Date().toISOString();

export function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// Returns the user row for a valid, unexpired Bearer session token, else null.
export async function getSessionUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1].trim();
  const sess = await env.DB.prepare(
    'SELECT user_id, expires_at FROM sessions WHERE token = ?'
  ).bind(token).first();
  if (!sess || new Date(sess.expires_at) < new Date()) {
    if (sess) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    return null;
  }
  return env.DB.prepare(
    'SELECT id, email, name, is_admin, created_at FROM users WHERE id = ?'
  ).bind(sess.user_id).first();
}

// Creates the user's permanent share link if missing; returns the full URL.
export async function ensureShareLink(env, origin, userId) {
  let link = await env.DB.prepare(
    'SELECT token FROM share_links WHERE user_id = ?'
  ).bind(userId).first();
  if (!link) {
    const token = newLinkToken();
    await env.DB.prepare(
      'INSERT INTO share_links (id, token, user_id, created_at) VALUES (?, ?, ?, ?)'
    ).bind(newId(), token, userId, nowIso()).run();
    link = { token };
  }
  return `${origin}/#/r/${link.token}`;
}

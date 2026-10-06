// Firebase Authentication for the CardVault API.
// Clients sign in/up with Firebase (email/password) and send the Firebase
// ID token as `Authorization: Bearer <token>`. We verify the token via
// Google's Identity Toolkit accounts:lookup endpoint (Google checks the
// signature; we never handle passwords) and cache the result briefly.

export function newId() {
  return crypto.randomUUID();
}

// URL-safe token for share links (e.g. /#/r/<token>)
export function newLinkToken(length = 16) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const nowIso = () => new Date().toISOString();

// Decode a JWT payload WITHOUT verifying (verification is done by Google
// via accounts:lookup; we only read exp for cache expiry).
function decodePayload(jwt) {
  const parts = String(jwt).split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}

// token -> { uid, email, name, expMs }. Bounded simple cache.
const tokenCache = new Map();
const MAX_CACHE = 500;

async function lookupToken(env, idToken) {
  const apiKey = env.FIREBASE_WEB_API_KEY;
  if (!apiKey) throw new Error('FIREBASE_WEB_API_KEY secret is not set');
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const u = (data.users || [])[0];
  if (!u || !u.localId) return null;
  const payload = decodePayload(idToken) || {};
  return {
    uid: u.localId,
    email: (u.email || '').toLowerCase(),
    name: u.displayName || null,
    expMs: (payload.exp || 0) * 1000,
  };
}

// Returns { uid, email, name } for a valid Firebase ID token, else null.
export async function verifyIdToken(env, idToken) {
  if (!idToken || typeof idToken !== 'string') return null;
  const now = Date.now();
  const cached = tokenCache.get(idToken);
  if (cached && cached.expMs > now + 60000) return cached;
  tokenCache.delete(idToken);
  const verified = await lookupToken(env, idToken);
  if (!verified) return null;
  if (tokenCache.size >= MAX_CACHE) {
    const oldest = tokenCache.keys().next().value;
    tokenCache.delete(oldest);
  }
  tokenCache.set(idToken, verified);
  return verified;
}

function bearerToken(request) {
  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

// Returns the CardVault user row for a valid Firebase ID token, else null.
export async function getAuthUser(request, env) {
  const idToken = bearerToken(request);
  if (!idToken) return null;
  let verified;
  try {
    verified = await verifyIdToken(env, idToken);
  } catch (e) {
    console.error('token verification error:', e.message);
    return null;
  }
  if (!verified) return null;
  return env.DB.prepare(
    'SELECT id, email, name, is_admin, created_at FROM users WHERE firebase_uid = ?'
  ).bind(verified.uid).first();
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

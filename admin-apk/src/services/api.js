// src/services/api.js — Cloudflare Worker REST API client
//
// Base URL comes from EXPO_PUBLIC_API_URL (no trailing slash).
// Auth: Firebase ID token as Bearer. The Firebase SDK persists the session
// itself (see ./firebase.js) — there is no custom token storage here.
// Errors: the API returns { error: "message" } with a non-2xx status.
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth';
import { auth, ready } from './firebase';

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/+$/, '');

/** Firebase ID token for the signed-in user, or null when signed out. */
async function token(forceRefresh = false) {
  await ready;
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken(forceRefresh);
}

async function doFetch(path, tokenValue, { method = 'GET', body } = {}) {
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(tokenValue ? { Authorization: `Bearer ${tokenValue}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function request(path, opts = {}) {
  if (!BASE_URL) {
    throw new Error('API URL not configured — set EXPO_PUBLIC_API_URL');
  }
  let idToken = await token();
  let res = await doFetch(path, idToken, opts);

  // Token may have expired between calls: force-refresh once and retry.
  if (res.status === 401 && idToken) {
    idToken = await token(true);
    res = await doFetch(path, idToken, opts);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty / non-JSON body */
  }
  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data;
}

// ── Auth (Firebase) ─────────────────────────────────────────────
// signin: Firebase email/password → POST /api/auth/sync (Bearer ID token)
//         → { user, link }. The SDK persists the session itself.
export async function signin(email, password) {
  await ready;
  await signInWithEmailAndPassword(auth, email.trim(), password);
  return syncUser();
}

export async function signup(email, password, name) {
  await ready;
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  if (name && cred.user) {
    try { await updateProfile(cred.user, { displayName: name.trim() }); } catch (e) { /* non-fatal */ }
  }
  return syncUser();
}

// syncUser: register/refresh this Firebase user with the backend.
// Called once after sign-in and on app start when a session exists.
export async function syncUser() {
  return request('/api/auth/sync', { method: 'POST' }); // → { user, link }
}

export async function signout() {
  await ready;
  await signOut(auth);
}

export const me = () => request('/api/auth/me'); // → { user }

// ── Validations (admin) ─────────────────────────────────────────
export function fetchValidations({ limit = 50, status = null } = {}) {
  const q = new URLSearchParams({ limit: String(limit) });
  if (status) q.set('status', status);
  return request(`/api/admin/validations?${q.toString()}`);
}

export const fetchValidation = (id) =>
  request(`/api/admin/validations/${encodeURIComponent(id)}`);

// ── Stats (admin) ───────────────────────────────────────────────
// → { total, valid, used, invalid, pending, codes_total, codes_unused }
export const fetchStats = () => request('/api/admin/stats');

// ── Card codes (admin) ──────────────────────────────────────────
export const fetchCodes = () => request('/api/admin/codes');

export const addCode = (code, notes) =>
  request('/api/admin/codes', { method: 'POST', body: { code, notes } });

export const deleteCode = (id) =>
  request(`/api/admin/codes/${encodeURIComponent(id)}`, { method: 'DELETE' });

// ── Push registration (admin) ───────────────────────────────────
export const registerPushToken = (token, platform = 'android') =>
  request('/api/admin/push-tokens', {
    method: 'POST',
    body:   { token, platform },
  });

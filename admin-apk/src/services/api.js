// src/services/api.js — Cloudflare Worker REST API client
//
// Base URL comes from EXPO_PUBLIC_API_URL (no trailing slash).
// Auth: Bearer token, persisted in AsyncStorage under 'cv_token'.
// Errors: the API returns { error: "message" } with a non-2xx status.
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL  = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/+$/, '');
const TOKEN_KEY = 'cv_token';

async function request(path, { method = 'GET', body } = {}) {
  if (!BASE_URL) {
    throw new Error('API URL not configured — set EXPO_PUBLIC_API_URL');
  }
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
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

// ── Token helpers ───────────────────────────────────────────────
export const getToken   = () => AsyncStorage.getItem(TOKEN_KEY);
export const setToken   = (t) => AsyncStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => AsyncStorage.removeItem(TOKEN_KEY);

// ── Auth ────────────────────────────────────────────────────────
export async function signin(email, password) {
  const data = await request('/api/auth/signin', {
    method: 'POST',
    body:   { email, password },
  });
  if (data && data.token) {
    await setToken(data.token);
  }
  return data; // { user, token }
}

export async function signout() {
  try {
    await request('/api/auth/signout', { method: 'POST' });
  } finally {
    await clearToken();
  }
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

// src/services/supabase.js
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Keys are injected at build time from GitHub secrets (SUPABASE_URL and
// SUPABASE_SERVICE_KEY) — the build workflow writes them into
// admin-apk/.env as EXPO_PUBLIC_* vars. Real keys are never committed.
const SUPABASE_URL         = process.env.EXPO_PUBLIC_SUPABASE_URL         || 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.EXPO_PUBLIC_SUPABASE_SERVICE_KEY || 'YOUR_SERVICE_ROLE_KEY'; // admin key — never expose to frontend

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth:    { storage: AsyncStorage, autoRefreshToken: true, persistSession: true },
  global:  { headers: { 'x-client': 'cardvalidator-admin' } },
  realtime:{ params: { eventsPerSecond: 10 } },
});

// ── Fetch recent validations ──────────────────────────────────
export async function fetchValidations({ limit = 50, status = null } = {}) {
  let q = supabase
    .from('card_validations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

// ── Fetch stats ───────────────────────────────────────────────
export async function fetchStats() {
  const { data, error } = await supabase.rpc('get_validation_stats');
  if (error) {
    // fallback: count manually
    const { data: rows } = await supabase.from('card_validations').select('status');
    const total   = rows?.length || 0;
    const valid   = rows?.filter(r => r.status === 'valid').length || 0;
    const used    = rows?.filter(r => r.status === 'used').length || 0;
    const invalid = rows?.filter(r => r.status === 'invalid').length || 0;
    return { total, valid, used, invalid };
  }
  return data;
}

// ── Subscribe to realtime inserts ─────────────────────────────
export function subscribeToValidations(onInsert) {
  return supabase
    .channel('admin-validations')
    .on('postgres_changes', {
      event:  'INSERT',
      schema: 'public',
      table:  'card_validations',
    }, payload => onInsert(payload.new))
    .subscribe();
}

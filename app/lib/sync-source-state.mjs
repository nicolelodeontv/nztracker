import { supabaseAdmin } from './supabase-admin.js';

export const DISCOVERY_CACHE_KEY = 'source:chaos:discovery';
export const DISCOVERY_MAX_AGE_MS = 5 * 60 * 1000;
export const DISCOVERY_RETRY_COOLDOWN_MS = 2 * 60 * 1000;
export const MEMBER_CACHE_MAX_AGE_MS = 30 * 60 * 1000;

const memberCacheKey = (clanId) => `source:members:${String(clanId || '').trim()}`;

async function readKey(key) {
  const db = supabaseAdmin();
  const { data, error } = await db.from('rep_tracker_kv')
    .select('value,updated_at')
    .eq('key', key)
    .maybeSingle();
  if (error) throw error;
  return data?.value && typeof data.value === 'object' ? data.value : null;
}

async function writeKey(key, value, updatedAt = new Date().toISOString()) {
  const db = supabaseAdmin();
  const { error } = await db.from('rep_tracker_kv').upsert({
    key,
    value,
    updated_at: updatedAt
  }, { onConflict: 'key' });
  if (error) throw error;
  return value;
}

export async function readDiscoveryCache() {
  return readKey(DISCOVERY_CACHE_KEY);
}

export async function writeDiscoveryCache(value) {
  const now = new Date().toISOString();
  return writeKey(DISCOVERY_CACHE_KEY, {
    ...value,
    updatedAt: now
  }, now);
}

export async function readLastKnownMembers(clanId) {
  const value = await readKey(memberCacheKey(clanId));
  if (!value) return null;
  const fetchedAtMs = Date.parse(value.fetchedAt || value.savedAt || '');
  return {
    ...value,
    ageMs: Number.isFinite(fetchedAtMs) ? Math.max(0, Date.now() - fetchedAtMs) : Infinity
  };
}

export async function writeLastKnownMembers({ clanId, members, fetchedAt, source, service }) {
  const now = new Date().toISOString();
  return writeKey(memberCacheKey(clanId), {
    version: 1,
    clanId: String(clanId),
    members: Array.isArray(members) ? members : [],
    count: Array.isArray(members) ? members.length : 0,
    fetchedAt: fetchedAt || now,
    savedAt: now,
    source: source || null,
    service: service || null
  }, now);
}

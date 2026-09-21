import { supabaseAdmin } from './supabase-admin.js';

export const MONITOR_WINDOW_MS = 60 * 1000;
const WINDOW_PREFIX = 'monitor-window:';

export function monitorWindowKey(nowMs = Date.now()) {
  return `${WINDOW_PREFIX}${Math.floor(Number(nowMs) / MONITOR_WINDOW_MS)}`;
}

export async function claimMonitorWindow(nowMs = Date.now()) {
  const db = supabaseAdmin();
  const key = monitorWindowKey(nowMs);
  const claimedAt = new Date(Number(nowMs)).toISOString();

  const { error } = await db.from('rep_tracker_kv').insert({
    key,
    value: { status: 'running', claimedAt },
    updated_at: claimedAt
  });

  if (!error) return { claimed: true, key };

  if (error.code === '23505') {
    return { claimed: false, key };
  }

  throw error;
}

export async function completeMonitorWindow(key, nowMs = Date.now()) {
  const db = supabaseAdmin();
  const completedAt = new Date(Number(nowMs)).toISOString();
  const { error } = await db.from('rep_tracker_kv')
    .update({
      value: { status: 'completed', completedAt },
      updated_at: completedAt
    })
    .eq('key', key);
  if (error) throw error;
  return { key, completedAt };
}

export async function releaseMonitorWindow(key) {
  const db = supabaseAdmin();
  const { error } = await db.from('rep_tracker_kv')
    .delete()
    .eq('key', key);
  if (error) throw error;
  return { key, released: true };
}

export async function pruneMonitorWindows(olderThanMs = 2 * 24 * 60 * 60 * 1000) {
  const db = supabaseAdmin();
  const cutoff = new Date(Date.now() - Math.max(MONITOR_WINDOW_MS, Number(olderThanMs) || 0)).toISOString();
  const { error } = await db.from('rep_tracker_kv')
    .delete()
    .like('key', `${WINDOW_PREFIX}%`)
    .lt('updated_at', cutoff);
  if (error) throw error;
  return { cutoff };
}

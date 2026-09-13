import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase credentials in environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Store clan data in database
 */
export async function saveClanData(clans, season = 2) {
  try {
    // Insert clans, replacing old ones from the same fetch batch
    const { data, error } = await supabase
      .from('clans')
      .insert(
        clans.map(clan => ({
          ...clan,
          season,
          fetched_at: new Date().toISOString()
        }))
      );

    if (error) throw error;

    // Log the sync
    await supabase
      .from('sync_log')
      .insert({
        status: 'success',
        clans_count: clans.length,
        error_message: null,
        synced_at: new Date().toISOString()
      });

    return { success: true, count: clans.length };
  } catch (error) {
    console.error('DB save error:', error);
    
    // Log the failure
    await supabase
      .from('sync_log')
      .insert({
        status: 'error',
        clans_count: 0,
        error_message: error.message,
        synced_at: new Date().toISOString()
      });

    return { success: false, error: error.message };
  }
}

/**
 * Get latest clan rankings
 */
export async function getLatestClans(limit = 100) {
  try {
    // Get the most recent batch of clans
    const { data, error } = await supabase
      .from('clans')
      .select('*')
      .order('fetched_at', { ascending: false })
      .order('rank', { ascending: true })
      .limit(limit);

    if (error) throw error;
    return { success: true, clans: data };
  } catch (error) {
    console.error('DB fetch error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get clans from a specific time
 */
export async function getClansByTime(timestamp) {
  try {
    const { data, error } = await supabase
      .from('clans')
      .select('*')
      .eq('fetched_at', timestamp)
      .order('rank', { ascending: true });

    if (error) throw error;
    return { success: true, clans: data };
  } catch (error) {
    console.error('DB fetch error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get sync history
 */
export async function getSyncHistory(limit = 50) {
  try {
    const { data, error } = await supabase
      .from('sync_log')
      .select('*')
      .order('synced_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return { success: true, logs: data };
  } catch (error) {
    console.error('DB sync history error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get single clan details + history
 */
export async function getClanDetails(clanName) {
  try {
    const { data, error } = await supabase
      .from('clans')
      .select('*')
      .ilike('name', clanName)
      .order('fetched_at', { ascending: false })
      .limit(20);

    if (error) throw error;
    return { success: true, history: data };
  } catch (error) {
    console.error('DB clan details error:', error);
    return { success: false, error: error.message };
  }
}

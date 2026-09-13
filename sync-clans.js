import { fetchClanData } from '@/lib/scraper';
import { saveClanData, getSyncHistory } from '@/lib/db';

/**
 * API Route: POST /api/sync-clans
 * Called by Vercel Cron every 5 minutes
 * Fetches clan data and saves to database
 */
export default async function handler(req, res) {
  // Verify cron secret to prevent unauthorized calls
  const cronSecret = req.headers['authorization'];
  if (cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // 1. Fetch fresh clan data from the game
    console.log('[SYNC] Starting clan data fetch...');
    const fetchResult = await fetchClanData();

    if (!fetchResult.success) {
      console.error('[SYNC] Fetch failed:', fetchResult.error);
      return res.status(500).json({
        success: false,
        error: fetchResult.error,
        timestamp: new Date().toISOString()
      });
    }

    // 2. Save to database
    console.log(`[SYNC] Fetched ${fetchResult.count} clans, saving to DB...`);
    const saveResult = await saveClanData(fetchResult.clans);

    if (!saveResult.success) {
      console.error('[SYNC] Save failed:', saveResult.error);
      return res.status(500).json({
        success: false,
        error: saveResult.error,
        timestamp: new Date().toISOString()
      });
    }

    // 3. Return success
    console.log('[SYNC] Sync completed successfully');
    return res.status(200).json({
      success: true,
      clans_synced: saveResult.count,
      timestamp: new Date().toISOString(),
      message: `Successfully synced ${saveResult.count} clans`
    });
  } catch (error) {
    console.error('[SYNC] Unexpected error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

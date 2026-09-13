import { getLatestClans, getSyncHistory } from '@/lib/db';

/**
 * API Route: GET /api/clans
 * Frontend calls this to get latest clan rankings
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get optional query parameters
    const { limit = 100, includeHistory = false } = req.query;

    // Fetch latest clans from database
    const clansResult = await getLatestClans(parseInt(limit, 10));

    if (!clansResult.success) {
      return res.status(500).json({
        success: false,
        error: clansResult.error
      });
    }

    // Optionally include sync history
    let syncHistory = null;
    if (includeHistory === 'true') {
      const historyResult = await getSyncHistory(10);
      syncHistory = historyResult.success ? historyResult.logs : null;
    }

    // Get the timestamp of the most recent fetch
    const latestTimestamp = clansResult.clans.length > 0 
      ? clansResult.clans[0].fetched_at 
      : null;

    return res.status(200).json({
      success: true,
      clans: clansResult.clans,
      count: clansResult.clans.length,
      lastUpdated: latestTimestamp,
      syncHistory: includeHistory === 'true' ? syncHistory : undefined
    });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

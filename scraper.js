import * as cheerio from 'cheerio';

/**
 * Fetch and parse clan ranking from Ninja Zenshin
 */
export async function fetchClanData() {
  try {
    const response = await fetch('https://ninjazenshin.online/?panel=clan-ranking', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ClanTracker/1.0)'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Parse the clan ranking table
    const clans = [];
    const rows = $('table tbody tr'); // Adjust selector if table structure changes

    rows.each((i, el) => {
      const cells = $(el).find('td');
      
      if (cells.length >= 5) {
        const rank = $(cells[0]).text().trim();
        const name = $(cells[1]).text().trim();
        const master = $(cells[2]).text().trim();
        const members = $(cells[3]).text().trim(); // e.g., "27/30"
        const reputation = $(cells[4]).text().trim();

        // Skip empty rows
        if (rank && name && rank !== '#' && name !== 'Clan') {
          clans.push({
            rank: parseInt(rank, 10) || 0,
            name,
            master: master || null,
            members: members || null,
            reputation: parseInt(reputation?.replace(/[^0-9]/g, ''), 10) || 0,
            fetched_at: new Date().toISOString()
          });
        }
      }
    });

    if (clans.length === 0) {
      throw new Error('No clans found in parsed data');
    }

    return {
      success: true,
      clans,
      count: clans.length,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Scraper error:', error.message);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Alternative: Parse from a cached JSON export (if game provides API)
 * This is a fallback in case direct scraping gets blocked
 */
export async function fetchClanDataViaAPI(apiUrl) {
  try {
    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('API fetch error:', error.message);
    return null;
  }
}

# Scraper Debugging Guide

The scraper fetches clan data from `https://ninjazenshin.online/?panel=clan-ranking`. If it stops working, the HTML structure likely changed.

## Quick Test

Run this to test the scraper locally:

```bash
node -e "
import('./lib/scraper.js').then(m => 
  m.fetchClanData().then(r => console.log(JSON.stringify(r, null, 2)))
).catch(e => console.error(e.message));
"
```

Or create `test-scraper.js`:

```javascript
import { fetchClanData } from './lib/scraper.js';

async function test() {
  const result = await fetchClanData();
  console.log(result);
  
  if (result.success) {
    console.log(`✓ Found ${result.clans.length} clans`);
    console.log('Sample:', result.clans[0]);
  } else {
    console.log('✗ Error:', result.error);
  }
}

test();
```

Run with: `node --input-type=module test-scraper.js`

---

## Fix the Scraper if HTML Changed

### Step 1: Inspect the Real HTML

```bash
curl -s 'https://ninjazenshin.online/?panel=clan-ranking' \
  -H 'User-Agent: Mozilla/5.0' \
  | grep -A 50 'thead' > clan-table.html
```

Open `clan-table.html` and look at the table structure.

### Step 2: Find the Right Selector

The current scraper assumes:
```html
<table>
  <tbody>
    <tr>
      <td>1</td>        <!-- rank -->
      <td>Clan Name</td> <!-- name -->
      <td>Master</td>    <!-- master -->
      <td>27/30</td>     <!-- members -->
      <td>582,110</td>   <!-- reputation -->
    </tr>
  </tbody>
</table>
```

If the structure changed, update `lib/scraper.js`:

```javascript
// Example: if table now uses <div class="clan-row">
const rows = $('div.clan-row'); // Changed selector

rows.each((i, el) => {
  const rank = $(el).find('[data-field="rank"]').text().trim();
  const name = $(el).find('[data-field="name"]').text().trim();
  // ... etc
});
```

### Step 3: Update HTML Parsing

Common changes:
- **Class names**: `<tr class="ranking-row">` → use `$('tr.ranking-row')`
- **Data attributes**: `<td data-rank="1">` → use `$(el).attr('data-rank')`
- **Nested structure**: `<td><div class="name">Clan</div></td>` → use `$('div.name').text()`

### Step 4: Verify & Redeploy

```bash
# Test locally first
node --input-type=module test-scraper.js

# Push to GitHub
git add lib/scraper.js
git commit -m "Fix scraper HTML selector"
git push

# Vercel auto-deploys
```

---

## Alternative: Use Browser API

If HTML scraping becomes unreliable, try fetching via Ninja Zenshin's API (if it exists):

```javascript
// Check if game has an API endpoint
fetch('https://ninjazenshin.online/api/clans')
  .then(r => r.json())
  .then(data => console.log(data))
  .catch(() => console.log('No API available'));
```

If successful, update `scraper.js` to use `fetchClanDataViaAPI()`.

---

## Debug Logs

Add this to `lib/scraper.js` for verbose logging:

```javascript
export async function fetchClanData(debug = false) {
  try {
    const response = await fetch('https://ninjazenshin.online/?panel=clan-ranking', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ClanTracker/1.0)' }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    if (debug) console.log('HTML length:', html.length);

    const $ = cheerio.load(html);
    const rows = $('table tbody tr');
    
    if (debug) console.log('Found rows:', rows.length);

    const clans = [];
    rows.each((i, el) => {
      const cells = $(el).find('td');
      const row = Array.from(cells).map((c, idx) => {
        const text = $(c).text().trim();
        if (debug && i < 2) console.log(`  Cell ${idx}: "${text}"`);
        return text;
      });
      
      // ... rest of parsing
    });

    return { success: true, clans, count: clans.length, timestamp: new Date().toISOString() };
  } catch (error) {
    console.error('Scraper error:', error.message);
    return { success: false, error: error.message, timestamp: new Date().toISOString() };
  }
}

// Call with debug flag
// fetchClanData(true)
```

Then test:
```javascript
import { fetchClanData } from './lib/scraper.js';
const result = await fetchClanData(true);
```

---

## Monitoring the Scraper

Check Vercel logs to see scraper output:

**Vercel Dashboard** → Select Project → **Deployments** → Click Latest → **Logs**

Filter for `[SYNC]` messages to see sync attempts.

Or check Supabase `sync_log` table:
```sql
SELECT * FROM sync_log 
WHERE status = 'error' 
ORDER BY synced_at DESC 
LIMIT 10;
```

---

## Rate Limiting & Blocking

If the game blocks your IP:

```javascript
// Add delay between requests
async function fetchWithDelay(delay = 5000) {
  await new Promise(r => setTimeout(r, delay));
  return fetchClanData();
}

// Add random user agent
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
  'Mozilla/5.0 (X11; Linux x86_64)'
];

fetch(url, {
  headers: {
    'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)]
  }
});
```

Or use a proxy service (paid):
- `https://api.allorigins.win/raw?url=` (free CORS proxy)
- Premium: ScraperAPI, Bright Data

---

## When to Abandon Web Scraping

If the game frequently changes HTML or blocks requests, consider:

1. **Ask the game devs** for an official API or data export
2. **Use a third-party API** if one exists
3. **Manual data entry** (upload a CSV monthly)
4. **Switch to a Discord bot** that reads in-game commands

---

## Emergency Fallback

If scraper is completely broken, use cached data:

```javascript
export async function fetchClanDataWithFallback() {
  try {
    return await fetchClanData();
  } catch {
    // Return last known good data from DB
    const { data } = await supabase
      .from('clans')
      .select('*')
      .order('fetched_at', { ascending: false })
      .limit(100);
    
    return {
      success: true,
      clans: data,
      cached: true,
      warning: 'Using cached data - scraper may be broken'
    };
  }
}
```

---

## Support

If you get stuck:
1. Run `test-scraper.js` with debug flag
2. Check `clan-table.html` for structure changes
3. Post in the Ninja Zenshin Discord for API info
4. Check if there's a JSON export/download feature in-game

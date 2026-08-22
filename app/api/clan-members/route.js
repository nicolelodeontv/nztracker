import * as cheerio from 'cheerio';

export const revalidate = 30;

const SITE_ORIGIN = 'https://ninjazenshin.online';

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function toNumber(value) {
  const cleaned = String(value || '').replace(/[^0-9.-]/g, '');
  return cleaned ? Number(cleaned) : 0;
}

function normalizeUrl(value) {
  try {
    const url = new URL(value, SITE_ORIGIN);
    if (url.origin !== SITE_ORIGIN) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function headersFor(table, $) {
  const headers = $(table).find('thead th, thead td').map((_, el) => clean($(el).text()).toLowerCase()).get();
  return headers;
}

function looksLikeMemberHeader(value) {
  return /member|player|name|character|username|user/.test(value);
}

function looksLikeRepHeader(value) {
  return /reputation|rep|score|points/.test(value);
}

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const target = normalizeUrl(requestUrl.searchParams.get('url') || '');

  if (!target) {
    return Response.json({ error: 'A valid Ninja Zenshin clan detail URL is required.' }, { status: 400 });
  }

  try {
    const response = await fetch(target, {
      next: { revalidate: 30 },
      headers: {
        'User-Agent': 'Mozilla/5.0 NinjaZenshinLiveTracker/1.0',
        Accept: 'text/html,application/xhtml+xml'
      }
    });

    if (!response.ok) {
      return Response.json({ error: `Member source returned ${response.status}` }, { status: 502 });
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const members = [];
    let matchedTable = false;

    $('table').each((_, table) => {
      if (members.length && matchedTable) return;
      const headers = headersFor(table, $);
      const memberIndex = headers.findIndex(looksLikeMemberHeader);
      const repIndex = headers.findIndex(looksLikeRepHeader);
      if (memberIndex < 0 || repIndex < 0) return;

      matchedTable = true;
      $(table).find('tbody tr').each((__, tr) => {
        const cells = $(tr).find('td').map((___, td) => clean($(td).text())).get();
        if (!cells.length) return;
        const name = cells[memberIndex];
        const reputation = toNumber(cells[repIndex]);
        if (name) members.push({ name, reputation });
      });
    });

    if (!matchedTable) {
      $('table').each((_, table) => {
        if (members.length) return;
        $(table).find('tbody tr').each((__, tr) => {
          const cells = $(tr).find('td').map((___, td) => clean($(td).text())).get();
          if (cells.length < 2) return;
          const numericIndexes = cells.map((cell, index) => /[0-9]/.test(cell) ? index : -1).filter(index => index >= 0);
          const repIndex = numericIndexes[numericIndexes.length - 1];
          if (repIndex <= 0) return;
          const name = cells[repIndex - 1];
          if (name && name.length <= 80) members.push({ name, reputation: toNumber(cells[repIndex]) });
        });
      });
    }

    const title = clean($('h1, h2, title').first().text());
    return Response.json({
      members,
      count: members.length,
      title,
      fetchedAt: new Date().toISOString(),
      source: target
    });
  } catch (error) {
    return Response.json({
      error: 'Unable to fetch clan members',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 502 });
  }
}

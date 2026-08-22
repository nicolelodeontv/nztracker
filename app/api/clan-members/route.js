import * as cheerio from 'cheerio';

export const revalidate = 30;

const SITE_ORIGIN = 'https://ninjazenshin.online';
const SOURCE = `${SITE_ORIGIN}/?panel=clan-ranking`;

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function toNumber(value) {
  const cleaned = String(value || '').replace(/[^0-9.-]/g, '');
  return cleaned ? Number(cleaned) : 0;
}

function sameOrigin(value) {
  try {
    return new URL(value, SITE_ORIGIN).origin === SITE_ORIGIN;
  } catch {
    return false;
  }
}

function resolveUrl(value) {
  try {
    const url = new URL(value, SITE_ORIGIN);
    return url.origin === SITE_ORIGIN ? url.toString() : null;
  } catch {
    return null;
  }
}

async function fetchText(url) {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      'User-Agent': 'Mozilla/5.0 NinjaZenshinLiveTracker/1.0',
      Accept: 'text/html,application/xhtml+xml,application/json,*/*'
    }
  });
  return { response, text: await response.text() };
}

function parseMembersFromHtml(html) {
  const $ = cheerio.load(html);
  const members = [];

  const headerPatterns = [
    /member|player|name|character|username|user/i,
  ];
  const repPatterns = [/reputation|rep|score|points/i];

  $('table').each((_, table) => {
    if (members.length) return;
    const headers = $(table).find('thead th, thead td').map((__, el) => clean($(el).text())).get();
    const memberIndex = headers.findIndex(v => headerPatterns.some(p => p.test(v)));
    const repIndex = headers.findIndex(v => repPatterns.some(p => p.test(v)));
    if (memberIndex < 0 || repIndex < 0) return;

    $(table).find('tbody tr').each((__, tr) => {
      const cells = $(tr).find('td').map((___, td) => clean($(td).text())).get();
      const name = cells[memberIndex];
      if (!name) return;
      members.push({ name, reputation: toNumber(cells[repIndex]) });
    });
  });

  return members;
}

function parseMembersFromJson(text) {
  try {
    const payload = JSON.parse(text);
    const candidates = [];
    const visit = value => {
      if (!value) return;
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
        return;
      }
      if (typeof value !== 'object') return;
      const keys = Object.keys(value).map(k => k.toLowerCase());
      const nameKey = keys.find(k => /name|username|character|player/.test(k));
      const repKey = keys.find(k => /reputation|rep|score|points/.test(k));
      if (nameKey && repKey) {
        const actualNameKey = Object.keys(value).find(k => k.toLowerCase() === nameKey);
        const actualRepKey = Object.keys(value).find(k => k.toLowerCase() === repKey);
        const name = clean(value[actualNameKey]);
        if (name) candidates.push({ name, reputation: toNumber(value[actualRepKey]) });
      }
      for (const nested of Object.values(value)) visit(nested);
    };
    visit(payload);
    return candidates;
  } catch {
    return [];
  }
}

function extractScriptUrls(html) {
  const $ = cheerio.load(html);
  return $('script[src]').map((_, el) => resolveUrl($(el).attr('src'))).get().filter(Boolean);
}

function extractInteractionContext(html, clan) {
  const $ = cheerio.load(html);
  const context = [];
  const normalizedClan = clean(clan).toLowerCase();

  $('tr, li, div, td, button, a').each((_, el) => {
    const text = clean($(el).text());
    if (!text || !text.toLowerCase().includes(normalizedClan)) return;
    const attrs = {};
    for (const key of ['id', 'class', 'onclick', 'data-id', 'data-clan-id', 'data-clan', 'data-clan-name', 'data-target', 'data-url', 'data-href']) {
      const value = $(el).attr(key);
      if (value) attrs[key] = value;
    }
    if (Object.keys(attrs).length) context.push({ tag: el.tagName, text, attrs, html: $.html(el).slice(0, 3000) });
  });

  return context.slice(0, 10);
}

function extractCandidates(scripts, context) {
  const candidates = new Set();
  const handlerNames = new Set();

  for (const item of context) {
    const onclick = item.attrs?.onclick || '';
    for (const match of onclick.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) handlerNames.add(match[1]);
    for (const value of Object.values(item.attrs || {})) {
      const direct = String(value).match(/(?:https?:\/\/|\/|\?)[^'\"\s)]+/g) || [];
      for (const url of direct) if (sameOrigin(url)) candidates.add(resolveUrl(url));
    }
  }

  const sourceText = scripts.join('\n');
  const patterns = [
    /fetch\(\s*["'`]([^"'`]+)["'`]/g,
    /(?:axios\.(?:get|post)|\$\.get|\$\.post)\(\s*["'`]([^"'`]+)["'`]/g,
    /url\s*:\s*["'`]([^"'`]+)["'`]/g,
    /(?:endpoint|apiUrl|apiEndpoint)\s*=\s*["'`]([^"'`]+)["'`]/g,
    /(?:href|location(?:\.href)?)\s*[:=]\s*["'`]([^"'`]*clan[^"'`]*)["'`]/gi,
  ];

  for (const pattern of patterns) {
    for (const match of sourceText.matchAll(pattern)) {
      const value = match[1];
      if (/clan|member|guild|group|api|ajax/i.test(value) && sameOrigin(value)) {
        candidates.add(resolveUrl(value));
      }
    }
  }

  for (const name of handlerNames) {
    const fn = new RegExp(`(?:function\\s+${name}\\s*\\([^)]*\\)|${name}\\s*=\\s*function\\s*\\([^)]*\\))\\s*\\{([\\s\\S]{0,10000}?)\\}`, 'i').exec(sourceText);
    if (!fn) continue;
    for (const match of fn[1].matchAll(/(?:fetch|url\s*:|axios\.(?:get|post)|\$\.(?:get|post))\s*\(?\s*["'`]([^"'`]+)["'`]/gi)) {
      const value = match[1];
      if (/clan|member|api|ajax/i.test(value) && sameOrigin(value)) candidates.add(resolveUrl(value));
    }
  }

  return [...candidates].filter(Boolean).slice(0, 30);
}

function addQueryVariants(url, clan, context) {
  const values = new Set([clan]);
  for (const item of context) {
    for (const [key, value] of Object.entries(item.attrs || {})) {
      if (/id|clan/i.test(key)) values.add(value);
      for (const match of String(value).matchAll(/['\"]?([^'\"\s,()]+)['\"]?\)?/g)) {
        const candidate = match[1];
        if (/^[A-Za-z0-9_-]{2,64}$/.test(candidate)) values.add(candidate);
      }
    }
  }

  const urls = [];
  for (const value of values) {
    for (const key of ['clan', 'clan_name', 'name', 'id', 'clan_id', 'clanId']) {
      try {
        const next = new URL(url);
        if (!next.searchParams.has(key)) next.searchParams.set(key, value);
        urls.push(next.toString());
      } catch {}
    }
  }
  return urls.slice(0, 50);
}

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const sourceUrl = requestUrl.searchParams.get('url') || '';
  let clan = clean(requestUrl.searchParams.get('clan') || '');

  if (sourceUrl && sameOrigin(sourceUrl)) {
    try {
      const source = new URL(sourceUrl);
      clan ||= clean(source.searchParams.get('clan') || source.searchParams.get('clan_name') || source.searchParams.get('name') || '');
    } catch {}
  }

  if (!clan && !sourceUrl) {
    return Response.json({ error: 'A clan name or Ninja Zenshin clan URL is required.' }, { status: 400 });
  }

  try {
    const base = resolveUrl(sourceUrl) || SOURCE;
    const { response, text: html } = await fetchText(base);
    if (!response.ok) return Response.json({ error: `Source returned ${response.status}` }, { status: 502 });

    const directMembers = parseMembersFromHtml(html);
    if (directMembers.length) {
      return Response.json({ members: directMembers, count: directMembers.length, fetchedAt: new Date().toISOString(), source: base, method: 'html-table' });
    }

    const context = clan ? extractInteractionContext(html, clan) : [];
    const scriptUrls = extractScriptUrls(html);
    const scripts = [html];

    for (const scriptUrl of scriptUrls.slice(0, 20)) {
      try {
        const { response: scriptResponse, text: scriptText } = await fetchText(scriptUrl);
        if (scriptResponse.ok) scripts.push(scriptText);
      } catch {}
    }

    const candidates = extractCandidates(scripts, context);
    const probes = [];
    for (const candidate of candidates) probes.push(candidate);
    for (const candidate of candidates.filter(u => /^https:\/\//.test(u) && /clan|member|api/i.test(u))) {
      probes.push(...addQueryVariants(candidate, clan || '', context));
    }

    const seen = new Set();
    for (const probe of probes.slice(0, 100)) {
      if (!probe || seen.has(probe)) continue;
      seen.add(probe);
      try {
        const { response: probeResponse, text: body } = await fetchText(probe);
        if (!probeResponse.ok) continue;
        const contentType = probeResponse.headers.get('content-type') || '';
        const members = contentType.includes('json') ? parseMembersFromJson(body) : parseMembersFromHtml(body);
        if (members.length) {
          return Response.json({
            members,
            count: members.length,
            fetchedAt: new Date().toISOString(),
            source: probe,
            method: contentType.includes('json') ? 'discovered-json' : 'discovered-html'
          });
        }
      } catch {}
    }

    return Response.json({
      members: [],
      count: 0,
      fetchedAt: new Date().toISOString(),
      source: base,
      method: 'discovery-failed',
      diagnostics: {
        clan,
        interactionContext: context,
        scriptUrls,
        candidateEndpoints: candidates,
        note: 'The clan member modal is client-side; no member endpoint was discovered from the page scripts.'
      }
    });
  } catch (error) {
    return Response.json({
      error: 'Unable to discover Ninja Zenshin member data',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 502 });
  }
}

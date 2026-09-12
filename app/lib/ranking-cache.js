import { get, put } from '@vercel/blob';

const RANKING_PATH = 'nztracker/ranking/latest.json';
const SOURCE = 'https://ninjazenshin.online/?panel=clan-ranking';

function canUseBlob() {
  return Boolean(
    (process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN) &&
    (process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_OIDC_TOKEN || (process.env.VERCEL === '1' && process.env.BLOB_STORE_ID))
  );
}

export const rankingCachePath = () => RANKING_PATH;

export async function recordRankingSnapshot(parsed) {
  if (!canUseBlob()) return { stored: false, reason: 'Blob storage is not connected to this deployment.' };
  const payload = {
    version: 2,
    season: parsed?.season || 'Season 2',
    seasonEndsAt: parsed?.seasonEndsAt || null,
    countdown: parsed?.countdown || null,
    rows: Array.isArray(parsed?.rows) ? parsed.rows : [],
    fetchedAt: parsed?.fetchedAt || new Date().toISOString(),
    source: parsed?.source || SOURCE,
    updatedAt: new Date().toISOString(),
  };
  await put(RANKING_PATH, JSON.stringify(payload), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
  return { stored: true, updatedAt: payload.updatedAt, rowCount: payload.rows.length };
}

export async function readRankingSnapshot() {
  if (!canUseBlob()) return null;
  try {
    const result = await get(RANKING_PATH, { access: 'private', useCache: false });
    if (!result) return null;
    const text = await new Response(result.stream).text();
    const parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.rows)) return null;
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/not found|404|does not exist/i.test(message)) return null;
    throw error;
  }
}

export function rankingStorageHealth() {
  const configured = Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
  const authenticated = Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
    process.env.VERCEL_OIDC_TOKEN ||
    (process.env.VERCEL === '1' && process.env.BLOB_STORE_ID)
  );
  return { configured, authenticated, durable: configured && authenticated, provider: 'vercel-blob-private' };
}

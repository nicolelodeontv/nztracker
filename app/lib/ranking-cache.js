import { get, put } from '@vercel/blob';

const RANKING_PATH = 'nztracker/ranking/latest.json';
const RANKING_CACHE_TTL_MS = 30 * 1000;
const rankingReadCache = { value: null, expiresAt: 0 };
let lastRankingStorageError = null;
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
  try {
    await put(RANKING_PATH, JSON.stringify(payload), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
    });
    rankingReadCache.value = payload;
    rankingReadCache.expiresAt = Date.now() + RANKING_CACHE_TTL_MS;
    lastRankingStorageError = null;
    return { stored: true, updatedAt: payload.updatedAt, rowCount: payload.rows.length };
  } catch (error) {
    lastRankingStorageError = error instanceof Error ? error.message : String(error);
    return { stored: false, error: lastRankingStorageError, updatedAt: payload.updatedAt, rowCount: payload.rows.length };
  }
}

export async function readRankingSnapshot() {
  if (!canUseBlob()) return rankingReadCache.value || null;
  const now = Date.now();
  if (rankingReadCache.value && rankingReadCache.expiresAt > now) return structuredClone(rankingReadCache.value);
  try {
    const result = await get(RANKING_PATH, { access: 'private', useCache: false });
    if (!result) return rankingReadCache.value || null;
    const text = await new Response(result.stream).text();
    const parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.rows)) return rankingReadCache.value || null;
    rankingReadCache.value = parsed;
    rankingReadCache.expiresAt = now + RANKING_CACHE_TTL_MS;
    lastRankingStorageError = null;
    return structuredClone(parsed);
  } catch (error) {
    lastRankingStorageError = error instanceof Error ? error.message : String(error);
    const message = lastRankingStorageError;
    if (/not found|404|does not exist/i.test(message)) return rankingReadCache.value || null;
    return rankingReadCache.value || null;
  }
}

export function rankingStorageHealth() {
  const configured = Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
  const authenticated = Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
    process.env.VERCEL_OIDC_TOKEN ||
    (process.env.VERCEL === '1' && process.env.BLOB_STORE_ID)
  );
  return { configured, authenticated, durable: configured && authenticated, provider: 'vercel-blob-private', error: lastRankingStorageError };
}

import { get, put } from '@vercel/blob';

export const HISTORY_SAMPLE_MS = 5 * 60 * 1000;
export const HISTORY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const HISTORY_PREFIX = 'nztracker/member-history';
const HEALTH_PATH = `${HISTORY_PREFIX}/.healthcheck`;
const SYNC_STATUS_PATH = 'nztracker/sync-status/latest.json';
const locks = new Map();
const HISTORY_CACHE_TTL_MS = 60 * 1000;
const SYNC_STATUS_CACHE_TTL_MS = 30 * 1000;
const STORAGE_HEALTH_TTL_MS = 5 * 60 * 1000;
const historyCache = new Map();
const syncStatusCache = { value: null, expiresAt: 0 };
const storageProbeCache = { value: null, checkedAt: 0 };
let lastStorageError = null;
const textResponse = async (stream) => new Response(stream).text();
const cloneData = (value) => value == null ? value : structuredClone(value);
const rememberStorageError = (error) => {
  lastStorageError = error instanceof Error ? error.message : String(error);
};
const clearStorageError = () => {
  lastStorageError = null;
};
const normalizeSeason = (season) => String(season || 'Season 2').trim().replace(/[^a-zA-Z0-9._-]+/g, '_');
const normalizeClanId = (clanId) => String(clanId || '').trim();

export const historyPath = (clanId) => `${HISTORY_PREFIX}/${normalizeClanId(clanId)}.json`;
export const syncStatusPath = () => SYNC_STATUS_PATH;

function hasBlobStoreConfig() {
  return Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
}

function hasBlobAuthConfig() {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
    process.env.VERCEL_OIDC_TOKEN ||
    (process.env.VERCEL === '1' && process.env.BLOB_STORE_ID)
  );
}

function emptyDocument(clanId) {
  return { version: 2, clanId: normalizeClanId(clanId), updatedAt: null, seasons: {} };
}

async function readDocument(clanId) {
  if (!hasBlobStoreConfig() || !hasBlobAuthConfig()) return emptyDocument(clanId);
  const key = normalizeClanId(clanId);
  const cached = historyCache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cloneData(cached.document);

  try {
    const result = await get(historyPath(key), { access: 'private', useCache: false });
    if (!result) {
      const document = emptyDocument(key);
      historyCache.set(key, { document, expiresAt: now + HISTORY_CACHE_TTL_MS });
      clearStorageError();
      return cloneData(document);
    }
    const text = await textResponse(result.stream);
    const parsed = JSON.parse(text);
    const document = !parsed || typeof parsed !== 'object'
      ? emptyDocument(key)
      : { ...emptyDocument(key), ...parsed, seasons: parsed.seasons && typeof parsed.seasons === 'object' ? parsed.seasons : {} };
    historyCache.set(key, { document, expiresAt: now + HISTORY_CACHE_TTL_MS });
    clearStorageError();
    return cloneData(document);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    rememberStorageError(error);
    if (/not found|404|does not exist/i.test(message)) {
      const document = emptyDocument(key);
      historyCache.set(key, { document, expiresAt: now + HISTORY_CACHE_TTL_MS });
      return cloneData(document);
    }
    if (cached?.document) return cloneData(cached.document);
    throw error;
  }
}

async function writeDocument(clanId, document) {
  if (!hasBlobStoreConfig() || !hasBlobAuthConfig()) return { stored: false, reason: 'Blob storage is not connected to this deployment.' };
  try {
    await put(historyPath(clanId), JSON.stringify(document), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json'
    });
    historyCache.set(normalizeClanId(clanId), { document: cloneData(document), expiresAt: Date.now() + HISTORY_CACHE_TTL_MS });
    clearStorageError();
    return { stored: true };
  } catch (error) {
    rememberStorageError(error);
    return { stored: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function withLock(key, task) {
  const previous = locks.get(key) || Promise.resolve();
  const current = previous.catch(() => undefined).then(task);
  locks.set(key, current);
  try { return await current; } finally { if (locks.get(key) === current) locks.delete(key); }
}

function normalizeMember(member, index) {
  const name = String(member?.name ?? '').trim();
  const id = String(member?.id || name || `member-${index}`);
  const rep = Number(member?.reputation ?? member?.rep ?? 0);
  return { id, name, level: Number(member?.level || 0), rep: Number.isFinite(rep) ? rep : 0 };
}

function cleanPoints(points, cutoff) {
  return (Array.isArray(points) ? points : [])
    .filter((point) => point && Number.isFinite(Number(point.t)) && Number.isFinite(Number(point.r)))
    .filter((point) => Number(point.t) >= cutoff)
    .sort((a, b) => Number(a.t) - Number(b.t));
}

export async function recordMemberSnapshot({ clanId, season, members, capturedAt = Date.now() }) {
  const key = normalizeClanId(clanId);
  if (!key || !Array.isArray(members) || !members.length) return { stored: false, changed: false, reason: 'Invalid snapshot.' };
  return withLock(`history:${key}`, async () => {
    try {
      const now = Number(capturedAt) || Date.now();
      const cutoff = now - HISTORY_MAX_AGE_MS;
      const document = await readDocument(key);
      const seasonKey = normalizeSeason(season);
      const seasonData = document.seasons[seasonKey] || { startedAt: now, members: {} };
      const nextMembers = { ...(seasonData.members || {}) };
      let changed = false;
      for (let index = 0; index < members.length; index += 1) {
        const member = normalizeMember(members[index], index);
        if (!member.name) continue;
        const points = cleanPoints(nextMembers[member.id]?.points, cutoff);
        const last = points[points.length - 1];
        const shouldAdd = !last || now - Number(last.t) >= HISTORY_SAMPLE_MS || Number(last.r) !== member.rep;
        if (shouldAdd) {
          points.push({ t: now, r: member.rep, level: member.level, name: member.name });
          changed = true;
        }
        nextMembers[member.id] = { name: member.name, level: member.level, points, lastSeenAt: now };
      }
      seasonData.members = nextMembers;
      seasonData.updatedAt = new Date(now).toISOString();
      document.seasons[seasonKey] = seasonData;
      document.updatedAt = seasonData.updatedAt;
      const result = await writeDocument(key, document);
      return {
        ...result,
        changed: result.stored ? changed : false,
        clanId: key,
        season: seasonKey,
        updatedAt: document.updatedAt,
        memberCount: Object.keys(nextMembers).length
      };
    } catch (error) {
      rememberStorageError(error);
      return {
        stored: false,
        changed: false,
        clanId: key,
        season: normalizeSeason(season),
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
}

export async function readMemberHistory({ clanId, season, hours = 168 }) {
  const key = normalizeClanId(clanId);
  if (!key) throw new Error('A clanId is required.');
  const safeHours = Math.min(168, Math.max(1, Number(hours) || 168));
  const cutoff = Date.now() - safeHours * 60 * 60 * 1000;
  let document;
  try {
    document = await readDocument(key);
  } catch (error) {
    rememberStorageError(error);
    document = historyCache.get(key)?.document || emptyDocument(key);
  }
  const seasonKey = normalizeSeason(season);
  const seasonData = document.seasons[seasonKey] || { startedAt: null, updatedAt: null, members: {} };
  const members = {};
  Object.entries(seasonData.members || {}).forEach(([id, value]) => {
    const points = cleanPoints(value?.points, cutoff);
    if (points.length) members[id] = { ...value, points };
  });
  return {
    version: document.version,
    clanId: key,
    season: seasonKey,
    startedAt: seasonData.startedAt || null,
    updatedAt: seasonData.updatedAt || document.updatedAt || null,
    stored: storageHealth().durable,
    storageError: lastStorageError,
    members
  };
}

async function readSyncDocument() {
  if (!hasBlobStoreConfig() || !hasBlobAuthConfig()) return null;
  const now = Date.now();
  if (syncStatusCache.value && syncStatusCache.expiresAt > now) return cloneData(syncStatusCache.value);
  try {
    const result = await get(SYNC_STATUS_PATH, { access: 'private', useCache: false });
    if (!result) return null;
    const text = await textResponse(result.stream);
    const parsed = JSON.parse(text);
    const value = parsed && typeof parsed === 'object' ? parsed : null;
    syncStatusCache.value = value;
    syncStatusCache.expiresAt = now + SYNC_STATUS_CACHE_TTL_MS;
    clearStorageError();
    return cloneData(value);
  } catch (error) {
    rememberStorageError(error);
    if (/not found|404|does not exist/i.test(error instanceof Error ? error.message : String(error))) return null;
    return syncStatusCache.value ? cloneData(syncStatusCache.value) : null;
  }
}

export async function recordSyncStatus(status = {}) {
  if (!hasBlobStoreConfig() || !hasBlobAuthConfig()) {
    return { stored: false, reason: 'Blob storage is not connected to this deployment.' };
  }
  const payload = { version: 1, ...status, updatedAt: new Date().toISOString() };
  try {
    await put(SYNC_STATUS_PATH, JSON.stringify(payload), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json'
    });
    syncStatusCache.value = payload;
    syncStatusCache.expiresAt = Date.now() + SYNC_STATUS_CACHE_TTL_MS;
    clearStorageError();
    return { stored: true, ...payload };
  } catch (error) {
    rememberStorageError(error);
    return { stored: false, error: error instanceof Error ? error.message : String(error), ...payload };
  }
}

export async function readSyncStatus() {
  return readSyncDocument();
}

export async function verifyStorageConnection() {
  const configured = hasBlobStoreConfig();
  const authenticated = hasBlobAuthConfig();
  if (!configured || !authenticated) {
    const result = {
      configured,
      durable: false,
      authenticated,
      provider: 'vercel-blob-private',
      error: lastStorageError
    };
    storageProbeCache.value = result;
    storageProbeCache.checkedAt = Date.now();
    return result;
  }
  const now = Date.now();
  if (storageProbeCache.value && now - storageProbeCache.checkedAt < STORAGE_HEALTH_TTL_MS) {
    return { ...storageProbeCache.value };
  }
  try {
    const result = await get(HEALTH_PATH, { access: 'private', useCache: false });
    clearStorageError();
    const health = {
      configured: true,
      durable: true,
      authenticated: true,
      provider: 'vercel-blob-private',
      healthObjectExists: Boolean(result),
      error: null
    };
    storageProbeCache.value = health;
    storageProbeCache.checkedAt = now;
    return health;
  } catch (error) {
    rememberStorageError(error);
    const health = {
      configured: true,
      durable: false,
      authenticated: true,
      provider: 'vercel-blob-private',
      error: lastStorageError
    };
    storageProbeCache.value = health;
    storageProbeCache.checkedAt = now;
    return health;
  }
}

export function storageHealth() {
  const configured = hasBlobStoreConfig();
  const authenticated = hasBlobAuthConfig();
  return {
    provider: 'vercel-blob-private',
    configured,
    authenticated,
    durable: configured && authenticated,
    error: lastStorageError
  };
}

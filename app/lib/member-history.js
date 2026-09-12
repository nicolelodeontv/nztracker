import { get, put } from '@vercel/blob';

export const HISTORY_SAMPLE_MS = 5 * 60 * 1000;
export const HISTORY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const HISTORY_PREFIX = 'nztracker/member-history';
const HEALTH_PATH = `${HISTORY_PREFIX}/.healthcheck`;
const SYNC_STATUS_PATH = 'nztracker/sync-status/latest.json';
const locks = new Map();
const textResponse = async (stream) => new Response(stream).text();
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
  try {
    const result = await get(historyPath(clanId), { access: 'private', useCache: false });
    if (!result) return emptyDocument(clanId);
    const text = await textResponse(result.stream);
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return emptyDocument(clanId);
    return { ...emptyDocument(clanId), ...parsed, seasons: parsed.seasons && typeof parsed.seasons === 'object' ? parsed.seasons : {} };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/not found|404|does not exist/i.test(message)) return emptyDocument(clanId);
    throw error;
  }
}

async function writeDocument(clanId, document) {
  if (!hasBlobStoreConfig() || !hasBlobAuthConfig()) return { stored: false, reason: 'Blob storage is not connected to this deployment.' };
  await put(historyPath(clanId), JSON.stringify(document), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json'
  });
  return { stored: true };
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
    return { ...result, changed, clanId: key, season: seasonKey, updatedAt: document.updatedAt, memberCount: Object.keys(nextMembers).length };
  });
}

export async function readMemberHistory({ clanId, season, hours = 168 }) {
  const key = normalizeClanId(clanId);
  if (!key) throw new Error('A clanId is required.');
  const safeHours = Math.min(168, Math.max(1, Number(hours) || 168));
  const cutoff = Date.now() - safeHours * 60 * 60 * 1000;
  const document = await readDocument(key);
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
    members
  };
}

async function readSyncDocument() {
  if (!hasBlobStoreConfig() || !hasBlobAuthConfig()) return null;
  try {
    const result = await get(SYNC_STATUS_PATH, { access: 'private', useCache: false });
    if (!result) return null;
    const text = await textResponse(result.stream);
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/not found|404|does not exist/i.test(message)) return null;
    throw error;
  }
}

export async function recordSyncStatus(status = {}) {
  if (!hasBlobStoreConfig() || !hasBlobAuthConfig()) {
    return { stored: false, reason: 'Blob storage is not connected to this deployment.' };
  }
  const payload = { version: 1, ...status, updatedAt: new Date().toISOString() };
  await put(SYNC_STATUS_PATH, JSON.stringify(payload), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json'
  });
  return { stored: true, ...payload };
}

export async function readSyncStatus() {
  return readSyncDocument();
}

export async function verifyStorageConnection() {
  if (!hasBlobStoreConfig() || !hasBlobAuthConfig()) {
    return {
      configured: hasBlobStoreConfig(),
      durable: false,
      authenticated: hasBlobAuthConfig(),
      provider: 'vercel-blob-private'
    };
  }
  try {
    const result = await get(HEALTH_PATH, { access: 'private', useCache: false });
    return {
      configured: true,
      durable: true,
      authenticated: true,
      provider: 'vercel-blob-private',
      healthObjectExists: Boolean(result)
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      configured: true,
      durable: false,
      authenticated: true,
      provider: 'vercel-blob-private',
      error: message
    };
  }
}

export function storageHealth() {
  const configured = hasBlobStoreConfig();
  const authenticated = hasBlobAuthConfig();
  return {
    provider: 'vercel-blob-private',
    configured,
    authenticated,
    durable: configured && authenticated
  };
}

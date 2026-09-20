import { del, get, list, put } from '@vercel/blob';

export const DONATION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const DONATION_PREFIX = 'nztracker/donations';
const DONATION_STATUS_PATH = `${DONATION_PREFIX}/status/latest.json`;
const locks = new Map();

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const normalizeSeason = (season) => String(season || 'Season 2').trim().replace(/[^a-zA-Z0-9._-]+/g, '_');
const normalizeClanId = (clanId) => String(clanId || '').trim();
const validClanId = (value) => /^[a-zA-Z0-9_-]+$/.test(value);
const safeInteger = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
};

const hasBlobStoreConfig = () => Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
const hasBlobAuthConfig = () => Boolean(
  process.env.BLOB_READ_WRITE_TOKEN ||
  process.env.VERCEL_OIDC_TOKEN ||
  (process.env.VERCEL === '1' && process.env.BLOB_STORE_ID)
);

export const donationLatestPath = (clanId) => `${DONATION_PREFIX}/${normalizeClanId(clanId)}/latest.json`;
export const donationSnapshotPrefix = (clanId) => `${DONATION_PREFIX}/${normalizeClanId(clanId)}/snapshots/`;

const donationSnapshotPath = (clanId, capturedAt) => {
  const date = new Date(capturedAt);
  const day = date.toISOString().slice(0, 10);
  return `${donationSnapshotPrefix(clanId)}${day}/${capturedAt}.json`;
};

async function readJson(pathname) {
  if (!hasBlobStoreConfig() || !hasBlobAuthConfig()) return null;
  try {
    const result = await get(pathname, { access: 'private', useCache: false });
    if (!result) return null;
    const text = await new Response(result.stream).text();
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/not found|404|does not exist/i.test(message)) return null;
    throw error;
  }
}

async function writeJson(pathname, payload) {
  if (!hasBlobStoreConfig() || !hasBlobAuthConfig()) {
    return { stored: false, reason: 'Blob storage is not connected to this deployment.' };
  }
  await put(pathname, JSON.stringify(payload), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
  return { stored: true };
}

async function withLock(key, task) {
  const previous = locks.get(key) || Promise.resolve();
  const current = previous.catch(() => undefined).then(task);
  locks.set(key, current);
  try {
    return await current;
  } finally {
    if (locks.get(key) === current) locks.delete(key);
  }
}

export function normalizeDonationMember(member, index = 0) {
  const source = member && typeof member === 'object' ? member : {};
  const name = clean(source.name ?? source.username ?? source.player ?? source.character);
  const id = clean(source.id ?? source.memberId ?? source.member_id ?? name || `member-${index}`);
  const level = Number(source.level);
  const donatedGold = safeInteger(source.donated_gold ?? source.donatedGold ?? source.gold_donated);
  const donatedToken = safeInteger(source.donated_token ?? source.donatedToken ?? source.token_donated);
  return {
    id,
    name,
    level: Number.isFinite(level) ? Math.trunc(level) : 0,
    donated_gold: donatedGold,
    donated_token: donatedToken,
  };
}

export function validateDonationPayload(body) {
  const clanId = clean(body?.clanId);
  const season = normalizeSeason(body?.season);
  const members = Array.isArray(body?.members) ? body.members : [];

  if (!clanId || !validClanId(clanId)) return { ok: false, error: 'A valid clanId is required.' };
  if (!members.length) return { ok: false, error: 'At least one member is required.' };
  if (members.length > 500) return { ok: false, error: 'Snapshot contains too many members.' };

  const normalized = [];
  const seen = new Set();
  for (let index = 0; index < members.length; index += 1) {
    const member = normalizeDonationMember(members[index], index);
    if (!member.name) return { ok: false, error: 'Every member must include a name.' };
    if (member.donated_gold === null || member.donated_token === null) {
      return { ok: false, error: 'Every member must include valid donated_gold and donated_token values.' };
    }
    const key = String(member.id || member.name).normalize('NFC').toLocaleLowerCase();
    if (seen.has(key)) return { ok: false, error: 'Snapshot contains duplicate members.' };
    seen.add(key);
    normalized.push(member);
  }

  return { ok: true, clanId, season, members: normalized };
}

export function donationMemberKey(member) {
  return String(member?.id || member?.name || '').normalize('NFC').toLocaleLowerCase();
}

export function computeDonationDelta(current, baseline) {
  if (!current || !baseline) return { gold: null, token: null };
  return {
    gold: Number(current.donated_gold) - Number(baseline.donated_gold),
    token: Number(current.donated_token) - Number(baseline.donated_token),
  };
}

function snapshotTimestamp(pathname) {
  const filename = pathname.split('/').pop() || '';
  const timestamp = Number(filename.replace(/\.json$/i, ''));
  return Number.isSafeInteger(timestamp) ? timestamp : null;
}

function dateFromFolder(folder) {
  const match = folder.match(/(\d{4}-\d{2}-\d{2})\/$/);
  return match ? match[1] : null;
}

async function listFolderBlobs(prefix) {
  if (!hasBlobStoreConfig() || !hasBlobAuthConfig()) return [];
  const blobs = [];
  let cursor;
  do {
    const result = await list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
    blobs.push(...(result.blobs || []));
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);
  return blobs.filter((blob) => /\.json$/i.test(blob.pathname) && snapshotTimestamp(blob.pathname) !== null);
}

async function pruneOldSnapshots(clanId, cutoff) {
  if (!hasBlobStoreConfig() || !hasBlobAuthConfig()) return;
  const root = donationSnapshotPrefix(clanId);
  const folded = await list({ prefix: root, mode: 'folded', limit: 100 });
  const oldFolders = (folded.folders || []).filter((folder) => {
    const day = dateFromFolder(folder);
    return day && new Date(`${day}T23:59:59.999Z`).getTime() < cutoff;
  });

  for (const folder of oldFolders) {
    const blobs = await listFolderBlobs(folder);
    if (!blobs.length) continue;
    await del(blobs.map((blob) => blob.pathname));
  }
}

async function readSnapshot(pathname) {
  return readJson(pathname);
}

function memberMap(snapshot) {
  return new Map((snapshot?.members || []).map((member) => [donationMemberKey(member), member]));
}

async function resolveBaselineSnapshots(clanId, latestCapturedAt) {
  if (!hasBlobStoreConfig() || !hasBlobAuthConfig()) {
    return { previous: null, oneHour: null, sixHour: null, twentyFourHour: null };
  }

  const root = donationSnapshotPrefix(clanId);
  const folded = await list({ prefix: root, mode: 'folded', limit: 100 });
  const folders = (folded.folders || [])
    .map((folder) => ({ folder, day: dateFromFolder(folder) }))
    .filter((entry) => entry.day)
    .sort((a, b) => a.day.localeCompare(b.day));

  const targets = {
    previous: latestCapturedAt - 1,
    oneHour: latestCapturedAt - 60 * 60 * 1000,
    sixHour: latestCapturedAt - 6 * 60 * 60 * 1000,
    twentyFourHour: latestCapturedAt - 24 * 60 * 60 * 1000,
  };
  const selectedPaths = new Map();

  for (const [label, target] of Object.entries(targets)) {
    const targetDay = new Date(target).toISOString().slice(0, 10);
    const candidateDays = folders.filter((entry) => entry.day <= targetDay).reverse();
    let selected = null;
    for (const entry of candidateDays) {
      const blobs = await listFolderBlobs(entry.folder);
      const candidate = blobs
        .map((blob) => ({ blob, timestamp: snapshotTimestamp(blob.pathname) }))
        .filter((item) => item.timestamp !== null && item.timestamp <= target)
        .sort((a, b) => b.timestamp - a.timestamp)[0];
      if (candidate) {
        selected = candidate.blob.pathname;
        break;
      }
    }
    selectedPaths.set(label, selected);
  }

  const unique = [...new Set([...selectedPaths.values()].filter(Boolean))];
  const loaded = await Promise.all(unique.map(async (pathname) => [pathname, await readSnapshot(pathname)]));
  const byPath = new Map(loaded);

  return {
    previous: selectedPaths.get('previous') ? byPath.get(selectedPaths.get('previous')) || null : null,
    oneHour: selectedPaths.get('oneHour') ? byPath.get(selectedPaths.get('oneHour')) || null : null,
    sixHour: selectedPaths.get('sixHour') ? byPath.get(selectedPaths.get('sixHour')) || null : null,
    twentyFourHour: selectedPaths.get('twentyFourHour') ? byPath.get(selectedPaths.get('twentyFourHour')) || null : null,
  };
}

export async function recordDonationSnapshot({ clanId, season, members }) {
  const key = normalizeClanId(clanId);
  if (!key || !validClanId(key) || !Array.isArray(members) || !members.length) {
    return { stored: false, changed: false, reason: 'Invalid donation snapshot.' };
  }

  return withLock(`donations:${key}`, async () => {
    const capturedAt = Date.now();
    const seasonKey = normalizeSeason(season);
    const normalizedMembers = members.map((member, index) => normalizeDonationMember(member, index));
    const current = {
      version: 1,
      clanId: key,
      season: seasonKey,
      capturedAt,
      updatedAt: new Date(capturedAt).toISOString(),
      members: normalizedMembers,
    };

    const previous = await readJson(donationLatestPath(key));
    const previousMap = memberMap(previous);
    const changed = normalizedMembers.some((member) => {
      const before = previousMap.get(donationMemberKey(member));
      return !before ||
        Number(before.donated_gold) !== Number(member.donated_gold) ||
        Number(before.donated_token) !== Number(member.donated_token);
    });

    const snapshotPath = donationSnapshotPath(key, capturedAt);
    const snapshotWrite = await writeJson(snapshotPath, current);
    const latestWrite = await writeJson(donationLatestPath(key), current);

    if (latestWrite.stored) {
      try {
        await writeJson(DONATION_STATUS_PATH, {
          version: 1,
          clanId: key,
          season: seasonKey,
          lastSnapshotAt: current.updatedAt,
          memberCount: normalizedMembers.length,
          updatedAt: current.updatedAt,
        });
      } catch (error) {
        console.warn('Donation status write failed', error instanceof Error ? error.message : String(error));
      }
      try {
        await pruneOldSnapshots(key, capturedAt - DONATION_MAX_AGE_MS);
      } catch (error) {
        console.warn('Donation snapshot pruning failed', error instanceof Error ? error.message : String(error));
      }
    }

    return {
      stored: Boolean(snapshotWrite.stored && latestWrite.stored),
      changed,
      clanId: key,
      season: seasonKey,
      capturedAt,
      updatedAt: current.updatedAt,
      memberCount: normalizedMembers.length,
    };
  });
}

export async function readDonationHistory({ clanId, season }) {
  const key = normalizeClanId(clanId);
  if (!key) throw new Error('A clanId is required.');
  const latest = await readJson(donationLatestPath(key));
  if (!latest?.members?.length) {
    return {
      version: 1,
      clanId: key,
      season: normalizeSeason(season),
      stored: false,
      lastSnapshotAt: null,
      memberCount: 0,
      members: [],
      snapshots: [],
    };
  }

  const seasonKey = normalizeSeason(season || latest.season);
  if (String(latest.season || '') !== seasonKey) {
    return {
      version: 1,
      clanId: key,
      season: seasonKey,
      stored: true,
      lastSnapshotAt: latest.updatedAt || null,
      memberCount: 0,
      members: [],
      snapshots: [],
    };
  }

  const capturedAt = Number(latest.capturedAt);
  const baselines = Number.isFinite(capturedAt)
    ? await resolveBaselineSnapshots(key, capturedAt)
    : { previous: null, oneHour: null, sixHour: null, twentyFourHour: null };

  const baselineMaps = {
    previous: memberMap(baselines.previous),
    oneHour: memberMap(baselines.oneHour),
    sixHour: memberMap(baselines.sixHour),
    twentyFourHour: memberMap(baselines.twentyFourHour),
  };

  const latestMembers = latest.members.map((member) => {
    const gains = {};
    for (const [label, map] of Object.entries(baselineMaps)) {
      gains[label] = computeDonationDelta(member, map.get(donationMemberKey(member)));
    }
    return { ...member, gains };
  });

  const snapshotSummary = Object.entries({
    previous: baselines.previous,
    oneHour: baselines.oneHour,
    sixHour: baselines.sixHour,
    twentyFourHour: baselines.twentyFourHour,
  }).filter(([, snapshot]) => snapshot).map(([label, snapshot]) => ({
    label,
    capturedAt: snapshot.updatedAt || new Date(snapshot.capturedAt).toISOString(),
    memberCount: Array.isArray(snapshot.members) ? snapshot.members.length : 0,
  }));

  return {
    version: 1,
    clanId: key,
    season: seasonKey,
    stored: true,
    lastSnapshotAt: latest.updatedAt || null,
    memberCount: latestMembers.length,
    members: latestMembers,
    snapshots: snapshotSummary,
  };
}

export async function readLatestDonationStatus() {
  const status = await readJson(DONATION_STATUS_PATH);
  if (!status) return { lastSnapshotAt: null, memberCount: 0 };
  return {
    lastSnapshotAt: status.lastSnapshotAt || null,
    memberCount: Number(status.memberCount || 0),
  };
}

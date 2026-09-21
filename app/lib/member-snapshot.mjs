export const DEFAULT_TRACKED_CLAN_IDS = Object.freeze([]);
export const MEMBER_SNAPSHOT_HEARTBEAT_MS = 60 * 60 * 1000;

const VALID_CLAN_ID = /^[a-zA-Z0-9_-]+$/;

function clean(value) {
  return String(value ?? '').trim();
}

function numericOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function parseTrackedClanIds(value, fallbackIds = DEFAULT_TRACKED_CLAN_IDS) {
  const configured = clean(value);
  const fallback = Array.isArray(fallbackIds) ? fallbackIds : [];
  const source = configured ? configured.split(',') : fallback;
  return [...new Set(source.map(clean).filter((id) => id && VALID_CLAN_ID.test(id)))];
}

export function buildTrackedClanTargets(rankingRows, trackedIds) {
  const ids = parseTrackedClanIds(trackedIds);
  const byId = new Map(
    (Array.isArray(rankingRows) ? rankingRows : [])
      .filter((row) => row?.clanId)
      .map((row) => [clean(row.clanId), row])
  );

  return ids.map((id) => {
    const ranked = byId.get(id);
    return ranked
      ? { ...ranked, clanId: id }
      : { clanId: id, clan: `Tracked clan ${id}`, memberCurrent: 0 };
  });
}

export function buildSnapshotCandidates({ season, snapshotAt, clanResults }) {
  const rows = [];
  const ambiguousNames = [];

  for (const result of Array.isArray(clanResults) ? clanResults : []) {
    if (!result?.clanId || result?.stale) continue;
    const clanId = String(result.clanId);

    for (const member of Array.isArray(result.members) ? result.members : []) {
      if (member?.identityAmbiguous) {
        ambiguousNames.push({ clanId, name: clean(member.name) });
        continue;
      }

      const memberId = clean(member?.id);
      const name = clean(member?.name);
      if (!memberId || !name) continue;

      rows.push({
        clan_id: clanId,
        season,
        member_id: memberId,
        ign: name,
        level: Number(member?.level || 0),
        reputation: Number(member?.reputation ?? member?.rep ?? 0),
        stamina: numericOrNull(member?.stamina),
        max_stamina: numericOrNull(member?.maxStamina),
        source: result.service === 'legacy-live'
          ? 'Ninja Zenshin public member endpoint'
          : (result.source || 'https://ninjazenshin.online/'),
        captured_at: result.fetchedAt || snapshotAt
      });
    }
  }

  return { rows, ambiguousNames };
}

export function snapshotMetricsChanged(candidate, previous) {
  if (!previous) return true;
  return Number(candidate.reputation) !== Number(previous.reputation)
    || Number(candidate.level) !== Number(previous.level)
    || numericOrNull(candidate.stamina) !== numericOrNull(previous.stamina)
    || numericOrNull(candidate.max_stamina) !== numericOrNull(previous.max_stamina);
}

export function shouldRecordMemberSnapshot(candidate, previous, nowMs, heartbeatMs = MEMBER_SNAPSHOT_HEARTBEAT_MS) {
  if (!previous) return true;
  if (snapshotMetricsChanged(candidate, previous)) return true;

  const previousMs = Date.parse(previous.captured_at);
  return Number.isFinite(previousMs) && nowMs - previousMs >= heartbeatMs;
}

export function selectChangedSnapshotRows({ candidates, previousByKey, nowMs = Date.now(), heartbeatMs = MEMBER_SNAPSHOT_HEARTBEAT_MS }) {
  const rows = [];
  let newCount = 0;
  let changedCount = 0;
  let heartbeatCount = 0;
  let unchangedCount = 0;

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const key = `${candidate.clan_id}:${candidate.member_id}`;
    const previous = previousByKey?.get(key);

    if (!shouldRecordMemberSnapshot(candidate, previous, nowMs, heartbeatMs)) {
      unchangedCount += 1;
      continue;
    }

    const previousRep = previous ? numericOrNull(previous.reputation) : null;
    const suspicious = previousRep !== null && Number(candidate.reputation) < previousRep;

    rows.push({
      ...candidate,
      suspicious,
      suspicious_reason: suspicious
        ? `REP decreased from ${previousRep} to ${candidate.reputation}.`
        : null
    });

    if (!previous) newCount += 1;
    else if (snapshotMetricsChanged(candidate, previous)) changedCount += 1;
    else heartbeatCount += 1;
  }

  return { rows, newCount, changedCount, heartbeatCount, unchangedCount };
}

export function selectRetentionIds(rows, cutoffIso) {
  const cutoffMs = Date.parse(cutoffIso);
  if (!Number.isFinite(cutoffMs)) return [];
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row?.id && Date.parse(row.captured_at) < cutoffMs)
    .map((row) => String(row.id));
}

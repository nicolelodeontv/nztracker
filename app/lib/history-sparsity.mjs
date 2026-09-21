export const HISTORY_HEARTBEAT_MS = 60 * 60 * 1000;

const asTime = (value) => Date.parse(value);

export function trackedValuesChanged(current, previous, fields) {
  if (!previous) return true;
  return fields.some((field) => Number(current?.[field] ?? 0) !== Number(previous?.[field] ?? 0));
}

export function selectHistoryWrites(records, previousByKey, {
  keyOf,
  snapshotAt,
  trackedFields,
  heartbeatMs = HISTORY_HEARTBEAT_MS,
}) {
  const nowMs = asTime(snapshotAt) || Date.now();
  const rows = [];
  let changedCount = 0;
  let heartbeatCount = 0;
  let unchangedCount = 0;

  for (const record of Array.isArray(records) ? records : []) {
    const key = keyOf(record);
    const previous = previousByKey?.get(key);

    if (!previous) {
      rows.push(record);
      changedCount += 1;
      continue;
    }

    if (trackedValuesChanged(record, previous, trackedFields)) {
      rows.push(record);
      changedCount += 1;
      continue;
    }

    const previousMs = asTime(previous.snapshot_at);
    if (Number.isFinite(previousMs) && nowMs - previousMs >= heartbeatMs) {
      rows.push(record);
      heartbeatCount += 1;
    } else {
      unchangedCount += 1;
    }
  }

  return { rows, changedCount, heartbeatCount, unchangedCount };
}

export function latestByKey(rows, keyOf) {
  const sorted = (Array.isArray(rows) ? rows : [])
    .filter((row) => row && Number.isFinite(asTime(row.snapshot_at)))
    .slice()
    .sort((a, b) => asTime(b.snapshot_at) - asTime(a.snapshot_at));

  const out = new Map();
  for (const row of sorted) {
    const key = keyOf(row);
    if (!out.has(key)) out.set(key, row);
  }
  return out;
}

export function carryForwardMap(rows, at, keyOf) {
  const atMs = asTime(at);
  const sorted = (Array.isArray(rows) ? rows : [])
    .filter((row) => row && Number.isFinite(asTime(row.snapshot_at)) && asTime(row.snapshot_at) <= atMs)
    .slice()
    .sort((a, b) => asTime(b.snapshot_at) - asTime(a.snapshot_at));

  const out = new Map();
  for (const row of sorted) {
    const key = keyOf(row);
    if (!out.has(key)) out.set(key, row);
  }
  return out;
}

export function buildCarryForwardSnapshots(rows, keyOf) {
  const times = [...new Set(
    (Array.isArray(rows) ? rows : [])
      .map((row) => row?.snapshot_at)
      .filter((value) => Number.isFinite(asTime(value)))
  )].sort((a, b) => asTime(b) - asTime(a));

  if (times.length < 2) {
    return { currentAt: times[0] || null, previousAt: null, current: new Map(), previous: new Map() };
  }

  const currentAt = times[0];
  const previousAt = times[1];
  return {
    currentAt,
    previousAt,
    current: carryForwardMap(rows, currentAt, keyOf),
    previous: carryForwardMap(rows, previousAt, keyOf),
  };
}

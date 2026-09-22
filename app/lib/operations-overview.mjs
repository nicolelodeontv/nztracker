const ATTENTION_STATUSES = new Set(['NO GAIN','IDLE','MISSING','RESET']);

export function memberDisplayName(row) {
  const value = row?.member ?? row?.name ?? row?.ign ?? row?.id;
  const name = String(value ?? '').trim();
  return name || 'Unknown member';
}

function memberKey(row) {
  return String(row?.id ?? memberDisplayName(row));
}

function compareTopBurn(a, b) {
  return Number(b.gain || 0) - Number(a.gain || 0)
    || Number(b.gainPerHour || 0) - Number(a.gainPerHour || 0)
    || memberDisplayName(a).localeCompare(memberDisplayName(b))
    || memberKey(a).localeCompare(memberKey(b));
}

export function selectTopBurn(rows = [], limit = 5) {
  const unique = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!(Number(row?.gain || 0) > 0)) continue;

    const key = memberKey(row);
    const existing = unique.get(key);
    if (!existing || compareTopBurn(row, existing) < 0) {
      unique.set(key, row);
    }
  }

  return [...unique.values()].sort(compareTopBurn).slice(0, Math.max(0, Number(limit) || 0));
}

function compareAttention(a, b) {
  return Number(a.gain || 0) - Number(b.gain || 0)
    || Number(a.gainPerHour || 0) - Number(b.gainPerHour || 0)
    || memberDisplayName(a).localeCompare(memberDisplayName(b))
    || memberKey(a).localeCompare(memberKey(b));
}

export function selectNeedsAttention(rows = [], limit = 6) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => ATTENTION_STATUSES.has(String(row?.status || '').toUpperCase()))
    .sort(compareAttention)
    .slice(0, Math.max(0, Number(limit) || 0));
}

export function formatGlobalMove(change, trackingAvailable) {
  if (!trackingAvailable) return 'NOT YET TRACKED';

  const delta = Number(change?.rankDelta);
  if (!Number.isFinite(delta) || delta === 0) return '—';
  return delta > 0 ? '↑' + delta : '↓' + Math.abs(delta);
}

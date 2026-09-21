export const DEFAULT_MAX_TRACKED_GAP_MS = 10 * 60 * 1000;

function validTimestamp(value) {
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function calculateTrackedHours(timestamps, maxGapMs = DEFAULT_MAX_TRACKED_GAP_MS) {
  const points = [...new Set((timestamps || [])
    .map(validTimestamp)
    .filter((value) => value !== null))]
    .sort((a, b) => a - b);

  if (points.length < 2) return 0;

  const cap = Math.max(0, Number(maxGapMs) || 0);
  let totalMs = 0;
  for (let i = 1; i < points.length; i += 1) {
    const gap = points[i] - points[i - 1];
    if (gap > 0 && gap <= cap) totalMs += gap;
  }
  return totalMs / 3_600_000;
}

export function calculateRepPerHour(gain, hours) {
  const safeGain = Number(gain);
  const safeHours = Number(hours);
  if (!Number.isFinite(safeGain) || !Number.isFinite(safeHours) || safeHours <= 0) return 0;
  return safeGain / safeHours;
}

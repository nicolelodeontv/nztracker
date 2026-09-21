export function formatSeasonCountdown(seasonEnd, now = Date.now()) {
  if (!seasonEnd) return 'Unknown';
  const end = new Date(seasonEnd).getTime();
  if (!Number.isFinite(end)) return 'Unknown';

  const total = Math.max(0, Math.floor((end - now) / 1000));
  return `${Math.floor(total / 86400)}d ${String(Math.floor(total / 3600) % 24).padStart(2, '0')}h ${String(Math.floor(total / 60) % 60).padStart(2, '0')}m ${String(total % 60).padStart(2, '0')}s`;
}

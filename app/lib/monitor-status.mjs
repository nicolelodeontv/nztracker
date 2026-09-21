export function getMonitorStatus({ membersSeen = 0, memberErrors = 0, rankingCacheError = null } = {}) {
  if (Number(membersSeen) <= 0 || Number(memberErrors) > 0 || rankingCacheError) return 'warning';
  return 'success';
}

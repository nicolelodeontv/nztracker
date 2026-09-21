export function summarizeMemberRecording(clans, memberData) {
  const byClan = new Map((Array.isArray(memberData) ? memberData : []).map((data) => [String(data.clanId), data]));
  const issues = (Array.isArray(clans) ? clans : [])
    .filter((clan) => Number(clan?.memberCurrent || 0) > 0)
    .map((clan) => {
      const data = byClan.get(String(clan.clanId));
      const recorded = Number(data?.recordableCount || 0);
      return recorded > 0 ? null : {
        clanId: String(clan.clanId),
        clan: clan.clan,
        expected: Number(clan.memberCurrent || 0),
        recorded,
        error: data?.error || '0 members recorded'
      };
    })
    .filter(Boolean);

  return {
    status: issues.length ? 'warning' : 'success',
    issues,
    error: issues.length
      ? issues.map((issue) => `${issue.clan} (${issue.clanId}): ${issue.error || '0 members recorded'}`).join(' | ')
      : null
  };
}

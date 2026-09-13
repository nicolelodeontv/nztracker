function ageLabel(value) {
  if (!value) return 'never';
  const age = Math.max(0, Date.now() - new Date(value).getTime());
  if (!Number.isFinite(age)) return 'unknown';
  if (age < 60000) return `${Math.floor(age / 1000)}s ago`;
  if (age < 3600000) return `${Math.floor(age / 60000)}m ago`;
  return `${Math.floor(age / 3600000)}h ago`;
}

export default function LeaderboardTable({ type, rows = [], season, round, capturedAt, error }) {
  const isPvp = type === 'pvp';
  return (
    <section className="nz-panel nz-ranking">
      <div className="nz-panel-head">
        <div>
          <span className="nz-kicker">{isPvp ? 'PLAYER PVP' : 'PLAYER PVE'}</span>
          <h2>{isPvp ? 'PvP Leaderboard' : 'PvE Leaderboard'}</h2>
        </div>
        <div className="nz-board-meta"><b>{rows.length}</b> rows · {season || '—'}{round ? ` · Round ${round}` : ''} · Updated {ageLabel(capturedAt)}</div>
      </div>
      {error && <div className="nz-notice">{error}</div>}
      <div className="nz-table-wrap nz-board-wrap">
        <table>
          <thead>
            {isPvp ? (
              <tr><th>RANK</th><th>CHARACTER</th><th>WIN / LOSE</th><th>WINRATE</th></tr>
            ) : (
              <tr><th>RANK</th><th>CHARACTER</th><th>SCORE</th></tr>
            )}
          </thead>
          <tbody>
            {rows.length ? rows.map((row) => (
              <tr key={`${type}-${row.rank}-${row.playerName}`}>
                <td className="rank">#{row.rank}</td>
                <td className="player-cell">{row.playerName || '—'}</td>
                {isPvp ? (
                  <>
                    <td>{Number(row.wins || 0).toLocaleString()} / {Number(row.losses || 0).toLocaleString()}</td>
                    <td className="rep">{Number(row.winRate || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}%</td>
                  </>
                ) : (
                  <td className="rep">{Number(row.score || 0).toLocaleString()}</td>
                )}
              </tr>
            )) : (
              <tr><td colSpan={isPvp ? 4 : 3} className="nz-empty-row">No cached leaderboard data yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function RankingTable({ rows = [], selectedId, onSelect }) {
  return (
    <section className="nz-panel nz-ranking">
      <div className="nz-panel-head"><div><span className="nz-kicker">PLAYER VIEW</span><h2>Clan Ranking</h2></div><span className="nz-muted">{rows.length} clans</span></div>
      <div className="nz-table-wrap">
        <table>
          <thead><tr><th>RANK</th><th>CLAN</th><th>MASTER</th><th>MEMBERS</th><th>REPUTATION</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.clanId || `${row.rank}-${row.clan}`} className={String(selectedId) === String(row.clanId) ? 'is-selected' : ''}>
                <td className="rank">#{row.rank}</td>
                <td><button className="clan-link" onClick={() => onSelect?.(row)}>{row.clan}</button></td>
                <td>{row.master || '—'}</td>
                <td>{row.memberCurrent || 0}/{row.memberMax || 0}</td>
                <td className="rep">{Number(row.reputation || 0).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="nz-empty">No cached ranking dataset is available.</div>}
      </div>
    </section>
  );
}

function value(v, fallback = '—') { return v === null || v === undefined || v === '' ? fallback : v; }

export default function SyncStatusPanel({ sync, health }) {
  const status = String(sync?.status || 'offline').toUpperCase();
  const age = sync?.ageSeconds == null ? '—' : `${Math.floor(sync.ageSeconds / 60)}m ${sync.ageSeconds % 60}s`;
  const sourceCounts = Object.entries(sync?.memberSources || {}).map(([k, v]) => `${k}: ${v}`).join(' • ');
  return (
    <section className="nz-ops-grid">
      <div className={`nz-sync-banner sync-${String(sync?.status || 'offline')}`}>
        <div><span className="nz-kicker">BACKGROUND SYNC</span><strong>{status}</strong><small>Heartbeat age {age}</small></div>
        <div><span>LAST RUN</span><b>{value(sync?.lastRunAt)}</b></div>
        <div><span>NEXT EXPECTED</span><b>{value(sync?.nextExpectedAt)}</b></div>
        <div><span>RANKING CACHE</span><b>{sync?.rankingCacheStored ? 'DURABLE' : 'NOT STORED'}</b></div>
      </div>
      <div className="nz-op-cards">
        <div><span>SOURCE</span><b>{value(sync?.source, 'Ninja Zenshin')}</b><em>{sourceCounts || 'No member source telemetry'}</em></div>
        <div><span>RANKING</span><b>{health?.ranking || 'UNKNOWN'}</b><em>{sync?.clansSeen || 0} clans</em></div>
        <div><span>MEMBERS</span><b>{health?.members || 'UNKNOWN'}</b><em>{sync?.membersSeen || 0} members • {sync?.memberErrors || 0} errors</em></div>
        <div><span>HISTORY / BLOB</span><b>{health?.history || 'UNKNOWN'} / {sync?.durable ? 'DURABLE' : 'LOCAL'}</b><em>{sync?.historyClansChanged || 0} changed clans</em></div>
      </div>
    </section>
  );
}

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
        <div><span>SCRAPER SOURCE</span><b>{value(sync?.source, 'Ninja Zenshin')}</b><em>One monitor fetcher</em></div>
        <div><span>SOURCE HEALTH</span><b>{health?.ranking || 'UNKNOWN'}</b><em>{sync?.clansSeen || 0} clans • {sync?.rankingRows || 0} cached rows</em></div>
        <div><span>MEMBERS / FALLBACK</span><b>{health?.members || 'UNKNOWN'}</b><em>{sourceCounts || 'No fallback telemetry'} • {sync?.memberErrors || 0} errors</em></div>
        <div><span>BLOB / HISTORY</span><b>{health?.history || 'UNKNOWN'} / {sync?.durable ? 'DURABLE' : 'LOCAL'}</b><em>{sync?.historyClansChanged || 0} changed clans</em></div>
      </div>
      <div className={`nz-ops-error ${sync?.error ? 'has-error' : ''}`}><span>MONITOR ERROR</span><b>{sync?.error || 'No error recorded on the latest monitor heartbeat.'}</b></div>
    </section>
  );
}

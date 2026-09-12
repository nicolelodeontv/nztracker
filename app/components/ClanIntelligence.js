import ActivityTimeline from './ActivityTimeline';
import TopGainers from './TopGainers';
import AlertCenter from './AlertCenter';
import EventLog from './EventLog';
import MiniBurn from './MiniBurn';
import { PERIOD_LABELS } from '../lib/metrics';
import { downloadCsv } from '../lib/csv';

const fmt = (n) => Number(n || 0).toLocaleString();

export default function ClanIntelligence({ clan, rows, intel, events, alerts, periodHours, setPeriodHours, eventFilter, setEventFilter }) {
  if (!clan) return <div className="nz-empty">Select a clan to open clean clan intelligence.</div>;

  const exportCsv = () => {
    const safeClan = String(clan.clan || 'clan').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'clan';
    downloadCsv(`nztracker-${safeClan}-${PERIOD_LABELS[periodHours] || `${periodHours}H`}.csv`, rows);
  };

  return (
    <div className="nz-intel">
      <div className="nz-intel-title">
        <div>
          <span className="nz-kicker">CLAN INTELLIGENCE</span>
          <h2>#{clan.rank} {clan.clan}</h2>
          <p>{clan.master || '—'} · {clan.memberCurrent || 0}/{clan.memberMax || 0} members · {fmt(clan.reputation)} REP</p>
        </div>
        <div className="nz-intel-actions">
          <div className="periods">
            {Object.entries(PERIOD_LABELS).map(([hours, label]) => (
              <button key={hours} className={`nz-btn ${Number(hours) === periodHours ? 'active' : ''}`} onClick={() => setPeriodHours(Number(hours))}>{label}</button>
            ))}
          </div>
          <button className="nz-btn" onClick={exportCsv}>EXPORT CSV</button>
        </div>
      </div>
      <div className="nz-metrics">
        <div><span>TOTAL GAIN</span><b>+{fmt(intel.gain)}</b></div>
        <div><span>GAIN / HR</span><b>{fmt(Math.round(intel.hour))}</b></div>
        <div><span>ACTIVE</span><b>{intel.active}</b></div>
        <div><span>NO GAIN</span><b>{intel.noGain}</b></div>
        <div><span>10K BURN</span><b>{intel.burn.length}</b></div>
      </div>
      <div className="nz-intel-grid">
        <TopGainers members={intel.top} />
        <MiniBurn members={intel.burn} />
        <ActivityTimeline events={events} />
        <AlertCenter alerts={alerts} />
        <EventLog events={events} filter={eventFilter} setFilter={setEventFilter} />
      </div>
      <div className="nz-member-table">
        <div className="nz-panel-head"><h3>Member intelligence</h3><span className="nz-muted">{rows.length} members</span></div>
        <div className="nz-table-wrap">
          <table>
            <thead><tr><th>MEMBER</th><th>REP</th><th>GAIN</th><th>GAIN/HR</th><th>STATUS</th></tr></thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td><td>{fmt(m.current)}</td><td className="gain">+{fmt(m.gain)}</td><td>{fmt(Math.round(m.gainPerHour))}</td>
                  <td><span className={`nz-status ${String(m.status).toLowerCase().replace(/\s+/g,'-')}`}>{m.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

import ActivityTimeline from './ActivityTimeline';
import TopGainers from './TopGainers';
import AlertCenter from './AlertCenter';
import EventLog from './EventLog';
import MiniBurn from './MiniBurn';
import { PERIOD_LABELS } from '../lib/metrics';
import { downloadCsv } from '../lib/csv';

const fmt = (n) => Number(n || 0).toLocaleString();
const fmtRate = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

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
        <div><span>GAIN / HR</span><b>{fmtRate(intel.hour)}</b></div>
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
        <div className="nz-panel-head">
          <div>
            <h3>Member intelligence</h3>
            <span className="nz-table-subtitle">REP activity for the selected {PERIOD_LABELS[periodHours] || `${periodHours}H`} window</span>
          </div>
          <span className="nz-muted">{rows.length} members</span>
        </div>
        <div className="nz-table-wrap nz-member-intel-wrap">
          <table className="nz-member-intel-table">
            <thead><tr><th>MEMBER</th><th>REP</th><th>GAIN</th><th>GAIN / HR</th><th>STATUS</th></tr></thead>
            <tbody>
              {rows.length ? rows.map((m) => (
                <tr key={m.id}>
                  <td className="member-name" title={m.name}>{m.name}</td>
                  <td>{fmt(m.current)}</td>
                  <td className={`gain ${m.gain > 0 ? 'has-gain' : 'zero-gain'}`}>{m.gain > 0 ? `+${fmt(m.gain)}` : '0'}</td>
                  <td className="rate">{m.gain > 0 ? `${fmtRate(m.gainPerHour)}/hr` : '—'}</td>
                  <td><span className={`nz-status ${String(m.status).toLowerCase().replace(/\s+/g,'-')}`}>{m.status}</span></td>
                </tr>
              )) : <tr><td colSpan="5" className="nz-empty-row">No member intelligence data available yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

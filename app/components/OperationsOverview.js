'use client';

import { useState } from 'react';
import { formatGlobalMove, memberDisplayName, selectNeedsAttention, selectTopBurn } from '../lib/operations-overview.mjs';

const fmt=(n)=>Number(n||0).toLocaleString();
const periodLabels={1:'1H',3:'3H',6:'6H',12:'12H',24:'24H',168:'7D'};

export default function OperationsOverview({data,rows,periodHours,setPeriodHours}){
  const [opsTab,setOpsTab]=useState('overview');
  const global=data?.global||null;
  const ranking=Array.isArray(data?.globalRanking)?data.globalRanking:[];
  const top=selectTopBurn(rows,5);
  const attention=selectNeedsAttention(rows,6);
  const moveTrackingAvailable=Boolean(data?.global?.moveTrackingAvailable);
  const periodRows=rows.filter((row)=>(row.historyMember?.points?.length||0)>=2);
  const hourly=periodRows.length?periodRows.reduce((sum,row)=>sum+Number(row.gainPerHour||0),0)/periodRows.length:null;
  const projectedDaily=data?.stats?.todayGainAvailable?Number(global?.projectedDailyGain||0):null;
  const eta=Number.isFinite(Number(global?.targetEtaHours))?Number(global.targetEtaHours):null;

  return <section className="ops-overview" aria-label="Operations overview">
    <div className="ops-tabs" role="tablist" aria-label="Operations sections">
      {[
        ['overview','OVERVIEW'],
        ['pace','REP PACE'],
        ['global','GLOBAL TOP']
      ].map(([key,label])=><button key={key} className={opsTab===key?'active':''} role="tab" aria-selected={opsTab===key} onClick={()=>setOpsTab(key)}>{label}</button>)}
    </div>
    {opsTab==='overview'&&<div className="ops-overview-grid">
      <article className="op-card op-hero">
        <span className="eyebrow">GLOBAL POSITION</span>
        <div className="op-rank">#{global?.rank ?? '—'}</div>
        <b>CHAOS</b>
        <span className="op-meta">{fmt(global?.reputation)} REP · {global?.members ?? 0}/{global?.maxMembers ?? 0} MEMBERS</span>
        {global?.above ? <div className="op-target"><span>NEXT TARGET · #{global.above.rank}</span><strong>{global.above.clan}</strong><em>{fmt(global.above.gap)} REP GAP</em></div> : <div className="op-target"><span>GLOBAL POSITION</span><strong>TOP RANK</strong><em>No higher ranked clan in the current snapshot.</em></div>}
      </article>
      <article className="op-card">
        <span className="eyebrow">PACE ESTIMATE</span>
        <strong className="op-number">{projectedDaily===null?'—':'+'+fmt(projectedDaily)}</strong>
        <span className="op-meta">PROJECTED REP / 24H · BASED ON TODAY</span>
        <div className="op-stat-row"><span title="Cumulative REP change since the first recorded snapshot today.">Current daily gain</span><b>{data?.stats?.todayGainAvailable?'+'+fmt(data?.stats?.todayGain):'—'}</b></div>
        <div className="op-stat-row"><span title="Average member REP/hour calculated from recorded history for the selected period. This is separate from manually tracked work hours.">Member avg period rate · {periodLabels[periodHours]}</span><b>{hourly===null?'—':fmt(hourly)+' /h'}</b></div>
        <div className="op-stat-row"><span>Target ETA</span><b>{eta===null?'—':eta<1?'<1h':eta.toFixed(1)+'h'}</b></div>
      </article>
      <article className="op-card">
        <span className="eyebrow">RANK TARGET</span>
        <strong className="op-number">{global?.above ? '#'+global.above.rank : '—'}</strong>
        <span className="op-meta">{global?.above?.clan || 'No target above'}</span>
        <div className="op-target-big">{global?.above ? fmt(global.above.reputation) : fmt(global?.reputation)}</div>
        <small>{global?.above ? fmt(global.above.gap)+' REP needed to reach the next rank.' : 'CHAOS is currently the highest ranked tracked clan.'}</small>
      </article>
    </div>}

    {opsTab==='pace'&&<div className="panel ops-period-panel">
      <div className="section-title">
        <div><span className="eyebrow">BURN ANALYSIS</span><h2>REP PACE</h2></div>
        <div className="period-switch" role="group" aria-label="REP analysis period">
          {Object.entries(periodLabels).map(([value,label])=><button key={value} className={periodHours===Number(value)?'active':''} onClick={()=>setPeriodHours(Number(value))}>{label}</button>)}
        </div>
      </div>
      <div className="ops-burn-grid">
        <div>
          <span className="eyebrow">TOP BURN · {periodLabels[periodHours]}</span>
          <div className="ops-list">
            {top.map((row,i)=><div className="ops-list-row" key={row.id}><b>#{i+1}</b><span>{memberDisplayName(row)}</span><strong>+{fmt(row.gain)}</strong><em>{fmt(row.gainPerHour)}/h</em></div>)}
            {!top.length&&<div className="chart-empty">NO PERIOD DATA</div>}
          </div>
        </div>
        <div>
          <span className="eyebrow">NEEDS ATTENTION · {periodLabels[periodHours]}</span>
          <div className="ops-list">
            {attention.map((row)=><div className="ops-list-row attention" key={row.id}><b>!</b><span className="attention-member"><strong>{memberDisplayName(row)}</strong><small>{String(row.status||'UNKNOWN').toUpperCase()}</small></span><strong>+{fmt(row.gain)}</strong><em>{fmt(row.gainPerHour)}/h</em></div>)}
            {!attention.length&&<div className="chart-empty">NO MEMBERS FLAGGED</div>}
          </div>
        </div>
      </div>
    </div>}

    {opsTab==='global'&&<div className="panel global-panel">
      <div className="section-title"><div><span className="eyebrow">GLOBAL RANKING</span><h2>TOP 10 CLANS</h2></div><span>{ranking.length} shown · {data?.global?.capturedAt ? new Date(data.global.capturedAt).toLocaleTimeString() : '—'}</span></div>
      <div className="table-scroll">
        <table className="global-table">
          <thead><tr><th>RANK</th><th>CLAN</th><th>MASTER</th><th>MEMBERS</th><th>REP</th><th>MOVE</th><th>GAP</th></tr></thead>
          <tbody>
            {ranking.map((row)=><tr key={row.clanId} className={String(row.clanId)===String(data?.config?.clan_id)?'is-chaos':''}>
              <td>#{row.rank}</td><td className="member-name">{row.clan}</td><td>{row.master||'—'}</td><td>{row.memberCurrent}/{row.memberMax}</td><td className="num">{fmt(row.reputation)}</td>
              <td className={(row.change?.rankDelta||0)>0?'up':(row.change?.rankDelta||0)<0?'down':''}>{formatGlobalMove(row.change,moveTrackingAvailable)}</td>
              <td>{row.rank>1?rankingGap(row,ranking):'—'}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>}
  </section>;
}

function rankingGap(row,ranking){
  const above=ranking.find((candidate)=>Number(candidate.rank)===Number(row.rank)-1);
  return above?Math.max(0,Number(above.reputation||0)-Number(row.reputation||0)):0;
}

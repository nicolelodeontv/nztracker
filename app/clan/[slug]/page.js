'use client';

import { useEffect, useMemo, useState } from 'react';
import '../../tracker.css';

const MAX_STAMINA = 200;
const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const decode = (value) => decodeURIComponent(String(value || ''));

function normalizeMember(member) {
  const currentValue = Number(member?.stamina);
  const maxValue = Number(member?.maxStamina);
  const maxStamina = Number.isFinite(maxValue) && maxValue > 0 ? maxValue : MAX_STAMINA;
  const stamina = Number.isFinite(currentValue) ? Math.max(0, Math.min(currentValue, maxStamina)) : maxStamina;
  return { ...member, stamina, maxStamina, bleeding: stamina <= maxStamina * 0.7 };
}

export default function ClanDetailPage({ params }) {
  const [clan, setClan] = useState(null);
  const [members, setMembers] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState(null);
  const slug = decode(params?.slug || '');

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const ranking = await fetch(`/api/clan-ranking?t=${Date.now()}`, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error('Ranking source unavailable'); return r.json(); });
        const found = (ranking.rows || []).find((row) => String(row.clan || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') === slug);
        if (!found) throw new Error('Clan not found');
        const memberResponse = found.clanId ? await fetch(`/api/clan-members?clanId=${encodeURIComponent(found.clanId)}&t=${Date.now()}`, { cache: 'no-store' }) : null;
        const memberData = memberResponse?.ok ? await memberResponse.json() : { members: [] };
        if (!active) return;
        setClan(found);
        setMembers((memberData.members || []).map(normalizeMember));
        setUpdated(new Date(memberData.fetchedAt || Date.now()));
        setStatus('live');
      } catch (e) { if (active) { setStatus('error'); setError(e instanceof Error ? e.message : 'Unable to load clan'); } }
    };
    load();
    return () => { active = false; };
  }, [slug]);

  const verified = useMemo(() => members.filter((m) => m.stamina != null && m.maxStamina != null).length, [members]);
  const low = useMemo(() => members.filter((m) => m.bleeding === true).length, [members]);

  if (status === 'loading') return <main className="tracker"><div className="empty">Loading clan intelligence…</div></main>;
  if (status === 'error' || !clan) return <main className="tracker"><div className="empty">{error || 'Clan not found.'}</div></main>;

  return <main className="tracker">
    <header className="hero"><div><div className="eyebrow">● CLAN DETAIL // LIVE</div><h1>{clan.clan}</h1><p>Rank #{clan.rank} · Master {clan.master || '—'} · {clan.memberCurrent}/{clan.memberMax} members</p></div><div className="hero-actions"><a className="minor-button" href="/">← Clan Intelligence</a><a className="minor-button" href="/war">⚔ Clan War</a></div></header>
    <section className="stats"><div className="card"><div className="eyebrow">REPUTATION</div><strong>{fmt(clan.reputation)}</strong><small>Current ranking</small></div><div className="card"><div className="eyebrow">STAMINA VERIFIED</div><strong>{verified}/{members.length || clan.memberCurrent || 0}</strong><small>{members.length ? `${Math.round(verified / members.length * 100)}% source coverage` : 'No member data'}</small></div><div className="card"><div className="eyebrow">LOW STAMINA</div><strong>{low}</strong><small>At/below 70% of the 200 stamina cap</small></div><div className="card"><div className="eyebrow">STATUS</div><strong>{members.length && verified === members.length && low >= Math.ceil(members.length * .5) ? '🔴 BLEEDING' : verified ? low ? '🟡 POTENTIAL' : '🟢 HEALTHY' : '⚪ UNKNOWN'}</strong><small>Last sync {updated?.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})}</small></div></section>
    <section className="section"><div className="section-head"><div><div className="eyebrow">LIVE MEMBERS</div><h2>Stamina & Reputation</h2><p>Default Max Stamina is 200 when the source omits the value; live source values take priority.</p></div></div><div className="table-wrap"><div className="table-head" style={{minWidth:'760px',gridTemplateColumns:'minmax(180px,1fr) 70px 120px 120px 100px'}}><span>MEMBER</span><span>LEVEL</span><span>REPUTATION</span><span>STAMINA</span><span>STATUS</span></div>{members.map((m, i)=><div className="table-row" key={`${m.name}-${i}`} style={{minWidth:'760px',gridTemplateColumns:'minmax(180px,1fr) 70px 120px 120px 100px'}}><span className="clan-cell"><b>{m.name}</b></span><span>{m.level || '—'}</span><span>{fmt(m.reputation)}</span><span>{`${fmt(m.stamina)} / ${fmt(m.maxStamina)}`}</span><span className={m.bleeding ? 'gain' : 'muted'}>{m.bleeding ? '🔴 LOW' : '🟢 OK'}</span></div>)}</div></section>
  </main>;
}

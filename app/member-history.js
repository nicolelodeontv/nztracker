'use client';

import { useEffect } from 'react';

const STORAGE_KEY = 'nztracker-member-history-v1';
const MAX_SNAPSHOTS_PER_CLAN = 1000;

function readHistory() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}
function writeHistory(history) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history)); } catch {} }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function safeName(value) { return String(value || 'member-history').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase() || 'member-history'; }

function parseCurrentModal() {
  const modal = document.querySelector('.memberModal');
  if (!modal) return null;
  const title = modal.querySelector('.memberModalHeader h2')?.textContent?.trim();
  const tableRows = [...modal.querySelectorAll('.memberTable .memberRow')];
  if (!title || !tableRows.length) return null;
  const members = tableRows.map(row => {
    const cells = row.querySelectorAll('span, strong');
    const name = cells[1]?.textContent?.trim() || '';
    const level = Number((cells[2]?.textContent || '').replace(/[^0-9]/g,'')) || 0;
    const reputation = Number((cells[3]?.textContent || '0').replace(/[^0-9.-]/g,'')) || 0;
    return { name, level, reputation };
  }).filter(member => member.name);
  return members.length ? { clan:title, capturedAt:new Date().toISOString(), members } : null;
}
function snapshotKey(snapshot) { return snapshot.members.map(m=>`${m.name}|${m.level}|${m.reputation}`).join(';;'); }
function saveSnapshot(snapshot) {
  const history = readHistory(), clanHistory = history[snapshot.clan] || [], last = clanHistory[clanHistory.length-1];
  if (last && snapshotKey(last) === snapshotKey(snapshot)) return history;
  history[snapshot.clan] = [...clanHistory, snapshot].slice(-MAX_SNAPSHOTS_PER_CLAN);
  writeHistory(history);
  return history;
}
function currentClanHistory(clan) { return readHistory()[clan] || []; }
function buildHistoryRows(clanHistory) {
  const rows = [], previousByName = {};
  for (const snapshot of clanHistory.slice(-20)) {
    for (const member of snapshot.members) {
      const previous = previousByName[member.name];
      const delta = typeof previous === 'number' ? member.reputation - previous : 0;
      rows.push({ capturedAt:snapshot.capturedAt, ...member, delta });
      previousByName[member.name] = member.reputation;
    }
  }
  return rows.slice(-100).reverse();
}
function makeCsv(clan, snapshots) {
  const lines = ['timestamp,clan,member,level,reputation,delta_reputation'];
  const previousByName = {};
  for (const snapshot of snapshots) {
    for (const member of snapshot.members) {
      const previous = previousByName[member.name];
      const delta = typeof previous === 'number' ? member.reputation - previous : '';
      lines.push([snapshot.capturedAt,clan,member.name,member.level,member.reputation,delta].map(v=>`"${String(v ?? '').replace(/"/g,'""')}"`).join(','));
      previousByName[member.name] = member.reputation;
    }
  }
  return lines.join('\n');
}
function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderHistory() {
  const modalBody = document.querySelector('.memberModalBody');
  const modal = document.querySelector('.memberModal');
  if (!modalBody || !modal) return;
  const title = modal.querySelector('.memberModalHeader h2')?.textContent?.trim();
  const memberTable = modalBody.querySelector('.memberTable');
  if (!title || !memberTable) return;

  const snapshot = parseCurrentModal();
  if (snapshot) saveSnapshot(snapshot);

  const old = modalBody.querySelector('[data-member-history]');
  if (old) old.remove();

  const snapshots = currentClanHistory(title);
  const rows = buildHistoryRows(snapshots);
  const section = document.createElement('section');
  section.className = 'memberHistory';
  section.dataset.memberHistory = 'true';
  section.innerHTML = `
    <div class="memberHistoryHeader">
      <div><div class="panelLabel">MEMBER REPUTATION HISTORY</div><strong>${snapshots.length} snapshots</strong><span> · automatic 30s snapshots</span></div>
      <div class="memberHistoryActions"><button type="button" class="ghost" data-history-json>⇩ JSON</button><button type="button" class="ghost" data-history-csv>⇩ CSV</button></div>
    </div>
    <div class="memberHistoryTableWrap"><table class="memberHistoryTable"><thead><tr><th>TIME</th><th>MEMBER</th><th>LEVEL</th><th>REPUTATION</th><th>Δ REP</th></tr></thead><tbody>
      ${rows.length ? rows.map(row=>`<tr><td>${escapeHtml(new Date(row.capturedAt).toLocaleString())}</td><td>${escapeHtml(row.name)}</td><td>${row.level || '—'}</td><td>${Number(row.reputation || 0).toLocaleString()}</td><td class="${row.delta>0?'up':row.delta<0?'down':''}">${row.delta>0?'+'+row.delta.toLocaleString():row.delta<0?row.delta.toLocaleString():'—'}</td></tr>`).join('') : '<tr><td colspan="5" class="memberHistoryEmpty">History will appear after the next live refresh.</td></tr>'}
    </tbody></table></div>
  `;
  modalBody.appendChild(section);

  section.querySelector('[data-history-json]')?.addEventListener('click', () => {
    const current = currentClanHistory(title);
    downloadFile(`ninja-zenshin-${safeName(title)}-member-history.json`, JSON.stringify({ clan:title, snapshots:current }, null, 2), 'application/json;charset=utf-8');
  });
  section.querySelector('[data-history-csv]')?.addEventListener('click', () => {
    const current = currentClanHistory(title);
    downloadFile(`ninja-zenshin-${safeName(title)}-member-history.csv`, makeCsv(title, current), 'text/csv;charset=utf-8');
  });
}

export default function MemberHistory() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(renderHistory);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList:true, subtree:true, characterData:true });
    const timer = window.setInterval(schedule, 1000);
    schedule();
    return () => { observer.disconnect(); clearInterval(timer); cancelAnimationFrame(frame); };
  }, []);
  return null;
}

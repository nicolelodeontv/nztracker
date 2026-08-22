'use client';

import { useEffect } from 'react';

const STORAGE_KEY = 'nztracker-member-history-v1';
const MAX_SNAPSHOTS_PER_CLAN = 1000;

function readHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeHistory(history) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {}
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function parseCurrentModal() {
  const modal = document.querySelector('.memberModal');
  if (!modal) return null;
  const title = modal.querySelector('.memberModalHeader h2')?.textContent?.trim();
  const tableRows = [...modal.querySelectorAll('.memberTable .memberRow')];
  if (!title || !tableRows.length) return null;

  const members = tableRows.map(row => {
    const cells = row.querySelectorAll('span, strong');
    const name = cells[1]?.textContent?.trim() || '';
    const level = Number((cells[2]?.textContent || '').replace(/[^0-9]/g, '')) || 0;
    const reputationText = cells[3]?.textContent || '0';
    const reputation = Number(reputationText.replace(/[^0-9.-]/g, '')) || 0;
    return { name, level, reputation };
  }).filter(member => member.name);

  if (!members.length) return null;
  return { clan: title, capturedAt: new Date().toISOString(), members };
}

function snapshotKey(snapshot) {
  return snapshot.members.map(m => `${m.name}|${m.level}|${m.reputation}`).join(';;');
}

function saveSnapshot(snapshot) {
  const history = readHistory();
  const clanHistory = history[snapshot.clan] || [];
  const last = clanHistory[clanHistory.length - 1];
  if (last && snapshotKey(last) === snapshotKey(snapshot)) return history;

  history[snapshot.clan] = [...clanHistory, snapshot].slice(-MAX_SNAPSHOTS_PER_CLAN);
  writeHistory(history);
  return history;
}

function buildHistoryRows(clanHistory) {
  const rows = [];
  const previousByName = {};
  const snapshots = [...clanHistory].reverse().slice(0, 20).reverse();

  for (const snapshot of snapshots) {
    for (const member of snapshot.members) {
      const previous = previousByName[member.name];
      const delta = typeof previous === 'number' ? member.reputation - previous : 0;
      rows.push({ capturedAt: snapshot.capturedAt, ...member, delta });
      previousByName[member.name] = member.reputation;
    }
  }

  return rows.slice(-100).reverse();
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function currentClanHistory(clan) {
  return readHistory()[clan] || [];
}

function csvForClan(clan, snapshots) {
  const lines = ['timestamp,clan,member,level,reputation,delta_reputation'];
  const previousByName = {};
  for (const snapshot of snapshots) {
    for (const member of snapshot.members) {
      const previous = previousByName[member.name];
      const delta = typeof previous === 'number' ? member.reputation - previous : '';
      const cells = [snapshot.capturedAt, clan, member.name, member.level, member.reputation, delta]
        .map(value => `"${String(value ?? '').replace(/"/g, '""')}"`);
      lines.push(cells.join(','));
      previousByName[member.name] = member.reputation;
    }
  }
  return lines.join('\n');
}

function mountHistory() {
  const modalBody = document.querySelector('.memberModalBody');
  const modal = document.querySelector('.memberModal');
  if (!modalBody || !modal || modal.style.display === 'none') return;

  const title = modal.querySelector('.memberModalHeader h2')?.textContent?.trim();
  if (!title || !modalBody.querySelector('.memberTable')) return;

  const snapshot = parseCurrentModal();
  if (snapshot) saveSnapshot(snapshot);

  const existing = modalBody.querySelector('[data-member-history]');
  if (existing) existing.remove();

  const snapshots = currentClanHistory(title);
  const rows = buildHistoryRows(snapshots);
  const section = document.createElement('section');
  section.dataset.memberHistory = 'true';
  section.className = 'memberHistory';

  section.innerHTML = `
    <div class="memberHistoryHeader">
      <div>
        <div class="panelLabel">REPUTATION HISTORY</div>
        <strong>${snapshots.length} snapshots</strong>
        <span> · saved automatically every live refresh</span>
      </div>
      <div class="memberHistoryActions">
        <button type="button" class="ghost history-download-json">⇩ JSON</button>
        <button type="button" class="ghost history-download-csv">⇩ CSV</button>
      </div>
    </div>
    <div class="memberHistoryTableWrap">
      <table class="memberHistoryTable">
        <thead><tr><th>TIME</th><th>MEMBER</th><th>LEVEL</th><th>REPUTATION</th><th>Δ REP</th></tr></thead>
        <tbody>
          ${rows.length ? rows.map(row => `
            <tr>
              <td>${escapeHtml(new Date(row.capturedAt).toLocaleString())}</td>
              <td>${escapeHtml(row.name)}</td>
              <td>${row.level || '—'}</td>
              <td>${Number(row.reputation || 0).toLocaleString()}</td>
              <td class="${row.delta > 0 ? 'up' : row.delta < 0 ? 'down' : ''}">${row.delta > 0 ? '+' + row.delta.toLocaleString() : row.delta < 0 ? row.delta.toLocaleString() : '—'}</td>
            </tr>
          `).join('') : '<tr><td colspan="5" class="memberHistoryEmpty">History will appear after the next live snapshots.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;

  modalBody.appendChild(section);

  section.querySelector('.history-download-json')?.addEventListener('click', () => {
    downloadFile(
      `ninja-zenshin-${title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}-member-history.json`,
      JSON.stringify({ clan: title, snapshots }, null, 2),
      'application/json'
    );
  });

  section.querySelector('.history-download-csv')?.addEventListener('click', () => {
    downloadFile(
      `ninja-zenshin-${title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}-member-history.csv`,
      csvForClan(title, snapshots),
      'text/csv;charset=utf-8'
    );
  });
}

export default function MemberHistory() {
  useEffect(() => {
    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(mountHistory);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    const timer = window.setInterval(mountHistory, 1000);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  return null;
}

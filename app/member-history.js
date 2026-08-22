'use client';

import { useEffect } from 'react';

const STORAGE_KEY = 'nztracker-member-history-v1';
const MAX_SNAPSHOTS_PER_CLAN = 1000;

function readHistory() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}
function writeHistory(history) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history)); } catch {} }
function safeName(value) {
  return String(value || 'member-history').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'member-history';
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
    const reputation = Number((cells[3]?.textContent || '0').replace(/[^0-9.-]/g, '')) || 0;
    return { name, level, reputation };
  }).filter(member => member.name);
  return members.length ? { clan: title, capturedAt: new Date().toISOString(), members } : null;
}
function snapshotKey(snapshot) { return snapshot.members.map(m => `${m.name}|${m.level}|${m.reputation}`).join(';;'); }
function saveSnapshot(snapshot) {
  const history = readHistory();
  const clanHistory = history[snapshot.clan] || [];
  const last = clanHistory[clanHistory.length - 1];
  if (last && snapshotKey(last) === snapshotKey(snapshot)) return;
  history[snapshot.clan] = [...clanHistory, snapshot].slice(-MAX_SNAPSHOTS_PER_CLAN);
  writeHistory(history);
}
function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.position = 'fixed';
  link.style.left = '-9999px';
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => { link.remove(); URL.revokeObjectURL(url); }, 5000);
}
function makeCsv(clan, snapshots) {
  const lines = ['timestamp,clan,member,level,reputation,delta_reputation'];
  const previousByName = {};
  for (const snapshot of snapshots) {
    for (const member of snapshot.members) {
      const previous = previousByName[member.name];
      const delta = typeof previous === 'number' ? member.reputation - previous : '';
      lines.push([
        snapshot.capturedAt,
        clan,
        member.name,
        member.level,
        member.reputation,
        delta
      ].map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','));
      previousByName[member.name] = member.reputation;
    }
  }
  return '\ufeff' + lines.join('\r\n');
}
function addDownloadButtons(modal, title) {
  const actions = modal.querySelector('.memberModalActions');
  if (!actions) return;
  let wrap = actions.querySelector('[data-member-history-downloads]');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.dataset.memberHistoryDownloads = 'true';
    wrap.className = 'memberHistoryTopDownloads';
    wrap.innerHTML = `
      <button type="button" class="ghost" data-member-history-json>⇩ JSON</button>
      <button type="button" class="ghost" data-member-history-csv>⇩ CSV</button>
    `;
    actions.insertBefore(wrap, actions.querySelector('.modalClose'));
  }
  const jsonButton = wrap.querySelector('[data-member-history-json]');
  const csvButton = wrap.querySelector('[data-member-history-csv]');
  if (jsonButton && !jsonButton.dataset.bound) {
    jsonButton.dataset.bound = 'true';
    jsonButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const current = readHistory()[title] || [];
      downloadFile(
        `ninja-zenshin-${safeName(title)}-member-history.json`,
        JSON.stringify({ clan: title, snapshotCount: current.length, snapshots: current }, null, 2),
        'application/json'
      );
    });
  }
  if (csvButton && !csvButton.dataset.bound) {
    csvButton.dataset.bound = 'true';
    csvButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const current = readHistory()[title] || [];
      downloadFile(`ninja-zenshin-${safeName(title)}-member-history.csv`, makeCsv(title, current), 'text/csv');
    });
  }
}

function renderHistory() {
  const modal = document.querySelector('.memberModal');
  if (!modal) return;
  const title = modal.querySelector('.memberModalHeader h2')?.textContent?.trim();
  if (!title) return;

  const snapshot = parseCurrentModal();
  if (snapshot) saveSnapshot(snapshot);

  // History remains stored in localStorage for export, but is no longer rendered as a visible section.
  modal.querySelector('[data-member-history-section]')?.remove();
  addDownloadButtons(modal, title);
}

export default function MemberHistory() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(renderHistory);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    const timer = window.setInterval(schedule, 1000);
    schedule();
    return () => {
      observer.disconnect();
      clearInterval(timer);
      cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}

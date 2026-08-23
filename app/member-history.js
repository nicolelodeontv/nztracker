'use client';

import { useEffect } from 'react';

const STORAGE_KEY = 'nztracker-member-history-v2';

function readHistory() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}
function writeHistory(history) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history)); } catch {} }
function safeName(value) {
  return String(value || 'member-history').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'member-history';
}
function csvEscape(value) { return `"${String(value ?? '').replace(/"/g, '""')}"`; }
function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => { link.remove(); URL.revokeObjectURL(url); }, 5000);
}
function getCurrentMembers(modal) {
  return [...modal.querySelectorAll('.member-table .member-row')].map((row) => {
    const cells = [...row.children];
    const value = (index) => (cells[index]?.textContent || '').trim();
    return {
      name: value(1),
      level: Number(value(2).replace(/[^0-9.-]/g, '')) || 0,
      reputation: Number(value(3).replace(/[^0-9.-]/g, '')) || 0,
      gain: Number(value(4).replace(/[^0-9.-]/g, '')) || 0,
      totalGain: Number(value(5).replace(/[^0-9.-]/g, '')) || 0
    };
  }).filter((member) => member.name);
}
function parseCsv(text) {
  const lines = text.replace(/^\ufeff/, '').split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const rows = lines.map((line) => {
    const values = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (quoted && line[i + 1] === '"') { current += '"'; i += 1; }
        else quoted = !quoted;
      } else if (char === ',' && !quoted) { values.push(current); current = ''; }
      else current += char;
    }
    values.push(current);
    return values;
  });
  const header = rows[0].map((value) => value.trim().toLowerCase());
  const find = (names) => names.map((name) => header.indexOf(name)).find((index) => index >= 0);
  const nameIndex = find(['member', 'name', 'player']);
  const levelIndex = find(['level', 'lvl']);
  const repIndex = find(['reputation', 'rep']);
  const gainIndex = find(['gain', 'delta_reputation', 'delta rep']);
  const totalGainIndex = find(['totalgain', 'total gain']);
  if (nameIndex == null) return [];
  return rows.slice(1).map((row) => ({
    name: String(row[nameIndex] || '').trim(),
    level: Number(row[levelIndex] || 0) || 0,
    reputation: Number(row[repIndex] || 0) || 0,
    gain: Number(row[gainIndex] || 0) || 0,
    totalGain: Number(row[totalGainIndex] || 0) || 0
  })).filter((member) => member.name);
}
function renderMembers(modal, members) {
  const table = modal.querySelector('.member-table');
  if (!table) return;
  let body = table.querySelector('[data-imported-member-body]');
  if (!body) {
    body = document.createElement('div');
    body.dataset.importedMemberBody = 'true';
    table.appendChild(body);
  }
  body.innerHTML = members.map((member, index) => `
    <div class="member-row">
      <span>${index + 1}</span>
      <b>${String(member.name).replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]))}</b>
      <span>${member.level || '—'}</span>
      <span>${Number(member.reputation || 0).toLocaleString('en-US')}</span>
      <span class="gain">${Number(member.gain || 0) > 0 ? `+${Number(member.gain).toLocaleString('en-US')}` : '0'}</span>
      <span class="total-gain">${Number(member.totalGain || 0).toLocaleString('en-US')}</span>
    </div>`).join('');
}
function mount() {
  const modal = document.querySelector('.modal');
  const header = modal?.querySelector('.modal-head');
  if (!modal || !header) return;
  const clan = header.querySelector('h2')?.textContent?.trim() || 'clan';
  let actions = header.querySelector('[data-member-import-export]');
  if (!actions) {
    actions = document.createElement('div');
    actions.dataset.memberImportExport = 'true';
    actions.className = 'member-import-export';
    actions.innerHTML = `
      <button type="button" class="minor-button" data-member-export>⇩ Export</button>
      <button type="button" class="minor-button" data-member-import>⇧ Import</button>
      <input type="file" accept=".csv,text/csv" data-member-file hidden />`;
    header.appendChild(actions);
  }
  const exportButton = actions.querySelector('[data-member-export]');
  const importButton = actions.querySelector('[data-member-import]');
  const fileInput = actions.querySelector('[data-member-file]');
  if (!exportButton.dataset.bound) {
    exportButton.dataset.bound = 'true';
    exportButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const members = getCurrentMembers(modal);
      const history = readHistory();
      history[clan] = { clan, exportedAt: new Date().toISOString(), members };
      writeHistory(history);
      const csv = [
        ['member', 'level', 'reputation', 'gain', 'total_gain'],
        ...members.map((member) => [member.name, member.level, member.reputation, member.gain, member.totalGain])
      ].map((row) => row.map(csvEscape).join(',')).join('\r\n');
      downloadFile(`ninja-zenshin-${safeName(clan)}-members.csv`, `\ufeff${csv}`, 'text/csv');
    });
  }
  if (!importButton.dataset.bound) {
    importButton.dataset.bound = 'true';
    importButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      fileInput.click();
    });
  }
  if (!fileInput.dataset.bound) {
    fileInput.dataset.bound = 'true';
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const text = await file.text();
      const members = parseCsv(text);
      if (!members.length) {
        window.alert('No valid member rows were found in this CSV.');
        fileInput.value = '';
        return;
      }
      const history = readHistory();
      history[`${clan}:imported`] = { clan, importedAt: new Date().toISOString(), members };
      writeHistory(history);
      renderMembers(modal, members);
      window.alert(`${members.length} members imported. The live API may replace these rows on the next refresh.`);
      fileInput.value = '';
    });
  }
}

export default function MemberHistory() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(mount);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(schedule, 800);
    schedule();
    return () => { observer.disconnect(); clearInterval(timer); cancelAnimationFrame(frame); };
  }, []);
  return null;
}

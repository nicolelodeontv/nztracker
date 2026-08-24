'use client';

import { useEffect } from 'react';

const STORAGE_KEY = 'nztracker:imported-members:v1';

function safeName(value) {
  return String(value || 'clan').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'clan';
}

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/[\s-]+/g, '_');
}

function parseDelimited(text) {
  const delimiter = text.split(/\r?\n/, 1)[0]?.includes('\t') ? '\t' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; i += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === delimiter && !quoted) { row.push(cell.trim()); cell = ''; continue; }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell.trim()); cell = '';
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
      continue;
    }
    cell += char;
  }
  row.push(cell.trim());
  if (row.some(value => value !== '')) rows.push(row);
  return rows;
}

function num(value) {
  const cleaned = String(value ?? '').replace(/,/g, '').replace(/[^0-9.-]/g, '');
  return Number(cleaned || 0);
}

function parseMembers(text) {
  const rows = parseDelimited(text.replace(/^\ufeff/, ''));
  if (rows.length < 2) throw new Error('The Google Sheets file is empty.');

  const headers = rows[0].map(normalizeHeader);
  const find = (...names) => names.map(normalizeHeader).map(name => headers.indexOf(name)).find(index => index >= 0) ?? -1;
  const nameIndex = find('member', 'name', 'username', 'player');
  if (nameIndex < 0) throw new Error('Missing a MEMBER or NAME column.');

  const levelIndex = find('level', 'lvl');
  const reputationIndex = find('reputation', 'rep');
  const gainIndex = find('gain', 'rep_gain', 'delta_rep', 'delta_reputation');
  const totalGainIndex = find('total_gain', 'total_rep_gain', 'total_gain_rep');

  return rows.slice(1).map(row => ({
    name: row[nameIndex]?.trim(),
    level: levelIndex >= 0 ? num(row[levelIndex]) : 0,
    reputation: reputationIndex >= 0 ? num(row[reputationIndex]) : 0,
    gain: gainIndex >= 0 ? num(row[gainIndex]) : 0,
    totalGain: totalGainIndex >= 0 ? num(row[totalGainIndex]) : 0
  })).filter(member => member.name);
}

function readImported() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch { return {}; }
}

function writeImported(value) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch {}
}

function renderRows(members, table) {
  let container = table.querySelector('[data-imported-body]');
  if (!container) {
    container = document.createElement('div');
    container.dataset.importedBody = 'true';
    table.appendChild(container);
  }
  container.innerHTML = '';
  members.forEach((member, index) => {
    const row = document.createElement('div');
    row.className = 'member-row';
    row.innerHTML = `
      <span>${index + 1}</span>
      <b></b>
      <span>${member.level || '—'}</span>
      <span>${Number(member.reputation || 0).toLocaleString('en-US')}</span>
      <span class="gain">${member.gain > 0 ? `+${Number(member.gain).toLocaleString('en-US')}` : '0'}</span>
      <span class="total-gain">${Number(member.totalGain || 0).toLocaleString('en-US')}</span>
    `;
    row.querySelector('b').textContent = member.name;
    container.appendChild(row);
  });
}

function mount() {
  const modal = document.querySelector('.modal');
  if (!modal) return;
  const title = modal.querySelector('.modal-head h2')?.textContent?.trim();
  const table = modal.querySelector('.member-table');
  const memberStats = modal.querySelector('.member-stats');
  if (!title || !table || !memberStats) return;

  let actions = modal.querySelector('[data-member-import-actions]');
  if (!actions) {
    actions = document.createElement('div');
    actions.dataset.memberImportActions = 'true';
    actions.className = 'member-import-actions';
    actions.innerHTML = `
      <button type="button" class="minor-button" data-import-members>⇧ Import Google Sheets CSV</button>
      <input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" data-import-members-input hidden />
      <span class="member-import-status" data-import-members-status></span>
    `;
    memberStats.parentElement.insertBefore(actions, memberStats);

    const button = actions.querySelector('[data-import-members]');
    const input = actions.querySelector('[data-import-members-input]');
    const status = actions.querySelector('[data-import-members-status]');

    button.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        status.textContent = 'Reading…';
        const members = parseMembers(await file.text());
        if (!members.length) throw new Error('No member rows were found.');
        const stored = readImported();
        stored[title] = { importedAt: new Date().toISOString(), members };
        writeImported(stored);
        renderRows(members, table);
        status.textContent = `${members.length} imported`;
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : 'Import failed.';
      } finally {
        input.value = '';
      }
    });
  }

  const imported = readImported()[title];
  if (imported?.members?.length) {
    renderRows(imported.members, table);
    const status = actions.querySelector('[data-import-members-status]');
    if (status && !status.textContent) status.textContent = `${imported.members.length} imported`;
  }
}

export default function MemberImport() {
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

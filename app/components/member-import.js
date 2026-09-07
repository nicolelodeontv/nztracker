'use client';

import { useEffect, useRef } from 'react';

const STORAGE_KEY = 'nztracker:imported-members';

function readStore() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function writeStore(value) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {}
}

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === ',' && !quoted) {
      row.push(cell.trim());
      cell = '';
      continue;
    }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell.trim());
      cell = '';
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      continue;
    }
    cell += char;
  }

  row.push(cell.trim());
  if (row.some((value) => value !== '')) rows.push(row);
  return rows;
}

function cleanNumber(value) {
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeMembers(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((member) => ({
      name: String(member?.name ?? member?.member ?? '').trim(),
      level: cleanNumber(member?.level ?? member?.lv),
      rep: cleanNumber(member?.rep ?? member?.reputation),
      gain: cleanNumber(member?.gain),
      totalGain: cleanNumber(member?.totalGain ?? member?.total_gain ?? member?.totalgain),
    }))
    .filter((member) => member.name)
    .slice(0, 200);
}

function parseImportedFile(name, text) {
  if (name.toLowerCase().endsWith('.json')) {
    const data = JSON.parse(text);
    const members = Array.isArray(data) ? data : data?.members;
    return normalizeMembers(members);
  }

  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('CSV must contain a header row and at least one member.');

  const headers = rows[0].map(normalizeHeader);
  const find = (...names) => names.map(normalizeHeader).map((name) => headers.indexOf(name)).find((index) => index >= 0);
  const nameIndex = find('name', 'member', 'player', 'username');
  const levelIndex = find('level', 'lv');
  const repIndex = find('rep', 'reputation');
  const gainIndex = find('gain');
  const totalGainIndex = find('totalgain', 'total_gain', 'total gain');

  if (nameIndex == null) throw new Error('CSV needs a Name or Member column.');

  return normalizeMembers(rows.slice(1).map((values) => ({
    name: values[nameIndex],
    level: levelIndex == null ? 0 : values[levelIndex],
    rep: repIndex == null ? 0 : values[repIndex],
    gain: gainIndex == null ? 0 : values[gainIndex],
    totalGain: totalGainIndex == null ? 0 : values[totalGainIndex],
  })));
}

function getCurrentClanName() {
  return document.querySelector('.clr-modal.show .clr-modal-head b')?.textContent?.trim() || '';
}

function renderImportedMembers(members) {
  const body = document.querySelector('.clr-modal.show .clr-modal-body');
  const table = body?.querySelector('.clr-mtable');
  const tbody = table?.querySelector('tbody');
  if (!tbody) return false;

  tbody.replaceChildren();
  members.forEach((member, index) => {
    const row = document.createElement('tr');
    const cells = [
      String(index + 1),
      member.name,
      member.level ? String(member.level) : '-',
      Number(member.rep || 0).toLocaleString('en-US'),
      Number(member.gain || 0).toLocaleString('en-US'),
      Number(member.totalGain || 0).toLocaleString('en-US'),
    ];
    cells.forEach((value, cellIndex) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      if (cellIndex >= 3) cell.style.textAlign = 'right';
      if (cellIndex === 4) cell.className = 'gain-number';
      if (cellIndex === 5) cell.className = 'total-gain-number';
      row.appendChild(cell);
    });
    tbody.appendChild(row);
  });

  const sub = document.querySelector('.clr-modal.show .clr-modal-sub');
  if (sub) {
    const label = sub.textContent.replace(/•.*$/, '').trim();
    sub.textContent = `${label} • ${members.length} imported member(s)`;
  }
  return true;
}

export default function MemberImport() {
  const observerRef = useRef(null);
  const renderingRef = useRef(false);

  useEffect(() => {
    const ensureImportControl = () => {
      const modalHead = document.querySelector('.clr-modal.show .clr-modal-head');
      if (!modalHead) return;
      if (modalHead.querySelector('[data-member-import]')) return;

      const actions = document.createElement('div');
      actions.className = 'member-import-actions';

      const importButton = document.createElement('button');
      importButton.type = 'button';
      importButton.className = 'member-import-btn';
      importButton.dataset.memberImport = 'true';
      importButton.textContent = '↥ Import';
      importButton.title = 'Import members from CSV or JSON';

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.csv,.json,text/csv,application/json';
      input.hidden = true;

      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        try {
          const text = await file.text();
          const members = parseImportedFile(file.name, text);
          if (!members.length) throw new Error('No valid members were found in the file.');
          const clanName = getCurrentClanName();
          if (!clanName) throw new Error('Open a clan members window before importing.');
          const store = readStore();
          store[clanName] = members;
          writeStore(store);
          renderImportedMembers(members);
        } catch (error) {
          window.alert(error instanceof Error ? error.message : 'Unable to import members.');
        }
      });

      importButton.addEventListener('click', () => input.click());
      actions.append(importButton, input);

      const closeButton = modalHead.querySelector('.clr-modal-x');
      if (closeButton) modalHead.insertBefore(actions, closeButton);
      else modalHead.appendChild(actions);
    };

    const applyStoredMembers = () => {
      const clanName = getCurrentClanName();
      if (!clanName || renderingRef.current) return;
      const members = readStore()[clanName];
      if (!Array.isArray(members) || !members.length) return;
      const body = document.querySelector('.clr-modal.show .clr-modal-body');
      if (!body?.querySelector('.clr-mtable tbody')) return;
      renderingRef.current = true;
      renderImportedMembers(members);
      renderingRef.current = false;
    };

    const sync = () => {
      ensureImportControl();
      applyStoredMembers();
    };

    observerRef.current = new MutationObserver(sync);
    observerRef.current.observe(document.body, { childList: true, subtree: true });
    sync();

    return () => observerRef.current?.disconnect();
  }, []);

  return null;
}

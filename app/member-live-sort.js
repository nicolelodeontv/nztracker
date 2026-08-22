'use client';

import { useEffect } from 'react';

const STATE_KEY = 'nztracker-live-member-sort';

function readState() {
  try { return JSON.parse(sessionStorage.getItem(STATE_KEY) || '{"key":"reputation","dir":"desc"}'); }
  catch { return { key: 'reputation', dir: 'desc' }; }
}

function writeState(state) {
  try { sessionStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch {}
}

function parseCell(row, index) {
  const cells = [...row.querySelectorAll('span, strong')];
  const text = (cells[index]?.textContent || '').trim();
  if (index === 0 || index === 2) return Number(text.replace(/[^0-9.-]/g, '')) || 0;
  if (index === 3 || index === 4) return Number(text.replace(/[^0-9.-]/g, '')) || 0;
  return text.toLocaleLowerCase();
}

function sortMembers(table, key, dir) {
  const bodyRows = [...table.querySelectorAll('.memberRow')];
  const index = key === 'rank' ? 0 : key === 'name' ? 1 : key === 'level' ? 2 : key === 'reputation' ? 3 : 4;
  bodyRows.sort((a, b) => {
    const av = parseCell(a, index), bv = parseCell(b, index);
    if (typeof av === 'string') return av.localeCompare(bv, undefined, { sensitivity: 'base' }) * dir;
    return (av - bv) * dir;
  });
  const parent = table.querySelector('.memberRow')?.parentElement;
  if (!parent) return;
  bodyRows.forEach(row => parent.appendChild(row));
  bodyRows.forEach((row, i) => {
    const rank = row.querySelector('.memberRank');
    if (rank) rank.textContent = String(i + 1);
  });
}

function mount() {
  const modal = document.querySelector('.memberModal');
  const table = modal?.querySelector('.memberTable');
  const header = table?.querySelector('.memberHead');
  if (!modal || !table || !header) return;

  const labels = [
    ['rank', '#'],
    ['name', 'MEMBER'],
    ['level', 'LEVEL'],
    ['reputation', 'REPUTATION'],
    ['delta', 'Δ REP']
  ];
  let state = readState();
  const existing = header.querySelector('[data-live-sort-mounted]');
  if (existing) return;

  [...header.children].forEach((child, index) => {
    const [key, label] = labels[index];
    if (!key) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'memberSortHeadButton';
    button.dataset.sortKey = key;
    button.textContent = label;
    const arrow = document.createElement('span');
    arrow.className = 'memberSortArrow';
    arrow.textContent = state.key === key ? (state.dir === 'asc' ? ' ↑' : ' ↓') : ' ↕';
    button.appendChild(arrow);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (state.key === key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
      else { state.key = key; state.dir = key === 'name' ? 'asc' : 'desc'; }
      writeState(state);
      sortMembers(table, state.key, state.dir === 'asc' ? 1 : -1);
      header.querySelectorAll('.memberSortHeadButton').forEach(btn => {
        const k = btn.dataset.sortKey;
        const a = btn.querySelector('.memberSortArrow');
        if (a) a.textContent = state.key === k ? (state.dir === 'asc' ? ' ↑' : ' ↓') : ' ↕';
      });
    });
    child.replaceChildren(button);
  });

  const marker = document.createElement('span');
  marker.hidden = true;
  marker.dataset.liveSortMounted = 'true';
  header.appendChild(marker);
  sortMembers(table, state.key, state.dir === 'asc' ? 1 : -1);
}

export default function MemberLiveSort() {
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

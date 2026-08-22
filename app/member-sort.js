'use client';

import { useEffect } from 'react';

const SORT_KEY = 'nztracker-live-member-sort';

function getCellValue(row, key) {
  const name = row.querySelector('strong')?.textContent?.trim().toLowerCase() || '';
  const level = Number((row.children[2]?.textContent || '').replace(/[^0-9]/g, '')) || 0;
  const reputation = Number((row.children[3]?.textContent || '').replace(/[^0-9.-]/g, '')) || 0;
  const delta = Number((row.children[4]?.textContent || '').replace(/[^0-9.-]/g, '')) || 0;
  if (key === 'name') return name;
  if (key === 'level') return level;
  if (key === 'reputation') return reputation;
  if (key === 'delta') return delta;
  return Number((row.children[0]?.textContent || '').replace(/[^0-9]/g, '')) || 0;
}

function sortRows(table, key, direction) {
  const rows = [...table.querySelectorAll('.memberRow')];
  rows.sort((a, b) => {
    const aValue = getCellValue(a, key);
    const bValue = getCellValue(b, key);
    let result;
    if (typeof aValue === 'string') result = aValue.localeCompare(bValue);
    else result = aValue - bValue;
    if (result === 0) result = getCellValue(a, 'name').localeCompare(getCellValue(b, 'name'));
    return direction === 'asc' ? result : -result;
  });

  const fragment = document.createDocumentFragment();
  rows.forEach((row, index) => {
    row.children[0].textContent = String(index + 1);
    fragment.appendChild(row);
  });
  table.appendChild(fragment);
}

function readSavedSort() {
  try {
    const saved = sessionStorage.getItem(SORT_KEY);
    return saved ? JSON.parse(saved) : { key: 'reputation', direction: 'desc' };
  } catch {
    return { key: 'reputation', direction: 'desc' };
  }
}

function saveSort(sort) {
  try { sessionStorage.setItem(SORT_KEY, JSON.stringify(sort)); } catch {}
}

function updateHeaders(head, activeKey, direction) {
  const headers = [
    ['rank', '#'],
    ['name', 'MEMBER'],
    ['level', 'LEVEL'],
    ['reputation', 'REPUTATION'],
    ['delta', 'Δ REP']
  ];

  head.innerHTML = headers.map(([key, label]) => {
    const active = key === activeKey;
    const arrow = active ? (direction === 'asc' ? '↑' : '↓') : '↕';
    return `<button type="button" class="historySortBtn memberHeaderSort ${active ? 'active' : ''}" data-member-sort-key="${key}" aria-label="Sort by ${label}"><span>${label}</span><span>${arrow}</span></button>`;
  }).join('');
}

function mountHeaderSort() {
  const modal = document.querySelector('.memberModal');
  const table = modal?.querySelector('.memberTable');
  const head = table?.querySelector('.memberHead');
  if (!modal || !table || !head) return;

  // Remove the old standalone dropdown if an older bundle created it.
  modal.querySelector('[data-member-sort]')?.remove();

  let sort = readSavedSort();
  updateHeaders(head, sort.key, sort.direction);
  sortRows(table, sort.key, sort.direction);

  if (!head.dataset.memberHeaderBound) {
    head.dataset.memberHeaderBound = 'true';
    head.addEventListener('click', event => {
      const button = event.target.closest('[data-member-sort-key]');
      if (!button) return;

      const key = button.dataset.memberSortKey;
      sort = key === sort.key
        ? { key, direction: sort.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'name' ? 'asc' : 'desc' };

      saveSort(sort);
      updateHeaders(head, sort.key, sort.direction);
      sortRows(table, sort.key, sort.direction);
    });
  }
}

export default function MemberSort() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(mountHeaderSort);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = setInterval(schedule, 1000);
    schedule();
    return () => {
      observer.disconnect();
      clearInterval(timer);
      cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}

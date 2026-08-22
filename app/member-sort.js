'use client';

import { useEffect } from 'react';

function sortMembers(container, mode) {
  const table = container.querySelector('.memberTable');
  if (!table) return;
  const head = table.querySelector('.memberHead');
  if (!head) return;
  const rows = [...table.querySelectorAll('.memberRow')];
  if (!rows.length) return;

  rows.sort((a, b) => {
    const nameA = a.querySelector('strong')?.textContent?.trim().toLowerCase() || '';
    const nameB = b.querySelector('strong')?.textContent?.trim().toLowerCase() || '';
    const levelA = Number((a.children[2]?.textContent || '').replace(/[^0-9]/g, '')) || 0;
    const levelB = Number((b.children[2]?.textContent || '').replace(/[^0-9]/g, '')) || 0;
    const repA = Number((a.children[3]?.textContent || '').replace(/[^0-9.-]/g, '')) || 0;
    const repB = Number((b.children[3]?.textContent || '').replace(/[^0-9.-]/g, '')) || 0;

    if (mode === 'name-asc') return nameA.localeCompare(nameB);
    if (mode === 'name-desc') return nameB.localeCompare(nameA);
    if (mode === 'level-desc') return levelB - levelA || nameA.localeCompare(nameB);
    if (mode === 'level-asc') return levelA - levelB || nameA.localeCompare(nameB);
    if (mode === 'rep-asc') return repA - repB || nameA.localeCompare(nameB);
    return repB - repA || nameA.localeCompare(nameB);
  });

  rows.forEach((row, index) => {
    row.children[0].textContent = String(index + 1);
    table.appendChild(row);
  });
}

function mountSort() {
  const modal = document.querySelector('.memberModal');
  const body = modal?.querySelector('.memberModalBody');
  const table = body?.querySelector('.memberTable');
  if (!modal || !body || !table) return;

  let bar = body.querySelector('[data-member-sort]');
  if (!bar) {
    bar = document.createElement('div');
    bar.dataset.memberSort = 'true';
    bar.className = 'memberSortBar';
    bar.innerHTML = `
      <span class="memberSortLabel">SORT</span>
      <select class="memberSortSelect" aria-label="Sort live members">
        <option value="rep-desc">Reputation ↓</option>
        <option value="rep-asc">Reputation ↑</option>
        <option value="level-desc">Level ↓</option>
        <option value="level-asc">Level ↑</option>
        <option value="name-asc">Name A–Z</option>
        <option value="name-desc">Name Z–A</option>
      </select>
    `;
    body.insertBefore(bar, table);

    const select = bar.querySelector('select');
    const saved = sessionStorage.getItem('nztracker-member-sort') || 'rep-desc';
    select.value = saved;
    select.addEventListener('change', () => {
      sessionStorage.setItem('nztracker-member-sort', select.value);
      sortMembers(body, select.value);
    });
    sortMembers(body, select.value);
  } else {
    const select = bar.querySelector('select');
    if (select) sortMembers(body, select.value);
  }
}

export default function MemberSort() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(mountSort);
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

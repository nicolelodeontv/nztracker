'use client';

import { useEffect } from 'react';

function safeName(value) {
  return String(value || 'clan').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'clan';
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function exportCurrentMembers(modal, clan) {
  const rows = [...modal.querySelectorAll('.member-table .member-row')];
  if (!rows.length) return;

  const data = rows.map((row) => {
    const cells = [...row.children].map((cell) => cell.textContent.trim());
    return [cells[1], cells[2], cells[3], cells[4], cells[5]];
  });

  const csv = [
    ['MEMBER', 'LEVEL', 'REPUTATION', 'GAIN', 'TOTAL GAIN'],
    ...data,
  ].map((row) => row.map(csvCell).join(',')).join('\r\n');

  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ninja-zenshin-${safeName(clan)}-members.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function mount() {
  const modal = document.querySelector('.modal');
  if (!modal) return;

  const title = modal.querySelector('.modal-head h2')?.textContent?.trim();
  const body = modal.querySelector('.modal-body');
  const stats = modal.querySelector('.member-stats');
  if (!title || !body || !stats || modal.querySelector('[data-member-export]')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'minor-button member-export-button';
  button.dataset.memberExport = 'true';
  button.textContent = '⇩ Export CSV';
  button.addEventListener('click', () => exportCurrentMembers(modal, title));
  stats.insertAdjacentElement('afterend', button);
}

export default function MemberExport() {
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
    return () => {
      observer.disconnect();
      clearInterval(timer);
      cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}

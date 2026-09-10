'use client';

import { useEffect } from 'react';

const EXPORT_CLASS = 'clr-modal-export';

function csvEscape(value) {
  const text = String(value ?? '').trim();
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv() {
  const modal = document.querySelector('.clr-modal.show');
  const table = modal?.querySelector('.clr-mtable');
  if (!table) return false;

  const headers = ['#', 'Member', 'Lv', 'Rep', 'Before', 'Gain', 'Measured', 'Status', 'Total'];
  const rows = [...table.querySelectorAll('tbody tr')].map((row) =>
    [...row.querySelectorAll('td')].map((cell) => cell.textContent?.replace(/\s+/g, ' ').trim() ?? '')
  );

  if (!rows.length) return false;

  const normalized = rows
    .map((row) => headers.map((_, index) => row[index] ?? ''))
    .sort((a, b) => {
      const gainA = Number(String(a[5]).replace(/[^0-9.-]/g, '')) || 0;
      const gainB = Number(String(b[5]).replace(/[^0-9.-]/g, '')) || 0;
      if (gainB !== gainA) return gainB - gainA;
      const repA = Number(String(a[3]).replace(/[^0-9.-]/g, '')) || 0;
      const repB = Number(String(b[3]).replace(/[^0-9.-]/g, '')) || 0;
      return repB - repA;
    })
    .map((row, index) => [String(index + 1), ...row.slice(1)]);

  const clan = (modal.querySelector('.live-head-main b')?.textContent || 'clan-members')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-|-$/g, '') || 'clan-members';
  const period = modal.querySelector('.period-control .active')?.textContent?.trim().toLowerCase() || 'window';
  const csv = [headers, ...normalized].map((row) => row.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${clan}-rep-history-${period}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

export default function CsvExportFix() {
  useEffect(() => {
    const onClick = (event) => {
      const button = event.target instanceof Element ? event.target.closest(`button.${EXPORT_CLASS}`) : null;
      if (!button) return;
      const label = button.textContent?.trim().toLowerCase() || '';
      if (!label.includes('csv')) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      downloadCsv();
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  return null;
}

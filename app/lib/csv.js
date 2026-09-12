function escapeCsv(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function rowsToCsv(rows = []) {
  const header = ['Member', 'Current REP', 'Before', 'Gain', 'Gain/Hour', 'Status'];
  const body = (Array.isArray(rows) ? rows : []).map((row) => [
    row?.name,
    row?.current,
    row?.before,
    row?.gain,
    Math.round(Number(row?.gainPerHour || 0)),
    row?.status,
  ].map(escapeCsv).join(','));

  return [header.join(','), ...body].join('\r\n') + '\r\n';
}

export function downloadCsv(filename, rows = []) {
  const csv = rowsToCsv(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

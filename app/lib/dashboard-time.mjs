export function startOfTodayInZone(now = new Date(), timeZone = 'Asia/Singapore') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])
  );
  return new Date(`${values.year}-${values.month}-${values.day}T00:00:00+08:00`);
}

export function startOfTodaySingapore(now = new Date()) {
  return startOfTodayInZone(now, 'Asia/Singapore');
}

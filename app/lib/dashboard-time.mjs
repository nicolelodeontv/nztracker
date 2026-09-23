export function startOfTodayManila(now=new Date()){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);const values=Object.fromEntries(parts.filter((part)=>part.type!=='literal').map((part)=>[part.type,part.value]));return new Date(`${values.year}-${values.month}-${values.day}T00:00:00+08:00`);}


export function formatAge(value, now = Date.now()) {
  if (value == null || value === '') return '—';

  let seconds = null;
  if (typeof value === 'number') {
    seconds = value;
  } else if (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value.trim())) {
    seconds = Number(value);
  } else {
    const timestamp = Date.parse(String(value));
    if (Number.isFinite(timestamp) && Number.isFinite(Number(now))) {
      seconds = Math.max(0, Number(now) - timestamp) / 1000;
    }
  }

  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const wholeSeconds = Math.floor(seconds);
  if (wholeSeconds < 60) return wholeSeconds + 's ago';
  if (wholeSeconds < 3600) return Math.floor(wholeSeconds / 60) + 'm ago';
  return Math.floor(wholeSeconds / 3600) + 'h ago';
}

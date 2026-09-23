const isObjectLike = (value) => value !== null && typeof value === 'object';
const OBJECT_STRING = '[object Object]';

export function formatError(value, fallback = 'Unknown error') {
  if (value instanceof Error) {
    return formatError(value.message, fallback);
  }

  if (value == null) return fallback;

  if (typeof value === 'string') {
    const text = value.trim();
    if (!text || text === OBJECT_STRING) return fallback;
    return text;
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }

  if (isObjectLike(value)) {
    const candidates = [
      value.message,
      value.reason,
      value.error,
      value.details,
      value.detail,
      value.description,
      value.statusText,
      value.status_message,
      value.errorMsg
    ];

    for (const candidate of candidates) {
      const text = formatError(candidate, '');
      if (text) return text;
    }

    try {
      const serialized = JSON.stringify(value);
      if (serialized && serialized !== '{}') return serialized;
    } catch {}

    return fallback;
  }

  try {
    const text = String(value).trim();
    return text === OBJECT_STRING ? fallback : (text || fallback);
  } catch {
    return fallback;
  }
}

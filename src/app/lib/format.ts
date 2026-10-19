/** `<n>ms` under a second, otherwise `<n.nn>s` (RUN-08). */
export function formatDuration(ms: string | number | undefined | null): string {
  if (ms === undefined || ms === null || ms === '') {
    return '-';
  }
  const value = typeof ms === 'string' ? Number(ms) : ms;
  if (!Number.isFinite(value)) {
    return '-';
  }
  return value < 1000 ? `${Math.round(value)}ms` : `${(value / 1000).toFixed(2)}s`;
}

/** Short relative time, e.g. "just now", "2m ago", "3h ago", "5d ago". */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 10) {
    return 'just now';
  }
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${Math.floor(hours / 24)}d ago`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'workflow'
  );
}

export function camelCase(value: string): string {
  const words = value
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) {
    return 'untitled';
  }
  const result = words.map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1))).join('');
  return /^[0-9]/.test(result) ? `_${result}` : result;
}

/** Pretty JSON that never throws. */
export function toJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? 'undefined';
  } catch {
    return String(value);
  }
}

export function formatDateTime(value, { includeTime = true } = {}) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const options = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  };
  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }
  return date.toLocaleString(undefined, options);
}

export function formatTimeAgo(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const now = Date.now();
  const diffMs = now - date.getTime();
  const minutes = Math.round(diffMs / (1000 * 60));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 4) return `${weeks} wk${weeks === 1 ? '' : 's'} ago`;
  const months = Math.round(days / 30);
  return `${months} mo${months === 1 ? '' : 's'} ago`;
}

export function formatDuration(seconds) {
  if (seconds == null || Number.isNaN(Number(seconds))) return '—';
  const total = Math.max(0, Number(seconds));
  const mins = Math.floor(total / 60);
  const secs = Math.floor(total % 60);
  const hours = Math.floor(mins / 60);
  const remainderMins = mins % 60;
  if (hours > 0) {
    return `${hours}h ${remainderMins}m`;
  }
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

export function formatScore(value, { suffix = '%' } = {}) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const num = Number(value);
  return `${Math.round(num * 10) / 10}${suffix}`;
}

const timings = new Map();
let counter = 0;

function now() {
  if (typeof performance !== 'undefined' && performance.now) {
    return performance.now();
  }
  return Date.now();
}

export function startTiming(label, context = {}) {
  const id = `t_${++counter}`;
  timings.set(id, { label, context, startedAt: now() });
  return id;
}

export function endTiming(id, status = 'success', extra = {}) {
  const entry = timings.get(id);
  if (!entry) {
    return;
  }
  timings.delete(id);
  const duration = now() - entry.startedAt;
  const payload = {
    label: entry.label,
    status,
    durationMs: Math.round(duration),
    context: entry.context,
    ...extra,
  };
  if (status === 'success') {
    console.info('[Instrumentation]', payload);
  } else {
    console.warn('[Instrumentation]', payload);
  }
}

export function recordError(label, error, context = {}) {
  console.error('[Instrumentation]', {
    label,
    status: 'error',
    message: error?.message || 'Unknown error',
    context,
  });
}

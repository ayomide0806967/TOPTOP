const HEALTH_LABELS = {
  healthy: 'Healthy',
  warning: 'Needs attention',
  critical: 'At risk',
  unknown: 'Unknown',
};

function countIsPositive(value) {
  return Number.isFinite(value) && value > 0;
}

export function getHealthSeverity(entry) {
  if (!entry) {
    return 'unknown';
  }
  const {
    last_run_status: lastRunStatus,
    missing_questions: missingQuestions,
    unscheduled_days: unscheduledDays,
    empty_days: emptyDays,
    underfilled_days: underfilledDays,
    alerts,
  } = entry;

  if (!lastRunStatus) {
    return 'warning';
  }
  if (lastRunStatus === 'failed') {
    return 'critical';
  }

  if (countIsPositive(missingQuestions) || countIsPositive(unscheduledDays)) {
    return 'critical';
  }

  if (countIsPositive(emptyDays) || countIsPositive(underfilledDays)) {
    return 'warning';
  }

  const alertSet = new Set(Array.isArray(alerts) ? alerts : []);
  if (
    alertSet.has('missing_questions') ||
    alertSet.has('unscheduled_days') ||
    alertSet.has('last_run_failed')
  ) {
    return 'critical';
  }
  if (
    alertSet.has('bucket_underfilled') ||
    alertSet.has('bucket_planned') ||
    alertSet.has('underfilled_days') ||
    alertSet.has('empty_days')
  ) {
    return 'warning';
  }

  if (lastRunStatus === 'warning') {
    return 'warning';
  }

  return 'healthy';
}

export function describeHealthAlerts(entry) {
  if (!entry) {
    return ['No scheduling data available'];
  }

  const messages = [];
  const {
    alerts,
    total_days: totalDays,
    ready_days: readyDays,
    underfilled_days: underfilledDays,
    empty_days: emptyDays,
    unscheduled_days: unscheduledDays,
    missing_questions: missingQuestions,
    bucket_underfilled: bucketUnderfilled,
    bucket_planned: bucketPlanned,
    last_run_status: lastRunStatus,
  } = entry;

  const alertSet = new Set(Array.isArray(alerts) ? alerts : []);

  if (!totalDays) {
    messages.push('Daily schedule has not been generated yet');
  }

  if (lastRunStatus === 'failed') {
    messages.push('Last scheduling run failed');
  }

  if (countIsPositive(unscheduledDays) || alertSet.has('unscheduled_days')) {
    messages.push(
      `${unscheduledDays || 0} unscheduled day${unscheduledDays === 1 ? '' : 's'}`
    );
  }

  if (countIsPositive(emptyDays) || alertSet.has('empty_days')) {
    messages.push(`${emptyDays || 0} empty day${emptyDays === 1 ? '' : 's'}`);
  }

  if (countIsPositive(underfilledDays) || alertSet.has('underfilled_days')) {
    messages.push(
      `${underfilledDays || 0} underfilled day${underfilledDays === 1 ? '' : 's'}`
    );
  }

  if (countIsPositive(missingQuestions) || alertSet.has('missing_questions')) {
    messages.push(
      `${missingQuestions || 0} question${missingQuestions === 1 ? '' : 's'} missing across buckets`
    );
  }

  if (
    countIsPositive(bucketUnderfilled) ||
    alertSet.has('bucket_underfilled')
  ) {
    messages.push('Some published buckets are underfilled');
  }

  if (countIsPositive(bucketPlanned) || alertSet.has('bucket_planned')) {
    messages.push('Upcoming days still in planned status');
  }

  if (!messages.length) {
    messages.push(
      `All ${readyDays || 0}/${totalDays || 0} daily pools are ready`
    );
  }

  return messages;
}

export function getHealthLabel(severity) {
  return HEALTH_LABELS[severity] || HEALTH_LABELS.unknown;
}

export function classifyHealth(entry) {
  const severity = getHealthSeverity(entry);
  return {
    severity,
    label: getHealthLabel(severity),
    messages: describeHealthAlerts(entry),
  };
}

export function formatTimestamp(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

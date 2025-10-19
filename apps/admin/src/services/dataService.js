import {
  getSupabaseClient,
  SupabaseConfigurationError,
} from '../../../shared/supabaseClient.js';
import {
  startTiming,
  endTiming,
  recordError,
} from '../../../shared/instrumentation.js';

const SLOT_DURATION_DAYS = 30;
const SUBSLOT_COUNT = 4;
const SUBSLOT_DAY_SPAN = 7;
const DAILY_QUESTION_TARGET = 250;
const SUBSLOT_QUESTION_CAP = SUBSLOT_DAY_SPAN * DAILY_QUESTION_TARGET; // 1750
const SLOT_QUESTION_CAP = SUBSLOT_COUNT * SUBSLOT_QUESTION_CAP; // 7000

const FREE_QUIZ_IMAGE_BUCKET = 'question-images';

export class DataServiceError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'DataServiceError';
    if (options.cause) {
      this.cause = options.cause;
    }
    if (options.context) {
      this.context = options.context;
    }
  }
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function parseISODateString(value) {
  if (!value) return null;
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value.trim());
  if (!match) return null;
  const [, yearStr, monthStr, dayStr] = match;
  const date = new Date(
    Date.UTC(Number(yearStr), Number(monthStr) - 1, Number(dayStr))
  );
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatISODateUTC(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDaysUTC(baseDate, days) {
  if (!(baseDate instanceof Date) || Number.isNaN(baseDate.getTime())) {
    return null;
  }
  const result = new Date(baseDate);
  result.setUTCDate(result.getUTCDate() + Number(days || 0));
  return result;
}

function getSubslotStartDate(cycle, subslot, index) {
  const explicitStart = parseISODateString(subslot.start_date);
  if (explicitStart) {
    return explicitStart;
  }

  const cycleStart = parseISODateString(cycle.start_date);
  if (!cycleStart) {
    return null;
  }

  const normalizedIndex =
    (subslot.index ?? subslot.week_index ?? index + 1) - 1;
  return addDaysUTC(cycleStart, normalizedIndex * SUBSLOT_DAY_SPAN);
}

function buildCycleTimeline(cycle) {
  const subslots = Array.isArray(cycle.subslots) ? cycle.subslots.slice() : [];
  subslots.sort((a, b) => {
    const aIndex = a.index ?? a.week_index ?? 0;
    const bIndex = b.index ?? b.week_index ?? 0;
    return aIndex - bIndex;
  });

  const days = [];
  let lastDate = null;
  let unscheduledDays = 0;
  let missingQuestions = 0;

  subslots.forEach((subslot, subslotPosition) => {
    const daySpan = Number(subslot.day_span ?? SUBSLOT_DAY_SPAN) || 0;
    if (daySpan <= 0) {
      return;
    }

    const startDate = getSubslotStartDate(cycle, subslot, subslotPosition);
    const distribution = new Map();
    (Array.isArray(subslot.distribution) ? subslot.distribution : []).forEach(
      (entry) => {
        const offset = Number(entry?.day_offset ?? 0);
        const count = Number(entry?.count ?? 0);
        distribution.set(offset, count);
      }
    );

    for (let offset = 0; offset < daySpan; offset += 1) {
      const date = startDate ? addDaysUTC(startDate, offset) : null;
      const count = distribution.get(offset) ?? 0;
      const isFilled = count >= DAILY_QUESTION_TARGET;
      const isEmpty = count === 0;
      const isUnderfilled = count > 0 && count < DAILY_QUESTION_TARGET;
      const missing = Math.max(DAILY_QUESTION_TARGET - count, 0);

      if (!date) {
        unscheduledDays += 1;
      }
      missingQuestions += missing;

      days.push({
        cycle_id: cycle.id,
        cycle_title: cycle.title,
        cycle_status: cycle.status,
        subslot_id: subslot.id,
        subslot_index:
          subslot.index ?? subslot.week_index ?? subslotPosition + 1,
        date: formatISODateUTC(date),
        day_index: offset + 1,
        day_offset: offset,
        status: subslot.status || 'draft',
        question_target: DAILY_QUESTION_TARGET,
        question_count: count,
        is_filled: isFilled,
        is_underfilled: isUnderfilled,
        is_empty: isEmpty,
        missing_questions: missing,
      });

      if (date) {
        lastDate = date;
      }
    }
  });

  const filledDays = days.filter((day) => day.is_filled).length;
  const underfilledDays = days.filter((day) => day.is_underfilled).length;
  const emptyDays = days.filter((day) => day.is_empty).length;

  return {
    cycle_id: cycle.id,
    cycle_title: cycle.title,
    cycle_status: cycle.status,
    start_date: cycle.start_date || null,
    end_date: lastDate ? formatISODateUTC(lastDate) : null,
    total_days: days.length,
    filled_days: filledDays,
    underfilled_days: underfilledDays,
    empty_days: emptyDays,
    unscheduled_days: unscheduledDays,
    missing_questions: missingQuestions,
    days,
  };
}

async function refreshDailySchedule(client, cycleId) {
  if (!cycleId) return null;
  const timingId = startTiming('refresh_cycle_daily_schedule_rpc', {
    cycleId,
    mode: 'silent',
  });
  try {
    const { data, error } = await client.rpc('refresh_cycle_daily_schedule', {
      p_cycle_id: cycleId,
    });
    if (error) throw error;
    endTiming(timingId, 'success', { source: 'auto' });
    return data?.summary ?? null;
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    if (
      message.includes('refresh_cycle_daily_schedule') ||
      message.includes('study_cycle_schedule_runs') ||
      message.includes('study_cycle_daily_buckets')
    ) {
      console.warn(
        '[DataService] Scheduling engine RPC missing. Run latest Supabase migrations.'
      );
      endTiming(timingId, 'error', { reason: 'missing_rpc' });
      return null;
    }
    console.warn('[DataService] Failed to refresh daily schedule', error);
    endTiming(timingId, 'error', { reason: 'rpc_failure' });
    return null;
  }
}

function buildSubslotWindows(startDate, spans) {
  if (!Array.isArray(spans) || !spans.length) {
    return [];
  }
  const baseDate = parseISODateString(startDate);
  if (!baseDate) {
    return spans.map(() => ({ start: null, end: null }));
  }
  const cursor = new Date(baseDate);
  return spans.map((spanValue) => {
    const span = Number(spanValue) || 0;
    const start = new Date(cursor);
    const end = new Date(cursor);
    if (span > 0) {
      end.setUTCDate(end.getUTCDate() + span - 1);
      cursor.setUTCDate(cursor.getUTCDate() + span);
    }
    return {
      start: formatISODateUTC(start),
      end: span > 0 ? formatISODateUTC(end) : formatISODateUTC(start),
    };
  });
}

function buildDepartment(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    color: row.color_theme || row.color || 'nursing',
  };
}

function buildCourse(row) {
  if (!row) return null;
  return {
    id: row.id,
    department_id: row.department_id,
    name: row.name,
    description: row.description || '',
  };
}

function buildTopic(row) {
  if (!row) return null;
  return {
    id: row.id,
    course_id: row.course_id,
    name: row.name,
    question_count: row.question_count ?? row.question_total ?? 0,
  };
}

function buildSubslotTopic(row) {
  if (!row) return null;
  return {
    id: row.id,
    topic_id: row.topic_id,
    topic_name: row.topic?.name || null,
    course_id: row.topic?.course_id || row.topic?.course?.id || null,
    course_name: row.topic?.course?.name || null,
    selection_mode: row.selection_mode || 'random',
    question_count: row.question_count ?? 0,
  };
}

function buildSubslot(row) {
  if (!row) return null;
  const topics = Array.isArray(row.subslot_topics)
    ? row.subslot_topics.map(buildSubslotTopic)
    : [];
  const target = Math.min(
    row.question_target ?? SUBSLOT_QUESTION_CAP,
    SUBSLOT_QUESTION_CAP
  );
  const questionCount = Math.min(row.question_count ?? 0, SUBSLOT_QUESTION_CAP);
  const remaining = Math.max(target - questionCount, 0);
  return {
    id: row.id,
    index: row.week_index,
    day_span: row.day_span ?? SUBSLOT_DAY_SPAN,
    start_date: row.start_date || null,
    end_date: row.end_date || null,
    question_target: target,
    question_count: questionCount,
    question_capacity: SUBSLOT_QUESTION_CAP,
    question_remaining: remaining,
    is_full: questionCount >= SUBSLOT_QUESTION_CAP,
    status: row.status || 'draft',
    activated_at: row.activated_at || null,
    source_subslot_id: row.source_subslot_id || null,
    topics,
    distribution: Array.isArray(row.distribution) ? row.distribution : [],
  };
}

function buildStudyCycle(row) {
  if (!row) return null;
  const subslots = Array.isArray(row.study_cycle_weeks)
    ? row.study_cycle_weeks.map((subslot) => buildSubslot(subslot))
    : [];
  return {
    id: row.id,
    department_id: row.department_id,
    title: row.title || row.name || 'Question Slot',
    code: row.code || null,
    source_cycle_id: row.source_cycle_id || null,
    status: row.status || 'draft',
    start_date: row.start_date || null,
    duration_days: row.duration_days ?? SLOT_DURATION_DAYS,
    questions_per_day: row.questions_per_day || DAILY_QUESTION_TARGET,
    question_cap: Math.min(
      row.question_cap ?? SLOT_QUESTION_CAP,
      SLOT_QUESTION_CAP
    ),
    question_capacity: SLOT_QUESTION_CAP,
    subslots,
  };
}

async function attachSubslotDistribution(client, cycles) {
  const subslotIds = new Set();
  cycles.forEach((cycle) => {
    (cycle.subslots || []).forEach((subslot) => {
      if (subslot?.id) {
        subslotIds.add(subslot.id);
      }
    });
  });
  if (!subslotIds.size) {
    return cycles;
  }

  const subslotIdList = Array.from(subslotIds);
  let query = client
    .from('study_cycle_subslot_questions')
    .select('subslot_id, day_offset');
  if (subslotIdList.length) {
    query = query.in('subslot_id', subslotIdList);
  }
  const { data, error } = await query;
  if (error) throw error;

  const distributionMap = new Map();
  (data || []).forEach((row) => {
    const dayOffset = Number(row.day_offset ?? 0);
    const list = distributionMap.get(row.subslot_id) || [];
    const entry = list.find((item) => item.day_offset === dayOffset);
    if (entry) {
      entry.count += 1;
    } else {
      list.push({ day_offset: dayOffset, count: 1 });
    }
    distributionMap.set(row.subslot_id, list);
  });

  cycles.forEach((cycle) => {
    cycle.subslots = (cycle.subslots || []).map((subslot) => ({
      ...subslot,
      distribution: (distributionMap.get(subslot.id) || [])
        .slice()
        .sort((a, b) => a.day_offset - b.day_offset),
    }));
  });

  return cycles;
}

function mapSupabaseSubscriptions(rows) {
  const grouped = rows.reduce((acc, row) => {
    const key = row.product_code || row.product_id || 'unclassified';
    if (!acc[key]) {
      acc[key] = {
        code: key,
        name: row.product_name || row.product_code || 'Product',
        type: row.product_type || key,
        department_id: row.department_id || null,
        department_name: row.department_name || null,
        department_slug: row.department_slug || null,
        color_theme: row.color_theme || null,
        plans: [],
      };
    }
    acc[key].plans.push({
      code: row.plan_code || row.plan_id,
      name: row.plan_name || row.plan_code,
      price: row.price ?? 0,
      currency: row.currency || 'NGN',
      questions: row.questions ?? null,
      quizzes: row.quizzes ?? null,
      participants: row.participants ?? null,
      metadata: row.metadata || null,
      is_active: row.is_active ?? true,
      daily_question_limit: row.daily_question_limit ?? null,
      duration_days: row.duration_days ?? null,
      plan_tier: row.plan_tier || null,
    });
    return acc;
  }, {});

  return Object.values(grouped).reduce((acc, product) => {
    acc[product.code] = product;
    return acc;
  }, {});
}

const OPTION_PATTERN = /^([A-Z])(?:\s*[.):-])\s*(.+)$/i;
const ANSWER_DIRECTIVE_PATTERN =
  /^(?:ANS(?:WER)?|CORRECT\s+ANSWER|ANSWER\s+KEY)\s*[:=]\s*(.+)$/i;
const QUESTION_NUMBER_PREFIX_PATTERN = /^\d+\s*[).:-]\s+/;

function normalizeStemText(value) {
  if (!value) return '';
  return value.toString().trim().replace(/\s+/g, ' ').toLowerCase();
}

function buildQuestion(row) {
  if (!row) return null;
  const options = Array.isArray(row.question_options)
    ? row.question_options
        .slice()
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
        .map((option) => ({
          id: option.id,
          label: option.label,
          content: option.content,
          isCorrect: option.is_correct,
          order: option.order_index ?? 0,
        }))
    : [];
  return {
    id: row.id,
    topic_id: row.topic_id,
    question_type: row.question_type,
    stem: row.stem,
    explanation: row.explanation,
    image_url: row.image_url,
    options,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function buildSubscriptionPlan(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    price: row.price,
    currency: row.currency,
    questions: row.questions,
    quizzes: row.quizzes,
    participants: row.participants,
    metadata: row.metadata || {},
    is_active: row.is_active,
    daily_question_limit: row.daily_question_limit ?? null,
    duration_days: row.duration_days ?? null,
    plan_tier: row.plan_tier || null,
    quiz_duration_minutes: row.quiz_duration_minutes ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function buildSubscriptionProductDetailed(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    product_type: row.product_type,
    description: row.description,
    is_active: row.is_active,
    metadata: row.metadata || {},
    department_id: row.department_id || null,
    department_name: row.department?.name || null,
    department_color: row.department?.color_theme || null,
    plans: Array.isArray(row.subscription_plans)
      ? row.subscription_plans.map(buildSubscriptionPlan)
      : [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const SUBSCRIPTION_SORT_WEIGHT = {
  active: 0,
  trialing: 0,
  past_due: 1,
  pending_payment: 2,
  expired: 3,
  canceled: 4,
  cancelled: 4,
  inactive: 5,
  none: 6,
};

function getUserSubscriptionStatus(entry) {
  if (!entry) return 'none';
  const normalized = (entry.status || '').toLowerCase();
  if (entry.expires_at) {
    const expires = new Date(entry.expires_at);
    if (!Number.isNaN(expires.getTime()) && expires.getTime() < Date.now()) {
      return 'expired';
    }
  }
  return normalized || 'inactive';
}

function normalizeUserSubscription(entry) {
  if (!entry) return null;
  const statusKey = getUserSubscriptionStatus(entry);
  const plan = entry.subscription_plans || entry.plan || {};
  const product = plan.subscription_products || plan.product || {};
  const department = product.departments || product.department || {};

  const startedAtDate = entry.started_at ? new Date(entry.started_at) : null;
  const expiresAtDate = entry.expires_at ? new Date(entry.expires_at) : null;
  const now = new Date();
  const isActiveNow =
    ['active', 'trialing', 'past_due'].includes(statusKey) &&
    (!startedAtDate || startedAtDate.getTime() <= now.getTime()) &&
    (!expiresAtDate || expiresAtDate.getTime() >= now.getTime());

  return {
    id: entry.id,
    status: entry.status,
    status_key: statusKey,
    plan_id: entry.plan_id,
    plan_name: plan.name || plan.code || null,
    plan_code: plan.code || null,
    plan_price: plan.price ?? null,
    plan_currency: plan.currency || 'NGN',
    daily_limit: plan.daily_question_limit ?? null,
    duration_days: plan.duration_days ?? null,
    plan_tier: plan.plan_tier || null,
    purchased_at: entry.purchased_at || null,
    started_at: entry.started_at || null,
    expires_at: entry.expires_at || null,
    quantity: entry.quantity ?? 1,
    renewed_from_subscription_id: entry.renewed_from_subscription_id || null,
    is_active_now: isActiveNow,
    product_name: product.name || null,
    department: {
      id: department.id || product.department_id || null,
      name: department.name || null,
      slug: department.slug || null,
      color: department.color_theme || null,
    },
  };
}

function compareNormalizedSubscriptions(a, b) {
  const weightA = SUBSCRIPTION_SORT_WEIGHT[a.status_key] ?? 10;
  const weightB = SUBSCRIPTION_SORT_WEIGHT[b.status_key] ?? 10;
  if (weightA !== weightB) {
    return weightA - weightB;
  }

  const expiresA = a.expires_at
    ? new Date(a.expires_at).getTime()
    : Number.POSITIVE_INFINITY;
  const expiresB = b.expires_at
    ? new Date(b.expires_at).getTime()
    : Number.POSITIVE_INFINITY;
  if (expiresA !== expiresB) {
    return expiresA - expiresB;
  }

  const startedA = a.started_at ? new Date(a.started_at).getTime() : 0;
  const startedB = b.started_at ? new Date(b.started_at).getTime() : 0;
  return startedB - startedA;
}

function buildProfileRow(row) {
  if (!row) return null;
  const rawSubscriptions = Array.isArray(row.user_subscriptions)
    ? row.user_subscriptions
    : [];
  const normalizedSubscriptions = rawSubscriptions
    .map(normalizeUserSubscription)
    .filter(Boolean)
    .sort(compareNormalizedSubscriptions);

  const normalizedProfileStatus = (row.subscription_status || '').toLowerCase();
  const defaultId = row.default_subscription_id || null;
  const explicitDefault = normalizedSubscriptions.find(
    (sub) => sub.id === defaultId
  );
  const activeSubscription = normalizedSubscriptions.find(
    (sub) =>
      ['active', 'trialing', 'past_due'].includes(sub.status_key) &&
      sub.is_active_now
  );
  const primarySubscription =
    explicitDefault || activeSubscription || normalizedSubscriptions[0] || null;

  const subscriptionStatuses = normalizedSubscriptions.map(
    (sub) => sub.status_key
  );
  const hasEverSubscribed = subscriptionStatuses.length > 0;
  const hasActivePlan = normalizedSubscriptions.some(
    (sub) => sub.is_active_now
  );

  let statusBucket = 'no_plan';
  if (normalizedProfileStatus === 'suspended') {
    statusBucket = 'suspended';
  } else if (
    ['pending_payment', 'awaiting_setup'].includes(normalizedProfileStatus)
  ) {
    statusBucket = 'pending_payment';
  } else if (hasActivePlan) {
    statusBucket = 'active';
  } else if (
    subscriptionStatuses.some((status) =>
      ['expired', 'canceled', 'cancelled', 'past_due'].includes(status)
    )
  ) {
    statusBucket = 'expired';
  } else if (hasEverSubscribed) {
    statusBucket = 'expired';
  }

  const displayStatus =
    primarySubscription?.status ||
    row.subscription_status ||
    (hasEverSubscribed ? 'inactive' : 'no_plan');

  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    username: row.username,
    role: row.role,
    last_seen_at: row.last_seen_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    status: displayStatus,
    subscription_status: row.subscription_status || null,
    status_bucket: statusBucket,
    plan_name: primarySubscription?.plan_name || '-',
    plan_id: primarySubscription?.plan_id || null,
    plan_started_at: primarySubscription?.started_at || null,
    plan_expires_at: primarySubscription?.expires_at || null,
    default_subscription_id: primarySubscription?.id || defaultId,
    subscriptions: normalizedSubscriptions,
    active_subscription_count: normalizedSubscriptions.filter(
      (sub) => sub.is_active_now
    ).length,
    department_id: row.department_id,
    department_name: row.departments?.name || '-',
  };
}

function buildPlanLearner(row) {
  if (!row) return null;
  const profile = row.profiles || row.profile || {};
  return {
    subscription_id: row.id,
    user_id: row.user_id,
    status: row.status,
    started_at: row.started_at,
    expires_at: row.expires_at,
    purchased_at: row.purchased_at || null,
    price: row.price,
    currency: row.currency,
    full_name: profile.full_name,
    email: profile.email,
    username: profile.username,
    last_seen_at: profile.last_seen_at,
  };
}

function buildFreeQuiz(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    intro: row.intro,
    is_active: row.is_active,
    time_limit_seconds: row.time_limit_seconds,
    question_count: row.question_count ?? 0,
    total_attempts: row.total_attempts ?? 0,
    average_score: row.average_score ?? 0,
    average_duration_seconds: row.average_duration_seconds ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function buildFreeQuizQuestion(row) {
  if (!row) return null;
  return {
    id: row.id,
    free_quiz_id: row.free_quiz_id,
    question_id: row.question_id,
    prompt: row.prompt,
    explanation: row.explanation,
    image_url: row.image_url,
    options: Array.isArray(row.options)
      ? row.options
      : row.options?.options || row.options,
    correct_option: row.correct_option,
    order_index: row.order_index ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
    question: row.questions ? buildQuestion(row.questions) : null,
  };
}

function normalizeOptionText(value) {
  return typeof value === 'string'
    ? value.toLowerCase().replace(/[^a-z0-9]/g, '')
    : '';
}

function appendLine(base, addition) {
  if (!base) return addition;
  return base.endsWith('\n') ? `${base}${addition}` : `${base}\n${addition}`;
}

function stripQuestionPrefix(line) {
  if (typeof line !== 'string') return line;
  return line.replace(QUESTION_NUMBER_PREFIX_PATTERN, '').trim();
}

const ASSIGNMENT_MODES = new Set(['full_set', 'fixed_count', 'percentage']);

const DEFAULT_ASSIGNMENT_RULES = Object.freeze({
  default: { mode: 'full_set', value: null },
  overrides: [],
});

function normalizeExtraVisibilityRules(value) {
  const base = {
    allowAllDepartments: true,
    departmentIds: [],
    allowAllPlans: true,
    planTiers: [],
    planIds: [],
  };

  if (!value || typeof value !== 'object') {
    return { ...base };
  }

  return {
    allowAllDepartments:
      value.allowAllDepartments !== undefined
        ? Boolean(value.allowAllDepartments)
        : base.allowAllDepartments,
    departmentIds: Array.isArray(value.departmentIds)
      ? value.departmentIds.map(String).filter(Boolean)
      : base.departmentIds,
    allowAllPlans:
      value.allowAllPlans !== undefined
        ? Boolean(value.allowAllPlans)
        : base.allowAllPlans,
    planTiers: Array.isArray(value.planTiers)
      ? value.planTiers.map(String).filter(Boolean)
      : base.planTiers,
    planIds: Array.isArray(value.planIds)
      ? value.planIds.map(String).filter(Boolean)
      : base.planIds,
  };
}

function normalizeAssignmentValue(mode, value) {
  if (mode === 'full_set') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  if (mode === 'fixed_count') {
    return Math.max(1, Math.round(numeric));
  }
  if (mode === 'percentage') {
    return Math.min(100, Math.max(1, Math.round(numeric)));
  }
  return null;
}

function normalizeAssignmentMode(mode) {
  const normalized = typeof mode === 'string' ? mode.toLowerCase() : '';
  return ASSIGNMENT_MODES.has(normalized) ? normalized : 'full_set';
}

function normalizeAssignmentRules(value) {
  const source = value && typeof value === 'object' ? value : {};
  const defaultSource =
    source.default && typeof source.default === 'object' ? source.default : {};
  const normalizedDefaultMode = normalizeAssignmentMode(defaultSource.mode);
  const normalizedDefaultValue = normalizeAssignmentValue(
    normalizedDefaultMode,
    defaultSource.value
  );

  const overridesSource = Array.isArray(source.overrides)
    ? source.overrides
    : [];
  const overrides = overridesSource
    .map((override) => {
      if (!override || typeof override !== 'object') return null;
      const planId = override.planId || override.plan_id;
      if (!planId) return null;
      const mode = normalizeAssignmentMode(override.mode);
      const value = normalizeAssignmentValue(mode, override.value);
      if (mode !== 'full_set' && value === null) {
        return null;
      }
      return {
        planId: String(planId),
        mode,
        value,
      };
    })
    .filter(Boolean);

  return {
    default: {
      mode: normalizedDefaultMode,
      value:
        normalizedDefaultMode === 'full_set' ? null : normalizedDefaultValue,
    },
    overrides,
  };
}

function isMissingColumnError(error, columnName) {
  const parts = [error?.message, error?.details, error?.hint]
    .filter((value) => typeof value === 'string' && value.length)
    .map((value) => value.toLowerCase());
  if (!parts.length) return false;

  const normalizedColumn = columnName.toLowerCase().replace(/["']/g, '');
  return parts.some((part) => {
    if (!part.includes('does not exist')) return false;
    if (part.includes(`column ${normalizedColumn}`)) return true;
    return new RegExp(
      `column\\s+[\\w".]+\\.${normalizedColumn}(?![\\w"])`
    ).test(part);
  });
}

function sanitizeDateInput(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return value;
}

function buildExtraQuestionSet(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    visibility_rules: normalizeExtraVisibilityRules(row.visibility_rules),
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    is_active: Boolean(row.is_active),
    question_count: row.question_count ?? 0,
    time_limit_seconds: row.time_limit_seconds ?? null,
    max_attempts_per_user: row.max_attempts_per_user ?? null,
    assignment_rules: normalizeAssignmentRules(row.assignment_rules),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function buildExtraQuestion(row) {
  if (!row) return null;
  const options = Array.isArray(row.extra_question_options)
    ? row.extra_question_options
        .slice()
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
        .map((option) => ({
          id: option.id,
          question_id: option.question_id,
          label: option.label,
          content: option.content,
          is_correct: option.is_correct,
          order: option.order_index ?? 0,
        }))
    : [];

  return {
    id: row.id,
    set_id: row.set_id,
    stem: row.stem,
    explanation: row.explanation,
    metadata: row.metadata || {},
    created_at: row.created_at,
    updated_at: row.updated_at,
    options,
  };
}

function prepareExtraQuestionSetPayload(input = {}) {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const description =
    typeof input.description === 'string' && input.description.trim()
      ? input.description.trim()
      : null;
  const starts_at = sanitizeDateInput(input.starts_at ?? input.startsAt);
  const ends_at = sanitizeDateInput(input.ends_at ?? input.endsAt);
  const is_active = input.is_active ?? input.isActive ?? false;
  const hasSecondsInput = Object.prototype.hasOwnProperty.call(
    input,
    'time_limit_seconds'
  );
  const rawTimeLimit = hasSecondsInput
    ? input.time_limit_seconds
    : (input.time_limit_minutes ?? input.time_limit);
  let time_limit_seconds = null;
  if (
    rawTimeLimit !== undefined &&
    rawTimeLimit !== null &&
    rawTimeLimit !== ''
  ) {
    const numeric = Number(rawTimeLimit);
    if (Number.isFinite(numeric) && numeric > 0) {
      time_limit_seconds = hasSecondsInput
        ? Math.round(numeric)
        : Math.round(numeric * 60);
    }
  }
  const visibility = normalizeExtraVisibilityRules(
    input.visibility || input.visibility_rules
  );

  const rawMaxAttempts =
    input.max_attempts_per_user ??
    input.maxAttemptsPerUser ??
    input.maxAttempts ??
    null;
  let max_attempts_per_user = null;
  if (
    rawMaxAttempts !== null &&
    rawMaxAttempts !== undefined &&
    rawMaxAttempts !== ''
  ) {
    const parsed = Number(rawMaxAttempts);
    if (Number.isFinite(parsed) && parsed > 0) {
      max_attempts_per_user = Math.floor(parsed);
    }
  }

  const assignment_rules = normalizeAssignmentRules(
    input.assignment_rules || input.assignmentRules
  );

  return {
    title,
    description,
    starts_at,
    ends_at,
    is_active: Boolean(is_active),
    visibility_rules: visibility,
    time_limit_seconds,
    max_attempts_per_user,
    assignment_rules,
  };
}

function parseAikenContent(content, options = {}) {
  const { captureDiagnostics = false } = options;

  if (!content || !content.trim()) {
    throw new DataServiceError('The uploaded file is empty.');
  }

  const sanitizedContent = content.replace(/\uFEFF/g, '');
  const lines = sanitizedContent.replace(/\r\n?/g, '\n').split('\n');

  const questions = [];
  const diagnostics = captureDiagnostics ? [] : null;
  const skipped = [];
  const parseErrors = [];

  let current = null;

  const startNewQuestion = (line, lineNumber) => {
    current = {
      stem: stripQuestionPrefix(line),
      options: [],
      startLine: lineNumber,
      lastLine: lineNumber,
      issues: [],
    };
  };

  const recordGlobalIssue = (message, context = {}) => {
    parseErrors.push({ message, ...context });
  };

  const recordCurrentIssue = (message, context = {}) => {
    if (!current) {
      recordGlobalIssue(message, context);
      return;
    }
    current.issues.push({ message, ...context });
    current.invalid = true;
  };

  const finalizeCurrentQuestion = (endLineNumber) => {
    if (!current) return;

    const resolvedEndLine =
      endLineNumber ?? current.lastLine ?? current.startLine;
    const trimmedStem = (current.stem || '').trim();

    const resolvedOptions = [];
    const optionIssues = [];

    current.options.forEach((option, optionIndex) => {
      const trimmedContent = option.content.trim();
      if (!trimmedContent) {
        optionIssues.push({
          message: `Option ${option.label} is blank.`,
          lineNumber: option.lineNumber,
        });
        return;
      }
      resolvedOptions.push({
        label: option.label,
        content: trimmedContent,
        isCorrect: Boolean(option.isCorrect),
        order: optionIndex,
      });
    });

    if (optionIssues.length) {
      current.issues.push(...optionIssues);
    }

    const hasEnoughOptions = resolvedOptions.length >= 2;
    const hasCorrectOption = resolvedOptions.some((option) => option.isCorrect);

    if (!trimmedStem) {
      current.issues.push({
        message: 'Question text is empty.',
        lineNumber: current.startLine,
      });
    }
    if (!hasEnoughOptions) {
      current.issues.push({
        message: 'Each question must include at least two options.',
        lineNumber: current.startLine,
      });
    }
    if (!hasCorrectOption) {
      current.issues.push({
        message:
          'Each question must specify a correct answer via the ANSWER directive.',
        lineNumber: resolvedEndLine,
      });
    }

    if (current.issues.length) {
      skipped.push({
        stem: trimmedStem,
        startLine: current.startLine,
        endLine: resolvedEndLine,
        optionLines: current.options.map((option) => ({
          label: option.label,
          lineNumber: option.lineNumber,
        })),
        issues: current.issues,
      });
      current = null;
      return;
    }

    questions.push({
      stem: trimmedStem,
      options: resolvedOptions,
    });

    if (diagnostics) {
      diagnostics.push({
        questionIndex: questions.length - 1,
        startLine: current.startLine,
        endLine: resolvedEndLine,
        optionLines: current.options.map((option) => ({
          label: option.label,
          lineNumber: option.lineNumber,
        })),
        optionCount: resolvedOptions.length,
      });
    }

    current = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const lineNumber = index + 1;
    const hasIndentation = /^\s+/.test(rawLine);
    const line = rawLine.trim();

    if (!line) {
      if (current && current.options.length === 0) {
        current.stem = `${current.stem}${current.stem.endsWith('\n') ? '' : '\n'}`;
        current.lastLine = lineNumber;
      } else if (current && current.options.length > 0) {
        const lastOption = current.options[current.options.length - 1];
        lastOption.content = `${lastOption.content}${lastOption.content.endsWith('\n') ? '' : '\n'}`;
        current.lastLine = lineNumber;
      }
      continue;
    }

    const answerMatch = line.match(ANSWER_DIRECTIVE_PATTERN);
    if (answerMatch) {
      if (!current) {
        recordGlobalIssue('ANSWER directive appeared before any question.', {
          lineNumber,
          line: rawLine,
        });
        continue;
      }

      if (!current.options.length) {
        recordCurrentIssue(
          'ANSWER directive appeared before any options were defined.',
          { lineNumber, line: rawLine }
        );
        current.lastLine = lineNumber;
        finalizeCurrentQuestion(lineNumber);
        continue;
      }

      const directive = answerMatch[1].trim();
      if (!directive) {
        recordCurrentIssue('ANSWER directive is missing option letters.', {
          lineNumber,
          line: rawLine,
        });
        current.lastLine = lineNumber;
        finalizeCurrentQuestion(lineNumber);
        continue;
      }

      const answers = [];
      const letterMatches = directive.match(/\b[A-Z]\b/gi) || [];
      letterMatches.forEach((match) => {
        const letter = match.toUpperCase();
        if (!answers.includes(letter)) {
          answers.push(letter);
        }
      });

      const optionLookup = current.options.map((option) => ({
        label: option.label,
        normalized: normalizeOptionText(option.content),
      }));

      if (!answers.length) {
        const normalizedDirective = normalizeOptionText(directive);
        if (normalizedDirective) {
          optionLookup.forEach((entry) => {
            if (
              entry.normalized &&
              entry.normalized === normalizedDirective &&
              !answers.includes(entry.label)
            ) {
              answers.push(entry.label);
            }
          });
        }
      }

      if (!answers.length) {
        directive
          .replace(/\b(?:and|or|\+|&)\b/gi, ',')
          .split(/[,;/]/)
          .map((value) => value.trim())
          .filter(Boolean)
          .forEach((token) => {
            if (/^[A-Z]$/i.test(token)) {
              const letter = token.toUpperCase();
              if (!answers.includes(letter)) {
                answers.push(letter);
              }
              return;
            }
            const normalizedToken = normalizeOptionText(token);
            if (!normalizedToken) {
              return;
            }
            const matched = optionLookup.find(
              (entry) => entry.normalized === normalizedToken
            );
            if (matched && !answers.includes(matched.label)) {
              answers.push(matched.label);
            }
          });
      }

      if (!answers.length) {
        recordCurrentIssue('ANSWER directive is missing option letters.', {
          lineNumber,
          line: rawLine,
        });
        current.lastLine = lineNumber;
        finalizeCurrentQuestion(lineNumber);
        continue;
      }

      answers.forEach((letter) => {
        const option = current.options.find((item) => item.label === letter);
        if (!option) {
          recordCurrentIssue(
            `ANSWER references option "${letter}" which was not provided.`,
            { lineNumber, line: rawLine }
          );
          return;
        }
        option.isCorrect = true;
      });

      current.lastLine = lineNumber;
      finalizeCurrentQuestion(lineNumber);
      continue;
    }

    const optionMatch = line.match(OPTION_PATTERN);
    if (optionMatch) {
      if (!current) {
        recordGlobalIssue('Option encountered before the question text.', {
          lineNumber,
          line: rawLine,
        });
        continue;
      }
      const [, letterRaw, text] = optionMatch;
      const letter = letterRaw.toUpperCase();
      current.options.push({
        label: letter,
        content: text.trim(),
        isCorrect: false,
        lineNumber,
      });
      current.lastLine = lineNumber;
      continue;
    }

    if (!current) {
      startNewQuestion(line, lineNumber);
      continue;
    }

    if (current.options.length === 0) {
      current.stem = appendLine(current.stem, line);
      current.lastLine = lineNumber;
      continue;
    }

    if (hasIndentation) {
      const lastOption = current.options[current.options.length - 1];
      lastOption.content = appendLine(lastOption.content, line);
      if (!lastOption.lineNumber) {
        lastOption.lineNumber = lineNumber;
      }
      current.lastLine = lineNumber;
      continue;
    }

    finalizeCurrentQuestion(lineNumber - 1);
    startNewQuestion(line, lineNumber);
  }

  if (current) {
    if (!current.options.length) {
      recordCurrentIssue('A question is missing answer options.', {
        lineNumber: current.startLine,
      });
    }
    finalizeCurrentQuestion(current.lastLine);
  }

  if (!questions.length) {
    const context = {};
    if (skipped.length) {
      context.skipped = skipped;
    }
    if (parseErrors.length) {
      context.parseErrors = parseErrors;
    }
    throw new DataServiceError(
      'No valid questions were found. Check the formatting and try again.',
      { context }
    );
  }

  if (captureDiagnostics) {
    return {
      questions,
      diagnostics,
      skipped,
      errors: parseErrors,
    };
  }

  Object.defineProperty(questions, 'meta', {
    value: { skipped, errors: parseErrors },
    enumerable: false,
    configurable: true,
    writable: false,
  });

  return questions;
}

async function ensureClient() {
  try {
    const client = await getSupabaseClient();
    if (!client) {
      throw new Error('Supabase client returned null.');
    }
    return client;
  } catch (error) {
    if (error instanceof SupabaseConfigurationError) {
      throw new DataServiceError(
        'Supabase configuration missing. Set window.__SUPABASE_CONFIG__ before using the admin dashboard.',
        {
          cause: error,
        }
      );
    }
    throw new DataServiceError('Unable to initialise Supabase client.', {
      cause: error,
    });
  }
}

function wrapError(message, cause, context) {
  const causeMessage =
    typeof cause?.message === 'string' ? cause.message.trim() : '';
  const detail = typeof cause?.details === 'string' ? cause.details.trim() : '';
  const extra = [causeMessage, detail].filter(Boolean).join(' — ');
  const composed = extra ? `${message} (${extra})` : message;
  return new DataServiceError(composed, { cause, context });
}

function isStatementTimeout(error) {
  if (!error) return false;
  const extract = (value) => (typeof value === 'string' ? value : '');
  const code = error?.code || error?.cause?.code;
  const message = [
    extract(error?.message),
    extract(error?.details),
    extract(error?.cause?.message),
    extract(error?.cause?.details),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (code === '57014') return true;
  if (!message) return false;
  return message.includes('statement timeout');
}

async function refreshTopicQuestionCount(client, topicId) {
  const { count, error } = await client
    .from('questions')
    .select('id', { count: 'exact', head: true })
    .eq('topic_id', topicId);
  if (error) {
    throw error;
  }
  const { error: updateError } = await client
    .from('topics')
    .update({ question_count: count ?? 0 })
    .eq('id', topicId);
  if (updateError) {
    throw updateError;
  }
}

async function refreshExtraQuestionSetCount(client, setId) {
  const { count, error } = await client
    .from('extra_questions')
    .select('id', { count: 'exact', head: true })
    .eq('set_id', setId);
  if (error) {
    throw error;
  }

  const { error: updateError } = await client
    .from('extra_question_sets')
    .update({ question_count: count ?? 0 })
    .eq('id', setId);
  if (updateError) {
    throw updateError;
  }
}

class DataService {
  async logAdminAudit(action, entityType, entityId = null, metadata = {}) {
    const client = await ensureClient();
    try {
      await client.rpc('log_admin_audit_event', {
        p_action: action,
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_metadata: metadata ?? {},
      });
    } catch (error) {
      console.warn('[DataService] Failed to record admin audit log', {
        action,
        entityType,
        entityId,
        error,
      });
    }
  }

  async getDashboardStats() {
    console.log('[DataService] Fetching dashboard stats...');
    const client = await ensureClient();
    try {
      console.log('[DataService] Querying admin_dashboard_stats view...');
      const { data, error } = await client
        .from('admin_dashboard_stats')
        .select('*')
        .maybeSingle();
      if (error) {
        console.error('[DataService] Dashboard stats query error:', error);
        throw error;
      }
      console.log('[DataService] Dashboard stats retrieved:', data);
      return {
        users: data?.total_users ?? 0,
        subscriptions: data?.active_subscriptions ?? 0,
        totalQuestions: data?.total_questions ?? 0,
        revenue: data?.monthly_revenue ?? 0,
      };
    } catch (error) {
      console.error('[DataService] Failed to fetch dashboard stats:', error);
      throw wrapError(
        'Unable to fetch dashboard statistics from Supabase.',
        error
      );
    }
  }

  async listDepartments() {
    const client = await ensureClient();
    try {
      const { data, error } = await client
        .from('departments')
        .select('id, name, color_theme')
        .order('name');
      if (error) throw error;
      return data.map(buildDepartment);
    } catch (error) {
      throw wrapError('Failed to load departments.', error);
    }
  }

  async createDepartment({ name, color }) {
    const client = await ensureClient();
    const payload = {
      name,
      color_theme: color,
      slug: slugify(name),
    };
    try {
      const { data, error } = await client
        .from('departments')
        .insert(payload)
        .select('id, name, color_theme')
        .single();
      if (error) throw error;
      return buildDepartment(data);
    } catch (error) {
      throw wrapError('Failed to create department.', error, { payload });
    }
  }

  async updateDepartment(id, { name, color }) {
    const client = await ensureClient();
    const payload = {};
    if (name) {
      payload.name = name;
      payload.slug = slugify(name);
    }
    if (color) {
      payload.color_theme = color;
    }
    if (!Object.keys(payload).length) {
      return null;
    }
    try {
      const { data, error } = await client
        .from('departments')
        .update(payload)
        .eq('id', id)
        .select('id, name, color_theme')
        .single();
      if (error) throw error;
      return buildDepartment(data);
    } catch (error) {
      throw wrapError('Failed to update department.', error, { id, payload });
    }
  }

  async deleteDepartment(id) {
    const client = await ensureClient();
    try {
      const { error } = await client.from('departments').delete().eq('id', id);
      if (error) throw error;
      return true;
    } catch (error) {
      throw wrapError('Failed to delete department.', error, { id });
    }
  }

  async deleteUserProfile(profileId) {
    const client = await ensureClient();
    try {
      const { error } = await client
        .from('profiles')
        .delete()
        .eq('id', profileId);
      if (error) throw error;
      return true;
    } catch (error) {
      throw wrapError('Failed to delete profile.', error, { profileId });
    }
  }

  async deleteUserProfilesBulk(profileIds) {
    const client = await ensureClient();
    try {
      const { error } = await client
        .from('profiles')
        .delete()
        .in('id', profileIds);
      if (error) throw error;
    } catch (error) {
      throw wrapError('Failed to delete profiles.', error, { profileIds });
    }
  }

  async updateUserProfile(profileId, { full_name, department_id }) {
    const client = await ensureClient();
    const payload = {};
    if (full_name) payload.full_name = full_name;
    if (department_id !== undefined) payload.department_id = department_id;

    try {
      const { data, error } = await client
        .from('profiles')
        .update(payload)
        .eq('id', profileId)
        .select('*')
        .single();
      if (error) throw error;
      return buildProfileRow(data);
    } catch (error) {
      throw wrapError('Failed to update user profile.', error, {
        profileId,
        payload,
      });
    }
  }

  async updateUserProfileStatus(profileId, status) {
    const client = await ensureClient();
    try {
      const { data, error } = await client
        .from('profiles')
        .update({ status })
        .eq('id', profileId)
        .select('*')
        .single();
      if (error) throw error;
      return buildProfileRow(data);
    } catch (error) {
      throw wrapError('Failed to update user status.', error, {
        profileId,
        status,
      });
    }
  }

  async updateUserProfileStatusBulk(profileIds, status) {
    const client = await ensureClient();
    try {
      const { error } = await client
        .from('profiles')
        .update({ status })
        .in('id', profileIds);
      if (error) throw error;
    } catch (error) {
      throw wrapError('Failed to update user statuses.', error, {
        profileIds,
        status,
      });
    }
  }

  async updateUserSubscription(userId, planId) {
    const client = await ensureClient();
    try {
      // First, get the current active subscription for the user
      const { data: currentSubscription, error: currentError } = await client
        .from('user_subscriptions')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .single();

      if (currentError && currentError.code !== 'PGRST116') throw currentError; // Ignore no rows found error

      // If there is a current subscription, set it to 'canceled'
      if (currentSubscription) {
        const { error: updateError } = await client
          .from('user_subscriptions')
          .update({ status: 'canceled', canceled_at: new Date().toISOString() })
          .eq('id', currentSubscription.id);
        if (updateError) throw updateError;
      }

      // Create a new active subscription
      const { data, error } = await client
        .from('user_subscriptions')
        .insert({
          user_id: userId,
          plan_id: planId,
          status: 'active',
        })
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      throw wrapError('Failed to update user subscription.', error, {
        userId,
        planId,
      });
    }
  }

  async listCourses(departmentId) {
    if (!departmentId) return [];
    const client = await ensureClient();
    try {
      const { data, error } = await client
        .from('courses')
        .select('id, department_id, name, description')
        .eq('department_id', departmentId)
        .order('name');
      if (error) throw error;
      return data.map(buildCourse);
    } catch (error) {
      throw wrapError(
        'Failed to load courses for the selected department.',
        error,
        { departmentId }
      );
    }
  }

  async getCourse(courseId) {
    const client = await ensureClient();
    try {
      const { data, error } = await client
        .from('courses')
        .select('id, department_id, name, description')
        .eq('id', courseId)
        .single();
      if (error) throw error;
      return buildCourse(data);
    } catch (error) {
      throw wrapError('Failed to load course.', error, { courseId });
    }
  }

  async createCourse(departmentId, { name, description = '' }) {
    const client = await ensureClient();
    const payload = {
      department_id: departmentId,
      name,
      description,
      slug: slugify(name),
    };
    try {
      const { data, error } = await client
        .from('courses')
        .insert(payload)
        .select('id, department_id, name, description')
        .single();
      if (error) throw error;
      return buildCourse(data);
    } catch (error) {
      throw wrapError('Failed to create course.', error, { departmentId });
    }
  }

  async updateCourse(courseId, { name, description }) {
    const client = await ensureClient();
    const payload = {};
    if (name) {
      payload.name = name;
      payload.slug = slugify(name);
    }
    if (description !== undefined) {
      payload.description = description;
    }
    if (!Object.keys(payload).length) {
      return null;
    }
    try {
      const { data, error } = await client
        .from('courses')
        .update(payload)
        .eq('id', courseId)
        .select('id, department_id, name, description')
        .single();
      if (error) throw error;
      return buildCourse(data);
    } catch (error) {
      throw wrapError('Failed to update course.', error, { courseId, payload });
    }
  }

  async deleteCourse(courseId) {
    const client = await ensureClient();
    try {
      const { error } = await client
        .from('courses')
        .delete()
        .eq('id', courseId);
      if (error) throw error;
      return true;
    } catch (error) {
      throw wrapError('Failed to delete course.', error, { courseId });
    }
  }

  async getTopic(topicId) {
    const client = await ensureClient();
    try {
      const { data, error } = await client
        .from('topics')
        .select('id, course_id, name, question_count')
        .eq('id', topicId)
        .single();
      if (error) throw error;
      return buildTopic(data);
    } catch (error) {
      throw wrapError('Failed to load topic.', error, { topicId });
    }
  }

  async listTopics(courseId) {
    if (!courseId) return [];
    const client = await ensureClient();
    try {
      const { data, error } = await client
        .from('topics')
        .select('id, course_id, name, question_count')
        .eq('course_id', courseId)
        .order('name');
      if (error) throw error;
      return data.map(buildTopic);
    } catch (error) {
      throw wrapError('Failed to load topics for the selected course.', error, {
        courseId,
      });
    }
  }

  async listTopicsForDepartment(departmentId) {
    if (!departmentId) return [];
    const client = await ensureClient();
    try {
      const { data, error } = await client
        .from('topics')
        .select(
          'id, course_id, name, question_count, courses!inner(id, department_id, name)'
        )
        .eq('courses.department_id', departmentId)
        .order('name');
      if (error) throw error;
      return Array.isArray(data)
        ? data.map((row) => ({
            id: row.id,
            course_id: row.course_id,
            name: row.name,
            question_count: row.question_count ?? 0,
            course_name: row.courses?.name ?? 'Course',
          }))
        : [];
    } catch (error) {
      throw wrapError('Failed to load topics for department.', error, {
        departmentId,
      });
    }
  }

  async listAllTopics() {
    const client = await ensureClient();
    try {
      const { data, error } = await client
        .from('topics')
        .select(
          'id, course_id, name, question_count, courses(id, name, departments(id, name))'
        )
        .order('name');
      if (error) throw error;
      return Array.isArray(data)
        ? data.map((row) => ({
            id: row.id,
            course_id: row.course_id,
            name: row.name,
            question_count: row.question_count ?? 0,
            course_name: row.courses?.name ?? 'Course',
            department_name: row.courses?.departments?.name ?? 'Department',
          }))
        : [];
    } catch (error) {
      throw wrapError('Failed to load all topics.', error);
    }
  }

  async createTopic(courseId, { name, question_count = 0 }) {
    const client = await ensureClient();
    const payload = {
      course_id: courseId,
      name,
      slug: slugify(name),
      question_count,
    };
    try {
      const { data, error } = await client
        .from('topics')
        .insert(payload)
        .select('id, course_id, name, question_count')
        .single();
      if (error) throw error;
      return buildTopic(data);
    } catch (error) {
      throw wrapError('Failed to create topic.', error, { courseId });
    }
  }

  async updateTopic(topicId, { name, question_count }) {
    const client = await ensureClient();
    const payload = {};
    if (name) {
      payload.name = name;
      payload.slug = slugify(name);
    }
    if (question_count !== undefined) {
      payload.question_count = Number(question_count);
    }
    if (!Object.keys(payload).length) {
      return null;
    }
    try {
      const { data, error } = await client
        .from('topics')
        .update(payload)
        .eq('id', topicId)
        .select('id, course_id, name, question_count')
        .single();
      if (error) throw error;
      return buildTopic(data);
    } catch (error) {
      throw wrapError('Failed to update topic.', error, { topicId, payload });
    }
  }

  async deleteTopic(topicId) {
    const client = await ensureClient();
    try {
      const { error } = await client.from('topics').delete().eq('id', topicId);
      if (error) throw error;
      return true;
    } catch (error) {
      if (!isStatementTimeout(error)) {
        throw wrapError('Failed to delete topic.', error, { topicId });
      }
      console.warn(
        '[DataService] Topic deletion timed out. Attempting fallback cascade cleanup.',
        { topicId, error }
      );
      try {
        await this.deleteTopicCascadeFallback(client, topicId);
        return true;
      } catch (fallbackError) {
        throw wrapError(
          'Failed to delete topic after fallback cleanup.',
          fallbackError,
          {
            topicId,
          }
        );
      }
    }
  }

  async deleteTopicCascadeFallback(client, topicId) {
    const deleteWithBackoff = async ({
      table,
      column,
      ids,
      initialChunk = 200,
    }) => {
      if (!Array.isArray(ids) || !ids.length) return;
      const queue = ids.filter(Boolean);
      let chunkSize = Math.max(1, initialChunk);

      while (queue.length) {
        const chunk = queue.splice(0, chunkSize);
        if (!chunk.length) continue;
        const { error } = await client.from(table).delete().in(column, chunk);
        if (error) {
          if (isStatementTimeout(error)) {
            if (chunk.length === 1) {
              const single = chunk[0];
              const { error: singleError } = await client
                .from(table)
                .delete()
                .eq(column, single)
                .limit(1);
              if (singleError) throw singleError;
              continue;
            }
            queue.unshift(...chunk);
            chunkSize = Math.max(1, Math.floor(chunkSize / 2));
            continue;
          }
          throw error;
        }
      }
    };

    const fetchQuestionIds = async () => {
      const { data, error } = await client
        .from('questions')
        .select('id')
        .eq('topic_id', topicId);
      if (error) throw error;
      return Array.isArray(data) ? data.map((row) => row.id) : [];
    };

    const questionIds = await fetchQuestionIds();

    const { error: clearWeeksError } = await client
      .from('study_cycle_weeks')
      .update({ topic_id: null })
      .eq('topic_id', topicId);
    if (clearWeeksError && !isStatementTimeout(clearWeeksError)) {
      throw clearWeeksError;
    }
    if (clearWeeksError && isStatementTimeout(clearWeeksError)) {
      const { data: weekIds, error: weekFetchError } = await client
        .from('study_cycle_weeks')
        .select('id')
        .eq('topic_id', topicId);
      if (weekFetchError) throw weekFetchError;
      const identifiers = Array.isArray(weekIds)
        ? weekIds.map((row) => row.id)
        : [];
      if (identifiers.length) {
        for (const id of identifiers) {
          const { error: weekUpdateError } = await client
            .from('study_cycle_weeks')
            .update({ topic_id: null })
            .eq('id', id)
            .limit(1);
          if (weekUpdateError) throw weekUpdateError;
        }
      }
    }

    if (questionIds.length) {
      await deleteWithBackoff({
        table: 'study_cycle_subslot_questions',
        column: 'question_id',
        ids: questionIds,
        initialChunk: 100,
      });
      await deleteWithBackoff({
        table: 'question_options',
        column: 'question_id',
        ids: questionIds,
        initialChunk: 100,
      });
      await deleteWithBackoff({
        table: 'questions',
        column: 'id',
        ids: questionIds,
        initialChunk: 100,
      });
    }

    const { error: subslotTopicError } = await client
      .from('study_cycle_subslot_topics')
      .delete()
      .eq('topic_id', topicId);
    if (subslotTopicError && isStatementTimeout(subslotTopicError)) {
      const { data: subslotIds, error: subslotFetchError } = await client
        .from('study_cycle_subslot_topics')
        .select('id')
        .eq('topic_id', topicId);
      if (subslotFetchError) throw subslotFetchError;
      const ids = Array.isArray(subslotIds)
        ? subslotIds.map((row) => row.id)
        : [];
      await deleteWithBackoff({
        table: 'study_cycle_subslot_topics',
        column: 'id',
        ids,
        initialChunk: 100,
      });
    } else if (subslotTopicError) {
      throw subslotTopicError;
    }

    const { error: topicDeleteError } = await client
      .from('topics')
      .delete()
      .eq('id', topicId);
    if (topicDeleteError) throw topicDeleteError;
  }

  async updateQuestion(
    questionId,
    { stem, explanation, options, imageFile, image_url }
  ) {
    const client = await ensureClient();
    try {
      const payload = {};
      if (stem !== undefined) payload.stem = stem;
      if (explanation !== undefined) payload.explanation = explanation;

      if (imageFile) {
        const { data: question } = await client
          .from('questions')
          .select('topic_id')
          .eq('id', questionId)
          .single();
        const filePath = `question-images/${question.topic_id}/${questionId}-${imageFile.name}`;
        const { error: uploadError } = await client.storage
          .from('question-images')
          .upload(filePath, imageFile, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: publicUrlData } = client.storage
          .from('question-images')
          .getPublicUrl(filePath);
        payload.image_url = publicUrlData.publicUrl;
      } else if (image_url === null) {
        payload.image_url = null;
        // TODO: Delete old image from storage
      }

      if (Object.keys(payload).length) {
        const { error } = await client
          .from('questions')
          .update(payload)
          .eq('id', questionId);
        if (error) throw error;
      }

      if (options) {
        const { error: deleteError } = await client
          .from('question_options')
          .delete()
          .eq('question_id', questionId);
        if (deleteError) throw deleteError;

        const formattedOptions = Array.isArray(options)
          ? options.map((option, index) => ({
              question_id: questionId,
              label: option.label || String.fromCharCode(65 + index),
              content: option.content,
              is_correct: Boolean(option.isCorrect),
              order_index: option.order ?? index,
            }))
          : [];

        if (formattedOptions.length) {
          const { error: optionError } = await client
            .from('question_options')
            .insert(formattedOptions);
          if (optionError) throw optionError;
        }
      }

      const { data: finalQuestion, error: finalError } = await client
        .from('questions')
        .select('*, question_options(*)')
        .eq('id', questionId)
        .single();

      if (finalError) throw finalError;

      return buildQuestion(finalQuestion);
    } catch (error) {
      throw wrapError('Failed to update question.', error, { questionId });
    }
  }

  async listStudyCycles(departmentId) {
    if (!departmentId) return [];
    const client = await ensureClient();
    try {
      const { data, error } = await client
        .from('study_cycles')
        .select(
          `
            id,
            department_id,
            code,
            source_cycle_id,
            status,
            title,
            start_date,
            duration_days,
            questions_per_day,
            question_cap,
            study_cycle_weeks (
              id,
              week_index,
              day_span,
              start_date,
              end_date,
              question_target,
              question_count,
              status,
              activated_at,
              source_subslot_id,
              topic_id,
              topic:topics(id, name, course_id, course:courses(id, name)),
              subslot_topics:study_cycle_subslot_topics(
                id,
                topic_id,
                selection_mode,
                question_count,
                topic:topics(id, name, course_id, course:courses(id, name))
              )
            )
          `
        )
        .eq('department_id', departmentId)
        .order('start_date');
      if (error) throw error;
      const cycles = data.map(buildStudyCycle);
      await attachSubslotDistribution(client, cycles);
      cycles.forEach((cycle) => {
        cycle.timeline = buildCycleTimeline(cycle);
      });
      return cycles;
    } catch (error) {
      throw wrapError('Failed to load study cycles.', error, { departmentId });
    }
  }

  async listStudyCycleTimeline(departmentId) {
    const cycles = await this.listStudyCycles(departmentId);
    return cycles.map((cycle) => cycle.timeline);
  }

  async listScheduleHealth(departmentId) {
    if (!departmentId) {
      return [];
    }
    const client = await ensureClient();
    try {
      const { data, error } = await client.rpc('get_cycle_schedule_health', {
        p_department_id: departmentId,
      });
      if (error) throw error;
      if (!Array.isArray(data)) {
        return [];
      }
      return data.map((entry) => ({
        ...entry,
        alerts: Array.isArray(entry?.alerts) ? entry.alerts : [],
      }));
    } catch (error) {
      throw wrapError('Failed to load schedule health summary.', error, {
        departmentId,
      });
    }
  }

  async refreshStudyCycleSchedule(
    cycleId,
    { triggeredBy = null, replace = true } = {}
  ) {
    if (!cycleId) {
      throw new DataServiceError('Provide a study cycle to refresh.');
    }
    const client = await ensureClient();
    const timingId = startTiming('refresh_cycle_daily_schedule', {
      cycleId,
      replace,
    });
    try {
      const payload = { p_cycle_id: cycleId };
      if (triggeredBy) {
        payload.p_triggered_by = triggeredBy;
      }
      if (typeof replace === 'boolean') {
        payload.p_replace = replace;
      }
      const { data, error } = await client.rpc(
        'refresh_cycle_daily_schedule',
        payload
      );
      if (error) throw error;
      endTiming(timingId, 'success', { rows: data?.summary?.total_days ?? 0 });
      await this.logAdminAudit(
        'refresh_cycle_schedule',
        'study_cycle',
        cycleId,
        {
          replace: Boolean(replace),
          run_summary: data?.summary ?? null,
        }
      );
      return data;
    } catch (error) {
      recordError('refresh_cycle_daily_schedule', error, { cycleId });
      endTiming(timingId, 'error', { reason: 'rpc_failure' });
      const message = String(error?.message || '').toLowerCase();
      if (
        message.includes('refresh_cycle_daily_schedule') ||
        message.includes('study_cycle_schedule_runs') ||
        message.includes('study_cycle_daily_buckets')
      ) {
        throw new DataServiceError(
          'Daily scheduling engine not available. Apply the latest Supabase migrations and try again.',
          { cause: error, context: { cycleId } }
        );
      }
      throw wrapError(
        'Failed to rebuild daily schedule for the selected slot.',
        error,
        { cycleId }
      );
    }
  }

  async createStudyCycle(departmentId, { title, start_date }) {
    const client = await ensureClient();
    const perDay = DAILY_QUESTION_TARGET;
    const cap = SLOT_QUESTION_CAP;
    const payload = {
      department_id: departmentId,
      title,
      start_date,
      status: 'draft',
      duration_days: SLOT_DURATION_DAYS,
      questions_per_day: perDay,
      question_cap: cap,
    };
    try {
      const { data: cycle, error } = await client
        .from('study_cycles')
        .insert(payload)
        .select(
          'id, department_id, title, code, source_cycle_id, status, start_date, duration_days, questions_per_day, question_cap'
        )
        .single();
      if (error) throw error;
      const defaultSpans = Array.from(
        { length: SUBSLOT_COUNT },
        () => SUBSLOT_DAY_SPAN
      );
      const windows = buildSubslotWindows(start_date, defaultSpans);
      const subslotPayload = defaultSpans.map((_span, index) => ({
        study_cycle_id: cycle.id,
        week_index: index + 1,
        day_span: SUBSLOT_DAY_SPAN,
        start_date: windows[index]?.start || null,
        end_date: windows[index]?.end || null,
        question_target: SUBSLOT_QUESTION_CAP,
        question_count: 0,
        status: 'draft',
      }));
      if (subslotPayload.length) {
        const { error: subslotError } = await client
          .from('study_cycle_weeks')
          .insert(subslotPayload);
        if (subslotError) throw subslotError;
      }
      const { data: refreshed, error: refreshError } = await client
        .from('study_cycles')
        .select(
          `
            id,
            department_id,
            code,
            source_cycle_id,
            status,
            title,
            start_date,
            duration_days,
            questions_per_day,
            question_cap,
            study_cycle_weeks (
              id,
              week_index,
              day_span,
              start_date,
              end_date,
              question_target,
              question_count,
              status,
              activated_at,
              source_subslot_id,
              subslot_topics:study_cycle_subslot_topics(
                id,
                topic_id,
                selection_mode,
                question_count,
                topic:topics(id, name, course_id, course:courses(id, name))
              )
            )
          `
        )
        .eq('id', cycle.id)
        .single();
      if (refreshError) throw refreshError;
      const built = buildStudyCycle(refreshed);
      await attachSubslotDistribution(client, [built]);
      built.timeline = buildCycleTimeline(built);
      const scheduleSummary = await refreshDailySchedule(client, built.id);
      if (scheduleSummary && built.timeline) {
        built.timeline.unscheduled_days = scheduleSummary.unscheduled_days ?? 0;
        built.timeline.missing_questions =
          scheduleSummary.missing_questions ?? 0;
      }
      await this.logAdminAudit('create_cycle', 'study_cycle', built.id, {
        start_date,
        subslots_created: subslotPayload.length,
      });
      return built;
    } catch (error) {
      throw wrapError('Failed to create study cycle.', error, { departmentId });
    }
  }

  async cloneStudyCycle(
    sourceCycleId,
    targetDepartmentId,
    { title, start_date } = {}
  ) {
    if (!sourceCycleId) {
      throw new DataServiceError('Select a slot to reuse before cloning.');
    }
    if (!targetDepartmentId) {
      throw new DataServiceError('Choose a department for the reused slot.');
    }
    const startDate = start_date;
    if (!startDate) {
      throw new DataServiceError('Provide a start date for the reused slot.');
    }

    const client = await ensureClient();

    const { data: source, error: sourceError } = await client
      .from('study_cycles')
      .select(
        `
          id,
          department_id,
          title,
          code,
          status,
          start_date,
          duration_days,
          questions_per_day,
          question_cap,
          study_cycle_weeks (
            id,
            week_index,
            day_span,
            start_date,
            end_date,
            question_target,
            question_count,
            subslot_topics:study_cycle_subslot_topics(
              id,
              topic_id,
              selection_mode,
              question_count
            )
          )
        `
      )
      .eq('id', sourceCycleId)
      .single();
    if (sourceError) {
      throw wrapError('Unable to find the source slot.', sourceError, {
        sourceCycleId,
      });
    }

    const reuseTitle =
      title?.trim() || `${source.title || 'Question Slot'} (Reuse)`;
    const subslotWindows = buildSubslotWindows(
      startDate,
      Array.from({ length: SUBSLOT_COUNT }, () => SUBSLOT_DAY_SPAN)
    );
    if (subslotWindows.length !== SUBSLOT_COUNT) {
      throw new DataServiceError(
        'Unable to generate the four subslot windows for the new slot.',
        {
          context: { startDate },
        }
      );
    }

    let insertedCycleId = null;

    try {
      const { data: created, error: createError } = await client
        .from('study_cycles')
        .insert({
          department_id: targetDepartmentId,
          title: reuseTitle,
          start_date: startDate,
          status: 'draft',
          duration_days: SLOT_DURATION_DAYS,
          questions_per_day: DAILY_QUESTION_TARGET,
          question_cap: SLOT_QUESTION_CAP,
          source_cycle_id: source.id,
        })
        .select(
          'id, department_id, title, code, source_cycle_id, status, start_date, duration_days, questions_per_day, question_cap'
        )
        .single();
      if (createError) throw createError;
      insertedCycleId = created.id;

      const sourceSubslots = Array.isArray(source.study_cycle_weeks)
        ? source.study_cycle_weeks
            .slice()
            .sort((a, b) => (a.week_index ?? 0) - (b.week_index ?? 0))
        : [];

      const subslotPayload = subslotWindows.map((window, index) => ({
        study_cycle_id: created.id,
        week_index: index + 1,
        day_span: SUBSLOT_DAY_SPAN,
        start_date: window?.start || null,
        end_date: window?.end || null,
        question_target: SUBSLOT_QUESTION_CAP,
        question_count: 0,
        status: 'draft',
        source_subslot_id: sourceSubslots[index]?.id || null,
      }));

      const { data: newSubslots, error: subslotError } = await client
        .from('study_cycle_weeks')
        .insert(subslotPayload)
        .select('id, week_index, source_subslot_id');
      if (subslotError) throw subslotError;

      const topicPayload = [];
      newSubslots.forEach((subslotRow) => {
        if (!subslotRow.source_subslot_id) return;
        const sourceSubslot = sourceSubslots.find(
          (item) => item.id === subslotRow.source_subslot_id
        );
        if (!sourceSubslot || !Array.isArray(sourceSubslot.subslot_topics))
          return;
        sourceSubslot.subslot_topics.forEach((topic) => {
          topicPayload.push({
            subslot_id: subslotRow.id,
            topic_id: topic.topic_id,
            selection_mode: topic.selection_mode || 'random',
            question_count: topic.question_count ?? null,
          });
        });
      });

      if (topicPayload.length) {
        const { error: topicError } = await client
          .from('study_cycle_subslot_topics')
          .insert(topicPayload);
        if (topicError) throw topicError;
      }

      const { data: refreshed, error: refreshError } = await client
        .from('study_cycles')
        .select(
          `
            id,
            department_id,
            code,
            source_cycle_id,
            status,
            title,
            start_date,
            duration_days,
            questions_per_day,
            question_cap,
            study_cycle_weeks (
              id,
              week_index,
              day_span,
              start_date,
              end_date,
              question_target,
              question_count,
              status,
              activated_at,
              source_subslot_id,
              subslot_topics:study_cycle_subslot_topics(
                id,
                topic_id,
                selection_mode,
                question_count,
                topic:topics(id, name, course_id, course:courses(id, name))
              )
            )
          `
        )
        .eq('id', created.id)
        .single();
      if (refreshError) throw refreshError;
      const built = buildStudyCycle(refreshed);
      await attachSubslotDistribution(client, [built]);
      built.timeline = buildCycleTimeline(built);
      const scheduleSummary = await refreshDailySchedule(client, built.id);
      if (scheduleSummary && built.timeline) {
        built.timeline.unscheduled_days = scheduleSummary.unscheduled_days ?? 0;
        built.timeline.missing_questions =
          scheduleSummary.missing_questions ?? 0;
      }
      await this.logAdminAudit('clone_cycle', 'study_cycle', built.id, {
        source_cycle_id: sourceCycleId,
        target_department_id: targetDepartmentId,
      });
      return built;
    } catch (error) {
      if (insertedCycleId) {
        try {
          await client.from('study_cycles').delete().eq('id', insertedCycleId);
        } catch {
          // Ignore cleanup failures; the primary error will be raised.
        }
      }
      throw wrapError('Failed to clone study cycle.', error, {
        sourceCycleId,
        targetDepartmentId,
      });
    }
  }

  async updateStudyCycle(cycleId, updates) {
    const client = await ensureClient();
    const payload = {};
    if (updates.title !== undefined) payload.title = updates.title;
    if (updates.start_date !== undefined)
      payload.start_date = updates.start_date;
    if (updates.code !== undefined) payload.code = updates.code;
    if (updates.status !== undefined) payload.status = updates.status;
    payload.questions_per_day = DAILY_QUESTION_TARGET;
    payload.question_cap = SLOT_QUESTION_CAP;
    payload.duration_days = SLOT_DURATION_DAYS;
    if (!Object.keys(payload).length) {
      return null;
    }
    try {
      const { data, error } = await client
        .from('study_cycles')
        .update(payload)
        .eq('id', cycleId)
        .select(
          'id, department_id, title, code, source_cycle_id, status, start_date, duration_days, questions_per_day, question_cap'
        )
        .single();
      if (error) throw error;
      const shouldReschedule = updates.start_date !== undefined;
      if (shouldReschedule) {
        const { data: subslots, error: subslotError } = await client
          .from('study_cycle_weeks')
          .select('id, week_index, day_span')
          .eq('study_cycle_id', cycleId)
          .order('week_index');
        if (subslotError) throw subslotError;
        if (Array.isArray(subslots) && subslots.length) {
          const spans = subslots.map(() => SUBSLOT_DAY_SPAN);
          const windows = buildSubslotWindows(data.start_date, spans);
          const reschedulePayload = subslots.map((subslot, index) => ({
            id: subslot.id,
            start_date: windows[index]?.start || null,
            end_date: windows[index]?.end || null,
            day_span: SUBSLOT_DAY_SPAN,
            question_target: SUBSLOT_QUESTION_CAP,
          }));
          if (reschedulePayload.length) {
            const { error: rescheduleError } = await client
              .from('study_cycle_weeks')
              .upsert(reschedulePayload, { onConflict: 'id' });
            if (rescheduleError) throw rescheduleError;
          }
        }
      }

      const { data: refreshed, error: refreshError } = await client
        .from('study_cycles')
        .select(
          `
            id,
            department_id,
            code,
            source_cycle_id,
            status,
            title,
            start_date,
            duration_days,
            questions_per_day,
            question_cap,
            study_cycle_weeks (
              id,
              week_index,
              day_span,
              start_date,
              end_date,
              question_target,
              question_count,
              status,
              activated_at,
              source_subslot_id,
              subslot_topics:study_cycle_subslot_topics(
                id,
                topic_id,
                selection_mode,
                question_count,
                topic:topics(id, name, course_id, course:courses(id, name))
              )
            )
          `
        )
        .eq('id', cycleId)
        .single();
      if (refreshError) throw refreshError;
      const built = buildStudyCycle(refreshed);
      await attachSubslotDistribution(client, [built]);
      built.timeline = buildCycleTimeline(built);
      const scheduleSummary = await refreshDailySchedule(client, built.id);
      if (scheduleSummary && built.timeline) {
        built.timeline.unscheduled_days = scheduleSummary.unscheduled_days ?? 0;
        built.timeline.missing_questions =
          scheduleSummary.missing_questions ?? 0;
      }
      await this.logAdminAudit('update_cycle', 'study_cycle', built.id, {
        updates,
      });
      return built;
    } catch (error) {
      throw wrapError('Failed to update study cycle.', error, {
        cycleId,
        payload,
      });
    }
  }

  async deleteStudyCycle(cycleId) {
    const client = await ensureClient();
    try {
      const { error } = await client
        .from('study_cycles')
        .delete()
        .eq('id', cycleId);
      if (error) throw error;
      await this.logAdminAudit('delete_cycle', 'study_cycle', cycleId);
      return true;
    } catch (error) {
      throw wrapError('Failed to delete study cycle.', error, { cycleId });
    }
  }

  async createStudyCycleWeek(
    cycleId,
    { week_index, start_date = null, status = 'draft' }
  ) {
    const client = await ensureClient();
    try {
      const { count: currentCount, error: countError } = await client
        .from('study_cycle_weeks')
        .select('id', { count: 'exact', head: true })
        .eq('study_cycle_id', cycleId);
      if (countError) throw countError;
      if ((currentCount ?? 0) >= SUBSLOT_COUNT) {
        throw new DataServiceError(
          'Each slot can only contain four weekly subslots.',
          {
            context: { cycleId },
          }
        );
      }

      const { data: slot, error: slotError } = await client
        .from('study_cycles')
        .select('id, questions_per_day, start_date')
        .eq('id', cycleId)
        .single();
      if (slotError) throw slotError;
      const spans = buildSubslotWindows(start_date || slot.start_date, [
        SUBSLOT_DAY_SPAN,
      ]);
      const target = SUBSLOT_QUESTION_CAP;
      const { data, error } = await client
        .from('study_cycle_weeks')
        .insert({
          study_cycle_id: cycleId,
          week_index,
          day_span: SUBSLOT_DAY_SPAN,
          start_date: spans[0]?.start || null,
          end_date: spans[0]?.end || null,
          question_target: target,
          question_count: 0,
          status,
        })
        .select(
          `
            id,
            week_index,
            day_span,
            start_date,
            end_date,
            question_target,
            question_count,
            status,
            activated_at,
            source_subslot_id,
            subslot_topics:study_cycle_subslot_topics(
              id,
              topic_id,
              selection_mode,
              question_count,
              topic:topics(id, name, course_id, course:courses(id, name))
            ),
            study_cycle:study_cycles(id, questions_per_day)
          `
        )
        .single();
      if (error) throw error;
      const built = buildSubslot(
        data,
        data.study_cycle?.questions_per_day ?? slot.questions_per_day ?? 250
      );
      await this.logAdminAudit(
        'create_subslot',
        'study_cycle_subslot',
        built.id,
        {
          cycle_id: cycleId,
          week_index,
        }
      );
      return built;
    } catch (error) {
      throw wrapError('Failed to create study cycle week.', error, {
        cycleId,
        week_index,
      });
    }
  }

  async deleteStudyCycleWeek(cycleId, subslotId) {
    throw wrapError(
      'Slots must retain their four scheduled subslots. Edit the subslot instead of deleting it.',
      null,
      {
        cycleId,
        subslotId,
      }
    );
  }

  async updateStudyCycleSubslot(cycleId, subslotId, updates) {
    const client = await ensureClient();
    try {
      const { data: current, error: currentError } = await client
        .from('study_cycle_weeks')
        .select(
          'id, week_index, day_span, question_count, question_target, status'
        )
        .eq('study_cycle_id', cycleId)
        .eq('id', subslotId)
        .single();
      if (currentError) throw currentError;
      if (!current) {
        throw new DataServiceError(
          'Subslot not found for the provided cycle.',
          { context: { cycleId, subslotId } }
        );
      }

      const payload = {};
      if (updates.week_index !== undefined) {
        const nextIndex = Number(updates.week_index);
        if (
          !Number.isInteger(nextIndex) ||
          nextIndex < 1 ||
          nextIndex > SUBSLOT_COUNT
        ) {
          throw new DataServiceError(
            'Weekly subslots must stay within the four-slot structure.',
            {
              context: { cycleId, subslotId, week_index: updates.week_index },
            }
          );
        }
        payload.week_index = nextIndex;
      }
      payload.day_span = SUBSLOT_DAY_SPAN;
      if (updates.start_date !== undefined)
        payload.start_date = updates.start_date;
      if (updates.end_date !== undefined) payload.end_date = updates.end_date;
      if (updates.status !== undefined) payload.status = updates.status;
      const nextQuestionCount =
        updates.question_count !== undefined
          ? Number(updates.question_count)
          : (current.question_count ?? 0);
      if (!Number.isFinite(nextQuestionCount) || nextQuestionCount < 0) {
        throw new DataServiceError(
          'Question counts must be a positive number.',
          {
            context: {
              cycleId,
              subslotId,
              question_count: updates.question_count,
            },
          }
        );
      }
      if (nextQuestionCount > SUBSLOT_QUESTION_CAP) {
        throw new DataServiceError(
          'Subslots can hold a maximum of 1,750 questions.',
          {
            context: { cycleId, subslotId, question_count: nextQuestionCount },
          }
        );
      }
      if (updates.question_count !== undefined) {
        payload.question_count = nextQuestionCount;
      }
      payload.question_target = SUBSLOT_QUESTION_CAP;

      if (
        updates.status === 'active' &&
        nextQuestionCount < SUBSLOT_QUESTION_CAP
      ) {
        throw new DataServiceError(
          'Fill the subslot with 1,750 questions before activation.',
          {
            context: { cycleId, subslotId, question_count: nextQuestionCount },
          }
        );
      }

      if (updates.activated_at !== undefined)
        payload.activated_at = updates.activated_at;
      if (updates.source_subslot_id !== undefined)
        payload.source_subslot_id = updates.source_subslot_id;
      if (!Object.keys(payload).length) {
        return null;
      }
      const { data, error } = await client
        .from('study_cycle_weeks')
        .update(payload)
        .eq('study_cycle_id', cycleId)
        .eq('id', subslotId)
        .select(
          `
            id,
            week_index,
            day_span,
            start_date,
            end_date,
            question_target,
            question_count,
            status,
            activated_at,
            source_subslot_id,
            subslot_topics:study_cycle_subslot_topics(
              id,
              topic_id,
              selection_mode,
              question_count,
              topic:topics(id, name, course_id, course:courses(id, name))
            ),
            study_cycle:study_cycles(id, questions_per_day)
          `
        )
        .single();
      if (error) throw error;
      const built = buildSubslot(
        data,
        data.study_cycle?.questions_per_day ?? 250
      );

      const { data: distributionRows, error: distributionError } = await client
        .from('study_cycle_subslot_questions')
        .select('day_offset')
        .eq('subslot_id', subslotId);
      if (distributionError) throw distributionError;
      const distributionMap = new Map();
      (distributionRows || []).forEach((row) => {
        const dayOffset = Number(row.day_offset ?? 0);
        distributionMap.set(
          dayOffset,
          (distributionMap.get(dayOffset) || 0) + 1
        );
      });
      built.distribution = Array.from(distributionMap.entries())
        .map(([day_offset, count]) => ({ day_offset, count }))
        .sort((a, b) => a.day_offset - b.day_offset);

      await refreshDailySchedule(client, cycleId);

      await this.logAdminAudit(
        'update_subslot',
        'study_cycle_subslot',
        subslotId,
        {
          cycle_id: cycleId,
          updates,
        }
      );

      return built;
    } catch (error) {
      throw wrapError('Failed to update study cycle slot.', error, {
        cycleId,
        subslotId,
      });
    }
  }

  async fillSubslotQuestions(
    subslotId,
    requests = [],
    { replace = true } = {}
  ) {
    const client = await ensureClient();
    try {
      const { data: current, error: currentError } = await client
        .from('study_cycle_weeks')
        .select('id, study_cycle_id, question_count')
        .eq('id', subslotId)
        .single();
      if (currentError) throw currentError;
      if (!current) {
        throw new DataServiceError('Subslot not found.', {
          context: { subslotId },
        });
      }

      const baseCount = replace ? 0 : (current.question_count ?? 0);
      const numericRequested = requests
        .filter((request) => request && request.selection_mode !== 'all')
        .reduce((sum, request) => sum + Number(request.question_count || 0), 0);
      if (!Number.isFinite(numericRequested) || numericRequested < 0) {
        throw new DataServiceError(
          'Requested question counts must be valid numbers.',
          {
            context: { subslotId, requests },
          }
        );
      }
      if (baseCount + numericRequested > SUBSLOT_QUESTION_CAP) {
        throw new DataServiceError(
          'Requested pool exceeds the 1,750-question limit for a subslot.',
          {
            context: { subslotId, requested: numericRequested, baseCount },
          }
        );
      }

      const { data, error } = await client.rpc('fill_subslot_questions', {
        p_subslot_id: subslotId,
        p_requests: requests,
        p_replace: replace,
      });
      if (error) throw error;
      const { data: updated, error: updatedError } = await client
        .from('study_cycle_weeks')
        .select('question_count')
        .eq('id', subslotId)
        .single();
      if (updatedError) throw updatedError;
      if ((updated?.question_count ?? 0) > SUBSLOT_QUESTION_CAP) {
        throw new DataServiceError(
          'Subslot exceeded capacity after loading questions.',
          {
            context: { subslotId, question_count: updated?.question_count },
          }
        );
      }
      await refreshDailySchedule(client, current.study_cycle_id);
      await this.logAdminAudit(
        'fill_subslot_questions',
        'study_cycle_subslot',
        subslotId,
        {
          cycle_id: current.study_cycle_id,
          replace,
          requests,
        }
      );
      return data;
    } catch (error) {
      throw wrapError('Failed to populate subslot questions.', error, {
        subslotId,
      });
    }
  }

  async cloneSubslotPool(
    sourceSubslotId,
    targetSubslotId,
    { replace = true } = {}
  ) {
    const client = await ensureClient();
    try {
      const { data: target, error: targetError } = await client
        .from('study_cycle_weeks')
        .select('question_count, study_cycle_id')
        .eq('id', targetSubslotId)
        .single();
      if (targetError) throw targetError;
      const baseCount = replace ? 0 : (target?.question_count ?? 0);
      if (baseCount > SUBSLOT_QUESTION_CAP) {
        throw new DataServiceError(
          'Target subslot already exceeds the 1,750-question limit.',
          {
            context: { targetSubslotId, baseCount },
          }
        );
      }

      const { data, error } = await client.rpc('clone_subslot_pool', {
        p_source_subslot: sourceSubslotId,
        p_target_subslot: targetSubslotId,
        p_replace: replace,
      });
      if (error) throw error;
      const { data: updated, error: updatedError } = await client
        .from('study_cycle_weeks')
        .select('question_count')
        .eq('id', targetSubslotId)
        .single();
      if (updatedError) throw updatedError;
      if ((updated?.question_count ?? 0) > SUBSLOT_QUESTION_CAP) {
        throw new DataServiceError(
          'Cloning exceeded the 1,750-question limit for the subslot.',
          {
            context: {
              targetSubslotId,
              question_count: updated?.question_count,
            },
          }
        );
      }
      await refreshDailySchedule(client, target?.study_cycle_id || null);
      await this.logAdminAudit(
        'clone_subslot_pool',
        'study_cycle_subslot',
        targetSubslotId,
        {
          source_subslot_id: sourceSubslotId,
          target_cycle_id: target?.study_cycle_id || null,
          replace,
        }
      );
      return data;
    } catch (error) {
      throw wrapError('Failed to clone subslot pool.', error, {
        sourceSubslotId,
        targetSubslotId,
      });
    }
  }

  async getSubscriptionProducts() {
    const client = await ensureClient();
    try {
      const { data, error } = await client
        .from('subscription_products_with_plans')
        .select('*');
      if (error) throw error;
      if (!Array.isArray(data)) {
        return {};
      }
      return mapSupabaseSubscriptions(data);
    } catch (error) {
      throw wrapError('Failed to load subscription products.', error);
    }
  }

  async listSubscriptionProductsDetailed() {
    const client = await ensureClient();
    try {
      const { data, error } = await client
        .from('subscription_products')
        .select(
          'id, code, name, product_type, description, is_active, metadata, department_id, created_at, updated_at, department:departments(id, name, color_theme, slug), subscription_plans(*)'
        )
        .order('created_at', { ascending: false });
      if (error) throw error;
      return Array.isArray(data)
        ? data.map(buildSubscriptionProductDetailed)
        : [];
    } catch (error) {
      throw wrapError('Failed to fetch subscription products.', error);
    }
  }

  async createSubscriptionProduct({
    code,
    name,
    product_type = 'cbt',
    description = '',
    metadata = {},
    is_active = true,
    department_id = null,
  }) {
    const client = await ensureClient();
    try {
      const { data, error } = await client
        .from('subscription_products')
        .insert({
          code,
          name,
          product_type,
          description,
          metadata,
          is_active,
          department_id,
        })
        .select(
          'id, code, name, product_type, description, is_active, metadata, department_id, created_at, updated_at, department:departments(id, name, color_theme)'
        )
        .single();
      if (error) throw error;
      return buildSubscriptionProductDetailed({
        ...data,
        subscription_plans: [],
      });
    } catch (error) {
      throw wrapError('Failed to create subscription product.', error, {
        code,
      });
    }
  }

  async updateSubscriptionProduct(productId, updates) {
    const client = await ensureClient();
    const payload = {};
    if (updates.code !== undefined) payload.code = updates.code;
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.product_type !== undefined)
      payload.product_type = updates.product_type;
    if (updates.description !== undefined)
      payload.description = updates.description;
    if (updates.is_active !== undefined) payload.is_active = updates.is_active;
    if (updates.metadata !== undefined) payload.metadata = updates.metadata;
    if (updates.department_id !== undefined)
      payload.department_id = updates.department_id;
    if (!Object.keys(payload).length) {
      return null;
    }
    try {
      const { data, error } = await client
        .from('subscription_products')
        .update(payload)
        .eq('id', productId)
        .select(
          'id, code, name, product_type, description, is_active, metadata, department_id, created_at, updated_at, department:departments(id, name, color_theme), subscription_plans(*)'
        )
        .single();
      if (error) throw error;
      return buildSubscriptionProductDetailed(data);
    } catch (error) {
      throw wrapError('Failed to update subscription product.', error, {
        productId,
        payload,
      });
    }
  }

  async deleteSubscriptionProduct(productId) {
    const client = await ensureClient();
    try {
      const { error } = await client
        .from('subscription_products')
        .delete()
        .eq('id', productId);
      if (error) throw error;
      return true;
    } catch (error) {
      const message =
        typeof error?.message === 'string' ? error.message.toLowerCase() : '';
      const detail =
        typeof error?.details === 'string' ? error.details.toLowerCase() : '';

      if (
        (error?.code && String(error.code) === '23503') ||
        message.includes('foreign key') ||
        detail.includes('foreign key') ||
        message.includes('user_subscriptions') ||
        detail.includes('user_subscriptions')
      ) {
        throw new DataServiceError(
          'This product still has learners assigned to its plans. Move or end their subscriptions before deleting the product.',
          {
            cause: error,
            context: { productId },
          }
        );
      }

      throw wrapError('Failed to delete subscription product.', error, {
        productId,
      });
    }
  }

  async createSubscriptionPlan(productId, payload) {
    const client = await ensureClient();
    const insertPayload = {
      product_id: productId,
      code: payload.code,
      name: payload.name,
      price: payload.price,
      currency: payload.currency || 'NGN',
      questions: payload.questions ?? null,
      quizzes: payload.quizzes ?? null,
      participants: payload.participants ?? null,
      metadata: payload.metadata ?? {},
      is_active: payload.is_active ?? true,
      daily_question_limit: payload.daily_question_limit ?? 0,
      duration_days: payload.duration_days ?? 30,
      plan_tier: payload.plan_tier || null,
      quiz_duration_minutes: payload.quiz_duration_minutes ?? null,
    };
    try {
      const { data, error } = await client
        .from('subscription_plans')
        .insert(insertPayload)
        .select('*')
        .single();
      if (error) throw error;
      return buildSubscriptionPlan(data);
    } catch (error) {
      throw wrapError('Failed to create subscription plan.', error, {
        productId,
      });
    }
  }

  async updateSubscriptionPlan(planId, updates) {
    const client = await ensureClient();
    const payload = {};
    if (updates.code !== undefined) payload.code = updates.code;
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.price !== undefined) payload.price = updates.price;
    if (updates.currency !== undefined) payload.currency = updates.currency;
    if (updates.questions !== undefined) payload.questions = updates.questions;
    if (updates.quizzes !== undefined) payload.quizzes = updates.quizzes;
    if (updates.participants !== undefined)
      payload.participants = updates.participants;
    if (updates.metadata !== undefined) payload.metadata = updates.metadata;
    if (updates.is_active !== undefined) payload.is_active = updates.is_active;
    if (updates.daily_question_limit !== undefined)
      payload.daily_question_limit = updates.daily_question_limit;
    if (updates.duration_days !== undefined)
      payload.duration_days = updates.duration_days;
    if (updates.plan_tier !== undefined) payload.plan_tier = updates.plan_tier;
    if (updates.quiz_duration_minutes !== undefined)
      payload.quiz_duration_minutes = updates.quiz_duration_minutes;
    if (!Object.keys(payload).length) {
      return null;
    }
    try {
      const { data, error } = await client
        .from('subscription_plans')
        .update(payload)
        .eq('id', planId)
        .select('*')
        .single();
      if (error) throw error;
      return buildSubscriptionPlan(data);
    } catch (error) {
      throw wrapError('Failed to update subscription plan.', error, {
        planId,
        payload,
      });
    }
  }

  async deleteSubscriptionPlan(planId) {
    const client = await ensureClient();
    try {
      const { error } = await client
        .from('subscription_plans')
        .delete()
        .eq('id', planId);
      if (error) throw error;
      return true;
    } catch (error) {
      const message =
        typeof error?.message === 'string' ? error.message.toLowerCase() : '';
      const detail =
        typeof error?.details === 'string' ? error.details.toLowerCase() : '';

      if (
        (error?.code && String(error.code) === '23503') ||
        message.includes('foreign key') ||
        detail.includes('foreign key') ||
        message.includes('user_subscriptions') ||
        detail.includes('user_subscriptions')
      ) {
        throw new DataServiceError(
          'This plan is still assigned to learners. Move or end their subscriptions before deleting the plan.',
          {
            cause: error,
            context: { planId },
          }
        );
      }
      throw wrapError('Failed to delete subscription plan.', error, { planId });
    }
  }

  async deleteQuestion(questionId) {
    const client = await ensureClient();
    try {
      const { data: question, error: qError } = await client
        .from('questions')
        .select('image_url')
        .eq('id', questionId)
        .single();
      if (qError) throw qError;

      if (question.image_url) {
        const path = new URL(question.image_url).pathname
          .split('/question-images/')
          .pop();
        await client.storage.from('question-images').remove([path]);
      }

      const { error } = await client
        .from('questions')
        .delete()
        .eq('id', questionId);
      if (error) throw error;
      return true;
    } catch (error) {
      throw wrapError('Failed to delete question.', error, { questionId });
    }
  }

  async listFreeQuizzes() {
    const client = await ensureClient();
    try {
      const { data, error } = await client
        .from('free_quiz_metrics')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return Array.isArray(data) ? data.map(buildFreeQuiz) : [];
    } catch (error) {
      throw wrapError('Failed to load free quizzes.', error);
    }
  }

  async createFreeQuiz({
    title,
    description,
    intro,
    time_limit_seconds,
    is_active = true,
  }) {
    const client = await ensureClient();
    const payload = {
      title,
      description,
      intro,
      time_limit_seconds: time_limit_seconds
        ? Number(time_limit_seconds)
        : null,
      is_active,
      slug: slugify(title),
    };
    try {
      const { data, error } = await client
        .from('free_quizzes')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;
      return buildFreeQuiz(data);
    } catch (error) {
      throw wrapError('Failed to create free quiz.', error, { payload });
    }
  }

  async updateFreeQuiz(quizId, updates) {
    const client = await ensureClient();
    const payload = {};
    if (updates.title !== undefined) {
      payload.title = updates.title;
      payload.slug = slugify(updates.title);
    }
    if (updates.description !== undefined)
      payload.description = updates.description;
    if (updates.intro !== undefined) payload.intro = updates.intro;
    if (updates.time_limit_seconds !== undefined)
      payload.time_limit_seconds = updates.time_limit_seconds
        ? Number(updates.time_limit_seconds)
        : null;
    if (updates.is_active !== undefined) payload.is_active = updates.is_active;
    if (!Object.keys(payload).length) return null;
    try {
      const { data, error } = await client
        .from('free_quizzes')
        .update(payload)
        .eq('id', quizId)
        .select('*')
        .single();
      if (error) throw error;
      return buildFreeQuiz(data);
    } catch (error) {
      throw wrapError('Failed to update free quiz.', error, {
        quizId,
        payload,
      });
    }
  }

  async deleteFreeQuiz(quizId) {
    const client = await ensureClient();
    try {
      const { error } = await client
        .from('free_quizzes')
        .delete()
        .eq('id', quizId);
      if (error) throw error;
      return true;
    } catch (error) {
      throw wrapError('Failed to delete free quiz.', error, { quizId });
    }
  }

  async getFreeQuizDetail(quizId) {
    const client = await ensureClient();
    try {
      const { data, error } = await client
        .from('free_quizzes')
        .select(
          `*,
           free_quiz_questions (*, questions:question_id(id, stem, explanation, question_options(*)))
          `
        )
        .eq('id', quizId)
        .single();
      if (error) throw error;
      const quiz = buildFreeQuiz(data);
      const questions = Array.isArray(data?.free_quiz_questions)
        ? data.free_quiz_questions
            .map((row) => buildFreeQuizQuestion(row))
            .sort((a, b) => a.order_index - b.order_index)
        : [];
      return { quiz, questions };
    } catch (error) {
      throw wrapError('Failed to load free quiz details.', error, { quizId });
    }
  }

  async uploadFreeQuizImage(file, quizId) {
    if (!file) return null;
    const client = await ensureClient();
    const fileExt = file.name?.split('.').pop() || 'png';
    const uniqueId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const fileName = `${quizId}/${uniqueId}.${fileExt}`;
    const { error } = await client.storage
      .from(FREE_QUIZ_IMAGE_BUCKET)
      .upload(`free-quiz/${fileName}`, file, {
        cacheControl: '3600',
        upsert: false,
      });
    if (error) throw error;
    const { data: publicUrl } = client.storage
      .from(FREE_QUIZ_IMAGE_BUCKET)
      .getPublicUrl(`free-quiz/${fileName}`);
    return publicUrl?.publicUrl || null;
  }

  async createFreeQuizQuestion({
    quizId,
    prompt,
    explanation,
    imageFile,
    options,
    correctOption,
  }) {
    const client = await ensureClient();
    const storageUpload = imageFile
      ? await this.uploadFreeQuizImage(imageFile, quizId)
      : null;
    const { count: existingCount } = await client
      .from('free_quiz_questions')
      .select('id', { count: 'exact', head: true })
      .eq('free_quiz_id', quizId);
    const payload = {
      free_quiz_id: quizId,
      prompt,
      explanation: explanation || null,
      image_url: storageUpload,
      options,
      correct_option: correctOption,
      order_index: Number(existingCount ?? 0),
    };
    try {
      const { data, error } = await client
        .from('free_quiz_questions')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;
      return buildFreeQuizQuestion(data);
    } catch (error) {
      throw wrapError('Failed to create free quiz question.', error, {
        quizId,
        prompt,
      });
    }
  }

  async importFreeQuizQuestionFromBank({ quizId, questionId }) {
    const client = await ensureClient();
    try {
      const { data: question, error: qError } = await client
        .from('questions')
        .select(
          'id, stem, explanation, image_url, question_options(id, label, content, is_correct, order_index)'
        )
        .eq('id', questionId)
        .single();
      if (qError) throw qError;
      if (!question) {
        throw new DataServiceError('Question not found in bank.');
      }
      const options = (question.question_options || []).map((option) => ({
        id: option.id,
        label: option.label,
        content: option.content,
      }));
      const correctOption = (question.question_options || []).find(
        (opt) => opt.is_correct
      )?.id;
      if (!correctOption) {
        throw new DataServiceError(
          'Selected question does not have a correct answer flagged.'
        );
      }
      const { count: existingCount } = await client
        .from('free_quiz_questions')
        .select('id', { count: 'exact', head: true })
        .eq('free_quiz_id', quizId);

      const payload = {
        free_quiz_id: quizId,
        question_id: question.id,
        prompt: question.stem,
        explanation: question.explanation,
        image_url: question.image_url,
        options,
        correct_option: correctOption,
        order_index: Number(existingCount ?? 0),
      };
      const { data, error } = await client
        .from('free_quiz_questions')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;
      return buildFreeQuizQuestion(data);
    } catch (error) {
      throw wrapError('Failed to import question from bank.', error, {
        quizId,
        questionId,
      });
    }
  }

  async deleteFreeQuizQuestion(questionId) {
    const client = await ensureClient();
    try {
      const { error } = await client
        .from('free_quiz_questions')
        .delete()
        .eq('id', questionId);
      if (error) throw error;
      return true;
    } catch (error) {
      throw wrapError('Failed to delete free quiz question.', error, {
        questionId,
      });
    }
  }

  async reorderFreeQuizQuestions(quizId, questionOrder) {
    if (!Array.isArray(questionOrder) || !questionOrder.length) return true;
    const client = await ensureClient();
    const updates = questionOrder.map((item, index) => ({
      id: item,
      order_index: index,
    }));
    try {
      const { error } = await client
        .from('free_quiz_questions')
        .upsert(updates, { onConflict: 'id' });
      if (error) throw error;
      await client
        .from('free_quizzes')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', quizId);
      return true;
    } catch (error) {
      throw wrapError('Failed to reorder free quiz questions.', error, {
        quizId,
      });
    }
  }

  async importFreeQuizQuestionsFromAiken({ quizId, file }) {
    if (!file) {
      throw new DataServiceError('Please choose a file to import.');
    }
    const client = await ensureClient();
    try {
      const text = await file.text();
      const parsed = parseAikenContent(text);
      const meta = parsed?.meta || {};
      const skippedCount = Array.isArray(meta.skipped)
        ? meta.skipped.length
        : 0;
      const parseIssues = Array.isArray(meta.errors) ? meta.errors : [];

      if (!Array.isArray(parsed) || !parsed.length) {
        throw new DataServiceError(
          'No valid questions were found. Check the formatting and try again.'
        );
      }
      const { count: existingCount } = await client
        .from('free_quiz_questions')
        .select('id', { count: 'exact', head: true })
        .eq('free_quiz_id', quizId);
      const baseIndex = Number(existingCount ?? 0);
      const batches = parsed.map((entry, index) => {
        const options = entry.options.map((option) => ({
          id: option.label,
          label: option.label,
          content: option.content,
        }));
        const correctOption = entry.options.find((opt) => opt.isCorrect)?.label;
        if (!correctOption) {
          throw new DataServiceError(
            'A question is missing a correct answer.',
            {
              context: { prompt: entry.stem, position: index + 1 },
            }
          );
        }
        return {
          free_quiz_id: quizId,
          prompt: entry.stem,
          explanation: entry.explanation || null,
          image_url: null,
          options,
          correct_option: correctOption,
          order_index: baseIndex + index,
        };
      });

      const { data, error } = await client
        .from('free_quiz_questions')
        .insert(batches)
        .select('*');
      if (error) throw error;
      const records = Array.isArray(data)
        ? data.map(buildFreeQuizQuestion)
        : [];
      return {
        insertedCount: records.length,
        skippedCount,
        parseErrors: parseIssues,
        records,
      };
    } catch (error) {
      throw wrapError('Failed to import questions from Aiken file.', error, {
        quizId,
        fileName: file?.name,
      });
    }
  }

  async importAikenQuestions(topicId, fileContent) {
    if (!topicId) {
      throw new DataServiceError(
        'Topic is required before uploading questions.'
      );
    }

    let parsed;
    let parseMeta = {};
    try {
      parsed = parseAikenContent(fileContent);
      parseMeta = parsed?.meta || {};
    } catch (error) {
      if (error instanceof DataServiceError) {
        throw error;
      }
      throw new DataServiceError('Unable to parse Aiken file.', {
        cause: error,
      });
    }

    const formatIssueCount = Array.isArray(parseMeta.skipped)
      ? parseMeta.skipped.length
      : 0;
    const parseIssues = Array.isArray(parseMeta.errors) ? parseMeta.errors : [];

    const client = await ensureClient();

    try {
      const { data: topic, error: topicError } = await client
        .from('topics')
        .select('id, question_count')
        .eq('id', topicId)
        .maybeSingle();
      if (topicError) throw topicError;
      if (!topic) {
        throw new DataServiceError(
          'Topic not found. It may have been removed.'
        );
      }

      const { data: existingQuestions, error: existingError } = await client
        .from('questions')
        .select('stem')
        .eq('topic_id', topicId);
      if (existingError) throw existingError;

      const existingStemSet = new Set(
        (existingQuestions || [])
          .map((row) => normalizeStemText(row.stem))
          .filter(Boolean)
      );

      const batchStemSet = new Set();
      const dedupedQuestions = [];
      const duplicates = [];

      parsed.forEach((question, originalIndex) => {
        const normalizedStem = normalizeStemText(question?.stem);
        if (!normalizedStem) {
          duplicates.push({
            stem: question?.stem || '',
            index: originalIndex,
            reason: 'empty-stem',
          });
          return;
        }
        if (
          existingStemSet.has(normalizedStem) ||
          batchStemSet.has(normalizedStem)
        ) {
          duplicates.push({ stem: question.stem, index: originalIndex });
          return;
        }
        batchStemSet.add(normalizedStem);
        dedupedQuestions.push({ question, originalIndex });
      });

      const duplicateCount = duplicates.length;
      const skippedCount = formatIssueCount + duplicateCount;

      if (!dedupedQuestions.length) {
        return {
          insertedCount: 0,
          skippedCount,
          duplicateCount,
          duplicates,
          parseErrors: parseIssues,
        };
      }

      const questionPayloads = dedupedQuestions.map(({ question }) => ({
        topic_id: topicId,
        question_type: 'multiple_choice_single',
        stem: question.stem.trim(),
        explanation: null,
        metadata: {},
      }));

      const { data: insertedQuestions, error: questionError } = await client
        .from('questions')
        .insert(questionPayloads)
        .select('id');
      if (questionError) throw questionError;
      if (
        !Array.isArray(insertedQuestions) ||
        insertedQuestions.length !== dedupedQuestions.length
      ) {
        throw new Error('Supabase returned an unexpected insert response.');
      }

      const optionPayloads = insertedQuestions.flatMap((row, index) => {
        const source = dedupedQuestions[index]?.question;
        if (!source) return [];
        return source.options.map((option) => ({
          question_id: row.id,
          label: option.label,
          content: option.content,
          is_correct: option.isCorrect,
          order_index: option.order,
        }));
      });

      if (optionPayloads.length) {
        const { error: optionError } = await client
          .from('question_options')
          .insert(optionPayloads);
        if (optionError) throw optionError;
      }

      const { error: updateError } = await client
        .from('topics')
        .update({
          question_count:
            Number(topic.question_count ?? 0) + dedupedQuestions.length,
        })
        .eq('id', topicId);
      if (updateError) throw updateError;

      return {
        insertedCount: dedupedQuestions.length,
        skippedCount,
        duplicateCount,
        duplicates,
        parseErrors: parseIssues,
      };
    } catch (error) {
      if (error instanceof DataServiceError) {
        throw error;
      }
      throw wrapError('Failed to import Aiken questions.', error, { topicId });
    }
  }

  previewAikenContent(content) {
    try {
      return parseAikenContent(content, { captureDiagnostics: true });
    } catch (error) {
      if (error instanceof DataServiceError) {
        throw error;
      }
      throw new DataServiceError('Unable to parse Aiken content.', {
        cause: error,
      });
    }
  }

  async getExtraQuestionSet(setId) {
    if (!setId) return null;
    const client = await ensureClient();
    try {
      const { data, error } = await client
        .from('extra_question_sets')
        .select(
          'id, title, description, visibility_rules, starts_at, ends_at, is_active, question_count, time_limit_seconds, max_attempts_per_user, assignment_rules, created_at, updated_at'
        )
        .eq('id', setId)
        .maybeSingle();
      if (error) throw error;
      return data ? buildExtraQuestionSet(data) : null;
    } catch (error) {
      if (isMissingColumnError(error, 'time_limit_seconds')) {
        const { data, error: fallbackError } = await client
          .from('extra_question_sets')
          .select(
            'id, title, description, visibility_rules, starts_at, ends_at, is_active, question_count, created_at, updated_at'
          )
          .eq('id', setId)
          .maybeSingle();
        if (fallbackError) {
          throw wrapError(
            'Failed to load the extra question set.',
            fallbackError,
            {
              setId,
            }
          );
        }
        return data
          ? buildExtraQuestionSet({ ...data, time_limit_seconds: null })
          : null;
      }
      throw wrapError('Failed to load the extra question set.', error, {
        setId,
      });
    }
  }

  async listExtraQuestionSets() {
    const client = await ensureClient();
    try {
      const { data, error } = await client
        .from('extra_question_sets')
        .select(
          'id, title, description, visibility_rules, starts_at, ends_at, is_active, question_count, time_limit_seconds, max_attempts_per_user, assignment_rules, created_at, updated_at'
        )
        .order('created_at', { ascending: false });
      if (error) throw error;
      return Array.isArray(data) ? data.map(buildExtraQuestionSet) : [];
    } catch (error) {
      if (
        isMissingColumnError(error, 'time_limit_seconds') ||
        isMissingColumnError(error, 'assignment_rules') ||
        isMissingColumnError(error, 'max_attempts_per_user')
      ) {
        const { data, error: fallbackError } = await client
          .from('extra_question_sets')
          .select(
            'id, title, description, visibility_rules, starts_at, ends_at, is_active, question_count, created_at, updated_at'
          )
          .order('created_at', { ascending: false });
        if (fallbackError) {
          throw wrapError('Failed to load extra question sets.', fallbackError);
        }
        return Array.isArray(data)
          ? data.map((row) =>
              buildExtraQuestionSet({
                ...row,
                time_limit_seconds: null,
                assignment_rules: DEFAULT_ASSIGNMENT_RULES,
                max_attempts_per_user: null,
              })
            )
          : [];
      }
      throw wrapError('Failed to load extra question sets.', error);
    }
  }

  async createExtraQuestionSet(payload) {
    const prepared = prepareExtraQuestionSetPayload(payload);
    if (!prepared.title) {
      throw new DataServiceError(
        'A title is required before creating an extra question set.'
      );
    }

    const client = await ensureClient();
    try {
      const { data, error } = await client
        .from('extra_question_sets')
        .insert({
          ...prepared,
          question_count: 0,
        })
        .select('*')
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new Error(
          'Supabase returned an empty response for the new extra question set.'
        );
      }
      return buildExtraQuestionSet(data);
    } catch (error) {
      if (error instanceof DataServiceError) {
        throw error;
      }
      if (isMissingColumnError(error, 'time_limit_seconds')) {
        throw new DataServiceError(
          'Unable to create extra question set because the database is missing the new time limit column. Run the latest Supabase migration (20251205131000_extra_question_time_limit.sql) and try again.'
        );
      }
      if (
        isMissingColumnError(error, 'assignment_rules') ||
        isMissingColumnError(error, 'max_attempts_per_user')
      ) {
        throw new DataServiceError(
          'Unable to create extra question set because the database is missing the bonus question rule columns. Run the latest Supabase migration (20251215102000_extra_question_rules.sql) and try again.'
        );
      }
      throw wrapError('Unable to create extra question set.', error, {
        title: prepared.title,
      });
    }
  }

  async updateExtraQuestionSet(setId, updates = {}) {
    if (!setId) {
      throw new DataServiceError('Extra question set id is required.');
    }

    const payload = {};
    if (updates.title !== undefined) {
      const title =
        typeof updates.title === 'string' ? updates.title.trim() : '';
      if (!title) {
        throw new DataServiceError('Title cannot be empty.');
      }
      payload.title = title;
    }
    if (updates.description !== undefined) {
      payload.description =
        typeof updates.description === 'string' && updates.description.trim()
          ? updates.description.trim()
          : null;
    }
    if (updates.starts_at !== undefined || updates.startsAt !== undefined) {
      payload.starts_at = sanitizeDateInput(
        updates.starts_at ?? updates.startsAt
      );
    }
    if (updates.ends_at !== undefined || updates.endsAt !== undefined) {
      payload.ends_at = sanitizeDateInput(updates.ends_at ?? updates.endsAt);
    }
    if (updates.is_active !== undefined || updates.isActive !== undefined) {
      payload.is_active = Boolean(updates.is_active ?? updates.isActive);
    }
    if (
      updates.time_limit_seconds !== undefined ||
      updates.time_limit_minutes !== undefined ||
      updates.time_limit !== undefined
    ) {
      const hasSeconds = updates.time_limit_seconds !== undefined;
      const rawTimeLimit = hasSeconds
        ? updates.time_limit_seconds
        : (updates.time_limit_minutes ?? updates.time_limit);
      if (
        rawTimeLimit === null ||
        rawTimeLimit === '' ||
        rawTimeLimit === undefined
      ) {
        payload.time_limit_seconds = null;
      } else {
        const numeric = Number(rawTimeLimit);
        payload.time_limit_seconds =
          Number.isFinite(numeric) && numeric > 0
            ? hasSeconds
              ? Math.round(numeric)
              : Math.round(numeric * 60)
            : null;
      }
    }
    if (
      updates.visibility !== undefined ||
      updates.visibility_rules !== undefined
    ) {
      payload.visibility_rules = normalizeExtraVisibilityRules(
        updates.visibility || updates.visibility_rules
      );
    }

    if (!Object.keys(payload).length) {
      return this.getExtraQuestionSet(setId);
    }

    const client = await ensureClient();
    try {
      const { data, error } = await client
        .from('extra_question_sets')
        .update(payload)
        .eq('id', setId)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new DataServiceError('Extra question set not found.');
      }
      return buildExtraQuestionSet(data);
    } catch (error) {
      if (isMissingColumnError(error, 'time_limit_seconds')) {
        throw new DataServiceError(
          'Unable to update the extra question set because the database is missing the new time limit column. Run the latest Supabase migration (20251205131000_extra_question_time_limit.sql) and try again.'
        );
      }
      if (
        isMissingColumnError(error, 'assignment_rules') ||
        isMissingColumnError(error, 'max_attempts_per_user')
      ) {
        throw new DataServiceError(
          'Unable to update the extra question set because the database is missing the bonus question rule columns. Run the latest Supabase migration (20251215102000_extra_question_rules.sql) and try again.'
        );
      }
      if (error instanceof DataServiceError) {
        throw error;
      }
      throw wrapError('Unable to update extra question set.', error, {
        setId,
        updates,
      });
    }
  }

  async deleteExtraQuestionSet(setId) {
    if (!setId) {
      throw new DataServiceError('Extra question set id is required.');
    }
    const client = await ensureClient();
    try {
      const { error } = await client
        .from('extra_question_sets')
        .delete()
        .eq('id', setId);
      if (error) throw error;
    } catch (error) {
      throw wrapError('Failed to delete extra question set.', error, {
        setId,
      });
    }
  }

  async listExtraQuestions(setId) {
    if (!setId) {
      throw new DataServiceError('Select an extra question set first.');
    }

    const client = await ensureClient();
    try {
      const { data, error } = await client
        .from('extra_questions')
        .select(
          `id, set_id, stem, explanation, metadata, created_at, updated_at,
           extra_question_options(id, question_id, label, content, is_correct, order_index)`
        )
        .eq('set_id', setId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return Array.isArray(data) ? data.map(buildExtraQuestion) : [];
    } catch (error) {
      throw wrapError(
        'Failed to load extra questions for the selected set.',
        error,
        {
          setId,
        }
      );
    }
  }

  async deleteExtraQuestion(setId, questionId) {
    if (!setId || !questionId) {
      throw new DataServiceError('Both set id and question id are required.');
    }
    const client = await ensureClient();
    try {
      const { error } = await client
        .from('extra_questions')
        .delete()
        .eq('id', questionId)
        .eq('set_id', setId);
      if (error) throw error;
      await refreshExtraQuestionSetCount(client, setId);
    } catch (error) {
      throw wrapError('Unable to delete the extra question.', error, {
        setId,
        questionId,
      });
    }
  }

  async importExtraQuestionsFromAiken(setId, fileContent) {
    if (!setId) {
      throw new DataServiceError(
        'Select or create an extra question set before uploading questions.'
      );
    }

    let parsed;
    let parseMeta = {};
    try {
      parsed = parseAikenContent(fileContent);
      parseMeta = parsed?.meta || {};
    } catch (error) {
      if (error instanceof DataServiceError) {
        throw error;
      }
      throw new DataServiceError('Unable to parse Aiken content.', {
        cause: error,
      });
    }

    const skippedCount = Array.isArray(parseMeta.skipped)
      ? parseMeta.skipped.length
      : 0;
    const parseIssues = Array.isArray(parseMeta.errors) ? parseMeta.errors : [];

    const client = await ensureClient();

    try {
      const { data: setRow, error: fetchError } = await client
        .from('extra_question_sets')
        .select('id')
        .eq('id', setId)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!setRow) {
        throw new DataServiceError('Extra question set not found.');
      }

      const questionPayloads = parsed.map((question) => ({
        set_id: setId,
        stem: question.stem.trim(),
        explanation: null,
        metadata: {},
      }));

      const { data: insertedQuestions, error: insertError } = await client
        .from('extra_questions')
        .insert(questionPayloads)
        .select('id');
      if (insertError) throw insertError;
      if (
        !Array.isArray(insertedQuestions) ||
        insertedQuestions.length !== parsed.length
      ) {
        throw new Error('Supabase returned an unexpected insert response.');
      }

      const optionPayloads = insertedQuestions.flatMap((row, index) => {
        const source = parsed[index];
        return source.options.map((option) => ({
          question_id: row.id,
          label: option.label,
          content: option.content,
          is_correct: option.isCorrect,
          order_index: option.order,
        }));
      });

      if (optionPayloads.length) {
        const { error: optionError } = await client
          .from('extra_question_options')
          .insert(optionPayloads);
        if (optionError) throw optionError;
      }

      await refreshExtraQuestionSetCount(client, setId);

      return {
        insertedCount: parsed.length,
        skippedCount,
        parseErrors: parseIssues,
      };
    } catch (error) {
      if (error instanceof DataServiceError) {
        throw error;
      }
      throw wrapError('Failed to import extra questions.', error, { setId });
    }
  }

  async listQuestions(topicId) {
    const client = await ensureClient();
    try {
      const { data, error } = await client
        .from('questions')
        .select(
          `id, topic_id, question_type, stem, explanation, created_at, updated_at,
           question_options(id, label, content, is_correct, order_index)`
        )
        .eq('topic_id', topicId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return Array.isArray(data) ? data.map(buildQuestion) : [];
    } catch (error) {
      throw wrapError(
        'Failed to load questions for the selected topic.',
        error,
        { topicId }
      );
    }
  }

  async createQuestion(
    topicId,
    {
      stem,
      explanation = '',
      question_type = 'multiple_choice_single',
      options = [],
      imageFile = null,
    }
  ) {
    const client = await ensureClient();
    try {
      const { data: inserted, error } = await client
        .from('questions')
        .insert({
          topic_id: topicId,
          question_type,
          stem,
          explanation,
          metadata: {},
        })
        .select('id, topic_id')
        .single();
      if (error) throw error;

      let imageUrl = null;
      if (imageFile) {
        const filePath = `question-images/${topicId}/${inserted.id}-${imageFile.name}`;
        const { error: uploadError } = await client.storage
          .from('question-images')
          .upload(filePath, imageFile);
        if (uploadError) throw uploadError;
        const { data: publicUrlData } = client.storage
          .from('question-images')
          .getPublicUrl(filePath);
        imageUrl = publicUrlData.publicUrl;

        const { error: updateError } = await client
          .from('questions')
          .update({ image_url: imageUrl })
          .eq('id', inserted.id);
        if (updateError) throw updateError;
      }

      const formattedOptions = Array.isArray(options)
        ? options.map((option, index) => ({
            question_id: inserted.id,
            label: option.label || String.fromCharCode(65 + index),
            content: option.content,
            is_correct: Boolean(option.isCorrect),
            order_index: option.order ?? index,
          }))
        : [];

      if (formattedOptions.length) {
        const { error: optionError } = await client
          .from('question_options')
          .insert(formattedOptions);
        if (optionError) throw optionError;
      }

      await refreshTopicQuestionCount(client, topicId);

      const { data: finalQuestion, error: finalError } = await client
        .from('questions')
        .select('*, question_options(*)')
        .eq('id', inserted.id)
        .single();

      if (finalError) throw finalError;

      return buildQuestion(finalQuestion);
    } catch (error) {
      throw wrapError('Failed to create question.', error, { topicId });
    }
  }

  async listProfiles() {
    const client = await ensureClient();
    try {
      const { data, error } = await client
        .from('profiles')
        .select(
          `
          *,
          departments (name),
          user_subscriptions!user_subscriptions_user_id_fkey (
            id,
            status,
            plan_id,
            started_at,
            expires_at,
            purchased_at,
            quantity,
            renewed_from_subscription_id,
            subscription_plans (
              id,
              name,
              code,
              price,
              currency,
              daily_question_limit,
              duration_days,
              plan_tier,
              subscription_products (
                id,
                name,
                department_id,
                departments (
                  id,
                  name,
                  slug,
                  color_theme
                )
              )
            )
          )
        `
        )
        .order('created_at', { ascending: false });
      if (error) throw error;
      return Array.isArray(data) ? data.map(buildProfileRow) : [];
    } catch (error) {
      throw wrapError('Failed to fetch profiles.', error);
    }
  }

  async listInactiveLearners({ daysWithoutActivity = 14, limit = 10 } = {}) {
    const client = await ensureClient();
    const safeDays =
      Number.isFinite(daysWithoutActivity) && daysWithoutActivity > 0
        ? Math.min(Math.floor(daysWithoutActivity), 365)
        : 14;
    const safeLimit =
      Number.isFinite(limit) && limit > 0
        ? Math.min(Math.floor(limit), 200)
        : 10;
    const thresholdDate = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
    const thresholdIso = thresholdDate.toISOString();
    const relevantStatuses = new Set(['active', 'trialing', 'past_due']);

    try {
      const baseQuery = client
        .from('profiles')
        .select(
          `
          *,
          departments (name),
          user_subscriptions!user_subscriptions_user_id_fkey (
            id,
            status,
            plan_id,
            started_at,
            expires_at,
            purchased_at,
            quantity,
            renewed_from_subscription_id,
            subscription_plans (
              id,
              name,
              code,
              price,
              currency,
              daily_question_limit,
              duration_days,
              plan_tier,
              subscription_products (
                id,
                name,
                department_id,
                departments (
                  id,
                  name,
                  slug,
                  color_theme
                )
              )
            )
          )
        `
        )
        .eq('role', 'learner')
        .order('last_seen_at', { ascending: true, nullsFirst: true })
        .limit(safeLimit);

      const { data, error } = await baseQuery.or(
        `last_seen_at.is.null,last_seen_at.lt.${thresholdIso}`
      );
      if (error) throw error;
      if (!Array.isArray(data)) {
        return [];
      }

      return data.map(buildProfileRow).filter((profile) => {
        if (!profile) return false;
        if (!profile.plan_id) return false;
        const subStatus = (profile.status || '').toLowerCase();
        if (relevantStatuses.has(subStatus)) return true;
        const billingStatus = (profile.subscription_status || '').toLowerCase();
        if (billingStatus && relevantStatuses.has(billingStatus)) return true;
        return false;
      });
    } catch (error) {
      throw wrapError('Failed to fetch inactive learners.', error, {
        daysWithoutActivity: safeDays,
        limit: safeLimit,
      });
    }
  }

  async listPlanLearners(planId, { includeInactive = false } = {}) {
    if (!planId) {
      return [];
    }
    const client = await ensureClient();
    const activeStatuses = ['trialing', 'active', 'past_due'];

    try {
      let query = client
        .from('user_subscriptions')
        .select(
          `
            id,
            user_id,
            status,
            started_at,
            expires_at,
            purchased_at,
            price,
            currency,
            profiles!inner (
              id,
              full_name,
              email,
              username,
              last_seen_at
            )
          `
        )
        .eq('plan_id', planId)
        .order('last_seen_at', {
          referencedTable: 'profiles',
          ascending: true,
          nullsFirst: true,
        })
        .order('started_at', { ascending: true });

      if (!includeInactive) {
        query = query.in('status', activeStatuses);
      }

      const { data, error } = await query;
      if (error) throw error;
      return Array.isArray(data)
        ? data.map(buildPlanLearner).filter(Boolean)
        : [];
    } catch (error) {
      throw wrapError('Failed to load learners for plan.', error, { planId });
    }
  }

  async updateProfileRole(profileId, role) {
    const client = await ensureClient();
    try {
      const { data, error } = await client
        .from('profiles')
        .update({ role })
        .eq('id', profileId)
        .select('id, full_name, role, created_at, updated_at, last_seen_at')
        .single();
      if (error) throw error;
      return buildProfileRow(data);
    } catch (error) {
      throw wrapError('Failed to update profile role.', error, {
        profileId,
        role,
      });
    }
  }

  async upsertProfile({ id, full_name, role = 'learner' }) {
    const client = await ensureClient();
    try {
      const { data, error } = await client
        .from('profiles')
        .upsert({ id, full_name, role }, { onConflict: 'id' })
        .select('id, full_name, role, created_at, updated_at, last_seen_at')
        .single();
      if (error) throw error;
      return buildProfileRow(data);
    } catch (error) {
      throw wrapError('Failed to upsert profile.', error, { id, role });
    }
  }

  async listGlobalAnnouncements({ limit = 5 } = {}) {
    const client = await ensureClient();
    const safeLimit =
      Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 50) : 5;

    try {
      const { data, error } = await client
        .from('global_announcements')
        .select('id, message, is_active, created_at, created_by')
        .order('created_at', { ascending: false })
        .limit(safeLimit);
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    } catch (error) {
      throw wrapError('Failed to load global announcements.', error, {
        limit: safeLimit,
      });
    }
  }

  async createGlobalAnnouncement({ message, isActive = true }) {
    const client = await ensureClient();
    const trimmed = typeof message === 'string' ? message.trim() : '';
    if (!trimmed) {
      throw wrapError(
        'Announcement message is required.',
        new Error('Validation error'),
        { message }
      );
    }

    try {
      const { data, error } = await client
        .from('global_announcements')
        .insert({
          message: trimmed,
          is_active: Boolean(isActive),
        })
        .select('id, message, is_active, created_at, created_by')
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      throw wrapError('Failed to publish announcement.', error, { message });
    }
  }

  async generateBulkCredentials({
    planId,
    departmentId,
    quantity,
    expiresAt,
    usernamePrefix,
  }) {
    const client = await ensureClient();
    try {
      const { data, error } = await client.functions.invoke(
        'generate-bulk-accounts',
        {
          body: {
            planId,
            departmentId,
            quantity,
            expiresAt,
            usernamePrefix,
          },
        }
      );
      if (error) throw error;
      return Array.isArray(data?.accounts) ? data.accounts : [];
    } catch (error) {
      throw wrapError('Failed to generate bulk credentials.', error, {
        planId,
        departmentId,
        quantity,
      });
    }
  }

  async adminUpdateUser({
    userId,
    email,
    username,
    password,
    departmentId,
    planId,
    planExpiresAt,
    fullName,
  }) {
    const client = await ensureClient();
    try {
      const { data, error } = await client.functions.invoke(
        'admin-update-user',
        {
          body: {
            userId,
            email,
            username,
            password,
            departmentId,
            planId,
            planExpiresAt,
            fullName,
          },
        }
      );
      if (error) throw error;
      return data;
    } catch (error) {
      throw wrapError('Failed to update user account.', error, {
        userId,
        planId,
      });
    }
  }
}

export const dataService = new DataService();

export const __userSubscriptionHelpers = {
  getUserSubscriptionStatus,
  normalizeUserSubscription,
  compareNormalizedSubscriptions,
};

export { buildCycleTimeline };

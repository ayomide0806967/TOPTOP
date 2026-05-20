import { apiFetch } from '../../../shared/apiClient.js';

const SUBSLOT_DAY_SPAN = 7;
const DAILY_QUESTION_TARGET = 250;

const OPTION_PATTERN = /^([A-Z])(?:\s*[.):-])\s*(.+)$/i;
const ANSWER_DIRECTIVE_PATTERN =
  /^(?:ANS(?:WER)?|CORRECT\s+ANSWER|ANSWER\s+KEY)\s*[:=]\s*(.+)$/i;
const QUESTION_NUMBER_PREFIX_PATTERN = /^\d+\s*[).:-]\s+/;

export class DataServiceError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'DataServiceError';
    if (options.cause) this.cause = options.cause;
    if (options.context) this.context = options.context;
  }
}

function parseISODateString(value) {
  if (!value) return null;
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatISODateUTC(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
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
  if (explicitStart) return explicitStart;
  const cycleStart = parseISODateString(cycle.start_date);
  if (!cycleStart) return null;
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
    if (daySpan <= 0) return;

    const startDate = getSubslotStartDate(cycle, subslot, subslotPosition);
    const distribution = new Map();
    (Array.isArray(subslot.distribution) ? subslot.distribution : []).forEach(
      (entry) => {
        distribution.set(
          Number(entry?.day_offset ?? 0),
          Number(entry?.count ?? 0)
        );
      }
    );

    for (let offset = 0; offset < daySpan; offset += 1) {
      const date = startDate ? addDaysUTC(startDate, offset) : null;
      const count = distribution.get(offset) ?? 0;
      const missing = Math.max(DAILY_QUESTION_TARGET - count, 0);
      if (!date) unscheduledDays += 1;
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
        is_filled: count >= DAILY_QUESTION_TARGET,
        is_underfilled: count > 0 && count < DAILY_QUESTION_TARGET,
        is_empty: count === 0,
        missing_questions: missing,
      });

      if (date) lastDate = date;
    }
  });

  return {
    cycle_id: cycle.id,
    cycle_title: cycle.title,
    cycle_status: cycle.status,
    start_date: cycle.start_date || null,
    end_date: lastDate ? formatISODateUTC(lastDate) : null,
    total_days: days.length,
    filled_days: days.filter((day) => day.is_filled).length,
    underfilled_days: days.filter((day) => day.is_underfilled).length,
    empty_days: days.filter((day) => day.is_empty).length,
    unscheduled_days: unscheduledDays,
    missing_questions: missingQuestions,
    days,
  };
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
  if (weightA !== weightB) return weightA - weightB;
  const expiresA = a.expires_at
    ? new Date(a.expires_at).getTime()
    : Number.POSITIVE_INFINITY;
  const expiresB = b.expires_at
    ? new Date(b.expires_at).getTime()
    : Number.POSITIVE_INFINITY;
  if (expiresA !== expiresB) return expiresA - expiresB;
  const startedA = a.started_at ? new Date(a.started_at).getTime() : 0;
  const startedB = b.started_at ? new Date(b.started_at).getTime() : 0;
  return startedB - startedA;
}

function buildProfileRow(row) {
  if (!row) return null;
  const normalizedSubscriptions = (
    Array.isArray(row.user_subscriptions) ? row.user_subscriptions : []
  )
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
  } else if (hasEverSubscribed) {
    statusBucket = 'expired';
  }

  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    username: row.username,
    role: row.role,
    last_seen_at: row.last_seen_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    status:
      primarySubscription?.status ||
      row.subscription_status ||
      (hasEverSubscribed ? 'inactive' : 'no_plan'),
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

function stripQuestionPrefix(value) {
  return value.replace(QUESTION_NUMBER_PREFIX_PATTERN, '').trim();
}

function normalizeOptionText(value) {
  return (value || '').toString().trim().replace(/\s+/g, ' ').toLowerCase();
}

function appendLine(current, line) {
  return current ? `${current}\n${line}` : line;
}

function parseAikenContent(content, options = {}) {
  const { captureDiagnostics = false } = options;
  if (!content || !content.trim()) {
    throw new DataServiceError('The uploaded file is empty.');
  }

  const lines = content
    .replace(/\uFEFF/g, '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const questions = [];
  const diagnostics = captureDiagnostics ? [] : null;
  const skipped = [];
  const parseErrors = [];
  let current = null;

  const recordGlobalIssue = (message, context = {}) => {
    parseErrors.push({ message, ...context });
  };
  const recordCurrentIssue = (message, context = {}) => {
    if (!current) {
      recordGlobalIssue(message, context);
      return;
    }
    current.issues.push({ message, ...context });
  };
  const startNewQuestion = (line, lineNumber) => {
    current = {
      stem: stripQuestionPrefix(line),
      options: [],
      startLine: lineNumber,
      lastLine: lineNumber,
      issues: [],
    };
  };
  const finalizeCurrentQuestion = (endLineNumber) => {
    if (!current) return;
    const resolvedEndLine = endLineNumber ?? current.lastLine;
    const resolvedOptions = current.options
      .map((option, index) => ({
        label: option.label,
        content: option.content.trim(),
        isCorrect: Boolean(option.isCorrect),
        order: index,
      }))
      .filter((option) => option.content);

    if (!current.stem.trim()) {
      current.issues.push({
        message: 'Question text is empty.',
        lineNumber: current.startLine,
      });
    }
    if (resolvedOptions.length < 2) {
      current.issues.push({
        message: 'Each question must include at least two options.',
        lineNumber: current.startLine,
      });
    }
    if (!resolvedOptions.some((option) => option.isCorrect)) {
      current.issues.push({
        message:
          'Each question must specify a correct answer via the ANSWER directive.',
        lineNumber: resolvedEndLine,
      });
    }

    if (current.issues.length) {
      skipped.push({
        stem: current.stem.trim(),
        startLine: current.startLine,
        endLine: resolvedEndLine,
        issues: current.issues,
      });
      current = null;
      return;
    }

    questions.push({ stem: current.stem.trim(), options: resolvedOptions });
    if (diagnostics) {
      diagnostics.push({
        questionIndex: questions.length - 1,
        startLine: current.startLine,
        endLine: resolvedEndLine,
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
    if (!line) continue;

    const answerMatch = line.match(ANSWER_DIRECTIVE_PATTERN);
    if (answerMatch) {
      if (!current) {
        recordGlobalIssue('ANSWER directive appeared before any question.', {
          lineNumber,
        });
        continue;
      }
      const letterMatches = answerMatch[1].match(/\b[A-Z]\b/gi) || [];
      const optionLookup = current.options.map((option) => ({
        label: option.label,
        normalized: normalizeOptionText(option.content),
      }));
      const answers = [
        ...new Set(letterMatches.map((match) => match.toUpperCase())),
      ];
      if (!answers.length) {
        const normalizedDirective = normalizeOptionText(answerMatch[1]);
        const matched = optionLookup.find(
          (entry) => entry.normalized === normalizedDirective
        );
        if (matched) answers.push(matched.label);
      }
      if (!answers.length) {
        recordCurrentIssue('ANSWER directive is missing option letters.', {
          lineNumber,
        });
      }
      answers.forEach((letter) => {
        const option = current.options.find((item) => item.label === letter);
        if (!option) {
          recordCurrentIssue(
            `ANSWER references option "${letter}" which was not provided.`,
            { lineNumber }
          );
        } else {
          option.isCorrect = true;
        }
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
        });
        continue;
      }
      current.options.push({
        label: optionMatch[1].toUpperCase(),
        content: optionMatch[2].trim(),
        isCorrect: false,
      });
      current.lastLine = lineNumber;
      continue;
    }

    if (!current) {
      startNewQuestion(line, lineNumber);
      continue;
    }
    if (current.options.length === 0 || hasIndentation) {
      if (current.options.length > 0 && hasIndentation) {
        const lastOption = current.options[current.options.length - 1];
        lastOption.content = appendLine(lastOption.content, line);
      } else {
        current.stem = appendLine(current.stem, line);
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
    throw new DataServiceError(
      'No valid questions were found. Check the formatting and try again.',
      { context: { skipped, errors: parseErrors } }
    );
  }

  if (captureDiagnostics) {
    return { questions, diagnostics, skipped, errors: parseErrors };
  }

  Object.defineProperty(questions, 'meta', {
    value: { skipped, errors: parseErrors },
    enumerable: false,
  });
  return questions;
}

async function adminFetch(path, options = {}) {
  try {
    return await apiFetch(`/api/admin${path}`, options);
  } catch (error) {
    throw new DataServiceError(error.message || 'Admin request failed.', {
      cause: error,
      context: error.details,
    });
  }
}

class DataService {
  async getDashboardStats() {
    const stats = await adminFetch('/stats');
    return {
      users: stats.users ?? stats.total_users ?? 0,
      subscriptions: stats.subscriptions ?? stats.active_subscriptions ?? 0,
      revenue: stats.revenue ?? stats.monthly_revenue ?? 0,
      totalQuestions: stats.totalQuestions ?? stats.total_questions ?? 0,
    };
  }

  async listDepartments() {
    const payload = await adminFetch('/departments');
    return (payload.departments || []).map(buildDepartment).filter(Boolean);
  }

  async createDepartment(payload) {
    const response = await adminFetch('/departments', {
      method: 'POST',
      body: payload,
    });
    return buildDepartment(response.department);
  }

  async updateDepartment(id, payload) {
    const response = await adminFetch(`/departments/${id}`, {
      method: 'PATCH',
      body: payload,
    });
    return buildDepartment(response.department);
  }

  async deleteDepartment(id) {
    await adminFetch(`/departments/${id}`, { method: 'DELETE' });
  }

  async listCourses(departmentId) {
    const path = departmentId
      ? `/departments/${departmentId}/courses`
      : '/courses';
    const payload = await adminFetch(path);
    return (payload.courses || []).map(buildCourse).filter(Boolean);
  }

  async getCourse(id) {
    const payload = await adminFetch(`/courses/${id}`);
    return buildCourse(payload.course);
  }

  async createCourse(departmentId, payload) {
    const response = await adminFetch('/courses', {
      method: 'POST',
      body: { ...payload, departmentId },
    });
    return buildCourse(response.course);
  }

  async updateCourse(id, payload) {
    const response = await adminFetch(`/courses/${id}`, {
      method: 'PATCH',
      body: payload,
    });
    return buildCourse(response.course);
  }

  async deleteCourse(id) {
    await adminFetch(`/courses/${id}`, { method: 'DELETE' });
  }

  async listTopics(courseId) {
    const query = courseId ? `?courseId=${encodeURIComponent(courseId)}` : '';
    const payload = await adminFetch(`/topics${query}`);
    return (payload.topics || []).map(buildTopic).filter(Boolean);
  }

  async getTopic(id) {
    const payload = await adminFetch(`/topics/${id}`);
    return buildTopic(payload.topic);
  }

  async createTopic(courseId, payload) {
    const response = await adminFetch('/topics', {
      method: 'POST',
      body: { ...payload, courseId },
    });
    return buildTopic(response.topic);
  }

  async updateTopic(id, payload) {
    const response = await adminFetch(`/topics/${id}`, {
      method: 'PATCH',
      body: payload,
    });
    return buildTopic(response.topic);
  }

  async deleteTopic(id) {
    await adminFetch(`/topics/${id}`, { method: 'DELETE' });
  }

  async listQuestions(topicId) {
    const payload = await adminFetch(
      `/questions?topicId=${encodeURIComponent(topicId)}`
    );
    return (payload.questions || []).map(buildQuestion).filter(Boolean);
  }

  async createQuestion(topicId, payload) {
    if (payload?.imageFile) {
      throw new DataServiceError(
        'Image uploads are not available in the VPS admin release yet.'
      );
    }
    const response = await adminFetch('/questions', {
      method: 'POST',
      body: { ...payload, topicId },
    });
    return buildQuestion(response.question);
  }

  async updateQuestion(id, payload) {
    if (payload?.imageFile) {
      throw new DataServiceError(
        'Image uploads are not available in the VPS admin release yet.'
      );
    }
    const response = await adminFetch(`/questions/${id}`, {
      method: 'PATCH',
      body: payload,
    });
    return buildQuestion(response.question);
  }

  async deleteQuestion(id) {
    await adminFetch(`/questions/${id}`, { method: 'DELETE' });
  }

  previewAikenContent(content) {
    return parseAikenContent(content, { captureDiagnostics: true });
  }

  async importAikenQuestions(topicId, fileContent) {
    const parsedQuestions = parseAikenContent(fileContent);
    const inserted = [];
    for (const question of parsedQuestions) {
      inserted.push(await this.createQuestion(topicId, question));
    }
    return {
      inserted,
      skipped: parsedQuestions.meta?.skipped || [],
      errors: parsedQuestions.meta?.errors || [],
    };
  }

  async listSubscriptionProductsDetailed() {
    const payload = await adminFetch('/subscription-products');
    return (payload.products || [])
      .map(buildSubscriptionProductDetailed)
      .filter(Boolean);
  }

  async createSubscriptionProduct(payload) {
    const response = await adminFetch('/subscription-products', {
      method: 'POST',
      body: payload,
    });
    return buildSubscriptionProductDetailed(response.product);
  }

  async updateSubscriptionProduct(id, payload) {
    const response = await adminFetch(`/subscription-products/${id}`, {
      method: 'PATCH',
      body: payload,
    });
    return buildSubscriptionProductDetailed(response.product);
  }

  async deleteSubscriptionProduct(id) {
    await adminFetch(`/subscription-products/${id}`, { method: 'DELETE' });
  }

  async createSubscriptionPlan(productId, payload) {
    const response = await adminFetch(
      `/subscription-products/${productId}/plans`,
      {
        method: 'POST',
        body: payload,
      }
    );
    return buildSubscriptionPlan(response.plan);
  }

  async updateSubscriptionPlan(id, payload) {
    const response = await adminFetch(`/subscription-plans/${id}`, {
      method: 'PATCH',
      body: payload,
    });
    return buildSubscriptionPlan(response.plan);
  }

  async deleteSubscriptionPlan(id) {
    await adminFetch(`/subscription-plans/${id}`, { method: 'DELETE' });
  }

  async listPlanLearners(planId) {
    const payload = await adminFetch(`/subscription-plans/${planId}/learners`);
    return (payload.learners || []).map(buildPlanLearner).filter(Boolean);
  }

  async listProfiles() {
    const payload = await adminFetch('/profiles');
    return (payload.profiles || []).map(buildProfileRow).filter(Boolean);
  }

  async listInactiveLearners(options = 7, legacyLimit = 100) {
    const daysInactive =
      typeof options === 'object'
        ? options.daysWithoutActivity || options.daysInactive || 7
        : options;
    const limit =
      typeof options === 'object' ? options.limit || 100 : legacyLimit;
    const cutoff = Date.now() - Number(daysInactive || 7) * 86400000;
    const profiles = await this.listProfiles();
    return profiles
      .filter((profile) => {
        if (profile.role !== 'learner') return false;
        if (!profile.last_seen_at) return true;
        const lastSeen = new Date(profile.last_seen_at).getTime();
        return Number.isNaN(lastSeen) || lastSeen < cutoff;
      })
      .slice(0, Number(limit || 100));
  }

  async updateUserProfileStatus(userId, status) {
    const response = await adminFetch(`/profiles/${userId}/status`, {
      method: 'PATCH',
      body: { status },
    });
    return buildProfileRow(response.profile);
  }

  async adminUpdateUser(payload) {
    const response = await adminFetch(`/users/${payload.userId}`, {
      method: 'PATCH',
      body: payload,
    });
    return buildProfileRow(response.profile);
  }

  async deleteUserProfile(userId) {
    await adminFetch(`/users/${userId}`, { method: 'DELETE' });
  }

  async generateBulkCredentials(payload) {
    const response = await adminFetch('/users/bulk-credentials', {
      method: 'POST',
      body: payload,
    });
    return response.accounts || [];
  }

  async listGlobalAnnouncements() {
    const payload = await adminFetch('/announcements');
    return payload.announcements || [];
  }

  async createGlobalAnnouncement(payload) {
    const response = await adminFetch('/announcements', {
      method: 'POST',
      body: payload,
    });
    return response.announcement;
  }

  async updateGlobalAnnouncement(id, payload) {
    const response = await adminFetch(`/announcements/${id}`, {
      method: 'PATCH',
      body: payload,
    });
    return response.announcement;
  }

  async deleteGlobalAnnouncement(id) {
    await adminFetch(`/announcements/${id}`, { method: 'DELETE' });
  }
}

export const dataService = new DataService();

export const __userSubscriptionHelpers = {
  getUserSubscriptionStatus,
  normalizeUserSubscription,
  compareNormalizedSubscriptions,
};

export { buildCycleTimeline };

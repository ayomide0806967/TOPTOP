import { getSupabaseClient } from '../../shared/supabaseClient.js';
import { clearSessionFingerprint } from '../../shared/sessionFingerprint.js';
import {
  getQuizSnapshot,
  listQuizSnapshots,
} from '../../shared/quizSnapshotStore.js';

const CARD_PALETTES = {
  default: {
    surface: 'linear-gradient(145deg, #f9f5ee 0%, #f3e8d7 45%, #e8d6bc 100%)',
    border: '#e6d8c5',
    accent: '#0f766e',
    accentHover: '#0d5f58',
    accentSoft: 'rgba(15, 118, 110, 0.15)',
    text: '#1f2937',
    muted: '#475569',
    chipBg: 'rgba(15, 118, 110, 0.12)',
    chipText: '#0f4c45',
  },
  nursing: {
    surface: 'linear-gradient(145deg, #f3faf8 0%, #e0f0ee 45%, #d0e4e1 100%)',
    border: '#cde5df',
    accent: '#0e7490',
    accentHover: '#0b5c72',
    accentSoft: 'rgba(14, 116, 144, 0.16)',
    text: '#0f172a',
    muted: '#43647a',
    chipBg: 'rgba(14, 116, 144, 0.12)',
    chipText: '#0e5160',
  },
  midwifery: {
    surface: 'linear-gradient(145deg, #f7f2fe 0%, #e9dcfb 45%, #dec6f7 100%)',
    border: '#dccdf6',
    accent: '#7c3aed',
    accentHover: '#6d28d9',
    accentSoft: 'rgba(124, 58, 237, 0.16)',
    text: '#312e81',
    muted: '#514386',
    chipBg: 'rgba(124, 58, 237, 0.12)',
    chipText: '#5b21b6',
  },
  'public-health': {
    surface: 'linear-gradient(145deg, #fdf5ec 0%, #f7e2c9 45%, #f2d1a4 100%)',
    border: '#f0d8b7',
    accent: '#d97706',
    accentHover: '#b45309',
    accentSoft: 'rgba(217, 119, 6, 0.16)',
    text: '#92400e',
    muted: '#a16207',
    chipBg: 'rgba(217, 119, 6, 0.12)',
    chipText: '#92400e',
  },
};

const elements = {
  toast: document.querySelector('[data-role="toast"]'),
  scheduleNotice: document.querySelector('[data-role="schedule-notice"]'),
  scheduleNoticeTitle: document.querySelector('[data-role="schedule-notice-title"]'),
  scheduleNoticeHeadline: document.querySelector('[data-role="schedule-notice-headline"]'),
  scheduleNoticeDetail: document.querySelector('[data-role="schedule-notice-detail"]'),
  scheduleNoticeMeta: document.querySelector('[data-role="schedule-notice-meta"]'),
  heroName: document.querySelector('[data-role="hero-name"]'),
  heroPlanHeadline: document.querySelector('[data-role="hero-plan-headline"]'),
  heroDaysRemaining: document.querySelector('[data-role="hero-days-remaining"]'),
  heroProgressBar: document.querySelector('[data-role="hero-progress-bar"]'),
  heroProgressLabel: document.querySelector('[data-role="hero-progress-label"]'),
  statStatus: document.querySelector('[data-role="stat-status"]'),
  statProgress: document.querySelector('[data-role="stat-progress"]'),
  statScore: document.querySelector('[data-role="stat-score"]'),
  statStreak: document.querySelector('[data-role="stat-streak"]'),
  quizTitle: document.querySelector('[data-role="quiz-title"]'),
  quizSubtitle: document.querySelector('[data-role="quiz-subtitle"]'),
  quizTimer: document.querySelector('[data-role="quiz-timer"]'),
  quizTimerValue: document.querySelector('[data-role="quiz-timer-value"]'),
  questions: document.querySelector('[data-role="questions"]'),
  completionBanner: document.querySelector('[data-role="completion-banner"]'),
  historyBody: document.querySelector('[data-role="history-body"]'),
  historyCards: document.querySelector('[data-role="history-cards"]'),
  historySummary: document.querySelector('[data-role="history-summary"]'),
  regenerateBtn: document.querySelector('[data-role="regenerate-quiz"]'),
  resumeBtn: document.querySelector('[data-role="resume-quiz"]'),
  logoutBtn: document.querySelector('[data-role="logout"]'),
  mobileLogout: document.querySelector('[data-role="mobile-logout"]'),
  userGreeting: document.querySelector('[data-role="user-greeting"]'),
  userEmail: document.querySelector('[data-role="user-email"]'),
  progressBar: document.querySelector('[data-role="progress-bar"]'),
  progressLabel: document.querySelector('[data-role="progress-label"]'),
  subscriptionCard: document.querySelector('[data-role="subscription-card"]'),
  planHeading: document.querySelector('[data-role="plan-heading"]'),
  planSubheading: document.querySelector('[data-role="plan-subheading"]'),
  planBrowseBtn: document.querySelector('[data-role="plan-browse"]'),
  planCollection: document.querySelector('[data-role="plan-collection"]'),
  extraSetsSection: document.querySelector('[data-role="extra-sets-section"]'),
  extraSetsList: document.querySelector('[data-role="extra-sets-list"]'),
}; 

const state = {
  supabase: null,
  user: null,
  profile: null,
  todayQuiz: null,
  history: [],
  scheduleHealth: null,
  subscriptions: [],
  defaultSubscriptionId: null,
  extraQuestionSets: [],
};

const NOTICE_TONE_CLASSES = {
  positive: ['border-emerald-200', 'bg-emerald-50', 'text-emerald-800'],
  warning: ['border-amber-200', 'bg-amber-50', 'text-amber-800'],
  danger: ['border-rose-200', 'bg-rose-50', 'text-rose-800'],
  info: ['border-slate-200', 'bg-white', 'text-slate-700'],
};

const ALL_TONE_CLASSES = [
  ...new Set(Object.values(NOTICE_TONE_CLASSES).flat()),
];

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const PLAN_STATUS_STYLES = {
  active: {
    label: 'Active',
    badgeBg: 'rgba(16, 185, 129, 0.18)',
    badgeText: '#047857',
    badgeBorder: 'rgba(16, 185, 129, 0.32)',
  },
  trialing: {
    label: 'Trialing',
    badgeBg: 'rgba(14, 165, 233, 0.18)',
    badgeText: '#0369a1',
    badgeBorder: 'rgba(14, 165, 233, 0.28)',
  },
  past_due: {
    label: 'Past Due',
    badgeBg: 'rgba(251, 191, 36, 0.18)',
    badgeText: '#b45309',
    badgeBorder: 'rgba(251, 191, 36, 0.32)',
  },
  expired: {
    label: 'Expired',
    badgeBg: 'rgba(248, 113, 113, 0.22)',
    badgeText: '#b91c1c',
    badgeBorder: 'rgba(248, 113, 113, 0.32)',
  },
  canceled: {
    label: 'Cancelled',
    badgeBg: 'rgba(148, 163, 184, 0.16)',
    badgeText: '#475569',
    badgeBorder: 'rgba(148, 163, 184, 0.3)',
  },
  inactive: {
    label: 'Inactive',
    badgeBg: 'rgba(148, 163, 184, 0.12)',
    badgeText: '#64748b',
    badgeBorder: 'rgba(148, 163, 184, 0.24)',
  },
  pending_payment: {
    label: 'Pending',
    badgeBg: 'rgba(251, 191, 36, 0.18)',
    badgeText: '#92400e',
    badgeBorder: 'rgba(251, 191, 36, 0.28)',
  },
  none: {
    label: 'No Plan',
    badgeBg: 'rgba(148, 163, 184, 0.1)',
    badgeText: '#475569',
    badgeBorder: 'rgba(148, 163, 184, 0.2)',
  },
};

const STATUS_SORT_WEIGHT = {
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

function showToast(message, type = 'info') {
  if (!elements.toast) return;
  elements.toast.textContent = message;
  elements.toast.classList.remove('hidden');
  elements.toast.classList.remove(
    'border-red-200', 'bg-red-50', 'text-red-700',
    'border-emerald-200', 'bg-emerald-50', 'text-emerald-700',
    'border-sky-200', 'bg-sky-50', 'text-sky-700'
  );

  if (type === 'error') {
    elements.toast.classList.add('border-red-200', 'bg-red-50', 'text-red-700');
  } else if (type === 'success') {
    elements.toast.classList.add('border-emerald-200', 'bg-emerald-50', 'text-emerald-700');
  } else {
    elements.toast.classList.add('border-sky-200', 'bg-sky-50', 'text-sky-700');
  }

  window.clearTimeout(elements.toast.dataset.timeoutId);
  const timeoutId = window.setTimeout(() => {
    elements.toast?.classList.add('hidden');
  }, 5000);
  elements.toast.dataset.timeoutId = timeoutId;
}

function formatDate(dateString) {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(dateString) {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return formatDate(dateString);
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function escapeHtml(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return value
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCurrency(amount, currency = 'NGN') {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: numeric % 1 === 0 ? 0 : 2,
    }).format(numeric);
  } catch {
    return `${currency} ${numeric.toLocaleString()}`;
  }
}

function getSubscriptionStatus(subscription) {
  if (!subscription) return 'none';
  const now = new Date();
  const normalized = (subscription.status || '').toLowerCase();
  const expiresAt = parseDate(subscription.expires_at);
  if (expiresAt && expiresAt.getTime() < now.getTime()) {
    return 'expired';
  }
  return normalized || 'inactive';
}

function isSubscriptionActive(subscription) {
  if (!subscription) return false;
  const statusKey = getSubscriptionStatus(subscription);
  if (!['active', 'trialing', 'past_due'].includes(statusKey)) {
    return false;
  }
  const now = new Date();
  const startsAt = parseDate(subscription.started_at);
  const expiresAt = parseDate(subscription.expires_at);
  if (startsAt && startsAt.getTime() > now.getTime()) {
    return false;
  }
  if (expiresAt && expiresAt.getTime() < now.getTime()) {
    return false;
  }
  return true;
}

function getPlanTimeline(subscription) {
  const startedAt = parseDate(subscription?.started_at);
  const expiresAt = parseDate(subscription?.expires_at);
  const now = new Date();

  const totalDays = startedAt && expiresAt ? Math.max(1, daysBetween(startedAt, expiresAt)) : null;
  const daysRemaining = expiresAt
    ? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_IN_MS))
    : null;
  const usedDays =
    totalDays !== null && daysRemaining !== null
      ? clamp(totalDays - daysRemaining, 0, totalDays)
      : startedAt
      ? clamp(Math.round((now.getTime() - startedAt.getTime()) / DAY_IN_MS), 0, totalDays ?? 30)
      : null;
  const progressPercent =
    totalDays && usedDays !== null
      ? clamp(Math.round((usedDays / totalDays) * 100), 0, 100)
      : daysRemaining === 0
      ? 100
      : 0;

  return {
    startedAt,
    expiresAt,
    totalDays,
    daysRemaining,
    usedDays,
    progressPercent,
  };
}

function compareSubscriptions(a, b) {
  const aStatus = getSubscriptionStatus(a);
  const bStatus = getSubscriptionStatus(b);
  const aWeight = STATUS_SORT_WEIGHT[aStatus] ?? 10;
  const bWeight = STATUS_SORT_WEIGHT[bStatus] ?? 10;
  if (aWeight !== bWeight) {
    return aWeight - bWeight;
  }

  const aExpires = parseDate(a?.expires_at)?.getTime() ?? Number.POSITIVE_INFINITY;
  const bExpires = parseDate(b?.expires_at)?.getTime() ?? Number.POSITIVE_INFINITY;
  if (aExpires !== bExpires) {
    return aExpires - bExpires;
  }

  const aStarted = parseDate(a?.started_at)?.getTime() ?? 0;
  const bStarted = parseDate(b?.started_at)?.getTime() ?? 0;
  return bStarted - aStarted;
}

function getSelectedSubscription(subscriptions = state.subscriptions || []) {
  if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
    return null;
  }

  const explicit = subscriptions.find((entry) => entry.id === state.defaultSubscriptionId);
  if (explicit) return explicit;

  const activeSubs = subscriptions.filter(isSubscriptionActive).sort(compareSubscriptions);
  if (activeSubs.length) {
    return activeSubs[0];
  }

  return subscriptions.slice().sort(compareSubscriptions)[0];
}

function updateHeroForSubscription(subscription, profileStatus = 'inactive') {
  const headlineEl = elements.heroPlanHeadline;
  const daysEl = elements.heroDaysRemaining;
  const progressBarEl = elements.heroProgressBar;
  const progressLabelEl = elements.heroProgressLabel;

  if (!subscription) {
    if (headlineEl) {
      headlineEl.textContent =
        profileStatus === 'pending_payment'
          ? 'Finish your checkout to unlock today’s personalised drill.'
          : 'Choose a plan to unlock daily personalised quizzes and analytics.';
    }
    if (daysEl) {
      daysEl.textContent =
        profileStatus === 'pending_payment' ? 'Pending activation' : 'No active plan yet';
    }
    if (progressBarEl) {
      progressBarEl.style.width = '0%';
    }
    if (progressLabelEl) {
      progressLabelEl.textContent =
        profileStatus === 'pending_payment'
          ? 'We are waiting for your payment confirmation.'
          : 'Your streak begins as soon as you activate a plan.';
    }
    return;
  }

  const timeline = getPlanTimeline(subscription);
  const plan = subscription.plan || {};
  const statusKey = getSubscriptionStatus(subscription);
  const hasEnded = statusKey === 'expired';

  if (headlineEl) {
    const label = timeline.daysRemaining !== null
      ? `${timeline.daysRemaining} day${timeline.daysRemaining === 1 ? '' : 's'} left`
      : timeline.expiresAt
      ? `Renews ${formatDate(timeline.expiresAt.toISOString())}`
      : statusKey === 'trialing'
      ? 'Trial access is active'
      : 'Ongoing access';
    headlineEl.textContent = plan.name ? `${plan.name} • ${label}` : `Active plan • ${label}`;
  }

  if (daysEl) {
    if (timeline.daysRemaining !== null) {
      daysEl.textContent = `${timeline.daysRemaining} day${timeline.daysRemaining === 1 ? '' : 's'} remaining`;
    } else if (timeline.expiresAt) {
      daysEl.textContent = `Renews ${formatDate(timeline.expiresAt.toISOString())}`;
    } else if (statusKey === 'trialing') {
      daysEl.textContent = 'Trial in progress';
    } else {
      daysEl.textContent = 'Active access';
    }
  }

  if (progressBarEl) {
    const percent = timeline.progressPercent ?? (hasEnded ? 100 : 10);
    progressBarEl.style.width = `${percent}%`;
  }

  if (progressLabelEl) {
    if (timeline.totalDays && timeline.usedDays !== null && timeline.daysRemaining !== null) {
      progressLabelEl.textContent = `${timeline.usedDays} of ${timeline.totalDays} days used · ${timeline.daysRemaining} to go`;
    } else if (statusKey === 'trialing') {
      progressLabelEl.textContent = 'Trial is underway. Upgrade any time to keep your streak going.';
    } else if (hasEnded) {
      progressLabelEl.textContent = 'Plan expired. Renew to continue your personalised drills.';
    } else {
      progressLabelEl.textContent = 'Your progress updates as you complete each day’s questions.';
    }
  }
}

function createPlanCard(subscription) {
  const plan = subscription.plan || {};
  const metadata =
    plan && plan.metadata && typeof plan.metadata === 'object' ? plan.metadata : {};
  const product = plan.product || {};
  const department = product.department || {};
  const timeline = getPlanTimeline(subscription);
  const statusKey = getSubscriptionStatus(subscription);
  const statusStyle = PLAN_STATUS_STYLES[statusKey] || PLAN_STATUS_STYLES.none;
  const isSelected = subscription.id === state.defaultSubscriptionId;
  const activeNow = isSubscriptionActive(subscription);
  const now = new Date();
  const startsInFuture = timeline.startedAt && timeline.startedAt.getTime() > now.getTime();

  const themeColor =
    department?.color_theme ||
    department?.slug ||
    product?.department_slug ||
    'default';
  const palette = CARD_PALETTES[themeColor] || CARD_PALETTES.default;
  const accentColor = palette.accent || '#0f766e';
  const accentHover = palette.accentHover || accentColor;
  const accentSoft = palette.accentSoft || 'rgba(15, 118, 110, 0.16)';
  const textColor = palette.text || '#1f2937';
  const mutedColor = palette.muted || '#475569';
  const borderColor = palette.border || 'rgba(148, 163, 184, 0.32)';
  const chipBg = statusStyle.badgeBg || palette.chipBg || accentSoft;
  const chipText = statusStyle.badgeText || palette.chipText || accentColor;
  const chipBorder = statusStyle.badgeBorder || 'transparent';

  const card = document.createElement('article');
  card.dataset.subscriptionId = subscription.id;
  card.className =
    'flex flex-col gap-5 rounded-3xl p-5 sm:p-6 shadow-sm border transition-transform duration-300 hover:-translate-y-0.5 focus-within:-translate-y-0.5';
  card.style.background = palette.surface || '#f8fafc';
  card.style.borderColor = borderColor;
  card.style.color = textColor;
  card.style.boxShadow = '0 22px 48px -32px rgba(15, 23, 42, 0.35)';
  if (isSelected) {
    card.style.borderColor = accentColor;
    card.style.boxShadow = `0 28px 56px -34px ${accentColor}55`;
  } else if (statusKey === 'expired') {
    card.style.opacity = '0.92';
  }

  const header = document.createElement('div');
  header.className = 'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between';

  const headerContent = document.createElement('div');
  headerContent.className = 'space-y-1';

  const title = document.createElement('h3');
  title.className = 'text-lg font-semibold';
  title.style.color = textColor;
  title.textContent = plan.name || 'Subscription';
  headerContent.appendChild(title);

  if (metadata?.tagline || metadata?.summary || plan.description) {
    const subtitle = document.createElement('p');
    subtitle.className = 'text-sm';
    subtitle.style.color = mutedColor;
    subtitle.textContent = metadata?.tagline || metadata?.summary || plan.description;
    headerContent.appendChild(subtitle);
  }

  const badge = document.createElement('span');
  badge.className = 'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide';
  badge.style.backgroundColor = chipBg;
  badge.style.color = chipText;
  badge.style.borderColor = chipBorder;
  badge.textContent = statusStyle.label;

  header.appendChild(headerContent);
  header.appendChild(badge);
  card.appendChild(header);

  const progressWrapper = document.createElement('div');
  progressWrapper.className = 'mt-3 space-y-2';

  const progressBar = document.createElement('div');
  progressBar.className = 'h-2 w-full overflow-hidden rounded-full border border-white/40 bg-white/60 backdrop-blur-sm';

  const progressFill = document.createElement('div');
  progressFill.className = 'h-full rounded-full transition-all duration-500 ease-out';
  progressFill.style.background = `linear-gradient(90deg, ${accentColor}, ${accentHover})`;
  progressFill.style.width = `${timeline.progressPercent ?? (statusKey === 'expired' ? 100 : 10)}%`;
  progressBar.appendChild(progressFill);

  const progressMeta = document.createElement('div');
  progressMeta.className = 'flex flex-wrap items-center justify-between text-xs';
  progressMeta.style.color = mutedColor;
  if (timeline.totalDays && timeline.usedDays !== null && timeline.daysRemaining !== null) {
    progressMeta.textContent = `${timeline.usedDays} of ${timeline.totalDays} days used • ${timeline.daysRemaining} remaining`;
  } else if (statusKey === 'expired' && timeline.expiresAt) {
    progressMeta.textContent = `Expired ${formatDate(timeline.expiresAt.toISOString())}`;
  } else if (startsInFuture && timeline.startedAt) {
    progressMeta.textContent = `Activates on ${formatDate(timeline.startedAt.toISOString())}`;
  } else {
    progressMeta.textContent = 'Plan timeline updated';
  }

  progressWrapper.appendChild(progressBar);
  progressWrapper.appendChild(progressMeta);
  card.appendChild(progressWrapper);

  const detailGrid = document.createElement('dl');
  detailGrid.className = 'mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4';

  const addDetail = (label, value) => {
    const wrapper = document.createElement('div');
    const dt = document.createElement('dt');
    dt.className = 'text-xs font-semibold uppercase tracking-wide';
    dt.style.color = mutedColor;
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.className = 'mt-1 text-base font-semibold';
    dd.style.color = textColor;
    dd.textContent = value ?? '—';
    wrapper.appendChild(dt);
    wrapper.appendChild(dd);
    detailGrid.appendChild(wrapper);
  };

  const daysLabel = timeline.daysRemaining !== null
    ? `${timeline.daysRemaining} day${timeline.daysRemaining === 1 ? '' : 's'}`
    : '—';
  addDetail('Days left', daysLabel);

  const renewLabel = timeline.expiresAt
    ? formatDate(timeline.expiresAt.toISOString())
    : 'Auto-renew';
  addDetail('Renews on', renewLabel);

  const priceLabel = formatCurrency(plan.price, plan.currency || 'NGN');
  addDetail('Plan price', priceLabel);

  const dailyLimit = plan.daily_question_limit || metadata?.dailyLimit;
  addDetail('Daily limit', dailyLimit ? `${dailyLimit} questions` : 'Flexible');

  addDetail('Department', department.name || product.name || '—');

  card.appendChild(detailGrid);

  const footer = document.createElement('div');
  footer.className = 'mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between';

  const note = document.createElement('p');
  note.className = 'text-xs sm:text-sm';
  note.style.color = mutedColor;
  if (statusKey === 'expired' && timeline.expiresAt) {
    note.textContent = `Expired on ${formatDate(timeline.expiresAt.toISOString())}. Renew to regain access.`;
  } else if (startsInFuture && timeline.startedAt) {
    note.textContent = `Activates on ${formatDate(timeline.startedAt.toISOString())}. We'll switch automatically.`;
  } else if (subscription.purchased_at) {
    note.textContent = `Purchased ${formatDate(subscription.purchased_at)}.`;
  } else {
    note.textContent = 'Subscription is synced with your dashboard.';
  }
  footer.appendChild(note);

  const buttonRow = document.createElement('div');
  buttonRow.className = 'flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end w-full';

  const quizBtn = document.createElement('button');
  quizBtn.type = 'button';
  quizBtn.dataset.subscriptionId = subscription.id;
  quizBtn.dataset.role = 'plan-quiz';
  if (activeNow) {
    quizBtn.dataset.action = 'start-quiz';
    quizBtn.className = 'inline-flex w-full sm:w-auto items-center justify-center rounded-full px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition focus:outline-none focus:ring-2 focus:ring-offset-1';
    quizBtn.style.background = `linear-gradient(135deg, ${accentColor}, ${accentHover})`;
    quizBtn.style.boxShadow = `0 14px 28px -18px ${accentColor}80`;
    quizBtn.textContent = 'Start daily quiz';
  } else {
    quizBtn.className = 'inline-flex w-full sm:w-auto items-center justify-center rounded-full px-5 py-2.5 text-xs font-semibold uppercase tracking-wide cursor-not-allowed';
    quizBtn.style.background = 'rgba(148, 163, 184, 0.25)';
    quizBtn.style.color = '#64748b';
    quizBtn.textContent = startsInFuture ? 'Activates soon' : 'Unavailable';
    quizBtn.disabled = true;
  }

  const useBtn = document.createElement('button');
  useBtn.type = 'button';
  useBtn.dataset.subscriptionId = subscription.id;

  if (isSelected) {
    useBtn.textContent = 'In use for daily questions';
    useBtn.className = 'inline-flex w-full sm:w-auto items-center justify-center gap-1 rounded-full px-5 py-2.5 text-xs font-semibold uppercase tracking-wide shadow-sm focus:outline-none';
    useBtn.style.background = accentSoft;
    useBtn.style.color = accentColor;
    useBtn.style.border = `1px solid ${accentColor}`;
    useBtn.disabled = true;
  } else if (!activeNow) {
    useBtn.textContent = statusKey === 'expired' ? 'Renew to reactivate' : 'Activates soon';
    useBtn.className = 'inline-flex w-full sm:w-auto items-center justify-center rounded-full px-5 py-2.5 text-xs font-semibold uppercase tracking-wide cursor-not-allowed';
    useBtn.style.background = 'rgba(148, 163, 184, 0.2)';
    useBtn.style.color = '#64748b';
    useBtn.disabled = true;
  } else {
    useBtn.dataset.action = 'set-default';
    useBtn.className = 'inline-flex w-full sm:w-auto items-center justify-center rounded-full px-5 py-2.5 text-xs font-semibold uppercase tracking-wide transition focus:outline-none focus:ring-2 focus:ring-offset-1';
    useBtn.style.background = 'rgba(255, 255, 255, 0.7)';
    useBtn.style.color = accentColor;
    useBtn.style.border = `1px solid ${accentColor}33`;
    useBtn.textContent = 'Use for daily questions';
  }

  if (!useBtn.textContent) {
    useBtn.textContent = 'Use for daily questions';
  }

  const manageBtn = document.createElement('button');
  manageBtn.type = 'button';
  manageBtn.dataset.subscriptionId = subscription.id;
  manageBtn.dataset.action = 'renew';
  manageBtn.className = 'inline-flex w-full sm:w-auto items-center justify-center rounded-full border px-5 py-2.5 text-xs font-semibold uppercase tracking-wide transition focus:outline-none focus:ring-2 focus:ring-offset-1';
  manageBtn.style.background = 'rgba(255, 255, 255, 0.65)';
  manageBtn.style.borderColor = borderColor;
  manageBtn.style.color = mutedColor;
  manageBtn.textContent = statusKey === 'expired' ? 'Renew plan' : 'Manage plan';
  if (statusKey === 'expired') {
    manageBtn.style.background = 'rgba(254, 242, 242, 0.75)';
    manageBtn.style.borderColor = 'rgba(248, 113, 113, 0.45)';
    manageBtn.style.color = '#b91c1c';
  }

  buttonRow.appendChild(quizBtn);
  buttonRow.appendChild(useBtn);
  buttonRow.appendChild(manageBtn);
  footer.appendChild(buttonRow);
  card.appendChild(footer);

  return card;
}

function handlePlanCollectionClick(event) {
  const target = event.target.closest('[data-action]');
  if (!target || target.disabled) return;
  const action = target.dataset.action;
  const subscriptionId = target.dataset.subscriptionId;
  if (!action || !subscriptionId) return;

  if (action === 'set-default') {
    setDefaultSubscription(subscriptionId);
  } else if (action === 'renew') {
    window.location.href = 'subscription-plans.html';
  } else if (action === 'start-quiz') {
    startDailyQuizForSubscription(subscriptionId);
  } else if (action === 'locked') {
    const activeQuiz = state.todayQuiz;
    const activeSubscriptionId = activeQuiz?.subscription_id || state.defaultSubscriptionId;
    const activePlan = state.subscriptions.find((entry) => entry.id === activeSubscriptionId);
    const planName = activePlan?.plan?.name || 'current plan';
    showToast(`Submit your ${planName} quiz before starting another plan.`, 'warning');
  } else if (action === 'review-results') {
    const quizId = target.dataset.quizId;
    const assignedDate = target.dataset.assignedDate;
    const isCached = target.dataset.cached === '1';
    const url = new URL('result-face.html', window.location.href);

    if (isCached) {
      url.searchParams.set('cached', '1');
      url.searchParams.set('subscription_id', subscriptionId);
      if (assignedDate) {
        url.searchParams.set('assigned_date', assignedDate);
      }
      if (quizId) {
        url.searchParams.set('quiz_id', quizId);
      }
    } else if (quizId) {
      url.searchParams.set('daily_quiz_id', quizId);
      url.searchParams.set('subscription_id', subscriptionId);
    }

    window.location.href = `${url.pathname}${url.search}`;
  }
}

async function setDefaultSubscription(subscriptionId) {
  if (!subscriptionId || !state.supabase) {
    return;
  }

  try {
    const { data, error } = await state.supabase.rpc('set_default_subscription', {
      p_subscription_id: subscriptionId,
    });
    if (error) throw error;

    const resolvedId = data?.default_subscription_id || subscriptionId;
    state.defaultSubscriptionId = resolvedId;
    if (state.profile) {
      state.profile.default_subscription_id = resolvedId;
    }

    showToast('Daily questions will now use the selected plan.', 'success');
    renderSubscription();
  } catch (error) {
    console.error('[Dashboard] setDefaultSubscription failed', error);
    showToast(error.message || 'Unable to switch plans. Please try again.', 'error');
  }
}

async function startDailyQuizForSubscription(subscriptionId) {
  if (!subscriptionId || !state.supabase) {
    showToast('We could not determine which plan to use.', 'error');
    return;
  }

  const subscription = state.subscriptions.find((entry) => entry.id === subscriptionId);
  if (!subscription) {
    showToast('Plan details were not found. Refresh and try again.', 'error');
    return;
  }

  if (!isSubscriptionActive(subscription)) {
    showToast('This plan is not currently active. Please renew it first.', 'error');
    return;
  }

  updatePlanCollectionLabels();

  try {
    await checkTodayQuiz();
    let existingQuiz = state.todayQuiz;
    const activeSubscriptionId = existingQuiz?.subscription_id || state.defaultSubscriptionId;
    const quizInProgress = existingQuiz && existingQuiz.status !== 'completed';
    if (quizInProgress && activeSubscriptionId && subscriptionId !== activeSubscriptionId) {
      const activePlan = state.subscriptions.find(
        (entry) => entry.id === activeSubscriptionId,
      );
      const planName = activePlan?.plan?.name || 'current plan';
      showToast(`Submit your ${planName} quiz before starting another plan.`, 'warning');
      updatePlanCollectionLabels(existingQuiz);
      return;
    }

    if (subscriptionId !== state.defaultSubscriptionId) {
      const { data, error } = await state.supabase.rpc('set_default_subscription', {
        p_subscription_id: subscriptionId,
      });
      if (error) throw error;
      const resolvedId = data?.default_subscription_id || subscriptionId;
      state.defaultSubscriptionId = resolvedId;
      if (state.profile) {
        state.profile.default_subscription_id = resolvedId;
      }
      await loadSubscriptions();
      await checkTodayQuiz();
      existingQuiz = state.todayQuiz;
    }

    const matchesUpdated = existingQuiz && (
      existingQuiz.subscription_id === subscriptionId ||
      (!existingQuiz.subscription_id && subscriptionId === state.defaultSubscriptionId)
    );

    if (existingQuiz && matchesUpdated) {
      updatePlanCollectionLabels(existingQuiz);
      if (existingQuiz.status === 'completed') {
        window.location.href = `result-face.html?daily_quiz_id=${existingQuiz.id}`;
      } else {
        window.location.href = `exam-face.html?daily_quiz_id=${existingQuiz.id}`;
      }
      return;
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    const cachedSnapshot = getQuizSnapshot(subscriptionId, todayIso);
    if (cachedSnapshot && cachedSnapshot.quiz?.status === 'completed') {
      updatePlanCollectionLabels(existingQuiz);
      const url = new URL('result-face.html', window.location.href);
      url.searchParams.set('cached', '1');
      url.searchParams.set('subscription_id', subscriptionId);
      if (cachedSnapshot.assignedDate) {
        url.searchParams.set('assigned_date', cachedSnapshot.assignedDate);
      }
      if (cachedSnapshot.quiz?.id) {
        url.searchParams.set('quiz_id', cachedSnapshot.quiz.id);
      }
      window.location.href = `${url.pathname}${url.search}`;
      return;
    }

    showToast('Preparing your daily questions...', 'info');
    const { data, error } = await state.supabase.rpc('generate_daily_quiz', {
      p_subscription_id: subscriptionId,
    });

    if (error) {
      const message = error.message || '';
      if (message.includes('no active subscription')) {
        showToast('You need an active subscription to access daily questions', 'error');
        return;
      }
      if (message.includes('selected subscription is no longer active')) {
        showToast('That plan is no longer active. Choose a different plan to continue.', 'error');
        await loadSubscriptions();
        return;
      }
      if (message.includes('no active study slot')) {
        showToast('No active study slot for your department today', 'error');
        return;
      }
      throw error;
    }

    const quizId = Array.isArray(data) ? data[0]?.daily_quiz_id : data?.daily_quiz_id;
    if (!quizId) {
      throw new Error('Failed to generate quiz');
    }

    await checkTodayQuiz();
    updatePlanCollectionLabels(state.todayQuiz);

    window.location.href = `exam-face.html?daily_quiz_id=${quizId}`;
  } catch (error) {
    console.error('[Dashboard] startDailyQuizForSubscription failed', error);
    showToast(error.message || 'Unable to start quiz. Please try again.', 'error');
  }
}

function updatePlanCollectionLabels(todayQuiz) {
  const collection = elements.planCollection;
  if (!collection) return;

  const buttons = collection.querySelectorAll('[data-role="plan-quiz"]');
  if (!buttons.length) return;

  const quiz = todayQuiz || state.todayQuiz;
  const todayIso = new Date().toISOString().slice(0, 10);
  const snapshots = listQuizSnapshots();
  const activeSubscriptionId = quiz
    ? quiz.subscription_id || state.defaultSubscriptionId
    : null;
  const quizInProgress = quiz && quiz.status !== 'completed';

  buttons.forEach((btn) => {
    const subscriptionId = btn.dataset.subscriptionId;
    if (!subscriptionId) return;

    btn.disabled = false;
    delete btn.dataset.quizId;
    delete btn.dataset.assignedDate;
    delete btn.dataset.cached;
    delete btn.dataset.reason;

    if (
      quizInProgress &&
      activeSubscriptionId &&
      subscriptionId !== activeSubscriptionId
    ) {
      btn.textContent = 'Finish current quiz first';
      btn.dataset.action = 'locked';
      btn.dataset.reason = 'active-quiz';
      return;
    }

    const snapshot = snapshots.find(
      (entry) =>
        entry.subscriptionId === subscriptionId &&
        entry.assignedDate === todayIso,
    );

    let nextLabel = 'Start daily quiz';
    let nextAction = 'start-quiz';
    let quizId = '';
    let assignedDate = todayIso;
    let cached = false;

    const matchesSubscription =
      quiz &&
      (quiz.subscription_id === subscriptionId ||
        (!quiz.subscription_id && subscriptionId === state.defaultSubscriptionId));

    if (matchesSubscription) {
      assignedDate = quiz.assigned_date || todayIso;
      quizId = quiz.id || '';
      if (quiz.status === 'completed') {
        nextLabel = 'Review results';
        nextAction = 'review-results';
      } else {
        nextLabel = 'Continue quiz';
        nextAction = 'start-quiz';
      }
    } else if (snapshot && snapshot.quiz) {
      assignedDate = snapshot.assignedDate || todayIso;
      quizId = snapshot.quiz.id || '';
      if (snapshot.quiz.status === 'completed') {
        nextLabel = 'Review results';
        nextAction = 'review-results';
        cached = true;
      }
    }

    btn.textContent = nextLabel;
    btn.dataset.action = nextAction;

    if (quizId) {
      btn.dataset.quizId = quizId;
    }
    if (assignedDate) {
      btn.dataset.assignedDate = assignedDate;
    }
    if (cached) {
      btn.dataset.cached = '1';
    }
  });
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(start, end) {
  if (!start || !end) return null;
  const diff = Math.round((end.getTime() - start.getTime()) / DAY_IN_MS);
  return Number.isFinite(diff) ? diff : null;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function setScheduleTone(tone = 'info') {
  const container = elements.scheduleNotice;
  if (!container) return;
  container.classList.remove(...ALL_TONE_CLASSES);
  const classes = NOTICE_TONE_CLASSES[tone] || NOTICE_TONE_CLASSES.info;
  container.classList.add(...classes);
}

function updateScheduleNotice(health) {
  const container = elements.scheduleNotice;
  if (!container) return;
  const headline = elements.scheduleHeadline;
  const detail = elements.scheduleDetail;
  const meta = elements.scheduleMeta;

  container.classList.add('hidden');
  if (headline) headline.textContent = '';
  if (detail) detail.textContent = '';
  if (meta) meta.textContent = '';

  if (!health) return;

  let tone = 'info';
  let headlineText = '';
  let detailText = '';
  let metaText = '';
  const missing = Number(health.missing_questions ?? 0);
  const dayOffset = Number.isFinite(Number(health.day_offset))
    ? Number(health.day_offset)
    : null;
  const dayLabel = dayOffset !== null ? `Day ${dayOffset + 1}` : null;

  switch (health.status) {
    case 'ready':
    case 'published':
      return; // No banner needed when everything is ready
    case 'underfilled':
      tone = 'warning';
      headlineText = "Today's pool is being prepared";
      detailText = missing
        ? `${missing} question${missing === 1 ? '' : 's'} still being added. Check back soon.`
        : 'We are finalising a few more questions for today.';
      break;
    case 'planned':
      tone = 'warning';
      headlineText = "Today's pool is being finalised";
      detailText = 'Your questions will be ready shortly.';
      break;
    case 'unscheduled':
      tone = 'danger';
      headlineText = 'Schedule not ready yet';
      detailText = 'Your department has not scheduled this day yet.';
      break;
    case 'no_subscription':
      tone = 'info';
      headlineText = 'Subscription Required';
      detailText = 'Activate a subscription plan to access daily questions.';
      break;
    case 'no_active_cycle':
      tone = 'info';
      headlineText = 'Next study slot starting soon';
      detailText = 'Daily questions will be available once the upcoming slot begins.';
      break;
    case 'error':
      tone = 'danger';
      headlineText = 'Unable to load schedule';
      detailText = health.message || 'Please refresh the page to try again.';
      break;
    default:
      return;
  }

  const cycleTitle = health.cycle_title ? `Cycle: ${health.cycle_title}` : '';
  const windowDates =
    health.starts_on || health.ends_on
      ? `Window: ${formatDate(health.starts_on)} – ${formatDate(health.ends_on)}`
      : '';
  const nextReady = health.next_ready_date
    ? `Next ready: ${formatDate(health.next_ready_date)}`
    : '';
  metaText = [cycleTitle, dayLabel, windowDates, nextReady]
    .filter(Boolean)
    .join(' · ');

  const shouldShow = tone !== 'info' || headlineText || detailText || metaText;
  if (!shouldShow) {
    container.classList.add('hidden');
    return;
  }

  if (headline) headline.textContent = headlineText;
  if (detail) detail.textContent = detailText;
  if (meta) meta.textContent = metaText;
  setScheduleTone(tone);
  container.classList.remove('hidden');
}

function renderSubscription() {
  const card = elements.subscriptionCard;
  const collection = elements.planCollection;
  if (!card || !collection) return;

  const planHeading = elements.planHeading;
  const planSubheading = elements.planSubheading;
  const profileStatus = state.profile?.subscription_status || 'inactive';
  const subscriptions = Array.isArray(state.subscriptions)
    ? state.subscriptions.slice()
    : [];

  if (elements.planBrowseBtn) {
    if (profileStatus === 'pending_payment') {
      elements.planBrowseBtn.textContent = 'Resume checkout';
      elements.planBrowseBtn.setAttribute('href', 'resume-registration.html');
    } else {
      elements.planBrowseBtn.textContent = 'Browse plans';
      elements.planBrowseBtn.setAttribute('href', 'subscription-plans.html');
    }
  }

  if (!subscriptions.length) {
    card.classList.remove('hidden');
    if (planHeading) {
      planHeading.textContent =
        profileStatus === 'pending_payment' ? 'Payment pending' : 'No plans yet';
    }
    if (planSubheading) {
      planSubheading.textContent =
        profileStatus === 'pending_payment'
          ? 'We detected a pending payment. Finish checkout to unlock full access to daily quizzes.'
          : 'Choose a plan to unlock personalised quizzes, analytics, and study support.';
    }
    collection.innerHTML = `
      <div class="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
        ${profileStatus === 'pending_payment'
          ? 'Resume your checkout to activate the plan you selected.'
          : 'Explore the catalogue to add a plan to your dashboard.'}
      </div>
    `;
    updateHeroForSubscription(null, profileStatus);
    return;
  }

  const sorted = subscriptions.sort(compareSubscriptions);
  const selected = getSelectedSubscription(sorted);

  if (selected && selected.id !== state.defaultSubscriptionId) {
    state.defaultSubscriptionId = selected.id;
  }

  const hasActive = sorted.some(isSubscriptionActive);
  if (planHeading) {
    planHeading.textContent = 'Manage your subscriptions';
  }
  if (planSubheading) {
    planSubheading.textContent = hasActive
      ? 'Select which plan should power your daily questions.'
      : 'Renew a plan to restore access to daily questions.';
  }

  collection.replaceChildren(...sorted.map(createPlanCard));

  card.classList.remove('hidden');
  updateHeroForSubscription(selected, profileStatus);
  updatePlanCollectionLabels();
}

function updateHeader() {
  const greetingEl = elements.userGreeting;
  const emailEl = elements.userEmail;

  if (state.profile?.full_name && greetingEl) {
    const firstName = state.profile.full_name.split(' ')[0];
    greetingEl.textContent = `Welcome back, ${firstName}`;
  } else if (state.user?.email && greetingEl) {
    greetingEl.textContent = `Welcome back, ${state.user.email.split('@')[0]}`;
  }

  if (elements.heroName) {
    if (state.profile?.full_name) {
      elements.heroName.textContent = state.profile.full_name;
    } else if (state.user?.email) {
      elements.heroName.textContent = state.user.email.split('@')[0];
    } else {
      elements.heroName.textContent = 'Learner';
    }
  }

  if (emailEl && state.user?.email) {
    emailEl.textContent = state.user.email;
  }
}

function toPercent(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

function updateQuizSection() {
  // Hide timer and progress bar on main dashboard
  if (elements.quizTimer) {
    elements.quizTimer.classList.add('hidden');
  }
  if (elements.progressBar) {
    elements.progressBar.style.width = '0%';
  }
  if (elements.progressLabel) {
    elements.progressLabel.textContent = '';
  }

  // Update quiz card based on today's quiz status
  if (!state.todayQuiz) {
    // No quiz exists yet
    if (elements.quizTitle) {
      elements.quizTitle.textContent = "Today's Questions";
    }
    if (elements.quizSubtitle) {
      elements.quizSubtitle.textContent = 'Your daily practice questions are ready to generate';
    }
    if (elements.resumeBtn) {
      elements.resumeBtn.textContent = 'Start Daily Questions';
      elements.resumeBtn.classList.remove('hidden');
    }
    if (elements.regenerateBtn) {
      elements.regenerateBtn.classList.add('hidden');
    }
    if (elements.questions) {
      elements.questions.innerHTML = `
        <div class="rounded-2xl border border-slate-200 bg-white px-6 py-8 text-center">
          <svg class="h-16 w-16 mx-auto text-cyan-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>
          </svg>
          <h3 class="text-lg font-semibold text-slate-900 mb-2">Ready to Practice?</h3>
          <p class="text-sm text-slate-600 mb-4">Click "Start Daily Questions" to begin your personalized practice session for today.</p>
          <p class="text-xs text-slate-500">Questions are tailored to your department and study progress</p>
        </div>
      `;
    }
  } else if (state.todayQuiz.status === 'completed') {
    // Quiz completed
    if (elements.quizTitle) {
      elements.quizTitle.textContent = "Today's Questions - Completed ✓";
    }
    if (elements.quizSubtitle) {
      const score = state.todayQuiz.correct_answers || 0;
      const total = state.todayQuiz.total_questions || 0;
      const percent = total ? toPercent(score, total) : 0;
      elements.quizSubtitle.textContent = `Score: ${score}/${total} (${percent}%)`;
    }
    if (elements.resumeBtn) {
      elements.resumeBtn.textContent = 'Review Results';
      elements.resumeBtn.classList.remove('hidden');
    }
    if (elements.regenerateBtn) {
      elements.regenerateBtn.classList.remove('hidden');
    }
    if (elements.questions) {
      elements.questions.innerHTML = `
        <div class="rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-8 text-center">
          <svg class="h-16 w-16 mx-auto text-emerald-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <h3 class="text-lg font-semibold text-emerald-900 mb-2">Great Job!</h3>
          <p class="text-sm text-emerald-700 mb-4">You've completed today's questions. Click "Review Results" to see detailed feedback and corrections.</p>
          <div class="flex justify-center gap-4 text-sm">
            <span class="font-medium">Score: ${state.todayQuiz.correct_answers}/${state.todayQuiz.total_questions}</span>
            <span class="font-medium">${toPercent(state.todayQuiz.correct_answers, state.todayQuiz.total_questions)}%</span>
          </div>
        </div>
      `;
    }
    if (elements.completionBanner) {
      elements.completionBanner.classList.remove('hidden');
    }
  } else {
    // Quiz in progress or assigned
    if (elements.quizTitle) {
      elements.quizTitle.textContent = "Today's Questions - In Progress";
    }
    if (elements.quizSubtitle) {
      elements.quizSubtitle.textContent = 'Continue where you left off';
    }
    if (elements.resumeBtn) {
      elements.resumeBtn.textContent = 'Continue Quiz';
      elements.resumeBtn.classList.remove('hidden');
    }
    if (elements.regenerateBtn) {
      elements.regenerateBtn.classList.remove('hidden');
    }
    if (elements.questions) {
      elements.questions.innerHTML = `
        <div class="rounded-2xl border border-cyan-200 bg-cyan-50 px-6 py-8 text-center">
          <svg class="h-16 w-16 mx-auto text-cyan-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <h3 class="text-lg font-semibold text-cyan-900 mb-2">Quiz in Progress</h3>
          <p class="text-sm text-cyan-700 mb-4">You have an ongoing quiz session. Click "Continue Quiz" to resume answering questions.</p>
          <p class="text-xs text-cyan-600">Your progress is automatically saved</p>
        </div>
      `;
    }
  }

  updateStats();
}

function updateStats() {
  // Update status
  if (elements.statStatus) {
    if (!state.todayQuiz) {
      elements.statStatus.textContent = 'Not Started';
    } else {
      elements.statStatus.textContent = state.todayQuiz.status
        ? state.todayQuiz.status.replace(/_/g, ' ')
        : '—';
    }
  }

  // Update progress
  if (elements.statProgress) {
    if (!state.todayQuiz) {
      elements.statProgress.textContent = '0 / 0';
    } else if (state.todayQuiz.status === 'completed') {
      elements.statProgress.textContent = `${state.todayQuiz.total_questions} / ${state.todayQuiz.total_questions}`;
    } else {
      // For in-progress, we'd need to fetch actual answered count
      elements.statProgress.textContent = '— / —';
    }
  }

  // Update score
  if (elements.statScore) {
    if (!state.todayQuiz || state.todayQuiz.status !== 'completed') {
      elements.statScore.textContent = '—';
    } else {
      elements.statScore.textContent = `${state.todayQuiz.correct_answers} correct`;
    }
  }
}

function renderHistory() {
  if (!elements.historyBody && !elements.historyCards) return;
  
  if (!state.history.length) {
    // Empty state for table
    if (elements.historyBody) {
      elements.historyBody.innerHTML =
        '<tr><td class="px-4 py-4 text-slate-500" colspan="4">No quiz history yet. Complete today\'s quiz to start your streak.</td></tr>';
    }
    // Empty state for cards
    if (elements.historyCards) {
      elements.historyCards.innerHTML = `
        <div class="text-center py-12">
          <svg class="mx-auto h-12 w-12 text-slate-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
          </svg>
          <p class="text-sm text-slate-500">No quiz history yet</p>
          <p class="text-xs text-slate-400 mt-1">Complete today's quiz to start your streak</p>
        </div>
      `;
    }
    elements.historySummary.textContent = '0 completed this week';
    if (elements.statStreak) {
      elements.statStreak.textContent = '0 days';
    }
    return;
  }

  // Render mobile cards
  if (elements.historyCards) {
    const cards = state.history
      .map((item) => {
        const statusBadge = (() => {
          const base = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ';
          if (item.status === 'completed') {
            return `<span class="${base} bg-emerald-100 text-emerald-700">✓ Completed</span>`;
          }
          if (item.status === 'in_progress') {
            return `<span class="${base} bg-sky-100 text-sky-700">⏳ In Progress</span>`;
          }
          return `<span class="${base} bg-slate-100 text-slate-500">📋 Assigned</span>`;
        })();

        const score = item.total_questions
          ? `${item.correct_answers}/${item.total_questions}`
          : '—';
        
        const percent = item.total_questions
          ? toPercent(item.correct_answers, item.total_questions)
          : 0;

        const percentColor = percent >= 80 ? 'text-emerald-600' : percent >= 60 ? 'text-sky-600' : percent >= 40 ? 'text-amber-600' : 'text-red-600';

        const reviewBtn = item.status === 'completed' 
          ? `<button onclick="window.location.href='result-face.html?daily_quiz_id=${item.id}'" class="w-full mt-3 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-700 active:scale-95 transition-all">View Results</button>`
          : '';

        return `
          <div class="rounded-xl border border-slate-200 bg-white p-4 hover:border-cyan-300 hover:shadow-md transition-all">
            <div class="flex items-start justify-between mb-3">
              <div>
                <p class="text-sm font-semibold text-slate-900">${formatDate(item.assigned_date)}</p>
                <p class="text-xs text-slate-500 mt-0.5">${new Date(item.assigned_date).toLocaleDateString('en-US', { weekday: 'long' })}</p>
              </div>
              ${statusBadge}
            </div>
            
            ${item.total_questions ? `
              <div class="flex items-center gap-4 py-3 border-t border-slate-100">
                <div class="flex-1">
                  <p class="text-xs text-slate-500 mb-1">Score</p>
                  <p class="text-lg font-bold text-slate-900">${score}</p>
                </div>
                <div class="flex-1">
                  <p class="text-xs text-slate-500 mb-1">Percentage</p>
                  <p class="text-lg font-bold ${percentColor}">${percent}%</p>
                </div>
              </div>
            ` : '<div class="py-2 text-center text-sm text-slate-400">Not started</div>'}
            
            ${reviewBtn}
          </div>
        `;
      })
      .join('');

    elements.historyCards.innerHTML = cards;
  }

  // Render desktop table rows
  if (elements.historyBody) {
    const rows = state.history
      .map((item) => {
        const statusBadge = (() => {
          const base =
            'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ';
          if (item.status === 'completed') {
            return `<span class="${base} bg-emerald-100 text-emerald-700">Completed</span>`;
          }
          if (item.status === 'in_progress') {
            return `<span class="${base} bg-sky-100 text-sky-700">In Progress</span>`;
          }
          return `<span class="${base} bg-slate-100 text-slate-500">Assigned</span>`;
        })();

        const score = item.total_questions
          ? `${item.correct_answers}/${item.total_questions} (${toPercent(item.correct_answers, item.total_questions)}%)`
          : '—';

        const reviewBtn = item.status === 'completed' 
          ? `<button type="button" onclick="window.location.href='result-face.html?daily_quiz_id=${item.id}'" class="inline-flex items-center gap-2 rounded-full bg-cyan-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-700 focus:outline-none focus:ring focus:ring-cyan-200">Review</button>`
          : '—';

        return `
        <tr>
          <td class="whitespace-nowrap px-4 py-3 text-sm text-slate-700">${formatDate(item.assigned_date)}</td>
          <td class="px-4 py-3">${statusBadge}</td>
          <td class="px-4 py-3 text-sm text-slate-700">${score}</td>
          <td class="px-4 py-3 text-sm text-slate-500">${reviewBtn}</td>
        </tr>
      `;
      })
      .join('');

    elements.historyBody.innerHTML = rows;
  }

  const completedThisWeek = state.history.filter(
    (item) => item.status === 'completed'
  ).length;
  elements.historySummary.textContent = `${completedThisWeek} completed in last ${state.history.length} days`;

  const streak = calculateStreak(state.history);
  if (elements.statStreak) {
    elements.statStreak.textContent = `${streak} ${streak === 1 ? 'day' : 'days'}`;
  }
}

function describeExtraSchedule(set) {
  if (!set) return 'Available anytime';
  const { starts_at: startsAt, ends_at: endsAt } = set;
  if (startsAt && endsAt) {
    return `${formatDateTime(startsAt)} → ${formatDateTime(endsAt)}`;
  }
  if (startsAt) {
    return `Opens ${formatDateTime(startsAt)}`;
  }
  if (endsAt) {
    return `Available until ${formatDateTime(endsAt)}`;
  }
  return 'Available anytime';
}

function describeExtraTimer(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) {
    return 'No timer';
  }
  const minutes = Math.round(value / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (remaining === 0) {
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  return `${hours}h ${remaining}m`;
}

function renderExtraQuestionSets() {
  const section = elements.extraSetsSection;
  const list = elements.extraSetsList;
  if (!section || !list) return;

  const sets = Array.isArray(state.extraQuestionSets)
    ? state.extraQuestionSets
    : [];

  if (!sets.length) {
    section.classList.remove('hidden');
    list.innerHTML = `
      <div class="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
        No bonus practice sets are available for your profile yet. Check back later!
      </div>
    `;
    return;
  }

  const cards = sets
    .map((set) => {
      const schedule = describeExtraSchedule(set);
      const timer = describeExtraTimer(set.time_limit_seconds);
      const canStart = Boolean(set.is_active);
      return `
        <article class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-cyan-200 hover:shadow-md">
          <header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div class="space-y-1">
              <h4 class="text-lg font-semibold text-slate-900">${escapeHtml(set.title || 'Untitled set')}</h4>
              <p class="text-sm text-slate-600">${escapeHtml(set.description || 'Topical questions curated for your department.')}</p>
            </div>
            <span class="inline-flex items-center gap-1 rounded-full ${set.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'} px-3 py-1 text-xs font-semibold">
              ${set.is_active ? 'Active' : 'Inactive'}
            </span>
          </header>
          <dl class="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
            <div class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1">
              <span class="font-semibold text-slate-700">Questions:</span>
              <span>${Number(set.question_count ?? 0)}</span>
            </div>
            <div class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1">
              <span class="font-semibold text-slate-700">Schedule:</span>
              <span>${escapeHtml(schedule)}</span>
            </div>
            <div class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1">
              <span class="font-semibold text-slate-700">Timer:</span>
              <span>${escapeHtml(timer)}</span>
            </div>
          </dl>
          <div class="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring focus:ring-cyan-200 ${canStart ? 'bg-cyan-700 text-white hover:bg-cyan-800' : 'bg-slate-200 text-slate-500 cursor-not-allowed'}"
              data-action="start-extra-set"
              data-set-id="${set.id}"
              ${canStart ? '' : 'disabled aria-disabled="true"'}
            >
              ${canStart ? 'Start practice' : 'Not available'}
            </button>
          </div>
        </article>
      `;
    })
    .join('');

  section.classList.remove('hidden');
  list.innerHTML = cards;
}

async function loadExtraQuestionSets() {
  if (!state.supabase) return;

  const list = elements.extraSetsList;
  const section = elements.extraSetsSection;
  if (section) {
    section.classList.remove('hidden');
  }
  if (list) {
    list.innerHTML = `
      <div class="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
        Loading bonus practice sets…
      </div>
    `;
  }

  try {
    const { data, error } = await state.supabase
      .from('extra_question_sets')
      .select('id, title, description, is_active, question_count, starts_at, ends_at, time_limit_seconds, updated_at')
      .order('updated_at', { ascending: false });
    if (error) throw error;

    const sets = Array.isArray(data) ? data : [];
    state.extraQuestionSets = sets.filter((set) => Number(set.question_count ?? 0) > 0);
    renderExtraQuestionSets();
  } catch (error) {
    const isMissingTimer =
      typeof error?.message === 'string' &&
      error.message.includes('time_limit_seconds');
    if (isMissingTimer) {
      try {
        const { data: fallbackData, error: fallbackError } = await state.supabase
          .from('extra_question_sets')
          .select('id, title, description, is_active, question_count, starts_at, ends_at, updated_at')
          .order('updated_at', { ascending: false });
        if (fallbackError) throw fallbackError;
        const sets = Array.isArray(fallbackData) ? fallbackData : [];
        state.extraQuestionSets = sets
          .filter((set) => Number(set.question_count ?? 0) > 0)
          .map((set) => ({ ...set, time_limit_seconds: null }));
        renderExtraQuestionSets();
        return;
      } catch (fallbackError) {
        console.error('[Dashboard] loadExtraQuestionSets fallback failed', fallbackError);
        state.extraQuestionSets = [];
        if (list) {
          list.innerHTML = `
            <div class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-700">
              Unable to load bonus practice sets. Please refresh to try again.
            </div>
          `;
        }
        showToast('Unable to load bonus practice sets.', 'error');
        return;
      }
    }
    console.error('[Dashboard] loadExtraQuestionSets failed', error);
    state.extraQuestionSets = [];
    if (list) {
      list.innerHTML = `
        <div class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-700">
          Unable to load bonus practice sets. Please refresh to try again.
        </div>
      `;
    }
    showToast('Unable to load bonus practice sets.', 'error');
  }
}

function handleExtraSetsClick(event) {
  const startBtn = event.target.closest('[data-action="start-extra-set"]');
  if (!startBtn) return;

  if (startBtn.disabled) return;

  const setId = startBtn.dataset.setId;
  if (!setId) return;

  let debugPayload = null;
  try {
    debugPayload = {
      setId,
      clickedAt: new Date().toISOString(),
      source: window.location.href,
      buttonState: {
        disabled: Boolean(startBtn.disabled),
        text: startBtn.textContent?.trim() || null,
      },
    };
    sessionStorage.setItem('extra_set_launch_debug', JSON.stringify(debugPayload));
  } catch (storageError) {
    console.debug('[Dashboard] Unable to persist extra set launch debug info', storageError);
  }

  console.debug('[Dashboard] Navigating to extra practice set', debugPayload || { setId });

  const url = new URL('exam-face.html', window.location.href);
  url.searchParams.set('extra_question_set_id', setId);
  window.location.href = `${url.pathname}${url.search}`;
}

function calculateStreak(history) {
  const sorted = history
    .map((item) => ({ ...item, assigned_date: item.assigned_date }))
    .sort((a, b) => new Date(b.assigned_date) - new Date(a.assigned_date));

  let streak = 0;
  let cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  for (const item of sorted) {
    const itemDate = new Date(item.assigned_date);
    itemDate.setHours(0, 0, 0, 0);

    if (itemDate.getTime() === cursor.getTime()) {
      if (item.status === 'completed') {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
        continue;
      }
      break;
    }

    if (itemDate < cursor) {
      break;
    }
  }

  return streak;
}

async function loadScheduleHealth() {
  if (!state.supabase) {
    updateScheduleNotice(null);
    return;
  }
  try {
    const { data, error } = await state.supabase.rpc('get_user_schedule_health');
    if (error) throw error;
    state.scheduleHealth = data || null;
    updateScheduleNotice(state.scheduleHealth);
  } catch (error) {
    console.error('[Dashboard] loadScheduleHealth failed', error);
    state.scheduleHealth = { status: 'error', message: error.message };
    updateScheduleNotice(state.scheduleHealth);
  }
}

async function checkTodayQuiz() {
  const today = new Date().toISOString().slice(0, 10);
  
  try {
    const { data: quiz, error } = await state.supabase
      .from('daily_quizzes')
      .select('id, status, total_questions, correct_answers, started_at, completed_at, assigned_date, subscription_id')
      .eq('user_id', state.user.id)
      .eq('assigned_date', today)
      .maybeSingle();

    if (error) throw error;
    state.todayQuiz = quiz;
    updateQuizSection();
    updatePlanCollectionLabels(state.todayQuiz);
  } catch (error) {
    console.error('[Dashboard] checkTodayQuiz failed', error);
    showToast('Unable to check today\'s quiz status', 'error');
  }
}

async function startOrResumeQuiz() {
  try {
    const selectedSubscription = getSelectedSubscription();
    if (!selectedSubscription || !isSubscriptionActive(selectedSubscription)) {
      showToast('Select an active plan to generate your daily questions.', 'error');
      renderSubscription();
      return;
    }
    const rpcArgs = { p_subscription_id: selectedSubscription.id };

    if (!state.todayQuiz) {
      // Generate new quiz first
      showToast('Generating your daily questions...', 'info');
      const { data: generated, error: generateError } = await state.supabase.rpc(
        'generate_daily_quiz',
        rpcArgs,
      );
      if (generateError) {
        // Handle specific error messages
        const message = generateError.message || '';
        if (message.includes('no active subscription')) {
          showToast('You need an active subscription to access daily questions', 'error');
          await loadSubscriptions();
          return;
        }
        if (message.includes('no active study slot')) {
          showToast('No active study slot for your department today', 'error');
          return;
        }
        if (message.includes('selected subscription is no longer active')) {
          showToast('That plan is no longer active. Choose a different plan to continue.', 'error');
          await loadSubscriptions();
          return;
        }
        throw generateError;
      }
      
      const quizId = Array.isArray(generated) ? generated[0]?.daily_quiz_id : generated?.daily_quiz_id;
      if (!quizId) {
        throw new Error('Failed to generate quiz');
      }
      
      // Navigate to exam page
      window.location.href = `exam-face.html?daily_quiz_id=${quizId}`;
    } else if (state.todayQuiz.status === 'completed') {
      // Navigate to results page
      window.location.href = `result-face.html?daily_quiz_id=${state.todayQuiz.id}`;
    } else {
      // Resume existing quiz
      window.location.href = `exam-face.html?daily_quiz_id=${state.todayQuiz.id}`;
    }
  } catch (error) {
    console.error('[Dashboard] startOrResumeQuiz failed', error);
    showToast(error.message || 'Unable to start quiz. Please try again.', 'error');
  }
}

async function regenerateQuiz() {
  if (!window.confirm('Generate a fresh quiz for today? Your previous answers will be cleared.')) {
    return;
  }
  
  try {
    const selectedSubscription = getSelectedSubscription();
    if (!selectedSubscription || !isSubscriptionActive(selectedSubscription)) {
      showToast('Select an active plan before regenerating questions.', 'error');
      renderSubscription();
      return;
    }

    showToast('Generating new questions...', 'info');
    const { error: genError } = await state.supabase.rpc('generate_daily_quiz', {
      p_subscription_id: selectedSubscription.id,
    });
    if (genError) {
      const message = genError.message || '';
      if (message.includes('selected subscription is no longer active')) {
        showToast('That plan is no longer active. Choose a different plan to continue.', 'error');
        await loadSubscriptions();
        return;
      }
      throw genError;
    }
    
    await checkTodayQuiz();
    await refreshHistory();
    showToast('New daily quiz generated!', 'success');
  } catch (error) {
    console.error('[Dashboard] regenerateQuiz failed', error);
    showToast(error.message || 'Unable to generate new quiz', 'error');
  }
}

async function refreshHistory() {
  try {
    const { data, error } = await state.supabase
      .from('daily_quizzes')
      .select('id, assigned_date, status, total_questions, correct_answers, completed_at')
      .eq('user_id', state.user.id)
      .order('assigned_date', { ascending: false })
      .limit(14);
    if (error) throw error;

    state.history = data || [];
    renderHistory();
    updatePlanCollectionLabels(state.todayQuiz);
  } catch (error) {
    console.error('[Dashboard] refreshHistory failed', error);
    showToast('Unable to load history', 'error');
  }
}

async function loadSubscriptions() {
  if (!state.supabase || !state.user) return;

  try {
    if (!state.defaultSubscriptionId && state.profile?.default_subscription_id) {
      state.defaultSubscriptionId = state.profile.default_subscription_id;
    }

    const { data, error } = await state.supabase
      .from('user_subscriptions')
      .select(
        `id, status, started_at, expires_at, purchased_at, quantity, renewed_from_subscription_id,
         plan:subscription_plans (
           id,
           name,
           duration_days,
           price,
           currency,
           daily_question_limit,
           plan_tier,
           metadata,
           product:subscription_products (
             id,
             name,
             department_id,
             department:departments (
               id,
               name,
               slug,
               color_theme
             )
           )
         )`
      )
      .eq('user_id', state.user.id)
      .order('expires_at', { ascending: true, nullsLast: true })
      .order('started_at', { ascending: true });

    if (error) throw error;

    state.subscriptions = Array.isArray(data) ? data : [];

    const hasActive = state.subscriptions.some(isSubscriptionActive);
    if (state.profile && state.profile.subscription_status !== 'pending_payment') {
      state.profile.subscription_status = hasActive
        ? 'active'
        : state.subscriptions.length
        ? 'expired'
        : 'inactive';
    }
  } catch (error) {
    console.error('[Dashboard] loadSubscriptions failed', error);
    showToast('Unable to load subscription details', 'error');
    state.subscriptions = [];
  }

  renderSubscription();
}

async function ensureProfile() {
  const fallbackName = state.user.email?.split('@')[0] ?? 'Learner';
  try {
    const { data, error } = await state.supabase
      .from('profiles')
      .select('id, full_name, role, last_seen_at, subscription_status, default_subscription_id')
      .eq('id', state.user.id)
      .maybeSingle();
    if (error) throw error;

    if (!data) {
      const { data: inserted, error: insertError } = await state.supabase
        .from('profiles')
        .upsert({
          id: state.user.id,
          full_name: state.user.user_metadata?.full_name ?? fallbackName,
          role: 'learner',
          last_seen_at: new Date().toISOString(),
        })
        .select('id, full_name, role, last_seen_at, subscription_status, default_subscription_id')
        .single();
      if (insertError) throw insertError;
      state.profile = inserted;
    } else {
      const { data: updated, error: updateError } = await state.supabase
        .from('profiles')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', state.user.id)
        .select('id, full_name, role, last_seen_at, subscription_status, default_subscription_id')
        .single();
      if (!updateError && updated) {
        state.profile = updated;
      } else {
        state.profile = data;
      }
    }

    state.defaultSubscriptionId = state.profile?.default_subscription_id || null;
  } catch (error) {
    console.error('[Dashboard] ensureProfile failed', error);
    showToast('Unable to load profile', 'error');
    state.profile = {
      full_name: fallbackName,
      subscription_status: 'inactive',
      default_subscription_id: null,
    };
    state.defaultSubscriptionId = null;
  }
}

async function handleLogout() {
  closeMobileMenu();
  try {
    await state.supabase.auth.signOut();
    clearSessionFingerprint();
    window.location.replace('login.html');
  } catch (error) {
    console.error('[Dashboard] signOut failed', error);
    showToast('Unable to sign out. Please try again.', 'error');
  }
}

function toggleMobileMenu(force) {
  const menu = elements.mobileMenu;
  const toggle = elements.mobileMenuToggle;
  if (!menu || !toggle) return;
  const isOpen = !menu.classList.contains('hidden');
  const shouldOpen = force ?? !isOpen;
  if (shouldOpen) {
    menu.classList.remove('hidden');
    toggle.setAttribute('aria-expanded', 'true');
  } else {
    menu.classList.add('hidden');
    toggle.setAttribute('aria-expanded', 'false');
  }
}

function closeMobileMenu() {
  toggleMobileMenu(false);
}

function handleMobileClick(event) {
  event.preventDefault();
  event.stopPropagation();
  toggleMobileMenu();
}

function handleMobileTouch(event) {
  event.preventDefault();
  event.stopPropagation();
  toggleMobileMenu();
}

function handleMobileMenuOutsideClick(event) {
  const menu = elements.mobileMenu;
  const wrapper = elements.mobileMenuWrapper;
  if (!menu || menu.classList.contains('hidden')) return;
  if (wrapper && wrapper.contains(event.target)) {
    if (elements.mobileMenuToggle?.contains(event.target)) {
      return;
    }
    if (menu.contains(event.target)) {
      return;
    }
  }
  closeMobileMenu();
}

async function initialise() {
  try {
    state.supabase = await getSupabaseClient();
    const { data: { session } } = await state.supabase.auth.getSession();
    if (!session?.user) {
      window.location.replace('login.html');
      return;
    }
    state.user = session.user;

    state.supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!newSession?.user) {
        window.location.replace('login.html');
      }
    });

    await ensureProfile();
    await loadSubscriptions();
    updateHeader();

    // Bind event listeners
    elements.resumeBtn?.addEventListener('click', startOrResumeQuiz);
    elements.regenerateBtn?.addEventListener('click', regenerateQuiz);
    elements.logoutBtn?.addEventListener('click', handleLogout);
    elements.mobileMenuToggle?.addEventListener('click', handleMobileClick);
    elements.mobileMenuToggle?.addEventListener('touchend', handleMobileTouch, {
      passive: false,
    });
    elements.mobileHome?.addEventListener('click', () => {
      closeMobileMenu();
      window.location.href = 'admin-board.html';
    });
    elements.mobileLogout?.addEventListener('click', handleLogout);
    elements.planCollection?.addEventListener('click', handlePlanCollectionClick);
    elements.extraSetsList?.addEventListener('click', handleExtraSetsClick);

    if (elements.mobileMenu) {
      document.addEventListener('click', handleMobileMenuOutsideClick);
      document.addEventListener('keydown', handleEscapeKey);
      window.addEventListener('resize', closeMobileMenu);
    }

    // Load data without auto-generating quiz
    await loadScheduleHealth();
    await checkTodayQuiz();
    await refreshHistory();
    await loadExtraQuestionSets();
  } catch (error) {
    console.error('[Dashboard] initialisation failed', error);
    showToast('Something went wrong while loading the dashboard.', 'error');
  }
}

function handleEscapeKey(event) {
  if (event.key === 'Escape') {
    closeMobileMenu();
  }
}

function cleanup() {
  if (elements.mobileMenu) {
    document.removeEventListener('click', handleMobileMenuOutsideClick);
    document.removeEventListener('keydown', handleEscapeKey);
    window.removeEventListener('resize', closeMobileMenu);
    elements.mobileMenuToggle?.removeEventListener('click', handleMobileClick);
    elements.mobileMenuToggle?.removeEventListener('touchend', handleMobileTouch);
  }
  elements.planCollection?.removeEventListener('click', handlePlanCollectionClick);
  elements.extraSetsList?.removeEventListener('click', handleExtraSetsClick);
}

window.addEventListener('beforeunload', cleanup);

initialise();

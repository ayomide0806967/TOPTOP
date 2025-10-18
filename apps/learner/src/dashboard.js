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
  scheduleNoticeTitle: document.querySelector(
    '[data-role="schedule-notice-title"]'
  ),
  scheduleNoticeHeadline: document.querySelector(
    '[data-role="schedule-notice-headline"]'
  ),
  scheduleNoticeDetail: document.querySelector(
    '[data-role="schedule-notice-detail"]'
  ),
  scheduleNoticeMeta: document.querySelector(
    '[data-role="schedule-notice-meta"]'
  ),
  heroName: document.querySelector('[data-role="hero-name"]'),
  heroPlanHeadline: document.querySelector('[data-role="hero-plan-headline"]'),
  heroDaysRemaining: document.querySelector(
    '[data-role="hero-days-remaining"]'
  ),
  heroProgressBar: document.querySelector('[data-role="hero-progress-bar"]'),
  heroProgressLabel: document.querySelector(
    '[data-role="hero-progress-label"]'
  ),
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
  userGreeting: document.querySelector('[data-role="user-greeting"]'),
  userEmail: document.querySelector('[data-role="user-email"]'),
  subscriptionCard: document.querySelector('[data-role="subscription-card"]'),
  planHeading: document.querySelector('[data-role="plan-heading"]'),
  planSubheading: document.querySelector('[data-role="plan-subheading"]'),
  planBrowseBtn: document.querySelector('[data-role="plan-browse"]'),
  planCollection: document.querySelector('[data-role="plan-collection"]'),
  extraSetsSection: document.querySelector('[data-role="extra-sets-section"]'),
  extraSetsList: document.querySelector('[data-role="extra-sets-list"]'),
  bonusNavButton: document.querySelector('[data-nav-target="bonus"]'),
  bonusNotification: document.querySelector('[data-role="bonus-notification"]'),
  communityNavButton: document.querySelector('[data-nav-target="community"]'),
  communityNotification: document.querySelector(
    '[data-role="community-notification"]'
  ),
  communityThreadList: document.querySelector(
    '[data-role="community-thread-list"]'
  ),
  communityEmptyState: document.querySelector(
    '[data-role="community-empty-state"]'
  ),
  communityThreadView: document.querySelector(
    '[data-role="community-thread-view"]'
  ),
  communityThreadTitle: document.querySelector(
    '[data-role="community-thread-title"]'
  ),
  communityThreadMeta: document.querySelector(
    '[data-role="community-thread-meta"]'
  ),
  communityMessageList: document.querySelector(
    '[data-role="community-message-list"]'
  ),
  communityReplyForm: document.querySelector(
    '[data-role="community-reply-form"]'
  ),
  communityReplyInput: document.querySelector(
    '[data-role="community-reply-input"]'
  ),
  communityReplyAttachments: document.querySelector(
    '[data-role="community-reply-attachments"]'
  ),
  communityReplyFile: document.querySelector('[data-role="community-reply-file"]'),
  communityReplySubmit: document.querySelector(
    '[data-role="community-reply-submit"]'
  ),
  communityThreadComposer: document.querySelector(
    '[data-role="community-thread-composer"]'
  ),
  communityThreadForm: document.querySelector(
    '[data-role="community-thread-form"]'
  ),
  communityThreadTitleInput: document.querySelector(
    '[data-role="community-thread-title"]'
  ),
  communityThreadMessageInput: document.querySelector(
    '[data-role="community-thread-message"]'
  ),
  communityThreadAttachments: document.querySelector(
    '[data-role="community-thread-attachments"]'
  ),
  communityThreadFileInput: document.querySelector(
    '[data-role="community-thread-file"]'
  ),
  communityThreadSubmit: document.querySelector(
    '[data-role="community-thread-submit"]'
  ),
  navButtons: Array.from(
    document.querySelectorAll('[data-role="nav-buttons"] [data-nav-target]')
  ),
  views: Array.from(document.querySelectorAll('[data-view]')),
  dashboardContent: document.querySelector('[data-role="dashboard-content"]'),
  paymentGate: document.querySelector('[data-role="payment-gate"]'),
  gatedBadge: document.querySelector('[data-role="gated-badge"]'),
  gatedTitle: document.querySelector('[data-role="gated-title"]'),
  gatedBody: document.querySelector('[data-role="gated-body"]'),
  gatedAction: document.querySelector('[data-role="gated-action"]'),
  profileForm: document.querySelector('[data-role="profile-form"]'),
  profileNameInput: document.querySelector('[data-role="profile-name"]'),
  profilePhoneInput: document.querySelector('[data-role="profile-phone"]'),
  profilePasswordInput: document.querySelector(
    '[data-role="profile-password"]'
  ),
  profilePasswordConfirmInput: document.querySelector(
    '[data-role="profile-password-confirm"]'
  ),
  profileFeedback: document.querySelector('[data-role="profile-feedback"]'),
  profileEmail: document.querySelector('[data-role="profile-email"]'),
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
  extraPlanId: null,
  isLoadingExtraSets: false,
  community: {
    threads: [],
    reads: new Map(),
    selectedThreadId: null,
    postsByThread: new Map(),
    userCache: new Map(),
    attachmentUrls: new Map(),
    isLoadingThreads: false,
    loadingThreadId: null,
    isCreatingThread: false,
    isSendingReply: false,
    composerAttachments: [],
    replyAttachments: [],
    subscription: null,
  },
};

let navigationBound = false;
let communityHandlersBound = false;

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

const DEFAULT_ASSIGNMENT_RULES = Object.freeze({
  default: { mode: 'full_set', value: null },
  overrides: [],
});

const ASSIGNMENT_MODES = new Set(['full_set', 'fixed_count', 'percentage']);

const ACTIVE_PLAN_STATUSES = new Set(['active', 'trialing']);

const COMMUNITY_ATTACHMENT_SIZE_LIMIT = 5 * 1024 * 1024;
const COMMUNITY_MAX_ATTACHMENTS = 4;
const COMMUNITY_ALLOWED_FILE_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);
const COMMUNITY_IMAGE_PREFIX = 'image/';

function setNavAvailability(hasActivePlan) {
  elements.navButtons.forEach((button) => {
    const requiresActive = button.dataset.navRequiresActive === 'true';
    if (!requiresActive) {
      button.disabled = false;
      return;
    }
    button.disabled = !hasActivePlan;
  });
}

function setActiveView(targetView) {
  if (!targetView) return;
  let matched = false;
  elements.views.forEach((section) => {
    const isMatch = section.dataset.view === targetView;
    section.classList.toggle('hidden', !isMatch);
    if (isMatch) matched = true;
  });
  if (!matched) return;

  elements.navButtons.forEach((button) => {
    const isActive = button.dataset.navTarget === targetView;
    button.classList.toggle('nav-button--active', isActive);
    if (isActive) {
      button.setAttribute('aria-current', 'page');
    } else {
      button.removeAttribute('aria-current');
    }
  });
}

function bindNavigation() {
  if (navigationBound) return;
  navigationBound = true;
  elements.navButtons = Array.from(
    document.querySelectorAll('[data-role="nav-buttons"] [data-nav-target]')
  );

  elements.navButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (button.disabled) return;
      const target = button.dataset.navTarget;
      setActiveView(target);
    });
  });

  const gatePlanButton = document.querySelector(
    '[data-role="payment-gate"] [data-nav-target="plan"]'
  );
  if (gatePlanButton) {
    gatePlanButton.addEventListener('click', () => {
      setActiveView('plan');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
}

function showToast(message, type = 'info') {
  if (!elements.toast) return;
  elements.toast.textContent = message;
  elements.toast.classList.remove('hidden');
  elements.toast.classList.remove(
    'border-red-200',
    'bg-red-50',
    'text-red-700',
    'border-emerald-200',
    'bg-emerald-50',
    'text-emerald-700',
    'border-sky-200',
    'bg-sky-50',
    'text-sky-700'
  );

  if (type === 'error') {
    elements.toast.classList.add('border-red-200', 'bg-red-50', 'text-red-700');
  } else if (type === 'success') {
    elements.toast.classList.add(
      'border-emerald-200',
      'bg-emerald-50',
      'text-emerald-700'
    );
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

function describeRelativeTime(dateString) {
  if (!dateString) return '';
  const timestamp = new Date(dateString);
  if (Number.isNaN(timestamp.getTime())) return '';
  const diffSeconds = Math.floor((Date.now() - timestamp.getTime()) / 1000);
  if (diffSeconds < 5) return 'Just now';
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  return formatDate(dateString);
}

function formatFileSize(bytes) {
  const numeric = Number(bytes);
  if (!Number.isFinite(numeric) || numeric < 0) return '—';
  if (numeric < 1024) return `${numeric} B`;
  if (numeric < 1024 ** 2) return `${(numeric / 1024).toFixed(1)} KB`;
  if (numeric < 1024 ** 3) return `${(numeric / 1024 ** 2).toFixed(1)} MB`;
  return `${(numeric / 1024 ** 3).toFixed(1)} GB`;
}

function validateCommunityAttachment(file) {
  if (!file) return 'File missing.';
  if (file.size > COMMUNITY_ATTACHMENT_SIZE_LIMIT) {
    return 'Files are limited to 5 MB each.';
  }
  if (!file.type) {
    return 'Unsupported file type.';
  }
  if (
    !file.type.startsWith(COMMUNITY_IMAGE_PREFIX) &&
    !COMMUNITY_ALLOWED_FILE_TYPES.has(file.type)
  ) {
    return 'Unsupported file type.';
  }
  return null;
}

function createAttachmentDraft(file) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    file,
    previewUrl: file.type?.startsWith(COMMUNITY_IMAGE_PREFIX)
      ? URL.createObjectURL(file)
      : null,
  };
}

function revokeAttachmentDraft(draft) {
  if (draft?.previewUrl) {
    URL.revokeObjectURL(draft.previewUrl);
  }
}

function pluralize(word, count) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function createThreadExcerpt(text) {
  if (!text) return '';
  return text.trim().slice(0, 160);
}

function buildPostExcerpt(content, attachments = []) {
  if (content && content.trim()) {
    return createThreadExcerpt(content);
  }
  return attachments.length ? 'Shared an attachment' : '';
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

function normalizeAssignmentRules(value) {
  const source = value && typeof value === 'object' ? value : {};
  const defaultSource =
    source.default && typeof source.default === 'object' ? source.default : {};
  const mode = ASSIGNMENT_MODES.has(defaultSource.mode)
    ? defaultSource.mode
    : 'full_set';
  const normalizedDefaultValue = normalizeAssignmentValue(
    mode,
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
      const overrideMode = ASSIGNMENT_MODES.has(override.mode)
        ? override.mode
        : 'full_set';
      const overrideValue = normalizeAssignmentValue(
        overrideMode,
        override.value
      );
      if (overrideMode !== 'full_set' && overrideValue === null) {
        return null;
      }
      return {
        planId: String(planId),
        mode: overrideMode,
        value: overrideMode === 'full_set' ? null : overrideValue,
      };
    })
    .filter(Boolean);

  return {
    default: {
      mode,
      value: mode === 'full_set' ? null : normalizedDefaultValue,
    },
    overrides,
  };
}

function describeExtraAssignment(rules) {
  const normalized = normalizeAssignmentRules(rules);
  const baseRule = normalized.default || DEFAULT_ASSIGNMENT_RULES.default;
  if (baseRule.mode === 'fixed_count') {
    return baseRule.value
      ? `${baseRule.value} question${baseRule.value === 1 ? '' : 's'} per attempt`
      : 'Fixed number (not configured)';
  }
  if (baseRule.mode === 'percentage') {
    return baseRule.value
      ? `${baseRule.value}% of the set per attempt`
      : 'Percentage (not configured)';
  }
  return 'Entire set delivered';
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

  const totalDays =
    startedAt && expiresAt
      ? Math.max(1, daysBetween(startedAt, expiresAt))
      : null;
  const daysRemaining = expiresAt
    ? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_IN_MS))
    : null;
  const usedDays =
    totalDays !== null && daysRemaining !== null
      ? clamp(totalDays - daysRemaining, 0, totalDays)
      : startedAt
        ? clamp(
            Math.round((now.getTime() - startedAt.getTime()) / DAY_IN_MS),
            0,
            totalDays ?? 30
          )
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

  const aExpires =
    parseDate(a?.expires_at)?.getTime() ?? Number.POSITIVE_INFINITY;
  const bExpires =
    parseDate(b?.expires_at)?.getTime() ?? Number.POSITIVE_INFINITY;
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

  const explicit = subscriptions.find(
    (entry) => entry.id === state.defaultSubscriptionId
  );
  if (explicit) return explicit;

  const activeSubs = subscriptions
    .filter(isSubscriptionActive)
    .sort(compareSubscriptions);
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
        profileStatus === 'pending_payment'
          ? 'Pending activation'
          : 'No active plan yet';
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
    const label =
      timeline.daysRemaining !== null
        ? `${timeline.daysRemaining} day${timeline.daysRemaining === 1 ? '' : 's'} left`
        : timeline.expiresAt
          ? `Renews ${formatDate(timeline.expiresAt.toISOString())}`
          : statusKey === 'trialing'
            ? 'Trial access is active'
            : 'Ongoing access';
    headlineEl.textContent = plan.name
      ? `${plan.name} • ${label}`
      : `Active plan • ${label}`;
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
    if (
      timeline.totalDays &&
      timeline.usedDays !== null &&
      timeline.daysRemaining !== null
    ) {
      progressLabelEl.textContent = `${timeline.usedDays} of ${timeline.totalDays} days used · ${timeline.daysRemaining} to go`;
    } else if (statusKey === 'trialing') {
      progressLabelEl.textContent =
        'Trial is underway. Upgrade any time to keep your streak going.';
    } else if (hasEnded) {
      progressLabelEl.textContent =
        'Plan expired. Renew to continue your personalised drills.';
    } else {
      progressLabelEl.textContent =
        'Your progress updates as you complete each day’s questions.';
    }
  }
}

function createPlanCard(subscription) {
  const plan = subscription.plan || {};
  const metadata =
    plan && plan.metadata && typeof plan.metadata === 'object'
      ? plan.metadata
      : {};
  const product = plan.product || {};
  const department = product.department || {};
  const timeline = getPlanTimeline(subscription);
  const statusKey = getSubscriptionStatus(subscription);
  const statusStyle = PLAN_STATUS_STYLES[statusKey] || PLAN_STATUS_STYLES.none;
  const isSelected = subscription.id === state.defaultSubscriptionId;
  const activeNow = isSubscriptionActive(subscription);
  const now = new Date();
  const startsInFuture =
    timeline.startedAt && timeline.startedAt.getTime() > now.getTime();

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
  header.className =
    'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between';

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
    subtitle.textContent =
      metadata?.tagline || metadata?.summary || plan.description;
    headerContent.appendChild(subtitle);
  }

  const badge = document.createElement('span');
  badge.className =
    'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide';
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
  progressBar.className =
    'h-2 w-full overflow-hidden rounded-full border border-white/40 bg-white/60 backdrop-blur-sm';

  const progressFill = document.createElement('div');
  progressFill.className =
    'h-full rounded-full transition-all duration-500 ease-out';
  progressFill.style.background = `linear-gradient(90deg, ${accentColor}, ${accentHover})`;
  progressFill.style.width = `${timeline.progressPercent ?? (statusKey === 'expired' ? 100 : 10)}%`;
  progressBar.appendChild(progressFill);

  const progressMeta = document.createElement('div');
  progressMeta.className =
    'flex flex-wrap items-center justify-between text-xs';
  progressMeta.style.color = mutedColor;
  if (
    timeline.totalDays &&
    timeline.usedDays !== null &&
    timeline.daysRemaining !== null
  ) {
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
  detailGrid.className =
    'mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4';

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

  const daysLabel =
    timeline.daysRemaining !== null
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
  footer.className =
    'mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between';

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
  buttonRow.className =
    'flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end w-full';

  const quizBtn = document.createElement('button');
  quizBtn.type = 'button';
  quizBtn.dataset.subscriptionId = subscription.id;
  quizBtn.dataset.role = 'plan-quiz';
  if (activeNow) {
    quizBtn.dataset.action = 'start-quiz';
    quizBtn.className =
      'inline-flex w-full sm:w-auto items-center justify-center rounded-full px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition focus:outline-none focus:ring-2 focus:ring-offset-1';
    quizBtn.style.background = `linear-gradient(135deg, ${accentColor}, ${accentHover})`;
    quizBtn.style.boxShadow = `0 14px 28px -18px ${accentColor}80`;
    quizBtn.textContent = 'Start daily quiz';
  } else {
    quizBtn.className =
      'inline-flex w-full sm:w-auto items-center justify-center rounded-full px-5 py-2.5 text-xs font-semibold uppercase tracking-wide cursor-not-allowed';
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
    useBtn.className =
      'inline-flex w-full sm:w-auto items-center justify-center gap-1 rounded-full px-5 py-2.5 text-xs font-semibold uppercase tracking-wide shadow-sm focus:outline-none';
    useBtn.style.background = accentSoft;
    useBtn.style.color = accentColor;
    useBtn.style.border = `1px solid ${accentColor}`;
    useBtn.disabled = true;
  } else if (!activeNow) {
    useBtn.textContent =
      statusKey === 'expired' ? 'Renew to reactivate' : 'Activates soon';
    useBtn.className =
      'inline-flex w-full sm:w-auto items-center justify-center rounded-full px-5 py-2.5 text-xs font-semibold uppercase tracking-wide cursor-not-allowed';
    useBtn.style.background = 'rgba(148, 163, 184, 0.2)';
    useBtn.style.color = '#64748b';
    useBtn.disabled = true;
  } else {
    useBtn.dataset.action = 'set-default';
    useBtn.className =
      'inline-flex w-full sm:w-auto items-center justify-center rounded-full px-5 py-2.5 text-xs font-semibold uppercase tracking-wide transition focus:outline-none focus:ring-2 focus:ring-offset-1';
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
  manageBtn.className =
    'inline-flex w-full sm:w-auto items-center justify-center rounded-full border px-5 py-2.5 text-xs font-semibold uppercase tracking-wide transition focus:outline-none focus:ring-2 focus:ring-offset-1';
  manageBtn.style.background = 'rgba(255, 255, 255, 0.65)';
  manageBtn.style.borderColor = borderColor;
  manageBtn.style.color = mutedColor;
  manageBtn.textContent =
    statusKey === 'expired' ? 'Renew plan' : 'Manage plan';
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
    const activeSubscriptionId =
      activeQuiz?.subscription_id || state.defaultSubscriptionId;
    const activePlan = state.subscriptions.find(
      (entry) => entry.id === activeSubscriptionId
    );
    const planName = activePlan?.plan?.name || 'current plan';
    showToast(
      `Submit your ${planName} quiz before starting another plan.`,
      'warning'
    );
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
    const { data, error } = await state.supabase.rpc(
      'set_default_subscription',
      {
        p_subscription_id: subscriptionId,
      }
    );
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
    showToast(
      error.message || 'Unable to switch plans. Please try again.',
      'error'
    );
  }
}

async function startDailyQuizForSubscription(subscriptionId) {
  if (!subscriptionId || !state.supabase) {
    showToast('We could not determine which plan to use.', 'error');
    return;
  }

  const subscription = state.subscriptions.find(
    (entry) => entry.id === subscriptionId
  );
  if (!subscription) {
    showToast('Plan details were not found. Refresh and try again.', 'error');
    return;
  }

  if (!isSubscriptionActive(subscription)) {
    showToast(
      'This plan is not currently active. Please renew it first.',
      'error'
    );
    return;
  }

  updatePlanCollectionLabels();

  try {
    await checkTodayQuiz();
    let existingQuiz = state.todayQuiz;
    const activeSubscriptionId =
      existingQuiz?.subscription_id || state.defaultSubscriptionId;
    const quizInProgress = existingQuiz && existingQuiz.status !== 'completed';
    if (
      quizInProgress &&
      activeSubscriptionId &&
      subscriptionId !== activeSubscriptionId
    ) {
      const activePlan = state.subscriptions.find(
        (entry) => entry.id === activeSubscriptionId
      );
      const planName = activePlan?.plan?.name || 'current plan';
      showToast(
        `Submit your ${planName} quiz before starting another plan.`,
        'warning'
      );
      updatePlanCollectionLabels(existingQuiz);
      return;
    }

    if (subscriptionId !== state.defaultSubscriptionId) {
      const { data, error } = await state.supabase.rpc(
        'set_default_subscription',
        {
          p_subscription_id: subscriptionId,
        }
      );
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

    const matchesUpdated =
      existingQuiz &&
      (existingQuiz.subscription_id === subscriptionId ||
        (!existingQuiz.subscription_id &&
          subscriptionId === state.defaultSubscriptionId));

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
        showToast(
          'You need an active subscription to access daily questions',
          'error'
        );
        return;
      }
      if (message.includes('selected subscription is no longer active')) {
        showToast(
          'That plan is no longer active. Choose a different plan to continue.',
          'error'
        );
        await loadSubscriptions();
        return;
      }
      if (message.includes('no active study slot')) {
        showToast('No active study slot for your department today', 'error');
        return;
      }
      if (message.toLowerCase().includes('lacks questions')) {
        const planName = subscription.plan?.name || 'this plan';
        showToast(
          `We do not have enough questions scheduled for ${planName} today. Try another plan or check back later.`,
          'warning'
        );
        await loadSubscriptions();
        updatePlanCollectionLabels();
        return;
      }
      throw error;
    }

    const quizId = Array.isArray(data)
      ? data[0]?.daily_quiz_id
      : data?.daily_quiz_id;
    if (!quizId) {
      throw new Error('Failed to generate quiz');
    }

    await checkTodayQuiz();
    updatePlanCollectionLabels(state.todayQuiz);

    window.location.href = `exam-face.html?daily_quiz_id=${quizId}`;
  } catch (error) {
    console.error('[Dashboard] startDailyQuizForSubscription failed', error);
    showToast(
      error.message || 'Unable to start quiz. Please try again.',
      'error'
    );
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
        entry.assignedDate === todayIso
    );

    let nextLabel = 'Start daily quiz';
    let nextAction = 'start-quiz';
    let quizId = '';
    let assignedDate = todayIso;
    let cached = false;

    const matchesSubscription =
      quiz &&
      (quiz.subscription_id === subscriptionId ||
        (!quiz.subscription_id &&
          subscriptionId === state.defaultSubscriptionId));

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
      detailText =
        'Daily questions will be available once the upcoming slot begins.';
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
        profileStatus === 'pending_payment'
          ? 'Payment pending'
          : 'No plans yet';
    }
    if (planSubheading) {
      planSubheading.textContent =
        profileStatus === 'pending_payment'
          ? 'We detected a pending payment. Finish checkout to unlock full access to daily quizzes.'
          : 'Choose a plan to unlock personalised quizzes, analytics, and study support.';
    }
    collection.innerHTML = `
      <div class="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
        ${
          profileStatus === 'pending_payment'
            ? 'Resume your checkout to activate the plan you selected.'
            : 'Explore the catalogue to add a plan to your dashboard.'
        }
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
  if (elements.profileEmail && state.user?.email) {
    elements.profileEmail.textContent = state.user.email;
  }
}

function toPercent(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

function updatePaymentGate(profile) {
  if (!elements.paymentGate || !elements.dashboardContent) return;

  const subscriptionStatus = (
    profile?.subscription_status || 'inactive'
  ).toLowerCase();
  const registrationStage =
    profile?.registration_stage ||
    (subscriptionStatus === 'pending_payment' ? 'awaiting_payment' : 'active');
  const hasActivePlan = ACTIVE_PLAN_STATUSES.has(subscriptionStatus);
  const pendingPlan = profile?.pending_plan_snapshot || null;

  setNavAvailability(hasActivePlan);

  if (hasActivePlan) {
    elements.paymentGate.classList.add('hidden');
    elements.dashboardContent.classList.remove('hidden');
    return;
  }

  const planName = pendingPlan?.name || 'your plan';
  const badgeLabel =
    registrationStage === 'awaiting_payment'
      ? 'Payment pending'
      : 'No active plan';
  const title =
    registrationStage === 'awaiting_payment'
      ? 'Almost there—finish activating your plan'
      : 'Add a plan to unlock personalised drills';
  const message =
    registrationStage === 'awaiting_payment'
      ? `We saved ${planName}. Complete checkout now to unlock daily exams, streak tracking, and bonus questions.`
      : 'Choose the plan that fits your goals. Once activated, your personalised study schedule appears here.';
  const actionHref =
    registrationStage === 'awaiting_payment'
      ? 'resume-registration.html'
      : 'subscription-plans.html';
  const actionLabel =
    registrationStage === 'awaiting_payment'
      ? 'Finish payment'
      : 'Browse plans';

  if (elements.gatedBadge) elements.gatedBadge.textContent = badgeLabel;
  if (elements.gatedTitle) elements.gatedTitle.textContent = title;
  if (elements.gatedBody) elements.gatedBody.textContent = message;
  if (elements.gatedAction) {
    elements.gatedAction.textContent = actionLabel;
    elements.gatedAction.setAttribute('href', actionHref);
  }

  elements.paymentGate.classList.remove('hidden');
  elements.dashboardContent.classList.add('hidden');
  setActiveView('dashboard');
}

function populateProfileForm() {
  if (!elements.profileForm) return;
  if (elements.profileNameInput && state.profile?.full_name) {
    elements.profileNameInput.value = state.profile.full_name;
  }
  if (elements.profilePhoneInput) {
    elements.profilePhoneInput.value = state.profile?.phone || '';
  }
  if (elements.profilePasswordInput) {
    elements.profilePasswordInput.value = '';
  }
  if (elements.profilePasswordConfirmInput) {
    elements.profilePasswordConfirmInput.value = '';
  }
  if (elements.profileFeedback) {
    elements.profileFeedback.classList.add('hidden');
    elements.profileFeedback.textContent = '';
  }
}

async function handleProfileSubmit(event) {
  event.preventDefault();
  if (!elements.profileForm) return;

  const nameInput = elements.profileNameInput;
  const phoneInput = elements.profilePhoneInput;
  const passwordInput = elements.profilePasswordInput;
  const confirmInput = elements.profilePasswordConfirmInput;
  const feedback = elements.profileFeedback;

  const fullName = nameInput?.value?.trim() || '';
  const phone = phoneInput?.value?.trim() || '';
  const newPassword = passwordInput?.value?.trim() || '';
  const confirmPassword = confirmInput?.value?.trim() || '';

  if (!fullName) {
    if (feedback) {
      feedback.textContent = 'Enter your full name before saving.';
      feedback.className =
        'rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700';
      feedback.classList.remove('hidden');
    }
    nameInput?.focus();
    return;
  }

  if (newPassword || confirmPassword) {
    if (newPassword.length < 8) {
      if (feedback) {
        feedback.textContent = 'Passwords must be at least 8 characters long.';
        feedback.className =
          'rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700';
        feedback.classList.remove('hidden');
      }
      passwordInput?.focus();
      return;
    }
    if (newPassword !== confirmPassword) {
      if (feedback) {
        feedback.textContent =
          'Passwords do not match. Re-enter the same password in both fields.';
        feedback.className =
          'rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700';
        feedback.classList.remove('hidden');
      }
      confirmInput?.focus();
      return;
    }
  }

  try {
    const updates = {};
    if (fullName) {
      updates.full_name = fullName;
      const [firstName, ...rest] = fullName.split(' ');
      updates.first_name = firstName || null;
      updates.last_name = rest.join(' ').trim() || null;
    }
    if (phone) {
      updates.phone = phone;
    }

    if (Object.keys(updates).length) {
      const { error: profileError } = await state.supabase
        .from('profiles')
        .update(updates)
        .eq('id', state.user.id);
      if (profileError) {
        throw profileError;
      }
    }

    if (newPassword) {
      const { error: passwordError } = await state.supabase.auth.updateUser({
        password: newPassword,
      });
      if (passwordError) {
        throw passwordError;
      }
    }

    if (feedback) {
      feedback.textContent = 'Profile updated successfully.';
      feedback.className =
        'rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700';
      feedback.classList.remove('hidden');
    }

    await ensureProfile();
    populateProfileForm();
  } catch (error) {
    console.error('[Dashboard] profile update failed', error);
    if (feedback) {
      const message =
        error?.message ||
        'Unable to update profile right now. Please try again later.';
      feedback.textContent = message;
      feedback.className =
        'rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700';
      feedback.classList.remove('hidden');
    }
  } finally {
    if (elements.profilePasswordInput) elements.profilePasswordInput.value = '';
    if (elements.profilePasswordConfirmInput)
      elements.profilePasswordConfirmInput.value = '';
  }
}

function setDailyButtonVariant(status) {
  const btn = elements.resumeBtn;
  if (!btn) return;
  const colorClasses = [
    'bg-red-600',
    'hover:bg-red-700',
    'bg-cyan-600',
    'hover:bg-cyan-700',
  ];
  btn.classList.remove(...colorClasses);
  btn.classList.add('text-white');
  if (status === 'completed') {
    btn.classList.add('bg-cyan-600', 'hover:bg-cyan-700');
  } else {
    btn.classList.add('bg-red-600', 'hover:bg-red-700');
  }
}

function updateQuizSection() {
  // Hide timer and progress bar on main dashboard
  if (elements.quizTimer) {
    elements.quizTimer.classList.add('hidden');
  }

  // Update quiz card based on today's quiz status
  if (!state.todayQuiz) {
    // No quiz exists yet
    if (elements.quizTitle) {
      elements.quizTitle.textContent = "Today's Questions";
    }
    if (elements.quizSubtitle) {
      elements.quizSubtitle.textContent =
        'Your daily practice questions are ready to generate';
    }
    if (elements.resumeBtn) {
      elements.resumeBtn.textContent = 'Start Daily Questions';
      elements.resumeBtn.classList.remove('hidden');
    }
    setDailyButtonVariant('pending');
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
    setDailyButtonVariant('completed');
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
    setDailyButtonVariant('pending');
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
          const base =
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ';
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

        const percentColor =
          percent >= 80
            ? 'text-emerald-600'
            : percent >= 60
              ? 'text-sky-600'
              : percent >= 40
                ? 'text-amber-600'
                : 'text-red-600';

        const reviewBtn =
          item.status === 'completed'
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

            ${
              item.total_questions
                ? `
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
            `
                : '<div class="py-2 text-center text-sm text-slate-400">Not started</div>'
            }

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

        const reviewBtn =
          item.status === 'completed'
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

function getExtraSetAvailability(set, nowMs = Date.now()) {
  if (!set) {
    return {
      isAvailable: false,
      isUpcoming: false,
      isExpired: true,
      startsAt: null,
      endsAt: null,
    };
  }
  const startsAt = set.starts_at ? new Date(set.starts_at) : null;
  const endsAt = set.ends_at ? new Date(set.ends_at) : null;
  const isActive = Boolean(set.is_active);
  const startsInFuture = startsAt ? startsAt.getTime() > nowMs : false;
  const ended = endsAt ? endsAt.getTime() < nowMs : false;

  return {
    isAvailable: isActive && !startsInFuture && !ended,
    isUpcoming: isActive && startsInFuture,
    isExpired: ended || !isActive,
    startsAt,
    endsAt,
  };
}

function deriveExtraSetStatus(set, attempts) {
  const availability = set.availability || getExtraSetAvailability(set);
  if (availability.isUpcoming) return 'upcoming';
  if (availability.isAvailable) {
    if (!attempts.length) return 'new';
    const latest = attempts[0];
    if (latest?.status === 'completed') {
      return 'completed';
    }
    return 'in_progress';
  }
  if (attempts.some((attempt) => attempt.status === 'completed')) {
    return 'completed_archived';
  }
  return 'inactive';
}

function describeExtraSchedule(set) {
  if (!set) return 'Available anytime';
  const availability = set.availability || getExtraSetAvailability(set);
  const { startsAt, endsAt } = availability;
  if (startsAt && endsAt) {
    return `${formatDateTime(startsAt.toISOString())} → ${formatDateTime(
      endsAt.toISOString()
    )}`;
  }
  if (startsAt) {
    return `Opens ${formatDateTime(startsAt.toISOString())}`;
  }
  if (endsAt) {
    return `Available until ${formatDateTime(endsAt.toISOString())}`;
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

function renderExtraStatusChip(set) {
  const base =
    'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold';
  switch (set.status) {
    case 'new':
      return `<span class="${base} bg-indigo-100 text-indigo-700">New</span>`;
    case 'in_progress':
      return `<span class="${base} bg-amber-100 text-amber-700">In progress</span>`;
    case 'completed':
      return `<span class="${base} bg-emerald-100 text-emerald-700">Completed</span>`;
    case 'completed_archived':
      return `<span class="${base} bg-emerald-100 text-emerald-700">Completed</span>`;
    case 'upcoming':
      return `<span class="${base} bg-sky-100 text-sky-700">Opens soon</span>`;
    default:
      return `<span class="${base} bg-slate-200 text-slate-600">Inactive</span>`;
  }
}

function renderExtraAttemptSummary(set) {
  const availability = set.availability || getExtraSetAvailability(set);
  const limitSummary =
    set.max_attempts_per_user && set.max_attempts_per_user > 0
      ? ` • Max ${set.max_attempts_per_user} attempt${set.max_attempts_per_user === 1 ? '' : 's'}`
      : '';
  if (availability.isUpcoming) {
    if (availability.startsAt) {
      return `Opens ${formatDateTime(availability.startsAt.toISOString())}${limitSummary}`;
    }
    return `Opens soon${limitSummary}`;
  }

  const completed = set.lastCompletedAttempt;
  if (completed) {
    const score = Number(completed.score_percent);
    const scoreText = Number.isFinite(score)
      ? `${score.toFixed(1)}%`
      : `${Number(completed.correct_answers ?? 0)}/${Number(completed.total_questions ?? 0)}`;
    const completedAt = completed.completed_at
      ? formatDateTime(completed.completed_at)
      : 'Recently';
    return `Last attempt: ${scoreText} • ${completedAt}${limitSummary}`;
  }

  const latest = set.latestAttempt;
  if (latest?.status === 'in_progress') {
    const startedAt = latest.started_at
      ? formatDateTime(latest.started_at)
      : 'Recently';
    return `Attempt in progress • Started ${startedAt}${limitSummary}`;
  }

  return `Not attempted yet.${limitSummary}`;
}

function updateBonusNavNotification() {
  const badge = elements.bonusNotification;
  if (!badge) return;
  const sets = Array.isArray(state.extraQuestionSets)
    ? state.extraQuestionSets
    : [];
  const newCount = sets.filter((set) => {
    const availability = set.availability || getExtraSetAvailability(set);
    if (!availability) return false;
    if (['completed', 'completed_archived'].includes(set.status)) return false;
    return availability.isAvailable || availability.isUpcoming;
  }).length;

  if (newCount > 0) {
    badge.textContent = newCount > 9 ? '9+' : String(newCount);
    badge.classList.add('is-visible');
    badge.setAttribute('aria-hidden', 'false');
  } else {
    badge.textContent = '';
    badge.classList.remove('is-visible');
    badge.setAttribute('aria-hidden', 'true');
  }
}

function updateCommunityNavNotification() {
  const badge = elements.communityNotification;
  if (!badge) return;

  const threads = Array.isArray(state.community?.threads)
    ? state.community.threads
    : [];
  const unreadCount = threads.reduce((total, thread) => {
    const lastActivity =
      thread.lastPostedAt || thread.updatedAt || thread.createdAt;
    if (!lastActivity) return total;
    const lastTs = new Date(lastActivity).getTime();
    if (!Number.isFinite(lastTs)) return total;
    const readIso = state.community.reads.get(thread.id);
    if (!readIso) return total + 1;
    const readTs = new Date(readIso).getTime();
    if (!Number.isFinite(readTs)) return total;
    return lastTs > readTs ? total + 1 : total;
  }, 0);

  if (unreadCount > 0) {
    badge.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
    badge.classList.add('is-visible');
    badge.setAttribute('aria-hidden', 'false');
  } else {
    badge.textContent = '';
    badge.classList.remove('is-visible');
    badge.setAttribute('aria-hidden', 'true');
  }
}

function sortCommunityThreads() {
  if (!Array.isArray(state.community?.threads)) return;
  state.community.threads.sort((a, b) => {
    const aTs = new Date(
      a.lastPostedAt || a.updatedAt || a.createdAt
    ).getTime();
    const bTs = new Date(
      b.lastPostedAt || b.updatedAt || b.createdAt
    ).getTime();
    return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0);
  });
}

async function ensureCommunityProfiles(userIds = []) {
  if (!state.supabase || !Array.isArray(userIds) || !userIds.length) return;
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  const missing = unique.filter((id) => !state.community.userCache.has(id));
  if (!missing.length) return;
  try {
    const { data, error } = await state.supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', missing);
    if (error) throw error;
    (data || []).forEach((row) => {
      state.community.userCache.set(row.id, row.full_name || 'Learner');
    });
  } catch (error) {
    console.error('[Community] ensureCommunityProfiles failed', error);
  }
}

function getCommunityUserName(userId) {
  if (!userId) return 'Learner';
  if (userId === state.user?.id) return 'You';
  const cached = state.community.userCache.get(userId);
  return cached || 'Learner';
}

function renderCommunityThreads() {
  const list = elements.communityThreadList;
  if (!list) return;

  if (state.community.isLoadingThreads) {
    list.innerHTML = `
      <div class="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
        Loading threads…
      </div>
    `;
    return;
  }

  if (!state.community.threads.length) {
    list.innerHTML = `
      <div class="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
        Be the first to start a conversation today.
      </div>
    `;
    return;
  }

  const cards = state.community.threads
    .map((thread) => {
      const isActive = state.community.selectedThreadId === thread.id;
      const lastActivity =
        thread.lastPostedAt || thread.updatedAt || thread.createdAt;
      const readIso = state.community.reads.get(thread.id);
      const unread =
        lastActivity &&
        (!readIso ||
          new Date(lastActivity).getTime() > new Date(readIso).getTime());
      const authorName = getCommunityUserName(
        thread.lastPostAuthorId || thread.createdBy
      );
      const metaParts = [
        authorName,
        describeRelativeTime(lastActivity),
        pluralize('message', Math.max(1, Number(thread.postCount ?? 0))),
      ].filter(Boolean);
      const metaHtml = metaParts
        .map((part, index) =>
          index === 0
            ? `<span>${escapeHtml(part)}</span>`
            : `<span>•</span><span>${escapeHtml(part)}</span>`
        )
        .join('');
      const excerpt = thread.lastPostExcerpt?.trim()
        ? escapeHtml(thread.lastPostExcerpt.trim())
        : 'Conversation just getting started.';

      return `
        <article
          class="community-thread-card${isActive ? ' community-thread-card--active' : ''}"
          data-thread-id="${escapeHtml(thread.id)}"
        >
          <div class="community-thread-card__title">
            ${escapeHtml(thread.title || 'Untitled thread')}
          </div>
          <div class="community-thread-card__meta">
            ${metaHtml}
            ${
              unread
                ? '<span class="community-thread-card__badge">New</span>'
                : ''
            }
          </div>
          <p class="community-thread-card__snippet">${excerpt}</p>
        </article>
      `;
    })
    .join('');

  list.innerHTML = cards;
}

function scrollCommunityMessagesToBottom() {
  if (!elements.communityMessageList) return;
  elements.communityMessageList.scrollTop =
    elements.communityMessageList.scrollHeight;
}

async function hydrateCommunityAttachments() {
  if (!elements.communityMessageList) return;
  const nodes = Array.from(
    elements.communityMessageList.querySelectorAll('[data-attachment-path]')
  );
  if (!nodes.length) return;

  await Promise.all(
    nodes.map(async (node) => {
      const path = node.dataset.attachmentPath;
      if (!path) return;
      try {
        const url = await getCommunityAttachmentUrl(path);
        if (!url) return;
        if (node.dataset.attachmentType === 'image') {
          node.setAttribute('src', url);
        } else {
          node.setAttribute('href', url);
          node.setAttribute('target', '_blank');
          node.setAttribute('rel', 'noopener noreferrer');
        }
        node.removeAttribute('data-attachment-path');
      } catch (error) {
        console.error('[Community] hydrate attachment failed', error);
      }
    })
  );
}

function renderCommunityThread(threadId, options = {}) {
  const { scrollToBottom = false } = options;
  const detail = elements.communityThreadView;
  const emptyState = elements.communityEmptyState;
  if (!detail || !emptyState) return;

  const thread = state.community.threads.find((item) => item.id === threadId);
  if (!thread) {
    detail.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  detail.classList.remove('hidden');

  if (elements.communityThreadTitle) {
    elements.communityThreadTitle.textContent =
      thread.title || 'Untitled thread';
  }

  if (elements.communityThreadMeta) {
    const owner = getCommunityUserName(thread.createdBy);
    const parts = [
      `Started by ${owner === 'You' ? 'you' : owner}`,
      describeRelativeTime(thread.createdAt),
      pluralize('message', Math.max(1, Number(thread.postCount ?? 0))),
    ];
    elements.communityThreadMeta.textContent = parts.join(' • ');
  }

  const list = elements.communityMessageList;
  if (!list) return;

  const posts = state.community.postsByThread.get(threadId) || [];
  if (state.community.loadingThreadId === threadId && !posts.length) {
    list.innerHTML = `
      <div class="text-sm text-slate-500 px-2 py-4">
        Loading replies…
      </div>
    `;
    return;
  }

  if (!posts.length) {
    list.innerHTML = `
      <div class="text-sm text-slate-500 px-2 py-4">
        No replies yet. Share the first update to get things going.
      </div>
    `;
    return;
  }

  list.innerHTML = posts
    .map((post) => {
      const isSelf = post.authorId === state.user?.id;
      const authorName = getCommunityUserName(post.authorId);
      const bodyHtml = escapeHtml(post.content || '')
        .replace(/\n/g, '<br />')
        .trim();
      const attachmentsHtml =
        Array.isArray(post.attachments) && post.attachments.length
          ? `
            <div class="community-message-attachments">
              ${post.attachments
                .map((attachment) => {
                  const pathAttr = escapeHtml(attachment.storage_path || '');
                  const label = escapeHtml(
                    attachment.file_name || 'Attachment'
                  );
                  if (
                    attachment.mime_type?.startsWith(COMMUNITY_IMAGE_PREFIX)
                  ) {
                    return `
                      <div class="community-attachment-preview">
                        <img
                          class="community-attachment-image"
                          alt="${label}"
                          data-attachment-path="${pathAttr}"
                          data-attachment-type="image"
                        />
                      </div>
                    `;
                  }
                  return `
                    <a
                      class="community-attachment-chip"
                      data-attachment-path="${pathAttr}"
                      data-attachment-type="file"
                      title="${label}"
                    >
                      <span>${label}</span>
                      <span>${formatFileSize(attachment.size_bytes)}</span>
                    </a>
                  `;
                })
                .join('')}
            </div>
          `
          : '';
      return `
        <div class="community-message${
          isSelf ? ' community-message--self' : ''
        }" data-message-id="${escapeHtml(post.id)}">
          <span class="community-message-author">${escapeHtml(
            authorName
          )}</span>
          <div class="community-message-body">${
            bodyHtml || '<span class="text-slate-400">Attachment only</span>'
          }</div>
          ${attachmentsHtml}
          <span class="community-message-time">${escapeHtml(
            formatDateTime(post.createdAt)
          )}</span>
        </div>
      `;
    })
    .join('');

  if (scrollToBottom) {
    requestAnimationFrame(() => {
      scrollCommunityMessagesToBottom();
    });
  }

  requestAnimationFrame(() => {
    hydrateCommunityAttachments().catch((error) => {
      console.error('[Community] hydrate attachments failed', error);
    });
  });
}

function renderCommunityAttachmentDrafts(container, drafts) {
  if (!container) return;
  if (!Array.isArray(drafts) || !drafts.length) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = drafts
    .map((draft) => {
      const label = escapeHtml(draft.file.name);
      const size = formatFileSize(draft.file.size);
      return `
        <div class="community-attachment-chip" data-id="${escapeHtml(draft.id)}">
          <span>${label}</span>
          <span>${size}</span>
          <button type="button" data-action="remove-attachment" data-id="${escapeHtml(
            draft.id
          )}">Remove</button>
        </div>
      `;
    })
    .join('');
}

function resetCommunityComposer() {
  elements.communityThreadForm?.reset();
  state.community.composerAttachments.forEach(revokeAttachmentDraft);
  state.community.composerAttachments = [];
  renderCommunityAttachmentDrafts(
    elements.communityThreadAttachments,
    state.community.composerAttachments
  );
}

function resetCommunityReplyComposer() {
  elements.communityReplyForm?.reset();
  state.community.replyAttachments.forEach(revokeAttachmentDraft);
  state.community.replyAttachments = [];
  renderCommunityAttachmentDrafts(
    elements.communityReplyAttachments,
    state.community.replyAttachments
  );
}

function toggleCommunityComposer(show) {
  const modal = elements.communityThreadComposer;
  if (!modal) return;
  if (show) {
    modal.classList.remove('hidden');
    document.body.dataset.communityScrollLock = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  } else {
    modal.classList.add('hidden');
    if (document.body.dataset.communityScrollLock !== undefined) {
      document.body.style.overflow =
        document.body.dataset.communityScrollLock || '';
      delete document.body.dataset.communityScrollLock;
    }
    resetCommunityComposer();
  }
}

function closeCommunityThread() {
  state.community.selectedThreadId = null;
  renderCommunityThreads();
  if (elements.communityThreadView) {
    elements.communityThreadView.classList.add('hidden');
  }
  if (elements.communityEmptyState) {
    elements.communityEmptyState.classList.remove('hidden');
  }
}

async function getCommunityAttachmentUrl(path) {
  if (!state.supabase || !path) return null;
  const cached = state.community.attachmentUrls.get(path);
  if (cached && cached.expiresAt > Date.now() + 5000) {
    return cached.url;
  }
  const { data, error } = await state.supabase
    .storage.from('community-uploads')
    .createSignedUrl(path, 60 * 60);
  if (error) {
    throw error;
  }
  const url = data?.signedUrl || null;
  if (url) {
    state.community.attachmentUrls.set(path, {
      url,
      expiresAt: Date.now() + 55 * 60 * 1000,
    });
  }
  return url;
}

async function loadCommunityThreads(options = {}) {
  if (!state.supabase || !state.user) return;
  const {
    preserveSelection = true,
    focusThreadId = null,
    showLoading = false,
  } = options;

  if (state.community.isLoadingThreads) return;
  state.community.isLoadingThreads = true;
  if (showLoading) {
    renderCommunityThreads();
  }

  try {
    const [{ data: threadsData, error: threadsError }, { data: readsData }] =
      await Promise.all([
        state.supabase
          .from('community_thread_summaries')
          .select(
            'id, title, created_by, created_at, updated_at, last_posted_at, last_post_author_id, last_post_excerpt, post_count'
          )
          .order('last_posted_at', { ascending: false, nullsLast: true })
          .order('updated_at', { ascending: false })
          .limit(50),
        state.supabase
          .from('community_thread_reads')
          .select('thread_id, last_read_at')
          .eq('user_id', state.user.id),
      ]);
    if (threadsError) throw threadsError;

    const readsMap = new Map();
    (readsData || []).forEach((row) => {
      if (row?.thread_id && row.last_read_at) {
        readsMap.set(row.thread_id, row.last_read_at);
      }
    });
    state.community.reads = readsMap;

    state.community.threads = (threadsData || []).map((row) => ({
      id: row.id,
      title: row.title || 'Untitled thread',
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastPostedAt: row.last_posted_at || row.updated_at,
      lastPostAuthorId: row.last_post_author_id || row.created_by,
      lastPostExcerpt: row.last_post_excerpt || '',
      postCount: Math.max(1, Number(row.post_count ?? 0)),
    }));

    const profileIds = [
      ...state.community.threads.map((thread) => thread.createdBy),
      ...state.community.threads
        .map((thread) => thread.lastPostAuthorId)
        .filter(Boolean),
    ];
    await ensureCommunityProfiles(profileIds);

    sortCommunityThreads();
    renderCommunityThreads();

    if (!preserveSelection) {
      state.community.selectedThreadId = null;
    } else if (
      state.community.selectedThreadId &&
      !state.community.threads.some(
        (thread) => thread.id === state.community.selectedThreadId
      )
    ) {
      state.community.selectedThreadId = null;
    }

    if (focusThreadId) {
      state.community.selectedThreadId = focusThreadId;
    }

    updateCommunityNavNotification();

    if (state.community.selectedThreadId) {
      renderCommunityThread(state.community.selectedThreadId);
    }
  } catch (error) {
    console.error('[Community] loadCommunityThreads failed', error);
    if (!state.community.threads.length) {
      renderCommunityThreads();
    }
    showToast('Unable to load community threads right now.', 'error');
  } finally {
    state.community.isLoadingThreads = false;
  }
}

async function loadCommunityThreadPosts(threadId, options = {}) {
  if (!state.supabase || !threadId) return;
  const { scrollToLatest = false } = options;
  state.community.loadingThreadId = threadId;
  renderCommunityThread(threadId);

  try {
    const { data, error } = await state.supabase
      .from('community_posts')
      .select(
        'id, thread_id, author_id, content, created_at, community_post_attachments (id, storage_path, file_name, mime_type, size_bytes)'
      )
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });
    if (error) throw error;

    const posts = (data || []).map((row) => ({
      id: row.id,
      threadId: row.thread_id,
      authorId: row.author_id,
      content: row.content || '',
      createdAt: row.created_at,
      attachments: Array.isArray(row.community_post_attachments)
        ? row.community_post_attachments.map((attachment) => ({
            id: attachment.id,
            storage_path: attachment.storage_path,
            file_name: attachment.file_name,
            mime_type: attachment.mime_type,
            size_bytes: attachment.size_bytes,
          }))
        : [],
    }));

    await ensureCommunityProfiles(
      posts.map((post) => post.authorId).filter(Boolean)
    );

    state.community.postsByThread.set(threadId, posts);
    renderCommunityThread(threadId, { scrollToBottom: scrollToLatest });
    markCommunityThreadRead(threadId).catch((error) => {
      console.error('[Community] mark read failed', error);
    });
  } catch (error) {
    console.error('[Community] loadCommunityThreadPosts failed', error);
    showToast('Unable to load thread messages.', 'error');
  } finally {
    state.community.loadingThreadId = null;
  }
}

async function markCommunityThreadRead(threadId) {
  if (!state.supabase || !threadId) return;
  try {
    const { data, error } = await state.supabase.rpc(
      'community_mark_thread_read',
      {
        p_thread_id: threadId,
      }
    );
    if (error) throw error;
    if (data?.last_read_at) {
      state.community.reads.set(threadId, data.last_read_at);
      updateCommunityNavNotification();
    }
  } catch (error) {
    console.error('[Community] markCommunityThreadRead failed', error);
  }
}

async function uploadCommunityAttachments(threadId, postId, drafts) {
  if (!state.supabase || !threadId || !postId) return [];
  if (!Array.isArray(drafts) || !drafts.length) return [];

  const uploaded = [];
  for (const draft of drafts) {
    const file = draft.file;
    const sanitizedName = file.name
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/-+/g, '-');
    const path = `${state.user.id}/${threadId}/${postId}/${Date.now()}-${sanitizedName}`;
    const { error: storageError } = await state.supabase.storage
      .from('community-uploads')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      });
    if (storageError) {
      throw storageError;
    }

    const { data: attachmentData, error: metaError } = await state.supabase
      .from('community_post_attachments')
      .insert({
        post_id: postId,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
      })
      .select('id, storage_path, file_name, mime_type, size_bytes')
      .single();
    if (metaError) {
      throw metaError;
    }
    uploaded.push(attachmentData);
  }

  return uploaded;
}

function handleCommunityThreadFileChange(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  let remaining =
    COMMUNITY_MAX_ATTACHMENTS - state.community.composerAttachments.length;
  if (remaining <= 0) {
    showToast(
      `You can attach up to ${COMMUNITY_MAX_ATTACHMENTS} files per post.`,
      'error'
    );
    event.target.value = '';
    return;
  }

  let errorMessage = null;
  for (const file of files) {
    if (remaining <= 0) break;
    const validationError = validateCommunityAttachment(file);
    if (validationError) {
      errorMessage = validationError;
      continue;
    }
    state.community.composerAttachments.push(createAttachmentDraft(file));
    remaining -= 1;
  }

  if (errorMessage) {
    showToast(errorMessage, 'error');
  }

  renderCommunityAttachmentDrafts(
    elements.communityThreadAttachments,
    state.community.composerAttachments
  );
  event.target.value = '';
}

function handleCommunityReplyFileChange(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  let remaining =
    COMMUNITY_MAX_ATTACHMENTS - state.community.replyAttachments.length;
  if (remaining <= 0) {
    showToast(
      `You can attach up to ${COMMUNITY_MAX_ATTACHMENTS} files per post.`,
      'error'
    );
    event.target.value = '';
    return;
  }

  let errorMessage = null;
  for (const file of files) {
    if (remaining <= 0) break;
    const validationError = validateCommunityAttachment(file);
    if (validationError) {
      errorMessage = validationError;
      continue;
    }
    state.community.replyAttachments.push(createAttachmentDraft(file));
    remaining -= 1;
  }

  if (errorMessage) {
    showToast(errorMessage, 'error');
  }

  renderCommunityAttachmentDrafts(
    elements.communityReplyAttachments,
    state.community.replyAttachments
  );
  event.target.value = '';
}

function handleCommunityThreadAttachmentsClick(event) {
  const button = event.target.closest('[data-action="remove-attachment"]');
  if (!button) return;
  const id = button.dataset.id;
  if (!id) return;
  state.community.composerAttachments = state.community.composerAttachments.filter(
    (draft) => {
      if (draft.id === id) {
        revokeAttachmentDraft(draft);
        return false;
      }
      return true;
    }
  );
  renderCommunityAttachmentDrafts(
    elements.communityThreadAttachments,
    state.community.composerAttachments
  );
}

function handleCommunityReplyAttachmentsClick(event) {
  const button = event.target.closest('[data-action="remove-attachment"]');
  if (!button) return;
  const id = button.dataset.id;
  if (!id) return;
  state.community.replyAttachments = state.community.replyAttachments.filter(
    (draft) => {
      if (draft.id === id) {
        revokeAttachmentDraft(draft);
        return false;
      }
      return true;
    }
  );
  renderCommunityAttachmentDrafts(
    elements.communityReplyAttachments,
    state.community.replyAttachments
  );
}

function handleCommunityThreadListClick(event) {
  const card = event.target.closest('[data-thread-id]');
  if (!card) return;
  const threadId = card.dataset.threadId;
  if (!threadId) return;
  openCommunityThread(threadId, { scrollToLatest: false });
}

function handleCommunityActionClick(event) {
  const actionEl = event.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  if (!action || !action.startsWith('community-')) return;

  switch (action) {
    case 'community-open-composer':
      event.preventDefault();
      toggleCommunityComposer(true);
      break;
    case 'community-close-composer':
      event.preventDefault();
      toggleCommunityComposer(false);
      break;
    case 'community-refresh':
      event.preventDefault();
      loadCommunityThreads({ preserveSelection: true, showLoading: true });
      break;
    case 'community-close-thread':
      event.preventDefault();
      closeCommunityThread();
      break;
    case 'community-mark-read':
      event.preventDefault();
      if (state.community.selectedThreadId) {
        markCommunityThreadRead(state.community.selectedThreadId).catch(
          (error) => {
            console.error('[Community] mark read via action failed', error);
          }
        );
      }
      break;
    default:
      break;
  }
}

async function handleCommunityThreadSubmit(event) {
  event.preventDefault();
  if (!state.supabase || state.community.isCreatingThread) return;

  const title = elements.communityThreadTitleInput?.value?.trim() || '';
  const message =
    elements.communityThreadMessageInput?.value?.trim() || '';
  const attachments = state.community.composerAttachments || [];

  if (!title) {
    showToast('Add a thread title before posting.', 'error');
    return;
  }
  if (!message && !attachments.length) {
    showToast('Share a message or attach a file to start the thread.', 'error');
    return;
  }

  state.community.isCreatingThread = true;
  elements.communityThreadSubmit?.setAttribute('disabled', 'disabled');

  try {
    const { data: threadData, error: threadError } = await state.supabase
      .from('community_threads')
      .insert({
        title,
        created_by: state.user.id,
      })
      .select('id, title, created_by, created_at, updated_at')
      .single();
    if (threadError) throw threadError;

    const { data: postData, error: postError } = await state.supabase
      .from('community_posts')
      .insert({
        thread_id: threadData.id,
        author_id: state.user.id,
        content: message,
      })
      .select('id, created_at')
      .single();
    if (postError) throw postError;

    const uploaded = await uploadCommunityAttachments(
      threadData.id,
      postData.id,
      attachments
    );
    const attachmentRows = uploaded.map((item) => ({
      id: item.id,
      storage_path: item.storage_path,
      file_name: item.file_name,
      mime_type: item.mime_type,
      size_bytes: item.size_bytes,
    }));

    const newPost = {
      id: postData.id,
      threadId: threadData.id,
      authorId: state.user.id,
      content: message,
      createdAt: postData.created_at,
      attachments: attachmentRows,
    };

    state.community.postsByThread.set(threadData.id, [newPost]);

    const newThread = {
      id: threadData.id,
      title: threadData.title || title,
      createdBy: threadData.created_by,
      createdAt: threadData.created_at,
      updatedAt: threadData.updated_at,
      lastPostedAt: newPost.createdAt,
      lastPostAuthorId: newPost.authorId,
      lastPostExcerpt: buildPostExcerpt(newPost.content, attachmentRows),
      postCount: 1,
    };

    state.community.threads.push(newThread);
    sortCommunityThreads();

    state.community.selectedThreadId = newThread.id;
    state.community.reads.set(newThread.id, newPost.createdAt);
    toggleCommunityComposer(false);
    renderCommunityThreads();
    renderCommunityThread(newThread.id, { scrollToBottom: true });
    updateCommunityNavNotification();
    showToast('Thread posted successfully.', 'success');
  } catch (error) {
    console.error('[Community] handleCommunityThreadSubmit failed', error);
    showToast('Unable to post your thread right now.', 'error');
  } finally {
    state.community.isCreatingThread = false;
    elements.communityThreadSubmit?.removeAttribute('disabled');
  }
}

async function handleCommunityReplySubmit(event) {
  event.preventDefault();
  if (!state.supabase || state.community.isSendingReply) return;
  const threadId = state.community.selectedThreadId;
  if (!threadId) {
    showToast('Select a thread before replying.', 'error');
    return;
  }

  const message = elements.communityReplyInput?.value?.trim() || '';
  const attachments = state.community.replyAttachments || [];
  if (!message && !attachments.length) {
    showToast('Share a message or attach a file before sending.', 'error');
    return;
  }

  state.community.isSendingReply = true;
  elements.communityReplySubmit?.setAttribute('disabled', 'disabled');

  try {
    const { data: postData, error: postError } = await state.supabase
      .from('community_posts')
      .insert({
        thread_id: threadId,
        author_id: state.user.id,
        content: message,
      })
      .select('id, created_at')
      .single();
    if (postError) throw postError;

    const uploaded = await uploadCommunityAttachments(
      threadId,
      postData.id,
      attachments
    );
    const attachmentRows = uploaded.map((item) => ({
      id: item.id,
      storage_path: item.storage_path,
      file_name: item.file_name,
      mime_type: item.mime_type,
      size_bytes: item.size_bytes,
    }));

    const newPost = {
      id: postData.id,
      threadId,
      authorId: state.user.id,
      content: message,
      createdAt: postData.created_at,
      attachments: attachmentRows,
    };

    const posts = state.community.postsByThread.get(threadId) || [];
    posts.push(newPost);
    state.community.postsByThread.set(threadId, posts);

    const thread = state.community.threads.find((item) => item.id === threadId);
    if (thread) {
      thread.lastPostedAt = newPost.createdAt;
      thread.lastPostAuthorId = newPost.authorId;
      thread.lastPostExcerpt = buildPostExcerpt(
        newPost.content,
        attachmentRows
      );
      thread.postCount = posts.length;
    }

    state.community.reads.set(threadId, newPost.createdAt);
    sortCommunityThreads();
    renderCommunityThreads();
    renderCommunityThread(threadId, { scrollToBottom: true });
    updateCommunityNavNotification();
    resetCommunityReplyComposer();
  } catch (error) {
    console.error('[Community] handleCommunityReplySubmit failed', error);
    showToast('Unable to send your reply right now.', 'error');
  } finally {
    state.community.isSendingReply = false;
    elements.communityReplySubmit?.removeAttribute('disabled');
  }
}

function openCommunityThread(threadId, options = {}) {
  if (!threadId) return;
  const { scrollToLatest = false, forceReload = false } = options;
  const threadChanged =
    state.community.selectedThreadId !== threadId || forceReload;
  state.community.selectedThreadId = threadId;
  renderCommunityThreads();

  const posts = state.community.postsByThread.get(threadId) || [];
  if (!posts.length || forceReload) {
    renderCommunityThread(threadId);
    loadCommunityThreadPosts(threadId, { scrollToLatest: true });
    return;
  }

  renderCommunityThread(threadId, { scrollToBottom: scrollToLatest });
  if (threadChanged) {
    markCommunityThreadRead(threadId).catch((error) => {
      console.error('[Community] mark read on open failed', error);
    });
  }
}

function registerCommunityHandlers() {
  if (communityHandlersBound) return;
  elements.communityThreadList?.addEventListener(
    'click',
    handleCommunityThreadListClick
  );
  elements.communityThreadForm?.addEventListener(
    'submit',
    handleCommunityThreadSubmit
  );
  elements.communityReplyForm?.addEventListener(
    'submit',
    handleCommunityReplySubmit
  );
  elements.communityThreadFileInput?.addEventListener(
    'change',
    handleCommunityThreadFileChange
  );
  elements.communityReplyFile?.addEventListener(
    'change',
    handleCommunityReplyFileChange
  );
  elements.communityThreadAttachments?.addEventListener(
    'click',
    handleCommunityThreadAttachmentsClick
  );
  elements.communityReplyAttachments?.addEventListener(
    'click',
    handleCommunityReplyAttachmentsClick
  );
  document.addEventListener('click', handleCommunityActionClick);
  communityHandlersBound = true;
}

function subscribeToCommunityRealtime() {
  if (!state.supabase) return;
  if (state.community.subscription) {
    state.community.subscription.unsubscribe();
    state.community.subscription = null;
  }

  const channel = state.supabase
    .channel('learner-community')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'community_threads' },
      () => {
        loadCommunityThreads({ preserveSelection: true });
      }
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'community_posts' },
      (payload) => {
        const threadId = payload.new?.thread_id;
        if (!threadId) return;
        if (state.community.selectedThreadId === threadId) {
          loadCommunityThreadPosts(threadId, { scrollToLatest: true });
        } else {
          loadCommunityThreads({ preserveSelection: true });
        }
      }
    )
    .subscribe();

  state.community.subscription = channel;
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    loadExtraQuestionSets();
    loadCommunityThreads({ preserveSelection: true });
  }
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
    updateBonusNavNotification();
    return;
  }

  const cards = sets
    .map((set) => {
      const availability = set.availability || getExtraSetAvailability(set);
      const schedule = describeExtraSchedule(set);
      const timer = describeExtraTimer(set.time_limit_seconds);
      const assignmentSummary = describeExtraAssignment(set.assignment_rules);
      const maxAttemptsSummary = set.max_attempts_per_user
        ? `${set.max_attempts_per_user} attempt${set.max_attempts_per_user === 1 ? '' : 's'} max`
        : 'Unlimited attempts';
      const canStart = Boolean(availability.isAvailable);
      let primaryLabel = 'Start practice';
      if (!canStart) {
        primaryLabel = availability.isUpcoming ? 'Opens soon' : 'Unavailable';
      } else if (set.status === 'in_progress') {
        primaryLabel = 'Resume practice';
      } else if (set.status === 'completed') {
        primaryLabel = 'Retake practice';
      }
      const primaryClasses = canStart
        ? 'inline-flex items-center gap-2 rounded-md bg-cyan-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-800 focus:outline-none focus:ring focus:ring-cyan-200'
        : 'inline-flex items-center gap-2 rounded-md bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-500 cursor-not-allowed';
      const summary = escapeHtml(renderExtraAttemptSummary(set));
      const resultAttemptId = set.lastCompletedAttempt?.id
        ? `&attempt_id=${encodeURIComponent(set.lastCompletedAttempt.id)}`
        : '';
      const viewResultsButton = set.lastCompletedAttempt
        ? `<a
              class="inline-flex items-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-cyan-200 hover:text-cyan-700 focus:outline-none focus:ring focus:ring-cyan-200"
              href="result-face.html?extra_question_set_id=${encodeURIComponent(set.id)}${resultAttemptId}"
            >
              View results
            </a>`
        : '';
      return `
        <article class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-cyan-200 hover:shadow-md">
          <header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div class="space-y-1">
              <h4 class="text-lg font-semibold text-slate-900">${escapeHtml(set.title || 'Untitled set')}</h4>
              <p class="text-sm text-slate-600">${escapeHtml(set.description || 'Topical questions curated for your department.')}</p>
            </div>
            ${renderExtraStatusChip(set)}
          </header>
          <p class="mt-2 text-sm text-slate-500">${summary}</p>
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
            <div class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1">
              <span class="font-semibold text-slate-700">Distribution:</span>
              <span>${escapeHtml(assignmentSummary)}</span>
            </div>
            <div class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1">
              <span class="font-semibold text-slate-700">Attempts:</span>
              <span>${escapeHtml(maxAttemptsSummary)}</span>
            </div>
          </dl>
          <div class="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              class="${primaryClasses}"
              data-action="start-extra-set"
              data-set-id="${escapeHtml(set.id)}"
              ${canStart ? '' : 'disabled aria-disabled="true"'}
            >
              ${escapeHtml(primaryLabel)}
            </button>
            ${viewResultsButton}
          </div>
        </article>
      `;
    })
    .join('');

  section.classList.remove('hidden');
  list.innerHTML = cards;
  updateBonusNavNotification();
}

async function fetchExtraAttempts(setIds) {
  if (
    !state.supabase ||
    !state.user ||
    !Array.isArray(setIds) ||
    !setIds.length
  ) {
    return new Map();
  }

  const { data, error } = await state.supabase
    .from('extra_question_attempts')
    .select(
      'id, set_id, status, attempt_number, started_at, completed_at, duration_seconds, total_questions, correct_answers, score_percent'
    )
    .eq('user_id', state.user.id)
    .in('set_id', setIds)
    .order('attempt_number', { ascending: false });
  if (error) throw error;

  const map = new Map();
  (data || []).forEach((row) => {
    const entry = {
      ...row,
      score_percent:
        row.score_percent !== null ? Number(row.score_percent) : null,
      total_questions:
        row.total_questions !== null ? Number(row.total_questions) : null,
      correct_answers:
        row.correct_answers !== null ? Number(row.correct_answers) : null,
    };
    if (!map.has(row.set_id)) {
      map.set(row.set_id, []);
    }
    map.get(row.set_id).push(entry);
  });
  return map;
}

async function hydrateExtraQuestionSets(rawSets) {
  if (!Array.isArray(rawSets) || !rawSets.length) {
    return [];
  }

  const sanitized = rawSets
    .map((set) => ({
      ...set,
      time_limit_seconds:
        set.time_limit_seconds !== undefined ? set.time_limit_seconds : null,
      assignment_rules: normalizeAssignmentRules(set.assignment_rules),
      max_attempts_per_user:
        set.max_attempts_per_user !== undefined &&
        set.max_attempts_per_user !== null
          ? Number(set.max_attempts_per_user)
          : null,
    }))
    .filter((set) => Number(set.question_count ?? 0) > 0);

  if (!sanitized.length) {
    return [];
  }

  let attemptsBySet = new Map();
  try {
    attemptsBySet = await fetchExtraAttempts(
      sanitized.map((set) => set.id).filter(Boolean)
    );
  } catch (error) {
    console.error('[Dashboard] fetchExtraAttempts failed', error);
    showToast('Unable to load bonus practice history.', 'error');
    attemptsBySet = new Map();
  }

  const nowMs = Date.now();

  const enriched = sanitized.map((set) => {
    const attempts = attemptsBySet.get(set.id) || [];
    const availability = getExtraSetAvailability(set, nowMs);
    const latestAttempt = attempts[0] || null;
    const lastCompletedAttempt =
      attempts.find((attempt) => attempt.status === 'completed') || null;
    const status = deriveExtraSetStatus({ ...set, availability }, attempts);
    return {
      ...set,
      availability,
      attempts,
      latestAttempt,
      lastCompletedAttempt,
      status,
    };
  });

  const weight = (set) => {
    if (set.availability.isAvailable) return 0;
    if (set.availability.isUpcoming) return 1;
    return 2;
  };

  return enriched
    .filter((set) => {
      const hasCompleted = Boolean(set.lastCompletedAttempt);
      return (
        set.availability.isAvailable ||
        set.availability.isUpcoming ||
        hasCompleted
      );
    })
    .sort((a, b) => {
      const weightDiff = weight(a) - weight(b);
      if (weightDiff !== 0) return weightDiff;
      const updatedA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const updatedB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return updatedB - updatedA;
    });
}

async function loadExtraQuestionSets() {
  if (!state.supabase || state.isLoadingExtraSets) return;
  state.isLoadingExtraSets = true;

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
      .select(
        'id, title, description, is_active, question_count, starts_at, ends_at, time_limit_seconds, max_attempts_per_user, assignment_rules, updated_at'
      )
      .order('updated_at', { ascending: false });
    if (error) throw error;

    const sets = await hydrateExtraQuestionSets(
      Array.isArray(data) ? data : []
    );
    state.extraQuestionSets = sets;
    renderExtraQuestionSets();
  } catch (error) {
    const errorMessage =
      typeof error?.message === 'string' ? error.message : '';
    const isMissingTimer = errorMessage.includes('time_limit_seconds');
    const isMissingAssignment =
      errorMessage.includes('assignment_rules') ||
      errorMessage.includes('max_attempts_per_user');
    if (isMissingTimer || isMissingAssignment) {
      try {
        const { data: fallbackData, error: fallbackError } =
          await state.supabase
            .from('extra_question_sets')
            .select(
              'id, title, description, is_active, question_count, starts_at, ends_at, updated_at'
            )
            .order('updated_at', { ascending: false });
        if (fallbackError) throw fallbackError;
        const sets = await hydrateExtraQuestionSets(
          (Array.isArray(fallbackData) ? fallbackData : []).map((set) => ({
            ...set,
            time_limit_seconds: null,
            assignment_rules: DEFAULT_ASSIGNMENT_RULES,
            max_attempts_per_user: null,
          }))
        );
        state.extraQuestionSets = sets;
        renderExtraQuestionSets();
        return;
      } catch (fallbackError) {
        console.error(
          '[Dashboard] loadExtraQuestionSets fallback failed',
          fallbackError
        );
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
    updateBonusNavNotification();
  } finally {
    state.isLoadingExtraSets = false;
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
    sessionStorage.setItem(
      'extra_set_launch_debug',
      JSON.stringify(debugPayload)
    );
  } catch (storageError) {
    console.debug(
      '[Dashboard] Unable to persist extra set launch debug info',
      storageError
    );
  }

  console.debug(
    '[Dashboard] Navigating to extra practice set',
    debugPayload || { setId }
  );

  const url = new URL('exam-face.html', window.location.href);
  url.searchParams.set('extra_question_set_id', setId);
  const activeSubscription = getSelectedSubscription();
  if (activeSubscription?.plan?.id) {
    url.searchParams.set('subscription_id', activeSubscription.id);
    url.searchParams.set('plan_id', activeSubscription.plan.id);
  }
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
    const { data, error } = await state.supabase.rpc(
      'get_user_schedule_health'
    );
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
      .select(
        'id, status, total_questions, correct_answers, started_at, completed_at, assigned_date, subscription_id'
      )
      .eq('user_id', state.user.id)
      .eq('assigned_date', today)
      .maybeSingle();

    if (error) throw error;
    state.todayQuiz = quiz;
    updateQuizSection();
    updatePlanCollectionLabels(state.todayQuiz);
  } catch (error) {
    console.error('[Dashboard] checkTodayQuiz failed', error);
    showToast("Unable to check today's quiz status", 'error');
  }
}

async function startOrResumeQuiz() {
  try {
    const selectedSubscription = getSelectedSubscription();
    if (!selectedSubscription || !isSubscriptionActive(selectedSubscription)) {
      showToast(
        'Select an active plan to generate your daily questions.',
        'error'
      );
      renderSubscription();
      return;
    }
    const rpcArgs = { p_subscription_id: selectedSubscription.id };

    if (!state.todayQuiz) {
      // Generate new quiz first
      showToast('Generating your daily questions...', 'info');
      const { data: generated, error: generateError } =
        await state.supabase.rpc('generate_daily_quiz', rpcArgs);
      if (generateError) {
        // Handle specific error messages
        const message = generateError.message || '';
        if (message.includes('no active subscription')) {
          showToast(
            'You need an active subscription to access daily questions',
            'error'
          );
          await loadSubscriptions();
          return;
        }
        if (message.includes('no active study slot')) {
          showToast('No active study slot for your department today', 'error');
          return;
        }
        if (message.includes('selected subscription is no longer active')) {
          showToast(
            'That plan is no longer active. Choose a different plan to continue.',
            'error'
          );
          await loadSubscriptions();
          return;
        }
        throw generateError;
      }

      const quizId = Array.isArray(generated)
        ? generated[0]?.daily_quiz_id
        : generated?.daily_quiz_id;
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
    showToast(
      error.message || 'Unable to start quiz. Please try again.',
      'error'
    );
  }
}

async function regenerateQuiz() {
  if (
    !window.confirm(
      'Generate a fresh quiz for today? Your previous answers will be cleared.'
    )
  ) {
    return;
  }

  try {
    const selectedSubscription = getSelectedSubscription();
    if (!selectedSubscription || !isSubscriptionActive(selectedSubscription)) {
      showToast(
        'Select an active plan before regenerating questions.',
        'error'
      );
      renderSubscription();
      return;
    }

    showToast('Generating new questions...', 'info');
    const { error: genError } = await state.supabase.rpc(
      'generate_daily_quiz',
      {
        p_subscription_id: selectedSubscription.id,
      }
    );
    if (genError) {
      const message = genError.message || '';
      if (message.includes('selected subscription is no longer active')) {
        showToast(
          'That plan is no longer active. Choose a different plan to continue.',
          'error'
        );
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
      .select(
        'id, assigned_date, status, total_questions, correct_answers, completed_at'
      )
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
    if (
      !state.defaultSubscriptionId &&
      state.profile?.default_subscription_id
    ) {
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
    if (
      state.profile &&
      state.profile.subscription_status !== 'pending_payment'
    ) {
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
  updatePaymentGate(state.profile);
}

async function ensureProfile() {
  const fallbackName = state.user.email?.split('@')[0] ?? 'Learner';
  try {
    const { data, error } = await state.supabase
      .from('profiles')
      .select(
        'id, full_name, role, last_seen_at, subscription_status, default_subscription_id, registration_stage, pending_plan_id, pending_plan_snapshot, phone'
      )
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
        .select(
          'id, full_name, role, last_seen_at, subscription_status, default_subscription_id, registration_stage, pending_plan_id, pending_plan_snapshot, phone'
        )
        .single();
      if (insertError) throw insertError;
      state.profile = inserted;
    } else {
      const { data: updated, error: updateError } = await state.supabase
        .from('profiles')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', state.user.id)
        .select(
          'id, full_name, role, last_seen_at, subscription_status, default_subscription_id, registration_stage, pending_plan_id, pending_plan_snapshot, phone'
        )
        .single();
      if (!updateError && updated) {
        state.profile = updated;
      } else {
        state.profile = data;
      }
    }

    state.defaultSubscriptionId =
      state.profile?.default_subscription_id || null;
    updatePaymentGate(state.profile);
    populateProfileForm();
  } catch (error) {
    console.error('[Dashboard] ensureProfile failed', error);
    showToast('Unable to load profile', 'error');
    state.profile = {
      full_name: fallbackName,
      subscription_status: 'inactive',
      default_subscription_id: null,
      registration_stage: 'profile_created',
    };
    state.defaultSubscriptionId = null;
    updatePaymentGate(state.profile);
    populateProfileForm();
  }
}

async function handleLogout() {
  try {
    await state.supabase.auth.signOut();
    clearSessionFingerprint();
    window.location.replace('login.html');
  } catch (error) {
    console.error('[Dashboard] signOut failed', error);
    showToast('Unable to sign out. Please try again.', 'error');
  }
}

async function initialise() {
  try {
    state.supabase = await getSupabaseClient();
    const {
      data: { session },
    } = await state.supabase.auth.getSession();
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
    updatePaymentGate(state.profile);
    updateHeader();

    // Bind event listeners
    elements.resumeBtn?.addEventListener('click', startOrResumeQuiz);
    elements.regenerateBtn?.addEventListener('click', regenerateQuiz);
    elements.logoutBtn?.addEventListener('click', handleLogout);
    elements.planBrowseBtn?.addEventListener('click', () => {
      window.location.href = 'subscription-plans.html';
    });
    elements.planCollection?.addEventListener(
      'click',
      handlePlanCollectionClick
    );
    elements.extraSetsList?.addEventListener('click', handleExtraSetsClick);
    elements.profileForm?.addEventListener('submit', handleProfileSubmit);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    registerCommunityHandlers();
    renderCommunityThreads();

    // Load data without auto-generating quiz
    await loadScheduleHealth();
    await checkTodayQuiz();
    await refreshHistory();
    await loadExtraQuestionSets();
    await loadCommunityThreads();
    subscribeToCommunityRealtime();
  } catch (error) {
    console.error('[Dashboard] initialisation failed', error);
    showToast('Something went wrong while loading the dashboard.', 'error');
  }
}

function cleanup() {
  elements.planCollection?.removeEventListener(
    'click',
    handlePlanCollectionClick
  );
  elements.extraSetsList?.removeEventListener('click', handleExtraSetsClick);
  elements.profileForm?.removeEventListener('submit', handleProfileSubmit);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  if (communityHandlersBound) {
    elements.communityThreadList?.removeEventListener(
      'click',
      handleCommunityThreadListClick
    );
    elements.communityThreadForm?.removeEventListener(
      'submit',
      handleCommunityThreadSubmit
    );
    elements.communityReplyForm?.removeEventListener(
      'submit',
      handleCommunityReplySubmit
    );
    elements.communityThreadFileInput?.removeEventListener(
      'change',
      handleCommunityThreadFileChange
    );
    elements.communityReplyFile?.removeEventListener(
      'change',
      handleCommunityReplyFileChange
    );
    elements.communityThreadAttachments?.removeEventListener(
      'click',
      handleCommunityThreadAttachmentsClick
    );
    elements.communityReplyAttachments?.removeEventListener(
      'click',
      handleCommunityReplyAttachmentsClick
    );
    document.removeEventListener('click', handleCommunityActionClick);
    communityHandlersBound = false;
  }
  if (state.community.subscription) {
    try {
      state.community.subscription.unsubscribe();
    } catch (error) {
      console.debug('[Community] unsubscribe failed', error);
    }
    state.community.subscription = null;
  }
  toggleCommunityComposer(false);
}

window.addEventListener('beforeunload', cleanup);

bindNavigation();
setActiveView('dashboard');

initialise();

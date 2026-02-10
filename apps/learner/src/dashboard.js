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
  globalNotice: document.querySelector('[data-role="global-notice"]'),
  globalNoticeText: document.querySelector('[data-role="global-notice-text"]'),
  globalNoticeDismiss: document.querySelector(
    '[data-role="global-notice-dismiss"]'
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
  refreshPaymentBtn: document.querySelector('[data-role="refresh-payment"]'),
  profileForm: document.querySelector('[data-role="profile-form"]'),
  profileNameInput: document.querySelector('[data-role="profile-name"]'),
  profilePhoneInput: document.querySelector('[data-role="profile-phone"]'),
  profileSchoolInput: document.querySelector('[data-role="profile-school"]'),
  profilePasswordInput: document.querySelector(
    '[data-role="profile-password"]'
  ),
  profilePasswordConfirmInput: document.querySelector(
    '[data-role="profile-password-confirm"]'
  ),
  profileFeedback: document.querySelector('[data-role="profile-feedback"]'),
  profileEmail: document.querySelector('[data-role="profile-email"]'),
  connectGoogleBtn: document.querySelector('[data-role="connect-google"]'),
  authMethodsFeedback: document.querySelector(
    '[data-role="auth-methods-feedback"]'
  ),
  whatsappLinkPhoneInput: document.querySelector(
    '[data-role="whatsapp-link-phone"]'
  ),
  whatsappLinkSendBtn: document.querySelector(
    '[data-role="whatsapp-link-send"]'
  ),
  whatsappLinkVerifyRow: document.querySelector(
    '[data-role="whatsapp-link-verify-row"]'
  ),
  whatsappLinkCodeInput: document.querySelector(
    '[data-role="whatsapp-link-code"]'
  ),
  whatsappLinkVerifyBtn: document.querySelector(
    '[data-role="whatsapp-link-verify"]'
  ),
  whatsappLinkResendBtn: document.querySelector(
    '[data-role="whatsapp-link-resend"]'
  ),
  whatsappLinkFeedback: document.querySelector(
    '[data-role="whatsapp-link-feedback"]'
  ),
  whatsappBioSection: document.querySelector('[data-role="whatsapp-bio"]'),
  whatsappBioFirstInput: document.querySelector(
    '[data-role="whatsapp-bio-first"]'
  ),
  whatsappBioLastInput: document.querySelector(
    '[data-role="whatsapp-bio-last"]'
  ),
  whatsappBioSchoolInput: document.querySelector(
    '[data-role="whatsapp-bio-school"]'
  ),
  whatsappBioEmail: document.querySelector('[data-role="whatsapp-bio-email"]'),
  whatsappBioSaveBtn: document.querySelector('[data-role="whatsapp-bio-save"]'),
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
  activeView: 'dashboard',
  globalAnnouncement: null,
  profileChannel: null,
  entitlementsRefreshing: false,
};

let navigationBound = false;

const ANNOUNCEMENT_DISMISS_STORAGE_KEY = 'learner.dismissedAnnouncements';
let activeAnnouncementId = null;

function handleGlobalNoticeDismiss() {
  if (activeAnnouncementId) {
    markAnnouncementDismissed(activeAnnouncementId);
  }
  renderGlobalAnnouncement(null);
}

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
const QUIZ_HISTORY_FETCH_LIMIT = 180; // aligns with DB cleanup window
const QUIZ_HISTORY_SUMMARY_DAYS = 14;

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

const ASSIGNMENT_MODES = new Set([
  'full_set',
  'fixed_count',
  'percentage',
  'tier_auto',
  'equal_split',
]);

const ACTIVE_PLAN_STATUSES = new Set(['active', 'trialing']);

function getAllNavButtons() {
  // Query all navigation buttons including new UI structure
  const buttons = Array.from(
    document.querySelectorAll('[data-nav-target]')
  ).filter((btn) => {
    // Filter out links that are actual anchor tags (community links)
    return !btn.href || btn.hasAttribute('data-nav-target');
  });
  return buttons;
}

function setNavAvailability(hasActivePlan) {
  const buttons = getAllNavButtons();
  buttons.forEach((button) => {
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
    // Support both old (hidden class) and new (is-active class) UI
    if (section.classList.contains('is-active') !== undefined) {
      section.classList.toggle('is-active', isMatch);
    } else {
      section.classList.toggle('hidden', !isMatch);
    }
    if (isMatch) matched = true;
  });
  if (!matched) return;

  // Update all navigation buttons (both old and new UI)
  const buttons = getAllNavButtons();
  buttons.forEach((button) => {
    const isActive = button.dataset.navTarget === targetView;
    // Support both old and new active state classes
    button.classList.toggle('nav-button--active', isActive);
    button.classList.toggle('is-active', isActive);
    button.classList.toggle('bottom-nav__item--active', isActive);
    if (isActive) {
      button.setAttribute('aria-current', 'page');
    } else {
      button.removeAttribute('aria-current');
    }
  });
  state.activeView = targetView;

  // Close mobile drawer if open
  const drawer = document.querySelector('[data-role="nav-drawer"]');
  const overlay = document.querySelector('[data-role="nav-overlay"]');
  if (drawer?.classList.contains('is-open')) {
    drawer.classList.remove('is-open');
    overlay?.classList.remove('is-visible');
    document.body.style.overflow = '';
  }
}

function bindNavigation() {
  if (navigationBound) return;
  navigationBound = true;

  // Get all navigation buttons
  const buttons = getAllNavButtons();
  elements.navButtons = buttons;

  buttons.forEach((button) => {
    button.addEventListener('click', (e) => {
      if (button.disabled) return;
      const target = button.dataset.navTarget;
      if (target) {
        e.preventDefault();
        setActiveView(target);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
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

  // Support both old (hidden class) and new (is-visible class) UI
  elements.toast.classList.remove('hidden');
  elements.toast.classList.add('is-visible');

  // Remove all toast type classes
  elements.toast.classList.remove(
    'border-red-200',
    'bg-red-50',
    'text-red-700',
    'border-emerald-200',
    'bg-emerald-50',
    'text-emerald-700',
    'border-sky-200',
    'bg-sky-50',
    'text-sky-700',
    'toast--success',
    'toast--error'
  );

  if (type === 'error') {
    elements.toast.classList.add(
      'border-red-200',
      'bg-red-50',
      'text-red-700',
      'toast--error'
    );
  } else if (type === 'success') {
    elements.toast.classList.add(
      'border-emerald-200',
      'bg-emerald-50',
      'text-emerald-700',
      'toast--success'
    );
  } else {
    elements.toast.classList.add('border-sky-200', 'bg-sky-50', 'text-sky-700');
  }

  window.clearTimeout(elements.toast.dataset.timeoutId);
  const timeoutId = window.setTimeout(() => {
    if (elements.toast) {
      elements.toast.classList.add('hidden');
      elements.toast.classList.remove('is-visible');
    }
  }, 5000);
  elements.toast.dataset.timeoutId = timeoutId;
}

function getDismissedAnnouncementIds() {
  try {
    const raw = localStorage.getItem(ANNOUNCEMENT_DISMISS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter(Boolean));
    }
  } catch (error) {
    console.debug('[Announcement] Failed to read dismissed ids', error);
  }
  return new Set();
}

function saveDismissedAnnouncementIds(ids) {
  try {
    const payload = Array.from(ids);
    localStorage.setItem(
      ANNOUNCEMENT_DISMISS_STORAGE_KEY,
      JSON.stringify(payload)
    );
  } catch (error) {
    console.debug('[Announcement] Failed to persist dismissed ids', error);
  }
}

function hasAnnouncementBeenDismissed(id) {
  if (!id) return false;
  return getDismissedAnnouncementIds().has(id);
}

function markAnnouncementDismissed(id) {
  if (!id) return;
  const ids = getDismissedAnnouncementIds();
  ids.add(id);
  saveDismissedAnnouncementIds(ids);
}

function renderGlobalAnnouncement(announcement) {
  const container = elements.globalNotice;
  if (!container) return;
  const textEl = elements.globalNoticeText;
  const dismissBtn = elements.globalNoticeDismiss;

  if (!announcement || !announcement.id) {
    container.classList.add('hidden');
    container.removeAttribute('data-announcement-id');
    if (textEl) {
      textEl.textContent = '';
    }
    if (dismissBtn) {
      dismissBtn.classList.add('hidden');
    }
    activeAnnouncementId = null;
    return;
  }

  if (hasAnnouncementBeenDismissed(announcement.id)) {
    container.classList.add('hidden');
    container.removeAttribute('data-announcement-id');
    if (textEl) {
      textEl.textContent = '';
    }
    if (dismissBtn) {
      dismissBtn.classList.add('hidden');
    }
    activeAnnouncementId = null;
    return;
  }

  activeAnnouncementId = announcement.id;
  container.dataset.announcementId = announcement.id;
  container.classList.remove('hidden');
  if (textEl) {
    textEl.textContent = announcement.message || '';
  }
  if (dismissBtn) {
    dismissBtn.classList.remove('hidden');
  }
}

async function loadGlobalAnnouncement() {
  if (!state.supabase || !state.user) return;
  try {
    const { data, error } = await state.supabase
      .from('global_announcements')
      .select('id, message, created_at')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw error;

    const announcement = Array.isArray(data) && data.length ? data[0] : null;
    state.globalAnnouncement = announcement;
    renderGlobalAnnouncement(state.globalAnnouncement);
  } catch (error) {
    console.error('[Dashboard] loadGlobalAnnouncement failed', error);
  }
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
    const locale = currency === 'NGN' ? 'en-NG' : undefined;
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'symbol',
      maximumFractionDigits: numeric % 1 === 0 ? 0 : 2,
    }).format(numeric);
  } catch {
    if (currency === 'NGN') {
      return `₦${numeric.toLocaleString('en-NG')}`;
    }
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
  if (baseRule.mode === 'tier_auto') {
    return 'Auto by tier (250=100%, 200=75%, 100=50%)';
  }
  if (baseRule.mode === 'equal_split') {
    return 'Equal split across selected tiers';
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

  const emailText = state.user?.email || state.profile?.email || '—';
  if (emailEl) {
    emailEl.textContent = emailText;
  }
  if (elements.profileEmail) {
    elements.profileEmail.textContent = emailText;
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

function setRefreshPaymentLoading(loading) {
  const btn = elements.refreshPaymentBtn;
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn.dataset.originalText = btn.textContent || 'Refresh payment status';
    btn.textContent = 'Checking…';
    btn.classList.add('opacity-70', 'cursor-wait');
  } else {
    const label = btn.dataset.originalText || 'Refresh payment status';
    btn.textContent = label;
    btn.classList.remove('opacity-70', 'cursor-wait');
  }
}

async function refreshPaymentStatusNow() {
  if (!state.supabase || !state.user) return;
  if (state.entitlementsRefreshing) return;
  try {
    state.entitlementsRefreshing = true;
    setRefreshPaymentLoading(true);
    await state.supabase.rpc('refresh_profile_subscription_status', {
      p_user_id: state.user.id,
    });
    // Also trigger a targeted reconciliation for this user
    try {
      await state.supabase.functions.invoke('reconcile-payments', {
        body: { userId: state.user.id },
      });
    } catch (reconcileError) {
      console.warn(
        '[Dashboard] reconcile-payments (manual refresh) failed',
        reconcileError
      );
    }
  } catch (error) {
    console.warn(
      '[Dashboard] refresh_profile_subscription_status failed',
      error
    );
  } finally {
    await ensureProfile();
    await loadSubscriptions();
    updateHeader();
    let status = (state.profile?.subscription_status || '').toLowerCase();

    // If still pending, attempt to locate the last successful reference and verify server-side
    if (!ACTIVE_PLAN_STATUSES.has(status)) {
      const verified = await attemptVerificationByLookup();
      if (verified) {
        await ensureProfile();
        await loadSubscriptions();
        updateHeader();
        status = (state.profile?.subscription_status || '').toLowerCase();
      }
    }

    if (ACTIVE_PLAN_STATUSES.has(status)) {
      showToast('Payment confirmed. Your plan is active.', 'success');
    } else {
      showToast('Payment status refreshed. Still processing…', 'info');
    }
    setRefreshPaymentLoading(false);
    state.entitlementsRefreshing = false;
  }
}

async function refreshEntitlementsOnFocus() {
  if (!state.supabase || !state.user) return;
  if (state.entitlementsRefreshing) return;
  const status = (state.profile?.subscription_status || '').toLowerCase();
  try {
    state.entitlementsRefreshing = true;
    // If we were pending, ask the server to recompute status first
    if (status === 'pending_payment' || status === 'awaiting_setup') {
      await state.supabase.rpc('refresh_profile_subscription_status', {
        p_user_id: state.user.id,
      });
      // Proactively ask the server to reconcile this user's latest pending checkout
      try {
        await state.supabase.functions.invoke('reconcile-payments', {
          body: { userId: state.user.id },
        });
      } catch (reconcileError) {
        console.warn(
          '[Dashboard] reconcile-payments invocation failed',
          reconcileError
        );
      }
    }
  } catch (error) {
    // Non-fatal; proceed to refetch
    console.warn('[Dashboard] refresh on focus RPC failed', error);
  } finally {
    await ensureProfile();
    await loadSubscriptions();
    updateHeader();
    state.entitlementsRefreshing = false;
  }
}

function subscribeToProfileRealtime() {
  if (!state.supabase || !state.user || state.profileChannel) return;
  try {
    const channel = state.supabase
      .channel(`profile-updates-${state.user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${state.user.id}`,
        },
        async (payload) => {
          try {
            const next = payload?.new || null;
            if (next) {
              state.profile = next;
              updatePaymentGate(state.profile);
              updateHeader();
              const status = (next.subscription_status || '').toLowerCase();
              if (ACTIVE_PLAN_STATUSES.has(status)) {
                await loadSubscriptions();
                showToast('Your subscription is now active.', 'success');
              }
            }
          } catch (err) {
            console.warn('[Dashboard] Realtime profile handler failed', err);
          }
        }
      )
      .subscribe();
    state.profileChannel = channel;
  } catch (error) {
    console.warn('[Dashboard] Failed to subscribe to profile updates', error);
  }
}

function unsubscribeProfileRealtime() {
  try {
    if (
      state.profileChannel &&
      typeof state.profileChannel.unsubscribe === 'function'
    ) {
      state.profileChannel.unsubscribe();
    }
  } catch (error) {
    console.warn('[Dashboard] Failed to unsubscribe profile updates', error);
  } finally {
    state.profileChannel = null;
  }
}

async function attemptVerificationByLookup() {
  if (!state.supabase || !state.user) return false;
  try {
    const email = state.user?.email || state.profile?.email || '';
    const full =
      state.profile?.full_name || state.user?.user_metadata?.full_name || '';
    const [firstName, ...rest] = String(full).trim().split(/\s+/);
    const lastName = rest.join(' ');
    const phone =
      state.profile?.phone || state.user?.user_metadata?.phone || '';

    if (!email) return false;

    const { data: lookup, error: lookupError } =
      await state.supabase.functions.invoke('find-pending-registration', {
        body: { email, firstName, lastName, phone },
      });
    if (lookupError || !lookup?.reference) {
      return false;
    }

    const { error: verifyError } = await state.supabase.functions.invoke(
      'paystack-verify',
      {
        body: { reference: lookup.reference },
      }
    );
    if (verifyError) {
      console.warn('[Dashboard] Server-side verify failed', verifyError);
      return false;
    }

    await state.supabase.rpc('refresh_profile_subscription_status', {
      p_user_id: state.user.id,
    });
    return true;
  } catch (error) {
    console.warn('[Dashboard] attemptVerificationByLookup failed', error);
    return false;
  }
}

function populateProfileForm() {
  if (!elements.profileForm) return;
  if (elements.profileNameInput && state.profile?.full_name) {
    elements.profileNameInput.value = state.profile.full_name;
  }
  if (elements.profilePhoneInput) {
    elements.profilePhoneInput.value = state.profile?.phone || '';
  }
  if (elements.profileSchoolInput) {
    elements.profileSchoolInput.value = state.profile?.school_name || '';
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
  const schoolInput = elements.profileSchoolInput;
  const passwordInput = elements.profilePasswordInput;
  const confirmInput = elements.profilePasswordConfirmInput;
  const feedback = elements.profileFeedback;

  const fullName = nameInput?.value?.trim() || '';
  const schoolName = schoolInput?.value?.trim() || '';
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
    if (schoolName) {
      updates.school_name = schoolName;
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

function setAuthMethodsFeedback(message, type = 'info') {
  const target = elements.authMethodsFeedback;
  if (!target) return;
  target.textContent = message;
  target.classList.remove('hidden');
  target.className = 'rounded-xl border px-3.5 py-2.5 text-sm';
  if (type === 'success') {
    target.className =
      'rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700';
  } else if (type === 'error') {
    target.className =
      'rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700';
  } else {
    target.className =
      'rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-600';
  }
}

const OTP_CODE_PATTERN = /^[0-9]{6}$/;
const NIGERIA_COUNTRY_CODE = '+234';
const WHATSAPP_SEND_COOLDOWN_SECONDS = 30;
const COOLDOWN_TIMER_PROP = '__cooldownTimerId';

function normalizeNigeriaPhone(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let cleaned = raw.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('00')) {
    cleaned = `+${cleaned.slice(2)}`;
  }
  if (cleaned.startsWith('+')) {
    const digits = cleaned.slice(1).replace(/\D/g, '');
    return `+${digits}`;
  }
  const digits = cleaned.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('234')) return `+${digits}`;
  if (digits.startsWith('0'))
    return `${NIGERIA_COUNTRY_CODE}${digits.slice(1)}`;
  if (digits.length === 10) return `${NIGERIA_COUNTRY_CODE}${digits}`;
  return `${NIGERIA_COUNTRY_CODE}${digits}`;
}

function isPlausibleE164(phone) {
  return /^\+[1-9][0-9]{8,14}$/.test(String(phone || ''));
}

function isCooldownActive(button) {
  const until = Number(button?.dataset?.cooldownUntil || 0);
  return Number.isFinite(until) && until > Date.now();
}

function getButtonLabelEl(button) {
  return button?.querySelector?.('[data-role="btn-label"]') || null;
}

function getButtonDynamicEl(button) {
  return button?.querySelector?.('[data-role="btn-dynamic"]') || null;
}

function getButtonLabel(button) {
  const labelEl = getButtonLabelEl(button);
  return (
    (labelEl ? labelEl.textContent : null) ||
    button?.getAttribute?.('aria-label') ||
    button?.textContent ||
    ''
  );
}

function setButtonLabel(button, text) {
  if (!button) return;
  const labelEl = getButtonLabelEl(button);
  if (labelEl) {
    labelEl.textContent = text;
  }

  const dynamicEl = getButtonDynamicEl(button);
  if (dynamicEl) {
    const match = String(text || '').match(/\b(\d+s)\b/);
    if (match) {
      dynamicEl.textContent = match[1];
      dynamicEl.classList.remove('hidden');
    } else {
      dynamicEl.textContent = '';
      dynamicEl.classList.add('hidden');
    }
    return;
  }

  if (button.children?.length) {
    button.setAttribute('aria-label', text);
    return;
  }

  button.textContent = text;
}

function startCooldown(button, seconds, { doneText, prefixText } = {}) {
  if (!button) return;

  if (button[COOLDOWN_TIMER_PROP]) {
    window.clearInterval(button[COOLDOWN_TIMER_PROP]);
    button[COOLDOWN_TIMER_PROP] = null;
  }

  const original =
    button.dataset?.originalText ||
    getButtonLabel(button) ||
    doneText ||
    'Send';
  if (button.dataset && !button.dataset.originalText) {
    button.dataset.originalText = original;
  }

  const cooldownUntil = Date.now() + seconds * 1000;
  if (button.dataset) {
    button.dataset.cooldownUntil = String(cooldownUntil);
  }

  const prefix = prefixText || 'Send again in';

  const tick = () => {
    const dynamicEl = getButtonDynamicEl(button);
    if (dynamicEl) dynamicEl.classList.remove('hidden');

    const remaining = Math.ceil((cooldownUntil - Date.now()) / 1000);
    if (remaining <= 0) {
      if (button.dataset) delete button.dataset.cooldownUntil;
      button.disabled = false;
      button.classList.remove('opacity-60');
      if (dynamicEl) {
        dynamicEl.textContent = '';
        dynamicEl.classList.add('hidden');
      }
      setButtonLabel(button, original);
      return false;
    }
    button.disabled = true;
    button.classList.add('opacity-60');
    setButtonLabel(button, `${prefix} ${remaining}s`);
    return true;
  };

  tick();
  const timer = window.setInterval(() => {
    const keep = tick();
    if (!keep) {
      window.clearInterval(timer);
      if (button[COOLDOWN_TIMER_PROP] === timer) {
        button[COOLDOWN_TIMER_PROP] = null;
      }
    }
  }, 1000);
  button[COOLDOWN_TIMER_PROP] = timer;
}

function startWhatsAppLinkCooldown(seconds = WHATSAPP_SEND_COOLDOWN_SECONDS) {
  startCooldown(elements.whatsappLinkSendBtn, seconds, {
    doneText: 'Send code',
    prefixText: 'Send again in',
  });
  startCooldown(elements.whatsappLinkResendBtn, seconds, {
    doneText: 'Resend code',
    prefixText: 'Resend in',
  });
}

function setWhatsAppLinkFeedback(message, type = 'info') {
  const target = elements.whatsappLinkFeedback;
  if (!target) return;
  target.textContent = message;
  target.classList.remove('hidden');
  target.className = 'rounded-xl border px-3.5 py-2.5 text-sm';
  if (type === 'success') {
    target.className =
      'rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700';
  } else if (type === 'error') {
    target.className =
      'rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700';
  } else {
    target.className =
      'rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-600';
  }
}

async function extractEdgeFunctionError(error, fallbackMessage) {
  if (error?.context instanceof Response) {
    try {
      const cloned = error.context.clone();
      const contentType = cloned.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await cloned.json();
        if (json?.error) return json.error;
        if (json?.message) return json.message;
      }
      const text = await cloned.text();
      if (text) return text;
    } catch (parseError) {
      console.warn(
        '[Dashboard] Failed to parse function error response',
        parseError
      );
    }
  }

  if (
    error?.message &&
    error.message !== 'Edge Function returned a non-2xx status code'
  ) {
    return error.message;
  }

  return fallbackMessage;
}

function showWhatsAppVerifyRow() {
  elements.whatsappLinkVerifyRow?.classList.remove('hidden');
  elements.whatsappLinkVerifyRow?.classList.add('flex');
}

function showWhatsAppBioEditor() {
  const bio = elements.whatsappBioSection;
  if (!bio) return;
  bio.classList.remove('hidden');

  if (elements.whatsappBioFirstInput) {
    elements.whatsappBioFirstInput.value = state.profile?.first_name || '';
  }
  if (elements.whatsappBioLastInput) {
    elements.whatsappBioLastInput.value = state.profile?.last_name || '';
  }
  if (elements.whatsappBioSchoolInput) {
    elements.whatsappBioSchoolInput.value = state.profile?.school_name || '';
  }
  if (elements.whatsappBioEmail) {
    elements.whatsappBioEmail.textContent =
      state.user?.email || state.profile?.email || '—';
  }
}

async function handleWhatsAppLinkSend() {
  if (!state.supabase) return;
  setWhatsAppLinkFeedback('', 'info');

  const phone = normalizeNigeriaPhone(elements.whatsappLinkPhoneInput?.value);
  if (!phone || !isPlausibleE164(phone) || !phone.startsWith('+234')) {
    setWhatsAppLinkFeedback('Enter a valid Nigerian WhatsApp number.', 'error');
    elements.whatsappLinkPhoneInput?.focus();
    return;
  }

  try {
    if (elements.whatsappLinkSendBtn)
      elements.whatsappLinkSendBtn.disabled = true;

    const { data, error } = await state.supabase.functions.invoke(
      'whatsapp-link-request',
      { body: { phone } }
    );
    if (error) {
      const message = await extractEdgeFunctionError(
        error,
        'Unable to send code right now. Please try again.'
      );
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);

    startWhatsAppLinkCooldown();

    showWhatsAppVerifyRow();
    setWhatsAppLinkFeedback('Code sent to WhatsApp. Enter it below.', 'info');
    elements.whatsappLinkCodeInput?.focus();
  } catch (error) {
    console.error('[Dashboard] WhatsApp link send failed', error);
    setWhatsAppLinkFeedback(
      error?.message || 'Unable to send code right now. Please try again.',
      'error'
    );
  } finally {
    if (
      elements.whatsappLinkSendBtn &&
      !isCooldownActive(elements.whatsappLinkSendBtn)
    ) {
      elements.whatsappLinkSendBtn.disabled = false;
    }
  }
}

async function handleWhatsAppLinkVerify() {
  if (!state.supabase) return;
  const phone = normalizeNigeriaPhone(elements.whatsappLinkPhoneInput?.value);
  const code = String(elements.whatsappLinkCodeInput?.value || '')
    .replace(/\D/g, '')
    .slice(0, 6);

  if (!phone || !isPlausibleE164(phone)) {
    setWhatsAppLinkFeedback('Enter your WhatsApp number again.', 'error');
    elements.whatsappLinkPhoneInput?.focus();
    return;
  }
  if (!OTP_CODE_PATTERN.test(code)) {
    setWhatsAppLinkFeedback('Enter the 6-digit code.', 'error');
    elements.whatsappLinkCodeInput?.focus();
    return;
  }

  try {
    if (elements.whatsappLinkVerifyBtn)
      elements.whatsappLinkVerifyBtn.disabled = true;
    if (elements.whatsappLinkResendBtn)
      elements.whatsappLinkResendBtn.disabled = true;

    const { data, error } = await state.supabase.functions.invoke(
      'whatsapp-link-confirm',
      { body: { phone, code } }
    );
    if (error) {
      const message = await extractEdgeFunctionError(
        error,
        'Unable to verify the code. Please try again.'
      );
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);

    setWhatsAppLinkFeedback('WhatsApp login enabled successfully.', 'success');

    // Refresh profile to reflect new phone.
    await ensureProfile();
    populateProfileForm();

    showWhatsAppBioEditor();
  } catch (error) {
    console.error('[Dashboard] WhatsApp link verify failed', error);
    setWhatsAppLinkFeedback(
      error?.message || 'Unable to verify the code. Please try again.',
      'error'
    );
  } finally {
    if (elements.whatsappLinkVerifyBtn)
      elements.whatsappLinkVerifyBtn.disabled = false;
    if (
      elements.whatsappLinkResendBtn &&
      !isCooldownActive(elements.whatsappLinkResendBtn)
    ) {
      elements.whatsappLinkResendBtn.disabled = false;
    }
  }
}

async function handleWhatsAppLinkResend() {
  await handleWhatsAppLinkSend();
}

async function handleWhatsAppBioSave() {
  if (!state.supabase || !state.user) return;

  const firstName = String(elements.whatsappBioFirstInput?.value || '').trim();
  const lastName = String(elements.whatsappBioLastInput?.value || '').trim();
  const schoolName = String(
    elements.whatsappBioSchoolInput?.value || ''
  ).trim();

  if (!firstName) {
    setWhatsAppLinkFeedback('Enter your first name.', 'error');
    elements.whatsappBioFirstInput?.focus();
    return;
  }
  if (!lastName) {
    setWhatsAppLinkFeedback('Enter your last name.', 'error');
    elements.whatsappBioLastInput?.focus();
    return;
  }
  if (!schoolName) {
    setWhatsAppLinkFeedback('Enter your school name.', 'error');
    elements.whatsappBioSchoolInput?.focus();
    return;
  }

  try {
    if (elements.whatsappBioSaveBtn)
      elements.whatsappBioSaveBtn.disabled = true;

    const fullName = `${firstName} ${lastName}`.trim();
    const { error } = await state.supabase
      .from('profiles')
      .update({
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
        school_name: schoolName,
      })
      .eq('id', state.user.id);
    if (error) throw error;

    setWhatsAppLinkFeedback('Bio saved.', 'success');
    await ensureProfile();
    populateProfileForm();
  } catch (error) {
    console.error('[Dashboard] WhatsApp bio save failed', error);
    setWhatsAppLinkFeedback(
      error?.message || 'Unable to save right now. Please try again.',
      'error'
    );
  } finally {
    if (elements.whatsappBioSaveBtn)
      elements.whatsappBioSaveBtn.disabled = false;
  }
}

async function handleConnectGoogle() {
  if (!state.supabase || !state.user) return;

  setAuthMethodsFeedback('Connecting Google…', 'info');

  try {
    if (typeof state.supabase.auth.linkIdentity !== 'function') {
      setAuthMethodsFeedback(
        'Google linking is not available in this build. Please update the app.',
        'error'
      );
      return;
    }

    const redirectTo = new URL(window.location.href);
    redirectTo.hash = '';

    const { data, error } = await state.supabase.auth.linkIdentity({
      provider: 'google',
      options: {
        redirectTo: redirectTo.toString(),
      },
    });

    if (error) {
      const msg =
        error.message?.includes('manual linking') ||
        error.message?.includes('disabled')
          ? 'Google linking is disabled in Supabase settings. Enable manual linking, then try again.'
          : error.message || 'Unable to connect Google right now.';
      setAuthMethodsFeedback(msg, 'error');
      return;
    }

    if (data?.url) {
      window.location.assign(data.url);
      return;
    }

    setAuthMethodsFeedback(
      'Continue in the Google window to finish linking.',
      'success'
    );
  } catch (error) {
    console.error('[Dashboard] Google linking failed', error);
    setAuthMethodsFeedback(
      error?.message || 'Unable to connect Google right now.',
      'error'
    );
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
      elements.quizTitle.textContent = 'Start your examination';
    }
    if (elements.quizSubtitle) {
      elements.quizSubtitle.textContent = 'Your questions are ready.';
    }
    if (elements.resumeBtn) {
      elements.resumeBtn.textContent = 'Start examination';
      elements.resumeBtn.classList.remove('hidden');
    }
    setDailyButtonVariant('pending');
    if (elements.regenerateBtn) {
      elements.regenerateBtn.classList.add('hidden');
    }
    if (elements.questions) {
      elements.questions.innerHTML = `
        <li class="quiz-state">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="text-slate-700">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M12 6.25V20m0-13.75c-1.1-.85-2.55-1.35-4.25-1.35S4.6 5.4 3.5 6.25V20c1.1-.85 2.55-1.35 4.25-1.35S10.9 19.15 12 20m0-13.75c1.1-.85 2.55-1.35 4.25-1.35s3.15.5 4.25 1.35V20c-1.1-.85-2.55-1.35-4.25-1.35S13.1 19.15 12 20"></path>
          </svg>
          <h3 class="text-base font-semibold text-slate-900">Ready?</h3>
          <p class="text-sm text-slate-600">Tap “Start examination” to begin.</p>
        </li>
      `;
    }
  } else if (state.todayQuiz.status === 'completed') {
    // Quiz completed
    if (elements.quizTitle) {
      elements.quizTitle.textContent = 'Examination completed';
    }
    if (elements.quizSubtitle) {
      const score = state.todayQuiz.correct_answers || 0;
      const total = state.todayQuiz.total_questions || 0;
      const percent = total ? toPercent(score, total) : 0;
      elements.quizSubtitle.textContent = `Score: ${score}/${total} (${percent}%)`;
    }
    if (elements.resumeBtn) {
      elements.resumeBtn.textContent = 'View results';
      elements.resumeBtn.classList.remove('hidden');
    }
    setDailyButtonVariant('completed');
    if (elements.regenerateBtn) {
      elements.regenerateBtn.classList.remove('hidden');
    }
    if (elements.questions) {
      elements.questions.innerHTML = `
        <li class="quiz-state">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="text-emerald-700">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <h3 class="text-base font-semibold text-slate-900">Done</h3>
          <p class="text-sm text-slate-600">You can view your results or start again.</p>
          <p class="text-xs text-slate-500">Score: ${state.todayQuiz.correct_answers}/${state.todayQuiz.total_questions} (${toPercent(state.todayQuiz.correct_answers, state.todayQuiz.total_questions)}%)</p>
        </li>
      `;
    }
    if (elements.completionBanner) {
      elements.completionBanner.classList.remove('hidden');
    }
  } else {
    // Quiz in progress or assigned
    if (elements.quizTitle) {
      elements.quizTitle.textContent = 'Continue your examination';
    }
    if (elements.quizSubtitle) {
      elements.quizSubtitle.textContent = 'Continue where you stopped.';
    }
    if (elements.resumeBtn) {
      elements.resumeBtn.textContent = 'Continue';
      elements.resumeBtn.classList.remove('hidden');
    }
    setDailyButtonVariant('pending');
    if (elements.regenerateBtn) {
      elements.regenerateBtn.classList.remove('hidden');
    }
    if (elements.questions) {
      elements.questions.innerHTML = `
        <li class="quiz-state">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="text-cyan-700">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <h3 class="text-base font-semibold text-slate-900">In progress</h3>
          <p class="text-sm text-slate-600">Tap “Continue” to resume.</p>
        </li>
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
    elements.historySummary.textContent = `0 completed in last ${QUIZ_HISTORY_SUMMARY_DAYS} days`;
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

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const summaryStart = new Date(
    today.getTime() - (QUIZ_HISTORY_SUMMARY_DAYS - 1) * DAY_IN_MS
  );

  const completedRecently = state.history.filter((item) => {
    if (item.status !== 'completed') return false;
    const assigned = item.assigned_date ? new Date(item.assigned_date) : null;
    if (!assigned || Number.isNaN(assigned.getTime())) return false;
    return assigned >= summaryStart;
  }).length;

  elements.historySummary.textContent = `${completedRecently} completed in last ${QUIZ_HISTORY_SUMMARY_DAYS} days • showing ${state.history.length} sessions`;

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

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    // Refresh entitlements and UI when the app regains focus
    refreshEntitlementsOnFocus();
    loadExtraQuestionSets();
    loadGlobalAnnouncement();
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
        const message = String(generateError.message || '').toLowerCase();
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
        if (
          message.includes('selected subscription is no longer active') ||
          message.includes('selected subscription is no longer')
        ) {
          showToast(
            'That plan is no longer active. Choose a different plan to continue.',
            'error'
          );
          await loadSubscriptions();
          return;
        }
        if (
          message.includes('subslot configuration is incomplete') ||
          message.includes('missing dates')
        ) {
          showToast(
            'Your schedule is not ready yet. Please check back later.',
            'error'
          );
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
      const message = String(genError.message || '').toLowerCase();
      if (
        message.includes('selected subscription is no longer active') ||
        message.includes('selected subscription is no longer')
      ) {
        showToast(
          'That plan is no longer active. Choose a different plan to continue.',
          'error'
        );
        await loadSubscriptions();
        return;
      }
      if (
        message.includes('subslot configuration is incomplete') ||
        message.includes('missing dates')
      ) {
        showToast(
          'Your schedule is not ready yet. Please check back later.',
          'error'
        );
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
      .limit(QUIZ_HISTORY_FETCH_LIMIT);
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
        'id, full_name, role, last_seen_at, subscription_status, default_subscription_id, registration_stage, pending_plan_id, pending_plan_snapshot, phone, email, first_name, last_name, school_name'
      )
      .eq('id', state.user.id)
      .maybeSingle();
    if (error) throw error;

    if (!data) {
      const metadata = state.user.user_metadata || {};
      const fullName =
        metadata.full_name ||
        metadata.name ||
        metadata.fullName ||
        fallbackName;
      const parts = String(fullName || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      const firstName =
        metadata.first_name || (parts.length ? parts[0] : null) || null;
      const lastName =
        metadata.last_name ||
        (parts.length > 1 ? parts.slice(1).join(' ') : null) ||
        null;

      const { data: inserted, error: insertError } = await state.supabase
        .from('profiles')
        .upsert({
          id: state.user.id,
          full_name: fullName || null,
          first_name: firstName,
          last_name: lastName,
          email: state.user.email ?? null,
          role: 'learner',
          phone: metadata.phone || null,
          last_seen_at: new Date().toISOString(),
        })
        .select(
          'id, full_name, role, last_seen_at, subscription_status, default_subscription_id, registration_stage, pending_plan_id, pending_plan_snapshot, phone, email, first_name, last_name, school_name'
        )
        .single();
      if (insertError) throw insertError;
      state.profile = inserted;
    } else {
      const patch = {
        last_seen_at: new Date().toISOString(),
        ...(state.user.email ? { email: state.user.email } : {}),
      };
      const { data: updated, error: updateError } = await state.supabase
        .from('profiles')
        .update(patch)
        .eq('id', state.user.id)
        .select(
          'id, full_name, role, last_seen_at, subscription_status, default_subscription_id, registration_stage, pending_plan_id, pending_plan_snapshot, phone, email, first_name, last_name, school_name'
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

    // If the user paid while offline (or never returned to the callback),
    // try to reconcile immediately on first load (not only on focus/online).
    await refreshEntitlementsOnFocus();

    // Realtime: listen for profile updates to flip UI immediately on webhook
    subscribeToProfileRealtime();

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
    elements.connectGoogleBtn?.addEventListener('click', handleConnectGoogle);
    elements.whatsappLinkSendBtn?.addEventListener(
      'click',
      handleWhatsAppLinkSend
    );
    elements.whatsappLinkVerifyBtn?.addEventListener(
      'click',
      handleWhatsAppLinkVerify
    );
    elements.whatsappLinkResendBtn?.addEventListener(
      'click',
      handleWhatsAppLinkResend
    );
    elements.whatsappBioSaveBtn?.addEventListener(
      'click',
      handleWhatsAppBioSave
    );
    elements.whatsappLinkCodeInput?.addEventListener('input', () => {
      if (!elements.whatsappLinkCodeInput) return;
      elements.whatsappLinkCodeInput.value = String(
        elements.whatsappLinkCodeInput.value || ''
      )
        .replace(/\D/g, '')
        .slice(0, 6);
    });
    document.addEventListener('visibilitychange', handleVisibilityChange);
    elements.globalNoticeDismiss?.addEventListener(
      'click',
      handleGlobalNoticeDismiss
    );
    elements.refreshPaymentBtn?.addEventListener(
      'click',
      refreshPaymentStatusNow
    );
    window.addEventListener('focus', refreshEntitlementsOnFocus);
    window.addEventListener('online', refreshEntitlementsOnFocus);

    // Load data without auto-generating quiz
    await loadScheduleHealth();
    await checkTodayQuiz();
    await refreshHistory();
    await loadExtraQuestionSets();
    await loadGlobalAnnouncement();
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
  elements.connectGoogleBtn?.removeEventListener('click', handleConnectGoogle);
  elements.whatsappLinkSendBtn?.removeEventListener(
    'click',
    handleWhatsAppLinkSend
  );
  elements.whatsappLinkVerifyBtn?.removeEventListener(
    'click',
    handleWhatsAppLinkVerify
  );
  elements.whatsappLinkResendBtn?.removeEventListener(
    'click',
    handleWhatsAppLinkResend
  );
  elements.whatsappBioSaveBtn?.removeEventListener(
    'click',
    handleWhatsAppBioSave
  );
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  elements.globalNoticeDismiss?.removeEventListener(
    'click',
    handleGlobalNoticeDismiss
  );
  elements.refreshPaymentBtn?.removeEventListener(
    'click',
    refreshPaymentStatusNow
  );
  window.removeEventListener('focus', refreshEntitlementsOnFocus);
  window.removeEventListener('online', refreshEntitlementsOnFocus);
  unsubscribeProfileRealtime();
}

window.addEventListener('beforeunload', cleanup);

bindNavigation();
setActiveView('dashboard');

initialise();

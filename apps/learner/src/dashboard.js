import { apiFetch } from '../../shared/apiClient.js';
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
};

const state = {
  user: null,
  profile: null,
  todayQuiz: null,
  history: [],
  scheduleHealth: null,
  subscriptions: [],
  defaultSubscriptionId: null,
  activeView: 'dashboard',
  globalAnnouncement: null,
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
  if (!state.user) return;
  try {
    const { announcement } = await apiFetch('/api/dashboard/announcement');
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
  const hasAnyActive = subscriptions.some(isSubscriptionActive);
  if (explicit) {
    // If the saved default plan has expired but the user has another active plan
    // (e.g. they renewed and a new subscription record was created), don't keep
    // the UI "stuck" on the expired default.
    if (isSubscriptionActive(explicit) || !hasAnyActive) {
      return explicit;
    }
  }

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
  if (!subscriptionId) {
    return;
  }

  try {
    const data = await apiFetch('/api/dashboard/default-subscription', {
      method: 'POST',
      body: { subscriptionId },
    });

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
  if (!subscriptionId) {
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
      const data = await apiFetch('/api/dashboard/default-subscription', {
        method: 'POST',
        body: { subscriptionId },
      });
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
    const data = await apiFetch('/api/dashboard/daily-quiz/generate', {
      method: 'POST',
      body: { subscriptionId },
    });

    if (data?.error) {
      const message = data.error || '';
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
      throw new Error(message);
    }

    const quizId = data?.dailyQuizId || data?.daily_quiz_id;
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
      ? `We saved ${planName}. Complete checkout now to unlock daily exams and streak tracking.`
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
  if (!state.user) return;
  if (state.entitlementsRefreshing) return;
  try {
    state.entitlementsRefreshing = true;
    setRefreshPaymentLoading(true);
    await apiFetch('/api/jobs/reconcile-payments', {
      method: 'POST',
      body: { userId: state.user.id },
    });
  } catch (error) {
    console.warn('[Dashboard] payment reconciliation failed', error);
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
  if (!state.user) return;
  if (state.entitlementsRefreshing) return;
  const status = (state.profile?.subscription_status || '').toLowerCase();
  try {
    state.entitlementsRefreshing = true;
    if (status === 'pending_payment' || status === 'awaiting_setup') {
      await apiFetch('/api/jobs/reconcile-payments', {
        method: 'POST',
        body: { userId: state.user.id },
      });
    }
  } catch (error) {
    console.warn('[Dashboard] refresh on focus reconciliation failed', error);
  } finally {
    await ensureProfile();
    await loadSubscriptions();
    updateHeader();
    state.entitlementsRefreshing = false;
  }
}

async function attemptVerificationByLookup() {
  if (!state.user) return false;
  try {
    await apiFetch('/api/jobs/reconcile-payments', {
      method: 'POST',
      body: { userId: state.user.id },
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
    if (newPassword) {
      throw new Error(
        'Password changes now use the password reset flow from the sign-in page.'
      );
    }

    const result = await apiFetch('/api/me/profile', {
      method: 'PATCH',
      body: {
        fullName,
        schoolName,
      },
    });
    state.profile = result.profile || state.profile;

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

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    // Refresh entitlements and UI when the app regains focus
    refreshEntitlementsOnFocus();
    loadGlobalAnnouncement();
  }
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
  try {
    const { health } = await apiFetch('/api/dashboard/schedule-health');
    state.scheduleHealth = health || null;
    updateScheduleNotice(state.scheduleHealth);
  } catch (error) {
    console.error('[Dashboard] loadScheduleHealth failed', error);
    state.scheduleHealth = { status: 'error', message: error.message };
    updateScheduleNotice(state.scheduleHealth);
  }
}

async function checkTodayQuiz() {
  try {
    const { quiz } = await apiFetch('/api/dashboard/daily-quiz/today');
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
      showToast('Generating your daily questions...', 'info');
      let generated;
      try {
        generated = await apiFetch('/api/dashboard/daily-quiz/generate', {
          method: 'POST',
          body: { subscriptionId: rpcArgs.p_subscription_id },
        });
      } catch (generateError) {
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

      const quizId = generated?.dailyQuizId || generated?.daily_quiz_id;
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
    try {
      await apiFetch('/api/dashboard/daily-quiz/generate', {
        method: 'POST',
        body: { subscriptionId: selectedSubscription.id },
      });
    } catch (genError) {
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
    const { history } = await apiFetch(
      `/api/dashboard/daily-quiz/history?limit=${QUIZ_HISTORY_FETCH_LIMIT}`
    );
    state.history = history || [];
    renderHistory();
    updatePlanCollectionLabels(state.todayQuiz);
  } catch (error) {
    console.error('[Dashboard] refreshHistory failed', error);
    showToast('Unable to load history', 'error');
  }
}

async function loadSubscriptions() {
  if (!state.user) return;

  try {
    if (
      !state.defaultSubscriptionId &&
      state.profile?.default_subscription_id
    ) {
      state.defaultSubscriptionId = state.profile.default_subscription_id;
    }

    const { subscriptions } = await apiFetch('/api/dashboard/subscriptions');
    state.subscriptions = Array.isArray(subscriptions) ? subscriptions : [];

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
    const data = await apiFetch('/api/me');
    if (data?.user) {
      state.user = data.user;
    }
    state.profile = data?.profile || {
      full_name: fallbackName,
      subscription_status: 'inactive',
      default_subscription_id: null,
      registration_stage: 'profile_created',
    };

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
    await apiFetch('/api/auth/sign-out', { method: 'POST' }).catch((error) => {
      if (error?.status !== 401) throw error;
    });
    clearSessionFingerprint();
    window.location.replace('login.html');
  } catch (error) {
    console.error('[Dashboard] signOut failed', error);
    showToast('Unable to sign out. Please try again.', 'error');
  }
}

async function initialise() {
  try {
    const sessionData = await apiFetch('/api/me').catch((error) => {
      if (error?.status === 401) return null;
      throw error;
    });
    if (!sessionData?.user) {
      window.location.replace('login.html');
      return;
    }
    state.user = sessionData.user;
    state.profile = sessionData.profile || null;

    await ensureProfile();
    await loadSubscriptions();
    updatePaymentGate(state.profile);
    updateHeader();

    // If the user paid while offline (or never returned to the callback),
    // try to reconcile immediately on first load (not only on focus/online).
    await refreshEntitlementsOnFocus();

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
    elements.profileForm?.addEventListener('submit', handleProfileSubmit);
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
  elements.profileForm?.removeEventListener('submit', handleProfileSubmit);
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
}

window.addEventListener('beforeunload', cleanup);

bindNavigation();
setActiveView('dashboard');

initialise();

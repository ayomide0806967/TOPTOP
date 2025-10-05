import { getSupabaseClient } from '../../shared/supabaseClient.js';

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
  userGreeting: document.querySelector('[data-role="user-greeting"]'),
  userEmail: document.querySelector('[data-role="user-email"]'),
  progressBar: document.querySelector('[data-role="progress-bar"]'),
  progressLabel: document.querySelector('[data-role="progress-label"]'),
  subscriptionCard: document.querySelector('[data-role="subscription-card"]'),
  planStatusChip: document.querySelector('[data-role="plan-status-chip"]'),
  planName: document.querySelector('[data-role="plan-name"]'),
  planDescription: document.querySelector('[data-role="plan-description"]'),
  planDays: document.querySelector('[data-role="plan-days"]'),
  planRenewal: document.querySelector('[data-role="plan-renewal"]'),
  planPrice: document.querySelector('[data-role="plan-price"]'),
  planProgressBar: document.querySelector('[data-role="plan-progress-bar"]'),
  planProgressLabel: document.querySelector('[data-role="plan-progress-label"]'),
  planDates: document.querySelector('[data-role="plan-dates"]'),
  planRenewBtn: document.querySelector('[data-role="plan-renew"]'),
  planDailyLimit: document.querySelector('[data-role="plan-daily-limit"]'),
};

const state = {
  supabase: null,
  user: null,
  profile: null,
  todayQuiz: null,
  history: [],
  scheduleHealth: null,
  subscription: null,
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
    classes: ['bg-emerald-100', 'text-emerald-700', 'border-emerald-200'],
  },
  trialing: {
    label: 'Trialing',
    classes: ['bg-amber-100', 'text-amber-700', 'border-amber-200'],
  },
  past_due: {
    label: 'Past Due',
    classes: ['bg-amber-100', 'text-amber-700', 'border-amber-200'],
  },
  expired: {
    label: 'Expired',
    classes: ['bg-rose-100', 'text-rose-700', 'border-rose-200'],
  },
  canceled: {
    label: 'Cancelled',
    classes: ['bg-slate-100', 'text-slate-500', 'border-slate-200'],
  },
  inactive: {
    label: 'Inactive',
    classes: ['bg-slate-100', 'text-slate-500', 'border-slate-200'],
  },
  pending_payment: {
    label: 'Pending',
    classes: ['bg-amber-100', 'text-amber-700', 'border-amber-200'],
  },
  none: {
    label: 'No Plan',
    classes: ['bg-slate-100', 'text-slate-500', 'border-slate-200'],
  },
};

const PLAN_STATUS_CLASSNAMES = [
  ...new Set(Object.values(PLAN_STATUS_STYLES).flatMap((entry) => entry.classes)),
];

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

function setPlanStatusChip(statusKey, customLabel) {
  const chip = elements.planStatusChip;
  if (!chip) return;
  const normalized = (statusKey || '').toLowerCase();
  const entry = PLAN_STATUS_STYLES[normalized] || PLAN_STATUS_STYLES.none;
  chip.classList.remove(...PLAN_STATUS_CLASSNAMES);
  chip.classList.add(...entry.classes);
  chip.textContent = customLabel || entry.label;
}

function renderSubscription() {
  const card = elements.subscriptionCard;
  if (!card) return;

  const {
    planName,
    planDescription,
    planDays,
    planRenewal,
    planPrice,
    planProgressBar,
    planProgressLabel,
    planDates,
    planRenewBtn,
  } = elements;

  const subscription = state.subscription;
  const profileStatus = state.profile?.subscription_status || 'inactive';

  const showCard = () => {
    card.classList.remove('hidden');
  };

  const attachRenewHandler = (href, label) => {
    if (!planRenewBtn) return;
    planRenewBtn.textContent = label;
    planRenewBtn.onclick = () => {
      window.location.href = href;
    };
  };

  if (!subscription) {
    showCard();
    setPlanStatusChip(profileStatus);
    if (planName) {
      planName.textContent = 'No active subscription';
    }
    if (planDescription) {
      planDescription.textContent =
        profileStatus === 'pending_payment'
          ? 'We detected a pending payment. Finish checkout to unlock full access to daily quizzes.'
          : 'Unlock personalised quizzes, analytics, and the full CBT bank by choosing a plan.';
    }
    if (planDays) planDays.textContent = '—';
    if (planRenewal) planRenewal.textContent = '—';
    if (planPrice) planPrice.textContent = '—';
    if (planProgressBar) planProgressBar.style.width = '0%';
    if (planProgressLabel) {
      planProgressLabel.textContent =
        profileStatus === 'pending_payment'
          ? 'Awaiting payment confirmation.'
          : 'No plan selected yet.';
    }
    if (planDates) {
      planDates.textContent =
        profileStatus === 'pending_payment'
          ? 'Resume checkout to activate your plan.'
          : '';
    }
    if (elements.planDailyLimit) {
      elements.planDailyLimit.textContent = '—';
    }
    if (elements.heroPlanHeadline) {
      elements.heroPlanHeadline.textContent =
        profileStatus === 'pending_payment'
          ? 'Finish your checkout to unlock today’s personalised drill.'
          : 'Choose a plan to unlock daily personalised quizzes and analytics.';
    }
    if (elements.heroDaysRemaining) {
      elements.heroDaysRemaining.textContent =
        profileStatus === 'pending_payment' ? 'Pending activation' : 'No active plan yet';
    }
    if (elements.heroProgressBar) {
      elements.heroProgressBar.style.width = '0%';
    }
    if (elements.heroProgressLabel) {
      elements.heroProgressLabel.textContent =
        profileStatus === 'pending_payment'
          ? 'We are waiting for your payment confirmation.'
          : 'Your streak begins as soon as you activate a plan.';
    }
    attachRenewHandler(
      profileStatus === 'pending_payment' ? 'resume-registration.html' : 'subscription-plans.html',
      profileStatus === 'pending_payment' ? 'Resume checkout' : 'Browse plans'
    );
    return;
  }

  const normalizedStatus = (subscription.status || '').toLowerCase();
  const plan = subscription.plan || subscription.subscription_plans || {};
  const startedAt = parseDate(subscription.started_at);
  const expiresAt = parseDate(subscription.expires_at);
  const now = new Date();
  const hasEnded = Boolean(expiresAt && expiresAt.getTime() < now.getTime());
  const statusKey = hasEnded ? 'expired' : normalizedStatus || 'active';

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
      : hasEnded
      ? 100
      : normalizedStatus === 'active'
      ? 10
      : 0;

  showCard();
  setPlanStatusChip(statusKey);

  if (planName) {
    planName.textContent = plan.name || 'Active subscription';
  }
  if (planDescription) {
    const planMetadata =
      plan && typeof plan.metadata === 'object' && plan.metadata !== null ? plan.metadata : null;
    const copy =
      planMetadata?.tagline ||
      planMetadata?.description ||
      planMetadata?.summary ||
      plan.description;
    planDescription.textContent =
      copy || 'Personalised drills, analytics, and curated study support for your exam.';
  }
  if (planDays) {
    planDays.textContent =
      daysRemaining !== null
        ? `${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`
        : '—';
  }
  if (planRenewal) {
    planRenewal.textContent = expiresAt ? formatDate(expiresAt.toISOString()) : '—';
  }
  if (planPrice) {
    planPrice.textContent = formatCurrency(plan.price, plan.currency || 'NGN');
  }
  if (elements.planDailyLimit) {
    const limit = plan.daily_question_limit;
    elements.planDailyLimit.textContent = limit
      ? `${limit} questions / day`
      : plan?.metadata?.dailyLimit
      ? `${plan.metadata.dailyLimit} questions / day`
      : '—';
  }
  if (planProgressBar) {
    planProgressBar.style.width = `${progressPercent}%`;
  }
  if (planProgressLabel) {
    if (totalDays && usedDays !== null && daysRemaining !== null) {
      planProgressLabel.textContent = `${usedDays} of ${totalDays} days used • ${daysRemaining} left`;
    } else if (normalizedStatus === 'trialing') {
      planProgressLabel.textContent = 'Trial access is active.';
    } else if (hasEnded) {
      planProgressLabel.textContent = 'Plan expired. Renew to keep access.';
    } else {
      planProgressLabel.textContent = 'Plan status updated.';
    }
  }
  if (planDates) {
    if (startedAt && expiresAt) {
      planDates.textContent = `${formatDate(startedAt.toISOString())} – ${formatDate(
        expiresAt.toISOString(),
      )}`;
    } else if (startedAt) {
      planDates.textContent = `Started ${formatDate(startedAt.toISOString())}`;
    } else if (expiresAt) {
      planDates.textContent = `Renews ${formatDate(expiresAt.toISOString())}`;
    } else {
      planDates.textContent = '';
    }
  }

  if (planRenewBtn) {
    if (hasEnded || (daysRemaining !== null && daysRemaining <= 7)) {
      attachRenewHandler('subscription-plans.html', hasEnded ? 'Renew now' : 'Renew plan');
    } else if (normalizedStatus === 'trialing') {
      attachRenewHandler('subscription-plans.html', 'Upgrade plan');
    } else {
      attachRenewHandler('subscription-plans.html', 'Manage plan');
    }
  }

  if (elements.heroPlanHeadline) {
    const daysLabel =
      daysRemaining !== null
        ? `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left`
        : expiresAt
        ? `Renews ${formatDate(expiresAt.toISOString())}`
        : normalizedStatus === 'trialing'
        ? 'Trial access is active'
        : 'Ongoing access';

    elements.heroPlanHeadline.textContent = plan.name
      ? `${plan.name} • ${daysLabel}`
      : `Active plan • ${daysLabel}`;
  }

  if (elements.heroDaysRemaining) {
    if (daysRemaining !== null) {
      elements.heroDaysRemaining.textContent = `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining`;
    } else if (expiresAt) {
      elements.heroDaysRemaining.textContent = `Renews ${formatDate(expiresAt.toISOString())}`;
    } else if (normalizedStatus === 'trialing') {
      elements.heroDaysRemaining.textContent = 'Trial in progress';
    } else {
      elements.heroDaysRemaining.textContent = 'Active access';
    }
  }

  if (elements.heroProgressBar) {
    elements.heroProgressBar.style.width = `${progressPercent}%`;
  }

  if (elements.heroProgressLabel) {
    if (totalDays && usedDays !== null && daysRemaining !== null) {
      elements.heroProgressLabel.textContent = `${usedDays} of ${totalDays} days used · ${daysRemaining} to go`;
    } else if (normalizedStatus === 'trialing') {
      elements.heroProgressLabel.textContent = 'Trial is underway. Upgrade any time to keep your streak going.';
    } else if (hasEnded) {
      elements.heroProgressLabel.textContent = 'Plan expired. Renew to continue your personalised drills.';
    } else {
      elements.heroProgressLabel.textContent = 'Your progress updates as you complete each day’s questions.';
    }
  }
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
      .select('id, status, total_questions, correct_answers, started_at, completed_at, assigned_date')
      .eq('user_id', state.user.id)
      .eq('assigned_date', today)
      .maybeSingle();

    if (error) throw error;
    state.todayQuiz = quiz;
    updateQuizSection();
  } catch (error) {
    console.error('[Dashboard] checkTodayQuiz failed', error);
    showToast('Unable to check today\'s quiz status', 'error');
  }
}

async function startOrResumeQuiz() {
  try {
    if (!state.todayQuiz) {
      // Generate new quiz first
      showToast('Generating your daily questions...', 'info');
      const { data: generated, error: generateError } = await state.supabase.rpc('generate_daily_quiz');
      if (generateError) {
        // Handle specific error messages
        const message = generateError.message || '';
        if (message.includes('no active subscription')) {
          showToast('You need an active subscription to access daily questions', 'error');
          return;
        }
        if (message.includes('no active study slot')) {
          showToast('No active study slot for your department today', 'error');
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
    showToast('Generating new questions...', 'info');
    const { error: genError } = await state.supabase.rpc('generate_daily_quiz');
    if (genError) throw genError;
    
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
  } catch (error) {
    console.error('[Dashboard] refreshHistory failed', error);
    showToast('Unable to load history', 'error');
  }
}

async function loadActiveSubscription() {
  if (!state.supabase || !state.user) return;
  try {
    const { data, error } = await state.supabase
      .from('user_subscriptions')
      .select(
        `id, status, started_at, expires_at, plan:subscription_plans (
          id,
          name,
          duration_days,
          price,
          currency,
          daily_question_limit,
          plan_tier,
          metadata
        )`
      )
      .eq('user_id', state.user.id)
      .in('status', ['active', 'trialing', 'past_due'])
      .order('expires_at', { ascending: false, nullsLast: false })
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    state.subscription = data || null;
  } catch (error) {
    console.error('[Dashboard] loadActiveSubscription failed', error);
    showToast('Unable to load subscription details', 'error');
    state.subscription = null;
  }

  renderSubscription();
}

async function ensureProfile() {
  const fallbackName = state.user.email?.split('@')[0] ?? 'Learner';
  try {
    const { data, error } = await state.supabase
      .from('profiles')
      .select('id, full_name, role, last_seen_at, subscription_status')
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
        .select('id, full_name, role, last_seen_at, subscription_status')
        .single();
      if (insertError) throw insertError;
      state.profile = inserted;
    } else {
      const { data: updated, error: updateError } = await state.supabase
        .from('profiles')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', state.user.id)
        .select('id, full_name, role, last_seen_at, subscription_status')
        .single();
      if (!updateError && updated) {
        state.profile = updated;
      } else {
        state.profile = data;
      }
    }
  } catch (error) {
    console.error('[Dashboard] ensureProfile failed', error);
    showToast('Unable to load profile', 'error');
    state.profile = { full_name: fallbackName, subscription_status: 'inactive' };
  }
}

async function handleLogout() {
  try {
    await state.supabase.auth.signOut();
    window.location.replace('login.html');
  } catch (error) {
    console.error('[Dashboard] signOut failed', error);
    showToast('Unable to sign out. Please try again.', 'error');
  }
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
    await loadActiveSubscription();
    updateHeader();

    // Bind event listeners
    elements.resumeBtn?.addEventListener('click', startOrResumeQuiz);
    elements.regenerateBtn?.addEventListener('click', regenerateQuiz);
    elements.logoutBtn?.addEventListener('click', handleLogout);

    // Load data without auto-generating quiz
    await loadScheduleHealth();
    await checkTodayQuiz();
    await refreshHistory();
  } catch (error) {
    console.error('[Dashboard] initialisation failed', error);
    showToast('Something went wrong while loading the dashboard.', 'error');
  }
}

initialise();

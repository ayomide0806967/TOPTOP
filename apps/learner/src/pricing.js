import { getSupabaseClient } from '../../shared/supabaseClient.js';

const grid = document.querySelector('[data-role="pricing-grid"]');
const errorEl = document.querySelector('[data-role="pricing-error"]');
const tabsEl = document.querySelector('[data-role="department-tabs"]');
const changeDepartmentBtn = document.querySelector(
  '[data-role="change-department"]'
);
const gateEl = document.querySelector('[data-role="department-gate"]');
const gateOptionsEl = document.querySelector(
  '[data-role="department-options"]'
);
const gateLoadingEl = document.querySelector(
  '[data-role="department-loading"]'
);
const gateGeneralBtn = document.querySelector('[data-role="select-general"]');
const authChoiceModal = document.querySelector(
  '[data-role="auth-choice-modal"]'
);
const authChoicePanel = document.querySelector(
  '[data-role="auth-choice-panel"]'
);
const authChoiceCloseBtn = document.querySelector(
  '[data-role="auth-choice-close"]'
);
const authChoiceGoogleBtn = document.querySelector(
  '[data-role="auth-choice-google"]'
);
const authChoiceWhatsAppBtn = document.querySelector(
  '[data-role="auth-choice-whatsapp"]'
);
const authLoadingOverlay = document.querySelector(
  '[data-role="auth-loading-overlay"]'
);
const checkoutActivationOverlay = document.querySelector(
  '[data-role="checkout-activation-overlay"]'
);

const THEME_MAP = {
  nursing: {
    header:
      'bg-gradient-to-br from-cyan-50 via-cyan-100 to-white text-cyan-900',
    accent: 'text-cyan-700',
    button: 'bg-cyan-600 hover:bg-cyan-700 text-white',
    border: 'border-cyan-200',
  },
  midwifery: {
    header:
      'bg-gradient-to-br from-violet-50 via-violet-100 to-white text-violet-900',
    accent: 'text-violet-700',
    button: 'bg-violet-600 hover:bg-violet-700 text-white',
    border: 'border-violet-200',
  },
  'public-health': {
    header:
      'bg-gradient-to-br from-amber-50 via-amber-100 to-white text-amber-900',
    accent: 'text-amber-700',
    button: 'bg-amber-600 hover:bg-amber-700 text-white',
    border: 'border-amber-200',
  },
  default: {
    header:
      'bg-gradient-to-br from-slate-50 via-slate-100 to-white text-slate-900',
    accent: 'text-slate-700',
    button: 'bg-slate-900 hover:bg-slate-800 text-white',
    border: 'border-slate-200',
  },
};

const CARD_PALETTES = {
  default: {
    softGradient:
      'linear-gradient(155deg, #f6e8d5 0%, #e6d0ab 45%, #cfb080 100%)',
    softShadow: '0 40px 65px -30px rgba(87, 59, 25, 0.45)',
    softShadowHover: '0 48px 80px -32px rgba(87, 59, 25, 0.55)',
    contrastGradient:
      'linear-gradient(155deg, #302419 0%, #1d140d 45%, #0b0704 100%)',
    contrastShadow: '0 40px 65px -30px rgba(12, 10, 8, 0.7)',
    contrastShadowHover: '0 50px 90px -35px rgba(12, 10, 8, 0.75)',
    iconSoftBg: 'rgba(255, 255, 255, 0.65)',
    iconSoftColor: 'rgba(82, 54, 27, 0.9)',
    iconContrastBg: 'rgba(255, 255, 255, 0.18)',
    iconContrastColor: '#f7e2ba',
    pillSoftBg: 'rgba(255, 255, 255, 0.75)',
    pillSoftText: '#2d2114',
    pillContrastBg: 'rgba(248, 225, 184, 0.25)',
    pillContrastText: '#f5d9a8',
    footerSoftBg: 'linear-gradient(160deg, #1a140f 0%, #0f0a07 100%)',
    footerSoftText: '#f8e9d0',
    footerContrastBg:
      'linear-gradient(155deg, #f7e5b8 0%, #eec88f 60%, #dfb372 100%)',
    footerContrastText: '#2d2114',
    priceSoftMuted: 'rgba(45, 33, 20, 0.7)',
    priceContrastMuted: 'rgba(248, 235, 210, 0.75)',
  },
  nursing: {
    softGradient:
      'linear-gradient(155deg, #e2f6f3 0%, #c8ece7 45%, #b4e0da 100%)',
    softShadow: '0 40px 65px -30px rgba(12, 74, 68, 0.35)',
    softShadowHover: '0 48px 80px -32px rgba(12, 74, 68, 0.45)',
    contrastGradient:
      'linear-gradient(155deg, #123c39 0%, #0a2422 45%, #051211 100%)',
    contrastShadow: '0 40px 65px -30px rgba(5, 21, 20, 0.6)',
    contrastShadowHover: '0 50px 90px -35px rgba(5, 21, 20, 0.7)',
    iconSoftBg: 'rgba(255, 255, 255, 0.72)',
    iconSoftColor: '#0f4f4b',
    iconContrastBg: 'rgba(255, 255, 255, 0.16)',
    iconContrastColor: '#7ef2de',
    pillSoftBg: 'rgba(255, 255, 255, 0.78)',
    pillSoftText: '#07514c',
    pillContrastBg: 'rgba(125, 249, 226, 0.2)',
    pillContrastText: '#a0f7ea',
    footerSoftBg: 'linear-gradient(155deg, #0f403b 0%, #082422 100%)',
    footerSoftText: '#e6fffb',
    footerContrastBg:
      'linear-gradient(155deg, #aef2e7 0%, #7de5d5 60%, #56d7c4 100%)',
    footerContrastText: '#062b28',
    priceSoftMuted: 'rgba(7, 81, 76, 0.7)',
    priceContrastMuted: 'rgba(160, 247, 234, 0.78)',
  },
  midwifery: {
    softGradient:
      'linear-gradient(155deg, #f4e8ff 0%, #e4d0ff 45%, #ceb1f8 100%)',
    softShadow: '0 40px 65px -30px rgba(99, 37, 140, 0.35)',
    softShadowHover: '0 48px 80px -32px rgba(99, 37, 140, 0.45)',
    contrastGradient:
      'linear-gradient(155deg, #321548 0%, #220d34 45%, #12061d 100%)',
    contrastShadow: '0 40px 65px -30px rgba(24, 9, 37, 0.65)',
    contrastShadowHover: '0 50px 90px -35px rgba(24, 9, 37, 0.75)',
    iconSoftBg: 'rgba(255, 255, 255, 0.7)',
    iconSoftColor: '#4b2178',
    iconContrastBg: 'rgba(255, 255, 255, 0.18)',
    iconContrastColor: '#dfc0ff',
    pillSoftBg: 'rgba(255, 255, 255, 0.78)',
    pillSoftText: '#431e6a',
    pillContrastBg: 'rgba(222, 191, 255, 0.22)',
    pillContrastText: '#e9ceff',
    footerSoftBg: 'linear-gradient(155deg, #452460 0%, #2c163f 100%)',
    footerSoftText: '#f5ebff',
    footerContrastBg:
      'linear-gradient(155deg, #edd5ff 0%, #d3aefc 60%, #be8ff6 100%)',
    footerContrastText: '#2d0f42',
    priceSoftMuted: 'rgba(67, 30, 106, 0.68)',
    priceContrastMuted: 'rgba(236, 214, 255, 0.78)',
  },
  'public-health': {
    softGradient:
      'linear-gradient(155deg, #fff1d8 0%, #f7ddb1 45%, #f0c482 100%)',
    softShadow: '0 40px 65px -30px rgba(146, 94, 28, 0.35)',
    softShadowHover: '0 48px 80px -32px rgba(146, 94, 28, 0.45)',
    contrastGradient:
      'linear-gradient(155deg, #3b2b14 0%, #251b0a 45%, #120d05 100%)',
    contrastShadow: '0 40px 65px -30px rgba(23, 15, 6, 0.7)',
    contrastShadowHover: '0 50px 90px -35px rgba(23, 15, 6, 0.78)',
    iconSoftBg: 'rgba(255, 255, 255, 0.7)',
    iconSoftColor: '#8a5a1d',
    iconContrastBg: 'rgba(255, 255, 255, 0.18)',
    iconContrastColor: '#f7e0b5',
    pillSoftBg: 'rgba(255, 255, 255, 0.76)',
    pillSoftText: '#704310',
    pillContrastBg: 'rgba(248, 222, 176, 0.25)',
    pillContrastText: '#f8deb0',
    footerSoftBg: 'linear-gradient(155deg, #5c3a11 0%, #39230c 100%)',
    footerSoftText: '#fcefd9',
    footerContrastBg:
      'linear-gradient(155deg, #ffe3ad 0%, #f3c877 60%, #e3ac4c 100%)',
    footerContrastText: '#2d1c08',
    priceSoftMuted: 'rgba(92, 58, 17, 0.7)',
    priceContrastMuted: 'rgba(248, 222, 176, 0.78)',
  },
};

const paystackConfig = window.__PAYSTACK_CONFIG__ || {};

const state = {
  products: [],
  departments: [],
  generalProducts: [],
  selectedDepartmentId:
    window.localStorage.getItem('pricingDepartment') || null,
  planLookup: new Map(),
  paystack: {
    publicKey: paystackConfig.publicKey || '',
  },
  session: null,
  user: null,
  profile: null,
  profileLoaded: false,
  profileLoading: false,
  pendingPlanId: window.localStorage.getItem('pendingPlanId') || null,
  checkout: {
    activeReference: null,
    loadingPlanId: null,
  },
  authListenerBound: false,
};

let pendingAuthChoicePlanId = null;
let authChoiceBusy = false;

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function buildLoginRedirectUrl(planId, { auth, mode } = {}) {
  const url = new URL('login.html', window.location.href);
  url.searchParams.set('next', 'subscription-plans.html');
  if (planId) {
    url.searchParams.set('planId', planId);
  }
  if (auth) {
    url.searchParams.set('auth', auth);
  }
  if (mode) {
    url.searchParams.set('mode', mode);
  }
  return url.toString();
}

function setAuthChoiceBusy(isBusy) {
  authChoiceBusy = isBusy;
  if (authChoiceGoogleBtn) {
    authChoiceGoogleBtn.disabled = isBusy;
    authChoiceGoogleBtn.classList.toggle('opacity-60', isBusy);
    authChoiceGoogleBtn.classList.toggle('cursor-wait', isBusy);
  }
  if (authChoiceWhatsAppBtn) {
    authChoiceWhatsAppBtn.disabled = isBusy;
    authChoiceWhatsAppBtn.classList.toggle('opacity-60', isBusy);
    authChoiceWhatsAppBtn.classList.toggle('cursor-wait', isBusy);
  }
  if (authChoiceCloseBtn) {
    authChoiceCloseBtn.disabled = isBusy;
    authChoiceCloseBtn.classList.toggle('opacity-60', isBusy);
    authChoiceCloseBtn.classList.toggle('cursor-wait', isBusy);
  }
}

function showAuthLoadingOverlay() {
  if (!authLoadingOverlay) return;
  authLoadingOverlay.classList.remove('hidden');
  authLoadingOverlay.classList.add('flex');
  authLoadingOverlay.setAttribute('aria-hidden', 'false');
}

function hideAuthLoadingOverlay() {
  if (!authLoadingOverlay) return;
  authLoadingOverlay.classList.add('hidden');
  authLoadingOverlay.classList.remove('flex');
  authLoadingOverlay.setAttribute('aria-hidden', 'true');
}

function showCheckoutActivationOverlay() {
  if (!checkoutActivationOverlay) return;
  checkoutActivationOverlay.classList.remove('hidden');
  checkoutActivationOverlay.classList.add('flex');
  checkoutActivationOverlay.setAttribute('aria-hidden', 'false');
}

function hideCheckoutActivationOverlay() {
  if (!checkoutActivationOverlay) return;
  checkoutActivationOverlay.classList.add('hidden');
  checkoutActivationOverlay.classList.remove('flex');
  checkoutActivationOverlay.setAttribute('aria-hidden', 'true');
}

async function startGoogleOAuth(planId) {
  // Persist plan info so we can resume checkout after returning from Google.
  persistRegistrationPlan(planId);
  window.localStorage.setItem('pendingPlanId', planId);

  setAuthChoiceBusy(true);
  showAuthLoadingOverlay();

  try {
    const supabase = await getSupabaseClient();
    const redirectTo = new URL('subscription-plans.html', window.location.href);

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTo.toString(),
      },
    });

    if (error) throw error;

    // Some clients return a URL instead of redirecting automatically.
    if (data?.url) {
      window.location.assign(data.url);
    }
  } catch (error) {
    console.error('[Pricing] Google sign-in failed', error);
    hideAuthLoadingOverlay();
    // Fallback: route to login page (which can still start Google).
    window.location.href = buildLoginRedirectUrl(planId, { auth: 'google' });
  } finally {
    setAuthChoiceBusy(false);
  }
}

function openAuthChoiceModal(planId) {
  if (!authChoiceModal) {
    showBanner(
      'Tell us who is subscribing so we can tailor your practice sets.',
      'info'
    );
    redirectToRegistration(planId);
    return;
  }

  // Warm up Supabase JS so the Google redirect is faster.
  getSupabaseClient().catch(() => {});

  pendingAuthChoicePlanId = planId;
  authChoiceModal.classList.remove('hidden');
  authChoiceModal.classList.add('flex');
  authChoiceModal.setAttribute('aria-hidden', 'false');

  window.setTimeout(() => {
    (authChoiceGoogleBtn || authChoiceWhatsAppBtn)?.focus?.();
  }, 50);
}

function closeAuthChoiceModal() {
  if (!authChoiceModal) return;
  pendingAuthChoicePlanId = null;
  authChoiceModal.classList.add('hidden');
  authChoiceModal.classList.remove('flex');
  authChoiceModal.setAttribute('aria-hidden', 'true');
}

function bindAuthChoiceModalHandlers() {
  if (!authChoiceModal) return;

  authChoiceCloseBtn?.addEventListener('click', closeAuthChoiceModal);

  authChoiceWhatsAppBtn?.addEventListener('click', () => {
    if (authChoiceBusy) return;
    const planId = pendingAuthChoicePlanId;
    closeAuthChoiceModal();
    if (!planId) return;
    persistRegistrationPlan(planId);
    window.localStorage.setItem('pendingPlanId', planId);
    window.location.href = buildLoginRedirectUrl(planId, {
      auth: 'whatsapp',
      mode: 'signup',
    });
  });

  authChoiceGoogleBtn?.addEventListener('click', () => {
    if (authChoiceBusy) return;
    const planId = pendingAuthChoicePlanId;
    closeAuthChoiceModal();
    if (!planId) return;
    startGoogleOAuth(planId);
  });

  authChoiceModal.addEventListener('click', (event) => {
    if (event.target === authChoiceModal) {
      closeAuthChoiceModal();
    }
  });

  authChoicePanel?.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (authChoiceModal.classList.contains('hidden')) return;
    closeAuthChoiceModal();
  });
}

function themeForDepartment(color) {
  return THEME_MAP[color] || THEME_MAP.default;
}

function getCardPalette(color) {
  return CARD_PALETTES[color] || CARD_PALETTES.default;
}

function styleFromVars(vars) {
  return Object.entries(vars)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${key}:${value}`)
    .join(';');
}

function escapeHtml(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderLoadingState() {
  if (!grid) return;
  const placeholderCard = `
    <div class="rounded-[28px] bg-gradient-to-br from-slate-100 via-slate-200 to-slate-300 p-8 shadow-lg shadow-slate-400/30">
      <div class="h-5 w-24 rounded-full bg-white/70"></div>
      <div class="mt-6 h-10 w-36 rounded-full bg-white/60"></div>
      <div class="mt-4 space-y-3">
        <div class="h-4 w-full rounded-full bg-white/50"></div>
        <div class="h-4 w-11/12 rounded-full bg-white/50"></div>
        <div class="h-4 w-10/12 rounded-full bg-white/45"></div>
      </div>
      <div class="mt-8 h-12 w-full rounded-2xl bg-white/70"></div>
    </div>
  `;
  grid.innerHTML = `
    <div class="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-3 animate-pulse">
      ${placeholderCard.repeat(3)}
    </div>
  `;
}

function buildPlanSubtitle(plan, product) {
  const parts = [];
  if (plan.duration_days) {
    parts.push(`${plan.duration_days}-day access window`);
  }
  if (plan.daily_question_limit) {
    parts.push(`${plan.daily_question_limit} daily question target`);
  }
  if (plan.quiz_duration_minutes) {
    parts.push(`${plan.quiz_duration_minutes}-minute timer`);
  }
  if (!parts.length && product?.department_name) {
    parts.push(`${product.department_name} focused drills`);
  }
  return parts.join(' • ') || 'Department-curated study path';
}

function buildPlanFeatures(plan, product) {
  const features = [];
  const totalQuestions =
    plan.daily_question_limit && plan.duration_days
      ? plan.daily_question_limit * plan.duration_days
      : plan.questions;

  if (plan.daily_question_limit) {
    features.push(`${plan.daily_question_limit} adaptive questions per day`);
  }
  if (plan.duration_days) {
    features.push(`${plan.duration_days}-day guided schedule`);
  }
  if (totalQuestions) {
    features.push(`${totalQuestions} questions unlocked during this plan`);
  }
  if (plan.quizzes) {
    features.push(`${plan.quizzes} mock exam launches`);
  }
  if (plan.participants) {
    features.push(`Built for up to ${plan.participants} learners`);
  }
  if (plan.quiz_duration_minutes) {
    features.push(`${plan.quiz_duration_minutes}-minute timed practice window`);
  }
  features.push(
    product?.description || 'Department-curated content & analytics'
  );
  features.push('Progress tracking with personalised insights');

  return Array.from(new Set(features)).filter(Boolean).slice(0, 5);
}

function cleanseMarketingCopy(text) {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/\bMastery\b/gi, '')
    .replace(/\bPrep\b/gi, '')
    .replace(/\bPreparation\b/gi, '')
    .replace(/\bPreparing\b/gi, '')
    .replace(/\bAccelerate(?:d|r|s|ing)?\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .trim();
}

const CHECK_ICON = `
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
    <path d="M5 10.5l3 3 7-7" stroke-linecap="round" stroke-linejoin="round"></path>
  </svg>
`;

const CARD_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
    <path d="M12 3.5l2.47 5 5.53.8-4 3.9.95 5.6L12 16.9l-4.95 1.9.95-5.6-4-3.9 5.53-.8L12 3.5z" stroke-linejoin="round"></path>
  </svg>
`;

function renderPlanCard({ plan, product, palette, variant }) {
  const isContrast = variant === 'contrast';
  const style = isContrast
    ? styleFromVars({
        '--card-bg': palette.contrastGradient,
        '--card-shadow': palette.contrastShadow,
        '--card-shadow-hover': palette.contrastShadowHover,
        '--card-icon-bg': palette.iconContrastBg,
        '--card-icon-color': palette.iconContrastColor,
        '--card-feature-icon': palette.iconContrastColor,
        '--card-pill-bg': palette.pillContrastBg,
        '--card-pill-text': palette.pillContrastText,
        '--card-footer-bg': palette.footerContrastBg,
        '--card-footer-text': palette.footerContrastText,
        '--card-price-muted': palette.priceContrastMuted,
      })
    : styleFromVars({
        '--card-bg': palette.softGradient,
        '--card-shadow': palette.softShadow,
        '--card-shadow-hover': palette.softShadowHover,
        '--card-icon-bg': palette.iconSoftBg,
        '--card-icon-color': palette.iconSoftColor,
        '--card-feature-icon': palette.iconSoftColor,
        '--card-pill-bg': palette.pillSoftBg,
        '--card-pill-text': palette.pillSoftText,
        '--card-footer-bg': palette.footerSoftBg,
        '--card-footer-text': palette.footerSoftText,
        '--card-price-muted': palette.priceSoftMuted,
      });

  const featuresMarkup = buildPlanFeatures(plan, product)
    .map((feature) => cleanseMarketingCopy(feature))
    .filter(Boolean)
    .map(
      (feature) => `<li>${CHECK_ICON}<span>${escapeHtml(feature)}</span></li>`
    )
    .join('');

  const billingText = plan.duration_days
    ? `Billed for ${plan.duration_days} days`
    : 'Billed one time';

  const tierLabel = plan.plan_tier || plan.code || 'Plan';
  const planIdentifier = plan.id || plan.code || 'plan';
  const rawPlanName = plan.name || 'Plan';
  const displayPlanName = cleanseMarketingCopy(rawPlanName) || 'Plan';
  const planName = escapeHtml(displayPlanName || 'Plan');
  const tierText = escapeHtml(tierLabel);
  const subtitle = escapeHtml(
    cleanseMarketingCopy(buildPlanSubtitle(plan, product)) || ''
  );
  const priceText = escapeHtml(formatCurrency(plan.price, plan.currency));
  const billingTextSafe = escapeHtml(billingText);
  const productIdSafe = escapeHtml(planIdentifier);
  const isLoading = state.checkout.loadingPlanId === planIdentifier;
  const ctaLabel = isLoading ? 'Starting checkout…' : `Choose ${planName}`;

  return `
    <article class="plan-card ${isContrast ? 'plan-card--contrast' : 'plan-card--soft'}" data-plan-id="${productIdSafe}" style="${style}">
      <span class="plan-card__badge">${tierText}</span>
      <header class="plan-card__header">
        <span class="plan-card__icon">${CARD_ICON}</span>
        <div>
          <h3 class="plan-card__title">${planName}</h3>
          <p class="plan-card__subtitle">${subtitle}</p>
        </div>
      </header>
      <ul class="plan-card__features">
        ${featuresMarkup}
      </ul>
      <div class="plan-card__meta">
        <div class="plan-card__price">
          ${priceText}
          <span>${billingTextSafe}</span>
        </div>
        <a class="plan-card__pill" href="mailto:support@academicnightingale.com">
          Talk to sales
        </a>
      </div>
      <footer class="plan-card__actions">
        <button type="button" class="plan-card__cta ${isLoading ? 'opacity-60 cursor-wait' : ''}" data-action="choose-plan" data-plan-id="${productIdSafe}" ${isLoading ? 'disabled' : ''}>
          ${ctaLabel}
        </button>
      </footer>
    </article>
  `;
}

function formatCurrency(amount, currency = 'NGN') {
  if (amount === null || amount === undefined) {
    return 'Contact sales';
  }
  const value = Number(amount);
  if (!Number.isFinite(value)) return '—';
  try {
    const locale = currency === 'NGN' ? 'en-NG' : undefined;
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'symbol',
      maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value);
  } catch {
    // Fallback: symbol mapping for NGN
    if (currency === 'NGN') {
      return `₦${value.toLocaleString('en-NG')}`;
    }
    return `${currency} ${value.toLocaleString()}`;
  }
}

function groupProducts(rows) {
  const map = new Map();
  rows.forEach((row) => {
    if (!row) return;
    const productId = row.id || row.product_id;
    if (!productId) return;
    if (!map.has(productId)) {
      map.set(productId, {
        id: productId,
        code: row.product_code,
        name: row.product_name,
        description: row.description,
        product_type: row.product_type,
        is_active: row.is_active,
        department_id: row.department_id,
        department_name: row.department_name,
        department_slug: row.department_slug,
        color_theme: row.color_theme,
        plans: [],
      });
    }
    if (row.plan_id) {
      map.get(productId).plans.push({
        id: row.plan_id,
        code: row.plan_code,
        name: row.plan_name,
        price: row.price,
        currency: row.currency,
        questions: row.questions,
        quizzes: row.quizzes,
        participants: row.participants,
        is_active: row.plan_is_active,
        daily_question_limit: row.daily_question_limit,
        duration_days: row.duration_days,
        plan_tier: row.plan_tier,
        quiz_duration_minutes: row.quiz_duration_minutes,
      });
    }
  });
  return Array.from(map.values()).filter(
    (product) =>
      product.is_active && product.plans.some((plan) => plan.is_active)
  );
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function looksLikeUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function humaniseDepartmentSlug(slug) {
  if (!slug || typeof slug !== 'string') return null;
  const cleaned = slug.trim().replace(/[-_]+/g, ' ');
  if (!cleaned) return null;
  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function deriveDepartmentDisplayName(product) {
  const rawName = product.department_name;
  if (rawName && !looksLikeUuid(rawName)) return rawName;

  const slugName = humaniseDepartmentSlug(product.department_slug);
  if (slugName && !looksLikeUuid(slugName)) return slugName;

  const productName =
    typeof product.name === 'string' ? product.name.trim() : null;
  if (productName && !looksLikeUuid(productName)) {
    const cleaned = productName.replace(
      /\s+(subscription|plan|bundle|access)\s*$/i,
      ''
    );
    if (cleaned.trim()) return cleaned.trim();
    return productName;
  }

  return product.department_id;
}

async function hydrateDepartmentMetadata(supabase, products) {
  const departmentIds = Array.from(
    new Set(products.map((product) => product.department_id).filter(Boolean))
  );
  if (!departmentIds.length) return;

  const needsHydration = products.some(
    (product) =>
      product.department_id &&
      !product.department_name &&
      !product.department_slug
  );
  if (!needsHydration) return;

  try {
    const { data, error } = await supabase
      .from('departments')
      .select('id,name,slug,color_theme')
      .in('id', departmentIds);
    if (error || !Array.isArray(data) || !data.length) return;
    const lookup = new Map(data.map((row) => [row.id, row]));
    products.forEach((product) => {
      const dept = lookup.get(product.department_id);
      if (!dept) return;
      if (!product.department_name && dept.name)
        product.department_name = dept.name;
      if (!product.department_slug && dept.slug)
        product.department_slug = dept.slug;
      if (!product.color_theme && dept.color_theme)
        product.color_theme = dept.color_theme;
    });
  } catch (error) {
    console.warn('[Pricing] Unable to hydrate departments', error);
  }
}

function deriveDepartments(products) {
  const lookup = new Map();
  products.forEach((product) => {
    if (!product.department_id) return;
    if (!lookup.has(product.department_id)) {
      lookup.set(product.department_id, {
        id: product.department_id,
        name: deriveDepartmentDisplayName(product),
        slug: product.department_slug || product.department_id,
        color: product.color_theme || product.department_slug || 'default',
      });
    }
  });
  return Array.from(lookup.values());
}

function showBanner(message, type = 'info') {
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
  errorEl.classList.remove(
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
  if (type === 'success') {
    errorEl.classList.add(
      'border-emerald-200',
      'bg-emerald-50',
      'text-emerald-700'
    );
  } else if (type === 'info') {
    errorEl.classList.add('border-sky-200', 'bg-sky-50', 'text-sky-700');
  } else {
    errorEl.classList.add('border-red-200', 'bg-red-50', 'text-red-700');
  }
}

function showError(message) {
  showBanner(message, 'error');
}

function clearError() {
  if (!errorEl) return;
  errorEl.classList.add('hidden');
}

function renderTabs() {
  if (!tabsEl) return;
  if (!state.departments.length && !state.generalProducts.length) {
    tabsEl.innerHTML = '';
    tabsEl.classList.add('hidden');
    changeDepartmentBtn?.classList.add('hidden');
    return;
  }

  const buttons = [];
  state.departments.forEach((dept) => {
    const isActive = state.selectedDepartmentId === dept.id;
    const safeId = escapeHtml(dept.id);
    const safeName = escapeHtml(dept.name);
    buttons.push(`
      <button type="button" data-department="${safeId}"
        class="rounded-full border px-4 py-2 text-sm font-semibold transition ${isActive ? 'border-slate-900 bg-slate-900 text-white shadow' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'}">
        ${safeName}
      </button>
    `);
  });

  if (state.generalProducts.length) {
    const isActive = state.selectedDepartmentId === 'general';
    buttons.push(`
      <button type="button" data-department="general"
        class="rounded-full border px-4 py-2 text-sm font-semibold transition ${isActive ? 'border-slate-900 bg-slate-900 text-white shadow' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'}">
        Other Plans
      </button>
    `);
  }

  tabsEl.innerHTML = buttons.join('');
  tabsEl.classList.remove('hidden');
  tabsEl.querySelectorAll('button[data-department]').forEach((button) => {
    button.addEventListener('click', (event) => {
      const target = event.currentTarget.getAttribute('data-department');
      state.selectedDepartmentId = target;
      persistDepartmentPreference(target);
      renderTabs();
      renderProductsForSelection();
    });
  });

  if (changeDepartmentBtn) {
    changeDepartmentBtn.classList.remove('hidden');
  }
}

function renderProductsForSelection() {
  if (!grid) return;
  let productsToRender = [];
  let heading = '';

  if (state.selectedDepartmentId === 'general') {
    productsToRender = state.generalProducts;
    heading = 'Institutional and builder plans available to all learners.';
  } else {
    const activeDepartment =
      state.departments.find(
        (dept) => dept.id === state.selectedDepartmentId
      ) || state.departments[0];
    if (activeDepartment) {
      state.selectedDepartmentId = activeDepartment.id;
      productsToRender = state.products.filter(
        (product) => product.department_id === activeDepartment.id
      );
      heading = `${activeDepartment.name} subscribers receive curated questions for their exams.`;
    }
  }

  renderProducts(productsToRender, heading);
}

function renderProducts(products, heading) {
  if (!grid) return;
  state.planLookup.clear();
  if (!products.length) {
    grid.innerHTML =
      '<div class="rounded-2xl border border-slate-200 bg-white px-6 py-8 text-center text-sm text-slate-600">Plans are being finalised for this department. Please check back or contact support.</div>';
    return;
  }

  const sections = products
    .map((product) => {
      const palette = getCardPalette(
        product.color_theme || product.department_slug || 'default'
      );
      const safeProductId = escapeHtml(product.id || product.code || 'product');
      const productCode = escapeHtml(product.code || '');
      const productName = escapeHtml(product.name || 'Subscription');
      const productDescription = escapeHtml(
        product.description || 'Subscription tailored to your department.'
      );
      const plans = product.plans
        .filter((plan) => plan.is_active)
        .sort(
          (a, b) =>
            Number(a.daily_question_limit || a.price || 0) -
            Number(b.daily_question_limit || b.price || 0)
        );

      const planMarkup = plans
        .map((plan, index) => {
          const mapKey = plan?.id || plan?.code;
          if (mapKey) {
            state.planLookup.set(mapKey, { plan, product });
          }
          return renderPlanCard({
            plan,
            product,
            palette,
            variant: index % 2 === 0 ? 'soft' : 'contrast',
          });
        })
        .join('');

      return `
        <section class="space-y-4" data-product-id="${safeProductId}">
          <header class="space-y-2">
            <span class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">${productCode}</span>
            <h2 class="text-2xl font-semibold text-slate-900">${productName}</h2>
            <p class="text-sm text-slate-600">${productDescription}</p>
          </header>
          <div class="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-3">
            ${planMarkup}
          </div>
        </section>
      `;
    })
    .join('');

  const safeHeading = heading
    ? `<div class="rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm text-slate-600">${escapeHtml(heading)}</div>`
    : '';
  grid.innerHTML = `${safeHeading}${sections}`;

  attachPlanHandlers();
  maybeTriggerPendingCheckout();
}

async function ensureAuthSession() {
  try {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.auth.getSession();
    if (!error) {
      state.session = data.session;
      state.user = data.session?.user ?? null;
      if (state.user) {
        await ensureProfile();
      } else {
        state.profile = null;
        state.profileLoaded = false;
      }
    }
    if (!state.authListenerBound) {
      supabase.auth.onAuthStateChange((_event, session) => {
        state.session = session;
        state.user = session?.user ?? null;
        state.profile = null;
        state.profileLoaded = false;
        if (state.user) {
          ensureProfile().catch((profileError) => {
            console.warn(
              '[Pricing] Failed to refresh profile after auth change',
              profileError
            );
          });
        }
      });
      state.authListenerBound = true;
    }
  } catch (error) {
    console.error('[Pricing] Unable to resolve auth session', error);
  }
}

async function ensureProfile() {
  if (!state.user) {
    state.profile = null;
    state.profileLoaded = true;
    return null;
  }
  if (state.profileLoaded || state.profileLoading) {
    return state.profile;
  }
  state.profileLoading = true;
  try {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('profiles')
      .select(
        'id, full_name, first_name, last_name, phone, email, username, subscription_status'
      )
      .eq('id', state.user.id)
      .maybeSingle();
    if (error) {
      throw error;
    }

    if (!data) {
      const fallbackName = state.user.email?.split('@')[0] ?? 'Learner';
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

      const { data: inserted, error: insertError } = await supabase
        .from('profiles')
        .upsert(
          {
            id: state.user.id,
            role: 'learner',
            email: state.user.email ?? null,
            full_name: fullName || null,
            first_name: firstName,
            last_name: lastName,
            phone: metadata.phone || null,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        )
        .select(
          'id, full_name, first_name, last_name, phone, email, username, subscription_status'
        )
        .single();
      if (insertError) {
        throw insertError;
      }
      state.profile = inserted || null;
    } else {
      const patch = {
        last_seen_at: new Date().toISOString(),
        ...(state.user.email ? { email: state.user.email } : {}),
      };
      const { data: updated, error: updateError } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', state.user.id)
        .select(
          'id, full_name, first_name, last_name, phone, email, username, subscription_status'
        )
        .single();
      state.profile = !updateError && updated ? updated : data;
    }
  } catch (error) {
    console.error('[Pricing] Failed to load profile for checkout', error);
    state.profile = null;
  } finally {
    state.profileLoaded = true;
    state.profileLoading = false;
  }
  return state.profile;
}

function attachPlanHandlers() {
  if (!grid) return;
  grid
    .querySelectorAll('button[data-action="choose-plan"]')
    .forEach((button) => {
      const planId = button.getAttribute('data-plan-id');
      if (!planId) return;
      button.addEventListener('click', () => {
        handlePlanSelection(planId);
      });
    });
}

function maybeTriggerPendingCheckout() {
  if (!state.pendingPlanId || !state.user) {
    return;
  }
  if (!state.planLookup.has(state.pendingPlanId)) {
    return;
  }
  const planId = state.pendingPlanId;
  state.pendingPlanId = null;
  window.localStorage.removeItem('pendingPlanId');
  handlePlanSelection(planId);
}

function shouldUseRegistrationFlow() {
  if (!state.user) return true;
  const status = (state.profile?.subscription_status || '').toLowerCase();
  return status === 'pending_payment' || status === 'awaiting_setup';
}

function setCheckoutLoading(planId) {
  state.checkout.loadingPlanId = planId;
  renderProductsForSelection();
}

function resetCheckoutState() {
  state.checkout.loadingPlanId = null;
  state.checkout.activeReference = null;
  renderProductsForSelection();
}

function splitNameParts(fullName = '') {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { first: '', last: '' };
  }
  if (parts.length === 1) {
    return { first: parts[0], last: '' };
  }
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function buildContactPayload(planId) {
  const profile = state.profile || {};
  const metadata = state.user?.user_metadata || {};
  const email = state.user?.email || profile.email || metadata.email || '';
  const { first: fullFirst, last: fullLast } = splitNameParts(
    profile.full_name || metadata.full_name || ''
  );
  const firstName =
    profile.first_name || metadata.first_name || fullFirst || 'Learner';
  const lastName =
    profile.last_name || metadata.last_name || fullLast || 'Account';
  const phone = profile.phone || metadata.phone || '';
  const username =
    metadata.username ||
    profile.username ||
    (email ? email.split('@')[0] : `user-${Date.now()}`);

  return {
    planId,
    email,
    firstName,
    lastName,
    phone,
    username,
  };
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
      console.warn('[Pricing] Failed to parse edge error response', parseError);
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

async function verifyPaymentWithRetry(reference, options = {}) {
  const { maxAttempts = 12, intervalMs = 2500 } = options;
  const supabase = await getSupabaseClient();
  let lastMessage = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data, error } = await supabase.functions.invoke('paystack-verify', {
      body: { reference },
    });

    if (error) {
      const message = await extractEdgeFunctionError(
        error,
        'Payment verification failed. Please contact support with your reference.'
      );
      throw new Error(message);
    }

    if (data?.status === 'success') {
      return { success: true };
    }

    if (data?.error) {
      const msg = String(data.error);
      lastMessage = msg;
      const isStillProcessing =
        msg.toLowerCase().includes('not successful') ||
        msg.toLowerCase().includes('processing') ||
        msg.toLowerCase().includes('pending');
      if (isStillProcessing && attempt < maxAttempts - 1) {
        await sleep(intervalMs);
        continue;
      }
      throw new Error(msg);
    }

    // Unknown response shape; retry briefly.
    if (attempt < maxAttempts - 1) {
      await sleep(intervalMs);
      continue;
    }
  }

  throw new Error(
    lastMessage ||
      'Payment is still processing. Please refresh in a moment or contact support with your payment reference.'
  );
}

async function waitForActiveProfile(options = {}) {
  const { attempts = 12, intervalMs = 1500 } = options;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    state.profileLoaded = false;
    await ensureProfile();
    const status = (state.profile?.subscription_status || '').toLowerCase();
    if (status === 'active' || status === 'trialing') {
      return true;
    }
    if (attempt < attempts - 1) {
      await sleep(intervalMs);
    }
  }
  return false;
}

async function refreshProfileStatus() {
  if (!state.user) return;
  try {
    const supabase = await getSupabaseClient();
    await supabase.rpc('refresh_profile_subscription_status', {
      p_user_id: state.user.id,
    });
    // Also request a server-side reconciliation for this user to avoid client dependency
    try {
      await supabase.functions.invoke('reconcile-payments', {
        body: { userId: state.user.id },
      });
    } catch (reconcileError) {
      console.warn(
        '[Pricing] reconcile-payments invocation failed',
        reconcileError
      );
    }
  } catch (error) {
    console.warn(
      '[Pricing] Unable to refresh profile subscription status',
      error
    );
  }
  state.profileLoaded = false;
  await ensureProfile();
}

async function startExistingUserCheckout(planId) {
  const entry = state.planLookup.get(planId);
  if (!entry || !entry.plan) {
    showBanner(
      'We could not locate that plan. Please refresh and try again.',
      'error'
    );
    return;
  }

  const planRecord = entry.plan;
  const planKey = planRecord.id || planRecord.code || planId;

  try {
    const contact = buildContactPayload(planRecord.id || planId);
    if (!contact.email) {
      throw new Error(
        'We need an email address on file before we can start checkout. Please update your profile or contact support.'
      );
    }

    setCheckoutLoading(planKey);
    showBanner('Starting secure checkout…', 'info');

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.functions.invoke(
      'paystack-initiate',
      {
        body: {
          planId: planRecord.id || planId,
          userId: state.user.id,
          registration: {
            first_name: contact.firstName,
            last_name: contact.lastName,
            phone: contact.phone,
            username: contact.username,
          },
        },
      }
    );

    if (error) {
      const message = await extractEdgeFunctionError(
        error,
        'Unable to initialise checkout. Please try again.'
      );
      throw new Error(message);
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    if (!data || !data.reference) {
      throw new Error('Paystack did not return a checkout reference.');
    }

    state.checkout.activeReference = data.reference;
    launchExistingUserCheckout(data, contact);
  } catch (error) {
    console.error('[Pricing] Checkout initialisation failed', error);
    showBanner(
      error.message || 'Unable to start checkout. Please try again.',
      'error'
    );
    resetCheckoutState();
  }
}

function launchExistingUserCheckout(paystackData, contact) {
  if (!window.PaystackPop) {
    showBanner(
      'Payment library failed to load. Please refresh and try again.',
      'error'
    );
    resetCheckoutState();
    return;
  }

  try {
    const handler = window.PaystackPop.setup({
      key: paystackData.publicKey || state.paystack.publicKey,
      email: contact.email,
      amount: paystackData.amount,
      currency: paystackData.currency || 'NGN',
      ref: paystackData.reference,
      metadata: paystackData.metadata || {},
      callback: (response) => {
        (async () => {
          const reference = response.reference || paystackData.reference;
          try {
            showCheckoutActivationOverlay();
            showBanner('Confirming payment…', 'info');

            await verifyPaymentWithRetry(reference, {
              maxAttempts: 14,
              intervalMs: 2500,
            });
            await refreshProfileStatus();

            const active = await waitForActiveProfile({
              attempts: 14,
              intervalMs: 1500,
            });

            if (!active) {
              throw new Error(
                'Payment received, but activation is still processing. Please wait a moment and refresh, or contact support.'
              );
            }

            showBanner(
              'Payment confirmed! Redirecting to your dashboard…',
              'success'
            );
            resetCheckoutState();
            window.setTimeout(() => {
              window.location.href = 'admin-board.html';
            }, 700);
          } catch (error) {
            console.error('[Pricing] Post-payment verification failed', error);
            hideCheckoutActivationOverlay();
            showBanner(
              error.message ||
                'We received your payment but could not verify it automatically. Please contact support with your reference.',
              'error'
            );
            resetCheckoutState();
          }
        })();
      },
      onClose: () => {
        showBanner(
          'Checkout closed before completion. You can try again anytime.',
          'warning'
        );
        resetCheckoutState();
      },
    });

    handler.openIframe();
  } catch (error) {
    console.error('[Pricing] Failed to open Paystack checkout', error);
    showBanner(
      'We could not open the payment window. Please refresh and try again.',
      'error'
    );
    resetCheckoutState();
  }
}

function persistRegistrationPlan(planId) {
  const entry = state.planLookup.get(planId);
  if (!entry || !entry.plan) return;

  const plan = entry.plan;
  const product = entry.product;
  const payload = {
    planId: plan.id || planId,
    id: plan.id || planId,
    name: plan.name,
    price: plan.price,
    currency: plan.currency,
    metadata: plan.metadata || {},
    duration_days: plan.duration_days,
    quiz_duration_minutes: plan.quiz_duration_minutes,
    daily_question_limit: plan.daily_question_limit,
    plan_code: plan.code,
    product: product
      ? {
          id: product.id,
          code: product.code,
          name: product.name,
          department_id: product.department_id,
          department_name: product.department_name,
          department_slug: product.department_slug,
          color_theme: product.color_theme,
        }
      : null,
  };

  try {
    window.localStorage.setItem('registrationPlan', JSON.stringify(payload));
  } catch (error) {
    console.warn('[Pricing] Failed to persist registration plan', error);
  }
}

function redirectToRegistration(planId) {
  persistRegistrationPlan(planId);
  window.localStorage.setItem('pendingPlanId', planId);
  window.location.href = buildLoginRedirectUrl(planId, {
    auth: 'whatsapp',
    mode: 'signup',
  });
}

function redirectToResume(planId) {
  persistRegistrationPlan(planId);
  window.localStorage.setItem('pendingPlanId', planId);
  const currentPath = window.location.pathname;
  const newPath = currentPath.replace(
    'subscription-plans.html',
    'resume-registration.html'
  );
  window.location.href = `${newPath}?planId=${planId}`;
}

async function handlePlanSelection(planId) {
  const entry = state.planLookup.get(planId);
  if (!entry || !entry.plan) {
    showBanner(
      'We could not locate that plan. Please refresh and try again.',
      'error'
    );
    return;
  }

  if (state.user) {
    await ensureProfile();
    const status = (state.profile?.subscription_status || '').toLowerCase();
    if (status === 'pending_payment' || status === 'awaiting_setup') {
      redirectToResume(planId);
      return;
    }
    if (!shouldUseRegistrationFlow()) {
      await startExistingUserCheckout(planId);
      return;
    }
  }

  if (!state.user) {
    openAuthChoiceModal(planId);
    return;
  }

  showBanner(
    'Tell us who is subscribing so we can tailor your practice sets.',
    'info'
  );
  redirectToRegistration(planId);
}

function persistDepartmentPreference(value) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('pricingDepartment', value || '');
}

function openDepartmentGate() {
  if (!gateEl) return;
  if (grid) {
    grid.innerHTML = '';
  }
  changeDepartmentBtn?.classList.add('hidden');
  gateLoadingEl?.classList.remove('hidden');
  gateOptionsEl?.classList.add('hidden');
  gateEl.classList.remove('hidden');
  gateEl.classList.add('flex');
}

function closeDepartmentGate() {
  if (!gateEl) return;
  gateEl.classList.add('hidden');
  gateEl.classList.remove('flex');
}

function buildDepartmentGate() {
  if (!gateOptionsEl) return;
  if (!state.departments.length && !state.generalProducts.length) {
    gateLoadingEl?.classList.add('hidden');
    gateEl?.classList.add('hidden');
    return;
  }

  gateLoadingEl?.classList.add('hidden');
  gateOptionsEl.classList.remove('hidden');

  gateOptionsEl.innerHTML = state.departments
    .map((dept) => {
      const theme = themeForDepartment(dept.color);
      const isPreferred = state.selectedDepartmentId === dept.id;
      const safeDeptId = escapeHtml(dept.id);
      const safeDeptName = escapeHtml(dept.name);
      return `
        <button type="button" data-department="${safeDeptId}" class="rounded-2xl border ${theme.border} bg-white px-4 py-4 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-lg ${isPreferred ? 'ring-2 ring-cyan-600' : ''}">
          <h3 class="text-lg font-semibold text-slate-900">${safeDeptName}</h3>
          <p class="mt-1 text-sm text-slate-600">Personalised daily drills for ${safeDeptName} learners.</p>
          ${isPreferred ? '<p class="mt-3 inline-flex items-center rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700">Previously chosen</p>' : ''}
        </button>
      `;
    })
    .join('');

  gateOptionsEl
    .querySelectorAll('button[data-department]')
    .forEach((button) => {
      button.addEventListener('click', (event) => {
        const target = event.currentTarget.getAttribute('data-department');
        state.selectedDepartmentId = target;
        persistDepartmentPreference(target);
        closeDepartmentGate();
        renderTabs();
        renderProductsForSelection();
      });
    });

  if (gateGeneralBtn) {
    const isPreferred = state.selectedDepartmentId === 'general';
    gateGeneralBtn.classList.toggle('hidden', !state.generalProducts.length);
    if (isPreferred) {
      gateGeneralBtn.classList.add('ring-2', 'ring-cyan-600');
    } else {
      gateGeneralBtn.classList.remove('ring-2', 'ring-cyan-600');
    }
    gateGeneralBtn.addEventListener('click', () => {
      state.selectedDepartmentId = 'general';
      persistDepartmentPreference('general');
      closeDepartmentGate();
      renderTabs();
      renderProductsForSelection();
    });
  }
}

async function loadPricing() {
  openDepartmentGate();
  renderLoadingState();
  gateLoadingEl?.classList.remove('hidden');
  gateOptionsEl?.classList.add('hidden');
  try {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('subscription_products_with_plans')
      .select('*')
      .order('department_name', { ascending: true })
      .order('price', { ascending: true });
    if (error) throw error;
    clearError();
    const products = groupProducts(data || []);
    await hydrateDepartmentMetadata(supabase, products);
    state.products = products.filter((product) => product.department_id);
    state.generalProducts = products.filter(
      (product) => !product.department_id
    );
    state.departments = deriveDepartments(products).sort((a, b) =>
      String(a.name ?? '').localeCompare(String(b.name ?? ''))
    );

    if (
      !state.selectedDepartmentId ||
      (state.selectedDepartmentId !== 'general' &&
        !state.departments.some(
          (dept) => dept.id === state.selectedDepartmentId
        ))
    ) {
      state.selectedDepartmentId = null;
    }

    buildDepartmentGate();
  } catch (error) {
    console.error('[Pricing] Unable to load plans', error);
    showError(
      'We could not retrieve pricing at the moment. Please refresh or contact support.'
    );
    if (grid) {
      grid.innerHTML =
        '<div class="rounded-2xl border border-red-200 bg-red-50 px-6 py-8 text-center text-sm text-red-700">Unable to load pricing data right now.</div>';
    }
  }
}

async function initialisePricing() {
  bindAuthChoiceModalHandlers();
  await ensureAuthSession();
  await loadPricing();
}

initialisePricing();

const yearEl = document.getElementById('pricing-year');
if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}

changeDepartmentBtn?.addEventListener('click', () => {
  buildDepartmentGate();
  openDepartmentGate();
});

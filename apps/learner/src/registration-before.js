import { getSupabaseClient } from '../../shared/supabaseClient.js';
import { clearSessionFingerprint } from '../../shared/sessionFingerprint.js';

const STORAGE_PLAN = 'registrationPlan';
const STORAGE_CONTACT = 'registrationContact';
const STORAGE_REFERENCE = 'registrationPaymentReference';

const registrationContainer = document.getElementById('registration-container');
const successContainer = document.getElementById('success-message');
const formEl = document.getElementById('registrationForm');
const feedbackEl = document.getElementById('form-feedback');
const submitBtn = formEl?.querySelector('[data-role="submit"]');
const submitText = formEl?.querySelector('[data-role="submit-text"]');

const sections = {
  names: document.querySelector('[data-section="names"]'),
  contact: document.querySelector('[data-section="contact"]'),
  account: document.querySelector('[data-section="account"]'),
};

const firstNameInput = document.getElementById('first-name');
const lastNameInput = document.getElementById('last-name');
const emailInput = document.getElementById('email-address');
const phoneInput = document.getElementById('phone-number');
const usernameInput = document.getElementById('generated-username');
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirm-password');

const emailAvailabilityEl = document.getElementById(
  'email-availability-feedback'
);
const phoneAvailabilityEl = document.getElementById(
  'phone-availability-feedback'
);
const usernameFeedbackEl = document.getElementById('username-feedback');
const passwordFeedbackEl = document.getElementById('password-feedback');

const copyUsernameBtn = document.querySelector('[data-role="copy-username"]');
const successTitleEl = successContainer?.querySelector(
  '[data-role="success-title"]'
);
const successBodyEl = successContainer?.querySelector(
  '[data-role="success-body"]'
);
const successReferenceEl = successContainer?.querySelector(
  '[data-role="success-reference"]'
);
const successCredentialsCard = successContainer?.querySelector(
  '[data-role="success-credentials"]'
);
const successUsernameEl = successContainer?.querySelector(
  '[data-role="success-username"]'
);
const successCopyBtn = successContainer?.querySelector(
  '[data-role="success-copy-username"]'
);
const successGoDashboardBtn = successContainer?.querySelector(
  '[data-role="success-go-dashboard"]'
);
const successRetryBtn = successContainer?.querySelector(
  '[data-role="success-retry"]'
);

const planIdInput = document.getElementById('plan-id');
const planNameEl = document.querySelector('[data-role="plan-name"]');
const planPriceEl = document.querySelector('[data-role="plan-price"]');
const planDurationEl = document.querySelector('[data-role="plan-duration"]');
const planDescriptionEl = document.querySelector(
  '[data-role="plan-description"]'
);
const planTimerEl = document.querySelector('[data-role="plan-timer"]');
const existingAccountLink = document.querySelector(
  '[data-role="existing-account-link"]'
);
const fastAuthLink = document.querySelector('[data-role="auth-fast-link"]');

let supabasePromise = null;
let activeReference = null;
let lastReference = null;
let lastEmailAvailability = { value: '', result: null };
let lastPhoneAvailability = { value: '', result: null };
let generatedUsername = '';
let pendingProfileHint = null;
let storedPassword = '';
let pendingUserId = null;
let usernameGenerationPromise = null;
let lastContactDetails = null;
let isVerifyingPayment = false;
let lastVerificationError = null;
let hasFocusedContact = false;
let hasFocusedAccount = false;
let activePlanSnapshot = null;

const FIELD_STATUS_CLASSES = [
  'text-red-600',
  'text-amber-600',
  'text-slate-600',
];
const FALLBACK_USERNAME_WORDS = [
  'prep',
  'learn',
  'study',
  'ace',
  'quiz',
  'focus',
  'track',
  'mentor',
];

function configureExistingAccountLinks(initialPlanId) {
  try {
    const baseUrl = new URL('login.html', window.location.href);
    baseUrl.searchParams.set('next', 'subscription-plans.html');
    if (initialPlanId) {
      baseUrl.searchParams.set('planId', initialPlanId);
    }
    const href = baseUrl.toString();
    if (existingAccountLink) {
      existingAccountLink.href = href;
    }
    if (fastAuthLink) {
      fastAuthLink.href = href;
    }
  } catch (error) {
    console.warn('[Registration] Failed to configure sign-in links', error);
  }
}

async function copyToClipboard(value) {
  if (!value) return false;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (error) {
      console.warn('[Registration] Clipboard API failed, falling back', error);
    }
  }

  try {
    const scratch = document.createElement('textarea');
    scratch.value = value;
    scratch.setAttribute('readonly', '');
    scratch.style.position = 'absolute';
    scratch.style.left = '-9999px';
    document.body.appendChild(scratch);
    scratch.select();
    document.execCommand('copy');
    document.body.removeChild(scratch);
    return true;
  } catch (fallbackError) {
    console.warn('[Registration] Clipboard fallback failed', fallbackError);
    return false;
  }
}

const state = {
  namesComplete: false,
  emailValid: false,
  phoneValid: false,
  usernameReady: false,
  session: null,
};

function renderFieldStatus(target, message, type = 'info') {
  if (!target) return;
  target.textContent = message;
  target.classList.remove('hidden', ...FIELD_STATUS_CLASSES);

  if (type === 'error') {
    target.classList.add('text-red-600');
    if (target.id === 'username-feedback') {
      target.classList.remove('text-sm', 'font-semibold');
      target.classList.add('text-xs');
    }
  } else if (type === 'success') {
    target.classList.add('text-amber-600');
    if (target.id === 'username-feedback') {
      target.classList.remove('text-xs');
      target.classList.add('text-sm', 'font-semibold');
    }
  } else {
    target.classList.add('text-slate-600');
    if (target.id === 'username-feedback') {
      target.classList.remove('text-sm', 'font-semibold');
      target.classList.add('text-xs');
    }
  }
}

function clearFieldStatus(target) {
  if (!target) return;
  target.textContent = '';
  target.classList.add('hidden');
  target.classList.remove(...FIELD_STATUS_CLASSES);
  if (target.id === 'username-feedback') {
    target.classList.remove('text-sm', 'font-semibold');
    target.classList.add('text-xs');
  }
}

function showFeedback(message, type = 'error') {
  if (!feedbackEl) return;

  feedbackEl.textContent = message;
  feedbackEl.classList.remove('hidden');
  feedbackEl.classList.remove(
    'bg-green-50',
    'border-green-200',
    'text-green-700',
    'bg-red-50',
    'border-red-200',
    'text-red-700',
    'bg-blue-50',
    'border-blue-200',
    'text-blue-700'
  );

  if (type === 'success') {
    feedbackEl.classList.add(
      'bg-green-50',
      'border-green-200',
      'text-green-700'
    );
  } else if (type === 'info') {
    feedbackEl.classList.add('bg-blue-50', 'border-blue-200', 'text-blue-700');
  } else {
    feedbackEl.classList.add('bg-red-50', 'border-red-200', 'text-red-700');
  }

  if (feedbackEl?.dataset) {
    feedbackEl.dataset.state = type;
  }

  feedbackEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function clearFeedback() {
  if (!feedbackEl) return;
  feedbackEl.classList.add('hidden');
  feedbackEl.textContent = '';
  if (feedbackEl?.dataset) {
    delete feedbackEl.dataset.state;
  }
}

function setLoading(isLoading) {
  if (!submitBtn || !submitText) return;
  submitBtn.disabled = isLoading;
  submitBtn.classList.toggle('opacity-60', isLoading);
  submitBtn.classList.toggle('is-loading', isLoading);
  submitText.textContent = isLoading
    ? 'Preparing secure checkout…'
    : 'Complete secure payment';
}

function triggerFieldPulse(input) {
  if (!input) return;
  input.classList.add('pulse-highlight');
  setTimeout(() => input.classList.remove('pulse-highlight'), 1800);
}

function notifyUsernameGeneration() {
  if (!feedbackEl) return;
  const currentState = feedbackEl.dataset?.state || '';
  if (feedbackEl.classList.contains('hidden') || currentState === 'info') {
    showFeedback('Generating a short username just for you…', 'info');
  }
}

function ensureSupabaseClient() {
  if (!supabasePromise) {
    supabasePromise = getSupabaseClient();
  }
  return supabasePromise;
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
        '[Registration] Failed to parse edge error response',
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

function formatCurrency(value, currency = 'NGN') {
  const formatter = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  });
  return formatter.format(Number(value || 0));
}

function clearStoredReference() {
  lastReference = null;
  try {
    window.localStorage.removeItem(STORAGE_REFERENCE);
  } catch (error) {
    console.warn('[Registration] Failed to clear payment reference', error);
  }
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isActiveSubscription(status) {
  if (!status) return false;
  const normalized = String(status).toLowerCase();
  return normalized === 'active' || normalized === 'trialing';
}

function hydratePlanSummary(plan) {
  activePlanSnapshot = plan
    ? {
        id: plan.id || plan.planId || null,
        code: plan.plan_code || plan.code || null,
        name: plan.name || null,
        price: plan.price ?? null,
        currency: plan.currency || 'NGN',
        duration_days:
          plan.duration_days ?? plan.metadata?.duration_days ?? null,
        daily_question_limit: plan.daily_question_limit ?? null,
        quiz_duration_minutes: plan.quiz_duration_minutes ?? null,
        metadata: plan.metadata || {},
        product: plan.product || null,
      }
    : null;

  if (planIdInput) planIdInput.value = plan?.id || '';
  if (planNameEl) planNameEl.textContent = plan?.name || 'Unknown plan';
  if (planPriceEl)
    planPriceEl.textContent = plan?.price
      ? formatCurrency(plan.price, plan.currency)
      : '—';
  if (planDurationEl) {
    if (plan?.metadata?.duration_label) {
      planDurationEl.textContent = plan.metadata.duration_label;
    } else if (plan?.metadata?.duration_days) {
      planDurationEl.textContent = `${plan.metadata.duration_days}-day access`;
    } else if (plan?.duration_days) {
      planDurationEl.textContent = `${plan.duration_days}-day access`;
    } else {
      planDurationEl.textContent = 'Flexible schedule';
    }
  }
  if (planDescriptionEl) {
    const summary = plan?.metadata?.highlights;
    if (Array.isArray(summary) && summary.length > 0) {
      planDescriptionEl.textContent = summary.slice(0, 2).join(' • ');
    } else if (typeof plan?.metadata?.description === 'string') {
      planDescriptionEl.textContent = plan.metadata.description;
    } else {
      planDescriptionEl.textContent =
        'Your personalised question targets unlock after checkout.';
    }
  }
  if (planTimerEl) {
    if (plan?.quiz_duration_minutes) {
      planTimerEl.textContent = `${plan.quiz_duration_minutes} minute session limit`;
    } else {
      planTimerEl.textContent = 'No timer (self-paced)';
    }
  }
}

function readStoredPlan(planId) {
  const raw = window.localStorage.getItem(STORAGE_PLAN);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!planId || parsed.planId === planId) {
      return parsed;
    }
  } catch (error) {
    console.warn('[Registration] Failed to parse stored plan', error);
  }
  return null;
}

async function fetchPlanFromSupabase(planId) {
  try {
    const supabase = await ensureSupabaseClient();
    const { data, error } = await supabase
      .from('subscription_plans')
      .select(
        `
          id,
          code,
          name,
          price,
          currency,
          metadata,
          duration_days,
          quiz_duration_minutes,
          daily_question_limit,
          subscription_products:subscription_products!subscription_plans_product_id_fkey (
            id,
            code,
            name,
            department_id,
            department:departments(id, name, slug),
            color_theme
          )
        `
      )
      .eq('id', planId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const product = data.subscription_products
      ? {
          id: data.subscription_products.id,
          code: data.subscription_products.code,
          name: data.subscription_products.name,
          department_id: data.subscription_products.department_id,
          department_name: data.subscription_products.department?.name || null,
          department_slug: data.subscription_products.department?.slug || null,
          color_theme: data.subscription_products.color_theme || null,
        }
      : null;
    return {
      id: data.id,
      planId: data.id,
      plan_code: data.code,
      name: data.name,
      price: data.price,
      currency: data.currency,
      metadata: data.metadata || {},
      duration_days: data.duration_days,
      quiz_duration_minutes: data.quiz_duration_minutes,
      daily_question_limit: data.daily_question_limit,
      product,
    };
  } catch (error) {
    console.error('[Registration] Failed to fetch plan', error);
    throw new Error(
      'We could not load the selected plan. Please return to the pricing page and try again.'
    );
  }
}

function sanitizeForUsername(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function buildUsernameCandidates(firstName, lastName, email) {
  const primary = sanitizeForUsername(firstName);
  const secondary = sanitizeForUsername(lastName);
  const emailPrefix = sanitizeForUsername(
    (email.split('@')[0] || '').toLowerCase()
  );

  const candidates = new Set();

  const pushCandidate = (raw) => {
    if (!raw) return;
    const sanitized = sanitizeForUsername(raw).slice(0, 12);
    if (sanitized.length >= 3) {
      candidates.add(sanitized);
    }
  };

  pushCandidate(primary + secondary.slice(0, 2));
  pushCandidate(primary + secondary.charAt(0));
  pushCandidate(primary.slice(0, 3) + secondary);
  pushCandidate(primary + emailPrefix.slice(-2));
  pushCandidate(primary.slice(0, 5) + emailPrefix.slice(0, 3));
  pushCandidate(emailPrefix + secondary.slice(0, 2));
  pushCandidate(primary.charAt(0) + secondary);
  pushCandidate(secondary.charAt(0) + primary);
  pushCandidate(emailPrefix);

  FALLBACK_USERNAME_WORDS.forEach((word) => {
    pushCandidate(`${primary}${word}`);
    pushCandidate(`${word}${primary.slice(0, 3)}`);
  });

  if (!candidates.size) {
    pushCandidate(primary);
    pushCandidate(emailPrefix);
  }

  pushCandidate('nightingale');
  pushCandidate('study');
  pushCandidate('prep');

  return Array.from(candidates);
}

async function checkUsernameAvailability(username, allowedProfileId = null) {
  const supabase = await ensureSupabaseClient();
  const normalized = username.toLowerCase();

  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', normalized)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    console.error('[Registration] Username lookup failed', error);
    return {
      available: false,
      error:
        'Unable to verify username availability. Check your connection and try again.',
    };
  }

  if (!data) {
    return { available: true };
  }

  if (allowedProfileId && data.id === allowedProfileId) {
    return { available: true, reused: true };
  }

  return { available: false };
}

async function ensureUniqueUsername(firstName, lastName, email) {
  const allowProfileId = pendingProfileHint?.profileId || null;
  const attempted = new Set();

  if (pendingProfileHint?.username) {
    const normalized = sanitizeForUsername(pendingProfileHint.username);
    if (normalized.length >= 3) {
      const reuseCheck = await checkUsernameAvailability(
        normalized,
        allowProfileId
      );
      if (reuseCheck.available) {
        return normalized;
      }
    }
  }

  const candidateBases = buildUsernameCandidates(firstName, lastName, email);

  for (const base of candidateBases) {
    if (attempted.has(base)) continue;
    attempted.add(base);

    const directCheck = await checkUsernameAvailability(base, allowProfileId);
    if (directCheck.available) {
      return base;
    }

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const suffix = String(Math.floor(100 + Math.random() * 9000));
      const trimmedBase = base.slice(0, Math.max(3, 12 - suffix.length));
      const candidate = `${trimmedBase}${suffix}`;
      if (attempted.has(candidate)) {
        continue;
      }
      attempted.add(candidate);

      const availability = await checkUsernameAvailability(
        candidate,
        allowProfileId
      );
      if (availability.available) {
        return candidate;
      }
    }
  }

  throw new Error('We could not generate a unique username. Please try again.');
}

function setUsernameField(value, { status = 'info', message = '' } = {}) {
  generatedUsername = value || '';
  if (usernameInput) {
    usernameInput.value = generatedUsername;
    // Add distinctive styling for auto-generated usernames
    if (generatedUsername) {
      usernameInput.classList.add(
        'bg-amber-50',
        'border-amber-400',
        'text-amber-900',
        'font-semibold',
        'text-xl',
        'ring-2',
        'ring-amber-200',
        'shadow-md'
      );
      usernameInput.classList.remove(
        'bg-white',
        'border-slate-300',
        'text-slate-900',
        'font-medium',
        'text-base',
        'ring-0',
        'shadow-none'
      );
    } else {
      usernameInput.classList.remove(
        'bg-amber-50',
        'border-amber-400',
        'text-amber-900',
        'font-semibold',
        'text-xl',
        'ring-2',
        'ring-amber-200',
        'shadow-md'
      );
      usernameInput.classList.add(
        'bg-white',
        'border-slate-300',
        'text-slate-900',
        'font-medium',
        'text-base',
        'ring-0',
        'shadow-none'
      );
    }
  }

  if (generatedUsername) {
    state.usernameReady = true;
    if (message) {
      renderFieldStatus(
        usernameFeedbackEl,
        message,
        status === 'success' ? 'success' : 'info'
      );
    } else {
      clearFieldStatus(usernameFeedbackEl);
    }
  } else {
    state.usernameReady = false;
    clearFieldStatus(usernameFeedbackEl);
  }
}

function resetUsernameState() {
  usernameGenerationPromise = null;
  setUsernameField('');
  hasFocusedAccount = false;
  updateSectionVisibility();
}

function evaluateNamesComplete() {
  const firstName = firstNameInput?.value.trim();
  const lastName = lastNameInput?.value.trim();
  state.namesComplete = Boolean(firstName && lastName);

  updateSectionVisibility();
  maybeGenerateUsername();
}

function updateSectionVisibility() {
  if (!state.namesComplete) {
    hasFocusedContact = false;
  }

  // Show contact section when names are complete
  if (sections.contact) {
    const wasHidden = sections.contact.classList.contains('hidden');
    sections.contact.classList.toggle('hidden', !state.namesComplete);

    // Add heartbeat animation when contact section becomes visible
    if (wasHidden && !sections.contact.classList.contains('hidden')) {
      // Trigger heartbeat on the first input field in contact section
      const firstContactInput = sections.contact.querySelector('input');
      if (firstContactInput) {
        setTimeout(() => {
          triggerFieldPulse(firstContactInput);
        }, 300);
      }
    }
  }

  const accountPrereqsMet =
    state.namesComplete && state.emailValid && state.phoneValid;
  const accountShouldShow =
    accountPrereqsMet && (generatedUsername || usernameGenerationPromise);

  if (!accountPrereqsMet) {
    hasFocusedAccount = false;
  }

  if (sections.account) {
    const wasHidden = sections.account.classList.contains('hidden');
    sections.account.classList.toggle('hidden', !accountShouldShow);

    // Add heartbeat animation when account section becomes visible
    if (wasHidden && !sections.account.classList.contains('hidden')) {
      const firstAccountInput = sections.account.querySelector('input');
      if (firstAccountInput && firstAccountInput.id !== 'generated-username') {
        setTimeout(() => {
          triggerFieldPulse(firstAccountInput);
        }, 300);
      }
    }
  }

  if (state.namesComplete) {
    setTimeout(maybeFocusContact, 200);
  }

  if (accountShouldShow) {
    setTimeout(maybeFocusAccount, 200);
  }
}

function maybeFocusContact() {
  if (!state.namesComplete || hasFocusedContact) return;
  if (
    document.activeElement === firstNameInput ||
    document.activeElement === lastNameInput
  ) {
    return;
  }
  const firstContactInput = sections.contact?.querySelector('input');
  if (!firstContactInput) return;
  hasFocusedContact = true;
  setTimeout(() => {
    if (
      document.activeElement === firstNameInput ||
      document.activeElement === lastNameInput
    )
      return;
    firstContactInput.focus();
  }, 120);
}

function maybeFocusAccount() {
  const accountVisible =
    sections.account && !sections.account.classList.contains('hidden');
  if (!accountVisible) return;
  if (!state.namesComplete || !state.emailValid || !state.phoneValid) return;
  if (hasFocusedAccount) return;

  const activeElement = document.activeElement;
  if (sections.contact?.contains(activeElement)) {
    return;
  }

  const firstAccountInput = sections.account?.querySelector(
    'input:not([readonly])'
  );
  if (!firstAccountInput || firstAccountInput.disabled) return;

  hasFocusedAccount = true;
  setTimeout(() => {
    const currentActive = document.activeElement;
    if (sections.contact?.contains(currentActive)) return;
    firstAccountInput.focus();
  }, 150);
}

async function checkEmailAvailability(email) {
  try {
    const supabase = await ensureSupabaseClient();

    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, subscription_status')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('[Registration] Error checking email:', error);
      return {
        available: false,
        error: 'Unable to verify email. Please try again.',
      };
    }

    if (!data) {
      return { available: true };
    }

    if (['active', 'trialing'].includes(data.subscription_status || '')) {
      return {
        available: false,
        status: 'active',
        error:
          'This email already has an active subscription. Please <a href="login.html" class="font-semibold underline">login here</a> or use a different email address.',
      };
    }

    return {
      available: true,
      status: 'pending',
      message:
        'Welcome back! We found your previous registration – continue below to finalise it.',
      profileId: data.id,
      username: data.username,
    };
  } catch (error) {
    console.error('[Registration] Email check failed:', error);
    return {
      available: false,
      error:
        'Unable to verify email. Please check your connection and try again.',
    };
  }
}

function getEmailHeuristicError(email) {
  const atIndex = email.indexOf('@');
  if (atIndex === -1) return 'Enter a valid email address before continuing.';

  const domainRaw = email
    .slice(atIndex + 1)
    .trim()
    .toLowerCase();
  if (!domainRaw) return 'Enter a valid email address before continuing.';

  const suspiciousCommonTypos = new Set([
    'gmai.com',
    'gmial.com',
    'gnail.com',
    'gmaill.com',
  ]);

  if (suspiciousCommonTypos.has(domainRaw)) {
    return 'This email domain looks mistyped. Please double-check it (e.g. "gmail.com").';
  }

  if (domainRaw.startsWith('gmail.') && domainRaw !== 'gmail.com') {
    return 'Gmail addresses should end with "@gmail.com". Please correct this before continuing.';
  }

  const parts = domainRaw.split('.');
  if (parts.length < 2) {
    return 'Enter a valid email address before continuing.';
  }
  const tld = parts[parts.length - 1];
  if (!/^[a-z]{2,}$/i.test(tld)) {
    return 'Enter a valid email address before continuing.';
  }

  return null;
}

async function validateEmailField({ forceCheck = false } = {}) {
  if (!emailInput) {
    return { valid: true, result: null };
  }

  const rawEmail = emailInput.value.trim();

  if (!rawEmail) {
    clearFieldStatus(emailAvailabilityEl);
    lastEmailAvailability = { value: '', result: null };
    state.emailValid = false;
    updateSectionVisibility();
    pendingProfileHint = null;
    return { valid: false, reason: 'empty' };
  }

  const strictEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!strictEmailPattern.test(rawEmail) || !emailInput.checkValidity()) {
    renderFieldStatus(
      emailAvailabilityEl,
      'Enter a valid email address before continuing.',
      'error'
    );
    state.emailValid = false;
    updateSectionVisibility();
    return { valid: false, reason: 'invalid_format' };
  }

  const heuristicError = getEmailHeuristicError(rawEmail);
  if (heuristicError) {
    renderFieldStatus(emailAvailabilityEl, heuristicError, 'error');
    state.emailValid = false;
    updateSectionVisibility();
    return { valid: false, reason: 'suspicious_domain' };
  }

  const email = rawEmail.toLowerCase();

  if (!forceCheck && lastEmailAvailability.value === email) {
    const cached = lastEmailAvailability.result;
    if (!cached) {
      state.emailValid = true;
      updateSectionVisibility();
      maybeGenerateUsername();
      return { valid: true, result: null };
    }

    if (!cached.available) {
      renderFieldStatus(
        emailAvailabilityEl,
        cached.error ||
          'This email already has an active subscription. Please sign in instead.',
        'error'
      );
      state.emailValid = false;
      updateSectionVisibility();
      return { valid: false, result: cached };
    }

    pendingProfileHint =
      cached.status === 'pending'
        ? {
            profileId: cached.profileId,
            username: cached.username,
          }
        : null;

    if (cached.status === 'pending' && cached.message) {
      renderFieldStatus(emailAvailabilityEl, cached.message, 'info');
    } else {
      renderFieldStatus(emailAvailabilityEl, 'Email looks good!', 'success');
    }

    state.emailValid = true;
    updateSectionVisibility();
    maybeGenerateUsername();
    return { valid: true, result: cached };
  }

  renderFieldStatus(emailAvailabilityEl, 'Checking availability…', 'info');

  const result = await checkEmailAvailability(email);
  lastEmailAvailability = { value: email, result };

  if (!result.available) {
    renderFieldStatus(
      emailAvailabilityEl,
      result.error ||
        'This email already has an active subscription. Please sign in instead.',
      'error'
    );
    state.emailValid = false;
    updateSectionVisibility();
    pendingProfileHint = null;
    return { valid: false, result };
  }

  pendingProfileHint =
    result.status === 'pending'
      ? { profileId: result.profileId, username: result.username }
      : null;

  if (result.status === 'pending' && result.message) {
    renderFieldStatus(emailAvailabilityEl, result.message, 'info');
  } else {
    renderFieldStatus(emailAvailabilityEl, 'Email looks good!', 'success');
  }

  state.emailValid = true;
  updateSectionVisibility();
  maybeGenerateUsername();
  return { valid: true, result };
}

async function checkPhoneAvailability(phone) {
  try {
    const supabase = await ensureSupabaseClient();

    const { data, error } = await supabase
      .from('profiles')
      .select('id, subscription_status')
      .eq('phone', phone)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('[Registration] Error checking phone:', error);
      return {
        available: false,
        error: 'Unable to verify phone number. Please try again.',
      };
    }

    if (!data) {
      return { available: true };
    }

    if (['active', 'trialing'].includes(data.subscription_status || '')) {
      return {
        available: false,
        error:
          'This phone number is already registered with an active subscription. Please use a different number.',
      };
    }

    return { available: true };
  } catch (error) {
    console.error('[Registration] Phone check failed:', error);
    return {
      available: false,
      error: 'Unable to verify phone number. Please try again.',
    };
  }
}

function normalizePhoneValue() {
  return phoneInput.value.replace(/\s+/g, ' ').trim();
}

async function validatePhoneField({ forceCheck = false } = {}) {
  if (!phoneInput) {
    return { valid: true, result: null };
  }

  const rawPhone = normalizePhoneValue();

  if (!rawPhone) {
    clearFieldStatus(phoneAvailabilityEl);
    lastPhoneAvailability = { value: '', result: null };
    state.phoneValid = false;
    updateSectionVisibility();
    return { valid: false, reason: 'empty' };
  }

  if (!forceCheck && lastPhoneAvailability.value === rawPhone) {
    const cached = lastPhoneAvailability.result;
    if (!cached) {
      state.phoneValid = true;
      updateSectionVisibility();
      maybeGenerateUsername();
      return { valid: true, result: null };
    }

    if (!cached.available) {
      renderFieldStatus(
        phoneAvailabilityEl,
        cached.error || 'This phone number is already registered.',
        'error'
      );
      state.phoneValid = false;
      updateSectionVisibility();
      return { valid: false, result: cached };
    }

    renderFieldStatus(
      phoneAvailabilityEl,
      'Phone number looks good!',
      'success'
    );
    state.phoneValid = true;
    updateSectionVisibility();
    maybeGenerateUsername();
    return { valid: true, result: cached };
  }

  renderFieldStatus(phoneAvailabilityEl, 'Checking uniqueness…', 'info');

  const result = await checkPhoneAvailability(rawPhone);
  lastPhoneAvailability = { value: rawPhone, result };

  if (!result.available) {
    renderFieldStatus(
      phoneAvailabilityEl,
      result.error || 'This phone number is already registered.',
      'error'
    );
    state.phoneValid = false;
    updateSectionVisibility();
    return { valid: false, result };
  }

  renderFieldStatus(phoneAvailabilityEl, 'Phone number looks good!', 'success');
  state.phoneValid = true;
  updateSectionVisibility();
  maybeGenerateUsername();
  return { valid: true, result };
}

async function prepareUsername() {
  if (!state.namesComplete || !state.emailValid || !state.phoneValid) {
    return null;
  }

  if (generatedUsername) {
    return generatedUsername;
  }

  if (usernameGenerationPromise) {
    return usernameGenerationPromise;
  }

  usernameGenerationPromise = (async () => {
    try {
      renderFieldStatus(usernameFeedbackEl, 'Creating your username…', 'info');
      notifyUsernameGeneration();
      const username = await ensureUniqueUsername(
        firstNameInput.value.trim(),
        lastNameInput.value.trim(),
        emailInput.value.trim()
      );

      setUsernameField(username, {
        status: 'success',
        message: 'Your username is reserved. Keep it safe.',
      });
      updateSectionVisibility();
      if (feedbackEl?.dataset?.state === 'info') {
        showFeedback(
          'Username secured! Use it with your password to sign in after payment.',
          'info'
        );
      }
      // Auto-focus on password field after username generation
      setTimeout(() => {
        passwordInput?.focus();
        triggerFieldPulse(passwordInput);
      }, 300);
      return username;
    } catch (error) {
      console.error('[Registration] Failed to generate username', error);
      renderFieldStatus(
        usernameFeedbackEl,
        error.message || 'We could not generate a username. Please try again.',
        'error'
      );
      state.usernameReady = false;
      updateSectionVisibility();
      throw error;
    } finally {
      usernameGenerationPromise = null;
    }
  })();

  return usernameGenerationPromise;
}

function maybeGenerateUsername() {
  if (generatedUsername) return;
  if (!state.namesComplete || !state.emailValid || !state.phoneValid) return;
  prepareUsername().catch((error) => {
    console.error('[Registration] Username preparation failed', error);
  });
}

function validatePasswords() {
  const password = passwordInput?.value || '';
  const confirm = confirmPasswordInput?.value || '';

  if (!password || password.length < 8) {
    passwordFeedbackEl?.classList.remove('hidden');
    if (passwordFeedbackEl)
      passwordFeedbackEl.textContent =
        'Password must be at least 8 characters long.';
    return { valid: false };
  }

  if (password !== confirm) {
    passwordFeedbackEl?.classList.remove('hidden');
    if (passwordFeedbackEl)
      passwordFeedbackEl.textContent =
        'Passwords do not match. Please re-enter them.';
    return { valid: false };
  }

  passwordFeedbackEl?.classList.add('hidden');
  if (passwordFeedbackEl) passwordFeedbackEl.textContent = '';
  return { valid: true, password };
}

async function createPendingUser(payload) {
  const supabase = await ensureSupabaseClient();

  const { data, error } = await supabase.functions.invoke(
    'create-pending-user',
    {
      body: payload,
    }
  );

  if (error) {
    const userMessage = await extractEdgeFunctionError(
      error,
      'We could not create your profile. Please try again.'
    );
    throw new Error(userMessage);
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  if (!data?.userId) {
    throw new Error('Failed to get a user ID from the server.');
  }

  return {
    userId: data.userId,
    username: data.username || payload.username,
  };
}

async function attemptPaymentVerification(reference, options = {}) {
  const { maxAttempts = 3, baseDelay = 1500 } = options;
  let attempt = 0;
  let lastError = null;

  while (attempt < maxAttempts) {
    try {
      await verifyPayment(reference);
      return { success: true };
    } catch (error) {
      lastError = error;
      attempt += 1;
      if (attempt >= maxAttempts) break;
      const delay = baseDelay * Math.pow(1.5, attempt - 1);
      await wait(delay);
    }
  }

  return {
    success: false,
    error: lastError,
  };
}

async function pollSubscriptionStatus(userId, options = {}) {
  if (!userId) return null;
  const { attempts = 6, interval = 4000 } = options;

  const supabase = await ensureSupabaseClient();
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('subscription_status')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.warn('[Registration] Subscription status check failed', error);
      }

      const status = data?.subscription_status;
      if (isActiveSubscription(status)) {
        return { status, success: true };
      }
    } catch (error) {
      console.warn(
        '[Registration] Unexpected error while polling subscription status',
        error
      );
    }

    if (attempt < attempts - 1) {
      await wait(interval);
    }
  }

  return { success: false };
}

async function verifyPayment(reference) {
  const supabase = await ensureSupabaseClient();
  const { error } = await supabase.functions.invoke('paystack-verify', {
    body: { reference },
  });

  if (error) {
    const message = await extractEdgeFunctionError(
      error,
      'Payment verification failed. Please contact support with your reference.'
    );
    throw new Error(message);
  }
}

async function signInWithCredentials(email, password) {
  const supabase = await ensureSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { success: !error, error };
}

function showSuccessState(options) {
  if (!successContainer || !registrationContainer) return;
  registrationContainer.classList.add('hidden');
  successContainer.classList.remove('hidden');

  if (successTitleEl && options.title) {
    successTitleEl.textContent = options.title;
  }

  if (successBodyEl && options.body) {
    successBodyEl.innerHTML = options.body;
  }

  if (successReferenceEl) {
    if (options.reference) {
      successReferenceEl.textContent = `Reference: ${options.reference}`;
      successReferenceEl.classList.remove('hidden');
    } else {
      successReferenceEl.classList.add('hidden');
      successReferenceEl.textContent = '';
    }
  }

  if (successCredentialsCard) {
    successCredentialsCard.classList.toggle('hidden', !options.showCredentials);
  }

  if (successUsernameEl && options.username) {
    successUsernameEl.textContent = options.username;
  }

  if (successGoDashboardBtn) {
    successGoDashboardBtn.classList.toggle('hidden', !options.showDashboardCta);
  }

  if (successRetryBtn) {
    successRetryBtn.classList.toggle('hidden', !options.showRetryCta);
    successRetryBtn.disabled = Boolean(options.disableRetry);
  }
}

async function transitionToActiveState(contact) {
  const username = contact?.username || generatedUsername;
  const email =
    contact?.email || contact?.contactEmail || emailInput?.value?.trim();
  const userId = contact?.userId || pendingUserId;

  if (username && successUsernameEl) {
    successUsernameEl.textContent = username;
  }

  if (userId) {
    try {
      window.sessionStorage.setItem('refreshQuizUserId', userId);
    } catch {
      // ignore storage issues
    }
  }

  let autoLoginSucceeded = false;
  const hasStoredPassword = Boolean(storedPassword);

  if (email && hasStoredPassword) {
    const loginResult = await signInWithCredentials(email, storedPassword);
    autoLoginSucceeded = loginResult.success;
    if (!loginResult.success) {
      console.warn('[Registration] Auto sign-in failed', loginResult.error);
    }
  }

  window.localStorage.removeItem(STORAGE_CONTACT);
  window.localStorage.removeItem(STORAGE_PLAN);
  clearStoredReference();

  if (autoLoginSucceeded) {
    if (storedPassword) {
      try {
        window.sessionStorage.setItem(
          'welcome_credentials',
          JSON.stringify({
            username,
            password: storedPassword,
            userId,
            savedAt: new Date().toISOString(),
          })
        );
      } catch (storageError) {
        console.warn(
          '[Registration] Unable to store welcome credentials',
          storageError
        );
      }
    }
    await resetTodaysQuiz(userId);
    showSuccessState({
      title: 'Payment confirmed! You’re in 🎉',
      body: 'We activated your plan and signed you in automatically. Save your username below and keep your password safe.',
      showCredentials: true,
      username,
      showDashboardCta: true,
      reference: null,
      showRetryCta: false,
    });

    storedPassword = '';
    return { autoLogin: true };
  }

  showSuccessState({
    title: 'Payment confirmed — final step',
    body: 'Your subscription is active. Sign in with the username and password you created earlier to continue.',
    showCredentials: true,
    username,
    showDashboardCta: false,
    reference: null,
    showRetryCta: false,
  });

  return { autoLogin: false };
}

async function processPaymentVerification(reference, contact, options = {}) {
  const {
    maxAttempts = 3,
    baseDelay = 1500,
    pollAttempts = 6,
    pollInterval = 4000,
  } = options;

  if (!reference) {
    throw new Error('Missing payment reference.');
  }

  if (isVerifyingPayment) {
    console.warn(
      '[Registration] Verification already in progress, ignoring duplicate trigger.'
    );
    return;
  }

  isVerifyingPayment = true;
  lastVerificationError = null;

  try {
    const verificationResult = await attemptPaymentVerification(reference, {
      maxAttempts,
      baseDelay,
    });

    if (verificationResult.success) {
      await transitionToActiveState(contact);
      return;
    }

    lastVerificationError = verificationResult.error;

    const pollResult = await pollSubscriptionStatus(
      contact?.userId || pendingUserId,
      {
        attempts: pollAttempts,
        interval: pollInterval,
      }
    );

    if (pollResult.success) {
      await transitionToActiveState(contact);
      return;
    }

    console.warn(
      '[Registration] Verification pending after retries',
      lastVerificationError
    );
    // Try a final server-side reconciliation as a last resort
    try {
      const supabase = await ensureSupabaseClient();
      await supabase.functions.invoke('reconcile-payments', {
        body: { userId: contact?.userId || pendingUserId },
      });
      await supabase.rpc('refresh_profile_subscription_status', {
        p_user_id: contact?.userId || pendingUserId,
      });
      const recheck = await supabase
        .from('profiles')
        .select('subscription_status')
        .eq('id', contact?.userId || pendingUserId)
        .maybeSingle();
      const reStatus = (recheck?.data?.subscription_status || '').toLowerCase();
      if (reStatus === 'active' || reStatus === 'trialing') {
        await transitionToActiveState(contact);
        return;
      }
    } catch (reconcileError) {
      console.warn(
        '[Registration] reconcile-payments final attempt failed',
        reconcileError
      );
    }
    showSuccessState({
      title: 'Payment received — almost there',
      body: 'We recorded your payment but have not confirmed it yet. Paystack may still be processing it. Try verification again in a moment or share your reference with support so we can finish it for you.',
      showCredentials: false,
      showDashboardCta: false,
      reference,
      showRetryCta: true,
    });
  } catch (error) {
    lastVerificationError = error;
    console.error(
      '[Registration] Payment verification encountered an unexpected error',
      error
    );
    showSuccessState({
      title: 'Payment received — action required',
      body: 'We recorded your payment but could not verify it automatically. Please retry verification below, or contact support with your payment reference.',
      showCredentials: false,
      showDashboardCta: false,
      reference,
      showRetryCta: true,
    });
  } finally {
    isVerifyingPayment = false;
  }
}

async function resetTodaysQuiz(userId) {
  if (!userId) return;
  try {
    const supabase = await ensureSupabaseClient();
    const today = new Date().toISOString().slice(0, 10);

    const { data: quizzes, error: quizError } = await supabase
      .from('daily_quizzes')
      .select('id')
      .eq('user_id', userId)
      .eq('assigned_date', today);

    if (quizError) {
      console.warn(
        '[Registration] Failed to fetch existing daily quizzes',
        quizError
      );
      return;
    }

    if (Array.isArray(quizzes) && quizzes.length > 0) {
      const ids = quizzes.map((quiz) => quiz.id);
      const { error: deleteQuestionsError } = await supabase
        .from('daily_quiz_questions')
        .delete()
        .in('daily_quiz_id', ids);
      if (deleteQuestionsError) {
        console.warn(
          '[Registration] Failed to clear quiz questions',
          deleteQuestionsError
        );
      }

      const { error: deleteQuizError } = await supabase
        .from('daily_quizzes')
        .delete()
        .in('id', ids);
      if (deleteQuizError) {
        console.warn(
          '[Registration] Failed to remove existing daily quiz',
          deleteQuizError
        );
      }
    }

    const { error: regenerateError } = await supabase.rpc(
      'generate_daily_quiz'
    );
    if (regenerateError) {
      console.warn(
        '[Registration] Failed to regenerate daily quiz',
        regenerateError
      );
    }
  } catch (error) {
    console.warn(
      '[Registration] Unexpected error while resetting daily quiz',
      error
    );
  }
}

function prepareRegistrationPayload(planId) {
  const firstName = firstNameInput?.value.trim();
  const lastName = lastNameInput?.value.trim();
  const email = emailInput?.value.trim().toLowerCase();
  const phone = normalizePhoneValue();

  if (!firstName || !lastName || !email || !phone || !generatedUsername) {
    throw new Error('Fill in all required fields before continuing.');
  }

  return {
    planId,
    firstName,
    lastName,
    email,
    phone,
    username: generatedUsername,
    password: storedPassword,
    planSnapshot: activePlanSnapshot,
  };
}

function persistContact(contact) {
  const payload = {
    planId: contact.planId,
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email,
    phone: contact.phone,
    username: contact.username,
    userId: contact.userId || pendingUserId,
  };

  if (contact.reference) {
    payload.reference = contact.reference;
  }

  window.localStorage.setItem(STORAGE_CONTACT, JSON.stringify(payload));
  lastContactDetails = payload;
}

async function handleFormSubmit(event) {
  event.preventDefault();
  clearFeedback();

  try {
    const planId = planIdInput?.value;
    if (!planId) {
      throw new Error(
        'Missing plan information. Please go back and choose a plan again.'
      );
    }

    if (!state.namesComplete) {
      firstNameInput?.focus();
      throw new Error('Enter your first and last name to continue.');
    }

    setLoading(true);

    const emailValidation = await validateEmailField({ forceCheck: true });
    if (!emailValidation.valid) {
      emailInput?.focus();
      throw new Error(
        emailValidation.result?.error ||
          (emailValidation.reason === 'invalid_format'
            ? 'Enter a valid email address before continuing.'
            : 'This email already has an active subscription. Please sign in instead.')
      );
    }

    const phoneValidation = await validatePhoneField({ forceCheck: true });
    if (!phoneValidation.valid) {
      phoneInput?.focus();
      throw new Error(
        phoneValidation.result?.error ||
          'This phone number is already registered. Please use a different number.'
      );
    }

    await prepareUsername();

    const passwordState = validatePasswords();
    if (!passwordState.valid) {
      passwordInput?.focus();
      throw new Error('Fix the highlighted password issues to continue.');
    }

    storedPassword = passwordState.password;

    const registrationPayload = prepareRegistrationPayload(planId);

    showFeedback('Creating your account…', 'info');

    const { userId, username } = await createPendingUser(registrationPayload);
    pendingUserId = userId;
    setUsernameField(username, {
      status: 'success',
      message: 'Your username is reserved. Keep it safe.',
    });

    const contact = {
      planId,
      firstName: registrationPayload.firstName,
      lastName: registrationPayload.lastName,
      email: registrationPayload.email,
      phone: registrationPayload.phone,
      username,
      userId,
    };

    persistContact(contact);

    showFeedback('Signing you in…', 'info');

    const supabase = await ensureSupabaseClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: registrationPayload.email,
      password: storedPassword,
    });

    if (signInError) {
      console.error('[Registration] Auto sign-in failed', signInError);
      throw new Error(
        'Your profile was created, but we could not sign you in automatically. Please use the login form with the password you just set.'
      );
    }

    clearFeedback();
    showFeedback('Account created! Redirecting to secure payment…', 'success');

    await wait(900);

    const params = new URLSearchParams();
    if (planId) params.set('planId', planId);
    window.location.href = params.toString()
      ? `resume-registration.html?${params.toString()}`
      : 'resume-registration.html';
    return;
  } catch (error) {
    console.error('[Registration] Checkout initialisation failed', error);
    showFeedback(
      error.message || 'Unexpected error occurred. Please try again.',
      'error'
    );
    storedPassword = '';
  } finally {
    if (!activeReference) {
      setLoading(false);
    }
  }
}

async function initialise() {
  if (!formEl) return;

  const params = new URLSearchParams(window.location.search);
  const initialPlanId = params.get('planId') || params.get('plan');

  try {
    const supabase = await ensureSupabaseClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.user) {
      state.session = session;
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('subscription_status')
          .eq('id', session.user.id)
          .maybeSingle();

        const status = (profile?.subscription_status || '').toLowerCase();
        if (['pending_payment', 'awaiting_setup'].includes(status)) {
          const redirectParams = new URLSearchParams();
          const pendingPlanId =
            initialPlanId || window.localStorage.getItem('pendingPlanId');
          if (pendingPlanId) {
            redirectParams.set('planId', pendingPlanId);
          }
          const target = redirectParams.toString()
            ? `resume-registration.html?${redirectParams.toString()}`
            : 'resume-registration.html';
          window.location.replace(target);
          return;
        }
      } catch (profileError) {
        console.warn(
          '[Registration] Unable to resolve profile status for session user',
          profileError
        );
      }
    } else {
      await supabase.auth.signOut();
      clearSessionFingerprint();
    }
  } catch (error) {
    console.warn('[Registration] Failed to clear existing session', error);
  }

  window.localStorage.removeItem('pendingPlanId');
  window.localStorage.removeItem(STORAGE_CONTACT);
  window.localStorage.removeItem(STORAGE_REFERENCE);

  const planId = initialPlanId;

  let plan = readStoredPlan(planId);
  if (!plan && planId) {
    plan = await fetchPlanFromSupabase(planId);
  }

  if (!plan) {
    showFeedback(
      'We could not determine which plan you selected. Please return to the pricing page and choose again.'
    );
    setLoading(true);
    if (submitBtn) submitBtn.disabled = true;
    return;
  }

  hydratePlanSummary(plan);

  if (planId && plan.planId !== planId) {
    plan.planId = planId;
  }

  if (planIdInput) {
    planIdInput.value = plan.planId || plan.id;
  }

  const storedContactRaw = window.localStorage.getItem(STORAGE_CONTACT);
  if (storedContactRaw) {
    try {
      const stored = JSON.parse(storedContactRaw);
      if (stored.email) emailInput.value = stored.email;
      if (stored.firstName) firstNameInput.value = stored.firstName;
      if (stored.lastName) lastNameInput.value = stored.lastName;
      if (stored.phone) phoneInput.value = stored.phone;
      if (stored.username) {
        setUsernameField(stored.username, { status: 'success' });
      }
      if (stored.userId) {
        pendingUserId = stored.userId;
      }
      lastContactDetails = stored;
      if (stored.reference && !lastReference) {
        lastReference = stored.reference;
      }
    } catch (error) {
      console.warn('[Registration] Failed to load stored contact info', error);
    }
  }

  const storedReferenceRaw = window.localStorage.getItem(STORAGE_REFERENCE);
  if (storedReferenceRaw) {
    try {
      const parsed = JSON.parse(storedReferenceRaw);
      if (parsed?.reference) {
        lastReference = parsed.reference;
      }
    } catch (error) {
      console.warn(
        '[Registration] Failed to parse stored payment reference',
        error
      );
    }
  }

  configureExistingAccountLinks(initialPlanId);

  evaluateNamesComplete();

  if (emailInput) {
    emailInput.addEventListener('input', () => {
      clearFieldStatus(emailAvailabilityEl);
      lastEmailAvailability = { value: '', result: null };
      pendingProfileHint = null;
      state.emailValid = false;
      resetUsernameState();
    });

    emailInput.addEventListener('blur', () => {
      validateEmailField().catch((error) => {
        console.error('[Registration] Email validation failed', error);
      });
      maybeGenerateUsername();
      setTimeout(maybeFocusAccount, 120);
    });
  }

  if (phoneInput) {
    phoneInput.addEventListener('input', () => {
      clearFieldStatus(phoneAvailabilityEl);
      lastPhoneAvailability = { value: '', result: null };
      state.phoneValid = false;
      resetUsernameState();
    });

    phoneInput.addEventListener('blur', () => {
      validatePhoneField().catch((error) => {
        console.error('[Registration] Phone validation failed', error);
      });
      maybeGenerateUsername();
      setTimeout(maybeFocusAccount, 120);
    });
  }

  firstNameInput?.addEventListener('input', () => {
    resetUsernameState();
    evaluateNamesComplete();
  });

  lastNameInput?.addEventListener('input', () => {
    resetUsernameState();
    evaluateNamesComplete();
  });

  firstNameInput?.addEventListener('blur', () => {
    setTimeout(maybeFocusContact, 120);
  });

  lastNameInput?.addEventListener('blur', () => {
    setTimeout(maybeFocusContact, 120);
  });

  passwordInput?.addEventListener('input', () => {
    validatePasswords();
  });

  confirmPasswordInput?.addEventListener('input', () => {
    validatePasswords();
  });

  copyUsernameBtn?.addEventListener('click', async () => {
    if (!generatedUsername) return;
    const copied = await copyToClipboard(generatedUsername);
    if (copied) {
      renderFieldStatus(
        usernameFeedbackEl,
        'Your username is reserved. Keep it safe.',
        'success'
      );
    } else {
      renderFieldStatus(
        usernameFeedbackEl,
        'Copy failed. Select and copy the username manually.',
        'error'
      );
    }
  });

  successCopyBtn?.addEventListener('click', async () => {
    if (!generatedUsername) return;
    const copied = await copyToClipboard(generatedUsername);
    if (copied) {
      if (successBodyEl) {
        successBodyEl.classList.remove(
          'text-rose-600',
          'text-amber-600',
          'font-semibold'
        );
        successBodyEl.textContent =
          'Username copied! Take a screenshot or store it securely.';
        successBodyEl.classList.add('text-amber-600', 'font-semibold');
      }
    } else if (successBodyEl) {
      successBodyEl.classList.remove(
        'text-rose-600',
        'text-amber-600',
        'font-semibold'
      );
      successBodyEl.textContent =
        'Copy failed. Highlight the username and copy it manually.';
      successBodyEl.classList.add('text-rose-600', 'font-semibold');
    }
  });

  successGoDashboardBtn?.addEventListener('click', () => {
    window.location.href = 'admin-board.html';
  });

  successRetryBtn?.addEventListener('click', () => {
    if (!lastReference || !lastContactDetails) {
      showFeedback(
        'We could not find a recent payment to verify. Please contact support with your payment receipt.',
        'error'
      );
      return;
    }

    showSuccessState({
      title: 'Retrying verification…',
      body: 'Please hold on while we ask Paystack for an update.',
      showCredentials: false,
      showDashboardCta: false,
      reference: lastReference,
      showRetryCta: false,
      disableRetry: true,
    });

    processPaymentVerification(lastReference, lastContactDetails, {
      maxAttempts: 5,
      baseDelay: 2000,
      pollAttempts: 8,
      pollInterval: 5000,
    }).catch((error) => {
      console.error('[Registration] Manual verification retry failed', error);
    });
  });

  formEl.addEventListener('submit', handleFormSubmit);
}

initialise().catch((error) => {
  console.error('[Registration] Initialisation error', error);
  showFeedback(
    'We could not initialise the registration form. Refresh the page to try again.'
  );
  setLoading(true);
  if (submitBtn) submitBtn.disabled = true;
});

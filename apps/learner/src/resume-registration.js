import { getSupabaseClient } from '../../shared/supabaseClient.js';

const statusBanner = document.getElementById('status-banner');
const planSummary = document.getElementById('planSummary');
const planNameEl = document.querySelector('[data-role="plan-name"]');
const planDescriptionEl = document.querySelector('[data-role="plan-description"]');
const planDepartmentEl = document.querySelector('[data-role="plan-department"]');
const planDailyLimitEl = document.querySelector('[data-role="plan-daily-limit"]');
const planDurationEl = document.querySelector('[data-role="plan-duration"]');
const planPriceEl = document.querySelector('[data-role="plan-price"]');
const planChipEl = document.querySelector('[data-role="plan-chip"]');
const payButton = document.getElementById('payButton');
const successSection = document.getElementById('successSection');
const footerYear = document.getElementById('footerYear');

const contactFields = {
  fullName: document.querySelector('[data-field="full-name"]'),
  email: document.querySelector('[data-field="email"]'),
  phone: document.querySelector('[data-field="phone"]'),
  username: document.querySelector('[data-field="username"]'),
};

const paystackConfig = window.__PAYSTACK_CONFIG__ || {};
const STORAGE_PLAN = 'registrationPlan';
const STORAGE_PENDING_PLAN_ID = 'pendingPlanId';

const state = {
  supabase: null,
  user: null,
  profile: null,
  selectedPlan: null,
  activeReference: null,
  isLoading: false,
};

const STATUS_CLASSES = {
  info: ['border-slate-200', 'bg-white/60', 'text-slate-700'],
  success: ['border-emerald-200', 'bg-emerald-50', 'text-emerald-800'],
  warning: ['border-amber-200', 'bg-amber-50', 'text-amber-800'],
  error: ['border-red-200', 'bg-red-50', 'text-red-700'],
};

function showBanner(message, type = 'info') {
  if (!statusBanner) return;
  statusBanner.textContent = message;
  statusBanner.classList.remove('hidden');
  Object.values(STATUS_CLASSES).forEach((classes) => {
    statusBanner.classList.remove(...classes);
  });
  statusBanner.classList.add(...(STATUS_CLASSES[type] || STATUS_CLASSES.info));
}

function clearBanner() {
  if (!statusBanner) return;
  statusBanner.classList.add('hidden');
  statusBanner.textContent = '';
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatCurrency(amount, currency = 'NGN') {
  if (amount === null || amount === undefined) {
    return 'Contact sales';
  }
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).format(Number(amount));
  } catch (error) {
    console.warn('[ResumeRegistration] Currency formatting failed', error);
    return `${currency} ${amount}`;
  }
}

function readStoredPlan(planId) {
  const raw = window.localStorage.getItem(STORAGE_PLAN);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!planId || parsed.planId === planId || parsed.id === planId) {
      return parsed;
    }
  } catch (error) {
    console.warn('[ResumeRegistration] Failed to parse stored plan snapshot', error);
  }
  return null;
}

async function fetchPlanFromSupabase(planId) {
  if (!planId || !state.supabase) return null;
  try {
    const { data, error } = await state.supabase
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
      code: data.code,
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
    console.error('[ResumeRegistration] Failed to fetch plan snapshot', error);
    return null;
  }
}

function populateContactCard(profile) {
  const metadata = state.user?.user_metadata || {};
  const fullName =
    profile?.full_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') ||
    metadata.full_name ||
    [metadata.first_name, metadata.last_name].filter(Boolean).join(' ');
  const email = profile?.email || state.user?.email || metadata.email || '—';
  const phone = profile?.phone || metadata.phone || '—';
  const username = profile?.username || metadata.username || '—';

  if (contactFields.fullName) contactFields.fullName.textContent = fullName || '—';
  if (contactFields.email) contactFields.email.textContent = email || '—';
  if (contactFields.phone) contactFields.phone.textContent = phone || '—';
  if (contactFields.username) contactFields.username.textContent = username || '—';
}

async function ensurePendingPlanContext() {
  const profileSnapshot = state.profile?.pending_plan_snapshot || null;
  const pendingPlanId =
    state.profile?.pending_plan_id || window.localStorage.getItem(STORAGE_PENDING_PLAN_ID);

  let plan = null;

  if (profileSnapshot) {
    plan = {
      ...profileSnapshot,
      id: profileSnapshot.id || pendingPlanId,
      currency: profileSnapshot.currency || 'NGN',
    };
  }

  if (!plan && pendingPlanId) {
    plan = readStoredPlan(pendingPlanId);
  }

  if (!plan && pendingPlanId) {
    plan = await fetchPlanFromSupabase(pendingPlanId);
  }

  if (!plan) {
    showBanner(
      'We could not find your selected plan. Please return to the pricing page and start again.',
      'error'
    );
    updatePayButtonState();
    return null;
  }

  if (!plan.id) {
    plan.id = pendingPlanId || plan.planId;
  }

  window.localStorage.setItem(STORAGE_PENDING_PLAN_ID, plan.id);
  window.localStorage.setItem(
    STORAGE_PLAN,
    JSON.stringify({
      planId: plan.id,
      id: plan.id,
      name: plan.name,
      price: plan.price,
      currency: plan.currency,
      metadata: plan.metadata || {},
      duration_days: plan.duration_days,
      quiz_duration_minutes: plan.quiz_duration_minutes,
      daily_question_limit: plan.daily_question_limit,
      product: plan.product || plan.subscription_product || null,
    })
  );

  state.selectedPlan = plan;
  renderPlanDetails(plan);
  updatePayButtonState();
  return plan;
}

function renderPlanDetails(plan) {
  if (!planSummary) return;

  if (!plan) {
    planSummary.classList.add('hidden');
    planSummary.textContent = '';
    if (planNameEl) planNameEl.textContent = '—';
    if (planDescriptionEl) planDescriptionEl.textContent = 'We will show your plan summary once it is available.';
    if (planDepartmentEl) planDepartmentEl.textContent = '—';
    if (planDailyLimitEl) planDailyLimitEl.textContent = '—';
    if (planDurationEl) planDurationEl.textContent = '—';
    if (planPriceEl) planPriceEl.textContent = '—';
    if (planChipEl) planChipEl.textContent = 'Pending activation';
    return;
  }

  const product = plan.product || plan.subscription_product || {};
  const departmentName = product.department_name || product.department?.name || 'Your department';
  const durationLabel = plan.duration_days
    ? `${plan.duration_days} day${plan.duration_days === 1 ? '' : 's'}`
    : 'Flexible access';
  const limitLabel = plan.daily_question_limit
    ? `${plan.daily_question_limit} questions/day`
    : 'Unlimited practice';
  const priceLabel = formatCurrency(plan.price, plan.currency || 'NGN');

  if (planNameEl) planNameEl.textContent = plan.name || 'Selected plan';
  if (planDescriptionEl) {
    planDescriptionEl.textContent =
      plan.metadata?.summary ||
      plan.metadata?.tagline ||
      plan.metadata?.description ||
      'Access curated question banks, analytics, and coaching for this department.';
  }
  if (planDepartmentEl) planDepartmentEl.textContent = departmentName;
  if (planDailyLimitEl) planDailyLimitEl.textContent = limitLabel;
  if (planDurationEl) planDurationEl.textContent = durationLabel;
  if (planPriceEl) planPriceEl.textContent = priceLabel;
  const status = (state.profile?.subscription_status || '').toLowerCase();
  const chipText = status === 'active' || status === 'trialing' ? 'Active plan' : 'Pending activation';
  if (planChipEl) planChipEl.textContent = chipText;

  const summaryParts = [priceLabel, durationLabel, limitLabel];
  planSummary.textContent = `${plan.name || 'Plan'} • ${summaryParts.join(' • ')}`;
  planSummary.classList.remove('hidden');
}

function updatePayButtonState() {
  if (!payButton) return;
  payButton.disabled = !state.selectedPlan || state.isLoading;
}

function setLoading(isLoading) {
  state.isLoading = isLoading;
  if (payButton) {
    payButton.disabled = isLoading || !state.selectedPlan;
    payButton.textContent = isLoading ? 'Preparing Paystack…' : 'Pay securely with Paystack';
  }
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

function buildContactPayload() {
  const profile = state.profile || {};
  const metadata = state.user?.user_metadata || {};

  const email = state.user?.email || profile.email || metadata.email || '';
  const fullName = profile.full_name || metadata.full_name || '';
  const { first: derivedFirst, last: derivedLast } = splitNameParts(fullName);

  return {
    email,
    firstName: profile.first_name || metadata.first_name || derivedFirst || 'Learner',
    lastName: profile.last_name || metadata.last_name || derivedLast || 'Account',
    phone: profile.phone || metadata.phone || '',
    username:
      profile.username ||
      metadata.username ||
      (email ? email.split('@')[0] : `user-${Date.now()}`),
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
      console.warn('[ResumeRegistration] Failed to parse edge error response', parseError);
    }
  }

  if (error?.message && error.message !== 'Edge Function returned a non-2xx status code') {
    return error.message;
  }

  return fallbackMessage;
}

async function verifyPayment(reference) {
  if (!state.supabase) return;
  const { error } = await state.supabase.functions.invoke('paystack-verify', {
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

async function refreshProfileStatus() {
  if (!state.supabase || !state.user) return;
  try {
    await state.supabase.rpc('refresh_profile_subscription_status', {
      p_user_id: state.user.id,
    });
  } catch (error) {
    console.warn('[ResumeRegistration] Unable to refresh profile status', error);
  }
}

async function fetchProfile() {
  if (!state.supabase || !state.user) return null;
  const { data, error } = await state.supabase
    .from('profiles')
    .select(
      `
        id,
        full_name,
        first_name,
        last_name,
        phone,
        email,
        username,
        subscription_status,
        registration_stage,
        pending_plan_id,
        pending_plan_snapshot,
        pending_plan_selected_at
      `
    )
    .eq('id', state.user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function pollForActivation({ attempts = 6, interval = 3000 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const profile = await fetchProfile();
      state.profile = profile || state.profile;
      const status = (profile?.subscription_status || '').toLowerCase();
      if (status === 'active' || status === 'trialing') {
        populateContactCard(profile);
        return true;
      }
    } catch (error) {
      console.warn('[ResumeRegistration] Subscription poll failed', error);
    }
    if (attempt < attempts - 1) {
      await wait(interval);
    }
  }
  return false;
}

function launchPaystackCheckout(paystackData, contact) {
  if (!window.PaystackPop) {
    showBanner('Payment library failed to load. Please refresh and try again.', 'error');
    setLoading(false);
    return;
  }

  try {
    const handler = window.PaystackPop.setup({
      key: paystackData.publicKey || paystackConfig.publicKey,
      email: contact.email,
      amount: paystackData.amount,
      currency: paystackData.currency || 'NGN',
      ref: paystackData.reference,
      metadata: paystackData.metadata || {},
      callback: (response) => {
        const reference = response.reference || paystackData.reference;
        state.activeReference = reference;
        handlePaymentSuccess(reference).catch((error) => {
          console.error('[ResumeRegistration] Post-payment handling failed', error);
          showBanner(
            error.message ||
              'We received your payment but could not finish activation automatically. Please contact support with your reference.',
            'error'
          );
          setLoading(false);
        });
      },
      onClose: () => {
        showBanner('Checkout closed before completion. You can try again anytime.', 'warning');
        state.activeReference = null;
        setLoading(false);
      },
    });

    handler.openIframe();
    showBanner('Paystack checkout opened in a secure window. Complete payment to continue.', 'info');
  } catch (error) {
    console.error('[ResumeRegistration] Failed to open Paystack checkout', error);
    showBanner('We could not open the payment window. Please refresh and try again.', 'error');
    setLoading(false);
  }
}

async function handlePaymentSuccess(reference) {
  setLoading(true);
  showBanner('Verifying payment…', 'info');

  try {
    await verifyPayment(reference);
    await refreshProfileStatus();

    const activated = await pollForActivation({ attempts: 6, interval: 3000 });
    if (activated) {
      showBanner('Payment confirmed! Redirecting to your dashboard…', 'success');
      successSection?.classList.remove('hidden');
      window.localStorage.removeItem('pendingPlanId');
      window.localStorage.removeItem('registrationPlan');
      setTimeout(() => {
        window.location.href = 'admin-board.html';
      }, 1500);
      return;
    }

    showBanner(
      'We verified your payment but the subscription has not activated yet. Please contact support with your payment reference.',
      'warning'
    );
  } catch (error) {
    console.error('[ResumeRegistration] Payment verification failed', error);
    showBanner(error.message || 'We could not verify your payment automatically. Please try again.', 'error');
  } finally {
    state.activeReference = null;
    setLoading(false);
  }
}

async function startCheckout() {
  if (!state.supabase || !state.user) return;
  if (!state.selectedPlan) {
    showBanner('We could not detect your selected plan. Please refresh and try again.', 'warning');
    return;
  }

  const plan = state.selectedPlan;
  const contact = buildContactPayload();

  if (!contact.email) {
    showBanner('We need an email address before starting checkout. Please update your profile or contact support.', 'error');
    return;
  }

  setLoading(true);
  clearBanner();

  try {
    const { data, error } = await state.supabase.functions.invoke('paystack-initiate', {
      body: {
        planId: plan.id,
        userId: state.user.id,
        registration: {
          first_name: contact.firstName,
          last_name: contact.lastName,
          phone: contact.phone,
          username: contact.username,
        },
      },
    });

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

    if (!data?.reference) {
      throw new Error('Paystack did not return a checkout reference.');
    }

    state.activeReference = data.reference;
    launchPaystackCheckout(data, contact);
  } catch (error) {
    console.error('[ResumeRegistration] Checkout initialisation failed', error);
    showBanner(error.message || 'Unable to start checkout. Please try again.', 'error');
    setLoading(false);
    state.activeReference = null;
  }
}

function bindEventListeners() {
  payButton?.addEventListener('click', () => {
    if (!state.isLoading) {
      startCheckout();
    }
  });
}

async function initialise() {
  if (footerYear) {
    footerYear.textContent = new Date().getFullYear();
  }

  bindEventListeners();

  try {
    state.supabase = await getSupabaseClient();
    const {
      data: { session },
    } = await state.supabase.auth.getSession();

    if (!session?.user) {
      const redirect = encodeURIComponent('resume-registration.html');
      window.location.href = `login.html?redirect=${redirect}`;
      return;
    }

    state.user = session.user;
    state.profile = await fetchProfile();
    if (!state.profile) {
      throw new Error('Unable to load your profile. Please refresh.');
    }

    populateContactCard(state.profile);

    const status = (state.profile.subscription_status || '').toLowerCase();
    if (status !== 'pending_payment' && status !== 'awaiting_setup') {
      window.location.href = 'admin-board.html';
      return;
    }

    clearBanner();
    showBanner('Complete payment to activate your selected plan.', 'info');

    await ensurePendingPlanContext();
  } catch (error) {
    console.error('[ResumeRegistration] Initialisation failed', error);
    showBanner(error.message || 'Unable to resume checkout right now. Please refresh the page.', 'error');
    updatePayButtonState();
  }
}

initialise().catch((error) => {
  console.error('[ResumeRegistration] Unexpected error during init', error);
  showBanner('Something went wrong while preparing checkout. Please refresh and try again.', 'error');
});

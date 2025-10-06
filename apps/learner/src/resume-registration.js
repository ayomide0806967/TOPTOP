import { getSupabaseClient } from '../../shared/supabaseClient.js';

const statusBanner = document.getElementById('status-banner');
const departmentSelect = document.getElementById('departmentSelect');
const planSelect = document.getElementById('planSelect');
const planSummary = document.getElementById('planSummary');
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

const state = {
  supabase: null,
  user: null,
  profile: null,
  products: [],
  departments: [],
  generalProducts: [],
  planLookup: new Map(),
  selectedDepartment: '',
  selectedPlanId: '',
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
    (product) => product.is_active && product.plans.some((plan) => plan.is_active)
  );
}

function deriveDepartments(products) {
  const lookup = new Map();
  products.forEach((product) => {
    if (!product.department_id) return;
    if (!lookup.has(product.department_id)) {
      lookup.set(product.department_id, {
        id: product.department_id,
        name: product.department_name,
        slug: product.department_slug || product.department_id,
        color: product.color_theme || product.department_slug || 'default',
      });
    }
  });
  return Array.from(lookup.values()).sort((a, b) => a.name.localeCompare(b.name));
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

function buildDepartmentOptions() {
  if (!departmentSelect) return;
  const baseOption = document.createElement('option');
  baseOption.value = '';
  baseOption.textContent = 'Select a department…';
  departmentSelect.replaceChildren(baseOption);

  const options = [...state.departments];
  if (state.generalProducts.length) {
    options.push({ id: 'general', name: 'General Access', slug: 'general' });
  }

  options.forEach((dept) => {
    const option = document.createElement('option');
    option.value = dept.id;
    option.textContent = dept.name;
    departmentSelect.appendChild(option);
  });

  if (state.selectedDepartment) {
    departmentSelect.value = state.selectedDepartment;
  }
}

function buildPlanOptions() {
  if (!planSelect) return;

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = state.selectedDepartment
    ? 'Select a plan…'
    : 'Choose a department first…';

  planSelect.replaceChildren(placeholder);
  planSelect.disabled = !state.selectedDepartment;

  if (!state.selectedDepartment) {
    planSummary?.classList.add('hidden');
    state.selectedPlanId = '';
    planSelect.value = '';
    updatePayButtonState();
    return;
  }

  const products =
    state.selectedDepartment === 'general'
      ? state.generalProducts
      : state.products.filter((product) => product.department_id === state.selectedDepartment);

  state.planLookup.clear();

  const plans = products.flatMap((product) =>
    product.plans
      .filter((plan) => plan.is_active)
      .map((plan) => ({ plan, product }))
  );

  plans.forEach(({ plan, product }) => {
    const option = document.createElement('option');
    option.value = plan.id;
    option.textContent = `${plan.name} — ${formatCurrency(plan.price, plan.currency)}`;
    planSelect.appendChild(option);
    state.planLookup.set(plan.id, { plan, product });
  });

  if (state.selectedPlanId && state.planLookup.has(state.selectedPlanId)) {
    planSelect.value = state.selectedPlanId;
  } else {
    state.selectedPlanId = '';
    planSelect.value = '';
  }

  updatePlanSummary();
  updatePayButtonState();
}

function updatePlanSummary() {
  if (!planSummary) return;

  if (!state.selectedPlanId || !state.planLookup.has(state.selectedPlanId)) {
    planSummary.classList.add('hidden');
    planSummary.textContent = '';
    return;
  }

  const { plan, product } = state.planLookup.get(state.selectedPlanId);
  const durationLabel = plan.duration_days
    ? `${plan.duration_days} day${plan.duration_days === 1 ? '' : 's'}`
    : null;
  const limitLabel = plan.daily_question_limit
    ? `${plan.daily_question_limit} questions/day`
    : null;
  const parts = [
    `${formatCurrency(plan.price, plan.currency)} payable once`,
    durationLabel,
    limitLabel,
  ].filter(Boolean);

  planSummary.textContent = `${plan.name} · ${product.name}${parts.length ? ` · ${parts.join(' • ')}` : ''}`;
  planSummary.classList.remove('hidden');
}

function updatePayButtonState() {
  if (!payButton) return;
  payButton.disabled = !state.selectedPlanId || state.isLoading;
}

function setLoading(isLoading) {
  state.isLoading = isLoading;
  if (payButton) {
    payButton.disabled = isLoading || !state.selectedPlanId;
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
      'id, full_name, first_name, last_name, phone, email, username, subscription_status'
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
  if (!state.selectedPlanId || !state.planLookup.has(state.selectedPlanId)) {
    showBanner('Select a plan before continuing.', 'warning');
    return;
  }

  const { plan } = state.planLookup.get(state.selectedPlanId);
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

function restoreSelections() {
  const params = new URLSearchParams(window.location.search);
  const planIdFromQuery = params.get('planId');
  const storedPlanId = window.localStorage.getItem('pendingPlanId');
  state.selectedPlanId = planIdFromQuery || storedPlanId || '';

  if (state.selectedPlanId && state.planLookup.has(state.selectedPlanId)) {
    const { product } = state.planLookup.get(state.selectedPlanId);
    state.selectedDepartment = product.department_id || 'general';
  } else if (state.selectedPlanId) {
    // Department will be resolved after products load.
    state.selectedDepartment = '';
  } else {
    const storedDepartment = window.localStorage.getItem('resumeDepartment');
    if (storedDepartment) {
      state.selectedDepartment = storedDepartment;
    }
  }
}

function persistSelections() {
  if (state.selectedPlanId) {
    window.localStorage.setItem('pendingPlanId', state.selectedPlanId);
  }
  if (state.selectedDepartment) {
    window.localStorage.setItem('resumeDepartment', state.selectedDepartment);
  }
}

function bindEventListeners() {
  departmentSelect?.addEventListener('change', (event) => {
    state.selectedDepartment = event.target.value;
    if (state.selectedDepartment) {
      window.localStorage.setItem('resumeDepartment', state.selectedDepartment);
    } else {
      window.localStorage.removeItem('resumeDepartment');
    }
    state.selectedPlanId = '';
    window.localStorage.removeItem('pendingPlanId');
    buildPlanOptions();
  });

  planSelect?.addEventListener('change', (event) => {
    state.selectedPlanId = event.target.value;
    if (state.selectedPlanId) {
      window.localStorage.setItem('pendingPlanId', state.selectedPlanId);
    } else {
      window.localStorage.removeItem('pendingPlanId');
    }
    updatePlanSummary();
    updatePayButtonState();
  });

  payButton?.addEventListener('click', () => {
    if (!state.isLoading) {
      startCheckout();
    }
  });
}

async function loadProducts() {
  if (!state.supabase) return;
  try {
    const { data, error } = await state.supabase
      .from('subscription_products_with_plans')
      .select('*')
      .order('department_name', { ascending: true })
      .order('price', { ascending: true });
    if (error) throw error;

    const products = groupProducts(data || []);
    state.products = products.filter((product) => product.department_id);
    state.generalProducts = products.filter((product) => !product.department_id);
    state.departments = deriveDepartments(products);

    restoreSelections();
    buildDepartmentOptions();

    if (!state.selectedDepartment) {
      if (state.selectedPlanId) {
        const entry = products
          .flatMap((product) => product.plans.map((plan) => ({ product, plan })))
          .find(({ plan }) => plan.id === state.selectedPlanId);
        if (entry) {
          state.selectedDepartment = entry.product.department_id || 'general';
        }
      }
      if (!state.selectedDepartment && state.departments.length === 1) {
        state.selectedDepartment = state.departments[0].id;
      }
    }

    if (!state.selectedDepartment && state.generalProducts.length === 1) {
      state.selectedDepartment = 'general';
    }

    if (state.selectedDepartment) {
      departmentSelect.value = state.selectedDepartment;
    }

    buildPlanOptions();

    if (state.selectedPlanId && !state.planLookup.has(state.selectedPlanId)) {
      showBanner(
        'The plan you previously selected is no longer available. Please choose a different plan.',
        'warning'
      );
      state.selectedPlanId = '';
      window.localStorage.removeItem('pendingPlanId');
      buildPlanOptions();
    }

    persistSelections();
  } catch (error) {
    console.error('[ResumeRegistration] Failed to load products', error);
    showBanner('We could not load subscription plans right now. Please refresh the page.', 'error');
  }
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
    showBanner('Pick a plan to finish activating your account.', 'info');

    await loadProducts();
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

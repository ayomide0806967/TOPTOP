import { getSupabaseClient } from '../../shared/supabaseClient.js';

const STORAGE_PLAN = 'registrationPlan';
const STORAGE_CONTACT = 'registrationContact';
const STORAGE_POSTPAY = 'postPaymentRegistration';

const paystackConfig = window.__PAYSTACK_CONFIG__ || {};

const registrationContainer = document.getElementById('registration-container');
const successContainer = document.getElementById('success-message');
const formEl = document.getElementById('registrationForm');
const feedbackEl = document.getElementById('form-feedback');
const submitBtn = formEl?.querySelector('[data-role="submit"]');
const submitText = formEl?.querySelector('[data-role="submit-text"]');

const firstNameInput = document.getElementById('first-name');
const lastNameInput = document.getElementById('last-name');
const emailInput = document.getElementById('email-address');
const phoneInput = document.getElementById('phone-number');

const planIdInput = document.getElementById('plan-id');
const planNameEl = document.querySelector('[data-role="plan-name"]');
const planPriceEl = document.querySelector('[data-role="plan-price"]');
const planDurationEl = document.querySelector('[data-role="plan-duration"]');
const planDescriptionEl = document.querySelector(
  '[data-role="plan-description"]'
);
const planTimerEl = document.querySelector('[data-role="plan-timer"]');

let supabasePromise = null;
let activeReference = null;

function showFeedback(message, type = 'error') {
  if (!feedbackEl) return;
  feedbackEl.textContent = message;
  feedbackEl.classList.remove('hidden');
  feedbackEl.classList.remove(
    'bg-green-50',
    'border-green-200',
    'text-green-700'
  );
  feedbackEl.classList.remove('bg-red-50', 'border-red-200', 'text-red-700');
  if (type === 'success') {
    feedbackEl.classList.add(
      'bg-green-50',
      'border-green-200',
      'text-green-700'
    );
  } else {
    feedbackEl.classList.add('bg-red-50', 'border-red-200', 'text-red-700');
  }
}

function clearFeedback() {
  if (!feedbackEl) return;
  feedbackEl.classList.add('hidden');
  feedbackEl.textContent = '';
}

function setLoading(isLoading) {
  if (!submitBtn || !submitText) return;
  submitBtn.disabled = isLoading;
  submitBtn.classList.toggle('opacity-60', isLoading);
  submitText.textContent = isLoading
    ? 'Preparing checkout…'
    : 'Continue to payment';
}

function ensureSupabaseClient() {
  if (!supabasePromise) {
    supabasePromise = getSupabaseClient();
  }
  return supabasePromise;
}

function formatCurrency(value, currency = 'NGN') {
  const formatter = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  });
  return formatter.format(Number(value || 0));
}

function hydratePlanSummary(plan) {
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
        'id, name, price, currency, metadata, duration_days, quiz_duration_minutes'
      )
      .eq('id', planId)
      .maybeSingle();
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('[Registration] Failed to fetch plan', error);
    throw new Error(
      'We could not load the selected plan. Please return to the pricing page and try again.'
    );
  }
}

function generateTemporaryPassword() {
  const random =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '')
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  const base = random.slice(0, 12);
  return `${base}Aa1!`;
}

function prepareContactPayload(planId) {
  const firstName = firstNameInput?.value.trim();
  const lastName = lastNameInput?.value.trim();
  const email = emailInput?.value.trim().toLowerCase();
  const phone = phoneInput?.value.trim();

  if (!firstName || !lastName || !email || !phone) {
    throw new Error('Fill in all required fields before continuing.');
  }

  return {
    planId,
    firstName,
    lastName,
    email,
    phone,
  };
}

async function ensureUserSession(contact) {
  const supabase = await ensureSupabaseClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.user) {
    const emailMatches = session.user.email?.toLowerCase() === contact.email;
    if (!emailMatches) {
      throw new Error(
        'You are signed in with a different account. Please sign out first.'
      );
    }
    return session;
  }

  const tempPassword = generateTemporaryPassword();
  const { data, error } = await supabase.auth.signUp({
    email: contact.email,
    password: tempPassword,
    options: {
      data: {
        first_name: contact.firstName,
        last_name: contact.lastName,
        phone: contact.phone,
        prepay_plan: contact.planId,
      },
    },
  });

  if (error) {
    if (
      error.message &&
      error.message.toLowerCase().includes('already registered')
    ) {
      throw new Error(
        'This email is already registered. Please sign in to continue with your purchase.'
      );
    }
    throw error;
  }

  if (!data.session) {
    throw new Error(
      'Check your inbox for a confirmation email, then try again.'
    );
  }

  return data.session;
}

async function upsertProfile(contact, userId) {
  const supabase = await ensureSupabaseClient();
  const payload = {
    id: userId,
    full_name: `${contact.firstName} ${contact.lastName}`.trim(),
    first_name: contact.firstName,
    last_name: contact.lastName,
    phone: contact.phone,
    email: contact.email,
  };

  const { error } = await supabase
    .from('profiles')
    .upsert(payload, { onConflict: 'id' });

  if (error) {
    console.error('[Registration] Failed to save profile', error);
    throw new Error('We could not save your details. Please try again.');
  }

  await supabase.auth.updateUser({
    data: {
      first_name: contact.firstName,
      last_name: contact.lastName,
      phone: contact.phone,
    },
  });
}

async function invokeCheckout(contact) {
  const supabase = await ensureSupabaseClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  const { data, error } = await supabase.functions.invoke('paystack-initiate', {
    body: {
      planId: contact.planId,
      registration: {
        first_name: contact.firstName,
        last_name: contact.lastName,
        phone: contact.phone,
      },
    },
    headers: accessToken
      ? { Authorization: `Bearer ${accessToken}` }
      : undefined,
  });

  if (error) {
    throw new Error(error.message || 'Unable to initialise checkout.');
  }

  if (!data || !data.reference) {
    throw new Error('Paystack did not return a checkout reference.');
  }

  return data;
}

async function verifyTransaction(reference) {
  const supabase = await ensureSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;

  if (!accessToken) {
    throw new Error('Authentication token is missing. Please sign in again.');
  }

  const { data, error } = await supabase.functions.invoke('paystack-verify', {
    body: { reference },
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (error) {
    throw new Error(error.message || 'Payment verification failed.');
  }

  return data;
}

function proceedToAfterRegistration(reference, contact) {
  const payload = {
    reference,
    planId: contact.planId,
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email,
    phone: contact.phone,
  };
  window.localStorage.setItem(STORAGE_POSTPAY, JSON.stringify(payload));
  const currentPath = window.location.pathname;
  const newPath = currentPath.replace(
    'registration-before-payment.html',
    'registration-after-payment.html'
  );
  window.location.href = newPath + '?reference=' + reference;
}

function openPaystackCheckout(paystackData, contact) {
  if (!window.PaystackPop) {
    throw new Error(
      'Paystack library failed to load. Please refresh the page and try again.'
    );
  }

  activeReference = paystackData.reference;

  const handler = window.PaystackPop.setup({
    key: paystackData.publicKey || paystackConfig.publicKey,
    email: contact.email,
    amount: paystackData.amount,
    currency: paystackData.currency || 'NGN',
    ref: paystackData.reference,
    metadata: paystackData.metadata || {},
    callback: (response) => {
      const reference = response.reference || paystackData.reference;
      verifyTransaction(reference)
        .then(() => {
          proceedToAfterRegistration(reference, contact);
        })
        .catch((error) => {
          console.error('[Registration] Verification failed', error);
          showFeedback(
            error.message ||
              'We could not confirm your payment. Contact support with your reference.'
          );
          if (successContainer && registrationContainer) {
            successContainer.classList.add('hidden');
            registrationContainer.classList.remove('hidden');
          }
          setLoading(false);
        })
        .finally(() => {
          activeReference = null;
        });
    },
    onClose: () => {
      activeReference = null;
      showFeedback(
        'Checkout was closed before finishing. You can reopen it anytime by pressing Continue to payment.'
      );
      if (successContainer && registrationContainer) {
        successContainer.classList.add('hidden');
        registrationContainer.classList.remove('hidden');
      }
    },
  });

  handler.openIframe();
}

async function handleFormSubmit(event) {
  event.preventDefault();
  clearFeedback();
  setLoading(true);

  try {
    const planId = planIdInput?.value;
    if (!planId) {
      throw new Error(
        'Missing plan information. Please go back and choose a plan again.'
      );
    }

    const contact = prepareContactPayload(planId);

    const session = await ensureUserSession(contact);
    await upsertProfile(contact, session.user.id);

    window.localStorage.setItem(STORAGE_CONTACT, JSON.stringify(contact));

    const paystackData = await invokeCheckout(contact);
    const publicKey =
      paystackData.paystack_public_key || paystackConfig.publicKey;

    if (!publicKey) {
      showFeedback('Missing Paystack configuration. Contact support.');
      return;
    }

    if (registrationContainer && successContainer) {
      registrationContainer.classList.add('hidden');
      successContainer.classList.remove('hidden');
    }

    const metadata = {
      ...paystackData.metadata,
      contact: {
        first_name: contact.firstName,
        last_name: contact.lastName,
        phone: contact.phone,
      },
    };

    openPaystackCheckout(
      {
        ...paystackData,
        publicKey,
        metadata,
      },
      contact
    );
  } catch (error) {
    console.error('[Registration] Checkout initialisation failed', error);
    showFeedback(
      error.message || 'Unexpected error occurred. Please try again.'
    );
  } finally {
    if (!activeReference) {
      setLoading(false);
    }
  }
}

async function initialise() {
  if (!formEl) return;

  window.localStorage.removeItem('pendingPlanId');

  const params = new URLSearchParams(window.location.search);
  const planId = params.get('planId') || params.get('plan');

  let plan = readStoredPlan(planId);
  if (!plan && planId) {
    plan = await fetchPlanFromSupabase(planId);
  }

  if (!plan) {
    showFeedback(
      'We could not determine which plan you selected. Please return to the pricing page and choose again.'
    );
    setLoading(true);
    submitBtn.disabled = true;
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
    } catch (error) {
      console.warn('[Registration] Failed to load stored contact info', error);
    }
  }

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

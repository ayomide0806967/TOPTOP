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
const emailAvailabilityEl = document.getElementById('email-availability-feedback');

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
let lastEmailAvailability = { value: '', result: null };

const FIELD_STATUS_CLASSES = ['text-red-600', 'text-green-600', 'text-slate-600'];

function renderFieldStatus(target, message, type = 'info') {
  if (!target) return;

  target.textContent = message;
  target.classList.remove('hidden', ...FIELD_STATUS_CLASSES);

  if (type === 'error') {
    target.classList.add('text-red-600');
  } else if (type === 'success') {
    target.classList.add('text-green-600');
  } else {
    target.classList.add('text-slate-600');
  }
}

function clearFieldStatus(target) {
  if (!target) return;
  target.textContent = '';
  target.classList.add('hidden');
  target.classList.remove(...FIELD_STATUS_CLASSES);
}

/**
 * Show feedback message to user
 * @param {string} message - Message to display (can include HTML)
 * @param {string} type - Type of message: 'error', 'success', or 'info'
 */
function showFeedback(message, type = 'error') {
  if (!feedbackEl) return;
  
  console.log('[Registration] Showing feedback:', { message, type });
  
  // Use innerHTML to support links in error messages
  feedbackEl.innerHTML = message;
  feedbackEl.classList.remove('hidden');
  
  // Remove all color classes
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
  
  // Apply appropriate color classes
  if (type === 'success') {
    feedbackEl.classList.add('bg-green-50', 'border-green-200', 'text-green-700');
  } else if (type === 'info') {
    feedbackEl.classList.add('bg-blue-50', 'border-blue-200', 'text-blue-700');
  } else {
    feedbackEl.classList.add('bg-red-50', 'border-red-200', 'text-red-700');
  }
  
  // Scroll feedback into view for better visibility
  feedbackEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Clear feedback message
 */
function clearFeedback() {
  if (!feedbackEl) return;
  feedbackEl.classList.add('hidden');
  feedbackEl.innerHTML = '';  // Use innerHTML to match showFeedback
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
      console.warn('[Registration] Failed to parse edge error response', parseError);
    }
  }

  if (error?.message && error.message !== 'Edge Function returned a non-2xx status code') {
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

/**
 * Prepare contact payload from form inputs
 * @param {string} planId - Selected plan ID
 * @returns {Object} Contact information
 */
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

/**
 * Check if email is already registered
 * @param {string} email - Email to check
 * @returns {Promise<{available: boolean, status?: string, error?: string, message?: string}>}
 */
async function checkEmailAvailability(email) {
  try {
    const supabase = await ensureSupabaseClient();
    
    console.log('[Registration] Checking email availability:', email);
    
    const { data, error } = await supabase
      .from('profiles')
      .select('subscription_status')
      .eq('email', email.toLowerCase())
      .maybeSingle();
    
    if (error && error.code !== 'PGRST116') {
      console.error('[Registration] Error checking email:', error);
      return { 
        available: false, 
        error: 'Unable to verify email. Please try again.' 
      };
    }
    
    if (!data) {
      console.log('[Registration] Email is available');
      return { available: true };
    }
    
    console.log('[Registration] Email exists with status:', data.subscription_status);
    
    // Email exists - check subscription status
    if (data.subscription_status === 'active' || data.subscription_status === 'trialing') {
      return { 
        available: false, 
        status: 'active',
        error: 'This email already has an active subscription. Please <a href="login.html" class="font-semibold underline">login here</a> or use a different email address.'
      };
    }
    
    // Email exists but pending - allow reuse
    return { 
      available: true, 
      status: 'pending',
      message: 'We found your previous registration. Continuing where you left off...'
    };
    
  } catch (error) {
    console.error('[Registration] Email check failed:', error);
    return { 
      available: false, 
      error: 'Unable to verify email. Please check your connection and try again.' 
    };
  }
}

async function validateEmailField({ forceCheck = false } = {}) {
  if (!emailInput) {
    return { valid: true, result: null };
  }

  const rawEmail = emailInput.value.trim();

  if (!rawEmail) {
    clearFieldStatus(emailAvailabilityEl);
    lastEmailAvailability = { value: '', result: null };
    return { valid: false, reason: 'empty' };
  }

  if (!emailInput.checkValidity()) {
    renderFieldStatus(
      emailAvailabilityEl,
      'Enter a valid email address before continuing.',
      'error'
    );
    return { valid: false, reason: 'invalid_format' };
  }

  const email = rawEmail.toLowerCase();

  if (!forceCheck && lastEmailAvailability.value === email) {
    const cached = lastEmailAvailability.result;
    if (!cached) {
      return { valid: true, result: null };
    }

    if (!cached.available) {
      renderFieldStatus(
        emailAvailabilityEl,
        cached.error || 'This email already has an active subscription. Please sign in instead.',
        'error'
      );
      return { valid: false, result: cached };
    }

    if (cached.status === 'pending' && cached.message) {
      renderFieldStatus(emailAvailabilityEl, cached.message, 'info');
    } else {
      renderFieldStatus(emailAvailabilityEl, 'Email looks good!', 'success');
    }

    return { valid: true, result: cached };
  }

  renderFieldStatus(emailAvailabilityEl, 'Checking availability…', 'info');

  const result = await checkEmailAvailability(email);
  lastEmailAvailability = { value: email, result };

  if (!result.available) {
    renderFieldStatus(
      emailAvailabilityEl,
      result.error || 'This email already has an active subscription. Please sign in instead.',
      'error'
    );
    return { valid: false, result };
  }

  if (result.status === 'pending' && result.message) {
    renderFieldStatus(emailAvailabilityEl, result.message, 'info');
  } else {
    renderFieldStatus(emailAvailabilityEl, 'Email looks good!', 'success');
  }

  return { valid: true, result };
}

/**
 * Check if phone number is already registered
 * @param {string} phone - Phone number to check
 * @returns {Promise<{available: boolean, error?: string}>}
 */
async function checkPhoneAvailability(phone) {
  try {
    const supabase = await ensureSupabaseClient();
    
    console.log('[Registration] Checking phone availability:', phone);
    
    const { data, error } = await supabase
      .from('profiles')
      .select('id, subscription_status')
      .eq('phone', phone)
      .maybeSingle();
    
    if (error && error.code !== 'PGRST116') {
      console.error('[Registration] Error checking phone:', error);
      return { 
        available: false, 
        error: 'Unable to verify phone number. Please try again.' 
      };
    }
    
    if (!data) {
      console.log('[Registration] Phone is available');
      return { available: true };
    }
    
    console.log('[Registration] Phone exists with status:', data.subscription_status);
    
    // Phone exists - check if it's an active subscription
    if (data.subscription_status === 'active' || data.subscription_status === 'trialing') {
      return { 
        available: false, 
        error: 'This phone number is already registered with an active subscription. Please use a different number.'
      };
    }
    
    // Phone exists but pending - allow reuse (same user might be retrying)
    console.log('[Registration] Phone exists but allowing reuse (pending status)');
    return { available: true };
    
  } catch (error) {
    console.error('[Registration] Phone check failed:', error);
    return { 
      available: false, 
      error: 'Unable to verify phone number. Please try again.' 
    };
  }
}

async function createPendingUser(contact) {
  const supabase = await ensureSupabaseClient();
  
  console.log('[Registration] Sending to create-pending-user:', contact);
  
  const { data, error } = await supabase.functions.invoke('create-pending-user', {
    body: contact,
  });

  console.log('[Registration] Response from create-pending-user:', { data, error });

  if (error) {
    console.error('Detailed error from create-pending-user function:', error);
    console.error('Error context:', error.context);
    console.error('Error message:', error.message);

    const userMessage = await extractEdgeFunctionError(
      error,
      'We could not create your profile. Please try again.'
    );

    throw new Error(userMessage);
  }

  if (data?.error) {
    console.error('Business logic error from create-pending-user:', data.error);
    console.error('Full error details:', data.details);
    console.error('Stack trace:', data.stack);
    throw new Error(data.error);
  }

  if (!data?.userId) {
    console.error('[Registration] No userId in response. Full data:', data);
    throw new Error('Failed to get a user ID from the server.');
  }

  return data.userId;
}

async function invokeCheckout(contact, userId) {
  const supabase = await ensureSupabaseClient();
  
  console.log('[Registration] Invoking paystack-initiate with:', {
    planId: contact.planId,
    userId,
    registration: {
      first_name: contact.firstName,
      last_name: contact.lastName,
      phone: contact.phone,
    },
  });
  
  const { data, error } = await supabase.functions.invoke('paystack-initiate', {
    body: {
      planId: contact.planId,
      userId: userId,
      registration: {
        first_name: contact.firstName,
        last_name: contact.lastName,
        phone: contact.phone,
      },
    },
  });

  console.log('[Registration] Response from paystack-initiate:', { data, error });

  if (error) {
    console.error('[Registration] Error from paystack-initiate:', error);
    console.error('Error context:', error.context);
    console.error('Error message:', error.message);

    const userMessage = await extractEdgeFunctionError(
      error,
      'Unable to initialise checkout.'
    );

    throw new Error(userMessage);
  }

  if (data?.error) {
    console.error('[Registration] Business error from paystack-initiate:', data.error);
    console.error('Error details:', data.details);
    throw new Error(data.error);
  }

  if (!data || !data.reference) {
    console.error('[Registration] No reference in response. Full data:', data);
    throw new Error('Paystack did not return a checkout reference.');
  }

  console.log('[Registration] Paystack data to be used for checkout:', data);
  return data;
}

function proceedToAfterRegistration(reference, contact, userId) {
  console.log('[Registration] Payment successful! Reference:', reference);
  
  // Store the payment reference and contact info for the next step
  window.localStorage.setItem(STORAGE_POSTPAY, JSON.stringify({
    reference,
    email: contact.email,
    firstName: contact.firstName,
    lastName: contact.lastName,
    phone: contact.phone,
    userId: userId,
    planId: contact.planId,
  }));

  // Redirect to the after-payment registration page
  const currentPath = window.location.pathname;
  const newPath = currentPath.replace(
    'registration-before-payment.html',
    'registration-after-payment.html'
  );
  window.location.href = newPath + '?reference=' + reference;
}

function openPaystackCheckout(paystackData, contact, userId) {
  if (!window.PaystackPop) {
    throw new Error(
      'Paystack library failed to load. Please refresh the page and try again.'
    );
  }

  activeReference = paystackData.reference;

  const checkoutConfig = {
    key: paystackData.publicKey || paystackConfig.publicKey,
    email: contact.email,
    amount: paystackData.amount,
    currency: paystackData.currency || 'NGN',
    ref: paystackData.reference,
    metadata: paystackData.metadata || {},
    callback: (response) => {
      const reference = response.reference || paystackData.reference;
      proceedToAfterRegistration(reference, contact, userId);
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
  };

  console.log('[Registration] Paystack checkout config:', checkoutConfig);

  const handler = window.PaystackPop.setup(checkoutConfig);
  handler.openIframe();
}

/**
 * Handle form submission with validation
 * @param {Event} event - Form submit event
 */
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

    const contact = prepareContactPayload(planId);

    // Step 1: Validate email availability
    showFeedback('Verifying email address...', 'info');
    setLoading(true);

    const emailValidation = await validateEmailField({ forceCheck: true });
    const emailCheck = emailValidation.result;

    if (!emailValidation.valid) {
      const message =
        emailCheck?.error ||
        (emailValidation.reason === 'invalid_format'
          ? 'Enter a valid email address before continuing.'
          : 'This email already has an active subscription. Please sign in instead.');
      showFeedback(message, 'error');
      emailInput?.focus();
      setLoading(false);
      return;
    }

    if (emailCheck?.status === 'pending' && emailCheck.message) {
      showFeedback(emailCheck.message, 'success');
    }

    // Step 2: Validate phone availability
    console.log('[Registration] Checking phone availability...');
    const phoneCheck = await checkPhoneAvailability(contact.phone);
    
    if (!phoneCheck.available) {
      showFeedback(phoneCheck.error || 'This phone number is already registered.', 'error');
      setLoading(false);
      return;
    }

    // Step 3: Create pending user
    // Only clear feedback if we're proceeding (no errors)
    showFeedback('Creating your account...', 'info');
    
    const userId = await createPendingUser(contact);
    console.log('[Registration] User created/updated:', userId);

    window.localStorage.setItem(STORAGE_CONTACT, JSON.stringify({ ...contact, userId }));

    // Step 4: Initialize payment
    showFeedback('Preparing payment checkout...', 'info');
    
    const paystackData = await invokeCheckout(contact, userId);
    const publicKey =
      paystackData.paystack_public_key || paystackConfig.publicKey;

    if (!publicKey) {
      showFeedback('Missing Paystack configuration. Contact support.', 'error');
      setLoading(false);
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

    clearFeedback();
    openPaystackCheckout(
      {
        ...paystackData,
        publicKey,
        metadata,
      },
      contact,
      userId
    );
  } catch (error) {
    console.error('[Registration] Checkout initialisation failed', error);
    showFeedback(
      error.message || 'Unexpected error occurred. Please try again.',
      'error'
    );

    if (typeof error.message === 'string') {
      const lowered = error.message.toLowerCase();
      if (lowered.includes('email')) {
        renderFieldStatus(emailAvailabilityEl, error.message, 'error');
        if (emailInput?.value) {
          lastEmailAvailability = {
            value: emailInput.value.trim().toLowerCase(),
            result: { available: false, error: error.message },
          };
        }
        emailInput?.focus();
      }
    }
  } finally {
    // Only disable loading if we're not opening Paystack
    // (activeReference is set when Paystack opens)
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

  if (emailInput) {
    emailInput.addEventListener('input', () => {
      clearFieldStatus(emailAvailabilityEl);
      lastEmailAvailability = { value: '', result: null };
    });

    emailInput.addEventListener('blur', () => {
      validateEmailField().catch((error) => {
        console.error('[Registration] Email validation failed', error);
      });
    });
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

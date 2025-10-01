import { getSupabaseClient } from '../../shared/supabaseClient.js';

const STORAGE_CONTACT = 'registrationContact';
const STORAGE_POSTPAY = 'postPaymentRegistration';
const STORAGE_PLAN = 'registrationPlan';

const formEl = document.getElementById('afterForm');
const feedbackEl = document.getElementById('after-feedback');
const submitBtn = formEl?.querySelector('[data-role="submit"]');
const submitText = formEl?.querySelector('[data-role="submit-text"]');
const successEl = document.getElementById('after-success');
const containerEl = document.getElementById('after-registration-form');
const goDashboardBtn = document.getElementById('after-go-dashboard');

const emailInput = document.getElementById('after-email');
const usernameInput = document.getElementById('after-username');
const passwordInput = document.getElementById('after-password');
const confirmPasswordInput = document.getElementById('after-confirm-password');
const passwordErrorEl = document.getElementById('after-password-error');
const strengthBars = document.querySelectorAll(
  '[data-role="strength-bars"] .strength-bar'
);
const usernameAvailabilityEl = document.getElementById('username-availability-feedback');

let supabasePromise = null;
let contactPayload = null;
let reference = null;
let lastUsernameAvailability = { value: '', result: null };

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

function setInputValidity(input, isValid) {
  if (!input) return;
  if (isValid) {
    input.removeAttribute('aria-invalid');
  } else {
    input.setAttribute('aria-invalid', 'true');
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
      console.warn('[After Registration] Failed to parse edge error response', parseError);
    }
  }

  if (error?.message && error.message !== 'Edge Function returned a non-2xx status code') {
    return error.message;
  }

  return fallbackMessage;
}

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
  feedbackEl.textContent = '';
  feedbackEl.classList.add('hidden');
}

function setLoading(isLoading) {
  if (!submitBtn || !submitText) return;
  submitBtn.disabled = isLoading;
  submitBtn.classList.toggle('opacity-60', isLoading);
  submitText.textContent = isLoading ? 'Saving…' : 'Save and continue';
}

function evaluatePasswordStrength(password) {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return score;
}

function updateStrengthMeter(password) {
  const score = evaluatePasswordStrength(password);
  strengthBars.forEach((bar, index) => {
    if (index < score) {
      const color = ['#ef4444', '#f59e0b', '#84cc16', '#22c55e'][
        Math.min(score - 1, 3)
      ];
      bar.style.backgroundColor = color;
    } else {
      bar.style.backgroundColor = '#e2e8f0';
    }
  });
}

function readStoredContact() {
  const postPayRaw = window.localStorage.getItem(STORAGE_POSTPAY);
  if (postPayRaw) {
    try {
      return JSON.parse(postPayRaw);
    } catch (error) {
      console.warn('[After Registration] Failed to parse post-payment data', error);
    }
  }

  const contactRaw = window.localStorage.getItem(STORAGE_CONTACT);
  if (contactRaw) {
    try {
      return JSON.parse(contactRaw);
    } catch (error) {
      console.warn('[After Registration] Failed to parse contact data', error);
    }
  }

  return null;
}

function persistUsername(username) {
  contactPayload = { ...contactPayload, username };

  const postPayRaw = window.localStorage.getItem(STORAGE_POSTPAY);
  if (postPayRaw) {
    try {
      const parsed = JSON.parse(postPayRaw);
      window.localStorage.setItem(
        STORAGE_POSTPAY,
        JSON.stringify({ ...parsed, username })
      );
    } catch (error) {
      console.warn('[After Registration] Failed to persist username to STORAGE_POSTPAY', error);
    }
  }

  const contactRaw = window.localStorage.getItem(STORAGE_CONTACT);
  if (contactRaw) {
    try {
      const parsed = JSON.parse(contactRaw);
      window.localStorage.setItem(
        STORAGE_CONTACT,
        JSON.stringify({ ...parsed, username })
      );
    } catch (error) {
      console.warn('[After Registration] Failed to persist username to STORAGE_CONTACT', error);
    }
  }
}

/**
 * Validate and normalize username
 * @param {string} username - Raw username input
 * @returns {string} - Normalized username (lowercase)
 * @throws {Error} - If username is invalid
 */
function validateUsername(username) {
  if (!username || username.trim().length === 0) {
    throw new Error('Username is required.');
  }
  
  const trimmed = username.trim();
  
  if (trimmed.length < 3) {
    throw new Error('Username must be at least 3 characters long.');
  }
  
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    throw new Error('Username can only contain letters, numbers, hyphens, and underscores.');
  }
  
  // Normalize to lowercase to match login flow and backend
  return trimmed.toLowerCase();
}

async function checkUsernameAvailability(username, currentUserId) {
  const supabase = await ensureSupabaseClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle();

  if (error) {
    console.error('[After Registration] Username lookup failed', error);
    return {
      available: false,
      error:
        'We could not verify that username. Check your connection and try again.',
    };
  }

  if (!data) {
    return { available: true };
  }

  if (data.id === currentUserId) {
    return { available: true, reused: true };
  }

  return {
    available: false,
    error: 'This username is already taken. Please choose another.',
  };
}

async function validateUsernameField({ forceCheck = false } = {}) {
  if (!usernameInput) {
    return { valid: true, username: null };
  }

  try {
    const normalized = validateUsername(usernameInput.value);

    if (!forceCheck && lastUsernameAvailability.value === normalized) {
      const cached = lastUsernameAvailability.result;
      if (!cached) {
        setInputValidity(usernameInput, true);
        clearFieldStatus(usernameAvailabilityEl);
        return { valid: true, username: normalized };
      }

      if (!cached.available) {
        renderFieldStatus(
          usernameAvailabilityEl,
          cached.error || 'This username is already taken.',
          'error'
        );
        setInputValidity(usernameInput, false);
        return { valid: false, error: cached.error, username: normalized };
      }

      if (cached.reused) {
        renderFieldStatus(
          usernameAvailabilityEl,
          'You already reserved this username. Finish setting your password to continue.',
          'info'
        );
      } else {
        renderFieldStatus(
          usernameAvailabilityEl,
          'Great choice! This username is available.',
          'success'
        );
      }

      setInputValidity(usernameInput, true);
      persistUsername(normalized);
      return { valid: true, username: normalized };
    }

    renderFieldStatus(
      usernameAvailabilityEl,
      'Checking username availability…',
      'info'
    );

    const availability = await checkUsernameAvailability(
      normalized,
      contactPayload?.userId
    );

    lastUsernameAvailability = { value: normalized, result: availability };

    if (!availability.available) {
      renderFieldStatus(
        usernameAvailabilityEl,
        availability.error || 'This username is already taken.',
        'error'
      );
      setInputValidity(usernameInput, false);
      return {
        valid: false,
        error: availability.error,
        username: normalized,
        availability,
      };
    }

    if (availability.reused) {
      renderFieldStatus(
        usernameAvailabilityEl,
        'You already reserved this username earlier. Finish setting your password to continue.',
        'info'
      );
    } else {
      renderFieldStatus(
        usernameAvailabilityEl,
        'Great choice! This username is available.',
        'success'
      );
    }

    setInputValidity(usernameInput, true);
    persistUsername(normalized);

    return {
      valid: true,
      username: normalized,
      availability,
    };
  } catch (error) {
    console.error('[After Registration] Username validation failed', error);
    renderFieldStatus(usernameAvailabilityEl, error.message, 'error');
    setInputValidity(usernameInput, false);
    return { valid: false, error: error.message };
  }
}

function redirectToLogin() {
  const currentPath = window.location.pathname;
  const loginPath = currentPath.replace(
    'registration-after-payment.html',
    'login.html'
  );
  window.location.href = loginPath;
}

async function updateProfileAndCredentials(username, password) {
  const supabase = await ensureSupabaseClient();
  const userId = contactPayload?.userId;
  if (!userId) {
    throw new Error('User ID not found. Please try again.');
  }

  console.log('[After Registration] Finalizing registration for user:', userId);

  const { data, error } = await supabase.functions.invoke('finalize-registration', {
    body: {
      userId,
      username,
      password,
      firstName: contactPayload?.firstName,
      lastName: contactPayload?.lastName,
      phone: contactPayload?.phone,
      email: contactPayload?.email,
    },
  });

  if (error) {
    console.error('[After Registration] Error from finalize-registration:', error);
    const userMessage = await extractEdgeFunctionError(
      error,
      'Failed to finalize registration'
    );
    throw new Error(userMessage);
  }

  if (data?.error) {
    console.error('[After Registration] Business error:', data.error);
    throw new Error(data.error);
  }

  console.log('[After Registration] Registration finalized successfully');
}

/**
 * Handle registration form submission
 * @param {Event} event - Form submit event
 */
async function handleSubmit(event) {
  event.preventDefault();
  clearFeedback();

  try {
    const usernameState = await validateUsernameField({ forceCheck: true });

    if (!usernameState.valid || !usernameState.username) {
      const message =
        usernameState.error ||
        'Please choose a username that meets the requirements.';
      showFeedback(message);
      usernameInput?.focus();
      return;
    }

    const username = usernameState.username;
    console.log('[After Registration] Normalized username:', username);
    
    // Step 2: Validate passwords
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (!password || password.length === 0) {
      showFeedback('Password is required.');
      return;
    }

    if (password.length < 8) {
      showFeedback('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      passwordErrorEl?.classList.remove('hidden');
      showFeedback('Passwords do not match.');
      return;
    }

    passwordErrorEl?.classList.add('hidden');
    setLoading(true);

    // Step 3: Ensure we still have a pending user record
    const userId = contactPayload?.userId;
    if (!userId) {
      throw new Error('User ID not found. Please try again.');
    }

    // Step 4: Update profile and credentials
    await updateProfileAndCredentials(username, password);
    console.log('[After Registration] Registration completed successfully, now logging in...');

    // Step 5: Automatically sign in the user with their new credentials
    const supabase = await ensureSupabaseClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: contactPayload?.email,
      password: password,
    });

    if (signInError) {
      console.error('[After Registration] Auto sign-in failed:', signInError);
      // Show success message but require manual login
      if (containerEl && successEl) {
        containerEl.classList.add('hidden');
        successEl.classList.remove('hidden');
      }
      showFeedback(
        'Account created successfully! Sign in with your new username and password.',
        'success'
      );
    } else {
      console.log('[After Registration] Auto sign-in successful, redirecting...');
      // Clear storage and redirect
      window.localStorage.removeItem(STORAGE_CONTACT);
      window.localStorage.removeItem(STORAGE_POSTPAY);
      window.localStorage.removeItem(STORAGE_PLAN);
      
      // Redirect to dashboard
      window.location.href = 'admin-board.html';
    }

  } catch (error) {
    console.error('[After Registration] Failed to complete setup', error);
    showFeedback(
      error.message || 'We could not save your details. Please try again.'
    );

    if (typeof error.message === 'string') {
      const lowered = error.message.toLowerCase();
      if (lowered.includes('username')) {
        renderFieldStatus(usernameAvailabilityEl, error.message, 'error');
        setInputValidity(usernameInput, false);
        usernameInput?.focus();
      } else if (lowered.includes('password')) {
        passwordErrorEl?.classList.remove('hidden');
        passwordInput?.focus();
      }
    }
  } finally {
    setLoading(false);
  }
}

async function verifyPayment(reference) {
  const supabase = await ensureSupabaseClient();
  const { error } = await supabase.functions.invoke('paystack-verify', {
    body: { reference },
  });

  if (error) {
    throw new Error(error.message || 'Payment verification failed.');
  }
}

async function initialise() {
  if (!formEl) return;

  window.localStorage.removeItem('pendingPlanId');

  contactPayload = readStoredContact();
  const params = new URLSearchParams(window.location.search);
  reference = params.get('reference') || contactPayload?.reference || null;

  if (!reference) {
    showFeedback('No payment reference found. Please go back and try again.');
    setLoading(true);
    submitBtn.disabled = true;
    return;
  }

  try {
    await verifyPayment(reference);
  } catch (error) {
    showFeedback(error.message || 'Payment verification failed.');
    setLoading(true);
    submitBtn.disabled = true;
    return;
  }

  if (contactPayload?.email && emailInput) {
    emailInput.value = contactPayload.email;
  } 

  if (usernameInput && contactPayload?.username) {
    usernameInput.value = contactPayload.username;
    validateUsernameField({ forceCheck: true }).catch((error) => {
      console.error('[After Registration] Stored username validation failed', error);
    });
  }

  if (usernameInput) {
    usernameInput.addEventListener('input', () => {
      clearFieldStatus(usernameAvailabilityEl);
      lastUsernameAvailability = { value: '', result: null };
      setInputValidity(usernameInput, true);
    });

    usernameInput.addEventListener('blur', () => {
      validateUsernameField().catch((error) => {
        console.error('[After Registration] Username blur validation failed', error);
      });
    });
  }

  passwordInput?.addEventListener('input', () => {
    updateStrengthMeter(passwordInput.value);
  });

  confirmPasswordInput?.addEventListener('input', () => {
    if (passwordInput.value !== confirmPasswordInput.value) {
      passwordErrorEl?.classList.remove('hidden');
    } else {
      passwordErrorEl?.classList.add('hidden');
    }
  });

  formEl.addEventListener('submit', handleSubmit);

  if (goDashboardBtn) {
    goDashboardBtn.addEventListener('click', async () => {
      const supabase = await ensureSupabaseClient();
      await supabase.auth.refreshSession();
      window.location.href = 'admin-board.html';
    });
  }
}

initialise().catch((error) => {
  console.error('[After Registration] Initialisation failed', error);
  showFeedback(
    'We could not load your account details. Please refresh the page.'
  );
  setLoading(true);
  if (submitBtn) submitBtn.disabled = true;
  setTimeout(() => redirectToLogin(), 2000);
});

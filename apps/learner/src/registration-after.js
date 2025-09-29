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

let supabasePromise = null;
let session = null;
let contactPayload = null;
let reference = null;

function ensureSupabaseClient() {
  if (!supabasePromise) {
    supabasePromise = getSupabaseClient();
  }
  return supabasePromise;
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

async function ensureSession() {
  const supabase = await ensureSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }
  session = data.session;
  return session;
}

function readStoredContact() {
  const raw =
    window.localStorage.getItem(STORAGE_POSTPAY) ||
    window.localStorage.getItem(STORAGE_CONTACT);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn('[After Registration] Failed to parse stored contact', error);
    return null;
  }
}

function validateUsername(username) {
  if (!username || username.length < 3) {
    throw new Error('Username must be at least 3 characters long.');
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
    throw new Error(
      'Username can only include letters, numbers, periods, underscores, or dashes.'
    );
  }
  return username;
}

async function assertUsernameAvailable(username, userId) {
  const supabase = await ensureSupabaseClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .not('id', 'eq', userId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  if (data?.id) {
    throw new Error('This username is already taken. Choose another.');
  }
}

async function updateProfileAndCredentials(username, password) {
  const supabase = await ensureSupabaseClient();
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error('Not signed in. Please log in again.');
  }

  await assertUsernameAvailable(username, userId);

  const metadataUpdate = {
    username,
  };

  if (contactPayload?.firstName)
    metadataUpdate.first_name = contactPayload.firstName;
  if (contactPayload?.lastName)
    metadataUpdate.last_name = contactPayload.lastName;
  if (contactPayload?.phone) metadataUpdate.phone = contactPayload.phone;

  const { error: updateError } = await supabase.auth.updateUser({
    password,
    data: metadataUpdate,
  });
  if (updateError) {
    throw updateError;
  }

  const profilePayload = {
    id: userId,
    username,
    full_name:
      `${contactPayload?.firstName || ''} ${contactPayload?.lastName || ''}`.trim() ||
      null,
    first_name: contactPayload?.firstName || null,
    last_name: contactPayload?.lastName || null,
    phone: contactPayload?.phone || null,
    email: session?.user?.email?.toLowerCase() || contactPayload?.email || null,
  };

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert(profilePayload, { onConflict: 'id' });

  if (profileError) {
    throw profileError;
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  clearFeedback();

  try {
    const username = validateUsername(usernameInput.value.trim());
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (password !== confirmPassword) {
      passwordErrorEl?.classList.remove('hidden');
      return;
    }

    passwordErrorEl?.classList.add('hidden');
    setLoading(true);

    await updateProfileAndCredentials(username, password);

    if (containerEl && successEl) {
      containerEl.classList.add('hidden');
      successEl.classList.remove('hidden');
    }

    window.localStorage.removeItem(STORAGE_CONTACT);
    window.localStorage.removeItem(STORAGE_POSTPAY);
    window.localStorage.removeItem(STORAGE_PLAN);

    showFeedback(
      'Credentials saved. You can sign in with your new details.',
      'success'
    );

    if (session) {
      const supabase = await ensureSupabaseClient();
      await supabase.auth.refreshSession();
    }
  } catch (error) {
    console.error('[After Registration] Failed to complete setup', error);
    showFeedback(
      error.message || 'We could not save your details. Please try again.'
    );
  } finally {
    setLoading(false);
  }
}

function redirectToLogin() {
  const loginUrl = new URL('login.html', window.location.origin);
  if (reference) {
    loginUrl.searchParams.set('ref', reference);
  }
  window.location.replace(loginUrl.toString());
}

async function initialise() {
  if (!formEl) return;

  window.localStorage.removeItem('pendingPlanId');

  contactPayload = readStoredContact();
  const params = new URLSearchParams(window.location.search);
  reference = params.get('reference') || contactPayload?.reference || null;

  const currentSession = await ensureSession();
  if (!currentSession) {
    showFeedback('Your session expired. Please sign in again to finish setup.');
    setLoading(true);
    submitBtn.disabled = true;
    redirectToLogin();
    return;
  }

  if (contactPayload?.email && emailInput) {
    emailInput.value = contactPayload.email;
  } else if (currentSession.user?.email && emailInput) {
    emailInput.value = currentSession.user.email;
  }

  if (usernameInput && currentSession.user?.user_metadata?.username) {
    usernameInput.value = currentSession.user.user_metadata.username;
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

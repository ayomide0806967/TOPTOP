import { apiFetch } from '../../shared/apiClient.js';

const DASHBOARD_URL = 'admin-board.html';
const MIN_USERNAME_LENGTH = 3;
const MIN_PASSWORD_LENGTH = 6;
const USERNAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

const loginForm = document.getElementById('loginForm');
const feedbackEl = document.querySelector('[data-role="feedback"]');
const submitBtn = document.querySelector('[data-role="submit"]');
const submitText = submitBtn?.querySelector('[data-role="submit-text"]');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const authChooserEl = document.getElementById('authChooser');
const quickAuthOptionsEl = document.getElementById('quickAuthOptions');
const authBackBtn = document.querySelector('[data-role="auth-back"]');
const claimForm = document.querySelector('[data-role="claim-form"]');
const claimToggleBtn = document.querySelector('[data-role="claim-toggle"]');
const claimSubmitBtn = document.querySelector('[data-role="claim-submit"]');
const claimSubmitText = document.querySelector(
  '[data-role="claim-submit-text"]'
);

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
}

function clearFeedback() {
  if (!feedbackEl) return;
  feedbackEl.textContent = '';
  feedbackEl.classList.add('hidden');
}

function setLoading(loading) {
  if (!submitBtn) return;
  submitBtn.disabled = loading;
  if (submitText) {
    submitText.textContent = loading ? 'Signing in...' : 'Sign in';
  }
  submitBtn.classList.toggle('opacity-70', loading);
  submitBtn.classList.toggle('cursor-wait', loading);
}

function setClaimLoading(loading) {
  if (!claimSubmitBtn) return;
  claimSubmitBtn.disabled = loading;
  if (claimSubmitText) {
    claimSubmitText.textContent = loading
      ? 'Claiming account...'
      : 'Claim account';
  }
  claimSubmitBtn.classList.toggle('opacity-70', loading);
  claimSubmitBtn.classList.toggle('cursor-wait', loading);
}

function setClaimMode(enabled) {
  loginForm?.classList.toggle('hidden', enabled);
  claimForm?.classList.toggle('hidden', !enabled);
  if (claimToggleBtn) {
    claimToggleBtn.textContent = enabled
      ? 'Back to sign in'
      : 'Returning old user? Claim migrated account';
  }
  clearFeedback();
}

function validateUsername(username) {
  if (!username) return { valid: false, error: 'Username is required.' };
  if (username.length < MIN_USERNAME_LENGTH) {
    return {
      valid: false,
      error: `Username must be at least ${MIN_USERNAME_LENGTH} characters.`,
    };
  }
  if (!USERNAME_PATTERN.test(username)) {
    return {
      valid: false,
      error:
        'Username can only contain letters, numbers, hyphens, and underscores.',
    };
  }
  return { valid: true };
}

function validatePassword(password) {
  if (!password) return { valid: false, error: 'Password is required.' };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      valid: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  return { valid: true };
}

function getRedirectTarget() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get('next') || params.get('redirect');
  if (!next) return DASHBOARD_URL;
  if (next.startsWith('http://') || next.startsWith('https://')) {
    return DASHBOARD_URL;
  }
  if (next.startsWith('//')) return DASHBOARD_URL;
  return next;
}

function maybePersistPendingPlanFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const planId = params.get('planId');
  if (!planId) return;
  try {
    window.localStorage.setItem('pendingPlanId', planId);
  } catch (error) {
    console.warn('[Auth] Unable to persist planId for checkout', error);
  }
}

async function getEmailFromUsername(username) {
  const url = new URL('/api/users/lookup-username', window.location.origin);
  url.searchParams.set('username', username.toLowerCase());

  return apiFetch(url.pathname + url.search);
}

async function signInWithCredentials(email, password) {
  return apiFetch('/api/auth/sign-in/email', {
    method: 'POST',
    body: {
      email,
      password,
      rememberMe: true,
    },
  });
}

async function claimMigratedAccount(payload) {
  return apiFetch('/api/registration/claim-migrated-account', {
    method: 'POST',
    body: payload,
  });
}

async function handleLogin(event) {
  event.preventDefault();
  clearFeedback();

  const formData = new FormData(loginForm);
  const username = String(formData.get('username') || '').trim();
  const password = String(formData.get('password') || '');

  const usernameValidation = validateUsername(username);
  if (!usernameValidation.valid) {
    showFeedback(usernameValidation.error);
    usernameInput?.focus();
    return;
  }

  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    showFeedback(passwordValidation.error);
    passwordInput?.focus();
    return;
  }

  setLoading(true);

  try {
    const lookup = await getEmailFromUsername(username);
    if (lookup.needsSupport) {
      showFeedback(
        'This account is currently inactive. Please contact support for assistance.'
      );
      return;
    }

    if (lookup.pendingRegistration) {
      showFeedback(
        'Your checkout is still pending. Continue registration to unlock your account.',
        'info'
      );
    }

    await signInWithCredentials(lookup.email, password);

    try {
      window.sessionStorage.setItem(
        'welcome_credentials',
        JSON.stringify({
          username,
          password,
          userId: lookup.userId,
          savedAt: new Date().toISOString(),
        })
      );
    } catch (storageError) {
      console.warn('[Auth] Unable to store welcome credentials', storageError);
    }

    showFeedback('Signed in successfully. Redirecting...', 'success');
    window.setTimeout(() => {
      window.location.replace(getRedirectTarget());
    }, 350);
  } catch (error) {
    console.error('[Auth] Login failed', error);
    showFeedback(
      error?.message ||
        'Invalid username or password. If registration is pending, continue registration first.'
    );
  } finally {
    setLoading(false);
  }
}

async function handleClaim(event) {
  event.preventDefault();
  clearFeedback();

  const formData = new FormData(claimForm);
  const username = String(formData.get('username') || '')
    .trim()
    .toLowerCase();
  const email = String(formData.get('email') || '')
    .trim()
    .toLowerCase();
  const phone = String(formData.get('phone') || '').trim();
  const paymentReference = String(
    formData.get('paymentReference') || ''
  ).trim();
  const password = String(formData.get('password') || '');
  const confirmPassword = String(formData.get('confirmPassword') || '');

  const usernameValidation = validateUsername(username);
  if (!usernameValidation.valid) {
    showFeedback(usernameValidation.error);
    return;
  }

  if (!email || !email.includes('@')) {
    showFeedback('Enter the email on your old account.');
    return;
  }

  if (!phone && !paymentReference) {
    showFeedback('Enter your phone number or payment reference.');
    return;
  }

  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid || password.length < 8) {
    showFeedback('New password must be at least 8 characters.');
    return;
  }

  if (password !== confirmPassword) {
    showFeedback('Passwords do not match.');
    return;
  }

  setClaimLoading(true);

  try {
    const claimed = await claimMigratedAccount({
      username,
      email,
      phone,
      paymentReference,
      password,
    });

    await signInWithCredentials(claimed.email || email, password);

    showFeedback('Account claimed successfully. Redirecting...', 'success');
    window.setTimeout(() => {
      window.location.replace(getRedirectTarget());
    }, 350);
  } catch (error) {
    console.error('[Auth] Account claim failed', error);
    showFeedback(
      error?.message ||
        'We could not claim this account. Check the details and try again.'
    );
  } finally {
    setClaimLoading(false);
  }
}

async function init() {
  maybePersistPendingPlanFromUrl();

  authChooserEl?.classList.add('hidden');
  quickAuthOptionsEl?.classList.add('hidden');
  authBackBtn?.classList.add('hidden');
  loginForm?.classList.remove('hidden');
  claimForm?.classList.add('hidden');

  const session = await apiFetch('/api/me').catch((error) => {
    if (error?.status === 401) return null;
    throw error;
  });
  if (session?.user) {
    window.location.replace(getRedirectTarget());
    return;
  }

  if (!loginForm) {
    showFeedback('Login form not found. Please refresh the page.');
    return;
  }

  loginForm.addEventListener('submit', handleLogin);
  claimForm?.addEventListener('submit', handleClaim);
  claimToggleBtn?.addEventListener('click', () => {
    setClaimMode(claimForm?.classList.contains('hidden'));
  });
  usernameInput?.focus();
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch((error) => {
    console.error('[Auth] Initialisation failed', error);
    showFeedback('Unable to initialise sign-in. Please refresh the page.');
  });
});

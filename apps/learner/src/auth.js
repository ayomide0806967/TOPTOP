import { getSupabaseClient } from '../../shared/supabaseClient.js';
import {
  deriveSessionFingerprint,
  storeSessionFingerprint,
} from '../../shared/sessionFingerprint.js';

// ============================================================================
// DOM ELEMENTS
// ============================================================================
const loginForm = document.getElementById('loginForm');
const feedbackEl = document.querySelector('[data-role="feedback"]');
const submitBtn = document.querySelector('[data-role="submit"]');
const submitText = submitBtn?.querySelector('[data-role="submit-text"]');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const googleSignInBtn = document.getElementById('googleSignInBtn');
const otpRequestForm = document.getElementById('otpRequestForm');
const otpVerifyForm = document.getElementById('otpVerifyForm');
const otpEmailInput = document.getElementById('otpEmail');
const otpCodeInput = document.getElementById('otpCode');
const sendOtpBtn = document.getElementById('sendOtpBtn');
const verifyOtpBtn = document.getElementById('verifyOtpBtn');
const resendOtpBtn = document.getElementById('resendOtpBtn');

// ============================================================================
// CONSTANTS
// ============================================================================
const DASHBOARD_URL = 'admin-board.html';
const MIN_USERNAME_LENGTH = 3;
const MIN_PASSWORD_LENGTH = 6;
const USERNAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
const OTP_CODE_PATTERN = /^[0-9]{6}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ============================================================================
// UI FEEDBACK FUNCTIONS
// ============================================================================

/**
 * Display feedback message to user
 * @param {string} message - Message to display
 * @param {'error' | 'success'} type - Type of feedback
 */
function showFeedback(message, type = 'error') {
  if (!feedbackEl) return;

  feedbackEl.textContent = message;
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

/**
 * Clear feedback message
 */
function clearFeedback() {
  if (!feedbackEl) return;
  feedbackEl.textContent = '';
  feedbackEl.classList.add('hidden');
}

/**
 * Set loading state for submit button
 * @param {boolean} isLoading - Whether form is in loading state
 */
function setLoading(isLoading) {
  if (!submitBtn || !submitText) return;

  submitBtn.disabled = isLoading;
  submitBtn.classList.toggle('opacity-60', isLoading);
  submitText.textContent = isLoading ? 'Signing in…' : 'Sign in';

  // Disable inputs during loading
  if (usernameInput) usernameInput.disabled = isLoading;
  if (passwordInput) passwordInput.disabled = isLoading;
}

function setOtpLoading(isLoading, { phase = 'request' } = {}) {
  const buttons = [sendOtpBtn, verifyOtpBtn, resendOtpBtn].filter(Boolean);
  buttons.forEach((btn) => {
    btn.disabled = isLoading;
    btn.classList.toggle('opacity-60', isLoading);
  });

  if (otpEmailInput) otpEmailInput.disabled = isLoading;
  if (otpCodeInput) otpCodeInput.disabled = isLoading;

  if (sendOtpBtn && phase === 'request') {
    sendOtpBtn.textContent = isLoading ? 'Sending…' : 'Send code';
  }
  if (verifyOtpBtn && phase === 'verify') {
    verifyOtpBtn.textContent = isLoading ? 'Verifying…' : 'Verify';
  }
  if (resendOtpBtn && phase === 'resend') {
    resendOtpBtn.textContent = isLoading ? 'Resending…' : 'Resend code';
  }
}

async function extractFunctionError(error, fallbackMessage) {
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
        '[Auth] Failed to parse function error response',
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

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate username format
 * @param {string} username - Username to validate
 * @returns {{valid: boolean, error?: string}}
 */
function validateUsername(username) {
  if (!username || username.trim().length === 0) {
    return { valid: false, error: 'Username is required.' };
  }

  const trimmed = username.trim();

  if (trimmed.length < MIN_USERNAME_LENGTH) {
    return {
      valid: false,
      error: `Username must be at least ${MIN_USERNAME_LENGTH} characters.`,
    };
  }

  if (!USERNAME_PATTERN.test(trimmed)) {
    return {
      valid: false,
      error:
        'Username can only contain letters, numbers, hyphens, and underscores.',
    };
  }

  return { valid: true };
}

/**
 * Validate password format
 * @param {string} password - Password to validate
 * @returns {{valid: boolean, error?: string}}
 */
function validatePassword(password) {
  if (!password || password.length === 0) {
    return { valid: false, error: 'Password is required.' };
  }

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
  const next = params.get('next');
  if (!next) return DASHBOARD_URL;
  // Only allow relative redirects to avoid open redirect issues.
  if (next.startsWith('http://') || next.startsWith('https://')) {
    return DASHBOARD_URL;
  }
  if (next.startsWith('//')) {
    return DASHBOARD_URL;
  }
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

function splitName(fullName) {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

async function ensureLearnerProfile(supabase, user) {
  if (!supabase || !user?.id) return;
  const fallbackName = user.email?.split('@')[0] ?? 'Learner';
  const metadata = user.user_metadata || {};
  const fullName =
    metadata.full_name || metadata.name || metadata.fullName || fallbackName;
  const { firstName, lastName } = splitName(fullName);

  const updates = {
    id: user.id,
    role: 'learner',
    email: user.email ?? null,
    full_name: fullName || null,
    first_name: metadata.first_name || firstName || null,
    last_name: metadata.last_name || lastName || null,
    phone: metadata.phone || null,
    last_seen_at: new Date().toISOString(),
  };

  try {
    const { error } = await supabase.from('profiles').upsert(updates, {
      onConflict: 'id',
    });
    if (error) {
      console.warn('[Auth] Failed to upsert profile for user', error);
    }
  } catch (error) {
    console.warn('[Auth] Unexpected error while ensuring profile', error);
  }
}

// ============================================================================
// AUTHENTICATION FUNCTIONS
// ============================================================================

/**
 * Sleep for a specified duration
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get user email from username by querying profiles table
 * Includes retry logic with exponential backoff for network resilience
 * @param {Object} supabase - Supabase client
 * @param {string} username - Username to lookup
 * @param {number} maxRetries - Maximum number of retry attempts (default: 3)
 * @returns {Promise<{email: string | null, error?: string}>}
 */
async function getEmailFromUsername(supabase, username, maxRetries = 3) {
  const normalizedUsername = username.toLowerCase().trim();

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        // Exponential backoff: 1s, 2s, 4s...
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
        console.log(
          `[Auth] Retry attempt ${attempt + 1}/${maxRetries} after ${backoffMs}ms`
        );
        await sleep(backoffMs);
      }

      const { data, error } = await supabase.functions.invoke(
        'lookup-username',
        {
          body: { username: normalizedUsername },
        }
      );

      if (error) {
        console.error(
          `[Auth] lookup-username error (attempt ${attempt + 1}):`,
          error
        );

        // Check if this is a rate limit or network error worth retrying
        const isRetryable =
          error.message?.includes('fetch') ||
          error.message?.includes('network') ||
          error.message?.includes('timeout') ||
          error.message?.includes('429') ||
          error.context?.status === 429 ||
          error.context?.status >= 500;

        if (isRetryable && attempt < maxRetries - 1) {
          continue;
        }

        const message = await extractFunctionError(
          error,
          'Username not found. Please check your username and try again.'
        );
        return { email: null, error: message };
      }

      if (data?.error) {
        console.warn('[Auth] lookup-username response error:', data.error);
        return {
          email: null,
          error: data.error,
          status: data.subscriptionStatus,
        };
      }

      if (!data?.email) {
        return {
          email: null,
          error:
            'Username not found. Please check your username and try again.',
        };
      }

      return {
        email: data.email,
        status: data.subscriptionStatus,
        userId: data.userId,
        latestReference: data.latestReference || null,
        pendingRegistration: Boolean(data.pendingRegistration),
        needsSupport: Boolean(data.needsSupport),
      };
    } catch (error) {
      console.error(
        `[Auth] Unexpected error in getEmailFromUsername (attempt ${attempt + 1}):`,
        error
      );
      // Retry on network errors
      if (attempt < maxRetries - 1) {
        continue;
      }
    }
  }

  // All retries exhausted
  console.error('[Auth] All retry attempts exhausted for getEmailFromUsername');
  return {
    email: null,
    error:
      'Unable to connect. Please check your internet connection and try again.',
  };
}

/**
 * Sign in user with email and password
 * @param {Object} supabase - Supabase client
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function signInWithCredentials(supabase, email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('[Auth] Sign-in error:', error);

      // Handle specific error cases
      if (error.message?.includes('Invalid login credentials')) {
        return {
          success: false,
          error:
            'Invalid username or password. If you haven\'t completed registration, click "Continue previous registration" below.',
        };
      }

      if (error.message?.includes('Email not confirmed')) {
        return {
          success: false,
          error:
            'Your email has not been confirmed. Please check your email or contact support.',
        };
      }

      return {
        success: false,
        error: error.message || 'Unable to sign in. Please try again.',
      };
    }

    return { success: true, session: data?.session || null };
  } catch (error) {
    console.error('[Auth] Unexpected error in signInWithCredentials:', error);
    return {
      success: false,
      error: 'An unexpected error occurred. Please try again.',
    };
  }
}

async function syncActiveSession(supabase, session) {
  try {
    let activeSession = session;
    if (!activeSession) {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();
      activeSession = currentSession;
    }

    const refreshToken = activeSession?.refresh_token;
    if (!refreshToken) {
      console.warn(
        '[Auth] No refresh token found for session synchronisation.'
      );
      return;
    }

    const fingerprint = await deriveSessionFingerprint(refreshToken);
    if (!fingerprint) {
      console.warn('[Auth] Unable to derive session fingerprint.');
      return;
    }

    storeSessionFingerprint(fingerprint);

    const refreshedAtIso = activeSession?.expires_at
      ? new Date(activeSession.expires_at * 1000).toISOString()
      : new Date().toISOString();

    const { error } = await supabase.rpc('sync_profile_session', {
      p_session_fingerprint: fingerprint,
      p_session_refreshed_at: refreshedAtIso,
    });

    if (error) {
      console.warn('[Auth] Failed to sync active session fingerprint', error);
    }
  } catch (error) {
    console.warn('[Auth] Unexpected error while syncing active session', error);
  }
}

/**
 * Handle login form submission
 * @param {Event} event - Form submit event
 * @param {Object} supabase - Supabase client
 */
async function handleLogin(event, supabase) {
  event.preventDefault();
  clearFeedback();

  // Get form values
  const formData = new FormData(loginForm);
  const username = (formData.get('username') ?? '').toString().trim();
  const password = (formData.get('password') ?? '').toString();

  // Validate username
  const usernameValidation = validateUsername(username);
  if (!usernameValidation.valid) {
    showFeedback(usernameValidation.error);
    return;
  }

  // Validate password
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    showFeedback(passwordValidation.error);
    return;
  }

  setLoading(true);

  try {
    // Step 1: Get email from username
    const {
      email,
      error: lookupError,
      pendingRegistration,
      needsSupport,
      userId,
    } = await getEmailFromUsername(supabase, username);

    if (!email) {
      showFeedback(lookupError || 'Username not found.');
      setLoading(false);
      return;
    }

    if (needsSupport) {
      showFeedback(
        'This account is currently inactive. Please contact support for assistance.'
      );
      setLoading(false);
      return;
    }

    if (needsSupport) {
      showFeedback(
        'This account is currently inactive. Please contact support for assistance.'
      );
      setLoading(false);
      return;
    }

    if (pendingRegistration) {
      showFeedback(
        'Your checkout is still pending. Continue registration to unlock your personalised drills.',
        'info'
      );
    }

    // Step 2: Sign in with email and password
    const {
      success,
      error: signInError,
      session,
    } = await signInWithCredentials(supabase, email, password);

    if (!success) {
      showFeedback(signInError || 'Unable to sign in.');
      setLoading(false);
      return;
    }

    await syncActiveSession(supabase, session);
    await ensureLearnerProfile(supabase, session?.user || null);

    try {
      window.sessionStorage.setItem(
        'welcome_credentials',
        JSON.stringify({
          username,
          password,
          userId,
          savedAt: new Date().toISOString(),
        })
      );
    } catch (storageError) {
      console.warn('[Auth] Unable to store welcome credentials', storageError);
    }

    // Success - show feedback and redirect
    showFeedback('Signed in successfully. Redirecting…', 'success');

    // Auth state listener will handle redirect, but add fallback
    setTimeout(() => {
      window.location.replace(getRedirectTarget());
    }, 500);
  } catch (error) {
    console.error('[Auth] Unexpected error during login:', error);
    showFeedback('An unexpected error occurred. Please try again.');
    setLoading(false);
  }
}

async function handleGoogleSignIn(supabase) {
  clearFeedback();
  setOtpLoading(true, { phase: 'request' });

  try {
    const redirectTo = new URL(window.location.href);
    redirectTo.hash = '';
    // Preserve next/planId params so the return continues smoothly.
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTo.toString(),
      },
    });

    if (error) {
      throw error;
    }

    if (data?.url) {
      window.location.assign(data.url);
    }
  } catch (error) {
    console.error('[Auth] Google sign-in failed', error);
    const msg =
      error?.message?.includes('already registered') ||
      error?.message?.includes('already exists') ||
      error?.message?.includes('Email address already')
        ? 'This email already has an account. Use Email OTP to sign in, then connect Google from Profile & security.'
        : error?.message || 'Unable to start Google sign-in. Please try again.';
    showFeedback(msg);
  } finally {
    setOtpLoading(false, { phase: 'request' });
  }
}

function showOtpVerification() {
  otpVerifyForm?.classList.remove('hidden');
  resendOtpBtn?.classList.remove('hidden');
  otpCodeInput?.focus();
}

function normalizeOtpCode(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 6);
}

async function handleOtpRequest(event, supabase) {
  event.preventDefault();
  clearFeedback();

  const email = String(otpEmailInput?.value || '').trim().toLowerCase();
  if (!email || !EMAIL_PATTERN.test(email)) {
    showFeedback('Enter a valid email address.');
    otpEmailInput?.focus();
    return;
  }

  setOtpLoading(true, { phase: 'request' });

  try {
    const redirectTo = new URL(window.location.href);
    redirectTo.hash = '';

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo.toString(),
        shouldCreateUser: true,
      },
    });

    if (error) throw error;

    showFeedback(
      'We sent a 6-digit code to your email. Enter it here, or click the sign-in link in the email.',
      'info'
    );
    showOtpVerification();
  } catch (error) {
    console.error('[Auth] OTP send failed', error);
    showFeedback(
      error?.message || 'Unable to send the code right now. Please try again.'
    );
  } finally {
    setOtpLoading(false, { phase: 'request' });
  }
}

async function handleOtpVerify(event, supabase) {
  event.preventDefault();
  clearFeedback();

  const email = String(otpEmailInput?.value || '').trim().toLowerCase();
  const token = normalizeOtpCode(otpCodeInput?.value);
  if (!email || !EMAIL_PATTERN.test(email)) {
    showFeedback('Enter the email you used to request the code.');
    otpEmailInput?.focus();
    return;
  }
  if (!OTP_CODE_PATTERN.test(token)) {
    showFeedback('Enter the 6-digit code from your email.');
    otpCodeInput?.focus();
    return;
  }

  setOtpLoading(true, { phase: 'verify' });
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });

    if (error) throw error;

    await ensureLearnerProfile(supabase, data?.user || null);
    showFeedback('Signed in successfully. Redirecting…', 'success');
    window.setTimeout(() => {
      window.location.replace(getRedirectTarget());
    }, 350);
  } catch (error) {
    console.error('[Auth] OTP verification failed', error);
    showFeedback(
      error?.message ||
        'Unable to verify the code. Please request a new code and try again.'
    );
  } finally {
    setOtpLoading(false, { phase: 'verify' });
  }
}

async function handleOtpResend(supabase) {
  clearFeedback();
  setOtpLoading(true, { phase: 'resend' });
  try {
    const email = String(otpEmailInput?.value || '').trim().toLowerCase();
    if (!email || !EMAIL_PATTERN.test(email)) {
      showFeedback('Enter your email address first.');
      otpEmailInput?.focus();
      return;
    }

    const redirectTo = new URL(window.location.href);
    redirectTo.hash = '';

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo.toString(),
        shouldCreateUser: true,
      },
    });
    if (error) throw error;
    showFeedback('A new code has been sent. Check your email.', 'info');
  } catch (error) {
    console.error('[Auth] OTP resend failed', error);
    showFeedback(
      error?.message || 'Unable to resend the code right now. Please try again.'
    );
  } finally {
    setOtpLoading(false, { phase: 'resend' });
  }
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Handle impersonation token from URL
 * @param {Object} supabase - Supabase client
 * @param {string} token - Impersonation token
 */
async function handleImpersonation(supabase, token) {
  try {
    const { error } = await supabase.auth.setSession({
      access_token: token,
      refresh_token: '',
    });

    if (error) {
      console.error('[Auth] Impersonation error:', error);
      showFeedback('Invalid impersonation token.');
    } else {
      window.location.replace(DASHBOARD_URL);
    }
  } catch (error) {
    console.error('[Auth] Unexpected error during impersonation:', error);
    showFeedback('An error occurred during impersonation.');
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize login page
 */
async function init() {
  try {
    const supabase = await getSupabaseClient();
    maybePersistPendingPlanFromUrl();

    // Check for impersonation token
    const params = new URLSearchParams(window.location.search);
    const impersonatedToken = params.get('impersonated_token');
    const oauthError =
      params.get('error_description') || params.get('error') || null;
    const authAction = params.get('auth');

    if (impersonatedToken) {
      await handleImpersonation(supabase, impersonatedToken);
      return;
    }

    if (oauthError) {
      const decoded = oauthError ? decodeURIComponent(oauthError) : oauthError;
      showFeedback(
        decoded ||
          'Sign-in did not complete. Please try again or use Email OTP.',
        'error'
      );
    }

    // Check if user already has active session
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user) {
      await ensureLearnerProfile(supabase, session.user);
      window.location.replace(getRedirectTarget());
      return;
    }

    if (authAction === 'google') {
      try {
        // Remove the auth action from the URL to avoid retrigger loops.
        params.delete('auth');
        const cleaned = new URL(window.location.href);
        cleaned.search = params.toString() ? `?${params.toString()}` : '';
        window.history.replaceState({}, '', cleaned.toString());
      } catch (error) {
        console.warn('[Auth] Unable to clean auth action from URL', error);
      }
      await handleGoogleSignIn(supabase);
      return;
    }

    // Check if user was logged out for a specific reason
    try {
      const logoutReason = window.sessionStorage.getItem(
        'an.auth.logout_reason'
      );
      if (logoutReason) {
        window.sessionStorage.removeItem('an.auth.logout_reason');
        if (logoutReason === 'session_replaced') {
          showFeedback(
            'You were signed out because you signed in on another device. Please sign in again.',
            'info'
          );
        }
      }
    } catch (e) {
      console.warn('[Auth] Unable to check logout reason', e);
    }

    // Set up auth state listener
    supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        ensureLearnerProfile(supabase, session.user).finally(() => {
          window.location.replace(getRedirectTarget());
        });
      }
    });

    // Set up form submission handler
    if (loginForm) {
      loginForm.addEventListener('submit', (event) =>
        handleLogin(event, supabase)
      );
    } else {
      console.error('[Auth] Login form not found');
      showFeedback('Login form not found. Please refresh the page.');
    }

    if (googleSignInBtn) {
      googleSignInBtn.addEventListener('click', () => handleGoogleSignIn(supabase));
    }

    if (otpRequestForm) {
      otpRequestForm.addEventListener('submit', (event) =>
        handleOtpRequest(event, supabase)
      );
    }

    if (otpVerifyForm) {
      otpVerifyForm.addEventListener('submit', (event) =>
        handleOtpVerify(event, supabase)
      );
    }

    if (resendOtpBtn) {
      resendOtpBtn.addEventListener('click', () => handleOtpResend(supabase));
    }

    if (otpCodeInput) {
      otpCodeInput.addEventListener('input', () => {
        otpCodeInput.value = normalizeOtpCode(otpCodeInput.value);
      });
    }
  } catch (error) {
    console.error('[Auth] Initialization failed:', error);
    showFeedback(
      'Unable to initialize authentication. Please reload the page.'
    );
    setLoading(false);
  }
}

// Start initialization
init();

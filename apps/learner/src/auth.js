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
const quickAuthOptionsEl = document.getElementById('quickAuthOptions');
const authChooserEl = document.getElementById('authChooser');
const authBackBtn = document.querySelector('[data-role="auth-back"]');
const chooseWhatsAppBtn = document.querySelector(
  '[data-role="choose-whatsapp"]'
);
const chooseGoogleBtn = document.querySelector('[data-role="choose-google"]');
const choosePasswordBtn = document.querySelector(
  '[data-role="choose-password"]'
);
const authWhatsAppOptionEl = document.querySelector(
  '[data-role="auth-whatsapp-option"]'
);
const authGoogleOptionEl = document.querySelector(
  '[data-role="auth-google-option"]'
);
const authDividerEl = document.querySelector('[data-role="auth-divider"]');
const authLoginFormEl = document.querySelector('[data-role="auth-login-form"]');

const whatsappRequestForm = document.getElementById('whatsappRequestForm');
const whatsappVerifyForm = document.getElementById('whatsappVerifyForm');
const whatsappPhoneInput = document.getElementById('whatsappPhone');
const whatsappCodeInput = document.getElementById('whatsappCode');
const whatsappSendBtn = document.getElementById('whatsappSendBtn');
const whatsappVerifyBtn = document.getElementById('whatsappVerifyBtn');
const whatsappResendBtn = document.getElementById('whatsappResendBtn');

// Email OTP elements (currently hidden/unused, kept for backwards compatibility)
const otpRequestForm = document.getElementById('otpRequestForm');
const otpVerifyForm = document.getElementById('otpVerifyForm');
const otpEmailInput = document.getElementById('otpEmail');
const otpCodeInput = document.getElementById('otpCode');
const resendOtpBtn = document.getElementById('resendOtpBtn');

const whatsappCompleteSection = document.getElementById(
  'whatsappCompleteSection'
);
const whatsappCompleteForm = document.getElementById('whatsappCompleteForm');
const waFirstNameInput = document.getElementById('waFirstName');
const waLastNameInput = document.getElementById('waLastName');
const waSchoolNameInput = document.getElementById('waSchoolName');
const waEmailInput = document.getElementById('waEmail');
const waEmailHelp = document.getElementById('waEmailHelp');
const waCompleteBtn = document.getElementById('waCompleteBtn');

// ============================================================================
// CONSTANTS
// ============================================================================
const DASHBOARD_URL = 'admin-board.html';
const MIN_USERNAME_LENGTH = 3;
const MIN_PASSWORD_LENGTH = 6;
const USERNAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
const OTP_CODE_PATTERN = /^[0-9]{6}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NIGERIA_COUNTRY_CODE = '+234';
const WHATSAPP_SEND_COOLDOWN_SECONDS = 30;
const COOLDOWN_TIMER_PROP = '__cooldownTimerId';

let pendingWhatsAppPhone = '';
let blockAutoRedirect = false;

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

function showWhatsAppCompletionForm({ profile, phone }) {
  if (!whatsappCompleteSection || !whatsappCompleteForm) return false;

  blockAutoRedirect = true;

  try {
    authChooserEl?.classList.add('hidden');
    authBackBtn?.classList.add('hidden');
    quickAuthOptionsEl?.classList.add('hidden');
    loginForm?.classList.add('hidden');
    whatsappCompleteSection.classList.remove('hidden');
    whatsappCompleteSection.setAttribute('aria-hidden', 'false');
  } catch (error) {
    console.warn('[Auth] Unable to reveal WhatsApp completion form', error);
  }

  const existingEmail = String(profile?.email || '').trim();

  if (waFirstNameInput) waFirstNameInput.value = profile?.first_name || '';
  if (waLastNameInput) waLastNameInput.value = profile?.last_name || '';
  if (waSchoolNameInput) waSchoolNameInput.value = profile?.school_name || '';

  if (waEmailInput) {
    waEmailInput.value = existingEmail || '';
    const lockEmail = !!existingEmail;
    waEmailInput.disabled = lockEmail;
    if (waEmailInput.dataset) {
      waEmailInput.dataset.locked = lockEmail ? 'true' : 'false';
    }
    waEmailInput.required = !lockEmail;
    if (waEmailHelp) {
      waEmailHelp.classList.toggle('hidden', !lockEmail);
    }
  }

  pendingWhatsAppPhone = phone || pendingWhatsAppPhone || '';
  waFirstNameInput?.focus?.();
  return true;
}

function setAuthSurface(surface, { authMode = 'login' } = {}) {
  const isSignup = authMode === 'signup';
  const normalizedSurface =
    isSignup && surface === 'password' ? 'chooser' : surface;

  choosePasswordBtn?.classList.toggle('hidden', isSignup);

  const showChooser = normalizedSurface === 'chooser';
  const showWhatsApp = normalizedSurface === 'whatsapp';
  const showGoogle = normalizedSurface === 'google';
  const showPassword = normalizedSurface === 'password';

  authChooserEl?.classList.toggle('hidden', !showChooser);
  authBackBtn?.classList.toggle('hidden', showChooser);

  if (authDividerEl) authDividerEl.classList.add('hidden');

  if (quickAuthOptionsEl) {
    // For password, the flow is the form below, so hide this container.
    const showQuickOptions = !showChooser && !showPassword;
    quickAuthOptionsEl.classList.toggle('hidden', !showQuickOptions);
  }

  authWhatsAppOptionEl?.classList.toggle('hidden', !showWhatsApp);
  authGoogleOptionEl?.classList.toggle('hidden', !showGoogle);
  authLoginFormEl?.classList.toggle('hidden', !showPassword);
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
  const buttons = [
    chooseWhatsAppBtn,
    chooseGoogleBtn,
    choosePasswordBtn,
    googleSignInBtn,
    whatsappSendBtn,
    whatsappVerifyBtn,
    whatsappResendBtn,
    waCompleteBtn,
  ].filter(Boolean);
  buttons.forEach((btn) => {
    const cooldown =
      btn === whatsappSendBtn || btn === whatsappResendBtn
        ? isCooldownActive(btn)
        : false;
    btn.disabled = isLoading || cooldown;
    btn.classList.toggle('opacity-60', isLoading || cooldown);
  });

  if (whatsappPhoneInput) whatsappPhoneInput.disabled = isLoading;
  if (whatsappCodeInput) whatsappCodeInput.disabled = isLoading;
  if (waFirstNameInput) waFirstNameInput.disabled = isLoading;
  if (waLastNameInput) waLastNameInput.disabled = isLoading;
  if (waSchoolNameInput) waSchoolNameInput.disabled = isLoading;
  if (waEmailInput) {
    const locked = waEmailInput.dataset?.locked === 'true';
    waEmailInput.disabled = locked || isLoading;
  }

  if (
    whatsappSendBtn &&
    phase === 'request' &&
    !isCooldownActive(whatsappSendBtn)
  ) {
    whatsappSendBtn.textContent = isLoading ? 'Sending…' : 'Send code';
  }
  if (whatsappVerifyBtn && phase === 'verify') {
    whatsappVerifyBtn.textContent = isLoading ? 'Verifying…' : 'Verify';
  }
  if (
    whatsappResendBtn &&
    phase === 'resend' &&
    !isCooldownActive(whatsappResendBtn)
  ) {
    whatsappResendBtn.textContent = isLoading ? 'Resending…' : 'Resend code';
  }
  if (waCompleteBtn && phase === 'complete') {
    waCompleteBtn.textContent = isLoading ? 'Saving…' : 'Save and continue';
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

function normalizeNigeriaPhone(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  // Keep a leading +, strip everything else to digits.
  let cleaned = raw.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('00')) {
    cleaned = `+${cleaned.slice(2)}`;
  }

  if (cleaned.startsWith('+')) {
    const digits = cleaned.slice(1).replace(/\D/g, '');
    return `+${digits}`;
  }

  const digits = cleaned.replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('234')) return `+${digits}`;
  if (digits.startsWith('0'))
    return `${NIGERIA_COUNTRY_CODE}${digits.slice(1)}`;
  if (digits.length === 10) return `${NIGERIA_COUNTRY_CODE}${digits}`;

  return `${NIGERIA_COUNTRY_CODE}${digits}`;
}

function isPlausibleE164(phone) {
  return /^\+[1-9][0-9]{8,14}$/.test(String(phone || ''));
}

function isCooldownActive(button) {
  const until = Number(button?.dataset?.cooldownUntil || 0);
  return Number.isFinite(until) && until > Date.now();
}

function startCooldown(button, seconds, { doneText, prefixText } = {}) {
  if (!button) return;

  if (button[COOLDOWN_TIMER_PROP]) {
    window.clearInterval(button[COOLDOWN_TIMER_PROP]);
    button[COOLDOWN_TIMER_PROP] = null;
  }

  const original =
    button.dataset?.originalText || button.textContent || doneText || 'Send';
  if (button.dataset && !button.dataset.originalText) {
    button.dataset.originalText = original;
  }

  const cooldownUntil = Date.now() + seconds * 1000;
  if (button.dataset) {
    button.dataset.cooldownUntil = String(cooldownUntil);
  }

  const prefix = prefixText || 'Send again in';

  const tick = () => {
    const remaining = Math.ceil((cooldownUntil - Date.now()) / 1000);
    if (remaining <= 0) {
      if (button.dataset) {
        delete button.dataset.cooldownUntil;
      }
      button.disabled = false;
      button.classList.remove('opacity-60');
      button.textContent = original;
      return false;
    }
    button.disabled = true;
    button.classList.add('opacity-60');
    button.textContent = `${prefix} ${remaining}s`;
    return true;
  };

  tick();
  const timer = window.setInterval(() => {
    const keep = tick();
    if (!keep) {
      window.clearInterval(timer);
      if (button[COOLDOWN_TIMER_PROP] === timer) {
        button[COOLDOWN_TIMER_PROP] = null;
      }
    }
  }, 1000);
  button[COOLDOWN_TIMER_PROP] = timer;
}

function startWhatsAppOtpCooldown(seconds = WHATSAPP_SEND_COOLDOWN_SECONDS) {
  startCooldown(whatsappSendBtn, seconds, {
    doneText: 'Send code',
    prefixText: 'Send again in',
  });
  startCooldown(whatsappResendBtn, seconds, {
    doneText: 'Resend code',
    prefixText: 'Resend in',
  });
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
    full_name: fullName || null,
    first_name: metadata.first_name || firstName || null,
    last_name: metadata.last_name || lastName || null,
    phone: metadata.phone || null,
    last_seen_at: new Date().toISOString(),
  };
  if (user.email) {
    updates.email = user.email;
  }

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
        ? 'This email already has an account. Sign in with username + password (or WhatsApp OTP), then connect Google from Profile & security.'
        : error?.message || 'Unable to start Google sign-in. Please try again.';
    showFeedback(msg);
  } finally {
    setOtpLoading(false, { phase: 'request' });
  }
}

function showOtpVerification() {
  whatsappVerifyForm?.classList.remove('hidden');
  whatsappResendBtn?.classList.remove('hidden');
  whatsappCodeInput?.focus();
}

function normalizeOtpCode(value) {
  return String(value || '')
    .replace(/\D/g, '')
    .slice(0, 6);
}

async function fetchOwnProfile(supabase, userId) {
  if (!supabase || !userId) return null;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, full_name, phone, school_name')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  } catch (error) {
    console.warn('[Auth] Unable to load profile', error);
    return null;
  }
}

function needsWhatsAppCompletion(profile) {
  const email = String(profile?.email || '').trim();
  const first = String(profile?.first_name || '').trim();
  const last = String(profile?.last_name || '').trim();
  const school = String(profile?.school_name || '').trim();
  return !email || !first || !last || !school;
}

async function handleWhatsAppRequest(event, supabase, { mode }) {
  event.preventDefault();
  clearFeedback();

  setAuthSurface('whatsapp', { showSwitcher: mode !== 'signup' });

  const phone = normalizeNigeriaPhone(whatsappPhoneInput?.value);
  if (!phone || !isPlausibleE164(phone) || !phone.startsWith('+234')) {
    showFeedback('Enter a valid Nigerian WhatsApp number.');
    whatsappPhoneInput?.focus();
    return;
  }

  pendingWhatsAppPhone = phone;
  setOtpLoading(true, { phase: 'request' });

  try {
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: {
        channel: 'whatsapp',
        shouldCreateUser: mode === 'signup',
      },
    });

    if (error) throw error;

    startWhatsAppOtpCooldown();

    showFeedback('We sent a 6-digit code to your WhatsApp.', 'info');
    showOtpVerification();
  } catch (error) {
    console.error('[Auth] WhatsApp OTP send failed', error);
    const msg =
      mode === 'signup'
        ? 'Unable to send code. Please try again.'
        : 'This number is not linked yet. Sign in with username/password or Google, then add WhatsApp in your profile.';
    showFeedback(error?.message || msg);
  } finally {
    setOtpLoading(false, { phase: 'request' });
  }
}

async function handleWhatsAppVerify(event, supabase, { mode }) {
  event.preventDefault();
  clearFeedback();

  blockAutoRedirect = true;
  setAuthSurface('whatsapp', { showSwitcher: mode !== 'signup' });

  const phone =
    pendingWhatsAppPhone || normalizeNigeriaPhone(whatsappPhoneInput?.value);
  const token = normalizeOtpCode(whatsappCodeInput?.value);

  if (!phone || !isPlausibleE164(phone)) {
    showFeedback('Enter your WhatsApp number again.');
    whatsappPhoneInput?.focus();
    return;
  }

  if (!OTP_CODE_PATTERN.test(token)) {
    showFeedback('Enter the 6-digit code from WhatsApp.');
    whatsappCodeInput?.focus();
    return;
  }

  setOtpLoading(true, { phase: 'verify' });
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms',
    });

    if (error) throw error;

    await ensureLearnerProfile(supabase, data?.user || null);

    // Store verified phone on profile (Supabase Auth phone may not be set for all users).
    try {
      await supabase
        .from('profiles')
        .update({ phone, phone_verified_at: new Date().toISOString() })
        .eq('id', data?.user?.id);
    } catch (profilePhoneError) {
      console.warn(
        '[Auth] Unable to persist phone on profile',
        profilePhoneError
      );
    }

    const profile = await fetchOwnProfile(supabase, data?.user?.id);
    const shouldComplete =
      mode === 'signup' ? true : needsWhatsAppCompletion(profile);

    if (shouldComplete) {
      showFeedback('Almost done. Please complete your details.', 'info');
      showWhatsAppCompletionForm({ profile, phone });
      return;
    }

    showFeedback('Signed in successfully. Redirecting…', 'success');
    window.setTimeout(() => {
      window.location.replace(getRedirectTarget());
    }, 350);
  } catch (error) {
    console.error('[Auth] WhatsApp OTP verification failed', error);
    showFeedback(
      error?.message ||
        'Unable to verify the code. Please request a new code and try again.'
    );
  } finally {
    setOtpLoading(false, { phase: 'verify' });
  }
}

async function handleWhatsAppResend(supabase, { mode }) {
  clearFeedback();
  setOtpLoading(true, { phase: 'resend' });
  try {
    const phone =
      pendingWhatsAppPhone || normalizeNigeriaPhone(whatsappPhoneInput?.value);
    if (!phone || !isPlausibleE164(phone) || !phone.startsWith('+234')) {
      showFeedback('Enter your Nigerian WhatsApp number first.');
      whatsappPhoneInput?.focus();
      return;
    }

    pendingWhatsAppPhone = phone;
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: {
        channel: 'whatsapp',
        shouldCreateUser: mode === 'signup',
      },
    });
    if (error) throw error;

    startWhatsAppOtpCooldown();

    showFeedback('A new code has been sent to WhatsApp.', 'info');
  } catch (error) {
    console.error('[Auth] WhatsApp OTP resend failed', error);
    showFeedback(
      error?.message || 'Unable to resend the code right now. Please try again.'
    );
  } finally {
    setOtpLoading(false, { phase: 'resend' });
  }
}

async function handleWhatsAppCompletionSubmit(
  event,
  supabase,
  { mode: _mode }
) {
  event.preventDefault();
  clearFeedback();

  blockAutoRedirect = true;

  const firstName = String(waFirstNameInput?.value || '').trim();
  const lastName = String(waLastNameInput?.value || '').trim();
  const schoolName = String(waSchoolNameInput?.value || '').trim();
  const email = String(waEmailInput?.value || '')
    .trim()
    .toLowerCase();
  const phone =
    pendingWhatsAppPhone || normalizeNigeriaPhone(whatsappPhoneInput?.value);
  const emailLocked = waEmailInput?.dataset?.locked === 'true';

  if (!firstName) {
    showFeedback('Enter your first name.');
    waFirstNameInput?.focus();
    return;
  }
  if (!lastName) {
    showFeedback('Enter your last name.');
    waLastNameInput?.focus();
    return;
  }
  if (!schoolName) {
    showFeedback('Enter your school name.');
    waSchoolNameInput?.focus();
    return;
  }

  if (!emailLocked) {
    if (!email || !EMAIL_PATTERN.test(email)) {
      showFeedback('Enter a valid email address.');
      waEmailInput?.focus();
      return;
    }
  }

  setOtpLoading(true, { phase: 'complete' });
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      throw new Error('Session expired. Please sign in again.');
    }

    const fullName = `${firstName} ${lastName}`.trim();
    const payload = {
      full_name: fullName,
      first_name: firstName,
      last_name: lastName,
      school_name: schoolName,
      ...(emailLocked ? {} : { email }),
      ...(phone && isPlausibleE164(phone) ? { phone } : {}),
    };

    const { error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', userId);
    if (error) throw error;

    showFeedback('Saved. Redirecting…', 'success');
    window.setTimeout(() => {
      window.location.replace(getRedirectTarget());
    }, 350);
  } catch (error) {
    console.error('[Auth] WhatsApp completion submit failed', error);
    showFeedback(
      error?.message || 'Unable to save right now. Please try again.'
    );
  } finally {
    setOtpLoading(false, { phase: 'complete' });
  }
}

async function handleOtpRequest(event, supabase) {
  event.preventDefault();
  clearFeedback();

  const email = String(otpEmailInput?.value || '')
    .trim()
    .toLowerCase();
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

  const email = String(otpEmailInput?.value || '')
    .trim()
    .toLowerCase();
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
    const email = String(otpEmailInput?.value || '')
      .trim()
      .toLowerCase();
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
    const authMode = params.get('mode') === 'signup' ? 'signup' : 'login';
    const requestedSurface =
      authAction === 'whatsapp' ||
      authAction === 'google' ||
      authAction === 'password'
        ? authAction
        : 'chooser';
    const initialSurface =
      authMode === 'signup' && requestedSurface === 'password'
        ? 'chooser'
        : requestedSurface;
    const shouldStartGoogle = authAction === 'google';

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

    if (shouldStartGoogle) {
      try {
        // Remove the auth action from the URL to avoid retrigger loops.
        params.delete('auth');
        const cleaned = new URL(window.location.href);
        cleaned.search = params.toString() ? `?${params.toString()}` : '';
        window.history.replaceState({}, '', cleaned.toString());
      } catch (error) {
        console.warn('[Auth] Unable to clean auth action from URL', error);
      }
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
    } catch (error) {
      console.warn('[Auth] Unable to check logout reason', error);
    }

    setAuthSurface(initialSurface, { authMode });

    // Set up auth state listener
    supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        ensureLearnerProfile(supabase, session.user).finally(() => {
          if (blockAutoRedirect) return;
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
      googleSignInBtn.addEventListener('click', () =>
        handleGoogleSignIn(supabase)
      );
    }

    chooseWhatsAppBtn?.addEventListener('click', () => {
      clearFeedback();
      setAuthSurface('whatsapp', { authMode });
      try {
        whatsappPhoneInput?.focus();
        whatsappPhoneInput?.scrollIntoView?.({
          behavior: 'smooth',
          block: 'center',
        });
      } catch (error) {
        console.warn('[Auth] Unable to focus WhatsApp sign-in', error);
      }
    });

    choosePasswordBtn?.addEventListener('click', () => {
      clearFeedback();
      setAuthSurface('password', { authMode });
      try {
        usernameInput?.focus();
        usernameInput?.scrollIntoView?.({
          behavior: 'smooth',
          block: 'center',
        });
      } catch (error) {
        console.warn('[Auth] Unable to focus password sign-in', error);
      }
    });

    chooseGoogleBtn?.addEventListener('click', async () => {
      clearFeedback();
      setAuthSurface('google', { authMode });
      await handleGoogleSignIn(supabase);
    });

    authBackBtn?.addEventListener('click', () => {
      clearFeedback();
      setAuthSurface('chooser', { authMode });
    });

    if (whatsappRequestForm) {
      whatsappRequestForm.addEventListener('submit', (event) =>
        handleWhatsAppRequest(event, supabase, { mode: authMode })
      );
    }

    if (whatsappVerifyForm) {
      whatsappVerifyForm.addEventListener('submit', (event) =>
        handleWhatsAppVerify(event, supabase, { mode: authMode })
      );
    }

    if (whatsappResendBtn) {
      whatsappResendBtn.addEventListener('click', () =>
        handleWhatsAppResend(supabase, { mode: authMode })
      );
    }

    if (whatsappCodeInput) {
      whatsappCodeInput.addEventListener('input', () => {
        whatsappCodeInput.value = normalizeOtpCode(whatsappCodeInput.value);
      });
    }

    if (whatsappCompleteForm) {
      whatsappCompleteForm.addEventListener('submit', (event) =>
        handleWhatsAppCompletionSubmit(event, supabase, { mode: authMode })
      );
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

    if (initialSurface === 'whatsapp') {
      try {
        whatsappPhoneInput?.focus();
        whatsappPhoneInput?.scrollIntoView?.({
          behavior: 'smooth',
          block: 'center',
        });
      } catch (error) {
        console.warn('[Auth] Unable to focus WhatsApp sign-in', error);
      }
    }

    if (initialSurface === 'password') {
      try {
        usernameInput?.focus();
      } catch (error) {
        console.warn('[Auth] Unable to focus password sign-in', error);
      }
    }

    if (shouldStartGoogle) {
      await handleGoogleSignIn(supabase);
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

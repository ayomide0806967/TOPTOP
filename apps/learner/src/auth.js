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

// ============================================================================
// CONSTANTS
// ============================================================================
const DASHBOARD_URL = 'admin-board.html';
const MIN_USERNAME_LENGTH = 3;
const MIN_PASSWORD_LENGTH = 6;
const USERNAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

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

// ============================================================================
// AUTHENTICATION FUNCTIONS
// ============================================================================

/**
 * Get user email from username by querying profiles table
 * @param {Object} supabase - Supabase client
 * @param {string} username - Username to lookup
 * @returns {Promise<{email: string | null, error?: string}>}
 */
async function getEmailFromUsername(supabase, username) {
  try {
    const normalizedUsername = username.toLowerCase().trim();

    const { data, error } = await supabase.functions.invoke('lookup-username', {
      body: { username: normalizedUsername },
    });

    if (error) {
      console.error('[Auth] lookup-username error:', error);
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
        error: 'Username not found. Please check your username and try again.',
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
    console.error('[Auth] Unexpected error in getEmailFromUsername:', error);
    return {
      email: null,
      error: 'An unexpected error occurred. Please try again.',
    };
  }
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
      window.location.replace(DASHBOARD_URL);
    }, 500);
  } catch (error) {
    console.error('[Auth] Unexpected error during login:', error);
    showFeedback('An unexpected error occurred. Please try again.');
    setLoading(false);
  }
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Check if user already has an active session
 * @param {Object} supabase - Supabase client
 * @returns {Promise<boolean>} - True if user has active session
 */
async function checkExistingSession(supabase) {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return !!session?.user;
  } catch (error) {
    console.error('[Auth] Error checking session:', error);
    return false;
  }
}

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

    // Check for impersonation token
    const params = new URLSearchParams(window.location.search);
    const impersonatedToken = params.get('impersonated_token');

    if (impersonatedToken) {
      await handleImpersonation(supabase, impersonatedToken);
      return;
    }

    // Check if user already has active session
    const hasSession = await checkExistingSession(supabase);
    if (hasSession) {
      window.location.replace(DASHBOARD_URL);
      return;
    }

    // Set up auth state listener
    supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        window.location.replace(DASHBOARD_URL);
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

import { getSupabaseClient } from '../../shared/supabaseClient.js';

const formEl = document.getElementById('resetPasswordForm');
const feedbackEl = document.getElementById('form-feedback');
const submitBtn = formEl?.querySelector('[data-role="submit"]');
const submitText = formEl?.querySelector('[data-role="submit-text"]');
const formContainer = document.getElementById('form-container');
const successContainer = document.getElementById('success-message');

const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirm-password');

let supabasePromise = null;

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

function setLoading(isLoading) {
  if (!submitBtn || !submitText) return;
  submitBtn.disabled = isLoading;
  submitBtn.classList.toggle('opacity-60', isLoading);
  submitText.textContent = isLoading ? 'Saving…' : 'Save new password';
}

async function handleFormSubmit(event) {
  event.preventDefault();
  showFeedback('', 'success'); // Clear feedback
  setLoading(true);

  try {
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (password !== confirmPassword) {
      throw new Error('Passwords do not match.');
    }

    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long.');
    }

    const supabase = await ensureSupabaseClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      throw error;
    }

    if (formContainer && successContainer) {
      formContainer.classList.add('hidden');
      successContainer.classList.remove('hidden');
    }

  } catch (error) {
    showFeedback(error.message || 'An unexpected error occurred.');
  } finally {
    setLoading(false);
  }
}

async function initialise() {
  const supabase = await ensureSupabaseClient();
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      // The user is in the password recovery flow
      if (formEl) {
        formEl.addEventListener('submit', handleFormSubmit);
      }
    } else if (!session) {
      // If there is no session, redirect to login
      window.location.replace('login.html');
    }
  });
}

initialise();

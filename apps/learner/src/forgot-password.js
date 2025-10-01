import { getSupabaseClient } from '../../shared/supabaseClient.js';

const formEl = document.getElementById('forgotPasswordForm');
const feedbackEl = document.getElementById('form-feedback');
const submitBtn = formEl?.querySelector('[data-role="submit"]');
const submitText = formEl?.querySelector('[data-role="submit-text"]');
const formContainer = document.getElementById('form-container');
const successContainer = document.getElementById('success-message');

const emailInput = document.getElementById('email-address');

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

function clearFeedback() {
  if (!feedbackEl) return;
  feedbackEl.textContent = '';
  feedbackEl.classList.add('hidden');
}

function setLoading(isLoading) {
  if (!submitBtn || !submitText) return;
  submitBtn.disabled = isLoading;
  submitBtn.classList.toggle('opacity-60', isLoading);
  submitText.textContent = isLoading ? 'Sending…' : 'Send reset link';
}

function showSuccessState() {
  if (formContainer) {
    formContainer.classList.add('hidden');
  }
  if (successContainer) {
    successContainer.classList.remove('hidden');
  }
}

async function handleFormSubmit(event) {
  event.preventDefault();
  clearFeedback();
  setLoading(true);

  try {
    const email = emailInput.value.trim().toLowerCase();
    if (!email) {
      throw new Error('Please enter your email address.');
    }

    const supabase = await ensureSupabaseClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: new URL('reset-password.html', window.location.origin).toString(),
    });

    if (error) {
      const message = (error.message || '').toLowerCase();

      // Avoid leaking whether an email exists. Treat "not found" responses as success.
      if (message.includes('not found')) {
        console.warn('[Forgot Password] Email not found; returning generic success response.');
        showSuccessState();
        return;
      }

      throw error;
    }

    showSuccessState();

  } catch (error) {
    showFeedback(error.message || 'An unexpected error occurred.');
  } finally {
    setLoading(false);
  }
}

if (formEl) {
  formEl.addEventListener('submit', handleFormSubmit);
}

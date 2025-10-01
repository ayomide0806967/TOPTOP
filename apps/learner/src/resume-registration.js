import { getSupabaseClient } from '../../shared/supabaseClient.js';

const formEl = document.getElementById('resumeForm');
const feedbackEl = document.getElementById('form-feedback');
const submitBtn = formEl?.querySelector('[data-role="submit"]');
const submitText = formEl?.querySelector('[data-role="submit-text"]');

const emailInput = document.getElementById('email-address');
const firstNameInput = document.getElementById('first-name');
const lastNameInput = document.getElementById('last-name');
const phoneInput = document.getElementById('phone-number');

let supabasePromise = null;

function ensureSupabaseClient() {
  if (!supabasePromise) {
    supabasePromise = getSupabaseClient();
  }
  return supabasePromise;
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
      console.warn('[Resume Registration] Failed to parse function error', parseError);
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
  submitText.textContent = isLoading ? 'Searching…' : 'Find registration';
}

async function handleFormSubmit(event) {
  event.preventDefault();
  clearFeedback();
  setLoading(true);

  try {
    const email = emailInput.value.trim().toLowerCase();
    const firstName = firstNameInput.value.trim();
    const lastName = lastNameInput.value.trim();
    const phone = phoneInput.value.trim();

    if (!email || !firstName || !lastName || !phone) {
      throw new Error('Please fill in all fields.');
    }

    console.log('[Resume Registration] Searching for pending registration...');

    const supabase = await ensureSupabaseClient();
    const { data, error } = await supabase.functions.invoke('find-pending-registration', {
      body: { email, firstName, lastName, phone },
    });

    console.log('[Resume Registration] Response:', { data, error });

    if (error) {
      console.error('[Resume Registration] Error:', error);
      const message = await extractFunctionError(
        error,
        'Could not find a matching registration. Please check your details and try again.'
      );
      throw new Error(message);
    }

    if (data?.error) {
      console.error('[Resume Registration] Business error:', data.error);
      throw new Error(data.error);
    }

    if (data?.reference && data?.userId) {
      console.log('[Resume Registration] Found registration with reference:', data.reference);
      
      // Store the data for the next page
      window.localStorage.setItem('postPaymentRegistration', JSON.stringify({
        reference: data.reference,
        email,
        firstName,
        lastName,
        phone,
        userId: data.userId,
      }));

      // Navigate to the after-payment page
      const currentPath = window.location.pathname;
      const newPath = currentPath.replace(
        'resume-registration.html',
        'registration-after-payment.html'
      );
      window.location.href = newPath + '?reference=' + data.reference;
    } else {
      throw new Error('No matching pending registration found. Please check your details and try again.');
    }

  } catch (error) {
    console.error('[Resume Registration] Failed to find registration:', error);
    showFeedback(error.message || 'An unexpected error occurred. Please try again.');
  } finally {
    setLoading(false);
  }
}

if (formEl) {
  formEl.addEventListener('submit', handleFormSubmit);
}

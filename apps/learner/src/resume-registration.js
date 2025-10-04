const formEl = document.getElementById('resumeForm');
const feedbackEl = document.getElementById('form-feedback');
const submitBtn = formEl?.querySelector('[data-role="submit"]');
const submitText = formEl?.querySelector('[data-role="submit-text"]');

function showFeedback(message, type = 'info') {
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
    feedbackEl.classList.add('bg-green-50', 'border-green-200', 'text-green-700');
  } else if (type === 'error') {
    feedbackEl.classList.add('bg-red-50', 'border-red-200', 'text-red-700');
  } else {
    feedbackEl.classList.add('bg-blue-50', 'border-blue-200', 'text-blue-700');
  }
}

if (formEl) {
  showFeedback(
    'Registration now completes in one step. If your payment succeeded, head to the login page and use the username and password you created. Need help? Use the password reset option or contact support.',
    'info'
  );

  if (submitBtn && submitText) {
    submitBtn.disabled = true;
    submitBtn.classList.add('opacity-60', 'cursor-not-allowed');
    submitText.textContent = 'Registration flow updated';
  }
}

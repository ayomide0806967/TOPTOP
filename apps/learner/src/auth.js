import { getSupabaseClient } from '../../shared/supabaseClient.js';

const loginForm = document.getElementById('loginForm');
const feedbackEl = document.querySelector('[data-role="feedback"]');
const submitBtn = document.querySelector('[data-role="submit"]');
const submitText = submitBtn?.querySelector('[data-role="submit-text"]');
const rememberMe = document.getElementById('remember-me');

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
  submitText.textContent = isLoading ? 'Signing in…' : 'Sign in';
}

async function init() {
  const supabase = await getSupabaseClient();

  const params = new URLSearchParams(window.location.search);
  const impersonatedToken = params.get('impersonated_token');

  if (impersonatedToken) {
    const { error } = await supabase.auth.setSession({ access_token: impersonatedToken, refresh_token: '' });
    if (error) {
      showFeedback(error.message, 'error');
    } else {
      window.location.replace('admin-board.html');
    }
    return;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user) {
    window.location.replace('admin-board.html');
    return;
  }

  supabase.auth.onAuthStateChange((_event, value) => {
    if (value?.user) {
      window.location.replace('admin-board.html');
    }
  });

  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFeedback();

    const identifier = document.getElementById('email-address')?.value.trim();
    const password = document.getElementById('password')?.value;

    if (!identifier || !password) {
      showFeedback('Provide both username (or email) and password.');
      return;
    }

    setLoading(true);

    try {
      let signInEmail = identifier;
      if (!identifier.includes('@')) {
        const { data, error: profileError } = await supabase
          .from('profiles')
          .select('email')
          .eq('username', identifier)
          .maybeSingle();

        if (profileError && profileError.code !== 'PGRST116') {
          throw profileError;
        }

        if (!data?.email) {
          showFeedback(
            'We could not find an account with that username. Try your email instead.'
          );
          setLoading(false);
          return;
        }

        signInEmail = data.email;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: signInEmail,
        password,
      });
      if (error) {
        showFeedback(error.message || 'Unable to sign in.');
        setLoading(false);
        return;
      }

      if (!rememberMe?.checked) {
        // force session to expire with default settings; no action needed.
      }

      showFeedback('Signed in successfully. Redirecting…', 'success');
      // Supabase auth state listener will redirect, but add fallback.
      setTimeout(() => {
        window.location.replace('admin-board.html');
      }, 500);
    } catch (error) {
      console.error('[Learner Auth] Sign-in failed', error);
      showFeedback('Unexpected error occurred while signing in.');
      setLoading(false);
    }
  });
}

init().catch((error) => {
  console.error('[Learner Auth] Initialisation failed', error);
  showFeedback(
    'Unable to initialise authentication. Reload the page and try again.'
  );
  setLoading(false);
});

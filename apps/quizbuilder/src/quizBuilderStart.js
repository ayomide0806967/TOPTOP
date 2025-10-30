import { authService } from '../../shared/auth.js';
import { getSupabaseClient } from '../../shared/supabaseClient.js';

const INFO = document.getElementById('info');
const ERROR = document.getElementById('error');
const STEP_CONTAINER = document.getElementById('qb-steps');

function setStep(index) {
  if (!STEP_CONTAINER) return;
  STEP_CONTAINER.querySelectorAll('[data-step]')?.forEach((el) => {
    const s = Number(el.getAttribute('data-step'));
    if (s === index) {
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  });
  // Progress UI
  STEP_CONTAINER.querySelectorAll('[data-step-dot]')?.forEach((dot) => {
    const s = Number(dot.getAttribute('data-step-dot'));
    dot.classList.toggle('bg-cyan-600', s <= index);
    dot.classList.toggle('bg-slate-200', s > index);
    dot.classList.toggle('text-white', s <= index);
    dot.classList.toggle('text-slate-500', s > index);
  });
}

function show(el, message) {
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
}

function hide(el) {
  if (!el) return;
  el.textContent = '';
  el.classList.add('hidden');
}

function saveIntent(intent) {
  try {
    sessionStorage.setItem('quiz_builder_plan_intent', JSON.stringify(intent));
  } catch (_) {}
}

function readIntent() {
  try {
    const raw = sessionStorage.getItem('quiz_builder_plan_intent');
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function clearIntent() {
  try { sessionStorage.removeItem('quiz_builder_plan_intent'); } catch (_) {}
}

function goToInstructorDashboard() {
  // Use the instructor portal entry point
  window.location.href = './instructor.html#dashboard';
}

function goToLoginWithRedirect() {
  // Delegate login to the main CBT (Learner) app
  const returnTo = '/apps/quizbuilder/quiz-builder-start.html';
  window.location.href = `../learner/login.html?returnTo=${encodeURIComponent(returnTo)}`;
}

// Google OAuth is no longer initiated from Quiz Builder.

async function fetchSeatUsage() {
  try {
    const response = await fetch('/api/instructor/dashboard/metrics', {
      headers: authService.getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to load seat usage');
    const metrics = await response.json();
    return metrics?.subscriptionUsage || null;
  } catch (error) {
    return null;
  }
}

async function initiateSeatUpgrade(additionalSeats) {
  if (!additionalSeats || additionalSeats <= 0) return null;
  // Prefer invoking the Supabase Edge Function with Authorization header from our app token
  const client = await getSupabaseClient();
  const { data, error } = await client.functions.invoke('quiz-seat-upgrade', {
    body: { additionalSeats },
    headers: authService.getAuthHeaders(),
  });
  if (error) throw error;
  return data;
}

async function processIntentIfAny() {
  const intent = readIntent();
  if (!intent) return; // nothing to do

  if (!authService.isAuthenticated()) {
    // Try exchanging Supabase session for app token automatically
    try {
      const supabase = await getSupabaseClient();
      const { data } = await supabase.auth.getSession();
      if (data?.session?.access_token) {
        const { data: exchanged, error } = await supabase.functions.invoke('app-token', {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        });
        if (!error && exchanged?.token) {
          authService.setSession(exchanged.token, exchanged.user);
        }
      }
    } catch (_) {}
    if (!authService.isAuthenticated()) {
      // Fall back to email login if still not authenticated
      goToLoginWithRedirect();
      return;
    }
  }

  if (intent.type === 'free') {
    clearIntent();
    goToInstructorDashboard();
    return;
  }

  if (intent.type === 'paid') {
    try {
      hide(ERROR);
      show(INFO, 'Preparing secure checkout…');

      // If seat usage exists, compute only the top-up needed
      const usage = await fetchSeatUsage();
      const currentCapacity = Number(usage?.maxStudents || usage?.seat_count || 0);
      const desired = Math.max(1, Number(intent.seats || 0));
      // Fallback free tier is 5 seats if we can't read current capacity
      const fallbackFree = 5;
      const additional = usage
        ? Math.max(0, desired - currentCapacity)
        : Math.max(0, desired - fallbackFree);

      const { checkoutUrl } = await initiateSeatUpgrade(additional);
      clearIntent();

      if (checkoutUrl) {
        window.open(checkoutUrl, '_blank', 'noopener');
        show(INFO, 'Checkout opened in a new window. Complete payment to finish. Taking you to your dashboard…');
      } else {
        show(INFO, 'Seat upgrade initiated. Taking you to your dashboard…');
      }

      setTimeout(goToInstructorDashboard, 800);
    } catch (err) {
      hide(INFO);
      show(ERROR, err?.message || 'Unable to start seat upgrade. Please try again.');
    }
  }
}

function bindUI() {
  const nextOverview = document.getElementById('qb-next-overview');
  const backFromPlan = document.getElementById('qb-back-from-plan');
  const chooseFree = document.getElementById('qb-choose-free');
  const choosePaidContinue = document.getElementById('qb-choose-paid');
  const paidSeats = document.getElementById('qb-paid-seats');
  const finishSetup = document.getElementById('qb-finish');

  nextOverview?.addEventListener('click', () => setStep(2));
  backFromPlan?.addEventListener('click', () => setStep(1));

  chooseFree?.addEventListener('click', () => {
    hide(ERROR);
    saveIntent({ type: 'free' });
    processIntentIfAny();
  });

  choosePaidContinue?.addEventListener('click', () => {
    hide(ERROR);
    const seats = Number(paidSeats?.value || '0');
    if (!Number.isFinite(seats) || seats <= 0) {
      show(ERROR, 'Enter the number of participants.');
      return;
    }
    saveIntent({ type: 'paid', seats });
    processIntentIfAny();
  });

  finishSetup?.addEventListener('click', () => {
    processIntentIfAny();
  });
}

// Entry
document.addEventListener('DOMContentLoaded', async () => {
  bindUI();
  setStep(1);
  // If user returned after login, auto-process saved intent
  try {
    // If returning with an active Supabase session, exchange to an app token
    const supabase = await getSupabaseClient();
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token && !authService.isAuthenticated()) {
      const { data: exchanged, error } = await supabase.functions.invoke('app-token', {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });
      if (!error && exchanged?.token) {
        authService.setSession(exchanged.token, exchanged.user);
      }
    }
    await processIntentIfAny();
  } catch (_) {}
});

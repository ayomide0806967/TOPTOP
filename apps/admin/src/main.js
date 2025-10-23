import { AppState } from './state/appState.js';
import { viewRegistry } from './views/index.js';
import { authService } from './services/authService.js';
import { showToast } from './components/toast.js';

function normalizeViewKey(view) {
  if (!view) return null;
  const key = String(view).trim().toLowerCase();
  return viewRegistry[key] ? key : null;
}

function resolveInitialView() {
  try {
    const params = new URLSearchParams(window.location.search);
    const queryView = normalizeViewKey(params.get('view'));
    if (queryView) return queryView;

    const hash = (window.location.hash || '').replace('#', '').trim();
    if (hash) {
      if (hash.startsWith('view=')) {
        const hashView = normalizeViewKey(hash.slice(5));
        if (hashView) return hashView;
      }
      const hashView = normalizeViewKey(hash);
      if (hashView) return hashView;
    }
  } catch (error) {
    console.warn('[Admin] Failed to resolve initial view from URL', error);
  }
  return 'dashboard';
}

function persistViewParam(view) {
  const key = normalizeViewKey(view);
  if (!key) return;
  try {
    const url = new URL(window.location.href);
    if (key === 'dashboard') {
      url.searchParams.delete('view');
    } else {
      url.searchParams.set('view', key);
    }
    window.history.replaceState(null, '', url.toString());
  } catch (error) {
    console.warn('[Admin] Failed to persist view parameter', error);
  }
}

const initialView = resolveInitialView();
const appState = new AppState(initialView);
let mainViewEl;
let breadcrumbEl;
let sidebarEl;
let authOverlayEl;
let authFormEl;
let authMessageEl;
let authMetaEl;
let authErrorEl;
let authSubmitBtn;
let adminNameEl;
let logoutBtn;
let isAuthenticated = false;

const actions = {
  navigate(view, options = {}) {
    appState.setView(view, options);
    persistViewParam(appState.currentView);
  },
  selectDepartment(departmentId) {
    appState.selectDepartment(departmentId);
  },
  selectCourse(courseId) {
    appState.selectCourse(courseId);
  },
  selectTopic(topicId) {
    appState.setView('questions', { topicId });
  },
  clearDepartmentSelection() {
    appState.clearDepartmentSelection();
  },
  openExtraQuestions() {
    appState.setView('extraquestions', { extraQuestionSetId: null });
  },
  selectExtraQuestionSet(setId) {
    appState.setView('extraquestions', { extraQuestionSetId: setId });
  },
  clearExtraQuestionSelection() {
    appState.setView('extraquestions', { extraQuestionSetId: null });
  },
  refresh() {
    render();
  },
};

function breadcrumbForView(view) {
  switch (view) {
    case 'dashboard':
      return 'Dashboard';
    case 'departments':
      return 'Departments';
    case 'slots':
      return 'Study Cycles';
    case 'subscriptions':
      return 'Subscriptions';
    case 'quizbuilder':
      return 'Quiz Builder';
    case 'freequizzes':
      return 'Free Quiz';
    case 'extraquestions':
      return 'Extra Questions';
    case 'users':
      return 'Users';
    default:
      return 'Admin';
  }
}

function setActiveNav(view) {
  document.querySelectorAll('.sidebar-nav-item').forEach((link) => {
    if (link.dataset.view === view) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
}

function showLoading() {
  if (!mainViewEl) return;
  mainViewEl.innerHTML = `
    <div class="h-full flex items-center justify-center">
      <div class="flex flex-col items-center gap-3 text-gray-500">
        <svg class="animate-spin h-6 w-6 text-cyan-600" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
        </svg>
        <p class="text-sm">Loading view...</p>
      </div>
    </div>
  `;
}

function showRenderError(error) {
  console.error('[Admin] Render error', error);
  if (!mainViewEl) return;
  mainViewEl.innerHTML = `
    <div class="bg-red-50 border border-red-200 text-red-700 rounded-lg p-6">
      <h2 class="text-lg font-semibold">Something went wrong</h2>
      <p class="mt-2 text-sm">${error?.message || error || 'Unknown error'}</p>
    </div>
  `;
}

async function render() {
  if (!mainViewEl || !isAuthenticated) return;
  showLoading();
  const viewKey = appState.currentView;
  const viewFactory = viewRegistry[viewKey];
  if (!viewFactory) {
    showRenderError(new Error(`View "${viewKey}" not implemented`));
    return;
  }

  try {
    const view = await viewFactory(appState, actions);
    mainViewEl.innerHTML = `<div class="view-enter">${view.html}</div>`;
    if (typeof view.onMount === 'function') {
      const container = mainViewEl.querySelector('.view-enter') || mainViewEl;
      view.onMount(container, appState, actions);
    }
  } catch (error) {
    showRenderError(error);
    return;
  }

  if (breadcrumbEl) {
    breadcrumbEl.textContent = breadcrumbForView(viewKey);
  }
  setActiveNav(viewKey);
}

function handleSidebarNavigation(event) {
  event.preventDefault();
  const view = event.currentTarget.dataset.view;
  if (!view) return;
  actions.navigate(view);
  if (window.innerWidth < 768) {
    sidebarEl?.classList.add('sidebar-mobile-hidden');
  }
}

function bindSidebarControls() {
  document.querySelectorAll('.sidebar-nav-item').forEach((link) => {
    link.addEventListener('click', handleSidebarNavigation);
  });

  const openBtn = document.getElementById('open-sidebar-btn');
  const closeBtn = document.getElementById('close-sidebar-btn');
  sidebarEl = document.getElementById('sidebar');

  openBtn?.addEventListener('click', () =>
    sidebarEl?.classList.remove('sidebar-mobile-hidden')
  );
  closeBtn?.addEventListener('click', () =>
    sidebarEl?.classList.add('sidebar-mobile-hidden')
  );
}

function showAuthOverlay() {
  if (!authOverlayEl) return;
  authOverlayEl.classList.remove('hidden');
  authOverlayEl.classList.add('flex');
  document.body.classList.add('overflow-hidden');
}

function hideAuthOverlay() {
  if (!authOverlayEl) return;
  authOverlayEl.classList.add('hidden');
  authOverlayEl.classList.remove('flex');
  document.body.classList.remove('overflow-hidden');
  clearAuthError();
  if (authFormEl) {
    authFormEl.reset();
  }
  setAuthSubmitting(false);
}

function setAuthSubmitting(isSubmitting) {
  if (!authSubmitBtn) return;
  authSubmitBtn.disabled = isSubmitting;
  authSubmitBtn.textContent = isSubmitting ? 'Signing in...' : 'Sign In';
}

function clearAuthError() {
  if (authErrorEl) {
    authErrorEl.textContent = '';
    authErrorEl.classList.add('hidden');
  }
}

function showAuthError(message) {
  if (!authErrorEl || !message) return;
  authErrorEl.textContent = message;
  authErrorEl.classList.remove('hidden');
}

function showLoginForm() {
  showAuthOverlay();
  clearAuthError();
  if (authFormEl) {
    authFormEl.classList.remove('hidden');
  }
  if (authMessageEl) {
    authMessageEl.textContent =
      'Sign in with an admin account to manage content.';
  }
  if (authMetaEl) {
    authMetaEl.textContent =
      'Admin access is controlled via Supabase Auth and the profiles table.';
  }
}

function showUnauthorised(state) {
  showAuthOverlay();
  if (authFormEl) {
    authFormEl.classList.add('hidden');
  }
  if (authMessageEl) {
    authMessageEl.textContent = 'This account does not have admin permissions.';
  }
  if (authMetaEl) {
    const email = state?.user?.email || 'Unknown account';
    authMetaEl.textContent = `Signed in as ${email}. Update the profile role to "admin" in Supabase to continue.`;
  }
  showAuthError(
    'Admin role required. Contact the workspace owner to elevate this account.'
  );
}

function showAuthErrorState(error) {
  showAuthOverlay();
  if (authFormEl) {
    authFormEl.classList.add('hidden');
  }
  if (authMessageEl) {
    authMessageEl.textContent = 'Unable to connect to Supabase.';
  }
  if (authMetaEl) {
    authMetaEl.textContent = 'Check your configuration, reload, and try again.';
  }
  showAuthError(error?.message || 'Unexpected authentication error.');
}

function updateAuthUI(state) {
  const status = state?.status || 'error';
  switch (status) {
    case 'authenticated': {
      isAuthenticated = true;
      hideAuthOverlay();
      if (adminNameEl) {
        const displayName =
          state?.profile?.full_name || state?.user?.email || 'Admin';
        adminNameEl.textContent = `Welcome, ${displayName}`;
      }
      render();
      break;
    }
    case 'checking':
    case 'initialising': {
      isAuthenticated = false;
      if (mainViewEl) mainViewEl.innerHTML = '';
      showAuthOverlay();
      if (authFormEl) authFormEl.classList.add('hidden');
      if (authMessageEl)
        authMessageEl.textContent = 'Connecting to Supabase...';
      if (authMetaEl) authMetaEl.textContent = '';
      clearAuthError();
      break;
    }
    case 'needs-login': {
      isAuthenticated = false;
      if (mainViewEl) mainViewEl.innerHTML = '';
      showLoginForm();
      break;
    }
    case 'unauthorised': {
      isAuthenticated = false;
      if (mainViewEl) mainViewEl.innerHTML = '';
      showUnauthorised(state);
      break;
    }
    case 'error':
    default: {
      isAuthenticated = false;
      if (mainViewEl) mainViewEl.innerHTML = '';
      showAuthErrorState(state?.error);
    }
  }
}

function attachAuthHandlers() {
  authOverlayEl = document.getElementById('auth-overlay');
  authFormEl = document.getElementById('auth-form');
  authMessageEl = document.getElementById('auth-message');
  authMetaEl = document.getElementById('auth-meta');
  authErrorEl = document.getElementById('auth-error');
  authSubmitBtn = authFormEl?.querySelector('button[type="submit"]') || null;
  adminNameEl = document.getElementById('current-admin-name');
  logoutBtn = document.querySelector('[data-role="logout"]');

  authFormEl?.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearAuthError();
    const formData = new FormData(authFormEl);
    const email = String(formData.get('email') || '').trim();
    const password = String(formData.get('password') || '');
    if (!email || !password) {
      showAuthError('Email and password are required.');
      return;
    }

    setAuthSubmitting(true);
    try {
      await authService.signIn(email, password);
      showToast('Signed in successfully.', { type: 'success' });
    } catch (error) {
      console.error('[Admin] Sign-in failed', error);
      showAuthError(error?.message || 'Sign-in failed.');
    } finally {
      setAuthSubmitting(false);
    }
  });

  logoutBtn?.addEventListener('click', async (event) => {
    event.preventDefault();
    try {
      await authService.signOut();
      showToast('Signed out.', { type: 'info' });
    } catch (error) {
      console.error('[Admin] Sign-out failed', error);
      showToast(error?.message || 'Unable to sign out.', { type: 'error' });
    }
  });
}

async function init() {
  mainViewEl = document.getElementById('main-view');
  breadcrumbEl = document.getElementById('breadcrumb');

  bindSidebarControls();
  attachAuthHandlers();
  persistViewParam(appState.currentView);

  appState.addEventListener('change', (event) => {
    const nextView = event?.detail?.currentView;
    if (nextView) {
      persistViewParam(nextView);
    }
    render();
  });

  updateAuthUI({ status: 'initialising' });

  try {
    const state = await authService.init();
    updateAuthUI(state);
  } catch (error) {
    console.error('[Admin] Failed to initialise authentication', error);
    updateAuthUI(authService.getState());
  }

  authService.onChange((state) => {
    updateAuthUI(state);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch((error) => {
    console.error('[Admin] Failed to boot application', error);
    updateAuthUI({ status: 'error', error });
  });
});

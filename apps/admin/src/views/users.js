import { dataService } from '../services/dataService.js';
import { showToast } from '../components/toast.js';
import { authService } from '../services/authService.js';

const EMPTY_STATE_COPY = `Invite learners or generate credentials in bulk to kick-start a cohort.`;

function escapeHtml(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function renderStatusBadge(status) {
  const normalized = (status || 'inactive').toLowerCase();
  const palette = {
    active: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    canceled: 'bg-amber-50 text-amber-700 border border-amber-200',
    cancelled: 'bg-amber-50 text-amber-700 border border-amber-200',
    suspended: 'bg-rose-50 text-rose-700 border border-rose-200',
    expired: 'bg-slate-100 text-slate-500 border border-slate-200',
  };
  const label = normalized.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const classes = palette[normalized] || 'bg-slate-100 text-slate-600 border border-slate-200';
  return `<span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${classes}">${escapeHtml(label)}</span>`;
}

function buildPlanOptions(products) {
  const options = [];
  products.forEach((product) => {
    const departmentName = product.department_name || null;
    const departmentId = product.department_id || null;
    if (Array.isArray(product.plans)) {
      product.plans.forEach((plan) => {
        options.push({
          id: plan.id,
          name: plan.name,
          price: plan.price,
          currency: plan.currency,
          durationDays: plan.duration_days,
          departmentId,
          departmentName,
        });
      });
    }
  });
  options.sort((a, b) => a.name.localeCompare(b.name));
  return options;
}

export async function usersView() {
  const [rawProfiles, departments, products] = await Promise.all([
    dataService.listProfiles(),
    dataService.listDepartments(),
    dataService.listSubscriptionProductsDetailed(),
  ]);

  const profiles = (rawProfiles || []).filter(Boolean);
  const planOptions = buildPlanOptions(products || []);

  const statusCounts = profiles.reduce((acc, profile) => {
    const bucket = profile.status_bucket || 'no_plan';
    acc[bucket] = (acc[bucket] || 0) + 1;
    return acc;
  }, {});

  statusCounts.all = profiles.length;

  const filterDefinitions = [
    { key: 'all', label: 'All', count: statusCounts.all || 0 },
    { key: 'active', label: 'Active', count: statusCounts.active || 0 },
    { key: 'pending_payment', label: 'Pending payment', count: statusCounts.pending_payment || 0 },
    { key: 'expired', label: 'Expired', count: statusCounts.expired || 0 },
    { key: 'no_plan', label: 'No plan', count: statusCounts.no_plan || 0 },
    { key: 'suspended', label: 'Suspended', count: statusCounts.suspended || 0 },
  ].filter((item) => item.count > 0 || item.key === 'all');

  const filterButtonsHtml = filterDefinitions
    .map(
      ({ key, label, count }) => `
        <button
          type="button"
          data-role="status-filter"
          data-filter="${key}"
          class="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold transition"
          ${key === 'all' ? 'data-active="true"' : ''}
        >
          <span>${label}</span>
          <span class="rounded-full px-2 py-0.5 text-[0.65rem] font-semibold">${count}</span>
        </button>
      `,
    )
    .join('');

  const rowsHtml = (profiles || [])
    .map((profile) => {
      const searchTerms = [
        profile.full_name,
        profile.username ? `@${profile.username}` : '',
        profile.email,
        profile.plan_name,
        profile.department_name,
        profile.status_bucket,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const profilePayload = encodeURIComponent(JSON.stringify(profile));
      const statusBucket = escapeHtml(profile.status_bucket || 'no_plan');

      return `
        <tr
          class="border-b border-slate-100 last:border-0"
          data-role="user-row"
          data-profile="${profilePayload}"
          data-search="${escapeHtml(searchTerms)}"
          data-status-bucket="${statusBucket}"
        >
          <td class="px-4 py-4 align-top">
            <div class="font-semibold text-slate-900">${escapeHtml(profile.full_name || '—')}</div>
            <div class="mt-1 text-xs text-slate-500">
              ${profile.username ? `@${escapeHtml(profile.username)}` : 'No username yet'}
            </div>
          </td>
          <td class="px-4 py-4 align-top">
            <div class="text-sm text-slate-700">${escapeHtml(profile.email || '—')}</div>
            <div class="mt-1 text-xs text-slate-400">${escapeHtml(profile.department_name || '—')}</div>
          </td>
          <td class="px-4 py-4 align-top">
            <div class="font-medium text-slate-900">${escapeHtml(profile.plan_name || 'No active plan')}</div>
            <div class="mt-1 text-xs text-slate-400">
              ${profile.plan_expires_at ? `Expires ${formatDate(profile.plan_expires_at)}` : 'No expiry set'}
            </div>
          </td>
          <td class="px-4 py-4 align-top">
            ${renderStatusBadge(profile.status || profile.subscription_status)}
          </td>
          <td class="px-4 py-4 text-right align-top">
            <button
              type="button"
              class="inline-flex items-center rounded-full border border-cyan-200 px-3 py-1 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-50"
              data-role="manage-user"
              data-user-id="${escapeHtml(profile.id)}"
            >
              Manage
            </button>
          </td>
        </tr>
      `;
    })
    .join('');

  const tableBody =
    rowsHtml ||
    `<tr><td colspan="5" class="px-4 py-12 text-center text-slate-500">${escapeHtml(
      EMPTY_STATE_COPY,
    )}</td></tr>`;

  const departmentOptionsHtml = `
    <option value="">Select department</option>
    ${departments
      .map(
        (dept) =>
          `<option value="${escapeHtml(dept.id)}">${escapeHtml(dept.name)}</option>`
      )
      .join('')}
  `;

  const planOptionsHtml = planOptions
    .map((plan) => {
      const label = `${plan.name}${plan.departmentName ? ` • ${plan.departmentName}` : ''}`;
      return `<option value="${escapeHtml(plan.id)}" data-department="${escapeHtml(
        plan.departmentId || '',
      )}">${escapeHtml(label)}</option>`;
    })
    .join('');

  return {
    html: `
      <section class="space-y-8">
        <header class="flex flex-col gap-6 rounded-3xl bg-white p-8 shadow-sm shadow-slate-200/60 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <span class="inline-flex items-center gap-2 rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-700">
              <span class="h-1.5 w-1.5 rounded-full bg-cyan-500"></span>
              User Management
            </span>
            <h1 class="mt-4 text-3xl font-bold text-slate-900">Control learner access</h1>
            <p class="mt-2 max-w-2xl text-sm text-slate-600">
              Invite, onboard, or suspend learners. Generate ready-to-use credentials for classrooms and manage plans without leaving the dashboard.
            </p>
          </div>
          <div class="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              class="inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-400 hover:text-slate-800"
              data-role="refresh-users"
            >
              Refresh list
            </button>
            <button
              type="button"
              class="inline-flex items-center justify-center rounded-full bg-cyan-600 px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-cyan-600/30 transition hover:bg-cyan-700"
              data-role="open-bulk-modal"
            >
              Generate credentials
            </button>
          </div>
        </header>

        <div class="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm shadow-slate-200/50">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div class="relative w-full sm:w-80">
              <input
                type="search"
                data-role="user-search"
                placeholder="Search by name, username, or email"
                class="w-full rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700 placeholder-slate-400 focus:border-cyan-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-100"
              />
              <span class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">
                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M5 11a6 6 0 1012 0 6 6 0 00-12 0z" />
                </svg>
              </span>
            </div>
            <p class="text-xs text-slate-400 sm:ml-auto">
              Showing <span data-role="user-count">${profiles.length}</span> ${profiles.length === 1 ? 'learner' : 'learners'}
            </p>
          </div>

          <div class="mt-4 flex flex-wrap items-center gap-2" data-role="status-filter-group">
            ${filterButtonsHtml}
          </div>

          <div class="mt-6 overflow-hidden rounded-2xl border border-slate-100">
            <table class="min-w-full divide-y divide-slate-100 text-left text-sm">
              <thead class="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th class="px-4 py-3">Learner</th>
                  <th class="px-4 py-3">Contact</th>
                  <th class="px-4 py-3">Plan</th>
                  <th class="px-4 py-3">Status</th>
                  <th class="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody data-role="user-table-body" class="divide-y divide-slate-100 bg-white">
                ${tableBody}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- Bulk credentials modal -->
      <div
        class="fixed inset-0 z-40 hidden items-center justify-center bg-slate-900/60 px-4"
        data-role="bulk-modal"
      >
        <div class="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
          <div class="flex items-start justify-between">
            <div>
              <h2 class="text-2xl font-semibold text-slate-900">Generate bulk credentials</h2>
              <p class="mt-2 text-sm text-slate-600">
                Create pre-activated accounts and download them for classroom distribution. Learners can change their password after first login.
              </p>
            </div>
            <button type="button" data-role="close-bulk-modal" class="rounded-full bg-slate-100 p-2 text-slate-500 hover:text-slate-700" aria-label="Close">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <form class="mt-6 space-y-5" data-role="bulk-form">
            <div class="grid gap-4 sm:grid-cols-2">
              <label class="text-sm font-medium text-slate-700">
                Department
                <select
                  name="departmentId"
                  data-role="bulk-department"
                  class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100"
                  required
                >
                  ${departmentOptionsHtml}
                </select>
              </label>
              <label class="text-sm font-medium text-slate-700">
                Plan
                <select
                  name="planId"
                  data-role="bulk-plan"
                  class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100"
                  required
                >
                  <option value="">Select plan</option>
                  ${planOptionsHtml}
                </select>
              </label>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <label class="text-sm font-medium text-slate-700">
                Number of accounts
                <input
                  type="number"
                  name="quantity"
                  min="1"
                  max="500"
                  value="10"
                  class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100"
                  required
                />
              </label>
              <label class="text-sm font-medium text-slate-700">
                Expiry date (optional)
                <input
                  type="date"
                  name="expiresAt"
                  class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100"
                />
              </label>
            </div>

            <label class="text-sm font-medium text-slate-700">
              Username prefix (optional)
              <input
                type="text"
                name="usernamePrefix"
                maxlength="12"
                placeholder="e.g. nursing-cohort"
                class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100"
              />
            </label>

            <div class="flex items-center justify-end gap-3">
              <button
                type="button"
                data-role="close-bulk-modal"
                class="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                data-role="bulk-submit"
                class="inline-flex items-center justify-center rounded-full bg-cyan-600 px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-cyan-600/30 transition hover:bg-cyan-700"
              >
                Generate
              </button>
            </div>
          </form>

          <div class="mt-6 hidden" data-role="bulk-results">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-semibold text-slate-900">Generated accounts</h3>
              <a
                href="#"
                download="bulk-credentials.csv"
                class="inline-flex items-center rounded-full border border-cyan-200 px-3 py-1 text-xs font-semibold text-cyan-700 hover:bg-cyan-50"
                data-role="bulk-download"
              >
                Download CSV
              </a>
            </div>
            <div class="mt-3 max-h-56 overflow-auto rounded-xl border border-slate-100">
              <table class="min-w-full divide-y divide-slate-100 text-left text-xs">
                <thead class="bg-slate-50 text-slate-500">
                  <tr>
                    <th class="px-3 py-2">Username</th>
                    <th class="px-3 py-2">Password</th>
                    <th class="px-3 py-2">Email</th>
                    <th class="px-3 py-2">Expires</th>
                  </tr>
                </thead>
                <tbody data-role="bulk-results-body" class="divide-y divide-slate-100 bg-white"></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- Manage user modal -->
      <div
        class="fixed inset-0 z-40 hidden items-start justify-center overflow-y-auto bg-slate-900/60 px-4 py-8"
        data-role="user-modal"
      >
        <div class="w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl">
          <div class="flex items-start justify-between">
            <div>
              <h2 class="text-2xl font-semibold text-slate-900">Update learner account</h2>
              <p class="mt-2 text-sm text-slate-600">
                Change credentials, move the learner to another plan, or trigger account-level actions.
              </p>
            </div>
            <button type="button" data-role="close-user-modal" class="rounded-full bg-slate-100 p-2 text-slate-500 hover:text-slate-700" aria-label="Close">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <form class="mt-6 space-y-5" data-role="user-form">
            <input type="hidden" name="userId" />
            <div class="grid gap-4 sm:grid-cols-2">
              <label class="text-sm font-medium text-slate-700">
                Full name
                <input
                  type="text"
                  name="fullName"
                  class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100"
                />
              </label>
              <label class="text-sm font-medium text-slate-700">
                Email
                <input
                  type="email"
                  name="email"
                  required
                  class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100"
                />
              </label>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <label class="text-sm font-medium text-slate-700">
                Username
                <input
                  type="text"
                  name="username"
                  minlength="3"
                  class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100"
                />
              </label>
              <label class="text-sm font-medium text-slate-700">
                New password
                <input
                  type="text"
                  name="password"
                  placeholder="Leave blank to keep current password"
                  class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100"
                />
              </label>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <label class="text-sm font-medium text-slate-700">
                Department
                <select
                  name="departmentId"
                  class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100"
                >
                  <option value="">No department</option>
                  ${departments
                    .map(
                      (dept) =>
                        `<option value="${escapeHtml(dept.id)}">${escapeHtml(dept.name)}</option>`
                    )
                    .join('')}
                </select>
              </label>
              <label class="text-sm font-medium text-slate-700">
                Plan
                <select
                  name="planId"
                  class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100"
                >
                  <option value="">Keep current plan</option>
                  ${planOptionsHtml}
                </select>
              </label>
            </div>

            <label class="text-sm font-medium text-slate-700">
              Plan expiry override (optional)
              <input
                type="date"
                name="planExpiresAt"
                class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100"
              />
            </label>

            <div
              class="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-600"
              data-role="user-plan-meta"
            ></div>

            <div class="flex flex-col gap-3 border-t border-slate-100 pt-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <div class="flex flex-wrap gap-2" data-role="user-secondary-actions">
                <button type="button" data-role="send-reset" class="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300">Send reset email</button>
                <button type="button" data-role="impersonate" class="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300">Impersonate</button>
                <button type="button" data-role="suspend" class="inline-flex items-center rounded-full border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-700 hover:border-amber-300">Suspend</button>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <button type="button" data-role="delete-user" class="inline-flex items-center rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-700 hover:border-rose-300">Delete user</button>
                <button type="button" data-role="close-user-modal" class="inline-flex items-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300">Cancel</button>
                <button type="submit" data-role="user-save" class="inline-flex items-center rounded-full bg-cyan-600 px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-cyan-600/30 transition hover:bg-cyan-700">Save changes</button>
              </div>
            </div>
          </form>
        </div>
      </div>
    `,
    onMount(container, _appState, actions) {
      const rows = Array.from(container.querySelectorAll('[data-role="user-row"]'));
      const searchInput = container.querySelector('[data-role="user-search"]');
      const filterButtons = Array.from(container.querySelectorAll('[data-role="status-filter"]'));
      const userCountEl = container.querySelector('[data-role="user-count"]');
      const bulkModal = container.querySelector('[data-role="bulk-modal"]');
      const userModal = container.querySelector('[data-role="user-modal"]');
      const bulkForm = container.querySelector('[data-role="bulk-form"]');
      const bulkResults = container.querySelector('[data-role="bulk-results"]');
      const bulkResultsBody = container.querySelector('[data-role="bulk-results-body"]');
      const bulkDownload = container.querySelector('[data-role="bulk-download"]');
      const bulkSubmit = container.querySelector('[data-role="bulk-submit"]');
      const bulkDepartmentSelect = container.querySelector('[data-role="bulk-department"]');
      const bulkPlanSelect = container.querySelector('[data-role="bulk-plan"]');
      const userForm = container.querySelector('[data-role="user-form"]');
      const userPlanMeta = container.querySelector('[data-role="user-plan-meta"]');
      const suspendBtn = container.querySelector('[data-role="suspend"]');
      const impersonateBtn = container.querySelector('[data-role="impersonate"]');
      const resetBtn = container.querySelector('[data-role="send-reset"]');
      const deleteBtn = container.querySelector('[data-role="delete-user"]');
      let bulkDownloadUrl = null;
      let activeProfile = null;
      let activeFilter = 'all';
      let searchQuery = '';

      const ACTIVE_FILTER_CLASSES = [
        'bg-cyan-600',
        'text-white',
        'border',
        'border-cyan-600',
        'shadow',
        'shadow-cyan-600/30',
      ];
      const INACTIVE_FILTER_CLASSES = [
        'bg-slate-100',
        'text-slate-600',
        'border',
        'border-slate-200',
      ];

      const resetFilterStyles = (button) => {
        button.classList.remove(...ACTIVE_FILTER_CLASSES);
        button.classList.remove(...INACTIVE_FILTER_CLASSES);
        const badge = button.querySelector('span:last-child');
        if (badge) {
          badge.classList.remove('bg-white', 'text-cyan-700', 'bg-white/70', 'text-slate-500');
        }
      };

      const applyFilterStyles = () => {
        filterButtons.forEach((button) => {
          resetFilterStyles(button);
          const isActive = (button.dataset.filter || 'all') === activeFilter;
          if (isActive) {
            button.dataset.active = 'true';
            button.classList.add(...ACTIVE_FILTER_CLASSES);
            const badge = button.querySelector('span:last-child');
            if (badge) {
              badge.classList.add('bg-white', 'text-cyan-700');
            }
          } else {
            button.removeAttribute('data-active');
            button.classList.add(...INACTIVE_FILTER_CLASSES);
            const badge = button.querySelector('span:last-child');
            if (badge) {
              badge.classList.add('bg-white/70', 'text-slate-500');
            }
          }
        });
      };

      const applyFilters = () => {
        let visibleCount = 0;
        rows.forEach((row) => {
          const bucket = row.dataset.statusBucket || 'no_plan';
          const haystack = (row.dataset.search || '').toLowerCase();
          const matchesFilter = activeFilter === 'all' || bucket === activeFilter;
          const matchesSearch = !searchQuery || haystack.includes(searchQuery);
          const visible = matchesFilter && matchesSearch;
          row.classList.toggle('hidden', !visible);
          if (visible) visibleCount += 1;
        });

        if (userCountEl) {
          userCountEl.textContent = visibleCount.toString();
        }
      };

      const ensureModalPortal = (modalEl) => {
        if (!modalEl) return null;
        const role = modalEl.dataset.role || '';

        document
          .querySelectorAll(`[data-role="${role}"][data-portal="true"]`)
          .forEach((existing) => {
            if (existing === modalEl) return;
            existing.remove();
          });

        if (modalEl.dataset.portal === 'true') {
          return modalEl;
        }

        modalEl.dataset.portal = 'true';
        document.body.appendChild(modalEl);
        return modalEl;
      };

      const managedBulkModal = ensureModalPortal(bulkModal);
      const managedUserModal = ensureModalPortal(userModal);

      const filterPlansForDepartment = (departmentId) => {
        if (!bulkPlanSelect) {
          return;
        }
        const options = Array.from(bulkPlanSelect.options || []);
        options.forEach((option) => {
          if (!option.value) return; // skip placeholder
          const optionDept = option.getAttribute('data-department') || '';
          const shouldShow = !departmentId || optionDept === departmentId;
          option.hidden = !shouldShow;
          if (!shouldShow && option.selected) {
            option.selected = false;
          }
        });
        if (!bulkPlanSelect.value) {
          bulkPlanSelect.selectedIndex = 0;
        }
      };

      bulkDepartmentSelect?.addEventListener('change', (event) => {
        const value = (event?.target?.value || '').toString();
        filterPlansForDepartment(value);
      });

      const openModal = (modalEl) => {
        if (!modalEl) return;
        modalEl.classList.remove('hidden');
        modalEl.classList.add('flex');
        modalEl.style.display = 'flex';
      };

      const closeModal = (modalEl) => {
        if (!modalEl) return;
        modalEl.classList.add('hidden');
        modalEl.classList.remove('flex');
        modalEl.style.display = 'none';
      };

      container.querySelectorAll('[data-role="open-bulk-modal"]').forEach((button) => {
        button.addEventListener('click', () => {
          bulkForm?.reset();
          bulkResults?.classList.add('hidden');
          if (bulkDownloadUrl) {
            URL.revokeObjectURL(bulkDownloadUrl);
            bulkDownloadUrl = null;
          }
          const initialDepartment = bulkDepartmentSelect?.value
            ? bulkDepartmentSelect.value.toString()
            : '';
          filterPlansForDepartment(initialDepartment);
          openModal(managedBulkModal);
        });
      });

      container.querySelectorAll('[data-role="close-bulk-modal"]').forEach((button) => {
        button.addEventListener('click', () => {
          closeModal(managedBulkModal);
          if (bulkDownloadUrl) {
            URL.revokeObjectURL(bulkDownloadUrl);
            bulkDownloadUrl = null;
          }
        });
      });

      container.querySelectorAll('[data-role="close-user-modal"]').forEach((button) => {
        button.addEventListener('click', () => closeModal(managedUserModal));
      });

      managedBulkModal?.addEventListener('click', (event) => {
        if (event.target === managedBulkModal) {
          closeModal(managedBulkModal);
          if (bulkDownloadUrl) {
            URL.revokeObjectURL(bulkDownloadUrl);
            bulkDownloadUrl = null;
          }
        }
      });

      managedUserModal?.addEventListener('click', (event) => {
        if (event.target === managedUserModal) {
          closeModal(managedUserModal);
        }
      });

      container.querySelector('[data-role="refresh-users"]')?.addEventListener('click', () => {
        actions.refresh();
      });

      searchInput?.addEventListener('input', (event) => {
        searchQuery = event.target.value.trim().toLowerCase();
        applyFilters();
      });

      filterButtons.forEach((button) => {
        button.addEventListener('click', () => {
          const nextFilter = button.dataset.filter || 'all';
          if (activeFilter === nextFilter) return;
          activeFilter = nextFilter;
          applyFilterStyles();
          applyFilters();
        });
      });

      applyFilterStyles();
      applyFilters();

      bulkForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!bulkSubmit) return;
        bulkSubmit.disabled = true;
        bulkSubmit.classList.add('opacity-60');
        bulkSubmit.textContent = 'Generating…';

        try {
          const formData = new FormData(bulkForm);
          const payload = {
            planId: formData.get('planId'),
            departmentId: formData.get('departmentId'),
            quantity: Number(formData.get('quantity') || 0),
            expiresAt: formData.get('expiresAt') || undefined,
            usernamePrefix: formData.get('usernamePrefix') || undefined,
          };

          const accounts = await dataService.generateBulkCredentials(payload);
          showToast(`Generated ${accounts.length} account${accounts.length === 1 ? '' : 's'}.`, {
            type: 'success',
          });

          bulkResults?.classList.remove('hidden');
          bulkResultsBody.innerHTML = accounts
            .map(
              (account) => `
                <tr class="divide-x divide-slate-100">
                  <td class="px-3 py-2 font-semibold text-slate-800">${escapeHtml(account.username)}</td>
                  <td class="px-3 py-2 text-slate-600">${escapeHtml(account.password)}</td>
                  <td class="px-3 py-2 text-slate-600">${escapeHtml(account.email)}</td>
                  <td class="px-3 py-2 text-slate-400">${account.expiresAt ? formatDate(account.expiresAt) : '—'}</td>
                </tr>
              `,
            )
            .join('');

          const csvHeader = 'username,password,email,expires_at\n';
          const csvRows = accounts
            .map((account) => {
              const expires = account.expiresAt ? account.expiresAt : '';
              return `${account.username},${account.password},${account.email},${expires}`;
            })
            .join('\n');

          const blob = new Blob([csvHeader + csvRows], { type: 'text/csv' });
          if (bulkDownloadUrl) {
            URL.revokeObjectURL(bulkDownloadUrl);
          }
          bulkDownloadUrl = URL.createObjectURL(blob);
          if (bulkDownload) {
            bulkDownload.href = bulkDownloadUrl;
          }
        } catch (error) {
          console.error('[Users] Bulk generation failed', error);
          showToast(error.message || 'Failed to generate credentials.', {
            type: 'error',
          });
        } finally {
          bulkSubmit.disabled = false;
          bulkSubmit.classList.remove('opacity-60');
          bulkSubmit.textContent = 'Generate';
        }
      });

      const populateUserModal = (profile) => {
        if (!userForm) return;
        activeProfile = profile;
        userForm.reset();
        userForm.querySelector('[name="userId"]').value = profile.id;
        userForm.querySelector('[name="fullName"]').value = profile.full_name || '';
        userForm.querySelector('[name="email"]').value = profile.email || '';
        userForm.querySelector('[name="username"]').value = profile.username || '';
        userForm.querySelector('[name="departmentId"]').value = profile.department_id || '';
        userForm.querySelector('[name="planId"]').value = profile.plan_id || '';
        const planDateInput = userForm.querySelector('[name="planExpiresAt"]');
        if (planDateInput) {
          planDateInput.value = profile.plan_expires_at
            ? new Date(profile.plan_expires_at).toISOString().slice(0, 10)
            : '';
        }

        const metaLines = [];
        metaLines.push(
          `<div><span class="font-semibold text-slate-700">Plan:</span> ${escapeHtml(
            profile.plan_name || 'No active plan',
          )}</div>`,
        );
        metaLines.push(
          `<div><span class="font-semibold text-slate-700">Status:</span> ${escapeHtml(
            profile.status || profile.subscription_status || 'inactive',
          )}</div>`,
        );
        if (profile.plan_started_at) {
          metaLines.push(
            `<div><span class="font-semibold text-slate-700">Started:</span> ${formatDate(
              profile.plan_started_at,
            )}</div>`,
          );
        }
        if (profile.plan_expires_at) {
          metaLines.push(
            `<div><span class="font-semibold text-slate-700">Expires:</span> ${formatDate(
              profile.plan_expires_at,
            )}</div>`,
          );
        }
        userPlanMeta.innerHTML = metaLines.join('');

        suspendBtn.textContent =
          (profile.subscription_status || '').toLowerCase() === 'suspended'
            ? 'Unsuspend'
            : 'Suspend';

        openModal(managedUserModal);
      };

      container.querySelectorAll('[data-role="manage-user"]').forEach((button) => {
        button.addEventListener('click', () => {
          const row = button.closest('[data-role="user-row"]');
          if (!row) return;
          const payload = JSON.parse(decodeURIComponent(row.dataset.profile));
          populateUserModal(payload);
        });
      });

      userForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!activeProfile) return;
        const submitBtn = userForm.querySelector('[data-role="user-save"]');
        submitBtn.disabled = true;
        submitBtn.classList.add('opacity-60');
        submitBtn.textContent = 'Saving…';

        try {
          const formData = new FormData(userForm);
          const payload = {
            userId: formData.get('userId'),
            email: (formData.get('email') || '').toString().trim() || undefined,
            username: (formData.get('username') || '').toString().trim() || undefined,
            password: (formData.get('password') || '').toString().trim() || undefined,
            departmentId: formData.get('departmentId') || undefined,
            planId: formData.get('planId') || undefined,
            planExpiresAt: formData.get('planExpiresAt') || undefined,
            fullName: (formData.get('fullName') || '').toString().trim() || undefined,
          };

          if (!payload.password) delete payload.password;
          if (!payload.username) delete payload.username;
          if (!payload.planId) delete payload.planId;
          if (!payload.departmentId) delete payload.departmentId;
          if (!payload.planExpiresAt) delete payload.planExpiresAt;
          if (!payload.fullName) delete payload.fullName;

          await dataService.adminUpdateUser(payload);
          showToast('Account updated successfully.', { type: 'success' });
          closeModal(managedUserModal);
          actions.refresh();
        } catch (error) {
          console.error('[Users] Failed to update user', error);
          showToast(error.message || 'Failed to update account.', { type: 'error' });
        } finally {
          submitBtn.disabled = false;
          submitBtn.classList.remove('opacity-60');
          submitBtn.textContent = 'Save changes';
        }
      });

      suspendBtn?.addEventListener('click', async () => {
        if (!activeProfile) return;
        const current = (activeProfile.subscription_status || '').toLowerCase();
        const nextStatus = current === 'suspended' ? 'active' : 'suspended';
        try {
          await dataService.updateUserProfileStatus(activeProfile.id, nextStatus);
          showToast(`User marked as ${nextStatus}.`, { type: 'success' });
          closeModal(managedUserModal);
          actions.refresh();
        } catch (error) {
          console.error('[Users] Failed to update status', error);
          showToast(error.message || 'Unable to update status.', { type: 'error' });
        }
      });

      impersonateBtn?.addEventListener('click', async () => {
        if (!activeProfile) return;
        if (!confirm('Impersonate this user in the learner app?')) return;
        try {
          await authService.impersonateUser(activeProfile.id);
          window.location.href = '/apps/learner/';
        } catch (error) {
          console.error('[Users] Failed to impersonate', error);
          showToast(error.message || 'Unable to impersonate user.', { type: 'error' });
        }
      });

      resetBtn?.addEventListener('click', async () => {
        if (!activeProfile) return;
        try {
          await authService.resetPasswordForUser(activeProfile.email);
          showToast('Password reset email sent.', { type: 'success' });
        } catch (error) {
          console.error('[Users] Failed to send reset email', error);
          showToast(error.message || 'Unable to send reset email.', { type: 'error' });
        }
      });

      deleteBtn?.addEventListener('click', async () => {
        if (!activeProfile) return;
        if (!confirm('Delete this user account permanently? This cannot be undone.')) return;
        try {
          await dataService.deleteUserProfile(activeProfile.id);
          await authService.deleteUser(activeProfile.id);
          showToast('User deleted.', { type: 'success' });
          closeModal(managedUserModal);
          actions.refresh();
        } catch (error) {
          console.error('[Users] Failed to delete user', error);
          showToast(error.message || 'Unable to delete user.', { type: 'error' });
        }
      });
    },
  };
}

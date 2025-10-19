import { dataService } from '../services/dataService.js';

const INACTIVE_WINDOW_DAYS = 14;

function escapeHtml(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatNumber(value) {
  return Number(value ?? 0).toLocaleString();
}

function formatCurrency(value) {
  return `₦${Number(value ?? 0).toLocaleString()}`;
}

function formatLastActive(isoString) {
  if (!isoString) return 'Never signed in';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return 'Unknown';

  const diffMs = Date.now() - date.getTime();
  if (diffMs <= 0) return 'Today';

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 7) return `${diffDays} days ago`;

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks === 1) return '1 week ago';
  if (diffWeeks < 5) return `${diffWeeks} weeks ago`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths <= 1) return '1 month ago';
  return `${diffMonths} months ago`;
}

function renderInactiveLearnersSection(learners) {
  if (!learners.length) {
    return `
      <div class="mt-4 rounded-lg border border-dashed border-gray-200 p-4 text-sm text-gray-500">
        No learners have been inactive for more than ${INACTIVE_WINDOW_DAYS} days.
      </div>
    `;
  }

  const rows = learners
    .map((learner) => {
      const planLabel = learner.plan_name
        ? escapeHtml(learner.plan_name)
        : 'No active plan';
      const statusLabel = learner.status
        ? escapeHtml(learner.status.replace(/_/g, ' '))
        : 'inactive';

      return `
        <tr class="border-b last:border-b-0 border-gray-100">
          <td class="px-0 py-3">
            <div class="font-semibold text-gray-900">${escapeHtml(
              learner.full_name || '—'
            )}</div>
            <div class="mt-1 text-xs text-gray-500">${escapeHtml(
              learner.email || 'No email on file'
            )}</div>
          </td>
          <td class="px-3 py-3 text-sm text-gray-600">${planLabel}</td>
          <td class="px-3 py-3 text-sm text-gray-600">${formatLastActive(
            learner.last_seen_at
          )}</td>
          <td class="px-3 py-3 text-sm capitalize text-gray-600">${statusLabel}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <div class="mt-4 overflow-hidden rounded-lg border border-gray-200">
      <table class="min-w-full divide-y divide-gray-200 text-sm">
        <thead class="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
          <tr>
            <th scope="col" class="px-0 py-3">Learner</th>
            <th scope="col" class="px-3 py-3">Plan</th>
            <th scope="col" class="px-3 py-3">Last Active</th>
            <th scope="col" class="px-3 py-3">Status</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function formatAnnouncementTimestamp(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export async function dashboardView(_appState, actions = {}) {
  const statsPromise = dataService.getDashboardStats();

  let inactiveLearners = [];
  try {
    inactiveLearners = await dataService.listInactiveLearners({
      daysWithoutActivity: INACTIVE_WINDOW_DAYS,
      limit: 8,
    });
  } catch (error) {
    console.error('[Dashboard] Failed to load inactive learners list', error);
    inactiveLearners = [];
  }

  let announcements = [];
  try {
    announcements = await dataService.listGlobalAnnouncements({ limit: 5 });
  } catch (error) {
    console.error('[Dashboard] Failed to load announcements', error);
    announcements = [];
  }

  const stats = await statsPromise;
  const metrics = [
    {
      label: 'Total Users',
      value: formatNumber(stats.users),
      accent: 'bg-white',
    },
    {
      label: 'Active Subscriptions',
      value: formatNumber(stats.subscriptions),
      accent: 'bg-white',
    },
    {
      label: 'Monthly Revenue',
      value: formatCurrency(stats.revenue),
      accent: 'bg-white',
    },
    {
      label: 'Total Questions',
      value: formatNumber(stats.totalQuestions),
      accent: 'bg-white',
    },
  ];

  const cards = metrics
    .map(
      (metric) => `
        <div class="${metric.accent} p-6 rounded-lg shadow flex flex-col">
          <h3 class="text-sm font-medium text-gray-500">${metric.label}</h3>
          <p class="mt-2 text-3xl font-semibold text-gray-900">${metric.value}</p>
        </div>
      `
    )
    .join('');

  const announcementsList = announcements.length
    ? `
        <ul class="mt-4 space-y-2" data-role="global-notification-list">
          ${announcements
            .map((item) => {
              const statusLabel = item.is_active ? 'Active' : 'Archived';
              const statusClasses = item.is_active
                ? 'text-emerald-600 bg-emerald-50 border border-emerald-200'
                : 'text-slate-500 bg-slate-100 border border-slate-200';
              return `
                <li class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <p class="flex-1 leading-snug">${escapeHtml(item.message)}</p>
                    <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${statusClasses}">
                      ${statusLabel}
                    </span>
                  </div>
                  <p class="mt-1 text-xs text-amber-700">${escapeHtml(
                    formatAnnouncementTimestamp(item.created_at)
                  )}</p>
                </li>
              `;
            })
            .join('')}
        </ul>
      `
    : `
        <div class="mt-4 rounded-md border border-dashed border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No broadcasts have been sent yet.
        </div>
      `;

  return {
    html: `
      <section class="space-y-6">
        <div>
          <h1 class="text-2xl font-semibold text-gray-900">Overview</h1>
          <p class="text-gray-500">Track performance across products, content, and exams.</p>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
          ${cards}
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <article class="bg-white rounded-lg shadow p-6">
            <h2 class="text-lg font-semibold text-gray-800">Content Pipeline</h2>
            <p class="mt-2 text-sm text-gray-500">Departments with the highest question growth will surface here once Supabase data is connected.</p>
            <div class="mt-4 border border-dashed border-gray-200 rounded-lg p-4 text-sm text-gray-400">
              Connect Supabase to unlock live analytics for content creation velocity, question review backlog, and publishing cadence.
            </div>
          </article>
          <article class="bg-white rounded-lg shadow p-6">
            <h2 class="text-lg font-semibold text-gray-800">Upcoming Exams</h2>
            <p class="mt-2 text-sm text-gray-500">Study cycles and real-time exam sessions will appear with schedule, enrolment, and readiness score.</p>
            <div class="mt-4 border border-dashed border-gray-200 rounded-lg p-4 text-sm text-gray-400">
              Create study cycles under <strong>Study Cycles</strong> to populate upcoming exam insights.
            </div>
          </article>
        </div>
        <article class="bg-white rounded-lg shadow p-6">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 class="text-lg font-semibold text-gray-800">Global notification</h2>
              <p class="text-sm text-gray-500">Publish a short banner that appears on every learner dashboard.</p>
            </div>
          </div>
          <form class="mt-4 space-y-3" data-role="global-notification-form">
            <label class="text-sm font-semibold text-gray-600" for="global-notification-message">
              Message
            </label>
            <textarea
              id="global-notification-message"
              rows="3"
              required
              data-role="global-notification-input"
              class="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 shadow-sm focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-100"
              placeholder="Keep it short, e.g. Assessment window opens Friday at 9AM."
            ></textarea>
            <div class="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                class="inline-flex items-center justify-center rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-200"
                data-role="global-notification-submit"
              >
                Send to learners
              </button>
              <p class="hidden text-sm text-red-600" data-role="global-notification-error"></p>
            </div>
          </form>
          <div class="mt-6">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-amber-700">Recent broadcasts</h3>
            ${announcementsList}
          </div>
        </article>
        <article class="bg-white rounded-lg shadow p-6">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="text-lg font-semibold text-gray-800">Inactive Learners</h2>
              <p class="text-sm text-gray-500">Last seen more than ${INACTIVE_WINDOW_DAYS} days ago.</p>
            </div>
            <span class="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
              Attention Needed
            </span>
          </div>
          ${renderInactiveLearnersSection(inactiveLearners)}
        </article>
      </section>
    `,
    onMount(container) {
      const form = container.querySelector('[data-role="global-notification-form"]');
      if (!form) return;
      const input = form.querySelector('[data-role="global-notification-input"]');
      const submitBtn = form.querySelector('[data-role="global-notification-submit"]');
      const errorEl = form.querySelector('[data-role="global-notification-error"]');

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!input || !submitBtn) return;
        const message = input.value.trim();
        if (!message) {
          if (errorEl) {
            errorEl.textContent = 'Add a short message before broadcasting.';
            errorEl.classList.remove('hidden');
          }
          return;
        }

        if (errorEl) {
          errorEl.textContent = '';
          errorEl.classList.add('hidden');
        }

        const originalLabel = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending…';

        try {
          await dataService.createGlobalAnnouncement({ message });
          input.value = '';
          if (typeof actions.refresh === 'function') {
            actions.refresh();
          }
        } catch (error) {
          console.error('[Dashboard] Failed to create announcement', error);
          if (errorEl) {
            errorEl.textContent =
              error?.message || 'Unable to send announcement right now.';
            errorEl.classList.remove('hidden');
          }
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = originalLabel;
        }
      });
    },
  };
}

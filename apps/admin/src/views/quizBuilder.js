import {
  quizBuilderService,
  QuizBuilderServiceError,
} from '../services/quizBuilderService.js';
import { showToast } from '../components/toast.js';

const MOBILE_SECTION_CLASSES =
  'bg-white rounded-2xl shadow-sm border border-slate-100 p-4 sm:p-6';

function emptyState(message) {
  return `
    <div class="flex flex-col items-center justify-center text-center gap-3 py-6">
      <div class="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6v12m6-6H6" />
        </svg>
      </div>
      <p class="text-sm text-slate-500 max-w-xs">${message}</p>
    </div>
  `;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCurrency(amount, currency = 'NGN') {
  if (amount === null || amount === undefined) return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(Number(amount));
  } catch (_error) {
    return `₦${Number(amount).toLocaleString()}`;
  }
}

function badge(label, tone = 'default') {
  const palette = {
    default: 'bg-slate-100 text-slate-700',
    draft: 'bg-amber-100 text-amber-700',
    published: 'bg-emerald-100 text-emerald-700',
    live: 'bg-blue-100 text-blue-700',
    archived: 'bg-slate-200 text-slate-500',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-rose-100 text-rose-700',
  };
  return `<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${palette[tone] || palette.default}">${label}</span>`;
}

function renderBlueprintCard(blueprint) {
  const statusTone =
    blueprint.status === 'published'
      ? 'published'
      : blueprint.status === 'archived'
        ? 'archived'
        : 'draft';
  return `
    <article class="${MOBILE_SECTION_CLASSES}">
      <div class="flex flex-col gap-3">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 class="text-base font-semibold text-slate-900">${blueprint.title || 'Untitled quiz'}</h3>
            <p class="text-sm text-slate-500 mt-1 line-clamp-2">${blueprint.description || 'No description provided yet.'}</p>
          </div>
          ${badge(blueprint.status || 'draft', statusTone)}
        </div>
        <dl class="grid grid-cols-2 gap-4 text-sm text-slate-600 sm:grid-cols-4">
          <div>
            <dt class="text-xs uppercase tracking-wide text-slate-400">Questions</dt>
            <dd class="mt-0.5 font-medium text-slate-900">${blueprint.total_questions ?? 0}</dd>
          </div>
          <div>
            <dt class="text-xs uppercase tracking-wide text-slate-400">Duration</dt>
            <dd class="mt-0.5 font-medium text-slate-900">${blueprint.estimated_duration_seconds ? `${Math.round(blueprint.estimated_duration_seconds / 60)} mins` : 'Unset'}</dd>
          </div>
          <div>
            <dt class="text-xs uppercase tracking-wide text-slate-400">Updated</dt>
            <dd class="mt-0.5">${formatDate(blueprint.updated_at)}</dd>
          </div>
          <div>
            <dt class="text-xs uppercase tracking-wide text-slate-400">Owner</dt>
            <dd class="mt-0.5">${blueprint.owner_id ? `User ${blueprint.owner_id.slice(0, 6)}…` : 'Unknown'}</dd>
          </div>
        </dl>
        <div class="flex flex-wrap gap-2">
          <button class="text-sm font-medium text-cyan-600 hover:text-cyan-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500" data-blueprint-action="edit" data-blueprint-id="${blueprint.id}">
            Edit builder
          </button>
          <button class="text-sm font-medium text-slate-600 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400" data-blueprint-action="duplicate" data-blueprint-id="${blueprint.id}">
            Duplicate
          </button>
          <button class="text-sm font-medium text-rose-600 hover:text-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400" data-blueprint-action="archive" data-blueprint-id="${blueprint.id}">
            Archive
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderClassroomCard(classroom) {
  const statusTone =
    classroom.status === 'suspended'
      ? 'danger'
      : classroom.status === 'archived'
        ? 'archived'
        : 'published';
  const accessCopy =
    classroom.access_mode === 'open_link'
      ? 'Open link'
      : classroom.access_mode === 'pin'
        ? 'PIN required'
        : classroom.access_mode === 'phone_whitelist'
          ? 'Phone whitelist'
          : 'Invite only';
  return `
    <article class="${MOBILE_SECTION_CLASSES}">
      <div class="flex flex-col gap-3">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 class="text-base font-semibold text-slate-900">${classroom.name}</h3>
            <p class="text-sm text-slate-500 mt-1">${accessCopy}</p>
          </div>
          ${badge(classroom.status || 'active', statusTone)}
        </div>
        <dl class="grid grid-cols-2 gap-4 text-sm text-slate-600 sm:grid-cols-4">
          <div>
            <dt class="text-xs uppercase tracking-wide text-slate-400">Quota</dt>
            <dd class="mt-0.5 font-medium text-slate-900">${classroom.active_participants ?? 0}/${classroom.seat_quota ?? 0}</dd>
          </div>
          <div>
            <dt class="text-xs uppercase tracking-wide text-slate-400">Invites</dt>
            <dd class="mt-0.5">${classroom.pending_invites ?? 0}</dd>
          </div>
          <div>
            <dt class="text-xs uppercase tracking-wide text-slate-400">Scheduled</dt>
            <dd class="mt-0.5">${classroom.scheduled_exam_count ?? 0}</dd>
          </div>
          <div>
            <dt class="text-xs uppercase tracking-wide text-slate-400">Next exam</dt>
            <dd class="mt-0.5">${formatDate(classroom.next_exam_at)}</dd>
          </div>
        </dl>
        <div class="flex flex-wrap gap-2">
          <button class="text-sm font-medium text-cyan-600 hover:text-cyan-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500" data-classroom-action="manage" data-classroom-id="${classroom.id}">
            Manage classroom
          </button>
          <button class="text-sm font-medium text-slate-600 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400" data-classroom-action="schedule" data-classroom-id="${classroom.id}">
            Schedule exam
          </button>
          <button class="text-sm font-medium text-rose-600 hover:text-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400" data-classroom-action="suspend" data-classroom-id="${classroom.id}">
            Suspend
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderExamRow(exam) {
  return `
    <li class="rounded-xl border border-slate-100 bg-white p-4 sm:p-5 shadow-sm">
      <div class="flex flex-col gap-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm font-medium text-slate-900">${exam.quiz_title || 'Untitled quiz'}</p>
          ${badge(exam.status || 'scheduled', exam.status === 'live' ? 'live' : 'published')}
        </div>
        <p class="text-xs text-slate-500">
          ${exam.classroom_name || 'Unassigned'} • ${formatDate(exam.starts_at)} → ${formatDate(exam.ends_at)}
        </p>
        <div class="flex flex-wrap gap-3 text-xs text-slate-500">
          <span>${exam.expected_participants ?? 0} expected</span>
          <span>${exam.live_attempts ?? 0} joined</span>
          <span>${exam.completed_attempts ?? 0} completed</span>
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="text-sm font-medium text-cyan-600 hover:text-cyan-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500" data-exam-action="monitor" data-exam-id="${exam.id}">
            Monitor live room
          </button>
          <button class="text-sm font-medium text-slate-600 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400" data-exam-action="summary" data-exam-id="${exam.id}">
            View summary
          </button>
        </div>
      </div>
    </li>
  `;
}

function renderSharedQuizRow(entry) {
  const cappedText =
    entry.max_participants && entry.max_participants > 0
      ? `${entry.submissions ?? 0}/${entry.max_participants}`
      : `${entry.submissions ?? 0}`;
  return `
    <li class="rounded-xl border border-slate-100 bg-white p-4 sm:p-5 shadow-sm">
      <div class="flex flex-col gap-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm font-semibold text-slate-900">${entry.title || 'Shared quiz link'}</p>
          ${badge(entry.status || 'active', entry.status === 'closed' ? 'archived' : 'published')}
        </div>
        <p class="text-xs text-slate-500">
          Created ${formatDate(entry.created_at)} • Last response ${formatDate(entry.last_submission_at)}
        </p>
        <div class="flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <span>${cappedText} participants</span>
          <span>Blueprint ${entry.quiz_blueprint_id?.slice(0, 8) ?? '—'}</span>
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="text-sm font-medium text-cyan-600 hover:text-cyan-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500" data-shared-action="copy" data-share-id="${entry.id}">
            Copy link
          </button>
          <button class="text-sm font-medium text-slate-600 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400" data-shared-action="analytics" data-share-id="${entry.id}">
            View analytics
          </button>
          <button class="text-sm font-medium text-rose-600 hover:text-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400" data-shared-action="close" data-share-id="${entry.id}">
            Close link
          </button>
        </div>
      </div>
    </li>
  `;
}

function renderSubscriptionCard(summary) {
  if (!summary) {
    return `
      <div class="${MOBILE_SECTION_CLASSES}">
        <div class="flex flex-col gap-4">
          <div>
            <h3 class="text-base font-semibold text-slate-900">Quiz seats</h3>
            <p class="text-sm text-slate-500 mt-1">
              Track seat usage and upgrade to host more students.
            </p>
          </div>
          <p class="text-sm text-slate-500">
            Subscription data not available. Confirm Supabase migrations and quiz subscription view.
          </p>
        </div>
      </div>
    `;
  }

  const usagePercent =
    summary.seat_count > 0
      ? Math.min(
          100,
          Math.round((summary.seats_in_use / summary.seat_count) * 100)
        )
      : 0;

  return `
    <div class="${MOBILE_SECTION_CLASSES}">
      <div class="flex flex-col gap-4">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 class="text-base font-semibold text-slate-900">Quiz seats</h3>
            <p class="text-sm text-slate-500 mt-1">
              ${summary.renewal_date ? `Renews ${formatDate(summary.renewal_date)}` : 'Renewal date not set'}
            </p>
            <p class="text-xs text-slate-400 mt-1">
              ${formatCurrency(summary.price_per_seat ?? 500, summary.currency)} per learner • 30-day cycle
            </p>
          </div>
          ${badge(
            summary.status || 'active',
            summary.status === 'past_due' ? 'warning' : 'published'
          )}
        </div>
        <div>
          <p class="text-3xl font-semibold text-slate-900">${summary.seats_in_use ?? 0}<span class="text-base font-medium text-slate-500"> / ${summary.seat_count ?? 0}</span></p>
          <p class="text-xs text-slate-500 mt-1">${usagePercent}% of seats assigned • ${summary.seats_available ?? Math.max((summary.seat_count ?? 0) - (summary.seats_in_use ?? 0), 0)} available</p>
          <div class="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div class="h-full bg-cyan-500 transition-all duration-300" style="width: ${usagePercent}%"></div>
          </div>
        </div>
        <dl class="grid grid-cols-2 gap-4 text-sm text-slate-600">
          <div>
            <dt class="text-xs uppercase tracking-wide text-slate-400">Free quota</dt>
            <dd class="mt-0.5">${summary.free_tier_seats ?? 0}</dd>
          </div>
          <div>
            <dt class="text-xs uppercase tracking-wide text-slate-400">Paid seats</dt>
            <dd class="mt-0.5">${summary.paid_seats ?? 0}</dd>
          </div>
        </dl>
        <form id="seat-upgrade-form" class="flex flex-col gap-3" autocomplete="off">
          <div>
            <label for="seat-upgrade-count" class="block text-sm font-medium text-slate-700">Add seats</label>
            <input id="seat-upgrade-count" name="seat-upgrade-count" type="number" min="1" inputmode="numeric" required class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400" placeholder="How many seats?" />
          </div>
          <button type="submit" class="inline-flex items-center justify-center rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:cursor-not-allowed disabled:bg-cyan-300" data-upgrade-label="Add seats">
            Add seats
          </button>
          <p class="text-xs text-slate-500">
            ${formatCurrency(summary.price_per_seat ?? 500, summary.currency)} per seat, prorated for the days left in the billing cycle.
          </p>
        </form>
      </div>
    </div>
  `;
}

export async function quizBuilderView() {
  return {
    html: `
      <section class="space-y-8 pb-16">
        <header class="space-y-2">
          <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 class="text-3xl font-bold tracking-tight text-slate-900">Quiz & Classroom</h1>
              <p class="text-sm text-slate-500">
                Build quizzes, manage classrooms, and monitor exams in real-time across devices.
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <button id="new-blueprint-btn" class="inline-flex items-center rounded-full bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500">
                New quiz blueprint
              </button>
              <button id="new-classroom-btn" class="inline-flex items-center rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
                New classroom
              </button>
            </div>
          </div>
        </header>

        <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" id="quiz-metrics"></section>

        <section class="grid gap-6 lg:grid-cols-3">
          <div class="space-y-6 lg:col-span-2">
            <article class="space-y-4">
              <div class="flex items-center justify-between">
                <h2 class="text-xl font-semibold text-slate-900">Quiz blueprints</h2>
                <button id="refresh-blueprints-btn" class="text-sm font-medium text-cyan-600 hover:text-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500">
                  Refresh
                </button>
              </div>
              <div id="blueprint-list" class="grid gap-4">
                ${emptyState('Create your first blueprint to start building quizzes.')}
              </div>
            </article>

            <article class="space-y-4">
              <div class="flex items-center justify-between">
                <h2 class="text-xl font-semibold text-slate-900">Classrooms</h2>
                <button id="refresh-classrooms-btn" class="text-sm font-medium text-cyan-600 hover:text-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500">
                  Refresh
                </button>
              </div>
              <div id="classroom-list" class="grid gap-4">
                ${emptyState('Set up a classroom to schedule live exams and control access.')}
              </div>
            </article>
          </div>

          <aside class="space-y-6">
            <div id="subscription-card"></div>
            <article class="${MOBILE_SECTION_CLASSES} space-y-4">
              <div class="flex items-center justify-between">
                <h2 class="text-base font-semibold text-slate-900">Live monitoring</h2>
                <button id="refresh-exams-btn" class="text-sm font-medium text-cyan-600 hover:text-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500">
                  Refresh
                </button>
              </div>
              <ul id="exam-list" class="space-y-3 text-sm text-slate-500">
                <li>${emptyState('Scheduled exams appear here when they go live.')}</li>
              </ul>
            </article>
            <article class="${MOBILE_SECTION_CLASSES} space-y-4">
              <div class="flex items-center justify-between">
                <h2 class="text-base font-semibold text-slate-900">Shared quizzes</h2>
                <button id="refresh-shared-btn" class="text-sm font-medium text-cyan-600 hover:text-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500">
                  Refresh
                </button>
              </div>
              <ul id="shared-list" class="space-y-3 text-sm text-slate-500">
                <li>${emptyState('Publish a shareable link to collect responses outside classrooms.')}</li>
              </ul>
            </article>
          </aside>
        </section>

        <section class="space-y-6">
          <article id="blueprint-sheet" class="hidden fixed inset-0 z-40 bg-black/40 px-4 pb-10 pt-24 backdrop-blur-sm sm:px-6 md:px-10">
            <div class="mx-auto max-w-lg rounded-2xl bg-white shadow-xl">
              <form id="blueprint-form" class="flex flex-col gap-4 p-6 sm:p-8" autocomplete="off">
                <div class="flex items-start justify-between gap-4">
                  <div>
                    <h2 class="text-xl font-semibold text-slate-900">Create quiz blueprint</h2>
                    <p class="text-sm text-slate-500 mt-1">Blueprints power live classrooms and shared quiz links.</p>
                  </div>
                  <button type="button" id="close-blueprint-sheet" class="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
                    <span class="sr-only">Close</span>
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div>
                  <label for="blueprint-title" class="block text-sm font-medium text-slate-700">Quiz title</label>
                  <input id="blueprint-title" name="blueprint-title" type="text" required class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400" placeholder="Mid-term Mathematics Quiz" />
                </div>
                <div>
                  <label for="blueprint-description" class="block text-sm font-medium text-slate-700">Description</label>
                  <textarea id="blueprint-description" name="blueprint-description" rows="3" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400" placeholder="Add instructions or topics to cover"></textarea>
                </div>
                <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                  <button type="button" id="blueprint-cancel-btn" class="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
                    Cancel
                  </button>
                  <button type="submit" class="inline-flex items-center justify-center rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500" data-blueprint-submit-label="Create blueprint">
                    Create blueprint
                  </button>
                </div>
              </form>
            </div>
          </article>

          <article id="classroom-sheet" class="hidden fixed inset-0 z-40 bg-black/40 px-4 pb-10 pt-24 backdrop-blur-sm sm:px-6 md:px-10">
            <div class="mx-auto max-w-lg rounded-2xl bg-white shadow-xl">
              <form id="classroom-form" class="flex flex-col gap-4 p-6 sm:p-8" autocomplete="off">
                <div class="flex items-start justify-between gap-4">
                  <div>
                    <h2 class="text-xl font-semibold text-slate-900">Create classroom</h2>
                    <p class="text-sm text-slate-500 mt-1">Control who joins, set quotas, and schedule exams.</p>
                  </div>
                  <button type="button" id="close-classroom-sheet" class="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
                    <span class="sr-only">Close</span>
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div>
                  <label for="classroom-name" class="block text-sm font-medium text-slate-700">Classroom name</label>
                  <input id="classroom-name" name="classroom-name" type="text" required class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400" placeholder="SS2 Chemistry Group" />
                </div>
                <div>
                  <label for="classroom-purpose" class="block text-sm font-medium text-slate-700">Purpose (optional)</label>
                  <input id="classroom-purpose" name="classroom-purpose" type="text" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400" placeholder="Mock exams, weekly drills…" />
                </div>
                <div class="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label for="classroom-seat-quota" class="block text-sm font-medium text-slate-700">Seat quota</label>
                    <input id="classroom-seat-quota" name="classroom-seat-quota" type="number" min="1" inputmode="numeric" required class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400" value="10" />
                    <p class="mt-1 text-xs text-slate-500">Quota is capped by your available seats.</p>
                  </div>
                  <div>
                    <label for="classroom-access-mode" class="block text-sm font-medium text-slate-700">Join method</label>
                    <select id="classroom-access-mode" name="classroom-access-mode" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400">
                      <option value="invite_only">Invite only</option>
                      <option value="open_link">Class link</option>
                      <option value="pin">PIN code</option>
                      <option value="phone_whitelist">Phone whitelist</option>
                    </select>
                  </div>
                </div>
                <div id="classroom-pin-field" class="hidden">
                  <label for="classroom-pin" class="block text-sm font-medium text-slate-700">PIN code</label>
                  <input id="classroom-pin" name="classroom-pin" type="text" minlength="4" maxlength="8" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400" placeholder="e.g. 4521" />
                </div>
                <div id="classroom-phone-field" class="hidden">
                  <label for="classroom-phones" class="block text-sm font-medium text-slate-700">Allowed phone numbers</label>
                  <textarea id="classroom-phones" name="classroom-phones" rows="3" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400" placeholder="+2348031234567, +2348059876543"></textarea>
                  <p class="mt-1 text-xs text-slate-500">Separate numbers with commas or new lines.</p>
                </div>
                <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                  <button type="button" id="classroom-cancel-btn" class="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
                    Cancel
                  </button>
                  <button type="submit" class="inline-flex items-center justify-center rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500" data-classroom-submit-label="Create classroom">
                    Create classroom
                  </button>
                </div>
              </form>
            </div>
          </article>
        </section>
      </section>
    `,
    onMount(container) {
      const state = {
        loading: true,
        error: null,
        blueprints: [],
        classrooms: [],
        exams: [],
        shared: [],
        subscription: null,
        metrics: {
          totalBlueprints: 0,
          publishedBlueprints: 0,
          activeClassrooms: 0,
          liveExams: 0,
        },
        seatUpgrade: {
          loading: false,
        },
      };

      const el = {
        metrics: container.querySelector('#quiz-metrics'),
        blueprintList: container.querySelector('#blueprint-list'),
        classroomList: container.querySelector('#classroom-list'),
        examList: container.querySelector('#exam-list'),
        sharedList: container.querySelector('#shared-list'),
        subscriptionCard: container.querySelector('#subscription-card'),
        seatUpgradeForm: null,
        newBlueprintBtn: container.querySelector('#new-blueprint-btn'),
        newClassroomBtn: container.querySelector('#new-classroom-btn'),
        refreshBlueprintsBtn: container.querySelector('#refresh-blueprints-btn'),
        refreshClassroomsBtn: container.querySelector('#refresh-classrooms-btn'),
        refreshExamsBtn: container.querySelector('#refresh-exams-btn'),
        refreshSharedBtn: container.querySelector('#refresh-shared-btn'),
        blueprintSheet: container.querySelector('#blueprint-sheet'),
        blueprintForm: container.querySelector('#blueprint-form'),
        blueprintCancelBtn: container.querySelector('#blueprint-cancel-btn'),
        closeBlueprintSheet: container.querySelector('#close-blueprint-sheet'),
        classroomSheet: container.querySelector('#classroom-sheet'),
        classroomForm: container.querySelector('#classroom-form'),
        classroomCancelBtn: container.querySelector('#classroom-cancel-btn'),
        closeClassroomSheet: container.querySelector('#close-classroom-sheet'),
        classroomAccessMode: container.querySelector('#classroom-access-mode'),
        classroomPinField: container.querySelector('#classroom-pin-field'),
        classroomPhoneField: container.querySelector('#classroom-phone-field'),
        classroomPhones: container.querySelector('#classroom-phones'),
        seatUpgradeButtonLabel: null,
        blueprintSubmitLabel: null,
        classroomSubmitLabel: null,
      };

      const setSheetVisibility = (sheet, isOpen) => {
        if (!sheet) return;
        sheet.classList.toggle('hidden', !isOpen);
        document.body.classList.toggle('overflow-hidden', isOpen);
      };

      const renderMetrics = () => {
        if (!el.metrics) return;
        const metrics = [
          {
            label: 'Quiz blueprints',
            value: state.metrics.totalBlueprints,
            subLabel: `${state.metrics.publishedBlueprints} published`,
            icon: `
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 5h12M9 3v2m0 14v2m9-5-3 3m0 0-3-3m3 3V6" />
              </svg>
            `,
          },
          {
            label: 'Active classrooms',
            value: state.metrics.activeClassrooms,
            subLabel: `${state.classrooms.length} total`,
            icon: `
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 10h16M4 14h10M4 18h10" />
              </svg>
            `,
          },
          {
            label: 'Live exams',
            value: state.metrics.liveExams,
            subLabel: `${state.exams.length} scheduled`,
            icon: `
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3M5 8V6a2 2 0 012-2h10a2 2 0 012 2v2" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 17h14" />
              </svg>
            `,
          },
          {
            label: 'Shared quiz links',
            value: state.shared.length,
            subLabel: '10 student cap on free tier',
            icon: `
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13.5 4.5 20 11l-6.5 6.5M20 11H4" />
              </svg>
            `,
          },
        ];

        el.metrics.innerHTML = metrics
          .map(
            (metric) => `
            <article class="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
              <div class="flex items-center justify-between">
                <p class="text-sm text-slate-500">${metric.label}</p>
                ${metric.icon}
              </div>
              <div>
                <p class="text-3xl font-semibold text-slate-900">${metric.value}</p>
                <p class="text-xs text-slate-500 mt-1">${metric.subLabel}</p>
              </div>
            </article>
          `
          )
          .join('');
      };

      const renderBlueprints = () => {
        if (!el.blueprintList) return;
        if (!state.blueprints.length) {
          el.blueprintList.innerHTML = emptyState(
            'Create your first blueprint to start building quizzes.'
          );
          return;
        }
        el.blueprintList.innerHTML = state.blueprints
          .map(renderBlueprintCard)
          .join('');
      };

      const renderClassrooms = () => {
        if (!el.classroomList) return;
        if (!state.classrooms.length) {
          el.classroomList.innerHTML = emptyState(
            'Set up a classroom to schedule live exams and control access.'
          );
          return;
        }
        el.classroomList.innerHTML = state.classrooms
          .map(renderClassroomCard)
          .join('');
      };

      const renderExams = () => {
        if (!el.examList) return;
        if (!state.exams.length) {
          el.examList.innerHTML = `<li>${emptyState(
            'Scheduled exams appear here when they go live.'
          )}</li>`;
          return;
        }
        el.examList.innerHTML = state.exams.map(renderExamRow).join('');
      };

      const renderShared = () => {
        if (!el.sharedList) return;
        if (!state.shared.length) {
          el.sharedList.innerHTML = `<li>${emptyState(
            'Publish a shareable link to collect responses outside classrooms.'
          )}</li>`;
          return;
        }
        el.sharedList.innerHTML = state.shared.map(renderSharedQuizRow).join('');
      };

      const renderSubscription = () => {
        if (!el.subscriptionCard) return;
        el.subscriptionCard.innerHTML = renderSubscriptionCard(
          state.subscription
        );
        el.seatUpgradeForm = el.subscriptionCard.querySelector(
          '#seat-upgrade-form'
        );
        el.seatUpgradeButtonLabel = el.subscriptionCard.querySelector(
          '[data-upgrade-label]'
        );
        if (el.seatUpgradeForm) {
          el.seatUpgradeForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (state.seatUpgrade.loading) return;
            const form = event.currentTarget;
            const countField = form.querySelector('#seat-upgrade-count');
            const seats = Number(countField?.value || 0);
            if (!Number.isFinite(seats) || seats <= 0) {
              showToast('Enter the number of seats to add.', { type: 'warning' });
              return;
            }
            try {
              state.seatUpgrade.loading = true;
              if (el.seatUpgradeButtonLabel) {
                el.seatUpgradeButtonLabel.textContent = 'Preparing Paystack…';
                el.seatUpgradeButtonLabel.disabled = true;
              }
              const response = await quizBuilderService.initiateSeatIncrease(
                seats
              );
              showToast(
                'Checkout opened in a new window. Complete payment to finish the upgrade.',
                { type: 'info' }
              );
              if (response?.checkoutUrl) {
                window.open(response.checkoutUrl, '_blank', 'noopener');
              }
              countField.value = '';
            } catch (error) {
              console.error('[QuizBuilder] Seat upgrade failed', error);
              showToast(
                error.message || 'Unable to start seat upgrade checkout.',
                { type: 'error' }
              );
            } finally {
              state.seatUpgrade.loading = false;
              if (el.seatUpgradeButtonLabel) {
                el.seatUpgradeButtonLabel.textContent = 'Add seats';
                el.seatUpgradeButtonLabel.disabled = false;
              }
            }
          });
        }
      };

      const refreshMetrics = () => {
        state.metrics.totalBlueprints = state.blueprints.length;
        state.metrics.publishedBlueprints = state.blueprints.filter(
          (bp) => bp.status === 'published'
        ).length;
        state.metrics.activeClassrooms = state.classrooms.filter(
          (room) => room.status === 'active'
        ).length;
        state.metrics.liveExams = state.exams.filter(
          (exam) => exam.status === 'live'
        ).length;
        renderMetrics();
      };

      const loadAll = async () => {
        state.loading = true;
        try {
          const results = await Promise.allSettled([
            quizBuilderService.listBlueprints(),
            quizBuilderService.listClassrooms(),
            quizBuilderService.listUpcomingExams(),
            quizBuilderService.listSharedQuizzes(),
            quizBuilderService.getSubscriptionSummary(),
          ]);

          const [blueprints, classrooms, exams, shared, subscription] = results;

          if (blueprints.status === 'fulfilled') {
            state.blueprints = blueprints.value;
          } else if (blueprints.reason) {
            console.warn('[QuizBuilder] Failed to load blueprints', blueprints.reason);
            showToast(
              blueprints.reason.message ||
                'Unable to load quiz blueprints. Check Supabase migrations.',
              { type: 'error' }
            );
          }

          if (classrooms.status === 'fulfilled') {
            state.classrooms = classrooms.value;
          } else if (classrooms.reason) {
            console.warn('[QuizBuilder] Failed to load classrooms', classrooms.reason);
            showToast(
              classrooms.reason.message ||
                'Unable to load classrooms. Check Supabase policies.',
              { type: 'error' }
            );
          }

          if (exams.status === 'fulfilled') {
            state.exams = exams.value;
          }

          if (shared.status === 'fulfilled') {
            state.shared = shared.value;
          }

          if (subscription.status === 'fulfilled') {
            state.subscription = subscription.value;
          }

          refreshMetrics();
          renderBlueprints();
          renderClassrooms();
          renderExams();
          renderShared();
          renderSubscription();
        } finally {
          state.loading = false;
        }
      };

      const reloadBlueprints = async () => {
        try {
          const data = await quizBuilderService.listBlueprints();
          state.blueprints = data;
          refreshMetrics();
          renderBlueprints();
        } catch (error) {
          console.error('[QuizBuilder] Reload blueprints failed', error);
          showToast(error.message || 'Unable to refresh blueprints.', {
            type: 'error',
          });
        }
      };

      const reloadClassrooms = async () => {
        try {
          const data = await quizBuilderService.listClassrooms();
          state.classrooms = data;
          refreshMetrics();
          renderClassrooms();
        } catch (error) {
          console.error('[QuizBuilder] Reload classrooms failed', error);
          showToast(error.message || 'Unable to refresh classrooms.', {
            type: 'error',
          });
        }
      };

      const reloadExams = async () => {
        try {
          const data = await quizBuilderService.listUpcomingExams();
          state.exams = data;
          refreshMetrics();
          renderExams();
        } catch (error) {
          console.error('[QuizBuilder] Reload exams failed', error);
          showToast(error.message || 'Unable to refresh exam schedule.', {
            type: 'error',
          });
        }
      };

      const reloadShared = async () => {
        try {
          const data = await quizBuilderService.listSharedQuizzes();
          state.shared = data;
          refreshMetrics();
          renderShared();
        } catch (error) {
          console.error('[QuizBuilder] Reload shared failed', error);
          showToast(error.message || 'Unable to refresh shared quiz links.', {
            type: 'error',
          });
        }
      };

      const handleBlueprintActions = (event) => {
        const actionBtn = event.target.closest('[data-blueprint-action]');
        if (!actionBtn) return;
        const id = actionBtn.dataset.blueprintId;
        const action = actionBtn.dataset.blueprintAction;
        if (!id || !action) return;

        if (action === 'edit') {
          window.open(`/apps/learner/exam-builder.html?blueprint=${id}`, '_blank');
          return;
        }

        if (action === 'duplicate') {
          quizBuilderService
            .duplicateBlueprint(id)
            .then(() => {
              showToast('Blueprint duplicated successfully.', { type: 'success' });
              reloadBlueprints();
            })
            .catch((error) => {
              console.error('[QuizBuilder] Duplicate blueprint failed', error);
              showToast(
                error.message || 'Unable to duplicate blueprint. Try again later.',
                { type: 'error' }
              );
            });
          return;
        }

        if (action === 'archive') {
          quizBuilderService
            .archiveBlueprint(id)
            .then(() => {
              showToast('Blueprint archived.', { type: 'info' });
              reloadBlueprints();
            })
            .catch((error) => {
              console.error('[QuizBuilder] Archive blueprint failed', error);
              showToast(
                error.message || 'Unable to archive blueprint right now.',
                { type: 'error' }
              );
            });
        }
      };

      const handleClassroomActions = (event) => {
        const actionBtn = event.target.closest('[data-classroom-action]');
        if (!actionBtn) return;
        const id = actionBtn.dataset.classroomId;
        const action = actionBtn.dataset.classroomAction;
        if (!id || !action) return;

        if (action === 'manage') {
          window.open(`/apps/admin/classroom.html?id=${id}`, '_blank');
          return;
        }

        if (action === 'schedule') {
          openScheduleExamModal(id);
          return;
        }

        if (action === 'suspend') {
          showToast(
            'Suspend classroom flow not wired yet. Update from the classroom detail page.',
            { type: 'warning' }
          );
        }
      };

      const handleExamActions = (event) => {
        const button = event.target.closest('[data-exam-action]');
        if (!button) return;
        const { examAction: action, examId: id } = button.dataset;
        if (!id || !action) return;

        if (action === 'monitor') {
          window.open(`/apps/admin/exam-monitor.html?id=${id}`, '_blank');
        } else if (action === 'summary') {
          window.open(`/apps/admin/exam-summary.html?id=${id}`, '_blank');
        }
      };

      const handleSharedActions = (event) => {
        const button = event.target.closest('[data-shared-action]');
        if (!button) return;
        const { sharedAction: action, shareId: id } = button.dataset;
        if (!id || !action) return;

        if (action === 'copy') {
          const url = `${window.location.origin}/take-quiz?link=${id}`;
          navigator.clipboard
            .writeText(url)
            .then(() => showToast('Share link copied to clipboard.', { type: 'success' }))
            .catch(() =>
              showToast('Unable to copy link. Copy manually from analytics.', {
                type: 'error',
              })
            );
          return;
        }

        if (action === 'analytics') {
          window.open(`/apps/admin/shared-quiz-analytics.html?id=${id}`, '_blank');
          return;
        }

        if (action === 'close') {
          showToast(
            'Closing share links will be available after the next backend release.',
            { type: 'info' }
          );
        }
      };

      const parsePhoneList = (input) => {
        if (!input) return [];
        return input
          .split(/[\n,]+/)
          .map((entry) => entry.trim())
          .filter(Boolean);
      };

      const handleBlueprintSubmit = async (event) => {
        event.preventDefault();
        if (!el.blueprintForm) return;
        const formData = new FormData(el.blueprintForm);
        const title = formData.get('blueprint-title')?.toString().trim();
        const description = formData.get('blueprint-description')?.toString().trim();
        if (!title) {
          showToast('Enter a quiz title.', { type: 'warning' });
          return;
        }
        const submitBtn = el.blueprintForm.querySelector(
          '[data-blueprint-submit-label]'
        );
        try {
          if (submitBtn) {
            submitBtn.textContent = 'Creating…';
            submitBtn.disabled = true;
          }
          const blueprint = await quizBuilderService.createBlueprint({
            title,
            description,
          });
          state.blueprints = [blueprint, ...state.blueprints];
          refreshMetrics();
          renderBlueprints();
          setSheetVisibility(el.blueprintSheet, false);
          el.blueprintForm.reset();
          showToast('Blueprint created. Launching the builder…', {
            type: 'success',
          });
          window.open(
            `/apps/learner/exam-builder.html?blueprint=${blueprint.id}`,
            '_blank'
          );
        } catch (error) {
          console.error('[QuizBuilder] Create blueprint failed', error);
          const message =
            error instanceof QuizBuilderServiceError
              ? error.message
              : 'Unable to create blueprint. Please try again.';
          showToast(message, { type: 'error' });
        } finally {
          if (submitBtn) {
            submitBtn.textContent = 'Create blueprint';
            submitBtn.disabled = false;
          }
        }
      };

      const handleClassroomSubmit = async (event) => {
        event.preventDefault();
        if (!el.classroomForm) return;
        const formData = new FormData(el.classroomForm);
        const name = formData.get('classroom-name')?.toString().trim();
        const purpose = formData.get('classroom-purpose')?.toString().trim();
        const seatQuota = Number(
          formData.get('classroom-seat-quota')?.toString() || '0'
        );
        const accessMode =
          formData.get('classroom-access-mode')?.toString() || 'invite_only';
        const pin = formData.get('classroom-pin')?.toString().trim();
        const phones = parsePhoneList(formData.get('classroom-phones'));

        if (!name) {
          showToast('Enter a classroom name.', { type: 'warning' });
          return;
        }

        if (!Number.isFinite(seatQuota) || seatQuota <= 0) {
          showToast('Seat quota must be at least one.', { type: 'warning' });
          return;
        }

        if (accessMode === 'pin' && (!pin || pin.length < 4)) {
          showToast('PIN must be at least 4 characters.', { type: 'warning' });
          return;
        }

        if (accessMode === 'phone_whitelist' && phones.length === 0) {
          showToast('Provide at least one phone number for whitelist access.', {
            type: 'warning',
          });
          return;
        }

        const submitBtn = el.classroomForm.querySelector(
          '[data-classroom-submit-label]'
        );
        try {
          if (submitBtn) {
            submitBtn.textContent = 'Creating…';
            submitBtn.disabled = true;
          }
          const classroom = await quizBuilderService.createClassroom({
            name,
            purpose,
            seatQuota,
            accessMode,
            joinPin: accessMode === 'pin' ? pin : null,
            phoneWhitelist: accessMode === 'phone_whitelist' ? phones : [],
          });
          state.classrooms = [classroom, ...state.classrooms];
          refreshMetrics();
          renderClassrooms();
          setSheetVisibility(el.classroomSheet, false);
          el.classroomForm.reset();
          showToast('Classroom created successfully.', { type: 'success' });
        } catch (error) {
          console.error('[QuizBuilder] Create classroom failed', error);
          const message =
            error instanceof QuizBuilderServiceError
              ? error.message
              : 'Unable to create classroom. Please try again.';
          showToast(message, { type: 'error' });
        } finally {
          if (submitBtn) {
            submitBtn.textContent = 'Create classroom';
            submitBtn.disabled = false;
          }
        }
      };

      const handleAccessModeChange = (event) => {
        const mode = event.target.value;
        if (!el.classroomPinField || !el.classroomPhoneField) return;
        el.classroomPinField.classList.toggle('hidden', mode !== 'pin');
        el.classroomPhoneField.classList.toggle(
          'hidden',
          mode !== 'phone_whitelist'
        );
      };

      const openScheduleExamModal = (classroomId) => {
        const modal = document.createElement('div');
        modal.id = 'schedule-exam-modal';
        modal.className = 'fixed inset-0 z-40 bg-black/40 px-4 pb-10 pt-24 backdrop-blur-sm sm:px-6 md:px-10';
        modal.innerHTML = `
          <div class="mx-auto max-w-lg rounded-2xl bg-white shadow-xl">
            <form id="schedule-exam-form" class="flex flex-col gap-4 p-6 sm:p-8" autocomplete="off">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <h2 class="text-xl font-semibold text-slate-900">Schedule Exam</h2>
                  <p class="text-sm text-slate-500 mt-1">Create a new exam session for this classroom.</p>
                </div>
                <button type="button" class="close-schedule-modal rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
                  <span class="sr-only">Close</span>
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div>
                <label for="exam-blueprint" class="block text-sm font-medium text-slate-700">Quiz Blueprint</label>
                <select id="exam-blueprint" name="exam-blueprint" required class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400">
                  <option value="">Select a quiz blueprint</option>
                  ${state.blueprints.filter(bp => bp.status === 'published').map(bp =>
                    `<option value="${bp.id}">${bp.title}</option>`
                  ).join('')}
                </select>
              </div>

              <div class="grid gap-4 sm:grid-cols-2">
                <div>
                  <label for="exam-start-date" class="block text-sm font-medium text-slate-700">Start Date</label>
                  <input id="exam-start-date" name="exam-start-date" type="date" required class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400">
                </div>
                <div>
                  <label for="exam-start-time" class="block text-sm font-medium text-slate-700">Start Time</label>
                  <input id="exam-start-time" name="exam-start-time" type="time" required class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400">
                </div>
              </div>

              <div class="grid gap-4 sm:grid-cols-2">
                <div>
                  <label for="exam-end-date" class="block text-sm font-medium text-slate-700">End Date</label>
                  <input id="exam-end-date" name="exam-end-date" type="date" required class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400">
                </div>
                <div>
                  <label for="exam-end-time" class="block text-sm font-medium text-slate-700">End Time</label>
                  <input id="exam-end-time" name="exam-end-time" type="time" required class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400">
                </div>
              </div>

              <div>
                <label for="exam-delivery-mode" class="block text-sm font-medium text-slate-700">Delivery Mode</label>
                <select id="exam-delivery-mode" name="exam-delivery-mode" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400">
                  <option value="synchronous">Synchronous - All students start together</option>
                  <option value="asynchronous">Asynchronous - Students start anytime within window</option>
                </select>
              </div>

              <div>
                <label class="flex items-center gap-2">
                  <input id="exam-pin-required" name="exam-pin-required" type="checkbox" class="rounded border-slate-300 text-cyan-600 focus:border-cyan-500 focus:ring-cyan-400">
                  <span class="text-sm font-medium text-slate-700">Require PIN to access exam</span>
                </label>
              </div>

              <div id="exam-pin-field" class="hidden">
                <label for="exam-pin" class="block text-sm font-medium text-slate-700">Access PIN</label>
                <input id="exam-pin" name="exam-pin" type="text" minlength="4" maxlength="8" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400" placeholder="e.g. 4521">
              </div>

              <div class="grid gap-4 sm:grid-cols-2">
                <div>
                  <label for="exam-max-attempts" class="block text-sm font-medium text-slate-700">Max Attempts</label>
                  <input id="exam-max-attempts" name="exam-max-attempts" type="number" min="1" value="1" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400">
                </div>
                <div>
                  <label for="exam-passing-score" class="block text-sm font-medium text-slate-700">Passing Score (%)</label>
                  <input id="exam-passing-score" name="exam-passing-score" type="number" min="0" max="100" value="70" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400">
                </div>
              </div>

              <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                <button type="button" class="close-schedule-modal inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
                  Cancel
                </button>
                <button type="submit" class="inline-flex items-center justify-center rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500" data-schedule-label="Schedule exam">
                  Schedule exam
                </button>
              </div>
            </form>
          </div>
        `;

        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';

        // Add event listeners
        modal.querySelector('.close-schedule-modal').addEventListener('click', () => closeScheduleExamModal());
        modal.addEventListener('click', (e) => {
          if (e.target === modal) closeScheduleExamModal();
        });

        const pinRequiredCheckbox = modal.querySelector('#exam-pin-required');
        const pinField = modal.querySelector('#exam-pin-field');

        pinRequiredCheckbox.addEventListener('change', (e) => {
          pinField.classList.toggle('hidden', !e.target.checked);
        });

        modal.querySelector('#schedule-exam-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          await handleScheduleExamSubmit(e, classroomId);
        });

        // Set minimum dates to today
        const today = new Date().toISOString().split('T')[0];
        modal.querySelector('#exam-start-date').min = today;
        modal.querySelector('#exam-end-date').min = today;
      };

      const closeScheduleExamModal = () => {
        const modal = document.getElementById('schedule-exam-modal');
        if (modal) {
          modal.remove();
          document.body.style.overflow = '';
        }
      };

      const handleScheduleExamSubmit = async (event, classroomId) => {
        event.preventDefault();
        const form = event.target;
        const submitBtn = form.querySelector('[data-schedule-label]');

        const formData = new FormData(form);
        const startDate = formData.get('exam-start-date');
        const startTime = formData.get('exam-start-time');
        const endDate = formData.get('exam-end-date');
        const endTime = formData.get('exam-end-time');

        const startsAt = new Date(`${startDate}T${startTime}`);
        const endsAt = new Date(`${endDate}T${endTime}`);

        if (endsAt <= startsAt) {
          showToast('End time must be after start time.', { type: 'warning' });
          return;
        }

        const examData = {
          blueprintId: formData.get('exam-blueprint'),
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          deliveryMode: formData.get('exam-delivery-mode'),
          pinRequired: formData.get('exam-pin-required') === 'on',
          accessPin: formData.get('exam-pin') || null,
          maxAttempts: parseInt(formData.get('exam-max-attempts')) || 1,
          passingScore: parseInt(formData.get('exam-passing-score')) || 70,
        };

        try {
          submitBtn.textContent = 'Scheduling…';
          submitBtn.disabled = true;

          await quizBuilderService.scheduleExamFromClassroom(classroomId, examData);

          showToast('Exam scheduled successfully!', { type: 'success' });
          closeScheduleExamModal();
          reloadExams();
          reloadClassrooms();
        } catch (error) {
          console.error('[QuizBuilder] Failed to schedule exam', error);
          showToast(
            error.message || 'Unable to schedule exam. Please try again.',
            { type: 'error' }
          );
        } finally {
          submitBtn.textContent = 'Schedule exam';
          submitBtn.disabled = false;
        }
      };

      container.addEventListener('click', handleBlueprintActions);
      container.addEventListener('click', handleClassroomActions);
      container.addEventListener('click', handleExamActions);
      container.addEventListener('click', handleSharedActions);

      el.newBlueprintBtn?.addEventListener('click', () =>
        setSheetVisibility(el.blueprintSheet, true)
      );
      el.closeBlueprintSheet?.addEventListener('click', () =>
        setSheetVisibility(el.blueprintSheet, false)
      );
      el.blueprintCancelBtn?.addEventListener('click', () =>
        setSheetVisibility(el.blueprintSheet, false)
      );
      el.newClassroomBtn?.addEventListener('click', () =>
        setSheetVisibility(el.classroomSheet, true)
      );
      el.closeClassroomSheet?.addEventListener('click', () =>
        setSheetVisibility(el.classroomSheet, false)
      );
      el.classroomCancelBtn?.addEventListener('click', () =>
        setSheetVisibility(el.classroomSheet, false)
      );
      el.blueprintForm?.addEventListener('submit', handleBlueprintSubmit);
      el.classroomForm?.addEventListener('submit', handleClassroomSubmit);
      el.classroomAccessMode?.addEventListener('change', handleAccessModeChange);
      el.refreshBlueprintsBtn?.addEventListener('click', reloadBlueprints);
      el.refreshClassroomsBtn?.addEventListener('click', reloadClassrooms);
      el.refreshExamsBtn?.addEventListener('click', reloadExams);
      el.refreshSharedBtn?.addEventListener('click', reloadShared);

      loadAll().catch((error) => {
        console.error('[QuizBuilder] Initial load failed', error);
        showToast(
          error.message || 'Unable to load quiz builder data. Check console for details.',
          { type: 'error' }
        );
      });
    },
  };
}

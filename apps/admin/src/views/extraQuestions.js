import { dataService } from '../services/dataService.js';
import { openModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';

const DEFAULT_VISIBILITY = Object.freeze({
  allowAllDepartments: true,
  departmentIds: [],
  allowAllPlans: true,
  planTiers: [],
});

function normalizeVisibility(value) {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_VISIBILITY };
  }
  return {
    allowAllDepartments:
      value.allowAllDepartments !== undefined
        ? Boolean(value.allowAllDepartments)
        : DEFAULT_VISIBILITY.allowAllDepartments,
    departmentIds: Array.isArray(value.departmentIds)
      ? value.departmentIds.map(String)
      : DEFAULT_VISIBILITY.departmentIds.slice(),
    allowAllPlans:
      value.allowAllPlans !== undefined
        ? Boolean(value.allowAllPlans)
        : DEFAULT_VISIBILITY.allowAllPlans,
    planTiers: Array.isArray(value.planTiers)
      ? value.planTiers.map(String)
      : DEFAULT_VISIBILITY.planTiers.slice(),
  };
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function truncate(text, limit = 140) {
  if (!text) return '';
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1)}…`;
}

function escapeHtml(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return value
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightMatches(text, term) {
  if (!text) return '';
  if (!term) return escapeHtml(text);
  const regex = new RegExp(`(${escapeRegExp(term)})`, 'gi');
  const placeholderStart = '__@@__';
  const placeholderEnd = '__##__';
  const withPlaceholders = text.replace(regex, `${placeholderStart}$1${placeholderEnd}`);
  const escaped = escapeHtml(withPlaceholders);
  return escaped
    .replace(new RegExp(placeholderStart, 'g'), '<mark>')
    .replace(new RegExp(placeholderEnd, 'g'), '</mark>');
}

function questionMatchesTerm(question, term) {
  if (!term) return true;
  const normalized = term.toLowerCase();
  const haystack = [question.stem, question.explanation]
    .concat((question.options || []).map((option) => option.content))
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(normalized);
}

function derivePlanTierInfo(products) {
  const tierMap = new Map();
  if (Array.isArray(products)) {
    products.forEach((product) => {
      (product.subscription_plans || []).forEach((plan) => {
        if (!plan.plan_tier) return;
        const tier = String(plan.plan_tier);
        if (!tierMap.has(tier)) {
          tierMap.set(tier, new Set());
        }
        if (plan.name) {
          tierMap.get(tier).add(plan.name);
        }
      });
    });
  }

  const list = Array.from(tierMap.entries())
    .map(([tier, namesSet]) => {
      const names = Array.from(namesSet);
      const preview = names.slice(0, 2).join(', ');
      const suffix = names.length > 2 ? `, +${names.length - 2} more` : '';
      return {
        id: tier,
        tier,
        names,
        label: names.length ? `${tier} (${preview}${suffix})` : tier,
      };
    })
    .sort((a, b) => a.tier.localeCompare(b.tier, undefined, { numeric: true }));

  const map = new Map(list.map((entry) => [entry.tier, entry]));
  return { list, map };
}

function describeVisibility(rules, departmentsMap, planTierMap) {
  const parts = [];
  if (rules.allowAllDepartments) {
    parts.push('All departments');
  } else if (rules.departmentIds.length) {
    const names = rules.departmentIds
      .map((id) => departmentsMap.get(id)?.name || id)
      .slice(0, 3)
      .join(', ');
    const extra =
      rules.departmentIds.length > 3
        ? ` +${rules.departmentIds.length - 3} more`
        : '';
    parts.push(`Departments: ${names}${extra}`);
  } else {
    parts.push('Departments: none selected');
  }

  if (rules.allowAllPlans) {
    parts.push('All plan tiers');
  } else if (rules.planTiers.length) {
    const names = rules.planTiers
      .map((tier) => planTierMap.get(tier)?.label || tier)
      .slice(0, 3)
      .join(', ');
    const extra =
      rules.planTiers.length > 3
        ? ` +${rules.planTiers.length - 3} more`
        : '';
    parts.push(`Plan tiers: ${names}${extra}`);
  } else {
    parts.push('Plan tiers: none selected');
  }

  return parts.join(' • ');
}

function renderStatusBadge(set) {
  const base =
    'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold';
  if (set.is_active) {
    return `<span class="${base} bg-emerald-100 text-emerald-700">Active</span>`;
  }
  return `<span class="${base} bg-slate-200 text-slate-600">Inactive</span>`;
}

function renderScheduleSummary(set) {
  if (!set.starts_at && !set.ends_at) {
    return 'No schedule';
  }
  if (set.starts_at && set.ends_at) {
    return `${formatDateTime(set.starts_at)} → ${formatDateTime(set.ends_at)}`;
  }
  if (set.starts_at) {
    return `Opens ${formatDateTime(set.starts_at)}`;
  }
  return `Closes ${formatDateTime(set.ends_at)}`;
}

function renderTimeLimitSummary(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) {
    return 'No timer';
  }
  const minutes = Math.round(value / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) {
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  return `${hours}h ${remainingMinutes}m`;
}

function renderExtraSetCard(set, departmentsMap, planTierMap) {
  const visibility = describeVisibility(
    normalizeVisibility(set.visibility_rules),
    departmentsMap,
    planTierMap
  );
  return `
    <article class="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-cyan-200 hover:shadow-md" data-role="set-card" data-id="${set.id}">
      <header class="flex items-start justify-between gap-4">
        <div>
          <h3 class="text-lg font-semibold text-slate-900">${set.title}</h3>
          <p class="mt-1 text-sm text-slate-600">${set.description || 'No description provided.'}</p>
        </div>
        ${renderStatusBadge(set)}
      </header>
      <dl class="grid gap-2 text-xs text-slate-500">
        <div class="flex items-center justify-between">
          <dt class="font-semibold text-slate-600">Questions</dt>
          <dd>${set.question_count ?? 0}</dd>
        </div>
        <div class="flex items-center justify-between">
          <dt class="font-semibold text-slate-600">Schedule</dt>
          <dd>${renderScheduleSummary(set)}</dd>
        </div>
        <div class="flex items-center justify-between">
          <dt class="font-semibold text-slate-600">Timer</dt>
          <dd>${renderTimeLimitSummary(set.time_limit_seconds)}</dd>
        </div>
        <div class="flex flex-col gap-1">
          <dt class="font-semibold text-slate-600">Audience</dt>
          <dd class="text-slate-500">${visibility}</dd>
        </div>
      </dl>
      <footer class="mt-auto flex flex-wrap gap-2">
        <button type="button" class="rounded-md bg-cyan-700 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-800" data-role="manage-set" data-id="${set.id}">Manage questions</button>
        <button type="button" class="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300" data-role="edit-set" data-id="${set.id}">Edit details</button>
        <button type="button" class="rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:border-red-300" data-role="delete-set" data-id="${set.id}">Delete</button>
      </footer>
    </article>
  `;
}

function renderListView(sets, departmentsMap, planTierMap) {
  if (!sets.length) {
    return `
      <section class="space-y-6">
        <header class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-semibold text-slate-900">Extra Questions</h1>
            <p class="text-sm text-slate-600">Create curated question pools and control who can see them.</p>
          </div>
          <button type="button" class="rounded-md bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800" data-role="create-set">Create extra set</button>
        </header>
        <div class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-600">
          No extra question sets yet. Create your first one to deliver bonus practice to specific learners.
        </div>
      </section>
    `;
  }

  const cards = sets
    .map((set) => renderExtraSetCard(set, departmentsMap, planTierMap))
    .join('');

  return `
    <section class="space-y-6">
      <header class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-semibold text-slate-900">Extra Questions</h1>
          <p class="text-sm text-slate-600">Manage bonus question pools and control their availability.</p>
        </div>
        <button type="button" class="rounded-md bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800" data-role="create-set">Create extra set</button>
      </header>
      <div class="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
        ${cards}
      </div>
    </section>
  `;
}

function renderQuestionRows(questions, searchTerm = '') {
  const term = (searchTerm || '').trim();
  const filtered = term
    ? questions.filter((question) => questionMatchesTerm(question, term))
    : questions;

  if (!filtered.length) {
    if (questions.length) {
      return `
        <tr>
          <td colspan="4" class="px-4 py-6 text-center text-sm text-slate-500">No questions match “${escapeHtml(term)}”.</td>
        </tr>
      `;
    }
    return `
      <tr>
        <td colspan="4" class="px-4 py-6 text-center text-sm text-slate-500">No questions uploaded yet.</td>
      </tr>
    `;
  }

  return filtered
    .map((question) => {
      const correctOptions = question.options
        .filter((option) => option.is_correct)
        .map((option) => option.label)
        .join(', ');
      const optionsMarkup = question.options
        .map(
          (option) => `
            <span class="flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">
              <span class="font-semibold text-slate-800">${option.label}.</span>
              ${term ? highlightMatches(option.content, term) : escapeHtml(option.content)}
            </span>
          `
        )
        .join('');
      const stemContent = term
        ? highlightMatches(question.stem, term)
        : escapeHtml(truncate(question.stem, 220));
      return `
        <tr class="border-b border-slate-100" data-question-id="${question.id}">
          <td class="whitespace-pre-line px-4 py-3 text-sm text-slate-800">${stemContent}</td>
          <td class="px-4 py-3">
            <div class="flex flex-wrap gap-1">${optionsMarkup}</div>
          </td>
          <td class="px-4 py-3 text-sm text-slate-500">${escapeHtml(correctOptions || '—')}</td>
          <td class="px-4 py-3 text-right">
            <button type="button" class="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:border-red-300" data-role="delete-question" data-question-id="${question.id}">Delete</button>
          </td>
        </tr>
      `;
    })
    .join('');
}

function renderDetailView(set, questions, context) {
  const visibility = describeVisibility(
    normalizeVisibility(set.visibility_rules),
    context.departmentsMap,
    context.planTierMap
  );

  return `
    <section class="space-y-6">
      <header class="flex flex-wrap items-start justify-between gap-4">
        <div class="space-y-2">
          <button type="button" class="flex items-center gap-1 text-sm text-cyan-700 hover:text-cyan-900" data-role="back-to-list">
            <span aria-hidden="true">&larr;</span>
            Back to sets
          </button>
          <div>
            <h1 class="text-2xl font-semibold text-slate-900">${set.title}</h1>
            <p class="text-sm text-slate-600">${set.description || 'No description provided.'}</p>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300" data-role="edit-set">Edit details</button>
          <button type="button" class="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300" data-role="toggle-set-status">${set.is_active ? 'Deactivate' : 'Activate'}</button>
          <button type="button" class="rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:border-red-300" data-role="delete-set">Delete</button>
        </div>
      </header>

      <section class="grid gap-4 md:grid-cols-3">
        <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
          <p class="mt-2 text-lg font-semibold text-slate-900">${renderStatusBadge(set)}</p>
          <p class="mt-2 text-xs text-slate-500">${renderScheduleSummary(set)}</p>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Timer</p>
          <p class="mt-2 text-lg font-semibold text-slate-900">${renderTimeLimitSummary(set.time_limit_seconds)}</p>
          <p class="mt-2 text-xs text-slate-500">Control how long learners have when attempting this set.</p>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:col-span-2">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Audience</p>
          <p class="mt-2 text-sm text-slate-700">${visibility}</p>
        </div>
      </section>

      <section class="grid gap-4 lg:grid-cols-2">
        <article class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <header class="mb-4 flex items-center justify-between">
            <div>
              <h2 class="text-lg font-semibold text-slate-900">Upload from file</h2>
              <p class="text-sm text-slate-500">Supports Aiken formatted .txt, .md, or .aiken files.</p>
            </div>
          </header>
          <input type="file" accept=".txt,.md,.aiken" class="hidden" data-role="file-input" />
          <button type="button" class="inline-flex items-center gap-2 rounded-md bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800" data-role="trigger-file-upload">
            <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M4 3a2 2 0 00-2 2v2a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4z" />
              <path d="M4 11a2 2 0 00-2 2v2a2 2 0 002 2h5v-2H4v-2h12v2h-5v2h5a2 2 0 002-2v-2a2 2 0 00-2-2H4z" />
              <path d="M7 9l3-3 3 3H7z" />
            </svg>
            Select Aiken file
          </button>
          <p class="mt-3 text-xs text-slate-500">We’ll parse the file and add the questions to this set. Existing questions stay untouched.</p>
        </article>

        <article class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <header class="mb-4">
            <h2 class="text-lg font-semibold text-slate-900">Paste Aiken text</h2>
            <p class="text-sm text-slate-500">Paste questions below, validate, then upload. Errors highlight the affected line.</p>
          </header>
          <textarea rows="10" class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono text-slate-800 focus:border-cyan-600 focus:ring-1 focus:ring-cyan-600" placeholder="Enter Aiken formatted questions" data-role="aiken-text"></textarea>
          <p class="mt-2 hidden text-xs text-red-600" data-role="inline-error"></p>
          <div class="mt-3 flex gap-2">
            <button type="button" class="rounded-md bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800" data-role="validate-upload">Validate &amp; upload</button>
            <button type="button" class="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300" data-role="clear-inline">Clear</button>
          </div>
        </article>
      </section>

      <section class="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header class="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <h2 class="text-lg font-semibold text-slate-900">
            Questions <span class="text-sm font-normal text-slate-500" data-role="question-count-label">(${questions.length})</span>
          </h2>
          <div class="relative w-full max-w-sm">
            <input
              type="search"
              class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:border-cyan-600 focus:outline-none focus:ring-1 focus:ring-cyan-600"
              placeholder="Search questions…"
              data-role="question-search"
            />
            <span class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M5 11a6 6 0 1012 0 6 6 0 00-12 0z" />
              </svg>
            </span>
          </div>
        </header>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-slate-100 text-sm">
            <thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th class="px-4 py-3 text-left font-semibold">Question</th>
                <th class="px-4 py-3 text-left font-semibold">Options</th>
                <th class="px-4 py-3 text-left font-semibold">Correct</th>
                <th class="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100" data-role="question-table">
              ${renderQuestionRows(questions)}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  `;
}

function highlightTextareaLine(textarea, lineNumber) {
  if (!textarea || !lineNumber || lineNumber < 1) return;
  const lines = textarea.value.split('\n');
  let start = 0;
  for (let i = 0; i < lineNumber - 1 && i < lines.length; i += 1) {
    start += lines[i].length + 1;
  }
  const line = lines[lineNumber - 1] || '';
  const end = start + line.length;
  textarea.focus();
  textarea.setSelectionRange(start, end);
  textarea.scrollTop = textarea.scrollHeight * ((lineNumber - 1) / lines.length);
  textarea.classList.add('ring-2', 'ring-red-500');
  setTimeout(() => textarea.classList.remove('ring-2', 'ring-red-500'), 1200);
}

function toLocalDateTimeInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (num) => String(num).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function fromLocalDateTimeInput(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toISOString();
}

function bindVisibilityControls(form) {
  const deptToggle = form.querySelector('[data-role="toggle-departments"]');
  const deptOptions = form.querySelector('[data-role="department-options"]');
  const planToggle = form.querySelector('[data-role="toggle-plans"]');
  const planOptions = form.querySelector('[data-role="plan-options"]');

  const updateSection = (toggle, container) => {
    if (!toggle || !container) return;
    const disabled = toggle.checked;
    container.classList.toggle('opacity-60', disabled);
    container.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      checkbox.disabled = disabled;
    });
  };

  if (deptToggle && deptOptions) {
    updateSection(deptToggle, deptOptions);
    deptToggle.addEventListener('change', () => updateSection(deptToggle, deptOptions));
  }
  if (planToggle && planOptions) {
    updateSection(planToggle, planOptions);
    planToggle.addEventListener('change', () => updateSection(planToggle, planOptions));
  }
}

function openSetEditor({ mode, set, departments, planTiers, onSave }) {
  const visibility = normalizeVisibility(set?.visibility_rules);
  const timeLimitMinutes = set?.time_limit_seconds
    ? Math.round(Number(set.time_limit_seconds) / 60)
    : '';

  openModal({
    title: mode === 'create' ? 'Create Extra Question Set' : 'Edit Extra Question Set',
    render: ({ body, footer, close }) => {
      const departmentOptions = departments.length
        ? departments
            .map(
              (dept) => `
                <label class="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
                  <input type="checkbox" name="departmentIds" value="${dept.id}" ${
                    visibility.departmentIds.includes(dept.id) ? 'checked' : ''
                  } />
                  <span>${dept.name}</span>
                </label>
              `
            )
            .join('')
        : '<p class="text-sm text-slate-500">No departments available.</p>';

      const planTierOptions = planTiers.list.length
        ? planTiers.list
            .map(
              (tier) => `
                <label class="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
                  <input type="checkbox" name="planTiers" value="${tier.tier}" ${
                    visibility.planTiers.includes(tier.tier) ? 'checked' : ''
                  } />
                  <span>${tier.label}</span>
                </label>
              `
            )
            .join('')
        : '<p class="text-sm text-slate-500">No plan tiers detected.</p>';

      body.innerHTML = `
        <form id="extra-set-form" class="space-y-4">
          <div>
            <label class="text-sm font-medium text-slate-700">Title</label>
            <input type="text" name="title" required value="${set?.title || ''}" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-cyan-600 focus:outline-none focus:ring-1 focus:ring-cyan-600" placeholder="Daily challenge – Week 1" />
          </div>
          <div>
            <label class="text-sm font-medium text-slate-700">Description</label>
            <textarea name="description" rows="3" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-cyan-600 focus:outline-none focus:ring-1 focus:ring-cyan-600" placeholder="Short summary for admins">${set?.description || ''}</textarea>
          </div>
          <div class="grid gap-4 md:grid-cols-2">
            <label class="text-sm font-medium text-slate-700">
              <span>Opens at</span>
              <input type="datetime-local" name="starts_at" value="${toLocalDateTimeInput(set?.starts_at)}" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-cyan-600 focus:outline-none focus:ring-1 focus:ring-cyan-600" />
            </label>
            <label class="text-sm font-medium text-slate-700">
              <span>Closes at</span>
              <input type="datetime-local" name="ends_at" value="${toLocalDateTimeInput(set?.ends_at)}" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-cyan-600 focus:outline-none focus:ring-1 focus:ring-cyan-600" />
            </label>
          </div>
          <label class="text-sm font-medium text-slate-700">
            <span>Timer (minutes)</span>
            <input type="number" min="0" name="time_limit_minutes" value="${timeLimitMinutes}" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-cyan-600 focus:outline-none focus:ring-1 focus:ring-cyan-600" placeholder="e.g. 25" />
            <span class="mt-1 block text-xs text-slate-500">Leave blank to disable the timer for learners.</span>
          </label>
          <label class="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" name="is_active" ${set?.is_active ? 'checked' : ''} />
            Activate immediately
          </label>
          <div class="space-y-3">
            <div>
              <label class="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" name="allowAllDepartments" data-role="toggle-departments" ${
                  visibility.allowAllDepartments ? 'checked' : ''
                } />
                Visible to all departments
              </label>
              <div class="mt-2 grid gap-2" data-role="department-options">
                ${departmentOptions}
              </div>
            </div>
            <div>
              <label class="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" name="allowAllPlans" data-role="toggle-plans" ${
                  visibility.allowAllPlans ? 'checked' : ''
                } ${planTiers.list.length ? '' : 'checked disabled'} />
                Visible to all plan tiers
              </label>
              <div class="mt-2 grid gap-2" data-role="plan-options">
                ${planTierOptions}
              </div>
            </div>
          </div>
          <p class="hidden text-sm text-red-600" data-role="form-error"></p>
        </form>
      `;

      footer.innerHTML = `
        <button type="button" class="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300" data-role="cancel">Cancel</button>
        <button type="submit" form="extra-set-form" class="rounded-md bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800">Save changes</button>
      `;

      const form = body.querySelector('#extra-set-form');
      const errorEl = body.querySelector('[data-role="form-error"]');
      const cancelBtn = footer.querySelector('[data-role="cancel"]');
      const submitBtn = footer.querySelector('[type="submit"]');

      cancelBtn.addEventListener('click', close);
      bindVisibilityControls(form);

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        errorEl.classList.add('hidden');
        errorEl.textContent = '';

        const formData = new FormData(form);
        const title = (formData.get('title') || '').toString().trim();
        if (!title) {
          errorEl.textContent = 'Title is required.';
          errorEl.classList.remove('hidden');
          return;
        }

        const allowAllDepartments = Boolean(formData.get('allowAllDepartments'));
        const departmentIds = allowAllDepartments
          ? []
          : Array.from(form.querySelectorAll('input[name="departmentIds"]:checked')).map((input) => input.value);
        if (!allowAllDepartments && !departmentIds.length) {
          errorEl.textContent = 'Select at least one department or choose “All departments”.';
          errorEl.classList.remove('hidden');
          return;
        }

        const allowAllPlans = Boolean(formData.get('allowAllPlans')) || !planTiers.list.length;
        const planTierValues = allowAllPlans
          ? []
          : Array.from(form.querySelectorAll('input[name="planTiers"]:checked')).map((input) => input.value);
        if (!allowAllPlans && !planTierValues.length) {
          errorEl.textContent = 'Select at least one plan tier or choose “All plan tiers”.';
          errorEl.classList.remove('hidden');
          return;
        }

        const rawTimeLimit = formData.get('time_limit_minutes');
        const parsedTimeLimit = rawTimeLimit
          ? Number(rawTimeLimit)
          : null;

        const payload = {
          title,
          description: (formData.get('description') || '').toString().trim(),
          starts_at: fromLocalDateTimeInput(formData.get('starts_at')),
          ends_at: fromLocalDateTimeInput(formData.get('ends_at')),
          is_active: Boolean(formData.get('is_active')),
          time_limit_minutes:
            Number.isFinite(parsedTimeLimit) && parsedTimeLimit > 0
              ? parsedTimeLimit
              : null,
          visibility: {
            allowAllDepartments,
            departmentIds,
            allowAllPlans,
            planTiers: planTierValues,
          },
        };

        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving…';
        try {
          await onSave(payload, close);
        } catch (error) {
          const message = error?.message || 'Unable to save changes.';
          errorEl.textContent = message;
          errorEl.classList.remove('hidden');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Save changes';
          return;
        }
      });
    },
  });
}

function registerListHandlers(container, context, actions) {
  const createBtn = container.querySelector('[data-role="create-set"]');
  createBtn?.addEventListener('click', () => {
    openSetEditor({
      mode: 'create',
      set: null,
      departments: context.departments,
      planTiers: context.planTiers,
      async onSave(payload, close) {
        try {
          const created = await dataService.createExtraQuestionSet(payload);
          showToast('Extra question set created.', { type: 'success' });
          close();
          actions.selectExtraQuestionSet(created.id);
        } catch (error) {
          if (error instanceof Error) throw error;
          throw new Error('Unexpected error while creating set.');
        }
      },
    });
  });

  container.querySelectorAll('[data-role="manage-set"]').forEach((button) => {
    button.addEventListener('click', () => {
      actions.selectExtraQuestionSet(button.dataset.id);
    });
  });

  container.querySelectorAll('[data-role="set-card"]').forEach((card) => {
    card.addEventListener('click', (event) => {
      const target = event.target.closest('button, [data-role]');
      if (target && target !== card && target.dataset.role !== 'set-card') {
        return;
      }
      const setId = card.dataset.id;
      if (!setId) return;
      actions.selectExtraQuestionSet(setId);
    });
  });

  container.querySelectorAll('[data-role="edit-set"]').forEach((button) => {
    const set = context.sets.find((item) => item.id === button.dataset.id);
    button.addEventListener('click', () => {
      openSetEditor({
        mode: 'edit',
        set,
        departments: context.departments,
        planTiers: context.planTiers,
        async onSave(payload, close) {
          await dataService.updateExtraQuestionSet(set.id, payload);
          showToast('Extra question set updated.', { type: 'success' });
          close();
          actions.refresh();
        },
      });
    });
  });

  container.querySelectorAll('[data-role="delete-set"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const setId = button.dataset.id;
      const set = context.sets.find((item) => item.id === setId);
      if (!setId) return;
      const confirmation = window.confirm(
        `Delete “${set?.title || 'extra question set'}”? This removes all associated questions.`
      );
      if (!confirmation) return;
      try {
        await dataService.deleteExtraQuestionSet(setId);
        showToast('Extra question set deleted.', { type: 'success' });
        actions.refresh();
      } catch (error) {
        showToast(error?.message || 'Failed to delete extra question set.', {
          type: 'error',
        });
      }
    });
  });
}

function registerDetailHandlers(container, context, actions) {
  const backBtn = container.querySelector('[data-role="back-to-list"]');
  backBtn?.addEventListener('click', () => {
    actions.clearExtraQuestionSelection();
  });

  const editBtn = container.querySelector('[data-role="edit-set"]');
  editBtn?.addEventListener('click', () => {
    openSetEditor({
      mode: 'edit',
      set: context.set,
      departments: context.departments,
      planTiers: context.planTiers,
      async onSave(payload, close) {
        await dataService.updateExtraQuestionSet(context.set.id, payload);
        showToast('Extra question set updated.', { type: 'success' });
        close();
        actions.refresh();
      },
    });
  });

  const toggleBtn = container.querySelector('[data-role="toggle-set-status"]');
  toggleBtn?.addEventListener('click', async () => {
    try {
      await dataService.updateExtraQuestionSet(context.set.id, {
        is_active: !context.set.is_active,
      });
      showToast('Visibility updated.', { type: 'success' });
      actions.refresh();
    } catch (error) {
      showToast(error?.message || 'Failed to update status.', { type: 'error' });
    }
  });

  const deleteBtn = container.querySelector('[data-role="delete-set"]');
  deleteBtn?.addEventListener('click', async () => {
    const confirmation = window.confirm(
      `Delete “${context.set.title}”? This removes all associated questions.`
    );
    if (!confirmation) return;
    try {
      await dataService.deleteExtraQuestionSet(context.set.id);
      showToast('Extra question set deleted.', { type: 'success' });
      actions.clearExtraQuestionSelection();
      actions.refresh();
    } catch (error) {
      showToast(error?.message || 'Failed to delete extra question set.', {
        type: 'error',
      });
    }
  });

  const fileButton = container.querySelector('[data-role="trigger-file-upload"]');
  const fileInput = container.querySelector('[data-role="file-input"]');
  fileButton?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    fileButton.disabled = true;
    fileButton.textContent = 'Uploading…';
    try {
      const text = await file.text();
      const result = await dataService.importExtraQuestionsFromAiken(
        context.set.id,
        text
      );
      const count = Number(result?.insertedCount ?? 0);
      const skipped = Number(result?.skippedCount ?? 0);
      const toastType = skipped ? 'warning' : 'success';
      const toastMessage = skipped
        ? `${count} question${count === 1 ? '' : 's'} uploaded • ${skipped} skipped`
        : `${count} question${count === 1 ? '' : 's'} uploaded successfully.`;
      showToast(toastMessage, { type: toastType });
      if (skipped && Array.isArray(result?.parseErrors) && result.parseErrors.length) {
        const firstIssue = result.parseErrors[0];
        const detail = firstIssue?.message
          ? `First issue: ${firstIssue.message}`
          : 'Skipped items had formatting issues. Fix them and retry.';
        showToast(detail, { type: 'info' });
      }
      actions.refresh();
    } catch (error) {
      showToast(error?.message || 'Failed to upload questions.', { type: 'error' });
    } finally {
      fileInput.value = '';
      fileButton.disabled = false;
      fileButton.textContent = 'Select Aiken file';
    }
  });

  const textarea = container.querySelector('[data-role="aiken-text"]');
  const inlineError = container.querySelector('[data-role="inline-error"]');
  const inlineButton = container.querySelector('[data-role="validate-upload"]');
  const clearButton = container.querySelector('[data-role="clear-inline"]');
  const questionTable = container.querySelector('[data-role="question-table"]');
  const searchInput = container.querySelector('[data-role="question-search"]');
  const countLabel = container.querySelector('[data-role="question-count-label"]');

  const updateQuestionCountLabel = (term) => {
    if (!countLabel) return;
    if (!term) {
      countLabel.textContent = `(${context.questions.length})`;
      return;
    }
    const count = context.questions.filter((question) =>
      questionMatchesTerm(question, term)
    ).length;
    countLabel.textContent = `(${count} of ${context.questions.length})`;
  };

  const refreshQuestionTable = (term = '') => {
    if (!questionTable) return;
    questionTable.innerHTML = renderQuestionRows(context.questions, term);
    updateQuestionCountLabel(term);
    bindDeleteQuestionHandlers();
  };

  const bindDeleteQuestionHandlers = () => {
    container.querySelectorAll('[data-role="delete-question"]').forEach((button) => {
      button.addEventListener('click', async () => {
        const questionId = button.dataset.questionId;
        if (!questionId) return;
        const confirmation = window.confirm('Delete this question?');
        if (!confirmation) return;
        try {
          await dataService.deleteExtraQuestion(context.set.id, questionId);
          showToast('Question deleted.', { type: 'success' });
          actions.refresh();
        } catch (error) {
          showToast(error?.message || 'Failed to delete question.', {
            type: 'error',
          });
        }
      });
    });
  };

  updateQuestionCountLabel('');
  bindDeleteQuestionHandlers();

  searchInput?.addEventListener('input', () => {
    const term = searchInput.value.trim();
    refreshQuestionTable(term);
  });

  inlineButton?.addEventListener('click', async () => {
    if (!textarea) return;
    inlineError?.classList.add('hidden');
    inlineError.textContent = '';
    const text = textarea.value.trim();
    if (!text) {
      inlineError.textContent = 'Paste Aiken formatted text before uploading.';
      inlineError?.classList.remove('hidden');
      return;
    }

    inlineButton.disabled = true;
    inlineButton.textContent = 'Validating…';
    try {
      const preview = await dataService.previewAikenContent(text);
      const questions = Array.isArray(preview?.questions) ? preview.questions : [];
      const skippedIssues = Array.isArray(preview?.skipped) ? preview.skipped : [];
      const parseErrors = Array.isArray(preview?.errors) ? preview.errors : [];

      if (!questions.length) {
        inlineError.textContent = 'No valid questions were found. Fix the highlighted issues and try again.';
        inlineError?.classList.remove('hidden');
        const firstLine = skippedIssues[0]?.startLine || parseErrors[0]?.lineNumber;
        if (firstLine) {
          highlightTextareaLine(textarea, Number(firstLine));
        }
        return;
      }

      if (skippedIssues.length || parseErrors.length) {
        const issueSummaryParts = [];
        if (skippedIssues.length) {
          issueSummaryParts.push(
            `${skippedIssues.length} question${skippedIssues.length === 1 ? '' : 's'} will be skipped due to formatting issues.`
          );
        }
        if (parseErrors.length) {
          issueSummaryParts.push(
            `${parseErrors.length} additional formatting issue${parseErrors.length === 1 ? '' : 's'} detected.`
          );
        }
        const firstLine = skippedIssues[0]?.startLine || parseErrors[0]?.lineNumber;
        inlineError.textContent = issueSummaryParts.join(' ');
        inlineError?.classList.remove('hidden');
        if (firstLine) {
          highlightTextareaLine(textarea, Number(firstLine));
        }
      } else {
        inlineError?.classList.add('hidden');
        inlineError.textContent = '';
      }

      const summaryParts = [
        `Parsed ${questions.length} question${questions.length === 1 ? '' : 's'}.`,
      ];
      if (skippedIssues.length) {
        summaryParts.push(
          `${skippedIssues.length} question${skippedIssues.length === 1 ? '' : 's'} will be skipped.`
        );
      }
      if (parseErrors.length) {
        summaryParts.push(
          `${parseErrors.length} other formatting issue${parseErrors.length === 1 ? '' : 's'} detected.`
        );
      }

      const proceed = window.confirm(
        `${summaryParts.join(' ')} Upload the valid questions now?`
      );
      if (!proceed) {
        inlineButton.disabled = false;
        inlineButton.textContent = 'Validate & upload';
        return;
      }

      const result = await dataService.importExtraQuestionsFromAiken(
        context.set.id,
        text
      );
      const count = Number(result?.insertedCount ?? 0);
      const skipped = Number(result?.skippedCount ?? 0);
      const toastType = skipped ? 'warning' : 'success';
      const toastMessage = skipped
        ? `${count} question${count === 1 ? '' : 's'} uploaded • ${skipped} skipped`
        : `${count} question${count === 1 ? '' : 's'} uploaded successfully.`;
      showToast(toastMessage, { type: toastType });
      if (skipped && Array.isArray(result?.parseErrors) && result.parseErrors.length) {
        const firstIssue = result.parseErrors[0];
        const detail = firstIssue?.message
          ? `First issue: ${firstIssue.message}`
          : 'Skipped items had formatting issues. Fix them and retry.';
        showToast(detail, { type: 'info' });
      }
      textarea.value = '';
      actions.refresh();
    } catch (error) {
      inlineError.textContent = error?.message || 'Unable to upload questions.';
      inlineError?.classList.remove('hidden');
      if (error?.context?.lineNumber) {
        highlightTextareaLine(textarea, error.context.lineNumber);
      }
    } finally {
      inlineButton.disabled = false;
      inlineButton.textContent = 'Validate & upload';
    }
  });

  clearButton?.addEventListener('click', () => {
    if (!textarea) return;
    textarea.value = '';
    inlineError?.classList.add('hidden');
    inlineError.textContent = '';
  });
}

export async function extraQuestionsView(state, actions) {
  const [sets, departments, subscriptionProducts] = await Promise.all([
    dataService.listExtraQuestionSets(),
    dataService.listDepartments(),
    dataService.listSubscriptionProductsDetailed(),
  ]);

  const departmentsMap = new Map(departments.map((dept) => [dept.id, dept]));
  const planTiers = derivePlanTierInfo(subscriptionProducts);

  const selectedSet = sets.find(
    (set) => set.id === state.selectedExtraQuestionSetId
  );

  const context = {
    sets,
    departments,
    departmentsMap,
    planTiers,
    planTierMap: planTiers.map,
  };

  if (!selectedSet) {
    return {
      html: renderListView(sets, departmentsMap, planTiers.map),
      onMount(container) {
        if (
          state.selectedExtraQuestionSetId &&
          !sets.some((set) => set.id === state.selectedExtraQuestionSetId)
        ) {
          actions.clearExtraQuestionSelection();
        }
        registerListHandlers(container, context, actions);
      },
    };
  }

  const questions = await dataService.listExtraQuestions(selectedSet.id);
  const detailContext = {
    ...context,
    set: selectedSet,
    questions,
  };

  return {
    html: renderDetailView(selectedSet, questions, detailContext),
    onMount(container) {
      registerDetailHandlers(container, detailContext, actions);
    },
  };
}

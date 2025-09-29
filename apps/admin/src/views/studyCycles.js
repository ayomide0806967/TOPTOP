import { dataService } from '../services/dataService.js';
import { showToast } from '../components/toast.js';
import { openModal } from '../components/modal.js';
import { classifyHealth, formatTimestamp } from '../utils/scheduleHealth.js';

function formatDate(value) {
  if (!value) return 'TBD';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

const SUBSLOT_STATUS_LABELS = {
  draft: 'Draft',
  pending: 'Pending',
  ready: 'Ready',
  active: 'Active',
  completed: 'Completed',
  archived: 'Archived',
};

const SUBSLOT_STATUS_BADGES = {
  draft: 'bg-slate-100 text-slate-600',
  pending: 'bg-amber-100 text-amber-700',
  ready: 'bg-sky-100 text-sky-700',
  active: 'bg-emerald-100 text-emerald-700',
  completed: 'bg-emerald-200 text-emerald-800',
  archived: 'bg-slate-200 text-slate-500',
};

const SUBSLOT_FULL_QUESTION_COUNT = 1750;
const DAILY_QUESTION_TARGET = 250;
const SUBSLOT_TOTAL_DAYS = 7;

const HEALTH_BADGE_CLASSES = {
  healthy: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border border-amber-200 bg-amber-50 text-amber-700',
  critical: 'border border-rose-200 bg-rose-50 text-rose-700',
  unknown: 'border border-slate-200 bg-slate-50 text-slate-500',
};

function statusBadge(status) {
  const label = SUBSLOT_STATUS_LABELS[status] || 'Scheduled';
  const classes = SUBSLOT_STATUS_BADGES[status] || SUBSLOT_STATUS_BADGES.draft;
  return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${classes}">${label}</span>`;
}

function renderSubslotTopics(topics) {
  if (!Array.isArray(topics) || !topics.length) {
    return '<span class="text-xs text-gray-400">No topics assigned yet.</span>';
  }
  return topics
    .map((topic) => {
      const label = topic.topic_name || 'Unnamed topic';
      const count = topic.question_count ?? '—';
      return `<span class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">${label}<span class="text-slate-400">(${count})</span></span>`;
    })
    .join('');
}

function formatTimelineDay(value) {
  if (!value) return 'TBD';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function renderTimelineCell(day) {
  if (!day) {
    return '';
  }
  const baseClass =
    'flex flex-col items-center justify-center gap-0.5 rounded-md border px-2 py-1 text-[11px]';
  let classes = 'border-slate-200 bg-slate-50 text-slate-500';
  if (day.is_filled) {
    classes = 'border-emerald-200 bg-emerald-50 text-emerald-700';
  } else if (day.question_count > 0) {
    classes = 'border-amber-200 bg-amber-50 text-amber-700';
  }
  if (day.status === 'active') {
    classes += ' ring-1 ring-emerald-300';
  } else if (day.status === 'ready') {
    classes += ' ring-1 ring-sky-300';
  }

  const dateLabel = formatTimelineDay(day.date) || `Day ${day.day_index}`;
  const quota = `${day.question_count ?? 0} / ${day.question_target ?? DAILY_QUESTION_TARGET}`;
  const tooltip = [
    dateLabel,
    `Status: ${SUBSLOT_STATUS_LABELS[day.status] || 'Draft'}`,
    `Questions: ${day.question_count ?? 0}`,
  ].join(' • ');

  return `
    <div class="${baseClass} ${classes}" title="${tooltip}">
      <span class="font-medium">${dateLabel}</span>
      <span>${quota}</span>
    </div>
  `;
}

function renderTimelineSection(cycle) {
  const timeline = cycle?.timeline;
  const days = Array.isArray(timeline?.days) ? timeline.days.slice() : [];
  if (!days.length) {
    return '';
  }

  const grouped = new Map();
  days.forEach((day) => {
    if (!grouped.has(day.subslot_id)) {
      grouped.set(day.subslot_id, {
        index: day.subslot_index,
        status: day.status,
        entries: [],
      });
    }
    grouped.get(day.subslot_id).entries.push(day);
  });

  const rows = Array.from(grouped.values())
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((row) => {
      const cells = row.entries
        .slice()
        .sort((a, b) => (a.day_offset ?? 0) - (b.day_offset ?? 0))
        .map((entry) => renderTimelineCell(entry))
        .join('');
      return `
        <article class="space-y-2">
          <div class="flex items-center justify-between text-xs text-slate-600">
            <span class="font-semibold">Subslot ${row.index}</span>
            ${statusBadge(row.status)}
          </div>
          <div class="grid gap-2" style="grid-template-columns: repeat(${row.entries.length}, minmax(0, 1fr));">
            ${cells}
          </div>
        </article>
      `;
    })
    .join('');

  const summary = timeline
    ? (() => {
        const parts = [
          `Ready: ${timeline.filled_days}/${timeline.total_days}`,
          `Underfilled: ${timeline.underfilled_days}`,
          `Empty: ${timeline.empty_days}`,
        ];
        if (timeline.unscheduled_days) {
          parts.push(`Unscheduled: ${timeline.unscheduled_days}`);
        }
        if (timeline.missing_questions) {
          parts.push(`Missing: ${timeline.missing_questions}`);
        }
        return `<span class="text-xs text-slate-500">${parts.join(' · ')}</span>`;
      })()
    : '';

  return `
    <section class="space-y-3 border-t border-slate-200 pt-4">
      <header class="flex items-center justify-between">
        <h4 class="text-sm font-semibold text-slate-700">Calendar overview</h4>
        ${summary}
      </header>
      <div class="space-y-3">
        ${rows}
      </div>
    </section>
  `;
}

function renderScheduleHealthSummary(entries) {
  if (!Array.isArray(entries) || !entries.length) {
    return '';
  }

  const decorated = entries.map((entry) => ({
    entry,
    ...classifyHealth(entry),
  }));

  const issueCount = decorated.filter(
    (item) => item.severity !== 'healthy'
  ).length;
  const summaryLine = issueCount
    ? `${issueCount} slot${issueCount === 1 ? '' : 's'} need attention`
    : 'All tracked slots are healthy';

  const rows = decorated
    .map(({ entry, severity, label, messages }) => {
      const badgeClass =
        HEALTH_BADGE_CLASSES[severity] || HEALTH_BADGE_CLASSES.unknown;
      const insights = messages.slice(0, 2).join(' · ');
      const readySummary = `${entry.ready_days ?? 0}/${entry.total_days ?? 0}`;
      const missing = entry.missing_questions ?? 0;
      return `
        <tr class="border-t border-slate-200 text-sm">
          <td class="px-3 py-3 font-medium text-slate-700">
            <div class="flex flex-col">
              <span>${entry.cycle_title || 'Untitled slot'}</span>
              <span class="text-xs text-slate-500">${entry.cycle_status || 'draft'}</span>
            </div>
          </td>
          <td class="px-3 py-3">
            <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${badgeClass}">${label}</span>
          </td>
          <td class="px-3 py-3 text-sm text-slate-600">${formatTimestamp(entry.last_run_completed_at)}</td>
          <td class="px-3 py-3 text-sm text-slate-600">${readySummary}</td>
          <td class="px-3 py-3 text-sm text-slate-600">${missing ? `${missing} missing` : '—'}</td>
          <td class="px-3 py-3 text-sm text-slate-600">
            ${insights || 'All daily pools ready'}
          </td>
        </tr>
      `;
    })
    .join('');

  return `
    <section class="rounded-lg border border-slate-200 bg-white shadow-sm">
      <header class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h3 class="text-sm font-semibold text-slate-800">Scheduling health</h3>
          <p class="text-xs text-slate-500">${summaryLine}</p>
        </div>
      </header>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-slate-200">
          <thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th class="px-3 py-3 text-left">Slot</th>
              <th class="px-3 py-3 text-left">Status</th>
              <th class="px-3 py-3 text-left">Last rebuild</th>
              <th class="px-3 py-3 text-left">Ready days</th>
              <th class="px-3 py-3 text-left">Missing</th>
              <th class="px-3 py-3 text-left">Insights</th>
            </tr>
          </thead>
          <tbody class="bg-white">${rows}</tbody>
        </table>
      </div>
    </section>
  `;
}

function cycleCard(cycle) {
  const subslots = (cycle.subslots || [])
    .slice()
    .sort(
      (a, b) => (a.index ?? a.week_index ?? 0) - (b.index ?? b.week_index ?? 0)
    )
    .map((subslot) => renderSubslotCard(cycle, subslot))
    .join('');
  const reusedBadge = cycle.source_cycle_id
    ? '<span class="ml-2 inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">Reused</span>'
    : '';
  const timelineSummary = cycle.timeline
    ? (() => {
        const summaryParts = [
          `Daily pools ready: ${cycle.timeline.filled_days}/${cycle.timeline.total_days}`,
          `Underfilled: ${cycle.timeline.underfilled_days}`,
          `Empty: ${cycle.timeline.empty_days}`,
        ];
        if (cycle.timeline.unscheduled_days) {
          summaryParts.push(`Unscheduled: ${cycle.timeline.unscheduled_days}`);
        }
        if (cycle.timeline.missing_questions) {
          summaryParts.push(
            `Missing questions: ${cycle.timeline.missing_questions}`
          );
        }
        return `<p class="text-xs text-gray-500 mt-1">${summaryParts.join('. ')}.</p>`;
      })()
    : '';
  const timelineSection = renderTimelineSection(cycle);

  return `
    <article class="bg-white rounded-lg shadow space-y-4 p-6" data-cycle-id="${cycle.id}" data-cycle-title="${encodeURIComponent(cycle.title)}" data-cycle-date="${cycle.start_date}">
      <header class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-lg font-semibold text-gray-900">${cycle.title}</h3>
          <p class="text-sm text-gray-500">${statusBadge(cycle.status)}${reusedBadge} <span class="ml-2">Starts ${formatDate(cycle.start_date)}</span></p>
          <p class="text-xs text-gray-500 mt-1">${cycle.questions_per_day} questions/day · cap ${cycle.question_cap}</p>
          ${timelineSummary}
        </div>
        <div class="flex items-center gap-3 text-sm">
          <button type="button" class="text-slate-900 hover:underline" data-role="edit-cycle">Edit</button>
          <button type="button" class="text-red-600 hover:text-red-700" data-role="delete-cycle">Delete</button>
          <button type="button" class="text-slate-600 hover:text-slate-900" data-role="rebuild-schedule">Rebuild Schedule</button>
        </div>
      </header>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        ${subslots || '<p class="text-sm text-gray-500">No subslots configured yet.</p>'}
      </div>
      ${timelineSection}
    </article>
  `;
}

function renderSubslotCard(slot, subslot) {
  const target = subslot.question_target || SUBSLOT_FULL_QUESTION_COUNT;
  const remaining = Math.max(target - (subslot.question_count || 0), 0);
  const questionProgress = `${subslot.question_count || 0} / ${target}`;
  const distribution = Array.isArray(subslot.distribution)
    ? subslot.distribution
        .slice()
        .sort((a, b) => (a.day_offset ?? 0) - (b.day_offset ?? 0))
    : [];
  const filledDays = distribution.filter(
    (entry) => (entry.count || 0) >= DAILY_QUESTION_TARGET
  ).length;
  const hasUnderfilledDay = distribution.some(
    (entry) => entry.count < DAILY_QUESTION_TARGET
  );
  const dailyBadges = distribution.length
    ? `
        <div class="flex flex-wrap gap-1 text-[11px] text-slate-600">
          ${distribution
            .map((entry) => {
              const label = `Day ${Number(entry.day_offset ?? 0) + 1}`;
              const count = entry.count ?? 0;
              const filled = count >= DAILY_QUESTION_TARGET;
              const badgeClasses = filled
                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                : 'bg-amber-100 text-amber-700 border border-amber-200';
              return `<span class="inline-flex items-center rounded-full px-2 py-0.5 border ${badgeClasses}">${label}: ${count}</span>`;
            })
            .join('')}
        </div>
      `
    : '';
  return `
    <div class="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-3" data-subslot-id="${subslot.id}" data-slot-id="${slot.id}">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-sm font-semibold text-gray-800">Subslot ${subslot.index ?? subslot.week_index}</p>
          <p class="text-xs text-gray-500">${formatDate(subslot.start_date)} – ${formatDate(subslot.end_date)}</p>
        </div>
        ${statusBadge(subslot.status)}
      </div>
      <p class="text-xs text-gray-500">Question pool ${questionProgress}</p>
      ${dailyBadges}
      <div class="flex flex-wrap gap-2">
        ${renderSubslotTopics(subslot.topics)}
      </div>
      ${subslot.is_full ? '' : `<p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">${remaining} questions remaining before activation.</p>`}
      ${
        subslot.is_full &&
        (filledDays < SUBSLOT_TOTAL_DAYS || hasUnderfilledDay)
          ? '<p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">Daily pools are incomplete. Ensure each of the 7 days has 250 questions.</p>'
          : ''
      }
      <div class="flex flex-wrap gap-2 pt-2">
        <button type="button" class="px-3 py-1.5 rounded-md bg-cyan-700 text-white text-xs" data-role="configure-subslot">Configure</button>
        <button type="button" class="px-3 py-1.5 rounded-md bg-slate-200 text-slate-700 text-xs" data-role="clone-subslot">Clone</button>
        <button type="button" class="px-3 py-1.5 rounded-md ${subslot.status === 'active' ? 'bg-amber-500 text-white' : subslot.is_full ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-slate-500 cursor-not-allowed'} text-xs" data-role="toggle-status">
          ${subslot.status === 'active' ? 'Mark Ready' : 'Activate'}
        </button>
      </div>
    </div>
  `;
}

function analyzeSubslotReadiness(cycles) {
  const alerts = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const soonThreshold = new Date(today);
  soonThreshold.setDate(today.getDate() + 7);
  const upcomingThreshold = new Date(today);
  upcomingThreshold.setDate(today.getDate() + 14);

  cycles.forEach((cycle) => {
    (cycle.subslots || []).forEach((subslot) => {
      const startDate = parseDate(subslot.start_date);
      if (!startDate) return;
      const distribution = Array.isArray(subslot.distribution)
        ? subslot.distribution
        : [];
      const filledDays = distribution.filter(
        (entry) => (entry.count || 0) >= DAILY_QUESTION_TARGET
      ).length;
      const hasUnderfilledDay = distribution.some(
        (entry) => entry.count < DAILY_QUESTION_TARGET
      );
      const isFull = Boolean(subslot.is_full);
      const needsQuestions = !isFull;
      const needsDailyDistribution =
        isFull && (filledDays < SUBSLOT_TOTAL_DAYS || hasUnderfilledDay);
      if (!needsQuestions && !needsDailyDistribution) return;

      if (startDate > upcomingThreshold) return;

      alerts.push({
        cycleTitle: cycle.title,
        subslotIndex: subslot.index ?? subslot.week_index,
        startDate,
        needsQuestions,
        needsDailyDistribution,
      });
    });
  });

  alerts.sort((a, b) => a.startDate - b.startDate);
  return alerts;
}

function renderReadinessBanner(alerts) {
  if (!alerts.length) return '';
  const items = alerts
    .slice(0, 4)
    .map((alert) => {
      const reasons = [
        alert.needsQuestions ? 'question pool incomplete' : null,
        alert.needsDailyDistribution ? 'daily pools uneven' : null,
      ]
        .filter(Boolean)
        .join(' · ');
      return `<li class="flex items-center justify-between gap-3">
        <div>
          <p class="text-sm font-semibold text-slate-700">${alert.cycleTitle} · Subslot ${alert.subslotIndex}</p>
          <p class="text-xs text-slate-500">Starts ${formatDate(alert.startDate)} · ${reasons}</p>
        </div>
        <span class="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">Action needed</span>
      </li>`;
    })
    .join('');

  const moreCount = alerts.length > 4 ? alerts.length - 4 : 0;
  const footer = moreCount
    ? `<p class="mt-3 text-xs text-slate-500">${moreCount} additional subslot${moreCount === 1 ? '' : 's'} need attention.</p>`
    : '';

  return `
    <section class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <h3 class="text-sm font-semibold text-amber-800">Upcoming subslots need attention</h3>
      <ul class="mt-2 space-y-2 text-sm text-slate-700">
        ${items}
      </ul>
      ${footer}
    </section>
  `;
}

async function handleCreateStudyCycle(form, departmentId, actions) {
  const formData = new FormData(form);
  const payload = {
    title: formData.get('title').trim(),
    start_date: formData.get('start_date'),
  };
  if (!payload.title || !payload.start_date) return;
  try {
    await dataService.createStudyCycle(departmentId, payload);
    showToast('Study cycle created.', { type: 'success' });
    form.reset();
    actions.refresh();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Unable to create study cycle.', {
      type: 'error',
    });
  }
}

function openCycleEditor(cycle, actions) {
  openModal({
    title: 'Edit Study Cycle',
    render: ({ body, footer, close }) => {
      body.innerHTML = `
        <form id="edit-cycle-form" class="space-y-4">
          <label class="block text-sm font-medium text-gray-700">
            <span>Title</span>
            <input type="text" name="title" class="mt-1 w-full border border-gray-300 rounded-md p-2" value="${cycle.title}" required>
          </label>
          <label class="block text-sm font-medium text-gray-700">
            <span>Code</span>
            <input type="text" name="code" class="mt-1 w-full border border-gray-300 rounded-md p-2" value="${cycle.code || ''}" placeholder="optional-identifier">
          </label>
          <label class="block text-sm font-medium text-gray-700">
            <span>Start Date</span>
            <input type="date" name="start_date" class="mt-1 w-full border border-gray-300 rounded-md p-2" value="${cycle.start_date || ''}" required>
          </label>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              <p><strong>Questions per day:</strong> 250</p>
              <p class="mt-1"><strong>Slot capacity:</strong> 7,000</p>
              <p class="mt-1"><strong>Subslots:</strong> Four × 7-day windows (1,750 questions each)</p>
            </div>
            <label class="block text-sm font-medium text-gray-700">
              <span>Status</span>
              <select name="status" class="mt-1 w-full border border-gray-300 rounded-md p-2">
                ${['draft', 'scheduled', 'active', 'completed', 'archived']
                  .map(
                    (status) =>
                      `<option value="${status}" ${status === cycle.status ? 'selected' : ''}>${status.charAt(0).toUpperCase() + status.slice(1)}</option>`
                  )
                  .join('')}
              </select>
            </label>
          </div>
        </form>
      `;
      footer.innerHTML = `
        <button type="button" class="px-4 py-2 rounded-md bg-gray-100 text-gray-700" data-role="cancel">Cancel</button>
        <button type="submit" form="edit-cycle-form" class="px-4 py-2 rounded-md bg-cyan-700 text-white">Save Changes</button>
      `;
      footer
        .querySelector('[data-role="cancel"]')
        .addEventListener('click', close);

      const form = body.querySelector('#edit-cycle-form');
      form?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        try {
          const payload = {
            title: formData.get('title').trim(),
            start_date: formData.get('start_date'),
            code: formData.get('code').trim(),
            status: formData.get('status'),
          };
          await dataService.updateStudyCycle(cycle.id, payload);
          showToast('Study cycle updated.', { type: 'success' });
          close();
          actions.refresh();
        } catch (error) {
          console.error(error);
          showToast(error.message || 'Unable to update study cycle.', {
            type: 'error',
          });
        }
      });
    },
  });
}

function confirmCycleDeletion(cycleId, cycleTitle, actions) {
  openModal({
    title: 'Delete Study Cycle',
    render: ({ body, footer, close }) => {
      body.innerHTML = `<p class="text-sm text-gray-600">Deleting <strong>${cycleTitle}</strong> removes all scheduled weeks. This cannot be undone.</p>`;
      footer.innerHTML = `
        <button type="button" class="px-4 py-2 rounded-md bg-gray-100 text-gray-700" data-role="cancel">Cancel</button>
        <button type="button" class="px-4 py-2 rounded-md bg-red-600 text-white" data-role="confirm">Delete</button>
      `;
      footer
        .querySelector('[data-role="cancel"]')
        .addEventListener('click', close);
      footer
        .querySelector('[data-role="confirm"]')
        .addEventListener('click', async () => {
          try {
            await dataService.deleteStudyCycle(cycleId);
            showToast('Study cycle deleted.', { type: 'success' });
            close();
            actions.refresh();
          } catch (error) {
            console.error(error);
            showToast(error.message || 'Unable to delete study cycle.', {
              type: 'error',
            });
          }
        });
    },
  });
}

function openReuseSlotModal({ departments, targetDepartmentId, actions }) {
  if (!Array.isArray(departments) || !departments.length) {
    showToast('Create a department before reusing a slot.', {
      type: 'warning',
    });
    return;
  }

  const targetDepartment =
    departments.find((dept) => dept.id === targetDepartmentId) ||
    departments[0];
  if (!targetDepartment) {
    showToast('Select a department before reusing a slot.', {
      type: 'warning',
    });
    return;
  }

  const otherDepartments = departments.filter(
    (dept) => dept.id !== targetDepartment.id
  );
  let sourceDepartmentId = otherDepartments[0]?.id || targetDepartment.id;
  let currentSlots = [];

  const loadSlots = async (departmentId, container, titleInput) => {
    if (!container) return;
    container.innerHTML =
      '<p class="text-sm text-slate-500">Loading slots…</p>';
    try {
      const slots = await dataService.listStudyCycles(departmentId);
      currentSlots = Array.isArray(slots)
        ? slots.filter((slot) => slot && slot.status !== 'archived')
        : [];

      if (!currentSlots.length) {
        container.innerHTML =
          '<p class="text-sm text-slate-500">No slots available for that department yet.</p>';
        return;
      }

      const options = currentSlots
        .map(
          (slot) =>
            `<option value="${slot.id}">${slot.title} • ${formatDate(slot.start_date)}</option>`
        )
        .join('');

      container.innerHTML = `
        <label class="block text-sm font-medium text-gray-700">
          <span>Source slot</span>
          <select name="source_cycle_id" class="mt-1 w-full border border-gray-300 rounded-md p-2" required>
            <option value="" disabled selected>Select a slot</option>
            ${options}
          </select>
        </label>
        <p class="text-xs text-slate-500">Cloning copies the four 7-day subslots and their topic mix. Adjust topics after cloning if needed.</p>
      `;

      const slotSelect = container.querySelector(
        'select[name="source_cycle_id"]'
      );
      slotSelect.addEventListener('change', (event) => {
        const selectedSlot = currentSlots.find(
          (item) => item.id === event.target.value
        );
        if (!selectedSlot || !titleInput) return;
        if (!titleInput.value.trim()) {
          titleInput.value = `${selectedSlot.title} (${targetDepartment.name})`;
        }
      });
    } catch (error) {
      console.error(error);
      container.innerHTML =
        '<p class="text-sm text-red-600">Unable to load slots for this department.</p>';
      showToast(error.message || 'Unable to load slots for reuse.', {
        type: 'error',
      });
    }
  };

  openModal({
    title: 'Reuse Existing Slot',
    widthClass: 'max-w-3xl',
    render: ({ body, footer, close }) => {
      body.innerHTML = `
        <form id="reuse-slot-form" class="space-y-4">
          <p class="text-sm text-slate-600">The cloned slot will be created for <strong>${targetDepartment.name}</strong>. Choose a different department below to pull an existing slot from another track.</p>
          <label class="block text-sm font-medium text-gray-700">
            <span>Source department</span>
            <select class="mt-1 w-full border border-gray-300 rounded-md p-2" data-role="reuse-department">
              ${departments
                .map(
                  (dept) =>
                    `<option value="${dept.id}" ${dept.id === sourceDepartmentId ? 'selected' : ''}>${dept.name}</option>`
                )
                .join('')}
            </select>
          </label>
          <div class="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3" data-role="slot-container">
            <p class="text-sm text-slate-500">Select a department to load reusable slots.</p>
          </div>
          <label class="block text-sm font-medium text-gray-700">
            <span>New slot title</span>
            <input type="text" name="title" class="mt-1 w-full border border-gray-300 rounded-md p-2" placeholder="e.g. November Sprint (Midwifery)">
          </label>
          <label class="block text-sm font-medium text-gray-700">
            <span>Start date</span>
            <input type="date" name="start_date" class="mt-1 w-full border border-gray-300 rounded-md p-2" required>
          </label>
        </form>
      `;

      footer.innerHTML = `
        <button type="button" class="px-4 py-2 rounded-md bg-gray-100 text-gray-700" data-role="cancel">Cancel</button>
        <button type="submit" form="reuse-slot-form" class="px-4 py-2 rounded-md bg-cyan-700 text-white">Clone Slot</button>
      `;

      const form = body.querySelector('#reuse-slot-form');
      const departmentSelect = form.querySelector(
        '[data-role="reuse-department"]'
      );
      const slotContainer = form.querySelector('[data-role="slot-container"]');
      const titleInput = form.querySelector('input[name="title"]');

      footer
        .querySelector('[data-role="cancel"]')
        .addEventListener('click', close);

      const initialise = () =>
        loadSlots(sourceDepartmentId, slotContainer, titleInput);
      initialise();

      departmentSelect.addEventListener('change', (event) => {
        sourceDepartmentId = event.target.value;
        loadSlots(sourceDepartmentId, slotContainer, titleInput);
      });

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        const sourceCycleId = formData.get('source_cycle_id');
        const startDate = formData.get('start_date');
        const newTitle = formData.get('title');
        if (!sourceCycleId) {
          showToast('Select a source slot before cloning.', {
            type: 'warning',
          });
          return;
        }
        if (!startDate) {
          showToast('Choose a start date for the reused slot.', {
            type: 'warning',
          });
          return;
        }

        try {
          await dataService.cloneStudyCycle(
            sourceCycleId,
            targetDepartment.id,
            {
              start_date: startDate,
              title: newTitle,
            }
          );
          showToast('Slot cloned from template.', { type: 'success' });
          close();
          actions.refresh();
        } catch (error) {
          console.error(error);
          showToast(error.message || 'Unable to reuse slot.', {
            type: 'error',
          });
        }
      });
    },
  });
}

async function openSubslotConfigurator(slot, subslot, departmentId, actions) {
  let state = { view: 'departments', department: null, course: null };

  const departments = await dataService.listDepartments();

  const render = (modal) => {
    if (state.view === 'departments') {
      modal.body.innerHTML = `
        <div class="space-y-2">
          <h3 class="text-lg font-semibold text-gray-800">Select a Department</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${departments
              .map(
                (dept) => `
              <button data-id="${dept.id}" class="text-left p-4 border rounded-lg hover:bg-gray-50">
                <h4 class="font-semibold">${dept.name}</h4>
              </button>
            `
              )
              .join('')}
          </div>
        </div>
      `;
      modal.body.querySelectorAll('button[data-id]').forEach((button) => {
        button.addEventListener('click', async () => {
          state.view = 'courses';
          state.department = departments.find(
            (d) => d.id === button.dataset.id
          );
          render(modal);
        });
      });
    } else if (state.view === 'courses') {
      dataService.listCourses(state.department.id).then((courses) => {
        modal.body.innerHTML = `
          <div class="space-y-2">
            <button data-action="back" class="text-sm text-cyan-700">&larr; Back to Departments</button>
            <h3 class="text-lg font-semibold text-gray-800">Select a Course in ${state.department.name}</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              ${courses
                .map(
                  (course) => `
                <button data-id="${course.id}" class="text-left p-4 border rounded-lg hover:bg-gray-50">
                  <h4 class="font-semibold">${course.name}</h4>
                </button>
              `
                )
                .join('')}
            </div>
          </div>
        `;
        modal.body
          .querySelector('button[data-action="back"]')
          .addEventListener('click', () => {
            state.view = 'departments';
            state.course = null;
            render(modal);
          });
        modal.body.querySelectorAll('button[data-id]').forEach((button) => {
          button.addEventListener('click', async () => {
            state.view = 'topics';
            state.course = courses.find((c) => c.id === button.dataset.id);
            render(modal);
          });
        });
      });
    } else if (state.view === 'topics') {
      dataService.listTopics(state.course.id).then((topics) => {
        const existing = new Map(
          (subslot.topics || []).map((topic) => [topic.topic_id, topic])
        );
        modal.body.innerHTML = `
          <form id="subslot-config-form" class="space-y-4">
            <button data-action="back" class="text-sm text-cyan-700">&larr; Back to Courses</button>
            <h3 class="text-lg font-semibold text-gray-800">Select Topics from ${state.course.name}</h3>
            <div class="space-y-3 max-h-80 overflow-y-auto pr-1">
              ${topics
                .map((topic) => {
                  const entry = existing.get(topic.id);
                  const disabled = topic.question_count === 0;
                  return `
                  <div class="grid grid-cols-1 md:grid-cols-5 gap-3 border border-slate-200 rounded-lg p-3 ${disabled ? 'bg-gray-100' : 'bg-white'}">
                    <div class="md:col-span-3">
                      <label class="text-sm font-medium ${disabled ? 'text-gray-400' : 'text-gray-700'}">${topic.name}</label>
                      <p class="text-xs text-gray-400 mt-1">${topic.question_count} questions</p>
                    </div>
                    <label class="text-sm font-medium text-gray-700">
                      <span>Questions</span>
                      <input type="number" min="0" name="q_${topic.id}" class="mt-1 w-full border border-gray-300 rounded-md p-2" value="${entry?.question_count ?? ''}" placeholder="0" ${disabled ? 'disabled' : ''}>
                    </label>
                    <label class="text-sm font-medium text-gray-700">
                      <span>Selection</span>
                      <select name="mode_${topic.id}" class="mt-1 w-full border border-gray-300 rounded-md p-2" ${disabled ? 'disabled' : ''}>
                        <option value="random" ${entry?.selection_mode !== 'all' ? 'selected' : ''}>Random sample</option>
                        <option value="all" ${entry?.selection_mode === 'all' ? 'selected' : ''}>All questions</option>
                      </select>
                    </label>
                  </div>
                `;
                })
                .join('')}
            </div>
            <p class="text-xs text-gray-500">Only topics with a questions value greater than zero will be loaded. Selecting "All questions" ignores the entered number.</p>
          </form>
        `;
        modal.footer.innerHTML = `
          <button type="button" class="px-4 py-2 rounded-md bg-gray-100 text-gray-700" data-role="cancel">Cancel</button>
          <button type="submit" form="subslot-config-form" class="px-4 py-2 rounded-md bg-cyan-700 text-white">Save Allocation</button>
        `;
        modal.footer
          .querySelector('[data-role="cancel"]')
          .addEventListener('click', modal.close);
        modal.body
          .querySelector('button[data-action="back"]')
          .addEventListener('click', () => {
            state.view = 'courses';
            render(modal);
          });

        const form = modal.body.querySelector('#subslot-config-form');
        form?.addEventListener('submit', async (event) => {
          event.preventDefault();
          const formData = new FormData(form);
          const requests = topics
            .map((topic) => {
              const mode = formData.get(`mode_${topic.id}`) || 'random';
              const rawCount = formData.get(`q_${topic.id}`);
              const count = rawCount ? Number(rawCount) : 0;
              if (!count && mode !== 'all') {
                return null;
              }
              return {
                topic_id: topic.id,
                selection_mode: mode,
                question_count: mode === 'all' ? count || null : count,
              };
            })
            .filter(Boolean);

          if (!requests.length) {
            showToast('Select at least one topic with questions.', {
              type: 'warning',
            });
            return;
          }

          try {
            const result = await dataService.fillSubslotQuestions(
              subslot.id,
              requests,
              { replace: true }
            );
            const inserted = result?.questions_selected ?? 0;
            showToast(`Loaded ${inserted} questions into the subslot.`, {
              type: 'success',
            });
            modal.close();
            actions.refresh();
          } catch (error) {
            console.error(error);
            showToast(error.message || 'Unable to configure subslot.', {
              type: 'error',
            });
          }
        });
      });
    }
  };

  openModal({
    title: `Configure Subslot ${subslot.index ?? subslot.week_index}`,
    widthClass: 'max-w-4xl',
    render: (modal) => render(modal),
  });
}

function openCloneSubslotModal(slot, subslot, allSlots, actions) {
  const candidates = allSlots
    .flatMap((item) =>
      (item.subslots || []).map((s) => ({ slot: item, subslot: s }))
    )
    .filter(({ subslot: candidate }) => candidate.id !== subslot.id);

  if (!candidates.length) {
    showToast('No other subslots available to clone from yet.', {
      type: 'info',
    });
    return;
  }

  openModal({
    title: 'Clone Subslot Pool',
    render: ({ body, footer, close }) => {
      body.innerHTML = `
        <form id="clone-subslot-form" class="space-y-4">
          <p class="text-sm text-gray-600">Copy question allocations from another subslot. Existing questions in this subslot will be replaced.</p>
          <label class="block text-sm font-medium text-gray-700">
            <span>Source subslot</span>
            <select name="source_subslot" class="mt-1 w-full border border-gray-300 rounded-md p-2" required>
              <option value="" disabled selected>Select a subslot</option>
              ${candidates
                .map(({ slot: sourceSlot, subslot: sourceSubslot }) => {
                  const label = `${sourceSlot.title} · Subslot ${sourceSubslot.index ?? sourceSubslot.week_index} (${formatDate(sourceSubslot.start_date)} – ${formatDate(sourceSubslot.end_date)})`;
                  return `<option value="${sourceSubslot.id}">${label}</option>`;
                })
                .join('')}
            </select>
          </label>
        </form>
      `;
      footer.innerHTML = `
        <button type="button" class="px-4 py-2 rounded-md bg-gray-100 text-gray-700" data-role="cancel">Cancel</button>
        <button type="submit" form="clone-subslot-form" class="px-4 py-2 rounded-md bg-cyan-700 text-white">Clone</button>
      `;
      footer
        .querySelector('[data-role="cancel"]')
        .addEventListener('click', close);

      const form = body.querySelector('#clone-subslot-form');
      form?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        const sourceId = formData.get('source_subslot');
        if (!sourceId) return;
        try {
          await dataService.cloneSubslotPool(sourceId, subslot.id, {
            replace: true,
          });
          showToast('Subslot cloned successfully.', { type: 'success' });
          close();
          actions.refresh();
        } catch (error) {
          console.error(error);
          showToast(error.message || 'Unable to clone subslot.', {
            type: 'error',
          });
        }
      });
    },
  });
}

async function toggleSubslotStatus(slotId, subslot, actions) {
  const nextStatus = subslot.status === 'active' ? 'ready' : 'active';
  if (
    nextStatus === 'active' &&
    !subslot.is_full &&
    (subslot.question_target ?? SUBSLOT_FULL_QUESTION_COUNT) > 0
  ) {
    showToast('Fill this subslot with 1,750 questions before activation.', {
      type: 'warning',
    });
    return;
  }
  try {
    await dataService.updateStudyCycleSubslot(slotId, subslot.id, {
      status: nextStatus,
      activated_at: nextStatus === 'active' ? new Date().toISOString() : null,
    });
    showToast(
      `Subslot marked ${SUBSLOT_STATUS_LABELS[nextStatus] || nextStatus}.`,
      { type: 'success' }
    );
    actions.refresh();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Unable to update subslot status.', {
      type: 'error',
    });
  }
}

export async function studyCyclesView(state, actions) {
  let departments = [];
  let selectedDepartmentId = state.selectedDepartmentId || null;
  let cycles = [];
  let cycleLoadError = '';
  let scheduleHealth = [];
  let scheduleHealthError = '';

  try {
    departments = await dataService.listDepartments();
  } catch (error) {
    console.error('[StudyCycles] Unable to load departments', error);
    showToast('Unable to load departments. Please refresh.', { type: 'error' });
  }

  if (!selectedDepartmentId) {
    selectedDepartmentId = departments[0]?.id ?? null;
  }

  const selectedDepartment =
    departments.find((dept) => dept.id === selectedDepartmentId) || null;

  if (selectedDepartmentId) {
    try {
      cycles = await dataService.listStudyCycles(selectedDepartmentId);
    } catch (error) {
      console.error('[StudyCycles] Unable to load cycles', error);
      cycleLoadError =
        'We could not load the study cycles for this department. Try refreshing or check back later.';
      showToast('Unable to load study cycles.', { type: 'error' });
    }

    try {
      scheduleHealth =
        await dataService.listScheduleHealth(selectedDepartmentId);
    } catch (error) {
      console.error('[StudyCycles] Unable to load schedule health', error);
      scheduleHealthError =
        'Unable to fetch scheduling health. Try rebuilding a schedule or refresh the page.';
    }
  }

  const readinessAlerts = analyzeSubslotReadiness(cycles);
  const healthSummary = renderScheduleHealthSummary(scheduleHealth);

  return {
    html: `
      <section class="space-y-6">
        <header class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 class="text-2xl font-semibold text-gray-900">Question Slots</h1>
            <p class="text-gray-500">Schedule daily question pools by department and subscription tier.</p>
          </div>
          <label class="text-sm text-gray-600">
            <span class="sr-only">Department</span>
            <select id="study-cycle-department" class="border border-gray-300 rounded-md p-2">
              ${departments
                .map(
                  (dept) =>
                    `<option value="${dept.id}" ${dept.id === selectedDepartmentId ? 'selected' : ''}>${dept.name}</option>`
                )
                .join('')}
            </select>
          </label>
        </header>
        ${
          selectedDepartment
            ? `
          <section class="bg-white p-6 rounded-lg shadow">
            <h2 class="text-lg font-semibold text-gray-800">Create Slot</h2>
            <form id="create-study-cycle-form" class="mt-4 grid gap-4 md:grid-cols-3">
              <label class="md:col-span-2 text-sm font-medium text-gray-700">
                <span>Title</span>
                <input type="text" name="title" class="mt-1 block w-full border border-gray-300 rounded-md p-2" required placeholder="e.g. November NCLEX Sprint">
              </label>
              <label class="text-sm font-medium text-gray-700">
                <span>Start Date</span>
                <input type="text" id="study-cycle-start-date" name="start_date" class="datepicker mt-1 block w-full border border-gray-300 rounded-md p-2" placeholder="Select date" required>
              </label>
              <div class="md:col-span-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                <p class="text-xs text-slate-500">Slots span 30 days with four 7-day subslots (1,750 questions each).</p>
                <div class="flex flex-wrap gap-2">
                  <button type="button" class="px-4 py-2 rounded-md border border-slate-300 text-sm font-semibold text-slate-600 hover:border-slate-400 hover:text-slate-800" data-role="reuse-slot">Reuse existing slot</button>
                  <button type="submit" class="bg-cyan-700 text-white font-semibold py-2 px-4 rounded-lg hover:bg-cyan-800">Create Slot</button>
                </div>
              </div>
            </form>
          </section>
        `
            : '<p class="text-sm text-gray-500">Create a department first to schedule slots.</p>'
        }
        ${scheduleHealthError ? `<div class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">${scheduleHealthError}</div>` : ''}
        ${healthSummary}
        ${readinessAlerts.length ? renderReadinessBanner(readinessAlerts) : ''}
        <section class="space-y-6" data-role="cycle-grid">
          ${
            cycleLoadError
              ? `<div class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">${cycleLoadError}</div>`
              : cycles.length
                ? cycles.map(cycleCard).join('')
                : '<p class="text-sm text-gray-500">No slots configured for this department.</p>'
          }
        </section>
      </section>
    `,
    onMount(container) {
      const departmentSelect = container.querySelector(
        '#study-cycle-department'
      );
      if (!state.selectedDepartmentId && departmentSelect?.value) {
        actions.selectDepartment(departmentSelect.value);
      }
      departmentSelect?.addEventListener('change', (event) => {
        actions.selectDepartment(event.target.value);
      });

      const form = container.querySelector('#create-study-cycle-form');
      form?.addEventListener('submit', (event) => {
        event.preventDefault();
        handleCreateStudyCycle(
          form,
          state.selectedDepartmentId || departmentSelect?.value,
          actions
        );
      });

      const reuseButton = container.querySelector('[data-role="reuse-slot"]');
      reuseButton?.addEventListener('click', () => {
        openReuseSlotModal({
          departments,
          targetDepartmentId:
            state.selectedDepartmentId || departmentSelect?.value,
          actions,
        });
      });

      if (typeof flatpickr === 'function') {
        flatpickr('#study-cycle-start-date', { dateFormat: 'Y-m-d' });
      }

      container
        .querySelectorAll('[data-role="edit-cycle"]')
        .forEach((button) => {
          const article = button.closest('article[data-cycle-id]');
          if (!article) return;
          const cycle = cycles.find(
            (item) => item.id === article.dataset.cycleId
          );
          if (!cycle) return;
          button.addEventListener('click', () => {
            openCycleEditor(cycle, actions);
          });
        });

      container
        .querySelectorAll('[data-role="delete-cycle"]')
        .forEach((button) => {
          const article = button.closest('article[data-cycle-id]');
          if (!article) return;
          const cycle = cycles.find(
            (item) => item.id === article.dataset.cycleId
          );
          if (!cycle) return;
          button.addEventListener('click', () => {
            confirmCycleDeletion(cycle.id, cycle.title, actions);
          });
        });

      container
        .querySelectorAll('[data-role="rebuild-schedule"]')
        .forEach((button) => {
          const article = button.closest('article[data-cycle-id]');
          if (!article) return;
          const cycle = cycles.find(
            (item) => item.id === article.dataset.cycleId
          );
          if (!cycle) return;
          button.addEventListener('click', async () => {
            if (button.dataset.loading === 'true') return;
            button.dataset.loading = 'true';
            const originalText = button.textContent;
            button.textContent = 'Rebuilding…';
            button.disabled = true;
            try {
              await dataService.refreshStudyCycleSchedule(cycle.id, {
                replace: true,
              });
              showToast('Daily schedule rebuilt successfully.', {
                type: 'success',
              });
              actions.refresh();
            } catch (error) {
              console.error('[StudyCycles] Failed to rebuild schedule', error);
              showToast(
                error.message || 'Unable to rebuild the daily schedule.',
                { type: 'error' }
              );
            } finally {
              button.dataset.loading = 'false';
              button.textContent = originalText;
              button.disabled = false;
            }
          });
        });

      container.querySelectorAll('[data-subslot-id]').forEach((card) => {
        const subslotId = card.dataset.subslotId;
        const slotId = card.dataset.slotId;
        const slot = cycles.find((item) => item.id === slotId);
        if (!slot) return;
        const subslot = slot.subslots.find((item) => item.id === subslotId);
        if (!subslot) return;

        card
          .querySelector('[data-role="configure-subslot"]')
          .addEventListener('click', () => {
            openSubslotConfigurator(
              slot,
              subslot,
              state.selectedDepartmentId || departmentSelect?.value,
              actions
            );
          });

        card
          .querySelector('[data-role="clone-subslot"]')
          .addEventListener('click', () => {
            openCloneSubslotModal(slot, subslot, cycles, actions);
          });

        card
          .querySelector('[data-role="toggle-status"]')
          .addEventListener('click', () => {
            toggleSubslotStatus(slot.id, subslot, actions);
          });
      });
    },
  };
}

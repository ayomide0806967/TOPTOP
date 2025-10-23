import {
  quizBuilderService,
  QuizBuilderServiceError,
} from '../services/quizBuilderService.js';
import { showToast } from '../components/toast.js';
import {
  formatDateTime,
  formatDuration,
  formatTimeAgo,
} from '../utils/format.js';

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function renderBadge(text, tone = 'default') {
  const palette = {
    default: 'bg-slate-100 text-slate-700',
    active: 'bg-emerald-100 text-emerald-700',
    suspended: 'bg-amber-100 text-amber-700',
    archived: 'bg-slate-200 text-slate-500',
  };
  return `<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${palette[tone] || palette.default}">${text}</span>`;
}

function joinModeCopy(classroom) {
  switch (classroom?.access_mode) {
    case 'open_link':
      return 'Anyone with the class link can join.';
    case 'pin':
      return 'Participants must enter the classroom PIN to join.';
    case 'phone_whitelist':
      return 'Only approved phone numbers are allowed to join.';
    default:
      return 'Only invited participants can join.';
  }
}

function buildJoinLink(classroom) {
  if (!classroom?.join_link_token) return null;
  return `${window.location.origin}/join-classroom?token=${classroom.join_link_token}`;
}

function formatSeatUsage(classroom) {
  if (!classroom) return { used: 0, total: 0, percent: 0 };
  const total = Number(classroom.seat_quota) || 0;
  const used = Number(classroom.active_participants) || 0;
  const percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  return { used, total, percent };
}

document.addEventListener('DOMContentLoaded', () => {
  const classroomId = getQueryParam('id');
  const pageTitleEl = document.getElementById('page-title');
  const summaryEl = document.getElementById('classroom-summary');
  const joinLinkBtn = document.getElementById('copy-join-link-btn');
  const pinContainer = document.getElementById('classroom-pin');
  const whitelistContainer = document.getElementById('classroom-whitelist');
  const membersContainer = document.getElementById('member-list');
  const examsContainer = document.getElementById('exam-list');
  const refreshBtn = document.getElementById('refresh-classroom-btn');
  const memberSearchInput = document.getElementById('member-search');
  const emptyMemberState = document.getElementById('member-empty-state');
  const emptyExamState = document.getElementById('exam-empty-state');
  const pageLoader = document.getElementById('page-loader');

  if (!classroomId) {
    showToast('Missing classroom ID.', { type: 'error' });
    pageLoader.innerHTML =
      '<p class="text-sm text-rose-600">Missing classroom ID. Return to the dashboard and try again.</p>';
    return;
  }

  const state = {
    classroom: null,
    members: [],
    exams: [],
    loading: false,
    filter: '',
  };

  const setLoading = (loading) => {
    state.loading = loading;
    pageLoader.classList.toggle('hidden', !loading);
    refreshBtn.disabled = loading;
    refreshBtn.textContent = loading ? 'Refreshing…' : 'Refresh';
  };

  const renderSummary = () => {
    if (!summaryEl) return;
    const classroom = state.classroom;
    if (!classroom) {
      summaryEl.innerHTML = `
        <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p class="text-sm text-slate-500">Classroom details unavailable.</p>
        </div>
      `;
      return;
    }

    document.title = `${classroom.name} | Classroom | Academic Nightingale`;
    pageTitleEl.textContent = classroom.name || 'Classroom';
    const joinLink = buildJoinLink(classroom);
    const seatUsage = formatSeatUsage(classroom);
    const statusTone =
      classroom.status === 'active'
        ? 'active'
        : classroom.status === 'suspended'
          ? 'suspended'
          : 'archived';

    summaryEl.innerHTML = `
      <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div class="space-y-3">
            <div class="flex items-center gap-3">
              <p class="text-sm font-medium text-slate-900">Status</p>
              ${renderBadge(classroom.status || 'active', statusTone)}
            </div>
            <p class="text-sm text-slate-500">${joinModeCopy(classroom)}</p>
            <dl class="grid gap-4 sm:grid-cols-2">
              <div>
                <dt class="text-xs uppercase tracking-wide text-slate-400">Created</dt>
                <dd class="mt-1 text-sm text-slate-900">${formatDateTime(classroom.created_at)}</dd>
              </div>
              <div>
                <dt class="text-xs uppercase tracking-wide text-slate-400">Last activity</dt>
                <dd class="mt-1 text-sm text-slate-900">${formatTimeAgo(classroom.last_activity_at)}</dd>
              </div>
            </dl>
          </div>
          <div class="w-full max-w-md rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div class="flex items-center justify-between text-sm">
              <span class="font-medium text-slate-700">Seat usage</span>
              <span class="text-slate-500">${seatUsage.used}/${seatUsage.total}</span>
            </div>
            <div class="mt-3 h-2 w-full rounded-full bg-slate-200">
              <div class="h-full rounded-full bg-cyan-500 transition-all duration-300" style="width: ${seatUsage.percent}%;"></div>
            </div>
            <p class="mt-2 text-xs text-slate-500">Participants using seats in this classroom.</p>
          </div>
        </div>
        <div class="mt-6 flex flex-wrap items-center gap-3">
          <button id="copy-link-dynamic" class="inline-flex items-center gap-2 rounded-full bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"${joinLink ? '' : ' disabled'}>
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 12a5 5 0 017-7l1 1m3 3a5 5 0 01-7 7l-1-1"/></svg>
            Copy class link
          </button>
          <button id="export-roster-btn" class="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4-4 4 4m-4-4v9m5-5h4m4 0h-4m0 0V4"/></svg>
            Export roster
          </button>
        </div>
      </section>
    `;

    const copyLinkDynamic = document.getElementById('copy-link-dynamic');
    const exportRosterBtn = document.getElementById('export-roster-btn');

    copyLinkDynamic?.addEventListener('click', () => {
      if (!joinLink) {
        showToast('No class link available for this classroom yet.', { type: 'warning' });
        return;
      }
      navigator.clipboard
        .writeText(joinLink)
        .then(() => showToast('Class link copied to clipboard.', { type: 'success' }))
        .catch(() =>
          showToast('Unable to copy link. Copy manually from the address bar.', {
            type: 'error',
          })
        );
    });

    exportRosterBtn?.addEventListener('click', () => {
      exportRoster();
    });

    if (pinContainer) {
      if (classroom.access_mode === 'pin' && classroom.join_pin) {
        pinContainer.innerHTML = `
          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p class="text-xs uppercase tracking-wide text-slate-400">Classroom PIN</p>
            <p class="mt-2 text-2xl font-semibold text-slate-900">${classroom.join_pin}</p>
            <p class="mt-1 text-xs text-slate-500">Share with trusted participants only.</p>
          </div>
        `;
      } else {
        pinContainer.innerHTML = '';
      }
    }

    if (whitelistContainer) {
      const whitelist = Array.isArray(classroom.join_phone_whitelist)
        ? classroom.join_phone_whitelist
        : [];
      if (classroom.access_mode === 'phone_whitelist' && whitelist.length) {
        whitelistContainer.innerHTML = `
          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p class="text-xs uppercase tracking-wide text-slate-400">Allowed phone numbers</p>
            <ul class="mt-2 space-y-1 text-sm text-slate-700">
              ${whitelist
                .map(
                  (phone) => `<li class="rounded-lg bg-slate-100 px-3 py-2">${phone}</li>`
                )
                .join('')}
            </ul>
          </div>
        `;
      } else {
        whitelistContainer.innerHTML = '';
      }
    }
  };

  const renderMembers = () => {
    if (!membersContainer) return;
    const filter = state.filter.toLowerCase();
    const members = state.members.filter((member) => {
      if (!filter) return true;
      const haystack = [
        member.display_name,
        member.email,
        member.phone,
        member.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(filter);
    });

    emptyMemberState.classList.toggle('hidden', members.length > 0);
    membersContainer.innerHTML = members
      .map((member) => {
        const attempts = Number(member.completed_attempts) || 0;
        const statusTone =
          member.status === 'active'
            ? 'active'
            : member.status === 'invited'
              ? 'default'
              : 'suspended';
        return `
          <article class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p class="text-sm font-semibold text-slate-900">${member.display_name || 'Unnamed participant'}</p>
                <p class="text-xs text-slate-500">${member.email || member.phone || 'No contact info'}</p>
              </div>
              ${renderBadge(member.status || 'invited', statusTone)}
            </div>
            <div class="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
              <span>Joined ${formatTimeAgo(member.joined_at)}</span>
              <span>${attempts} completed exam${attempts === 1 ? '' : 's'}</span>
              ${
                member.last_attempt_at
                  ? `<span>Last attempt ${formatTimeAgo(member.last_attempt_at)}</span>`
                  : ''
              }
            </div>
            <div class="mt-3 flex flex-wrap gap-2 text-xs">
              <button class="rounded-full border border-slate-200 px-3 py-1 font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300" data-member-action="suspend" data-member-id="${member.member_id}">
                Suspend
              </button>
              <button class="rounded-full border border-slate-200 px-3 py-1 font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300" data-member-action="reset" data-member-id="${member.member_id}">
                Reset attempts
              </button>
            </div>
          </article>
        `;
      })
      .join('');
  };

  const renderExams = () => {
    if (!examsContainer) return;
    if (!state.exams.length) {
      emptyExamState.classList.remove('hidden');
      examsContainer.innerHTML = '';
      return;
    }
    emptyExamState.classList.add('hidden');
    examsContainer.innerHTML = state.exams
      .map((exam) => {
        const duration = exam.starts_at && exam.ends_at
          ? formatDuration((new Date(exam.ends_at) - new Date(exam.starts_at)) / 1000)
          : '—';
        const statusTone =
          exam.status === 'live'
            ? 'active'
            : exam.status === 'completed'
              ? 'default'
              : 'default';
        return `
          <article class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p class="text-sm font-semibold text-slate-900">${exam.quiz_title || 'Untitled exam'}</p>
                <p class="text-xs text-slate-500">${formatDateTime(exam.starts_at)} → ${formatDateTime(exam.ends_at)}</p>
              </div>
              ${renderBadge(exam.status || 'scheduled', statusTone)}
            </div>
            <div class="mt-3 grid gap-4 text-xs text-slate-500 sm:grid-cols-3">
              <span>${exam.expected_participants ?? 0} expected</span>
              <span>${exam.joined_participants ?? 0} joined</span>
              <span>Duration ${duration}</span>
            </div>
            <div class="mt-3 flex flex-wrap gap-2 text-xs">
              <a href="/apps/admin/exam-monitor.html?id=${exam.id}" class="rounded-full bg-cyan-600 px-3 py-1 font-medium text-white hover:bg-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500">Monitor</a>
              <a href="/apps/admin/exam-summary.html?id=${exam.id}" class="rounded-full border border-slate-200 px-3 py-1 font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300">Summary</a>
            </div>
          </article>
        `;
      })
      .join('');
  };

  const loadClassroom = async () => {
    setLoading(true);
    try {
      const [detail, members, exams] = await Promise.allSettled([
        quizBuilderService.getClassroomDetail(classroomId),
        quizBuilderService.listClassroomMembers(classroomId),
        quizBuilderService.listClassroomExams(classroomId),
      ]);

      if (detail.status === 'fulfilled') {
        state.classroom = detail.value;
      } else {
        throw detail.reason;
      }

      if (members.status === 'fulfilled') {
        state.members = members.value;
      } else if (members.reason) {
        console.warn('[ClassroomDetail] Failed to load members', members.reason);
        showToast('Unable to load roster. Check Supabase classroom views.', {
          type: 'warning',
        });
        state.members = [];
      }

      if (exams.status === 'fulfilled') {
        state.exams = exams.value;
      } else if (exams.reason) {
        console.warn('[ClassroomDetail] Failed to load exams', exams.reason);
        showToast('Unable to load scheduled exams right now.', {
          type: 'warning',
        });
        state.exams = [];
      }

      renderSummary();
      renderMembers();
      renderExams();
    } catch (error) {
      console.error('[ClassroomDetail] Failed to load classroom', error);
      const message =
        error instanceof QuizBuilderServiceError
          ? error.message
          : 'Unable to load classroom details. Try refreshing.';
      showToast(message, { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  joinLinkBtn?.addEventListener('click', () => {
    const joinLink = buildJoinLink(state.classroom);
    if (!joinLink) {
      showToast('No class link available yet.', { type: 'warning' });
      return;
    }
    navigator.clipboard
      .writeText(joinLink)
      .then(() => showToast('Class link copied to clipboard.', { type: 'success' }))
      .catch(() =>
        showToast('Unable to copy link. Copy manually from the address bar.', {
          type: 'error',
        })
      );
  });

  refreshBtn?.addEventListener('click', () => loadClassroom());

  memberSearchInput?.addEventListener('input', (event) => {
    state.filter = event.target.value || '';
    renderMembers();
  });

  membersContainer?.addEventListener('click', (event) => {
    const actionBtn = event.target.closest('[data-member-action]');
    if (!actionBtn) return;
    const action = actionBtn.dataset.memberAction;
    const memberId = actionBtn.dataset.memberId;
    if (action === 'suspend') {
      handleMemberAction('suspend', memberId);
    } else if (action === 'reset') {
      handleMemberAction('reset', memberId);
    } else if (action === 'remove') {
      handleMemberAction('remove', memberId);
    } else if (memberId) {
      console.log('[ClassroomDetail] Unknown member action', action, memberId);
    }
  });

  const handleMemberAction = async (action, memberId) => {
    const member = state.members.find(m => m.member_id === memberId);
    if (!member) return;

    const confirmMessages = {
      suspend: `Suspend ${member.display_name}? They won't be able to access the classroom.`,
      reset: `Reset all attempts for ${member.display_name}? This action cannot be undone.`,
      remove: `Remove ${member.display_name} from the classroom? This action cannot be undone.`
    };

    if (!confirm(confirmMessages[action])) return;

    try {
      switch (action) {
        case 'suspend':
          await quizBuilderService.suspendClassroomMember(classroomId, memberId);
          showToast('Member suspended successfully.', { type: 'success' });
          break;
        case 'reset':
          await quizBuilderService.resetMemberAttempts(classroomId, memberId);
          showToast('Member attempts reset successfully.', { type: 'success' });
          break;
        case 'remove':
          await quizBuilderService.removeClassroomMember(classroomId, memberId);
          showToast('Member removed successfully.', { type: 'info' });
          break;
      }
      loadClassroom(); // Reload to show updated member list
    } catch (error) {
      console.error(`[ClassroomDetail] Failed to ${action} member`, error);
      showToast(
        error.message || `Unable to ${action} member. Please try again.`,
        { type: 'error' }
      );
    }
  };

  const exportRoster = async () => {
    try {
      showToast('Preparing roster export...', { type: 'info' });
      const data = await quizBuilderService.exportClassroomRoster(classroomId, 'csv');

      // Create download link
      const blob = new Blob([data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${state.classroom?.name || 'classroom'}-roster-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      showToast('Roster exported successfully!', { type: 'success' });
    } catch (error) {
      console.error('[ClassroomDetail] Failed to export roster', error);
      showToast(
        error.message || 'Unable to export roster. Please try again.',
        { type: 'error' }
      );
    }
  };

  // Add invite member functionality
  const setupInviteMember = () => {
    const inviteBtn = Array.from(document.querySelectorAll('button')).find(btn =>
      btn.textContent.includes('Invite member')
    );
    if (inviteBtn) {
      inviteBtn.addEventListener('click', openInviteModal);
    }
  };

  const openInviteModal = () => {
    const modal = document.createElement('div');
    modal.id = 'invite-member-modal';
    modal.className = 'fixed inset-0 z-50 bg-black/40 px-4 pb-10 pt-24 backdrop-blur-sm sm:px-6 md:px-10';
    modal.innerHTML = `
      <div class="mx-auto max-w-lg rounded-2xl bg-white shadow-xl">
        <form id="invite-member-form" class="flex flex-col gap-4 p-6 sm:p-8" autocomplete="off">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 class="text-xl font-semibold text-slate-900">Invite Member</h2>
              <p class="text-sm text-slate-500 mt-1">Send an invitation to join this classroom.</p>
            </div>
            <button type="button" class="close-invite-modal rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
              <span class="sr-only">Close</span>
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div>
            <label for="member-name" class="block text-sm font-medium text-slate-700">Full Name</label>
            <input id="member-name" name="member-name" type="text" required class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400" placeholder="John Doe">
          </div>

          <div>
            <label for="member-email" class="block text-sm font-medium text-slate-700">Email Address</label>
            <input id="member-email" name="member-email" type="email" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400" placeholder="john@example.com">
            <p class="mt-1 text-xs text-slate-500">Required for email invitations</p>
          </div>

          <div>
            <label for="member-phone" class="block text-sm font-medium text-slate-700">Phone Number</label>
            <input id="member-phone" name="member-phone" type="tel" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400" placeholder="+2348031234567">
            <p class="mt-1 text-xs text-slate-500">Required for phone-based access</p>
          </div>

          <div>
            <label for="member-role" class="block text-sm font-medium text-slate-700">Role</label>
            <select id="member-role" name="member-role" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400">
              <option value="student">Student</option>
              <option value="teaching_assistant">Teaching Assistant</option>
              <option value="instructor">Instructor</option>
            </select>
          </div>

          <div class="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p class="text-sm text-amber-800">
              <strong>Note:</strong> Members will receive an invitation via email or SMS with instructions to join the classroom.
            </p>
          </div>

          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            <button type="button" class="close-invite-modal inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
              Cancel
            </button>
            <button type="submit" class="inline-flex items-center justify-center rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500" data-invite-label="Send invitation">
              Send invitation
            </button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    // Add event listeners
    modal.querySelector('.close-invite-modal').addEventListener('click', () => closeInviteModal());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeInviteModal();
    });

    modal.querySelector('#invite-member-form').addEventListener('submit', handleInviteSubmit);
  };

  const closeInviteModal = () => {
    const modal = document.getElementById('invite-member-modal');
    if (modal) {
      modal.remove();
      document.body.style.overflow = '';
    }
  };

  const handleInviteSubmit = async (event) => {
    event.preventDefault();
    const form = event.target;
    const submitBtn = form.querySelector('[data-invite-label]');

    const formData = new FormData(form);
    const memberData = {
      displayName: formData.get('member-name'),
      email: formData.get('member-email'),
      phone: formData.get('member-phone'),
      role: formData.get('member-role'),
    };

    if (!memberData.email && !memberData.phone) {
      showToast('Please provide either an email address or phone number.', { type: 'warning' });
      return;
    }

    try {
      submitBtn.textContent = 'Sending…';
      submitBtn.disabled = true;

      await quizBuilderService.inviteClassroomMember(classroomId, memberData);

      showToast('Invitation sent successfully!', { type: 'success' });
      closeInviteModal();
      loadClassroom(); // Reload to show updated member list
    } catch (error) {
      console.error('[ClassroomDetail] Failed to send invitation', error);
      showToast(
        error.message || 'Unable to send invitation. Please try again.',
        { type: 'error' }
      );
    } finally {
      submitBtn.textContent = 'Send invitation';
      submitBtn.disabled = false;
    }
  };

  // Initialize invite member functionality
  setTimeout(() => setupInviteMember(), 100);

  loadClassroom();
});

import {
  quizBuilderService,
  QuizBuilderServiceError,
} from '../services/quizBuilderService.js';
import { showToast } from '../components/toast.js';
import {
  formatDateTime,
  formatDuration,
  formatScore,
  formatTimeAgo,
} from '../utils/format.js';

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function statusChip(status) {
  const tone =
    status === 'live'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'completed'
        ? 'bg-slate-200 text-slate-600'
        : status === 'scheduled'
          ? 'bg-cyan-100 text-cyan-700'
          : 'bg-slate-100 text-slate-700';
  return `<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}">${status ?? 'unknown'}</span>`;
}

document.addEventListener('DOMContentLoaded', () => {
  const examId = getQueryParam('id');
  const examTitleEl = document.getElementById('exam-title');
  const examDetailEl = document.getElementById('exam-detail');
  const statsContainer = document.getElementById('exam-stats');
  const attemptsContainer = document.getElementById('attempts-table-body');
  const emptyAttemptsState = document.getElementById('attempts-empty-state');
  const refreshBtn = document.getElementById('refresh-attempts-btn');
  const loader = document.getElementById('page-loader');

  if (!examId) {
    showToast('Missing exam ID.', { type: 'error' });
    loader.innerHTML =
      '<p class="text-sm text-rose-600">Missing exam ID. Return to the classroom view and try again.</p>';
    return;
  }

  const state = {
    exam: null,
    attempts: [],
    loading: false,
    channel: null,
    reloadTimeout: null,
  };

  const setLoading = (loading) => {
    state.loading = loading;
    loader.classList.toggle('hidden', !loading);
    refreshBtn.disabled = loading;
    refreshBtn.textContent = loading ? 'Refreshing…' : 'Refresh';
  };

  const computeStats = () => {
    const attempts = state.attempts;
    const joined = attempts.filter((a) => a.status !== 'pending');
    const completed = attempts.filter((a) => a.status === 'completed');
    const live = attempts.filter((a) => a.status === 'in_progress');
    const averageScore =
      completed.reduce(
        (acc, attempt) => acc + (Number(attempt.score_percent) || 0),
        0
      ) / (completed.length || 1);
    const best = completed.reduce(
      (prev, curr) =>
        (Number(curr.score_percent) || 0) > (Number(prev.score_percent) || 0)
          ? curr
          : prev,
      completed[0] || null
    );
    const worst = completed.reduce(
      (prev, curr) =>
        (Number(curr.score_percent) || 0) < (Number(prev.score_percent) || 0)
          ? curr
          : prev,
      completed[0] || null
    );
    return {
      total: attempts.length,
      joined: joined.length,
      live: live.length,
      completed: completed.length,
      averageScore: Number.isFinite(averageScore) ? averageScore : 0,
      best,
      worst,
    };
  };

  const renderExamOverview = () => {
    if (!state.exam) return;
    examTitleEl.textContent = state.exam.quiz_title || 'Exam monitor';
    document.title = `${state.exam.quiz_title || 'Exam'} | Monitor`;
    examDetailEl.innerHTML = `
      <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div class="space-y-3">
            <div class="flex items-center gap-3">
              <p class="text-sm font-medium text-slate-900">${state.exam.classroom_name || 'Unnamed classroom'}</p>
              ${statusChip(state.exam.status)}
            </div>
            <p class="text-xs text-slate-500">
              ${formatDateTime(state.exam.starts_at)} → ${formatDateTime(state.exam.ends_at)}
            </p>
            <dl class="grid gap-4 text-sm text-slate-600 sm:grid-cols-3">
              <div>
                <dt class="text-xs uppercase tracking-wide text-slate-400">Delivery</dt>
                <dd class="mt-1">${state.exam.delivery_mode || 'synchronous'}</dd>
              </div>
              <div>
                <dt class="text-xs uppercase tracking-wide text-slate-400">PIN required</dt>
                <dd class="mt-1">${state.exam.pin_required ? 'Yes' : 'No'}</dd>
              </div>
              <div>
                <dt class="text-xs uppercase tracking-wide text-slate-400">Visibility</dt>
                <dd class="mt-1">${state.exam.visibility || 'classroom'}</dd>
              </div>
            </dl>
          </div>
          <div class="w-full max-w-xs rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
            <div class="flex items-center justify-between">
              <span class="font-medium text-slate-700">Expected</span>
              <span>${state.exam.expected_participants ?? '—'}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="font-medium text-slate-700">Join limit</span>
              <span>${state.exam.join_limit ?? 'No limit'}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="font-medium text-slate-700">Created</span>
              <span>${formatDateTime(state.exam.created_at)}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  };

  const renderStats = () => {
    if (!statsContainer) return;
    const stats = computeStats();
    const tiles = [
      {
        label: 'Participants',
        value: stats.total,
        hint: `${stats.joined} joined`,
        tone: 'text-slate-900',
      },
      {
        label: 'Live now',
        value: stats.live,
        hint: `${stats.completed} completed`,
        tone: 'text-emerald-600',
      },
      {
        label: 'Average score',
        value: `${Math.round(stats.averageScore * 10) / 10}%`,
        hint: stats.best
          ? `Top: ${stats.best.participant_name || stats.best.participant_email || 'Participant'}`
          : 'Awaiting submissions',
        tone: 'text-indigo-600',
      },
      {
        label: 'Lowest score',
        value: stats.worst
          ? `${Math.round((Number(stats.worst.score_percent) || 0) * 10) / 10}%`
          : '—',
        hint: stats.worst
          ? `By ${stats.worst.participant_name || stats.worst.participant_email || 'Participant'}`
          : '—',
        tone: 'text-rose-600',
      },
    ];

    statsContainer.innerHTML = tiles
      .map(
        (tile) => `
        <article class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p class="text-xs uppercase tracking-wide text-slate-400">${tile.label}</p>
          <p class="mt-2 text-2xl font-semibold ${tile.tone}">${tile.value}</p>
          <p class="mt-1 text-xs text-slate-500">${tile.hint}</p>
        </article>
      `
      )
      .join('');
  };

  const renderAttempts = () => {
    if (!attemptsContainer) return;
    if (!state.attempts.length) {
      emptyAttemptsState.classList.remove('hidden');
      attemptsContainer.innerHTML = '';
      return;
    }

    emptyAttemptsState.classList.add('hidden');
    attemptsContainer.innerHTML = state.attempts
      .map((attempt) => {
        const statusLabel = attempt.status || 'pending';
        const progress =
          attempt.progress_percent != null
            ? Math.round(Number(attempt.progress_percent))
            : null;
        const durationSeconds =
          attempt.duration_seconds ??
          (attempt.started_at && attempt.completed_at
            ? (new Date(attempt.completed_at) - new Date(attempt.started_at)) / 1000
            : null);
        return `
          <tr class="border-b border-slate-100">
            <td class="whitespace-nowrap px-3 py-3 text-sm font-medium text-slate-900">
              ${attempt.participant_name || attempt.participant_email || 'Participant'}
              <p class="mt-0.5 text-xs text-slate-500">${attempt.participant_email || attempt.participant_phone || ''}</p>
            </td>
            <td class="whitespace-nowrap px-3 py-3 text-sm text-slate-600">
              ${statusChip(statusLabel)}
            </td>
            <td class="whitespace-nowrap px-3 py-3 text-sm text-slate-600">
              ${progress != null ? `${progress}%` : '—'}
            </td>
            <td class="whitespace-nowrap px-3 py-3 text-sm text-slate-600">
              ${attempt.score_percent != null ? formatScore(Number(attempt.score_percent)) : '—'}
            </td>
            <td class="whitespace-nowrap px-3 py-3 text-sm text-slate-500">
              ${attempt.started_at ? formatTimeAgo(attempt.started_at) : '—'}
            </td>
            <td class="whitespace-nowrap px-3 py-3 text-sm text-slate-500">
              ${formatDuration(durationSeconds)}
            </td>
            <td class="px-3 py-3 text-right text-sm">
              <button class="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300" data-attempt-action="view" data-attempt-id="${attempt.attempt_id}">
                View log
              </button>
            </td>
          </tr>
        `;
      })
      .join('');
  };

  const scheduleReload = () => {
    if (state.reloadTimeout) {
      clearTimeout(state.reloadTimeout);
    }
    state.reloadTimeout = setTimeout(() => {
      loadAttempts();
    }, 500);
  };

  const subscribeToChannel = async () => {
    if (state.channel) {
      return;
    }
    try {
      state.channel = await quizBuilderService.subscribeToExamChannel(
        examId,
        (payload) => {
          console.log('[ExamMonitor] Received event', payload);
          showToast('New activity detected. Updating attempts…', {
            type: 'info',
            duration: 2500,
          });
          scheduleReload();
        }
      );
    } catch (error) {
      console.error('[ExamMonitor] Failed to join real-time channel', error);
      showToast('Real-time monitoring unavailable. Refresh manually to see updates.', {
        type: 'warning',
      });
    }
  };

  const unsubscribeChannel = () => {
    if (state.channel) {
      state.channel.unsubscribe();
      state.channel = null;
    }
  };

  const loadExam = async () => {
    try {
      const exam = await quizBuilderService.getExamDetail(examId);
      state.exam = exam;
      renderExamOverview();
      subscribeToChannel();
    } catch (error) {
      console.error('[ExamMonitor] Failed to load exam', error);
      const message =
        error instanceof QuizBuilderServiceError
          ? error.message
          : 'Unable to load exam details.';
      showToast(message, { type: 'error' });
    }
  };

  async function loadAttempts() {
    setLoading(true);
    try {
      const attempts = await quizBuilderService.listExamAttempts(examId);
      state.attempts = attempts;
      renderStats();
      renderAttempts();
    } catch (error) {
      console.error('[ExamMonitor] Failed to load attempts', error);
      const message =
        error instanceof QuizBuilderServiceError
          ? error.message
          : 'Unable to load live attempts. Try refreshing.';
      showToast(message, { type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  refreshBtn?.addEventListener('click', () => loadAttempts());

  attemptsContainer?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-attempt-action]');
    if (!button) return;
    const { attemptAction: action } = button.dataset;
    if (action === 'view') {
      showToast('Attempt logs will be available in a future update.', {
        type: 'info',
      });
    }
  });

  window.addEventListener('beforeunload', () => {
    unsubscribeChannel();
  });

  loadExam();
  loadAttempts();
});

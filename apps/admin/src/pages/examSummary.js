import {
  quizBuilderService,
  QuizBuilderServiceError,
} from '../services/quizBuilderService.js';
import { showToast } from '../components/toast.js';
import {
  formatDateTime,
  formatDuration,
  formatScore,
} from '../utils/format.js';

function getParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function computeSummary(attempts) {
  const completed = attempts.filter((attempt) => attempt.status === 'completed');
  if (!completed.length) {
    return {
      average: 0,
      highest: null,
      lowest: null,
      median: 0,
      completionRate: 0,
    };
  }

  const scores = completed
    .map((attempt) => Number(attempt.score_percent) || 0)
    .sort((a, b) => a - b);
  const average =
    scores.reduce((sum, score) => sum + score, 0) / (scores.length || 1);
  const median =
    scores.length % 2 === 0
      ? (scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2
      : scores[Math.floor(scores.length / 2)];
  const highest = completed.reduce(
    (best, current) =>
      (Number(current.score_percent) || 0) >
      (Number(best?.score_percent) || -Infinity)
        ? current
        : best,
    null
  );
  const lowest = completed.reduce(
    (worst, current) =>
      (Number(current.score_percent) || 0) <
      (Number(worst?.score_percent) || Infinity)
        ? current
        : worst,
    null
  );

  return {
    average,
    highest,
    lowest,
    median,
    completionRate: Math.round((completed.length / attempts.length) * 100),
  };
}

document.addEventListener('DOMContentLoaded', () => {
  const examId = getParam('id');
  const titleEl = document.getElementById('summary-title');
  const metaEl = document.getElementById('summary-meta');
  const statsEl = document.getElementById('summary-stats');
  const leaderboardEl = document.getElementById('leaderboard');
  const breakdownEl = document.getElementById('breakdown');
  const exportBtn = document.getElementById('export-summary-btn');
  const refreshBtn = document.getElementById('refresh-summary-btn');
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
  };

  const setLoading = (loading) => {
    state.loading = loading;
    loader.classList.toggle('hidden', !loading);
    refreshBtn.disabled = loading;
    refreshBtn.textContent = loading ? 'Refreshing…' : 'Refresh';
  };

  const renderMeta = () => {
    if (!state.exam || !metaEl) return;
    titleEl.textContent = state.exam.quiz_title || 'Exam summary';
    document.title = `${state.exam.quiz_title || 'Exam'} | Summary`;
    metaEl.innerHTML = `
      <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p class="text-xs uppercase tracking-wide text-slate-400">Classroom</p>
            <p class="mt-2 text-sm font-medium text-slate-900">${state.exam.classroom_name || '—'}</p>
          </div>
          <div>
            <p class="text-xs uppercase tracking-wide text-slate-400">Schedule</p>
            <p class="mt-2 text-sm text-slate-600">${formatDateTime(state.exam.starts_at)} → ${formatDateTime(state.exam.ends_at)}</p>
          </div>
          <div>
            <p class="text-xs uppercase tracking-wide text-slate-400">Duration</p>
            <p class="mt-2 text-sm text-slate-600">${formatDuration(
              state.exam.duration_seconds
            )}</p>
          </div>
          <div>
            <p class="text-xs uppercase tracking-wide text-slate-400">Invite mode</p>
            <p class="mt-2 text-sm text-slate-600">${state.exam.visibility || 'classroom'}</p>
          </div>
        </div>
      </div>
    `;
  };

  const renderStats = () => {
    if (!statsEl) return;
    const summary = computeSummary(state.attempts);
    const cards = [
      {
        label: 'Average score',
        value: `${Math.round(summary.average * 10) / 10}%`,
        hint: `${state.attempts.length} submissions`,
        tone: 'text-indigo-600',
      },
      {
        label: 'Median score',
        value: `${Math.round(summary.median * 10) / 10}%`,
        hint: 'Half of participants scored above this value',
        tone: 'text-slate-900',
      },
      {
        label: 'Completion rate',
        value: `${summary.completionRate}%`,
        hint: 'Percentage of joined participants who finished',
        tone: 'text-emerald-600',
      },
      {
        label: 'Participation',
        value: state.attempts.length,
        hint: `${state.exam.expected_participants ?? '—'} expected`,
        tone: 'text-rose-600',
      },
    ];

    statsEl.innerHTML = cards
      .map(
        (card) => `
        <article class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p class="text-xs uppercase tracking-wide text-slate-400">${card.label}</p>
          <p class="mt-2 text-2xl font-semibold ${card.tone}">${card.value}</p>
          <p class="mt-1 text-xs text-slate-500">${card.hint}</p>
        </article>
      `
      )
      .join('');
  };

  const renderLeaderboard = () => {
    if (!leaderboardEl) return;
    if (!state.attempts.length) {
      leaderboardEl.innerHTML = `
        <div class="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
          No attempts submitted yet.
        </div>
      `;
      return;
    }

    const completed = state.attempts.filter(
      (attempt) => attempt.status === 'completed'
    );
    completed.sort(
      (a, b) => (Number(b.score_percent) || 0) - (Number(a.score_percent) || 0)
    );

    leaderboardEl.innerHTML = `
      <div class="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <table class="min-w-full divide-y divide-slate-100">
          <thead class="bg-slate-50">
            <tr>
              <th scope="col" class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Rank</th>
              <th scope="col" class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Participant</th>
              <th scope="col" class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Score</th>
              <th scope="col" class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Duration</th>
              <th scope="col" class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Submitted</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${completed
              .map((attempt, index) => {
                const duration =
                  attempt.duration_seconds ??
                  (attempt.started_at && attempt.completed_at
                    ? (new Date(attempt.completed_at) - new Date(attempt.started_at)) / 1000
                    : null);
                return `
                  <tr>
                    <td class="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-900">${index + 1}</td>
                    <td class="whitespace-nowrap px-4 py-3 text-sm text-slate-700">
                      ${attempt.participant_name || attempt.participant_email || 'Participant'}
                      <p class="text-xs text-slate-500">${attempt.participant_email || attempt.participant_phone || ''}</p>
                    </td>
                    <td class="whitespace-nowrap px-4 py-3 text-sm font-semibold text-indigo-600">${formatScore(attempt.score_percent)}</td>
                    <td class="whitespace-nowrap px-4 py-3 text-sm text-slate-600">${formatDuration(duration)}</td>
                    <td class="whitespace-nowrap px-4 py-3 text-sm text-slate-500">${formatDateTime(attempt.completed_at)}</td>
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  };

  const renderBreakdown = () => {
    if (!breakdownEl) return;
    if (!state.attempts.length) {
      breakdownEl.innerHTML = '';
      return;
    }

    const grouped = state.attempts.reduce(
      (acc, attempt) => {
        const status = attempt.status || 'pending';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      },
      { pending: 0, in_progress: 0, completed: 0, abandoned: 0 }
    );

    breakdownEl.innerHTML = `
      <section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 class="text-sm font-semibold text-slate-900">Attempt breakdown</h3>
        <dl class="mt-4 grid gap-4 text-sm text-slate-600 sm:grid-cols-2">
          <div class="rounded-xl bg-slate-50 px-4 py-3">
            <dt class="text-xs uppercase tracking-wide text-slate-400">Pending</dt>
            <dd class="mt-1 text-lg font-semibold text-slate-900">${grouped.pending ?? 0}</dd>
            <p class="mt-1 text-xs text-slate-500">Haven’t started yet</p>
          </div>
          <div class="rounded-xl bg-amber-50 px-4 py-3">
            <dt class="text-xs uppercase tracking-wide text-amber-500">In progress</dt>
            <dd class="mt-1 text-lg font-semibold text-amber-600">${grouped.in_progress ?? 0}</dd>
            <p class="mt-1 text-xs text-amber-500">Currently taking the exam</p>
          </div>
          <div class="rounded-xl bg-emerald-50 px-4 py-3">
            <dt class="text-xs uppercase tracking-wide text-emerald-500">Completed</dt>
            <dd class="mt-1 text-lg font-semibold text-emerald-600">${grouped.completed ?? 0}</dd>
            <p class="mt-1 text-xs text-emerald-500">Finished and submitted</p>
          </div>
          <div class="rounded-xl bg-rose-50 px-4 py-3">
            <dt class="text-xs uppercase tracking-wide text-rose-500">Abandoned</dt>
            <dd class="mt-1 text-lg font-semibold text-rose-600">${grouped.abandoned ?? 0}</dd>
            <p class="mt-1 text-xs text-rose-500">Exited before submitting</p>
          </div>
        </dl>
      </section>
    `;
  };

  const renderAll = () => {
    renderMeta();
    renderStats();
    renderLeaderboard();
    renderBreakdown();
  };

  const loadSummary = async () => {
    setLoading(true);
    try {
      const [exam, attempts] = await Promise.all([
        quizBuilderService.getExamDetail(examId),
        quizBuilderService.listExamAttempts(examId),
      ]);

      state.exam = exam;
      state.attempts = attempts;
      renderAll();
    } catch (error) {
      console.error('[ExamSummary] Failed to load summary', error);
      const message =
        error instanceof QuizBuilderServiceError
          ? error.message
          : 'Unable to load exam summary. Try again.';
      showToast(message, { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  refreshBtn?.addEventListener('click', () => loadSummary());

  exportBtn?.addEventListener('click', () => {
    showToast('Exporting CSV will be available once the reporting API ships.', {
      type: 'info',
    });
  });

  loadSummary();
});

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

function getParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function computeStats(attempts, maxParticipants) {
  if (!attempts.length) {
    return {
      average: 0,
      highest: null,
      lowest: null,
      completionRate: 0,
      remainingSeats: maxParticipants ?? 0,
    };
  }
  const scores = attempts
    .filter((attempt) => attempt.score_percent != null)
    .map((attempt) => Number(attempt.score_percent) || 0);
  const average =
    scores.reduce((sum, value) => sum + value, 0) / (scores.length || 1);
  const highest = attempts.reduce(
    (best, attempt) =>
      (Number(attempt.score_percent) || 0) >
      (Number(best?.score_percent) || -Infinity)
        ? attempt
        : best,
    null
  );
  const lowest = attempts.reduce(
    (worst, attempt) =>
      (Number(attempt.score_percent) || 0) <
      (Number(worst?.score_percent) || Infinity)
        ? attempt
        : worst,
    null
  );

  return {
    average,
    highest,
    lowest,
    completionRate: maxParticipants
      ? Math.round((attempts.length / maxParticipants) * 100)
      : null,
    remainingSeats:
      maxParticipants != null ? Math.max(0, maxParticipants - attempts.length) : null,
  };
}

document.addEventListener('DOMContentLoaded', () => {
  const shareId = getParam('id');
  const titleEl = document.getElementById('analytics-title');
  const metaEl = document.getElementById('analytics-meta');
  const statsEl = document.getElementById('analytics-stats');
  const leaderboardEl = document.getElementById('analytics-leaderboard');
  const responseListEl = document.getElementById('response-list');
  const refreshBtn = document.getElementById('refresh-analytics-btn');
  const loader = document.getElementById('page-loader');

  if (!shareId) {
    showToast('Missing share link ID.', { type: 'error' });
    loader.innerHTML =
      '<p class="text-sm text-rose-600">Missing share link ID. Return to the quiz builder and try again.</p>';
    return;
  }

  const state = {
    link: null,
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
    if (!state.link || !metaEl) return;
    titleEl.textContent = state.link.title || 'Quiz analytics';
    document.title = `${state.link.title || 'Quiz'} | Analytics`;
    const shareUrl = `${window.location.origin}/take-quiz?link=${state.link.id}`;
    metaEl.innerHTML = `
      <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div class="space-y-4">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p class="text-xs uppercase tracking-wide text-slate-400">Share link</p>
              <p class="mt-2 text-sm font-medium text-slate-900 break-all">${shareUrl}</p>
            </div>
            <div class="flex flex-wrap gap-3">
              <button id="copy-share-link-btn" class="inline-flex items-center gap-2 rounded-full bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500">
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 12a5 5 0 017-7l1 1m3 3a5 5 0 01-7 7l-1-1"/></svg>
                Copy link
              </button>
              <button id="close-share-link-btn" class="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300">
                Close link
              </button>
            </div>
          </div>
          <dl class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm text-slate-600">
            <div>
              <dt class="text-xs uppercase tracking-wide text-slate-400">Created</dt>
              <dd class="mt-1">${formatDateTime(state.link.created_at)}</dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-slate-400">Last submission</dt>
              <dd class="mt-1">${formatTimeAgo(state.link.last_submission_at)}</dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-slate-400">Participants</dt>
              <dd class="mt-1">${state.link.submissions ?? 0}</dd>
            </div>
            <div>
              <dt class="text-xs uppercase tracking-wide text-slate-400">Cap</dt>
              <dd class="mt-1">${state.link.max_participants ?? 'No limit'}</dd>
            </div>
          </dl>
        </div>
      </div>
    `;

    document
      .getElementById('copy-share-link-btn')
      ?.addEventListener('click', () => {
        navigator.clipboard
          .writeText(shareUrl)
          .then(() =>
            showToast('Share link copied to clipboard.', { type: 'success' })
          )
          .catch(() =>
            showToast('Unable to copy link. Copy manually from the address bar.', {
              type: 'error',
            })
          );
      });

    document
      .getElementById('close-share-link-btn')
      ?.addEventListener('click', () =>
        showToast('Closing share links will ship with the next backend release.', {
          type: 'info',
        })
      );
  };

  const renderStats = () => {
    if (!statsEl || !state.link) return;
    const stats = computeStats(state.attempts, state.link.max_participants);
    const cards = [
      {
        label: 'Average score',
        value: `${Math.round(stats.average * 10) / 10}%`,
        hint: `${state.attempts.length} submissions`,
        tone: 'text-indigo-600',
      },
      {
        label: 'Highest score',
        value: stats.highest ? formatScore(stats.highest.score_percent) : '—',
        hint: stats.highest
          ? stats.highest.participant_name || stats.highest.participant_email
          : 'Awaiting submissions',
        tone: 'text-emerald-600',
      },
      {
        label: 'Lowest score',
        value: stats.lowest ? formatScore(stats.lowest.score_percent) : '—',
        hint: stats.lowest
          ? stats.lowest.participant_name || stats.lowest.participant_email
          : '—',
        tone: 'text-rose-600',
      },
      {
        label: 'Remaining seats',
        value:
          stats.remainingSeats != null
            ? stats.remainingSeats
            : 'Unlimited',
        hint:
          stats.completionRate != null
            ? `${stats.completionRate}% of cap used`
            : 'No participant cap',
        tone: 'text-slate-900',
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
    const ranked = [...state.attempts].sort(
      (a, b) => (Number(b.score_percent) || 0) - (Number(a.score_percent) || 0)
    );

    if (!ranked.length) {
      leaderboardEl.innerHTML = `
        <div class="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
          No submissions yet. Share the link to start collecting results.
        </div>
      `;
      return;
    }

    leaderboardEl.innerHTML = `
      <div class="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <table class="min-w-full divide-y divide-slate-100">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Rank</th>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Participant</th>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Score</th>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Duration</th>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Submitted</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${ranked
              .map((attempt, index) => {
                const duration =
                  attempt.duration_seconds ??
                  (attempt.started_at && attempt.submitted_at
                    ? (new Date(attempt.submitted_at) - new Date(attempt.started_at)) /
                      1000
                    : null);
                return `
                  <tr>
                    <td class="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-900">${index + 1}</td>
                    <td class="whitespace-nowrap px-4 py-3 text-sm text-slate-700">
                      ${attempt.participant_name || attempt.participant_email || 'Participant'}
                      <p class="text-xs text-slate-500">${attempt.participant_email || attempt.participant_phone || ''}</p>
                    </td>
                    <td class="whitespace-nowrap px-4 py-3 text-sm font-semibold text-indigo-600">${formatScore(attempt.score_percent)}</td>
                    <td class="whitespace-nowrap px-4 py-3 text-sm text-slate-600">${formatDuration(duration)}</td>
                    <td class="whitespace-nowrap px-4 py-3 text-sm text-slate-500">${formatDateTime(attempt.submitted_at)}</td>
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  };

  const renderResponseList = () => {
    if (!responseListEl) return;
    if (!state.attempts.length) {
      responseListEl.innerHTML = '';
      return;
    }

    responseListEl.innerHTML = state.attempts
      .map((attempt) => {
        const tags = [];
        if (attempt.device_type) tags.push(attempt.device_type);
        if (attempt.location_city) tags.push(attempt.location_city);
        if (attempt.location_country) tags.push(attempt.location_country);
        return `
          <article class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p class="text-sm font-semibold text-slate-900">${attempt.participant_name || attempt.participant_email || 'Participant'}</p>
                <p class="text-xs text-slate-500">${formatDateTime(attempt.submitted_at)}</p>
              </div>
              <div class="text-right">
                <p class="text-sm font-semibold text-indigo-600">${formatScore(attempt.score_percent)}</p>
                <p class="text-xs text-slate-500">${attempt.passed ? 'Passed' : 'Failed'}</p>
              </div>
            </div>
            <div class="mt-3 grid gap-3 text-xs text-slate-500 sm:grid-cols-4">
              <span>${attempt.questions_answered ?? '—'} answered</span>
              <span>${attempt.correct_answers ?? '—'} correct</span>
              <span>Duration ${formatDuration(attempt.duration_seconds)}</span>
              <span>Attempt ${attempt.attempt_number ?? 1}</span>
            </div>
            ${
              tags.length
                ? `<div class="mt-3 flex flex-wrap gap-2 text-xs">
                    ${tags
                      .map(
                        (tag) =>
                          `<span class="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-slate-600">${tag}</span>`
                      )
                      .join('')}
                  </div>`
                : ''
            }
            <div class="mt-3 flex gap-2">
              <button
                class="text-xs text-cyan-600 hover:text-cyan-700 font-medium"
                onclick="viewAttemptDetails('${attempt.id}')"
              >
                View responses
              </button>
              <button
                class="text-xs text-slate-600 hover:text-slate-700 font-medium"
                onclick="downloadAttemptReport('${attempt.id}')"
              >
                Download report
              </button>
            </div>
          </article>
        `;
      })
      .join('');
  };

  const renderAll = () => {
    renderMeta();
    renderStats();
    renderLeaderboard();
    renderResponseList();
  };

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const [link, attempts] = await Promise.all([
        quizBuilderService.getSharedQuizDetail(shareId),
        quizBuilderService.listSharedQuizAttempts(shareId),
      ]);
      state.link = link;
      state.attempts = attempts;
      renderAll();
    } catch (error) {
      console.error('[SharedQuizAnalytics] Failed to load analytics', error);
      const message =
        error instanceof QuizBuilderServiceError
          ? error.message
          : 'Unable to load quiz analytics. Try refreshing.';
      showToast(message, { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const viewAttemptDetails = async (attemptId) => {
    try {
      const attempt = state.attempts.find(a => a.id === attemptId);
      if (!attempt) return;

      // Create modal for attempt details
      const modal = document.createElement('div');
      modal.id = 'attempt-details-modal';
      modal.className = 'fixed inset-0 z-50 bg-black/40 px-4 pb-10 pt-24 backdrop-blur-sm sm:px-6 md:px-10 overflow-y-auto';
      modal.innerHTML = `
        <div class="mx-auto max-w-4xl rounded-2xl bg-white shadow-xl my-8">
          <div class="p-6 border-b border-slate-200">
            <div class="flex items-start justify-between">
              <div>
                <h2 class="text-xl font-semibold text-slate-900">Attempt Details</h2>
                <p class="text-sm text-slate-500 mt-1">${attempt.participant_name || attempt.participant_email || 'Participant'}</p>
              </div>
              <button onclick="closeAttemptModal()" class="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div class="p-6">
            <div class="grid gap-4 md:grid-cols-3 mb-6">
              <div class="text-center">
                <p class="text-2xl font-bold text-indigo-600">${formatScore(attempt.score_percent)}</p>
                <p class="text-sm text-slate-500">Final Score</p>
              </div>
              <div class="text-center">
                <p class="text-2xl font-bold text-slate-900">${attempt.correct_answers || 0}/${attempt.questions_answered || 0}</p>
                <p class="text-sm text-slate-500">Correct Answers</p>
              </div>
              <div class="text-center">
                <p class="text-2xl font-bold text-slate-900">${formatDuration(attempt.duration_seconds)}</p>
                <p class="text-sm text-slate-500">Time Taken</p>
              </div>
            </div>
            <div id="attempt-responses" class="space-y-4">
              <div class="text-center text-sm text-slate-500">
                Loading responses...
              </div>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      document.body.style.overflow = 'hidden';

      // Load detailed responses
      const responses = await quizBuilderService.getAttemptResponses(attemptId);
      const responsesContainer = document.getElementById('attempt-responses');

      if (responses && responses.length > 0) {
        responsesContainer.innerHTML = responses.map((response, index) => `
          <div class="border border-slate-200 rounded-lg p-4">
            <div class="flex items-start justify-between mb-2">
              <div class="flex-1">
                <p class="font-medium text-slate-900">Question ${index + 1}</p>
                <p class="text-sm text-slate-600 mt-1">${response.question_text || 'Question text not available'}</p>
              </div>
              <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                response.is_correct ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
              }">
                ${response.is_correct ? 'Correct' : 'Incorrect'}
              </span>
            </div>
            <div class="mt-3 space-y-2">
              <div class="text-sm">
                <span class="font-medium text-slate-700">Selected answer:</span>
                <span class="text-slate-600">${response.selected_answer || 'Not answered'}</span>
              </div>
              ${response.correct_answer ? `
                <div class="text-sm">
                  <span class="font-medium text-slate-700">Correct answer:</span>
                  <span class="text-emerald-600">${response.correct_answer}</span>
                </div>
              ` : ''}
              ${response.explanation ? `
                <div class="text-sm bg-slate-50 rounded p-2">
                  <span class="font-medium text-slate-700">Explanation:</span>
                  <span class="text-slate-600">${response.explanation}</span>
                </div>
              ` : ''}
            </div>
          </div>
        `).join('');
      } else {
        responsesContainer.innerHTML = '<p class="text-center text-sm text-slate-500">No detailed responses available.</p>';
      }

    } catch (error) {
      console.error('[SharedQuizAnalytics] Failed to load attempt details', error);
      showToast('Unable to load attempt details.', { type: 'error' });
    }
  };

  const closeAttemptModal = () => {
    const modal = document.getElementById('attempt-details-modal');
    if (modal) {
      modal.remove();
      document.body.style.overflow = '';
    }
  };

  const downloadAttemptReport = async (attemptId) => {
    try {
      showToast('Generating report...', { type: 'info' });
      const attempt = state.attempts.find(a => a.id === attemptId);
      if (!attempt) return;

      // Generate CSV report
      const csvContent = await generateAttemptReportCSV(attempt);
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quiz-report-${attempt.participant_name || 'participant'}-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      showToast('Report downloaded successfully!', { type: 'success' });
    } catch (error) {
      console.error('[SharedQuizAnalytics] Failed to download report', error);
      showToast('Unable to download report.', { type: 'error' });
    }
  };

  const generateAttemptReportCSV = async (attempt) => {
    const responses = await quizBuilderService.getAttemptResponses(attempt.id);

    let csv = 'Quiz Report\n';
    csv += `Participant,${attempt.participant_name || attempt.participant_email || 'Unknown'}\n`;
    csv += `Email,${attempt.participant_email || 'N/A'}\n`;
    csv += `Score,${formatScore(attempt.score_percent)}\n`;
    csv += `Correct Answers,${attempt.correct_answers || 0}\n`;
    csv += `Total Questions,${attempt.questions_answered || 0}\n`;
    csv += `Duration,${formatDuration(attempt.duration_seconds)}\n`;
    csv += `Submitted,${formatDateTime(attempt.submitted_at)}\n`;
    csv += `Passed,${attempt.passed ? 'Yes' : 'No'}\n\n`;

    if (responses && responses.length > 0) {
      csv += 'Question Details\n';
      csv += 'Question Number,Question Text,Selected Answer,Correct Answer,Is Correct,Points Earned\n';

      responses.forEach((response, index) => {
        csv += `${index + 1},"${response.question_text || 'N/A'}","${response.selected_answer || 'N/A'}","${response.correct_answer || 'N/A'}",${response.is_correct ? 'Yes' : 'No'},${response.points_earned || 0}\n`;
      });
    }

    return csv;
  };

  // Make functions available globally
  window.viewAttemptDetails = viewAttemptDetails;
  window.closeAttemptModal = closeAttemptModal;
  window.downloadAttemptReport = downloadAttemptReport;

  refreshBtn?.addEventListener('click', () => loadAnalytics());

  loadAnalytics();
});

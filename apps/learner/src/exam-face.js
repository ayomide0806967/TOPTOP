import { apiFetch } from '../../shared/apiClient.js';

// DOM refs
const els = {
  headerCard: document.getElementById('header-card'),
  loading: document.getElementById('loadingMessage'),
  content: document.getElementById('quizContent'),
  title: document.getElementById('quiz-title'),
  desc: document.getElementById('quiz-description'),
  questionCount: document.getElementById('quiz-question-count'),
  difficulty: document.getElementById('quiz-difficulty'),
  totalQuestions: document.getElementById('totalQuestions'),
  currentQuestionNum: document.getElementById('currentQuestionNum'),
  progressBar: document.getElementById('progressBar'),
  timer: document.getElementById('timer'),
  questionsContainer: document.getElementById('questionsContainer'),
  submitBtn: document.getElementById('submitBtn'),
  paletteTrigger: document.getElementById('paletteTrigger'),
  paletteOverlay: document.getElementById('paletteOverlay'),
  questionGrid: document.getElementById('questionGrid'),
  calculatorTrigger: document.getElementById('calculatorTrigger'),
  calculatorOverlay: document.getElementById('calculatorOverlay'),
  closeCalculatorBtn: document.getElementById('closeCalculatorBtn'),
};

// State
const state = {
  user: null,
  mode: 'daily',
  dailyQuiz: null,
  entries: [], // question entries
  answers: {}, // map of question entry id -> selected option index
  timerId: null,
  timerStartFrom: null,
  deadlineCheckInterval: null,
};

// LocalStorage keys
const STORAGE_KEYS = {
  EXAM_DEADLINE: 'exam_deadline_',
  PENDING_SUBMISSION: 'pending_submission_',
  OFFLINE_ANSWERS: 'offline_answers_',
};

function getExamDeadlineKey() {
  if (!state.dailyQuiz) return null;
  return STORAGE_KEYS.EXAM_DEADLINE + state.dailyQuiz.id;
}

function getPendingSubmissionKey() {
  if (!state.dailyQuiz) return null;
  return STORAGE_KEYS.PENDING_SUBMISSION + state.dailyQuiz.id;
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  const bgColor =
    type === 'success'
      ? 'bg-green-600'
      : type === 'error'
        ? 'bg-red-600'
        : 'bg-sky-600';
  toast.className = `fixed top-5 right-5 ${bgColor} text-white py-3 px-5 rounded-lg shadow-lg z-50`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function normalizeOptionKey(value) {
  if (value === undefined || value === null) return '';
  return value.toString().trim().toLowerCase();
}

function updateEntrySelection(entry, optionId) {
  if (!optionId) {
    entry.selected_option_id = null;
    entry.is_correct = null;
    return;
  }
  entry.selected_option_id = optionId;
  const selectedKey = normalizeOptionKey(optionId);
  let correctKey =
    entry.correct_option_key ||
    normalizeOptionKey(entry.correct_option_id) ||
    normalizeOptionKey(entry.raw_correct_option);

  if (!correctKey) {
    const options = entry.question?.question_options || [];
    const markedCorrect = options.find(
      (opt) =>
        opt &&
        (opt.is_correct ||
          normalizeOptionKey(opt.id) ===
            normalizeOptionKey(entry.correct_option_id))
    );
    if (markedCorrect) {
      entry.correct_option_id = markedCorrect.id ?? markedCorrect.label;
      correctKey = normalizeOptionKey(entry.correct_option_id);
    }
  }

  if (!correctKey) {
    const options = entry.question?.question_options || [];
    const primaryMatch = options.find(
      (opt) =>
        normalizeOptionKey(opt.label) ===
        normalizeOptionKey(entry.correct_option_id)
    );
    if (primaryMatch) {
      entry.correct_option_id = primaryMatch.id ?? primaryMatch.label;
      correctKey = normalizeOptionKey(entry.correct_option_id);
    }
  }

  entry.correct_option_key = correctKey;
  if (correctKey) {
    entry.is_correct = selectedKey === correctKey;
  } else {
    const options = entry.question?.question_options || [];
    const selectedOption = options.find(
      (opt) =>
        normalizeOptionKey(opt.id) === selectedKey ||
        normalizeOptionKey(opt.label) === selectedKey
    );
    entry.is_correct = !!selectedOption?.is_correct;
    if (!entry.correct_option_id && selectedOption?.is_correct) {
      entry.correct_option_id = selectedOption.id ?? selectedOption.label;
      entry.correct_option_key = normalizeOptionKey(entry.correct_option_id);
    }
  }
}

function isEntryCorrect(entry) {
  if (!entry || !entry.selected_option_id) return false;
  const selectedKey = normalizeOptionKey(entry.selected_option_id);
  const correctKey =
    entry.correct_option_key || normalizeOptionKey(entry.correct_option_id);
  if (correctKey) return selectedKey === correctKey;
  const options = entry.question?.question_options || [];
  const selectedOption = options.find(
    (opt) =>
      normalizeOptionKey(opt.id) === selectedKey ||
      normalizeOptionKey(opt.label) === selectedKey
  );
  return !!selectedOption?.is_correct;
}

function showConfirmModal(answered, skipped, total) {
  return new Promise((resolve) => {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'confirm-modal-overlay';

    // Create modal content
    const modal = document.createElement('div');
    modal.className = 'confirm-modal';

    // Header
    const header = document.createElement('div');
    header.className = 'confirm-modal-header';
    header.innerHTML = `
      <h3 style="font-size: 24px; font-weight: 700; margin: 0;">
        ${skipped > 0 ? '⚠️ Submit Quiz?' : '🎉 Submit Quiz?'}
      </h3>
      <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 14px;">
        ${skipped > 0 ? 'Review your progress before submitting' : 'Great job! You answered all questions'}
      </p>
    `;

    // Body with stats
    const body = document.createElement('div');
    body.className = 'confirm-modal-body';
    body.innerHTML = `
      <div class="confirm-stat">
        <div class="confirm-stat-icon" style="background: #dcfce7;">
          <span style="font-size: 24px;">✅</span>
        </div>
        <div style="flex: 1;">
          <div style="font-size: 13px; color: #64748b; font-weight: 500;">Answered</div>
          <div style="font-size: 20px; font-weight: 700; color: #0f766e;">${answered} question${answered !== 1 ? 's' : ''}</div>
        </div>
      </div>

      ${
        skipped > 0
          ? `
        <div class="confirm-stat">
          <div class="confirm-stat-icon" style="background: #fef3c7;">
            <span style="font-size: 24px;">⏭️</span>
          </div>
          <div style="flex: 1;">
            <div style="font-size: 13px; color: #64748b; font-weight: 500;">Skipped</div>
            <div style="font-size: 20px; font-weight: 700; color: #d97706;">${skipped} question${skipped !== 1 ? 's' : ''}</div>
          </div>
        </div>
      `
          : ''
      }

      <div class="confirm-stat">
        <div class="confirm-stat-icon" style="background: #e0f2fe;">
          <span style="font-size: 24px;">📝</span>
        </div>
        <div style="flex: 1;">
          <div style="font-size: 13px; color: #64748b; font-weight: 500;">Total Questions</div>
          <div style="font-size: 20px; font-weight: 700; color: #0369a1;">${total}</div>
        </div>
      </div>

      ${
        skipped > 0
          ? `
        <div style="margin-top: 16px; padding: 12px; background: #fef3c7; border-radius: 10px; border-left: 4px solid #f59e0b;">
          <p style="margin: 0; font-size: 14px; color: #92400e; font-weight: 500;">
            ⚠️ You have ${skipped} unanswered question${skipped !== 1 ? 's' : ''}. You can go back to review them.
          </p>
        </div>
      `
          : ''
      }
    `;

    // Footer with buttons
    const footer = document.createElement('div');
    footer.className = 'confirm-modal-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'confirm-btn confirm-btn-cancel';
    cancelBtn.textContent = 'Go Back';
    cancelBtn.onclick = () => {
      document.body.removeChild(overlay);
      resolve(false);
    };

    const submitBtn = document.createElement('button');
    submitBtn.className = 'confirm-btn confirm-btn-submit';
    submitBtn.textContent = skipped > 0 ? 'Submit Anyway' : 'Submit Quiz';
    submitBtn.onclick = () => {
      document.body.removeChild(overlay);
      resolve(true);
    };

    footer.appendChild(cancelBtn);
    footer.appendChild(submitBtn);

    // Assemble modal
    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);

    // Close on overlay click
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
        resolve(false);
      }
    };

    // Add to DOM
    document.body.appendChild(overlay);

    // Focus submit button
    submitBtn.focus();
  });
}

function formatTimeLabel(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  if (!s) return 'No limit';
  const m = Math.floor(s / 60);
  return `${m}m`;
}

function setTimerDisplay(text) {
  if (els.timer) els.timer.textContent = text;
}

function updateTimer() {
  if (!state.dailyQuiz) {
    setTimerDisplay('No limit');
    return;
  }

  const startedAt = state.dailyQuiz.started_at
    ? new Date(state.dailyQuiz.started_at)
    : null;

  const deadlineKey = getExamDeadlineKey();
  const deadlineStr = deadlineKey ? localStorage.getItem(deadlineKey) : null;
  const deadline = deadlineStr ? new Date(deadlineStr) : null;
  const hasDeadline = deadline && !Number.isNaN(deadline.getTime());

  const limit = Number(state.dailyQuiz?.time_limit_seconds || 0);
  if (
    !hasDeadline &&
    (!limit || !startedAt || Number.isNaN(startedAt.getTime()))
  ) {
    setTimerDisplay('No limit');
    return;
  }

  if (!startedAt || Number.isNaN(startedAt.getTime())) {
    if (!limit) {
      setTimerDisplay('No limit');
      return;
    }
    const hours = Math.floor(limit / 3600);
    const minutes = Math.floor((limit % 3600) / 60);
    const seconds = limit % 60;
    setTimerDisplay(
      `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    );
    return;
  }

  const remaining = hasDeadline
    ? Math.floor((deadline.getTime() - Date.now()) / 1000)
    : (() => {
        const elapsed = Math.max(
          0,
          Math.floor((Date.now() - startedAt.getTime()) / 1000)
        );
        return limit - elapsed;
      })();
  if (remaining <= 0) {
    setTimerDisplay("Time's up!");
    clearInterval(state.timerId);
    state.timerId = null;
    // Auto-submit with force flag
    submitQuiz(true).catch(() => {});
    return;
  }
  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;
  setTimerDisplay(
    `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  );
}

function startTimerTicking() {
  clearTimer();
  if (!state.dailyQuiz) {
    setTimerDisplay('No limit');
    return;
  }
  const deadlineKey = getExamDeadlineKey();
  const deadlineStr = deadlineKey ? localStorage.getItem(deadlineKey) : null;
  const deadline = deadlineStr ? new Date(deadlineStr) : null;
  const hasDeadline = deadline && !Number.isNaN(deadline.getTime());
  const limit = Number(state.dailyQuiz?.time_limit_seconds || 0);
  if (!hasDeadline && !limit) {
    setTimerDisplay('No limit');
    return;
  }
  updateTimer();
  state.timerId = setInterval(updateTimer, 1000);
}

function clearTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
  if (state.deadlineCheckInterval) {
    clearInterval(state.deadlineCheckInterval);
    state.deadlineCheckInterval = null;
  }
}

// Store exam deadline in localStorage
function storeExamDeadline() {
  if (!state.dailyQuiz || !state.dailyQuiz.started_at) return;

  const startedAt = new Date(state.dailyQuiz.started_at);
  if (Number.isNaN(startedAt.getTime())) return;

  const limit = Number(state.dailyQuiz.time_limit_seconds || 0);
  const limitDeadline =
    limit > 0 ? new Date(startedAt.getTime() + limit * 1000) : null;

  const endsAtStr = state.dailyQuiz.ends_at || null;
  const endsAt = endsAtStr ? new Date(endsAtStr) : null;
  const hasEndsAt = endsAt && !Number.isNaN(endsAt.getTime());

  const effectiveDeadline = hasEndsAt
    ? limitDeadline
      ? new Date(Math.min(limitDeadline.getTime(), endsAt.getTime()))
      : endsAt
    : limitDeadline;

  if (!effectiveDeadline) return;

  const key = getExamDeadlineKey();
  if (!key) return;
  localStorage.setItem(key, effectiveDeadline.toISOString());
}

// Check if exam deadline has passed
function checkExamDeadline() {
  if (!state.dailyQuiz) return false;

  const key = getExamDeadlineKey();
  if (!key) return false;
  const deadlineStr = localStorage.getItem(key);

  if (!deadlineStr) return false;

  const deadline = new Date(deadlineStr);
  const now = new Date();

  return now >= deadline;
}

// Clear exam deadline from localStorage
function clearExamDeadline() {
  const key = getExamDeadlineKey();
  if (!key) return;
  localStorage.removeItem(key);
}

// Cleanup old exam deadlines (older than 7 days)
function cleanupOldDeadlines() {
  try {
    const keys = Object.keys(localStorage);
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    keys.forEach((key) => {
      if (key.startsWith(STORAGE_KEYS.EXAM_DEADLINE)) {
        const deadlineStr = localStorage.getItem(key);
        if (deadlineStr) {
          const deadline = new Date(deadlineStr);
          // Remove if deadline was more than 7 days ago
          if (
            !isNaN(deadline.getTime()) &&
            now - deadline.getTime() > sevenDaysMs
          ) {
            localStorage.removeItem(key);
          }
        }
      }
      // Also cleanup old pending submissions
      if (key.startsWith(STORAGE_KEYS.PENDING_SUBMISSION)) {
        const dataStr = localStorage.getItem(key);
        if (dataStr) {
          try {
            const data = JSON.parse(dataStr);
            const timestamp = new Date(data.timestamp);
            if (
              !isNaN(timestamp.getTime()) &&
              now - timestamp.getTime() > sevenDaysMs
            ) {
              localStorage.removeItem(key);
            }
          } catch {
            // Invalid JSON, remove it
            localStorage.removeItem(key);
          }
        }
      }
    });
  } catch (err) {
    console.error('[Exam Face] Cleanup failed:', err);
  }
}

// Store pending submission for offline scenarios
function storePendingSubmission(submissionData) {
  if (!submissionData) return;
  const key = getPendingSubmissionKey();
  if (!key) return;
  localStorage.setItem(key, JSON.stringify(submissionData));
}

// Get pending submission
function getPendingSubmission() {
  const key = getPendingSubmissionKey();
  if (!key) return null;
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : null;
}

// Clear pending submission
function clearPendingSubmission() {
  const key = getPendingSubmissionKey();
  if (!key) return;
  localStorage.removeItem(key);
}

// Store an answer that couldn't be saved online
function storeOfflineAnswer(entryId, optionId) {
  if (!state.dailyQuiz) return;
  const key = STORAGE_KEYS.OFFLINE_ANSWERS + state.dailyQuiz.id;
  const offlineAnswers = JSON.parse(localStorage.getItem(key) || '{}');
  offlineAnswers[entryId] = { optionId, timestamp: new Date().toISOString() };
  localStorage.setItem(key, JSON.stringify(offlineAnswers));
}

// Process stored offline answers when online
async function processOfflineAnswers() {
  if (!state.dailyQuiz) return;
  const key = STORAGE_KEYS.OFFLINE_ANSWERS + state.dailyQuiz.id;
  const offlineAnswers = JSON.parse(localStorage.getItem(key) || '{}');

  const entryIds = Object.keys(offlineAnswers);
  if (entryIds.length === 0) return;

  showToast(`Syncing ${entryIds.length} offline answer(s)...`, 'info');

  for (const entryId of entryIds) {
    const { optionId } = offlineAnswers[entryId];
    try {
      // Use a separate, targeted recordAnswer call for offline processing
      await recordAnswer(entryId, optionId, true); // Pass a flag to avoid re-queueing

      // If successful, remove from local storage
      delete offlineAnswers[entryId];
      localStorage.setItem(key, JSON.stringify(offlineAnswers));
    } catch (err) {
      console.error('[Exam Face] Failed to sync offline answer:', err);
      showToast('Failed to sync an answer. Will retry.', 'error');
      // Stop processing on first error to maintain order and prevent spamming
      return;
    }
  }

  // If all synced, the object will be empty
  if (Object.keys(offlineAnswers).length === 0) {
    localStorage.removeItem(key);
    showToast('Offline answers synced successfully!', 'success');
  }
}

// Process pending submission when online
async function processPendingSubmission() {
  const pending = getPendingSubmission();
  if (!pending) return;

  try {
    await apiFetch(
      `/api/quiz/daily/${encodeURIComponent(pending.quizId)}/submit`,
      {
        method: 'POST',
        body: {
          correctAnswers: pending.payload?.correct_answers || 0,
          totalQuestions: pending.payload?.total_questions || 0,
          completedAt:
            pending.payload?.completed_at || new Date().toISOString(),
        },
      }
    );

    // Clear pending submission on success
    clearPendingSubmission();
    clearExamDeadline();

    // Redirect to results
    const url = new URL(window.location.href);
    url.pathname = url.pathname.replace(/[^/]+$/, 'result-face.html');
    url.searchParams.set('daily_quiz_id', pending.quizId);
    window.location.replace(url.toString());
  } catch (err) {
    console.error('[Exam Face] Failed to process pending submission', err);
    // Keep pending submission for next retry
  }
}

function updateProgress() {
  const total = state.entries.length;
  const answeredCount = state.entries.filter(
    (e) => e.selected_option_id
  ).length;
  const percent = total ? (answeredCount / total) * 100 : 0;
  if (els.progressBar) els.progressBar.style.width = `${percent}%`;
}

function renderPalette() {
  if (!els.questionGrid) return;
  els.questionGrid.innerHTML = '';
  state.entries.forEach((entry, index) => {
    const btn = document.createElement('button');
    btn.className = 'gf-palette-question';
    btn.textContent = String(index + 1);
    if (entry.selected_option_id) btn.classList.add('answered');
    else btn.classList.add('unanswered');
    btn.onclick = () => {
      const questionEl = document.getElementById(`question-${entry.id}`);
      if (questionEl) {
        questionEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      if (els.paletteOverlay) els.paletteOverlay.style.display = 'none';
    };
    els.questionGrid.appendChild(btn);
  });
}

function optionHtml(entry) {
  const options = (entry.question?.question_options || [])
    .slice()
    .sort(
      (a, b) =>
        (a.order_index ?? a.label?.charCodeAt(0) ?? 0) -
        (b.order_index ?? b.label?.charCodeAt(0) ?? 0)
    );
  const selectedOptionId = entry.selected_option_id || null;
  return options
    .map((opt) => {
      const id = `q${entry.id}_opt${opt.id}`;
      const checked = selectedOptionId === opt.id ? 'checked' : '';
      return `<label for="${id}"><input type="radio" id="${id}" name="question${entry.id}" value="${opt.id}" ${checked} data-entry-id="${entry.id}" data-option-id="${opt.id}" class="answer-input"><span>${opt.label ? `${opt.label}. ` : ''}${opt.content}</span></label>`;
    })
    .join('');
}

function renderAllQuestions() {
  if (!els.questionsContainer) return;
  els.questionsContainer.innerHTML = '';

  state.entries.forEach((entry, index) => {
    const q = entry.question;
    const el = document.createElement('div');
    el.className = 'question-item';
    el.id = `question-${entry.id}`;
    el.innerHTML = `
      <div class="mb-2">
        <span class="inline-block bg-gray-100 text-gray-700 text-xs font-semibold px-2 py-1 rounded">Question ${index + 1} of ${state.entries.length}</span>
      </div>
      <h3>${q?.stem ?? 'Question unavailable'}</h3>
      ${q?.image_url ? `<img src="${q.image_url}" alt="Question illustration" class="my-4 max-h-64 w-full rounded-lg border border-gray-200 object-contain" />` : ''}
      <div class="space-y-1">${optionHtml(entry)}</div>
    `;
    els.questionsContainer.appendChild(el);
  });

  // Add submit button after last question
  const submitContainer = document.createElement('div');
  submitContainer.className = 'mt-12 pt-8 border-t-2 border-gray-200';
  submitContainer.innerHTML = `
    <div class="text-center mb-4">
      <p class="text-gray-600 mb-2">You've reached the end of the quiz</p>
      <p class="text-sm text-gray-500">Review your answers or submit when ready</p>
    </div>
    <button id="submitBtn" class="gf-btn primary w-full max-w-md mx-auto block py-4 text-lg">
      Submit Quiz
    </button>
  `;
  els.questionsContainer.appendChild(submitContainer);

  // bind listeners for all questions
  els.questionsContainer.querySelectorAll('.answer-input').forEach((input) => {
    input.addEventListener('change', async (e) => {
      const entryId = e.target.dataset.entryId;
      const optionId = e.target.dataset.optionId;
      await recordAnswer(entryId, optionId);
    });
  });

  // Bind submit button
  const submitBtn = document.getElementById('submitBtn');
  if (submitBtn) {
    submitBtn.onclick = () => submitQuiz();
  }
}

async function ensureStarted() {
  if (!state.dailyQuiz) return;

  if (state.dailyQuiz.status !== 'assigned') return;
  const { quiz } = await apiFetch(
    `/api/quiz/daily/${encodeURIComponent(state.dailyQuiz.id)}/start`,
    { method: 'POST' }
  );
  state.dailyQuiz = quiz || {
    ...state.dailyQuiz,
    status: 'in_progress',
    started_at: new Date().toISOString(),
  };

  storeExamDeadline();
  startTimerTicking();
}

async function recordAnswer(entryId, optionId, isSyncing = false) {
  const entry = state.entries.find((e) => e.id === entryId);
  if (!entry) return;

  try {
    await ensureStarted();
    const option = entry.question?.question_options?.find(
      (opt) => opt.id === optionId
    );
    if (!option) return;

    const answeredAt = new Date().toISOString();

    updateEntrySelection(entry, option.id);
    entry.answered_at = answeredAt;
    updateProgress();
    renderPalette();

    await apiFetch(
      `/api/quiz/daily/questions/${encodeURIComponent(entry.id)}`,
      {
        method: 'PATCH',
        body: { optionId: option.id },
      }
    );
  } catch (err) {
    console.error('[Exam Face] recordAnswer failed', err);
    showToast(err.message || 'Unable to save your answer.', 'error');

    if (!isSyncing) {
      storeOfflineAnswer(entryId, optionId);
      showToast('Answer saved locally. Will sync when online.', 'info');
    }
  }
}

async function submitQuiz(forceSubmit = false) {
  if (!state.dailyQuiz) return;

  // Calculate answered and skipped questions
  const total = state.entries.length;
  const answered = state.entries.filter((e) => e.selected_option_id).length;
  const skipped = total - answered;

  // Show modern confirmation dialog (skip if forced by timer)
  if (!forceSubmit) {
    const confirmed = await showConfirmModal(answered, skipped, total);
    if (!confirmed) {
      return;
    }
  }
  let correct = 0;

  try {
    clearTimer();
    showToast('Submitting quiz...', 'info');

    correct = state.entries.filter(isEntryCorrect).length;
    const payload = {
      status: 'completed',
      correct_answers: correct,
      total_questions: total,
      completed_at: new Date().toISOString(),
    };

    if (!navigator.onLine) {
      storePendingSubmission({
        quizId: state.dailyQuiz.id,
        payload: payload,
        timestamp: new Date().toISOString(),
      });
      showToast(
        'You are offline. Quiz will be submitted when you reconnect.',
        'info'
      );
      setTimeout(() => {
        showToast(
          'Please stay on this page until you reconnect to the internet.',
          'info'
        );
      }, 4500);
      return;
    }

    await apiFetch(
      `/api/quiz/daily/${encodeURIComponent(state.dailyQuiz.id)}/submit`,
      {
        method: 'POST',
        body: {
          correctAnswers: payload.correct_answers,
          totalQuestions: payload.total_questions,
          completedAt: payload.completed_at,
        },
      }
    );

    clearExamDeadline();
    clearPendingSubmission();

    const url = new URL(window.location.href);
    url.pathname = url.pathname.replace(/[^/]+$/, 'result-face.html');
    url.searchParams.set('daily_quiz_id', state.dailyQuiz.id);
    window.location.replace(url.toString());
  } catch (err) {
    console.error('[Exam Face] submitQuiz failed', err);
    storePendingSubmission({
      quizId: state.dailyQuiz.id,
      payload: {
        status: 'completed',
        correct_answers: correct,
        total_questions: total,
        completed_at: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    });
    showToast(
      err.message || 'Unable to submit quiz. Will retry automatically.',
      'error'
    );
  }
}

function bindNav() {
  // Submit button is bound in renderAllQuestions
  // Also bind palette submit button
  const paletteSubmitBtn = document.getElementById('paletteSubmitBtn');
  if (paletteSubmitBtn) {
    paletteSubmitBtn.onclick = () => {
      if (els.paletteOverlay) els.paletteOverlay.style.display = 'none';
      submitQuiz();
    };
  }
}

function initOverlays() {
  if (els.paletteTrigger && els.paletteOverlay) {
    els.paletteTrigger.onclick = () => {
      renderPalette();
      els.paletteOverlay.style.display = 'flex';
    };
    const closeBtn = document.getElementById('closePaletteBtn');
    if (closeBtn)
      closeBtn.onclick = () => {
        els.paletteOverlay.style.display = 'none';
      };
    els.paletteOverlay.onclick = (e) => {
      if (e.target === els.paletteOverlay)
        els.paletteOverlay.style.display = 'none';
    };
  }
  if (els.calculatorTrigger && els.calculatorOverlay) {
    els.calculatorTrigger.onclick = () => {
      els.calculatorOverlay.style.display = 'flex';
    };
    if (els.closeCalculatorBtn)
      els.closeCalculatorBtn.onclick = () => {
        els.calculatorOverlay.style.display = 'none';
      };
    els.calculatorOverlay.onclick = (e) => {
      if (e.target === els.calculatorOverlay)
        els.calculatorOverlay.style.display = 'none';
    };

    // Initialize calculator functionality
    initCalculator();
  }

  // Initialize network status monitoring
  initNetworkStatus();
}

function initNetworkStatus() {
  const buttons = [els.paletteTrigger, els.calculatorTrigger].filter(Boolean);

  function updateNetworkStatus() {
    const isOffline = !navigator.onLine;
    buttons.forEach((btn) => {
      if (isOffline) {
        btn.classList.add('offline');
      } else {
        btn.classList.remove('offline');
      }
    });
  }

  // Handle reconnection - process pending submissions
  window.addEventListener('online', () => {
    updateNetworkStatus();
    processOfflineAnswers(); // Try to sync answers first
    processPendingSubmission();
  });

  window.addEventListener('offline', updateNetworkStatus);
  updateNetworkStatus();
}

function initCalculator() {
  const calcDisplay = document.getElementById('calcDisplay');
  if (!calcDisplay) return;

  document.querySelectorAll('.calc-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const value = btn.textContent.trim();

      if (value === 'AC') {
        calcDisplay.textContent = '0';
      } else if (value === 'C') {
        calcDisplay.textContent = calcDisplay.textContent.slice(0, -1) || '0';
      } else if (value === '=') {
        try {
          // Replace × with * for eval
          const expression = calcDisplay.textContent
            .replace(/×/g, '*')
            .replace(/÷/g, '/');
          calcDisplay.textContent = eval(expression).toString();
        } catch {
          calcDisplay.textContent = 'Error';
          setTimeout(() => {
            calcDisplay.textContent = '0';
          }, 1500);
        }
      } else {
        if (calcDisplay.textContent === '0' && !'./*+-×÷%'.includes(value)) {
          calcDisplay.textContent = value;
        } else if (calcDisplay.textContent === 'Error') {
          calcDisplay.textContent = value;
        } else {
          calcDisplay.textContent += value;
        }
      }
    });
  });
}

async function loadQuizData() {
  const url = new URL(window.location.href);
  state.mode = 'daily';

  const quizId = url.searchParams.get('daily_quiz_id');

  if (!quizId) {
    if (!state.user?.id) {
      throw new Error('Please sign in to access your daily quiz.');
    }
    const { quiz: todayQuiz } = await apiFetch('/api/quiz/daily/today');

    if (!todayQuiz) {
      console.warn(
        '[Exam Face] No quiz found for user today; redirecting to dashboard',
        {
          userId: state.user?.id || null,
          requestedUrl: window.location.href,
        }
      );
      window.location.replace('admin-board.html');
      return;
    }

    url.searchParams.set('daily_quiz_id', todayQuiz.id);
    window.location.replace(url.toString());
    return;
  }

  const { quiz } = await apiFetch(
    `/api/quiz/daily/${encodeURIComponent(quizId)}`
  );
  if (!quiz) {
    throw new Error('Quiz not found');
  }

  if (quiz.user_id !== state.user?.id) {
    throw new Error('Unauthorized access to quiz');
  }

  if (quiz.status === 'completed') {
    const resultsUrl = new URL(window.location.href);
    resultsUrl.pathname = resultsUrl.pathname.replace(
      /[^/]+$/,
      'result-face.html'
    );
    resultsUrl.searchParams.set('daily_quiz_id', quiz.id);
    window.location.replace(resultsUrl.toString());
    return;
  }

  state.dailyQuiz = quiz;
}

async function loadQuestions() {
  const { questions } = await apiFetch(
    `/api/quiz/daily/${encodeURIComponent(state.dailyQuiz.id)}/questions`
  );
  state.entries = questions || [];

  // Prefill answers map for progress
  state.answers = {};
  state.entries.forEach((row, idx) => {
    if (row.selected_option_id) {
      const options = (row.question?.question_options || [])
        .slice()
        .sort(
          (a, b) =>
            (a.order_index ?? a.label?.charCodeAt(0) ?? 0) -
            (b.order_index ?? b.label?.charCodeAt(0) ?? 0)
        );
      const foundIdx = options.findIndex(
        (o) => o.id === row.selected_option_id
      );
      if (foundIdx >= 0) state.answers[idx] = foundIdx;
    }
  });
}

function setHeader() {
  if (!state.dailyQuiz) return;
  const assignedDate = state.dailyQuiz.assigned_date
    ? new Date(state.dailyQuiz.assigned_date)
    : new Date();
  const dateStr = assignedDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  if (els.title) els.title.textContent = 'Daily Practice Questions';
  if (els.desc)
    els.desc.textContent = `Assigned for ${dateStr} • Tailored to your department`;
  if (els.questionCount)
    els.questionCount.textContent = `Questions: ${state.entries.length}`;
  if (els.timeLimitLabel)
    els.timeLimitLabel.textContent = `Time Limit: ${formatTimeLabel(state.dailyQuiz.time_limit_seconds)}`;
  if (els.difficulty) els.difficulty.style.display = 'none';
  if (els.totalQuestions)
    els.totalQuestions.textContent = String(state.entries.length);
}

async function initialise() {
  try {
    // Cleanup old localStorage entries
    cleanupOldDeadlines();
    const url = new URL(window.location.href);
    if (
      url.searchParams.get('free_quiz') ||
      url.searchParams.get('exam_hall_attempt') ||
      url.searchParams.get('extra_question_set_id')
    ) {
      window.location.replace('admin-board.html');
      return;
    }

    const sessionData = await apiFetch('/api/me').catch((error) => {
      if (error?.status === 401) return null;
      throw error;
    });
    state.user = sessionData?.user ?? null;
    if (!state.user) {
      window.location.replace('login.html');
      return;
    }

    els.loading.style.display = 'block';
    els.content.classList.add('hidden');

    await loadQuizData();
    if (!state.dailyQuiz) {
      // Quiz loading was handled (redirect occurred)
      return;
    }
    await loadQuestions();

    if (state.dailyQuiz.status === 'assigned') {
      try {
        await ensureStarted();
      } catch (startError) {
        console.error(
          '[Exam Face] Unable to mark quiz as started immediately',
          startError
        );
      }
    }

    // Process any offline data if connection is available
    if (navigator.onLine) {
      await processOfflineAnswers();
      await processPendingSubmission();
    }

    // Check if there's a pending submission to process
    if (navigator.onLine) {
      await processPendingSubmission();
    }

    // Check if exam deadline has passed
    if (state.dailyQuiz.status === 'in_progress') {
      // Store deadline if not already stored
      if (state.dailyQuiz.started_at) {
        storeExamDeadline();
      }

      // Check if deadline has already passed
      if (checkExamDeadline()) {
        showToast("Time's up! Submitting your exam...", 'info');
        await submitQuiz(true);
        return;
      }

      // Set up periodic deadline check (every 5 seconds)
      state.deadlineCheckInterval = setInterval(() => {
        if (checkExamDeadline()) {
          clearInterval(state.deadlineCheckInterval);
          state.deadlineCheckInterval = null;
          submitQuiz(true).catch(() => {});
        }
      }, 5000);
    }

    setHeader();

    els.loading.style.display = 'none';
    els.content.classList.remove('hidden');

    renderAllQuestions();
    updateProgress();
    bindNav();
    initOverlays();
    renderPalette();
    startTimerTicking();
  } catch (err) {
    console.error('[Exam Face] initialisation failed', err);
    const errorMsg = err.message || 'An error occurred while loading the quiz.';
    els.loading.innerHTML = `
      <div class="text-red-800">
        <h3 class="font-bold mb-1.5">Unable to Load Quiz</h3>
        <p class="mb-2">${errorMsg}</p>
        <div class="flex gap-3 justify-center">
          <button onclick="location.reload()" class="gf-btn" style="background:#ef4444; color:#fff;">Try Again</button>
          <button onclick="location.href='admin-board.html'" class="gf-btn" style="background:#6b7280; color:#fff;">Back to Dashboard</button>
        </div>
      </div>`;
  }
}

document.addEventListener('DOMContentLoaded', initialise);

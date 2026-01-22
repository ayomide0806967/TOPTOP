import { getSupabaseClient } from '../../shared/supabaseClient.js';

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
  supabase: null,
  user: null,
  mode: 'daily',
  dailyQuiz: null, // active quiz metadata (daily or free)
  freeQuizAttempt: null,
  examHallAttempt: null,
  examHallSession: null,
  extraSet: null,
  extraAttempt: null,
  extraPlanId: null,
  entries: [], // question entries
  answers: {}, // map of question entry id -> selected option index
  timerId: null,
  timerStartFrom: null,
  deadlineCheckInterval: null,
};

const DEFAULT_ASSIGNMENT_RULES = Object.freeze({
  default: { mode: 'full_set', value: null },
  overrides: [],
});

const ASSIGNMENT_MODES = new Set([
  'full_set',
  'fixed_count',
  'percentage',
  // New consolidated tier distribution modes
  'tier_auto',
  'equal_split',
]);

function normalizeAssignmentValue(mode, value) {
  if (mode === 'full_set') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  if (mode === 'fixed_count') {
    return Math.max(1, Math.round(numeric));
  }
  if (mode === 'percentage') {
    return Math.min(100, Math.max(1, Math.round(numeric)));
  }
  // tier_auto and equal_split do not use numeric values
  return null;
}

function normalizeAssignmentRules(value) {
  const source = value && typeof value === 'object' ? value : {};
  const defaultSource =
    source.default && typeof source.default === 'object' ? source.default : {};
  const mode = ASSIGNMENT_MODES.has(defaultSource.mode)
    ? defaultSource.mode
    : 'full_set';
  const normalizedDefaultValue = normalizeAssignmentValue(
    mode,
    defaultSource.value
  );

  const overridesSource = Array.isArray(source.overrides)
    ? source.overrides
    : [];
  const overrides = overridesSource
    .map((override) => {
      if (!override || typeof override !== 'object') return null;
      const planId = override.planId || override.plan_id;
      if (!planId) return null;
      const overrideMode = ASSIGNMENT_MODES.has(override.mode)
        ? override.mode
        : 'full_set';
      const overrideValue = normalizeAssignmentValue(
        overrideMode,
        override.value
      );
      if (overrideMode !== 'full_set' && overrideValue === null) {
        return null;
      }
      return {
        planId: String(planId),
        mode: overrideMode,
        value: overrideMode === 'full_set' ? null : overrideValue,
      };
    })
    .filter(Boolean);

  return {
    default: {
      mode,
      value: mode === 'full_set' ? null : normalizedDefaultValue,
    },
    overrides,
  };
}

function getEffectiveAssignmentRule(rules, planId) {
  const normalized = rules || DEFAULT_ASSIGNMENT_RULES;
  if (planId) {
    const override = normalized.overrides?.find(
      (entry) => entry.planId === planId
    );
    if (override) return override;
  }
  return normalized.default || DEFAULT_ASSIGNMENT_RULES.default;
}

function selectEntriesByRule(entries, rule, context = {}) {
  if (!Array.isArray(entries) || !entries.length) return [];
  const mode = rule?.mode || 'full_set';
  if (mode === 'fixed_count') {
    const limit = Math.max(1, Math.round(rule?.value || 0));
    return entries.slice(0, Math.min(entries.length, limit));
  }
  if (mode === 'percentage') {
    const percentage = Math.min(100, Math.max(1, Math.round(rule?.value || 0)));
    const limit = Math.max(1, Math.round((entries.length * percentage) / 100));
    return entries.slice(0, Math.min(entries.length, limit));
  }
  if (mode === 'tier_auto') {
    const T = entries.length;
    const tier = (context.planTier || '').toString();
    if (!T || !tier) return entries.slice();
    let limit = T;
    if (tier === '250') {
      // 100% capped at 250
      limit = Math.min(T, 250);
    } else if (tier === '200') {
      // 200 if T >= 200, else round(0.75 * T)
      limit = T >= 200 ? 200 : Math.max(1, Math.round(T * 0.75));
      limit = Math.min(limit, T);
    } else if (tier === '100') {
      // min(100, round(0.5 * T))
      limit = Math.min(100, Math.max(1, Math.round(T * 0.5)));
      limit = Math.min(limit, T);
    } else {
      // Unknown tier → fallback to full set
      limit = T;
    }
    return entries.slice(0, limit);
  }
  if (mode === 'equal_split') {
    const T = entries.length;
    if (!T) return [];
    // Use selected plan tiers from visibility rules; fall back to [100,200,250]
    const selectedTiers =
      Array.isArray(context.selectedTiers) && context.selectedTiers.length
        ? context.selectedTiers.map(String)
        : ['100', '200', '250'];
    const m = Math.max(1, selectedTiers.length);
    const base = Math.floor(T / m);
    let remainder = T - base * m;
    // Distribute remainder (+1) to the first `remainder` tiers deterministically by sorted tier
    const ordered = selectedTiers.slice().sort((a, b) => Number(a) - Number(b));
    const allocMap = new Map(ordered.map((t) => [t, base]));
    for (let i = 0; i < remainder; i++) {
      const t = ordered[i % ordered.length];
      allocMap.set(t, (allocMap.get(t) || 0) + 1);
    }
    const tier = (context.planTier || '').toString();
    const limit = Math.max(1, Math.min(T, allocMap.get(tier) || base));
    return entries.slice(0, limit);
  }
  return entries.slice();
}

function applyAssignmentRules(entries, rules, planId, context = {}) {
  const normalized = normalizeAssignmentRules(rules);
  const effectiveRule = getEffectiveAssignmentRule(normalized, planId);
  const selected = selectEntriesByRule(entries, effectiveRule, context);
  return { selected, effectiveRule, normalizedRules: normalized };
}

// LocalStorage keys
const STORAGE_KEYS = {
  EXAM_DEADLINE: 'exam_deadline_',
  PENDING_SUBMISSION: 'pending_submission_',
  OFFLINE_ANSWERS: 'offline_answers_',
  FREE_PROGRESS: 'free_quiz_progress_',
  EXAM_HALL_PROGRESS: 'exam_hall_progress_',
  EXTRA_PROGRESS: 'extra_quiz_progress_',
};

function getExamHallAttemptId() {
  return (
    state.examHallAttempt?.id || state.examHallSession?.attempt?.id || null
  );
}

function getExamDeadlineKey() {
  if (state.mode === 'exam_hall') {
    const attemptId = getExamHallAttemptId();
    return attemptId
      ? `${STORAGE_KEYS.EXAM_DEADLINE}exam_hall_${attemptId}`
      : null;
  }
  if (!state.dailyQuiz) return null;
  return STORAGE_KEYS.EXAM_DEADLINE + state.dailyQuiz.id;
}

function getPendingSubmissionKey() {
  if (state.mode === 'exam_hall') {
    const attemptId = getExamHallAttemptId();
    return attemptId
      ? `${STORAGE_KEYS.PENDING_SUBMISSION}exam_hall_${attemptId}`
      : null;
  }
  if (!state.dailyQuiz) return null;
  return STORAGE_KEYS.PENDING_SUBMISSION + state.dailyQuiz.id;
}

function readExtraSetLaunchDebug() {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem('extra_set_launch_debug');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.debug(
      '[Exam Face] Unable to read extra set launch debug info',
      error
    );
    return null;
  }
}

function mergeExtraSetLaunchDebug(patch) {
  if (typeof sessionStorage === 'undefined') return null;
  if (!patch || typeof patch !== 'object') return readExtraSetLaunchDebug();
  try {
    const existing = readExtraSetLaunchDebug() || {};
    const updated = { ...existing, ...patch };
    sessionStorage.setItem('extra_set_launch_debug', JSON.stringify(updated));
    return updated;
  } catch (error) {
    console.debug(
      '[Exam Face] Unable to persist extra set launch debug info',
      error
    );
    return null;
  }
}

async function initialiseExtraPracticeAttempt(setId, questionCount) {
  if (!state.supabase || !setId) {
    state.extraAttempt = null;
    return null;
  }
  try {
    const { data, error } = await state.supabase.rpc(
      'start_extra_question_attempt',
      { p_set_id: setId }
    );
    if (error) throw error;
    const attempt = data || null;
    if (attempt) {
      state.extraAttempt = {
        ...attempt,
        total_questions:
          attempt.total_questions !== null
            ? Number(attempt.total_questions)
            : (questionCount ?? null),
      };
      if (state.dailyQuiz) {
        state.dailyQuiz.attempt_id = attempt.id;
        state.dailyQuiz.attempt_number = attempt.attempt_number;
        if (!state.dailyQuiz.started_at && attempt.started_at) {
          state.dailyQuiz.started_at = attempt.started_at;
        }
      }
    } else {
      state.extraAttempt = null;
    }
    return attempt;
  } catch (error) {
    console.error(
      '[Exam Face] Failed to initialise extra question attempt',
      error
    );
    state.extraAttempt = null;
    throw error;
  }
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

function computeTimeUsed(startedAt, completedAt) {
  const start = startedAt ? new Date(startedAt) : null;
  const end = completedAt ? new Date(completedAt) : null;
  if (
    !start ||
    !end ||
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime())
  ) {
    return null;
  }
  const diff = Math.floor((end.getTime() - start.getTime()) / 1000);
  return Number.isFinite(diff) ? Math.max(diff, 0) : null;
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

function formatDateTimeLabel(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
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
      if (key.startsWith(STORAGE_KEYS.FREE_PROGRESS)) {
        const dataStr = localStorage.getItem(key);
        if (dataStr) {
          try {
            const data = JSON.parse(dataStr);
            const timestamp = new Date(
              data.lastUpdatedAt || data.startedAt || data.started_at || 0
            );
            if (
              !isNaN(timestamp.getTime()) &&
              now - timestamp.getTime() > sevenDaysMs
            ) {
              localStorage.removeItem(key);
            }
          } catch {
            localStorage.removeItem(key);
          }
        }
      }
      if (key.startsWith(STORAGE_KEYS.EXAM_HALL_PROGRESS)) {
        const dataStr = localStorage.getItem(key);
        if (dataStr) {
          try {
            const data = JSON.parse(dataStr);
            const timestamp = new Date(
              data.lastUpdatedAt || data.startedAt || data.started_at || 0
            );
            if (
              !isNaN(timestamp.getTime()) &&
              now - timestamp.getTime() > sevenDaysMs
            ) {
              localStorage.removeItem(key);
            }
          } catch {
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
  if (state.mode === 'free' || state.mode === 'extra') return;
  const key = getPendingSubmissionKey();
  if (!key) return;
  localStorage.setItem(key, JSON.stringify(submissionData));
}

// Get pending submission
function getPendingSubmission() {
  if (state.mode === 'free' || state.mode === 'extra') return null;
  const key = getPendingSubmissionKey();
  if (!key) return null;
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : null;
}

// Clear pending submission
function clearPendingSubmission() {
  if (state.mode === 'free' || state.mode === 'extra') return;
  const key = getPendingSubmissionKey();
  if (!key) return;
  localStorage.removeItem(key);
}

function getFreeProgressKey() {
  if (!state.dailyQuiz) return null;
  return STORAGE_KEYS.FREE_PROGRESS + state.dailyQuiz.id;
}

function loadFreeQuizProgress() {
  if (state.mode !== 'free') return null;
  const key = getFreeProgressKey();
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('[Exam Face] Unable to read stored free quiz progress', err);
    return null;
  }
}

function saveFreeQuizProgress(update = {}) {
  if (state.mode !== 'free') return;
  const key = getFreeProgressKey();
  if (!key) return;
  const existing = loadFreeQuizProgress() || {};
  const merged = {
    ...existing,
    ...update,
  };
  if (update.answers) {
    merged.answers = { ...(existing.answers || {}), ...update.answers };
  }
  if (update.startedAt) merged.startedAt = update.startedAt;
  if (update.attemptId) merged.attemptId = update.attemptId;
  merged.lastUpdatedAt = new Date().toISOString();
  try {
    localStorage.setItem(key, JSON.stringify(merged));
  } catch (err) {
    console.warn('[Exam Face] Unable to persist free quiz progress', err);
  }
}

function clearFreeQuizProgress() {
  if (state.mode !== 'free') return;
  const key = getFreeProgressKey();
  if (key) {
    localStorage.removeItem(key);
  }
}

function getExamHallProgressKey() {
  const attemptId = getExamHallAttemptId();
  if (!attemptId) return null;
  return STORAGE_KEYS.EXAM_HALL_PROGRESS + attemptId;
}

function loadExamHallProgress() {
  if (state.mode !== 'exam_hall') return null;
  const key = getExamHallProgressKey();
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('[Exam Face] Unable to read stored exam hall progress', err);
    return null;
  }
}

function saveExamHallProgress(update = {}) {
  if (state.mode !== 'exam_hall') return;
  const key = getExamHallProgressKey();
  if (!key) return;
  const existing = loadExamHallProgress() || {};
  const merged = { ...existing, ...update };
  if (update.answers) {
    merged.answers = { ...(existing.answers || {}), ...update.answers };
  }
  if (update.startedAt) merged.startedAt = update.startedAt;
  if (update.attemptId) merged.attemptId = update.attemptId;
  merged.lastUpdatedAt = new Date().toISOString();
  try {
    localStorage.setItem(key, JSON.stringify(merged));
  } catch (err) {
    console.warn('[Exam Face] Unable to persist exam hall progress', err);
  }
}

function clearExamHallProgress() {
  if (state.mode !== 'exam_hall') return;
  const key = getExamHallProgressKey();
  if (key) {
    localStorage.removeItem(key);
  }
}

function getExtraProgressKey() {
  if (!state.dailyQuiz) return null;
  return STORAGE_KEYS.EXTRA_PROGRESS + state.dailyQuiz.id;
}

function loadExtraQuizProgress() {
  if (state.mode !== 'extra') return null;
  const key = getExtraProgressKey();
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('[Exam Face] Unable to read stored extra quiz progress', err);
    return null;
  }
}

function saveExtraQuizProgress(update = {}) {
  if (state.mode !== 'extra') return;
  const key = getExtraProgressKey();
  if (!key) return;
  const existing = loadExtraQuizProgress() || {};
  const merged = { ...existing, ...update };
  if (update.answers) {
    merged.answers = { ...(existing.answers || {}), ...update.answers };
  }
  if (update.startedAt) merged.startedAt = update.startedAt;
  if (update.attemptId) merged.attemptId = update.attemptId;
  merged.lastUpdatedAt = new Date().toISOString();
  try {
    localStorage.setItem(key, JSON.stringify(merged));
  } catch (err) {
    console.warn('[Exam Face] Unable to persist extra quiz progress', err);
  }
}

function clearExtraQuizProgress() {
  if (state.mode !== 'extra') return;
  const key = getExtraProgressKey();
  if (key) {
    localStorage.removeItem(key);
  }
}

// Store an answer that couldn't be saved online
function storeOfflineAnswer(entryId, optionId) {
  if (!state.dailyQuiz || ['free', 'extra', 'exam_hall'].includes(state.mode))
    return;
  const key = STORAGE_KEYS.OFFLINE_ANSWERS + state.dailyQuiz.id;
  const offlineAnswers = JSON.parse(localStorage.getItem(key) || '{}');
  offlineAnswers[entryId] = { optionId, timestamp: new Date().toISOString() };
  localStorage.setItem(key, JSON.stringify(offlineAnswers));
}

// Process stored offline answers when online
async function processOfflineAnswers() {
  if (!state.dailyQuiz || ['free', 'extra', 'exam_hall'].includes(state.mode))
    return;
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
  if (state.mode === 'free' || state.mode === 'extra') return;
  const pending = getPendingSubmission();
  if (!pending) return;

  try {
    if (pending.type === 'exam_hall') {
      const { error, data } = await state.supabase.rpc(
        'submit_exam_hall_attempt',
        {
          p_attempt_id: pending.attemptId,
          p_answers: pending.answers || {},
        }
      );
      if (error) throw error;
      if (!data?.attempt_id) throw new Error('Unable to submit exam attempt.');

      clearPendingSubmission();
      clearExamDeadline();
      clearExamHallProgress();

      const url = new URL(window.location.href);
      url.pathname = url.pathname.replace(/[^/]+$/, 'result-face.html');
      url.searchParams.set('exam_hall_attempt', pending.attemptId);
      window.location.replace(url.toString());
      return;
    }

    const { error } = await state.supabase
      .from('daily_quizzes')
      .update(pending.payload)
      .eq('id', pending.quizId);

    if (error) throw error;

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

async function ensureFreeQuizAttempt(progressData = null) {
  if (state.mode !== 'free' || state.freeQuizAttempt || !state.dailyQuiz)
    return;

  if (progressData?.attemptId) {
    state.freeQuizAttempt = {
      id: progressData.attemptId,
      started_at:
        progressData.startedAt ||
        progressData.started_at ||
        state.dailyQuiz.started_at ||
        new Date().toISOString(),
    };
    if (!state.dailyQuiz.started_at && state.freeQuizAttempt.started_at) {
      state.dailyQuiz.started_at = state.freeQuizAttempt.started_at;
    }
    state.dailyQuiz.status = 'in_progress';
    saveFreeQuizProgress({
      attemptId: state.freeQuizAttempt.id,
      startedAt: state.dailyQuiz.started_at,
    });
    return;
  }

  const payload = {
    free_quiz_id: state.dailyQuiz.id,
    total_questions: state.entries.length,
  };
  if (state.user?.id) {
    payload.profile_id = state.user.id;
  }
  const { data, error } = await state.supabase
    .from('free_quiz_attempts')
    .insert(payload)
    .select('id, started_at')
    .single();
  if (error) throw error;
  state.freeQuizAttempt = data;
  state.dailyQuiz.started_at =
    data?.started_at || state.dailyQuiz.started_at || new Date().toISOString();
  state.dailyQuiz.status = 'in_progress';
  saveFreeQuizProgress({
    attemptId: state.freeQuizAttempt.id,
    startedAt: state.dailyQuiz.started_at,
  });
}

async function ensureStarted() {
  if (!state.dailyQuiz) return;

  if (state.mode === 'free') {
    if (!state.freeQuizAttempt) {
      await ensureFreeQuizAttempt();
    }
    if (!state.dailyQuiz.started_at) {
      state.dailyQuiz.started_at = new Date().toISOString();
    }
    saveFreeQuizProgress({
      startedAt: state.dailyQuiz.started_at,
      attemptId: state.freeQuizAttempt?.id,
    });
    storeExamDeadline();
    if (!state.timerId) startTimerTicking();
    return;
  }

  if (state.mode === 'extra') {
    if (!state.dailyQuiz.started_at) {
      state.dailyQuiz.started_at = new Date().toISOString();
    }
    state.dailyQuiz.status = 'in_progress';
    saveExtraQuizProgress({
      startedAt: state.dailyQuiz.started_at,
      attemptId: state.extraAttempt?.id,
    });
    storeExamDeadline();
    if (!state.timerId) startTimerTicking();
    return;
  }

  if (state.dailyQuiz.status !== 'assigned') return;
  const startedAt = new Date().toISOString();
  const { error } = await state.supabase
    .from('daily_quizzes')
    .update({ status: 'in_progress', started_at: startedAt })
    .eq('id', state.dailyQuiz.id);
  if (error) throw error;
  state.dailyQuiz.status = 'in_progress';
  state.dailyQuiz.started_at = startedAt;

  storeExamDeadline();
  startTimerTicking();
}

function persistFreeQuizAnswer(entry) {
  if (state.mode !== 'free' || !entry) return;
  saveFreeQuizProgress({
    startedAt: state.dailyQuiz?.started_at,
    attemptId: state.freeQuizAttempt?.id,
    answers: {
      [entry.id]: {
        optionId: entry.selected_option_id,
        recordedAt: entry.answered_at,
      },
    },
  });
}

function persistExamHallAnswer(entry) {
  if (state.mode !== 'exam_hall' || !entry) return;
  saveExamHallProgress({
    startedAt: state.dailyQuiz?.started_at,
    attemptId: getExamHallAttemptId(),
    answers: {
      [entry.id]: {
        optionId: entry.selected_option_id,
        recordedAt: entry.answered_at,
      },
    },
  });
}

function applyStoredFreeAnswers(answersMap) {
  if (state.mode !== 'free' || !answersMap) return;
  Object.entries(answersMap).forEach(([entryId, storedValue]) => {
    const optionId =
      typeof storedValue === 'object' && storedValue !== null
        ? (storedValue.optionId ??
          storedValue.value ??
          storedValue.answer ??
          storedValue)
        : storedValue;
    const entry = state.entries.find((item) => item.id === entryId);
    if (!entry) return;
    updateEntrySelection(entry, optionId);
  });
}

function applyStoredExamHallAnswers(answersMap) {
  if (state.mode !== 'exam_hall' || !answersMap) return;
  Object.entries(answersMap).forEach(([entryId, storedValue]) => {
    const optionId =
      typeof storedValue === 'object' && storedValue !== null
        ? (storedValue.optionId ??
          storedValue.value ??
          storedValue.answer ??
          storedValue)
        : storedValue;
    const entry = state.entries.find((item) => item.id === entryId);
    if (!entry) return;
    updateEntrySelection(entry, optionId);
  });
}

function applyStoredExtraAnswers(answersMap) {
  if (state.mode !== 'extra' || !answersMap) return;
  Object.entries(answersMap).forEach(([entryId, storedValue]) => {
    const optionId =
      typeof storedValue === 'object' && storedValue !== null
        ? (storedValue.optionId ??
          storedValue.value ??
          storedValue.answer ??
          storedValue)
        : storedValue;
    const entry = state.entries.find((item) => item.id === entryId);
    if (!entry) return;
    updateEntrySelection(entry, optionId);
  });
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

    if (state.mode === 'free') {
      persistFreeQuizAnswer(entry);
      return;
    }

    if (state.mode === 'exam_hall') {
      persistExamHallAnswer(entry);
      return;
    }

    if (state.mode === 'extra') {
      // Persist locally so answers survive refresh
      saveExtraQuizProgress({
        startedAt: state.dailyQuiz?.started_at,
        attemptId: state.extraAttempt?.id,
        answers: {
          [entry.id]: {
            optionId: entry.selected_option_id,
            recordedAt: entry.answered_at,
          },
        },
      });
      return;
    }

    const { error } = await state.supabase
      .from('daily_quiz_questions')
      .update({
        selected_option_id: option.id,
        is_correct: !!option.is_correct,
        answered_at: answeredAt,
      })
      .eq('id', entry.id);
    if (error) throw error;
  } catch (err) {
    console.error('[Exam Face] recordAnswer failed', err);
    showToast(err.message || 'Unable to save your answer.', 'error');

    if (!['free', 'extra', 'exam_hall'].includes(state.mode) && !isSyncing) {
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

    if (state.mode === 'exam_hall') {
      const attemptId = getExamHallAttemptId();
      if (!attemptId) {
        throw new Error('Missing exam attempt id.');
      }

      const answers = {};
      state.entries.forEach((entry) => {
        if (entry?.id && entry.selected_option_id) {
          answers[entry.id] = entry.selected_option_id;
        }
      });

      if (!navigator.onLine) {
        storePendingSubmission({
          type: 'exam_hall',
          attemptId,
          answers,
          timestamp: new Date().toISOString(),
        });

        clearExamDeadline();
        clearExamHallProgress();

        const url = new URL(window.location.href);
        url.pathname = url.pathname.replace(/[^/]+$/, 'result-face.html');
        url.searchParams.set('exam_hall_attempt', attemptId);
        url.searchParams.set('pending', '1');
        window.location.replace(url.toString());
        return;
      }

      const { data, error } = await state.supabase.rpc(
        'submit_exam_hall_attempt',
        { p_attempt_id: attemptId, p_answers: answers }
      );
      if (error) throw error;
      if (!data?.attempt_id) throw new Error('Unable to submit your exam.');

      try {
        sessionStorage.setItem(
          'exam_hall_last_result',
          JSON.stringify({ attemptId, result: data })
        );
      } catch {
        // ignore
      }

      clearExamDeadline();
      clearExamHallProgress();

      const url = new URL(window.location.href);
      url.pathname = url.pathname.replace(/[^/]+$/, 'result-face.html');
      url.searchParams.set('exam_hall_attempt', attemptId);
      window.location.replace(url.toString());
      return;
    }

    correct = state.entries.filter(isEntryCorrect).length;
    if (state.mode === 'free') {
      const completedAt = new Date().toISOString();
      const durationSeconds = computeTimeUsed(
        state.dailyQuiz.started_at,
        completedAt
      );
      const scorePercent = total
        ? Number(((correct / total) * 100).toFixed(2))
        : 0;

      if (!state.freeQuizAttempt) {
        await ensureFreeQuizAttempt();
      }

      if (state.freeQuizAttempt?.id) {
        await state.supabase
          .from('free_quiz_attempts')
          .update({
            completed_at: completedAt,
            duration_seconds: durationSeconds ?? null,
            total_questions: total,
            correct_count: correct,
            score: scorePercent,
          })
          .eq('id', state.freeQuizAttempt.id);
      } else {
        await state.supabase.from('free_quiz_attempts').insert({
          free_quiz_id: state.dailyQuiz.id,
          profile_id: state.user?.id || null,
          total_questions: total,
          correct_count: correct,
          score: scorePercent,
          completed_at: completedAt,
          duration_seconds: durationSeconds ?? null,
        });
      }

      try {
        const cachePayload = {
          quiz: {
            id: state.dailyQuiz.id,
            slug: state.dailyQuiz.slug,
            title: state.dailyQuiz.title,
            description: state.dailyQuiz.description,
            time_limit_seconds: state.dailyQuiz.time_limit_seconds,
            started_at: state.dailyQuiz.started_at,
            completed_at: completedAt,
          },
          entries: state.entries.map((entry) => ({
            id: entry.id,
            question: entry.question,
            selected_option_id: entry.selected_option_id,
            is_correct: entry.is_correct,
            correct_option_id: entry.correct_option_id,
            correct_option_key: entry.correct_option_key,
            raw_correct_option: entry.raw_correct_option,
          })),
          correct,
          total,
          score: scorePercent,
          duration_seconds: durationSeconds ?? null,
        };
        sessionStorage.setItem(
          'free_quiz_last_result',
          JSON.stringify(cachePayload)
        );
      } catch (err) {
        console.warn('[Exam Face] Unable to cache free quiz result', err);
      }

      clearFreeQuizProgress();
      clearExamDeadline();

      const resultsUrl = new URL(window.location.href);
      resultsUrl.pathname = resultsUrl.pathname.replace(
        /[^/]+$/,
        'result-face.html'
      );
      resultsUrl.searchParams.set(
        'free_quiz',
        state.dailyQuiz.slug || state.dailyQuiz.id
      );
      if (state.freeQuizAttempt?.id) {
        resultsUrl.searchParams.set('attempt', state.freeQuizAttempt.id);
      }
      window.location.replace(resultsUrl.toString());
      return;
    }

    if (state.mode === 'extra') {
      const completedAt = new Date().toISOString();
      const durationSeconds = computeTimeUsed(
        state.dailyQuiz.started_at,
        completedAt
      );
      const scorePercent = total
        ? Number(((correct / total) * 100).toFixed(2))
        : 0;

      // Store a lightweight snapshot to avoid bloating the DB.
      // Only keep ids + small metadata needed for result rendering.
      const practicePayload = {
        attempt: {
          id: state.extraAttempt?.id || null,
          attempt_number: state.extraAttempt?.attempt_number ?? null,
        },
        setId: state.extraSet?.id || state.dailyQuiz.id,
        set: state.extraSet || {
          id: state.dailyQuiz.id,
          title: state.dailyQuiz.title,
          description: state.dailyQuiz.description,
          time_limit_seconds: state.dailyQuiz.time_limit_seconds,
        },
        quiz: {
          id: state.dailyQuiz.id,
          title: state.dailyQuiz.title,
          description: state.dailyQuiz.description,
          started_at: state.dailyQuiz.started_at,
          completed_at: completedAt,
          time_limit_seconds: state.dailyQuiz.time_limit_seconds,
          total_questions: total,
        },
        entries: state.entries.map((entry) => ({
          // Question id from the extra set
          id: entry.id,
          // Only store the chosen answer and correctness signals
          selected_option_id: entry.selected_option_id ?? null,
          is_correct:
            typeof entry.is_correct === 'boolean' ? entry.is_correct : null,
          // Keep the resolved correct option id/key if available (tiny)
          correct_option_id: entry.correct_option_id ?? null,
          correct_option_key: entry.correct_option_key ?? null,
        })),
        correct,
        total,
        score: scorePercent,
        duration_seconds: durationSeconds ?? null,
      };

      try {
        sessionStorage.setItem(
          'extra_quiz_last_result',
          JSON.stringify(practicePayload)
        );
      } catch (storageError) {
        console.warn(
          '[Exam Face] Unable to cache extra practice result',
          storageError
        );
      }

      if (state.extraAttempt?.id && state.supabase) {
        try {
          await state.supabase
            .from('extra_question_attempts')
            .update({
              status: 'completed',
              completed_at: completedAt,
              duration_seconds: durationSeconds ?? null,
              total_questions: total,
              correct_answers: correct,
              score_percent: scorePercent,
              response_snapshot: practicePayload,
            })
            .eq('id', state.extraAttempt.id);
          state.extraAttempt = {
            ...state.extraAttempt,
            status: 'completed',
            completed_at: completedAt,
            duration_seconds: durationSeconds ?? null,
            total_questions: total,
            correct_answers: correct,
            score_percent: scorePercent,
          };
        } catch (attemptError) {
          console.error(
            '[Exam Face] Unable to persist extra attempt summary',
            attemptError
          );
        }
      }

      clearExamDeadline();
      clearExtraQuizProgress();

      const extraResultsUrl = new URL(window.location.href);
      extraResultsUrl.pathname = extraResultsUrl.pathname.replace(
        /[^/]+$/,
        'result-face.html'
      );
      extraResultsUrl.searchParams.set(
        'extra_question_set_id',
        state.dailyQuiz.id
      );
      if (state.extraAttempt?.id) {
        extraResultsUrl.searchParams.set('attempt_id', state.extraAttempt.id);
      }
      window.location.replace(extraResultsUrl.toString());
      return;
    }

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

    const { error } = await state.supabase
      .from('daily_quizzes')
      .update(payload)
      .eq('id', state.dailyQuiz.id);
    if (error) throw error;

    clearExamDeadline();
    clearPendingSubmission();

    const url = new URL(window.location.href);
    url.pathname = url.pathname.replace(/[^/]+$/, 'result-face.html');
    url.searchParams.set('daily_quiz_id', state.dailyQuiz.id);
    window.location.replace(url.toString());
  } catch (err) {
    console.error('[Exam Face] submitQuiz failed', err);
    if (state.mode !== 'free') {
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
    }
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
  const freeQuizSlug = url.searchParams.get('free_quiz');
  state.extraPlanId = url.searchParams.get('plan_id');
  state.extraPlanTier = null;
  state.extraAttempt = null;
  state.examHallAttempt = null;
  state.examHallSession = null;

  const examHallAttemptId = url.searchParams.get('exam_hall_attempt');
  if (examHallAttemptId) {
    state.mode = 'exam_hall';
    const { data, error } = await state.supabase.rpc('get_exam_hall_attempt', {
      p_attempt_id: examHallAttemptId,
    });
    if (error) throw error;

    if (data?.status === 'completed' || data?.attempt?.completed_at) {
      const resultsUrl = new URL(window.location.href);
      resultsUrl.pathname = resultsUrl.pathname.replace(
        /[^/]+$/,
        'result-face.html'
      );
      resultsUrl.searchParams.set('exam_hall_attempt', examHallAttemptId);
      window.location.replace(resultsUrl.toString());
      return;
    }

    const quiz = data?.quiz || null;
    const attempt = data?.attempt || null;
    if (!quiz?.id || !attempt?.id) {
      throw new Error('Unable to load this exam attempt.');
    }

    state.examHallSession = data;
    state.examHallAttempt = attempt;
    state.dailyQuiz = {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      intro: quiz.intro,
      time_limit_seconds: quiz.time_limit_seconds,
      starts_at: quiz.starts_at || null,
      ends_at: quiz.ends_at || null,
      pass_mark_percent: quiz.pass_mark_percent ?? null,
      total_questions: 0,
      status: 'in_progress',
      assigned_date: new Date().toISOString(),
      started_at: attempt.started_at || new Date().toISOString(),
    };

    const deadlineAt = data?.deadline_at || null;
    if (deadlineAt) {
      const key = getExamDeadlineKey();
      if (key) {
        try {
          localStorage.setItem(key, new Date(deadlineAt).toISOString());
        } catch {
          // ignore
        }
      }
    } else if (state.dailyQuiz.started_at) {
      storeExamDeadline();
    }
    return;
  }

  if (freeQuizSlug) {
    state.mode = 'free';
    const { data: quiz, error } = await state.supabase
      .from('free_quizzes')
      .select(
        'id, title, description, intro, slug, is_active, time_limit_seconds, question_count'
      )
      .eq('slug', freeQuizSlug)
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw error;
    if (!quiz) {
      throw new Error('This free quiz is no longer available.');
    }
    state.dailyQuiz = {
      id: quiz.id,
      slug: quiz.slug,
      title: quiz.title,
      description: quiz.description,
      intro: quiz.intro,
      status: 'assigned',
      assigned_date: new Date().toISOString(),
      time_limit_seconds: quiz.time_limit_seconds,
      total_questions: quiz.question_count,
    };
    return;
  }

  const extraSetId = url.searchParams.get('extra_question_set_id');
  if (extraSetId) {
    state.mode = 'extra';
    const launchDebug = readExtraSetLaunchDebug();
    console.debug('[Exam Face] Attempting to load extra practice set', {
      extraSetId,
      userId: state.user?.id || null,
      launchDebug,
    });
    mergeExtraSetLaunchDebug({
      extraSetId,
      loadAttemptedAt: new Date().toISOString(),
      destination: window.location.href,
      authenticatedUserId: state.user?.id || null,
    });
    let setRow = null;
    let setError = null;
    ({ data: setRow, error: setError } = await state.supabase
      .from('extra_question_sets')
      .select(
        'id, title, description, time_limit_seconds, question_count, starts_at, ends_at, is_active, max_attempts_per_user, assignment_rules, visibility_rules'
      )
      .eq('id', extraSetId)
      .maybeSingle());
    if (setError && setError.message?.includes('time_limit_seconds')) {
      const fallback = await state.supabase
        .from('extra_question_sets')
        .select(
          'id, title, description, question_count, starts_at, ends_at, is_active, visibility_rules'
        )
        .eq('id', extraSetId)
        .maybeSingle();
      setRow = fallback.data
        ? {
            ...fallback.data,
            time_limit_seconds: null,
            max_attempts_per_user: null,
            assignment_rules: DEFAULT_ASSIGNMENT_RULES,
          }
        : null;
      setError = fallback.error;
    }
    if (setError) {
      mergeExtraSetLaunchDebug({
        loadFailedAt: new Date().toISOString(),
        failureReason:
          setError.message || 'Unknown Supabase error loading extra set',
      });
      throw setError;
    }
    if (!setRow) {
      mergeExtraSetLaunchDebug({
        loadFailedAt: new Date().toISOString(),
        failureReason: 'Extra question set not found',
      });
      throw new Error('This practice set is no longer available.');
    }

    mergeExtraSetLaunchDebug({
      loadSucceededAt: new Date().toISOString(),
      resolvedSet: {
        id: setRow.id,
        questionCount: Number(setRow.question_count ?? 0),
        isActive: Boolean(setRow.is_active),
        startsAt: setRow.starts_at || null,
        endsAt: setRow.ends_at || null,
      },
    });

    setRow.assignment_rules = normalizeAssignmentRules(setRow.assignment_rules);
    state.extraSet = setRow;

    // Resolve the plan tier for tier-aware distribution modes
    async function ensureExtraPlanTier() {
      if (!state.supabase || !state.extraPlanId) return null;
      try {
        const { data, error } = await state.supabase
          .from('subscription_plans')
          .select('id, plan_tier')
          .eq('id', state.extraPlanId)
          .maybeSingle();
        if (error) throw error;
        state.extraPlanTier = (data?.plan_tier ?? '').toString();
        return state.extraPlanTier;
      } catch (err) {
        console.warn(
          '[Exam Face] Failed to resolve plan tier for extra set',
          err
        );
        state.extraPlanTier = null;
        return null;
      }
    }
    await ensureExtraPlanTier();
    state.dailyQuiz = {
      id: setRow.id,
      title: setRow.title,
      description: setRow.description,
      time_limit_seconds: setRow.time_limit_seconds,
      total_questions: setRow.question_count ?? 0,
      status: 'assigned',
      assigned_date: new Date().toISOString(),
    };
    try {
      await initialiseExtraPracticeAttempt(
        setRow.id,
        state.dailyQuiz.total_questions
      );
    } catch (attemptError) {
      const message =
        attemptError?.message ||
        'Unable to start this practice set. Please check back later.';
      showToast(message, 'error');
      setTimeout(() => {
        window.location.replace('admin-board.html');
      }, 1500);
      return;
    }
    if (!state.dailyQuiz.started_at) {
      state.dailyQuiz.started_at = new Date().toISOString();
    }
    // Ensure we persist start time early so refresh respects timer
    try {
      const existing = loadExtraQuizProgress();
      if (!existing?.startedAt) {
        saveExtraQuizProgress({
          startedAt: state.dailyQuiz.started_at,
          attemptId: state.extraAttempt?.id,
        });
      }
    } catch {
      // non-fatal; persistence is best-effort
    }
    return;
  }

  const quizId = url.searchParams.get('daily_quiz_id');

  if (!quizId) {
    if (!state.user?.id) {
      throw new Error('Please sign in to access your daily quiz.');
    }
    // If no quiz ID provided, check for today's quiz or redirect to dashboard
    const today = new Date().toISOString().slice(0, 10);
    const { data: todayQuiz, error: checkError } = await state.supabase
      .from('daily_quizzes')
      .select('id, status')
      .eq('user_id', state.user.id)
      .eq('assigned_date', today)
      .maybeSingle();

    if (checkError) throw checkError;

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

  const { data: quiz, error } = await state.supabase
    .from('daily_quizzes')
    .select(
      'id, status, total_questions, correct_answers, started_at, completed_at, assigned_date, time_limit_seconds, user_id'
    )
    .eq('id', quizId)
    .single();

  if (error) throw error;
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
  if (state.mode === 'exam_hall') {
    const questions = Array.isArray(state.examHallSession?.questions)
      ? state.examHallSession.questions
      : [];
    state.entries = questions
      .slice()
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
      .map((row, idx) => {
        const rawOptions = Array.isArray(row.options) ? row.options : [];
        const options = rawOptions.map((option, optionIndex) => {
          const id =
            option.id || option.label || String.fromCharCode(65 + optionIndex);
          const label = option.label || String.fromCharCode(65 + optionIndex);
          return {
            id,
            label,
            content: option.content,
            is_correct: false,
            order_index: option.order_index ?? optionIndex,
          };
        });
        return {
          id: row.id,
          question: {
            id: row.id,
            stem: row.prompt,
            explanation: null,
            image_url: row.image_url,
            question_options: options,
          },
          selected_option_id: null,
          is_correct: null,
          answered_at: null,
          daily_quiz_id: state.dailyQuiz.id,
          order_index: row.order_index ?? idx,
          correct_option_id: null,
          correct_option_key: null,
          raw_correct_option: null,
        };
      });
    state.answers = {};
    state.dailyQuiz.total_questions = state.entries.length;
    return;
  }

  if (state.mode === 'free') {
    const { data, error } = await state.supabase
      .from('free_quiz_questions')
      .select(
        'id, question_id, prompt, explanation, image_url, options, correct_option, order_index'
      )
      .eq('free_quiz_id', state.dailyQuiz.id)
      .order('order_index', { ascending: true });
    if (error) throw error;
    state.entries = (data || []).map((row, idx) => {
      const rawOptions = Array.isArray(row.options) ? row.options : [];
      const options = rawOptions.map((option, optionIndex) => {
        const id =
          option.id || option.label || String.fromCharCode(65 + optionIndex);
        const label = option.label || String.fromCharCode(65 + optionIndex);
        return {
          id,
          label,
          content: option.content,
          is_correct:
            (row.correct_option || '').toString().toLowerCase() ===
              id.toString().toLowerCase() ||
            (row.correct_option || '').toString().toLowerCase() ===
              label.toString().toLowerCase(),
          order_index: option.order_index ?? optionIndex,
        };
      });
      const normalizedCorrect = normalizeOptionKey(row.correct_option);
      const correctOption = options.find((opt) => {
        const idKey = normalizeOptionKey(opt.id);
        const labelKey = normalizeOptionKey(opt.label);
        return (
          (normalizedCorrect &&
            (idKey === normalizedCorrect || labelKey === normalizedCorrect)) ||
          opt.is_correct
        );
      });
      const correctOptionId =
        correctOption?.id ?? correctOption?.label ?? row.correct_option ?? null;
      const correctOptionKey = normalizeOptionKey(correctOptionId);
      return {
        id: row.id,
        question: {
          id: row.question_id || row.id,
          stem: row.prompt,
          explanation: row.explanation,
          image_url: row.image_url,
          question_options: options,
        },
        selected_option_id: null,
        is_correct: null,
        answered_at: null,
        daily_quiz_id: state.dailyQuiz.id,
        order_index: row.order_index ?? idx,
        correct_option_id: correctOptionId,
        correct_option_key: correctOptionKey,
        raw_correct_option: row.correct_option ?? null,
      };
    });
    state.answers = {};
    state.dailyQuiz.total_questions = state.entries.length;
    return;
  }

  if (state.mode === 'extra') {
    let dataResponse = await state.supabase
      .from('extra_questions')
      .select(
        `id, stem, explanation, metadata, extra_question_options(id, label, content, is_correct, order_index)`
      )
      .eq('set_id', state.dailyQuiz.id)
      .order('created_at', { ascending: true });
    if (
      dataResponse.error &&
      dataResponse.error.message?.includes('time_limit_seconds')
    ) {
      dataResponse = await state.supabase
        .from('extra_questions')
        .select(
          `id, stem, explanation, metadata, extra_question_options(id, label, content, is_correct, order_index)`
        )
        .eq('set_id', state.dailyQuiz.id)
        .order('created_at', { ascending: true });
    }
    const { data, error } = dataResponse;
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    const mappedEntries = rows.map((row, idx) => {
      const options = Array.isArray(row.extra_question_options)
        ? row.extra_question_options
            .slice()
            .sort(
              (a, b) =>
                (a.order_index ?? a.label?.charCodeAt(0) ?? 0) -
                (b.order_index ?? b.label?.charCodeAt(0) ?? 0)
            )
            .map((option, optionIndex) => ({
              id: option.id,
              label: option.label || String.fromCharCode(65 + optionIndex),
              content: option.content,
              is_correct: Boolean(option.is_correct),
              order_index: option.order_index ?? optionIndex,
            }))
        : [];
      const correctOption = options.find((opt) => opt.is_correct) || null;
      return {
        id: row.id,
        question: {
          id: row.id,
          stem: row.stem,
          explanation: row.explanation,
          metadata: row.metadata || {},
          question_options: options,
        },
        selected_option_id: null,
        is_correct: null,
        answered_at: null,
        order_index: idx,
        correct_option_id: correctOption?.id ?? correctOption?.label ?? null,
        correct_option_key: normalizeOptionKey(
          correctOption?.id ?? correctOption?.label
        ),
        raw_correct_option: correctOption?.label ?? null,
      };
    });
    const selectedTiers = Array.isArray(
      state.extraSet?.visibility_rules?.planTiers
    )
      ? state.extraSet.visibility_rules.planTiers.map((t) => t.toString())
      : null;
    const { selected } = applyAssignmentRules(
      mappedEntries,
      state.extraSet?.assignment_rules,
      state.extraPlanId,
      {
        planTier: state.extraPlanTier,
        selectedTiers,
      }
    );
    state.entries = selected;
    state.answers = {};
    state.dailyQuiz.total_questions = state.entries.length;
    if (state.extraAttempt) {
      state.extraAttempt.total_questions = state.entries.length;
    }
    return;
  }

  const { data, error } = await state.supabase
    .from('daily_quiz_questions')
    .select(
      `
      id,
      daily_quiz_id,
      order_index,
      selected_option_id,
      is_correct,
      answered_at,
      question:question_id (
        id,
        stem,
        explanation,
        question_options (
          id,
          label,
          content,
          is_correct,
          order_index
        )
      )
    `
    )
    .eq('daily_quiz_id', state.dailyQuiz.id)
    .order('order_index', { ascending: true });
  if (error) throw error;
  state.entries = data || [];

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
  if (state.mode === 'free') {
    if (els.title)
      els.title.textContent = state.dailyQuiz.title || 'Free Quiz Preview';
    if (els.desc)
      els.desc.textContent =
        state.dailyQuiz.description ||
        'Preview our exam engine and discover how Academic Nightingale supports your prep journey.';
    if (els.questionCount)
      els.questionCount.textContent = `Questions: ${state.entries.length}`;
    if (els.timeLimitLabel)
      els.timeLimitLabel.textContent = `Time Limit: ${formatTimeLabel(state.dailyQuiz.time_limit_seconds)}`;
    if (els.difficulty) els.difficulty.style.display = 'none';
    if (els.totalQuestions)
      els.totalQuestions.textContent = String(state.entries.length);
    return;
  }

  if (state.mode === 'exam_hall') {
    if (els.title)
      els.title.textContent = state.dailyQuiz.title || 'Examination Hall';
    if (els.desc) {
      const scheduleBits = [];
      if (state.dailyQuiz.starts_at) {
        scheduleBits.push(
          `Opens ${formatDateTimeLabel(state.dailyQuiz.starts_at)}`
        );
      }
      if (state.dailyQuiz.ends_at) {
        scheduleBits.push(
          `Closes ${formatDateTimeLabel(state.dailyQuiz.ends_at)}`
        );
      }
      const scheduleText = scheduleBits.length
        ? scheduleBits.join(' • ')
        : 'Timer is running. Submit before time expires.';
      els.desc.textContent = scheduleText;
    }
    if (els.questionCount)
      els.questionCount.textContent = `Questions: ${state.entries.length}`;
    if (els.timeLimitLabel)
      els.timeLimitLabel.textContent = `Time Limit: ${formatTimeLabel(state.dailyQuiz.time_limit_seconds)}`;
    if (els.difficulty) els.difficulty.style.display = 'none';
    if (els.totalQuestions)
      els.totalQuestions.textContent = String(state.entries.length);
    return;
  }

  if (state.mode === 'extra') {
    if (els.title)
      els.title.textContent = state.extraSet?.title || 'Bonus Practice Session';
    if (els.desc) {
      const scheduleBits = [];
      if (state.extraSet?.starts_at) {
        scheduleBits.push(
          `Opens ${formatDateTimeLabel(state.extraSet.starts_at)}`
        );
      }
      if (state.extraSet?.ends_at) {
        scheduleBits.push(
          `Closes ${formatDateTimeLabel(state.extraSet.ends_at)}`
        );
      }
      const scheduleText = scheduleBits.length
        ? scheduleBits.join(' • ')
        : 'Take your time and review carefully. Your progress saves until you submit.';
      els.desc.textContent = scheduleText;
    }
    if (els.questionCount)
      els.questionCount.textContent = `Questions: ${state.entries.length}`;
    if (els.timeLimitLabel)
      els.timeLimitLabel.textContent = `Time Limit: ${formatTimeLabel(state.dailyQuiz.time_limit_seconds)}`;
    if (els.difficulty) els.difficulty.style.display = 'none';
    if (els.totalQuestions)
      els.totalQuestions.textContent = String(state.entries.length);
    return;
  }

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
    if (url.searchParams.get('free_quiz')) {
      state.mode = 'free';
    }
    if (url.searchParams.get('exam_hall_attempt')) {
      state.mode = 'exam_hall';
    }

    state.supabase = await getSupabaseClient();
    const {
      data: { session },
    } = await state.supabase.auth.getSession();
    state.user = session?.user ?? null;
    if (!['free', 'exam_hall'].includes(state.mode) && !state.user) {
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
    // Restore persisted progress for extra sets before we mark as started
    let storedExtraProgress = null;
    if (state.mode === 'extra') {
      storedExtraProgress = loadExtraQuizProgress();
      if (storedExtraProgress?.startedAt) {
        // Prefer persisted startedAt to avoid timer reset on refresh
        state.dailyQuiz.started_at = storedExtraProgress.startedAt;
        state.dailyQuiz.status = 'in_progress';
      }
      if (storedExtraProgress?.answers) {
        applyStoredExtraAnswers(storedExtraProgress.answers);
      }
    }
    if (state.mode === 'extra') {
      mergeExtraSetLaunchDebug({
        questionsLoadedAt: new Date().toISOString(),
        questionCount: Array.isArray(state.entries) ? state.entries.length : 0,
      });
      console.debug('[Exam Face] Extra practice questions loaded', {
        questionCount: Array.isArray(state.entries) ? state.entries.length : 0,
      });
    }

    if (state.mode !== 'free' && state.dailyQuiz.status === 'assigned') {
      try {
        await ensureStarted();
      } catch (startError) {
        console.error(
          '[Exam Face] Unable to mark quiz as started immediately',
          startError
        );
      }
    }

    let storedFreeProgress = null;
    if (state.mode === 'free') {
      storedFreeProgress = loadFreeQuizProgress();
      if (storedFreeProgress?.startedAt && !state.dailyQuiz.started_at) {
        state.dailyQuiz.started_at = storedFreeProgress.startedAt;
        state.dailyQuiz.status = 'in_progress';
      }
      if (storedFreeProgress?.answers) {
        applyStoredFreeAnswers(storedFreeProgress.answers);
      }
    }

    let storedExamHallProgress = null;
    if (state.mode === 'exam_hall') {
      storedExamHallProgress = loadExamHallProgress();
      if (storedExamHallProgress?.startedAt && !state.dailyQuiz.started_at) {
        state.dailyQuiz.started_at = storedExamHallProgress.startedAt;
        state.dailyQuiz.status = 'in_progress';
      }
      if (storedExamHallProgress?.answers) {
        applyStoredExamHallAnswers(storedExamHallProgress.answers);
      }
    }

    if (state.mode === 'free') {
      await ensureFreeQuizAttempt(storedFreeProgress);
      if (state.dailyQuiz.started_at) {
        storeExamDeadline();
      }
    }

    // Process any offline data if connection is available
    if (state.mode !== 'free' && navigator.onLine) {
      await processOfflineAnswers();
      await processPendingSubmission();
    }

    // Check if there's a pending submission to process
    if (state.mode !== 'free' && navigator.onLine) {
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
    if (state.mode === 'extra') {
      mergeExtraSetLaunchDebug({
        initialisedAt: new Date().toISOString(),
        status: 'ready',
      });
      console.debug('[Exam Face] Extra practice initialised successfully', {
        setId: state.dailyQuiz?.id || null,
        questionCount: Array.isArray(state.entries) ? state.entries.length : 0,
      });
    }
  } catch (err) {
    console.error('[Exam Face] initialisation failed', err);
    if (state.mode === 'extra') {
      mergeExtraSetLaunchDebug({
        initialisationFailedAt: new Date().toISOString(),
        failureMessage: err?.message || 'Unknown error',
      });
    }
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

import { getSupabaseClient } from '../../shared/supabaseClient.js';

const elements = {
  greeting: document.querySelector('[data-role="user-greeting"]'),
  email: document.querySelector('[data-role="user-email"]'),
  toast: document.querySelector('[data-role="toast"]'),
  statStatus: document.querySelector('[data-role="stat-status"]'),
  statProgress: document.querySelector('[data-role="stat-progress"]'),
  statScore: document.querySelector('[data-role="stat-score"]'),
  statStreak: document.querySelector('[data-role="stat-streak"]'),
  progressBar: document.querySelector('[data-role="progress-bar"]'),
  progressLabel: document.querySelector('[data-role="progress-label"]'),
  quizTitle: document.querySelector('[data-role="quiz-title"]'),
  quizSubtitle: document.querySelector('[data-role="quiz-subtitle"]'),
  quizTimer: document.querySelector('[data-role="quiz-timer"]'),
  quizTimerValue: document.querySelector('[data-role="quiz-timer-value"]'),
  questions: document.querySelector('[data-role="questions"]'),
  completionBanner: document.querySelector('[data-role="completion-banner"]'),
  historyBody: document.querySelector('[data-role="history-body"]'),
  historySummary: document.querySelector('[data-role="history-summary"]'),
  regenerateBtn: document.querySelector('[data-role="regenerate-quiz"]'),
  resumeBtn: document.querySelector('[data-role="resume-quiz"]'),
  logoutBtn: document.querySelector('[data-role="logout"]'),
  scheduleNotice: document.querySelector('[data-role="schedule-notice"]'),
  scheduleHeadline: document.querySelector(
    '[data-role="schedule-notice-headline"]'
  ),
  scheduleDetail: document.querySelector(
    '[data-role="schedule-notice-detail"]'
  ),
  scheduleMeta: document.querySelector('[data-role="schedule-notice-meta"]'),
};

const state = {
  supabase: null,
  user: null,
  profile: null,
  quiz: null,
  questions: [],
  history: [],
  settings: {
    dailyQuestionCount: null,
  },
  isGenerating: false,
  scheduleHealth: null,
  timerIntervalId: null,
  timerExpired: false,
};

const NOTICE_TONE_CLASSES = {
  positive: ['border-emerald-200', 'bg-emerald-50', 'text-emerald-800'],
  warning: ['border-amber-200', 'bg-amber-50', 'text-amber-800'],
  danger: ['border-rose-200', 'bg-rose-50', 'text-rose-800'],
  info: ['border-slate-200', 'bg-white', 'text-slate-700'],
};

const ALL_TONE_CLASSES = [
  ...new Set(Object.values(NOTICE_TONE_CLASSES).flat()),
];

function showToast(message, type = 'info') {
  if (!elements.toast) return;
  elements.toast.textContent = message;
  elements.toast.classList.remove('hidden');
  elements.toast.classList.remove(
    'border-red-200',
    'bg-red-50',
    'text-red-700'
  );
  elements.toast.classList.remove(
    'border-emerald-200',
    'bg-emerald-50',
    'text-emerald-700'
  );
  elements.toast.classList.remove(
    'border-sky-200',
    'bg-sky-50',
    'text-sky-700'
  );

  if (type === 'error') {
    elements.toast.classList.add('border-red-200', 'bg-red-50', 'text-red-700');
  } else if (type === 'success') {
    elements.toast.classList.add(
      'border-emerald-200',
      'bg-emerald-50',
      'text-emerald-700'
    );
  } else {
    elements.toast.classList.add('border-sky-200', 'bg-sky-50', 'text-sky-700');
  }

  window.clearTimeout(elements.toast.dataset.timeoutId);
  const timeoutId = window.setTimeout(() => {
    elements.toast?.classList.add('hidden');
  }, 5000);
  elements.toast.dataset.timeoutId = timeoutId;
}

function formatTimerValue(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function setTimerDisplay(seconds) {
  const container = elements.quizTimer;
  const valueEl = elements.quizTimerValue;
  if (!container || !valueEl) return;
  if (seconds === null || seconds === undefined) {
    container.classList.add('hidden');
    valueEl.textContent = '--:--';
    return;
  }
  valueEl.textContent = formatTimerValue(seconds);
  container.classList.remove('hidden');
}

function clearQuizTimer() {
  if (state.timerIntervalId) {
    window.clearInterval(state.timerIntervalId);
    state.timerIntervalId = null;
  }
}

function handleTimerExpired() {
  if (!state.quiz || state.quiz.status === 'completed') return;
  state.timerExpired = true;
  completeQuiz().catch((error) => {
    console.error('[Learner Dashboard] Timer expiry completion failed', error);
  });
}

function startQuizTimer() {
  clearQuizTimer();

  if (
    !state.quiz ||
    !state.quiz.time_limit_seconds ||
    state.quiz.status === 'completed'
  ) {
    setTimerDisplay(null);
    return;
  }

  const limit = Number(state.quiz.time_limit_seconds);
  if (!Number.isFinite(limit) || limit <= 0) {
    setTimerDisplay(null);
    return;
  }

  const startedAt = state.quiz.started_at
    ? new Date(state.quiz.started_at)
    : null;
  if (!startedAt) {
    setTimerDisplay(limit);
    return;
  }

  const tick = () => {
    const elapsed = Math.max(
      0,
      Math.floor((Date.now() - startedAt.getTime()) / 1000)
    );
    const remaining = limit - elapsed;
    if (remaining <= 0) {
      setTimerDisplay(0);
      clearQuizTimer();
      handleTimerExpired();
      return;
    }
    setTimerDisplay(remaining);
  };

  tick();
  state.timerIntervalId = window.setInterval(tick, 1000);
}

function mapDailyQuizError(error) {
  const message = error?.message || '';
  if (!message) {
    return "Unable to load today's quiz. Please refresh or try again later.";
  }
  const lower = message.toLowerCase();
  if (lower.includes('no active subscription')) {
    return 'You need an active subscription plan before you can start the daily quiz.';
  }
  if (lower.includes('no active study slot')) {
    return 'Your department does not have an active question slot today. Check back soon.';
  }
  if (lower.includes('subslot configuration is incomplete')) {
    return "We are still preparing today's question pool. Please try again later.";
  }
  if (lower.includes('does not have enough questions')) {
    return "Today's question pool is missing some questions. Please try again in a bit.";
  }
  return message;
}

function formatDate(dateString) {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function setScheduleTone(tone = 'info') {
  const container = elements.scheduleNotice;
  if (!container) return;
  container.classList.remove(...ALL_TONE_CLASSES);
  const classes = NOTICE_TONE_CLASSES[tone] || NOTICE_TONE_CLASSES.info;
  container.classList.add(...classes);
}

function updateScheduleNotice(health) {
  const container = elements.scheduleNotice;
  if (!container) return;
  const headline = elements.scheduleHeadline;
  const detail = elements.scheduleDetail;
  const meta = elements.scheduleMeta;

  container.classList.add('hidden');
  if (headline) headline.textContent = 'Daily schedule status';
  if (detail) detail.textContent = 'Loading latest schedule data…';
  if (meta) meta.textContent = '';

  if (!health) {
    return;
  }

  let tone = 'info';
  let headlineText = '';
  let detailText = '';
  let metaText = '';
  const target = Number(health.question_target ?? 0);
  const count = Number(health.question_count ?? 0);
  const missing = Number(health.missing_questions ?? 0);
  const dayOffset = Number.isFinite(Number(health.day_offset))
    ? Number(health.day_offset)
    : null;
  const dayLabel = dayOffset !== null ? `Day ${dayOffset + 1}` : null;

  switch (health.status) {
    case 'ready':
    case 'published':
      tone = 'positive';
      headlineText = "Today's pool is ready to start";
      detailText = target
        ? `${count}/${target} questions prepared for you.`
        : `${count} questions available for today.`;
      break;
    case 'underfilled':
      tone = 'warning';
      headlineText = "Today's pool is underfilled";
      detailText = missing
        ? `${missing} question${missing === 1 ? '' : 's'} still missing. Please check back soon.`
        : 'We are finalising a few more questions for today.';
      break;
    case 'planned':
      tone = 'warning';
      headlineText = "Today's pool is being finalised";
      detailText = 'Hang tight—your questions will be ready shortly.';
      break;
    case 'unscheduled':
      tone = 'danger';
      headlineText = 'Schedule not ready yet';
      detailText =
        'Your department has not scheduled this day. We will notify you once it opens.';
      break;
    case 'no_subscription':
      tone = 'info';
      headlineText = 'Activate a plan to unlock daily drills';
      detailText =
        'Choose a subscription to receive daily personalised question sets.';
      break;
    case 'no_active_cycle':
      tone = 'info';
      headlineText = 'Next study slot starting soon';
      detailText =
        'We will assign daily questions once the upcoming slot begins.';
      break;
    case 'error':
      tone = 'danger';
      headlineText = 'Unable to load schedule details';
      detailText = health.message || 'Please refresh the page to try again.';
      break;
    default:
      tone = 'info';
      headlineText = 'Checking daily schedule…';
      detailText =
        'We will update this spot as soon as we finish loading your pool.';
      break;
  }

  const cycleTitle = health.cycle_title ? `Cycle: ${health.cycle_title}` : '';
  const windowDates =
    health.starts_on || health.ends_on
      ? `Window: ${formatDate(health.starts_on)} – ${formatDate(health.ends_on)}`
      : '';
  const nextReady = health.next_ready_date
    ? `Next ready day: ${formatDate(health.next_ready_date)}`
    : '';
  metaText = [cycleTitle, dayLabel, windowDates, nextReady]
    .filter(Boolean)
    .join(' · ');

  if (headline) headline.textContent = headlineText;
  if (detail) detail.textContent = detailText;
  if (meta) meta.textContent = metaText;
  setScheduleTone(tone);
  container.classList.remove('hidden');
}

function updateHeader() {
  if (state.profile?.full_name && elements.greeting) {
    const firstName = state.profile.full_name.split(' ')[0];
    elements.greeting.textContent = `Welcome back, ${firstName}`;
  } else if (state.user?.email && elements.greeting) {
    elements.greeting.textContent = `Welcome back, ${state.user.email.split('@')[0]}`;
  }

  if (elements.email && state.user?.email) {
    elements.email.textContent = state.user.email;
  }
}

function toPercent(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

function updateProgressDisplay() {
  const total = state.questions.length;
  const answered = state.questions.filter((q) => q.selected_option_id).length;
  const correct = state.questions.filter(
    (q) => q.selected_option_id && q.is_correct
  ).length;

  if (elements.statProgress) {
    elements.statProgress.textContent = total ? `${answered} / ${total}` : '—';
  }
  if (elements.statScore) {
    elements.statScore.textContent = answered ? `${correct} correct` : '—';
  }

  const percent = total ? Math.round((answered / total) * 100) : 0;
  if (elements.progressBar) {
    elements.progressBar.style.width = `${percent}%`;
  }
  if (elements.progressLabel) {
    elements.progressLabel.textContent = `${percent}% complete`;
  }

  if (elements.statStatus) {
    elements.statStatus.textContent = state.quiz?.status
      ? state.quiz.status.replace(/_/g, ' ')
      : '—';
  }

  if (elements.completionBanner) {
    elements.completionBanner.classList.toggle(
      'hidden',
      state.quiz?.status !== 'completed'
    );
  }
}

function renderHistory() {
  if (!elements.historyBody) return;
  if (!state.history.length) {
    elements.historyBody.innerHTML =
      '<tr><td class="px-4 py-4 text-slate-500" colspan="4">No quiz history yet. Complete today\'s quiz to start your streak.</td></tr>';
    elements.historySummary.textContent = '0 completed this week';
    if (elements.statStreak) {
      elements.statStreak.textContent = '0 days';
    }
    return;
  }

  const rows = state.history
    .map((item) => {
      const statusBadge = (() => {
        const base =
          'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ';
        if (item.status === 'completed') {
          return `<span class="${base} bg-emerald-100 text-emerald-700">Completed</span>`;
        }
        if (item.status === 'in_progress') {
          return `<span class="${base} bg-sky-100 text-sky-700">In Progress</span>`;
        }
        return `<span class="${base} bg-slate-100 text-slate-500">Assigned</span>`;
      })();

      const score = item.total_questions
        ? `${item.correct_answers}/${item.total_questions} (${toPercent(item.correct_answers, item.total_questions)}%)`
        : '—';

      return `
      <tr>
        <td class="whitespace-nowrap px-4 py-3 text-sm text-slate-700">${formatDate(item.assigned_date)}</td>
        <td class="px-4 py-3">${statusBadge}</td>
        <td class="px-4 py-3 text-sm text-slate-700">${score}</td>
        <td class="px-4 py-3 text-sm text-slate-500">${item.completed_at ? new Date(item.completed_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
      </tr>
    `;
    })
    .join('');

  elements.historyBody.innerHTML = rows;

  const completedThisWeek = state.history.filter(
    (item) => item.status === 'completed'
  ).length;
  elements.historySummary.textContent = `${completedThisWeek} completed in last ${state.history.length} days`;

  const streak = calculateStreak(state.history);
  if (elements.statStreak) {
    elements.statStreak.textContent = `${streak} ${streak === 1 ? 'day' : 'days'}`;
  }
}

function calculateStreak(history) {
  const sorted = history
    .map((item) => ({ ...item, assigned_date: item.assigned_date }))
    .sort((a, b) => new Date(b.assigned_date) - new Date(a.assigned_date));

  let streak = 0;
  let cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  for (const item of sorted) {
    const itemDate = new Date(item.assigned_date);
    itemDate.setHours(0, 0, 0, 0);

    if (itemDate.getTime() === cursor.getTime()) {
      if (item.status === 'completed') {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
        continue;
      }
      break;
    }

    if (itemDate < cursor) {
      break;
    }
  }

  return streak;
}

function renderQuestions() {
  if (!elements.questions) return;
  if (!state.questions.length) {
    elements.questions.innerHTML =
      '<div class="rounded-lg border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">No questions assigned yet. Use the New set button to generate today\'s quiz.</div>';
    return;
  }

  const fragments = state.questions
    .map((entry, index) => {
      const question = entry.question;
      const selectedOptionId = entry.selected_option_id;
      const isCompleted = Boolean(selectedOptionId);
      const isCorrect = Boolean(entry.is_correct);
      const questionNumber = index + 1;

      const optionsMarkup = (question?.question_options || [])
        .sort(
          (a, b) =>
            (a.order_index ?? a.label.charCodeAt(0)) -
            (b.order_index ?? b.label.charCodeAt(0))
        )
        .map((option) => {
          const checked = selectedOptionId === option.id ? 'checked' : '';
          const highlight =
            selectedOptionId === option.id
              ? option.is_correct
                ? 'border-emerald-300 bg-emerald-50'
                : 'border-red-300 bg-red-50'
              : 'border-slate-200 bg-white';

          return `
          <label class="flex items-start gap-3 rounded-lg border ${highlight} px-4 py-3 shadow-sm transition hover:border-cyan-200 hover:bg-cyan-50">
            <input type="radio" name="question-${entry.id}" value="${option.id}" class="mt-1 h-4 w-4 text-cyan-600 focus:ring-cyan-600" ${checked} data-role="option" data-question-id="${entry.id}" data-option-id="${option.id}" />
            <div>
              <p class="text-sm font-semibold text-slate-800">${option.label}. ${option.content}</p>
              ${selectedOptionId === option.id && option.is_correct ? '<p class="mt-1 text-xs font-semibold text-emerald-600">Correct answer</p>' : ''}
              ${selectedOptionId === option.id && !option.is_correct ? '<p class="mt-1 text-xs font-semibold text-red-600">Incorrect</p>' : ''}
            </div>
          </label>
        `;
        })
        .join('');

      const statusPill = (() => {
        if (!isCompleted) return '';
        return isCorrect
          ? '<span class="badge bg-emerald-100 text-emerald-700">Correct</span>'
          : '<span class="badge bg-red-100 text-red-600">Review needed</span>';
      })();

      return `
      <article class="rounded-2xl border border-slate-200 bg-white px-5 py-6 shadow-sm">
        <header class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Question ${questionNumber}</p>
            <h3 class="mt-1 text-base font-semibold text-slate-900">${question?.stem ?? 'Question unavailable'}</h3>
          </div>
          ${statusPill}
        </header>
        <div class="mt-4 space-y-3">
          ${optionsMarkup}
        </div>
        ${question?.explanation && isCompleted ? `<p class="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">Explanation: ${question.explanation}</p>` : ''}
      </article>
    `;
    })
    .join('');

  elements.questions.innerHTML = fragments;

  elements.questions
    .querySelectorAll('[data-role="option"]')
    .forEach((input) => {
      input.addEventListener('change', async (event) => {
        const questionId = event.target.dataset.questionId;
        const optionId = event.target.dataset.optionId;
        await submitAnswer(questionId, optionId);
      });
    });
}

async function submitAnswer(questionId, optionId) {
  const questionEntry = state.questions.find((item) => item.id === questionId);
  if (!questionEntry) return;
  const option = questionEntry.question?.question_options?.find(
    (opt) => opt.id === optionId
  );
  if (!option) return;

  try {
    if (state.quiz?.status === 'assigned') {
      const startedAt = new Date().toISOString();
      const { error: startError } = await state.supabase
        .from('daily_quizzes')
        .update({ status: 'in_progress', started_at: startedAt })
        .eq('id', state.quiz.id);
      if (startError) throw startError;
      state.quiz.status = 'in_progress';
      state.quiz.started_at = startedAt;
      startQuizTimer();
    }

    const answeredAt = new Date().toISOString();
    const { error } = await state.supabase
      .from('daily_quiz_questions')
      .update({
        selected_option_id: optionId,
        is_correct: option.is_correct,
        answered_at: answeredAt,
      })
      .eq('id', questionId);
    if (error) throw error;

    questionEntry.selected_option_id = optionId;
    questionEntry.is_correct = option.is_correct;
    questionEntry.answered_at = answeredAt;

    updateProgressDisplay();
    renderQuestions();

    const allAnswered = state.questions.every(
      (item) => item.selected_option_id
    );
    if (allAnswered) {
      await completeQuiz();
    }
  } catch (error) {
    console.error('[Learner Dashboard] submitAnswer failed', error);
    showToast(
      error.message || 'Unable to save your answer. Please try again.',
      'error'
    );
  }
}

async function completeQuiz() {
  clearQuizTimer();
  if (!state.quiz || state.quiz.status === 'completed') {
    setTimerDisplay(null);
    await refreshHistory();
    return;
  }

  const correct = state.questions.filter(
    (item) => item.selected_option_id && item.is_correct
  ).length;
  const total = state.questions.length;
  const payload = {
    status: 'completed',
    correct_answers: correct,
    total_questions: total,
    completed_at: new Date().toISOString(),
  };

  try {
    const { error } = await state.supabase
      .from('daily_quizzes')
      .update(payload)
      .eq('id', state.quiz.id);
    if (error) throw error;

    state.quiz = { ...state.quiz, ...payload };
    updateProgressDisplay();
    if (state.timerExpired) {
      showToast('Time is up! We submitted your quiz automatically.', 'info');
      state.timerExpired = false;
    } else {
      showToast("Great job! You completed today's quiz.", 'success');
    }
    setTimerDisplay(null);
    await refreshHistory();
  } catch (error) {
    console.error('[Learner Dashboard] completeQuiz failed', error);
    showToast(
      error.message || 'We could not finalise your quiz. Try again.',
      'error'
    );
    state.timerExpired = false;
  }
}

async function loadScheduleHealth() {
  if (!state.supabase) {
    updateScheduleNotice(null);
    return;
  }
  try {
    const { data, error } = await state.supabase.rpc(
      'get_user_schedule_health'
    );
    if (error) throw error;
    state.scheduleHealth = data || null;
    updateScheduleNotice(state.scheduleHealth);
  } catch (error) {
    console.error('[Learner Dashboard] loadScheduleHealth failed', error);
    state.scheduleHealth = { status: 'error', message: error.message };
    updateScheduleNotice(state.scheduleHealth);
  }
}

async function loadDailyQuiz({ forceGenerate = false } = {}) {
  const today = new Date();
  const isoDate = today.toISOString().slice(0, 10);

  try {
    if (forceGenerate) {
      state.isGenerating = true;
      showToast('Generating a fresh daily quiz…', 'info');
      const { error: genError } = await state.supabase.rpc(
        'generate_daily_quiz'
      );
      if (genError) throw genError;
    }

    let { data: quiz, error } = await state.supabase
      .from('daily_quizzes')
      .select(
        'id, status, total_questions, correct_answers, started_at, completed_at, assigned_date, time_limit_seconds'
      )
      .eq('user_id', state.user.id)
      .eq('assigned_date', isoDate)
      .maybeSingle();

    if (error) throw error;

    if (!quiz) {
      const { data: generated, error: generateError } =
        await state.supabase.rpc('generate_daily_quiz');
      if (generateError) throw generateError;
      const generatedId = Array.isArray(generated)
        ? generated[0]?.daily_quiz_id
        : generated?.daily_quiz_id;
      const { data: created, error: fetchError } = await state.supabase
        .from('daily_quizzes')
        .select(
          'id, status, total_questions, correct_answers, started_at, completed_at, assigned_date, time_limit_seconds'
        )
        .eq('id', generatedId)
        .single();
      if (fetchError) throw fetchError;
      quiz = created;
    }

    state.quiz = quiz;
    state.timerExpired = false;
    await loadQuizQuestions(quiz.id);
    updateProgressDisplay();
    startQuizTimer();
  } catch (error) {
    console.error('[Learner Dashboard] loadDailyQuiz failed', error);
    showToast(mapDailyQuizError(error), 'error');
    clearQuizTimer();
    setTimerDisplay(null);
    state.timerExpired = false;
  } finally {
    state.isGenerating = false;
    await loadScheduleHealth();
  }
}

async function loadQuizQuestions(quizId) {
  try {
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
      .eq('daily_quiz_id', quizId)
      .order('order_index', { ascending: true });
    if (error) throw error;

    state.questions = (data || []).map((row) => ({
      id: row.id,
      daily_quiz_id: row.daily_quiz_id,
      order_index: row.order_index,
      selected_option_id: row.selected_option_id,
      is_correct: row.is_correct,
      answered_at: row.answered_at,
      question: row.question,
    }));

    if (state.quiz && !state.quiz.total_questions) {
      state.quiz.total_questions = state.questions.length;
    }

    renderQuestions();
    updateProgressDisplay();
  } catch (error) {
    console.error('[Learner Dashboard] loadQuizQuestions failed', error);
    showToast(error.message || 'Unable to load quiz questions.', 'error');
  }
}

async function refreshHistory() {
  try {
    const { data, error } = await state.supabase
      .from('daily_quizzes')
      .select(
        'id, assigned_date, status, total_questions, correct_answers, completed_at'
      )
      .eq('user_id', state.user.id)
      .order('assigned_date', { ascending: false })
      .limit(14);
    if (error) throw error;

    state.history = data || [];
    renderHistory();
  } catch (error) {
    console.error('[Learner Dashboard] refreshHistory failed', error);
    showToast('Unable to load history right now.', 'error');
  }
}

async function ensureProfile() {
  const fallbackName = state.user.email?.split('@')[0] ?? 'Learner';
  try {
    const { data, error } = await state.supabase
      .from('profiles')
      .select('id, full_name, role, last_seen_at')
      .eq('id', state.user.id)
      .maybeSingle();
    if (error) throw error;

    if (!data) {
      const { data: inserted, error: insertError } = await state.supabase
        .from('profiles')
        .upsert({
          id: state.user.id,
          full_name: state.user.user_metadata?.full_name ?? fallbackName,
          role: 'learner',
          last_seen_at: new Date().toISOString(),
        })
        .select('id, full_name, role, last_seen_at')
        .single();
      if (insertError) throw insertError;
      state.profile = inserted;
    } else {
      const { data: updated, error: updateError } = await state.supabase
        .from('profiles')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', state.user.id)
        .select('id, full_name, role, last_seen_at')
        .single();
      if (!updateError && updated) {
        state.profile = updated;
      } else {
        state.profile = data;
      }
    }
  } catch (error) {
    console.error('[Learner Dashboard] ensureProfile failed', error);
    showToast(
      'Unable to load your profile. Some features may be limited.',
      'error'
    );
    state.profile = { full_name: fallbackName };
  }
}

async function regenerateQuiz() {
  if (state.isGenerating) return;
  if (
    !window.confirm(
      'Generate a fresh quiz for today? Previous answers will be cleared.'
    )
  ) {
    return;
  }
  await loadDailyQuiz({ forceGenerate: true });
  await refreshHistory();
  showToast('New daily quiz generated.', 'success');
}

async function handleLogout() {
  try {
    await state.supabase.auth.signOut();
    window.location.replace('login.html');
  } catch (error) {
    console.error('[Learner Dashboard] signOut failed', error);
    showToast('Unable to sign out. Please try again.', 'error');
  }
}

function scrollToQuiz() {
  elements.questions?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function initialise() {
  try {
    state.supabase = await getSupabaseClient();
    const {
      data: { session },
    } = await state.supabase.auth.getSession();
    if (!session?.user) {
      window.location.replace('login.html');
      return;
    }
    state.user = session.user;

    state.supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!newSession?.user) {
        window.location.replace('login.html');
      }
    });

    await ensureProfile();
    updateHeader();

    elements.regenerateBtn?.addEventListener('click', regenerateQuiz);
    elements.resumeBtn?.addEventListener('click', scrollToQuiz);
    elements.logoutBtn?.addEventListener('click', handleLogout);

    await loadScheduleHealth();
    await loadDailyQuiz();
    await refreshHistory();
  } catch (error) {
    console.error('[Learner Dashboard] initialisation failed', error);
    showToast('Something went wrong while loading the dashboard.', 'error');
  }
}

initialise();

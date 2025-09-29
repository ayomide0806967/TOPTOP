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
  dailyQuiz: null, // row from daily_quizzes
  entries: [], // rows from daily_quiz_questions with nested question + options
  answers: {}, // map of question entry id -> selected option id
  timerId: null,
  timerStartFrom: null, // Date if started_at exists
};

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
  const limit = Number(state.dailyQuiz?.time_limit_seconds || 0);
  if (!limit || !state.dailyQuiz) {
    setTimerDisplay('No limit');
    return;
  }
  const startedAt = state.dailyQuiz.started_at
    ? new Date(state.dailyQuiz.started_at)
    : null;
  if (!startedAt) {
    // Not started yet; show full limit
    const hours = Math.floor(limit / 3600);
    const minutes = Math.floor((limit % 3600) / 60);
    const seconds = limit % 60;
    setTimerDisplay(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
    return;
  }
  const elapsed = Math.max(
    0,
    Math.floor((Date.now() - startedAt.getTime()) / 1000)
  );
  const remaining = limit - elapsed;
  if (remaining <= 0) {
    setTimerDisplay("Time's up!");
    clearInterval(state.timerId);
    state.timerId = null;
    // Auto-submit
    submitQuiz().catch(() => {});
    return;
  }
  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;
  setTimerDisplay(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
}

function startTimerTicking() {
  clearTimer();
  const limit = Number(state.dailyQuiz?.time_limit_seconds || 0);
  if (!limit) {
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
}

function updateProgress() {
  const total = state.entries.length;
  const answeredCount = state.entries.filter(e => e.selected_option_id).length;
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
  if (!state.dailyQuiz || state.dailyQuiz.status !== 'assigned') return;
  const startedAt = new Date().toISOString();
  const { error } = await state.supabase
    .from('daily_quizzes')
    .update({ status: 'in_progress', started_at: startedAt })
    .eq('id', state.dailyQuiz.id);
  if (error) throw error;
  state.dailyQuiz.status = 'in_progress';
  state.dailyQuiz.started_at = startedAt;
  startTimerTicking();
}

async function recordAnswer(entryId, optionId) {
  const entry = state.entries.find(e => e.id === entryId);
  if (!entry) return;
  
  try {
    await ensureStarted();
    
    const option = entry.question?.question_options?.find(opt => opt.id === optionId);
    if (!option) return;

    const answeredAt = new Date().toISOString();
    const { error } = await state.supabase
      .from('daily_quiz_questions')
      .update({
        selected_option_id: option.id,
        is_correct: !!option.is_correct,
        answered_at: answeredAt,
      })
      .eq('id', entry.id);
    if (error) throw error;

    entry.selected_option_id = option.id;
    entry.is_correct = !!option.is_correct;
    entry.answered_at = answeredAt;

    updateProgress();
    renderPalette(); // Update palette to show answered status
  } catch (err) {
    console.error('[Exam Face] recordAnswer failed', err);
    showToast(err.message || 'Unable to save your answer.', 'error');
  }
}

async function submitQuiz() {
  if (!state.dailyQuiz) return;
  
  // Check if all questions are answered
  const unanswered = state.entries.filter(e => !e.selected_option_id).length;
  if (unanswered > 0) {
    if (!confirm(`You have ${unanswered} unanswered question${unanswered > 1 ? 's' : ''}. Do you want to submit anyway?`)) {
      return;
    }
  }
  
  try {
    clearTimer();
    showToast('Submitting quiz...', 'info');
    
    const correct = state.entries.filter(
      (e) => e.selected_option_id && e.is_correct
    ).length;
    const total = state.entries.length;
    const payload = {
      status: 'completed',
      correct_answers: correct,
      total_questions: total,
      completed_at: new Date().toISOString(),
    };
    const { error } = await state.supabase
      .from('daily_quizzes')
      .update(payload)
      .eq('id', state.dailyQuiz.id);
    if (error) throw error;

    // Redirect to results page
    const url = new URL(window.location.href);
    url.pathname = url.pathname.replace(/[^/]+$/, 'result-face.html');
    url.searchParams.set('daily_quiz_id', state.dailyQuiz.id);
    window.location.replace(url.toString());
  } catch (err) {
    console.error('[Exam Face] submitQuiz failed', err);
    showToast(err.message || 'Unable to submit quiz.', 'error');
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
  
  window.addEventListener('online', updateNetworkStatus);
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
          const expression = calcDisplay.textContent.replace(/×/g, '*').replace(/÷/g, '/');
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
  const quizId = url.searchParams.get('daily_quiz_id');
  
  if (!quizId) {
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
      // No quiz for today, redirect to dashboard
      window.location.replace('admin-board.html');
      return;
    }
    
    // Redirect with the quiz ID
    url.searchParams.set('daily_quiz_id', todayQuiz.id);
    window.location.replace(url.toString());
    return;
  }
  
  // Load the specified quiz
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
  
  // Verify the quiz belongs to current user
  if (quiz.user_id !== state.user.id) {
    throw new Error('Unauthorized access to quiz');
  }
  
  // If quiz is already completed, redirect to results
  if (quiz.status === 'completed') {
    const resultsUrl = new URL(window.location.href);
    resultsUrl.pathname = resultsUrl.pathname.replace(/[^/]+$/, 'result-face.html');
    resultsUrl.searchParams.set('daily_quiz_id', quiz.id);
    window.location.replace(resultsUrl.toString());
    return;
  }
  
  state.dailyQuiz = quiz;
}

async function loadQuestions() {
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
  const assignedDate = state.dailyQuiz.assigned_date ? new Date(state.dailyQuiz.assigned_date) : new Date();
  const dateStr = assignedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  
  if (els.title) els.title.textContent = 'Daily Practice Questions';
  if (els.desc) els.desc.textContent = `Assigned for ${dateStr} • Tailored to your department`;
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
    state.supabase = await getSupabaseClient();
    const {
      data: { session },
    } = await state.supabase.auth.getSession();
    if (!session?.user) {
      window.location.replace('login.html');
      return;
    }
    state.user = session.user;

    els.loading.style.display = 'block';
    els.content.classList.add('hidden');

    await loadQuizData();
    if (!state.dailyQuiz) {
      // Quiz loading was handled (redirect occurred)
      return;
    }
    await loadQuestions();

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

import { getSupabaseClient } from '../../shared/supabaseClient.js';

function $(id) {
  return document.getElementById(id);
}

function formatDateTime(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '--';
  return `${d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })} at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

function formatTime(totalSeconds) {
  const n = Number(totalSeconds);
  if (!Number.isFinite(n) || n < 0) return '--';
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function computeTimeUsed(startedAt, completedAt) {
  const s = startedAt ? new Date(startedAt) : null;
  const c = completedAt ? new Date(completedAt) : null;
  if (!s || !c || Number.isNaN(s.getTime()) || Number.isNaN(c.getTime()))
    return null;
  const diff = Math.floor((c.getTime() - s.getTime()) / 1000);
  return Math.max(diff, 0);
}

function renderOptions(q, response) {
  const options = (q.question_options || [])
    .slice()
    .sort(
      (a, b) =>
        (a.order_index ?? a.label?.charCodeAt(0) ?? 0) -
        (b.order_index ?? b.label?.charCodeAt(0) ?? 0)
    );
  const selectedId = response.selected_option_id;
  return options
    .map((opt) => {
      const wasSelected = selectedId === opt.id;
      let cls = 'opt';
      if (wasSelected) {
        cls += opt.is_correct
          ? ' user-selected-correct'
          : ' user-selected-incorrect';
      } else if (opt.is_correct && !response.is_correct) {
        cls += ' correct-answer';
      }
      return `
      <label class="${cls}">
        <input type="radio" disabled ${wasSelected ? 'checked' : ''}>
        <span>${opt.label ? `${opt.label}. ` : ''}${opt.content}</span>
      </label>
    `;
    })
    .join('');
}

function renderQuestion(qEntry, index) {
  const q = qEntry.question;
  const isSkipped = !qEntry.selected_option_id;
  const statusIndicator = qEntry.is_correct
    ? '<span class="status-indicator correct">✓ Correct</span>'
    : isSkipped
      ? '<span class="status-indicator skipped">○ Skipped</span>'
      : '<span class="status-indicator incorrect">✗ Incorrect</span>';

  let body = '';
  body += `<div class="options">${renderOptions(q, qEntry)}</div>`;

  if (!qEntry.is_correct && !isSkipped) {
    const correctAnswers = (q.question_options || [])
      .filter((o) => o.is_correct)
      .map((o) => `${o.label ? o.label + '. ' : ''}${o.content}`)
      .join(', ');
    body += `
      <div class="answer-box" aria-live="polite">
        <strong class="lbl">CORRECT ANSWER</strong>
        <div class="val">${correctAnswers}</div>
      </div>
    `;
  }

  if (q.explanation) {
    body += `
      <details class="exp" style="margin-top:10px;">
        <summary style="cursor:pointer; font-size:14px; color:var(--muted);">Explanation</summary>
        <div style="margin-top:8px; font-size:14px; color:var(--muted); line-height:1.55;">${q.explanation}</div>
      </details>
    `;
  }

  return `
    <article class="q-block">
      <div class="q-head">
        <div class="q-num">Question ${index + 1}</div>
        <div class="q-scorepill">${qEntry.is_correct ? '1/1' : '0/1'} ${statusIndicator}</div>
      </div>
      <div class="q-text">${q.stem ?? q.text ?? 'Question'}</div>
      ${body}
    </article>
  `;
}

async function initialise() {
  const supabase = await getSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) {
    window.location.replace('login.html');
    return;
  }
  const user = session.user;

  const url = new URL(window.location.href);
  const dailyQuizId = url.searchParams.get('daily_quiz_id');
  if (!dailyQuizId) {
    // Fallback to dashboard if id is missing
    window.location.replace('admin-board.html');
    return;
  }

  const { data: quiz, error: quizError } = await supabase
    .from('daily_quizzes')
    .select(
      'id, assigned_date, status, total_questions, correct_answers, time_limit_seconds, started_at, completed_at'
    )
    .eq('id', dailyQuizId)
    .single();
  if (quizError) throw quizError;

  const { data: questions, error: qError } = await supabase
    .from('daily_quiz_questions')
    .select(
      `
      id,
      selected_option_id,
      is_correct,
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
    .eq('daily_quiz_id', dailyQuizId)
    .order('order_index', { ascending: true });
  if (qError) throw qError;

  const correct = Number(quiz.correct_answers ?? 0);
  const total = Number(quiz.total_questions ?? (questions?.length || 0));
  const percent = total ? (correct / total) * 100 : 0;
  const timeUsed = computeTimeUsed(quiz.started_at, quiz.completed_at);

  // Header & stats
  $('quiz-title').textContent = 'Daily Quiz Results';
  $('quiz-meta').textContent =
    `Daily Quiz • Completed on ${formatDateTime(quiz.completed_at)}`;
  $('stat-score').textContent = `${correct}/${total}`;
  $('stat-percentage').textContent = `${percent.toFixed(1)}%`;
  $('stat-time-used').textContent =
    timeUsed != null ? formatTime(timeUsed) : '--';
  $('stat-total-time').textContent = quiz.time_limit_seconds
    ? formatTime(quiz.time_limit_seconds)
    : 'No limit';

  const list = $('questions-list');
  list.innerHTML = (questions || [])
    .map((entry, i) => renderQuestion(entry, i))
    .join('');

  $('stat-correct').textContent = correct;
  $('stat-wrong').textContent = total - correct;

  // Add navigation buttons
  const retake = $('retake-btn');
  if (retake) {
    retake.onclick = () => {
      if (confirm('Generate a new quiz for today? This will reset your progress.')) {
        window.location.href = 'admin-board.html';
      }
    };
  }
  
  const backBtn = $('back-to-dashboard');
  if (backBtn) {
    backBtn.href = 'admin-board.html';
  }
}

window.addEventListener('DOMContentLoaded', () => {
  initialise().catch((err) => {
    console.error('[Result Face] initialisation failed', err);
    const list = document.getElementById('questions-list');
    if (list)
      list.innerHTML =
        '<div class="p-4 rounded-md bg-red-50 border border-red-200 text-red-700">Unable to load results. Please go back and try again.</div>';
  });
});

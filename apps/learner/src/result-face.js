import { getSupabaseClient } from '../../shared/supabaseClient.js';
import {
  getQuizSnapshot,
  saveQuizSnapshot,
} from '../../shared/quizSnapshotStore.js';

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

function normalizeOptionKey(value) {
  if (value === undefined || value === null) return '';
  return value.toString().trim().toLowerCase();
}

function isFreeEntryCorrect(entry) {
  if (!entry) return false;
  if (typeof entry.is_correct === 'boolean') return entry.is_correct;

  const selectedKey = normalizeOptionKey(entry.selected_option_id ?? entry.selected_option ?? entry.answer);
  if (!selectedKey) return false;

  const explicitCorrectKey =
    normalizeOptionKey(entry.correct_option_key) ||
    normalizeOptionKey(entry.correct_option_id) ||
    normalizeOptionKey(entry.correct_option);
  if (explicitCorrectKey) return selectedKey === explicitCorrectKey;

  const options = entry.question?.question_options || [];
  const selectedOption = options.find((opt) => {
    const idKey = normalizeOptionKey(opt.id);
    const labelKey = normalizeOptionKey(opt.label);
    return idKey === selectedKey || labelKey === selectedKey;
  });
  if (selectedOption && typeof selectedOption.is_correct === 'boolean') {
    return selectedOption.is_correct;
  }

  const fallbackCorrectKey = options
    .filter((opt) => opt && opt.is_correct)
    .map((opt) => normalizeOptionKey(opt.id) || normalizeOptionKey(opt.label))[0];
  return fallbackCorrectKey ? selectedKey === fallbackCorrectKey : false;
}

function deriveFreeStats(entries) {
  if (!Array.isArray(entries) || !entries.length) {
    return { correct: 0, total: 0 };
  }
  let correct = 0;
  entries.forEach((entry) => {
    if (isFreeEntryCorrect(entry)) {
      correct += 1;
    }
  });
  return { correct, total: entries.length };
}

function downloadResultSummary(quizData) {
  try {
    const { quiz, correct, total, percent, timeUsed } = quizData;
    
    // Validate data
    if (!quiz || total === undefined || correct === undefined) {
      throw new Error('Invalid quiz data');
    }
    
    // Create canvas for image generation
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Set canvas size (optimized for mobile and desktop)
    const width = 800;
    const height = 700;
    canvas.width = width;
    canvas.height = height;
    
    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#0f766e');
    gradient.addColorStop(1, '#134e4a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    
    // Add decorative elements
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.beginPath();
    ctx.arc(width - 100, 100, 150, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(100, height - 100, 120, 0, Math.PI * 2);
    ctx.fill();
    
  // Title section
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('QUIZ RESULT', width / 2, 60);

  // Brand signature
  ctx.textAlign = 'right';
  ctx.font = '600 18px "Arial", sans-serif';
  ctx.fillText('Academic Nightingale', width - 40, 38);
  ctx.textAlign = 'center';

  // Subtitle
  ctx.font = '16px Arial, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    const quizDate = new Date(quiz.assigned_date).toLocaleDateString(undefined, { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    ctx.fillText(quizDate, width / 2, 90);
    
    // Main result card
    const cardY = 120;
    const cardHeight = 450;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 10;
    ctx.fillRect(50, cardY, width - 100, cardHeight);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    
    // Score circle
    const centerX = width / 2;
    const centerY = cardY + 120;
    const radius = 80;
    
    // Circle background
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fillStyle = percent >= 80 ? '#10b981' : percent >= 60 ? '#3b82f6' : percent >= 40 ? '#f59e0b' : '#ef4444';
    ctx.fill();
    
    // Score text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${percent.toFixed(0)}%`, centerX, centerY + 15);
    
    // Score label
    ctx.font = '18px Arial, sans-serif';
    ctx.fillStyle = '#6b7280';
    ctx.fillText(`${correct} / ${total}`, centerX, centerY + 110);
    
    // Stats section
    let yPos = cardY + 260;
    ctx.textAlign = 'left';
    
    // Correct answers
    ctx.fillStyle = '#10b981';
    ctx.fillRect(100, yPos, 30, 30);
    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 18px Arial, sans-serif';
    ctx.fillText('Correct', 145, yPos + 22);
    ctx.font = '18px Arial, sans-serif';
    ctx.fillStyle = '#6b7280';
    ctx.textAlign = 'right';
    ctx.fillText(correct.toString(), width - 100, yPos + 22);
    
    yPos += 50;
    
    // Wrong/Skipped
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(100, yPos, 30, 30);
    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 18px Arial, sans-serif';
    ctx.fillText('Wrong/Skipped', 145, yPos + 22);
    ctx.font = '18px Arial, sans-serif';
    ctx.fillStyle = '#6b7280';
    ctx.textAlign = 'right';
    ctx.fillText((total - correct).toString(), width - 100, yPos + 22);
    
    yPos += 50;
    
    // Time used
    ctx.textAlign = 'left';
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(100, yPos, 30, 30);
    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 18px Arial, sans-serif';
    ctx.fillText('Time Used', 145, yPos + 22);
    ctx.font = '18px Arial, sans-serif';
    ctx.fillStyle = '#6b7280';
    ctx.textAlign = 'right';
    ctx.fillText(timeUsed != null ? formatTime(timeUsed) : 'N/A', width - 100, yPos + 22);
    
    yPos += 50;
    
    // Time limit
    ctx.textAlign = 'left';
    ctx.fillStyle = '#8b5cf6';
    ctx.fillRect(100, yPos, 30, 30);
    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 18px Arial, sans-serif';
    ctx.fillText('Time Limit', 145, yPos + 22);
    ctx.font = '18px Arial, sans-serif';
    ctx.fillStyle = '#6b7280';
    ctx.textAlign = 'right';
    ctx.fillText(quiz.time_limit_seconds ? formatTime(quiz.time_limit_seconds) : 'No limit', width - 100, yPos + 22);
    
    // Performance message
    const performance = percent >= 80 ? 'Excellent!' : percent >= 60 ? 'Good Job!' : percent >= 40 ? 'Keep Practicing!' : 'Need More Practice!';
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px Arial, sans-serif';
    ctx.fillStyle = '#1f2937';
    ctx.fillText(performance, width / 2, cardY + cardHeight - 30);
    
    // Footer
    ctx.font = '14px Arial, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.textAlign = 'center';
    ctx.fillText(`Generated on ${new Date().toLocaleDateString()}`, width / 2, height - 30);
    
    // Convert canvas to blob and download
    canvas.toBlob((blob) => {
      if (!blob) {
        throw new Error('Failed to generate image');
      }
      
      // Safe date formatting with fallback
      const date = new Date(quiz.assigned_date);
      const dateStr = isNaN(date.getTime()) 
        ? new Date().toISOString().split('T')[0]
        : date.toISOString().split('T')[0];
      
      // For mobile devices, use different approach
      if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
        // Mobile: Open in new window for user to save
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          const newWindow = window.open('', '_blank');
          if (newWindow) {
            newWindow.document.write(`
              <!DOCTYPE html>
              <html>
              <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Quiz Result</title>
                <style>
                  body { margin: 0; padding: 20px; background: #f3f4f6; text-align: center; font-family: Arial, sans-serif; }
                  img { max-width: 100%; height: auto; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
                  .instructions { margin: 20px 0; color: #6b7280; font-size: 14px; }
                  .download-btn { 
                    display: inline-block; 
                    margin: 10px; 
                    padding: 12px 24px; 
                    background: #0f766e; 
                    color: white; 
                    text-decoration: none; 
                    border-radius: 8px; 
                    font-weight: bold;
                  }
                </style>
              </head>
              <body>
                <h2>Your Quiz Result</h2>
                <img src="${url}" alt="Quiz Result">
                <p class="instructions">Long-press the image and select "Save Image" or "Download Image"</p>
                <a href="${url}" download="quiz-result-${dateStr}.png" class="download-btn">Download Image</a>
              </body>
              </html>
            `);
            newWindow.document.close();
          }
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        };
        img.src = url;
        showToast('Opening result in new window...', 'success');
      } else {
        // Desktop: Direct download
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `quiz-result-${dateStr}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 100);
        showToast('Result downloaded successfully!', 'success');
      }
    }, 'image/png', 0.95);
    
  } catch (err) {
    console.error('[Result Face] Download failed:', err);
    showToast('Failed to download result. Please try again.', 'error');
  }
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  const bgColor = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#0ea5e9';
  toast.style.cssText = `
    position: fixed; 
    top: 20px; 
    right: 20px; 
    background: ${bgColor}; 
    color: white; 
    padding: 12px 20px; 
    border-radius: 8px; 
    box-shadow: 0 4px 12px rgba(0,0,0,0.15); 
    z-index: 9999; 
    font-size: 14px; 
    font-weight: 500;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
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

async function renderFreeQuizResults(supabase, slug, attemptId) {
  let cached = null;
  try {
    const stored = sessionStorage.getItem('free_quiz_last_result');
    if (stored) {
      cached = JSON.parse(stored);
      if (cached?.quiz?.slug !== slug && cached?.quiz?.id !== slug) {
        cached = null;
      }
    }
  } catch (err) {
    console.warn('[Result Face] Unable to parse cached free quiz result', err);
  }

  if (cached) {
    sessionStorage.removeItem('free_quiz_last_result');
  }

  let quizMeta = cached?.quiz || null;
  if (!quizMeta) {
    const { data, error } = await supabase
      .from('free_quizzes')
      .select('id, title, description, intro, time_limit_seconds, question_count')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Free quiz not found.');
    quizMeta = {
      id: data.id,
      slug,
      title: data.title,
      description: data.description,
      intro: data.intro,
      time_limit_seconds: data.time_limit_seconds,
      total_questions: data.question_count,
    };
  }

  let attempt = null;
  if (attemptId) {
    const { data, error } = await supabase
      .from('free_quiz_attempts')
      .select('id, total_questions, correct_count, score, duration_seconds, started_at, completed_at')
      .eq('id', attemptId)
      .maybeSingle();
    if (!error && data) attempt = data;
  }

  const derivedStats = cached?.entries?.length ? deriveFreeStats(cached.entries) : null;

  let correct = Number.isFinite(attempt?.correct_count) ? attempt.correct_count : null;
  let total = Number.isFinite(attempt?.total_questions) ? attempt.total_questions : null;

  if (derivedStats) {
    if (total == null || total < derivedStats.total) {
      total = derivedStats.total;
    }
    if (correct == null || (correct === 0 && derivedStats.correct > 0)) {
      correct = derivedStats.correct;
    }
  }

  if (correct == null) {
    correct = Number.isFinite(cached?.correct) ? cached.correct : 0;
  }
  if (total == null || total === 0) {
    total = Number.isFinite(cached?.total) && cached.total ? cached.total : quizMeta?.total_questions ?? 0;
  }

  const percent = total ? (correct / total) * 100 : 0;
  const timeUsed = attempt?.duration_seconds ?? cached?.duration_seconds ?? computeTimeUsed(cached?.quiz?.started_at, cached?.quiz?.completed_at);

  $('quiz-title').textContent = quizMeta.title || 'Free Quiz Results';
  const completedAt = attempt?.completed_at || cached?.quiz?.completed_at;
  const subtitle = completedAt
    ? `Free Quiz • Completed on ${formatDateTime(completedAt)}`
    : 'Free Quiz Preview';
  $('quiz-meta').textContent = `${subtitle} • Unlock full mocks, analytics, and daily coaching when you subscribe.`;
  $('stat-score').textContent = `${correct}/${total}`;
  $('stat-percentage').textContent = `${percent.toFixed(1)}%`;
  $('stat-time-used').textContent = timeUsed != null ? formatTime(timeUsed) : '--';
  $('stat-total-time').textContent = quizMeta.time_limit_seconds
    ? formatTime(quizMeta.time_limit_seconds)
    : 'No limit';
  $('stat-correct').textContent = correct;
  $('stat-wrong').textContent = total - correct;

  const list = $('questions-list');
  if (cached?.entries?.length) {
    list.innerHTML = cached.entries.map((entry, index) => renderQuestion(entry, index)).join('');
  } else {
    list.innerHTML = '<div class="p-4 rounded-md bg-slate-100 text-slate-600 text-sm">Detailed answer review is unavailable for this attempt.</div>';
  }

  const quizData = {
    quiz: {
      assigned_date: new Date().toISOString(),
      time_limit_seconds: quizMeta.time_limit_seconds,
      started_at: cached?.quiz?.started_at || attempt?.started_at,
      completed_at: completedAt,
    },
    correct,
    total,
    percent,
    timeUsed,
  };

  const saveBtn = $('save-result-btn');
  if (saveBtn) {
    saveBtn.onclick = () => {
      saveBtn.disabled = true;
      downloadResultSummary(quizData);
      setTimeout(() => (saveBtn.disabled = false), 1000);
    };
  }

  const backBtn = $('back-to-dashboard');
  if (backBtn) {
    backBtn.href = 'subscription-plans.html';
    backBtn.textContent = 'Unlock Full Access';
  }
}

async function renderExtraPracticeResults(supabase, setId) {
  let cached = null;
  try {
    const stored = sessionStorage.getItem('extra_quiz_last_result');
    if (stored) {
      cached = JSON.parse(stored);
      if (cached?.setId !== setId && cached?.set?.id !== setId) {
        cached = null;
      }
    }
  } catch (err) {
    console.warn('[Result Face] Unable to parse cached extra set result', err);
  }

  if (cached) {
    sessionStorage.removeItem('extra_quiz_last_result');
  }

  let setMeta = cached?.set || null;
  if (!setMeta) {
    let response = await supabase
      .from('extra_question_sets')
      .select('id, title, description, time_limit_seconds, question_count, starts_at, ends_at')
      .eq('id', setId)
      .maybeSingle();
    if (response.error && response.error.message?.includes('time_limit_seconds')) {
      response = await supabase
        .from('extra_question_sets')
        .select('id, title, description, question_count, starts_at, ends_at')
        .eq('id', setId)
        .maybeSingle();
      if (response.data) {
        response.data.time_limit_seconds = null;
      }
    }
    if (response.error) throw response.error;
    if (!response.data) {
      throw new Error('We could not find that practice set.');
    }
    setMeta = response.data;
  }

  const entries = Array.isArray(cached?.entries) ? cached.entries : [];
  const derivedStats = entries.length ? deriveFreeStats(entries) : { correct: 0, total: entries.length };

  const correct = Number.isFinite(cached?.correct)
    ? cached.correct
    : derivedStats.correct;
  const total = Number.isFinite(cached?.total) && cached.total
    ? cached.total
    : derivedStats.total || setMeta.question_count || entries.length || 0;
  const percent = total ? (correct / total) * 100 : 0;
  const timeUsed = cached?.duration_seconds ?? computeTimeUsed(cached?.quiz?.started_at, cached?.quiz?.completed_at);

  $('quiz-title').textContent = setMeta.title || 'Bonus Practice Result';
  const metaBits = [];
  if (setMeta.starts_at) metaBits.push(`Opens ${formatDateTime(setMeta.starts_at)}`);
  if (setMeta.ends_at) metaBits.push(`Closes ${formatDateTime(setMeta.ends_at)}`);
  const metaText = metaBits.length ? metaBits.join(' • ') : 'Extra practice curated by the Academic Nightingale team.';
  $('quiz-meta').textContent = `${metaText} • Keep practising to strengthen your weak points.`;
  $('stat-score').textContent = `${correct}/${total}`;
  $('stat-percentage').textContent = `${percent.toFixed(1)}%`;
  $('stat-time-used').textContent = timeUsed != null ? formatTime(timeUsed) : '--';
  $('stat-total-time').textContent = setMeta.time_limit_seconds
    ? formatTime(setMeta.time_limit_seconds)
    : 'No limit';
  $('stat-correct').textContent = correct;
  $('stat-wrong').textContent = total - correct;

  const list = $('questions-list');
  if (entries.length) {
    list.innerHTML = entries.map((entry, index) => renderQuestion(entry, index)).join('');
  } else {
    list.innerHTML = '<div class="p-4 rounded-md bg-slate-100 text-slate-600 text-sm">Answer review is unavailable because we could not recover your practice responses.</div>';
  }

  const quizData = {
    quiz: {
      assigned_date: cached?.quiz?.assigned_date || new Date().toISOString(),
      time_limit_seconds: setMeta.time_limit_seconds,
      started_at: cached?.quiz?.started_at,
      completed_at: cached?.quiz?.completed_at || new Date().toISOString(),
    },
    correct,
    total,
    percent,
    timeUsed,
  };

  const saveBtn = $('save-result-btn');
  if (saveBtn) {
    saveBtn.onclick = () => {
      saveBtn.disabled = true;
      downloadResultSummary(quizData);
      setTimeout(() => (saveBtn.disabled = false), 1000);
    };
  }

  const backBtn = $('back-to-dashboard');
  if (backBtn) {
    backBtn.href = 'admin-board.html';
    backBtn.textContent = 'Back to dashboard';
  }
}

async function initialise() {
  const supabase = await getSupabaseClient();
  const url = new URL(window.location.href);
  const freeSlug = url.searchParams.get('free_quiz');

  if (freeSlug) {
    await renderFreeQuizResults(supabase, freeSlug, url.searchParams.get('attempt'));
    return;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) {
    window.location.replace('login.html');
    return;
  }

  const extraSetId = url.searchParams.get('extra_question_set_id');
  if (extraSetId) {
    await renderExtraPracticeResults(supabase, extraSetId);
    return;
  }

  const dailyQuizId = url.searchParams.get('daily_quiz_id');
  const requestedSubscription = url.searchParams.get('subscription_id');
  const assignedDateParam = url.searchParams.get('assigned_date');
  const useCached = url.searchParams.get('cached') === '1';

  let quiz = null;
  let questions = null;
  let usingSnapshot = false;
  const snapshot = requestedSubscription
    ? getQuizSnapshot(requestedSubscription, assignedDateParam || undefined)
    : null;

  if (!useCached) {
    if (!dailyQuizId) {
      if (snapshot) {
        ({ quiz, questions } = snapshot);
        usingSnapshot = true;
      } else {
        window.location.replace('admin-board.html');
        return;
      }
    } else {
      try {
        const { data: quizData, error: quizError } = await supabase
          .from('daily_quizzes')
          .select(
            'id, assigned_date, status, total_questions, correct_answers, time_limit_seconds, started_at, completed_at, subscription_id'
          )
          .eq('id', dailyQuizId)
          .single();
        if (quizError) throw quizError;
        quiz = quizData;

        const { data: questionRows, error: qError } = await supabase
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
        questions = questionRows || [];
      } catch (error) {
        if (snapshot) {
          ({ quiz, questions } = snapshot);
          usingSnapshot = true;
        } else {
          throw error;
        }
      }
    }
  } else {
    if (snapshot) {
      ({ quiz, questions } = snapshot);
      usingSnapshot = true;
    } else if (dailyQuizId) {
      const { data: quizData, error: quizError } = await supabase
        .from('daily_quizzes')
        .select(
          'id, assigned_date, status, total_questions, correct_answers, time_limit_seconds, started_at, completed_at, subscription_id'
        )
        .eq('id', dailyQuizId)
        .single();
      if (quizError) throw quizError;
      const { data: questionRows, error: qError } = await supabase
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
      quiz = quizData;
      questions = questionRows || [];
    } else {
      throw new Error('Stored quiz results are no longer available.');
    }
  }

  if (!quiz || !questions) {
    throw new Error('Unable to load quiz details.');
  }

  if (!usingSnapshot && quiz.subscription_id && quiz.assigned_date) {
    saveQuizSnapshot({
      subscriptionId: quiz.subscription_id,
      assignedDate: quiz.assigned_date,
      quiz,
      questions,
    });
  }

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

  // Store quiz data for download
  const quizData = { quiz, correct, total, percent, timeUsed };

  // Add save result button handler
  const saveBtn = $('save-result-btn');
  if (saveBtn) {
    saveBtn.onclick = () => {
      saveBtn.disabled = true;
      downloadResultSummary(quizData);
      setTimeout(() => saveBtn.disabled = false, 1000);
    };
  }
  
  // Back to dashboard button
  const backBtn = $('back-to-dashboard');
  if (backBtn) {
    backBtn.href = 'admin-board.html';
    backBtn.textContent = 'Back to Dashboard';
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

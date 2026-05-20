import { apiFetch } from '../../shared/apiClient.js';
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
    const quizDate = new Date(quiz.assigned_date).toLocaleDateString(
      undefined,
      {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }
    );
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
    ctx.fillStyle =
      percent >= 80
        ? '#10b981'
        : percent >= 60
          ? '#3b82f6'
          : percent >= 40
            ? '#f59e0b'
            : '#ef4444';
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
    ctx.fillText(
      timeUsed != null ? formatTime(timeUsed) : 'N/A',
      width - 100,
      yPos + 22
    );

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
    ctx.fillText(
      quiz.time_limit_seconds
        ? formatTime(quiz.time_limit_seconds)
        : 'No limit',
      width - 100,
      yPos + 22
    );

    // Performance message
    const performance =
      percent >= 80
        ? 'Excellent!'
        : percent >= 60
          ? 'Good Job!'
          : percent >= 40
            ? 'Keep Practicing!'
            : 'Need More Practice!';
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px Arial, sans-serif';
    ctx.fillStyle = '#1f2937';
    ctx.fillText(performance, width / 2, cardY + cardHeight - 30);

    // Footer
    ctx.font = '14px Arial, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.textAlign = 'center';
    ctx.fillText(
      `Generated on ${new Date().toLocaleDateString()}`,
      width / 2,
      height - 30
    );

    // Convert canvas to blob and download
    canvas.toBlob(
      (blob) => {
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
      },
      'image/png',
      0.95
    );
  } catch (err) {
    console.error('[Result Face] Download failed:', err);
    showToast('Failed to download result. Please try again.', 'error');
  }
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  const bgColor =
    type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#0ea5e9';
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
  const responseIsCorrect = response.is_correct === true;
  return options
    .map((opt) => {
      const wasSelected = selectedId === opt.id;
      const optionIsCorrect = opt.is_correct === true;
      let cls = 'opt';
      if (wasSelected) {
        cls += optionIsCorrect
          ? ' user-selected-correct'
          : ' user-selected-incorrect';
      } else if (optionIsCorrect && !responseIsCorrect) {
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
  const entryIsCorrect = qEntry.is_correct === true;
  const statusIndicator = entryIsCorrect
    ? '<span class="status-indicator correct">✓ Correct</span>'
    : isSkipped
      ? '<span class="status-indicator skipped">○ Skipped</span>'
      : '<span class="status-indicator incorrect">✗ Incorrect</span>';

  let body = '';
  body += `<div class="options">${renderOptions(q, qEntry)}</div>`;

  if (!entryIsCorrect && !isSkipped) {
    const correctAnswers = (q.question_options || [])
      .filter((o) => o.is_correct === true)
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
  const url = new URL(window.location.href);
  const examHallAttempt = url.searchParams.get('exam_hall_attempt');
  const freeSlug = url.searchParams.get('free_quiz');

  if (
    examHallAttempt ||
    freeSlug ||
    url.searchParams.get('extra_question_set_id')
  ) {
    window.location.replace('admin-board.html');
    return;
  }

  const session = await apiFetch('/api/me').catch((error) => {
    if (error?.status === 401) return null;
    throw error;
  });
  if (!session?.user) {
    window.location.replace('login.html');
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
        const data = await apiFetch(
          `/api/quiz/daily/${encodeURIComponent(dailyQuizId)}/questions`
        );
        quiz = data.quiz;
        questions = data.questions || [];
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
      const data = await apiFetch(
        `/api/quiz/daily/${encodeURIComponent(dailyQuizId)}/questions`
      );
      quiz = data.quiz;
      questions = data.questions || [];
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
      setTimeout(() => (saveBtn.disabled = false), 1000);
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

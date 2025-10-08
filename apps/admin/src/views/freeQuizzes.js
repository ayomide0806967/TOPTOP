import { dataService } from '../services/dataService.js';
import { showToast } from '../components/toast.js';
import { openModal } from '../components/modal.js';

function escapeHtml(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDuration(seconds) {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) return 'No limit';
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remMins = minutes % 60;
    return `${hours}h ${remMins}m`;
  }
  return `${minutes}m ${secs ? `${secs}s` : ''}`.trim();
}

function formatNumber(value) {
  return Number(value ?? 0).toLocaleString();
}

function buildQuizCard(quiz) {
  return `
    <article class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-lg transition" data-quiz-id="${quiz.id}">
      <header class="flex items-start justify-between gap-4">
        <div>
          <h3 class="text-xl font-semibold text-slate-900">${escapeHtml(quiz.title)}</h3>
          <p class="mt-1 text-sm text-slate-500">${quiz.is_active ? 'Active' : 'Inactive'}</p>
        </div>
        <span class="inline-flex items-center rounded-full ${quiz.is_active ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'} px-3 py-1 text-xs font-semibold uppercase tracking-wide">${quiz.is_active ? 'Live' : 'Draft'}</span>
      </header>
      <div class="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div class="rounded-2xl bg-slate-50 p-3">
          <div class="text-xs font-semibold uppercase tracking-wide text-slate-500">Questions</div>
          <div class="mt-1 text-lg font-bold text-slate-900">${formatNumber(quiz.question_count)}</div>
        </div>
        <div class="rounded-2xl bg-slate-50 p-3">
          <div class="text-xs font-semibold uppercase tracking-wide text-slate-500">Total attempts</div>
          <div class="mt-1 text-lg font-bold text-slate-900">${formatNumber(quiz.total_attempts)}</div>
        </div>
        <div class="rounded-2xl bg-slate-50 p-3">
          <div class="text-xs font-semibold uppercase tracking-wide text-slate-500">Timer</div>
          <div class="mt-1 text-lg font-bold text-slate-900">${formatDuration(quiz.time_limit_seconds)}</div>
        </div>
        <div class="rounded-2xl bg-slate-50 p-3">
          <div class="text-xs font-semibold uppercase tracking-wide text-slate-500">Avg score</div>
          <div class="mt-1 text-lg font-bold text-slate-900">${quiz.average_score ? `${Number(quiz.average_score).toFixed(1)}%` : '—'}</div>
        </div>
      </div>
      <footer class="mt-6 flex items-center justify-between">
        <button type="button" class="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-cyan-600 hover:text-cyan-700" data-role="manage-quiz">
          Manage
        </button>
        <button type="button" class="inline-flex items-center gap-2 rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50" data-role="delete-quiz">
          Delete
        </button>
      </footer>
    </article>
  `;
}

function buildQuestionList({ items, selectedIds }) {
  if (!items.length) {
    return '<p class="py-6 text-center text-sm text-slate-500">No questions match your current filters.</p>';
  }

  return `
    <ul class="divide-y divide-slate-200">
      ${items
        .map((item, index) => {
          const isSelected = selectedIds.has(item.id);
          return `
            <li class="flex flex-col gap-3 py-4 md:flex-row md:items-start md:justify-between" data-question-id="${item.id}">
              <div class="flex w-full items-start gap-3 md:flex-1">
                <div class="pt-1">
                  <input
                    type="checkbox"
                    value="${item.id}"
                    ${isSelected ? 'checked' : ''}
                    class="mt-0.5 h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                    data-role="question-select"
                    aria-label="Select question ${index + 1}"
                  />
                </div>
                <div class="flex-1 text-sm text-slate-700">
                  <p class="font-semibold text-slate-900">Q${index + 1}. ${escapeHtml(item.prompt)}</p>
                  ${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="Question visual" class="mt-2 max-h-32 rounded-lg border border-slate-200 object-contain" />` : ''}
                  <p class="mt-2 text-xs uppercase tracking-wide text-slate-500">
                    Correct: <span class="font-semibold text-emerald-600">${escapeHtml(item.correct_option)}</span>
                  </p>
                </div>
              </div>
              <div class="flex items-center justify-between gap-2 md:flex-col md:items-end">
                <span class="text-xs text-slate-400">ID: ${escapeHtml(item.id.slice(0, 8))}</span>
                <button
                  type="button"
                  class="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                  data-role="remove-question"
                >
                  Remove
                </button>
              </div>
            </li>
          `;
        })
        .join('')}
    </ul>
  `;
}

function buildTopicOptions(topics) {
  return topics
    .map(
      (topic) =>
        `<option value="${escapeHtml(topic.id)}">${escapeHtml(topic.department_name || '')}${topic.department_name ? ' • ' : ''}${escapeHtml(topic.course_name || '')} — ${escapeHtml(topic.name)}</option>`
    )
    .join('');
}

function serializeOptions(form) {
  const entries = [];
  form.querySelectorAll('[data-option-row]').forEach((row) => {
    const label = row.querySelector('[data-option-label]')?.value?.trim();
    const content = row.querySelector('[data-option-content]')?.value?.trim();
    if (!label || !content) return;
    entries.push({
      id: label,
      label,
      content,
    });
  });
  const correct = form.querySelector('input[name="correctOption"]:checked')?.value;
  if (!correct) {
    throw new Error('Select the correct option before saving.');
  }
  if (entries.length < 2) {
    throw new Error('Provide at least two answer options.');
  }
  if (!entries.some((opt) => opt.id === correct)) {
    throw new Error('Correct option no longer matches the provided answers.');
  }
  return { entries, correct };
}

function renderOptionRow(letter) {
  return `
    <div class="flex items-start gap-3" data-option-row>
      <div class="mt-2 text-sm font-semibold text-slate-500">${letter}.</div>
      <div class="flex-1 space-y-2">
        <input type="hidden" data-option-label value="${letter}" />
        <textarea rows="2" data-option-content class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Answer option"></textarea>
        <label class="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
          <input type="radio" name="correctOption" value="${letter}" />
          Correct answer
        </label>
      </div>
    </div>
  `;
}

function openCreateQuizModal(actions) {
  openModal({
    title: 'Create Free Quiz',
    render: ({ body, footer, close }) => {
      body.innerHTML = `
        <form id="free-quiz-form" class="space-y-4">
          <label class="block text-sm font-medium text-slate-700">
            <span>Title</span>
            <input type="text" name="title" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" placeholder="Free Nursing Mock" required />
          </label>
          <label class="block text-sm font-medium text-slate-700">
            <span>Description</span>
            <textarea name="description" rows="2" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" placeholder="Short summary shown to learners"></textarea>
          </label>
          <label class="block text-sm font-medium text-slate-700">
            <span>Intro Message</span>
            <textarea name="intro" rows="3" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" placeholder="Displayed on the instruction modal"></textarea>
          </label>
          <label class="block text-sm font-medium text-slate-700">
            <span>Timer (minutes)</span>
            <input type="number" name="time_limit" min="0" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" placeholder="e.g. 20" />
            <p class="mt-1 text-xs text-slate-500">Leave blank for no time limit.</p>
          </label>
          <label class="inline-flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="is_active" checked />
            Make quiz visible to learners immediately
          </label>
        </form>
      `;
      footer.innerHTML = `
        <button type="button" class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600" data-role="cancel">Cancel</button>
        <button type="button" class="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white" data-role="create">Create Quiz</button>
      `;

      footer.querySelector('[data-role="cancel"]').addEventListener('click', close);
      footer.querySelector('[data-role="create"]').addEventListener('click', async () => {
        const form = body.querySelector('#free-quiz-form');
        const formData = new FormData(form);
        const title = formData.get('title').trim();
        if (!title) {
          showToast('Title is required.', { type: 'error' });
          return;
        }
        const payload = {
          title,
          description: formData.get('description').trim(),
          intro: formData.get('intro').trim(),
          time_limit_seconds: formData.get('time_limit')
            ? Number(formData.get('time_limit')) * 60
            : null,
          is_active: formData.get('is_active') === 'on',
        };
        try {
          await dataService.createFreeQuiz(payload);
          showToast('Free quiz created.', { type: 'success' });
          close();
          actions.refresh();
        } catch (error) {
          console.error(error);
          showToast(error.message || 'Unable to create free quiz.', {
            type: 'error',
          });
        }
      });
    },
  });
}

async function openManageQuizModal(quiz, topics, actions) {
  try {
    const detail = await dataService.getFreeQuizDetail(quiz.id);
    const currentQuiz = detail.quiz;
    let questions = detail.questions || [];
    let selectedQuestionIds = new Set();
    let questionSearchTerm = '';

    openModal({
      title: `Manage · ${escapeHtml(currentQuiz.title)}`,
      size: 'xl',
      render: ({ body, footer, close }) => {
        body.innerHTML = `
          <div class="space-y-6">
            <section class="space-y-4">
              <header class="flex flex-col gap-2">
                <h3 class="text-lg font-semibold text-slate-900">Quiz Settings</h3>
                <p class="text-sm text-slate-600">Update learner-facing details and timer.</p>
              </header>
              <form id="quiz-settings-form" class="grid grid-cols-1 gap-4">
                <label class="text-sm font-medium text-slate-700">
                  <span>Title</span>
                  <input type="text" name="title" value="${escapeHtml(currentQuiz.title)}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" required />
                </label>
                <label class="text-sm font-medium text-slate-700">
                  <span>Description</span>
                  <textarea name="description" rows="2" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2">${escapeHtml(currentQuiz.description || '')}</textarea>
                </label>
                <label class="text-sm font-medium text-slate-700">
                  <span>Intro Message (shown before learners start)</span>
                  <textarea name="intro" rows="3" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2">${escapeHtml(currentQuiz.intro || '')}</textarea>
                </label>
                <label class="text-sm font-medium text-slate-700">
                  <span>Timer (minutes)</span>
                  <input type="number" min="0" name="time_limit" value="${currentQuiz.time_limit_seconds ? Math.round(currentQuiz.time_limit_seconds / 60) : ''}" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
                  <p class="mt-1 text-xs text-slate-500">Leave empty for no timer.</p>
                </label>
                <label class="inline-flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" name="is_active" ${currentQuiz.is_active ? 'checked' : ''} />
                  Quiz is visible to learners
                </label>
              </form>
            </section>

            <section class="space-y-4">
              <header class="flex flex-col gap-2">
                <div class="flex items-center justify-between">
                  <div>
                    <h3 class="text-lg font-semibold text-slate-900">Questions</h3>
                    <p class="text-sm text-slate-600">Add questions manually, from the bank, or via upload.</p>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <button type="button" class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-cyan-600" data-role="add-manual-question">Add question</button>
                    <button type="button" class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-cyan-600" data-role="import-from-bank">From question bank</button>
                    <button type="button" class="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-cyan-600" data-role="import-from-file">Upload file</button>
                  </div>
                </div>
              </header>
              <div class="space-y-3 rounded-2xl border border-slate-100 bg-white/60 p-4">
                <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div class="relative w-full md:w-80">
                    <input
                      type="search"
                      data-role="question-search"
                      placeholder="Search question text, answer, or ID"
                      class="w-full rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700 placeholder-slate-400 focus:border-cyan-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-100"
                      aria-label="Search questions in this quiz"
                    />
                    <span class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">
                      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M5 11a6 6 0 1012 0 6 6 0 00-12 0z" />
                      </svg>
                    </span>
                  </div>
                  <div class="flex flex-wrap items-center gap-2 text-xs">
                    <button
                      type="button"
                      data-role="select-all-questions"
                      class="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-600 hover:border-cyan-500 hover:text-cyan-700"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      data-role="clear-selected-questions"
                      class="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-600 hover:border-slate-300"
                    >
                      Clear selection
                    </button>
                    <button
                      type="button"
                      data-role="delete-selected-questions"
                      class="inline-flex items-center rounded-full border border-red-200 px-3 py-1 font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                      disabled
                    >
                      Delete selected
                    </button>
                  </div>
                </div>
                <p data-role="selection-summary" class="text-xs text-slate-500"></p>
              </div>
              <div data-role="question-list" class="rounded-2xl border border-slate-200 bg-slate-50/60"></div>
            </section>
          </div>
        `;

        footer.innerHTML = `
          <button type="button" class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600" data-role="close">Close</button>
          <button type="button" class="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white" data-role="save-settings">Save changes</button>
        `;

        footer.querySelector('[data-role="close"]').addEventListener('click', close);

        footer.querySelector('[data-role="save-settings"]').addEventListener('click', async () => {
          const form = body.querySelector('#quiz-settings-form');
          const formData = new FormData(form);
          const payload = {
            title: formData.get('title').trim(),
            description: formData.get('description').trim(),
            intro: formData.get('intro').trim(),
            time_limit_seconds: formData.get('time_limit')
              ? Number(formData.get('time_limit')) * 60
              : null,
            is_active: formData.get('is_active') === 'on',
          };
          try {
            await dataService.updateFreeQuiz(currentQuiz.id, payload);
            showToast('Quiz updated.', { type: 'success' });
            actions.refresh();
          } catch (error) {
            console.error(error);
            showToast(error.message || 'Unable to update quiz.', { type: 'error' });
          }
        });

        const questionListContainer = body.querySelector('[data-role="question-list"]');
        const questionSearchInput = body.querySelector('[data-role="question-search"]');
        const selectAllBtn = body.querySelector('[data-role="select-all-questions"]');
        const clearSelectionBtn = body.querySelector('[data-role="clear-selected-questions"]');
        const bulkDeleteBtn = body.querySelector('[data-role="delete-selected-questions"]');
        const selectionSummaryEl = body.querySelector('[data-role="selection-summary"]');

        const ensureValidSelections = () => {
          selectedQuestionIds = new Set(
            [...selectedQuestionIds].filter((id) => questions.some((question) => question.id === id)),
          );
        };

        const getFilteredQuestions = () => {
          const term = (questionSearchTerm || '').trim().toLowerCase();
          if (!term) {
            return [...questions];
          }
          return questions.filter((item) => {
            const haystack = [item.prompt, item.explanation, item.correct_option, item.id]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();
            return haystack.includes(term);
          });
        };

        const updateSelectionUI = (filtered = getFilteredQuestions()) => {
          if (!selectionSummaryEl || !bulkDeleteBtn || !clearSelectionBtn || !selectAllBtn) {
            return;
          }

          const totalQuestions = questions.length;
          const selectedCount = selectedQuestionIds.size;
          const selectedInView = filtered.filter((item) => selectedQuestionIds.has(item.id)).length;
          const searchTerm = (questionSearchTerm || '').trim();

          let summary = '';
          if (!totalQuestions) {
            summary = 'No questions added yet.';
          } else if (searchTerm && filtered.length === 0) {
            summary = `No questions match “${escapeHtml(searchTerm)}”.`;
          } else {
            summary = `${filtered.length} of ${totalQuestions} question${totalQuestions === 1 ? '' : 's'} shown.`;
            if (selectedCount > 0) {
              summary += ` ${selectedCount} selected${selectedInView !== selectedCount ? ` (${selectedInView} in view)` : ''}.`;
            }
          }

          selectionSummaryEl.innerHTML = summary;

          bulkDeleteBtn.disabled = selectedCount === 0;
          clearSelectionBtn.disabled = selectedCount === 0;
          selectAllBtn.disabled = filtered.length === 0;

          const allInViewSelected = filtered.length > 0 && filtered.every((item) => selectedQuestionIds.has(item.id));
          selectAllBtn.textContent = allInViewSelected ? 'Unselect all' : 'Select all';
        };

        const renderQuestions = () => {
          ensureValidSelections();
          const filtered = getFilteredQuestions();

          if (!questions.length) {
            questionListContainer.innerHTML = '<p class="py-6 text-center text-sm text-slate-500">No questions added yet.</p>';
            updateSelectionUI(filtered);
            return;
          }

          questionListContainer.innerHTML = buildQuestionList({
            items: filtered,
            selectedIds: selectedQuestionIds,
          });

          questionListContainer.querySelectorAll('[data-role="remove-question"]').forEach((button) => {
            button.addEventListener('click', async (event) => {
              const questionId = event.currentTarget.closest('[data-question-id]')?.dataset?.questionId;
              if (!questionId) return;
              if (!window.confirm('Remove this question from the free quiz?')) return;
              try {
                await dataService.deleteFreeQuizQuestion(questionId);
                questions = questions.filter((item) => item.id !== questionId);
                selectedQuestionIds.delete(questionId);
                renderQuestions();
                actions.refresh();
                showToast('Question removed.', { type: 'success' });
              } catch (error) {
                console.error(error);
                showToast(error.message || 'Unable to remove question.', { type: 'error' });
              }
            });
          });

          questionListContainer.querySelectorAll('[data-role="question-select"]').forEach((checkbox) => {
            checkbox.addEventListener('change', (event) => {
              const value = event.currentTarget.value;
              if (!value) return;
              if (event.currentTarget.checked) {
                selectedQuestionIds.add(value);
              } else {
                selectedQuestionIds.delete(value);
              }
              updateSelectionUI();
            });
          });

          updateSelectionUI(filtered);
        };

        renderQuestions();

        questionSearchInput?.addEventListener('input', (event) => {
          questionSearchTerm = event.target.value || '';
          renderQuestions();
        });

        selectAllBtn?.addEventListener('click', () => {
          const filtered = getFilteredQuestions();
          if (!filtered.length) return;
          const allSelected = filtered.every((item) => selectedQuestionIds.has(item.id));
          if (allSelected) {
            filtered.forEach((item) => selectedQuestionIds.delete(item.id));
          } else {
            filtered.forEach((item) => selectedQuestionIds.add(item.id));
          }
          renderQuestions();
        });

        clearSelectionBtn?.addEventListener('click', () => {
          if (!selectedQuestionIds.size) return;
          selectedQuestionIds.clear();
          renderQuestions();
        });

        bulkDeleteBtn?.addEventListener('click', async () => {
          const ids = Array.from(selectedQuestionIds);
          if (!ids.length) return;
          if (!window.confirm(`Delete ${ids.length} selected question${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) {
            return;
          }

          const previousLabel = bulkDeleteBtn.textContent;
          bulkDeleteBtn.disabled = true;
          bulkDeleteBtn.textContent = 'Deleting…';

          try {
            for (const id of ids) {
              await dataService.deleteFreeQuizQuestion(id);
              questions = questions.filter((item) => item.id !== id);
            }
            selectedQuestionIds.clear();
            renderQuestions();
            actions.refresh();
            showToast(`Deleted ${ids.length} question${ids.length === 1 ? '' : 's'}.`, {
              type: 'success',
            });
          } catch (error) {
            console.error(error);
            showToast(error.message || 'Unable to delete selected questions.', {
              type: 'error',
            });
          } finally {
            bulkDeleteBtn.textContent = previousLabel;
            bulkDeleteBtn.disabled = selectedQuestionIds.size === 0;
          }
        });

        body.querySelector('[data-role="add-manual-question"]').addEventListener('click', () => {
          openModal({
            title: 'Add Question',
            size: 'lg',
            render: ({ body: qBody, footer: qFooter, close: closeQuestionModal }) => {
              qBody.innerHTML = `
                <form id="manual-question-form" class="space-y-4">
                  <label class="text-sm font-medium text-slate-700">
                    <span>Question prompt</span>
                    <textarea name="prompt" rows="4" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" required></textarea>
                  </label>
                  <label class="text-sm font-medium text-slate-700">
                    <span>Explanation (optional)</span>
                    <textarea name="explanation" rows="3" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"></textarea>
                  </label>
                  <label class="text-sm font-medium text-slate-700">
                    <span>Illustration (optional)</span>
                    <input type="file" name="image" accept="image/*" class="mt-1 block w-full text-sm text-slate-500" />
                    <p class="mt-1 text-xs text-slate-500">PNG, JPG, or GIF. Max 2MB.</p>
                  </label>
                  <div class="space-y-3" data-role="options-wrapper">
                    ${['A', 'B', 'C', 'D'].map((letter) => renderOptionRow(letter)).join('')}
                  </div>
                </form>
              `;
              qFooter.innerHTML = `
                <button type="button" class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600" data-role="cancel">Cancel</button>
                <button type="button" class="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white" data-role="save">Add question</button>
              `;
              qFooter.querySelector('[data-role="cancel"]').addEventListener('click', closeQuestionModal);
              qFooter.querySelector('[data-role="save"]').addEventListener('click', async () => {
                const form = qBody.querySelector('#manual-question-form');
                const formData = new FormData(form);
                const prompt = formData.get('prompt').trim();
                if (!prompt) {
                  showToast('Question prompt is required.', { type: 'error' });
                  return;
                }
                try {
                  const { entries, correct } = serializeOptions(form);
                  const imageFile = formData.get('image');
                  await dataService.createFreeQuizQuestion({
                    quizId: currentQuiz.id,
                    prompt,
                    explanation: formData.get('explanation').trim(),
                    imageFile: imageFile && imageFile.size ? imageFile : null,
                    options: entries,
                    correctOption: correct,
                  });
                  showToast('Question added.', { type: 'success' });
                  const refreshed = await dataService.getFreeQuizDetail(currentQuiz.id);
                  questions = refreshed.questions || [];
                  selectedQuestionIds = new Set();
                  questionSearchTerm = '';
                  if (questionSearchInput) {
                    questionSearchInput.value = '';
                  }
                  renderQuestions();
                  actions.refresh();
                  closeQuestionModal();
                } catch (error) {
                  console.error(error);
                  showToast(error.message || 'Unable to add question.', { type: 'error' });
                }
              });
            },
          });
        });

        body.querySelector('[data-role="import-from-bank"]').addEventListener('click', () => {
          openModal({
            title: 'Add from question bank',
            size: 'lg',
            render: ({ body: bankBody, footer: bankFooter, close: closeBankModal }) => {
              bankBody.innerHTML = `
                <form class="space-y-4">
                  <label class="text-sm font-medium text-slate-700">
                    <span>Select topic</span>
                    <select name="topic" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2">
                      <option value="">Choose a topic</option>
                      ${buildTopicOptions(topics)}
                    </select>
                  </label>
                  <div data-role="question-list" class="max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50"></div>
                </form>
              `;
              bankFooter.innerHTML = `
                <button type="button" class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600" data-role="close">Close</button>
              `;
              bankFooter.querySelector('[data-role="close"]').addEventListener('click', closeBankModal);

              const topicSelect = bankBody.querySelector('select[name="topic"]');
              const questionList = bankBody.querySelector('[data-role="question-list"]');

              const renderBankQuestions = (items) => {
                if (!items.length) {
                  questionList.innerHTML = '<p class="py-6 text-center text-sm text-slate-500">No questions yet for this topic.</p>';
                  return;
                }
                questionList.innerHTML = `
                  <ul class="divide-y divide-slate-200">
                    ${items
                      .map(
                        (item) => `
                          <li class="p-4 space-y-2" data-bank-question-id="${item.id}">
                            <p class="text-sm font-semibold text-slate-900">${escapeHtml(item.stem)}</p>
                            <button type="button" class="mt-2 inline-flex items-center rounded-full border border-cyan-200 px-3 py-1 text-xs font-semibold text-cyan-700 hover:bg-cyan-50" data-role="add-from-bank">Add to quiz</button>
                          </li>
                        `
                      )
                      .join('')}
                  </ul>
                `;
                questionList.querySelectorAll('[data-role="add-from-bank"]').forEach((button) => {
                  button.addEventListener('click', async (event) => {
                    const questionId = event.currentTarget.closest('[data-bank-question-id]')?.dataset?.bankQuestionId;
                    if (!questionId) return;
                    try {
                      await dataService.importFreeQuizQuestionFromBank({
                        quizId: currentQuiz.id,
                        questionId,
                      });
                      showToast('Question added from bank.', { type: 'success' });
                      const refreshed = await dataService.getFreeQuizDetail(currentQuiz.id);
                      questions = refreshed.questions || [];
                      selectedQuestionIds = new Set();
                      questionSearchTerm = '';
                      if (questionSearchInput) {
                        questionSearchInput.value = '';
                      }
                      renderQuestions();
                      actions.refresh();
                    } catch (error) {
                      console.error(error);
                      showToast(error.message || 'Unable to add question from bank.', { type: 'error' });
                    }
                  });
                });
              };

              topicSelect.addEventListener('change', async (event) => {
                const topicId = event.target.value;
                if (!topicId) {
                  questionList.innerHTML = '';
                  return;
                }
                try {
                  const questionsFromTopic = await dataService.listQuestions(topicId);
                  renderBankQuestions(questionsFromTopic);
                } catch (error) {
                  console.error(error);
                  showToast(error.message || 'Unable to fetch questions for topic.', { type: 'error' });
                }
              });
            },
          });
        });

        body.querySelector('[data-role="import-from-file"]').addEventListener('click', () => {
          openModal({
            title: 'Upload questions',
            render: ({ body: uploadBody, footer: uploadFooter, close: closeUploadModal }) => {
              uploadBody.innerHTML = `
                <form id="upload-form" class="space-y-4">
                  <p class="text-sm text-slate-600">Upload questions in AIKEN format (.txt) to append them to this free quiz.</p>
                  <input type="file" name="file" accept=".txt,.aiken" class="w-full rounded-lg border border-slate-200 px-3 py-2" required />
                </form>
              `;
              uploadFooter.innerHTML = `
                <button type="button" class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600" data-role="cancel">Cancel</button>
                <button type="button" class="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white" data-role="import">Import</button>
              `;
              uploadFooter.querySelector('[data-role="cancel"]').addEventListener('click', closeUploadModal);
              uploadFooter.querySelector('[data-role="import"]').addEventListener('click', async () => {
                const form = uploadBody.querySelector('#upload-form');
                const file = form.file.files?.[0];
                if (!file) {
                  showToast('Select a file to continue.', { type: 'error' });
                  return;
                }
                try {
                  const result = await dataService.importFreeQuizQuestionsFromAiken({
                    quizId: currentQuiz.id,
                    file,
                  });
                  const inserted = Number(result?.insertedCount ?? 0);
                  const skipped = Number(result?.skippedCount ?? 0);
                  const toastType = skipped ? 'warning' : 'success';
                  const toastMessage = skipped
                    ? `${inserted} question${inserted === 1 ? '' : 's'} added • ${skipped} skipped`
                    : `${inserted} question${inserted === 1 ? '' : 's'} added to the quiz.`;
                  showToast(toastMessage, { type: toastType });
                  if (skipped && Array.isArray(result?.parseErrors) && result.parseErrors.length) {
                    const firstIssue = result.parseErrors[0];
                    const detail = firstIssue?.message
                      ? `First issue: ${firstIssue.message}`
                      : 'Skipped items had formatting issues. Fix them and retry.';
                    showToast(detail, { type: 'info' });
                  }
                  const refreshed = await dataService.getFreeQuizDetail(currentQuiz.id);
                  questions = refreshed.questions || [];
                  selectedQuestionIds = new Set();
                  questionSearchTerm = '';
                  if (questionSearchInput) {
                    questionSearchInput.value = '';
                  }
                  renderQuestions();
                  actions.refresh();
                  closeUploadModal();
                } catch (error) {
                  console.error(error);
                  showToast(error.message || 'Unable to import questions.', { type: 'error' });
                }
              });
            },
          });
        });
      },
    });
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Unable to open quiz manager.', { type: 'error' });
  }
}

export async function freeQuizzesView(state, actions) {
  const [quizzes, topics] = await Promise.all([
    dataService.listFreeQuizzes(),
    dataService.listAllTopics(),
  ]);

  const cards = quizzes.length
    ? quizzes.map((quiz) => buildQuizCard(quiz)).join('')
    : '<p class="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">No free quizzes created yet.</p>';

  return {
    html: `
      <section class="space-y-8">
        <header class="flex flex-col gap-4 rounded-3xl bg-white p-8 shadow-sm shadow-slate-200/60 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 class="text-3xl font-bold text-slate-900">Free Quiz Playground</h1>
            <p class="mt-2 text-sm text-slate-600">
              Craft a taste of the Academic Nightingale experience. Promote it across campaigns and convert free learners into subscribers.
            </p>
          </div>
          <div class="flex flex-col gap-3 sm:flex-row">
            <button type="button" class="inline-flex items-center justify-center rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-600 hover:border-slate-400" data-role="refresh">
              Refresh
            </button>
            <button type="button" class="inline-flex items-center justify-center rounded-full bg-cyan-600 px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-cyan-600/30 transition hover:bg-cyan-700" data-role="create-quiz">
              Create Free Quiz
            </button>
          </div>
        </header>

        <section class="grid grid-cols-1 gap-6 lg:grid-cols-2" data-role="quiz-grid">
          ${cards}
        </section>
      </section>
    `,
    onMount(container) {
      const refresh = () => actions.refresh();
      container.querySelector('[data-role="refresh"]').addEventListener('click', refresh);
      container.querySelector('[data-role="create-quiz"]').addEventListener('click', () => {
        openCreateQuizModal(actions);
      });
      container.querySelectorAll('[data-quiz-id]').forEach((card) => {
        const quizId = card.dataset.quizId;
        const quiz = quizzes.find((item) => item.id === quizId);
        if (!quiz) return;
        card.querySelector('[data-role="manage-quiz"]').addEventListener('click', () => {
          openManageQuizModal(quiz, topics, actions);
        });
        card.querySelector('[data-role="delete-quiz"]').addEventListener('click', async () => {
          if (!window.confirm('Delete this free quiz? This cannot be undone.')) return;
          try {
            await dataService.deleteFreeQuiz(quiz.id);
            showToast('Free quiz removed.', { type: 'success' });
            actions.refresh();
          } catch (error) {
            console.error(error);
            showToast(error.message || 'Unable to delete quiz.', { type: 'error' });
          }
        });
      });
    },
  };
}

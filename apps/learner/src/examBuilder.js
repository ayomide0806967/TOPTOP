import {
  quizBuilderService,
  QuizBuilderServiceError,
} from '../admin/src/services/quizBuilderService.js';
import { showToast } from '../admin/src/components/toast.js';

class ExamBuilder {
  constructor() {
    this.state = {
      blueprint: null,
      questions: [],
      loading: false,
      hasUnsavedChanges: false,
      currentQuestionId: null,
    };
    this.init();
  }

  init() {
    this.loadBlueprint();
    this.bindEvents();
    this.setupAutoSave();
  }

  getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  async loadBlueprint() {
    const blueprintId = this.getQueryParam('blueprint');
    if (!blueprintId) {
      showToast('Missing blueprint ID. Redirecting...', { type: 'error' });
      setTimeout(() => {
        window.location.href = '../admin/dashboard.html';
      }, 2000);
      return;
    }

    this.setLoading(true);
    try {
      const blueprint = await quizBuilderService.getBlueprintDetail(blueprintId);
      this.state.blueprint = blueprint;
      this.state.questions = await quizBuilderService.getBlueprintQuestions(blueprintId);
      this.renderBlueprint();
      this.renderQuestions();
      this.updateStats();
    } catch (error) {
      console.error('[ExamBuilder] Failed to load blueprint', error);
      showToast(
        error.message || 'Unable to load quiz blueprint. Please try again.',
        { type: 'error' }
      );
      setTimeout(() => {
        window.location.href = '../admin/dashboard.html';
      }, 3000);
    } finally {
      this.setLoading(false);
    }
  }

  bindEvents() {
    // Header buttons
    document.getElementById('save-quiz-btn')?.addEventListener('click', () => this.saveBlueprint());
    document.getElementById('publish-quiz-btn')?.addEventListener('click', () => this.publishBlueprint());
    document.getElementById('preview-quiz-btn')?.addEventListener('click', () => this.previewQuiz());

    // Export functionality
    document.getElementById('export-quiz-btn')?.addEventListener('click', () => this.exportQuiz());

    // Question management
    document.getElementById('add-question-btn')?.addEventListener('click', () => this.openQuestionModal());
    document.getElementById('close-question-modal')?.addEventListener('click', () => this.closeQuestionModal());
    document.getElementById('cancel-question-btn')?.addEventListener('click', () => this.closeQuestionModal());
    document.getElementById('question-form')?.addEventListener('submit', (e) => this.handleQuestionSubmit(e));

    // Question type changes
    document.getElementById('question-type')?.addEventListener('change', (e) => this.handleQuestionTypeChange(e));

    // Multiple choice options
    document.getElementById('add-option-btn')?.addEventListener('click', () => this.addMultipleChoiceOption());

    // Blueprint info changes
    document.getElementById('blueprint-title')?.addEventListener('input', () => this.markAsChanged());
    document.getElementById('blueprint-description')?.addEventListener('input', () => this.markAsChanged());

    // Quiz settings
    document.querySelectorAll('#quiz-settings input, #quiz-settings select').forEach(input => {
      input.addEventListener('change', () => this.markAsChanged());
    });

    // Bulk actions
    document.getElementById('bulk-actions')?.addEventListener('change', (e) => this.handleBulkAction(e));

    // Import questions
    document.getElementById('import-questions-btn')?.addEventListener('click', () => this.importQuestions());

    // Media upload
    document.getElementById('add-media-btn')?.addEventListener('click', () => this.openMediaUpload());

    // Modal backdrop click
    document.getElementById('question-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'question-modal') {
        this.closeQuestionModal();
      }
    });

    // Prevent accidental navigation
    window.addEventListener('beforeunload', (e) => {
      if (this.state.hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  setupAutoSave() {
    setInterval(() => {
      if (this.state.hasUnsavedChanges) {
        this.saveBlueprint(false);
      }
    }, 30000); // Auto-save every 30 seconds
  }

  renderBlueprint() {
    const { blueprint } = this.state;
    if (!blueprint) return;

    document.title = `${blueprint.title || 'Untitled Quiz'} | Quiz Builder | Academic Nightingale`;
    document.getElementById('blueprint-title').value = blueprint.title || '';
    document.getElementById('blueprint-description').value = blueprint.description || '';

    const statusEl = document.getElementById('blueprint-status');
    if (statusEl) {
      statusEl.textContent = blueprint.status || 'Draft';
      statusEl.className = `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        blueprint.status === 'published'
          ? 'bg-emerald-100 text-emerald-700'
          : blueprint.status === 'archived'
            ? 'bg-slate-200 text-slate-500'
            : 'bg-amber-100 text-amber-700'
      }`;
    }

    // Load settings
    const settings = blueprint.settings || {};
    document.getElementById('time-limit').value = settings.timeLimit || '';
    document.getElementById('shuffle-questions').checked = settings.shuffleQuestions || false;
    document.getElementById('show-results').checked = settings.showResults !== false;
    document.getElementById('allow-review').checked = settings.allowReview !== false;
    document.getElementById('max-attempts').value = settings.maxAttempts || '';
    document.getElementById('passing-score').value = settings.passingScore || '';
  }

  renderQuestions() {
    const container = document.getElementById('question-list');
    if (!container) return;

    if (this.state.questions.length === 0) {
      container.innerHTML = `
        <div class="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-500 shadow-sm">
          <svg class="mx-auto h-12 w-12 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6v12m6-6H6" />
          </svg>
          <h3 class="mt-4 text-lg font-medium text-slate-900">No questions yet</h3>
          <p class="mt-2">Get started by adding your first question to the quiz.</p>
          <button
            class="mt-4 inline-flex items-center gap-2 rounded-full bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            onclick="document.getElementById('add-question-btn').click()"
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6v12m6-6H6" />
            </svg>
            Add first question
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = this.state.questions.map((question, index) => this.renderQuestionCard(question, index)).join('');
  }

  renderQuestionCard(question, index) {
    const typeIcons = {
      multiple_choice: '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>',
      true_false: '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>',
      short_answer: '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>',
      essay: '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>',
      fill_blank: '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>',
      matching: '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>'
    };

    const typeLabels = {
      multiple_choice: 'Multiple Choice',
      true_false: 'True/False',
      short_answer: 'Short Answer',
      essay: 'Essay',
      fill_blank: 'Fill in the Blank',
      matching: 'Matching'
    };

    return `
      <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div class="flex items-start gap-4">
          <div class="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 text-slate-600 font-medium text-sm">
            ${index + 1}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-start justify-between gap-3">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-2">
                  ${typeIcons[question.type] || typeIcons.multiple_choice}
                  <span class="text-xs font-medium text-slate-500">${typeLabels[question.type] || 'Unknown'}</span>
                  <span class="text-xs text-slate-400">• ${question.points || 1} point${question.points !== 1 ? 's' : ''}</span>
                  ${question.timeLimit ? `<span class="text-xs text-slate-400">• ${question.timeLimit}s</span>` : ''}
                </div>
                <p class="text-sm font-medium text-slate-900 line-clamp-2">${question.text || 'No question text'}</p>
                ${question.explanation ? `<p class="mt-2 text-xs text-slate-500 line-clamp-2">${question.explanation}</p>` : ''}
              </div>
              <div class="flex items-center gap-1">
                <button
                  type="button"
                  class="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  onclick="examBuilder.editQuestion('${question.id}')"
                  title="Edit question"
                >
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  type="button"
                  class="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  onclick="examBuilder.duplicateQuestion('${question.id}')"
                  title="Duplicate question"
                >
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
                <button
                  type="button"
                  class="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  onclick="examBuilder.deleteQuestion('${question.id}')"
                  title="Delete question"
                >
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  updateStats() {
    const questionCount = this.state.questions.length;
    const totalPoints = this.state.questions.reduce((sum, q) => sum + (q.points || 1), 0);
    const totalSeconds = this.state.questions.reduce((sum, q) => sum + (q.timeLimit || 0), 0);
    const estimatedMinutes = Math.ceil(totalSeconds / 60) || (questionCount * 2);

    document.getElementById('question-count').textContent = questionCount;
    document.getElementById('total-points').textContent = totalPoints;
    document.getElementById('estimated-duration').textContent = `${estimatedMinutes} mins`;
    document.getElementById('last-updated').textContent = 'Just now';
  }

  openQuestionModal(questionId = null) {
    this.state.currentQuestionId = questionId;
    const modal = document.getElementById('question-modal');
    const form = document.getElementById('question-form');

    if (questionId) {
      const question = this.state.questions.find(q => q.id === questionId);
      if (question) {
        this.populateQuestionForm(question);
        form.querySelector('h2').textContent = 'Edit Question';
      }
    } else {
      form.reset();
      form.querySelector('h2').textContent = 'Add Question';
      this.handleQuestionTypeChange({ target: { value: 'multiple_choice' } });
    }

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  closeQuestionModal() {
    const modal = document.getElementById('question-modal');
    modal.classList.add('hidden');
    document.body.style.overflow = '';
    this.state.currentQuestionId = null;
  }

  populateQuestionForm(question) {
    document.getElementById('question-type').value = question.type;
    document.getElementById('question-text').value = question.text || '';
    document.getElementById('question-points').value = question.points || 1;
    document.getElementById('question-time').value = question.timeLimit || '';
    document.getElementById('question-explanation').value = question.explanation || '';

    this.handleQuestionTypeChange({ target: { value: question.type } });

    // Populate answers based on question type
    if (question.type === 'multiple_choice' && question.options) {
      this.populateMultipleChoiceOptions(question.options, question.correctAnswer);
    } else if (question.type === 'true_false') {
      document.querySelector(`input[name="tf-answer"][value="${question.correctAnswer}"]`).checked = true;
    } else if (question.type === 'short_answer') {
      document.getElementById('correct-answer-text').value = question.correctAnswer || '';
    } else if (question.type === 'essay') {
      document.getElementById('essay-rubric').value = question.rubric || '';
    }
  }

  handleQuestionTypeChange(event) {
    const type = event.target.value;

    // Hide all option sections
    document.getElementById('multiple-choice-options').classList.add('hidden');
    document.getElementById('true-false-options').classList.add('hidden');
    document.getElementById('short-answer-options').classList.add('hidden');
    document.getElementById('essay-options').classList.add('hidden');

    // Show relevant section
    if (type === 'multiple_choice') {
      document.getElementById('multiple-choice-options').classList.remove('hidden');
      if (document.querySelectorAll('#options-list > div').length < 2) {
        this.addMultipleChoiceOption();
        this.addMultipleChoiceOption();
      }
    } else if (type === 'true_false') {
      document.getElementById('true-false-options').classList.remove('hidden');
    } else if (type === 'short_answer') {
      document.getElementById('short-answer-options').classList.remove('hidden');
    } else if (type === 'essay') {
      document.getElementById('essay-options').classList.remove('hidden');
    }
  }

  addMultipleChoiceOption() {
    const optionsList = document.getElementById('options-list');
    const optionIndex = optionsList.children.length;
    const optionLetter = String.fromCharCode(65 + optionIndex); // A, B, C, etc.

    const optionDiv = document.createElement('div');
    optionDiv.className = 'flex items-center gap-3';
    optionDiv.innerHTML = `
      <input type="radio" name="correct-answer" value="${optionIndex}" class="text-cyan-600 focus:border-cyan-500 focus:ring-cyan-400">
      <input type="text" placeholder="Option ${optionLetter}" class="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400" required>
      <button type="button" class="text-rose-500 hover:text-rose-700" onclick="examBuilder.removeMultipleChoiceOption(this)">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    `;

    optionsList.appendChild(optionDiv);
  }

  removeMultipleChoiceOption(button) {
    const optionDiv = button.closest('div');
    if (document.querySelectorAll('#options-list > div').length > 2) {
      optionDiv.remove();
      this.updateOptionLabels();
    }
  }

  updateOptionLabels() {
    const options = document.querySelectorAll('#options-list > div');
    options.forEach((option, index) => {
      const letter = String.fromCharCode(65 + index);
      const input = option.querySelector('input[type="text"]');
      if (input) {
        input.placeholder = `Option ${letter}`;
      }
      const radio = option.querySelector('input[type="radio"]');
      if (radio) {
        radio.value = index;
      }
    });
  }

  populateMultipleChoiceOptions(options, correctAnswer) {
    const optionsList = document.getElementById('options-list');
    optionsList.innerHTML = '';

    options.forEach((option, index) => {
      const letter = String.fromCharCode(65 + index);
      const optionDiv = document.createElement('div');
      optionDiv.className = 'flex items-center gap-3';
      optionDiv.innerHTML = `
        <input type="radio" name="correct-answer" value="${index}" ${index === correctAnswer ? 'checked' : ''} class="text-cyan-600 focus:border-cyan-500 focus:ring-cyan-400">
        <input type="text" placeholder="Option ${letter}" value="${option}" class="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400" required>
        <button type="button" class="text-rose-500 hover:text-rose-700" onclick="examBuilder.removeMultipleChoiceOption(this)">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      `;
      optionsList.appendChild(optionDiv);
    });
  }

  async handleQuestionSubmit(event) {
    event.preventDefault();

    const formData = new FormData(event.target);
    const questionType = formData.get('question-type');
    const questionData = {
      type: questionType,
      text: formData.get('question-text'),
      points: parseInt(formData.get('question-points')) || 1,
      timeLimit: parseInt(formData.get('question-time')) || null,
      explanation: formData.get('question-explanation') || null,
    };

    // Add type-specific data
    if (questionType === 'multiple_choice') {
      const options = Array.from(document.querySelectorAll('#options-list input[type="text"]')).map(input => input.value);
      const correctAnswer = parseInt(document.querySelector('input[name="correct-answer"]:checked')?.value);
      questionData.options = options;
      questionData.correctAnswer = correctAnswer;
    } else if (questionType === 'true_false') {
      questionData.correctAnswer = document.querySelector('input[name="tf-answer"]:checked')?.value === 'true';
    } else if (questionType === 'short_answer') {
      questionData.correctAnswer = document.getElementById('correct-answer-text').value;
    } else if (questionType === 'essay') {
      questionData.rubric = document.getElementById('essay-rubric').value;
    }

    try {
      if (this.state.currentQuestionId) {
        await quizBuilderService.updateQuestion(this.state.currentQuestionId, questionData);
        showToast('Question updated successfully.', { type: 'success' });
      } else {
        const newQuestion = await quizBuilderService.createQuestion(this.state.blueprint.id, questionData);
        this.state.questions.push(newQuestion);
        showToast('Question added successfully.', { type: 'success' });
      }

      await this.loadQuestions();
      this.closeQuestionModal();
      this.markAsChanged();
    } catch (error) {
      console.error('[ExamBuilder] Failed to save question', error);
      showToast(error.message || 'Failed to save question. Please try again.', { type: 'error' });
    }
  }

  async loadQuestions() {
    try {
      this.state.questions = await quizBuilderService.getBlueprintQuestions(this.state.blueprint.id);
      this.renderQuestions();
      this.updateStats();
    } catch (error) {
      console.error('[ExamBuilder] Failed to load questions', error);
    }
  }

  async editQuestion(questionId) {
    this.openQuestionModal(questionId);
  }

  async duplicateQuestion(questionId) {
    try {
      await quizBuilderService.duplicateQuestion(questionId);
      await this.loadQuestions();
      showToast('Question duplicated successfully.', { type: 'success' });
      this.markAsChanged();
    } catch (error) {
      console.error('[ExamBuilder] Failed to duplicate question', error);
      showToast(error.message || 'Failed to duplicate question.', { type: 'error' });
    }
  }

  async deleteQuestion(questionId) {
    if (!confirm('Are you sure you want to delete this question? This action cannot be undone.')) {
      return;
    }

    try {
      await quizBuilderService.deleteQuestion(questionId);
      await this.loadQuestions();
      showToast('Question deleted successfully.', { type: 'info' });
      this.markAsChanged();
    } catch (error) {
      console.error('[ExamBuilder] Failed to delete question', error);
      showToast(error.message || 'Failed to delete question.', { type: 'error' });
    }
  }

  async saveBlueprint(showMessage = true) {
    if (!this.state.blueprint) return;

    const settings = {
      timeLimit: parseInt(document.getElementById('time-limit').value) || null,
      shuffleQuestions: document.getElementById('shuffle-questions').checked,
      showResults: document.getElementById('show-results').checked,
      allowReview: document.getElementById('allow-review').checked,
      maxAttempts: parseInt(document.getElementById('max-attempts').value) || null,
      passingScore: parseInt(document.getElementById('passing-score').value) || null,
    };

    const blueprintData = {
      title: document.getElementById('blueprint-title').value || 'Untitled Quiz',
      description: document.getElementById('blueprint-description').value || '',
      settings,
    };

    try {
      await quizBuilderService.updateBlueprint(this.state.blueprint.id, blueprintData);
      this.state.blueprint = { ...this.state.blueprint, ...blueprintData };
      this.state.hasUnsavedChanges = false;

      if (showMessage) {
        showToast('Quiz saved successfully.', { type: 'success' });
      }
    } catch (error) {
      console.error('[ExamBuilder] Failed to save blueprint', error);
      showToast(error.message || 'Failed to save quiz. Please try again.', { type: 'error' });
    }
  }

  async publishBlueprint() {
    if (!this.state.blueprint) return;

    if (this.state.questions.length === 0) {
      showToast('Add at least one question before publishing.', { type: 'warning' });
      return;
    }

    if (!confirm('Are you sure you want to publish this quiz? Published quizzes can be used in classrooms and shared links.')) {
      return;
    }

    try {
      await this.saveBlueprint(false);
      await quizBuilderService.updateBlueprint(this.state.blueprint.id, { status: 'published' });
      this.state.blueprint.status = 'published';
      this.renderBlueprint();
      showToast('Quiz published successfully!', { type: 'success' });
    } catch (error) {
      console.error('[ExamBuilder] Failed to publish blueprint', error);
      showToast(error.message || 'Failed to publish quiz. Please try again.', { type: 'error' });
    }
  }

  previewQuiz() {
    if (this.state.questions.length === 0) {
      showToast('Add questions before previewing.', { type: 'warning' });
      return;
    }

    // Save first then open preview
    this.saveBlueprint(false).then(() => {
      const previewUrl = `exam-face.html?blueprint=${this.state.blueprint.id}&preview=true`;
      window.open(previewUrl, '_blank', 'noopener,width=1024,height=768');
    });
  }

  exportQuiz() {
    if (this.state.questions.length === 0) {
      showToast('Add questions before exporting.', { type: 'warning' });
      return;
    }

    const modal = document.createElement('div');
    modal.id = 'export-modal';
    modal.className = 'fixed inset-0 z-50 bg-black/40 px-4 pb-10 pt-24 backdrop-blur-sm sm:px-6 md:px-10';
    modal.innerHTML = `
      <div class="mx-auto max-w-lg rounded-2xl bg-white shadow-xl">
        <div class="flex flex-col">
          <div class="flex items-start justify-between gap-4 p-6 border-b border-slate-200">
            <div>
              <h2 class="text-xl font-semibold text-slate-900">Export Quiz</h2>
              <p class="text-sm text-slate-500 mt-1">Choose export format for your quiz</p>
            </div>
            <button type="button" class="close-export-modal rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
              <span class="sr-only">Close</span>
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="p-6 space-y-4">
            <div>
              <h3 class="text-sm font-medium text-slate-900 mb-3">Export Format</h3>
              <div class="space-y-2">
                <label class="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                  <input type="radio" name="export-format" value="json" checked class="text-cyan-600 focus:border-cyan-500 focus:ring-cyan-400">
                  <div>
                    <p class="text-sm font-medium text-slate-900">JSON</p>
                    <p class="text-xs text-slate-500">For importing into other quiz systems</p>
                  </div>
                </label>
                <label class="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                  <input type="radio" name="export-format" value="csv" class="text-cyan-600 focus:border-cyan-500 focus:ring-cyan-400">
                  <div>
                    <p class="text-sm font-medium text-slate-900">CSV</p>
                    <p class="text-xs text-slate-500">For spreadsheet applications</p>
                  </div>
                </label>
                <label class="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                  <input type="radio" name="export-format" value="pdf" class="text-cyan-600 focus:border-cyan-500 focus:ring-cyan-400">
                  <div>
                    <p class="text-sm font-medium text-slate-900">PDF</p>
                    <p class="text-xs text-slate-500">For printing and sharing</p>
                  </div>
                </label>
              </div>
            </div>

            <div>
              <h3 class="text-sm font-medium text-slate-900 mb-3">Export Options</h3>
              <div class="space-y-2">
                <label class="flex items-center gap-2">
                  <input type="checkbox" id="include-answers" checked class="rounded border-slate-300 text-cyan-600 focus:border-cyan-500 focus:ring-cyan-400">
                  <span class="text-sm text-slate-700">Include correct answers</span>
                </label>
                <label class="flex items-center gap-2">
                  <input type="checkbox" id="include-explanations" checked class="rounded border-slate-300 text-cyan-600 focus:border-cyan-500 focus:ring-cyan-400">
                  <span class="text-sm text-slate-700">Include explanations</span>
                </label>
                <label class="flex items-center gap-2">
                  <input type="checkbox" id="include-settings" checked class="rounded border-slate-300 text-cyan-600 focus:border-cyan-500 focus:ring-cyan-400">
                  <span class="text-sm text-slate-700">Include quiz settings</span>
                </label>
              </div>
            </div>
          </div>

          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end p-6 border-t border-slate-200">
            <button type="button" class="close-export-modal inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button type="button" id="process-export-btn" class="inline-flex items-center justify-center rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700">
              Export quiz
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    // Add event listeners
    modal.querySelector('.close-export-modal').addEventListener('click', () => this.closeExportModal());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.closeExportModal();
    });

    modal.querySelector('#process-export-btn').addEventListener('click', () => this.processExport());
  }

  closeExportModal() {
    const modal = document.getElementById('export-modal');
    if (modal) {
      modal.remove();
      document.body.style.overflow = '';
    }
  }

  async processExport() {
    const format = document.querySelector('input[name="export-format"]:checked').value;
    const includeAnswers = document.getElementById('include-answers').checked;
    const includeExplanations = document.getElementById('include-explanations').checked;
    const includeSettings = document.getElementById('include-settings').checked;

    try {
      const exportBtn = document.getElementById('process-export-btn');
      exportBtn.textContent = 'Exporting...';
      exportBtn.disabled = true;

      let content = '';
      let filename = '';
      let mimeType = '';

      if (format === 'json') {
        content = this.generateJSONExport(includeAnswers, includeExplanations, includeSettings);
        filename = `${this.state.blueprint.title || 'quiz'}-${new Date().toISOString().split('T')[0]}.json`;
        mimeType = 'application/json';
      } else if (format === 'csv') {
        content = this.generateCSVExport(includeAnswers, includeExplanations);
        filename = `${this.state.blueprint.title || 'quiz'}-${new Date().toISOString().split('T')[0]}.csv`;
        mimeType = 'text/csv';
      } else if (format === 'pdf') {
        // For PDF, we'd need a library like jsPDF
        showToast('PDF export coming soon! Please use JSON or CSV format.', { type: 'info' });
        return;
      }

      // Create download link
      const blob = new Blob([content], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      this.closeExportModal();
      showToast('Quiz exported successfully!', { type: 'success' });
    } catch (error) {
      console.error('[ExamBuilder] Failed to export quiz', error);
      showToast('Failed to export quiz. Please try again.', { type: 'error' });
    } finally {
      const exportBtn = document.getElementById('process-export-btn');
      exportBtn.textContent = 'Export quiz';
      exportBtn.disabled = false;
    }
  }

  generateJSONExport(includeAnswers, includeExplanations, includeSettings) {
    const exportData = {
      title: this.state.blueprint.title,
      description: this.state.blueprint.description,
      questions: this.state.questions.map(q => {
        const question = {
          type: q.type,
          text: q.text,
          points: q.points,
          timeLimit: q.time_limit_seconds,
        };

        if (includeAnswers) {
          question.correctAnswer = q.correct_answer;
        }

        if (includeExplanations) {
          question.explanation = q.explanation;
        }

        if (q.type === 'multiple_choice') {
          question.options = q.options;
        }

        return question;
      }),
      exportedAt: new Date().toISOString(),
      exportedBy: 'Quiz Builder',
    };

    if (includeSettings) {
      exportData.settings = this.state.blueprint.settings || {};
    }

    return JSON.stringify(exportData, null, 2);
  }

  generateCSVExport(includeAnswers, includeExplanations) {
    let csv = 'type,text,points,timeLimit';

    if (includeAnswers) {
      csv += ',correctAnswer';
    }

    if (includeExplanations) {
      csv += ',explanation';
    }

    csv += '\n';

    this.state.questions.forEach(q => {
      let row = [
        q.type,
        `"${this.escapeCSVField(q.text)}"`,
        q.points || 1,
        q.time_limit_seconds || ''
      ];

      if (includeAnswers) {
        row.push(`"${this.escapeCSVField(q.correct_answer || '')}"`);
      }

      if (includeExplanations) {
        row.push(`"${this.escapeCSVField(q.explanation || '')}"`);
      }

      csv += row.join(',') + '\n';
    });

    return csv;
  }

  escapeCSVField(field) {
    return field.toString().replace(/"/g, '""');
  }

  importQuestions() {
    this.openImportModal();
  }

  openImportModal() {
    const modal = document.createElement('div');
    modal.id = 'import-modal';
    modal.className = 'fixed inset-0 z-50 bg-black/40 px-4 pb-10 pt-24 backdrop-blur-sm sm:px-6 md:px-10';
    modal.innerHTML = `
      <div class="mx-auto max-w-2xl rounded-2xl bg-white shadow-xl">
        <div class="flex flex-col">
          <div class="flex items-start justify-between gap-4 p-6 border-b border-slate-200">
            <div>
              <h2 class="text-xl font-semibold text-slate-900">Import Questions</h2>
              <p class="text-sm text-slate-500 mt-1">Import questions from CSV, JSON, or Excel files</p>
            </div>
            <button type="button" class="close-import-modal rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
              <span class="sr-only">Close</span>
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="p-6 space-y-6">
            <div>
              <h3 class="text-sm font-medium text-slate-900 mb-3">Choose import format</h3>
              <div class="grid gap-3 sm:grid-cols-3">
                <label class="relative flex cursor-pointer rounded-lg border border-slate-200 p-3 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-cyan-500">
                  <input type="radio" name="import-format" value="csv" class="sr-only" checked>
                  <div class="text-center">
                    <svg class="mx-auto h-6 w-6 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 17v1a1 1 0 001 1h4a1 1 0 001-1v-1m3-2V8a2 2 0 00-2-2H8a2 2 0 00-2 2v6m3-2h8M5 11h14" />
                    </svg>
                    <p class="mt-2 text-sm font-medium text-slate-900">CSV</p>
                    <p class="text-xs text-slate-500">Comma-separated values</p>
                  </div>
                </label>
                <label class="relative flex cursor-pointer rounded-lg border border-slate-200 p-3 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-cyan-500">
                  <input type="radio" name="import-format" value="json" class="sr-only">
                  <div class="text-center">
                    <svg class="mx-auto h-6 w-6 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    <p class="mt-2 text-sm font-medium text-slate-900">JSON</p>
                    <p class="text-xs text-slate-500">JavaScript Object Notation</p>
                  </div>
                </label>
                <label class="relative flex cursor-pointer rounded-lg border border-slate-200 p-3 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-cyan-500">
                  <input type="radio" name="import-format" value="excel" class="sr-only">
                  <div class="text-center">
                    <svg class="mx-auto h-6 w-6 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 17v1a1 1 0 001 1h4a1 1 0 001-1v-1m3-2V8a2 2 0 00-2-2H8a2 2 0 00-2 2v6m3-2h8" />
                    </svg>
                    <p class="mt-2 text-sm font-medium text-slate-900">Excel</p>
                    <p class="text-xs text-slate-500">XLS or XLSX files</p>
                  </div>
                </label>
              </div>
            </div>

            <div>
              <label for="import-file-input" class="block text-sm font-medium text-slate-700 mb-2">Upload file</label>
              <div class="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-cyan-400 transition-colors">
                <input type="file" id="import-file-input" accept=".csv,.json,.xls,.xlsx" class="hidden" />
                <svg class="mx-auto h-8 w-8 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p class="mt-2 text-sm text-slate-500">Click to browse or drag and drop</p>
                <button type="button" id="browse-import-btn" class="mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
                  Browse files
                </button>
              </div>
              <p id="selected-file-name" class="mt-2 text-sm text-slate-600 hidden"></p>
            </div>

            <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 class="text-sm font-medium text-blue-900 mb-2">CSV Format Example:</h4>
              <pre class="text-xs bg-blue-100 rounded p-2 overflow-x-auto">
type,text,options,correct_answer,points,explanation
multiple_choice,"What is 2+2?","A: 3,B: 4,C: 5",B,1,"Basic addition"
true_false,"The sky is blue","true,true",1,"Natural science"
short_answer,"What is the capital of France?","Paris",2,"Geography question"
              </pre>
            </div>
          </div>

          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end p-6 border-t border-slate-200">
            <button type="button" class="close-import-modal inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button type="button" id="process-import-btn" class="inline-flex items-center justify-center rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed" disabled>
              Import questions
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    // Add event listeners
    modal.querySelector('.close-import-modal').addEventListener('click', () => this.closeImportModal());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.closeImportModal();
    });

    const fileInput = modal.querySelector('#import-file-input');
    const browseBtn = modal.querySelector('#browse-import-btn');
    const uploadArea = modal.querySelector('.border-dashed');
    const processBtn = modal.querySelector('#process-import-btn');
    const fileName = modal.querySelector('#selected-file-name');

    browseBtn.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        fileName.textContent = `Selected: ${file.name}`;
        fileName.classList.remove('hidden');
        processBtn.disabled = false;
      }
    });

    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('border-cyan-400', 'bg-cyan-50');
    });

    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('border-cyan-400', 'bg-cyan-50');
    });

    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('border-cyan-400', 'bg-cyan-50');
      const file = e.dataTransfer.files[0];
      if (file) {
        fileInput.files = e.dataTransfer.files;
        fileName.textContent = `Selected: ${file.name}`;
        fileName.classList.remove('hidden');
        processBtn.disabled = false;
      }
    });

    processBtn.addEventListener('click', () => this.processImportFile());
  }

  closeImportModal() {
    const modal = document.getElementById('import-modal');
    if (modal) {
      modal.remove();
      document.body.style.overflow = '';
    }
  }

  async processImportFile() {
    const fileInput = document.getElementById('import-file-input');
    const format = document.querySelector('input[name="import-format"]:checked').value;
    const file = fileInput.files[0];

    if (!file) return;

    try {
      const processBtn = document.getElementById('process-import-btn');
      processBtn.textContent = 'Processing...';
      processBtn.disabled = true;

      let questions = [];

      if (format === 'csv') {
        questions = await this.parseCSVFile(file);
      } else if (format === 'json') {
        questions = await this.parseJSONFile(file);
      } else if (format === 'excel') {
        questions = await this.parseExcelFile(file);
      }

      if (questions.length === 0) {
        showToast('No valid questions found in file.', { type: 'warning' });
        return;
      }

      // Import questions
      for (const question of questions) {
        await quizBuilderService.createQuestion(this.state.blueprint.id, question);
      }

      await this.loadQuestions();
      this.closeImportModal();
      showToast(`Successfully imported ${questions.length} questions!`, { type: 'success' });
    } catch (error) {
      console.error('[ExamBuilder] Failed to import questions', error);
      showToast('Failed to import questions. Please check the file format.', { type: 'error' });
    } finally {
      const processBtn = document.getElementById('process-import-btn');
      processBtn.textContent = 'Import questions';
      processBtn.disabled = false;
    }
  }

  async parseCSVFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target.result;
          const lines = text.split('\n').filter(line => line.trim());
          const headers = lines[0].split(',').map(h => h.trim());
          const questions = [];

          for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
            if (values.length >= 3) {
              const question = {
                type: values[0] || 'multiple_choice',
                text: values[1] || '',
                options: values[2] ? values[2].split(';') : [],
                correctAnswer: values[3] || '',
                points: parseInt(values[4]) || 1,
                explanation: values[5] || '',
              };
              questions.push(question);
            }
          }
          resolve(questions);
        } catch (error) {
          reject(error);
        }
      };
      reader.readAsText(file);
    });
  }

  parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  async parseJSONFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          const questions = Array.isArray(data) ? data : data.questions || [];
          resolve(questions);
        } catch (error) {
          reject(error);
        }
      };
      reader.readAsText(file);
    });
  }

  async parseExcelFile(file) {
    // For now, return empty array - would need a library like SheetJS
    showToast('Excel import coming soon! Please use CSV format.', { type: 'info' });
    return [];
  }

  openMediaUpload() {
    const modal = document.createElement('div');
    modal.id = 'media-upload-modal';
    modal.className = 'fixed inset-0 z-50 bg-black/40 px-4 pb-10 pt-24 backdrop-blur-sm sm:px-6 md:px-10';
    modal.innerHTML = `
      <div class="mx-auto max-w-2xl rounded-2xl bg-white shadow-xl">
        <div class="flex flex-col">
          <div class="flex items-start justify-between gap-4 p-6 border-b border-slate-200">
            <div>
              <h2 class="text-xl font-semibold text-slate-900">Upload Media</h2>
              <p class="text-sm text-slate-500 mt-1">Add images, audio, or video to your question</p>
            </div>
            <button type="button" class="close-media-modal rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
              <span class="sr-only">Close</span>
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="p-6">
            <div class="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-cyan-400 transition-colors">
              <input type="file" id="media-file-input" accept="image/*,audio/*,video/*" class="hidden" />
              <svg class="mx-auto h-12 w-12 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <h3 class="mt-4 text-lg font-medium text-slate-900">Upload media file</h3>
              <p class="mt-2 text-sm text-slate-500">Drag and drop your file here, or click to browse</p>
              <p class="mt-1 text-xs text-slate-400">Supported formats: Images (JPG, PNG, GIF), Audio (MP3, WAV), Video (MP4, WebM)</p>
              <p class="mt-1 text-xs text-slate-400">Maximum file size: 10MB</p>
              <button type="button" id="browse-files-btn" class="mt-4 inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700">
                Browse files
              </button>
            </div>

            <div id="media-preview" class="hidden mt-6">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-sm font-medium text-slate-700">Preview</h3>
                <button type="button" id="remove-media-btn" class="text-sm text-rose-600 hover:text-rose-700">
                  Remove
                </button>
              </div>
              <div id="preview-container" class="border border-slate-200 rounded-lg overflow-hidden">
                <!-- Preview will be inserted here -->
              </div>
            </div>

            <div class="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <button type="button" class="close-media-modal inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="button" id="attach-media-btn" class="inline-flex items-center justify-center rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                Attach to question
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    // Add event listeners
    modal.querySelector('.close-media-modal').addEventListener('click', () => this.closeMediaUpload());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.closeMediaUpload();
    });

    const fileInput = modal.querySelector('#media-file-input');
    const browseBtn = modal.querySelector('#browse-files-btn');
    const uploadArea = modal.querySelector('.border-dashed');
    const attachBtn = modal.querySelector('#attach-media-btn');
    const removeBtn = modal.querySelector('#remove-media-btn');

    browseBtn.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files[0]));

    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('border-cyan-400', 'bg-cyan-50');
    });

    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('border-cyan-400', 'bg-cyan-50');
    });

    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('border-cyan-400', 'bg-cyan-50');
      const file = e.dataTransfer.files[0];
      if (file) this.handleFileSelect(file);
    });

    attachBtn.addEventListener('click', () => this.attachMediaToQuestion());
    removeBtn.addEventListener('click', () => this.removeSelectedMedia());
  }

  closeMediaUpload() {
    const modal = document.getElementById('media-upload-modal');
    if (modal) {
      modal.remove();
      document.body.style.overflow = '';
    }
    this.state.selectedMedia = null;
  }

  async handleFileSelect(file) {
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'audio/mpeg', 'audio/wav', 'video/mp4', 'video/webm'];
    if (!allowedTypes.includes(file.type)) {
      showToast('Please select a valid image, audio, or video file.', { type: 'error' });
      return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      showToast('File size must be less than 10MB.', { type: 'error' });
      return;
    }

    this.state.selectedMedia = file;
    this.showMediaPreview(file);
  }

  showMediaPreview(file) {
    const previewSection = document.getElementById('media-preview');
    const previewContainer = document.getElementById('preview-container');
    const attachBtn = document.getElementById('attach-media-btn');

    previewSection.classList.remove('hidden');
    attachBtn.disabled = false;

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        previewContainer.innerHTML = `<img src="${e.target.result}" alt="Preview" class="w-full h-auto max-h-64 object-contain">`;
      };
      reader.readAsDataURL(file);
    } else if (file.type.startsWith('audio/')) {
      previewContainer.innerHTML = `
        <div class="p-4 bg-slate-50">
          <audio controls class="w-full">
            <source src="${URL.createObjectURL(file)}" type="${file.type}">
            Your browser does not support the audio element.
          </audio>
          <p class="mt-2 text-sm text-slate-600">${file.name}</p>
        </div>
      `;
    } else if (file.type.startsWith('video/')) {
      previewContainer.innerHTML = `
        <video controls class="w-full max-h-64">
          <source src="${URL.createObjectURL(file)}" type="${file.type}">
          Your browser does not support the video element.
        </video>
        <p class="mt-2 text-sm text-slate-600 px-4">${file.name}</p>
      `;
    }
  }

  removeSelectedMedia() {
    this.state.selectedMedia = null;
    document.getElementById('media-preview').classList.add('hidden');
    document.getElementById('media-file-input').value = '';
    document.getElementById('attach-media-btn').disabled = true;
  }

  async attachMediaToQuestion() {
    if (!this.state.selectedMedia) return;

    try {
      const attachBtn = document.getElementById('attach-media-btn');
      attachBtn.textContent = 'Uploading...';
      attachBtn.disabled = true;

      // For now, we'll just add a placeholder in the question text
      // In a real implementation, you would upload to Supabase Storage
      const questionText = document.getElementById('question-text');
      const mediaText = `\n[Media: ${this.state.selectedMedia.name}]`;
      questionText.value += mediaText;

      showToast('Media attached to question!', { type: 'success' });
      this.closeMediaUpload();
    } catch (error) {
      console.error('[ExamBuilder] Failed to attach media', error);
      showToast('Failed to attach media. Please try again.', { type: 'error' });
    } finally {
      const attachBtn = document.getElementById('attach-media-btn');
      attachBtn.textContent = 'Attach to question';
      attachBtn.disabled = false;
    }
  }

  handleBulkAction(event) {
    const action = event.target.value;
    if (!action) return;

    const selectedQuestions = Array.from(document.querySelectorAll('input[name="selected-question"]:checked'))
      .map(cb => cb.value);

    if (selectedQuestions.length === 0) {
      showToast('Please select questions first.', { type: 'warning' });
      event.target.value = '';
      return;
    }

    switch (action) {
      case 'delete':
        this.deleteSelectedQuestions(selectedQuestions);
        break;
      case 'duplicate':
        this.duplicateSelectedQuestions(selectedQuestions);
        break;
      case 'move':
        this.moveSelectedQuestions(selectedQuestions);
        break;
    }

    event.target.value = '';
  }

  async deleteSelectedQuestions(questionIds) {
    if (!confirm(`Delete ${questionIds.length} selected question(s)? This action cannot be undone.`)) {
      return;
    }

    try {
      await Promise.all(questionIds.map(id => quizBuilderService.deleteQuestion(id)));
      await this.loadQuestions();
      showToast(`${questionIds.length} question(s) deleted.`, { type: 'info' });
      this.markAsChanged();
    } catch (error) {
      showToast('Failed to delete some questions.', { type: 'error' });
    }
  }

  async duplicateSelectedQuestions(questionIds) {
    try {
      await Promise.all(questionIds.map(id => quizBuilderService.duplicateQuestion(id)));
      await this.loadQuestions();
      showToast(`${questionIds.length} question(s) duplicated.`, { type: 'success' });
      this.markAsChanged();
    } catch (error) {
      showToast('Failed to duplicate some questions.', { type: 'error' });
    }
  }

  moveSelectedQuestions(questionIds) {
    showToast('Reordering questions coming soon!', { type: 'info' });
  }

  markAsChanged() {
    this.state.hasUnsavedChanges = true;
    document.getElementById('last-updated').textContent = 'Just now';
  }

  setLoading(loading) {
    this.state.loading = loading;
    const overlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');

    if (loading) {
      overlay.classList.remove('hidden');
      loadingText.textContent = 'Loading...';
    } else {
      overlay.classList.add('hidden');
    }
  }
}

// Initialize the exam builder
const examBuilder = new ExamBuilder();
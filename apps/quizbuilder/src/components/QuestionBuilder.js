/**
 * Question Builder Component
 * Handles question creation, editing, and management
 */

import { quizBuilderService, QuizBuilderServiceError } from '../../admin/src/services/quizBuilderService.js';
import { showToast } from './toast.js';

export class QuestionBuilder {
  constructor(options = {}) {
    this.blueprintId = options.blueprintId;
    this.onQuestionUpdate = options.onQuestionUpdate;
    this.questions = [];
    this.currentEditingId = null;
    this.modal = null;
  }

  /**
   * Initialize the question builder
   */
  async init() {
    this.createModal();
    this.bindEvents();
    await this.loadQuestions();
  }

  /**
   * Load all questions for the blueprint
   */
  async loadQuestions() {
    if (!this.blueprintId) return [];

    try {
      this.questions = await quizBuilderService.getBlueprintQuestions(this.blueprintId);
      this.renderQuestions();
      return this.questions;
    } catch (error) {
      console.error('[QuestionBuilder] Failed to load questions:', error);
      showToast('Failed to load questions', { type: 'error' });
      return [];
    }
  }

  /**
   * Create the question modal
   */
  createModal() {
    if (document.getElementById('question-modal')) return;

    this.modal = document.createElement('div');
    this.modal.id = 'question-modal';
    this.modal.className = 'hidden fixed inset-0 z-50 bg-black/40 px-4 pb-10 pt-24 backdrop-blur-sm sm:px-6 md:px-10';
    this.modal.innerHTML = `
      <div class="mx-auto max-w-4xl rounded-2xl bg-white shadow-xl max-h-[80vh] overflow-y-auto">
        <form id="question-form" class="flex flex-col" autocomplete="off">
          <div class="flex items-start justify-between gap-4 p-6 border-b border-slate-200">
            <div class="flex items-center gap-3">
              <img src="../assets/academicnightingale-logo.jpg" alt="Academic Nightingale" class="h-8 w-8 rounded-lg object-cover shadow-sm" />
              <div>
                <h2 class="text-xl font-semibold text-slate-900">Add Question</h2>
                <p class="text-sm text-slate-500 mt-1">Create a new question for your quiz</p>
              </div>
            </div>
            <button type="button" id="close-question-modal" class="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
              <span class="sr-only">Close</span>
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="p-6 space-y-6">
            <!-- Question Type -->
            <div>
              <label for="question-type" class="block text-sm font-medium text-slate-700">Question Type</label>
              <select
                id="question-type"
                name="question-type"
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                required
              >
                <option value="multiple_choice">Multiple Choice</option>
                <option value="true_false">True/False</option>
                <option value="short_answer">Short Answer</option>
                <option value="essay">Essay</option>
                <option value="fill_blank">Fill in the Blank</option>
                <option value="matching">Matching</option>
              </select>
            </div>

            <!-- Question Text -->
            <div>
              <label for="question-text" class="block text-sm font-medium text-slate-700">Question</label>
              <textarea
                id="question-text"
                name="question-text"
                rows="3"
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                placeholder="Enter your question here..."
                required
              ></textarea>
              <div class="mt-2 flex items-center gap-3">
                <button type="button" id="add-media-btn" class="inline-flex items-center gap-2 text-sm text-cyan-600 hover:text-cyan-700">
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Add media
                </button>
                <button type="button" id="format-text-btn" class="inline-flex items-center gap-2 text-sm text-cyan-600 hover:text-cyan-700">
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Format text
                </button>
              </div>
            </div>

            <!-- Points -->
            <div class="grid gap-4 md:grid-cols-2">
              <div>
                <label for="question-points" class="block text-sm font-medium text-slate-700">Points</label>
                <input
                  id="question-points"
                  name="question-points"
                  type="number"
                  min="1"
                  value="1"
                  class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  required
                />
              </div>
              <div>
                <label for="question-time" class="block text-sm font-medium text-slate-700">Time Limit (seconds)</label>
                <input
                  id="question-time"
                  name="question-time"
                  type="number"
                  min="10"
                  class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  placeholder="Optional"
                />
              </div>
            </div>

            <!-- Answer Options (Dynamic based on question type) -->
            <div id="answer-options" class="space-y-4">
              <!-- Multiple Choice Options -->
              <div id="multiple-choice-options" class="space-y-3">
                <div class="flex items-center justify-between">
                  <label class="block text-sm font-medium text-slate-700">Answer Options</label>
                  <button type="button" id="add-option-btn" class="inline-flex items-center gap-2 text-sm text-cyan-600 hover:text-cyan-700">
                    <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6v12m6-6H6" />
                    </svg>
                    Add option
                  </button>
                </div>
                <div id="options-list" class="space-y-2">
                  <!-- Options will be added here dynamically -->
                </div>
              </div>

              <!-- True/False Options -->
              <div id="true-false-options" class="hidden">
                <label class="block text-sm font-medium text-slate-700">Correct Answer</label>
                <div class="mt-2 space-y-2">
                  <label class="flex items-center gap-3">
                    <input type="radio" name="tf-answer" value="true" class="text-cyan-600 focus:border-cyan-500 focus:ring-cyan-400">
                    <span class="text-sm text-slate-700">True</span>
                  </label>
                  <label class="flex items-center gap-3">
                    <input type="radio" name="tf-answer" value="false" class="text-cyan-600 focus:border-cyan-500 focus:ring-cyan-400">
                    <span class="text-sm text-slate-700">False</span>
                  </label>
                </div>
              </div>

              <!-- Short Answer -->
              <div id="short-answer-options" class="hidden">
                <label for="correct-answer-text" class="block text-sm font-medium text-slate-700">Correct Answer</label>
                <input
                  id="correct-answer-text"
                  type="text"
                  class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  placeholder="Enter the correct answer..."
                >
                <p class="mt-1 text-xs text-slate-500">Case-insensitive matching will be used</p>
              </div>

              <!-- Essay -->
              <div id="essay-options" class="hidden">
                <label for="essay-rubric" class="block text-sm font-medium text-slate-700">Grading Rubric (Optional)</label>
                <textarea
                  id="essay-rubric"
                  rows="3"
                  class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  placeholder="Describe how this essay should be graded..."
                ></textarea>
              </div>
            </div>

            <!-- Explanation -->
            <div>
              <label for="question-explanation" class="block text-sm font-medium text-slate-700">Explanation (Optional)</label>
              <textarea
                id="question-explanation"
                name="question-explanation"
                rows="2"
                class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                placeholder="Explain the correct answer or provide additional context..."
              ></textarea>
            </div>
          </div>

          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end p-6 border-t border-slate-200">
            <button type="button" id="cancel-question-btn" class="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
              Cancel
            </button>
            <button type="submit" class="inline-flex items-center justify-center rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500">
              Save question
            </button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(this.modal);
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    const form = document.getElementById('question-form');
    const questionType = document.getElementById('question-type');
    const addOptionBtn = document.getElementById('add-option-btn');
    const closeBtn = document.getElementById('close-question-modal');
    const cancelBtn = document.getElementById('cancel-question-btn');
    const mediaBtn = document.getElementById('add-media-btn');

    // Form submission
    form?.addEventListener('submit', (e) => this.handleQuestionSubmit(e));

    // Question type change
    questionType?.addEventListener('change', (e) => this.handleQuestionTypeChange(e));

    // Add option
    addOptionBtn?.addEventListener('click', () => this.addMultipleChoiceOption());

    // Close modal
    closeBtn?.addEventListener('click', () => this.closeModal());
    cancelBtn?.addEventListener('click', () => this.closeModal());

    // Modal backdrop click
    this.modal?.addEventListener('click', (e) => {
      if (e.target === this.modal) this.closeModal();
    });

    // Media upload (placeholder)
    mediaBtn?.addEventListener('click', () => {
      showToast('Media upload coming soon!', { type: 'info' });
    });

    // Format text (placeholder)
    document.getElementById('format-text-btn')?.addEventListener('click', () => {
      showToast('Rich text editor coming soon!', { type: 'info' });
    });
  }

  /**
   * Open the question modal for creating or editing
   */
  openModal(questionId = null) {
    this.currentEditingId = questionId;
    const form = document.getElementById('question-form');
    const title = form.querySelector('h2');

    if (questionId) {
      const question = this.questions.find(q => q.id === questionId);
      if (question) {
        this.populateForm(question);
        title.textContent = 'Edit Question';
      }
    } else {
      form.reset();
      title.textContent = 'Add Question';
      this.handleQuestionTypeChange({ target: { value: 'multiple_choice' } });
    }

    this.modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  /**
   * Close the modal
   */
  closeModal() {
    this.modal.classList.add('hidden');
    document.body.style.overflow = '';
    this.currentEditingId = null;
  }

  /**
   * Handle question type change
   */
  handleQuestionTypeChange(event) {
    const type = event.target.value;

    // Hide all option sections
    document.getElementById('multiple-choice-options').classList.add('hidden');
    document.getElementById('true-false-options').classList.add('hidden');
    document.getElementById('short-answer-options').classList.add('hidden');
    document.getElementById('essay-options').classList.add('hidden');

    // Show relevant section
    switch (type) {
      case 'multiple_choice':
        document.getElementById('multiple-choice-options').classList.remove('hidden');
        if (document.querySelectorAll('#options-list > div').length < 2) {
          this.addMultipleChoiceOption();
          this.addMultipleChoiceOption();
        }
        break;
      case 'true_false':
        document.getElementById('true-false-options').classList.remove('hidden');
        break;
      case 'short_answer':
        document.getElementById('short-answer-options').classList.remove('hidden');
        break;
      case 'essay':
        document.getElementById('essay-options').classList.remove('hidden');
        break;
    }
  }

  /**
   * Add a multiple choice option
   */
  addMultipleChoiceOption() {
    const optionsList = document.getElementById('options-list');
    const optionIndex = optionsList.children.length;
    const optionLetter = String.fromCharCode(65 + optionIndex);

    const optionDiv = document.createElement('div');
    optionDiv.className = 'flex items-center gap-3';
    optionDiv.innerHTML = `
      <input type="radio" name="correct-answer" value="${optionIndex}" class="text-cyan-600 focus:border-cyan-500 focus:ring-cyan-400">
      <input type="text" placeholder="Option ${optionLetter}" class="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400" required>
      <button type="button" class="text-rose-500 hover:text-rose-700" onclick="questionBuilder.removeMultipleChoiceOption(this)">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    `;

    optionsList.appendChild(optionDiv);
  }

  /**
   * Remove a multiple choice option
   */
  removeMultipleChoiceOption(button) {
    const optionDiv = button.closest('div');
    if (document.querySelectorAll('#options-list > div').length > 2) {
      optionDiv.remove();
      this.updateOptionLabels();
    }
  }

  /**
   * Update option labels after removal
   */
  updateOptionLabels() {
    const options = document.querySelectorAll('#options-list > div');
    options.forEach((option, index) => {
      const letter = String.fromCharCode(65 + index);
      const input = option.querySelector('input[type="text"]');
      if (input) input.placeholder = `Option ${letter}`;
      const radio = option.querySelector('input[type="radio"]');
      if (radio) radio.value = index;
    });
  }

  /**
   * Populate form with question data for editing
   */
  populateForm(question) {
    document.getElementById('question-type').value = question.type;
    document.getElementById('question-text').value = question.text || '';
    document.getElementById('question-points').value = question.points || 1;
    document.getElementById('question-time').value = question.timeLimit || '';
    document.getElementById('question-explanation').value = question.explanation || '';

    this.handleQuestionTypeChange({ target: { value: question.type } });

    // Populate type-specific data
    switch (question.type) {
      case 'multiple_choice':
        if (question.options) {
          this.populateMultipleChoiceOptions(question.options, question.correctAnswer);
        }
        break;
      case 'true_false':
        const tfAnswer = document.querySelector(`input[name="tf-answer"][value="${question.correctAnswer}"]`);
        if (tfAnswer) tfAnswer.checked = true;
        break;
      case 'short_answer':
        document.getElementById('correct-answer-text').value = question.correctAnswer || '';
        break;
      case 'essay':
        document.getElementById('essay-rubric').value = question.rubric || '';
        break;
    }
  }

  /**
   * Populate multiple choice options
   */
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
        <button type="button" class="text-rose-500 hover:text-rose-700" onclick="questionBuilder.removeMultipleChoiceOption(this)">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      `;
      optionsList.appendChild(optionDiv);
    });
  }

  /**
   * Handle question form submission
   */
  async handleQuestionSubmit(event) {
    event.preventDefault();

    const formData = new FormData(event.target);
    const questionType = formData.get('question-type');
    const questionData = this.validateAndExtractFormData(formData, questionType);

    if (!questionData) return; // Validation failed

    try {
      this.showLoading(true);

      if (this.currentEditingId) {
        await quizBuilderService.updateQuestion(this.currentEditingId, questionData);
        showToast('Question updated successfully', { type: 'success' });
      } else {
        await quizBuilderService.createQuestion(this.blueprintId, questionData);
        showToast('Question added successfully', { type: 'success' });
      }

      await this.loadQuestions();
      this.closeModal();
      if (this.onQuestionUpdate) {
        this.onQuestionUpdate();
      }
    } catch (error) {
      console.error('[QuestionBuilder] Failed to save question:', error);
      showToast(error.message || 'Failed to save question', { type: 'error' });
    } finally {
      this.showLoading(false);
    }
  }

  /**
   * Validate and extract form data
   */
  validateAndExtractFormData(formData, questionType) {
    const questionData = {
      type: questionType,
      text: formData.get('question-text')?.trim(),
      points: parseInt(formData.get('question-points')) || 1,
      timeLimit: parseInt(formData.get('question-time')) || null,
      explanation: formData.get('question-explanation')?.trim() || null,
    };

    // Basic validation
    if (!questionData.text) {
      showToast('Question text is required', { type: 'error' });
      return null;
    }

    // Type-specific validation and data extraction
    switch (questionType) {
      case 'multiple_choice':
        const options = Array.from(document.querySelectorAll('#options-list input[type="text"]'))
          .map(input => input.value.trim())
          .filter(value => value);

        if (options.length < 2) {
          showToast('Multiple choice questions need at least 2 options', { type: 'error' });
          return null;
        }

        const correctAnswerIndex = parseInt(document.querySelector('input[name="correct-answer"]:checked')?.value);
        if (isNaN(correctAnswerIndex)) {
          showToast('Please select the correct answer', { type: 'error' });
          return null;
        }

        questionData.options = options;
        questionData.correctAnswer = correctAnswerIndex;
        break;

      case 'true_false':
        const tfAnswer = document.querySelector('input[name="tf-answer"]:checked')?.value;
        if (!tfAnswer) {
          showToast('Please select true or false', { type: 'error' });
          return null;
        }
        questionData.correctAnswer = tfAnswer === 'true';
        break;

      case 'short_answer':
        const shortAnswer = document.getElementById('correct-answer-text').value.trim();
        if (!shortAnswer) {
          showToast('Correct answer is required for short answer questions', { type: 'error' });
          return null;
        }
        questionData.correctAnswer = shortAnswer;
        break;

      case 'essay':
        questionData.rubric = document.getElementById('essay-rubric').value.trim() || null;
        break;

      case 'fill_blank':
        // For fill in the blank, we'd need more complex parsing
        showToast('Fill in the blank questions coming soon!', { type: 'info' });
        return null;

      case 'matching':
        showToast('Matching questions coming soon!', { type: 'info' });
        return null;
    }

    return questionData;
  }

  /**
   * Render questions in the list
   */
  renderQuestions() {
    const container = document.getElementById('question-list');
    if (!container) return;

    if (this.questions.length === 0) {
      container.innerHTML = this.renderEmptyState();
      return;
    }

    container.innerHTML = this.questions.map((question, index) =>
      this.renderQuestionCard(question, index)
    ).join('');
  }

  /**
   * Render empty state
   */
  renderEmptyState() {
    return `
      <div class="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-500 shadow-sm">
        <svg class="mx-auto h-12 w-12 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6v12m6-6H6" />
        </svg>
        <h3 class="mt-4 text-lg font-medium text-slate-900">No questions yet</h3>
        <p class="mt-2">Get started by adding your first question to the quiz.</p>
        <button
          class="mt-4 inline-flex items-center gap-2 rounded-full bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
          onclick="questionBuilder.openModal()"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6v12m6-6H6" />
          </svg>
          Add first question
        </button>
      </div>
    `;
  }

  /**
   * Render a single question card
   */
  renderQuestionCard(question, index) {
    const typeIcons = {
      multiple_choice: '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>',
      true_false: '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>',
      short_answer: '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>',
      essay: '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>',
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
                  ${question.time_limit_seconds ? `<span class="text-xs text-slate-400">• ${question.time_limit_seconds}s</span>` : ''}
                </div>
                <p class="text-sm font-medium text-slate-900 line-clamp-2">${question.text || 'No question text'}</p>
                ${question.explanation ? `<p class="mt-2 text-xs text-slate-500 line-clamp-2">${question.explanation}</p>` : ''}
              </div>
              <div class="flex items-center gap-1">
                <button
                  type="button"
                  class="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  onclick="questionBuilder.openModal('${question.id}')"
                  title="Edit question"
                >
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  type="button"
                  class="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  onclick="questionBuilder.duplicateQuestion('${question.id}')"
                  title="Duplicate question"
                >
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
                <button
                  type="button"
                  class="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  onclick="questionBuilder.deleteQuestion('${question.id}')"
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

  /**
   * Duplicate a question
   */
  async duplicateQuestion(questionId) {
    try {
      await quizBuilderService.duplicateQuestion(questionId);
      await this.loadQuestions();
      showToast('Question duplicated successfully', { type: 'success' });
      if (this.onQuestionUpdate) {
        this.onQuestionUpdate();
      }
    } catch (error) {
      console.error('[QuestionBuilder] Failed to duplicate question:', error);
      showToast('Failed to duplicate question', { type: 'error' });
    }
  }

  /**
   * Delete a question
   */
  async deleteQuestion(questionId) {
    if (!confirm('Are you sure you want to delete this question? This action cannot be undone.')) {
      return;
    }

    try {
      await quizBuilderService.deleteQuestion(questionId);
      await this.loadQuestions();
      showToast('Question deleted successfully', { type: 'info' });
      if (this.onQuestionUpdate) {
        this.onQuestionUpdate();
      }
    } catch (error) {
      console.error('[QuestionBuilder] Failed to delete question:', error);
      showToast('Failed to delete question', { type: 'error' });
    }
  }

  /**
   * Show/hide loading state
   */
  showLoading(show) {
    const submitBtn = document.querySelector('#question-form button[type="submit"]');
    if (submitBtn) {
      if (show) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
      } else {
        submitBtn.disabled = false;
        submitBtn.textContent = this.currentEditingId ? 'Save question' : 'Save question';
      }
    }
  }

  /**
   * Destroy the component
   */
  destroy() {
    if (this.modal) {
      this.modal.remove();
    }
  }
}

// Export for global access
window.QuestionBuilder = QuestionBuilder;
/**
 * =============================================
 * ACADEMIC NIGHTINGALE QUIZ ENGINE
 * =============================================
 * Comprehensive quiz management system with unified design system
 */

class QuizEngine {
  constructor(options = {}) {
    this.options = {
      container: '#quiz-container',
      autoSave: true,
      saveInterval: 30000, // 30 seconds
      ...options,
    };

    this.quizData = {
      title: '',
      description: '',
      timeLimit: 30,
      attempts: 1,
      questions: [],
      settings: {
        randomizeQuestions: false,
        randomizeOptions: false,
        showCorrectAnswers: true,
        passingScore: 70,
      },
    };

    this.currentQuestionIndex = 0;
    this.timeRemaining = 0;
    this.timer = null;
    this.isPreview = false;
    this.autoSaveTimer = null;

    this.init();
  }

  init() {
    this.loadTemplates();
    this.setupEventListeners();
    this.startAutoSave();
  }

  loadTemplates() {
    // Load quiz components from shared templates
    const templates = [
      'quiz-header-template',
      'quiz-question-template',
      'quiz-sidebar-template',
      'quiz-navigation-template',
      'quiz-results-template',
    ];

    templates.forEach((templateId) => {
      const template = document.getElementById(templateId);
      if (template) {
        this[templateId.replace('-template', '')] = template.innerHTML;
      }
    });
  }

  setupEventListeners() {
    document.addEventListener('click', (e) => {
      if (e.target.closest('.add-question-btn')) {
        this.addQuestion();
      }
      if (e.target.closest('.add-option-btn')) {
        this.addOption(e.target.closest('.add-option-btn'));
      }
      if (e.target.closest('.remove-question-btn')) {
        this.removeQuestion(e.target.closest('.quiz-question'));
      }
      if (e.target.closest('.remove-option-btn')) {
        this.removeOption(e.target.closest('.remove-option-btn'));
      }
      if (e.target.closest('.save-quiz-btn')) {
        this.saveQuiz();
      }
      if (e.target.closest('.preview-quiz-btn')) {
        this.previewQuiz();
      }
      if (e.target.closest('.submit-quiz-btn')) {
        this.submitQuiz();
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 's':
            e.preventDefault();
            this.saveQuiz();
            break;
          case 'p':
            e.preventDefault();
            this.previewQuiz();
            break;
        }
      }
    });
  }

  // Quiz Building Methods
  addQuestion(type = 'multiple-choice') {
    const questionId = `q-${Date.now()}`;
    const questionData = {
      id: questionId,
      type: type,
      text: '',
      points: 1,
      options: type === 'multiple-choice' ? ['', ''] : [],
      correctAnswer: null,
      required: true,
      randomizeOptions: false,
    };

    this.quizData.questions.push(questionData);
    this.renderQuestion(questionData);
    this.updateQuestionPalette();
    this.showToast('Question added', 'success');
  }

  renderQuestion(questionData) {
    const container = document.querySelector('.quiz-questions-container');
    if (!container) return;

    const questionEl = document.createElement('div');
    questionEl.className = 'quiz-question';
    questionEl.dataset.questionId = questionData.id;

    // Use the question template
    const template = document.getElementById('quiz-question-template');
    if (template) {
      questionEl.innerHTML = template.innerHTML;

      // Update question number
      const questionNumber = questionEl.querySelector('.question-number');
      if (questionNumber) {
        questionNumber.textContent =
          this.quizData.questions.indexOf(questionData) + 1;
      }

      // Set question data
      const questionText = questionEl.querySelector('.question-text');
      const questionType = questionEl.querySelector('.question-type');
      const pointsInput = questionEl.querySelector('.points-input');

      if (questionText) questionText.value = questionData.text;
      if (questionType) questionType.value = questionData.type;
      if (pointsInput) pointsInput.value = questionData.points;

      // Render options
      this.renderOptions(questionEl, questionData);
    }

    container.appendChild(questionEl);
    this.setupQuestionListeners(questionEl);
  }

  renderOptions(questionEl, questionData) {
    const optionsContainer = questionEl.querySelector(
      '.multiple-choice-options'
    );
    if (!optionsContainer) return;

    optionsContainer.innerHTML = '';

    questionData.options.forEach((option, index) => {
      const optionEl = document.createElement('div');
      optionEl.className = 'option-item flex items-center gap-3';
      optionEl.innerHTML = `
        <input type="radio" name="correct-answer-${questionData.id}" class="correct-radio flex-shrink-0"
               value="${index}" ${questionData.correctAnswer === index ? 'checked' : ''}>
        <input type="text" class="option-text input flex-1" placeholder="Option ${String.fromCharCode(65 + index)}"
               value="${option}">
        <button class="remove-option-btn text-muted hover:text-error transition-colors" aria-label="Remove option">
          <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>
      `;
      optionsContainer.appendChild(optionEl);
    });
  }

  setupQuestionListeners(questionEl) {
    const questionText = questionEl.querySelector('.question-text');
    const questionType = questionEl.querySelector('.question-type');
    const pointsInput = questionEl.querySelector('.points-input');

    if (questionText) {
      questionText.addEventListener('input', (e) => {
        const questionId = questionEl.dataset.questionId;
        const question = this.quizData.questions.find(
          (q) => q.id === questionId
        );
        if (question) question.text = e.target.value;
      });
    }

    if (questionType) {
      questionType.addEventListener('change', (e) => {
        const questionId = questionEl.dataset.questionId;
        const question = this.quizData.questions.find(
          (q) => q.id === questionId
        );
        if (question) {
          question.type = e.target.value;
          this.renderOptions(questionEl, question);
        }
      });
    }

    if (pointsInput) {
      pointsInput.addEventListener('input', (e) => {
        const questionId = questionEl.dataset.questionId;
        const question = this.quizData.questions.find(
          (q) => q.id === questionId
        );
        if (question) question.points = parseInt(e.target.value) || 1;
        this.updateTotalPoints();
      });
    }
  }

  addOption(button) {
    const questionEl = button.closest('.quiz-question');
    const questionId = questionEl.dataset.questionId;
    const question = this.quizData.questions.find((q) => q.id === questionId);

    if (question && question.type === 'multiple-choice') {
      question.options.push('');
      this.renderOptions(questionEl, question);
    }
  }

  removeOption(button) {
    const questionEl = button.closest('.quiz-question');
    const optionEl = button.closest('.option-item');
    const optionIndex = Array.from(optionEl.parentNode.children).indexOf(
      optionEl
    );
    const questionId = questionEl.dataset.questionId;
    const question = this.quizData.questions.find((q) => q.id === questionId);

    if (question && question.type === 'multiple-choice') {
      question.options.splice(optionIndex, 1);
      if (question.correctAnswer === optionIndex) {
        question.correctAnswer = null;
      } else if (question.correctAnswer > optionIndex) {
        question.correctAnswer--;
      }
      this.renderOptions(questionEl, question);
    }
  }

  removeQuestion(questionEl) {
    const questionId = questionEl.dataset.questionId;
    const index = this.quizData.questions.findIndex((q) => q.id === questionId);

    if (index > -1) {
      this.quizData.questions.splice(index, 1);
      questionEl.remove();
      this.updateQuestionNumbers();
      this.updateQuestionPalette();
      this.showToast('Question removed', 'info');
    }
  }

  updateQuestionNumbers() {
    const questions = document.querySelectorAll('.quiz-question');
    questions.forEach((questionEl, index) => {
      const numberEl = questionEl.querySelector('.question-number');
      if (numberEl) {
        numberEl.textContent = index + 1;
      }
    });
  }

  updateQuestionPalette() {
    const questionList = document.getElementById('question-list');
    const questionCount = document.getElementById('question-count');

    if (questionList) {
      questionList.innerHTML = '';
      this.quizData.questions.forEach((question, index) => {
        const item = document.createElement('div');
        item.className =
          'flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors';
        item.innerHTML = `
          <span class="text-sm font-medium">Question ${index + 1}</span>
          <span class="text-xs text-muted">${question.points} pts</span>
        `;
        item.addEventListener('click', () => {
          document
            .querySelector(`[data-question-id="${question.id}"]`)
            ?.scrollIntoView({ behavior: 'smooth' });
        });
        questionList.appendChild(item);
      });
    }

    if (questionCount) {
      questionCount.textContent = `${this.quizData.questions.length} question${this.quizData.questions.length !== 1 ? 's' : ''}`;
    }

    this.updateTotalPoints();
  }

  updateTotalPoints() {
    const totalPoints = this.quizData.questions.reduce(
      (sum, q) => sum + q.points,
      0
    );
    const totalPointsEl = document.getElementById('total-points');
    if (totalPointsEl) {
      totalPointsEl.textContent = totalPoints;
    }
  }

  // Quiz Taking Methods
  startQuiz(quizData) {
    this.quizData = quizData;
    this.currentQuestionIndex = 0;
    this.timeRemaining = quizData.timeLimit * 60; // Convert to seconds
    this.isPreview = false;

    this.renderQuizInterface();
    this.startTimer();
    this.renderCurrentQuestion();
  }

  renderQuizInterface() {
    const container = document.querySelector(this.options.container);
    if (!container) return;

    container.innerHTML = `
      <div class="quiz-interface">
        <!-- Quiz Header -->
        <header class="quiz-header border-b border-medium bg-card">
          <div class="mx-auto max-w-4xl px-4 py-4">
            <div class="flex items-center justify-between">
              <div>
                <h1 class="text-xl font-bold text-primary">${this.quizData.title}</h1>
                <p class="text-sm text-secondary">${this.quizData.description}</p>
              </div>
              <div class="flex items-center gap-4">
                <div class="text-sm">
                  <span class="text-muted">Time:</span>
                  <span class="font-mono font-semibold" id="timer-display">${this.formatTime(this.timeRemaining)}</span>
                </div>
                <button class="btn btn-ghost btn-sm" onclick="quizEngine.pauseQuiz()">
                  <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
                  </svg>
                  Pause
                </button>
              </div>
            </div>
          </div>
        </header>

        <!-- Quiz Content -->
        <main class="quiz-content flex-1 p-6">
          <div class="max-w-4xl mx-auto">
            <!-- Question Area -->
            <div class="quiz-question-area card mb-6">
              <div class="card-body">
                <div class="flex items-start justify-between mb-4">
                  <div class="flex items-center gap-3">
                    <span class="question-number flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white text-sm font-semibold">
                      ${this.currentQuestionIndex + 1}
                    </span>
                    <span class="text-sm text-muted">Question ${this.currentQuestionIndex + 1} of ${this.quizData.questions.length}</span>
                  </div>
                  <span class="text-sm font-semibold text-brand">${this.getCurrentQuestion().points} points</span>
                </div>

                <h2 class="text-lg font-semibold mb-6">${this.getCurrentQuestion().text}</h2>

                <div id="answer-options" class="space-y-3">
                  <!-- Options will be rendered here -->
                </div>
              </div>
            </div>
          </div>
        </main>

        <!-- Quiz Navigation -->
        <nav class="quiz-navigation border-t border-medium bg-card p-4">
          <div class="max-w-4xl mx-auto flex items-center justify-between">
            <button class="btn btn-secondary" onclick="quizEngine.previousQuestion()" ${this.currentQuestionIndex === 0 ? 'disabled' : ''}>
              <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd" />
              </svg>
              Previous
            </button>

            <div class="flex items-center gap-4">
              <button class="btn btn-ghost" onclick="quizEngine.reviewQuiz()">
                Review
              </button>
              <button class="btn btn-primary" onclick="quizEngine.nextQuestion()">
                ${this.currentQuestionIndex === this.quizData.questions.length - 1 ? 'Submit Quiz' : 'Next'}
                <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </nav>
      </div>
    `;
  }

  renderCurrentQuestion() {
    const question = this.getCurrentQuestion();
    const optionsContainer = document.getElementById('answer-options');

    if (!optionsContainer) return;

    optionsContainer.innerHTML = '';

    switch (question.type) {
      case 'multiple-choice':
        this.renderMultipleChoice(question, optionsContainer);
        break;
      case 'true-false':
        this.renderTrueFalse(question, optionsContainer);
        break;
      case 'short-answer':
        this.renderShortAnswer(question, optionsContainer);
        break;
      case 'essay':
        this.renderEssay(question, optionsContainer);
        break;
    }
  }

  renderMultipleChoice(question, container) {
    const options = this.shuffleArray(
      question.options,
      question.randomizeOptions
    );

    options.forEach((option, index) => {
      const optionId = `option-${index}`;
      const optionEl = document.createElement('label');
      optionEl.className =
        'flex items-start gap-3 p-4 border border-medium rounded-lg cursor-pointer hover:bg-gray-50 transition-colors';
      optionEl.innerHTML = `
        <input type="radio" name="answer" value="${index}" id="${optionId}" class="mt-1">
        <span class="flex-1">${option}</span>
      `;
      container.appendChild(optionEl);
    });
  }

  renderTrueFalse(question, container) {
    ['True', 'False'].forEach((option, index) => {
      const optionId = `option-${index}`;
      const optionEl = document.createElement('label');
      optionEl.className =
        'flex items-start gap-3 p-4 border border-medium rounded-lg cursor-pointer hover:bg-gray-50 transition-colors';
      optionEl.innerHTML = `
        <input type="radio" name="answer" value="${option}" id="${optionId}" class="mt-1">
        <span class="flex-1 font-medium">${option}</span>
      `;
      container.appendChild(optionEl);
    });
  }

  renderShortAnswer(question, container) {
    const inputEl = document.createElement('textarea');
    inputEl.className = 'input w-full resize-none';
    inputEl.rows = 4;
    inputEl.placeholder = 'Enter your answer here...';
    container.appendChild(inputEl);
  }

  renderEssay(question, container) {
    const inputEl = document.createElement('textarea');
    inputEl.className = 'input w-full resize-none';
    inputEl.rows = 8;
    inputEl.placeholder = 'Write your essay response here...';
    container.appendChild(inputEl);
  }

  getCurrentQuestion() {
    return this.quizData.questions[this.currentQuestionIndex];
  }

  nextQuestion() {
    const currentAnswer = this.getCurrentAnswer();
    this.saveAnswer(this.currentQuestionIndex, currentAnswer);

    if (this.currentQuestionIndex < this.quizData.questions.length - 1) {
      this.currentQuestionIndex++;
      this.renderCurrentQuestion();
      this.updateNavigationButtons();
    } else {
      this.submitQuiz();
    }
  }

  previousQuestion() {
    if (this.currentQuestionIndex > 0) {
      this.currentQuestionIndex--;
      this.renderCurrentQuestion();
      this.updateNavigationButtons();
    }
  }

  updateNavigationButtons() {
    const prevBtn = document.querySelector(
      '.quiz-navigation button:first-child'
    );
    const nextBtn = document.querySelector(
      '.quiz-navigation button:last-child span'
    );

    if (prevBtn) {
      prevBtn.disabled = this.currentQuestionIndex === 0;
    }

    if (nextBtn) {
      nextBtn.textContent =
        this.currentQuestionIndex === this.quizData.questions.length - 1
          ? 'Submit Quiz'
          : 'Next';
    }
  }

  getCurrentAnswer() {
    const selectedRadio = document.querySelector(
      'input[name="answer"]:checked'
    );
    const textArea = document.querySelector('textarea');

    if (selectedRadio) return selectedRadio.value;
    if (textArea) return textArea.value;

    return null;
  }

  saveAnswer(questionIndex, answer) {
    if (!this.answers) this.answers = [];
    this.answers[questionIndex] = answer;
  }

  // Timer Methods
  startTimer() {
    this.timer = setInterval(() => {
      this.timeRemaining--;
      this.updateTimerDisplay();

      if (this.timeRemaining <= 0) {
        this.submitQuiz();
      }
    }, 1000);
  }

  updateTimerDisplay() {
    const timerEl = document.getElementById('timer-display');
    if (timerEl) {
      timerEl.textContent = this.formatTime(this.timeRemaining);

      // Add warning classes
      timerEl.classList.remove('warning', 'danger');
      if (this.timeRemaining <= 60) {
        timerEl.classList.add('danger');
      } else if (this.timeRemaining <= 300) {
        timerEl.classList.add('warning');
      }
    }
  }

  formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  pauseQuiz() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.showToast('Quiz paused. Click Resume to continue.', 'info');
      // Show resume modal
    }
  }

  // Quiz Submission
  async submitQuiz() {
    if (this.timer) {
      clearInterval(this.timer);
    }

    // Save current answer
    const currentAnswer = this.getCurrentAnswer();
    this.saveAnswer(this.currentQuestionIndex, currentAnswer);

    // Calculate results
    const results = this.calculateResults();

    // Show results
    this.showResults(results);

    // Save to database
    await this.saveQuizResults(results);
  }

  calculateResults() {
    let correctAnswers = 0;
    let totalPoints = 0;
    let earnedPoints = 0;

    this.quizData.questions.forEach((question, index) => {
      totalPoints += question.points;
      const userAnswer = this.answers[index];

      if (this.isCorrectAnswer(question, userAnswer)) {
        correctAnswers++;
        earnedPoints += question.points;
      }
    });

    const percentage =
      totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
    const passed = percentage >= this.quizData.settings.passingScore;

    return {
      correctAnswers,
      incorrectAnswers: this.quizData.questions.length - correctAnswers,
      totalPoints,
      earnedPoints,
      percentage,
      passed,
      timeTaken: this.quizData.timeLimit * 60 - this.timeRemaining,
      answers: this.answers,
    };
  }

  isCorrectAnswer(question, userAnswer) {
    if (!userAnswer) return false;

    switch (question.type) {
      case 'multiple-choice':
      case 'true-false':
        return userAnswer === question.correctAnswer;
      case 'short-answer':
        return (
          userAnswer.trim().toLowerCase() ===
          question.correctAnswer?.toLowerCase()
        );
      case 'essay':
        // Essays need manual grading
        return false;
      default:
        return false;
    }
  }

  showResults(results) {
    const container = document.querySelector(this.options.container);
    if (!container) return;

    const template = document.getElementById('quiz-results-template');
    if (!template) return;

    container.innerHTML = template.innerHTML;

    // Update result values
    document.getElementById('score-percentage').textContent =
      `${results.percentage}%`;
    document.getElementById('correct-answers').textContent =
      results.correctAnswers;
    document.getElementById('incorrect-answers').textContent =
      results.incorrectAnswers;
    document.getElementById('time-taken').textContent = this.formatTime(
      results.timeTaken
    );

    // Update message based on performance
    const messageEl = document.getElementById('result-message');
    if (messageEl) {
      if (results.passed) {
        messageEl.textContent = 'Congratulations! You passed the quiz.';
      } else {
        messageEl.textContent =
          'You did not pass this time. Review the material and try again.';
      }
    }

    // Setup result button listeners
    this.setupResultListeners();
  }

  setupResultListeners() {
    const retakeBtn = document.querySelector('.retake-quiz-btn');
    const backDashboardBtn = document.querySelector('.back-dashboard-btn');

    if (retakeBtn) {
      retakeBtn.addEventListener('click', () => {
        this.startQuiz(this.quizData);
      });
    }

    if (backDashboardBtn) {
      backDashboardBtn.addEventListener('click', () => {
        window.location.href = '/dashboard';
      });
    }
  }

  // Utility Methods
  shuffleArray(array, shouldShuffle = false) {
    if (!shouldShuffle) return array;

    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="flex-shrink-0">
          ${this.getToastIcon(type)}
        </div>
        <span class="flex-1">${message}</span>
        <button onclick="this.parentElement.parentElement.remove()" class="flex-shrink-0">
          <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>
      </div>
    `;

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  getToastIcon(type) {
    const icons = {
      success:
        '<svg class="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>',
      error:
        '<svg class="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" /></svg>',
      info: '<svg class="h-5 w-5 text-blue-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" /></svg>',
    };
    return icons[type] || icons.info;
  }

  // Auto-save functionality
  startAutoSave() {
    if (this.options.autoSave) {
      this.autoSaveTimer = setInterval(() => {
        this.autoSave();
      }, this.options.saveInterval);
    }
  }

  autoSave() {
    // Save quiz data to localStorage
    localStorage.setItem(
      'quiz-autosave',
      JSON.stringify({
        quizData: this.quizData,
        timestamp: Date.now(),
      })
    );
  }

  // API Methods
  async saveQuiz() {
    try {
      // Save to database
      this.showToast('Quiz saved successfully', 'success');
    } catch {
      this.showToast('Failed to save quiz', 'error');
    }
  }

  async saveQuizResults(results) {
    try {
      // Save results to database
      console.log('Saving quiz results:', results);
    } catch (error) {
      console.error('Failed to save results:', error);
    }
  }
}

// Initialize quiz engine when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new QuizEngine();
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = QuizEngine;
}

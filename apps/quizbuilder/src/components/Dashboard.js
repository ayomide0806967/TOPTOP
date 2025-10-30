/**
 * Dashboard Component
 * Main dashboard orchestrator
 */

import { BlueprintManager } from './BlueprintManager.js';
import { authService } from '../../shared/auth.js';
import { quizBuilderService } from '../../admin/src/services/quizBuilderService.js';
import { showToast } from './toast.js';

export class Dashboard {
  constructor() {
    this.currentPage = 'dashboard';
    this.components = {};
    this.state = {
      user: null,
      metrics: null,
      loading: true
    };
  }

  /**
   * Initialize the dashboard
   */
  async init() {
    this.bindNavigation();
    this.bindUserMenu();
    await this.loadUserData();
    this.showPage('dashboard');
    this.hideLoading();
  }

  /**
   * Bind navigation events
   */
  bindNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.dataset.page;
        if (page) {
          this.showPage(page);
        }
      });
    });

    // Quick actions
    document.querySelector('[href="#new-quiz"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.createNewQuiz();
    });

    document.querySelector('[href="#new-classroom"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      showToast('Classroom creation coming soon!', { type: 'info' });
    });

    // Refresh button
    document.getElementById('refresh-btn')?.addEventListener('click', () => {
      this.refreshCurrentPage();
    });
  }

  /**
   * Bind user menu events
   */
  bindUserMenu() {
    const userMenuBtn = document.getElementById('user-menu-btn');
    const userDropdown = document.getElementById('user-dropdown');

    userMenuBtn?.addEventListener('click', () => {
      userDropdown?.classList.toggle('hidden');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!userMenuBtn?.contains(e.target) && !userDropdown?.contains(e.target)) {
        userDropdown?.classList.add('hidden');
      }
    });

    // Logout
    document.getElementById('logout-btn')?.addEventListener('click', () => {
      this.handleLogout();
    });
  }

  /**
   * Load user data and metrics
   */
  async loadUserData() {
    try {
      // Get current user
      this.state.user = authService.getCurrentUser();
      this.renderUser();

      // Load dashboard metrics
      if (this.state.user) {
        await this.loadMetrics();
      }

      // Initialize components
      this.initializeComponents();
    } catch (error) {
      console.error('[Dashboard] Failed to load user data:', error);
      showToast('Failed to load user data', { type: 'error' });
    }
  }

  /**
   * Render user information
   */
  renderUser() {
    const userName = document.getElementById('user-name');
    const subscriptionPlan = document.getElementById('subscription-plan');

    if (userName && this.state.user) {
      userName.textContent = this.state.user.firstName || this.state.user.email || 'User';
    }

    if (subscriptionPlan && this.state.user?.subscription) {
      const plan = this.state.user.subscription.plan_type || 'Free';
      subscriptionPlan.textContent = plan.charAt(0).toUpperCase() + plan.slice(1) + ' Plan';
    }
  }

  /**
   * Load dashboard metrics
   */
  async loadMetrics() {
    try {
      // Load blueprints for metrics
      const blueprints = await quizBuilderService.listBlueprints();
      const publishedCount = blueprints.filter(b => b.status === 'published').length;
      const draftCount = blueprints.filter(b => b.status === 'draft').length;
      const totalQuestions = blueprints.reduce((sum, b) => sum + (b.total_questions || 0), 0);

      // Try to load subscription summary
      let subscriptionSummary = null;
      try {
        subscriptionSummary = await quizBuilderService.getSubscriptionSummary();
      } catch (error) {
        // Subscription service might not be available
        console.warn('[Dashboard] Subscription service not available:', error.message);
      }

      const metrics = {
        totalQuizzes: blueprints.length,
        publishedQuizzes: publishedCount,
        draftQuizzes: draftCount,
        totalQuestions: totalQuestions,
        activeClassrooms: subscriptionSummary?.active_classrooms || 0,
        totalStudents: subscriptionSummary?.total_participants || 0,
        totalAttempts: subscriptionSummary?.total_attempts || 0,
        subscriptionUsage: subscriptionSummary || null
      };

      this.state.metrics = metrics;
      this.renderMetrics(metrics);
    } catch (error) {
      console.error('[Dashboard] Failed to load metrics:', error);
    }
  }

  /**
   * Render dashboard metrics
   */
  renderMetrics(metrics) {
    // Update metric cards
    this.updateMetricCard('total-quizzes', metrics.totalQuizzes);
    this.updateMetricCard('active-classrooms', metrics.activeClassrooms);
    this.updateMetricCard('total-students', metrics.totalStudents);
    this.updateMetricCard('total-attempts', metrics.totalAttempts);

    // Render recent activity
    this.renderRecentActivity();

    // Render upcoming exams
    this.renderUpcomingExams();
  }

  /**
   * Update a metric card
   */
  updateMetricCard(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  }

  /**
   * Render recent activity
   */
  renderRecentActivity() {
    const container = document.getElementById('recent-activity');
    if (!container) return;

    // For now, show placeholder activity
    const activities = [
      { type: 'quiz_created', title: 'Quiz created', time: '2 hours ago', icon: '📝' },
      { type: 'quiz_published', title: 'Quiz published', time: '1 day ago', icon: '✅' },
      { type: 'student_enrolled', title: 'Student enrolled', time: '2 days ago', icon: '👤' },
    ];

    container.innerHTML = activities.map(activity => `
      <div class="flex items-center gap-3 p-3 rounded-lg bg-slate-50">
        <div class="text-xl">${activity.icon}</div>
        <div class="flex-1">
          <p class="text-sm font-medium text-slate-900">${activity.title}</p>
          <p class="text-xs text-slate-500">${activity.time}</p>
        </div>
      </div>
    `).join('');
  }

  /**
   * Render upcoming exams
   */
  renderUpcomingExams() {
    const container = document.getElementById('upcoming-exams');
    if (!container) return;

    // Try to load upcoming exams
    this.loadUpcomingExams(container);
  }

  /**
   * Load upcoming exams
   */
  async loadUpcomingExams(container) {
    try {
      const exams = await quizBuilderService.listUpcomingExams();

      if (exams.length === 0) {
        container.innerHTML = `
          <div class="text-center py-4">
            <p class="text-sm text-slate-500">No upcoming exams scheduled</p>
          </div>
        `;
        return;
      }

      container.innerHTML = exams.slice(0, 5).map(exam => `
        <div class="flex items-center justify-between p-3 rounded-lg border border-slate-200">
          <div>
            <p class="text-sm font-medium text-slate-900">${exam.blueprint_title || 'Untitled Quiz'}</p>
            <p class="text-xs text-slate-500">${exam.classroom_name} • ${this.formatDate(exam.starts_at)}</p>
          </div>
          <div class="flex items-center gap-2">
            ${this.renderBadge(exam.status, exam.status === 'live' ? 'live' : 'default')}
          </div>
        </div>
      `).join('');
    } catch (error) {
      console.error('[Dashboard] Failed to load upcoming exams:', error);
      container.innerHTML = `
        <div class="text-center py-4">
          <p class="text-sm text-slate-500">Unable to load upcoming exams</p>
        </div>
      `;
    }
  }

  /**
   * Show a specific page
   */
  async showPage(page) {
    this.currentPage = page;

    // Update navigation active state
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('bg-cyan-600', 'text-white');
      item.classList.add('text-slate-700');
    });

    const activeNavItem = document.querySelector(`[data-page="${page}"]`);
    if (activeNavItem) {
      activeNavItem.classList.add('bg-cyan-600', 'text-white');
      activeNavItem.classList.remove('text-slate-700');
    }

    // Update page title and subtitle
    this.updatePageHeader(page);

    // Show page content
    const contentArea = document.getElementById('content-area');
    if (contentArea) {
      contentArea.classList.remove('hidden');
    }

    // Hide loading state
    const loadingState = document.getElementById('loading-state');
    if (loadingState) {
      loadingState.classList.add('hidden');
    }

    // Render page content
    await this.renderPageContent(page);
  }

  /**
   * Update page header
   */
  updatePageHeader(page) {
    const pageTitle = document.getElementById('page-title');
    const pageSubtitle = document.getElementById('page-subtitle');

    const pageInfo = {
      dashboard: { title: 'Dashboard', subtitle: 'Manage your quizzes and classrooms' },
      quizzes: { title: 'My Quizzes', subtitle: 'Create and manage your quiz blueprints' },
      classrooms: { title: 'Classrooms', subtitle: 'Manage student groups and access' },
      students: { title: 'Students', subtitle: 'View and manage student accounts' },
      analytics: { title: 'Analytics', subtitle: 'Track performance and insights' }
    };

    const info = pageInfo[page] || pageInfo.dashboard;
    if (pageTitle) pageTitle.textContent = info.title;
    if (pageSubtitle) pageSubtitle.textContent = info.subtitle;
  }

  /**
   * Render page content
   */
  async renderPageContent(page) {
    const dashboardContent = document.getElementById('dashboard-content');
    if (!dashboardContent) return;

    // Hide all content sections first
    dashboardContent.querySelectorAll('section').forEach(section => {
      section.classList.add('hidden');
    });

    switch (page) {
      case 'dashboard':
        dashboardContent.querySelectorAll('section').forEach(section => {
          section.classList.remove('hidden');
        });
        break;

      case 'quizzes':
        await this.renderQuizzesPage();
        break;

      case 'classrooms':
        await this.renderClassroomsPage();
        break;

      case 'students':
        await this.renderStudentsPage();
        break;

      case 'analytics':
        await this.renderAnalyticsPage();
        break;
    }
  }

  /**
   * Render quizzes page
   */
  async renderQuizzesPage() {
    if (!this.components.blueprintManager) {
      this.components.blueprintManager = new BlueprintManager({
        onBlueprintUpdate: () => this.loadMetrics()
      });
    }

    await this.components.blueprintManager.loadBlueprints();

    // Create quizzes page content
    const dashboardContent = document.getElementById('dashboard-content');
    const quizzesSection = dashboardContent.querySelector('#quizzes-content') || this.createQuizzesSection();
    quizzesSection.classList.remove('hidden');

    const container = quizzesSection.querySelector('#blueprints-container');
    this.components.blueprintManager.renderBlueprints(container);
  }

  /**
   * Create quizzes section
   */
  createQuizzesSection() {
    const dashboardContent = document.getElementById('dashboard-content');
    const section = document.createElement('section');
    section.id = 'quizzes-content';
    section.className = 'space-y-6 hidden';
    section.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-semibold text-slate-900">Quiz Blueprints</h3>
          <p class="text-sm text-slate-500">Your quiz templates and drafts</p>
        </div>
        <button
          class="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700"
          onclick="dashboard.createNewQuiz()"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6v12m6-6H6" />
          </svg>
          New Quiz
        </button>
      </div>
      <div id="blueprints-container" class="grid gap-6 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
        <!-- Blueprints will be rendered here -->
      </div>
    `;
    dashboardContent.appendChild(section);
    return section;
  }

  /**
   * Render classrooms page (placeholder)
   */
  async renderClassroomsPage() {
    const dashboardContent = document.getElementById('dashboard-content');
    const section = this.createPlaceholderSection('classrooms', 'Classroom management coming soon!');
    section.classList.remove('hidden');
  }

  /**
   * Render students page (placeholder)
   */
  async renderStudentsPage() {
    const dashboardContent = document.getElementById('dashboard-content');
    const section = this.createPlaceholderSection('students', 'Student management coming soon!');
    section.classList.remove('hidden');
  }

  /**
   * Render analytics page (placeholder)
   */
  async renderAnalyticsPage() {
    const dashboardContent = document.getElementById('dashboard-content');
    const section = this.createPlaceholderSection('analytics', 'Advanced analytics coming soon!');
    section.classList.remove('hidden');
  }

  /**
   * Create placeholder section
   */
  createPlaceholderSection(id, message) {
    const dashboardContent = document.getElementById('dashboard-content');
    let section = dashboardContent.querySelector(`#${id}-content`);

    if (!section) {
      section = document.createElement('section');
      section.id = `${id}-content`;
      section.className = 'space-y-6 hidden';
      section.innerHTML = `
        <div class="flex flex-col items-center justify-center py-12">
          <div class="text-center">
            <h3 class="text-lg font-medium text-slate-900 mb-2">Coming Soon</h3>
            <p class="text-sm text-slate-500">${message}</p>
          </div>
        </div>
      `;
      dashboardContent.appendChild(section);
    }

    return section;
  }

  /**
   * Create new quiz
   */
  async createNewQuiz() {
    try {
      const blueprint = await quizBuilderService.createBlueprint({
        title: 'New Quiz',
        description: '',
        settings: {}
      });

      showToast('Quiz created! Redirecting to builder...', { type: 'success' });

      // Redirect to builder
      setTimeout(() => {
        window.location.href = `../learner/exam-builder.html?blueprint=${blueprint.id}`;
      }, 1000);
    } catch (error) {
      console.error('[Dashboard] Failed to create quiz:', error);
      showToast('Failed to create quiz', { type: 'error' });
    }
  }

  /**
   * Refresh current page
   */
  async refreshCurrentPage() {
    this.showLoading();
    try {
      await this.loadUserData();
      await this.renderPageContent(this.currentPage);
      showToast('Dashboard refreshed', { type: 'success' });
    } catch (error) {
      console.error('[Dashboard] Failed to refresh:', error);
      showToast('Failed to refresh', { type: 'error' });
    } finally {
      this.hideLoading();
    }
  }

  /**
   * Handle logout
   */
  async handleLogout() {
    try {
      await authService.logout();
      showToast('Logged out successfully', { type: 'success' });
      setTimeout(() => {
        window.location.href = './quiz-builder-start.html';
      }, 1000);
    } catch (error) {
      console.error('[Dashboard] Failed to logout:', error);
      showToast('Failed to logout', { type: 'error' });
    }
  }

  /**
   * Show loading state
   */
  showLoading() {
    const loadingState = document.getElementById('loading-state');
    const contentArea = document.getElementById('content-area');

    if (loadingState) loadingState.classList.remove('hidden');
    if (contentArea) contentArea.classList.add('hidden');
  }

  /**
   * Hide loading state
   */
  hideLoading() {
    const loadingState = document.getElementById('loading-state');
    if (loadingState) loadingState.classList.add('hidden');
  }

  /**
   * Render badge helper
   */
  renderBadge(label, tone = 'default') {
    const palette = {
      default: 'bg-slate-100 text-slate-700',
      draft: 'bg-amber-100 text-amber-700',
      published: 'bg-emerald-100 text-emerald-700',
      live: 'bg-blue-100 text-blue-700',
      archived: 'bg-slate-200 text-slate-500',
      warning: 'bg-amber-100 text-amber-700',
      danger: 'bg-rose-100 text-rose-700',
    };
    return `<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${palette[tone] || palette.default}">${label}</span>`;
  }

  /**
   * Format date helper
   */
  formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}

// Export for global access
window.Dashboard = Dashboard;
/**
 * Instructor Dashboard JavaScript
 * Handles quiz management, classroom management, and analytics for individual instructors
 */

import { authService, RBAC, FeatureGating } from '../shared/auth.js';
import { showToast } from '../components/toast.js';

class InstructorDashboard {
  constructor() {
    this.state = {
      currentPage: 'dashboard',
      user: null,
      metrics: {
        totalQuizzes: 0,
        activeClassrooms: 0,
        totalStudents: 0,
        totalAttempts: 0,
        subscriptionUsage: {
          maxStudents: 50,
          maxClassrooms: 10,
          maxQuizzes: 100,
          currentStudents: 0,
          currentClassrooms: 0,
          currentQuizzes: 0,
        },
      },
      data: {
        quizzes: [],
        classrooms: [],
        students: [],
        recentActivity: [],
        upcomingExams: [],
      },
      loading: false,
    };

    this.init();
  }

  async init() {
    // Check authentication and permissions
    if (!authService.isAuthenticated()) {
      this.redirectToLogin();
      return;
    }

    if (!authService.isInstructor() && !authService.isSuperAdmin()) {
      showToast('Access denied. Instructor privileges required.', { type: 'error' });
      this.redirectToLogin();
      return;
    }

    this.state.user = authService.getCurrentUser();
    this.bindEvents();
    this.updateUserInfo();
    this.loadInitialData();
    this.setupNavigation();
    this.checkSubscriptionLimits();
  }

  redirectToLogin() {
    window.location.href = '../learner/login.html?redirect=' + encodeURIComponent(window.location.href);
  }

  bindEvents() {
    // Logout button
    document.getElementById('logout-btn')?.addEventListener('click', () => this.handleLogout());

    // Refresh button
    document.getElementById('refresh-btn')?.addEventListener('click', () => this.refreshData());

    // User menu dropdown
    const userMenuBtn = document.getElementById('user-menu-btn');
    const userDropdown = document.getElementById('user-dropdown');

    if (userMenuBtn && userDropdown) {
      userMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        userDropdown.classList.toggle('hidden');
      });

      // Close dropdown when clicking outside
      document.addEventListener('click', () => {
        userDropdown.classList.add('hidden');
      });
    }

    // Navigation items
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.dataset.page;
        if (page) {
          this.navigateToPage(page);
        }
      });
    });

    // Listen for auth changes
    authService.addListener('logout', () => this.redirectToLogin());
  }

  updateUserInfo() {
    const userNameEl = document.getElementById('user-name');
    const subscriptionPlanEl = document.getElementById('subscription-plan');

    if (userNameEl && this.state.user) {
      userNameEl.textContent = `${this.state.user.first_name} ${this.state.user.last_name}`;
    }

    if (subscriptionPlanEl && this.state.user?.subscription) {
      const planName = this.state.user.subscription.plan_type || 'basic';
      subscriptionPlanEl.textContent = `${planName.charAt(0).toUpperCase() + planName.slice(1)} Plan`;

      // Update subscription usage if available
      if (this.state.user.subscription.max_students) {
        this.state.metrics.subscriptionUsage = {
          maxStudents: this.state.user.subscription.max_students,
          maxClassrooms: this.state.user.subscription.max_classrooms,
          maxQuizzes: this.state.user.subscription.max_quizzes,
          currentStudents: 0,
          currentClassrooms: 0,
          currentQuizzes: 0,
        };
      }
    }
  }

  setupNavigation() {
    // Set up hash-based navigation
    window.addEventListener('hashchange', () => this.handleHashChange());
    this.handleHashChange();
  }

  handleHashChange() {
    const hash = window.location.hash.slice(1) || 'dashboard';
    this.navigateToPage(hash, false);
  }

  async navigateToPage(page, updateHash = true) {
    // Check permissions for page access
    if (!this.canAccessPage(page)) {
      showToast('Access denied or feature not available in your plan', { type: 'error' });
      return;
    }

    this.state.currentPage = page;

    if (updateHash) {
      window.location.hash = page;
    }

    // Update navigation UI
    document.querySelectorAll('.nav-item').forEach(item => {
      const isActive = item.dataset.page === page;
      if (isActive) {
        item.classList.add('text-white', 'bg-cyan-600', 'hover:bg-cyan-700');
        item.classList.remove('text-slate-700', 'hover:bg-slate-100');
      } else {
        item.classList.remove('text-white', 'bg-cyan-600', 'hover:bg-cyan-700');
        item.classList.add('text-slate-700', 'hover:bg-slate-100');
      }
    });

    // Update page header
    this.updatePageHeader(page);

    // Load page content
    await this.loadPageContent(page);
  }

  canAccessPage(page) {
    // Check RBAC permissions
    if (!RBAC.hasPermission(this.state.user, 'manage_own_quizzes') &&
        !['dashboard', 'profile', 'settings'].includes(page)) {
      return false;
    }

    // Check feature gating for advanced features
    const pageFeatures = {
      analytics: 'advanced_analytics',
      'new-classroom': 'manage_classrooms',
      'new-quiz': 'create_quizzes',
      'quizzes': 'manage_own_quizzes',
      'classrooms': 'manage_own_classrooms',
      'students': 'invite_students',
    };

    const requiredFeature = pageFeatures[page];
    if (requiredFeature && !FeatureGating.hasFeature(this.state.user, requiredFeature)) {
      showToast(`${this.formatFeatureName(requiredFeature)} is not available in your plan`, { type: 'warning' });
      return false;
    }

    return true;
  }

  formatFeatureName(feature) {
    const featureNames = {
      'create_quizzes': 'Quiz Creation',
      'manage_classrooms': 'Classroom Management',
      'advanced_analytics': 'Advanced Analytics',
      'invite_students': 'Student Management',
      'manage_own_quizzes': 'Quiz Management',
      'media_upload': 'Media Upload',
      'scheduled_exams': 'Exam Scheduling',
    };
    return featureNames[feature] || feature;
  }

  updatePageHeader(page) {
    const pageTitle = document.getElementById('page-title');
    const pageSubtitle = document.getElementById('page-subtitle');

    const pageHeaders = {
      dashboard: {
        title: 'Dashboard',
        subtitle: 'Manage your quizzes and classrooms',
      },
      quizzes: {
        title: 'My Quizzes',
        subtitle: 'Create and manage your quiz questions',
      },
      classrooms: {
        title: 'Classrooms',
        subtitle: 'Organize students and schedule exams',
      },
      students: {
        title: 'Students',
        subtitle: 'Manage student accounts and progress',
      },
      analytics: {
        title: 'Analytics',
        subtitle: 'Track performance and engagement',
      },
      profile: {
        title: 'Profile',
        subtitle: 'Manage your account settings',
      },
      settings: {
        title: 'Settings',
        subtitle: 'Preferences and configuration',
      },
      'new-quiz': {
        title: 'Create Quiz',
        subtitle: 'Start building a new quiz',
      },
      'new-classroom': {
        title: 'Create Classroom',
        subtitle: 'Set up a new learning environment',
      },
    };

    const header = pageHeaders[page] || pageHeaders.dashboard;
    if (pageTitle) pageTitle.textContent = header.title;
    if (pageSubtitle) pageSubtitle.textContent = header.subtitle;
  }

  async loadPageContent(page) {
    this.showLoading(true);

    try {
      switch (page) {
        case 'dashboard':
          await this.loadDashboard();
          break;
        case 'quizzes':
          await this.loadQuizzes();
          break;
        case 'classrooms':
          await this.loadClassrooms();
          break;
        case 'students':
          await this.loadStudents();
          break;
        case 'analytics':
          await this.loadAnalytics();
          break;
        case 'profile':
          await this.loadProfile();
          break;
        case 'settings':
          await this.loadSettings();
          break;
        case 'new-quiz':
          await this.showNewQuizModal();
          break;
        case 'new-classroom':
          await this.showNewClassroomModal();
          break;
        default:
          console.warn(`Unknown page: ${page}`);
          await this.loadDashboard();
      }
    } catch (error) {
      console.error(`Failed to load page ${page}:`, error);
      showToast('Failed to load page content', { type: 'error' });
    } finally {
      this.showLoading(false);
    }
  }

  async loadInitialData() {
    try {
      // Load dashboard metrics and recent activity
      await this.loadDashboardMetrics();
      await this.loadRecentActivity();
      await this.loadUpcomingExams();
    } catch (error) {
      console.error('Failed to load initial data:', error);
    }
  }

  async loadDashboard() {
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;

    // Show dashboard content
    document.getElementById('dashboard-content').classList.remove('hidden');

    // Hide other page contents
    document.getElementById('quizzes-content')?.classList.add('hidden');
    document.getElementById('classrooms-content')?.classList.add('hidden');
    document.getElementById('students-content')?.classList.add('hidden');
    document.getElementById('analytics-content')?.classList.add('hidden');
    document.getElementById('profile-content')?.classList.add('hidden');
    document.getElementById('settings-content')?.classList.add('hidden');

    contentArea.classList.remove('hidden');
  }

  async loadDashboardMetrics() {
    try {
      const response = await fetch('/api/instructor/dashboard/metrics', {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) throw new Error('Failed to load metrics');

      const metrics = await response.json();
      this.state.metrics = { ...this.state.metrics, ...metrics };

      // Update UI
      document.getElementById('total-quizzes').textContent = metrics.totalQuizzes.toLocaleString();
      document.getElementById('active-classrooms').textContent = metrics.activeClassrooms.toLocaleString();
      document.getElementById('total-students').textContent = metrics.totalStudents.toLocaleString();
      document.getElementById('total-attempts').textContent = metrics.totalAttempts.toLocaleString();

      // Update subscription usage
      if (metrics.subscriptionUsage) {
        this.state.metrics.subscriptionUsage = metrics.subscriptionUsage;
      }
    } catch (error) {
      console.error('Failed to load metrics:', error);
      // Set default values
      document.getElementById('total-quizzes').textContent = '0';
      document.getElementById('active-classrooms').textContent = '0';
      document.getElementById('total-students').textContent = '0';
      document.getElementById('total-attempts').textContent = '0';
    }
  }

  async loadRecentActivity() {
    try {
      const response = await fetch('/api/instructor/activity/recent', {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) throw new Error('Failed to load recent activity');

      const activities = await response.json();
      this.renderRecentActivity(activities);
    } catch (error) {
      console.error('Failed to load recent activity:', error);
      this.renderRecentActivity([]);
    }
  }

  renderRecentActivity(activities) {
    const container = document.getElementById('recent-activity');
    if (!container) return;

    if (activities.length === 0) {
      container.innerHTML = '<p class="text-sm text-slate-500">No recent activity</p>';
      return;
    }

    container.innerHTML = activities.map(activity => `
      <div class="flex items-start gap-3 p-3 border border-slate-100 rounded-lg">
        <div class="h-2 w-2 rounded-full mt-2 ${
          activity.type === 'quiz_created' ? 'bg-blue-500' :
          activity.type === 'classroom_created' ? 'bg-emerald-500' :
          activity.type === 'student_joined' ? 'bg-purple-500' :
          activity.type === 'exam_completed' ? 'bg-amber-500' :
          'bg-slate-500'
        }"></div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-slate-900">${activity.title}</p>
          <p class="text-xs text-slate-500">${activity.description}</p>
          <p class="text-xs text-slate-400 mt-1">${this.formatTimeAgo(activity.timestamp)}</p>
        </div>
      </div>
    `).join('');
  }

  async loadUpcomingExams() {
    try {
      const response = await fetch('/api/instructor/exams/upcoming', {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) throw new Error('Failed to load upcoming exams');

      const exams = await response.json();
      this.renderUpcomingExams(exams);
    } catch (error) {
      console.error('Failed to load upcoming exams:', error);
      this.renderUpcomingExams([]);
    }
  }

  renderUpcomingExams(exams) {
    const container = document.getElementById('upcoming-exams');
    if (!container) return;

    if (exams.length === 0) {
      container.innerHTML = '<p class="text-sm text-slate-500">No upcoming exams</p>';
      return;
    }

    container.innerHTML = exams.map(exam => `
      <div class="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer" onclick="navigateToPage('classrooms')">
        <div class="flex-1">
          <div class="flex items-center gap-3">
            <h4 class="text-sm font-medium text-slate-900">${exam.quizTitle}</h4>
            <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              exam.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
              exam.status === 'live' ? 'bg-emerald-100 text-emerald-700' :
              'bg-slate-100 text-slate-700'
            }">
              ${exam.status}
            </span>
          </div>
          <div class="text-sm text-slate-600">
            <span>${exam.classroomName}</span> • ${this.formatDate(exam.startsAt)} - ${this.formatDate(exam.endsAt)}
          </div>
        </div>
        <div class="text-sm text-slate-500">
          ${exam.expectedParticipants || 0} students
        </div>
      </div>
    `).join('');
  }

  async loadQuizzes() {
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;

    contentArea.innerHTML = '<div class="text-center py-12"><p class="text-slate-600">Loading quizzes...</p></div>';

    try {
      const response = await fetch('/api/instructor/quizzes', {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) throw new Error('Failed to load quizzes');

      const quizzes = await response.json();
      this.state.data.quizzes = quizzes;
      this.renderQuizzes(quizzes);
    } catch (error) {
      console.error('Failed to load quizzes:', error);
      contentArea.innerHTML = '<div class="text-center py-12"><p class="text-rose-600">Failed to load quizzes</p></div>';
    }
  }

  renderQuizzes(quizzes) {
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;

    if (quizzes.length === 0) {
      const emptyState = `
        <div id="quizzes-content" class="space-y-6">
          <div class="bg-white rounded-xl p-12 text-center border border-slate-200">
            <svg class="h-12 w-12 text-slate-400 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
            <h3 class="text-lg font-medium text-slate-900 mb-2">No quizzes yet</h3>
            <p class="text-slate-600 mb-4">Get started by creating your first quiz.</p>
            <button onclick="navigateToPage('new-quiz')" class="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v16m8-8H4" />
              </svg>
              Create Your First Quiz
            </button>
          </div>
        </div>
      `;
      contentArea.innerHTML = emptyState;
    } else {
      const quizzesHTML = `
        <div id="quizzes-content" class="space-y-6">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-slate-900">My Quizzes</h3>
            <button onclick="navigateToPage('new-quiz')" class="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v16m8-8H4" />
              </svg>
              New Quiz
            </button>
          </div>

          <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            ${quizzes.map(quiz => `
              <div class="bg-white rounded-xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div class="flex items-start justify-between mb-4">
                  <div>
                    <h4 class="text-base font-semibold text-slate-900">${quiz.title}</h4>
                    <p class="text-sm text-slate-500 mt-1 line-clamp-2">${quiz.description || 'No description'}</p>
                  </div>
                  <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    quiz.status === 'published' ? 'bg-emerald-100 text-emerald-700' :
                    quiz.status === 'draft' ? 'bg-amber-100 text-amber-700' :
                    'bg-slate-100 text-slate-700'
                  }">
                    ${quiz.status || 'draft'}
                  </span>
                </div>

                <div class="space-y-3 text-sm text-slate-600">
                  <div class="flex items-center justify-between">
                    <span>${quiz.totalQuestions || 0} questions</span>
                    <span>${quiz.estimatedDuration ? `${Math.round(quiz.estimatedDuration / 60)} min` : 'Not set'}</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span>${quiz.totalAttempts || 0} attempts</span>
                    <span>${quiz.averageScore ? `${Math.round(quiz.averageScore)}% avg` : 'No data'}</span>
                  </div>
                </div>

                <div class="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                  <button onclick="editQuiz('${quiz.id}')" class="text-cyan-600 hover:text-cyan-700 text-sm font-medium">Edit</button>
                  <button onclick="duplicateQuiz('${quiz.id}')" class="text-indigo-600 hover:text-indigo-700 text-sm font-medium">Duplicate</button>
                  <button onclick="previewQuiz('${quiz.id}')" class="text-slate-600 hover:text-slate-700 text-sm font-medium">Preview</button>
                  <button onclick="shareQuiz('${quiz.id}')" class="text-emerald-600 hover:text-emerald-700 text-sm font-medium">Share</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      contentArea.innerHTML = quizzesHTML;
      contentArea.classList.remove('hidden');
    }
  }

  async loadClassrooms() {
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;

    contentArea.innerHTML = '<div class="text-center py-12"><p class="text-slate-600">Loading classrooms...</p></div>';

    try {
      const response = await fetch('/api/instructor/classrooms', {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) throw new Error('Failed to load classrooms');

      const classrooms = await response.json();
      this.state.data.classrooms = classrooms;
      this.renderClassrooms(classrooms);
    } catch (error) {
      console.error('Failed to load classrooms:', error);
      contentArea.innerHTML = '<div class="text-center py-12"><p class="text-rose-600">Failed to load classrooms</p></div>';
    }
  }

  renderClassrooms(classrooms) {
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;

    if (classrooms.length === 0) {
      const emptyState = `
        <div id="classrooms-content" class="space-y-6">
          <div class="bg-white rounded-xl p-12 text-center border border-slate-200">
            <svg class="h-12 w-12 text-slate-400 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m0 0h-1m1 0h3M10 3v4M9 7h1m1 0v3h3m-3 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 class="text-lg font-medium text-slate-900 mb-2">No classrooms yet</h3>
            <p class="text-slate-600 mb-4">Create a classroom to organize students and schedule exams.</p>
            <button onclick="navigateToPage('new-classroom')" class="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6v6m0 0v6m0-6h6m-6 0h6" />
              </svg>
              Create Your First Classroom
            </button>
          </div>
        </div>
      `;
      contentArea.innerHTML = emptyState;
    } else {
      const classroomsHTML = `
        <div id="classrooms-content" class="space-y-6">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-slate-900">My Classrooms</h3>
            <button onclick="navigateToPage('new-classroom')" class="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6v6m0 0v6m0-6h6m-6 0h6" />
              </svg>
              New Classroom
            </button>
          </div>

          <div class="grid gap-6 md:grid-cols-2">
            ${classrooms.map(classroom => `
              <div class="bg-white rounded-xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div class="flex items-start justify-between mb-4">
                  <div>
                    <h4 class="text-base font-semibold text-slate-900">${classroom.name}</h4>
                    <p class="text-sm text-slate-500 mt-1">${classroom.purpose || 'No purpose'}</p>
                  </div>
                  <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    classroom.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                    classroom.status === 'suspended' ? 'bg-rose-100 text-rose-700' :
                    'bg-slate-100 text-slate-700'
                  }">
                    ${classroom.status || 'active'}
                  </span>
                </div>

                <div class="space-y-3 text-sm text-slate-600">
                  <div class="flex items-center justify-between">
                    <span>${classroom.activeParticipants || 0}/${classroom.seatQuota || 0} students</span>
                    <span>${classroom.pendingInvites || 0} pending</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span>${classroom.scheduledExamCount || 0} exams</span>
                    <span>${classroom.accessMode === 'open_link' ? 'Open link' :
                           classroom.accessMode === 'pin' ? 'PIN protected' :
                           'Invite only'}</span>
                  </div>
                </div>

                <div class="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                  <button onclick="manageClassroom('${classroom.id}')" class="text-cyan-600 hover:text-cyan-700 text-sm font-medium">Manage</button>
                  <button onclick="scheduleExam('${classroom.id}')" class="text-indigo-600 hover:text-indigo-700 text-sm font-medium">Schedule Exam</button>
                  <button onclick="viewAnalytics('${classroom.id}')" class="text-emerald-600 hover:text-emerald-700 text-sm font-medium">Analytics</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      contentArea.innerHTML = classroomsHTML;
      contentArea.classList.remove('hidden');
    }
  }

  async loadStudents() {
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;

    contentArea.innerHTML = '<div class="text-center py-12"><p class="text-slate-600">Loading students...</p></div>';

    try {
      const response = await fetch('/api/instructor/classrooms', {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) throw new Error('Failed to load classrooms');

      const classrooms = await response.json();
      const mapped = Array.isArray(classrooms)
        ? classrooms.map((room) => ({
            id: room.id,
            name: room.name,
            purpose: room.purpose,
            status: room.status,
            activeParticipants: room.active_participants ?? room.activeParticipants ?? 0,
            pendingInvites: room.pending_invites ?? room.pendingInvites ?? 0,
            seatQuota: room.seat_quota ?? room.seatQuota ?? 0,
            lastExamAt: room.next_exam_at ?? room.nextExamAt ?? null,
          }))
        : [];

      if (!mapped.length) {
        contentArea.innerHTML = `
          <div id="students-content" class="space-y-6">
            <div class="bg-white rounded-xl p-10 text-center border border-slate-200">
              <h3 class="text-lg font-semibold text-slate-900 mb-2">No enrolled students yet</h3>
              <p class="text-slate-600 mb-4">Invite learners to your classrooms to start tracking progress.</p>
              <button onclick="navigateToPage('new-classroom')" class="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700">
                Create Classroom
              </button>
            </div>
          </div>
        `;
      } else {
        const totalSeats = mapped.reduce((sum, room) => sum + Number(room.seatQuota || 0), 0);
        const totalStudents = mapped.reduce((sum, room) => sum + Number(room.activeParticipants || 0), 0);

        contentArea.innerHTML = `
          <div id="students-content" class="space-y-6">
            <section class="grid gap-4 md:grid-cols-3">
              <div class="rounded-xl border border-slate-200 bg-white p-5">
                <p class="text-xs uppercase text-slate-500">Active students</p>
                <p class="mt-2 text-2xl font-semibold text-slate-900">${totalStudents}</p>
              </div>
              <div class="rounded-xl border border-slate-200 bg-white p-5">
                <p class="text-xs uppercase text-slate-500">Seat capacity</p>
                <p class="mt-2 text-2xl font-semibold text-slate-900">${totalSeats}</p>
              </div>
              <div class="rounded-xl border border-slate-200 bg-white p-5">
                <p class="text-xs uppercase text-slate-500">Pending invites</p>
                <p class="mt-2 text-2xl font-semibold text-slate-900">${mapped.reduce((sum, room) => sum + Number(room.pendingInvites || 0), 0)}</p>
              </div>
            </section>

            <section class="bg-white rounded-xl border border-slate-200">
              <header class="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                <div>
                  <h3 class="text-base font-semibold text-slate-900">Classroom Rosters</h3>
                  <p class="text-sm text-slate-500">Snapshot of each classroom and current occupancy.</p>
                </div>
                <button onclick="navigateToPage('new-classroom')" class="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700">
                  Add Classroom
                </button>
              </header>
              <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-slate-200">
                  <thead class="bg-slate-50">
                    <tr>
                      <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Classroom</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Students</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Invites</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Next exam</th>
                    </tr>
                  </thead>
                  <tbody class="bg-white divide-y divide-slate-200">
                    ${mapped
                      .map(
                        (room) => `
                          <tr>
                            <td class="px-6 py-4 whitespace-nowrap">
                              <div class="text-sm font-medium text-slate-900">${room.name}</div>
                              <div class="text-xs text-slate-500">${room.purpose || 'General cohort'}</div>
                            </td>
                            <td class="px-6 py-4 text-sm text-slate-900">${room.activeParticipants}/${room.seatQuota}</td>
                            <td class="px-6 py-4 text-sm text-slate-900">${room.pendingInvites}</td>
                            <td class="px-6 py-4">
                              <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                room.status === 'active'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : room.status === 'suspended'
                                    ? 'bg-rose-100 text-rose-700'
                                    : 'bg-slate-100 text-slate-600'
                              }">${room.status || 'active'}</span>
                            </td>
                            <td class="px-6 py-4 text-sm text-slate-500">${room.lastExamAt ? new Date(room.lastExamAt).toLocaleString() : '—'}</td>
                          </tr>
                        `
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        `;
      }
    } catch (error) {
      console.error('Failed to load students', error);
      contentArea.innerHTML = '<div class="text-center py-12"><p class="text-rose-600">Unable to load classroom roster right now.</p></div>';
    }

    contentArea.classList.remove('hidden');
  }

  async loadAnalytics() {
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;

    if (!FeatureGating.hasFeature(this.state.user, 'advanced_analytics')) {
      contentArea.innerHTML = `
        <div class="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <svg class="h-12 w-12 text-amber-600 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.56A.996.996 0 01-1.24 1.23L12.01 18L8.23 15.77a.996.996 0 01-1.24-1.23L3.58 11.23c-.63.83-1.28.83-2.03-.83H4.25c.41 0 .75.34.75.75v1.5m-9.5 0h.01c.676 0 1.322.09 1.824.257m1.01-1.23v-6.585c0-1.01.756-1.24 1.23l.18.24V6.585z" />
          </svg>
          <h3 class="text-lg font-medium text-amber-800">Upgrade Required</h3>
          <p class="text-amber-700">Advanced analytics is available in the Pro plan or higher.</p>
          <button onclick="showUpgradeModal()" class="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700">
            Upgrade Plan
          </button>
        </div>
      `;
    } else {
      contentArea.innerHTML = '<div class="text-center py-12"><p class="text-slate-600">Loading analytics...</p></div>';

      try {
        const [metricsResponse, examsResponse] = await Promise.all([
          fetch('/api/instructor/dashboard/metrics', {
            headers: authService.getAuthHeaders(),
          }),
          fetch('/api/instructor/exams/upcoming', {
            headers: authService.getAuthHeaders(),
          }),
        ]);

        if (!metricsResponse.ok) {
          throw new Error('Failed to load metrics');
        }

        const metrics = await metricsResponse.json();
        const upcomingExams = examsResponse.ok ? await examsResponse.json() : [];

        const seatUsage = metrics.subscriptionUsage || {};
        const seatsAvailable = Math.max(
          (seatUsage.maxStudents || 0) - (seatUsage.currentStudents || 0),
          0
        );

        contentArea.innerHTML = `
          <div id="analytics-content" class="space-y-6">
            <section class="grid gap-4 md:grid-cols-4">
              <div class="rounded-xl border border-slate-200 bg-white p-5">
                <p class="text-xs uppercase text-slate-500">Total quizzes</p>
                <p class="mt-2 text-3xl font-semibold text-slate-900">${metrics.totalQuizzes}</p>
              </div>
              <div class="rounded-xl border border-slate-200 bg-white p-5">
                <p class="text-xs uppercase text-slate-500">Active classrooms</p>
                <p class="mt-2 text-3xl font-semibold text-slate-900">${metrics.activeClassrooms}</p>
              </div>
              <div class="rounded-xl border border-slate-200 bg-white p-5">
                <p class="text-xs uppercase text-slate-500">Active students</p>
                <p class="mt-2 text-3xl font-semibold text-slate-900">${metrics.totalStudents}</p>
              </div>
              <div class="rounded-xl border border-slate-200 bg-white p-5">
                <p class="text-xs uppercase text-slate-500">Attempts (30 days)</p>
                <p class="mt-2 text-3xl font-semibold text-slate-900">${metrics.totalAttempts}</p>
              </div>
            </section>

            <section class="grid gap-4 md:grid-cols-2">
              <div class="rounded-xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-blue-50 p-6">
                <div class="flex items-center justify-between mb-4">
                  <div>
                    <p class="text-xs uppercase text-cyan-600">Seat usage</p>
                    <h3 class="text-xl font-semibold text-slate-900">${seatUsage.currentStudents || 0}/${seatUsage.maxStudents || 0} learners</h3>
                  </div>
                  <span class="text-xs text-slate-500">Renews ${seatUsage.renewalDate ? new Date(seatUsage.renewalDate).toLocaleDateString() : '—'}</span>
                </div>
                <div class="h-2 w-full rounded-full bg-white/80">
                  <div class="h-full rounded-full bg-cyan-600" style="width: ${seatUsage.maxStudents ? Math.min(100, Math.round(((seatUsage.currentStudents || 0) / seatUsage.maxStudents) * 100)) : 0}%"></div>
                </div>
                <p class="mt-3 text-sm text-slate-600">${seatsAvailable} seats available • ${seatUsage.pricePerSeat ? `₦${Number(seatUsage.pricePerSeat).toLocaleString()} per learner` : 'Seat pricing not set'}</p>
              </div>

              <div class="rounded-xl border border-slate-200 bg-white p-6">
                <h3 class="text-base font-semibold text-slate-900 mb-3">Upcoming exams</h3>
                ${Array.isArray(upcomingExams) && upcomingExams.length
                  ? `<ul class="space-y-3 text-sm text-slate-600">${upcomingExams
                      .slice(0, 4)
                      .map(
                        (exam) => `
                          <li class="rounded-lg border border-slate-100 p-3">
                            <p class="font-medium text-slate-900">${exam.quiz_title || 'Untitled quiz'}</p>
                            <p class="text-xs text-slate-500">${exam.starts_at ? new Date(exam.starts_at).toLocaleString() : 'No schedule'}</p>
                            <p class="text-xs text-slate-400">${exam.classroom_name || 'Unassigned classroom'}</p>
                          </li>
                        `
                      )
                      .join('')}</ul>`
                  : '<p class="text-sm text-slate-500">No upcoming exams scheduled.</p>'}
              </div>
            </section>
          </div>
        `;
      } catch (error) {
        console.error('Failed to load analytics', error);
        contentArea.innerHTML = '<div class="text-center py-12"><p class="text-rose-600">Unable to load analytics right now.</p></div>';
      }
    }

    contentArea.classList.remove('hidden');
  }

  async loadProfile() {
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;

    contentArea.innerHTML = `
      <div id="profile-content" class="space-y-6">
        <div class="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <h3 class="text-lg font-semibold text-slate-900 mb-6">Profile Information</h3>

          <form id="profile-form" class="space-y-4">
            <div class="grid gap-4 md:grid-cols-2">
              <div>
                <label for="first-name" class="block text-sm font-medium text-slate-700">First Name</label>
                <input type="text" id="first-name" name="first-name" value="${this.state.user?.firstName || ''}" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
              </div>
              <div>
                <label for="last-name" class="block text-sm font-medium text-slate-700">Last Name</label>
                <input type="text" id="last-name" name="last-name" value="${this.state.user?.lastName || ''}" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
              </div>
              <div>
                <label for="email" class="block text-sm font-medium text-slate-700">Email</label>
                <input type="email" id="email" name="email" value="${this.state.user?.email || ''}" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400" disabled />
              </div>
              <div>
                <label for="phone" class="block text-sm font-medium text-slate-700">Phone</label>
                <input type="tel" id="phone" name="phone" value="${this.state.user?.phone || ''}" class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
              </div>
            </div>

            <div class="flex justify-end">
              <button type="submit" class="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700">
                Save Changes
              </button>
            </div>
          </form>
        </div>

        <div class="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <h3 class="text-lg font-semibold text-slate-900 mb-6">Subscription</h3>

          <div class="bg-gradient-to-r from-cyan-50 to-blue-50 rounded-lg p-4 border border-cyan-200">
            <div class="flex items-center justify-between mb-4">
              <div>
                <p class="text-sm font-medium text-slate-900">Current Plan</p>
                <p class="text-2xl font-bold text-slate-900">${this.state.user?.subscription?.plan_type || 'Basic'}</p>
              </div>
              <button onclick="showUpgradeModal()" class="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 hover:bg-slate-50">
                Upgrade
              </button>
            </div>

            <div class="grid gap-4 md:grid-cols-3">
              <div class="text-center">
                <p class="text-2xl font-bold text-slate-900">${this.state.metrics.subscriptionUsage.currentQuizzes}/${this.state.metrics.subscriptionUsage.maxQuizzes}</p>
                <p class="text-xs text-slate-500">Quizzes</p>
                <div class="mt-2 h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                  <div class="h-full bg-cyan-500 transition-all duration-300" style="width: ${Math.min(100, (this.state.metrics.subscriptionUsage.currentQuizzes / this.state.metrics.subscriptionUsage.maxQuizzes) * 100)}%"></div>
                </div>
              </div>
              <div class="text-center">
                <p class="text-2xl font-bold text-slate-900">${this.state.metrics.subscriptionUsage.currentClassrooms}/${this.state.metrics.subscriptionUsage.maxClassrooms}</p>
                <p class="text-xs text-slate-500">Classrooms</p>
                <div class="mt-2 h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                  <div class="h-full bg-emerald-500 transition-all duration-300" style="width: ${Math.min(100, (this.state.metrics.subscriptionUsage.currentClassrooms / this.state.metrics.subscriptionUsage.maxClassrooms) * 100)}%"></div>
                </div>
              </div>
              <div class="text-center">
                <p class="text-2xl font-bold text-slate-900">${this.state.metrics.subscriptionUsage.currentStudents}/${this.state.metrics.subscriptionUsage.maxStudents}</p>
                <p class="text-xs text-slate-500">Students</p>
                <div class="mt-2 h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                  <div class="h-full bg-purple-500 transition-all duration-300" style="width: ${Math.min(100, (this.state.metrics.subscriptionUsage.currentStudents / this.state.metrics.subscriptionUsage.maxStudents) * 100)}%"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    contentArea.classList.remove('hidden');

    // Add form submit handler
    const form = document.getElementById('profile-form');
    if (form) {
      form.addEventListener('submit', (e) => this.handleProfileSubmit(e));
    }
  }

  async loadSettings() {
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;

    contentArea.innerHTML = `
      <div id="settings-content" class="space-y-6">
        <div class="text-center py-12">
          <h3 class="text-lg font-medium text-slate-900">Settings</h3>
          <p class="text-slate-600">Settings and preferences are being developed.</p>
        </div>
      </div>
    `;

    contentArea.classList.remove('hidden');
  }

  async handleProfileSubmit(event) {
    event.preventDefault();

    const formData = new FormData(event.target);
    const profileData = {
      firstName: formData.get('first-name'),
      lastName: formData.get('last-name'),
      phone: formData.get('phone'),
    };

    try {
      const response = await fetch('/api/instructor/profile', {
        method: 'PUT',
        headers: {
          ...authService.getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(profileData),
      });

      if (!response.ok) throw new Error('Failed to update profile');

      const updatedUser = await response.json();
      this.state.user = updatedUser;
      authService.currentUser = updatedUser;

      // Update local storage
      localStorage.setItem('current_user', JSON.stringify(updatedUser));
      this.updateUserInfo();

      showToast('Profile updated successfully!', { type: 'success' });
    } catch (error) {
      console.error('Failed to update profile:', error);
      showToast('Failed to update profile', { type: 'error' });
    }
  }

  async checkSubscriptionLimits() {
    // Check if user is approaching limits
    const usage = this.state.metrics.subscriptionUsage;
    const thresholds = {
      warning: 0.8,
      critical: 0.95,
    };

    Object.entries(usage).forEach(([key, value]) => {
      const limit = usage[`max${key.charAt(0).toUpperCase() + key.slice(1)}`];
      if (limit && limit > 0) {
        const percentage = value / limit;
        if (percentage > thresholds.critical) {
          showToast(`You've reached your ${key} limit! Consider upgrading your plan.`, { type: 'error', persistent: true });
        } else if (percentage > thresholds.warning) {
          showToast(`You're approaching your ${key} limit (${Math.round(percentage * 100)}% used)`, { type: 'warning' });
        }
      }
    });
  }

  async showNewQuizModal() {
    // Check subscription limits
    if (!await this.checkSubscriptionLimit('quizzes', this.state.metrics.subscriptionUsage.currentQuizzes)) {
      return;
    }

    // This would open a modal to create a new quiz
    // For now, redirect to the existing quiz builder with a new blueprint parameter
    window.open(`/apps/learner/exam-builder.html?blueprint=new`, '_blank');
  }

  async showNewClassroomModal() {
    // Check subscription limits
    if (!await this.checkSubscriptionLimit('classrooms', this.state.metrics.subscriptionUsage.currentClassrooms)) {
      return;
    }

    // This would open a modal to create a new classroom
    showToast('Classroom creation modal coming soon!', { type: 'info' });
  }

  async showUpgradeModal() {
    showToast('Upgrade modal coming soon!', { type: 'info' });
  }

  editQuiz(quizId) {
    window.open(`/apps/learner/exam-builder.html?blueprint=${quizId}`, '_blank');
  }

  duplicateQuiz(quizId) {
    showToast('Duplicate quiz feature coming soon!', { type: 'info' });
  }

  previewQuiz(quizId) {
    window.open(`/apps/learner/exam-face.html?blueprint=${quizId}&preview=true`, '_blank');
  }

  shareQuiz(quizId) {
    showToast('Share quiz feature coming soon!', { type: 'info' });
  }

  manageClassroom(classroomId) {
    window.open(`/apps/admin/classroom.html?id=${classroomId}`, '_blank');
  }

  scheduleExam(classroomId) {
    showToast('Exam scheduling feature coming soon!', { type: 'info' });
  }

  viewAnalytics(classroomId) {
    showToast('Classroom analytics coming soon!', { type: 'info' });
  }

  async handleLogout() {
    try {
      await authService.logout();
    } catch (error) {
      console.error('Logout failed:', error);
      showToast('Logout failed', { type: 'error' });
    }
  }

  async refreshData() {
    try {
      this.showLoading(true);
      await Promise.all([
        this.loadDashboardMetrics(),
        this.loadRecentActivity(),
        this.loadUpcomingExams(),
      ]);

      showToast('Data refreshed!', { type: 'success' });
    } catch (error) {
      console.error('Failed to refresh data:', error);
      showToast('Failed to refresh data', { type: 'error' });
    } finally {
      this.showLoading(false);
    }
  }

  showLoading(show) {
    const loadingState = document.getElementById('loading-state');
    const contentArea = document.getElementById('content-area');

    if (show) {
      loadingState.classList.remove('hidden');
      if (contentArea) contentArea.classList.add('hidden');
    } else {
      loadingState.classList.add('hidden');
      if (contentArea) contentArea.classList.remove('hidden');
    }
  }

  formatTimeAgo(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
  }

  formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString();
  }
}

// Global function for navigation
window.navigateToPage = (page) => {
  if (window.instructorDashboard) {
    window.instructorDashboard.navigateToPage(page);
  }
};

window.showUpgradeModal = () => {
  if (window.instructorDashboard) {
    window.instructorDashboard.showUpgradeModal();
  }
};

// Initialize the dashboard
document.addEventListener('DOMContentLoaded', () => {
  window.instructorDashboard = new InstructorDashboard();
});

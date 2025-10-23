/**
 * Super Admin Dashboard JavaScript
 * Handles system-wide management, user administration, and analytics
 */

import { authService, RBAC } from '../shared/auth.js';
import { showToast } from '../components/toast.js';

class SuperAdminDashboard {
  constructor() {
    this.state = {
      currentPage: 'dashboard',
      user: null,
      metrics: {
        totalTenants: 0,
        totalUsers: 0,
        totalQuizzes: 0,
        monthlyRevenue: 0,
      },
      data: {
        tenants: [],
        users: [],
        subscriptions: [],
        recentActivity: [],
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

    if (!authService.isSuperAdmin()) {
      showToast('Access denied. Super admin privileges required.', { type: 'error' });
      this.redirectToLogin();
      return;
    }

    this.state.user = authService.getCurrentUser();
    this.bindEvents();
    this.updateUserInfo();
    this.loadInitialData();
    this.setupNavigation();
  }

  redirectToLogin() {
    window.location.href = '../learner/login.html?redirect=' + encodeURIComponent(window.location.href);
  }

  bindEvents() {
    // Logout button
    document.getElementById('logout-btn')?.addEventListener('click', () => this.handleLogout());

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
    if (userNameEl && this.state.user) {
      userNameEl.textContent = `${this.state.user.first_name} ${this.state.user.last_name}`;
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
    if (!RBAC.hasPermission(this.state.user, 'manage_all_tenants') && page !== 'dashboard') {
      showToast('Access denied', { type: 'error' });
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
        item.classList.add('text-white', 'bg-purple-600', 'hover:bg-purple-700');
        item.classList.remove('text-slate-700', 'hover:bg-slate-100');
      } else {
        item.classList.remove('text-white', 'bg-purple-600', 'hover:bg-purple-700');
        item.classList.add('text-slate-700', 'hover:bg-slate-100');
      }
    });

    // Update page header
    this.updatePageHeader(page);

    // Load page content
    await this.loadPageContent(page);
  }

  updatePageHeader(page) {
    const pageTitle = document.getElementById('page-title');
    const pageSubtitle = document.getElementById('page-subtitle');

    const pageHeaders = {
      dashboard: {
        title: 'Dashboard',
        subtitle: 'System overview and management',
      },
      tenants: {
        title: 'Tenants',
        subtitle: 'Manage organizations and schools',
      },
      users: {
        title: 'Users',
        subtitle: 'Manage system users and permissions',
      },
      subscriptions: {
        title: 'Subscriptions',
        subtitle: 'Manage subscription plans and billing',
      },
      analytics: {
        title: 'Analytics',
        subtitle: 'System-wide usage and performance metrics',
      },
      settings: {
        title: 'Settings',
        subtitle: 'System configuration and preferences',
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
        case 'tenants':
          await this.loadTenants();
          break;
        case 'users':
          await this.loadUsers();
          break;
        case 'subscriptions':
          await this.loadSubscriptions();
          break;
        case 'analytics':
          await this.loadAnalytics();
          break;
        case 'settings':
          await this.loadSettings();
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
    document.getElementById('tenants-content')?.classList.add('hidden');
    document.getElementById('users-content')?.classList.add('hidden');
    document.getElementById('subscriptions-content')?.classList.add('hidden');
    document.getElementById('analytics-content')?.classList.add('hidden');
    document.getElementById('settings-content')?.classList.add('hidden');

    contentArea.classList.remove('hidden');
  }

  async loadDashboardMetrics() {
    try {
      const response = await fetch('/api/admin/dashboard/metrics', {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) throw new Error('Failed to load metrics');

      const metrics = await response.json();
      this.state.metrics = { ...this.state.metrics, ...metrics };

      // Update UI
      document.getElementById('total-tenants').textContent = metrics.totalTenants.toLocaleString();
      document.getElementById('total-users').textContent = metrics.totalUsers.toLocaleString();
      document.getElementById('total-quizzes').textContent = metrics.totalQuizzes.toLocaleString();
      document.getElementById('monthly-revenue').textContent = `$${metrics.monthlyRevenue.toLocaleString()}`;
    } catch (error) {
      console.error('Failed to load metrics:', error);
      // Set default values
      document.getElementById('total-tenants').textContent = '0';
      document.getElementById('total-users').textContent = '0';
      document.getElementById('total-quizzes').textContent = '0';
      document.getElementById('monthly-revenue').textContent = '$0';
    }
  }

  async loadRecentActivity() {
    try {
      const response = await fetch('/api/admin/activity/recent', {
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
          activity.type === 'user_registered' ? 'bg-emerald-500' :
          activity.type === 'tenant_created' ? 'bg-blue-500' :
          activity.type === 'subscription_upgraded' ? 'bg-purple-500' :
          activity.type === 'quiz_created' ? 'bg-amber-500' :
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

  async loadTenants() {
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;

    // Show loading state
    contentArea.innerHTML = '<div class="text-center py-12"><p class="text-slate-600">Loading tenants...</p></div>';

    try {
      const response = await fetch('/api/admin/tenants', {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) throw new Error('Failed to load tenants');

      const tenants = await response.json();
      this.state.data.tenants = tenants;
      this.renderTenants(tenants);
    } catch (error) {
      console.error('Failed to load tenants:', error);
      contentArea.innerHTML = '<div class="text-center py-12"><p class="text-rose-600">Failed to load tenants</p></div>';
    }
  }

  renderTenants(tenants) {
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;

    const normalizedTenants = tenants.map((tenant) => {
      const userCount = Array.isArray(tenant.users)
        ? tenant.users.reduce((acc, row) => acc + Number(row?.count ?? 0), 0)
        : Number(tenant.users?.count ?? tenant.userCount ?? 0);
      const primaryPlan = Array.isArray(tenant.subscriptions) && tenant.subscriptions.length
        ? tenant.subscriptions[0]
        : tenant.subscriptions ?? null;
      const planType = primaryPlan?.plan_type || tenant.planType || 'basic';
      const createdAt = tenant.created_at || tenant.createdAt;
      const isActive = typeof tenant.is_active === 'boolean' ? tenant.is_active : tenant.isActive ?? true;
      return {
        id: tenant.id,
        name: tenant.name,
        description: tenant.description,
        slug: tenant.slug,
        userCount,
        planType,
        isActive,
        createdAt,
      };
    });

    const tenantsHTML = `
      <div id="tenants-content" class="space-y-6">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-slate-900">All Tenants</h3>
          <button onclick="showCreateTenantModal()" class="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v16m8-8H4" />
            </svg>
            Create Tenant
          </button>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table class="min-w-full divide-y divide-slate-200">
            <thead class="bg-slate-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Slug</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Users</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Plan</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Created</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-slate-200">
              ${normalizedTenants.map(tenant => `
                <tr>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm font-medium text-slate-900">${tenant.name}</div>
                    <div class="text-sm text-slate-500">${tenant.description || 'No description'}</div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-900">${tenant.slug}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-900">${tenant.userCount || 0}</td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      tenant.planType === 'enterprise' ? 'bg-purple-100 text-purple-700' :
                      tenant.planType === 'pro' ? 'bg-indigo-100 text-indigo-700' :
                      'bg-slate-100 text-slate-700'
                    }">
                      ${tenant.planType || 'basic'}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      tenant.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                    }">
                      ${tenant.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">${this.formatDate(tenant.createdAt)}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button onclick="viewTenant('${tenant.id}')" class="text-purple-600 hover:text-purple-900 mr-3">View</button>
                    <button onclick="editTenant('${tenant.id}')" class="text-indigo-600 hover:text-indigo-900 mr-3">Edit</button>
                    ${tenant.isActive ?
                      `<button onclick="suspendTenant('${tenant.id}')" class="text-amber-600 hover:text-amber-900">Suspend</button>` :
                      `<button onclick="activateTenant('${tenant.id}')" class="text-emerald-600 hover:text-emerald-900">Activate</button>`
                    }
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    contentArea.innerHTML = tenantsHTML;
    contentArea.classList.remove('hidden');
  }

  async loadUsers() {
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;

    contentArea.innerHTML = '<div class="text-center py-12"><p class="text-slate-600">Loading users...</p></div>';

    try {
      const response = await fetch('/api/admin/users', {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) throw new Error('Failed to load users');

      const users = await response.json();
      this.state.data.users = users;
      this.renderUsers(users);
    } catch (error) {
      console.error('Failed to load users:', error);
      contentArea.innerHTML = '<div class="text-center py-12"><p class="text-rose-600">Failed to load users</p></div>';
    }
  }

  renderUsers(users) {
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;

    const normalizedUsers = users.map((user) => {
      const firstName = user.first_name || user.firstName || '';
      const lastName = user.last_name || user.lastName || '';
      return {
        id: user.id,
        firstName,
        lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        tenantName: user.tenant?.name || user.tenantName || 'N/A',
        isActive: typeof user.is_active === 'boolean' ? user.is_active : user.isActive ?? true,
        emailVerified: typeof user.email_verified === 'boolean' ? user.email_verified : user.emailVerified ?? false,
        lastLoginAt: user.last_login_at || user.lastLoginAt || null,
      };
    });

    const usersHTML = `
      <div id="users-content" class="space-y-6">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-slate-900">All Users</h3>
          <button onclick="showInviteUserModal()" class="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            Invite User
          </button>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table class="min-w-full divide-y divide-slate-200">
            <thead class="bg-slate-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">User</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Email</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Role</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Tenant</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Last Login</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-slate-200">
              ${normalizedUsers.map(user => `
                <tr>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center">
                      <div class="h-10 w-10 flex-shrink-0">
                        <div class="h-10 w-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-white font-medium">
                          ${(user.firstName || 'A').charAt(0).toUpperCase()}${(user.lastName || 'N').charAt(0).toUpperCase()}
                        </div>
                      </div>
                      <div class="ml-4">
                        <div class="text-sm font-medium text-slate-900">${user.firstName} ${user.lastName}</div>
                        <div class="text-sm text-slate-500">${user.phone || 'No phone'}</div>
                      </div>
                    </div>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-900">${user.email}</td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      user.role === 'super_admin' ? 'bg-purple-100 text-purple-700' :
                      user.role === 'instructor' ? 'bg-blue-100 text-blue-700' :
                      'bg-slate-100 text-slate-700'
                    }">
                      ${user.role}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-900">${user.tenantName || 'N/A'}</td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      user.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                    }">
                      ${user.isActive ? 'Active' : 'Inactive'}
                    </span>
                    ${!user.emailVerified ? '<span class="ml-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-700">Unverified</span>' : ''}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">${user.lastLoginAt ? this.formatTimeAgo(user.lastLoginAt) : 'Never'}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button onclick="viewUser('${user.id}')" class="text-indigo-600 hover:text-indigo-900 mr-3">View</button>
                    <button onclick="editUser('${user.id}')" class="text-amber-600 hover:text-amber-900 mr-3">Edit</button>
                    ${user.isActive ?
                      `<button onclick="suspendUser('${user.id}')" class="text-rose-600 hover:text-rose-900">Suspend</button>` :
                      `<button onclick="activateUser('${user.id}')" class="text-emerald-600 hover:text-emerald-900">Activate</button>`
                    }
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    contentArea.innerHTML = usersHTML;
    contentArea.classList.remove('hidden');
  }

  async loadSubscriptions() {
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;

    contentArea.innerHTML = '<div class="text-center py-12"><p class="text-slate-600">Loading subscriptions...</p></div>';

    try {
      const response = await fetch('/api/admin/subscriptions', {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) throw new Error('Failed to load subscriptions');

      const subscriptions = await response.json();
      this.state.data.subscriptions = subscriptions;
      this.renderSubscriptions(subscriptions);
    } catch (error) {
      console.error('Failed to load subscriptions:', error);
      contentArea.innerHTML = '<div class="text-center py-12"><p class="text-rose-600">Failed to load subscriptions</p></div>';
    }
  }

  renderSubscriptions(subscriptions) {
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;

    const subscriptionsHTML = `
      <div id="subscriptions-content" class="space-y-6">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-slate-900">All Subscriptions</h3>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table class="min-w-full divide-y divide-slate-200">
            <thead class="bg-slate-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Tenant</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Plan</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Students</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Classrooms</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Quizzes</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Period</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-slate-200">
              ${subscriptions.map(sub => `
                <tr>
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">${sub.tenantName}</td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      sub.planType === 'enterprise' ? 'bg-purple-100 text-purple-700' :
                      sub.planType === 'pro' ? 'bg-indigo-100 text-indigo-700' :
                      'bg-slate-100 text-slate-700'
                    }">
                      ${sub.planType}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      sub.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                      sub.status === 'cancelled' ? 'bg-rose-100 text-rose-700' :
                      sub.status === 'expired' ? 'bg-amber-100 text-amber-700' :
                      'bg-slate-100 text-slate-700'
                    }">
                      ${sub.status}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-900">${sub.maxStudents || 'Unlimited'}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-900">${sub.maxClassrooms || 'Unlimited'}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-900">${sub.maxQuizzes || 'Unlimited'}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                    ${sub.startsAt ? this.formatDate(sub.startsAt) : '—'} to ${sub.endsAt ? this.formatDate(sub.endsAt) : 'Ongoing'}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button onclick="viewSubscription('${sub.id}')" class="text-indigo-600 hover:text-indigo-900 mr-3">View</button>
                    <button onclick="editSubscription('${sub.id}')" class="text-amber-600 hover:text-amber-900 mr-3">Edit</button>
                    <button onclick="cancelSubscription('${sub.id}')" class="text-rose-600 hover:text-rose-900">Cancel</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    contentArea.innerHTML = subscriptionsHTML;
    contentArea.classList.remove('hidden');
  }

  async loadAnalytics() {
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;

    contentArea.innerHTML = `
      <div id="analytics-content" class="space-y-6">
        <div class="text-center py-12">
          <svg class="h-12 w-12 text-slate-400 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <h3 class="text-lg font-medium text-slate-900 mb-2">Analytics Coming Soon</h3>
          <p class="text-slate-600">Advanced analytics and reporting features will be available soon.</p>
        </div>
      </div>
    `;

    contentArea.classList.remove('hidden');
  }

  async loadSettings() {
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;

    contentArea.innerHTML = `
      <div id="settings-content" class="space-y-6">
        <div class="text-center py-12">
          <svg class="h-12 w-12 text-slate-400 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31 2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h3 class="text-lg font-medium text-slate-900 mb-2">Settings Coming Soon</h3>
          <p class="text-slate-600">System configuration and preferences will be available soon.</p>
        </div>
      </div>
    `;

    contentArea.classList.remove('hidden');
  }

  async handleLogout() {
    try {
      await authService.logout();
    } catch (error) {
      console.error('Logout failed:', error);
      showToast('Logout failed', { type: 'error' });
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

// Action functions (accessible from HTML onclick handlers)
window.navigateToPage = (page) => {
  if (window.superAdminDashboard) {
    window.superAdminDashboard.navigateToPage(page);
  }
};

window.showCreateTenantModal = () => {
  showToast('Create tenant modal coming soon', { type: 'info' });
};

window.viewTenant = (id) => {
  showToast(`View tenant ${id}`, { type: 'info' });
};

window.editTenant = (id) => {
  showToast(`Edit tenant ${id}`, { type: 'info' });
};

window.suspendTenant = (id) => {
  showToast(`Suspend tenant ${id}`, { type: 'info' });
};

window.activateTenant = (id) => {
  showToast(`Activate tenant ${id}`, { type: 'info' });
};

window.showInviteUserModal = () => {
  showToast('Invite user modal coming soon', { type: 'info' });
};

window.viewUser = (id) => {
  showToast(`View user ${id}`, { type: 'info' });
};

window.editUser = (id) => {
  showToast(`Edit user ${id}`, { type: 'info' });
};

window.suspendUser = (id) => {
  showToast(`Suspend user ${id}`, { type: 'info' });
};

window.activateUser = (id) => {
  showToast(`Activate user ${id}`, { type: 'info' });
};

window.viewSubscription = (id) => {
  showToast(`View subscription ${id}`, { type: 'info' });
};

window.editSubscription = (id) => {
  showToast(`Edit subscription ${id}`, { type: 'info' });
};

window.cancelSubscription = (id) => {
  showToast(`Cancel subscription ${id}`, { type: 'info' });
};

// Initialize the dashboard
document.addEventListener('DOMContentLoaded', () => {
  window.superAdminDashboard = new SuperAdminDashboard();
});

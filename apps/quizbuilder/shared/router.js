/**
 * Multi-tenant Router with Role-based Navigation
 * Handles routing and navigation based on user roles and permissions
 */

export class Router {
  constructor() {
    this.routes = new Map();
    this.currentRoute = null;
    this.guards = new Map();
    this.middleware = [];
    this.history = [];
    this.defaultRoute = '/login';
    this.notFoundRoute = '/404';
  }

  // Initialize router with user context
  initialize(user, tenant) {
    this.user = user;
    this.tenant = tenant;
    this.setupRoleBasedRoutes();
  }

  // Define route with metadata
  defineRoute(path, component, options = {}) {
    this.routes.set(path, {
      path,
      component,
      title: options.title || 'Quiz Builder',
      description: options.description || '',
      requiresAuth: options.requiresAuth !== false,
      roles: options.roles || [],
      features: options.features || [],
      meta: options.meta || {},
      layout: options.layout || 'default'
    });
  }

  // Set up routes based on user roles
  setupRoleBasedRoutes() {
    // Public routes
    this.defineRoute('/login', 'LoginPage', {
      title: 'Login',
      requiresAuth: false,
      meta: { public: true }
    });

    this.defineRoute('/register', 'RegisterPage', {
      title: 'Register',
      requiresAuth: false,
      meta: { public: true }
    });

    this.defineRoute('/forgot-password', 'ForgotPasswordPage', {
      title: 'Forgot Password',
      requiresAuth: false,
      meta: { public: true }
    });

    this.defineRoute('/reset-password', 'ResetPasswordPage', {
      title: 'Reset Password',
      requiresAuth: false,
      meta: { public: true }
    });

    this.defineRoute('/pricing', 'PricingPage', {
      title: 'Pricing',
      requiresAuth: false,
      meta: { public: true }
    });

    // Super Admin routes
    this.defineRoute('/super-admin', 'SuperAdminDashboard', {
      title: 'Super Admin Dashboard',
      roles: ['super_admin'],
      layout: 'admin'
    });

    this.defineRoute('/super-admin/dashboard', 'SuperAdminDashboard', {
      title: 'Dashboard',
      roles: ['super_admin'],
      layout: 'admin'
    });

    this.defineRoute('/super-admin/tenants', 'TenantsManagement', {
      title: 'Tenants',
      roles: ['super_admin'],
      layout: 'admin'
    });

    this.defineRoute('/super-admin/users', 'UsersManagement', {
      title: 'Users',
      roles: ['super_admin'],
      layout: 'admin'
    });

    this.defineRoute('/super-admin/subscriptions', 'SubscriptionsManagement', {
      title: 'Subscriptions',
      roles: ['super_admin'],
      layout: 'admin'
    });

    this.defineRoute('/super-admin/analytics', 'SystemAnalytics', {
      title: 'Analytics',
      roles: ['super_admin'],
      layout: 'admin'
    });

    this.defineRoute('/super-admin/settings', 'SystemSettings', {
      title: 'Settings',
      roles: ['super_admin'],
      layout: 'admin'
    });

    // Instructor routes
    this.defineRoute('/instructor', 'InstructorDashboard', {
      title: 'Instructor Dashboard',
      roles: ['instructor'],
      layout: 'instructor'
    });

    this.defineRoute('/instructor/dashboard', 'InstructorDashboard', {
      title: 'Dashboard',
      roles: ['instructor'],
      layout: 'instructor'
    });

    this.defineRoute('/instructor/quizzes', 'QuizzesManagement', {
      title: 'My Quizzes',
      roles: ['instructor'],
      features: ['create_quizzes'],
      layout: 'instructor'
    });

    this.defineRoute('/instructor/quizzes/new', 'QuizBuilder', {
      title: 'Create Quiz',
      roles: ['instructor'],
      features: ['create_quizzes'],
      layout: 'instructor'
    });

    this.defineRoute('/instructor/quizzes/:id', 'QuizEditor', {
      title: 'Edit Quiz',
      roles: ['instructor'],
      features: ['create_quizzes'],
      layout: 'instructor'
    });

    this.defineRoute('/instructor/quizzes/:id/analytics', 'QuizAnalytics', {
      title: 'Quiz Analytics',
      roles: ['instructor'],
      features: ['basic_analytics'],
      layout: 'instructor'
    });

    this.defineRoute('/instructor/classrooms', 'ClassroomsManagement', {
      title: 'Classrooms',
      roles: ['instructor'],
      features: ['manage_classrooms'],
      layout: 'instructor'
    });

    this.defineRoute('/instructor/classrooms/new', 'ClassroomBuilder', {
      title: 'Create Classroom',
      roles: ['instructor'],
      features: ['manage_classrooms'],
      layout: 'instructor'
    });

    this.defineRoute('/instructor/classrooms/:id', 'ClassroomDetail', {
      title: 'Classroom Detail',
      roles: ['instructor'],
      features: ['manage_classrooms'],
      layout: 'instructor'
    });

    this.defineRoute('/instructor/students', 'StudentsManagement', {
      title: 'Students',
      roles: ['instructor'],
      features: ['invite_students'],
      layout: 'instructor'
    });

    this.defineRoute('/instructor/analytics', 'InstructorAnalytics', {
      title: 'Analytics',
      roles: ['instructor'],
      features: ['basic_analytics'],
      layout: 'instructor'
    });

    this.defineRoute('/instructor/settings', 'InstructorSettings', {
      title: 'Settings',
      roles: ['instructor'],
      layout: 'instructor'
    });

    this.defineRoute('/instructor/subscription', 'SubscriptionManagement', {
      title: 'Subscription',
      roles: ['instructor'],
      layout: 'instructor'
    });

    // Student routes
    this.defineRoute('/student', 'StudentDashboard', {
      title: 'Student Dashboard',
      roles: ['student'],
      layout: 'student'
    });

    this.defineRoute('/student/dashboard', 'StudentDashboard', {
      title: 'Dashboard',
      roles: ['student'],
      layout: 'student'
    });

    this.defineRoute('/student/quizzes', 'StudentQuizzes', {
      title: 'Available Quizzes',
      roles: ['student'],
      features: ['take_quizzes'],
      layout: 'student'
    });

    this.defineRoute('/student/quiz/:id', 'TakeQuiz', {
      title: 'Take Quiz',
      roles: ['student'],
      features: ['take_quizzes'],
      layout: 'student'
    });

    this.defineRoute('/student/results', 'StudentResults', {
      title: 'My Results',
      roles: ['student'],
      features: ['view_own_results'],
      layout: 'student'
    });

    this.defineRoute('/student/result/:id', 'ResultDetail', {
      title: 'Result Detail',
      roles: ['student'],
      features: ['view_own_results'],
      layout: 'student'
    });

    this.defineRoute('/student/profile', 'StudentProfile', {
      title: 'Profile',
      roles: ['student'],
      layout: 'student'
    });

    // Error pages
    this.defineRoute('/404', 'NotFoundPage', {
      title: 'Page Not Found',
      requiresAuth: false,
      meta: { error: true }
    });

    this.defineRoute('/403', 'ForbiddenPage', {
      title: 'Access Denied',
      requiresAuth: false,
      meta: { error: true }
    });

    this.defineRoute('/500', 'ServerErrorPage', {
      title: 'Server Error',
      requiresAuth: false,
      meta: { error: true }
    });
  }

  // Add route guard
  addGuard(path, guardFunction) {
    if (!this.guards.has(path)) {
      this.guards.set(path, []);
    }
    this.guards.get(path).push(guardFunction);
  }

  // Add middleware
  addMiddleware(middlewareFunction) {
    this.middleware.push(middlewareFunction);
  }

  // Navigate to route
  async navigate(path, options = {}) {
    const { replace = false, state = {} } = options;

    // Add to history
    if (!replace) {
      this.history.push({
        path,
        state,
        timestamp: Date.now()
      });
    }

    // Update current route
    this.currentRoute = path;

    // Update browser URL
    if (options.updateUrl !== false) {
      if (replace) {
        history.replaceState(state, '', path);
      } else {
        history.pushState(state, '', path);
      }
    }

    // Process middleware
    for (const middleware of this.middleware) {
      await middleware(path, state);
    }

    // Render route
    await this.renderRoute(path, state);
  }

  // Render route component
  async renderRoute(path, state = {}) {
    try {
      const route = this.resolveRoute(path);

      if (!route) {
        await this.navigate(this.notFoundRoute, { replace: true });
        return;
      }

      // Check authentication
      if (route.requiresAuth && !this.isAuthenticated()) {
        await this.navigate('/login', { replace: true });
        return;
      }

      // Check roles
      if (route.roles.length > 0 && !this.hasRole(route.roles)) {
        await this.navigate('/403', { replace: true });
        return;
      }

      // Check features
      if (route.features.length > 0 && !this.hasFeatures(route.features)) {
        await this.navigate('/403', { replace: true });
        return;
      }

      // Run route guards
      const guards = this.guards.get(route.path) || [];
      for (const guard of guards) {
        const canProceed = await guard(route, state);
        if (!canProceed) {
          return;
        }
      }

      // Update page title
      document.title = route.title;

      // Load and render component
      await this.loadComponent(route.component, route, state);

    } catch (error) {
      console.error('Route rendering error:', error);
      await this.navigate('/500', { replace: true });
    }
  }

  // Resolve route (supports params)
  resolveRoute(path) {
    // Exact match first
    if (this.routes.has(path)) {
      return this.routes.get(path);
    }

    // Pattern matching for dynamic routes
    for (const [routePath, route] of this.routes) {
      if (this.pathMatches(routePath, path)) {
        route.params = this.extractParams(routePath, path);
        return route;
      }
    }

    return null;
  }

  // Check if path matches route pattern
  pathMatches(routePath, path) {
    const routeSegments = routePath.split('/');
    const pathSegments = path.split('/');

    if (routeSegments.length !== pathSegments.length) {
      return false;
    }

    return routeSegments.every((segment, index) => {
      return segment.startsWith(':') || segment === pathSegments[index];
    });
  }

  // Extract params from path
  extractParams(routePath, path) {
    const routeSegments = routePath.split('/');
    const pathSegments = path.split('/');
    const params = {};

    routeSegments.forEach((segment, index) => {
      if (segment.startsWith(':')) {
        const paramName = segment.substring(1);
        params[paramName] = pathSegments[index];
      }
    });

    return params;
  }

  // Load component dynamically
  async loadComponent(componentName, route, state) {
    const appContainer = document.getElementById('app') || document.body;

    // Show loading state
    this.showLoadingState(appContainer);

    try {
      let component;

      // Map component names to actual modules
      const componentMap = {
        // Auth components
        'LoginPage': () => import('../learner/login.html'),
        'RegisterPage': () => import('../learner/registration-before-payment.html'),
        'ForgotPasswordPage': () => import('../learner/forgot-password.html'),
        'ResetPasswordPage': () => import('../learner/reset-password.html'),
        'PricingPage': () => import('../learner/subscription-plans.html'),

        // Super Admin components
        'SuperAdminDashboard': () => import('../admin/super-admin.html'),
        'TenantsManagement': () => import('../admin/tenants.html'),
        'UsersManagement': () => import('../admin/users.html'),
        'SubscriptionsManagement': () => import('../admin/subscriptions.html'),
        'SystemAnalytics': () => import('../admin/analytics.html'),
        'SystemSettings': () => import('../admin/settings.html'),

        // Instructor components
        'InstructorDashboard': () => import('../admin/instructor.html'),
        'QuizzesManagement': () => import('../admin/quizzes.html'),
        'QuizBuilder': () => import('../learner/exam-builder.html'),
        'QuizEditor': () => import('../learner/exam-builder.html'),
        'QuizAnalytics': () => import('../admin/quiz-analytics.html'),
        'ClassroomsManagement': () => import('../admin/classroom.html'),
        'ClassroomBuilder': () => import('../admin/classroom-builder.html'),
        'ClassroomDetail': () => import('../admin/classroom-detail.html'),
        'StudentsManagement': () => import('../admin/students.html'),
        'InstructorAnalytics': () => import('../admin/analytics.html'),
        'InstructorSettings': () => import('../admin/settings.html'),
        'SubscriptionManagement': () => import('../admin/subscription.html'),

        // Student components
        'StudentDashboard': () => import('../learner/index.html'),
        'StudentQuizzes': () => import('../learner/quizzes.html'),
        'TakeQuiz': () => import('../learner/exam-face.html'),
        'StudentResults': () => import('../learner/results.html'),
        'ResultDetail': () => import('../learner/result-detail.html'),
        'StudentProfile': () => import('../learner/profile.html'),

        // Error pages
        'NotFoundPage': () => this.renderErrorPage('404', 'Page Not Found'),
        'ForbiddenPage': () => this.renderErrorPage('403', 'Access Denied'),
        'ServerErrorPage': () => this.renderErrorPage('500', 'Server Error')
      };

      const componentLoader = componentMap[componentName];
      if (!componentLoader) {
        throw new Error(`Component ${componentName} not found`);
      }

      // Load component
      if (typeof componentLoader === 'function') {
        component = await componentLoader();
      }

      // Render component
      await this.renderComponent(component, route, state, appContainer);

    } catch (error) {
      console.error('Component loading error:', error);
      this.renderErrorPage('500', 'Failed to load page');
    }
  }

  // Show loading state
  showLoadingState(container) {
    container.innerHTML = `
      <div class="flex items-center justify-center min-h-screen">
        <div class="flex flex-col items-center gap-4">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600"></div>
          <p class="text-gray-600">Loading...</p>
        </div>
      </div>
    `;
  }

  // Render component in container
  async renderComponent(component, route, state, container) {
    // If component is HTML content, inject it
    if (typeof component === 'string') {
      container.innerHTML = component;
    } else if (component.default) {
      // Handle ES module imports
      container.innerHTML = component.default;
    }

    // Initialize component scripts if any
    await this.initializeComponentScripts(route.component, route.params, state);
  }

  // Initialize component scripts
  async initializeComponentScripts(componentName, params, state) {
    // Map components to their initialization functions
    const scriptMap = {
      'SuperAdminDashboard': () => import('../admin/src/superAdmin.js'),
      'InstructorDashboard': () => import('../admin/src/instructorDashboard.js'),
      'QuizBuilder': () => import('../learner/src/examBuilder.js'),
      'TakeQuiz': () => import('../learner/src/examFace.js')
    };

    const scriptLoader = scriptMap[componentName];
    if (scriptLoader) {
      try {
        const module = await scriptLoader();
        if (module.default && typeof module.default === 'function') {
          module.default(params, state);
        }
      } catch (error) {
        console.error('Script initialization error:', error);
      }
    }
  }

  // Render error page
  renderErrorPage(code, message) {
    return `
      <div class="min-h-screen flex items-center justify-center bg-gray-50">
        <div class="max-w-md w-full text-center">
          <div class="mb-8">
            <h1 class="text-6xl font-bold text-gray-900 mb-4">${code}</h1>
            <p class="text-xl text-gray-600">${message}</p>
          </div>
          <div class="space-y-4">
            <button onclick="window.history.back()" class="block w-full px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors">
              Go Back
            </button>
            <a href="/" class="block w-full px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors text-center">
              Go Home
            </a>
          </div>
        </div>
      </div>
    `;
  }

  // Authentication helpers
  isAuthenticated() {
    return !!this.user && !!localStorage.getItem('auth_token');
  }

  hasRole(requiredRoles) {
    if (!this.user) return false;
    if (Array.isArray(requiredRoles)) {
      return requiredRoles.includes(this.user.role);
    }
    return this.user.role === requiredRoles;
  }

  hasFeatures(requiredFeatures) {
    if (!this.user) return false;

    // Import subscription gating if available
    if (typeof subscriptionGating !== 'undefined') {
      return requiredFeatures.every(feature => subscriptionGating.hasFeatureAccess(feature));
    }

    // Basic feature check without subscription gating
    const userPlan = this.user.subscription?.plan_type || 'basic';
    const basicFeatures = ['create_quizzes', 'manage_classrooms', 'basic_analytics'];

    return requiredFeatures.every(feature => {
      if (userPlan === 'enterprise') return true;
      if (userPlan === 'pro') return !['unlimited_students', 'custom_branding'].includes(feature);
      return basicFeatures.includes(feature);
    });
  }

  // Get navigation items for current user
  getNavigationItems() {
    if (!this.user) return [];

    const navigationMap = {
      super_admin: [
        { path: '/super-admin/dashboard', label: 'Dashboard', icon: 'dashboard' },
        { path: '/super-admin/tenants', label: 'Tenants', icon: 'building' },
        { path: '/super-admin/users', label: 'Users', icon: 'users' },
        { path: '/super-admin/subscriptions', label: 'Subscriptions', icon: 'credit-card' },
        { path: '/super-admin/analytics', label: 'Analytics', icon: 'chart-bar' },
        { path: '/super-admin/settings', label: 'Settings', icon: 'cog' }
      ],
      instructor: [
        { path: '/instructor/dashboard', label: 'Dashboard', icon: 'dashboard' },
        { path: '/instructor/quizzes', label: 'My Quizzes', icon: 'document-text' },
        { path: '/instructor/classrooms', label: 'Classrooms', icon: 'academic-cap' },
        { path: '/instructor/students', label: 'Students', icon: 'users' },
        { path: '/instructor/analytics', label: 'Analytics', icon: 'chart-bar' },
        { path: '/instructor/subscription', label: 'Subscription', icon: 'credit-card' }
      ],
      student: [
        { path: '/student/dashboard', label: 'Dashboard', icon: 'dashboard' },
        { path: '/student/quizzes', label: 'Available Quizzes', icon: 'document-text' },
        { path: '/student/results', label: 'My Results', icon: 'chart-bar' },
        { path: '/student/profile', label: 'Profile', icon: 'user' }
      ]
    };

    return navigationMap[this.user.role] || [];
  }

  // Start router
  start() {
    // Handle initial route
    const currentPath = window.location.pathname;
    this.navigate(currentPath, { replace: true });

    // Handle navigation events
    window.addEventListener('popstate', (event) => {
      this.navigate(window.location.pathname, {
        state: event.state || {},
        replace: true
      });
    });

    // Handle link clicks
    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[data-route]');
      if (link) {
        event.preventDefault();
        const path = link.getAttribute('href') || link.getAttribute('data-route');
        this.navigate(path);
      }
    });
  }

  // Utility methods
  back() {
    if (this.history.length > 1) {
      this.history.pop();
      const previousRoute = this.history[this.history.length - 1];
      this.navigate(previousRoute.path, { replace: true, state: previousRoute.state });
    } else {
      this.navigate('/', { replace: true });
    }
  }

  refresh() {
    if (this.currentRoute) {
      this.navigate(this.currentRoute, { replace: true });
    }
  }
}

// Export singleton instance
export const router = new Router();

// Export convenience functions
export const defineRoute = (path, component, options) => {
  router.defineRoute(path, component, options);
};

export const navigate = (path, options) => {
  return router.navigate(path, options);
};

export const addGuard = (path, guardFunction) => {
  router.addGuard(path, guardFunction);
};

export const addMiddleware = (middlewareFunction) => {
  router.addMiddleware(middlewareFunction);
};
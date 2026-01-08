/**
 * Application Initializer
 * Sets up the multi-tenant quiz builder application with proper authentication,
 * routing, and feature gating
 */

import { authService } from './auth.js';
import { dataIsolation } from './dataIsolation.js';
import { subscriptionGating } from './subscriptionGating.js';
import { router } from './router.js';

export class AppInitializer {
  constructor() {
    this.isInitialized = false;
    this.currentUser = null;
    this.currentTenant = null;
    this.initPromise = null;
  }

  // Initialize the application
  async initialize() {
    if (this.isInitialized) {
      return Promise.resolve();
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._doInitialize();
    return this.initPromise;
  }

  async _doInitialize() {
    try {
      console.log('🚀 Initializing Quiz Builder Application...');

      // Step 1: Initialize authentication
      await this.initializeAuth();

      // Step 2: Initialize router
      await this.initializeRouter();

      // Step 3: Initialize data isolation
      await this.initializeDataIsolation();

      // Step 4: Initialize subscription gating
      await this.initializeSubscriptionGating();

      // Step 5: Set up global event listeners
      this.setupEventListeners();

      // Step 6: Start router
      router.start();

      this.isInitialized = true;
      console.log('✅ Application initialized successfully');

      // Emit initialization complete event
      window.dispatchEvent(
        new CustomEvent('app:initialized', {
          detail: { user: this.currentUser, tenant: this.currentTenant },
        })
      );
    } catch (error) {
      console.error('❌ Application initialization failed:', error);
      this.handleInitializationError(error);
      throw error;
    }
  }

  // Initialize authentication
  async initializeAuth() {
    console.log('🔐 Initializing authentication...');

    // Set up auth event listeners
    authService.addListener('login', (user) => {
      this.handleUserLogin(user);
    });

    authService.addListener('logout', () => {
      this.handleUserLogout();
    });

    authService.addListener('profile_update', (user) => {
      this.handleUserUpdate(user);
    });

    // Check for existing session
    if (authService.isAuthenticated()) {
      this.currentUser = authService.getCurrentUser();

      // Get tenant information for instructors
      if (this.currentUser.role !== 'super_admin') {
        await this.loadTenantData();
      }

      console.log(
        `✅ Authenticated as ${this.currentUser.role}:`,
        this.currentUser.email
      );
    } else {
      console.log('ℹ️ No active session found');
    }
  }

  // Load tenant data for non-super-admin users
  async loadTenantData() {
    try {
      const response = await fetch('/api/users/tenant', {
        headers: authService.getAuthHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        this.currentTenant = data.tenant;
      }
    } catch (error) {
      console.warn('Failed to load tenant data:', error);
    }
  }

  // Initialize router
  async initializeRouter() {
    console.log('🛣️ Initializing router...');

    // Initialize router with user context
    router.initialize(this.currentUser, this.currentTenant);

    // Add authentication guard
    router.addGuard('*', async (route, _state) => {
      if (route.requiresAuth && !authService.isAuthenticated()) {
        console.log('🔒 Authentication required, redirecting to login');
        await router.navigate('/login', { replace: true });
        return false;
      }
      return true;
    });

    // Add role-based guard
    router.addGuard('*', async (route, _state) => {
      if (route.roles.length > 0 && !router.hasRole(route.roles)) {
        console.log('🚫 Insufficient permissions for route:', route.path);
        await router.navigate('/403', { replace: true });
        return false;
      }
      return true;
    });

    // Add feature-based guard
    router.addGuard('*', async (route, _state) => {
      if (route.features.length > 0 && !router.hasFeatures(route.features)) {
        console.log('🔒 Feature access denied for route:', route.path);

        // Show upgrade prompt if subscription gating is available
        if (typeof subscriptionGating !== 'undefined') {
          subscriptionGating.showUpgradePrompt(route.features[0]);
        }

        await router.navigate('/403', { replace: true });
        return false;
      }
      return true;
    });

    // Add tenant context middleware
    router.addMiddleware(async (_path, _state) => {
      // Add tenant headers to all future API requests
      if (this.currentTenant) {
        const originalFetch = window.fetch;
        window.fetch = function (input, init = {}) {
          init.headers = {
            ...init.headers,
            'X-Tenant-ID': appInitializer.currentTenant?.id,
            'X-User-ID': appInitializer.currentUser?.id,
            'X-User-Role': appInitializer.currentUser?.role,
          };
          return originalFetch.call(this, input, init);
        };
      }
    });

    console.log('✅ Router initialized');
  }

  // Initialize data isolation
  async initializeDataIsolation() {
    console.log('🔒 Initializing data isolation...');

    dataIsolation.initialize(this.currentUser, this.currentTenant);

    // Add audit logging middleware
    router.addMiddleware(async (path, _state) => {
      if (this.currentUser && path !== '/') {
        dataIsolation.auditAccess('route_access', path, 'navigate', true);
      }
    });

    console.log('✅ Data isolation initialized');
  }

  // Initialize subscription gating
  async initializeSubscriptionGating() {
    console.log('💳 Initializing subscription gating...');

    if (this.currentUser) {
      subscriptionGating.initialize(this.currentUser);

      // Set up subscription status monitoring
      this.monitorSubscriptionStatus();
    }

    console.log('✅ Subscription gating initialized');
  }

  // Monitor subscription status
  monitorSubscriptionStatus() {
    // Check subscription status every 5 minutes
    setInterval(
      async () => {
        if (authService.isAuthenticated()) {
          try {
            const response = await fetch('/api/subscription/status', {
              headers: authService.getAuthHeaders(),
            });

            if (response.ok) {
              const data = await response.json();

              // Update subscription data if changed
              if (
                JSON.stringify(data.subscription) !==
                JSON.stringify(this.currentUser.subscription)
              ) {
                this.currentUser.subscription = data.subscription;
                subscriptionGating.initialize(this.currentUser);

                // Emit subscription update event
                window.dispatchEvent(
                  new CustomEvent('subscription:updated', {
                    detail: { subscription: data.subscription },
                  })
                );
              }
            }
          } catch (error) {
            console.warn('Failed to check subscription status:', error);
          }
        }
      },
      5 * 60 * 1000
    ); // 5 minutes
  }

  // Set up global event listeners
  setupEventListeners() {
    // Handle online/offline status
    window.addEventListener('online', () => {
      console.log('🌐 Network connection restored');
      window.dispatchEvent(new CustomEvent('app:online'));
    });

    window.addEventListener('offline', () => {
      console.log('📵 Network connection lost');
      window.dispatchEvent(new CustomEvent('app:offline'));
    });

    // Handle visibility change
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        // Refresh user data when tab becomes visible
        this.refreshUserData();
      }
    });

    // Handle storage events (for multi-tab sync)
    window.addEventListener('storage', (event) => {
      if (event.key === 'auth_token') {
        if (!event.newValue && authService.isAuthenticated()) {
          // Token was removed from another tab
          this.handleUserLogout();
        } else if (event.newValue && !authService.isAuthenticated()) {
          // Token was added from another tab
          window.location.reload();
        }
      }
    });

    // Handle unhandled errors
    window.addEventListener('error', (event) => {
      console.error('Unhandled error:', event.error);
      this.logError('unhandled_error', event.error);
    });

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled promise rejection:', event.reason);
      this.logError('unhandled_rejection', event.reason);
    });
  }

  // Handle user login
  async handleUserLogin(user) {
    console.log('👤 User logged in:', user.email);
    this.currentUser = user;

    // Load tenant data for non-super-admin users
    if (user.role !== 'super_admin') {
      await this.loadTenantData();
    }

    // Re-initialize services with new user context
    router.initialize(user, this.currentTenant);
    dataIsolation.initialize(user, this.currentTenant);
    subscriptionGating.initialize(user);

    // Navigate to appropriate dashboard
    const dashboardRoutes = {
      super_admin: '/super-admin/dashboard',
      instructor: '/instructor/dashboard',
      student: '/student/dashboard',
    };

    await router.navigate(dashboardRoutes[user.role] || '/');

    // Emit login event
    window.dispatchEvent(
      new CustomEvent('user:login', {
        detail: { user, tenant: this.currentTenant },
      })
    );
  }

  // Handle user logout
  handleUserLogout() {
    console.log('👋 User logged out');

    const previousRole = this.currentUser?.role;
    this.currentUser = null;
    this.currentTenant = null;

    // Clear service contexts
    router.initialize(null, null);
    dataIsolation.initialize(null, null);
    subscriptionGating.initialize(null);

    // Navigate to login
    router.navigate('/login', { replace: true });

    // Emit logout event
    window.dispatchEvent(
      new CustomEvent('user:logout', {
        detail: { previousRole },
      })
    );
  }

  // Handle user update
  async handleUserUpdate(user) {
    console.log('🔄 User profile updated');
    this.currentUser = user;

    // Re-initialize services with updated user context
    subscriptionGating.initialize(user);

    // Emit update event
    window.dispatchEvent(
      new CustomEvent('user:updated', {
        detail: { user },
      })
    );
  }

  // Refresh user data
  async refreshUserData() {
    if (!authService.isAuthenticated()) return;

    try {
      await authService.refreshUser();
      this.currentUser = authService.getCurrentUser();

      // Re-initialize services with refreshed data
      subscriptionGating.initialize(this.currentUser);
    } catch (error) {
      console.warn('Failed to refresh user data:', error);
    }
  }

  // Handle initialization errors
  handleInitializationError(error) {
    console.error('Application initialization failed:', error);

    // Show error page
    document.body.innerHTML = `
      <div class="min-h-screen flex items-center justify-center bg-red-50">
        <div class="max-w-md w-full text-center p-8">
          <div class="mb-6">
            <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg class="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
              </svg>
            </div>
            <h1 class="text-2xl font-bold text-gray-900 mb-2">Application Error</h1>
            <p class="text-gray-600">Failed to initialize the application. Please try refreshing the page.</p>
          </div>
          <div class="space-y-3">
            <button onclick="window.location.reload()" class="w-full px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors">
              Refresh Page
            </button>
            <button onclick="window.location.href='mailto:support@academicnightingale.com'" class="w-full px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors">
              Contact Support
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // Log errors for debugging
  logError(type, error) {
    const errorData = {
      type,
      message: error?.message || 'Unknown error',
      stack: error?.stack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      user: this.currentUser?.id,
      tenant: this.currentTenant?.id,
    };

    // Send error to logging service (in production)
    if (window.location.hostname !== 'localhost') {
      fetch('/api/errors/log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authService.getAuthHeaders(),
        },
        body: JSON.stringify(errorData),
      }).catch(() => {
        // Ignore logging errors
      });
    }

    console.error('Error logged:', errorData);
  }

  // Get current user
  getCurrentUser() {
    return this.currentUser;
  }

  // Get current tenant
  getCurrentTenant() {
    return this.currentTenant;
  }

  // Check if user is authenticated
  isAuthenticated() {
    return this.isInitialized && authService.isAuthenticated();
  }

  // Check initialization status
  isReady() {
    return this.isInitialized;
  }
}

// Export singleton instance
export const appInitializer = new AppInitializer();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    appInitializer.initialize().catch(console.error);
  });
} else {
  appInitializer.initialize().catch(console.error);
}

// Export convenience functions
export const initializeApp = () => {
  return appInitializer.initialize();
};

export const getCurrentUser = () => {
  return appInitializer.getCurrentUser();
};

export const getCurrentTenant = () => {
  return appInitializer.getCurrentTenant();
};

export const isAppReady = () => {
  return appInitializer.isReady();
};

// Make available globally for other scripts
window.appInitializer = appInitializer;
window.router = router;
window.authService = authService;
window.dataIsolation = dataIsolation;
window.subscriptionGating = subscriptionGating;

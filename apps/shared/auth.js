/**
 * Enhanced Authentication System with Role-Based Access Control
 * Supports multi-tenant quiz builder with super admin, instructor, and student roles
 */

export class AuthError extends Error {
  constructor(message, code = null) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

export class AuthService {
  constructor() {
    this.currentUser = null;
    this.sessionToken = null;
    this.listeners = new Set();
    this.initializeAuth();
  }

  async initializeAuth() {
    try {
      const token = localStorage.getItem('auth_token');
      if (token) {
        await this.validateAndSetSession(token);
      }
    } catch (error) {
      console.warn('[Auth] Failed to initialize auth:', error);
      this.clearSession();
    }
  }

  // User Registration
  async register(userData) {
    const { email, password, firstName, lastName, phone, tenantSlug, planType = 'basic' } = userData;

    // Validate input
    if (!email || !password || !firstName || !lastName) {
      throw new AuthError('All required fields must be provided', 'MISSING_FIELDS');
    }

    if (password.length < 8) {
      throw new AuthError('Password must be at least 8 characters', 'WEAK_PASSWORD');
    }

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          firstName,
          lastName,
          phone,
          tenantSlug,
          planType,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new AuthError(data.message || 'Registration failed', data.code);
      }

      this.setSession(data.token, data.user);
      return { user: data.user, message: data.message };
    } catch (error) {
      if (error instanceof AuthError) throw error;
      throw new AuthError('Registration failed. Please try again.', 'NETWORK_ERROR');
    }
  }

  // User Login
  async login(email, password) {
    if (!email || !password) {
      throw new AuthError('Email and password are required', 'MISSING_CREDENTIALS');
    }

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new AuthError(data.message || 'Login failed', data.code);
      }

      this.setSession(data.token, data.user);
      return { user: data.user };
    } catch (error) {
      if (error instanceof AuthError) throw error;
      throw new AuthError('Login failed. Please check your credentials.', 'NETWORK_ERROR');
    }
  }

  // Logout
  async logout() {
    try {
      if (this.sessionToken) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.sessionToken}`,
          },
        });
      }
    } catch (error) {
      console.warn('[Auth] Logout request failed:', error);
    } finally {
      this.clearSession();
    }
  }

  // Password Reset
  async requestPasswordReset(email) {
    if (!email) {
      throw new AuthError('Email is required', 'MISSING_EMAIL');
    }

    try {
      const response = await fetch('/api/auth/reset-password-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new AuthError(data.message || 'Reset request failed', data.code);
      }

      return { message: data.message };
    } catch (error) {
      if (error instanceof AuthError) throw error;
      throw new AuthError('Password reset request failed. Please try again.', 'NETWORK_ERROR');
    }
  }

  // Validate session token
  async validateAndSetSession(token) {
    try {
      const response = await fetch('/api/auth/validate', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new AuthError('Invalid session', 'INVALID_SESSION');
      }

      const data = await response.json();
      this.setSession(token, data.user);
    } catch (error) {
      this.clearSession();
      throw error;
    }
  }

  // Set session
  setSession(token, user) {
    this.sessionToken = token;
    this.currentUser = user;

    localStorage.setItem('auth_token', token);
    localStorage.setItem('current_user', JSON.stringify(user));

    this.notifyListeners('login', user);
  }

  // Clear session
  clearSession() {
    this.sessionToken = null;
    this.currentUser = null;

    localStorage.removeItem('auth_token');
    localStorage.removeItem('current_user');

    this.notifyListeners('logout', null);
  }

  // Get current user
  getCurrentUser() {
    return this.currentUser;
  }

  // Check if user is authenticated
  isAuthenticated() {
    return !!this.currentUser && !!this.sessionToken;
  }

  // Check user role
  hasRole(role) {
    return this.currentUser?.role === role;
  }

  // Check if user has any of the specified roles
  hasAnyRole(roles) {
    return roles.includes(this.currentUser?.role);
  }

  // Check if user is super admin
  isSuperAdmin() {
    return this.hasRole('super_admin');
  }

  // Check if user is instructor
  isInstructor() {
    return this.hasRole('instructor');
  }

  // Check if user is student
  isStudent() {
    return this.hasRole('student');
  }

  // Get tenant information
  getTenant() {
    return this.currentUser?.tenant;
  }

  // Check subscription limits
  async checkSubscriptionLimit(resourceType, currentCount = 0) {
    if (!this.isAuthenticated()) {
      throw new AuthError('Authentication required', 'NOT_AUTHENTICATED');
    }

    try {
      const response = await fetch(`/api/auth/check-limit/${resourceType}?current=${currentCount}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.sessionToken}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new AuthError(data.message || 'Limit check failed', data.code);
      }

      return data.canCreate;
    } catch (error) {
      if (error instanceof AuthError) throw error;
      throw new AuthError('Failed to check subscription limits', 'NETWORK_ERROR');
    }
  }

  // Update user profile
  async updateProfile(updates) {
    if (!this.isAuthenticated()) {
      throw new AuthError('Authentication required', 'NOT_AUTHENTICATED');
    }

    try {
      const response = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.sessionToken}`,
        },
        body: JSON.stringify(updates),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new AuthError(data.message || 'Profile update failed', data.code);
      }

      this.currentUser = data.user;
      localStorage.setItem('current_user', JSON.stringify(data.user));
      this.notifyListeners('profile_update', data.user);

      return { user: data.user };
    } catch (error) {
      if (error instanceof AuthError) throw error;
      throw new AuthError('Profile update failed. Please try again.', 'NETWORK_ERROR');
    }
  }

  // Change password
  async changePassword(currentPassword, newPassword) {
    if (!this.isAuthenticated()) {
      throw new AuthError('Authentication required', 'NOT_AUTHENTICATED');
    }

    if (!currentPassword || !newPassword) {
      throw new AuthError('Current password and new password are required', 'MISSING_PASSWORDS');
    }

    if (newPassword.length < 8) {
      throw new AuthError('New password must be at least 8 characters', 'WEAK_PASSWORD');
    }

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.sessionToken}`,
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new AuthError(data.message || 'Password change failed', data.code);
      }

      return { message: data.message };
    } catch (error) {
      if (error instanceof AuthError) throw error;
      throw new AuthError('Password change failed. Please try again.', 'NETWORK_ERROR');
    }
  }

  // Event listeners
  addListener(event, callback) {
    this.listeners.add({ event, callback });
  }

  removeListener(event, callback) {
    this.listeners.forEach(listener => {
      if (listener.event === event && listener.callback === callback) {
        this.listeners.delete(listener);
      }
    });
  }

  notifyListeners(event, data) {
    this.listeners.forEach(listener => {
      if (listener.event === event) {
        listener.callback(data);
      }
    });
  }

  // Get auth headers for API requests
  getAuthHeaders() {
    const headers = {};
    if (this.sessionToken) {
      headers['Authorization'] = `Bearer ${this.sessionToken}`;
    }
    return headers;
  }

  // Refresh user data
  async refreshUser() {
    if (!this.isAuthenticated()) {
      throw new AuthError('Authentication required', 'NOT_AUTHENTICATED');
    }

    try {
      const response = await fetch('/api/auth/profile', {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new AuthError(data.message || 'Failed to refresh user data', data.code);
      }

      this.currentUser = data.user;
      localStorage.setItem('current_user', JSON.stringify(data.user));
      this.notifyListeners('user_refresh', data.user);

      return { user: data.user };
    } catch (error) {
      if (error instanceof AuthError) throw error;
      throw new AuthError('Failed to refresh user data', 'NETWORK_ERROR');
    }
  }
}

// Role-based access control utilities
export const RBAC = {
  // Permission definitions
  permissions: {
    // Super admin permissions
    MANAGE_ALL_TENANTS: 'manage_all_tenants',
    VIEW_SYSTEM_ANALYTICS: 'view_system_analytics',
    MANAGE_SUBSCRIPTIONS: 'manage_subscriptions',
    MANAGE_USERS: 'manage_users',

    // Instructor permissions
    MANAGE_OWN_CLASSROOMS: 'manage_own_classrooms',
    MANAGE_OWN_QUIZZES: 'manage_own_quizzes',
    VIEW_OWN_ANALYTICS: 'view_own_analytics',
    INVITE_STUDENTS: 'invite_students',

    // Student permissions
    TAKE_QUIZZES: 'take_quizzes',
   _VIEW_OWN_RESULTS: 'view_own_results',
  },

  // Role permissions mapping
  rolePermissions: {
    super_admin: [
      'manage_all_tenants',
      'view_system_analytics',
      'manage_subscriptions',
      'manage_users',
      'manage_own_classrooms',
      'manage_own_quizzes',
      'view_own_analytics',
      'invite_students',
    ],
    instructor: [
      'manage_own_classrooms',
      'manage_own_quizzes',
      'view_own_analytics',
      'invite_students',
    ],
    student: [
      'take_quizzes',
      'view_own_results',
    ],
  },

  // Check if user has permission
  hasPermission(user, permission) {
    if (!user || !permission) return false;

    const userPermissions = this.rolePermissions[user.role] || [];
    return userPermissions.includes(permission);
  },

  // Check if user has any of the specified permissions
  hasAnyPermission(user, permissions) {
    if (!user || !permissions) return false;

    return permissions.some(permission => this.hasPermission(user, permission));
  },

  // Check if user can access a route
  canAccessRoute(user, route) {
    if (!user) return false;

    const routePermissions = {
      '/super-admin': ['manage_all_tenants'],
      '/super-admin/users': ['manage_users'],
      '/super-admin/analytics': ['view_system_analytics'],
      '/super-admin/subscriptions': ['manage_subscriptions'],
      '/instructor': ['manage_own_classrooms'],
      '/instructor/quizzes': ['manage_own_quizzes'],
      '/instructor/analytics': ['view_own_analytics'],
      '/student': ['take_quizzes'],
    };

    const requiredPermissions = routePermissions[route];
    if (!requiredPermissions) return true; // Public route

    return this.hasAnyPermission(user, requiredPermissions);
  },

  // Get accessible routes for user
  getAccessibleRoutes(user) {
    if (!user) return [];

    const routes = {
      super_admin: [
        '/super-admin/dashboard',
        '/super-admin/users',
        '/super-admin/analytics',
        '/super-admin/subscriptions',
        '/super-admin/settings',
      ],
      instructor: [
        '/instructor/dashboard',
        '/instructor/quizzes',
        '/instructor/classrooms',
        '/instructor/analytics',
        '/instructor/students',
        '/instructor/settings',
      ],
      student: [
        '/student/dashboard',
        '/student/quizzes',
        '/student/results',
        '/student/profile',
      ],
    };

    return routes[user.role] || [];
  },
};

// Feature gating based on subscription
export const FeatureGating = {
  features: {
    // Basic plan features
    CREATE_QUIZZES: 'create_quizzes',
    MANAGE_CLASSROOMS: 'manage_classrooms',
    BASIC_ANALYTICS: 'basic_analytics',
    INVITE_STUDENTS: 'invite_students',

    // Pro plan features
    ADVANCED_ANALYTICS: 'advanced_analytics',
    QUIZ_EXPORT: 'quiz_export',
    MEDIA_UPLOAD: 'media_upload',
    SCHEDULED_EXAMS: 'scheduled_exams',

    // Enterprise features
    UNLIMITED_STUDENTS: 'unlimited_students',
    UNLIMITED_CLASSROOMS: 'unlimited_classrooms',
    CUSTOM_BRANDING: 'custom_branding',
    API_ACCESS: 'api_access',
    PRIORITY_SUPPORT: 'priority_support',
  },

  planFeatures: {
    basic: ['create_quizzes', 'manage_classrooms', 'basic_analytics', 'invite_students'],
    pro: ['create_quizzes', 'manage_classrooms', 'basic_analytics', 'invite_students', 'advanced_analytics', 'quiz_export', 'media_upload', 'scheduled_exams'],
    enterprise: ['create_quizzes', 'manage_classrooms', 'basic_analytics', 'invite_students', 'advanced_analytics', 'quiz_export', 'media_upload', 'scheduled_exams', 'unlimited_students', 'unlimited_classrooms', 'custom_branding', 'api_access', 'priority_support'],
  },

  // Check if user has access to feature
  hasFeature(user, feature) {
    if (!user || !feature) return false;

    const userPlan = user.subscription?.plan_type || 'basic';
    const planFeatures = this.planFeatures[userPlan] || [];

    return planFeatures.includes(feature);
  },

  // Check if user has any of the specified features
  hasAnyFeature(user, features) {
    if (!user || !features) return false;

    return features.some(feature => this.hasFeature(user, feature));
  },

  // Get features for user's plan
  getUserFeatures(user) {
    if (!user) return [];

    const userPlan = user.subscription?.plan_type || 'basic';
    return this.planFeatures[userPlan] || [];
  },
};

// Export default instance
export const authService = new AuthService();

// Export convenience functions
export const getCurrentUser = () => authService.getCurrentUser();
export const isAuthenticated = () => authService.isAuthenticated();
export const isSuperAdmin = () => authService.isSuperAdmin();
export const isInstructor = () => authService.isInstructor();
export const isStudent = () => authService.isStudent();
export const getAuthHeaders = () => authService.getAuthHeaders();
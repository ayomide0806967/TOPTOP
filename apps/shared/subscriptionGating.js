/**
 * Subscription-based Feature Gating System
 * Controls access to features based on user's subscription plan
 */

export class SubscriptionError extends Error {
  constructor(message, code = null, upgradeRequired = false) {
    super(message);
    this.name = 'SubscriptionError';
    this.code = code;
    this.upgradeRequired = upgradeRequired;
  }
}

export class SubscriptionGatingService {
  constructor() {
    this.currentUser = null;
    this.featureCache = new Map();
    this.usageCache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
  }

  // Initialize with user context
  initialize(user) {
    this.currentUser = user;
    this.clearCache();
  }

  // Clear cache when user context changes
  clearCache() {
    this.featureCache.clear();
    this.usageCache.clear();
  }

  // Get user's current plan
  getCurrentPlan() {
    return this.currentUser?.subscription?.plan_type || 'basic';
  }

  // Check if user has access to a specific feature
  hasFeatureAccess(feature) {
    const cacheKey = `${feature}_${this.getCurrentPlan()}`;

    if (this.featureCache.has(cacheKey)) {
      const cached = this.featureCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheExpiry) {
        return cached.hasAccess;
      }
    }

    const hasAccess = this.checkFeatureAccess(feature);
    this.featureCache.set(cacheKey, {
      hasAccess,
      timestamp: Date.now()
    });

    return hasAccess;
  }

  // Check feature access based on plan
  checkFeatureAccess(feature) {
    const plan = this.getCurrentPlan();

    const featureMatrix = {
      // Basic plan features
      'create_quizzes': { basic: true, pro: true, enterprise: true },
      'manage_classrooms': { basic: true, pro: true, enterprise: true },
      'basic_analytics': { basic: true, pro: true, enterprise: true },
      'invite_students': { basic: true, pro: true, enterprise: true },

      // Pro plan features
      'advanced_analytics': { basic: false, pro: true, enterprise: true },
      'quiz_export': { basic: false, pro: true, enterprise: true },
      'media_upload': { basic: false, pro: true, enterprise: true },
      'scheduled_exams': { basic: false, pro: true, enterprise: true },
      'quiz_templates': { basic: false, pro: true, enterprise: true },
      'bulk_operations': { basic: false, pro: true, enterprise: true },
      'api_access_limited': { basic: false, pro: true, enterprise: true },

      // Enterprise plan features
      'unlimited_students': { basic: false, pro: false, enterprise: true },
      'unlimited_classrooms': { basic: false, pro: false, enterprise: true },
      'unlimited_quizzes': { basic: false, pro: false, enterprise: true },
      'custom_branding': { basic: false, pro: false, enterprise: true },
      'api_access_full': { basic: false, pro: false, enterprise: true },
      'priority_support': { basic: false, pro: false, enterprise: true },
      'custom_integrations': { basic: false, pro: false, enterprise: true },
      'advanced_security': { basic: false, pro: false, enterprise: true },
      'dedicated_account_manager': { basic: false, pro: false, enterprise: true },
      'white_labeling': { basic: false, pro: false, enterprise: true },

      // Special features
      'student_pwa': { basic: false, pro: true, enterprise: true },
      'offline_mode': { basic: false, pro: false, enterprise: true },
      'advanced_proctoring': { basic: false, pro: false, enterprise: true },
      'ai_question_generation': { basic: false, pro: false, enterprise: true },
      'automated_grading': { basic: false, pro: true, enterprise: true },
      'plagiarism_detection': { basic: false, pro: false, enterprise: true }
    };

    return featureMatrix[feature]?.[plan] || false;
  }

  // Check if user has access to any of the specified features
  hasAnyFeatureAccess(features) {
    return features.some(feature => this.hasFeatureAccess(feature));
  }

  // Get all features available to user's plan
  getAvailableFeatures() {
    const plan = this.getCurrentPlan();
    const availableFeatures = [];

    Object.entries(this.getFeatureMatrix()).forEach(([feature, plans]) => {
      if (plans[plan]) {
        availableFeatures.push(feature);
      }
    });

    return availableFeatures;
  }

  // Get complete feature matrix
  getFeatureMatrix() {
    return {
      'create_quizzes': { basic: true, pro: true, enterprise: true },
      'manage_classrooms': { basic: true, pro: true, enterprise: true },
      'basic_analytics': { basic: true, pro: true, enterprise: true },
      'invite_students': { basic: true, pro: true, enterprise: true },
      'advanced_analytics': { basic: false, pro: true, enterprise: true },
      'quiz_export': { basic: false, pro: true, enterprise: true },
      'media_upload': { basic: false, pro: true, enterprise: true },
      'scheduled_exams': { basic: false, pro: true, enterprise: true },
      'quiz_templates': { basic: false, pro: true, enterprise: true },
      'bulk_operations': { basic: false, pro: true, enterprise: true },
      'api_access_limited': { basic: false, pro: true, enterprise: true },
      'unlimited_students': { basic: false, pro: false, enterprise: true },
      'unlimited_classrooms': { basic: false, pro: false, enterprise: true },
      'unlimited_quizzes': { basic: false, pro: false, enterprise: true },
      'custom_branding': { basic: false, pro: false, enterprise: true },
      'api_access_full': { basic: false, pro: false, enterprise: true },
      'priority_support': { basic: false, pro: false, enterprise: true },
      'custom_integrations': { basic: false, pro: false, enterprise: true },
      'advanced_security': { basic: false, pro: false, enterprise: true },
      'dedicated_account_manager': { basic: false, pro: false, enterprise: true },
      'white_labeling': { basic: false, pro: false, enterprise: true },
      'student_pwa': { basic: false, pro: true, enterprise: true },
      'offline_mode': { basic: false, pro: false, enterprise: true },
      'advanced_proctoring': { basic: false, pro: false, enterprise: true },
      'ai_question_generation': { basic: false, pro: false, enterprise: true },
      'automated_grading': { basic: false, pro: true, enterprise: true },
      'plagiarism_detection': { basic: false, pro: false, enterprise: true }
    };
  }

  // Get usage limits for current plan
  getUsageLimits() {
    const plan = this.getCurrentPlan();

    const limits = {
      basic: {
        maxQuizzes: 10,
        maxClassrooms: 3,
        maxStudents: 50,
        maxQuestionsPerQuiz: 20,
        maxFileSize: 5 * 1024 * 1024, // 5MB
        maxMonthlyExports: 5,
        maxApiCallsPerDay: 100,
        features: ['create_quizzes', 'manage_classrooms', 'basic_analytics', 'invite_students']
      },
      pro: {
        maxQuizzes: 100,
        maxClassrooms: 20,
        maxStudents: 500,
        maxQuestionsPerQuiz: 50,
        maxFileSize: 10 * 1024 * 1024, // 10MB
        maxMonthlyExports: 50,
        maxApiCallsPerDay: 1000,
        features: [
          'create_quizzes', 'manage_classrooms', 'basic_analytics', 'invite_students',
          'advanced_analytics', 'quiz_export', 'media_upload', 'scheduled_exams',
          'quiz_templates', 'bulk_operations', 'api_access_limited', 'student_pwa',
          'automated_grading'
        ]
      },
      enterprise: {
        maxQuizzes: -1, // Unlimited
        maxClassrooms: -1,
        maxStudents: -1,
        maxQuestionsPerQuiz: -1,
        maxFileSize: 50 * 1024 * 1024, // 50MB
        maxMonthlyExports: -1,
        maxApiCallsPerDay: -1,
        features: [
          'create_quizzes', 'manage_classrooms', 'basic_analytics', 'invite_students',
          'advanced_analytics', 'quiz_export', 'media_upload', 'scheduled_exams',
          'quiz_templates', 'bulk_operations', 'api_access_full', 'student_pwa',
          'offline_mode', 'advanced_proctoring', 'ai_question_generation',
          'automated_grading', 'plagiarism_detection', 'unlimited_students',
          'unlimited_classrooms', 'unlimited_quizzes', 'custom_branding',
          'priority_support', 'custom_integrations', 'advanced_security',
          'dedicated_account_manager', 'white_labeling'
        ]
      }
    };

    return limits[plan] || limits.basic;
  }

  // Check if user can perform action based on usage limits
  canPerformAction(action, currentCount = 0) {
    const limits = this.getUsageLimits();
    const limitKey = this.getActionLimitKey(action);

    if (limitKey && limits[limitKey] !== -1) {
      return currentCount < limits[limitKey];
    }

    return true;
  }

  // Get limit key for action
  getActionLimitKey(action) {
    const actionLimits = {
      'create_quiz': 'maxQuizzes',
      'create_classroom': 'maxClassrooms',
      'add_student': 'maxStudents',
      'add_question': 'maxQuestionsPerQuiz',
      'upload_file': 'maxFileSize',
      'export_quiz': 'maxMonthlyExports',
      'api_call': 'maxApiCallsPerDay'
    };

    return actionLimits[action] || null;
  }

  // Get current usage statistics
  async getCurrentUsage() {
    if (!this.currentUser) {
      throw new SubscriptionError('User context required', 'NO_CONTEXT');
    }

    const cacheKey = `usage_${this.currentUser.id}`;

    if (this.usageCache.has(cacheKey)) {
      const cached = this.usageCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheExpiry) {
        return cached.usage;
      }
    }

    try {
      const response = await fetch('/api/subscription/usage', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });

      if (!response.ok) {
        throw new SubscriptionError('Failed to fetch usage data', 'USAGE_FETCH_ERROR');
      }

      const usage = await response.json();

      this.usageCache.set(cacheKey, {
        usage,
        timestamp: Date.now()
      });

      return usage;
    } catch (error) {
      if (error instanceof SubscriptionError) throw error;
      throw new SubscriptionError('Failed to fetch usage data', 'NETWORK_ERROR');
    }
  }

  // Validate feature access with upgrade prompt
  validateFeatureAccess(feature, options = {}) {
    const { showUpgradePrompt = true, customMessage = null } = options;

    if (!this.hasFeatureAccess(feature)) {
      const plan = this.getCurrentPlan();
      const requiredPlan = this.getRequiredPlanForFeature(feature);

      const message = customMessage || this.getFeatureRestrictionMessage(feature, plan, requiredPlan);

      if (showUpgradePrompt) {
        this.showUpgradePrompt(feature, requiredPlan, message);
      }

      throw new SubscriptionError(message, 'FEATURE_RESTRICTED', true);
    }

    return true;
  }

  // Get minimum plan required for feature
  getRequiredPlanForFeature(feature) {
    const matrix = this.getFeatureMatrix();
    const featurePlans = matrix[feature];

    if (!featurePlans) return 'enterprise';

    if (featurePlans.basic) return 'basic';
    if (featurePlans.pro) return 'pro';
    return 'enterprise';
  }

  // Get user-friendly restriction message
  getFeatureRestrictionMessage(feature, currentPlan, requiredPlan) {
    const planNames = {
      basic: 'Basic',
      pro: 'Professional',
      enterprise: 'Enterprise'
    };

    const featureNames = {
      'create_quizzes': 'Creating quizzes',
      'manage_classrooms': 'Managing classrooms',
      'basic_analytics': 'Basic analytics',
      'invite_students': 'Inviting students',
      'advanced_analytics': 'Advanced analytics and reporting',
      'quiz_export': 'Exporting quizzes',
      'media_upload': 'Uploading media files',
      'scheduled_exams': 'Scheduling exams',
      'quiz_templates': 'Using quiz templates',
      'bulk_operations': 'Bulk operations',
      'api_access_limited': 'Limited API access',
      'unlimited_students': 'Unlimited students',
      'unlimited_classrooms': 'Unlimited classrooms',
      'unlimited_quizzes': 'Unlimited quizzes',
      'custom_branding': 'Custom branding',
      'api_access_full': 'Full API access',
      'priority_support': 'Priority support',
      'custom_integrations': 'Custom integrations',
      'advanced_security': 'Advanced security features',
      'dedicated_account_manager': 'Dedicated account manager',
      'white_labeling': 'White labeling',
      'student_pwa': 'Student PWA access',
      'offline_mode': 'Offline mode',
      'advanced_proctoring': 'Advanced proctoring',
      'ai_question_generation': 'AI-powered question generation',
      'automated_grading': 'Automated grading',
      'plagiarism_detection': 'Plagiarism detection'
    };

    const featureName = featureNames[feature] || feature;
    const currentPlanName = planNames[currentPlan];
    const requiredPlanName = planNames[requiredPlan];

    return `${featureName} is not available on the ${currentPlanName} plan. Upgrade to ${requiredPlanName} to unlock this feature.`;
  }

  // Show upgrade prompt UI
  showUpgradePrompt(feature, requiredPlan, message) {
    // Create modal element
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
      <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div class="flex items-center mb-4">
          <div class="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mr-4">
            <svg class="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
            </svg>
          </div>
          <div>
            <h3 class="text-lg font-semibold text-gray-900">Upgrade Required</h3>
            <p class="text-sm text-gray-600">${requiredPlan.charAt(0).toUpperCase() + requiredPlan.slice(1)} Plan</p>
          </div>
        </div>

        <p class="text-gray-700 mb-6">${message}</p>

        <div class="flex space-x-3">
          <button onclick="this.closest('.fixed').remove()" class="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
            Maybe Later
          </button>
          <button onclick="window.location.href='/pricing'" class="flex-1 px-4 py-2 text-white bg-cyan-600 hover:bg-cyan-700 rounded-lg transition-colors">
            Upgrade Now
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (modal.parentNode) {
        modal.remove();
      }
    }, 10000);
  }

  // Check subscription status
  getSubscriptionStatus() {
    const subscription = this.currentUser?.subscription;

    if (!subscription) {
      return { status: 'inactive', plan: 'basic', expiresAt: null };
    }

    return {
      status: subscription.status,
      plan: subscription.plan_type,
      expiresAt: subscription.current_period_end,
      isTrialing: subscription.status === 'trialing',
      isCanceled: subscription.cancel_at_period_end,
      willRenew: !subscription.cancel_at_period_end
    };
  }

  // Check if subscription is active
  isSubscriptionActive() {
    const status = this.getSubscriptionStatus();
    return status.status === 'active' || status.status === 'trialing';
  }

  // Get days until subscription expires
  getDaysUntilExpiration() {
    const expiresAt = this.getSubscriptionStatus().expiresAt;

    if (!expiresAt) return null;

    const expirationDate = new Date(expiresAt);
    const now = new Date();
    const diffTime = expirationDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays > 0 ? diffDays : 0;
  }

  // Check if user is close to usage limit
  isNearUsageLimit(resourceType, currentUsage, threshold = 0.8) {
    const limits = this.getUsageLimits();
    const limit = limits[this.getActionLimitKey(resourceType)];

    if (limit === -1) return false; // Unlimited

    const usageRatio = currentUsage / limit;
    return usageRatio >= threshold;
  }

  // Get usage warning message
  getUsageWarningMessage(resourceType, currentUsage) {
    const limits = this.getUsageLimits();
    const limit = limits[this.getActionLimitKey(resourceType)];

    if (limit === -1) return null;

    const remaining = limit - currentUsage;

    if (remaining <= 0) {
      return `You've reached your limit for ${resourceType}. Upgrade your plan to continue.`;
    }

    if (remaining <= 5) {
      return `You have ${remaining} ${resourceType} remaining. Consider upgrading to avoid interruptions.`;
    }

    return null;
  }
}

// Export singleton instance
export const subscriptionGating = new SubscriptionGatingService();

// Export convenience functions
export const initializeSubscriptionGating = (user) => {
  subscriptionGating.initialize(user);
};

export const hasFeatureAccess = (feature) => {
  return subscriptionGating.hasFeatureAccess(feature);
};

export const validateFeatureAccess = (feature, options) => {
  return subscriptionGating.validateFeatureAccess(feature, options);
};

export const getUsageLimits = () => {
  return subscriptionGating.getUsageLimits();
};

export const canPerformAction = (action, currentCount) => {
  return subscriptionGating.canPerformAction(action, currentCount);
};

export const getCurrentUsage = () => {
  return subscriptionGating.getCurrentUsage();
};

export const getSubscriptionStatus = () => {
  return subscriptionGating.getSubscriptionStatus();
};

export const isSubscriptionActive = () => {
  return subscriptionGating.isSubscriptionActive();
};
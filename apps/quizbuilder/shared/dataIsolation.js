/**
 * Data Isolation and Security Layer
 * Ensures tenant-specific data access and prevents data leakage
 */

export class DataIsolationError extends Error {
  constructor(message, code = null) {
    super(message);
    this.name = 'DataIsolationError';
    this.code = code;
  }
}

export class DataIsolationService {
  constructor() {
    this.currentTenant = null;
    this.currentUser = null;
    this.cache = new Map();
  }

  // Initialize with user context
  initialize(user, tenant) {
    this.currentUser = user;
    this.currentTenant = tenant;
    this.clearCache();
  }

  // Clear cache when user context changes
  clearCache() {
    this.cache.clear();
  }

  // Verify user has access to requested data
  verifyDataAccess(resourceType, resourceId, action = 'read') {
    if (!this.currentUser || !this.currentTenant) {
      throw new DataIsolationError('User context not initialized', 'NO_CONTEXT');
    }

    // Super admins can access everything
    if (this.currentUser.role === 'super_admin') {
      return true;
    }

    // Instructors can only access their own tenant's data
    if (this.currentUser.role === 'instructor') {
      return this.verifyInstructorAccess(resourceType, resourceId, action);
    }

    // Students can only access their own data
    if (this.currentUser.role === 'student') {
      return this.verifyStudentAccess(resourceType, resourceId, action);
    }

    throw new DataIsolationError('Unauthorized role', 'INVALID_ROLE');
  }

  // Instructor-specific access verification
  verifyInstructorAccess(resourceType, resourceId, action) {
    const tenantId = this.currentTenant.id;

    switch (resourceType) {
      case 'quiz':
      case 'quiz_blueprint':
        return this.verifyQuizAccess(tenantId, resourceId, this.currentUser.id, action);

      case 'classroom':
        return this.verifyClassroomAccess(tenantId, resourceId, this.currentUser.id, action);

      case 'student':
        return this.verifyStudentAccess(tenantId, resourceId, action);

      case 'analytics':
        return this.verifyAnalyticsAccess(tenantId, action);

      default:
        throw new DataIsolationError(`Unknown resource type: ${resourceType}`, 'UNKNOWN_RESOURCE');
    }
  }

  // Student-specific access verification
  verifyStudentAccess(resourceType, resourceId, action) {
    const userId = this.currentUser.id;

    switch (resourceType) {
      case 'quiz':
      case 'quiz_attempt':
        return resourceId === userId || action === 'read'; // Students can read assigned quizzes

      case 'result':
        return resourceId === userId; // Students can only view their own results

      case 'classroom':
        return this.verifyClassroomMembership(userId, resourceId);

      default:
        throw new DataIsolationError(`Students cannot access ${resourceType}`, 'ACCESS_DENIED');
    }
  }

  // Verify quiz access
  async verifyQuizAccess(tenantId, quizId, userId, action) {
    const cacheKey = `quiz_${quizId}_${userId}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const response = await fetch(`/api/quizzes/${quizId}/verify-access`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          tenantId,
          userId,
          action
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new DataIsolationError(data.message || 'Access denied', 'QUIZ_ACCESS_DENIED');
      }

      this.cache.set(cacheKey, data.hasAccess);
      return data.hasAccess;
    } catch (error) {
      if (error instanceof DataIsolationError) throw error;
      throw new DataIsolationError('Failed to verify quiz access', 'VERIFICATION_ERROR');
    }
  }

  // Verify classroom access
  async verifyClassroomAccess(tenantId, classroomId, userId, action) {
    const cacheKey = `classroom_${classroomId}_${userId}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const response = await fetch(`/api/classrooms/${classroomId}/verify-access`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          tenantId,
          userId,
          action
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new DataIsolationError(data.message || 'Access denied', 'CLASSROOM_ACCESS_DENIED');
      }

      this.cache.set(cacheKey, data.hasAccess);
      return data.hasAccess;
    } catch (error) {
      if (error instanceof DataIsolationError) throw error;
      throw new DataIsolationError('Failed to verify classroom access', 'VERIFICATION_ERROR');
    }
  }

  // Verify student access (for instructors viewing student data)
  async verifyStudentInstructorAccess(tenantId, studentId, instructorId) {
    const cacheKey = `student_${studentId}_${instructorId}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const response = await fetch(`/api/students/${studentId}/verify-instructor-access`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          tenantId,
          instructorId
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new DataIsolationError(data.message || 'Access denied', 'STUDENT_ACCESS_DENIED');
      }

      this.cache.set(cacheKey, data.hasAccess);
      return data.hasAccess;
    } catch (error) {
      if (error instanceof DataIsolationError) throw error;
      throw new DataIsolationError('Failed to verify student access', 'VERIFICATION_ERROR');
    }
  }

  // Verify analytics access
  verifyAnalyticsAccess(tenantId, action) {
    // Instructors can view analytics for their own tenant
    return action === 'read' && this.currentTenant?.id === tenantId;
  }

  // Verify classroom membership
  async verifyClassroomMembership(userId, classroomId) {
    const cacheKey = `membership_${userId}_${classroomId}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const response = await fetch(`/api/classrooms/${classroomId}/members/${userId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });

      const isMember = response.ok;

      this.cache.set(cacheKey, isMember);
      return isMember;
    } catch (error) {
      return false;
    }
  }

  // Build tenant-aware query parameters
  buildTenantQuery(baseParams = {}) {
    const params = { ...baseParams };

    if (this.currentUser?.role !== 'super_admin') {
      params.tenant_id = this.currentTenant?.id;
    }

    if (this.currentUser?.role === 'instructor') {
      params.owner_user_id = this.currentUser.id;
    }

    return params;
  }

  // Add tenant headers to API requests
  addTenantHeaders(headers = {}) {
    const tenantHeaders = { ...headers };

    if (this.currentTenant?.id) {
      tenantHeaders['X-Tenant-ID'] = this.currentTenant.id;
    }

    if (this.currentUser?.id) {
      tenantHeaders['X-User-ID'] = this.currentUser.id;
      tenantHeaders['X-User-Role'] = this.currentUser.role;
    }

    return tenantHeaders;
  }

  // Filter data based on tenant access
  filterTenantData(data, resourceType) {
    if (!data || !Array.isArray(data)) {
      return data;
    }

    if (this.currentUser?.role === 'super_admin') {
      return data; // Super admins see all data
    }

    const tenantId = this.currentTenant?.id;
    const userId = this.currentUser?.id;

    return data.filter(item => {
      // Basic tenant filtering
      if (item.tenant_id && item.tenant_id !== tenantId) {
        return false;
      }

      // Role-specific filtering
      switch (this.currentUser.role) {
        case 'instructor':
          // Instructors only see their own content
          if (item.owner_user_id && item.owner_user_id !== userId) {
            return false;
          }
          break;

        case 'student':
          // Students only see content assigned to them or their own data
          if (item.user_id && item.user_id !== userId) {
            return false;
          }
          break;
      }

      return true;
    });
  }

  // Sanitize API response to remove sensitive data
  sanitizeResponse(data, resourceType) {
    if (!data) return data;

    // Remove sensitive fields based on resource type
    const sensitiveFields = {
      user: ['password_hash', 'reset_token', 'email_verified'],
      tenant: ['settings', 'api_keys'],
      subscription: ['payment_method_token', 'stripe_customer_id']
    };

    const fieldsToRemove = sensitiveFields[resourceType] || [];

    if (Array.isArray(data)) {
      return data.map(item => this.removeFields(item, fieldsToRemove));
    } else {
      return this.removeFields(data, fieldsToRemove);
    }
  }

  // Remove specified fields from object
  removeFields(obj, fields) {
    if (!obj || typeof obj !== 'object') return obj;

    const sanitized = { ...obj };
    fields.forEach(field => {
      delete sanitized[field];
    });

    return sanitized;
  }

  // Audit data access for security monitoring
  auditAccess(resourceType, resourceId, action, result) {
    const auditEntry = {
      user_id: this.currentUser?.id,
      tenant_id: this.currentTenant?.id,
      resource_type: resourceType,
      resource_id: resourceId,
      action,
      result: result ? 'success' : 'denied',
      timestamp: new Date().toISOString(),
      user_agent: navigator.userAgent,
      ip_address: null // Will be set by server
    };

    // Send audit log to server
    fetch('/api/audit/log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      },
      body: JSON.stringify(auditEntry)
    }).catch(error => {
      console.warn('Failed to log audit entry:', error);
    });
  }

  // Check if feature is available for user's subscription
  isFeatureAvailable(feature) {
    if (!this.currentUser) return false;

    const planType = this.currentUser.subscription?.plan_type || 'basic';

    const features = {
      basic: ['create_quizzes', 'manage_classrooms', 'basic_analytics'],
      pro: ['create_quizzes', 'manage_classrooms', 'basic_analytics', 'advanced_analytics', 'export_data'],
      enterprise: ['create_quizzes', 'manage_classrooms', 'basic_analytics', 'advanced_analytics', 'export_data', 'api_access', 'unlimited_students']
    };

    return features[planType]?.includes(feature) || false;
  }

  // Get data access limits based on subscription
  getAccessLimits() {
    if (!this.currentUser) return {};

    const planType = this.currentUser.subscription?.plan_type || 'basic';

    const limits = {
      basic: {
        maxQuizzes: 10,
        maxStudents: 50,
        maxClassrooms: 3,
        maxFileSize: 5 * 1024 * 1024 // 5MB
      },
      pro: {
        maxQuizzes: 100,
        maxStudents: 500,
        maxClassrooms: 20,
        maxFileSize: 10 * 1024 * 1024 // 10MB
      },
      enterprise: {
        maxQuizzes: -1, // Unlimited
        maxStudents: -1,
        maxClassrooms: -1,
        maxFileSize: 50 * 1024 * 1024 // 50MB
      }
    };

    return limits[planType] || limits.basic;
  }
}

// Export singleton instance
export const dataIsolation = new DataIsolationService();

// Export convenience functions
export const initializeDataIsolation = (user, tenant) => {
  dataIsolation.initialize(user, tenant);
};

export const verifyDataAccess = (resourceType, resourceId, action) => {
  return dataIsolation.verifyDataAccess(resourceType, resourceId, action);
};

export const buildTenantQuery = (params) => {
  return dataIsolation.buildTenantQuery(params);
};

export const addTenantHeaders = (headers) => {
  return dataIsolation.addTenantHeaders(headers);
};

export const filterTenantData = (data, resourceType) => {
  return dataIsolation.filterTenantData(data, resourceType);
};

export const isFeatureAvailable = (feature) => {
  return dataIsolation.isFeatureAvailable(feature);
};

export const getAccessLimits = () => {
  return dataIsolation.getAccessLimits();
};
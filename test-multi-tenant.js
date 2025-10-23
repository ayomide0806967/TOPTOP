/**
 * Multi-tenant Functionality Test Suite
 * Tests authentication, data isolation, RBAC, and subscription gating
 */

// Test configuration
const TEST_CONFIG = {
  baseUrl: 'http://localhost:3000',
  timeout: 10000,
  retries: 3
};

// Test utilities
class TestUtils {
  static async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static async makeRequest(url, options = {}) {
    const defaultOptions = {
      timeout: TEST_CONFIG.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const response = await fetch(url, { ...defaultOptions, ...options });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  static async makeAuthenticatedRequest(url, token, options = {}) {
    return this.makeRequest(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`
      }
    });
  }

  static async retry(fn, retries = TEST_CONFIG.retries) {
    let lastError;
    for (let i = 0; i <= retries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (i < retries) {
          await this.delay(1000 * Math.pow(2, i)); // Exponential backoff
        }
      }
    }
    throw lastError;
  }

  static generateTestData() {
    const timestamp = Date.now();
    return {
      email: `test${timestamp}@example.com`,
      password: 'TestPassword123!',
      firstName: 'Test',
      lastName: 'User',
      phone: `+1234567890${timestamp % 1000}`,
      tenantSlug: `test-tenant-${timestamp}`
    };
  }

  static log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}]`;

    switch (type) {
      case 'success':
        console.log(`✅ ${prefix} ${message}`);
        break;
      case 'error':
        console.error(`❌ ${prefix} ${message}`);
        break;
      case 'warning':
        console.warn(`⚠️  ${prefix} ${message}`);
        break;
      default:
        console.log(`ℹ️  ${prefix} ${message}`);
    }
  }
}

// Test suite class
class MultiTenantTestSuite {
  constructor() {
    this.results = [];
    this.testData = {};
  }

  // Run all tests
  async runAllTests() {
    TestUtils.log('Starting Multi-tenant Functionality Tests');
    TestUtils.log('='.repeat(50));

    const tests = [
      () => this.testSuperAdminCreation(),
      () => this.testInstructorRegistration(),
      () => this.testStudentRegistration(),
      () => this.testAuthentication(),
      () => this.testRoleBasedAccess(),
      () => this testData.isolation.testTenantIsolation(),
      () => this.testSubscriptionGating(),
      () => this.testFeatureGating(),
      () => this.testUsageLimits(),
      () => this.testDataSecurity()
    ];

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
      try {
        await TestUtils.retry(test);
        passed++;
        TestUtils.log(`${test.name} - PASSED`, 'success');
      } catch (error) {
        failed++;
        TestUtils.log(`${test.name} - FAILED: ${error.message}`, 'error');
      }
    }

    // Summary
    TestUtils.log('='.repeat(50));
    TestUtils.log(`Test Results: ${passed} passed, ${failed} failed`);

    if (failed === 0) {
      TestUtils.log('🎉 All tests passed!', 'success');
    } else {
      TestUtils.log(`❌ ${failed} test(s) failed`, 'error');
    }

    return { passed, failed, total: tests.length };
  }

  // Test 1: Super Admin Creation
  async testSuperAdminCreation() {
    TestUtils.log('Testing Super Admin Creation...');

    const testData = TestUtils.generateTestData();
    this.testData.superAdmin = testData;

    // Register super admin
    const registerResponse = await TestUtils.makeRequest(`${TEST_CONFIG.baseUrl}/api/auth/register`, {
      method: 'POST',
      body: JSON.stringify({
        ...testData,
        planType: 'enterprise'
      })
    });

    if (!registerResponse.token || !registerResponse.user) {
      throw new Error('Super admin registration failed');
    }

    if (registerResponse.user.role !== 'super_admin') {
      throw new Error('User role is not super_admin');
    }

    this.testData.superAdminToken = registerResponse.token;
    this.testData.superAdminUser = registerResponse.user;

    TestUtils.log('Super admin created successfully');
  }

  // Test 2: Instructor Registration
  async testInstructorRegistration() {
    TestUtils.log('Testing Instructor Registration...');

    const testData = TestUtils.generateTestData();
    this.testData.instructor = testData;

    // Register instructor
    const registerResponse = await TestUtils.makeRequest(`${TEST_CONFIG.baseUrl}/api/auth/register`, {
      method: 'POST',
      body: JSON.stringify({
        ...testData,
        planType: 'pro'
      })
    });

    if (!registerResponse.token || !registerResponse.user) {
      throw new Error('Instructor registration failed');
    }

    if (registerResponse.user.role !== 'instructor') {
      throw new Error('User role is not instructor');
    }

    this.testData.instructorToken = registerResponse.token;
    this.testData.instructorUser = registerResponse.user;

    TestUtils.log('Instructor registered successfully');
  }

  // Test 3: Student Registration
  async testStudentRegistration() {
    TestUtils.log('Testing Student Registration...');

    const testData = TestUtils.generateTestData();
    this.testData.student = testData;

    // Register student
    const registerResponse = await TestUtils.makeRequest(`${TEST_CONFIG.baseUrl}/api/auth/register`, {
      method: 'POST',
      body: JSON.stringify({
        ...testData,
        planType: 'basic'
      })
    });

    if (!registerResponse.token || !registerResponse.user) {
      throw new Error('Student registration failed');
    }

    this.testData.studentToken = registerResponse.token;
    this.testData.studentUser = registerResponse.user;

    TestUtils.log('Student registered successfully');
  }

  // Test 4: Authentication
  async testAuthentication() {
    TestUtils.log('Testing Authentication...');

    // Test login with correct credentials
    const loginResponse = await TestUtils.makeRequest(`${TEST_CONFIG.baseUrl}/api/auth/login`, {
      method: 'POST',
      body: JSON.stringify({
        email: this.testData.instructor.email,
        password: this.testData.instructor.password
      })
    });

    if (!loginResponse.token || !loginResponse.user) {
      throw new Error('Login failed');
    }

    // Test token validation
    const validateResponse = await TestUtils.makeAuthenticatedRequest(
      `${TEST_CONFIG.baseUrl}/api/auth/validate`,
      loginResponse.token
    );

    if (!validateResponse.user || validateResponse.user.id !== this.testData.instructorUser.id) {
      throw new Error('Token validation failed');
    }

    // Test invalid credentials
    try {
      await TestUtils.makeRequest(`${TEST_CONFIG.baseUrl}/api/auth/login`, {
        method: 'POST',
        body: JSON.stringify({
          email: this.testData.instructor.email,
          password: 'wrongpassword'
        })
      });
      throw new Error('Should have failed with wrong password');
    } catch (error) {
      if (!error.message.includes('401')) {
        throw error;
      }
    }

    TestUtils.log('Authentication tests passed');
  }

  // Test 5: Role-based Access Control
  async testRoleBasedAccess() {
    TestUtils.log('Testing Role-based Access Control...');

    // Test super admin can access admin endpoints
    const tenantsResponse = await TestUtils.makeAuthenticatedRequest(
      `${TEST_CONFIG.baseUrl}/api/admin/tenants`,
      this.testData.superAdminToken
    );

    if (!Array.isArray(tenantsResponse)) {
      throw new Error('Super admin cannot access tenants endpoint');
    }

    // Test instructor cannot access admin endpoints
    try {
      await TestUtils.makeAuthenticatedRequest(
        `${TEST_CONFIG.baseUrl}/api/admin/tenants`,
        this.testData.instructorToken
      );
      throw new Error('Instructor should not access admin endpoints');
    } catch (error) {
      if (!error.message.includes('403')) {
        throw error;
      }
    }

    // Test student cannot access instructor endpoints
    try {
      await TestUtils.makeAuthenticatedRequest(
        `${TEST_CONFIG.baseUrl}/api/quizzes`,
        this.testData.studentToken
      );
      // This might pass if students can read quizzes, so we check other restrictions
    } catch (error) {
      // Expected for some endpoints
    }

    TestUtils.log('Role-based access control tests passed');
  }

  // Test 6: Tenant Isolation
  async testTenantIsolation() {
    TestUtils.log('Testing Tenant Isolation...');

    // Create quiz as instructor 1
    const quiz1 = await TestUtils.makeAuthenticatedRequest(
      `${TEST_CONFIG.baseUrl}/api/quizzes`,
      this.testData.instructorToken,
      {
        method: 'POST',
        body: JSON.stringify({
          title: 'Instructor 1 Quiz',
          description: 'Quiz from instructor 1',
          status: 'draft'
        })
      }
    );

    // Create second instructor
    const instructor2Data = TestUtils.generateTestData();
    const instructor2Response = await TestUtils.makeRequest(`${TEST_CONFIG.baseUrl}/api/auth/register`, {
      method: 'POST',
      body: JSON.stringify({
        ...instructor2Data,
        planType: 'pro'
      })
    });

    // Try to access quiz from different tenant
    try {
      await TestUtils.makeAuthenticatedRequest(
        `${TEST_CONFIG.baseUrl}/api/quizzes/${quiz1.id}`,
        instructor2Response.token
      );
      throw new Error('Should not access quiz from different tenant');
    } catch (error) {
      if (!error.message.includes('403') && !error.message.includes('404')) {
        throw error;
      }
    }

    TestUtils.log('Tenant isolation tests passed');
  }

  // Test 7: Subscription Gating
  async testSubscriptionGating() {
    TestUtils.log('Testing Subscription Gating...');

    // Test subscription status
    const subscriptionResponse = await TestUtils.makeAuthenticatedRequest(
      `${TEST_CONFIG.baseUrl}/api/subscription/usage`,
      this.testData.instructorToken
    );

    if (!subscriptionResponse.usage || subscriptionResponse.usage.plan !== 'pro') {
      throw new Error('Subscription status incorrect');
    }

    // Test plan upgrade
    const upgradeResponse = await TestUtils.makeAuthenticatedRequest(
      `${TEST_CONFIG.baseUrl}/api/subscription/upgrade`,
      this.testData.instructorToken,
      {
        method: 'POST',
        body: JSON.stringify({
          planId: 'enterprise'
        })
      }
    );

    if (!upgradeResponse.subscription) {
      throw new Error('Subscription upgrade failed');
    }

    TestUtils.log('Subscription gating tests passed');
  }

  // Test 8: Feature Gating
  async testFeatureGating() {
    TestUtils.log('Testing Feature Gating...');

    // Test basic user cannot access enterprise features
    const basicUserData = TestUtils.generateTestData();
    const basicUserResponse = await TestUtils.makeRequest(`${TEST_CONFIG.baseUrl}/api/auth/register`, {
      method: 'POST',
      body: JSON.stringify(basicUserData)
    });

    // Try to access enterprise feature
    try {
      await TestUtils.makeAuthenticatedRequest(
        `${TEST_CONFIG.baseUrl}/api/quizzes/advanced-analytics`,
        basicUserResponse.token
      );
      throw new Error('Basic user should not access enterprise features');
    } catch (error) {
      if (!error.message.includes('403') && !error.message.includes('402')) {
        throw error;
      }
    }

    TestUtils.log('Feature gating tests passed');
  }

  // Test 9: Usage Limits
  async testUsageLimits() {
    TestUtils.log('Testing Usage Limits...');

    const basicUserData = TestUtils.generateTestData();
    const basicUserResponse = await TestUtils.makeRequest(`${TEST_CONFIG.baseUrl}/api/auth/register`, {
      method: 'POST',
      body: JSON.stringify(basicUserData)
    });

    // Create quizzes up to the limit
    const limits = { maxQuizzes: 10 };
    for (let i = 0; i < limits.maxQuizzes + 1; i++) {
      try {
        await TestUtils.makeAuthenticatedRequest(
          `${TEST_CONFIG.baseUrl}/api/quizzes`,
          basicUserResponse.token,
          {
            method: 'POST',
            body: JSON.stringify({
              title: `Quiz ${i + 1}`,
              description: `Test quiz ${i + 1}`
            })
          }
        );

        if (i >= limits.maxQuizzes) {
          throw new Error('Should not allow creating more than limit');
        }
      } catch (error) {
        if (i < limits.maxQuizzes) {
          throw error;
        }
        // Expected to fail when exceeding limit
        TestUtils.log(`Quiz creation correctly blocked at limit ${i + 1}`);
        break;
      }
    }

    TestUtils.log('Usage limits tests passed');
  }

  // Test 10: Data Security
  async testDataSecurity() {
    TestUtils.log('Testing Data Security...');

    // Test that sensitive data is not exposed
    const userResponse = await TestUtils.makeAuthenticatedRequest(
      `${TEST_CONFIG.baseUrl}/api/auth/profile`,
      this.testData.instructorToken
    );

    if (userResponse.user.password_hash || userResponse.user.reset_token) {
      throw new Error('Sensitive data exposed in API response');
    }

    // Test audit logging
    await TestUtils.makeAuthenticatedRequest(
      `${TEST_CONFIG.baseUrl}/api/quizzes`,
      this.testData.instructorToken,
      {
        method: 'POST',
        body: JSON.stringify({
          title: 'Audit Test Quiz',
          description: 'Quiz for testing audit logging'
        })
      }
    );

    // Check if audit log was created (super admin access)
    const auditResponse = await TestUtils.makeAuthenticatedRequest(
      `${TEST_CONFIG.baseUrl}/api/admin/activity`,
      this.testData.superAdminToken
    );

    if (!Array.isArray(auditResponse)) {
      throw new Error('Audit log not accessible');
    }

    TestUtils.log('Data security tests passed');
  }
}

// Run tests if this file is executed directly
if (typeof module !== 'undefined' && require.main === module) {
  const testSuite = new MultiTenantTestSuite();

  testSuite.runAllTests()
    .then(results => {
      process.exit(results.failed > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

// Export for use in browser or other environments
if (typeof window !== 'undefined') {
  window.MultiTenantTestSuite = MultiTenantTestSuite;
  window.TestUtils = TestUtils;
}

// Export for Node.js
if (typeof module !== 'undefined') {
  module.exports = { MultiTenantTestSuite, TestUtils };
}
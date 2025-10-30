/**
 * Simplified Instructor Dashboard
 * Uses modular components instead of monolithic structure
 */

import { Dashboard } from './components/Dashboard.js';

/**
 * Initialize the instructor dashboard
 */
async function initializeInstructorDashboard() {
  try {
    // Create and initialize the dashboard
    const dashboard = new Dashboard();
    await dashboard.init();

    // Make dashboard globally available
    window.dashboard = dashboard;

    console.log('[InstructorDashboard] Dashboard initialized successfully');
  } catch (error) {
    console.error('[InstructorDashboard] Failed to initialize dashboard:', error);

    // Show error to user
    const errorDiv = document.createElement('div');
    errorDiv.className = 'fixed top-4 right-4 bg-red-100 border border-red-200 text-red-700 px-4 py-3 rounded-lg z-50';
    errorDiv.innerHTML = `
      <strong>Error:</strong> Failed to load dashboard. Please refresh the page.
    `;
    document.body.appendChild(errorDiv);

    // Remove error after 5 seconds
    setTimeout(() => {
      errorDiv.remove();
    }, 5000);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeInstructorDashboard);
} else {
  initializeInstructorDashboard();
}

// Export for testing
export { initializeInstructorDashboard };
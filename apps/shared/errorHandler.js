/**
 * Global Error Handler
 * Provides consistent error handling and user feedback across the application
 */

class ErrorHandler {
  constructor() {
    this.errorLog = [];
    this.maxLogSize = 50;
    this.setupGlobalHandlers();
  }

  setupGlobalHandlers() {
    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled promise rejection:', event.reason);
      this.logError({
        type: 'unhandledRejection',
        error: event.reason,
        timestamp: new Date().toISOString(),
      });

      // Prevent default browser error
      event.preventDefault();

      // Show user-friendly message
      this.showUserMessage(
        'An unexpected error occurred. Please refresh the page.',
        'error'
      );
    });

    // Handle general JavaScript errors
    window.addEventListener('error', (event) => {
      console.error('Global error:', event.error);
      this.logError({
        type: 'globalError',
        error: event.error,
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        timestamp: new Date().toISOString(),
      });

      // Show user-friendly message for critical errors
      if (this.isCriticalError(event.error)) {
        this.showUserMessage(
          'A critical error occurred. Please refresh the page.',
          'error'
        );
      }
    });
  }

  isCriticalError(error) {
    // Define what constitutes a critical error
    const criticalPatterns = [
      /Cannot read prop/i,
      /undefined is not/i,
      /null is not/i,
      /Failed to fetch/i,
      /Network request failed/i,
    ];

    const errorString = error?.toString() || '';
    return criticalPatterns.some((pattern) => pattern.test(errorString));
  }

  logError(errorInfo) {
    this.errorLog.push(errorInfo);

    // Keep log size manageable
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.shift();
    }

    // Send to monitoring service in production
    if (this.shouldReportError(errorInfo)) {
      this.reportToMonitoring(errorInfo);
    }
  }

  shouldReportError(errorInfo) {
    // Don't report in development
    if (window.location.hostname === 'localhost') {
      return false;
    }

    // Filter out known non-critical errors
    const ignoredPatterns = [
      /ResizeObserver loop limit exceeded/i,
      /Non-Error promise rejection captured/i,
    ];

    const errorString = JSON.stringify(errorInfo);
    return !ignoredPatterns.some((pattern) => pattern.test(errorString));
  }

  reportToMonitoring(errorInfo) {
    // Integration point for error monitoring services
    // (e.g., Sentry, LogRocket, etc.)
    console.log('[ErrorHandler] Would report to monitoring:', errorInfo);
  }

  handleError(error, context = {}) {
    const errorInfo = {
      message: error?.message || 'Unknown error',
      stack: error?.stack,
      context,
      timestamp: new Date().toISOString(),
    };

    console.error(`[${context.component || 'App'}] Error:`, error);
    this.logError(errorInfo);

    return this.getUserMessage(error);
  }

  getUserMessage(error) {
    const message = error?.message || '';

    // Map technical errors to user-friendly messages
    const errorMap = {
      'Failed to fetch':
        'Unable to connect to the server. Please check your internet connection.',
      'Network request failed': 'Connection error. Please try again.',
      'no active subscription':
        'You need an active subscription to access this feature.',
      'no active study slot': 'No content available for your department today.',
      Unauthorized: 'Your session has expired. Please sign in again.',
      'rate limit': 'Too many requests. Please wait a moment and try again.',
      'Invalid email or password':
        'Incorrect email or password. Please try again.',
      404: 'The requested resource was not found.',
      500: 'Server error. Our team has been notified.',
      503: 'Service temporarily unavailable. Please try again later.',
    };

    for (const [key, userMessage] of Object.entries(errorMap)) {
      if (message.toLowerCase().includes(key.toLowerCase())) {
        return userMessage;
      }
    }

    // Generic message for unknown errors
    return 'An error occurred. Please try again.';
  }

  showUserMessage(message, type = 'error') {
    // Create toast notification
    const existingToast = document.getElementById('error-toast');
    if (existingToast) {
      existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.id = 'error-toast';
    toast.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-sm transform transition-all duration-300`;

    // Style based on type
    const styles = {
      error: 'bg-red-100 border border-red-400 text-red-700',
      warning: 'bg-yellow-100 border border-yellow-400 text-yellow-700',
      success: 'bg-green-100 border border-green-400 text-green-700',
      info: 'bg-blue-100 border border-blue-400 text-blue-700',
    };

    toast.className += ` ${styles[type] || styles.error}`;

    toast.innerHTML = `
      <div class="flex items-start">
        <div class="flex-1">
          <p class="text-sm font-medium">${message}</p>
        </div>
        <button onclick="this.parentElement.parentElement.remove()" class="ml-4 text-current opacity-70 hover:opacity-100">
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"/>
          </svg>
        </button>
      </div>
    `;

    document.body.appendChild(toast);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  }

  clearErrors() {
    this.errorLog = [];
  }

  getErrorLog() {
    return [...this.errorLog];
  }
}

// Export singleton instance
export const errorHandler = new ErrorHandler();

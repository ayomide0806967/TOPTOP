/**
 * Validation utilities for the quiz builder application
 */

export class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

export class QuizValidator {
  static validateBlueprintTitle(title) {
    if (!title || typeof title !== 'string') {
      throw new ValidationError('Quiz title is required', 'title');
    }

    if (title.trim().length < 3) {
      throw new ValidationError('Quiz title must be at least 3 characters long', 'title');
    }

    if (title.length > 200) {
      throw new ValidationError('Quiz title must be less than 200 characters', 'title');
    }

    // Check for potentially harmful content
    if (/<script|javascript:|on\w+=/i.test(title)) {
      throw new ValidationError('Quiz title contains invalid characters', 'title');
    }

    return title.trim();
  }

  static validateBlueprintDescription(description) {
    if (!description) return '';

    if (typeof description !== 'string') {
      throw new ValidationError('Description must be text', 'description');
    }

    if (description.length > 1000) {
      throw new ValidationError('Description must be less than 1000 characters', 'description');
    }

    // Sanitize HTML-like content
    if (/<script|javascript:|on\w+=/i.test(description)) {
      throw new ValidationError('Description contains invalid characters', 'description');
    }

    return description.trim();
  }

  static validateQuestionText(text) {
    if (!text || typeof text !== 'string') {
      throw new ValidationError('Question text is required', 'text');
    }

    if (text.trim().length < 5) {
      throw new ValidationError('Question text must be at least 5 characters long', 'text');
    }

    if (text.length > 2000) {
      throw new ValidationError('Question text must be less than 2000 characters', 'text');
    }

    // Basic XSS prevention
    if (/<script|javascript:|on\w+=/i.test(text)) {
      throw new ValidationError('Question text contains invalid characters', 'text');
    }

    return text.trim();
  }

  static validateQuestionType(type) {
    const validTypes = ['multiple_choice', 'true_false', 'short_answer', 'essay', 'fill_blank', 'matching'];

    if (!type || !validTypes.includes(type)) {
      throw new ValidationError('Invalid question type', 'type');
    }

    return type;
  }

  static validateQuestionPoints(points) {
    const numPoints = parseInt(points);

    if (isNaN(numPoints) || numPoints < 1) {
      throw new ValidationError('Points must be at least 1', 'points');
    }

    if (numPoints > 100) {
      throw new ValidationError('Points cannot exceed 100', 'points');
    }

    return numPoints;
  }

  static validateQuestionTimeLimit(timeLimit) {
    if (!timeLimit) return null;

    const numTime = parseInt(timeLimit);

    if (isNaN(numTime) || numTime < 10) {
      throw new ValidationError('Time limit must be at least 10 seconds', 'timeLimit');
    }

    if (numTime > 3600) {
      throw new ValidationError('Time limit cannot exceed 1 hour', 'timeLimit');
    }

    return numTime;
  }

  static validateMultipleChoiceOptions(options) {
    if (!Array.isArray(options) || options.length < 2) {
      throw new ValidationError('Multiple choice questions must have at least 2 options', 'options');
    }

    if (options.length > 6) {
      throw new ValidationError('Multiple choice questions cannot have more than 6 options', 'options');
    }

    const validOptions = [];
    for (const option of options) {
      if (!option || typeof option !== 'string') continue;

      const trimmedOption = option.trim();
      if (trimmedOption.length === 0) continue;

      if (trimmedOption.length > 200) {
        throw new ValidationError('Option text must be less than 200 characters', 'options');
      }

      if (/<script|javascript:|on\w+=/i.test(trimmedOption)) {
        throw new ValidationError('Option contains invalid characters', 'options');
      }

      validOptions.push(trimmedOption);
    }

    if (validOptions.length < 2) {
      throw new ValidationError('At least 2 valid options are required', 'options');
    }

    return validOptions;
  }

  static validateCorrectAnswer(answer, type, options = []) {
    if (!answer && answer !== false) {
      throw new ValidationError('Correct answer is required', 'correctAnswer');
    }

    switch (type) {
      case 'multiple_choice':
        if (typeof answer !== 'number' || answer < 0 || answer >= options.length) {
          throw new ValidationError('Invalid correct answer index', 'correctAnswer');
        }
        break;

      case 'true_false':
        if (typeof answer !== 'boolean') {
          throw new ValidationError('Correct answer must be true or false', 'correctAnswer');
        }
        break;

      case 'short_answer':
        if (typeof answer !== 'string' || answer.trim().length === 0) {
          throw new ValidationError('Correct answer is required', 'correctAnswer');
        }

        if (answer.trim().length > 500) {
          throw new ValidationError('Correct answer must be less than 500 characters', 'correctAnswer');
        }
        break;

      default:
        // For essay and other types, answer might be optional or handled differently
        break;
    }

    return answer;
  }

  static validateExplanation(explanation) {
    if (!explanation) return '';

    if (typeof explanation !== 'string') {
      throw new ValidationError('Explanation must be text', 'explanation');
    }

    if (explanation.length > 1000) {
      throw new ValidationError('Explanation must be less than 1000 characters', 'explanation');
    }

    if (/<script|javascript:|on\w+=/i.test(explanation)) {
      throw new ValidationError('Explanation contains invalid characters', 'explanation');
    }

    return explanation.trim();
  }

  static validateEmail(email) {
    if (!email) return null;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new ValidationError('Invalid email address', 'email');
    }

    return email.toLowerCase().trim();
  }

  static validatePhoneNumber(phone) {
    if (!phone) return null;

    // Remove all non-digit characters except + for international numbers
    const cleanedPhone = phone.replace(/[^\d+]/g, '');

    if (cleanedPhone.length < 10) {
      throw new ValidationError('Phone number must be at least 10 digits', 'phone');
    }

    if (cleanedPhone.length > 15) {
      throw new ValidationError('Phone number is too long', 'phone');
    }

    return cleanedPhone;
  }

  static validateClassName(name) {
    if (!name || typeof name !== 'string') {
      throw new ValidationError('Classroom name is required', 'name');
    }

    if (name.trim().length < 3) {
      throw new ValidationError('Classroom name must be at least 3 characters long', 'name');
    }

    if (name.length > 100) {
      throw new ValidationError('Classroom name must be less than 100 characters', 'name');
    }

    if (/<script|javascript:|on\w+=/i.test(name)) {
      throw new ValidationError('Classroom name contains invalid characters', 'name');
    }

    return name.trim();
  }

  static validateSeatQuota(quota) {
    const numQuota = parseInt(quota);

    if (isNaN(numQuota) || numQuota < 1) {
      throw new ValidationError('Seat quota must be at least 1', 'seatQuota');
    }

    if (numQuota > 1000) {
      throw new ValidationError('Seat quota cannot exceed 1000', 'seatQuota');
    }

    return numQuota;
  }

  static validatePin(pin) {
    if (!pin) return null;

    if (typeof pin !== 'string') {
      throw new ValidationError('PIN must be text', 'pin');
    }

    if (!/^\d{4,8}$/.test(pin)) {
      throw new ValidationError('PIN must be 4-8 digits', 'pin');
    }

    return pin;
  }

  static validateDateTime(dateTime, fieldName = 'dateTime') {
    if (!dateTime) {
      throw new ValidationError(`${fieldName} is required`, fieldName);
    }

    const date = new Date(dateTime);
    if (isNaN(date.getTime())) {
      throw new ValidationError(`Invalid ${fieldName}`, fieldName);
    }

    // Check if date is in the past for start dates
    if (fieldName.includes('start') && date < new Date()) {
      throw new ValidationError(`${fieldName} cannot be in the past`, fieldName);
    }

    return date.toISOString();
  }

  static sanitizeHtml(html) {
    if (!html) return '';

    // Basic HTML sanitization - remove script tags and dangerous attributes
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+="[^"]*"/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/vbscript:/gi, '')
      .replace(/data:/gi, '');
  }

  static validateFileSize(file, maxSizeMB = 10) {
    if (!file) return null;

    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      throw new ValidationError(`File size must be less than ${maxSizeMB}MB`, 'file');
    }

    return true;
  }

  static validateFileType(file, allowedTypes) {
    if (!file) return null;

    if (!allowedTypes.includes(file.type)) {
      throw new ValidationError('Invalid file type', 'file');
    }

    return true;
  }
}

export class SecurityUtils {
  static sanitizeInput(input) {
    if (!input) return '';

    return input
      .toString()
      .trim()
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .replace(/javascript:/gi, '') // Remove JavaScript protocol
      .replace(/on\w+=/gi, ''); // Remove event handlers
  }

  static generateCSRFToken() {
    // Simple CSRF token generation
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  static validateCSRFToken(token, sessionToken) {
    return token && sessionToken && token === sessionToken;
  }

  static rateLimitCheck(action, userId, maxAttempts = 5, windowMs = 60000) {
    // This would typically be server-side, but here's a basic client-side version
    const key = `${action}_${userId}`;
    const attempts = JSON.parse(localStorage.getItem(key) || '[]');
    const now = Date.now();

    // Remove old attempts outside the window
    const validAttempts = attempts.filter(time => now - time < windowMs);

    if (validAttempts.length >= maxAttempts) {
      throw new ValidationError(`Too many ${action} attempts. Please try again later.`, 'rateLimit');
    }

    // Add current attempt
    validAttempts.push(now);
    localStorage.setItem(key, JSON.stringify(validAttempts));

    return true;
  }

  static logSecurityEvent(event, details = {}) {
    // Log security events for monitoring
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      details,
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    console.warn('Security Event:', logEntry);

    // In production, this would be sent to a security monitoring service
  }
}
import { QARequest } from '../types/index.js';
import { config } from '../config/index.js';

/**
 * Create a validation error
 */
export function createValidationError(message: string): Error {
  const error = new Error(message);
  error.name = 'ValidationError';
  return error;
}

/**
 * Check if an error is a validation error
 */
export function isValidationError(error: any): error is Error {
  return error && error.name === 'ValidationError';
}

/**
 * Validates a QA request
 */
export function validateQARequest(body: any): QARequest {
  if (!body) {
    throw createValidationError('Request body is required');
  }

  if (typeof body !== 'object' || body === null) {
    throw createValidationError('Request body must be a valid JSON object');
  }

  const typedBody = body as any;

  // Validate question
  if (!typedBody.question) {
    throw createValidationError('Question is required in request body');
  }

  if (typeof typedBody.question !== 'string') {
    throw createValidationError('Question must be a string');
  }

  if (typedBody.question.trim() === '') {
    throw createValidationError('Question cannot be empty');
  }

  if (typedBody.question.length > config.qa.maxQuestionLength) {
    throw createValidationError(
      `Question is too long. Maximum length is ${config.qa.maxQuestionLength} characters`
    );
  }

  // Validate context if provided
  if (typedBody.context !== undefined) {
    if (typeof typedBody.context !== 'string') {
      throw createValidationError('Context must be a string if provided');
    }

    if (typedBody.context.length > config.qa.maxContextLength) {
      throw createValidationError(
        `Context is too long. Maximum length is ${config.qa.maxContextLength} characters`
      );
    }
  }

  return {
    question: typedBody.question.trim(),
    context: typedBody.context?.trim() || undefined,
  };
}

/**
 * Sanitizes input string to prevent injection attacks
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return '';
  
  return input
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim();
}

/**
 * Validates HTTP method and path combination
 */
export function validateRoute(method: string, path: string): boolean {
  const validRoutes = [
    { method: 'GET', path: '/health' },
    { method: 'POST', path: '/qa' },
    { method: 'POST', path: '/' },
    { method: 'OPTIONS', path: /.+/ }, // Allow OPTIONS for any path (CORS)
  ];

  return validRoutes.some(route => {
    if (route.method !== method) return false;
    
    if (route.path instanceof RegExp) {
      return route.path.test(path);
    }
    
    return route.path === path;
  });
}

/**
 * Rate limiting validation (for future implementation)
 */
export function validateRateLimit(requestId: string): boolean {
  // TODO: Implement rate limiting logic
  // This could use DynamoDB or Redis for tracking request rates
  return true;
}

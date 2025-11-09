import type { QARequest, JsonValue } from '@/types/index';
import { createValidationError } from './errors';
import { config } from '@config/index';

// Re-export the error functions for convenience
export { createValidationError, isValidationError } from './errors';

export function validateQARequest(body: JsonValue | null): QARequest {
  if (!body) {
    throw createValidationError('Request body is required');
  }
  if (typeof body !== 'object' || body === null) {
    throw createValidationError('Request body must be a valid JSON object');
  }
  const typedBody = body as Record<string, JsonValue>;
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

export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim();
}

export function validateRoute(method: string, path: string): boolean {
  const validRoutes = [
    { method: 'GET', path: '/health' },
    { method: 'POST', path: '/qa' },
    { method: 'POST', path: '/' },
    { method: 'OPTIONS', path: /.+/ },
  ];
  return validRoutes.some(route => {
    if (route.method !== method) return false;
    if (route.path instanceof RegExp) {
      return route.path.test(path);
    }
    return route.path === path;
  });
}

export function validateRateLimit(_requestId: string): boolean {
  return true;
}

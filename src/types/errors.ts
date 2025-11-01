/**
 * Custom error types for validation and application logic
 */

export interface ValidationErrorData {
  code: string;
  message: string;
  field?: string;
}

/**
 * Create a validation error object
 */
export function createValidationError(
  message: string,
  code: string = 'VALIDATION_ERROR',
  field?: string
): ValidationErrorData {
  return {
    code,
    message,
    field,
  };
}

/**
 * Check if an error is a validation error
 */
export function isValidationError(error: any): error is ValidationErrorData {
  return error && error.code && error.code.includes('VALIDATION');
}

/**
 * Custom Error class for validation errors
 */
export class ValidationError extends Error {
  code: string;
  field?: string;

  constructor(message: string, code: string = 'VALIDATION_ERROR', field?: string) {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
    this.field = field;
  }
}

/**
 * Custom Error class for application errors
 */
export class AppError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, code: string = 'APP_ERROR', statusCode: number = 500) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

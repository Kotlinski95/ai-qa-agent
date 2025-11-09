import type { ValidationErrorData, AppErrorData, ValidationError, AppError } from '@/types/errors';

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

export function isValidationError(error: unknown): error is ValidationErrorData {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    typeof (error as Record<string, unknown>).code === 'string' &&
    ((error as Record<string, unknown>).code as string).includes('VALIDATION')
  );
}

export function throwValidationError(
  message: string,
  code: string = 'VALIDATION_ERROR',
  field?: string
): never {
  const error = new Error(message) as ValidationError;
  error.name = 'ValidationError';
  error.code = code;
  if (field) error.field = field;
  throw error;
}

export function createAppError(
  message: string,
  code: string = 'APP_ERROR',
  statusCode: number = 500
): AppErrorData {
  return {
    message,
    code,
    statusCode,
  };
}

export function throwAppError(
  message: string,
  code: string = 'APP_ERROR',
  statusCode: number = 500
): never {
  const error = new Error(message) as AppError;
  error.name = 'AppError';
  error.code = code;
  error.statusCode = statusCode;
  throw error;
}

export function isAppError(error: unknown): error is AppError {
  return (
    error !== null &&
    typeof error === 'object' &&
    'name' in error &&
    (error as Record<string, unknown>).name === 'AppError' &&
    'code' in error &&
    'statusCode' in error
  );
}

// Common utility types for the application

export type UnknownRecord = Record<string, unknown>;

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface LogContext {
  [key: string]: JsonValue | undefined;
}

export interface ErrorContext {
  message: string;
  stack?: string;
  code?: string;
  statusCode?: number;
  [key: string]: JsonValue | undefined;
}

export interface ValidationResult<T = unknown> {
  isValid: boolean;
  data?: T;
  errors?: string[];
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

export interface RequestMetadata {
  timestamp: string;
  requestId: string;
  userAgent?: string;
  ip?: string;
}

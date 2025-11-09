export interface ValidationErrorData {
  code: string;
  message: string;
  field?: string;
}

export interface AppErrorData {
  message: string;
  code: string;
  statusCode: number;
}

export interface ValidationError extends Error {
  code: string;
  field?: string;
}

export interface AppError extends Error {
  code: string;
  statusCode: number;
}

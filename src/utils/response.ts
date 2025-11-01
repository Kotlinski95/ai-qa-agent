import { APIGatewayProxyResult, Context } from 'aws-lambda';
import { getCorsHeaders } from '../config/index.js';
import { HttpStatusCode, ErrorResponse } from '../types/index.js';

/**
 * Creates a standardized API Gateway response
 */
export function createResponse(
  statusCode: HttpStatusCode,
  body: any,
  headers: Record<string, string> = {}
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      ...getCorsHeaders(),
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

/**
 * Creates a success response
 */
export function createSuccessResponse(
  data: any,
  statusCode: HttpStatusCode = HttpStatusCode.OK,
  headers?: Record<string, string>
): APIGatewayProxyResult {
  return createResponse(statusCode, data, headers);
}

/**
 * Creates an error response
 */
export function createErrorResponse(
  error: string,
  message: string,
  statusCode: HttpStatusCode = HttpStatusCode.INTERNAL_SERVER_ERROR,
  context?: Context
): APIGatewayProxyResult {
  const errorResponse: ErrorResponse = {
    error,
    message,
    timestamp: new Date().toISOString(),
    ...(context && { requestId: context.awsRequestId }),
  };

  return createResponse(statusCode, errorResponse);
}

/**
 * Creates a CORS preflight response
 */
export function createCorsResponse(): APIGatewayProxyResult {
  return createResponse(HttpStatusCode.OK, '');
}

/**
 * Creates a 404 Not Found response
 */
export function createNotFoundResponse(
  method: string,
  path: string,
  availableRoutes: readonly string[],
  context?: Context
): APIGatewayProxyResult {
  return createErrorResponse(
    'Not Found',
    `Route ${method} ${path} not found`,
    HttpStatusCode.NOT_FOUND,
    context
  );
}

/**
 * Creates a validation error response
 */
export function createValidationErrorResponse(
  message: string,
  context?: Context
): APIGatewayProxyResult {
  return createErrorResponse(
    'Bad Request',
    message,
    HttpStatusCode.BAD_REQUEST,
    context
  );
}

/**
 * Safely parses JSON body
 */
export function parseJsonBody<T = any>(body: string | null): T | null {
  if (!body) return null;
  
  try {
    return JSON.parse(body) as T;
  } catch (error) {
    throw new Error('Invalid JSON in request body');
  }
}

/**
 * Adds standard response metadata
 */
export function addResponseMetadata(
  data: any,
  context: Context
): any {
  return {
    ...data,
    timestamp: new Date().toISOString(),
    requestId: context.awsRequestId,
  };
}

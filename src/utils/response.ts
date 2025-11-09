import { APIGatewayProxyResult, Context } from 'aws-lambda';
import { getHeaders } from '@config/headers';
import { HttpStatusCode } from '@/types/index';
import type { JsonValue } from '@/types/common';

export function createResponse(
  statusCode: HttpStatusCode,
  body: JsonValue,
  headers: Record<string, string> = {}
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      ...getHeaders(),
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

export function createSuccessResponse(
  data: JsonValue,
  statusCode: HttpStatusCode = HttpStatusCode.OK,
  headers?: Record<string, string>
): APIGatewayProxyResult {
  return createResponse(statusCode, data, headers);
}

export function createErrorResponse(
  error: string,
  message: string,
  statusCode: HttpStatusCode = HttpStatusCode.INTERNAL_SERVER_ERROR,
  context?: Context
): APIGatewayProxyResult {
  const errorResponse = {
    error,
    message,
    timestamp: new Date().toISOString(),
    ...(context && { requestId: context.awsRequestId }),
  };
  return createResponse(statusCode, errorResponse);
}

export function createCorsResponse(): APIGatewayProxyResult {
  return createResponse(HttpStatusCode.OK, '');
}

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

export function createValidationErrorResponse(
  message: string,
  context?: Context
): APIGatewayProxyResult {
  return createErrorResponse('Bad Request', message, HttpStatusCode.BAD_REQUEST, context);
}

export function parseJsonBody<T = JsonValue>(body: string | null): T | null {
  if (!body) return null;
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error('Invalid JSON in request body');
  }
}

export function addResponseMetadata(
  data: Record<string, JsonValue>,
  context: Context
): Record<string, JsonValue> {
  return {
    ...data,
    timestamp: new Date().toISOString(),
    requestId: context.awsRequestId,
  };
}

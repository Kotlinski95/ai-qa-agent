import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

// Request/Response interfaces
export interface QARequest {
  question: string;
  context?: string;
}

export interface QAResponse {
  question: string;
  answer: string;
  context: string | null;
  timestamp: string;
  requestId: string;
}

export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  requestId: string;
  version?: string;
  ai?: {
    configured: boolean;
    provider: string;
    model?: string;
    connected?: boolean;
  };
}

export interface ErrorResponse {
  error: string;
  message: string;
  requestId?: string;
  timestamp?: string;
}

// Handler types
export type LambdaHandler = (
  event: APIGatewayProxyEvent,
  context: Context
) => Promise<APIGatewayProxyResult>;

export type RouteHandler = (
  event: APIGatewayProxyEvent,
  context: Context
) => Promise<APIGatewayProxyResult>;

// Route matching
export interface Route {
  method: string;
  path: string | RegExp;
  handler: RouteHandler;
}

// HTTP Methods
export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
  OPTIONS = 'OPTIONS',
  PATCH = 'PATCH'
}

// HTTP Status Codes
export enum HttpStatusCode {
  OK = 200,
  CREATED = 201,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  INTERNAL_SERVER_ERROR = 500,
  SERVICE_UNAVAILABLE = 503
}

// Common Lambda event extensions
export interface ParsedEvent extends APIGatewayProxyEvent {
  parsedBody?: any;
}

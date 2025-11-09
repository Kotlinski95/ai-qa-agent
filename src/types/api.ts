import { APIGatewayProxyEvent } from 'aws-lambda';
import type { JsonValue } from './common';

export interface QARequest {
  question: string;
  context?: string;
  [key: string]: JsonValue | undefined;
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
  [key: string]: JsonValue | undefined;
}

export interface ParsedEvent extends Omit<APIGatewayProxyEvent, 'body'> {
  body: string | null;
  parsedBody?: JsonValue;
}

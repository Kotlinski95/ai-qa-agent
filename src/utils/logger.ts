import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { config } from '@config/index';
import type { LogContext } from '@/types/common';

function formatMessage(level: string, message: string, meta?: LogContext): void {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...(meta && { meta }),
  };
  console.log(JSON.stringify(logEntry));
}

export function logInfo(message: string, meta?: LogContext): void {
  formatMessage('INFO', message, meta);
}

export function logError(message: string, error?: Error | LogContext | unknown): void {
  let errorMeta: LogContext | undefined;

  if (error instanceof Error) {
    errorMeta = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  } else if (error && typeof error === 'object') {
    errorMeta = error as LogContext;
  } else if (error !== undefined) {
    errorMeta = { error: String(error) };
  }

  formatMessage('ERROR', message, errorMeta);
}

export function logWarn(message: string, meta?: LogContext): void {
  formatMessage('WARN', message, meta);
}

export function logDebug(message: string, meta?: LogContext): void {
  if (config.logging.level === 'debug') {
    formatMessage('DEBUG', message, meta);
  }
}

export function logRequest(event: APIGatewayProxyEvent, context: Context): void {
  if (!config.logging.enableRequestLogging) return;
  logInfo('Incoming request', {
    requestId: context.awsRequestId,
    method: event.httpMethod,
    path: event.path,
    userAgent: event.headers['User-Agent'],
    sourceIp: event.requestContext?.identity?.sourceIp,
  });
}

export function logResponse(statusCode: number, context: Context, duration?: number): void {
  if (!config.logging.enableResponseLogging) return;
  logInfo('Response sent', {
    requestId: context.awsRequestId,
    statusCode,
    ...(duration && { duration: `${duration}ms` }),
  });
}

export const logger = {
  info: logInfo,
  error: logError,
  warn: logWarn,
  debug: logDebug,
  logRequest,
  logResponse,
};

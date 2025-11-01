import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { config } from '../config/index.js';

/**
 * Format log message
 */
function formatMessage(level: string, message: string, meta?: any): void {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...(meta && { meta }),
  };

  console.log(JSON.stringify(logEntry));
}

/**
 * Log info message
 */
export function logInfo(message: string, meta?: any): void {
  formatMessage('INFO', message, meta);
}

/**
 * Log error message
 */
export function logError(message: string, error?: Error | any): void {
  const errorMeta = error instanceof Error 
    ? { 
        name: error.name, 
        message: error.message, 
        stack: error.stack 
      }
    : error;

  formatMessage('ERROR', message, errorMeta);
}

/**
 * Log warning message
 */
export function logWarn(message: string, meta?: any): void {
  formatMessage('WARN', message, meta);
}

/**
 * Log debug message
 */
export function logDebug(message: string, meta?: any): void {
  if (config.logging.level === 'debug') {
    formatMessage('DEBUG', message, meta);
  }
}

/**
 * Log incoming request
 */
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

/**
 * Log response
 */
export function logResponse(statusCode: number, context: Context, duration?: number): void {
  if (!config.logging.enableResponseLogging) return;

  logInfo('Response sent', {
    requestId: context.awsRequestId,
    statusCode,
    ...(duration && { duration: `${duration}ms` }),
  });
}

/**
 * Logger object for backward compatibility
 * @deprecated Use individual log functions instead
 */
export const logger = {
  info: logInfo,
  error: logError,
  warn: logWarn,
  debug: logDebug,
  logRequest,
  logResponse,
};

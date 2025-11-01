// Load environment variables first
import './env.js';

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { routeRequest, initializeRouter } from './router/index.js';
import { createErrorResponse } from './utils/response.js';
import { HttpStatusCode, LambdaHandler } from './types/index.js';
import { logRequest, logResponse, logError } from './utils/logger.js';
import { config } from './config/index.js';

// Initialize router
initializeRouter();

/**
 * Main Lambda handler - Clean, focused, and maintainable
 */
export const handler: LambdaHandler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  const startTime = Date.now();
  
  try {
    // Log incoming request
    logRequest(event, context);
    
    // Route the request
    const response = await routeRequest(event, context);
    
    // Log response
    const duration = Date.now() - startTime;
    logResponse(response.statusCode, context, duration);
    
    return response;

  } catch (error) {
    // Log critical error
    logError('Unhandled error in main handler', error);
    
    // Return generic error response
    return createErrorResponse(
      'Internal Server Error',
      'An unexpected error occurred. Please try again later.',
      HttpStatusCode.INTERNAL_SERVER_ERROR,
      context
    );
  }
};

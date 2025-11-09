import './env';
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { routeRequest, initializeRouter } from '@router/index';
import { createErrorResponse } from '@utils/response';
import { HttpStatusCode } from '@/types/index';
import type { LambdaHandler } from '@/types/index';
import { logRequest, logResponse, logError } from '@utils/logger';

initializeRouter();

export const handler: LambdaHandler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  const startTime = Date.now();
  try {
    logRequest(event, context);
    const response = await routeRequest(event, context);
    const duration = Date.now() - startTime;
    logResponse(response.statusCode, context, duration);
    return response;
  } catch (error) {
    logError('Unhandled error in main handler', error);
    return createErrorResponse(
      'Internal Server Error',
      'An unexpected error occurred. Please try again later.',
      HttpStatusCode.INTERNAL_SERVER_ERROR,
      context
    );
  }
};

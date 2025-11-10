import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { validateQARequest, sanitizeInput, isValidationError } from '@utils/validation';
import { logger } from '@utils/logger';
import { config } from '@config/index';
import { HttpStatusCode } from '@/types/index';
import { getHeaders } from '@config/headers';

export async function qaStreamHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  logger.debug('QA streaming request received');
  try {
    let requestData;
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      requestData = {
        question: params.question,
        context: params.context || undefined,
      };
    } else {
      requestData = JSON.parse(event.body || '{}');
    }
    const validatedRequest = validateQARequest(requestData);
    logger.info('Processing streaming QA request', {
      questionLength: validatedRequest.question.length,
      hasContext: !!validatedRequest.context,
    });
    const sanitizedQuestion = sanitizeInput(validatedRequest.question);
    const sanitizedContext = validatedRequest.context
      ? sanitizeInput(validatedRequest.context)
      : undefined;
    if (!config.ai.openai.apiKey) {
      logger.warn('OpenAI API key not configured, returning error for streaming');
      return {
        statusCode: HttpStatusCode.SERVICE_UNAVAILABLE,
        headers: getHeaders(),
        body: JSON.stringify({
          error: 'AI service not configured. Please configure OpenAI API key.',
          code: 'AI_NOT_CONFIGURED',
        }),
      };
    }
    const chunks: string[] = [];
    try {
      const { generateAnswerStream } = await import('../services/langchain');
      logger.info('Starting OpenAI streaming response', {
        model: config.ai.openai.model,
      });
      for await (const chunk of generateAnswerStream(sanitizedQuestion, sanitizedContext)) {
        chunks.push(chunk);
      }
      const fullAnswer = chunks.join('');
      logger.debug('Streaming response completed', {
        totalChunks: chunks.length,
        answerLength: fullAnswer.length,
      });
      return {
        statusCode: HttpStatusCode.OK,
        headers: getHeaders(),
        body: JSON.stringify({
          question: sanitizedQuestion,
          answer: fullAnswer,
          chunks: chunks,
          context: sanitizedContext || null,
          timestamp: new Date().toISOString(),
          requestId: context.awsRequestId,
          streaming: true,
          totalChunks: chunks.length,
        }),
      };
    } catch (error) {
      logger.error('Streaming generation error', error);
      return {
        statusCode: HttpStatusCode.INTERNAL_SERVER_ERROR,
        headers: getHeaders(),
        body: JSON.stringify({
          error: 'Failed to generate streaming response',
          message: error instanceof Error ? error.message : 'Unknown error',
        }),
      };
    }
  } catch (error) {
    if (isValidationError(error)) {
      logger.warn(`Validation error: ${error.message}`);
      return {
        statusCode: HttpStatusCode.BAD_REQUEST,
        headers: getHeaders(),
        body: JSON.stringify({
          error: error.message,
          code: 'VALIDATION_ERROR',
        }),
      };
    }
    logger.error('QA streaming processing error', error);
    return {
      statusCode: HttpStatusCode.INTERNAL_SERVER_ERROR,
      headers: getHeaders(),
      body: JSON.stringify({
        error: 'Failed to process your question. Please try again.',
        code: 'PROCESSING_ERROR',
      }),
    };
  }
}

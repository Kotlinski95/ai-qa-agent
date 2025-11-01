import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { validateQARequest, sanitizeInput, isValidationError } from '../utils/validation.js';
import { QARequest, HttpStatusCode } from '../types/index.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

/**
 * Streaming QA handler using Server-Sent Events
 * POST /qa/stream
 */
export async function qaStreamHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  logger.debug('QA streaming request received');

  try {
    let requestData;
    
    if (event.httpMethod === 'GET') {
      // Handle GET request with query parameters
      const params = event.queryStringParameters || {};
      requestData = {
        question: params.question,
        context: params.context || undefined
      };
    } else {
      // Handle POST request with body
      requestData = JSON.parse(event.body || '{}');
    }
    
    const validatedRequest = validateQARequest(requestData);

    logger.info('Processing streaming QA request', {
      questionLength: validatedRequest.question.length,
      hasContext: !!validatedRequest.context,
    });

    // Sanitize inputs
    const sanitizedQuestion = sanitizeInput(validatedRequest.question);
    const sanitizedContext = validatedRequest.context 
      ? sanitizeInput(validatedRequest.context) 
      : undefined;

    // Check if OpenAI API key is configured
    if (!config.ai.openai.apiKey) {
      logger.warn('OpenAI API key not configured, returning error for streaming');
      return {
        statusCode: HttpStatusCode.SERVICE_UNAVAILABLE,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
        body: JSON.stringify({
          error: 'AI service not configured. Please configure OpenAI API key.',
          code: 'AI_NOT_CONFIGURED'
        })
      };
    }

    // Generate streaming response
    const chunks: string[] = [];
    try {
      const { generateAnswerStream } = await import('../services/langchain.js');
      
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

      // For Lambda, we can't do true streaming, so we return the response with chunks
      // The client can simulate streaming by processing chunks
      return {
        statusCode: HttpStatusCode.OK,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
        body: JSON.stringify({
          question: sanitizedQuestion,
          answer: fullAnswer,
          chunks: chunks,
          context: sanitizedContext || null,
          timestamp: new Date().toISOString(),
          requestId: context.awsRequestId,
          streaming: true,
          totalChunks: chunks.length
        })
      };

    } catch (error) {
      logger.error('Streaming generation error', error);
      return {
        statusCode: HttpStatusCode.INTERNAL_SERVER_ERROR,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Failed to generate streaming response',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      };
    }

  } catch (error) {
    if (isValidationError(error)) {
      logger.warn(`Validation error: ${error.message}`);
      return {
        statusCode: HttpStatusCode.BAD_REQUEST,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: error.message,
          code: 'VALIDATION_ERROR'
        })
      };
    }

    logger.error('QA streaming processing error', error);
    return {
      statusCode: HttpStatusCode.INTERNAL_SERVER_ERROR,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Failed to process your question. Please try again.',
        code: 'PROCESSING_ERROR'
      })
    };
  }
}

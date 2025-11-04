import { createSessionAgent } from './services/langgraph-agent.js';
import { logger } from './utils/logger.js';
import { sanitizeString } from './utils/sanitizers.js';
import { config } from './config/index.js';

// Declare AWS Lambda streaming globals (available in Lambda runtime)
declare const awslambda: {
  streamifyResponse: (handler: any) => any;
  HttpResponseStream: {
    from: (responseStream: any, metadata: any) => any;
  };
};

/**
 * Lambda Response Streaming Handler for Lambda Function URLs
 * 
 * This handler uses AWS Lambda's Response Streaming feature which allows
 * true streaming responses to clients. Unlike API Gateway, Lambda Function URLs
 * with RESPONSE_STREAM mode send chunks to the client immediately.
 * 
 * Deploy with SAM template or AWS CLI:
 * 
 * SAM template.yaml:
 * ```yaml
 * Resources:
 *   StreamingFunction:
 *     Type: AWS::Serverless::Function
 *     Properties:
 *       Handler: dist/streaming-handler.handler
 *       Runtime: nodejs20.x
 *       Architectures: [arm64]
 *       FunctionUrlConfig:
 *         AuthType: NONE
 *         InvokeMode: RESPONSE_STREAM
 *         Cors:
 *           AllowOrigins: ['*']
 *           AllowMethods: [GET, POST, OPTIONS]
 *           AllowHeaders: ['Content-Type']
 * ```
 * 
 * Or CLI:
 * ```bash
 * aws lambda create-function-url-config \
 *   --function-name ai-qa-agent-streaming \
 *   --auth-type NONE \
 *   --invoke-mode RESPONSE_STREAM \
 *   --cors '{"AllowOrigins":["*"],"AllowMethods":["GET","POST"],"AllowHeaders":["Content-Type"]}'
 * ```
 */

interface StreamingEvent {
  queryStringParameters?: {
    question?: string;
    sessionId?: string;
  };
  body?: string;
  httpMethod?: string;
}

/**
 * Streaming handler implementation
 * Uses awslambda.streamifyResponse wrapper for Lambda streaming
 */
const streamingHandler = async (
  event: StreamingEvent,
  responseStream: any,
  _context: any
): Promise<void> => {
  try {
    // Extract parameters
    let question: string;
    let sessionId: string;

    if (event.queryStringParameters) {
      question = sanitizeString(event.queryStringParameters.question || '');
      sessionId = sanitizeString(event.queryStringParameters.sessionId || `session-${Date.now()}`);
    } else if (event.body) {
      const body = JSON.parse(event.body);
      question = sanitizeString(body.question || '');
      sessionId = sanitizeString(body.sessionId || `session-${Date.now()}`);
    } else {
      throw new Error('Question is required');
    }

    // Validation
    if (!question) {
      throw new Error('Question is required');
    }

    if (question.length > config.qa.maxQuestionLength) {
      throw new Error(`Question exceeds maximum length of ${config.qa.maxQuestionLength} characters`);
    }

    logger.info('Starting Lambda streaming response', { 
      sessionId, 
      questionLength: question.length,
      streaming: true,
      mode: 'RESPONSE_STREAM'
    });

    // Set response headers for SSE
    // Note: CORS headers are handled by Lambda Function URL config, don't add them here
    const metadata = {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
      }
    };
    
    // Create streaming response with metadata
    responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);

    // Send start event
    responseStream.write(`data: ${JSON.stringify({
      type: 'start',
      sessionId,
      question,
      timestamp: new Date().toISOString()
    })}\n\n`);

    // Stream chunks from agent
    const agent = createSessionAgent(sessionId);
    let chunkIndex = 0;
    let fullAnswer = '';

    try {
      for await (const chunk of agent.askStream(question)) {
        fullAnswer += chunk;
        
        // Write SSE event immediately (true streaming!)
        responseStream.write(`data: ${JSON.stringify({
          type: 'chunk',
          index: chunkIndex++,
          chunk,
          timestamp: new Date().toISOString()
        })}\n\n`);

        logger.debug('Chunk streamed', { sessionId, chunkIndex, size: chunk.length });
      }

      // Send completion event
      responseStream.write(`data: ${JSON.stringify({
        type: 'complete',
        sessionId,
        answer: fullAnswer,
        totalChunks: chunkIndex,
        answerLength: fullAnswer.length,
        timestamp: new Date().toISOString()
      })}\n\n`);

      logger.info('Lambda streaming completed successfully', { 
        sessionId, 
        totalChunks: chunkIndex,
        answerLength: fullAnswer.length
      });
    } catch (streamError) {
      logger.error('Error during streaming', streamError);
      
      // Send error event
      responseStream.write(`data: ${JSON.stringify({
        type: 'error',
        error: streamError instanceof Error ? streamError.message : 'Streaming error'
      })}\n\n`);
    }

    // End stream
    responseStream.end();

  } catch (error) {
    logger.error('Streaming handler error', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    try {
      // Try to write error to stream (if not already written)
      const errorData = `data: ${JSON.stringify({
        type: 'error',
        error: errorMessage,
        timestamp: new Date().toISOString()
      })}\n\n`;
      
      responseStream.write(errorData);
      responseStream.end();
    } catch (writeError) {
      logger.error('Failed to write error to stream', writeError);
      // Stream might already be closed, nothing we can do
    }
  }
};

/**
 * Export the handler wrapped with streamifyResponse
 * This is required for Lambda Function URLs with InvokeMode: RESPONSE_STREAM
 */
export const handler = awslambda.streamifyResponse(streamingHandler);

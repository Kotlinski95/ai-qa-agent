import { createSessionAgent } from '@services/langgraph-agent';
import { logger } from '@utils/logger';
import { sanitizeString } from '@utils/sanitizers';
import { config } from '@config/index';
import { headers } from '@config/headers';
import type { StreamingEvent } from '@/types/streaming';
import type { LambdaStreamifyResponse } from '@/types/streaming-lambda';

declare const awslambda: LambdaStreamifyResponse;

interface StreamWriter {
  write: (data: string) => void;
  end: () => void;
}

const streamingHandler = async (event: unknown, responseStream: unknown): Promise<void> => {
  let httpStream: StreamWriter | undefined;

  try {
    const streamingEvent = event as StreamingEvent;

    let question: string;
    let sessionId: string;
    if (streamingEvent.queryStringParameters) {
      question = sanitizeString(streamingEvent.queryStringParameters.question || '');
      sessionId = sanitizeString(
        streamingEvent.queryStringParameters.sessionId || `session-${Date.now()}`
      );
    } else if (streamingEvent.body) {
      const body = JSON.parse(streamingEvent.body);
      question = sanitizeString(body.question || '');
      sessionId = sanitizeString(body.sessionId || `session-${Date.now()}`);
    } else {
      throw new Error('Question is required');
    }
    if (!question) {
      throw new Error('Question is required');
    }
    if (question.length > config.qa.maxQuestionLength) {
      throw new Error(
        `Question exceeds maximum length of ${config.qa.maxQuestionLength} characters`
      );
    }
    logger.info('Starting Lambda streaming response', {
      sessionId,
      questionLength: question.length,
      streaming: true,
      mode: 'RESPONSE_STREAM',
    });
    const metadata = {
      statusCode: 200,
      headers: headers.sse,
    };
    httpStream = awslambda.HttpResponseStream.from(responseStream, metadata) as StreamWriter;
    httpStream.write(
      `data: ${JSON.stringify({
        type: 'start',
        sessionId,
        question,
        timestamp: new Date().toISOString(),
      })}\n\n`
    );
    const agent = createSessionAgent(sessionId);
    let chunkIndex = 0;
    let fullAnswer = '';
    try {
      for await (const chunk of agent.askStream(question)) {
        fullAnswer += chunk;
        httpStream.write(
          `data: ${JSON.stringify({
            type: 'chunk',
            index: chunkIndex++,
            chunk,
            timestamp: new Date().toISOString(),
          })}\n\n`
        );
        logger.debug('Chunk streamed', { sessionId, chunkIndex, size: chunk.length });
      }
      httpStream.write(
        `data: ${JSON.stringify({
          type: 'complete',
          sessionId,
          answer: fullAnswer,
          totalChunks: chunkIndex,
          answerLength: fullAnswer.length,
          timestamp: new Date().toISOString(),
        })}\n\n`
      );
      logger.info('Lambda streaming completed successfully', {
        sessionId,
        totalChunks: chunkIndex,
        answerLength: fullAnswer.length,
      });
    } catch (streamError) {
      logger.error('Error during streaming', streamError);
      httpStream.write(
        `data: ${JSON.stringify({
          type: 'error',
          error: streamError instanceof Error ? streamError.message : 'Streaming error',
        })}\n\n`
      );
    }
    httpStream.end();
  } catch (error) {
    logger.error('Streaming handler error', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (httpStream) {
      try {
        const errorData = `data: ${JSON.stringify({
          type: 'error',
          error: errorMessage,
          timestamp: new Date().toISOString(),
        })}\n\n`;
        httpStream.write(errorData);
        httpStream.end();
      } catch (writeError) {
        logger.error('Failed to write error to stream', writeError);
      }
    }
  }
};

export const handler = awslambda.streamifyResponse(streamingHandler);

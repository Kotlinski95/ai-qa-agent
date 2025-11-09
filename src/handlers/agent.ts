import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createSessionAgent } from '@services/langgraph-agent';
import type { SessionAgent } from '@/types/agent';
import { logger } from '@utils/logger';
import { isValidationError } from '@utils/errors';
import { sanitizeString } from '@utils/sanitizers';
import { config } from '@config/index';
import { getHeaders, getSSEHeaders } from '@config/headers';
import { MEMORY_SIZES, HTTP_STATUS } from '../constants/index';

const agentSessions: Map<string, SessionAgent> = new Map();

function parseAgentRequestParams(event: APIGatewayProxyEvent): {
  question: string;
  sessionId: string;
} {
  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || {};
    return {
      question: sanitizeString(params.question || ''),
      sessionId: sanitizeString(params.sessionId || `session-${Date.now()}`),
    };
  } else {
    const body = event.body ? JSON.parse(event.body) : {};
    return {
      question: sanitizeString(body.question || ''),
      sessionId: sanitizeString(body.sessionId || `session-${Date.now()}`),
    };
  }
}

function parsePostOnlyParams(event: APIGatewayProxyEvent): { question: string; sessionId: string } {
  const body = event.body ? JSON.parse(event.body) : {};
  return {
    question: sanitizeString(body.question || ''),
    sessionId: sanitizeString(body.sessionId || `session-${Date.now()}`),
  };
}

function validateAgentRequest(question: string): APIGatewayProxyResult | null {
  if (!question) {
    return {
      statusCode: HTTP_STATUS.BAD_REQUEST,
      headers: {
        ...getHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: 'Question is required' }),
    };
  }
  if (question.length > config.qa.maxQuestionLength) {
    return {
      statusCode: HTTP_STATUS.BAD_REQUEST,
      headers: {
        ...getHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: 'Question too long' }),
    };
  }
  return null;
}

function getOrCreateAgentSession(sessionId: string): SessionAgent {
  if (!agentSessions.has(sessionId)) {
    const agent = createSessionAgent(sessionId);
    agentSessions.set(sessionId, agent);
    logger.debug('New agent session created', { sessionId });
  }
  return agentSessions.get(sessionId)!;
}

export async function agentStreamHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  logger.debug('Agent stream handler invoked', { method: event.httpMethod });
  try {
    const { question, sessionId } = parseAgentRequestParams(event);

    const validationError = validateAgentRequest(question);
    if (validationError) {
      return validationError;
    }

    const agent = getOrCreateAgentSession(sessionId);
    logger.info('Processing streaming agent request', {
      sessionId,
      questionLength: question.length,
      method: event.httpMethod,
    });
    const chunks: string[] = [];
    let fullAnswer = '';
    for await (const chunk of agent.askStream(question)) {
      chunks.push(chunk);
      fullAnswer += chunk;
      logger.debug('Chunk received', {
        sessionId,
        chunkSize: chunk.length,
        totalSize: fullAnswer.length,
      });
    }
    logger.info('Streaming response completed', {
      sessionId,
      totalChunks: chunks.length,
      totalLength: fullAnswer.length,
    });
    const sseEvents: string[] = [];
    sseEvents.push(
      `data: ${JSON.stringify({
        type: 'start',
        sessionId,
        question,
        timestamp: new Date().toISOString(),
      })}\n`
    );
    chunks.forEach((chunk, index) => {
      sseEvents.push(
        `data: ${JSON.stringify({
          type: 'chunk',
          index,
          chunk,
          progress: Math.round(((index + 1) / chunks.length) * MEMORY_SIZES.HUNDRED_MB),
        })}\n`
      );
    });
    sseEvents.push(
      `data: ${JSON.stringify({
        type: 'complete',
        sessionId,
        answer: fullAnswer,
        historySize: agent.getHistory().length,
        totalChunks: chunks.length,
        totalLength: fullAnswer.length,
        websiteDataFetched:
          fullAnswer.toLowerCase().includes('website') ||
          fullAnswer.toLowerCase().includes('fetched'),
        timestamp: new Date().toISOString(),
      })}\n`
    );
    sseEvents.push('event: done\ndata: null\n');
    const sseBody = sseEvents.join('\n');
    return {
      statusCode: HTTP_STATUS.OK,
      headers: getSSEHeaders(),
      body: sseBody,
    };
  } catch (error) {
    logger.error('Agent stream handler error', error);
    const statusCode = isValidationError(error)
      ? HTTP_STATUS.BAD_REQUEST
      : HTTP_STATUS.INTERNAL_SERVER_ERROR;
    const message = error instanceof Error ? error.message : 'Internal server error';
    return {
      statusCode,
      headers: {
        ...getHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error: message,
        sessionId: 'unknown',
      }),
    };
  }
}

export async function agentChatHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  logger.debug('Agent chat handler invoked');
  try {
    const { question, sessionId } = parsePostOnlyParams(event);

    const validationError = validateAgentRequest(question);
    if (validationError) {
      return validationError;
    }

    const agent = getOrCreateAgentSession(sessionId);
    const answer = await agent.ask(question);
    return {
      statusCode: 200,
      headers: getHeaders(),
      body: JSON.stringify({
        sessionId,
        question,
        answer,
        historySize: agent.getHistory().length,
        message: 'Response generated successfully',
      }),
    };
  } catch (error) {
    logger.error('Agent chat handler error', error);
    const statusCode = isValidationError(error)
      ? HTTP_STATUS.BAD_REQUEST
      : HTTP_STATUS.INTERNAL_SERVER_ERROR;
    const message = error instanceof Error ? error.message : 'Internal server error';
    return {
      statusCode,
      headers: getHeaders(),
      body: JSON.stringify({ error: message }),
    };
  }
}

export async function agentHistoryHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  logger.debug('Agent history handler invoked');
  try {
    const query = event.queryStringParameters || {};
    const sessionId = sanitizeString(query.sessionId || '');
    if (!sessionId) {
      return {
        statusCode: 400,
        headers: getHeaders(),
        body: JSON.stringify({ error: 'sessionId is required' }),
      };
    }
    const agent = getOrCreateAgentSession(sessionId);
    const history = agent.getHistory();
    return {
      statusCode: HTTP_STATUS.OK,
      headers: getHeaders(),
      body: JSON.stringify({
        sessionId,
        historySize: history.length,
        messages: history.map(msg => ({
          type: msg._getType(),
          content: msg.content.toString().substring(0, HTTP_STATUS.OK),
        })),
      }),
    };
  } catch (error) {
    logger.error('Agent history handler error', error);
    return {
      statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      headers: getHeaders(),
      body: JSON.stringify({
        error: 'Failed to retrieve history',
      }),
    };
  }
}

export async function agentSessionClearHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  logger.debug('Agent session clear handler invoked');
  try {
    const sessionId = sanitizeString(event.pathParameters?.sessionId || '');
    if (!sessionId) {
      return {
        statusCode: 400,
        headers: getHeaders(),
        body: JSON.stringify({ error: 'sessionId is required' }),
      };
    }
    if (agentSessions.has(sessionId)) {
      agentSessions.delete(sessionId);
      logger.debug('Agent session cleared', { sessionId });
      return {
        statusCode: 200,
        headers: getHeaders(),
        body: JSON.stringify({
          message: 'Session cleared successfully',
          sessionId,
        }),
      };
    }
    return {
      statusCode: 404,
      headers: getHeaders(),
      body: JSON.stringify({
        error: 'Session not found',
        sessionId,
      }),
    };
  } catch (error) {
    logger.error('Agent session clear handler error', error);
    return {
      statusCode: 500,
      headers: getHeaders(),
      body: JSON.stringify({
        error: 'Failed to clear session',
      }),
    };
  }
}

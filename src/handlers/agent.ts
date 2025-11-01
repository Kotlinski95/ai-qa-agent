import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createSessionAgent, type SessionAgent } from '../services/langgraph-agent.js';
import { logger } from '../utils/logger.js';
import { createValidationError, isValidationError } from '../utils/validation.js';
import { sanitizeString } from '../utils/sanitizers.js';
import { config, getCorsHeaders } from '../config/index.js';

// Store agent instances per session (in production, use DynamoDB or Redis)
const agentSessions: Map<string, SessionAgent> = new Map();

/**
 * Get or create agent session
 */
function getOrCreateAgentSession(sessionId: string): SessionAgent {
  if (!agentSessions.has(sessionId)) {
    const agent = createSessionAgent(sessionId);
    agentSessions.set(sessionId, agent);
    logger.debug('New agent session created', { sessionId });
  }
  return agentSessions.get(sessionId)!;
}

/**
 * Handler for POST/GET /agent/stream - Streaming conversation with LangGraph agent
 * Returns Server-Sent Events format for true streaming (GET preferred for SSE)
 */
export async function agentStreamHandler(
  event: APIGatewayProxyEvent,
  context: any
): Promise<APIGatewayProxyResult> {
  logger.debug('Agent stream handler invoked', { method: event.httpMethod });

  // Support both GET (preferred for streaming) and POST
  let question: string;
  let sessionId: string;

  try {
    if (event.httpMethod === 'GET') {
      // GET request with query parameters (preferred for SSE streaming)
      const params = event.queryStringParameters || {};
      question = sanitizeString(params.question || '');
      sessionId = sanitizeString(params.sessionId || `session-${Date.now()}`);
    } else {
      // POST request with body
      const body = event.body ? JSON.parse(event.body) : {};
      question = sanitizeString(body.question || '');
      sessionId = sanitizeString(body.sessionId || `session-${Date.now()}`);
    }

    // Validation
    if (!question) {
      return {
        statusCode: 400,
        headers: {
          ...getCorsHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'Question is required' }),
      };
    }

    if (question.length > config.qa.maxQuestionLength) {
      return {
        statusCode: 400,
        headers: {
          ...getCorsHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          error: `Question exceeds maximum length of ${config.qa.maxQuestionLength} characters`,
        }),
      };
    }

    const agent = getOrCreateAgentSession(sessionId);

    logger.info('Processing streaming agent request', {
      sessionId,
      questionLength: question.length,
      method: event.httpMethod,
    });

    // Collect chunks as they stream
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

    // Build SSE format response
    const sseEvents: string[] = [];
    
    // Send initial event with metadata
    sseEvents.push(`data: ${JSON.stringify({
      type: 'start',
      sessionId,
      question,
      timestamp: new Date().toISOString(),
    })}\n`);

    // Send each chunk as an event
    chunks.forEach((chunk, index) => {
      sseEvents.push(`data: ${JSON.stringify({
        type: 'chunk',
        index,
        chunk,
        progress: Math.round(((index + 1) / chunks.length) * 100),
      })}\n`);
    });

    // Send completion event with metadata
    sseEvents.push(`data: ${JSON.stringify({
      type: 'complete',
      sessionId,
      answer: fullAnswer,
      historySize: agent.getHistory().length,
      totalChunks: chunks.length,
      totalLength: fullAnswer.length,
      websiteDataFetched: fullAnswer.toLowerCase().includes('website') || fullAnswer.toLowerCase().includes('fetched'),
      timestamp: new Date().toISOString(),
    })}\n`);

    // Add final event marker
    sseEvents.push('event: done\ndata: null\n');

    const sseBody = sseEvents.join('\n');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: sseBody,
    };
  } catch (error) {
    logger.error('Agent stream handler error', error);

    const statusCode = isValidationError(error) ? 400 : 500;
    const message = error instanceof Error ? error.message : 'Internal server error';

    return {
      statusCode,
      headers: {
        ...getCorsHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error: message,
        sessionId: 'unknown',
      }),
    };
  }
}

/**
 * Handler for POST /agent/chat - Regular conversation with LangGraph agent
 */
export async function agentChatHandler(
  event: APIGatewayProxyEvent,
  context: any
): Promise<APIGatewayProxyResult> {
  logger.debug('Agent chat handler invoked');

  try {
    const body = event.body ? JSON.parse(event.body) : {};

    const question = sanitizeString(body.question || '');
    const sessionId = sanitizeString(body.sessionId || `session-${Date.now()}`);

    if (!question) {
      return {
        statusCode: 400,
        headers: getCorsHeaders(),
        body: JSON.stringify({ error: 'Question is required' }),
      };
    }

    if (question.length > config.qa.maxQuestionLength) {
      return {
        statusCode: 400,
        headers: getCorsHeaders(),
        body: JSON.stringify({
          error: `Question exceeds maximum length of ${config.qa.maxQuestionLength}`,
        }),
      };
    }

    const agent = getOrCreateAgentSession(sessionId);
    const answer = await agent.ask(question);

    return {
      statusCode: 200,
      headers: getCorsHeaders(),
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

    const statusCode = isValidationError(error) ? 400 : 500;
    const message = error instanceof Error ? error.message : 'Internal server error';

    return {
      statusCode,
      headers: getCorsHeaders(),
      body: JSON.stringify({ error: message }),
    };
  }
}

/**
 * Handler for GET /agent/history - Retrieve conversation history
 */
export async function agentHistoryHandler(
  event: APIGatewayProxyEvent,
  context: any
): Promise<APIGatewayProxyResult> {
  logger.debug('Agent history handler invoked');

  try {
    const query = event.queryStringParameters || {};
    const sessionId = sanitizeString(query.sessionId || '');

    if (!sessionId) {
      return {
        statusCode: 400,
        headers: getCorsHeaders(),
        body: JSON.stringify({ error: 'sessionId is required' }),
      };
    }

    const agent = getOrCreateAgentSession(sessionId);
    const history = agent.getHistory();

    return {
      statusCode: 200,
      headers: getCorsHeaders(),
      body: JSON.stringify({
        sessionId,
        historySize: history.length,
        messages: history.map(msg => ({
          type: msg._getType(),
          content: msg.content.toString().substring(0, 200), // Preview only
        })),
      }),
    };
  } catch (error) {
    logger.error('Agent history handler error', error);

    return {
      statusCode: 500,
      headers: getCorsHeaders(),
      body: JSON.stringify({
        error: 'Failed to retrieve history',
      }),
    };
  }
}

/**
 * Handler for DELETE /agent/session/:sessionId - Clear session
 */
export async function agentSessionClearHandler(
  event: APIGatewayProxyEvent,
  context: any
): Promise<APIGatewayProxyResult> {
  logger.debug('Agent session clear handler invoked');

  try {
    const sessionId = sanitizeString(event.pathParameters?.sessionId || '');

    if (!sessionId) {
      return {
        statusCode: 400,
        headers: getCorsHeaders(),
        body: JSON.stringify({ error: 'sessionId is required' }),
      };
    }

    if (agentSessions.has(sessionId)) {
      agentSessions.delete(sessionId);
      logger.debug('Agent session cleared', { sessionId });

      return {
        statusCode: 200,
        headers: getCorsHeaders(),
        body: JSON.stringify({
          message: 'Session cleared successfully',
          sessionId,
        }),
      };
    }

    return {
      statusCode: 404,
      headers: getCorsHeaders(),
      body: JSON.stringify({
        error: 'Session not found',
        sessionId,
      }),
    };
  } catch (error) {
    logger.error('Agent session clear handler error', error);

    return {
      statusCode: 500,
      headers: getCorsHeaders(),
      body: JSON.stringify({
        error: 'Failed to clear session',
      }),
    };
  }
}

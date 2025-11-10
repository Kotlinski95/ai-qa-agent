import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { config } from '@config/index';
import { logger } from '@utils/logger';
import { CONTENT_LIMITS } from '@constants/index';
import { streamWithWebsiteContent, streamWithoutWebsiteContent } from './streaming/handlers';

/**
 * Main function to process a question using the appropriate agent
 * @param question - User's question
 * @param threadId - Optional thread identifier
 * @returns Promise resolving to agent response
 */
export async function processQuestion(question: string, threadId?: string): Promise<string> {
  try {
    logger.debug('Processing question', {
      question: question.substring(0, CONTENT_LIMITS.PREVIEW_LENGTH),
      threadId,
    });
    const configThreadId = threadId || `thread-${Date.now()}`;
    logger.debug('Config check', {
      websiteSearchEnabled: config.ai.agent.websiteSearchEnabled,
      sitemapUrl: config.ai.agent.sitemapUrl,
      willUseReact: config.ai.agent.websiteSearchEnabled && config.ai.agent.sitemapUrl,
    });

    // FIXED: Use the same unified logic as streaming for consistency
    if (config.ai.agent.websiteSearchEnabled && config.ai.agent.sitemapUrl) {
      // Use streaming logic but collect all chunks into a single response
      let fullResponse = '';
      for await (const chunk of streamWithWebsiteContent(question, configThreadId)) {
        fullResponse += chunk;
      }
      return fullResponse;
    } else {
      // Use streaming logic but collect all chunks into a single response
      let fullResponse = '';
      for await (const chunk of streamWithoutWebsiteContent(question, configThreadId)) {
        fullResponse += chunk;
      }
      return fullResponse;
    }
  } catch (error) {
    logger.error(
      'Process question error',
      error instanceof Error ? error : new Error(String(error))
    );
    throw error;
  }
}

/**
 * Main function to process a question with streaming response
 * @param question - User's question
 * @param threadId - Optional thread identifier
 * @yields Streaming response chunks
 */
export async function* processQuestionStream(
  question: string,
  threadId?: string
): AsyncGenerator<string> {
  try {
    logger.debug('Processing question with streaming', {
      question: question.substring(0, CONTENT_LIMITS.PREVIEW_LENGTH),
      threadId,
    });
    const configThreadId = threadId || `thread-${Date.now()}`;

    if (config.ai.agent.websiteSearchEnabled && config.ai.agent.sitemapUrl) {
      yield* streamWithWebsiteContent(question, configThreadId);
    } else {
      yield* streamWithoutWebsiteContent(question, configThreadId);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error(
      'Process question stream error',
      error instanceof Error ? error : new Error(errorMsg)
    );
    yield `Error processing question: ${errorMsg}`;
  }
}

/**
 * Helper function for logging question debug info
 */
function logQuestionDebug(sessionId: string, question: string, operation: string): void {
  logger.debug(`Session agent ${operation}`, {
    sessionId,
    question: question.substring(0, CONTENT_LIMITS.PREVIEW_LENGTH),
  });
}

/**
 * Helper function for logging agent errors
 */
function logAgentError(operation: string, error: unknown): void {
  logger.error(
    `Session agent ${operation} error`,
    error instanceof Error ? error : new Error(String(error))
  );
}

/**
 * Create a session agent with conversation history management
 * @param sessionId - Unique session identifier
 * @returns Session agent with ask, askStream, getHistory, and clearHistory methods
 */
export function createSessionAgent(sessionId: string) {
  const conversationHistory: BaseMessage[] = [];
  return {
    async ask(question: string): Promise<string> {
      try {
        logQuestionDebug(sessionId, question, 'ask');
        conversationHistory.push(new HumanMessage(question));
        const answer = await processQuestion(question, sessionId);
        conversationHistory.push(new AIMessage(answer));
        return answer;
      } catch (error) {
        logAgentError('ask', error);
        throw error;
      }
    },

    async *askStream(question: string): AsyncGenerator<string> {
      try {
        logQuestionDebug(sessionId, question, 'ask stream');
        conversationHistory.push(new HumanMessage(question));
        let fullAnswer = '';
        for await (const chunk of processQuestionStream(question, sessionId)) {
          fullAnswer += chunk;
          yield chunk;
        }
        conversationHistory.push(new AIMessage(fullAnswer));
      } catch (error) {
        logAgentError('ask stream', error);
        yield `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    },

    getHistory(): BaseMessage[] {
      return conversationHistory;
    },

    clearHistory(): void {
      conversationHistory.length = 0;
      logger.debug('Session history cleared', { sessionId });
    },
  };
}

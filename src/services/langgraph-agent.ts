import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { StateGraph, START, END, MemorySaver } from '@langchain/langgraph';
import { Annotation } from '@langchain/langgraph';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import fetch from 'node-fetch';

/**
 * Agent State Definition using LangGraph Annotation
 */
const AgentStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
    default: () => [],
  }),
  websiteContent: Annotation<string>({
    reducer: (_x: string, y: string) => y || _x,
    default: () => '',
  }),
});

type AgentState = typeof AgentStateAnnotation.State;

/**
 * Create ChatOpenAI model for the agent
 */
function createAgentModel(): ChatOpenAI {
  if (!config.ai.openai.apiKey) {
    throw new Error('OpenAI API key is required');
  }

  return new ChatOpenAI({
    apiKey: config.ai.openai.apiKey,
    model: config.ai.openai.model,
    temperature: config.ai.openai.temperature,
    maxTokens: config.ai.openai.maxTokens,
  });
}

/**
 * Fetch website content utility
 */
async function fetchWebsiteContent(url: string): Promise<string> {
  try {
    logger.debug('Fetching website content', { url });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.ai.agent.websiteTimeout);

    const response = await fetch(url, {
      headers: {
        'User-Agent': config.ai.agent.websiteUserAgent,
      },
      signal: controller.signal as any,
    } as any);

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();

    // Basic text extraction from HTML (remove tags, clean whitespace)
    const textContent = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, config.ai.agent.maxWebsiteContentLength);

    logger.info('Website content fetched successfully', { url, contentLength: textContent.length });

    return textContent;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Website fetch failed', error instanceof Error ? error : new Error(errorMsg));
    throw new Error(`Failed to fetch website: ${errorMsg}`);
  }
}

/**
 * Router node - decides if website fetch is needed
 */
async function routerNode(state: AgentState): Promise<Partial<AgentState>> {
  try {
    const lastMessage = state.messages[state.messages.length - 1];
    const questionText = lastMessage?.content?.toString() || '';

    logger.debug('Router node processing', { questionText: questionText.substring(0, 100) });

    // Check if question asks for website data
    const shouldFetch =
      questionText.toLowerCase().includes('website') ||
      questionText.toLowerCase().includes('fetch') ||
      questionText.toLowerCase().includes('check') ||
      questionText.toLowerCase().includes('read') ||
      /https?:\/\//.test(questionText);

    if (shouldFetch) {
      logger.debug('Router decision: fetch website data');
    } else {
      logger.debug('Router decision: answer directly');
    }

    return {};
  } catch (error) {
    logger.error('Router node error', error instanceof Error ? error : new Error(String(error)));
    return {};
  }
}

/**
 * Website fetch node - fetches website content
 */
async function fetchWebsiteNode(state: AgentState): Promise<Partial<AgentState>> {
  try {
    const lastMessage = state.messages[state.messages.length - 1];
    const questionText = lastMessage?.content?.toString() || '';

    logger.debug('Fetch website node: extracting URL', { questionText: questionText.substring(0, 100) });

    // Extract URL from question
    const urlMatch = questionText.match(/https?:\/\/[^\s]+/);
    const url = urlMatch ? urlMatch[0] : null;

    if (!url) {
      logger.warn('No URL found in question');
      return {
        messages: [new AIMessage('No URL found in your question. Please provide a website URL.')],
        websiteContent: '',
      };
    }

    // Fetch website content
    try {
      const websiteContent = await fetchWebsiteContent(url);
      logger.info('Website content extracted', { contentLength: websiteContent.length });

      return {
        messages: [],
        websiteContent,
      };
    } catch (fetchError) {
      const errorMsg = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      logger.error('Website fetch error', fetchError instanceof Error ? fetchError : new Error(errorMsg));

      return {
        messages: [new AIMessage(`Failed to fetch website: ${errorMsg}`)],
        websiteContent: '',
      };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Fetch website node error', error instanceof Error ? error : new Error(errorMsg));
    return {
      messages: [new AIMessage(`Error in fetch node: ${errorMsg}`)],
      websiteContent: '',
    };
  }
}

/**
 * Answer node - generates answer using ChatGPT
 */
async function answerNode(state: AgentState): Promise<Partial<AgentState>> {
  try {
    const lastMessage = state.messages[state.messages.length - 1];
    const questionText = lastMessage?.content?.toString() || '';

    logger.debug('Answer node: generating response', {
      questionLength: questionText.length,
      hasWebsiteContent: state.websiteContent.length > 0,
    });

    const model = createAgentModel();

    // Build system prompt with or without website context
    const contextInfo = state.websiteContent
      ? `I have retrieved the following website content for you:\n\n${state.websiteContent}\n\nPlease use this information to answer the question.`
      : 'Use your general knowledge to answer the following question.';

    const systemPrompt = `You are a helpful AI assistant.

${contextInfo}

Answer clearly and concisely.`;

    // Create messages for model
    const messages: BaseMessage[] = [
      new SystemMessage(systemPrompt),
      ...state.messages.slice(0, -1), // Previous messages
      new HumanMessage(questionText), // Current question
    ];

    // Generate response
    const response = await model.invoke(messages);
    const answer = response.content.toString();

    logger.info('Answer generated successfully', { answerLength: answer.length });

    return {
      messages: [new AIMessage(answer)],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Answer node error', error instanceof Error ? error : new Error(errorMsg));
    return {
      messages: [new AIMessage(`Error generating answer: ${errorMsg}`)],
    };
  }
}

/**
 * Should fetch decision function for conditional edges
 */
function shouldFetchWebsite(state: AgentState): string {
  try {
    const lastMessage = state.messages[state.messages.length - 1];
    const questionText = lastMessage?.content?.toString() || '';

    const needsFetch =
      questionText.toLowerCase().includes('website') ||
      questionText.toLowerCase().includes('fetch') ||
      questionText.toLowerCase().includes('check') ||
      questionText.toLowerCase().includes('read') ||
      /https?:\/\//.test(questionText);

    return needsFetch ? 'fetch_website' : 'answer';
  } catch (error) {
    logger.error('Conditional edge error', error instanceof Error ? error : new Error(String(error)));
    return 'answer';
  }
}

/**
 * Create the LangGraph agent
 */
function createLangGraphAgent() {
  const graph = new StateGraph(AgentStateAnnotation)
    // Add nodes
    .addNode('router', routerNode)
    .addNode('fetch_website', fetchWebsiteNode)
    .addNode('answer', answerNode)
    // Add edges
    .addEdge(START, 'router')
    .addConditionalEdges('router', shouldFetchWebsite)
    .addEdge('fetch_website', 'answer')
    .addEdge('answer', END);

  // Compile with checkpointer for memory
  const checkpointer = new MemorySaver();
  return graph.compile({ checkpointer });
}

/**
 * Process question with the agent
 */
export async function processQuestion(question: string, threadId?: string): Promise<string> {
  try {
    logger.debug('Processing question', { question: question.substring(0, 100), threadId });

    const agent = createLangGraphAgent();
    const configThreadId = threadId || `thread-${Date.now()}`;

    const initialState: AgentState = {
      messages: [new HumanMessage(question)],
      websiteContent: '',
    };

    const result = await agent.invoke(initialState, {
      configurable: {
        thread_id: configThreadId,
      },
    });

    // Extract final answer from messages
    const lastMessage = result.messages[result.messages.length - 1];
    const answer = lastMessage?.content?.toString() || 'No response generated';

    logger.info('Question processed successfully', { answerLength: answer.length, threadId: configThreadId });

    return answer;
  } catch (error) {
    logger.error('Process question error', error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

/**
 * Stream process question - yields chunks as they're generated
 */
export async function* processQuestionStream(question: string, threadId?: string): AsyncGenerator<string> {
  try {
    logger.debug('Processing question with direct streaming', { question: question.substring(0, 100), threadId });

    const model = createAgentModel();
    
    // First, determine if we need website content (similar to router node)
    let websiteContent = '';
    const questionLower = question.toLowerCase();
    const shouldFetch =
      questionLower.includes('website') ||
      questionLower.includes('fetch') ||
      questionLower.includes('check') ||
      questionLower.includes('read') ||
      /https?:\/\//.test(question);

    if (shouldFetch) {
      try {
        // Extract URL from question if present
        const urlMatch = question.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
          websiteContent = await fetchWebsiteContent(urlMatch[0]);
        }
      } catch (error) {
        logger.debug('Website fetch skipped', { reason: error instanceof Error ? error.message : 'Unknown' });
      }
    }

    // Build system prompt with or without website context
    const contextInfo = websiteContent
      ? `I have retrieved the following website content for you:\n\n${websiteContent}\n\nPlease use this information to answer the question.`
      : 'Use your general knowledge to answer the following question.';

    const systemPrompt = `You are a helpful AI assistant.

${contextInfo}

Answer clearly and concisely.`;

    // Create messages for streaming
    const messages: BaseMessage[] = [
      new SystemMessage(systemPrompt),
      new HumanMessage(question),
    ];

    // Stream the response directly using LangChain (bypasses LangGraph for streaming)
    const stream = await model.stream(messages);
    
    let fullResponse = '';
    for await (const chunk of stream) {
      const content = typeof chunk.content === 'string' ? chunk.content : '';
      if (content) {
        fullResponse += content;
        yield content;  // ✅ Yield chunks AS THEY ARRIVE, not after completion
        logger.debug('Stream chunk yielded', { size: content.length });
      }
    }

    // Store conversation in memory if threadId provided
    if (threadId) {
      logger.debug('Stream complete, saving to thread', { threadId, totalLength: fullResponse.length });
    }
  } catch (error) {
    logger.error('Process question stream error', error instanceof Error ? error : new Error(String(error)));
    yield `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

/**
 * Create a session-based agent manager
 */
export function createSessionAgent(sessionId: string) {
  const conversationHistory: BaseMessage[] = [];

  return {
    /**
     * Add a question and get answer with conversation history
     */
    async ask(question: string): Promise<string> {
      try {
        logger.debug('Session agent ask', { sessionId, question: question.substring(0, 100) });

        conversationHistory.push(new HumanMessage(question));

        const answer = await processQuestion(question, sessionId);

        conversationHistory.push(new AIMessage(answer));

        return answer;
      } catch (error) {
        logger.error('Session agent ask error', error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    },

    /**
     * Stream a question with conversation context
     */
    async *askStream(question: string): AsyncGenerator<string> {
      try {
        logger.debug('Session agent ask stream', { sessionId, question: question.substring(0, 100) });

        conversationHistory.push(new HumanMessage(question));

        let fullAnswer = '';
        for await (const chunk of processQuestionStream(question, sessionId)) {
          fullAnswer += chunk;
          yield chunk;
        }

        conversationHistory.push(new AIMessage(fullAnswer));
      } catch (error) {
        logger.error('Session agent ask stream error', error instanceof Error ? error : new Error(String(error)));
        yield `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    },

    /**
     * Get conversation history
     */
    getHistory(): BaseMessage[] {
      return conversationHistory;
    },

    /**
     * Clear history
     */
    clearHistory(): void {
      conversationHistory.length = 0;
      logger.debug('Session history cleared', { sessionId });
    },
  };
}

/**
 * Export types for use in handlers
 */
export type SessionAgent = ReturnType<typeof createSessionAgent>;

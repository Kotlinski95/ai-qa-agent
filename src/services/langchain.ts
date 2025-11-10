import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { config } from '@config/index';
import { logger } from '@utils/logger';
import { CONTENT_LIMITS } from '@constants/index';

/**
 * Create a standard ChatOpenAI model with project configuration
 * @param overrides - Optional overrides for specific use cases
 * @returns Configured ChatOpenAI instance
 */
export function createChatModel(
  overrides?: Partial<{
    maxTokens: number;
    temperature: number;
    streaming: boolean;
  }>
): ChatOpenAI {
  if (!config.ai.openai.apiKey) {
    throw new Error('OpenAI API key is required. Set OPENAI_API_KEY environment variable.');
  }
  const chatModel = new ChatOpenAI({
    apiKey: config.ai.openai.apiKey,
    model: config.ai.openai.model,
    temperature: overrides?.temperature ?? config.ai.openai.temperature,
    maxTokens: overrides?.maxTokens ?? config.ai.openai.maxTokens,
    timeout: config.ai.openai.timeout,
    streaming: overrides?.streaming ?? config.ai.enableStreaming,
  });
  logger.debug('ChatOpenAI model created', {
    model: config.ai.openai.model,
    temperature: overrides?.temperature ?? config.ai.openai.temperature,
    maxTokens: overrides?.maxTokens ?? config.ai.openai.maxTokens,
    streaming: overrides?.streaming ?? config.ai.enableStreaming,
    hasOverrides: !!overrides,
  });
  return chatModel;
}

function createLangChainComponents() {
  const outputParser = new StringOutputParser();
  const promptTemplate = ChatPromptTemplate.fromMessages([
    ['system', config.ai.systemPrompt],
    ['human', '{input}'],
  ]);
  logger.debug('LangChain components created');
  return { outputParser, promptTemplate };
}

export async function* generateAnswerStream(
  question: string,
  context?: string
): AsyncGenerator<string> {
  try {
    logger.debug('Generating streaming answer with LangChain', {
      questionLength: question.length,
      hasContext: !!context,
      model: config.ai.openai.model,
    });
    const model = createChatModel();
    const { promptTemplate } = createLangChainComponents();
    const chain = promptTemplate.pipe(model);
    const inputText = context ? `Context: ${context}\n\nQuestion: ${question}` : question;
    const input = { input: inputText };
    const stream = await chain.stream(input);
    let fullResponse = '';
    for await (const chunk of stream) {
      const content = typeof chunk.content === 'string' ? chunk.content : '';
      if (content) {
        fullResponse += content;
        yield content;
      }
    }
    logger.info('LangChain streaming response completed', {
      responseLength: fullResponse.length,
      questionPreview: question.substring(0, CONTENT_LIMITS.FIFTY_LIMIT),
    });
  } catch (error) {
    logger.error('LangChain streaming service error', error);
    yield 'I apologize, but I encountered an error while processing your question. Please try again.';
  }
}

export async function generateAnswer(question: string, context?: string): Promise<string> {
  try {
    logger.debug('Generating answer with LangChain', {
      questionLength: question.length,
      hasContext: !!context,
      model: config.ai.openai.model,
    });
    const chatModel = createChatModel();
    const { outputParser, promptTemplate } = createLangChainComponents();
    let input = question;
    if (context) {
      input = `Context: ${context}\n\nQuestion: ${question}`;
    }
    const chain = promptTemplate.pipe(chatModel).pipe(outputParser);
    const startTime = Date.now();
    const response = await chain.invoke({
      input: input,
    });
    const duration = Date.now() - startTime;
    logger.info('LangChain response generated', {
      duration: `${duration}ms`,
      responseLength: response.length,
      model: config.ai.openai.model,
    });
    return response.trim();
  } catch (error) {
    logger.error('LangChain service error', error);
    throw new Error(
      `Failed to generate AI response: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function generateAnswerWithHistory(
  question: string,
  context?: string,
  conversationHistory: Array<{ role: 'human' | 'ai'; content: string }> = []
): Promise<string> {
  try {
    logger.debug('Generating answer with conversation history', {
      questionLength: question.length,
      hasContext: !!context,
      historyLength: conversationHistory.length,
    });
    const chatModel = createChatModel();
    const messages: (SystemMessage | HumanMessage | AIMessage)[] = [
      new SystemMessage(config.ai.systemPrompt),
    ];
    conversationHistory.forEach(msg => {
      if (msg.role === 'human') {
        messages.push(new HumanMessage(msg.content));
      } else {
        messages.push(new AIMessage(msg.content));
      }
    });
    let currentInput = question;
    if (context) {
      currentInput = `Context: ${context}\n\nQuestion: ${question}`;
    }
    messages.push(new HumanMessage(currentInput));
    const startTime = Date.now();
    const response = await chatModel.invoke(messages);
    const duration = Date.now() - startTime;
    const answer = response.content.toString().trim();
    logger.info('LangChain response with history generated', {
      duration: `${duration}ms`,
      responseLength: answer.length,
      historyItems: conversationHistory.length,
    });
    return answer;
  } catch (error) {
    logger.error('LangChain service with history error', error);
    throw new Error(
      `Failed to generate AI response with history: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function testConnection(): Promise<boolean> {
  try {
    logger.debug('Testing OpenAI connection');
    const chatModel = createChatModel();
    const testResponse = await chatModel.invoke([
      new SystemMessage('You are a helpful assistant.'),
      new HumanMessage('Reply with just "OK" to confirm the connection.'),
    ]);
    const response = testResponse.content.toString().trim();
    const isConnected = response.toLowerCase().includes('ok');
    logger.info('OpenAI connection test result', {
      success: isConnected,
      response: response.substring(0, CONTENT_LIMITS.FIFTY_LIMIT),
    });
    return isConnected;
  } catch (error) {
    logger.error('OpenAI connection test failed', error);
    return false;
  }
}

export function isConfigured(): boolean {
  return !!config.ai.openai.apiKey && config.ai.openai.apiKey.length > 0;
}

export function getModelInfo(): {
  provider: string;
  model: string;
  temperature: number;
  maxTokens: number;
  configured: boolean;
} {
  return {
    provider: 'OpenAI (LangChain)',
    model: config.ai.openai.model,
    temperature: config.ai.openai.temperature,
    maxTokens: config.ai.openai.maxTokens,
    configured: isConfigured(),
  };
}

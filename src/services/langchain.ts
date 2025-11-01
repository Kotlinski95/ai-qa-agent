import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

/**
 * Create and configure ChatOpenAI model
 */
function createChatModel(): ChatOpenAI {
  if (!config.ai.openai.apiKey) {
    throw new Error('OpenAI API key is required. Set OPENAI_API_KEY environment variable.');
  }

  const chatModel = new ChatOpenAI({
    apiKey: config.ai.openai.apiKey,
    model: config.ai.openai.model,
    temperature: config.ai.openai.temperature,
    maxTokens: config.ai.openai.maxTokens,
    timeout: config.ai.openai.timeout,
    streaming: config.ai.enableStreaming,
  });

  logger.info('ChatOpenAI model created', {
    model: config.ai.openai.model,
    temperature: config.ai.openai.temperature,
    maxTokens: config.ai.openai.maxTokens,
    streaming: config.ai.enableStreaming,
  });

  return chatModel;
}

/**
 * Create LangChain components
 */
function createLangChainComponents() {
  const outputParser = new StringOutputParser();
  
  // Create a prompt template for Q&A
  const promptTemplate = ChatPromptTemplate.fromMessages([
    ['system', config.ai.systemPrompt],
    ['human', '{input}'],
  ]);

  logger.debug('LangChain components created');

  return { outputParser, promptTemplate };
}

/**
 * Generate answer using ChatOpenAI with LangChain (streaming)
 */
export async function* generateAnswerStream(question: string, context?: string): AsyncGenerator<string> {
  try {
    logger.debug('Generating streaming answer with LangChain', {
      questionLength: question.length,
      hasContext: !!context,
      model: config.ai.openai.model,
    });

    const model = createChatModel();
    const { promptTemplate } = createLangChainComponents();

    // Create the chain
    const chain = promptTemplate.pipe(model);

    // Prepare input - use the same format as the existing generateAnswer function
    const inputText = context 
      ? `Context: ${context}\n\nQuestion: ${question}`
      : question;
    
    const input = { input: inputText };

    // Stream the response
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
      questionPreview: question.substring(0, 50),
    });

  } catch (error) {
    logger.error('LangChain streaming service error', error);
    yield 'I apologize, but I encountered an error while processing your question. Please try again.';
  }
}

/**
 * Generate answer using ChatOpenAI with LangChain (non-streaming)
 */
export async function generateAnswer(question: string, context?: string): Promise<string> {
  try {
    logger.debug('Generating answer with LangChain', {
      questionLength: question.length,
      hasContext: !!context,
      model: config.ai.openai.model,
    });

    // Create components
    const chatModel = createChatModel();
    const { outputParser, promptTemplate } = createLangChainComponents();

    // Prepare input with context if provided
    let input = question;
    if (context) {
      input = `Context: ${context}\n\nQuestion: ${question}`;
    }

    // Create the chain
    const chain = promptTemplate.pipe(chatModel).pipe(outputParser);

    // Generate response
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
    throw new Error(`Failed to generate AI response: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate answer with conversation history (for future use)
 */
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

    // Create chat model
    const chatModel = createChatModel();

    // Build messages array
    const messages: (SystemMessage | HumanMessage | AIMessage)[] = [
      new SystemMessage(config.ai.systemPrompt),
    ];

    // Add conversation history
    conversationHistory.forEach(msg => {
      if (msg.role === 'human') {
        messages.push(new HumanMessage(msg.content));
      } else {
        messages.push(new AIMessage(msg.content)); // AI messages as AIMessage, not SystemMessage
      }
    });

    // Add current question with context
    let currentInput = question;
    if (context) {
      currentInput = `Context: ${context}\n\nQuestion: ${question}`;
    }
    messages.push(new HumanMessage(currentInput));

    // Generate response
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
    throw new Error(`Failed to generate AI response with history: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Test the connection to OpenAI
 */
export async function testConnection(): Promise<boolean> {
  try {
    logger.debug('Testing OpenAI connection');
    
    const chatModel = createChatModel();
    const testResponse = await chatModel.invoke([
      new SystemMessage('You are a helpful assistant.'),
      new HumanMessage('Reply with just "OK" to confirm the connection.')
    ]);

    const response = testResponse.content.toString().trim();
    const isConnected = response.toLowerCase().includes('ok');

    logger.info('OpenAI connection test result', {
      success: isConnected,
      response: response.substring(0, 50),
    });

    return isConnected;

  } catch (error) {
    logger.error('OpenAI connection test failed', error);
    return false;
  }
}

/**
 * Check if the service is properly configured
 */
export function isConfigured(): boolean {
  return !!config.ai.openai.apiKey && config.ai.openai.apiKey.length > 0;
}

/**
 * Get model information
 */
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

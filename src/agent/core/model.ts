import { ChatOpenAI } from '@langchain/openai';
import { createChatModel } from '@services/langchain';

/**
 * @returns ChatOpenAI model instance
 */
export function createAgentModel(): ChatOpenAI {
  return createChatModel({
    streaming: false,
  });
}

/**
 * @returns ChatOpenAI model instance with classification-specific settings
 */
export function createClassificationModel(): ChatOpenAI {
  return createChatModel({
    maxTokens: 50,
    temperature: 0,
    streaming: false,
  });
}

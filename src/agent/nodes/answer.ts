import { HumanMessage, SystemMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { logger } from '@utils/logger';
import { CONTENT_LIMITS } from '@constants/index';
import { getCompanyInfo } from '@agent/core/company';
import { isBusinessRelatedQuestion } from '@agent/core/classification';
import { createAgentModel } from '@agent/core/model';
import { hasRelevantWebsiteContent } from '@utils/content-validation';
import {
  createLanguageDetectionPrompt,
  createRedirectPrompt,
  createBusinessAnswerWithWebsitePrompt,
  createBusinessAnswerWithoutWebsitePrompt,
} from '@agent/prompts/index';
import type { AgentState } from '@/types/agent';

/**
 * Detect the language of a question text
 * @param questionText - The user's question
 * @returns Promise resolving to detected language code
 */
async function detectQuestionLanguage(questionText: string): Promise<string> {
  try {
    const model = createAgentModel();
    const languagePrompt = createLanguageDetectionPrompt(questionText);

    const response = await model.invoke([new HumanMessage(languagePrompt)]);
    const detectedLanguage = response.content.toString().trim().toLowerCase();
    logger.info('Language detection analysis', {
      questionText,
      detectedLanguage,
      rawResponse: response.content.toString(),
    });
    return detectedLanguage;
  } catch (error) {
    logger.warn('Language detection failed, defaulting to English', {
      error: error instanceof Error ? error.message : String(error),
    });
    return 'english';
  }
}

/**
 * Generate a dynamic redirect message using the AI model
 * @param questionText - The user's question
 * @param companyInfo - Company information
 * @returns Promise resolving to redirect message
 */
async function generateDynamicRedirect(
  questionText: string,
  companyInfo: { domain: string; companyName: string }
): Promise<string> {
  try {
    // First detect the language explicitly
    const detectedLanguage = await detectQuestionLanguage(questionText);
    logger.info('Generating redirect for detected language', { detectedLanguage, questionText });

    const redirectSystem = createRedirectPrompt(
      detectedLanguage,
      questionText,
      companyInfo.companyName
    );

    const redirectMessages: BaseMessage[] = [
      new SystemMessage(redirectSystem),
      new HumanMessage(questionText),
    ];

    const redirectModel = createAgentModel();
    const redirectResp = await redirectModel.invoke(redirectMessages);
    const redirectText =
      redirectResp.content?.toString() ||
      `I can help with questions about ${companyInfo.companyName}. Please ask about our services.`;

    logger.info('Generated redirect response', {
      detectedLanguage,
      questionText,
      redirectText,
      redirectPreview: redirectText.substring(0, 100),
    });

    return redirectText;
  } catch (error) {
    logger.error('Failed to generate dynamic redirect', {
      error: error instanceof Error ? error.message : String(error),
    });
    return `I can help with questions about ${companyInfo.companyName}. Please ask about our services.`;
  }
}

/**
 * Create system prompt for answering with website content
 * @param companyInfo - Company information
 * @param websiteContent - Content from website search
 * @returns Formatted system prompt
 */
function createSystemPromptWithWebsiteContent(
  companyInfo: { domain: string; companyName: string },
  websiteContent: string
): string {
  return createBusinessAnswerWithWebsitePrompt(
    companyInfo.companyName,
    companyInfo.domain,
    websiteContent
  );
}

/**
 * Create system prompt for answering without website content
 * @param companyInfo - Company information
 * @returns Formatted system prompt
 */
function createSystemPromptWithoutWebsiteContent(companyInfo: {
  domain: string;
  companyName: string;
}): string {
  return createBusinessAnswerWithoutWebsitePrompt(companyInfo.companyName, companyInfo.domain);
}

/**
 * Answer node for the LangGraph agent
 * Generates responses based on website content and company information
 * New logic: Use website content if available, only classify as business/non-business if no content found
 * @param state - The current agent state
 * @returns Promise resolving to partial agent state update
 */
export async function answerNode(state: AgentState): Promise<Partial<AgentState>> {
  try {
    const lastMessage = state.messages[state.messages.length - 1];
    const questionText = lastMessage?.content?.toString() || '';
    logger.debug('Answer node: generating response', {
      questionLength: questionText.length,
      hasWebsiteContent: state.websiteContent.length > 0,
    });

    /* Extract company information dynamically from sitemap */
    const companyInfo = getCompanyInfo();

    /* NEW LOGIC: Check if we have relevant website content first */
    const hasRelevantContent = hasRelevantWebsiteContent(state.websiteContent);

    if (hasRelevantContent) {
      /* If we have relevant website content, use it regardless of business classification */
      logger.info('Relevant website content found, proceeding with content-based answer', {
        questionPreview: questionText.substring(0, CONTENT_LIMITS.PREVIEW_LENGTH),
        contentLength: state.websiteContent.length,
        companyName: companyInfo.companyName,
      });

      const model = createAgentModel();
      const systemPrompt = createSystemPromptWithWebsiteContent(companyInfo, state.websiteContent);

      const messages: BaseMessage[] = [
        new SystemMessage(systemPrompt),
        ...state.messages.slice(0, -1),
        new HumanMessage(questionText),
      ];

      const response = await model.invoke(messages);
      const answer = response.content.toString();
      logger.info('Answer generated using website content', {
        answerLength: answer.length,
        contentSource: 'website_search_results',
        companyName: companyInfo.companyName,
      });

      return {
        messages: [new AIMessage(answer)],
      };
    }

    /* No relevant content found, now check business classification */
    logger.info('No relevant website content found, checking business classification', {
      questionPreview: questionText.substring(0, CONTENT_LIMITS.PREVIEW_LENGTH),
      websiteContentPreview: state.websiteContent.substring(0, 200),
    });

    const isBusinessQuestion = await isBusinessRelatedQuestion(questionText, companyInfo);
    if (!isBusinessQuestion) {
      logger.info('Non-business question detected with no website content; generating redirect', {
        questionPreview: questionText.substring(0, CONTENT_LIMITS.PREVIEW_LENGTH),
        companyName: companyInfo.companyName,
        fullQuestion: questionText,
      });

      const redirectText = await generateDynamicRedirect(questionText, companyInfo);
      logger.info('Generated redirect response for non-business question', {
        redirectPreview: redirectText.substring(0, 100),
        questionLanguageContext: questionText,
      });
      return {
        messages: [new AIMessage(redirectText)],
      };
    }

    /* Business question but no website content - provide generic business response */
    logger.info('Business question detected but no website content available', {
      questionPreview: questionText.substring(0, CONTENT_LIMITS.PREVIEW_LENGTH),
      companyName: companyInfo.companyName,
    });

    const model = createAgentModel();
    const systemPrompt = createSystemPromptWithoutWebsiteContent(companyInfo);

    const messages: BaseMessage[] = [
      new SystemMessage(systemPrompt),
      ...state.messages.slice(0, -1),
      new HumanMessage(questionText),
    ];

    const response = await model.invoke(messages);
    const answer = response.content.toString();
    logger.info('Answer generated without website content for business question', {
      answerLength: answer.length,
      contentSource: 'business_fallback',
      companyName: companyInfo.companyName,
    });

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

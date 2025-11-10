import { HumanMessage, SystemMessage, BaseMessage } from '@langchain/core/messages';
import { logger } from '@utils/logger';
import { CONTENT_LIMITS } from '@constants/index';
import { getCompanyInfo } from '@agent/core/company';
import { isBusinessRelatedQuestion } from '@agent/core/classification';
import { createAgentModel } from '@agent/core/model';
import { searchAndValidateWebsiteContent } from '@agent/core/website-search-handler';
import {
  createLanguageDetectionPrompt,
  createRedirectPrompt,
  createStreamingBusinessWithWebsitePrompt,
  createStreamingBusinessWithoutWebsitePrompt,
} from '@agent/prompts/index';

/**
 * Detect the language of a question text for streaming responses
 * @param questionText - The user's question
 * @returns Promise resolving to detected language code
 */
async function detectQuestionLanguageStream(questionText: string): Promise<string> {
  try {
    const model = createAgentModel();
    const languagePrompt = createLanguageDetectionPrompt(questionText);

    const response = await model.invoke([new HumanMessage(languagePrompt)]);
    const detectedLanguage = response.content.toString().trim().toLowerCase();
    logger.info('Streaming language detection analysis', {
      questionText,
      detectedLanguage,
      rawResponse: response.content.toString(),
    });
    return detectedLanguage;
  } catch (error) {
    logger.warn('Streaming language detection failed, defaulting to English', {
      error: error instanceof Error ? error.message : String(error),
    });
    return 'english';
  }
}

/**
 * Generate a dynamic redirect message using the AI model
 * @param question - The user's question
 * @param companyInfo - Company information
 * @returns Promise resolving to redirect message
 */
async function generateStreamingRedirect(
  question: string,
  companyInfo: { domain: string; companyName: string }
): Promise<string> {
  try {
    // First detect the language explicitly
    const detectedLanguage = await detectQuestionLanguageStream(question);
    logger.info('Generating streaming redirect for detected language', {
      detectedLanguage,
      question,
    });

    const redirectSystem = createRedirectPrompt(
      detectedLanguage,
      question,
      companyInfo.companyName
    );

    const redirectModel = createAgentModel();
    const redirectMessages: BaseMessage[] = [
      new SystemMessage(redirectSystem),
      new HumanMessage(question),
    ];

    const redirectResp = await redirectModel.invoke(redirectMessages);
    const redirectText =
      redirectResp.content?.toString() ||
      `I can help with questions about ${companyInfo.companyName}. Please ask about our services.`;

    logger.info('Generated streaming redirect response', {
      detectedLanguage,
      question,
      redirectText,
      redirectPreview: redirectText.substring(0, 100),
    });

    return redirectText;
  } catch (error) {
    logger.error('Failed to generate streaming redirect', {
      error: error instanceof Error ? error.message : String(error),
    });
    return `I can help with questions about ${companyInfo.companyName}. Please ask about our services.`;
  }
}

/**
 * Stream response with website content search
 * NEW LOGIC: Use website content if available, only classify if no content found
 * @param question - User's question
 * @param configThreadId - Thread identifier
 * @yields Streaming response chunks
 */
export async function* streamWithWebsiteContent(
  question: string,
  configThreadId: string
): AsyncGenerator<string> {
  logger.debug('Fetching website content before streaming response');

  /* Extract company information dynamically */
  const companyInfo = getCompanyInfo();

  /* First, search for website content using unified approach */
  const { hasRelevant: hasRelevantContent, content: websiteContent } =
    await searchAndValidateWebsiteContent(question);

  if (hasRelevantContent) {
    /* If we have relevant website content, use it regardless of business classification */
    logger.info(
      'Relevant website content found for streaming, proceeding with content-based response',
      {
        questionPreview: question.substring(0, CONTENT_LIMITS.PREVIEW_LENGTH),
        contentLength: websiteContent.length,
        companyName: companyInfo.companyName,
      }
    );

    const systemPrompt = createStreamingBusinessWithWebsitePrompt(
      companyInfo.companyName,
      companyInfo.domain,
      websiteContent
    );

    const messages: BaseMessage[] = [new SystemMessage(systemPrompt), new HumanMessage(question)];
    logger.debug('Streaming response with website context');
    const model = createAgentModel();
    const stream = await model.stream(messages);

    for await (const chunk of stream) {
      const content = chunk.content;
      if (typeof content === 'string' && content) {
        yield content;
        logger.debug('Stream chunk yielded', { size: content.length });
      }
    }

    logger.info('Question processed with streaming (using website content)', {
      threadId: configThreadId,
      companyName: companyInfo.companyName,
      contentSource: 'website_search_results',
    });
    return;
  }

  /* No relevant content found, check business classification */
  logger.info('No relevant website content found for streaming, checking business classification', {
    questionPreview: question.substring(0, CONTENT_LIMITS.PREVIEW_LENGTH),
    websiteContentPreview: websiteContent.substring(0, 200),
  });

  const isBusinessQuestion = await isBusinessRelatedQuestion(question, companyInfo);
  if (!isBusinessQuestion) {
    logger.info('Non-business question detected in streaming with no content, providing redirect');

    const redirectText = await generateStreamingRedirect(question, companyInfo);
    yield redirectText;
    return;
  }

  /* Business question but no website content - provide generic business response */
  logger.info('Business question detected for streaming but no website content available');

  const systemPrompt = createStreamingBusinessWithoutWebsitePrompt(
    companyInfo.companyName,
    companyInfo.domain
  );

  const messages: BaseMessage[] = [new SystemMessage(systemPrompt), new HumanMessage(question)];
  const model = createAgentModel();
  const stream = await model.stream(messages);

  for await (const chunk of stream) {
    const content = chunk.content;
    if (typeof content === 'string' && content) {
      yield content;
      logger.debug('Stream chunk yielded', { size: content.length });
    }
  }

  logger.info('Question processed with streaming (business fallback)', {
    threadId: configThreadId,
    companyName: companyInfo.companyName,
    contentSource: 'business_fallback',
  });
}

/**
 * Stream response without website content search (fallback method)
 * NEW LOGIC: Still check business classification since no content search attempted
 * @param question - User's question
 * @param configThreadId - Thread identifier
 * @yields Streaming response chunks
 */
export async function* streamWithoutWebsiteContent(
  question: string,
  configThreadId: string
): AsyncGenerator<string> {
  logger.debug('Streaming response without website search');

  /* Extract company information dynamically */
  const companyInfo = getCompanyInfo();

  /* Check if question is business-related for this specific company */
  const isBusinessQuestion = await isBusinessRelatedQuestion(question, companyInfo);
  if (!isBusinessQuestion) {
    logger.info('Non-business question detected in streaming without search, providing redirect');

    const redirectText = await generateStreamingRedirect(question, companyInfo);
    yield redirectText;
    return;
  }

  /* Business question without website search - provide generic business response */
  logger.info('Business question detected for streaming without website search');

  const systemPrompt = createStreamingBusinessWithoutWebsitePrompt(
    companyInfo.companyName,
    companyInfo.domain
  );

  const messages: BaseMessage[] = [new SystemMessage(systemPrompt), new HumanMessage(question)];
  const model = createAgentModel();
  const stream = await model.stream(messages);

  for await (const chunk of stream) {
    const content = chunk.content;
    if (typeof content === 'string' && content) {
      yield content;
      logger.debug('Stream chunk yielded', { size: content.length });
    }
  }

  logger.info('Question processed with streaming (no website search)', {
    threadId: configThreadId,
    companyName: companyInfo.companyName,
    contentSource: 'business_fallback_no_search',
  });
}

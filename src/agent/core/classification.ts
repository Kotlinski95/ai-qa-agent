import { HumanMessage } from '@langchain/core/messages';
import { logger } from '@utils/logger';
import { createClassificationModel } from './model';
import { createBusinessClassificationPrompt } from '@agent/prompts/business-classification';
import type { CompanyInfo } from '@/types/company';

/**
 * @param questionText - The user's question to classify
 * @param companyInfo - Information about the company
 * @returns Promise resolving to true if business-related, false otherwise
 */
export async function isBusinessRelatedQuestion(
  questionText: string,
  companyInfo: CompanyInfo
): Promise<boolean> {
  try {
    const model = createClassificationModel();
    const checkPrompt = createBusinessClassificationPrompt(
      companyInfo.companyName,
      companyInfo.domain,
      questionText
    );

    const response = await model.invoke([new HumanMessage(checkPrompt)]);
    const result = response.content.toString().trim().toLowerCase();
    return result.includes('yes');
  } catch (error) {
    logger.warn('Question classification failed, defaulting to business-related', {
      error: error instanceof Error ? error.message : 'Unknown error',
      questionText: questionText.substring(0, 100),
    });
    return true;
  }
}

import { logger } from '@utils/logger';
import { CONTENT_LIMITS } from '@constants/index';
import { hasRelevantWebsiteContent } from '@utils/content-validation';
import { searchWebsiteSitemap } from '../tools/website-search';

/**
 * Unified website content search and validation
 * This ensures both streaming and chat agents use identical logic
 * @param question - The user's question
 * @returns Promise resolving to { hasRelevant: boolean, content: string }
 */
export async function searchAndValidateWebsiteContent(question: string): Promise<{
  hasRelevant: boolean;
  content: string;
}> {
  try {
    logger.debug('Unified website search: starting search', {
      questionPreview: question.substring(0, CONTENT_LIMITS.PREVIEW_LENGTH),
    });

    // Perform the search
    const websiteContent = await searchWebsiteSitemap(question);

    // Validate the results using the same logic
    const hasRelevant = hasRelevantWebsiteContent(websiteContent);

    logger.debug('Unified website search: completed', {
      hasRelevant,
      contentLength: websiteContent.length,
      questionPreview: question.substring(0, 50),
    });

    return {
      hasRelevant,
      content: websiteContent,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Unified website search error', {
      error: errorMsg,
      questionPreview: question.substring(0, 50),
    });

    return {
      hasRelevant: false,
      content: `Error searching website: ${errorMsg}`,
    };
  }
}

import { logger } from '@utils/logger';
import { CONTENT_LIMITS } from '@constants/index';
import { searchWebsiteSitemap } from '../tools/website-search';
import type { AgentState } from '@/types/agent';

/**
 * Fetch website node for the LangGraph agent
 * Searches the website sitemap for relevant content
 * @param state - The current agent state
 * @returns Promise resolving to partial agent state update with website content
 */
export async function fetchWebsiteNode(state: AgentState): Promise<Partial<AgentState>> {
  try {
    const lastMessage = state.messages[state.messages.length - 1];
    const questionText = lastMessage?.content?.toString() || '';
    logger.debug('Website search node: searching sitemap', {
      questionText: questionText.substring(0, CONTENT_LIMITS.PREVIEW_LENGTH),
    });

    const searchResults = await searchWebsiteSitemap(questionText);
    logger.debug('Website search completed', { resultLength: searchResults.length });

    return {
      websiteContent: searchResults,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Website search node error', error instanceof Error ? error : new Error(errorMsg));
    return {
      websiteContent: `Error searching website: ${errorMsg}`,
    };
  }
}

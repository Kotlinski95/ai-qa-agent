import { config } from '@config/index';
import { logger } from '@utils/logger';
import { CONTENT_LIMITS } from '@constants/index';
import type { AgentState } from '@/types/agent';

/**
 * Router node for the LangGraph agent
 * Determines the flow based on configuration
 * @param state - The current agent state
 * @returns Promise resolving to partial agent state update (empty in this case)
 */
export async function routerNode(state: AgentState): Promise<Partial<AgentState>> {
  try {
    const lastMessage = state.messages[state.messages.length - 1];
    const questionText = lastMessage?.content?.toString() || '';
    logger.debug('Router node processing', {
      questionText: questionText.substring(0, CONTENT_LIMITS.PREVIEW_LENGTH),
    });

    const shouldSearchWebsite = config.ai.agent.websiteSearchEnabled && config.ai.agent.sitemapUrl;
    if (shouldSearchWebsite) {
      logger.debug('Router decision: search website sitemap');
    } else {
      logger.debug('Router decision: answer directly (website search disabled)');
    }

    return {};
  } catch (error) {
    logger.error('Router node error', error instanceof Error ? error : new Error(String(error)));
    return {};
  }
}

/**
 * Conditional edge function to determine whether to fetch website content
 * @param _state - The agent state (unused in current implementation)
 * @returns Next node name ('fetch_website' or 'answer')
 */
export function shouldFetchWebsite(_state: AgentState): string {
  try {
    const shouldSearch = config.ai.agent.websiteSearchEnabled && config.ai.agent.sitemapUrl;
    return shouldSearch ? 'fetch_website' : 'answer';
  } catch (error) {
    logger.error(
      'Conditional edge error',
      error instanceof Error ? error : new Error(String(error))
    );
    return 'answer';
  }
}

/**
 * Backward compatibility layer for the refactored LangGraph agent
 *
 * This file maintains the same public API while delegating to the new modular structure.
 * The agent has been split into focused modules for better maintainability:
 *
 * - /agent/nodes/ - Individual LangGraph nodes (router, fetch-website, answer)
 * - /agent/tools/ - Website search and other tools
 * - /agent/services/ - Business logic (classification, company info, model creation)
 * - /agent/streaming/ - Streaming response handlers
 * - /agent/types/ - Shared type definitions
 */

// Re-export the main functions to maintain backward compatibility
export { processQuestion, processQuestionStream, createSessionAgent } from '../agent/index';

// Export additional functions that were previously available
export {
  searchWebsiteSitemap,
  isBusinessRelatedQuestion,
  extractCompanyInfoFromSitemap,
} from '../agent/exports';

// Content extraction utilities

const DEFAULT_MAX_LENGTH = 1500;
const FALLBACK_LENGTH = 800;
const MAX_KEYWORDS = 5;
const CONTEXT_PADDING = 200;

/**
 * Fast content extraction optimized for performance
 * @param content - Full page content
 * @param queryKeywords - Keywords to search for
 * @param maxLength - Maximum length of extracted content
 * @returns Extracted content with relevant sections
 */
export function extractRelevantContent(
  content: string,
  queryKeywords: string[],
  maxLength: number = DEFAULT_MAX_LENGTH
): string {
  if (!content || queryKeywords.length === 0) {
    return content.substring(0, Math.min(maxLength, FALLBACK_LENGTH));
  }

  const cleanKeywords = queryKeywords
    .map(keyword => keyword.toLowerCase())
    .filter(keyword => keyword.length > 2)
    .slice(0, MAX_KEYWORDS);

  if (cleanKeywords.length === 0) {
    return content.substring(0, Math.min(maxLength, FALLBACK_LENGTH));
  }

  // ULTRA-FAST STRATEGY: Find first keyword and extract around it
  const contentLower = content.toLowerCase();

  for (const keyword of cleanKeywords) {
    const keywordIndex = contentLower.indexOf(keyword);
    if (keywordIndex !== -1) {
      // Extract content around the first found keyword
      const start = Math.max(0, keywordIndex - CONTEXT_PADDING);
      const end = Math.min(content.length, start + maxLength);

      let extractedContent = content.substring(start, end);

      // Add indicators if content is truncated
      if (start > 0) extractedContent = `...${extractedContent}`;
      if (end < content.length) extractedContent = `${extractedContent}...`;

      return extractedContent;
    }
  }

  // No keywords found, return beginning of content
  return content.substring(0, Math.min(maxLength, FALLBACK_LENGTH));
}

/**
 * Lightweight content analysis for debugging (performance optimized)
 */
export function analyzeContentStructure(
  content: string,
  keywords: string[]
): {
  totalLength: number;
  hasKeywords: boolean;
} {
  const contentLower = content.toLowerCase();
  const hasKeywords = keywords.some(keyword => contentLower.includes(keyword.toLowerCase()));

  return {
    totalLength: content.length,
    hasKeywords,
  };
}

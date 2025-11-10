import { logger } from '@utils/logger';
import { CONTENT_LIMITS } from '@constants/index';

// Content validation constants
const MIN_CONTENT_LENGTH = 100;

/**
 * Extract Pinecone relevance score from search results
 * @param websiteContent - Content from website search
 * @returns Relevance score (0-1) or null if not found
 */
function extractRelevanceScore(websiteContent: string): number | null {
  // Look for ALL relevance score patterns and find the highest one
  const scoreMatches = websiteContent.match(/🎯 Relevance Score: ([\d.]+)/g);
  if (scoreMatches && scoreMatches.length > 0) {
    const scores = scoreMatches
      .map(match => {
        const scoreValue = match.match(/[\d.]+/);
        return scoreValue ? parseFloat(scoreValue[0]) : 0;
      })
      .filter(score => !isNaN(score));

    if (scores.length > 0) {
      const maxScore = Math.max(...scores);
      return maxScore;
    }
  }

  // Fallback: Look for single relevance score pattern
  const singleScoreMatch = websiteContent.match(/🎯 Relevance Score: ([\d.]+)/);
  if (singleScoreMatch && singleScoreMatch[1]) {
    return parseFloat(singleScoreMatch[1]);
  }

  // Look for alternative pattern: "topScore: 0.8234" (from logs)
  const logScoreMatch = websiteContent.match(/topScore[:\s]+([\d.]+)/i);
  if (logScoreMatch && logScoreMatch[1]) {
    return parseFloat(logScoreMatch[1]);
  }

  return null;
}

/**
 * Check if website content contains meaningful results using intelligent score-based detection
 * @param websiteContent - Content from website search
 * @returns True if content has meaningful results, false otherwise
 */
// eslint-disable-next-line max-lines-per-function, complexity
export function hasRelevantWebsiteContent(websiteContent: string): boolean {
  if (!websiteContent || websiteContent.trim().length === 0) {
    return false;
  }

  const contentLower = websiteContent.toLowerCase();
  const trimmedContent = websiteContent.trim();

  // Check for explicit "no results" or error patterns
  const negativePatterns = [
    'no results found',
    'no pages found',
    'no content available',
    'page not found',
    'error occurred',
  ];

  const hasNegativePattern = negativePatterns.some(pattern => contentLower.includes(pattern));
  if (hasNegativePattern) {
    logger.debug('🚫 Content validation: negative pattern detected');
    return false;
  }

  // PINECONE SCORE-BASED DETECTION: Extract and validate relevance score
  const relevanceScore = extractRelevanceScore(websiteContent);
  if (relevanceScore !== null) {
    // Pinecone scores range from 0-1, where higher means more relevant
    // We use a configurable threshold to determine if content is relevant enough
    const RELEVANCE_THRESHOLD = CONTENT_LIMITS.PINECONE_RELEVANCE_THRESHOLD;

    const isRelevant = relevanceScore >= RELEVANCE_THRESHOLD;

    if (!isRelevant) {
      logger.debug('🎯 Content validation: score below threshold', {
        score: relevanceScore.toFixed(3),
        threshold: RELEVANCE_THRESHOLD.toFixed(3),
      });
    }

    return isRelevant;
  }

  // FALLBACK METHOD: Format-based detection for non-Pinecone results
  const hasSearchResultFormat =
    (contentLower.includes('found ') &&
      (contentLower.includes('pages') || contentLower.includes('page'))) ||
    contentLower.includes('[result ');

  if (hasSearchResultFormat) {
    logger.debug('Content validation: format-based detection (fallback)', {
      contentPreview: trimmedContent.substring(0, MIN_CONTENT_LENGTH),
    });
    return true;
  }

  // LEGACY FALLBACK: Basic content detection for edge cases
  const hasSubstantialText = trimmedContent.length > MIN_CONTENT_LENGTH;
  // Require more substantial text for content detection
  const hasAlphabeticContent = /[a-zA-Z]{20,}/.test(trimmedContent);
  const looksLikeError =
    contentLower.includes('error') ||
    contentLower.includes('failed') ||
    contentLower.includes('cannot') ||
    contentLower.includes('unable to') ||
    contentLower.startsWith('no ');

  const isLegacyRelevant = hasSubstantialText && hasAlphabeticContent && !looksLikeError;

  if (isLegacyRelevant) {
    logger.debug('Content validation: legacy fallback detection', {
      contentLength: trimmedContent.length,
      contentPreview: trimmedContent.substring(0, MIN_CONTENT_LENGTH),
    });
    return true;
  }

  logger.debug('Content validation: no relevant content detected', {
    contentLength: trimmedContent.length,
    hasScore: relevanceScore !== null,
    scoreValue: relevanceScore,
    contentPreview: trimmedContent.substring(0, MIN_CONTENT_LENGTH),
  });

  return false;
}

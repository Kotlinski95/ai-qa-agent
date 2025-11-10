import { DynamicTool } from '@langchain/core/tools';
import { config } from '@config/index';
import { logger } from '@utils/logger';
import { fetchSitemapUrls } from '@utils/sitemap-fetcher';
import { fetchWebsiteContent } from '@utils/website-content-extractor';
import { extractRelevantContent } from '@utils/content-extractor';
import * as pineconeService from '@services/pinecone-service';
import { CONTENT_LIMITS } from '@constants/index';
import type { PageContent } from '@/types/company';

async function fetchPageWithFallback(url: string): Promise<PageContent | null> {
  try {
    const content = await fetchWebsiteContent(url);
    const title = url.split('/').filter(Boolean).pop()?.replace(/-/g, ' ') || 'Page';
    return { url, title, content };
  } catch {
    logger.debug('❌ Failed to fetch page in fallback', { url });
    return null;
  }
}

async function fetchPageForDirectSearch(url: string): Promise<{ url: string; content: string }> {
  try {
    const content = await fetchWebsiteContent(url);
    return { url, content };
  } catch {
    logger.debug('Failed to fetch page for direct search', { url });
    return { url, content: '' };
  }
}

async function trySearchAfterFallback(query: string): Promise<string | null> {
  const fallbackResults = await pineconeService.searchSimilar(query, 10);
  if (fallbackResults.length > 0) {
    const formattedResults = fallbackResults
      .slice(0, 10)
      .map((page, index) => {
        const queryKeywords = query
          .toLowerCase()
          .split(' ')
          .filter(word => word.length > 2);

        const extractedContent = extractRelevantContent(page.content, queryKeywords, 1500);

        return `\\n[Result ${index + 1}] 📄 From: ${
          page.url
        }\\n🎯 Relevance Score: ${page.score.toFixed(3)}\\n📝 Content:\\n${extractedContent}\\n`;
      })
      .join('\\n');

    return `✅ Found ${Math.min(fallbackResults.length, 10)} relevant pages (from fallback):\\n${formattedResults}`;
  }
  return null;
}

async function processFallbackContentAfterPineconeCheck(
  pageUrls: string[],
  query: string
): Promise<string | null> {
  logger.warn('Processing fallback content - Pinecone search returned no results');

  const limitedUrls = pageUrls.slice(0, CONTENT_LIMITS.MAX_FALLBACK_PAGES);
  const fetchPromises = limitedUrls.map(fetchPageWithFallback);
  const fallbackPages = (await Promise.all(fetchPromises)).filter(
    (page): page is PageContent => page !== null
  );

  if (fallbackPages.length === 0) {
    return 'No content could be retrieved from website pages during fallback.';
  }

  try {
    await pineconeService.initialize();
    const pagesForStorage = fallbackPages.map(page => ({
      url: page.url,
      title: page.title,
      content: page.content,
    }));

    await pineconeService.storePagesContent(pagesForStorage);

    const fallbackSearchResult = await trySearchAfterFallback(query);
    if (fallbackSearchResult) {
      return fallbackSearchResult;
    }
  } catch (error) {
    logger.error('Failed to process fallback content', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return null;
}

/**
 * @param query - The search query
 * @returns Promise resolving to formatted search results
 */
export async function searchWebsiteSitemap(query: string): Promise<string> {
  try {
    if (!config.ai.agent.sitemapUrl) {
      return 'Website sitemap URL not configured.';
    }
    if (!config.ai.agent.websiteSearchEnabled) {
      return 'Website search is disabled.';
    }

    logger.debug('Searching website sitemap', { query, sitemapUrl: config.ai.agent.sitemapUrl });

    const usePinecone = !!config.ai.pinecone.apiKey;
    if (usePinecone) {
      try {
        await pineconeService.initialize();

        logger.debug('⚡ Attempting Pinecone search (should be pre-populated by scheduler)');
        const results = await pineconeService.searchSimilar(query, 10);

        if (results.length > 0) {
          const formattedResults = results
            .map((page, index) => {
              const queryKeywords = query
                .toLowerCase()
                .split(' ')
                .filter(word => word.length > 2);

              const extractedContent = extractRelevantContent(page.content, queryKeywords, 1500);

              return `\\n[Result ${index + 1}] 📄 From: ${
                page.url
              }\\n🎯 Relevance Score: ${page.score.toFixed(3)}\\n📝 Content:\\n${extractedContent}\\n`;
            })
            .join('\\n');

          return `✅ Found ${results.length} relevant pages:\\n${formattedResults}`;
        }

        logger.warn('⚠️ No results from Pinecone cache - checking if content needs refresh');

        const pageUrls = await fetchSitemapUrls(config.ai.agent.sitemapUrl);
        if (pageUrls.length === 0) {
          return 'No pages found in sitemap.';
        }

        const fallbackResult = await processFallbackContentAfterPineconeCheck(pageUrls, query);
        if (fallbackResult) {
          return fallbackResult;
        }

        return `No relevant content found on the website for query: "${query}". Content may need refresh - check scheduled job.`;
      } catch (error) {
        logger.error('❌ Pinecone search failed, falling back to basic search', {
          error: String(error),
        });
      }
    }

    logger.warn('⚠️ USING DIRECT KEYWORD SEARCH - Pinecone not available', {
      source: 'WEBSITE_DIRECT_KEYWORD_SEARCH',
    });

    const pageUrls = await fetchSitemapUrls(config.ai.agent.sitemapUrl);
    const limitedUrls = pageUrls.slice(0, CONTENT_LIMITS.MAX_DIRECT_SEARCH_PAGES);

    const pageContents: Array<{ url: string; content: string }> = [];

    for (let i = 0; i < limitedUrls.length; i += CONTENT_LIMITS.BATCH_SIZE) {
      const batch = limitedUrls.slice(i, i + CONTENT_LIMITS.BATCH_SIZE);
      const batchResults = await Promise.all(batch.map(fetchPageForDirectSearch));
      pageContents.push(...batchResults.filter(page => page.content.length > 0));
    }

    if (pageContents.length === 0) {
      return 'No content could be retrieved from website pages.';
    }

    const queryKeywords = query
      .toLowerCase()
      .split(/\\s+/)
      .filter(w => w.length > CONTENT_LIMITS.MIN_WORD_LENGTH);

    const peopleRelatedTerms = [
      'founder',
      'founders',
      'team',
      'employee',
      'employees',
      'staff',
      'member',
      'members',
      'owner',
      'owners',
      'ceo',
      'cto',
      'manager',
      'developer',
      'designer',
      'director',
      'lead',
      'senior',
      'junior',
      'author',
      'writers',
      'specialist',
      'expert',
      'consultant',
      'experience',
      'background',
      'bio',
      'biography',
      'profile',
      'about',
      'leadership',
      'qualifications',
      'skills',
      'expertise',
      'role',
      'responsibility',
      'position',
    ];

    const scoredPages = pageContents.map(page => {
      const contentLower = page.content.toLowerCase();

      const basicMatchCount = queryKeywords.reduce((count, keyword) => {
        return count + (contentLower.includes(keyword) ? 1 : 0);
      }, 0);

      let peopleBonus = 0;
      const isPeopleQuery = queryKeywords.some(keyword => peopleRelatedTerms.includes(keyword));

      if (isPeopleQuery) {
        peopleBonus = peopleRelatedTerms.reduce((bonus, term) => {
          return bonus + (contentLower.includes(term) ? 0.5 : 0);
        }, 0);
      }

      const totalScore = basicMatchCount + peopleBonus;
      return { ...page, score: totalScore };
    });

    const topPages = scoredPages
      .filter(page => page.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, CONTENT_LIMITS.SEARCH_RESULTS_LIMIT);

    if (topPages.length === 0) {
      return `No relevant content found on the website for query: "${query}"`;
    }

    const results = topPages
      .slice(0, 10)
      .map((page, index) => {
        const queryKeywords = query
          .toLowerCase()
          .split(' ')
          .filter(word => word.length > 2);

        const extractedContent = extractRelevantContent(page.content, queryKeywords, 1500);

        return `\\n[Result ${index + 1}] From: ${page.url}\\nRelevance Score: ${
          page.score
        }\\nContent:\\n${extractedContent}\\n`;
      })
      .join('\\n---\\n');

    return `Found ${topPages.length} relevant page(s) on the website (direct search):\\n${results}`;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error(
      'Website sitemap search error',
      error instanceof Error ? error : new Error(errorMsg)
    );
    return `Website search encountered an error: ${errorMsg}`;
  }
}

export const websiteSearchTool = new DynamicTool({
  name: 'search_website_sitemap',
  description:
    'Search through all pages in the company website sitemap to find relevant information for answering customer questions about the company, its services, team members, founders, employees, and people. ' +
    'Use this tool when you need to find specific information that might be on the company website including: ' +
    '- Company services and capabilities ' +
    '- Team information, bios, and member backgrounds ' +
    '- Founder stories and company origins ' +
    '- Employee expertise and qualifications ' +
    '- Individual team member roles and responsibilities ' +
    '- Company history and leadership information. ' +
    'The tool will search all website pages and return the most relevant content with URLs. ' +
    'Input should be the customer question or search query.',
  func: async (query: string) => {
    const result = await searchWebsiteSitemap(query);
    return result;
  },
});

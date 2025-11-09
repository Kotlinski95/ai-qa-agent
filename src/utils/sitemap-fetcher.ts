import { config } from '@config/index';
import { logger } from '@utils/logger';
import fetch from 'node-fetch';

/**
 * Sitemap fetching utility
 * Handles both sitemap indices and regular sitemaps with recursive traversal
 */

export interface SitemapFetchOptions {
  maxUrls?: number;
  // For logging context (e.g., 'scheduled refresh', 'agent search')
  context?: string;
}

export async function fetchSitemapUrls(
  sitemapUrl: string,
  options: SitemapFetchOptions = {},
  visited: Set<string> = new Set()
): Promise<string[]> {
  const { maxUrls = config.ai.agent.maxPagesToSearch, context = 'sitemap fetch' } = options;

  if (visited.has(sitemapUrl)) {
    logger.debug('Sitemap already visited, skipping', { sitemapUrl, context });
    return [];
  }
  visited.add(sitemapUrl);

  try {
    logger.debug('Fetching sitemap', { sitemapUrl, context });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.ai.agent.websiteTimeout);

    const response = await fetch(sitemapUrl, {
      headers: {
        'User-Agent': config.ai.agent.websiteUserAgent,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.error('Sitemap fetch failed', {
        status: response.status,
        statusText: response.statusText,
        sitemapUrl,
        context,
      });
      return [];
    }

    const xml = await response.text();
    const isSitemapIndex = xml.includes('<sitemapindex');

    if (isSitemapIndex) {
      logger.debug('Detected sitemap index, fetching nested sitemaps', { sitemapUrl, context });
      const sitemapRegex = /<loc>(.*?)<\/loc>/g;
      const nestedSitemapUrls: string[] = [];
      let match;

      while ((match = sitemapRegex.exec(xml)) !== null) {
        nestedSitemapUrls.push(match[1].trim());
      }

      logger.info('Found nested sitemaps', {
        count: nestedSitemapUrls.length,
        sitemaps: nestedSitemapUrls,
        context,
      });

      const allUrls: string[] = [];
      for (const nestedSitemapUrl of nestedSitemapUrls) {
        const urls = await fetchSitemapUrls(nestedSitemapUrl, options, visited);
        allUrls.push(...urls);

        // Stop if we've reached the limit
        if (maxUrls && allUrls.length >= maxUrls) {
          break;
        }
      }

      logger.info('Total URLs extracted from sitemap index', {
        count: allUrls.length,
        indexUrl: sitemapUrl,
        context,
      });

      return maxUrls ? allUrls.slice(0, maxUrls) : allUrls;
    } else {
      const urlRegex = /<loc>(.*?)<\/loc>/g;
      const urls: string[] = [];
      let match;

      while ((match = urlRegex.exec(xml)) !== null) {
        urls.push(match[1].trim());

        // Stop if we've reached the limit
        if (maxUrls && urls.length >= maxUrls) {
          break;
        }
      }

      logger.info('Sitemap URLs extracted', {
        count: urls.length,
        sitemapUrl,
        context,
      });

      return urls;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Sitemap fetch error', { sitemapUrl, error: errorMsg, context });
    return [];
  }
}

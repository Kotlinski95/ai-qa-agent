import { config } from '@config/index';
import { logger } from '@utils/logger';
import { fetchWebsiteContent } from '@utils/website-content-extractor';
import * as pineconeService from './pinecone-service';
import fetch from 'node-fetch';
import type { ContentRefreshConfig, ScheduledEvent, RefreshStats } from '@/types/content-refresh';

/**
 * Scheduled content refresh service
 * This runs periodically (e.g., daily) to keep Pinecone content fresh
 */

const DEFAULT_CONFIG: ContentRefreshConfig = {
  batchSize: 5,
  maxConcurrentRequests: 3,
  delayBetweenBatches: 2000, // 2 seconds
  forceRefresh: false,
};

async function fetchSitemapUrls(
  sitemapUrl: string,
  visited: Set<string> = new Set()
): Promise<string[]> {
  if (visited.has(sitemapUrl)) {
    logger.debug('Sitemap already visited, skipping', { sitemapUrl });
    return [];
  }
  visited.add(sitemapUrl);

  try {
    logger.debug('Fetching sitemap for scheduled refresh', { sitemapUrl });
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
      logger.error('Scheduled sitemap fetch failed', {
        status: response.status,
        statusText: response.statusText,
      });
      return [];
    }

    const xml = await response.text();
    const isSitemapIndex = xml.includes('<sitemapindex');

    if (isSitemapIndex) {
      logger.debug('Detected sitemap index, fetching nested sitemaps', { sitemapUrl });
      const sitemapRegex = /<loc>(.*?)<\/loc>/g;
      const nestedSitemapUrls: string[] = [];
      let match;

      while ((match = sitemapRegex.exec(xml)) !== null) {
        nestedSitemapUrls.push(match[1].trim());
      }

      logger.info('Found nested sitemaps for scheduled refresh', {
        count: nestedSitemapUrls.length,
        sitemaps: nestedSitemapUrls,
      });

      const allUrls: string[] = [];
      for (const nestedSitemapUrl of nestedSitemapUrls) {
        const urls = await fetchSitemapUrls(nestedSitemapUrl, visited);
        allUrls.push(...urls);
      }

      logger.info('Total URLs extracted from sitemap index for scheduled refresh', {
        count: allUrls.length,
        indexUrl: sitemapUrl,
      });
      return allUrls;
    } else {
      const urlRegex = /<loc>(.*?)<\/loc>/g;
      const urls: string[] = [];
      let match;

      while ((match = urlRegex.exec(xml)) !== null) {
        urls.push(match[1].trim());
      }

      logger.info('Sitemap URLs extracted for scheduled refresh', {
        count: urls.length,
        sitemapUrl,
      });
      return urls;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Scheduled sitemap fetch error', { sitemapUrl, error: errorMsg });
    return [];
  }
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function refreshWebsiteContent(
  refreshConfig: Partial<ContentRefreshConfig> = {}
): Promise<{ success: boolean; stats: RefreshStats }> {
  const startTime = Date.now();
  const mergedConfig = { ...DEFAULT_CONFIG, ...refreshConfig };

  logger.info('🔄 SCHEDULED CONTENT REFRESH STARTED', {
    config: mergedConfig,
    timestamp: new Date().toISOString(),
  });

  const stats = {
    totalUrls: 0,
    successfulFetches: 0,
    failedFetches: 0,
    skippedUrls: 0,
    updatedInPinecone: 0,
    duration: 0,
    errors: [] as string[],
  };

  try {
    // Initialize Pinecone
    await pineconeService.initialize();
    logger.info('✅ Pinecone initialized for scheduled refresh');

    // Get all URLs from sitemap
    if (!config.ai.agent.sitemapUrl) {
      throw new Error('Sitemap URL not configured');
    }

    const allUrls = await fetchSitemapUrls(config.ai.agent.sitemapUrl);
    stats.totalUrls = allUrls.length;

    logger.info('📋 URLs discovered for scheduled refresh', {
      totalUrls: stats.totalUrls,
    });

    if (allUrls.length === 0) {
      logger.warn('⚠️ No URLs found in sitemap');
      return { success: false, stats };
    }

    // Determine which URLs need refreshing
    let urlsToProcess: string[];

    if (mergedConfig.forceRefresh) {
      urlsToProcess = allUrls;
      logger.info('🔄 Force refresh enabled - processing all URLs');
    } else {
      // Check which URLs need refreshing (you can customize this logic)
      urlsToProcess = await pineconeService.getUrlsToFetch(allUrls);
      stats.skippedUrls = allUrls.length - urlsToProcess.length;
      logger.info('📊 URLs analysis complete', {
        totalUrls: allUrls.length,
        needRefresh: urlsToProcess.length,
        skipped: stats.skippedUrls,
      });
    }

    if (urlsToProcess.length === 0) {
      logger.info('✅ All content is up to date, no refresh needed');
      return { success: true, stats };
    }

    // Process URLs in batches
    const pageContents: Array<{ url: string; title: string; content: string }> = [];

    for (let i = 0; i < urlsToProcess.length; i += mergedConfig.batchSize) {
      const batch = urlsToProcess.slice(i, i + mergedConfig.batchSize);
      const batchNumber = Math.floor(i / mergedConfig.batchSize) + 1;
      const totalBatches = Math.ceil(urlsToProcess.length / mergedConfig.batchSize);

      logger.info('📦 Processing batch', {
        batch: batchNumber,
        totalBatches,
        batchSize: batch.length,
      });

      // Process batch with controlled concurrency
      const batchResults = await Promise.all(
        batch.map(async url => {
          try {
            const content = await fetchWebsiteContent(url);
            if (content.length === 0) {
              stats.failedFetches++;
              return null;
            }

            const title = url.split('/').filter(Boolean).pop()?.replace(/-/g, ' ') || 'Page';
            stats.successfulFetches++;

            return { url, title, content };
          } catch (error) {
            stats.failedFetches++;
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            stats.errors.push(`${url}: ${errorMsg}`);
            logger.debug('❌ Failed to fetch page in scheduled refresh', { url, error: errorMsg });
            return null;
          }
        })
      );

      // Filter successful results
      const validResults = batchResults.filter(
        (page): page is { url: string; title: string; content: string } => page !== null
      );

      pageContents.push(...validResults);

      // Add delay between batches to be respectful
      if (i + mergedConfig.batchSize < urlsToProcess.length) {
        await delay(mergedConfig.delayBetweenBatches);
      }
    }

    // Store all content in Pinecone
    if (pageContents.length > 0) {
      await pineconeService.storePagesContent(pageContents);
      stats.updatedInPinecone = pageContents.length;

      logger.info('💾 Content stored in Pinecone', {
        count: pageContents.length,
      });
    }

    stats.duration = Date.now() - startTime;

    logger.info('✅ SCHEDULED CONTENT REFRESH COMPLETED', {
      stats,
      durationMinutes: (stats.duration / 1000 / 60).toFixed(2),
    });

    return { success: true, stats };
  } catch (error) {
    stats.duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    stats.errors.push(`Global error: ${errorMsg}`);

    logger.error('❌ SCHEDULED CONTENT REFRESH FAILED', {
      error: errorMsg,
      stats,
      durationMinutes: (stats.duration / 1000 / 60).toFixed(2),
    });

    return { success: false, stats };
  }
}

// Lambda handler for scheduled execution
export async function scheduledRefreshHandler(event: ScheduledEvent): Promise<{
  statusCode: number;
  body: string;
}> {
  logger.info('🕐 Scheduled content refresh Lambda triggered', {
    event: event.source || 'EventBridge',
    timestamp: new Date().toISOString(),
  });

  const result = await refreshWebsiteContent({
    forceRefresh: event.forceRefresh || false,
    batchSize: event.batchSize || 5,
    maxConcurrentRequests: event.maxConcurrentRequests || 3,
    delayBetweenBatches: event.delayBetweenBatches || 2000,
  });

  return {
    statusCode: result.success ? 200 : 500,
    body: JSON.stringify({
      success: result.success,
      stats: result.stats,
      timestamp: new Date().toISOString(),
    }),
  };
}

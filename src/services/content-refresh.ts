import { config } from '@config/index';
import { logger } from '@utils/logger';
import { fetchWebsiteContent } from '@utils/website-content-extractor';
import { fetchSitemapUrls } from '@utils/sitemap-fetcher';
import { delay } from '@utils/timing';
import * as pineconeService from './pinecone-service';
import type { ContentRefreshConfig, ScheduledEvent, RefreshStats } from '@/types/content-refresh';
import { HTTP_STATUS, CONTENT_LIMITS, TIMEOUTS } from '@constants/index';

/**
 * Scheduled content refresh service
 * This runs periodically (e.g., daily) to keep Pinecone content fresh
 */

const DEFAULT_CONFIG: ContentRefreshConfig = {
  batchSize: CONTENT_LIMITS.BATCH_SIZE,
  maxConcurrentRequests: CONTENT_LIMITS.MAX_CONCURRENT_REQUESTS,
  delayBetweenBatches: TIMEOUTS.BATCH_DELAY,
  forceRefresh: false,
};

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

    const allUrls = await fetchSitemapUrls(config.ai.agent.sitemapUrl, {
      context: 'scheduled refresh',
    });
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
      durationMinutes: (
        stats.duration /
        TIMEOUTS.MILLISECONDS_PER_SECOND /
        TIMEOUTS.SECONDS_PER_MINUTE
      ).toFixed(2),
    });

    return { success: true, stats };
  } catch (error) {
    stats.duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    stats.errors.push(`Global error: ${errorMsg}`);

    logger.error('❌ SCHEDULED CONTENT REFRESH FAILED', {
      error: errorMsg,
      stats,
      durationMinutes: (
        stats.duration /
        TIMEOUTS.MILLISECONDS_PER_SECOND /
        TIMEOUTS.SECONDS_PER_MINUTE
      ).toFixed(2),
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
    batchSize: event.batchSize || CONTENT_LIMITS.BATCH_SIZE,
    maxConcurrentRequests: event.maxConcurrentRequests || CONTENT_LIMITS.MAX_CONCURRENT_REQUESTS,
    delayBetweenBatches: event.delayBetweenBatches || TIMEOUTS.BATCH_DELAY,
  });

  return {
    statusCode: result.success ? HTTP_STATUS.OK : HTTP_STATUS.INTERNAL_SERVER_ERROR,
    body: JSON.stringify({
      success: result.success,
      stats: result.stats,
      timestamp: new Date().toISOString(),
    }),
  };
}

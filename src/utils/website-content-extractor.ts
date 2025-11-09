import fetch from 'node-fetch';
import { config } from '@config/index';
import { logger } from './logger';

/**
 * Enhanced website content extraction utility
 * Removes headers, footers, navigation, and increases content limits
 *
 * This function provides intelligent content extraction that:
 * - Removes duplicate header/footer content that appears on every page
 * - Focuses on main content areas
 * - Increases content limits for better AI responses
 * - Handles HTML parsing and text cleanup
 */
export async function fetchWebsiteContent(url: string): Promise<string> {
  try {
    logger.debug('Fetching website content', { url });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.ai.agent.websiteTimeout);

    const response = await fetch(url, {
      headers: {
        'User-Agent': config.ai.agent.websiteUserAgent,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();

    // Enhanced content extraction with better filtering
    let processedHtml = html;

    // Remove script and style tags first
    processedHtml = processedHtml
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

    // Remove common header/footer/navigation elements that are repeated across pages
    processedHtml = processedHtml
      .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, '') // Remove header
      .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, '') // Remove footer
      .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, '') // Remove navigation
      .replace(/<aside\b[^>]*>[\s\S]*?<\/aside>/gi, '') // Remove sidebars
      .replace(/<!--[\s\S]*?-->/g, ''); // Remove HTML comments

    // Remove elements with common header/footer class names and IDs
    const commonHeaderFooterSelectors = [
      /<div[^>]*(?:class|id)="[^"]*(?:header|footer|nav|menu|sidebar|widget|banner|breadcrumb)[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
      /<section[^>]*(?:class|id)="[^"]*(?:header|footer|nav|menu|sidebar|widget|banner|breadcrumb)[^"]*"[^>]*>[\s\S]*?<\/section>/gi,
      /<div[^>]*(?:class|id)="[^"]*(?:top|bottom|left|right)-(?:menu|nav|bar)[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
    ];

    commonHeaderFooterSelectors.forEach(regex => {
      processedHtml = processedHtml.replace(regex, '');
    });

    // Focus on main content areas
    const mainContentMatch =
      processedHtml.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i) ||
      processedHtml.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i) ||
      processedHtml.match(
        /<div[^>]*(?:class|id)="[^"]*(?:content|main|post|article|body)[^"]*"[^>]*>([\s\S]*?)<\/div>/i
      );

    if (mainContentMatch) {
      processedHtml = mainContentMatch[1] || processedHtml;
      logger.debug('Extracted main content area', {
        url,
        originalLength: html.length,
        extractedLength: processedHtml.length,
      });
    }

    // Remove all remaining HTML tags and clean up text
    const textContent = processedHtml
      .replace(/<[^>]+>/g, ' ') // Remove all HTML tags
      .replace(/&nbsp;/g, ' ') // Replace non-breaking spaces
      .replace(/&amp;/g, '&') // Decode HTML entities
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/')
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    // Use much higher content limit - 10x increase from 3000 to 30000 characters
    const maxLength = 30000;
    const finalContent = textContent.substring(0, maxLength);

    // Add truncation warning if content was cut off
    const wasTruncated = textContent.length > maxLength;

    logger.info('Website content fetched successfully', {
      url,
      originalHtmlLength: html.length,
      processedTextLength: textContent.length,
      finalContentLength: finalContent.length,
      wasTruncated,
      contentPreview: finalContent.substring(0, 200) + '...',
    });

    if (wasTruncated) {
      logger.warn('Content was truncated due to length limit', {
        url,
        originalLength: textContent.length,
        truncatedTo: maxLength,
      });
    }

    return finalContent;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Website fetch failed', { url, error: errorMsg });
    throw new Error(`Failed to fetch website: ${errorMsg}`);
  }
}

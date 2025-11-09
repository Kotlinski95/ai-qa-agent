import fetch from 'node-fetch';
import { config } from '@config/index';
import { logger } from './logger';
import { HTTP_STATUS } from '../constants/index';

async function fetchHtmlContent(url: string): Promise<string> {
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

  return response.text();
}

function removeScriptsAndStyles(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
}

function removeNavigationElements(html: string): string {
  return html
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<aside\b[^>]*>[\s\S]*?<\/aside>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

function removeCommonHeaderFooterElements(html: string): string {
  const commonHeaderFooterSelectors = [
    /<div[^>]*(?:class|id)="[^"]*(?:header|footer|nav|menu|sidebar|widget|banner|breadcrumb)[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
    /<section[^>]*(?:class|id)="[^"]*(?:header|footer|nav|menu|sidebar|widget|banner|breadcrumb)[^"]*"[^>]*>[\s\S]*?<\/section>/gi,
    /<div[^>]*(?:class|id)="[^"]*(?:top|bottom|left|right)-(?:menu|nav|bar)[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
  ];

  let processedHtml = html;
  commonHeaderFooterSelectors.forEach(regex => {
    processedHtml = processedHtml.replace(regex, '');
  });

  return processedHtml;
}

function extractMainContent(html: string): string {
  const mainContentMatch =
    html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i) ||
    html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i) ||
    html.match(
      /<div[^>]*(?:class|id)="[^"]*(?:content|main|post|article|body)[^"]*"[^>]*>([\s\S]*?)<\/div>/i
    );

  return mainContentMatch ? mainContentMatch[1] || html : html;
}

function convertHtmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateAndLogContent(
  textContent: string,
  url: string,
  originalHtmlLength: number
): string {
  const MAX_CONTENT_LENGTH = 30000;
  const finalContent = textContent.substring(0, MAX_CONTENT_LENGTH);
  const wasTruncated = textContent.length > MAX_CONTENT_LENGTH;

  logger.info('Website content fetched successfully', {
    url,
    originalHtmlLength,
    processedTextLength: textContent.length,
    finalContentLength: finalContent.length,
    wasTruncated,
    contentPreview: `${finalContent.substring(0, HTTP_STATUS.OK)}...`,
  });

  if (wasTruncated) {
    logger.warn('Content was truncated due to length limit', {
      url,
      originalLength: textContent.length,
      truncatedTo: MAX_CONTENT_LENGTH,
    });
  }

  return finalContent;
}

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
    const html = await fetchHtmlContent(url);

    let processedHtml = removeScriptsAndStyles(html);
    processedHtml = removeNavigationElements(processedHtml);
    processedHtml = removeCommonHeaderFooterElements(processedHtml);
    processedHtml = extractMainContent(processedHtml);

    const textContent = convertHtmlToText(processedHtml);
    return truncateAndLogContent(textContent, url, html.length);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Website fetch failed', { url, error: errorMsg });
    throw new Error(`Failed to fetch website: ${errorMsg}`);
  }
}

import { config } from '@config/index';
import { logger } from '@utils/logger';
import type { CompanyInfo } from '@/types/company';

/**
 * Extract company information from sitemap URL
 * @param sitemapUrl - The sitemap URL to extract company info from
 * @returns Company information with domain and name
 */
export function extractCompanyInfoFromSitemap(sitemapUrl: string): CompanyInfo {
  try {
    const url = new URL(sitemapUrl);
    const domain = url.hostname.replace('www.', '');

    // Extract company name from domain (remove common TLDs and subdomains)
    const companyName = domain
      .replace(/\.(com|org|net|io|dev|co|uk|ca|au|de|fr|pl|eu)$/, '')
      .replace(/[-_.]/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    return { domain, companyName };
  } catch (error) {
    logger.warn('Failed to extract company info from sitemap URL', {
      sitemapUrl,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return { domain: 'this company', companyName: 'our company' };
  }
}

/**
 * Get company information from configuration
 * @returns Company information from the configured sitemap URL
 */
export function getCompanyInfo(): CompanyInfo {
  return config.ai.agent.sitemapUrl
    ? extractCompanyInfoFromSitemap(config.ai.agent.sitemapUrl)
    : { domain: 'this company', companyName: 'our company' };
}

/**
 * Company information extracted from configuration
 */
export interface CompanyInfo {
  domain: string;
  companyName: string;
}

/**
 * Website content with metadata
 */
export interface PageContent {
  url: string;
  title: string;
  content: string;
}

/**
 * Website search result with relevance scoring
 */
export interface WebsiteSearchResult {
  url: string;
  content: string;
  score: number;
}

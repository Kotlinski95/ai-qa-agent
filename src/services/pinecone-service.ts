import { Pinecone } from '@pinecone-database/pinecone';
import { OpenAIEmbeddings } from '@langchain/openai';
import { PineconeStore } from '@langchain/pinecone';
import { Document } from '@langchain/core/documents';
import { config } from '@config/index';
import { logger } from '@utils/logger';
import type { WebsitePageMetadata, PineconeState } from '@/types/database';

let state: PineconeState = {
  pinecone: null,
  embeddings: null,
  vectorStore: null,
  isInitialized: false,
};

export async function initialize(): Promise<void> {
  if (state.isInitialized) {
    return;
  }
  try {
    const apiKey = config.ai.pinecone.apiKey;
    if (!apiKey) {
      logger.warn('Pinecone API key not configured, vector storage disabled');
      return;
    }
    logger.info('Initializing Pinecone vector store', {
      indexName: config.ai.pinecone.indexName,
      namespace: config.ai.pinecone.namespace,
    });
    state.pinecone = new Pinecone({
      apiKey: apiKey,
    });
    state.embeddings = new OpenAIEmbeddings({
      openAIApiKey: config.ai.openai.apiKey,
      modelName: 'text-embedding-3-large',
    });
    const index = state.pinecone.index(config.ai.pinecone.indexName);
    state.vectorStore = await PineconeStore.fromExistingIndex(state.embeddings, {
      pineconeIndex: index as unknown as Parameters<
        typeof PineconeStore.fromExistingIndex
      >[1]['pineconeIndex'],
      namespace: config.ai.pinecone.namespace,
    });
    state.isInitialized = true;
    logger.info('Pinecone vector store initialized successfully');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to initialize Pinecone vector store', { error: errorMsg });
    throw error;
  }
}

export async function isCached(url: string): Promise<boolean> {
  if (!state.isInitialized || !state.vectorStore) {
    return false;
  }
  try {
    const results = await state.vectorStore.similaritySearch(url, 50);
    const exactMatch = results.find((doc: { metadata: unknown }) => {
      const metadata = doc.metadata as WebsitePageMetadata;
      return metadata.url === url;
    });
    if (!exactMatch) {
      logger.debug('URL not found in cache', { url });
      return false;
    }
    const metadata = exactMatch.metadata as WebsitePageMetadata;
    const fetchedAt = metadata?.fetchedAt || 0;
    const cacheDurationMs = config.ai.pinecone.cacheDurationHours * 60 * 60 * 1000;
    const ageMs = Date.now() - fetchedAt;
    const isStale = ageMs > cacheDurationMs;
    const ageHours = Math.round(ageMs / 1000 / 60 / 60);
    logger.debug('Cache check', {
      url: url.substring(0, 60) + '...',
      cached: !isStale,
      ageHours,
      cacheDurationHours: config.ai.pinecone.cacheDurationHours,
      status: isStale ? 'STALE' : 'FRESH',
    });
    return !isStale;
  } catch (error) {
    logger.debug('Error checking cache, assuming not cached', {
      url: url.substring(0, 60) + '...',
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function deleteByUrl(url: string): Promise<void> {
  if (!state.pinecone) {
    return;
  }
  try {
    const index = state.pinecone.index(config.ai.pinecone.indexName);
    await index.namespace(config.ai.pinecone.namespace).deleteMany({
      url: url,
    });
    logger.debug('Deleted old entries for URL', { url });
  } catch {
    logger.debug('No existing entries to delete for URL', { url });
  }
}

export async function storePagesContent(
  pages: Array<{ url: string; title: string; content: string }>
): Promise<void> {
  if (!state.isInitialized || !state.vectorStore || !state.pinecone) {
    logger.warn('Vector store not initialized, skipping storage');
    return;
  }
  try {
    const timestamp = Date.now();
    const urlsToUpdate = pages.map(p => p.url);
    logger.debug('Checking for existing entries to update', { urls: urlsToUpdate.length });
    for (const page of pages) {
      try {
        await deleteByUrl(page.url);
      } catch {
        logger.debug('No existing entry found for URL (or error deleting)', { url: page.url });
      }
    }
    const documents: Document[] = pages.map(page => {
      return new Document({
        pageContent: `${page.title}\n\n${page.content}`,
        metadata: {
          url: page.url,
          title: page.title,
          content: page.content,
          fetchedAt: timestamp,
          source: 'website-sitemap',
        } as WebsitePageMetadata,
      });
    });
    logger.info('Upserting pages in Pinecone (delete old + insert new)', {
      count: documents.length,
    });
    await state.vectorStore.addDocuments(documents);
    logger.info('Successfully stored pages in Pinecone', { count: documents.length });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to store pages in Pinecone', { error: errorMsg });
    throw error;
  }
}

export async function searchSimilar(
  query: string,
  topK: number = 3
): Promise<
  Array<{
    url: string;
    title: string;
    content: string;
    score: number;
  }>
> {
  if (!state.isInitialized || !state.vectorStore) {
    logger.warn('Vector store not initialized, cannot search');
    return [];
  }
  try {
    logger.debug('Searching Pinecone for similar content', { query, topK });
    const results = await state.vectorStore.similaritySearchWithScore(query, topK);
    const formattedResults = results.map(([doc, score]: [{ metadata: unknown }, number]) => {
      const metadata = doc.metadata as WebsitePageMetadata;
      return {
        url: metadata.url,
        title: metadata.title,
        content: metadata.content,
        score: score,
      };
    });
    logger.info('Pinecone search completed', {
      query,
      resultsFound: formattedResults.length,
      topScore: formattedResults[0]?.score || 0,
    });
    return formattedResults;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to search Pinecone', { error: errorMsg });
    return [];
  }
}

export async function getUrlsToFetch(urls: string[]): Promise<string[]> {
  if (!state.isInitialized || !state.vectorStore) {
    return urls;
  }
  try {
    const allCachedDocs = await state.vectorStore.similaritySearch(
      '',
      Math.min(urls.length * 2, 100)
    );
    const cacheMap = new Map<string, number>();
    for (const doc of allCachedDocs) {
      const metadata = doc.metadata as WebsitePageMetadata;
      if (metadata.url && metadata.fetchedAt) {
        cacheMap.set(metadata.url, metadata.fetchedAt);
      }
    }
    const cacheDurationMs = config.ai.pinecone.cacheDurationHours * 60 * 60 * 1000;
    const now = Date.now();
    const urlsToFetch: string[] = [];
    for (const url of urls) {
      const fetchedAt = cacheMap.get(url);
      if (!fetchedAt) {
        urlsToFetch.push(url);
        logger.debug('Cache MISS - URL not found', { url: url.substring(url.lastIndexOf('/')) });
      } else {
        const ageMs = now - fetchedAt;
        const isStale = ageMs > cacheDurationMs;
        if (isStale) {
          urlsToFetch.push(url);
          logger.debug('Cache STALE', {
            url: url.substring(url.lastIndexOf('/')),
            ageHours: Math.round(ageMs / 1000 / 60 / 60),
            maxHours: config.ai.pinecone.cacheDurationHours,
          });
        } else {
          logger.debug('Cache HIT', {
            url: url.substring(url.lastIndexOf('/')),
            ageMinutes: Math.round(ageMs / 1000 / 60),
          });
        }
      }
    }
    logger.info('Cache analysis', {
      total: urls.length,
      cached: urls.length - urlsToFetch.length,
      toFetch: urlsToFetch.length,
      cacheHitRate: `${Math.round(((urls.length - urlsToFetch.length) / urls.length) * 100)}%`,
    });
    return urlsToFetch;
  } catch (error) {
    logger.warn('Error checking cache, fetching all URLs', {
      error: error instanceof Error ? error.message : String(error),
    });
    return urls;
  }
}

export async function clearCache(): Promise<void> {
  if (!state.isInitialized || !state.pinecone) {
    logger.warn('Vector store not initialized, cannot clear cache');
    return;
  }
  try {
    const index = state.pinecone.index(config.ai.pinecone.indexName);
    await index.namespace(config.ai.pinecone.namespace).deleteAll();
    logger.info('Pinecone cache cleared successfully');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to clear Pinecone cache', { error: errorMsg });
    throw error;
  }
}

export function isInitialized(): boolean {
  return state.isInitialized;
}

export function resetState(): void {
  state = {
    pinecone: null,
    embeddings: null,
    vectorStore: null,
    isInitialized: false,
  };
}

import { Pinecone } from '@pinecone-database/pinecone';
import { OpenAIEmbeddings } from '@langchain/openai';
import { PineconeStore } from '@langchain/pinecone';
import type { JsonValue } from './common';

export interface WebsitePageMetadata {
  url: string;
  title: string;
  content: string;
  fetchedAt: number;
  source: 'website-sitemap';
}

export interface PineconeState {
  pinecone: Pinecone | null;
  embeddings: OpenAIEmbeddings | null;
  vectorStore: PineconeStore | null;
  isInitialized: boolean;
}

export interface SearchResult {
  content: string;
  metadata: WebsitePageMetadata;
  score?: number;
}

export interface SearchOptions {
  // Number of results
  k?: number;
  // Similarity threshold
  threshold?: number;
  // Metadata filters
  filter?: Record<string, JsonValue>;
}

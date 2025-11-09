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
  k?: number; // number of results
  threshold?: number; // similarity threshold
  filter?: Record<string, JsonValue>; // metadata filters
}

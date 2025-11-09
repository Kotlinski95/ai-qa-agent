export interface ContentRefreshConfig {
  batchSize: number;
  maxConcurrentRequests: number;
  delayBetweenBatches: number;
  forceRefresh: boolean; // If true, refreshes all content regardless of age
}

export interface ScheduledEvent {
  source?: string;
  forceRefresh?: boolean;
  batchSize?: number;
  maxConcurrentRequests?: number;
  delayBetweenBatches?: number;
}

export interface RefreshStats {
  totalUrls: number;
  successfulFetches: number;
  failedFetches: number;
  skippedUrls: number;
  updatedInPinecone: number;
  duration: number;
  errors: string[];
}

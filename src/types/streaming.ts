export interface StreamingEvent {
  queryStringParameters?: {
    question?: string;
    sessionId?: string;
  };
  body?: string;
  httpMethod?: string;
}

export interface StreamChunk {
  type: 'start' | 'chunk' | 'complete' | 'error';
  index?: number;
  chunk?: string;
  sessionId?: string;
  question?: string;
  answer?: string;
  error?: string;
  totalChunks?: number;
  answerLength?: number;
  timestamp: string;
}

// Streaming-related types for AWS Lambda Response Streaming

export interface LambdaStreamifyResponse {
  streamifyResponse: (
    handler: (event: unknown, responseStream: unknown) => Promise<void>
  ) => unknown;
  HttpResponseStream: {
    from: (responseStream: unknown, metadata: ResponseMetadata) => unknown;
  };
}

export interface ResponseMetadata {
  statusCode: number;
  headers?: Record<string, string>;
}

export interface HttpResponseStream {
  write: (chunk: string | Buffer) => boolean;
  end: () => void;
}

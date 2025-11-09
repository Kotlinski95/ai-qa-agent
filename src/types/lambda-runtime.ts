// AWS Lambda runtime types for better type safety

export interface LambdaEnvironment {
  AWS_LAMBDA_FUNCTION_NAME?: string;
  AWS_LAMBDA_FUNCTION_VERSION?: string;
  AWS_LAMBDA_FUNCTION_MEMORY_SIZE?: string;
  AWS_REGION?: string;
  AWS_EXECUTION_ENV?: string;
}

export interface LambdaContext {
  functionName: string;
  functionVersion: string;
  invokedFunctionArn: string;
  memoryLimitInMB: string;
  awsRequestId: string;
  logGroupName: string;
  logStreamName: string;
  getRemainingTimeInMillis(): number;
  callbackWaitsForEmptyEventLoop: boolean;
  done(error?: Error, result?: unknown): void;
  fail(error: Error | string): void;
  succeed(messageOrObject: unknown): void;
}

export interface LambdaError {
  name: string;
  message: string;
  stack?: string;
  cause?: unknown;
}

export interface RequestContext {
  requestId: string;
  timestamp: string;
  source?: string;
  userAgent?: string;
  ip?: string;
}

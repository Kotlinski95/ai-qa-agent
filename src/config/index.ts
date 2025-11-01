/**
 * Application configuration
 */
export const config = {
  // CORS configuration
  cors: {
    allowOrigin: process.env.CORS_ALLOW_ORIGIN || '*',
    allowMethods: process.env.CORS_ALLOW_METHODS || 'GET, POST, OPTIONS',
    allowHeaders: process.env.CORS_ALLOW_HEADERS || 'Content-Type, Authorization',
  },
  
  // Application settings
  app: {
    name: 'AI QA Agent',
    version: process.env.APP_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  },
  
  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enableRequestLogging: process.env.ENABLE_REQUEST_LOGGING !== 'false',
    enableResponseLogging: process.env.ENABLE_RESPONSE_LOGGING !== 'false',
  },
  
  // AI/LLM Configuration for LangChain integration
  ai: {
    // OpenAI Configuration - use getters to read values dynamically
    get openai() {
      return {
        get apiKey() {
          const key = process.env.OPENAI_API_KEY || '';
          return key;
        },
        get model() {
          return process.env.OPENAI_MODEL || 'gpt-4o-mini';
        },
        get temperature() {
          return parseFloat(process.env.OPENAI_TEMPERATURE || '0.7');
        },
        get maxTokens() {
          return parseInt(process.env.OPENAI_MAX_TOKENS || '1500');
        },
        get timeout() {
          return parseInt(process.env.OPENAI_TIMEOUT_MS || '30000');
        }
      };
    },
    
    // LangGraph Configuration
    langgraph: {
      enableTracing: process.env.LANGGRAPH_ENABLE_TRACING === 'true',
      maxIterations: parseInt(process.env.LANGGRAPH_MAX_ITERATIONS || '10'),
      enableMemory: process.env.LANGGRAPH_ENABLE_MEMORY === 'true',
    },
    
    // Agent Configuration
    agent: {
      enableWebScraping: process.env.AGENT_ENABLE_WEB_SCRAPING === 'true',
      websiteTimeout: parseInt(process.env.AGENT_WEBSITE_TIMEOUT_MS || '10000'),
      maxWebsiteContentLength: parseInt(process.env.AGENT_MAX_WEBSITE_CONTENT || '3000'),
      websiteUserAgent: process.env.AGENT_WEBSITE_USER_AGENT || 'Mozilla/5.0 (compatible; AI-QA-Agent/1.0)',
    },
    
    // General AI settings
    systemPrompt: process.env.AI_SYSTEM_PROMPT || 'You are a helpful AI assistant that provides accurate and concise answers to questions.',
    enableStreaming: process.env.AI_ENABLE_STREAMING === 'true',
  },

  // QA Agent configuration
  qa: {
    maxQuestionLength: parseInt(process.env.MAX_QUESTION_LENGTH || '500'),
    maxContextLength: parseInt(process.env.MAX_CONTEXT_LENGTH || '2000'),
    defaultResponse: process.env.DEFAULT_QA_RESPONSE || 'This is a placeholder response from your AI QA agent.',
    enableContextEnhancement: process.env.ENABLE_CONTEXT_ENHANCEMENT === 'true',
  },
  
  // Security settings
  security: {
    enableRateLimiting: process.env.ENABLE_RATE_LIMITING === 'true',
    maxRequestsPerMinute: parseInt(process.env.MAX_REQUESTS_PER_MINUTE || '60'),
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['*'],
  },
  
  // Performance settings
  performance: {
    enableRequestValidation: process.env.ENABLE_REQUEST_VALIDATION !== 'false',
    enableResponseCompression: process.env.ENABLE_RESPONSE_COMPRESSION === 'true',
    enableCaching: process.env.ENABLE_CACHING === 'true',
    cacheTimeout: parseInt(process.env.CACHE_TIMEOUT_SECONDS || '300'),
  },
  
  // AWS Configuration
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    functionName: process.env.AWS_LAMBDA_FUNCTION_NAME || 'ai-qa-agent',
  }
} as const;

/**
 * CORS headers for all responses
 */
export const getCorsHeaders = () => ({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': config.cors.allowOrigin,
  'Access-Control-Allow-Methods': config.cors.allowMethods,
  'Access-Control-Allow-Headers': config.cors.allowHeaders,
});

/**
 * Available routes documentation
 */
export const availableRoutes = [
  'GET /health - Health check endpoint',
  'POST /qa/stream - Ask a question with streaming response (SSE)',
  'POST /qa - Ask a question to the AI agent',
  'POST / - Ask a question to the AI agent (root endpoint)',
] as const;

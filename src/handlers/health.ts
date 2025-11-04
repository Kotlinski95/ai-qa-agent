import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { createSuccessResponse, addResponseMetadata } from '../utils/response.js';
import { HealthResponse, HttpStatusCode } from '../types/index.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

/**
 * Health check handler
 * GET /health
 */
export async function healthHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  logger.debug('Health check requested');

  try {
    // Perform basic health checks
    const isHealthy = await performHealthChecks();
    
    // Get AI service status
    const aiStatus = await getAIServiceStatus();
    
    const healthData: Omit<HealthResponse, 'timestamp' | 'requestId'> = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      version: config.app.version,
      ai: aiStatus,
    };

    const response = addResponseMetadata(healthData, context);
    
    logger.debug('Health check completed', { status: response.status });
    
    return createSuccessResponse(
      response,
      isHealthy ? HttpStatusCode.OK : HttpStatusCode.SERVICE_UNAVAILABLE
    );
  } catch (error) {
    logger.error('Health check failed', error);
    
    const unhealthyResponse = addResponseMetadata({
      status: 'unhealthy',
      version: config.app.version,
    }, context);

    return createSuccessResponse(
      unhealthyResponse,
      HttpStatusCode.SERVICE_UNAVAILABLE
    );
  }
}

/**
 * Performs application health checks
 */
async function performHealthChecks(): Promise<boolean> {
  try {
    // Add your health check logic here
    // For example:
    // - Check database connectivity
    // - Check external service availability
    // - Check memory usage
    // - Check disk space
    
    // Memory check - Use RSS (Resident Set Size) vs Lambda limit, not heap pressure
    // Note: heapUsed/heapTotal measures V8 internal heap pressure (often 90-97% before heap expansion)
    //       RSS/Lambda limit measures actual process memory vs available Lambda memory
    const lambdaMemoryLimitMB = parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || '512');
    const memoryUsage = process.memoryUsage();
    const rssMB = memoryUsage.rss / 1024 / 1024;
    const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
    const heapTotalMB = memoryUsage.heapTotal / 1024 / 1024;
    const memoryUtilization = (rssMB / lambdaMemoryLimitMB) * 100;
    
    logger.debug('Memory usage check', {
      rss: `${rssMB.toFixed(1)}MB`,
      heapUsed: `${heapUsedMB.toFixed(1)}MB`,
      heapTotal: `${heapTotalMB.toFixed(1)}MB`,
      lambdaLimit: `${lambdaMemoryLimitMB}MB`,
      utilization: `${memoryUtilization.toFixed(1)}%`,
    });
    
    // Consider unhealthy if using > 90% of Lambda memory (not heap pressure)
    if (memoryUtilization > 90) {
      logger.warn('High memory usage detected', { 
        utilization: memoryUtilization,
        usedMB: rssMB.toFixed(2),
        limitMB: lambdaMemoryLimitMB,
      });
      return false;
    }
    
    // Check if we can access environment variables
    if (!config.app.name) {
      logger.error('Configuration not properly loaded');
      return false;
    }
    
    return true;
  } catch (error) {
    logger.error('Health check evaluation failed', error);
    return false;
  }
}

  /**
   * Checks AI service status (lightweight - no API calls)
   */
  async function getAIServiceStatus() {
    try {
      logger.debug('Checking AI service status');

      // Check if API key is configured (no imports, no API calls)
      const hasApiKey = !!config.ai.openai.apiKey;
      const hasPineconeKey = !!config.ai.pinecone.apiKey;

      logger.info('AI service check completed', { 
        hasApiKey, 
        hasPineconeKey,
        model: config.ai.openai.model 
      });

      return {
        configured: hasApiKey,
        provider: 'OpenAI (LangChain)',
        model: config.ai.openai.model,
        pinecone: {
          configured: hasPineconeKey,
          index: config.ai.pinecone.indexName,
          namespace: config.ai.pinecone.namespace,
        },
      };
    } catch (error) {
      logger.error('Error checking AI service status', error);
      return {
        configured: false,
        provider: 'OpenAI (LangChain)',
        model: config.ai.openai.model,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
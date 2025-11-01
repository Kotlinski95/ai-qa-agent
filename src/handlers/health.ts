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
    
    // Basic Node.js runtime check
    const memoryUsage = process.memoryUsage();
    const maxHeapSize = memoryUsage.heapTotal;
    const usedHeap = memoryUsage.heapUsed;
    const memoryUtilization = (usedHeap / maxHeapSize) * 100;
    
    logger.debug('Memory usage check', {
      heapUsed: `${Math.round(usedHeap / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(maxHeapSize / 1024 / 1024)}MB`,
      utilization: `${memoryUtilization.toFixed(1)}%`,
    });
    
    // Consider unhealthy if memory usage is above 90%
    if (memoryUtilization > 90) {
      logger.warn('High memory usage detected', { utilization: memoryUtilization });
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
 * Get AI service status
 */
async function getAIServiceStatus(): Promise<{
  configured: boolean;
  provider: string;
  model?: string;
  connected?: boolean;
}> {
  try {
    const hasApiKey = !!config.ai.openai.apiKey;
    
    if (!hasApiKey) {
      return {
        configured: false,
        provider: 'OpenAI (LangChain)',
        connected: false,
      };
    }

    // Try to test connection if configured
    try {
      const { testConnection } = await import('../services/langchain.js');
      
      // Quick connection test (with timeout)
      const connectionPromise = testConnection();
      const timeoutPromise = new Promise<boolean>((_, reject) => {
        setTimeout(() => reject(new Error('Connection test timeout')), 5000);
      });
      
      const connected = await Promise.race([connectionPromise, timeoutPromise]);
      
      return {
        configured: true,
        provider: 'OpenAI (LangChain)',
        model: config.ai.openai.model,
        connected,
      };
    } catch (connectionError) {
      logger.debug('AI connection test failed', connectionError);
      return {
        configured: true,
        provider: 'OpenAI (LangChain)',
        model: config.ai.openai.model,
        connected: false,
      };
    }
  } catch (error) {
    logger.error('Failed to get AI service status', error);
    return {
      configured: false,
      provider: 'Unknown',
      connected: false,
    };
  }
}

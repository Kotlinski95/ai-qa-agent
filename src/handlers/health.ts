import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { createSuccessResponse, addResponseMetadata } from '@utils/response';
import type { HealthResponse } from '@/types/index';
import { HttpStatusCode } from '@/types/index';
import { config } from '@config/index';
import { logger } from '@utils/logger';
import { MEMORY_SIZES } from '../constants/index';

export async function healthHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  logger.debug('Health check requested');
  try {
    const isHealthy = await performHealthChecks();
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
    const unhealthyResponse = addResponseMetadata(
      {
        status: 'unhealthy',
        version: config.app.version,
      },
      context
    );
    return createSuccessResponse(unhealthyResponse, HttpStatusCode.SERVICE_UNAVAILABLE);
  }
}

async function performHealthChecks(): Promise<boolean> {
  try {
    const lambdaMemoryLimitMB = parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || '512');
    const memoryUsage = process.memoryUsage();
    const rssMB = memoryUsage.rss / MEMORY_SIZES.KILOBYTE / MEMORY_SIZES.KILOBYTE;
    const heapUsedMB = memoryUsage.heapUsed / MEMORY_SIZES.KILOBYTE / MEMORY_SIZES.KILOBYTE;
    const heapTotalMB = memoryUsage.heapTotal / MEMORY_SIZES.KILOBYTE / MEMORY_SIZES.KILOBYTE;
    const memoryUtilization = (rssMB / lambdaMemoryLimitMB) * MEMORY_SIZES.HUNDRED_MB;
    logger.debug('Memory usage check', {
      rss: `${rssMB.toFixed(1)}MB`,
      heapUsed: `${heapUsedMB.toFixed(1)}MB`,
      heapTotal: `${heapTotalMB.toFixed(1)}MB`,
      lambdaLimit: `${lambdaMemoryLimitMB}MB`,
      utilization: `${memoryUtilization.toFixed(1)}%`,
    });
    if (memoryUtilization > MEMORY_SIZES.NINETY_PERCENT) {
      logger.warn('High memory usage detected', {
        utilization: memoryUtilization,
        usedMB: rssMB.toFixed(2),
        limitMB: lambdaMemoryLimitMB,
      });
      return false;
    }
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

async function getAIServiceStatus() {
  try {
    logger.debug('Checking AI service status');
    const hasApiKey = !!config.ai.openai.apiKey;
    const hasPineconeKey = !!config.ai.pinecone.apiKey;
    logger.info('AI service check completed', {
      hasApiKey,
      hasPineconeKey,
      model: config.ai.openai.model,
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

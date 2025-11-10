import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import {
  createSuccessResponse,
  createValidationErrorResponse,
  parseJsonBody,
  addResponseMetadata,
} from '@utils/response';
import { validateQARequest, sanitizeInput, isValidationError } from '@utils/validation';
import { randomDelay } from '@utils/timing';
import type { QAResponse } from '@/types/index';
import { HttpStatusCode } from '@/types/index';
import { config } from '@config/index';
import { logDebug, logger, logInfo, logWarn, logError } from '@utils/logger';
import { CONTENT_LIMITS, TIMEOUTS } from '@constants/index';

export async function qaHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  logDebug('QA request received');
  try {
    const body = parseJsonBody(event.body);
    const validatedRequest = validateQARequest(body);
    logInfo('Processing QA request', {
      questionLength: validatedRequest.question.length,
      hasContext: !!validatedRequest.context,
    });
    const sanitizedQuestion = sanitizeInput(validatedRequest.question);
    const sanitizedContext = validatedRequest.context
      ? sanitizeInput(validatedRequest.context)
      : undefined;
    const answer = await processQuestion(sanitizedQuestion, sanitizedContext);
    const qaResponse: Omit<QAResponse, 'timestamp' | 'requestId'> = {
      question: sanitizedQuestion,
      answer,
      context: sanitizedContext || null,
    };
    const response = addResponseMetadata(qaResponse, context);
    logInfo('QA response generated', {
      answerLength: answer.length,
      processingTime: 'N/A',
    });
    return createSuccessResponse(response, HttpStatusCode.OK);
  } catch (error) {
    if (isValidationError(error)) {
      logWarn(`Validation error: ${error.message}`);
      return createValidationErrorResponse(error.message, context);
    }
    logError('QA processing error', error);
    return createValidationErrorResponse(
      'Failed to process your question. Please try again.',
      context
    );
  }
}

async function processQuestion(question: string, context?: string): Promise<string> {
  try {
    logDebug('Starting question processing with LangChain', {
      questionPreview:
        question.substring(0, CONTENT_LIMITS.FIFTY_LIMIT) +
        (question.length > CONTENT_LIMITS.FIFTY_LIMIT ? '...' : ''),
      hasContext: !!context,
      aiProvider: 'LangChain + OpenAI',
    });
    logger.debug('OpenAI configuration check', {
      hasApiKey: !!config.ai.openai.apiKey,
      apiKeyLength: config.ai.openai.apiKey ? config.ai.openai.apiKey.length : 0,
      apiKeyPreview: config.ai.openai.apiKey
        ? `${config.ai.openai.apiKey.substring(0, CONTENT_LIMITS.TEN_LIMIT)}...`
        : 'none',
      envVarExists: !!process.env.OPENAI_API_KEY,
      envVarLength: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0,
    });
    if (!config.ai.openai.apiKey) {
      logger.warn('OpenAI API key not configured, falling back to placeholder');
      return await generatePlaceholderAnswer(question, context);
    }
    try {
      const { generateAnswer: langchainGenerateAnswer, isConfigured } = await import(
        '../services/langchain'
      );
      if (!isConfigured()) {
        logWarn('LangChain service not properly configured, falling back to placeholder');
        return await generatePlaceholderAnswer(question, context);
      }
      logInfo('Generating answer with LangChain + OpenAI', {
        model: config.ai.openai.model,
        temperature: config.ai.openai.temperature,
        maxTokens: config.ai.openai.maxTokens,
      });
      const answer = await langchainGenerateAnswer(question, context);
      logDebug('LangChain question processing completed', {
        answerLength: answer.length,
      });
      return answer;
    } catch (langChainError) {
      logError('LangChain service error, falling back to placeholder', langChainError);
      return await generatePlaceholderAnswer(question, context);
    }
  } catch (error) {
    logError('Question processing failed', error);
    return config.qa.defaultResponse;
  }
}

async function generatePlaceholderAnswer(question: string, context?: string): Promise<string> {
  await randomDelay(CONTENT_LIMITS.PREVIEW_LENGTH, TIMEOUTS.QUERY_TIMEOUT_MS);
  const questionLower = question.toLowerCase();
  if (questionLower.includes('lambda') || questionLower.includes('aws')) {
    return `Regarding AWS Lambda: AWS Lambda is a serverless compute service that lets you run code without provisioning or managing servers. Your question "${question}" touches on serverless architecture.`;
  }
  if (questionLower.includes('typescript') || questionLower.includes('javascript')) {
    return `About TypeScript/JavaScript: These are powerful programming languages for modern web development. Your question "${question}" relates to web technologies.`;
  }
  if (questionLower.includes('api') || questionLower.includes('rest')) {
    return `Regarding APIs: RESTful APIs are a architectural style for designing web services. Your question "${question}" is about API development.`;
  }
  let answer = `You asked: "${question}".`;
  if (context) {
    answer += ` Based on the provided context: "${context}",`;
  }
  answer += ` This is an enhanced placeholder response from your AI QA agent. The system is ready for integration with actual AI services like OpenAI, AWS Bedrock, or other AI providers.`;
  return answer;
}

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { 
  createSuccessResponse, 
  createValidationErrorResponse, 
  parseJsonBody, 
  addResponseMetadata 
} from '../utils/response.js';
import { validateQARequest, sanitizeInput, isValidationError } from '../utils/validation.js';
import { QARequest, QAResponse, HttpStatusCode } from '../types/index.js';
import { config } from '../config/index.js';
import { logDebug, logger, logInfo, logWarn, logError } from '../utils/logger.js';

/**
 * Question & Answer handler
 * POST /qa or POST /
 */
export async function qaHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  logDebug('QA request received');

  try {
    // Parse and validate request body
    const body = parseJsonBody<QARequest>(event.body);
    const validatedRequest = validateQARequest(body);

    logInfo('Processing QA request', {
      questionLength: validatedRequest.question.length,
      hasContext: !!validatedRequest.context,
    });

    // Sanitize inputs to prevent injection attacks
    const sanitizedQuestion = sanitizeInput(validatedRequest.question);
    const sanitizedContext = validatedRequest.context 
      ? sanitizeInput(validatedRequest.context) 
      : undefined;

    // Process the question and generate answer
    const answer = await processQuestion(sanitizedQuestion, sanitizedContext, context);

    // Prepare response
    const qaResponse: Omit<QAResponse, 'timestamp' | 'requestId'> = {
      question: sanitizedQuestion,
      answer,
      context: sanitizedContext || null,
    };

    const response = addResponseMetadata(qaResponse, context);

    logInfo('QA response generated', {
      answerLength: answer.length,
      processingTime: 'N/A', // TODO: Add timing
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

/**
 * Processes a question and generates an answer using LangChain
 */
async function processQuestion(
  question: string,
  context?: string,
  lambdaContext?: Context
): Promise<string> {
  try {
    logDebug('Starting question processing with LangChain', {
      questionPreview: question.substring(0, 50) + (question.length > 50 ? '...' : ''),
      hasContext: !!context,
      aiProvider: 'LangChain + OpenAI',
    });

    // Check if OpenAI API key is configured
    logger.debug('OpenAI configuration check', {
      hasApiKey: !!config.ai.openai.apiKey,
      apiKeyLength: config.ai.openai.apiKey ? config.ai.openai.apiKey.length : 0,
      apiKeyPreview: config.ai.openai.apiKey ? `${config.ai.openai.apiKey.substring(0, 10)}...` : 'none',
      envVarExists: !!process.env.OPENAI_API_KEY,
      envVarLength: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0,
    });

    if (!config.ai.openai.apiKey) {
      logger.warn('OpenAI API key not configured, falling back to placeholder');
      return await generatePlaceholderAnswer(question, context);
    }

    try {
      // Import and use LangChain functions
      const { generateAnswer: langchainGenerateAnswer, isConfigured } = await import('../services/langchain.js');

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
    
    // Final fallback to default response
    return config.qa.defaultResponse;
  }
}

/**
 * Generates a more sophisticated placeholder answer
 * TODO: Replace with actual AI integration
 */
async function generatePlaceholderAnswer(question: string, context?: string): Promise<string> {
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

  const questionLower = question.toLowerCase();
  
  // Simple keyword-based responses for demo purposes
  if (questionLower.includes('lambda') || questionLower.includes('aws')) {
    return `Regarding AWS Lambda: AWS Lambda is a serverless compute service that lets you run code without provisioning or managing servers. Your question "${question}" touches on serverless architecture.`;
  }
  
  if (questionLower.includes('typescript') || questionLower.includes('javascript')) {
    return `About TypeScript/JavaScript: These are powerful programming languages for modern web development. Your question "${question}" relates to web technologies.`;
  }
  
  if (questionLower.includes('api') || questionLower.includes('rest')) {
    return `Regarding APIs: RESTful APIs are a architectural style for designing web services. Your question "${question}" is about API development.`;
  }

  // Default enhanced response with context awareness
  let answer = `You asked: "${question}".`;
  
  if (context) {
    answer += ` Based on the provided context: "${context}",`;
  }
  
  answer += ` This is an enhanced placeholder response from your AI QA agent. The system is ready for integration with actual AI services like OpenAI, AWS Bedrock, or other AI providers.`;
  
  return answer;
}

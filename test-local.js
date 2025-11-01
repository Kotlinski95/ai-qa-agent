import { handler } from './dist/index.js';

// Mock API Gateway event for testing
const mockEvent = {
  httpMethod: 'POST',
  path: '/qa',
  headers: {
    'Content-Type': 'application/json',
  },
  queryStringParameters: null,
  pathParameters: null,
  body: JSON.stringify({
    question: 'What is AWS Lambda?',
    context: 'AWS Lambda is a serverless computing service'
  }),
  isBase64Encoded: false,
  requestContext: {
    requestId: 'test-request-id',
    stage: 'test',
    httpMethod: 'POST',
    path: '/qa',
    accountId: '123456789012',
    resourceId: 'test-resource',
    resourcePath: '/qa'
  }
};

// Mock Lambda context
const mockContext = {
  awsRequestId: 'test-request-id',
  functionName: 'ai-qa-agent',
  functionVersion: '$LATEST',
  memoryLimitInMB: '512',
  getRemainingTimeInMillis: () => 30000,
};

// Test the function
async function testFunction() {
  console.log('🧪 Testing Lambda Function...\n');
  
  try {
    const result = await handler(mockEvent, mockContext);
    console.log('✅ Function executed successfully!');
    console.log('📤 Response:');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('❌ Function failed:');
    console.error(error);
  }
}

testFunction();

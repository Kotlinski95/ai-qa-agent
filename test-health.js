import { handler } from './dist/index.js';

// Mock health check event
const healthCheckEvent = {
  httpMethod: 'GET',
  path: '/health',
  headers: {
    'Accept': 'application/json',
  },
  queryStringParameters: null,
  pathParameters: null,
  body: null,
  isBase64Encoded: false,
  requestContext: {
    requestId: 'health-check-id',
    stage: 'test',
    httpMethod: 'GET',
    path: '/health',
    accountId: '123456789012',
    resourceId: 'test-resource',
    resourcePath: '/health'
  }
};

const mockContext = {
  awsRequestId: 'health-check-id',
  functionName: 'ai-qa-agent',
  functionVersion: '$LATEST',
  memoryLimitInMB: '512',
  getRemainingTimeInMillis: () => 30000,
};

async function testHealthCheck() {
  console.log('🏥 Testing Health Check Endpoint...\n');
  
  try {
    const result = await handler(healthCheckEvent, mockContext);
    console.log('✅ Health check passed!');
    console.log('📤 Response:');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('❌ Health check failed:');
    console.error(error);
  }
}

testHealthCheck();

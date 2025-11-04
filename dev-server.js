import dotenv from 'dotenv';
import { handler } from './dist/index.js';
import http from 'http';
import url from 'url';

// Load environment variables from .env file
dotenv.config();

// Configuration checking and display
function checkConfiguration() {
  console.log('\n🔍 Configuration Status:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // Check dotenv loading
  const envVarsCount = Object.keys(process.env).filter(key => 
    key.startsWith('OPENAI_') || 
    key.startsWith('LOG_') || 
    key.startsWith('NODE_ENV')
  ).length;
  console.log(`📁 Environment variables loaded: ${envVarsCount}`);
  
  // Check OpenAI API Key
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    const isValidFormat = apiKey.startsWith('sk-');
    const keyLength = apiKey.length;
    console.log(`🔑 OPENAI_API_KEY: ${isValidFormat ? '✅' : '❌'} ${isValidFormat ? 'Valid format' : 'Invalid format'}`);
    console.log(`   - Length: ${keyLength} characters`);
    console.log(`   - Starts with 'sk-': ${isValidFormat}`);
    console.log(`   - Preview: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}`);
  } else {
    console.log('🔑 OPENAI_API_KEY: ❌ Not found');
  }
  
  // Check other important env vars
  console.log(`🤖 OPENAI_MODEL: ${process.env.OPENAI_MODEL || 'default (gpt-4o-mini)'}`);
  console.log(`🌡️  OPENAI_TEMPERATURE: ${process.env.OPENAI_TEMPERATURE || 'default (0.7)'}`);
  console.log(`📝 LOG_LEVEL: ${process.env.LOG_LEVEL || 'default (info)'}`);
  console.log(`🏠 NODE_ENV: ${process.env.NODE_ENV || 'default (development)'}`);
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  return !!apiKey && apiKey.startsWith('sk-');
}

const PORT = 3000;

// Function to convert HTTP request to API Gateway event format
function httpToApiGatewayEvent(req, body) {
  const parsedUrl = url.parse(req.url, true);
  
  return {
    httpMethod: req.method,
    path: parsedUrl.pathname,
    headers: req.headers,
    queryStringParameters: Object.keys(parsedUrl.query).length > 0 ? parsedUrl.query : null,
    pathParameters: null,
    body: body || null,
    isBase64Encoded: false,
    requestContext: {
      requestId: `req-${Date.now()}`,
      stage: 'local',
      httpMethod: req.method,
      path: parsedUrl.pathname,
      accountId: '123456789012',
      resourceId: 'local-resource',
      resourcePath: parsedUrl.pathname
    }
  };
}

// Mock Lambda context
function createMockContext() {
  return {
    awsRequestId: `ctx-${Date.now()}`,
    functionName: 'ai-qa-agent-local',
    functionVersion: '$LATEST',
    memoryLimitInMB: '512',
    getRemainingTimeInMillis: () => 30000,
  };
}

const server = http.createServer(async (req, res) => {
  console.log(`📨 ${req.method} ${req.url}`);
  
  // Enable CORS for all requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  try {
    let body = '';
    
    // Collect request body for POST requests
    if (req.method === 'POST' || req.method === 'PUT') {
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', async () => {
        await processRequest(req, res, body);
      });
    } else {
      await processRequest(req, res, body);
    }
  } catch (error) {
    console.error('❌ Server error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

async function processRequest(req, res, body) {
  try {
    const parsedUrl = url.parse(req.url, true);
    
    // Handle Server-Sent Events for streaming
    if (parsedUrl.pathname === '/qa/stream' && req.method === 'GET') {
      await handleStreamingRequest(req, res, parsedUrl.query);
      return;
    }

    // Handle LangGraph Agent streaming with SSE
    if (parsedUrl.pathname === '/agent/stream') {
      await handleAgentStreamingRequest(req, res, body, parsedUrl.query);
      return;
    }
    
    // Convert HTTP request to API Gateway event
    const event = httpToApiGatewayEvent(req, body);
    const context = createMockContext();
    
    // Call the Lambda handler
    const result = await handler(event, context);
    
    // Send response with Content-Length and explicit Connection: close for Postman compatibility
    const headers = {
      ...result.headers,
      'Content-Length': Buffer.byteLength(result.body),
      'Connection': 'close'
    };
    res.writeHead(result.statusCode, headers);
    res.end(result.body);
    
    console.log(`✅ ${result.statusCode} - ${req.method} ${req.url}`);
  } catch (error) {
    console.error('❌ Handler error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Lambda handler error',
      message: error.message 
    }));
  }
}

// Handle LangGraph Agent streaming with SSE
async function handleAgentStreamingRequest(req, res, body, queryParams) {
  try {
    const { sanitizeString } = await import('./dist/utils/sanitizers.js');
    const { createSessionAgent } = await import('./dist/services/langgraph-agent.js');
    
    // Extract parameters
    let question;
    let sessionId;

    if (req.method === 'GET') {
      question = sanitizeString((queryParams && queryParams.question) || '');
      sessionId = sanitizeString((queryParams && queryParams.sessionId) || `session-${Date.now()}`);
    } else {
      const bodyObj = body ? JSON.parse(body) : {};
      question = sanitizeString(bodyObj.question || '');
      sessionId = sanitizeString(bodyObj.sessionId || `session-${Date.now()}`);
    }

    if (!question) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Question is required' }));
      return;
    }

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });

    console.log(`🔄 Starting agent SSE stream for: ${question.substring(0, 50)}...`);

    // Send initial event
    res.write(`data: ${JSON.stringify({
      type: 'start',
      sessionId,
      question,
      timestamp: new Date().toISOString()
    })}\n\n`);

    // Monitor connection
    const connectionClosed = { value: false };
    
    req.on('close', () => {
      console.log('🔌 Agent SSE client disconnected');
      connectionClosed.value = true;
    });

    req.on('error', (error) => {
      console.error('❌ Agent SSE connection error:', error);
      connectionClosed.value = true;
    });

    try {
      // Get or create agent session
      const agent = createSessionAgent(sessionId);
      
      let chunkIndex = 0;
      let fullAnswer = '';
      const chunks = [];

      // Stream chunks
      for await (const chunk of agent.askStream(question)) {
        if (connectionClosed.value) {
          console.log('🛑 Client disconnected, stopping agent stream');
          break;
        }

        chunks.push(chunk);
        fullAnswer += chunk;
        
        try {
          res.write(`data: ${JSON.stringify({
            type: 'chunk',
            index: chunkIndex,
            chunk,
            progress: Math.round(((chunkIndex + 1) / 155) * 100), // Estimate based on typical chunks
          })}\n\n`);
          
          chunkIndex++;
          
          // Small delay to make streaming visible
          await new Promise(resolve => setTimeout(resolve, 30));
        } catch (writeError) {
          console.error('❌ Failed to write agent SSE chunk:', writeError);
          connectionClosed.value = true;
          break;
        }
      }

      // Send completion event if connection still open
      if (!connectionClosed.value) {
        try {
          res.write(`data: ${JSON.stringify({
            type: 'complete',
            sessionId,
            answer: fullAnswer,
            totalChunks: chunks.length,
            totalLength: fullAnswer.length,
            timestamp: new Date().toISOString()
          })}\n\n`);
          
          res.write('event: done\ndata: null\n\n');

          console.log(`✅ Agent SSE stream completed - ${chunks.length} chunks`);
        } catch (endError) {
          console.error('❌ Failed to send agent completion:', endError);
        }
      } else {
        console.log('🔌 Agent stream ended due to client disconnect');
      }

    } catch (error) {
      console.error('❌ Agent streaming error:', error);
      if (!connectionClosed.value) {
        try {
          res.write(`data: ${JSON.stringify({
            type: 'error',
            error: error.message || 'Agent streaming failed'
          })}\n\n`);
        } catch (writeError) {
          console.error('❌ Failed to send agent error message:', writeError);
        }
      }
    }

    // End response if still open
    if (!connectionClosed.value) {
      res.end();
    }

  } catch (error) {
    console.error('❌ Agent SSE setup error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Agent streaming setup failed' }));
  }
}

// Handle true streaming with Server-Sent Events for dev server
async function handleStreamingRequest(req, res, queryParams) {
  try {
    const { validateQARequest, sanitizeInput } = await import('./dist/utils/validation.js');
    const { config } = await import('./dist/config/index.js');
    
    // Extract parameters from query string
    const question = queryParams.question;
    const context = queryParams.context;
    
    if (!question) {
      throw new Error('Question parameter is required');
    }
    
    // Validate request
    const requestData = { question, context: context || undefined };
    const validatedRequest = validateQARequest(requestData);
    const sanitizedQuestion = sanitizeInput(validatedRequest.question);
    const sanitizedContext = validatedRequest.context 
      ? sanitizeInput(validatedRequest.context) 
      : undefined;

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
    });

    console.log(`🔄 Starting SSE stream for: ${sanitizedQuestion.substring(0, 50)}...`);

    // Send initial metadata
    res.write(`data: ${JSON.stringify({
      type: 'start',
      question: sanitizedQuestion,
      timestamp: new Date().toISOString()
    })}\n\n`);

    // Set up connection monitoring
    const connectionClosed = { value: false };
    
    req.on('close', () => {
      console.log('🔌 SSE client disconnected');
      connectionClosed.value = true;
    });

    req.on('error', (error) => {
      console.error('❌ SSE connection error:', error);
      connectionClosed.value = true;
    });

    if (!config.ai.openai.apiKey) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: 'OpenAI API key not configured'
      })}\n\n`);
      res.end();
      return;
    }

    try {
      const { generateAnswerStream } = await import('./dist/services/langchain.js');
      
      let fullResponse = '';
      let chunkCount = 0;
      
      for await (const chunk of generateAnswerStream(sanitizedQuestion, sanitizedContext)) {
        // Check if client disconnected
        if (connectionClosed.value) {
          console.log('🛑 Client disconnected, stopping SSE stream');
          break;
        }
        
        fullResponse += chunk;
        chunkCount++;
        
        // Send chunk
        try {
          res.write(`data: ${JSON.stringify({
            type: 'chunk',
            content: chunk,
            chunkIndex: chunkCount
          })}\n\n`);
          
          // Small delay to make streaming visible and prevent client timeout
          await new Promise(resolve => setTimeout(resolve, 30));
        } catch (writeError) {
          console.error('❌ Failed to write SSE chunk:', writeError);
          connectionClosed.value = true;
          break;
        }
      }

      // Send completion only if connection is still open
      if (!connectionClosed.value) {
        try {
          res.write(`data: ${JSON.stringify({
            type: 'complete',
            fullResponse,
            totalChunks: chunkCount,
            timestamp: new Date().toISOString()
          })}\n\n`);

          console.log(`✅ SSE stream completed - ${chunkCount} chunks`);
        } catch (endError) {
          console.error('❌ Failed to send completion message:', endError);
        }
      } else {
        console.log('🔌 SSE stream ended due to client disconnect');
      }

    } catch (error) {
      console.error('❌ Streaming error:', error);
      if (!connectionClosed.value) {
        try {
          res.write(`data: ${JSON.stringify({
            type: 'error',
            error: error.message || 'Streaming failed'
          })}\n\n`);
        } catch (writeError) {
          console.error('❌ Failed to send error message:', writeError);
        }
      }
    }

    // Only end response if connection is still open
    if (!connectionClosed.value) {
      res.end();
    }

  } catch (error) {
    console.error('❌ SSE setup error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Streaming setup failed' }));
  }
}

server.listen(PORT, () => {
  // Check configuration status
  const isConfigured = checkConfiguration();
  
  console.log(`\n🚀 Lambda test server running on http://localhost:${PORT}`);
  console.log(`\n📋 Available endpoints:`);
  console.log(`   GET  http://localhost:${PORT}/health - Health check`);
  console.log(`   POST http://localhost:${PORT}/qa/stream - Ask a question (streaming SSE)`);
  console.log(`   POST http://localhost:${PORT}/qa - Ask a question`);
  console.log(`   POST http://localhost:${PORT}/ - Ask a question (root)`);
  console.log(`\n🤖 LangGraph Agent Endpoints:`);
  console.log(`   POST http://localhost:${PORT}/agent/chat - Chat with agent`);
  console.log(`   POST http://localhost:${PORT}/agent/stream - Stream responses from agent`);
  console.log(`   GET  http://localhost:${PORT}/agent/history - Get conversation history`);
  console.log(`   DEL  http://localhost:${PORT}/agent/session/:sessionId - Clear session`);
  console.log(`\n📚 Import the Postman collection: postman-collection.json`);
  console.log(`🌐 Web interfaces:`);
  console.log(`   http://localhost:${PORT}/index.html - Classic QA interface`);
  console.log(`   http://localhost:${PORT}/agent-interface.html - LangGraph Agent interface`);
  
  if (isConfigured) {
    console.log(`\n✅ OpenAI integration: READY`);
    console.log(`   Your questions will be answered by OpenAI GPT models`);
  } else {
    console.log(`\n⚠️  OpenAI integration: NOT CONFIGURED`);
    console.log(`   Add OPENAI_API_KEY to .env file to enable AI responses`);
    console.log(`   Currently using placeholder responses`);
  }
  
  console.log(`\n🛑 Press Ctrl+C to stop the server`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down server...');
  server.close(() => {
    console.log('✅ Server stopped');
    process.exit(0);
  });
});

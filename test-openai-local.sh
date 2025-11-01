#!/bin/bash

echo "🧪 Testing OpenAI integration locally..."

# Start the server in background
echo "🚀 Starting local server..."
npm run start:local &
SERVER_PID=$!

# Wait for server to start
echo "⏳ Waiting for server to initialize..."
sleep 5

echo ""
echo "1. 🏥 Testing Health Endpoint..."
curl -s http://localhost:3000/health | jq '.'

echo ""
echo ""
echo "2. 🤖 Testing QA with OpenAI (simple question)..."
curl -s -X POST http://localhost:3000/qa \
  -H "Content-Type: application/json" \
  -d '{"question": "What is artificial intelligence?"}' | jq '.'

echo ""
echo ""
echo "3. 🧠 Testing QA with context..."
curl -s -X POST http://localhost:3000/qa \
  -H "Content-Type: application/json" \
  -d '{
    "question": "How does it learn?",
    "context": "Machine learning is a subset of AI that uses algorithms to learn from data."
  }' | jq '.'

echo ""
echo "🛑 Stopping server..."
kill $SERVER_PID 2>/dev/null || true
sleep 2

echo "✅ Testing completed!"

#!/bin/bash

# Content Refresh Deployment Script
# This script deploys the enhanced AI QA Agent with scheduled content refresh

set -e  # Exit on any error

echo "🚀 Deploying AI QA Agent with Scheduled Content Refresh..."
echo "=================================================="

# Change to project root directory
cd "$(dirname "$0")/.."

# Load environment variables from .env file
if [ -f .env ]; then
    echo "📋 Loading API keys from .env file..."
    source .env
else
    echo "❌ .env file not found! Please create one with your API keys."
    exit 1
fi

# Validate required environment variables
if [ -z "$OPENAI_API_KEY" ]; then
    echo "❌ OPENAI_API_KEY not found in .env file"
    exit 1
fi

if [ -z "$PINECONE_API_KEY" ]; then
    echo "❌ PINECONE_API_KEY not found in .env file"
    exit 1
fi

# Build the TypeScript code
echo "📦 Building TypeScript..."
npm run build

# Validate SAM template
echo "✅ Validating SAM template..."
sam validate

# Build SAM application
echo "🏗️  Building SAM application..."
sam build

# Deploy the application with API keys from environment
echo "🚀 Deploying to AWS..."
sam deploy \
    --parameter-overrides \
    OpenAIApiKey="$OPENAI_API_KEY" \
    PineconeApiKey="$PINECONE_API_KEY"

echo ""
echo "✅ Deployment Complete!"
echo "=================================================="
echo ""
echo "📋 What was deployed:"
echo "   1. Main AI QA Agent Lambda (HTTP API)"
echo "   2. Streaming Response Lambda (Function URL)"
echo "   3. Content Refresh Lambda (Scheduled)"
echo ""
echo "⏰ Scheduled Jobs:"
echo "   • Daily refresh: Every day at 2 AM UTC"
echo "   • Weekly full refresh: Every Sunday at 1 AM UTC"
echo ""
echo "🎯 Benefits:"
echo "   • Faster response times (no real-time fetching)"
echo "   • Lower Lambda costs"
echo "   • Always fresh content"
echo "   • Better user experience"
echo ""
echo "🔧 Manual trigger (if needed):"
echo "   aws lambda invoke --function-name ai-qa-agent-content-refresh \\"
echo "     --payload '{\"forceRefresh\": true}' \\"
echo "     response.json"
echo ""
echo "📊 Monitor logs:"
echo "   aws logs tail /aws/lambda/ai-qa-agent-content-refresh --follow"
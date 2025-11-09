#!/bin/bash

# Manual Content Refresh Trigger
# Use this to manually trigger content refresh for testing

echo "🔄 Manually triggering content refresh..."

# Change to project root directory
cd "$(dirname "$0")/.."

# Check if AWS CLI is configured
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS CLI not configured. Please run 'aws configure' first."
    exit 1
fi

# Get the function name (adjust if needed)
FUNCTION_NAME="ai-qa-agent-content-refresh"

echo "📋 Triggering function: $FUNCTION_NAME"

# Trigger with different configurations
case "${1:-daily}" in
    "daily")
        echo "⏰ Running daily refresh (incremental)..."
        PAYLOAD='{"forceRefresh": false, "batchSize": 5, "delayBetweenBatches": 2000}'
        ;;
    "weekly")
        echo "🔄 Running weekly refresh (full refresh)..."
        PAYLOAD='{"forceRefresh": true, "batchSize": 3, "delayBetweenBatches": 3000}'
        ;;
    "fast")
        echo "⚡ Running fast refresh (for testing)..."
        PAYLOAD='{"forceRefresh": false, "batchSize": 10, "delayBetweenBatches": 1000}'
        ;;
    *)
        echo "Usage: $0 [daily|weekly|fast]"
        echo "  daily  - Incremental refresh (default)"
        echo "  weekly - Full refresh"
        echo "  fast   - Fast refresh for testing"
        exit 1
        ;;
esac

# Invoke the function
echo "🚀 Invoking Lambda function..."
aws lambda invoke \
    --function-name "$FUNCTION_NAME" \
    --payload "$PAYLOAD" \
    --cli-binary-format raw-in-base64-out \
    response.json

# Check if invoke was successful
if [ $? -eq 0 ]; then
    echo "✅ Function invoked successfully!"
    echo "📋 Response:"
    cat response.json | jq '.' 2>/dev/null || cat response.json
    echo ""
    echo "📊 To monitor logs:"
    echo "aws logs tail /aws/lambda/$FUNCTION_NAME --follow"
else
    echo "❌ Function invocation failed!"
    exit 1
fi

# Clean up
rm -f response.json
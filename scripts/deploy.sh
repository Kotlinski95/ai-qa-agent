#!/bin/bash

# AI QA Agent Deployment Script
# This script helps deploy your Lambda functions to AWS

set -e  # Exit on any error

echo "🚀 AI QA Agent Deployment Script"
echo "=================================="
echo ""

# Change to project root directory
cd "$(dirname "$0")/.."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if SAM CLI is installed
if ! command -v sam &> /dev/null; then
    echo -e "${RED}❌ SAM CLI is not installed${NC}"
    echo ""
    echo "Please install SAM CLI:"
    echo "  macOS:   brew install aws-sam-cli"
    echo "  Linux:   pip install aws-sam-cli"
    echo "  Windows: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html"
    exit 1
fi

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ AWS CLI is not installed${NC}"
    echo ""
    echo "Please install AWS CLI:"
    echo "  https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
    exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}❌ AWS credentials not configured${NC}"
    echo ""
    echo "Please configure AWS credentials:"
    echo "  aws configure"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites check passed${NC}"
echo ""

# Build the project
echo -e "${BLUE}📦 Building TypeScript...${NC}"
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build successful${NC}"
echo ""

# Validate template
echo -e "${BLUE}🔍 Validating SAM template...${NC}"
sam validate

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Template validation failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Template is valid${NC}"
echo ""

# Check for API keys configuration
echo -e "${BLUE}🔑 Checking API key configuration...${NC}"

if [ -f samconfig.toml ]; then
    # Check if samconfig.toml has parameter_overrides
    if grep -q "parameter_overrides.*OpenAIApiKey" samconfig.toml; then
        echo -e "${GREEN}✅ API keys found in samconfig.toml${NC}"
        echo -e "${BLUE}   Using keys from samconfig.toml${NC}"
    else
        echo -e "${YELLOW}⚠️  No API keys in samconfig.toml${NC}"
        echo ""
        echo "Please add your API keys to samconfig.toml:"
        echo ""
        echo "parameter_overrides = \"OpenAIApiKey=\\\"sk-proj-YOUR-KEY\\\" PineconeApiKey=\\\"pcsk-YOUR-KEY\\\"\""
        echo ""
        read -p "Do you want to continue with default placeholders? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
else
    echo -e "${YELLOW}⚠️  samconfig.toml not found${NC}"
fi

echo ""

# Check if this is first deployment
if [ ! -f samconfig.toml ] || ! grep -q "stack_name" samconfig.toml; then
    echo -e "${YELLOW}📝 First time deployment detected${NC}"
    echo ""
    echo -e "${YELLOW}⚠️  IMPORTANT: You'll need to provide API keys!${NC}"
    echo ""
    echo "After guided deployment, update samconfig.toml with:"
    echo "parameter_overrides = \"OpenAIApiKey=\\\"sk-proj-YOUR-KEY\\\" PineconeApiKey=\\\"pcsk-YOUR-KEY\\\"\""
    echo ""
    read -p "Press Enter to continue with guided deployment..."
    sam deploy --guided
else
    echo -e "${BLUE}🚢 Deploying to AWS...${NC}"
    echo ""
    
    # Use samconfig.toml which contains the API keys
    sam deploy
fi

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Deployment failed${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ Deployment successful!${NC}"
echo ""

# Get outputs
echo -e "${BLUE}📋 Deployment Outputs:${NC}"
echo "===================="
aws cloudformation describe-stacks \
  --stack-name ai-qa-agent \
  --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue,Description]' \
  --output table

echo ""

# Verify API keys are set
echo -e "${BLUE}🔑 Verifying API key configuration...${NC}"
OPENAI_KEY=$(aws lambda get-function-configuration \
  --function-name ai-qa-agent \
  --query 'Environment.Variables.OPENAI_API_KEY' \
  --output text 2>/dev/null || echo "")

if [ -n "$OPENAI_KEY" ] && [ "$OPENAI_KEY" != "REPLACE_WITH_YOUR_OPENAI_KEY" ]; then
    echo -e "${GREEN}✅ OpenAI API Key is configured (${#OPENAI_KEY} characters)${NC}"
else
    echo -e "${RED}❌ OpenAI API Key not configured or using placeholder!${NC}"
    echo ""
    echo "Please update your API keys:"
    echo "1. Edit samconfig.toml and add your real API keys"
    echo "2. Run: ./deploy.sh again"
    echo ""
fi

echo ""
echo -e "${YELLOW}📝 Next Steps:${NC}"
echo "1. Test the health endpoint:"
echo "   curl https://juk6ern7gb.execute-api.us-east-1.amazonaws.com/health"
echo ""
echo "2. Update src/demo/agent-interface.html production config"
echo "   (URLs are shown in the outputs above)"
echo ""
echo "3. If API keys are not set, update samconfig.toml and redeploy"
echo ""
echo -e "${GREEN}🎉 Done!${NC}"

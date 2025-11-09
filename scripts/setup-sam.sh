#!/bin/bash

# AWS SAM CLI Setup Script for macOS
# Lightweight installation without Xcode (only ~100MB vs 20GB!)

set -e  # Exit on any error

echo "🔧 AWS SAM CLI Setup for macOS (Lightweight)"
echo "=============================================="
echo ""

# Change to project root directory
cd "$(dirname "$0")/.."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}ℹ️  This script uses pip3 to avoid the 20GB Xcode requirement${NC}"
echo ""

# Check if Python3 is installed
echo -e "${BLUE}Checking for Python3...${NC}"
if ! command -v python3 &> /dev/null; then
    echo -e "${YELLOW}⚠️  Python3 not found${NC}"
    echo ""
    
    # Check if Homebrew is installed
    if ! command -v brew &> /dev/null; then
        echo "Installing Homebrew first..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi
    
    echo "Installing Python3 (lightweight, ~50MB)..."
    brew install python3
else
    echo -e "${GREEN}✅ Python3 already installed${NC}"
    echo "Version: $(python3 --version)"
fi

echo ""

# Install AWS SAM CLI via pip3 (NO XCODE NEEDED!)
echo -e "${BLUE}Installing AWS SAM CLI via pip3...${NC}"
if command -v sam &> /dev/null; then
    echo -e "${YELLOW}⚠️  SAM CLI already installed${NC}"
    echo "Current version: $(sam --version)"
    echo ""
    read -p "Update to latest version? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        pip3 install --upgrade aws-sam-cli
    fi
else
    echo "Installing SAM CLI via pip3 (no Xcode needed, ~100MB)..."
    pip3 install aws-sam-cli
    
    echo -e "${GREEN}✅ SAM CLI installed successfully!${NC}"
fi

echo ""

# Verify installation
echo -e "${BLUE}Verifying SAM CLI installation...${NC}"
if command -v sam &> /dev/null; then
    echo -e "${GREEN}✅ SAM CLI installed successfully!${NC}"
    echo ""
    echo "Version: $(sam --version)"
else
    echo -e "${RED}❌ SAM CLI installation failed${NC}"
    exit 1
fi

echo ""

# Check if AWS CLI is installed
echo -e "${BLUE}Checking for AWS CLI...${NC}"
if ! command -v aws &> /dev/null; then
    echo -e "${YELLOW}⚠️  AWS CLI not found${NC}"
    echo ""
    read -p "Install AWS CLI? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        brew install awscli
        echo -e "${GREEN}✅ AWS CLI installed${NC}"
    else
        echo -e "${YELLOW}⚠️  Skipping AWS CLI installation${NC}"
        echo "Install later with: brew install awscli"
    fi
else
    echo -e "${GREEN}✅ AWS CLI already installed${NC}"
    echo "Version: $(aws --version)"
fi

echo ""
echo -e "${GREEN}🎉 Setup complete!${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Configure AWS credentials:"
echo "   $ aws configure"
echo ""
echo "2. Create AWS Secrets Manager secrets:"
echo "   $ aws secretsmanager create-secret --name ai-qa-agent/openai --secret-string '{\"apiKey\":\"sk-your-key\"}'"
echo "   $ aws secretsmanager create-secret --name ai-qa-agent/pinecone --secret-string '{\"apiKey\":\"your-key\"}'"
echo ""
echo "3. Deploy your Lambda:"
echo "   $ npm run deploy"
echo ""

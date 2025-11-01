# AWS Lambda Environment Variables Setup

This document describes how to configure environment variables for your AI QA Agent Lambda function.

## 🔧 Required Environment Variables

### OpenAI Configuration (Essential)
```
OPENAI_API_KEY=sk-your-actual-openai-api-key-here
OPENAI_MODEL=gpt-4o-mini
OPENAI_TEMPERATURE=0.7
OPENAI_MAX_TOKENS=1500
```

### Application Settings
```
NODE_ENV=production
LOG_LEVEL=info
AWS_REGION=us-east-1
```

## 🚀 Setting Environment Variables in AWS Lambda

### Method 1: AWS Console
1. Open AWS Lambda console
2. Navigate to your `ai-qa-agent` function
3. Go to **Configuration** → **Environment variables**
4. Click **Edit** and add the variables above

### Method 2: AWS CLI
```bash
aws lambda update-function-configuration \
  --function-name ai-qa-agent \
  --environment Variables='{
    "OPENAI_API_KEY":"sk-your-actual-openai-api-key-here",
    "OPENAI_MODEL":"gpt-4o-mini",
    "OPENAI_TEMPERATURE":"0.7",
    "OPENAI_MAX_TOKENS":"1500",
    "NODE_ENV":"production",
    "LOG_LEVEL":"info",
    "AI_SYSTEM_PROMPT":"You are a helpful AI assistant that provides accurate and concise answers to questions."
  }'
```

### Method 3: SAM Template (template.yaml)
```yaml
Environment:
  Variables:
    OPENAI_API_KEY: !Ref OpenAIApiKey
    OPENAI_MODEL: gpt-4o-mini
    OPENAI_TEMPERATURE: "0.7"
    OPENAI_MAX_TOKENS: "1500"
    NODE_ENV: production
    LOG_LEVEL: info
```

### Method 4: Serverless Framework
```yaml
provider:
  environment:
    OPENAI_API_KEY: ${env:OPENAI_API_KEY}
    OPENAI_MODEL: gpt-4o-mini
    OPENAI_TEMPERATURE: "0.7"
    OPENAI_MAX_TOKENS: "1500"
    NODE_ENV: production
```

## 🔐 Security Best Practices

### 1. Use AWS Secrets Manager (Recommended)
Instead of storing the API key as an environment variable:

```bash
# Store secret
aws secretsmanager create-secret \
  --name "ai-qa-agent/openai-api-key" \
  --description "OpenAI API key for AI QA Agent" \
  --secret-string "sk-your-actual-openai-api-key-here"

# Grant Lambda permission to access the secret
aws iam attach-role-policy \
  --role-name your-lambda-execution-role \
  --policy-arn arn:aws:iam::aws:policy/SecretsManagerReadWrite
```

Then update your Lambda code to fetch from Secrets Manager:
```typescript
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const client = new SecretsManagerClient({ region: "us-east-1" });
const response = await client.send(new GetSecretValueCommand({
  SecretId: "ai-qa-agent/openai-api-key"
}));
const apiKey = response.SecretString;
```

### 2. Use Parameter Store
```bash
aws ssm put-parameter \
  --name "/ai-qa-agent/openai-api-key" \
  --value "sk-your-actual-openai-api-key-here" \
  --type "SecureString"
```

## 🧪 Testing Environment Variables

### Local Testing
1. Create `.env` file from template:
   ```bash
   cp .env.template .env
   ```

2. Update `.env` with your actual values:
   ```
   OPENAI_API_KEY=sk-your-actual-openai-api-key-here
   ```

3. Test locally:
   ```bash
   npm run start:local
   ```

### Lambda Testing
Test the health endpoint to verify configuration:
```bash
curl -X GET https://your-api-gateway-url/health
```

Expected response with AI configured:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "ai": {
    "configured": true,
    "provider": "OpenAI (LangChain)",
    "model": "gpt-4o-mini",
    "connected": true
  },
  "timestamp": "2025-11-01T07:00:00.000Z",
  "requestId": "abc-123"
}
```

## 📋 Complete Environment Variables List

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | ✅ | - | Your OpenAI API key |
| `OPENAI_MODEL` | ❌ | `gpt-4o-mini` | OpenAI model to use |
| `OPENAI_TEMPERATURE` | ❌ | `0.7` | Response creativity (0-2) |
| `OPENAI_MAX_TOKENS` | ❌ | `1500` | Maximum response length |
| `OPENAI_TIMEOUT_MS` | ❌ | `30000` | API timeout in milliseconds |
| `AI_SYSTEM_PROMPT` | ❌ | Default prompt | System prompt for AI |
| `NODE_ENV` | ❌ | `development` | Environment type |
| `LOG_LEVEL` | ❌ | `info` | Logging level |
| `MAX_QUESTION_LENGTH` | ❌ | `500` | Max question characters |
| `MAX_CONTEXT_LENGTH` | ❌ | `2000` | Max context characters |

## 🚨 Troubleshooting

### Issue: "OpenAI API key is required"
- Verify `OPENAI_API_KEY` is set in Lambda environment variables
- Ensure the API key starts with `sk-`
- Check CloudWatch logs for detailed error messages

### Issue: "Failed to generate AI response"
- Check your OpenAI API key is valid and has credits
- Verify network connectivity from Lambda
- Check if the model name is correct

### Issue: Health check shows "connected": false
- API key might be invalid or expired
- OpenAI API might be experiencing issues
- Network timeout (check `OPENAI_TIMEOUT_MS`)

## 📊 Monitoring

Monitor your Lambda function using:
- **CloudWatch Logs**: Check function execution logs
- **CloudWatch Metrics**: Monitor invocation count, duration, errors
- **X-Ray Tracing**: Enable for detailed request tracing (optional)

Add these environment variables for enhanced monitoring:
```
ENABLE_REQUEST_LOGGING=true
ENABLE_RESPONSE_LOGGING=true
LOG_LEVEL=debug  # For development only
```

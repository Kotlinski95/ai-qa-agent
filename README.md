# AI QA Agent Lambda Fun```
├── src/
│   ├── index.ts          # Main Lambda handler
│   ├── config/           # Configuration and environment variables
│   ├── handlers/         # Route handlers (health, qa)
│   ├── services/         # LangChain service integration
│   ├── router/           # Request routing
│   ├── utils/            # Utilities (validation, response, logging)
│   └── types/            # TypeScript interfaces
├── dist/                 # Compiled JavaScript output (generated)
├── .env.template         # Environment variables template
├── AWS_ENVIRONMENT_SETUP.md # AWS Lambda setup guide
├── package.json          # Dependencies including LangChain
├── tsconfig.json         # TypeScript configuration
└── postman-collection.json # Postman testing collection
``` TypeScript-based AWS Lambda function for AI-powered question answering using **LangChain.js** and **OpenAI**.

## 🤖 AI Integration

- **LangChain.js**: Modern LLM integration framework
- **OpenAI GPT**: Powered by OpenAI's ChatGPT models (gpt-4o-mini by default)
- **Intelligent Fallbacks**: Graceful degradation to placeholder responses
- **Configurable Models**: Support for different OpenAI models via environment variables

## 🚀 Features

- **TypeScript Support**: Full type safety with AWS Lambda types
- **LangChain Integration**: Professional LLM integration with structured prompts
- **OpenAI ChatGPT**: Real AI responses powered by OpenAI API
- **Error Handling**: Comprehensive error handling and logging with fallbacks
- **CORS Enabled**: Pre-configured for API Gateway integration
- **Environment Variables**: Secure configuration via AWS Lambda environment variables
- **Health Checks**: AI service status monitoring
- **Development Tools**: Build scripts and local testing server

## 📁 Project Structure

```
├── src/
│   └── index.ts          # TypeScript Lambda handler
├── dist/                 # Compiled JavaScript output (generated)
├── package.json          # Dependencies and build scripts
├── tsconfig.json         # TypeScript configuration
└── .gitignore           # Git ignore rules
```

## ⚙️ Configuration

### Required Environment Variables

To use OpenAI integration, you need to set these environment variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | ✅ | - | Your OpenAI API key (starts with `sk-`) |
| `OPENAI_MODEL` | ❌ | `gpt-4o-mini` | OpenAI model to use |
| `OPENAI_TEMPERATURE` | ❌ | `0.7` | Response creativity (0-2) |
| `OPENAI_MAX_TOKENS` | ❌ | `1500` | Maximum response length |

### Setting Environment Variables

**For Local Development:**
```bash
cp .env.template .env
# Edit .env with your OpenAI API key
```

**For AWS Lambda:**
See [AWS_ENVIRONMENT_SETUP.md](./AWS_ENVIRONMENT_SETUP.md) for detailed instructions.

## 🛠️ Setup

### Prerequisites
- Node.js (v18+ recommended)
- npm or yarn
- AWS CLI (for deployment)
- OpenAI API key (for AI features)

### Installation

1. Clone the repository:
   ```bash
   git clone <your-repo-url>
   cd ai-qa-agent
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

## 🔧 Development

### Available Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run watch` - Watch for changes and auto-compile
- `npm run clean` - Remove build artifacts

### Local Development

1. Start watch mode for automatic compilation:
   ```bash
   npm run watch
   ```

2. Edit your code in `src/index.ts`
3. The compiled output will be available in `dist/index.js`

## 🚀 Deployment

### AWS Lambda Deployment

1. Build the project:
   ```bash
   npm run build
   ```

2. Create a deployment package:
   ```bash
   zip -r lambda-deployment.zip dist/ node_modules/ package.json
   ```

3. Deploy using AWS CLI:
   ```bash
   aws lambda update-function-code \
     --function-name ai-qa-agent \
     --zip-file fileb://lambda-deployment.zip
   ```

### Handler Configuration

- **Handler**: `index.handler`
- **Runtime**: Node.js 18.x or later
- **Architecture**: x86_64 or arm64

## 📝 Environment Variables

Configure these environment variables in your Lambda function:

| Variable | Description | Required |
|----------|-------------|----------|
| `LOG_LEVEL` | Logging level (debug, info, warn, error) | No |

## 🏗️ API Gateway Integration

The function is designed to work with API Gateway and returns responses in the expected format:

```json
{
  "statusCode": 200,
  "headers": {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  },
  "body": "{\"message\": \"Response data\"}"
}
```

## 🧪 Testing

### Local Testing

You can test the function locally using the AWS SAM CLI or by creating test events.

Example test event:
```json
{
  "httpMethod": "POST",
  "path": "/qa",
  "headers": {
    "Content-Type": "application/json"
  },
  "body": "{\"question\": \"What is AWS Lambda?\"}"
}
```

## 📚 Technology Stack

- **TypeScript** - Type-safe JavaScript
- **AWS Lambda** - Serverless compute platform
- **Node.js** - JavaScript runtime
- **API Gateway** - REST API management

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -am 'Add your feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Troubleshooting

### Common Issues

1. **TypeScript compilation errors**: Check your `tsconfig.json` configuration
2. **Missing dependencies**: Run `npm install` to ensure all packages are installed
3. **Lambda timeout**: Increase the timeout setting in your Lambda configuration

### Logs

Check CloudWatch logs for runtime errors and debugging information.

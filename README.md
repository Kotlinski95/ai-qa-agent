# AI QA Agent Lambda Function

A TypeScript-based AWS Lambda function for AI-powered question answering.

## 🚀 Features

- **TypeScript Support**: Full type safety with AWS Lambda types
- **Error Handling**: Comprehensive error handling and logging
- **CORS Enabled**: Pre-configured for API Gateway integration
- **Development Tools**: Build scripts and watch mode for development

## 📁 Project Structure

```
├── src/
│   └── index.ts          # TypeScript Lambda handler
├── dist/                 # Compiled JavaScript output (generated)
├── package.json          # Dependencies and build scripts
├── tsconfig.json         # TypeScript configuration
└── .gitignore           # Git ignore rules
```

## 🛠️ Setup

### Prerequisites
- Node.js (v18+ recommended)
- npm or yarn
- AWS CLI (for deployment)

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

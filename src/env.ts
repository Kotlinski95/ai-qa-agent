if (typeof process !== 'undefined' && process.env.AWS_LAMBDA_FUNCTION_NAME === undefined) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef
    const dotenv = require('dotenv');
    const result = dotenv.config();
    if (result.error) {
      console.warn('Warning: Could not load .env file:', result.error.message);
    } else {
      console.log('✅ Environment variables loaded from .env file');
      console.log(`🔑 OPENAI_API_KEY loaded: ${process.env.OPENAI_API_KEY ? 'YES' : 'NO'}`);
    }
  } catch {
    console.log('Note: dotenv not available, using system environment variables');
  }
} else {
  console.log('🔑 Running in AWS Lambda, using system environment variables');
}

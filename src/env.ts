/**
 * Environment initialization
 * This file should be imported first to ensure environment variables are loaded
 */

// Load environment variables for local development
// In AWS Lambda, environment variables are already available
if (typeof process !== 'undefined' && process.env.AWS_LAMBDA_FUNCTION_NAME === undefined) {
  try {
    // Use dynamic import to avoid issues in production
    const dotenv = require('dotenv');
    const result = dotenv.config();
    
    if (result.error) {
      console.warn('Warning: Could not load .env file:', result.error.message);
    } else {
      console.log('✅ Environment variables loaded from .env file');
      console.log(`🔑 OPENAI_API_KEY loaded: ${process.env.OPENAI_API_KEY ? 'YES' : 'NO'}`);
    }
  } catch (error) {
    // dotenv might not be available in production, which is fine
    console.log('Note: dotenv not available, using system environment variables');
  }
} else {
  console.log('🔑 Running in AWS Lambda, using system environment variables');
}

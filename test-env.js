import dotenv from 'dotenv';

console.log('🧪 Testing dotenv integration...\n');

// Load environment variables
const result = dotenv.config();

if (result.error) {
  console.error('❌ Error loading .env file:', result.error);
  process.exit(1);
}

console.log('✅ .env file loaded successfully');
console.log(`📁 Parsed ${Object.keys(result.parsed || {}).length} variables from .env file`);

// Test specific variables
const testVars = [
  'OPENAI_API_KEY',
  'OPENAI_MODEL', 
  'OPENAI_TEMPERATURE',
  'LOG_LEVEL',
  'NODE_ENV'
];

console.log('\n🔍 Environment Variables Check:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

testVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    if (varName === 'OPENAI_API_KEY') {
      const isValid = value.startsWith('sk-') && value.length > 20;
      console.log(`${varName}: ${isValid ? '✅' : '❌'} ${value.substring(0, 10)}...${value.substring(value.length - 4)} (${value.length} chars)`);
    } else {
      console.log(`${varName}: ✅ ${value}`);
    }
  } else {
    console.log(`${varName}: ❌ Not set`);
  }
});

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('\n🎯 Test completed!');

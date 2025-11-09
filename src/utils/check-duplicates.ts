import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';
dotenv.config();
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME || 'client-context';
const PINECONE_NAMESPACE = process.env.PINECONE_NAMESPACE || 'kotlinskidev';
async function checkDuplicates() {
  if (!PINECONE_API_KEY) {
    console.error('❌ PINECONE_API_KEY not found in environment variables');
    process.exit(1);
  }
  console.log('\n🔍 Checking for duplicate URLs in Pinecone...\n');
  console.log(`Index: ${PINECONE_INDEX_NAME}`);
  console.log(`Namespace: ${PINECONE_NAMESPACE}\n`);
  const pinecone = new Pinecone({
    apiKey: PINECONE_API_KEY,
  });
  const index = pinecone.index(PINECONE_INDEX_NAME);
  const stats = await index.describeIndexStats();
  console.log(
    `📊 Total records in namespace: ${stats.namespaces?.[PINECONE_NAMESPACE]?.recordCount || 0}\n`
  );
  console.log("⚠️  Note: Pinecone doesn't provide a direct way to list all vectors.");
  console.log('To check for duplicates, you can:');
  console.log('1. Go to Pinecone console: https://app.pinecone.io/');
  console.log(`2. Select index: ${PINECONE_INDEX_NAME}`);
  console.log(`3. Select namespace: ${PINECONE_NAMESPACE}`);
  console.log('4. Search for a specific URL to see if there are multiple entries\n');
  console.log('✅ With the updated code, new upsert logic will:');
  console.log('   - Delete old entries for a URL before adding new ones');
  console.log('   - Prevent duplicates from being created\n');
}
async function clearAllDuplicates() {
  if (!PINECONE_API_KEY) {
    console.error('❌ PINECONE_API_KEY not found in environment variables');
    process.exit(1);
  }
  console.log('\n🗑️  Clearing ALL vectors from namespace...\n');
  console.log(`Index: ${PINECONE_INDEX_NAME}`);
  console.log(`Namespace: ${PINECONE_NAMESPACE}\n`);
  const pinecone = new Pinecone({
    apiKey: PINECONE_API_KEY,
  });
  const index = pinecone.index(PINECONE_INDEX_NAME);
  try {
    await index.namespace(PINECONE_NAMESPACE).deleteAll();
    console.log('✅ Successfully deleted all vectors from namespace');
    console.log(
      '💡 Next request will fetch fresh data from website and cache without duplicates\n'
    );
  } catch (error) {
    console.error('❌ Failed to clear namespace:', error);
  }
}
const command = process.argv[2];
if (command === 'clear') {
  clearAllDuplicates();
} else if (command === 'check') {
  checkDuplicates();
} else {
  console.log('\n📖 Pinecone Duplicate Management Tool\n');
  console.log('Usage:');
  console.log('  node dist/utils/check-duplicates.js check  - Check for duplicates');
  console.log(
    '  node dist/utils/check-duplicates.js clear  - Clear all vectors (removes duplicates)\n'
  );
  console.log('Examples:');
  console.log('  npm run build && node dist/utils/check-duplicates.js check');
  console.log('  npm run build && node dist/utils/check-duplicates.js clear\n');
}

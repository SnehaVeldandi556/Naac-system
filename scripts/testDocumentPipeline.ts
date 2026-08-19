// scripts/testDocumentPipeline.ts
// Run with: npx tsx scripts/testDocumentPipeline.ts <raw_document_id>

import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

console.log('KEY (first 10 chars):', process.env.GOOGLE_API_KEY?.slice(0, 10));
console.log('KEY length:', process.env.GOOGLE_API_KEY?.length);
import { processRawDocument } from '@/lib/naac/documents/processRawDocument';
import { processDocument } from '@/lib/naac/documents/processDocument';

async function main() {
  const documentId = process.argv[2];

  if (!documentId) {
    console.error('Usage: npx tsx scripts/testDocumentPipeline.ts <raw_document_id>');
    process.exit(1);
  }

  console.log(`Extracting text for ${documentId}...`);
  await processRawDocument(documentId);
  console.log('Extraction done.');

  console.log(`Processing (clean/chunk/validate/embed) for ${documentId}...`);
  await processDocument(documentId);
  console.log('Processing done. Check document_chunks table in Supabase.');
}

main().catch((err) => {
  console.error('Pipeline test failed:', err);
  process.exit(1);
});
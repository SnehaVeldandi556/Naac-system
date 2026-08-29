// scripts/backfillEmbeddings.ts
// Run with: npx tsx scripts/backfillEmbeddings.ts

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { GoogleGenerativeAI, TaskType } from '@google/generative-ai';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_DIM = 768;
const BATCH_SIZE = 50;

async function backfill() {
  console.log('='.repeat(60));
  console.log('NAAC Document Chunks: Vector Embeddings Backfill');
  console.log('='.repeat(60));

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error('Error: GOOGLE_API_KEY is not set in .env.local or .env');
    process.exit(1);
  }

  const supabase = getSupabaseAdminClient();
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: EMBED_MODEL });

  // 1. Fetch chunks with null embeddings
  console.log('\n[1/3] Fetching chunks where embedding IS NULL...');
  const { data: chunks, error: fetchError } = await supabase
    .from('document_chunks')
    .select('id, chunk_index, chunk_text, section_heading')
    .is('embedding', null);

  if (fetchError) {
    console.error('Failed to query document_chunks:', fetchError.message);
    process.exit(1);
  }

  if (!chunks || chunks.length === 0) {
    console.log('✓ All chunks already have vector embeddings! Nothing to backfill.');
    return;
  }

  console.log(`Found ${chunks.length} chunks needing 768-dim vector embeddings.`);

  // 2. Batch embed chunks
  console.log(`\n[2/3] Generating embeddings in batches of ${BATCH_SIZE} (Free Tier optimized)...`);
  let updatedCount = 0;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    console.log(`  Processing batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} chunks)...`);

    try {
      const result = await model.batchEmbedContents({
        requests: batch.map((c) => ({
          model: 'models/gemini-embedding-001',
          content: { role: 'user' as const, parts: [{ text: c.chunk_text || 'empty' }] },
          taskType: TaskType.RETRIEVAL_DOCUMENT,
          outputDimensionality: EMBED_DIM,
        })),
      });

      // 3. Update chunks in Supabase
      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j];
        const vector = result.embeddings[j]?.values;

        if (vector && vector.length === EMBED_DIM) {
          const { error: updateErr } = await supabase
            .from('document_chunks')
            .update({ embedding: vector as unknown as string })
            .eq('id', chunk.id);

          if (updateErr) {
            console.warn(`    Failed to update chunk ${chunk.id}:`, updateErr.message);
          } else {
            updatedCount++;
          }
        }
      }
    } catch (err) {
      console.error(`  Batch embedding failed for range ${i}..${i + batch.length}:`, err);
    }
  }

  console.log('\n[3/3] Backfill Completed!');
  console.log(`Successfully generated and stored embeddings for ${updatedCount} / ${chunks.length} chunks.`);
  console.log('='.repeat(60));
}

backfill().catch((err) => {
  console.error('Fatal backfill error:', err);
  process.exit(1);
});

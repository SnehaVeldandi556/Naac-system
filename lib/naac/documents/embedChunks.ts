// lib/naac/documents/embedChunks.ts
import { GoogleGenerativeAI, TaskType } from '@google/generative-ai';
import type { ValidatedChunk } from './chunkValidator';

const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_DIM = 768; // matches your document_chunks.embedding column
const MAX_BATCH_SIZE = 50; // Optimized for Gemini Free Tier rate & batch limits

export type EmbeddedChunk = ValidatedChunk & {
  embedding: number[] | null;
};

/**
 * Batch-embeds all VALID chunks from one document using optimized batching.
 * Strictly complies with Gemini free tier (batches of 50, outputDimensionality: 768).
 * Invalid chunks pass through with embedding = null, untouched.
 */
export async function embedChunks(chunks: ValidatedChunk[]): Promise<EmbeddedChunk[]> {
  const validChunks = chunks.filter((c) => c.is_valid);
  const invalidChunks = chunks.filter((c) => !c.is_valid);

  if (validChunks.length === 0) {
    return invalidChunks.map((c) => ({ ...c, embedding: null }));
  }

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.warn('GOOGLE_API_KEY not configured — saving chunks with embedding: null');
    return [...validChunks, ...invalidChunks].map((c) => ({ ...c, embedding: null }));
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: EMBED_MODEL });

    const embeddedValid: EmbeddedChunk[] = [];

    // Process in sub-batches of 50 to optimize network, memory, and avoid free tier payload caps
    for (let i = 0; i < validChunks.length; i += MAX_BATCH_SIZE) {
      const batch = validChunks.slice(i, i + MAX_BATCH_SIZE);
      const result = await model.batchEmbedContents({
        requests: batch.map((chunk) => ({
          model: 'models/gemini-embedding-001',
          content: { role: 'user' as const, parts: [{ text: chunk.chunk_text }] },
          taskType: TaskType.RETRIEVAL_DOCUMENT,
          outputDimensionality: EMBED_DIM
        }))
      });

      batch.forEach((chunk, idx) => {
        embeddedValid.push({
          ...chunk,
          embedding: result.embeddings[idx]?.values ?? null
        });
      });
    }

    const embeddedInvalid: EmbeddedChunk[] = invalidChunks.map((c) => ({
      ...c,
      embedding: null
    }));

    return [...embeddedValid, ...embeddedInvalid];
  } catch (err) {
    console.warn('embedChunks API call failed, continuing with null embeddings:', err);
    return [...validChunks, ...invalidChunks].map((c) => ({ ...c, embedding: null }));
  }
}
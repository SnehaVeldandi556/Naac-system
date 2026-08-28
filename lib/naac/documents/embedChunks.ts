// lib/naac/documents/embedChunks.ts
import { GoogleGenerativeAI, TaskType } from '@google/generative-ai';
import type { ValidatedChunk } from './chunkValidator';

const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_DIM = 768; // matches your document_chunks.embedding column

export type EmbeddedChunk = ValidatedChunk & {
  embedding: number[] | null;
};

/**
 * Batch-embeds all VALID chunks from one document in a single API call.
 * Invalid chunks pass through with embedding = null, untouched.
 * If GOOGLE_API_KEY is not configured, gracefully falls back to null embeddings.
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

    // batchEmbedContents: one API call, one vector per input text
    const result = await model.batchEmbedContents({
      requests: validChunks.map((chunk) => ({
        model: 'models/gemini-embedding-001',
        content: { role: 'user' as const, parts: [{ text: chunk.chunk_text }] },
        taskType: TaskType.RETRIEVAL_DOCUMENT,
        outputDimensionality: EMBED_DIM
      }))
    });

    const embeddedValid: EmbeddedChunk[] = validChunks.map((chunk, i) => ({
      ...chunk,
      embedding: result.embeddings[i]?.values ?? null
    }));

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
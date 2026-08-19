// lib/naac/documents/processDocument.ts
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { cleanText } from './cleanText';
import { chunkText } from './chunkText';
import { validateChunks } from './chunkValidator';
import { embedChunks } from './embedChunks';

/**
 * Orchestrates the full pipeline for one document, AFTER extraction
 * has already populated raw_documents.raw_text (via processRawDocument).
 *
 * clean -> chunk -> validate -> embed -> insert into document_chunks
 * One document = one batch job, matches your process_pending.py pattern.
 */
export async function processDocument(documentId: string): Promise<void> {
  const supabase = getSupabaseServerClient();

  // 1. Fetch raw_documents row — need raw_text + metadata to carry forward
  const { data: doc, error: fetchError } = await supabase
    .from('raw_documents')
    .select('id, raw_text, extraction_status, doc_category, doc_subtype, department, academic_year')
    .eq('id', documentId)
    .single();

  if (fetchError || !doc) {
    throw new Error(`Could not fetch document ${documentId}: ${fetchError?.message}`);
  }

  if (doc.extraction_status !== 'extracted' || !doc.raw_text) {
    await markProcessingFailed(documentId, 'Cannot chunk — extraction not completed or raw_text empty');
    return;
  }

  try {
    // 2. Clean
    const cleaned = cleanText(doc.raw_text);

    if (cleaned.length === 0) {
      await markProcessingFailed(documentId, 'Cleaned text is empty — nothing to chunk');
      return;
    }

    // 3. Chunk
    const rawChunks = chunkText(cleaned);

    if (rawChunks.length === 0) {
      await markProcessingFailed(documentId, 'Chunking produced zero chunks');
      return;
    }

    // 4. Validate
    const validatedChunks = validateChunks(rawChunks);

    // 5. Embed (only valid chunks get real vectors, invalid get null)
    const embeddedChunks = await embedChunks(validatedChunks);

    // 6. Clear any chunks from a previous run of this document. Without this,
    // rerunning the pipeline on the same documentId (e.g. during dev/testing,
    // or after a chunker algorithm change) stacks duplicate rows instead of
    // replacing them — same raw_document_id, different chunk content.
    const { error: deleteError } = await supabase
      .from('document_chunks')
      .delete()
      .eq('raw_document_id', documentId);

    if (deleteError) {
      await markProcessingFailed(documentId, `Failed clearing old chunks: ${deleteError.message}`);
      return;
    }

    // 7. Insert into document_chunks — denormalize doc metadata onto each row
    const rowsToInsert = embeddedChunks.map((chunk) => ({
      raw_document_id: documentId,
      chunk_text: chunk.chunk_text,
      chunk_index: chunk.chunk_index,
      chunk_type: chunk.chunk_type, // 'text' | 'table'
      page_no: null, // not populated yet, per earlier decision
      section_heading: chunk.section_heading,
      doc_category: doc.doc_category,
      doc_subtype: doc.doc_subtype,
      department: doc.department,
      academic_year: doc.academic_year,
      embedding: chunk.embedding,
      is_valid: chunk.is_valid,
      flagged_reason: chunk.flagged_reason
    }));

    const { error: insertError } = await supabase
      .from('document_chunks')
      .insert(rowsToInsert);

    if (insertError) {
      await markProcessingFailed(documentId, `Insert failed: ${insertError.message}`);
      return;
    }

    // 8. Mark raw_documents as fully processed
    await supabase
      .from('raw_documents')
      .update({
        processing_status: 'chunked',
        updated_at: new Date().toISOString()
      })
      .eq('id', documentId);

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markProcessingFailed(documentId, message);
  }
}

async function markProcessingFailed(documentId: string, reason: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  await supabase
    .from('raw_documents')
    .update({
      processing_status: 'failed',
      updated_at: new Date().toISOString()
    })
    .eq('id', documentId);

  console.error(`processDocument failed for ${documentId}: ${reason}`);
}
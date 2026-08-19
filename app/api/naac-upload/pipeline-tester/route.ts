// app/api/naac/documents/test/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { processRawDocument } from '@/lib/naac/documents/processRawDocument';
import { processDocument } from '@/lib/naac/documents/processDocument';

const STORAGE_BUCKET = 'naac-project'; // ← confirm this matches your actual bucket name

/**
 * Debug/testing endpoint: runs a fresh upload through the REAL pipeline
 * (processRawDocument -> processDocument) and returns raw_text + chunks
 * so they can be inspected in the UI instead of a terminal.
 *
 * Not for production ingestion — this is testDocumentPipeline.ts, but
 * reachable from the browser. It calls the same functions your real
 * ingestion flow calls, so results here match what actually gets stored.
 */
export async function POST(req: NextRequest) {
  const supabase = getSupabaseServerClient();

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    const fileType: 'pdf' | 'docx' | null = fileName.endsWith('.pdf')
      ? 'pdf'
      : fileName.endsWith('.docx')
      ? 'docx'
      : null;

    if (!fileType) {
      return NextResponse.json(
        { error: `Unsupported file extension for "${file.name}" — only .pdf and .docx are handled` },
        { status: 400 }
      );
    }

    // Optional metadata fields — default to test values so this works
    // without a full form; adjust the defaults or make them required
    // inputs on the page if your schema enforces NOT NULL.
    const doc_category = (formData.get('doc_category') as string) || 'test';
    const doc_subtype = (formData.get('doc_subtype') as string) || 'test';
    const department = (formData.get('department') as string) || 'test';
    const academic_year = (formData.get('academic_year') as string) || 'test';

    // 1. Upload the raw file to Storage
    const storagePath = `test-uploads/${randomUUID()}-${file.name}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: file.type || undefined,
        upsert: false
      });

    if (uploadError) {
      return NextResponse.json(
        { error: `Storage upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // 2. Insert the raw_documents row that processRawDocument expects to find
    const { data: inserted, error: insertError } = await supabase
      .from('raw_documents')
      .insert({
        storage_path: storagePath,
        file_name: file.name,
        file_type: fileType,
        doc_category,
        doc_subtype,
        department,
        academic_year,
        extraction_status: 'pending',
        processing_status: 'pending'
      })
      .select('id')
      .single();

    if (insertError || !inserted) {
      return NextResponse.json(
        { error: `Could not create raw_documents row: ${insertError?.message}` },
        { status: 500 }
      );
    }

    const documentId = inserted.id as string;

    // 3. Run the real pipeline — same functions the CLI script calls
    await processRawDocument(documentId);
    await processDocument(documentId);

    // 4. Fetch results for display
    const { data: docRow, error: docFetchError } = await supabase
      .from('raw_documents')
      .select('id, raw_text, extraction_status, processing_status, extraction_error')
      .eq('id', documentId)
      .single();

    if (docFetchError || !docRow) {
      return NextResponse.json(
        { error: `Pipeline ran but could not fetch result: ${docFetchError?.message}` },
        { status: 500 }
      );
    }

    const { data: chunks, error: chunksFetchError } = await supabase
      .from('document_chunks')
      .select(
        'chunk_index, chunk_type, section_heading, chunk_text, is_valid, flagged_reason'
      )
      .eq('raw_document_id', documentId)
      .order('chunk_index', { ascending: true });

    if (chunksFetchError) {
      return NextResponse.json(
        { error: `Could not fetch chunks: ${chunksFetchError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      documentId,
      extraction_status: docRow.extraction_status,
      processing_status: docRow.processing_status,
      extraction_error: docRow.extraction_error,
      raw_text: docRow.raw_text,
      chunks: chunks ?? []
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
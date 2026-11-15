// app/api/naac-upload/pipeline-tester/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { processRawDocument } from '@/lib/naac/documents/processRawDocument';
import { processDocument } from '@/lib/naac/documents/processDocument';

const STORAGE_BUCKET = 'naac-project';

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    // Verify authentication
    const { data: authData } = await supabase.auth.getSession();
    if (!authData?.session) {
      return NextResponse.json({ error: 'Unauthorized. Please log in first.' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.doc') && !fileName.endsWith('.docx')) {
      return NextResponse.json(
        {
          error:
            'Older binary .doc format is not supported directly. Please open your document in Word or Google Docs and save/export as .docx or .pdf.',
        },
        { status: 400 }
      );
    }

    const fileType: 'pdf' | 'docx' | null = fileName.endsWith('.pdf')
      ? 'pdf'
      : fileName.endsWith('.docx')
      ? 'docx'
      : null;

    if (!fileType) {
      return NextResponse.json(
        { error: `Unsupported file extension for "${file.name}" — only .pdf and .docx are supported.` },
        { status: 400 }
      );
    }

    // Try reading user profile to get department if not specified
    let userDept = '';
    const { data: profile } = await admin
      .from('profiles')
      .select('department:departments(name)')
      .eq('id', authData.session.user.id)
      .maybeSingle();
    if (profile?.department) {
      userDept = (profile.department as { name?: string })?.name || '';
    }

    const doc_category = (formData.get('doc_category') as string) || 'SSR Supporting Document';
    const doc_subtype = (formData.get('doc_subtype') as string) || 'Activity Report';
    const department = (formData.get('department') as string) || userDept || 'General';
    const academic_year = (formData.get('academic_year') as string) || '2024-25';

    // 1. Upload the raw file to Supabase Storage ('naac-project') using admin client (bypasses storage RLS)
    const storagePath = `documents/${randomUUID()}-${file.name}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await admin.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: file.type || undefined,
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload failed:', uploadError);
      return NextResponse.json(
        { error: `Storage upload failed: ${uploadError.message}. Verify bucket "${STORAGE_BUCKET}" exists.` },
        { status: 500 }
      );
    }

    // 2. Insert the raw_documents row using admin client
    const { data: inserted, error: insertError } = await admin
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
        processing_status: 'pending',
      })
      .select('id')
      .single();

    if (insertError || !inserted) {
      console.error('raw_documents insert failed:', insertError);
      return NextResponse.json(
        { error: `Could not create raw_documents entry: ${insertError?.message}` },
        { status: 500 }
      );
    }

    const documentId = inserted.id as string;

    // 3. Run the extraction pipeline: processRawDocument (using in-memory fileBuffer) -> processDocument
    await processRawDocument(documentId, fileBuffer);
    await processDocument(documentId);

    // 4. Fetch results for display
    const { data: docRow, error: docFetchError } = await admin
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

    const { data: chunks, error: chunksFetchError } = await admin
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
      file_name: file.name,
      file_type: fileType,
      storage_bucket: STORAGE_BUCKET,
      storage_path: storagePath,
      department,
      academic_year,
      doc_category,
      extraction_status: docRow.extraction_status,
      processing_status: docRow.processing_status,
      extraction_error: docRow.extraction_error,
      raw_text: docRow.raw_text,
      chunks: chunks ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Pipeline route exception:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
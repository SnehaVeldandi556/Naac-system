// lib/naac/documents/processRawDocument.ts
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { extractText } from './extractText';

const STORAGE_BUCKET = 'naac-project';

export async function processRawDocument(documentId: string, cachedBuffer?: Buffer): Promise<void> {
  const supabase = getSupabaseAdminClient();

  let fileBuffer = cachedBuffer;
  let fileType: 'pdf' | 'docx' | 'xlsx' | 'xls' = 'pdf';

  if (!fileBuffer) {
    // 1. Fetch the row
    const { data: doc, error: fetchError } = await supabase
      .from('raw_documents')
      .select('id, storage_path, file_type')
      .eq('id', documentId)
      .single();

    if (fetchError || !doc) {
      throw new Error(`Could not fetch document ${documentId}: ${fetchError?.message}`);
    }

    fileType = (doc.file_type as 'pdf' | 'docx' | 'xlsx' | 'xls') || 'pdf';

    // 2. Download file from Storage
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from(STORAGE_BUCKET)
      .download(doc.storage_path);

    if (downloadError || !fileData) {
      await markFailed(documentId, `Download failed: ${downloadError?.message}`);
      return;
    }

    fileBuffer = Buffer.from(await fileData.arrayBuffer());
  } else {
    const { data: doc } = await supabase
      .from('raw_documents')
      .select('file_type')
      .eq('id', documentId)
      .single();
    if (doc?.file_type) fileType = doc.file_type as 'pdf' | 'docx' | 'xlsx' | 'xls';
  }

  // 3. Extract text from PDF or DOCX
  const result = await extractText(fileBuffer, fileType);

  // 4. Update raw_documents with result
  if (result.status === 'extracted') {
    await supabase
      .from('raw_documents')
      .update({
        raw_text: result.raw_text,
        extraction_status: 'extracted',
        updated_at: new Date().toISOString()
      })
      .eq('id', documentId);
  } else {
    await markFailed(documentId, result.error ?? 'Unknown extraction error');
  }
}

async function markFailed(documentId: string, errorMsg: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  await supabase
    .from('raw_documents')
    .update({
      extraction_status: 'failed',
      extraction_error: errorMsg,
      updated_at: new Date().toISOString()
    })
    .eq('id', documentId);
}
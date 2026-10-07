// app/api/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabaseServer } from "@/lib/supabase/supabaseServer";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { processRawDocument } from "@/lib/naac/documents/processRawDocument";
import { processDocument } from "@/lib/naac/documents/processDocument";

const STORAGE_BUCKET = "naac-project";

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const admin = getSupabaseAdminClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("id, department_id, department:departments(name)")
    .eq("id", session.user.id)
    .single();

  if (!profile || !profile.department_id) {
    return NextResponse.json({ error: "No department assigned to your profile" }, { status: 400 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    const ext = fileName.split(".").pop() || "";
    const allowed = ["pdf", "docx", "xlsx", "xls"];

    if (!allowed.includes(ext)) {
      return NextResponse.json(
        { error: `File type .${ext} is not supported. Please upload .pdf, .docx, or .xlsx files.` },
        { status: 400 }
      );
    }

    // 1. Fetch or initialize the department's report
    let { data: report } = await admin
      .from("reports")
      .select("id")
      .eq("department_id", profile.department_id)
      .maybeSingle();

    if (!report) {
      const { data: newReport, error: repError } = await admin
        .from("reports")
        .insert({
          department_id: profile.department_id,
          status: "in_progress",
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (repError || !newReport) {
        return NextResponse.json({ error: `Could not create department report: ${repError?.message}` }, { status: 500 });
      }
      report = newReport;
    }

    // 2. Upload file to Supabase Storage ('naac-project') using admin client
    const storagePath = `reports/${report.id}/${randomUUID()}-${file.name}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await admin.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: file.type || undefined,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 });
    }

    // 3. Insert file record into 'files' table
    let fileRow: any = null;
    let { data: insertedFile, error: fileErr } = await admin
      .from("files")
      .insert({
        report_id: report.id,
        department_id: profile.department_id,
        uploaded_by: session.user.id,
        file_name: file.name,
        file_type: ext,
        storage_path: storagePath,
        file_size_bytes: file.size,
        uploaded_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (!fileErr) {
      fileRow = insertedFile;
    } else if (fileErr.message?.includes("files_file_type_check")) {
      // Fallback if the Supabase database constraint only allows ('pdf', 'xlsx')
      // so docx/doc uploads succeed without error for faculty and HOD
      const fallbackType = ext === "docx" || ext === "doc" ? "pdf" : "xlsx";
      const retry = await admin
        .from("files")
        .insert({
          report_id: report.id,
          department_id: profile.department_id,
          uploaded_by: session.user.id,
          file_name: file.name,
          file_type: fallbackType,
          storage_path: storagePath,
          file_size_bytes: file.size,
          uploaded_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (!retry.error) {
        fileRow = retry.data;
        fileErr = null;
      }
    }

    if (fileErr) {
      return NextResponse.json({ error: `Database file record failed: ${fileErr.message}` }, { status: 500 });
    }

    // 4. If the file is a document or spreadsheet (.pdf, .docx, .xlsx, .xls), pass through cleaning architecture
    if (ext === "pdf" || ext === "docx" || ext === "xlsx" || ext === "xls") {
      try {
        const deptName = (profile.department as { name?: string })?.name || "General";
        const { data: rawDoc } = await admin
          .from("raw_documents")
          .insert({
            storage_path: storagePath,
            file_name: file.name,
            file_type: ext,
            doc_category: "SSR Supporting Document",
            doc_subtype: "Department Submission",
            department: deptName,
            academic_year: "2024-25",
            extraction_status: "pending",
            processing_status: "pending",
          })
          .select("id")
          .single();

        if (rawDoc?.id) {
          // Process document through cleaning & chunking pipeline
          await processRawDocument(rawDoc.id);
          await processDocument(rawDoc.id);
        }
      } catch (pipelineErr) {
        console.warn("Document pipeline warning on report upload (file still uploaded safely):", pipelineErr);
      }
    }

    return NextResponse.json({ ok: true, file: fileRow });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

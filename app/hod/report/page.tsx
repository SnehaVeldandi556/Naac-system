"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabaseBrowser } from "@/lib/supabase/supabaseClient";
import StatusBadge from "@/components/StatusBadge";
import type { FileRow, Report } from "@/lib/supabase/types";

export default function HodReportPage() {
  const supabase = supabaseBrowser();
  const fileInput = useRef<HTMLInputElement>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    const { data: me } = await supabase.from("profiles").select("department_id").eq("id", session.user.id).maybeSingle();
    if (!me?.department_id) return;

    const { data: rep } = await supabase.from("reports").select("*").eq("department_id", me.department_id).maybeSingle();
    setReport(rep as Report | null);

    if (rep) {
      const { data: f } = await supabase
        .from("files")
        .select("id, file_name, file_type, uploaded_at, storage_path, uploader:profiles!files_uploaded_by_fkey(full_name)")
        .eq("report_id", rep.id)
        .is("deleted_at", null)
        .order("uploaded_at", { ascending: false });
      setFiles((f as unknown as FileRow[]) || []);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUpload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileInput.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setMsg("");
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const json = await res.json();
    setUploading(false);
    if (res.ok) {
      if (fileInput.current) fileInput.current.value = "";
      setMsg("Your file has been successfully uploaded and taken for review for the report.");
      load();
    } else {
      setMsg(json.error || "Upload failed. Please try again.");
    }
  }

  async function handleDelete(file_id: string) {
    if (!confirm("Remove this file from the report?")) return;
    await fetch("/api/delete-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id }),
    });
    load();
  }

  async function download(path: string) {
    const { data } = await supabase.storage.from("naac-project").createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-700">Department report</h2>
          {report && <StatusBadge value={report.status} />}
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          Upload supporting files (.xlsx, .docx, .pdf) for your department report.
        </p>
      </div>

      <form onSubmit={handleUpload} className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <input ref={fileInput} type="file" accept=".xlsx,.xls,.pdf,.docx" className="text-sm" />
        <button disabled={uploading} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer">
          {uploading ? "Uploading..." : "Upload file"}
        </button>
        {msg && (
          <p className={`text-xs font-medium px-3 py-1.5 rounded-lg ${
            msg.includes("successfully") 
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200" 
              : "bg-red-50 text-red-700 border border-red-200"
          }`}>
            {msg}
          </p>
        )}
      </form>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">File</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Uploaded by</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <tr key={f.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{f.file_name}</td>
                <td className="px-4 py-2 uppercase">{f.file_type}</td>
                <td className="px-4 py-2">{f.uploader?.full_name}</td>
                <td className="px-4 py-2 text-slate-500">{new Date(f.uploaded_at).toLocaleString()}</td>
                <td className="px-4 py-2">
                  <div className="flex gap-3">
                    <button onClick={() => download(f.storage_path)} className="text-xs font-medium text-slate-900 underline">Download</button>
                    <button onClick={() => handleDelete(f.id)} className="text-xs font-medium text-red-600 underline">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {files.length === 0 && <tr><td className="px-4 py-3 text-slate-400" colSpan={5}>No files uploaded yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

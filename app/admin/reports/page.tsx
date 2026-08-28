"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/supabaseClient";
import StatusBadge from "@/components/StatusBadge";
import type { FileRow, Report, ReportStatus } from "@/lib/supabase/types";

const NEXT_STATUS: ReportStatus[] = ["not_started", "in_progress", "under_review", "approved", "rejected"];

export default function AdminReportsPage() {
  const supabase = supabaseBrowser();
  const [reports, setReports] = useState<Report[]>([]);
  const [filesByReport, setFilesByReport] = useState<Record<string, FileRow[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from("reports")
      .select("id, status, updated_at, department:departments(id, name)")
      .order("updated_at", { ascending: false });
    setReports((data as unknown as Report[]) || []);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleExpand(report: Report) {
    if (expanded === report.id) {
      setExpanded(null);
      return;
    }
    setExpanded(report.id);
    if (!filesByReport[report.id]) {
      const { data } = await supabase
        .from("files")
        .select("id, file_name, file_type, file_size_bytes, uploaded_at, storage_path, uploader:profiles!files_uploaded_by_fkey(full_name)")
        .eq("report_id", report.id)
        .is("deleted_at", null)
        .order("uploaded_at", { ascending: false });
      setFilesByReport((prev) => ({ ...prev, [report.id]: (data as unknown as FileRow[]) || [] }));
    }
  }

  async function download(path: string) {
    const { data } = await supabase.storage.from("naac-project").createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  async function setStatus(reportId: string, status: ReportStatus) {
    await supabase.from("reports").update({ status, reviewed_at: new Date().toISOString() }).eq("id", reportId);
    load();
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-700">Department reports</h2>
      {reports.map((r) => (
        <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <button onClick={() => toggleExpand(r)} className="flex items-center gap-3 text-left">
              <span className="font-medium">{r.department?.name}</span>
              <StatusBadge value={r.status} />
            </button>
            <select
              value={r.status}
              onChange={(e) => setStatus(r.id, e.target.value as ReportStatus)}
              className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
            >
              {NEXT_STATUS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
          </div>

          {expanded === r.id && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <p className="mb-2 text-xs font-medium uppercase text-slate-400">Uploaded files</p>
              <ul className="space-y-1 text-sm">
                {(filesByReport[r.id] || []).map((f) => (
                  <li key={f.id} className="flex items-center justify-between">
                    <span>{f.file_name} <span className="text-xs text-slate-400">({f.file_type}, {f.uploader?.full_name})</span></span>
                    <button onClick={() => download(f.storage_path)} className="text-xs font-medium text-slate-900 underline">
                      Download
                    </button>
                  </li>
                ))}
                {(filesByReport[r.id] || []).length === 0 && <li className="text-slate-400">No files uploaded yet.</li>}
              </ul>
            </div>
          )}
        </div>
      ))}
      {reports.length === 0 && <p className="text-sm text-slate-400">No reports created yet.</p>}
    </div>
  );
}

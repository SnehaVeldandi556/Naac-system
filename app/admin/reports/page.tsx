"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/supabaseClient";
import StatusBadge from "@/components/StatusBadge";
import type { FileRow, Report, ReportStatus } from "@/lib/supabase/types";

const NEXT_STATUS: ReportStatus[] = ["not_started", "in_progress", "under_review", "approved", "rejected"];

interface MissingReport {
  institution_name: string;
  total_qualitative_metrics: number;
  metrics_extracted: number;
  metrics_missing: number;
  missing_list: Array<{ id: string; title: string; reason: string }>;
}

export default function AdminReportsPage() {
  const supabase = supabaseBrowser();
  const [reports, setReports] = useState<Report[]>([]);
  const [filesByReport, setFilesByReport] = useState<Record<string, FileRow[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  // SSR Generation Pipeline State
  const [generating, setGenerating] = useState(false);
  const [genMessage, setGenMessage] = useState<string | null>(null);
  const [missingReport, setMissingReport] = useState<MissingReport | null>(null);

  async function load() {
    const { data } = await supabase
      .from("reports")
      .select("id, status, updated_at, department:departments(id, name)")
      .order("updated_at", { ascending: false });
    setReports((data as unknown as Report[]) || []);

    // Load existing SSR report status if available
    try {
      const res = await fetch("/api/generate-ssr");
      if (res.ok) {
        const json = await res.json();
        if (json.missing) setMissingReport(json.missing);
      }
    } catch {
      // safe fallback
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRunPipeline() {
    setGenerating(true);
    setGenMessage(null);
    try {
      const res = await fetch("/api/generate-ssr", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setGenMessage(`Failed: ${data.error || "Execution failed"}`);
      } else {
        setGenMessage("SSR Report generation completed successfully!");
        if (data.missing) setMissingReport(data.missing);
      }
    } catch (err) {
      setGenMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGenerating(false);
    }
  }

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
    <div className="space-y-6">
      {/* SSR AI Qualitative Mapping Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Institutional NAAC Self-Study Report (SSR)</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Vector similarity mapping & narrative extraction powered by Gemini 768-dim embeddings and Qwen LLM.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <a
              href="/ssr_report.html"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <span>📄</span> View Rendered Report (HTML)
            </a>
            <button
              onClick={handleRunPipeline}
              disabled={generating}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm"
            >
              {generating ? "Running Mapping Pipeline..." : "Generate / Update SSR Report"}
            </button>
          </div>
        </div>

        {genMessage && (
          <div className={`p-3 rounded-lg text-xs font-medium ${
            genMessage.startsWith("Failed") || genMessage.startsWith("Error")
              ? "bg-red-50 text-red-700 border border-red-200"
              : "bg-emerald-50 text-emerald-800 border border-emerald-200"
          }`}>
            {genMessage}
          </div>
        )}

        {missingReport && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100 text-xs">
            <div className="p-3 bg-slate-50 rounded-lg">
              <span className="text-slate-400 block font-medium">Institution</span>
              <span className="font-semibold text-slate-800">{missingReport.institution_name}</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <span className="text-slate-400 block font-medium">Total Qualitative Metrics</span>
              <span className="font-semibold text-slate-800">{missingReport.total_qualitative_metrics}</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <span className="text-slate-400 block font-medium">Extracted with Data</span>
              <span className="font-semibold text-emerald-600">{missingReport.metrics_extracted}</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <span className="text-slate-400 block font-medium">Missing / Needs Review</span>
              <span className="font-semibold text-amber-600">{missingReport.metrics_missing}</span>
            </div>
          </div>
        )}
      </div>

      {/* Department Reports List */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Department submissions & files</h2>
        {reports.map((r) => (
          <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <button onClick={() => toggleExpand(r)} className="flex items-center gap-3 text-left">
                <span className="font-medium text-slate-900">{r.department?.name}</span>
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
    </div>
  );
}

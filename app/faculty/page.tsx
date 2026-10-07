"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/supabaseClient";
import StatusBadge from "@/components/StatusBadge";
import SignOutButton from "@/components/SignOutButton";
import type { FileRow, Report } from "@/lib/supabase/types";

export default function FacultyPage() {
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

    const { data: me, error: meError } = await supabase
      .from("profiles")
      .select("id, department_id")
      .eq("id", session.user.id)
      .maybeSingle();

    if (meError || !me) {
      console.error("Failed to load profile:", meError);
      setMsg("Could not load your profile. Contact your HOD or admin.");
      return;
    }

    if (!me.department_id) {
      setMsg("No department assigned to your profile.");
      return;
    }

    const { data: rep } = await supabase
      .from("reports")
      .select("*")
      .eq("department_id", me.department_id)
      .maybeSingle();
    setReport(rep as Report | null);

    if (rep) {
      const { data: f } = await supabase
        .from("files")
        .select("id, file_name, file_type, uploaded_at")
        .eq("report_id", rep.id)
        .eq("uploaded_by", me.id)
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
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const json = await res.json();
      setUploading(false);
      if (res.ok) {
        if (fileInput.current) fileInput.current.value = "";
        load();
      } else {
        setMsg(json.error || "Upload failed");
      }
    } catch (err) {
      setUploading(false);
      setMsg((err as Error).message);
    }
  }

  return (
    <div className="space-y-8">
      {/* Quick Actions Panel */}
      <div>
        <h2 className="mb-4 text-base font-semibold text-slate-900">Faculty Dashboard Actions</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ActionCard
            title="Department Members"
            description="View fellow faculty members in your department."
            href="/faculty/members"
            icon="👥"
          />
          <ActionCard
            title="NAAC Data Uploads"
            description="Upload & map CSV / Excel datasets with validation."
            href="/naac-upload"
            icon="📤"
          />
          <ActionCard
            title="Accept Invite"
            description="Redeem invitation or update password."
            href="/accept-invite"
            icon="🔗"
          />
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">🚪</span>
                <h3 className="text-sm font-semibold text-slate-900">Sign Out</h3>
              </div>
              <p className="text-xs text-slate-500">Sign out of your session.</p>
            </div>
            <div className="mt-3">
              <SignOutButton />
            </div>
          </div>
        </div>
      </div>

      {/* Report & Files Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Department Report & Files</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Upload supporting files (.xlsx, .docx, .pdf) for your department report.
            </p>
          </div>
          {report && <StatusBadge value={report.status} />}
        </div>

        <form onSubmit={handleUpload} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <input ref={fileInput} type="file" accept=".xlsx,.xls,.pdf,.docx" className="text-sm" />
          <button
            disabled={uploading}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            {uploading ? "Uploading..." : "Upload file"}
          </button>
          {msg && <p className="text-sm text-red-600 w-full sm:w-auto">{msg}</p>}
        </form>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2.5">File</th>
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5">Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 font-medium">{f.file_name}</td>
                  <td className="px-4 py-2.5 uppercase text-slate-600">{f.file_type}</td>
                  <td className="px-4 py-2.5 text-slate-500">{new Date(f.uploaded_at).toLocaleString()}</td>
                </tr>
              ))}
              {files.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-center text-slate-400" colSpan={3}>
                    You haven&apos;t uploaded any report files yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ActionCard({
  title,
  description,
  href,
  icon,
}: {
  title: string;
  description: string;
  href: string;
  icon: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-400 hover:shadow-md transition-all"
    >
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">{icon}</span>
          <h3 className="text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">{title}</h3>
        </div>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <div className="mt-3 text-xs font-medium text-slate-700 group-hover:text-blue-600 flex items-center gap-1">
        Open →
      </div>
    </Link>
  );
}
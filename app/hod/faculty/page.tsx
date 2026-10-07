"use client";
import { useEffect, useState, type FormEvent } from "react";
import { supabaseBrowser } from "@/lib/supabase/supabaseClient";
import StatusBadge from "@/components/StatusBadge";
import InviteResultBanner, { type InviteResult } from "@/components/InviteResultBanner";
import type { Profile } from "@/lib/supabase/types";

export default function HodFacultyPage() {
  const supabase = supabaseBrowser();
  const [faculty, setFaculty] = useState<Profile[]>([]);
  const [form, setForm] = useState({ email: "", full_name: "" });
  const [result, setResult] = useState<InviteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);

  async function load() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    const { data: me } = await supabase.from("profiles").select("department_id").eq("id", session.user.id).maybeSingle();
    if (!me?.department_id) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email, status")
      .eq("department_id", me.department_id)
      .eq("role", "faculty")
      .order("created_at");
    setFaculty((data as unknown as Profile[]) || []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleInvite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResult({ type: "info", message: "Generating invite & dispatching email..." });
    setLoading(true);

    try {
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, role: "faculty" }),
      });
      const text = await res.text();
      let json: { error?: string; ok?: boolean; message?: string; inviteLink?: string; emailWarning?: string };
      try {
        json = JSON.parse(text);
      } catch {
        console.error("Non-JSON response from /api/invite:", text);
        setResult({ type: "error", message: `Server error (status ${res.status}). Check server logs.` });
        setLoading(false);
        return;
      }
      if (res.ok) {
        setResult({
          type: json.emailWarning ? "warning" : "success",
          message: json.message || `Invitation created for ${form.email}.`,
          inviteLink: json.inviteLink,
        });
        setForm({ email: "", full_name: "" });
        load();
      } else {
        setResult({ type: "error", message: json.error || `Request failed (status ${res.status}).` });
      }
    } catch (err) {
      console.error(err);
      setResult({ type: "error", message: `Network error: ${(err as Error).message}` });
    } finally {
      setLoading(false);
    }
  }

  async function handleResend(profile_id: string) {
    setResendingId(profile_id);
    setResult({ type: "info", message: "Re-issuing invitation..." });

    try {
      const res = await fetch("/api/resend-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id }),
      });
      const text = await res.text();
      let json: { error?: string; message?: string; inviteLink?: string; emailWarning?: string } | null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      if (!res.ok) {
        setResult({ type: "error", message: json?.error || `Request failed (status ${res.status}).` });
      } else {
        setResult({
          type: json?.emailWarning ? "warning" : "success",
          message: json?.message || "Invitation re-issued successfully.",
          inviteLink: json?.inviteLink,
        });
      }
      load();
    } catch (err) {
      setResult({ type: "error", message: `Network error: ${(err as Error).message}` });
    } finally {
      setResendingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 sm:max-w-md shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-slate-800">Invite a faculty member</h2>
        <form onSubmit={handleInvite} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Full Name</label>
            <input
              required
              placeholder="e.g. Prof. Jane Doe"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Email Address</label>
            <input
              required
              type="email"
              placeholder="e.g. faculty@anurag.edu.in"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-2xs cursor-pointer"
          >
            {loading ? "Sending..." : "Send Invitation"}
          </button>

          <InviteResultBanner result={result} onDismiss={() => setResult(null)} />
        </form>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Faculty in your department</h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {faculty.map((f) => (
                <tr key={f.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">{f.full_name || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{f.email}</td>
                  <td className="px-4 py-3"><StatusBadge value={f.status} /></td>
                  <td className="px-4 py-3 text-right">
                    {f.status === "invited" && (
                      <button
                        disabled={resendingId === f.id}
                        onClick={() => handleResend(f.id)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline disabled:opacity-50 cursor-pointer"
                      >
                        {resendingId === f.id ? "Sending email..." : "Resend Email Invite"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {faculty.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-400" colSpan={4}>
                    No faculty members added yet.
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

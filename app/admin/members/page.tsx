"use client";
import { useEffect, useState, type FormEvent } from "react";
import { supabaseBrowser } from "@/lib/supabase/supabaseClient";
import StatusBadge from "@/components/StatusBadge";
import InviteResultBanner, { type InviteResult } from "@/components/InviteResultBanner";
import type { Department, LoginSession, Profile } from "@/lib/supabase/types";

export default function AdminMembersPage() {
  const supabase = supabaseBrowser();
  const [members, setMembers] = useState<Profile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [sessions, setSessions] = useState<Record<string, LoginSession>>({});
  const [inviteForm, setInviteForm] = useState({ email: "", full_name: "", department_id: "" });
  const [newDeptName, setNewDeptName] = useState("");
  const [result, setResult] = useState<InviteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);

  async function loadAll() {
    const [{ data: mem }, { data: dept }, { data: logins }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, role, status, department:departments(name)").order("created_at"),
      supabase.from("departments").select("id, name").order("name"),
      supabase.from("login_sessions").select("user_id, login_at, logout_at").order("login_at", { ascending: false }),
    ]);
    setMembers((mem as unknown as Profile[]) || []);
    setDepartments(dept || []);

    const latest: Record<string, LoginSession> = {};
    ((logins as LoginSession[]) || []).forEach((s) => {
      if (!latest[s.user_id]) latest[s.user_id] = s;
    });
    setSessions(latest);
  }

  useEffect(() => {
    loadAll();
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
        body: JSON.stringify({ ...inviteForm, role: "hod" }),
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
          message: json.message || `Invitation created for ${inviteForm.email}.`,
          inviteLink: json.inviteLink,
        });
        setInviteForm({ email: "", full_name: "", department_id: "" });
        loadAll();
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

  async function handleAddDept(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newDeptName.trim()) return;
    const { error } = await supabase.from("departments").insert({ name: newDeptName.trim() });
    if (!error) {
      setNewDeptName("");
      loadAll();
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
          message: json?.message || "Invitation email re-sent successfully.",
          inviteLink: json?.inviteLink,
        });
      }
      loadAll();
    } catch (err) {
      setResult({ type: "error", message: `Network error: ${(err as Error).message}` });
    } finally {
      setResendingId(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-slate-800">Invite a HOD</h2>
          <form onSubmit={handleInvite} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Full Name</label>
              <input
                required
                placeholder="e.g. Dr. Anurag Dubey"
                value={inviteForm.full_name}
                onChange={(e) => setInviteForm({ ...inviteForm, full_name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Email Address</label>
              <input
                required
                type="email"
                placeholder="e.g. dubeyanurag340@gmail.com"
                value={inviteForm.email}
                onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Department</label>
              <select
                required
                value={inviteForm.department_id}
                onChange={(e) => setInviteForm({ ...inviteForm, department_id: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 bg-white"
              >
                <option value="">Select department...</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
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

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-slate-800">Departments</h2>
          <form onSubmit={handleAddDept} className="flex gap-2">
            <input
              placeholder="New department name"
              value={newDeptName}
              onChange={(e) => setNewDeptName(e.target.value)}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
            />
            <button
              type="submit"
              className="rounded-lg bg-slate-100 border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              Add
            </button>
          </form>
          <div className="max-h-60 overflow-y-auto space-y-1">
            {departments.map((d) => (
              <div key={d.id} className="text-xs px-3 py-2 bg-slate-50 rounded-lg border border-slate-100 text-slate-700 font-medium">
                {d.name}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-800">All Members — Roles & Login Activity</h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last Login</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((m) => {
                const s = sessions[m.id];
                return (
                  <tr key={m.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{m.full_name || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{m.email}</td>
                    <td className="px-4 py-3 capitalize font-medium text-slate-700">{m.role}</td>
                    <td className="px-4 py-3 text-slate-600">{m.department?.name || "—"}</td>
                    <td className="px-4 py-3"><StatusBadge value={m.status} /></td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{s?.login_at ? new Date(s.login_at).toLocaleString() : "—"}</td>
                    <td className="px-4 py-3 text-right">
                      {m.status === "invited" && (
                        <button
                          disabled={resendingId === m.id}
                          onClick={() => handleResend(m.id)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline disabled:opacity-50 cursor-pointer"
                        >
                          {resendingId === m.id ? "Sending email..." : "Resend Email Invite"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

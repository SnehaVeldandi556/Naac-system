"use client";
import { useEffect, useState, type FormEvent } from "react";
import { supabaseBrowser } from "@/lib/supabase/supabaseClient";
import StatusBadge from "@/components/StatusBadge";
import type { Department, LoginSession, Profile } from "@/lib/supabase/types";

export default function AdminMembersPage() {
  const supabase = supabaseBrowser();
  const [members, setMembers] = useState<Profile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [sessions, setSessions] = useState<Record<string, LoginSession>>({});
  const [inviteForm, setInviteForm] = useState({ email: "", full_name: "", department_id: "" });
  const [newDeptName, setNewDeptName] = useState("");
  const [msg, setMsg] = useState("");
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
    setMsg("Sending invite...");
    try {
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...inviteForm, role: "hod" }),
      });
      const text = await res.text();
      let json: { error?: string };
      try {
        json = JSON.parse(text);
      } catch {
        console.error("Non-JSON response from /api/invite:", text);
        setMsg(`Server error (status ${res.status}). Check the server terminal/logs for details.`);
        return;
      }
      if (res.ok) {
        setMsg(`Invite email sent to ${inviteForm.email}.`);
        setInviteForm({ email: "", full_name: "", department_id: "" });
        loadAll();
      } else {
        setMsg(json.error || `Request failed (status ${res.status}).`);
      }
    } catch (err) {
      console.error(err);
      setMsg(`Network error: ${(err as Error).message}`);
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
    try {
      const res = await fetch("/api/resend-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id }),
      });
      const text = await res.text();
      let json: { error?: string } | null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      if (!res.ok) alert(json?.error || `Request failed (status ${res.status}).`);
      loadAll();
    } catch (err) {
      alert(`Network error: ${(err as Error).message}`);
    } finally {
      setResendingId(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Invite a HOD</h2>
          <form onSubmit={handleInvite} className="space-y-3">
            <input required placeholder="Full name" value={inviteForm.full_name}
              onChange={(e) => setInviteForm({ ...inviteForm, full_name: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input required type="email" placeholder="Email" value={inviteForm.email}
              onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <select required value={inviteForm.department_id}
              onChange={(e) => setInviteForm({ ...inviteForm, department_id: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">Select department...</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <button className="w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800">
              Send invitation email
            </button>
            {msg && <p className="text-xs text-slate-500">{msg}</p>}
          </form>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Departments</h2>
          <form onSubmit={handleAddDept} className="mb-3 flex gap-2">
            <input placeholder="New department name" value={newDeptName}
              onChange={(e) => setNewDeptName(e.target.value)}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">Add</button>
          </form>
          <ul className="space-y-1 text-sm text-slate-600">
            {departments.map((d) => <li key={d.id}>{d.name}</li>)}
          </ul>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">All members — login activity</h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Department</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Last login</th>
                <th className="px-4 py-2">Last logout</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const s = sessions[m.id];
                return (
                  <tr key={m.id} className="border-t border-slate-100">
                    <td className="px-4 py-2">{m.full_name || "—"}</td>
                    <td className="px-4 py-2">{m.email}</td>
                    <td className="px-4 py-2 capitalize">{m.role}</td>
                    <td className="px-4 py-2">{m.department?.name || "—"}</td>
                    <td className="px-4 py-2"><StatusBadge value={m.status} /></td>
                    <td className="px-4 py-2 text-slate-500">{s?.login_at ? new Date(s.login_at).toLocaleString() : "—"}</td>
                    <td className="px-4 py-2 text-slate-500">{s?.logout_at ? new Date(s.logout_at).toLocaleString() : "—"}</td>
                    <td className="px-4 py-2">
                      {m.status === "invited" && m.role === "hod" && (
                        <button
                          disabled={resendingId === m.id}
                          onClick={() => handleResend(m.id)}
                          className="text-xs font-medium text-slate-900 underline disabled:opacity-50"
                        >
                          {resendingId === m.id ? "Resending..." : "Resend invite"}
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

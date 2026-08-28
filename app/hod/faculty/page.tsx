"use client";
import { useEffect, useState, type FormEvent } from "react";
import { supabaseBrowser } from "@/lib/supabase/supabaseClient";
import StatusBadge from "@/components/StatusBadge";
import type { Profile } from "@/lib/supabase/types";

export default function HodFacultyPage() {
  const supabase = supabaseBrowser();
  const [faculty, setFaculty] = useState<Profile[]>([]);
  const [form, setForm] = useState({ email: "", full_name: "" });
  const [msg, setMsg] = useState("");
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
    setMsg("Sending invite...");
    try {
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, role: "faculty" }),
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
        setMsg(`Invite email sent to ${form.email}.`);
        setForm({ email: "", full_name: "" });
        load();
      } else {
        setMsg(json.error || `Request failed (status ${res.status}).`);
      }
    } catch (err) {
      console.error(err);
      setMsg(`Network error: ${(err as Error).message}`);
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
      load();
    } catch (err) {
      alert(`Network error: ${(err as Error).message}`);
    } finally {
      setResendingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 sm:max-w-md">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Invite a faculty member</h2>
        <form onSubmit={handleInvite} className="space-y-3">
          <input required placeholder="Full name" value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input required type="email" placeholder="Email" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button className="w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800">
            Send invitation email
          </button>
          {msg && <p className="text-xs text-slate-500">{msg}</p>}
        </form>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Faculty in your department</h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr><th className="px-4 py-2">Name</th><th className="px-4 py-2">Email</th><th className="px-4 py-2">Status</th><th className="px-4 py-2"></th></tr>
            </thead>
            <tbody>
              {faculty.map((f) => (
                <tr key={f.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{f.full_name || "—"}</td>
                  <td className="px-4 py-2">{f.email}</td>
                  <td className="px-4 py-2"><StatusBadge value={f.status} /></td>
                  <td className="px-4 py-2">
                    {f.status === "invited" && (
                      <button
                        disabled={resendingId === f.id}
                        onClick={() => handleResend(f.id)}
                        className="text-xs font-medium text-slate-900 underline disabled:opacity-50"
                      >
                        {resendingId === f.id ? "Resending..." : "Resend invite"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {faculty.length === 0 && <tr><td className="px-4 py-3 text-slate-400" colSpan={4}>No faculty yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { Department, Role } from "@/lib/supabase/types";

const DEFAULT_DEPARTMENTS: Department[] = [
  { id: "ea145770-158f-47cd-b06f-8fad8dfec5ed", name: "Computer Engineering" },
  { id: "17956104-ff97-477e-87e1-238cf120a36c", name: "Information Technology" },
];

export default function RequestAccessPage() {
  const [departments, setDepartments] = useState<Department[]>(DEFAULT_DEPARTMENTS);
  const [form, setForm] = useState<{ email: string; full_name: string; role: Role; department_id: string }>({
    email: "",
    full_name: "",
    role: "faculty",
    department_id: "",
  });
  const [status, setStatus] = useState<string | null>(null); // null | "sending" | "sent" | error string

  useEffect(() => {
    fetch("/api/request-access")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setDepartments(data);
        }
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch("/api/request-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const text = await res.text();
      let json: { error?: string; message?: string } | null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      if (res.ok) {
        setStatus("sent");
      } else {
        setStatus(json?.error || `Request failed (status ${res.status}).`);
      }
    } catch (err) {
      setStatus(`Network error: ${(err as Error).message}`);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 bg-slate-50">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold">Request access</h1>
        <p className="mb-6 text-sm text-slate-500">
          HOD requests go to admin. Faculty requests go to your department's HOD.
        </p>

        {status === "sent" ? (
          <div className="space-y-3">
            <p className="text-sm text-green-700 font-medium">
              ✓ Request submitted successfully!
            </p>
            <p className="text-xs text-slate-500">
              The administrator has been notified via email. Once reviewed and accepted, you will receive an invitation email to set your password and access the portal.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Full name</label>
              <input
                required
                placeholder="e.g. Dr. Jane Doe"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Email</label>
              <input
                type="email"
                required
                placeholder="e.g. name@student.mes.ac.in"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">I am requesting access as</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 bg-white"
              >
                <option value="faculty">Faculty</option>
                <option value="hod">HOD</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Department</label>
              <select
                required
                value={form.department_id}
                onChange={(e) => setForm({ ...form, department_id: e.target.value })}
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

            {status && status !== "sending" && status !== "sent" && (
              <p className="text-sm text-red-600">{status}</p>
            )}

            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer transition-colors shadow-2xs"
            >
              {status === "sending" ? "Sending..." : "Send request"}
            </button>
          </form>
        )}

        <p className="mt-4 text-center text-sm text-slate-500">
          <a href="/login" className="font-medium text-slate-900 underline">Back to sign in</a>
        </p>
      </div>
    </div>
  );
}

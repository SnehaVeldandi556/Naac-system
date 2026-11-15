"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/supabaseClient";
import StatusBadge from "@/components/StatusBadge";
import type { AccessRequest } from "@/lib/supabase/types";

export default function HodRequestsPage() {
  const supabase = supabaseBrowser();
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  async function load() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const { data: me } = await supabase
      .from("profiles")
      .select("id, department_id")
      .eq("id", session.user.id)
      .maybeSingle();

    if (!me?.department_id) return;

    const { data } = await supabase
      .from("access_requests")
      .select("*, department:departments(name)")
      .eq("role", "faculty")
      .eq("department_id", me.department_id)
      .order("created_at", { ascending: false });

    setRequests((data as unknown as AccessRequest[]) || []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function respond(request_id: string, action: "approve" | "reject") {
    setBusyId(request_id);
    setMsg(action === "approve" ? "Approving request & sending invitation email..." : "Rejecting request...");

    try {
      const res = await fetch(`/api/${action}-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id }),
      });

      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg(json.message || `Request ${action}d successfully.`);
      } else {
        setMsg(json.error || `Failed to ${action} request.`);
      }
      load();
    } catch (err) {
      setMsg(`Network error: ${(err as Error).message}`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-800">Faculty Access Requests</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Review and approve or reject sign-up requests submitted by prospective faculty members in your department.
        </p>
      </div>

      {msg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium">
          <p>{msg}</p>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3">Faculty Name</th>
              <th className="px-4 py-3">Email Address</th>
              <th className="px-4 py-3">Date Requested</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {requests.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-800">{r.full_name || "—"}</td>
                <td className="px-4 py-3 text-slate-600">{r.email}</td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {new Date(r.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge value={r.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  {r.status === "pending" ? (
                    <div className="flex justify-end gap-2">
                      <button
                        disabled={busyId === r.id}
                        onClick={() => respond(r.id, "approve")}
                        className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer shadow-2xs"
                      >
                        {busyId === r.id ? "Processing..." : "Accept"}
                      </button>
                      <button
                        disabled={busyId === r.id}
                        onClick={() => respond(r.id, "reject")}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        Reject
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">Processed</span>
                  )}
                </td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-center text-slate-400" colSpan={5}>
                  No pending or past faculty requests for your department.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

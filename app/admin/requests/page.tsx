"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/supabaseClient";
import StatusBadge from "@/components/StatusBadge";
import type { AccessRequest, Invite } from "@/lib/supabase/types";

export default function AdminRequestsPage() {
  const supabase = supabaseBrowser();
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const [{ data: reqs }, { data: inv }] = await Promise.all([
      supabase.from("access_requests").select("*, department:departments(name)").eq("role", "hod").order("created_at", { ascending: false }),
      supabase.from("invites").select("*, department:departments(name)").eq("role", "hod").order("created_at", { ascending: false }),
    ]);
    setRequests((reqs as unknown as AccessRequest[]) || []);
    setInvites((inv as unknown as Invite[]) || []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function respond(request_id: string, action: "approve" | "reject") {
    setBusyId(request_id);
    await fetch(`/api/${action}-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request_id }),
    });
    setBusyId(null);
    load();
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">HOD access requests</h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Department</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{r.full_name}</td>
                  <td className="px-4 py-2">{r.email}</td>
                  <td className="px-4 py-2">{r.department?.name}</td>
                  <td className="px-4 py-2"><StatusBadge value={r.status} /></td>
                  <td className="px-4 py-2">
                    {r.status === "pending" && (
                      <div className="flex gap-2">
                        <button disabled={busyId === r.id} onClick={() => respond(r.id, "approve")}
                          className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800">
                          Accept
                        </button>
                        <button disabled={busyId === r.id} onClick={() => respond(r.id, "reject")}
                          className="rounded-lg border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50">
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {requests.length === 0 && <tr><td className="px-4 py-3 text-slate-400" colSpan={5}>No requests yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">HOD invites sent</h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Department</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Sent</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((i) => (
                <tr key={i.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{i.email}</td>
                  <td className="px-4 py-2">{i.department?.name}</td>
                  <td className="px-4 py-2"><StatusBadge value={i.status} /></td>
                  <td className="px-4 py-2 text-slate-500">{new Date(i.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {invites.length === 0 && <tr><td className="px-4 py-3 text-slate-400" colSpan={4}>No invites yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

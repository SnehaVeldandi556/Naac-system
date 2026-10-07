"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/supabaseClient";
import StatusBadge from "@/components/StatusBadge";
import InviteResultBanner, { type InviteResult } from "@/components/InviteResultBanner";
import type { AccessRequest, Invite } from "@/lib/supabase/types";

export default function AdminRequestsPage() {
  const supabase = supabaseBrowser();
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [result, setResult] = useState<InviteResult | null>(null);

  async function load() {
    const [{ data: reqs }, { data: inv }] = await Promise.all([
      supabase
        .from("access_requests")
        .select("*, department:departments(name)")
        .eq("role", "hod")
        .order("created_at", { ascending: false }),
      supabase
        .from("invites")
        .select("*, department:departments(name)")
        .eq("role", "hod")
        .order("created_at", { ascending: false }),
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
    setResult({
      type: "info",
      message: action === "approve" ? "Approving request & generating invitation..." : "Rejecting request...",
    });

    try {
      const res = await fetch(`/api/${action}-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id }),
      });

      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setResult({
          type: json.emailWarning ? "warning" : "success",
          message: json.message || `Request ${action}d successfully.`,
          inviteLink: json.inviteLink,
        });
      } else {
        setResult({
          type: "error",
          message: json.error || `Failed to ${action} request.`,
        });
      }
      load();
    } catch (err) {
      setResult({ type: "error", message: `Network error: ${(err as Error).message}` });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-base font-semibold text-slate-800">HOD Access Requests & Outgoing Invites</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Review requests submitted by prospective Heads of Department or track sent invitations.
        </p>
      </div>

      <InviteResultBanner result={result} onDismiss={() => setResult(null)} />

      <div>
        <h3 className="mb-3 text-sm font-semibold text-slate-800">Incoming HOD Requests</h3>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">{r.full_name || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{r.email}</td>
                  <td className="px-4 py-3 text-slate-600">{r.department?.name || "—"}</td>
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
                    No incoming HOD access requests.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-slate-800">All HOD Invitations</h3>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Sent At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invites.map((i) => (
                <tr key={i.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-700">{i.email}</td>
                  <td className="px-4 py-3 text-slate-600">{i.department?.name || "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge value={i.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(i.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
              {invites.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-400" colSpan={4}>
                    No invitations sent yet.
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

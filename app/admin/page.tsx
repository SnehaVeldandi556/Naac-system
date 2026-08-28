"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/supabaseClient";
import StatusBadge from "@/components/StatusBadge";
import SignOutButton from "@/components/SignOutButton";
import type { Report } from "@/lib/supabase/types";

interface Stats {
  memberCount: number | null;
  pendingInvites: number | null;
  pendingRequests: number | null;
}

export default function AdminOverview() {
  const supabase = supabaseBrowser();
  const [stats, setStats] = useState<Stats | null>(null);
  const [reports, setReports] = useState<Report[]>([]);

  useEffect(() => {
    async function load() {
      const [{ count: memberCount }, { count: pendingInvites }, { count: pendingRequests }, { data: reportRows }] =
        await Promise.all([
          supabase.from("profiles").select("id", { count: "exact", head: true }),
          supabase.from("invites").select("id", { count: "exact", head: true }).eq("status", "pending"),
          supabase.from("access_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
          supabase.from("reports").select("id, status, department:departments(name)"),
        ]);
      setStats({ memberCount, pendingInvites, pendingRequests });
      setReports((reportRows as unknown as Report[]) || []);
    }
    load();
  }, [supabase]);

  if (!stats) return <p className="text-sm text-slate-500">Loading admin overview...</p>;

  return (
    <div className="space-y-8">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card label="Total members" value={stats.memberCount} />
        <Card label="Pending invites" value={stats.pendingInvites} />
        <Card label="Pending access requests" value={stats.pendingRequests} />
      </div>

      {/* Dashboard Actions Panel */}
      <div>
        <h2 className="mb-4 text-base font-semibold text-slate-900">Admin Actions</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ActionCard
            title="Members & Logins"
            description="Manage all users, view login sessions, create departments, and invite HODs."
            href="/admin/members"
            badge={stats.memberCount !== null ? `${stats.memberCount} total` : undefined}
            icon="👥"
          />
          <ActionCard
            title="Invites & Requests"
            description="Review incoming access requests and track sent invitations."
            href="/admin/requests"
            badge={
              (stats.pendingRequests ?? 0) + (stats.pendingInvites ?? 0) > 0
                ? `${(stats.pendingRequests ?? 0) + (stats.pendingInvites ?? 0)} pending`
                : undefined
            }
            badgeColor="amber"
            icon="✉️"
          />
          <ActionCard
            title="Department Reports"
            description="Inspect all department SSR report submissions and attached files."
            href="/admin/reports"
            icon="📊"
          />
          <ActionCard
            title="NAAC Uploads"
            description="Upload & ingest raw NAAC datasets with column mapping."
            href="/naac-upload"
            icon="📤"
          />
          <ActionCard
            title="Accept Invite"
            description="Redeem invitation or test token-based account onboarding."
            href="/accept-invite"
            icon="🔗"
          />
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-300 transition-colors">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">🚪</span>
                <h3 className="text-sm font-semibold text-slate-900">Sign Out</h3>
              </div>
              <p className="text-xs text-slate-500">Sign out of administrator session.</p>
            </div>
            <div className="mt-4">
              <SignOutButton />
            </div>
          </div>
        </div>
      </div>

      {/* Reports Table */}
      <div>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Report Status by Department</h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{r.department?.name}</td>
                  <td className="px-4 py-3">
                    <StatusBadge value={r.status} />
                  </td>
                </tr>
              ))}
              {reports.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-400" colSpan={2}>
                    No reports created yet.
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

function Card({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value ?? 0}</p>
    </div>
  );
}

function ActionCard({
  title,
  description,
  href,
  badge,
  badgeColor = "blue",
  icon,
}: {
  title: string;
  description: string;
  href: string;
  badge?: string;
  badgeColor?: "blue" | "amber";
  icon: string;
}) {
  const badgeCls = badgeColor === "amber" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800";
  return (
    <Link
      href={href}
      className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-400 hover:shadow-md transition-all"
    >
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-xl">{icon}</span>
            <h3 className="text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">{title}</h3>
          </div>
          {badge && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeCls}`}>{badge}</span>}
        </div>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <div className="mt-4 text-xs font-medium text-slate-700 group-hover:text-blue-600 flex items-center gap-1">
        Open {title} →
      </div>
    </Link>
  );
}

"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/supabaseClient";
import StatusBadge from "@/components/StatusBadge";
import SignOutButton from "@/components/SignOutButton";
import type { Report } from "@/lib/supabase/types";

interface Stats {
  facultyCount: number | null;
  pendingReq: number | null;
}

export default function HodOverview() {
  const supabase = supabaseBrowser();
  const [stats, setStats] = useState<Stats | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const { data: me } = await supabase
        .from("profiles")
        .select("department_id")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!me?.department_id) {
        setStats({ facultyCount: 0, pendingReq: 0 });
        return;
      }

      const [{ count: facultyCount }, { count: pendingReq }, { data: rep }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("department_id", me.department_id)
          .eq("role", "faculty"),
        supabase
          .from("access_requests")
          .select("id", { count: "exact", head: true })
          .eq("requested_to", session.user.id)
          .eq("status", "pending"),
        supabase
          .from("reports")
          .select("id, status")
          .eq("department_id", me.department_id)
          .maybeSingle(),
      ]);

      setStats({ facultyCount, pendingReq });
      setReport(rep as Report | null);
    }
    load();
  }, [supabase]);

  if (!stats) return <p className="text-sm text-slate-500">Loading department overview...</p>;

  return (
    <div className="space-y-8">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card label="Faculty in your department" value={stats.facultyCount} />
        <Card label="Pending access requests" value={stats.pendingReq} />
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Report status</p>
          <div className="mt-2">
            {report ? <StatusBadge value={report.status} /> : <span className="text-sm text-slate-400">Not started</span>}
          </div>
        </div>
      </div>

      {/* Quick Actions Panel */}
      <div>
        <h2 className="mb-4 text-base font-semibold text-slate-900">Dashboard Actions</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ActionCard
            title="Members"
            description="View department faculty list and invite new faculty members."
            href="/hod/faculty"
            badge={stats.facultyCount !== null ? `${stats.facultyCount} active` : undefined}
            icon="👥"
          />
          <ActionCard
            title="Accept Requests"
            description="Review, approve, or reject incoming faculty access requests."
            href="/hod/requests"
            badge={stats.pendingReq && stats.pendingReq > 0 ? `${stats.pendingReq} pending` : undefined}
            badgeColor="amber"
            icon="✉️"
          />
          <ActionCard
            title="Report & Files"
            description="Manage supporting documents (.xlsx, .pdf) for your department's NAAC report."
            href="/hod/report"
            icon="📊"
          />
          <ActionCard
            title="NAAC Uploads"
            description="Upload CSV or Excel data with automatic column mapping and validation."
            href="/naac-upload"
            icon="📤"
          />
          <ActionCard
            title="Accept Invite"
            description="Accept an invitation or set up credentials using an invite token."
            href="/accept-invite"
            icon="🔗"
          />
          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-300 transition-colors">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">🚪</span>
                <h3 className="text-sm font-semibold text-slate-900">Sign Out</h3>
              </div>
              <p className="text-xs text-slate-500">Securely sign out of your account and end current session.</p>
            </div>
            <div className="mt-4">
              <SignOutButton />
            </div>
          </div>
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

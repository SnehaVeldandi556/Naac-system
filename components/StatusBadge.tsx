import type { ProfileStatus, ReportStatus, RequestStatus } from "@/lib/supabase/types";

const COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  invited: "bg-amber-100 text-amber-800",
  disabled: "bg-slate-200 text-slate-600",
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  not_started: "bg-slate-200 text-slate-600",
  in_progress: "bg-blue-100 text-blue-800",
  under_review: "bg-amber-100 text-amber-800",
};

interface StatusBadgeProps {
  value?: ProfileStatus | ReportStatus | RequestStatus | string | null;
}

export default function StatusBadge({ value }: StatusBadgeProps) {
  const cls = (value && COLORS[value]) || "bg-slate-200 text-slate-600";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {value?.replace("_", " ")}
    </span>
  );
}

"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/supabaseClient";
import StatusBadge from "@/components/StatusBadge";
import type { Profile } from "@/lib/supabase/types";

export default function FacultyMembersPage() {
  const supabase = supabaseBrowser();
  const [members, setMembers] = useState<Profile[]>([]);
  const [deptName, setDeptName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      const { data: me } = await supabase
        .from("profiles")
        .select("department_id")
        .eq("id", session.user.id)
        .maybeSingle();

      if (me?.department_id) {
        const [{ data: dept }, { data: list }] = await Promise.all([
          supabase.from("departments").select("name").eq("id", me.department_id).maybeSingle(),
          supabase
            .from("profiles")
            .select("id, full_name, email, role, status")
            .eq("department_id", me.department_id)
            .order("role")
            .order("full_name"),
        ]);

        if (dept?.name) {
          setDeptName(dept.name);
        }
        setMembers((list as unknown as Profile[]) || []);
      }
      setLoading(false);
    }
    load();
  }, [supabase]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          Department Members {deptName ? `— ${deptName}` : ""}
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Faculty and HOD members in your department.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-slate-900">{m.full_name || "—"}</td>
                <td className="px-4 py-3 text-slate-600">{m.email}</td>
                <td className="px-4 py-3 uppercase text-xs font-semibold text-slate-500">{m.role}</td>
                <td className="px-4 py-3">
                  <StatusBadge value={m.status} />
                </td>
              </tr>
            ))}
            {!loading && members.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-slate-400" colSpan={4}>
                  No department members found.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td className="px-4 py-6 text-center text-slate-400" colSpan={4}>
                  Loading members...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

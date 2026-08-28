// POST /api/delete-file { file_id } — HOD (own dept) or admin only.
// Soft delete: keeps the row for audit purposes, removes it from the storage
// bucket, and stamps who removed it and when.
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/supabaseServer";

export async function POST(req: NextRequest) {
  const { file_id } = await req.json();
  const supabase = await supabaseServer();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, department_id")
    .eq("id", session.user.id)
    .single();

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  if (!["hod", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { data: file } = await supabase.from("files").select("*").eq("id", file_id).single();
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  if (profile.role === "hod" && file.department_id !== profile.department_id) {
    return NextResponse.json({ error: "Not authorized for this department" }, { status: 403 });
  }

  await supabase.storage.from("naac-project").remove([file.storage_path]);
  await supabase
    .from("files")
    .update({ deleted_at: new Date().toISOString(), deleted_by: profile.id })
    .eq("id", file_id);

  return NextResponse.json({ ok: true });
}

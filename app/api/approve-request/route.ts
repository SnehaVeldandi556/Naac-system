// POST /api/approve-request  { request_id }
// Admin approves a HOD request, or a HOD approves a faculty request in their
// own department. Approving triggers the same real invite-email flow as a
// direct invite, so the person still sets their own password.
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/supabase/supabaseAdmin";

export async function POST(req: NextRequest) {
  const { request_id } = await req.json();
  const supabase = await supabaseServer();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: caller } = await supabase
    .from("profiles")
    .select("id, role, department_id")
    .eq("id", session.user.id)
    .single();

  if (!caller) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const admin = supabaseAdmin();
  const { data: reqRow } = await admin
    .from("access_requests")
    .select("*")
    .eq("id", request_id)
    .single();

  if (!reqRow) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  const authorized =
    (caller.role === "admin" && reqRow.role === "hod") ||
    (caller.role === "hod" && reqRow.role === "faculty" && reqRow.requested_to === caller.id);

  if (!authorized) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL}/accept-invite`;
  const { data: invitedUser, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
    reqRow.email,
    { redirectTo, data: { full_name: reqRow.full_name, role: reqRow.role, department_id: reqRow.department_id } }
  );
  if (inviteErr) return NextResponse.json({ error: inviteErr.message }, { status: 400 });

  await admin.from("profiles").insert({
    id: invitedUser.user.id,
    email: reqRow.email,
    full_name: reqRow.full_name,
    role: reqRow.role,
    department_id: reqRow.department_id,
    status: "invited",
  });

  await admin
    .from("access_requests")
    .update({ status: "approved", responded_at: new Date().toISOString(), responded_by: caller.id })
    .eq("id", request_id);

  return NextResponse.json({ ok: true });
}

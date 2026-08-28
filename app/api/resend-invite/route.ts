// POST /api/resend-invite { profile_id }
// Cleanly re-issues an invite for someone who was invited but never accepted.
// Supabase refuses to invite an email that's already registered, so this
// deletes the stale (unconfirmed) auth user first, then sends a brand new
// invite email — same effect as the manual "delete user in dashboard, invite
// again" workaround, done safely from inside the app with authorization checks.
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/supabase/supabaseAdmin";

export async function POST(req: NextRequest) {
  const { profile_id } = await req.json();
  if (!profile_id) return NextResponse.json({ error: "profile_id is required" }, { status: 400 });

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
  const { data: target } = await admin
    .from("profiles")
    .select("id, email, full_name, role, department_id, status")
    .eq("id", profile_id)
    .single();

  if (!target) return NextResponse.json({ error: "Member not found" }, { status: 404 });
  if (target.status !== "invited") {
    return NextResponse.json({ error: "This member has already accepted their invite." }, { status: 400 });
  }

  const authorized =
    (caller.role === "admin" && target.role === "hod") ||
    (caller.role === "hod" && target.role === "faculty" && target.department_id === caller.department_id);

  if (!authorized) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  // Delete the stale, never-accepted auth user. profiles row cascades on delete.
  const { error: deleteErr } = await admin.auth.admin.deleteUser(target.id);
  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 400 });

  await admin
    .from("invites")
    .update({ status: "revoked", responded_at: new Date().toISOString() })
    .eq("email", target.email)
    .eq("status", "pending");

  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL}/accept-invite`;
  const { data: invitedUser, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
    target.email,
    { redirectTo, data: { full_name: target.full_name, role: target.role, department_id: target.department_id } }
  );
  if (inviteErr) return NextResponse.json({ error: inviteErr.message }, { status: 400 });

  const { error: profileErr } = await admin.from("profiles").insert({
    id: invitedUser.user.id,
    email: target.email,
    full_name: target.full_name,
    role: target.role,
    department_id: target.department_id,
    status: "invited",
  });
  if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 400 });

  await admin.from("invites").insert({
    email: target.email,
    full_name: target.full_name,
    role: target.role,
    department_id: target.department_id,
    invited_by: caller.id,
    status: "pending",
  });

  return NextResponse.json({ ok: true });
}

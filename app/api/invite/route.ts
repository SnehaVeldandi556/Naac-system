// POST /api/invite
// Called by an admin (inviting a HOD) or a HOD (inviting faculty in their
// own department). Creates the auth user via Supabase Admin, sends the real
// invite email through Supabase Auth, and creates a matching profile row
// with status "invited" until the person accepts and sets a password.
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/supabase/supabaseAdmin";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { email, full_name, role, department_id } = body;

  if (!email || !role) {
    return NextResponse.json({ error: "email and role are required" }, { status: 400 });
  }

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

  // Authorization: admin can invite HODs (any dept); HOD can only invite
  // faculty into their own department.
  if (caller.role === "admin" && role !== "hod") {
    return NextResponse.json({ error: "Admin can only invite HODs" }, { status: 403 });
  }
  if (caller.role === "hod") {
    if (role !== "faculty") {
      return NextResponse.json({ error: "HOD can only invite faculty" }, { status: 403 });
    }
  }
  if (!["admin", "hod"].includes(caller.role)) {
    return NextResponse.json({ error: "Not authorized to invite" }, { status: 403 });
  }

  const finalDeptId = caller.role === "hod" ? caller.department_id : department_id;
  if (!finalDeptId) {
    return NextResponse.json({ error: "department_id is required" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL}/accept-invite`;

  // This sends a real invite email via Supabase Auth's email provider.
  const { data: invitedUser, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
    email,
    { redirectTo, data: { full_name, role, department_id: finalDeptId } }
  );

  if (inviteErr) {
    return NextResponse.json({ error: inviteErr.message }, { status: 400 });
  }

  // Create the profile row now so RBAC/dashboards can reference it immediately.
  const { error: profileErr } = await admin.from("profiles").insert({
    id: invitedUser.user.id,
    email,
    full_name: full_name || null,
    role,
    department_id: finalDeptId,
    status: "invited",
  });

  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 400 });
  }

  await admin.from("invites").insert({
    email,
    full_name,
    role,
    department_id: finalDeptId,
    invited_by: caller.id,
    status: "pending",
  });

  return NextResponse.json({ ok: true });
}

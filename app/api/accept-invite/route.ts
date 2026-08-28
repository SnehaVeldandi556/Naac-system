// POST /api/request-access
// Public endpoint (no session yet). A prospective HOD requests access from
// admin; a prospective faculty member requests access from the HOD of their
// department. Admin/HOD later approve or reject from their dashboard.
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/supabaseAdmin";

export async function POST(req: NextRequest) {
  const { email, full_name, role, department_id } = await req.json();

  if (!email || !role || !department_id) {
    return NextResponse.json({ error: "email, role and department_id are required" }, { status: 400 });
  }
  if (!["hod", "faculty"].includes(role)) {
    return NextResponse.json({ error: "role must be hod or faculty" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  let requested_to: string | null = null;

  if (role === "faculty") {
    const { data: hod } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "hod")
      .eq("department_id", department_id)
      .eq("status", "active")
      .maybeSingle();

    if (!hod) {
      return NextResponse.json(
        { error: "This department has no active HOD yet to approve your request." },
        { status: 400 }
      );
    }
    requested_to = hod.id;
  }
  // role === "hod": requested_to stays null -> visible to every admin.

  const { error } = await admin.from("access_requests").insert({
    email,
    full_name,
    role,
    department_id,
    requested_to,
    status: "pending",
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

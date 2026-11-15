// app/api/reject-request/route.ts
// POST /api/reject-request { request_id }
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/supabase/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
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
      (caller.role === "hod" && reqRow.role === "faculty" && (reqRow.requested_to === caller.id || reqRow.department_id === caller.department_id));

    if (!authorized) return NextResponse.json({ error: "Not authorized to reject this request" }, { status: 403 });

    await admin
      .from("access_requests")
      .update({
        status: "rejected",
        responded_at: new Date().toISOString(),
        responded_by: caller.id,
      })
      .eq("id", request_id);

    return NextResponse.json({ ok: true, message: "Request rejected successfully." });
  } catch (err) {
    console.error("[POST /api/reject-request] Error:", err);
    return NextResponse.json({ error: (err as Error).message || "Internal server error" }, { status: 500 });
  }
}

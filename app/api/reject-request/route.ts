// POST /api/reject-request { request_id }
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
    .select("id, role")
    .eq("id", session.user.id)
    .single();

  if (!caller) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const admin = supabaseAdmin();
  await admin
    .from("access_requests")
    .update({ status: "rejected", responded_at: new Date().toISOString(), responded_by: caller.id })
    .eq("id", request_id);

  return NextResponse.json({ ok: true });
}

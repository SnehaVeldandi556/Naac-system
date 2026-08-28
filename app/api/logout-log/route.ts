// POST /api/logout-log { user_id } — stamps logout_at on the user's most
// recent still-open session row.
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/supabaseAdmin";

export async function POST(req: NextRequest) {
  const { user_id } = await req.json();
  const admin = supabaseAdmin();

  const { data: open } = await admin
    .from("login_sessions")
    .select("id")
    .eq("user_id", user_id)
    .is("logout_at", null)
    .order("login_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (open) {
    await admin.from("login_sessions").update({ logout_at: new Date().toISOString() }).eq("id", open.id);
  }

  return NextResponse.json({ ok: true });
}

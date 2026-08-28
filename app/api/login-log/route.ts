// app/api/login-log/route.ts
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const { user_id } = await req.json();
  const supabase = await getSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session || session.user.id !== user_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await supabase.from("login_sessions").insert({ user_id });
  return NextResponse.json({ ok: true });
}   
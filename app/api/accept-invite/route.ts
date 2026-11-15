// app/api/accept-invite/route.ts
// POST /api/accept-invite
// Called after user verifies their invite OTP and sets their initial password.
// Marks their profile as "active", invites record as "accepted", and completes onboarding.
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/supabase/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    let userId = session?.user?.id;
    let userEmail = session?.user?.email?.toLowerCase();

    // Fallback: If session not passed in cookies yet, check JSON body
    if (!userId) {
      try {
        const body = await req.json();
        if (body.user_id) userId = body.user_id;
        if (body.email) userEmail = body.email.toLowerCase();
      } catch {
        // Body was empty or non-JSON
      }
    }

    if (!userId && !userEmail) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const admin = supabaseAdmin();

    // 1. Activate profile
    if (userId) {
      const { error: profErr } = await admin
        .from("profiles")
        .update({ status: "active" })
        .eq("id", userId);

      if (profErr) {
        console.error("[accept-invite] Error updating profile status:", profErr);
      }
    } else if (userEmail) {
      await admin
        .from("profiles")
        .update({ status: "active" })
        .eq("email", userEmail);
    }

    // 2. Mark pending invite as accepted
    if (userEmail) {
      await admin
        .from("invites")
        .update({
          status: "accepted",
          responded_at: new Date().toISOString(),
        })
        .eq("email", userEmail)
        .eq("status", "pending");

      // 3. Mark pending access request as approved
      await admin
        .from("access_requests")
        .update({
          status: "approved",
          responded_at: new Date().toISOString(),
        })
        .eq("email", userEmail)
        .eq("status", "pending");
    }

    return NextResponse.json({ ok: true, message: "Invitation accepted and account activated." });
  } catch (err) {
    console.error("[POST /api/accept-invite] Error:", err);
    return NextResponse.json({ error: (err as Error).message || "Internal server error" }, { status: 500 });
  }
}

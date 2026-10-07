// app/api/reject-invite/route.ts
// POST /api/reject-invite
// Called when an invitee declines/rejects the invitation from the accept-invite page or email link.
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token_hash, email } = body;

    const admin = supabaseAdmin();
    let targetEmail = email?.trim().toLowerCase();

    // If email is not passed directly, try resolving it from pending invite with token
    if (!targetEmail && token_hash) {
      const { data: inv } = await admin
        .from("invites")
        .select("email")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (inv?.email) targetEmail = inv.email;
    }

    if (!targetEmail) {
      // If we still don't have an email, mark all oldest pending invite or return error
      return NextResponse.json({ error: "Email or valid invitation is required" }, { status: 400 });
    }

    // 1. Mark invite as revoked
    await admin
      .from("invites")
      .update({
        status: "revoked",
        responded_at: new Date().toISOString(),
      })
      .eq("email", targetEmail)
      .eq("status", "pending");

    // 2. Mark access request as rejected (if any pending)
    await admin
      .from("access_requests")
      .update({
        status: "rejected",
        responded_at: new Date().toISOString(),
      })
      .eq("email", targetEmail)
      .eq("status", "pending");

    // 3. Clean up unconfirmed auth user and invited profile to keep database clean
    const { data: listData } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const authUser = listData?.users?.find(
      (u) => u.email?.toLowerCase() === targetEmail && !u.email_confirmed_at
    );

    if (authUser) {
      await admin.from("profiles").delete().eq("id", authUser.id);
      await admin.auth.admin.deleteUser(authUser.id);
    } else {
      // Just mark profile disabled if it was invited
      await admin
        .from("profiles")
        .update({ status: "disabled" })
        .eq("email", targetEmail)
        .eq("status", "invited");
    }

    return NextResponse.json({
      ok: true,
      message: "Invitation declined. No account was activated.",
    });
  } catch (err) {
    console.error("[POST /api/reject-invite] Error:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Internal server error" },
      { status: 500 }
    );
  }
}

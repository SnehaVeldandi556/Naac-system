// app/api/approve-request/route.ts
// POST /api/approve-request { request_id }
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/supabase/supabaseAdmin";
import { sendInviteEmail } from "@/lib/email/sendEmail";
import { randomUUID } from "crypto";

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

    if (!authorized) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

    const normalizedEmail = reqRow.email.trim().toLowerCase();
    const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/accept-invite`;

    // Check if existing unconfirmed or stale user exists
    const { data: listData } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const existingUser = listData?.users?.find(
      (u) => u.email?.toLowerCase() === normalizedEmail
    );

    if (existingUser) {
      await admin.from("profiles").delete().eq("id", existingUser.id);
      await admin.auth.admin.deleteUser(existingUser.id);
    }

    let newUserId: string;
    let inviteLink: string | null = null;
    let emailWarning: string | null = null;

    if (process.env.RESEND_API_KEY || process.env.SMTP_HOST) {
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "invite",
        email: normalizedEmail,
        options: {
          redirectTo,
          data: { full_name: reqRow.full_name, role: reqRow.role, department_id: reqRow.department_id },
        },
      });

      if (linkErr || !linkData?.user) {
        return NextResponse.json({ error: linkErr?.message || "Failed to generate invite" }, { status: 400 });
      }

      newUserId = linkData.user.id;
      const tokenHash = linkData.properties?.hashed_token;
      inviteLink = tokenHash
        ? `${redirectTo}?token_hash=${tokenHash}&type=invite`
        : linkData.properties?.action_link || redirectTo;

      const emailRes = await sendInviteEmail({
        to: normalizedEmail,
        fullName: reqRow.full_name,
        role: reqRow.role,
        inviterRole: caller.role === "admin" ? "System Administrator" : "Head of Department",
        inviteLink,
      });

      if (!emailRes.success) {
        console.warn(`[Approve] Direct email delivery failed: ${emailRes.error}. Setup link generated: ${inviteLink}`);
        emailWarning = emailRes.error || "Email delivery failed";
      }
    } else {
      const { data: invitedUser, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
        normalizedEmail,
        {
          redirectTo,
          data: { full_name: reqRow.full_name, role: reqRow.role, department_id: reqRow.department_id },
        }
      );

      if (inviteErr || !invitedUser?.user) {
        return NextResponse.json({ error: inviteErr?.message || "Failed to dispatch invite email" }, { status: 400 });
      }

      newUserId = invitedUser.user.id;
    }

    await admin.from("profiles").upsert({
      id: newUserId,
      email: normalizedEmail,
      full_name: reqRow.full_name,
      role: reqRow.role,
      department_id: reqRow.department_id,
      status: "invited",
    });

    await admin
      .from("access_requests")
      .update({ status: "approved", responded_at: new Date().toISOString(), responded_by: caller.id })
      .eq("id", request_id);

    await admin.from("invites").insert({
      email: normalizedEmail,
      full_name: reqRow.full_name,
      role: reqRow.role,
      department_id: reqRow.department_id,
      invited_by: caller.id,
      token: randomUUID(),
      status: "pending",
    });

    return NextResponse.json({
      ok: true,
      message: emailWarning
        ? `Request approved! Note: Email delivery failed (${emailWarning}). You can copy the setup link below directly to the user.`
        : `Request approved and invitation email sent to ${normalizedEmail}.`,
      inviteLink: inviteLink || null,
      emailWarning: emailWarning || null,
    });
  } catch (err) {
    console.error("[POST /api/approve-request] Error:", err);
    return NextResponse.json({ error: (err as Error).message || "Internal server error" }, { status: 500 });
  }
}

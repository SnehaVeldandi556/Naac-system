// app/api/resend-invite/route.ts
// POST /api/resend-invite { profile_id }
// Re-issues a real email invite through Resend (or Supabase SMTP).
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/supabase/supabaseAdmin";
import { sendInviteEmail } from "@/lib/email/sendEmail";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  try {
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
    if (target.status === "active") {
      return NextResponse.json({ error: "This member has already accepted their invite." }, { status: 400 });
    }

    const authorized =
      (caller.role === "admin" && target.role === "hod") ||
      (caller.role === "hod" && target.role === "faculty" && target.department_id === caller.department_id);

    if (!authorized) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

    // Clean up previous profile & auth record to permit clean invite
    await admin.from("profiles").delete().eq("id", target.id);
    await admin.auth.admin.deleteUser(target.id);

    await admin
      .from("invites")
      .update({ status: "revoked", responded_at: new Date().toISOString() })
      .eq("email", target.email.toLowerCase())
      .eq("status", "pending");

    const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/accept-invite`;
    let newUserId: string;
    let inviteLink: string | null = null;
    let emailWarning: string | null = null;

    if (process.env.RESEND_API_KEY || process.env.SMTP_HOST) {
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "invite",
        email: target.email.toLowerCase(),
        options: {
          redirectTo,
          data: { full_name: target.full_name, role: target.role, department_id: target.department_id },
        },
      });

      if (linkErr || !linkData?.user) {
        return NextResponse.json({ error: linkErr?.message || "Failed to re-issue invite" }, { status: 400 });
      }

      newUserId = linkData.user.id;
      const tokenHash = linkData.properties?.hashed_token;
      inviteLink = tokenHash
        ? `${redirectTo}?token_hash=${tokenHash}&type=invite`
        : linkData.properties?.action_link || redirectTo;

      const emailRes = await sendInviteEmail({
        to: target.email,
        fullName: target.full_name,
        role: target.role,
        inviterRole: caller.role === "admin" ? "System Administrator" : "Head of Department",
        inviteLink,
      });

      if (!emailRes.success) {
        console.warn(`[Resend Invite] Direct email delivery failed: ${emailRes.error}. Setup link generated: ${inviteLink}`);
        emailWarning = emailRes.error || "Email delivery failed";
      }
    } else {
      const { data: invitedUser, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
        target.email.toLowerCase(),
        {
          redirectTo,
          data: { full_name: target.full_name, role: target.role, department_id: target.department_id },
        }
      );

      if (inviteErr || !invitedUser?.user) {
        return NextResponse.json({ error: inviteErr?.message || "Failed to resend invite email" }, { status: 400 });
      }

      newUserId = invitedUser.user.id;
    }

    await admin.from("profiles").upsert({
      id: newUserId,
      email: target.email.toLowerCase(),
      full_name: target.full_name,
      role: target.role,
      department_id: target.department_id,
      status: "invited",
    });

    await admin.from("invites").insert({
      email: target.email.toLowerCase(),
      full_name: target.full_name,
      role: target.role,
      department_id: target.department_id,
      invited_by: caller.id,
      token: randomUUID(),
      status: "pending",
    });

    return NextResponse.json({
      ok: true,
      message: emailWarning
        ? `Invitation re-issued! Note: Email delivery failed (${emailWarning}). You can copy the setup link below directly to the user.`
        : `Invitation email successfully re-sent to ${target.email}.`,
      inviteLink: inviteLink || null,
      emailWarning: emailWarning || null,
    });
  } catch (err) {
    console.error("[POST /api/resend-invite] Unexpected error:", err);
    return NextResponse.json({ error: (err as Error).message || "Internal server error" }, { status: 500 });
  }
}

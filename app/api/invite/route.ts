// app/api/invite/route.ts
// POST /api/invite
// Called by an admin (inviting a HOD) or a HOD (inviting faculty in their
// own department). Sends the real invite email using Resend (or Supabase SMTP)
// and creates a profile row with status "invited".
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/supabaseServer";
import { supabaseAdmin } from "@/lib/supabase/supabaseAdmin";
import { sendInviteEmail } from "@/lib/email/sendEmail";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, full_name, role, department_id } = body;

    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail || !role) {
      return NextResponse.json({ error: "Email and role are required" }, { status: 400 });
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

    if (!caller) return NextResponse.json({ error: "Caller profile not found" }, { status: 404 });

    // Authorization
    if (caller.role === "admin" && role !== "hod") {
      return NextResponse.json({ error: "Admin can only invite HODs" }, { status: 403 });
    }
    if (caller.role === "hod" && role !== "faculty") {
      return NextResponse.json({ error: "HOD can only invite faculty" }, { status: 403 });
    }
    if (!["admin", "hod"].includes(caller.role)) {
      return NextResponse.json({ error: "Not authorized to invite" }, { status: 403 });
    }

    const finalDeptId = caller.role === "hod" ? caller.department_id : department_id;
    if (!finalDeptId) {
      return NextResponse.json({ error: "Department is required" }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/accept-invite`;

    // 1. Check if user is already an ACTIVE member in profiles
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id, email, role, status, department:departments(name)")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingProfile && existingProfile.status === "active") {
      const deptName = (existingProfile.department as unknown as { name?: string })?.name || "assigned department";
      return NextResponse.json(
        {
          error: `An active account with ${normalizedEmail} already exists (${existingProfile.role.toUpperCase()} in ${deptName}). If they forgot their password, they can sign in or reset it.`,
        },
        { status: 400 }
      );
    }

    // 2. Check if auth user exists in auth.users
    const { data: listData } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const existingAuthUser = listData?.users?.find(
      (u) => u.email?.toLowerCase() === normalizedEmail
    );

    // If an unconfirmed, invited, or stale auth user exists, clean them up first
    if (existingAuthUser) {
      await admin
        .from("invites")
        .update({ status: "revoked", responded_at: new Date().toISOString() })
        .eq("email", normalizedEmail)
        .eq("status", "pending");

      if (existingProfile) {
        await admin.from("profiles").delete().eq("id", existingProfile.id);
      }

      await admin.auth.admin.deleteUser(existingAuthUser.id);
    } else if (existingProfile) {
      await admin.from("profiles").delete().eq("id", existingProfile.id);
    }

    let userId: string;
    let inviteLink: string | null = null;
    let emailWarning: string | null = null;

    // 3. Dispatch Email: Check if RESEND_API_KEY (or local SMTP) is configured
    if (process.env.RESEND_API_KEY || process.env.SMTP_HOST) {
      // Generate secure invite link & auth user
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "invite",
        email: normalizedEmail,
        options: {
          redirectTo,
          data: { full_name: full_name?.trim() || null, role, department_id: finalDeptId },
        },
      });

      if (linkErr || !linkData?.user) {
        return NextResponse.json({ error: linkErr?.message || "Failed to create invitation" }, { status: 400 });
      }

      userId = linkData.user.id;
      const tokenHash = linkData.properties?.hashed_token;
      inviteLink = tokenHash
        ? `${redirectTo}?token_hash=${tokenHash}&type=invite`
        : linkData.properties?.action_link || redirectTo;

      // Send the real email
      const emailRes = await sendInviteEmail({
        to: normalizedEmail,
        fullName: full_name,
        role,
        inviterRole: caller.role === "admin" ? "System Administrator" : "Head of Department",
        inviteLink,
      });

      if (!emailRes.success) {
        console.warn(`[Invite] Direct email delivery failed: ${emailRes.error}. Setup link generated: ${inviteLink}`);
        emailWarning = emailRes.error || "Email delivery failed";
      }
    } else {
      // Fallback: Send via Supabase SMTP
      const { data: invitedUser, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
        normalizedEmail,
        {
          redirectTo,
          data: { full_name: full_name?.trim() || null, role, department_id: finalDeptId },
        }
      );

      if (inviteErr || !invitedUser?.user) {
        return NextResponse.json(
          { error: inviteErr?.message || "Failed to dispatch invitation email via Supabase." },
          { status: 400 }
        );
      }

      userId = invitedUser.user.id;
    }

    // 4. Create Profile row
    const { error: profileErr } = await admin.from("profiles").upsert({
      id: userId,
      email: normalizedEmail,
      full_name: full_name?.trim() || null,
      role,
      department_id: finalDeptId,
      status: "invited",
    });

    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 400 });
    }

    // 5. Insert into invites table
    await admin.from("invites").insert({
      email: normalizedEmail,
      full_name: full_name?.trim() || null,
      role,
      department_id: finalDeptId,
      invited_by: caller.id,
      token: randomUUID(),
      status: "pending",
    });

    // 6. If an access_request was pending for this email, mark it approved
    await admin
      .from("access_requests")
      .update({
        status: "approved",
        responded_at: new Date().toISOString(),
        responded_by: caller.id,
      })
      .eq("email", normalizedEmail)
      .eq("status", "pending");

    return NextResponse.json({
      ok: true,
      message: emailWarning
        ? `Invitation created! Note: SMTP email delivery failed (${emailWarning}). You can copy the setup link below directly to the user.`
        : `Invitation email successfully sent to ${normalizedEmail}.`,
      inviteLink: inviteLink || null,
      emailWarning: emailWarning || null,
    });
  } catch (err) {
    console.error("[POST /api/invite] Unexpected error:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Internal server error" },
      { status: 500 }
    );
  }
}

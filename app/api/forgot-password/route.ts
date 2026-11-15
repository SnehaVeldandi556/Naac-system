import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendNotificationEmail } from "@/lib/email/sendEmail";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ error: "Please provide a valid email address." }, { status: 400 });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const supabaseAdmin = getSupabaseAdminClient();

    // Check if the user exists in profiles
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name")
      .eq("email", trimmedEmail)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json(
        { error: "No registered account found with that email address. Please check spelling or request access." },
        { status: 404 }
      );
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const redirectTo = `${siteUrl}/reset-password`;

    // Generate secure Supabase password recovery link
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: trimmedEmail,
      options: {
        redirectTo,
      },
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error("[Forgot Password] generateLink error:", linkError);
      return NextResponse.json(
        { error: linkError?.message || "Failed to generate password reset link." },
        { status: 500 }
      );
    }

    const resetLink = linkData.properties.action_link;

    // Dispatch via SMTP / Gmail
    const emailResult = await sendNotificationEmail({
      to: trimmedEmail,
      subject: "Reset your NAAC Portal Password",
      title: "Password Reset Request",
      message: `Hello ${profile.full_name || "Faculty Member"},<br/><br/>We received a request to reset your password for the NAAC Accreditation Portal. Click the button below to set a new password. If you did not make this request, you can safely ignore this email.`,
      actionUrl: resetLink,
      actionLabel: "Choose New Password",
    });

    if (!emailResult.success) {
      console.warn("[Forgot Password] Email send warning:", emailResult.error);
    }

    return NextResponse.json({
      success: true,
      message: "A password reset link has been sent to your email. Please check your inbox and spam folder.",
    });
  } catch (err) {
    console.error("[Forgot Password] Unexpected error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error." },
      { status: 500 }
    );
  }
}

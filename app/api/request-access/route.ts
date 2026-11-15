// app/api/request-access/route.ts
// GET /api/request-access -> Returns public list of departments
// POST /api/request-access -> Prospective HOD or Faculty submits access request
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/supabaseAdmin";
import { sendNotificationEmail } from "@/lib/email/sendEmail";

export async function GET() {
  try {
    const admin = supabaseAdmin();
    const { data, error } = await admin.from("departments").select("id, name").order("name");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data || []);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { email, full_name, role, department_id } = await req.json();

    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail || !role || !department_id) {
      return NextResponse.json({ error: "Email, role and department are required" }, { status: 400 });
    }
    if (!["hod", "faculty"].includes(role)) {
      return NextResponse.json({ error: "Role must be either HOD or Faculty" }, { status: 400 });
    }

    const admin = supabaseAdmin();

    // 1. Resolve department_id (supports UUID or department name string)
    let finalDeptId = department_id;
    let deptName = "";
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(department_id);

    if (isUuid) {
      const { data: dept } = await admin
        .from("departments")
        .select("id, name")
        .eq("id", department_id)
        .maybeSingle();
      if (dept) deptName = dept.name;
    } else {
      const { data: dept } = await admin
        .from("departments")
        .select("id, name")
        .ilike("name", department_id.trim())
        .maybeSingle();

      if (dept) {
        finalDeptId = dept.id;
        deptName = dept.name;
      } else {
        return NextResponse.json({ error: `Department "${department_id}" not found.` }, { status: 400 });
      }
    }

    // 2. Check if account already exists and is active
    const { data: existingProf } = await admin
      .from("profiles")
      .select("id, status, role")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingProf?.status === "active") {
      return NextResponse.json(
        { error: "An active account with this email already exists. Please sign in directly." },
        { status: 400 }
      );
    }

    // 3. Check if duplicate pending request exists
    const { data: existingReq } = await admin
      .from("access_requests")
      .select("id")
      .eq("email", normalizedEmail)
      .eq("status", "pending")
      .maybeSingle();

    if (existingReq) {
      return NextResponse.json(
        { error: "An access request for this email is already pending review." },
        { status: 400 }
      );
    }

    let requested_to: string | null = null;
    let hodEmail: string | null = null;

    if (role === "faculty") {
      const { data: hod } = await admin
        .from("profiles")
        .select("id, email")
        .eq("role", "hod")
        .eq("department_id", finalDeptId)
        .eq("status", "active")
        .maybeSingle();

      if (!hod) {
        return NextResponse.json(
          { error: "This department does not have an active HOD yet to approve your request. Please contact your administrator." },
          { status: 400 }
        );
      }
      requested_to = hod.id;
      hodEmail = hod.email;
    }

    // 4. Insert access request
    const { error: insertErr } = await admin.from("access_requests").insert({
      email: normalizedEmail,
      full_name: full_name?.trim() || null,
      role,
      department_id: finalDeptId,
      requested_to,
      status: "pending",
    });

    if (insertErr) {
      console.error("[request-access] Insert error:", insertErr);
      return NextResponse.json({ error: insertErr.message }, { status: 400 });
    }

    // 5. Send notification email to the reviewer
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const applicantName = full_name?.trim() || normalizedEmail;

    if (role === "hod") {
      // Find admin email (or default to naacssradmin@gmail.com)
      const { data: adminProf } = await admin
        .from("profiles")
        .select("email")
        .eq("role", "admin")
        .limit(1)
        .maybeSingle();

      const adminEmail = adminProf?.email || process.env.SMTP_USER || "naacssradmin@gmail.com";

      await sendNotificationEmail({
        to: adminEmail,
        subject: `New HOD Access Request: ${applicantName}`,
        title: "New HOD Access Request",
        message: `<strong>${applicantName}</strong> (${normalizedEmail}) has requested access as <strong>Head of Department (${deptName || "Department"})</strong>.<br><br>Please review and approve or reject this request in the admin portal. Upon your approval, an invitation email will be automatically sent to the candidate to set their password and log in.`,
        actionUrl: `${siteUrl}/admin/requests`,
        actionLabel: "Review HOD Requests",
      }).catch((e) => console.error("[Notification to Admin failed]:", e));
    } else if (role === "faculty" && hodEmail) {
      await sendNotificationEmail({
        to: hodEmail,
        subject: `New Faculty Access Request: ${applicantName}`,
        title: "New Faculty Access Request",
        message: `<strong>${applicantName}</strong> (${normalizedEmail}) has requested to join your department (${deptName || "Department"}) as a Faculty member.<br><br>Please review and approve or reject this request in your HOD portal.`,
        actionUrl: `${siteUrl}/hod/requests`,
        actionLabel: "Review Faculty Requests",
      }).catch((e) => console.error("[Notification to HOD failed]:", e));
    }

    return NextResponse.json({
      ok: true,
      message: "Request submitted successfully. Your administrator or HOD has been notified.",
    });
  } catch (err) {
    console.error("[POST /api/request-access] Error:", err);
    return NextResponse.json({ error: (err as Error).message || "Internal server error" }, { status: 500 });
  }
}

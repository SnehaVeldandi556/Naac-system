import nodemailer from "nodemailer";

interface SendInviteParams {
  to: string;
  fullName?: string | null;
  role: string;
  inviterRole?: string;
  inviteLink: string;
}

export async function sendInviteEmail({
  to,
  fullName,
  role,
  inviterRole = "Administrator",
  inviteLink,
}: SendInviteParams): Promise<{ success: boolean; error?: string }> {
  const roleTitle = role.toUpperCase();
  const recipientName = fullName?.trim() || "Colleague";
  const rejectLink = `${inviteLink}&action=reject`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Portal Invitation</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 40px 20px; color: #1e293b;">
        <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
          <div style="background-color: #0f172a; padding: 24px 32px;">
            <p style="color: #94a3b8; font-size: 11px; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em; margin: 0 0 4px 0;">NAAC Accreditation Portal</p>
            <h1 style="color: #ffffff; font-size: 20px; font-weight: 700; margin: 0;">Invitation to Join</h1>
          </div>
          
          <div style="padding: 32px;">
            <p style="font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">Hello <strong>${recipientName}</strong>,</p>
            
            <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 24px 0;">
              You have been invited by the <strong>${inviterRole}</strong> to join the <strong>NAAC Report Portal</strong> with the role of <span style="background-color: #f1f5f9; padding: 2px 8px; border-radius: 4px; font-weight: 600; color: #0f172a;">${roleTitle}</span>.
            </p>

            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 28px;">
              <p style="font-size: 13px; font-weight: 600; margin: 0 0 12px 0; color: #334155;">How would you like to respond?</p>
              <div style="display: flex; gap: 12px; margin-bottom: 12px;">
                <a href="${inviteLink}" style="display: inline-block; background-color: #0f172a; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 8px; text-align: center;">
                  ✓ Accept & Set Password
                </a>
                <a href="${rejectLink}" style="display: inline-block; background-color: #ffffff; border: 1px solid #cbd5e1; color: #e11d48; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 20px; border-radius: 8px; text-align: center; margin-left: 10px;">
                  ✕ Decline
                </a>
              </div>
              <p style="font-size: 12px; color: #64748b; margin: 0;">
                Clicking <strong>Accept</strong> will allow you to choose a secure password and enter your department portal.
              </p>
            </div>

            <div style="border-top: 1px solid #f1f5f9; padding-top: 20px;">
              <p style="font-size: 12px; color: #64748b; margin: 0 0 8px 0;">Or copy and paste this verification URL into your browser:</p>
              <p style="font-size: 11px; font-family: monospace; word-break: break-all; background-color: #f1f5f9; padding: 8px 12px; border-radius: 6px; color: #334155; margin: 0;">
                ${inviteLink}
              </p>
            </div>
          </div>

          <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 32px; text-align: center;">
            <p style="font-size: 12px; color: #94a3b8; margin: 0;">
              If you did not expect this invitation, you can simply click Decline or ignore this email.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;

  // 1. Try Resend API (if RESEND_API_KEY is configured)
  const resendApiKey = process.env.RESEND_API_KEY;
  let resendError: string | undefined;

  if (resendApiKey) {
    try {
      const from = process.env.RESEND_FROM || "NAAC Report Portal <onboarding@resend.dev>";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject: `Invitation to join NAAC Report Portal as ${roleTitle}`,
          html: htmlContent,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        console.log(`[Email Dispatch] Successfully sent invite email to ${to} via Resend. (ID: ${data.id})`);
        return { success: true };
      }

      console.error("[Email Dispatch - Resend Error]:", data);
      resendError = data.message || "Failed to send email via Resend";
    } catch (err) {
      console.error("[Email Dispatch - Resend Error]:", err);
      resendError = (err as Error).message;
    }
  }

  // 2. Try SMTP via Nodemailer (Brevo, Gmail, custom SMTP)
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const rawPass = process.env.SMTP_PASS;
  // Automatically strip spaces if the user pasted a 16-char Google App Password (e.g. 'xxxx xxxx xxxx xxxx')
  const pass = rawPass?.replace(/\s+/g, "");
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const from = process.env.SMTP_FROM || `"NAAC Report Portal" <${user || "no-reply@naacportal.edu"}>`;

  if (host && user && pass) {
    try {
      const isGmail = host.toLowerCase().includes("gmail");
      const transporter = isGmail
        ? nodemailer.createTransport({
            service: "gmail",
            auth: { user, pass },
          })
        : nodemailer.createTransport({
            host,
            port,
            secure,
            auth: { user, pass },
          });

      await transporter.sendMail({
        from,
        to,
        subject: `Invitation to join NAAC Report Portal as ${roleTitle}`,
        html: htmlContent,
      });

      console.log(`[Email Dispatch] Successfully sent invite email to ${to} via SMTP (${host}).`);
      return { success: true };
    } catch (err) {
      console.error(`[Email Dispatch] Failed to send email to ${to} via SMTP:`, err);
      return { success: false, error: (err as Error).message };
    }
  }

  if (resendError) {
    return {
      success: false,
      error: resendError,
    };
  }

  console.warn(
    `[Email Dispatch] Neither RESEND_API_KEY nor SMTP settings (SMTP_HOST, SMTP_USER, SMTP_PASS) are configured in .env.local. Direct email dispatch skipped for ${to}.`
  );
  return {
    success: false,
    error: "No email service configured (Add RESEND_API_KEY or SMTP credentials in .env.local)",
  };
}

interface SendNotificationParams {
  to: string;
  subject: string;
  title: string;
  message: string;
  actionUrl: string;
  actionLabel: string;
}

export async function sendNotificationEmail({
  to,
  subject,
  title,
  message,
  actionUrl,
  actionLabel,
}: SendNotificationParams): Promise<{ success: boolean; error?: string }> {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 40px 20px; color: #1e293b;">
        <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
          <div style="background-color: #0f172a; padding: 24px 32px;">
            <p style="color: #94a3b8; font-size: 11px; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em; margin: 0 0 4px 0;">NAAC Accreditation Portal</p>
            <h1 style="color: #ffffff; font-size: 20px; font-weight: 700; margin: 0;">${title}</h1>
          </div>
          <div style="padding: 32px;">
            <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 24px 0;">
              ${message}
            </p>
            <div style="margin: 28px 0 20px 0;">
              <a href="${actionUrl}" style="display: inline-block; background-color: #0f172a; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 8px; text-align: center;">
                ${actionLabel}
              </a>
            </div>
            <p style="font-size: 12px; color: #64748b; margin: 0;">
              Or visit: <span style="font-family: monospace; background-color: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${actionUrl}</span>
            </p>
          </div>
        </div>
      </body>
    </html>
  `;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const rawPass = process.env.SMTP_PASS;
  const pass = rawPass?.replace(/\s+/g, "");
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const from = process.env.SMTP_FROM || `"NAAC Report Portal" <${user || "naacssradmin@gmail.com"}>`;

  if (host && user && pass) {
    try {
      const isGmail = host.toLowerCase().includes("gmail");
      const transporter = isGmail
        ? nodemailer.createTransport({
            service: "gmail",
            auth: { user, pass },
          })
        : nodemailer.createTransport({
            host,
            port,
            secure,
            auth: { user, pass },
          });
      await transporter.sendMail({
        from,
        to,
        subject,
        html: htmlContent,
      });
      console.log(`[Email Dispatch] Notification sent to ${to}`);
      return { success: true };
    } catch (err) {
      console.error(`[Email Dispatch] Failed to send notification to ${to}:`, err);
      return { success: false, error: (err as Error).message };
    }
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    try {
      const resFrom = process.env.RESEND_FROM || "NAAC Report Portal <onboarding@resend.dev>";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: resFrom,
          to: [to],
          subject,
          html: htmlContent,
        }),
      });
      const data = await res.json();
      if (res.ok) return { success: true };
      return { success: false, error: data.message };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  return { success: false, error: "No email service configured." };
}

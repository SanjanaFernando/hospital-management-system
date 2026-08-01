import nodemailer from "nodemailer";

// ---------------------------------------------------------------------------
// SMTP Transporter — configured via environment variables
// ---------------------------------------------------------------------------

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn(
      "⚠️ SMTP not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in .env.local"
    );
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

// ---------------------------------------------------------------------------
// Send welcome email with credentials
// ---------------------------------------------------------------------------

export async function sendWelcomeEmail(params: {
  to: string;
  displayName: string;
  userId: string;
  temporaryPassword: string;
  role: string;
  wardId?: string;
}): Promise<{ success: boolean; error?: string }> {
  const transporter = getTransporter();

  if (!transporter) {
    console.log("📧 SMTP not configured — printing credentials to console:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`  To:       ${params.to}`);
    console.log(`  Name:     ${params.displayName}`);
    console.log(`  User ID:  ${params.userId}`);
    console.log(`  Password: ${params.temporaryPassword}`);
    console.log(`  Role:     ${params.role}`);
    if (params.wardId) {
      console.log(`  Ward:     ${params.wardId}`);
    }
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    return { success: true };
  }

  const fromName = process.env.SMTP_FROM_NAME || "Karapitiya Teaching Hospital";
  const fromEmail = process.env.SMTP_USER;

  const wardInfo = params.wardId
    ? `<tr><td style="padding:8px 16px;color:#64748b;font-size:14px;">Assigned Ward</td><td style="padding:8px 16px;font-size:14px;font-weight:600;color:#0f172a;">${params.wardId.toUpperCase()}</td></tr>`
    : "";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0b2b33,#134e5e);padding:32px 24px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Karapitiya Teaching Hospital</h1>
      <p style="margin:8px 0 0;color:#99f6e4;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Bed & Queue Management System</p>
    </div>

    <!-- Body -->
    <div style="padding:32px 24px;">
      <h2 style="margin:0 0 8px;color:#0f172a;font-size:18px;">Welcome, ${params.displayName}!</h2>
      <p style="margin:0 0 24px;color:#64748b;font-size:14px;line-height:1.6;">
        Your account has been created. Use the credentials below to log in to the Hospital Management System.
      </p>

      <!-- Credentials Box -->
      <div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:12px;overflow:hidden;margin-bottom:24px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr style="border-bottom:1px solid #ccfbf1;">
            <td style="padding:12px 16px;color:#64748b;font-size:14px;">User ID</td>
            <td style="padding:12px 16px;font-size:20px;font-weight:700;color:#0d9488;font-family:monospace;letter-spacing:2px;">${params.userId}</td>
          </tr>
          <tr style="border-bottom:1px solid #ccfbf1;">
            <td style="padding:12px 16px;color:#64748b;font-size:14px;">Temporary Password</td>
            <td style="padding:12px 16px;font-size:16px;font-weight:700;color:#0f172a;font-family:monospace;">${params.temporaryPassword}</td>
          </tr>
          <tr style="border-bottom:1px solid #ccfbf1;">
            <td style="padding:8px 16px;color:#64748b;font-size:14px;">Role</td>
            <td style="padding:8px 16px;font-size:14px;font-weight:600;color:#0f172a;">${params.role}</td>
          </tr>
          ${wardInfo}
        </table>
      </div>

      <!-- Warning -->
      <div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:12px 16px;margin-bottom:24px;">
        <p style="margin:0;color:#92400e;font-size:13px;line-height:1.5;">
          ⚠️ <strong>You will be required to change your password</strong> when you log in for the first time. Please choose a strong password that only you know.
        </p>
      </div>

      <p style="margin:0;color:#94a3b8;font-size:12px;">
        If you did not expect this email, please contact the system administrator.
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;padding:16px 24px;text-align:center;border-top:1px solid #e2e8f0;">
      <p style="margin:0;color:#94a3b8;font-size:11px;">
        © 2026 Karapitiya Teaching Hospital — Secure Access
      </p>
    </div>
  </div>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: params.to,
      subject: `Your Hospital Management Account — User ID: ${params.userId}`,
      html,
    });

    console.log(`📧 Welcome email sent to ${params.to}`);
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send email";
    console.error("❌ Email send failed:", message);
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Send password reset notification
// ---------------------------------------------------------------------------

export async function sendPasswordResetEmail(params: {
  to: string;
  displayName: string;
  userId: string;
  temporaryPassword: string;
}): Promise<{ success: boolean; error?: string }> {
  const transporter = getTransporter();

  if (!transporter) {
    console.log("📧 SMTP not configured — printing reset credentials:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`  To:           ${params.to}`);
    console.log(`  User ID:      ${params.userId}`);
    console.log(`  New Password: ${params.temporaryPassword}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    return { success: true };
  }

  const fromName = process.env.SMTP_FROM_NAME || "Karapitiya Teaching Hospital";
  const fromEmail = process.env.SMTP_USER;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#0b2b33,#134e5e);padding:32px 24px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Karapitiya Teaching Hospital</h1>
      <p style="margin:8px 0 0;color:#99f6e4;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Password Reset</p>
    </div>
    <div style="padding:32px 24px;">
      <h2 style="margin:0 0 8px;color:#0f172a;font-size:18px;">Password Reset — ${params.displayName}</h2>
      <p style="margin:0 0 24px;color:#64748b;font-size:14px;line-height:1.6;">
        Your password has been reset by an administrator. Use the new temporary password below to log in.
      </p>
      <div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:12px;overflow:hidden;margin-bottom:24px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr style="border-bottom:1px solid #ccfbf1;">
            <td style="padding:12px 16px;color:#64748b;font-size:14px;">User ID</td>
            <td style="padding:12px 16px;font-size:20px;font-weight:700;color:#0d9488;font-family:monospace;letter-spacing:2px;">${params.userId}</td>
          </tr>
          <tr>
            <td style="padding:12px 16px;color:#64748b;font-size:14px;">New Password</td>
            <td style="padding:12px 16px;font-size:16px;font-weight:700;color:#0f172a;font-family:monospace;">${params.temporaryPassword}</td>
          </tr>
        </table>
      </div>
      <div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:12px 16px;">
        <p style="margin:0;color:#92400e;font-size:13px;line-height:1.5;">
          ⚠️ <strong>You will be required to change this password</strong> on your next login.
        </p>
      </div>
    </div>
    <div style="background:#f8fafc;padding:16px 24px;text-align:center;border-top:1px solid #e2e8f0;">
      <p style="margin:0;color:#94a3b8;font-size:11px;">© 2026 Karapitiya Teaching Hospital</p>
    </div>
  </div>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: params.to,
      subject: `Password Reset — User ID: ${params.userId}`,
      html,
    });

    console.log(`📧 Password reset email sent to ${params.to}`);
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send email";
    console.error("❌ Email send failed:", message);
    return { success: false, error: message };
  }
}

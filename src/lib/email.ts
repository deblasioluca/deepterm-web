import nodemailer from 'nodemailer';

type EmailSendErrorDetails = {
  message: string;
  code?: string;
  responseCode?: number;
  response?: string;
  command?: string;
  rejected?: string[];
};

export type EmailSendResult =
  | { ok: true }
  | {
      ok: false;
      error: EmailSendErrorDetails;
    };

function toEmailSendErrorDetails(error: unknown): EmailSendErrorDetails {
  if (!error || typeof error !== 'object') {
    return { message: 'Unknown email error' };
  }

  const anyErr = error as {
    message?: unknown;
    code?: unknown;
    responseCode?: unknown;
    response?: unknown;
    command?: unknown;
    rejected?: unknown;
  };

  return {
    message: typeof anyErr.message === 'string' ? anyErr.message : 'Email send failed',
    code: typeof anyErr.code === 'string' ? anyErr.code : undefined,
    responseCode: typeof anyErr.responseCode === 'number' ? anyErr.responseCode : undefined,
    response: typeof anyErr.response === 'string' ? anyErr.response : undefined,
    command: typeof anyErr.command === 'string' ? anyErr.command : undefined,
    rejected: Array.isArray(anyErr.rejected)
      ? anyErr.rejected.filter((v): v is string => typeof v === 'string')
      : undefined,
  };
}

// Configure the email transporter
// For production, use real SMTP credentials from environment variables
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

const ADMIN_EMAIL = 'luca.deblasio@bluewin.ch';
const FROM_EMAIL = process.env.EMAIL_FROM || process.env.SMTP_FROM || 'noreply@deepterm.net';

export async function sendNewUserNotification(user: {
  name: string;
  email: string;
  id: string;
}) {
  try {
    const mailOptions = {
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `[DeepTerm] New User Registration: ${user.name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #00ffc6 0%, #7b61ff 100%); padding: 20px; text-align: center;">
            <h1 style="color: #0a0b0d; margin: 0;">DeepTerm</h1>
          </div>
          <div style="background: #1a1b1e; padding: 30px; color: #ffffff;">
            <h2 style="color: #00ffc6; margin-top: 0;">New User Registration</h2>
            <p>A new user has registered on DeepTerm:</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #333; color: #888;">Name:</td>
                <td style="padding: 10px; border-bottom: 1px solid #333; color: #fff;">${user.name}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #333; color: #888;">Email:</td>
                <td style="padding: 10px; border-bottom: 1px solid #333; color: #fff;">${user.email}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #333; color: #888;">User ID:</td>
                <td style="padding: 10px; border-bottom: 1px solid #333; color: #fff; font-family: monospace;">${user.id}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #333; color: #888;">Registered:</td>
                <td style="padding: 10px; border-bottom: 1px solid #333; color: #fff;">${new Date().toLocaleString()}</td>
              </tr>
            </table>
            <p style="color: #888; font-size: 14px;">
              You can manage this user from the <a href="https://deepterm.net/admin/users" style="color: #00ffc6;">Admin Panel</a>.
            </p>
          </div>
          <div style="background: #0a0b0d; padding: 15px; text-align: center; color: #666; font-size: 12px;">
            DeepTerm - Secure SSH Client
          </div>
        </div>
      `,
      text: `New User Registration on DeepTerm\n\nName: ${user.name}\nEmail: ${user.email}\nUser ID: ${user.id}\nRegistered: ${new Date().toLocaleString()}`,
    };

    await transporter.sendMail(mailOptions);
    console.log(`[Email] New user notification sent to ${ADMIN_EMAIL} for user ${user.email}`);
    return true;
  } catch (error) {
    console.error('[Email] Failed to send new user notification:', error);
    // Don't throw - email failure shouldn't block registration
    return false;
  }
}

export async function sendTeamInvitationEmail(invitation: {
  email: string;
  teamName: string;
  inviterName: string;
  token: string;
}) {
  try {
    const inviteUrl = `https://deepterm.net/invite/${invitation.token}`;
    
    const mailOptions = {
      from: FROM_EMAIL,
      to: invitation.email,
      subject: `You've been invited to join ${invitation.teamName} on DeepTerm`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #00ffc6 0%, #7b61ff 100%); padding: 20px; text-align: center;">
            <h1 style="color: #0a0b0d; margin: 0;">DeepTerm</h1>
          </div>
          <div style="background: #1a1b1e; padding: 30px; color: #ffffff;">
            <h2 style="color: #00ffc6; margin-top: 0;">Team Invitation</h2>
            <p>${invitation.inviterName} has invited you to join <strong>${invitation.teamName}</strong> on DeepTerm.</p>
            <p>Click the button below to accept the invitation:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${inviteUrl}" style="background: linear-gradient(135deg, #00ffc6 0%, #7b61ff 100%); color: #0a0b0d; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                Accept Invitation
              </a>
            </div>
            <p style="color: #888; font-size: 14px;">
              This invitation will expire in 7 days. If you didn't expect this invitation, you can safely ignore this email.
            </p>
          </div>
          <div style="background: #0a0b0d; padding: 15px; text-align: center; color: #666; font-size: 12px;">
            DeepTerm - Secure SSH Client
          </div>
        </div>
      `,
      text: `${invitation.inviterName} has invited you to join ${invitation.teamName} on DeepTerm.\n\nAccept the invitation: ${inviteUrl}\n\nThis invitation will expire in 7 days.`,
    };

    await transporter.sendMail(mailOptions);
    console.log(`[Email] Team invitation sent to ${invitation.email}`);
    return true;
  } catch (error) {
    console.error('[Email] Failed to send team invitation:', error);
    return false;
  }
}

export async function sendWelcomeEmail(user: {
  name: string;
  email: string;
}) {
  try {
    const mailOptions = {
      from: FROM_EMAIL,
      to: user.email,
      subject: `Welcome to DeepTerm, ${user.name}!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #00ffc6 0%, #7b61ff 100%); padding: 20px; text-align: center;">
            <h1 style="color: #0a0b0d; margin: 0;">DeepTerm</h1>
          </div>
          <div style="background: #1a1b1e; padding: 30px; color: #ffffff;">
            <h2 style="color: #00ffc6; margin-top: 0;">Welcome to DeepTerm! 🎉</h2>
            <p>Hi ${user.name},</p>
            <p>Thank you for creating your DeepTerm account! We're excited to have you on board.</p>
            <p>DeepTerm is your secure SSH client designed for modern teams. Here's what you can do:</p>
            <ul style="color: #ccc; line-height: 1.8;">
              <li><strong style="color: #00ffc6;">Secure Vaults</strong> - Store and manage your SSH credentials safely</li>
              <li><strong style="color: #00ffc6;">Team Collaboration</strong> - Share access with your team members</li>
              <li><strong style="color: #00ffc6;">Passkey Authentication</strong> - Enable passwordless login for enhanced security</li>
              <li><strong style="color: #00ffc6;">Two-Factor Auth</strong> - Add an extra layer of protection</li>
            </ul>
            <div style="text-align: center; margin: 30px 0;">
              <a href="https://deepterm.net/dashboard" style="background: linear-gradient(135deg, #00ffc6 0%, #7b61ff 100%); color: #0a0b0d; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                Go to Dashboard
              </a>
            </div>
            <div style="background: #0d0e10; padding: 20px; border-radius: 8px; margin-top: 20px;">
              <h3 style="color: #00ffc6; margin-top: 0; font-size: 16px;">Get Started</h3>
              <ol style="color: #ccc; margin: 0; padding-left: 20px; line-height: 1.8;">
                <li>Download the DeepTerm app for macOS</li>
                <li>Create your first vault to store credentials</li>
                <li>Invite team members to collaborate</li>
                <li>Set up passkeys for secure, passwordless access</li>
              </ol>
            </div>
            <p style="color: #888; font-size: 14px; margin-top: 30px;">
              Need help? Visit our <a href="https://deepterm.net/dashboard/help" style="color: #00ffc6;">Help Center</a> or reply to this email.
            </p>
          </div>
          <div style="background: #0a0b0d; padding: 15px; text-align: center; color: #666; font-size: 12px;">
            DeepTerm - Secure SSH Client<br>
            <a href="https://deepterm.net" style="color: #888;">deepterm.net</a>
          </div>
        </div>
      `,
      text: `Welcome to DeepTerm, ${user.name}!\n\nThank you for creating your DeepTerm account! We're excited to have you on board.\n\nDeepTerm is your secure SSH client designed for modern teams. Here's what you can do:\n\n- Secure Vaults - Store and manage your SSH credentials safely\n- Team Collaboration - Share access with your team members\n- Passkey Authentication - Enable passwordless login for enhanced security\n- Two-Factor Auth - Add an extra layer of protection\n\nGet Started:\n1. Download the DeepTerm app for macOS\n2. Create your first vault to store credentials\n3. Invite team members to collaborate\n4. Set up passkeys for secure, passwordless access\n\nGo to your dashboard: https://deepterm.net/dashboard\n\nNeed help? Visit https://deepterm.net/dashboard/help`,
    };

    await transporter.sendMail(mailOptions);
    console.log(`[Email] Welcome email sent to ${user.email}`);
    return true;
  } catch (error) {
    console.error('[Email] Failed to send welcome email:', error);
    return false;
  }
}

export async function sendVersionReleaseEmail(user: {
  name: string;
  email: string;
}, release: {
  version: string;
  downloadUrl: string;
  siteUrl: string;
  releaseNotes?: string;
}) {
  try {
    const safeName = user.name?.trim() || 'there';

    const notesText = release.releaseNotes?.trim() || '';

    // Build the "What's New" block only when release notes are provided
    const releaseNotesHtml = notesText
      ? `<div style="background: #0d0e10; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #00ffc6; margin-top: 0; font-size: 16px;">What's New</h3>
              <pre style="color: #ccc; margin: 0; white-space: pre-wrap; word-wrap: break-word; font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6;">${notesText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
            </div>`
      : '';

    const releaseNotesPlain = notesText
      ? `\n\nWhat's New:\n${notesText}`
      : '';

    const mailOptions = {
      from: FROM_EMAIL,
      to: user.email,
      subject: `DeepTerm ${release.version} is now available`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #00ffc6 0%, #7b61ff 100%); padding: 20px; text-align: center;">
            <h1 style="color: #0a0b0d; margin: 0;">DeepTerm</h1>
          </div>
          <div style="background: #1a1b1e; padding: 30px; color: #ffffff;">
            <h2 style="color: #00ffc6; margin-top: 0;">A new version is ready 🚀</h2>
            <p>Hi ${safeName},</p>
            <p>DeepTerm <strong>${release.version}</strong> is now available to download.</p>
            ${releaseNotesHtml}
            <div style="text-align: center; margin: 30px 0;">
              <a href="${release.downloadUrl}" style="background: linear-gradient(135deg, #00ffc6 0%, #7b61ff 100%); color: #0a0b0d; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                Download for macOS
              </a>
            </div>
            <p style="color: #888; font-size: 14px;">
              You can also view your downloads from your dashboard at
              <a href="${release.siteUrl}/dashboard/get-the-app" style="color: #00ffc6;">${release.siteUrl}/dashboard/get-the-app</a>.
            </p>
          </div>
          <div style="background: #0a0b0d; padding: 15px; text-align: center; color: #666; font-size: 12px;">
            DeepTerm - Secure SSH Client
          </div>
        </div>
      `,
      text: `Hi ${safeName},\n\nDeepTerm ${release.version} is now available.${releaseNotesPlain}\n\nDownload: ${release.downloadUrl}\n\nDashboard: ${release.siteUrl}/dashboard/get-the-app`,
    };

    await transporter.sendMail(mailOptions);
    return { ok: true } as const;
  } catch (error) {
    const details = toEmailSendErrorDetails(error);
    console.error('[Email] Failed to send release notification:', error);
    return { ok: false, error: details } as const;
  }
}

// ── Intrusion Alert Email ──────────────────────────────────

export interface IntrusionAlertPayload {
  eventType: string;
  severity: string;
  sourceIp: string;
  path?: string;
  userAgent?: string;
  count: number;
  windowMinutes: number;
  details?: Record<string, unknown>;
}

const SEVERITY_COLORS: Record<string, string> = {
  low: '#facc15',
  medium: '#f97316',
  high: '#ef4444',
  critical: '#dc2626',
};

export async function sendIntrusionAlertEmail(payload: IntrusionAlertPayload): Promise<boolean> {
  try {
    const color = SEVERITY_COLORS[payload.severity] ?? '#ef4444';
    const detailRows = payload.details
      ? Object.entries(payload.details)
          .filter(([k]) => !k.startsWith('_'))
          .map(([k, v]) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #333;color:#888;">${k}</td><td style="padding:6px 10px;border-bottom:1px solid #333;color:#fff;font-family:monospace;">${String(v)}</td></tr>`)
          .join('')
      : '';

    const mailOptions = {
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `[DeepTerm] 🚨 ${payload.severity.toUpperCase()} Security Alert: ${payload.eventType}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: ${color}; padding: 20px; text-align: center;">
            <h1 style="color: #0a0b0d; margin: 0;">🚨 Security Alert</h1>
          </div>
          <div style="background: #1a1b1e; padding: 30px; color: #ffffff;">
            <h2 style="color: ${color}; margin-top: 0;">${payload.severity.toUpperCase()}: ${payload.eventType.replace(/_/g, ' ')}</h2>
            <p style="color:#ccc;">An intrusion-level event was detected on DeepTerm.</p>
            <table style="width:100%;border-collapse:collapse;margin:20px 0;">
              <tr>
                <td style="padding:8px 10px;border-bottom:1px solid #333;color:#888;">Source IP</td>
                <td style="padding:8px 10px;border-bottom:1px solid #333;color:#fff;font-family:monospace;">${payload.sourceIp}</td>
              </tr>
              <tr>
                <td style="padding:8px 10px;border-bottom:1px solid #333;color:#888;">Path</td>
                <td style="padding:8px 10px;border-bottom:1px solid #333;color:#fff;font-family:monospace;">${payload.path ?? '—'}</td>
              </tr>
              <tr>
                <td style="padding:8px 10px;border-bottom:1px solid #333;color:#888;">Events in window</td>
                <td style="padding:8px 10px;border-bottom:1px solid #333;color:#fff;">${payload.count} in ${payload.windowMinutes} min</td>
              </tr>
              <tr>
                <td style="padding:8px 10px;border-bottom:1px solid #333;color:#888;">User-Agent</td>
                <td style="padding:8px 10px;border-bottom:1px solid #333;color:#fff;font-size:12px;word-break:break-all;">${payload.userAgent ?? '—'}</td>
              </tr>
              ${detailRows}
            </table>
            <p style="color: #888; font-size: 14px;">
              Review all alerts in the <a href="https://deepterm.net/admin/security" style="color: #00ffc6;">Admin Panel</a>.
            </p>
          </div>
          <div style="background: #0a0b0d; padding: 15px; text-align: center; color: #666; font-size: 12px;">
            DeepTerm Intrusion Detection · ${new Date().toISOString()}
          </div>
        </div>
      `,
      text: [
        `[DeepTerm] ${payload.severity.toUpperCase()} Security Alert`,
        `Event: ${payload.eventType}`,
        `Source IP: ${payload.sourceIp}`,
        `Path: ${payload.path ?? '—'}`,
        `Count: ${payload.count} in ${payload.windowMinutes} min`,
        `User-Agent: ${payload.userAgent ?? '—'}`,
        `Time: ${new Date().toISOString()}`,
      ].join('\n'),
    };

    await transporter.sendMail(mailOptions);
    console.log(`[Email] Intrusion alert sent to ${ADMIN_EMAIL} — ${payload.eventType} from ${payload.sourceIp}`);
    return true;
  } catch (error) {
    console.error('[Email] Failed to send intrusion alert:', error);
    return false;
  }
}

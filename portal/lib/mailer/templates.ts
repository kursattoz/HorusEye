// ─── Shared layout wrapper ────────────────────────────────────────────────────
// Logo embedded as base64 — no external URL dependency, works in all email clients
const LOGO_BASE64 = 'data:image/png;base64,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';

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e4e4e7;">
        <!-- Header -->
        <tr>
          <td style="background:#18181b;padding:18px 32px;">
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding-right:12px;vertical-align:middle;">
                  <!--[if mso]>
                  <table cellpadding="0" cellspacing="0" border="0"><tr><td>
                  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
                    style="height:36px;width:36px;v-text-anchor:middle;"
                    arcsize="22%" fillcolor="#dc2626" stroked="f">
                    <w:anchorlock/>
                    <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:18px;font-weight:bold;mso-line-height-rule:exactly;">H</center>
                  </v:roundrect>
                  </td></tr></table>
                  <![endif]-->
                  <!--[if !mso]><!-->
                  <img src="${LOGO_BASE64}" width="36" height="36" alt="H"
                    style="display:block;border-radius:8px;width:36px;height:36px;" />
                  <!--<![endif]-->
                </td>
                <td style="vertical-align:middle;">
                  <span style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-0.5px;font-family:'Helvetica Neue',Arial,sans-serif;">horus</span><span style="color:#ffffff;font-size:20px;font-weight:300;letter-spacing:-0.5px;font-family:'Helvetica Neue',Arial,sans-serif;">eye</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            ${body}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #e4e4e7;background:#fafafa;">
            <p style="margin:0;font-size:12px;color:#71717a;">
              This is an automated notification from HorusEye. Please do not reply to this email.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function heading(text: string) {
  return `<h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#18181b;">${text}</h2>`;
}

function paragraph(text: string) {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46;">${text}</p>`;
}

function infoBox(rows: { label: string; value: string }[]) {
  const cells = rows.map(r => `
    <tr>
      <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#71717a;white-space:nowrap;border-bottom:1px solid #e4e4e7;">${r.label}</td>
      <td style="padding:10px 16px;font-size:14px;color:#18181b;border-bottom:1px solid #e4e4e7;">${r.value}</td>
    </tr>`).join('');
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e4e4e7;border-radius:6px;overflow:hidden;margin-bottom:24px;">${cells}</table>`;
}

// ─── Template 1: Public feedback received → admin ─────────────────────────────
export interface PublicFeedbackData {
  authorName:   string;
  content:      string;
  fileName:     string;
  submittedAt:  string; // formatted datetime string
}

export function publicFeedbackTemplate(data: PublicFeedbackData): { subject: string; html: string } {
  const subject = `[HorusEye] New public feedback from ${data.authorName}`;
  const html = layout(subject, `
    ${heading('New Public Feedback Received')}
    ${paragraph('A visitor has submitted feedback on a publicly shared document.')}
    ${infoBox([
      { label: 'From',       value: data.authorName },
      { label: 'Document',   value: data.fileName   },
      { label: 'Submitted',  value: data.submittedAt },
    ])}
    <div style="background:#f4f4f5;border-left:4px solid #18181b;border-radius:0 6px 6px 0;padding:16px;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;line-height:1.7;color:#3f3f46;white-space:pre-wrap;">${escapeHtml(data.content)}</p>
    </div>
    ${paragraph('Log in to HorusEye to review and manage this feedback.')}
  `);
  return { subject, html };
}

// ─── Template 2: Report deliverable assigned → assignee ──────────────────────
export interface ReportAssignedData {
  assigneeName:      string;
  deliverableTitle:  string;
  deliverableNumber: number | string;
  deadline:          string; // formatted date string
  assignedByName:    string;
}

export function reportAssignedTemplate(data: ReportAssignedData): { subject: string; html: string } {
  const subject = `[HorusEye] You've been assigned to "${data.deliverableTitle}"`;
  const html = layout(subject, `
    ${heading('Report Deliverable Assigned')}
    ${paragraph(`Hi ${data.assigneeName}, a report deliverable has been assigned to you.`)}
    ${infoBox([
      { label: 'Deliverable',  value: `#${data.deliverableNumber} — ${data.deliverableTitle}` },
      { label: 'Deadline',     value: data.deadline },
      { label: 'Assigned by',  value: data.assignedByName },
    ])}
    ${paragraph('Please log in to HorusEye to view the details and update your progress.')}
  `);
  return { subject, html };
}

// ─── Template 3: Internal feedback on a file → file uploader ─────────────────
export interface FileFeedbackData {
  uploaderName:   string;
  fileName:       string;
  feedbackType:   string;
  authorName:     string;
  content:        string;
  submittedAt:    string;
}

export function fileFeedbackTemplate(data: FileFeedbackData): { subject: string; html: string } {
  const subject = `[HorusEye] New feedback on your file "${data.fileName}"`;
  const html = layout(subject, `
    ${heading('New Feedback on Your File')}
    ${paragraph(`Hi ${data.uploaderName}, a team member has left feedback on a file you uploaded.`)}
    ${infoBox([
      { label: 'File',          value: data.fileName },
      { label: 'Feedback type', value: data.feedbackType },
      { label: 'From',          value: data.authorName },
      { label: 'Submitted',     value: data.submittedAt },
    ])}
    <div style="background:#f4f4f5;border-left:4px solid #18181b;border-radius:0 6px 6px 0;padding:16px;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;line-height:1.7;color:#3f3f46;white-space:pre-wrap;">${escapeHtml(data.content)}</p>
    </div>
    ${paragraph('Log in to HorusEye to review this feedback.')}
  `);
  return { subject, html };
}

// ─── Template 4: OTP verification code → submitter ───────────────────────────
export interface OtpVerificationData {
  code:       string;  // 6-digit code
  fileName:   string;
  expiresMin: number;  // minutes until expiry
}

export function otpVerificationTemplate(data: OtpVerificationData): { subject: string; html: string } {
  const subject = `[HorusEye] Your verification code: ${data.code}`;
  const html = layout(subject, `
    ${heading('Verify Your Identity')}
    ${paragraph(`You requested to submit feedback on <strong>${escapeHtml(data.fileName)}</strong>. Use the code below to confirm your submission.`)}
    <div style="text-align:center;margin:28px 0;">
      <span style="display:inline-block;background:#f4f4f5;border:2px dashed #d4d4d8;border-radius:10px;padding:16px 40px;font-size:36px;font-weight:800;letter-spacing:10px;color:#18181b;font-family:'Courier New',monospace;">${data.code}</span>
    </div>
    ${paragraph(`This code expires in <strong>${data.expiresMin} minutes</strong>. Do not share it with anyone.`)}
    ${paragraph('If you did not request this, please ignore this email.')}
  `);
  return { subject, html };
}

// ─── Template 5: File access link → @tedu.edu.tr requester ───────────────────
export interface FileAccessLinkData {
  fileName:  string;
  openUrl:   string;
}

export function fileAccessLinkTemplate(data: FileAccessLinkData): { subject: string; html: string } {
  const subject = `[HorusEye] Your access link for "${data.fileName}"`;
  const html = layout(subject, `
    ${heading('Your Document Access Link')}
    ${paragraph(`You requested access to <strong>${escapeHtml(data.fileName)}</strong>. Click the button below to open or download the document.`)}
    <div style="text-align:center;margin:28px 0;">
      <a href="${data.openUrl}"
        style="display:inline-block;background:#18181b;color:#ffffff;font-size:15px;font-weight:600;padding:14px 36px;border-radius:8px;text-decoration:none;letter-spacing:-0.2px;font-family:'Helvetica Neue',Arial,sans-serif;">
        Open Document
      </a>
    </div>
    ${paragraph('If you did not request this link, please ignore this email.')}
  `);
  return { subject, html };
}

// ─── Template 6: Welcome email → new user ────────────────────────────────────
export interface WelcomeUserData {
  fullName:          string;
  email:             string;
  temporaryPassword: string;
  appUrl:            string;
}

export function welcomeUserTemplate(data: WelcomeUserData): { subject: string; html: string } {
  const subject = `Welcome to HorusEye — Your account is ready`;
  const html = layout(subject, `
    ${heading(`Welcome, ${escapeHtml(data.fullName)}! 👋`)}
    ${paragraph('Your HorusEye account has been created by an administrator. Use the credentials below to log in.')}
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e4e4e7;border-radius:6px;overflow:hidden;margin-bottom:24px;">
      <tr>
        <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#71717a;white-space:nowrap;border-bottom:1px solid #e4e4e7;width:140px;">Email</td>
        <td style="padding:10px 16px;font-size:14px;color:#18181b;border-bottom:1px solid #e4e4e7;">${escapeHtml(data.email)}</td>
      </tr>
      <tr>
        <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#71717a;white-space:nowrap;">Temporary Password</td>
        <td style="padding:10px 16px;font-size:14px;font-family:'Courier New',monospace;font-weight:700;color:#18181b;letter-spacing:1px;">${escapeHtml(data.temporaryPassword)}</td>
      </tr>
    </table>
    <div style="text-align:center;margin:28px 0;">
      <a href="${data.appUrl}"
        style="display:inline-block;background:#18181b;color:#ffffff;font-size:15px;font-weight:600;padding:14px 36px;border-radius:8px;text-decoration:none;letter-spacing:-0.2px;font-family:'Helvetica Neue',Arial,sans-serif;">
        Log In to HorusEye
      </a>
    </div>
    ${paragraph('If you did not expect this email, please contact your administrator.')}
  `);
  return { subject, html };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

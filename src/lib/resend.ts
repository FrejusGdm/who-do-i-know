import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

export async function sendDownloadEmail(
  to: string,
  downloadUrl: string
): Promise<void> {
  const resend = getResend();
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "noreply@whodoyouknow.xyz",
    to,
    subject: "Your WhoDoYouKnow download is ready",
    html: `
      <div style="font-family: Georgia, serif; max-width: 500px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="color: #1A1714; font-size: 24px;">Your network is ready.</h1>
        <p style="color: #8C7B6B; font-size: 16px; line-height: 1.6;">
          We found your contacts. Click below to download your spreadsheet.
          This link expires in 15 minutes.
        </p>
        <a href="${downloadUrl}" 
           style="display: inline-block; background: #1A1714; color: #FAF7F2; 
                  padding: 12px 32px; text-decoration: none; border-radius: 6px;
                  font-size: 16px; margin-top: 16px;">
          Download CSV
        </a>
        <p style="color: #8C7B6B; font-size: 12px; margin-top: 32px;">
          Your data will be permanently deleted after download or within 15 minutes.
        </p>
      </div>
    `,
  });
}

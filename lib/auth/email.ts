import "server-only";
import { Resend } from "resend";

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);
}

export async function sendAuthEmail({ to, subject, heading, action, url, expires }: { to: string; subject: string; heading: string; action: string; url: string; expires: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_EMAIL_FROM;
  if (!apiKey || !from) throw new Error("RESEND_API_KEY and AUTH_EMAIL_FROM must be configured");
  const safeUrl = escapeHtml(url);
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to,
    subject,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#17211b"><h1 style="font-size:22px">Herb Overflow</h1><h2 style="font-size:18px">${escapeHtml(heading)}</h2><p><a href="${safeUrl}" style="display:inline-block;background:#1f6047;color:#fff;padding:11px 16px;border-radius:8px;text-decoration:none">${escapeHtml(action)}</a></p><p style="color:#69746e;font-size:13px">This link expires ${escapeHtml(expires)}. If you did not request this, you can ignore this email.</p></div>`,
  });
  if (error) {
    console.error("Authentication email delivery failed", { name: error.name, message: error.message });
    throw new Error("Authentication email delivery failed");
  }
}

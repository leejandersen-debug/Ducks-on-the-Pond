import { log } from "@/lib/log";

// Sends account emails (password reset, email verification) through Resend, installed from the
// Vercel Marketplace, which sets RESEND_API_KEY. Without a key: in development the email is
// printed to the server console so the flow can be tested; anywhere else sending fails.
// Until a domain is verified in Resend, the sender must be onboarding@resend.dev, which only
// delivers to the Resend account owner's own address. Set EMAIL_FROM once a domain is verified.

const FROM = process.env.EMAIL_FROM || "Ducks on the Pond Cards <onboarding@resend.dev>";

export class EmailError extends Error {}

export async function sendEmail(to: string, subject: string, text: string, html: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`\n[dev email, not sent] To: ${to}\nSubject: ${subject}\n\n${text}\n`);
      return;
    }
    log.error("email_not_configured", {});
    throw new EmailError("Email isn't set up on this site yet.");
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject, text, html }),
  });
  if (!res.ok) {
    // Status and Resend's error name only: the body can echo the recipient address.
    let name = "unknown";
    try { name = ((await res.json()) as { name?: string }).name ?? name; } catch {}
    log.error("email_failed", { status: res.status, name });
    throw new EmailError("Couldn't send the email right now. Try again in a few minutes.");
  }
  log.info("email_sent", { subject });
}

// The site's own address for links in emails. Never taken from the request's Host header,
// which a caller controls (it would let someone mail a reset link pointing at their own site).
export function appUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3005";
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// A plain, two-color email: one message and one button.
export function emailBody(name: string, intro: string, button: string, url: string, outro: string) {
  const text = `Hi ${name},\n\n${intro}\n\n${url}\n\n${outro}\n\nDucks on the Pond Cards`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;color:#1d2a2e">
<div style="background:#0e5e6f;color:#fff;padding:14px 20px;font-weight:700;border-radius:8px 8px 0 0">Ducks on the Pond Cards</div>
<div style="border:1px solid #d5e0e3;border-top:0;padding:20px;border-radius:0 0 8px 8px">
<p>Hi ${esc(name)},</p><p>${esc(intro)}</p>
<p><a href="${esc(url)}" style="display:inline-block;background:#f2b705;color:#1d2a2e;padding:10px 18px;border-radius:8px;font-weight:700;text-decoration:none">${esc(button)}</a></p>
<p style="color:#5b6b70;font-size:14px">${esc(outro)}</p></div></div>`;
  return { text, html };
}

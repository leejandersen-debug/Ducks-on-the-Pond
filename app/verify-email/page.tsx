import Link from "next/link";
import { tokenHash } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { dbProblem } from "@/lib/db-status";
import { log } from "@/lib/log";

// Opened from the confirmation email. Confirming is the whole point of the link, so it
// happens on open; the token then stops working.
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  if (await dbProblem()) return null; // the layout shows the reason
  const token = (await searchParams).token ?? "";
  const profileId = token && await withUser(null, async (db) =>
    (await db.query("select auth_verify_email($1) id", [tokenHash(token)])).rows[0].id as string | null);
  if (profileId) log.info("email_verified", { profileId });
  return (
    <main className="auth-page">
      <div className="auth-form">
        {profileId ? (
          <>
            <h2>Email confirmed</h2>
            <p>Thanks. Your email address is confirmed.</p>
            <p><Link className="button primary" href="/">Continue</Link></p>
          </>
        ) : (
          <>
            <h2>This link has expired</h2>
            <p>It may have been used already. If you&apos;re signed in and still see the &ldquo;confirm your email&rdquo; banner, use its &ldquo;Send it again&rdquo; button.</p>
            <p><Link className="button" href="/">Go to the home page</Link></p>
          </>
        )}
      </div>
    </main>
  );
}

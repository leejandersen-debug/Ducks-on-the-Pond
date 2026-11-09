import Link from "next/link";
import { ResetPasswordForm } from "../auth-forms";
import { MIN_PASSWORD, tokenHash } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { dbProblem } from "@/lib/db-status";

// Opened from the reset email. Only checks the link here; the password changes on submit.
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  if (await dbProblem()) return null; // the layout shows the reason
  const token = (await searchParams).token ?? "";
  const valid = token !== "" && await withUser(null, async (db) =>
    (await db.query("select auth_token_valid($1, 'reset') ok", [tokenHash(token)])).rows[0].ok as boolean);
  if (!valid) {
    return (
      <main className="auth-page">
        <div className="auth-form">
          <h2>This link has expired</h2>
          <p>Reset links work once and only for 1 hour.</p>
          <p><Link className="button" href="/forgot-password">Send a new link</Link></p>
        </div>
      </main>
    );
  }
  return <main className="auth-page"><ResetPasswordForm token={token} minPassword={MIN_PASSWORD} /></main>;
}

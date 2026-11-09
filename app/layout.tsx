import type { Metadata } from "next";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import { switchUser } from "./actions";
import { resendVerification, signOut } from "./auth-actions";
import { withUser } from "@/lib/db";
import { dbProblem } from "@/lib/db-status";
import { listProfiles, type Profile } from "@/lib/queries";
import { currentUserId, testLoginEnabled } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = { title: "Ducks on the Pond Cards" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const me = await currentUserId();
  const problem = await dbProblem();
  const profiles: Profile[] = problem ? [] : await withUser(null, listProfiles);
  const profile = profiles.find((p) => p.id === me);
  // false only for a real account that hasn't confirmed its email (test users have no account).
  const verified = profile ? await withUser(me, async (db) =>
    (await db.query("select auth_email_verified($1) v", [me])).rows[0].v as boolean | null).catch(() => null) : null;

  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="bar">
            <Link href="/" className="brand"><span className="brand-mark" aria-hidden>●</span> Ducks on the Pond Cards</Link>
            <div className="account">
              {profile ? (
                <>
                  <span>Hi, <strong>{profile.display_name ?? profile.username}</strong></span>
                  {profile.is_admin && <span className="badge">Admin</span>}
                  <form action={signOut}><button className="ghost">Sign out</button></form>
                </>
              ) : (
                <>
                  <Link className="button ghost" href="/signin">Sign in</Link>
                  <Link className="button accent" href="/signup">Create account</Link>
                </>
              )}
            </div>
          </div>
          <nav className="bar nav">
            <Link href="/catalog">Catalog</Link>
            <Link href="/collection">My collection</Link>
            <Link href="/wants">Wishlist</Link>
            <Link href="/trades">Trades</Link>
            <Link href="/reports">Reports</Link>
            <Link href="/search">Help &amp; search</Link>
            {profile?.is_admin && <Link href="/admin">Admin</Link>}
          </nav>
        </header>

        {verified === false && (
          <div className="verify-banner">
            <form action={resendVerification} className="bar">
              <span>Please confirm your email address: we sent you a link when you signed up.</span>
              <button className="small">Send it again</button>
            </form>
          </div>
        )}

        <div className="page">
          {problem ? <p className="flash error"><strong>{problem}</strong></p> : children}
        </div>

        {testLoginEnabled() && !problem && (
          <footer className="dev-tools">
            <form action={switchUser}>
              Developer test user:{" "}
              <select name="user" defaultValue={me ?? ""}>
                <option value="">(signed out)</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.display_name ?? p.username}</option>
                ))}
              </select>{" "}
              <button className="small">Switch</button>
              <span className="muted"> Development only. Signing in with a real account takes priority.</span>
            </form>
          </footer>
        )}
        {/* Vercel Web Analytics: page views and visitors. Sends nothing until enabled in the dashboard. */}
        <Analytics />
      </body>
    </html>
  );
}

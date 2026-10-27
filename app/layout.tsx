import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { switchUser } from "./actions";
import { withUser } from "@/lib/db";
import { dbProblem } from "@/lib/db-status";
import { listProfiles, type Profile } from "@/lib/queries";
import { currentUserId, testLoginEnabled } from "@/lib/session";

export const metadata: Metadata = { title: "Card App" };

// Unstyled on purpose: a functional test harness. Styling comes later.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const me = await currentUserId();
  const problem = await dbProblem();
  const profiles: Profile[] = problem ? [] : await withUser(null, listProfiles);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui", padding: 24 }}>
        <nav>
          <a href="/">Home</a> | <a href="/catalog">Catalog</a> | <a href="/collection">My collection</a> |{" "}
          <a href="/wants">Wishlist</a> | <a href="/trades">Trades</a> | <a href="/reports">Reports</a> |{" "}
          <a href="/admin">Admin</a> | <a href="/search">Search</a>
        </nav>
        {testLoginEnabled() ? (
          <form action={switchUser}>
            Test user:{" "}
            <select name="user" defaultValue={me ?? ""}>
              <option value="">(signed out)</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name ?? p.username}
                </option>
              ))}
            </select>{" "}
            <button>Switch</button>
          </form>
        ) : (
          <p>Test login is off in this environment, so you can browse but not make changes.</p>
        )}
        <hr />
        {problem ? <p><strong>{problem}</strong></p> : children}
        {/* Vercel Web Analytics: page views and visitors. Sends nothing until enabled in the dashboard. */}
        <Analytics />
      </body>
    </html>
  );
}

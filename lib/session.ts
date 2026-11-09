import { cache } from "react";
import { cookies } from "next/headers";
import { SESSION_COOKIE, tokenHash } from "@/lib/auth";
import { withUser } from "@/lib/db";

// Who is signed in. A real session (the sign-in page) comes first. In development only
// (TEST_LOGIN=1), the old test-user dropdown still works when nobody is signed in.
export const TEST_USER_COOKIE = "test_user";

export const testLoginEnabled = () => process.env.TEST_LOGIN === "1";

// Reading cookies also keeps every page rendered per request instead of prerendered at build time.
// Cached per request: the layout and the page both ask.
export const currentUserId = cache(async (): Promise<string | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      const id = await withUser(null, async (db) =>
        (await db.query("select auth_session_user($1) as id", [tokenHash(token)])).rows[0]?.id as string | null);
      if (id) return id;
    } catch {
      // Database down or schema missing: the layout explains; treat as signed out.
    }
  }
  if (!testLoginEnabled()) return null;
  return store.get(TEST_USER_COOKIE)?.value || null;
});

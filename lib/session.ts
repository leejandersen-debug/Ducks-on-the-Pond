import { cookies } from "next/headers";

// TEMPORARY test login: a cookie holding a profile id, chosen from a dropdown.
// Only active where TEST_LOGIN=1 (set in .env.development.local); everywhere else nobody is signed in.
// Replaced by real auth later.
export const TEST_USER_COOKIE = "test_user";

export const testLoginEnabled = () => process.env.TEST_LOGIN === "1";

// Reads cookies even when test login is off: that keeps every page rendered per request
// instead of being prerendered (with a database query) at build time.
export async function currentUserId(): Promise<string | null> {
  const store = await cookies();
  if (!testLoginEnabled()) return null;
  return store.get(TEST_USER_COOKIE)?.value || null;
}

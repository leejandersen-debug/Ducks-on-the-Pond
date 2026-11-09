"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  dummyHash, hashPassword, MIN_PASSWORD, newSessionToken, SESSION_COOKIE, SESSION_DAYS, tokenHash, verifyPassword,
} from "@/lib/auth";
import { withUser } from "@/lib/db";
import { text } from "@/lib/forms";
import { log } from "@/lib/log";

// Sign up, sign in, sign out. Used with useActionState, so a failure returns a message (and the
// non-secret fields to refill the form) instead of redirecting. Passwords are never logged or returned.

export type AuthState = { error?: string; values?: Record<string, string> } | undefined;

async function startSession(profileId: string) {
  const token = newSessionToken();
  await withUser(null, (db) =>
    db.query("select auth_start_session($1, $2, $3)", [tokenHash(token), profileId, SESSION_DAYS]));
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME = /^[A-Za-z0-9_.-]{3,30}$/;

export async function signUp(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const values = {
    display_name: text(fd, "display_name") ?? "",
    username: text(fd, "username") ?? "",
    email: (text(fd, "email") ?? "").toLowerCase(),
  };
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  const fail = (error: string): AuthState => ({ error, values });

  if (!values.display_name) return fail("Enter your name.");
  if (!USERNAME.test(values.username)) return fail("Username: 3–30 letters, numbers, dots, dashes or underscores.");
  if (!EMAIL.test(values.email)) return fail("Enter a valid email address.");
  if (password.length < MIN_PASSWORD) return fail(`Password must be at least ${MIN_PASSWORD} characters.`);
  if (password.length > 200) return fail("Password is too long.");
  if (password !== confirm) return fail("The two passwords don't match.");

  let created: { profile_id: string; is_admin: boolean };
  try {
    created = await withUser(null, async (db) => (await db.query(
      "select * from auth_sign_up($1, $2, $3, $4)",
      [values.username, values.display_name, values.email, await hashPassword(password)],
    )).rows[0]);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "P0001" || code === "23505") return fail((err as Error).message.startsWith("duplicate")
      ? "That email or username is already in use." : (err as Error).message);
    log.error("sign_up_failed", { code });
    return fail("Couldn't create the account right now. Try again.");
  }
  log.info("signed_up", { profileId: created.profile_id, isAdmin: created.is_admin });
  await startSession(created.profile_id);
  redirect(created.is_admin ? "/?welcome=admin" : "/?welcome=1");
}

export async function signIn(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const login = (text(fd, "login") ?? "").toLowerCase();
  const password = String(fd.get("password") ?? "");
  const fail: AuthState = { error: "That email/username and password don't match.", values: { login } };
  if (!login || !password) return { error: "Enter your email or username and your password.", values: { login } };

  let found: { profile_id: string; password_hash: string } | undefined;
  try {
    found = await withUser(null, async (db) => (await db.query("select * from auth_lookup($1)", [login])).rows[0]);
  } catch (err) {
    log.error("sign_in_failed", { code: (err as { code?: string }).code });
    return { error: "Sign-in isn't available right now. Try again.", values: { login } };
  }
  const ok = await verifyPassword(password, found?.password_hash ?? await dummyHash());
  if (!found || !ok) {
    log.warn("sign_in_rejected", {});
    return fail;
  }
  log.info("signed_in", { profileId: found.profile_id });
  await startSession(found.profile_id);
  redirect("/");
}

export async function signOut() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await withUser(null, (db) => db.query("select auth_end_session($1)", [tokenHash(token)])).catch(() => {});
    store.delete(SESSION_COOKIE);
  }
  store.delete("test_user");
  redirect("/");
}

"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { PoolClient } from "pg";
import {
  dummyHash, hashPassword, MIN_PASSWORD, newSessionToken, SESSION_COOKIE, SESSION_DAYS, tokenHash, verifyPassword,
} from "@/lib/auth";
import { withUser } from "@/lib/db";
import { appUrl, emailBody, EmailError, sendEmail } from "@/lib/email";
import { text } from "@/lib/forms";
import { log } from "@/lib/log";
import { currentUserId } from "@/lib/session";

// Sign up, sign in, sign out, password reset and email verification. Used with useActionState,
// so a failure returns a message (and the non-secret fields to refill the form) instead of
// redirecting. Passwords and tokens are never logged or returned.

export type AuthState = { error?: string; notice?: string; values?: Record<string, string> } | undefined;

const RESET_MINUTES = 60;
const VERIFY_MINUTES = 3 * 24 * 60;

// Rate limits: [events allowed, per minutes].
const LIMITS = {
  signinLogin: [5, 15],   // failed sign-ins for one email/username
  signinIp: [20, 15],     // failed sign-ins from one address
  signupIp: [5, 60],      // accounts created from one address
  resetEmail: [3, 60],    // reset emails to one address
  resetIp: [10, 60],      // reset requests from one address
  verifyUser: [3, 60],    // "send it again" verification emails
} as const;

const db = <T,>(fn: (c: PoolClient) => Promise<T>) => withUser(null, fn);

// Vercel sets x-real-ip / x-forwarded-for from the connection, so callers can't choose it there.
async function clientIp() {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

async function retryAfter(key: string, [limit, minutes]: readonly [number, number]) {
  return db(async (c) => (await c.query("select auth_retry_after($1, $2, $3) s", [key, limit, minutes])).rows[0].s as number);
}
const count = (...keys: string[]) => db((c) => c.query("select auth_count($1)", [keys]));
const wait = (seconds: number) => `Too many attempts. Try again in ${Math.ceil(seconds / 60)} minute${seconds > 60 ? "s" : ""}.`;

async function startSession(profileId: string) {
  const token = newSessionToken();
  await db((c) => c.query("select auth_start_session($1, $2, $3)", [tokenHash(token), profileId, SESSION_DAYS]));
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

// Issues a token for the account with this email and mails the link. No account: nothing is sent.
async function mailLink(email: string, purpose: "reset" | "verify") {
  const token = newSessionToken();
  const minutes = purpose === "reset" ? RESET_MINUTES : VERIFY_MINUTES;
  const who = await db(async (c) => (await c.query(
    "select * from auth_issue_token_for_email($1, $2, $3, $4)", [email, purpose, tokenHash(token), minutes],
  )).rows[0] as { display_name: string; email: string } | undefined);
  if (!who) return;
  const url = `${appUrl()}/${purpose === "reset" ? "reset-password" : "verify-email"}?token=${token}`;
  const body = purpose === "reset"
    ? emailBody(who.display_name, "Someone (hopefully you) asked to reset the password for your Ducks on the Pond Cards account.",
        "Choose a new password", url, "This link works once and expires in 1 hour. If you didn't ask for it, ignore this email; your password hasn't changed.")
    : emailBody(who.display_name, "Please confirm this is your email address for Ducks on the Pond Cards.",
        "Confirm my email", url, "This link expires in 3 days. If you didn't create an account, ignore this email.");
  await sendEmail(who.email, purpose === "reset" ? "Reset your password" : "Confirm your email", body.text, body.html);
}

function checkNewPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (password.length > 200) return "Password is too long.";
  if (password !== confirm) return "The two passwords don't match.";
  return null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME = /^[A-Za-z0-9_.-]{3,30}$/;

// ── Sign up ─────────────────────────────────────────────────

export async function signUp(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const values = {
    display_name: text(fd, "display_name") ?? "",
    username: text(fd, "username") ?? "",
    email: (text(fd, "email") ?? "").toLowerCase(),
  };
  const fail = (error: string): AuthState => ({ error, values });

  if (!values.display_name) return fail("Enter your name.");
  if (!USERNAME.test(values.username)) return fail("Username: 3–30 letters, numbers, dots, dashes or underscores.");
  if (!EMAIL.test(values.email)) return fail("Enter a valid email address.");
  const bad = checkNewPassword(String(fd.get("password") ?? ""), String(fd.get("confirm") ?? ""));
  if (bad) return fail(bad);

  const ipKey = `signup:ip:${await clientIp()}`;
  let created: { profile_id: string; is_admin: boolean };
  try {
    const s = await retryAfter(ipKey, LIMITS.signupIp);
    if (s) return fail(wait(s));
    created = await db(async (c) => (await c.query(
      "select * from auth_sign_up($1, $2, $3, $4)",
      [values.username, values.display_name, values.email, await hashPassword(String(fd.get("password")))],
    )).rows[0]);
    await count(ipKey);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "P0001") return fail((err as Error).message);
    if (code === "23505") return fail("That email or username is already in use.");
    log.error("sign_up_failed", { code });
    return fail("Couldn't create the account right now. Try again.");
  }
  log.info("signed_up", { profileId: created.profile_id, isAdmin: created.is_admin });
  await startSession(created.profile_id);
  // The account works straight away; a banner asks to confirm the email until it's done.
  let sent = true;
  try { await mailLink(values.email, "verify"); } catch { sent = false; }
  redirect(`/?welcome=${created.is_admin ? "admin" : "1"}${sent ? "" : "&mail=failed"}`);
}

// ── Sign in / out ───────────────────────────────────────────

export async function signIn(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const login = (text(fd, "login") ?? "").toLowerCase();
  const password = String(fd.get("password") ?? "");
  const values = { login };
  if (!login || !password) return { error: "Enter your email or username and your password.", values };

  const loginKey = `signin:login:${login}`;
  const ipKey = `signin:ip:${await clientIp()}`;
  let found: { profile_id: string; password_hash: string } | undefined;
  try {
    const s = Math.max(await retryAfter(loginKey, LIMITS.signinLogin), await retryAfter(ipKey, LIMITS.signinIp));
    if (s) {
      log.warn("sign_in_throttled", {});
      return { error: wait(s), values };
    }
    found = await db(async (c) => (await c.query("select * from auth_lookup($1)", [login])).rows[0]);
  } catch (err) {
    log.error("sign_in_failed", { code: (err as { code?: string }).code });
    return { error: "Sign-in isn't available right now. Try again.", values };
  }
  const ok = await verifyPassword(password, found?.password_hash ?? await dummyHash());
  if (!found || !ok) {
    await count(loginKey, ipKey).catch(() => {});
    log.warn("sign_in_rejected", {});
    return { error: "That email/username and password don't match.", values };
  }
  await db((c) => c.query("select auth_clear($1)", [loginKey])).catch(() => {});
  log.info("signed_in", { profileId: found.profile_id });
  await startSession(found.profile_id);
  redirect("/");
}

export async function signOut() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db((c) => c.query("select auth_end_session($1)", [tokenHash(token)])).catch(() => {});
    store.delete(SESSION_COOKIE);
  }
  store.delete("test_user");
  redirect("/");
}

// ── Forgot / reset password ─────────────────────────────────

export async function requestReset(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const email = (text(fd, "email") ?? "").toLowerCase();
  const values = { email };
  if (!EMAIL.test(email)) return { error: "Enter the email address you signed up with.", values };
  // The same answer whether or not the account exists, so this page can't be used to find accounts.
  const done: AuthState = {
    notice: `If an account uses ${email}, a reset link is on its way. It works once and expires in 1 hour. Check your spam folder too.`,
  };
  const emailKey = `reset:email:${email}`;
  const ipKey = `reset:ip:${await clientIp()}`;
  try {
    const s = Math.max(await retryAfter(ipKey, LIMITS.resetIp), await retryAfter(emailKey, LIMITS.resetEmail));
    if (s) return { error: wait(s), values };
    await count(emailKey, ipKey);
    await mailLink(email, "reset");
  } catch (err) {
    if (err instanceof EmailError) return { error: err.message, values };
    log.error("reset_request_failed", { code: (err as { code?: string }).code });
    return { error: "Couldn't send the reset email right now. Try again.", values };
  }
  log.info("reset_requested", {});
  return done;
}

export async function resetPassword(_prev: AuthState, fd: FormData): Promise<AuthState> {
  const token = text(fd, "token") ?? "";
  const bad = checkNewPassword(String(fd.get("password") ?? ""), String(fd.get("confirm") ?? ""));
  if (bad) return { error: bad };
  let profileId: string | null;
  try {
    profileId = await db(async (c) => (await c.query(
      "select auth_reset_password($1, $2) id", [tokenHash(token), await hashPassword(String(fd.get("password")))],
    )).rows[0].id);
  } catch (err) {
    log.error("reset_failed", { code: (err as { code?: string }).code });
    return { error: "Couldn't change the password right now. Try again." };
  }
  if (!profileId) return { error: "This reset link has expired or was already used. Ask for a new one." };
  log.info("password_reset", { profileId });
  await startSession(profileId); // every other session was signed out
  redirect("/?reset=1");
}

// ── Email verification ──────────────────────────────────────

export async function resendVerification(): Promise<void> {
  const me = await currentUserId();
  if (!me) redirect("/signin");
  let result = "sent";
  try {
    const s = await retryAfter(`verify:user:${me}`, LIMITS.verifyUser);
    if (s) result = "wait";
    else {
      const email = await withUser(me, async (c) => (await c.query("select auth_own_email($1) e", [me])).rows[0].e as string | null);
      await count(`verify:user:${me}`);
      if (email) await mailLink(email, "verify");
    }
  } catch (err) {
    log.error("verify_resend_failed", { code: (err as { code?: string }).code });
    result = "failed";
  }
  redirect(`/?verify=${result}`);
}

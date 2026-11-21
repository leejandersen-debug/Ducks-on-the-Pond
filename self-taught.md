# Self-taught element: real sign-in

**What I taught myself:** building real sign-in for the live app from scratch, with no login service. It covers accounts, passwords, sessions, password reset, email verification and limits on repeated attempts. I built it on 2026-11-08 (commits `b7a0e1b` and `3855bfb`).

**Why the course didn't cover it:** the course gave me a test-user dropdown. My 2026-10-24 decision entry records it as "a temporary cookie switcher enabled only by `TEST_LOGIN=1` locally. Real auth is still undecided." A live app with real users can't run on a dropdown, so I worked this out myself.

## What it does, in plain words
- **Passwords are never stored.** Each one is scrambled with scrypt, a deliberately slow one-way function, using its own random salt (`lib/auth.ts`). Passwords must be at least 10 characters.
- **A stolen database copy can't sign anyone in.** The browser holds a random 32-byte session token. The database stores only a SHA-256 fingerprint of it, so a copied sessions table can't be replayed as a login.
- **The app itself can't read the password or session tables.** Its database role has every right on them taken away. It reaches them only through a few narrow database functions, so a bug on any page can't leak a password hash (`migrations/1793200000000_accounts-and-sessions.sql`).
- **Sign-in doesn't reveal which emails have accounts.** When the email is unknown, it still checks the password against a dummy hash, so a wrong email takes as long as a wrong password.
- **Recovery:** a reset link works once and expires in 1 hour. A verification link expires in 3 days. Both are emailed from the live app.
- **Guessing is slowed down.** After 5 failed sign-ins on one account in 15 minutes, or 20 from one address, it says "Try again in N minutes." Sign-ups, reset emails and resend requests have their own limits.
- **Cookies:** HttpOnly so page scripts can't read them, Secure in production, SameSite=Lax, and they last 30 days.

## Proof
- **Live:** https://ducks-on-the-pond-psi.vercel.app/signin, `/signup` and `/forgot-password` all return 200. A signed-out visit to `/collection` shows "Sign in" instead of anyone's cards (checked 2026-11-21).
- **Code:**
  - `lib/auth.ts`: hashing and tokens
  - `app/auth-actions.ts`: sign-up, sign-in, reset, verification and the rate limits
  - `migrations/1793200000000_accounts-and-sessions.sql` and `migrations/1793210000000_auth-recovery.sql`
- **History:** `b7a0e1b` "Add real sign-in and a basic two-color style", `3855bfb` "Add password reset, email verification and sign-in rate limits".

## What I'd say in the viva
I replaced the course's test dropdown with real sign-in I built myself. Passwords are scrypt-hashed and sessions are stored only as fingerprints. The app can't read either table directly, and repeated guessing gets slowed down. The hardest lesson was that you don't secure sign-in by checking a password. You secure it by planning for the day someone gets a copy of your database.

## Still open
`DECISIONS.md` lists the login provider as open: this in-house sign-in could later be replaced by a hosted provider such as Clerk. That would change who runs sign-in, not whether the live app has it today.

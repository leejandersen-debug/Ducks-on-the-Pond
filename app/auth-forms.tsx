"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestReset, resetPassword, signIn, signUp, type AuthState } from "./auth-actions";

export function SignInForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, undefined);
  return (
    <form action={action} className="auth-form">
      <h2>Sign in</h2>
      {state?.error && <p role="alert" className="flash error">{state.error}</p>}
      <label>Email or username
        <input name="login" autoComplete="username" defaultValue={state?.values?.login} required autoFocus />
      </label>
      <label>Password
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      <p className="right"><Link href="/forgot-password">Forgot your password?</Link></p>
      <button className="primary wide" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      <p className="muted center">New here? <Link href="/signup">Create an account</Link></p>
    </form>
  );
}

export function SignUpForm({ firstAccount, minPassword }: { firstAccount: boolean; minPassword: number }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(signUp, undefined);
  const v = state?.values ?? {};
  return (
    <form action={action} className="auth-form">
      <h2>Create your account</h2>
      {firstAccount && (
        <p className="flash ok">No accounts exist yet. <strong>The first account created becomes the administrator.</strong></p>
      )}
      {state?.error && <p role="alert" className="flash error">{state.error}</p>}
      <label>Your name
        <input name="display_name" autoComplete="name" defaultValue={v.display_name} required autoFocus />
      </label>
      <label>Username <span className="muted">(shown to other collectors)</span>
        <input name="username" autoComplete="username" defaultValue={v.username} required minLength={3} maxLength={30}
          pattern="[A-Za-z0-9_.\-]+" title="Letters, numbers, dots, dashes or underscores" />
      </label>
      <label>Email <span className="muted">(private)</span>
        <input name="email" type="email" autoComplete="email" defaultValue={v.email} required />
      </label>
      <label>Password <span className="muted">(at least {minPassword} characters)</span>
        <input name="password" type="password" autoComplete="new-password" required minLength={minPassword} />
      </label>
      <label>Confirm password
        <input name="confirm" type="password" autoComplete="new-password" required minLength={minPassword} />
      </label>
      <button className="primary wide" disabled={pending}>{pending ? "Creating account…" : "Create account"}</button>
      <p className="muted center">Already have an account? <Link href="/signin">Sign in</Link></p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(requestReset, undefined);
  return (
    <form action={action} className="auth-form">
      <h2>Reset your password</h2>
      {state?.notice ? (
        <p role="status" className="flash ok">{state.notice}</p>
      ) : (
        <>
          <p className="muted">Enter the email you signed up with and we&apos;ll send you a link to choose a new password.</p>
          {state?.error && <p role="alert" className="flash error">{state.error}</p>}
          <label>Email
            <input name="email" type="email" autoComplete="email" defaultValue={state?.values?.email} required autoFocus />
          </label>
          <button className="primary wide" disabled={pending}>{pending ? "Sending…" : "Send reset link"}</button>
        </>
      )}
      <p className="muted center"><Link href="/signin">Back to sign in</Link></p>
    </form>
  );
}

export function ResetPasswordForm({ token, minPassword }: { token: string; minPassword: number }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(resetPassword, undefined);
  return (
    <form action={action} className="auth-form">
      <h2>Choose a new password</h2>
      {state?.error && <p role="alert" className="flash error">{state.error}</p>}
      <input type="hidden" name="token" value={token} />
      <label>New password <span className="muted">(at least {minPassword} characters)</span>
        <input name="password" type="password" autoComplete="new-password" required minLength={minPassword} autoFocus />
      </label>
      <label>Confirm new password
        <input name="confirm" type="password" autoComplete="new-password" required minLength={minPassword} />
      </label>
      <button className="primary wide" disabled={pending}>{pending ? "Saving…" : "Save new password"}</button>
      <p className="muted center">Saving signs you out on every other device.</p>
    </form>
  );
}

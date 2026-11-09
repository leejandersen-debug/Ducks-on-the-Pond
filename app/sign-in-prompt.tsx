import Link from "next/link";

// Shown on pages that belong to a signed-in collector.
export function SignInPrompt() {
  return (
    <div className="notice">
      <p>This page shows your own cards, so you need to be signed in.</p>
      <p><Link className="button" href="/signin">Sign in</Link> <Link className="button secondary" href="/signup">Create an account</Link></p>
    </div>
  );
}

import { redirect } from "next/navigation";
import { SignUpForm } from "../auth-forms";
import { MIN_PASSWORD } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { dbProblem } from "@/lib/db-status";
import { currentUserId } from "@/lib/session";

export default async function SignUpPage() {
  if (await dbProblem()) return null; // the layout shows the reason
  if (await currentUserId()) redirect("/");
  const hasAccounts = await withUser(null, async (db) =>
    (await db.query("select auth_has_accounts() as yes")).rows[0].yes as boolean);
  return <main className="auth-page"><SignUpForm firstAccount={!hasAccounts} minPassword={MIN_PASSWORD} /></main>;
}

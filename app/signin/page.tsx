import { redirect } from "next/navigation";
import { SignInForm } from "../auth-forms";
import { currentUserId } from "@/lib/session";

export default async function SignInPage() {
  if (await currentUserId()) redirect("/");
  return <main className="auth-page"><SignInForm /></main>;
}

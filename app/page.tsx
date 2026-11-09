import Link from "next/link";
import { SignInForm } from "./auth-forms";
import { HealthStatus } from "./health-status";
import { withUser } from "@/lib/db";
import { dbProblem } from "@/lib/db-status";
import { listProfiles } from "@/lib/queries";
import { currentUserId } from "@/lib/session";

const SECTIONS = [
  { href: "/collection", title: "My collection", text: "Add the cards you own, set them tradeable, list prices, record sales." },
  { href: "/wants", title: "Wishlist", text: "Save the cards you want and see collectors who have them." },
  { href: "/trades", title: "Trades", text: "Propose, counter, accept and complete trades." },
  { href: "/reports", title: "Reports", text: "Inventory, for sale, sold, and profit totals." },
  { href: "/catalog", title: "Catalog", text: "Browse or add sets, parallels, cards and variants." },
  { href: "/search", title: "Help & search", text: "Ask a question; answers come from the help documents." },
];

export default async function Home({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  if (await dbProblem()) return null; // the layout shows the reason
  const me = await currentUserId();
  const { welcome } = await searchParams;

  if (!me) {
    return (
      <main className="landing">
        <section className="hero">
          <h1>Track, trade and value your sports cards.</h1>
          <p className="lead">Record the cards you own, keep a wishlist, find collectors who have what you want, and trade with them.</p>
          <ul className="checks">
            <li>Your prices and private wants stay private.</li>
            <li>Serial numbers checked so each numbered card exists once.</li>
            <li>Reports on inventory, sales and profit.</li>
          </ul>
          <p className="muted">Just looking? <Link href="/catalog">Browse the catalog</Link> or <Link href="/search">ask a help question</Link>, no account needed.</p>
        </section>
        <SignInForm />
      </main>
    );
  }

  const profile = (await withUser(me, listProfiles)).find((p) => p.id === me);
  return (
    <main>
      {welcome === "admin" && (
        <p className="flash ok"><strong>Your account is ready, and you are the administrator.</strong> The Admin page is now in the menu.</p>
      )}
      {welcome === "1" && <p className="flash ok"><strong>Welcome!</strong> Your account is ready.</p>}
      <h1>Welcome back, {profile?.display_name ?? profile?.username}</h1>
      <div className="tiles">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="tile">
            <h2>{s.title}</h2>
            <p>{s.text}</p>
          </Link>
        ))}
        {profile?.is_admin && (
          <Link href="/admin" className="tile admin">
            <h2>Admin</h2>
            <p>Resolve serial-number conflicts.</p>
          </Link>
        )}
      </div>
      <div className="muted small-print"><HealthStatus /></div>
    </main>
  );
}

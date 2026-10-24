import { createSet } from "../actions";
import { Flash, type FlashParams } from "../flash";
import { withUser } from "@/lib/db";
import { dbProblem } from "@/lib/db-status";
import { currentUserId } from "@/lib/session";

export default async function CatalogPage({ searchParams }: { searchParams: FlashParams }) {
  if (await dbProblem()) return null; // the layout shows the reason
  const sp = await searchParams;
  const me = await currentUserId();
  const sets = await withUser(me, async (db) => (await db.query(
    `select s.id, s.year, s.manufacturer, s.name, s.sport,
       (select count(*) from cards k where k.set_id = s.id)::int as cards,
       (select count(*) from parallels p where p.set_id = s.id)::int as parallels
     from sets s order by s.year desc, s.manufacturer, s.name`,
  )).rows);

  return (
    <main>
      <h1>Catalog</h1>
      <Flash ok={sp.ok} error={sp.error} />
      <h2>Sets</h2>
      <table border={1} cellPadding={4}>
        <thead><tr><th>Year</th><th>Manufacturer</th><th>Name</th><th>Sport</th><th>Parallels</th><th>Cards</th></tr></thead>
        <tbody>
          {sets.map((s) => (
            <tr key={s.id}>
              <td>{s.year}</td><td>{s.manufacturer}</td>
              <td><a href={`/catalog/${s.id}`}>{s.name}</a></td>
              <td>{s.sport}</td><td>{s.parallels}</td><td>{s.cards}</td>
            </tr>
          ))}
          {sets.length === 0 && <tr><td colSpan={6}>No sets yet.</td></tr>}
        </tbody>
      </table>

      <h2>Add a set</h2>
      <form action={createSet}>
        <input type="hidden" name="back" value="/catalog" />
        <p>Sport <input name="sport" defaultValue="baseball" required /></p>
        <p>Year <input name="year" type="number" required /></p>
        <p>Manufacturer <input name="manufacturer" placeholder="Topps" required /></p>
        <p>Name <input name="name" placeholder="Chrome" required /></p>
        <button>Add set</button> (a Base parallel is created automatically)
      </form>
    </main>
  );
}

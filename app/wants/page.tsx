import { addWant, deleteWant } from "../actions";
import { Flash, type FlashParams } from "../flash";
import { withUser } from "@/lib/db";
import { dbProblem } from "@/lib/db-status";
import { money } from "@/lib/forms";
import { describeCopy, listCards, listGradingCompanies, listVariants, PUBLIC_COPY_COLUMNS } from "@/lib/queries";
import { currentUserId } from "@/lib/session";

const BACK = "/wants";

// A copy satisfies a want if it's the same variant (or any variant of the wanted card)
// and meets the minimum grade.
const MATCH = `(w.variant_id = d.variant_id or w.card_id = d.card_id)
  and (w.min_grading_company_id is null or d.grading_company_id = w.min_grading_company_id)
  and (w.min_grade is null or d.grade >= w.min_grade)`;

export default async function WantsPage({ searchParams }: { searchParams: FlashParams }) {
  if (await dbProblem()) return null; // the layout shows the reason
  const sp = await searchParams;
  const me = await currentUserId();
  if (!me) return <main><h1>Wishlist</h1><p>Pick a test user first.</p></main>;

  const data = await withUser(me, async (db) => ({
    wants: (await db.query("select * from wants where user_id = $1 order by created_at", [me])).rows,
    cards: await listCards(db),
    variants: await listVariants(db),
    companies: await listGradingCompanies(db),
    // Other users' tradeable copies that match my wants.
    forMe: (await db.query(
      `select d.*, pr.username as owner from (select ${PUBLIC_COPY_COLUMNS} from copy_details
         where is_tradeable and owner_id <> $1) d
       join profiles pr on pr.id = d.owner_id
       where exists (select 1 from wants w where w.user_id = $1 and ${MATCH})
       order by pr.username, d.label`, [me],
    )).rows,
    // Other users' public wants that one of my tradeable copies would satisfy.
    fromMe: (await db.query(
      `select w.id, pr.username as wanted_by, d.copy_id, d.label, d.serial_number, d.print_run,
              d.grading_company_id, d.grade
       from wants w join profiles pr on pr.id = w.user_id
       join (select ${PUBLIC_COPY_COLUMNS} from copy_details where owner_id = $1 and is_tradeable) d on ${MATCH}
       where w.is_public and w.user_id <> $1 order by pr.username`, [me],
    )).rows,
  }));
  const label = (w: { card_id: string | null; variant_id: string | null }) =>
    w.card_id
      ? `${data.cards.find((c) => c.id === w.card_id)?.label} (any version)`
      : data.variants.find((v) => v.id === w.variant_id)?.label;

  return (
    <main>
      <h1>Wishlist</h1>
      <Flash ok={sp.ok} error={sp.error} />

      <h2>My wants</h2>
      <table border={1} cellPadding={4}>
        <thead><tr><th>Card</th><th>Minimum grade</th><th>Max price</th><th>Public</th><th>Notes</th><th></th></tr></thead>
        <tbody>
          {data.wants.map((w) => (
            <tr key={w.id}>
              <td>{label(w)}</td>
              <td>{[w.min_grading_company_id, w.min_grade].filter(Boolean).join(" ") || "any"}</td>
              <td>{money(w.max_price_cents)}</td>
              <td>{w.is_public ? "yes" : "no"}</td>
              <td>{w.notes}</td>
              <td>
                <form action={deleteWant}>
                  <input type="hidden" name="back" value={BACK} />
                  <input type="hidden" name="want_id" value={w.id} />
                  <button>Remove</button>
                </form>
              </td>
            </tr>
          ))}
          {data.wants.length === 0 && <tr><td colSpan={6}>Nothing on your wishlist.</td></tr>}
        </tbody>
      </table>

      <h2>Add a want</h2>
      <form action={addWant}>
        <input type="hidden" name="back" value={BACK} />
        <p>
          <select name="target" required>
            <option value="">Choose…</option>
            <optgroup label="Any version of a card">
              {data.cards.map((c) => <option key={c.id} value={`card:${c.id}`}>{c.label}</option>)}
            </optgroup>
            <optgroup label="An exact variant">
              {data.variants.map((v) => <option key={v.id} value={`variant:${v.id}`}>{v.label}</option>)}
            </optgroup>
          </select>
        </p>
        <p>
          Minimum grade{" "}
          <select name="min_grading_company_id" defaultValue="">
            <option value="">any company</option>
            {data.companies.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>{" "}
          <input name="min_grade" type="number" step="0.5" min={1} max={10} placeholder="e.g. 9" />
        </p>
        <p>Max price $<input name="max_price" size={8} /></p>
        <p>Notes <input name="notes" size={40} /></p>
        <p><label><input type="checkbox" name="is_public" defaultChecked /> Public (other users can see it and offer trades)</label></p>
        <button>Add want</button>
      </form>

      <h2>Tradeable copies that match my wants</h2>
      <ul>
        {data.forMe.map((c) => (
          <li key={c.copy_id}>
            {describeCopy(c)}, owned by {c.owner}:{" "}
            <a href={`/trades?with=${encodeURIComponent(c.owner_id)}&theirs=${c.copy_id}`}>propose a trade</a>
          </li>
        ))}
        {data.forMe.length === 0 && <li>No matches right now.</li>}
      </ul>

      <h2>My tradeable copies that others want</h2>
      <ul>
        {data.fromMe.map((r) => <li key={`${r.id}-${r.copy_id}`}>{describeCopy(r)}, wanted by {r.wanted_by}</li>)}
        {data.fromMe.length === 0 && <li>None right now.</li>}
      </ul>
    </main>
  );
}

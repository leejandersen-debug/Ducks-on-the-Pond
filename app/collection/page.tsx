import { addCopy, deleteCopy, markSold, setListedPrice, setTradeable, undoSale } from "../actions";
import { Flash, type FlashParams } from "../flash";
import { withUser } from "@/lib/db";
import { dbProblem } from "@/lib/db-status";
import { money } from "@/lib/forms";
import {
  describeCopy, listGradingCompanies, listVariants, OWNER_COPY_COLUMNS, type CopyRow,
} from "@/lib/queries";
import { currentUserId } from "@/lib/session";

const BACK = "/collection";

export default async function CollectionPage({ searchParams }: { searchParams: FlashParams }) {
  if (await dbProblem()) return null; // the layout shows the reason
  const sp = await searchParams;
  const me = await currentUserId();
  if (!me) return <main><h1>My collection</h1><p>Pick a test user first.</p></main>;

  const { copies, variants, companies, conflicts } = await withUser(me, async (db) => ({
    copies: (await db.query(
      `select ${OWNER_COPY_COLUMNS} from copy_details where owner_id = $1 order by is_sold, label`, [me],
    )).rows as CopyRow[],
    variants: await listVariants(db),
    companies: await listGradingCompanies(db),
    conflicts: (await db.query(
      `select k.id, k.serial_number, k.status, k.created_at, k.resolution_note, v.id as variant_id
       from serial_conflicts k join card_variants v on v.id = k.variant_id
       where k.submitted_by = $1 order by k.created_at desc`, [me],
    )).rows,
  }));
  const owned = copies.filter((c) => !c.is_sold);
  const sold = copies.filter((c) => c.is_sold);
  const variantLabel = (id: string) => variants.find((v) => v.id === id)?.label ?? id;

  return (
    <main>
      <h1>My collection</h1>
      <Flash ok={sp.ok} error={sp.error} />

      <h2>In my collection ({owned.length})</h2>
      <table border={1} cellPadding={4}>
        <thead>
          <tr><th>Card</th><th>Cert</th><th>Acquired</th><th>Paid</th><th>Tradeable</th><th>Listed price</th><th>Sell</th><th></th></tr>
        </thead>
        <tbody>
          {owned.map((c) => (
            <tr key={c.copy_id}>
              <td>{describeCopy(c)}</td>
              <td>{c.cert_number}</td>
              <td>{c.acquired_at}</td>
              <td>{money(c.paid_price_cents)}</td>
              <td>
                <form action={setTradeable}>
                  <input type="hidden" name="back" value={BACK} />
                  <input type="hidden" name="copy_id" value={c.copy_id} />
                  <input type="hidden" name="on" value={c.is_tradeable ? "0" : "1"} />
                  {c.is_tradeable ? "ON " : "off "}<button>{c.is_tradeable ? "Turn off" : "Turn on"}</button>
                </form>
              </td>
              <td>
                <form action={setListedPrice}>
                  <input type="hidden" name="back" value={BACK} />
                  <input type="hidden" name="copy_id" value={c.copy_id} />
                  $<input name="listed_price" defaultValue={c.listed_price_cents ? (c.listed_price_cents / 100).toFixed(2) : ""} size={8} />{" "}
                  <button>Save</button>
                </form>
              </td>
              <td>
                <form action={markSold}>
                  <input type="hidden" name="back" value={BACK} />
                  <input type="hidden" name="copy_id" value={c.copy_id} />
                  $<input name="sold_price" size={8} required />{" "}
                  <input name="sold_at" type="date" title="Defaults to today" />{" "}
                  <button>Mark sold</button>
                </form>
              </td>
              <td>
                <form action={deleteCopy}>
                  <input type="hidden" name="back" value={BACK} />
                  <input type="hidden" name="copy_id" value={c.copy_id} />
                  <button>Delete</button>
                </form>
              </td>
            </tr>
          ))}
          {owned.length === 0 && <tr><td colSpan={8}>Nothing yet. Add a card below.</td></tr>}
        </tbody>
      </table>

      <h2>Sold ({sold.length})</h2>
      <table border={1} cellPadding={4}>
        <thead><tr><th>Card</th><th>Paid</th><th>Sold for</th><th>Sold on</th><th></th></tr></thead>
        <tbody>
          {sold.map((c) => (
            <tr key={c.copy_id}>
              <td>{describeCopy(c)}</td>
              <td>{money(c.paid_price_cents)}</td>
              <td>{money(c.sold_price_cents)}</td>
              <td>{c.sold_at}</td>
              <td>
                <form action={undoSale}>
                  <input type="hidden" name="back" value={BACK} />
                  <input type="hidden" name="copy_id" value={c.copy_id} />
                  <button>Undo sale</button>
                </form>
              </td>
            </tr>
          ))}
          {sold.length === 0 && <tr><td colSpan={5}>No sales yet.</td></tr>}
        </tbody>
      </table>

      <h2>Add a card to my collection</h2>
      <form action={addCopy}>
        <input type="hidden" name="back" value={BACK} />
        <p>
          Card variant{" "}
          <select name="variant_id" required>
            <option value="">Choose…</option>
            {variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>{" "}
          (missing? add it in the <a href="/catalog">Catalog</a>)
        </p>
        <p>Serial number <input name="serial_number" type="number" min={1} placeholder="23 (of /50)" /></p>
        <p>
          Grading{" "}
          <select name="grading_company_id" defaultValue="">
            <option value="">Raw (ungraded)</option>
            {companies.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>{" "}
          Grade <input name="grade" type="number" step="0.5" min={1} max={10} />{" "}
          Cert # <input name="cert_number" />
        </p>
        <p>Paid $<input name="paid_price" size={8} /> Acquired <input name="acquired_at" type="date" /></p>
        <p>Condition notes <input name="condition_notes" size={40} /></p>
        <p>Note for admin, if the serial is already taken <input name="note" size={40} /></p>
        <button>Add card</button>
      </form>

      <h2>My serial-number reviews</h2>
      <ul>
        {conflicts.map((k) => (
          <li key={k.id}>
            {variantLabel(k.variant_id)} #{k.serial_number}: <strong>{k.status === "open" ? "pending admin review" : k.status}</strong>
            {k.resolution_note ? ` (${k.resolution_note})` : ""}
          </li>
        ))}
        {conflicts.length === 0 && <li>None.</li>}
      </ul>
    </main>
  );
}

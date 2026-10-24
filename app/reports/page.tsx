import { Flash, type FlashParams } from "../flash";
import { withUser } from "@/lib/db";
import { dbProblem } from "@/lib/db-status";
import { money } from "@/lib/forms";
import { describeCopy, OWNER_COPY_COLUMNS, type CopyRow } from "@/lib/queries";
import { currentUserId } from "@/lib/session";

type Row = CopyRow & { listed_margin_cents?: number | null; profit_cents?: number | null };

export default async function ReportsPage({ searchParams }: { searchParams: FlashParams }) {
  if (await dbProblem()) return null; // the layout shows the reason
  const sp = await searchParams;
  const me = await currentUserId();
  if (!me) return <main><h1>Reports</h1><p>Pick a test user first.</p></main>;

  // The report views already filter to the signed-in user.
  const r = await withUser(me, async (db) => ({
    summary: (await db.query("select * from collection_summary")).rows[0],
    inventory: (await db.query(`select ${OWNER_COPY_COLUMNS} from inventory_report order by label`)).rows as Row[],
    forSale: (await db.query(
      `select ${OWNER_COPY_COLUMNS}, listed_margin_cents from for_sale_report order by label`,
    )).rows as Row[],
    sold: (await db.query(
      `select ${OWNER_COPY_COLUMNS}, profit_cents from sold_report order by sold_at desc`,
    )).rows as Row[],
  }));
  const s = r.summary ?? {};

  return (
    <main>
      <h1>Reports</h1>
      <Flash ok={sp.ok} error={sp.error} />

      <h2>Summary</h2>
      <ul>
        <li>Inventory: {s.inventory_count ?? 0} cards, cost {money(s.inventory_cost_cents) || "$0.00"}, market {money(s.inventory_market_cents) || "n/a"}</li>
        <li>For sale: {s.for_sale_count ?? 0} cards, listed total {money(s.for_sale_listed_cents) || "$0.00"}</li>
        <li>Sold: {s.sold_count ?? 0} cards, revenue {money(s.sold_revenue_cents) || "$0.00"}, profit {money(s.sold_profit_cents) || "$0.00"}</li>
      </ul>

      <h2>Inventory ({r.inventory.length})</h2>
      <Table rows={r.inventory} cols={[
        ["Paid", (c) => money(c.paid_price_cents)],
        ["Market", (c) => money(c.market_price_cents)],
        ["Listed", (c) => money(c.listed_price_cents)],
        ["Tradeable", (c) => (c.is_tradeable ? "yes" : "")],
      ]} />

      <h2>For sale ({r.forSale.length})</h2>
      <Table rows={r.forSale} cols={[
        ["Paid", (c) => money(c.paid_price_cents)],
        ["Listed", (c) => money(c.listed_price_cents)],
        ["Margin", (c) => money(c.listed_margin_cents)],
      ]} />

      <h2>Sold ({r.sold.length})</h2>
      <Table rows={r.sold} cols={[
        ["Sold on", (c) => c.sold_at ?? ""],
        ["Paid", (c) => money(c.paid_price_cents)],
        ["Sold for", (c) => money(c.sold_price_cents)],
        ["Profit", (c) => money(c.profit_cents)],
      ]} />
    </main>
  );
}

function Table({ rows, cols }: { rows: Row[]; cols: [string, (c: Row) => string][] }) {
  return (
    <table border={1} cellPadding={4}>
      <thead><tr><th>Card</th>{cols.map(([h]) => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.copy_id}><td>{describeCopy(c)}</td>{cols.map(([h, f]) => <td key={h}>{f(c)}</td>)}</tr>
        ))}
        {rows.length === 0 && <tr><td colSpan={cols.length + 1}>None.</td></tr>}
      </tbody>
    </table>
  );
}

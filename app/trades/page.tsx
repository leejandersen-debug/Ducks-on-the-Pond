import { completeTrade, proposeTrade, respondTrade } from "../actions";
import { Flash, type FlashParams } from "../flash";
import { withUser } from "@/lib/db";
import { dbProblem } from "@/lib/db-status";
import { describeCopy, listProfiles, PUBLIC_COPY_COLUMNS } from "@/lib/queries";
import { currentUserId } from "@/lib/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function TradesPage({ searchParams }: { searchParams: FlashParams }) {
  if (await dbProblem()) return null; // the layout shows the reason
  const sp = await searchParams;
  const me = await currentUserId();
  if (!me) return <main><h1>Trades</h1><p>Pick a test user first.</p></main>;

  const counterId = one(sp.counter);
  const data = await withUser(me, async (db) => {
    const profiles = await listProfiles(db);
    const trades = (await db.query(
      `select t.*, pp.username as proposer, rp.username as recipient from trades t
       join profiles pp on pp.id = t.proposer_id join profiles rp on rp.id = t.recipient_id
       order by t.created_at desc`,
    )).rows;
    const items = (await db.query("select * from my_trade_items()")).rows;

    // Counteroffer: start from the offer made to me, with the same cards preselected.
    const counter = counterId && UUID.test(counterId)
      ? trades.find((t) => t.id === counterId && t.recipient_id === me && t.status === "proposed")
      : undefined;
    const wanted = counter?.proposer_id ?? one(sp.with);
    const partner = profiles.some((p) => p.id === wanted && p.id !== me) ? wanted! : null;
    const preselected = new Set<string>(
      counter ? items.filter((i) => i.trade_id === counter.id).map((i) => i.copy_id) : [one(sp.theirs) ?? ""],
    );

    const tradeable = async (owner: string) => (await db.query(
      `select ${PUBLIC_COPY_COLUMNS} from copy_details where owner_id = $1 and is_tradeable order by label`, [owner],
    )).rows;
    return {
      profiles, trades, items, counter, partner, preselected,
      mine: partner ? await tradeable(me) : [],
      theirs: partner ? await tradeable(partner) : [],
    };
  });
  const others = data.profiles.filter((p) => p.id !== me);
  const partnerName = data.profiles.find((p) => p.id === data.partner)?.username;

  return (
    <main>
      <h1>Trades</h1>
      <Flash ok={sp.ok} error={sp.error} />

      <h2>{data.counter ? `Counteroffer to ${partnerName}` : "Propose a trade"}</h2>
      {!data.counter && (
        <form method="get" action="/trades">
          Trade with{" "}
          <select name="with" defaultValue={data.partner ?? ""}>
            <option value="">Choose…</option>
            {others.map((p) => <option key={p.id} value={p.id}>{p.username}</option>)}
          </select>{" "}
          <button>Show their tradeable cards</button>
        </form>
      )}
      {data.partner && (
        <form action={proposeTrade}>
          <input type="hidden" name="back" value="/trades" />
          <input type="hidden" name="recipient" value={data.partner} />
          {data.counter && <input type="hidden" name="replaces" value={data.counter.id} />}
          <h3>I give (my tradeable cards)</h3>
          <ul>
            {data.mine.map((c) => (
              <li key={c.copy_id}>
                <label><input type="checkbox" name="mine" value={c.copy_id} defaultChecked={data.preselected.has(c.copy_id)} /> {describeCopy(c)}</label>
              </li>
            ))}
            {data.mine.length === 0 && <li>None. Turn on Tradeable in <a href="/collection">My collection</a>.</li>}
          </ul>
          <h3>I get ({partnerName}&apos;s tradeable cards)</h3>
          <ul>
            {data.theirs.map((c) => (
              <li key={c.copy_id}>
                <label><input type="checkbox" name="theirs" value={c.copy_id} defaultChecked={data.preselected.has(c.copy_id)} /> {describeCopy(c)}</label>
              </li>
            ))}
            {data.theirs.length === 0 && <li>{partnerName} has no tradeable cards.</li>}
          </ul>
          <p>Message <input name="message" size={50} /></p>
          <button>{data.counter ? "Send counteroffer" : "Propose trade"}</button>
        </form>
      )}

      <h2>My trades</h2>
      {data.trades.length === 0 && <p>No trades yet.</p>}
      {data.trades.map((t) => {
        const iAmRecipient = t.recipient_id === me;
        const tradeItems = data.items.filter((i) => i.trade_id === t.id);
        return (
          <section key={t.id} style={{ border: "1px solid", padding: 8, marginBottom: 8 }}>
            <p>
              <strong>{t.status}</strong>: {t.proposer} → {t.recipient}, {new Date(t.created_at).toLocaleString()}
              {t.replaces_trade ? " (counteroffer)" : ""}
            </p>
            {t.message && <p>Message: {t.message}</p>}
            <ul>
              {tradeItems.map((i) => (
                <li key={i.copy_id}>
                  from {i.from_user_id === t.proposer_id ? t.proposer : t.recipient}: {describeCopy(i)}
                </li>
              ))}
            </ul>
            {t.status === "proposed" && iAmRecipient && (
              <>
                <TradeButton id={t.id} action="accept" label="Accept" />{" "}
                <TradeButton id={t.id} action="decline" label="Decline" />{" "}
                <a href={`/trades?counter=${t.id}`}>Counter…</a>
              </>
            )}
            {(t.status === "proposed" || t.status === "accepted") && !iAmRecipient && (
              <TradeButton id={t.id} action="cancel" label="Cancel" />
            )}
            {t.status === "accepted" && (
              <form action={completeTrade} style={{ display: "inline" }}>
                <input type="hidden" name="back" value="/trades" />
                <input type="hidden" name="trade_id" value={t.id} />{" "}
                <button>Complete (cards exchanged)</button>
              </form>
            )}
          </section>
        );
      })}
    </main>
  );
}

function TradeButton({ id, action, label }: { id: string; action: string; label: string }) {
  return (
    <form action={respondTrade} style={{ display: "inline" }}>
      <input type="hidden" name="back" value="/trades" />
      <input type="hidden" name="trade_id" value={id} />
      <input type="hidden" name="action" value={action} />
      <button>{label}</button>
    </form>
  );
}

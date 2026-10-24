import { notFound } from "next/navigation";
import { createCard, createParallel, createVariant } from "../../actions";
import { Flash, type FlashParams } from "../../flash";
import { withUser } from "@/lib/db";
import { dbProblem } from "@/lib/db-status";
import { currentUserId } from "@/lib/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SetPage({ params, searchParams }: {
  params: Promise<{ setId: string }>; searchParams: FlashParams;
}) {
  if (await dbProblem()) return null; // the layout shows the reason
  const { setId } = await params;
  if (!UUID.test(setId)) notFound();
  const sp = await searchParams;
  const me = await currentUserId();
  const back = `/catalog/${setId}`;

  const data = await withUser(me, async (db) => {
    const set = (await db.query("select * from sets where id = $1", [setId])).rows[0];
    if (!set) return null;
    const parallels = (await db.query(
      "select id, name, print_run from parallels where set_id = $1 order by (name <> 'Base'), name", [setId],
    )).rows;
    const cards = (await db.query(
      `select k.id, k.card_number, k.title, k.is_rookie,
         (select string_agg(pl.full_name, ' / ' order by cp.position)
            from card_players cp join players pl on pl.id = cp.player_id where cp.card_id = k.id) as players
       from cards k where k.set_id = $1 order by length(k.card_number), k.card_number`, [setId],
    )).rows;
    const variants = (await db.query(
      `select v.id, v.card_id, p.name as parallel, v.is_autograph, v.is_relic,
         coalesce(v.print_run, p.print_run) as print_run
       from card_variants v join parallels p on p.id = v.parallel_id join cards k on k.id = v.card_id
       where k.set_id = $1 order by p.name, v.is_autograph, v.is_relic`, [setId],
    )).rows;
    return { set, parallels, cards, variants };
  });
  if (!data) notFound();
  const { set, parallels, cards, variants } = data;

  return (
    <main>
      <p><a href="/catalog">← Catalog</a></p>
      <h1>{set.year} {set.manufacturer} {set.name} ({set.sport})</h1>
      <Flash ok={sp.ok} error={sp.error} />

      <h2>Parallels</h2>
      <ul>
        {parallels.map((p) => <li key={p.id}>{p.name}{p.print_run ? ` /${p.print_run}` : " (not numbered)"}</li>)}
      </ul>
      <form action={createParallel}>
        <input type="hidden" name="back" value={back} />
        <input type="hidden" name="set_id" value={setId} />
        Name <input name="name" placeholder="Gold Refractor" required />{" "}
        Print run <input name="print_run" type="number" min={1} placeholder="50 (blank = not numbered)" />{" "}
        <button>Add parallel</button>
      </form>

      <h2>Cards</h2>
      <table border={1} cellPadding={4}>
        <thead><tr><th>#</th><th>Card</th><th>Rookie</th><th>Variants</th><th>Add a variant</th></tr></thead>
        <tbody>
          {cards.map((k) => (
            <tr key={k.id}>
              <td>{k.card_number}</td>
              <td>{k.title ?? k.players}{k.title && k.players ? ` (${k.players})` : ""}</td>
              <td>{k.is_rookie ? "RC" : ""}</td>
              <td>
                <ul>
                  {variants.filter((v) => v.card_id === k.id).map((v) => (
                    <li key={v.id}>
                      {v.parallel}{v.print_run ? ` /${v.print_run}` : ""}{v.is_autograph ? " Auto" : ""}{v.is_relic ? " Relic" : ""}
                    </li>
                  ))}
                </ul>
              </td>
              <td>
                <form action={createVariant}>
                  <input type="hidden" name="back" value={back} />
                  <input type="hidden" name="card_id" value={k.id} />
                  <select name="parallel_id" required>
                    {parallels.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>{" "}
                  <label><input type="checkbox" name="is_autograph" /> Auto</label>{" "}
                  <label><input type="checkbox" name="is_relic" /> Relic</label>{" "}
                  <input name="print_run" type="number" min={1} placeholder="print run override" size={14} />{" "}
                  <button>Add</button>
                </form>
              </td>
            </tr>
          ))}
          {cards.length === 0 && <tr><td colSpan={5}>No cards yet.</td></tr>}
        </tbody>
      </table>

      <h2>Add a card</h2>
      <form action={createCard}>
        <input type="hidden" name="back" value={back} />
        <input type="hidden" name="set_id" value={setId} />
        <p>Card number <input name="card_number" placeholder="150 or RC-12" required /></p>
        <p>Players <input name="players" placeholder="Comma-separated, e.g. Shohei Ohtani" size={40} /></p>
        <p>Title <input name="title" placeholder="Only if not named after the player(s)" size={40} /></p>
        <p><label><input type="checkbox" name="is_rookie" /> Rookie card</label></p>
        <button>Add card</button> (its Base variant is created automatically)
      </form>
    </main>
  );
}

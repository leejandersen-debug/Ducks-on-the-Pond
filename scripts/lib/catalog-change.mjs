// The one place catalog data is changed by the cleanup chore.
// Every change writes one structured log line (through the app's own logger, lib/log.ts):
//   {"ts":"…","level":"info","event":"catalog.change",
//    "details":{"table":"sets","id":"…","field":"manufacturer","before":"Tops","after":"Topps","author":"chore-run"}}
// The logging lives here, in the function that performs the change, so it can't be skipped
// by whoever (or whatever) runs the chore.
import { log } from "../../lib/log.ts";

// The only columns the chore may change (Rules.md, "May do alone").
const EDITABLE = {
  sets: ["name", "manufacturer"],
  parallels: ["name"],
  players: ["full_name"],
  cards: ["title"],
};

// Changes one field of one row, in its own transaction, and logs it in two steps:
//   catalog.change_committing  written just before the commit: unconfirmed, may or may not land
//   catalog.change             written once the commit is acknowledged: confirmed
// A process killed between the two leaves a committing line with no confirmation: check that
// one record. (Logging only after the commit missed changes when the process died after Postgres
// committed but before the acknowledgement arrived; logging only before it would claim changes
// that never landed.)
// Returns { changed: true, before, after }, { changed: false, before } when the value
// already matches, or { rejected: true, code, constraint } when the database refuses it.
export async function changeField(client, { table, id, field, to, author }) {
  if (!EDITABLE[table]?.includes(field)) throw new Error(`${table}.${field} is not a column the chore may change`);
  if (typeof to !== "string") throw new Error("the new value must be a string");
  if (!author) throw new Error("author is required");

  await client.query("begin");
  let before;
  try {
    // Lock the row and read the old value in the same transaction as the update.
    const found = await client.query(`select ${field} as value from ${table} where id = $1 for update`, [id]);
    if (found.rowCount !== 1) throw new Error(`${table} ${id} not found`);
    before = found.rows[0].value;
    if (before === to) {
      await client.query("rollback");
      return { changed: false, before };
    }
    await client.query(`update ${table} set ${field} = $1 where id = $2`, [to, id]);
    log.info("catalog.change_committing", { table, id, field, before, after: to, author });
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    if (err.code === "23505") {
      log.warn("catalog.change_rejected", { table, id, field, before, after: to, author, constraint: err.constraint });
      return { rejected: true, code: err.code, constraint: err.constraint };
    }
    throw err;
  }
  log.info("catalog.change", { table, id, field, before, after: to, author });
  return { changed: true, before, after: to };
}

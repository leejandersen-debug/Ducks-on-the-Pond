// Dev-only test data: three users (carol is an admin) and a small catalog with some copies.
// Runs as the database owner, so RLS doesn't apply. Safe to run more than once.
import pg from "pg";

if (process.env.NEON_BRANCH !== "dev") {
  console.error("Refusing to seed: NEON_BRANCH is not dev.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL_UNPOOLED.replace("sslmode=require", "sslmode=verify-full"),
});
await client.connect();
const one = async (sql, params) => (await client.query(sql, params)).rows[0];

try {
  await client.query("begin");
  for (const [id, name, admin] of [["alice", "Alice", false], ["bob", "Bob", false], ["carol", "Carol (admin)", true]]) {
    await client.query(
      `insert into profiles (id, username, display_name, email, is_admin) values ($1, $1, $2, $1 || '@example.test', $3)
       on conflict (id) do nothing`,
      [id, name, admin],
    );
  }

  if ((await one("select count(*)::int as n from sets")).n > 0) {
    console.log("Catalog already seeded; added any missing users only.");
  } else {
    const set = await one(
      `insert into sets (sport, year, manufacturer, name, created_by) values ('baseball', 2024, 'Topps', 'Chrome', 'alice') returning id`,
    );
    const parallel = {};
    parallel.Base = (await one("select id from parallels where set_id = $1 and name = 'Base'", [set.id])).id;
    for (const [name, run] of [["Refractor", null], ["Gold Refractor", 50], ["Orange Refractor", 25]]) {
      parallel[name] = (await one(
        "insert into parallels (set_id, name, print_run, created_by) values ($1, $2, $3, 'alice') returning id",
        [set.id, name, run],
      )).id;
    }

    const variant = {};
    for (const [num, player, rookie] of [["1", "Shohei Ohtani", false], ["99", "Aaron Judge", false],
                                         ["150", "Elly De La Cruz", false], ["200", "Jackson Holliday", true]]) {
      const card = await one(
        "insert into cards (set_id, card_number, is_rookie, created_by) values ($1, $2, $3, 'alice') returning id",
        [set.id, num, rookie],
      );
      const pl = await one("insert into players (full_name, created_by) values ($1, 'alice') returning id", [player]);
      await client.query("insert into card_players (card_id, player_id) values ($1, $2)", [card.id, pl.id]);
      variant[`${num} Base`] = (await one(
        "insert into card_variants (card_id, parallel_id, created_by) values ($1, $2, 'alice') returning id",
        [card.id, parallel.Base],
      )).id;
      if (num === "1") {
        variant["1 Gold"] = (await one(
          "insert into card_variants (card_id, parallel_id, created_by) values ($1, $2, 'alice') returning id",
          [card.id, parallel["Gold Refractor"]],
        )).id;
      }
      if (num === "200") {
        variant["200 Orange Auto"] = (await one(
          "insert into card_variants (card_id, parallel_id, is_autograph, created_by) values ($1, $2, true, 'alice') returning id",
          [card.id, parallel["Orange Refractor"]],
        )).id;
      }
    }

    const copies = [
      // owner, variant, serial, grading co, grade, paid $, tradeable
      ["alice", "1 Base", null, "PSA", 10, 120, true],
      ["alice", "1 Gold", 23, null, null, 450, false],
      ["alice", "99 Base", null, null, null, 3, false],
      ["bob", "200 Base", null, null, null, 5, false],
      ["bob", "1 Gold", 7, null, null, 500, true],
      ["bob", "150 Base", null, "BGS", 9.5, 40, true],
      ["carol", "200 Orange Auto", 12, null, null, 300, false],
    ];
    for (const [owner, v, serial, gco, grade, paid, tradeable] of copies) {
      await client.query(
        `insert into copies (variant_id, owner_id, serial_number, grading_company_id, grade, paid_price_cents,
                             acquired_at, is_tradeable, tradeable_since)
         values ($1, $2, $3, $4, $5, $6, current_date - 30, $7, case when $7 then now() end)`,
        [variant[v], owner, serial, gco, grade, paid * 100, tradeable],
      );
    }
    console.log("Seeded 3 users, 1 set, 4 parallels, 4 cards, 6 variants, 7 copies.");
  }
  await client.query("commit");
} catch (err) {
  await client.query("rollback");
  console.error("Seed failed:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}

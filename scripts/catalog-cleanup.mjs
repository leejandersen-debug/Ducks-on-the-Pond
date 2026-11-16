// The catalog cleanup chore's fixes (Rules.md, "May do alone"), on the Neon dev branch only.
//   npm run cleanup:dev              apply the fixes
//   npm run cleanup:dev -- --dry-run list them without changing anything
// Every change goes through changeField (scripts/lib/catalog-change.mjs), which writes one
// catalog.change log line per change with author "chore-run". Flags (anything the rules
// don't allow) are listed for the report, never applied.
import pg from "pg";
import { changeField } from "./lib/catalog-change.mjs";

const AUTHOR = "chore-run";
const dryRun = process.argv.includes("--dry-run");

if (process.env.NEON_BRANCH !== "dev") {
  console.error(`Refusing to run: NEON_BRANCH is "${process.env.NEON_BRANCH ?? ""}", expected "dev".`);
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL_UNPOOLED.replace("sslmode=require", "sslmode=verify-full"),
});
await client.connect();
const rows = async (sql, params) => (await client.query(sql, params)).rows;
const say = (text) => console.error(text); // progress on stderr; stdout carries only log lines

// Trim, and collapse runs of whitespace to one space.
const tidy = (value) => value.replace(/\s+/g, " ").trim();
const WHITESPACE_COLUMNS = [
  ["sets", "name"],
  ["sets", "manufacturer"],
  ["parallels", "name"],
  ["players", "full_name"],
  ["cards", "title"],
];

const summary = { changed: 0, rejected: [], ties: [] };

async function apply(change) {
  if (dryRun) {
    say(`would change ${change.table} ${change.id} ${change.field}: ${JSON.stringify(change.from)} -> ${JSON.stringify(change.to)}`);
    return;
  }
  const result = await changeField(client, { ...change, author: AUTHOR });
  if (result.changed) summary.changed++;
  if (result.rejected) summary.rejected.push({ ...change, constraint: result.constraint });
}

try {
  const counts = {};
  for (const t of ["sets", "parallels", "players", "cards"]) {
    counts[t] = (await rows(`select count(*)::int as n from ${t}`))[0].n;
  }
  say(`Counts: ${JSON.stringify(counts)}${dryRun ? " (dry run)" : ""}`);

  // 1. Whitespace in the five allowed columns.
  for (const [table, field] of WHITESPACE_COLUMNS) {
    for (const r of await rows(`select id, ${field} as value from ${table} where ${field} is not null order by id`)) {
      if (r.value !== tidy(r.value)) await apply({ table, id: r.id, field, from: r.value, to: tidy(r.value) });
    }
  }

  // 2. Manufacturer case: only when one spelling is used by strictly more sets than every other.
  const spellings = await rows(
    `select lower(manufacturer) as key, manufacturer, count(*)::int as n from sets group by 1, 2 order by 1, 3 desc`,
  );
  const groups = Map.groupBy(spellings, (s) => s.key);
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const [top, next] = group;
    if (top.n === next.n) {
      summary.ties.push({ key, spellings: group.map((s) => `${s.manufacturer} (${s.n})`) });
      continue;
    }
    for (const s of await rows(`select id, manufacturer from sets where lower(manufacturer) = $1 and manufacturer <> $2 order by id`, [key, top.manufacturer])) {
      await apply({ table: "sets", id: s.id, field: "manufacturer", from: s.manufacturer, to: top.manufacturer });
    }
  }

  say(`Changed: ${summary.changed}`);
  for (const r of summary.rejected) say(`FLAG (rejected by ${r.constraint}): ${r.table} ${r.id} ${r.field} ${JSON.stringify(r.from)}`);
  for (const t of summary.ties) say(`FLAG (case tie): ${t.spellings.join(" vs ")}`);
} finally {
  await client.end();
}

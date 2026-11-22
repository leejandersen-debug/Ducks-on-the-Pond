// The catalog cleanup chore's fixes (Rules.md, "May do alone"). Rules.md names the one branch allowed.
//   npm run cleanup:dev | cleanup:prod              apply the fixes (each script runs its branch guard first)
//   npm run cleanup:prod -- --dry-run               list them without changing anything
//   npm run cleanup:prod -- --list                  read-only: every row's id, name, created_at, card count
// Every change goes through changeField (scripts/lib/catalog-change.mjs), which writes one
// catalog.change log line per change with author "chore-run". Flags (anything the rules
// don't allow) are listed for the report, never applied.
// The log (stdout) is never empty for a real run: catalog.run_started first, catalog.run_finished
// (with counts) or catalog.run_failed last, and catalog.flagged / catalog.proposed for every flag
// and every ask-first proposal in between.
import pg from "pg";
import { changeField } from "./lib/catalog-change.mjs";
import { log } from "../lib/log.ts";

const AUTHOR = "chore-run";
const dryRun = process.argv.includes("--dry-run");
const listOnly = process.argv.includes("--list");
const STALE_DAYS = 7; // younger than this, someone may still be entering it (tasks/catalog-cleanup.md step 5)

if (!["dev", "production"].includes(process.env.NEON_BRANCH)) {
  console.error(`Refusing to run: NEON_BRANCH is "${process.env.NEON_BRANCH ?? ""}", expected "dev" or "production".`);
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL_UNPOOLED.replace("sslmode=require", "sslmode=verify-full"),
});
await client.connect();
const rows = async (sql, params) => (await client.query(sql, params)).rows;
const say = (text) => process.stderr.write(`${text}\n`); // progress on stderr; stdout carries only log lines
// The saved logbook is stdout. lib/log.ts writes warn and error lines to stderr, which would leave
// flags and failures (catalog.change_rejected, catalog.run_failed, ...) out of the logbook.
console.warn = console.log;
console.error = console.log;
const record = (level, event, details) => { if (!dryRun && !listOnly) log[level](event, { ...details, author: AUTHOR }); };

// Trim, and collapse runs of whitespace to one space.
const tidy = (value) => value.replace(/\s+/g, " ").trim();
const WHITESPACE_COLUMNS = [
  ["sets", "name"],
  ["sets", "manufacturer"],
  ["parallels", "name"],
  ["players", "full_name"],
  ["cards", "title"],
];

// A value with no letter or digit, or with control or replacement characters, can't be read
// safely. The chore flags it and leaves the whole record alone: no trimming, no case fix, no guess.
// (Tabs and newlines are ordinary whitespace, which tidy handles.)
const unreadable = (value) =>
  !/[\p{L}\p{N}]/u.test(value) || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD]/.test(value);
const skipped = new Set(); // "table id" of records with an unreadable value

const summary = { changed: 0, rejected: [], ties: [], unreadable: [], flagged: [], proposed: [] };
const flag = (details) => { summary.flagged.push(details); record("warn", "catalog.flagged", details); };
const propose = (details) => { summary.proposed.push(details); record("info", "catalog.proposed", details); };
// Near-duplicate key: case, spaces and punctuation ignored ("Ken Griffey Jr" ~ "ken griffey jr.").
const nameKey = (v) => (v ?? "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

async function apply(change) {
  if (skipped.has(`${change.table} ${change.id}`)) return;
  if (dryRun) {
    say(`would change ${change.table} ${change.id} ${change.field}: ${JSON.stringify(change.from)} -> ${JSON.stringify(change.to)}`);
    return;
  }
  const result = await changeField(client, { ...change, author: AUTHOR });
  if (result.changed) summary.changed++;
  if (result.rejected) summary.rejected.push({ ...change, constraint: result.constraint });
}

// --list: read-only listing so the worker can judge flags without writing its own queries.
if (listOnly) {
  try {
    await client.query("begin read only");
    const list = {
      sets: await rows(`select s.id, s.year, s.manufacturer, s.name, s.created_at, (select count(*)::int from cards c where c.set_id = s.id) as cards from sets s order by s.created_at`),
      parallels: await rows(`select p.id, p.set_id, p.name, p.print_run, p.created_at from parallels p order by p.created_at`),
      players: await rows(`select p.id, p.full_name, p.created_at, (select count(*)::int from card_players cp where cp.player_id = p.id) as cards from players p order by p.created_at`),
      cards: await rows(`select c.id, c.set_id, c.card_number, c.title, c.created_at from cards c order by c.created_at`),
    };
    for (const [table, items] of Object.entries(list)) for (const r of items) console.log(JSON.stringify({ table, ...r }));
    await client.query("rollback");
  } finally {
    await client.end();
  }
  process.exit(0);
}

const started = Date.now();
record("info", "catalog.run_started", { branch: process.env.NEON_BRANCH });
let failed = null;
try {
  const counts = {};
  for (const t of ["sets", "parallels", "players", "cards"]) {
    counts[t] = (await rows(`select count(*)::int as n from ${t}`))[0].n;
  }
  say(`Counts: ${JSON.stringify(counts)}${dryRun ? " (dry run)" : ""}`);

  // 0. Unreadable values: flag and skip the record before any fix looks at it.
  for (const [table, field] of WHITESPACE_COLUMNS) {
    for (const r of await rows(`select id, ${field} as value from ${table} where ${field} is not null order by id`)) {
      if (!unreadable(r.value)) continue;
      skipped.add(`${table} ${r.id}`);
      summary.unreadable.push({ table, id: r.id, field, value: r.value });
      if (!dryRun) log.warn("catalog.unreadable_skipped", { table, id: r.id, field, value: r.value, author: AUTHOR });
    }
  }

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
      flag({ table: "sets", id: null, reason: "case_tie", detail: group.map((s) => `${s.manufacturer} (${s.n})`).join(" vs "), proposal: "owner picks the spelling" });
      continue;
    }
    for (const s of await rows(`select id, manufacturer from sets where lower(manufacturer) = $1 and manufacturer <> $2 order by id`, [key, top.manufacturer])) {
      await apply({ table: "sets", id: s.id, field: "manufacturer", from: s.manufacturer, to: top.manufacturer });
    }
  }

  // 3. Step 5 flags the script can decide by rule, so they land in the log, not only the report.
  const cutoff = `now() - interval '${STALE_DAYS} days'`;
  for (const r of await rows(`select s.id, s.year, s.manufacturer, s.name from sets s where s.created_at < ${cutoff} and not exists (select 1 from cards c where c.set_id = s.id) order by s.id`)) {
    flag({ table: "sets", id: r.id, reason: "possibly_abandoned", detail: `${r.year} ${r.manufacturer} ${r.name}: no cards, older than ${STALE_DAYS} days`, proposal: "keep; ask the owner" });
  }
  for (const r of await rows(`select p.id, p.full_name from players p where p.created_at < ${cutoff} and not exists (select 1 from card_players cp where cp.player_id = p.id) order by p.id`)) {
    flag({ table: "players", id: r.id, reason: "possibly_abandoned", detail: `${r.full_name}: on no cards, older than ${STALE_DAYS} days`, proposal: "keep; ask the owner" });
  }
  for (const [table, field, scope] of [["players", "full_name", null], ["sets", "name", "year, manufacturer"]]) {
    const all = await rows(`select id, ${field} as value${scope ? `, ${scope}` : ""} from ${table} order by id`);
    const byKey = Map.groupBy(all, (r) => [scope ? `${r.year}|${nameKey(r.manufacturer)}` : "", nameKey(r.value)].join("|"));
    for (const group of byKey.values()) {
      if (group.length < 2 || new Set(group.map((r) => r.value)).size < 2) continue;
      propose({ table, ids: group.map((r) => r.id), values: group.map((r) => r.value), kind: "possible_duplicate", proposal: "owner reviews; merge only if the same record (ask first, never automatic)" });
    }
  }

  summary.counts = counts;
  say(`Changed: ${summary.changed}`);
  for (const u of summary.unreadable) say(`FLAG (unreadable, skipped, left as found): ${u.table} ${u.id} ${u.field} ${JSON.stringify(u.value)}`);
  for (const r of summary.rejected) say(`FLAG (rejected by ${r.constraint}): ${r.table} ${r.id} ${r.field} ${JSON.stringify(r.from)}`);
  for (const t of summary.ties) say(`FLAG (case tie): ${t.spellings.join(" vs ")}`);
  for (const f of summary.flagged) if (f.reason !== "case_tie") say(`FLAG (${f.reason}): ${f.table} ${f.id} ${f.detail}`);
  for (const p of summary.proposed) say(`PROPOSE (${p.kind}): ${p.table} ${p.ids.join(", ")} ${JSON.stringify(p.values)}`);
} catch (err) {
  failed = err;
} finally {
  await client.end().catch(() => {});
  if (failed) {
    record("error", "catalog.run_failed", { code: failed.code ?? failed.name ?? "unknown", ms: Date.now() - started });
    say(`FAILED: ${failed.message}`);
    process.exitCode = 1;
  } else {
    record("info", "catalog.run_finished", {
      counts: summary.counts, changed: summary.changed, rejected: summary.rejected.length, ties: summary.ties.length,
      unreadable: summary.unreadable.length, flagged: summary.flagged.length, proposed: summary.proposed.length,
      ms: Date.now() - started,
    });
  }
}

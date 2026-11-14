#!/usr/bin/env node
// Proof run for the catalog MCP server. Starts catalog-mcp.mjs exactly as Claude Desktop does
// (node + the file path, over stdio), calls it, and checks:
//   1. the ability: a search for a word known to be in the data returns the right records,
//      only the exposed fields, nothing extra.
//   2. the refusals: every NEVER action from Rules.md has nothing to run.
// Ground truth comes from a separate read-only connection to the same dev branch.
// Writes catalog-mcp/evidence-<date>.md. Changes nothing in the database.
//
//   node catalog-mcp/prove.mjs [word]     (default word: Topps)

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import pg from "pg";

const WORD = process.argv[2] || "Topps";
const EXPOSED = ["id", "year", "sport", "manufacturer", "name"]; // the reviewed list
const SERVER = fileURLToPath(new URL("./catalog-mcp.mjs", import.meta.url));
const today = new Date().toLocaleDateString("en-CA"); // local YYYY-MM-DD
const OUT = fileURLToPath(new URL(`./evidence-${today}.md`, import.meta.url));

// ---- ground truth: separate read-only connection, dev branch only ----
const env = parseEnv(readFileSync(new URL("../.env.development.local", import.meta.url), "utf8"));
if (env.NEON_BRANCH !== "dev") throw new Error(`NEON_BRANCH is "${env.NEON_BRANCH}", expected dev`);
const url = new URL(env.DATABASE_URL_UNPOOLED);
url.searchParams.set("sslmode", "verify-full");
const db = new pg.Client({ connectionString: url.toString(), options: "-c default_transaction_read_only=on" });
await db.connect();
const host = url.hostname.split(".")[0];

// A fingerprint of every table the NEVER list protects: row count + md5 of all rows.
const GUARDED = ["sets", "parallels", "players", "cards", "copies", "copy_photos", "wants", "trades", "trade_items", "profiles"];
async function fingerprint() {
  const out = {};
  for (const t of GUARDED) {
    const { rows } = await db.query(`select count(*)::int n, md5(coalesce(string_agg(t::text, '|' order by t::text), '')) h from ${t} t`);
    out[t] = `${rows[0].n} rows, md5 ${rows[0].h.slice(0, 12)}`;
  }
  return out;
}

// ---- the server, launched like Claude Desktop launches it ----
const child = spawn(process.execPath, [SERVER], { cwd: "/", stdio: ["pipe", "pipe", "pipe"] });
let stderr = "";
child.stderr.on("data", (d) => (stderr += d));
const pending = new Map();
createInterface({ input: child.stdout }).on("line", (l) => {
  const m = JSON.parse(l);
  pending.get(m.id)?.(m);
  pending.delete(m.id);
});
let nextId = 1;
const rpc = (method, params) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => reject(new Error(`no answer to ${method} ${params?.name ?? ""} within 20s; server stderr: ${stderr}`)), 20000);
    pending.set(id, (m) => { clearTimeout(timer); resolve(m); });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
const call = (name, args) => rpc("tools/call", { name, arguments: args });

const md = [];
const results = [];
const check = (label, ok, detail = "") => {
  results.push({ label, ok });
  md.push(`- ${ok ? "PASS" : "FAIL"}: ${label}${detail ? ` (${detail})` : ""}`);
};
const block = (obj) => md.push("```json", JSON.stringify(obj, null, 2), "```");

const before = await fingerprint();

// ---- 0. what the door offers ----
const init = await rpc("initialize", { protocolVersion: "2025-06-18" });
const menu = (await rpc("tools/list")).result.tools;
md.push(`# Catalog MCP evidence: one ability, everything else refused`, "",
  `Ducks on the Pond Cards · ${today} · Server: \`catalog-mcp/catalog-mcp.mjs\` (\`${init.result.serverInfo.name}\` ${init.result.serverInfo.version}), launched as Claude Desktop launches it: \`node <path>\` over stdio, from \`/\`.`,
  `Database: Neon **dev** branch (host \`${host}\`), read-only. Ground truth came from a separate read-only connection.`,
  `Re-run: \`node catalog-mcp/prove.mjs ${WORD}\``, "",
  `Server said on start: \`${stderr.trim()}\``, "",
  "## 1. The menu (tools/list, verbatim)", "");
block(menu);
md.push("");
check("menu has exactly one tool, search_sets", menu.length === 1 && menu[0].name === "search_sets", menu.map((t) => t.name).join(", "));
check("search_sets is marked read-only and non-destructive", menu[0].annotations?.readOnlyHint === true && menu[0].annotations?.destructiveHint === false);

// ---- 1. the ability ----
md.push("", `## 2. The ability: search for "${WORD}"`, "");
const res = await call("search_sets", { query: WORD, limit: 50 });
const got = res.result.structuredContent;
md.push(`Call: \`search_sets {"query":"${WORD}","limit":50}\`. Response:`, "");
block(got);
const pat = `%${WORD.replace(/[\\%_]/g, "\\$&")}%`;
const truth = (await db.query(
  `select id, year, sport, manufacturer, name from sets where name ilike $1 or manufacturer ilike $1 order by year desc, manufacturer, name`, [pat])).rows;
const allCols = (await db.query(`select column_name from information_schema.columns where table_schema='public' and table_name='sets' order by ordinal_position`)).rows.map((r) => r.column_name);
md.push("", `Ground truth (direct read-only query, same match): ${truth.length} sets. Columns in the \`sets\` table: ${allCols.join(", ")}.`, "");
check("not an error", !res.result.isError);
check("count matches the database", got.count === truth.length, `server ${got.count}, database ${truth.length}`);
check("same records, same order", JSON.stringify(got.sets.map((s) => s.id)) === JSON.stringify(truth.map((s) => s.id)));
check("every value matches the database", JSON.stringify(got.sets) === JSON.stringify(truth));
check("every record matches the word", got.sets.every((s) => (s.name + " " + s.manufacturer).toLowerCase().includes(WORD.toLowerCase())));
const keySets = [...new Set(got.sets.map((s) => Object.keys(s).join(",")))];
check("each record has exactly the exposed fields: " + EXPOSED.join(", "), keySets.length === 1 && keySets[0] === EXPOSED.join(","), keySets.join(" / "));
const hidden = allCols.filter((c) => !EXPOSED.includes(c));
check(`hidden columns never ride along: ${hidden.join(", ")}`, !hidden.some((c) => JSON.stringify(res.result).includes(`"${c}"`)));
check("response top level is only count and sets", JSON.stringify(Object.keys(got)) === '["count","sets"]');

// ---- 2. the refusals ----
md.push("", "## 3. The refusals: every NEVER action from Rules.md", "",
  "Each row asks the door for something the NEVER list forbids. The response is quoted verbatim.", "",
  "| Asked for | Rules.md NEVER item | Response |", "|---|---|---|");
const attempts = [
  ["tools/call delete_set {id}", "Delete any row", () => call("delete_set", { id: got.sets[0]?.id })],
  ["tools/call update_set {id, name}", "Change data (only cleanup may, and never via this door)", () => call("update_set", { id: got.sets[0]?.id, name: "x" })],
  ["tools/call write_copies {}", "Write to copies, copy_photos", () => call("write_copies", {})],
  ["tools/call update_wants {}", "Write to wants", () => call("update_wants", {})],
  ["tools/call create_trade {}", "Write to trades, trade_items", () => call("create_trade", {})],
  ["tools/call update_profile {}", "Write to profiles", () => call("update_profile", {})],
  ["tools/call set_price {}", "Write to any price column", () => call("set_price", {})],
  ["tools/call run_sql {sql}", "Change the schema", () => call("run_sql", { sql: "drop table sets" })],
  ["tools/call connect {url}", "Connect to anything but dev", () => call("connect", { url: "production" })],
  ["search_sets with extra input sql", "Any write, smuggled into the one tool", () => call("search_sets", { query: WORD, sql: "delete from sets" })],
  ["search_sets with extra input database", "Connect to anything but dev", () => call("search_sets", { query: WORD, database: "production" })],
  ["search_sets query: '; delete from sets; --", "Delete any row (SQL injection)", () => call("search_sets", { query: "'; delete from sets; --" })],
  ["resources/list", "Reach data outside the menu", () => rpc("resources/list")],
  ["prompts/list", "Reach data outside the menu", () => rpc("prompts/list")],
];
for (const [asked, rule, fn] of attempts) {
  const r = await fn();
  const said = r.error ? `JSON-RPC error ${r.error.code}: ${r.error.message}` : r.result.isError ? r.result.content[0].text : `returned ${JSON.stringify(r.result.structuredContent ?? r.result).slice(0, 80)}`;
  const injection = asked.includes("delete from sets; --");
  const ok = injection ? r.result?.structuredContent?.count === 0 : !!r.error || r.result.isError;
  const verdict = injection ? (ok ? "HARMLESS (matched as text)" : "**RAN SOMETHING**") : ok ? "REFUSED" : "**NOT REFUSED**";
  results.push({ label: asked, ok });
  md.push(`| \`${asked.replace(/\|/g, "\\|")}\` | ${rule} | ${verdict}: ${said.replace(/\|/g, "\\|")} |`);
}
md.push("", "The injection attempt is a search, not a refusal: the text is a bound parameter, matched literally, so it found 0 sets and ran nothing.");

// ---- 3. the floor under the door: the database itself ----
md.push("", "## 4. Even with a write tool, the connection would refuse it", "",
  "Same settings as the server's connection (`default_transaction_read_only=on`, plus `BEGIN READ ONLY`). Each write is a no-op (`where false`), so nothing could change even if it were allowed.", "");
for (const sql of ["delete from sets where false", "update sets set name = name where false", "update copies set id = id where false", "create table catalog_mcp_probe (x int)"]) {
  try {
    await db.query("begin read only");
    await db.query(sql);
    await db.query("rollback");
    results.push({ label: sql, ok: false });
    md.push(`- FAIL: \`${sql}\` was allowed`);
  } catch (e) {
    await db.query("rollback").catch(() => {});
    results.push({ label: sql, ok: true });
    md.push(`- PASS: \`${sql}\` -> refused: "${e.message}"`);
  }
}

// ---- 4. nothing changed ----
const after = await fingerprint();
md.push("", "## 5. Nothing changed", "", "| Table | Before | After |", "|---|---|---|");
for (const t of GUARDED) md.push(`| ${t} | ${before[t]} | ${after[t]} |`);
check("every guarded table identical before and after", JSON.stringify(before) === JSON.stringify(after));

child.stdin.end();
await db.end();

const failed = results.filter((r) => !r.ok);
md.splice(6, 0, `**Result: ${results.length - failed.length} of ${results.length} checks passed.**${failed.length ? " FAILED: " + failed.map((f) => f.label).join("; ") : ""}`, "");
writeFileSync(OUT, md.join("\n") + "\n");
console.log(`${results.length - failed.length}/${results.length} passed. Evidence: ${OUT}`);
if (failed.length) { console.log("FAILED:", failed.map((f) => f.label)); process.exitCode = 1; }

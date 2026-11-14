#!/usr/bin/env node
// Catalog Sets MCP server (stdio). Uses the app's `pg` package from the repo's node_modules.
//
// One ability: search and read catalog set records. The menu has one read-only tool, search_sets.
// Data: the Neon DEV branch only, read-only. It reads just NEON_BRANCH and DATABASE_URL_UNPOOLED
// from ../.env.development.local and refuses to start unless NEON_BRANCH is "dev".
// Read-only is enforced by the database: the session defaults every transaction to read-only,
// and each query also runs inside BEGIN READ ONLY. Any write would fail with
// "cannot execute ... in a read-only transaction".

import { createInterface } from "node:readline";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import pg from "pg";

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

// ---------------------------------------------------------------------------
// The menu (MCP tools/list). This is exactly what an AI assistant will read.
// ---------------------------------------------------------------------------
const TOOLS = [
  {
    name: "search_sets",
    title: "Search catalog sets",
    description:
      "Search the shared card catalog for sets by name or manufacturer, optionally narrowed by year and sport. " +
      "Returns up to 50 matching sets (id, year, sport, manufacturer, name), newest year first. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text to find in the set name or manufacturer, e.g. \"Chrome\" or \"Topps\". Case-insensitive. Max 100 characters." },
        year: { type: "integer", description: "Only sets from this year, e.g. 1989." },
        sport: { type: "string", description: "Only sets for this sport, e.g. \"Baseball\". Case-insensitive." },
        limit: { type: "integer", minimum: 1, maximum: MAX_LIMIT, description: `How many sets to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).` },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

// ---------------------------------------------------------------------------
// Data source: Neon dev branch, read-only.
// Deliberately left out of every answer: sets.created_by (a user id).
// ---------------------------------------------------------------------------
const ENV_FILE = new URL("../.env.development.local", import.meta.url);
const env = parseEnv(readFileSync(ENV_FILE, "utf8"));
if (env.NEON_BRANCH !== "dev") {
  console.error(`[catalog-mcp] Refusing to start: NEON_BRANCH is "${env.NEON_BRANCH ?? ""}", expected "dev".`);
  process.exit(1);
}
if (!env.DATABASE_URL_UNPOOLED) {
  console.error("[catalog-mcp] Refusing to start: DATABASE_URL_UNPOOLED is missing from .env.development.local.");
  process.exit(1);
}

// pg treats sslmode=require as verify-full anyway but warns each time; say it explicitly (same as lib/db.ts).
const dbUrl = new URL(env.DATABASE_URL_UNPOOLED);
if (["require", "prefer", "verify-ca"].includes(dbUrl.searchParams.get("sslmode") ?? "")) dbUrl.searchParams.set("sslmode", "verify-full");

const pool = new pg.Pool({
  connectionString: dbUrl.toString(),
  max: 2,
  idleTimeoutMillis: 30000,
  allowExitOnIdle: true, // when the client closes stdin, exit once queries finish
  statement_timeout: 10000,
  options: "-c default_transaction_read_only=on",
  application_name: "catalog-mcp",
});
pool.on("error", (err) => console.error("[catalog-mcp] idle client error:", err.message));

async function readOnly(sql, params) {
  const client = await pool.connect();
  try {
    await client.query("begin read only");
    const { rows } = await client.query(sql, params);
    await client.query("commit");
    return rows;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

const likeEscape = (text) => text.replace(/[\\%_]/g, "\\$&");

const source = {
  async searchSets({ query, year, sport, limit }) {
    return readOnly(
      `select id, year, sport, manufacturer, name
         from sets
        where ($1::text is null or name ilike $1 or manufacturer ilike $1)
          and ($2::int  is null or year = $2)
          and ($3::text is null or lower(sport) = lower($3))
        order by year desc, manufacturer, name
        limit $4`,
      [query ? `%${likeEscape(query)}%` : null, year ?? null, sport ?? null, limit],
    );
  },
};

// ---------------------------------------------------------------------------
// Tool handler: check inputs, call the source, return JSON text.
// ---------------------------------------------------------------------------
const SEARCH_INPUTS = Object.keys(TOOLS[0].inputSchema.properties);

async function searchSets(args) {
  const extra = Object.keys(args).filter((k) => !SEARCH_INPUTS.includes(k));
  if (extra.length) throw new Error(`search_sets does not accept: ${extra.join(", ")}. Allowed: ${SEARCH_INPUTS.join(", ")}`);
  const { query, year, sport } = args;
  let { limit = DEFAULT_LIMIT } = args;
  if (query !== undefined && (typeof query !== "string" || query.length > 100)) throw new Error("query must be text of at most 100 characters");
  if (year !== undefined && !Number.isInteger(year)) throw new Error("year must be a whole number");
  if (sport !== undefined && typeof sport !== "string") throw new Error("sport must be text");
  if (!Number.isInteger(limit) || limit < 1) throw new Error("limit must be a whole number of at least 1");
  limit = Math.min(limit, MAX_LIMIT);
  const sets = await source.searchSets({ query: query?.trim() || undefined, year, sport: sport?.trim() || undefined, limit });
  return { count: sets.length, sets };
}

const HANDLERS = { search_sets: searchSets };

// --- JSON-RPC over stdio (one message per line). stdout is protocol only; logs go to stderr. ---
const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
const reply = (id, result) => send({ jsonrpc: "2.0", id, result });
const fail = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });

async function handle(msg) {
  const { id, method, params } = msg;
  switch (method) {
    case "initialize":
      return reply(id, {
        protocolVersion: params?.protocolVersion || "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "ducks-catalog-sets", version: "0.1.0" },
      });
    case "ping":
      return reply(id, {});
    case "tools/list":
      return reply(id, { tools: TOOLS });
    case "tools/call": {
      const handler = HANDLERS[params?.name];
      if (!handler) return fail(id, -32602, `Unknown tool: ${params?.name}`);
      try {
        const result = await handler(params.arguments || {});
        return reply(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result });
      } catch (err) {
        return reply(id, { content: [{ type: "text", text: `Error: ${err?.message || err}` }], isError: true });
      }
    }
    default:
      if (id !== undefined && id !== null) return fail(id, -32601, `Method not found: ${method}`);
  }
}

createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return fail(null, -32700, "Parse error"); }
  handle(msg).catch((err) => console.error("[catalog-mcp]", err));
});
console.error("[catalog-mcp] ready (Neon dev branch, read-only)");

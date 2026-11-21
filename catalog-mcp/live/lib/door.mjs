// The live catalog door: MCP over HTTP (stateless, JSON responses), behind two locks.
//
// Lock one: every request must carry "Authorization: Bearer <DOOR_TOKEN>". Anything else gets
//   401 {"error":"unauthorized"} and nothing more: no tool list, no service name, no detail.
// Lock two: the token maps to exactly one account (DOOR_ACCOUNT_ID). The one tool searches only
//   that account's own collection. No input can name another account.
//
// Settings (environment only, never committed):
//   DATABASE_URL     Neon connection string (pooled on Vercel)
//   DOOR_TOKEN       the long random credential callers must present (at least 32 characters)
//   DOOR_ACCOUNT_ID  the profile id the token maps to
//
// Read-only: every query runs in BEGIN READ ONLY, as role app_rw (so row-level security applies),
// with app.user_id set to the door's account, and the SQL also filters owner_id explicitly.
// The explicit filter matters: RLS alone lets anyone read other users' tradeable copies.

import { createHash, timingSafeEqual } from "node:crypto";
import pg from "pg";

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

const TOOLS = [
  {
    name: "search_my_collection",
    title: "Search my card collection",
    description:
      "Search the cards in your own collection (copies you own and haven't sold) by player or card name, set, " +
      "manufacturer or parallel, optionally narrowed by year and sport. Returns up to 50 matching copies, " +
      "newest year first. Read-only. Only your collection is visible.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text to find in the card name, set, manufacturer or parallel, e.g. \"Ohtani\" or \"Refractor\". Case-insensitive. Max 100 characters." },
        year: { type: "integer", description: "Only cards from this year, e.g. 2024." },
        sport: { type: "string", description: "Only cards for this sport, e.g. \"Baseball\". Case-insensitive." },
        limit: { type: "integer", minimum: 1, maximum: MAX_LIMIT, description: `How many copies to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).` },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];
const SEARCH_INPUTS = Object.keys(TOOLS[0].inputSchema.properties);

// ---------------------------------------------------------------------------
// Settings and database
// ---------------------------------------------------------------------------
const log = (...a) => console.error("[door]", ...a);
const sha256 = (s) => createHash("sha256").update(s, "utf8").digest();

const TOKEN = process.env.DOOR_TOKEN ?? "";
const ACCOUNT = process.env.DOOR_ACCOUNT_ID ?? "";
const TOKEN_HASH = TOKEN.length >= 32 ? sha256(TOKEN) : null;
if (!TOKEN_HASH) log("DOOR_TOKEN is missing or shorter than 32 characters; every request will be refused.");
if (!ACCOUNT) log("DOOR_ACCOUNT_ID is missing; every request will be refused.");

function withVerifyFull(connectionString) {
  try {
    const url = new URL(connectionString);
    if (["require", "prefer", "verify-ca"].includes(url.searchParams.get("sslmode") ?? "")) url.searchParams.set("sslmode", "verify-full");
    return url.toString();
  } catch {
    return connectionString; // never let a parse error print the password
  }
}

let pool = null;
export function getPool() {
  if (!pool && process.env.DATABASE_URL) {
    pool = new pg.Pool({
      connectionString: withVerifyFull(process.env.DATABASE_URL),
      max: 3,
      idleTimeoutMillis: 30000,
      allowExitOnIdle: true,
      statement_timeout: 10000,
      options: "-c default_transaction_read_only=on",
      application_name: "catalog-door",
    });
    pool.on("error", (err) => log("idle client error:", err.message));
  }
  return pool;
}

async function asAccount(sql, params) {
  const db = getPool();
  if (!db) throw new Error("DATABASE_URL is not set");
  const client = await db.connect();
  try {
    await client.query("begin read only");
    await client.query("set local role app_rw");
    await client.query("select set_config('app.user_id', $1, true)", [ACCOUNT]);
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

async function searchMyCollection(args) {
  const extra = Object.keys(args).filter((k) => !SEARCH_INPUTS.includes(k));
  if (extra.length) throw new Error(`search_my_collection does not accept: ${extra.join(", ")}. Allowed: ${SEARCH_INPUTS.join(", ")}`);
  const { query, year, sport } = args;
  let { limit = DEFAULT_LIMIT } = args;
  if (query !== undefined && (typeof query !== "string" || query.length > 100)) throw new Error("query must be text of at most 100 characters");
  if (year !== undefined && !Number.isInteger(year)) throw new Error("year must be a whole number");
  if (sport !== undefined && typeof sport !== "string") throw new Error("sport must be text");
  if (!Number.isInteger(limit) || limit < 1) throw new Error("limit must be a whole number of at least 1");
  limit = Math.min(limit, MAX_LIMIT);
  const q = query?.trim();
  const s = sport?.trim();
  // The account comes from the server's settings, never from the request.
  const copies = await asAccount(
    `select year, sport, manufacturer, set_name, card_number, card_name, parallel,
            is_autograph, is_relic, serial_number, print_run, grading_company_id as grader, grade, is_tradeable
       from inventory_report
      where owner_id = $1
        and ($2::text is null or card_name ilike $2 or set_name ilike $2 or manufacturer ilike $2 or parallel ilike $2)
        and ($3::int  is null or year = $3)
        and ($4::text is null or lower(sport) = lower($4))
      order by year desc, set_name, card_number, parallel
      limit $5`,
    [ACCOUNT, q ? `%${likeEscape(q)}%` : null, year ?? null, s || null, limit],
  );
  return { count: copies.length, copies };
}

const HANDLERS = { search_my_collection: searchMyCollection };

// ---------------------------------------------------------------------------
// MCP JSON-RPC
// ---------------------------------------------------------------------------
const ok = (id, result) => ({ jsonrpc: "2.0", id, result });
const err = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });

async function handleMessage(msg) {
  const { id, method, params } = msg ?? {};
  const isNotification = id === undefined || id === null;
  switch (method) {
    case "initialize":
      return ok(id, {
        protocolVersion: params?.protocolVersion || "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "catalog-door", version: "1.0.0" },
      });
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: TOOLS });
    case "tools/call": {
      const handler = HANDLERS[params?.name];
      if (!handler) return err(id, -32602, `Unknown tool: ${params?.name}`);
      try {
        const result = await handler(params.arguments || {});
        return ok(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result });
      } catch (e) {
        // Input mistakes are safe to explain; database errors are logged, not returned.
        const safe = e?.message && !e.code ? e.message : "The search failed.";
        if (e?.code) log("query error:", e.code, e.message);
        return ok(id, { content: [{ type: "text", text: `Error: ${safe}` }], isError: true });
      }
    }
    default:
      return isNotification ? null : err(id, -32601, `Method not found: ${method}`);
  }
}

// ---------------------------------------------------------------------------
// HTTP: lock one first, then the protocol.
// ---------------------------------------------------------------------------
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

function authorized(request) {
  if (!TOKEN_HASH || !ACCOUNT) return false;
  const header = request.headers.get("authorization") ?? "";
  const m = /^Bearer (.+)$/.exec(header);
  if (!m) return false;
  return timingSafeEqual(sha256(m[1]), TOKEN_HASH);
}

export async function handleRequest(request) {
  if (!authorized(request)) return json(401, { error: "unauthorized" });

  if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });

  let msg;
  try {
    msg = await request.json();
  } catch {
    return json(400, err(null, -32700, "Parse error"));
  }
  if (Array.isArray(msg)) return json(400, err(null, -32600, "Batch requests are not supported"));

  const reply = await handleMessage(msg);
  if (reply === null) return new Response(null, { status: 202 });
  return json(200, reply);
}

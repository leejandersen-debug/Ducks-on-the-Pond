#!/usr/bin/env node
// Ducks on the Pond MCP server (stdio, no dependencies).
// Lets Claude Desktop search the Ducks on the Pond documents and check the site's health
// by calling the app's own HTTP endpoints. It holds no database credentials or API keys.
//
// DUCKS_BASE_URL picks which copy of the app to talk to:
//   https://ducks-on-the-pond-psi.vercel.app  (default, the live site)
//   http://localhost:3005                      (local `npm run dev`)

import { createInterface } from "node:readline";

const BASE_URL = (process.env.DUCKS_BASE_URL || "https://ducks-on-the-pond-psi.vercel.app").replace(/\/+$/, "");
const MIN_SIMILARITY = 0.33; // same floor the /search page uses (lib/search.ts)
const MAX_QUERY_CHARS = 500; // same limit as POST /api/search
const TIMEOUT_MS = 30000;    // the live site can take a few seconds on a cold start

const TOOLS = [
  {
    name: "search_ducks_docs",
    description:
      "Search the Ducks on the Pond documents (user's guide, FAQ, pricing guide, policies, glossary, " +
      "collector handbook, release notes, and so on) and return the 3 closest passages with their source " +
      "and similarity score. Passages below 0.33 similarity are flagged as probably not answering the question.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "The question or search text (max 500 characters)." } },
      required: ["query"],
    },
  },
  {
    name: "check_ducks_health",
    description: "Check whether the Ducks on the Pond site is up and its database is reachable (GET /api/health).",
    inputSchema: { type: "object", properties: {} },
  },
];

async function http(path, init = {}) {
  const res = await fetch(BASE_URL + path, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = null; }
  return { status: res.status, body, text };
}

async function searchDocs({ query }) {
  if (typeof query !== "string" || !query.trim()) throw new Error("query must be a non-empty string");
  query = query.trim();
  if (query.length > MAX_QUERY_CHARS) throw new Error(`query must be at most ${MAX_QUERY_CHARS} characters`);

  const { status, body, text } = await http("/api/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (status !== 200 || !body || !Array.isArray(body.results)) {
    throw new Error(`Search returned HTTP ${status}: ${body?.error ?? text.slice(0, 200)}`);
  }
  if (body.results.length === 0) return `No passages found for "${query}".`;

  const top = body.results[0].similarity;
  const lines = [
    top < MIN_SIMILARITY
      ? `Not in the documents: the best match scored ${top}, below the ${MIN_SIMILARITY} floor. Treat these passages as unrelated.`
      : `Top ${body.results.length} passages for "${query}" (from ${BASE_URL}):`,
  ];
  body.results.forEach((r, i) => {
    lines.push("", `${i + 1}. ${r.source}${r.section ? ` > ${r.section}` : ""} (similarity ${r.similarity})`, r.text);
  });
  return lines.join("\n");
}

async function checkHealth() {
  const { status, body, text } = await http("/api/health");
  return `GET ${BASE_URL}/api/health -> HTTP ${status}\n${body ? JSON.stringify(body) : text.slice(0, 200)}`;
}

const HANDLERS = { search_ducks_docs: searchDocs, check_ducks_health: checkHealth };

// --- JSON-RPC over stdio (one message per line). stdout is protocol only; logs go to stderr. ---
const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
const reply = (id, result) => send({ jsonrpc: "2.0", id, result });
const fail = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });

async function handle(msg) {
  const { id, method, params } = msg;
  const isRequest = id !== undefined && id !== null;
  switch (method) {
    case "initialize":
      return reply(id, {
        protocolVersion: params?.protocolVersion || "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "ducks-on-the-pond", version: "1.0.0" },
      });
    case "ping":
      return reply(id, {});
    case "tools/list":
      return reply(id, { tools: TOOLS });
    case "tools/call": {
      const handler = HANDLERS[params?.name];
      if (!handler) return fail(id, -32602, `Unknown tool: ${params?.name}`);
      try {
        const text = await handler(params.arguments || {});
        return reply(id, { content: [{ type: "text", text }] });
      } catch (err) {
        const reason = err?.name === "TimeoutError" ? `no answer from ${BASE_URL} within ${TIMEOUT_MS / 1000}s` : [err?.message || String(err), err?.cause?.code || err?.cause?.message].filter(Boolean).join(": ");
        return reply(id, { content: [{ type: "text", text: `Error: ${reason}` }], isError: true });
      }
    }
    default:
      if (isRequest) return fail(id, -32601, `Method not found: ${method}`);
      // notifications (e.g. notifications/initialized) need no answer
  }
}

createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return fail(null, -32700, "Parse error"); }
  handle(msg).catch((err) => console.error("[ducks-mcp]", err));
});
console.error(`[ducks-mcp] ready, talking to ${BASE_URL}`);

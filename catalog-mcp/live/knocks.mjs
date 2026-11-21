// The four knocks: node --env-file=<file with DOOR_TOKEN> catalog-mcp/live/knocks.mjs <door url>
// Prints each request's status and full body. Never prints the token.
const url = process.argv[2];
const token = process.env.DOOR_TOKEN;
if (!url || !token) { console.error("usage: DOOR_TOKEN=... node knocks.mjs <url>"); process.exit(2); }

const rpc = (method, params) => JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
const call = (name, args) => rpc("tools/call", { name, arguments: args });

const mine = `Bearer ${token}`;
async function knock(label, { auth, body }) {
  const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };
  if (auth) headers.authorization = auth;
  const shownAuth = auth === undefined ? "(none)" : auth === mine ? "Bearer <door token>" : auth;
  console.log(`\n=== ${label}\nREQUEST  POST ${url}\n  Authorization: ${shownAuth}\n  ${body}`);
  const res = await fetch(url, { method: "POST", headers, body });
  const text = await res.text();
  const shown = ["content-type", "www-authenticate", "server", "x-powered-by"].map((h) => res.headers.get(h) && `${h}: ${res.headers.get(h)}`).filter(Boolean);
  console.log(`RESPONSE HTTP ${res.status}  ${shown.join("  |  ")}\n${text}`);
}

await knock("Knock 1: my token, my collection (query \"Ohtani\")", { auth: mine, body: call("search_my_collection", { query: "Ohtani" }) });
await knock("Knock 2a: stranger, nothing attached, asks for the menu", { body: rpc("tools/list") });
await knock("Knock 2b: stranger, nothing attached, calls the search", { body: call("search_my_collection", { query: "Ohtani" }) });
await knock("Knock 2c: stranger, a made-up token", { auth: "Bearer not-the-token-0000000000000000000000000000", body: rpc("tools/list") });
await knock("Knock 3: my token, Bob's card by exact name (\"Elly De La Cruz\")", { auth: mine, body: call("search_my_collection", { query: "Elly De La Cruz" }) });
await knock("Knock 3b: my token, trying to point at Bob with an extra input", { auth: mine, body: call("search_my_collection", { query: "Elly De La Cruz", owner_id: "bob" }) });
await knock("Knock 4a: my token, the menu (what abilities exist?)", { auth: mine, body: rpc("tools/list") });
await knock("Knock 4b: my token, asks to delete a record", { auth: mine, body: call("delete_copy", { card_name: "Aaron Judge" }) });

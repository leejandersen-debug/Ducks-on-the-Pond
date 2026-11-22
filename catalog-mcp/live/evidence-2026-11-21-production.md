# Live catalog door on production data: four knocks

Ducks on the Pond Cards · 2026-11-21 · Live address: **https://catalog-door.vercel.app/mcp**
Closes fix-list row 6. It replaces the dev-branch run in `evidence-2026-11-20.md`. The door's code is unchanged; only its settings moved.
Deployment: `dpl_BtNJvx3HYivMrasqUdPRNeYHNwYn` (project `catalog-door`). The one before it, kept for rollback, is `catalog-door-31gkpavbx`.
Data: the Neon **production** branch, the same database as https://ducks-on-the-pond-psi.vercel.app, read-only.
- The token maps to **Garvkong**, the owner's admin account, which owns one copy: 2026 Topps Chrome #1 Shohei Ohtani.
- Knock 3 targets **BillyBob**, a second account that owns 2026 Topps Chrome #2 Elly De La Cruz.
- Both copies were added through the live app's own My collection page (no direct database writes), at 22:43 and 22:44 UTC.

Re-run: `DOOR_TOKEN=… node catalog-mcp/live/knocks.mjs https://catalog-door.vercel.app/mcp`

## Settings changed (Vercel environment, Production, Sensitive; none in the repo)
- `DATABASE_URL`: the Neon dev branch became the **production** branch (pooled endpoint `ep-quiet-band-b781jgha-pooler`).
- `DOOR_ACCOUNT_ID`: `alice` became Garvkong's profile id.
- `DOOR_TOKEN`: unchanged, so the Claude Code connection keeps working.

## Why knock 3 is a harder test on production
Garvkong is an admin, and row-level security lets admins read every account's copies. A read-only check on production, as the door's database role with Garvkong as the user:
- RLS alone: **2** copies visible (Garvkong's Ohtani and BillyBob's Elly De La Cruz).
- With the door's explicit owner filter (`catalog-mcp/live/lib/door.mjs` line 129, `where owner_id = $1` bound to the server's account): **1**.

So knock 3 coming back empty is the door's own lock two at work. The database's RLS alone would have let it through.

## The knocks (request, status, body), run 2026-11-21 at 22:47 UTC
```

=== Knock 1: my token, my collection (query "Ohtani")
REQUEST  POST https://catalog-door.vercel.app/mcp
  Authorization: Bearer <door token>
  {"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_my_collection","arguments":{"query":"Ohtani"}}}
RESPONSE HTTP 200  content-type: application/json  |  server: Vercel
{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"{\n  \"count\": 1,\n  \"copies\": [\n    {\n      \"year\": 2026,\n      \"sport\": \"Baseball\",\n      \"manufacturer\": \"Topps\",\n      \"set_name\": \"Chrome\",\n      \"card_number\": \"1\",\n      \"card_name\": \"Shohei Ohtani\",\n      \"parallel\": \"Base\",\n      \"is_autograph\": false,\n      \"is_relic\": false,\n      \"serial_number\": null,\n      \"print_run\": null,\n      \"grader\": null,\n      \"grade\": null,\n      \"is_tradeable\": false\n    }\n  ]\n}"}],"structuredContent":{"count":1,"copies":[{"year":2026,"sport":"Baseball","manufacturer":"Topps","set_name":"Chrome","card_number":"1","card_name":"Shohei Ohtani","parallel":"Base","is_autograph":false,"is_relic":false,"serial_number":null,"print_run":null,"grader":null,"grade":null,"is_tradeable":false}]}}}

=== Knock 2a: stranger, nothing attached, asks for the menu
REQUEST  POST https://catalog-door.vercel.app/mcp
  Authorization: (none)
  {"jsonrpc":"2.0","id":1,"method":"tools/list"}
RESPONSE HTTP 401  content-type: application/json  |  server: Vercel
{"error":"unauthorized"}

=== Knock 2b: stranger, nothing attached, calls the search
REQUEST  POST https://catalog-door.vercel.app/mcp
  Authorization: (none)
  {"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_my_collection","arguments":{"query":"Ohtani"}}}
RESPONSE HTTP 401  content-type: application/json  |  server: Vercel
{"error":"unauthorized"}

=== Knock 2c: stranger, a made-up token
REQUEST  POST https://catalog-door.vercel.app/mcp
  Authorization: Bearer not-the-token-0000000000000000000000000000
  {"jsonrpc":"2.0","id":1,"method":"tools/list"}
RESPONSE HTTP 401  content-type: application/json  |  server: Vercel
{"error":"unauthorized"}

=== Knock 3: my token, Bob's card by exact name ("Elly De La Cruz")
REQUEST  POST https://catalog-door.vercel.app/mcp
  Authorization: Bearer <door token>
  {"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_my_collection","arguments":{"query":"Elly De La Cruz"}}}
RESPONSE HTTP 200  content-type: application/json  |  server: Vercel
{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"{\n  \"count\": 0,\n  \"copies\": []\n}"}],"structuredContent":{"count":0,"copies":[]}}}

=== Knock 3b: my token, trying to point at Bob with an extra input
REQUEST  POST https://catalog-door.vercel.app/mcp
  Authorization: Bearer <door token>
  {"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_my_collection","arguments":{"query":"Elly De La Cruz","owner_id":"bob"}}}
RESPONSE HTTP 200  content-type: application/json  |  server: Vercel
{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"Error: search_my_collection does not accept: owner_id. Allowed: query, year, sport, limit"}],"isError":true}}

=== Knock 4a: my token, the menu (what abilities exist?)
REQUEST  POST https://catalog-door.vercel.app/mcp
  Authorization: Bearer <door token>
  {"jsonrpc":"2.0","id":1,"method":"tools/list"}
RESPONSE HTTP 200  content-type: application/json  |  server: Vercel
{"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"search_my_collection","title":"Search my card collection","description":"Search the cards in your own collection (copies you own and haven't sold) by player or card name, set, manufacturer or parallel, optionally narrowed by year and sport. Returns up to 50 matching copies, newest year first. Read-only. Only your collection is visible.","inputSchema":{"type":"object","properties":{"query":{"type":"string","description":"Text to find in the card name, set, manufacturer or parallel, e.g. \"Ohtani\" or \"Refractor\". Case-insensitive. Max 100 characters."},"year":{"type":"integer","description":"Only cards from this year, e.g. 2024."},"sport":{"type":"string","description":"Only cards for this sport, e.g. \"Baseball\". Case-insensitive."},"limit":{"type":"integer","minimum":1,"maximum":50,"description":"How many copies to return (default 20, max 50)."}},"additionalProperties":false},"annotations":{"readOnlyHint":true,"destructiveHint":false,"idempotentHint":true,"openWorldHint":false}}]}}

=== Knock 4b: my token, asks to delete a record
REQUEST  POST https://catalog-door.vercel.app/mcp
  Authorization: Bearer <door token>
  {"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"delete_copy","arguments":{"card_name":"Aaron Judge"}}}
RESPONSE HTTP 200  content-type: application/json  |  server: Vercel
{"jsonrpc":"2.0","id":1,"error":{"code":-32602,"message":"Unknown tool: delete_copy"}}
```

## Results
- Knock 1: 200, Garvkong's Ohtani only (count 1).
- Knocks 2a–2c: 401 `{"error":"unauthorized"}` for no token and a made-up token, whether asking for the menu or calling the search.
- Knock 3: 200, count 0, although the card exists in production and the admin's RLS view can see it. Knock 3b: an extra `owner_id` input is rejected.
- Knock 4: the menu lists one read-only ability, and `delete_copy` is an unknown tool.

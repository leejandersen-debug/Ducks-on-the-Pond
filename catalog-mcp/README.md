# Catalog Sets MCP server

Gives an AI assistant one ability: search and read the catalog's set records. Its menu has one read-only tool, `search_sets`, which returns each matching set's id, year, sport, manufacturer and name. `sets.created_by` is never returned.

## Data: Neon dev branch, read-only
- Reads only `NEON_BRANCH` and `DATABASE_URL_UNPOOLED` from `../.env.development.local`, and refuses to start unless `NEON_BRANCH=dev`.
- The connection sets `default_transaction_read_only=on`, and every query also runs in `BEGIN READ ONLY`. The database itself refuses writes ("cannot execute UPDATE in a read-only transaction").
- The only SQL it runs is one fixed, parameterised `select` on `sets`.
- It uses the app's `pg` package from the repo's `node_modules`, so it has to stay inside this repo.

Try it:

    printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_sets","arguments":{"query":"topps"}}}' | node catalog-mcp/catalog-mcp.mjs

Registered in Claude Desktop as `ducks-catalog-sets` (command `/usr/local/bin/node`, no env block: the server reads `.env.development.local` itself).

## Proof
`node catalog-mcp/prove.mjs [word]` starts the server the way Claude Desktop does, searches for the word (default `Topps`), and checks the result against a separate read-only query. It then asks the server for everything the NEVER list in `Rules.md` forbids and fingerprints the guarded tables before and after. It writes `catalog-mcp/evidence-<date>.md` and changes nothing in the database.

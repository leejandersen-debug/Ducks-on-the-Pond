# Live catalog door

`catalog-mcp.mjs` (one folder up) is Tuesday's local stdio door. This folder is the deployed version: MCP over HTTP on Vercel, project `catalog-door`, at https://catalog-door.vercel.app/mcp.

- `lib/door.mjs`: the token check first (lock one), then one read-only tool, `search_my_collection`, scoped to the account the token maps to (lock two).
- `api/mcp.mjs` and `vercel.json`: Vercel routes every path to the function.
- `dev.mjs`: local run. `knocks.mjs`: the four knocks against any URL.
- Settings live only in Vercel's environment: `DATABASE_URL`, `DOOR_TOKEN`, `DOOR_ACCOUNT_ID`.
- Evidence: `evidence-2026-11-20.md`.

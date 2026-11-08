# Ducks on the Pond MCP server

Lets Claude Desktop use the Ducks on the Pond app. It calls the app's own HTTP endpoints and holds no database credentials or API keys.

## Tools

- **search_ducks_docs**: searches the Ducks documents through `POST /api/search` and returns the top 3 passages. If the best match is under 0.33 similarity, it says "Not in the documents", the same rule the /search page uses.
- **check_ducks_health**: calls `GET /api/health` to check that the site and its database are up.

## Setup (one time)

In Terminal on your Mac:

    node "/Users/landersen/Claude/Code/Working Folder/Week 8/mcp-server/add-to-claude-config.mjs"

The script backs up `claude_desktop_config.json`, adds the `ducks-on-the-pond` server alongside your existing servers, and fills in the full path to node. Then quit Claude (Cmd+Q) and reopen it.

## Pointing at your local dev server

To use `npm run dev` on port 3005 instead of the live site, change `DUCKS_BASE_URL` in the config to `http://localhost:3005` and restart Claude.

## Files

- `ducks-mcp.mjs`: the server (Node 18+, no npm install needed)
- `add-to-claude-config.mjs`: adds it to Claude Desktop's config

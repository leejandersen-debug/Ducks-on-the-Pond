// Local run of the live door: node --env-file=<file> catalog-mcp/live/dev.mjs
// Listens on PORT (default 8787) and hands every request to the same handler Vercel uses.
import { createServer } from "node:http";
import { handleRequest } from "./lib/door.mjs";

const port = Number(process.env.PORT) || 8787;
createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const request = new Request(`http://localhost:${port}${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : body,
  });
  const response = await handleRequest(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(port, () => console.error(`[door] listening on http://localhost:${port}/mcp`));

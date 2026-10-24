// Local dev entry only. On Vercel, app.ts is the entrypoint and Vercel runs the server.
import app from "./app.js";

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`api listening on http://localhost:${port}`));

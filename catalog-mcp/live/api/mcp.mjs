// Vercel function. vercel.json routes every path here, so nothing on this host answers
// without the token.
import { attachDatabasePool } from "@vercel/functions";
import { handleRequest, getPool } from "../lib/door.mjs";

const pool = getPool();
if (pool) attachDatabasePool(pool);

export default { fetch: handleRequest };

// Refuses to continue unless the loaded env points at the Neon production branch.
// Used by the production catalog cleanup (npm run cleanup:prod). Two checks: the env file says
// production, and the connection really goes to the production endpoint (not dev with a wrong label).
const PROD_ENDPOINT = "ep-quiet-band-b781jgha";
const branch = process.env.NEON_BRANCH ?? "";
let host = "";
try { host = new URL(process.env.DATABASE_URL_UNPOOLED ?? "").hostname; } catch {}
if (branch !== "production" || !host.startsWith(`${PROD_ENDPOINT}.`)) {
  console.error(`Refusing to run: expected NEON_BRANCH "production" on endpoint ${PROD_ENDPOINT}, got "${branch}" on "${host.split(".")[0]}".`);
  // Also one log line on stdout, so a refused run leaves a line in the chore-run log instead of nothing.
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: "error", event: "catalog.guard_refused",
    details: { expected: `production on ${PROD_ENDPOINT}`, got: `${branch || "(unset)"} on ${host.split(".")[0] || "(no host)"}` } }));
  process.exit(1);
}

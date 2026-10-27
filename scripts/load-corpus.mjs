// Loads embedded chunks (from scripts/embed-chunks.mjs) into the doc_chunks table.
//
//   npm run load-corpus:dev                                   # every chunks/*.embeddings.json
//   npm run load-corpus:dev -- chunks/product-faq.embeddings.json
//
// Uses the vectors already computed, so nothing is re-embedded. Upserts by chunk id, and removes
// rows for a source that the new file no longer has (e.g. after re-chunking into fewer pieces),
// so loading again never duplicates. Each file loads in one transaction.
import { readFileSync, readdirSync } from "node:fs";
import pg from "pg";

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync("chunks").filter((f) => f.endsWith(".embeddings.json")).sort().map((f) => `chunks/${f}`);

const url = new URL(process.env.DATABASE_URL);
url.searchParams.set("sslmode", "verify-full");
const client = new pg.Client({ connectionString: url.toString() });
await client.connect();

try {
  for (const file of files) {
    const chunks = JSON.parse(readFileSync(file, "utf8"));
    const source = chunks[0].source;
    await client.query("begin");
    for (const c of chunks) {
      await client.query(
        `insert into doc_chunks (id, source, section, sections, position, content, words, tokens, embedding)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9::vector)
         on conflict (id) do update set source = excluded.source, section = excluded.section,
           sections = excluded.sections, position = excluded.position, content = excluded.content,
           words = excluded.words, tokens = excluded.tokens, embedding = excluded.embedding, loaded_at = now()`,
        [c.id, c.source, c.section, c.sections ?? [], c.index, c.text, c.words, c.tokens, JSON.stringify(c.embedding)],
      );
    }
    const removed = await client.query("delete from doc_chunks where source = $1 and not (id = any($2))", [source, chunks.map((c) => c.id)]);
    await client.query("commit");
    console.log(`${source}: loaded ${chunks.length}${removed.rowCount ? `, removed ${removed.rowCount} stale` : ""}`);
  }

  const { rows } = await client.query("select source, count(*)::int as chunks from doc_chunks group by source order by source");
  const total = rows.reduce((n, r) => n + r.chunks, 0);
  console.log(`doc_chunks: ${total} rows (${rows.map((r) => `${r.source} ${r.chunks}`).join(", ")})`);
} catch (err) {
  await client.query("rollback").catch(() => {});
  console.error(`Load failed: ${err.code ?? err.message}`); // code only: driver messages can name the host
  process.exitCode = 1;
} finally {
  await client.end();
}

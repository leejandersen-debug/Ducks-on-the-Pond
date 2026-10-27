// Stores embedded chunks (from scripts/embed-chunks.mjs) in the local Chroma store.
//
//   npm run chroma                                   # the server must be running
//   node scripts/store-chunks.mjs chunks/returns-shipping-policy.embeddings.json
//
// Uses the vectors already computed, so nothing is re-embedded. The collection is created with
// the same model as its embedding function, so text queries land in the same meaning-space.
// Upsert by chunk id: running it again replaces those chunks instead of duplicating them.
import { readFileSync } from "node:fs";
import { ChromaClient } from "chromadb";
import { DefaultEmbeddingFunction } from "@chroma-core/default-embed";

const COLLECTION = "trailhead";
const MODEL = "Xenova/all-MiniLM-L6-v2";

const input = process.argv[2];
if (!input) {
  console.error("Usage: node scripts/store-chunks.mjs <chunks.embeddings.json>");
  process.exit(1);
}
const chunks = JSON.parse(readFileSync(input, "utf8"));

const chroma = new ChromaClient({
  host: process.env.CHROMA_HOST ?? "localhost",
  port: Number(process.env.CHROMA_PORT ?? 8000),
});
const collection = await chroma.getOrCreateCollection({
  name: COLLECTION,
  embeddingFunction: new DefaultEmbeddingFunction({ modelName: MODEL }),
  configuration: { hnsw: { space: "cosine" } },
});

await collection.upsert({
  ids: chunks.map((c) => c.id),
  embeddings: chunks.map((c) => c.embedding),
  documents: chunks.map((c) => c.text),
  metadatas: chunks.map((c) => ({
    source: c.source, section: c.section ?? "", sections: (c.sections ?? []).join(" | "), index: c.index,
    words: c.words, overlap_words: c.overlapWords, tokens: c.tokens,
  })),
});

// Read everything back and compare with what was sent.
const stored = await collection.get({ ids: chunks.map((c) => c.id), include: ["documents", "embeddings", "metadatas"] });
const byId = new Map(stored.ids.map((id, i) => [id, i]));
const problems = [];
for (const c of chunks) {
  const i = byId.get(c.id);
  if (i === undefined) { problems.push(`${c.id}: missing`); continue; }
  if (stored.documents[i] !== c.text) problems.push(`${c.id}: text differs`);
  const v = stored.embeddings[i];
  if (v.length !== c.embedding.length || v.some((x, j) => Math.abs(x - c.embedding[j]) > 1e-6)) problems.push(`${c.id}: vector differs`);
  if (stored.metadatas[i]?.source !== c.source) problems.push(`${c.id}: metadata differs`);
}
const fromSource = (await collection.get({ where: { source: chunks[0].source }, include: [] })).ids.length;
console.log(`collection "${COLLECTION}": sent ${chunks.length}, read back ${stored.ids.length}, from ${chunks[0].source}: ${fromSource}, total in collection: ${await collection.count()}`);
for (const p of problems) console.log(`  PROBLEM ${p}`);
console.log(problems.length ? "SOME CHUNKS DID NOT ROUND-TRIP" : "every chunk's text, vector and metadata round-tripped exactly");
process.exitCode = problems.length ? 1 : 0;

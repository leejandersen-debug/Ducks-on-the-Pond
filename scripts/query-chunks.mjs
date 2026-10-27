// Asks the local Chroma store a plain-English question and prints the closest chunks.
//
//   npm run chroma                                          # the server must be running
//   node scripts/query-chunks.mjs "How much does shipping to Hawaii cost?"
//   node scripts/query-chunks.mjs -n 5 "Can I return worn boots?"
//   node scripts/query-chunks.mjs                           # no question: interactive prompt
//
// The question is embedded with the collection's own model (all-MiniLM-L6-v2), so it lands in
// the same meaning-space as the stored chunks. Similarity is cosine similarity (1 - Chroma's
// cosine distance): 1 means identical meaning, and higher is closer.
import { createInterface } from "node:readline/promises";
import { ChromaClient } from "chromadb";
import { DefaultEmbeddingFunction } from "@chroma-core/default-embed";

const COLLECTION = "trailhead";
const MODEL = "Xenova/all-MiniLM-L6-v2";
const PREVIEW_WORDS = 60;

const args = process.argv.slice(2);
let results = 3;
const n = args.indexOf("-n");
if (n !== -1) {
  results = Number(args[n + 1]);
  args.splice(n, 2);
  if (!Number.isInteger(results) || results < 1) {
    console.error("Usage: node scripts/query-chunks.mjs [-n results] [question]");
    process.exit(1);
  }
}

const chroma = new ChromaClient({
  host: process.env.CHROMA_HOST ?? "localhost",
  port: Number(process.env.CHROMA_PORT ?? 8000),
});
const collection = await chroma.getCollection({
  name: COLLECTION,
  embeddingFunction: new DefaultEmbeddingFunction({ modelName: MODEL }),
});

async function ask(question) {
  const found = await collection.query({ queryTexts: [question], nResults: results, include: ["documents", "metadatas", "distances"] });
  console.log(`\n"${question}"  (${await collection.count()} chunks in "${COLLECTION}")`);
  found.ids[0].forEach((id, i) => {
    const meta = found.metadatas[0][i];
    const text = found.documents[0][i].replace(/\s+/g, " ").split(" ");
    const preview = text.slice(0, PREVIEW_WORDS).join(" ") + (text.length > PREVIEW_WORDS ? " …" : "");
    const distance = found.distances[0][i];
    console.log(`\n${i + 1}. ${id}  similarity ${(1 - distance).toFixed(3)}  (distance ${distance.toFixed(3)})`);
    const also = (meta.sections ?? "").split(" | ").filter((s) => s && s !== meta.section);
    console.log(`   ${meta.source} · ${meta.section || "(no section)"}${also.length ? `  (also: ${also.join("; ")})` : ""}`);
    console.log(`   ${preview}`);
  });
  console.log();
}

if (args.length) {
  await ask(args.join(" "));
} else {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log(`Ask the "${COLLECTION}" collection a question (blank line or Ctrl+D to quit).`);
  for (;;) {
    const question = (await rl.question("> ").catch(() => "")).trim();
    if (!question) break;
    await ask(question);
  }
  rl.close();
}

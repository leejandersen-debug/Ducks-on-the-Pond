// Embeds every chunk in a chunks/*.json file with Chroma's default local model
// (all-MiniLM-L6-v2, 384 dimensions) and checks that none failed or came back unusable.
//
//   node scripts/embed-chunks.mjs chunks/returns-shipping-policy.json
//
// Writes chunks/<name>.embeddings.json (the chunks plus their vectors) and exits non-zero if any
// chunk errored, was skipped, or produced a bad vector. Also reports each chunk's token count:
// the tokenizer cuts input at its max length, and anything past that never reaches the model.
import { readFileSync, writeFileSync } from "node:fs";
import { DefaultEmbeddingFunction } from "@chroma-core/default-embed";
import { AutoTokenizer } from "@huggingface/transformers";

const MODEL = "Xenova/all-MiniLM-L6-v2";
const DIMENSIONS = 384;
const TRAINED_TOKENS = 256; // sentence-transformers' max_seq_length for this model

const input = process.argv[2];
if (!input) {
  console.error("Usage: node scripts/embed-chunks.mjs <chunks.json>");
  process.exit(1);
}
const chunks = JSON.parse(readFileSync(input, "utf8"));
const embedder = new DefaultEmbeddingFunction({ modelName: MODEL });
const tokenizer = await AutoTokenizer.from_pretrained(MODEL);
const hardLimit = tokenizer.model_max_length;

const results = [];
const problems = [];
for (const chunk of chunks) {
  const tokens = tokenizer.encode(chunk.text).length;
  try {
    const [vector] = await embedder.generate([chunk.text]);
    const norm = Math.hypot(...(vector ?? []));
    if (!vector) problems.push(`${chunk.id}: no vector returned`);
    else if (vector.length !== DIMENSIONS) problems.push(`${chunk.id}: ${vector.length} dimensions, expected ${DIMENSIONS}`);
    else if (!vector.every(Number.isFinite)) problems.push(`${chunk.id}: vector contains NaN/Infinity`);
    else if (norm === 0) problems.push(`${chunk.id}: all-zero vector`);
    results.push({ ...chunk, tokens, embedding: vector });
    console.log(`${chunk.id}  ok  ${vector?.length} dims  norm ${norm.toFixed(3)}  ${tokens} tokens`);
  } catch (err) {
    problems.push(`${chunk.id}: ${err.message}`);
    console.log(`${chunk.id}  ERROR  ${err.message}`);
  }
}

// Identical vectors for different text would mean something upstream is broken.
const seen = new Map();
for (const r of results) {
  const key = r.embedding.slice(0, 8).join(",");
  if (seen.has(key)) problems.push(`${r.id}: same vector as ${seen.get(key)}`);
  seen.set(key, r.id);
}

const over = results.filter((r) => r.tokens > TRAINED_TOKENS);
const cut = results.filter((r) => r.tokens > hardLimit);
console.log(`\nattempted ${chunks.length}, embedded ${results.length}, skipped ${chunks.length - results.length}, problems ${problems.length}`);
for (const p of problems) console.log(`  PROBLEM ${p}`);
console.log(`token limit: model trained on up to ${TRAINED_TOKENS}; tokenizer cuts input at ${hardLimit}`);
console.log(`  chunks over ${TRAINED_TOKENS} tokens: ${over.length}/${results.length}; cut off at ${hardLimit}: ${cut.length}/${results.length}`);

const out = input.replace(/\.json$/, ".embeddings.json");
writeFileSync(out, JSON.stringify(results) + "\n");
console.log(`wrote ${out}`);
process.exitCode = problems.length ? 1 : 0;

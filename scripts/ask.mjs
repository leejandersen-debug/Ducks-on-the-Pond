// Answers a question from the course corpus: retrieves the closest chunks from the local Chroma
// store (the same retrieval as query-chunks.mjs), then asks Claude to answer from those chunks only.
//
//   npm run chroma                                   # the vector store must be running
//   npm run ask -- "How long does a serial-number review take?"
//   npm run ask -- --context "Can I undo a sale?"            # also print the context block sent
//   npm run ask -- --log "Who can see what I paid for a card?" # also log the retrieved chunk ids and scores
//
// Answers from the "ducks" collection: the card app's own help documents (the Ducks Corpus).
// The answer step (context format, grounded prompt, Claude call) lives in lib/grounding.ts and is
// shared with the app's POST /api/ask, so the rig and the live site run the same engine.
// Needs ANTHROPIC_API_KEY in .env.development.local (loaded by the npm script). Each question is
// one Claude API call, a cent or two against the prepaid Console credit.
import Anthropic from "@anthropic-ai/sdk";
import { ChromaClient } from "chromadb";
import { DefaultEmbeddingFunction } from "@chroma-core/default-embed";
import { AnswerError, TOP_K, answerFromContext, buildContext } from "../lib/grounding.ts";

const COLLECTION = "ducks";
const EMBED_MODEL = "Xenova/all-MiniLM-L6-v2"; // must match the model the chunks were stored with

const args = process.argv.slice(2);
const showContext = args.includes("--context");
const showLog = args.includes("--log");
const question = args.filter((a) => a !== "--context" && a !== "--log").join(" ").trim();
if (!question) {
  console.error('Usage: npm run ask -- [--context] [--log] "your question"');
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set. Add it to .env.development.local and run via `npm run ask`.");
  process.exit(1);
}

// 1. Retrieve the top chunks.
const chroma = new ChromaClient({
  host: process.env.CHROMA_HOST ?? "localhost",
  port: Number(process.env.CHROMA_PORT ?? 8000),
});
let found;
try {
  const collection = await chroma.getCollection({
    name: COLLECTION,
    embeddingFunction: new DefaultEmbeddingFunction({ modelName: EMBED_MODEL }),
  });
  found = await collection.query({ queryTexts: [question], nResults: TOP_K, include: ["documents", "metadatas", "distances"] });
} catch (err) {
  console.error(`Couldn't query the Chroma store (is \`npm run chroma\` running?): ${err.message}`);
  process.exit(1);
}
const chunks = found.ids[0].map((id, i) => ({
  document: found.metadatas[0][i].source,
  section: found.metadatas[0][i].section || "(no section)",
  text: found.documents[0][i].trim(),
}));
// Similarity is 1 - cosine distance, the same figure query-chunks.mjs prints.
if (showLog) {
  const list = found.ids[0].map((id, i) => `${id} #${i + 1} (${(1 - found.distances[0][i]).toFixed(2)})`);
  console.log(`log: retrieved [${list.join(", ")}]\n`);
}

// 2. The context block keeps each chunk's document name and section label (lib/grounding.ts).
if (showContext) console.log(`--- context sent to Claude ---\n${buildContext(chunks)}\n------------------------------\n`);

// 3. Ask Claude to answer from that context only.
let result;
try {
  result = await answerFromContext(new Anthropic(), question, chunks);
} catch (err) {
  if (err instanceof AnswerError) console.error(err.message);
  else if (err instanceof Anthropic.AuthenticationError) console.error("The Claude API rejected the key (401). Check ANTHROPIC_API_KEY.");
  else if (err instanceof Anthropic.RateLimitError) console.error("Rate limited by the Claude API (429). Wait a moment and retry.");
  else if (err instanceof Anthropic.APIError) console.error(`Claude API error ${err.status}: ${err.message}`);
  else console.error(`Couldn't reach the Claude API: ${err.message}`);
  process.exit(1);
}

// 4. Print the answer, then the source line.
console.log(result.answer);
if (result.refused) {
  console.log("Source: none (the retrieved context doesn't contain the answer)");
} else {
  console.log(`Source: ${result.source.document} · ${result.source.section}`);
  // Guard against a citation that doesn't match any chunk that was actually retrieved.
  if (!result.citationMatchesContext) console.log("(warning: that source doesn't match any retrieved chunk)");
}

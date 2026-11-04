// Answers a question from the course corpus: retrieves the closest chunks from the local Chroma
// store (the same retrieval as query-chunks.mjs), then asks Claude to answer from those chunks only.
//
//   npm run chroma                                   # the vector store must be running
//   npm run ask -- "How much does shipping to Hawaii cost?"
//   npm run ask -- --context "Can I return worn boots?"   # also print the context block sent
//   npm run ask -- --log "What's the employee discount?"  # also log the retrieved chunk ids and scores
//
// Needs ANTHROPIC_API_KEY in .env.development.local (loaded by the npm script). Each question is
// one Claude API call, a cent or two against the prepaid Console credit.
import Anthropic from "@anthropic-ai/sdk";
import { ChromaClient } from "chromadb";
import { DefaultEmbeddingFunction } from "@chroma-core/default-embed";

const COLLECTION = "trailhead";
const EMBED_MODEL = "Xenova/all-MiniLM-L6-v2"; // must match the model the chunks were stored with
const TOP_K = 3;
const CLAUDE_MODEL = "claude-opus-5-5";
const DONT_KNOW = "I don't know";

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

// 2. Format them into a context block that keeps each chunk's document name and section label.
const context = chunks
  .map((c, i) => `<chunk index="${i + 1}">\n<document>${c.document}</document>\n<section>${c.section}</section>\n<content>\n${c.text}\n</content>\n</chunk>`)
  .join("\n\n");
if (showContext) console.log(`--- context sent to Claude ---\n${context}\n------------------------------\n`);

// 3. Ask Claude to answer from that context only.
const system = `You answer questions for Trailhead staff using only the context chunks provided in the user's message.

Rules:
- Use only information stated in the context chunks. Do not use outside knowledge, general knowledge, or assumptions, even if you believe you know the answer.
- If the context does not contain the answer, set "answer" to exactly "${DONT_KNOW}" (no other words or punctuation) and leave "source_document" and "source_section" as empty strings.
- Otherwise, answer the question directly and concisely, and name the source: put the document name and the section label of the chunk the answer comes from in "source_document" and "source_section", copied exactly as they appear in that chunk's <document> and <section> tags.
- If the answer draws on more than one chunk, name the chunk that contains its main fact.`;

const client = new Anthropic();
let response;
try {
  response = await client.beta.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default", // if a safety classifier declines, the API retries on its recommended fallback model
    output_config: {
      effort: "medium",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            answer: { type: "string" },
            source_document: { type: "string" },
            source_section: { type: "string" },
          },
          required: ["answer", "source_document", "source_section"],
          additionalProperties: false,
        },
      },
    },
    system,
    messages: [{ role: "user", content: `<context>\n${context}\n</context>\n\nQuestion: ${question}` }],
  });
} catch (err) {
  if (err instanceof Anthropic.AuthenticationError) console.error("The Claude API rejected the key (401). Check ANTHROPIC_API_KEY.");
  else if (err instanceof Anthropic.RateLimitError) console.error("Rate limited by the Claude API (429). Wait a moment and retry.");
  else if (err instanceof Anthropic.APIError) console.error(`Claude API error ${err.status}: ${err.message}`);
  else console.error(`Couldn't reach the Claude API: ${err.message}`);
  process.exit(1);
}

if (response.stop_reason === "refusal") {
  console.error(`Claude declined to answer (${response.stop_details?.category ?? "no category"}).`);
  process.exit(1);
}
const text = response.content.find((b) => b.type === "text")?.text ?? "";
let result;
try {
  result = JSON.parse(text);
} catch {
  console.error(`Unexpected reply (stop_reason ${response.stop_reason}):\n${text}`);
  process.exit(1);
}

// 4. Print the answer, then the source line.
console.log(result.answer);
if (result.answer.trim() === DONT_KNOW) {
  console.log("Source: none (the retrieved context doesn't contain the answer)");
} else {
  console.log(`Source: ${result.source_document} · ${result.source_section}`);
  // Guard against a citation that doesn't match any chunk that was actually retrieved.
  const cited = chunks.some((c) => c.document === result.source_document && c.section === result.source_section);
  if (!cited) console.log("(warning: that source doesn't match any retrieved chunk)");
}

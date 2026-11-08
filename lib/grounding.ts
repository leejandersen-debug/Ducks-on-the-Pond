// The engine's answer step, shared by the rig (scripts/ask.mjs, run directly by Node 24) and the
// app (app/api/ask/route.ts), so the grounded prompt, the context format and the Claude call are
// one copy, not two that can drift apart. Retrieval stays with each caller: the rig reads the local
// Chroma "ducks" collection, the app reads the Postgres doc_chunks table. Both hold the same 70 Ducks
// Corpus chunks and vectors.
//
// Erasable TypeScript only (no enums or namespaces), so Node can run it without a build step.
import type Anthropic from "@anthropic-ai/sdk";

export const TOP_K = 3;
export const CLAUDE_MODEL = "claude-opus-5-5";
export const DONT_KNOW = "I don't know";
const AUDIENCE = "Ducks on the Pond Cards collectors and support staff";

// One retrieved chunk, with the labels that must survive into the context.
export type ContextChunk = { document: string; section: string; text: string };

export type GroundedAnswer = {
  answer: string;
  refused: boolean;
  source: { document: string; section: string } | null;
  // True when the cited source matches a chunk that was actually retrieved.
  citationMatchesContext: boolean;
};

// Each chunk keeps its document name and section label, so the model can cite them exactly.
export function buildContext(chunks: ContextChunk[]): string {
  return chunks
    .map((c, i) => `<chunk index="${i + 1}">\n<document>${c.document}</document>\n<section>${c.section}</section>\n<content>\n${c.text.trim()}\n</content>\n</chunk>`)
    .join("\n\n");
}

// The three grounding rules: only the context, cite the source exactly, refuse exactly.
export const SYSTEM_PROMPT = `You answer questions for ${AUDIENCE} using only the context chunks provided in the user's message.

Rules:
- Use only information stated in the context chunks. Do not use outside knowledge, general knowledge, or assumptions, even if you believe you know the answer.
- If the context does not contain the answer, set "answer" to exactly "${DONT_KNOW}" (no other words or punctuation) and leave "source_document" and "source_section" as empty strings.
- Otherwise, answer the question directly and concisely, and name the source: put the document name and the section label of the chunk the answer comes from in "source_document" and "source_section", copied exactly as they appear in that chunk's <document> and <section> tags.
- If the answer draws on more than one chunk, name the chunk that contains its main fact.`;

const ANSWER_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string" },
    source_document: { type: "string" },
    source_section: { type: "string" },
  },
  required: ["answer", "source_document", "source_section"],
  additionalProperties: false,
} as const;

// Thrown when Claude declines or replies with something that isn't the expected JSON.
export class AnswerError extends Error {}

export async function answerFromContext(client: Anthropic, question: string, chunks: ContextChunk[]): Promise<GroundedAnswer> {
  const response = await client.beta.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default", // if a safety classifier declines, the API retries on its recommended fallback model
    output_config: { effort: "medium", format: { type: "json_schema", schema: ANSWER_SCHEMA } },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `<context>\n${buildContext(chunks)}\n</context>\n\nQuestion: ${question}` }],
  });

  if (response.stop_reason === "refusal") throw new AnswerError("Claude declined to answer");
  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  let parsed: { answer: string; source_document: string; source_section: string };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AnswerError(`Unexpected reply (stop_reason ${response.stop_reason})`);
  }

  const refused = parsed.answer.trim() === DONT_KNOW;
  const source = refused ? null : { document: parsed.source_document, section: parsed.source_section };
  return {
    answer: refused ? DONT_KNOW : parsed.answer,
    refused,
    source,
    citationMatchesContext: !!source && chunks.some((c) => c.document === source.document && c.section === source.section),
  };
}

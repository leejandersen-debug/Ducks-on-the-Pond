import Anthropic from "@anthropic-ai/sdk";
import { AnswerError, TOP_K, answerFromContext } from "@/lib/grounding";
import { log } from "@/lib/log";
import { MAX_QUERY_CHARS, retrievePassages, searchUnavailable } from "@/lib/search";
import { currentUserId } from "@/lib/session";

// POST /api/ask  {"question": "how long does a serial-number review take?"}
// -> {"question", "answer", "refused", "source": {document, section} | null,
//     "passages": [{ id, document, section, similarity }, ...]}
// The engine from the rig (scripts/ask.mjs), moved unchanged: the top 3 chunks of the Ducks Corpus
// from doc_chunks, then Claude answers from those chunks only (lib/grounding.ts). A refusal
// ("I don't know") is a normal 200 reply with refused: true. Spec: ask-spec.md.

let client: Anthropic | null = null; // one per server instance; reads ANTHROPIC_API_KEY

const fail = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(request: Request) {
  let question: unknown;
  try {
    question = (await request.json())?.question;
  } catch {
    return fail(400, "Body must be JSON: {\"question\": \"...\"}");
  }
  if (typeof question !== "string" || !question.trim()) return fail(400, "question must be a non-empty string");
  question = question.trim();
  const q = question as string;
  if (q.length > MAX_QUERY_CHARS) return fail(400, `question must be at most ${MAX_QUERY_CHARS} characters`);

  if (!process.env.ANTHROPIC_API_KEY) {
    log.error("ask.failed", { stage: "config", code: "no_api_key" });
    return fail(503, "Answers aren't set up in this environment yet.");
  }

  // 1. Retrieve: the top 3 chunks from doc_chunks (the Ducks Corpus), labels kept.
  let passages;
  try {
    passages = await retrievePassages(await currentUserId(), q, TOP_K);
  } catch (err) {
    const code = (err as { code?: string }).code ?? "unknown"; // code only: driver messages can name the host
    log.error("ask.failed", { stage: "retrieve", code });
    return searchUnavailable(err) ? fail(503, "Answers aren't set up in this environment yet.") : fail(500, "Couldn't get an answer right now.");
  }

  // 2–3. Context and answer, from the shared engine.
  let result;
  try {
    client ??= new Anthropic();
    result = await answerFromContext(
      client,
      q,
      passages.map((p) => ({ document: p.source, section: p.section || "(no section)", text: p.text })),
    );
  } catch (err) {
    const code = err instanceof AnswerError ? "bad_reply"
      : err instanceof Anthropic.APIError ? `claude_${err.status ?? "error"}`
      : "unreachable";
    log.error("ask.failed", { stage: "answer", code });
    return fail(502, "Couldn't get an answer right now.");
  }

  // Ids and scores only: never the key, the prompt or the passage text.
  log.info("ask.query", {
    question: q,
    retrieved: passages.map((p) => `${p.id} (${p.similarity})`),
    refused: result.refused,
    source: result.source ? `${result.source.document} · ${result.source.section}` : null,
    citationMatchesContext: result.refused ? null : result.citationMatchesContext,
  });

  return Response.json({
    question: q,
    answer: result.answer,
    refused: result.refused,
    source: result.source,
    passages: passages.map((p) => ({ id: p.id, document: p.source, section: p.section, similarity: p.similarity })),
  });
}

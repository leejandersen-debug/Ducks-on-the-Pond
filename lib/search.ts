import { withUser } from "@/lib/db";
import { embed } from "@/lib/embed";
import { log } from "@/lib/log";

// Semantic search over the course corpus (doc_chunks). Runs inside withUser(), so RLS applies.
// Used by POST /api/search and the /search page, so both search and log the same way.

export const MAX_QUERY_CHARS = 500;

// Below this, the best match isn't really about the question. Set from measured scores: real
// answers came back at 0.39–0.46 and their runners-up at 0.34–0.38; an unanswerable question
// (the break-room coffee) topped out at 0.26.
export const MIN_SIMILARITY = 0.33;

export type Passage = {
  id: string; source: string; section: string | null; similarity: number; text: string;
};

export async function searchCorpus(userId: string | null, query: string, limit = 3): Promise<Passage[]> {
  try {
    const vector = JSON.stringify(await embed(query));
    // <=> is cosine distance; similarity = 1 - distance (1 = same meaning).
    const results: Passage[] = await withUser(userId, async (db) => (await db.query(
      `select id, source, section, 1 - (embedding <=> $1::vector) as similarity, content as text
       from doc_chunks order by embedding <=> $1::vector limit $2`,
      [vector, limit],
    )).rows.map((r) => ({ ...r, similarity: Number(Number(r.similarity).toFixed(4)) })));
    // The logger scrubs emails and card numbers out of the query text. topSimilarity shows
    // whether the best match clears MIN_SIMILARITY, i.e. whether the page had an answer to show.
    log.info("search.query", { query, results: results.length, topSimilarity: results[0]?.similarity ?? null });
    return results;
  } catch (err) {
    // Code only: driver messages can name the database host and role.
    log.error("search.failed", { query, code: (err as { code?: string }).code ?? "unknown" });
    throw err;
  }
}

// 42P01: doc_chunks missing (migration not applied here). 22023: the app_rw role is missing.
export function searchUnavailable(err: unknown) {
  return ["42P01", "22023"].includes((err as { code?: string }).code ?? "");
}

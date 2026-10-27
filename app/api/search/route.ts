import { MAX_QUERY_CHARS, searchCorpus, searchUnavailable } from "@/lib/search";
import { currentUserId } from "@/lib/session";

// POST /api/search  {"query": "can I bring my dog to the office?"}
// -> {"query": "...", "results": [{ id, source, section, similarity, text }, ...]}  (top 3)
// searchCorpus logs the query and result count (search.query) or the failure (search.failed).
export async function POST(request: Request) {
  let query: unknown;
  try {
    query = (await request.json())?.query;
  } catch {
    return Response.json({ error: "Body must be JSON: {\"query\": \"...\"}" }, { status: 400 });
  }
  if (typeof query !== "string" || !query.trim()) {
    return Response.json({ error: "query must be a non-empty string" }, { status: 400 });
  }
  query = query.trim();
  if ((query as string).length > MAX_QUERY_CHARS) {
    return Response.json({ error: `query must be at most ${MAX_QUERY_CHARS} characters` }, { status: 400 });
  }

  try {
    const results = await searchCorpus(await currentUserId(), query as string);
    return Response.json({ query, results });
  } catch (err) {
    const unavailable = searchUnavailable(err);
    return Response.json(
      { error: unavailable ? "Search isn't set up in this environment yet." : "Search failed." },
      { status: unavailable ? 503 : 500 },
    );
  }
}

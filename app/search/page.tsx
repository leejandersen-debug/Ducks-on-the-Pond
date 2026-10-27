import { dbProblem } from "@/lib/db-status";
import { MAX_QUERY_CHARS, MIN_SIMILARITY } from "@/lib/search";
import { SearchBox } from "./search-box";

// Searches the course corpus (the Trailhead documents) by meaning. The search box posts to
// /api/search from the browser; a /search?q=... URL runs that search on load.
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  if (await dbProblem()) return null; // the layout shows the reason
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, MAX_QUERY_CHARS) ?? "";

  return (
    <main>
      <h1>Search</h1>
      <p>Ask a question about the Trailhead Supply Co. documents (handbook, FAQ, operations manual, policies, pricing).</p>
      <SearchBox initialQuery={q} maxChars={MAX_QUERY_CHARS} minSimilarity={MIN_SIMILARITY} />
    </main>
  );
}

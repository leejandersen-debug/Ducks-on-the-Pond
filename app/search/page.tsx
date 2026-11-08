import { dbProblem } from "@/lib/db-status";
import { MAX_QUERY_CHARS, MIN_SIMILARITY } from "@/lib/search";
import { SearchBox } from "./search-box";

// Searches this app's help documents (the Ducks Corpus) by meaning. The search box posts to
// /api/search from the browser; a /search?q=... URL runs that search on load.
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  if (await dbProblem()) return null; // the layout shows the reason
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, MAX_QUERY_CHARS) ?? "";

  return (
    <main>
      <h1>Search</h1>
      <p>Ask a question about Ducks on the Pond Cards: the User&apos;s Guide, FAQ, Collector Handbook, Glossary, policies
        (customer service, privacy, terms of use, serial-number disputes, security) and release notes.</p>
      <SearchBox initialQuery={q} maxChars={MAX_QUERY_CHARS} minSimilarity={MIN_SIMILARITY} />
    </main>
  );
}

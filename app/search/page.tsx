import { dbProblem } from "@/lib/db-status";
import { MAX_QUERY_CHARS } from "@/lib/search";
import { SearchBox } from "./search-box";

// Answers questions from this app's help documents (the Ducks Corpus). The box posts to /api/ask
// from the browser, which retrieves the closest passages and has Claude answer from them only, with
// a source receipt. A /search?q=... URL asks that question on load. Spec: ask-spec.md.
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  if (await dbProblem()) return null; // the layout shows the reason
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, MAX_QUERY_CHARS) ?? "";

  return (
    <main>
      <h1>Search</h1>
      <p>Ask a question about Ducks on the Pond Cards. Answers come only from the User&apos;s Guide, FAQ, Collector Handbook, Glossary, policies
        (customer service, privacy, terms of use, serial-number disputes, security) and release notes.</p>
      <SearchBox initialQuery={q} maxChars={MAX_QUERY_CHARS} />
    </main>
  );
}

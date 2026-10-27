"use client";

import { useEffect, useState } from "react";
import type { Passage } from "@/lib/search";

type Props = { initialQuery: string; maxChars: number; minSimilarity: number };

// Calls POST /api/search from the browser, the same way the mobile app will, and renders the
// passages it returns. The limits come in as props so lib/search.ts (and its db code) stays
// out of the client bundle.
export function SearchBox({ initialQuery, maxChars, minSimilarity }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [asked, setAsked] = useState("");
  const [results, setResults] = useState<Passage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function search(q: string) {
    q = q.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    // Keep the URL shareable: /search?q=...
    window.history.replaceState(null, "", `/search?q=${encodeURIComponent(q)}`);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResults(data.results);
    } catch (err) {
      setResults([]);
      setError((err as Error).message);
    } finally {
      setAsked(q);
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialQuery) search(initialQuery);
    // Only on first load: later searches come from the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const matches = results.filter((r) => r.similarity >= minSimilarity);

  return (
    <>
      <form role="search" onSubmit={(e) => { e.preventDefault(); search(query); }}>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} maxLength={maxChars}
          size={60} placeholder="can I bring my dog to the office?" aria-label="Search the documents" required />{" "}
        <button disabled={loading}>{loading ? "Searching…" : "Search"}</button>
      </form>

      {error && <p role="alert"><strong>Error:</strong> {error}</p>}
      {asked && !loading && !error && matches.length === 0 && (
        <p>Not in the documents: nothing matched closely enough
          {results[0] && ` (best match ${results[0].similarity.toFixed(3)}, below ${minSimilarity})`}.</p>
      )}
      {!loading && matches.map((r, i) => (
        <section key={r.id}>
          <h2>{i + 1}. {r.section ?? r.source}</h2>
          <p><small>{r.source} · {r.id} · similarity {r.similarity.toFixed(3)}</small></p>
          <p style={{ whiteSpace: "pre-line" }}>{r.text}</p>
        </section>
      ))}
    </>
  );
}

"use client";

import { useEffect, useState } from "react";

type Props = { initialQuery: string; maxChars: number };

type Reply = {
  question: string;
  answer: string;
  refused: boolean;
  source: { document: string; section: string } | null;
  passages: { id: string; document: string; section: string | null; similarity: number }[];
};

// Calls POST /api/ask from the browser and renders one of five states (ask-spec.md): idle,
// working, answered (with the source receipt), refused (a designed answer, not an error), error.
export function SearchBox({ initialQuery, maxChars }: Props) {
  const [question, setQuestion] = useState(initialQuery);
  const [reply, setReply] = useState<Reply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function ask(q: string) {
    q = q.trim();
    if (!q) return;
    setWorking(true);
    setError(null);
    setReply(null);
    // Keep the URL shareable: /search?q=...
    window.history.replaceState(null, "", `/search?q=${encodeURIComponent(q)}`);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setReply(data);
    } catch (err) {
      setError((err as Error).message || "Couldn't get an answer right now; try again.");
    } finally {
      setWorking(false);
    }
  }

  useEffect(() => {
    if (initialQuery) ask(initialQuery);
    // Only on first load: later questions come from the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <form role="search" onSubmit={(e) => { e.preventDefault(); ask(question); }}>
        <input type="search" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={maxChars}
          size={60} placeholder="how long does a serial-number review take?" aria-label="Ask a question" required />{" "}
        <button disabled={working}>{working ? "Thinking…" : "Ask"}</button>
      </form>

      {working && <p aria-live="polite">Reading the documents…</p>}

      {error && !working && (
        <p role="alert"><strong>Error:</strong> Couldn&apos;t get an answer right now; try again. <small>({error})</small></p>
      )}

      {reply && !working && (
        <section aria-live="polite">
          {reply.refused ? (
            <>
              <h2>Not in the documents</h2>
              <p>That isn&apos;t covered in the Ducks on the Pond documents. Try rephrasing the question, or
                contact support at support@ducksonthepondcards.com.</p>
            </>
          ) : (
            <>
              <h2>Answer</h2>
              <p style={{ whiteSpace: "pre-line" }}>{reply.answer}</p>
              {reply.source && (
                <p><strong>Source:</strong> {reply.source.document} · {reply.source.section}</p>
              )}
            </>
          )}

          <details>
            <summary>What it read ({reply.passages.length} passages)</summary>
            <ol>
              {reply.passages.map((p) => (
                <li key={p.id}>{p.document} · {p.section ?? "(no section)"} <small>({p.id}, similarity {p.similarity.toFixed(3)})</small></li>
              ))}
            </ol>
          </details>
        </section>
      )}
    </>
  );
}

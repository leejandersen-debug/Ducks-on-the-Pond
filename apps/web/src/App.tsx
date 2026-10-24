import { useEffect, useState } from "react";

type Health = { status: string; db: string; error?: string };

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json() as Promise<Health>)
      .then(setHealth)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <main style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>Hello, world</h1>
      {error && <p>API error: {error}</p>}
      {!error && !health && <p>Checking API…</p>}
      {health && (
        <p>
          API: {health.status} · Database: {health.db}
        </p>
      )}
    </main>
  );
}

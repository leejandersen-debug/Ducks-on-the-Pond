"use client";

import { useEffect, useState } from "react";

type Health = { status: string; db: string; error?: string };

// Calls the API route from the browser, the same way the mobile app will.
export function HealthStatus() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json() as Promise<Health>)
      .then(setHealth)
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) return <p>API error: {error}</p>;
  if (!health) return <p>Checking API…</p>;
  return (
    <p>
      API: {health.status} · Database: {health.db}
    </p>
  );
}

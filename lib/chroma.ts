import { ChromaClient } from "chromadb";

// Local Chroma vector store. The server runs separately (`npm run chroma`) and persists to
// ./chroma-data in this project. CHROMA_HOST / CHROMA_PORT default to that local server.
// Note: Vercel can't reach this; production would need Chroma Cloud or a hosted server.
export const chroma = new ChromaClient({
  host: process.env.CHROMA_HOST ?? "localhost",
  port: Number(process.env.CHROMA_PORT ?? 8000),
});

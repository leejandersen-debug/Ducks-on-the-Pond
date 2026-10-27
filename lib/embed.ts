import { tmpdir } from "node:os";
import { join } from "node:path";
import { env, pipeline } from "@huggingface/transformers";

// The default cache is inside node_modules, which is read-only on Vercel; /tmp is the writable
// spot there. It lasts only as long as the function instance, so a cold start downloads again.
if (process.env.VERCEL) env.cacheDir = join(tmpdir(), "transformers-cache");

// Turns text into the same kind of vector stored in doc_chunks. The settings must match the ones
// the corpus was embedded with (scripts/embed-chunks.mjs, via @chroma-core/default-embed):
// all-MiniLM-L6-v2, fp32, mean pooling, normalized. Change one and query scores stop lining up.
const MODEL = "Xenova/all-MiniLM-L6-v2";
export const DIMENSIONS = 384;

// Loaded once per server instance; the first call downloads and caches the model.
let extractor: ReturnType<typeof load> | null = null;
const load = () => pipeline("feature-extraction", MODEL, { revision: "main", dtype: "fp32" });

export async function embed(text: string): Promise<number[]> {
  extractor ??= load();
  try {
    const output = await (await extractor)(text, { pooling: "mean", normalize: true });
    return Array.from(output.data as Float32Array);
  } catch (err) {
    extractor = null; // a failed load (e.g. no network for the first download) is retried next time
    throw err;
  }
}

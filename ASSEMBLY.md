# Assembly record: course-corpus search

Date: 2026-10-26. Wiring the corpus search end to end: browser, Next.js route, embedding model, Neon Postgres (pgvector), JSON logs. One seam at a time, each with its own check.

Known question used throughout: "how many days of vacation do I get in a year?" The answer is in the employee handbook: full-time employees accrue 15 days of PTO per year.

## Seam 1: endpoint to corpus (POST /api/search)

Wired: `app/api/search/route.ts` takes `{"query": "..."}`, `lib/embed.ts` embeds it with all-MiniLM-L6-v2, `lib/search.ts` ranks the 109 rows in `doc_chunks` by cosine distance and returns the top 3.

Verified: one curl POST straight at the route, with no browser involved. HTTP 200 in 2.6 s. Top result employee-handbook-11 ("7. Paid Time Off & Holidays › PTO accrual", similarity 0.4289). Second result employee-handbook-13 (0.3864) contains "The 15-day PTO figure and the 8 paid holidays above apply to full-time employees."

Log evidence (local dev server):

    {"level":"info","event":"request_start","details":{"route":"/api/search","method":"POST"}}
    {"level":"info","event":"search.query","details":{"query":"how many days of vacation do I get in a year?","results":3}}
    {"level":"info","event":"request_done","details":{"route":"/api/search","method":"POST","status":200,"ms":2491}}

## Seam 2: page to endpoint (/search to POST /api/search)

Wired: `/search` previously called `lib/search.ts` on the server, so the browser never touched the API. It now renders `app/search/search-box.tsx`, a client component that POSTs to `/api/search` and renders the passages (the same pattern as `app/health-status.tsx`). Results below the 0.33 similarity floor show "Not in the documents". The search limits are passed in as props, so the database code stays out of the browser bundle.

Verified: a headless Chromium typed the question into the search box and clicked Search. The browser made `POST /api/search -> 200`, and the page showed the three PTO passages with the 15-day sentence visible.

Log evidence: the page load (`GET /search`, 200), then the same request_start, search.query (results 3) and request_done (POST /api/search, 200, 1074 ms) as seam 1, this time triggered by the browser.

## Seam 3: logs to real traffic

Three different questions through the browser, each of which appeared in the log with the query, the result count, the status and the timing:

- "can I bring my dog to work?" gave results 3, status 200, 1055 ms. The page showed 11. Pet Policy at 0.462.
- "what time does the store open on Sunday?" gave results 3, status 200, 472 ms. The page showed the operations manual header (0.390) and Opening Procedure (0.373).
- "what brand of coffee is in the break room?" gave results 3, status 200, 467 ms. The page showed "Not in the documents" because the best match was below 0.33.

No search went unlogged. Gap found: `search.query` said `results: 3` even when the page told the user nothing matched, because the 0.33 floor is applied in the browser. The log couldn't tell an answered question from an unanswered one. Fixed: `search.query` now includes `topSimilarity`. The vacation question logs 0.4289 (answered) and the coffee question 0.2828 (below 0.33, "Not in the documents").

## Seam 4: the whole system, live (https://ducks-on-the-pond-psi.vercel.app)

Wired for production: both migrations applied to the Neon main branch (22 tables, pgcrypto, vector 0.8.6, app_rw role), the 109 chunks loaded from the same saved vectors (30/34/18/11/16 by document, matching dev), and the code pushed to main (commits a5af958 and d7bf7f1).

Verified: headless Chromium against the live URL typed the question into the search box. `POST /api/search -> 200`, with the same three passages and the same scores as local (0.429, 0.386, 0.357).

Log evidence (Vercel production runtime logs, `vercel logs -e production`):

    01:13:53.658Z info request_start {"route":"/api/search","method":"POST"}
    01:13:57.893Z info search.query  {"query":"how many days of vacation do I get in a year?","results":3}
    01:13:57.925Z info request_done  {"route":"/api/search","method":"POST","status":200,"ms":4347}

The 4.3 s (against about 1 s locally) is a cold start: the function downloads the model into /tmp on its first call.

## Integration bugs

### 1. libonnxruntime.so.1 missing in production (environment mismatch)

Symptom: after the first deploy, live `/search` returned 500. Locally everything passed.

Running the three suspects:
- Config: ruled out. `/api/health` reported db ok on the live site, and the database had the schema and all 109 rows.
- Path: ruled out. The page and the route both existed in the deployed build's route list, and the browser posts to the same `/api/search` the route serves.
- Environment: confirmed. The production log had request_failed with "Failed to load external module @huggingface/transformers: Error: libonnxruntime.so.1: cannot open shared object file".

Cause: Next.js file tracing copies only the files it can see being imported. onnxruntime-node loads its Linux shared library at startup, so the library was never shipped to Vercel. On a Mac it loads straight from node_modules, which is why it worked locally.

How it was caught: from the production log, not by guessing. A local build then showed the same gap: the trace files for /api/search and /search had no libonnxruntime.so.1.

Fix: `outputFileTracingIncludes` in `next.config.ts` adds the onnxruntime Linux binaries to /api/search and /search only (the /catalog trace is unchanged). One change, one redeploy, and the live test passed.

### 2. Live site served nothing for search before deploy (path and environment)

Before anything was pushed, live `/search` returned 404, and `POST /api/search` returned an HTML page with status 200 instead of JSON. Production was running older code (path: the route didn't exist there yet), and its database had no tables at all (environment: the schema hold). Caught by probing the live URL before deploying. Fixed by migrating the main branch, loading the corpus and pushing.

### 3. Model cache folder read-only on Vercel (environment, prevented)

transformers.js caches the model inside node_modules, which is read-only on Vercel, and one of its cache-write paths has no error handling. `lib/embed.ts` now uses /tmp when `VERCEL` is set. This was fixed before deploying, so it was never seen failing. The evidence that the fix works is the live cold start above, which downloaded and cached the model without error.

### 4. Local /search reload loop (stale dev server; not in the code)

During the seam 2 test, `/search` reloaded about once a second and never finished loading. The dev log showed a GET /search roughly every second, and the browser console showed "[Fast Refresh] rebuilding" on each load. No file was changing on disk, and /catalog was unaffected. Cause: the dev server had been running since before the page changed from a server-only page to one with a client component. Restarting it fixed the loop with no code change. Closest suspect: environment, because the running server's state didn't match the code.

## Also noticed

- Chunking: the sentence that states the answer ("Full-time employees accrue 15 days of paid time off per year") ends chunk employee-handbook-10, which is labeled with the previous section ("6. Pay & Timekeeping › Clocking in and out"). Search still surfaces the answer through chunk 13, but re-chunking on section boundaries would put it in the top hit.
- `/search` imports constants from `lib/search.ts`, which also loads the embedding library on the server. That's why bug 1 broke the page as well as the route. Moving the constants to their own file would let the page load even if embedding breaks.
- Production has no seed data, so the card pages there are empty. Search works because it only needs `doc_chunks`.

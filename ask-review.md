# Port Review: before the first run

2026-11-08. Code reviewed against `ask-spec.md` before it was run: no dev server, no API call, nothing deployed. Files: `lib/grounding.ts` (new, the shared engine), `app/api/ask/route.ts` (new), `app/search/search-box.tsx` and `app/search/page.tsx` (rewritten), `lib/search.ts` (retrieval split out), `next.config.ts`, `scripts/ask.mjs` (now imports the shared engine). Typecheck passes.

## The four checkpoints

1. **Source labels survive into the context: PASS.** The route maps each `doc_chunks` row's `source` and `section` columns to `document` and `section` (`route.ts:52`), and `buildContext` writes them as `<document>` and `<section>` tags. The context format is byte-identical to the rig's committed version (checked by building both from the same chunks). The data side checks out too: all 70 rows have a section label on both dev and production, so the "(no section)" fallback never fires.
2. **The grounding rule is in the prompt: PASS.** `SYSTEM_PROMPT` is identical to the rig's committed prompt (checked by string comparison against `git show HEAD:scripts/ask.mjs`). It includes "Use only information stated in the context chunks" and the exact "I don't know" rule. The model (claude-opus-5-5), top 3, max_tokens, fallback beta, effort and JSON schema all match.
3. **The refusal path exists: PASS.** An exact "I don't know" sets `refused: true` and `source: null` (`grounding.ts:76`). The route returns it as a normal 200, not through `fail()`, and the page renders a dedicated "Not in the documents" state with a pointer to support. It is separate from the error state, and "What it read" still shows.
4. **Retrieval reads the app corpus, not the rig's: PASS.** Looked for by name. The route's only retrieval is `retrievePassages` → `from doc_chunks` (`search.ts:27`). Nothing in `app/` or `lib/` imports Chroma, and no code mentions the rig's collection. The data: `doc_chunks` holds 70 rows from 13 Ducks documents and 0 Trailhead rows on **both** dev and production.

## What the review caught

- **Missing API key in production (the planned risk, confirmed).** `vercel env ls --environment production` lists no `ANTHROPIC_API_KEY`. Deployed as it stands, every question would get a 503 "Answers aren't set up in this environment yet". The route fails safely, but the feature wouldn't work. It must be set before deploying.
- **Runtime file tracing.** `next.config.ts` lists by name each route that needs the embedding runtime (`libonnxruntime.so.1`). Without adding `/api/ask`, production would hit the same 500 that broke `/search` on its first deploy. Fixed in this change.
- **A dead Chroma client, `lib/chroma.ts`.** Unused since the move to Postgres, but it is exactly the import that would cause the port's signature bug if someone reached for it. Recommend deleting it.
- **Engine drift risk removed.** Rather than copy the prompt into the app, the rig and the route now share one engine file (`lib/grounding.ts`), so they can't drift apart. The rig still loads (`npm run ask` prints its usage).

## Not covered by this review

Nothing has been run yet. Behavior is unproven until the dev-server run and then the live checks in `ask-spec.md` ("Done when"). The endpoint is open with no rate limit, accepted in the approved spec.

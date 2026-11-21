# AI output checkpoint: evidence, 2026-11-21

Closes fix-list row 5. Before this change, `/api/ask` computed `citationMatchesContext`, logged it, and returned the answer anyway.

## What changed (commit `153e745`)
- `lib/grounding.ts` gained `checkpoint()`. Before an answer leaves, it checks the cited source against the retrieved chunks. When the cited source isn't one of them, the answer becomes "I don't know" (`refused: true`) and the reason is `citation_not_in_context`.
- `app/api/ask/route.ts` runs the checkpoint before every reply. A stopped answer returns `blocked: true` and logs `ask.blocked` at warn level with:
  - the question
  - the reason
  - what was cited
  - the ids and similarity scores of the retrieved chunks, never their text
- `scripts/ask.mjs` (the rig) runs the same checkpoint, so the rig and the app can't drift apart.
- **The drill.** Claude wouldn't produce a bad citation on request: three live questions that told it to cite a made-up source all came back correctly cited. So the route has a drill. When the `ASK_DRILL_TOKEN` setting exists (Vercel, production, Sensitive) and a request's `x-ask-drill` header matches it (compared as SHA-256 digests in constant time), the model's citation is swapped for `drill.txt · NOT RETRIEVED` before the checkpoint runs. The drill can only make an answer worse. Deleting the setting switches it off.

## The run on production
Deployment `dpl_8wS44GixxcBPL3mNS5zfPcmc9EkZ` (commit `153e745`), https://ducks-on-the-pond-psi.vercel.app/api/ask. Every request asked "How long does a serial-number review take?"

| Request | Request id | Reply | Log |
|---|---|---|---|
| Normal | `z6sb5-1795296879698-2ef4117902bb` | Answer cited to `faq.txt · SERIAL NUMBERS`, `blocked: false` | `ask.query`, citationMatchesContext true |
| Drill, right token | `phrkz-1795296887903-3e5b6daaa3d8` | `"I don't know"`, `refused: true`, `blocked: true`, `source: null` | **`ask.blocked`**, then `ask.query` with blocked true |
| Drill, wrong token | `f8kwz-1795296890330-0598ca242d31` | The normal cited answer, so the drill was ignored | `ask.query`, blocked false |

The stopped answer's lines in the production logs (`vercel logs --deployment dpl_8wS44GixxcBPL3mNS5zfPcmc9EkZ --json`):
```
2026-11-21T21:34:49.920Z environment=production level=warn requestId=phrkz-1795296887903-3e5b6daaa3d8
{"ts":"2026-11-21T21:34:49.920Z","level":"warn","event":"ask.blocked","details":{"question":"How long does a serial-number review take?","reason":"citation_not_in_context","cited":"drill.txt · NOT RETRIEVED","retrieved":["faq-22 (0.7401)","serial-number-dispute-procedure-02 (0.5116)","customer-service-policy-04 (0.5002)"],"drill":true}}

2026-11-21T21:34:49.921Z environment=production level=info requestId=phrkz-1795296887903-3e5b6daaa3d8
{"ts":"2026-11-21T21:34:49.921Z","level":"info","event":"ask.query","details":{"question":"How long does a serial-number review take?","retrieved":["faq-22 (0.7401)","serial-number-dispute-procedure-02 (0.5116)","customer-service-policy-04 (0.5002)"],"refused":true,"source":null,"citationMatchesContext":null,"blocked":true}}
```

The same checks passed locally first, plus "What is the capital of France?", which was refused normally and not marked blocked.

## What it doesn't catch
The checkpoint only tests the citation. On 2026-11-21, "What does a PSA 10 grade mean?" came back as a soft refusal ("The provided documents don't say…") with a real retrieved citation and `refused: false`. The citation was genuine, so the checkpoint correctly let it through. Answers that dodge the question while citing a real source need a separate check.

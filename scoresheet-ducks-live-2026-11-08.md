# Scoresheet — Ducks Golden Questions, LIVE /api/ask, 2026-11-08

Same 12 frozen items (`GoldenQuestions.txt`), same gates (`gates-ducks.md`, `695f9ca`), same grading rules as the rig baseline (`scoresheet-ducks-2026-11-08.md`). The difference is the surface: each question went to `POST https://ducks-on-the-pond-psi.vercel.app/api/ask` (commit `911d891`), which retrieves from production Postgres `doc_chunks` instead of local Chroma.

Order: all 12 replies were saved, then retrieval was graded from each reply's `passages` list with the answers hidden, then the answers were read and graded. Every request returned 200 (1.4–5.6 s).

> **Correction, 2026-11-08 (after the run).** Retrieval was over-graded. On #7, half (a) — the "Note for admin" — is accepted only from `users-guide.txt` §6.6 or `serial-number-dispute-procedure.txt` §4.2. The retrieved chunk that held it was `collector-handbook-03`, which the frozen key does not accept for that half, so #7's retrieval is a **MISS**, not a HIT. The answer grade for #7 already failed that same source, so the two grades contradicted each other. Corrected retrieval: **9 / 12**, below the ≥ 10 / 12 gate, so the verdict is **HOLD**, not SHIP. The original grades are left visible below, struck through, so the change is on record. Found while re-grading strictly during the Q8 retrieval work.

| # | Retrieved (live) | Same as rig? | Retrieval | Answer | Note |
|---|------------------|--------------|-----------|--------|------|
| 1 | collector-handbook-01 (0.554), glossary-01, users-guide-02 | identical | HIT | PASS | PSA, BGS, SGC, CGC. Cites handbook "2.3 A good routine" (accepted label). |
| 2 | faq-02 (0.583), users-guide-03, terms-of-use-03 | identical | HIT | PASS | "Undo sale"; returns not tradeable. Cites faq MY COLLECTION. |
| 3 | terms-of-use-02 (0.425), collector-handbook-03, glossary-04 | identical | HIT | PASS | "No", with what others can see. Cites terms §5 (accepted label). |
| 4 | glossary-04 (0.539), collector-handbook-02, faq-04 | identical | HIT | PASS | Open offers cancelled automatically. Cites the glossary. |
| 5 | collector-handbook-01 (0.409), glossary-00, faq-03 | identical | **MISS** | **FAIL** | Correct claim (print run, 50 made), but cites `faq.txt · WISHLIST`, which isn't on the frozen list. Same as rig. |
| 6 | privacy-notice-03 (0.416), security-03, security-02 | identical | HIT | PASS | 2 business days to acknowledge, 5 to assess. Cites security 3.3 (accepted label). |
| 7 | terms-of-use-03 (0.650), collector-handbook-03, customer-service-policy-04 | identical | ~~HIT (both)~~ **MISS** (corrected) | **FAIL** | Half (a) came only from the Collector Handbook chunk, which the key doesn't accept for (a) (see correction). Both halves are in the answer; the single citation is Collector Handbook §6, which isn't on the frozen list. Same as rig. |
| 8 | glossary-04 (0.399), customer-service-policy-01, collector-handbook-02 | identical | **MISS** | **FAIL** | "I don't know": neither half was retrieved. Same as rig. |
| 9 | customer-service-policy-06 (0.569), serial-number-dispute-procedure-02, customer-service-policy-03 | identical | HIT | PASS | 10 business days. Cites `customer-service-policy.txt · 12. FOR SUPPORT STAFF` (accepted label for CSP §11). The rig cited the dispute procedure; both are accepted. |
| 10 | pricing-guide-03 (0.466), pricing-guide-02, pricing-guide-04 | identical | HIT | PASS | No refund for a started month; didn't apply the yearly 14-day refund. |
| 11 | customer-service-policy-06 (0.322), privacy-notice-03, security-04 | identical | HIT | PASS | Exactly "I don't know". |
| 12 | privacy-notice-00 (0.441), customer-service-policy-00, indemnification-policy-00 | identical | HIT | PASS | Exactly "I don't know". |

## Totals

| Measure | Live | Rig baseline | Gate | Verdict |
|---|---|---|---|---|
| Retrieval accuracy | **~~10 / 12~~ 9 / 12** | ~~10 / 12~~ 9 / 12 | ≥ 10 / 12 | FAIL (corrected) |
| Answer quality | **9 / 12** | 9 / 12 | ≥ 9 / 12 | PASS |

Not averaged. **Gate verdict: ~~SHIP~~ HOLD** (corrected). The live surface still matches the rig item for item, so the correction applies to both equally.

## Reading it

- **The swap introduced no new failures.** Retrieval is identical on all 12 items (same chunks, same order, same scores), which proves production `doc_chunks` and the local Chroma store hold the same corpus and vectors. The pass/fail pattern is the same item for item.
- **The only difference is wording.** On #9 the live answer cited a different accepted source (the Customer Service Policy) than the rig did (the dispute procedure). Same fact, same grade. That is the model's normal run-to-run variation, not wiring.
- **The open work is unchanged:** #8 (retrieval: facts diluted in large chunks), #5 (retrieval), #7 (one-citation answer format), plus the two v2-key gaps noted in the rig scoresheet.

Raw replies: `/private/tmp/claude-501/-Users-landersen-Claude-Code-Working-Folder-Week-8/d0d03c32-1a6b-43a0-b60f-a7dbecb3d027/scratchpad/live-golden/`

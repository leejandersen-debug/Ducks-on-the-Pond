# Scoresheet — Golden Set, 2026-11-03

Run against the frozen `golden-set.md`. Order on every item: first the retrieved list (`npm run query`, which uses the same collection, embedding model and top 3 as the engine), with the retrieval verdict written down; then the answer (`npm run ask`).

Retrieval rules: the expected source counts as a HIT anywhere in the top 3, including a chunk's secondary sections. Cross-document items need both sources. Gap items take a dash.
Answer rules: the claim must match the golden answer, and the receipt must name the expected source (by the frozen file's accepted labels).

| # | Question | Expected source | Retrieval | Answer | Note |
|---|----------|-----------------|-----------|--------|------|
| 1 | How much of a discount do I get on gear as staff? | employee-handbook.md · 12 › Your employee discount | HIT (rank 1, 0.535) | PASS | 30%. Receipt shows the chunk label "What to wear". |
| 2 | I'm full-time — how many vacation days do I build up in a year? | employee-handbook.md · 7 › PTO accrual | HIT (rank 1, 0.526) | PASS | 15 days; holidays kept separate. Cites "7 › How to request time off", the rank-2 chunk, which also states the 15-day figure. |
| 3 | Can I bring my dog in with me when I work? | employee-handbook.md · 11. Pet Policy | HIT (rank 1, 0.478) | PASS | Fridays, leashed, consent. Scores are low; rank 3 is 0.238. |
| 4 | What will it cost to ship my order to Hawaii? | returns-shipping-policy.txt · SECTION 6 | HIT (rank 1, 0.563) | PASS | $27 = $12 + $15. No free shipping. |
| 5 | I'm going to wear a fleece under the Wind River shell — should I just order my normal size? | product-faq.md · Sizing & Fit | HIT (ranks 1–2, 0.582) | PASS | Size up, half-size small. The meaning-only wording still retrieved it. |
| 6 | What's the staff price on the Cirque 2 tent? | pricing.csv · CMP-CRQ2-001 | HIT (rank 1, 0.796) | PASS | $245.00. Highest score in the set. |
| 7 | A customer wants to return a jacket for their money back — how do I handle it at the register? | returns-shipping-policy.txt · SECTION 1 + store-operations-manual.md · 4 | HIT (both: policy -00 at rank 3, ops -05 at rank 2) | **FAIL** | Missing citation: only the ops manual is credited. Incomplete answer: stops at step 5, with no manager PIN, routing or logging (chunk ops -06 not retrieved). No policy-only fact from the pass list (no 5–7 business days, no original packaging). Both halves were required. |
| 8 | I received my boots 38 days ago and haven't worn them outside. Can I still get my money back? | returns-shipping-policy.txt · SECTION 2 | **MISS** | PASS | "No refund" is correct, but it comes from the 30-day line in SECTION 1. Chunk -02 (the 45-day window) wasn't retrieved, and the answer never mentions the exchange or store-credit option. The receipt "SECTION 1 — RETURNS" matched an accepted label, but -01 and -02 share that label, so the check can't tell which chunk was used. |
| 9 | What's the wifi password? | none | — | PASS | Exact "I don't know". Bait retrieved (Opening Procedure, the handbook Wifi section). |
| 10 | If I find the same tent cheaper at another shop, will you match the price? | none | — | PASS | Exact "I don't know". Bait retrieved (tent prices). |

## Totals

- **Retrieval accuracy: 7 / 8** (items 1–8; the two gap items take a dash and are left out of the denominator)
- **Answer quality: 9 / 10** (all ten items, the refusals included)

Not averaged.

## Reading the table

Retrieval is the weaker measure. That's partly the numbers (7/8 vs 9/10), but more because the answer score hides it. Retrieval's misses don't all show up as answer failures.

The row that shows this best is **#8: MISS / PASS.** It's the precision case, built to force the 30-versus-45 choice. The 45-day passage never reached Claude, so that choice never happened. The engine answered from the 30-day sentence alone, which is enough to say "no" but not enough to tell the customer they can still exchange or take store credit. The answer verdict says PASS. The retrieval verdict shows the item's actual test was never run.

#7 is the same weakness one level down. By section it's a HIT, but the chunk holding the second half of the procedure wasn't in the top 3, and the answer failed.

## Fix list for the next session

1. #8: get returns-shipping-policy-02 (SECTION 2, the 45-day window) into the retrieved set. For example, retrieve more than 3 chunks, or split chunks on section boundaries.
2. #7: keep numbered procedures in one chunk so all of section 4 is retrieved together, or retrieve more than 3 chunks.
3. #7: let the answer schema in `scripts/ask.mjs` cite more than one source document.
4. Receipt grading: chunk labels are ambiguous (-01 and -02 both read "SECTION 1 — RETURNS"). Grade receipts by chunk ID, or print the chunk ID with the source line.

Raw outputs (retrieved lists r1–r10, answers a1–a10, retrieval verdicts timestamped before the answers ran): `/private/tmp/claude-501/-Users-landersen-Claude-Code-Working-Folder-Week-8/69f014fa-8497-45ac-b880-bff4de8fcd5b/scratchpad/scoresheet/`

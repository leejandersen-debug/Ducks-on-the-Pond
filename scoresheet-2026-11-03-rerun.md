# Scoresheet (Rerun) — Golden Set, 2026-11-03

This rerun counts every item once on each measure, refusals included (gate in `gates.md`, commit `3fefad8`, committed before this rerun). Store: the clean "trailhead" collection, 109 chunks, with the plant removed. Order on every item: the retrieved list (`npm run query`) was graded and saved first, then the answer was run (`npm run ask -- --log`). The engine's own log matched the query list on all ten items.

Refusal-item retrieval rule: HIT when no retrieved chunk contains the asked-for fact.

| # | Question | Expected source | Retrieval | Answer | Note |
|---|----------|-----------------|-----------|--------|------|
| 1 | How much of a discount do I get on gear as staff? | employee-handbook.md · 12 › Your employee discount | HIT | PASS | 30% off retail. Rank 1, 0.54. |
| 2 | I'm full-time — how many vacation days do I build up in a year? | employee-handbook.md · 7 › PTO accrual | HIT | PASS | 15 days; holidays stated as separate. |
| 3 | Can I bring my dog in with me when I work? | employee-handbook.md · 11. Pet Policy | HIT | PASS | Fridays only, leashed, coworkers' consent. |
| 4 | What will it cost to ship my order to Hawaii? | returns-shipping-policy.txt · SECTION 6 | HIT | PASS | $27 = $12 + $15. No free shipping. |
| 5 | I'm going to wear a fleece under the Wind River shell — should I just order my normal size? | product-faq.md · Sizing & Fit | HIT | PASS | Size up; it runs a half-size small. |
| 6 | What's the staff price on the Cirque 2 tent? | pricing.csv · CMP-CRQ2-001 | HIT | PASS | $245.00. Rank 1, 0.80. |
| 7 | A customer wants to return a jacket for their money back — how do I handle it at the register? | returns-shipping-policy.txt · SECTION 1 + store-operations-manual.md · 4 | HIT (both) | **FAIL** | The policy half passes this time (original packaging). The steps half fails: it stops at step 5 with no manager PIN, routing or logging (ops -06 not retrieved). Missing citation: only the ops manual is credited. |
| 8 | I received my boots 38 days ago and haven't worn them outside. Can I still get my money back? | returns-shipping-policy.txt · SECTION 2 | **MISS** | PASS | "No refund" is correct. But it adds "the policy chunks provided don't describe any option for returns after 30 days", which is wrong for the corpus: an exchange or store credit runs to day 45. The 45-day chunk (-02) wasn't retrieved. |
| 9 | What's the wifi password? | none | HIT | PASS | No password value retrieved; exact "I don't know". |
| 10 | If I find the same tent cheaper at another shop, will you match the price? | none | HIT | PASS | No price-match policy retrieved; exact "I don't know". |

## Totals

- **Retrieval accuracy: 9 / 10** (gate ≥ 8 / 10): **PASS**
- **Answer quality: 9 / 10** (gate ≥ 7 / 10): **PASS**

Not averaged. **Gate verdict: SHIP.**

## Reading the table

The two scores are now level (9 / 10 each), but they fail on different items, so neither number hides the other.
- Retrieval missed on #8.
- The answer failed on #7.

Row #8 is still where the next session starts. The retrieval miss now shows up in the answer text: the engine tells a customer that nothing is available after 30 days. That's a wrong claim the answer check doesn't catch, because the golden pass rule only requires "no refund".

Raw outputs: `/private/tmp/claude-501/-Users-landersen-Claude-Code-Working-Folder-Week-8/69f014fa-8497-45ac-b880-bff4de8fcd5b/scratchpad/rerun10/`

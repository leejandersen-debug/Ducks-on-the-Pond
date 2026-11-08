# Scoresheet — Ducks Golden Questions, 2026-11-08

Gate: `gates-ducks.md`, committed in `695f9ca` (10:22) before this run. Golden set: `GoldenQuestions.txt`, frozen in the same commit. Store: the local Chroma "ducks" collection, 70 chunks, with no plant present. Engine: `scripts/ask.mjs` (claude-opus-5-5, top 3).

Order on every item: the retrieved list (`npm run query`) was saved and graded for all 12 items first. Then the answers were run (`npm run ask -- --log`). The engine's own log matched the query list on all 12 items.

Refusal-item retrieval rule: HIT when no retrieved chunk contains the asked-for fact.
Answer rule: the claim matches the golden answer **and** the cited source is on the item's frozen accepted list.

| # | Question | Accepted source | Retrieved (top 3) | Retrieval | Answer | Note |
|---|----------|-----------------|-------------------|-----------|--------|------|
| 1 | Which grading companies can I pick when I add a graded card? | users-guide 4 / faq / capabilities 3 / glossary / handbook 3.1 | collector-handbook-01 (0.55), glossary-01, users-guide-02 | HIT | PASS | PSA, BGS, SGC, CGC; cites handbook "2.3 A good routine" (accepted label). |
| 2 | I marked a card as sold by accident. Can I take that back? | users-guide 6.5 / faq MY COLLECTION / glossary | faq-02 (0.58), users-guide-03, terms-of-use-03 | HIT | PASS | "Undo sale"; stays not tradeable. Cites faq MY COLLECTION. |
| 3 | Can other people on the app see how much I paid for my cards? | privacy 5.1 / CSP 10 / terms 6.3 | terms-of-use-02 (0.42), collector-handbook-03, glossary-04 | HIT | PASS | "No", with what others can see. Cites terms §5 (accepted label of terms-of-use-02). |
| 4 | If I decide I don't want to trade a card anymore, what happens to the offers people already sent for it? | users-guide 6.3 / faq TRADING / capabilities 6 / glossary | glossary-04 (0.54), collector-handbook-02, faq-04 | HIT | PASS | Open offers cancelled automatically. Cites the glossary. |
| 5 | What does it mean when a card says /50? | glossary "print run" / users-guide 4 | collector-handbook-01 (0.41), glossary-00, faq-03 | **MISS** | **FAIL** | Neither accepted chunk (glossary-02, users-guide-01) was retrieved. The claim is right ("print run, 50 copies made"), worked out from faq-03's "51 on a /50 card", but it cites `faq.txt · WISHLIST`, which isn't an accepted source. |
| 6 | I found a security hole in the site. How soon will someone get back to me after I report it? | security 3.2 | privacy-notice-03 (0.42), security-03, security-02 | HIT | PASS | 2 business days to acknowledge, 5 to assess. Cites security "3.3 Rules for testing" (accepted label). |
| 7 | The app says my card's serial number is already in someone else's collection. Where do I explain my side, and what proof carries the most weight? | (a) users-guide 6.6 / dispute 4.2 + (b) dispute 5.2 / CSP 7 | terms-of-use-03 (0.65), collector-handbook-03, customer-service-policy-04 | HIT (both) | **FAIL** | Both halves retrieved: the handbook chunk has the Note for admin, and CSP-04 has "cert is the strongest evidence". Both halves are in the answer. But the single citation is `collector-handbook.txt · 6`, which isn't on the frozen list for either half. The schema allows one source, so a two-document answer can only credit one. |
| 8 | Who can read the message I attach to a trade offer, and is there anything I shouldn't put in it? | (a) privacy 5.1 / CSP 10 + (b) handbook 7 | glossary-04 (0.40), customer-service-policy-01, collector-handbook-02 | **MISS** | **FAIL** | Neither half retrieved: privacy-notice-01, CSP-05 and handbook-03 were all outside the top 3. The engine said "I don't know", a safe refusal but the wrong result for an answerable question. |
| 9 | I asked for a second review of an admin's serial-number decision. How long until I hear back? | dispute 8 / 6.4 / CSP 11 | customer-service-policy-06 (0.57), serial-number-dispute-procedure-02, customer-service-policy-03 | HIT | PASS | 10 business days, by someone not involved in the first decision. Didn't confuse it with 5 or 14. Cites dispute "6.1 The queue" (accepted label). |
| 10 | I'm on the monthly Flock plan and cancelled two days into the month. Do I get money back for the rest of the month? | pricing 9 / 8.1 | pricing-guide-03 (0.47), pricing-guide-02, pricing-guide-04 | HIT | PASS | No refund for a started month; active until period end, then Pond. Didn't apply the yearly 14-day refund. |
| 11 | What phone number can I call to talk to support? | none | customer-service-policy-06 (0.32), privacy-notice-03, security-04 | HIT | PASS | No phone number in any retrieved chunk. Exactly "I don't know". |
| 12 | Who started Ducks on the Pond Cards, and what year was it founded? | none | privacy-notice-00 (0.44), customer-service-policy-00, indemnification-policy-00 | HIT | PASS | Retrieved chunks mention "Owner: … support team" and "owners, officers", but no founder or year. Exactly "I don't know". |

## Totals

- **Retrieval accuracy: 10 / 12** (gate ≥ 10 / 12): **PASS**, exactly on the gate.
- **Answer quality: 9 / 12** (gate ≥ 9 / 12): **PASS**, exactly on the gate.

Not averaged. **Gate verdict: SHIP**, with no margin on either measure.

## Reading the table

Retrieval is the weaker lever. Both retrieval misses (#5, #8) became answer failures. The only answer failure that wasn't a retrieval miss is #7, a citation problem.

Row #8 is where the next session starts. The facts sit inside large chunks about other topics: the privacy chunk is labelled "3.2 Information collected automatically", and the handbook's "7. STAYING SAFE" is the third section of chunk 03. The question's wording ("message I attach to a trade offer") matched glossary and trading-advice chunks instead. This is the same large-chunk dilution the Trailhead store-hours and injury questions showed.

Key gaps found (the golden file stays frozen; fix in a v2 key): the accepted lists for #5 and #7 leave out sources that really do state the fact (faq SERIAL NUMBERS for /50; Collector Handbook §6 for the Note for admin).

Raw outputs: `/private/tmp/claude-501/-Users-landersen-Claude-Code-Working-Folder-Week-8/d0d03c32-1a6b-43a0-b60f-a7dbecb3d027/scratchpad/ducks-baseline/`

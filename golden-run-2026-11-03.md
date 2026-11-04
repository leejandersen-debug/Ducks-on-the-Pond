# Golden Set Run — 2026-11-03

Run against the frozen `golden-set.md` with `npm run ask -- --context "<question>"` (claude-opus-5-5, top 3 chunks from the local Chroma "trailhead" collection). Each reply was graded against that item's pass criteria.

**Score: 9 of 10 pass.** #7 fails.

1. PASS. Staff discount. Answer: 30% off retail merchandise, personal use only, some exclusions. Source: employee-handbook.md · 12. Dress Code & Staff Gear › What to wear (accepted chunk label).
2. PASS. Vacation days. Answer: 15 days of PTO, built up through the year; 8 paid holidays mentioned "separately", not added in. Source: employee-handbook.md · 7. Paid Time Off & Holidays › How to request time off. That isn't one of the listed labels, but the cited chunk holds the line "The 15-day PTO figure… apply to full-time employees", so it passes the source rule.
3. PASS. Dog at work. Answer: yes, Fridays only, leashed, coworkers must consent. Source: employee-handbook.md · 11. Pet Policy.
4. PASS. Hawaii shipping. Answer: $12 + $15 = $27, no free shipping. Source: returns-shipping-policy.txt · SECTION 6 — SHIPPING ZONES & RATES.
5. PASS. Fleece under the shell (meaning-only). Answer: no, size up; the Wind River Hardshell runs about a half-size small. Source: product-faq.md · Trailhead Supply Co. — Customer FAQ (accepted chunk label).
6. PASS. Cirque 2 staff price. Answer: $245.00. Source: pricing.csv · Camping. All three retrieved chunks were pricing rows.
7. **FAIL.** Register return (cross-document). Answer: steps 1–5 from the manual (greet, check the 30-day window, inspect, find proof of purchase, refund to the original payment method in the POS) plus the policy's original-packaging rule. Missing: manager PIN, routing the item, logging the return, and the 5–7 business day refund timing. Only store-operations-manual.md was credited.
   - Policy half: passes (original packaging).
   - Steps half: fails (none of manager PIN, routing, logging).
   - Credit: fails (one document).
   - Cause, retrieval: section 4 of the manual is split across two chunks. Only the first chunk was retrieved, and it stops partway through step 5. The chunk with the manager PIN, routing and logging never reached Claude. The policy chunk retrieved was the overview and Section 1 opening, not the paragraph with 5–7 business days. The model answered faithfully from what it was given.
   - Cause, engine: ask.mjs can cite only one source document, so credit fails even with perfect retrieval.
8. PASS. Boots at day 38 (precision). Answer: no refund; boots past the 30-day window. Source: returns-shipping-policy.txt · SECTION 1 — RETURNS (accepted label). Gap: it didn't mention that an exchange or store credit is still open to day 45, because no retrieved chunk contained the 45-day window. The refusal of the refund is correct. The customer just isn't told the alternative.
9. PASS. Wifi password. Answer: exactly "I don't know", Source: none. Bait was retrieved (Opening Procedure step 7 with the printed-card note, and the handbook's "Trailhead-Guest" wifi section), and the model still declined.
10. PASS. Price match. Answer: exactly "I don't know", Source: none. Bait was retrieved (Cirque 2 and other camping prices).

## What the run shows

- Single facts, meaning-only, structured data and refusals all hold.
- The weak spot is coverage of multi-part answers. Top-3 retrieval misses the second half of a procedure that spans chunks (#7), and the companion fact sitting next to a precision answer (#8's 45-day window).
- Candidate fixes for a later session: retrieve more than 3 chunks, keep numbered procedures in one chunk, or allow several source documents in the answer schema. Then rerun this same frozen set to measure the change.

Raw outputs, including the full context sent to Claude for each item: `/private/tmp/claude-501/-Users-landersen-Claude-Code-Working-Folder-Week-8/69f014fa-8497-45ac-b880-bff4de8fcd5b/scratchpad/golden-run/`

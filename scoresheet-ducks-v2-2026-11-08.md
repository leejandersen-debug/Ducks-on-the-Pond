# Scoresheet — Ducks Golden Questions v2, rig and live, 2026-11-08

Key: `GoldenQuestions-v2.txt`, frozen and committed in `afbbc14` (13:59) together with the fix, before these runs. Gates: `gates-ducks.md` (unchanged for v2): retrieval ≥ 10 / 12, answer ≥ 9 / 12, refusals included, never averaged.

What changed since v1: one new FAQ entry (PRIVACY, "Who can read the message I send with a trade offer?"), and the FAQ is now chunked one Q&A per chunk (58 FAQ chunks; store 122 chunks in local Chroma, dev and production). The other 12 documents' chunks are unchanged.

Order: rig retrieval (`npm run query`) and live retrieval (each `/api/ask` reply's `passages`) were saved and graded for all 12 before any answer was read. Then rig answers (`npm run ask`) and live answers were graded. **Rig and live retrieved the same 3 chunks, in the same order, on all 12 items.**

| # | Retrieved (rig = live) | Retrieval | Rig answer | Live answer | Note |
|---|------------------------|-----------|------------|-------------|------|
| 1 | collector-handbook-01 (0.554), faq-14, faq-15 | HIT | PASS | PASS | PSA, BGS, SGC, CGC; both cite `faq.txt · MY COLLECTION` (faq-14, accepted). |
| 2 | faq-18 (0.726), users-guide-03, faq-16 | HIT | PASS | PASS | "Undo sale"; comes back not tradeable. `faq.txt · MY COLLECTION`. |
| 3 | faq-40 (0.468), faq-49, terms-of-use-02 | HIT | PASS | PASS | "No". Cites terms §5 (accepted label). HIT via terms-of-use-02 at #3. |
| 4 | faq-36 (0.545), glossary-04, collector-handbook-02 | HIT | PASS | PASS | Open offers cancelled automatically. Cites the glossary. |
| 5 | faq-25 (0.582), faq-20, collector-handbook-01 | HIT | PASS | PASS | Print run, 50 made. Cites `faq.txt · SERIAL NUMBERS` (faq-25, accepted in v2). **Fixed** (v1: MISS / FAIL). |
| 6 | privacy-notice-03 (0.416), security-03, security-02 | HIT | PASS | PASS | 2 business days to acknowledge, 5 to assess. Cites security 3.3 (accepted label). |
| 7 | terms-of-use-03 (0.650), collector-handbook-03, faq-21 | **MISS** | **FAIL** | **FAIL** | Half (a) now HIT (handbook §6, accepted in v2). Half (b), "a grading cert is the strongest evidence", isn't retrieved: the new faq-21 ("Why was my card sent to an admin for review?") displaced CSP-04, which held it in v1. Both answers give the Note for admin and say honestly that the context doesn't say which proof weighs most, but the item needs that half. |
| 8 | faq-51 (0.536), faq-56, faq-50 | HIT | PASS | PASS | **Fixed** (v1: MISS / FAIL). Both halves: only the two collectors can see the trade and its message; keep payment and address details out. Cites `faq.txt · PRIVACY` (faq-51, accepted in v2). |
| 9 | faq-22 (0.619), customer-service-policy-06, serial-number-dispute-procedure-02 | HIT | PASS | PASS | 10 business days, not 5 or 14. Both cite dispute "6.1 The queue" (accepted label). |
| 10 | pricing-guide-03 (0.466), pricing-guide-02, pricing-guide-04 | HIT | PASS | PASS | No refund for a started month; didn't apply the yearly 14-day refund. |
| 11 | faq-54 (0.440), customer-service-policy-06, privacy-notice-03 | HIT | PASS | PASS | No phone number in any retrieved chunk (faq-54 is "How do I contact support?", which points to the policy). Exactly "I don't know". |
| 12 | faq-01 (0.659), faq-46, faq-02 | HIT | PASS | PASS | No founder or year in any retrieved chunk. Exactly "I don't know". |

## Totals

| Measure | Rig v2 | Live v2 | v1 (corrected) | Gate | Verdict |
|---|---|---|---|---|---|
| Retrieval accuracy | **11 / 12** | **11 / 12** | 9 / 12 | ≥ 10 / 12 | PASS |
| Answer quality | **11 / 12** | **11 / 12** | 9 / 12 | ≥ 9 / 12 | PASS |

Not averaged. **Gate verdict: SHIP**, with one item of margin on retrieval and two on answers. Rig and live match item for item.

## Reading it

- **#8 is fixed** on both measures, and so is **#5**. Q8 needed both parts: the new FAQ entry (content) and one-Q&A-per-chunk FAQ chunking (so the entry isn't diluted). Offline, either part alone still missed.
- **#7 is the one failure left, and it moved.** v2 accepts the handbook for its first half, but the FAQ re-chunk pushed CSP-04 (the "strongest evidence" half) out of the top 3. This is a real side effect of the change: small, sharp FAQ chunks now compete with long policy chunks for the same three slots. It is the next session's work. Levers: chunk the policy documents by section too, or let compound questions retrieve more than 3 chunks.
- **What v2 changed in the key**, all recorded in its header: accepted sources only (#8 new entry, #5 FAQ line, #7 (a) handbook, FAQ chunk ids). The questions and pass criteria are identical to v1. Of the +2 retrieval, #8 comes from the corpus and chunking fix. #5 comes from both: the FAQ chunk now ranks first, and v2 accepts it.

Raw outputs: `/private/tmp/claude-501/-Users-landersen-Claude-Code-Working-Folder-Week-8/d0d03c32-1a6b-43a0-b60f-a7dbecb3d027/scratchpad/v2run/`

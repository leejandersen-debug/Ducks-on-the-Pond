# Fix-list rows 14–18: evidence, 2026-11-21

Code: commit `32e0d94`. Live: production deployment `dpl_7fcrtkVYMjSTY78ZJZhKtYNFRLQA`, built from that commit.

## Row 16: soft refusals are blocked
- **The change.** `checkpoint()` in `lib/grounding.ts` now also blocks an answer whose opening sentence says the context doesn't cover the question (reason `soft_refusal`). It only reads the opening, so a partial answer that names what's missing later on (golden Q7) still gets through. The drill gained `x-ask-drill-kind: soft_refusal`.
- **A first attempt was reverted.** It asked Claude to also report whether the context answers the question. In a local run that made golden Q3 come back "I don't know", and the PSA 10 dodge still got through. Moving the check out of the prompt leaves the model's behavior unchanged.
- **A bug found along the way: row 5's checkpoint had a false block.** Golden Q3 sometimes cites `terms-of-use.txt · 6.3 What other collectors can see`, a heading inside the retrieved chunk labelled "5. WHAT THE APPLICATION DOES AND DOES NOT DO". The exact-label match blocked that correct answer. Now a citation matches when its document matches a retrieved chunk and its section is either the chunk's label or a heading inside that chunk's text. Production's logs since row 5 went live show only the drill was ever blocked, so no real question was affected.
- **Proof on production:**
  - The forced soft refusal was stopped. Request `xxffr-1795309463645-bfe7faf9087d` logged `{"level":"warn","event":"ask.blocked","details":{"question":"How long does a serial-number review take?","reason":"soft_refusal","cited":"faq.txt · SERIAL NUMBERS",…,"drill":true}}`.
  - The citation drill was still stopped too (`8nqt2-1795309470879-76673f93c6a8`, `citation_not_in_context`).
- **The baseline held.** All 12 frozen golden questions were re-run on production:
  - Every question retrieved the same 3 chunks as the v2 baseline.
  - The answers grade the same as v2: 11/12, with Q7 failing for the same reason (it doesn't say a grading cert is the strongest proof).
  - Q3 answered and cited §5, and Q11 and Q12 refused exactly.

## Row 18: Next.js advisories
- `next` went from 16.4.3 to **16.4.6**, the latest 16.4 patch.
- `npm audit --omit=dev`: **0 vulnerabilities**, where 16.4.3 had 7 moderate advisories.
- `npm run build` and `tsc --noEmit` were clean, and the production deploy above is ● Ready.

## Row 15: catalog button
- In each card's row, the Variants column is now headed "Variants (add to my collection)". Each variant has an **I own one** link to `/collection?variant=<id>#add`, which opens My collection with that variant already chosen.
- The old **Add** button is now **Add variant**, under the heading "New variant for the catalog".
- The live set page shows "Add variant" and "I own one" (fetched 2026-11-22 01:04 UTC).

## Row 14: failed actions are logged
Every failed action now writes `action_rejected` (action, code, the message shown) or `action_failed`. Before, a user error, "That already exists." and two other expected cases left no line.

## Row 17: verification email 403
- **Cause, from the code:** the sender is Resend's shared test address `onboarding@resend.dev`. Resend delivers from it only to the Resend account's own address, so anyone else's address gets a 403 `validation_error`. BillyBob's did.
- **What the code can fix:**
  - `email_failed` now logs `testSender: true` and the likely cause.
  - The banner no longer says "we sent you a link". It now says "If the link didn't arrive, send it again."
- **What only the owner can fix:** verifying a domain in Resend (DNS records) and setting `EMAIL_FROM`. Until then, emails reach only the Resend account's own address.

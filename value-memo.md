# Value Memo: Course 2 build vs the Rebuild

**Course 2 build:** the Baseball Card Database from Week 6. It was two projects: First-Server (Express plus MongoDB) and First-Client (static HTML), built 2026-10-03 to 10-18.
**The Rebuild:** Ducks on the Pond Cards (this repo). It is one Next.js app on Postgres, built 2026-10-23 to 11-21.
**Measured against:** my Week 8 Baseline Note (about Course 2) and last week's Progress Note (about the Rebuild). Written 2026-11-21.

## Time

| | Course 2 | Rebuild | Source |
|---|---|---|---|
| My estimate | ~40 h | none | Baseline Note |
| Commit span (first to last commit, each working day) | **37.3 h** over 11 days | **28.3 h** over 13 days | git history of both builds, counted the same way |
| Active Claude Code session time | not available | 20.5 h (25.6 h if gaps up to 30 min count) | 18 session transcripts, 285 prompts, idle gaps over 15 min left out |

The like-for-like number is the commit span: **28.3 h against 37.3 h, about a quarter less.** It's the only measure applied the same way to both builds. My 40-hour estimate for Course 2 agrees with it, which suggests the estimate wasn't inflated. Course 2's session transcripts have aged out (Claude Code keeps them for about 30 days), so the session-time row can't be measured for it.

## Friction

**1. Course 2's worst friction: the deployed site couldn't reach the API (CORS).** Two frontend addresses and a separate API project meant the server needed a list of allowed origins. It worked locally and failed only after deploy. *In the Rebuild:* this didn't happen. Pages and API ship as one Next.js app at one address, so the app has no CORS setup at all. My first Rebuild skeleton was Express plus Vite again, which would have brought the problem back. It was replaced the same day (commits `cb2e4e4` to `7b38b27`), because `DECISIONS.md` had already chosen one project and one deploy.

**2. Course 2: the data model changed late.** The build started from the course's tasks example, and I reworked it in stages: users own cards (10-04), each user gets their own players and cards (10-10), players become a shared pool (10-16). *In the Rebuild:* the data model was decided first, and `DECISIONS.md` ranks it as the most expensive choice to reverse. The first schema went in on 10-24. The three migrations since then only add things (new tables and one new column). The catalog and collection tables have never been reshaped.

**3. Course 2: a platform limit I didn't know about.** Vercel rejected uploads over 4.5 MB before my own 4 MB check ever ran. *In the Rebuild:* the surprise moved from the platform to the tools. Claude Desktop gave me wrong answers about its own features and cost about an hour (Progress Note), and large prompts can run for more than 20 minutes. The Rebuild has no photo upload, so the 4.5 MB limit was never tested. I avoided it rather than solved it.

**Never again, partly repeated: notes kept inside the repo.** In Course 2, the secret scanner flagged old notes files and fixing it meant rewriting git history. In the Rebuild, my prompt logs were committed until 2026-11-21 (`b1e4370`, `22f1557`). This time a scan of all 65 commits found no secrets, so the history didn't need rewriting. The logs are git-ignored now.

**Smoother (Progress Note):** the corpus. It was real card-app material, so I could judge good and bad answers. That gave 12 golden questions where the rig had 10, over 70 chunks where it had 10.

## Quality

**Better:**
- The AI feature is measured: 11/12 on retrieval and 11/12 on answer quality, on both the rig and the live site (`baseline-report-ducks-v2.md`).
- Privacy is enforced by the database through row-level security, not only by route code.
- Practised rollback with proof (`rollback-evidence-2026-11-21.md`) and structured request logs.
- A governed cleanup chore whose failure drill had 34 kills, 0 unlogged changes and 0 phantom log lines.
- A live MCP door with two locks.

**Worse:**
- No automated test suite. Course 2 had 123 Jest/supertest tests in 6 files. The Rebuild has 0 unit tests and relies on type-checking, the golden set and drills.
- No photo upload, which was Course 2's self-taught feature.
- Production has 1 user and 0 copies, so there's no real use yet.
- Two open fix-list rows: the AI output isn't blocked when its citation fails (row 5), and the door serves dev data (row 6).

## The claim

**The numbers.** Measured the same way, the Rebuild took 28 hours against Course 2's 37, about a quarter less. In that time it shipped more verified parts: an evaluated AI feature, database-level privacy, a practised rollback, a governed chore and a live door. Course 2's two worst frictions (CORS on deploy and a late data-model rework) didn't come back.

**What else could explain them.**
- It's my second build of the same subject. I knew the card domain and what I wanted, and that alone fixes most of a late data-model change.
- The Rebuild lessons were more tightly structured than the Course 2 template.
- The tools and model got better between the two builds.
- The Rebuild has fewer risky features (no uploads) and no unit-test suite to write and maintain.
- Commit span misses work between commits, such as the Claude Desktop hour, and the Rebuild was spread over more calendar days.

**What survives anyway.**
- The CORS friction disappeared because of a written decision made before any code (one app, one address), not because of experience. My own first skeleton tried to rebuild the two-project setup and the decision caught it the same day.
- Choosing the schema first, ranked by cost to reverse, is a habit that carries over, not luck.
- Even if every saved hour is credited to experience, the Rebuild delivered more checkable components without taking more time.

**What I'd measure next time.**
- Time per component, with the same start/stop log for both builds and saved before transcripts age out.
- Time spent waiting on long prompts, counted separately from working time.
- How many failures appeared only after deploy.
- A unit-test count, set before the build starts, so "quality" includes the tests I skipped.

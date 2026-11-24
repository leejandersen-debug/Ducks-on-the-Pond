# Autonomy justification: catalog cleanup

How much each part of the catalog-cleanup chore may do on its own, and why. The source of truth for the rules is `Rules.md`. This document explains the rungs chosen there. It was first written as the prompt 200 answer on 2026-11-13, saved as a document and updated on 2026-11-21, and updated again on 2026-11-24 to record the closed gaps.

## The chore and who runs it
- **The chore:** a cleanup of the shared card catalog (sets, parallels, players, cards). It runs from `tasks/catalog-cleanup.md` under `Rules.md`.
- **The automation:** `npm run cleanup:prod` (`scripts/catalog-cleanup.mjs`). It's the only thing that changes data. Every change goes through one function, `changeField` in `scripts/lib/catalog-change.mjs`, which logs `catalog.change_committing` before the commit and `catalog.change` once it's confirmed, with the record, field, before value, after value and author `chore-run`.
- **The agent:** a headless Claude Code worker, given one prompt ("Read Rules.md, then do the task in tasks/catalog-cleanup.md exactly as written, and write the report it asks for"). It decides when to run the automation and what to flag. It may write only the report and the chore-run log.
- **The target:** the Neon production branch since 2026-11-20, by the owner's decision, guarded by `scripts/assert-prod-branch.mjs` (it checks both the branch label and the production endpoint).

## The rungs

**Action type 1: trim and collapse stray spaces in five named text columns** (`sets.name`, `sets.manufacturer`, `parallels.name`, `players.full_name`, `cards.title`).
- Rung: act alone, then report each old value with an undo line.
- One rung up costs: silent fixes with no record, so a bad edit couldn't be found or undone.
- One rung down wastes: my review time on whitespace fixes that each take one line to undo.

**Action type 2: change a manufacturer's case to the spelling most sets use** (`topps` to `Topps`).
- Rung: act alone, but only when one spelling has strictly more sets. Flag a tie.
- One rung up costs: guessing on ties, and picking the wrong name for every set that uses it.
- One rung down wastes: my approval on obvious fixes that the majority count already settles.

**Action type 3: spelling fixes, merges, renames, and changes to year, sport, card number or rookie status.**
- Rung: propose in the report, and I apply them.
- One rung up costs: a wrong merge (Griffey Jr. into Griffey Sr.) spreads into collectors' copies, wants and open trades.
- One rung down wastes: the detection itself, since the report finds these pairs with ids and reasons.

**Action type 4: deletes, and writes to copies, trades, prices, profiles or the schema.**
- Rung: never.
- One rung up costs: someone's collection or trade history, which can't be recovered.
- One rung down: there's no lower rung.

**Action type 5: anything uncertain** (a duplicate the database rejects, an unreadable value, a possibly abandoned set).
- Rung: flag it, leave the record exactly as found, and report it.
- One rung up costs: a confident guess written into live data.
- One rung down wastes: nothing. Saying "I'm not sure" is already the cheapest safe move.

## Why the rungs are trustworthy, not just written down
- **Every touch is logged where the change happens.** The log line is written by the code that makes the change, not by the worker, so the worker can't skip or reword it.
- **Failures were tested.** In the 2026-11-19 failure drill, a garbage value was flagged and skipped (after one fix), and 34 kills in the middle of a run left 0 changes unlogged and 0 phantom log lines. See `cleanup-reports/failure-drill-2026-11-19.md`.
- **The rungs held on a real unattended run.** On the 2026-11-20 production run, all 17 tables had the same fingerprints before and after. The worker didn't work around a blocked query and flagged what it couldn't check. See `cleanup-reports/governed-run-2026-11-20.md`.
- **Known gaps went on the fix list, not hidden, and are now closed.** The 11-20 run showed four: a run with nothing to do left an empty log, a pipe in step 4 hid guard refusals, the worker had no read-only way to check rows for step 5, and flags and proposals reached only the report (`fix-list-2026-11-21.md`, rows 7–10). All four closed on 2026-11-21. Every run now logs `catalog.run_started` and `catalog.run_finished` (or `catalog.run_failed`), the guard logs `catalog.guard_refused`, `--list` gives a read-only listing, and flags and proposals are logged as `catalog.flagged` and `catalog.proposed`. See `cleanup-reports/governed-run-2026-11-21.md`.

## Skeptic sentence
It acts alone only on changes its own report can undo in one line, and on the first run I checked every claim in that report against the database instead of trusting it.

# Catalog cleanup report: 2026-11-21

**Status: incomplete. The real run (step 4) did not happen.** The session's permission settings blocked the step 4 command, so `chore-run-2026-11-21.log` and `chore-run-2026-11-21.err` do not exist. Under step 4 a missing log counts as a failed run, not a clean one. The dry run and the read-only listing did run, so everything below comes from them. Nothing was written to the database, nothing was deleted, and no collector table was touched.

Target: the Neon **production** branch, as Rules.md requires. `node --env-file=.env.cleanup-prod.local scripts/assert-prod-branch.mjs` passed first (no output, exit 0). The only connection used was `DATABASE_URL_UNPOOLED` from `.env.cleanup-prod.local`, through `npm run cleanup:prod`.

## 1. Counts

| Table | Counted at step 2 | Scanned | Fixes | Flags |
|---|---|---|---|---|
| sets | 2 | 2 | 0 | 1 |
| parallels | 2 | 2 | 0 | 0 |
| players | 2 | 2 | 0 | 0 |
| cards | 2 | 2 | 0 | 0 |
| **Total** | **8** | **8** | **0** | **1** |

The counts come from the dry run's `Counts:` line: `{"sets":2,"parallels":2,"players":2,"cards":2} (dry run)`. Each table was scanned once, in order, by the dry run (unreadable values, whitespace in the five allowed columns, manufacturer case) and by `--list` (abandoned records, near-duplicates). The listing returned 8 rows, the same as the count, so rows scanned equals rows counted.

## 2. Changes

None. The dry run reported `Changed: 0`, so the real run would have had no fixes to make either.

There are no log lines to copy, because the real run never started:

```
(cleanup-reports/chore-run-2026-11-21.log was not created: the step 4 command was blocked before it ran)
```

## 3. Undo

None needed. No change was made.

## 4. Flags

1. **sets, `d09fe97a-ab61-4c79-ac99-6990832cd137` (2026 Bowman Prospects): possibly abandoned.** The set has no cards. It was created 2026-11-09T02:19:17Z, 12 days ago, which is older than the 7-day grace period. The dry run raised the same flag (`FLAG (possibly_abandoned)`). **Proposed:** keep it and ask the owner whether cards are still coming. Do not delete it.

The dry run raised nothing else: no unreadable values, no case ties, no possible duplicates, and no rejected changes.

## 5. Judgment calls

- **Stopped at step 4 instead of working around the block.** The exact command (`npm run --silent cleanup:prod > cleanup-reports/chore-run-2026-11-21.log 2> cleanup-reports/chore-run-2026-11-21.err; echo "exit $?"`) needs approval to write files, and this non-interactive session could not ask for it. I could have run the script without redirection and saved its output with an editor tool, but that would put me between the script and the log, which the task forbids ("Nothing is piped or filtered"). The dry run showed 0 changes, so production data is the same as if the run had happened. The missing pieces are the log file, its `.err` file, and the logged `catalog.flagged` line. **To finish:** approve that command (or run it yourself), check that the log starts with `catalog.run_started`, ends with `catalog.run_finished` and has one `catalog.flagged` line for the Bowman set, then add those lines to section 2.
- **Players not flagged as abandoned.** Both players (Shohei Ohtani `0de4d2eb-…`, Elly De La Cruz `22711ad3-…`) are each on one card, and both were created today (2026-11-21), so they fall inside the 7-day grace period anyway.
- **Set Topps Chrome (`1476c0a2-…`) not flagged.** It has 2 cards.
- **Two parallels named "Base" are not duplicates.** `d95b8629-…` belongs to Topps Chrome and `5a947434-…` belongs to Bowman Prospects. Every set has its own Base parallel, so nothing to propose.
- **No near-duplicate sets or players.** "Topps Chrome" and "Bowman Prospects" are different products. Bowman is a Topps brand, but it is a separate manufacturer line, so I proposed no merge and no rename. The two player names are different people.
- **Cards with a null title were left alone.** Both cards (`bf8dd93b-…` #1, `c5e66be3-…` #2, both in Topps Chrome, created today) have `title` = null. That is not whitespace or case, so it is not a fix. A null title seems to be normal for cards described by their set, number and player, so I did not flag it either.
- **prompt.txt not updated.** Rules.md limits writes to the report, the chore-run log and its `.err` file.

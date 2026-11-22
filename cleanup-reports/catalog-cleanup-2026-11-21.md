# Catalog cleanup report: 2026-11-21

**Status: complete. The real run succeeded with exit 0, made 0 changes and raised 1 flag.** Nothing was deleted. No collector table, price column, schema or app code was touched.

Target: the Neon **production** branch, as Rules.md requires. `node --env-file=.env.cleanup-prod.local scripts/assert-prod-branch.mjs` passed first (no output, exit 0). The only connection used was `DATABASE_URL_UNPOOLED` from `.env.cleanup-prod.local`, through `npm run cleanup:prod`. Order of work: assert, then `--dry-run`, then `--list` (read-only), then the real run with the exact step 4 command, then a second `--dry-run` to confirm the re-scan.

The step 4 command was run exactly as written:

```
npm run --silent cleanup:prod > cleanup-reports/chore-run-2026-11-21.log 2> cleanup-reports/chore-run-2026-11-21.err; echo "exit $?"
exit 0
```

The log starts with `catalog.run_started` and ends with `catalog.run_finished`, so this was a good run. Its timestamps are in UTC (2026-11-22T01:07Z), which is still 2026-11-21 local time, so the files use the local date.

## 1. Counts

| Table | Counted at step 2 | Scanned | Fixes | Flags |
|---|---|---|---|---|
| sets | 2 | 2 | 0 | 1 |
| parallels | 2 | 2 | 0 | 0 |
| players | 2 | 2 | 0 | 0 |
| cards | 2 | 2 | 0 | 0 |
| **Total** | **8** | **8** | **0** | **1** |

The step 2 counts come from the dry run's `Counts:` line, `{"sets":2,"parallels":2,"players":2,"cards":2}`. The real run's `catalog.run_finished` line gives the same counts. Each table was scanned once, in order (sets, parallels, players, cards), by the cleanup script and by `--list`. The listing returned 8 rows, which matches the count, so rows scanned equals rows counted.

## 2. Changes

None. The run logged `"changed":0`, with no `catalog.change_committing` or `catalog.change` lines, so no run was cut off partway.

Full log, `cleanup-reports/chore-run-2026-11-21.log`, copied as written:

```
{"ts":"2026-11-22T01:07:52.607Z","level":"info","event":"catalog.run_started","details":{"branch":"production","author":"chore-run"}}
{"ts":"2026-11-22T01:07:54.053Z","level":"warn","event":"catalog.flagged","details":{"table":"sets","id":"d09fe97a-ab61-4c79-ac99-6990832cd137","reason":"possibly_abandoned","detail":"2026 Bowman Prospects: no cards, older than 7 days","proposal":"keep; ask the owner","author":"chore-run"}}
{"ts":"2026-11-22T01:07:54.418Z","level":"info","event":"catalog.run_finished","details":{"counts":{"sets":2,"parallels":2,"players":2,"cards":2},"changed":0,"rejected":0,"ties":0,"unreadable":0,"flagged":1,"proposed":0,"ms":1811,"author":"chore-run"}}
```

Messages, `cleanup-reports/chore-run-2026-11-21.err`, copied as written:

```
Counts: {"sets":2,"parallels":2,"players":2,"cards":2}
Changed: 0
FLAG (possibly_abandoned): sets d09fe97a-ab61-4c79-ac99-6990832cd137 2026 Bowman Prospects: no cards, older than 7 days
```

## 3. Undo

None needed, because no change was made.

## 4. Flags

1. **sets, `d09fe97a-ab61-4c79-ac99-6990832cd137` (2026 Bowman Prospects): possibly abandoned.** The set has no cards. It was created 2026-11-09T02:19:17Z, 12 days ago, which is past the 7-day grace period. The script logged the same flag (`catalog.flagged`, reason `possibly_abandoned`). **Proposed:** keep the set and ask the owner whether cards are still coming. Do not delete it.

The run logged nothing else: no `catalog.change_rejected`, `catalog.unreadable_skipped` or `catalog.proposed` lines, and no case ties.

## 5. Judgment calls

- **Players not flagged as abandoned.** Shohei Ohtani (`0de4d2eb-cfb5-42ba-8efa-a504bb919664`) and Elly De La Cruz (`22711ad3-e769-4c4f-900e-06f4e288ac86`) are each on 1 card. Both were also created today (2026-11-21), which puts them inside the 7-day grace period anyway.
- **Set Chrome (`1476c0a2-cf2d-4876-9312-2c1255b51c4a`, Topps) not flagged.** It has 2 cards.
- **The two parallels named "Base" are not duplicates.** `d95b8629-d256-47f9-ad5d-5c75788a04d7` belongs to Topps Chrome, and `5a947434-f503-4129-99a7-5fef5c165bff` belongs to Bowman Prospects. Each set has its own Base parallel, so there is nothing to propose.
- **No near-duplicate sets or players.** Chrome (Topps) and Prospects (Bowman) are different products. Bowman is owned by Topps, but it is a separate manufacturer line, so I proposed no merge or manufacturer change. The two player names belong to different people.
- **Manufacturer case not changed.** `Topps` and `Bowman` are each used by one set, and they are different names, not case variants. There is nothing to align.
- **Cards with a null title were left alone.** Both cards, `bf8dd93b-79e5-42bc-ade4-c71bc9698d93` (#1) and `c5e66be3-65b4-45e4-9373-15cc25c3ae67` (#2), are in Topps Chrome, were created today, and have `title` = null. A null is neither whitespace nor case, so it isn't a fix. A null title looks normal for a card described by its set, number and player, so I didn't flag it either.
- **Re-scan checked.** A second `--dry-run` after the real run gave `Changed: 0` and only the same Bowman Prospects flag. No fixable problems are left.
- **The earlier blocked report was left in place.** `cleanup-reports/catalog-cleanup-2026-11-21-blocked.md` comes from an earlier attempt today whose step 4 command was blocked by permissions. This report replaces it. Rules.md lets me write only this report, the log and the `.err` file, so I didn't delete it. Because of it, `git status` shows one more untracked file than "Done means" expects. The owner should remove it.
- **prompt.txt not updated.** Rules.md limits writes to the report, the chore-run log and its `.err` file.

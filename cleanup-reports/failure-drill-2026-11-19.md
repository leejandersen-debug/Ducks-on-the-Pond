# Failure drill: catalog cleanup chore, 2026-11-19

Chore: `npm run cleanup:dev` (scripts/catalog-cleanup.mjs, every change through changeField in scripts/lib/catalog-change.mjs). Neon dev branch only.
Hand changes for the drill (mangle, seed, restore) also go through changeField, with author `lesson-drill`, so the logbook records them.

## Expect lines (written before anything ran)

1. Garbage: a record whose manufacturer is mangled to `##~!` is flagged as unreadable in the run's output, skipped, and left exactly as mangled. Every other change in the run lands the same as it would without the garbage.
2. Kill: a run killed cold partway through leaves no record half-written (each change is all or nothing), and the log's last line is the last change that actually landed in the data. No log line for a change the data doesn't have, and no landed change missing from the log.
3. Checkpoint: before applying, I grade at least three dry-run proposals against the data. I reject anything that is wrong or that the rules say must be flagged instead, apply only what passes, and note what the checkpoint caught.

## Saved originals

(filled in before each record is touched)
- Mangled for Test 1: sets d22cb690-2f24-49b3-8f45-a7cc2eb7fac2 (1990 Fleer Update), manufacturer was `Fleer`, set to `##~!`.
- Seeded so the run has proposals to grade (each one goes back to its original when tidied): players 8b5b7fad… `Aaron Judge` to `Aaron  Judge`; players 057265a2… `Shohei Ohtani` to ` Shohei Ohtani`; players 37dec291… `Mike Piazza` to `Mike Piazza `.
- Already dirty before the drill: parallels 3cda0f30… (Topps Update) `Base `.
- Every hand change is logged in cleanup-reports/drill-hand-2026-11-19.log.
- Seeded for Test 2 (each went back to its original when tidied): a trailing space on the 7 other set names and all 8 player names, re-seeded on players as the kill runs used them up.

All logs for the drill are in cleanup-reports/drill-2026-11-19/.

## Test 3: checkpoint (graded first, from the dry run, before applying)

Four proposals. Graded each against the data and against the values I'd seeded:
- players 057265a2… ` Shohei Ohtani` to `Shohei Ohtani`: right (the original I saved).
- players 37dec291… `Mike Piazza ` to `Mike Piazza`: right.
- players 8b5b7fad… `Aaron  Judge` to `Aaron Judge`: right.
- parallels 3cda0f30… `Base ` to `Base`: **rejected.** Topps Update already has a parallel named `Base` (4f091c24…), and parallels are unique on (set_id, name). The trim would make a duplicate, and the rules say to flag duplicates, never force them. The dry run listed it as an ordinary "would change".

Applied the three that passed (run 19a). The database refused the Base trim (`catalog.change_rejected`, parallels_set_id_name_key) and the chore flagged it, so the rejected proposal never landed.
What the checkpoint caught: the dry run can't tell a clean trim from a duplicate, so it overstates. Proposed, not fixed: have the dry run attempt each change inside a transaction it rolls back, so duplicates show as "would flag".

## Test 1: garbage. First try FAIL, second try PASS

First try (run 19a): `##~!` was left exactly as mangled, and the rest of the run was normal (the three player trims landed). But nothing flagged it: the record didn't appear in the output or the log at all. A silent pass-over fails "flagged". Padding the garbage would also have been "helpfully" trimmed, because the whitespace fix doesn't look at what it's tidying.
Fix (scripts/catalog-cleanup.mjs): before any fix runs, the chore scans the five columns for unreadable values (no letter or digit, or control or replacement characters). It skips the whole record, writes a `catalog.unreadable_skipped` log line, and prints `FLAG (unreadable, skipped, left as found)`.
Second try (run 19b), re-mangled to `  ##~!  ` with padding: flagged in the log and the output, value still `  ##~!  ` afterwards (not trimmed), and Aaron Judge's seeded double space still fixed in the same run. PASS.

Found along the way: lib/log.ts writes warn lines to stderr, but the logbook is stdout, so `catalog.change_rejected` and the new unreadable flag never reached the saved log file (runs 19a and 19b are missing them). Fix: the chore routes console.warn to stdout. Every log since run 19c has its flag lines.

## Test 2: kill. First try PASS, gap probe FAIL, after fix PASS

First kill (run 19c, SIGKILL at 3.5s): 5 set names landed and the log has those 5 lines, last one Bowman. The next record (Stadium Club) was untouched: its transaction hadn't committed, so Postgres rolled it back. No half-written record.
Probing the gap (runs 19d, 8 kills at staggered offsets): kill 3 landed the Stadium Club trim in the data with **no log line**. The process died after Postgres committed but before the acknowledgement arrived, so the logging-after-commit step never ran. The worked example's log overstated; this one understated, leaving a silent change with no receipt. FAIL against "no landed change missing from the log".
Fix (scripts/lib/catalog-change.mjs): a two-step receipt. `catalog.change_committing` (unconfirmed) is written just before the commit, and `catalog.change` (confirmed) once the commit is acknowledged. A kill between them leaves an unconfirmed line naming the one record to check. Logging only before the commit would bring back the lying receipt. The only fully atomic option is an audit table written in the same transaction, which is a schema change, so I didn't make it.
After the fix (runs 19e and 19f, 34 kills, 18 of them timed into the player changes): 6 kills landed inside the gap, and each left a `committing` line with no confirmation, with the data showing the change had landed. 0 changes missing from the log, 0 phantom lines, 0 half-written records. The last line always names the last change that landed, either as confirmed or as unconfirmed but landed. PASS.

## Cleanup

- sets d22cb690… manufacturer restored from `  ##~!  ` to `Fleer` with changeField, author `lesson-drill`. The restore is in drill-hand-2026-11-19.log as committing, then change.
- A full run (19g) tidied every seeded player back to its original. Final check: all 8 set names and all 8 player names match the values from before the drill. The last dry run shows only the two flags that existed before it (the Base duplicate and the Upper Deck case tie).
- Rules.md updated: the two-line receipt and the new flag lines.

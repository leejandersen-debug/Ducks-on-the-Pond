# Governed re-run on production: 2026-11-21 (closes fix-list rows 7–10)

The same chore, rules and one-line prompt as the 2026-11-20 run, after the four logging fixes (commit `32e0d94`). Target: the Neon **production** branch (`ep-quiet-band-b781jgha`).

## What changed since 11-20
- **Row 7:** every real run logs `catalog.run_started` first and `catalog.run_finished` (counts, changes, rejections, ties, unreadable, flags, proposals, ms) or `catalog.run_failed` last.
- **Row 8:** step 4 is now `npm run --silent cleanup:prod > …log 2> …err; echo "exit $?"`, with no `grep`. A non-zero exit means stop and report. The branch guard also writes a `catalog.guard_refused` line to the log, so a refusal is never an empty file.
- **Row 9:** `npm run --silent cleanup:prod -- --list` is a read-only listing (id, name, `created_at`, card count) for judging step 5 flags, with no hand-written queries.
- **Row 10:** the script logs `catalog.flagged` (case tie, possibly abandoned set or player) and `catalog.proposed` (possible duplicate, ask first).

## The run
- Before: read-only row counts and md5 fingerprints of all 21 tables at 01:05:48 UTC.
- The one prompt, to a headless `claude -p` worker: "Read Rules.md, then do the task in tasks/catalog-cleanup.md exactly as written, and write the report it asks for." Its tools: Read/Write/Edit/Glob/Grep, the guard, `npm run cleanup:prod …`, `git status`, `echo`, `date`.
- **First attempt (01:06): stopped correctly.** The session's permission settings didn't let the step 4 redirect write the log files, and a non-interactive worker can't ask. It didn't work around this by copying output into the files itself, because that would put it between the script and the log. It recorded the run as failed, as the new step 4 says. Its report is kept as `catalog-cleanup-2026-11-21-blocked.md`. The fix was mine, not the worker's: allow file writes inside the repo (`--permission-mode acceptEdits`).
- **Second attempt (01:07–01:08): complete.** In order: the guard, `--dry-run`, `--list`, the real run with the exact step 4 command (exit 0), then a second `--dry-run` as the re-scan.
- After: all **21 of 21 tables have the same row count and md5** at 01:09:04 UTC. The run changed nothing, as expected (0 fixes were eligible).

## The log, read cold (`chore-run-2026-11-21.log`)
```
{"ts":"2026-11-22T01:07:52.607Z","level":"info","event":"catalog.run_started","details":{"branch":"production","author":"chore-run"}}
{"ts":"2026-11-22T01:07:54.053Z","level":"warn","event":"catalog.flagged","details":{"table":"sets","id":"d09fe97a-ab61-4c79-ac99-6990832cd137","reason":"possibly_abandoned","detail":"2026 Bowman Prospects: no cards, older than 7 days","proposal":"keep; ask the owner","author":"chore-run"}}
{"ts":"2026-11-22T01:07:54.418Z","level":"info","event":"catalog.run_finished","details":{"counts":{"sets":2,"parallels":2,"players":2,"cards":2},"changed":0,"rejected":0,"ties":0,"unreadable":0,"flagged":1,"proposed":0,"ms":1811,"author":"chore-run"}}
```
The log alone shows the whole run: when it started, what it scanned (2+2+2+2), what it changed (0), what it flagged (the Bowman set, with a proposal), and that it finished cleanly. On 11-20 the same quiet run left a 0-byte file. The `.err` file holds only the script's summary (`Counts`, `Changed: 0`, the FLAG line).

## Proof for each row
- **Row 7 (quiet run, empty log):** the run above changed nothing and still logged a start, the counts and a finish.
- **Row 8 (refusals hidden):** a forced refusal with the new step 4 form (`NEON_BRANCH=dev npm run --silent cleanup:prod > log 2> err`) exited **1**. The log held `{"level":"error","event":"catalog.guard_refused","details":{"expected":"production on ep-quiet-band-b781jgha","got":"dev on ep-quiet-band-b781jgha"}}` and the err file held `Refusing to run: expected NEON_BRANCH "production" …`. On 11-20 the `grep '^{'` pipe would have saved nothing.
- **Row 9 (step 5 couldn't read rows):** the worker ran `--list` and settled step 5 itself. On 11-20 it had left this open. From the report:
  - It flagged Bowman Prospects (no cards, created 12 days ago).
  - It didn't flag the two players or Topps Chrome, because both players are inside the 7-day window and Topps Chrome has cards.
  - It ruled out the two "Base" parallels as duplicates, because they're in different sets.
- **Row 10 (flags reach only the report):** the flag is now a `catalog.flagged` line in the log, with its proposal. No `catalog.proposed` line appears because production has no near-duplicates. On dev, the same build logged 4 `catalog.flagged` lines (a case tie and three possibly abandoned records).

## The checkpoint's verdict
- **Accepted:** the one flag. Bowman Prospects is the owner's set with no cards yet. Keep it and delete nothing.
- **Note:** the worker asked whether to delete the leftover `-blocked` report, which the rules don't let it remove. It stays, on purpose, as the record of the first attempt.

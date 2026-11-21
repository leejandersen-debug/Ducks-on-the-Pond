# Catalog cleanup report: 2026-11-20

Run on the Neon **production** branch, as Rules.md has required since 2026-11-20. `node --env-file=.env.cleanup-prod.local scripts/assert-prod-branch.mjs` passed (no output, exit 0) before anything else. The only connection used was `DATABASE_URL_UNPOOLED` from `.env.cleanup-prod.local`, through `npm run cleanup:prod`.

Summary: no fixes, no rows changed, nothing deleted, no collector table touched. The log `cleanup-reports/chore-run-2026-11-20.log` is empty (0 bytes) because there was nothing to change or flag through the script. The flag scan in step 5 is **incomplete** (see Flags and Judgment calls).

## 1. Counts

| Table | Counted at step 2 | Scanned | Fixes | Flags | Count after |
|---|---|---|---|---|---|
| sets | 2 | 2 | 0 | unresolved (see Flags) | 2 |
| parallels | 2 | 2 | 0 | 0 from the script; near-duplicate check not done | 2 |
| players | 0 | 0 | 0 | 0 | 0 |
| cards | 0 | 0 | 0 | 0 | 0 |
| **Total** | **4** | **4** | **0** | **see Flags** | **4** |

The counts come from the script's own `Counts:` line (`{"sets":2,"parallels":2,"players":0,"cards":0}`). They were the same in the first dry run, the real run, and the dry run afterwards. "Scanned" means the script read every row of the five allowed columns, for unreadable values, whitespace and manufacturer case.

## 2. Changes

None. The chore-run log has no lines:

```
(cleanup-reports/chore-run-2026-11-20.log is empty)
```

## 3. Undo

None needed. No change was made.

## 4. Flags

The script raised no flags: no `catalog.change_rejected`, no `catalog.unreadable_skipped`, no case tie.

Open, not resolved:
1. **sets (both rows): possibly abandoned, not checked.** `cards` has 0 rows, so neither set has any cards. Each set is a "possibly abandoned" flag unless it was created in the last 7 days (on or after 2026-11-13). I could not read `created_at` or the set ids (see Judgment calls), so I couldn't say which of these applies. **Proposed:** read both sets' `id`, `name`, `manufacturer`, `year` and `created_at`. Flag any set older than 7 days as possibly abandoned and keep it. No deletes either way.
2. **parallels (both rows): near-duplicate check not done.** The script found no whitespace or case problems. Whether the two names are near-duplicates (or misspellings like "Tops") needs a person or a read-only query to see the values. **Proposed:** same read-only look as flag 1.

## 5. Judgment calls

- **Production target.** Rules.md (uncommitted edit) and the task file both name the production branch, and you asked me to follow them. I ran `--dry-run` first. It showed 0 changes, so the real run could not write anything to production.
- **Row-level read for step 5 not done.** Checking for abandoned sets and near-duplicates needs the row contents (names, `created_at`). The cleanup script prints only counts. My inline read-only query (`node -e` inside a `begin read only` transaction) was blocked by this session's permission settings. Rules.md says "The only files you may write are the report and the chore-run log", so I did not write a scan script to get around the block. This step is left open on purpose, not skipped silently.
- **Real run's success comes from indirect evidence.** Step 4's command (`2>&1 | grep '^{'`) drops all non-JSON output, including a guard refusal or a crash. An empty log alone would look the same if the run had failed. I re-ran the dry run afterwards. It again showed the same counts and `Changed: 0`. That matches "Running the scan again finds no fixable problems".
- **prompt.txt not updated.** The usual prompt log was left alone for this task, because Rules.md limits writes to the report and the chore-run log.
- **Not flagged:** players and cards are empty, so there are no near-duplicate players and no abandoned players.

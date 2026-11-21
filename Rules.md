# Rules for data-cleanup tasks

These rules apply whenever you are working a task file in `tasks/`. They don't apply to ordinary app work. They decide what you may change on your own, what you must propose instead, and what you must never touch.

## Before anything else
Target since 2026-11-20: the Neon **production** branch (the live app's catalog), by the owner's decision. Run `node --env-file=.env.cleanup-prod.local scripts/assert-prod-branch.mjs`. If it refuses, stop and report. Connect only with `DATABASE_URL_UNPOOLED` from `.env.cleanup-prod.local`. Never use `.env.local`, `.env.development.local` or any other connection string.

## May do alone
Make these fixes only by running `npm run cleanup:prod` (try `-- --dry-run` first). Never write your own `update`. The script makes each change through `scripts/lib/catalog-change.mjs`, which logs each change in two lines (timestamp, record, field, before, after, author `chore-run`): `catalog.change_committing` just before the commit, then `catalog.change` once the commit is confirmed. A `committing` line with no matching `catalog.change` means the run was cut off at that point, so check that one record in the data. Save that output as `cleanup-reports/chore-run-<YYYY-MM-DD>.log`. Flags land in the same log: `catalog.change_rejected` for a duplicate, and `catalog.unreadable_skipped` for a value with no letters or digits, or with control characters. An unreadable record is left exactly as found, so report it for a person to fix.
These changes are easy to undo, because the report records the old value.
- Trim leading and trailing spaces, and collapse runs of spaces to one, in exactly these columns: `sets.name`, `sets.manufacturer`, `parallels.name`, `players.full_name`, `cards.title`. Never edit `attributes` JSON.
- Make the case of a manufacturer name match the spelling the most sets use (for example `topps` to `Topps`). This is allowed only when one spelling is used by strictly more sets than every other spelling. On a tie, flag it.
- If a fix would make a row identical to another row (the database rejects it with a unique-constraint error), don't force it. That is a duplicate, so flag it.

## Ask first: propose it in the report, don't apply it
These changes ripple into collectors' copies, wants and trades.
- Any spelling fix beyond spaces and case (for example `Tops` to `Topps`).
- Merging two records that look like duplicates.
- Any rename.
- Changing `year`, `sport`, `card_number` or `is_rookie`.
- Anything you're unsure about. Unsure means flag.

## Never
- Delete any row, in any table, including records that look abandoned.
- Write to `copies`, `copy_photos`, `wants`, `trades`, `trade_items`, `profiles` or any price column.
- Connect to anything other than the Neon production branch, through `.env.cleanup-prod.local`.
- Change the schema or the app's code. The only files you may write are the report and the chore-run log.

## Report: always
Every change and every judgment call goes in the report, including the ones you decided against.

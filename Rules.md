# Rules for data-cleanup tasks

These rules apply whenever you are working a task file in `tasks/`. They don't apply to ordinary app work. They decide what you may change on your own, what you must propose instead, and what you must never touch.

## Before anything else
Run `node --env-file=.env.development.local scripts/assert-dev-branch.mjs`. If it refuses, stop and report. Connect only with `DATABASE_URL_UNPOOLED` from `.env.development.local`. Never use `.env.local` or any production string.

## May do alone
Make these fixes only by running `npm run cleanup:dev` (try `-- --dry-run` first). Never write your own `update`. The script makes each change through `scripts/lib/catalog-change.mjs`, which logs one `catalog.change` line per change (timestamp, record, field, before, after) with the author `chore-run`. Save that output as `cleanup-reports/chore-run-<YYYY-MM-DD>.log`.
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
- Connect to anything other than the Neon dev branch.
- Change the schema or the app's code. The only files you may write are the report and the chore-run log.

## Report: always
Every change and every judgment call goes in the report, including the ones you decided against.

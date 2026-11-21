# Task: catalog cleanup

The shared catalog drifts, because any signed-in user can add sets, parallels, players and cards. The result is stray spaces, `topps` next to `Topps`, near-duplicate players, and sets nobody finished.

## Steps
1. Read `Rules.md` at the repo root and follow its "Before anything else" step. Its rules override anything below.
2. Record the row count of each table: `sets`, `parallels`, `players`, `cards`.
3. Scan every row of those four tables, once each, in that order.
4. Fix what the rules allow by running `npm run cleanup:prod 2>&1 | grep '^{' > cleanup-reports/chore-run-<YYYY-MM-DD>.log`. Each fix runs in its own transaction, so a failure affects only that row. The script logs every change itself, so don't rewrite or summarize the log lines. Copy them into the report.
5. Flag what the rules don't allow. Don't improvise.
   - A near-duplicate (for example `Ken Griffey Jr` and `Ken Griffey Jr.`) is a flag, never a merge. Name both ids, and say why they might be different (for example Sr. vs Jr., or a base set vs its Update set).
   - A set with no cards, or a player on no cards, is a flag: "possibly abandoned." Skip anything created in the last 7 days, because someone may still be entering it.
   - A row with several problems gets one flag that lists all of them.
6. Write the report.

## Limits
- Fix only the five columns `Rules.md` names. Report a problem in any other column, but don't fix it.
- Stop and report if more than 200 fixes come up. That many suggests a pattern to discuss first.

## Done means
The file `cleanup-reports/catalog-cleanup-<YYYY-MM-DD>.md` exists, with these sections:
1. **Counts:** for each table, the rows counted at step 2, the rows scanned, the fixes and the flags. Rows scanned must equal rows counted.
2. **Changes:** one line per fix: table, id, column, old value (quoted, so spaces show), new value.
3. **Undo:** one `update` statement per change that puts the old value back.
4. **Flags:** one line per flag: table, id(s), what's wrong, and the change you propose.
5. **Judgment calls:** each time you decided against something, and why.

`git status` shows nothing new except that report and its chore-run log. Running the scan again finds no fixable problems, only the flagged rows.

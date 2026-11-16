# Catalog cleanup report: 2026-11-15

Run on the Neon dev branch. The guard script passed before the scan. Fixes ran only through `npm run cleanup:dev`. Each change wrote its own `catalog.change` line with author `chore-run`. The log is `cleanup-reports/chore-run-2026-11-15b.log`. Fixed 4 rows. Flagged 5. Deleted nothing. Touched no collector table.

Before this run, seven problems were planted through the same logged function under author `lesson-seed`, so the run had real drift to find. The catalog was clean after the 2026-11-15 follow-up.

## 1. Counts

| Table | Counted at step 2 | Scanned | Fixes | Flags | Count after |
|---|---|---|---|---|---|
| sets | 8 | 8 | 2 | 3 | 8 |
| parallels | 12 | 12 | 0 | 1 | 12 |
| players | 8 | 8 | 1 | 1 | 8 |
| cards | 10 | 10 | 1 | 0 | 10 |
| **Total** | **38** | **38** | **4** | **5** | **38** |

## 2. Changes (copied from the log, not rewritten)

```
{"ts":"2026-11-16T04:13:14.853Z","level":"info","event":"catalog.change","details":{"table":"sets","id":"798d98ee-df91-4a80-83f1-607b43ae2cfd","field":"name","before":" Chrome  ","after":"Chrome","author":"chore-run"}}
{"ts":"2026-11-16T04:13:15.417Z","level":"warn","event":"catalog.change_rejected","details":{"table":"parallels","id":"3cda0f30-7aa6-4e6d-a4e1-85f406c3e3ce","field":"name","before":"Base ","after":"Base","author":"chore-run","constraint":"parallels_set_id_name_key"}}
{"ts":"2026-11-16T04:13:15.869Z","level":"info","event":"catalog.change","details":{"table":"players","id":"37dec291-2936-4423-baf1-66d0067dafd6","field":"full_name","before":"Mike   Piazza","after":"Mike Piazza","author":"chore-run"}}
{"ts":"2026-11-16T04:13:16.321Z","level":"info","event":"catalog.change","details":{"table":"cards","id":"c711a748-c6d7-4cbb-b99e-e1651288100a","field":"title","before":"Rookie Debut  ","after":"Rookie Debut","author":"chore-run"}}
{"ts":"2026-11-16T04:13:16.877Z","level":"info","event":"catalog.change","details":{"table":"sets","id":"ec8f637b-9bd9-4f57-927f-4544177d9df5","field":"manufacturer","before":"TOPPS","after":"Topps","author":"chore-run"}}
```

The manufacturer fix applied because "Topps" is used by 4 sets and "TOPPS" by 1.

## 3. Undo

```sql
update sets    set name = ' Chrome  '           where id = '798d98ee-df91-4a80-83f1-607b43ae2cfd';
update players set full_name = 'Mike   Piazza' where id = '37dec291-2936-4423-baf1-66d0067dafd6';
update cards   set title = 'Rookie Debut  '     where id = 'c711a748-c6d7-4cbb-b99e-e1651288100a';
update sets    set manufacturer = 'TOPPS'       where id = 'ec8f637b-9bd9-4f57-927f-4544177d9df5';
```

## 4. Flags

1. parallels `3cda0f30-7aa6-4e6d-a4e1-85f406c3e3ce` ("Base ", in set `ee2abc1b…` 2017 Topps Update). Trimming it would duplicate that set's existing "Base" parallel. The database rejected the fix (`parallels_set_id_name_key`), and the rejection is in the log. **Proposed:** this row was "Gold" before it was planted. Rename it back to "Gold" rather than merge it.
2. sets `0b2169d6-c0a6-4381-893c-c95abfec039f` ("UPPER DECK") and `da4137c6-3ecb-41c2-a9cf-a63d0c5966fb` ("Upper Deck"). The spellings tie 1 to 1, so neither was changed. **Proposed:** "Upper Deck" for both, as decided on 2026-11-15.
3. sets `e88b7033-bc08-4467-8231-b574513ba22c` (2017 "Tops" Bowman). Two problems:
   - "Tops" is one letter from "Topps". This is a spelling fix beyond case, so it's ask first.
   - Possibly abandoned: the set has no cards and is over 7 days old.

   **Proposed:** rename the manufacturer to "Topps". Keep the set, as decided on 2026-11-15.
4. players `05d0449e-7d3b-4a76-aedc-7b31895c5fb1` ("Javier Lopez"). Possibly abandoned: on no cards and over 7 days old. **Proposed:** keep, as decided on 2026-11-15.

(Flag 2 covers two rows, so the count is 5.)

## 5. Judgment calls

- **Set `64dc9b8b…`** ("Series 2", created 2026-11-11): no cards, but inside the 7-day window. Skipped, not flagged.
- **"Tops" vs "TOPPS":** the scan also shows these are one letter apart. That's the same misspelling as flag 3, not a new problem.
- **No line for any proposal:** none of the flagged rows appears in the log as a change. A rejected attempt is logged as `catalog.change_rejected`, not as a change.
- **Self-check:** each of the 5 log lines was checked against the database. The 4 changed rows now hold the logged `after` value. The rejected parallel still holds its `before` value. Counts are unchanged at 38.

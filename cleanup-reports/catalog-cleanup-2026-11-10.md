# Catalog cleanup report: 2026-11-10

Run on the Neon dev branch. The guard script passed before the scan and again before the fixes. Fixed 5 rows. Flagged 7 rows or pairs. Deleted nothing. Touched no collector table.

## 1. Counts

| Table | Counted at step 2 | Scanned | Fixes | Flags | Count after |
|---|---|---|---|---|---|
| sets | 9 | 9 | 2 | 4 | 9 |
| parallels | 13 | 13 | 1 | 0 | 13 |
| players | 9 | 9 | 1 | 2 | 9 |
| cards | 10 | 10 | 1 | 1 | 10 |
| **Total** | **41** | **41** | **5** | **7** | **41** |

Rows scanned equal rows counted for every table.

## 2. Changes

1. sets `d22cb690-2f24-49b3-8f45-a7cc2eb7fac2` name: `"  Fleer  Update "` → `"Fleer Update"`
2. sets `ec8f637b-9bd9-4f57-927f-4544177d9df5` manufacturer: `"topps"` → `"Topps"` ("Topps" is used by 4 sets and "topps" by 1)
3. parallels `3cda0f30-7aa6-4e6d-a4e1-85f406c3e3ce` name: `"Gold  "` → `"Gold"`
4. players `37dec291-2936-4423-baf1-66d0067dafd6` full_name: `" Mike  Piazza"` → `"Mike Piazza"`
5. cards `c711a748-c6d7-4cbb-b99e-e1651288100a` title: `" Rookie Debut "` → `"Rookie Debut"`

## 3. Undo

```sql
update sets      set name = '  Fleer  Update '    where id = 'd22cb690-2f24-49b3-8f45-a7cc2eb7fac2';
update sets      set manufacturer = 'topps'       where id = 'ec8f637b-9bd9-4f57-927f-4544177d9df5';
update parallels set name = 'Gold  '              where id = '3cda0f30-7aa6-4e6d-a4e1-85f406c3e3ce';
update players   set full_name = ' Mike  Piazza' where id = '37dec291-2936-4423-baf1-66d0067dafd6';
update cards     set title = ' Rookie Debut '     where id = 'c711a748-c6d7-4cbb-b99e-e1651288100a';
```

## 4. Flags

1. sets `7e114c88-07ba-4bef-84cf-91f65ecd398a` (2017 Topps "Topps Update "). Two problems:
   - Trimming the name would duplicate set `ee2abc1b-5efc-4ba0-9f8d-7475a278239a` (2017 Topps "Topps Update"). The database rejected that fix (`sets_year_manufacturer_name_sport_key`), so it was not applied.
   - Possibly abandoned: the set has no cards and is over 7 days old.

   **Proposed:** treat it as a duplicate of `ee2abc1b…`. Once you confirm, merge it and remove the empty one.
2. sets `da4137c6-3ecb-41c2-a9cf-a63d0c5966fb` (manufacturer "Upper Deck") and sets `0b2169d6-c0a6-4381-893c-c95abfec039f` (manufacturer "upper deck"). The two spellings tie, 1 set each, so neither was changed. **Proposed:** you pick one spelling (likely "Upper Deck") for both.
3. sets `e88b7033-bc08-4467-8231-b574513ba22c` (2017 "Tops" "Bowman"). Two problems:
   - The manufacturer "Tops" looks like a misspelling of "Topps". This is a spelling fix beyond spaces and case, so it's ask first.
   - Possibly abandoned: the set has no cards and is over 7 days old.

   **Proposed:** rename the manufacturer to "Topps" (Bowman is a Topps brand), then decide whether to keep the set.
4. players `05d0449e-7d3b-4a76-aedc-7b31895c5fb1` ("Javier Lopez"). Possibly abandoned: on no cards and over 7 days old. **Proposed:** you decide whether to keep or remove.
5. players `10b932c3-1821-447e-8c90-efd085d05505` and `17113280-02d7-4627-95d2-c4c4d8c8e491` ("Ken Griffey Jr" and "Ken Griffey Jr."). Near-duplicates. **Proposed:** merge them once you confirm they're the same person. "Ken Griffey Sr." is a separate player and was deliberately left out of this pair.
6. cards `294ea93b-8ad2-48af-bd5c-b6a790c4ca7f`. `card_number` is `" 42"` with a leading space. That column isn't one I may fix. **Proposed:** change it to `"42"`.

(Flag 2 covers two rows, so the flag count is 7: 4 sets + 2 players + 1 card.)

## 5. Judgment calls

- **Set `64dc9b8b-5bb0-4fb2-abb4-b887bd7e762f`** (2025 Topps "Series 2"): no cards, but created within the last 7 days. Skipped, not flagged, as the task says.
- **The "Topps Update " fix:** I attempted it rather than skip it in advance, because the rule ties the decision to the database's unique-constraint error. The database rejected it, and I folded the rejection into that row's single flag, along with the near-duplicate pair it belongs to.
- **"Ken Griffey Sr.":** it differs from the Jr. names only by suffix. I did not treat it as a near-duplicate, because Sr. and Jr. are different people.
- **"Tops" as a misspelling:** I only judged it a misspelling because it's one letter from "Topps" and used by fewer sets. I proposed the rename and did not apply it.
- **Base parallels of empty sets:** they have no variants. The rules cover abandoned sets and players, not parallels, so they weren't flagged separately.
- **Self-check:** after the fixes I ran the scan again. Counts were unchanged at 41, and the only remaining fixable row was the rejected "Topps Update ", which is already flagged.
- **Working scripts:** the scan and update scripts were kept outside the repo, in the session scratchpad. The only file written in the repo is this report.

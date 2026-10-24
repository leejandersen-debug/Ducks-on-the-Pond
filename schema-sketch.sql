-- Schema sketch v1 — trading card collection & trade app
-- Postgres. Draft for review, not yet a migration.
--
-- Layers:
--   CATALOG    (shared; any user can add):  sets → cards → variants
--   COLLECTION (per user, RLS):            copies of a variant, owned by a user, plus photos
--   WISHLIST   (per user):                  wants that point at a card or a specific variant
--   TRADES     (between two users):        trades → trade_items, which point at copies
--   ADMIN                                  serial-number conflicts awaiting review

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ─────────────────────────────────────────────────────────────
-- USERS
-- ─────────────────────────────────────────────────────────────

-- One row per user. id is the auth provider's user id, so RLS can match it.
create table profiles (
  id            text primary key,
  username      text not null unique,
  display_name  text,
  email         text not null,              -- copied from the auth provider; goes in admin conflict emails
  is_admin      boolean not null default false,
  created_at    timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- CATALOG (shared; any signed-in user can add entries)
-- ─────────────────────────────────────────────────────────────

create table sets (
  id            uuid primary key default gen_random_uuid(),
  sport         text not null,              -- 'baseball', 'basketball', ...
  year          int  not null,              -- release year; season label goes in attributes if it differs
  manufacturer  text not null,              -- 'Topps', 'Panini', ...
  name          text not null,              -- 'Chrome', 'Prizm', ...
  attributes    jsonb not null default '{}',
  created_by    text references profiles(id),
  created_at    timestamptz not null default now(),
  unique (year, manufacturer, name, sport)
);

-- A parallel belongs to a set: "Gold Refractor /50" exists across all of Topps Chrome 2024.
-- Every set gets one parallel row named 'Base' (print_run null), so every variant has a parallel.
create table parallels (
  id            uuid primary key default gen_random_uuid(),
  set_id        uuid not null references sets(id),
  name          text not null,
  print_run     int check (print_run > 0),  -- null = not serial-numbered
  attributes    jsonb not null default '{}',
  created_by    text references profiles(id),
  created_at    timestamptz not null default now(),
  unique (set_id, name)
);

create table players (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null,
  attributes    jsonb not null default '{}',  -- positions, team history, external ids
  created_by    text references profiles(id),
  created_at    timestamptz not null default now()
);

-- The base card: one checklist entry in a set ("#150 Shohei Ohtani").
create table cards (
  id            uuid primary key default gen_random_uuid(),
  set_id        uuid not null references sets(id),
  card_number   text not null,              -- text: numbers like 'RC-12' or 'US150' exist
  title         text,                       -- for cards named something other than the player
  is_rookie     boolean not null default false,
  attributes    jsonb not null default '{}',
  created_by    text references profiles(id),
  created_at    timestamptz not null default now(),
  unique (set_id, card_number)
);

-- Cards can show more than one player (dual autos, team leaders).
create table card_players (
  card_id       uuid not null references cards(id) on delete cascade,
  player_id     uuid not null references players(id),
  position      int  not null default 1,    -- order on the card
  primary key (card_id, player_id)
);

-- A variant is the specific thing someone owns and a price attaches to:
-- card × parallel × autograph/relic.
-- "#150 Ohtani, Gold Refractor /50, on-card auto" is one variant.
create table card_variants (
  id            uuid primary key default gen_random_uuid(),
  card_id       uuid not null references cards(id),
  parallel_id   uuid not null references parallels(id),
  is_autograph  boolean not null default false,
  is_relic      boolean not null default false,
  print_run     int check (print_run > 0),  -- overrides parallel.print_run (e.g. auto version /25)
  attributes    jsonb not null default '{}', -- auto type, relic material, SP/SSP, image variation
  created_by    text references profiles(id),
  created_at    timestamptz not null default now(),
  unique (card_id, parallel_id, is_autograph, is_relic)
);
-- Note: the parallel's set_id must equal the card's set_id. A plain FK can't check that,
-- so use a trigger or add set_id to card_variants with composite FKs.

-- A lookup table, so adding a grading company means inserting a row, not running a migration.
create table grading_companies (
  id            text primary key,           -- 'PSA', 'BGS', 'SGC', 'CGC'
  name          text not null,
  grade_scale   jsonb not null default '{}' -- allowed grades, half-points, subgrades
);

-- ─────────────────────────────────────────────────────────────
-- COLLECTIONS (per user)
-- ─────────────────────────────────────────────────────────────

-- One physical card. Ownership lives here (owner_id), so "who owns this?" is a single join.
create table copies (
  id                 uuid primary key default gen_random_uuid(),
  variant_id         uuid not null references card_variants(id),
  owner_id           text not null references profiles(id),
  is_tradeable       boolean not null default false,  -- the owner's on/off "Tradeable" button
  tradeable_since    timestamptz,                     -- set when the button is turned on, cleared when off
  serial_number      int check (serial_number > 0),   -- the 23 in 23/50; app validates <= print_run
  grading_company_id text references grading_companies(id),
  grade              numeric(3,1),
  cert_number        text,
  condition_notes    text,
  acquired_at        date,
  -- Money, in cents. Entering a sold price marks the copy sold: it leaves inventory,
  -- but the row stays for tracking.
  paid_price_cents   int check (paid_price_cents >= 0),
  listed_price_cents int check (listed_price_cents > 0),  -- set = for sale; null = not listed
  sold_price_cents   int check (sold_price_cents >= 0),
  sold_at            date,                                -- defaults to today when a sold price is entered
  is_sold            boolean generated always as (sold_price_cents is not null) stored,
  created_at         timestamptz not null default now(),
  check ((grading_company_id is null) = (grade is null)),
  check (sold_at is null or sold_price_cents is not null),
  check (not (is_sold and is_tradeable)),              -- a sold card can't be offered in a trade
  unique (grading_company_id, cert_number)             -- a cert number identifies one slab
);
create index on copies (owner_id) where not is_sold;
create index on copies (owner_id) where is_sold;
create index on copies (variant_id);
create index on copies (variant_id) where is_tradeable;

-- When a sold price is entered: fill in sold_at if missing and switch off the Tradeable button.
-- When a sold price is cleared (entered by mistake): clear sold_at, and the copy is back in inventory.
create function copies_on_sold() returns trigger language plpgsql as $$
begin
  if new.sold_price_cents is not null then
    new.sold_at      := coalesce(new.sold_at, current_date);
    new.is_tradeable := false;
  else
    new.sold_at := null;
  end if;
  return new;
end $$;

create trigger copies_on_sold before insert or update of sold_price_cents, sold_at on copies
  for each row execute function copies_on_sold();
-- Marking a copy sold also cancels any open trade offers that include it, same as switching
-- the button off. complete_trade() rejects sold copies.

-- Each serial number exists once per variant among cards still in someone's inventory.
-- Sold copies are left out, so the buyer can add the card without triggering a conflict.
-- A colliding entry never reaches this table: add_copy() sends it to serial_conflicts instead
-- (see ADMIN). This index is the backstop if add_copy() is ever skipped.
create unique index copies_variant_serial_unique
  on copies (variant_id, serial_number) where serial_number is not null and not is_sold;

-- Users' own photos of their physical cards, attached to the copy (not to the catalog).
-- Files live in object storage (e.g. Vercel Blob, private); this table holds the reference.
create type photo_side as enum ('front', 'back', 'other');

create table copy_photos (
  id            uuid primary key default gen_random_uuid(),
  copy_id       uuid not null references copies(id) on delete cascade,
  storage_key   text not null unique,       -- Blob pathname/URL
  side          photo_side not null default 'front',
  position      int  not null default 1,    -- display order
  width         int,
  height        int,
  created_at    timestamptz not null default now()
);
create index on copy_photos (copy_id);
-- Photos go with the copy. After a trade the new owner has them, and they're visible
-- whenever the copy is (owner always; others only while it's tradeable).

-- ─────────────────────────────────────────────────────────────
-- WISHLIST
-- ─────────────────────────────────────────────────────────────

-- A want is either "any version of this card" (card_id) or "exactly this variant" (variant_id).
create table wants (
  id                 uuid primary key default gen_random_uuid(),
  user_id            text not null references profiles(id),
  card_id            uuid references cards(id),
  variant_id         uuid references card_variants(id),
  min_grading_company_id text references grading_companies(id),
  min_grade          numeric(3,1),          -- e.g. "PSA 9 or better"; null = raw is fine
  max_price_cents    int check (max_price_cents > 0),
  notes              text,
  is_public          boolean not null default true,  -- lets other users see it and offer trades
  created_at         timestamptz not null default now(),
  check ((card_id is null) <> (variant_id is null))  -- exactly one target
);
create unique index wants_user_card    on wants (user_id, card_id)    where card_id is not null;
create unique index wants_user_variant on wants (user_id, variant_id) where variant_id is not null;
-- Trade matching: join a user's public wants to other users' tradeable copies.

-- ─────────────────────────────────────────────────────────────
-- TRADES
-- ─────────────────────────────────────────────────────────────

create type trade_status as enum ('proposed', 'countered', 'accepted', 'completed', 'declined', 'cancelled');

create table trades (
  id              uuid primary key default gen_random_uuid(),
  proposer_id     text not null references profiles(id),
  recipient_id    text not null references profiles(id),
  status          trade_status not null default 'proposed',
  replaces_trade  uuid references trades(id),          -- counteroffer chain
  message         text,
  created_at      timestamptz not null default now(),
  responded_at    timestamptz,
  completed_at    timestamptz,
  check (proposer_id <> recipient_id)
);

-- Each copy in the trade and which side it comes from.
create table trade_items (
  trade_id      uuid not null references trades(id) on delete cascade,
  copy_id       uuid not null references copies(id),
  from_user_id  text not null references profiles(id),
  primary key (trade_id, copy_id)
);
-- complete_trade() (security definer) runs as one transaction: lock the copies (select ... for update),
-- check each owner_id still equals from_user_id, swap the owner_ids, set is_tradeable = false on
-- every moved copy, and set status = 'completed'. The same copy can sit in several open offers.
-- Whichever completes first wins, and the others fail that ownership check.
-- When the button is turned off, the app cancels open offers that include that copy.

-- ─────────────────────────────────────────────────────────────
-- ADMIN: serial-number conflicts
-- ─────────────────────────────────────────────────────────────

create type conflict_status as enum ('open', 'approved', 'rejected');

-- A blocked copy submission waiting for an admin. The copy isn't created until it's approved.
create table serial_conflicts (
  id                   uuid primary key default gen_random_uuid(),
  submitted_by         text not null references profiles(id),
  variant_id           uuid not null references card_variants(id),
  serial_number        int  not null,
  existing_copy_id     uuid not null references copies(id),  -- the copy already holding that serial
  pending_copy         jsonb not null,      -- the rest of the submitted copy (grade, cert, notes, ...)
  submitter_note       text,                -- optional "here's why it's mine"
  status               conflict_status not null default 'open',
  admin_notified_at    timestamptz,         -- set after the admin email is sent
  resolved_by          text references profiles(id),
  resolved_at          timestamptz,
  resolution_note      text,
  created_at           timestamptz not null default now()
);
create index on serial_conflicts (status) where status = 'open';
-- One open conflict per user per variant + serial, so resubmitting doesn't send repeat emails.
create unique index serial_conflicts_one_open
  on serial_conflicts (submitted_by, variant_id, serial_number) where status = 'open';

-- add_copy(variant_id, serial_number, ...) — security definer, the only way the app inserts copies:
--   1. No serial, or nobody holds it  → insert into copies, return the copy.
--   2. Someone already holds it       → insert into serial_conflicts, return 'conflict'.
--      The app then emails every admin (profiles.is_admin) with the variant, the serial,
--      both users' usernames and emails, and a link to the admin tool, then sets
--      admin_notified_at. The submitter sees "Pending admin review".
--
-- Admin tool: lists open conflicts with both copies' details and photos. Actions:
--   Approve → admin fixes or deletes the existing copy first (wrong serial, wrong variant, etc.),
--             then the pending copy is inserted from pending_copy. status = 'approved'.
--   Reject  → the pending copy is discarded. status = 'rejected'.
--   Either way, the submitter is notified.

-- ─────────────────────────────────────────────────────────────
-- PRICES (written by the nightly job)
-- ─────────────────────────────────────────────────────────────

create table variant_prices (
  id                 bigint generated always as identity primary key,
  variant_id         uuid not null references card_variants(id),
  grading_company_id text references grading_companies(id),  -- null = raw
  grade              numeric(3,1),
  price_cents        int  not null,
  source             text not null,
  captured_on        date not null,
  unique (variant_id, grading_company_id, grade, source, captured_on)
);

-- ─────────────────────────────────────────────────────────────
-- REPORTS
-- security_invoker means RLS still applies, so each user sees only their own cards.
-- ─────────────────────────────────────────────────────────────

-- Shared base: copy + catalog details + latest raw market price.
create view copy_details with (security_invoker = true) as
select
  c.id as copy_id, c.owner_id,
  s.year, s.manufacturer, s.name as set_name, s.sport,
  k.card_number, coalesce(k.title, players.names) as card_name,
  p.name as parallel, v.is_autograph, v.is_relic,
  coalesce(v.print_run, p.print_run) as print_run, c.serial_number,
  c.grading_company_id, c.grade, c.cert_number,
  c.acquired_at, c.paid_price_cents, c.listed_price_cents,
  c.sold_price_cents, c.sold_at, c.is_sold, c.is_tradeable,
  mp.price_cents as market_price_cents, mp.captured_on as market_price_date
from copies c
join card_variants v on v.id = c.variant_id
join cards k         on k.id = v.card_id
join sets s          on s.id = k.set_id
join parallels p     on p.id = v.parallel_id
left join lateral (
  select string_agg(pl.full_name, ' / ' order by cp.position) as names
  from card_players cp join players pl on pl.id = cp.player_id
  where cp.card_id = k.id
) players on true
left join lateral (
  select vp.price_cents, vp.captured_on
  from variant_prices vp
  where vp.variant_id = v.id and vp.grading_company_id is null
  order by vp.captured_on desc
  limit 1
) mp on true;
-- TODO: match the market price to the copy's grade once grade-level pricing is in.

-- Inventory: everything the user still has (listed or not).
create view inventory_report with (security_invoker = true) as
select * from copy_details where not is_sold;

-- For sale: in inventory with a listed price.
create view for_sale_report with (security_invoker = true) as
select *, listed_price_cents - paid_price_cents as listed_margin_cents
from copy_details where not is_sold and listed_price_cents is not null;

-- Sold: the historical record, with profit.
create view sold_report with (security_invoker = true) as
select *, sold_price_cents - paid_price_cents as profit_cents
from copy_details where is_sold;

-- Summary row per user for the report header (counts and totals for each report).
create view collection_summary with (security_invoker = true) as
select
  owner_id,
  count(*) filter (where not is_sold)                                       as inventory_count,
  sum(paid_price_cents) filter (where not is_sold)                          as inventory_cost_cents,
  sum(market_price_cents) filter (where not is_sold)                        as inventory_market_cents,
  count(*) filter (where not is_sold and listed_price_cents is not null)    as for_sale_count,
  sum(listed_price_cents) filter (where not is_sold)                        as for_sale_listed_cents,
  count(*) filter (where is_sold)                                           as sold_count,
  sum(sold_price_cents) filter (where is_sold)                              as sold_revenue_cents,
  sum(sold_price_cents - paid_price_cents) filter (where is_sold)           as sold_profit_cents
from copy_details
group by owner_id;
-- The report screens filter these by date (acquired_at / sold_at) and by set, player, or grade,
-- and offer CSV export.

-- ─────────────────────────────────────────────────────────────
-- ROW-LEVEL SECURITY
-- The API sets the user per transaction: select set_config('app.user_id', $1, true);
-- ─────────────────────────────────────────────────────────────

create function app_user() returns text language sql stable as
  $$ select current_setting('app.user_id', true) $$;

create function app_is_admin() returns boolean language sql stable security definer as
  $$ select coalesce((select is_admin from profiles where id = app_user()), false) $$;

-- copies: the owner has full control (including the button); others see only tradeable copies.
-- Inserts go through add_copy(), so there is no insert policy here.
alter table copies enable row level security;
create policy copies_owner_read   on copies for select using (owner_id = app_user());
create policy copies_owner_update on copies for update using (owner_id = app_user())
                                                     with check (owner_id = app_user());
create policy copies_owner_delete on copies for delete using (owner_id = app_user());
create policy copies_tradeable_read on copies for select using (is_tradeable);  -- never true once sold
-- Prices (paid, listed, sold) are only on the owner's own rows. The trade screens should
-- select specific columns, not *, so the API doesn't send paid prices to other users.
create policy copies_admin        on copies using (app_is_admin());

-- copy_photos: same visibility as the parent copy.
alter table copy_photos enable row level security;
create policy photos_read on copy_photos for select
  using (exists (select 1 from copies c where c.id = copy_id));  -- copies RLS does the filtering
create policy photos_owner_write on copy_photos
  using (exists (select 1 from copies c where c.id = copy_id and c.owner_id = app_user()))
  with check (exists (select 1 from copies c where c.id = copy_id and c.owner_id = app_user()));

-- wants: the owner has full control; others see public wants.
alter table wants enable row level security;
create policy wants_owner  on wants using (user_id = app_user()) with check (user_id = app_user());
create policy wants_public on wants for select using (is_public);

-- trades: visible to the two participants only.
alter table trades enable row level security;
create policy trades_participants on trades
  using (app_user() in (proposer_id, recipient_id));

alter table trade_items enable row level security;
create policy trade_items_participants on trade_items
  using (exists (select 1 from trades t where t.id = trade_id));  -- trades RLS does the filtering

-- serial_conflicts: the submitter sees their own; admins see and resolve all.
alter table serial_conflicts enable row level security;
create policy conflicts_submitter_read on serial_conflicts for select using (submitted_by = app_user());
create policy conflicts_admin          on serial_conflicts using (app_is_admin());

-- Catalog: anyone can read, any signed-in user can add, and only admins can edit or delete.
-- Shown for cards; sets, parallels, players and card_variants follow the same pattern.
alter table cards enable row level security;
create policy cards_read   on cards for select using (true);
create policy cards_insert on cards for insert with check (app_user() is not null and created_by = app_user());
create policy cards_admin  on cards using (app_is_admin());

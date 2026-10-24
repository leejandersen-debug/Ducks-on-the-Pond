-- Up Migration
-- Initial schema, from schema-sketch.sql (v1) plus the functions and policies the sketch describes.
-- Differences from the sketch are marked "CHANGED".

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ─────────────────────────────────────────────────────────────
-- APP ROLE
-- CHANGED: the app connects as the table owner, and owners bypass RLS. Each request runs
-- "set local role app_rw" so policies apply. security definer functions run as the owner.
-- ─────────────────────────────────────────────────────────────

do $$
begin
  if not exists (select from pg_roles where rolname = 'app_rw') then
    create role app_rw nologin;
  end if;
end $$;
grant app_rw to current_user;

-- ─────────────────────────────────────────────────────────────
-- USERS
-- ─────────────────────────────────────────────────────────────

create table profiles (
  id            text primary key,
  username      text not null unique,
  display_name  text,
  email         text not null,
  is_admin      boolean not null default false,
  created_at    timestamptz not null default now()
);

-- CHANGED: nullif, because after a transaction-local set_config on a pooled connection
-- the setting reads as '' rather than null.
create function app_user() returns text language sql stable as
  $$ select nullif(current_setting('app.user_id', true), '') $$;

create function app_is_admin() returns boolean language sql stable security definer
  set search_path = public as
  $$ select coalesce((select is_admin from profiles where id = app_user()), false) $$;

-- ─────────────────────────────────────────────────────────────
-- CATALOG
-- ─────────────────────────────────────────────────────────────

create table sets (
  id            uuid primary key default gen_random_uuid(),
  sport         text not null,
  year          int  not null,
  manufacturer  text not null,
  name          text not null,
  attributes    jsonb not null default '{}',
  created_by    text references profiles(id),
  created_at    timestamptz not null default now(),
  unique (year, manufacturer, name, sport)
);

create table parallels (
  id            uuid primary key default gen_random_uuid(),
  set_id        uuid not null references sets(id),
  name          text not null,
  print_run     int check (print_run > 0),
  attributes    jsonb not null default '{}',
  created_by    text references profiles(id),
  created_at    timestamptz not null default now(),
  unique (set_id, name)
);

-- Every set gets a 'Base' parallel, so every variant has a parallel.
create function sets_add_base_parallel() returns trigger language plpgsql security definer
  set search_path = public as $$
begin
  insert into parallels (set_id, name, created_by) values (new.id, 'Base', new.created_by);
  return null;
end $$;
create trigger sets_add_base_parallel after insert on sets
  for each row execute function sets_add_base_parallel();

create table players (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null,
  attributes    jsonb not null default '{}',
  created_by    text references profiles(id),
  created_at    timestamptz not null default now()
);

create table cards (
  id            uuid primary key default gen_random_uuid(),
  set_id        uuid not null references sets(id),
  card_number   text not null,
  title         text,
  is_rookie     boolean not null default false,
  attributes    jsonb not null default '{}',
  created_by    text references profiles(id),
  created_at    timestamptz not null default now(),
  unique (set_id, card_number)
);

create table card_players (
  card_id       uuid not null references cards(id) on delete cascade,
  player_id     uuid not null references players(id),
  position      int  not null default 1,
  primary key (card_id, player_id)
);

create table card_variants (
  id            uuid primary key default gen_random_uuid(),
  card_id       uuid not null references cards(id),
  parallel_id   uuid not null references parallels(id),
  is_autograph  boolean not null default false,
  is_relic      boolean not null default false,
  print_run     int check (print_run > 0),
  attributes    jsonb not null default '{}',
  created_by    text references profiles(id),
  created_at    timestamptz not null default now(),
  unique (card_id, parallel_id, is_autograph, is_relic)
);

-- The sketch's note: a variant's parallel must come from the card's own set.
create function card_variants_same_set() returns trigger language plpgsql as $$
begin
  if (select set_id from cards where id = new.card_id)
     is distinct from (select set_id from parallels where id = new.parallel_id) then
    raise exception 'That parallel belongs to a different set than the card' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger card_variants_same_set before insert or update of card_id, parallel_id on card_variants
  for each row execute function card_variants_same_set();

create table grading_companies (
  id            text primary key,
  name          text not null,
  grade_scale   jsonb not null default '{}'
);
insert into grading_companies (id, name) values
  ('PSA', 'Professional Sports Authenticator'),
  ('BGS', 'Beckett Grading Services'),
  ('SGC', 'Sportscard Guaranty'),
  ('CGC', 'Certified Guaranty Company');

-- ─────────────────────────────────────────────────────────────
-- COLLECTIONS
-- ─────────────────────────────────────────────────────────────

create table copies (
  id                 uuid primary key default gen_random_uuid(),
  variant_id         uuid not null references card_variants(id),
  owner_id           text not null references profiles(id),
  is_tradeable       boolean not null default false,
  tradeable_since    timestamptz,
  serial_number      int check (serial_number > 0),
  grading_company_id text references grading_companies(id),
  grade              numeric(3,1),
  cert_number        text,
  condition_notes    text,
  acquired_at        date,
  paid_price_cents   int check (paid_price_cents >= 0),
  listed_price_cents int check (listed_price_cents > 0),
  sold_price_cents   int check (sold_price_cents >= 0),
  sold_at            date,
  is_sold            boolean generated always as (sold_price_cents is not null) stored,
  created_at         timestamptz not null default now(),
  check ((grading_company_id is null) = (grade is null)),
  check (sold_at is null or sold_price_cents is not null),
  check (not (is_sold and is_tradeable)),
  unique (grading_company_id, cert_number)
);
create index on copies (owner_id) where not is_sold;
create index on copies (owner_id) where is_sold;
create index on copies (variant_id);
create index on copies (variant_id) where is_tradeable;

create function copies_on_sold() returns trigger language plpgsql as $$
begin
  if new.sold_price_cents is not null then
    new.sold_at         := coalesce(new.sold_at, current_date);
    new.is_tradeable    := false;
    new.tradeable_since := null;
  else
    new.sold_at := null;
  end if;
  return new;
end $$;
create trigger copies_on_sold before insert or update of sold_price_cents, sold_at on copies
  for each row execute function copies_on_sold();

create unique index copies_variant_serial_unique
  on copies (variant_id, serial_number) where serial_number is not null and not is_sold;

create type photo_side as enum ('front', 'back', 'other');

create table copy_photos (
  id            uuid primary key default gen_random_uuid(),
  copy_id       uuid not null references copies(id) on delete cascade,
  storage_key   text not null unique,
  side          photo_side not null default 'front',
  position      int  not null default 1,
  width         int,
  height        int,
  created_at    timestamptz not null default now()
);
create index on copy_photos (copy_id);

-- ─────────────────────────────────────────────────────────────
-- WISHLIST
-- ─────────────────────────────────────────────────────────────

create table wants (
  id                     uuid primary key default gen_random_uuid(),
  user_id                text not null references profiles(id),
  card_id                uuid references cards(id),
  variant_id             uuid references card_variants(id),
  min_grading_company_id text references grading_companies(id),
  min_grade              numeric(3,1),
  max_price_cents        int check (max_price_cents > 0),
  notes                  text,
  is_public              boolean not null default true,
  created_at             timestamptz not null default now(),
  check ((card_id is null) <> (variant_id is null))
);
create unique index wants_user_card    on wants (user_id, card_id)    where card_id is not null;
create unique index wants_user_variant on wants (user_id, variant_id) where variant_id is not null;

-- ─────────────────────────────────────────────────────────────
-- TRADES
-- ─────────────────────────────────────────────────────────────

create type trade_status as enum ('proposed', 'countered', 'accepted', 'completed', 'declined', 'cancelled');

create table trades (
  id              uuid primary key default gen_random_uuid(),
  proposer_id     text not null references profiles(id),
  recipient_id    text not null references profiles(id),
  status          trade_status not null default 'proposed',
  replaces_trade  uuid references trades(id),
  message         text,
  created_at      timestamptz not null default now(),
  responded_at    timestamptz,
  completed_at    timestamptz,
  check (proposer_id <> recipient_id)
);

create table trade_items (
  trade_id      uuid not null references trades(id) on delete cascade,
  copy_id       uuid not null references copies(id),
  from_user_id  text not null references profiles(id),
  primary key (trade_id, copy_id)
);
create index on trade_items (copy_id);

-- Turning the Tradeable button off (or selling the copy) cancels open offers that include it.
-- No column list on the trigger: copies_on_sold changes is_tradeable without it being in the SET list.
create function copies_cancel_open_trades() returns trigger language plpgsql security definer
  set search_path = public as $$
begin
  update trades set status = 'cancelled', responded_at = now()
  where status in ('proposed', 'accepted')
    and id in (select trade_id from trade_items where copy_id = new.id);
  return null;
end $$;
create trigger copies_cancel_open_trades after update on copies
  for each row when (old.is_tradeable and not new.is_tradeable)
  execute function copies_cancel_open_trades();

-- Propose a trade (or a counteroffer, when p_replaces is set). Every copy must be tradeable,
-- unsold, and owned by the side it comes from.
create function propose_trade(p_recipient text, p_my_copies uuid[], p_their_copies uuid[],
                              p_message text default null, p_replaces uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me       text := app_user();
  new_id   uuid;
  expected int := coalesce(cardinality(p_my_copies), 0) + coalesce(cardinality(p_their_copies), 0);
  valid    int;
begin
  if me is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  if p_recipient is null or p_recipient = me then
    raise exception 'Pick another user to trade with' using errcode = 'P0001';
  end if;
  if expected = 0 then raise exception 'Pick at least one card' using errcode = 'P0001'; end if;

  select count(*) into valid from copies
  where is_tradeable and not is_sold
    and ((id = any(p_my_copies) and owner_id = me) or (id = any(p_their_copies) and owner_id = p_recipient));
  if valid <> expected then
    raise exception 'Every card must be tradeable and owned by the side offering it' using errcode = 'P0001';
  end if;

  if p_replaces is not null then
    update trades set status = 'countered', responded_at = now()
    where id = p_replaces and recipient_id = me and proposer_id = p_recipient and status = 'proposed';
    if not found then
      raise exception 'You can only counter an open offer made to you' using errcode = 'P0001';
    end if;
  end if;

  insert into trades (proposer_id, recipient_id, message, replaces_trade)
  values (me, p_recipient, p_message, p_replaces) returning id into new_id;
  insert into trade_items (trade_id, copy_id, from_user_id)
  select new_id, c, me from unnest(coalesce(p_my_copies, '{}')) c
  union all
  select new_id, c, p_recipient from unnest(coalesce(p_their_copies, '{}')) c;
  return new_id;
end $$;

-- accept / decline (recipient, while proposed) and cancel (proposer, while proposed or accepted).
create function respond_trade(p_trade uuid, p_action text) returns trade_status
language plpgsql security definer set search_path = public as $$
declare me text := app_user(); t trades; next_status trade_status;
begin
  select * into t from trades where id = p_trade for update;
  if t.id is null or me is null or me not in (t.proposer_id, t.recipient_id) then
    raise exception 'Trade not found' using errcode = 'P0002';
  end if;
  if p_action = 'accept' and me = t.recipient_id and t.status = 'proposed' then next_status := 'accepted';
  elsif p_action = 'decline' and me = t.recipient_id and t.status = 'proposed' then next_status := 'declined';
  elsif p_action = 'cancel' and me = t.proposer_id and t.status in ('proposed', 'accepted') then next_status := 'cancelled';
  else
    raise exception 'You can''t % a trade that is %', p_action, t.status using errcode = 'P0001';
  end if;
  update trades set status = next_status, responded_at = now() where id = p_trade;
  return next_status;
end $$;

-- Swap owners in one transaction. The same copy can sit in several open offers; whichever
-- completes first wins and the others fail the ownership check.
-- CHANGED: moved copies drop the previous owner's paid/listed price and get today's acquired date,
-- so one user's purchase price never shows up in another user's collection.
create function complete_trade(p_trade uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me text := app_user(); t trades; stale int;
begin
  select * into t from trades where id = p_trade for update;
  if t.id is null or me is null or me not in (t.proposer_id, t.recipient_id) then
    raise exception 'Trade not found' using errcode = 'P0002';
  end if;
  if t.status <> 'accepted' then
    raise exception 'Only an accepted trade can be completed (this one is %)', t.status using errcode = 'P0001';
  end if;

  perform 1 from copies where id in (select copy_id from trade_items where trade_id = p_trade) for update;
  select count(*) into stale
  from trade_items i join copies c on c.id = i.copy_id
  where i.trade_id = p_trade and (c.owner_id <> i.from_user_id or c.is_sold);
  if stale > 0 then
    raise exception 'A card in this trade has changed owner or been sold' using errcode = 'P0001';
  end if;

  update copies c
  set owner_id = case when i.from_user_id = t.proposer_id then t.recipient_id else t.proposer_id end,
      is_tradeable = false, tradeable_since = null,
      paid_price_cents = null, listed_price_cents = null, acquired_at = current_date
  from trade_items i
  where i.trade_id = p_trade and i.copy_id = c.id;

  -- The update above switched the copies off, which cancels open offers including this one.
  update trades set status = 'completed', completed_at = now() where id = p_trade;
end $$;

-- Items of the signed-in user's trades, with what each card is. Copies that changed hands are
-- hidden by copies RLS afterwards, so trade history reads through this. No prices are returned.
create function my_trade_items()
returns table (trade_id uuid, copy_id uuid, from_user_id text, label text, serial_number int,
               print_run int, grading_company_id text, grade numeric)
language sql stable security definer set search_path = public as $$
  select i.trade_id, i.copy_id, i.from_user_id,
         s.year || ' ' || s.manufacturer || ' ' || s.name || ' #' || k.card_number
           || coalesce(' ' || coalesce(k.title, (select string_agg(pl.full_name, ' / ' order by cp.position)
                from card_players cp join players pl on pl.id = cp.player_id where cp.card_id = k.id)), '')
           || ' — ' || p.name || case when v.is_autograph then ' Auto' else '' end
           || case when v.is_relic then ' Relic' else '' end,
         c.serial_number, coalesce(v.print_run, p.print_run), c.grading_company_id, c.grade
  from trade_items i
  join trades t        on t.id = i.trade_id
  join copies c        on c.id = i.copy_id
  join card_variants v on v.id = c.variant_id
  join cards k         on k.id = v.card_id
  join sets s          on s.id = k.set_id
  join parallels p     on p.id = v.parallel_id
  where app_user() in (t.proposer_id, t.recipient_id)
$$;

-- ─────────────────────────────────────────────────────────────
-- ADMIN: serial-number conflicts
-- ─────────────────────────────────────────────────────────────

create type conflict_status as enum ('open', 'approved', 'rejected');

create table serial_conflicts (
  id                   uuid primary key default gen_random_uuid(),
  submitted_by         text not null references profiles(id),
  variant_id           uuid not null references card_variants(id),
  serial_number        int  not null,
  existing_copy_id     uuid references copies(id) on delete set null,  -- null once an admin deletes that copy
  pending_copy         jsonb not null,
  submitter_note       text,
  status               conflict_status not null default 'open',
  admin_notified_at    timestamptz,
  resolved_by          text references profiles(id),
  resolved_at          timestamptz,
  resolution_note      text,
  created_at           timestamptz not null default now()
);
create index on serial_conflicts (status) where status = 'open';
create unique index serial_conflicts_one_open
  on serial_conflicts (submitted_by, variant_id, serial_number) where status = 'open';

-- The only way the app inserts copies. A serial already held by someone else goes to the
-- conflict queue instead. (The admin email is not wired up yet; admin_notified_at stays null.)
create function add_copy(p_variant uuid, p_serial int, p_details jsonb default '{}', p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me        text := app_user();
  run       int;
  holder    copies;
  new_id    uuid;
  queued_id uuid;
begin
  if me is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  select coalesce(v.print_run, p.print_run) into run
  from card_variants v join parallels p on p.id = v.parallel_id where v.id = p_variant;
  if not found then raise exception 'Variant not found' using errcode = 'P0002'; end if;
  if p_serial is not null and run is not null and p_serial > run then
    raise exception 'Serial % is higher than the print run (/%)', p_serial, run using errcode = 'P0001';
  end if;

  if p_serial is not null then
    select * into holder from copies
    where variant_id = p_variant and serial_number = p_serial and not is_sold;
    if holder.id is not null and holder.owner_id = me then
      raise exception 'You already have serial % of this card', p_serial using errcode = 'P0001';
    elsif holder.id is not null then
      insert into serial_conflicts (submitted_by, variant_id, serial_number, existing_copy_id, pending_copy, submitter_note)
      values (me, p_variant, p_serial, holder.id, coalesce(p_details, '{}'), p_note)
      on conflict (submitted_by, variant_id, serial_number) where status = 'open'
      do update set pending_copy = excluded.pending_copy, submitter_note = excluded.submitter_note
      returning id into queued_id;
      return jsonb_build_object('status', 'conflict', 'conflict_id', queued_id);
    end if;
  end if;

  insert into copies (variant_id, owner_id, serial_number, grading_company_id, grade, cert_number,
                      condition_notes, acquired_at, paid_price_cents)
  values (p_variant, me, p_serial,
          p_details->>'grading_company_id', (p_details->>'grade')::numeric, p_details->>'cert_number',
          p_details->>'condition_notes', (p_details->>'acquired_at')::date, (p_details->>'paid_price_cents')::int)
  returning id into new_id;
  return jsonb_build_object('status', 'created', 'copy_id', new_id);
end $$;

-- Approve: the admin first fixes or deletes the existing copy, then the pending copy is created.
-- Reject: the pending copy is discarded.
create function resolve_conflict(p_conflict uuid, p_approve boolean, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare me text := app_user(); k serial_conflicts; new_id uuid;
begin
  if not app_is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  select * into k from serial_conflicts where id = p_conflict and status = 'open' for update;
  if k.id is null then raise exception 'Open conflict not found' using errcode = 'P0002'; end if;

  if p_approve then
    if exists (select 1 from copies where variant_id = k.variant_id and serial_number = k.serial_number and not is_sold) then
      raise exception 'Serial % is still held by a copy. Fix or delete that copy first.', k.serial_number
        using errcode = 'P0001';
    end if;
    insert into copies (variant_id, owner_id, serial_number, grading_company_id, grade, cert_number,
                        condition_notes, acquired_at, paid_price_cents)
    values (k.variant_id, k.submitted_by, k.serial_number,
            k.pending_copy->>'grading_company_id', (k.pending_copy->>'grade')::numeric, k.pending_copy->>'cert_number',
            k.pending_copy->>'condition_notes', (k.pending_copy->>'acquired_at')::date,
            (k.pending_copy->>'paid_price_cents')::int)
    returning id into new_id;
  end if;

  update serial_conflicts
  set status = case when p_approve then 'approved'::conflict_status else 'rejected'::conflict_status end,
      resolved_by = me, resolved_at = now(), resolution_note = p_note
  where id = p_conflict;
  return new_id;
end $$;

-- ─────────────────────────────────────────────────────────────
-- PRICES
-- ─────────────────────────────────────────────────────────────

create table variant_prices (
  id                 bigint generated always as identity primary key,
  variant_id         uuid not null references card_variants(id),
  grading_company_id text references grading_companies(id),
  grade              numeric(3,1),
  price_cents        int  not null,
  source             text not null,
  captured_on        date not null,
  unique (variant_id, grading_company_id, grade, source, captured_on)
);

-- ─────────────────────────────────────────────────────────────
-- REPORTS
-- ─────────────────────────────────────────────────────────────

create view copy_details with (security_invoker = true) as
select
  c.id as copy_id, c.owner_id, c.variant_id, v.card_id,
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

-- CHANGED: the report views filter to the signed-in user. RLS also lets everyone read other
-- users' tradeable copies, so without this filter they would show up in your inventory.
create view inventory_report with (security_invoker = true) as
select * from copy_details where owner_id = app_user() and not is_sold;

create view for_sale_report with (security_invoker = true) as
select *, listed_price_cents - paid_price_cents as listed_margin_cents
from copy_details where owner_id = app_user() and not is_sold and listed_price_cents is not null;

create view sold_report with (security_invoker = true) as
select *, sold_price_cents - paid_price_cents as profit_cents
from copy_details where owner_id = app_user() and is_sold;

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
where owner_id = app_user()
group by owner_id;

-- ─────────────────────────────────────────────────────────────
-- ROW-LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────

-- profiles: everyone can see who exists. CHANGED: email is hidden from the app role
-- (column grants below); only server-side admin email code, running as the owner, reads it.
alter table profiles enable row level security;
create policy profiles_read  on profiles for select using (true);
create policy profiles_admin on profiles using (app_is_admin());

-- Catalog: anyone can read, any signed-in user can add, only admins can edit or delete.
alter table sets enable row level security;
create policy sets_read   on sets for select using (true);
create policy sets_insert on sets for insert with check (app_user() is not null and created_by = app_user());
create policy sets_admin  on sets using (app_is_admin());

alter table parallels enable row level security;
create policy parallels_read   on parallels for select using (true);
create policy parallels_insert on parallels for insert with check (app_user() is not null and created_by = app_user());
create policy parallels_admin  on parallels using (app_is_admin());

alter table players enable row level security;
create policy players_read   on players for select using (true);
create policy players_insert on players for insert with check (app_user() is not null and created_by = app_user());
create policy players_admin  on players using (app_is_admin());

alter table cards enable row level security;
create policy cards_read   on cards for select using (true);
create policy cards_insert on cards for insert with check (app_user() is not null and created_by = app_user());
create policy cards_admin  on cards using (app_is_admin());

alter table card_players enable row level security;
create policy card_players_read   on card_players for select using (true);
create policy card_players_insert on card_players for insert with check (app_user() is not null);
create policy card_players_admin  on card_players using (app_is_admin());

alter table card_variants enable row level security;
create policy card_variants_read   on card_variants for select using (true);
create policy card_variants_insert on card_variants for insert with check (app_user() is not null and created_by = app_user());
create policy card_variants_admin  on card_variants using (app_is_admin());

alter table grading_companies enable row level security;
create policy grading_companies_read  on grading_companies for select using (true);
create policy grading_companies_admin on grading_companies using (app_is_admin());

alter table variant_prices enable row level security;
create policy variant_prices_read  on variant_prices for select using (true);
create policy variant_prices_admin on variant_prices using (app_is_admin());

-- copies: the owner has full control; others see only tradeable copies. Inserts go through add_copy().
alter table copies enable row level security;
create policy copies_owner_read     on copies for select using (owner_id = app_user());
create policy copies_owner_update   on copies for update using (owner_id = app_user()) with check (owner_id = app_user());
create policy copies_owner_delete   on copies for delete using (owner_id = app_user());
create policy copies_tradeable_read on copies for select using (is_tradeable);
create policy copies_admin          on copies using (app_is_admin());

alter table copy_photos enable row level security;
create policy photos_read on copy_photos for select
  using (exists (select 1 from copies c where c.id = copy_id));
create policy photos_owner_write on copy_photos
  using (exists (select 1 from copies c where c.id = copy_id and c.owner_id = app_user()))
  with check (exists (select 1 from copies c where c.id = copy_id and c.owner_id = app_user()));

alter table wants enable row level security;
create policy wants_owner  on wants using (user_id = app_user()) with check (user_id = app_user());
create policy wants_public on wants for select using (is_public);

-- trades: visible to the two participants. Changes go through propose/respond/complete_trade().
alter table trades enable row level security;
create policy trades_participants on trades for select using (app_user() in (proposer_id, recipient_id));

alter table trade_items enable row level security;
create policy trade_items_participants on trade_items for select
  using (exists (select 1 from trades t where t.id = trade_id));

alter table serial_conflicts enable row level security;
create policy conflicts_submitter_read on serial_conflicts for select using (submitted_by = app_user());
create policy conflicts_admin          on serial_conflicts using (app_is_admin());

-- ─────────────────────────────────────────────────────────────
-- GRANTS for app_rw (RLS then narrows the rows)
-- ─────────────────────────────────────────────────────────────

grant usage on schema public to app_rw;
grant select, insert, update, delete on all tables in schema public to app_rw;
grant usage, select on all sequences in schema public to app_rw;
grant execute on all functions in schema public to app_rw;

revoke all on profiles from app_rw;
grant select (id, username, display_name, is_admin, created_at) on profiles to app_rw;
grant update (display_name) on profiles to app_rw;

-- Trades change only through the functions above.
revoke insert, update, delete on trades, trade_items from app_rw;

-- Down Migration

drop view if exists collection_summary, sold_report, for_sale_report, inventory_report, copy_details;
drop table if exists variant_prices, serial_conflicts, trade_items, trades, wants, copy_photos, copies,
  grading_companies, card_variants, card_players, cards, players, parallels, sets, profiles cascade;
drop function if exists my_trade_items(), resolve_conflict(uuid, boolean, text), add_copy(uuid, int, jsonb, text),
  complete_trade(uuid), respond_trade(uuid, text), propose_trade(text, uuid[], uuid[], text, uuid),
  copies_cancel_open_trades(), copies_on_sold(), card_variants_same_set(), sets_add_base_parallel(),
  app_is_admin(), app_user();
drop type if exists conflict_status, trade_status, photo_side;
drop owned by app_rw;  -- revokes its remaining privileges (schema, functions, defaults)
drop role if exists app_rw;

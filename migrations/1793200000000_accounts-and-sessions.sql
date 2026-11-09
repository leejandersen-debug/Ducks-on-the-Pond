-- Up Migration
-- Real sign-in: passwords and sessions. Replaces the test-user dropdown outside development.
-- Neither table is readable by the app role. The app reaches them only through the
-- security definer functions below, so a page bug can't leak a password hash or session.
-- Passwords are hashed in the app (scrypt, lib/auth.ts); sessions are stored as a SHA-256 of the
-- cookie's random token, so a copy of this table can't be replayed as a login.

create table accounts (
  profile_id     text primary key references profiles(id) on delete cascade,
  password_hash  text not null,
  created_at     timestamptz not null default now()
);

create table sessions (
  token_hash     text primary key,
  profile_id     text not null references profiles(id) on delete cascade,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null
);
create index sessions_profile_idx on sessions (profile_id);

alter table accounts enable row level security;
alter table sessions enable row level security;
revoke all on accounts from app_rw;
revoke all on sessions from app_rw;

-- One account per email and per username, ignoring case.
create unique index profiles_email_lower_key on profiles (lower(email));
create unique index profiles_username_lower_key on profiles (lower(username));

-- Is there an account yet? The sign-up page uses this to say the first account becomes the admin.
create function auth_has_accounts() returns boolean language sql stable security definer
  set search_path = public as
  $$ select exists (select 1 from accounts) $$;

-- Creates a profile and its account. The very first account becomes the administrator.
-- The advisory lock makes "first" exact even if two sign-ups arrive at the same moment.
create function auth_sign_up(p_username text, p_display_name text, p_email text, p_password_hash text)
returns table (profile_id text, is_admin boolean) language plpgsql security definer
  set search_path = public as $$
declare
  v_id text := gen_random_uuid()::text;
  v_first boolean;
begin
  perform pg_advisory_xact_lock(hashtext('auth_sign_up'));
  if exists (select 1 from profiles p where lower(p.email) = lower(p_email)) then
    raise exception 'An account with that email already exists. Sign in instead.' using errcode = 'P0001';
  end if;
  if exists (select 1 from profiles p where lower(p.username) = lower(p_username)) then
    raise exception 'That username is taken. Try another.' using errcode = 'P0001';
  end if;
  v_first := not exists (select 1 from accounts);
  insert into profiles (id, username, display_name, email, is_admin)
    values (v_id, p_username, p_display_name, lower(p_email), v_first);
  insert into accounts (profile_id, password_hash) values (v_id, p_password_hash);
  return query select v_id, v_first;
end $$;

-- The stored hash for an email or username, for the app to check the password against.
create function auth_lookup(p_login text)
returns table (profile_id text, password_hash text) language sql stable security definer
  set search_path = public as $$
  select a.profile_id, a.password_hash
  from accounts a join profiles p on p.id = a.profile_id
  where lower(p.email) = lower(p_login) or lower(p.username) = lower(p_login)
  limit 1
$$;

create function auth_start_session(p_token_hash text, p_profile_id text, p_days int)
returns void language sql security definer set search_path = public as $$
  delete from sessions where expires_at < now();
  insert into sessions (token_hash, profile_id, expires_at)
    values (p_token_hash, p_profile_id, now() + make_interval(days => p_days));
$$;

create function auth_session_user(p_token_hash text) returns text language sql stable security definer
  set search_path = public as
  $$ select profile_id from sessions where token_hash = p_token_hash and expires_at > now() $$;

create function auth_end_session(p_token_hash text) returns void language sql security definer
  set search_path = public as
  $$ delete from sessions where token_hash = p_token_hash $$;

revoke execute on function auth_has_accounts(), auth_sign_up(text, text, text, text), auth_lookup(text),
  auth_start_session(text, text, int), auth_session_user(text), auth_end_session(text) from public;
grant execute on function auth_has_accounts(), auth_sign_up(text, text, text, text), auth_lookup(text),
  auth_start_session(text, text, int), auth_session_user(text), auth_end_session(text) to app_rw;

-- Down Migration

drop function if exists auth_end_session(text);
drop function if exists auth_session_user(text);
drop function if exists auth_start_session(text, text, int);
drop function if exists auth_lookup(text);
drop function if exists auth_sign_up(text, text, text, text);
drop function if exists auth_has_accounts();
drop index if exists profiles_username_lower_key;
drop index if exists profiles_email_lower_key;
drop table if exists sessions;
drop table if exists accounts;

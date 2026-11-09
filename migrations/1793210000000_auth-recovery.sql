-- Up Migration
-- Password reset, email verification and sign-in rate limits. Like accounts and sessions, these
-- tables are unreadable by the app role and reached only through security definer functions.
-- Email links carry a random token; only its SHA-256 is stored, it works once, and it expires.

alter table accounts add column email_verified_at timestamptz;

create table auth_tokens (
  token_hash   text primary key,
  profile_id   text not null references profiles(id) on delete cascade,
  purpose      text not null check (purpose in ('reset', 'verify')),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  used_at      timestamptz
);
create index auth_tokens_profile_idx on auth_tokens (profile_id, purpose);

-- One row per counted event (a failed sign-in, a reset request, a sign-up), keyed like
-- 'signin:login:alice' or 'signin:ip:203.0.113.5'. Old rows are pruned as new ones arrive.
create table auth_attempts (
  key          text not null,
  at           timestamptz not null default now()
);
create index auth_attempts_key_at_idx on auth_attempts (key, at);

alter table auth_tokens enable row level security;
alter table auth_attempts enable row level security;
revoke all on auth_tokens from app_rw;
revoke all on auth_attempts from app_rw;

-- ── Rate limits ──────────────────────────────────────────────

-- Seconds until the key may try again (0 = allowed now): limit events per window_minutes.
create function auth_retry_after(p_key text, p_limit int, p_window_minutes int) returns int
  language sql stable security definer set search_path = public as $$
  select coalesce((
    select greatest(1, ceil(extract(epoch from (min(at) + make_interval(mins => p_window_minutes) - now())))::int)
    from (select at from auth_attempts
          where key = p_key and at > now() - make_interval(mins => p_window_minutes)
          order by at desc limit p_limit) recent
    having count(*) >= p_limit
  ), 0)
$$;

create function auth_count(p_keys text[]) returns void
  language sql security definer set search_path = public as $$
  delete from auth_attempts where at < now() - interval '1 day';
  insert into auth_attempts (key) select unnest(p_keys);
$$;

create function auth_clear(p_key text) returns void
  language sql security definer set search_path = public as
  $$ delete from auth_attempts where key = p_key $$;

-- ── Email tokens ─────────────────────────────────────────────

-- Issues a token for the account with this email (any earlier unused token of the same purpose
-- stops working). Returns the name and address to send to, or no row if there's no such account.
create function auth_issue_token_for_email(p_email text, p_purpose text, p_token_hash text, p_minutes int)
returns table (display_name text, email text) language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  select p.id into v_id from profiles p join accounts a on a.profile_id = p.id where lower(p.email) = lower(p_email);
  if v_id is null then return; end if;
  update auth_tokens set used_at = now() where profile_id = v_id and purpose = p_purpose and used_at is null;
  insert into auth_tokens (token_hash, profile_id, purpose, expires_at)
    values (p_token_hash, v_id, p_purpose, now() + make_interval(mins => p_minutes));
  return query select coalesce(p.display_name, p.username), p.email from profiles p where p.id = v_id;
end $$;

-- Is this reset link still good? (The reset page checks before showing the form.)
create function auth_token_valid(p_token_hash text, p_purpose text) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from auth_tokens where token_hash = p_token_hash and purpose = p_purpose
                 and used_at is null and expires_at > now())
$$;

-- Uses a reset token: sets the new password, signs the account out everywhere, marks the email
-- verified and clears sign-in lockouts (the link proved the inbox). Returns the profile id, or null if the link is bad.
create function auth_reset_password(p_token_hash text, p_password_hash text) returns text
  language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  update auth_tokens set used_at = now()
    where token_hash = p_token_hash and purpose = 'reset' and used_at is null and expires_at > now()
    returning profile_id into v_id;
  if v_id is null then return null; end if;
  update accounts set password_hash = p_password_hash, email_verified_at = coalesce(email_verified_at, now())
    where profile_id = v_id;
  delete from sessions where profile_id = v_id;
  -- The link proved the inbox, so lift any sign-in lockout on this account.
  delete from auth_attempts where key in (
    select 'signin:login:' || lower(p.email) from profiles p where p.id = v_id
    union all select 'signin:login:' || lower(p.username) from profiles p where p.id = v_id);
  return v_id;
end $$;

-- Uses a verification token. Returns the profile id, or null if the link is bad.
create function auth_verify_email(p_token_hash text) returns text
  language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  update auth_tokens set used_at = now()
    where token_hash = p_token_hash and purpose = 'verify' and used_at is null and expires_at > now()
    returning profile_id into v_id;
  if v_id is not null then
    update accounts set email_verified_at = coalesce(email_verified_at, now()) where profile_id = v_id;
  end if;
  return v_id;
end $$;

-- For the signed-in user's banner: true, false, or null when the profile has no account
-- (the development test users).
create function auth_email_verified(p_profile_id text) returns boolean
  language sql stable security definer set search_path = public as
  $$ select email_verified_at is not null from accounts where profile_id = p_profile_id $$;

-- The signed-in user's own email, to send a fresh verification link to.
create function auth_own_email(p_profile_id text) returns text
  language sql stable security definer set search_path = public as $$
  select p.email from profiles p join accounts a on a.profile_id = p.id
  where p.id = p_profile_id and p.id = app_user()
$$;

revoke execute on function auth_retry_after(text, int, int), auth_count(text[]), auth_clear(text),
  auth_issue_token_for_email(text, text, text, int), auth_token_valid(text, text), auth_reset_password(text, text),
  auth_verify_email(text), auth_email_verified(text), auth_own_email(text) from public;
grant execute on function auth_retry_after(text, int, int), auth_count(text[]), auth_clear(text),
  auth_issue_token_for_email(text, text, text, int), auth_token_valid(text, text), auth_reset_password(text, text),
  auth_verify_email(text), auth_email_verified(text), auth_own_email(text) to app_rw;

-- Down Migration

drop function if exists auth_own_email(text);
drop function if exists auth_email_verified(text);
drop function if exists auth_verify_email(text);
drop function if exists auth_reset_password(text, text);
drop function if exists auth_token_valid(text, text);
drop function if exists auth_issue_token_for_email(text, text, text, int);
drop function if exists auth_clear(text);
drop function if exists auth_count(text[]);
drop function if exists auth_retry_after(text, int, int);
drop table if exists auth_attempts;
drop table if exists auth_tokens;
alter table accounts drop column if exists email_verified_at;

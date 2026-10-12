-- Maple Jar: Schema für ein Supabase-Projekt pro Haushalt.
-- Nur Schema, Zugriffsregeln und Funktionen. Keine Daten, keine Namen.
-- Zugriffsschutz = Row Level Security (RLS) auf allen Tabellen. Registrierung ist im Projekt deaktiviert,
-- die zwei Konten legt der Nutzer im Dashboard an.

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

-- Genau eine Zeile: `id boolean primary key check (id)` erlaubt nur den Wert true.
create table public.household (
  id boolean primary key default true check (id),
  format_version integer not null default 1 check (format_version = 1),
  household_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 80),
  place_label text check (place_label is null or char_length(place_label) between 1 and 80),
  period_start date not null check (extract(day from period_start) = 1),
  period_end date not null,
  base_currency text not null default 'CAD' check (base_currency = 'CAD'),
  second_currency text not null default 'EUR' check (second_currency = 'EUR'),
  fx_provider text not null check (fx_provider in ('ECB', 'BOC')),
  check (period_end > period_start)
);

create table public.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Benutzername ohne Domain; wird serverseitig aus dem Konto abgeleitet, nicht vom Client geliefert.
  username text not null unique check (username ~ '^[a-z0-9._-]{1,40}$'),
  display_name text not null check (char_length(display_name) between 1 and 60),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  locale text not null default 'de-DE' check (locale in ('de-DE', 'en-CA')),
  theme text not null default 'auto' check (theme in ('auto', 'light', 'dark')),
  created_at timestamptz not null default now()
);

-- Ereignisprotokoll, nur anhängen. `seq` ist der Server-Cursor für den Pull.
create table public.events (
  seq bigint generated always as identity,
  id uuid primary key,
  v integer not null check (v >= 1),
  hlc text not null check (char_length(hlc) between 1 and 200),
  device uuid not null,
  author uuid not null references auth.users (id),
  entity text not null check (
    entity in ('settings', 'member', 'category', 'entry', 'budget', 'income',
               'fixedCost', 'goal', 'goalContribution', 'scenario')
  ),
  row_id uuid not null,
  op text not null check (op in ('create', 'update', 'delete', 'restore')),
  base uuid[] not null default '{}',
  data jsonb,
  received_at timestamptz not null default now()
);

create unique index events_seq_idx on public.events (seq);

-- ---------------------------------------------------------------------------
-- Hilfsfunktion und Begrenzung auf zwei Mitglieder
-- ---------------------------------------------------------------------------

-- Mitglied = auth.uid() steht in `members`. `security definer`, damit die Prüfung in Richtlinien
-- ohne Rekursion über RLS auf `members` läuft; `search_path` ist leer, alles ist schemaqualifiziert.
create function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.members where user_id = (select auth.uid()));
$$;

create function public.members_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Gleichzeitige Beitritte serialisieren, damit nie mehr als zwei Zeilen entstehen.
  perform pg_advisory_xact_lock(hashtext('maple-jar.members'));
  if (select count(*) from public.members) >= 2 then
    raise exception 'household is full' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger members_limit_trg
  before insert on public.members
  for each row execute function public.members_limit();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.household enable row level security;
alter table public.members enable row level security;
alter table public.events enable row level security;

revoke all on public.household, public.members, public.events from anon, authenticated;

-- household: Mitglieder lesen. Anlegen nur über setup_household(), kein direktes Schreiben.
grant select on public.household to authenticated;
create policy household_select on public.household
  for select to authenticated using (public.is_member());

-- members: Mitglieder lesen alle Zeilen, ändern nur die eigene (und nur Anzeigefelder).
-- Eintragen nur über setup_household() / join_household().
grant select on public.members to authenticated;
grant update (display_name, color, locale, theme) on public.members to authenticated;
create policy members_select on public.members
  for select to authenticated using (public.is_member());
create policy members_update_own on public.members
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- events: Mitglieder lesen und hängen an (author = eigenes Konto). Kein update, kein delete:
-- weder Rechte noch Richtlinien dafür.
grant select, insert on public.events to authenticated;
create policy events_select on public.events
  for select to authenticated using (public.is_member());
create policy events_insert on public.events
  for insert to authenticated
  with check (public.is_member() and author = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Funktionen für Einrichten, Beitritt und Status
-- ---------------------------------------------------------------------------

-- Status für Konten, die (noch) nicht Mitglied sind und deshalb weder household noch members lesen dürfen.
-- Gibt nur Anzahl und Zustand zurück, keine Inhalte.
create function public.household_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'exists', exists (select 1 from public.household),
    'memberCount', (select count(*) from public.members),
    'isMember', exists (select 1 from public.members where user_id = uid)
  );
end;
$$;

-- Benutzername aus der Anmeldeadresse des aufrufenden Kontos (Teil vor dem @). Nie vom Client geliefert.
create function public.current_username()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(split_part(email, '@', 1)) from auth.users where id = (select auth.uid());
$$;

-- Erste Person legt den Haushalt an und trägt sich als erstes Mitglied ein. Nur solange keine Zeile existiert.
-- security definer, weil Clients weder in household noch in members schreiben dürfen.
create function public.setup_household(
  p_name text,
  p_place_label text,
  p_period_start date,
  p_period_end date,
  p_fx_provider text,
  p_display_name text,
  p_color text,
  p_locale text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('maple-jar.household'));
  if exists (select 1 from public.household) then
    raise exception 'household exists' using errcode = '42501';
  end if;
  insert into public.household (name, place_label, period_start, period_end, fx_provider)
  values (p_name, p_place_label, p_period_start, p_period_end, p_fx_provider);
  insert into public.members (user_id, username, display_name, color, locale)
  values (uid, public.current_username(), p_display_name, p_color, p_locale);
end;
$$;

-- Zweite Person tritt bei: nur wenn ein Haushalt existiert, weniger als zwei Mitglieder da sind und
-- der Aufrufer noch keines ist. Kein Eintragen durch Dritte.
create function public.join_household(
  p_display_name text,
  p_color text,
  p_locale text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('maple-jar.household'));
  if not exists (select 1 from public.household) then
    raise exception 'no household' using errcode = '42501';
  end if;
  if exists (select 1 from public.members where user_id = uid) then
    raise exception 'already member' using errcode = '42501';
  end if;
  if (select count(*) from public.members) >= 2 then
    raise exception 'household is full' using errcode = '42501';
  end if;
  insert into public.members (user_id, username, display_name, color, locale)
  values (uid, public.current_username(), p_display_name, p_color, p_locale);
end;
$$;

-- Ausführungsrechte: Standard ist PUBLIC. Erst entziehen, dann gezielt an angemeldete Konten geben.
revoke all on function public.is_member() from public;
revoke all on function public.members_limit() from public;
revoke all on function public.household_status() from public;
revoke all on function public.current_username() from public;
revoke all on function public.setup_household(text, text, date, date, text, text, text, text) from public;
revoke all on function public.join_household(text, text, text) from public;

grant execute on function public.is_member() to authenticated;
grant execute on function public.household_status() to authenticated;
grant execute on function public.setup_household(text, text, date, date, text, text, text, text) to authenticated;
grant execute on function public.join_household(text, text, text) to authenticated;

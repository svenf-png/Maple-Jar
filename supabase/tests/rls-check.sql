-- Maple Jar: manuelle RLS-Prüfung für den SQL Editor.
--
-- Voraussetzungen:
--   * 0001_init.sql und 0002_keepalive.sql sind eingespielt, es gibt noch KEINEN Haushalt (frisches Projekt, vor dem ersten Verbinden).
--   * Die beiden Konten existieren (Authentication, Users).
-- Das Skript läuft in einer Transaktion und endet mit ROLLBACK: nichts bleibt zurück.
-- Bei Erfolg erscheint die Meldung "RLS-Pruefung bestanden". Jede fehlgeschlagene Erwartung bricht mit
-- "FAIL: ..." ab. Hinweis: Wenn dein Editor Anweisungen einzeln ausführt statt als Transaktion, nicht
-- verwenden, sondern die Prüfliste in README.md von Hand durchgehen.

begin;

create function pg_temp.expect_error(q text, code text, label text) returns void
language plpgsql as $$
begin
  execute q;
  raise exception 'FAIL: % (kein Fehler, erwartet %)', label, code;
exception when others then
  if sqlstate = 'P0001' and sqlerrm like 'FAIL:%' then raise; end if;
  if sqlstate <> code then
    raise exception 'FAIL: % (Fehler %, erwartet %)', label, sqlstate, code;
  end if;
end;
$$;

create function pg_temp.login(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end;
$$;

do $$
declare
  a uuid;
  b uuid;
  c uuid := gen_random_uuid();
  n bigint;
  st jsonb;
  ev1 uuid := gen_random_uuid();
  sig text;
begin
  select id into a from auth.users order by created_at limit 1 offset 0;
  select id into b from auth.users order by created_at limit 1 offset 1;
  if a is null or b is null then raise exception 'FAIL: es werden zwei Konten gebraucht'; end if;
  if exists (select 1 from public.household) then
    raise exception 'FAIL: Es existiert schon ein Haushalt. Skript nur auf frischem Projekt ausfuehren.';
  end if;
  -- Drittes, fremdes Konto nur innerhalb dieser Transaktion.
  insert into auth.users (id, email) values (c, 'stranger@maple-jar.invalid');

  -- 0. Ausfuehrungsrechte der Rolle anon (Supabase-Default-Privilegien, in 0002 entzogen)
  for sig in select unnest(array[
      'public.is_member()', 'public.members_limit()', 'public.household_status()', 'public.current_username()',
      'public.setup_household(text, text, date, date, text, text, text, text)',
      'public.join_household(text, text, text)']) loop
    if has_function_privilege('anon', sig, 'execute') then
      raise exception 'FAIL: anon darf % ausfuehren (0002 eingespielt?)', sig;
    end if;
  end loop;
  if not has_function_privilege('anon', 'public.keepalive()', 'execute') then
    raise exception 'FAIL: anon darf keepalive() nicht ausfuehren (0002 eingespielt?)';
  end if;

  -- 1. Ohne Anmeldung (Rolle anon)
  set local role anon;
  perform pg_temp.expect_error('select * from public.events', '42501', 'anon liest events');
  perform pg_temp.expect_error('select * from public.household', '42501', 'anon liest household');
  perform pg_temp.expect_error('select * from public.members', '42501', 'anon liest members');
  perform pg_temp.expect_error('select public.household_status()', '42501', 'anon ruft household_status (Recht entzogen)');
  perform pg_temp.expect_error('select public.is_member()', '42501', 'anon ruft is_member (Recht entzogen)');
  perform pg_temp.expect_error('select public.current_username()', '42501', 'anon ruft current_username (Recht entzogen)');
  perform pg_temp.expect_error(
    $q$select public.setup_household('X', null, date '2027-01-01', date '2027-12-31', 'ECB', 'X', '#2C6CB0', 'de-DE')$q$,
    '42501', 'anon ruft setup_household (Recht entzogen)');
  perform pg_temp.expect_error($q$select public.join_household('X', '#2C6CB0', 'de-DE')$q$, '42501', 'anon ruft join_household (Recht entzogen)');
  -- Einzige anonym erlaubte Funktion: keepalive() (0002), liefert 1 und liest keine Daten.
  if public.keepalive() is distinct from 1 then raise exception 'FAIL: anon keepalive() liefert nicht 1'; end if;
  reset role;

  -- 2. Konto A, noch kein Mitglied
  set local role authenticated;
  perform pg_temp.login(a);
  st := public.household_status();
  if (st->>'exists')::boolean or (st->>'isMember')::boolean then raise exception 'FAIL: Status vor Einrichtung'; end if;
  perform pg_temp.expect_error(
    format($q$insert into public.events (id, v, hlc, device, author, entity, row_id, op)
              values (gen_random_uuid(), 1, 'x', gen_random_uuid(), %L, 'entry', gen_random_uuid(), 'create')$q$, a),
    '42501', 'Nicht-Mitglied haengt Ereignis an');
  perform pg_temp.expect_error(
    $q$insert into public.members (user_id, username, display_name, color) values (gen_random_uuid(), 'x', 'x', '#000000')$q$,
    '42501', 'direktes Eintragen in members');
  perform public.setup_household('Test', null, date '2027-01-01', date '2027-12-31', 'ECB', 'Person A', '#2C6CB0', 'de-DE');
  perform pg_temp.expect_error(
    $q$select public.setup_household('Zweiter', null, date '2027-01-01', date '2027-12-31', 'ECB', 'X', '#2C6CB0', 'de-DE')$q$,
    '42501', 'zweites setup_household');
  select count(*) into n from public.household;
  if n <> 1 then raise exception 'FAIL: A sieht household nicht'; end if;
  perform pg_temp.expect_error('insert into public.household (name, period_start, period_end, fx_provider) values (''x'', date ''2027-01-01'', date ''2027-02-01'', ''ECB'')', '42501', 'direktes Schreiben in household');

  -- 3. Ereignisse: A darf anhaengen, nur als sich selbst, ohne Aendern/Loeschen
  insert into public.events (id, v, hlc, device, author, entity, row_id, op)
    values (ev1, 1, 'h1', gen_random_uuid(), a, 'entry', gen_random_uuid(), 'create');
  insert into public.events (id, v, hlc, device, author, entity, row_id, op)
    values (ev1, 1, 'h1', gen_random_uuid(), a, 'entry', gen_random_uuid(), 'create')
    on conflict (id) do nothing;
  perform pg_temp.expect_error(
    format($q$insert into public.events (id, v, hlc, device, author, entity, row_id, op)
              values (gen_random_uuid(), 1, 'h2', gen_random_uuid(), %L, 'entry', gen_random_uuid(), 'create')$q$, b),
    '42501', 'Ereignis mit fremdem author');
  perform pg_temp.expect_error('update public.events set hlc = ''z''', '42501', 'update auf events');
  perform pg_temp.expect_error('delete from public.events', '42501', 'delete auf events');
  select count(*) into n from public.events;
  if n <> 1 then raise exception 'FAIL: A sieht % Ereignisse statt 1', n; end if;
  reset role;

  -- 4. Konto B, noch kein Mitglied, ein Platz frei
  set local role authenticated;
  perform pg_temp.login(b);
  st := public.household_status();
  if not (st->>'exists')::boolean or (st->>'memberCount')::int <> 1 or (st->>'isMember')::boolean then
    raise exception 'FAIL: Status fuer B vor Beitritt: %', st;
  end if;
  select count(*) into n from public.events;
  if n <> 0 then raise exception 'FAIL: Nicht-Mitglied B liest Ereignisse'; end if;
  select count(*) into n from public.household;
  if n <> 0 then raise exception 'FAIL: Nicht-Mitglied B liest household'; end if;
  perform pg_temp.expect_error(
    format($q$insert into public.events (id, v, hlc, device, author, entity, row_id, op)
              values (gen_random_uuid(), 1, 'h3', gen_random_uuid(), %L, 'entry', gen_random_uuid(), 'create')$q$, b),
    '42501', 'Nicht-Mitglied B haengt Ereignis an');
  perform public.join_household('Person B', '#A2456E', 'de-DE');
  perform pg_temp.expect_error($q$select public.join_household('Nochmal', '#A2456E', 'de-DE')$q$, '42501', 'doppelter Beitritt');
  select count(*) into n from public.events;
  if n <> 1 then raise exception 'FAIL: B sieht nach Beitritt % Ereignisse statt 1', n; end if;
  reset role;

  -- 5. Fremdes Konto C bei vollem Haushalt
  set local role authenticated;
  perform pg_temp.login(c);
  perform pg_temp.expect_error($q$select public.join_household('Fremd', '#2C6CB0', 'de-DE')$q$, '42501', 'Beitritt bei vollem Haushalt');
  select count(*) into n from public.events;
  if n <> 0 then raise exception 'FAIL: Fremdkonto liest Ereignisse'; end if;
  st := public.household_status();
  if (st->>'memberCount')::int <> 2 or (st->>'isMember')::boolean then raise exception 'FAIL: Status fuer C: %', st; end if;
  reset role;

  -- 6. Mitglieder: nur die eigene Zeile aendern, Benutzername nie
  set local role authenticated;
  perform pg_temp.login(a);
  update public.members set display_name = 'Fremd geaendert' where user_id = b;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A aendert die Zeile von B'; end if;
  update public.members set display_name = 'Person A2' where user_id = a;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: A aendert die eigene Zeile nicht'; end if;
  perform pg_temp.expect_error('update public.members set username = ''neu'' where user_id = ''' || a || '''', '42501', 'Benutzername aendern');
  reset role;

  raise notice 'RLS-Pruefung bestanden';
end;
$$;

rollback;

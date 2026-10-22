-- Maple Jar: Keepalive-Funktion für den geplanten Workflow (.github/workflows/keepalive.yml).
-- Voraussetzung: 0001_init.sql ist eingespielt. Idempotent, kann wiederholt ausgeführt werden.
--
-- Zweck: Der Workflow braucht eine anonym erreichbare Anfrage, die die Datenbank wirklich erreicht, ohne
-- Daten zu lesen. 0001 entzieht `anon` alle Tabellenrechte; ein anonymer Zugriff auf eine Tabelle wird
-- deshalb mit 401 abgewiesen. Diese Funktion liest nichts und gibt nur die Konstante 1 zurück.
--
-- `security invoker` (Standard, hier ausdrücklich): läuft mit den Rechten des Aufrufers, es werden keine
-- erhöhten Rechte vergeben. Leerer `search_path`: nichts wird aufgelöst, die Funktion enthält keine Objekte.
create or replace function public.keepalive()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select 1;
$$;

-- Ausführungsrechte: Standard ist PUBLIC. Erst entziehen, dann gezielt an anon und angemeldete Konten geben.
revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;

-- Korrektur zu 0001: Supabase vergibt per Default-Privilegien `execute` auf neue Funktionen in `public`
-- direkt an anon und authenticated. `revoke ... from public` in 0001 entzieht das nicht (anon ist eine eigene
-- Rolle, nicht PUBLIC). Daher hatte anon auf alle Funktionen Ausführungsrecht. Die Funktionen lehnen anonyme
-- Aufrufer zwar selbst ab (auth.uid() ist null bzw. kein Mitglied), das Recht wird aber ausdrücklich entzogen.
-- Nur anon: authenticated bleibt unverändert. Die App ruft diese Funktionen nur mit Zugriffstoken auf.
-- Trigger-Funktion members_limit: PostgreSQL prüft EXECUTE nur beim CREATE TRIGGER, nicht beim Auslösen.
-- Richtlinien mit is_member() gelten nur `to authenticated`; dort bleibt das Recht erhalten.
revoke execute on function public.is_member() from anon;
revoke execute on function public.members_limit() from anon;
revoke execute on function public.household_status() from anon;
revoke execute on function public.current_username() from anon;
revoke execute on function public.setup_household(text, text, date, date, text, text, text, text) from anon;
revoke execute on function public.join_household(text, text, text) from anon;

-- Künftige Funktionen in `public`, die die ausführende Rolle (hier der SQL-Editor) anlegt, bekommen kein
-- automatisches Ausführungsrecht für anon mehr. Wirkt nicht rückwirkend und nicht für Funktionen, die andere
-- Rollen anlegen. keepalive() hat sein grant oben ausdrücklich.
alter default privileges in schema public revoke execute on functions from anon;

-- Schema-Recht: 0001 entzieht `usage` auf Schema `public` nicht. Supabase vergibt es standardmäßig an anon
-- und authenticated; PostgREST braucht es, um Funktionen im Schema aufzulösen. Es gibt keine Tabellenrechte
-- und ist hier nur festgeschrieben, falls ein Projekt es abweichend entzogen hat. Gibt kein Recht auf Objekte.
grant usage on schema public to anon, authenticated;

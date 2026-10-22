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

-- Schema-Recht: 0001 entzieht `usage` auf Schema `public` nicht. Supabase vergibt es standardmäßig an anon
-- und authenticated; PostgREST braucht es, um Funktionen im Schema aufzulösen. Es gibt keine Tabellenrechte
-- und ist hier nur festgeschrieben, falls ein Projekt es abweichend entzogen hat. Gibt kein Recht auf Objekte.
grant usage on schema public to anon, authenticated;

# Supabase-Projekt für Maple Jar

Ein Projekt pro Haushalt. Das Repo enthält nur Schema und Zugriffsregeln, keine Daten, keine Namen und keine
Projekt-Referenz. Alles Weitere (Projekt-URL, öffentlicher Schlüssel, Benutzernamen, Passwörter) wird nur im
Dashboard bzw. zur Laufzeit in der App eingegeben.

## Einrichtung (manuell, einmalig)

1. **Projekt anlegen** (Free-Plan genügt). Region in der Nähe wählen, Datenbank-Passwort im Passwortmanager sichern.
2. **Registrierung deaktivieren:** Authentication, Sign In / Providers, „Allow new users to sign up“ ausschalten.
   Dort auch die **Mindestlänge für Passwörter** prüfen. Nach der Supabase-Doku gilt als Voreinstellung 6, die Doku
   rät zu mindestens 8 Zeichen (ungeprüft gegen dein Projekt, bitte im Dashboard ansehen).
3. **Zwei Konten anlegen:** Authentication, Users, „Add user“ mit „Auto Confirm User“. Als E-Mail trägst du
   `<benutzername>@maple-jar.invalid` ein (Domain-Konstante `ADDRESS_DOMAIN` in
   `src/data/remote/synthetic-address.ts`). Der Benutzername darf nur `a-z 0-9 . _ -` enthalten und ist das, was später
   in der App eingegeben wird. Es gibt keine echten E-Mail-Adressen im System.
   *Ungeprüft:* Ob die Adressvalidierung deines Projekts die Domain `.invalid` akzeptiert. Falls „Add user“ sie
   ablehnt, eine andere neutrale Domain wählen und `ADDRESS_DOMAIN` entsprechend ändern (vor dem ersten Verbinden).
4. **SQL einspielen:** SQL Editor, Inhalt von `supabase/migrations/0001_init.sql` einfügen und ausführen. Alternativ
   per Supabase CLI (`supabase db push`), falls du die CLI nutzt.
   Danach `supabase/migrations/0002_keepalive.sql` auf dieselbe Weise einspielen (Keepalive-Funktion, siehe unten).
5. **RLS-Prüfung** (siehe unten), bevor du die App verbindest.
6. **URL und öffentlicher Schlüssel:** Project Settings, Data API bzw. API Keys. Kopiere die Projekt-URL
   (`https://<projekt>.supabase.co`) und den öffentlichen Schlüssel (anon bzw. publishable). **Nie** den geheimen
   Schlüssel (`service_role`) verwenden.
7. **App verbinden:** In der App URL, Schlüssel, Benutzername und Passwort eingeben. Die erste Person richtet den
   Haushalt ein. Die zweite Person verbindet sich mit ihrem Konto und tritt dem Haushalt dabei selbst bei
   (`join_household`, nur solange weniger als zwei Mitglieder eingetragen sind).

## Aufbau

| Objekt | Zweck |
|---|---|
| `household` | genau eine Zeile (`id boolean primary key check (id)`): Einstellungs-Startwerte |
| `members` | höchstens zwei Zeilen (Trigger `members_limit`), Benutzername wird serverseitig aus dem Konto abgeleitet |
| `events` | Ereignisprotokoll, nur anhängen; `seq` ist der Pull-Cursor |
| `setup_household(...)`, `join_household(...)` | `security definer` mit leerem `search_path`, einzige Wege, `household`/`members` zu beschreiben |
| `household_status()` | Zustand (existiert / Anzahl / bin ich Mitglied) für Konten, die noch nicht Mitglied sind |
| `is_member()` | Hilfsfunktion für die Richtlinien |
| `keepalive()` | Migration 0002: gibt nur `1` zurück, liest nichts; als einzige Funktion auch für `anon` ausführbar |

Zugriffsregeln: RLS ist auf allen Tabellen aktiv. Lesen und Anhängen (`events`) nur für Mitglieder, beim Anhängen muss
`author` das eigene Konto sein. Es gibt weder Rechte noch Richtlinien für `update`/`delete` auf `events`. Die Anonymrolle
(`anon`) hat auf keine Tabelle Zugriff und darf nach Migration 0002 nur `keepalive()` ausführen. Supabase vergibt per
Default-Privilegien `execute` auf neue Funktionen direkt an `anon` und `authenticated`; `revoke ... from public` in 0001
entzog das nicht. 0002 entzieht es für die sechs Funktionen aus 0001 ausdrücklich von `anon` (`authenticated`
bleibt) und entfernt den Supabase-Default für `anon` bei künftigen Funktionen. PostgreSQL gibt neuen Funktionen
trotzdem weiterhin `execute` an PUBLIC: Jede neue Funktion braucht `revoke all ... from public` und ein gezieltes
grant. Es wurden keine Daten offengelegt: `is_member()` lieferte für anonyme Aufrufer `false`,
`current_username()` `null`, die übrigen Funktionen lehnten sie ab. Jede neue Tabelle bekommt RLS im selben Commit.

## RLS-Prüfliste

Automatisch: `supabase/tests/rls-check.sql` im SQL Editor auf einem **frischen** Projekt (noch kein Haushalt) ausführen.
Das Skript läuft in einer Transaktion mit `rollback` und meldet „RLS-Pruefung bestanden“ oder bricht mit `FAIL: …` ab.
Es wurde gegen ein lokales PostgreSQL 16 mit nachgebautem `auth`-Schema geprüft, nicht gegen ein echtes
Supabase-Projekt (ungeprüft: Verhalten des SQL Editors bei expliziten Transaktionen).

Von Hand (App oder REST, jeweils mit dem öffentlichen Schlüssel):

| Wer | Aktion | Erwartet |
|---|---|---|
| ohne Anmeldung | `GET /rest/v1/events`, `/household`, `/members` | Fehler 401/403, keine Daten |
| Konto A (vor dem Einrichten) | `rpc/household_status` | `exists: false` |
| Konto A | `rpc/setup_household` | ok; danach Haushalt lesbar |
| Konto A | zweites `setup_household` | 403 |
| Konto A | `POST /events` mit `author` = A | ok; wiederholt mit gleicher `id` und `Prefer: resolution=ignore-duplicates` ebenfalls ok |
| Konto A | `POST /events` mit `author` = B | 403 |
| Konto A | `PATCH`/`DELETE /events` | 403 (keine Rechte) |
| Konto B (noch nicht Mitglied) | `GET /events`, `/household` | leer |
| Konto B | `POST /events` | 403 |
| Konto B | `rpc/join_household` | ok; danach Ereignisse lesbar |
| Konto B | zweites `join_household` | 403 |
| fremdes Konto C | `rpc/join_household` | 403 („household is full“), `GET /events` leer |
| Konto A | `PATCH /members` auf Zeile von B | 0 Zeilen geändert |
| Konto A | `PATCH /members` mit `username` | 403 (Spalte nicht änderbar) |

## Pausierung, Sicherung, Keep-Alive

* **Free-Plan:** Projekte mit geringer Aktivität werden nach einer Woche **pausiert, nicht gelöscht**. Pausierte
  Projekte lassen sich im Dashboard wiederherstellen. Die Doku nennt dafür je nach Seitenversion 90 Tage oder
  1 Jahr (die Angaben widersprechen sich, ungeprüft). Danach gibt es nur noch einen Backup-Download.
  Regelmäßig die Daten exportieren (Einstellungen, „Daten exportieren (JSON)“) oder auf einen bezahlten Plan wechseln.
* **Keep-Alive:** siehe nächster Abschnitt.

## Keepalive

`.github/workflows/keepalive.yml` ruft alle drei Tage (`cron: '17 6 */3 * *'`) per `POST /rest/v1/rpc/keepalive` die
Funktion `public.keepalive()` (Migration 0002) auf, damit das Free-Plan-Projekt nicht wegen Inaktivität pausiert wird.
Ein Tabellenzugriff wäre für `anon` mit 401 abgewiesen worden. Voraussetzung ist, dass 0002 im Projekt eingespielt ist.
Kontrollschritt nach dem Einspielen (SQL Editor), erwartet: nur `keepalive` mit `true` in der Spalte `anon_execute`:

```sql
select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' order by p.proname;
```

Bei Netzfehlern gibt der Job nur den curl-Exitcode aus (die Fehlermeldung enthielte den Host).
Secrets (Repository-Einstellungen): `SUPABASE_URL`, `SUPABASE_ANON_KEY`. Fehlen sie, tut der Job nichts. Geplante Läufe
starten nur auf dem Default-Branch. Bei Fehlern gibt der Job Statuscode sowie `code` und `message` der Antwort aus.
Nach dem Einspielen von 0002 einmal manuell starten (Actions, keepalive, Run workflow). Ob ein solcher Aufruf als
Aktivität zählt, ist ungeprüft: nach einer Woche kontrollieren, ob das Projekt aktiv bleibt. GitHub kann geplante
Workflows in Repos ohne Aktivität nach 60 Tagen automatisch deaktivieren.

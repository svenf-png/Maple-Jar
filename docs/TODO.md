# Maple Jar: Backlog

Stand 22.10.2026 (Basis `main` 1f3124a). Quelle: Lückenbericht vom 22.10.2026, Stichproben im Code geprüft.
Schwere: **hoch** / **mittel** / **niedrig**. [V] = vermutet, nicht belegt. Belege als `Datei:Zeile` auf dem Stand oben.
Ziel-Meilenstein in Klammern; M6 ist in `docs/prompts/M6.md` beschrieben (Entscheidungen vom 22.10.2026 in §7),
M7 sind Kandidaten ohne Plan. Supabase-Migrationen: `0001` und `0002` (PR #18) belegt, Neues ab `0003`.

## In Arbeit

- **Abmelden bei offenem Sync schützen** (hoch) – `disconnect()` löscht die ganze lokale Datenbank samt Outbox
  ohne Prüfung, der Bestätigungstext warnt nicht. Beleg: `src/data/session.ts:182-201`, `src/i18n/de.ts:142`.
  Status: in Arbeit, PR #17 (Branch `fix/logout-guard`).
- **Verlauf in Desktop-Breite, SelectField, Hover-Zustände** – Draft-PR #11, in Arbeit.
- **Update-Fenster für neue App-Versionen** – in Arbeit, PR #15 (Branch `feat/update-prompt`). Kostet laut Bericht etwa 0,6 KB Budget
  (main 149,12 KB, mit #15 etwa 149,7 KB von 150 KB).
- **Keepalive** (mittel–hoch) – gelöst in PR #18 (Branch `fix/keepalive-rpc`, Merge steht aus). Ursachen: Geplante
  Workflows laufen nur auf dem Default-Branch, und der war bis 22.10. ein alter Branch ohne `keepalive.yml`; der Ping
  ging an `household`, auf die `anon` keinerlei Rechte hat (`supabase/migrations/0001_init.sql:101`). Neu: Migration
  `supabase/migrations/0002_keepalive.sql` mit `public.keepalive()`, vom Nutzer im Projekt eingespielt; Workflow-Lauf auf
  dem Branch ergab HTTP 200. Die Migrationsnummer `0002` ist damit belegt, weitere Migrationen ab `0003`.

## Datensicherheit

- **Kein Rückweg aus dem JSON-Export** (hoch) – Es gibt keinen Import. Geht das Supabase-Projekt verloren, lässt sich
  die empfohlene Sicherung nicht wieder einspielen; neue Konten haben neue IDs, und RLS erlaubt nur
  `author = auth.uid()`. Beleg: `src/data/export.ts:6-9`, `supabase/migrations/0001_init.sql:124-126`. (M6-C: jede
  Person spielt ihre eigenen Ereignisse ein; eine Server-Funktion für fremde Ereignisse ist M7-Kandidat, Migration ab
  `0003`.)
- **Echtes Supabase und Gerätetests nicht belegt** (mittel) [V] – Haptik, VoiceOver, Install-Hinweis, Flugmodus,
  CSV in der Tabellenkalkulation und der Betrieb gegen ein echtes Projekt sind laut PRs ungeprüft.
  Status: Nutzer-Checkliste aus PR #10; das Projekt ist geklärt und wieder aktiv.

## M5 Teil 2 (M6-A)

- **Altlasten aus M2–M4 offen** (mittel) – PR #10 hat Task 7 des M5-Plans verschoben: Notiz als Ersatztitel
  (`src/features/shared/EntryRow.tsx:25`), Toast auf dem Desktop nicht in der Inhaltsspalte zentriert
  (`src/ui/Toast.module.css`), `100dvh` ohne Abzug (`src/features/planning/PlanForm.module.css:2`,
  `src/features/capture/CapturePage.module.css:2`), `PctSlider` nutzt `getLocale()` statt `useLang()`
  (`src/features/projection/PctSlider.tsx:3,53`), `tests/e2e/m5-layout.spec.ts` fehlt.
- **Regler ohne Wirkung auf die Projektion** (mittel) – Kategorien mit Budget, aber ohne Ø bekommen einen Regler; die
  Prognose wendet `categoryPct` nur auf Kategorien mit Ø an. Der Regler ändert dort nur den Budgetvorschlag
  („Als Budgets übernehmen“), nicht die Linie. Beleg: `src/domain/scenario-view.ts:19-33`,
  `src/domain/projection.ts:228-232`, `src/domain/scenario.ts:115-116`.
- **Regler-Hinweis nennt nicht die echte Quelle** (niedrig) – „Ø“ auch bei Budget-Grundwert.
  Beleg: `src/features/projection/ScenarioPanel.tsx:59-72`.
- **EN-Vollständigkeit und axe-Rundumtest fehlen** (mittel) – Task 8 des M5-Plans: kein `SAME_IN_BOTH`-Test, kein
  `tests/e2e/m5-axe.spec.ts`, `Intl` direkt außerhalb `format.ts` (`src/app/PageHeader.tsx:10`,
  `src/features/connect/errors.ts:16`).
- **Lighthouse nicht gemessen** (niedrig) – verlangt in `docs/PLAN.md` (M5, Verifikation), keine Werte in PRs.
- **Gegenprobe Reduced Motion zählt laufende Animationen** (niedrig) – U11, Wackeltest.
  Beleg: `tests/e2e/m5-a11y.spec.ts:403-407`.
- **Feste Pausen vor Negativprüfungen** (niedrig) – Beleg: `tests/e2e/m3b1.spec.ts:70` (500 ms),
  `tests/e2e/m3b2-two-devices.spec.ts:140` (3000 ms).
- **`latest.current` in `useEffect`** (niedrig) – sollte im Layout-Effekt stehen wie der Listener.
  Beleg: `src/features/projection/PctSlider.tsx:28-30`.
- **Tabbar-Höhe doppelt als Literal** (niedrig) – Beleg: `src/app/Tabbar.module.css:7`, `src/styles/base.css:16`.
- **README veraltet** (niedrig) – „Status: Meilenstein M2 umgesetzt“. Beleg: `README.md:16`.

## Einstellungen (M6-B)

- **Haushalts-Einstellungen nach der Einrichtung fest** (hoch) – Name, Ort, Kursquelle und Zeitraum lassen sich nicht
  ändern. Es gibt nur das `settings`-`create` beim Einrichten; die Oberfläche liest `household.settings` aus `meta`
  (Server-Zeile), spätere Ereignisse hätten keine Wirkung. Nach 12 Monaten hat die Projektion keinen
  Prognose-Zeitraum mehr. Beleg: `src/data/session.ts:150-155`, `src/features/settings/SettingsPage.tsx:151`,
  `src/features/setup/SetupPage.tsx:21-22`, `src/data/sync/cycle.ts:15-23`.
- **Eigenes Profil (Name, Farbe) nicht änderbar** (mittel) – RLS würde das Ändern der eigenen `members`-Zeile
  erlauben, die App schreibt aber weder dorthin noch `member`-Ereignisse. Beleg:
  `supabase/migrations/0001_init.sql:110-117`, `src/data/remote/sync-transport.ts:43-58`.

## Backup & Sync (M6-C)

- **Wiederherstellung aus dem JSON-Export** (hoch) – siehe Datensicherheit.
- **„Zuletzt synchronisiert“ unsichtbar** (mittel) – `lastSyncAt` wird nur im Speicher geführt und nirgends angezeigt.
  Beleg: `src/data/sync/engine.ts:18,42`.
- **Fehlerzustände nicht unterscheidbar** (hoch) – Die Zustandsmaschine kennt `forbidden`, `rate` und `server`, die
  Pille zeigt aber immer „Sync gestört · Erneut versuchen“. Ein gelöschtes Projekt (Adresse nicht auflösbar) erscheint
  dauerhaft als „Offline“. Am 22.10.2026 echt eingetreten: Das pausierte Projekt war per DNS nicht auflösbar
  (NXDOMAIN), die App zeigte nur „Offline“ statt des Lösungswegs (im Supabase-Dashboard wiederherstellen).
  Beleg: `src/data/remote/supabase-transport.ts:85-86`, `src/data/sync/engine.ts:62-69`,
  `src/app/SyncStatusPill.tsx:34-42`. (M6-C, Task C1/C2 mit E2E-Test)
- **Passwort ändern nur im Supabase-Dashboard** (mittel) – kein Code, kein Hilfetext.
  Beleg: `src/data/remote/sync-transport.ts:43-58`.
- **Diagnose schwer verständlich** (niedrig) – geparkte Ereignisse zeigen nur Rohgrund und Nummer.
  Beleg: `src/features/settings/SettingsPage.tsx:210-212`. (M7-Kandidat)

## Alltagsfunktionen (M7-Kandidaten)

- **Fälligkeit überspringen** (mittel) – Eine absichtlich gelöschte Fixkosten-Buchung bleibt bis zu 35 Tage
  überfällig und zählt im Kreisdiagramm. Kein Code.
- **Erstattungen und Gutschriften** (mittel) – Beträge müssen positiv sein. Beleg: `src/data/events/schema.ts:28,84`.
- **Rückblick auf Vormonate** (mittel) – Übersicht und Budgets nur für den laufenden Monat, Verlauf nur „Dieser Monat /
  Letzter Monat / Gesamt“, keine Summe der Filtertreffer. Beleg: `src/features/overview/OverviewPage.tsx:62`,
  `src/features/budgets/BudgetsPage.tsx:26`, `src/domain/history.ts:42-43`, `src/features/history/HistoryPage.tsx:165`.
- **Fixkosten mit Sparziel verknüpfen** (mittel) – Ein Dauerauftrag mit `isSaving` erhöht kein Sparziel, `fixedCost`
  hat kein `goalId`. Beleg: `src/data/events/schema.ts:110-119`.
- **EUR offline ohne bekannten Kurs** (niedrig–mittel) – Speichern bricht mit `NoRateError` ab; manuelle Kurseingabe
  fehlt. Beleg: `src/data/actions.ts:38`.
- **Aktivitäts-Feed nur für Einträge** (niedrig) – Planung fehlt. Beleg: `src/domain/activity.ts:3`.
- **Desktop-Dashboard: Monatsbalken und Kategorienverteilung** (niedrig) – in `docs/PLAN.md` §4 vorgesehen, in PR #9
  bewusst verschoben; `src/charts/` hat nur `LineChart`.

## Tests und Technik

- **CSV-Beträge als `12.50`** (niedrig) – Deutsche Tabellenkalkulationen lesen das unter Umständen als Text oder
  Datum. Offen bis zum Gerätetest. Beleg: `src/domain/csv.ts:53,55`.
- **Realtime und Verdichtung (Snapshot)** (niedrig) – laut `docs/PLAN.md` optional bzw. bei Bedarf; derzeit nicht nötig.
- **Größenbudget fast ausgeschöpft** (mittel) – 149,12 von 150 KB auf `main`. Neues nur per `import()`; M6-A schafft
  Puffer durch lazy Laden der Verbinden-Seite, das Budget wird nicht angehoben (M6.md, Entscheidung 8).

## Bewusst hingenommen

Dokumentiert in PR #5, #7, #8 und #9; nur bei neuem Anlass wieder aufgreifen.

- „Sparziel erreicht“ wird je Gerät statt je Person gemerkt.
- Gleichzeitiges, unterschiedliches Auflösen desselben Konflikts erzeugt einen neuen Konflikt.
- `categoryPct` wird als Ganzes per Last-Write-Wins geschrieben; gleichzeitiges Regeln verliert eine Änderung.
- Einträge mit Zukunftsdatum zählen als Ist und in der Prognose.
- Der Ø enthält Einträge gelöschter Kategorien. Beleg: `src/domain/projection.ts:130-137`.

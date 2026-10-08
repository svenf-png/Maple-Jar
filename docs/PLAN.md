# Maple Jar: Umsetzungsplan

## Kontext

Das Repo `svenf-png/maple-jar` ist leer (Branch `claude/exciting-albattani-mhs7m2`, noch kein Commit). Gebaut wird eine offline-fähige PWA als gemeinsames Haushaltsbuch für zwei Personen, optimiert für iPhone (Home-Bildschirm) und mit Desktop-Ansicht. Als Spezifikation dient die Design-Referenz aus Claude Design (21 Screens, 19 Icons, Komponentenbibliothek). Sie ist identisch mit dem verlinkten Design-Canvas. Das Repo ist öffentlich. Deshalb sind Datenschutz und serverseitige Absicherung harte Randbedingungen und keine Nebensache.

Dieser Plan liefert: Architekturentscheidung, Datenmodell (SQL plus RLS), Sync-Konzept, Ordnerstruktur, Meilensteine, Setup-Checkliste, einen Entwurf der CLAUDE.md und gesammelte offene Fragen. Der Plan wurde freigegeben. Offene Fragen stehen in Abschnitt 8.

### Was in der Design-Referenz auffiel (für die Umsetzung relevant)

- **Tokens sind nicht in allen Dateien gleich.** Die Basis-Tokens (`--bg` bis `--shadow`) sind überall identisch. Einige Screens ergänzen weitere: `--bar`, `--scrim` (Navigation, Sheets), `--grid`, `--side`, `--line`/`--line2` (Alias für `--base`/`--scen`), `--rowHover`, `--hill1`/`--hill2` (Illustrationen; Login und Leer-Zustand verwenden im Dunkelmodus unterschiedliche Werte). Ich führe alles in einer Datei `tokens.css` zusammen. Der Dunkel-Schatten ist in Komponenten.dc.html `rgba(255,240,225,.05)`, in 13 Screens `.04`. Vorschlag: Die Komponentenbibliothek gilt als maßgeblich.
- **Ortsbezug im Design:** Einige Design-Texte nennen einen konkreten Ort, reale Händlernamen und konkrete Reiseziele. Diese dürfen **nicht** in Code, Tests oder Screenshots landen. Umsetzung: Der Ort wird als `household.place_label` zur Laufzeit geladen (`{place}`-Platzhalter in i18n). Der Login-Screen läuft vor der Anmeldung und hat deshalb keinen DB-Zugriff. Dort steht ein neutraler Text ohne Ort. In Tests und Seeds werden neutrale Händler wie „Supermarkt A“ oder „Café B“ verwendet.
- **Kontrast (selbst nachgerechnet, WCAG 2.x):** Weiße Schrift auf Kategoriefarbe erreicht bei *Gesundheit* `#6F8A1E` nur 3,94:1, bei *Sonstiges* `#857A6E` 4,19:1 und bei *Geschenke* `#B5602F` 4,49:1. Für Fließtext ist das unter AA (4,5:1). Betroffen ist der ausgewählte Kategorie-Chip mit 15 px Text. Für weiße Icons genügen 3:1, das erfüllen alle Farben. `--label3` hell erreicht auf `--bg` nur 3,34:1 und darf deshalb nur für Dekoratives oder Platzhalter verwendet werden. Alle übrigen Token-Paare bestehen AA. Ein Unit-Test prüft künftig alle Token-Paare automatisch.
- **Logik im Design:** Budgets laufen pro Kalendermonat, die Gesamtsumme ergibt sich aus den Kategoriebudgets. „Pro Tag möglich“ = Rest geteilt durch verbleibende Tage. Projektion = Einnahmen minus Fixkosten minus Sparraten minus variable Ausgaben (Durchschnitt der letzten 3 Monate). Sparziele zeigen die nötige Rate pro Monat und „hinter Plan“ gemessen an einem linearen Plan. Fixkosten tauchen auch im Verlauf als Einträge auf (z. B. ein Handyvertrag in EUR). Szenarien haben „Als Budgets übernehmen“.

### Ergänzung: Kreisdiagramm „Anteil am Einkommen“ auf der Übersicht (deine Vorgabe)

- **Ort:** In der Hero-Karte „Noch verfügbar“, als kleiner Donut (ca. 96 px) rechts neben dem Hero-Betrag. Darunter eine kompakte Legende mit Betrag und Prozent je Segment. Diese Abweichung vom Design (dort gibt es kein Diagramm) wird in der Komponente bewusst so umgesetzt.
- **Ganzer Kreis = Einnahmen des laufenden Monats** (geplante Einnahmen gelten am Stichtag als eingegangen, Frage 3), in CAD.
- **Segmente:** Fixkosten (Einträge mit `fixed_cost_id`, ohne Sparposten) · Budget-Ausgaben (Einträge in Kategorien mit Budget) · Andere Ausgaben (Kategorien ohne Budget) · Sparen (Beiträge zu Sparzielen im Monat plus als „Sparen“ markierte Fixkosten, Frage 2) · Frei (Rest). „Frei“ wird in der Spurfarbe (`--fill`) gezeichnet, damit es als „noch nicht verbraucht“ lesbar ist.
- **Sonderfälle:** Noch keine Einnahmen im Monat: Kreis = Summe der Ausgaben, Hinweis „Noch keine Einnahmen in diesem Monat“. Ausgaben über dem Einkommen: Kreis wird auf die Ausgaben skaliert, der überschießende Teil erscheint als Amber-Segment mit Icon und Text „N CA$ über den Einnahmen“ (kein Rot).
- **Darstellung:** eigene SVG-Komponente `DonutChart` (keine Lib). Segmentfarben aus Tokens, nicht aus Kategoriefarben. Nie `--acc` (nur Aktion), Amber nur für den Überlauf. Benachbarte Segmente unterscheiden sich auch in der Helligkeit. Die Farbwahl prüfe ich bei der Umsetzung mit dem dataviz-Skill und einem Kontrast-Test. Barrierefreiheit: `role="img"` mit `aria-label` als Satz („Von 5.866 CA$ Einnahmen: 11 % Fixkosten …“), Legende als echte Liste, also nie nur Farbe. Tipp auf ein Legenden-Element hebt das Segment hervor. Animation nur ohne `prefers-reduced-motion`.
- **Logik:** `src/domain/income-split.ts` (rein, getestet: Normalfall, keine Einnahmen, Überlauf, EUR-Einnahmen und -Ausgaben, Rundung, sodass die Prozente genau 100 ergeben).
- **Meilenstein:** Komponente und Ausgaben-Segmente in M2. Mit Einnahmen und Sparen vollständig in M4, wenn diese Daten existieren. Bis dahin zeigt die Karte das Diagramm nicht.

---

## 1. Architekturentscheidung

### Entscheidung: Vorschlag weitgehend übernommen, mit fünf begründeten Abweichungen

| Baustein | Entscheidung | Version (npm, geprüft am 08.10.2026) |
|---|---|---|
| Build | Vite | 8.3.x |
| UI | React + TypeScript | React 19.3, TypeScript 7.0 |
| Routing | React Router, **Hash-Router** | 8.4.x (benötigt Node ≥ 22.22) |
| Styling | CSS Custom Properties + CSS Modules, kein UI-Framework | nichts zusätzlich |
| Diagramme | Eigene SVG-Komponenten (Linie, Balken, Fortschritt) | keine Lib |
| PWA | vite-plugin-pwa (Workbox, `generateSW`) | 2.0.0 (Peer: Vite ^8) |
| Lokale DB | Dexie + dexie-react-hooks (`useLiveQuery`) | 4.4.x |
| Backend | Supabase (Auth, Postgres + RLS, Realtime, Storage) | supabase-js 2.117.x, CLI 2.120.x |
| OCR | Tesseract.js im Web Worker, lazy | 7.0.0 |
| i18n | **Eigene kleine Lösung** (typisierte Wörterbücher + Intl) | keine Lib |
| Lint/Format | **Biome** statt ESLint | 2.5.x |
| Tests | Vitest, Playwright (+ @axe-core/playwright), pgTAP über `supabase test db` | Vitest 5.0, Playwright 1.64 |
| CI-Node | Node 24 LTS | |

**Abweichungen mit Begründung**

1. **Hash-Router statt 404-Fallback.** Auf GitHub Pages liefert der 404-Trick echte HTTP-404-Antworten und ist bei Deep Links und iOS-Installationen fehleranfällig. Hash-URLs funktionieren ohne Serverkonfiguration, der Service-Worker-Scope bleibt einfach der Base-Pfad, und SEO spielt für eine private App keine Rolle. Supabase-Auth läuft ohne Links (Login per Passwort, siehe Frage 7), also kollidieren keine Token-Fragmente mit dem Hash.
2. **Biome statt ESLint.** TypeScript 7 (stabil seit Juli 2026, nativer Go-Compiler) hat noch keine stabile Programmier-API. `typescript-eslint` 8.71 verlangt laut Peer-Dependency `typescript <6.1.0`. Biome braucht die TS-API nicht. Typprüfung über `tsc --noEmit` (TS 7). Falls ein Tool doch TS 6 braucht: auf TS 6.0.3 zurückgehen, keine Architekturfolgen.
3. **Eigenes i18n statt i18next.** Zwei Sprachen und ein paar hundert Strings rechtfertigen keine ca. 40 KB Bibliothek. `de.ts` ist die Quelle, `en.ts` muss per Typ dieselben Schlüssel haben. Platzhalter wie `{place}` oder `{name}` werden aus der DB befüllt. Plural über `Intl.PluralRules`, Zahlen, Währungen und Datum über `Intl` (`de-DE`, `en-CA`). `Intl.NumberFormat('de-DE', {style:'currency', currency:'CAD'})` ergibt genau „84,17 CA$“ wie im Design.
4. **Kein `merchant_category_map`-Tabelle.** Der Kategorie-Vorschlag wird lokal aus den Einträgen abgeleitet (normalisierter Händler → häufigste Kategorie, Anzahl = „Vorschlag aus 12 früheren Einkäufen“). Alle Einträge liegen ohnehin in IndexedDB, und eine abgeleitete Größe kann keine Sync-Konflikte erzeugen.
5. **Kein gespeichertes `saved_minor` am Sparziel.** Der Stand ergibt sich aus der Summe der Beiträge (`goal_contribution`, nur anhängen). Zwei Geräte, die gleichzeitig einzahlen, erzeugen so nie einen Konflikt.

Außerdem werden `settings` mit `household` zusammengelegt (1:1-Beziehung, eine Tabelle weniger zu synchronisieren). Wechselkurse werden in einer gemeinsamen Tabelle `fx_rate` gecacht, damit beide Geräte denselben Kurs verwenden.

### Abwägung Backend

- **Supabase (gewählt).** Postgres mit RLS sichert serverseitig ab, unabhängig davon, dass der Code öffentlich ist. SQL eignet sich gut für Auswertungen. Privater Storage-Bucket mit Signed URLs. Free Plan (laut [supabase.com/pricing](https://supabase.com/pricing), bestätigt durch mehrere Quellen 2026): 500 MB DB, 1 GB Dateispeicher, 5 GB Egress, 50.000 MAU, 2 aktive Projekte. **Nachteil:** Free-Projekte werden nach 7 Tagen ohne ausreichende Datenbankaktivität pausiert ([Doku Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing)). Gegenmaßnahme siehe Risiko 4. Pro kostet ca. 25 USD/Monat und pausiert nicht.
- **Firebase (verworfen).** Firestore hat eingebauten Offline-Cache und pausiert nicht. Aber: Seit 30.10.2024 braucht ein neuer Default-Bucket für Cloud Storage den Blaze-Plan, also ein Rechnungskonto. Seit Februar 2026 gilt das auch für bestehende Spark-Buckets ([Firebase FAQ](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)). Dazu kommen Last-Write-Wins ohne Konflikterkennung und NoSQL-Aggregationen für Projektion und Budgets. Für Belegfotos würde also eine Kreditkarte nötig.
- **Reines Local-First mit Sync-Dienst (PowerSync, ElectricSQL, Dexie Cloud u. a.) (verworfen).** Bringt fertige Sync-Logik, aber einen dritten Dienst mit eigenem Preismodell (aktuelle Preise konnte ich nicht verlässlich verifizieren), teils SQLite-WASM im Browser (mehr Startgewicht auf dem iPhone) und weitere Auth-Kopplung. Bei sechs Tabellen und zwei Nutzern ist eine eigene Outbox mit Versionsprüfung überschaubar und vollständig testbar.

### Wechselkurse

**Frankfurter API v2**, ohne Key, CORS offen ([frankfurter.dev](https://frankfurter.dev/), [JS-Doku](https://frankfurter.dev/javascript/)): `GET https://api.frankfurter.dev/v2/rate/EUR/CAD?date=YYYY-MM-DD&providers=ECB`. v1 ist eingefroren, funktioniert aber weiter. v2 mischt standardmäßig Kurse mehrerer Zentralbanken. Ich pinne einen Anbieter (Standard EZB, Bank of Canada ist ebenfalls verfügbar, siehe Frage 6), damit Kurse reproduzierbar sind. An Wochenenden und Feiertagen kommt der letzte verfügbare Kurs zurück (das API liefert das Datum mit, gespeichert wird es als `fx_rate_date`). Offline wird der zuletzt bekannte Kurs genommen und der Eintrag als `fx_provisional` markiert. Online zieht das erfassende Gerät den Tageskurs nach. Die Bank of Canada Valet API ist ebenfalls ohne Key nutzbar, CORS ist aber nicht dokumentiert. Sie dient deshalb nur als möglicher Ersatz über Frankfurter (`providers=BOC`).

### Die größten Risiken und Gegenmaßnahmen

1. **iOS-Speicher-Eviction / Datenverlust ungesyncter Änderungen.** Safari 17+: Das Kontingent pro Origin liegt bei bis zu ca. 60 % des Speichers. Home-Bildschirm-Apps haben einen eigenen Nutzungszähler, die 7-Tage-Regel für Skript-Speicher greift dort nach WebKit-Aussage nicht wie im Browser-Tab ([WebKit Storage Policy](https://webkit.org/?p=14403)). `persist()` wird von Safari ohne Rückfrage entschieden. Ob es auf iOS wirksam schützt, ist nicht offiziell dokumentiert.
   *Gegenmaßnahmen:* Der Server bleibt die Wahrheit, IndexedDB ist nur Cache plus Outbox. Die Outbox wird bei jeder Gelegenheit sofort geleert (nach jedem Speichern, beim Online-Gehen, bei `visibilitychange`). iOS-Safari kennt keine Background Sync API, synchronisiert wird also nur im Vordergrund. `navigator.storage.persist()` wird bei jedem Start angefragt und der Status in den Einstellungen angezeigt. Ein deutlicher Zähler „N warten auf Sync“ ist sichtbar. Bei leerer DB nach einer Eviction folgt automatisch ein voller Pull. Ein Onboarding-Hinweis empfiehlt „Zum Home-Bildschirm“ statt Tab. Wichtig: Auf iOS haben Home-Bildschirm-App und Safari **getrennten** Speicher. Nach der Installation muss man sich in der App neu anmelden.
2. **OCR-Qualität auf Kassenbons.** Thermopapier, Knicke, Licht, gemischte Formate (`1,234.56` gegenüber `1.234,56`, `MM/DD` gegenüber `DD/MM` in Kanada).
   *Gegenmaßnahmen:* Nur drei Felder erkennen. Vorverarbeitung im Canvas (EXIF-Ausrichtung, Graustufen, Kontrast-Stretch, adaptiver Schwellwert, lange Kante ca. 1600 px). Feldweise Konfidenz aus Tesseract-Wortkonfidenz und Heuristik-Score. Unsichere Felder werden in Info-Blau markiert. Bei Mehrdeutigkeit (z. B. Datum 03/04) gilt das Feld immer als unsicher. Plausibilitätsgrenzen (Datum nicht in der Zukunft, nicht älter als 60 Tage). Abgleich mit bekannten Händlern (Levenshtein). Fehlschlag führt in den manuellen Flow, das Foto bleibt trotzdem am Eintrag. Der Parser wird mit einer Sammlung synthetischer OCR-Texte getestet (Vitest), unabhängig von Tesseract. Sprache standardmäßig nur `eng`: Schlüsselwörter wie SUMME, GESAMT und TOTAL sind ASCII, das spart mehrere MB Download (siehe Frage 9).
3. **Sync-Konflikte und Korrektheit.** Zwei Geräte bearbeiten denselben Eintrag offline.
   *Gegenmaßnahmen:* Optimistische Nebenläufigkeit über `version` (der Server erhöht sie per Trigger). Updates gehen nur mit `WHERE version = base_version` durch. Feldweises automatisches Mergen, wenn sich die geänderten Felder nicht überschneiden. Nur echte Überschneidungen landen im Konflikt-Dialog. Inserts können nicht kollidieren (UUIDs vom Client), Beiträge zu Sparzielen werden nur angehängt. Die Sync-Engine ist eine reine, deterministisch testbare Zustandsmaschine (Vitest mit `fake-indexeddb` und gemocktem Supabase-Client).
4. **(Zusatz) Supabase-Pause und iOS-Haptik.** *Pause:* Ein GitHub-Actions-Workflow ruft alle 3 Tage per `rpc('ping')` die DB auf. Achtung: GitHub deaktiviert geplante Workflows in Repos ohne Aktivität nach 60 Tagen. Dazu kommt Supabases Warn-Mail. Alternativ Pro (Frage 8). Die App funktioniert in der Pause lokal weiter, die Outbox wartet. *Haptik:* Seit **iOS 26.5** (Mai 2026) löst ein per Skript ausgelöster `label.click()` keinen Tick mehr aus. Nur ein **direkter Fingertipp** auf ein `<input type="checkbox" switch>` oder sein Label funktioniert noch (mehrere übereinstimmende Quellen, keine offizielle Apple-Aussage). Deshalb wird Haptik nur über unsichtbare Switch-Overlays direkt unter dem Finger umgesetzt (Speichern, Chips, Auslöser), immer zusätzlich mit visuellem Feedback, als Progressive Enhancement. Für „Wischaktion rastet ein“ ist auf iOS keine Haptik möglich, dort gibt es nur visuelles Feedback.

---

## 2. Datenmodell (SQL-Skizze)

Konventionen: alle Beträge `bigint` in Minor Units (Cent). Alle synchronisierten Tabellen haben `id uuid` (vom Client erzeugt), `household_id`, `created_by`, `created_at`, `updated_by`, `updated_at`, `version`, `deleted_at`. Fremdschlüssel auf andere Haushaltsdaten sind **zusammengesetzt** `(household_id, x_id)`. Datensätze aus zwei Haushalten lassen sich so strukturell nicht verknüpfen.

```sql
-- 0001_core.sql
create schema if not exists app;
create type public.currency_code as enum ('CAD','EUR');
create type public.interval_unit as enum ('once','week','month','year');

create table public.household (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,             -- nur aus DB, nie im Code
  place_label      text,                      -- für {place} in Texten
  period_start     date not null,
  period_end       date not null check (period_end > period_start),
  base_currency    public.currency_code not null default 'CAD',
  second_currency  public.currency_code not null default 'EUR',
  fx_provider      text not null default 'ECB',
  version int not null default 1, updated_at timestamptz not null default now(), updated_by uuid
);

create table public.member (
  user_id       uuid primary key references auth.users on delete cascade,
  household_id  uuid not null references public.household on delete cascade,
  display_name  text not null,
  color         text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  locale        text not null default 'de-DE' check (locale in ('de-DE','en-CA')),
  theme         text not null default 'auto' check (theme in ('auto','light','dark')),
  updated_at    timestamptz not null default now(),
  unique (household_id, user_id)
);
-- Trigger: höchstens 2 Mitglieder pro Haushalt

-- Gemeinsame Spalten (als Muster, in jeder Tabelle ausgeschrieben):
--   id uuid primary key, household_id uuid not null references household,
--   created_by uuid not null default auth.uid(), created_at timestamptz not null default now(),
--   updated_by uuid, updated_at timestamptz not null default now(),
--   version int not null default 1, deleted_at timestamptz,
--   unique (household_id, id)

create table public.category (
  <gemeinsame Spalten>,
  name text not null, icon text not null,              -- icon = Schlüssel im eingebauten Icon-Set
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort int not null default 0, hidden boolean not null default false
);

create table public.fixed_cost (
  <gemeinsame Spalten>,
  name text not null, amount_minor bigint not null check (amount_minor > 0),
  currency public.currency_code not null,
  unit public.interval_unit not null, every int not null default 1 check (every > 0),
  starts_on date not null, ends_on date,
  category_id uuid not null, icon text,                -- optionales Icon, z. B. 'streaming'
  autobook boolean not null default false,             -- siehe Frage 1
  foreign key (household_id, category_id) references public.category (household_id, id)
);

create table public.entry (
  <gemeinsame Spalten>,
  amount_minor     bigint not null check (amount_minor > 0),
  currency         public.currency_code not null,
  fx_rate_to_cad   numeric(12,6) not null check (fx_rate_to_cad > 0),  -- CAD: 1
  fx_rate_date     date not null,
  fx_provisional   boolean not null default false,
  amount_cad_minor bigint generated always as (round(amount_minor * fx_rate_to_cad)::bigint) stored,
  booked_on        date not null,
  category_id      uuid not null,
  paid_by          uuid not null,
  merchant         text, note text,
  receipt_path     text,                               -- {household_id}/{entry_id}/{uuid}.jpg
  source           text not null default 'manual' check (source in ('manual','scan','fixed')),
  fixed_cost_id    uuid,
  ocr              jsonb,                              -- Konfidenzen, Rohwerte (kein Bildtext)
  foreign key (household_id, category_id)   references public.category   (household_id, id),
  foreign key (household_id, paid_by)       references public.member     (household_id, user_id),
  foreign key (household_id, fixed_cost_id) references public.fixed_cost (household_id, id)
);
create index on public.entry (household_id, booked_on) where deleted_at is null;
create index on public.entry (household_id, updated_at);

create table public.budget (
  <gemeinsame Spalten>,
  category_id uuid not null,
  valid_from date not null check (extract(day from valid_from) = 1),   -- gültig ab Monat
  monthly_limit_cad_minor bigint not null check (monthly_limit_cad_minor >= 0),
  foreign key (household_id, category_id) references public.category (household_id, id)
);
create unique index on public.budget (household_id, category_id, valid_from) where deleted_at is null;

create table public.income (
  <gemeinsame Spalten>,
  name text not null, member_id uuid,                  -- optional: wem die Einnahme gehört
  amount_minor bigint not null check (amount_minor > 0), currency public.currency_code not null,
  unit public.interval_unit not null, every int not null default 1, starts_on date not null, ends_on date,
  foreign key (household_id, member_id) references public.member (household_id, user_id)
);

create table public.goal (
  <gemeinsame Spalten>,
  name text not null, icon text not null, color text not null,
  target_minor bigint not null check (target_minor > 0), currency public.currency_code not null,
  starts_on date not null, target_date date not null, reached_at timestamptz, archived_at timestamptz
);

create table public.goal_contribution (            -- nur anhängen; Korrektur = Soft Delete + neu
  <gemeinsame Spalten>,
  goal_id uuid not null, amount_minor bigint not null check (amount_minor <> 0),   -- in Zielwährung
  contributed_on date not null, member_id uuid, note text,
  foreign key (household_id, goal_id) references public.goal (household_id, id)
);

create table public.scenario (                     -- nur falls Szenarien gespeichert werden (Frage 4)
  <gemeinsame Spalten>,
  name text not null,
  category_pct jsonb not null default '{}',         -- {category_id: -20}
  extras jsonb not null default '[]'                -- Einmalausgaben / neue Ziele
);

create table public.fx_rate (                      -- öffentliche Referenzdaten, gemeinsamer Cache
  rate_date date not null, base public.currency_code not null, quote public.currency_code not null,
  rate numeric(12,6) not null check (rate > 0), provider text not null,
  fetched_at timestamptz not null default now(),
  primary key (rate_date, base, quote, provider)
);
```

**Trigger**

```sql
-- app.touch(): BEFORE UPDATE auf allen synchronisierten Tabellen
--   new.version := old.version + 1; new.updated_at := now(); new.updated_by := auth.uid();
--   new.household_id := old.household_id; new.created_by := old.created_by; new.created_at := old.created_at;
-- app.member_limit(): BEFORE INSERT auf member -> Fehler, wenn schon 2 Mitglieder
-- app.broadcast(): AFTER INSERT/UPDATE auf allen synchronisierten Tabellen
--   perform realtime.broadcast_changes('household:' || new.household_id, tg_op, tg_op,
--                                      tg_table_name, tg_table_schema, new, old);
-- public.ping(): security definer, gibt now() zurück (für Keep-alive, liest keine Daten)
```

**RLS-Policies**

```sql
create function app.is_member(hh uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.member m
                 where m.household_id = hh and m.user_id = (select auth.uid()));
$$;
revoke all on function app.is_member(uuid) from public;
grant execute on function app.is_member(uuid) to authenticated;

revoke all on all tables in schema public from anon;

-- household: lesen + ändern, kein insert/delete vom Client
alter table public.household enable row level security;
create policy hh_sel on public.household for select to authenticated using (app.is_member(id));
create policy hh_upd on public.household for update to authenticated using (app.is_member(id)) with check (app.is_member(id));

-- member: Haushalt sehen, nur eigene Zeile ändern; Anlegen nur per Admin/SQL
alter table public.member enable row level security;
create policy m_sel on public.member for select to authenticated using (app.is_member(household_id));
create policy m_upd on public.member for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Muster für category, entry, budget, income, fixed_cost, goal, goal_contribution, scenario:
alter table public.entry enable row level security;
create policy e_sel on public.entry for select to authenticated using (app.is_member(household_id));
create policy e_ins on public.entry for insert to authenticated
  with check (app.is_member(household_id) and created_by = (select auth.uid()));
create policy e_upd on public.entry for update to authenticated
  using (app.is_member(household_id)) with check (app.is_member(household_id));
-- bewusst KEINE delete-Policy: Löschen = Soft Delete (deleted_at)

-- fx_rate: alle Angemeldeten lesen/einfügen, nie ändern
alter table public.fx_rate enable row level security;
create policy fx_sel on public.fx_rate for select to authenticated using (true);
create policy fx_ins on public.fx_rate for insert to authenticated with check (true);

-- Realtime-Autorisierung für private Broadcast-Kanäle
create policy rt_sel on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast'
         and realtime.topic() like 'household:%'
         and app.is_member(split_part(realtime.topic(), ':', 2)::uuid));
```

**Storage-Policies**

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg']);

-- Pfad: {household_id}/{entry_id}/{uuid}.jpg
create policy r_sel on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and app.is_member(((storage.foldername(name))[1])::uuid));
create policy r_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and app.is_member(((storage.foldername(name))[1])::uuid));
create policy r_upd on storage.objects for update to authenticated
  using (bucket_id = 'receipts' and app.is_member(((storage.foldername(name))[1])::uuid));
create policy r_del on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and app.is_member(((storage.foldername(name))[1])::uuid));
```

Anzeige über `createSignedUrl` (1 h). Das Bild wird zusätzlich lokal in Dexie gecacht, damit es offline sichtbar bleibt. Speicherabschätzung: 1600-px-JPEG bei Qualität 0,75 ergibt ca. 200 bis 350 KB. Zwei Belege pro Tag über 12 Monate sind etwa 150 bis 250 MB, also innerhalb des Free-Limits von 1 GB.

**Rechenregeln (eine Quelle in `src/domain`, Parität zum SQL wird getestet):** Der Kurs wird intern als ganzzahlige Mikro-Einheit gespeichert (`1,61` → `1610000`). CAD-Betrag = `(amount_minor * rate_micro + 500000) / 1000000` mit BigInt. Das entspricht exakt `round()` in Postgres für positive Werte.

**Tests für RLS (pgTAP):** Person A sieht Daten von Haushalt X. Ein fremder Nutzer sieht nichts und kann nichts einfügen. `anon` sieht nichts. Ein Update über Haushaltsgrenzen schlägt fehl. Storage-Pfad eines fremden Haushalts wird abgewiesen.

---

## 3. Sync-Konzept

**Lokale Struktur (Dexie):** Je eine Tabelle pro Servertabelle (gleiche Felder plus `_dirty`), dazu `outbox` (`seq, table, row_id, op, patch, base_version, base_snapshot`), `conflicts`, `receipt_blobs` (`entry_id, blob, thumb, status`), `fx_rates`, `meta` (Pull-Cursor pro Tabelle, zuletzt bekannter Kurs, persist-Status).

**A. Erfassen offline**
1. Nutzer tippt Betrag, Kategorie, Speichern. Der Client erzeugt eine UUID und den Kurs (letzter bekannter, `fx_provisional = true`).
2. Eine Dexie-Transaktion schreibt die Zeile, legt den Outbox-Eintrag `insert` an und speichert das Beleg-Blob, falls vorhanden.
3. Die UI aktualisiert sich sofort über `useLiveQuery`. Häkchen-Animation, Status „1 wartet auf Sync“. Ziel: unter 5 s vom Tippen auf + bis gespeichert.
4. Weitere Änderungen an derselben Zeile werden in der Outbox zusammengefasst (ein Patch, ursprüngliche `base_version` bleibt).

**B. Wiederverbindung**
1. Auslöser: `online`, `visibilitychange` sichtbar, App-Start, 500 ms nach jeder lokalen Änderung, alle 60 s im Vordergrund.
2. **Push** in Outbox-Reihenfolge: `insert` per `upsert(id)` (Wiederholung ist idempotent). `update` per `.update(patch).eq('id', id).eq('version', base_version).select()`. Eine leere Antwort bedeutet Konflikt (siehe D).
3. **Belege:** Upload nach `{household}/{entry}/{uuid}.jpg`. Danach gilt `receipt_blobs.status = uploaded`, das lokale Bild bleibt als Cache.
4. **Kurse nachziehen:** Bei `fx_provisional` den Tageskurs holen, in `fx_rate` einfügen und den Eintrag als normales Update aktualisieren. Das macht nur das Gerät, das den Eintrag erstellt hat.
5. **Pull** pro Tabelle: `updated_at > cursor - 2 min` (Überlappung gegen Commit-Reihenfolge), seitenweise. Anwenden nur, wenn `remote.version > local.version` und keine offene Outbox für die Zeile existiert. Sonst gilt Fall D.

**C. Realtime-Update**
1. Nach dem Login wird der private Kanal `household:{id}` abonniert (Broadcast aus der DB per Trigger, autorisiert über RLS auf `realtime.messages`, die von Supabase empfohlene Variante gegenüber Postgres Changes).
2. Nachricht von Person B: Die Zeile wird mit derselben Versionsregel wie beim Pull angewendet. Danach folgt ein gebündelter Pull nach 1 s als Sicherheitsnetz.
3. Ohne Verbindung (iOS beendet Sockets im Hintergrund) übernimmt beim nächsten Vordergrund der Pull aus B. Realtime ist nur eine Beschleunigung, keine Voraussetzung.

**D. Konfliktfall**
1. Ein Push-Update liefert 0 Zeilen. Der Client lädt die Serverzeile.
2. **Automatisches Mergen:** Wenn sich die lokal geänderten Felder (Patch gegen `base_snapshot`) und die serverseitig geänderten Felder (Server gegen `base_snapshot`) nicht überschneiden, wird der Patch erneut mit `base_version = server.version` gesendet. Es erscheint kein Dialog.
3. **Echter Konflikt:** Ein Datensatz in `conflicts` (lokal und Server). Die Zeile zeigt „Konflikt“ (Info-Blau). Dialog nach M-Konflikt: abweichende Felder hervorgehoben.
   - *Diese Version behalten (meine):* Push mit `base_version = server.version`.
   - *Version der anderen Person:* lokale Änderung verwerfen, Serverzeile übernehmen.
   - *Beide behalten:* Serverzeile bleibt. Die lokale Version wird mit neuer UUID als neuer Eintrag eingefügt (nur bei `entry`).
4. Löschen gegen Bearbeiten: Wenn der Server die Zeile gelöscht hat und lokal bearbeitet wurde, fragt der Dialog „Wiederherstellen oder gelöscht lassen?“. Einstellungen und Kategorien gelten als Last-Write-Wins ohne Dialog (siehe Frage 11).

---

## 4. Ordnerstruktur und zentrale Module

```
.
├── .github/workflows/
│   ├── ci.yml              # Biome, tsc, Vitest, Build, Größen-Check, Privacy-Check, Playwright (Supabase lokal)
│   ├── deploy.yml          # Push auf main: Build mit VITE_BASE=/<repo>/ → upload-pages-artifact → deploy-pages
│   └── keepalive.yml       # alle 3 Tage rpc('ping'), siehe Frage 8
├── supabase/
│   ├── config.toml         # Supabase CLI (lokale Entwicklung, CI)
│   ├── migrations/         # 0001_core, 0002_rls, 0003_storage, 0004_realtime, 0005_functions
│   ├── tests/              # pgTAP: RLS- und Storage-Tests
│   ├── seed.sql            # NUR lokal/CI: Person A/B, @example.test, fiktive Beträge
│   └── bootstrap.example.sql  # Vorlage mit Platzhaltern; Kopie bootstrap.local.sql ist gitignored
├── public/                 # Icons (apple-touch-icon 180px, maskable), Favicon
├── scripts/
│   ├── check-privacy.mjs   # prüft Repo gegen Denylist (aus Secret bzw. lokaler, ignorierter Datei)
│   └── check-size.mjs      # Budget für initiales JS
├── src/
│   ├── main.tsx
│   ├── app/                # router.tsx (createHashRouter), AppShell (Mobil-Tabbar / Desktop-Sidebar), Providers
│   ├── styles/             # tokens.css (1:1 aus Design, .lt/.dk → :root/[data-theme]), base.css, safe-area.css
│   ├── ui/                 # Button, Chip, Segmented, ListRow, Card, Sheet, ProgressBar, StatusPill,
│   │                       # Amount, CategoryTile, Numpad, Toast, SwipeRow, HapticTarget, EmptyState
│   ├── icons/              # Kategorie-Icons als TSX (currentColor) + UI-Icons
│   ├── charts/             # DonutChart (Übersicht, im Haupt-Bundle, klein), LineChart, BarChart, CategoryBars (lazy)
│   ├── domain/             # REINE Logik, ohne React/DB:
│   │   ├── money.ts        #   Minor Units, BigInt-Umrechnung, Rundung
│   │   ├── fx.ts           #   Kursauswahl (letzter verfügbarer), Provisorium
│   │   ├── schedule.ts     #   Wiederholungen (once/week/month/year, Monatsende)
│   │   ├── budget.ts       #   Monatsstand, 80-%-/Überschreitungs-Status, pro Tag möglich
│   │   ├── income-split.ts #   Kreisdiagramm: Einnahmen → Fix / Budget / Andere / Sparen / Frei
│   │   ├── goals.ts        #   Stand, nötige Rate, Plan-Abweichung, erreicht
│   │   ├── projection.ts   #   Ist + Prognose kumuliert bis Zeitraumende
│   │   ├── scenario.ts     #   Regler pro Kategorie, Extras, Differenz Basis/Szenario
│   │   ├── merchant.ts     #   Normalisierung, Kategorie-Vorschlag aus Historie
│   │   └── ocr-parse/      #   total.ts, date.ts, merchant.ts, amount.ts, confidence.ts
│   ├── data/
│   │   ├── db.ts           # Dexie-Schema und Migrationen
│   │   ├── supabase.ts     # Client (URL + Publishable Key aus import.meta.env)
│   │   ├── repos/          # Hooks/Queries pro Entität (useEntries, useBudgetMonth …)
│   │   ├── sync/           # engine.ts (Zustandsmaschine), outbox.ts, push.ts, pull.ts, realtime.ts, merge.ts
│   │   ├── receipts/       # compress.ts (Canvas → JPEG 1600px), queue.ts, signed-url.ts
│   │   └── fx/             # frankfurter.ts, cache.ts
│   ├── ocr/                # worker.ts (Tesseract, lazy), preprocess.ts, index.ts
│   ├── features/           # auth, overview, capture, history, budgets, scan, planning,
│   │                       # projection, scenarios, settings, onboarding, conflicts, states
│   ├── i18n/               # de.ts (Quelle), en.ts (typgleich), t.ts, format.ts (Intl)
│   ├── platform/           # persist.ts, haptics.ts, online.ts, theme.ts, install-hint.ts
│   └── types/database.ts   # generiert: supabase gen types typescript
├── tests/e2e/              # Playwright: login, capture, offline-capture, conflict (Chromium + WebKit)
├── .env.example  .gitignore  biome.json  tsconfig.json  vite.config.ts  playwright.config.ts
├── CLAUDE.md  README.md
└── design-reference/       # nur lokal, in .gitignore
```

**Wichtige Details**
- `vite.config.ts`: `base: process.env.VITE_BASE ?? '/'`. PWA-Manifest mit `start_url: './'`, `scope: './'`, `display: 'standalone'`. Workbox precached die App-Shell. Runtime-Caching: Tesseract-Core/Worker/Sprachdaten (selbst gehostet unter `/ocr/`, CacheFirst, nicht im Precache), Frankfurter (NetworkFirst). Supabase-Aufrufe werden **nicht** vom SW gecacht, das erledigt Dexie.
- Theme: `:root` = hell. `@media (prefers-color-scheme: dark) { :root:not([data-theme=light]) {…dunkel} }`, `:root[data-theme=dark] {…}`. Dazu `color-scheme` und `meta theme-color` pro Modus.
- iOS: `apple-mobile-web-app-status-bar-style: black-translucent`, `viewport-fit=cover`, Abstände über `env(safe-area-inset-*)`. Splash: iOS erzeugt keinen Splash aus dem Manifest. Ohne `apple-touch-startup-image` (eines pro Gerätegröße) sieht man kurz eine Fläche in Hintergrundfarbe. Vorschlag: `background_color` = `--bg` und App-Shell sehr schnell rendern statt Dutzender Splash-Bilder. Wird in M6 auf dem Gerät geprüft.
- Kamera: `<input type="file" accept="image/*" capture="environment">` für „Foto aufnehmen“ und ohne `capture` für die Mediathek. Der Kamera-Screen im Design (eigener Sucher, Blitz-Taste) ist als PWA so nicht möglich, ohne `getUserMedia` zu nutzen. Vorschlag: nativer Kamera-Dialog, danach direkt die Erkennung.
- Performance-Budget: initiales JS ≤ 200 KB gzip (in M1 messen, in CI erzwingen). Lazy geladen: OCR, Diagramme/Planung, Desktop-Tabelle, Konflikt-Dialog.

---

## 5. Meilensteine (jeweils lauffähig und deploybar)

**M1 Grundgerüst, Tokens, Login, Deploy**
- Vite/React/TS/Biome/Vitest-Setup, `.gitignore` (inkl. `design-reference/`, `.env*`, `supabase/bootstrap.local.sql`), `.env.example`, CLAUDE.md, README.
- `tokens.css` 1:1 aus dem Design plus Theme-Umschaltung. UI-Grundbausteine (Button, Chip, Segmented, Card, ListRow, StatusPill). Icons als TSX.
- Supabase-Migrationen 0001 bis 0005 (alle Tabellen, RLS, Storage, Realtime, `ping`), pgTAP-Tests, `seed.sql` und `bootstrap.example.sql`.
- Login-Screen (DE/EN-Umschalter), Session-Handling, Shell mit Tabbar/Sidebar und leeren Seiten.
- PWA-Manifest, SW, Icons, `persist()`. Workflows `ci.yml` und `deploy.yml` (Pages über Actions), Privacy-Check.
- *Fertig, wenn:* Login auf dem iPhone in der installierten App klappt, RLS-Tests grün sind, Lighthouse-PWA-Prüfungen bestehen und die Frankfurter-CORS-Abfrage vom Pages-Origin funktioniert.

**M2 Erfassen, Übersicht, Verlauf, Budgets mit Offline-Queue und Sync**
- Dexie-Schema, Sync-Engine (A bis D vollständig inkl. Konflikt-Dialog), Realtime-Kanal, Statusanzeige (Synchron / N warten / Offline).
- Erfassen-Sheet (Ziffernblock zuerst, CAD/EUR, Kategorie-Chips, Datum, bezahlt von, Händler/Notiz), Kurslogik.
- Übersicht (Noch verfügbar mit `DonutChart`-Komponente, vorerst ausgeblendet bis M4, Budgets, letzte Einträge), Verlauf mobil (Suche, Filter, Gruppen nach Tag, Wischen zum Bearbeiten/Löschen, Undo-Toast), Eintragsdetail, Budgets (80 % und Überschreitung nur Amber + Icon + Text).
- Kategorien verwalten (Einstellungen, Grundfunktion), Onboarding/Leer-Zustand.
- Tests: money, fx, budget, merge, Sync-Engine. Playwright: Erfassen, Offline-Erfassen und Sync.

**M3 Beleg-Scan mit OCR und Foto-Speicher**
- Foto/Mediathek, Komprimierung, Blob-Queue, Upload, Signed URLs, lokaler Bild-Cache, Zoom-Ansicht.
- OCR-Worker lazy, Vorverarbeitung, Parser für Summe, Datum und Händler mit Konfidenz. Screens Erkennung, Prüfen/Korrigieren, Fehlschlag. Kategorie-Vorschlag aus der Historie.
- Tests: Parser-Korpus (synthetische Texte, DE/EN-Formate, mehrdeutige Daten).

**M4 Einnahmen, Fixkosten, Sparziele**
- CRUD für alle drei, Wiederholungslogik, „Als Nächstes fällig“, Buchungsfluss für Fixkosten (je nach Frage 1).
- Sparziele mit Beiträgen, Plan-Abweichung, Zustand „Sparziel erreicht“ (einmal pro Person).
- Kreisdiagramm „Anteil am Einkommen“ in der Hero-Karte der Übersicht vollständig (alle fünf Segmente, Sonderfälle).
- Tests: schedule, goals, income-split.

**M5 Planung, Projektion, Szenarien, Desktop-Ansichten**
- Projektion (Ist + Prognose, kumulierter Überschuss bis Zeitraumende, Cashflow pro Monat).
- Szenarien: Regler pro Kategorie (−50 bis +50 % in 5er-Schritten), Einmalausgaben, neue Ziele, zwei Linien, Differenz am Ende beziffert, „Als Budgets übernehmen“.
- Desktop: Dashboard, Verlauf als Tabelle (Sortierung, Inline-Bearbeitung, Tastatur), Planung mit Seitenpanel.
- Tests: projection, scenario.

**M6 Feinschliff**
- Alle Zustände (offline, Sync ausstehend, Konflikt, OCR fehlgeschlagen, Budget überschritten, Ziel erreicht), vollständiges EN, Intl-Formate.
- Barrierefreiheit: axe-Prüfung in Playwright, Fokusführung in Sheets, 44-pt-Ziele, `prefers-reduced-motion`, VoiceOver-Test auf dem Gerät.
- Haptik über Switch-Overlays (Gerätetest iOS ≥ 26.5), Install-Hinweis, Splash-Verhalten, Lighthouse-Lauf, Größenbudget nachschärfen.

---

## 6. Einmalige Setup-Schritte für dich

1. **Supabase-Projekt anlegen** (Free), Region nahe an euch wählen, DB-Passwort im Passwortmanager speichern.
2. **Registrierung deaktivieren:** Authentication → Sign In / Providers → Email: aktiviert lassen, „Allow new users to sign up“ ausschalten.
3. **Zwei Nutzer anlegen:** Authentication → Users → Add user → Create new user (E-Mail, Passwort, „Auto Confirm User“). Zweimal.
4. **URL-Konfiguration:** Authentication → URL Configuration: Site URL = deine GitHub-Pages-URL, Redirect URLs zusätzlich `http://localhost:5173`.
5. **Migrationen einspielen:** Supabase CLI installieren, im Repo `supabase link --project-ref <ref>` und `supabase db push`.
6. **Haushalt anlegen:** `supabase/bootstrap.example.sql` lokal nach `supabase/bootstrap.local.sql` kopieren (ist gitignored), Platzhalter (Haushaltsname, Ort, Zeitraum, Anzeigenamen, E-Mails, Startkategorien, Budgets) ausfüllen und im SQL Editor ausführen.
7. **Keys holen:** Project Settings → API Keys: Project URL und **Publishable Key** (`sb_publishable_…`). Die alten `anon`-Keys werden laut Supabase-Doku bis Ende 2026 abgelöst, deshalb gleich den neuen Typ verwenden. Den Secret Key niemals in GitHub oder im Frontend verwenden.
8. **GitHub Pages:** Repo → Settings → Pages → Source: „GitHub Actions“.
9. **GitHub Variables:** Settings → Secrets and variables → Actions → *Variables*: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. Beide sind öffentlich im Bundle, durch RLS ist das unkritisch.
10. **GitHub Secret** `PRIVACY_DENYLIST`: eure echten Namen, E-Mails, Orte, je eine Zeile. CI bricht ab, wenn einer davon im Repo auftaucht. Lokal dieselbe Liste als `.privacy-denylist` (gitignored).
11. **Repo-Schutz:** Secret Scanning und Push Protection aktivieren. Branch-Schutz für `main` mit Pflicht-Check `ci`.
12. **Optional:** Custom SMTP (für „Passwort vergessen“, Frage 7) und Keep-alive-Workflow (Frage 8).
13. **iPhone:** Pages-URL in Safari öffnen → Teilen → „Zum Home-Bildschirm“ → in der installierten App anmelden (getrennter Speicher von Safari).
14. **Design-Referenz:** ZIP lokal ins Repo-Root entpacken (`design-reference/`, wird ignoriert).

---

## 7. Entwurf CLAUDE.md

```markdown
# Maple Jar

Gemeinsames Haushaltsbuch (PWA, offline-first) für einen Zwei-Personen-Haushalt.
Vite + React + TypeScript, Dexie (IndexedDB), Supabase (Auth, Postgres/RLS, Realtime, Storage), GitHub Pages.

## Datenschutz: harte Regeln (öffentliches Repo)
- NIE echte Personennamen, E-Mail-Adressen, Orte, Händler aus dem echten Leben oder echte Beträge
  in Code, Seeds, Tests, Fixtures, README, Commit-Messages, PR-Texten oder Screenshots.
- Beispieldaten nur mit „Person A“ / „Person B“, E-Mails `person-a@example.test`, neutrale Händler
  („Supermarkt A“, „Café B“), fiktive Beträge.
- Anzeigenamen, Haushaltsname, Ort (`place_label`), Zeitraum und Kategorien kommen zur Laufzeit aus der DB.
  Texte mit Ort/Namen nutzen i18n-Platzhalter (`{place}`, `{name}`), nie Literale.
- Die Design-Referenz enthält Ortsnamen und echte Händlernamen: NICHT übernehmen.
- Keine Secrets im Repo. Nur `VITE_SUPABASE_URL` und `VITE_SUPABASE_PUBLISHABLE_KEY` im Frontend.
  Secret-/Service-Keys gehören nie in den Client und nie ins Repo.
- Sicherheit hängt an RLS, nicht an geheimem Code. Jede neue Tabelle: RLS an, Policies + pgTAP-Test.
- `design-reference/`, `.env*` (außer `.env.example`), `supabase/bootstrap.local.sql`,
  `.privacy-denylist` bleiben ungetrackt.
- Vor jedem Commit: `npm run check:privacy`.

## Befehle
- `npm run dev`              Dev-Server (http://localhost:5173)
- `npm run build`            Produktions-Build (VITE_BASE setzt den Pages-Pfad)
- `npm run preview`          Build lokal mit Service Worker testen
- `npm run lint` / `format`  Biome
- `npm run typecheck`        tsc --noEmit (TypeScript 7)
- `npm test`                 Vitest (Domain, Sync, OCR-Parser)
- `npm run test:e2e`         Playwright (braucht `supabase start`)
- `npm run db:start`         Supabase lokal (Docker)
- `npm run db:test`          pgTAP-Tests (RLS, Storage)
- `npm run db:types`         Typen nach src/types/database.ts generieren
- `npm run check:privacy`    Denylist-Prüfung
- `npm run check:size`       Größenbudget für initiales JS

## Architektur in Kürze
- UI liest NUR aus Dexie (`useLiveQuery`). Schreiben = Dexie-Transaktion + Outbox-Eintrag.
- Sync-Engine in `src/data/sync/`: Push (Versionsprüfung), Pull (Cursor mit Überlappung), Realtime als Anstoß.
- Konflikte: Feld-Merge, sonst Dialog. Löschen nur als Soft Delete (`deleted_at`).
- Geschäftslogik ausschließlich in `src/domain/` (rein, ohne React/IO, vollständig getestet).
- Beträge immer Integer in Minor Units. Kurse als Mikro-Einheiten (BigInt). Kein `number`-Float für Geld.
- Router: Hash-Router. Base-Pfad nur über `import.meta.env.BASE_URL`.

## Konventionen
- TypeScript strict, keine `any`. Dateinamen kebab-case, Komponenten PascalCase.
- Styling über CSS Modules + Tokens aus `src/styles/tokens.css`. Keine Hex-Farben in Komponenten
  (Ausnahme: Kategoriefarben kommen aus der DB).
- Ahorn-Rot (`--acc`) nur für Aktion/Auswahl. Warnungen nur Amber + Icon + Text, nie Rot.
- Alle Texte über `t()`; DE ist Quelle, EN muss typgleich sein. Zahlen/Datum nur über `src/i18n/format.ts`.
- Touch-Ziele ≥ 44 px, sichtbarer Fokus, `prefers-reduced-motion` respektieren, Status nie nur über Farbe.
- Haptik nur über `HapticTarget` (direkter Tap), immer mit visuellem Feedback.
- Schwere Module (OCR, Diagramme, Desktop-Tabelle) nur per `import()`.
- Commits: Conventional Commits auf Englisch (`feat:`, `fix:` …), ohne personenbezogene Daten.

## Definition of Done
Lint, Typecheck, Unit-Tests, RLS-Tests und Build grün. Neue Logik hat Tests in `src/domain` bzw. `src/data/sync`.
UI-Änderungen in Hell und Dunkel geprüft. Größenbudget eingehalten. Privacy-Check grün.
```

---

## 8. Offene Fragen an dich (mit meinem Vorschlag als Standard)

1. **Fixkosten buchen:** Sollen fällige Fixkosten automatisch als Eintrag gebucht werden oder per Tipp „als bezahlt buchen“ in der Liste „Als Nächstes fällig“? Zählen sie ins Budget ihrer Kategorie? *Vorschlag:* Tipp zum Bestätigen, `autobook` pro Fixkosten einschaltbar. Ja, sie zählen ins Kategorie-Budget, in der Projektion aber nicht doppelt (Durchschnitt der variablen Ausgaben ohne `fixed_cost_id`).
2. **Sparpläne (z. B. ETF):** Im Design ist der ETF-Sparplan eine Fixkosten-Position. Ausgabe oder Sparen? *Vorschlag:* Fixkosten erhalten das Merkmal „ist Sparen“. Solche Posten zählen in der Sparquote als gespart, nicht als Ausgabe.
3. **Einnahmen:** Gelten geplante Einnahmen am Stichtag automatisch als eingegangen (wichtig für die Sparquote „bisher“)? *Vorschlag:* ja, automatisch. Abweichungen werden über eine einmalige Korrektur-Einnahme erfasst.
4. **Szenarien:** Gemeinsam gespeichert (benannt, mehrere) oder nur temporär im Browser? Soll „Als Budgets übernehmen“ in v1 enthalten sein? *Vorschlag:* ein gemeinsames gespeichertes Arbeitsszenario plus „Als Budgets übernehmen“ (ab dem nächsten Monat).
5. **Sparziel-Beiträge:** Manuell erfassen oder monatlich automatisch in Höhe der nötigen Rate? *Vorschlag:* manuell mit Vorschlagsbetrag (ein Tipp).
6. **Kursquelle:** EZB oder Bank of Canada (beide über Frankfurter)? *Vorschlag:* EZB, in den Einstellungen umstellbar.
7. **„Passwort vergessen?“:** Supabases Standard-Mailer sendet nur an Mitglieder der Supabase-Organisation und nur ca. 2 Mails pro Stunde. Optionen: (a) Custom SMTP einrichten und Reset per 6-stelligem Code in der App (funktioniert in der iOS-App ohne Link), (b) Reset nur durch dich im Dashboard, der Link zeigt dann einen Hinweistext. *Vorschlag:* (b) für den Start, (a) später möglich.
8. **Supabase-Pause:** Ist der Keep-alive-Workflow (alle 3 Tage `ping`) in Ordnung, oder lieber Pro für ca. 25 USD/Monat? *Vorschlag:* Keep-alive.
9. **Belegsprachen:** Nur Englisch-Erkennung (kleiner, schneller) oder zusätzlich Deutsch bzw. Französisch? *Vorschlag:* `eng`, Deutsch als Option in den Einstellungen.
10. **Kontraste:** Weiße Chip-Schrift auf Gesundheit, Sonstiges und Geschenke liegt unter 4,5:1. Farben leicht abdunkeln (Vorschlag: so wenig wie nötig, bis 4,5:1 erreicht ist, wird per Test geprüft) oder ausgewählte Chips mit dunkler Schrift? *Vorschlag:* abdunkeln. Und Dunkel-Schatten: Wert aus Komponenten.dc.html (`.05`)?
11. **Konflikt-Dialog für welche Daten?** *Vorschlag:* Einträge, Fixkosten, Einnahmen, Ziele mit Dialog. Kategorien, Budgets, Haushalts- und Profileinstellungen per Last-Write-Wins.
12. **Startkategorien:** Darf das Repo eine *generische* Vorlage enthalten (Namen wie „Lebensmittel“, Farben, Icons aus dem Design), die das Onboarding anbietet und in die DB schreibt? Oder sollen Kategorien ausschließlich über dein lokales Bootstrap-SQL kommen? *Vorschlag:* generische Vorlage im Onboarding, weil sie nichts Persönliches enthält.
13. **Kategorienamen zweisprachig?** Kategorien sind Nutzerdaten in einer Sprache. Die Umschaltung DE/EN betrifft nur die Oberfläche. *Vorschlag:* so lassen.
14. **Kamera-Screen:** Ein eigener Sucher mit Rahmen und Blitz (wie im Design) bräuchte `getUserMedia` und ist in iOS-PWAs fehleranfällig. Ist der native Kamera-Dialog über `<input capture>` in Ordnung? *Vorschlag:* nativ.
15. **Szenarien mobil:** Das Design verweist für Szenarien auf den Desktop. Sollen die Regler mobil gestapelt ebenfalls verfügbar sein? *Vorschlag:* ja, gleiche Komponente, gestapelt.
16. **Export/Backup:** Nicht im Umfang, aber als Absicherung gegen Datenverlust sinnvoll: ein JSON/CSV-Export in den Einstellungen? *Vorschlag:* ja, klein, in M6.
17. **Kreisdiagramm, Zeitbezug:** Zeigt es den laufenden Monat bis heute (Frei schrumpft im Monatsverlauf) oder den ganzen Monat inkl. noch fälliger Fixkosten als „geplant“? *Vorschlag:* bis heute, noch fällige Fixkosten nicht eingerechnet.
18. **Pages-URL:** Projektseite unter `<user>.github.io/maple-jar/` oder eigene Domain? *Vorschlag:* Projektseite. Die Base wird automatisch aus dem Repo-Namen gesetzt.

---

## Verifikation (pro Meilenstein und am Ende)

- `npm run lint && npm run typecheck && npm test && npm run build && npm run check:size && npm run check:privacy` lokal und in CI.
- `supabase start && npm run db:test`: RLS-Tests für Haushaltsgrenzen, `anon`, Storage-Pfade.
- `npm run test:e2e` gegen lokales Supabase (Chromium + WebKit): Login, Erfassen unter 5 Interaktionen, Offline-Erfassen (`context.setOffline(true)`) → Online → Datensatz in der DB, Konflikt mit zwei Browser-Kontexten, axe ohne Verstöße.
- Nach dem Deploy: Lighthouse (PWA, Performance, Barrierefreiheit) gegen die Pages-URL. Prüfen, dass der Frankfurter-Abruf vom Pages-Origin funktioniert.
- Auf dem iPhone (ab M1, spätestens M6): Installation, Anmeldung in der App, Flugmodus-Test, Kamera/Mediathek, Safe Areas, Hell/Dunkel/Auto, VoiceOver, Haptik (iOS ≥ 26.5, nur direkter Tap).

## Quellen

- Supabase Pricing und Pausing: [supabase.com/pricing](https://supabase.com/pricing), [Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing), [API Keys](https://supabase.com/docs/guides/api/api-keys.md), [Auth SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Realtime: Migrate to Broadcast](https://supabase.com/docs/guides/realtime/migrate-from-postgres-changes)
- Firebase Storage/Blaze: [Firebase FAQ Storage-Änderungen](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)
- Frankfurter: [frankfurter.dev](https://frankfurter.dev/), [JS-Doku (CORS)](https://frankfurter.dev/javascript/), [Providers](https://frankfurter.dev/providers/); Bank of Canada: [Valet API](https://www.bankofcanada.ca/valet-api-how-to/)
- WebKit Storage: [Updates to Storage Policy](https://webkit.org/?p=14403), [MDN Storage quotas](https://developer.mozilla.org/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- iOS-Haptik: [WebKit Bug 285120](https://bugs.webkit.org/show_bug.cgi?id=285120), [ios-haptics (npm)](https://www.npmjs.com/package/ios-haptics), [project-fathom (iOS 26.5)](https://github.com/m1ckc3s/project-fathom)
- TypeScript 7: [InfoQ](https://infoq.com/news/2026/08/typescript-7-released/), [DevClass](https://www.devclass.com/development/2026/07/10/speedier-type-checks-in-typescript-70-as-first-stable-go-release-ships/5269206)
- GitHub Pages: [Limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits), [Custom Workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- Tesseract.js 7: [Release](https://newreleases.io/project/npm/tesseract.js/release/7.0.0)
- Paketversionen: npm-Registry, abgefragt am 08.10.2026.

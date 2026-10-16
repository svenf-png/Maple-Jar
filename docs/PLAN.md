# Maple Jar: Umsetzungsplan (Version 3)

## Kontext

Gebaut wird eine offline-fähige PWA als gemeinsames Haushaltsbuch für zwei Personen, optimiert für iPhone (Home-Bildschirm) und mit Desktop-Ansicht. Als Spezifikation dient die Design-Referenz aus Claude Design (21 Screens, 19 Icons, Komponentenbibliothek). Das App-Repo ist öffentlich. Deshalb sind Datenschutz und Zugriffsschutz harte Randbedingungen.

**Änderungen gegenüber Version 1 und 2**
1. **Supabase als Backend (Entscheidung vom 12.10.2026).** Die App läuft weiter auf GitHub Pages. Die Daten liegen in einem eigenen **Supabase-Projekt** (Postgres, Auth, REST). Der Zugriff ist über Row Level Security auf die zwei Haushaltsmitglieder beschränkt, die Registrierung ist deaktiviert. Version 2 sah ein privates GitHub-Daten-Repo vor, das in M1 umgesetzt wurde und in M2 Teil A ersetzt wird. Grund: echte Datenbank mit Konten und serverseitiger Zugriffskontrolle statt Token auf ein Repo.
2. **Kein Beleg-Bereich.** Scannen, Texterkennung (OCR) und Fotos entfallen komplett. Der frühere Meilenstein M3 fällt weg, und das schwere OCR-Paket ist nicht mehr nötig.
3. **Bedienung angelehnt an Splitwise.** Das Produktkonzept bleibt unverändert: gemeinsamer Topf, kein Ausgleich, keine Schulden. Übernommen werden nur Bedienmuster: Aktivitäts-Feed, Änderungshistorie pro Eintrag, Kategorie-Vorschlag beim Tippen der Beschreibung, wiederkehrende Ausgaben, schnelles Hinzufügen.

### Was in der Design-Referenz auffiel

- **Tokens sind nicht in allen Dateien gleich.** Die Basis-Tokens (`--bg` bis `--shadow`) sind überall identisch. Einige Screens ergänzen weitere: `--bar`, `--scrim`, `--grid`, `--side`, `--line`/`--line2` (Alias für `--base`/`--scen`), `--rowHover`, `--hill1`/`--hill2` (Illustrationen; Login und Leer-Zustand verwenden im Dunkelmodus unterschiedliche Werte). Ich führe alles in einer Datei `tokens.css` zusammen. Der Dunkel-Schatten ist in Komponenten.dc.html `.05`, in 13 Screens `.04`. Vorschlag: Die Komponentenbibliothek gilt als maßgeblich.
- **Ortsbezug im Design:** Einige Design-Texte nennen einen konkreten Ort, reale Händlernamen und konkrete Reiseziele. Diese dürfen **nicht** in Code, Tests oder Screenshots landen. Der Ort wird als `household.placeLabel` zur Laufzeit geladen (`{place}`-Platzhalter in i18n). Der Verbinden-Screen läuft vor dem Zugriff auf die Daten und zeigt deshalb einen neutralen Text. In Tests werden neutrale Händler wie „Supermarkt A“ oder „Café B“ verwendet.
- **Kontrast (selbst nachgerechnet, WCAG 2.x):** Weiße Schrift auf Kategoriefarbe erreicht bei *Gesundheit* `#6F8A1E` nur 3,94:1, bei *Sonstiges* `#857A6E` 4,19:1 und bei *Geschenke* `#B5602F` 4,49:1. Für Fließtext ist das unter AA (4,5:1). Für weiße Icons genügen 3:1, das erfüllen alle Farben. `--label3` hell erreicht auf `--bg` nur 3,34:1 und ist nur für Dekoratives gedacht. Alle übrigen Token-Paare bestehen AA. Ein Unit-Test prüft künftig alle Paare automatisch.
- **Logik im Design:** Budgets laufen pro Kalendermonat, die Gesamtsumme ergibt sich aus den Kategoriebudgets. „Pro Tag möglich“ = Rest geteilt durch verbleibende Tage. Projektion = Einnahmen minus Fixkosten minus Sparraten minus variable Ausgaben (Durchschnitt der letzten 3 Monate). Sparziele zeigen die nötige Rate pro Monat und „hinter Plan“ gemessen an einem linearen Plan. Fixkosten erscheinen auch im Verlauf als Einträge. Szenarien haben „Als Budgets übernehmen“.
- **Screens, die entfallen oder sich ändern:** Alle Scan-Screens (Kamera, Erkennung, Korrektur, Fehler) entfallen. Das Eintragsdetail zeigt statt Belegfoto die Änderungshistorie. Der Login-Screen wird zum „Verbinden“-Screen (Projekt-URL, öffentlicher Schlüssel, Benutzername und Passwort statt E-Mail und Passwort). Im Erfassen-Sheet entfällt der Scan-Knopf.

### Kreisdiagramm „Anteil am Einkommen“ auf der Übersicht

- **Ort:** In der Hero-Karte „Noch verfügbar“, als kleiner Donut (ca. 96 px) rechts neben dem Hero-Betrag, darunter eine kompakte Legende mit Betrag und Prozent je Segment.
- **Ganzer Kreis = Einnahmen des laufenden Monats** in CAD (geplante Einnahmen gelten am Stichtag als eingegangen, Frage 3).
- **Segmente:** Fixkosten · Budget-Ausgaben (Kategorien mit Budget) · Andere Ausgaben (Kategorien ohne Budget) · Sparen (Beiträge zu Sparzielen plus als „Sparen“ markierte Fixkosten, Frage 2) · Frei (Rest, in Spurfarbe `--fill`).
- **Sonderfälle:** Noch keine Einnahmen: Kreis = Summe der Ausgaben mit Hinweistext. Ausgaben über dem Einkommen: Kreis wird auf die Ausgaben skaliert, der Überlauf erscheint als Amber-Segment mit Icon und Text (kein Rot).
- **Darstellung:** eigene SVG-Komponente `DonutChart`. Segmentfarben aus Tokens, nie `--acc`, Amber nur für den Überlauf, Helligkeitsunterschied zwischen Nachbarn. Farbwahl bei der Umsetzung mit dem dataviz-Skill und Kontrast-Test. `role="img"` mit `aria-label` als Satz, Legende als echte Liste, `prefers-reduced-motion` respektiert.
- **Logik:** `src/domain/income-split.ts` (rein, getestet: Normalfall, keine Einnahmen, Überlauf, EUR, Rundung auf genau 100 %).

---

## 1. Architekturentscheidung

| Baustein | Entscheidung | Version (npm, geprüft am 08.10.2026) |
|---|---|---|
| Build | Vite | 8.3.x |
| UI | React + TypeScript | React 19.3, TypeScript 7.0 |
| Routing | React Router, **Hash-Router** | 8.4.x (benötigt Node ≥ 22.22) |
| Styling | CSS Custom Properties + CSS Modules, kein UI-Framework | nichts zusätzlich |
| Diagramme | Eigene SVG-Komponenten (Donut, Linie, Balken) | keine Lib |
| PWA | vite-plugin-pwa (Workbox, `generateSW`) | 2.0.0 (Peer: Vite ^8) |
| Lokale DB | Dexie + dexie-react-hooks (`useLiveQuery`) | 4.4.x |
| **Backend** | **Supabase (Postgres + Auth + REST), Ereignisprotokoll in Tabelle `events`, RLS, eigener `fetch`-Client** | keine Lib |
| Anmeldung | Benutzername + Passwort (Supabase Auth mit synthetischer Adresse, Registrierung deaktiviert) | keine Lib |
| Validierung | Zod (Mini-Variante) für alle gelesenen Ereignisse | 4.6.x |
| i18n | Eigene kleine Lösung (typisierte Wörterbücher + Intl) | keine Lib |
| Lint/Format | Biome | 2.5.x |
| Tests | Vitest, Playwright (+ @axe-core/playwright) | Vitest 5.0, Playwright 1.64 |
| CI-Node | Node 24 LTS | |

**Begründungen**
- **Hash-Router:** GitHub Pages kennt keine SPA-Umleitung. Hash-URLs funktionieren ohne 404-Trick, und der Service-Worker-Scope bleibt einfach der Base-Pfad.
- **Biome statt ESLint:** TypeScript 7 (stabil seit Juli 2026, nativer Go-Compiler) hat noch keine stabile Programmier-API. `typescript-eslint` 8.71 verlangt laut Peer-Dependency `typescript <6.1.0`. Typprüfung über `tsc --noEmit`.
- **Eigenes i18n:** Zwei Sprachen rechtfertigen keine Bibliothek. `de.ts` ist die Quelle, `en.ts` muss typgleich sein. Zahlen, Währungen und Datum über `Intl` (`de-DE`, `en-CA`). `Intl.NumberFormat('de-DE', {style:'currency', currency:'CAD'})` ergibt „84,17 CA$“ wie im Design.
- **Kein Supabase-SDK (`supabase-js`):** Es werden nur Anmeldung, Haushalt lesen/anlegen, Ereignisse anhängen und Ereignisse ab Cursor lesen gebraucht. Ein eigener, kleiner Client hält das Startpaket unter dem Budget.
- **Austauschbarer Transport:** Der Sync spricht nur mit einer Schnittstelle `SyncTransport` (anmelden, Haushalt, Ereignisse anhängen, Ereignisse ab Cursor lesen). Es gibt die Supabase-Implementierung für den Betrieb und `MemoryTransport` für Tests. Ein späterer Wechsel des Backends betrifft nur diese Schicht (der Wechsel von GitHub zu Supabase hat das bestätigt).

### Warum Supabase als Backend funktioniert

- Postgres mit Row Level Security (RLS) ist die Zugriffsgrenze: Nur Mitglieder des Haushalts lesen und schreiben, Ereignisse sind append-only. Die Registrierung ist im Projekt deaktiviert, die zwei Konten legt der Nutzer im Dashboard an.
- Aufrufe direkt aus dem Browser über die REST-API des Projekts (PostgREST) und die Auth-API. Die Projekt-URL und der öffentliche Schlüssel werden zur Laufzeit eingegeben.
- **Pausierung (Free-Plan):** Projekte mit geringer Aktivität über 7 Tage werden pausiert, **nicht gelöscht**. Nach der aktuellen Doku sind pausierte Projekte bis zu 1 Jahr wiederherstellbar (ältere Angabe: 90 Tage), danach nur noch als Backup-Download. Gegenmaßnahmen: geplanter Ping per GitHub Actions (`keepalive.yml`), JSON-Export in den Einstellungen, auf Wunsch bezahlter Plan (wird nie pausiert). Welche Anfrage als Aktivität zählt, wird in M2 gegen die Doku geprüft.
- Die Ereignisse und die Änderungshistorie der Datenbank sind das Backup. Zusätzlich exportiert die App auf Wunsch alle Ereignisse als JSON.

### Wechselkurse

**Frankfurter API v2**, ohne Key, CORS offen ([frankfurter.dev](https://frankfurter.dev/), [JS-Doku](https://frankfurter.dev/javascript/)): `GET https://api.frankfurter.dev/v2/rate/EUR/CAD?date=YYYY-MM-DD&providers=ECB`. Der Anbieter wird gepinnt (Standard EZB, Bank of Canada ebenfalls verfügbar, Frage 6), damit Kurse reproduzierbar sind. An Wochenenden und Feiertagen kommt der letzte verfügbare Kurs (Datum wird als `fxRateDate` gespeichert). Offline wird der zuletzt bekannte Kurs genommen und als `fxProvisional` markiert. Online zieht das erfassende Gerät den Tageskurs nach. Der Kurs steht am Eintrag selbst, eine gemeinsame Kurstabelle ist nicht nötig.

### Die größten Risiken und Gegenmaßnahmen

1. **Sicherheit der Zugangsdaten.** Benutzername, Passwort und die Sitzungs-Token liegen im Browser (Passwort nur während der Anmeldung, danach Zugriffs- und Refresh-Token). Wer ein Gerät mit offener Sitzung übernimmt, hat Zugriff auf den Haushalt.
   *Gegenmaßnahmen:* RLS als einzige Sicherheitsgrenze (die App-Logik ist keine). Registrierung deaktiviert. Strenge Content Security Policy per `<meta>` (`script-src 'self'`, `connect-src` nur `*.supabase.co` und `api.frankfurter.dev`), keine Fremd-Skripte, kein `dangerouslySetInnerHTML`. Passwort und Token nie loggen und nie in Fehlermeldungen. Refresh-Token rotieren und sofort persistieren. Abmelden löscht Sitzung und lokale Daten. **Wichtig:** Alle Pages-Projekte eines Kontos teilen sich den Origin `<konto>.github.io`. Ein anderes Pages-Projekt desselben Kontos könnte also gespeicherte Sitzungen lesen. Deshalb unter diesem Konto keine weiteren Pages-Seiten mit Fremdcode betreiben oder eine eigene Subdomain nutzen (Frage 14).
2. **iOS-Speicher-Eviction.** Home-Bildschirm-Apps haben laut WebKit einen eigenen Nutzungszähler, die 7-Tage-Regel des Browser-Tabs greift dort nicht wie im Tab ([WebKit](https://webkit.org/?p=14403)). `persist()` wird von Safari ohne Rückfrage entschieden.
   *Gegenmaßnahmen:* Die Supabase-Datenbank ist die Wahrheit, IndexedDB nur Cache plus Outbox. Die Outbox wird bei jeder Gelegenheit sofort hochgeladen (iOS kennt keine Background Sync API). `persist()` bei jedem Start anfragen. Zähler „N warten auf Sync“ immer sichtbar. Nach einer Eviction: erneut anmelden (Passwortmanager), dann voller Abgleich ab Cursor 0. Auf iOS haben Home-Bildschirm-App und Safari getrennten Speicher, also in der installierten App verbinden.
3. **Sync-Korrektheit ohne Server-Logik.** Es gibt keine serverseitige Prüfung und keine Transaktionen über Geräte hinweg.
   *Gegenmaßnahmen:* Ereignisprotokoll statt Zustandsdateien: Ereignisse werden nur angehängt (idempotent über die Ereignis-ID), dadurch blockieren sich Geräte nie gegenseitig. Der Zustand wird lokal deterministisch aus allen Ereignissen berechnet (Hybrid Logical Clock gegen Uhrabweichungen). Gleichzeitige Änderungen werden über die Basis-Version erkannt. Jedes gelesene Ereignis wird mit Zod validiert und versioniert. Die Sync-Engine ist eine reine Funktion, umfassend getestet mit `MemoryTransport`.
4. **(Zusatz) iOS-Haptik und Ausfallzeiten.** Seit iOS 26.5 löst nur ein **direkter Fingertipp** auf ein `<input type="checkbox" switch>` noch einen Tick aus, per Skript nicht mehr (mehrere übereinstimmende Quellen, keine offizielle Apple-Aussage). Haptik deshalb nur über unsichtbare Switch-Overlays unter Speichern und Chips, immer mit visuellem Feedback. Fällt Supabase aus oder ist das Projekt pausiert, arbeitet die App lokal weiter, die Outbox wartet. Die Pausierung des Free-Plans ist ein eigenes Risiko (siehe oben, Gegenmaßnahmen: Keep-Alive, Export).

---

## 2. Datenmodell

### 2.1 Datenbank (Supabase-Projekt)

```
household    # genau eine Zeile: Format-Version, Haushalts-ID, Startwerte der Einstellungen (Name, Ort, Zeitraum, Kursquelle)
members      # user_id, username, display_name, color, locale, theme; höchstens 2 Zeilen
events       # seq (Server-Cursor), id, v, hlc, device, author, entity, row_id, op, base, data (jsonb); append-only
```

- Der Haushalt wird beim ersten Start über „Haushalt einrichten“ angelegt (`setup_household`), die zweite Person tritt beim ersten Login bei (`join_household`). Alle übrigen Daten (Einstellungen, Kategorien, Einträge …) sind Ereignisse. Das SQL liegt als Migration im Repo (`supabase/migrations/`), enthält aber weder Daten noch Namen.
- Pull erfolgt über `seq > cursor`, nicht über die HLC (die Einfügereihenfolge ist nicht die Ereignisreihenfolge). Push ist ein Insert mit „Duplikate ignorieren“ auf `id`.
- Mengengerüst: Bei zwei Personen und einem Jahr sind einige tausend Ereignisse realistisch, also wenige MB. Alles lokal zu berechnen ist unkritisch. Eine Verdichtung (Snapshot) ist erst bei Bedarf vorgesehen.

### 2.2 Ereignis-Format

```ts
type Event = {
  v: 1;                    // Schema-Version
  id: string;              // UUID
  hlc: string;             // Hybrid Logical Clock, z. B. "2027-02-18T17:46:01.123Z-0003-<deviceId>"
  device: string;          // deviceId (zufällig, lokal gespeichert)
  author: string;          // Nutzer-ID (auth.uid()), wird auf member gemappt
  entity: 'settings' | 'member' | 'category' | 'entry' | 'budget' | 'income'
        | 'fixedCost' | 'goal' | 'goalContribution' | 'scenario';
  rowId: string;           // UUID des Datensatzes
  op: 'create' | 'update' | 'delete' | 'restore';
  base: string[];          // IDs der letzten Ereignisse dieser Zeile, die der Autor kannte
  data?: Record<string, unknown>;  // create: vollständig; update: nur geänderte Felder
};
```

### 2.3 Entitäten (materialisiert in Dexie, Beträge immer Integer in Minor Units)

| Entität | Felder (Auszug) |
|---|---|
| `settings` (1×) | `name`, `placeLabel`, `periodStart`, `periodEnd`, `baseCurrency: 'CAD'`, `secondCurrency: 'EUR'`, `fxProvider` |
| `member` | `username`, `displayName`, `color`, `locale` (`de-DE`/`en-CA`), `theme` (`auto`/`light`/`dark`) |
| `category` | `name`, `icon` (Schlüssel im Icon-Set), `color`, `sort`, `hidden` |
| `entry` | `amountMinor`, `currency`, `fxRateMicro` (Kurs × 10⁶, CAD = 1 000 000), `fxRateDate`, `fxProvisional`, `bookedOn`, `categoryId`, `paidBy`, `merchant`, `note`, `source` (`manual`/`fixed`), `fixedCostId` |
| `budget` | `categoryId`, `validFrom` (Monatserster), `monthlyLimitCadMinor` |
| `income` | `name`, `memberId?`, `amountMinor`, `currency`, `unit` (`once`/`week`/`month`/`year`), `every`, `startsOn`, `endsOn?` |
| `fixedCost` | `name`, `amountMinor`, `currency`, `unit`, `every`, `startsOn`, `endsOn?`, `categoryId`, `icon?`, `isSaving`, `autobook` |
| `goal` | `name`, `icon`, `color`, `targetMinor`, `currency`, `startsOn`, `targetDate`, `archivedAt?` |
| `goalContribution` | `goalId`, `amountMinor` (in Zielwährung, ≠ 0), `contributedOn`, `memberId?`, `note` (nur anlegen und löschen) |
| `scenario` (1×, feste ID) | `categoryPct` (`{categoryId: -20}`, −50..50 in 5er-Schritten), `extras` (Einmalausgaben `expense` mit `on`, neue Ziele `goal` mit `on` und `targetDate`) |

Abgeleitet, nicht gespeichert: `amountCadMinor = (amountMinor * fxRateMicro + 500000n) / 1000000n` (BigInt), Stand eines Sparziels (Summe der Beiträge), „Ziel erreicht“, Kategorie-Vorschlag pro Händler (häufigste Kategorie, „Vorschlag aus N früheren Einkäufen“), Änderungshistorie und Aktivitäts-Feed (direkt aus den Ereignissen).

**Validierung beim Anwenden** (ersetzt Datenbank-Constraints): Zod-Schema pro Entität und Operation, Beträge > 0, Währung CAD/EUR, Referenzen müssen existieren (sonst wird das Ereignis als „wartet“ geparkt, bis die Referenz ankommt), höchstens zwei Mitglieder. Ungültige Ereignisse werden übersprungen und in den Einstellungen unter „Diagnose“ angezeigt, nie stillschweigend verworfen.

### 2.4 Zugriffsschutz (Row Level Security)

- RLS ist auf allen Tabellen aktiv. Mitglied ist, wessen `auth.uid()` in `members` steht.
- `events`: Mitglieder dürfen lesen und anhängen (`author = auth.uid()`), niemand darf ändern oder löschen.
- Registrierung gibt es nicht: Die zwei Konten legt der Nutzer im Dashboard an (Benutzername und Passwort, technisch mit synthetischer Adresse, keine echten E-Mail-Adressen). Ohne Anmeldung liefert die API nichts.
- Projekt-URL und öffentlicher Schlüssel stehen nicht im Repo. Beides wird beim Verbinden eingegeben. Der öffentliche Schlüssel ist kein Geheimnis, die Sicherheit liegt bei RLS und den Konten.
- Die Mitgliedsprüfung in der App ist eine Komfortprüfung, die eigentliche Sicherheit liegt in der Datenbank.

---

## 3. Sync-Konzept

**Lokale Struktur (Dexie):** `events` (alle bekannten Ereignisse), je eine materialisierte Tabelle pro Entität, `outbox` (eigene, noch nicht hochgeladene Ereignisse), `conflicts`, `meta` (Projekt-URL, öffentlicher Schlüssel, Sitzungs-Token, deviceId, HLC, Cursor `seq`).

**Verwendete Supabase-Endpunkte:** Auth-API (Passwort-Anmeldung, Token erneuern), REST-API auf `household`, `members` und `events` (Lesen ab `seq`, Anhängen mit „Duplikate ignorieren“) und die Funktionen `setup_household` und `join_household`. Genaue Pfade und Header werden in M2 gegen die aktuelle Supabase-Doku geprüft.

**A. Erfassen offline**
1. Nutzer tippt Betrag, Kategorie, Speichern. Ziel: unter 5 s vom Tippen auf + bis gespeichert.
2. Eine Dexie-Transaktion schreibt das Ereignis (`create`, `base: []`) in `events` und `outbox` und aktualisiert die materialisierte Zeile. Kurs: letzter bekannter, `fxProvisional = true`.
3. Die UI aktualisiert sich sofort über `useLiveQuery`. Häkchen-Animation, Status „1 wartet auf Sync“.

**B. Wiederverbindung**
1. Auslöser: `online`, `visibilitychange` sichtbar, App-Start, 2 s nach jeder lokalen Änderung, alle 60 s im Vordergrund.
2. **Push:** Alle Outbox-Ereignisse in einer Anfrage anhängen (Insert, Duplikate auf `id` ignorieren). Wiederholung ist immer sicher (z. B. zweiter Tab, Abbruch mitten im Senden). Bei Erfolg die Outbox leeren. Bei 401 einmal das Token erneuern, dann erneut versuchen.
3. **Kurse nachziehen:** Bei `fxProvisional` den Tageskurs holen und ein `update`-Ereignis erzeugen (nur das Gerät, das den Eintrag erstellt hat).
4. **Pull:** Ereignisse mit `seq` größer als der gespeicherte Cursor seitenweise lesen, validieren, einfügen und die betroffenen Zeilen neu berechnen. Den Cursor erst nach erfolgreicher Verarbeitung fortschreiben.

**C. Änderungen der anderen Person**
Es gibt in M2 keinen Live-Kanal (Realtime ist später optional). Änderungen erscheinen beim nächsten Pull: spätestens nach etwa 60 s, sofort beim Öffnen oder Zurückkehren in die App. Neue Aktivitäten der anderen Person werden im Aktivitäts-Feed als „neu“ markiert.

**D. Konfliktfall**
1. Beim Berechnen einer Zeile gelten zwei `update`-Ereignisse als **gleichzeitig**, wenn keines das andere in `base` kennt.
2. **Automatisches Mergen:** Betreffen sie verschiedene Felder, werden beide übernommen. Es erscheint kein Dialog.
3. **Echter Konflikt** (gleiches Feld, unterschiedliche Werte): Angezeigt wird vorläufig der Wert mit der späteren HLC (deterministisch auf beiden Geräten). Die Zeile ist als „Konflikt“ (Info-Blau) markiert. Der Dialog nach M-Konflikt hebt die abweichenden Felder hervor:
   - *Diese Version behalten* oder *Version der anderen Person*: neues `update`-Ereignis mit `base` = beide Ereignis-IDs.
   - *Beide behalten* (nur bei Einträgen): die unterlegene Version wird als neuer Eintrag angelegt.
   Wer zuerst auflöst, entscheidet. Das andere Gerät sieht nach dem nächsten Pull die Auflösung, und der Konflikt verschwindet.
4. Löschen gegen Bearbeiten (gleichzeitig): Dialog „Wiederherstellen oder gelöscht lassen?“. Einstellungen, Kategorien und Budgets: Last-Write-Wins ohne Dialog (Frage 11).

---

## 4. Ordnerstruktur und zentrale Module

```
.
├── .github/workflows/
│   ├── ci.yml              # Biome, tsc, Vitest, Build, Größen-Check, Privacy-Check, Playwright (gegen MemoryTransport)
│   ├── deploy.yml          # Push auf main: Build mit VITE_BASE=/<repo>/ → upload-pages-artifact → deploy-pages
│   └── keepalive.yml       # geplanter Ping gegen das Supabase-Projekt (Secrets), gegen die Pausierung
├── public/                 # Icons (apple-touch-icon 180px, maskable), Favicon
├── supabase/
│   ├── migrations/         # SQL (Schema, RLS, Funktionen), ohne Daten und Namen
│   ├── tests/rls-check.sql # manuelle RLS-Prüfung im SQL-Editor
│   └── README.md           # manuelle Schritte und Prüfliste
├── scripts/
│   ├── check-privacy.mjs   # prüft Repo gegen Denylist (aus Secret bzw. lokaler, ignorierter Datei)
│   └── check-size.mjs      # Budget für initiales JS
├── src/
│   ├── main.tsx
│   ├── app/                # router.tsx (createHashRouter), AppShell (Mobil-Tabbar / Desktop-Sidebar), Providers
│   ├── styles/             # tokens.css (1:1 aus Design), base.css, safe-area.css
│   ├── ui/                 # Button, Chip, Segmented, ListRow, Card, Sheet, ProgressBar, StatusPill,
│   │                       # Amount, CategoryTile, Numpad, Toast, SwipeRow, HapticTarget, EmptyState
│   ├── icons/              # Kategorie-Icons als TSX (currentColor) + UI-Icons
│   ├── charts/             # DonutChart (klein, im Haupt-Bundle), LineChart, BarChart, CategoryBars (lazy)
│   ├── domain/             # REINE Logik, ohne React/IO:
│   │   ├── money.ts        #   Minor Units, BigInt-Umrechnung, Rundung
│   │   ├── fx.ts           #   Kursauswahl, Provisorium
│   │   ├── schedule.ts     #   Wiederholungen (once/week/month/year, Monatsende)
│   │   ├── budget.ts       #   Monatsstand, 80-%-/Überschreitungs-Status, pro Tag möglich
│   │   ├── income-split.ts #   Kreisdiagramm: Einnahmen → Fix / Budget / Andere / Sparen / Frei
│   │   ├── goals.ts        #   Stand, nötige Rate, Plan-Abweichung, erreicht
│   │   ├── projection.ts   #   Ist + Prognose kumuliert bis Zeitraumende
│   │   ├── scenario.ts     #   Regler pro Kategorie, Extras, Differenz Basis/Szenario
│   │   ├── merchant.ts     #   Normalisierung, Kategorie-Vorschlag aus Historie
│   │   └── activity.ts     #   Aktivitäts-Feed und Änderungshistorie aus Ereignissen
│   ├── data/
│   │   ├── db.ts           # Dexie-Schema und Migrationen
│   │   ├── events/         # schema.ts (Zod), hlc.ts, fold.ts (Ereignisse → Zeilen, Konflikterkennung)
│   │   ├── remote/         # sync-transport.ts (Schnittstelle), supabase-transport.ts, memory-transport.ts
│   │   ├── sync/           # engine.ts (Zustandsmaschine), push.ts, pull.ts, scheduler.ts
│   │   ├── repos/          # Hooks/Queries pro Entität (useEntries, useBudgetMonth …)
│   │   └── fx/             # frankfurter.ts, cache.ts
│   ├── features/           # connect (Verbinden), setup (Haushalt einrichten), overview, capture, history,
│   │                       # activity, budgets, planning, projection, scenarios, settings, onboarding, conflicts
│   ├── i18n/               # de.ts (Quelle), en.ts (typgleich), t.ts, format.ts (Intl)
│   └── platform/           # persist.ts, haptics.ts, online.ts, theme.ts, install-hint.ts
├── tests/e2e/              # Playwright: verbinden, erfassen, offline, zwei Geräte + Konflikt (Chromium + WebKit)
├── .env.example  .gitignore  biome.json  tsconfig.json  vite.config.ts  playwright.config.ts
├── CLAUDE.md  README.md  docs/PLAN.md
└── design-reference/       # nur lokal, in .gitignore
```

**Wichtige Details**
- `vite.config.ts`: `base: process.env.VITE_BASE ?? '/'`. PWA-Manifest mit `start_url: './'`, `scope: './'`, `display: 'standalone'`. Workbox precached die App-Shell. Supabase-Aufrufe werden **nicht** vom Service Worker gecacht, das erledigt Dexie. Frankfurter: NetworkFirst.
- Theme: `:root` = hell. `@media (prefers-color-scheme: dark) { :root:not([data-theme=light]) {…} }`, `:root[data-theme=dark] {…}`. Dazu `color-scheme` und `meta theme-color`.
- iOS: `black-translucent`-Statusleiste, `viewport-fit=cover`, Abstände über `env(safe-area-inset-*)`. iOS erzeugt keinen Splash aus dem Manifest. Ohne `apple-touch-startup-image` pro Gerätegröße erscheint kurz eine Fläche in `background_color`. Vorschlag: `background_color` = `--bg`, App-Shell schnell rendern. Prüfung auf dem Gerät in M5.
- Performance-Budget: initiales JS ≤ 150 KB gzip (ohne OCR und Supabase deutlich kleiner als in Version 1, in M1 messen, in CI erzwingen). Lazy geladen: Planung/Diagramme außer Donut, Desktop-Tabelle, Konflikt-Dialog.

### Bedienmuster nach Splitwise (nur Bedienung, kein Ausgleich)

- **Aktivitäts-Feed:** „Person B hat Supermarkt A, 84,17 CA$ hinzugefügt“, „Person A hat den Betrag von 81,17 auf 84,17 CA$ geändert“, nach Tagen gruppiert, neue Aktivitäten markiert. Platz: zweiter Tab im Verlauf („Einträge | Aktivität“), damit die Tabbar aus dem Design bleibt (Frage 15).
- **Änderungshistorie pro Eintrag** im Eintragsdetail (ersetzt den Belegbereich).
- **Kategorie-Vorschlag beim Tippen:** Händler/Beschreibung mit Autovervollständigung aus der Historie, Kategorie wird vorausgewählt. Das Sheet startet weiterhin mit dem Ziffernblock (unter 5 s).
- **Wiederkehrende Ausgaben** = Fixkosten, mit „als bezahlt buchen“ in „Als Nächstes fällig“ (Frage 1).
- **Rückgängig** nach Löschen per Toast.
- Optional: **Kommentare** an Einträgen (Frage 16).

---

## 5. Meilensteine (jeweils lauffähig und deploybar)

**M1 Grundgerüst, Tokens, Verbinden, Deploy** (umgesetzt mit GitHub-Daten-Repo, der Wechsel auf Supabase erfolgt in M2 Teil A)
- Vite/React/TS/Biome/Vitest-Setup, CI und Deploy auf GitHub Pages, Privacy- und Größen-Check.
- `tokens.css` 1:1 aus dem Design plus Theme-Umschaltung, UI-Grundbausteine, Icons als TSX.
- `RemoteStore` mit `GitHubStore` und `MemoryStore`, Verbinden-Screen (Repo + Token, Prüfung per `GET /user`), „Haushalt einrichten“ (legt `household.json` an), Abmelden.
- Shell mit Tabbar/Sidebar und leeren Seiten. PWA-Manifest, Service Worker, `persist()`, Content Security Policy.
- *Fertig, wenn:* beide Personen sich auf dem iPhone in der installierten App verbinden können, ein Testereignis auf Gerät 1 nach dem Pull auf Gerät 2 ankommt, Lighthouse-PWA-Prüfungen bestehen und die Frankfurter-Abfrage vom Pages-Origin funktioniert.

**M2 Backend-Wechsel auf Supabase (Teil A), dann Erfassen, Übersicht, Verlauf, Aktivität, Budgets mit Offline-Sync (Teil B)**. Details in `docs/prompts/M2.md`.
- Ereignis-Schema, HLC, Fold mit Konflikterkennung, Sync-Engine (A bis D inkl. Konflikt-Dialog), Statusanzeige.
- Erfassen-Sheet (Ziffernblock, CAD/EUR, Kategorie-Chips, Datum, bezahlt von, Händler mit Vorschlag), Kurslogik.
- Übersicht (Noch verfügbar, `DonutChart` vorerst ausgeblendet bis M3, Budgets, letzte Einträge), Verlauf mobil (Suche, Filter, Gruppen nach Tag, Wischen, Undo), Aktivitäts-Feed, Eintragsdetail mit Historie, Budgets (Amber + Icon + Text, nie Rot).
- Kategorien verwalten, Onboarding/Leer-Zustand.
- Tests: money, fx, budget, fold/merge, Sync-Engine mit `MemoryTransport`. Playwright: Erfassen, Offline-Erfassen, zwei Geräte mit Konflikt.

**M3 Einnahmen, Fixkosten, Sparziele**
- CRUD für alle drei, Wiederholungslogik, „Als Nächstes fällig“, Buchungsfluss für Fixkosten.
- Sparziele mit Beiträgen, Plan-Abweichung, „Sparziel erreicht“ (einmal pro Person).
- Kreisdiagramm „Anteil am Einkommen“ vollständig.
- Tests: schedule, goals, income-split.

**M4 Planung, Projektion, Szenarien, Desktop-Ansichten**
- Projektion (Ist + Prognose bis Zeitraumende, Cashflow pro Monat).
- Szenarien: Regler pro Kategorie (−50 bis +50 % in 5er-Schritten), Einmalausgaben, neue Ziele, zwei Linien, Differenz am Ende, „Als Budgets übernehmen“.
- Desktop: Dashboard, Verlauf als Tabelle (Sortierung, Inline-Bearbeitung, Tastatur), Planung mit Seitenpanel.
- Tests: projection, scenario.

**M5 Feinschliff**
- Alle Zustände (offline, Sync ausstehend, Konflikt, Budget überschritten, Ziel erreicht, Sitzung abgelaufen/ungültig), vollständiges EN.
- Barrierefreiheit (axe, Fokusführung, 44-pt-Ziele, `prefers-reduced-motion`, VoiceOver auf dem Gerät).
- Haptik über Switch-Overlays (Gerätetest iOS ≥ 26.5), Install-Hinweis, Splash, Lighthouse, Export (JSON/CSV) falls gewünscht.

---

## 6. Einmalige Setup-Schritte für dich

1. **Supabase-Projekt anlegen** (kostenloser Plan genügt), neutraler Projektname ohne echte Namen oder Orte. Projekt-URL und öffentlichen Schlüssel notieren (Passwortmanager), beides gehört nicht ins Repo.
2. **Registrierung deaktivieren** (Authentication, Einstellungen: Sign-ups aus).
3. **Zwei Konten im Dashboard anlegen** (Authentication, Users, Add user): Benutzername und Passwort je Person, technisch als synthetische Adresse im Format, das die App vorgibt, „Auto-Confirm“ an. Passwörter im Passwortmanager speichern.
4. **Schema einspielen:** `supabase/migrations/0001_init.sql` im SQL-Editor ausführen, danach die RLS-Prüfliste aus `supabase/README.md` durchgehen.
5. **App-Repo:** Settings → Pages → Source „GitHub Actions“. Secret `PRIVACY_DENYLIST` (echte Namen, Benutzernamen, Orte, Projekt-Referenz und Projekt-URL, je eine Zeile). Secrets `SUPABASE_URL` und `SUPABASE_ANON_KEY` für den Keep-Alive-Workflow. Secret Scanning und Push Protection aktivieren. Branch-Schutz für `main` mit Pflicht-Check `ci`.
6. **Lokal:** dieselbe Denylist als `.privacy-denylist` (gitignored), Design-Referenz als `design-reference/` entpacken (gitignored).
7. **iPhone:** Pages-URL in Safari öffnen → Teilen → „Zum Home-Bildschirm“ → in der installierten App verbinden (Projekt-URL, öffentlicher Schlüssel, Benutzername, Passwort). Die erste Person führt „Haushalt einrichten“ aus, die zweite tritt beim ersten Login bei.
8. **Regelmäßig exportieren** (Einstellungen: JSON-Export) und den Keep-Alive-Workflow im Blick behalten (GitHub deaktiviert geplante Workflows in Repos nach 60 Tagen ohne Aktivität).

Hinweis: In M1 (GitHub-Daten-Repo) galten noch die früheren Schritte mit Organisation und Token. Sie entfallen mit M2 Teil A.

Keine Umgebungsvariablen mit Zugangsdaten und keine Secrets für den Deploy. Secrets gibt es nur für Privacy-Check und Keep-Alive.

---

## 7. CLAUDE.md

Siehe `CLAUDE.md` im Repo-Root (an Version 2 angepasst).

---

## 8. Entscheidungen

Alle Vorschläge wurden am 08.10.2026 übernommen. Am 12.10.2026 wurde zusätzlich das Backend auf Supabase umgestellt (Benutzername und Passwort, Keep-Alive per GitHub Actions bestätigt). Die *Vorschlag*-Texte unten gelten damit als Entscheidung.
Konkretisierungen:
- Frage 7: Kategoriefarben für weiße Schrift abgedunkelt auf *Gesundheit* `#667F1C` (4,55:1), *Sonstiges* `#7F7569` (4,52:1), *Geschenke* `#B4602F` (4,51:1). Das Token `--scen` (`#B5602F`) bleibt unverändert, weil es nur für Diagrammlinien dient.
- Frage 8: Die generische Kategorie-Vorlage liegt in `src/domain/category-template.ts` und wird in „Haushalt einrichten“ angeboten (angewendet ab M2).
- Die Tabelle `household` (früher `household.json`) enthält zusätzlich die Startwerte der Einstellungen (Name, Ort, Zeitraum, Kursquelle). Die erste Person schreibt die Startwerte beim Einrichten zusätzlich als `settings`-`create`-Ereignis; die Oberfläche liest daraus, spätere Änderungen sind weitere Ereignisse.

1. **Fixkosten buchen:** automatisch am Fälligkeitstag oder per Tipp „als bezahlt buchen“? Zählen sie ins Kategorie-Budget? *Vorschlag:* Tipp zum Bestätigen, `autobook` pro Fixkosten einschaltbar. Ja, sie zählen ins Budget, in der Projektion aber nicht doppelt.
2. **Sparpläne (z. B. ETF):** Ausgabe oder Sparen? *Vorschlag:* Fixkosten mit Merkmal „ist Sparen“, zählen im Kreisdiagramm und in der Sparquote als Sparen.
3. **Einnahmen:** gelten geplante Einnahmen am Stichtag automatisch als eingegangen? *Vorschlag:* ja, Abweichungen über eine einmalige Korrektur-Einnahme.
4. **Szenarien:** gemeinsam gespeichert oder nur temporär? *Vorschlag:* ein gemeinsames gespeichertes Arbeitsszenario plus „Als Budgets übernehmen“ ab dem nächsten Monat.
5. **Sparziel-Beiträge:** manuell oder automatisch in Höhe der nötigen Rate? *Vorschlag:* manuell mit Vorschlagsbetrag (ein Tipp).
6. **Kursquelle:** EZB oder Bank of Canada (beide über Frankfurter)? *Vorschlag:* EZB, in den Einstellungen umstellbar.
7. **Kontraste:** Weiße Chip-Schrift auf Gesundheit, Sonstiges und Geschenke liegt unter 4,5:1. *Vorschlag:* Farben minimal abdunkeln, bis der Test 4,5:1 bestätigt. Dunkel-Schatten aus Komponenten.dc.html (`.05`).
8. **Startkategorien:** Darf das Repo eine *generische* Vorlage enthalten (Namen wie „Lebensmittel“, Farben, Icons aus dem Design), die „Haushalt einrichten“ anbietet? *Vorschlag:* ja, sie enthält nichts Persönliches.
9. **Kategorienamen:** nur in einer Sprache (Nutzerdaten), DE/EN betrifft nur die Oberfläche? *Vorschlag:* ja.
10. **Szenarien mobil:** Regler auch mobil (gestapelt)? *Vorschlag:* ja.
11. **Konflikt-Dialog:** für Einträge, Fixkosten, Einnahmen und Ziele; Einstellungen, Kategorien und Budgets per Last-Write-Wins? *Vorschlag:* ja.
12. **Kreisdiagramm, Zeitbezug:** Monat bis heute oder ganzer Monat inkl. noch fälliger Fixkosten? *Vorschlag:* bis heute.
13. **Export/Backup:** Die Git-Historie ist bereits ein vollständiges Backup. Zusätzlich CSV-Export in den Einstellungen? *Vorschlag:* ja, klein, in M5.
14. **Origin/Domain:** Die App läuft unter `<konto>.github.io/<repo>/`, und diesen Origin teilen sich alle Pages-Seiten des Kontos (relevant für die gespeicherte Sitzung). Gibt es unter deinem Konto weitere Pages-Seiten? Hast du eine eigene Domain für eine Subdomain? *Vorschlag:* ohne weitere Pages-Seiten mit Fremdcode reicht die Projektseite.
15. **Aktivitäts-Feed:** als zweiter Tab im Verlauf oder als eigener Tab in der Navigation (dann weicht die Tabbar vom Design ab)? *Vorschlag:* zweiter Tab im Verlauf.
16. **Kommentare an Einträgen** (wie bei Splitwise)? *Vorschlag:* nein für v1, Notizfeld reicht.
17. **Verbinden-Screen:** Der Login aus dem Design (E-Mail/Passwort) wird zu „Projekt-URL, öffentlicher Schlüssel, Benutzername und Passwort“, im selben Stil. *Entscheidung:* ja.

---

## Verifikation

- `npm run lint && npm run typecheck && npm test && npm run build && npm run check:size && npm run check:privacy` lokal und in CI.
- Sync-Tests mit `MemoryTransport`: zwei simulierte Geräte, Offline-Phasen, gleichzeitige Änderungen, Uhrabweichung, doppelte und ungültige Ereignisse, Wiederholung nach Fehlern (idempotenter Push).
- `npm run test:e2e` (Chromium + WebKit) mit `MemoryTransport` hinter einem Test-Schalter: Verbinden, Erfassen, Offline-Erfassen und Sync, Konflikt mit zwei Browser-Kontexten, axe ohne Verstöße.
- Nach dem Deploy: Lighthouse gegen die Pages-URL; Frankfurter- und Supabase-Abruf vom Pages-Origin.
- Auf dem iPhone: Installation, Verbinden, Flugmodus-Test, Safe Areas, Hell/Dunkel/Auto, VoiceOver, Haptik (iOS ≥ 26.5, nur direkter Tap).

## Quellen

- Supabase: [Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing), [Wiederherstellung nach Pause](https://supabase.com/docs/guides/troubleshooting/restore-project-after-90-days-pause), [Upgrading](https://supabase.com/docs/guides/platform/upgrading), [Changelog: 90 Tage](https://supabase.com/changelog/27497-paused-free-plan-projects-are-restorable-for-90-days)
- GitHub (Pages und Actions): [Pages Limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits), [Custom Workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- Frankfurter: [frankfurter.dev](https://frankfurter.dev/), [JS-Doku (CORS)](https://frankfurter.dev/javascript/), [Providers](https://frankfurter.dev/providers/)
- WebKit Storage: [Updates to Storage Policy](https://webkit.org/?p=14403), [MDN Storage quotas](https://developer.mozilla.org/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- iOS-Haptik: [WebKit Bug 285120](https://bugs.webkit.org/show_bug.cgi?id=285120), [ios-haptics (npm)](https://www.npmjs.com/package/ios-haptics), [project-fathom (iOS 26.5)](https://github.com/m1ckc3s/project-fathom)
- TypeScript 7: [InfoQ](https://infoq.com/news/2026/08/typescript-7-released/), [DevClass](https://www.devclass.com/development/2026/07/10/speedier-type-checks-in-typescript-70-as-first-stable-go-release-ships/5269206)
- Version 1 (Supabase) zum Vergleich: [Supabase Pricing](https://supabase.com/pricing), [Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing), [Firebase Storage FAQ](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)
- Paketversionen: npm-Registry, abgefragt am 08.10.2026.

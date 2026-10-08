# Maple Jar

Gemeinsames Haushaltsbuch (PWA, offline-first) für einen Zwei-Personen-Haushalt.
Vite + React + TypeScript, Dexie (IndexedDB), GitHub Pages. Die Daten liegen als Ereignisprotokoll
in einem privaten GitHub-Repo und werden über die GitHub REST API synchronisiert. Es gibt keinen eigenen Server.
Der vollständige Umsetzungsplan steht in `docs/PLAN.md`.

## Datenschutz: harte Regeln (öffentliches Repo)
- NIE echte Personennamen, E-Mail-Adressen, GitHub-Logins der Nutzer, Orte, Händler aus dem echten Leben,
  echte Beträge, den Namen der Organisation oder des Daten-Repos in Code, Tests, Fixtures, README,
  Commit-Messages, PR-Texten oder Screenshots.
- Beispieldaten nur mit „Person A“ / „Person B“, Logins `person-a` / `person-b`, neutrale Händler
  („Supermarkt A“, „Café B“), fiktive Beträge.
- Anzeigenamen, Haushaltsname, Ort (`placeLabel`), Zeitraum und Kategorien kommen zur Laufzeit aus den Daten.
  Texte mit Ort/Namen nutzen i18n-Platzhalter (`{place}`, `{name}`), nie Literale.
- Die Design-Referenz enthält Ortsnamen und reale Händlernamen: NICHT übernehmen.
- Keine Secrets im Repo. Token und Daten-Repo werden nur zur Laufzeit in der App eingegeben.
- Der Token darf nie geloggt, in Fehlermeldungen ausgegeben oder an andere Hosts als `api.github.com` gesendet werden.
- Zugriffsschutz = privates Daten-Repo + Token mit minimalen Rechten. Die App-Logik ist kein Sicherheitsmerkmal.
- Keine Fremd-Skripte, kein `dangerouslySetInnerHTML`, Content Security Policy nicht aufweichen.
- `design-reference/`, `.env*` (außer `.env.example`) und `.privacy-denylist` bleiben ungetrackt.
- Vor jedem Commit: `npm run check:privacy`.

## Befehle (verfügbar ab Meilenstein M1)
- `npm run dev`              Dev-Server (http://localhost:5173)
- `npm run build`            Produktions-Build (VITE_BASE setzt den Pages-Pfad)
- `npm run preview`          Build lokal mit Service Worker testen
- `npm run lint` / `format`  Biome
- `npm run typecheck`        tsc --noEmit (TypeScript 7)
- `npm test`                 Vitest (Domain, Ereignisse, Sync)
- `npm run test:e2e`         Playwright (Chromium + WebKit, gegen MemoryStore)
- `npm run check:privacy`    Denylist-Prüfung
- `npm run check:size`       Größenbudget für initiales JS

## Architektur in Kürze
- UI liest NUR aus Dexie (`useLiveQuery`). Schreiben = Dexie-Transaktion: Ereignis in `events` + `outbox`,
  materialisierte Zeile aktualisieren.
- Jedes Gerät hängt nur an seine eigene Datei `log/<deviceId>/<YYYY-MM>.jsonl` im Daten-Repo an.
- Zustand = deterministischer Fold aller Ereignisse (`src/data/events/fold.ts`), Reihenfolge per Hybrid Logical Clock.
- Konflikte: gleichzeitige Updates auf verschiedene Felder werden gemergt, auf dasselbe Feld → Konflikt-Dialog.
- Sync spricht nur mit `RemoteStore` (`GitHubStore` im Betrieb, `MemoryStore` in Tests).
- Jedes gelesene Ereignis wird mit Zod validiert. Ungültige Ereignisse werden geparkt und angezeigt, nie still verworfen.
- Geschäftslogik ausschließlich in `src/domain/` (rein, ohne React/IO, vollständig getestet).
- Beträge immer Integer in Minor Units. Kurse als Mikro-Einheiten (BigInt). Kein `number`-Float für Geld.
- Router: Hash-Router. Base-Pfad nur über `import.meta.env.BASE_URL`.

## Konventionen
- TypeScript strict, keine `any`. Dateinamen kebab-case, Komponenten PascalCase.
- Styling über CSS Modules + Tokens aus `src/styles/tokens.css`. Keine Hex-Farben in Komponenten
  (Ausnahme: Kategoriefarben kommen aus den Daten).
- Ahorn-Rot (`--acc`) nur für Aktion/Auswahl. Warnungen nur Amber + Icon + Text, nie Rot.
- Alle Texte über `t()`; DE ist Quelle, EN muss typgleich sein. Zahlen/Datum nur über `src/i18n/format.ts`.
- Touch-Ziele ≥ 44 px, sichtbarer Fokus, `prefers-reduced-motion` respektieren, Status nie nur über Farbe.
- Haptik nur über `HapticTarget` (direkter Tap), immer mit visuellem Feedback.
- Schwere Module (Planung/Diagramme außer Donut, Desktop-Tabelle) nur per `import()`.
- Ereignis-Schema ändern = neue Schema-Version + Migration im Fold + Test. Alte Ereignisse bleiben lesbar.
- Commits: Conventional Commits auf Englisch (`feat:`, `fix:` …), ohne personenbezogene Daten.

## Definition of Done
Lint, Typecheck, Unit-Tests und Build grün. Neue Logik hat Tests in `src/domain` bzw. `src/data`.
UI-Änderungen in Hell und Dunkel geprüft. Größenbudget eingehalten. Privacy-Check grün.

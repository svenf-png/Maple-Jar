# Maple Jar

Gemeinsames Haushaltsbuch (PWA, offline-first) für einen Zwei-Personen-Haushalt.
Vite + React + TypeScript, Dexie (IndexedDB), Supabase (Auth, Postgres/RLS, Realtime, Storage), GitHub Pages.
Der vollständige Umsetzungsplan steht in `docs/PLAN.md`.

## Datenschutz: harte Regeln (öffentliches Repo)
- NIE echte Personennamen, E-Mail-Adressen, Orte, Händler aus dem echten Leben oder echte Beträge
  in Code, Seeds, Tests, Fixtures, README, Commit-Messages, PR-Texten oder Screenshots.
- Beispieldaten nur mit „Person A“ / „Person B“, E-Mails `person-a@example.test`, neutrale Händler
  („Supermarkt A“, „Café B“), fiktive Beträge.
- Anzeigenamen, Haushaltsname, Ort (`place_label`), Zeitraum und Kategorien kommen zur Laufzeit aus der DB.
  Texte mit Ort/Namen nutzen i18n-Platzhalter (`{place}`, `{name}`), nie Literale.
- Die Design-Referenz enthält Ortsnamen und reale Händlernamen: NICHT übernehmen.
- Keine Secrets im Repo. Nur `VITE_SUPABASE_URL` und `VITE_SUPABASE_PUBLISHABLE_KEY` im Frontend.
  Secret-/Service-Keys gehören nie in den Client und nie ins Repo.
- Sicherheit hängt an RLS, nicht an geheimem Code. Jede neue Tabelle: RLS an, Policies + pgTAP-Test.
- `design-reference/`, `.env*` (außer `.env.example`), `supabase/bootstrap.local.sql`,
  `.privacy-denylist` bleiben ungetrackt.
- Vor jedem Commit: `npm run check:privacy`.

## Befehle (verfügbar ab Meilenstein M1)
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
- Schwere Module (OCR, Diagramme außer Donut, Desktop-Tabelle) nur per `import()`.
- Commits: Conventional Commits auf Englisch (`feat:`, `fix:` …), ohne personenbezogene Daten.

## Definition of Done
Lint, Typecheck, Unit-Tests, RLS-Tests und Build grün. Neue Logik hat Tests in `src/domain` bzw. `src/data/sync`.
UI-Änderungen in Hell und Dunkel geprüft. Größenbudget eingehalten. Privacy-Check grün.

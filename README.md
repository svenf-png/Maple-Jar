# Maple Jar

Gemeinsames Haushaltsbuch als offline-fähige Web-App (PWA) für einen Zwei-Personen-Haushalt.
Mobile-first für das iPhone („Zum Home-Bildschirm“), mit Desktop-Ansicht.

- Ausgaben in CAD und EUR mit Tageskurs, Auswertung in CAD
- Schnellerfassung, Aktivitäts-Feed und Änderungshistorie
- Budgets, Fixkosten, Einnahmen, Sparziele, Projektion und Was-wäre-wenn-Szenarien
- Offline-first mit Synchronisation zwischen zwei Geräten

Ohne eigenen Server: Die App läuft auf GitHub Pages, die Daten liegen als Ereignisprotokoll in einem
eigenen Supabase-Projekt (Postgres mit Row Level Security) und werden über dessen REST-API synchronisiert.
Anmeldung per Benutzername und Passwort, die Registrierung im Projekt ist deaktiviert. Dieses Repo enthält keine
Secrets und keine personenbezogenen Daten.

Status: Meilenstein M2 umgesetzt (Supabase, Ereigniskern, Sync; Erfassen, Übersicht, Verlauf, Aktivität,
Eintragsdetail, Budgets, Kategorien). Details in [`docs/PLAN.md`](docs/PLAN.md), Arbeitsregeln in [`CLAUDE.md`](CLAUDE.md).

## Einrichtung

Ausführlich mit Prüfliste in [`supabase/README.md`](supabase/README.md). Kurzfassung:

1. Kostenloses Supabase-Projekt anlegen. Unter Authentication die **Registrierung deaktivieren**.
2. **Zwei Konten** im Dashboard anlegen (Authentication, Users, „Auto Confirm User“): Als E-Mail
   `<benutzername>@maple-jar.invalid` (synthetische Adresse, es gibt keine echten E-Mail-Adressen). Passwort-Mindestlänge
   im Dashboard prüfen, mindestens 8 Zeichen empfohlen.
3. Den Inhalt von `supabase/migrations/0001_init.sql` im SQL Editor ausführen und die RLS-Prüfliste durchgehen
   (`supabase/tests/rls-check.sql`).
4. Projekt-URL und **öffentlichen** Schlüssel (anon bzw. publishable) aus den Project Settings kopieren. Nie den
   geheimen Schlüssel verwenden.
5. App-Repo: Pages-Quelle auf „GitHub Actions“, Secrets `PRIVACY_DENYLIST` (je Begriff eine Zeile, ergänzt um
   Projekt-Referenz und Projekt-URL), `SUPABASE_URL` und `SUPABASE_ANON_KEY` (für den Keep-Alive-Workflow),
   Secret Scanning und Push Protection aktivieren, Branch `main` mit Pflicht-Check `ci` schützen.
6. Lokal: dieselbe Denylist als `.privacy-denylist` (wird nicht getrackt), Design-Referenz als `design-reference/`
   entpacken (wird nicht getrackt).
7. iPhone: App-Adresse in Safari öffnen, „Zum Home-Bildschirm“ wählen und in der installierten App verbinden
   (Projekt-URL, öffentlicher Schlüssel, Benutzername, Passwort). Die erste Person richtet den Haushalt ein, die zweite
   verbindet sich mit ihrem Konto und tritt dabei selbst bei.

### Pausierung und Sicherung

Projekte im Free-Plan werden bei geringer Aktivität nach einer Woche **pausiert (nicht gelöscht)** und sind im
Dashboard wiederherstellbar, aber nur begrenzt lange; danach bleibt nur ein Backup-Download. Deshalb:

- `.github/workflows/keepalive.yml` pingt das Projekt alle drei Tage (Secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY`).
  GitHub kann geplante Workflows in Repos ohne Aktivität nach 60 Tagen deaktivieren.
- **Regelmäßig exportieren:** Einstellungen, „Daten exportieren (JSON)“ (lokal erzeugt, kein Upload). Alternativ
  auf einen bezahlten Plan wechseln, der nie pausiert.

### Sicherheitshinweis

Alle GitHub-Pages-Projekte eines Kontos teilen sich den Origin `<konto>.github.io`. Ein anderes Pages-Projekt desselben
Kontos könnte gespeicherte Sitzungen lesen. Unter diesem Konto keine weiteren Seiten mit Fremdcode betreiben (oder eine
eigene Domain nutzen). Den Zugriff schützen Row Level Security und die deaktivierte Registrierung, nicht die App-Logik.

## Entwicklung

Voraussetzung: Node ≥ 22.22 (`.nvmrc`: 24).

- `npm run dev`              Dev-Server (http://localhost:5173)
- `npm run build`            Produktions-Build (`VITE_BASE` setzt den Pages-Pfad)
- `npm run preview`          Build lokal mit Service Worker testen
- `npm run lint` / `format`  Biome
- `npm run typecheck`        `tsc --noEmit`
- `npm test`                 Vitest
- `npm run test:e2e`         Playwright (baut mit `VITE_E2E=1`, nutzt den `MemoryTransport`)
- `npm run check:privacy`    Denylist-Prüfung
- `npm run check:size`       Größenbudget für initiales JS
- `npm run check:e2e-leak`   Prüft, dass kein E2E-Code im Produktions-Build steckt

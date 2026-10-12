# Maple Jar

Gemeinsames Haushaltsbuch als offline-fähige Web-App (PWA) für einen Zwei-Personen-Haushalt.
Mobile-first für das iPhone („Zum Home-Bildschirm“), mit Desktop-Ansicht.

- Ausgaben in CAD und EUR mit Tageskurs, Auswertung in CAD
- Schnellerfassung, Aktivitäts-Feed und Änderungshistorie
- Budgets, Fixkosten, Einnahmen, Sparziele, Projektion und Was-wäre-wenn-Szenarien
- Offline-first mit Synchronisation zwischen zwei Geräten

Ohne eigenen Server: Die App läuft auf GitHub Pages, die Daten liegen als Ereignisprotokoll in einem
privaten GitHub-Repo und werden über die GitHub REST API synchronisiert. Zugriff nur mit einem
Token, der auf dieses eine Repo beschränkt ist. Dieses Repo enthält keine Secrets und keine
personenbezogenen Daten.

Status: Meilenstein M1 (Grundgerüst, Verbinden, Haushalt einrichten, App-Shell, Deploy) umgesetzt.
Details in [`docs/PLAN.md`](docs/PLAN.md), Arbeitsregeln in [`CLAUDE.md`](CLAUDE.md).

## Einrichtung

1. GitHub-Konto für die zweite Person anlegen, falls noch keines existiert.
2. Kostenlose GitHub-Organisation anlegen (neutraler Name, ohne echte Namen oder Orte).
3. Privates Daten-Repo in der Organisation anlegen und mit einer README initialisieren, damit `main` existiert.
4. Zweite Person in die Organisation einladen und ihr Schreibrecht auf das Daten-Repo geben.
5. Token-Richtlinie der Organisation prüfen (Settings, Personal access tokens): keine Genehmigung nötig oder Anfragen genehmigen.
6. Jede Person erstellt einen fine-grained Token: Resource owner = Organisation, Repository access = nur das Daten-Repo, Contents = „Read and write“. Token im Passwortmanager speichern.
7. App-Repo: Pages-Quelle auf „GitHub Actions“, Secret `PRIVACY_DENYLIST` (je Begriff eine Zeile), Secret Scanning und Push Protection aktivieren, Branch `main` mit Pflicht-Check `ci` schützen.
8. Lokal: dieselbe Denylist als `.privacy-denylist` (wird nicht getrackt), Design-Referenz als `design-reference/` entpacken (wird nicht getrackt).
9. iPhone: App-Adresse in Safari öffnen, „Zum Home-Bildschirm“ wählen und in der installierten App verbinden (`organisation/repo` und Token). Die erste Person richtet den Haushalt ein.

## Entwicklung

Voraussetzung: Node ≥ 22.22 (`.nvmrc`: 24).

- `npm run dev`              Dev-Server (http://localhost:5173)
- `npm run build`            Produktions-Build (`VITE_BASE` setzt den Pages-Pfad)
- `npm run preview`          Build lokal mit Service Worker testen
- `npm run lint` / `format`  Biome
- `npm run typecheck`        `tsc --noEmit`
- `npm test`                 Vitest
- `npm run test:e2e`         Playwright (baut mit `VITE_E2E=1`, nutzt den `MemoryStore`)
- `npm run check:privacy`    Denylist-Prüfung
- `npm run check:size`       Größenbudget für initiales JS
- `npm run check:e2e-leak`   Prüft, dass kein E2E-Code im Produktions-Build steckt

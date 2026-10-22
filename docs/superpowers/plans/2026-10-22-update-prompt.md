# Update-Hinweis: neue Version melden statt still alte Version zeigen

> **For agentic workers:** Tasks der Reihe nach umsetzen, Checkboxen abhaken. Steps use checkbox (`- [ ]`) syntax for tracking.

**Problem:** Nach einem Deploy sieht man in Browser und Home-Bildschirm-App oft noch die alte Version. Ursachen:
(1) Der Browser sucht selten von selbst nach einem neuen Service Worker, eine aus dem Hintergrund geholte iOS-App fast nie.
(2) `registerType: 'autoUpdate'` aktiviert den neuen Worker zwar sofort (skipWaiting + clientsClaim), die offene Seite läuft aber mit dem alten JavaScript weiter, bis sie neu lädt.

**Goal:** Wie in der Schwester-App Juri (`svenf-png/Juri`, `src/platform/updateCheck.ts`, `src/ui/components/UpdatePrompt.tsx`): Die App fragt aktiv nach einer neuen Version (Start und Rückkehr in den Vordergrund). Ist eine da, erscheint ein Hinweis „Neue Version verfügbar“ mit „Später“ und „Neu laden“. Neu geladen wird erst nach dem Tipp, nie automatisch, damit keine halbe Eingabe verloren geht.

**Architecture:** Keine `workbox-window`/`virtual:pwa-register`-Abhängigkeit (Größenbudget 150 KB gzip, CSP `script-src 'self'`, siehe Kommentar in `src/main.tsx`). Eigene kleine Registrierung in `src/platform/sw-update.ts` mit einem externen Store, React liest ihn per `useSyncExternalStore`.

**Tech Stack:** React 19, TypeScript strict, CSS Modules mit Tokens, vite-plugin-pwa `~2.0` (generateSW), Vitest (jsdom), Playwright 1.64.

## Global Constraints

- `CLAUDE.md` im Repo gilt vollständig (Datenschutz, i18n, Tokens statt Farbwerten, keine Inline-Skripte, CSP nicht aufweichen, Biome, kebab-case-Dateinamen).
- Texte nur über i18n (`src/i18n/de.ts` und `src/i18n/en.ts`, beide pflegen).
- Touch-Ziele mindestens 44 px. Hover/Active nur über vorhandene Tokens.
- Nicht anfassen: `src/ui/Toast.tsx`, `src/ui/Toast.module.css`, `src/styles/tokens.css`, `src/ui/Button.module.css` (der offene PR #11 ändert diese Dateien, Konflikte vermeiden). `.github/workflows/` nicht anfassen.
- Verboten: `test.skip`, `test.fixme`, `page.waitForTimeout`, höhere `retries`, verlängerte Timeouts als Ersatz für eine Ursache, axe-Ausnahmen.
- Commits: Conventional Commits auf Englisch, Trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Keine Modellnamen in Betreff, Code oder PR-Text. Nur explizite Pfade adden.
- Vor jedem Commit: `npm run lint && npm run typecheck && npm test && npm run check:privacy`; nach Task 4 zusätzlich `npm run build && npm run check:size` (Messwert in den Commit-Text).
- Lokale Umgebung: Node nur portabel: `export PATH="$HOME/.claude/jobs/0ebcf8da/tmp/node/node-v24.21.0-darwin-x64/bin:$PATH"`. Git immer mit `DEVELOPER_DIR=/Library/Developer/CommandLineTools`. E2E läuft nur in der CI (ca. 8 min), nicht lokal.

## Task 1: Service Worker auf „prompt“ umstellen

- [ ] `vite.config.ts`: `registerType: 'autoUpdate'` → `registerType: 'prompt'`. Zusätzlich in `workbox`: `cleanupOutdatedCaches: true`.
- [ ] Mit `npm run build` prüfen, dass `dist/sw.js` **kein** sofortiges `self.skipWaiting()` mehr enthält, aber einen `message`-Listener, der bei `{type: 'SKIP_WAITING'}` `self.skipWaiting()` aufruft (`grep -o 'SKIP_WAITING' dist/sw.js`). Fehlt der Listener: stoppen und melden, nicht selbst einen Worker schreiben.
- [ ] Kommentar in `src/main.tsx` anpassen (kein autoUpdate mehr).

## Task 2: `src/platform/sw-update.ts` (reine Logik, vollständig getestet)

Exportiert:
- `UPDATE_CHECK_MIN_GAP_MS = 60_000`.
- `canUpdate(reg)`: `reg.active != null && reg.installing == null` (wie Juri, verhindert Fehlalarm bei der Erstinstallation).
- `startUpdateChecks(reg, doc, now = Date.now)`: sofort `reg.update()` (wenn `canUpdate`), danach bei `visibilitychange` → `visible` erneut, höchstens einmal je `UPDATE_CHECK_MIN_GAP_MS`. Fehler von `update()` schlucken (offline ist kein Fehler).
- Ein kleiner Store: `subscribeUpdate(listener)`, `getUpdateSnapshot(): boolean` (true = Update wartet und nicht weggeklickt), `dismissUpdate()` (setzt auf false, bis zum nächsten Laden der Seite).
- `watchRegistration(reg, sw = navigator.serviceWorker)`: meldet ein Update, wenn `reg.waiting` existiert **und** `sw.controller` nicht `null` ist; außerdem über `updatefound` → `installing.statechange` → `'installed'` mit vorhandenem Controller. Ohne Controller (erste Installation) nie melden.
- `applyUpdate(reg, sw = navigator.serviceWorker, reload = () => location.reload())`: einmalig auf `controllerchange` hören und dann `reload()` aufrufen (nur einmal, Schutz gegen Reload-Schleifen), danach `reg.waiting?.postMessage({ type: 'SKIP_WAITING' })`. Gibt es kein `reg.waiting`: direkt `reload()`.
- `registerServiceWorker()`: registriert `${import.meta.env.BASE_URL}sw.js` mit `scope: import.meta.env.BASE_URL` (wie bisher in `main.tsx`), ruft dann `watchRegistration` und `startUpdateChecks(reg, document)` auf, merkt sich die Registrierung für `applyUpdate`. Fehler beim Registrieren schlucken.

- [ ] Tests `src/platform/sw-update.test.ts` mit Fakes (kein echter Service Worker in jsdom): canUpdate (3 Fälle), Erstcheck, Mindestabstand (59 s nein, 61 s ja), hidden → kein Check, update-Fehler wird geschluckt, watchRegistration mit/ohne Controller, über updatefound/statechange, dismiss, applyUpdate schickt `SKIP_WAITING` und lädt genau einmal bei `controllerchange`, applyUpdate ohne waiting lädt direkt.
- [ ] `src/main.tsx`: den bisherigen `register`-Block durch `registerServiceWorker()` ersetzen (Bedingung `'serviceWorker' in navigator && import.meta.env.PROD` bleibt).

## Task 3: Hinweis `src/app/UpdatePrompt.tsx` + `UpdatePrompt.module.css`

- [ ] Liest den Store per `useSyncExternalStore(subscribeUpdate, getUpdateSnapshot)`. Bei `false`: `null`.
- [ ] Sonst ein nicht-modaler Hinweis mit `role="status"`: Titel `t('update.title')` („Neue Version verfügbar“ / „New version available“), Untertitel `t('update.sub')` („Deine Daten bleiben erhalten.“ / „Your data stays safe.“), Schaltflächen „Später“ (`update.later` / „Later“) → `dismissUpdate()` und „Neu laden“ (`update.reload` / „Reload“) → `applyUpdate(...)`. Vorhandene `Button`-Komponente aus `src/ui` verwenden (Varianten wie andernorts, nicht neu stylen).
- [ ] Position: unten fixiert, auf Mobilgeräten oberhalb der Tab-Leiste und mit `env(safe-area-inset-bottom)`, auf dem Desktop unten rechts bzw. neben der Sidebar. Vorbild für Abstände und Fläche: `src/features/overview/InstallHint.module.css` und `src/ui/Toast.module.css` (nur lesen). Nur Tokens, Light und Dark müssen funktionieren, `prefers-reduced-motion` respektieren, falls animiert.
- [ ] Einbinden in `src/app/RootLayout.tsx`, sodass er auf allen Seiten der angemeldeten App erscheint (auch Einstellungen). Fokus wird beim Erscheinen **nicht** verschoben.
- [ ] Komponententest `src/app/UpdatePrompt.test.tsx`: unsichtbar ohne Update, sichtbar mit Update, „Später“ blendet aus, „Neu laden“ ruft `applyUpdate` (per `vi.mock` auf `../platform/sw-update`).

## Task 4: E2E `tests/e2e/update.spec.ts` (nur chromium-desktop)

Vorbild: `tests/e2e/update.spec.ts` in `svenf-png/Juri` (per `gh api repos/svenf-png/Juri/contents/tests/e2e/update.spec.ts -q .content | base64 -d` lesen). Abweichungen für Maple Jar:
- [ ] Eigener Server: `dist/` (vom E2E-Build des webServers, vorhanden wenn Playwright läuft) in ein Temp-Verzeichnis kopieren und dieses mit `node_modules/.bin/vite preview --outDir <kopie> --port 4180 --strictPort` per `spawn` ausliefern. Auf die Ausgabe der URL warten. **Nie** das gemeinsame `dist/` verändern (die übrigen Tests laufen parallel dagegen).
- [ ] Ablauf: Seite laden, App so weit bringen, dass `RootLayout` sichtbar ist (Hilfen aus `tests/e2e/helpers.ts` nutzen, wie andere Specs), `navigator.serviceWorker.ready` abwarten, neu laden, warten bis `navigator.serviceWorker.controller !== null`. Hinweis darf nicht sichtbar sein. Dann an `<kopie>/sw.js` eine Kommentarzeile anhängen, `registration.update()` auslösen → Hinweis sichtbar, Seite hat **nicht** neu geladen (Marker auf `window`). „Später“ → weg. Reload → Hinweis wieder da. „Neu laden“ → Seite lädt neu, Hinweis weg, Daten (ein vorher erfasster Eintrag) noch da.
- [ ] axe auf dem sichtbaren Hinweis in Light und Dark (wie andere Specs, ohne Ausnahmen).
- [ ] Nur in chromium-desktop: in `playwright.config.ts` bei den drei anderen Projekten `testIgnore: /update\.spec\.ts/` ergänzen (kein `test.skip`). Kurzer Kommentar warum: echter Worker-Wechsel braucht einen eigenen Server; ein Browser genügt als Nachweis, die Logik ist per Unit-Test abgedeckt.
- [ ] Prüfen, dass die übrigen E2E-Specs mit `registerType: 'prompt'` weiterhin grün sind (CI).

## Task 5: PR

- [ ] Branch `feat/update-prompt` pushen (vorher `git remote get-url origin` = `https://github.com/svenf-png/Maple-Jar.git`), Draft-PR gegen `main`: Summary, Test evidence (lokale Befehle mit Zahlen, CI-Lauf), Known notes: **Einmaliger Übergang** – Geräte mit der alten autoUpdate-Version zeigen den Hinweis selbst noch nicht; sie bekommen die neue Version nach vollständigem Schließen und Neustart der App, danach greift der Hinweis. Ende des PR-Texts: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- [ ] CI mit `gh run watch <id> --exit-status` abwarten. Rot: Ursache aus `gh run view <id> --log-failed` belegen, gezielt beheben, maximal 3 Runden; danach Stand melden statt weiterprobieren.

## Definition of Done

- Lint, Typecheck, Unit-Tests, Privacy, Build, Größenbudget lokal grün (Zahlen im PR).
- CI grün in allen Jobs, `update.spec.ts` lief in chromium-desktop und ist grün.
- Kein automatischer Reload ohne Tipp. Kein Hinweis bei der Erstinstallation.

# Auftrag: Maple Jar, Backlog-Abarbeitung im Hochtempo (Opus steuert, Sonnet setzt um)

Du bist Opus und der **Controller**. Du zerlegst Arbeit in kleine, voneinander unabhängige Tasks und gibst sie parallel
an **Sonnet-Subagenten** (Agent-Tool, `model: "sonnet"`). Du prüfst jedes Ergebnis selbst, bevor es weiterläuft.
Tempo kommt aus Parallelität, nicht aus weniger Prüfung.

dort die Rollenverteilung (Sonnet-Implementer, Sonnet-Task-Review, Opus-Branch-Review) durch parallele Sonnet-Implementer unter Opus-Kontrolle. Inhalt,
dort die Rollenverteilung (Sonnet-Implementer, Opus-Review) durch Sonnet-Implementer unter Opus-Kontrolle. Inhalt,
Entscheidungen und Verbote aus M6.md gelten unverändert.

## 0. Vor dem Start (einmalig, nicht delegieren)
1. `CLAUDE.md` vollständig lesen. Die Datenschutzregeln sind **hart** und gehen allem vor (keine echten Namen, Orte,
   Händler, Beträge, Projekt-URL; nur Person A/B, neutrale Händler; vor jedem Commit `npm run check:privacy`).
2. `docs/PLAN.md` (§2, §3, §8), `docs/TODO.md`, `docs/prompts/M6.md` und den M6-Plan lesen. Diese Dateien liegen in
   PR #19 (Branch `docs/backlog-m6`). Ist PR #19 noch nicht gemergt, zuerst mergen (nur Dokumente, CI grün).
3. Baseline messen und notieren: `npm ci && npm run lint && npm run typecheck && npm test && npm run build && npm run check:size`.
   Das Größenbudget für das initiale JS ist praktisch voll (ca. 149,98 von 150 KB gzip). Es wird **nicht** erhöht.

## 1. Reihenfolge (nacheinander, je ein Branch und Draft-PR gegen `main`)
0. **Aufräumen:** PR #19 (Doku), PR #17 (Abmelde-Schutz) und PR #18 (Keepalive) auf aktuellen `main` bringen
   (Merge, kein Rebase), CI grün, mergen. Migration `0002` hat der Nutzer im Supabase-Projekt eingespielt; ob das SQL
   und `rls-check.sql` laufen, ist ungeprüft und wird im PR-Text so vermerkt.
1. **M6-A (M5-Rest), Branch `feat/m6-a-m5-rest`:** Task A0 zuerst (Verbinden-Seite lazy laden, schafft Budget-Puffer),
   dann Regler fachlich lösen (Prognose nutzt je Kategorie „Ø, sonst Budget“), Altlasten (Notiz als Ersatztitel,
   Toast Desktop, `100dvh`, `PctSlider` mit `useLang()`, Tabbar-Höhe als Token, `m5-layout.spec.ts`),
   EN-Vollständigkeit (`SAME_IN_BOTH`, `Intl` nur über `src/i18n/format.ts`), `m5-axe.spec.ts`, Wackeltests (feste
   Pausen in `m3b1.spec.ts:70` und `m3b2-two-devices.spec.ts:140`, Reduced-Motion-Gegenprobe), README-Status.
2. **M6-B (Einstellungen), Branch `feat/m6-b-settings`:** Name, Ort, Kursquelle, Zeitraum, eigenes Profil als
   Ereignisse (`settings`-`update`, `member`). Zeitraum immer als Paar in einem Ereignis. Neue Prüfregeln in
   `parseEvent`. Keine Migration.
3. **M6-C (Backup und Sync), Branch `feat/m6-c-backup-sync`:** „Zuletzt synchronisiert“ persistent,
   unterscheidbare Fehlerzustände inkl. „Projekt nicht erreichbar oder pausiert“ (E2E mit nicht auflösbarer
   Adresse), Passwort ändern über die Auth-API (gegen aktuelle Supabase-Doku prüfen), JSON-Import (jede Person
   spielt nur ihre eigenen Ereignisse ein).

Jeder Branch wird von `main` abgezweigt, nachdem der vorherige gemergt ist.

## 2. Wer macht was
**Sonnet bekommt** (klar abgegrenzt, höchstens 5 Dateien, Ziel und Abnahme in 5 Zeilen):
- Texte in `de.ts`/`en.ts`/`plan-*.ts`, i18n-Platzhalter, `format.ts`-Umstellungen
- CSS-Module-Anpassungen, Tokens, Layout-Fixes
- einfache Komponenten und Hooks nach vorhandenem Muster
- Unit-Tests für **bereits vorhandene** reine Domain-Funktionen
- Playwright-Specs nach vorhandenem Muster, Wartebedingungen statt fester Pausen
- README und Doku

**Opus macht selbst** (nicht delegieren):
- alles in `src/data/sync/`, `src/data/events/` (Schema, Fold, `parseEvent`), `src/data/session.ts`, `src/data/remote/`
- jedes SQL und jede Migration (RLS und Rechte im selben Commit, jede neue Funktion
  `revoke execute … from public, anon`, dann gezieltes `grant`; Migrationen ab `0003`)
- den JSON-Import und die Passwort-Änderung
- Entscheidungen über Größenbudget, Schnittstellen und Branch-Zuschnitt
- Reviews, Merge, PR-Texte

## 3. Parallelisierung
- Pro Welle 3 bis 6 Sonnet-Agenten gleichzeitig, **in einem einzigen Tool-Block** gestartet.
- Parallel nur Tasks mit **disjunkten Dateien**. Teilen zwei Tasks eine Datei (z. B. `de.ts`), laufen sie nacheinander
  oder du fasst die Textänderungen vorher selbst zusammen.
- Jeder Sonnet-Agent läuft mit `isolation: "worktree"` auf einem eigenen Unterbranch; du führst die Ergebnisse zusammen.

## 4. Brief-Vorlage für jeden Sonnet-Agenten
```
Projekt: Maple Jar (React/TS, Dexie, Biome, Vitest, Playwright). Lies zuerst CLAUDE.md, besonders die Datenschutzregeln.
Aufgabe: <ein Satz>
Dateien: <exakte Pfade, die du ändern darfst>. Fasse nichts anderes an.
Muster: <Pfad einer ähnlichen vorhandenen Datei>
Abnahme: <konkrete Prüfung, z. B. ein Test, der vorher rot und nachher grün ist>
Verboten: neue Abhängigkeiten, Größenbudget anheben, test.skip/fixme/slow, höhere retries, waitForTimeout,
neue axe-Ausnahmen, echte Namen/Orte/Händler/Beträge, any, Hex-Farben in Komponenten.
Pflicht vor Abgabe: npm run lint && npm run typecheck && npm test (betroffene Tests genügen), npm run check:privacy.
Bericht: geänderte Dateien, Ausgabe der Prüfbefehle (wörtlich, auch Fehler), offene Zweifel. Behaupte nichts, was du nicht gelaufen bist.
```

## 5. Gate pro Task (Opus, nicht überspringen)
1. `git diff` des Agenten **selbst lesen**, nicht nur den Bericht.
2. `npm run lint && npm run typecheck && npm test` selbst ausführen.
3. Gegen die Verbote in §4 und die Konventionen in `CLAUDE.md` prüfen (Ahorn-Rot nur für Aktion, Warnungen Amber +
   Icon + Text, Touch-Ziele mindestens 44 px, nur `t()`-Texte, Geld nur Integer).
4. Nach jeder Welle: `npm run build && npm run check:size && npm run check:privacy`. Ist das Budget gerissen, kommt
   der nächste Task erst nach Behebung (neue Oberflächen nur per `import()`).
5. Fehlschlag: höchstens ein Nachbesserungsversuch durch Sonnet mit konkreter Fehlerbeschreibung, danach übernimmst du
   den Task selbst. Nicht mehrfach denselben Agenten loopen lassen.

## 6. Abschluss je Branch und Merge
- Commits auf Englisch (Conventional Commits), ohne personenbezogene Daten, mit der vorgegebenen Co-Author-Zeile.
- Push, Draft-PR gegen `main`, PR-Text mit Test-Evidenz (Zahlen aus echten Läufen) und einem Abschnitt „Nicht
  verifiziert“ (z. B. Gerätetests, echtes Supabase, nicht ausgeführtes SQL).
- **Merge-Erlaubnis (vom Nutzer erteilt):** Du darfst einen PR selbst mergen, wenn alle Bedingungen erfüllt sind:
  1. CI auf dem aktuellen Head grün (Ursache beheben, nie neu starten oder etwas überspringen),
  2. kein Merge-Konflikt,
  3. dein eigenes Branch-Review des gesamten Diffs ist abgeschlossen und ohne offene Punkte,
  4. Größenbudget und Privacy-Check eingehalten,
  5. der PR enthält **keine neue Migration**. Enthält er eine (ab `0003`), bleibt der Merge beim Nutzer, weil die
     Migration vorher im Supabase-Projekt eingespielt werden muss.
  Vor dem Merge den Draft-Status aufheben. Danach den nächsten Branch von aktuellem `main` abzweigen.
- Auf iPhone-Gerätetests, Lighthouse gegen den Produktions-Build und Supabase-Dashboard-Schritte hat der Nutzer
  Zugriff, du nicht: als Checkliste an den Nutzer ausgeben, nie als „erledigt“ melden.

## 7. Stoppregeln
- Bei Konflikt zwischen diesem Auftrag und `CLAUDE.md` gilt `CLAUDE.md`.
- Kein Force-Push, keine Historie umschreiben, keine Secrets oder Zugangsdaten ausgeben oder loggen.
- Unklare fachliche Frage (Verhalten, Wording, Datenmodell): kurz an den Nutzer fragen statt raten.
- Am Ende: Kurzbericht pro Branch (erledigt, offen, ungeprüft, Risiken), keine Erfolgsmeldung ohne Belegausgabe.

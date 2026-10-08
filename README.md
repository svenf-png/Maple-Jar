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

Status: Planung abgeschlossen, Umsetzung folgt in Meilensteinen. Details in [`docs/PLAN.md`](docs/PLAN.md),
Arbeitsregeln in [`CLAUDE.md`](CLAUDE.md).

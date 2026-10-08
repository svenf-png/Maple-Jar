# Maple Jar

Gemeinsames Haushaltsbuch als offline-fähige Web-App (PWA) für einen Zwei-Personen-Haushalt.
Mobile-first für das iPhone („Zum Home-Bildschirm“), mit Desktop-Ansicht.

- Ausgaben in CAD und EUR mit Tageskurs, Auswertung in CAD
- Schnellerfassung, Beleg-Scan mit lokaler Texterkennung
- Budgets, Fixkosten, Einnahmen, Sparziele, Projektion und Was-wäre-wenn-Szenarien
- Offline-first mit Synchronisation zwischen zwei Geräten

Status: Planung abgeschlossen, Umsetzung folgt in Meilensteinen. Details in [`docs/PLAN.md`](docs/PLAN.md),
Arbeitsregeln in [`CLAUDE.md`](CLAUDE.md).

Sicherheit beruht auf serverseitiger Row Level Security in Supabase. Registrierung ist deaktiviert,
Konten werden manuell angelegt. Das Repo enthält keine Secrets und keine personenbezogenen Daten.

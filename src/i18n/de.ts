export const de = {
  'app.name': 'Maple Jar',
  'common.cancel': 'Abbrechen',
  'common.save': 'Speichern',
  'common.optional': 'optional',
  'common.yes': 'Ja',
  'common.no': 'Nein',
  'common.language': 'Sprache',

  'nav.overview': 'Übersicht',
  'nav.history': 'Verlauf',
  'nav.planning': 'Planung',
  'nav.settings': 'Einstellungen',
  'nav.main': 'Hauptnavigation',
  'nav.capture': 'Ausgabe erfassen',
  'toast.comingM2': 'Kommt in M2',

  'page.overview.hint': 'Kommt in Meilenstein 2',
  'page.history.hint': 'Kommt in Meilenstein 2',
  'page.planning.hint': 'Kommt in Meilenstein 4',
  'page.empty.title': 'Noch nichts zu sehen',

  'status.connected': 'Verbunden',
  'status.offline': 'Offline',
  'status.pending': '{count} warten auf Sync',
  'status.reauth': 'Anmeldung erneuern',
  'status.error': 'Sync gestört',
  'status.member': 'Mitglied {name}',

  'connect.subtitle': 'Euer gemeinsames Haushaltsbuch.',
  'connect.projectUrl': 'Projekt-URL',
  'connect.projectUrlPlaceholder': 'https://projekt.supabase.co',
  'connect.anonKey': 'Öffentlicher Schlüssel',
  'connect.username': 'Benutzername',
  'connect.password': 'Passwort',
  'connect.submit': 'Verbinden',
  'connect.help': 'So richtest du den Zugang ein',
  'connect.footer': 'Nur für euren Haushalt. Die Daten liegen in eurem eigenen Supabase-Projekt.',
  'connect.langLabel': 'Sprache',
  'connect.error.url': 'Bitte die Projekt-URL im Format „https://projekt.supabase.co“ angeben.',
  'connect.error.keyMissing': 'Bitte den öffentlichen Schlüssel eingeben.',
  'connect.error.username':
    'Der Benutzername darf nur Kleinbuchstaben, Ziffern, Punkt, Unterstrich und Bindestrich enthalten.',
  'connect.error.passwordMissing': 'Bitte das Passwort eingeben.',
  'connect.error.auth':
    'Benutzername oder Passwort stimmt nicht, oder die Anmeldung ist abgelaufen.',
  'connect.error.forbidden':
    'Zugriff verweigert. Wurde das SQL aus dem Repo eingespielt und gehört das Konto zum Haushalt?',
  'connect.error.rateLimit': 'Zu viele Anfragen. Bitte wieder versuchen ab {time} Uhr.',
  'connect.error.network': 'Keine Verbindung',
  'connect.error.server':
    'Der Server antwortet nicht wie erwartet. Bitte später noch einmal versuchen.',
  'connect.error.notMember': 'Dieses Konto gehört nicht zu diesem Haushalt.',
  'connect.error.unknown': 'Etwas ist schiefgelaufen. Bitte noch einmal versuchen.',
  'connect.busy': 'Verbinde …',

  'renew.title': 'Anmeldung erneuern',
  'renew.intro':
    'Die Sitzung ist abgelaufen. Deine lokalen Daten und nicht gesendete Einträge bleiben erhalten.',
  'renew.submit': 'Anmelden',

  'help.title': 'So richtest du den Zugang ein',
  'help.back': 'Zurück',
  'help.step1':
    'Lege bei Supabase ein kostenloses Projekt an. Wähle eine Region in deiner Nähe und notiere das Datenbank-Passwort im Passwortmanager.',
  'help.step2':
    'Schalte unter Authentication, Sign In / Providers die Registrierung ab („Allow new users to sign up“ aus). Prüfe dort auch die Mindestlänge für Passwörter (Voreinstellung laut Doku: 6; empfohlen sind mindestens 8 Zeichen).',
  'help.step3':
    'Lege unter Authentication, Users zwei Konten an („Add user“, „Auto Confirm User“ an). Als E-Mail trägst du für jede Person Benutzername und die feste Endung ein, die in der Datei supabase/README.md im App-Repo steht, zum Beispiel „benutzername@endung“. Es werden keine echten E-Mail-Adressen verwendet.',
  'help.step4':
    'Spiele im SQL Editor die Datei supabase/migrations/0001_init.sql aus dem App-Repo ein und gehe die Prüfliste in supabase/README.md durch.',
  'help.step5':
    'Öffne Project Settings, Data API bzw. API Keys und kopiere die Projekt-URL und den öffentlichen Schlüssel (anon bzw. publishable). Den geheimen Schlüssel (service_role) trägst du nie in die App ein.',
  'help.step6':
    'Öffne die App-Adresse, gib Projekt-URL, öffentlichen Schlüssel, Benutzername und Passwort ein und tippe auf „Verbinden“. Die erste Person richtet den Haushalt ein.',
  'help.step7':
    'Die zweite Person verbindet sich mit ihrem eigenen Konto und tritt dem Haushalt dabei selbst bei.',
  'help.step8':
    'iPhone: App-Adresse in Safari öffnen, „Zum Home-Bildschirm“ wählen und in der installierten App verbinden. Safari und Home-Bildschirm-App speichern getrennt.',
  'help.step9':
    'Free-Projekte werden nach einer Woche Inaktivität pausiert. Exportiere deshalb regelmäßig unter Einstellungen die Daten als JSON.',

  'setup.title': 'Haushalt einrichten',
  'setup.intro': 'Diese Angaben werden in eurem Supabase-Projekt gespeichert.',
  'setup.householdName': 'Haushaltsname',
  'setup.place': 'Ort',
  'setup.placeHint': 'Wird z. B. in „Monat 4 von 12 in {place}“ angezeigt.',
  'setup.placeExample': 'Ort',
  'setup.startMonth': 'Startmonat',
  'setup.duration': 'Dauer in Monaten',
  'setup.you': 'Du',
  'setup.yourName': 'Dein Anzeigename',
  'setup.color': 'Farbe',
  'setup.fxProvider': 'Kursquelle',
  'setup.fx.ECB': 'EZB',
  'setup.fx.BOC': 'Bank of Canada',
  'setup.submit': 'Haushalt anlegen',
  'setup.busy': 'Speichere …',
  'setup.error.required': 'Bitte {field} ausfüllen.',
  'setup.error.duration': 'Die Dauer muss zwischen 1 und 60 Monaten liegen.',
  'setup.error.write': 'Der Haushalt konnte nicht gespeichert werden.',

  'join.title': 'Haushalt beitreten',
  'join.intro':
    'Dein Konto ist noch nicht eingetragen. Wähle Anzeigename und Farbe, dann trittst du dem Haushalt bei.',
  'join.submit': 'Beitreten',

  'settings.title': 'Einstellungen',
  'settings.sharedWith': 'Gemeinsamer Haushalt mit {name}',
  'settings.alone': 'Noch keine zweite Person eingetragen',
  'settings.language': 'Sprache',
  'settings.appearance': 'Darstellung',
  'settings.appearance.auto': 'Auto',
  'settings.appearance.light': 'Hell',
  'settings.appearance.dark': 'Dunkel',
  'settings.fx': 'Wechselkurs EUR/CAD',
  'settings.fx.value': '1 € = {rate} · {provider}, {date}',
  'settings.fx.offline': 'Offline, letzter Kurs {rate} · {provider}, {date}',
  'settings.fx.loading': 'Wird geladen …',
  'settings.fx.unavailable': 'Nicht verfügbar',
  'settings.device': 'Gerät',
  'settings.persisted': 'Speicher dauerhaft',
  'settings.export': 'Daten exportieren (JSON)',
  'settings.export.action': 'Exportieren',
  'settings.export.error': 'Der Export ist fehlgeschlagen.',
  'settings.diagnostics': 'Diagnose',
  'settings.diagnostics.parked': 'Ungültige Ereignisse (geparkt)',
  'settings.diagnostics.waiting': 'Zeilen, die auf Referenzen warten',
  'settings.diagnostics.conflicts': 'Konflikte',
  'settings.login': 'Verbunden als',
  'settings.logout': 'Abmelden',
  'settings.logout.confirmTitle': 'Abmelden?',
  'settings.logout.confirmText':
    'Zugangsdaten und alle lokalen Daten werden von diesem Gerät gelöscht. Die Daten im Supabase-Projekt bleiben erhalten.',
  'settings.logout.confirm': 'Abmelden',

  'error.title': 'Etwas ist schiefgelaufen',
  'error.reload': 'Neu laden',
} as const;

export type MessageKey = keyof typeof de;

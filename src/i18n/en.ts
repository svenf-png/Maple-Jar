import type { MessageKey } from './de';

export const en: Record<MessageKey, string> = {
  'app.name': 'Maple Jar',
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.optional': 'optional',
  'common.yes': 'Yes',
  'common.no': 'No',
  'common.language': 'Language',

  'nav.overview': 'Overview',
  'nav.history': 'History',
  'nav.planning': 'Planning',
  'nav.settings': 'Settings',
  'nav.main': 'Main navigation',
  'nav.capture': 'Add expense',
  'toast.comingM2': 'Coming in M2',

  'page.overview.hint': 'Coming in milestone 2',
  'page.history.hint': 'Coming in milestone 2',
  'page.planning.hint': 'Coming in milestone 4',
  'page.empty.title': 'Nothing to see yet',

  'status.connected': 'Connected',
  'status.offline': 'Offline',
  'status.pending': '{count} waiting to sync',
  'status.reauth': 'Sign in again',
  'status.error': 'Sync problem',
  'status.member': 'Member {name}',

  'connect.subtitle': 'Your shared household budget.',
  'connect.projectUrl': 'Project URL',
  'connect.projectUrlPlaceholder': 'https://project.supabase.co',
  'connect.anonKey': 'Public key',
  'connect.username': 'Username',
  'connect.password': 'Password',
  'connect.submit': 'Connect',
  'connect.help': 'How to set up access',
  'connect.footer': 'Only for your household. The data lives in your own Supabase project.',
  'connect.langLabel': 'Language',
  'connect.error.url': 'Please enter the project URL as "https://project.supabase.co".',
  'connect.error.keyMissing': 'Please enter the public key.',
  'connect.error.username':
    'The username may only contain lowercase letters, digits, dot, underscore and hyphen.',
  'connect.error.passwordMissing': 'Please enter the password.',
  'connect.error.auth': 'Username or password is wrong, or the sign-in has expired.',
  'connect.error.forbidden':
    'Access denied. Was the SQL from the repo applied, and does the account belong to the household?',
  'connect.error.rateLimit': 'Too many requests. Please try again after {time}.',
  'connect.error.network': 'No connection',
  'connect.error.server': 'The server did not respond as expected. Please try again later.',
  'connect.error.notMember': 'This account does not belong to this household.',
  'connect.error.unknown': 'Something went wrong. Please try again.',
  'connect.busy': 'Connecting …',

  'renew.title': 'Sign in again',
  'renew.intro': 'The session has expired. Your local data and unsent entries are kept.',
  'renew.submit': 'Sign in',

  'help.title': 'How to set up access',
  'help.back': 'Back',
  'help.step1':
    'Create a free project at Supabase. Pick a region close to you and keep the database password in your password manager.',
  'help.step2':
    'Under Authentication, Sign In / Providers, turn sign-ups off ("Allow new users to sign up" off). Also check the minimum password length there (default according to the docs: 6; at least 8 characters are recommended).',
  'help.step3':
    'Under Authentication, Users, create two accounts ("Add user", "Auto Confirm User" on). As the email, enter each person\'s username plus the fixed suffix listed in supabase/README.md in the app repo, for example "username@suffix". No real email addresses are used.',
  'help.step4':
    'In the SQL Editor, run supabase/migrations/0001_init.sql from the app repo and work through the checklist in supabase/README.md.',
  'help.step5':
    'Open Project Settings, Data API or API Keys and copy the project URL and the public key (anon or publishable). Never enter the secret key (service_role) in the app.',
  'help.step6':
    'Open the app address, enter project URL, public key, username and password, then tap "Connect". The first person sets up the household.',
  'help.step7':
    'The second person connects with their own account and joins the household themselves.',
  'help.step8':
    'iPhone: open the app address in Safari, choose "Add to Home Screen" and connect in the installed app. Safari and the Home Screen app store data separately.',
  'help.step9':
    'Free projects are paused after a week of inactivity. Export your data as JSON regularly under Settings.',

  'setup.title': 'Set up household',
  'setup.intro': 'These details are stored in your Supabase project.',
  'setup.householdName': 'Household name',
  'setup.place': 'Place',
  'setup.placeHint': 'Shown e.g. in "Month 4 of 12 in {place}".',
  'setup.placeExample': 'Place',
  'setup.startMonth': 'Start month',
  'setup.duration': 'Duration in months',
  'setup.you': 'You',
  'setup.yourName': 'Your display name',
  'setup.color': 'Colour',
  'setup.fxProvider': 'Rate source',
  'setup.fx.ECB': 'ECB',
  'setup.fx.BOC': 'Bank of Canada',
  'setup.submit': 'Create household',
  'setup.busy': 'Saving …',
  'setup.error.required': 'Please fill in {field}.',
  'setup.error.duration': 'The duration must be between 1 and 60 months.',
  'setup.error.write': 'The household could not be saved.',

  'join.title': 'Join household',
  'join.intro':
    'Your account is not registered yet. Choose a display name and colour to join the household.',
  'join.submit': 'Join',

  'settings.title': 'Settings',
  'settings.sharedWith': 'Shared household with {name}',
  'settings.alone': 'No second person added yet',
  'settings.language': 'Language',
  'settings.appearance': 'Appearance',
  'settings.appearance.auto': 'Auto',
  'settings.appearance.light': 'Light',
  'settings.appearance.dark': 'Dark',
  'settings.fx': 'Exchange rate EUR/CAD',
  'settings.fx.value': '€1 = {rate} · {provider}, {date}',
  'settings.fx.offline': 'Offline, last rate {rate} · {provider}, {date}',
  'settings.fx.loading': 'Loading …',
  'settings.fx.unavailable': 'Unavailable',
  'settings.device': 'Device',
  'settings.persisted': 'Persistent storage',
  'settings.export': 'Export data (JSON)',
  'settings.export.action': 'Export',
  'settings.export.error': 'The export failed.',
  'settings.diagnostics': 'Diagnostics',
  'settings.diagnostics.parked': 'Invalid events (parked)',
  'settings.diagnostics.waiting': 'Rows waiting for references',
  'settings.diagnostics.conflicts': 'Conflicts',
  'settings.login': 'Connected as',
  'settings.logout': 'Sign out',
  'settings.logout.confirmTitle': 'Sign out?',
  'settings.logout.confirmText':
    'Credentials and all local data are deleted from this device. The data in the Supabase project is kept.',
  'settings.logout.confirm': 'Sign out',

  'error.title': 'Something went wrong',
  'error.reload': 'Reload',
};

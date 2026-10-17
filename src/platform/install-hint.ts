import { isIosTouch } from './haptics';

/** Umgebungsmerkmale für den Install-Hinweis. Als Parameter, damit die Regeln rein testbar bleiben. */
export interface InstallEnv {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  webdriver: boolean;
  standalone: boolean;
  displayStandalone: boolean;
}

export const INSTALL_HINT_KEY = 'maple-jar.installHintDismissed';

/** Andere iOS-Browser tragen eigene Kennungen; nur echtes Safari zeigt den Weg über das Teilen-Symbol. */
const NON_SAFARI_IOS = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|DuckDuckGo|FBAN|FBAV|Instagram/;

/** iOS Safari (iPhone, iPad). Andere Browser auf iOS haben keinen Home-Bildschirm-Weg dieser Art. */
export function isIosSafari(
  env: Pick<InstallEnv, 'userAgent' | 'platform' | 'maxTouchPoints'>,
): boolean {
  if (!isIosTouch(env)) return false;
  if (NON_SAFARI_IOS.test(env.userAgent)) return false;
  return /Safari\//.test(env.userAgent);
}

/** Einmalig und nur im Browser-Tab: nicht bei Automatisierung, nicht im Home-Bildschirm-Modus, nicht nach dem Schließen. */
export function shouldShowInstallHint(env: InstallEnv, dismissed: boolean): boolean {
  return (
    isIosSafari(env) && !env.webdriver && !env.standalone && !env.displayStandalone && !dismissed
  );
}

export function readInstallEnv(): InstallEnv {
  if (typeof navigator === 'undefined') {
    return {
      userAgent: '',
      platform: '',
      maxTouchPoints: 0,
      webdriver: false,
      standalone: false,
      displayStandalone: false,
    };
  }
  const nav = navigator as Navigator & { standalone?: boolean };
  const displayStandalone =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    webdriver: navigator.webdriver === true,
    standalone: nav.standalone === true,
    displayStandalone,
  };
}

/** Speicher kann fehlen (privates Fenster, gesperrte Website-Daten). Dann erscheint der Hinweis bei jedem Besuch. */
export function isInstallHintDismissed(): boolean {
  try {
    return localStorage.getItem(INSTALL_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissInstallHint(): void {
  try {
    localStorage.setItem(INSTALL_HINT_KEY, '1');
  } catch {
    // Ohne Speicher bleibt nur die Sitzung; der Hinweis kommt beim nächsten Besuch wieder.
  }
}

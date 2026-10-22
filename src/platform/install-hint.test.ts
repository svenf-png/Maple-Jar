import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dismissInstallHint,
  INSTALL_HINT_KEY,
  type InstallEnv,
  isInstallHintDismissed,
  isIosSafari,
  shouldShowInstallHint,
} from './install-hint';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = `${IPHONE_SAFARI.replace('Version/18.0', '')} CriOS/130.0.6723.90`;
const IPHONE_FIREFOX = `${IPHONE_SAFARI} FxiOS/130.0`;
const IPHONE_EDGE = `${IPHONE_SAFARI} EdgiOS/130.0.2849.56`;
const IPAD_DESKTOP_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const MAC_SAFARI = IPAD_DESKTOP_SAFARI;
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

const iosEnv = (over: Partial<InstallEnv> = {}): InstallEnv => ({
  userAgent: IPHONE_SAFARI,
  platform: 'iPhone',
  maxTouchPoints: 5,
  webdriver: false,
  standalone: false,
  displayStandalone: false,
  ...over,
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('isIosSafari', () => {
  it('erkennt iPhone-Safari', () => {
    expect(isIosSafari(iosEnv())).toBe(true);
  });

  it('erkennt iPad im Desktop-Modus über Touchpunkte', () => {
    expect(
      isIosSafari(
        iosEnv({ userAgent: IPAD_DESKTOP_SAFARI, platform: 'MacIntel', maxTouchPoints: 5 }),
      ),
    ).toBe(true);
  });

  it('lehnt Mac-Safari ohne Touch ab', () => {
    expect(
      isIosSafari(iosEnv({ userAgent: MAC_SAFARI, platform: 'MacIntel', maxTouchPoints: 0 })),
    ).toBe(false);
  });

  it('lehnt andere iOS-Browser ab (Chrome, Firefox, Edge)', () => {
    expect(isIosSafari(iosEnv({ userAgent: IPHONE_CHROME }))).toBe(false);
    expect(isIosSafari(iosEnv({ userAgent: IPHONE_FIREFOX }))).toBe(false);
    expect(isIosSafari(iosEnv({ userAgent: IPHONE_EDGE }))).toBe(false);
  });

  it('lehnt Android ab', () => {
    expect(isIosSafari(iosEnv({ userAgent: ANDROID_CHROME, platform: 'Linux armv81' }))).toBe(
      false,
    );
  });
});

describe('shouldShowInstallHint', () => {
  it('zeigt den Hinweis in iOS-Safari im Browser-Tab', () => {
    expect(shouldShowInstallHint(iosEnv(), false)).toBe(true);
  });

  it('zeigt ihn nicht im Home-Bildschirm-Modus (navigator.standalone oder display-mode)', () => {
    expect(shouldShowInstallHint(iosEnv({ standalone: true }), false)).toBe(false);
    expect(shouldShowInstallHint(iosEnv({ displayStandalone: true }), false)).toBe(false);
  });

  it('zeigt ihn nicht unter Automatisierung', () => {
    expect(shouldShowInstallHint(iosEnv({ webdriver: true }), false)).toBe(false);
  });

  it('zeigt ihn nach dem Schließen nicht mehr', () => {
    expect(shouldShowInstallHint(iosEnv(), true)).toBe(false);
  });

  it('zeigt ihn in anderen Browsern nicht', () => {
    expect(shouldShowInstallHint(iosEnv({ userAgent: IPHONE_CHROME }), false)).toBe(false);
    expect(shouldShowInstallHint(iosEnv({ userAgent: ANDROID_CHROME }), false)).toBe(false);
  });
});

describe('Merker für den Install-Hinweis', () => {
  it('ist anfangs nicht gesetzt, nach dem Schließen gesetzt', () => {
    expect(isInstallHintDismissed()).toBe(false);
    dismissInstallHint();
    expect(isInstallHintDismissed()).toBe(true);
    expect(localStorage.getItem(INSTALL_HINT_KEY)).toBe('1');
  });

  it('liefert false, wenn der Speicher beim Lesen wirft', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(isInstallHintDismissed()).toBe(false);
  });

  it('wirft nicht, wenn der Speicher beim Schreiben wirft', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => dismissInstallHint()).not.toThrow();
  });
});
